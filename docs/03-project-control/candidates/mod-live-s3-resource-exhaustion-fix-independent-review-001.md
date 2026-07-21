# MOD-LIVE S3 — Resource-Exhaustion Fix (F1) — Independent Review 001

**Record ID:** mod-live-s3-resource-exhaustion-fix-independent-review-001
**Status:** ADVISORY — NOT EFFECTIVE (worker output; no approval/merge authority)
**Reviewer identity:** BST-SA REV worker agent (independent; no relationship to the producer), this session
**Reviewed branch:** `bst/mod-live-s3-resource-exhaustion-fix-001` @ `a6d537e`, base `main @ e11e1e0`
**Worktree used for review reading:** `C:/Users/ounkh/SecB-worktrees/mod-live-s3-resource-exhaustion-fix-001` (read-only; not modified except for this review record, added in a separate detached-HEAD commit and fast-forwarded onto the branch tip via `git update-ref`)
**Probe environment:** isolated scratch directory + a separate detached-HEAD `git worktree` at `main @ e11e1e0` for baseline reproduction (removed after use); all probe scripts imported the real `src/live/replay-assembler.mjs` from the reviewed worktree via `pathToFileURL` dynamic import — no branch file was copied, edited, or forked.
**Governance frame:** advisory/worker role (BST-SA REV), `A1_ANALYZE_AND_PREPARE_ONLY`. This record certifies review completeness only. It does not merge, approve, or authorize merge of the reviewed branch; ratification remains an operator decision.

## Verdict

**APPROVE_FOR_MERGE**

The F1 finding (unbounded `Math.min(...set)`/`Math.max(...set)` spread + unconditional `[min..max]` gap-fill in `sequenceGaps()`) is genuinely closed. All three originally-reported crash scenarios were independently reproduced against the actual public API and confirmed non-throwing post-fix. The `MAX_SEQUENCE_GAP_SPAN` ceiling boundary is exact, not off-by-one in either direction. My own novel adversarial probes (negative sequence numbers, non-integer/float sequence numbers, `Number.MAX_SAFE_INTEGER` as an endpoint) found no new crash or correctness defect — negative and float sequence values are rejected earlier, at the pre-existing per-record type-validation stage (`isSafeNonNegativeInteger`), never reaching `sequenceGaps` at all; `MAX_SAFE_INTEGER` is handled correctly and fast via the same reduce/ceiling-check path with no precision loss. Test counts match the producer's claims exactly. No hardcoded test-ID branching found. Behavior for in-bound (non-adversarial, sub-ceiling) inputs is unchanged.

## 1. Test-count reproduction (independent)

Ran `npm test` myself in two locations:

- **Branch** (`C:/Users/ounkh/SecB-worktrees/mod-live-s3-resource-exhaustion-fix-001`, at `a6d537e`, in place — running tests does not mutate tracked files): `tests 1067 / pass 1062 / fail 0 / cancelled 0 / skipped 5 / todo 0`. Matches claim exactly.
- **Main baseline**: created a separate detached-HEAD `git worktree add --detach <scratch>/main-baseline e11e1e0`, junctioned in the (identical, unmodified `package.json`/`package-lock.json`-backed) `node_modules` from the branch worktree, ran `npm test`: `tests 1062 / pass 1057 / fail 0 / cancelled 0 / skipped 5 / todo 0`. Matches claim exactly. Worktree removed after use (`git worktree remove --force`).
- **Module-only suite** (`node --test tests/replay-assembler.test.mjs`): main = `33/33 pass`; branch = `38/38 pass`. Matches the claimed 33→38.

## 2. `sequenceGaps()` diff review + independent stack-size stress test

Read the full diff (`git diff e11e1e0 a6d537e -- src/live/replay-assembler.mjs`, +124/-14, matches `git diff --numstat` exactly) and the full post-fix file. The fix:

- Replaces `Math.min(...present)` / `Math.max(...present)` with a plain `for...of` loop tracking `min`/`max` via comparisons — this has no V8 call-argument limit regardless of `Set` size, because it never spreads the set into a function call.
- Adds `const span = max - min; if (span > MAX_SEQUENCE_GAP_SPAN) return { boundedOut: true, min, max, span, limit: MAX_SEQUENCE_GAP_SPAN };` before the `[min..max]` materialization loop.
- `MAX_SEQUENCE_GAP_SPAN = 1_000_000`, documented in-line with scale/timing/memory rationale.

**Independent stress test beyond the shipped 200k regression test:** wrote a standalone probe (not copied from the test file) that builds **1,000,000** distinct sequential `sequence` values (0..999999, span 999999, i.e. genuinely analyzed, not bounded out) and calls the real `assembleReplayPackage`:

```
elapsedMs: 515
ok: true
gaps null? false
gaps length: 0   (correct — no gaps in a contiguous run)
span-exceeded finding present: false
streams.eventRecords count: 1000000
```

Pushed further to **5,000,000** distinct values (span 4,999,999, over the ceiling — exercises the reduce loop over a 5M-element `Set` plus the early-bail span check, without materializing a 5M-length array), run both with default V8 stack size and an explicitly reduced `--stack-size=984`:

```
elapsedMs: ~2900-3200ms, ok: true, gaps null? true, span-exceeded finding present: true, min/max/span: 0 4999999 4999999
```

No stack overflow at either scale, confirming the reduce loop's cost is genuinely O(1) in stack depth (an ordinary loop, not recursion), independent of `Set` size. Also independently reproduced the **old** crash mode in isolation (not via the module, to confirm the root-cause claim itself): `Math.min(...new Set([0..199999]))` throws `RangeError: Maximum call stack size exceeded` in this same Node v24.12.0 environment — confirms the bug being fixed was real and the fix's chosen mechanism (manual reduce) directly addresses it.

## 3. Reproduction of the three original scenarios (independent, via public API)

Used `assembleReplayPackage` (not the unexported `sequenceGaps`) with the required `{ sourceClass, sequence }` record shape and injected `options.now`, per the test file's own usage pattern — but with a freshly-written probe script, not reused test code.

| Scenario | Result (this reviewer, independent) |
|---|---|
| (a) sequence 0 and 1e8 | `ok:true`, completed in 1ms, `package.gaps === null`, one `SEQUENCE_GAP_ANALYSIS_SPAN_EXCEEDED` finding with `code: GAP_ANALYSIS_SPAN_EXCEEDED`, `min:0, max:1e8, span:1e8, limit:1000000`. Never threw. |
| (b) sequence 0 and 1e9 | `ok:true`, completed in 0ms, `package.gaps === null`, finding `min:0, max:1e9, span:1e9`. Never threw (previously `RangeError: Invalid array length`). |
| (c) 200,000 distinct sequential values, no gap | `ok:true`, completed in 103ms, `package.gaps` deep-equal `[]` (correct — real, completed analysis, span 199,999 is under the ceiling), no span-exceeded finding. Never threw (previously `RangeError: Maximum call stack size exceeded`). |

All three confirmed closed, independently reproduced, matching the claimed result shapes.

## 4. Ceiling boundary — exact, both directions

Independently constructed three inputs sweeping the boundary:

- **Span = `MAX_SEQUENCE_GAP_SPAN` (1,000,000) exactly** (`sequence` 0 and 1,000,000): `ok:true`, `gaps` is a real array of length 999,999 (all intervening integers missing except the two endpoints — correct for a 2-point sparse input), **no** span-exceeded finding. Fully analyzed.
- **Span = `MAX_SEQUENCE_GAP_SPAN + 1`** (`sequence` 0 and 1,000,001): `ok:true`, `gaps === null`, span-exceeded finding present with `span: 1000001`. Bounded out.
- **Span = `MAX_SEQUENCE_GAP_SPAN - 1`** (extra check, not in the shipped tests): `ok:true`, not bounded out.

