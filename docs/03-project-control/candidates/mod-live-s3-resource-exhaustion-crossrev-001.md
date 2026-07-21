# MOD-LIVE S3 — Resource-Exhaustion Fix (F1) — Cross-Lane Immune Review 001

**Record ID:** mod-live-s3-resource-exhaustion-crossrev-001
**Status:** ADVISORY — NOT EFFECTIVE (worker output; no approval/merge authority)
**Reviewer identity:** `claude-immune-crossrev-live-s3-resexh-01` (BST-SA Immune, cross-lane; independent of the Codex-produced fix and of the Claude lane that shepherded LIVE-S3 via PR #47)
**Lane crossing:** Codex-produced fix (`bst/mod-live-s3-resource-exhaustion-fix-001`), reviewed by the Claude Immune lane. Distinct from the producer-verification (`claude-sonnet-main-producer-...`) and the first independent review (`claude-rev-live-s3-resource-exhaustion-fix-001`) already on the branch — this is a third, cross-lane pass focused on security/DoS bound-correctness, no-regression to ratified LIVE-S3 semantics, and honesty-of-bound.
**Reviewed branch:** `bst/mod-live-s3-resource-exhaustion-fix-001` @ `7f7c4d2` (own-review tip; code commit `a6d537e`), base `main @ e11e1e0`
**Review worktree:** isolated worktree at `.claude/worktrees/agent-a921bac94f5060156`, branch `claude/rev/live-s3-resexh-crossrev` cut from `7f7c4d2`. All probes imported the real branch `src/live/replay-assembler.mjs` via `pathToFileURL` dynamic import — no branch file copied, edited, or forked.
**Environment:** node (repo `package-lock.json`-backed `npm ci`); current `main` tip observed at `8e30d89` (advanced past the branch base — see §5 merge-conflict note).
**Governance frame:** advisory/worker role (BST-SA Immune, `A1_ANALYZE_AND_PREPARE_ONLY`). Certifies review completeness only. Does not merge, approve, or authorize merge; never weakens a security gate. Ratification and the main-fold remain operator/coordinator decisions.

## Verdict

**APPROVE_FOR_MERGE** (one INFO note: the branch is in a stale-base / conflicting state vs current `main`; the resulting single byte-identity test failure is environmental, not a code defect — see §5. The coordinator owns the fold.)

The F1 resource-exhaustion DoS is genuinely closed on this tree. Both unbounded vectors are addressed, the bound is honest (fail-closed, observable, never a silent drop), ratified LIVE-S3 semantics are intact, the module is still pure and unwired, and the change is scoped to exactly one source file plus its test. No new security surface introduced; the atomic-snapshot / TOCTOU discipline is preserved untouched.

---

## 1. Bound correctness — DoS rebuilt on THIS tree, now bounded

The original defect was two independent unbounded operations in `sequenceGaps()`:
(a) `Math.min(...set)`/`Math.max(...set)` spreads every distinct declared `sequence` into call arguments — overflows V8's call-argument limit past ~100k distinct values (`RangeError: Maximum call stack size exceeded`); and
(b) an unconditional `for (s = min; s <= max)` fill of the full `[min..max]` range — multi-second stall / `RangeError: Invalid array length` on a large sparse span.

**Mechanism of the fix (confirmed by reading the diff + the post-fix file):**
- **(a) closed by a manual reduce.** `min`/`max` are now computed with a plain `for...of` comparison loop over the `present` Set — no spread, no call-argument limit, O(1) stack depth regardless of set cardinality.
- **(b) closed by a documented span ceiling.** `MAX_SEQUENCE_GAP_SPAN = 1_000_000` bounds the span (`max - min`) that will be materialized. `span > MAX_SEQUENCE_GAP_SPAN` short-circuits BEFORE any array fill, returning `{ boundedOut: true, min, max, span, limit }`. Because `missing ⊆ [min..max]`, bounding span at 1e6 bounds both the fill-loop iteration count (≤ span+1) and the `missing[]` allocation (≤ ~1e6 small ints, a few MB). Documented in-line with scale (~5× the gap-assessment's own named 131k–200k plausible range), timing (~20ms at the ceiling), and memory rationale — the bound is auditable in one place (`export const`).

**First-hand reproduction (my own probe, public `assembleReplayPackage` API, not test-code reuse):**

| Scenario | Old behavior (per F1) | Now (measured, this reviewer) |
|---|---|---|
| **seq 1 and 5_000_000** (coordinator's) | ~3s fill / large alloc | **0.4 ms**, `ok:true`, `gaps === null`, one `SEQUENCE_GAP_ANALYSIS_SPAN_EXCEEDED` finding `{min:1, max:5000000, span:4999999, limit:1000000}`. Never threw. |
| **seq 0 and Number.MAX_SAFE_INTEGER** | `RangeError: Invalid array length` | **0.1 ms**, `ok:true`, `gaps === null`, finding `span:9007199254740991`, `max === MAX_SAFE_INTEGER` (no precision loss). Never threw. |
| **seq 0 and 1e8** | ~3.6 s stall, 100M-elem array | **0.1 ms**, `ok:true`, `gaps === null`, bounded finding, `< 1000 ms`. Never threw. |
| **200,000 distinct contiguous values** | `RangeError: Maximum call stack size exceeded` (spread) | **~192 ms**, `ok:true`, `gaps === []` (genuinely analyzed — span 199,999 is under the ceiling), no bounded finding. Never threw. Confirms vector (a) is closed by the reduce even for in-bound spans with high cardinality. |

**Ceiling boundary — exact, both directions (my own sweep):** span == 1,000,000 → fully analyzed (`gaps` array len 999,999, not bounded); span == 1,000,001 → bounded (`gaps === null`); span == 999,999 → analyzed. The condition is strictly `span > MAX_SEQUENCE_GAP_SPAN` — not off-by-one either way.

**Ruling (bound-correctness): CORRECT.** Both DoS vectors (magnitude-span and distinct-value-cardinality) are closed on this tree; the assembler now completes in sub-millisecond time and returns a bounded, sensible result instead of materializing millions of entries, stalling, or throwing. The bound's mechanism (span ceiling + spread-free min/max) is documented.

## 2. No regression to ratified LIVE-S3 behavior (PR #47)

Re-ran the original LIVE-S3 semantics first-hand against the branch code:

- **Normal small-range gap detection:** `eventRecords` seq {1,4} → `package.gaps === [2,3]`, one `SEQUENCE_GAP` finding with `missing:[2,3]` and the `"…never backfilled"` note. Gaps surfaced as a finding, never backfilled. ✓
- **Contradiction retains both records:** same `idempotencyKey`, differing `contentHash` → one `ORDER_CONTRADICTION` finding; `streams.eventRecords === 2` (both retained, nothing dropped or overwritten). ✓
- **Disorder detected:** seq {5,2} → `ORDER_DISORDER` present. ✓
- **Duplicate detected:** same key + matching content → `ORDER_DUPLICATE` present. ✓
- **Source-class segregation:** event (`observed_fact`) and evidence (`inference`) land in separate `sourceClasses` buckets; streams stay partitioned (`eventRecords:1, evidenceRecords:1`). ✓
- **No-mutation guarantee:** caller record objects and the input array are byte-for-byte unchanged after assembly (JSON snapshot equality + array-order equality); output is deep-frozen at `result`, `result.package`, and `result.package.findings`. ✓
- **Atomic-snapshot / cross-record TOCTOU inert:** a hostile record whose `sequence` getter returns a different value on a second read was invoked **exactly once** (`sequenceGetterCalls === 1`) and `ok:true` — the fix did not reintroduce a second live read of `sequence`. The diff is scoped to `sequenceGaps()` and the `assembleReplayPackage` finding-emit block; Phase A (`snapshotStreams`/`snapshotRecord`/`snapshotNow`/`snapshotArray`, the single `Reflect.ownKeys` structural snapshot) is untouched — confirmed by reading the full post-fix file and the diff hunks. `sequenceGaps` consumes only the already-snapshotted `d.sequence` scalars, never re-reading caller objects. ✓

**Ruling (no-regression): CLEAN.** All ratified ordering/segregation/no-mutation/normal-gap semantics preserved; the mutation surface is not reintroduced.

## 3. Honesty of the bound

When the span is exceeded, the fix does NOT emit a silently-truncated gap list (which would hide real gaps and read as a completeness lie). Instead it:
- sets `package.gaps = null` (strictly `null`, never `[]`) — so a consumer cannot mistake "not analyzed" for "analyzed, no gaps found"; and
- emits a distinct, explicitly-flagged `SEQUENCE_GAP_ANALYSIS_SPAN_EXCEEDED` finding carrying `code: GAP_ANALYSIS_SPAN_EXCEEDED`, `boundedOut: true`, and `min/max/span/limit`, with a human-readable note stating analysis was not performed.

The bound is on a **safe dimension** (it declines analysis wholesale and signals it) rather than truncating a partial gap set. It is fail-closed and observable: the outcome is a finding, not a throw, not a stall, and not a false "gapless." I verified `gaps === null` by strict equality (not merely falsy) and confirmed the module has exactly one site that assigns the public `gaps` and one that reads it — no second path can confuse `null` with `[]`. The new finding type is appended to `REPLAY_FINDING_TYPES` (extend-only; the four pre-existing types unchanged in order and meaning), and the whole output stays deep-frozen.

**Ruling (honesty-of-bound): HONEST.** The bound preserves the assembler's findings-not-silent-drops contract — it converts an unanalyzable range into an explicit, machine-readable finding plus a `null` gaps signal, never a hidden truncation.

## 4. Scope

- **Source:** exactly one file changed under `src/**` — `src/live/replay-assembler.mjs`. (`git diff --name-only e11e1e0 7f7c4d2 -- 'src/**'` → single entry.)
- **Tests:** only `tests/replay-assembler.test.mjs` (+5 tests, +1 expected list-membership line). No other test file touched.
- **Unwired preserved:** `grep -rn "replay-assembler"` (excluding `node_modules`, `src/live/`, `tests/`) → **zero importers**. The module remains pure and unwired; no live blast radius.
- **Deep-frozen outputs:** intact (§2 no-mutation probe).
- **Byte-identity of other read files vs base:** the fix left every other file byte-identical to its base `e11e1e0`; `tools/validate-foundation.mjs` branch blob (`082638c…`) == base blob (`082638c…`), and the fix's diff touches no guarded source. (The guard's failure vs *current* main is a stale-base artifact — §5.)
- **Non-code additions:** `MANIFEST.json` gained one entry (producer-verification doc — pure append); `module-completion-tracker-001.md` gained one iteration-log line (extend-only). Both legitimate.

**Ruling (scope): CONFORMANT.**

## 5. Regression suite / validator / merge-conflict note

- **Full `npm test` on `7f7c4d2` (this worktree, against current `main @ 8e30d89`):** `tests 1067 / pass 1061 / fail 1 / cancelled 0 / skipped 5 / todo 0`.
- **The single failure is `tests/write-set-policy.test.mjs` "byte-identity … unchanged vs main"** on `tools/validate-foundation.mjs`. This guard resolves `git rev-parse main:tools/validate-foundation.mjs` **at runtime** and compares it to the working-tree blob. The branch base is `e11e1e0`; current `main` has since advanced to `8e30d89` and modified `validate-foundation.mjs` (branch blob `082638c…` vs current-main blob `d0ba1e9…`). The F1 fix never touched that file (branch blob == base blob). The producer and first reviewer both recorded `1067/1062/0/5` because at their run time `main` pointed at their base (`e11e1e0`), where the guard resolved to the matching blob. **This is 100% the stale-base / conflicting-branch condition the coordinator owns the fold for — an environmental artifact, not a defect in or regression from the F1 fix.** Once main is folded in, the guard re-pins to the merged `validate-foundation.mjs` and the failure clears.
- **Module suite** (`node --test tests/replay-assembler.test.mjs`): 38/38 pass (33 pre-existing + 5 new), independently re-run.
- **`npm run validate`:** exit **0** (`validate-foundation` status PASS).
- **Merge-conflict note:** branch CONFLICTS with `main` (stale base `e11e1e0`; main @ `8e30d89`). Expected. The coordinator folds separately; this review rules on the code as-is.

## Advisory status fields

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: existing
risk_class: low   # DoS closed; module pure + unwired (no live blast radius); change narrow and behavior-preserving for all in-bound inputs
```

```yaml
self_certification:
  agent_id: claude-immune-crossrev-live-s3-resexh-01
  peer_agent_id: null   # cross-lane review of a Codex-produced fix; no Codex immune counter-cert paired on this pass
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

## Recommendation

**APPROVE_FOR_MERGE.** F1 is genuinely closed on this tree: both DoS vectors bounded (span ceiling + spread-free min/max), boundary-exact, honest fail-closed bound (`SEQUENCE_GAP_ANALYSIS_SPAN_EXCEEDED` + `gaps === null`, never a silent drop), no regression to ratified LIVE-S3 ordering/segregation/no-mutation/gap semantics, atomic-snapshot discipline preserved, module still pure and unwired, scoped to one source file. The lone `npm test` failure is a stale-base byte-identity artifact the coordinator resolves in the fold — not blocking on the code. Recommend the coordinator fold `main` and stage for operator merge review.

> Recommend improvements only. Do not execute them. This record certifies advisory/cross-review completeness only; it neither merges nor authorizes merge. Ratification and the main-fold remain operator/coordinator decisions.
