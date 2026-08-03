// WP-MEM-REPLAY-ADAPTER-001 candidate. This adapter is deliberately unwired:
// it adds durable, replay-only lookup around a Context Federation provider but
// does not install itself on any execution path.

import { canonicalFingerprint } from "../contracts/canonical-fingerprint.mjs";
import { DurableLedger, LedgerError } from "../ledger/durable-ledger.mjs";
import { closeSync, fsyncSync, openSync } from "node:fs";
import { dirname, resolve } from "node:path";

const LEDGER_ID = "secb-context-replay-ledger";
const ZERO_HASH = "0".repeat(64);
const MAX_APPEND_ATTEMPTS = 64;
const MAX_RETRY_DELAY_MS = 16;
const MAX_GRAPH_NODES = 10_000;
const MAX_GRAPH_DEPTH = 64;
const MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024;

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isHash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const isBoundedString = (value, max = 512) => typeof value === "string" && value.trim() !== "" && value.length <= max;

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

function safeSnapshot(value, label) {
  const seen = new WeakSet();
  let nodes = 0;
  function inspect(candidate, depth = 0) {
    if (candidate === null || ["string", "boolean"].includes(typeof candidate)) return;
    if (typeof candidate === "number" && Number.isFinite(candidate)) return;
    if (typeof candidate !== "object") throw new Error("non-canonical value");
    nodes += 1;
    if (nodes > MAX_GRAPH_NODES || depth > MAX_GRAPH_DEPTH) throw new Error("graph resource limit");
    if (seen.has(candidate)) throw new Error("cyclic graph");
    seen.add(candidate);
    const prototype = Object.getPrototypeOf(candidate);
    if (Array.isArray(candidate)) {
      if (prototype !== Array.prototype) throw new Error("custom array prototype");
    } else if (prototype !== Object.prototype && prototype !== null) throw new Error("custom object prototype");
    for (const key of Reflect.ownKeys(candidate)) {
      if (typeof key !== "string") throw new Error("symbol key");
      const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
      if (descriptor === undefined || !("value" in descriptor)) throw new Error("accessor property");
      inspect(descriptor.value, depth + 1);
    }
  }
  try {
    inspect(value);
    const snapshot = structuredClone(value);
    const encoded = JSON.stringify(snapshot);
    if (typeof encoded !== "string" || Buffer.byteLength(encoded, "utf8") > MAX_SNAPSHOT_BYTES) throw new Error("snapshot byte limit");
    return snapshot;
  } catch (cause) {
    throw new DurableContextReplayError("DENY_REPLAY_MALFORMED", `${label} could not be safely snapshotted: ${cause.message}`);
  }
}

function requestIdentity(request) {
  if (!isPlainObject(request) || !isPlainObject(request.document)
    || !isBoundedString(request.document.project_id) || !isBoundedString(request.document.receipt_id)
    || !isBoundedString(request.idempotencyKey)
    || !Number.isFinite(Date.parse(request.document.freshness_timestamp))) {
    throw new DurableContextReplayError("DENY_REPLAY_MALFORMED", "project, receipt, and idempotency identity are required");
  }
  return canonicalFingerprint({
    project_id: request.document.project_id,
    receipt_id: request.document.receipt_id,
    idempotency_key: request.idempotencyKey
  });
}

function stableResult(result) {
  const snapshot = safeSnapshot(result, "Context result");
  if (!isPlainObject(snapshot) || typeof snapshot.replayed !== "boolean") {
    throw new DurableContextReplayError("DENY_REPLAY_RESULT_MALFORMED", "Context result must be an object with replayed state");
  }
  return { ...snapshot, replayed: false };
}

function validateStored(record, identity) {
  const payload = record?.entry?.payload;
  if (record?.ledgerId !== LEDGER_ID || record?.entry?.entryId !== identity || record?.entry?.type !== "CONTEXT_RECEIPT_ISSUED"
    || !isPlainObject(payload) || Reflect.ownKeys(payload).length !== 4 || payload.version !== 1
    || !isHash(payload.request_fingerprint) || !isHash(payload.result_fingerprint) || !isPlainObject(payload.result)) {
    throw new DurableContextReplayError("REPLAY_LEDGER_CONTRACT_FAILURE", "stored replay receipt is malformed");
  }
  const stable = stableResult(payload.result);
  if (canonicalFingerprint(stable) !== payload.result_fingerprint) {
    throw new DurableContextReplayError("REPLAY_LEDGER_CONTRACT_FAILURE", "stored replay result fingerprint is invalid");
  }
  return { payload, stable };
}

