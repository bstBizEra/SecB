// MOD-MEM Slice S1 — Memory gateway facade, UNWIRED.
//
// Assessment: docs/03-project-control/candidates/mod-mem-gap-assessment-001.md
// (bst/mod-mem-assessment). This module closes G1 (no memory-gateway service),
// G5 (no admission SoD), and G7 (trusted-time enforcement missing) by composing
// a deny-by-default admission/retrieval pipeline IN FRONT of injected layer
// stores. It follows the MOD-GOV S3 "unwired facade" precedent
// (src/control/policy-decision-point.mjs): nothing wires this module, every
// collaborator is injected, and it holds only a per-instance, non-durable
// replay anchor: no I/O, persistence, or ledger authority of its own. The
// injected store must provide `withReadLease(selector, callback)`: while the
// callback is pending, the selected row cannot be deleted, replaced, or
// mutated. Stores may additionally expose appendWithOutbox() so the durable
// row, receipt, and terminal disposition are committed in one transaction.
//
// Scope discipline (S1 charter):
//   - The gateway NEVER touches an existing store's admission policy. It appends
//     ONLY through the injected layer store (wrap-not-modify). The live learning
//     boundary inside KnowledgeLedger.appendClaim, sod-rules.mjs, and the
//     temporal ledgers are untouched — the gateway can only NARROW, never widen
//     (R3+ HARD LINE: no admission-policy change to existing stores).
//   - Admission SoD REUSES the kernel primitive (sod-rules.mjs
//     checkPairwiseDistinct) CONFIG-ONLY: the gateway supplies actor sets and a
//     deny code, and makes zero changes to sod-rules.mjs exported behavior.
//   - Fail-closed everywhere: malformed construction throws; malformed requests,
//     an unavailable clock, an unknown layer, a classification breach, an
//     admission SoD violation, an unavailable audit writer, and a throwing store
//     all yield structured denials with stage-specific codes. admit()/retrieve()
//     themselves never throw.
//
// Trusted-time (G7): the gateway stamps `admitted_at` on admission and supplies
// the server-derived `retrieved_at` instant on retrieval from the injected
// `now` clock — closing the temporal-ledgers consumer obligation. A caller may
// not supply the enforcement instant.
//
// TTL honesty (G4 floor): time-to-live is DATA on each layer's admission config
// (`ttlMs`). Expiry is COMPUTED at read time (admitted_at + ttlMs vs the
// server instant), never stored and never pruned — deny-on-use, consistent with
// P0-14 temporal semantics.

import { validateContract } from "../contracts/contract-validator.mjs";
import { canonicalFingerprint } from "../contracts/canonical-fingerprint.mjs";
import { createHmac, timingSafeEqual } from "node:crypto";

const LAYERS = Object.freeze(["session", "work", "project"]);
// Port classification vocabulary (candidate-source-port kind "memory").
const CLASSIFICATION_ORDER = Object.freeze(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"]);
const SOD_MODES = Object.freeze(["producer-only", "distinct-approver"]);

// `layer` and `admitted_at` are server-owned fields added before contract
// validation. `supersedes` is the contract's sole optional input field.
const RECORD_KEYS = Object.freeze([
  "memory_record_id",
  "version",
  "project_id",
  "work_package_id",
  "session_id",
  "actor_id",
  "source",
  "statement",
  "classification",
  "confidence",
  "provenance",
  "valid_from",
  "valid_until",
  "retention_policy",
  "supersedes",
  "content_hash"
]);
const REQUIRED_RECORD_KEYS = Object.freeze(RECORD_KEYS.filter((key) => key !== "supersedes"));
const STORE_RECEIPT_KEYS = Object.freeze(["status", "idempotency_key", "memory_record_id", "version", "content_hash", "record_fingerprint", "created", "sequence"]);
const REQUIRED_STORE_RECEIPT_KEYS = Object.freeze(STORE_RECEIPT_KEYS.filter((key) => key !== "sequence"));
const REPLAY_ANCHOR_KEYS = Object.freeze(["status", "idempotency_key", "project_id", "layer", "memory_record_id", "version", "content_hash", "admitted_at"]);
const ATOMIC_APPEND_RESULT_KEYS = Object.freeze(["receipt", "outbox"]);
const OUTBOX_RECORD_KEYS = Object.freeze(["outbox_id", "event_fingerprint", "delivery_status", "delivery_attempts", "delivered_at", "event"]);
const OUTBOX_EVENT_KEYS = Object.freeze([
  "outbox_id", "type", "disposition", "idempotency_key", "project_id", "layer",
  "memory_record_id", "version", "content_hash", "admitted_at", "actor_id", "classification"
]);
const DEFAULT_DEPENDENCY_TIMEOUTS = Object.freeze({ audit_ms: 250, replay_ms: 250 });
const MAX_NODE_TIMEOUT_MS = 2_147_483_647;
const DEFAULT_RETRIEVE_LIMIT = 100;
const MAX_RETRIEVE_LIMIT = 1_000;
const ADMIT_KEYS = Object.freeze(["layer", "record", "admission"]);
const ADMISSION_KEYS = Object.freeze(["producer", "reviewer", "approver"]);
const RETRIEVE_KEYS = Object.freeze(["layer", "project_id", "scope_project_id", "limit", "cursor"]);
const REQUIRED_RETRIEVE_KEYS = Object.freeze(["layer", "project_id", "scope_project_id"]);
const SCOPED_PAGE_KEYS = Object.freeze(["records", "has_more"]);
const RETRIEVE_CURSOR_KEYS = Object.freeze(["v", "scope_hash", "memory_record_id_hash", "version", "content_hash", "mac"]);
const MAX_RETRIEVE_CURSOR_LENGTH = 2_048;
const MIN_CURSOR_MAC_KEY_BYTES = 32;

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isBlank = (value) => typeof value !== "string" || value.trim() === "";

// Receipt values cross the injected-store trust boundary. Snapshot the closed
// shape once so accessors/proxies cannot present one value to validation and a
// different value to the returned receipt.
function snapshotStoreReceipt(value) {
  if (!isPlainObject(value)) return null;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return null;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== "string" || !STORE_RECEIPT_KEYS.includes(key))) return null;
  const own = new Set(ownKeys);
  if (REQUIRED_STORE_RECEIPT_KEYS.some((key) => !own.has(key))) return null;
  const snapshot = { __proto__: null };
  for (const key of STORE_RECEIPT_KEYS) {
    if (own.has(key)) snapshot[key] = value[key];
  }
  return snapshot;
}

