# MOD-KNOW S3 — Currency-Path Malformed-Claim Guard Fix — Producer Verification 001

**Record ID:** mod-know-s3-currency-guard-fix-producer-verification-001
**Status:** DRAFT / ADVISORY — NOT EFFECTIVE
**Producer identity:** BST-SA MOTOR worker agent, this session (`claude-motor`)
**Worktree:** `C:/Users/ounkh/SecB-worktrees/bst-mod-know-s3-currency-guard-fix-001`, branch `bst/mod-know-s3-currency-guard-fix-001`, cut from `origin/main @ ec5aa76` (same tip the second independent review verified against — `git rev-parse origin/main` matched `ec5aa76` before branching).
**Governance frame:** advisory/implementation-only, worker role (BST-SA MOTOR), under `SECB-AGENTS-AMD-002` rev 2's standing advise-and-proceed authority for bounded slices under `src/**`/`tests/**`/`docs/**`. This record authorizes nothing beyond implementation of the already-recommended fix; ratification remains an operator merge-review decision. No merge to `main`, no push, no PR opened.

## Finding under fix

**Finding 3 (LOW, new)**, `docs/03-project-control/candidates/mod-know-s3-second-independent-review-001.md` (ref `refs/review/mod-know-s3-second-independent-review-001` @ `2356572`, reviewer `claude-rev-sec-modknow-s3-second-01`, verdict `APPROVE_WITH_NOTES`):

> `resolveClaim` (S1 read path) explicitly validates `isPlainObject(resolution) && resolution.decision === "ALLOW" && isPlainObject(resolution.claim)` before treating a result as usable. `resolveCurrency` (S2 read path) does NOT perform the analogous check: it validates `isPlainObject(currency) && currency.decision === "ALLOW"` and, if `currency.current_claim_id === ref`, returns `{ claim: currency.claim, ... }` without ever checking `isPlainObject(currency.claim)`. `projectEntry` then dereferences claim fields unconditionally. Reproduced with a fake `linkageService` returning `{decision:"ALLOW", current_claim_id: ref, claim: undefined}` — the provider threw an uncaught `TypeError` and crashed the ENTIRE BATCH, violating the module's own documented "never throws per-ref" invariant. Not reachable via the real, ratified S1+S2 stack today (S2 always returns a well-formed claim on ALLOW), so latent, not a live exploit — a real robustness gap, non-blocking, recorded as a note for the next touch of the file. **Recommendation (advisory):** add the same `isPlainObject(currency.claim)` guard to `resolveCurrency`'s ALLOW branch that `resolveClaim` already has, denying `KNOWLEDGE_UNRESOLVED` / a new `DENY_LINKAGE_MALFORMED_CLAIM` code instead of falling through to `projectEntry`. A regression test with a fake linkage service returning a malformed-but-ALLOW claim should accompany the fix.

Re-read `src/services/knowledge-candidate-provider.mjs` in full (285 lines) before making any change, confirming the existing `resolveClaim` guard (line 165: `!isPlainObject(resolution) || resolution.decision !== "ALLOW" || !isPlainObject(resolution.claim)`) and the sibling `resolveCurrency` gap (line 183 lacked the analogous `isPlainObject(currency.claim)` term). Also re-read the real S2 (`src/services/knowledge-linkage-service.mjs`, `resolveCurrent`) to confirm that on the real, ratified stack the ALLOW response always carries `claim: structuredClone(winner.claim)` regardless of whether the ref is itself current or superseded — confirming the gap is genuinely latent, not reachable via the shipped stack, and that gating the new check on the actually-used claim (after the `current_claim_id` check) rather than before it does not risk denying a legitimate `CURRENT_SUPERSEDED` outcome.

## Root cause

`resolveCurrency` (`src/services/knowledge-candidate-provider.mjs`, previously lines 176-203) validated the collaborator's DENY shape (`isPlainObject(currency) && currency.decision === "ALLOW"`) and the supersession shape (`current_claim_id !== ref`), but never validated the shape of `currency.claim` itself before returning it for projection. `resolveClaim`, five lines above in the same file, validates the analogous S1 field (`resolution.claim`) as part of its single combined guard. The asymmetry meant a linkage-service response that is well-formed everywhere except the actual claim payload passed both existing checks and reached `projectEntry`, which unconditionally dereferences `claim.project_id`, `claim.classification`, `claim.truth_status`, and `claim.content_hash` — throwing a `TypeError` that propagated out of the `for` loop in `toCandidateSources` and aborted processing of every remaining ref in the batch, not just the malformed one.

