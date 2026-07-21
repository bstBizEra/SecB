// MOD-RUNTIME Slice S3 (closes gap MR-3, flags MR-10, informs MR-4 in
// docs/03-project-control/candidates/mod-runtime-gap-assessment-001.md):
// approval-binding primitive extraction, UNWIRED CANDIDATE.
//
// This module extracts the duplicated N-5 approval-gate shape independently
// implemented in `src/gateway/capability-registry-service.mjs` (`approvalValid`
// + the inline pairwise checks inside `promote()`) and
// `src/services/goal-graph-service.mjs` (`approvalWellFormed` +
// `evaluateForceRetireApprovals()`), plus the missing piece neither has: a
// pure function that binds an approval decision to an exact action + object
// version and a verifier that fail-closed denies replay or a wrong-version
// bind. Nothing in this file is imported by, or wired into, either existing
// service, `policy-decision-point.mjs`, or any live path — see "UNWIRED by
// construction" below.
//
// Duplication found (both read first-hand in full before writing this file):
//   - `approvalValid` (capability-registry-service.mjs) and
//     `approvalWellFormed` (goal-graph-service.mjs) are BYTE-IDENTICAL: both
//     require a non-null, non-array object with non-blank `role`/`actor_id`
//     and a `decided_at` that `Date.parse` accepts. No drift here.
//   - The higher-level N-5 gates (`promote()`'s approval block vs.
//     `evaluateForceRetireApprovals()`) are functionally equivalent for the
//     three-actor distinctness outcome (self-approval caught first, the
//     remaining collapses denied as SoD violation) but are NOT
//     byte-identical and carry one real behavioral DRIFT:
//       * ROLE-MATCHING DRIFT: capability-registry-service matches
//         `approval.role` by EXACT STRING equality against its own local
//         constants `INDEPENDENT_REVIEW_ROLE`/`GOVERNANCE_ROLE` ("independent_
//         review"/"governance") and does not import `sod-rules.mjs` at all.
//         goal-graph-service matches via `normalizeRole(approval.role) ===
//         "REV"|"GOV"` from the shared `sod-rules.mjs` primitive, which also
//         accepts canonical role tokens ("REV"/"GOV") and the alias
//         "reviewer" -> "REV". Concretely: an approval bundle carrying
//         `{ role: "REV", ... }` is ACCEPTED by goal-graph-service's gate but
//         REJECTED (falls through to DENY_APPROVALS, "missing independent/
//         governance approval") by capability-registry-service's gate, for
//         the identical N-5 concept. This is disclosed, not silently
//         resolved: see `roleMatchMode` below, which reproduces BOTH
//         behaviors as an explicit, tested configuration rather than picking
//         a "correct" one (picking one would be a behavior change, out of
//         scope for a candidate extraction).
//       * IMPLEMENTATION DRIFT (not behavioral): capability-registry-service
//         hand-rolls its pairwise-distinctness comparisons inline
//         (`independent.actor_id === producer`, then `independent.actor_id
//         === governance.actor_id || governance.actor_id === producer`) and
//         has ZERO import from `sod-rules.mjs`. goal-graph-service instead
//         calls the shared `checkPairwiseDistinct` primitive. This is a
//         documentation-precision correction to mod-runtime-gap-assessment-
//         001 item #11, which describes `checkPairwiseDistinct` as "already
//         consumed by both #9 and #10" — grep confirms only goal-graph-
//         service (#10) actually imports it; capability-registry-service
//         (#9) does not import `sod-rules.mjs` in any form. The two
//         implementations are functionally equivalent for the 3-actor case
//         (verified by this module's parity tests), but only one of them
//         reuses the kernel SoD primitive today.
//   - `revoke()` (capability-registry-service only) requires exactly one
//     GOVERNANCE_ROLE approval with no independent-review leg and no
//     producer-distinctness check at all. This is a materially different,
//     lighter-weight single-approval shape with no goal-graph-service
//     counterpart, so it is NOT part of the duplicated N-5 shape this slice
//     extracts (extracting it would be scope creep beyond MR-3/MR-10, which
//     name the promote()/evaluateForceRetireApprovals() duplication
//     specifically) — noted here for the record only.
//
// Scope discipline (S3 charter, mirrors MOD-GOV's own S3 PDP treatment):
//   - `capability-registry-service.mjs` and `goal-graph-service.mjs` are NOT
//     modified or rewired in this slice. Adoption is a later, separately-
//     governed slice (mirrors the assessment's own non-goal #1 and #7).
//   - No new `decision_type` enum value: approval bindings reuse the
//     EXISTING `"GOVERNANCE"` value on `contracts/decision-record.schema.json`
//     (closed schema, unmodified). The exact-action/exact-version bind that
//     the schema has no dedicated field for is carried as a stable,
//     formatted `evidence_refs` entry (`approval-binding:<action>@<version>`)
//     — the same technique `policy-decision-point.mjs` already uses to carry
//     its own request fingerprint through `evidence_refs` without a schema
//     change. This is a disclosed design decision (AMD-002 rule 3.1),
//     mirroring how S1 disclosed `source_ledger_id` and S2 disclosed its
//     extra deny codes.
//   - `bindApprovalDecision`/`verifyApprovalBinding` mint/verify only: no
//     I/O, no ledger construction, no `DecisionLedger` append. The caller
//     appends the minted candidate through the EXISTING, unmodified
//     `DecisionLedger` (`appendDecision`) and resolves it through
//     `resolveEffective`, exactly mirroring `retry-policy.mjs`'s
//     `buildRetryDecisionRecord` discipline and `policy-decision-point.mjs`'s
//     "the PDP holds no ledger authority, the caller appends it" note.
//
// UNWIRED by construction: `grep -rn "approval-binding" src/ tools/` outside
// this file's own header returns no hits; neither `capability-registry-
// service.mjs` nor `goal-graph-service.mjs` imports anything from this
// module. Adoption/wiring is explicitly out of scope (see the producer
// verification record for this slice).
//
// SPEC-NAME MAPPING (disclosed deviation, review finding F3 — LOW/naming):
// this module's file and API names differ from the assessment's S3 sketch.
// The deviation is DISCLOSED and intentionally NOT reconciled by rename in
// this rework: renaming would be pure churn (touching every call site and
// test) with no safety gain, and the current names match THIS dispatch/branch
// (`bst/mod-runtime-s3-approval-binding`). The mapping is recorded here and in
// the rework record so a future consumer can resolve either vocabulary:
//   spec `approval-rules.mjs`  -> this file `approval-binding.mjs`
//   spec `bindApproval(...)`    -> `bindApprovalDecision(...)`
//   spec `verifyApproval(...)`  -> `verifyApprovalBinding(...)`
// Behavior, not names, is what the acceptance checks bind to; the behavior
// matches the spec (see the risk-registry composition below, review F1).
//
// RISK-REGISTRY COMPOSITION (review finding F1 — HIGH/spec-conformance):
// `verifyApprovalBinding` composes `risk-registry.riskProfile(riskClass)
// .humanApproval` to short-circuit ALLOW when — and ONLY when — the bound risk
// class carries an EXPLICIT `humanApproval === false` (no human gate is
// required for that class). Deny-by-default: ANY other value — `true`,
// `undefined`, a missing field, or an unknown risk class — requires the bound
// human decision and denies without it. This mirrors
// `policy-decision-point.mjs`'s own invariant ("anything other than an
// explicit false requires the human gate; the PDP never substitutes for a
// human approval") — this primitive does not substitute for a human approval
// either; the short-circuit only reflects that a `humanApproval:false` class
// never needed one. `risk-registry.mjs` is imported READ-ONLY and left
// byte-identical (no edit); its R0-R4 `humanApproval` table is the single
// source of truth this module parity-pins against.

