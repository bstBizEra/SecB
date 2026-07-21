# MOD-WSPACE S2 — Overlap Case-Sensitivity Fast-Follow Independent Review

**Record ID:** mod-wspace-s2-overlap-case-fix-independent-review-001
**Status:** ADVISORY — worker review, not an approving authority
**Reviewer:** claude (REV/SEC role), BST-SA worker agent, advisory-only
**Date:** 2026-07-22
**Reviewed branch:** `bst/mod-wspace-s2-overlap-case-fix-001` @ `d902e94`
**Review worktree (isolated, this record's own):** `C:/Users/ounkh/SecB-worktrees/mod-wspace-s2-overlap-case-fix-independent-review-001`, detached HEAD at `d902e94`, `npm install` run fresh, `git status` clean before and after this review's probes (temporary probe scripts written and deleted; nothing left in the working tree).
**Producer record reviewed:** `docs/03-project-control/candidates/mod-wspace-s2-overlap-case-fix-producer-verification-001.md` (read in full; every claim in it was independently re-derived below, not merely trusted).

## Verdict

**APPROVE_WITH_NOTES**

The fix genuinely closes the reported F-1 defect (confirmed by fresh, independent reproduction) and the F-2 deny-code asymmetry (confirmed with self-constructed inputs, not the producer's own test fixtures). `write-set-policy.mjs` is independently hash-verified byte-identical. The MOD-INTEG-queue-S2 consumer genuinely needs no code change. All producer-claimed test counts reproduce exactly. However, this review found a **genuine residual false-negative gap** (Turkish dotted-İ) that reproduces the *same risk class* as the original bug on a narrower input space, and confirms a **structural false-positive trade-off** on genuinely case-sensitive deployment targets. Neither rises to REQUEST_CHANGES: the first is inherited from `write-set-policy.mjs`'s own pre-existing, unmodified case-fold mechanism (not introduced by this fix, and its own original use of that mechanism has the identical gap), and the second is directionally safe (over-restrictive, not under-restrictive) under this codebase's own deny-by-default doctrine. Both are recorded as notes for a possible future fast-follow, not blockers to this candidate.

## 1. Original scenario — genuinely closed

Reproduced fresh, from a clean probe script, in both argument orders, against the fixed module:

```
evaluateOverlap({writeSetA:["src/Foo.js"], writeSetB:["src/foo.js"], sameModule:false, sameSymbol:false, protectedBranch:false, globalConfig:false})
-> { ok: true, overlapClass: "O2", control: "Reservation and conflict forecast", overlap: "Same file, separate regions" }
```
Reversed argument order (`writeSetA`/`writeSetB` swapped): same result, `O2`. **Confirmed closed**, matching the producer's own reproduction and the second-review's original finding.

## 2. Adversarial probes

### 2a. Directory-component case difference (not just filename)
Tested `src/Utils/foo.js` vs `src/utils/Foo.js`, `src/Utils/sub/foo.js` vs `src/utils/Sub/foo.js`, and a directory-as-bound case (`src/Utils` vs `src/utils/nested/deep.mjs`). **All three correctly classify O2.** Root cause of why this works: `withinCaseFold` lowercases the *entire* path string (via `write-set-policy.mjs`'s existing `p.toLowerCase()` / `caseFoldedProhibited` machinery), not just the leaf filename, so a case difference anywhere in the path — directory or file — is caught symmetrically. No gap found here.

### 2b. Trailing separator only difference
`src/foo.js/` vs `src/foo.js` → `O2`. `write-set-policy.mjs`'s `canonicalizePath` already strips trailing slashes from every path (candidate and bound alike, not just bounds) before comparison, independent of this fix. No gap found here.

### 2c. Unicode case-folding edge cases — GENUINE GAP FOUND (Turkish dotted-İ)

Constructed `src/İstanbul.js` (U+0130, LATIN CAPITAL LETTER I WITH DOT ABOVE) vs `src/istanbul.js` (plain ASCII `i`):

```
evaluateOverlap({writeSetA:["src/İstanbul.js"], writeSetB:["src/istanbul.js"], ...O0-floor})
-> { ok: true, overlapClass: "O0", control: "Parallel", overlap: "Separate modules/files" }
```

**This silently reproduces the exact same bug class the fix was written to close** — a real same-conceptual-file pair (on any locale/filesystem where İ/i case-fold together) misclassifies as O0/Parallel instead of O2+. Root cause: `"İ".toLowerCase()` in the default (non-Turkish) JS locale returns `"i̇"` (plain `i` + a combining dot-above, 2 code units), which does not string-equal plain `"i"` (1 code unit) — so `withinCaseFold`'s reused `p.toLowerCase()` comparison silently misses it. (Control check: `"ISTANBUL.js"` (ASCII capital I) vs `"istanbul.js"` correctly folds to `O2` — only the *Turkish* dotted-İ, not ordinary ASCII case, is affected.)

**Important scoping fact, independently verified:** this gap is **not new** — it was already present in `write-set-policy.mjs`'s own case-fold defense, unmodified by this fix, in that mechanism's *original* purpose (prohibited-prefix bypass-by-case):
```
evaluateWriteSet({candidatePaths:["src/istanbul.js"], allowedPaths:[], prohibitedPaths:["src/İstanbul.js"]})
-> { ok: false, code: "DENY_WRITE_SET_OUTSIDE_ALLOWED", ... }   // NOT flagged as prohibited — same silent miss
```
So this fix inherits a pre-existing limitation of the reused primitive rather than introducing a new one; it neither worsens nor was obligated to fix it, since the byte-identity constraint on `write-set-policy.mjs` explicitly forbids touching that file in this slice. Recommend as a follow-up note, not a blocker: a future hardening pass should consider Unicode-aware case-folding (e.g. `String.prototype.toLocaleLowerCase("tr")`-aware comparison, or full Unicode default case folding) in `write-set-policy.mjs` itself — a change that is out of scope for a byte-identity-pinned fast-follow like this one.

**Adjacent Unicode check — ruled out, not a risk:** hypothesized that the Kelvin sign (U+212A) or Angstrom sign (U+212B), which both `.toLowerCase()` to plain ASCII `k`/`å` respectively, might cause a genuinely-different-codepoint false collision. Empirically **ruled out**: both characters have *canonical* (not merely compatibility) NFC decompositions to their ordinary Latin letters, so `write-set-policy.mjs`'s own `canonicalizePath` NFC-equality check (`canonical.normalize("NFC") !== canonical`) already rejects any path containing them as non-canonical, denying with `DENY_OVERLAP_MALFORMED` before `within`/`withinCaseFold` is ever reached. Confirmed by direct probe. German `ß` vs capital `ẞ` (U+1E9E) correctly fold together (`O2`, matches expectation — both `.toLowerCase()` to `ß`). `ß` vs `SS` (a real German orthographic equivalence, not a case-fold at all) correctly stays `O0` — that is a spelling variant, not a case difference, and is out of scope for a case-fold fix; not a defect.

### 2d. Structural false-positive trade-off on genuinely case-sensitive filesystems

Confirmed: two ASCII files differing only in case that could coexist as **distinct** files on a genuinely case-sensitive deployment target (e.g. Linux ext4, or a git repo with `core.ignorecase=false`) — `src/README.md` vs `src/readme.md` — are **unconditionally classified O2** by this fix, with no way to distinguish "same file on this case-insensitive host" from "two real, distinct files on a case-sensitive target." This is not a bug in the sense of violating a stated invariant — the module's own doctrine is deny-by-default / most-restrictive-wins, and over-classifying to O2 (more conservative: "Reservation and conflict forecast") rather than under-classifying to O0 is exactly the safe direction the original F-1 defect was about (a false O0 was the actual security-relevant failure; a false-but-conservative O2 is not). It is, however, a real and permanent **precision cost**: on a genuinely case-sensitive deployment, or in any repo that legitimately maintains case-cousin filenames, this fix will force unnecessary reservation/conflict-forecast overhead. Noted as an accepted, disclosed trade-off inherent to reusing a case-fold-based mechanism for this purpose — not a defect, and not something a narrower fix could avoid without either (a) modifying `write-set-policy.mjs` (out of scope, byte-identity-pinned) or (b) adding a target-filesystem-sensitivity parameter to `overlap-policy.mjs`'s doctrine dimensions (a materially larger, separately-governed change).

## 3. `write-set-policy.mjs` byte-identity — independently recomputed, confirmed untouched

Computed hashes directly (not trusting the producer's own guard test):
```
git hash-object src/control/write-set-policy.mjs                                    -> 5f1e119c8089ba8250f3596164c0974662587449  (this branch, HEAD d902e94)
git rev-parse origin/main:src/control/write-set-policy.mjs                          -> 5f1e119c8089ba8250f3596164c0974662587449  (origin/main tip, bd00c53)
git rev-parse $(git merge-base HEAD origin/main):src/control/write-set-policy.mjs   -> 5f1e119c8089ba8250f3596164c0974662587449  (merge-base a67169b)
```
All three identical. **Confirmed genuinely byte-identical** — not modified by this branch, and origin/main has not touched it either in the commits since this branch's base.

## 4. F-2 deny-code symmetry — reconfirmed with self-constructed inputs

Built two fresh doubly-malformed pairs not present in the producer's own test fixtures:
- `writeSetA: []` vs `writeSetB: ["C:\\Windows\\System32"]` (empty + absolute-Windows-path) → both argument orders return `{ ok:false, code:"DENY_OVERLAP_MALFORMED" }`.
- `writeSetA: ["src/a/../b"]` vs `writeSetB: ["src/x "]` (traversal + Windows-collapsible-component malformed) → both argument orders return `{ ok:false, code:"DENY_OVERLAP_MALFORMED" }`.

Both pairs are order-independent on verdict **and** code. **Confirmed.**

## 5. MOD-INTEG-queue-S2 (`integration-collision-forecast.mjs`, PR #84) — re-verified by direct read

Fetched `origin/bst/mod-integ-queue-s2-collision-forecast` and read `src/control/integration-collision-forecast.mjs` directly (not relying on the producer's paraphrase):
- Line 79: `import { evaluateOverlap, OVERLAP_ORDER } from "./overlap-policy.mjs";` — unmodified import.
- Lines 168–175 (`forecastCollision`'s per-queued-entry comparison): passes `candidateWriteSet` / `payload.declared_write_set` straight through to `evaluateOverlap`, with `sameModule`/`sameSymbol`/`protectedBranch`/`globalConfig` all hardcoded `false` — zero local path or case logic.
- Confirmed via `git show origin/bst/mod-integ-queue-s2-collision-forecast:tests/integration-collision-forecast.test.mjs | grep -in case` → **no matches**, confirming zero existing case-sensitivity coverage in that consumer's own suite.

**Confirmed: no code change needed in that file for this fix to take effect** — it calls `evaluateOverlap` by reference and will inherit the corrected case-fold behavior automatically once this branch is merged to `main` and that branch is rebased onto (or merged after) it. The producer's recommendation (add a confirming regression test in that consumer's own suite, not a production change) is reasonable and appropriately scoped.

## 6. Full test suite — independently run, counts reconfirmed

Ran `npm test` (`npm run validate && node --test tests/*.test.mjs`) fresh in this isolated worktree after `npm install`:
```
tests 1155
pass  1152
fail  0
cancelled 0
skipped 3
todo 0
```
**Matches the producer's claimed 1155/1152/0/3 exactly**, independently reproduced.

## 7. Hardcoded test-ID branching — none found

```
grep -inE "test-id|testId|TEST_ID|hardcod|special-case|specialCase|__TEST|NODE_ENV.*test|process\.env\.(NODE_ENV|TEST)" src/control/overlap-policy.mjs src/control/write-set-policy.mjs
```
No matches. The fix branches only on `write-set-policy.mjs`'s own structural deny code (`DENY_WRITE_SET_PROHIBITED`), not on caller identity, environment, or test fixtures.

## Summary of findings

| # | Area | Result |
|---|---|---|
| 1 | Original `src/Foo.js` vs `src/foo.js` scenario | Closed, both directions — confirmed |
| 2a | Directory-component case difference | No gap — confirmed correct |
| 2b | Trailing-separator-only difference | No gap — confirmed correct |
| 2c | Unicode case folding | **Gap found**: Turkish dotted-İ silently misses (inherited from unmodified `write-set-policy.mjs`, not introduced here); Kelvin/Angstrom signs ruled out (NFC canonicalization rejects them upstream); German ß/ẞ correctly folds, ß/SS correctly not-folded (out of scope, not a case difference) |
| 2d | Case-sensitive-filesystem false positive | Confirmed structural, by-design trade-off (conservative direction, not a safety defect) |
| 3 | `write-set-policy.mjs` byte-identity | Independently recomputed, confirmed identical |
| 4 | F-2 deny-code symmetry | Reconfirmed with self-constructed inputs |
| 5 | MOD-INTEG-queue-S2 consumer | Confirmed needs no code change; zero existing case coverage in its tests |
| 6 | Full suite | 1155/1152/0/3 — reconfirmed independently |
| 7 | Hardcoded test-ID branching | None found |

## Recommendation

**APPROVE_FOR_MERGE candidacy with two disclosed, non-blocking notes** for the operator/GOV record:
1. Turkish dotted-İ (and by extension, likely other non-ASCII default-`toLowerCase()` asymmetries) remains an open, narrower case-fold gap inherited from `write-set-policy.mjs`'s own pre-existing mechanism — worth a future, separately-governed hardening pass on that file (which this fast-follow correctly did not touch, per its own byte-identity constraint).
2. The fix's case-fold approach unconditionally treats ASCII-case-cousin paths as colliding, which is safe-direction (over-restrictive) but has a real, permanent parallelism/precision cost on genuinely case-sensitive deployment targets — an accepted trade-off, not a defect, given the doctrine's own most-restrictive-wins posture.

Neither note blocks this candidate; both are recommended as forward-looking backlog items, not conditions of merge.

## Status fields

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: existing
risk_class: low
self_certification:
  agent_id: claude-rev-sec
  peer_agent_id: claude-motor
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

## Disposition

This is an independent, worker-role advisory review only. It does not merge to `main`, does not push, and does not self-authorize execution. Verdict and notes above are for GOV/operator review at the standard merge-review checkpoint. Reviewed entirely in an isolated worktree (`C:/Users/ounkh/SecB-worktrees/mod-wspace-s2-overlap-case-fix-independent-review-001`) that this review created and used exclusively; the live branch `bst/mod-wspace-s2-overlap-case-fix-001` and the producer's own worktree (`C:/laragon/www/secb-wt-overlap-case-fix`) were not touched.
