import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createAjv } from "../contracts/lazy-ajv.mjs";

const schema = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "..", "..", "contracts", "agent-registration.schema.json"), "utf8")
);
// Compiled on first validation, not at import — see lazy-ajv.mjs.
let validate = null;
const getValidate = () => (validate ??= createAjv({ allErrors: true, strict: true, useDefaults: true }).compile(schema));

const AUTHORITY_LEVELS = ["A0", "A1", "A2", "A3", "A4", "A5"];
const RUFLO_PROVIDER_ID = "PROVIDER-RUFLO";
const RUFLO_PRODUCT_ID = "ruflo";
const RUFLO_DEPLOYMENT_ID = "RT-RUFLO-LOCAL-001";

const EVALUATION_TRANSITIONS = Object.freeze({
  CANDIDATE: ["APPROVED", "REVOKED"],
  APPROVED: ["SUSPENDED", "REVOKED"],
  SUSPENDED: ["APPROVED", "REVOKED"],
  REVOKED: []
});

const LIFECYCLE_TRANSITIONS = Object.freeze({
  PENDING: ["ACTIVE", "TERMINATED"],
  ACTIVE: ["DEACTIVATED", "TERMINATED"],
  DEACTIVATED: ["ACTIVE", "TERMINATED"],
  TERMINATED: []
});

export class RegistryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RegistryError";
    this.code = code;
  }
}

// Normalize an agent_instance_id for duplicate-identity comparison only: trim
// surrounding whitespace, apply Unicode NFC normalization (so visually
// identical NFC/NFD-confusable forms compare equal), then case-fold. This is
// used exclusively to detect "same-looking" identities at registration time
// (F-IDNORM); the registry continues to store and key every entry on the
// caller's original, unmodified agent_instance_id, so all other lookups
// (get/resolve/transition*) are unaffected and existing exact-match behavior
// is preserved.
function normalizeIdentifierForComparison(value) {
  return typeof value === "string" ? value.trim().normalize("NFC").toLowerCase() : value;
}

export class RuntimeRegistry {
  #entries = new Map();
  #normalizedIds = new Map();
  #policyCeiling;
  #runtimeProviderResolver;

  constructor({ policyCeiling = "A0", runtimeProviderResolver = null } = {}) {
    if (!AUTHORITY_LEVELS.includes(policyCeiling)) {
      throw new RegistryError("INVALID_POLICY_CEILING", `Unknown authority level: ${policyCeiling}`);
    }
    if (runtimeProviderResolver !== null && typeof runtimeProviderResolver !== "function") {
      throw new RegistryError("INVALID_PLUGIN_RESOLVER", "runtimeProviderResolver must be a function or null");
    }
    this.#policyCeiling = policyCeiling;
    this.#runtimeProviderResolver = runtimeProviderResolver;
  }

