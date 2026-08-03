import { canonicalFingerprint } from "../contracts/canonical-fingerprint.mjs";
import { validateContract } from "../contracts/contract-validator.mjs";

const LAYERS = Object.freeze(["session", "work", "project"]);
const MUTATION_TYPES = Object.freeze(["LEGAL_HOLD_PLACED", "LEGAL_HOLD_RELEASED", "REDACTION_APPLIED", "TOMBSTONED"]);
const COMMON_MUTATION_KEYS = Object.freeze([
  "project_id", "layer", "memory_record_id", "memory_record_version", "event_type", "reason", "idempotency_key"
]);
const OPTIONAL_MUTATION_KEYS = Object.freeze(["hold_id", "redaction_manifest_hash"]);
const RESOLVE_KEYS = Object.freeze(["project_id", "layer", "memory_record_id", "memory_record_version"]);
const AUTHORITY_KEYS = Object.freeze([
  "decision", "code", "decision_id", "phase", "operation", "project_id", "layer", "memory_record_id",
  "memory_record_version", "event_type", "target_content_hash", "target_record_fingerprint", "parameters_hash",
  "state_fingerprint", "evidence_id", "evidence_hash", "actor_id", "producer_actor_id", "reviewer_actor_id",
  "approver_actor_id", "work_package_id", "session_id", "authority_ref", "valid_from", "valid_until"
]);
const EVIDENCE_KEYS = Object.freeze([
  "decision", "code", "evidence_id", "evidence_hash", "project_id", "layer", "memory_record_id",
  "memory_record_version", "event_type", "target_content_hash", "target_record_fingerprint", "parameters_hash",
  "redaction_manifest_hash", "evidence_acceptor_actor_id", "preservation_action", "valid_from", "valid_until"
]);
const RETENTION_KEYS = Object.freeze([
  "decision", "code", "decision_id", "project_id", "memory_record_id", "memory_record_version", "policy_id", "retain_until"
]);
const VERIFY_KEYS = Object.freeze(["valid", "ledgerId", "count", "headHash"]);
const EVENT_ROW_KEYS = Object.freeze(["sequence", "event"]);
const IDEMPOTENCY_ROW_KEYS = Object.freeze(["sequence", "record_hash", "entry_hash", "idempotency_key", "event"]);
const MAX_LINEAGE_RECORDS = 10_000;
const MAX_LINEAGE_BYTES = 4 * 1024 * 1024;
const MAX_LIFECYCLE_EVENTS = 10_000;
const MAX_ID_LENGTH = 256;
const MAX_REASON_LENGTH = 2_048;
const DEFAULT_TIMEOUTS = Object.freeze({ authority_ms: 250, record_ms: 250, retention_ms: 250, evidence_ms: 250 });
const MAX_TIMEOUT_MS = 30_000;

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isBoundedString = (value, max = MAX_ID_LENGTH) => typeof value === "string" && value.trim() !== "" && value.length <= max;
const isSha256 = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const deny = (code, message, extra = {}) => deepFreeze({ ok: false, code, message, ...extra });

function snapshotClosed(value, allowedKeys, requiredKeys = allowedKeys) {
  if (!isPlainObject(value)) return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(value);
    if (
      keys.some((key) => typeof key !== "string" || !allowedKeys.includes(key))
      || requiredKeys.some((key) => !keys.includes(key))
    ) return null;
    return structuredClone(value);
  } catch {
    return null;
  }
}

function trustedInstant(now) {
  try {
    const candidate = now();
    if (!(candidate instanceof Date)) return null;
    const epochMs = Date.prototype.getTime.call(candidate);
    if (!Number.isFinite(epochMs)) return null;
    return { ms: epochMs, iso: new Date(epochMs).toISOString() };
  } catch {
    return null;
  }
}

async function boundedCall(operation, timeoutMs) {
  let timer;
  const outcome = await Promise.race([
    Promise.resolve().then(operation).then((value) => ({ status: "ok", value }), () => ({ status: "error" })),
    new Promise((resolve) => { timer = setTimeout(() => resolve({ status: "timeout" }), timeoutMs); })
  ]);
  clearTimeout(timer);
  return outcome;
}

function validTarget(input) {
  return isBoundedString(input?.project_id)
    && LAYERS.includes(input?.layer)
    && isBoundedString(input?.memory_record_id)
    && Number.isSafeInteger(input?.memory_record_version)
    && input.memory_record_version >= 1;
}

function snapshotVerify(value) {
  const result = snapshotClosed(value, VERIFY_KEYS);
  if (
    result === null || result.valid !== true || result.ledgerId !== "secb-memory-lifecycle-ledger"
    || !Number.isSafeInteger(result.count) || result.count < 0 || result.count > MAX_LIFECYCLE_EVENTS
    || !isSha256(result.headHash)
  ) return null;
  return result;
}

