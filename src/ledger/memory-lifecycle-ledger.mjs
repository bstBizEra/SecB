import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { canonicalFingerprint } from "../contracts/canonical-fingerprint.mjs";
import { DurableLedger, LedgerError, ZERO_HASH } from "./durable-ledger.mjs";

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
const LEDGER_ID = "secb-memory-lifecycle-ledger";
const MAX_APPEND_ATTEMPTS = 64;
const MAX_RETRY_DELAY_MS = 16;

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

function boundedBackoff(attempt) {
  const delayMs = Math.min(2 ** Math.min(attempt, 4), MAX_RETRY_DELAY_MS);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
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
  #snapshotAnchor;
  #prepareAnchor;
  #markAnchorDurable;
  #finalizeAnchor;
  #boundaryPath;
  #boundaryContext = new AsyncLocalStorage();
  #boundaryInstance = Symbol("memory-lifecycle-ledger-instance");

  constructor({ filePath, integrityKey, headAnchor } = {}) {
    super({ filePath, ledgerId: LEDGER_ID });
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
    this.#boundaryPath = `${this.#filePath}.boundary.lock`;
    let snapshotAnchor;
    let prepareAnchor;
    let markAnchorDurable;
    let finalizeAnchor;
    try {
      snapshotAnchor = headAnchor?.snapshot;
      prepareAnchor = headAnchor?.prepare;
      markAnchorDurable = headAnchor?.markDurable;
      finalizeAnchor = headAnchor?.finalize;
    } catch {
      throw new LedgerError("INVALID_LIFECYCLE_HEAD_ANCHOR", "headAnchor could not be safely inspected");
    }
    if ([snapshotAnchor, prepareAnchor, markAnchorDurable, finalizeAnchor].some((operation) => typeof operation !== "function")) {
      throw new LedgerError("INVALID_LIFECYCLE_HEAD_ANCHOR", "a transactional independent monotonic headAnchor is required");
    }
    this.#snapshotAnchor = Function.prototype.bind.call(snapshotAnchor, headAnchor);
    this.#prepareAnchor = Function.prototype.bind.call(prepareAnchor, headAnchor);
    this.#markAnchorDurable = Function.prototype.bind.call(markAnchorDurable, headAnchor);
    this.#finalizeAnchor = Function.prototype.bind.call(finalizeAnchor, headAnchor);
  }

  #acquireBoundary() {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        mkdirSync(this.#boundaryPath);
        writeFileSync(`${this.#boundaryPath}/owner.json`, JSON.stringify({ pid: process.pid, nonce: randomUUID() }), { flag: "wx" });
        return;
      } catch (cause) {
        if (cause?.code !== "EEXIST") {
          rmSync(this.#boundaryPath, { recursive: true, force: true });
          throw new LedgerError(cause?.code ?? "LIFECYCLE_BOUNDARY_UNAVAILABLE", "memory lifecycle boundary could not be acquired");
        }
        let owner;
        try { owner = JSON.parse(readFileSync(`${this.#boundaryPath}/owner.json`, "utf8")); } catch {
          throw new LedgerError("LIFECYCLE_BOUNDARY_BUSY", "memory lifecycle boundary ownership is not yet readable");
        }
        if (!Number.isSafeInteger(owner?.pid) || owner.pid < 1) {
          throw new LedgerError("LIFECYCLE_BOUNDARY_BUSY", "memory lifecycle boundary ownership is malformed");
        }
        try { process.kill(owner.pid, 0); throw new LedgerError("LIFECYCLE_BOUNDARY_BUSY", "memory lifecycle boundary is owned by a live process"); }
        catch (probe) {
          if (probe instanceof LedgerError || probe?.code !== "ESRCH") {
            throw probe instanceof LedgerError ? probe
              : new LedgerError("LIFECYCLE_BOUNDARY_BUSY", "memory lifecycle boundary owner could not be disproved");
          }
        }
        const stalePath = `${this.#boundaryPath}.stale-${process.pid}-${randomUUID()}`;
        try { renameSync(this.#boundaryPath, stalePath); rmSync(stalePath, { recursive: true, force: true }); }
        catch { throw new LedgerError("LIFECYCLE_BOUNDARY_BUSY", "stale lifecycle boundary could not be reclaimed atomically"); }
      }
    }
    throw new LedgerError("LIFECYCLE_BOUNDARY_BUSY", "memory lifecycle boundary could not be acquired");
  }

  #withBoundarySync(operation) {
    const inherited = this.#boundaryContext.getStore();
    if (inherited?.instance === this.#boundaryInstance && inherited.active === true) return operation();
    for (let attempt = 0; attempt < MAX_APPEND_ATTEMPTS; attempt += 1) {
      try {
        this.#acquireBoundary();
        const token = { instance: this.#boundaryInstance, active: true };
        try { return this.#boundaryContext.run(token, operation); }
        finally { token.active = false; rmSync(this.#boundaryPath, { recursive: true, force: true }); }
      } catch (cause) {
        if (cause?.code !== "LIFECYCLE_BOUNDARY_BUSY") throw cause;
        boundedBackoff(attempt);
      }
    }
    throw new LedgerError("LIFECYCLE_BOUNDARY_BUSY", "memory lifecycle boundary remained busy past its bounded retry deadline");
  }

  async withBoundaryLease(operation) {
    if (typeof operation !== "function") throw new LedgerError("LIFECYCLE_BOUNDARY_REQUEST_INVALID", "boundary operation is required");
    const inherited = this.#boundaryContext.getStore();
    if (inherited?.instance === this.#boundaryInstance && inherited.active === true) return operation();
    this.#acquireBoundary();
    const token = { instance: this.#boundaryInstance, active: true };
    try { return await this.#boundaryContext.run(token, operation); }
    finally { token.active = false; rmSync(this.#boundaryPath, { recursive: true, force: true }); }
  }

  #anchorSnapshot() {
    let value;
    try { value = structuredClone(this.#snapshotAnchor()); } catch {
      throw new LedgerError("LIFECYCLE_ANCHOR_UNAVAILABLE", "lifecycle transactional head anchor could not be read");
    }
    const current = value?.current;
    const pending = value?.pending;
    const currentValid = isPlainObject(current) && Reflect.ownKeys(current).length === 2
      && Number.isSafeInteger(current.count) && current.count >= 0 && isSha256(current.headHash);
    const pendingValid = pending === null || (isPlainObject(pending) && Reflect.ownKeys(pending).length === 5
      && Number.isSafeInteger(pending.count) && currentValid && pending.count === current.count + 1
      && isSha256(pending.headHash) && isSha256(pending.commitment)
      && isPlainObject(pending.metadata) && Reflect.ownKeys(pending.metadata).length === 1
      && isPlainObject(pending.metadata.entry)
      && ["PREPARED", "DURABLE"].includes(pending.phase));
    if (!isPlainObject(value) || Reflect.ownKeys(value).length !== 3 || !currentValid || !pendingValid || !isSha256(value.revision)) {
      throw new LedgerError("LIFECYCLE_ANCHOR_UNAVAILABLE", "lifecycle transactional head anchor returned malformed state");
    }
    return value;
  }

  #transactionCommitment(head) {
    return canonicalFingerprint({ ledgerId: head.ledgerId, count: head.count, headHash: head.headHash });
  }

  #verifiedState() {
    for (let attempt = 0; attempt < MAX_APPEND_ATTEMPTS; attempt += 1) {
      let before;
      let verified;
      let after;
      try {
        before = this.#anchorSnapshot();
        verified = super.verify();
        after = this.#anchorSnapshot();
      } catch (cause) {
        if (["HEAD_ANCHOR_BUSY", "EBUSY", "EPERM"].includes(cause?.code)) {
          boundedBackoff(attempt);
          continue;
        }
        if (cause instanceof LedgerError) throw cause;
        throw new LedgerError(cause?.code ?? "LIFECYCLE_ANCHOR_UNAVAILABLE", "lifecycle evidence could not be verified");
      }
      if (before.revision !== after.revision) {
        boundedBackoff(attempt);
        continue;
      }
      const { current, pending } = after;
      const currentMatch = verified.count === current.count && verified.headHash === current.headHash;
      const pendingMatch = pending !== null && verified.count === pending.count && verified.headHash === pending.headHash
        && pending.commitment === this.#transactionCommitment(verified);
      if (currentMatch && pending?.phase === "DURABLE") {
        throw new LedgerError("LIFECYCLE_ROLLBACK_DETECTED", "durable lifecycle head is missing from the ledger");
      }
      if (!currentMatch && !pendingMatch) {
        throw new LedgerError("LIFECYCLE_ROLLBACK_DETECTED", "lifecycle ledger does not match its transactional monotonic head anchor");
      }
      const trusted = pendingMatch && pending.phase === "DURABLE" ? verified
        : { ...verified, count: current.count, headHash: current.headHash };
      return { verified, trusted, snapshot: after };
    }
    throw new LedgerError("LIFECYCLE_LEDGER_CHANGED", "lifecycle evidence did not stabilize");
  }

  #syncLedger() {
    let handle;
    try {
      handle = openSync(this.#filePath, "r+");
      fsyncSync(handle);
      closeSync(handle);
      handle = undefined;
      try {
        const directoryHandle = openSync(dirname(this.#filePath), "r");
        try { fsyncSync(directoryHandle); } finally { closeSync(directoryHandle); }
      } catch { /* directory fsync is unavailable on some Windows filesystems */ }
    } catch (cause) {
      throw new LedgerError("LIFECYCLE_LEDGER_DURABILITY_FAILURE", `lifecycle ledger fsync failed: ${cause.message}`);
    } finally {
      if (handle !== undefined) closeSync(handle);
    }
  }

  #recoverPendingForWrite() {
    const state = this.#verifiedState();
    const { current, pending } = state.snapshot;
    if (pending === null) {
      return state.trusted;
    }
    const expected = current;
    const next = { count: pending.count, headHash: pending.headHash };
    if (state.verified.count === current.count && state.verified.headHash === current.headHash) {
      const entry = structuredClone(pending.metadata.entry);
      const entryHash = canonicalFingerprint(entry);
      const predictedHead = canonicalFingerprint({ ledgerId: LEDGER_ID, sequence: next.count,
        previousHash: current.headHash, entryHash });
      if (next.count !== current.count + 1 || next.headHash !== predictedHead
        || pending.commitment !== this.#transactionCommitment({ ledgerId: LEDGER_ID, count: next.count, headHash: next.headHash })) {
        throw new LedgerError("LIFECYCLE_TRANSACTION_INVARIANT", "prepared lifecycle metadata does not match its authenticated commitment");
      }
      snapshotEvent(entry.payload, { integrityKey: this.#integrityKey, requireMac: true });
      const receipt = super.append(entry, { expectedSequence: current.count,
        preWriteCheck: (records) => this.#lifecycleVeto(records, entry.payload) });
      if (receipt?.ok === false || receipt.sequence !== next.count || receipt.recordHash !== next.headHash) {
        throw new LedgerError("LIFECYCLE_TRANSACTION_INVARIANT", "prepared lifecycle entry could not be recovered exactly");
      }
    }
    if (pending.phase === "PREPARED") {
      this.#syncLedger();
      let durable;
      try { durable = this.#markAnchorDurable({ expected, next, commitment: pending.commitment }); } catch (cause) {
        throw new LedgerError(cause?.code ?? "LIFECYCLE_ANCHOR_UNAVAILABLE", "pending lifecycle head could not become durable");
      }
      if (durable !== true) throw new LedgerError("LIFECYCLE_ANCHOR_CONFLICT", "pending lifecycle head could not become durable");
    }
    let finalized;
    try { finalized = this.#finalizeAnchor({ expected, next, commitment: pending.commitment }); } catch (cause) {
      throw new LedgerError(cause?.code ?? "LIFECYCLE_ANCHOR_UNAVAILABLE", "pending lifecycle head could not be finalized");
    }
    if (finalized !== true) throw new LedgerError("LIFECYCLE_ANCHOR_CONFLICT", "pending lifecycle head could not be finalized");
    return this.#verifiedState().trusted;
  }

  #assertFileBounded(additionalBytes = 0) {
    const current = existsSync(this.#filePath) ? statSync(this.#filePath).size : 0;
    if (current + additionalBytes > MAX_LEDGER_BYTES) {
      throw new LedgerError("LIFECYCLE_LEDGER_RESOURCE_LIMIT", "memory lifecycle ledger byte limit would be exceeded");
    }
  }

  verify() {
    this.#assertFileBounded();
    const result = this.#verifiedState().trusted;
    if (result.count > MAX_LIFECYCLE_EVENTS) throw new LedgerError("LIFECYCLE_LEDGER_RESOURCE_LIMIT", "memory lifecycle event limit exceeded");
    return result;
  }

  read() {
    this.#assertFileBounded();
    const verified = this.verify();
    const records = super.read();
    if (records.length > MAX_LIFECYCLE_EVENTS || records.length < verified.count) throw new LedgerError("LIFECYCLE_LEDGER_RESOURCE_LIMIT", "memory lifecycle event limit exceeded or changed during read");
    return records.slice(0, verified.count);
  }

  #lifecycleVeto(records, signed) {
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

  appendLifecycleEvent(event, options = {}) {
    return this.#withBoundarySync(() => this.#appendLifecycleEventOwned(event, options));
  }

  #appendLifecycleEventOwned(event, { expectedSequence, idempotencyKey } = {}) {
    const unsigned = snapshotEvent(event, { integrityKey: this.#integrityKey, requireMac: false });
    if (!isBoundedString(idempotencyKey, 512)) {
      throw new LedgerError("DENY_MISSING_ENTRY_FIELDS", "a bounded idempotencyKey is required for memory lifecycle append");
    }
    const signed = deepFreeze({ ...unsigned, event_mac: macFor(this.#integrityKey, unsigned) });
    const entry = lifecycleEntry(signed, idempotencyKey);
    this.#assertFileBounded(Buffer.byteLength(JSON.stringify(entry), "utf8") * 4 + 4_096);

    for (let attempt = 0; attempt < MAX_APPEND_ATTEMPTS; attempt += 1) {
      try {
        const anchoredBefore = this.#recoverPendingForWrite();
        const trustedRecords = super.read().slice(0, anchoredBefore.count);
        const entryHash = canonicalFingerprint(entry);
        const replay = trustedRecords.find((record) => record.entry.idempotencyKey === idempotencyKey);
        if (replay !== undefined) {
          if (replay.entryHash !== entryHash) throw new LedgerError("DENY_IDEMPOTENCY_CONFLICT", "Idempotency key was reused for different lifecycle content");
          return { ...structuredClone(replay), replayed: true };
        }
        const veto = this.#lifecycleVeto(trustedRecords, signed);
        if (veto !== null) return veto;
        if (expectedSequence !== anchoredBefore.count) {
          throw new LedgerError("DENY_SEQUENCE_CONFLICT", `Expected sequence ${expectedSequence}, observed ${anchoredBefore.count}`);
        }

        const predicted = { ledgerId: LEDGER_ID, count: anchoredBefore.count + 1,
          headHash: canonicalFingerprint({ ledgerId: LEDGER_ID, sequence: anchoredBefore.count + 1,
            previousHash: anchoredBefore.headHash, entryHash }) };
        const expected = { count: anchoredBefore.count, headHash: anchoredBefore.headHash };
        const next = { count: predicted.count, headHash: predicted.headHash };
        const commitment = this.#transactionCommitment(predicted);
        const prepared = this.#prepareAnchor({ expected, next, commitment, metadata: { entry } });
        if (prepared !== true) {
          boundedBackoff(attempt);
          continue;
        }
        const receipt = this.append(entry, {
          expectedSequence: anchoredBefore.count,
          preWriteCheck: (records) => this.#lifecycleVeto(records, signed)
        });
        if (receipt?.ok === false) {
          throw new LedgerError("LIFECYCLE_TRANSACTION_INVARIANT", "lifecycle preflight changed after transactional head preparation");
        }
        if (receipt.sequence !== predicted.count || receipt.recordHash !== predicted.headHash) {
          throw new LedgerError("LIFECYCLE_LEDGER_CONTRACT_FAILURE", "persisted lifecycle record differs from its prepared commitment");
        }
        this.#syncLedger();
        const durable = this.#markAnchorDurable({ expected, next, commitment });
        if (durable !== true) throw new LedgerError("LIFECYCLE_ANCHOR_CONFLICT", "transactional lifecycle head rejected durable phase");
        const finalized = this.#finalizeAnchor({ expected, next, commitment });
        if (finalized !== true) throw new LedgerError("LIFECYCLE_ANCHOR_CONFLICT", "transactional lifecycle head rejected finalize");
        const verified = this.verify();
        if (verified.count !== receipt.sequence || verified.headHash !== receipt.recordHash) {
          throw new LedgerError("LIFECYCLE_ANCHOR_CONFLICT", "lifecycle append did not converge with its transactional head anchor");
        }
        return receipt;
      } catch (cause) {
        if ((cause instanceof LedgerError && ["DENY_SEQUENCE_CONFLICT", "LEDGER_BUSY"].includes(cause.code))
          || ["HEAD_ANCHOR_BUSY", "EBUSY", "EPERM"].includes(cause?.code)) {
          boundedBackoff(attempt);
          continue;
        }
        if (cause instanceof LedgerError) throw cause;
        throw new LedgerError(cause?.code ?? "LIFECYCLE_PERSISTENCE_FAILURE", "memory lifecycle event could not be persisted transactionally");
      }
    }
    throw new LedgerError("LIFECYCLE_APPEND_RETRYABLE", "memory lifecycle append did not converge before the bounded retry deadline");
  }

  validateLifecycleEvent(event) {
    return snapshotEvent(event, { integrityKey: this.#integrityKey, requireMac: true });
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
