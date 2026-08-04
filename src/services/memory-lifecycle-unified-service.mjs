// WP-MEM-UNIFY candidate. One unwired, fail-closed path composes the
// authority-aware Memory Gateway, one atomic lifecycle batch resolver, the
// Memory Candidate Provider, typed CandidateSource normalization, and Context
// Federation. Runtime construction, adapter installation, and activation are
// intentionally absent.

import { canonicalFingerprint } from "../contracts/canonical-fingerprint.mjs";
import { validateContract } from "../contracts/contract-validator.mjs";
import { normalizeCandidateSources } from "./candidate-source-port.mjs";
import { MEMORY_PROVIDER_EXCLUSION_REASONS, MEMORY_PROVIDER_STAGE } from "./memory-candidate-provider.mjs";

const REQUEST_KEYS = Object.freeze(["project_id", "layer", "limit", "cursor", "token_budget"]);
const REQUIRED_KEYS = Object.freeze(["project_id", "layer"]);
const ISSUE_KEYS = Object.freeze(["document", "classificationCeiling", "minimumSufficient", "actorId", "authorityRef", "baseline", "ttlMs", "idempotencyKey"]);
const ENVELOPE_KEYS = Object.freeze(["data_untrusted", "record"]);
const GATEWAY_KEYS = Object.freeze([
  "decision", "code", "retrieved_at", "records", "next_cursor", "actor_id",
  "identity_decision_id", "scope_decision_id", "authority_decision_id"
]);
const PROVIDER_KEYS = Object.freeze(["decision", "code", "data_untrusted", "project_id", "retrieved_at", "sources", "exclusions", "accounting"]);
const ACCOUNTING_KEYS = Object.freeze(["requested", "included", "excluded", "token_budget", "tokens_used"]);
const BATCH_KEYS = Object.freeze(["ok", "code", "project_id", "layer", "evaluated_at", "batch_fingerprint", "decisions"]);
const LEDGER_RECEIPT_KEYS = Object.freeze(["ledgerId", "sequence", "previousHash", "entry", "entryHash", "recordHash", "replayed"]);
const DECISION_KEYS = Object.freeze([
  "request_index", "ok", "code", "memory_record_id", "memory_record_version", "content_hash",
  "target_record_fingerprint", "state_fingerprint", "lifecycle_head_hash", "authority_decision_id"
]);
const ISSUE_RESULT_KEYS = Object.freeze(["receiptId", "projectId", "version", "state", "boundWpVersion", "expiresAt", "exclusions", "replayed"]);
const MAX_BATCH = 1_000;
const MAX_BATCH_BYTES = 4 * 1024 * 1024;
const MAX_CURSOR = 2_048;
const DEFAULT_TIMEOUT_MS = 500;
const MAX_TIMEOUT_MS = 30_000;
const DEFAULT_FRESHNESS_MS = 1_000;
const MAX_FRESHNESS_MS = 60_000;
const BINDING_CORE_KEYS = Object.freeze([
  "context_receipt_fingerprint", "context_intent_fingerprint", "context_issue_fingerprint", "context_idempotency_key_fingerprint",
  "lifecycle_batch_fingerprint", "lifecycle_state_digest", "evaluated_at", "binding_attempt", "binding_fingerprint"
]);
const LEDGER_RECORD_KEYS = Object.freeze(["ledgerId", "sequence", "previousHash", "entry", "entryHash", "recordHash"]);
const BINDING_ENTRY_KEYS = Object.freeze([
  "entryId", "projectId", "workPackageId", "sessionId", "actorId", "type", "payload", "timestamp", "idempotencyKey"
]);
const ZERO_HASH = "0".repeat(64);

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isBlank = (value) => typeof value !== "string" || value.trim() === "";
const isHash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

function deepFreeze(value, seen = new WeakSet()) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    if (seen.has(value)) return value;
    seen.add(value);
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child, seen);
  }
  return value;
}

function isSafeDataGraph(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object") return true;
  if (seen.has(value)) return false;
  seen.add(value);
  const prototype = Object.getPrototypeOf(value);
  if (Array.isArray(value)) {
    if (prototype !== Array.prototype) return false;
  } else if (prototype !== Object.prototype && prototype !== null) return false;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor) || !isSafeDataGraph(descriptor.value, seen)) return false;
  }
  return true;
}