import { normalizeRole, checkPairwiseDistinct } from "./sod-rules.mjs";
import { riskProfile } from "./risk-registry.mjs";

// Literal role tokens capability-registry-service.mjs matches by exact
// string equality (its own local constants, reproduced here verbatim so
// `roleMatchMode: "strict"` can reproduce that service's gate exactly
// without importing the service itself).
export const INDEPENDENT_REVIEW_ROLE = "independent_review";
export const GOVERNANCE_ROLE = "governance";

// The only positive outcome `bindApprovalDecision` ever mints — this
// module's own vocabulary (the assessment's S3 sketch does not name a
// literal outcome string, unlike S2's doctrine-sourced `RETRY_AUTHORIZED`;
// there is no doctrine literal to reuse here, so this is a disclosed
// producer addition following the codebase's `<NOUN>_<PAST_PARTICIPLE>`
// house style, e.g. `RETRY_AUTHORIZED`, `RECORD_INVALID`).
export const APPROVAL_BOUND = "APPROVAL_BOUND";

const isBlank = (value) => typeof value !== "string" || value.trim() === "";

// Shared shape check — byte-identical to both `approvalValid`
// (capability-registry-service.mjs) and `approvalWellFormed`
// (goal-graph-service.mjs): a non-null, non-array object with non-blank
// `role`/`actor_id` and a `decided_at` that Date.parse accepts.
export function approvalWellFormed(approval) {
  return approval !== null
    && typeof approval === "object"
    && !Array.isArray(approval)
    && !isBlank(approval.role)
    && !isBlank(approval.actor_id)
    && !isBlank(approval.decided_at)
    && Number.isFinite(Date.parse(approval.decided_at));
}

