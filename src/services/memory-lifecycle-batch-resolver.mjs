import { canonicalFingerprint } from "../contracts/canonical-fingerprint.mjs";

const ZERO_HASH = "0".repeat(64);
const MAX_BATCH = 1_000;
const INITIAL_KEYS = ["project_id", "layer", "gateway_retrieved_at", "gateway_authority_decision_id", "as_of", "records"];
const FINAL_KEYS = ["project_id", "layer", "as_of", "prior_batch_fingerprint", "prior_state_digest", "records"];
const INITIAL_RECORD_KEYS = ["request_index", "memory_record_id", "memory_record_version", "content_hash", "target_record_fingerprint"];
const FINAL_RECORD_KEYS = [...INITIAL_RECORD_KEYS, "state_fingerprint", "lifecycle_head_hash", "authority_decision_id"];
const FENCE_KEYS = ["fence_revision", "lifecycle_head_hash", "lifecycle_sequence"];

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const isHash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const isText = (value) => typeof value === "string" && value.trim() !== "" && value.length <= 512;

function exact(value, keys) {
  try {
    if (!isPlainObject(value) || Reflect.ownKeys(value).length !== keys.length
      || Reflect.ownKeys(value).some((key) => typeof key !== "string" || !keys.includes(key))) return null;
    return structuredClone(value);
  } catch { return null; }
}

function instant(now) {
  try {
    const ms = Date.prototype.getTime.call(now());
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  } catch { return null; }
}

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

export class MemoryLifecycleBatchResolverConfigurationError extends Error {
  constructor(code, message) { super(message); this.name = "MemoryLifecycleBatchResolverConfigurationError"; this.code = code; }
}

export class MemoryLifecycleBatchResolverError extends Error {
  constructor(code, message) { super(message); this.name = "MemoryLifecycleBatchResolverError"; this.code = code; }
}

