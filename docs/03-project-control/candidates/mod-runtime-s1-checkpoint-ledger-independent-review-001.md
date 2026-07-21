# MOD-RUNTIME S1 Checkpoint Ledger — Independent Review 001

**Record ID:** MOD-RUNTIME-000 / mod-runtime-s1-checkpoint-ledger-independent-review-001
**Status:** ADVISORY — INDEPENDENT REVIEW, NOT A MERGE DECISION
**Reviewer identity:** claude-rev-modruntime-s1 (BST-SA REV worker, independent of the producer)
**Reviewed branch/commit:** `bst/mod-runtime-s1-checkpoint-ledger` @ `4c83e16` (base `main` @ `ed7981f`)
**Reviewed against:** `docs/03-project-control/candidates/mod-runtime-gap-assessment-001.md` (`bst/mod-runtime-assessment` @ `e9c478f`) and `docs/03-project-control/candidates/mod-runtime-s1-checkpoint-ledger-producer-verification-001.md` (this branch)
**Method:** All findings below were reproduced first-hand in an isolated `git worktree --detach` checkout at commit `4c83e16`, separate from the producer's own worktree (`C:\laragon\www\SecB-worktrees\mod-runtime-s1-checkpoint-ledger`) and from any other concurrent agent session. Nothing on this branch was modified prior to this review; no push, no merge, no operator-authority action taken.
**Date:** 2026-07-20

---

## Verdict: **APPROVE_FOR_MERGE**

The behavior-preservation claim, the test-count claim, the inheritance/delegation claim, and the tamper-detection claim all reproduce exactly as stated. The two registration-point diffs are genuinely additive with no shadowing/fallthrough risk. One real (but scoped-appropriately) gap was found in the `source_ledger_id`/`sequence_at_checkpoint` design — it is not validated for referential integrity — and is noted below as an **advisory note**, not a merge blocker, because it does not weaken any existing guarantee and this slice has zero live consumers. The V-016 stub decision is assessed as the right call.

---

## 1. Behavior-preservation claim — CONFIRMED, empty diff

```
git diff main bst/mod-runtime-s1-checkpoint-ledger -- src/ledger/durable-ledger.mjs src/ledger/governed-ledgers.mjs src/ledger/temporal-ledgers.mjs
```

reproduced first-hand: **zero output, zero lines**. `git diff --stat` for the whole branch confirms the only touched files are the new checkpoint files, `MANIFEST.json`, the two registration points (`src/contracts/contract-validator.mjs`, `tools/validate-foundation.mjs`), `tests/contract-validator.test.mjs`, and two governance-record markdown files. No existing ledger's runtime behavior is touched. Claim holds.

## 2. Test-count claim — CONFIRMED, exact match