// Evaluate an N-5 approval bundle: one independent-review approval + one
// governance approval, pairwise-distinct from each other and from the
// producer. Pure, no I/O, deny-by-default.
//
//   approvals            — array of approval objects (see `approvalWellFormed`).
//   producerActorId       — the actor_id of the record/goal producer.
//   roleMatchMode         — "strict" (default target for capability-registry
//                           parity): matches `approval.role` by EXACT STRING
//                           equality against `independentRoleToken`/
//                           `governanceRoleToken`. "normalized" (default
//                           target for goal-graph parity): matches via
//                           `sod-rules.normalizeRole(approval.role) === "REV"|
//                           "GOV"`, accepting the wider alias vocabulary.
//                           See the drift note in this module's header —
//                           this parameter reproduces both services' CURRENT
//                           behavior rather than picking one.
//   independentRoleToken/
//   governanceRoleToken   — only consulted in "strict" mode.
//
// Returns { ok: true, independent, governance } or { ok: false, code }.
export function evaluateApprovalBinding({
  approvals,
  producerActorId,
  roleMatchMode = "strict",
  independentRoleToken = INDEPENDENT_REVIEW_ROLE,
  governanceRoleToken = GOVERNANCE_ROLE
} = {}) {
  if (!Array.isArray(approvals) || approvals.length === 0 || !approvals.every(approvalWellFormed)) {
    return { ok: false, code: "DENY_APPROVALS" };
  }
  if (isBlank(producerActorId)) {
    return { ok: false, code: "DENY_APPROVALS" };
  }

  let independent;
  let governance;
  if (roleMatchMode === "strict") {
    independent = approvals.find((approval) => approval.role === independentRoleToken);
    governance = approvals.find((approval) => approval.role === governanceRoleToken);
  } else if (roleMatchMode === "normalized") {
    independent = approvals.find((approval) => normalizeRole(approval.role) === "REV");
    governance = approvals.find((approval) => normalizeRole(approval.role) === "GOV");
  } else {
    return { ok: false, code: "DENY_INVALID_ROLE_MATCH_MODE" };
  }
  if (!independent || !governance) {
    return { ok: false, code: "DENY_APPROVALS" };
  }

  // Producer-as-independent is the dedicated self-approval deny; the
  // remaining collapses (one non-producer actor holding BOTH approvals, or
  // the producer holding the governance role) fall through to the
  // pairwise-distinct gate — matches both services' comment-documented
  // ordering exactly.
  if (independent.actor_id === producerActorId) {
    return { ok: false, code: "DENY_SELF_APPROVAL" };
  }
  const distinct = checkPairwiseDistinct([
    { role: "producer", actorId: producerActorId },
    { role: "independent_review", actorId: independent.actor_id },
    { role: "governance", actorId: governance.actor_id }
  ], { code: "DENY_SOD_VIOLATION" });
  if (!distinct.ok) {
    return { ok: false, code: distinct.code };
  }
  return { ok: true, independent, governance };
}

