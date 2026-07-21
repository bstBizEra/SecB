import { validateContract } from "../contracts/contract-validator.mjs";
import { findReservedDelimiter } from "../contracts/reserved-delimiters.mjs";
import { evaluateApprovalBinding, bindApprovalDecision, verifyApprovalBinding } from "../control/approval-binding.mjs";
import { riskProfile } from "../control/risk-registry.mjs";
import { DurableLedger, LedgerError } from "./durable-ledger.mjs";

// MOD-SKILL Slice S2 (closes the re-scoped gaps G2/G3 in
// docs/03-project-control/candidates/mod-skill-gap-assessment-001-addendum-001.md
// Section 5): governed skill-candidate PROMOTION transition (CANDIDATE ->
// PUBLISHED), R3+, UNWIRED CANDIDATE. This is a ledger PRIMITIVE, not a
// running promotion service — nothing in this file is imported by, or wired
// into, `src/registry/skill-candidate-registry.mjs` (S1) or any resolver.
//
// REUSE, NOT REIMPLEMENTATION (addendum §5, direct instruction: "the N-5
// approval evaluation itself is not reimplemented"):
//   - `evaluateApprovalBinding` / `bindApprovalDecision` / `verifyApprovalBinding`
//     (src/control/approval-binding.mjs, MOD-RUNTIME-S3) are imported
//     READ-ONLY and unmodified. This module contains NO pairwise-distinctness
//     math, NO self-approval check, and NO role-matching logic of its own —
//     every SoD outcome (DENY_APPROVALS / DENY_SELF_APPROVAL /
//     DENY_SOD_VIOLATION / APPROVAL_BOUND) is exactly whatever
//     evaluateApprovalBinding returns. The promotion decision is bound to the
//     EXACT `skill_candidate_id@skill_version` via `boundAction`/
//     `boundObjectVersion` (MR-3-class replay protection: an approval bound to
//     `skill-x@1.0.0` cannot verify against `skill-x@1.1.0`), then
//     RE-VERIFIED via `verifyApprovalBinding` before anything is written —
//     mint and verify are two independent calls into the same reused
//     primitive, not a single trusted round-trip.
//   - `riskProfile` (src/control/risk-registry.mjs) is imported READ-ONLY to
//     enforce the addendum's own ruling that promotion is R3+
//     ("risk_class: high... MUST reuse the kernel's SoD/risk primitives,
//     never re-derive them"): `promote()` denies any `riskClass` whose
//     profile does not carry `humanApproval === true`, so a caller cannot
//     bypass the human gate by claiming a low risk class. This also means the
//     `verifyApprovalBinding` humanApproval:false short-circuit documented in
//     approval-binding.mjs can never trigger from this call site — this
//     module always supplies an R3+ class before reaching that call.
//   - `findReservedDelimiter` (GOV-P011-08, src/contracts/reserved-delimiters.mjs)
//     is reapplied to `skillCandidateId`/`skillVersion` exactly as S1 applies
//     it to the same fields — this ledger is not wired to S1's registry and
//     cannot assume its inputs were ever validated there.
//
// ATOMIC-FROM-DAY-ONE DUPLICATE-TRANSITION GATE (addendum §3, the explicit
// "do not repeat this mistake" instruction). `capability-registry-service.
// promote()` — the closest existing analog for "promotion" in this codebase —
// checks `DENY_ALREADY_PROMOTED` against an in-memory `Map`, which is only
// safe as long as exactly one process ever holds that Map for a given id; two
// instances sharing a persisted store but keeping independent in-memory state
// would each pass a check-then-act race the other cannot see (the exact bug
// `mod-wspace-s3-single-writer-toctou-fix-001` found and fixed in
// `WorkspaceLeaseLedger`). This ledger is designed out of that class of bug
// from the start: `#detectAlreadyPublished` never calls `this.read()` on its
// own. It is invoked ONLY as the `preWriteCheck(records, entry)` hook
// (`DurableLedger.append`, `durable-ledger.mjs` lines 113-136), so it always
// scans the SAME lock-held, freshly-read-and-verified `records` snapshot the
// base class is about to write against — there is no second, independent,
// overridable read for a race to exploit. See
// `tests/skill-promotion-ledger.test.mjs` for a PROBE1-style regression proof
// (mirrors the WSPACE fix's own regression test) that overrides a second
// ledger instance's public `read()` accessor to throw and confirms the gate
// is unaffected because it never calls it.
//
// Business rule enforced by the gate: a `skill_candidate_id` may have at most
// ONE currently-PUBLISHED version at a time (mirrors capability-registry-
// service's cross-version singleton "already promoted" semantics, the
// closest existing analog for what "promotion" means here) — promoting a
// second version while one is already published, or re-promoting the exact
// same version, both deny `DENY_ALREADY_PUBLISHED`. Revocation (so a new
// version could ever be promoted after an old one is retired) is explicitly
// OUT OF SCOPE here: MOD-SKILL S3 (revocation lifecycle, IMM-SKILL-V1) is a
// separate, not-yet-built slice per the addendum §5 closing line — this
// ledger has no `revoke()`/REVOKED status and never will define one; a
// future S3 producer owns that surface.
//
// DENIAL AUDIT SCOPE (disclosed design choice): unlike
// `SkillCandidateRegistry`/`CapabilityRegistryService`, which write an audit
// entry for every attempt (including denials) to a separate injected
// `ledgerWriter` sink, this ledger writes ONLY successful PUBLISHED
// transitions to its own durable log — a denial (malformed input, failed SoD,
// missing evidence, duplicate transition) returns a structured deny and never
// takes the append lock or writes anything. This durable ledger is a fact
// store of promotion outcomes, not an attempt-audit trail; attempt-level
// audit is a distinct, separately-owned concern (as S1 demonstrates with its
// own injected `ledgerWriter`) that a future promotion SERVICE consuming this
// ledger would supply, exactly as `SkillCandidateRegistry` does today. Not
// building that service is intentional scope discipline for this slice (see
// producer verification record).
//
// GOV-P011-08 note: `boundObjectVersion` composes
// `${skillCandidateId}@${skillVersion}` (mirrors WorkspaceLeaseLedger's own
// `${lease_id}@v${version}` composite entryId convention). This is collision-
// safe: `findReservedDelimiter` denies '@' in either component before the
// composite is ever built, so no value of one component can be split to
// masquerade as a different (skillCandidateId, skillVersion) pair.

