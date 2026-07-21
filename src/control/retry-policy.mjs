// MOD-RUNTIME Slice S2 (closes gap MR-2, advances MR-6 in
// docs/03-project-control/candidates/mod-runtime-gap-assessment-001.md):
// pure retry-policy evaluator.
//
// This is a DECISION FUNCTION, not a retry executor. Nothing in this file
// re-attempts an operation, sleeps, schedules, or wraps any live call —
// `evaluateRetry` answers exactly one question, "is another retry
// authorized right now", given an attempt count, a budget, the failure
// class of the attempt that just failed, whether the retry doctrine's
// change requirement is satisfied, and whether a governance-produced
// corrective decision is bound to this retry. Nothing in this file is
// wired into `HostRuntimeAgent`, `state-machine.mjs`, or any live path.
//
// No new ledger, no new schema. Per the gap assessment's boundary note B2
// and the S2 slice description, retry dispositions are recorded through
// the EXISTING `DecisionLedger` (`decision_type: "DISPOSITION"`) rather
// than a new ledger kind — mirroring MOD-GOV S2's reuse discipline
// (housing new decision logic in a pure module, not a new persistence
// surface). `buildRetryDecisionRecord` below only MINTS a decision-record
// candidate; it never opens or appends to a ledger itself. That mirrors
// `policy-decision-point.mjs`'s own stated discipline ("the PDP holds no
// ledger authority, the caller appends it") — the caller (a future
// consumer, or a test demonstrating the wiring) is the one that calls
// `DecisionLedger.appendDecision(...)` with the candidate this module
// produces.
//
// AUTHORITATIVE SOURCES (verbatim vocabulary reuse — grepped before
// writing any code here, per task instruction; nothing below invents a
// parallel term for something doctrine already names):
//   - `RETRY_AUTHORIZED` work_disposition value:
//       docs/12-execution/04-failure-to-capability-loop.md "Work disposition"
//       docs/00-governance/SECB-GOV-001.md §3.1 (same enum, restated)
//   - `retry_budget` field:
//       docs/templates/failure-evidence-envelope.yaml
//   - The five retry-control rules codified 1:1 below as denial gates:
//       docs/12-execution/04-failure-to-capability-loop.md "Retry control"
//       ("A retry requires: changed hypothesis/input/environment/corrective
//       action; bounded retry count and budget; preserved prior evidence;
//       explicit success criteria; no relaxation of safety or evidence
//       controls without governance approval.")
//   - Failure classification codes (F-AUTH..F-SKILL), used to fail-closed
//     validate `priorFailureClass` as a recognized doctrine code:
//       docs/12-execution/04-failure-to-capability-loop.md "Failure classes"
//   - `decision_type` enum (no new value added — reuses "DISPOSITION"):
//       contracts/decision-record.schema.json
//
// EXPLICIT NON-INVENTIONS (doctrine is silent, so this module does not
// invent vocabulary or a table doctrine never named):
//   - No backoff-shape (fixed/exponential/jittered) is implemented or
//     named. `grep -riE "retry|backoff" src/` returned no hits before this
//     slice, and the five retry-control rules never mention timing/shape —
//     only bounded count/budget. Backoff *timing* is an execution-loop
//     concern (an actual retry loop deciding *when* to re-attempt), which
//     the task this slice was produced under explicitly excludes ("NOT a
//     running retry executor"). A later, separately-scoped slice that
//     builds a real retry-loop consumer is the right place to name a
//     backoff shape, if and when doctrine names one.
//   - No per-failure-class "retryable vs. terminal" partition is invented.
//     Doctrine names ten failure classes (F-AUTH, F-TECH, F-DEP, F-EVID,
//     F-QUAL, F-SEC, F-OPS, F-OUT, F-KNOW, F-SKILL) but the "Retry control"
//     section never marks any subset of them as categorically
//     non-retryable — the doctrine's actual gate for this exact concern is
//     rule 5, "no relaxation of safety or evidence controls without
//     governance approval", which applies uniformly to every class via
//     the `boundCorrectiveDecisionRef` requirement below (see
//     `DENY_RETRY_UNAUTHORIZED`), not via a per-class table. Inventing a
//     class allow/deny table here would be exactly the kind of "invent
//     parallel terms" this slice was told not to do. `priorFailureClass`
//     is still validated (fail-closed) against the ten known codes, so a
//     typo'd or unrecognized class denies rather than silently defaulting.
//
// House style (matches `risk-registry.mjs`, `checkpoint-ledger.mjs`):
// result objects — `{ ok: true }` on authorization, `{ ok: false, code }`
// on any denial, deny-by-default on malformed/unknown input.

// Verbatim from docs/12-execution/04-failure-to-capability-loop.md
// "Failure classes" table.
export const FAILURE_CLASSES = Object.freeze([
  "F-AUTH",
  "F-TECH",
  "F-DEP",
  "F-EVID",
  "F-QUAL",
  "F-SEC",
  "F-OPS",
  "F-OUT",
  "F-KNOW",
  "F-SKILL"
]);

// Doctrine literal (docs/templates/failure-evidence-envelope.yaml
// "work_disposition" enum) — the ONLY positive outcome this evaluator
// ever returns.
export const RETRY_AUTHORIZED = "RETRY_AUTHORIZED";

