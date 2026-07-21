# MOD-WSPACE S3 — Single-Writer TOCTOU Fix — Cross-Lane Independent Review

**Record ID:** mod-wspace-s3-single-writer-crossrev-001
**Status:** ADVISORY — NOT EFFECTIVE (no merge/execution authority)
**Reviewer:** `claude-immune-crossrev-singlewriter-01` (Immune role, cross-lane review of a Codex-produced change to shared ledger infrastructure — strictest base-class bar applied)
**Date:** 2026-07-21
**Branch reviewed:** `bst/mod-wspace-s3-single-writer-toctou-fix-001` @ `eaefae0`
  (code commits `108bd0f` fix + `338ba04` fast-follow; branch-own REV `c0e3d0c`)
**Base:** `main` @ `f78c4fb` (merge-base with branch = `fc0e5af`)
**Verification worktree:** isolated worktree `agent-aefd6e7ef901c4067`, review branch `claude/rev/singlewriter-crossrev` checked out at `eaefae0`, `npm ci` clean. No other worktree or the primary checkout was touched.

## Verdict

**APPROVE_FOR_MERGE** (with informational notes; no blocking or note-level defects outstanding).

The TOCTOU fix is genuine and correctly implemented. The `DurableLedger` base-class change is strictly opt-in and provably behavior-identical for the seven sibling subclasses that omit the hook. The single-writer stale-read race is independently reproduced and confirmed closed. The `338ba04` fast-follow (`structuredClone(entry)`) is a correct and appropriately-scoped hardening of the shared hook — it closes the only real gap the branch-own REV (`c0e3d0c` §3.6) found, verified here by direct probe. Full suite green, validator exit 0, merge clean against the pinned base.

---

## Findings by severity

| Sev | Finding |
|-----|---------|
| CRITICAL | none |
| HIGH | none |
| MEDIUM | none — the branch-own REV's MEDIUM `entry`-not-cloned gap is CLOSED by fast-follow `338ba04`, independently re-verified (PROBE2 below). |
| LOW-1 (info) | OCC-before-hook ordering: inside `append`, the `expectedSequence` (sequence-conflict) check runs BEFORE `preWriteCheck`. In a simultaneous stale-sequence + single-writer double-fault, the surfaced denial changes from `DENY_LEASE_SINGLE_WRITER` (pre-fix ordering) to a thrown `DENY_SEQUENCE_CONFLICT`. Both fail closed (nothing persisted); this is a benign strengthening — the single-writer scan now only runs against a confirmed-fresh chain (`records.length === expectedSequence`), which is exactly the atomicity property that closes the race. |
| LOW-2 (info) | `resolveActiveLease` still calls unlocked `this.read()` (line 186). This is correct and NOT a TOCTOU surface: it is a read-only resolver, not a write path; its fail-closed direction (unparseable expiry → not active → deny) is intact. Only the write-path gate needed to move under the lock. |
| LOW-3 (info) | Housekeeping: the branch's own producer-verification and independent-review records were added to `docs/03-project-control/candidates/` but not registered in `MANIFEST.json`. Validator is still green (candidate listing is not exhaustively enforced), but this is inconsistent with the register-in-MANIFEST convention. Non-blocking. |
| LOW-4 (info) | `module-completion-tracker-001.md` is an append-hotspot. Clean vs the pinned base `f78c4fb` (see merge-cleanliness), but the +2 branch append WILL conflict if any concurrent tracker edit lands on `main` before this branch merges — a trivial re-append resolution when it occurs. |

---

## 1. Base-class-change safety (paramount) — siblings UNAFFECTED

`src/ledger/durable-ledger.mjs` diff read line-by-line (`git diff fc0e5af eaefae0 -- src/ledger/durable-ledger.mjs`):

- **Opt-in.** `append(entry, { expectedSequence, preWriteCheck } = {})`. When a caller omits `preWriteCheck` it is `undefined`, so the new guard `if (preWriteCheck !== undefined && typeof preWriteCheck !== "function")` is skipped and the invocation guard `if (preWriteCheck) { ... }` is skipped. Every other line executes exactly as before — a genuine no-op, not merely "tests still pass."
- **Inside the critical section.** The hook is inserted AFTER `mkdirSync(this.#lockPath)` lock acquisition, AFTER the locked `#readRecords()` + `#verifyRecords()`, AFTER idempotency-replay / duplicate-entryId / sequence-conflict checks, and immediately BEFORE record construction + `appendFileSync`. It receives the SAME freshly-read+verified `records` snapshot the write will use. A truthy return exits via `return veto` still inside the outer `try`, so `finally { rmSync(this.#lockPath) }` releases the lock on the veto path.
- **Argument validation before the lock.** `DENY_INVALID_PRE_WRITE_CHECK` is thrown in the same pre-lock block as the `expectedSequence` validation — a malformed hook fails fast without ever contending the lock file.
- **Call-site audit.** All seven sibling subclasses (`CheckpointLedger`, `DelegationLedger`, `EventLedger`, `EvidenceLedger`, `DecisionLedger`, `KnowledgeLedger`, `OutcomeLedger`) pass only `{ expectedSequence }` — none pass `preWriteCheck`.
- **Sibling suites executed against the changed base class:** `checkpoint-ledger` + `delegation-ledger` + `temporal-ledgers` + `governed-ledgers` (Event/Evidence) → **34/34 pass, 0 fail.**

