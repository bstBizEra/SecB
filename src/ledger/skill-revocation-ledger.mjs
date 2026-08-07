import { validateContract } from "../contracts/contract-validator.mjs";
import { findReservedDelimiter } from "../contracts/reserved-delimiters.mjs";
import { evaluateApprovalBinding, bindApprovalDecision, verifyApprovalBinding } from "../control/approval-binding.mjs";
import { riskProfile } from "../control/risk-registry.mjs";
import { DurableLedger, LedgerError } from "./durable-ledger.mjs";

// MOD-SKILL Slice S3 (closes IMM-SKILL-V1 gap G5, components 1+2 ONLY, from
// docs/03-project-control/candidates/mod-skill-gap-assessment-001.md §5.3 / §7):
// a governed skill REVOCATION transition (PUBLISHED -> REVOKED), R3+, UNWIRED
// CANDIDATE. This is a ledger PRIMITIVE, not a running revocation service —
// nothing in this file is imported by, or wired into,
// `src/registry/skill-resolver.mjs`, `src/registry/skill-candidate-registry.mjs`
// (S1), `src/ledger/skill-promotion-ledger.mjs` (S2), or any resolver / live
// path.
//
// SCOPE — components 1+2 of the assessment's Slice 3, and NOTHING else:
//   1. A governed `revoke(request)` transition PUBLISHED->REVOKED that records
//      `known_bad_versions`, requires governance approval, and writes
//      audit-first to a durable, hash-chained ledger — a direct mirror of
//      `CapabilityRegistryService.revoke` (audit-first, deny-by-default,
//      governance-gated, records known-bad versions), rebuilt on the DurableLedger
//      subclass discipline of the S2 sibling `skill-promotion-ledger.mjs` instead of
//      an in-memory Map (so it is atomic-from-day-one, see below).
//   2. The REVOCATION approval decision is BOUND to a governed GOVERNANCE
//      decision — the exact HUMAN_PROMOTION binding technique S2 uses for
//      promotion, applied here to revocation, so a REVOCATION is no longer
//      trusted as bare caller data (assessment I2/G5: today REVOCATION entries
//      are trusted, unlike HUMAN_PROMOTION). The bound governed decision IS the
//      revocation's approval evidence, embedded in the ledger fact.
//
// EXPLICITLY OUT OF SCOPE (component 3, operator-gated follow-up — see the
// producer verification record):
//   - Resolution-time `resolveEffective` re-validation in `skill-resolver.mjs`
//     (DENY_REVOKED / DENY_PROMOTION_LAPSED at resolution). That alters the
//     LIVE resolver's runtime deny behavior and is left as a separate,
//     operator-gated wiring step. This file therefore NEVER imports or mutates
//     `skill-resolver.mjs`, and the resolver's existing static-REVOCATION
//     poison check and registration-time accept behavior are left untouched.
//   - Harness-compatibility (C0-C5) enforcement at resolution — same reason.
//
// REUSE, NOT REIMPLEMENTATION (mirrors S2 exactly):
//   - `evaluateApprovalBinding` / `bindApprovalDecision` / `verifyApprovalBinding`
//     (src/control/approval-binding.mjs, MOD-RUNTIME-S3) are imported READ-ONLY
//     and unmodified. This module contains NO pairwise-distinctness math, NO
//     self-approval check, and NO role-matching logic of its own — every SoD
//     outcome (DENY_APPROVALS / DENY_SELF_APPROVAL / DENY_SOD_VIOLATION /
//     DENY_INVALID_ROLE_MATCH_MODE / APPROVAL_BOUND) is exactly whatever
//     `evaluateApprovalBinding` returns. Unlike `CapabilityRegistryService.
//     revoke` (which requires only a single lone GOVERNANCE approval and no
//     producer-distinctness), this transition TIGHTENS revocation to the FULL
//     N-5 bundle — independent-review + governance, pairwise-distinct from the
//     producer and each other — matching the HUMAN_PROMOTION binding (assessment
//     §7.2: "tighten to match HUMAN_PROMOTION binding"). The revocation decision
//     is bound to the EXACT `REVOKE_SKILL@<objectVersion>` via `boundAction` /
//     `boundObjectVersion` (MR-3-class replay protection: an approval bound to
//     revoking `skill-x@1.0.0` cannot verify against revoking `skill-x@2.0.0`,
//     nor against an all-versions revoke of `skill-x`), then RE-VERIFIED via
//     `verifyApprovalBinding` before anything is written — mint and verify are
//     two independent calls into the same reused primitive, not one trusted
//     round-trip.
//   - `riskProfile` (src/control/risk-registry.mjs) is imported READ-ONLY to
//     enforce that revocation is R3+ (assessment §5.3 risk_class: high):
//     `revoke()` denies any `riskClass` whose profile does not carry
//     `humanApproval === true`, so a caller cannot bypass the human gate by
//     claiming a low risk class. This also means the `verifyApprovalBinding`
//     humanApproval:false short-circuit can never trigger from this call site.
//   - `findReservedDelimiter` (GOV-P011-08, src/contracts/reserved-delimiters.mjs)
//     is applied to `skillId` and every version string exactly as S1/S2 apply
//     it — this ledger is not wired to any registry and cannot assume its
//     inputs were validated elsewhere.
//   - The governed decision is schema-validated by REUSING the EXISTING
//     `decisionRecord` contract (`contracts/decision-record.schema.json`,
//     `decision_type: "GOVERNANCE"`) via `validateContract`. NO new schema is
//     added: the skill-manifest schema already models `status: REVOKED` and the
//     `REVOCATION` approval-history type (assessment I2), and the governed
//     approval binding reuses the decision-record's existing "GOVERNANCE"
//     decision_type (exactly as approval-binding.mjs documents). The
//     revocation-specific FACT fields (`known_bad_versions`, `reason`,
//     `status`, `skill_id`, `content_hash`) are structurally validated in
//     code — mirroring `CapabilityRegistryService.revoke`, which likewise
//     schema-validates only its intake path, never its revocation output.
//
// ATOMIC-FROM-DAY-ONE ALREADY-REVOKED GATE (mirrors S2's already-published gate
// and the mod-wspace-s3-single-writer-toctou-fix discipline). REVOKED is a
// terminal-forever state: once a `(skill_id, version)` — or an all-versions
// revoke of a `skill_id` — is recorded REVOKED, any overlapping re-revoke
// denies `DENY_ALREADY_REVOKED`. `#detectAlreadyRevoked` NEVER calls
// `this.read()`; it is invoked ONLY as the `preWriteCheck(records, entry)` hook
// (`DurableLedger.append`), so it always scans the SAME lock-held,
// freshly-read-and-verified `records` snapshot the base class is about to write
// against — there is no second, independent, overridable read for a race to
// exploit. See `tests/skill-revocation-ledger.test.mjs` for a PROBE1-style
// regression proof that overrides a second instance's public `read()` to throw
// and confirms the gate is unaffected.
//
// DENIAL AUDIT SCOPE (disclosed design choice, identical to S2): this ledger
// writes ONLY successful REVOKED transitions to its own durable, hash-chained
// log — a denial (malformed input, failed SoD, missing/blank reason, below-floor
// risk, already-revoked) returns a structured deny and never takes the append
// lock or writes anything. "Audit-first" here means write-before-effect: the
// REVOKED fact does not exist as state until it is durably appended (the ledger
// record IS the state; there is no separate in-memory status that flips first).
// Attempt-level audit of denials is a distinct, separately-owned concern that a
// future revocation SERVICE consuming this ledger would supply (as
// `SkillCandidateRegistry`/`CapabilityRegistryService` do via an injected
// attempt sink). Not building that service is intentional scope discipline.
//
// GOV-P011-08 note: for a single-version revoke `boundObjectVersion` composes
// `${skillId}@${skillVersion}`; for an all-versions revoke it is the bare
// `${skillId}`. This is injective: `findReservedDelimiter` denies '@' in
// `skillId` and in every version before either form is built, so a bare
// `skillId` (no '@') can never collide with any `skillId@version` form, and no
// value of one component can be split to masquerade as a different pair.