## Fix

Mirrors the existing sibling guard exactly — same helper (`isPlainObject`), same exclusion reason (`KNOWLEDGE_UNRESOLVED`, the reason `resolveClaim` already uses for an unusable ALLOW payload), same "typed deny record instead of a throw" shape. No new pattern introduced.

In `resolveCurrency`, immediately after the existing `current_claim_id !== ref` (`CURRENT_SUPERSEDED`) check and before the final `return { claim: currency.claim, ... }`, added:

```js
if (!isPlainObject(currency.claim)) {
  return {
    failed: exclude(
      ref,
      "KNOWLEDGE_UNRESOLVED",
      "DENY_LINKAGE_MALFORMED_CLAIM",
      "Currency walk returned ALLOW with a malformed claim"
    )
  };
}
```

Placement note: the check is placed after the `CURRENT_SUPERSEDED` check rather than folded into the initial `isPlainObject(currency) && currency.decision === "ALLOW"` condition, because the real S2 (`resolveCurrent`) always includes `claim: structuredClone(winner.claim)` in its ALLOW response regardless of supersession status, but that field is only ever *used* (passed to `projectEntry`) once the ref is confirmed to be its own current head. Placing the guard at the point of actual use avoids any risk of a legitimate `CURRENT_SUPERSEDED` exclusion being reclassified by a claim-shape check that doesn't matter for that path. This does not change the guard's effect for the finding's own scenario (`current_claim_id === ref`, `claim: undefined`), which is denied identically either way.

Only `src/services/knowledge-candidate-provider.mjs` was touched (+10 lines); no other source file changed; no export signature changed; `EXCLUSION_REASONS`, `KNOWLEDGE_PROVIDER_EXCLUSION_REASONS`, and the closed exclusion-reason vocabulary are unchanged (the new failure folds into the existing `KNOWLEDGE_UNRESOLVED` class, exactly as `resolveClaim`'s guard does for its own malformed-claim case — no new exclusion *reason* was needed, only a new passthrough `code` value, `DENY_LINKAGE_MALFORMED_CLAIM`, analogous to `resolveClaim`'s own internally-generated `DENY_CLAIM_UNRESOLVED`).

## Regression test

Added to `tests/knowledge-candidate-provider.test.mjs`: **"S3 resolveCurrency denies a malformed ALLOW claim per-ref instead of crashing the batch"**. Reproduces the reviewer's exact probe — a hand-built fake `linkageService.resolveCurrent` returning `{decision: "ALLOW", code: "CURRENT_RESOLVED", current_claim_id: ref, contradictions: [], claim: undefined}` for one ref (`kc_bad`) in a batch alongside a second, well-formed ref (`kc_ok`) that resolves normally through both fakes. Assertions:

- `assert.doesNotThrow(...)` around the `toCandidateSources` call itself — the batch must not crash.
- `accounting` is `{ requested: 2, included: 1, excluded: 1 }` — the invariant holds across the mixed batch.
- The `kc_bad` exclusion carries `reason: "KNOWLEDGE_UNRESOLVED"`, `code: "DENY_LINKAGE_MALFORMED_CLAIM"` — a typed, per-ref deny, not a silent drop.
- `kc_ok` is still `sources[0]` with the correct `id`/`project_id` — the other well-formed ref in the same batch resolves correctly, unaffected by its neighbor's malformed data. This is the isolation property the finding calls out as the actual point of the fix (a per-ref deny is strictly better than a batch-wide crash even before considering this specific reachability question).

## Verification

**Baseline (this producer, independently reproduced before any edit — `git stash` to the pre-fix tree, both files):**
- `node tools/validate-foundation.mjs` → `"status": "PASS"`.
- `npm test` (full suite) → **tests 1115 / pass 1113 / fail 0 / skipped 2**, matching the second-review record's own independently-run baseline (`1115` total / `73/73` module) exactly, at the same commit (`ec5aa76`).
- `node --test tests/knowledge-claim-service.test.mjs tests/knowledge-linkage-service.test.mjs tests/knowledge-candidate-provider.test.mjs` → **73/73 pass**.