const RATIONALE_BY_OUTCOME = Object.freeze({
  [APPROVAL_BOUND]:
    "Approval bound: a well-formed independent-review approval and a well-formed governance approval, pairwise-distinct from the producer and each other, were bound to the named action and object version.",
  DENY_APPROVALS: "Approval binding denied: the approval bundle is missing, empty, malformed, or lacks a required independent-review or governance approval.",
  DENY_SELF_APPROVAL: "Approval binding denied: the independent-review approver is the producer.",
  DENY_SOD_VIOLATION: "Approval binding denied: the independent-review and governance approvers are not pairwise-distinct from each other and the producer.",
  DENY_INVALID_ROLE_MATCH_MODE: "Approval binding denied: roleMatchMode must be \"strict\" or \"normalized\"."
});

function isNonBlankString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

// Formats the evidence_refs entry that carries the exact-action/exact-
// object-version bind through the closed decision-record schema (no
// dedicated field exists for it — see the header note on why this
// technique was chosen instead of a schema change).
//
// INJECTIVE ENCODING (review finding F2 — MEDIUM/integrity): the prior
// encoding `approval-binding:${action}@${version}` was NON-injective — a `@`
// inside either field let one `(action, objectVersion)` pair collide with
// another (e.g. ("PROMOTE@filesystem.read", "1.0.0") and ("PROMOTE",
// "filesystem.read@1.0.0") both flattened to the same string, and real
// fixtures bind versions containing `@`). The `(action, objectVersion)` pair
// is now carried as a canonical JSON array. `JSON.stringify(["a","v"])` is a
// deterministic, unambiguously-decodable encoding of the ordered pair of
// strings: because JSON string tokens are self-delimiting (quotes + escaping)
// and the array has fixed arity 2, distinct pairs ALWAYS produce distinct
// strings — no split of the payload can collide. `verifyApprovalBinding`
// reconstructs the identical canonical string for its lookup, so the exact
// action + exact version bind (gap MR-3) can no longer be defeated by a
// delimiter-collision.
function bindingRef(boundAction, boundObjectVersion) {
  return `approval-binding:${JSON.stringify([boundAction, boundObjectVersion])}`;
}

// Mints a decision-record CANDIDATE for an approval-binding evaluation.
// Performs no I/O and holds no ledger authority — mirrors
// `retry-policy.mjs`'s `buildRetryDecisionRecord` and
// `policy-decision-point.mjs`'s "the PDP holds no ledger authority, the
// caller appends it" discipline exactly. The caller appends the returned
// candidate through the EXISTING, unmodified `DecisionLedger.appendDecision`.
//
// `evaluation` — the result of `evaluateApprovalBinding` (or an equivalent
//   { ok, code? } shape).
// `identity`   — every field this module cannot derive: decisionId,
//   version (default 1), projectId, workPackageId, sessionId, actorId,
//   authorityRef, decidedAt, validFrom, validUntil, boundAction,
//   boundObjectVersion, extraEvidenceRefs (default []). `boundAction`/
//   `boundObjectVersion` are REQUIRED to mint a non-null binding reference;
//   if either is missing/blank, no binding ref is added and
//   `verifyApprovalBinding` will fail-closed deny any later verification
//   against that candidate (an approval that binds to nothing cannot be
//   verified against something).
export function bindApprovalDecision(evaluation, identity = {}) {
  const outcome = evaluation && evaluation.ok ? APPROVAL_BOUND : (evaluation && evaluation.code);
  const rationale = RATIONALE_BY_OUTCOME[outcome] ?? "Approval-binding disposition recorded.";
  const {
    decisionId,
    version = 1,
    projectId,
    workPackageId,
    sessionId,
    actorId,
    authorityRef,
    decidedAt,
    validFrom,
    validUntil,
    boundAction,
    boundObjectVersion,
    extraEvidenceRefs = []
  } = identity;

  const evidenceRefs = [];
  if (isNonBlankString(boundAction) && isNonBlankString(boundObjectVersion)) {
    evidenceRefs.push(bindingRef(boundAction, boundObjectVersion));
  }
  for (const ref of extraEvidenceRefs) {
    if (isNonBlankString(ref)) evidenceRefs.push(ref);
  }

  return {
    decision_id: decisionId,
    version,
    project_id: projectId,
    work_package_id: workPackageId,
    session_id: sessionId,
    actor_id: actorId,
    decision_type: "GOVERNANCE",
    outcome,
    rationale,
    authority_ref: authorityRef,
    evidence_refs: evidenceRefs,
    decided_at: decidedAt,
    valid_from: validFrom,
    valid_until: validUntil
  };
}

