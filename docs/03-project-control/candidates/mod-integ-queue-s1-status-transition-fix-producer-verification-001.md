# MOD-INTEG Slice S1 — Status-Transition Validity Fix — Producer Verification

**Record ID:** mod-integ-queue-s1-status-transition-fix-producer-verification-001
**Status:** ADVISORY — NOT EFFECTIVE (no merge/execution authority)
**Producer:** BST-SA Motor (Claude Sonnet 5), advise-and-proceed per `AGENTS.md` SECB-AGENTS-AMD-002 (rev 2)
**Date:** 2026-07-21
**Branch:** `bst/mod-integ-queue-s1-ledger` @ base `33a9813` (independent review commit; also carries `19a6956`, the original producer commit)
**Closes:** the one real, disclosed, non-blocking gap in `docs/03-project-control/candidates/mod-integ-queue-s1-ledger-independent-review-001.md` §2/§4 (status-transition validity)

## Root cause

Neither `contracts/integration-queue-entry.schema.json` (a per-record JSON Schema, which cannot see prior versions of the same `queue_entry_id`) nor `IntegrationQueueLedger.appendEntry`/`#detectDuplicateClaim` (which only checked for a DIFFERENT `queue_entry_id` claiming the same `candidate_branch`) enforced any discipline on the sequence of `status` values a single `queue_entry_id` moves through across its versions. Concretely, before this fix:

- `appendEntry({ queue_entry_id: "q1", version: 1, status: "MERGED" }, ...)` as the very first append for `q1` succeeded (`ok: true`) — a caller could claim a merge that never went through review.
- After `v1 SUBMITTED → v2 IN_REVIEW → v3 MERGED`, `appendEntry({ queue_entry_id: "q1", version: 4, status: "SUBMITTED" }, ...)` also succeeded — a terminal entry could be walked backward to an active state under its own id.

Both were exactly the reviewer's independently-reproduced findings, disclosed as APPROVE_WITH_NOTES (non-blocking, not a named S1 requirement, but flagged for closure before any live consumer trusts `status` as tamper-evident proof of a merge/rejection decision).

## The fix — same atomic `preWriteCheck` gate, not a separate racy check