function isNonNegativeInteger(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isNonBlankString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

// Pure decision function. No I/O, no clock read, no persistence — every
// input the decision depends on is passed in explicitly.
//
//   attempt                     — non-negative integer count of retries
//                                 already consumed before this evaluation
//                                 (0 = no retry has been attempted yet).
//   retryBudget                 — non-negative integer maximum number of
//                                 retries authorized for this work item
//                                 (docs/templates/failure-evidence-envelope.yaml
//                                 `retry_budget`).
//   priorFailureClass           — one of FAILURE_CLASSES: the
//                                 classification of the attempt that just
//                                 failed.
//   hypothesisChanged           — boolean: true only if the hypothesis,
//                                 input, environment, or corrective action
//                                 has genuinely changed since the prior
//                                 attempt (doctrine rule 1). Strictly typed
//                                 — a truthy non-boolean (e.g. the string
//                                 "false") must not silently authorize an
//                                 unchanged retry.
//   boundCorrectiveDecisionRef  — non-blank string reference to a
//                                 governance-produced corrective decision
//                                 (e.g. a `DecisionLedger` entry id) that
//                                 authorizes relaxing containment enough to
//                                 retry (doctrine rule 5). Missing, blank,
//                                 null, or non-string denies.
//
// Returns { ok: true } (retry authorized) or { ok: false, code } (denied).
export function evaluateRetry({ attempt, retryBudget, priorFailureClass, hypothesisChanged, boundCorrectiveDecisionRef } = {}) {
  if (!isNonNegativeInteger(attempt)) {
    return { ok: false, code: "DENY_INVALID_ATTEMPT" };
  }
  if (!isNonNegativeInteger(retryBudget)) {
    return { ok: false, code: "DENY_INVALID_RETRY_BUDGET" };
  }
  if (typeof priorFailureClass !== "string" || !FAILURE_CLASSES.includes(priorFailureClass)) {
    return { ok: false, code: "DENY_UNKNOWN_FAILURE_CLASS" };
  }
  if (typeof hypothesisChanged !== "boolean") {
    return { ok: false, code: "DENY_INVALID_HYPOTHESIS_FLAG" };
  }

  // Doctrine rule 2: bounded retry count and budget. `attempt` is the
  // count already consumed, so the boundary case (attempt === retryBudget)
  // is exhausted — there is no budget remaining for a further retry.
  if (attempt >= retryBudget) {
    return { ok: false, code: "DENY_RETRY_BUDGET_EXHAUSTED" };
  }

  // Doctrine rule 5: no relaxation of safety or evidence controls without
  // governance approval. Applies uniformly to every failure class (see
  // "EXPLICIT NON-INVENTIONS" above) rather than a per-class table.
  if (!isNonBlankString(boundCorrectiveDecisionRef)) {
    return { ok: false, code: "DENY_RETRY_UNAUTHORIZED" };
  }

  // Doctrine rule 1: changed hypothesis, input, environment, or corrective
  // action. A bare loop-and-hope retry is denied even with budget and a
  // bound corrective decision.
  if (hypothesisChanged === false) {
    return { ok: false, code: "DENY_RETRY_UNCHANGED" };
  }

  return { ok: true };
}

// Human-readable rationale per outcome/denial code, keyed by exactly the
// strings `evaluateRetry` can return (plus the positive `RETRY_AUTHORIZED`
// outcome). Used only to populate the `rationale` field of a decision
// candidate — never consulted for the decision itself.
const RATIONALE_BY_OUTCOME = Object.freeze({
  [RETRY_AUTHORIZED]:
    "Retry authorized: within the authorized retry budget, a corrective decision is bound, and the hypothesis, input, environment, or corrective action has changed since the prior attempt (docs/12-execution/04-failure-to-capability-loop.md Retry control).",
  DENY_RETRY_BUDGET_EXHAUSTED:
    "Retry denied: attempt count has reached the authorized retry budget (Retry control rule: bounded retry count and budget).",
  DENY_RETRY_UNAUTHORIZED:
    "Retry denied: no bound corrective decision reference was supplied (Retry control rule: no relaxation of safety or evidence controls without governance approval).",
  DENY_RETRY_UNCHANGED:
    "Retry denied: hypothesis, input, environment, or corrective action has not changed since the prior attempt (Retry control rule: changed hypothesis/input/environment/corrective action).",
  DENY_INVALID_ATTEMPT: "Retry denied: attempt must be a non-negative integer.",
  DENY_INVALID_RETRY_BUDGET: "Retry denied: retryBudget must be a non-negative integer.",
  DENY_UNKNOWN_FAILURE_CLASS: "Retry denied: priorFailureClass is not a recognized doctrine failure class (F-AUTH..F-SKILL).",
  DENY_INVALID_HYPOTHESIS_FLAG: "Retry denied: hypothesisChanged must be an explicit boolean."
});

// Mints a decision-record CANDIDATE for a retry evaluation. This function
// performs no I/O and holds no ledger authority — it does not construct a
// DecisionLedger, does not open a file, and does not append anything. The
// caller is responsible for appending the returned candidate through an
// existing `DecisionLedger` instance (`appendDecision`), exactly as
// `policy-decision-point.mjs` documents for its own decisions.
//
// `identity` supplies every field this module cannot derive: decision_id,
// project_id, work_package_id, session_id, actor_id, authority_ref,
// evidence_refs, decided_at, valid_from, valid_until, and an optional
// version (defaults to 1). This module does not validate those fields
// itself — `DecisionLedger.appendDecision` already fail-closed validates
// the full decision-record contract (`DENY_CONTRACT_INVALID`) and this
// function must not duplicate or shadow that gate.
export function buildRetryDecisionRecord(evaluation, identity = {}) {
  const outcome = evaluation && evaluation.ok ? RETRY_AUTHORIZED : evaluation && evaluation.code;
  const rationale = RATIONALE_BY_OUTCOME[outcome] ?? "Retry disposition recorded.";
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
    evidence_refs: evidenceRefs,
    decided_at: decidedAt,
    valid_from: validFrom,
    valid_until: validUntil
  };
}
