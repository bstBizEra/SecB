import { closeSync, existsSync, fsyncSync, openSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { canonicalFingerprint } from "../contracts/canonical-fingerprint.mjs";
import { DurableLedger, LedgerError, ZERO_HASH } from "./durable-ledger.mjs";

const MAX_ATTEMPTS = 64;
const isHash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

function backoff(attempt) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.min(2 ** Math.min(attempt, 4), 16));
}

export class DurableAnchoredLedger extends DurableLedger {
  #filePath;
  #ledgerId;
  #snapshotAnchor;
  #prepareAnchor;
  #markAnchorDurable;
  #finalizeAnchor;

  constructor({ filePath, ledgerId, headAnchor } = {}) {
    super({ filePath, ledgerId });
    this.#filePath = resolve(filePath);
    this.#ledgerId = ledgerId;
    let snapshot;
    let prepare;
    let markDurable;
    let finalize;
    try {
      snapshot = headAnchor?.snapshot;
      prepare = headAnchor?.prepare;
      markDurable = headAnchor?.markDurable;
      finalize = headAnchor?.finalize;
    } catch {
      throw new LedgerError("INVALID_ANCHORED_LEDGER_HEAD", "head anchor could not be safely inspected");
    }
    if ([snapshot, prepare, markDurable, finalize].some((operation) => typeof operation !== "function")) {
      throw new LedgerError("INVALID_ANCHORED_LEDGER_HEAD", "transactional head anchor operations are required");
    }
    this.#snapshotAnchor = Function.prototype.bind.call(snapshot, headAnchor);
    this.#prepareAnchor = Function.prototype.bind.call(prepare, headAnchor);
    this.#markAnchorDurable = Function.prototype.bind.call(markDurable, headAnchor);
    this.#finalizeAnchor = Function.prototype.bind.call(finalize, headAnchor);
  }

  #snapshot() {
    let value;
    try { value = structuredClone(this.#snapshotAnchor()); } catch {
      throw new LedgerError("ANCHORED_LEDGER_HEAD_UNAVAILABLE", "transactional head snapshot is unavailable");
    }
    const current = value?.current;
    const pending = value?.pending;
    const validCurrent = isPlainObject(current) && Reflect.ownKeys(current).length === 2
      && Number.isSafeInteger(current.count) && current.count >= 0 && isHash(current.headHash)
      && ((current.count === 0) === (current.headHash === ZERO_HASH));
    const validPending = pending === null || (isPlainObject(pending) && Reflect.ownKeys(pending).length === 5
      && validCurrent && pending.count === current.count + 1 && isHash(pending.headHash)
      && isHash(pending.commitment) && ["PREPARED", "DURABLE"].includes(pending.phase)
      && isPlainObject(pending.metadata) && Reflect.ownKeys(pending.metadata).length === 1
      && isPlainObject(pending.metadata.entry));
    if (!isPlainObject(value) || Reflect.ownKeys(value).length !== 3 || !validCurrent || !validPending || !isHash(value.revision)) {
      throw new LedgerError("ANCHORED_LEDGER_HEAD_UNAVAILABLE", "transactional head snapshot is malformed");
    }
    return value;
  }

