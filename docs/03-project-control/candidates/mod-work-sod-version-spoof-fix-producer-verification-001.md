# MOD-WORK — SoD Version-Spoof Fix Producer Self-Verification / Rework Record

**Record ID:** mod-work-sod-version-spoof-fix-producer-verification-001
**Status:** DRAFT / ADVISORY — NOT EFFECTIVE (local commit only, not pushed, not merged)
**Producer:** claude-motor (BST-SA Motor agent), operating under AMD-002 rev 2 (advise-and-proceed)
**Date:** 2026-07-21
**Branch:** `bst/mod-work-sod-version-spoof-fix-001`
**Base:** `main` @ `385ac65943f2a5b158c8ec20a5fd947f06cd2987` (verified via `git rev-parse origin/main` at dispatch time)
**Worktree:** `C:/laragon/www/SecB-mod-work-sod-fix` (isolated, new)
**Target file:** `src/services/goal-graph-service.mjs` (`registerGoal` only)
**Companion tests:** `tests/goal-graph-service.test.mjs` (4 new regression tests appended), `tests/goal-rollup-projection.test.mjs` (1 new regression test appended), `tests/approval-binding.test.mjs` (F4 byte-identity guard updated — see "Disclosed scope-discipline update" below)

**Cited finding:** §4 (REQUEST_CHANGES, primary finding) of the second independent
review of MOD-WORK, `docs/03-project-control/candidates/mod-work-second-independent-review-001.md`
(reviewer `claude-rev-modwork-second-01`, committed to ref
`refs/reviews/mod-work-second-independent-review-001` @ commit `01e1f4a`; review target
was `origin/main` @ `385ac65`, i.e. this branch's own base — S1/S2/S3 already merged via
PR #12). §2 (LOW/INFO, cycle-detection coverage gap) and §4's Probe A/B (re-parenting
ownership gap) are also addressed below.

---

## Root cause

`GoalGraphService.registerGoal` performed schema validation, reserved-delimiter checks,
hierarchy/level-ordering checks against the *currently-resolved* parent, and a
duplicate-`(goal_id, version)` check — but **nothing tied a new version's
`provenance.agent_id` (or `level`, or `parent_goal_id`) to the goal_id's prior
version(s)**. Each of `#goals`'s stored entries recorded `producerActorId:
record.provenance.agent_id` independently, per version, with no continuity check.

`retireGoal`'s force-retire N-5 gate (`evaluateForceRetireApprovals`) treats
`entry.producerActorId` — the **highest currently-registered version's** producer — as
the authoritative "who owns this goal" fact for its `DENY_SELF_APPROVAL` check (the
independent-review approver may not be the producer). Because `producerActorId` was
freely overwritable by *any* actor via a later version, the true original owner could:

1. Attempt `retireGoal({ force: true, ... })` with themselves as `independent_review` —
   correctly denied `DENY_SELF_APPROVAL` (they are the recorded producer).
2. Re-version their own goal, supplying a **different** `provenance.agent_id** in the new
   version (accepted — no continuity check existed).
3. Retry the identical `retireGoal` call — now **allowed**, because
   `evaluateForceRetireApprovals` compares against `entry.producerActorId`, which is now
   the spoofed identity, not the true owner.

This is a genuine authority-boundary defeat, reproducible against the live,
already-merged service with no external wiring required (confirmed first-hand by the
reviewer, and independently re-confirmed by this producer — see Verification below,
before any change was made).

The reviewer's Probes A and B (cross-actor re-parenting of a goal the caller does not own,
and silent corruption of an established hierarchy root by re-leveling) share the *same*
missing-continuity-check root cause but are a **distinct residual risk from the SoD
bypass** — see "Disposition of the other findings" below.

## Correction

