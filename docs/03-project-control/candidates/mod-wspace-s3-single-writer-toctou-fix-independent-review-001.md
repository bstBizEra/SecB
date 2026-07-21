# MOD-WSPACE S3 — Single-Writer TOCTOU Fix — Independent Review

**Record ID:** mod-wspace-s3-single-writer-toctou-fix-independent-review-001
**Status:** ADVISORY — NOT EFFECTIVE (no merge/execution authority)
**Reviewer:** REV role, independent of the producer, no prior relationship to this change
**Date:** 2026-07-21
**Branch reviewed:** `bst/mod-wspace-s3-single-writer-toctou-fix-001` @ `108bd0f754a84f773bbfbf6689a1f9b93f024dae`
**Base:** `main` @ `fc0e5af579df9a8ee09adead09e94ec34e346b7f` (verified via `git log`/`git diff` in-repo)
**Producer record reviewed:** `docs/03-project-control/candidates/mod-wspace-s3-single-writer-toctou-fix-producer-verification-001.md`
**Working copies used:** isolated worktree `C:/Users/ounkh/AppData/Local/Temp/.../scratchpad/secb-baseline-fc0e5af` (detached at `fc0e5af`, for baseline test counts) and read-only imports from the existing checked-out branch worktree `C:/Users/ounkh/SecB-worktrees/mod-wspace-s3-single-writer-toctou-fix-001` (not modified) for all novel probes. No changes were made to the reviewed branch.

## Verdict

**APPROVE_WITH_NOTES**

The TOCTOU fix is genuine, correctly implemented, and the "byte-identical for every other subclass" claim holds under independent, line-by-line verification plus direct execution of every sibling subclass's own test suite against the changed base class. All producer-claimed test counts were independently reproduced exactly. One real, non-blocking gap in the new shared hook's defensive-copy guarantee was found (see §3.6) — it does not affect the current change's only caller, but should be closed as a fast-follow given `DurableLedger` is a shared base class for eight subclasses.

---

## 1. Test counts (reproduced independently)

Ran `npm test` myself in two fully isolated locations:

| | tests | pass | fail | skipped |
|---|---|---|---|---|
| Baseline, `main`@`fc0e5af`, fresh isolated worktree + `npm ci` | 1081 | 1076 | 0 | 5 |
| Branch, `108bd0f`, existing branch worktree + `npm ci` | 1087 | 1082 | 0 | 5 |

Exact match to the producer's claimed 1081/1076/0/5 → 1087/1082/0/5. Delta is exactly +6 tests, all passing.

Also ran the sibling-subclass suites directly against the changed base class, as the producer claimed:
```
node --test tests/checkpoint-ledger.test.mjs tests/delegation-ledger.test.mjs tests/temporal-ledgers.test.mjs tests/durable-ledger.test.mjs
```
→ **47/47 pass, 0 fail.** Matches the producer's claim exactly.

`node tools/validate-foundation.mjs` → top-level `"status": "PASS"`, confirmed.

## 2. `DurableLedger.append()` diff, read line by line

Full diff (`git diff fc0e5af 108bd0f -- src/ledger/durable-ledger.mjs`) inspected directly. Structure of the no-hook path, before vs. after:

- `validateEntry(entry)` — unchanged, unmoved.
- `expectedSequence` integer/non-negative check — unchanged, unmoved.
- **New:** `if (preWriteCheck !== undefined && typeof preWriteCheck !== "function") throw DENY_INVALID_PRE_WRITE_CHECK` — inserted immediately after the `expectedSequence` check, **before** `mkdirSync(this.#lockPath)` (i.e. before the lock is ever touched).
- Lock acquisition (`mkdirSync`/`EEXIST`→`LEDGER_BUSY`) — unchanged.
- Inside the lock: read + verify + idempotency-replay + duplicate-entryId + sequence-conflict checks — **byte-for-byte unchanged**, same order, same throws.
- **New:** `if (preWriteCheck) { const veto = preWriteCheck(structuredClone(records), entry); if (veto) return veto; }` — inserted after the sequence-conflict check and before `const sequence = records.length + 1`. Still inside the outer `try`, so the `finally { rmSync(this.#lockPath, ...) }` still runs on this early return.
- Record construction, `appendFileSync`, return shape — unchanged.

