# MOD-INTEG Slice S2 — Collision-Forecast Producer Verification 001

**Record ID:** MOD-INTEG-QUEUE-S2-001 / mod-integ-queue-s2-collision-forecast-producer-verification-001
**Status:** DRAFT / ADVISORY — NOT EFFECTIVE
**Branch:** `bst/mod-integ-queue-s2-collision-forecast`, base `bst/mod-integ-queue-s1-ledger` @ `66a5951` (S1's independent-review-approved, status-transition-fixed tip; NOT `origin/main` directly, since S2 depends on S1's `IntegrationQueueLedger` and `declared_write_set` field)
**Author:** claude-motor-modintegqueue-s2 (BST-SA motor, producer)
**Date:** 2026-07-21
**Assessment reference:** `docs/03-project-control/candidates/mod-integ-queue-gap-assessment-001.md` §4 Slice S2 ("Collision-forecast wiring, pure and UNWIRED"), closing MI-3's consumption gap
**Governance frame:** AMD-002 rev 2 advise-and-proceed; bounded `src/**`/`tests/**`/`contracts/**` work on a non-`main` branch; no merge, no push, no self-declared production-readiness

---

## 1. What was built

- `src/control/integration-collision-forecast.mjs` — new, pure, unwired module exporting `forecastCollision(candidateWriteSet, records)`.
- `tests/integration-collision-forecast.test.mjs` — 17 new tests.
- `MANIFEST.json` — appended 3 new paths (this file's own two source/test files + this record). No existing MANIFEST entry removed or reordered.
- `docs/03-project-control/candidates/module-completion-tracker-001.md` — one append-only iteration-log line (see §6).

No existing file was modified. `IntegrationQueueLedger` (`src/ledger/integration-queue-ledger.mjs`), `DurableLedger` (`src/ledger/durable-ledger.mjs`), `overlap-policy.mjs`, `write-set-policy.mjs`, and the `integration-queue-entry.schema.json` contract are all read-only inputs to this slice, confirmed byte-identical to the S1 base (`66a5951`) by a dedicated guard test (§4).

## 2. Naming deviation from the assessment's own S2 sketch (disclosed)

The gap assessment's §4 Slice S2 sketch proposed file `src/control/integration-collision-check.mjs` and function `checkCollisionAgainstQueue(candidateEntry, activeEntries)`. This producer's dispatch instructions instead named the function `forecastCollision(candidateWriteSet, records)` explicitly, and framed the entire slice as "collision-forecast wiring" throughout. This record follows the dispatch instructions' naming (`integration-collision-forecast.mjs` / `forecastCollision`) as the more specific, more recent authority, and documents the earlier sketch name here so a future reader does not mistake the difference for an undisclosed deviation. The signature also differs from the sketch: `records` is the raw ledger record array (the same shape `IntegrationQueueLedger`'s own `preWriteCheck` hook receives), not a pre-filtered `activeEntries` list — per dispatch instructions, so the caller never has to do its own unlocked read/filter pass.

## 3. Design

`forecastCollision(candidateWriteSet, records)`:

