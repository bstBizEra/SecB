# MOD-RUNTIME S1 — Checkpoint Ordering Fix Producer Self-Verification Record

**Record ID:** mod-runtime-s1-checkpoint-ordering-fix-producer-verification-001
**Status:** DRAFT / ADVISORY — NOT EFFECTIVE (local commit only, not pushed, not merged)
**Producer:** claude-motor (BST-SA Motor agent), operating under AMD-002 rev 2 (advise-and-proceed)
**Date:** 2026-07-21
**Branch:** `bst/mod-runtime-s1-checkpoint-ordering-fix-001`
**Base:** `origin/main` @ `a67169b149f0887090e15cd7124681e58858010d` (verified via `git rev-parse origin/main` at dispatch time)
**Worktree:** `C:/Users/ounkh/SecB-worktrees/mod-runtime-s1-checkpoint-ordering-fix-001` (isolated, new)
**Target file:** `src/ledger/checkpoint-ledger.mjs` (`resolveLatest`, `appendCheckpoint`)
**Companion tests:** `tests/checkpoint-ledger.test.mjs` (7 new regression tests appended), `tests/conformance-p0-18-candidate.test.mjs` and `tests/conformance-v016-drift.test.mjs` (byte-identity guards re-pinned — see "Disclosed scope-discipline update" below)

**Cited finding:** §1 (REQUEST_CHANGES, primary finding) and §2 (advisory, non-blocking) of
`mod-runtime-s1-checkpoint-ledger-second-independent-review-001.md` (reviewer
`claude-immune-secondrev-modruntime-s1`, committed to ref
`refs/candidates/mod-runtime-s1-checkpoint-ledger-second-independent-review-001` @ commit
`d4f5c50`; review target was `origin/main` @ `a67169b`, i.e. this branch's own base —
`CheckpointLedger` and `checkpoint-drift-comparator.mjs` already merged).

---

## Root cause

`resolveLatest(sessionId)` selected the checkpoint with the highest `record.sequence` —
`DurableLedger`'s own **ledger-append-order** counter (`durable-ledger.mjs:178`,
`sequence = records.length + 1`) — rather than the highest `sequence_at_checkpoint`, the
checkpoint's own **content-order** field encoding how far the checkpointed session had
actually progressed in its source ledger. The two fields happen to move together only if
checkpoints for a session are always appended in increasing `sequence_at_checkpoint` order,
and nothing enforced that: `appendCheckpoint` delegated straight to `this.append(...)` with
only `expectedSequence` (ledger-position OCC) — no `preWriteCheck`, no monotonicity gate, no
state-dependent invariant of any kind on the checkpoint's own content.

Confirmed pre-fix reproduction (this producer's own repro, independent of the reviewer's
deleted script): appending a checkpoint at `sequence_at_checkpoint: 10` then a second
checkpoint at `sequence_at_checkpoint: 3` for the **same** `session_id` succeeded, and
`resolveLatest` returned the second (regressed) checkpoint as "latest" — because it merely
had the higher ledger-append sequence (2 > 1). This is a genuine checkpoint/resume-integrity
bug: `checkpoint-drift-comparator.mjs`'s `evaluateResumeFromLedger` trusts `resolveLatest` as
ground truth for drift detection, and a silently-wrong "latest" checkpoint would feed it a
regressed resume point that its own fail-closed comparison logic (sound in isolation) has no
way to detect, since the defect is upstream of it.

The existing shipped test (`tests/checkpoint-ledger.test.mjs`, pre-fix) only ever appended
checkpoints for a session in increasing `sequence_at_checkpoint` order (1, then 5), so it
could never distinguish "highest ledger-append order" from "highest `sequence_at_checkpoint`"
— the two coincided in every shipped case, which is exactly why two prior reviews (each
checking a different, already-disclosed gap: unvalidated `source_ledger_id`; no live
source-ledger-head check) never caught this same-ledger content-vs-append-order confusion.

## Correction

### Resolve-side (§1, part 1)
`resolveLatest` now reduces over `entry.payload.sequence_at_checkpoint` (content order)
instead of `record.sequence` (ledger append order). This alone would have been sufficient to
answer "what is the content-order-latest checkpoint" correctly even against legacy/bypassed
ledger data.