function snapshotScopedPage(value) {
  if (!isPlainObject(value)) return null;
  try {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return null;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string" || !SCOPED_PAGE_KEYS.includes(key))) return null;
    if (SCOPED_PAGE_KEYS.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) return null;
    const records = structuredClone(value.records);
    const hasMore = value.has_more;
    if (!Array.isArray(records) || typeof hasMore !== "boolean") return null;
    return { records, has_more: hasMore };
  } catch {
    return null;
  }
}

function cursorIdentity(row) {
  if (!isPlainObject(row)) return null;
  const identity = {
    memory_record_id: row.memory_record_id,
    version: row.version,
    content_hash: row.content_hash
  };
  if (
    typeof identity.memory_record_id !== "string" || identity.memory_record_id.trim() === ""
    || !Number.isSafeInteger(identity.version) || identity.version < 1
    || typeof identity.content_hash !== "string" || !/^[a-f0-9]{64}$/.test(identity.content_hash)
  ) return null;
  return identity;
}

function cursorAnchor(row) {
  const identity = cursorIdentity(row);
  if (identity === null) return null;
  return {
    memory_record_id_hash: canonicalFingerprint({ memory_record_id: identity.memory_record_id }),
    version: identity.version,
    content_hash: identity.content_hash
  };
}

function sameCursorAnchor(row, after) {
  const anchor = cursorAnchor(row);
  return anchor !== null
    && anchor.memory_record_id_hash === after.memory_record_id_hash
    && anchor.version === after.version
    && anchor.content_hash === after.content_hash;
}

function cursorMac(key, payload) {
  return createHmac("sha256", key).update(JSON.stringify(payload), "utf8").digest("hex");
}

function encodeRetrieveCursor(key, projectId, layer, row) {
  const anchor = cursorAnchor(row);
  if (anchor === null) return null;
  const payload = {
    v: 2,
    scope_hash: canonicalFingerprint({ project_id: projectId, layer }),
    ...anchor
  };
  const envelope = { ...payload, mac: cursorMac(key, payload) };
  const token = Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
  return token.length <= MAX_RETRIEVE_CURSOR_LENGTH ? token : null;
}

function decodeRetrieveCursor(key, token, projectId, layer) {
  try {
    if (
      typeof token !== "string" || token.length < 1 || token.length > MAX_RETRIEVE_CURSOR_LENGTH
      || !/^[A-Za-z0-9_-]+$/.test(token)
    ) return null;
    const decoded = Buffer.from(token, "base64url");
    if (decoded.toString("base64url") !== token) return null;
    const envelope = JSON.parse(decoded.toString("utf8"));
    if (!isPlainObject(envelope)) return null;
    const keys = Reflect.ownKeys(envelope);
    if (
      keys.length !== RETRIEVE_CURSOR_KEYS.length
      || keys.some((key) => typeof key !== "string" || !RETRIEVE_CURSOR_KEYS.includes(key))
      || RETRIEVE_CURSOR_KEYS.some((key) => !Object.prototype.hasOwnProperty.call(envelope, key))
    ) return null;
    const { mac, ...payload } = envelope;
    const expectedMac = cursorMac(key, payload);
    if (
      payload.v !== 2
      || payload.scope_hash !== canonicalFingerprint({ project_id: projectId, layer })
      || typeof payload.memory_record_id_hash !== "string" || !/^[a-f0-9]{64}$/.test(payload.memory_record_id_hash)
      || !Number.isSafeInteger(payload.version) || payload.version < 1
      || typeof payload.content_hash !== "string" || !/^[a-f0-9]{64}$/.test(payload.content_hash)
      || typeof mac !== "string" || !/^[a-f0-9]{64}$/.test(mac)
      || !timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(expectedMac, "hex"))
    ) return null;
    return Object.freeze({
      memory_record_id_hash: payload.memory_record_id_hash,
      version: payload.version,
      content_hash: payload.content_hash
    });
  } catch {
    return null;
  }
}

export class MemoryGatewayConfigurationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MemoryGatewayConfigurationError";
    this.code = code;
  }
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

function classificationRank(value) {
  return CLASSIFICATION_ORDER.indexOf(value);
}

function snapshotAtomicAppendResult(value) {
  try {
    if (!isPlainObject(value)) return null;
    const resultKeys = Reflect.ownKeys(value);
    if (
      resultKeys.some((key) => typeof key !== "string" || !ATOMIC_APPEND_RESULT_KEYS.includes(key))
      || ATOMIC_APPEND_RESULT_KEYS.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
    ) return null;
    const rawReceipt = value.receipt;
    const rawOutbox = value.outbox;
    if (!isPlainObject(rawOutbox)) return null;
    const outboxKeys = Reflect.ownKeys(rawOutbox);
    if (
      outboxKeys.some((key) => typeof key !== "string" || !OUTBOX_RECORD_KEYS.includes(key))
      || OUTBOX_RECORD_KEYS.some((key) => !Object.prototype.hasOwnProperty.call(rawOutbox, key))
    ) return null;
    const rawEvent = rawOutbox.event;
    if (!isPlainObject(rawEvent)) return null;
    const eventKeys = Reflect.ownKeys(rawEvent);
    if (
      eventKeys.some((key) => typeof key !== "string" || !OUTBOX_EVENT_KEYS.includes(key))
      || OUTBOX_EVENT_KEYS.some((key) => !Object.prototype.hasOwnProperty.call(rawEvent, key))
    ) return null;
    const receipt = snapshotStoreReceipt(rawReceipt);
    if (receipt === null) return null;
    const event = Object.fromEntries(OUTBOX_EVENT_KEYS.map((key) => [key, rawEvent[key]]));
    const outbox = Object.fromEntries(OUTBOX_RECORD_KEYS.filter((key) => key !== "event").map((key) => [key, rawOutbox[key]]));
    if (
      outbox.outbox_id !== event.outbox_id
      || outbox.event_fingerprint !== canonicalFingerprint(event)
      || !["PENDING", "IN_FLIGHT", "DELIVERED"].includes(outbox.delivery_status)
      || !Number.isSafeInteger(outbox.delivery_attempts)
      || outbox.delivery_attempts < 0
      || (outbox.delivery_status === "PENDING" && outbox.delivered_at !== null)
      || (outbox.delivery_status === "IN_FLIGHT" && (outbox.delivery_attempts < 1 || outbox.delivered_at !== null))
      || (outbox.delivery_status === "DELIVERED" && (
        outbox.delivery_attempts < 1
        || typeof outbox.delivered_at !== "string"
        || !Number.isFinite(Date.parse(outbox.delivered_at))
        || new Date(Date.parse(outbox.delivered_at)).toISOString() !== outbox.delivered_at
      ))
    ) return null;
    const { outbox_id: claimedId, ...eventBody } = event;
    if (canonicalFingerprint(eventBody) !== claimedId) return null;
    return { receipt, outbox: { ...outbox, event } };
  } catch {
    return null;
  }
}

