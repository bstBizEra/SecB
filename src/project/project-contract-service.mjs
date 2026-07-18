import { createHash } from "node:crypto";
import {
  ContractValidationError,
  validateContract
} from "../contracts/contract-validator.mjs";

const TRANSITIONS = Object.freeze({
  DRAFT: ["REVIEW"],
  REVIEW: ["APPROVED_NOT_EFFECTIVE"],
  APPROVED_NOT_EFFECTIVE: ["ACTIVE", "REVOKED"],
  ACTIVE: ["SUSPENDED", "REVOKED"],
  SUSPENDED: ["ACTIVE", "REVOKED"],
  REVOKED: []
});

const REQUIRED_REQUEST_FIELDS = Object.freeze([
  "projectId",
  "version",
  "actorId",
  "authorityRef",
  "evidenceRefs",
  "idempotencyKey",
  "timestamp",
  "reasonCode"
]);

export class ProjectContractServiceError extends Error {
  constructor(code, message, details = []) {
    super(message);
    this.name = "ProjectContractServiceError";
    this.code = code;
    this.details = details;
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function fingerprint(value) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function deny(code, message, details) {
  throw new ProjectContractServiceError(code, message, details);
}

function resolutionDenied(code, state) {
  return Object.freeze({ allowed: false, code, state });
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export class ProjectContractService {
  #authorize;
  #now;
  #projects = new Map();
  #idempotency = new Map();
  #decisionIds = new Set();

  constructor({ authorize = () => ({ allowed: false }), now = () => new Date() } = {}) {
    if (typeof authorize !== "function" || typeof now !== "function") {
      deny("DENY_CONFIGURATION", "authorize and now must be functions");
    }
    this.#authorize = authorize;
    this.#now = now;
  }

  register(candidate) {
    try {
      validateContract("project", candidate);
    } catch (error) {
      if (error instanceof ContractValidationError) {
        deny("DENY_CONTRACT_INVALID", "Project Contract failed validation", error.errors);
      }
      throw error;
    }

    if (candidate.status !== "DRAFT") {
      deny("DENY_INITIAL_STATE", "A caller cannot register an already-authorized or effective contract");
    }

    const validFrom = Date.parse(candidate.valid_from);
    const validUntil = Date.parse(candidate.valid_until);
    if (!Number.isFinite(validFrom) || !Number.isFinite(validUntil) || validFrom >= validUntil) {
      deny("DENY_CONTRACT_WINDOW", "Project Contract has an invalid validity window");
    }

    const versions = this.#projects.get(candidate.project_id) ?? new Map();
    if (versions.has(candidate.version)) {
      deny(
        "DENY_DUPLICATE_PROJECT_VERSION",
        `Project Contract ${candidate.project_id} version ${candidate.version} already exists`
      );
    }

    const record = {
      projectId: candidate.project_id,
      version: candidate.version,
      state: "DRAFT",
      contract: { ...clone(candidate), approvals: [] },
      transitionVersion: 1,
      decisions: []
    };
    versions.set(candidate.version, record);
    this.#projects.set(candidate.project_id, versions);
    return clone(record);
  }

  submitForReview(request) {
    return this.#transition(request, "REVIEW");
  }

  approve(request) {
    return this.#transition(request, "APPROVED_NOT_EFFECTIVE");
  }

  activate(request) {
    const record = this.#find(request);
    this.#assertWindow(record);
    return this.#transition(request, "ACTIVE");
  }

  suspend(request) {
    return this.#transition(request, "SUSPENDED");
  }

  revoke(request) {
    return this.#transition(request, "REVOKED");
  }

  resolveEffective({ projectId, version } = {}) {
    const record = this.#find({ projectId, version });
    if (record.state === "SUSPENDED") return resolutionDenied("DENY_CONTRACT_SUSPENDED", record.state);
    if (record.state === "REVOKED") return resolutionDenied("DENY_CONTRACT_REVOKED", record.state);
    if (record.state !== "ACTIVE") return resolutionDenied("DENY_CONTRACT_NOT_ACTIVE", record.state);

    const now = this.#serverNow().getTime();
    if (now < Date.parse(record.contract.valid_from)) {
      return resolutionDenied("DENY_CONTRACT_NOT_YET_VALID", record.state);
    }
    if (now >= Date.parse(record.contract.valid_until)) {
      return resolutionDenied("DENY_CONTRACT_EXPIRED", record.state);
    }
    return deepFreeze({
      allowed: true,
      projectId: record.projectId,
      version: record.version,
      state: record.state,
      contract: clone(record.contract)
    });
  }

  #find(request) {
    if (!request || typeof request !== "object" || Array.isArray(request)) {
      deny("DENY_MALFORMED_REQUEST", "Request must be an object");
    }
    const { projectId, version } = request;
    if (typeof projectId !== "string" || projectId.length === 0) {
      deny("DENY_PROJECT_UNKNOWN", "Project identity is missing or unknown");
    }
    const versions = this.#projects.get(projectId);
    if (!versions) deny("DENY_PROJECT_UNKNOWN", `Project ${projectId} is unknown`);
    if (!Number.isInteger(version) || version < 1 || !versions.has(version)) {
      deny("DENY_PROJECT_VERSION_UNKNOWN", `Project ${projectId} version ${version} is unknown`);
    }
    return versions.get(version);
  }

  #assertRequest(request) {
    if (!request || typeof request !== "object" || Array.isArray(request)) {
      deny("DENY_MALFORMED_REQUEST", "Transition request must be an object");
    }
    const missing = REQUIRED_REQUEST_FIELDS.filter(
      (field) => request[field] === undefined || request[field] === null || request[field] === ""
    );
    if (missing.length > 0) {
      deny("DENY_MISSING_FIELDS", `Missing transition fields: ${missing.join(", ")}`);
    }
    if (!Number.isInteger(request.version) || request.version < 1) {
      deny("DENY_PROJECT_VERSION_UNKNOWN", "Project Contract version must be a positive integer");
    }
    for (const field of ["projectId", "actorId", "authorityRef", "reasonCode"]) {
      if (!isNonEmptyString(request[field])) {
        deny("DENY_INVALID_SCALAR", `${field} must be a non-empty string`);
      }
    }
    if (!isNonEmptyString(request.idempotencyKey)) {
      deny("DENY_INVALID_IDEMPOTENCY_KEY", "Idempotency key must be a non-empty string");
    }
    if (!Array.isArray(request.evidenceRefs) || request.evidenceRefs.length === 0) {
      deny("DENY_MISSING_EVIDENCE", "At least one evidence reference is required");
    }
    if (request.evidenceRefs.some((reference) => !isNonEmptyString(reference))) {
      deny("DENY_INVALID_EVIDENCE", "Evidence references must be non-empty strings");
    }
    if (!isNonEmptyString(request.timestamp) || !Number.isFinite(Date.parse(request.timestamp))) {
      deny("DENY_INVALID_TIMESTAMP", "Transition timestamp must be a valid date-time");
    }
  }

  #assertWindow(record) {
    const now = this.#serverNow().getTime();
    if (now < Date.parse(record.contract.valid_from)) {
      deny("DENY_CONTRACT_NOT_YET_VALID", "Project Contract validity window has not started");
    }
    if (now >= Date.parse(record.contract.valid_until)) {
      deny("DENY_CONTRACT_EXPIRED", "Project Contract validity window has expired");
    }
  }

