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

export class RuntimeRegistry {
  #entries = new Map();
  #policyCeiling;

  constructor({ policyCeiling = "A0" } = {}) {
    if (!AUTHORITY_LEVELS.includes(policyCeiling)) {
      throw new RegistryError("INVALID_POLICY_CEILING", `Unknown authority level: ${policyCeiling}`);
    }
    this.#policyCeiling = policyCeiling;
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

    if (this.#entries.has(candidate.agent_instance_id)) {
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