**Confirmed: when `preWriteCheck` is `undefined` (the default for every existing caller), the added code is `if (undefined !== undefined && ...)` → skipped, and `if (undefined)` → skipped. Every other line executes exactly as before. This is a genuine no-op for the omitted-hook path**, not merely "tests still pass."

### 2.1 Call-site audit (every subclass)

Grepped every `.append(` call site in `src/ledger/` outside `workspace-lease-ledger.mjs`:

```
checkpoint-ledger.mjs:   this.append(checkpointEntry(...), { expectedSequence });
delegation-ledger.mjs:   this.append(delegationRequestEntry(...), { expectedSequence });
governed-ledgers.mjs:    this.append(eventEntry(...), { expectedSequence });      (EventLedger)
governed-ledgers.mjs:    this.append(evidenceEntry(...), { expectedSequence });   (EvidenceLedger)
temporal-ledgers.mjs:    this.append(toEntry(...), { expectedSequence });         (DecisionLedger)
temporal-ledgers.mjs:    this.append(toEntry(...), { expectedSequence });         (KnowledgeLedger)
temporal-ledgers.mjs:    this.append(toEntry(...), { expectedSequence });         (OutcomeLedger)
```

Every one of the seven other subclasses passes only `{ expectedSequence }` — no second/third key, none named `preWriteCheck`. Confirmed by direct file read of each call site, not by grep alone. The claim holds.

## 3. TOCTOU fix genuineness + novel probes

Ran my own independent script (not the producer's committed tests) importing directly from the branch's source files, plus four probe families beyond what the producer verified.

### 3.1 Independent PROBE1 reproduction

Reproduced the reviewer's exact pattern in a fresh script: instance A appends `wl_A` for `ses_race`; a fresh instance B has its **public** `read()` overridden to `throw` (stronger than merely returning stale data — proves it's genuinely never called), then calls `appendLease` with a correctly-fresh `expectedSequence`. Result: **denied**, `DENY_LEASE_SINGLE_WRITER`, `conflictingLeaseId: "wl_A"`; only 1 record ever persisted. Matches the producer's claim exactly.

### 3.2 `preWriteCheck` itself throws

Not covered by the producer's own tests. Result: the thrown error **propagates out of `append()` unmodified** (not swallowed, not converted); nothing is persisted; and — critically — the lock is still released (`finally` runs on the exception path), confirmed by successfully appending immediately afterward on the same ledger instance. No lock leak on hook failure.

### 3.3 Non-standard truthy veto values

Tested `preWriteCheck` returning: `true`, a plain string (`"STOP"`), a plain object without an `ok` field, a number, and an array. In every case, `append()` returned the **exact same value** (`===` identity, not a copy or wrapper) and nothing was persisted. The "returned as-is" contract holds robustly for any JS-truthy value, not only proper deny-envelope objects — no swallowing or coercion anywhere in the return path.

### 3.4 Real OS-level multi-process race

Spawned **two genuinely separate Windows processes** (via `child_process.spawn`, not two instances in one process) racing to append competing leases for the same session against the same lock file, synchronized with a file-based start barrier, each retrying on `LEDGER_BUSY`/`DENY_SEQUENCE_CONFLICT`. Ran 5 independent trials plus the original run (6 total). **Every trial**: exactly one lease ever landed for the session; the losing process's winning attempt correctly received `DENY_LEASE_SINGLE_WRITER` after re-acquiring the lock and seeing the freshly-written state. This confirms the lock (`mkdirSync`/`rmSync` on a real directory path) is a genuine OS/filesystem-level mutex, not an in-process-only illusion — the hook's atomicity guarantee holds across real process boundaries, not merely across instance references within one Node process.

### 3.5 `structuredClone(records)` defensiveness

Beyond the producer's own array-splice test, I additionally deep-mutated a nested object field (`records[0].entry.payload.nested.count`) and the `entryHash` field inside the cloned `records` array from within the hook, and separately zeroed/rebuilt the array shape. In all cases the actually-persisted ledger content, and a subsequent `ledger.verify()`, were completely unaffected — confirming the clone is a true deep copy, not a shallow one that would have let nested-object mutation bleed through.

### 3.6 New finding: the **`entry`** argument passed to `preWriteCheck` is NOT defensively copied

