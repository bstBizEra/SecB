# MOD-SKILL S2 — Governed Promotion — Independent Review

**Record ID:** mod-skill-s2-governed-promotion-independent-review-001
**Status:** ADVISORY — NOT EFFECTIVE (no merge/execution authority)
**Reviewer:** REV/SEC role, independent of the producer, no prior relationship to this change
**Date:** 2026-07-21
**Branch reviewed:** `bst/mod-skill-s2-governed-promotion` @ `5172657`
**Base:** `origin/main` @ `ee31db786132fc8ab281a2452fb1899bd271b29c` (verified via `git log`/`git diff` in-repo)
**Producer record reviewed:** `docs/03-project-control/candidates/mod-skill-s2-governed-promotion-producer-verification-001.md`
**Design brief reviewed:** `docs/03-project-control/candidates/mod-skill-gap-assessment-001-addendum-001.md` (read from commit `4576c9c`, since it is absent from this branch's own working tree — it lives on unmerged branch `bst/mod-skill-s2-design-addendum-001`)
**Working copy used:** existing checked-out branch worktree `C:/Users/ounkh/SecB-worktrees/mod-skill-s2-governed-promotion-001` (not modified by this review). All independent probes run from a fresh, from-scratch script imported directly from the branch's own source files via absolute `file://` URLs — not copied from, nor derived from, the producer's committed test file.

## Verdict

**APPROVE_FOR_MERGE**

Both headline claims — the atomic "already PUBLISHED" gate, and full SoD delegation to `approval-binding.mjs` with zero local reimplementation — hold under independent, adversarial verification, not just re-reading the producer's own tests. Test counts (1188/1185/0/3) and `validate-foundation.mjs` PASS were reproduced exactly. No stale-published-state gap, no version-continuity/identity-spoof gap, and no malformed-collaborator-shape gap were found; the version-continuity attack surface the dispatch asked about is currently *structurally absent* (not merely mitigated) because no second promotion of any version can ever succeed while the module has no `revoke()`. One real, already-disclosed scope gap exists (no S1-registry cross-check, and G2 evidence-refs are checked structurally only, not resolved through MOD-EVID) — both are candidate-appropriate for an explicitly UNWIRED slice and do not block merge of this candidate, but must be closed before any future service wires this ledger into a live promotion path. This is a candidate/primitive review, not a production-wiring approval — wiring remains `execution_requires_operator` per the producer's own posture.

---

## 1. Test counts (reproduced independently)

Ran `node --test tests/*.test.mjs` myself in the existing branch worktree (`node_modules` already installed, `npm install` not needed):

```
tests 1188
pass 1185
fail 0
cancelled 0
skipped 3
```

Exact match to the producer's claimed **1188/1185/0/3**. Also ran `node tools/validate-foundation.mjs`: top-level `"status": "PASS"`, exit code 0, zero `"status": "FAIL"` entries in the full check list — confirmed by grepping the JSON output for `FAIL` (zero hits).

## 2. Diff read in full

Read the complete diff against `origin/main @ ee31db7` (`git diff origin/main..HEAD --stat`, 22 files, 1160 insertions / 47 deletions):

- `src/ledger/skill-promotion-ledger.mjs` (new, 361 lines) — read in full.
- `contracts/skill-promotion.schema.json` (new) — read in full; closed schema (`additionalProperties: false`), `risk_class` enum permits `R0`-`R4` at the schema layer (the R3+ floor is a `promote()`-level business rule enforced before this schema is ever validated against, not a schema constraint — confirmed this is intentional layering, not a gap).
- `tests/skill-promotion-ledger.test.mjs` (new, 505 lines, 34 tests across 5 groups) — read in full.
- `src/contracts/contract-validator.mjs`, `tools/validate-foundation.mjs`, `tests/contract-validator.test.mjs`, `MANIFEST.json` — all purely additive registration-map entries following the exact pattern every prior contract/ledger addition used; no behavior change to any existing contract kind.
- The remaining 8 test files with small diffs (`cadence-policy.test.mjs`, `scorecard-assembler.test.mjs`, `overlap-policy.test.mjs`, `kpi-registry.test.mjs`, `event-family-policy.test.mjs`, `replay-assembler.test.mjs`, `conformance-p0-18-candidate.test.mjs`, `conformance-v016-drift.test.mjs`, `p0-19-self-pilot.test.mjs`, `workspace-lease-ledger.test.mjs`) are all pre-existing byte-identity pin repins for `validate-foundation.mjs`/`contract-validator.mjs`'s new blob hash — spot-checked `tests/cadence-policy.test.mjs`'s diff directly; the repinned hash (`ec86c066aef9a77ee4b65eef45dbe6339a9110b6`) matches `git hash-object tools/validate-foundation.mjs` on this branch exactly. Legitimate, disclosed, and consistent with how `mod-wspace-s3-single-writer-toctou-fix-001` handled the same repin pattern previously.

## 3. Atomic-gate claim — independently reproduced, different shape than the producer's own probe

Read `src/ledger/durable-ledger.mjs`'s `append()` in full: `preWriteCheck` receives `structuredClone(records)` from the SAME locked, freshly-`#readRecords()`+`#verifyRecords()`-verified snapshot the write is about to use — there is no code path by which a subclass's `preWriteCheck` can see anything other than this snapshot. `SkillPromotionLedger#detectAlreadyPublished` is invoked exclusively as this hook argument and contains no `this.read()` call anywhere in the file (confirmed by direct read, not just the producer's own grep-based claim).

Ran the producer's own PROBE1-style test (`the already-published gate is atomic with the write...`) — passes. Then wrote and ran a **fresh, independent script** (not copied from `tests/skill-promotion-ledger.test.mjs`) with two additional, differently-shaped probes:

- **Silently-lying `read()` override** (stronger/stealthier than the producer's throw-based override): overrode a second instance's `read()` to return `[]` (a silent false-empty lie) instead of throwing. If `#detectAlreadyPublished` ever fell back to `this.read()` under any code path, this would cause a silent false-ALLOW rather than a loud crash — a materially more dangerous failure mode than a throw. Result: still denied `DENY_ALREADY_PUBLISHED`. The lie had zero effect, confirming the gate never touches `read()` at all, not merely that it doesn't crash when `read()` is broken.
- **Realistic race simulation without any method override**: two real `SkillPromotionLedger` instances over the same file, both calling `promote()` for the same `skill_candidate_id` with different versions and the same stale `expectedSequence: 0` (the literal precondition of two processes that both observed "nothing published yet"). Result: the second caller is rejected by the base class's own optimistic-concurrency check (`DENY_SEQUENCE_CONFLICT`, thrown) before the already-published gate is even reached — a second, independent backstop. Re-running with a corrected sequence still hits `DENY_ALREADY_PUBLISHED`. Exactly one record ever persisted in either case.

**Atomic-gate claim: CONFIRMED**, under adversarial conditions beyond what the producer's own test covers.

## 4. SoD-delegation claim — independently verified

Read `src/control/approval-binding.mjs` in full. `promote()` calls exactly three functions from it (`evaluateApprovalBinding`, `bindApprovalDecision`, `verifyApprovalBinding`) and contains no pairwise-distinctness math, no self-approval comparison, and no role-matching logic of its own — confirmed by direct read of `skill-promotion-ledger.mjs`, not by trusting the header comment.

**Byte-identity recomputed independently** (not trusting the producer's own test or claim): `git diff origin/main..HEAD -- src/control/approval-binding.mjs src/control/sod-rules.mjs src/control/risk-registry.mjs` → empty (0 lines). Additionally ran `sha256sum` on `git show origin/main:<path>` vs `git show HEAD:<path>` for all three files independently:

| file | origin/main sha256 | HEAD sha256 |
|---|---|---|
| `src/control/approval-binding.mjs` | `e73a86ba...b11c10` | `e73a86ba...b11c10` (identical) |
| `src/control/sod-rules.mjs` | `e0670b8d...5ba430428` | `e0670b8d...5ba430428` (identical) |
| `src/control/risk-registry.mjs` | `d972f36d...300bc5e63a6` | `d972f36d...300bc5e63a6` (identical) |

All three byte-identical. Claim confirmed independently, not merely re-run from the producer's own pinned test.

Additional probe not in the producer's suite: fed `evaluateApprovalBinding`-shaped input through `promote()` with a **first-match ordering trap** (two `independent_review` entries — the FIRST being the producer itself/self-approval, the SECOND legitimate) to confirm `promote()` genuinely delegates to the primitive's own `.find()` (first-match) semantics rather than any local re-scan that might resolve differently (e.g. `.filter()`/last-match). Result: denies `DENY_SELF_APPROVAL`, matching a direct call to `evaluateApprovalBinding` with identical arguments exactly.

**SoD-delegation claim: CONFIRMED.**

## 5. Adversarial break attempts (dispatch step 5)

### 5.1 Stale/superseded `resolvePublished()` state

Not reproducible as a live bug: this slice defines no `revoke()` method and no `REVOKED`/superseded status value anywhere (`contracts/skill-promotion.schema.json`'s `status` enum is `["PUBLISHED"]` only) — explicitly, correctly disclosed in the producer record §6 as deferred to a not-yet-built MOD-SKILL S3. `resolvePublished()` denies (`DENY_UNKNOWN_SKILL_CANDIDATE`) for anything not `PUBLISHED`. Probed independently: a denied `promote()` attempt (bad risk class) never causes `resolvePublished()` to report a false-PUBLISHED state — confirmed. **No stale-published-state gap found**, because the state machine that could go stale (PUBLISHED → REVOKED → re-PUBLISHED) does not exist yet in this slice. Flag for S3's own review: once `revoke()` exists, `resolvePublished()` will need to be revisited for exactly this class of bug (this project's MOD-LIVE/MOD-WSPACE/MOD-EVID history strongly suggests it will be scrutinized then).

### 5.2 Version-continuity / identity-spoof gap (MOD-WORK SoD-bypass analog)

**Not found — and structurally cannot occur in this slice.** The cross-version singleton check (`#detectAlreadyPublished`) denies `DENY_ALREADY_PUBLISHED` for **any** second promotion of a `skill_candidate_id` — same version OR a different version — while one version is already `PUBLISHED`, regardless of the approvers' identity. Probed independently with a maximally adversarial second attempt: a completely different, fully SoD-clean approval bundle (different producer, different independent reviewer, different governance approver, different project/work-package/session, different decisionId) attempting to promote `skill.demo.example@2.0.0` after `@1.0.0` was published. Result: still denied `DENY_ALREADY_PUBLISHED`. There is currently no code path by which promoting a second version can succeed at all for the same candidate, so there is no window in which SoD state could be "reset" or an identity field "spoofed" across versions — the entire class of attack the dispatch asked about is foreclosed by the absence of `revoke()`, not by a targeted defense. This is a genuine strength of the current design, but it is also why S3 (which must reopen this door to allow a legitimate re-promotion after revocation) is the slice where this exact question needs to be re-asked from scratch.

### 5.3 S1-registry cross-check gap

**Confirmed gap, but disclosed-by-design, not hidden.** `SkillPromotionLedger.promote()` performs zero cross-check against `src/registry/skill-candidate-registry.mjs` (S1). You can call `promote()` with a `skillCandidateId`/`skillVersion` pair that was never registered, sealed, or evaluated in S1 at all, and it will publish successfully provided the SoD/risk/evidence-structural checks pass. Confirmed by: (a) no import of the S1 registry anywhere in `skill-promotion-ledger.mjs`; (b) the producer's own dedicated test proving no `src/` file references `SkillPromotionLedger` (mutual isolation, both directions); (c) direct read of `skill-candidate-registry.mjs` confirms it exposes no shared identity source `promote()` could even consult. This is the direct, disclosed consequence of the module's own "Stays UNWIRED" charter (producer record §1) — a fully unwired primitive cannot, by definition, cross-check a sibling module it does not import. It is **not itemized by name** in the producer record's §6 "what was NOT built" list (which covers no-live-wiring, no MOD-EVID resolver import, no attempt-level audit, but not this specific cross-check), so I am surfacing it explicitly here as a note for whichever future slice/service wires this ledger up: that service, not this ledger, must own binding `skill_candidate_id@skill_version` to a real S1 record before calling `promote()`, or this ledger will happily durable-log a promotion for a skill that was never actually registered.

### 5.4 Malformed-collaborator-shape gap (MOD-GOV-S3 PDP bug-class analog)

**Not found**, and the bug class does not have a direct analog here. The PDP bug (`bst/mod-gov-s3-pdp-grant-shape-fix-*`) involved validating the SHAPE of an externally-resolvable "grant" object (`grant.roles`/`grant.history` element shapes) coming from an injectable resolver. `skill-promotion-ledger.mjs` has no injectable resolver: `promote()` imports the REAL `evaluateApprovalBinding`/`bindApprovalDecision`/`verifyApprovalBinding` directly (confirmed byte-identical, §4), so there is no swappable/pluggable collaborator whose output shape could be spoofed independently of the primitive's own well-tested logic. Both `if (!evaluation.ok)` and `if (!verification.ok)` are deny-by-default (a missing/malformed `.ok` field denies via `!undefined === true`, not a silent pass). Probed independently:
- A getter-trap on an approval entry's `actor_id` (a TOCTOU-via-getter shape): `snapshotRequest()`'s `structuredClone` invokes the getter **exactly once** (confirmed by invocation counter, not just "no crash"), proving every downstream consumer (`approvalWellFormed`, the pairwise-distinct check, `promotionPayload` construction) operates on one frozen snapshot, not a live re-invokable trap.
- Fed `verifyApprovalBinding` a hand-crafted fake "resolved decision" object missing `evidence_refs` entirely, and a second with `evidence_refs` as a non-array string — both denied cleanly, no throw, no silent pass.

**No malformed-collaborator-shape gap found.**

## 6. Disclosed-but-worth-restating scope gap: G2 evidence-refs

The design addendum (§5) recommended evaluation-evidence binding resolve through MOD-EVID's `register → seal → verify → accept → resolve` chain before a promotion decision is minted. The built slice checks `evidenceRefs` **structurally only** (non-empty array of non-blank strings) — a caller can supply any arbitrary string and it will be accepted. This is honestly and explicitly disclosed in the producer record §6 ("No MOD-EVID resolver import... explicitly deferred") as intentional scope discipline consistent with the UNWIRED charter (importing a resolver would itself be a wiring act). Noting it here per the dispatch's instruction to actively look for gaps, not because it is undisclosed — it is a real functional limitation a future consumer must not overlook, but it does not block this candidate's merge.

## 7. Hardcoded test-ID branching

`git grep -nE "dec_skill_promotion_[0-9]|skill\.demo\." -- src/` → zero hits. `git grep -nE "(decisionId|idempotencyKey|skillCandidateId|skillVersion)\s*===\s*['\"]" -- src/` → zero hits. No literal test-fixture value is ever branched on in `src/`. Confirmed independently, matching the producer's own claim and dedicated regression test.

## 8. Minor, non-blocking observations

- `promote()` maps an *unknown* `riskClass` (e.g. `"R9"`) to the same `DENY_RISK_CLASS_BELOW_FLOOR` code as a known-but-too-low class (R0/R1/R2), rather than a distinct "unknown risk class" code. This is intentional (single fail-closed terminal state) and tested, but slightly imprecise for a caller trying to distinguish "you asked for a class that doesn't exist" from "your class exists but isn't R3+." Cosmetic only; both outcomes correctly deny.
- The exact-action/exact-object-version replay protection (`boundObjectVersion`) is minted and verified within the same `promote()` call using the same freshly-computed inputs; its full value (preventing replay of a decision record minted for a *different* call, persisted and later reused) will only be exercised once a real `DecisionLedger`-backed consumer persists and re-resolves these decision records, per `approval-binding.mjs`'s own documented design ("the caller appends it"). Not a bug in this slice — `promote()` does not yet have any external caller — but worth flagging so a future integration doesn't assume replay protection is already end-to-end proven merely because this primitive exists.

## 9. Self-certification

```yaml
self_certification:
  agent_id: claude-rev-sec-mod-skill-s2
  peer_agent_id: claude-motor
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

## 10. Advisory fields

```yaml
truth_status: verified_true          # atomic-gate and SoD-delegation claims independently reproduced by fresh adversarial script, not re-run of producer's own tests
authority_status: advisory_only      # REV/SEC worker role; no merge/execution authority; operator queue not bypassed
implementation_status: partial       # matches producer's own characterization: G1 closed (S1), G2/G3 candidate-closed by this slice (G2 structural-only), G4/G5 (harness-compat, S3 revocation) remain open
risk_class: high                     # promotion is R3+ per risk-registry; unwired candidate only, not yet operator-ratified
```

## Verdict (repeated for clarity)

**APPROVE_FOR_MERGE.** All independently-checked claims held. The two areas flagged (S1-registry cross-check absence, structural-only G2 evidence-refs) are both already disclosed as intentional UNWIRED-charter scope limits, not hidden defects, and are appropriately deferred to whichever future slice performs live wiring — they should be carried forward as explicit open items in that slice's own design brief rather than assumed solved by this candidate's existence.