function exactSnapshot(value, allowed, required = allowed) {
  try {
    if (!isPlainObject(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string" || !allowed.includes(key)) || required.some((key) => !keys.includes(key))) return null;
    if (!isSafeDataGraph(value)) return null;
    return structuredClone(value);
  } catch {
    return null;
  }
}

function trustedInstant(now) {
  try {
    const ms = Date.prototype.getTime.call(now());
    if (!Number.isFinite(ms)) return null;
    return { ms, iso: new Date(ms).toISOString() };
  } catch {
    return null;
  }
}

const isCanonicalInstant = (value) => typeof value === "string"
  && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;
const withinWindow = (earlierMs, laterMs, freshnessMs) => Number.isFinite(earlierMs) && Number.isFinite(laterMs)
  && laterMs >= earlierMs && laterMs - earlierMs <= freshnessMs;

function lifecycleStateDigest(batch) {
  return canonicalFingerprint({
    batch_fingerprint: batch.batch_fingerprint,
    evaluated_at: batch.evaluated_at,
    decisions: [...batch.decisions].sort((left, right) => left.request_index - right.request_index).map((decision) => ({
      request_index: decision.request_index,
      memory_record_id: decision.memory_record_id,
      memory_record_version: decision.memory_record_version,
      content_hash: decision.content_hash,
      target_record_fingerprint: decision.target_record_fingerprint,
      state_fingerprint: decision.state_fingerprint,
      lifecycle_head_hash: decision.lifecycle_head_hash,
      authority_decision_id: decision.authority_decision_id
    }))
  });
}

function snapshotEffectiveBatch(rawBatch, request, bindings, notBeforeMs, observedMs, freshnessMs) {
  const batch = exactSnapshot(rawBatch, BATCH_KEYS);
  if (batch === null || batch.ok !== true || batch.code !== "MEMORY_BATCH_RESOLVED"
    || batch.project_id !== request.project_id || batch.layer !== request.layer
    || !isCanonicalInstant(batch.evaluated_at)
    || !withinWindow(notBeforeMs, Date.parse(batch.evaluated_at), freshnessMs)
    || !withinWindow(Date.parse(batch.evaluated_at), observedMs, freshnessMs)
    || batch.batch_fingerprint !== canonicalFingerprint(request) || !Array.isArray(batch.decisions)
    || batch.decisions.length !== bindings.length) return null;
  const decisions = [];
  const seen = new Set();
  for (const rawDecision of batch.decisions) {
    const decision = exactSnapshot(rawDecision, DECISION_KEYS);
    if (decision === null || decision.ok !== true || decision.code !== "MEMORY_EFFECTIVE"
      || !Number.isSafeInteger(decision.request_index) || decision.request_index < 0 || decision.request_index >= bindings.length
      || seen.has(decision.request_index)) return null;
    seen.add(decision.request_index);
    const binding = bindings[decision.request_index];
    if (decision.memory_record_id !== binding.memory_record_id || decision.memory_record_version !== binding.memory_record_version
      || decision.content_hash !== binding.content_hash || decision.target_record_fingerprint !== binding.target_record_fingerprint
      || !isHash(decision.state_fingerprint) || !isHash(decision.lifecycle_head_hash) || isBlank(decision.authority_decision_id)) return null;
    decisions.push(decision);
  }
  return { ...batch, decisions };
}

async function boundedCall(operation, timeoutMs) {
  let timer;
  const result = await Promise.race([
    Promise.resolve().then(operation).then((value) => ({ ok: true, value }), () => ({ ok: false })),
    new Promise((resolve) => { timer = setTimeout(() => resolve({ ok: false }), timeoutMs); })
  ]);
  clearTimeout(timer);
  return result;
}

function syncCall(operation) {
  try {
    const value = operation();
    return value instanceof Promise ? { ok: false } : { ok: true, value };
  } catch {
    return { ok: false };
  }
}

const deny = (code, message, stage) => deepFreeze({ decision: "DENY", code, message, stage });

function verifiedLedgerChain(value) {
  if (!Array.isArray(value)) return null;
  try {
    const records = [];
    let priorHash = ZERO_HASH;
    let ledgerId;
    for (let index = 0; index < value.length; index += 1) {
      const record = exactSnapshot(value[index], LEDGER_RECORD_KEYS);
      if (record === null || isBlank(record.ledgerId) || !Number.isSafeInteger(record.sequence)
        || record.sequence !== index + 1 || !isHash(record.previousHash) || !isPlainObject(record.entry)
        || !isHash(record.entryHash) || !isHash(record.recordHash)
        || (ledgerId !== undefined && record.ledgerId !== ledgerId) || record.previousHash !== priorHash
        || canonicalFingerprint(record.entry) !== record.entryHash
        || canonicalFingerprint({ ledgerId: record.ledgerId, sequence: record.sequence,
          previousHash: record.previousHash, entryHash: record.entryHash }) !== record.recordHash) return null;
      ledgerId ??= record.ledgerId;
      priorHash = record.recordHash;
      records.push(record);
    }
    return records;
  } catch {
    return null;
  }
}

function bindingCore(value) {
  const binding = exactSnapshot(value, BINDING_CORE_KEYS);
  if (binding === null || !isHash(binding.context_receipt_fingerprint) || !isHash(binding.context_intent_fingerprint)
    || !isHash(binding.lifecycle_batch_fingerprint) || !isHash(binding.context_issue_fingerprint)
    || !isHash(binding.context_idempotency_key_fingerprint) || !isHash(binding.lifecycle_state_digest)
    || !isHash(binding.binding_fingerprint) || !isCanonicalInstant(binding.evaluated_at)
    || !Number.isSafeInteger(binding.binding_attempt) || binding.binding_attempt < 1) return null;
  const { binding_fingerprint: ignoredFingerprint, ...tuple } = binding; void ignoredFingerprint;
  return canonicalFingerprint(tuple) === binding.binding_fingerprint ? binding : null;
}

function bindingLedgerSemantics(records) {
  const groups = new Map();
  for (const record of records) {
    if (typeof record.entry?.type !== "string" || !record.entry.type.startsWith("MEMORY_CONTEXT_LIFECYCLE_BINDING_")) continue;
    const entry = exactSnapshot(record.entry, BINDING_ENTRY_KEYS);
    const payload = entry?.payload;
    const core = isPlainObject(payload?.binding) ? bindingCore(payload.binding) : null;
    const status = entry?.type?.slice("MEMORY_CONTEXT_LIFECYCLE_BINDING_".length);
    if (entry === null || core === null || payload.status !== status || !["PREPARED", "COMMITTED", "ABORTED"].includes(status)) return null;
    const events = groups.get(core.binding_fingerprint) ?? [];
    events.push({ record, entry, payload, core });
    groups.set(core.binding_fingerprint, events);
  }
  const result = new Map();
  for (const [fingerprint, events] of groups) {
    const preparedEvents = events.filter(({ payload }) => payload.status === "PREPARED");
    const committedEvents = events.filter(({ payload }) => payload.status === "COMMITTED");
    const abortedEvents = events.filter(({ payload }) => payload.status === "ABORTED");
    if (events.length !== preparedEvents.length + committedEvents.length + abortedEvents.length
      || preparedEvents.length !== 1 || committedEvents.length > 1 || abortedEvents.length > 1
      || (committedEvents.length === 1 && abortedEvents.length === 1)) return null;
    const prepared = preparedEvents[0];
    const committed = committedEvents[0];
    const aborted = abortedEvents[0];
    const preparedPayload = exactSnapshot(prepared.payload, ["binding", "status", "context_issue_request"]);
    const committedPayload = committed === undefined ? null
      : exactSnapshot(committed.payload, ["binding", "status", "context_result_fingerprint"]);
    const abortedPayload = aborted === undefined ? null : exactSnapshot(aborted.payload, ["binding", "status", "reason"]);
    const contextIssueRequest = preparedPayload === null ? null : exactSnapshot(preparedPayload.context_issue_request,
      [...ISSUE_KEYS, "candidateSources"], ["document", "actorId", "authorityRef", "baseline", "idempotencyKey", "candidateSources"]);
    const issueInput = contextIssueRequest === null ? null
      : Object.fromEntries(ISSUE_KEYS.filter((key) => Object.hasOwn(contextIssueRequest, key)).map((key) => [key, contextIssueRequest[key]]));
    if (contextIssueRequest === null || !isPlainObject(contextIssueRequest.document)
      || prepared.core.context_receipt_fingerprint !== contextIssueRequest.document.content_hash
      || prepared.core.context_intent_fingerprint !== canonicalFingerprint({ op: "UNIFY_CONTEXT_INTENT", request: issueInput })
      || prepared.core.context_issue_fingerprint !== canonicalFingerprint({ op: "ISSUE",
        request: { ...contextIssueRequest, idempotencyKey: undefined } })
      || prepared.core.context_idempotency_key_fingerprint !== canonicalFingerprint(contextIssueRequest.idempotencyKey)
      || committedPayload !== null && !isHash(committedPayload.context_result_fingerprint)
      || abortedPayload !== null && isBlank(abortedPayload.reason)
      || committed !== undefined && committed.record.sequence <= prepared.record.sequence
      || aborted !== undefined && aborted.record.sequence <= prepared.record.sequence) return null;
    for (const event of events) {
      if (canonicalFingerprint(event.core) !== canonicalFingerprint(prepared.core)
        || event.entry.projectId !== contextIssueRequest.document.project_id
        || event.entry.workPackageId !== contextIssueRequest.document.work_package_id
        || event.entry.sessionId !== contextIssueRequest.document.session_id
        || event.entry.actorId !== contextIssueRequest.actorId
        || event.entry.timestamp !== prepared.core.evaluated_at
        || event.entry.entryId !== canonicalFingerprint({ binding_fingerprint: fingerprint, status: event.payload.status })
        || event.entry.idempotencyKey !== JSON.stringify([event.entry.projectId, contextIssueRequest.document.receipt_id,
          fingerprint, event.payload.status])) return null;
    }
    result.set(fingerprint, { events, prepared, committed, aborted, contextIssueRequest });
  }
  const reservations = new Map();
  for (const record of records) {
    if (typeof record.entry?.type !== "string" || !record.entry.type.startsWith("MEMORY_CONTEXT_LIFECYCLE_BINDING_")) continue;
    const core = bindingCore(record.entry.payload.binding);
    const group = core === null ? null : result.get(core.binding_fingerprint);
    if (group === null || group === undefined) return null;
    const key = JSON.stringify([group.prepared.entry.projectId, group.contextIssueRequest.document.receipt_id,
      group.prepared.core.context_idempotency_key_fingerprint]);
    const status = record.entry.payload.status;
    const reservation = reservations.get(key);
    if (status === "PREPARED") {
      if (reservation !== undefined) return null;
      reservations.set(key, { bindingFingerprint: core.binding_fingerprint, committed: false });
    } else if (status === "COMMITTED") {
      if (reservation?.bindingFingerprint !== core.binding_fingerprint || reservation.committed) return null;
      reservations.set(key, { bindingFingerprint: core.binding_fingerprint, committed: true });
    } else if (status === "ABORTED") {
      if (reservation?.bindingFingerprint !== core.binding_fingerprint || reservation.committed) return null;
      reservations.delete(key);
    }
  }
  return result;
}

function verifyMemoryContextLifecycleBindingUnsafe(value, ledgerEvidence, trustedAnchor) {
  const binding = exactSnapshot(value, [...BINDING_CORE_KEYS, "binding_status", "ledger_sequence", "ledger_record_hash", "replayed"]);
  const core = binding === null ? null : bindingCore(Object.fromEntries(BINDING_CORE_KEYS.map((key) => [key, binding[key]])));
  const records = verifiedLedgerChain(ledgerEvidence);
  const anchor = exactSnapshot(trustedAnchor, ["ledgerId", "count", "headHash"]);
  if (binding === null || core === null || records === null || anchor === null || isBlank(anchor.ledgerId)
    || !Number.isSafeInteger(anchor.count) || anchor.count !== records.length || !isHash(anchor.headHash)
    || anchor.ledgerId !== records[0]?.ledgerId || anchor.headHash !== records.at(-1)?.recordHash
    || binding.binding_status !== "COMMITTED" || !Number.isSafeInteger(binding.ledger_sequence) || binding.ledger_sequence < 1
    || !isHash(binding.ledger_record_hash) || binding.replayed !== false) return false;
  const record = records[binding.ledger_sequence - 1];
  if (record === undefined || record.recordHash !== binding.ledger_record_hash) return false;
  const semantics = bindingLedgerSemantics(records);
  const group = semantics?.get(core.binding_fingerprint);
  return group !== undefined && group.events.length === 2 && group.aborted === undefined
    && group.committed?.record.sequence === record.sequence;
}

export function verifyMemoryContextLifecycleBinding(value, ledgerEvidence, trustedAnchor) {
  try {
    return verifyMemoryContextLifecycleBindingUnsafe(value, ledgerEvidence, trustedAnchor);
  } catch {
    return false;
  }
}

export class MemoryLifecycleUnifiedConfigurationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MemoryLifecycleUnifiedConfigurationError";
    this.code = code;
  }
}

