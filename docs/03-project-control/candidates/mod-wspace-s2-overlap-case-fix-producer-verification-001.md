# MOD-WSPACE S2 — Overlap Case-Sensitivity Fast-Follow Producer Self-Verification Record

**Record ID:** mod-wspace-s2-overlap-case-fix-producer-verification-001
**Status:** DRAFT / ADVISORY — NOT EFFECTIVE (local commit only, not pushed, not merged)
**Producer:** claude-motor (BST-SA Motor agent), operating under `AGENTS.md` SECB-AGENTS-AMD-002 (rev 2) advise-and-proceed authority
**Date:** 2026-07-22
**Branch:** `bst/mod-wspace-s2-overlap-case-fix-001`
**Base:** `origin/main` @ `a67169b149f0887090e15cd7124681e58858010d` (fetched and pinned at task start; `origin/main` has since advanced two further commits — `b1aec70`, `f75b707`, both docs/tracker-only, not touching `src/control/`, verified via `git log --oneline a67169b..origin/main`. Not rebased onto them: this fix is a bounded, isolated correction with no textual overlap, and rebasing was out of scope for this task.)
**Worktree:** `C:/laragon/www/secb-wt-overlap-case-fix` (isolated, new, `git worktree add --detach origin/main` then branched)
**Target file:** `src/control/overlap-policy.mjs` (`within`/`pathsOverlap`, plus the doubly-malformed deny-code path in `evaluateOverlapInternal`)
**Companion tests:** `tests/overlap-policy.test.mjs` (6 new regression tests appended)
**write-set-policy.mjs:** untouched — byte-identity guard test (`byte-identity: reused/consulted sources are unchanged vs main @ c52db71`) still passes.

**Cited finding:** F-1 (High) and F-2 (Low/Informational), from the second independent
review record `docs/03-project-control/candidates/mod-wspace-s2-overlap-policy-second-independent-review-001.md`
(ref `refs/reviews/mod-wspace-s2-overlap-policy-second-independent-review-001` @ commit
`5b9acb8`; that record's own review target was `src/control/overlap-policy.mjs` @
`origin/main` `a67169b`, already merged; prior first review `mod-wspace-s2-overlap-rev-001`
verdict `APPROVE_FOR_MERGE`).

---

## Root cause (F-1, confirmed)

`overlap-policy.mjs`'s `pathsOverlap`/`within` derived file-level overlap entirely by
calling `evaluateWriteSet({ candidatePaths: [path], allowedPaths: [bound], prohibitedPaths: [] })`
— i.e. it always routed through write-set-policy's **allowed-containment** branch
(`withinBound`, exact string match, no case-folding, `write-set-policy.mjs:262-266`).
`write-set-policy.mjs` *does* have a case-folding defense (`caseFoldedProhibited`,
`write-set-policy.mjs:256-260`), but that defense lives exclusively in the
**prohibited-path** branch — built for a different threat model (defeating a bypass of a
declared prohibited prefix via case). `overlap-policy.mjs` never invoked that branch
(it always passed `prohibitedPaths: []`), so its S2 reuse silently inherited the wrong
(case-sensitive) branch.

Confirmed by direct reproduction of the reviewer's exact probe, before any change, in
this worktree:

```
evaluateOverlap({writeSetA:["src/Foo.js"], writeSetB:["src/foo.js"], sameModule:false, sameSymbol:false, protectedBranch:false, globalConfig:false})
-> { ok: true, overlapClass: "O0", control: "Parallel", overlap: "Separate modules/files" }
```

