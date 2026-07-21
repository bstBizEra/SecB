// MOD-GOV Slice S3 — Policy decision point (PDP) facade, UNWIRED.
//
// K-14 (mod-gov-gap-assessment-001): today `policyDecision` is a caller-
// supplied string that state-machine.mjs:171 trusts when it `=== "ALLOW"`;
// no component computes it. This module is the single deny-by-default choke
// point that can compute that value: `decide(request)` composes identity
// resolution, contract effectiveness, grant authorization, SoD (the S1
// primitive), and the risk/mutation gate (the S2 registry) into one
// deterministic pipeline, and emits a schema-valid decision-record CANDIDATE
// for both outcomes (K-15 emission becomes first-class; the CALLER appends it
// to a DecisionLedger — the PDP holds no ledger authority).
//
// Scope discipline (S3 charter):
//   - NOTHING wires this module. state-machine.mjs is untouched; adoption is
//     a later, separately-governed slice (SEC + GOV per the R3 flag).
//   - Every collaborator is injected. The facade owns no state, no I/O, no
//     persistence, no transport, no credential surface.
//   - Fail-closed everywhere: malformed construction throws; malformed
//     requests, unresolvable factors, and THROWING resolvers all yield
//     structured denials with stage-specific codes (gateway style — decide()
//     itself never throws). This includes the SHAPE of every injected
//     collaborator's return value, not just the caller-supplied `request`
//     (S3-N1 fast-follow, second independent review,
//     mod-gov-s2-s3-second-independent-review-001): `grantResolver`'s
//     `roles` must be an Array or Set, and `history` must be a plain object
//     keyed ONLY from the vocabulary `producer`/`reviewer`/`qa`/
//     `evidenceVerifier` (S1's AUTHORIZE_TIME_LADDER convention). Any other
//     shape denies with DENY_MALFORMED_GRANT_SHAPE — it is never silently
//     coerced to "absent/empty", because that coercion is what let a
//     malformed or differently-keyed grantResolver output silently disable
//     the SoD check and flip a real conflict/prohibition into a false ALLOW.
//
// serverDerived HONESTY NOTE (K-16): project-contract-service demands
// `authority.serverDerived === true`, meaning "every factor of effective
// authority was established server-side, not asserted by the caller". This
// facade CANNOT honestly mint that flag: `actor_id` arrives caller-supplied
// and identity ISSUANCE (K-12) does not exist, so the binding between the
// calling workload and the claimed actor is not server-derived. The decide()
// result therefore carries `serverDerived: false` — always, in this slice.
// Adopters MUST NOT feed this output into a `serverDerived: true` assertion.
// The flag lives on the RESULT ENVELOPE, not inside the decision-record
// candidate: contracts/decision-record.schema.json is closed
// (`additionalProperties: false`) and has no such field, and S3 makes no
// schema changes.
//
// Decision-record candidate construction notes (all honest-by-construction):
//   - `authority_ref`: the grant's decisionId once the authority stage has
//     established one; before that stage, the sentinel
//     "authority:not-established" (the schema requires a non-empty string and
//     a denied request may have no authority at all).
//   - `evidence_refs`: the canonical fingerprint of the validated request —
//     the only evidence the PDP itself possesses. Adopting callers bind real
//     evidence under their own governance.
//   - `valid_from === valid_until === decided_at`: a zero-width validity
//     window. The candidate asserts NO forward validity; the adopter sets a
//     real window under its own authority.
//   - Shape and clock denials carry `decisionRecordCandidate: null`: without
//     validated context ids or a server timestamp a schema-valid record
//     cannot be minted honestly, and fabricating either would be dishonest.

