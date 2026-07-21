# MOD-RUNTIME S1 Checkpoint Ordering Fix — Independent Review 001

**Record ID:** mod-runtime-s1-checkpoint-ordering-fix-independent-review-001
**Status:** ADVISORY — INDEPENDENT REVIEW, NOT A MERGE DECISION
**Reviewer identity:** claude-rev-modruntime-s1-checkpoint-ordering-fix (BST-SA REV/SEC, independent of the producer)
**Reviewed:** `bst/mod-runtime-s1-checkpoint-ordering-fix-001` @ `ca7f14c84072917976f7f25876612d8d6e045ede`, base `origin/main` @ `a67169b149f0887090e15cd7124681e58858010d`
**Producer record consulted, not trusted:** `docs/03-project-control/candidates/mod-runtime-s1-checkpoint-ordering-fix-producer-verification-001.md` (read in full; every claim in it was independently re-derived below rather than taken on faith)
**Method:** Worked in the pre-existing isolated worktree `C:/Users/ounkh/SecB-worktrees/mod-runtime-s1-checkpoint-ordering-fix-001` (already checked out at `ca7f14c`, `node_modules` already installed — verified `git status` clean, branch untouched). For the pre-fix baseline, checked out a **separate, temporary** detached worktree at `origin/main` @ `a67169b` with its own fresh `npm install`, so no shared mutable state with the branch under review; removed after use. Wrote all reproduction/adversarial scripts from scratch (none copied from the producer's or the prior reviewer's test additions).
**Date:** 2026-07-21

---

## Verdict: **APPROVE_FOR_MERGE**

The fix is correct on both the resolve-side and write-side, the atomic write-gate is genuinely evaluated against the lock-held snapshot (not a separate `read()`), multi-session interleaving is genuinely isolated, the equal-sequence edge case is genuinely denied, and the `actor_id` immutability gate genuinely distinguishes a legitimate same-actor sequence from an impostor. `checkpoint-drift-comparator.mjs`'s own tests are genuinely unmodified (only a comment block and one pinned-hash line changed in each conformance file), and both repinned byte-identity hashes are correct — independently recomputed. Full suite and module suite counts match the producer's claims exactly, independently reproduced from a clean baseline. One **pre-existing, non-blocking, out-of-scope** advisory gap was found during adversarial testing (§6 below) and is recorded for a future slice; it does not block this merge.

---

## 1. Diff scope

```
docs/.../mod-runtime-s1-checkpoint-ordering-fix-producer-verification-001.md | new
docs/.../module-completion-tracker-001.md                                    | +1 line (log entry)
src/ledger/checkpoint-ledger.mjs                                             | +112/-6
tests/checkpoint-ledger.test.mjs                                             | +163/-0
tests/conformance-p0-18-candidate.test.mjs                                   | +12/-1
tests/conformance-v016-drift.test.mjs                                       | +17/-1
```
`git diff --stat a67169b..ca7f14c -- src/` confirms `checkpoint-ledger.mjs` is the **only** file touched under `src/` — no other primitive was modified. Matches the producer's claimed scope exactly.

## 2. Resolve-side fix — confirmed correct

`resolveLatest` (`checkpoint-ledger.mjs:187-193`) now reduces over `record.entry.payload.sequence_at_checkpoint`, never `record.sequence`. Read in full; matches the claim.