export function createMemoryLifecycleUnifiedService({
  memoryAuthorityGateway, lifecycleResolver, memoryCandidateProvider, contextFederation,
  lifecycleBindingLedger, now, timeoutMs = DEFAULT_TIMEOUT_MS, freshnessMs = DEFAULT_FRESHNESS_MS
} = {}) {
  let retrieve;
  let resolveBatch;
  let withIssuanceFence;
  let project;
  let issue;
  let replayReceipt;
  let appendBinding;
  let readBindings;
  let verifyTrustedBindings;
  try {
    retrieve = memoryAuthorityGateway?.retrieve;
    resolveBatch = lifecycleResolver?.resolveBatch;
    withIssuanceFence = lifecycleResolver?.withIssuanceFence;
    project = memoryCandidateProvider?.toCandidateSources;
    issue = contextFederation?.issueReceipt;
    replayReceipt = contextFederation?.replayReceipt;
    appendBinding = lifecycleBindingLedger?.append;
    readBindings = lifecycleBindingLedger?.read;
    verifyTrustedBindings = lifecycleBindingLedger?.verifyTrusted;
  } catch {
    throw new MemoryLifecycleUnifiedConfigurationError("INVALID_UNIFY_DEPENDENCY", "unify dependencies could not be safely inspected");
  }
  if (typeof retrieve !== "function") throw new MemoryLifecycleUnifiedConfigurationError("INVALID_MEMORY_AUTHORITY_GATEWAY", "authority-aware memoryAuthorityGateway.retrieve is required");
  if (typeof resolveBatch !== "function") throw new MemoryLifecycleUnifiedConfigurationError("INVALID_LIFECYCLE_RESOLVER", "shared lifecycleResolver.resolveBatch is required");
  if (typeof withIssuanceFence !== "function") throw new MemoryLifecycleUnifiedConfigurationError("INVALID_LIFECYCLE_FENCE", "shared lifecycleResolver.withIssuanceFence is required");
  if (typeof project !== "function") throw new MemoryLifecycleUnifiedConfigurationError("INVALID_MEMORY_PROVIDER", "memoryCandidateProvider.toCandidateSources is required");
  if (typeof issue !== "function") throw new MemoryLifecycleUnifiedConfigurationError("INVALID_CONTEXT_FEDERATION", "contextFederation.issueReceipt is required");
  if (typeof replayReceipt !== "function") throw new MemoryLifecycleUnifiedConfigurationError("INVALID_CONTEXT_RECOVERY", "contextFederation.replayReceipt is required for non-mutating recovery");
  if (typeof appendBinding !== "function" || typeof readBindings !== "function" || typeof verifyTrustedBindings !== "function") {
    throw new MemoryLifecycleUnifiedConfigurationError("INVALID_BINDING_LEDGER", "an authenticated transactional binding ledger with append(), read(), and verifyTrusted() is required");
  }
  if (typeof now !== "function") throw new MemoryLifecycleUnifiedConfigurationError("INVALID_CLOCK", "a trusted shared now() clock is required");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new MemoryLifecycleUnifiedConfigurationError("INVALID_TIMEOUT", "timeoutMs must be a positive bounded integer");
  }
  if (!Number.isSafeInteger(freshnessMs) || freshnessMs < 1 || freshnessMs > MAX_FRESHNESS_MS) {
    throw new MemoryLifecycleUnifiedConfigurationError("INVALID_FRESHNESS", "freshnessMs must be a positive bounded integer");
  }
  const retrieveMemory = Function.prototype.bind.call(retrieve, memoryAuthorityGateway);
  const resolveMemoryBatch = Function.prototype.bind.call(resolveBatch, lifecycleResolver);
  const runIssuanceFence = Function.prototype.bind.call(withIssuanceFence, lifecycleResolver);
  const projectMemory = Function.prototype.bind.call(project, memoryCandidateProvider);
  const issueContext = Function.prototype.bind.call(issue, contextFederation);
  const replayContextReceipt = Function.prototype.bind.call(replayReceipt, contextFederation);
  const appendLifecycleBinding = Function.prototype.bind.call(appendBinding, lifecycleBindingLedger);
  const readLifecycleBindings = Function.prototype.bind.call(readBindings, lifecycleBindingLedger);
  const verifyLifecycleBindings = Function.prototype.bind.call(verifyTrustedBindings, lifecycleBindingLedger);

  const normalizedContextResultFingerprint = (issued) => {
    const { replayed: ignoredReplay, ...stableResult } = issued; void ignoredReplay;
    return canonicalFingerprint(stableResult);
  };

  const snapshotIssued = (rawIssued, projectId, receiptId) => {
    const issued = exactSnapshot(rawIssued, ISSUE_RESULT_KEYS);
    return issued !== null && issued.state === "ISSUED" && issued.projectId === projectId
      && issued.receiptId === receiptId && Number.isSafeInteger(issued.version) && issued.version >= 1
      && ((Number.isSafeInteger(issued.boundWpVersion) && issued.boundWpVersion > 0) || !isBlank(issued.boundWpVersion))
      && isCanonicalInstant(issued.expiresAt) && Array.isArray(issued.exclusions) && typeof issued.replayed === "boolean"
      ? issued : null;
  };

  const readVerifiedLedger = () => {
    const headCall = syncCall(() => verifyLifecycleBindings());
    const readCall = headCall.ok && headCall.value?.valid === true ? syncCall(() => readLifecycleBindings()) : { ok: false };
    const records = readCall.ok ? verifiedLedgerChain(readCall.value) : null;
    if (records === null || !Number.isSafeInteger(headCall.value?.count) || headCall.value.count !== records.length
      || headCall.value.headHash !== (records.at(-1)?.recordHash ?? ZERO_HASH)
      || (records.length > 0 && headCall.value.ledgerId !== records[0].ledgerId)) return null;
    return records;
  };

  const persistBindingEvent = ({ binding, contextIssueRequest, issueInput, retrieval, status, extra = {} }) => {
    const records = readVerifiedLedger();
    if (records === null) return null;
    const entry = {
      entryId: canonicalFingerprint({ binding_fingerprint: binding.binding_fingerprint, status }), projectId: retrieval.project_id,
      workPackageId: issueInput.document.work_package_id, sessionId: issueInput.document.session_id,
      actorId: issueInput.actorId, type: `MEMORY_CONTEXT_LIFECYCLE_BINDING_${status}`,
      payload: { binding, status, ...(status === "PREPARED" ? { context_issue_request: contextIssueRequest } : {}), ...extra },
      timestamp: binding.evaluated_at,
      idempotencyKey: JSON.stringify([retrieval.project_id, issueInput.document.receipt_id, binding.binding_fingerprint, status])
    };
    const preWriteCheck = status !== "PREPARED" ? undefined : (lockedRecords) => {
      const chain = verifiedLedgerChain(lockedRecords);
      const semantics = chain === null ? null : bindingLedgerSemantics(chain);
      if (semantics === null) return { decision: "DENY", code: "DENY_BINDING_SEMANTICS" };
      for (const group of semantics.values()) {
        const sameIdentity = group.prepared.entry.projectId === retrieval.project_id
          && group.contextIssueRequest.document.receipt_id === issueInput.document.receipt_id
          && group.prepared.core.context_idempotency_key_fingerprint === canonicalFingerprint(issueInput.idempotencyKey);
        const active = group.committed !== undefined || group.aborted === undefined;
        if (sameIdentity && active && group.prepared.core.binding_fingerprint !== binding.binding_fingerprint) {
          return { decision: "DENY", code: "DENY_BINDING_IDENTITY_RESERVED" };
        }
      }
      return null;
    };
    const appendedCall = syncCall(() => appendLifecycleBinding(entry, { expectedSequence: records.length, preWriteCheck }));
    const appended = appendedCall.ok ? exactSnapshot(appendedCall.value, LEDGER_RECEIPT_KEYS) : null;
    const after = appended === null ? null : readVerifiedLedger();
    const readback = after?.find((record) => record.sequence === appended.sequence);
    const { replayed: ignoredReplay, ...persistedReceipt } = appended ?? {}; void ignoredReplay;
    if (appended === null || (status === "PREPARED" && appended.replayed === true)
      || canonicalFingerprint(appended.entry) !== canonicalFingerprint(entry)
      || canonicalFingerprint(readback) !== canonicalFingerprint(persistedReceipt)) return null;
    return appended;
  };

  const recoveryRequired = (message) => deepFreeze({ decision: "DENY", code: "DENY_UNIFY_BINDING_RECOVERY",
    message, stage: "binding-recovery", recovery_required: true });

  function makeSourceStateBinding(binding, committed) {
    return deepFreeze({ ...binding, binding_status: "COMMITTED", ledger_sequence: committed.sequence,
      ledger_record_hash: committed.recordHash, replayed: false });
  }

  function reconcileExistingBinding(retrieval, issueInput) {
    const records = readVerifiedLedger();
    if (records === null) return recoveryRequired("binding ledger chain evidence is invalid or unavailable");
    const intentFingerprint = canonicalFingerprint({ op: "UNIFY_CONTEXT_INTENT", request: issueInput });
    const idempotencyFingerprint = canonicalFingerprint(issueInput.idempotencyKey);
    const groups = bindingLedgerSemantics(records);
    if (groups === null) return recoveryRequired("binding ledger event semantics are invalid");
    const active = [];
    for (const group of groups.values()) {
      const { prepared, committed, aborted, contextIssueRequest: storedContextRequest } = group;
      if (prepared.core.context_idempotency_key_fingerprint !== idempotencyFingerprint
        || storedContextRequest.document.receipt_id !== issueInput.document.receipt_id
        || prepared.record.entry.projectId !== retrieval.project_id) continue;
      if (committed !== undefined || aborted === undefined) active.push(group);
    }
    if (active.length === 0) return null;
    if (active.length !== 1) return recoveryRequired("multiple lifecycle bindings claim the exact Context issuance identity");
    const { prepared, committed, contextIssueRequest } = active[0];
    if (prepared.core.context_intent_fingerprint !== intentFingerprint) {
      return recoveryRequired("the reserved Context receipt/idempotency identity conflicts with this issuance intent");
    }
    const binding = prepared.core;
    if (contextIssueRequest === null || canonicalFingerprint({ op: "UNIFY_CONTEXT_INTENT",
      request: Object.fromEntries(ISSUE_KEYS.filter((key) => Object.hasOwn(contextIssueRequest, key)).map((key) => [key, contextIssueRequest[key]])) }) !== intentFingerprint
      || canonicalFingerprint({ op: "ISSUE", request: { ...contextIssueRequest, idempotencyKey: undefined } }) !== binding.context_issue_fingerprint) {
      return recoveryRequired("prepared binding does not contain its exact original Context request");
    }
    const rawIssued = syncCall(() => replayContextReceipt(deepFreeze(structuredClone(contextIssueRequest))));
    const issued = rawIssued.ok ? snapshotIssued(rawIssued.value, retrieval.project_id, issueInput.document.receipt_id) : null;
    if (issued === null) {
      if (committed !== undefined) return recoveryRequired("committed binding could not replay its original Context receipt");
      const aborted = persistBindingEvent({ binding, contextIssueRequest, issueInput, retrieval,
        status: "ABORTED", extra: { reason: "RECOVERY_REPLAY_MISS" } });
      return aborted === null ? recoveryRequired("failed recovery remains an unresolved PREPARED binding")
        : deny("DENY_UNIFY_CONTEXT_NOT_ISSUED", "replay-only Context recovery found no prior issuance; fresh lifecycle evaluation is required", "binding-recovery");
    }
    const resultFingerprint = normalizedContextResultFingerprint(issued);
    if (issued.replayed !== true) return recoveryRequired("recovery operation was not a replay-only Context result");
    if (committed !== undefined) {
      const committedPayload = exactSnapshot(committed.payload, ["binding", "status", "context_result_fingerprint"]);
      if (committedPayload === null || committedPayload.status !== "COMMITTED"
        || committedPayload.context_result_fingerprint !== resultFingerprint) {
        return recoveryRequired("committed binding does not match the replayed Context receipt");
      }
      return deepFreeze({ ...issued, sourceStateBinding: makeSourceStateBinding(binding, committed.record) });
    }
    const committedReceipt = persistBindingEvent({ binding, contextIssueRequest, issueInput, retrieval,
      status: "COMMITTED", extra: { context_result_fingerprint: resultFingerprint } });
    if (committedReceipt === null) return recoveryRequired("replayed Context receipt remains quarantined until its binding is independently COMMITTED");
    return deepFreeze({ ...issued, sourceStateBinding: makeSourceStateBinding(binding, committedReceipt) });
  }

  async function retrieveCandidateSources(request) {
    const input = exactSnapshot(request, REQUEST_KEYS, REQUIRED_KEYS);
    if (input === null || isBlank(input.project_id) || isBlank(input.layer)
      || (input.limit !== undefined && (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > MAX_BATCH))
      || (input.cursor !== undefined && (typeof input.cursor !== "string" || input.cursor.length < 1 || input.cursor.length > MAX_CURSOR || !/^[A-Za-z0-9_-]+$/.test(input.cursor)))
      || (input.token_budget !== undefined && (!Number.isSafeInteger(input.token_budget) || input.token_budget < 1))) {
      return deny("DENY_UNIFY_REQUEST", "unified memory request is malformed", "request");
    }
    const operationStart = trustedInstant(now);
    if (operationStart === null) return deny("DENY_UNIFY_CLOCK", "trusted operation instant is unavailable", "clock");
    const rawGateway = syncCall(() => retrieveMemory({
      project_id: input.project_id, layer: input.layer,
      ...(input.limit === undefined ? {} : { limit: input.limit }), ...(input.cursor === undefined ? {} : { cursor: input.cursor })
    }));
    const gateway = rawGateway.ok ? exactSnapshot(rawGateway.value, GATEWAY_KEYS) : null;
    const gatewayObservedAt = trustedInstant(now);
    const retrievedMs = Date.parse(gateway?.retrieved_at);
    if (gateway === null || gateway.decision !== "ALLOW" || gateway.code !== "RETRIEVED"
      || gatewayObservedAt === null || !isCanonicalInstant(gateway.retrieved_at)
      || !withinWindow(operationStart.ms, retrievedMs, freshnessMs) || !withinWindow(retrievedMs, gatewayObservedAt.ms, freshnessMs)
      || !Array.isArray(gateway.records) || gateway.records.length > MAX_BATCH
      || isBlank(gateway.actor_id) || isBlank(gateway.identity_decision_id) || isBlank(gateway.scope_decision_id) || isBlank(gateway.authority_decision_id)
      || (gateway.next_cursor !== null && (typeof gateway.next_cursor !== "string" || gateway.next_cursor.length < 1
        || gateway.next_cursor.length > MAX_CURSOR || !/^[A-Za-z0-9_-]+$/.test(gateway.next_cursor)))
      || (input.cursor !== undefined && gateway.next_cursor === input.cursor)) {
      return deny("DENY_UNIFY_GATEWAY", "authority-aware Memory Gateway did not return an admissible page", "gateway");
    }

    const records = [];
    const identities = new Set();
    for (const rawEnvelope of gateway.records) {
      const envelope = exactSnapshot(rawEnvelope, ENVELOPE_KEYS);
      if (envelope === null || envelope.data_untrusted !== true || !isPlainObject(envelope.record)) {
        return deny("DENY_UNIFY_GATEWAY", "Memory Gateway returned a malformed record envelope", "gateway");
      }
      try { validateContract("memoryRecord", envelope.record); } catch { return deny("DENY_UNIFY_GATEWAY", "Memory Gateway record failed its contract", "gateway"); }
      const record = envelope.record;
      const { admitted_at: ignoredAt, content_hash: ignoredHash, ...hashBody } = record;
      void ignoredAt; void ignoredHash;
      const identity = `${record.memory_record_id}\u0000${record.version}`;
      if (record.project_id !== input.project_id || record.layer !== input.layer || canonicalFingerprint(hashBody) !== record.content_hash || identities.has(identity)) {
        return deny("DENY_UNIFY_GATEWAY_BINDING", "Memory Gateway record scope, content, or identity is inconsistent", "gateway");
      }
      identities.add(identity);
      records.push(record);
    }
    try {
      if (Buffer.byteLength(JSON.stringify(records), "utf8") > MAX_BATCH_BYTES) return deny("DENY_UNIFY_RESOURCE_LIMIT", "memory page exceeds the batch byte limit", "gateway");
    } catch { return deny("DENY_UNIFY_GATEWAY", "memory page could not be bounded", "gateway"); }

    const batchRequest = {
      project_id: input.project_id, layer: input.layer, gateway_retrieved_at: gateway.retrieved_at,
      gateway_authority_decision_id: gateway.authority_decision_id, as_of: gatewayObservedAt.iso,
      records: records.map((record, request_index) => ({
        request_index, memory_record_id: record.memory_record_id, memory_record_version: record.version,
        content_hash: record.content_hash, target_record_fingerprint: canonicalFingerprint(record)
      }))
    };
    const batchOutcome = await boundedCall(() => resolveMemoryBatch(deepFreeze(structuredClone(batchRequest))), timeoutMs);
    const batch = batchOutcome.ok ? exactSnapshot(batchOutcome.value, BATCH_KEYS) : null;
    const batchObservedAt = trustedInstant(now);
    const batchEvaluatedMs = Date.parse(batch?.evaluated_at);
    if (batch === null || batch.ok !== true || batch.code !== "MEMORY_BATCH_RESOLVED"
      || batch.project_id !== input.project_id || batch.layer !== input.layer
      || batchObservedAt === null || !isCanonicalInstant(batch.evaluated_at)
      || !withinWindow(retrievedMs, batchEvaluatedMs, freshnessMs) || !withinWindow(batchEvaluatedMs, batchObservedAt.ms, freshnessMs)
      || !withinWindow(operationStart.ms, batchObservedAt.ms, freshnessMs)
      || batch.batch_fingerprint !== canonicalFingerprint(batchRequest) || !Array.isArray(batch.decisions)
      || batch.decisions.length !== records.length) {
      return deny("DENY_UNIFY_LIFECYCLE", "atomic lifecycle batch resolver returned an invalid receipt", "lifecycle");
    }

    const effective = [];
    const lifecycleExclusions = [];
    const seenDecisionIndexes = new Set();
    for (const rawDecision of batch.decisions) {
      const decision = exactSnapshot(rawDecision, DECISION_KEYS);
      if (decision === null || !Number.isSafeInteger(decision.request_index) || decision.request_index < 0 || decision.request_index >= records.length
        || seenDecisionIndexes.has(decision.request_index) || typeof decision.ok !== "boolean" || typeof decision.code !== "string") {
        return deny("DENY_UNIFY_LIFECYCLE", "lifecycle batch decision partition is malformed", "lifecycle");
      }
      seenDecisionIndexes.add(decision.request_index);
      const record = records[decision.request_index];
      if (decision.memory_record_id !== record.memory_record_id || decision.memory_record_version !== record.version) {
        return deny("DENY_UNIFY_LIFECYCLE_BINDING", "lifecycle decision identity was substituted", "lifecycle");
      }
      if (decision.ok === true) {
        if (decision.code !== "MEMORY_EFFECTIVE" || decision.content_hash !== record.content_hash
          || decision.target_record_fingerprint !== canonicalFingerprint(record) || !isHash(decision.state_fingerprint)
          || !isHash(decision.lifecycle_head_hash) || isBlank(decision.authority_decision_id)) {
          return deny("DENY_UNIFY_LIFECYCLE_BINDING", "lifecycle ALLOW was not bound to the immutable record and state", "lifecycle");
        }
        effective.push(record);
      } else {
        lifecycleExclusions.push(deepFreeze({ ref: canonicalFingerprint({ memory_record_id: record.memory_record_id, version: record.version }),
          stage: "memory-lifecycle", reason: "MEMORY_NOT_EFFECTIVE" }));
      }
    }

    const rawProjected = syncCall(() => projectMemory({ project_id: input.project_id, records: effective,
      ...(input.token_budget === undefined ? {} : { token_budget: input.token_budget }) }));
    const projected = rawProjected.ok ? exactSnapshot(rawProjected.value, PROVIDER_KEYS) : null;
    const providerObservedAt = trustedInstant(now);
    const projectedMs = Date.parse(projected?.retrieved_at);
    const expectedAccountingKeys = input.token_budget === undefined
      ? ["requested", "included", "excluded"]
      : ACCOUNTING_KEYS;
    const accounting = projected === null ? null : exactSnapshot(projected.accounting, expectedAccountingKeys);
    if (projected === null || accounting === null || projected.decision !== "ALLOW" || projected.code !== "MEMORY_SOURCES_PROJECTED"
      || projected.data_untrusted !== true || projected.project_id !== input.project_id
      || providerObservedAt === null || !isCanonicalInstant(projected.retrieved_at)
      || !withinWindow(batchEvaluatedMs, projectedMs, freshnessMs) || !withinWindow(projectedMs, providerObservedAt.ms, freshnessMs)
      || !withinWindow(operationStart.ms, providerObservedAt.ms, freshnessMs)
      || !Array.isArray(projected.sources) || !Array.isArray(projected.exclusions)
      || accounting.requested !== effective.length || accounting.included !== projected.sources.length || accounting.excluded !== projected.exclusions.length
      || accounting.included + accounting.excluded !== accounting.requested
      || (input.token_budget !== undefined && (accounting.token_budget !== input.token_budget
        || !Number.isSafeInteger(accounting.tokens_used) || accounting.tokens_used < 0 || accounting.tokens_used > input.token_budget))) {
      return deny("DENY_UNIFY_PROVIDER", "Candidate Provider output or accounting is inconsistent", "provider");
    }
    const partition = [...projected.sources.map((source) => source?.id), ...projected.exclusions.map((entry) => entry?.ref)];
    const expectedIds = effective.map((record) => record.memory_record_id).sort();
    if (partition.some((id) => typeof id !== "string") || new Set(partition).size !== partition.length
      || partition.slice().sort().some((id, index) => id !== expectedIds[index])) {
      return deny("DENY_UNIFY_PROVIDER_BINDING", "Candidate Provider added, omitted, or duplicated lifecycle-effective records", "provider");
    }
    const normalized = normalizeCandidateSources(projected.sources);
    if (normalized.exclusions.length !== 0 || normalized.candidates.length !== projected.sources.length) {
      return deny("DENY_UNIFY_CANDIDATE_PORT", "Candidate Provider sources failed the typed boundary", "candidate-source-port");
    }
    const recordById = new Map(effective.map((record) => [record.memory_record_id, record]));
    const projectionMs = projectedMs;
    for (const candidate of normalized.candidates) {
      const record = recordById.get(candidate.ref);
      const expectedCurrent = Date.parse(record.valid_from) <= projectionMs && projectionMs < Date.parse(record.valid_until);
      if (candidate.kind !== "memory" || candidate.projectId !== input.project_id
        || candidate.classification !== record.classification || candidate.verified !== true
        || candidate.current !== expectedCurrent || candidate.resolvable !== true || candidate.relevance !== record.confidence
        || candidate.provenance.origin !== record.source || candidate.provenance.retrieved_at !== projected.retrieved_at
        || candidate.provenance.content_hash !== record.content_hash) {
        return deny("DENY_UNIFY_PROVIDER_BINDING", "Candidate Provider changed governed record attributes", "provider");
      }
    }
    for (const exclusion of projected.exclusions) {
      if (!isPlainObject(exclusion) || exclusion.stage !== MEMORY_PROVIDER_STAGE
        || !MEMORY_PROVIDER_EXCLUSION_REASONS.includes(exclusion.reason)
        || ["MEMORY_MALFORMED", "MEMORY_PROJECT_MISMATCH"].includes(exclusion.reason)
        || (exclusion.reason === "BUDGET_EXCEEDED" && input.token_budget === undefined)) {
        return deny("DENY_UNIFY_PROVIDER_BINDING", "Candidate Provider exclusion is not admissible", "provider");
      }
    }
    const stateDigest = lifecycleStateDigest(batch);
    return deepFreeze({
      decision: "ALLOW", code: "MEMORY_LIFECYCLE_UNIFIED", project_id: input.project_id,
      retrieved_at: projected.retrieved_at, sources: normalized.candidates,
      exclusions: [...lifecycleExclusions, ...projected.exclusions],
      accounting: { requested: records.length, lifecycle_effective: effective.length,
        included: normalized.candidates.length, excluded: lifecycleExclusions.length + projected.exclusions.length },
      next_cursor: gateway.next_cursor,
      actor_id: gateway.actor_id,
      identity_decision_id: gateway.identity_decision_id,
      scope_decision_id: gateway.scope_decision_id,
      authority_decision_id: gateway.authority_decision_id,
      lifecycle_batch_fingerprint: batch.batch_fingerprint,
      lifecycle_state_digest: stateDigest,
      lifecycle_evaluated_at: batch.evaluated_at,
      lifecycle_bindings: batch.decisions.filter((decision) => decision.ok === true).map((decision) => ({
        memory_record_id: decision.memory_record_id,
        memory_record_version: decision.memory_record_version,
        content_hash: decision.content_hash,
        target_record_fingerprint: decision.target_record_fingerprint,
        state_fingerprint: decision.state_fingerprint,
        lifecycle_head_hash: decision.lifecycle_head_hash,
        authority_decision_id: decision.authority_decision_id
      }))
    });
  }

  async function issueReceipt(request) {
    const top = exactSnapshot(request, ["retrieval", "issue"]);
    if (top === null) return deny("DENY_UNIFY_ISSUE_REQUEST", "issue request is not a closed safe object", "request");
    const retrieval = exactSnapshot(top.retrieval, REQUEST_KEYS, REQUIRED_KEYS);
    const issueInput = exactSnapshot(top.issue, ISSUE_KEYS, ["document", "actorId", "authorityRef", "baseline", "idempotencyKey"]);
    if (retrieval === null || issueInput === null || !isPlainObject(issueInput.document)
      || issueInput.document.project_id !== retrieval.project_id || isBlank(issueInput.document.receipt_id)
      || !isHash(issueInput.document.content_hash)) {
      return deny("DENY_UNIFY_ISSUE_REQUEST", "nested retrieval and receipt project binding is malformed", "request");
    }
    try {
      validateContract("contextReceipt", issueInput.document);
      const { content_hash: ignoredHash, ...receiptBody } = issueInput.document; void ignoredHash;
      if (canonicalFingerprint(receiptBody) !== issueInput.document.content_hash) throw new Error("receipt seal mismatch");
    } catch {
      return deny("DENY_UNIFY_ISSUE_REQUEST", "Context Receipt contract or seal is invalid", "request");
    }
    let recovered;
    try { recovered = reconcileExistingBinding(retrieval, issueInput); }
    catch { return recoveryRequired("binding recovery evidence could not be safely evaluated"); }
    if (recovered !== null) return recovered;
    const unified = await retrieveCandidateSources(retrieval);
    if (unified.decision !== "ALLOW") return unified;
    const finalInstant = trustedInstant(now);
    const unifiedRetrievedMs = Date.parse(unified.retrieved_at);
    if (finalInstant === null || !withinWindow(unifiedRetrievedMs, finalInstant.ms, freshnessMs)) {
      return deny("DENY_UNIFY_FRESHNESS", "candidate projection is stale or the trusted clock regressed before issuance", "clock");
    }
    const finalBatchRequest = {
      project_id: retrieval.project_id,
      layer: retrieval.layer,
      as_of: finalInstant.iso,
      prior_batch_fingerprint: unified.lifecycle_batch_fingerprint,
      prior_state_digest: unified.lifecycle_state_digest,
      records: unified.lifecycle_bindings.map((binding, request_index) => ({ request_index, ...binding }))
    };
    let fenceActive = true;
    let callbackInvoked = false;
    let callbackResult = null;
    let settleCallback;
    const callbackCompletion = new Promise((resolve) => { settleCallback = resolve; });
    const callback = (rawBatch) => {
      if (!fenceActive || callbackInvoked) return deny("DENY_UNIFY_FENCE_CALLBACK", "issuance fence callback is unavailable", "lifecycle-fence");
      callbackInvoked = true;
      const fenceObservedAt = trustedInstant(now);
      const finalBatch = fenceObservedAt === null ? null : snapshotEffectiveBatch(
        rawBatch, finalBatchRequest, unified.lifecycle_bindings, finalInstant.ms, fenceObservedAt.ms, freshnessMs
      );
      if (finalBatch === null) {
        callbackResult = deny("DENY_UNIFY_FINAL_LIFECYCLE", "final lifecycle batch is stale, terminal, or unbound", "lifecycle-fence");
        settleCallback({ kind: "callback", value: callbackResult });
        return callbackResult;
      }
      const contextIssueRequest = { ...issueInput, candidateSources: unified.sources };
      const bindingHead = readVerifiedLedger();
      if (bindingHead === null) {
        callbackResult = deny("DENY_UNIFY_BINDING_LEDGER", "binding ledger head is unavailable", "binding-ledger");
        settleCallback({ kind: "callback", value: callbackResult });
        return callbackResult;
      }
      const binding = {
        context_receipt_fingerprint: issueInput.document.content_hash,
        context_intent_fingerprint: canonicalFingerprint({ op: "UNIFY_CONTEXT_INTENT", request: issueInput }),
        context_issue_fingerprint: canonicalFingerprint({ op: "ISSUE", request: { ...contextIssueRequest, idempotencyKey: undefined } }),
        context_idempotency_key_fingerprint: canonicalFingerprint(issueInput.idempotencyKey),
        lifecycle_batch_fingerprint: finalBatch.batch_fingerprint,
        lifecycle_state_digest: lifecycleStateDigest(finalBatch),
        evaluated_at: finalBatch.evaluated_at,
        binding_attempt: bindingHead.length + 1
      };
      binding.binding_fingerprint = canonicalFingerprint(binding);
      const persist = (status, extra = {}) => persistBindingEvent({ binding, contextIssueRequest, issueInput, retrieval, status, extra });
      const prepared = persist("PREPARED");
      if (prepared === null) {
        callbackResult = deny("DENY_UNIFY_BINDING_LEDGER", "durable lifecycle binding preparation failed", "binding-ledger");
        settleCallback({ kind: "callback", value: callbackResult });
        return callbackResult;
      }
      const preMutationInstant = trustedInstant(now);
      if (preMutationInstant === null || !withinWindow(Date.parse(finalBatch.evaluated_at), preMutationInstant.ms, freshnessMs)
        || !withinWindow(unifiedRetrievedMs, preMutationInstant.ms, freshnessMs)) {
        const aborted = persist("ABORTED", { reason: "STALE_BEFORE_CONTEXT" });
        callbackResult = aborted === null ? recoveryRequired("stale preparation could not be durably aborted")
          : deny("DENY_UNIFY_FRESHNESS", "lifecycle binding became stale before Context mutation", "clock");
        settleCallback({ kind: "callback", value: callbackResult });
        return callbackResult;
      }
      const rawIssued = syncCall(() => issueContext(contextIssueRequest));
      const issued = rawIssued.ok ? snapshotIssued(rawIssued.value, retrieval.project_id, issueInput.document.receipt_id) : null;
      if (issued === null) {
        const aborted = persist("ABORTED", { reason: "CONTEXT_DENIED" });
        callbackResult = aborted === null ? recoveryRequired("Context denial could not durably abort its prepared binding")
          : deny("DENY_UNIFY_CONTEXT", "Context Federation returned an unbound issuance result", "context-federation");
        settleCallback({ kind: "callback", value: callbackResult });
        return callbackResult;
      }
      const committed = persist("COMMITTED", { context_result_fingerprint: normalizedContextResultFingerprint(issued) });
      if (committed === null) {
        callbackResult = recoveryRequired("Context was issued but its lifecycle binding is not yet independently COMMITTED");
        settleCallback({ kind: "callback", value: callbackResult });
        return callbackResult;
      }
      const sourceStateBinding = makeSourceStateBinding(binding, committed);
      callbackResult = deepFreeze({ decision: "ALLOW", code: "MEMORY_CONTEXT_ISSUED",
        issued: { ...issued, sourceStateBinding } });
      settleCallback({ kind: "callback", value: callbackResult });
      return callbackResult;
    };
    let timer;
    const fenceReturn = Promise.resolve()
      .then(() => runIssuanceFence(deepFreeze(structuredClone(finalBatchRequest)), callback))
      .then((value) => ({ kind: "return", value }), () => ({ kind: "failure" }));
    const fenceOutcome = await Promise.race([
      callbackCompletion,
      fenceReturn,
      new Promise((resolve) => { timer = setTimeout(() => resolve({ kind: "timeout" }), timeoutMs); })
    ]);
    clearTimeout(timer);
    fenceActive = false;
    if (fenceOutcome.kind !== "callback" || callbackResult === null || callbackInvoked !== true) {
      return deny("DENY_UNIFY_ISSUANCE_FENCE", "issuance fence did not invoke its single callback in time", "lifecycle-fence");
    }
    if (callbackResult.decision === "DENY") return callbackResult;
    const fenced = exactSnapshot(fenceOutcome.value, ["decision", "code", "issued"]);
    if (fenced === null || fenced.decision !== "ALLOW" || fenced.code !== "MEMORY_CONTEXT_ISSUED") {
      return deny("DENY_UNIFY_ISSUANCE_FENCE", "issuance fence returned a malformed callback disposition", "lifecycle-fence");
    }
    return deepFreeze(fenced.issued);
  }

  return Object.freeze({ retrieveCandidateSources, issueReceipt });
}
