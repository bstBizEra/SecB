# MOD-WSPACE S2 Overlap-Class Evaluator — Second Independent Review

**Record ID:** mod-wspace-s2-overlap-policy-second-independent-review-001
**Status:** DRAFT / ADVISORY — NOT EFFECTIVE
**Verdict:** **REQUEST_CHANGES** (real bug, fast-follow required)
**Reviewer:** independent BST-SA REV/SEC worker (this session), no continuity with `claude-immune-rev-wspace-overlap-01`
**Review target:** `src/control/overlap-policy.mjs` @ `origin/main` `a67169b149f0887090e15cd7124681e58858010d` (already merged; this is a **post-merge** second-pass review, not a pre-merge gate)
**Prior review:** `docs/03-project-control/candidates/mod-wspace-s2-overlap-rev-001.md` — verdict `APPROVE_FOR_MERGE`, reviewer `claude-immune-rev-wspace-overlap-01`. That review is treated as an unverified claim, not a fact, per this session's standing instruction to re-derive rather than trust prior review accounts.
**Method:** isolated detached-HEAD git worktree off `origin/main`; full file re-read; independent adversarial probes executed directly with `node`; full suite + module test file run in this checkout; downstream consumer (`MOD-INTEG-queue-S2`'s `integration-collision-forecast.mjs`, branch `bst/mod-integ-queue-s2-collision-forecast`) read to assess real blast radius.

---

## 1. Scope confirmed

`src/control/overlap-policy.mjs` (253 lines) — pure, unwired O0–O5 collision-class evaluator. Reuses `evaluateWriteSet` from `src/control/write-set-policy.mjs` (byte-pinned, unmodified) for path/file containment; answers `sameModule` / `sameSymbol` / `protectedBranch` / `globalConfig` from caller-supplied booleans only. `evaluateOverlap` is the sole export consumed anywhere in the tree today: `bst/mod-integ-queue-s2-collision-forecast`'s `forecastCollision()` (a separate, not-yet-merged branch) imports it and calls it in production-candidate logic — this is the one already-real consumer, confirmed by direct read of `src/control/integration-collision-forecast.mjs` on that branch.

## 2. Independent verification

### 2.1 Classification-boundary probes (adversarial, self-constructed)

| Probe | Expected | Actual | Result |
|---|---|---|---|
| `sameSymbol:true` + disjoint paths | O3 (escalate, not relax) | O3 | correct |
| file overlap + `sameModule:false` (contradiction) | O2 | O2 | correct |
| `protectedBranch:true` + everything else true | O5 (most restrictive wins) | O5 | correct |
| `src/foo` vs `src/foobar` (classic prefix-confusion boundary, almost-O2) | O0 (NOT overlap) | O0 | correct — reused containment is prefix-safe |
| `src/shared` vs `src/shared/nested/deep.mjs` (ancestor, should BE O2) | O2 | O2 | correct |
| trailing slash: `src/foo/` vs `src/foo` (should normalize to same file, O2) | O2 | O2 | correct |
| all four doctrine dims omitted, disjoint paths (O0-floor-by-omission trap) | `DENY_OVERLAP_UNKNOWN_CLASS`, never O0 | `DENY_OVERLAP_UNKNOWN_CLASS` | correct — permissive floor genuinely unreachable by omission |

All of the above independently reproduce the first review's claims. No disagreement on these dimensions.

### 2.2 Path/prefix logic — REAL BUG FOUND: case-sensitivity silent-fail-open

Constructed probe (`writeSetA:["src/Foo.js"]`, `writeSetB:["src/foo.js"]`, all four doctrine dimensions `false`):

```
evaluateOverlap({writeSetA:["src/Foo.js"], writeSetB:["src/foo.js"], sameModule:false, sameSymbol:false, protectedBranch:false, globalConfig:false})
-> { ok: true, overlapClass: "O0", control: "Parallel", overlap: "Separate modules/files" }
```

Control (same-case, same string): correctly returns `O2` / "Reservation and conflict forecast".

**Root cause:** `pathsOverlap`/`writeSetsOverlap` derive file-level overlap entirely by calling `evaluateWriteSet({candidatePaths:[a], allowedPaths:[b], prohibitedPaths:[]})` — i.e. they route through write-set-policy's **allowed-containment** branch (`withinBound`, exact string match, no case-folding). write-set-policy.mjs *does* have a case-folding defense (`caseFoldedProhibited`), but that defense lives exclusively in the **prohibited-path** branch, which `overlap-policy.mjs` never invokes (it always passes `prohibitedPaths: []`). The S1 primitive's one case-insensitivity safeguard was built for a different threat model (defeating a bypass of a declared prohibited prefix) and the S2 reuse silently inherits the *other*, case-sensitive branch instead.

**Why this is a genuine bug, not an accepted limitation:** the module's own header states, as a hard doctrine invariant, "The most permissive class (O0/Parallel) is NEVER reached by omission — the caller must explicitly answer every non-derivable dimension." Two write sets naming the *same file* on a case-insensitive or case-preserving-but-insensitive filesystem — Windows (this repo's host OS) and default macOS/APFS — are the same file. Classifying them as O0 "Parallel" is exactly the omission-reaches-permissive-floor failure the module explicitly claims to close, just reached through the case dimension instead of the boolean-flag dimension.