### Write-side (§1, part 2 — the stronger fix, per the reviewer's own §6 recommendation)
`appendCheckpoint` now passes a `preWriteCheck` to the base `DurableLedger.append` — the
**same atomic, lock-held pattern** this project has used for every other state-dependent
write-time gate this session (`WorkspaceLeaseLedger`'s single-writer check, and this
session's own MOD-WSPACE-S3 / MOD-INTEG-queue / MOD-SKILL-S2 work): evaluated against the
`records` snapshot `DurableLedger.append` already read and verified inside its own lock for
this exact write, never a separate unlocked `read()` (which would reintroduce the TOCTOU
shape mod-wspace-s3 fixed). The gate denies (throws `LedgerError` with code
**`DENY_CHECKPOINT_REGRESSION`**) a new checkpoint whose `sequence_at_checkpoint` is not
strictly greater than the current highest `sequence_at_checkpoint` already recorded for the
same `(session_id, source_ledger_id)` pair.

**Why throw rather than return a resolve-style `{ checkpoint, code }` veto value:** every
other write-time denial in this file/class (`DENY_MISSING_ENTRY_FIELDS` in
`appendCheckpoint`, and `DENY_SEQUENCE_CONFLICT` / `DENY_DUPLICATE_ENTRY_ID` /
`DENY_IDEMPOTENCY_CONFLICT` / `LEDGER_BUSY` inherited from the base class) is a thrown
`LedgerError`, never a returned deny object — the `{ checkpoint, code }` shape belongs to
`resolveLatest`/`resolveCheckpoint`'s READ-side fail-closed lookups. Throwing keeps
`appendCheckpoint`'s return type consistent (always either the append record, or a thrown
error) rather than introducing a second, inconsistent failure shape on the write path.

**Why scoped to `(session_id, source_ledger_id)`, not `session_id` alone:** `source_ledger_id`
names which OTHER ledger's position `sequence_at_checkpoint` is measured against. Collapsing
two different source ledgers' progress counters into one monotonic sequence for the same
session would be a category error (comparing unrelated counters), not a stronger check.
Verified with a dedicated regression test that a lower `sequence_at_checkpoint` against a
*different* `source_ledger_id` for the same session is correctly NOT treated as a regression.

**Why reject outright rather than designing an explicit rollback-checkpoint exception:**
searched for any existing rollback/revert-checkpoint concept in this codebase —
`grep -rin "rollback\|revert" src/ledger/checkpoint-ledger.mjs contracts/checkpoint.schema.json`
returns nothing, and the schema only constrains `sequence_at_checkpoint` to a plain
non-negative integer with no kind/flag distinguishing a legitimate regression from a mistaken
or hostile one. There is no legitimate reason, evidenced anywhere in this slice's design or
its own doc comments (which explicitly scope this as a lookup/existence primitive, not a
restore-execution service), for a lower-sequence checkpoint to ever need to be appended for
the same `(session_id, source_ledger_id)` pair today. Rejecting regression outright is
therefore the correct, non-speculative fix for what this slice actually models; inventing a
rollback-allowed exception without a concrete consumer or contract field to express it would
be guessing at a design this project has not yet made. If a genuine rollback/supersede
concept is ever needed, it should be a new, explicit contract field (e.g. an
`is_rollback`/`supersedes_checkpoint_id` flag) and a corresponding gate carve-out — not
inferred here.

### `actor_id` continuity (§2, advisory — fixed, not deferred)
Analogous to `goal-graph-service.mjs`'s `producerActorId` immutability fix
(`bst/mod-work-sod-version-spoof-fix-001`): `actor_id` is now bound to a session's
**first-ever-appended** checkpoint (by ledger append order, i.e. first call-order — matching
the MOD-WORK fix's own fast-follow clarification that the pin is on first-call-order, not a
version-number concept). A later checkpoint for the same `session_id` supplying a different
`actor_id` is denied (`DENY_ACTOR_ID_IMMUTABLE`), evaluated in the same `preWriteCheck`. This
was cheap to add (a second, independent check inside the same atomic hook, no new I/O, no new
lock) and consistent with this project's established convention that identity-continuity
facts are denied via a named code the instant a violation is attempted, never silently
absorbed. Unlike the `producerActorId` case there is no legitimate "re-version with changed
content but same producer" concept to carve out here — a checkpoint's `actor_id` has no
analogous legitimate-mutation reason — so a flat pin (no exception carve-out needed) is
sufficient. This closes the gap rather than deferring it, since — unlike the reviewer's
disclosed reasoning for calling it non-blocking today (no live consumer reads `actor_id`
yet) — the fix costs nothing extra given the write-side gate was already being added for §1,
and closing it now avoids leaving a footgun for the exact future actor-scoped consumer the
reviewer named as the reason to fix it eventually.

## Verification

