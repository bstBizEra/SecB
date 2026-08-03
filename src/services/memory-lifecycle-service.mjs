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
  "decision", "code", "operation", "project_id", "layer", "memory_record_id", "memory_record_version",
  "event_type", "actor_id", "work_package_id", "session_id", "authority_ref", "valid_from", "valid_until"
]);
const RETENTION_KEYS = Object.freeze([
  "decision", "code", "project_id", "memory_record_id", "memory_record_version", "policy_id", "retain_until"
]);
const MAX_LINEAGE_RECORDS = 10_000;

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isNonBlank = (value) => typeof value === "string" && value.trim() !== "";
const isSha256 = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const deny = (code, message, extra = {}) => deepFreeze({ ok: false, code, message, ...extra });

function snapshotClosed(value, allowedKeys, requiredKeys, code, label) {
  if (!isPlainObject(value)) return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(value);
    if (
      keys.some((key) => typeof key !== "string" || !allowedKeys.includes(key))
      || requiredKeys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
    ) return null;
    return structuredClone(value);
  } catch {
    void code;
    void label;
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

function validTarget(input) {
  return isNonBlank(input?.project_id)
    && LAYERS.includes(input?.layer)
    && isNonBlank(input?.memory_record_id)
    && Number.isSafeInteger(input?.memory_record_version)
    && input.memory_record_version >= 1;
}

function snapshotAuthority(value, expected, instant) {
  const authority = snapshotClosed(value, AUTHORITY_KEYS, AUTHORITY_KEYS, "DENY_AUTHORITY_MALFORMED", "authority decision");
  if (authority === null) return null;
  const fromMs = Date.parse(authority.valid_from);
  const untilMs = Date.parse(authority.valid_until);
  if (
    authority.decision !== "ALLOW"
    || !isNonBlank(authority.code)
    || authority.operation !== expected.operation
    || authority.project_id !== expected.project_id
    || authority.layer !== expected.layer
    || authority.memory_record_id !== expected.memory_record_id
    || authority.memory_record_version !== expected.memory_record_version
    || authority.event_type !== expected.event_type
    || !isNonBlank(authority.actor_id)
    || !isNonBlank(authority.work_package_id)
    || !isNonBlank(authority.session_id)
    || !isNonBlank(authority.authority_ref)
    || !Number.isFinite(fromMs)
    || !Number.isFinite(untilMs)
    || new Date(fromMs).toISOString() !== authority.valid_from
    || new Date(untilMs).toISOString() !== authority.valid_until
    || fromMs > instant.ms
    || instant.ms >= untilMs
  ) return null;
  return authority;
}

function snapshotLineage(value, target) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_LINEAGE_RECORDS) return null;
  let records;
  try {
    records = structuredClone(value);
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
  for (const group of groups.values()) group.sort((left, right) => left.version - right.version);
  const requested = records.find((record) => record.memory_record_id === target.memory_record_id && record.version === target.memory_record_version);
  if (requested === undefined) return { ok: false, code: "DENY_MEMORY_RECORD_NOT_FOUND" };

  const nodeKey = (record) => `${record.memory_record_id}\u0000${record.version}`;
  const childByParent = new Map();
  const addEdge = (parent, child) => {
    const parentKey = nodeKey(parent);
    const existing = childByParent.get(parentKey);
    if (existing !== undefined && nodeKey(existing) !== nodeKey(child)) return false;
    childByParent.set(parentKey, child);
    return true;
  };

  for (const group of groups.values()) {
    for (let index = 1; index < group.length; index += 1) {
      if (group[index].version === group[index - 1].version || !addEdge(group[index - 1], group[index])) {
        return { ok: false, code: "DENY_LINEAGE_FORK" };
      }
    }
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

  const visited = new Set();
  for (const record of records) {
    let cursor = record;
    visited.clear();
    while (childByParent.has(nodeKey(cursor))) {
      const key = nodeKey(cursor);
      if (visited.has(key)) return { ok: false, code: "DENY_LINEAGE_CYCLE" };
      visited.add(key);
      cursor = childByParent.get(key);
    }
  }

  let head = requested;
  while (childByParent.has(nodeKey(head))) head = childByParent.get(nodeKey(head));
  return { ok: true, requested, head, current: head.memory_record_id === requested.memory_record_id && head.version === requested.version };
}

function lifecycleState(events, targetHash) {
  const activeHolds = new Set();
  let terminal = null;
  for (const row of events) {
    const event = row?.event;
    if (!isPlainObject(event) || event.target_content_hash !== targetHash) return null;
    if (event.event_type === "LEGAL_HOLD_PLACED") activeHolds.add(event.hold_id);
    else if (event.event_type === "LEGAL_HOLD_RELEASED") activeHolds.delete(event.hold_id);
    else if (event.event_type === "REDACTION_APPLIED" || event.event_type === "TOMBSTONED") terminal = event.event_type;
  }
  return { activeHoldCount: activeHolds.size, terminal };
}

export class MemoryLifecycleConfigurationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MemoryLifecycleConfigurationError";
    this.code = code;
  }
}

