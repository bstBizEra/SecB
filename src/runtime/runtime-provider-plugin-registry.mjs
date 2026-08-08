import { canonicalFingerprint } from "../contracts/canonical-fingerprint.mjs";
import { validateContract } from "../contracts/contract-validator.mjs";

const REQUEST_KEYS = Object.freeze(["descriptor", "idempotency_key"]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

function frozenClone(value) {
  return deepFreeze(structuredClone(value));
}

export class RuntimeProviderPluginRegistryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RuntimeProviderPluginRegistryError";
    this.code = code;
  }
}

function deny(code, message) {
  throw new RuntimeProviderPluginRegistryError(code, message);
}

/**
 * Candidate-only registry for author-declared runtime provider plugins.
 *
 * It deliberately has no promote(), activate(), authorize(), or resolveForExecution()
 * method. Operational grants remain a separate, future SecB-owned trust tier.
 */
export class RuntimeProviderPluginRegistry {
  #auditWriter;
  #now;
  #candidates = new Map();
  #idempotency = new Map();
  #inFlightByIdempotency = new Map();
  #inFlightByPlugin = new Map();

  constructor({ auditWriter, now = () => new Date() } = {}) {
    if (typeof auditWriter !== "function") deny("INVALID_AUDIT_WRITER", "auditWriter is required");
    if (typeof now !== "function") deny("INVALID_CLOCK", "now must be a function");
    this.#auditWriter = auditWriter;
    this.#now = now;
  }

  async registerCandidate(request) {
    if (!isPlainObject(request)) deny("DENY_MALFORMED_REQUEST", "Registration request must be an object");
    const unknown = Object.keys(request).filter((key) => !REQUEST_KEYS.includes(key));
    if (unknown.length > 0) deny("DENY_MALFORMED_REQUEST", `Unknown registration fields: ${unknown.join(", ")}`);
    if (!isPlainObject(request.descriptor)) deny("DENY_MALFORMED_REQUEST", "descriptor must be an object");
    if (typeof request.idempotency_key !== "string" || request.idempotency_key.trim() === "") {
      deny("DENY_IDEMPOTENCY_KEY", "idempotency_key is required");
    }

    try {
      validateContract("runtimeProviderPlugin", request.descriptor);
    } catch (error) {
      deny(error?.code ?? "DENY_CONTRACT_INVALID", error?.message ?? "Runtime provider plugin contract is invalid");
    }
    if (request.descriptor.candidate_status !== "CANDIDATE") {
      deny("DENY_PLUGIN_NOT_CANDIDATE", "Only CANDIDATE descriptors may enter the candidate registry");
    }

    const descriptor = structuredClone(request.descriptor);
    const fingerprint = canonicalFingerprint(descriptor);
    const key = `${descriptor.plugin_id}@${descriptor.plugin_version}`;
    const priorReplay = this.#idempotency.get(request.idempotency_key);
    if (priorReplay) {
      if (priorReplay.fingerprint !== fingerprint || priorReplay.key !== key) {
        deny("DENY_IDEMPOTENCY_CONFLICT", "idempotency_key was reused for a different plugin candidate");
      }
      return frozenClone({ ...priorReplay.record, replayed: true });
    }

    const pendingReplay = this.#inFlightByIdempotency.get(request.idempotency_key);
    if (pendingReplay) {
      if (pendingReplay.fingerprint !== fingerprint || pendingReplay.key !== key) {
        deny("DENY_IDEMPOTENCY_CONFLICT", "idempotency_key is already in flight for a different plugin candidate");
      }
      const record = await pendingReplay.promise;
      return frozenClone({ ...record, replayed: true });
    }
    if (this.#candidates.has(key)) {
      deny("DENY_PLUGIN_VERSION_EXISTS", `Plugin candidate already exists: ${key}`);
    }
    if (this.#inFlightByPlugin.has(key)) {
      deny("DENY_PLUGIN_VERSION_IN_FLIGHT", `Plugin candidate registration is already in flight: ${key}`);
    }

    let epoch;
    try {
      epoch = Date.prototype.getTime.call(this.#now());
    } catch {
      deny("DENY_CLOCK_UNAVAILABLE", "Server time source is unavailable");
    }
    if (!Number.isFinite(epoch)) deny("DENY_CLOCK_UNAVAILABLE", "Server time source is unavailable");
    const registeredAt = new Date(epoch).toISOString();

    const operation = (async () => {
      const record = deepFreeze({
        plugin_id: descriptor.plugin_id,
        plugin_version: descriptor.plugin_version,
        status: "CANDIDATE",
        operationally_effective: false,
        registered_at: registeredAt,
        descriptor_fingerprint: fingerprint,
        descriptor: deepFreeze(descriptor)
      });

      try {
        await this.#auditWriter({
          type: "RUNTIME_PROVIDER_PLUGIN_CANDIDATE_REGISTERED",
          plugin_id: record.plugin_id,
          plugin_version: record.plugin_version,
          descriptor_fingerprint: fingerprint,
          registered_at: registeredAt,
          status: record.status,
          operationally_effective: false
        });
      } catch {
        deny("DENY_AUDIT_UNAVAILABLE", "Plugin candidate registration audit is unavailable");
      }

      this.#candidates.set(key, record);
      this.#idempotency.set(request.idempotency_key, { key, fingerprint, record });
      return record;
    })();

    const reservation = { key, fingerprint, promise: operation };
    this.#inFlightByIdempotency.set(request.idempotency_key, reservation);
    this.#inFlightByPlugin.set(key, reservation);
    try {
      const record = await operation;
      return frozenClone({ ...record, replayed: false });
    } finally {
      if (this.#inFlightByIdempotency.get(request.idempotency_key) === reservation) {
        this.#inFlightByIdempotency.delete(request.idempotency_key);
      }
      if (this.#inFlightByPlugin.get(key) === reservation) {
        this.#inFlightByPlugin.delete(key);
      }
    }
  }

  getCandidate(pluginId, pluginVersion) {
    if (typeof pluginId !== "string" || typeof pluginVersion !== "string") {
      deny("DENY_MALFORMED_REQUEST", "pluginId and pluginVersion must be strings");
    }
    const record = this.#candidates.get(`${pluginId}@${pluginVersion}`);
    return record ? frozenClone(record) : null;
  }

  listCandidates() {
    return frozenClone([...this.#candidates.values()]);
  }
}