`registerGoal` now binds `producerActorId` **immutably to a goal_id's first-ever-registered
version**. Immediately before persisting a new version, if a prior version of the same
`goal_id` already exists (`this.#resolveGoalId(record.goal_id)` returns non-null) and its
`producerActorId` differs from the incoming record's `provenance.agent_id`, the
registration is denied with a new structured code, **`DENY_PRODUCER_IMMUTABLE`**, audited
before the denial (audit-first, matching every other deny path in this file) — no state
change occurs.

**Reject vs. silent carry-forward — why reject was chosen:** every existing SoD-relevant
fact in this codebase is disclosed via a named deny code the instant a violation is
attempted, never silently absorbed or normalized: `DENY_SELF_APPROVAL` /
`DENY_SOD_VIOLATION` in this same file, the identical pattern in
`capability-registry-service.mjs`'s `promote()`, and `checkPairwiseDistinct`'s deny-coded
collapse detection in `sod-rules.mjs`. Silently carrying the original producer forward
instead of rejecting would make a real spoofing *attempt* indistinguishable from "nothing
happened" in the caller's return value and in the audit trail's disposition field — the
attempt itself (a real, actionable security signal: someone tried to move goal ownership)
would be invisible unless a caller separately diffed before/after state. An explicit deny
code preserves that visibility and matches this project's established convention.
Content, `status`, `level`, and `parent_goal_id` remain freely mutable across versions by
design (the fix scopes to producer identity only, since that is the only field
`retireGoal`'s SoD gate consumes).

No reusable "identity pinned across versions" pattern exists elsewhere in this codebase
to reuse directly: `capability-registry-service.mjs` records a producer
(`source_identity.maintainer`) per capability *version* independently, with no
cross-version continuity check of its own (out of scope to fix here — no reviewer finding
names it, and it is a materially different versioning model); `approval-binding.mjs`
implements exact-action/exact-version replay binding, not producer-identity pinning
across re-registrations of the same entity. The fix here is implemented directly,
following this file's own established deny-code/audit-first house style.

Audit visibility: the denial's ledger entry now also carries an `actors` field
(`producer:<original>`, `attempted_producer:<spoofed>`) so the attempted identity claim is
recorded, not just the fact of denial — `registerGoal`'s audit fields previously never
populated `actors` at all; this is a minimal, additive disclosure improvement consistent
with Rule #6 (provenance).

## Verification

### Pre-fix reproduction (reviewer's exact exploit chain, reproduced by this producer before any change)
Ran the reviewer's Probe C sequence against the pre-fix module in this worktree:
- `retireGoal(OBJ, { force: true, approvals: [independent_review: owner-real, governance:
  gov-1] })` **before** the spoofing re-version → `DENY_SELF_APPROVAL`. **Reproduced.**
- `registerGoal(OBJ v2, provenance.agent_id: "attacker-controlled-id")` → `{ ok: true }`
  (no continuity check). **Reproduced.**
- The identical retire call retried **after** the re-version → `{ ok: true, status:
  "RETIRED" }`. **Reproduced — the bypass is real.**

### Post-fix reproduction (same sequence, re-run against the fixed module)
- `retireGoal` before the re-version attempt → `DENY_SELF_APPROVAL` (unchanged, correct).
- The spoofing re-version attempt → **`DENY_PRODUCER_IMMUTABLE`** (was `{ ok: true }`,
  now denied outright; no state change, goal stays at v1, producer stays `owner-real`).
- The identical retire call retried after the (now-denied) re-version attempt → **still
  `DENY_SELF_APPROVAL`**. **The bypass is closed, not merely documented** — the exact
  three-step chain the reviewer walked through end-to-end can no longer reach `{ ok: true,
  status: "RETIRED" }`.

This exact chain is committed as a permanent regression test: `"Probe C: reviewer's exact
force-retire SoD-bypass exploit chain is closed"` in `tests/goal-graph-service.test.mjs`.

### Additional committed regression tests
- `"registerGoal denies a re-version that changes the producer (identity pinning)"` — the
  minimal spoofing case.
- `"registerGoal allows a re-version that keeps the same producer, changing only
  content/hierarchy/status"` — the **legitimate** lifecycle case (status/title change,
  same producer) continues to work exactly as before, unchanged.
- `"registerGoal denies a producer-changing re-version even when it also re-parents/
  re-levels (Probe A/B variants)"` — reproduces the reviewer's Probe A (cross-actor
  re-parenting) and Probe B (root re-leveling) constructions verbatim; both are now denied
  on the producer-continuity check before any hierarchy corruption can occur, since both
  of the reviewer's own probes were performed by an actor different from the original
  producer.

