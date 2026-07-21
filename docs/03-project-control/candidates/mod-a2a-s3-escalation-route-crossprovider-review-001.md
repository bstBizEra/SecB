# MOD-A2A Slice S3 — Independent Cross-Provider Review (mod-a2a-s3-escalation-route-crossprovider-review-001)

- reviewer_identity: `claude-rev-a2a-s3-crossprovider-01`
- reviewer_role: BST-SA worker (independent cross-provider review; advisory only, no execution/merge/approval authority)
- review_type: cross-provider — Codex-produced candidate (`codex-root` / `ENGIN`), Claude-independent REV/SEC review, no reliance on producer's own review-dispatch commits
- candidate_branch: `codex/mod-a2a-s3-escalation-route` @ `9155246` (retargeted per TASK-015; implementation SHA `420d6af`, tree `d5a9bf2`)
- merge-base with `origin/main`: `6a928a1`
- current `origin/main` tip at review time: `ee31db7`
- distance: merge-base is **129 commits behind** current main tip; candidate is 5 commits ahead of merge-base
- producer_record (read, NOT trusted, independently re-derived): `docs/03-project-control/candidates/mod-a2a-s3-escalation-route-producer-verification-001.md`
- review_request (read, NOT trusted as a review, only as scope): `docs/03-project-control/candidates/mod-a2a-s3-escalation-route-independent-review-request-001.md`
- date: 2026-07-21
- environment: isolated git worktree (`git worktree add --detach`) at a scratch path outside the live repo; `npm ci` clean (6 packages, 0 vulnerabilities); node `v24.12.0`, npm `11.6.2`; no push, no merge, no touch of the live branch; review artifact committed via detached-HEAD worktree + `git update-ref`

---

## Verdict: APPROVE_WITH_NOTES

The candidate is a small, correctly-scoped, pure, deny-by-default, **UNWIRED** escalation-route evaluator (`src/control/escalation-route.mjs`, 47 LOC) consistent with the S1/S2 precedent of shipping unwired primitives ahead of a later wiring slice. It reuses the shared `HANDOFF_ACCEPTANCE_LADDER`/`normalizeRole` role vocabulary from `sod-rules.mjs` rather than inventing a parallel role table, performs no I/O, ledger append, dispatch, or grant, and every guarded/reused foundation file (`delegation-ledger.mjs`, `delegation-request.schema.json`, `sod-rules.mjs`, `delegation-gate.mjs`, `non-escalation-comparator.mjs`, `risk-registry.mjs`) is byte-identical across the merge-base, current main, and the candidate — verified by hash, not by trusting the producer's claim. Full suite and both targeted/foundation validators are green, independently reproduced to the exact same totals the producer reported. No hardcoded test-ID branching found.

The one substantive design note (M2 below) is that this module never consults S2's actual gate outcome — it has no parameter for a prior `evaluateDelegation` decision at all, so nothing in *this candidate* enforces "escalation route only follows a genuine S2 denial." That is acceptable for a deliberately unwired, standalone pure-function slice (S1 and S2 each carried the identical kind of deferral), but it is a load-bearing invariant that must be made an explicit, non-optional requirement of whichever future slice wires this module into a live path — it is not yet written down anywhere in this candidate's own comments (unlike S2's explicit "S2 does not depend on S1" rationale). Nothing here blocks merge of the unwired candidate itself.

---

## What "escalation route" actually does (read from code, not assumed from the name)

`escalation_route` is a field on S1's own `delegation-request` schema (`contracts/delegation-request.schema.json`, required, `type: string`) — declared **at request-creation time by the original requester**, naming which role (`REV`/`QA`/`GOV`, the same set as `HANDOFF_ACCEPTANCE_LADDER`) is authorized to pick up the case if the request is later denied. This candidate does not decide *whether* a delegation is denied (that remains S2's `evaluateDelegation`, untouched) — it decides *whether a given actor claiming a given role is the legitimate handler for a given delegation's pre-declared escalation route*, and mints/verifies a tamper-evident, replay-bound `GOVERNANCE` decision record for that binding. Three pure functions:

- `evaluateEscalationRoute({ delegationCandidate, escalationActorRole, escalationActorId })` — deny-by-default checks: well-formed candidate (id/version/source/route present) → well-formed actor identity → role is one of `REV/QA/GOV` and matches the request's declared `escalation_route` → `escalationActorId !== source_actor_id`.
- `bindEscalationRoute(input, identity)` — mints a deep-frozen `GOVERNANCE` decision record (reuses the existing `DecisionLedger` decision-type vocabulary; no new ledger, no new schema) whose `evidence_refs` carries an injective binding string over `[delegationId, version, role, actorId]`.
- `verifyEscalation(decision, { exactDelegationId, exactDelegationVersion, escalationActorRole, escalationActorId })` — re-derives the same binding string and requires an exact match against a previously-bound decision, denying on wrong decision type, non-bound outcome, unauthorized role, or any one-dimension mismatch (replay protection).