export const PROMOTE_SKILL_ACTION = "PROMOTE_SKILL";

const isNonBlankString = (value) => typeof value === "string" && value.trim().length > 0;

const deny = (code, message, extra) => Object.freeze({ ok: false, code, message, ...extra });

function boundObjectVersion(skillCandidateId, skillVersion) {
  return `${skillCandidateId}@${skillVersion}`;
}

function skillPromotionEntry(promotion, idempotencyKey) {
  return {
    entryId: promotion.decision_id,
    projectId: promotion.project_id,
    workPackageId: promotion.work_package_id,
    sessionId: promotion.session_id,
    actorId: promotion.actor_id,
    type: "SKILL_PROMOTION",
    payload: promotion,
    timestamp: promotion.decided_at,
    idempotencyKey
  };
}

// Atomic single-read snapshot of the caller-supplied request. Every own
// string-keyed property is read EXACTLY ONCE via structuredClone (trap-free
// plain data, all own enumerable keys preserved), containing a hostile
// getter/Proxy trap here rather than letting it reach validation or the hash
// chain (mirrors WorkspaceLeaseLedger's `snapshotLease` / write-set-policy's
// single-read TOCTOU closure).
function snapshotRequest(source) {
  if (source === null || typeof source !== "object" || Array.isArray(source)) {
    throw new LedgerError("DENY_PROMOTION_MALFORMED", "skill promotion request must be an object");
  }
  try {
    return structuredClone(source);
  } catch {
    throw new LedgerError("DENY_PROMOTION_MALFORMED", "skill promotion request could not be safely inspected");
  }
}

export class SkillPromotionLedger extends DurableLedger {
  constructor({ filePath }) {
    super({ filePath, ledgerId: "secb-skill-promotion-ledger" });
  }