Added `#detectInvalidStatusTransition(entry, records)` to `src/ledger/integration-queue-ledger.mjs`, called from **inside the same `preWriteCheck` callback** that already runs `#detectDuplicateClaim` — both business-rule checks now execute back-to-back against the identical, locked, freshly-read-and-verified `records` snapshot `DurableLedger.append` hands to `preWriteCheck`. Neither check ever calls `this.read()` independently. This is the same shape the module already uses for the duplicate-claim gate, and the same shape the project adopted after MOD-WSPACE-S3 (see the module's own header comment): a second, differently-timed check reintroduces the exact TOCTOU class this ledger exists to close, so the new check was added into the existing gate rather than as a second call site, a second lock, or a check run before/after `append()`.

State machine enforced (keyed by the CURRENT — highest-version — record for the SAME `queue_entry_id`, computed via the ledger's existing `latestByEntryId` reduction, the same reduction `#detectDuplicateClaim` and `resolveActiveClaim` already use):

```
(no prior version)  -> SUBMITTED only               (version 1 must be SUBMITTED)
SUBMITTED            -> SUBMITTED | IN_REVIEW         (stay, or advance — no skip to MERGED/REJECTED)
IN_REVIEW             -> IN_REVIEW | MERGED | REJECTED (stay, or resolve)
MERGED / REJECTED     -> (nothing)                     (terminal, forever — any further version denied)
```

A true idempotent replay (identical `queue_entry_id`, `version`, AND `idempotencyKey`) is intercepted by `DurableLedger.append`'s own idempotency-key replay check **before** `preWriteCheck` is ever invoked, so it never reaches this new gate — nothing was duplicated here, per the task's own instruction.

Denial shape (new deny code, never a silent coercion):

```
{ ok: false, code: "DENY_INVALID_STATUS_TRANSITION", message, queueEntryId, fromStatus, toStatus }
```

`fromStatus` is `null` when there is no prior version (the version-1 case).

## Pre-existing test adjusted

One pre-existing test (`after MERGED/REJECTED, the same candidate_branch may be resubmitted under a NEW queue_entry_id`) had incidentally exercised a direct `SUBMITTED -> REJECTED` transition (skipping `IN_REVIEW`) as unrelated setup for its actual point (resubmission under a new id). That direct skip is itself now a denied transition under the fixed state machine, so the setup was updated to go through `IN_REVIEW` first — the test's actual assertion (resubmission under a new `queue_entry_id` succeeds) is unchanged. Likewise, `duplicate-claim gate also fires while the incumbent is IN_REVIEW` previously inserted `version: 1, status: "IN_REVIEW"` directly as its first append for that id; updated to reach `IN_REVIEW` via a legitimate `v1 SUBMITTED -> v2 IN_REVIEW` transition first. Both are extend/repair of test *setup* only, not weakenings of what either test actually verifies.

## New regression tests (`tests/integration-queue-ledger.test.mjs`)

- `appendEntry denies status: MERGED inserted directly as version 1 (reviewer scenario a)` — reproduces the reviewer's exact first repro; confirms `DENY_INVALID_STATUS_TRANSITION`, `fromStatus: null`, nothing persisted.
- `appendEntry denies version 1 inserted directly as REJECTED, or as IN_REVIEW` — extends scenario (a) to the other two non-SUBMITTED first-version cases.
- `appendEntry denies a terminal (MERGED) entry followed by any new version under the same queue_entry_id (reviewer scenario b)` — reproduces the reviewer's exact second repro (terminal walked backward to SUBMITTED), plus confirms a same-status MERGED "reaffirmation" is *also* denied (terminal means terminal regardless of claimed status).
- `appendEntry denies a terminal (REJECTED) entry followed by any new version under the same queue_entry_id` — same as above for the REJECTED terminal.
- `appendEntry denies SUBMITTED skipping directly to MERGED or REJECTED (must pass through IN_REVIEW)` — confirms the chain is strict, not just "no backward moves."
- `legitimate lifecycle paths still succeed: SUBMITTED -> IN_REVIEW -> MERGED and SUBMITTED -> IN_REVIEW -> REJECTED` — both required legitimate paths, verified via `resolveEntry`.
- `a new version re-affirming the SAME non-terminal status (stay) is a legal transition` — SUBMITTED→SUBMITTED and IN_REVIEW→IN_REVIEW version bumps still succeed.
- `idempotent re-append of the exact same version is unaffected by the new status-transition gate (base-class replay path)` — confirms the base class's own idempotency-key replay still works unmodified, and a legitimate transition still works immediately afterward.

## Test counts

| | tests | pass | fail | skipped |
|---|---|---|---|---|
| Full suite, before this fix (base `33a9813`) | 1122 | 1117 | 0 | 5 |
| Full suite, after this fix | 1130 | 1125 | 0 | 5 |
| `integration-queue-ledger.test.mjs` standalone, before | 24 | 24 | 0 | 0 |
| `integration-queue-ledger.test.mjs` standalone, after | 32 | 32 | 0 | 0 |

`node tools/validate-foundation.mjs` → top-level `"status": "PASS"`, exit code `0`, all 747 checks PASS (before and after — this fix touches no schema, no `MANIFEST.json`, no `validate-foundation.mjs` registration; it is a pure in-file logic addition to an already-registered ledger).

`grep -rniE "test-id|testId|TEST_ID|__TEST__" src/ledger/integration-queue-ledger.mjs contracts/integration-queue-entry.schema.json` → zero matches. No hardcoded test-ID branching introduced.

## Confirmation both reviewer-identified gaps are now closed

Both of the reviewer's own exact scenarios were independently reproduced by this producer, first confirmed still-succeeding against the pre-fix code (matching the reviewer's disclosure exactly), then confirmed denied post-fix:

1. **Direct `MERGED` insert as version 1** — pre-fix: `ok: true`. Post-fix: `ok: false`, `DENY_INVALID_STATUS_TRANSITION`. Closed.
2. **Terminal entry walked backward to `SUBMITTED` under the same `queue_entry_id`** — pre-fix: `ok: true`. Post-fix: `ok: false`, `DENY_INVALID_STATUS_TRANSITION`. Closed.

No other reviewer note (case/whitespace normalization of `candidate_branch`, the unreachable equal-version tie-break, version-number contiguity) was in scope for this fix and none was touched.

## Scope discipline

- Only `src/ledger/integration-queue-ledger.mjs` (logic) and `tests/integration-queue-ledger.test.mjs` (tests) were modified. No schema change, no `MANIFEST.json` change, no `tools/validate-foundation.mjs` change, no other ledger touched, no wiring into any service/gateway added.
- `DurableLedger` (`src/ledger/durable-ledger.mjs`) is untouched — the existing byte-identity guard test in the same test file (`byte-identity: all OTHER contract schemas and sibling ledgers unchanged vs 385ac65`) still passes, confirming this.
- Still PURE + UNWIRED: the existing "not imported by any service/gateway" test still passes unmodified.

## Status fields

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: existing
risk_class: low
self_certification:
  agent_id: claude-motor
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

## Disposition

This record carries no merge/execution authority. Local commit only on `bst/mod-integ-queue-s1-ledger`, no push, no merge, no operator ratification. Prepared for asynchronous GOV/operator ratification per this project's advise-and-proceed convention, alongside the original producer record and the independent review this fix responds to.

## Provenance

- source: direct implementation and first-hand test execution in the existing worktree `.claude/worktrees/mod-integ-queue-s1-ledger` (already checked out to this branch @ `33a9813`); full-suite and standalone runs via `npm test` / `node --test tests/integration-queue-ledger.test.mjs`; `node tools/validate-foundation.mjs` run directly
- agent_id: claude-motor (BST-SA Motor, Claude Sonnet 5)
- timestamp: 2026-07-21
- disposition: advisory, non-main branch, local commit only, no push, no merge, no operator ratification