No consumer imports this file anywhere in `src/` or `tools/` (grep-confirmed); its only reference outside its own test is a pre-existing comment in `delegation-ledger.mjs` explicitly deferring consumption of the `escalation_route` field to "the assessment's separate S3 slice" — i.e. this candidate is that deferred slice's pure-evaluator half, not its wiring.

---

## Findings by severity

### Blocking
- none.

### Medium
- **M1 (merge-cleanliness, process not code):** `git merge-tree --write-tree codex/mod-a2a-s3-escalation-route origin/main` reports `CONFLICT (content): Merge conflict in MANIFEST.json` (exit 1) — the only conflicting file. Both current main (67 files, many unrelated MOD-WSPACE/P0-18/P0-19/P0-20/governance artifacts merged since the base) and this candidate append distinct entries to the tail of the same `artifacts` array. Pure additive-vs-additive JSON-array conflict, trivially resolved by keeping both tails. Identical finding class to S2's own M1. Not a defect of the candidate; a retarget/rebase onto current main clears it.
- **M2 (missing enforced linkage to S2's actual decision — documentation/future-wiring gap, not a defect in this candidate's own code):** `evaluateEscalationRoute` takes no gate-decision input and neither imports nor calls `delegation-gate.mjs`'s `evaluateDelegation` or `non-escalation-comparator.mjs`'s `withinCeiling`. Confirmed by import list (only `sod-rules.mjs`) and by probe: calling `evaluateEscalationRoute` on a delegation candidate that was **never evaluated by S2 at all** still returns `{ ok: true, ... }` (probe A below) — nothing in this module's own logic requires or can require a prior denial, because it is never given one. For a slice literally named "escalation route" (i.e., the path taken *after* S2 denies), this is the one place where a reader could reasonably expect linkage to S2's outcome and find none. Given the established S1/S2 precedent of shipping deliberately-unwired, standalone pure functions with wiring deferred to a later slice, this is not a defect in the candidate as scoped — but unlike S2's own code comments, which explicitly document *why* S2 does not depend on S1 ("operates on ceilings directly"), this candidate carries no equivalent one-line rationale for why it does not depend on S2's decision, or an explicit note that a future wiring layer **must** pass a freshly-read S2 denial (matching exact delegation id+version) as a precondition before invoking `bindEscalationRoute`. Recommend this be written down — either in this file's header comment or the eventual wiring slice's spec — before any wiring work begins, so a future implementer cannot accidentally wire "escalation" to run independently of an actual S2 denial, or against a stale/superseded delegation version (the TOCTOU risk this module's own purity defers, not eliminates).

### Low / advisory
- **L1 (case-sensitive self-escalation check; disclosed-class confusable):** Probe F: `source_actor_id: "Producer"` vs `escalationActorId: "producer"` → `evaluateEscalationRoute` returns `ok: true` (does NOT deny as self-escalation). The check is an exact `===` string comparison, consistent with this codebase's house convention that identity/scope comparisons are exact-string (S2's own review found and accepted the same class of case/whitespace/homoglyph confusable behavior for path/tool matching). No exploit demonstrated against current actor-id conventions in this repo (ids observed elsewhere are canonical/lowercase), but actor-identity confusables carry a different risk profile than path/tool confusables — flag for disclosure at wiring time: whatever identity system supplies `source_actor_id`/`escalationActorId` to this module must itself guarantee canonical, case-normalized actor ids, since this module performs no normalization of its own.
- **L2 (narrow SoD: only `source_actor_id` excluded, not a full actor-history ladder):** the candidate derives `ESCALATION_ROLES` from `HANDOFF_ACCEPTANCE_LADDER`'s **keys** only (`REV`/`QA`/`GOV`) — it does not reuse `checkProhibitedActors` or the ladder's per-role prohibited-actor lists (e.g. `GOV`'s real ladder excludes `source, executors, reviewer, qa`). This is because a raw `delegation-request` record carries no `executors`/`reviewer`/`qa` history fields to check against — the data simply isn't there at this layer, so a fuller ladder-based check isn't currently possible without inventing fields. The producer's own verification record discloses exactly this limitation ("The assessment's role-only API could not prove self-escalation... must be explicitly reviewed before any consumer adopts it") — confirmed honest, not swept under the rug. No action needed for this slice; a future wiring slice that has access to fuller actor-history should reuse `checkProhibitedActors` directly rather than re-deriving a narrower check.
- **L3:** MANIFEST.json diff itself is purely additive (+4 lines: 2 new source/test paths, 2 new doc paths) — confirmed by direct diff read, not just producer's claim.

### Positive / disclosed-and-accepted
- Bound decision records and their `evidence_refs` arrays are genuinely `Object.freeze`d (probe H: mutation attempt throws `TypeError`) — stronger than S2's own precedent, where S2's review (L1) noted `evaluateDelegation`'s returns were *not* frozen. This candidate improves on that.
- Role vocabulary reuse confirmed structurally correct: `ESCALATION_ROLES` is `Object.keys(HANDOFF_ACCEPTANCE_LADDER)` (test 1 and probe both confirm `['REV','QA','GOV']`), not a duplicated literal array.
- No overlap/duplication with S2's ceiling-comparison logic — this module's SoD/role check is an orthogonal concern from S2's authority-ceiling check, so there is no reimplementation of S2's actual escalation (non-escalation) comparator logic anywhere in this file.
- Prototype-pollution probe (JSON.parse with a literal `"__proto__"` key) does not leak an alternate `escalation_route` value — expected and correct, since `JSON.parse` defines `"__proto__"` as an ordinary own data property rather than mutating the prototype chain; own-property destructuring reads the real declared value. Recorded as a confirmed non-issue, not assumed safe.

---

## Reuse verification (S1 `DelegationLedger`, S2 `delegation-gate.mjs` / non-escalation-comparator)

| Question | Answer |
|---|---|
| Does S3 import/call S1's `DelegationLedger`? | **No.** Zero imports from `src/ledger/delegation-ledger.mjs`. It structurally consumes the same field names S1's schema defines (`delegation_id`, `version`, `source_actor_id`, `escalation_route`) but performs no ledger read/write — consistent with "pure, unwired." |
| Does S3 import/call S2's `delegation-gate.mjs` or `non-escalation-comparator.mjs`? | **No.** Only import in `escalation-route.mjs` is `{ HANDOFF_ACCEPTANCE_LADDER, normalizeRole }` from `sod-rules.mjs`. See M2 — this is the review's central finding. |
| Does S3 reimplement any S1/S2 comparison logic in parallel? | **No.** It does not reimplement ceiling comparison, risk-class lookup, or delegation-ledger validation — its own logic (role-ladder membership + route match + self-escalation exclusion) is a distinct concern S1/S2 don't already cover, and it reuses the one primitive that does overlap (role vocabulary) rather than re-declaring `['REV','QA','GOV']` as a new literal. |
| Net verdict on reuse discipline | Correct reuse of what overlaps (role vocabulary); correct non-duplication of what doesn't (ceiling/risk logic); but a real, disclosed **absence** of linkage to S2's actual decision outcome (M2), which is the one place "reuse" would have meant something operationally significant (proving escalation only follows genuine denial) rather than just avoiding a duplicate literal table. |

---

## TOCTOU / atomicity

This module performs **no I/O and holds no ledger reference** — same "pure decision function" shape as `delegation-gate.mjs`. There is no internal check-then-act window because there is no external state read at all; every input is supplied by the caller in one synchronous call. This means:

- **No TOCTOU exists within this candidate's own code.** Confirmed by inspection (no `fs`, no ledger import, no clock read) and by the full test/probe suite showing fully deterministic, side-effect-free behavior.
- **The TOCTOU risk is deferred, not eliminated**, to whatever future wiring layer reads a delegation's current ledger state, evaluates S2, and then calls this module. That caller must read the delegation's current version and S2's outcome **atomically** (or under the same lock/read used by `DelegationLedger`'s optimistic-version scheme) before calling `bindEscalationRoute` — otherwise a delegation could be re-versioned or re-decided between the S2 check and the escalation bind. This module's own `version`-exact-match replay check in `verifyEscalation` (probe I, L probes) gives a future wiring layer the *tool* to detect a stale bind after the fact, but does not itself enforce atomicity at bind time. Recorded as a residual risk for the wiring slice, not a defect here.

