import { canonicalFingerprint } from "../contracts/canonical-fingerprint.mjs";

export const STATE_MACHINES = Object.freeze({
  Project: {
    DRAFT: ["REVIEW"],
    REVIEW: ["APPROVED_NOT_EFFECTIVE"],
    APPROVED_NOT_EFFECTIVE: ["ACTIVE", "REVOKED"],
    ACTIVE: ["SUSPENDED", "CLOSED", "REVOKED"],
    SUSPENDED: ["ACTIVE", "CLOSED", "REVOKED"],
    CLOSED: [],
    REVOKED: []
  },
  WorkPackage: {
    DRAFT: ["PLANNED", "CANCELLED"],
    PLANNED: ["REVIEWED", "CANCELLED"],
    REVIEWED: ["AUTHORIZED", "REWORK", "CANCELLED"],
    AUTHORIZED: ["READY", "REVOKED", "CANCELLED"],
    READY: ["RUNNING", "BLOCKED", "CANCELLED"],
    RUNNING: ["SELF_VERIFIED", "BLOCKED", "QUARANTINED", "CANCELLED"],
    SELF_VERIFIED: ["REVIEW", "REWORK"],
    REVIEW: ["QA", "REWORK", "BLOCKED"],
    QA: ["GOV_DECISION", "REWORK", "BLOCKED"],
    GOV_DECISION: ["ACCEPTED", "REWORK", "BLOCKED", "QUARANTINED", "CANCELLED"],
    ACCEPTED: [],
    REWORK: ["PLANNED", "CANCELLED"],
    BLOCKED: ["PLANNED", "CANCELLED"],
    QUARANTINED: ["CANCELLED"],
    CANCELLED: [],
    REVOKED: []
  },
  Session: {
    CREATED: ["CONTEXT_BINDING", "TERMINATED"],
    CONTEXT_BINDING: ["READY", "BLOCKED", "TERMINATED"],
    READY: ["RUNNING", "TERMINATED"],
    RUNNING: ["REVIEW_HANDOFF", "PAUSED", "BLOCKED", "QUARANTINED", "FAILED", "TERMINATED"],
    PAUSED: ["RUNNING", "TERMINATED"],
    REVIEW_HANDOFF: ["COMPLETED", "REWORK"],
    REWORK: ["READY", "TERMINATED"],
    BLOCKED: ["READY", "TERMINATED"],
    QUARANTINED: ["TERMINATED"],
    FAILED: ["RECOVERING", "TERMINATED"],
    RECOVERING: ["READY", "TERMINATED"],
    COMPLETED: [],
    TERMINATED: []
  },
  Evidence: {
    CAPTURED: ["SEALED", "QUARANTINED"],
    SEALED: ["VERIFICATION_PENDING", "QUARANTINED"],
    VERIFICATION_PENDING: ["VERIFIED", "REJECTED", "QUARANTINED"],
    VERIFIED: ["ACCEPTED", "REJECTED", "SUPERSEDED", "QUARANTINED"],
    ACCEPTED: ["SUPERSEDED", "QUARANTINED"],
    REJECTED: [],
    SUPERSEDED: [],
    QUARANTINED: []
  }
});

const requiredFields = [
  "objectType",
  "objectId",
  "objectVersion",
  "projectId",
  "workPackageId",
  "currentState",
  "requestedState",
  "actorId",
  "authorityRef",
  "policyDecision",
  "evidenceRefs",
  "idempotencyKey",
  "reasonCode"
];

// TE-H1: strict scalar validation. Every required field except
// objectVersion/evidenceRefs must be a non-blank string; the request is a
// closed envelope (unknown keys deny). TE-H2: `timestamp` is an OPTIONAL
// caller claim retained as metadata; authoritative timestamps are
// server-derived and the claim is excluded from the idempotency
// fingerprint so replays are not broken by clock drift.
const requiredStringFields = requiredFields.filter((field) => !["objectVersion", "evidenceRefs"].includes(field));

const allowedRequestKeys = new Set([
  ...requiredFields,
  "timestamp",
  "producerActorId",
  "reviewerActorId",
  "qaActorId",
  "evidenceVerifierActorId"
]);

function isBlankString(value) {
  return typeof value !== "string" || value.trim() === "";
}

export class TransitionDeniedError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TransitionDeniedError";
    this.code = code;
  }
}

export class TransitionEngine {
  #authorize;
  #now;
  #idempotency = new Map();

  constructor({
    authorize = () => ({ allowed: false, reason: "authority resolver not configured" }),
    now = () => new Date()
  } = {}) {
    this.#authorize = authorize;
    this.#now = now;
  }

