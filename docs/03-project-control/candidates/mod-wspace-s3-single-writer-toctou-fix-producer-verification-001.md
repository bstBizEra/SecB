# MOD-WSPACE S3 — Single-Writer TOCTOU Fix Producer Self-Verification / Rework Record

**Record ID:** mod-wspace-s3-single-writer-toctou-fix-producer-verification-001
**Status:** DRAFT / ADVISORY — NOT EFFECTIVE (local commit only, not pushed, not merged)
**Producer:** claude-sonnet-main (BST-SA Motor/producer role), operating under `AGENTS.md` `SECB-AGENTS-AMD-002` (revision 2), advise-and-proceed
**Date:** 2026-07-21
**Branch:** `bst/mod-wspace-s3-single-writer-toctou-fix-001`
**Base:** `main` @ `fc0e5af579df9a8ee09adead09e94ec34e346b7f` ("Merge pull request #53 from bstBizEra/claude/rev/mod-wspace-completion-2") — verified first-hand via `git rev-parse main` at dispatch time, in a fresh, isolated worktree (`C:/Users/ounkh/SecB-worktrees/mod-wspace-s3-single-writer-toctou-fix-001`).
**Target files:** `src/ledger/durable-ledger.mjs` (base class, extended), `src/ledger/workspace-lease-ledger.mjs` (subclass, gate relocated)
**Companion tests:** `tests/durable-ledger.test.mjs` (+4 new direct hook tests), `tests/workspace-lease-ledger.test.mjs` (+2 new: regression + control; byte-identity guard updated)

**Cited finding:** §3 (MEDIUM) of the second independent review,
`docs/03-project-control/candidates/mod-wspace-s3-second-independent-review-001.md`
(reviewer `claude-rev-wspace-s3-second-01`, local ref `refs/heads/bst/mod-wspace-s3-second-review-001` @
commit `bb3eeb3`; that record's own review target was `main` @ `944c3ff` (merge of PR #52,
`bst/mod-wspace-s3-staged`), source commit `da36c50`).

---

## Root cause

`WorkspaceLeaseLedger.appendLease` enforced its single-writer-per-session invariant
(`DENY_LEASE_SINGLE_WRITER`) via `#detectSingleWriterConflict`, which called the
**public**, **unlocked** `this.read()` accessor to scan for a conflicting active lease —
**entirely before** calling `this.append(...)`. `DurableLedger.append` protects its own
write with a real lock (`mkdirSync`/`rmSync` on a `.lock` directory) and re-reads +
re-verifies the chain **inside** that lock before writing, but it has no knowledge of
session/lease semantics — its only defense against a stale caller view is the exact-match
`expectedSequence` check, which is unrelated to the single-writer business rule.