**Confirmed real (not hypothetical) blast radius:** `src/control/integration-collision-forecast.mjs`
on the staged, not-yet-merged branch `bst/mod-integ-queue-s2-collision-forecast` (PR #84)
was fetched and read directly (`origin/bst/mod-integ-queue-s2-collision-forecast`).
Confirmed line-for-line: `forecastCollision()` calls `evaluateOverlap` with the raw
`candidateWriteSet` / each queued entry's raw `declared_write_set`, zero normalization,
and always passes `sameModule: false, sameSymbol: false, protectedBranch: false,
globalConfig: false` — meaning the case-sensitive file-overlap comparison this fix
addresses is, today, the **entire and only classification axis** that consumer exercises.
Also confirmed `tests/integration-collision-forecast.test.mjs` on that branch has zero
case-sensitivity assertions (`grep -in case` → no matches).

## Fix

Reused the **existing** case-folded comparison from `write-set-policy.mjs`'s prohibited
branch — did not reinvent case-folding logic, and did not modify `write-set-policy.mjs`
(which remains byte-pinned per its own byte-identity guard test). In `overlap-policy.mjs`:

```js
const withinCaseFold = (path, bound) =>
  evaluateWriteSet({ candidatePaths: [path], allowedPaths: [], prohibitedPaths: [bound] }).code ===
  "DENY_WRITE_SET_PROHIBITED";

const within = (path, bound) =>
  evaluateWriteSet({ candidatePaths: [path], allowedPaths: [bound], prohibitedPaths: [] }).ok ||
  withinCaseFold(path, bound);
```

`within(path, bound)` first tries the original exact-match allowed-containment check
(unchanged, so every existing passing case keeps passing via the same path). If that
misses, it falls back to asking write-set-policy's prohibited branch whether `path` is
within `bound` **case-insensitively** (that branch already computes
`caseFoldedProhibited` and checks `withinBound(p.toLowerCase(), caseFoldedProhibited)`);
a `DENY_WRITE_SET_PROHIBITED` result from that probe means "yes, within bound, modulo
case" — repurposed as a pure containment signal, not as an actual prohibition. Every
other outcome (`OUTSIDE_ALLOWED`, or any grammar denial) means "not within." Grammar
validity of both paths was already established by `validateWriteSet` before
`pathsOverlap`/`within` is ever called in `evaluateOverlapInternal`, so the fallback
only needs to resolve containment, not re-litigate malformed input.

This matches the repo's own established filesystem-case-insensitivity convention (this
repo's host OS, Windows, and default macOS/APFS are both case-insensitive or
case-preserving-but-insensitive) and is exactly the fast-follow the reviewer suggested:
"fold canonical case-normalization... into `pathsOverlap`... matching write-set-policy's
own prohibited-branch precedent."

## Fix (F-2, disclosed lower-priority item — addressed, cheap)

`evaluateOverlap(A,B)` vs `(B,A)` could return a different `code` (never a different
verdict — confirmed never flips `ok:false` to `ok:true`) when both write sets were
independently malformed in different ways, because `validateWriteSet` checked whichever
set landed in the "A" slot first and returned immediately. Fixed by computing both
`denyA` and `denyB` before returning, and — only when **both** are non-null — picking a
fixed, argument-order-independent precedence (`DENY_OVERLAP_MALFORMED` outranks
`DENY_OVERLAP_EMPTY`, since a grammar violation is the more structurally severe defect)
instead of "whichever slot is A." Single-side-malformed behavior is unchanged.

## Verification

### Pre-fix reproduction (confirmed present before any change)
- Reviewer's exact scenario reproduced via a one-off `node -e` probe against the
  pre-fix module: `src/Foo.js` vs `src/foo.js` → `O0`/"Parallel" (bug present).

### Post-fix reproduction (same probes, re-run against the fixed module)
- `src/Foo.js` vs `src/foo.js` (both directions) → `O2`/"Reservation and conflict
  forecast". **Closed.**
- Case-folding also verified on the ancestor/descendant path (`src/Shared` vs
  `src/shared/nested/deep.mjs`) → `O2`. **Closed for the general case, not just the
  literal repro string.**
- No-regression checks: `src/foo` vs `src/foobar` (classic prefix-confusion boundary)
  stays `O0` even with a case variant (`src/Foo` vs `src/foobar`); two genuinely
  disjoint, differently-cased files (`src/Alpha.mjs` vs `src/Beta.mjs`) stay `O0`.
- F-2: `evaluateOverlap({writeSetA:[], writeSetB:["../etc/passwd"], ...})` and the
  argument-swapped call both now return `DENY_OVERLAP_MALFORMED` (previously `EMPTY`
  vs `MALFORMED` depending on order). **Closed.**

### Committed regression tests (permanent, in `tests/overlap-policy.test.mjs`)
Six new tests added, immediately after the existing O2 rows:
- `F-1 regression: same file, differing case -> O2 (real collision), NOT O0` — the
  reviewer's exact scenario.
- `F-1 regression: case-fold applies symmetrically regardless of argument order`
- `F-1 regression: case-fold applies to ancestor/descendant paths too`
- `F-1 no-regression: prefix-confusion boundary stays NOT-overlap even under case
  folding`
- `F-1 no-regression: disjoint case-varying paths remain O0`
- `F-2 regression: doubly-malformed input yields the same deny code regardless of
  argument order`