export const REVOKE_SKILL_ACTION = "REVOKE_SKILL";

const isNonBlankString = (value) => typeof value === "string" && value.trim().length > 0;
const isSha256Hex = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

const deny = (code, message, extra) => Object.freeze({ ok: false, code, message, ...extra });

function boundObjectVersion(skillId, skillVersion, allVersions) {
  return allVersions ? `${skillId}` : `${skillId}@${skillVersion}`;
}

function skillRevocationEntry(revocation, idempotencyKey) {
  return {
    entryId: revocation.decision.decision_id,
    projectId: revocation.decision.project_id,
    workPackageId: revocation.decision.work_package_id,
    sessionId: revocation.decision.session_id,
    actorId: revocation.decision.actor_id,
    type: "SKILL_REVOCATION",
    payload: revocation,
    timestamp: revocation.decided_at,
    idempotencyKey
  };
}

// Atomic single-read snapshot of the caller-supplied request. Every own
// string-keyed property is read EXACTLY ONCE via structuredClone (trap-free
// plain data, all own enumerable keys preserved), containing a hostile
// getter/Proxy trap here rather than letting it reach validation or the hash
// chain (mirrors the S2 skill-promotion ledger's snapshotRequest / WorkspaceLeaseLedger's
// snapshotLease single-read TOCTOU closure — a single [[Get]] per field, never
// a per-field getOwnPropertyDescriptor probe).
function snapshotRequest(source) {
  if (source === null || typeof source !== "object" || Array.isArray(source)) {
    throw new LedgerError("DENY_REVOKE_MALFORMED", "skill revocation request must be an object");
  }
  try {
    return structuredClone(source);
  } catch {
    throw new LedgerError("DENY_REVOKE_MALFORMED", "skill revocation request could not be safely inspected");
  }
}