function snapshotEventRows(value) {
  if (!Array.isArray(value) || value.length > MAX_LIFECYCLE_EVENTS) return null;
  try {
    const rows = structuredClone(value);
    for (const row of rows) {
      if (snapshotClosed(row, EVENT_ROW_KEYS) === null || !Number.isSafeInteger(row.sequence) || row.sequence < 1 || !isPlainObject(row.event)) return null;
    }
    return rows;
  } catch {
    return null;
  }
}

function snapshotIdempotencyRow(value) {
  if (value === null) return null;
  const row = snapshotClosed(value, IDEMPOTENCY_ROW_KEYS);
  if (
    row === null || !Number.isSafeInteger(row.sequence) || row.sequence < 1
    || !isSha256(row.record_hash) || !isSha256(row.entry_hash)
    || !isBoundedString(row.idempotency_key, 512) || !isPlainObject(row.event)
  ) return undefined;
  return row;
}

function snapshotLineage(value, target) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_LINEAGE_RECORDS) return null;
  let records;
  try {
    records = structuredClone(value);
    if (Buffer.byteLength(JSON.stringify(records), "utf8") > MAX_LINEAGE_BYTES) return null;
  } catch {
    return null;
  }
  const identities = new Set();
  for (const record of records) {
    try {
      validateContract("memoryRecord", record);
    } catch {
      return null;
    }
    if (record.project_id !== target.project_id || record.layer !== target.layer) return null;
    const { admitted_at: admittedAt, content_hash: contentHash, ...hashBody } = record;
    void admittedAt;
    if (canonicalFingerprint(hashBody) !== contentHash) return null;
    const identity = `${record.memory_record_id}\u0000${record.version}`;
    if (identities.has(identity)) return null;
    identities.add(identity);
  }
  return records;
}

function resolveSupersession(records, target) {
  const groups = new Map();
  for (const record of records) {
    const group = groups.get(record.memory_record_id) ?? [];
    group.push(record);
    groups.set(record.memory_record_id, group);
  }
  for (const group of groups.values()) {
    group.sort((left, right) => left.version - right.version);
    for (let index = 1; index < group.length; index += 1) {
      if (
        group[index].version !== group[index - 1].version + 1
        || Date.parse(group[index].admitted_at) < Date.parse(group[index - 1].admitted_at)
      ) return { ok: false, code: "DENY_LINEAGE_INVALID" };
    }
  }
  const requested = records.find((record) => record.memory_record_id === target.memory_record_id && record.version === target.memory_record_version);
  if (requested === undefined) return { ok: false, code: "DENY_MEMORY_RECORD_NOT_FOUND" };

  const nodeKey = (record) => `${record.memory_record_id}\u0000${record.version}`;
  const childByParent = new Map();
  const addEdge = (parent, child) => {
    const key = nodeKey(parent);
    const existing = childByParent.get(key);
    if (existing !== undefined && nodeKey(existing) !== nodeKey(child)) return false;
    childByParent.set(key, child);
    return true;
  };
  for (const group of groups.values()) {
    for (let index = 1; index < group.length; index += 1) if (!addEdge(group[index - 1], group[index])) return { ok: false, code: "DENY_LINEAGE_FORK" };
  }
  for (const [recordId, group] of groups) {
    const declarations = [...new Set(group.map((record) => record.supersedes).filter((value) => value !== undefined))];
    if (declarations.length > 1 || declarations[0] === recordId) return { ok: false, code: "DENY_LINEAGE_INVALID" };
    if (declarations.length === 0) continue;
    const parentGroup = groups.get(declarations[0]);
    if (parentGroup === undefined) return { ok: false, code: "DENY_LINEAGE_INVALID" };
    const parent = parentGroup.at(-1);
    const child = group[0];
    if (Date.parse(child.admitted_at) < Date.parse(parent.admitted_at)) return { ok: false, code: "DENY_LINEAGE_INVALID" };
    if (!addEdge(parent, child)) return { ok: false, code: "DENY_LINEAGE_FORK" };
  }
  for (const record of records) {
    const visited = new Set();
    let cursor = record;
    while (childByParent.has(nodeKey(cursor))) {
      const key = nodeKey(cursor);
      if (visited.has(key)) return { ok: false, code: "DENY_LINEAGE_CYCLE" };
      visited.add(key);
      cursor = childByParent.get(key);
    }
  }
  let head = requested;
  while (childByParent.has(nodeKey(head))) head = childByParent.get(nodeKey(head));
  return { ok: true, requested, head, current: nodeKey(head) === nodeKey(requested) };
}