### Pre-fix reproduction (reviewer's exact scenario, reproduced by this producer before any change)
Ran the reviewer's exact sequence against the pre-fix module in this worktree (via
`git stash` to temporarily revert to the unmodified base, then restored): appending
`sequence_at_checkpoint: 10` then `sequence_at_checkpoint: 3` for the identical `session_id`
succeeded on both appends, and `resolveLatest` returned the `sequence_at_checkpoint: 3`
checkpoint as latest (ledger-append sequence 2 > 1). **Reproduced.**

### Post-fix reproduction (same sequence, re-run against the fixed module)
- The regressed second append (`sequence_at_checkpoint: 3` after `10`, same session, same
  source ledger) now throws `LedgerError` with code `DENY_CHECKPOINT_REGRESSION` and is
  **not persisted** (`ledger.verify().count` stays 1).
- `resolveLatest` on the un-regressed ledger state correctly returns the
  `sequence_at_checkpoint: 10` checkpoint.
- Independently, `resolveLatest`'s read-side fix was verified against a ledger state the
  fixed write-side gate would now refuse to create (constructed by calling the inherited
  base `DurableLedger.append` directly, bypassing `appendCheckpoint`'s `preWriteCheck` —
  the same technique `durable-ledger.test.mjs`'s own `genericEntry` helper uses to exercise
  the base class directly): even with `sequence_at_checkpoint: 10` at ledger-append-order 1
  and `sequence_at_checkpoint: 3` at ledger-append-order 2, `resolveLatest` still resolves
  the append-order-1 record (`sequence_at_checkpoint: 10`) as latest — proving the resolve-side
  fix holds independently of the write-side gate, e.g. for any pre-fix legacy ledger data.

This exact scenario is committed as permanent regression tests:
`"appendCheckpoint denies the reviewer's exact reproduction: sequence_at_checkpoint 10 then 3
for the same session is rejected at write time"` and `"resolveLatest resolves by
sequence_at_checkpoint content order, independent of ledger append order, against a ledger
state the fixed write-side gate would now refuse to create..."` in
`tests/checkpoint-ledger.test.mjs`.

### Additional committed regression tests
- `"appendCheckpoint denies a checkpoint whose sequence_at_checkpoint merely repeats (not
  strictly greater than) the current latest"` — boundary condition (equal, not just lower).
- `"appendCheckpoint continues to accept a legitimate strictly-increasing sequence_at_checkpoint
  series exactly as before"` — the normal, legitimate lifecycle case continues to work
  unchanged (three checkpoints, increasing order, all succeed, `resolveLatest` picks the
  last).
- `"regression monotonicity is scoped per (session_id, source_ledger_id): a lower
  sequence_at_checkpoint on a DIFFERENT source ledger for the same session is not a
  regression"` — proves the scoping decision above.
- `"appendCheckpoint denies a checkpoint whose actor_id differs from the session's
  first-recorded checkpoint (reviewer's actor_HOSTILE scenario)"` — reproduces the
  reviewer's exact `actor_HOSTILE` construction from §2.
- `"appendCheckpoint accepts subsequent checkpoints for the same session when actor_id
  matches the first-recorded checkpoint"` — confirms the legitimate same-actor case is
  unaffected.

### Test counts

**Module suite (`tests/checkpoint-ledger.test.mjs`), `node --test`:**
| | tests | pass | fail |
|---|---|---|---|
| Before (base `origin/main` @ `a67169b`, pre-fix) | 12 | 12 | 0 |
| After (this branch, post-fix + 7 new) | 19 | 19 | 0 |

**Full repo suite (`node --test tests/*.test.mjs`), same `node_modules` (fresh `npm install`
in this new worktree), verified both ways in-place via `git stash` / `git stash pop`:**
| | tests | pass | fail | skipped |
|---|---|---|---|---|
| Before (base `origin/main` @ `a67169b`, this producer's own run, stashed to baseline) | 1149 | 1146 | 0 | 3 |
| After (this branch, post-fix + 7 new tests) | 1156 | 1153 | 0 | 3 |

Delta is exactly +7 tests, all passing, zero regressions anywhere in the pre-existing
baseline. The "before" count (1149/1146/0/3) also independently matches the reviewer's own
first-hand `npm test` run reported in §5 of the cited review, confirming no drift between
the review's baseline and this producer's own.

**`checkpoint-drift-comparator.mjs`'s own tests, specifically** (the real downstream
consumer named in the review as the reason this bug matters):
`node --test tests/conformance-v016-drift.test.mjs` — 10/10 pass, both before and after,
**unmodified test logic** (only that file's own byte-identity guard's pinned hash for
`checkpoint-ledger.mjs` was updated — see "Disclosed scope-discipline update" below; no
assertion in any V-016 drift test itself was touched). This confirms the drift comparator's
own conformance coverage is unaffected by this fix, as expected — the comparator was already
sound in isolation per the review; only its upstream input (`resolveLatest`) was wrong.