  #requiresRuntimeProviderBinding(record) {
    return record.runtime_provider_plugin_id !== undefined
      || record.runtime_provider_plugin_version !== undefined
      || record.runtime_provider_plugin_fingerprint !== undefined
      || record.provider_id === RUFLO_PROVIDER_ID
      || record.runtime_product_id === RUFLO_PRODUCT_ID
      || record.runtime_deployment_id === RUFLO_DEPLOYMENT_ID;
  }

  #assertRuntimeProviderBinding(record, { requireEffective = false } = {}) {
    if (!this.#requiresRuntimeProviderBinding(record)) return;
    if (
      record.runtime_provider_plugin_id === undefined
      || record.runtime_provider_plugin_version === undefined
      || record.runtime_provider_plugin_fingerprint === undefined
    ) {
      throw new RegistryError("DENY_PLUGIN_BINDING_REQUIRED", "Known plugin-backed runtime requires an exact plugin binding");
    }
    if (!this.#runtimeProviderResolver) {
      throw new RegistryError(
        "DENY_PLUGIN_BINDING_UNAVAILABLE",
        "Plugin-backed registration requires a SecB-owned runtime provider resolver"
      );
    }
    let binding;
    try {
      binding = this.#runtimeProviderResolver({
        plugin_id: record.runtime_provider_plugin_id,
        plugin_version: record.runtime_provider_plugin_version
      });
    } catch {
      throw new RegistryError("DENY_PLUGIN_BINDING_UNAVAILABLE", "Runtime provider binding could not be resolved");
    }
    if (binding && typeof binding.then === "function") {
      throw new RegistryError("DENY_PLUGIN_BINDING_UNAVAILABLE", "Runtime provider resolver must be synchronous");
    }
    const expected = {
      plugin_id: record.runtime_provider_plugin_id,
      plugin_version: record.runtime_provider_plugin_version,
      descriptor_fingerprint: record.runtime_provider_plugin_fingerprint,
      provider_id: record.provider_id,
      runtime_product_id: record.runtime_product_id,
      runtime_deployment_id: record.runtime_deployment_id
    };
    if (binding?.resolved !== true || Object.entries(expected).some(([field, value]) => binding[field] !== value)) {
      throw new RegistryError("DENY_PLUGIN_BINDING_MISMATCH", "Runtime provider binding does not match SecB registry state");
    }
    if (requireEffective && binding.operationally_effective !== true) {
      throw new RegistryError("DENY_PLUGIN_NOT_EFFECTIVE", "Runtime provider plugin and deployment are not operationally effective");
    }
  }

  register(record) {
    const candidate = structuredClone(record);
    const check = getValidate();
    if (!check(candidate)) {
      throw new RegistryError(
        "DENY_INVALID_REGISTRATION",
        `Agent registration failed schema validation`,
      );
    }

    this.#assertRuntimeProviderBinding(candidate);

    const normalizedId = normalizeIdentifierForComparison(candidate.agent_instance_id);
    if (this.#entries.has(candidate.agent_instance_id) || this.#normalizedIds.has(normalizedId)) {
      throw new RegistryError("DENY_DUPLICATE_INSTANCE", `Instance already registered: ${candidate.agent_instance_id}`);
    }

    if (AUTHORITY_LEVELS.indexOf(candidate.authority_ceiling) > AUTHORITY_LEVELS.indexOf(this.#policyCeiling)) {
      throw new RegistryError(
        "DENY_CEILING_EXCEEDED",
        `Authority ceiling ${candidate.authority_ceiling} exceeds policy ceiling ${this.#policyCeiling}`
      );
    }

    if (candidate.evaluation_status !== "CANDIDATE") {
      throw new RegistryError("DENY_INITIAL_STATUS", "New registrations must start as CANDIDATE");
    }
    if (candidate.lifecycle_state !== "PENDING") {
      throw new RegistryError("DENY_INITIAL_STATE", "New registrations must start as PENDING");
    }

    const versioned = Object.freeze({ ...candidate, _version: 1 });
    this.#entries.set(candidate.agent_instance_id, versioned);
    this.#normalizedIds.set(normalizedId, candidate.agent_instance_id);
    return { registered: true, agent_instance_id: candidate.agent_instance_id, version: 1 };
  }

  get(instanceId) {
    const entry = this.#entries.get(instanceId);
    if (!entry) return null;
    return entry;
  }

  resolve(instanceId) {
    const entry = this.#entries.get(instanceId);
    if (!entry) {
      return { resolved: false, quarantined: true, reason: "Unknown agent instance" };
    }
    if (entry.evaluation_status !== "APPROVED") {
      return { resolved: false, quarantined: true, reason: `Evaluation status is ${entry.evaluation_status}, not APPROVED` };
    }
    if (entry.lifecycle_state !== "ACTIVE") {
      return { resolved: false, quarantined: true, reason: `Lifecycle state is ${entry.lifecycle_state}, not ACTIVE` };
    }
    try {
      this.#assertRuntimeProviderBinding(entry, { requireEffective: true });
    } catch (error) {
      return {
        resolved: false,
        quarantined: true,
        reason: error instanceof RegistryError ? error.code : "DENY_PLUGIN_BINDING_UNAVAILABLE"
      };
    }
    return {
      resolved: true,
      quarantined: false,
      identity: {
        provider_id: entry.provider_id,
        runtime_product_id: entry.runtime_product_id,
        runtime_deployment_id: entry.runtime_deployment_id,
        agent_profile_id: entry.agent_profile_id,
        agent_instance_id: entry.agent_instance_id,
        permitted_roles: [...entry.permitted_roles],
        authority_ceiling: entry.authority_ceiling,
        repository_scopes: [...entry.repository_scopes],
        project_scopes: [...entry.project_scopes],
        environment_scopes: [...entry.environment_scopes],
        max_data_classification: entry.max_data_classification
      }
    };
  }

  transitionEvaluation(instanceId, requestedStatus, { expectedVersion } = {}) {
    const entry = this.#entries.get(instanceId);
    if (!entry) {
      throw new RegistryError("DENY_UNKNOWN_INSTANCE", `Instance not found: ${instanceId}`);
    }
    if (expectedVersion !== undefined && entry._version !== expectedVersion) {
      throw new RegistryError("DENY_VERSION_CONFLICT", `Expected version ${expectedVersion}, actual ${entry._version}`);
    }
    if (requestedStatus === "APPROVED") {
      this.#assertRuntimeProviderBinding(entry, { requireEffective: true });
    }

    const allowed = EVALUATION_TRANSITIONS[entry.evaluation_status];
    if (!allowed || !allowed.includes(requestedStatus)) {
      throw new RegistryError(
        "DENY_EVALUATION_TRANSITION",
        `Cannot transition evaluation from ${entry.evaluation_status} to ${requestedStatus}`
      );
    }

    const nextVersion = entry._version + 1;
    const updated = Object.freeze({ ...entry, evaluation_status: requestedStatus, _version: nextVersion });
    this.#entries.set(instanceId, updated);
    return { previous: entry.evaluation_status, current: requestedStatus, version: nextVersion };
  }

  transitionLifecycle(instanceId, requestedState, { expectedVersion } = {}) {
    const entry = this.#entries.get(instanceId);
    if (!entry) {
      throw new RegistryError("DENY_UNKNOWN_INSTANCE", `Instance not found: ${instanceId}`);
    }
    if (expectedVersion !== undefined && entry._version !== expectedVersion) {
      throw new RegistryError("DENY_VERSION_CONFLICT", `Expected version ${expectedVersion}, actual ${entry._version}`);
    }
    if (requestedState === "ACTIVE") {
      this.#assertRuntimeProviderBinding(entry, { requireEffective: true });
    }

    const allowed = LIFECYCLE_TRANSITIONS[entry.lifecycle_state];
    if (!allowed || !allowed.includes(requestedState)) {
      throw new RegistryError(
        "DENY_LIFECYCLE_TRANSITION",
        `Cannot transition lifecycle from ${entry.lifecycle_state} to ${requestedState}`
      );
    }

    const nextVersion = entry._version + 1;
    const updated = Object.freeze({ ...entry, lifecycle_state: requestedState, _version: nextVersion });
    this.#entries.set(instanceId, updated);
    return { previous: entry.lifecycle_state, current: requestedState, version: nextVersion };
  }

  listByProduct(runtimeProductId) {
    return [...this.#entries.values()].filter((e) => e.runtime_product_id === runtimeProductId);
  }

  listByProvider(providerId) {
    return [...this.#entries.values()].filter((e) => e.provider_id === providerId);
  }

  listByDeployment(deploymentId) {
    return [...this.#entries.values()].filter((e) => e.runtime_deployment_id === deploymentId);
  }

  get size() {
    return this.#entries.size;
  }
}

export { AUTHORITY_LEVELS, EVALUATION_TRANSITIONS, LIFECYCLE_TRANSITIONS };