function lifecycleState(rows, target) {
  const activeHolds = new Set();
  let terminal = null;
  for (const row of rows) {
    const event = row.event;
    if (
      event.project_id !== target.project_id || event.layer !== target.layer
      || event.memory_record_id !== target.memory_record_id || event.memory_record_version !== target.version
      || event.target_content_hash !== target.content_hash || event.target_record_fingerprint !== canonicalFingerprint(target)
    ) return null;
    if (event.event_type === "LEGAL_HOLD_PLACED") activeHolds.add(event.hold_id);
    else if (event.event_type === "LEGAL_HOLD_RELEASED") activeHolds.delete(event.hold_id);
    else if (event.event_type === "REDACTION_APPLIED" || event.event_type === "TOMBSTONED") terminal = event.event_type;
  }
  return { activeHolds, terminal };
}

function lineageFingerprint(records) {
  return canonicalFingerprint(records.map((record) => ({
    memory_record_id: record.memory_record_id,
    version: record.version,
    content_hash: record.content_hash,
    admitted_at: record.admitted_at,
    supersedes: record.supersedes ?? null
  })).sort((left, right) => `${left.memory_record_id}\u0000${left.version}`.localeCompare(`${right.memory_record_id}\u0000${right.version}`)));
}

export class MemoryLifecycleConfigurationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MemoryLifecycleConfigurationError";
    this.code = code;
  }
}