export function createMemoryLifecycleBatchResolver({ lifecycleService, issuanceCoordinator, now } = {}) {
  let resolve;
  let fence;
  try { resolve = lifecycleService?.resolve; fence = issuanceCoordinator?.withIssuanceFence; } catch {
    throw new MemoryLifecycleBatchResolverConfigurationError("INVALID_BATCH_RESOLVER_DEPENDENCY", "batch resolver dependencies could not be inspected");
  }
  if (typeof resolve !== "function") throw new MemoryLifecycleBatchResolverConfigurationError("INVALID_LIFECYCLE_SERVICE", "lifecycleService.resolve is required");
  if (typeof fence !== "function") throw new MemoryLifecycleBatchResolverConfigurationError("INVALID_ISSUANCE_COORDINATOR", "issuanceCoordinator.withIssuanceFence is required");
  if (typeof now !== "function") throw new MemoryLifecycleBatchResolverConfigurationError("INVALID_BATCH_CLOCK", "trusted now clock is required");
  const resolveOne = Function.prototype.bind.call(resolve, lifecycleService);
  const runFence = Function.prototype.bind.call(fence, issuanceCoordinator);

  const snapshotRequest = (request) => {
    try {
      if (!isPlainObject(request)) return null;
      const final = Object.hasOwn(request, "prior_batch_fingerprint");
      const value = exact(request, final ? FINAL_KEYS : INITIAL_KEYS);
      const asOfMs = Date.parse(value?.as_of);
      const gatewayMs = final ? null : Date.parse(value?.gateway_retrieved_at);
      if (value === null || !isText(value.project_id) || !["session", "work", "project"].includes(value.layer)
        || !Array.isArray(value.records) || value.records.length > MAX_BATCH
        || !Number.isFinite(asOfMs) || new Date(asOfMs).toISOString() !== value.as_of
        || (!final && (!Number.isFinite(gatewayMs) || new Date(gatewayMs).toISOString() !== value.gateway_retrieved_at
          || gatewayMs > asOfMs || !isText(value.gateway_authority_decision_id)))
        || (final && (!isHash(value.prior_batch_fingerprint) || !isHash(value.prior_state_digest)))) return null;
      const recordKeys = final ? FINAL_RECORD_KEYS : INITIAL_RECORD_KEYS;
      const seen = new Set();
      for (const raw of value.records) {
        const item = exact(raw, recordKeys);
        if (item === null || !Number.isSafeInteger(item.request_index) || item.request_index < 0
          || item.request_index >= value.records.length || seen.has(item.request_index)
          || !isText(item.memory_record_id) || !Number.isSafeInteger(item.memory_record_version) || item.memory_record_version < 1
          || !isHash(item.content_hash) || !isHash(item.target_record_fingerprint)
          || (final && (!isHash(item.state_fingerprint) || !isHash(item.lifecycle_head_hash) || !isText(item.authority_decision_id)))) return null;
        seen.add(item.request_index);
      }
      return value;
    } catch { return null; }
  };

  const snapshotFence = (raw) => {
    const value = exact(raw, FENCE_KEYS);
    return value !== null && isHash(value.fence_revision) && isHash(value.lifecycle_head_hash)
      && Number.isSafeInteger(value.lifecycle_sequence) && value.lifecycle_sequence >= 0 ? value : null;
  };

  const snapshotResolution = (raw) => {
    try {
      if (!isPlainObject(raw)) return null;
      return structuredClone(raw);
    } catch { return null; }
  };

  async function evaluate(request, rawFence) {
    const input = snapshotRequest(request);
    const fence = snapshotFence(rawFence);
    const evaluatedAt = instant(now);
    if (input === null || fence === null || evaluatedAt === null) return freeze({ ok: false, code: "DENY_MEMORY_BATCH_REQUEST",
      project_id: input?.project_id ?? "unknown", layer: input?.layer ?? "project", evaluated_at: evaluatedAt ?? new Date(0).toISOString(),
      batch_fingerprint: canonicalFingerprint(input ?? {}), fence_revision: fence?.fence_revision ?? ZERO_HASH,
      lifecycle_head_hash: fence?.lifecycle_head_hash ?? ZERO_HASH, decisions: [] });
    const decisions = [];
    let headMismatch = false;
    for (const item of [...input.records].sort((left, right) => left.request_index - right.request_index)) {
      let result;
      try { result = snapshotResolution(await resolveOne({ project_id: input.project_id, layer: input.layer,
        memory_record_id: item.memory_record_id, memory_record_version: item.memory_record_version })); } catch { result = null; }
      const effectiveShape = result?.ok === true && result.code === "MEMORY_EFFECTIVE"
        && result.memory_record_id === item.memory_record_id && result.memory_record_version === item.memory_record_version
        && result.content_hash === item.content_hash && result.target_record_fingerprint === item.target_record_fingerprint
        && isHash(result.state_fingerprint) && isHash(result.lifecycle_head_hash) && isText(result.authority_decision_id);
      if (effectiveShape && result.lifecycle_head_hash !== fence.lifecycle_head_hash) headMismatch = true;
      const effective = effectiveShape && result.lifecycle_head_hash === fence.lifecycle_head_hash;
      decisions.push({ request_index: item.request_index, ok: effective, code: effective ? "MEMORY_EFFECTIVE" : "MEMORY_NOT_EFFECTIVE",
        memory_record_id: item.memory_record_id, memory_record_version: item.memory_record_version,
        content_hash: effective ? result.content_hash : item.content_hash,
        target_record_fingerprint: effective ? result.target_record_fingerprint : item.target_record_fingerprint,
        state_fingerprint: effective ? result.state_fingerprint : ZERO_HASH,
        lifecycle_head_hash: effective ? result.lifecycle_head_hash : ZERO_HASH,
        authority_decision_id: effective ? result.authority_decision_id : `DENIED:${result?.code ?? "UNAVAILABLE"}` });
    }
    const completedAt = instant(now);
    const allHeadsBound = !headMismatch
      && decisions.every((decision) => decision.ok === false || decision.lifecycle_head_hash === fence.lifecycle_head_hash);
    return freeze({ ok: completedAt !== null && allHeadsBound,
      code: completedAt === null ? "DENY_MEMORY_BATCH_CLOCK" : allHeadsBound ? "MEMORY_BATCH_RESOLVED" : "DENY_MEMORY_BATCH_HEAD_MISMATCH",
      project_id: input.project_id, layer: input.layer, evaluated_at: completedAt ?? evaluatedAt,
      batch_fingerprint: canonicalFingerprint(input), fence_revision: fence.fence_revision,
      lifecycle_head_hash: fence.lifecycle_head_hash, decisions });
  }

  async function within(request, callback) {
    const input = snapshotRequest(request);
    if (input === null || typeof callback !== "function") {
      throw new MemoryLifecycleBatchResolverError("DENY_MEMORY_BATCH_FENCE_REQUEST", "batch fence request is malformed");
    }
    let invoked = false;
    return runFence(freeze(structuredClone(input)), async (rawFence) => {
      if (invoked) throw new MemoryLifecycleBatchResolverError("DENY_MEMORY_BATCH_FENCE_REENTRY", "batch fence callback re-entered");
      invoked = true;
      const batch = await evaluate(input, rawFence);
      return callback(batch);
    });
  }

  return Object.freeze({
    resolveBatch(request) {
      if (snapshotRequest(request) === null) return Promise.resolve(freeze({ ok: false, code: "DENY_MEMORY_BATCH_REQUEST",
        project_id: "unknown", layer: "project", evaluated_at: instant(now) ?? new Date(0).toISOString(),
        batch_fingerprint: canonicalFingerprint({}), fence_revision: ZERO_HASH,
        lifecycle_head_hash: ZERO_HASH, decisions: [] }));
      return within(request, (batch) => batch);
    },
    withIssuanceFence(request, callback) { return within(request, callback); }
  });
}
