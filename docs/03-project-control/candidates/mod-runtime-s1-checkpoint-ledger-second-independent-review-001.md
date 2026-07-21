# MOD-RUNTIME S1 Checkpoint Ledger — Second Independent Review 001

**Record ID:** MOD-RUNTIME-000 / mod-runtime-s1-checkpoint-ledger-second-independent-review-001
**Status:** ADVISORY — SECOND INDEPENDENT REVIEW, NOT A MERGE DECISION
**Reviewer identity:** claude-immune-secondrev-modruntime-s1 (BST-SA Immune, independent of both the producer and the first reviewer)
**Reviewed:** `src/ledger/checkpoint-ledger.mjs` (`CheckpointLedger`, already merged to `main`) at `origin/main` @ `a67169b`, plus its one live-ish downstream consumer `src/control/checkpoint-drift-comparator.mjs` (P0-18, also merged) and `src/control/retry-policy.mjs` (S2, does not touch checkpoints)
**Prior review consulted, not trusted:** `mod-runtime-s1-checkpoint-ledger-independent-review-001.md` (verdict `APPROVE_FOR_MERGE`), `mod-runtime-s1-checkpoint-ledger-producer-verification-001.md`, `p0-18-v016-drift-candidate-001.md`, `p0-18-v016-drift-crossrev-001.md` (verdict `APPROVE_FOR_MERGE`)
**Method:** Independent `git worktree --detach` checkout at `origin/main` @ `a67169b`, own `node_modules`, no other agent session. Read `checkpoint-ledger.mjs` and `contracts/checkpoint.schema.json` in full, read `durable-ledger.mjs` in full for the locking/OCC/`preWriteCheck` mechanism, read both S1 review records and both P0-18 drift-comparator records in full. Built and ran an independent reproduction script (not present in any shipped test, deleted before this record was written) against the real `CheckpointLedger` class in a temp ledger.
**Date:** 2026-07-21

---

## Verdict: **REQUEST_CHANGES**

`CheckpointLedger` itself is well-built where the first review checked: hash-chain tamper detection, OCC, idempotency, and the fail-closed lookup shape all hold exactly as previously confirmed. But **`resolveLatest`'s definition of "latest" is wrong for its own stated purpose**, and this is a genuine, previously-unflagged checkpoint/resume-integrity bug, not a restatement of the already-disclosed `source_ledger_id` referential-integrity gap (S1 review §5) or the already-disclosed "no live source-ledger-head check" gap (P0-18 cross-review N2). Both prior reviews assessed adjacent-but-different questions and did not exercise this one. A fast-follow is warranted before any consumer is wired to trust `resolveLatest` for restore purposes — which, per the P0-18 candidate, is already designed to happen (`evaluateResumeFromLedger`).

---

## 1. The bug: "latest" means "most recently appended to this ledger," not "furthest session progress"

`resolveLatest(sessionId)` (`checkpoint-ledger.mjs:79-89`):

```js
const matches = this.read().filter((record) => record.entry.sessionId === sessionId);
...
const latest = matches.reduce((best, record) => (record.sequence > best.sequence ? record : best), matches[0]);
```

`record.sequence` is `DurableLedger`'s own **append-order** sequence number for *this* ledger (`durable-ledger.mjs:178`, `sequence = records.length + 1`) — it has nothing to do with `sequence_at_checkpoint`, the field that actually encodes how far along the checkpointed session had progressed in its *source* ledger (e.g. `EventLedger`) at the moment the checkpoint was taken. The two happen to move together only if checkpoints for a given session are always appended in increasing `sequence_at_checkpoint` order. **Nothing in `appendCheckpoint` enforces that.**