---

## Authority-boundary / self-escalation

- `escalationActorId === source_actor_id` is denied (`DENY_SELF_ESCALATION`) — the original requester cannot bind themselves as their own escalation handler under their own actor id. Confirmed by targeted test and independently reproduced (probe, denied).
- The check is **narrow**: it excludes exactly one identity (`source_actor_id`), not a broader set (see L2). A requester who can obtain/control a second actor identity carrying the declared escalation role is not detected or prevented by this module — identity assurance (one human/agent cannot mint themselves a second qualifying actor id) is necessarily out of scope for a pure decision function and must be guaranteed by whatever authenticates `escalationActorId` upstream. Not a code defect; flagged as a boundary condition this module cannot itself close.
- Because the module never confirms an actual S2 denial occurred (M2), a requester who fabricates a plausible-looking `delegationCandidate` (with a self-declared `escalation_route`) that was never actually put through S2 could, once a wiring layer exists, obtain an `ESCALATION_BOUND` record without ever having been gated — **provided also that they can name a real, distinct, role-matching `escalationActorId` to perform the bind**. That second condition is the actual barrier today; it is an identity/authentication barrier, not one this module enforces structurally. This is the most important thing for the wiring slice to close explicitly.

## Separation of duties

- Escalation handler (`escalationActorId`) is required to differ from the original requester (`source_actor_id`) — the one SoD dimension this data shape can express. See L2 for why a fuller ladder (excluding executors/reviewer/qa) isn't yet checkable at this layer, and confirmation that the producer disclosed this rather than concealing it.