import {
  normalizeRole as sodNormalizeRole,
  checkConflictingRoles as sodCheckConflictingRoles,
  checkProhibitedActors as sodCheckProhibitedActors,
  AUTHORIZE_TIME_LADDER
} from "./sod-rules.mjs";
import { riskProfile as registryRiskProfile, isMutationAtMost as registryIsMutationAtMost } from "./risk-registry.mjs";
import { validateContract } from "../contracts/contract-validator.mjs";
import { canonicalFingerprint } from "../contracts/canonical-fingerprint.mjs";

export class PolicyConfigurationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PolicyConfigurationError";
    this.code = code;
  }
}

const REQUEST_KEYS = Object.freeze(["actor_id", "role", "action", "target", "risk_class", "mutation_class", "context"]);
const REQUIRED_REQUEST_KEYS = Object.freeze(["actor_id", "role", "action", "target", "risk_class", "context"]);
const TARGET_KEYS = Object.freeze(["entity", "transition"]);
const CONTEXT_KEYS = Object.freeze(["project_id", "work_package_id", "session_id"]);

const isBlank = (value) => typeof value !== "string" || value.trim() === "";
const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

// The prohibited-actor ladder's full inner-key vocabulary (S1's convention:
// producer, reviewer, qa, evidenceVerifier — see sod-rules.mjs). `grant.history`
// keys are validated against this closed set at the PDP boundary: a grant
// store that emits a differently-named key (e.g. `producerActorId` instead of
// `producer`) must not be silently ignored, because that silence is exactly
// what lets a real prior-role fact hide from the ladder lookup and flip a
// would-be DENY_SOD into a false ALLOW (S3-N1).
const KNOWN_GRANT_HISTORY_KEYS = Object.freeze([...new Set(Object.values(AUTHORIZE_TIME_LADDER).flat())]);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

// Structural request validation, fail-closed. Returns null when the request
// is well-formed, else { code, reason }. Unknown keys deny (closed envelope,
// TransitionEngine style); blank strings deny; nested shapes are closed too.
function validateShape(request) {
  if (!isPlainObject(request)) {
    return { code: "DENY_MALFORMED_REQUEST", reason: "Decision request must be an object" };
  }
  const unknown = Object.keys(request).filter((key) => !REQUEST_KEYS.includes(key));
  if (unknown.length > 0) {
    return { code: "DENY_MALFORMED_REQUEST", reason: `Unknown request fields: ${unknown.join(", ")}` };
  }
  const missing = REQUIRED_REQUEST_KEYS.filter((key) => request[key] === undefined || request[key] === null || request[key] === "");
  if (missing.length > 0) {
    return { code: "DENY_MISSING_FIELDS", reason: `Missing request fields: ${missing.join(", ")}` };
  }
  for (const key of ["actor_id", "role", "action", "risk_class"]) {
    if (isBlank(request[key])) {
      return { code: "DENY_MALFORMED_REQUEST", reason: `${key} must be a non-blank string` };
    }
  }
  if (request.mutation_class !== undefined && isBlank(request.mutation_class)) {
    return { code: "DENY_MALFORMED_REQUEST", reason: "mutation_class, when present, must be a non-blank string" };
  }
  if (!isPlainObject(request.target)) {
    return { code: "DENY_MALFORMED_REQUEST", reason: "target must be an object" };
  }
  const unknownTarget = Object.keys(request.target).filter((key) => !TARGET_KEYS.includes(key));
  if (unknownTarget.length > 0) {
    return { code: "DENY_MALFORMED_REQUEST", reason: `Unknown target fields: ${unknownTarget.join(", ")}` };
  }
  if (isBlank(request.target.entity)) {
    return { code: "DENY_MALFORMED_REQUEST", reason: "target.entity must be a non-blank string" };
  }
  if (request.target.transition !== undefined && isBlank(request.target.transition)) {
    return { code: "DENY_MALFORMED_REQUEST", reason: "target.transition, when present, must be a non-blank string" };
  }
  if (!isPlainObject(request.context)) {
    return { code: "DENY_MALFORMED_REQUEST", reason: "context must be an object" };
  }
  const unknownContext = Object.keys(request.context).filter((key) => !CONTEXT_KEYS.includes(key));
  if (unknownContext.length > 0) {
    return { code: "DENY_MALFORMED_REQUEST", reason: `Unknown context fields: ${unknownContext.join(", ")}` };
  }
  for (const key of CONTEXT_KEYS) {
    if (isBlank(request.context[key])) {
      return { code: "DENY_MALFORMED_REQUEST", reason: `context.${key} must be a non-blank string` };
    }
  }
  return null;
}