Ran `npm test` first-hand in an isolated detached-HEAD worktree at `4c83e16` (own `node_modules` copy, not shared with the producer's worktree):

- **This branch:** `tests 594 / pass 589 / fail 0 / skipped 5` — **exact match** to the claimed `594/589/0/5`.
- **`main` baseline** (also reproduced first-hand in a second isolated worktree at `ed7981f`): `tests 582 / pass 577 / fail 0 / skipped 5` — **exact match** to the claimed baseline and to the `+12` delta (12 new tests confirmed by `grep -c '^test(' tests/checkpoint-ledger.test.mjs` = 12, all passing).
- `node tools/validate-foundation.mjs` on the branch: exit code 0, `"status": "PASS"`, zero `"status": "FAIL"` entries. The checkpoint-specific checks (`schema.draft/closed/required/identity.contracts/checkpoint.schema.json`, `manifest.file.*` for all five new files) are present and passing.

Claim holds exactly, no rounding or approximation needed.

## 3. Inheritance/delegation claim — CONFIRMED

Read `src/ledger/checkpoint-ledger.mjs` and `src/ledger/durable-ledger.mjs` in full.

`CheckpointLedger.appendCheckpoint()` does exactly two things: `validateContract("checkpoint", checkpoint)`, then a local idempotencyKey presence check, then `return this.append(checkpointEntry(checkpoint, idempotencyKey), { expectedSequence })` — a direct call to the **unmodified** `DurableLedger.append()`. It does not touch the lock file, the hash chain, the sequence counter, or the idempotency-replay logic itself; all of that lives exclusively in the base class (confirmed by the empty diff in §1 — the base class genuinely wasn't touched). `resolveCheckpoint()`/`resolveLatest()` call `this.read()`, which is also unmodified base-class code that re-verifies the full hash chain (`#verifyRecords`) on every call before returning records — so tamper detection on the underlying file is inherited by both read paths, not just `append()`.

The shape is a byte-for-byte match to the established thin-subclass pattern: compared directly against `EventLedger`/`EvidenceLedger` in `src/ledger/governed-ledgers.mjs` (read in full for this comparison) — `EvidenceLedger.appendEvidence()` has the identical structure (validate contract → require idempotencyKey → delegate to base `append()`). One trivial, non-regressive divergence: `EvidenceLedger` throws a bare `TypeError` for a missing idempotencyKey, while `CheckpointLedger` throws a typed `LedgerError("DENY_MISSING_ENTRY_FIELDS", ...)` — arguably an improvement (consistent with the base class's own error taxonomy) but noted as a minor inconsistency across the ledger family, not a defect.

No weakening or reimplementation found. Claim holds.

## 4. Tamper/hash-chain tests — CONFIRMED genuine, not the "dead code" pattern

Read `tests/checkpoint-ledger.test.mjs` in full (12 tests). The three tamper tests were individually inspected:

1. **"tampering the checkpoint ledger file is detected before records are returned"** — genuinely rewrites the on-disk NDJSON line (`sessionId` string substitution) via `writeFileSync`, then asserts both `ledger.read()` **and** `ledger.resolveLatest()` throw `LEDGER_INTEGRITY_FAILURE`. This is a real file mutation followed by a real assertion against the actual verify path, and it specifically proves detection propagates through the read-side lookup, not just the internal `read()` method.
2. **"a flipped recordHash on a checkpoint entry breaks chain verification"** — parses the two persisted JSON lines, overwrites `lines[0].recordHash` with `"f".repeat(64)`, rewrites the file, asserts `ledger.verify()` throws. Genuine mutation of a structural hash field.
3. **"removing a checkpoint entry breaks the sequence chain"** — writes only the second of two persisted lines back to the file (deleting the first), asserts `ledger.verify()` throws. Genuine structural mutation (sequence/`previousHash` mismatch).

All three mutate real, already-persisted file content and assert a real thrown error against the actual code path — none of them is a pre-known-good-state assertion with no actual corruption step. This is **not** the SINK_ACK_MISMATCH-style unreachable-dead-code pattern seen elsewhere in this project's history.

**Independent verification — my own mutation, not present in any shipped test:** I hand-constructed two additional tamper scenarios against a fresh temp ledger built from this branch's actual `CheckpointLedger` class (script retained at `C:\Users\ounkh\AppData\Local\Temp\claude\...\scratchpad\my-tamper-test.mjs`, run outside any tracked repo path):

- **Test A:** flipped a single hex character deep inside the *payload's* `content_hash` field (a field none of the three shipped tests touch — they touch `sessionId`, `recordHash`, or delete a whole line) while leaving `entryHash`/`recordHash` untouched in the record wrapper. Result: `ledger.read()` threw `LedgerError` with code `LEDGER_INTEGRITY_FAILURE`. **Caught.**
- **Test B:** raw-text-substituted `"sequence_at_checkpoint":42` → `"sequence_at_checkpoint":99` inside the persisted payload, then called `resolveCheckpoint()` (not `read()`/`verify()` directly, to also confirm the read-side lookup API surfaces the failure). Result: threw `LEDGER_INTEGRITY_FAILURE`. **Caught.**

Both independent mutations were caught because `entryHash` is computed over the whole canonicalized `entry` object (including the nested `payload`), so no field inside the checkpoint payload is excluded from tamper coverage. Tamper detection is genuine, not narrower than it appears, and not dead code.

## 5. `source_ledger_id` design decision — sound addition, one advisory gap noted

The addition itself is a reasonable, minimal, schema-shape-only fix to a real ambiguity: this repo has five independent durable ledgers with independent sequence counters, so `sequence_at_checkpoint` alone is not a well-defined position without naming which ledger it counts against. Making `source_ledger_id` a required string field is the right minimal shape and does not add any new authority semantics, matching the producer's own framing.

**However, checked the specific question the task asked: is either invalid case validated anywhere?**

- An unknown/nonexistent `source_ledger_id` (e.g. a typo, or a name that names no real ledger) — **not validated anywhere.** The schema only constrains it to `{"type": "string", "minLength": 1}` (`contracts/checkpoint.schema.json:15`); there is no enum, no cross-reference, and `CheckpointLedger.appendCheckpoint()`/`resolveCheckpoint()`/`resolveLatest()` never look it up against any ledger registry. Confirmed by reading the full 90-line `checkpoint-ledger.mjs` and by `grep -r "source_ledger_id" src/ tests/` — the only two places it is *read* (as opposed to just passed through) are the schema and the test fixtures; no code branches on its value.
- A `sequence_at_checkpoint` claiming a position beyond the named ledger's actual current length — **also not validated anywhere**, for the same reason: nothing in this slice ever opens or inspects the ledger named by `source_ledger_id`. The field is schema-constrained only to `{"type": "integer", "minimum": 0}`.

Both invalid cases pass silently today. This is **consistent with, and explicitly scoped by, the producer's own stated design**: the design-decision note in the producer's verification record states the drift/position-validity check (step 3 of the restore sequence) is deliberately deferred to a future slice with a real state-snapshot consumer, and the gap assessment's non-goal #3 says the same. So this is not an undisclosed gap — it is the disclosed deferral, just not phrased in the verification record as explicitly as "an invalid reference passes silently today." Given there is zero live consumer of `CheckpointLedger` anywhere in this codebase (`grep -r "checkpoint-ledger" src/ tests/` outside this slice's own files returns nothing, confirmed), this has no present security or correctness impact.

**Advisory note (non-blocking):** flagging for the record so a future consumer-wiring slice does not assume `source_ledger_id`/`sequence_at_checkpoint` have ever been checked against a real ledger. Recommend the eventual restore-consumer slice (or a lightweight follow-up) add a referential-integrity check at minimum at read/resolve time — the design note in `checkpoint-ledger.mjs` already documents the correct three-step restore sequence including this check; it's just not implemented yet, which is fine for a lookup-only S1 primitive.

## 6. Registration-point diffs — CONFIRMED additive, no shadowing

Diffed `src/contracts/contract-validator.mjs`, `tools/validate-foundation.mjs`, and `tests/contract-validator.test.mjs` directly:

- `contract-validator.mjs`: adds one key, `checkpoint: "checkpoint.schema.json"`, to the `schemaPaths` object literal. This is a plain object literal (not a switch/map with fallthrough semantics), and `"checkpoint"` does not collide with any of the other 14 existing keys — confirmed by reading the full object. No risk of shadowing.
- `validate-foundation.mjs`: adds `"contracts/checkpoint.schema.json"` to the `expectedSchemas` array (used for a fail-closed **set-equality** assertion against the manifest's schema files — an extra or missing schema both fail the build, so this is exactly the kind of check that would have caught a mistaken duplicate/rename) and adds one new map entry to `mandatoryIdentityFields` keyed by the new file path, again with no key collision with any of the other 14 entries.
- `tests/contract-validator.test.mjs`: adds matching `checkpoint` entries to both `validFixtures` and `invalidFixtures`, again additive-only, no existing entry touched.

All three diffs are pure appends to array/object literals; none reorders, removes, or overwrites an existing entry, and the new key name (`checkpoint`) is distinct from every other registered kind. No accidental weakening of any other contract kind's validation. Claim holds.

## 7. V-016 stub decision — the right call, not overly conservative

Confirmed `tests/conformance-stubs.test.mjs:538` is unchanged: `test("V-016 recovery: checkpoint resume and drift detection", { skip: "BLOCKED: P0-10 Checkpoint federation" }, () => {})` — still skipped, body still empty, skip-reason string still has the stale "P0-10 Checkpoint federation" naming mismatch flagged (but not fixed) by the gap assessment.

Assessed whether a partial un-skip (verified-resume only, deferring drift-denial) would have been better: **no.** `tests/checkpoint-ledger.test.mjs` already exercises the only real "verified resume" behavior this slice provides — `resolveLatest`/`resolveCheckpoint` returning the correct, hash-chain-verified record, fail-closed on the unknown path. A partial un-skip of V-016 that asserted the same thing would be a second, weaker restatement of tests that already exist, wearing a conformance-matrix label that implies something stronger (an actual session resuming execution) than what is being tested (a ledger read returning a record). Since there is no real state-snapshot consumer or session-resume execution path anywhere in this codebase yet (confirmed, §5), a conformance test claiming "verified checkpoint resumes" would either have to (a) test the same ledger-lookup behavior already covered elsewhere under a misleading name, or (b) fabricate a fake resume consumer solely to make the stub pass — both of which are exactly the kind of shallow/misleading-test pattern this project has previously flagged. Leaving V-016 fully skipped, with an honest (if stale-named) reason, is more honest than a partial un-skip would have been. Recommend the stale skip-reason string fix be tracked (already flagged, correctly out of this slice's scope) rather than done opportunistically here.

---

## Summary of findings

| # | Item | Result |
|---|---|---|
| 1 | Behavior-preservation (empty diff on 3 base ledger files) | CONFIRMED |
| 2 | Test counts (594/589/0/5, +12 over 582/577/0/5) | CONFIRMED exact |
| 3 | `appendCheckpoint` delegates to unmodified base `append()` | CONFIRMED |
| 4 | Tamper/hash-chain tests genuine + independent reproduction | CONFIRMED |
| 5 | `source_ledger_id` design | Sound; referential integrity unvalidated (disclosed deferral, no live consumer, non-blocking) |
| 6 | contract-validator.mjs / validate-foundation.mjs registrations | CONFIRMED additive, no shadowing |
| 7 | V-016 left skipped | Right call; partial un-skip would have been worse |

## Advisory status fields

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: existing
risk_class: low
self_certification:
  agent_id: claude-rev-modruntime-s1
  peer_agent_id: claude-motor-modruntime-s1
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

## Provenance

- source: first-hand reproduction in two isolated `git worktree --detach` checkouts (`bst/mod-runtime-s1-checkpoint-ledger` @ `4c83e16` and `main` @ `ed7981f`), separate from the producer's own worktree and from any other concurrent agent session; independent mutation script run outside the tracked repository tree.
- agent_id: claude-rev-modruntime-s1 (BST-SA REV worker, Claude Sonnet 5)
- timestamp: 2026-07-20
- disposition: advisory review only; no execution/approval/merge authority exercised; no push; no merge; recorded on this candidate branch for operator/GOV ratification per AMD-002 rev 2.

> Recommend APPROVE_FOR_MERGE, with the §5 advisory note carried forward to whichever future slice wires a live checkpoint-restore consumer. This review recommends; it does not authorize merge.
