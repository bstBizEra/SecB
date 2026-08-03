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
  "context_receipt_fingerprint", "context_issue_fingerprint", "context_idempotency_key_fingerprint",
  "lifecycle_batch_fingerprint", "lifecycle_state_digest", "evaluated_at", "binding_fingerprint"
]);

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

export function verifyMemoryContextLifecycleBinding(value) {
  const binding = exactSnapshot(value, [...BINDING_CORE_KEYS, "binding_status", "ledger_sequence", "ledger_record_hash", "replayed"]);
  if (binding === null || !isHash(binding.context_receipt_fingerprint) || !isHash(binding.lifecycle_batch_fingerprint)
    || !isHash(binding.context_issue_fingerprint) || !isHash(binding.context_idempotency_key_fingerprint)
    || !isHash(binding.lifecycle_state_digest) || !isHash(binding.binding_fingerprint) || !isCanonicalInstant(binding.evaluated_at)
    || binding.binding_status !== "COMMITTED" || !Number.isSafeInteger(binding.ledger_sequence) || binding.ledger_sequence < 1
    || !isHash(binding.ledger_record_hash) || typeof binding.replayed !== "boolean") return false;
  const tuple = { context_receipt_fingerprint: binding.context_receipt_fingerprint,
    context_issue_fingerprint: binding.context_issue_fingerprint,
    context_idempotency_key_fingerprint: binding.context_idempotency_key_fingerprint,
    lifecycle_batch_fingerprint: binding.lifecycle_batch_fingerprint, lifecycle_state_digest: binding.lifecycle_state_digest,
    evaluated_at: binding.evaluated_at };
  return canonicalFingerprint(tuple) === binding.binding_fingerprint;
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
  let appendBinding;
  let readBindings;
  let verifyBindings;
  try {
    retrieve = memoryAuthorityGateway?.retrieve;
    resolveBatch = lifecycleResolver?.resolveBatch;
    withIssuanceFence = lifecycleResolver?.withIssuanceFence;
    project = memoryCandidateProvider?.toCandidateSources;
    issue = contextFederation?.issueReceipt;
    appendBinding = lifecycleBindingLedger?.append;
    readBindings = lifecycleBindingLedger?.read;
    verifyBindings = lifecycleBindingLedger?.verify;
  } catch {
    throw new MemoryLifecycleUnifiedConfigurationError("INVALID_UNIFY_DEPENDENCY", "unify dependencies could not be safely inspected");
  }
  if (typeof retrieve !== "function") throw new MemoryLifecycleUnifiedConfigurationError("INVALID_MEMORY_AUTHORITY_GATEWAY", "authority-aware memoryAuthorityGateway.retrieve is required");
  if (typeof resolveBatch !== "function") throw new MemoryLifecycleUnifiedConfigurationError("INVALID_LIFECYCLE_RESOLVER", "shared lifecycleResolver.resolveBatch is required");
  if (typeof withIssuanceFence !== "function") throw new MemoryLifecycleUnifiedConfigurationError("INVALID_LIFECYCLE_FENCE", "shared lifecycleResolver.withIssuanceFence is required");
  if (typeof project !== "function") throw new MemoryLifecycleUnifiedConfigurationError("INVALID_MEMORY_PROVIDER", "memoryCandidateProvider.toCandidateSources is required");
  if (typeof issue !== "function") throw new MemoryLifecycleUnifiedConfigurationError("INVALID_CONTEXT_FEDERATION", "contextFederation.issueReceipt is required");
  if (typeof appendBinding !== "function" || typeof readBindings !== "function" || typeof verifyBindings !== "function") {
    throw new MemoryLifecycleUnifiedConfigurationError("INVALID_BINDING_LEDGER", "a durable lifecycle binding ledger with append(), read(), and verify() is required");
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
  const appendLifecycleBinding = Function.prototype.bind.call(appendBinding, lifecycleBindingLedger);
  const readLifecycleBindings = Function.prototype.bind.call(readBindings, lifecycleBindingLedger);
  const verifyLifecycleBindings = Function.prototype.bind.call(verifyBindings, lifecycleBindingLedger);

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
      const binding = {
        context_receipt_fingerprint: issueInput.document.content_hash,
        context_issue_fingerprint: canonicalFingerprint({ op: "ISSUE", request: { ...contextIssueRequest, idempotencyKey: undefined } }),
        context_idempotency_key_fingerprint: canonicalFingerprint(issueInput.idempotencyKey),
        lifecycle_batch_fingerprint: finalBatch.batch_fingerprint,
        lifecycle_state_digest: lifecycleStateDigest(finalBatch),
        evaluated_at: finalBatch.evaluated_at
      };
      binding.binding_fingerprint = canonicalFingerprint(binding);
      const persistBindingEvent = (status, extra = {}) => {
        const head = syncCall(() => verifyLifecycleBindings());
        const entry = {
          entryId: canonicalFingerprint({ binding_fingerprint: binding.binding_fingerprint, status }), projectId: retrieval.project_id,
          workPackageId: issueInput.document.work_package_id, sessionId: issueInput.document.session_id,
          actorId: issueInput.actorId, type: `MEMORY_CONTEXT_LIFECYCLE_BINDING_${status}`,
          payload: { binding, status, ...extra }, timestamp: finalBatch.evaluated_at,
          idempotencyKey: JSON.stringify([retrieval.project_id, issueInput.document.receipt_id, binding.binding_fingerprint, status])
        };
        const appendedCall = head.ok && head.value?.valid === true && Number.isSafeInteger(head.value.count)
          ? syncCall(() => appendLifecycleBinding(entry, { expectedSequence: head.value.count })) : { ok: false };
        const appended = appendedCall.ok ? exactSnapshot(appendedCall.value, LEDGER_RECEIPT_KEYS) : null;
        const readbackCall = appended === null ? { ok: false } : syncCall(() => readLifecycleBindings());
        const readback = readbackCall.ok && Array.isArray(readbackCall.value)
          ? readbackCall.value.find((record) => record?.sequence === appended.sequence) : null;
        const { replayed: ignoredReplay, ...persistedReceipt } = appended ?? {}; void ignoredReplay;
        if (appended === null || canonicalFingerprint(appended.entry) !== canonicalFingerprint(entry)
          || !isHash(appended.recordHash) || !isHash(appended.entryHash)
          || canonicalFingerprint(readback) !== canonicalFingerprint(persistedReceipt)) return null;
        return appended;
      };
      const prepared = persistBindingEvent("PREPARED");
      if (prepared === null) {
        callbackResult = deny("DENY_UNIFY_BINDING_LEDGER", "durable lifecycle binding preparation failed", "binding-ledger");
        settleCallback({ kind: "callback", value: callbackResult });
        return callbackResult;
      }
      const preMutationInstant = trustedInstant(now);
      if (preMutationInstant === null || !withinWindow(Date.parse(finalBatch.evaluated_at), preMutationInstant.ms, freshnessMs)
        || !withinWindow(unifiedRetrievedMs, preMutationInstant.ms, freshnessMs)) {
        persistBindingEvent("ABORTED", { reason: "STALE_BEFORE_CONTEXT" });
        callbackResult = deny("DENY_UNIFY_FRESHNESS", "lifecycle binding became stale before Context mutation", "clock");
        settleCallback({ kind: "callback", value: callbackResult });
        return callbackResult;
      }
      const rawIssued = syncCall(() => issueContext(contextIssueRequest));
      const issued = rawIssued.ok ? exactSnapshot(rawIssued.value, ISSUE_RESULT_KEYS) : null;
      if (issued === null || issued.state !== "ISSUED" || issued.projectId !== retrieval.project_id
        || issued.receiptId !== issueInput.document.receipt_id || !Number.isSafeInteger(issued.version) || issued.version < 1
        || !((Number.isSafeInteger(issued.boundWpVersion) && issued.boundWpVersion > 0) || !isBlank(issued.boundWpVersion))
        || !isCanonicalInstant(issued.expiresAt) || !Array.isArray(issued.exclusions) || typeof issued.replayed !== "boolean") {
        persistBindingEvent("ABORTED", { reason: "CONTEXT_DENIED" });
        callbackResult = deny("DENY_UNIFY_CONTEXT", "Context Federation returned an unbound issuance result", "context-federation");
        settleCallback({ kind: "callback", value: callbackResult });
        return callbackResult;
      }
      const committed = persistBindingEvent("COMMITTED", { context_result_fingerprint: canonicalFingerprint(issued) });
      const sourceStateBinding = committed === null
        ? deepFreeze({ ...binding, binding_status: "RECOVERY_REQUIRED", ledger_sequence: prepared.sequence,
          ledger_record_hash: prepared.recordHash, replayed: prepared.replayed })
        : deepFreeze({ ...binding, binding_status: "COMMITTED", ledger_sequence: committed.sequence,
          ledger_record_hash: committed.recordHash, replayed: committed.replayed });
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
