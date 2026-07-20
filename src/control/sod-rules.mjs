// Shared separation-of-duties primitive (N-5 pairwise-distinct approval shape).
// Factors the "independent review + governance, three pairwise-distinct actors"
// gate so consumers import it rather than reimplement it.
//
// Provenance note: src/gateway/capability-registry-service.mjs carries an
// inline copy of this same shape that predates this module. It is a hardened
// P0 path and is intentionally left untouched by this slice (no behavioural
// change, no test churn). This module is the canonical home for new consumers
// (MOD-WORK goal retirement being the first).

export const INDEPENDENT_REVIEW_ROLE = "independent_review";
export const GOVERNANCE_ROLE = "governance";

const isBlank = (value) => typeof value !== "string" || value.trim() === "";

// A single approval is well-formed when it carries a non-blank role, a
// non-blank actor id, and a parseable decided_at timestamp.
export function approvalValid(approval) {
  return approval !== null
    && typeof approval === "object"
    && !Array.isArray(approval)
    && !isBlank(approval.role)
    && !isBlank(approval.actor_id)
    && !isBlank(approval.decided_at)
    && Number.isFinite(Date.parse(approval.decided_at));
}

// Evaluate a governance-approval bundle for a producer-scoped action.
// Returns { ok: true, independent, governance } when the bundle carries one
// independent-review and one governance approval AND the producer, the
// independent reviewer, and the governance approver are three pairwise-distinct
// actors. Otherwise returns { ok: false, code } with a structured deny code
// mirroring the capability-registry N-5 gate:
//   DENY_APPROVALS      - malformed bundle, missing role, or unknown producer
//   DENY_SELF_APPROVAL  - independent reviewer is the producer
//   DENY_SOD_VIOLATION  - the two approvers collapse, or governance is producer
export function evaluatePairwiseDistinctApprovals(approvals, producerActorId) {
  if (!Array.isArray(approvals) || approvals.length === 0 || !approvals.every(approvalValid)) {
    return { ok: false, code: "DENY_APPROVALS" };
  }
  if (isBlank(producerActorId)) {
    return { ok: false, code: "DENY_APPROVALS" };
  }
  const independent = approvals.find((approval) => approval.role === INDEPENDENT_REVIEW_ROLE);
  const governance = approvals.find((approval) => approval.role === GOVERNANCE_ROLE);
  if (!independent || !governance) {
    return { ok: false, code: "DENY_APPROVALS" };
  }
  if (independent.actor_id === producerActorId) {
    return { ok: false, code: "DENY_SELF_APPROVAL" };
  }
  // Three pairwise-distinct actors: producer, independent reviewer, governance.
  // Producer-as-independent is caught above; the remaining collapses (one
  // non-producer actor holding BOTH approvals, or the producer holding the
  // governance role) are denied here.
  if (independent.actor_id === governance.actor_id || governance.actor_id === producerActorId) {
    return { ok: false, code: "DENY_SOD_VIOLATION" };
  }
  return { ok: true, independent, governance };
}