Confirmed by full read of `appendCheckpoint` (`checkpoint-ledger.mjs:53-59`): it calls `validateContract`, checks `idempotencyKey` presence, then delegates straight to `this.append(...)` with only `expectedSequence` (ledger-position OCC) — **no `preWriteCheck` is passed**. Contrast with `WorkspaceLeaseLedger`, which uses exactly this hook (`workspace-lease-ledger.mjs:154`) to enforce its own state-dependent invariant ("single writer per session") atomically inside the same lock. `CheckpointLedger` has **zero state-dependent gate on write** — not a monotonicity check, not a "must be later than the current latest for this session" check, nothing. The schema (`contracts/checkpoint.schema.json`) only constrains `sequence_at_checkpoint` to `{"type": "integer", "minimum": 0}` — any non-negative integer is accepted, in any order, for any session, at any time.

### Independent reproduction (built fresh against the real class, not a shipped test)

```
appended checkpoint1 (seq_at_checkpoint=10), ledger.sequence= 1
appended checkpoint2 (seq_at_checkpoint=3, DIFFERENT actor_id), ledger.sequence= 2
resolveLatest -> {
  "checkpoint": { "checkpoint_id": "chk_b", ..., "sequence_at_checkpoint": 3, "actor_id": "actor_HOSTILE", ... },
  "sequence": 2,
  "code": "ALLOW"
}
```

A checkpoint recording *less* session progress (`sequence_at_checkpoint: 3`), appended **after** one recording *more* progress (`sequence_at_checkpoint: 10`) for the identical `session_id`, is returned by `resolveLatest` as the resume point — because it merely has the higher ledger-append sequence. This is exactly the failure mode V-016 exists to prevent ("drifted checkpoint denied" / no silent revert), except it happens one layer earlier than V-016's own scope: the *drift comparator* (P0-18) can only ever compare an `observedState` against whatever `resolveLatest` hands it. If `resolveLatest` hands it the wrong (regressed) checkpoint, and the caller's `observedState` genuinely reflects that regressed state (e.g. a lagging worker resuming from its own stale in-memory snapshot, or a retried/out-of-order checkpoint write), the comparator will correctly and honestly report `{ ok: true, verified: true }` — verified *equality*, but against the wrong ground truth. The comparator's fail-closed guarantee (R1–R5 in the P0-18 cross-review) is real and does not fail; the input it is fed can be silently wrong.

**Why neither prior review caught this:** the S1 review's §5 finding is about `source_ledger_id` naming an unknown/nonexistent ledger or an out-of-range position relative to that ledger's *own* head — a cross-ledger referential check. The P0-18 cross-review's N2 is the same class of gap, restated for the comparator's scope ("no check against a live source ledger head"). Both are real and correctly disclosed as deferred. Neither addresses **ordering among multiple checkpoints already recorded in `CheckpointLedger` itself for the same session** — that is a same-ledger, same-field (`sequence_at_checkpoint` vs. append order) confusion, not a missing cross-ledger check, and the shipped test (`tests/checkpoint-ledger.test.mjs:82-109`, "resolveLatest returns the highest-sequence checkpoint for a session") only ever appends checkpoints for a session in increasing `sequence_at_checkpoint` order (`1`, then `5`), so it can never distinguish "highest ledger-append order" from "highest `sequence_at_checkpoint`" — the two happen to coincide in every shipped case.

This is not a concurrency/TOCTOU race in the classic sense — `DurableLedger.append`'s lock (`mkdirSync`-based mutual exclusion) and OCC (`expectedSequence`) fully serialize writes, so there is no window where two writers interleave unsafely. The bug is deterministic and structural: **the design conflates "the last thing written" with "the most advanced state,"** and nothing prevents a legitimately-serialized but logically out-of-order write from being accepted and later trusted as authoritative.

## 2. Secondary finding: no identity-continuity check on `actor_id` across checkpoints for one `session_id`

Same reproduction: the second checkpoint above carried `actor_id: "actor_HOSTILE"`, replacing the first checkpoint's `actor_id: "actor_A"`, for the identical `session_id`. `appendCheckpoint` performs no check that `actor_id` (or any other identity field) is stable across checkpoints sharing a `session_id` — `resolveLatest`/`resolveCheckpoint` just return whatever is in the resolved record's payload, unquestioned. This is the same *shape* as the MOD-WORK SoD-bypass class of finding: an identity field is stored per-record but never validated for continuity, so a later record can silently reassign it for an existing identity key.

