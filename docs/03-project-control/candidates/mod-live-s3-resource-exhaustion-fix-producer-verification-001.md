# MOD-LIVE S3 — Resource-Exhaustion Fix (F1) — Producer Verification 001

**Record ID:** mod-live-s3-resource-exhaustion-fix-producer-verification-001
**Status:** DRAFT / ADVISORY — NOT EFFECTIVE
**Producer identity:** BST-SA PRODUCER worker agent, this session (`claude-sonnet-main`)
**Worktree:** `C:/Users/ounkh/SecB-worktrees/mod-live-s3-resource-exhaustion-fix-001`, branch `bst/mod-live-s3-resource-exhaustion-fix-001`, cut from `main @ e11e1e0` (verified via `git rev-parse main` before branching; `git diff a5e19b9 e11e1e0 -- src/live/replay-assembler.mjs tests/replay-assembler.test.mjs` confirmed the target files were unchanged between the second-review's base and this producer's base).
**Governance frame:** advisory/implementation-only, worker role (BST-SA PRODUCER), under `SECB-AGENTS-AMD-002` rev 2's standing pre-authorization for bounded slices under `src/**`/`tests/**`/`docs/**` (advise-and-proceed; no per-step operator approval required; local commit only, no push, no PR, no merge to `main`). This record authorizes nothing beyond implementation of the already-recommended fix; ratification remains an operator merge-review decision.

## Finding under fix

**F1 (blocking)**, `docs/03-project-control/candidates/mod-live-s3-second-independent-review-001.md` (ref `refs/heads/bst/mod-live-s3-second-review-001` @ `b14799f`, reviewer `claude-rev-live-s3-second-01`, verdict `REQUEST_CHANGES`):

> `sequenceGaps()` computes `Math.min(...set)`/`Math.max(...set)` over declared sequence numbers, then synchronously fills every integer in `[min..max]` to detect gaps. This is unbounded on ordinary, non-adversarial numeric input: sequence 0/1e8 → ~3.6s stall, 100M-element array; sequence 0/1e9 → uncaught `RangeError: Invalid array length`; ~131k-200k distinct declared sequence values (no gap) → uncaught `RangeError: Maximum call stack size exceeded` from the spread call. Contradicts the module's own documented invariant ("the assembler never throws") on input the module itself labels `data_untrusted`.

Re-read in full from `src/live/replay-assembler.mjs` (`sequenceGaps`, its two callers `Math.min(...present)`/`Math.max(...present)`, and the header comment "A throw anywhere in extraction is contained to the structured malformed denial — the assembler never throws") and from `docs/03-project-control/candidates/mod-live-gap-assessment-001.md` (`bst/mod-live-assessment` @ `688fda5`) before making any change.

## Root cause

Two independent, unbounded operations inside `sequenceGaps`:

1. `Math.min(...present)` / `Math.max(...present)` spreads a `Set` of every distinct declared `sequence` value into function-call arguments. V8's call-argument limit is exceeded somewhere between 50,000 and 200,000 distinct values — a scale the module's own governing gap assessment names as "entirely plausible for a long-running session's event history," not a contrived edge case.
2. The subsequent `for (let s = min; s <= max; s += 1) if (!present.has(s)) missing.push(s);` loop materializes every integer in the declared range regardless of how large that range is, with no bound on magnitude — timing scales linearly (confirmed first-hand: 1e6-span fill measured ~20ms in this environment, consistent with the reviewer's own ~31ms figure), and a sufficiently large span (`>= 2**32 - 1` elements, e.g. sequence 0 and 1e9) throws `RangeError: Invalid array length` when `missing.push` would need to grow the array past its max length.

Both fire on plain object literals with plain integers — no Proxies, hostile getters, or adversarial shapes required — which is exactly the blind spot the first review's 17 accessor-attack probes did not cover.

## Correction

Applied entirely inside `src/live/replay-assembler.mjs`; no other file touched; no existing export removed or changed in signature.

1. **Manual reduce instead of spread.** `sequenceGaps` now computes `min`/`max` with a plain `for...of` loop over `present` (`if (s < min) min = s; if (s > max) max = s;`), which has no call-argument limit regardless of set size. This alone closes the record-count crash mode (reviewer scenario (c)).
2. **Bounded gap-fill with an explicit, non-throwing "span exceeded" outcome.** A new documented constant, `export const MAX_SEQUENCE_GAP_SPAN = 1_000_000`, caps the `[min..max]` span `sequenceGaps` will synchronously materialize. `sequenceGaps` now returns `{ boundedOut: false, missing }` (normal path, byte-identical result to before for any span <= the ceiling) or `{ boundedOut: true, min, max, span, limit }` (span > the ceiling) — it never throws and never silently returns `[]` (which would misrepresent an unanalyzed range as gapless). `assembleReplayPackage` surfaces the exceeded case as a new, distinct finding type `SEQUENCE_GAP_ANALYSIS_SPAN_EXCEEDED` (carrying `code: GAP_ANALYSIS_SPAN_EXCEEDED`, `boundedOut: true`, `min`, `max`, `span`, `limit`) and sets `package.gaps` to `null` (never `[]`) so a caller cannot mistake "not analyzed" for "analyzed, no gaps found." `REPLAY_FINDING_TYPES` grew by one entry (append-only; existing four types unchanged in meaning or order).

### Ceiling chosen: `MAX_SEQUENCE_GAP_SPAN = 1,000,000`

Rationale (documented in-line in the module as well):

- **Scale coverage.** The module's own governing gap assessment (`mod-live-gap-assessment-001.md`, G4) is the authoritative source for this reconciliation function's expected scale, and the F1 finding itself names "~131k-200k distinct declared sequence values" as "entirely plausible for a long-running session's event history, not a contrived edge case." `1,000,000` gives ~5x headroom above that explicitly-named plausible scale.
- **Timing.** Measured first-hand in this repo's own environment (`node v24.12.0`): a 1,000,000-element gap-fill completes in ~20ms (consistent with the F1 finding's own table showing 1e6 at ~31ms) — several orders of magnitude under any reasonable synchronous-stall budget, and nowhere near the ~3.6s the finding measured at 1e8.
- **Memory.** Bounds the `missing[]` allocation to at most 1,000,000 small-integer entries (a few MB), never the ~100M-entry allocation the finding reproduced at 1e8.
- **Separation from the crash-triggering magnitudes.** `1,000,000` sits comfortably below both 1e8 (~3.6s stall) and 1e9 (`RangeError`), so both of the finding's magnitude-driven reproductions land on the new "span exceeded, not analyzed" path rather than the old "attempt it and hope" path.
- A single documented `export const` keeps the bound auditable in one place; a future slice may make it configurable if a legitimate need for a wider bound emerges.

## Verification

**Baseline (this producer, independently reproduced before any edit):**
`npm test` on `main @ e11e1e0` in this worktree → `tests 1062 / pass 1057 / fail 0 / skipped 5`, matching the second-review record's own independently-run baseline (`1062/1057/0/5`).

**After fix:**
- `node --check src/live/replay-assembler.mjs` → syntax OK.
- Module-only: `node --test tests/replay-assembler.test.mjs` → **38/38 pass** (33 pre-existing + 5 new; the 5 new are the `MAX_SEQUENCE_GAP_SPAN` shape check, the 3 reviewer-scenario regressions, and the exact-boundary test).
- Full suite: `npm test` → **tests 1067 / pass 1062 / fail 0 / skipped 5** (5 new tests added; same 5 pre-existing skips; **zero regressions**, zero newly-failing tests).
- `node tools/validate-foundation.mjs` → `"status": "PASS"`.
- `grep -n "test-id\|testId\|TEST_ID\|__TEST__\|NODE_ENV" src/live/replay-assembler.mjs tests/replay-assembler.test.mjs` → no matches; no hardcoded test-ID branching introduced.
- The pre-existing byte-identity test (`PINNED_BLOBS`, pinning 7 other files this suite reads) still passes unchanged — this fix touches only `src/live/replay-assembler.mjs` and `tests/replay-assembler.test.mjs`, neither of which is in that pinned set.