  transition(request) {
    if (!request || typeof request !== "object" || Array.isArray(request)) {
      throw new TransitionDeniedError("DENY_MALFORMED_REQUEST", "Transition request must be an object");
    }

    const unknownKeys = Object.keys(request).filter((key) => !allowedRequestKeys.has(key));
    if (unknownKeys.length > 0) {
      throw new TransitionDeniedError("DENY_MALFORMED_REQUEST", `Unknown transition fields: ${unknownKeys.join(", ")}`);
    }
    const missing = requiredFields.filter((field) => request[field] === undefined || request[field] === null || request[field] === "");
    if (missing.length > 0) {
      throw new TransitionDeniedError("DENY_MISSING_FIELDS", `Missing transition fields: ${missing.join(", ")}`);
    }
    const malformed = requiredStringFields.filter((field) => isBlankString(request[field]));
    if (malformed.length > 0) {
      throw new TransitionDeniedError("DENY_MALFORMED_REQUEST", `Fields must be non-blank strings: ${malformed.join(", ")}`);
    }
    if (request.timestamp !== undefined && isBlankString(request.timestamp)) {
      throw new TransitionDeniedError("DENY_MALFORMED_REQUEST", "timestamp, when present, must be a non-blank string");
    }
    if (!Number.isInteger(request.objectVersion) || request.objectVersion < 1) {
      throw new TransitionDeniedError("DENY_INVALID_VERSION", "objectVersion must be a positive integer");
    }
    if (!Array.isArray(request.evidenceRefs) || request.evidenceRefs.length === 0) {
      throw new TransitionDeniedError("DENY_MISSING_EVIDENCE", "At least one evidence reference is required");
    }
    if (request.evidenceRefs.some(isBlankString)) {
      throw new TransitionDeniedError("DENY_MALFORMED_REQUEST", "evidenceRefs entries must be non-blank strings");
    }

    const machine = STATE_MACHINES[request.objectType];
    if (!machine) {
      throw new TransitionDeniedError("DENY_UNKNOWN_OBJECT_TYPE", `Unknown object type: ${request.objectType}`);
    }
    if (!(request.currentState in machine) || !(request.requestedState in machine)) {
      throw new TransitionDeniedError("DENY_UNKNOWN_STATE", "Current or requested state is unknown");
    }

    // TE-H2: the caller timestamp is a claim, excluded from the replay
    // fingerprint so clock drift cannot break idempotent replays.
    const { timestamp: claimedTimestamp, ...fingerprintSource } = request;
    const requestFingerprint = canonicalFingerprint(fingerprintSource);
    const prior = this.#idempotency.get(request.idempotencyKey);
    if (prior) {
      if (prior.fingerprint !== requestFingerprint) {
        throw new TransitionDeniedError("DENY_IDEMPOTENCY_CONFLICT", "Idempotency key was reused for a different request");
      }
      return { ...prior.result, replayed: true };
    }

    if (request.policyDecision !== "ALLOW") {
      throw new TransitionDeniedError("DENY_POLICY", "Policy decision does not allow the transition");
    }

    // TE-H3: edge legality precedes authority resolution — an illegal
    // edge never exercises the authority layer.
    if (!machine[request.currentState].includes(request.requestedState)) {
      throw new TransitionDeniedError(
        "DENY_UNDEFINED_TRANSITION",
        `${request.objectType} cannot transition from ${request.currentState} to ${request.requestedState}`
      );
    }

    const authority = this.#authorize({
      actorId: request.actorId,
      authorityRef: request.authorityRef,
      projectId: request.projectId,
      workPackageId: request.workPackageId,
      objectType: request.objectType,
      objectId: request.objectId,
      currentState: request.currentState,
      requestedState: request.requestedState,
      producerActorId: request.producerActorId,
      reviewerActorId: request.reviewerActorId,
      qaActorId: request.qaActorId,
      evidenceVerifierActorId: request.evidenceVerifierActorId
    });
    if (!authority?.allowed || !authority.decisionId) {
      throw new TransitionDeniedError("DENY_AUTHORITY", authority?.reason ?? "Effective authority was not established");
    }

    const result = Object.freeze({
      transitionId: `tr_${requestFingerprint.slice(0, 24)}`,
      objectType: request.objectType,
      objectId: request.objectId,
      projectId: request.projectId,
      workPackageId: request.workPackageId,
      previousVersion: request.objectVersion,
      objectVersion: request.objectVersion + 1,
      previousState: request.currentState,
      state: request.requestedState,
      actorId: request.actorId,
      authorityDecisionId: authority.decisionId,
      policyDecision: request.policyDecision,
      evidenceRefs: [...request.evidenceRefs],
      idempotencyKey: request.idempotencyKey,
      timestamp: this.#now().toISOString(),
      claimedTimestamp: claimedTimestamp ?? null,
      reasonCode: request.reasonCode,
      replayed: false
    });
    this.#idempotency.set(request.idempotencyKey, { fingerprint: requestFingerprint, result });
    return result;
  }
}