**Not caught by either test suite, and structurally can't be:**
- `tests/overlap-policy.test.mjs` has zero case-sensitivity assertions (`grep -i case` → only a comment, no test).
- The "reuse parity" test's own independent oracle (`referencePathSubset`/`referenceOverlap`, lines 411–422 of the test file) is **also** case-sensitive (`p === e`, no fold) — it was written to double-check the same containment logic and shares the same blind spot. Two independently-written implementations agreeing is not independent verification when both share an unstated assumption; this is exactly the kind of false-confidence a "parity oracle" is supposed to prevent but didn't here.
- `bst/mod-integ-queue-s2-collision-forecast`'s own test file (`tests/integration-collision-forecast.test.mjs`) also has zero case-sensitivity coverage.

**Real, already-existing blast radius through MOD-INTEG-queue-S2 (not hypothetical):** `forecastCollision()` in `src/control/integration-collision-forecast.mjs` (line 79 imports `evaluateOverlap`; lines 167–182) passes `candidateWriteSet` and each queued entry's raw `declared_write_set` straight through with **zero normalization**, and always sets `sameModule`/`sameSymbol`/`protectedBranch`/`globalConfig` to `false` (documented in that file's own header as a disclosed scope limit: it "can only ever surface O0 (no collision) or O2"). That means for this consumer, **case-sensitive file-path comparison is the entire and only classification axis it exercises** — there is no other signal that could catch a same-file, different-case pair. Two concurrently-queued SUBMITTED/IN_REVIEW branches whose declared write sets name the same file with differing case (a realistic occurrence — inconsistent casing across contributors/editors/OSes, or a rename-casing fix) would be forecast `collides: false`, `mostRestrictiveClass: null` — "safe to proceed in parallel" — when in fact, on this repo's own host filesystem, writing both would race on and potentially corrupt the identical file. This is precisely the class of failure `forecastCollision` exists to catch.

### 2.3 Silent-fail-open (malformed entries) — no additional issue found

Confirmed a malformed/unexpected write-set element (non-string, null-byte, `..`-traversal, sparse-array hole, poisoned iterator) is never silently dropped or excluded from comparison — `validateWriteSet` gates the *entire* write set through `evaluateWriteSet`'s grammar check before any pairwise comparison runs, so one bad entry denies the whole set (`DENY_OVERLAP_MALFORMED` / `DENY_OVERLAP_EMPTY`) rather than being quietly filtered out. This part of the fail-closed design holds.

### 2.4 Symmetry — minor secondary finding: deny-code (not verdict) can flip on argument order

`evaluateOverlap(A, B)` and `evaluateOverlap(B, A)` are symmetric on every `ok: true` classification (confirmed: `filesOverlap` is computed via an existence check over both directions, and the four doctrine booleans are order-independent scalars). However, when **both** write sets are malformed in *different* ways, the specific deny `code` returned depends on argument order, because `validateWriteSet` checks whatever lands in the "A" slot first:

```
evaluateOverlap({writeSetA: [], writeSetB: ["../etc/passwd"], ...}) -> { ok:false, code: "DENY_OVERLAP_EMPTY" }
evaluateOverlap({writeSetA: ["../etc/passwd"], writeSetB: [], ...}) -> { ok:false, code: "DENY_OVERLAP_MALFORMED" }
```

