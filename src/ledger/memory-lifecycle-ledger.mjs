import { DurableLedger, LedgerError } from "./durable-ledger.mjs";

export const MEMORY_LIFECYCLE_EVENT_TYPES = Object.freeze([
  "LEGAL_HOLD_PLACED",
  "LEGAL_HOLD_RELEASED",
  "REDACTION_APPLIED",
  "TOMBSTONED"
]);

const COMMON_KEYS = Object.freeze([
  "event_id",
  "event_version",
  "project_id",
  "work_package_id",
  "session_id",
  "actor_id",
  "authority_ref",
  "event_type",
  "layer",
  "memory_record_id",
  "memory_record_version",
  "target_content_hash",
  "reason",
  "occurred_at"
]);
const OPTIONAL_KEYS = Object.freeze(["hold_id", "redaction_manifest_hash"]);
const ALLOWED_KEYS = Object.freeze([...COMMON_KEYS, ...OPTIONAL_KEYS]);
const LAYERS = Object.freeze(["session", "work", "project"]);

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

function snapshotEvent(value) {
  if (!isPlainObject(value)) {
    throw new LedgerError("DENY_LIFECYCLE_EVENT_MALFORMED", "memory lifecycle event must be a plain object");
  }
  let keys;
  let snapshot;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error("custom prototype");
    keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string" || !ALLOWED_KEYS.includes(key))) {
      throw new Error("unknown or symbol-keyed field");
    }
    snapshot = structuredClone(value);
  } catch (cause) {
    throw new LedgerError("DENY_LIFECYCLE_EVENT_MALFORMED", `memory lifecycle event could not be safely inspected: ${cause.message}`);
  }
  if (COMMON_KEYS.some((key) => !Object.prototype.hasOwnProperty.call(snapshot, key))) {
    throw new LedgerError("DENY_LIFECYCLE_EVENT_MALFORMED", "memory lifecycle event is missing required fields");
  }
  if (
    !isNonBlank(snapshot.event_id)
    || snapshot.event_version !== 1
    || !isNonBlank(snapshot.project_id)
    || !isNonBlank(snapshot.work_package_id)
    || !isNonBlank(snapshot.session_id)
    || !isNonBlank(snapshot.actor_id)
    || !isNonBlank(snapshot.authority_ref)
    || !MEMORY_LIFECYCLE_EVENT_TYPES.includes(snapshot.event_type)
    || !LAYERS.includes(snapshot.layer)
    || !isNonBlank(snapshot.memory_record_id)
    || !Number.isSafeInteger(snapshot.memory_record_version)
    || snapshot.memory_record_version < 1
    || !isSha256(snapshot.target_content_hash)
    || !isNonBlank(snapshot.reason)
    || !Number.isFinite(Date.parse(snapshot.occurred_at))
    || new Date(Date.parse(snapshot.occurred_at)).toISOString() !== snapshot.occurred_at
  ) {
    throw new LedgerError("DENY_LIFECYCLE_EVENT_MALFORMED", "memory lifecycle event fields are invalid");
  }

  const needsHoldId = snapshot.event_type === "LEGAL_HOLD_PLACED" || snapshot.event_type === "LEGAL_HOLD_RELEASED";
  if (needsHoldId !== Object.prototype.hasOwnProperty.call(snapshot, "hold_id") || (needsHoldId && !isNonBlank(snapshot.hold_id))) {
    throw new LedgerError("DENY_LIFECYCLE_EVENT_MALFORMED", "legal-hold events require exactly one non-blank hold_id");
  }
  const needsManifest = snapshot.event_type === "REDACTION_APPLIED";
  if (
    needsManifest !== Object.prototype.hasOwnProperty.call(snapshot, "redaction_manifest_hash")
    || (needsManifest && !isSha256(snapshot.redaction_manifest_hash))
  ) {
    throw new LedgerError("DENY_LIFECYCLE_EVENT_MALFORMED", "redaction events require exactly one sha256 redaction_manifest_hash");
  }
  return deepFreeze(snapshot);
}

function sameTarget(left, right) {
  return left.project_id === right.project_id
    && left.layer === right.layer
    && left.memory_record_id === right.memory_record_id
    && left.memory_record_version === right.memory_record_version;
}