Consequence: the single-writer check and the durable write drew on **two independent
reads not coupled by any lock**. A caller whose single-writer pre-check ran against a
stale view of the chain, but whose write used a correctly-fresh `expectedSequence` (e.g.
sourced from a coordinator/allocator or a caching read path, independent of its own
pre-check's read), could land two simultaneously-active leases for one session —
defeating the exact invariant this gate exists to enforce. The reviewer reproduced this
deterministically by overriding the public `read()` accessor on a second
`WorkspaceLeaseLedger` instance (pointed at the same file) to return a stale/empty view
for the pre-check only, while leaving the base class's actual locked write path
untouched and reading real state — `expectedSequence: 1` (fresh/correct) plus the faked
stale pre-check produced `bResult.ok === true`, i.e. two active leases for one session.

Current blast radius was zero at review time (the module is unwired — no live caller of
`appendLease` exists anywhere in the repo), which is why this was MEDIUM/non-blocking
rather than a blocking defect on the already-merged slice. It is being closed now, before
any live caller (the deferred B5 gateway-wiring step) comes to depend on this gate's
atomicity.

## Correction

**Design choice:** extend `DurableLedger.append`'s own lock to cover the business-rule
check, rather than inventing a second, separate locking primitive in the subclass. This
matches the task brief's own explicit steer and is the only option consistent with "reuse
the base class's own write-lock instead of reimplementing one" — the same
reuse-not-reimplement discipline every other guarantee in `WorkspaceLeaseLedger` already
follows (hash chain, idempotency, optimistic concurrency, atomic single-read snapshot are
all inherited unmodified; only this one gate had drifted from that discipline, per the
reviewer's own §2 observation).

**Mechanism — `preWriteCheck` hook on `DurableLedger.append`** (`src/ledger/durable-ledger.mjs`):

`append(entry, { expectedSequence, preWriteCheck } = {})` now accepts an optional
`preWriteCheck(records, entry)` function. It is invoked **inside** the existing lock-held
critical section — after the base structural checks (idempotency-key replay, duplicate
`entryId`, optimistic-sequence conflict) and immediately before the record is persisted —
and receives a `structuredClone` of the **exact same** freshly-read, freshly-verified
`records` array the write is about to use (the one produced by this same call's own
`#readRecords()` + `#verifyRecords()`, not a separately-fetched snapshot). If the hook
returns a truthy value, that value is returned **as-is** from `append()` and **nothing is
written** — the lock is still released via the existing `finally`. If it returns falsy (or
is omitted), the append proceeds exactly as before. A non-function `preWriteCheck` is
rejected with `DENY_INVALID_PRE_WRITE_CHECK` (fail-closed on a malformed hook, consistent
with the base class's existing fail-closed posture).

Callers that omit `preWriteCheck` — every other `DurableLedger` subclass
(`CheckpointLedger`, `DelegationLedger`, `EventLedger`, `EvidenceLedger`,
`DecisionLedger`, `KnowledgeLedger`, `OutcomeLedger`) — see byte-for-byte identical
behavior to before this hook existed: the new parameter defaults to `undefined`, the new
`if (preWriteCheck)` branch is simply skipped, and no other code path changed.

**Mechanism — `WorkspaceLeaseLedger.appendLease`** (`src/ledger/workspace-lease-ledger.mjs`):

`appendLease` now passes its single-writer scan as the `preWriteCheck` callback to
`this.append(...)`, instead of calling `#detectSingleWriterConflict` as a separate step
beforehand:

```js
const result = this.append(workspaceLeaseEntry(snapshot, idempotencyKey), {
  expectedSequence,
  preWriteCheck: (records) => {
    const conflict = this.#detectSingleWriterConflict(snapshot, now, records);
    if (!conflict) return null;
    return deny("DENY_LEASE_SINGLE_WRITER", ..., { sessionId, conflictingLeaseId });
  }
});
if (result && result.ok === false) return result;
return Object.freeze({ ok: true, record: result });
```

`#detectSingleWriterConflict` was refactored to take `records` as a parameter instead of
calling `this.read()` internally — **it no longer performs any read of its own at all**.
There is consequently no longer a second, independent, externally-overridable read for
the gate to race against: the only records it ever sees are the ones `DurableLedger.append`
itself just read and verified under its own lock, for this exact write.

Every structural/deny-precedence detail of the gate is preserved unchanged: same-lease_id
re-append (idempotent replay or renewal) is still not a conflict; the fail-closed
"unparseable `expires_at` treated as still-active" direction is unchanged; a tampered
ledger still fails closed via `#verifyRecords` before the hook ever runs (unchanged —
tamper detection happens before `preWriteCheck` is invoked, same as before the fix).

## Verification

### Pre-fix reproduction (reviewer's exact exploit, confirmed present before any change)

Before writing the fix, the reviewer's PROBE1 pattern was reproduced against the
pre-fix module in this worktree: instance A appends `wl_A` for `ses_race`
(`expectedSequence: 0`); a fresh instance B, same file, with its public `read()`
overridden to return `[]`, calls `appendLease(wl_B, { expectedSequence: 1, ... })` for
the same session. Result on pre-fix code: `bResult.ok === true` — **two simultaneously
active leases for `ses_race`** (`wl_A`, `wl_B`), confirming the bypass exactly as the
reviewer documented.

### Post-fix reproduction (same scenario, fixed module)

The identical scenario, now committed as a permanent regression test (see below), yields
`resultB.ok === false`, `resultB.code === "DENY_LEASE_SINGLE_WRITER"`,
`resultB.conflictingLeaseId === "wl_A"`; `ledger.verify().count === 1` — only `wl_A` was
ever persisted. Overriding the public `read()` accessor now has **zero effect** on the
gate's decision, because the gate no longer calls `read()` — it only ever sees the
`records` handed to it from inside the locked `append()` call.

### Committed regression + control tests

`tests/workspace-lease-ledger.test.mjs` (2 new tests):
- *"single-writer gate is now atomic with the write: overriding the public read()
  accessor to fake a stale view no longer lets a second active lease land for the same
  session (regression, second-independent-review §3)"* — the exact PROBE1 reproduction
  above, asserting the correct deny and that only one record persisted. The override is
  set to **throw** rather than merely return a stale value, to prove the gate genuinely
  never calls it at all (a throw would surface immediately if it were ever invoked).
- *"the ordinary, non-racing case is unaffected by the fix: a ledger whose read()
  accessor is overridden to throw still allows a legitimate, non-conflicting append (no
  false deny introduced)"* — proves the fix does not introduce a false deny: a solo
  session's first lease and a same-session renewal (same `lease_id`, higher version) both
  still succeed, even with `read()` poisoned to throw if called.

`tests/durable-ledger.test.mjs` (4 new tests, exercising the base-class mechanism
directly, independent of the lease subclass):
- `preWriteCheck` receives the same freshly-read, freshly-verified `records` the write is
  about to use, and a truthy return aborts the write without persisting.
- A falsy `preWriteCheck` return lets the append proceed exactly as if no hook were
  passed.
- `preWriteCheck` receives a `structuredClone` of `records`, not internal mutable state
  (mutating the hook's argument does not affect what is actually persisted).
- A non-function `preWriteCheck` is rejected with `DENY_INVALID_PRE_WRITE_CHECK`.

### Test counts

**Full repo suite (`npm test`), independently re-run both sides in this worktree:**
| | tests | pass | fail | skipped |
|---|---|---|---|---|
| Before (base `main` @ `fc0e5af`, pre-fix, `git stash` + fresh `npm test`) | 1081 | 1076 | 0 | 5 |
| After (this branch, post-fix, `git stash pop`) | 1087 | 1082 | 0 | 5 |

Delta is exactly +6 tests (2 lease-ledger + 4 durable-ledger), all passing, zero
regressions anywhere in the 1081-test pre-existing baseline. The before-count
(1081/1076/0/5) independently matches the second review's own first-hand measurement.

**Sibling-subclass non-regression (explicit, per task constraint):** ran
`tests/checkpoint-ledger.test.mjs`, `tests/delegation-ledger.test.mjs`, and
`tests/temporal-ledgers.test.mjs` (covering `EventLedger`, `EvidenceLedger`,
`DecisionLedger`, `KnowledgeLedger`, `OutcomeLedger`) directly alongside
`tests/durable-ledger.test.mjs` — 47/47 pass, 0 fail. `git diff` of
`src/ledger/durable-ledger.mjs` (above) shows the only new code path is gated behind
`if (preWriteCheck)`, and none of these subclasses' `appendX` methods pass that option —
confirmed by `grep -rn "\.append(" src/` before writing the fix, none of the
non-workspace-lease call sites supply a third key beyond `expectedSequence`.

`node tools/validate-foundation.mjs`: **PASS**, exit 0, both before and after (no new
schema, no new `decision_type`/contract kind — this fix adds zero contract surface).

### Hardcoded test-ID branching

`grep`-searched `src/ledger/durable-ledger.mjs` and `src/ledger/workspace-lease-ledger.mjs`
for `NODE_ENV`, literal test-fixture IDs (`wl_test_001`, `ses_test_001`), and
environment/test-identity branching. **None found.** The fix branches only on the shape
of `preWriteCheck` (`typeof preWriteCheck !== "function"`) and the business-rule return
value's truthiness — no caller-identity or fixture-specific logic anywhere.

### Byte-identity guard update (disclosed, not silent)

`tests/workspace-lease-ledger.test.mjs` carried a byte-identity guard test pinning
`src/ledger/durable-ledger.mjs` to base commit `0c0f3d2`, dating from this slice's
original purely-additive scope. That guard is now **deliberately** updated to exclude
`durable-ledger.mjs` — the base class legitimately changes as part of this fix — with an
inline comment explaining why and pointing at this record and at
`tests/durable-ledger.test.mjs`'s own direct coverage of the new hook. The guard still
covers `workspace-lease-policy.mjs` and `write-set-policy.mjs` (genuinely untouched) and
all contract schemas except `workspace-lease.schema.json` (unchanged from the slice's
original scope).

### Scope check

`git diff --stat` against this branch's base: 4 files — `src/ledger/durable-ledger.mjs`
(+29/-2), `src/ledger/workspace-lease-ledger.mjs` (+64/-21), `tests/durable-ledger.test.mjs`
(+90), `tests/workspace-lease-ledger.test.mjs` (+84/-8, net of the guard-list edit). No
other source or contract file touched. `MANIFEST.json` is unchanged — no new source/test
files were added (only existing tracked files modified plus this doc, following the same
precedent as the prior `mod-live-s1-toctou-fix-001` bounded-fix commit, which likewise did
not touch `MANIFEST.json` for its own producer-verification record).

## Secondary finding disposition (S2-binding gap) — DEFERRED, not fixed

The same reviewer's §4 finding — zero binding between the durable ledger and the pure S2
`evaluateLease`/`mintLease` primitive (a lease the primitive would refuse to mint can
still be durably persisted by the ledger; `ttl`/`expires_at` consistency is never
cross-checked) — is **explicitly deferred**, not fixed in this pass.

**Reasoning:** this is disclosed by the reviewer as a genuine architectural property, not
a hidden defect ("the primitive decides, this ledger records" is stated in the module's
own header), and closing it is not a cheap, scope-contained change:

- `mintLease`/`evaluateLease`/`renewLease` (`src/control/workspace-lease-policy.mjs`)
  operate on **camelCase** fields (`leaseId`, `sessionId`, `writeSet`, `issuedAt`) and
  **epoch-millisecond** clock readings throughout; `WorkspaceLeaseLedger` operates on the
  contract's **snake_case** fields (`lease_id`, `session_id`, `write_set`) and **ISO-8601**
  `issued_at`/`expires_at` strings. Binding the two requires a field-mapping/adapter
  layer that does not exist today.
- `appendLease` has no notion of "mint vs. renew" — it durably records whatever validated
  lease object it is given. Deciding which primitive function to call (and reconciling
  its return shape with the ledger's own frozen deny-envelope contract) is a design
  decision, not a mechanical wire-up.
- The reviewer's own recommendation frames this as "a future wiring step (B5, out of
  scope here)" — i.e., squarely in the deferred gateway-wiring slice, which the module's
  header already names as R3/operator-gated, not a same-pass fix alongside a narrowly
  scoped TOCTOU close.

Attempting it here would materially expand this dispatch's scope beyond the one MEDIUM
finding it was authorized to close, and would touch the "primitive decides, ledger
records" peer-relationship design the module's own header documents as intentional —
exactly the kind of R3-adjacent design decision AMD-002 reserves for a separately
prepared, separately reviewed candidate. It is disclosed here, by name, as a **named,
deferred follow-up** (matching this project's disclose-don't-silently-drop convention),
for whoever eventually prepares the B5 gateway-wiring slice: that slice must call
`mintLease`/`evaluateLease` before `appendLease` and must derive `expires_at` from the
primitive's own computed value, never from an independently-supplied string, per the
reviewer's own §4 recommendation.

## Status fields

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: existing
risk_class: low
self_certification:
  agent_id: claude-sonnet-main
  peer_agent_id: n/a (no peer review dispatched for this bounded fix; independent REV recommended before merge, mirroring the mod-live-s1-toctou-fix-001 precedent)
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

## Disposition

The second independent review's §3 MEDIUM finding (single-writer gate non-atomic with
its write) is closed: the exact reviewer-documented bypass is reproduced pre-fix and
confirmed closed post-fix by this producer, with permanent regression + control tests
committed alongside the fix. The base class extension (`preWriteCheck` hook) is
behavior-preserving for every other `DurableLedger` subclass, verified by running their
test suites directly against the changed base class. The §4 INFO/LOW finding (S2-binding
gap) is explicitly deferred, named, and reasoned above, not silently dropped.

This is a local commit on `bst/mod-wspace-s3-single-writer-toctou-fix-001`, based on
current `main` @ `fc0e5af`. Not pushed, no PR opened, no merge — per AMD-002 rev 2
advise-and-proceed, this candidate is prepared and ready for asynchronous GOV
ratification at operator merge review; it carries no authority to self-declare complete
or production.