**Ruling: the base-class change is safe. Ledgers that do not provide a `preWriteCheck` are behaviorally unchanged; the hook path is provably not entered for them.**

## 2. TOCTOU closure (attack rebuilt on this tree) — NOW DENIED

Independent probe (not the committed test): instance A appends lease `wl_A` for `ses_race`; a fresh instance B has its **public `read()` overridden to throw** (strictly stronger than a stale snapshot — proves the gate never consults an independent read), then calls `appendLease` for `wl_B` on the same session with a correctly-fresh `expectedSequence: 1`.

Result:
```
PROBE1_TOCTOU  A.ok=true  B={ok:false, code:DENY_LEASE_SINGLE_WRITER, conflictingLeaseId:"wl_A", sessionId:"ses_race"}  persisted_count=1
RENEW_same_writer.ok=true  DIFF_session.ok=true
```
Two active leases for one session can no longer both land: the second is DENIED, only one record persists, and `#detectSingleWriterConflict` scans the hook-passed `records` (never `this.read()`). The check and the write now share one atomic read under the lock.

## 3. Fast-follow `338ba04` (clone entry passed to preWriteCheck) — CORRECT and NECESSARY

Why it was needed: `entryHash` is computed from the live `entry` BEFORE the hook runs; the persisted record stores `structuredClone(entry)` AFTER the hook runs. Without cloning the hook's `entry` argument, a hook that mutates `entry` in place would desync `entryHash` from the persisted entry → `LEDGER_INTEGRITY_FAILURE` on every later `read()/verify()` — durable corruption of the ledger file. The branch-own REV (`c0e3d0c` §3.6) found this; `338ba04` closes it by passing `structuredClone(entry)` symmetrically with `records`.

Independent probe with a hostile hook that sets `entry.payload.HACKED = true` and `entry.entryId = "MUTATED"` then returns falsy (allowing the write):
```
PROBE2_CLONE  callerEntryId=e2  callerHACKED=undefined  verify=2  persistedEntryId=e2  persistedHACKED=undefined
```
The clone isolates the mutation from (a) the caller's own object, (b) the persisted record, and (c) the integrity chain (`verify()` returns 2, no corruption). A hostile or buggy `preWriteCheck` cannot corrupt the ledger write.

**Ruling: the fast-follow is correct, minimal, and appropriately scoped. Dormant for the only current caller (`WorkspaceLeaseLedger`'s hook reads only `records`, never `entry`) but correct to land now given `DurableLedger` is a permanent shared extension point for eight subclasses.**

## 4. Correctness preserved on the fixed tree

- **Hash-chain integrity** — `verify()` green across all probes and the full suite; `previousHash`/`recordHash` construction unchanged.
- **Idempotency** — replay path (`idempotencyKey` match → `{ ...replay, replayed: true }`) unchanged and precedes the hook.
- **OCC** — `expectedSequence` check unchanged; runs before the hook (see LOW-1).
- **`resolveActiveLease` fail-closed** — unparseable `expires_at` → `Number.isFinite` false → not active → deny (LOW-2).
- **Deep-frozen outputs** — `Object.freeze({ ok, record })` on the append envelope and `deepFreeze(...)` on `resolveActiveLease` results intact.
- **Single-writer semantics** — idempotent replay + higher-version renewal (same `lease_id`) are NOT conflicts (PROBE: `RENEW_same_writer.ok=true`); a different session is allowed (`DIFF_session.ok=true`); a denied append persists nothing (`persisted_count` stayed 1).

## 5. Regression + integration

- **Full suite:** `npm test` → **tests 1088 / pass 1083 / fail 0 / skipped 5** (baseline `main` was 1081/1076/0/5; delta +7, all passing).
- **Validator:** `npm run validate` → exit **0**; 17 contract schemas under `manifest.file.contracts/*.schema.json` all PASS.
- **Merge-cleanliness vs `main` @ `f78c4fb`:** `git merge-tree --write-tree f78c4fb eaefae0` → exit 0, **no conflicts**. The `secb-gov-001-*` promotion files and `mod-wspace-s3-second-independent-review-001.md` that the two-dot `f78c4fb..eaefae0` diffstat shows as "deleted" are added-on-main-only (ABSENT at merge-base `fc0e5af` and on the branch, EXIST on `f78c4fb`); a three-way merge preserves them — the diffstat is a two-endpoint artifact, not a branch deletion. Tracker: `module-completion-tracker-001.md` is untouched on `main` since `fc0e5af`, so the branch's +2 append merges clean against the pinned base (hotspot caveat: LOW-4).

## Status fields

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: existing
risk_class: low
self_certification:
  agent_id: claude-immune-crossrev-singlewriter-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

## Disposition

**APPROVE_FOR_MERGE.** Base-class change is opt-in and sibling-safe; the TOCTOU stale-read race is independently reproduced and confirmed closed; the fast-follow entry-clone correctly hardens the shared hook against write corruption; all inherited correctness invariants (hash chain, idempotency, OCC, fail-closed resolution, deep-frozen outputs, single-writer semantics) hold on the fixed tree; full suite and validator green; merge clean against the pinned base. Findings are informational only. This record carries no merge/execution authority and is prepared for asynchronous GOV/operator ratification.