Also added a clarifying note to the existing "reuse parity" oracle test explaining that
the independent oracle (`referencePathSubset`/`referenceOverlap`) is intentionally left
case-sensitive (it mirrors context-federation's `pathSubset` verbatim) and is not a
suitable check for the case-fold property — the F-1 tests assert that property directly
against the reviewer's own scenario instead, so a future reader does not mistake the
oracle's silence on case for a second, independent confirmation.

### Test counts

**Module suite (`tests/overlap-policy.test.mjs`), `node --test`:**
| | tests | pass | fail |
|---|---|---|---|
| Before (base `origin/main` @ `a67169b`, pre-fix) | 28 | 28 | 0 |
| After (this branch, post-fix + 6 new tests) | 34 | 34 | 0 |

**Full repo suite (`npm test` = `validate-foundation` + `node --test tests/*.test.mjs`):**
| | tests | pass | fail | skipped |
|---|---|---|---|---|
| Before (base `origin/main` @ `a67169b`, pre-fix, fresh `npm install`) | 1149 | 1146 | 0 | 3 |
| After (this branch, post-fix) | 1155 | 1152 | 0 | 3 |

Delta is exactly +6 tests, all passing, zero regressions across the pre-existing
1149-test baseline. `node tools/validate-foundation.mjs` exits 0 both before and after,
no `FAIL` entries in its JSON report.

### Hardcoded test-ID branching
`grep -inE "test-id|testId|TEST_ID|hardcod|special-case|specialCase"` over
`src/control/overlap-policy.mjs` and `src/control/write-set-policy.mjs`: **no matches.**
The fix branches only on write-set-policy's own structural deny codes
(`DENY_WRITE_SET_PROHIBITED`), not on any caller identity or test fixture.

### Scope check
Exactly 2 files changed: `src/control/overlap-policy.mjs` (+~60 lines: `withinCaseFold`
helper, updated `within`, doubly-malformed deny-code symmetry fix, header changelog
note) and `tests/overlap-policy.test.mjs` (+~130 lines, purely additive). `write-set-
policy.mjs` untouched — reconfirmed by its own byte-identity guard test passing.
`OVERLAP_CLASSES`, `OVERLAP_ORDER`, `OVERLAP_DENY_CODES`, and the module's public export
surface (`evaluateOverlap` only) are unchanged. Still PURE and UNWIRED — no new import,
no new consumer, no I/O.

## Recommendation for `bst/mod-integ-queue-s2-collision-forecast` (PR #84)

`forecastCollision()` imports `evaluateOverlap` **unmodified** and passes its arguments
straight through with no local path logic of its own (confirmed by direct read of
`src/control/integration-collision-forecast.mjs` on that branch). This means:

- **No code change is required in that file for the fix itself.** Once this fix is
  reviewed and merged to `main`, and `bst/mod-integ-queue-s2-collision-forecast` is
  rebased onto (or merged after) that updated `main`, `forecastCollision()` will
  automatically inherit the corrected case-fold behavior — it calls `evaluateOverlap`
  by reference, not a copy, and adds no case-sensitive logic of its own.
- **A confirming regression test in that consumer's own suite is recommended, not a
  production change.** `tests/integration-collision-forecast.test.mjs` on that branch
  currently has zero case-sensitivity coverage (confirmed via grep). Recommend the
  owner of PR #84 add one test asserting that two queued entries whose
  `declared_write_set` name the same file with differing case are forecast
  `collides: true` (not `collides: false`) once rebased past this fix — this is the
  exact scenario the second review identified as that consumer's real, already-existing
  blast radius, and a dedicated test there closes the same coverage gap at the
  consumer's own layer, independent of this module's tests.
- This producer did **not** modify `bst/mod-integ-queue-s2-collision-forecast` or any
  file on it — per this task's instruction, that branch is owned by its own producer;
  this is a recommendation only.

## F-2 disposition note

Addressed as a cheap fix in the same pass (see "Fix (F-2)" above) rather than deferred —
the change was a small, order-independent precedence rule with no larger validation-order
redesign required. Confirmed via regression test that both argument orders now agree on
`code`.

## Status fields

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: existing
risk_class: medium
self_certification:
  agent_id: claude-motor
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

## Disposition

The second independent review's F-1 finding (case-sensitivity silent-fail-open, real
downstream blast radius through `MOD-INTEG-queue-S2`) is closed: the reviewer's exact
probe now correctly classifies as `O2`, reproduced first-hand pre-fix and post-fix by
this producer, with permanent regression tests committed alongside the fix. The
lower-priority F-2 finding (deny-code order-dependence on doubly-malformed input) is also
closed, cheaply, in the same pass. This is a local commit on
`bst/mod-wspace-s2-overlap-case-fix-001`, based on `origin/main` @ `a67169b`. Not pushed,
no PR opened, no merge — per SECB-AGENTS-AMD-002 rev 2 advise-and-proceed, this candidate
is prepared and ready for asynchronous GOV/independent-review ratification at operator
merge review; it carries no authority to self-declare complete, production, or merged.
