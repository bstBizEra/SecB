# MOD-WORK (Work and Goal Graph) — SECOND Independent Review

**Record ID:** MOD-WORK-SECOND-REV-001 / mod-work-second-independent-review-001
**Status:** ADVISORY — reviewer verdict, not an authorization
**Reviewer:** claude-rev-modwork-second-01 (BST-SA REV/SEC role, independent — no relationship to the S1/S2/S3 producers, to the cortex assessment author, or to the sole completion reviewer `claude-immune-rev-modwork-complete-01`; that completion review is read for context only, not relied on for this review's own verdict)
**Date:** 2026-07-21
**Review target:** `origin/main` @ `385ac65` (S1 `6d05e58`, S2 `37d461d`, kernel reconciliation `07943e4`, S3 `e333b04`, merged via PR #12 `68ebe29`; already-merged code, already the tip of `main` at review time)
**Prior review of record:** `mod-work-completion-rev-001` (`a48969f`) — the ONLY previous review MOD-WORK has ever received: one broad, holistic module-completion pass. This is the first-ever dedicated adversarial slice-level review of MOD-WORK.
**Method:** independent, adversarial, first-hand. `git fetch origin main`, isolated detached-HEAD worktree (`C:/laragon/www/SecB-review-mod-work-s2`, no live branch touched), `npm ci`, full `npm test`, `node --test tests/goal-graph-service.test.mjs tests/goal-rollup-projection.test.mjs` in isolation, full read of `src/services/goal-graph-service.mjs`, `src/ui/goal-rollup-projection.mjs`, `contracts/goal.schema.json`, and both shipped test files, plus five hand-written adversarial probes against the LIVE service (not the shipped tests, not a fake read-surface) — run standalone in the worktree and deleted afterward per the ephemeral-script policy (not committed). No push, no merge, no modification of `main` or any existing branch.

---

## Verdict

**REQUEST_CHANGES (fast-follow — S1/S2/S3 remain merged; this does not reopen the merge)**

The prior completion review's first-hand-verified claims about hierarchy-ordering denials, audit-first/no-effect-on-deny, SoD alias convergence, and rollup read-only/immutability/completion-honesty are all independently reproduced here and hold up. But that review's own adversarial matrix probed only **single-version** hierarchy attacks (wrong level, missing parent, non-null PORTFOLIO parent, one version-shadow case tested purely for *read-time* chain-forging). It never asked what happens when a **second version of an already-registered goal_id** is submitted by a **different actor** with a different level, parent, or declared producer — and that is exactly where a real, previously-missed bug lives: `registerGoal` has **no ownership/continuity check across versions of the same `goal_id`**. Concretely and reproducibly, this lets an unrelated caller re-parent a goal it does not own into an arbitrary hierarchy, and — more seriously — lets the actor identity that the `retireGoal` force-retire N-5 Separation-of-Duties gate treats as "the producer" be silently changed by a later version, which **defeats the `DENY_SELF_APPROVAL` gate**: the true original owner can force-retire their own goal (bypassing active-children/linked-WP protection) by self-approving as independent reviewer, once any actor bumps the goal's version. This is a genuine authority-boundary gap, not a hygiene nit, and warrants a tracked fast-follow before anything adopts `GoalGraphService` as a live authority surface. One additional LOW/INFO finding (cycle-guard code with zero test coverage, and — verified — currently unreachable given the fixed 3-level hierarchy) is also disclosed. Two of the four requested focus areas (rollup TOCTOU/staleness, malformed-reference fail-closed) were independently re-verified as **genuinely sound** — explicit negative results, not hand-waved.

---

## 1. Test verification (first-hand)

- `npm ci`: clean install, 6 packages.
- `npm test` (`validate-foundation.mjs` + full `node --test tests/*.test.mjs`) on `origin/main`@`385ac65`: **tests 1098 / pass 1093 / fail 0 / skipped 5 / todo 0**.
- `node --test tests/goal-graph-service.test.mjs tests/goal-rollup-projection.test.mjs` in isolation: **35/35 pass, 0 fail** (19 service tests + 16 rollup-projection tests).
- All green. No regression, no flake observed across two runs.

## 2. Focus area — Hierarchy integrity / cycle detection

**Question asked:** can a goal be made its own ancestor, directly or via multi-hop chain, and is cycle detection exercised by a real multi-hop test or only a trivial case?

**Finding (LOW/INFO — test-coverage gap, but the underlying code path is verified unreachable, not exploitable):**

- The shipped test suite has **zero** test — not even a trivial self-parent case — that exercises the `reason: "CYCLE"` branch in `rollupParent` (`src/ui/goal-rollup-projection.mjs:126-130`). The one "broken hierarchy link" test in `goal-rollup-projection.test.mjs` (`"a broken hierarchy link surfaces as a DEGRADED entry, not a throw"`) uses a **fake `goalGraphService`** object to construct `UNEXPECTED_CHILD_LEVEL`, not `CYCLE`. No test — real or fake-service — ever reaches the CYCLE branch.
- I attempted, against the **real, live** `GoalGraphService` (not a fake read-surface), to construct a genuine multi-hop mutual-parent cycle via version-shadowing (the same technique the completion review used for its single-hop `DENY_HIERARCHY`/`DENY_BROKEN_CHAIN` probes, taken further): register `B` as PORTFOLIO, `A` as PRODUCT under `B` (valid — `B` currently resolves PORTFOLIO), then re-version `B` to OBJECTIVE with `parent_goal_id: "A"` (valid — `A` currently resolves PRODUCT). This **does** produce a real mutual parent-reference (`A.parent_goal_id === "B"` and `B.parent_goal_id === "A"`), reproducible today on `main`. But calling `rollupForGoal("A")` does **not** trigger the CYCLE guard: `B` is re-versioned to `OBJECTIVE`, and `rollupObjective` never recurses into a node's own children — it only rolls up linked work packages — so `B` is always a dead-end leaf in the traversal regardless of what points back at it.
- I then checked whether a cycle relevant to `rollupParent`'s *recursive* branch (i.e., a mutual reference between two nodes that are BOTH currently non-leaf, PRODUCT or PORTFOLIO) is constructible at all. It is not, given the current fixed `LEVEL_PARENT`/`EXPECTED_CHILD_LEVEL` model: a PORTFOLIO's `parent_goal_id` is always enforced `null` (it can never be anyone's "child"), and a PRODUCT's parent must resolve to PORTFOLIO **at that exact registration moment** — so for two currently-PRODUCT nodes to reference each other, at least one of them would have had to be PORTFOLIO-level at the other's registration time and PRODUCT-level now, but re-versioning it to PRODUCT afterward independently requires ITS OWN parent to resolve to PORTFOLIO at that later moment, which the other (already-PRODUCT) node cannot satisfy. I verified this by direct construction (two independent probe attempts) and both correctly denied `DENY_HIERARCHY`.
- **Conclusion:** the `visited`-based CYCLE defense in `rollupParent` is real, correctly written, and matches its own comment ("defensive against a version-shadowed graph"), but is — as far as I can construct — **dead code under the current 3-level fixed hierarchy**: no reachable input via the real `GoalGraphService` API triggers it, because the only level that can legitimately be "downstream" of two different parents (OBJECTIVE) never recurses further, and no two non-leaf levels can form a mutual reference given the per-registration level-matching check. This should be read as **"cycle detection is untested AND currently unexercisable,"** not "cycle detection is broken" — a materially different, and better, finding than a live gap, but the zero test coverage on defensive code that the authors clearly intended to matter (see the comment) is itself worth closing with an explicit fake-read-surface test (mirroring the existing `UNEXPECTED_CHILD_LEVEL` test's technique), both to lock the invariant and as a canary if `LEVEL_PARENT`/`EXPECTED_CHILD_LEVEL` are ever widened.

## 3. Focus area — Rollup TOCTOU / staleness under concurrent updates

**Question asked:** does the parent rollup read a single consistent snapshot, or could it mix current and stale child state if the graph mutates mid-computation?

**Finding: genuinely sound — explicit negative result, first-hand verified, not merely read off the comment.**

- `createGoalRollupProjection.rollupForGoal` calls `snapshotHierarchy(() => goalGraphService.listGoals())` **exactly once**, at the start of the call (`goal-rollup-projection.mjs:210`), building `byId`/`childrenByParent` `Map`s that the entire recursive `buildNode`/`rollupParent`/`rollupObjective` traversal consumes. It never calls `listGoals()` again mid-traversal, and `ctx.listLinkedWorkPackages`/`ctx.workPackageResolver` are the only other service calls made per node — both synchronous, and consulted once per goal, not re-consulted against a second live read of the goal hierarchy.
- The whole call is synchronous JavaScript with no `await`/yield point inside the traversal, so even setting the snapshot-discipline aside, there is no scheduling opportunity for `registerGoal`/`linkWorkPackage`/`retireGoal` to interleave mid-rollup in this single-threaded runtime — the snapshot pattern is (correctly) belt-and-suspenders against a future async caller, not compensating for an actual live race today.
- This is the one focus area where MOD-WORK does **not** repeat this project's recurring check-then-act/TOCTOU shape (MOD-RUNTIME-S3, MOD-LIVE, MOD-WSPACE-S3, MOD-GOV-S3's PDP). Worth stating explicitly rather than silently passing over, since a second-look review's job includes confirming what the first pass got right, not only what it missed.

## 4. Focus area — Authority/ownership boundaries (REAL BUG — the primary finding)

**Question asked:** can a caller modify or re-parent a goal it doesn't own, or move a goal into a hierarchy it shouldn't have access to? Is there a WP-path/traceability constraint enforced, or just assumed?

**Finding: REQUEST_CHANGES-level, reproduced against the live service, three escalating probes.**

`registerGoal` performs **zero ownership/continuity check** between a new version of a `goal_id` and any prior version of that same `goal_id`. It checks schema validity, reserved delimiters, `LEVEL_PARENT` ordering against whatever the *currently-resolved* parent happens to be, and duplicate `(goal_id, version)` — nothing ties a new version's `provenance.agent_id`, `level`, or `parent_goal_id` to the goal's prior version(s) or original producer.

**Probe A — cross-actor re-parenting of a goal the caller does not own (reproduced, `ok: true`):**
```
actor-A registers PF (PORTFOLIO), PR (PRODUCT, parent=PF)     -- both actor-A's.
actor-C registers PF2 (an unrelated PORTFOLIO), unrelated to actor-A.
actor-B (unrelated to A or C) registers PR v3: level=PRODUCT, parent_goal_id=PF2,
  provenance.agent_id="actor-B"
-> result: { ok: true }
current getGoal("PR") now shows producer "actor-B", parent "PF2" (was actor-A's "PF").
```
Nothing in `GoalGraphService` (and nothing in `src/` — `GoalGraphService` is imported by no caller anywhere else in the codebase today) checks that the actor re-versioning `PR` has any relationship to the actor who created it, and the goal is silently moved into a completely unrelated hierarchy with its recorded producer overwritten.

**Probe B — silent corruption of the meaning other goals already depend on (reproduced):**
A root PORTFOLIO `P` (with an existing PRODUCT `X` and OBJECTIVE `Y` already registered beneath it, both validated against `P` being PORTFOLIO) can later be re-versioned by an unrelated actor into an `OBJECTIVE` whose `parent_goal_id` is its own former child `X`. The re-version is accepted (`DENY_HIERARCHY` is not triggered, because at that instant `X` correctly resolves to PRODUCT). `getGoal("P")` afterward reports `level: "OBJECTIVE"` — the goal that used to anchor the whole tree as its root is now a leaf under its own child, with no re-validation of `X`/`Y`'s original hierarchy claims and no denial anywhere.

**Probe C — the concrete, exploitable consequence: force-retire SoD bypass via producer-spoofing (reproduced end-to-end):**
```
actor "owner-real" registers PF/PR/OBJ (OBJ producer = owner-real), links wp_1 to OBJ.
owner-real attempts retireGoal(OBJ, { force:true, approvals:[
    {role:"independent_review", actor_id:"owner-real", ...},
    {role:"governance", actor_id:"gov-1", ...}] })
-> DENY_SELF_APPROVAL   (correct: owner-real is the recorded producer)

ANY actor (no ownership check) re-versions OBJ (v2), same level/parent,
  but provenance.agent_id = "attacker-controlled-id"
-> { ok: true }   (registerGoal accepts it -- no continuity check on provenance)

owner-real retries the IDENTICAL retire call:
-> { ok: true, status: "RETIRED" }   -- DENY_SELF_APPROVAL is now BYPASSED,
   because evaluateForceRetireApprovals() compares against entry.producerActorId,
   which is now "attacker-controlled-id", not owner-real.
```
This directly defeats the N-5 pairwise-distinct-approval gate that `retireGoal`'s own docstring and the completion review's §3/§5 both treat as the module's one governance-critical control (mirroring the capability-registry promotion gate's SoD discipline). The gate's actor-distinctness math is sound (confirmed correct in isolation, matching the completion review's findings) — the defeat is entirely in the fact that "who is the producer" is not a stable, protected fact once a goal exists; it is silently rewritable by anyone via a subsequent version.

**Disposition:** This is real and reproducible against the live, already-merged `GoalGraphService` — no external wiring or WP-path adoption is required to trigger it; it lives entirely inside the class under review. The docstring's "external index only... grants no authority semantics" framing does not cover this: irrespective of whether the goal graph grants *work-package* authority, `retireGoal`'s own SoD gate is itself an authority decision, and it is undermined internally. **Recommend, as a fast-follow (not reopening the S1-S3 merge):** either (a) bind `producerActorId` immutably to the FIRST-ever-registered version of a `goal_id` and reject subsequent versions from a different `provenance.agent_id` unless that is an explicitly modeled, approval-gated "transfer" action, or (b) require an authenticated-caller identity check (not a self-declared `provenance.agent_id`) at `registerGoal` that is compared against the existing producer before a new version is accepted, or (c) at minimum, freeze `level` and require it to match all prior versions of the same `goal_id` (this alone would have blocked Probes A/B, though not necessarily every variant of Probe C, since a same-level re-version can still recompute-away the exact producer that C exploits). This should get a tracked follow-up record before any live caller adopts `GoalGraphService` as an authority surface (mirrors the completion review's own existing tracked-followup #1 on WP-path adoption — this finding raises the bar that must be cleared before that adoption, since adoption without a fix propagates this gap onto whatever depends on it).

## 5. Focus area — Malformed input fail-closed (unknown/malformed parent-link)

**Question asked:** does an unknown/malformed goal reference in a parent-link get silently ignored (treated as absent), or does it properly deny?

**Finding: genuinely sound — explicit negative result, first-hand verified.**

- `registerGoal`: an unresolvable `parent_goal_id` (`#resolveGoalId` returns `null`) denies `DENY_HIERARCHY` — never silently treated as "no parent" or "PORTFOLIO by default." Reproduced directly (`product({ parent_goal_id: "g_missing" })` -> `DENY_HIERARCHY`, matching the shipped test and re-confirmed independently).
- `linkWorkPackage`: an unknown/unresolvable goal denies `DENY_GOAL_NOT_LINKABLE`; an unresolvable work package (resolver falsy, `allowed:false`, or throwing) denies `DENY_UNKNOWN_WORK_PACKAGE` — all three variants re-verified against the live service, not just read off the test file.
- `traceChain`: a broken link at any hop (`product`/`portfolio` resolution failing or resolving to the wrong level) denies `DENY_BROKEN_CHAIN` rather than silently truncating the chain or reporting a partial/best-effort trace.
- `goal-rollup-projection.mjs`: an unresolvable work package is explicitly bucketed `UNKNOWN` and `deriveCompletion` short-circuits to `"UNKNOWN"` before any `"COMPLETE"` check — re-verified with a throwing resolver and a resolver returning no usable `status` field; neither is ever counted as complete.
- This module does **not** repeat the "silently degrade instead of deny" pattern most recently found in MOD-GOV-S3's PDP, for any of the malformed-reference paths I tested. Stated explicitly as a clean result, not passed over.

## 6. Test-suite quality sweep (hardcoded IDs / happy-path-only edge cases)

- `grep` for literal test-only ID branching or `NODE_ENV` gating inside `src/services/goal-graph-service.mjs` and `src/ui/goal-rollup-projection.mjs`: zero hits. No test-only code path in shipped source.
- Confirmed genuine coverage gaps beyond the CYCLE case (§2): no shipped test registers **two versions of the same `goal_id` with a different `level`, `parent_goal_id`, or `provenance.agent_id`** — the only multi-version test in the suite (`"listGoals enumerates highest-version goal summaries..."`) varies only `status` across versions, which is the one field the schema/service model actually expects to change over a goal's lifecycle. This exact blind spot is where §4's finding lives, and it is a genuine adversarial-coverage absence, not a subjective style nit.

## 7. Bug-class sweep (this project's recurring findings)

| Class | Result |
|---|---|
| Check-then-act / TOCTOU (rollup computed from a live vs. snapshotted graph) | **Not present** — single upfront snapshot, synchronous traversal (§3). |
| Authority/ownership boundary gap | **Found** — no producer/level continuity check across goal versions; defeats `retireGoal`'s N-5 self-approval gate (§4). |
| Silent-degrade-instead-of-deny on malformed/unknown references | **Not present** — every malformed parent/WP reference denies with a structured code (§5). |
| Cycle-detection coverage (trivial-only vs. real multi-hop) | **Worse than trivial-only: zero coverage at all**, and the guarded branch is verified currently unreachable given the fixed hierarchy (§2) — LOW/INFO, not a live bug. |
| Hardcoded test-ID branching | None found (§6). |

## 8. Advisory status fields

```yaml
truth_status: verified_true          # every claim in this record was reproduced first-hand against the live, already-merged service on origin/main@385ac65 in an isolated worktree; probes A/B/C in §4 and the cycle-construction attempts in §2 were executed, not merely reasoned about
authority_status: advisory_only      # independent reviewer verdict; no push, no merge, no authorization implied; the recommended fix in §4 is execution_requires_operator
implementation_status: existing      # S1/S2/S3 are already merged to main; this record reviews already-shipped code and recommends a fast-follow, it does not itself implement one
risk_class: high                     # the SoD force-retire bypass (§4, Probe C) is a genuine authority-boundary defeat reproducible against the live class with no external wiring required; contained today only by the fact that no caller has yet adopted GoalGraphService as a live authority surface (per the completion review's own tracked followup #1) -- this finding must be closed before that adoption, not after
```

## self_certification

```yaml
self_certification:
  agent_id: claude-rev-modwork-second-01
  peer_agent_id: claude-immune-rev-modwork-complete-01   # the sole prior reviewer, for provenance only -- not a joint approval
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

---

*Provenance — source: independent second-look review of MOD-WORK (`origin/main`@`385ac65`, S1 `6d05e58` / S2 `37d461d` / reconcile `07943e4` / S3 `e333b04`, merged PR #12 `68ebe29`) against its sole prior review `mod-work-completion-rev-001`@`a48969f`. No relationship to the S1/S2/S3 producers or to the completion reviewer. Timestamp: 2026-07-21. Agent ID: claude-rev-modwork-second-01. Cross-links: `mod-work-gap-assessment-001`, `mod-work-completion-rev-001` (prior review; its tracked followup #1 on WP-path adoption is superseded in priority by this record's §4 finding, which must close first), `MANIFEST.json`.*
