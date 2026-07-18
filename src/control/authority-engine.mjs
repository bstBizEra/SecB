const CONFLICTING_ROLES = Object.freeze([
  ["ENGIN", "REV"],
  ["REV", "QA"],
  ["QA", "GOV"],
  ["SKILL_PRODUCER", "SKILL_PUBLISHER"],
  ["EVIDENCE_PRODUCER", "EVIDENCE_ACCEPTOR"]
]);

const REQUIRED_ROLE = Object.freeze({
  "Project:*->REVIEW": "REV",
  "Project:*->APPROVED_NOT_EFFECTIVE": "GOV",
  "Project:*->ACTIVE": "GOV",
  "WorkPackage:*->RUNNING": "ENGIN",
  "WorkPackage:*->SELF_VERIFIED": "ENGIN",
  "WorkPackage:*->REVIEW": "REV",
  "WorkPackage:*->QA": "QA",
  "WorkPackage:*->GOV_DECISION": "GOV",
  "WorkPackage:*->ACCEPTED": "GOV",
  "Session:*->RUNNING": "ENGIN",
  "Session:*->REVIEW_HANDOFF": "ENGIN",
  "Session:*->COMPLETED": "QA",
  "Evidence:*->SEALED": "EVIDENCE_PRODUCER",
  "Evidence:*->VERIFIED": "EVIDENCE_VERIFIER",
  "Evidence:*->ACCEPTED": "EVIDENCE_ACCEPTOR"
});

import { findReservedDelimiter } from "../contracts/reserved-delimiters.mjs";

const requiredGrantFields = [
  "grantId",
  "decisionId",
  "actorId",
  "projectId",
  "workPackageId",
  "roles",
  "allowedTransitions",
  "validFrom",
  "validUntil",
  "status"
];

export class AuthorityConfigurationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AuthorityConfigurationError";
    this.code = code;
  }
}

function transitionKey({ objectType, currentState, requestedState }) {
  return `${objectType}:${currentState}->${requestedState}`;
}

function requiredRole(context) {
  return REQUIRED_ROLE[`${context.objectType}:*->${context.requestedState}`] ?? null;
}

function hasConflict(roles) {
  return CONFLICTING_ROLES.find(([left, right]) => roles.has(left) && roles.has(right));
}

function denied(reason, code = "DENY_AUTHORITY") {
  return { allowed: false, code, reason };
}

export class AuthorityEngine {
  #grants;
  #now;

  constructor({ grants = [], now = () => new Date() } = {}) {
    this.#now = now;
    this.#grants = new Map();

    for (const grant of grants) {
      const missing = requiredGrantFields.filter((field) => grant?.[field] === undefined || grant[field] === null || grant[field] === "");
      if (missing.length > 0 || !Array.isArray(grant.roles) || !Array.isArray(grant.allowedTransitions)) {
        throw new AuthorityConfigurationError("INVALID_GRANT", `Grant is malformed: ${missing.join(", ")}`);
      }
      if (this.#grants.has(grant.grantId)) {
        throw new AuthorityConfigurationError("DUPLICATE_GRANT_ID", `Duplicate grant: ${grant.grantId}`);
      }
      // GOV-P011-08: the SoD scope key joins these fields with '|'; a
      // reserved delimiter inside them could shift or split scopes.
      for (const field of ["grantId", "actorId", "projectId", "workPackageId"]) {
        const hit = findReservedDelimiter(grant[field]);
        if (hit) {
          throw new AuthorityConfigurationError("INVALID_GRANT", `Grant ${field} must not contain '${hit}'`);
        }
      }
      const start = Date.parse(grant.validFrom);
      const end = Date.parse(grant.validUntil);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
        throw new AuthorityConfigurationError("INVALID_GRANT_WINDOW", `Grant has an invalid validity window: ${grant.grantId}`);
      }
      this.#grants.set(grant.grantId, structuredClone(grant));
    }

    const scopedRoles = new Map();
    for (const grant of this.#grants.values()) {
      const scope = `${grant.actorId}|${grant.projectId}|${grant.workPackageId}`;
      const roles = scopedRoles.get(scope) ?? new Set();
      grant.roles.forEach((role) => roles.add(role));
      scopedRoles.set(scope, roles);
    }
    for (const [scope, roles] of scopedRoles) {
      const conflict = hasConflict(roles);
      if (conflict) {
        throw new AuthorityConfigurationError("SOD_ROLE_CONFLICT", `${scope} combines conflicting roles ${conflict.join("/")}`);
      }
    }
  }

  authorize(context) {
    const role = requiredRole(context);
    if (!role) return denied("No authority rule exists for this transition", "DENY_ROLE_RULE_MISSING");

    const grant = this.#grants.get(context.authorityRef);
    if (!grant) return denied("Authority grant was not found");
    if (grant.status !== "ACTIVE") return denied("Authority grant is not active");
    if (grant.actorId !== context.actorId) return denied("Authority grant belongs to another actor");
    if (grant.projectId !== context.projectId || grant.workPackageId !== context.workPackageId) {
      return denied("Authority grant scope does not match the governed object");
    }

    const now = this.#now().getTime();
    if (now < Date.parse(grant.validFrom) || now >= Date.parse(grant.validUntil)) {
      return denied("Authority grant is outside its validity window");
    }
    if (!grant.roles.includes(role)) return denied(`Authority grant does not assign required role ${role}`);
    if (!grant.allowedTransitions.includes(transitionKey(context))) {
      return denied("Authority grant does not allow the requested transition");
    }

    const prohibitedActors = role === "REV"
      ? [context.producerActorId]
      : role === "QA"
        ? [context.producerActorId, context.reviewerActorId]
        : ["GOV", "EVIDENCE_ACCEPTOR"].includes(role)
          ? [context.producerActorId, context.reviewerActorId, context.qaActorId, context.evidenceVerifierActorId]
          : [];
    if (prohibitedActors.filter(Boolean).includes(context.actorId)) {
      return denied(`Separation of duties prohibits actor ${context.actorId} from role ${role}`, "DENY_SOD");
    }

    return {
      allowed: true,
      decisionId: grant.decisionId,
      grantId: grant.grantId,
      role
    };
  }

  asTransitionResolver() {
    return (context) => this.authorize(context);
  }
}

export { CONFLICTING_ROLES, REQUIRED_ROLE };
