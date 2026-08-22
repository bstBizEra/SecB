// MOD-A2A Slice S2 (closes gap MA-1's authorization half, MA-4, MA-8 in
// docs/03-project-control/candidates/mod-a2a-gap-assessment-001.md):
// delegation non-escalation gate, UNWIRED.
//
// This is a DECISION FUNCTION, not a delegation-acceptance mechanism.
// `evaluateDelegation` answers exactly one question, "would honoring this
// delegation's requested ceiling grant the delegate more authority than
// the delegating principal itself holds" — the doctrine rule this module
// codifies verbatim from `docs/07-capabilities/mcp-a2a-governance.md`
// "Non-Escalation and Trust": "A delegate cannot receive more authority
// than the delegator possesses." Nothing in this file accepts, rejects,
// dispatches, or transports a delegation — it is not wired into
// `HandoffService`, `RuntimeRegistry`, `DelegationLedger`, or any live
// path (per the gap assessment's own S2 scoping and the task's explicit
// constraint against wiring `HandoffService` or any acceptance flow).
//
// Reuse discipline (MA-4 — the assessment's own named non-reuse risk this
// slice exists to close): the ONLY substantive comparison logic in this
// file is two calls into EXISTING, unmodified primitives —
// `non-escalation-comparator.mjs`'s `withinCeiling` (imported, never
// reimplemented — same five-dimension ceiling comparison S1's
// `DelegationLedger` already imports its `ceiling` shape from) and
// `risk-registry.mjs`'s `riskProfile` (imported, never reimplemented —
// the same `RISK_CLASSES` table S1's ceiling shape and MOD-GOV's own S2
// slice already established as the single source of truth for what a
// risk class requires). This module adds ZERO parallel ordering table,
// ZERO parallel risk-class table, and ZERO parallel path/tool/transition
// subset logic — every dimension-level and human-approval-level
// disposition is the verbatim return value of the imported function that
// already owns that check. See the "Verbatim-reuse evidence" section of
// this slice's producer-verification record for the grep/read confirming
// this by inspection, not assertion.
//
// Human-approval invariant (mirrors `policy-decision-point.mjs`'s own
// documented invariant, "the PDP never substitutes for a human
// approval"): even when the requested ceiling sits entirely within the
// delegator's own bounding ceiling (comparator ALLOWS), a requested risk
// class that `risk-registry.mjs` marks `humanApproval: true` still denies
// with `DENY_HUMAN_APPROVAL_REQUIRED`. This gate does not substitute for
// that human approval either — it only refuses to grant itself the
// authority to skip one. This exactly matches the gap assessment's own
// S2 slice text (§4).
//
// Deny-by-default: any input the imported comparator itself treats as
// unshaped/unorderable/uncomparable denies via that comparator's own
// codes (`DENY_ESCALATION`, `DENY_ESCALATION_UNCOMPARABLE`) — this module
// performs no separate shape validation of its own that could drift from
// `non-escalation-comparator.mjs`'s `validShape()`.

import { withinCeiling } from "../services/non-escalation-comparator.mjs";
import { riskProfile } from "./risk-registry.mjs";

// Gate-owned code (not a comparator or risk-registry code): the ceiling
// comparison alone allowed the delegation, but the requested risk class
// requires a human approval this pure evaluator cannot itself supply.
export const DENY_HUMAN_APPROVAL_REQUIRED = "DENY_HUMAN_APPROVAL_REQUIRED";

// House-style positive-outcome code, identical to the `{ ok: true, code:
// "ALLOW" }` shape already established by this module's own siblings
// (`DelegationLedger.resolveDelegationRequest`, `DecisionLedger
// .resolveEffective` in `src/ledger/temporal-ledgers.mjs`) — not a
// doctrine-named literal (no doc names one for this exact outcome, unlike
// `retry-policy.mjs`'s doctrine-sourced `RETRY_AUTHORIZED`), so the
// existing house convention is reused rather than inventing a new term.
export const ALLOW = "ALLOW";

