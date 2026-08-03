import { createHmac, timingSafeEqual } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { canonicalFingerprint } from "../contracts/canonical-fingerprint.mjs";
import { DurableLedger, LedgerError } from "./durable-ledger.mjs";

export const MEMORY_LIFECYCLE_EVENT_TYPES = Object.freeze([
  "LEGAL_HOLD_PLACED",
  "LEGAL_HOLD_RELEASED",
  "REDACTION_APPLIED",
  "TOMBSTONED"
]);

const COMMON_KEYS = Object.freeze([
  "event_id", "event_version", "request_fingerprint", "parameters_hash",
  "project_id", "work_package_id", "session_id", "actor_id", "authority_ref", "decision_id",
  "producer_actor_id", "reviewer_actor_id", "approver_actor_id", "evidence_acceptor_actor_id",
  "event_type", "layer", "memory_record_id", "memory_record_version", "target_content_hash",
  "target_record_fingerprint", "evidence_id", "evidence_hash", "preservation_action", "reason", "occurred_at"
]);
const OPTIONAL_KEYS = Object.freeze(["hold_id", "redaction_manifest_hash"]);
const STORED_KEYS = Object.freeze([...COMMON_KEYS, ...OPTIONAL_KEYS, "event_mac"]);
const UNSIGNED_KEYS = Object.freeze([...COMMON_KEYS, ...OPTIONAL_KEYS]);
const LAYERS = Object.freeze(["session", "work", "project"]);
const PRESERVATION_ACTIONS = Object.freeze(["NOT_APPLICABLE", "PRESERVE_ORIGINAL"]);
const MAX_ID_LENGTH = 256;
const MAX_REASON_LENGTH = 2_048;
const MAX_LIFECYCLE_EVENTS = 10_000;
const MAX_LEDGER_BYTES = 16 * 1024 * 1024;
const MIN_INTEGRITY_KEY_BYTES = 32;

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

function macFor(key, event) {
  return createHmac("sha256", key).update(JSON.stringify(event), "utf8").digest("hex");
}