**Severity assessment, not overstated:** unlike MOD-WORK, there is currently no live consumer anywhere that treats a checkpoint's `actor_id` as an authorization input — `grep -rn "checkpoint-ledger\|CheckpointLedger" src/` outside `checkpoint-ledger.mjs` and `checkpoint-drift-comparator.mjs` confirms the drift comparator (the only real consumer) never reads `actor_id` at all; its three-field comparison surface (`content_hash`, `sequence_at_checkpoint`↔`sequence`, `state_snapshot_ref`) excludes it entirely. So today this is a **latent** gap, not an active spoofing vector — but it should be closed before any future consumer (e.g. an approval-binding or actor-scoped restore gate) is built on the assumption that a resolved checkpoint's `actor_id` means anything trustworthy about session ownership.

## 3. What still holds — re-verified, not re-trusted

- **Tamper/hash-chain detection**: re-ran `tests/checkpoint-ledger.test.mjs` (12/12 pass) and independently confirmed via the base `#verifyRecords` read in full that `entryHash` covers the whole canonicalized entry including the nested payload — no field is excluded from tamper coverage. Genuine, matches the first review's finding.
- **OCC / idempotency / duplicate-entry-id / writer-lock**: all inherited unmodified from `DurableLedger.append`, confirmed by re-reading `durable-ledger.mjs` in full; behavior matches every other ledger subclass byte-for-byte.
- **Fail-closed lookup shape**: `resolveCheckpoint`/`resolveLatest` correctly return `{ checkpoint: null, code, reason }` on invalid/unknown input rather than a coerced default — no silent-fail-open found anywhere in this file. Malformed checkpoint payloads are rejected at `validateContract` (schema `additionalProperties: false`, closed enums/patterns) before ever reaching the ledger — fail-closed, not coerced.
- **`preWriteCheck` hook**: exists in the base class (added for `WorkspaceLeaseLedger`'s single-writer TOCTOU fix) but `CheckpointLedger` does not use it at all — confirmed this is not an oversight relative to some removed protection; `CheckpointLedger` never had a write-side gate, so there was nothing to weaken. The gap is an *absent* invariant, not a *regressed* one.
- **Registration points, V-016 stub disposition, `source_ledger_id` design**: unchanged since the first review; re-read, still accurate, not re-litigated here.
- **No hardcoded test-ID branching**: `grep -in "test.*case|testcase|TEST_ID|caseId"` across `checkpoint-ledger.mjs` and `checkpoint-drift-comparator.mjs` returns nothing.

## 4. Downstream consumers (S2 retry-policy, S3 approval-binding, P0-18 drift comparator)

- **S2 (`src/control/retry-policy.mjs`)**: does not reference `CheckpointLedger`, `resolveLatest`, or `resolveCheckpoint` anywhere (confirmed by grep and full read) — no cross-slice assumption to check.
- **S3 (approval-binding)**: producer-verification record confirms S3 "touches neither file" (`checkpoint-ledger.mjs`/`retry-policy.mjs`) — no cross-slice assumption to check.
- **P0-18 (`src/control/checkpoint-drift-comparator.mjs`)**: the actual downstream consumer of `resolveLatest`/`resolveCheckpoint`, via `evaluateResumeFromLedger`. Its own fail-closed comparison logic is sound (re-verified R1–R5 from the P0-18 cross-review hold on direct reading) — the defect described in §1 above is not in the comparator, it is upstream, in what `CheckpointLedger` hands the comparator as "the latest checkpoint." The comparator has zero consumers in `src/` today, so this is not yet a live exploitable path, but it is exactly the assumption a future restore-execution wiring step would inherit silently unless this record flags it first.

## 5. Test suite

Ran in this isolated worktree (`origin/main` @ `a67169b`, own `node_modules`):

- `npm test` (full suite): **1149 tests / 1146 pass / 0 fail / 3 skipped**. Clean.
- `node --test tests/checkpoint-ledger.test.mjs`: **12/12 pass**.
- `node --test tests/conformance-v016-drift.test.mjs`: **10/10 pass**.

All green — consistent with the bug being a real gap in coverage (the shipped suite never constructs an out-of-order-append scenario), not a failing assertion anywhere.

## 6. Recommended fast-follow (not performed here — advisory only)

1. Add a `preWriteCheck` to `CheckpointLedger.appendCheckpoint` (mirroring `WorkspaceLeaseLedger`'s pattern) that denies appending a checkpoint whose `sequence_at_checkpoint` is not strictly greater than the current highest `sequence_at_checkpoint` already recorded for the same `(session_id, source_ledger_id)` pair — evaluated atomically inside the same lock-held, freshly-verified read `DurableLedger.append` already takes, not via a separate unlocked `read()`. A new typed deny code (e.g. `DENY_CHECKPOINT_REGRESSION`) should surface this rather than silently accepting the write.
2. Alternatively/additionally, change `resolveLatest` to resolve by `entry.payload.sequence_at_checkpoint` (content order) rather than `record.sequence` (ledger append order) — but the write-side gate in (1) is the stronger fix, since it also prevents the regressed record from being durably persisted at all, not just from being resolved incorrectly later.
3. Decide, and record, whether `actor_id` should be pinned per `session_id` (deny a checkpoint append whose `actor_id` differs from an existing checkpoint's `actor_id` for the same session, absent an explicit re-assignment authority) before any consumer is built that treats a resolved checkpoint's `actor_id` as meaningful for authorization or session ownership.

Neither fix is performed in this review — this is advisory only, per role boundary.

---

## Summary of findings

| # | Item | Result |
|---|---|---|
| 1 | `resolveLatest` resolves by ledger append-order, not by `sequence_at_checkpoint` content order — no monotonicity gate on write | **REQUEST_CHANGES** — real, previously-unflagged checkpoint/resume-integrity bug; not a TOCTOU race (writes are serialized), but a structural design gap that lets a stale/regressed checkpoint silently become "latest" |
| 2 | No identity-continuity check on `actor_id` across checkpoints for one `session_id` | Advisory, non-blocking today (no live consumer reads `actor_id`); should be closed before any actor-scoped consumer is built |
| 3 | Tamper detection, OCC, idempotency, fail-closed lookup, no silent-fail-open | Re-verified, holds exactly as first review found |
| 4 | `preWriteCheck` hook unused by `CheckpointLedger` | Absent invariant, not a regressed one — confirms no TOCTOU race exists today, but also confirms no gate exists to catch §1 |
| 5 | S2/S3 cross-slice assumptions | None — neither touches `CheckpointLedger` |
| 6 | P0-18 drift comparator | Sound in isolation; inherits §1's upstream defect unknowingly once wired |
| 7 | Test suite | 1149/1146/0/3 full suite green; 12/12 and 10/10 on the two relevant files; hardcoded test-ID branching absent |

## Advisory status fields

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: existing
risk_class: medium
self_certification:
  agent_id: claude-immune-secondrev-modruntime-s1
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

## Provenance

- source: first-hand reproduction in an isolated `git worktree --detach` checkout at `origin/main` @ `a67169b`, own `node_modules`, no other concurrent agent session; independent reproduction script run against the real `CheckpointLedger` class in this worktree, then deleted before this record was committed (not retained, not part of the tracked test suite).
- agent_id: claude-immune-secondrev-modruntime-s1 (BST-SA Immune, Claude Sonnet 5)
- timestamp: 2026-07-21
- disposition: advisory second-independent-review only; no execution/approval/merge authority exercised; no push; committed to an isolated detached-HEAD ref via `git update-ref`, not to any live branch; recorded for operator/GOV ratification.

> Recommend a fast-follow fix per §6 before any restore-execution consumer is wired to `CheckpointLedger.resolveLatest`. This review recommends; it does not authorize any change, merge, or execution.

```yaml
self_certification:
  agent_id: claude-immune
  peer_agent_id: codex-immune
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