// Pure decision function. No I/O, no clock read, no persistence, no
// ledger reference. Every input the decision depends on is passed in
// explicitly, matching `retry-policy.mjs`'s `evaluateRetry` house style.
//
//   requestedCeiling — the delegation's requested authority ceiling
//                       (`riskClass`/`dataClassification`/`paths`/`tools`/
//                       `transitions` — S1's `delegation-request` schema
//                       `ceiling` field imports this exact shape from
//                       `non-escalation-comparator.mjs`, unchanged here).
//   boundingCeiling  — the delegating principal's OWN authority/risk
//                       ceiling, in the identical five-dimension shape.
//                       This is the "does the delegator itself hold at
//                       least this much authority" bound `withinCeiling`
//                       already compares against for any candidate/bound
//                       pair — no delegation-specific bound shape exists
//                       or is invented here.
//
// This function deliberately operates on raw ceiling objects, not on a
// full S1 delegation-request record — matching the gap assessment's own
// explicit S2/S1 independence note ("S2 does not depend on S1 ... it
// operates on ceilings directly, not on the delegation-request schema").
// `evaluateDelegationRequest` below is a zero-logic convenience wrapper
// for callers that do hold an S1-shaped record.
//
// Returns `{ ok: true, code: "ALLOW" }`, or the comparator's own
// `{ ok: false, code, dimension }` verbatim, or
// `{ ok: false, code: "DENY_HUMAN_APPROVAL_REQUIRED" }`.
export function evaluateDelegation({ requestedCeiling, boundingCeiling } = {}) {
  // (a) EXISTING comparator, imported, never reimplemented: is the
  // requested ceiling within the delegator's own bounding ceiling on
  // every dimension? Any denial here (including unshaped/uncomparable
  // input) is returned exactly as the comparator produced it.
  const ceilingResult = withinCeiling(requestedCeiling, boundingCeiling);
  if (!ceilingResult.ok) {
    return ceilingResult;
  }

  // (b) EXISTING risk-registry, imported, never reimplemented: does the
  // requested risk class require a human approval this gate cannot
  // itself grant? Defense in depth only — `withinCeiling`'s own
  // `riskClass` dimension check (step a) already fail-closes an unknown
  // class via `DENY_ESCALATION_UNCOMPARABLE` before this line can be
  // reached with a class `risk-registry.mjs` does not recognize, since
  // both modules share the same frozen `RISK_ORDER` (risk-registry.mjs
  // re-exports it from non-escalation-comparator.mjs, one source of
  // truth). This branch is therefore never expected to trigger in
  // practice, but is not assumed unreachable — it fails closed with the
  // registry's own code if it ever does.
  const profile = riskProfile(requestedCeiling.riskClass);
  if (!profile.ok) {
    return profile;
  }

  if (profile.value.humanApproval) {
    return { ok: false, code: DENY_HUMAN_APPROVAL_REQUIRED };
  }

  return { ok: true, code: ALLOW };
}

// Zero-logic convenience wrapper: extracts `.ceiling` from an S1-shaped
// delegation-request record and forwards it, unmodified, to
// `evaluateDelegation` alongside the delegator's own bounding ceiling.
// This function adds no comparison logic of its own — it exists only so
// a caller holding a full delegation-request object (as `DelegationLedger
// .resolveDelegationRequest` returns) does not need to reach into
// `.ceiling` itself. `delegationRequest` is read structurally (duck-typed
// on `.ceiling`), never validated or reshaped here — schema validation of
// a delegation-request remains `DelegationLedger`'s/`validateContract`'s
// job, not this gate's (no duplicated contract-validation logic).
export function evaluateDelegationRequest(delegationRequest, delegatorCeiling) {
  return evaluateDelegation({
    requestedCeiling: delegationRequest?.ceiling,
    boundingCeiling: delegatorCeiling
  });
}