export class SkillRevocationLedger extends DurableLedger {
  constructor({ filePath }) {
    super({ filePath, ledgerId: "secb-skill-revocation-ledger" });
  }

  // The sole write path. Structural/malformed-input problems fail closed by
  // THROWING a typed error before any lock is taken. SoD/risk-floor/reason/
  // version-set business denials return a structured deny WITHOUT taking the
  // lock or writing anything (see the DENIAL AUDIT SCOPE note above). Only the
  // "already revoked" terminal-state check runs inside the locked critical
  // section, via `preWriteCheck`.
  //
  // request:
  //   skillId               — identity of the skill being revoked.
  //   allVersions           — true to revoke every currently-known version of
  //                           the skill (records them all as known_bad_versions);
  //                           false/omitted to revoke a single `skillVersion`.
  //   skillVersion          — required non-blank when allVersions !== true.
  //   knownVersions         — required non-empty array of non-blank version
  //                           strings when allVersions === true (this UNWIRED
  //                           primitive holds no manifest store to enumerate, so
  //                           the caller declares the currently-known version set
  //                           being revoked; see producer verification record).
  //   reason                — required non-blank revocation reason.
  //   producerActorId       — the revoked skill's producer/maintainer.
  //   approvals             — N-5 approval bundle, passed VERBATIM to
  //                           `evaluateApprovalBinding`.
  //   roleMatchMode         — "strict" (default) | "normalized", passed verbatim.
  //   riskClass             — must resolve via `riskProfile` to a profile with
  //                           `humanApproval === true` (R3+ floor; default "R3").
  //   decisionId            — the governed decision id AND this ledger entry's
  //                           entryId (second, independent replay layer on top
  //                           of the exact-version bind).
  //   projectId, workPackageId, sessionId, actorId, authorityRef, decidedAt,
  //   validFrom, validUntil — identity fields passed through to
  //                           `bindApprovalDecision` verbatim.
  //   contentHash           — caller-supplied sha256 hex integrity anchor (house
  //                           convention; NOT computed or verified against any
  //                           content by this ledger).
  //
  // options: { expectedSequence, idempotencyKey } — passed straight through to
  //   `DurableLedger.append`.
  revoke(request, { expectedSequence, idempotencyKey } = {}) {
    const input = snapshotRequest(request);
    const {
      skillId, allVersions, skillVersion, knownVersions, reason,
      producerActorId, approvals, roleMatchMode = "strict", riskClass = "R3",
      decisionId, projectId, workPackageId, sessionId, actorId,
      authorityRef, decidedAt, validFrom, validUntil, contentHash
    } = input;

    // --- Structural fail-closed throws (before any lock) --------------------
    if (!isNonBlankString(skillId)) {
      throw new LedgerError("DENY_REVOKE_MALFORMED", "skillId is a required non-blank string");
    }
    if (!idempotencyKey) {
      throw new LedgerError("DENY_MISSING_ENTRY_FIELDS", "idempotencyKey is required for skill-revocation append");
    }
    if (!isNonBlankString(decisionId)) {
      throw new LedgerError("DENY_REVOKE_MALFORMED", "decisionId is required");
    }
    if (!isNonBlankString(actorId)) {
      throw new LedgerError("DENY_REVOKE_MALFORMED", "actorId is required");
    }
    // content_hash is the durable fact's integrity anchor. With no bespoke fact
    // schema (reuse-only), it is validated here in code (mirrors
    // CapabilityRegistryService.revoke's code-level output discipline).
    if (!isSha256Hex(contentHash)) {
      throw new LedgerError("DENY_REVOKE_MALFORMED", "contentHash must be a 64-char lowercase sha256 hex string");
    }

    // --- Version-set resolution (deny-by-default) --------------------------
    const revokeAll = allVersions === true;
    let knownBad;
    if (revokeAll) {
      if (!Array.isArray(knownVersions) || knownVersions.length === 0 || !knownVersions.every(isNonBlankString)) {
        return deny("DENY_MALFORMED_VERSION_SET", "allVersions revocation requires a non-empty knownVersions array of non-blank strings");
      }
      knownBad = [...new Set(knownVersions)];
    } else {
      if (!isNonBlankString(skillVersion)) {
        return deny("DENY_MALFORMED_VERSION_SET", "single-version revocation requires a non-blank skillVersion (or set allVersions: true)");
      }
      knownBad = [skillVersion];
    }

    // GOV-P011-08, reapplied independently (this ledger is not wired to any
    // registry and cannot assume its inputs were validated there).
    for (const value of [skillId, ...knownBad]) {
      if (findReservedDelimiter(value)) {
        return deny("DENY_ID_CHARSET", "skillId/version may not contain reserved composite-key delimiters (GOV-P011-08)");
      }
    }

    if (!isNonBlankString(reason)) {
      return deny("DENY_REVOCATION_INVALID", "a non-blank revocation reason is required");
    }

    // Revocation is R3+ by policy (assessment §5.3): deny any riskClass whose
    // profile does not mandate human approval. Reused verbatim, never re-derived.
    const profile = riskProfile(riskClass);
    if (!profile.ok || profile.value.humanApproval !== true) {
      return deny("DENY_RISK_CLASS_BELOW_FLOOR", "skill revocation requires a risk class whose profile mandates human approval (R3+)", { riskClass });
    }

    const objectVersion = boundObjectVersion(skillId, skillVersion, revokeAll);

    // The N-5 SoD evaluation itself: entirely reused, not reimplemented.
    const evaluation = evaluateApprovalBinding({ approvals, producerActorId, roleMatchMode });
    const decisionRecord = bindApprovalDecision(evaluation, {
      decisionId,
      version: 1,
      projectId,
      workPackageId,
      sessionId,
      actorId,
      authorityRef: authorityRef ?? "authority:mod-skill-s3-revoke-primitive",
      decidedAt,
      validFrom: validFrom ?? decidedAt,
      validUntil: validUntil ?? decidedAt,
      boundAction: REVOKE_SKILL_ACTION,
      boundObjectVersion: objectVersion
    });

    if (!evaluation.ok) {
      return deny(evaluation.code, decisionRecord.rationale, { decisionRecord });
    }

    // Re-verify the freshly-minted binding before trusting it (defense in
    // depth: mint and verify are two independent calls into the reused
    // primitive) — closes MR-3-class replay: a decision bound to a DIFFERENT
    // action/object-version could never reach this point with ok:true.
    const verification = verifyApprovalBinding(decisionRecord, {
      exactAction: REVOKE_SKILL_ACTION,
      objectVersion,
      riskClass
    });
    if (!verification.ok) {
      return deny(verification.code, "skill revocation denied at approval-binding verification", { decisionRecord });
    }

    // Fail-closed contract validation of the governed decision, REUSING the
    // existing decision-record schema (throws DENY_CONTRACT_INVALID on any
    // structural defect not already caught above, e.g. a malformed decidedAt /
    // valid_from / valid_until date-time). No new schema is introduced.
    validateContract("decisionRecord", decisionRecord);

    const revocationPayload = {
      // Component 2: the REVOCATION is bound to this governed GOVERNANCE
      // decision (the HUMAN_PROMOTION-style binding), embedded as the
      // revocation's approval evidence rather than trusted as bare caller data.
      decision: decisionRecord,
      skill_id: skillId,
      status: "REVOKED",
      all_versions: revokeAll,
      revoked_versions: [...knownBad],
      known_bad_versions: [...knownBad],
      reason,
      producer_actor_id: producerActorId,
      independent_review_actor_id: evaluation.independent.actor_id,
      governance_actor_id: evaluation.governance.actor_id,
      bound_action: REVOKE_SKILL_ACTION,
      bound_object_version: objectVersion,
      risk_class: riskClass,
      decided_at: decidedAt,
      content_hash: contentHash
    };

    // The atomic-from-day-one terminal-state gate: evaluated INSIDE
    // DurableLedger.append's own lock, against the SAME freshly-read+verified
    // `records` snapshot the base class is about to write against.
    // `#detectAlreadyRevoked` never calls `this.read()`.
    const result = this.append(skillRevocationEntry(revocationPayload, idempotencyKey), {
      expectedSequence,
      preWriteCheck: (records) => {
        const conflict = this.#detectAlreadyRevoked(skillId, revokeAll, knownBad, records);
        if (!conflict) return null;
        return deny(
          "DENY_ALREADY_REVOKED",
          `skill ${skillId} already has a revoked record overlapping this request (${conflict.detail})`,
          { skillId, conflictingDecisionId: conflict.decisionId, conflictingVersions: conflict.versions }
        );
      }
    });

    if (result && result.ok === false) return result;
    return Object.freeze({
      ok: true,
      record: result,
      decisionRecord: Object.freeze(structuredClone(decisionRecord)),
      knownBadVersions: Object.freeze([...knownBad])
    });
  }