  #serverNow() {
    const now = this.#now();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      deny("DENY_CONFIGURATION", "Server time source must return a valid Date");
    }
    return now;
  }

  #transition(request, requestedState) {
    this.#assertRequest(request);
    const requestFingerprint = fingerprint({ ...request, requestedState });
    const prior = this.#idempotency.get(request.idempotencyKey);
    if (prior) {
      if (prior.fingerprint !== requestFingerprint) {
        deny("DENY_IDEMPOTENCY_CONFLICT", "Idempotency key was reused for a different request");
      }
      return deepFreeze({ ...clone(prior.result), replayed: true });
    }

    const record = this.#find(request);
    if (!TRANSITIONS[record.state]?.includes(requestedState)) {
      deny(
        "DENY_UNDEFINED_TRANSITION",
        `Project Contract cannot transition from ${record.state} to ${requestedState}`
      );
    }

    const authority = this.#authorize({
      actorId: request.actorId,
      authorityRef: request.authorityRef,
      projectId: record.projectId,
      projectVersion: record.version,
      currentState: record.state,
      requestedState
    });
    if (
      !authority?.allowed ||
      typeof authority.decisionId !== "string" ||
      authority.decisionId.length === 0 ||
      authority.serverDerived !== true
    ) {
      deny("DENY_AUTHORITY", "Server-derived effective authority was not established");
    }
    if (this.#decisionIds.has(authority.decisionId)) {
      deny("DENY_DECISION_REUSE", "A governance decision cannot authorize more than one Project Contract transition");
    }

    const previousState = record.state;
    const previousVersion = record.transitionVersion;
    const transitionId = `tr_project_${requestFingerprint.slice(0, 24)}`;
    const result = deepFreeze({
      transitionId,
      projectId: record.projectId,
      contractVersion: record.version,
      previousVersion,
      transitionVersion: previousVersion + 1,
      previousState,
      state: requestedState,
      actorId: request.actorId,
      authorityDecisionId: authority.decisionId,
      evidenceRefs: [...request.evidenceRefs],
      idempotencyKey: request.idempotencyKey,
      timestamp: this.#serverNow().toISOString(),
      reasonCode: request.reasonCode,
      replayed: false
    });

    record.state = requestedState;
    record.contract.status = requestedState;
    if (requestedState === "APPROVED_NOT_EFFECTIVE") {
      record.contract.approvals.push(authority.decisionId);
    }
    record.transitionVersion += 1;
    record.decisions.push(authority.decisionId);
    this.#decisionIds.add(authority.decisionId);
    this.#idempotency.set(request.idempotencyKey, { fingerprint: requestFingerprint, result });
    return result;
  }
}