**After fix (`git stash pop` to restore the fix + test):**
- `node tools/validate-foundation.mjs` → `"status": "PASS"` (unchanged).
- `npm test` (full suite) → **tests 1116 / pass 1114 / fail 0 / skipped 2** (+1 new test, 0 regressions, same 2 pre-existing skips).
- `node --test tests/knowledge-claim-service.test.mjs tests/knowledge-linkage-service.test.mjs tests/knowledge-candidate-provider.test.mjs` → **74/74 pass** (73 pre-existing + 1 new regression test, all passing, confirmed by name: `✔ S3 resolveCurrency denies a malformed ALLOW claim per-ref instead of crashing the batch`).
- `grep -nE "test[_-]?id|===\s*['\"](kc_|test_|TEST_)|if.*claim_id\s*===" src/services/knowledge-*.mjs` → no matches; no hardcoded test-ID branching introduced or pre-existing.
- The pre-existing byte-identity guard test (pinning other files this suite reads against `main @ 71b9d41`) still passes unchanged — this fix touches only `src/services/knowledge-candidate-provider.mjs` and `tests/knowledge-candidate-provider.test.mjs`, neither in that pinned set.

**Reviewer's exact scenario, confirmed closed:**

| Scenario | Before (per finding) | After (measured this producer) |
|---|---|---|
| Fake `linkageService` returns `{decision:"ALLOW", current_claim_id: ref, claim: undefined}` for one ref in a batch alongside other well-formed refs | Uncaught `TypeError: Cannot read properties of undefined (reading 'classification')`; crashes the ENTIRE batch (both the malformed ref and its well-formed neighbor lost) | `toCandidateSources` returns cleanly (`decision: "ALLOW"`); malformed ref denied per-ref as `{reason: "KNOWLEDGE_UNRESOLVED", code: "DENY_LINKAGE_MALFORMED_CLAIM"}`; the well-formed neighbor still resolves and appears in `sources[]` with its correct fields; accounting invariant (`included+excluded===refs.length`) holds |

## Behavior preservation

- Every previously-passing path through `resolveCurrency` (ALLOW with a well-formed claim, DENY_BROKEN_LINEAGE, any other DENY code, CURRENT_SUPERSEDED, a throwing `resolveCurrent`) is byte-identical to before — confirmed by all pre-existing exclusion-class and accounting/determinism tests passing unmodified.
- No change to `resolveClaim`, `projectEntry`, `validateQuery`, `exclude`, the closed `EXCLUSION_REASONS` vocabulary, or any exported symbol.
- Still a pure, unwired mapper (`git grep -n "knowledge-candidate-provider" -- '*.mjs'` outside `src/services/` and `tests/` shows nothing new); no live wiring introduced.
- Only two files changed: `src/services/knowledge-candidate-provider.mjs` (+10 lines) and `tests/knowledge-candidate-provider.test.mjs` (+44 lines). No file added, renamed, or deleted — `MANIFEST.json` requires no update under AMD-002 rule 2 (in-place edits only).

## Advisory status fields

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: existing
risk_class: low   # latent-only gap on the real stack; fix is narrow, behavior-preserving, and closes a real fail-closed/robustness invariant
```

```yaml
self_certification:
  agent_id: claude-motor
  peer_agent_id: claude-rev-sec-modknow-s3-second-01
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

## Recommendation

Finding 3 (LOW) of `mod-know-s3-second-independent-review-001` is closed. Recommend this branch (`bst/mod-know-s3-currency-guard-fix-001`, local commit only, not pushed, no PR opened) be staged for operator merge review, per the same fix-then-ratify pattern used for MOD-LIVE S1's N1 TOCTOU finding and MOD-LIVE S3's F1 resource-exhaustion finding. No further producer action is proposed beyond this record and the tracker iteration-log append.

> Recommend improvements only. Do not execute them. This record neither merges nor authorizes merge; it certifies advisory/implementation completeness only. Integration, PR staging, and ratification remain operator decisions.