  // The sole write path. Structural/malformed-input problems fail closed by
  // THROWING a typed error before any lock is taken (mirrors
  // WorkspaceLeaseLedger.appendLease exactly). SoD/evidence/risk-floor
  // business denials return a structured deny WITHOUT taking the lock or
  // writing anything (see the DENIAL AUDIT SCOPE note above). Only the
  // "already published" duplicate-transition check runs inside the locked
  // critical section, via `preWriteCheck`.
  //
  // request:
  //   skillCandidateId, skillVersion   — identity of the candidate being promoted.
  //   producerActorId                  — the candidate's own producer/maintainer.
  //   approvals                        — N-5 approval bundle, passed VERBATIM
  //                                       to `evaluateApprovalBinding` (see
  //                                       its own doc for the well-formedness
  //                                       shape).
  //   roleMatchMode                    — "strict" (default) | "normalized",
  //                                       passed verbatim to
  //                                       `evaluateApprovalBinding`.
  //   riskClass                        — must resolve via `riskProfile` to a
  //                                       profile with `humanApproval === true`
  //                                       (R3+ floor; default "R3").
  //   evidenceRefs                     — non-empty array of non-blank
  //                                       evaluation-evidence reference
  //                                       strings (G2 structural requirement;
  //                                       resolving them through MOD-EVID's
  //                                       chain is explicitly NOT done here —
  //                                       see producer verification record).
  //   decisionId                       — becomes both the bound decision's
  //                                       `decision_id` and this ledger
  //                                       entry's `entryId` (so replaying the
  //                                       same decisionId a second time hits
  //                                       the BASE class's own idempotency/
  //                                       duplicate-entryId handling, a
  //                                       second, independent layer of replay
  //                                       defense on top of the exact-version
  //                                       bind).
  //   projectId, workPackageId, sessionId, actorId, authorityRef,
  //   decidedAt, validFrom, validUntil — identity fields passed through to
  //                                       `bindApprovalDecision` verbatim.
  //   contentHash                      — caller-supplied sha256 hex integrity
  //                                       anchor (house convention, mirrors
  //                                       CheckpointLedger/WorkspaceLeaseLedger
  //                                       — NOT computed or verified against
  //                                       any content by this ledger).
  //
  // options: { expectedSequence, idempotencyKey } — passed straight through
  //   to `DurableLedger.append`.
  promote(request, { expectedSequence, idempotencyKey } = {}) {
    const input = snapshotRequest(request);
    const {
      skillCandidateId, skillVersion, producerActorId, approvals,
      roleMatchMode = "strict", riskClass = "R3", evidenceRefs,
      decisionId, projectId, workPackageId, sessionId, actorId,
      authorityRef, decidedAt, validFrom, validUntil, contentHash
    } = input;

    if (!isNonBlankString(skillCandidateId) || !isNonBlankString(skillVersion)) {
      throw new LedgerError("DENY_PROMOTION_MALFORMED", "skillCandidateId and skillVersion are required non-blank strings");
    }
    if (!idempotencyKey) {
      throw new LedgerError("DENY_MISSING_ENTRY_FIELDS", "idempotencyKey is required for skill-promotion append");
    }
    if (!isNonBlankString(decisionId)) {
      throw new LedgerError("DENY_PROMOTION_MALFORMED", "decisionId is required");
    }
    if (!isNonBlankString(actorId)) {
      throw new LedgerError("DENY_PROMOTION_MALFORMED", "actorId is required");
    }

    // GOV-P011-08, reapplied independently of S1 (this ledger is not wired to
    // the S1 registry and cannot assume its inputs were validated there).
    if (findReservedDelimiter(skillCandidateId) || findReservedDelimiter(skillVersion)) {
      return deny("DENY_ID_CHARSET", "skillCandidateId/skillVersion may not contain reserved composite-key delimiters (GOV-P011-08)");
    }

    // Promotion is R3+ by policy (addendum §5, §4 boundary ruling): deny any
    // riskClass whose profile does not mandate human approval. Reused from
    // risk-registry.mjs verbatim, never re-derived.
    const profile = riskProfile(riskClass);
    if (!profile.ok || profile.value.humanApproval !== true) {
      return deny("DENY_RISK_CLASS_BELOW_FLOOR", "skill promotion requires a risk class whose profile mandates human approval (R3+)", { riskClass });
    }

    const objectVersion = boundObjectVersion(skillCandidateId, skillVersion);

    // The N-5 SoD evaluation itself: entirely reused, not reimplemented.
    const evaluation = evaluateApprovalBinding({ approvals, producerActorId, roleMatchMode });
    const decisionRecord = bindApprovalDecision(evaluation, {
      decisionId,
      version: 1,
      projectId,
      workPackageId,
      sessionId,
      actorId,
      authorityRef: authorityRef ?? "authority:mod-skill-s2-governed-promotion",
      decidedAt,
      validFrom: validFrom ?? decidedAt,
      validUntil: validUntil ?? decidedAt,
      boundAction: PROMOTE_SKILL_ACTION,
      boundObjectVersion: objectVersion
    });

    if (!evaluation.ok) {
      return deny(evaluation.code, decisionRecord.rationale, { decisionRecord });
    }

    // Re-verify the freshly-minted binding before trusting it (defense in
    // depth: mint and verify are two independent calls into the reused
    // primitive, not a single trusted round-trip) and closes MR-3-class
    // replay: a decision bound to a DIFFERENT action/object-version could
    // never reach this point with ok:true.
    const verification = verifyApprovalBinding(decisionRecord, {
      exactAction: PROMOTE_SKILL_ACTION,
      objectVersion,
      riskClass
    });
    if (!verification.ok) {
      return deny(verification.code, "skill promotion denied at approval-binding verification", { decisionRecord });
    }

    // G2 (evaluation-evidence binding), structural half only: at least one
    // non-blank evidence reference must accompany the promotion. Resolving
    // these through MOD-EVID's register->seal->verify->accept->resolve chain
    // is explicitly NOT done here (would require importing a resolver, which
    // this slice's UNWIRED charter forbids) — disclosed as a follow-up in the
    // producer verification record.
    if (!Array.isArray(evidenceRefs) || evidenceRefs.length === 0 || !evidenceRefs.every(isNonBlankString)) {
      return deny("DENY_EVIDENCE_REFS_REQUIRED", "at least one non-blank evaluation-evidence reference is required to promote a skill candidate");
    }

    const promotionPayload = {
      decision_id: decisionId,
      version: 1,
      project_id: projectId,
      work_package_id: workPackageId,
      session_id: sessionId,
      actor_id: actorId,
      skill_candidate_id: skillCandidateId,
      skill_version: skillVersion,
      status: "PUBLISHED",
      producer_actor_id: producerActorId,
      independent_review_actor_id: evaluation.independent.actor_id,
      governance_actor_id: evaluation.governance.actor_id,
      bound_action: PROMOTE_SKILL_ACTION,
      bound_object_version: objectVersion,
      evidence_refs: [...evidenceRefs],
      risk_class: riskClass,
      decided_at: decidedAt,
      content_hash: contentHash
    };

    // Fail-closed contract validation (throws DENY_CONTRACT_INVALID on any
    // structural defect not already caught above, e.g. a malformed
    // content_hash or decidedAt) — mirrors CheckpointLedger.appendCheckpoint /
    // WorkspaceLeaseLedger.appendLease exactly.
    validateContract("skillPromotion", promotionPayload);

    // The atomic-from-day-one gate: evaluated INSIDE DurableLedger.append's
    // own lock, against the SAME freshly-read+verified `records` snapshot the
    // base class is about to write against. `#detectAlreadyPublished` never
    // calls `this.read()` — there is no second, independent, overridable read
    // for a race to exploit (see header note).
    const result = this.append(skillPromotionEntry(promotionPayload, idempotencyKey), {
      expectedSequence,
      preWriteCheck: (records) => {
        const conflict = this.#detectAlreadyPublished(skillCandidateId, records);
        if (!conflict) return null;
        return deny(
          "DENY_ALREADY_PUBLISHED",
          `skill candidate ${skillCandidateId} already has a published version (${conflict.skillVersion})`,
          { skillCandidateId, conflictingVersion: conflict.skillVersion, conflictingDecisionId: conflict.decisionId }
        );
      }
    });

    if (result && result.ok === false) return result;
    return Object.freeze({ ok: true, record: result, decisionRecord: Object.freeze(structuredClone(decisionRecord)) });
  }