  #commitment(count, headHash) {
    return canonicalFingerprint({ ledgerId: this.#ledgerId, count, headHash });
  }

  #stableState() {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        const before = this.#snapshot();
        const ledger = super.verify();
        const after = this.#snapshot();
        if (before.revision !== after.revision) { backoff(attempt); continue; }
        const currentMatch = ledger.count === after.current.count && ledger.headHash === after.current.headHash;
        const pendingMatch = after.pending !== null && ledger.count === after.pending.count
          && ledger.headHash === after.pending.headHash
          && after.pending.commitment === this.#commitment(ledger.count, ledger.headHash);
        if (!currentMatch && !pendingMatch) {
          throw new LedgerError("ANCHORED_LEDGER_ROLLBACK_DETECTED", "ledger does not match its authenticated transactional head");
        }
        if (currentMatch && after.pending?.phase === "DURABLE") {
          throw new LedgerError("ANCHORED_LEDGER_ROLLBACK_DETECTED", "durable pending head is absent from the ledger");
        }
        const trusted = pendingMatch && after.pending.phase === "DURABLE" ? ledger
          : { ...ledger, count: after.current.count, headHash: after.current.headHash };
        return { ledger, trusted, snapshot: after };
      } catch (cause) {
        if (["HEAD_ANCHOR_BUSY", "EBUSY", "EPERM"].includes(cause?.code)) { backoff(attempt); continue; }
        throw cause instanceof LedgerError ? cause
          : new LedgerError(cause?.code ?? "ANCHORED_LEDGER_HEAD_UNAVAILABLE", "anchored ledger could not be verified");
      }
    }
    throw new LedgerError("ANCHORED_LEDGER_CHANGED", "anchored ledger did not stabilize");
  }

  #sync() {
    if (!existsSync(this.#filePath)) throw new LedgerError("ANCHORED_LEDGER_DURABILITY_FAILURE", "ledger file is missing");
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
      throw new LedgerError("ANCHORED_LEDGER_DURABILITY_FAILURE", `ledger fsync failed: ${cause.message}`);
    } finally {
      if (handle !== undefined) closeSync(handle);
    }
  }

  #recover() {
    const state = this.#stableState();
    const { current, pending } = state.snapshot;
    if (pending === null) return state.trusted;
    const expected = current;
    const next = { count: pending.count, headHash: pending.headHash };
    if (state.ledger.count === current.count && state.ledger.headHash === current.headHash) {
      const entry = structuredClone(pending.metadata.entry);
      const entryHash = canonicalFingerprint(entry);
      const predicted = canonicalFingerprint({ ledgerId: this.#ledgerId, sequence: next.count,
        previousHash: current.headHash, entryHash });
      if (predicted !== next.headHash || pending.commitment !== this.#commitment(next.count, next.headHash)) {
        throw new LedgerError("ANCHORED_LEDGER_TRANSACTION_INVALID", "prepared entry does not match its authenticated commitment");
      }
      const receipt = super.append(entry, { expectedSequence: current.count });
      if (receipt.sequence !== next.count || receipt.recordHash !== next.headHash) {
        throw new LedgerError("ANCHORED_LEDGER_TRANSACTION_INVALID", "prepared entry recovery diverged");
      }
    }
    if (pending.phase === "PREPARED") {
      this.#sync();
      if (this.#markAnchorDurable({ expected, next, commitment: pending.commitment }) !== true) {
        throw new LedgerError("ANCHORED_LEDGER_HEAD_CONFLICT", "pending entry could not become durable");
      }
    }
    if (this.#finalizeAnchor({ expected, next, commitment: pending.commitment }) !== true) {
      throw new LedgerError("ANCHORED_LEDGER_HEAD_CONFLICT", "pending entry could not be finalized");
    }
    return this.#stableState().trusted;
  }

  verifyTrusted() {
    return this.#stableState().trusted;
  }

  verify() {
    return this.verifyTrusted();
  }

  read() {
    const trusted = this.verifyTrusted();
    const records = super.read();
    if (records.length < trusted.count) throw new LedgerError("ANCHORED_LEDGER_CHANGED", "ledger shortened during trusted read");
    return records.slice(0, trusted.count);
  }

  append(entry, { expectedSequence, preWriteCheck } = {}) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        const current = this.#recover();
        const records = super.read().slice(0, current.count);
        const replay = records.find((record) => record.entry.idempotencyKey === entry?.idempotencyKey);
        const entryHash = canonicalFingerprint(entry);
        if (replay !== undefined) {
          if (replay.entryHash !== entryHash) throw new LedgerError("DENY_IDEMPOTENCY_CONFLICT", "idempotency key conflicts with anchored content");
          return { ...structuredClone(replay), replayed: true };
        }
        if (expectedSequence !== current.count) throw new LedgerError("DENY_SEQUENCE_CONFLICT", "anchored sequence changed");
        const veto = preWriteCheck?.(structuredClone(records), structuredClone(entry));
        if (veto) return veto;
        const next = { count: current.count + 1, headHash: canonicalFingerprint({ ledgerId: this.#ledgerId,
          sequence: current.count + 1, previousHash: current.headHash, entryHash }) };
        const expected = { count: current.count, headHash: current.headHash };
        const commitment = this.#commitment(next.count, next.headHash);
        if (this.#prepareAnchor({ expected, next, commitment, metadata: { entry: structuredClone(entry) } }) !== true) {
          backoff(attempt); continue;
        }
        // A successful prepare serializes this exact next head. The business veto
        // was evaluated against the same anchored current head immediately before
        // prepare; another writer cannot advance until this transaction finalizes.
        const receipt = super.append(entry, { expectedSequence: current.count });
        if (receipt?.decision === "DENY" || receipt?.ok === false || receipt.sequence !== next.count || receipt.recordHash !== next.headHash) {
          throw new LedgerError("ANCHORED_LEDGER_TRANSACTION_INVALID", "prepared append did not match its commitment");
        }
        this.#sync();
        if (this.#markAnchorDurable({ expected, next, commitment }) !== true
          || this.#finalizeAnchor({ expected, next, commitment }) !== true) {
          throw new LedgerError("ANCHORED_LEDGER_HEAD_CONFLICT", "anchored append did not finalize");
        }
        const verified = this.verifyTrusted();
        if (verified.count !== receipt.sequence || verified.headHash !== receipt.recordHash) {
          throw new LedgerError("ANCHORED_LEDGER_HEAD_CONFLICT", "anchored append did not converge");
        }
        return receipt;
      } catch (cause) {
        if (["DENY_SEQUENCE_CONFLICT", "LEDGER_BUSY", "HEAD_ANCHOR_BUSY", "EBUSY", "EPERM"].includes(cause?.code)) {
          backoff(attempt); continue;
        }
        throw cause;
      }
    }
    throw new LedgerError("ANCHORED_LEDGER_RETRYABLE", "anchored append did not converge before the bounded retry deadline");
  }
}
