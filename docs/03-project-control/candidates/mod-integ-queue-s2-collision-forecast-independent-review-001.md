# MOD-INTEG Slice S2 (Collision-Forecast) — Independent Review 001

**Record ID:** mod-integ-queue-s2-collision-forecast-independent-review-001
**Status:** ADVISORY — NOT EFFECTIVE (worker output; no approval/merge authority)
**Reviewer identity:** independent REV/SEC lane, no relationship to the producer (`claude-motor-modintegqueue-s2`)
**Reviewed branch:** `bst/mod-integ-queue-s2-collision-forecast` @ `1d200ed`, base `bst/mod-integ-queue-s1-ledger` @ `66a5951`
**Review worktree:** `.claude/worktrees/mod-integ-queue-s2-collision-forecast` (pre-existing checkout of this branch; `npm install` run fresh, `node_modules` was absent). All probes imported the real branch files directly (`./src/control/integration-collision-forecast.mjs`, `./src/control/overlap-policy.mjs`) — no branch file copied, edited, or forked.
**Governance frame:** advisory/worker role (BST-SA REV/SEC, advisory_assessment_only). Certifies review completeness only. Does not merge, approve, or authorize merge.

## Verdict

**APPROVE_WITH_NOTES**

The slice does what it claims: a pure, unwired, honestly-scoped collision forecast that genuinely delegates all classification to `overlap-policy.mjs` and touches zero bytes of the S1 ledger or any other existing file. All producer claims independently reproduced with no discrepancies. Two non-blocking notes are raised for the record — a duplicated-reduction maintenance-drift risk (no drift found today) and a real, unbounded performance-scaling characteristic — both relevant only once/if this function is ever wired into a live path, which it explicitly is not in this slice.

## 1. Reuse claim — CONFIRMED

Read `src/control/overlap-policy.mjs` in full. `forecastCollision` imports only `evaluateOverlap` and `OVERLAP_ORDER`, unmodified. Its own source (`src/control/integration-collision-forecast.mjs`) contains no path-containment logic, no O-ladder logic, and no doctrine-string logic — `classify()`, `writeSetsOverlap()`, `OVERLAP_CLASSES` all live exclusively in `overlap-policy.mjs` and are never re-expressed. Every `overlap` field returned to a caller is `evaluateOverlap`'s own frozen result object, threaded through verbatim (confirmed by reading the code, not just the producer's assertion). Delegation is genuine, not reimplementation.

## 2. Byte-identity claim — CONFIRMED independently

Recomputed `git hash-object` for all 5 cited read-only files, branch tip vs. base `66a5951`:

| File | Match |
|---|---|
| `src/control/overlap-policy.mjs` | YES |
| `src/control/write-set-policy.mjs` | YES |
| `src/ledger/integration-queue-ledger.mjs` | YES |
| `src/ledger/durable-ledger.mjs` | YES |
| `contracts/integration-queue-entry.schema.json` | YES |

`git diff --stat 66a5951 1d200ed` confirms only 5 files touched total: `MANIFEST.json` (append), this slice's own producer-verification doc, `module-completion-tracker-001.md` (append-only line), the new source file, and the new test file. No existing file modified.

## 3. Logic-drift risk between the local reduction and the ledger's own — NO DRIFT FOUND TODAY, but a real disclosed risk

`forecastCollision`'s `currentlyQueuedPayloads()` re-expresses, locally, the same two-step "highest-version-per-`queue_entry_id`, active-status-only" reduction that `IntegrationQueueLedger`'s private `latestByEntryId()` + `ACTIVE_STATUSES` already perform (`src/ledger/integration-queue-ledger.mjs` lines 84, 158–168, 302–307). This is disclosed by the producer as an intentional, non-imported duplication (to keep the ledger file byte-identical).

I built an independent oracle mirroring the ledger's own algorithm exactly and ran it against `forecastCollision`'s derived "currently queued" set (via `comparisons[].candidateBranch`, using a disjoint candidate write set so nothing collides) across:
- out-of-order version arrays (v2 appearing before v1)
- a terminal (MERGED) entry with an older, stray SUBMITTED version appearing later in array order
- multiple `queue_entry_id`s interleaved with scattered, non-contiguous versions, mixing terminal and active statuses
- a duplicate-version tie for the same `queue_entry_id`
- two randomized fuzz runs (n=200, n=500) with random ordering, random ids, random statuses

All cases: **identical result** between the ledger's own reduction algorithm and `forecastCollision`'s local one. No drift today.

**Note (non-blocking):** this is still a maintenance-drift risk by construction — nothing currently guards against the two independent reductions diverging if, e.g., `ACTIVE_STATUSES` gains a third status in the ledger, or the version-comparison semantics change there, without a matching update here. Unlike the byte-identity guard (which pins unmodified files), there is no test today that would fail if this specific behavioral parity broke. **Recommendation:** before or alongside any future wiring of this forecast into a live path, add either (a) a parity test analogous to the byte-identity guard that asserts `currentlyQueuedPayloads`'s output agrees with `IntegrationQueueLedger.resolveActiveClaim`-style behavior across a shared fixture, or (b) export the reduction from the ledger for reuse. Not a blocker for this slice, since the function is unwired and the duplication is honestly disclosed.