function snapshotEvent(value, { integrityKey, requireMac }) {
  if (!isPlainObject(value)) throw new LedgerError("DENY_LIFECYCLE_EVENT_MALFORMED", "memory lifecycle event must be a plain object");
  let snapshot;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error("custom prototype");
    const keys = Reflect.ownKeys(value);
    const allowed = requireMac ? STORED_KEYS : UNSIGNED_KEYS;
    const required = requireMac ? [...COMMON_KEYS, "event_mac"] : COMMON_KEYS;
    if (
      keys.some((key) => typeof key !== "string" || !allowed.includes(key))
      || required.some((key) => !keys.includes(key))
    ) throw new Error("event shape is not exact");
    snapshot = structuredClone(value);
  } catch (cause) {
    throw new LedgerError("DENY_LIFECYCLE_EVENT_MALFORMED", `memory lifecycle event could not be safely inspected: ${cause.message}`);
  }

  const boundedIds = [
    "event_id", "project_id", "work_package_id", "session_id", "actor_id", "authority_ref", "decision_id",
    "producer_actor_id", "reviewer_actor_id", "approver_actor_id", "evidence_acceptor_actor_id",
    "memory_record_id", "evidence_id"
  ];
  if (
    snapshot.event_version !== 2
    || boundedIds.some((key) => !isBoundedString(snapshot[key]))
    || !isSha256(snapshot.request_fingerprint)
    || !isSha256(snapshot.parameters_hash)
    || !MEMORY_LIFECYCLE_EVENT_TYPES.includes(snapshot.event_type)
    || !LAYERS.includes(snapshot.layer)
    || !Number.isSafeInteger(snapshot.memory_record_version)
    || snapshot.memory_record_version < 1
    || !isSha256(snapshot.target_content_hash)
    || !isSha256(snapshot.target_record_fingerprint)
    || !isSha256(snapshot.evidence_hash)
    || !PRESERVATION_ACTIONS.includes(snapshot.preservation_action)
    || !isBoundedString(snapshot.reason, MAX_REASON_LENGTH)
    || !Number.isFinite(Date.parse(snapshot.occurred_at))
    || new Date(Date.parse(snapshot.occurred_at)).toISOString() !== snapshot.occurred_at
  ) throw new LedgerError("DENY_LIFECYCLE_EVENT_MALFORMED", "memory lifecycle event fields are invalid");

  const needsHoldId = snapshot.event_type === "LEGAL_HOLD_PLACED" || snapshot.event_type === "LEGAL_HOLD_RELEASED";
  if (needsHoldId !== Object.prototype.hasOwnProperty.call(snapshot, "hold_id") || (needsHoldId && !isBoundedString(snapshot.hold_id))) {
    throw new LedgerError("DENY_LIFECYCLE_EVENT_MALFORMED", "legal-hold events require exactly one bounded hold_id");
  }
  const needsManifest = snapshot.event_type === "REDACTION_APPLIED";
  if (
    needsManifest !== Object.prototype.hasOwnProperty.call(snapshot, "redaction_manifest_hash")
    || (needsManifest && !isSha256(snapshot.redaction_manifest_hash))
  ) throw new LedgerError("DENY_LIFECYCLE_EVENT_MALFORMED", "redaction events require exactly one sha256 redaction_manifest_hash");

  const { event_id: eventId, event_mac: eventMac, ...identityBody } = snapshot;
  if (eventId !== canonicalFingerprint(identityBody)) {
    throw new LedgerError("LIFECYCLE_EVENT_INTEGRITY_FAILURE", "lifecycle event id does not bind the event body");
  }
  if (requireMac) {
    const unsigned = { event_id: eventId, ...identityBody };
    const expected = macFor(integrityKey, unsigned);
    if (
      !isSha256(eventMac)
      || !timingSafeEqual(Buffer.from(eventMac, "hex"), Buffer.from(expected, "hex"))
    ) throw new LedgerError("LIFECYCLE_EVENT_AUTHENTICITY_FAILURE", "lifecycle event MAC is invalid");
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
  #integrityKey;
  #filePath;

  constructor({ filePath, integrityKey } = {}) {
    super({ filePath, ledgerId: "secb-memory-lifecycle-ledger" });
    let key;
    try {
      if (!(integrityKey instanceof Uint8Array)) throw new Error("not bytes");
      key = Buffer.from(integrityKey);
    } catch {
      throw new LedgerError("INVALID_LIFECYCLE_INTEGRITY_KEY", "integrityKey must be server-owned bytes");
    }
    if (key.length < MIN_INTEGRITY_KEY_BYTES) {
      throw new LedgerError("INVALID_LIFECYCLE_INTEGRITY_KEY", `integrityKey must contain at least ${MIN_INTEGRITY_KEY_BYTES} bytes`);
    }
    this.#integrityKey = key;
    this.#filePath = resolve(filePath);
  }

  #assertFileBounded(additionalBytes = 0) {
    const current = existsSync(this.#filePath) ? statSync(this.#filePath).size : 0;
    if (current + additionalBytes > MAX_LEDGER_BYTES) {
      throw new LedgerError("LIFECYCLE_LEDGER_RESOURCE_LIMIT", "memory lifecycle ledger byte limit would be exceeded");
    }
  }

  verify() {
    this.#assertFileBounded();
    const result = super.verify();
    if (result.count > MAX_LIFECYCLE_EVENTS) throw new LedgerError("LIFECYCLE_LEDGER_RESOURCE_LIMIT", "memory lifecycle event limit exceeded");
    return result;
  }

  read() {
    this.#assertFileBounded();
    const records = super.read();
    if (records.length > MAX_LIFECYCLE_EVENTS) throw new LedgerError("LIFECYCLE_LEDGER_RESOURCE_LIMIT", "memory lifecycle event limit exceeded");
    return records;
  }

  appendLifecycleEvent(event, { expectedSequence, idempotencyKey } = {}) {
    const unsigned = snapshotEvent(event, { integrityKey: this.#integrityKey, requireMac: false });
    if (!isBoundedString(idempotencyKey, 512)) {
      throw new LedgerError("DENY_MISSING_ENTRY_FIELDS", "a bounded idempotencyKey is required for memory lifecycle append");
    }
    const signed = deepFreeze({ ...unsigned, event_mac: macFor(this.#integrityKey, unsigned) });
    this.#assertFileBounded(Buffer.byteLength(JSON.stringify(lifecycleEntry(signed, idempotencyKey)), "utf8") * 4 + 4_096);
    return this.append(lifecycleEntry(signed, idempotencyKey), {
      expectedSequence,
      preWriteCheck: (records) => {
        if (records.length >= MAX_LIFECYCLE_EVENTS) {
          return deepFreeze({ ok: false, code: "LIFECYCLE_LEDGER_RESOURCE_LIMIT", message: "memory lifecycle event limit reached" });
        }
        const prior = [];
        for (const record of records) {
          let candidate;
          try {
            candidate = snapshotEvent(record?.entry?.payload, { integrityKey: this.#integrityKey, requireMac: true });
          } catch (cause) {
            throw new LedgerError(cause?.code ?? "LIFECYCLE_LEDGER_CONTRACT_FAILURE", "stored lifecycle event failed authenticity or contract validation");
          }
          if (sameTarget(candidate, signed)) prior.push(candidate);
        }
        if (prior.some((candidate) => (
          candidate.target_content_hash !== signed.target_content_hash
          || candidate.target_record_fingerprint !== signed.target_record_fingerprint
        ))) return deepFreeze({ ok: false, code: "DENY_LIFECYCLE_TARGET_DRIFT", message: "lifecycle target fingerprint changed" });

        const activeHolds = new Set();
        let terminal = null;
        for (const candidate of prior) {
          if (candidate.event_type === "LEGAL_HOLD_PLACED") activeHolds.add(candidate.hold_id);
          if (candidate.event_type === "LEGAL_HOLD_RELEASED") activeHolds.delete(candidate.hold_id);
          if (candidate.event_type === "REDACTION_APPLIED" || candidate.event_type === "TOMBSTONED") terminal = candidate.event_type;
        }
        if (signed.event_type === "LEGAL_HOLD_PLACED" && activeHolds.has(signed.hold_id)) {
          return deepFreeze({ ok: false, code: "DENY_LEGAL_HOLD_ALREADY_ACTIVE", message: "legal hold is already active" });
        }
        if (signed.event_type === "LEGAL_HOLD_RELEASED" && !activeHolds.has(signed.hold_id)) {
          return deepFreeze({ ok: false, code: "DENY_LEGAL_HOLD_NOT_ACTIVE", message: "legal hold is not active" });
        }
        if ((signed.event_type === "REDACTION_APPLIED" || signed.event_type === "TOMBSTONED") && terminal !== null) {
          return deepFreeze({ ok: false, code: "DENY_LIFECYCLE_TERMINAL", message: `record already has terminal lifecycle state ${terminal}` });
        }
        return null;
      }
    });
  }

  #validatedRecords() {
    return this.read().map((record) => {
      try {
        return { record, event: snapshotEvent(record.entry.payload, { integrityKey: this.#integrityKey, requireMac: true }) };
      } catch (cause) {
        throw new LedgerError(cause?.code ?? "LIFECYCLE_LEDGER_CONTRACT_FAILURE", "stored lifecycle event failed authenticity or contract validation");
      }
    });
  }

  readLifecycleEvents(selector = {}) {
    if (!isPlainObject(selector)) throw new LedgerError("DENY_LIFECYCLE_SELECTOR_MALFORMED", "lifecycle selector must be a plain object");
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
    const selected = this.#validatedRecords()
      .filter(({ event }) => Object.entries(snapshot).every(([key, value]) => event[key] === value))
      .map(({ record, event }) => ({ sequence: record.sequence, event }));
    if (selected.length > MAX_LIFECYCLE_EVENTS) throw new LedgerError("LIFECYCLE_LEDGER_RESOURCE_LIMIT", "selected lifecycle event limit exceeded");
    return deepFreeze(structuredClone(selected));
  }

  readLifecycleEventByIdempotencyKey(idempotencyKey) {
    if (!isBoundedString(idempotencyKey, 512)) throw new LedgerError("DENY_LIFECYCLE_SELECTOR_MALFORMED", "bounded idempotency key is required");
    const match = this.#validatedRecords().find(({ record }) => record.entry.idempotencyKey === idempotencyKey);
    if (match === undefined) return null;
    return deepFreeze({
      sequence: match.record.sequence,
      record_hash: match.record.recordHash,
      entry_hash: match.record.entryHash,
      idempotency_key: match.record.entry.idempotencyKey,
      event: structuredClone(match.event)
    });
  }
}