  // Scans `records` — the exact, already locked+verified snapshot
  // `DurableLedger.append` just read for THIS write, passed in via the
  // `preWriteCheck` hook, never fetched independently here — for any prior
  // entry recording the SAME `skill_candidate_id` (any version) already
  // PUBLISHED. Because `records` comes from inside the locked critical
  // section, a tampered ledger still fails closed before this method ever
  // runs (`#verifyRecords` throws first, inherited unchanged).
  #detectAlreadyPublished(skillCandidateId, records) {
    for (const record of records) {
      const payload = record.entry.payload;
      if (payload.skill_candidate_id !== skillCandidateId) continue;
      if (payload.status === "PUBLISHED") {
        return { skillVersion: payload.skill_version, decisionId: payload.decision_id };
      }
    }
    return null;
  }

  // Fail-closed read-side lookup: the currently-published version for a
  // skill_candidate_id, or a structured deny. Mirrors
  // CheckpointLedger.resolveLatest / WorkspaceLeaseLedger.resolveActiveLease's
  // deny-on-use discipline. Not consumed by any live path in this slice.
  resolvePublished(skillCandidateId) {
    if (!isNonBlankString(skillCandidateId)) {
      return deny("DENY_INVALID_SKILL_CANDIDATE_ID", "skillCandidateId must be a non-empty string");
    }
    const match = this.read().find(
      (record) => record.entry.payload.skill_candidate_id === skillCandidateId && record.entry.payload.status === "PUBLISHED"
    );
    if (!match) {
      return deny("DENY_UNKNOWN_SKILL_CANDIDATE", `No published version recorded for skill candidate: ${skillCandidateId}`);
    }
    return Object.freeze({
      ok: true,
      skillCandidateId,
      skillVersion: match.entry.payload.skill_version,
      decisionId: match.entry.payload.decision_id,
      sequence: match.sequence
    });
  }
}
