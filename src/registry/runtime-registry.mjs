import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const schema = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "..", "..", "contracts", "agent-registration.schema.json"), "utf8")
);
const ajv = new Ajv2020({ allErrors: true, strict: true, useDefaults: true });
addFormats(ajv);
const validate = ajv.compile(schema);

const AUTHORITY_LEVELS = ["A0", "A1", "A2", "A3", "A4", "A5"];

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

  constructor({ policyCeiling = "A0" } = {}) {
    if (!AUTHORITY_LEVELS.includes(policyCeiling)) {
      throw new RegistryError("INVALID_POLICY_CEILING", `Unknown authority level: ${policyCeiling}`);
    }
    this.#policyCeiling = policyCeiling;
  }

  register(record) {
    const candidate = structuredClone(record);
    if (!validate(candidate)) {
      throw new RegistryError(
        "DENY_INVALID_REGISTRATION",
        `Agent registration failed schema validation`,
      );
    }

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
