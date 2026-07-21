import { HANDOFF_ACCEPTANCE_LADDER, normalizeRole } from "./sod-rules.mjs";

// Pure, unwired MOD-A2A S3 candidate: no I/O, dispatch, ledger append, grant, or notification.
export const ESCALATION_ROLES = Object.freeze(Object.keys(HANDOFF_ACCEPTANCE_LADDER));
export const ESCALATION_BOUND = "ESCALATION_BOUND";
const deny = (code) => Object.freeze({ ok: false, code });
const nonBlank = (v) => typeof v === "string" && v.trim() !== "";
const bindingRef = (id, version, role, actor) => `escalation-route:${JSON.stringify([id, version, role, actor])}`;

export function evaluateEscalationRoute({ delegationCandidate, escalationActorRole, escalationActorId } = {}) {
  if (!delegationCandidate || typeof delegationCandidate !== "object" || Array.isArray(delegationCandidate)) return deny("DENY_MALFORMED_DELEGATION");
  const { delegation_id: id, version, source_actor_id: source, escalation_route: route } = delegationCandidate;
  if (!nonBlank(id) || !Number.isInteger(version) || version < 1 || !nonBlank(source) || !nonBlank(route)) return deny("DENY_MALFORMED_DELEGATION");
  if (!nonBlank(escalationActorRole) || !nonBlank(escalationActorId)) return deny("DENY_MALFORMED_ROUTE");
  const role = normalizeRole(escalationActorRole);
  if (!ESCALATION_ROLES.includes(role) || role !== normalizeRole(route)) return deny("DENY_ROUTE_NOT_AUTHORIZED");
  if (escalationActorId === source) return deny("DENY_SELF_ESCALATION");
  return Object.freeze({ ok: true, role, actorId: escalationActorId, delegationId: id, delegationVersion: version });
}

export function bindEscalationRoute(input, identity = {}) {
  const result = evaluateEscalationRoute(input);
  const d = input?.delegationCandidate;
  return Object.freeze({
    decision_id: identity.decisionId, version: identity.version ?? 1,
    project_id: d?.project_id, work_package_id: d?.work_package_id, session_id: d?.session_id,
    actor_id: identity.actorId, decision_type: "GOVERNANCE",
    outcome: result.ok ? ESCALATION_BOUND : result.code,
    rationale: result.ok ? "Delegation escalation route bound for independent handling." : "Delegation escalation route denied fail-closed.",
    authority_ref: identity.authorityRef,
    evidence_refs: [result.ok ? bindingRef(result.delegationId, result.delegationVersion, result.role, result.actorId) : "escalation-route:denied", ...(identity.evidenceRefs ?? [])],
    decided_at: identity.decidedAt, valid_from: identity.validFrom, valid_until: identity.validUntil
  });
}

export function verifyEscalation(decision, { exactDelegationId, exactDelegationVersion, escalationActorRole, escalationActorId } = {}) {
  if (!decision || typeof decision !== "object") return deny("DENY_UNKNOWN_ESCALATION");
  if (!nonBlank(exactDelegationId) || !Number.isInteger(exactDelegationVersion) || exactDelegationVersion < 1 || !nonBlank(escalationActorRole) || !nonBlank(escalationActorId)) return deny("DENY_MALFORMED_VERIFICATION_REQUEST");
  if (decision.decision_type !== "GOVERNANCE") return deny("DENY_WRONG_DECISION_TYPE");
  if (decision.outcome !== ESCALATION_BOUND) return deny("DENY_NOT_BOUND");
  const expected = bindingRef(exactDelegationId, exactDelegationVersion, normalizeRole(escalationActorRole), escalationActorId);
  return Array.isArray(decision.evidence_refs) && decision.evidence_refs.includes(expected) ? Object.freeze({ ok: true }) : deny("DENY_DELEGATION_MISMATCH");
}