**Independent reproduction (fresh script, not the producer's):** appended a checkpoint at `sequence_at_checkpoint: 10`, then bypassed `appendCheckpoint` entirely by calling the inherited `DurableLedger.append` directly (constructing the raw entry shape myself) to append a second checkpoint at `sequence_at_checkpoint: 3, actor_id: "actor_HOSTILE_RAW"` for the same session — reproducing exactly the ledger shape the fixed write-gate would now refuse to create (e.g. legacy/pre-fix data). `resolveLatest` correctly returned the `sequence_at_checkpoint: 10` record (`sequence: 1`, the OLDER append-order record), proving the resolve-side fix holds independently of the write-side gate. Confirmed.

## 3. Write-side fix — confirmed correct

`appendCheckpoint` passes a `preWriteCheck` to `DurableLedger.append`. Read `durable-ledger.mjs` in full: the lock is acquired (`mkdirSync` on the lock path) **before** `#readRecords()`/`#verifyRecords()` are called, and `preWriteCheck(structuredClone(records), structuredClone(entry))` is invoked with that same freshly-read, freshly-verified, lock-held snapshot — never a separate call to the public `read()`. `checkpoint-ledger.mjs`'s gate throws `DENY_CHECKPOINT_REGRESSION` when `sequence_at_checkpoint` is not strictly greater than the current highest value recorded for the same `(session_id, source_ledger_id)`.

**Independent reproduction of the reviewer's exact original scenario:** `sequence_at_checkpoint: 10` then `3`, same session — the second append threw `LedgerError` with code `DENY_CHECKPOINT_REGRESSION`, and `ledger.verify().count` stayed at `1` (not persisted). Confirmed both the write-time denial and, via the raw base-ledger bypass in §2, the read-time resolution independently.

## 4. Adversarial testing — actively trying to break it

### 4.1 PROBE1: is the gate genuinely evaluated against the lock-held snapshot, or could it be fooled through a separate `read()`?
Built a fresh probe: after a legitimate first checkpoint, **monkey-patched the ledger instance's own public `read()` method to throw** ("read() was called — this should never happen"), then attempted the regressed second append. The append still threw `DENY_CHECKPOINT_REGRESSION` (not the probe's poison error), proving `preWriteCheck` never calls `read()` or any other public method — it operates purely on the `records` argument passed positionally from inside `append()`'s own lock-held critical section, exactly as `durable-ledger.mjs`'s doc comment claims. Confirmed genuinely atomic; the TOCTOU shape `mod-wspace-s3` fixed is not reintroduced here.