### Test counts

**Module suite (`tests/goal-graph-service.test.mjs` + `tests/goal-rollup-projection.test.mjs`), `node --test`:**
| | tests | pass | fail |
|---|---|---|---|
| Before (base `main` @ `385ac65`, pre-fix) | 35 | 35 | 0 |
| After (this branch, post-fix + 5 new) | 40 | 40 | 0 |

**Full repo suite (`npm test` / `node --test tests/*.test.mjs`), fresh `npm ci`:**
| | tests | pass | fail | skipped |
|---|---|---|---|---|
| Before (base `main` @ `385ac65`, per the review's own first-hand `npm test` run) | 1098 | 1093 | 0 | 5 |
| After (this branch, post-fix + 6 new tests total: 4 SoD regressions + 1 CYCLE regression + 1 F4 disclosure test) | 1104 | 1099 | 0 | 5 |

Delta is exactly +6 tests, all passing, zero regressions anywhere in the pre-existing
baseline.

`node tools/validate-foundation.mjs`: exit 0 both before and after (737 checks, 0 FAIL,
re-run post-fix in this worktree).

### Hardcoded test-ID branching
`grep`-searched `src/services/goal-graph-service.mjs` and `src/ui/goal-rollup-projection.mjs`
for test-ID / special-casing patterns (`NODE_ENV`, `test-only`, string-literal identity
branches). **None found.** The fix branches only on `producerActorId` equality against the
first-registered version's stored value — a universal identity comparison, not a test
fixture or caller-identity special-case.

### Scope check
`git diff --stat` against this branch's base: `src/services/goal-graph-service.mjs`
(+44 lines, additive: one continuity check + header documentation, no existing line
altered in behavior), `tests/goal-graph-service.test.mjs` (+100 lines, purely additive),
`tests/goal-rollup-projection.test.mjs` (+33 lines, purely additive),
`tests/approval-binding.test.mjs` (updated — see below). No other file touched.

### Disclosed scope-discipline update: `tests/approval-binding.test.mjs` F4 byte-identity guard
That file's F4 guard (from the unrelated, already-merged MOD-RUNTIME-S3
`approval-binding.mjs` extraction) asserted five files, including
`src/services/goal-graph-service.mjs`, remain byte-identical to two historical baseline
commits (`beebfe8`, `71b9d41`) — a scope-discipline check that that specific prior rework
left those files untouched. Since this branch *deliberately* changes
`goal-graph-service.mjs` for an unrelated, disclosed, security-motivated reason, that file
was removed from the protected list (the other four files remain protected and
unaffected), and a new, explicit "disclosed exception" test was added asserting the
divergence is present and attributed to this fix (so a future silent revert of the fix
back to the pre-fix baseline would itself be caught). This is a visible, documented test
update, not a silent deletion of an inconvenient check.

## Disposition of the other findings

### §4 Probes A/B — general re-parenting/re-leveling ownership gap
**Same root cause, distinct residual risk. Partially closed by this fix; the remainder is
explicitly DEFERRED.**

The producer-immutability fix closes both of the reviewer's *reproduced* Probe A and
Probe B constructions exactly as demonstrated, because both probes were performed by an
actor other than the goal's true producer (`actor-B`/an "unrelated actor" respectively) —
they are now denied `DENY_PRODUCER_IMMUTABLE` before any re-parenting or re-leveling can
take effect (see the committed regression test above).