// Human-readable rationale per outcome/denial code, keyed by exactly the
// codes `evaluateDelegation` can return (plus the positive `ALLOW`
// outcome and the comparator's own dimension-denial codes). Used only to
// populate the `rationale` field of a decision candidate below — never
// consulted for the decision itself, mirroring `retry-policy.mjs`'s
// `RATIONALE_BY_OUTCOME` table.
const RATIONALE_BY_OUTCOME = Object.freeze({
  [ALLOW]:
    'Delegation authorized: the requested ceiling sits within the delegating principal\'s own bounding ceiling on every dimension (non-escalation-comparator.withinCeiling), and the requested risk class does not require human approval (risk-registry.mjs) (docs/07-capabilities/mcp-a2a-governance.md "Non-Escalation and Trust": "A delegate cannot receive more authority than the delegator possesses.").',
  DENY_ESCALATION:
    "Delegation denied: the requested ceiling exceeds the delegating principal's own bounding ceiling on at least one dimension (non-escalation-comparator.withinCeiling).",
  DENY_ESCALATION_UNCOMPARABLE:
    "Delegation denied: the requested or bounding ceiling is malformed, or a dimension could not be compared (e.g. a glob or a missing shape) — incomparable is treated as escalation, fail-closed (non-escalation-comparator.withinCeiling).",
  DENY_HUMAN_APPROVAL_REQUIRED:
    "Delegation denied: the requested risk class requires a human approval (risk-registry.mjs riskProfile().humanApproval) that this pure evaluator cannot itself supply — mirrors the policy-decision-point's own invariant that it never substitutes for a human approval.",
  DENY_UNKNOWN_RISK_CLASS:
    "Delegation denied: the requested risk class is not a recognized risk-registry class (defense in depth; the comparator's own riskClass dimension check already fail-closes this earlier in the ordinary case)."
});

// --- Decision-record integrity binding ----------------------------------
//
// Closes the gap named in docs/03-project-control/candidates/
// mod-a2a-s2-non-escalation-gate-third-independent-review-001.md §4:
// `buildDelegationDecisionRecord` previously trusted its `evaluation`
// argument at face value and never touched `requestedCeiling`/
// `boundingCeiling` at all, so a hand-fabricated `{ ok: true, code:
// "ALLOW" }` minted a schema-valid record indistinguishable from a
// genuine one, even for ceilings a real `evaluateDelegation` call would
// deny as an escalation.
//
// Fix mirrors the EXACT mechanism the sibling MOD-A2A S3 slice
// (`escalation-route.mjs`'s `bindEscalationRoute`/`verifyEscalation`)
// already established for this same class of problem — same naming
// convention (`<module>:JSON.stringify([...actual fields])`), same
// placement (the fingerprint lives in `evidence_refs`, no new schema
// field, no `additionalProperties` violation), same split between a
// minting side (bind) and an independent verification side (verify).
// Nothing here reimplements or duplicates `evaluateDelegation`'s own
// comparator/risk-registry logic — the binding at mint time is a pure
// function of the actual `requestedCeiling`/`boundingCeiling`/outcome
// (no re-decision); the ONE place this module recomputes the decision
// is inside `verifyDelegationDecision`, which calls the existing
// `evaluateDelegation` once (not a second parallel implementation) to
// learn ground truth, exactly as `verifyEscalation` recomputes its own
// expected `bindingRef` rather than trusting the stored record blindly.
export const DENY_UNKNOWN_DELEGATION_DECISION = "DENY_UNKNOWN_DELEGATION_DECISION";
export const DENY_WRONG_DECISION_TYPE = "DENY_WRONG_DECISION_TYPE";
export const DENY_DECISION_MISMATCH = "DENY_DECISION_MISMATCH";

// Injective binding string over the ACTUAL ceilings `evaluateDelegation`
// was supposedly given plus the outcome recorded for them — same
// construction as `escalation-route.mjs`'s `bindingRef`
// (`` `escalation-route:${JSON.stringify([...])}` ``), just with this
// module's own prefix and its own actual-input tuple.
function delegationBindingRef(requestedCeiling, boundingCeiling, outcome) {
  return `delegation-gate:${JSON.stringify([requestedCeiling, boundingCeiling, outcome])}`;
}