  // Scans `records` — the exact, already locked+verified snapshot
  // `DurableLedger.append` just read for THIS write, passed in via the
  // `preWriteCheck` hook, never fetched independently here — for any prior
  // REVOKED entry for the SAME `skill_id` whose version coverage OVERLAPS this
  // request. Terminal-forever: a prior all-versions revoke blocks any further
  // revoke; a fresh all-versions revoke conflicts with any prior revoke; and
  // two single-version revokes conflict only if they share a version. Because
  // `records` comes from inside the locked critical section, a tampered ledger
  // still fails closed before this method ever runs (`#verifyRecords` throws
  // first, inherited unchanged).
  #detectAlreadyRevoked(skillId, requestedAll, requestedVersions, records) {
    for (const record of records) {
      const payload = record.entry.payload;
      if (payload.skill_id !== skillId || payload.status !== "REVOKED") continue;
      const priorAll = payload.all_versions === true;
      const priorVersions = Array.isArray(payload.revoked_versions) ? payload.revoked_versions : [];
      const overlaps = requestedAll
        || priorAll
        || requestedVersions.some((version) => priorVersions.includes(version));
      if (overlaps) {
        return {
          decisionId: payload.decision.decision_id,
          versions: priorVersions,
          detail: priorAll ? "all versions" : priorVersions.join(", ")
        };
      }
    }
    return null;
  }

  // Fail-closed read-side lookup: the recorded revocation for a skill_id, or a
  // structured deny. Mirrors the S2 skill-promotion ledger's resolvePublished deny-on-use
  // discipline. Not consumed by any live path in this slice.
  resolveRevoked(skillId) {
    if (!isNonBlankString(skillId)) {
      return deny("DENY_INVALID_SKILL_ID", "skillId must be a non-empty string");
    }
    const match = this.read().find(
      (record) => record.entry.payload.skill_id === skillId && record.entry.payload.status === "REVOKED"
    );
    if (!match) {
      return deny("DENY_UNKNOWN_SKILL", `No revocation recorded for skill: ${skillId}`);
    }
    return Object.freeze({
      ok: true,
      skillId,
      allVersions: match.entry.payload.all_versions === true,
      knownBadVersions: Object.freeze([...match.entry.payload.known_bad_versions]),
      decisionId: match.entry.payload.decision.decision_id,
      sequence: match.sequence
    });
  }
}