export function createMemoryLifecycleService({ ledger, authorityResolver, recordResolver, retentionPolicyResolver, now } = {}) {
  let appendLifecycleEvent;
  let readLifecycleEvents;
  let verifyLedger;
  try {
    appendLifecycleEvent = ledger?.appendLifecycleEvent;
    readLifecycleEvents = ledger?.readLifecycleEvents;
    verifyLedger = ledger?.verify;
  } catch {
    throw new MemoryLifecycleConfigurationError("INVALID_LIFECYCLE_LEDGER", "lifecycle ledger could not be inspected");
  }
  if (
    ledger === null
    || typeof ledger !== "object"
    || Array.isArray(ledger)
    || typeof appendLifecycleEvent !== "function"
    || typeof readLifecycleEvents !== "function"
    || typeof verifyLedger !== "function"
  ) throw new MemoryLifecycleConfigurationError("INVALID_LIFECYCLE_LEDGER", "ledger must expose appendLifecycleEvent(), readLifecycleEvents(), and verify()");
  if (typeof authorityResolver !== "function") throw new MemoryLifecycleConfigurationError("INVALID_AUTHORITY_RESOLVER", "authorityResolver is required");
  if (typeof recordResolver !== "function") throw new MemoryLifecycleConfigurationError("INVALID_RECORD_RESOLVER", "recordResolver is required");
  if (typeof retentionPolicyResolver !== "function") throw new MemoryLifecycleConfigurationError("INVALID_RETENTION_RESOLVER", "retentionPolicyResolver is required");
  if (typeof now !== "function") throw new MemoryLifecycleConfigurationError("INVALID_CLOCK", "now() trusted clock is required");

  const appendEvent = Function.prototype.bind.call(appendLifecycleEvent, ledger);
  const readEvents = Function.prototype.bind.call(readLifecycleEvents, ledger);
  const verify = Function.prototype.bind.call(verifyLedger, ledger);

  async function authorize(expected, instant) {
    let raw;
    try {
      raw = await authorityResolver(deepFreeze(structuredClone(expected)));
    } catch {
      return null;
    }
    return snapshotAuthority(raw, expected, instant);
  }

  async function loadLineage(target) {
    let raw;
    try {
      raw = await recordResolver(deepFreeze({ project_id: target.project_id, layer: target.layer }));
    } catch {
      return null;
    }
    return snapshotLineage(raw, target);
  }

  async function recordLifecycleEvent(request) {
    const input = snapshotClosed(
      request,
      [...COMMON_MUTATION_KEYS, ...OPTIONAL_MUTATION_KEYS],
      COMMON_MUTATION_KEYS,
      "DENY_LIFECYCLE_REQUEST_MALFORMED",
      "lifecycle request"
    );
    if (
      input === null
      || !validTarget(input)
      || !MUTATION_TYPES.includes(input.event_type)
      || !isNonBlank(input.reason)
      || !isNonBlank(input.idempotency_key)
    ) return deny("DENY_LIFECYCLE_REQUEST_MALFORMED", "lifecycle request is malformed");
    const needsHold = input.event_type === "LEGAL_HOLD_PLACED" || input.event_type === "LEGAL_HOLD_RELEASED";
    const hasHold = Object.prototype.hasOwnProperty.call(input, "hold_id");
    const needsManifest = input.event_type === "REDACTION_APPLIED";
    const hasManifest = Object.prototype.hasOwnProperty.call(input, "redaction_manifest_hash");
    if (
      needsHold !== hasHold || (needsHold && !isNonBlank(input.hold_id))
      || needsManifest !== hasManifest || (needsManifest && !isSha256(input.redaction_manifest_hash))
    ) return deny("DENY_LIFECYCLE_REQUEST_MALFORMED", "event-specific lifecycle fields are malformed");

    const initialInstant = trustedInstant(now);
    if (initialInstant === null) return deny("DENY_CLOCK_UNAVAILABLE", "trusted lifecycle clock is unavailable");
    const expected = {
      operation: "memory-lifecycle-mutate",
      project_id: input.project_id,
      layer: input.layer,
      memory_record_id: input.memory_record_id,
      memory_record_version: input.memory_record_version,
      event_type: input.event_type
    };
    const authority = await authorize(expected, initialInstant);
    if (authority === null) return deny("DENY_LIFECYCLE_AUTHORITY", "exact current lifecycle authority was not established");

    const lineage = await loadLineage(input);
    if (lineage === null) return deny("DENY_LINEAGE_INVALID", "memory lineage could not be established");
    const chain = resolveSupersession(lineage, input);
    if (!chain.ok) return deny(chain.code, "memory supersession lineage is not resolvable");
    const target = chain.requested;

    const instant = trustedInstant(now);
    if (instant === null || instant.ms < initialInstant.ms || snapshotAuthority(authority, expected, instant) === null) {
      return deny("DENY_LIFECYCLE_AUTHORITY", "lifecycle authority changed or expired before the write boundary");
    }

    const eventBody = {
      event_version: 1,
      project_id: input.project_id,
      work_package_id: authority.work_package_id,
      session_id: authority.session_id,
      actor_id: authority.actor_id,
      authority_ref: authority.authority_ref,
      event_type: input.event_type,
      layer: input.layer,
      memory_record_id: input.memory_record_id,
      memory_record_version: input.memory_record_version,
      target_content_hash: target.content_hash,
      reason: input.reason,
      occurred_at: instant.iso,
      ...(needsHold ? { hold_id: input.hold_id } : {}),
      ...(needsManifest ? { redaction_manifest_hash: input.redaction_manifest_hash } : {})
    };
    const event = deepFreeze({ event_id: canonicalFingerprint(eventBody), ...eventBody });
    try {
      const state = verify();
      const receipt = appendEvent(event, { expectedSequence: state.count, idempotencyKey: input.idempotency_key });
      if (receipt?.ok === false) return deepFreeze(receipt);
      return deepFreeze({ ok: true, code: "MEMORY_LIFECYCLE_RECORDED", event, receipt: structuredClone(receipt) });
    } catch (cause) {
      return deny(cause?.code ?? "DENY_LIFECYCLE_STORE_UNAVAILABLE", "memory lifecycle event was not durably recorded");
    }
  }

  async function resolve(request) {
    const input = snapshotClosed(request, RESOLVE_KEYS, RESOLVE_KEYS, "DENY_LIFECYCLE_REQUEST_MALFORMED", "lifecycle resolution request");
    if (input === null || !validTarget(input)) return deny("DENY_LIFECYCLE_REQUEST_MALFORMED", "lifecycle resolution request is malformed");
    const initialInstant = trustedInstant(now);
    if (initialInstant === null) return deny("DENY_CLOCK_UNAVAILABLE", "trusted lifecycle clock is unavailable");
    const expected = {
      operation: "memory-lifecycle-resolve",
      project_id: input.project_id,
      layer: input.layer,
      memory_record_id: input.memory_record_id,
      memory_record_version: input.memory_record_version,
      event_type: null
    };
    const authority = await authorize(expected, initialInstant);
    if (authority === null) return deny("DENY_LIFECYCLE_AUTHORITY", "exact current lifecycle authority was not established");

    const records = await loadLineage(input);
    if (records === null) return deny("DENY_LINEAGE_INVALID", "memory lineage could not be established");
    const chain = resolveSupersession(records, input);
    if (!chain.ok) return deny(chain.code, "memory supersession lineage is not resolvable");

    let events;
    let lifecycleHead;
    try {
      const before = verify();
      events = readEvents(input);
      const after = verify();
      if (before.count !== after.count || before.headHash !== after.headHash) {
        return deny("DENY_LIFECYCLE_CHANGED", "memory lifecycle changed during resolution");
      }
      lifecycleHead = after;
    } catch (cause) {
      return deny(cause?.code ?? "DENY_LIFECYCLE_STORE_UNAVAILABLE", "memory lifecycle ledger could not be read");
    }
    const state = lifecycleState(events, chain.requested.content_hash);
    if (state === null) return deny("DENY_LIFECYCLE_TARGET_DRIFT", "lifecycle events are not bound to the immutable target");
    const preservation = state.activeHoldCount > 0;

    if (state.terminal === "REDACTION_APPLIED") return deny("DENY_MEMORY_REDACTED", "memory record has been redacted", { preservation_required: preservation });
    if (state.terminal === "TOMBSTONED") return deny("DENY_MEMORY_TOMBSTONED", "memory record has been tombstoned", { preservation_required: preservation });
    if (!chain.current) {
      return deny("DENY_MEMORY_SUPERSEDED", "memory record is not the current chain head", {
        chain_head_id: chain.head.memory_record_id,
        chain_head_version: chain.head.version,
        preservation_required: preservation
      });
    }

    let rawRetention;
    try {
      rawRetention = await retentionPolicyResolver(deepFreeze({
        project_id: chain.requested.project_id,
        memory_record_id: chain.requested.memory_record_id,
        memory_record_version: chain.requested.version,
        policy_id: chain.requested.retention_policy,
        as_of: initialInstant.iso
      }));
    } catch {
      return deny("DENY_RETENTION_POLICY", "retention policy could not be resolved", { preservation_required: preservation });
    }
    const retention = snapshotClosed(rawRetention, RETENTION_KEYS, RETENTION_KEYS, "DENY_RETENTION_POLICY", "retention decision");
    const retainUntilMs = retention === null || retention.retain_until === null ? Number.NaN : Date.parse(retention.retain_until);
    if (
      retention === null
      || retention.decision !== "ALLOW"
      || !isNonBlank(retention.code)
      || retention.project_id !== chain.requested.project_id
      || retention.memory_record_id !== chain.requested.memory_record_id
      || retention.memory_record_version !== chain.requested.version
      || retention.policy_id !== chain.requested.retention_policy
      || (retention.retain_until !== null && (
        !Number.isFinite(retainUntilMs)
        || new Date(retainUntilMs).toISOString() !== retention.retain_until
      ))
    ) return deny("DENY_RETENTION_POLICY", "exact retention policy was not established", { preservation_required: preservation });
    const instant = trustedInstant(now);
    if (instant === null || instant.ms < initialInstant.ms || snapshotAuthority(authority, expected, instant) === null) {
      return deny("DENY_LIFECYCLE_AUTHORITY", "lifecycle authority changed or expired before the resolution boundary", { preservation_required: preservation });
    }
    const validFromMs = Date.parse(chain.requested.valid_from);
    const validUntilMs = Date.parse(chain.requested.valid_until);
    if (!(validFromMs <= instant.ms && instant.ms < validUntilMs)) {
      return deny("DENY_MEMORY_NOT_TEMPORALLY_VALID", "memory record is outside its validity window", { preservation_required: preservation });
    }
    if (retention.retain_until !== null && instant.ms >= retainUntilMs) {
      return deny("DENY_RETENTION_EXPIRED", "memory retention window has expired", { preservation_required: preservation });
    }

    return deepFreeze({
      ok: true,
      code: "MEMORY_EFFECTIVE",
      project_id: chain.requested.project_id,
      layer: chain.requested.layer,
      memory_record_id: chain.requested.memory_record_id,
      memory_record_version: chain.requested.version,
      content_hash: chain.requested.content_hash,
      evaluated_at: instant.iso,
      lifecycle_sequence: lifecycleHead.count,
      lifecycle_head_hash: lifecycleHead.headHash,
      active_legal_hold_count: state.activeHoldCount,
      preservation_required: preservation
    });
  }

  return Object.freeze({ recordLifecycleEvent, resolve });
}