// Mints a decision-record CANDIDATE for a delegation-gate evaluation.
// This function performs no I/O and holds no ledger authority — it does
// not construct a `DecisionLedger`, does not open a file, and does not
// append anything, mirroring `retry-policy.mjs`'s `buildRetryDecisionRecord`
// and `policy-decision-point.mjs`'s own documented discipline ("the PDP
// holds no ledger authority, the caller appends it"). No new ledger, no
// new schema, no new `decision_type` enum value — this reuses the
// existing `DecisionLedger` (`decision_type: "DISPOSITION"`), the same
// reuse discipline `retry-policy.mjs`'s S2 slice established for
// MOD-RUNTIME, per this slice's own task instruction.
//
// `identity` supplies every field this module cannot derive: decisionId,
// version, projectId, workPackageId, sessionId, actorId, authorityRef,
// evidenceRefs, decidedAt, validFrom, validUntil. This module does not
// validate those fields itself — `DecisionLedger.appendDecision` already
// fail-closed validates the full decision-record contract
// (`DENY_CONTRACT_INVALID`) and this function must not duplicate or
// shadow that gate.
//
// `boundCeilings` — `{ requestedCeiling, boundingCeiling }`, the ACTUAL
// ceilings `evaluation` is claimed to have been produced from. This is
// the fix for the third-independent-review §4 gap: the record is no
// longer minted from `evaluation` alone (which carried zero trace of
// what was actually compared) — its `evidence_refs` now also carries an
// injective `delegationBindingRef` fingerprint over these actual
// ceilings and the outcome, mirroring `escalation-route.mjs`'s
// `bindEscalationRoute`/evidence_refs pattern exactly. This function
// still does not re-derive `evaluateDelegation`'s own comparator logic
// (no re-decision here — that would duplicate, not bind); the mint side
// only binds. Truthful cross-checking of a minted record against the
// ceilings that were actually supposed to produce it is
// `verifyDelegationDecision`'s job, below (mirrors `verifyEscalation`).
export function buildDelegationDecisionRecord(evaluation, identity = {}, boundCeilings = {}) {
  const { requestedCeiling, boundingCeiling } = boundCeilings;
  const outcome = evaluation && evaluation.ok ? ALLOW : evaluation && evaluation.code;
  const rationale = RATIONALE_BY_OUTCOME[outcome] ?? "Delegation non-escalation disposition recorded.";
  const {
    decisionId,
    version = 1,
    projectId,
    workPackageId,
    sessionId,
    actorId,
    authorityRef,
    evidenceRefs,
    decidedAt,
    validFrom,
    validUntil
  } = identity;

  return {
    decision_id: decisionId,
    version,
    project_id: projectId,
    work_package_id: workPackageId,
    session_id: sessionId,
    actor_id: actorId,
    decision_type: "DISPOSITION",
    outcome,
    rationale,
    authority_ref: authorityRef,
    evidence_refs: [
      delegationBindingRef(requestedCeiling, boundingCeiling, outcome),
      ...(Array.isArray(evidenceRefs) ? evidenceRefs : [])
    ],
    decided_at: decidedAt,
    valid_from: validFrom,
    valid_until: validUntil
  };
}

// Independent, post-hoc verification that a minted `DISPOSITION` record
// actually corresponds to a genuine `evaluateDelegation` outcome for a
// SPECIFIC, exact `requestedCeiling`/`boundingCeiling` pair supplied by
// the verifier (e.g. a downstream ledger consumer or auditor who holds
// the real ceilings a wiring layer claims to have evaluated). Mirrors
// `escalation-route.mjs`'s `verifyEscalation` exactly: recomputes the
// expected fingerprint from ground truth (calling the existing
// `evaluateDelegation` ONCE — the single source of truth, not a second
// parallel implementation of its comparator logic) and checks the
// record's own `evidence_refs` against it. A record minted from a
// fabricated `evaluation` that does not match what `evaluateDelegation`
// actually produces for the given ceilings — the third-independent-review
// §4 scenario — fails this check with `DENY_DECISION_MISMATCH`.
export function verifyDelegationDecision(decision, { requestedCeiling, boundingCeiling } = {}) {
  if (!decision || typeof decision !== "object") {
    return { ok: false, code: DENY_UNKNOWN_DELEGATION_DECISION };
  }
  if (decision.decision_type !== "DISPOSITION") {
    return { ok: false, code: DENY_WRONG_DECISION_TYPE };
  }

  const trueEvaluation = evaluateDelegation({ requestedCeiling, boundingCeiling });
  const trueOutcome = trueEvaluation.ok ? ALLOW : trueEvaluation.code;
  const expected = delegationBindingRef(requestedCeiling, boundingCeiling, trueOutcome);

  if (decision.outcome !== trueOutcome) {
    return { ok: false, code: DENY_DECISION_MISMATCH };
  }
  if (!Array.isArray(decision.evidence_refs) || !decision.evidence_refs.includes(expected)) {
    return { ok: false, code: DENY_DECISION_MISMATCH };
  }

  return { ok: true };
}