// Immutable canonical copy of a validated request — the single value later
// stages, the fingerprint, and the injected grantResolver see. Optional
// fields are materialized as null so the fingerprint is stable.
function canonicalRequest(request) {
  return deepFreeze({
    actor_id: request.actor_id,
    role: request.role,
    action: request.action,
    target: { entity: request.target.entity, transition: request.target.transition ?? null },
    risk_class: request.risk_class,
    mutation_class: request.mutation_class ?? null,
    context: {
      project_id: request.context.project_id,
      work_package_id: request.context.work_package_id,
      session_id: request.context.session_id
    }
  });
}

export function createPolicyDecisionPoint({
  identityResolver,
  contractResolver,
  grantResolver,
  sodRules,
  riskRegistry,
  now = () => new Date()
} = {}) {
  for (const [name, value] of [
    ["identityResolver", identityResolver],
    ["contractResolver", contractResolver],
    ["grantResolver", grantResolver],
    ["now", now]
  ]) {
    if (typeof value !== "function") {
      throw new PolicyConfigurationError("INVALID_RESOLVER", `createPolicyDecisionPoint requires a ${name} function (fail-closed composition)`);
    }
  }
  // SoD and risk collaborators default to the S1/S2 primitives (reuse, never
  // reimplement); an injected override must expose the same surface.
  const sod = sodRules ?? { normalizeRole: sodNormalizeRole, checkConflictingRoles: sodCheckConflictingRoles, checkProhibitedActors: sodCheckProhibitedActors };
  for (const method of ["normalizeRole", "checkConflictingRoles", "checkProhibitedActors"]) {
    if (typeof sod?.[method] !== "function") {
      throw new PolicyConfigurationError("INVALID_SOD_RULES", `sodRules must expose a ${method} function`);
    }
  }
  const risk = riskRegistry ?? { riskProfile: registryRiskProfile, isMutationAtMost: registryIsMutationAtMost };
  for (const method of ["riskProfile", "isMutationAtMost"]) {
    if (typeof risk?.[method] !== "function") {
      throw new PolicyConfigurationError("INVALID_RISK_REGISTRY", `riskRegistry must expose a ${method} function`);
    }
  }

  // Config is captured in closure constants above; later mutation of the
  // caller's options object cannot alter behavior.

  function serverTime() {
    try {
      const epochMs = Date.prototype.getTime.call(now());
      if (!Number.isFinite(epochMs)) return null;
      return new Date(epochMs).toISOString();
    } catch {
      return null;
    }
  }

  // Build the decision-record CANDIDATE for a decided (post-shape, post-clock)
  // request and validate it against the closed contract schema. Returns the
  // frozen candidate, or null if validation fails (should be unreachable; a
  // null candidate on the ALLOW path is converted to a denial by decide()).
  function recordCandidate({ request, outcome, code, reason, decidedAt, authorityDecisionId }) {
    const fingerprint = canonicalFingerprint({ request, outcome, code });
    const candidate = {
      decision_id: `pdp_${fingerprint.slice(0, 24)}`,
      version: 1,
      project_id: request.context.project_id,
      work_package_id: request.context.work_package_id,
      session_id: request.context.session_id,
      actor_id: request.actor_id,
      decision_type: "AUTHORITY",
      outcome,
      rationale: `${code}: ${reason}`,
      authority_ref: authorityDecisionId ?? "authority:not-established",
      evidence_refs: [`pdp:request:${fingerprint}`],
      decided_at: decidedAt,
      valid_from: decidedAt,
      valid_until: decidedAt
    };
    try {
      validateContract("decisionRecord", candidate);
    } catch {
      return null;
    }
    return deepFreeze(candidate);
  }

  function denyEarly(code, reason) {
    // Shape/clock denials: no validated context or no server time, so no
    // honest candidate can exist (see construction notes above).
    return deepFreeze({ decision: "DENY", code, reason, serverDerived: false, decisionRecordCandidate: null });
  }

  function decided({ request, decision, code, reason, decidedAt, authorityDecisionId }) {
    const candidate = recordCandidate({
      request,
      outcome: decision,
      code,
      reason,
      decidedAt,
      authorityDecisionId: authorityDecisionId ?? null
    });
    if (decision === "ALLOW" && candidate === null) {
      // Fail-closed terminal guard: an ALLOW whose record cannot validate is
      // not an ALLOW.
      return deepFreeze({
        decision: "DENY",
        code: "DENY_RECORD_INVALID",
        reason: "Decision record candidate failed contract validation",
        serverDerived: false,
        decisionRecordCandidate: null
      });
    }
    return deepFreeze({ decision, code, reason, serverDerived: false, decisionRecordCandidate: candidate });
  }

  // Deterministic pipeline. Stage order is part of the contract (tested):
  //   1 shape -> 2 clock -> 3 identity -> 4 contract -> 5 authority ->
  //   6 SoD conflicting-roles -> 7 SoD prohibited-actors ->
  //   8 risk class -> 9 mutation ceiling -> 10 human approval -> ALLOW.
  // Every stage denies with its own code; a throwing collaborator denies with
  // the code of the stage that invoked it (fail-closed, never fail-open).
  function decide(rawRequest) {
    const shapeError = validateShape(rawRequest);
    if (shapeError) return denyEarly(shapeError.code, shapeError.reason);
    const request = canonicalRequest(rawRequest);

    const decidedAt = serverTime();
    if (decidedAt === null) {
      return denyEarly("DENY_CLOCK_UNAVAILABLE", "Server time source is unavailable");
    }
    const deny = (code, reason, authorityDecisionId) =>
      decided({ request, decision: "DENY", code, reason, decidedAt, authorityDecisionId });

    // 3. Identity: unknown, unresolved, quarantined, or throwing -> deny.
    let identity;
    try {
      identity = identityResolver(request.actor_id);
    } catch {
      return deny("DENY_IDENTITY", "Identity resolver failed");
    }
    if (!isPlainObject(identity) || identity.resolved !== true) {
      return deny("DENY_IDENTITY", `Actor ${request.actor_id} did not resolve to an approved, active identity`);
    }

    // 4. Contract effectiveness for the governing project.
    let contract;
    try {
      contract = contractResolver({ projectId: request.context.project_id, workPackageId: request.context.work_package_id });
    } catch {
      return deny("DENY_CONTRACT_INEFFECTIVE", "Contract resolver failed");
    }
    if (!isPlainObject(contract) || contract.allowed !== true) {
      return deny("DENY_CONTRACT_INEFFECTIVE", `No effective contract governs project ${request.context.project_id}`);
    }

    // 5. Grant-based authority. The resolver receives the frozen canonical
    // request and must return { allowed: true, decisionId, roles?, history? }.
    let grant;
    try {
      grant = grantResolver(request);
    } catch {
      return deny("DENY_AUTHORITY", "Grant resolver failed");
    }
    if (!isPlainObject(grant) || grant.allowed !== true || isBlank(grant.decisionId)) {
      return deny("DENY_AUTHORITY", "Effective authority was not established for the requested action");
    }

    // 6-7. SoD via the S1 primitive: conflicting-role pairs over the granted
    // role set plus the requested role, then the prohibited-actor ladder over
    // the grant-supplied actor history.
    //
    // Shape-validate the grantResolver's OWN output before it feeds the SoD
    // check, with the same rigor already applied to the caller's `request`
    // (S3-N1 fix). `grant.roles`, when present, must be an Array or a Set;
    // `grant.history`, when present, must be a plain object. Anything else is
    // a malformed collaborator output and MUST fail closed with a distinct
    // typed code — it must never be silently treated as "absent/empty",
    // because that coercion is exactly what flips a real SOD_ROLE_CONFLICT /
    // DENY_SOD fact into a false ALLOW when a grantResolver bug or a
    // differently-shaped internal representation feeds in a string instead
    // of an array, or history keyed by different names than the hardcoded
    // AUTHORIZE_TIME_LADDER expects.
    if (grant.roles !== undefined && !Array.isArray(grant.roles) && !(grant.roles instanceof Set)) {
      return deny(
        "DENY_MALFORMED_GRANT_SHAPE",
        "grantResolver returned grant.roles that is neither an Array nor a Set",
        grant.decisionId
      );
    }
    if (grant.history !== undefined && !isPlainObject(grant.history)) {
      return deny(
        "DENY_MALFORMED_GRANT_SHAPE",
        "grantResolver returned grant.history that is not a plain object",
        grant.decisionId
      );
    }
    if (isPlainObject(grant.history)) {
      const unknownHistoryKeys = Object.keys(grant.history).filter((key) => !KNOWN_GRANT_HISTORY_KEYS.includes(key));
      if (unknownHistoryKeys.length > 0) {
        return deny(
          "DENY_MALFORMED_GRANT_SHAPE",
          `grantResolver returned grant.history with unrecognized key(s): ${unknownHistoryKeys.join(", ")}`,
          grant.decisionId
        );
      }
    }
    try {
      const roleSet = new Set(grant.roles ?? []);
      roleSet.add(request.role);
      const conflict = sod.checkConflictingRoles(roleSet, { normalize: true });
      if (!conflict.ok) return deny(conflict.code, conflict.message, grant.decisionId);
      const normalizedRole = sod.normalizeRole(request.role);
      const ladder = sod.checkProhibitedActors(normalizedRole, request.actor_id, grant.history ?? {});
      if (!ladder.ok) return deny(ladder.code, ladder.message, grant.decisionId);
    } catch {
      return deny("DENY_SOD", "Separation-of-duties check failed", grant.decisionId);
    }

    // 8-10. Risk gate via the S2 registry.
    try {
      const profile = risk.riskProfile(request.risk_class);
      if (!profile.ok) return deny(profile.code, `Risk class ${request.risk_class} is unknown`, grant.decisionId);
      if (request.mutation_class !== null) {
        const ceiling = risk.isMutationAtMost(request.mutation_class, profile.value.mutationCeiling);
        if (!ceiling.ok) {
          return deny(
            ceiling.code,
            `Mutation class ${request.mutation_class} is not permitted under ${request.risk_class} (ceiling ${profile.value.mutationCeiling})`,
            grant.decisionId
          );
        }
      }
      // Deny-by-default: anything other than an explicit false requires the
      // human gate. The PDP never substitutes for a human approval.
      if (profile.value.humanApproval !== false) {
        return deny(
          "DENY_HUMAN_APPROVAL_REQUIRED",
          `Risk class ${request.risk_class} requires explicit human approval; the policy decision point cannot grant it`,
          grant.decisionId
        );
      }
    } catch {
      return deny("DENY_UNKNOWN_RISK_CLASS", "Risk registry lookup failed", grant.decisionId);
    }

    return decided({
      decision: "ALLOW",
      code: "ALLOW",
      reason: "All policy factors resolved and permit the requested action",
      request,
      decidedAt,
      authorityDecisionId: grant.decisionId
    });
  }

  return Object.freeze({ decide });
}
