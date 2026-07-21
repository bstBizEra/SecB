# MOD-WORK — SoD Version-Spoof Fix: Independent Review

**Record ID:** mod-work-sod-version-spoof-fix-independent-review-001
**Status:** ADVISORY — independent review, not effective (isolated worktree only, not pushed, not merged)
**Reviewer:** claude-immune (BST-SA Immune role: security, governance, risk, policy enforcement)
**Reviewer relationship to producer:** independent — no shared worktree or branch state with the producer (`claude-motor`). Reviewed in a fresh, separately-created detached-HEAD worktree (`C:/laragon/www/SecB-immune-review-001`) checked out at the exact commit under review.
**Date:** 2026-07-21
**Reviewed branch/commit:** `bst/mod-work-sod-version-spoof-fix-001` @ `e880edb`
**Base:** `origin/main` @ `385ac65943f2a5b158c8ec20a5fd947f06cd2987` (confirmed via `git merge-base`)
**Reviewed record:** `docs/03-project-control/candidates/mod-work-sod-version-spoof-fix-producer-verification-001.md`

---

## Summary verdict

**APPROVE_WITH_NOTES**

The fix genuinely closes the reproduced SoD bypass. The exact three-step exploit chain was independently re-derived from source (not copied from the producer's committed tests) and run fresh in an isolated worktree against both the pre-fix and post-fix module: pre-fix, the chain succeeds end-to-end (`retireGoal` returns `{ok:true, status:"RETIRED"}` after the spoofing re-version); post-fix, it is denied at the spoofing step with `DENY_PRODUCER_IMMUTABLE` and the retry still returns `DENY_SELF_APPROVAL`. All of the producer's quantitative claims (test counts, scope, disclosed exceptions) check out under independent re-execution, with one immaterial discrepancy noted below. Two things are worth recording as notes for the mandatory follow-up design record, not as blockers to this merge.

---

## 1. Independent exploit reproduction (fresh script, not the producer's test file)

Built directly from reading `src/services/goal-graph-service.mjs` and `contracts/goal.schema.json` (not from the producer's committed `tests/goal-graph-service.test.mjs`), then run against two separate isolated worktrees:

- `C:/laragon/www/SecB-immune-review-prefix` — detached HEAD @ `385ac65` (pre-fix)
- `C:/laragon/www/SecB-immune-review-001` — detached HEAD @ `e880edb` (post-fix, this branch)

**Pre-fix, exact output observed:**
```
retire before spoof: {"ok":false,"deny_code":"DENY_SELF_APPROVAL", ...}
spoof v2:            {"ok":true,"goal_id":"g_ob","version":2, ...}
retire after spoof:  {"ok":true,"goal_id":"g_ob","version":2,"status":"RETIRED"}
```
The bypass is real and reproduces cleanly against the live pre-fix module with no external wiring, confirming the producer's own pre-fix reproduction independently.

**Post-fix, same script, same sequence:**
```
step1 (retire before spoof): DENY_SELF_APPROVAL
step2 (spoofing re-version):  DENY_PRODUCER_IMMUTABLE, no state change (still v1, still owner-real)
step3 (retire retried):       DENY_SELF_APPROVAL (unchanged)
```
The exploit chain is genuinely closed, confirmed under independent re-derivation, not just re-running the producer's own committed test.

---

## 2. Adversarial probes ("try to break it")

### 2a. First-registration identity gap — CONFIRMED PRESENT, correctly out of scope
There is no identity verification anywhere in this codebase on the very first registration of a `goal_id`. A caller can register version 1 of a brand-new `goal_id` claiming to be `victim-ceo`'s `provenance.agent_id` with zero verification that the caller is who they claim. This fix only pins identity **after** a first version exists; it cannot and does not protect first registration, because (confirmed by grep across `capability-registry-service.mjs`, `approval-binding.mjs`, `state-machine.mjs`) **no service in this codebase has an authenticated-caller model at all** — every actor identity everywhere is a self-declared string. This matches the producer's own disclosure verbatim and is correctly scoped out of a bounded security patch.

### 2b. Version-ordering / "first version" precision — a real nuance, not a reopened bypass
`#resolveGoalId` (line 216) is explicitly documented in its own comment as returning the **highest registered version** for a `goal_id`, by numeric comparison (`entry.version > best.version`), not literally "the first-ever-registered version" as the fix's header comment and the producer's doc phrase it. In practice these coincide **only if version numbers are assigned sequentially starting at 1** — nothing in `registerGoal` enforces that. I confirmed by direct test: an attacker can register `goal_id: "g_target", version: 999` as the very **first** call touching that `goal_id` (before the real owner ever registers anything), becoming permanently pinned as producer. When the real owner subsequently tries to register their actual first version (`version: 1`) for the same `goal_id`, it is denied `DENY_PRODUCER_IMMUTABLE` — the true owner is locked out of their own `goal_id`.

This is **not** a way to reopen the specific bypass this fix targets — it cannot be used to overwrite an *already-established* producer (I separately confirmed a lower version number inserted after a higher one still resolves correctly against the existing highest entry, so there is no route back to flipping a pinned producer once set). It is a front-running/lockout variant of the **same** disclosed "no caller-identity model" gap (2a), just from a different angle (denial-of-service / identity squatting on not-yet-created `goal_id`s, rather than spoofing to defeat an existing gate). Recommend the fix's header comment and the follow-up design record be corrected/extended to say "first **call** to touch the goal_id, regardless of version number" rather than "first version," so a future reader doesn't assume version-number ordering is enforced.

### 2c. Same-producer re-parenting gap — CONFIRMED still open, producer's reasoning holds
Reproduced directly: a caller supplying the goal's true, existing `provenance.agent_id` string can freely re-parent (`parent_goal_id`) or re-level a goal it does not actually control, since that string is never authenticated. This is exactly the residual gap the producer disclosed and deferred. I could not find a cheaper partial mitigation the producer missed: pinning `parent_goal_id`/`level` in addition to producer identity would break the explicitly-required legitimate lifecycle case (re-parenting/re-leveling during normal editing), and any authorization gate narrower than a full caller-identity model (e.g., requiring a second approval specifically for re-parenting) is itself a non-trivial new design surface, not a "cheap" fix — so the producer's stated reasoning (closing this needs an authenticated-caller/authorization model that doesn't exist in this codebase yet) checks out as accurate rather than a rationalization.

### 2d. Other SoD-relevant call sites — CONFIRMED no other consumer of GoalGraphService's `producerActorId`
Grepped the full `producerActorId` surface repo-wide. `GoalGraphService`'s own `producerActorId` field is consumed **only** by its own local `evaluateForceRetireApprovals` inside `retireGoal` — there is no shared import. `src/control/approval-binding.mjs` contains an explicit, detailed header comment confirming it deliberately does **not** share code with `goal-graph-service.mjs` (byte-identical logic in places, but no import relationship) and implements exact-action/version replay binding, an unrelated mechanism. `src/control/state-machine.mjs`'s `producerActorId` fields belong to the entirely separate `WorkPackage`/`Project` state-machine transition object, not `GoalGraphService`. `src/ui/goal-rollup-projection.mjs` reads goal id/level/status/parent for display rollup only and never touches `producerActorId`. `capability-registry-service.mjs` has its own independent, unrelated producer field (`source_identity.maintainer`) with no cross-version continuity check of its own — out of scope, correctly not touched by this fix, and not a target this fix claims to protect. **No other authority/approval decision anywhere in the codebase reads `GoalGraphService`'s `producerActorId`; the fix's protection scope (`retireGoal` only) is the complete scope of what needed protecting.**

### 2e. Legitimate lifecycle case — CONFIRMED unaffected
Independently exercised and confirmed via the full suite run (below) plus direct inspection: a re-version that changes only content/title/status/hierarchy while keeping `provenance.agent_id` identical succeeds exactly as before. No new false denials.

---

## 3. Full test suite — independently re-executed, fresh `npm ci`

Ran in the isolated post-fix worktree (`C:/laragon/www/SecB-immune-review-001`), after its own `npm ci`:

```
npm test  ->  tests 1104 | pass 1099 | fail 0 | skipped 5
```
Matches the producer's claimed post-fix count exactly.

Module suite run directly (`node --test tests/goal-graph-service.test.mjs tests/goal-rollup-projection.test.mjs`):
```
tests 40 | pass 40 | fail 0 | skipped 0
```
Matches the producer's claimed post-fix module count exactly.

`node tools/validate-foundation.mjs`: **exit 0, 0 FAIL**, confirming the producer's "0 FAIL" claim. One immaterial discrepancy: I independently counted **736** checks in the JSON output, not the claimed 737. Both before and after the fix report 0 FAIL either way; this is a one-check-count difference, not a correctness issue, and does not affect the disposition of this review. Noting it for completeness only.

---

## 4. Hardcoded test-ID branching

Grepped `src/services/goal-graph-service.mjs` and `src/ui/goal-rollup-projection.mjs` for `NODE_ENV`, `test-only`, `test-id`, `process.env`, and string-literal identity special-casing. **None found**, independently confirming the producer's claim. The `DENY_PRODUCER_IMMUTABLE` branch is a universal `producerActorId` equality comparison with no fixture-specific carve-out.

---

## 5. Diff scope re-verification

`git diff 385ac65 HEAD --stat` independently confirms exactly the files the producer disclosed: `goal-graph-service.mjs` (+44, additive-only, no existing line's behavior altered outside the new block), `tests/goal-graph-service.test.mjs` (+100), `tests/goal-rollup-projection.test.mjs` (+33), `tests/approval-binding.test.mjs` (F4 protected-list update, +46/-6, with a new disclosed-divergence test added), plus the two docs files. No undisclosed file was touched.

---

## Disposition of findings

| # | Finding | Status |
|---|---|---|
| 1 | Exact 3-step exploit chain closed | Confirmed under independent fresh reproduction (both pre-fix vulnerable and post-fix denied) |
| 2 | First-registration identity gap | Confirmed present; correctly disclosed and out of scope (no auth model anywhere in codebase) |
| 3 | Version-ordering "first version" precision | New note: actual pinning is "first call regardless of version number," not literally version=1; a front-running/lockout variant of the same disclosed gap, not a reopened bypass; recommend wording fix in comments/follow-up record |
| 4 | Same-producer re-parenting gap | Confirmed genuinely still open; producer's deferral reasoning independently verified accurate |
| 5 | Other SoD call sites | Confirmed `retireGoal` is the only consumer of GoalGraphService's `producerActorId`; no gap |
| 6 | Legitimate lifecycle case | Confirmed unaffected |
| 7 | Test counts | 1104/1099/0/5 (full) and 40/40/0/0 (module) independently reproduced exactly |
| 8 | validate-foundation | exit 0, 0 FAIL confirmed; check-count off by one (736 vs claimed 737), immaterial |
| 9 | Hardcoded test-ID branching | None found, confirmed |

## Recommendation

**APPROVE_WITH_NOTES.** Merge is not blocked. Two notes should carry forward into the producer's own recommended follow-up design/gap-assessment record before `GoalGraphService` is adopted as a live authority surface:
1. Correct "first-ever-registered version" language (in both the source header comment and the producer-verification record) to "first call to register the goal_id, independent of the version number supplied" — the current phrasing overstates the guarantee's precision.
2. Add the front-running/identity-squatting angle (2b above) as an explicitly named risk facet alongside the already-disclosed first-registration and re-parenting gaps, since it is a distinct failure mode (lockout of the true owner) even though it shares the same root cause (no authenticated-caller model).

Neither note requires source changes to this branch; both are documentation/scope-record precision items for the already-planned follow-up.

## Status fields

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: existing
risk_class: high
self_certification:
  agent_id: claude-immune
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

## Provenance

Source — independent review performed in isolated worktrees `C:/laragon/www/SecB-immune-review-001` (post-fix, detached HEAD @ `e880edb`) and `C:/laragon/www/SecB-immune-review-prefix` (pre-fix, detached HEAD @ `385ac65`), separate from the producer's own worktree (`C:/laragon/www/SecB-mod-work-sod-fix`). Timestamp — 2026-07-21. Agent ID — claude-immune (BST-SA Immune, worker/advisory role only; no execution or approval authority; this record does not authorize merge, push, or production declaration).