**All three reviewer scenarios reproduced and confirmed closed, first-hand, in this worktree:**

| Scenario | Before (per F1 finding) | After (measured this producer) |
|---|---|---|
| (a) sequence 0 and 1e8 | `ok:true` after ~3.6s stall, 100M-element array | Completes in well under 1000ms (test asserts `< 1000ms`); `ok:true`; `package.gaps === null`; one `SEQUENCE_GAP_ANALYSIS_SPAN_EXCEEDED` finding with `min:0, max:1e8, span:1e8, limit:1000000` — span exceeded, not analyzed, never thrown |
| (b) sequence 0 and 1e9 | Uncaught `RangeError: Invalid array length` | Completes in well under 1000ms; `ok:true`; `package.gaps === null`; one `SEQUENCE_GAP_ANALYSIS_SPAN_EXCEEDED` finding with `min:0, max:1e9, span:1e9` — never thrown |
| (c) 200,000 distinct sequential values, no gap | Uncaught `RangeError: Maximum call stack size exceeded` (threshold between 50k-200k) | Completes in well under 2000ms; `ok:true`; `package.gaps` correctly `[]` (span 199,999 is under the 1,000,000 ceiling — a real, completed gap analysis, not a span-exceeded outcome); never thrown |

A fourth boundary test additionally confirms the ceiling is exact (not off-by-one): a span exactly at `MAX_SEQUENCE_GAP_SPAN` is fully analyzed (real `gaps` array, no exceeded finding); a span one integer past it is `boundedOut`.

## Behavior preservation

- Every previously-analyzable sequence range (declared span `<= 1,000,000`) produces byte-identical `gaps`/`SEQUENCE_GAP` findings to before this fix — confirmed by the pre-existing gap tests (`gap: holes in the declared sequence range are a finding and surface in gaps[]`, `reconciliation runs over the EVENT stream only...`) passing unmodified, plus the new at-ceiling boundary test.
- No change to Phase A snapshot discipline, TOCTOU closure, boundary rulings (B1/B2/B3/B7), source-class segregation, or the deny-code contract — none of those code paths were touched.
- Still a pure function; still fully unwired (no import of this module added anywhere; `git grep -n "replay-assembler" -- '*.mjs'` outside `src/live/` and `tests/` shows nothing new).
- Only two files changed: `src/live/replay-assembler.mjs` (+124/-14 lines, `git diff --numstat`) and `tests/replay-assembler.test.mjs` (+134/-1 lines). No file added, renamed, or deleted — `MANIFEST.json` requires no update under AMD-002 rule 2 (that rule applies to add/rename/delete, not in-place edits).

## Advisory status fields

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: existing
risk_class: low   # the bug is fixed; module remains unwired (no live blast radius); fix is narrow and behavior-preserving for all in-bound inputs
```

```yaml
self_certification:
  agent_id: claude-sonnet-main-producer-mod-live-s3-resource-exhaustion-fix-001
  peer_agent_id: claude-rev-live-s3-second-01
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

## Recommendation

F1 is closed. Recommend this branch (`bst/mod-live-s3-resource-exhaustion-fix-001`, local commit only, not pushed, no PR opened) be staged for operator merge review alongside (or in place of) the second-review record, per the same fix-then-ratify pattern used for MOD-LIVE S1's N1 TOCTOU finding (`bst/mod-live-s1-toctou-fix-001`). No further producer action is proposed beyond this record and the tracker iteration-log append.

> Recommend improvements only. Do not execute them. This record neither merges nor authorizes merge; it certifies advisory/implementation completeness only. Integration, PR staging, and ratification remain operator decisions.
