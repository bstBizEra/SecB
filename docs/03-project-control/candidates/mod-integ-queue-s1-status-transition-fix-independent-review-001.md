# MOD-INTEG Slice S1 — Status-Transition Validity Fix — Independent Review

**Record ID:** mod-integ-queue-s1-status-transition-fix-independent-review-001
**Status:** ADVISORY — NOT EFFECTIVE (no merge/execution authority)
**Reviewer:** BST-SA REV/SEC (Claude Sonnet 5), independent worker role — advisory only, no approving authority
**Date:** 2026-07-21
**Branch reviewed:** `bst/mod-integ-queue-s1-ledger` @ `e7b2be3` (fix commit), parent `33a9813` (this reviewer's own prior independent-review commit)
**Reviews:** `docs/03-project-control/candidates/mod-integ-queue-s1-status-transition-fix-producer-verification-001.md`
**Isolation:** reviewed in the existing worktree `.claude/worktrees/mod-integ-queue-s1-ledger` (already checked out at `e7b2be3`); live branch/main untouched; no merge, no push performed or proposed.

## Verdict

**APPROVE_FOR_MERGE**

The fix does what it claims, closes both gaps this reviewer disclosed in the prior review, holds up under a real cross-process concurrency probe, and fails closed on every adversarial angle tried. One documentation-only note below (not blocking).

## 1. Diff review

`git diff 33a9813 e7b2be3` touches exactly two source-relevant files, matching the producer's disclosed scope:

- `src/ledger/integration-queue-ledger.mjs`: adds `VALID_STATUS_TRANSITIONS` (module-level, `{SUBMITTED: {SUBMITTED, IN_REVIEW}, IN_REVIEW: {IN_REVIEW, MERGED, REJECTED}}`) and a new private method `#detectInvalidStatusTransition(entry, records)`, called from **inside** the same `preWriteCheck` callback passed to `this.append(...)` in `appendEntry`, immediately before the pre-existing `#detectDuplicateClaim` call, against the same `records` parameter. Confirmed by direct read: no second call site, no second lock, no independent `this.read()` anywhere in the new code. The claim that this is one atomic gate, not two differently-timed checks, is verified true.
- `tests/integration-queue-ledger.test.mjs`: 8 new tests plus 2 pre-existing tests repaired at their *setup* only (routing through `IN_REVIEW` before reaching a terminal status, since a direct `SUBMITTED -> REJECTED`/version-1-`IN_REVIEW` skip is now itself correctly denied). Read both diffs in full; the repaired tests' actual assertions (resubmission under a new id; duplicate-claim-while-IN_REVIEW) are unchanged, only setup was extended.
- `docs/.../module-completion-tracker-001.md`: one new append-only log line. No overwrite of prior lines.

`#detectInvalidStatusTransition` reduces `records` via the same `latestByEntryId` helper `#detectDuplicateClaim` and `resolveActiveClaim` already use (confirmed by reading the single shared function, not a duplicated/divergent reimplementation), keyed to the CURRENT (highest-version) record for this entry's own `queue_entry_id`. No prior version → only `SUBMITTED` legal. Otherwise looks up `VALID_STATUS_TRANSITIONS[fromStatus]`; `MERGED`/`REJECTED` have no key in that table, so `allowed` is `undefined` and the transition is denied unconditionally — terminal is enforced by the table's *absence* of an entry, not a separate `if (terminal)` branch, which is a robust way to make "terminal forever" the default rather than something that has to be remembered at each call site.

## 2. Fresh-script reproduction of the producer's two scenarios

Wrote an independent script (not the producer's test file) importing the ledger directly:

- **Scenario (a)** — `appendEntry({ queue_entry_id: "iq_rev_001", version: 1, status: "MERGED" }, ...)` as the very first append: `ok: false`, `code: DENY_INVALID_STATUS_TRANSITION`, `fromStatus: null`, nothing persisted (`ledger.verify().count === 0`). **Confirmed denied.**
- **Scenario (b)** — `SUBMITTED -> IN_REVIEW -> MERGED`, then a 4th version claiming `SUBMITTED` under the same `queue_entry_id`: `ok: false`, `code: DENY_INVALID_STATUS_TRANSITION`, `fromStatus: "MERGED"`. Also independently ran the `REJECTED`-terminal variant: same result, `fromStatus: "REJECTED"`. **Confirmed denied**, both terminal statuses.

All 9 independent checks (see §4 for the other 5) passed on first run, matching the producer's claim exactly.

## 3. Concurrency — real cross-process race, not reasoning

Built two actual OS child processes (`node:child_process.spawn`, not `Promise.all` over synchronous in-process calls, which would never actually interleave given this ledger's fully synchronous critical section) racing to extend the SAME baseline (`queue_entry_id` at `IN_REVIEW`, sequence 2) with the SAME `expectedSequence: 2`: process A appends `v3 MERGED`, process B appends `v4 REJECTED`, both released from a shared file-based barrier as close together as achievable. Ran **15 trials**, fresh temp ledger file per trial, both processes hitting the identical file path concurrently.

Result across all 15 trials: **exactly one process succeeded every time**, the other always failed — either `LEDGER_BUSY` (lost the `mkdirSync` lock race, thrown before ever reading `records`) or `DENY_SEQUENCE_CONFLICT` (acquired the lock after the winner released it, re-read fresh `records` showing sequence 3, and its own `expectedSequence: 2` no longer matched). Zero trials produced both-succeeded, zero trials produced neither-succeeded, and in every trial the final ledger file passed `verify()` (`valid: true`) with no invalid pair (`v3 MERGED` + `v4 REJECTED` coexisting) ever landing. This is because `DurableLedger.append`'s critical section (`mkdirSync` lock acquisition through `rmSync` release) is fully synchronous with no `await` points, and the lock itself is an OS-level `mkdirSync`/`EEXIST` primitive that works across processes, not an in-process mutex — so there is no window where two writers can both read a pre-transition `records` snapshot and both write. **No concurrency gap found.**

## 4. Stale-version-consulted / malformed-status / retreat / reaffirmation probes

- **Non-monotonic version numbers**: appended `v1 SUBMITTED, v2 IN_REVIEW, v10 MERGED` (deliberately skipping ahead), then attempted `v3 REJECTED` (a lower, unused version number, appended last). `latestByEntryId` correctly resolved the CURRENT state as `v10 MERGED` (highest version number, not append order, not numeric-gap-fill logic), and denied with `fromStatus: "MERGED"`. Gaming version numbers backward cannot smuggle a transition past a terminal state — the reduction is by version-number magnitude only, exactly as documented. **No stale-version-consulted gap found.**
- **Malformed/unrecognized prior status**: the schema (`contracts/integration-queue-entry.schema.json`) enum-restricts `status` to exactly `SUBMITTED|IN_REVIEW|MERGED|REJECTED`, and `validateContract` runs on every `appendEntry` call, so this cannot arise through the normal API. To test the gate's *own* fail-closed behavior in isolation (defense in depth against e.g. a future schema relaxation, or a hand-tampered-then-correctly-rehashed file), hand-crafted a valid hash-chained ledger record with `status: "WEIRD_UNRECOGNIZED_STATUS"`, bypassing `appendEntry`/`validateContract` entirely, confirmed it passes `ledger.verify()` (isolating that this tests the transition gate and not `LEDGER_INTEGRITY_FAILURE`), then attempted a version-2 append. Result: denied, `fromStatus: "WEIRD_UNRECOGNIZED_STATUS"` — `VALID_STATUS_TRANSITIONS[fromStatus]` is `undefined` for any value outside the two known active keys, and `undefined && ...` short-circuits to falsy, so the code **fails closed** rather than silently defaulting to permissive. **No default-allow gap found.**
- **IN_REVIEW → SUBMITTED (retreat)**: not explicitly named in the producer's own regression tests (only the terminal→SUBMITTED case is). Independently verified: `SUBMITTED -> IN_REVIEW`, then a 3rd version claiming `SUBMITTED`: denied, `fromStatus: "IN_REVIEW"`, `toStatus: "SUBMITTED"`. This is **correct, intentional behavior, not an oversight** — the fix's whole premise is "no backward walk," and the documented state table only ever lists forward-or-stay transitions from `IN_REVIEW` (`IN_REVIEW|MERGED|REJECTED`), never `SUBMITTED`. Denying this is consistent with the rest of the design and with the real-world lifecycle (a candidate under review does not un-submit itself back to pre-review). Recommend the producer's own regression suite add an explicit test for this case even though the behavior is already correct — it is presently verified only by this independent review's script, not by anything that runs in CI.
- **Same-status reaffirmation**: `SUBMITTED -> SUBMITTED` and `IN_REVIEW -> IN_REVIEW` version bumps both succeed (matches producer's test and the documented "stay" semantics — this looks like it exists to let a resubmission update mutable metadata such as `content_hash`/`declared_write_set` without a status change). `MERGED -> MERGED` reaffirmation is denied (matches producer's test) — terminal means no further version at all, not even a same-status one. Both match the producer's stated intent and this reviewer's independent script confirms the code does what the producer's own tests already assert; no discrepancy found.

## 5. Test suite — independently reproduced

Ran in this same isolated worktree, no producer artifacts reused:

| | tests | pass | fail | skipped |
|---|---|---|---|---|
| `npm test` (full suite) | 1130 | 1125 | 0 | 5 |
| `node --test tests/integration-queue-ledger.test.mjs` (standalone) | 32 | 32 | 0 | 0 |

Both counts match the producer's claim exactly. `node tools/validate-foundation.mjs` → top-level `"status": "PASS"`, exit code `0`, 747/747 checks PASS, 0 FAIL — independently confirmed via direct run, not taken from the producer's record.

## 6. Hardcoded test-ID branching

`grep -rniE "test-id|testId|TEST_ID|__TEST__" src/ledger/integration-queue-ledger.mjs contracts/integration-queue-entry.schema.json` → zero matches (grep exit code 1). Broadened the search to `queue_entry_id ===` literal-equality sites in the ledger source: two matches, both legitimate business logic (`#detectDuplicateClaim`'s "different id" exclusion, `resolveEntry`'s lookup filter), neither a special-cased literal ID. **No hardcoded test-ID branching found**, confirming the producer's claim independently rather than deferring to it.

## 7. Scope discipline

Confirmed by the byte-identity guard test (`byte-identity: all OTHER contract schemas and sibling ledgers unchanged vs 385ac65`, passing) and by direct diff review: no schema change, no `MANIFEST.json` change, no `tools/validate-foundation.mjs` change, `src/ledger/durable-ledger.mjs` untouched, no other ledger touched, no service/gateway wiring added. The "not imported by any service/gateway" test still passes — still PURE + UNWIRED.

## Status fields

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: existing
risk_class: low
self_certification:
  agent_id: claude-revsec
  peer_agent_id: claude-motor
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

## Disposition

This record carries no merge/execution authority. Committed via a separate detached-HEAD worktree + `git update-ref` targeting `refs/heads/bst/mod-integ-queue-s1-ledger` — no push, no merge, no operator ratification. Prepared for asynchronous GOV/operator ratification per this project's advise-and-proceed convention, alongside the producer's fix record.

## Provenance

- source: direct source read, fresh independent reproduction script (not the producer's test file), a real 15-trial cross-process concurrency probe (`node:child_process.spawn`, OS-level file lock contention), `npm test` and `node --test tests/integration-queue-ledger.test.mjs` run directly in this isolated worktree, `node tools/validate-foundation.mjs` run directly
- agent_id: claude-revsec (BST-SA REV/SEC, Claude Sonnet 5)
- timestamp: 2026-07-21
- disposition: advisory, non-main branch, local commit only, no push, no merge, no operator ratification