export class DurableContextReplayError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DurableContextReplayError";
    this.code = code;
  }
}

export class DurableContextReplayAdapter {
  #ledger;
  #filePath;
  #issue;
  #replay;
  #snapshotAnchor;
  #prepareAnchor;
  #markAnchorDurable;
  #finalizeAnchor;

  constructor({ filePath, contextFederation, headAnchor } = {}) {
    let issue;
    let replay;
    let snapshotAnchor;
    let prepareAnchor;
    let markAnchorDurable;
    let finalizeAnchor;
    try {
      issue = contextFederation?.issueReceipt;
      replay = contextFederation?.replayReceipt;
      snapshotAnchor = headAnchor?.snapshot;
      prepareAnchor = headAnchor?.prepare;
      markAnchorDurable = headAnchor?.markDurable;
      finalizeAnchor = headAnchor?.finalize;
    } catch {
      throw new DurableContextReplayError("INVALID_REPLAY_PROVIDER", "Context provider could not be inspected");
    }
    if (typeof issue !== "function" || typeof replay !== "function") {
      throw new DurableContextReplayError("INVALID_REPLAY_PROVIDER", "issueReceipt and replayReceipt are required");
    }
    if ([snapshotAnchor, prepareAnchor, markAnchorDurable, finalizeAnchor].some((operation) => typeof operation !== "function")) {
      throw new DurableContextReplayError("INVALID_REPLAY_HEAD_ANCHOR", "a transactional monotonic headAnchor is required");
    }
    this.#filePath = resolve(filePath);
    this.#ledger = new DurableLedger({ filePath: this.#filePath, ledgerId: LEDGER_ID });
    this.#issue = Function.prototype.bind.call(issue, contextFederation);
    this.#replay = Function.prototype.bind.call(replay, contextFederation);
    this.#snapshotAnchor = Function.prototype.bind.call(snapshotAnchor, headAnchor);
    this.#prepareAnchor = Function.prototype.bind.call(prepareAnchor, headAnchor);
    this.#markAnchorDurable = Function.prototype.bind.call(markAnchorDurable, headAnchor);
    this.#finalizeAnchor = Function.prototype.bind.call(finalizeAnchor, headAnchor);
  }