However, a **narrower residual gap remains, disclosed here rather than silently left
implicit**: nothing stops the TRUE original producer (or any caller who supplies that
exact, self-declared `provenance.agent_id` string, since it is not authenticated) from
re-parenting or re-leveling a goal via a legitimate-looking re-version — because
`level`/`parent_goal_id` are, *by design*, meant to stay mutable for normal lifecycle
re-versioning (this is explicit in the fix's own scope: "content/hierarchy/status fields"
must remain changeable). Closing this residual gap fully would require an actual
caller-identity/authorization model — answering "is the caller who they claim to be, and
are they authorized to submit a new version of this specific goal_id at all" — which does
not exist anywhere in this codebase today (every actor identity in every service reviewed,
including `capability-registry-service.mjs`, is a self-declared `provenance.agent_id` /
`source_identity.maintainer` string, never an authenticated caller credential). Inventing
that model is a genuine, larger design decision (transfer-of-ownership semantics,
authenticated-caller plumbing, and its interaction with legitimate collaborative
re-versioning) squarely out of scope for this bounded security patch, and rushing it risks
breaking legitimate multi-actor goal editing. **Deferred, named**: recommend a dedicated
follow-up design/gap-assessment record before `GoalGraphService` is adopted as a live
authority surface (mirrors the reviewer's own framing that this finding "must close before
that adoption" — the SoD bypass itself is now closed; the residual same-producer
re-parenting gap is a separate, lower-severity, explicitly-named follow-up).

### §2 — cycle-detection test-coverage gap (LOW/INFO)
**Fixed.** The reviewer confirmed the `reason: "CYCLE"` branch in
`goal-rollup-projection.mjs`'s `rollupParent` had zero test coverage — real or
fake-read-surface — and is unreachable via the *real* `GoalGraphService` API under the
current fixed 3-level hierarchy (verified independently by the reviewer's own construction
attempts). A new test, `"a mutual parent/child reference (version-shadowed cycle) surfaces
as a CYCLE-degraded entry, not infinite recursion"`, was added to
`tests/goal-rollup-projection.test.mjs` using the same fake-read-surface technique the
existing `UNEXPECTED_CHILD_LEVEL` test already uses (per the reviewer's own
recommendation): two nodes are given each other's id as `parent_goal_id`, producing a
genuine multi-hop mutual reference; since `rollupParent` checks `visited.has(child.goal_id)`
*before* the expected-child-level check, this directly and correctly exercises the CYCLE
branch, confirming it degrades gracefully (no throw, no infinite recursion) rather than
leaving the invariant entirely unexercised. No source change was needed — the guard itself
was already correctly written, only untested. `goal-rollup-projection.mjs` was not modified.

## Status fields

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: existing
risk_class: high
self_certification:
  agent_id: claude-motor
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

## Disposition

The reviewer's primary finding (§4, the force-retire SoD bypass via producer-version
spoofing) is closed: the exact three-step exploit chain is reproduced pre-fix and
confirmed denied post-fix by this producer, with a permanent regression test committed.
The two reproduced Probe A/B constructions are also now denied by the same fix. A
narrower, distinct residual re-parenting risk (same-producer re-parenting, or
producer-string guessing, absent an authenticated-caller model) is explicitly disclosed
and deferred as a separate, named follow-up rather than silently left unaddressed. The
cycle-detection coverage gap (§2, LOW/INFO) is closed with a direct regression test; the
underlying guard needed no code change. This is a local commit on
`bst/mod-work-sod-version-spoof-fix-001`, based on current `main` @ `385ac65`. Not pushed,
no PR opened, no merge — per AMD-002 rev 2 advise-and-proceed, this candidate is prepared
and ready for asynchronous GOV ratification at operator merge review; it carries no
authority to self-declare complete or production.