function lifecycleEntry(event, idempotencyKey) {
  return {
    entryId: event.event_id,
    projectId: event.project_id,
    workPackageId: event.work_package_id,
    sessionId: event.session_id,
    actorId: event.actor_id,
    type: `MEMORY_${event.event_type}`,
    payload: event,
    timestamp: event.occurred_at,
    idempotencyKey
  };
}

export class MemoryLifecycleLedger extends DurableLedger {
  constructor({ filePath } = {}) {
    super({ filePath, ledgerId: "secb-memory-lifecycle-ledger" });
  }

  appendLifecycleEvent(event, { expectedSequence, idempotencyKey } = {}) {
    const snapshot = snapshotEvent(event);
    if (!isNonBlank(idempotencyKey)) {
      throw new LedgerError("DENY_MISSING_ENTRY_FIELDS", "idempotencyKey is required for memory lifecycle append");
    }
    return this.append(lifecycleEntry(snapshot, idempotencyKey), {
      expectedSequence,
      preWriteCheck: (records) => {
        const prior = [];
        for (const record of records) {
          let candidate;
          try {
            candidate = snapshotEvent(record?.entry?.payload);
          } catch {
            throw new LedgerError("LIFECYCLE_LEDGER_CONTRACT_FAILURE", "stored lifecycle event failed its closed contract");
          }
          if (sameTarget(candidate, snapshot)) prior.push(candidate);
        }
        if (prior.some((candidate) => candidate.target_content_hash !== snapshot.target_content_hash)) {
          return deepFreeze({ ok: false, code: "DENY_LIFECYCLE_TARGET_DRIFT", message: "lifecycle target content hash changed" });
        }

        const activeHolds = new Set();
        let terminal = null;
        for (const candidate of prior) {
          if (candidate.event_type === "LEGAL_HOLD_PLACED") activeHolds.add(candidate.hold_id);
          if (candidate.event_type === "LEGAL_HOLD_RELEASED") activeHolds.delete(candidate.hold_id);
          if (candidate.event_type === "REDACTION_APPLIED" || candidate.event_type === "TOMBSTONED") terminal = candidate.event_type;
        }
        if (snapshot.event_type === "LEGAL_HOLD_PLACED" && activeHolds.has(snapshot.hold_id)) {
          return deepFreeze({ ok: false, code: "DENY_LEGAL_HOLD_ALREADY_ACTIVE", message: "legal hold is already active" });
        }
        if (snapshot.event_type === "LEGAL_HOLD_RELEASED" && !activeHolds.has(snapshot.hold_id)) {
          return deepFreeze({ ok: false, code: "DENY_LEGAL_HOLD_NOT_ACTIVE", message: "legal hold is not active" });
        }
        if ((snapshot.event_type === "REDACTION_APPLIED" || snapshot.event_type === "TOMBSTONED") && terminal !== null) {
          return deepFreeze({ ok: false, code: "DENY_LIFECYCLE_TERMINAL", message: `record already has terminal lifecycle state ${terminal}` });
        }
        return null;
      }
    });
  }

  readLifecycleEvents(selector = {}) {
    if (!isPlainObject(selector)) {
      throw new LedgerError("DENY_LIFECYCLE_SELECTOR_MALFORMED", "lifecycle selector must be a plain object");
    }
    const allowed = ["project_id", "layer", "memory_record_id", "memory_record_version"];
    let snapshot;
    try {
      const prototype = Object.getPrototypeOf(selector);
      if (prototype !== Object.prototype && prototype !== null) throw new Error("custom prototype");
      const keys = Reflect.ownKeys(selector);
      if (keys.some((key) => typeof key !== "string" || !allowed.includes(key))) throw new Error("unknown selector field");
      snapshot = structuredClone(selector);
    } catch {
      throw new LedgerError("DENY_LIFECYCLE_SELECTOR_MALFORMED", "lifecycle selector could not be safely inspected");
    }
    const records = this.read();
    const selected = records.map((record) => {
      try {
        return { sequence: record.sequence, event: snapshotEvent(record.entry.payload) };
      } catch {
        throw new LedgerError("LIFECYCLE_LEDGER_CONTRACT_FAILURE", "stored lifecycle event failed its closed contract");
      }
    }).filter(({ event }) => Object.entries(snapshot).every(([key, value]) => event[key] === value));
    return deepFreeze(structuredClone(selected));
  }
}