  #transactionCommitment(head) {
    return canonicalFingerprint({ ledgerId: head.ledgerId, count: head.count, headHash: head.headHash });
  }

  #verifiedState() {
    let verified;
    let snapshot;
    for (let attempt = 0; attempt < MAX_APPEND_ATTEMPTS; attempt += 1) {
      try {
        const before = safeSnapshot(this.#snapshotAnchor(), "replay head snapshot");
        const observed = this.#ledger.verify();
        const after = safeSnapshot(this.#snapshotAnchor(), "replay head snapshot");
        if (before?.revision !== after?.revision) {
          boundedBackoff(attempt);
          continue;
        }
        verified = observed;
        snapshot = after;
        break;
      } catch (cause) {
        if (["HEAD_ANCHOR_BUSY", "EBUSY", "EPERM"].includes(cause?.code)) {
          boundedBackoff(attempt);
          continue;
        }
        if (cause instanceof DurableContextReplayError) throw cause;
        throw new DurableContextReplayError(cause?.code ?? "REPLAY_LEDGER_UNAVAILABLE", "durable replay evidence is unavailable");
      }
    }
    if (verified === undefined || snapshot === undefined) {
      throw new DurableContextReplayError("REPLAY_LEDGER_CHANGED", "trusted replay evidence did not stabilize");
    }
    const current = snapshot?.current;
    const pending = snapshot?.pending;
    const snapshotValid = isPlainObject(snapshot) && Reflect.ownKeys(snapshot).length === 3 && isHash(snapshot.revision)
      && isPlainObject(current) && Reflect.ownKeys(current).length === 2
      && Number.isSafeInteger(current.count) && current.count >= 0 && isHash(current.headHash)
      && (pending === null || (isPlainObject(pending) && Reflect.ownKeys(pending).length === 4
        && Number.isSafeInteger(pending.count) && pending.count === current.count + 1
        && isHash(pending.headHash) && isHash(pending.commitment) && ["PREPARED", "DURABLE"].includes(pending.phase)));
    const currentMatch = snapshotValid && current.count === verified.count && current.headHash === verified.headHash;
    const pendingMatch = snapshotValid && pending !== null && pending.count === verified.count && pending.headHash === verified.headHash
      && pending.commitment === this.#transactionCommitment(verified);
    if (!currentMatch && !pendingMatch) {
      throw new DurableContextReplayError("REPLAY_LEDGER_ROLLBACK_DETECTED", "replay ledger does not match its trusted head anchor");
    }
    const trusted = pendingMatch && pending.phase === "DURABLE" ? verified
      : { ...verified, count: current.count, headHash: current.headHash };
    return { verified, trusted, snapshot };
  }

  #recoverPendingForWrite() {
    const state = this.#verifiedState();
    const { current, pending } = state.snapshot;
    if (pending === null || (current.count === state.verified.count && current.headHash === state.verified.headHash)) return state.trusted;
    const expected = current;
    const next = { count: pending.count, headHash: pending.headHash };
    if (pending.phase === "PREPARED") {
      this.#syncLedger();
      const durable = this.#markAnchorDurable({ expected, next, commitment: pending.commitment });
      if (durable !== true) throw new DurableContextReplayError("REPLAY_HEAD_ANCHOR_CONFLICT", "pending replay head could not become durable");
    }
    const finalized = this.#finalizeAnchor({ expected, next, commitment: pending.commitment });
    if (finalized !== true) throw new DurableContextReplayError("REPLAY_HEAD_ANCHOR_CONFLICT", "pending replay head could not be finalized");
    return this.#verifiedState().trusted;
  }

  #syncLedger() {
    let handle;
    try {
      handle = openSync(this.#filePath, "r+");
      fsyncSync(handle);
      const ledgerHandle = handle;
      handle = undefined;
      closeSync(ledgerHandle);
      try {
        const directoryHandle = openSync(dirname(this.#filePath), "r");
        try { fsyncSync(directoryHandle); } finally { closeSync(directoryHandle); }
      } catch { /* directory fsync is unavailable on some Windows filesystems */ }
    } catch (cause) {
      throw new DurableContextReplayError("REPLAY_LEDGER_DURABILITY_FAILURE", `replay ledger fsync failed: ${cause.message}`);
    } finally {
      if (handle !== undefined) closeSync(handle);
    }
  }

  #lookup(request) {
    const identity = requestIdentity(request);
    let records;
    for (let attempt = 0; attempt < MAX_APPEND_ATTEMPTS; attempt += 1) {
      try {
        const before = this.#verifiedState();
        const observed = this.#ledger.read();
        const after = this.#verifiedState();
        if (before.snapshot.revision !== after.snapshot.revision || before.trusted.count !== after.trusted.count
          || before.trusted.headHash !== after.trusted.headHash || observed.length < after.trusted.count) {
          boundedBackoff(attempt);
          continue;
        }
        records = observed.slice(0, after.trusted.count);
        break;
      } catch (cause) {
        if (["HEAD_ANCHOR_BUSY", "EBUSY", "EPERM"].includes(cause?.code)) {
          boundedBackoff(attempt);
          continue;
        }
        if (cause instanceof DurableContextReplayError) throw cause;
        throw new DurableContextReplayError(cause?.code ?? "REPLAY_LEDGER_UNAVAILABLE", "durable replay ledger is unavailable");
      }
    }
    if (records === undefined) throw new DurableContextReplayError("REPLAY_LEDGER_CHANGED", "replay ledger did not stabilize during exact lookup");
    const matches = records.filter((record) => record.entry?.entryId === identity);
    if (matches.length > 1) throw new DurableContextReplayError("REPLAY_LEDGER_CONTRACT_FAILURE", "duplicate replay identity");
    if (matches.length === 0) return { identity, match: null, requestFingerprint: canonicalFingerprint(request) };
    const { payload, stable } = validateStored(matches[0], identity);
    const requestFingerprint = canonicalFingerprint(request);
    if (payload.request_fingerprint !== requestFingerprint) {
      throw new DurableContextReplayError("DENY_IDEMPOTENCY_CONFLICT", "replay identity was used for a different Context request");
    }
    return { identity, match: stable, requestFingerprint };
  }

  #persist(request, result, lookup) {
    const entry = {
      entryId: lookup.identity,
      projectId: request.document.project_id,
      workPackageId: request.document.work_package_id,
      sessionId: request.document.session_id,
      actorId: request.actorId,
      type: "CONTEXT_RECEIPT_ISSUED",
      payload: { version: 1, request_fingerprint: lookup.requestFingerprint,
        result_fingerprint: canonicalFingerprint(result), result },
      // Deterministic across competing processes for the same exact request.
      timestamp: new Date(Date.parse(request.document.freshness_timestamp)).toISOString(),
      idempotencyKey: lookup.identity
    };
    for (let attempt = 0; attempt < MAX_APPEND_ATTEMPTS; attempt += 1) {
      try {
        const concurrent = this.#lookup(request);
        if (concurrent.match !== null) return concurrent.match;
        const anchoredBefore = this.#recoverPendingForWrite();
        const afterRecovery = this.#lookup(request);
        if (afterRecovery.match !== null) return afterRecovery.match;
        const entryHash = canonicalFingerprint(entry);
        const predicted = { ledgerId: anchoredBefore.ledgerId, count: anchoredBefore.count + 1,
          headHash: canonicalFingerprint({ ledgerId: anchoredBefore.ledgerId, sequence: anchoredBefore.count + 1,
            previousHash: anchoredBefore.headHash, entryHash }) };
        const expected = { count: anchoredBefore.count, headHash: anchoredBefore.headHash };
        const next = { count: predicted.count, headHash: predicted.headHash };
        const commitment = this.#transactionCommitment(predicted);
        const prepared = this.#prepareAnchor({ expected, next, commitment });
        if (prepared !== true) {
          boundedBackoff(attempt);
          continue;
        }
        const appended = this.#ledger.append(entry, { expectedSequence: anchoredBefore.count });
        validateStored(appended, lookup.identity);
        if (appended.sequence !== predicted.count || appended.recordHash !== predicted.headHash) {
          throw new DurableContextReplayError("REPLAY_LEDGER_CONTRACT_FAILURE", "persisted replay record differs from its prepared commitment");
        }
        this.#syncLedger();
        const durable = this.#markAnchorDurable({ expected, next, commitment });
        if (durable !== true) throw new DurableContextReplayError("REPLAY_HEAD_ANCHOR_CONFLICT", "trusted replay head rejected durable phase");
        const finalized = this.#finalizeAnchor({ expected, next, commitment });
        if (finalized !== true) throw new DurableContextReplayError("REPLAY_HEAD_ANCHOR_CONFLICT", "trusted replay head rejected finalize");
        const anchoredAfter = this.#verifiedState().trusted;
        if (anchoredAfter.count !== appended.sequence || anchoredAfter.headHash !== appended.recordHash) {
          throw new DurableContextReplayError("REPLAY_HEAD_ANCHOR_CONFLICT", "replay evidence did not converge with its trusted head");
        }
        return null;
      } catch (cause) {
        if ((cause instanceof LedgerError && (cause.code === "DENY_SEQUENCE_CONFLICT" || cause.code === "LEDGER_BUSY"))
          || ["HEAD_ANCHOR_BUSY", "EBUSY", "EPERM"].includes(cause?.code)) {
          boundedBackoff(attempt);
          continue;
        }
        throw new DurableContextReplayError(cause?.code ?? "REPLAY_RECEIPT_PERSISTENCE_FAILURE", "Context replay receipt could not be persisted");
      }
    }
    const converged = this.#lookup(request);
    if (converged.match !== null) return converged.match;
    throw new DurableContextReplayError("REPLAY_RECEIPT_RETRYABLE", "Context replay receipt append did not converge before the bounded retry deadline");
  }

  issueReceipt(rawRequest) {
    const request = safeSnapshot(rawRequest, "Context request");
    this.#recoverPendingForWrite();
    const lookup = this.#lookup(request);
    if (lookup.match !== null) return deepFreeze({ ...lookup.match, replayed: true });
    const issued = stableResult(this.#issue(deepFreeze(structuredClone(request))));
    const concurrent = this.#persist(request, issued, lookup);
    if (concurrent !== null) return deepFreeze({ ...concurrent, replayed: true });
    return deepFreeze(structuredClone(issued));
  }

  replayReceipt(rawRequest) {
    const request = safeSnapshot(rawRequest, "Context replay request");
    const lookup = this.#lookup(request);
    if (lookup.match !== null) return deepFreeze({ ...lookup.match, replayed: true });
    const replayed = safeSnapshot(this.#replay(deepFreeze(structuredClone(request))), "Context replay result");
    if (!isPlainObject(replayed) || replayed.replayed !== true) {
      throw new DurableContextReplayError("DENY_CONTEXT_REPLAY_MISS", "provider did not return a replay-only Context result");
    }
    return deepFreeze(replayed);
  }

  verify() {
    const verified = this.#verifiedState().trusted;
    return deepFreeze({ ...verified, headHash: verified.headHash ?? ZERO_HASH });
  }
}