export function createMemoryLifecycleService({ ledger, authorityResolver, recordResolver, retentionPolicyResolver, evidenceResolver, sodRules, now, timeouts } = {}) {
  let appendLifecycleEvent;
  let readLifecycleEvents;
  let readByIdempotency;
  let verifyLedger;
  let checkPairwiseDistinct;
  try {
    appendLifecycleEvent = ledger?.appendLifecycleEvent;
    readLifecycleEvents = ledger?.readLifecycleEvents;
    readByIdempotency = ledger?.readLifecycleEventByIdempotencyKey;
    verifyLedger = ledger?.verify;
    checkPairwiseDistinct = sodRules?.checkPairwiseDistinct;
  } catch {
    throw new MemoryLifecycleConfigurationError("INVALID_LIFECYCLE_DEPENDENCY", "lifecycle dependencies could not be inspected");
  }
  if (ledger === null || typeof ledger !== "object" || Array.isArray(ledger)
    || [appendLifecycleEvent, readLifecycleEvents, readByIdempotency, verifyLedger].some((port) => typeof port !== "function")) {
    throw new MemoryLifecycleConfigurationError("INVALID_LIFECYCLE_LEDGER", "ledger must expose append, read, idempotency lookup, and verify ports");
  }
  if (typeof authorityResolver !== "function") throw new MemoryLifecycleConfigurationError("INVALID_AUTHORITY_RESOLVER", "authorityResolver is required");
  if (typeof recordResolver !== "function") throw new MemoryLifecycleConfigurationError("INVALID_RECORD_RESOLVER", "recordResolver is required");
  if (typeof retentionPolicyResolver !== "function") throw new MemoryLifecycleConfigurationError("INVALID_RETENTION_RESOLVER", "retentionPolicyResolver is required");
  if (typeof evidenceResolver !== "function") throw new MemoryLifecycleConfigurationError("INVALID_EVIDENCE_RESOLVER", "evidenceResolver is required");
  if (typeof checkPairwiseDistinct !== "function") throw new MemoryLifecycleConfigurationError("INVALID_SOD_RULES", "sodRules.checkPairwiseDistinct is required");
  if (typeof now !== "function") throw new MemoryLifecycleConfigurationError("INVALID_CLOCK", "now() trusted clock is required");

  const configuredTimeouts = { ...DEFAULT_TIMEOUTS };
  if (timeouts !== undefined) {
    const snapshot = snapshotClosed(timeouts, Object.keys(DEFAULT_TIMEOUTS), []);
    if (snapshot === null) throw new MemoryLifecycleConfigurationError("INVALID_TIMEOUTS", "timeouts must be a closed object");
    Object.assign(configuredTimeouts, snapshot);
  }
  if (Object.values(configuredTimeouts).some((value) => !Number.isSafeInteger(value) || value < 1 || value > MAX_TIMEOUT_MS)) {
    throw new MemoryLifecycleConfigurationError("INVALID_TIMEOUTS", "dependency timeouts must be positive bounded integers");
  }

  const appendEvent = Function.prototype.bind.call(appendLifecycleEvent, ledger);
  const readEvents = Function.prototype.bind.call(readLifecycleEvents, ledger);
  const lookupIdempotency = Function.prototype.bind.call(readByIdempotency, ledger);
  const verify = Function.prototype.bind.call(verifyLedger, ledger);
  const checkSod = Function.prototype.bind.call(checkPairwiseDistinct, sodRules);

  async function callPort(port, request, timeoutMs) {
    const outcome = await boundedCall(() => port(deepFreeze(structuredClone(request))), timeoutMs);
    return outcome.status === "ok" ? outcome.value : undefined;
  }

  async function loadLineage(target) {
    const raw = await callPort(recordResolver, { project_id: target.project_id, layer: target.layer }, configuredTimeouts.record_ms);
    return raw === undefined ? null : snapshotLineage(raw, target);
  }

  function readLedgerState(target, record) {
    try {
      const before = snapshotVerify(verify());
      if (before === null) return { failure: deny("DENY_LIFECYCLE_STORE_UNAVAILABLE", "lifecycle ledger verification was malformed") };
      const rows = snapshotEventRows(readEvents({
        project_id: target.project_id,
        layer: target.layer,
        memory_record_id: target.memory_record_id,
        memory_record_version: target.memory_record_version
      }));
      if (rows === null) return { failure: deny("DENY_LIFECYCLE_STORE_UNAVAILABLE", "lifecycle event rows were malformed") };
      const after = snapshotVerify(verify());
      if (after === null || before.count !== after.count || before.headHash !== after.headHash) return { changed: true };
      const state = lifecycleState(rows, record);
      if (state === null) return { failure: deny("DENY_LIFECYCLE_TARGET_DRIFT", "stored lifecycle event does not bind the current target record") };
      return { changed: false, head: after, rows, state };
    } catch (cause) {
      return { failure: deny(cause?.code ?? "DENY_LIFECYCLE_STORE_UNAVAILABLE", "lifecycle ledger could not be safely read") };
    }
  }

  function authorityExpected({ phase, operation, input, record = null, parametersHash = null, stateFingerprint = null, evidence = null }) {
    return {
      phase,
      operation,
      project_id: input.project_id,
      layer: input.layer,
      memory_record_id: input.memory_record_id,
      memory_record_version: input.memory_record_version,
      event_type: input.event_type ?? null,
      target_content_hash: record?.content_hash ?? null,
      target_record_fingerprint: record === null ? null : canonicalFingerprint(record),
      parameters_hash: parametersHash,
      state_fingerprint: stateFingerprint,
      evidence_id: evidence?.evidence_id ?? null,
      evidence_hash: evidence?.evidence_hash ?? null
    };
  }

  function snapshotAuthority(raw, expected, instant) {
    const value = snapshotClosed(raw, AUTHORITY_KEYS);
    if (value === null) return null;
    const fromMs = Date.parse(value.valid_from);
    const untilMs = Date.parse(value.valid_until);
    for (const key of Object.keys(expected)) if (value[key] !== expected[key]) return null;
    if (
      value.decision !== "ALLOW" || value.code !== "ALLOW_MEMORY_LIFECYCLE"
      || !isBoundedString(value.decision_id) || !isBoundedString(value.actor_id)
      || !isBoundedString(value.producer_actor_id) || !isBoundedString(value.reviewer_actor_id)
      || !isBoundedString(value.approver_actor_id) || value.actor_id !== value.approver_actor_id
      || !isBoundedString(value.work_package_id) || !isBoundedString(value.session_id) || !isBoundedString(value.authority_ref)
      || !Number.isFinite(fromMs) || !Number.isFinite(untilMs)
      || new Date(fromMs).toISOString() !== value.valid_from || new Date(untilMs).toISOString() !== value.valid_until
      || fromMs > instant.ms || instant.ms >= untilMs
    ) return null;
    const distinct = checkSod([
      { role: "PRODUCER", actorId: value.producer_actor_id },
      { role: "REV", actorId: value.reviewer_actor_id },
      { role: "GOV", actorId: value.approver_actor_id }
    ], { code: "DENY_LIFECYCLE_SOD" });
    return distinct?.ok === true ? value : null;
  }

  async function authorize(expected, instant) {
    const raw = await callPort(authorityResolver, expected, configuredTimeouts.authority_ms);
    return raw === undefined ? null : snapshotAuthority(raw, expected, instant);
  }

  function sameAuthority(left, right) {
    return ["decision_id", "actor_id", "producer_actor_id", "reviewer_actor_id", "approver_actor_id", "authority_ref"]
      .every((key) => left[key] === right[key]);
  }

  function mutationParameters(input, record) {
    return canonicalFingerprint({
      project_id: input.project_id,
      layer: input.layer,
      memory_record_id: input.memory_record_id,
      memory_record_version: input.memory_record_version,
      target_content_hash: record.content_hash,
      target_record_fingerprint: canonicalFingerprint(record),
      event_type: input.event_type,
      reason_hash: canonicalFingerprint({ reason: input.reason }),
      hold_id: input.hold_id ?? null,
      redaction_manifest_hash: input.redaction_manifest_hash ?? null
    });
  }

  function requestFingerprint(input) {
    const { idempotency_key: ignored, ...logical } = input;
    void ignored;
    return canonicalFingerprint(logical);
  }

  function replayReceipt(row, replayed) {
    return deepFreeze({
      sequence: row.sequence,
      record_hash: row.record_hash,
      entry_hash: row.entry_hash,
      idempotency_key: row.idempotency_key,
      event_id: row.event.event_id,
      replayed
    });
  }

  function lookupReplay(input, fingerprint) {
    try {
      const raw = lookupIdempotency(input.idempotency_key);
      const row = snapshotIdempotencyRow(raw);
      if (row === undefined) return { error: deny("DENY_LIFECYCLE_STORE_UNAVAILABLE", "idempotency lookup was malformed") };
      if (row === null) return { row: null };
      if (row.event.request_fingerprint !== fingerprint) return { error: deny("DENY_IDEMPOTENCY_CONFLICT", "idempotency key is bound to a different lifecycle request") };
      return { row };
    } catch (cause) {
      return { error: deny(cause?.code ?? "DENY_LIFECYCLE_STORE_UNAVAILABLE", "idempotency lookup failed") };
    }
  }

  function snapshotEvidence(raw, expected, instant, activeHoldCount) {
    const value = snapshotClosed(raw, EVIDENCE_KEYS);
    if (value === null) return null;
    const fromMs = Date.parse(value.valid_from);
    const untilMs = Date.parse(value.valid_until);
    for (const key of Object.keys(expected)) if (value[key] !== expected[key]) return null;
    if (
      value.decision !== "ACCEPTED" || value.code !== "EVIDENCE_ACCEPTED"
      || !isBoundedString(value.evidence_id) || !isSha256(value.evidence_hash)
      || !isBoundedString(value.evidence_acceptor_actor_id)
      || !["NOT_APPLICABLE", "PRESERVE_ORIGINAL"].includes(value.preservation_action)
      || !Number.isFinite(fromMs) || !Number.isFinite(untilMs)
      || new Date(fromMs).toISOString() !== value.valid_from || new Date(untilMs).toISOString() !== value.valid_until
      || fromMs > instant.ms || instant.ms >= untilMs
      || (activeHoldCount > 0 && ["REDACTION_APPLIED", "TOMBSTONED"].includes(expected.event_type) && value.preservation_action !== "PRESERVE_ORIGINAL")
    ) return null;
    return value;
  }

  function snapshotRetention(raw, record) {
    const value = snapshotClosed(raw, RETENTION_KEYS);
    if (value === null) return null;
    const retainUntilMs = value.retain_until === null ? null : Date.parse(value.retain_until);
    if (
      value.decision !== "ALLOW" || value.code !== "ALLOW_RETENTION" || !isBoundedString(value.decision_id)
      || value.project_id !== record.project_id || value.memory_record_id !== record.memory_record_id
      || value.memory_record_version !== record.version || value.policy_id !== record.retention_policy
      || (value.retain_until !== null && (!Number.isFinite(retainUntilMs) || new Date(retainUntilMs).toISOString() !== value.retain_until))
    ) return null;
    return { ...value, retainUntilMs };
  }

  async function recordLifecycleEvent(request) {
    const input = snapshotClosed(request, [...COMMON_MUTATION_KEYS, ...OPTIONAL_MUTATION_KEYS], COMMON_MUTATION_KEYS);
    if (
      input === null || !validTarget(input) || !MUTATION_TYPES.includes(input.event_type)
      || !isBoundedString(input.reason, MAX_REASON_LENGTH) || !isBoundedString(input.idempotency_key, 512)
    ) return deny("DENY_LIFECYCLE_REQUEST_MALFORMED", "lifecycle request is malformed or exceeds bounds");
    const needsHold = input.event_type === "LEGAL_HOLD_PLACED" || input.event_type === "LEGAL_HOLD_RELEASED";
    const needsManifest = input.event_type === "REDACTION_APPLIED";
    if (
      needsHold !== Object.prototype.hasOwnProperty.call(input, "hold_id") || (needsHold && !isBoundedString(input.hold_id))
      || needsManifest !== Object.prototype.hasOwnProperty.call(input, "redaction_manifest_hash") || (needsManifest && !isSha256(input.redaction_manifest_hash))
    ) return deny("DENY_LIFECYCLE_REQUEST_MALFORMED", "event-specific lifecycle fields are malformed");

    const requestHash = requestFingerprint(input);
    const replay = lookupReplay(input, requestHash);
    if (replay.error) return replay.error;
    if (replay.row !== null) return deepFreeze({ ok: true, code: "MEMORY_LIFECYCLE_RECORDED", event: replay.row.event, receipt: replayReceipt(replay.row, true) });

    const initialInstant = trustedInstant(now);
    if (initialInstant === null) return deny("DENY_CLOCK_UNAVAILABLE", "trusted lifecycle clock is unavailable");
    const preExpected = authorityExpected({ phase: "PRECHECK", operation: "memory-lifecycle-mutate", input });
    const preliminary = await authorize(preExpected, initialInstant);
    if (preliminary === null) return deny("DENY_LIFECYCLE_AUTHORITY", "preliminary lifecycle authority was not established");

    const initialRecords = await loadLineage(input);
    if (initialRecords === null) return deny("DENY_LINEAGE_INVALID", "memory lineage could not be established");
    const initialChain = resolveSupersession(initialRecords, input);
    if (!initialChain.ok) return deny(initialChain.code, "memory supersession lineage is not resolvable");
    const target = initialChain.requested;
    const initialLedger = readLedgerState(input, target);
    if (initialLedger.failure) return initialLedger.failure;
    if (initialLedger.changed) return deny("DENY_LIFECYCLE_CHANGED", "lifecycle changed during resolution");

    const parametersHash = mutationParameters(input, target);
    const evidenceExpected = {
      project_id: input.project_id,
      layer: input.layer,
      memory_record_id: input.memory_record_id,
      memory_record_version: input.memory_record_version,
      event_type: input.event_type,
      target_content_hash: target.content_hash,
      target_record_fingerprint: canonicalFingerprint(target),
      parameters_hash: parametersHash,
      redaction_manifest_hash: input.redaction_manifest_hash ?? null
    };
    const rawEvidence = await callPort(evidenceResolver, { ...evidenceExpected, active_legal_hold_count: initialLedger.state.activeHolds.size }, configuredTimeouts.evidence_ms);
    const evidence = rawEvidence === undefined ? null : snapshotEvidence(rawEvidence, evidenceExpected, initialInstant, initialLedger.state.activeHolds.size);
    if (evidence === null) return deny("DENY_LIFECYCLE_EVIDENCE", "independently accepted lifecycle evidence was not established");
    const distinct = checkSod([
      { role: "PRODUCER", actorId: preliminary.producer_actor_id },
      { role: "REV", actorId: preliminary.reviewer_actor_id },
      { role: "GOV", actorId: preliminary.approver_actor_id },
      { role: "EVIDENCE_ACCEPTOR", actorId: evidence.evidence_acceptor_actor_id }
    ], { code: "DENY_LIFECYCLE_SOD" });
    if (distinct?.ok !== true) return deny("DENY_LIFECYCLE_SOD", "lifecycle separation of duties was not established");

    const finalRecords = await loadLineage(input);
    if (finalRecords === null) return deny("DENY_LINEAGE_INVALID", "final memory lineage could not be established");
    const finalChain = resolveSupersession(finalRecords, input);
    if (!finalChain.ok) return deny(finalChain.code, "final memory lineage is not resolvable");
    if (canonicalFingerprint(finalChain.requested) !== canonicalFingerprint(target)) return deny("DENY_LINEAGE_CHANGED", "target memory record changed during lifecycle mutation");
    if (["REDACTION_APPLIED", "TOMBSTONED"].includes(input.event_type) && !finalChain.current) {
      return deny("DENY_MEMORY_SUPERSEDED", "destructive lifecycle action requires the current chain head");
    }
    const finalLedger = readLedgerState(input, target);
    if (finalLedger.failure) return finalLedger.failure;
    if (finalLedger.changed || finalLedger.head.headHash !== initialLedger.head.headHash) return deny("DENY_LIFECYCLE_CHANGED", "lifecycle changed during mutation authorization");

    const instant = trustedInstant(now);
    if (instant === null || instant.ms < initialInstant.ms) return deny("DENY_CLOCK_UNAVAILABLE", "trusted lifecycle clock regressed or became unavailable");
    const stateFingerprint = canonicalFingerprint({
      lineage: lineageFingerprint(finalRecords), lifecycle_head_hash: finalLedger.head.headHash,
      lifecycle_sequence: finalLedger.head.count, evidence_id: evidence.evidence_id, evidence_hash: evidence.evidence_hash
    });
    const commitExpected = authorityExpected({ phase: "COMMIT", operation: "memory-lifecycle-mutate", input, record: target, parametersHash, stateFingerprint, evidence });
    const finalAuthority = await authorize(commitExpected, instant);
    if (finalAuthority === null || !sameAuthority(preliminary, finalAuthority)) {
      return deny("DENY_LIFECYCLE_AUTHORITY", "exact lifecycle authority was revoked, replaced, or not bound at commit");
    }
    const boundaryLedger = readLedgerState(input, target);
    if (
      boundaryLedger.failure || boundaryLedger.changed
      || boundaryLedger.head.headHash !== finalLedger.head.headHash || boundaryLedger.head.count !== finalLedger.head.count
    ) return deny("DENY_LIFECYCLE_CHANGED", "lifecycle changed at the write boundary");

    const eventBody = {
      event_version: 2,
      request_fingerprint: requestHash,
      parameters_hash: parametersHash,
      project_id: input.project_id,
      work_package_id: finalAuthority.work_package_id,
      session_id: finalAuthority.session_id,
      actor_id: finalAuthority.actor_id,
      authority_ref: finalAuthority.authority_ref,
      decision_id: finalAuthority.decision_id,
      producer_actor_id: finalAuthority.producer_actor_id,
      reviewer_actor_id: finalAuthority.reviewer_actor_id,
      approver_actor_id: finalAuthority.approver_actor_id,
      evidence_acceptor_actor_id: evidence.evidence_acceptor_actor_id,
      event_type: input.event_type,
      layer: input.layer,
      memory_record_id: input.memory_record_id,
      memory_record_version: input.memory_record_version,
      target_content_hash: target.content_hash,
      target_record_fingerprint: canonicalFingerprint(target),
      evidence_id: evidence.evidence_id,
      evidence_hash: evidence.evidence_hash,
      preservation_action: evidence.preservation_action,
      reason: input.reason,
      occurred_at: instant.iso,
      ...(needsHold ? { hold_id: input.hold_id } : {}),
      ...(needsManifest ? { redaction_manifest_hash: input.redaction_manifest_hash } : {})
    };
    const event = deepFreeze({ event_id: canonicalFingerprint(eventBody), ...eventBody });
    try {
      const rawReceipt = appendEvent(event, { expectedSequence: boundaryLedger.head.count, idempotencyKey: input.idempotency_key });
      if (rawReceipt?.ok === false) return deepFreeze(rawReceipt);
      const persisted = snapshotIdempotencyRow(lookupIdempotency(input.idempotency_key));
      if (
        persisted === null || persisted === undefined || persisted.event.event_id !== event.event_id
        || persisted.event.request_fingerprint !== requestHash || persisted.sequence !== boundaryLedger.head.count + 1
      ) return deny("DENY_LIFECYCLE_DURABILITY", "lifecycle append was not proven by exact durable readback");
      return deepFreeze({ ok: true, code: "MEMORY_LIFECYCLE_RECORDED", event: persisted.event, receipt: replayReceipt(persisted, false) });
    } catch (cause) {
      const recovered = lookupReplay(input, requestHash);
      if (recovered.row) return deepFreeze({ ok: true, code: "MEMORY_LIFECYCLE_RECORDED", event: recovered.row.event, receipt: replayReceipt(recovered.row, true) });
      return recovered.error ?? deny(cause?.code ?? "DENY_LIFECYCLE_STORE_UNAVAILABLE", "memory lifecycle event was not durably recorded");
    }
  }

  async function resolve(request) {
    const input = snapshotClosed(request, RESOLVE_KEYS);
    if (input === null || !validTarget(input)) return deny("DENY_LIFECYCLE_REQUEST_MALFORMED", "lifecycle resolution request is malformed");
    const initialInstant = trustedInstant(now);
    if (initialInstant === null) return deny("DENY_CLOCK_UNAVAILABLE", "trusted lifecycle clock is unavailable");
    const preExpected = authorityExpected({ phase: "PRECHECK", operation: "memory-lifecycle-resolve", input });
    const preliminary = await authorize(preExpected, initialInstant);
    if (preliminary === null) return deny("DENY_LIFECYCLE_AUTHORITY", "preliminary lifecycle authority was not established");

    const initialRecords = await loadLineage(input);
    if (initialRecords === null) return deny("DENY_LINEAGE_INVALID", "memory lineage could not be established");
    const initialChain = resolveSupersession(initialRecords, input);
    if (!initialChain.ok) return deny(initialChain.code, "memory supersession lineage is not resolvable");
    const initialLedger = readLedgerState(input, initialChain.requested);
    if (initialLedger.failure) return initialLedger.failure;
    if (initialLedger.changed) return deny("DENY_LIFECYCLE_CHANGED", "lifecycle changed during resolution");

    const rawRetention = await callPort(retentionPolicyResolver, {
      project_id: initialChain.requested.project_id,
      memory_record_id: initialChain.requested.memory_record_id,
      memory_record_version: initialChain.requested.version,
      policy_id: initialChain.requested.retention_policy,
      as_of: initialInstant.iso
    }, configuredTimeouts.retention_ms);
    const retention = rawRetention === undefined ? null : snapshotRetention(rawRetention, initialChain.requested);
    if (retention === null) return deny("DENY_RETENTION_POLICY", "exact retention policy was not established");

    const finalRecords = await loadLineage(input);
    if (finalRecords === null) return deny("DENY_LINEAGE_INVALID", "final memory lineage could not be established");
    const chain = resolveSupersession(finalRecords, input);
    if (!chain.ok) return deny(chain.code, "final memory supersession lineage is not resolvable");
    const ledgerState = readLedgerState(input, chain.requested);
    if (ledgerState.failure) return ledgerState.failure;
    if (ledgerState.changed) return deny("DENY_LIFECYCLE_CHANGED", "lifecycle changed during final resolution");
    const preservation = ledgerState.state.activeHolds.size > 0;
    if (ledgerState.state.terminal === "REDACTION_APPLIED") return deny("DENY_MEMORY_REDACTED", "memory record has been redacted", { preservation_required: preservation });
    if (ledgerState.state.terminal === "TOMBSTONED") return deny("DENY_MEMORY_TOMBSTONED", "memory record has been tombstoned", { preservation_required: preservation });
    if (!chain.current) return deny("DENY_MEMORY_SUPERSEDED", "memory record is not the current chain head", { chain_head_id: chain.head.memory_record_id, chain_head_version: chain.head.version, preservation_required: preservation });

    const instant = trustedInstant(now);
    if (instant === null || instant.ms < initialInstant.ms) return deny("DENY_CLOCK_UNAVAILABLE", "trusted lifecycle clock regressed or became unavailable");
    if (!(Date.parse(chain.requested.valid_from) <= instant.ms && instant.ms < Date.parse(chain.requested.valid_until))) {
      return deny("DENY_MEMORY_NOT_TEMPORALLY_VALID", "memory record is outside its validity window", { preservation_required: preservation });
    }
    if (retention.retainUntilMs !== null && instant.ms >= retention.retainUntilMs) {
      return deny("DENY_RETENTION_EXPIRED", "memory retention window has expired", { preservation_required: preservation });
    }
    const parametersHash = canonicalFingerprint({
      operation: "memory-lifecycle-resolve", target_record_fingerprint: canonicalFingerprint(chain.requested),
      retention_decision_id: retention.decision_id, retain_until: retention.retain_until
    });
    const stateFingerprint = canonicalFingerprint({
      lineage: lineageFingerprint(finalRecords), lifecycle_head_hash: ledgerState.head.headHash,
      lifecycle_sequence: ledgerState.head.count, retention_decision_id: retention.decision_id, retain_until: retention.retain_until
    });
    const commitExpected = authorityExpected({ phase: "COMMIT", operation: "memory-lifecycle-resolve", input, record: chain.requested, parametersHash, stateFingerprint });
    const finalAuthority = await authorize(commitExpected, instant);
    if (finalAuthority === null || !sameAuthority(preliminary, finalAuthority)) {
      return deny("DENY_LIFECYCLE_AUTHORITY", "exact lifecycle authority was revoked, replaced, or not bound at return");
    }
    const boundaryLedger = readLedgerState(input, chain.requested);
    if (
      boundaryLedger.failure || boundaryLedger.changed
      || boundaryLedger.head.headHash !== ledgerState.head.headHash || boundaryLedger.head.count !== ledgerState.head.count
    ) return deny("DENY_LIFECYCLE_CHANGED", "lifecycle changed at the return boundary");

    return deepFreeze({
      ok: true,
      code: "MEMORY_EFFECTIVE",
      project_id: chain.requested.project_id,
      layer: chain.requested.layer,
      memory_record_id: chain.requested.memory_record_id,
      memory_record_version: chain.requested.version,
      content_hash: chain.requested.content_hash,
      target_record_fingerprint: canonicalFingerprint(chain.requested),
      authority_decision_id: finalAuthority.decision_id,
      state_fingerprint: stateFingerprint,
      evaluated_at: instant.iso,
      lifecycle_sequence: boundaryLedger.head.count,
      lifecycle_head_hash: boundaryLedger.head.headHash,
      active_legal_hold_count: boundaryLedger.state.activeHolds.size,
      preservation_required: boundaryLedger.state.activeHolds.size > 0
    });
  }

  return Object.freeze({ recordLifecycleEvent, resolve });
}