`node tools/validate-foundation.mjs`: exit 0, 0 FAIL entries (re-run post-fix in this
worktree).

### Hardcoded test-ID branching
`grep -in "test.*case|testcase|TEST_ID|caseId" src/ledger/checkpoint-ledger.mjs
src/control/checkpoint-drift-comparator.mjs` — **none found**. The fix branches only on
`sequence_at_checkpoint` numeric comparison and `actor_id` string-equality against
already-recorded ledger content — universal comparisons, not test fixture or
caller-identity special-cases.

### Scope check
`git diff --numstat` against this branch's base: `src/ledger/checkpoint-ledger.mjs`
(+112/-6 lines: the `preWriteCheck`-based write-side gate, the resolve-side content-order
fix, and header documentation — no existing passing behavior altered for the legitimate
increasing-order case), `tests/checkpoint-ledger.test.mjs` (+163/-0 lines, purely additive
regression tests plus a helper), `tests/conformance-p0-18-candidate.test.mjs` (+12/-1) and
`tests/conformance-v016-drift.test.mjs` (+17/-1) (byte-identity guard re-pins only — see
below). No other file touched.

### Disclosed scope-discipline update: byte-identity guards in `conformance-v016-drift.test.mjs` and `conformance-p0-18-candidate.test.mjs`
Both files' `PINNED_BLOBS` guards asserted `src/ledger/checkpoint-ledger.mjs` remains
byte-identical to its blob hash at main @ `ec5aa76` / `4abfff2` respectively — scope-discipline
checks that those (unrelated, already-merged) prior candidates left this file untouched.
Since this branch **deliberately** modifies `checkpoint-ledger.mjs` for this disclosed,
security/integrity-motivated reason, both guards were re-pinned to this branch's post-fix
blob hash (`c072a6207e2fa409a498429be76d95df4f363cf7`), with an explicit comment attributing
the divergence to this fix and naming what changed — mirroring the precedent set by
`bst/mod-work-sod-version-spoof-fix-001`'s disclosed update to
`tests/approval-binding.test.mjs`'s analogous F4 guard. All four OTHER pinned blobs in each
guard (`durable-ledger.mjs`, `contract-validator.mjs`, `canonical-fingerprint.mjs`, and, in
the P0-18 candidate guard, `project-contract-service.mjs` / `access-mode-policy.mjs` /
`risk-registry.mjs` / `mcp-gateway-core.mjs`) remain unchanged and still pinned to their
original commits, proving this fix touched only its intended target primitive.

## Disposition of the `actor_id` continuity finding (§2)

**Fixed, not deferred** (see "Correction" above for reasoning): bound to the session's
first-appended checkpoint, denied via `DENY_ACTOR_ID_IMMUTABLE` in the same `preWriteCheck`
hook added for §1. No larger design decision was needed here — unlike MOD-WORK's
`producerActorId` fix, which had to carve out legitimate content/hierarchy/status mutation
across goal re-versions, a checkpoint's `actor_id` has no analogous legitimate-mutation
concept to preserve, so a flat pin fully closes the gap with no residual carve-out to
disclose.

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

The reviewer's primary finding (§1, `resolveLatest`'s append-order-vs-content-order
confusion, and the absent write-side monotonicity gate) is closed on both sides: the
reviewer's exact reproduction (`sequence_at_checkpoint: 10` then `3` for the same session)
is reproduced pre-fix and confirmed denied post-fix at write time, with `resolveLatest`
independently verified correct at read time against a ledger state the fix itself now
prevents from being created. The secondary finding (§2, `actor_id` continuity) is fixed
rather than deferred, at negligible incremental cost given the write-side gate was already
being added. `checkpoint-drift-comparator.mjs`'s own conformance tests pass unmodified,
confirming its downstream consumption of `resolveLatest`/`resolveCheckpoint` is now backed
by correct ground truth. This is a local commit on
`bst/mod-runtime-s1-checkpoint-ordering-fix-001`, based on current `origin/main` @
`a67169b`. Not pushed, no PR opened, no merge — per AMD-002 rev 2 advise-and-proceed, this
candidate is prepared and ready for asynchronous GOV ratification at operator merge review;
it carries no authority to self-declare complete or production.