### 4.2 Multi-session interleaving
Constructed a ledger with session B checkpointing **first**, at a large `sequence_at_checkpoint` (999), then session A checkpointing at a small value (1). Verified:
- Session A's own strictly-increasing sequence (1 → 2) is accepted despite being numerically far below session B's history.
- A genuine regression for session A (a third checkpoint at `sequence_at_checkpoint: 1`, lower than A's own latest of 2) is still correctly denied, evaluated against A's own history only.
- Session B continuing forward (999 → 1000) is unaffected by A's small numbers.
- `resolveLatest("ses_rev_A")` and `resolveLatest("ses_rev_B")` each return their own session's correct latest, with no cross-contamination.

No interleaving gap found. Session scoping is genuine.

### 4.3 Equal-`sequence_at_checkpoint` edge case (off-by-one check)
Appended `sequence_at_checkpoint: 7`, then attempted a second checkpoint at the **same** value (7, not lower). Correctly denied with `DENY_CHECKPOINT_REGRESSION` (the gate uses `<=`, not `<`) — the ledger count stayed at 1. Also confirmed the very next legitimate value (8) is accepted, ruling out an overly-strict off-by-one in the other direction. The "non-strictly-increasing" claim is accurate; no slip-through of same-sequence duplicates.

### 4.4 `actor_id` immutability
- **Legitimate same-actor sequence:** three checkpoints from the same `actor_id`, strictly increasing `sequence_at_checkpoint`, all succeeded. Not blocked.
- **Genuinely different actor:** a second checkpoint under an existing `session_id` with a different `actor_id` was denied with `DENY_ACTOR_ID_IMMUTABLE`, ledger count stayed at 1.
- **Combined case:** confirmed the actor_id gate fires even when the accompanying `sequence_at_checkpoint` would otherwise be a legitimate strict increase (50 > 1) — i.e. the actor check is not accidentally short-circuited by a passing sequence check.
- **Cross-session actor reuse:** the same `actor_id` legitimately used as the *first* actor for two different, unrelated sessions does not conflict (the pin is per-session, not global) — correct.

No false-positive or false-negative found in the actor_id gate.

## 5. `checkpoint-drift-comparator.mjs` tests and byte-identity guard re-pins

`git diff a67169b..ca7f14c -- tests/conformance-v016-drift.test.mjs tests/conformance-p0-18-candidate.test.mjs`, filtered to added/removed lines: in **both** files the only changes are (a) a new disclosed-update comment block, and (b) the single `PINNED_BLOBS["src/ledger/checkpoint-ledger.mjs"]` hash value. No test body, assertion, `FIELD_SPECS`, or import line was touched in either file — genuinely unmodified test logic, not quietly adjusted.

Independently recomputed both hashes (not trusted from the doc):
```
git hash-object src/ledger/checkpoint-ledger.mjs   (current worktree, post-fix)  -> c072a6207e2fa409a498429be76d95df4f363cf7
git rev-parse ca7f14c:src/ledger/checkpoint-ledger.mjs                           -> c072a6207e2fa409a498429be76d95df4f363cf7
git rev-parse a67169b:src/ledger/checkpoint-ledger.mjs (pre-fix, for contrast)   -> 4df391f892f8bac2b569c5bf9fd627ee0101c542
```
Both match the re-pinned value and the claimed pre-fix value exactly. Ran `node --test tests/conformance-v016-drift.test.mjs` (10/10 pass) and `tests/conformance-p0-18-candidate.test.mjs` (5/5 pass) directly — both green, confirming the drift comparator's own conformance coverage is unaffected.

## 6. Residual finding (non-blocking, pre-existing, out of this fix's disclosed scope): `resolveLatest` does not scope by `source_ledger_id`

While adversarially testing the `(session_id, source_ledger_id)` scoping the write-side gate uses, I checked whether `resolveLatest` applies the same scoping on the read side. It does not — `resolveLatest(sessionId)` filters records **only** by `sessionId`, then takes a raw numeric max of `sequence_at_checkpoint` across **all** `source_ledger_id` values for that session. Constructed a fresh scenario: a session checkpoints against `source_ledger_id: "ledger-X"` at `sequence_at_checkpoint: 5000` (a long-running ledger), then legitimately (per this same fix's own write-gate design, which explicitly permits and tests this as non-regressive) also checkpoints against a **different** `source_ledger_id: "ledger-Y"` at `sequence_at_checkpoint: 3` (a short/young ledger). `resolveLatest` returned the `ledger-X` checkpoint as "latest" — the append-order-*older* record — purely because `5000 > 3`, comparing two unrelated per-ledger progress counters. This is the exact "category error" the write-side gate's own design rationale (§ "Why scoped to (session_id, source_ledger_id), not session_id alone") explicitly reasons must not happen — but that reasoning was applied only to the write gate, not to `resolveLatest`.

**Scope/severity assessment:**
- This gap is **pre-existing**, not introduced or worsened by this fix — the original (pre-fix) `resolveLatest` had the identical `sessionId`-only filter; only the reduce key changed from `record.sequence` to `sequence_at_checkpoint`.
- It is **not** the bug this fix's cited review (§1 of the second independent review) identified or asked to be fixed — that finding was specifically about same-session, same-ledger append-order-vs-content-order confusion, which this fix correctly closes.
- Traced the one real consumer, `checkpoint-drift-comparator.mjs`'s `evaluateResumeFromLedger` → `evaluateResume`: its comparison surface is exactly three fields (`content_hash`, `sequence_at_checkpoint`↔observed `sequence`, `state_snapshot_ref`) and does **not** include `source_ledger_id` at all. So if `resolveLatest` ever did hand back a wrong-source-ledger checkpoint, the near-certain outcome is a `content_hash`/`state_snapshot_ref` mismatch, which the comparator's fail-closed design (verified in §5) would report as `DENY_CHECKPOINT_DRIFT` or `DENY_DRIFT_UNVERIFIABLE` — a spurious **availability** failure (over-eager denial), not a silent-accept security bypass. `grep -rn "resolveLatest"` outside this file and the comparator confirms there is no other/live consumer, and no code anywhere calls `resolveLatest` with more than a `sessionId` today (its signature offers no `source_ledger_id` parameter to disambiguate even if a caller wanted to).
- Recommend recording this as a fast-follow candidate (e.g. give `resolveLatest` an optional `sourceLedgerId` filter, mirroring the write-gate's scoping) before any future consumer relies on multi-source-ledger-per-session checkpointing being resolved correctly — but it does not block this merge, since (a) it predates this branch, (b) it is outside this fix's disclosed and cited scope, and (c) today's sole consumer fails closed rather than silently accepting wrong data if it were ever hit.

## 7. Hardcoded test-ID branching

`grep -in "test.*case|testcase|TEST_ID|caseId|actor_HOSTILE|ses_local_test|chk_p0_test" src/ledger/checkpoint-ledger.mjs src/control/checkpoint-drift-comparator.mjs` — **no matches** in either production source file. The gates branch only on `sequence_at_checkpoint` numeric comparison and `actor_id`/`sessionId`/`source_ledger_id` string equality against already-recorded ledger content; no fixture-value or caller-identity special-casing found.

## 8. Test suite — independently reproduced

**Module suite**, run directly (`node --test tests/checkpoint-ledger.test.mjs`) in the existing branch worktree:
- Post-fix: **19/19 pass** (0 fail).
- Pre-fix baseline, run in a **separate, freshly-`npm install`ed** detached worktree at `origin/main` @ `a67169b` (removed after use, never touching the branch under review): **12/12 pass**. Also independently reproduced the bug itself in this clean baseline: the same regressed-sequence append that the post-fix code denies **succeeded** pre-fix, and `resolveLatest` returned the regressed checkpoint as latest — confirming the claimed defect is real, not merely asserted.

**Full repo suite** (`npm test`, i.e. `npm run validate && node --test tests/*.test.mjs`):
| | tests | pass | fail | skipped |
|---|---|---|---|---|
| Pre-fix baseline (independent run, separate worktree, fresh `npm install`) | 1149 | 1146 | 0 | 3 |
| Post-fix (this branch, independent run) | 1156 | 1153 | 0 | 3 |

Both counts match the producer's claimed counts exactly; delta is +7, all new tests, zero regressions — independently confirmed, not taken on faith.

`node tools/validate-foundation.mjs`: exit code `0`, `"status": "PASS"`, zero `"status": "FAIL"` entries in the full JSON output. Confirmed independently.

## 9. Status fields

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: existing
risk_class: low
self_certification:
  agent_id: claude-rev-modruntime-s1-checkpoint-ordering-fix
  peer_agent_id: claude-motor (producer)
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

## 10. Disposition

**APPROVE_FOR_MERGE.** The primary finding (§1 of the cited second independent review — `resolveLatest`'s append-order-vs-content-order confusion, and the absent write-side monotonicity gate) is closed correctly on both sides, independently re-derived and adversarially probed rather than taken on the producer's word: the atomic write-gate genuinely uses the lock-held snapshot (never a separate `read()`), session scoping is genuine, the equal-sequence boundary is genuinely denied, and the `actor_id` immutability gate (§2, advisory) correctly discriminates legitimate continuity from impersonation without false-blocking the normal case. `checkpoint-drift-comparator.mjs`'s own tests are genuinely unmodified — only a disclosed, independently-verified pinned-hash re-pin — and its fail-closed comparison logic means the one residual gap found here (§6, `resolveLatest`'s cross-source-ledger conflation) degrades safely to over-denial rather than a silent wrong-accept. That gap is real but pre-existing, out of this fix's disclosed scope, and non-blocking; recorded here as a fast-follow candidate for a future slice. Test counts (19/19 module, 1156/1153/0/3 full suite, matching a 1149/1146/0/3 baseline) were independently reproduced from a clean, separately-provisioned worktree, not copied from the producer's report. This review carries no merge/execution authority — advisory only, for operator/GOV ratification, per the BST-SA worker-not-approver boundary.