## 4. O0/O2-only scope limitation — CONFIRMED ACCURATE, verified structurally and empirically

`forecastCollision` always calls `evaluateOverlap` with `sameModule: false, sameSymbol: false, protectedBranch: false, globalConfig: false`. Given `overlap-policy.mjs`'s `classify()`:

```js
if (protectedBranch) return "O5";
if (globalConfig) return "O4";
if (sameSymbol) return "O3";
if (filesOverlap) return "O2";
if (sameModule) return "O1";
return "O0";
```

with all four boolean dimensions forced false, only `filesOverlap` can vary the result — so `forecastCollision` can structurally never return anything but O0 or O2. This is a proof, not merely a today-observed behavior.

I confirmed it empirically for every excluded class: for a candidate/existing pair with non-overlapping paths, I called `evaluateOverlap` directly with `sameModule: true` (hypothetical O1 richer context), `sameSymbol: true` (O3), `globalConfig: true` (O4), and `protectedBranch: true` (O5) — each correctly returns the respective O1/O3/O4/O5 class when the metadata IS supplied. Then I ran the identical path pair through `forecastCollision` (metadata NOT available, as in the real ledger contract) — it returns `O0`, `collides: false` every time. It never silently misclassifies a would-be O1/O3/O4/O5 pair as a false "collision" at the wrong class, and never fabricates a value for the missing dimensions — it degrades safely and honestly to "no signal available" (O0), exactly as disclosed.

## 5. Performance / DoS angle — REAL CONCERN, not a blocker for this unwired slice

`forecastCollision` is `O(n)` in `records.length` (single pass to build the latest-version map) plus `O(m × |candidateWriteSet| × |declared_write_set|)` where `m` is the number of currently-active queued entries — because `evaluateOverlap`'s `writeSetsOverlap` does a nested `some`/`some` over both write sets per comparison, and each pairwise path check re-invokes `evaluateWriteSet` (string canonicalization, regex, case-folding) rather than being O(1).

Benchmarked directly in this worktree (synchronous, single-threaded, no other load):

| Active entries | Write-set size (candidate & each entry) | Wall time |
|---|---|---|
| 100 | 5 | 66 ms |
| 1,000 | 5 | 167 ms |
| 5,000 | 5 | 480 ms |
| 10,000 | 5 | 831 ms |
| 1,000 | 50 | **8.1 s** |
| 5,000 | 50 | **46.1 s** |

At small, realistic write-set sizes the scaling is unremarkable (sub-second even at 10,000 queued entries). But because the cost is multiplicative in write-set size on both sides, a moderately busy queue (a few thousand active entries) combined with realistic multi-file work-package write sets (tens of files) already produces multi-second-to-tens-of-seconds synchronous blocking calls — and this is a single-threaded call that would stall the whole Node process if ever invoked on a live request path. This is a different mechanism from the MOD-LIVE-S3 bug (that was an unbounded `Math.min`/`Math.max` spread and array-fill; this is a nested-loop multiplicative cost with no ceiling), but the same class of risk: an attacker or a simply busy system could drive this into multi-second-plus latency with no error, no bound, and no warning — it always returns `ok: true` eventually, it just gets slow.

**Not a blocker for this slice** — the function is genuinely unwired (confirmed: no importer anywhere in `src/`), so there is no live blast radius today. **Recommendation:** before any future wiring decision, add an explicit bound (a cap on `records.length` and/or write-set sizes considered, analogous to `MAX_SEQUENCE_GAP_SPAN` in the MOD-LIVE-S3 fix) or document an operational ceiling the caller must enforce, so this doesn't become a live-path DoS vector later.

## 6. Test suite — CONFIRMED independently

- New suite standalone (`node --test tests/integration-collision-forecast.test.mjs`): **17/17 pass**, reproduced exactly.
- Full suite (`npm test`), this worktree: **1147 tests / 1142 pass / 0 fail / 5 skip / 0 todo** — matches the producer's claimed count exactly.

## 7. Hardcoded test-ID branching — NONE FOUND

`grep`'d `src/control/integration-collision-forecast.mjs` for `queue_entry_id ===`, `candidate_branch ===`, and literal `iq_`-prefixed string comparisons: no matches. The only occurrences of such literals are in the test fixture file, as expected.

## 8. Scope discipline — CONFIRMED

- Not called from `IntegrationQueueLedger#appendEntry`'s `preWriteCheck` or anywhere else (grep across `src/` and `tests/` for `forecastCollision`: only the new file and its own test).
- No new import added into any existing service.
- No new ledger, schema, or contract.

## 9. Advisory status fields

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: candidate
risk_class: low
self_certification:
  agent_id: claude-rev-sec-modintegqueue-s2
  peer_agent_id: claude-motor-modintegqueue-s2
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Recommend improvements only. Do not execute them. This review is advisory: local commit only, no push, no merge, no operator ratification. The two notes above (§3 drift-guard, §5 performance bound) are recommended as pre-wiring work, not as blockers to accepting this slice as unwired candidate preparation.