Both directions correctly reject (never flips `ok:false` to `ok:true`), so this does **not** create a false-allow and has **no confirmed blast radius** through `MOD-INTEG-queue-S2` today (that consumer always calls with a fixed argument order — candidate in the A slot, one queued entry's declared set in the B slot — never swapped). Recorded as low-severity/informational: a caller that branches on the specific deny `code` (rather than just `ok`) could observe order-dependent behavior for a doubly-malformed pair. Does not block merge on its own; worth folding into the same fast-follow as a one-line note if convenient.

### 2.5 Hardcoded test-ID branching

`grep -i` for `test-id|testId|TEST_ID|hardcod|special-case|specialCase` over `src/control/overlap-policy.mjs`: no matches. No test-ID-conditioned branching found.

### 2.6 Doc-parity, atomic-snapshot/TOCTOU, frozen exports

Independently re-verified — all as claimed by the prior review. `OVERLAP_CLASSES`/`OVERLAP_ORDER` match `docs/12-execution/06-parallel-execution.md`'s table verbatim (the doctrine table itself says nothing about case-sensitivity — this is a pure implementation gap, not a doctrine ambiguity). Cross-array TOCTOU, poisoned-iterator rejection, and single-read-per-accessor guarantees reproduced directly. No disagreement with prior review on these points.

## 3. Test results (this checkout)

- Fresh `git worktree add --detach` off `origin/main` @ `a67169b`; `npm install` required (fresh worktree had no `node_modules`) before either suite would resolve.
- `npm test` (validate-foundation + full `node --test tests/*.test.mjs`): **1149 tests, 1146 pass, 0 fail, 3 skip.**
- `node --test tests/overlap-policy.test.mjs` in isolation: **28/28 pass**, 0 fail — consistent with the prior review's count; confirms the case-sensitivity gap is a genuine coverage hole, not a test that's failing and being ignored.

## 4. Findings by severity

- **High — F-1 (case-sensitivity silent-fail-open, real downstream blast radius).** `evaluateOverlap` classifies two write sets naming the identical file under differing case as `O0`/"Parallel" instead of `O2` or higher, because file-overlap detection is routed through write-set-policy's case-sensitive allowed-containment branch rather than its case-folded prohibited branch. This directly undermines the module's own stated "O0 unreachable by omission" invariant and has an **already-real** (not hypothetical-unwired) blast radius through `MOD-INTEG-queue-S2`'s `forecastCollision()`, whose only classification axis for real queued entries is this exact case-sensitive comparison. Neither `overlap-policy.mjs`'s own reuse-parity oracle nor the downstream consumer's test suite would catch it, since both share the same unstated case-sensitivity assumption.
  - **Suggested fast-follow:** fold canonical case-normalization (or an explicit case-fold comparison, matching write-set-policy's own prohibited-branch precedent) into `pathsOverlap`, OR — if case-sensitive comparison is an intentional choice for some deployment target — document that choice explicitly in the header and add a test asserting the current (case-sensitive) behavior on purpose, so a future reader can't mistake it for an oversight. Given the repo's own host is case-insensitive/case-preserving (Windows) and the doctrine intent is clearly "would these two candidates clobber the same file," the fold is very likely the correct fix, not just the safer one.
- **Low/Informational — F-2 (deny-code order-dependence on doubly-malformed input).** `evaluateOverlap(A,B)` can return a different (but always still `ok:false`) deny `code` than `evaluateOverlap(B,A)` when both write sets are malformed in different ways, because `validateWriteSet` checks the "A" position first. No confirmed blast radius (current sole consumer never swaps argument order); does not need to block this cycle but is cheap to note or fix alongside F-1.
- **None found:** silent-drop of malformed entries, hardcoded test-ID branching, doc-parity drift, TOCTOU/atomic-snapshot regressions, frozen-export mutability.

## 5. Verdict rationale

The prior review (`mod-wspace-s2-overlap-rev-001`) correctly verified doc-parity, most-restrictive-wins escalation, the classic `src/foo` vs `src/foobar` prefix-confusion boundary, and the atomic-snapshot/TOCTOU suite — none of that is disputed here. But its path/prefix-logic check stopped at "faithful reuse of write-set-policy containment" without probing the one dimension write-set-policy itself treats asymmetrically (case-folding present only on the prohibited branch, absent on the allowed branch) — and this reuse crosses that asymmetry into a context (peer collision detection between two independent write sets) where the missing fold is a false-allow, not a benign extra denial. Given this bug has a **confirmed, already-existing** consumer (`MOD-INTEG-queue-S2`, unlike some of this session's purely-unwired-primitive reviews) whose entire real-world classification power for this module runs through the exact code path that is wrong, this is not a low-severity/informational item — it is a correctness bug in a gate-adjacent evaluator with a real blast radius, warranting a fast-follow before any further wiring/adoption of either module.

**Verdict: REQUEST_CHANGES.**

## 6. Authority & self-certification

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: existing        # the S2 code exists on origin/main; this record reviews it, authorizes nothing
risk_class: medium
review_verdict: REQUEST_CHANGES
blocked_actions:
  - no push
  - no merge
  - no main mutation
  - no fix applied by this review (advisory only — fast-follow is a separate, operator-gated change)
  - operator-only integration / fix authorization
self_certification:
  agent_id: claude-rev-sec-wspace-s2-overlap-second-review-001
  peer_agent_id: claude-immune-rev-wspace-overlap-01
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Independent second-pass review gate: findings are advisory only. This module is already merged to `main`; this record recommends a fast-follow fix, not a block on the existing merge. No push, merge, or main mutation performed or authorized by this review. Both agents may self-certify advisory completeness; neither self-authorizes execution or fix application.