The boundary is exact — `span > MAX_SEQUENCE_GAP_SPAN` is the correct condition (strictly greater-than), not off-by-one in either direction.

## 5. Novel adversarial probes (this reviewer's own, not in the shipped test suite)

- **Negative sequence + large positive** (`sequence: -5` and `sequence: 2000000`): denied at record-validation time, `ok:false`, `code: DENY_REPLAY_MALFORMED`. Never reaches `sequenceGaps` — `snapshotRecord`'s pre-existing `isSafeNonNegativeInteger` check (`Number.isSafeInteger(v) && v >= 0`) rejects negative sequences unconditionally. This validation predates the F1 fix and is unrelated to it, but it does mean a negative-sequence-driven huge-span attack is not a live concern for this function: the record is denied before gap analysis ever runs.
- **Non-integer (float) sequence spanning a huge range** (`sequence: 0.5` and `sequence: 2000000.25`): same outcome — `Number.isSafeInteger` rejects non-integers, so float sequences are denied at record-validation, never reaching `sequenceGaps`.
- **Both negative** (`sequence: -1000000` and `sequence: -1`): denied, same reason (confirms the rejection isn't specifically about the *pair* crossing zero — either value being negative denies the whole input).
- **`Number.MAX_SAFE_INTEGER` as one endpoint** (`sequence: 0` and `sequence: Number.MAX_SAFE_INTEGER`): `ok:true`, completed in 0ms, `gaps === null`, span-exceeded finding with `span: 9007199254740991` (exactly `Number.MAX_SAFE_INTEGER`, no precision loss) and `max` exactly equal to `Number.MAX_SAFE_INTEGER`. Handled correctly via the same reduce + ceiling-check path — no special-casing needed or missing.
- **Two `MAX_SAFE_INTEGER`-adjacent values, span = 1** (`sequence: Number.MAX_SAFE_INTEGER - 1` and `sequence: Number.MAX_SAFE_INTEGER`): `ok:true`, fully analyzed (in-bound), `gaps === []` (correct — both present, adjacent, no gap). Confirms the ceiling check and reduce loop behave correctly even at the extreme top of the safe-integer range, not just at "normal" magnitudes.

No new crash, hang, or incorrect result surfaced under any of these. The record-validation layer (pre-existing, not part of this fix) already forecloses negative/float sequence values as an attack surface for this specific function; the fix's own ceiling correctly handles the one adversarial dimension that *does* reach it (magnitude, up to and including `MAX_SAFE_INTEGER`).

## 6. `gaps === null` strictness and caller-facing consumption

- Confirmed `package.gaps === null` (strict equality — not merely falsy) when bounded out, verified with an explicit `!== undefined` check and an `Array.isArray` check (both agree it is neither `[]` nor `undefined`).
- Grepped the whole file for every place `gaps` is read or produced: `sequenceGaps()` returns `{ boundedOut, missing }` (an internal shape, never the public `null`/array itself), and `assembleReplayPackage` has exactly one site that assigns the public `gaps` variable (`gaps = null` in the `boundedOut` branch, `gaps = gapResult.missing` otherwise) and exactly one site that reads it (embedding it in the returned `package`). No second code path re-derives or re-checks `gaps` in a way that could confuse the two states.
- Grepped the whole repository for `.gaps` usage: only `src/live/replay-assembler.mjs` and its own test file reference it (`grep -rn "\.gaps" --include="*.mjs" --include="*.js" .`, excluding `node_modules`). Confirmed separately that `replay-assembler` is not imported anywhere outside `src/live/` and `tests/` (`grep -rn "replay-assembler" --include="*.mjs" .` outside those two files returns nothing) — the module is still genuinely unwired, so there is no live caller-facing code anywhere in the repo today that could confuse `null` with `[]` for this field.

## 7. Behavior preservation for in-bound inputs

- The module suite grew from 33 to 38 tests; all 33 pre-existing tests pass unmodified on the branch (verified by running `node --test tests/replay-assembler.test.mjs` and by diffing the test file: the only changes are (1) two new named imports, (2) one array-literal line appending `"SEQUENCE_GAP_ANALYSIS_SPAN_EXCEEDED"` to the expected `REPLAY_FINDING_TYPES` list — an expected, correct update tied directly to the new export, not a behavior change to gap-analysis results — and (3) five wholly new `test(...)` blocks inserted after the existing gap test and before the next pre-existing test, with no pre-existing assertion body touched).
- `git diff --numstat` confirms `tests/replay-assembler.test.mjs`: `+134/-1` (the `-1` is the `SEQUENCE_GAP` → `SEQUENCE_GAP, SEQUENCE_GAP_ANALYSIS_SPAN_EXCEEDED` array-literal line noted above), consistent with "only additive test changes, plus one expected list-membership update."
- Independently re-ran the pre-existing "gap: holes in the declared sequence range are a finding and surface in gaps[]" scenario shape (small in-bound span) and the ceiling-1/at-ceiling/ceiling+1 sweep above: every span `<= MAX_SEQUENCE_GAP_SPAN` produces a real `gaps` array and no `SEQUENCE_GAP_ANALYSIS_SPAN_EXCEEDED` finding, exactly as before the fix (the pre-fix code had no ceiling, so any in-bound span always fully analyzed — this is unchanged).
- No other function in the file (`orderingDisorderFindings`, `correlationFindings`, `snapshotRecord`, `snapshotStreams`, `snapshotNow`, `snapshotArray`, `deepFreeze`) was touched by this diff — confirmed by reading the full post-fix file and the diff hunks, which are scoped entirely to the header comment, the new exports (`MAX_SEQUENCE_GAP_SPAN`, `GAP_ANALYSIS_SPAN_EXCEEDED`), `REPLAY_FINDING_TYPES`, `sequenceGaps()`, and the `assembleReplayPackage` block that consumes `sequenceGaps()`'s result.

## 8. Hardcoded test-ID branching

`grep -inE "test-id|testId|TEST_ID|__TEST__|NODE_ENV" src/live/replay-assembler.mjs tests/replay-assembler.test.mjs` → no matches. Confirmed independently; no test-ID-conditioned branching was introduced.

## Other observations (non-blocking)

- `MANIFEST.json` gained one entry (the new producer-verification doc appended to slice S3's file list) — a legitimate extend-only addition, not a behavior-relevant change; `git diff --numstat` on `MANIFEST.json` was reviewed and is a pure append.
- The producer's own verification doc's numbers (baseline `1062/1057/0/5`, post-fix `1067/1062/0/5`, module `33→38`, `+124/-14` / `+134/-1` line counts, ceiling rationale, all three scenario tables) were all independently reproduced byte-for-byte or logically confirmed by this reviewer using fresh scripts — no claim in that document was taken on faith.
- The fix is scoped entirely to `src/live/replay-assembler.mjs` plus its own test file; no other module, export signature, or caller was touched. The module remains PURE and UNWIRED, consistent with its documented boundary rulings (B1/B2/B3/B7), none of which this fix's diff touches.

## Advisory status fields

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: existing
risk_class: low
```

```yaml
self_certification:
  agent_id: claude-rev-live-s3-resource-exhaustion-fix-001
  peer_agent_id: claude-sonnet-main-producer-mod-live-s3-resource-exhaustion-fix-001
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

## Recommendation

**APPROVE_FOR_MERGE.** F1 is genuinely closed: independently reproduced, boundary-exact, robust to novel adversarial magnitude probes (including `MAX_SAFE_INTEGER`), behavior-preserving for all in-bound inputs, no test-ID branching, module still unwired. Recommend this branch (`bst/mod-live-s3-resource-exhaustion-fix-001`, local commit only) be staged for operator merge review. This record neither merges nor authorizes merge; ratification remains an operator decision.

> Recommend improvements only. Do not execute them. This record certifies advisory/review completeness only.