1. Self-checks `candidateWriteSet` by calling `evaluateOverlap` against itself (`writeSetA: writeSetB: candidateWriteSet`) — the same "a well-formed set is a subset of itself" technique `overlap-policy.mjs`'s own internal `validateWriteSet` uses against `evaluateWriteSet`. A malformed/empty/traversal-violating candidate fails closed here with `overlap-policy.mjs`'s own deny code/message surfaced verbatim in `overlapDenial`, even when `records` is empty (an empty queue must never be mistaken for "candidate is valid").
2. Reduces `records` (an array of `{ entry: { payload: { queue_entry_id, version, status, declared_write_set, candidate_branch, ... } }, ... }`, exactly the shape `IntegrationQueueLedger`'s `preWriteCheck(records, entry)` hook and `ledger.read()` both produce) to the CURRENT (highest-version) payload per `queue_entry_id`, then keeps only `SUBMITTED`/`IN_REVIEW` ones. This is the same two-step "current state, active only" projection `IntegrationQueueLedger`'s private `latestByEntryId` + `#detectDuplicateClaim` already use — re-expressed locally (≈10 lines, no collision math) rather than imported, so this slice touches **zero bytes** of the already independently-reviewed S1 ledger file. "No new ledger" in the assessment's own S2 file list is read literally as "do not edit the ledger file at all."
3. For each currently-queued entry, calls `evaluateOverlap({ writeSetA: candidateWriteSet, writeSetB: entry.declared_write_set, sameModule: false, sameSymbol: false, protectedBranch: false, globalConfig: false })` — imported unmodified from `src/control/overlap-policy.mjs`.
4. Returns `{ ok: true, collides, mostRestrictiveClass, collisions, comparisons, errors }`, where every comparison carries `evaluateOverlap`'s own, unmodified result object under `.overlap` (never re-derived, renamed, or summarized), plus `queueEntryId`/`candidateBranch`/`status` for traceability. `mostRestrictiveClass` is computed via the imported `OVERLAP_ORDER` array, not a re-invented severity ranking.

**Non-derivable doctrine dimensions, disclosed, not fabricated:** `evaluateOverlap` requires `sameModule`/`sameSymbol`/`protectedBranch`/`globalConfig` as strict booleans. `IntegrationQueueLedger`'s `integrationQueueEntry` contract carries none of these — only `declared_write_set` (an array of canonical paths). `forecastCollision` therefore always answers all four `false`, which is the exact "O0 floor" convention `overlap-policy.mjs`'s **own** test suite already establishes (`tests/overlap-policy.test.mjs`'s `evalO` helper). Consequence, stated plainly: this forecast can only ever surface **O0** (no collision) or **O2** (file/path-level collision — the one dimension `declared_write_set` alone supports); it can never surface O1/O3/O4/O5, which require module/symbol/branch/config classification this ledger does not collect. This is a real, disclosed scope limit, verified by a dedicated test (`tests/integration-collision-forecast.test.mjs`, "scope limit: O1/O3/O4/O5 are unreachable...") that cross-checks the forecast's O0 result against a direct `evaluateOverlap` call using the identical forced-false frame. A future slice wanting full O-ladder fidelity would need to extend the queue-entry contract with that metadata first — a new, separately-governed decision, not invented here.

## 4. Confirmation: reuse, not reimplementation, of `overlap-policy.mjs`

- **Imports used, unmodified:** `evaluateOverlap` and `OVERLAP_ORDER` from `src/control/overlap-policy.mjs` (`import { evaluateOverlap, OVERLAP_ORDER } from "./overlap-policy.mjs";`). No other export of that module is used; none of its internals (`classify`, `writeSetsOverlap`, `snapshotArray`, `OVERLAP_CLASSES`) are re-implemented or copied.
- **No local collision math:** `integration-collision-forecast.mjs` contains zero path-containment logic, zero O-ladder logic, and zero doctrine-string logic of its own. Every `overlapClass`/`control`/`overlap` string a caller sees originates from `evaluateOverlap`'s own return value, threaded straight through.
- **Verified by test**, not just asserted: `tests/integration-collision-forecast.test.mjs` includes "each comparison's overlap field is byte-identical to a direct evaluateOverlap call with the same inputs" — `assert.deepEqual(result.comparisons[0].overlap, direct)` where `direct` is a hand-called `evaluateOverlap(...)` with matching arguments. This proves delegation is exact, not a lossy summary.
- **Byte-identity guard:** a dedicated test (`byte-identity: files read but not modified are unchanged vs base @ 66a5951`) `git hash-object`s `overlap-policy.mjs`, `write-set-policy.mjs`, `integration-queue-ledger.mjs`, `durable-ledger.mjs`, and the queue-entry schema against their blobs at the S1 base commit `66a5951` and asserts byte equality. All five pass.
- **Unwired confirmation:** a dedicated test (`IntegrationQueueLedger's own module source does not import forecastCollision or this new file`) reads `integration-queue-ledger.mjs`'s committed source via `git show HEAD:...` and asserts it contains neither `integration-collision-forecast` nor `forecastCollision`. A repo-wide grep (below) confirms the same.

```
$ grep -rl "forecastCollision" src/ tests/
src/control/integration-collision-forecast.mjs
tests/integration-collision-forecast.test.mjs
```

Only the new file and its own test import/define `forecastCollision`. No existing service (`IntegrationQueueLedger`, any gateway, any orchestrator) imports it.

## 5. Test results

- New suite standalone: `node --test tests/integration-collision-forecast.test.mjs` → **17/17 pass**, 0 fail.
  - No collision (disjoint write sets): 1 test.
  - Genuine collision at the reachable O-level (O2), both structural forms (exact-file match, prefix/dir-ancestor containment): 2 tests, plus the scope-limit disclosure test above.
  - Multiple simultaneous colliding entries (2 of 3 queued entries collide, 1 does not; most-restrictive class computed across all): 1 test.
  - MERGED/REJECTED (terminal) entries correctly excluded even when their declared write set overlaps the candidate, including a mixed old-terminal/new-active scenario on different branches: 3 tests.
  - Reuse-not-reimplementation byte-identity vs. direct `evaluateOverlap`: 1 test.
  - Fail-closed inputs (empty/malformed/traversal candidate write set; non-array `records`; hostile throwing-getter `records`): 5 tests.
  - Output frozen (house style): 1 test.
  - Unwired confirmation: 1 test.
  - Byte-identity guard over read-only inputs: 1 test.
- Full suite, this worktree, before this slice's files existed (S1 tip `66a5951`): **1130 tests, 1125 pass / 0 fail / 5 skip.**
- Full suite, after this slice: **1147 tests, 1142 pass / 0 fail / 5 skip** (+17 new, 0 regressions).
- `node tools/validate-foundation.mjs`: exit **0** both before and after (schema/manifest/doc-link checks unaffected — no new schema, no new ledger, `MANIFEST.json` only appended per the tool's own `manifest.file.<path>: exists` check, which does not require every file to be listed, only that every listed file exists).
- Grep for hardcoded test-ID branching in the new source file (`src/control/integration-collision-forecast.mjs`): none found (`queue_entry_id ===`, `candidate_branch ===`, literal `"iq_..."`/`'iq_...'` string comparisons all absent from source; those strings appear only in the test fixtures, as expected).

## 6. Scope discipline (forecast-only, not enforcement — explicitly deferred)

Per the dispatch instructions and the assessment's own §4 Slice S2 note and §5 non-goal #5:

- `forecastCollision` is **not called** from `IntegrationQueueLedger#appendEntry`'s `preWriteCheck` or from anywhere else. It vetoes nothing, blocks nothing, and mutates nothing — it is a pure function returning a result object.
- **No new import was added into any existing service.** `IntegrationQueueLedger`, `DurableLedger`, and every other existing consumer are unchanged (confirmed by the byte-identity guard, §4).
- **No new ledger, no new schema, no new contract** — this slice is exactly the file list the assessment's S2 sketch named ("new `src/control/integration-collision-check.mjs` [here: `integration-collision-forecast.mjs`]; new tests. No new ledger or schema").
- Wiring `forecastCollision(...)` into a real integration-queue orchestrator (a component the assessment explicitly notes does not yet exist) — whether as a hard deny, a warning surfaced to an operator, or any other enforcement posture — is out of scope for this slice and remains a separate, later, operator-gated decision, exactly as the assessment's §4 Slice S2 note and §5 non-goal #5 state.
- Merge simulation / composite verification (MI-4, the assessment's sketched Slice S3) and ordering/priority (MI-5) remain untouched and out of scope.

## 7. Advisory status fields

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: candidate
risk_class: low
self_certification:
  agent_id: claude-motor
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Recommend improvements only. Do not execute them. This slice is candidate preparation on a non-`main` branch: local commit only, no push, no merge, no operator ratification yet. Wiring `forecastCollision` into any live path is a separate, later, operator-gated decision.