This was not asked for as a specific probe but fell directly out of extending 3.5: the hook signature is `preWriteCheck(records, entry)`. Only `records` is `structuredClone`'d before being handed to the hook; `entry` is the caller's original object reference, unmodified. The base class's own JSDoc comment on `append()` says the hook "receives a `structuredClone` of the just-verified `records` (so a subclass cannot mutate append()'s internal working state) **and the candidate `entry`**" — the sentence structure invites a reader to assume both arguments carry the same protection; only one does.

Concretely: `entryHash` is computed from `entry` **before** `preWriteCheck` runs; `record.entry` is `structuredClone(entry)`d **after** `preWriteCheck` runs. If a hook mutates `entry` in place and returns falsy (allowing the write), the record persisted to disk has an `entry` field that no longer matches the `entryHash`/`recordHash` computed from the pre-mutation entry. I reproduced this directly: `append()` itself does not throw and returns a result showing the mutated payload, but **every subsequent `ledger.verify()` / `ledger.read()` call on that ledger throws `LEDGER_INTEGRITY_FAILURE`** — i.e. a hook that mutates `entry` permanently and irrecoverably corrupts that ledger file (fail-closed on the *next* access, but the bad record is already durably on disk by then).

**Current impact: none.** `WorkspaceLeaseLedger`'s own `preWriteCheck` callback (the only caller of this mechanism in the entire codebase) never references its `entry` parameter at all — it only reads `records`. So this gap is not triggered by anything in this change. But `DurableLedger` is explicitly the shared base for `CheckpointLedger`, `DelegationLedger`, `EventLedger`, `EvidenceLedger`, `DecisionLedger`, `KnowledgeLedger`, `OutcomeLedger`, and `WorkspaceLeaseLedger` — the hook is now a permanent, general-purpose extension point on that shared class, and its contract as documented does not warn an implementer that `entry` is live, mutable, and load-bearing for the record about to be written.

**Recommendation (non-blocking for this merge, but should be closed as a fast-follow before any second consumer of `preWriteCheck` is written):** either `structuredClone(entry)` alongside `records` for symmetry, or explicitly document in the JSDoc that `entry` is the live object and must not be mutated. This is a one-line, low-risk change; I recommend not deferring it as far out as the S2-binding gap, precisely because of the blast radius of this particular base class.

## 4. `DENY_INVALID_PRE_WRITE_CHECK` validation placement

Confirmed by direct diff read (§2): the type check occurs in the same statement block as the pre-existing `expectedSequence` validation, both **before** `mkdirSync(this.#lockPath)`. A malformed `preWriteCheck` therefore fails fast without ever touching the lock file — no wasted lock acquisition/release cycle. Independently confirmed via probe: passing a string, number, object, array, or `null` as `preWriteCheck` all throw `DENY_INVALID_PRE_WRITE_CHECK` immediately (5/5 cases). This placement is correct: the check is a pure argument-shape validation independent of ledger state, so there is no correctness reason it would ever need to run inside the lock, and running it first is strictly better (fails a bad caller faster, never contends the lock for a call that was going to be rejected anyway).

## 5. `structuredClone(records)` defensive-copy verification

See §3.5. Confirmed genuinely defensive (deep clone, not shallow) for the `records` argument specifically. See §3.6 for the asymmetric gap on the `entry` argument.

## 6. S2-binding deferral characterization