// Fail-closed verifier: given a RESOLVED decision-record (e.g. the output of
// `DecisionLedger.resolveEffective(...).decision`), confirm it is a
// GOVERNANCE-typed, APPROVAL_BOUND-outcome decision bound to EXACTLY the
// named action and object version. This is the piece MR-3 flags as missing
// from every existing implementation: none of `policy-decision-point.mjs`,
// `capability-registry-service.mjs`, or `goal-graph-service.mjs` can answer
// "was this approval bound to THIS exact action and THIS exact version" —
// they only ever check well-formedness and actor distinctness at approval
// time, never a versioned replay/mismatch check at USE time.
//
// Deny-by-default: a null/missing resolved decision, a decision of the
// wrong type or outcome, or an action/version that does not match the
// bound evidence_refs entry all deny. Never converts a mismatch into an
// allow.
//
// RISK-REGISTRY humanApproval SHORT-CIRCUIT (review finding F1): when a
// `riskClass` is supplied AND `risk-registry.riskProfile(riskClass)` resolves
// a known class whose `humanApproval` is the EXPLICIT boolean `false`, no
// human gate is required for that class, so verification short-circuits to
// ALLOW without a bound human decision (returns `{ ok: true,
// humanApprovalRequired: false }`). EVERY other case is deny-by-default and
// falls through to require the bound decision: `humanApproval === true`, an
// absent/undefined `humanApproval`, an unknown risk class (riskProfile denies),
// or no `riskClass` at all. This is the exact inverse-safe reading of the
// PDP's "anything other than an explicit false requires the human gate".
export function verifyApprovalBinding(resolvedDecision, { exactAction, objectVersion, riskClass } = {}) {
  if (!isNonBlankString(exactAction) || !isNonBlankString(objectVersion)) {
    return { ok: false, code: "DENY_MALFORMED_VERIFICATION_REQUEST" };
  }
  const profile = riskProfile(riskClass);
  if (profile.ok && profile.value.humanApproval === false) {
    return { ok: true, humanApprovalRequired: false };
  }
  if (resolvedDecision === null || resolvedDecision === undefined || typeof resolvedDecision !== "object") {
    return { ok: false, code: "DENY_UNKNOWN_APPROVAL" };
  }
  if (resolvedDecision.decision_type !== "GOVERNANCE") {
    return { ok: false, code: "DENY_WRONG_DECISION_TYPE" };
  }
  if (resolvedDecision.outcome !== APPROVAL_BOUND) {
    return { ok: false, code: "DENY_NOT_APPROVED" };
  }
  const refs = Array.isArray(resolvedDecision.evidence_refs) ? resolvedDecision.evidence_refs : [];
  const expected = bindingRef(exactAction, objectVersion);
  if (!refs.includes(expected)) {
    return { ok: false, code: "DENY_ACTION_VERSION_MISMATCH" };
  }
  return { ok: true };
}
