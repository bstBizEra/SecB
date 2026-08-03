// WP-MEM-REPLAY-ADAPTER-001 candidate. This adapter is deliberately unwired:
// it adds durable, replay-only lookup around a Context Federation provider but
// does not install itself on any execution path.

import { canonicalFingerprint } from "../contracts/canonical-fingerprint.mjs";
import { DurableLedger, LedgerError } from "../ledger/durable-ledger.mjs";

const LEDGER_ID = "secb-context-replay-ledger";
const ZERO_HASH = "0".repeat(64);
const MAX_APPEND_ATTEMPTS = 8;

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

function safeSnapshot(value, label) {
  const seen = new WeakSet();
  function inspect(candidate) {
    if (candidate === null || typeof candidate !== "object") return;
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
      inspect(descriptor.value);
    }
  }
  try {
    inspect(value);
    return structuredClone(value);
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
  #issue;
  #replay;
  #readAnchor;
  #advanceAnchor;

  constructor({ filePath, contextFederation, headAnchor } = {}) {
    let issue;
    let replay;
    let readAnchor;
    let advanceAnchor;
    try {
      issue = contextFederation?.issueReceipt;
      replay = contextFederation?.replayReceipt;
      readAnchor = headAnchor?.read;
      advanceAnchor = headAnchor?.compareAndSet;
    } catch {
      throw new DurableContextReplayError("INVALID_REPLAY_PROVIDER", "Context provider could not be inspected");
    }
    if (typeof issue !== "function" || typeof replay !== "function") {
      throw new DurableContextReplayError("INVALID_REPLAY_PROVIDER", "issueReceipt and replayReceipt are required");
    }
    if (typeof readAnchor !== "function" || typeof advanceAnchor !== "function") {
      throw new DurableContextReplayError("INVALID_REPLAY_HEAD_ANCHOR", "an independent monotonic headAnchor is required");
    }
    this.#ledger = new DurableLedger({ filePath, ledgerId: LEDGER_ID });
    this.#issue = Function.prototype.bind.call(issue, contextFederation);
    this.#replay = Function.prototype.bind.call(replay, contextFederation);
    this.#readAnchor = Function.prototype.bind.call(readAnchor, headAnchor);
    this.#advanceAnchor = Function.prototype.bind.call(advanceAnchor, headAnchor);
  }

  #verifiedHead() {
    let verified;
    let anchor;
    try {
      verified = this.#ledger.verify();
      anchor = safeSnapshot(this.#readAnchor(), "replay head anchor");
    } catch (cause) {
      if (cause instanceof DurableContextReplayError) throw cause;
      throw new DurableContextReplayError(cause?.code ?? "REPLAY_LEDGER_UNAVAILABLE", "durable replay evidence is unavailable");
    }
    if (!isPlainObject(anchor) || Reflect.ownKeys(anchor).length !== 2
      || !Number.isSafeInteger(anchor.count) || anchor.count < 0 || !isHash(anchor.headHash)
      || anchor.count !== verified.count || anchor.headHash !== verified.headHash) {
      throw new DurableContextReplayError("REPLAY_LEDGER_ROLLBACK_DETECTED", "replay ledger does not match its trusted head anchor");
    }
    return verified;
  }

  #lookup(request) {
    const identity = requestIdentity(request);
    let records;
    try {
      const before = this.#verifiedHead();
      records = this.#ledger.read();
      const after = this.#verifiedHead();
      if (before.count !== after.count || before.headHash !== after.headHash || records.length !== after.count) {
        throw new DurableContextReplayError("REPLAY_LEDGER_CHANGED", "replay ledger changed during exact lookup");
      }
    } catch (cause) {
      if (cause instanceof DurableContextReplayError) throw cause;
      throw new DurableContextReplayError(cause?.code ?? "REPLAY_LEDGER_UNAVAILABLE", "durable replay ledger is unavailable");
    }
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
        const anchoredBefore = this.#verifiedHead();
        const appended = this.#ledger.append(entry, { expectedSequence: anchoredBefore.count });
        validateStored(appended, lookup.identity);
        if (appended.replayed !== true) {
          const advanced = this.#advanceAnchor({ expected: { count: anchoredBefore.count, headHash: anchoredBefore.headHash },
            next: { count: appended.sequence, headHash: appended.recordHash } });
          if (advanced !== true) throw new DurableContextReplayError("REPLAY_HEAD_ANCHOR_CONFLICT", "trusted replay head rejected the append");
        }
        const anchoredAfter = this.#verifiedHead();
        if (anchoredAfter.count !== appended.sequence || anchoredAfter.headHash !== appended.recordHash) {
          throw new DurableContextReplayError("REPLAY_HEAD_ANCHOR_CONFLICT", "replay evidence did not converge with its trusted head");
        }
        return;
      } catch (cause) {
        if (cause instanceof LedgerError && (cause.code === "DENY_SEQUENCE_CONFLICT" || cause.code === "LEDGER_BUSY")) continue;
        throw new DurableContextReplayError(cause?.code ?? "REPLAY_RECEIPT_PERSISTENCE_FAILURE", "Context replay receipt could not be persisted");
      }
    }
    throw new DurableContextReplayError("REPLAY_RECEIPT_PERSISTENCE_FAILURE", "Context replay receipt append did not converge");
  }

  issueReceipt(rawRequest) {
    const request = safeSnapshot(rawRequest, "Context request");
    const lookup = this.#lookup(request);
    if (lookup.match !== null) return deepFreeze({ ...lookup.match, replayed: true });
    const issued = stableResult(this.#issue(deepFreeze(structuredClone(request))));
    this.#persist(request, issued, lookup);
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
    const verified = this.#verifiedHead();
    return deepFreeze({ ...verified, headHash: verified.headHash ?? ZERO_HASH });
  }
}