Independently confirmed, not merely trusted:
- `grep -rn "mintLease\|evaluateLease\|renewLease" src/ --include=*.mjs`, excluding tests, returns matches **only inside `src/control/workspace-lease-policy.mjs` itself** (the primitive's own definitions) — zero call sites anywhere else in `src/`. The "zero binding, module unwired" claim is accurate as of this commit.
- Read `workspace-lease-policy.mjs` directly: `mintLease`/`evaluateLease` destructure `{ leaseId, sessionId, actorId, writeSet, issuedAt, ttl }` — camelCase, with `issuedAt` validated by `isEpochMs` (epoch-millisecond integer) and `expiresAt` derived as `issuedAt + ttl`.
- Read `workspace-lease-ledger.mjs` directly: the ledger's own entry/contract fields are `lease_id`, `session_id`, `write_set`, `issued_at`/`expires_at` as **ISO-8601 strings** (`Date.parse(held.expires_at)` is used throughout the single-writer gate).

The camelCase/epoch-ms vs. snake_case/ISO-8601 mismatch is real and exactly as described. This fix's own diff (`git diff --stat` against the two source files) does not touch `workspace-lease-policy.mjs` at all, confirming the deferral is genuine — no shortcut was quietly taken here; the primitive and the ledger remain exactly as un-bound as before this commit. Given the scope of this fix is a single, bounded MEDIUM-severity race close, and binding the two would require a field-mapping adapter plus a mint-vs-renew design decision (a materially different, larger change), deferring it as a named follow-up (rather than silently dropping it, and rather than scope-creeping this fix) is reasonable.

## 7. Hardcoded test-ID branching

`grep -niE "NODE_ENV|wl_test|ses_test|test-id|testId|process\.env"` against both changed source files (`durable-ledger.mjs`, `workspace-lease-ledger.mjs`): **zero matches.** Confirmed no environment- or fixture-identity branching anywhere in the fix.

## 8. Ancillary checks

- `MANIFEST.json`: confirmed byte-identical (`git diff` empty) — no new tracked files, consistent with the producer's claim.
- `docs/03-project-control/candidates/module-completion-tracker-001.md`: change is a single appended line (extend-only), consistent with this project's established convention.
- Byte-identity guard test (`tests/workspace-lease-ledger.test.mjs`): confirmed the guard's exclusion of `durable-ledger.mjs` is disclosed inline with a comment naming the reason and pointing at `tests/durable-ledger.test.mjs`'s own direct coverage — not a silent weakening. `workspace-lease-policy.mjs` and `write-set-policy.mjs` remain in the guard's coverage and are confirmed genuinely untouched by this commit (§6).
- `appendLease`'s post-append discrimination `if (result && result.ok === false) return result;` is safe: the only two possible shapes of `result` are (a) the veto object from `deny()` (`{ ok: false, code, message, ... }`, frozen) or (b) the base class's persisted-record object (`{ ledgerId, sequence, previousHash, entry, entryHash, recordHash, replayed }`, which has no `ok` field at all), so the discrimination is unambiguous.

## Status fields

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: existing
risk_class: low
self_certification:
  agent_id: claude-rev-wspace-s3-toctou-01
  peer_agent_id: claude-sonnet-main (producer of the reviewed commit; no relationship to this review)
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

## Disposition

**APPROVE_WITH_NOTES.**

- The TOCTOU fix is genuine: the reviewer's exact PROBE1 bypass was independently reproduced pre-fix (via a fresh, non-producer script) and confirmed denied post-fix; the gate provably no longer calls `read()` at all.
- The "byte-identical for every other `DurableLedger` subclass" claim holds under independent line-by-line diff review, independent call-site audit of all seven sibling subclasses, and direct execution of their test suites (47/47) against the changed base class.
- All claimed test counts (1081/1076/0/5 → 1087/1082/0/5, 47/47 sibling suites, validate-foundation PASS) were independently reproduced exactly.
- Novel probes beyond the producer's own coverage — a throwing hook, non-standard truthy veto return values, and a genuine multi-OS-process race against the real filesystem lock — all behaved correctly: errors propagate without being swallowed, the lock is always released, arbitrary truthy values are returned as-is, and the single-writer invariant holds under real (not just simulated) process concurrency.
- One real, currently-dormant gap was found and is disclosed here rather than silently passed over: the `entry` argument to `preWriteCheck` is not defensively cloned the way `records` is, and a hook that mutates it can durably corrupt the ledger's own integrity chain. It does not affect this change's only caller and is not a merge blocker, but should be closed (trivially — clone `entry` too, or document the asymmetry) before any second consumer of this shared hook is written, given the hook is now permanent API surface on a base class with eight subclasses.
- The S2-binding deferral is accurately characterized (verified zero live bindings exist anywhere in `src/`, and the field-shape mismatch is real) and is a reasonable scope boundary for this bounded fix, not a cover for skipping something cheap.
- No hardcoded test-ID/environment branching found.

This record carries no merge/execution authority. It is prepared for asynchronous GOV/operator ratification per this project's advise-and-proceed convention.