---

## Spec conformance (held to the review-request's own required probes, `mod-a2a-s3-escalation-route-independent-review-request-001.md`)

| Required probe | Result |
|---|---|
| `ESCALATION_ROLES` derives from shared handoff SoD ladder, no drift from REV/QA/GOV | confirmed (`Object.keys(HANDOFF_ACCEPTANCE_LADDER)`, test + probe) |
| Malformed delegation records, malformed roles/actors, unknown roles, route mismatch, self-escalation | all deny with distinct, correct codes (targeted tests + probes B/D/G/K) |
| Exact binding + replay across delegation ID, version, role, actor identity | confirmed (probe I, L; replay across all 4 dimensions denies `DENY_DELEGATION_MISMATCH`) |
| Wrong decision type, denied outcome, missing evidence binding, malformed verification requests fail closed | confirmed (targeted test "unknown, malformed, wrong type and denial deny") |
| Emits only schema-shaped `GOVERNANCE` records, injective binding references, no I/O/ledger append | confirmed by code read; `decision_type: "GOVERNANCE"` reuses existing enum, no new schema |
| No existing service/schema/policy/gateway/transport file modified; candidate unwired | confirmed — diff touches exactly 2 new src/test files + 2 new docs + MANIFEST (+4 lines); grep confirms zero live-path importers |

All required probes pass. This review additionally ran probes the request did not enumerate (prototype-pollution attempt, case-sensitivity of self-escalation and role literals, version-type coercion, NaN/zero/negative version, array-as-candidate, cross-role replay) — see probe log above; all denied or behaved as documented, no new defect found beyond L1/L2/M2 already discussed.

---

## Regression (independently reproduced, not copied from the producer record)

- `node --test tests/escalation-route.test.mjs`: **12 total, 12 pass, 0 fail** — matches producer's reported count exactly.
- `npm test` (full suite): **800 total, 795 pass, 0 fail, 5 skipped, 0 todo** — matches producer's reported "after" totals exactly.
- `node tools/validate-foundation.mjs`: exit `0`, all checks `PASS`.
- `npm ci`: clean, 6 packages, 0 vulnerabilities.
- Hardcoded test-ID branching: grepped `src/control/escalation-route.mjs` and repo-wide for delegation-id/route literal branches (`del-1`, `test-`, `demo`, `debug`, etc. used as `if`/`===` conditions) — none found outside the test file's own fixtures.

---

## Merge-cleanliness vs main @ `ee31db7`

- `git merge-tree --write-tree codex/mod-a2a-s3-escalation-route origin/main`: exit 1, **CONFLICT (content) in MANIFEST.json only** — additive-vs-additive array-tail conflict, trivially resolvable (keep both tails). No other file conflicts despite the merge-base being 129 commits behind current main.
- All files this candidate reuses or depends on (`delegation-ledger.mjs`, `delegation-request.schema.json`, `sod-rules.mjs`, `delegation-gate.mjs`, `non-escalation-comparator.mjs`, `risk-registry.mjs`) are **byte-identical** across merge-base, current main, and the candidate (verified via `git hash-object` on each ref, not assumed). The 129-commit gap is therefore not a merge-safety concern for this candidate specifically — the distance is real (main has taken on substantial unrelated MOD-WSPACE/P0-18–20/governance work since the base) but none of it touches any file this slice reads or writes, beyond the one mechanical MANIFEST tail-append.

---

## Authority / governance boundary

- Candidate is **UNWIRED**: no live path imports it; it accepts/rejects/dispatches/grants nothing; it appends to no ledger. This review is **advisory only** — it does not authorize merge, activation, wiring, or production. Operator/GOV retains merge authority. This reviewer does not merge to main, push, or self-authorize execution.

---

## Advisory status fields

- truth_status: `verified_true` (all claims re-derived first-hand in an isolated worktree; producer's own review-dispatch/producer-verification commits treated as unverified input, not as review)
- authority_status: `advisory_only`
- implementation_status: `existing` (candidate present and complete for its disclosed S3 pure-evaluator scope; wiring is explicitly out of scope and not yet built)
- risk_class: `low` (unwired, pure, deny-by-default, fully reversible; M2's residual risk is scoped to a not-yet-written future wiring slice, not to anything live today)

---

```yaml
self_certification:
  agent_id: claude-rev-a2a-s3-crossprovider-01
  peer_agent_id: codex-root
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