async function boundedCall(operation, timeoutMs) {
  let timer;
  const operationPromise = Promise.resolve().then(operation).then(
    (value) => ({ status: "ok", value }),
    () => ({ status: "error" })
  );
  const timeoutPromise = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ status: "timeout" }), timeoutMs);
  });
  const outcome = await Promise.race([operationPromise, timeoutPromise]);
  clearTimeout(timer);
  return outcome;
}

export function createMemoryGateway({ layerStores, sodRules, now, ledgerWriter, replayResolver, timeouts, cursorMacKey } = {}) {
  // --- Fail-closed construction ------------------------------------------
  let layerNames;
  try {
    if (!isPlainObject(layerStores)) throw new Error("not a plain object");
    layerNames = Reflect.ownKeys(layerStores);
    if (layerNames.length === 0 || layerNames.some((name) => typeof name !== "string")) {
      throw new Error("empty or symbol-keyed layer map");
    }
  } catch {
    throw new MemoryGatewayConfigurationError("INVALID_LAYER_STORES", "createMemoryGateway requires a non-empty layerStores map");
  }
  const configuredLayers = [];
  for (const name of layerNames) {
    if (!LAYERS.includes(name)) {
      throw new MemoryGatewayConfigurationError("INVALID_LAYER", `Unknown memory layer configured: ${name}`);
    }
    let cfg;
    let cfgIsPlain;
    let store;
    let storeIsPlain;
    let append;
    let appendWithOutbox;
    let read;
    let readScoped;
    let withReadLease;
    let admission;
    let admissionIsPlain;
    let classificationCeiling;
    let ttlMs;
    let sod;
    try {
      cfg = layerStores[name];
      cfgIsPlain = isPlainObject(cfg);
      store = cfg?.store;
      storeIsPlain = isPlainObject(store);
      append = store?.append;
      appendWithOutbox = store?.appendWithOutbox;
      read = store?.read;
      readScoped = store?.readScoped;
      withReadLease = store?.withReadLease;
      admission = cfg?.admission;
      admissionIsPlain = isPlainObject(admission);
      classificationCeiling = admission?.classificationCeiling;
      ttlMs = admission?.ttlMs;
      sod = admission?.sod;
    } catch {
      throw new MemoryGatewayConfigurationError("INVALID_LAYER_CONFIG", `Layer ${name} configuration could not be snapshotted safely`);
    }
    if (
      !cfgIsPlain
      || !storeIsPlain
      || typeof append !== "function"
      || (appendWithOutbox !== undefined && typeof appendWithOutbox !== "function")
      || (readScoped !== undefined && typeof readScoped !== "function")
      || typeof read !== "function"
      || typeof withReadLease !== "function"
    ) {
      throw new MemoryGatewayConfigurationError(
        "INVALID_LAYER_STORE",
        `Layer ${name} requires append(), read(), and withReadLease() functions`
      );
    }
    if (!admissionIsPlain) {
      throw new MemoryGatewayConfigurationError("INVALID_ADMISSION_CONFIG", `Layer ${name} requires an admission config`);
    }
    if (!CLASSIFICATION_ORDER.includes(classificationCeiling)) {
      throw new MemoryGatewayConfigurationError("INVALID_ADMISSION_CONFIG", `Layer ${name} admission.classificationCeiling must be one of ${CLASSIFICATION_ORDER.join(", ")}`);
    }
    if (!Number.isInteger(ttlMs) || ttlMs <= 0) {
      throw new MemoryGatewayConfigurationError("INVALID_ADMISSION_CONFIG", `Layer ${name} admission.ttlMs must be a positive integer (TTL semantics as data)`);
    }
    if (!SOD_MODES.includes(sod)) {
      throw new MemoryGatewayConfigurationError("INVALID_ADMISSION_CONFIG", `Layer ${name} admission.sod must be one of ${SOD_MODES.join(", ")}`);
    }
    configuredLayers.push([name, Object.freeze({
      store: Object.freeze({
        append: Function.prototype.bind.call(append, store),
        ...(appendWithOutbox === undefined ? {} : { appendWithOutbox: Function.prototype.bind.call(appendWithOutbox, store) }),
        read: Function.prototype.bind.call(read, store),
        ...(readScoped === undefined ? {} : { readScoped: Function.prototype.bind.call(readScoped, store) }),
        withReadLease: Function.prototype.bind.call(withReadLease, store)
      }),
      admission: Object.freeze({ classificationCeiling, ttlMs, sod })
    })]);
  }
  let checkPairwiseDistinct;
  try {
    checkPairwiseDistinct = sodRules?.checkPairwiseDistinct;
  } catch {
    throw new MemoryGatewayConfigurationError("INVALID_SOD_RULES", "sodRules.checkPairwiseDistinct could not be inspected");
  }
  if (!isPlainObject(sodRules) || typeof checkPairwiseDistinct !== "function") {
    throw new MemoryGatewayConfigurationError("INVALID_SOD_RULES", "sodRules must expose a checkPairwiseDistinct function (kernel primitive reuse)");
  }
  const checkAdmissionSod = Function.prototype.bind.call(checkPairwiseDistinct, sodRules);
  if (typeof now !== "function") {
    throw new MemoryGatewayConfigurationError("INVALID_CLOCK", "createMemoryGateway requires a now() clock function (server-derived instants)");
  }
  if (typeof ledgerWriter !== "function") {
    throw new MemoryGatewayConfigurationError("INVALID_LEDGER_WRITER", "createMemoryGateway requires a ledgerWriter function (audit-first admission)");
  }
  if (replayResolver !== undefined && typeof replayResolver !== "function") {
    throw new MemoryGatewayConfigurationError("INVALID_REPLAY_RESOLVER", "replayResolver must be a function when durable replay is enabled");
  }
  let cursorMacKeySnapshot;
  try {
    if (!(cursorMacKey instanceof Uint8Array)) throw new Error("cursorMacKey is not bytes");
    cursorMacKeySnapshot = Buffer.from(cursorMacKey);
  } catch {
    throw new MemoryGatewayConfigurationError("INVALID_CURSOR_MAC_KEY", "cursorMacKey must be immutable server-owned key material");
  }
  if (cursorMacKeySnapshot.length < MIN_CURSOR_MAC_KEY_BYTES) {
    throw new MemoryGatewayConfigurationError("INVALID_CURSOR_MAC_KEY", `cursorMacKey must contain at least ${MIN_CURSOR_MAC_KEY_BYTES} bytes`);
  }
  let auditTimeoutMs;
  let replayTimeoutMs;
  try {
    if (timeouts !== undefined && !isPlainObject(timeouts)) throw new Error("timeouts is not an object");
    if (timeouts !== undefined && Reflect.ownKeys(timeouts).some((key) => typeof key !== "string" || !["audit_ms", "replay_ms"].includes(key))) {
      throw new Error("timeouts contains unknown fields");
    }
    auditTimeoutMs = timeouts?.audit_ms ?? DEFAULT_DEPENDENCY_TIMEOUTS.audit_ms;
    replayTimeoutMs = timeouts?.replay_ms ?? DEFAULT_DEPENDENCY_TIMEOUTS.replay_ms;
  } catch {
    throw new MemoryGatewayConfigurationError("INVALID_TIMEOUTS", "timeouts could not be snapshotted safely");
  }
  if (
    !Number.isSafeInteger(auditTimeoutMs)
    || auditTimeoutMs <= 0
    || auditTimeoutMs > MAX_NODE_TIMEOUT_MS
    || !Number.isSafeInteger(replayTimeoutMs)
    || replayTimeoutMs <= 0
    || replayTimeoutMs > MAX_NODE_TIMEOUT_MS
  ) {
    throw new MemoryGatewayConfigurationError("INVALID_TIMEOUTS", "audit_ms and replay_ms must be positive safe integers within the Node.js timer range");
  }

  // Snapshot of the layer configuration: later mutation of the caller's options
  // object cannot alter admission behavior. Store methods are bound once into
  // a frozen port facade; the underlying store object remains mutable so its
  // internal state can advance without permitting method-replacement TOCTOU.
  // appendWithOutbox is optional; when present, its atomic receipt is required.
  // It never waives the independent COMMITTED writer: an injected store receipt
  // alone is not proof that terminal evidence is actually durable.
  const layers = Object.freeze(
    Object.fromEntries(configuredLayers)
  );
  // Per-instance replay metadata. It anchors trusted time/fingerprint only and
  // is never terminal authority: every replay is freshly audited and must
  // verify the pre-existing durable row without append/upsert healing it. The
  // store-held read lease spans verification and terminal COMMITTED audit. The
  // atomic port additionally records a durable delivery outbox before the lease;
  // this closes the crash gap without trusting its receipt as sole audit proof.
  const committedAdmissions = new Map();

  // Server-derived instant: { ms, iso } or null when the clock is unusable.
  function serverInstant() {
    try {
      const epochMs = Date.prototype.getTime.call(now());
      if (!Number.isFinite(epochMs)) return null;
      return { ms: epochMs, iso: new Date(epochMs).toISOString() };
    } catch {
      return null;
    }
  }

  function deny(code, reason) {
    return deepFreeze({ decision: "DENY", code, reason });
  }

  // --- Admission shape validation (closed envelope) ----------------------
  function validateAdmitShape(request) {
    if (!isPlainObject(request)) return { code: "DENY_MALFORMED_REQUEST", reason: "Admission request must be an object" };
    const unknown = Object.keys(request).filter((key) => !ADMIT_KEYS.includes(key));
    if (unknown.length > 0) return { code: "DENY_MALFORMED_REQUEST", reason: `Unknown request fields: ${unknown.join(", ")}` };
    if (isBlank(request.layer)) return { code: "DENY_MALFORMED_REQUEST", reason: "layer must be a non-blank string" };
    if (!isPlainObject(request.record)) return { code: "DENY_MALFORMED_REQUEST", reason: "record must be an object" };
    const unknownRecord = Object.keys(request.record).filter((key) => !RECORD_KEYS.includes(key));
    if (unknownRecord.length > 0) return { code: "DENY_MALFORMED_REQUEST", reason: `Unknown record fields: ${unknownRecord.join(", ")}` };
    const missing = REQUIRED_RECORD_KEYS.filter((key) =>
      !Object.prototype.hasOwnProperty.call(request.record, key)
      || request.record[key] === undefined
      || (typeof request.record[key] === "string" && request.record[key].trim() === "")
    );
    if (missing.length > 0) return { code: "DENY_MISSING_FIELDS", reason: `Missing record fields: ${missing.join(", ")}` };
    if (!isPlainObject(request.admission)) return { code: "DENY_MALFORMED_REQUEST", reason: "admission must be an object" };
    const unknownAdmission = Object.keys(request.admission).filter((key) => !ADMISSION_KEYS.includes(key));
    if (unknownAdmission.length > 0) return { code: "DENY_MALFORMED_REQUEST", reason: `Unknown admission fields: ${unknownAdmission.join(", ")}` };
    if (isBlank(request.admission.producer)) return { code: "DENY_MISSING_FIELDS", reason: "admission.producer is required" };
    for (const key of ["reviewer", "approver"]) {
      if (request.admission[key] !== undefined && isBlank(request.admission[key])) {
        return { code: "DENY_MALFORMED_REQUEST", reason: `admission.${key}, when present, must be a non-blank string` };
      }
    }
    return null;
  }

  // Deny-by-default admission pipeline. Stage order is part of the contract
  // (tested): 1 shape -> 2 clock -> 3 layer -> 4 classification ceiling ->
  // 5 complete memoryRecord contract -> 6 admission SoD -> 7 audit-first ->
  // 8 store append (first admission only, atomically with terminal outbox when
  // supported) -> 9 leased durable verification + legacy terminal audit ->
  // ADMITTED.
  async function admit(request) {
    const shapeError = validateAdmitShape(request);
    if (shapeError) return deny(shapeError.code, shapeError.reason);

    // The actor attributed by the record must be the same producer evaluated by
    // admission SoD. Until a server-derived identity port is wired, disagreement
    // fails closed rather than allowing caller-controlled attribution drift.
    if (request.record.actor_id !== request.admission.producer) {
      return deny("DENY_PRODUCER_MISMATCH", "record.actor_id must match admission.producer");
    }

    // 2. Clock: server-derived instant only. A throwing/NaN clock denies.
    const instant = serverInstant();
    if (instant === null) return deny("DENY_CLOCK_UNAVAILABLE", "Server time source is unavailable");

    // 3. Layer must be a configured, known layer.
    const layer = layers[request.layer];
    if (!layer) return deny("DENY_UNKNOWN_LAYER", `Unknown or unconfigured memory layer: ${request.layer}`);

    // 4. Classification ceiling: unknown or above the layer ceiling denies.
    const rank = classificationRank(request.record.classification);
    if (rank === -1) {
      return deny("DENY_CLASSIFICATION_CEILING", `Unknown classification: ${request.record.classification}`);
    }
    if (rank > classificationRank(layer.admission.classificationCeiling)) {
      return deny(
        "DENY_CLASSIFICATION_CEILING",
        `Classification ${request.record.classification} exceeds ${request.layer} ceiling ${layer.admission.classificationCeiling}`
      );
    }

    const idempotencyKey = JSON.stringify([
      request.record.project_id,
      request.layer,
      request.record.memory_record_id,
      request.record.version
    ]);
    const priorAdmission = committedAdmissions.get(idempotencyKey);

    // 5. Build the stored record from the closed caller envelope plus server-owned
    // fields, then validate the real S2 memoryRecord contract. Contract failure
    // is contained before SoD, audit, or storage.
    let admittedRecord;
    try {
      admittedRecord = {
        memory_record_id: request.record.memory_record_id,
        version: request.record.version,
        project_id: request.record.project_id,
        work_package_id: request.record.work_package_id,
        session_id: request.record.session_id,
        actor_id: request.record.actor_id,
        layer: request.layer,
        source: request.record.source,
        statement: request.record.statement,
        classification: request.record.classification,
        confidence: request.record.confidence,
        provenance: structuredClone(request.record.provenance),
        valid_from: request.record.valid_from,
        valid_until: request.record.valid_until,
        retention_policy: request.record.retention_policy,
        admitted_at: priorAdmission?.admitted_at ?? instant.iso,
        ...(request.record.supersedes === undefined ? {} : { supersedes: request.record.supersedes }),
        content_hash: request.record.content_hash
      };
      validateContract("memoryRecord", admittedRecord);
      const { admitted_at, content_hash, ...hashBody } = admittedRecord;
      if (canonicalFingerprint(hashBody) !== content_hash) {
        return deny("DENY_CONTENT_HASH_MISMATCH", "Memory record content_hash does not match the canonical record body");
      }
      admittedRecord = deepFreeze(admittedRecord);
    } catch {
      return deny("DENY_MEMORY_RECORD_INVALID", "Memory record contract validation failed");
    }
    if (priorAdmission !== undefined && priorAdmission.content_hash !== admittedRecord.content_hash) {
      return deny("DENY_IDEMPOTENCY_CONFLICT", "Memory identity/version was already committed with different content");
    }

    // 6. Admission SoD — kernel primitive reuse, config-only. For the
    // distinct-approver mode (project layer): the memory's producer may not be
    // its sole approver; producer, approver (and reviewer if present) must be
    // pairwise-distinct. Lighter layers are honestly producer-only.
    if (layer.admission.sod === "distinct-approver") {
      if (isBlank(request.admission.approver)) {
        return deny("DENY_MISSING_FIELDS", `Layer ${request.layer} admission requires a distinct approver`);
      }
      const actors = [
        { role: "PRODUCER", actorId: request.admission.producer },
        { role: "APPROVER", actorId: request.admission.approver }
      ];
      if (!isBlank(request.admission.reviewer)) {
        actors.push({ role: "REV", actorId: request.admission.reviewer });
      }
      let sodResult;
      try {
        sodResult = checkAdmissionSod(actors, { code: "DENY_ADMISSION_SOD" });
      } catch {
        return deny("DENY_ADMISSION_SOD", "Admission separation-of-duties check failed");
      }
      if (!sodResult || sodResult.ok !== true) {
        return deny(sodResult?.code ?? "DENY_ADMISSION_SOD", sodResult?.message ?? "Admission separation-of-duties violated");
      }
    }

    // 7. Audit-first: the admission audit is written BEFORE any store mutation.
    // A throwing/unavailable audit writer denies with no store side effect.
    const attemptedAudit = await boundedCall(() => ledgerWriter({
        type: "MEMORY_ADMISSION_AUDIT",
        disposition: "ATTEMPTED",
        layer: request.layer,
        admitted_at: instant.iso,
        project_id: admittedRecord.project_id,
        actor_id: admittedRecord.actor_id,
        classification: admittedRecord.classification,
        memory_record_id: admittedRecord.memory_record_id,
        version: admittedRecord.version,
        content_hash: admittedRecord.content_hash,
        idempotency_key: idempotencyKey,
        replay: priorAdmission !== undefined
      }), auditTimeoutMs);
    if (attemptedAudit.status !== "ok") {
      return deny("DENY_AUDIT_UNAVAILABLE", "Audit ledger writer is unavailable; admission denied before store append");
    }

    // 8. Store append via the INJECTED layer store ONLY. The idempotency key is
    // deterministic for one project/layer/record/version identity; content
    // changes under that identity are conflicts. ALLOW requires both a
    // closed COMMITTED receipt, a valid atomic outbox receipt when supported,
    // and a matching read-back; a rejection, malformed
    // receipt, no-op, or lost acknowledgement is honestly reconciliation state.
    const dispositionBase = {
      type: "MEMORY_ADMISSION_DISPOSITION",
      layer: request.layer,
      admitted_at: instant.iso,
      project_id: admittedRecord.project_id,
      actor_id: admittedRecord.actor_id,
      classification: admittedRecord.classification,
      memory_record_id: admittedRecord.memory_record_id,
      version: admittedRecord.version,
      content_hash: admittedRecord.content_hash,
      idempotency_key: idempotencyKey,
      replay: priorAdmission !== undefined
    };

    async function writeDisposition(disposition, reason, details = {}) {
      const outcome = await boundedCall(
        () => ledgerWriter({ ...dispositionBase, disposition, ...(reason ? { reason } : {}), ...details }),
        auditTimeoutMs
      );
      return outcome.status === "ok";
    }

    function snapshotStoredRecord(row, expectedFingerprint = null) {
      try {
        if (!isPlainObject(row)) return null;
        if (
          row.project_id !== admittedRecord.project_id
          || row.layer !== admittedRecord.layer
          || row.memory_record_id !== admittedRecord.memory_record_id
          || row.version !== admittedRecord.version
          || row.content_hash !== admittedRecord.content_hash
        ) return null;
        const snapshot = structuredClone(row);
        validateContract("memoryRecord", snapshot);
        const { admitted_at, content_hash, ...storedHashBody } = snapshot;
        const { admitted_at: candidateInstant, content_hash: candidateHash, ...candidateHashBody } = admittedRecord;
        if (canonicalFingerprint(storedHashBody) !== content_hash) return null;
        if (canonicalFingerprint(storedHashBody) !== canonicalFingerprint(candidateHashBody)) return null;
        if (expectedFingerprint !== null && canonicalFingerprint(snapshot) !== expectedFingerprint) return null;
        return deepFreeze(snapshot);
      } catch {
        return null;
      }
    }

    async function readStoredRecord(expectedFingerprint = null) {
      try {
        const rows = await layer.store.read();
        if (!Array.isArray(rows)) return null;
        for (const row of rows) {
          const snapshot = snapshotStoredRecord(row, expectedFingerprint);
          if (snapshot !== null) return snapshot;
        }
        return null;
      } catch {
        return null;
      }
    }

    async function reconcile(reason) {
      const observed = await readStoredRecord();
      const auditRecorded = await writeDisposition("RECONCILIATION_REQUIRED", reason);
      return deepFreeze({
        decision: "RECONCILIATION_REQUIRED",
        code: "ADMISSION_RECONCILIATION_REQUIRED",
        reason,
        idempotency_key: idempotencyKey,
        record_observed: observed !== null,
        audit_recorded: auditRecorded
      });
    }

    async function decideUnderReadLease(expectedFingerprint, appendReceipt) {
      const selector = deepFreeze({
        project_id: admittedRecord.project_id,
        layer: admittedRecord.layer,
        memory_record_id: admittedRecord.memory_record_id,
        version: admittedRecord.version,
        content_hash: admittedRecord.content_hash,
        record_fingerprint: expectedFingerprint
      });
      let callbackCalls = 0;
      let completion;
      let replayAnchor = null;
      if (appendReceipt.created === false) {
        if (typeof replayResolver !== "function") {
          return { ok: false, reason: "DURABLE_REPLAY_UNVERIFIED" };
        }
        try {
          const anchorOutcome = await boundedCall(() => replayResolver({
            idempotency_key: idempotencyKey,
            project_id: admittedRecord.project_id,
            layer: admittedRecord.layer,
            memory_record_id: admittedRecord.memory_record_id,
            version: admittedRecord.version,
            content_hash: admittedRecord.content_hash
          }), replayTimeoutMs);
          if (anchorOutcome.status !== "ok") return { ok: false, reason: "DURABLE_REPLAY_UNVERIFIED" };
          const rawAnchor = anchorOutcome.value;
          if (!isPlainObject(rawAnchor) || Reflect.ownKeys(rawAnchor).some((key) => typeof key !== "string" || !REPLAY_ANCHOR_KEYS.includes(key))) {
            return { ok: false, reason: "DURABLE_REPLAY_UNVERIFIED" };
          }
          const missing = REPLAY_ANCHOR_KEYS.filter((key) => !Object.prototype.hasOwnProperty.call(rawAnchor, key));
          if (missing.length > 0) return { ok: false, reason: "DURABLE_REPLAY_UNVERIFIED" };
          replayAnchor = Object.fromEntries(REPLAY_ANCHOR_KEYS.map((key) => [key, rawAnchor[key]]));
          const admittedMs = Date.parse(replayAnchor.admitted_at);
          if (
            replayAnchor.status !== "COMMITTED"
            || replayAnchor.idempotency_key !== idempotencyKey
            || replayAnchor.project_id !== admittedRecord.project_id
            || replayAnchor.layer !== admittedRecord.layer
            || replayAnchor.memory_record_id !== admittedRecord.memory_record_id
            || replayAnchor.version !== admittedRecord.version
            || replayAnchor.content_hash !== admittedRecord.content_hash
            || !Number.isFinite(admittedMs)
            || new Date(admittedMs).toISOString() !== replayAnchor.admitted_at
          ) return { ok: false, reason: "DURABLE_REPLAY_UNVERIFIED" };
          replayAnchor = deepFreeze(replayAnchor);
        } catch {
          return { ok: false, reason: "DURABLE_REPLAY_UNVERIFIED" };
        }
      }
      try {
        const returned = await layer.store.withReadLease(selector, async (row) => {
          callbackCalls += 1;
          if (callbackCalls !== 1) throw new Error("read lease callback invoked more than once");
          const storedRecord = snapshotStoredRecord(row, expectedFingerprint);
          if (storedRecord === null) {
            completion = deepFreeze({ ok: false, reason: "STORE_LEASE_RECORD_MISSING_OR_CONFLICT" });
            return completion;
          }
          if (
            (appendReceipt.created === false && storedRecord.admitted_at !== replayAnchor.admitted_at)
            || (appendReceipt.created !== false && storedRecord.admitted_at !== admittedRecord.admitted_at)
          ) {
            completion = deepFreeze({ ok: false, reason: "UNVERIFIED_REPLAY_OR_TRUSTED_TIME_MISMATCH" });
            return completion;
          }
          if (!(await writeDisposition("COMMITTED", null, { admitted_at: storedRecord.admitted_at }))) {
            completion = deepFreeze({ ok: false, reason: "COMMIT_AUDIT_UNAVAILABLE" });
            return completion;
          }
          completion = deepFreeze({
            ok: true,
            result: {
              decision: "ALLOW",
              code: "ADMITTED",
              admitted_at: storedRecord.admitted_at,
              record: storedRecord,
              append: appendReceipt
            }
          });
          return completion;
        });
        if (callbackCalls !== 1 || returned !== completion) {
          return { ok: false, reason: "STORE_READ_LEASE_PROTOCOL_INVALID" };
        }
        return completion;
      } catch {
        return { ok: false, reason: "STORE_READ_LEASE_UNAVAILABLE" };
      }
    }

    if (priorAdmission !== undefined) {
      const replayDecision = await decideUnderReadLease(priorAdmission.record_fingerprint, priorAdmission.receipt);
      if (replayDecision.ok !== true) return reconcile(replayDecision.reason);
      return replayDecision.result;
    }

    let rawReceipt;
    try {
      if (typeof layer.store.appendWithOutbox === "function") {
        const rawAtomicResult = await layer.store.appendWithOutbox(admittedRecord, {
          idempotency_key: idempotencyKey,
          outbox_entry_factory(persistedRecord) {
            const eventBody = {
              type: "MEMORY_ADMISSION_DISPOSITION",
              disposition: "COMMITTED",
              idempotency_key: idempotencyKey,
              project_id: persistedRecord.project_id,
              layer: persistedRecord.layer,
              memory_record_id: persistedRecord.memory_record_id,
              version: persistedRecord.version,
              content_hash: persistedRecord.content_hash,
              admitted_at: persistedRecord.admitted_at,
              actor_id: persistedRecord.actor_id,
              classification: persistedRecord.classification
            };
            return { outbox_id: canonicalFingerprint(eventBody), ...eventBody };
          }
        });
        const atomicResult = snapshotAtomicAppendResult(rawAtomicResult);
        const event = atomicResult?.outbox.event;
        if (
          atomicResult === null
          || event.type !== "MEMORY_ADMISSION_DISPOSITION"
          || event.disposition !== "COMMITTED"
          || event.idempotency_key !== idempotencyKey
          || event.project_id !== admittedRecord.project_id
          || event.layer !== admittedRecord.layer
          || event.memory_record_id !== admittedRecord.memory_record_id
          || event.version !== admittedRecord.version
          || event.content_hash !== admittedRecord.content_hash
          || event.actor_id !== admittedRecord.actor_id
          || event.classification !== admittedRecord.classification
        ) return reconcile("STORE_ATOMIC_OUTBOX_RECEIPT_INVALID");
        rawReceipt = atomicResult.receipt;
      } else {
        rawReceipt = await layer.store.append(admittedRecord, { idempotency_key: idempotencyKey });
      }
    } catch {
      return reconcile("STORE_APPEND_REJECTED");
    }

    let receipt;
    try {
      const receiptSnapshot = snapshotStoreReceipt(rawReceipt);
      if (receiptSnapshot === null) return reconcile("STORE_RECEIPT_INVALID");
      if (
        receiptSnapshot.status !== "COMMITTED"
        || receiptSnapshot.idempotency_key !== idempotencyKey
        || receiptSnapshot.memory_record_id !== admittedRecord.memory_record_id
        || receiptSnapshot.version !== admittedRecord.version
        || receiptSnapshot.content_hash !== admittedRecord.content_hash
        || typeof receiptSnapshot.record_fingerprint !== "string"
        || !/^[a-f0-9]{64}$/.test(receiptSnapshot.record_fingerprint)
        || typeof receiptSnapshot.created !== "boolean"
        || (receiptSnapshot.sequence !== undefined && !(Number.isSafeInteger(receiptSnapshot.sequence) && receiptSnapshot.sequence > 0))
      ) return reconcile("STORE_RECEIPT_INVALID");
      receipt = deepFreeze({
        status: "COMMITTED",
        idempotency_key: idempotencyKey,
        memory_record_id: admittedRecord.memory_record_id,
        version: admittedRecord.version,
        content_hash: admittedRecord.content_hash,
        record_fingerprint: receiptSnapshot.record_fingerprint,
        created: receiptSnapshot.created,
        ...(receiptSnapshot.sequence === undefined ? {} : { sequence: receiptSnapshot.sequence })
      });
    } catch {
      return reconcile("STORE_RECEIPT_INVALID");
    }
    const firstDecision = await decideUnderReadLease(receipt.record_fingerprint, receipt);
    if (firstDecision.ok !== true) return reconcile(firstDecision.reason);
    const result = firstDecision.result;
    const storedRecord = result.record;
    committedAdmissions.set(idempotencyKey, deepFreeze({
      admitted_at: storedRecord.admitted_at,
      content_hash: storedRecord.content_hash,
      record_fingerprint: receipt.record_fingerprint,
      receipt
    }));
    return result;
  }

  // --- Retrieval shape validation ----------------------------------------
  function snapshotRetrieveQuery(query) {
    try {
      if (!isPlainObject(query)) return null;
      const proto = Object.getPrototypeOf(query);
      if (proto !== Object.prototype && proto !== null) return null;
      const ownKeys = Reflect.ownKeys(query);
      if (ownKeys.some((key) => typeof key !== "string" || !RETRIEVE_KEYS.includes(key))) return null;
      const snapshot = { __proto__: null };
      for (const key of RETRIEVE_KEYS) {
        if (ownKeys.includes(key)) snapshot[key] = query[key];
      }
      return snapshot;
    } catch {
      return null;
    }
  }

  function validateRetrieveShape(query) {
    if (!isPlainObject(query)) return { code: "DENY_MALFORMED_REQUEST", reason: "Retrieval query must be an object" };
    const unknown = Object.keys(query).filter((key) => !RETRIEVE_KEYS.includes(key));
    if (unknown.length > 0) return { code: "DENY_MALFORMED_REQUEST", reason: `Unknown query fields: ${unknown.join(", ")}` };
    const missing = REQUIRED_RETRIEVE_KEYS.filter((key) => isBlank(query[key]));
    if (missing.length > 0) return { code: "DENY_MISSING_FIELDS", reason: `Missing query fields: ${missing.join(", ")}` };
    if (
      (query.limit !== undefined && (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > MAX_RETRIEVE_LIMIT))
      || (query.cursor !== undefined && (
        typeof query.cursor !== "string" || query.cursor.length < 1 || query.cursor.length > MAX_RETRIEVE_CURSOR_LENGTH
        || !/^[A-Za-z0-9_-]+$/.test(query.cursor)
      ))
    ) return { code: "DENY_MALFORMED_REQUEST", reason: "Retrieval limit or cursor is malformed" };
    return null;
  }

  // Layer + project scoped reads. Cross-project access denies (no implicit
  // fallback); TTL-expired records are filtered honestly (computed, not stored);
  // surviving records are returned frozen and marked data_untrusted.
  function retrieve(query) {
    const querySnapshot = snapshotRetrieveQuery(query);
    if (querySnapshot === null) return deny("DENY_MALFORMED_REQUEST", "Retrieval query could not be snapshotted safely");
    const shapeError = validateRetrieveShape(querySnapshot);
    if (shapeError) return deny(shapeError.code, shapeError.reason);
    query = Object.freeze(querySnapshot);

    const instant = serverInstant();
    if (instant === null) return deny("DENY_CLOCK_UNAVAILABLE", "Server time source is unavailable");

    const layer = layers[query.layer];
    if (!layer) return deny("DENY_UNKNOWN_LAYER", `Unknown or unconfigured memory layer: ${query.layer}`);

    // Cross-project guard: the requested project must equal the caller's
    // authorized scope. No implicit cross-project fallback.
    if (query.project_id !== query.scope_project_id) {
      return deny("DENY_CROSS_PROJECT", `Cross-project retrieval denied: scope ${query.scope_project_id} may not read project ${query.project_id}`);
    }

    const limit = query.limit ?? DEFAULT_RETRIEVE_LIMIT;
    const cursor = query.cursor ?? null;
    const after = cursor === null ? null : decodeRetrieveCursor(cursorMacKeySnapshot, cursor, query.project_id, query.layer);
    if (cursor !== null && after === null) return deny("DENY_MALFORMED_REQUEST", "Retrieval cursor is invalid for this scope");
    let rows;
    let hasMore;
    let usedScopedPort = false;
    try {
      if (typeof layer.store.readScoped === "function") {
        usedScopedPort = true;
        const page = snapshotScopedPage(layer.store.readScoped({
          project_id: query.project_id,
          layer: query.layer,
          limit,
          after
        }));
        if (
          page === null
          || page.records.length > limit
          || (page.has_more && page.records.length !== limit)
        ) throw new Error("invalid scoped page");
        rows = page.records;
        hasMore = page.has_more;
      } else {
        const allRows = structuredClone(layer.store.read());
        if (!Array.isArray(allRows)) throw new Error("legacy store read did not return a list");
        const scopedRows = allRows.filter((row) => isPlainObject(row) && row.project_id === query.project_id && row.layer === query.layer);
        let offset = 0;
        if (after !== null) {
          const anchors = [];
          scopedRows.forEach((row, index) => {
            if (sameCursorAnchor(row, after)) anchors.push(index);
          });
          if (anchors.length !== 1) throw new Error("legacy cursor anchor is unavailable or ambiguous");
          offset = anchors[0] + 1;
        }
        rows = scopedRows.slice(offset, offset + limit);
        hasMore = offset + limit < scopedRows.length;
      }
    } catch {
      return deny("DENY_STORE_UNAVAILABLE", "Layer store read failed");
    }
    if (!Array.isArray(rows)) return deny("DENY_STORE_UNAVAILABLE", "Layer store read did not return a list");
    if (after !== null && rows.some((row) => sameCursorAnchor(row, after))) {
      return deny("DENY_STORE_UNAVAILABLE", "Layer store repeated the supplied cursor anchor");
    }

    let nextCursor = null;
    if (hasMore) {
      if (rows.length !== limit) return deny("DENY_STORE_UNAVAILABLE", "Layer store returned a non-progressing scoped page");
      nextCursor = encodeRetrieveCursor(cursorMacKeySnapshot, query.project_id, query.layer, rows.at(-1));
      if (nextCursor === null || nextCursor === cursor) {
        return deny("DENY_STORE_UNAVAILABLE", "Layer store returned an invalid or non-progressing scoped page");
      }
    }

    const records = [];
    try {
      for (const row of rows) {
        if (!isPlainObject(row)) {
          if (usedScopedPort) throw new Error("scoped row is malformed");
          continue;
        }
        if (row.project_id !== query.project_id || row.layer !== query.layer) {
          if (usedScopedPort) throw new Error("scoped row contamination");
          continue;
        }
        const admittedMs = Date.parse(row.admitted_at);
        if (!Number.isFinite(admittedMs)) {
          if (usedScopedPort) throw new Error("scoped row instant is invalid");
          continue;
        }
        // TTL honesty: expired-by-computation records are filtered, never returned.
        if (instant.ms >= admittedMs + layer.admission.ttlMs) continue;
        records.push(deepFreeze({ data_untrusted: true, record: structuredClone(row) }));
      }
    } catch {
      return deny("DENY_STORE_UNAVAILABLE", "Layer store returned an unreadable scoped page");
    }

    return deepFreeze({
      decision: "ALLOW",
      code: "RETRIEVED",
      retrieved_at: instant.iso,
      records: Object.freeze(records),
      next_cursor: nextCursor
    });
  }

  return Object.freeze({ admit, retrieve });
}
