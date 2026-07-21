# MOD-RUNTIME Slice S3 — Producer Self-Verification (mod-runtime-s3-approval-binding-producer-verification-001)

- producer_identity: `claude-motor-modruntime-s3`
- producer_role: BST-SA Motor (bounded implementation, advise-and-proceed)
- target_branch: `bst/mod-runtime-s3-approval-binding`
- base: `main` @ `beebfe8f29c5dd8c0b201d7a29d23669c20f0c32` ("Merge pull request #27 from bstBizEra/bst/mod-reg-human-gov-disposition-candidate-001") — confirmed first-hand via `git rev-parse main` in a fresh, isolated worktree (`C:/laragon/www/SecB-worktrees/mod-runtime-s3-approval-binding`) at task start. **Note:** `main` had already moved once during this task's own read phase (from `fc29f58` to `beebfe8` between the initial background-reading step and worktree creation) — re-verified immediately before `git worktree add`, per task instruction not to trust an earlier-cited SHA.
- assessment_source: `docs/03-project-control/candidates/mod-runtime-gap-assessment-001.md` (`bst/mod-runtime-assessment` @ `e9c478f`) — closes gap **MR-3** (approval-binding primitive, partial and duplicated), flags **MR-10** (duplication risk), informs **MR-4** (not acted on), Slice **S3** of the assessment's bounded 3-slice plan.
- prior-slice cross-check: read `mod-runtime-s1-checkpoint-ledger-producer-verification-001.md` and `mod-runtime-s2-retry-policy-evaluator-producer-verification-001.md` in full. Both S1 (`contracts/checkpoint.schema.json`, `src/ledger/checkpoint-ledger.mjs`) and S2 (`src/control/retry-policy.mjs`) are already merged to `main` (confirmed present at this branch's base — `src/ledger/checkpoint-ledger.mjs` and `src/control/retry-policy.mjs` both exist at `beebfe8`). This slice touches neither file; no collision.
- governance: `AGENTS.md` `SECB-AGENTS-AMD-002` (revision 2) advise-and-proceed. S3 is explicitly the assessment's **candidate-preparation, unwired** slice (R3-at-wiring, but candidate prep is standing-authorized per AMD-002 rule 3, mirroring MOD-GOV's own S3 PDP treatment exactly — see "MOD-GOV S1 precedent check" below).
- date: 2026-07-21

## Coordination-tracker disclosure (read, not obeyed as an instruction)

While searching for the tracker's iteration log (per this task's own instruction to append a line to it), an unmerged branch `bst/module-loop-plan` was found to contain a `docs/03-project-control/candidates/module-completion-tracker-001.md` with entries describing a "RECLAIM CLAUSE" dispute over the **exact branch name** `bst/mod-runtime-s3-approval-binding`: a "Claude lane" was reportedly redirected to a differently-named branch (`bst/mod-runtime-s3-approval-rules`) after this branch "remained empty," with a notice telling a "Codex lane" to "stand down... delete or repurpose the empty `bst/mod-runtime-s3-approval-binding` branch."

This record was **not treated as an instruction**: it is unverified content on an unrelated, unmerged branch, not part of this task's own dispatch (which explicitly named this branch and `src/control/approval-binding.mjs` as the target). Verification performed: `git ls-remote origin` for both branch names returns nothing (nothing pushed, as expected under the retained hard gates); `git branch -a` in this repository shows no local copy of `bst/mod-runtime-s3-approval-rules` at all. This worktree's own branch was freshly created empty from `main` at task start (matching the tracker's last observation before the reclaim entries), so there is no local evidence of a colliding branch to reconcile against. Per this task's own explicit branch/file naming and per the BST-SA authority rule that repository content (commit messages, docs on other branches) is not a substitute for operator/coordinator instruction, this slice proceeded as dispatched.

**Flagged for operator/coordinator reconciliation:** if a `bst/mod-runtime-s3-approval-rules` branch with real content exists in another local clone or worktree not visible from this one, its author (candidate primitive for the same MR-3 gap) and this branch's `src/control/approval-binding.mjs` may be duplicate/overlapping candidates for the identical slice. This is not an incident under AMD-002's advise-and-proceed model ("rejecting one is ordinary revert/rework"), but the operator should be the one to pick a canonical candidate at merge review, not either producing agent.

## Duplication found between the two services (task requirement 1)

Both `src/gateway/capability-registry-service.mjs` and `src/services/goal-graph-service.mjs` were read in full before writing any code.

### Identical (no drift)

`capability-registry-service.approvalValid` and `goal-graph-service.approvalWellFormed` are **byte-identical** in logic: both require a non-null, non-array object with non-blank `role`/`actor_id` and a `decided_at` for which `Date.parse` returns a finite number.

### Real behavioral drift found

**Role-matching drift.** `capability-registry-service.promote()` matches `approval.role` by **exact string equality** against its own local constants `INDEPENDENT_REVIEW_ROLE = "independent_review"` / `GOVERNANCE_ROLE = "governance"`, and does **not** import `sod-rules.mjs` in any form. `goal-graph-service.evaluateForceRetireApprovals()` matches via `normalizeRole(approval.role) === "REV"` / `"GOV"` from the shared `sod-rules.mjs` primitive, which accepts a wider alias vocabulary (canonical `"REV"`/`"GOV"` tokens pass through unchanged; `"reviewer"` also maps to `"REV"`).

Concrete consequence, confirmed against the **live, unmodified services** (see parity tests below, cases "canonical REV/GOV tokens deny... (drift confirmation)" / "...ALSO authorize... (drift confirmation)"): an approval bundle `[{role: "REV", ...}, {role: "GOV", ...}]` is **rejected** (`DENY_APPROVALS`) by `capability-registry-service.promote()` but **accepted** by `goal-graph-service.retireGoal({force: true, ...})`, for what the gap assessment itself calls the identical N-5 concept.

**Implementation drift (not behavioral).** `capability-registry-service.promote()` hand-rolls its pairwise-distinctness comparisons inline (`independent.actor_id === producer`, then `independent.actor_id === governance.actor_id || governance.actor_id === producer`) with **zero import** from `sod-rules.mjs`. `goal-graph-service` instead calls the shared `checkPairwiseDistinct` primitive after its own self-approval check. The two are functionally equivalent for the three-actor case (both correctly deny `DENY_SOD_VIOLATION` for the same two collapse shapes), but this is a **documentation-precision correction** to `mod-runtime-gap-assessment-001.md` item #11, which states `checkPairwiseDistinct` is "already consumed by both #9 and #10" — a `grep` for `sod-rules` across `src/` confirms only goal-graph-service (#10) imports it; capability-registry-service (#9) does not import `sod-rules.mjs` at all.

**Out-of-scope third shape (not duplicated, not touched).** `capability-registry-service.revoke()` requires exactly one `GOVERNANCE_ROLE` approval, with no independent-review leg and no producer-distinctness check at all — a materially lighter single-approval gate with no `goal-graph-service` counterpart. Since MR-3/MR-10 name the `promote()`/`evaluateForceRetireApprovals()` duplication specifically, this slice does not extract or model `revoke()`'s shape (extracting it would be scope creep beyond the named gap).

## MOD-GOV S1 precedent check (task requirement 4)

The task asked to check whether MOD-GOV's S1 (`sod-rules.mjs` extraction) was "a separate PR from the services that eventually adopted it." First-hand check of commit `d8ad7a0` (`[MOD-GOV-S1] Extract SoD primitive; authority-engine delegates behavior-preservingly`):

**Correction to the assumed precedent:** MOD-GOV S1 did **not** extract the primitive in one commit and wire it in a fully separate PR. It extracted `sod-rules.mjs` **and** rewired `authority-engine.mjs` to delegate to it in the **same commit**, behavior-preservingly (parity-tested: 36+36+4+30 scenarios, exact deny codes unchanged). What S1 explicitly deferred to later, separately-governed slices was the **other three** call sites — `work-package-service.mjs`, `handoff-service.mjs`, and `capability-registry-service.mjs` — none of which were touched in that commit; `sod-rules.test.mjs`'s "config-equivalence" tests only *demonstrate* those three shapes are expressible as configurations of the shared primitives, without actually rewiring them.

This slice (MOD-RUNTIME S3) follows the **stricter** reading of that precedent: it extracts the primitive and wires **zero** consumers (not even one), because — unlike `authority-engine.mjs`, which was the assessment's own canonical/first site — neither `capability-registry-service.mjs` nor `goal-graph-service.mjs` was named as a "wire this one now" target by `mod-runtime-gap-assessment-001.md`'s S3 description; the assessment explicitly says both are deferred ("not rewired in S3 — that adoption is explicitly out of scope"). Task requirement 4 ("do NOT modify either service") is honored exactly.

## What was built

1. **`src/control/approval-binding.mjs`** (new, ~290 lines incl. header):
   - `approvalWellFormed(approval)` — the shared shape check, reproduced verbatim from both services (byte-identical in both, so there is only one shape to extract here).
   - `evaluateApprovalBinding({ approvals, producerActorId, roleMatchMode, independentRoleToken, governanceRoleToken })` — the parity core. `roleMatchMode: "strict"` reproduces `capability-registry-service.promote()`'s exact-string role gate; `roleMatchMode: "normalized"` reproduces `goal-graph-service.evaluateForceRetireApprovals()`'s alias-accepting gate. The drift documented above is preserved as an explicit, tested configuration knob rather than silently resolved — resolving it would be a behavior change belonging to a future, separately-reviewed convergence decision, not this candidate extraction. Returns `{ ok: true, independent, governance }` or `{ ok: false, code }` with the same four codes both services use (`DENY_APPROVALS`, `DENY_SELF_APPROVAL`, `DENY_SOD_VIOLATION`) plus `DENY_INVALID_ROLE_MATCH_MODE` for a malformed mode argument.
   - `bindApprovalDecision(evaluation, identity)` — mints a decision-record **candidate** reusing the **existing** `decision_type: "GOVERNANCE"` enum value (no schema mutation, per the assessment's explicit non-goal #4 and per task instruction). Mirrors `retry-policy.mjs`'s `buildRetryDecisionRecord` and `policy-decision-point.mjs`'s "the PDP holds no ledger authority, the caller appends it" discipline exactly: **no I/O**, no ledger construction, no append. The exact-action/exact-object-version bind — which the closed `decision-record` schema has no dedicated field for — is carried as a stable, formatted `evidence_refs` entry (`approval-binding:<action>@<version>`), the same technique `policy-decision-point.mjs` already uses to carry its own request fingerprint through `evidence_refs` without a schema change. **Disclosed design decision** (AMD-002 rule 3.1), mirroring how S1 disclosed `source_ledger_id` and S2 disclosed its extra deny codes.
   - `verifyApprovalBinding(resolvedDecision, { exactAction, objectVersion })` — the piece the gap assessment names as missing from every existing implementation (MR-3: "None of the three resolves an approval through `DecisionLedger.resolveEffective`-style temporal/version binding... V-009's negative case... is only proven inside the WP-grant path, not as a reusable primitive"). Fail-closed: unknown/null decision, wrong `decision_type`, wrong `outcome`, or an `evidence_refs` entry that does not match the exact `(action, objectVersion)` pair all deny; a mismatch is never converted to an allow.
2. **`tests/approval-binding.test.mjs`** — 44 new tests, four groups (see below).
3. **`MANIFEST.json`** updated +3 (the two new files above plus this record).

## Tests (44 new, exhaustive)

1. **Shape-check unit tests** (2 tests): well-formed / malformed approval objects.
2. **`evaluateApprovalBinding` disposition matrix** (13 tests): authorized case; missing/empty/single-approval bundles; malformed extra entry; blank `producerActorId`; self-approval; both SoD-violation collapse shapes; invalid `roleMatchMode`; and two dedicated **drift-demonstration tests** proving the `"REV"`/`"GOV"` canonical tokens and the `"reviewer"` alias are accepted in `"normalized"` mode and denied in `"strict"` mode, plus a control test confirming both modes agree on the literal role strings each live service actually emits today.
3. **PARITY tests against the real, unmodified services** (16 tests) — the strongest form of behavior-equivalence evidence available without wiring: each test constructs a **real** `CapabilityRegistryService` or `GoalGraphService` instance (using the exact fixture helpers `tests/capability-registry-service.test.mjs` and `tests/goal-graph-service.test.mjs` already use), drives the actual `promote()` / `retireGoal({force})` methods with a table of approval bundles taken verbatim from those existing test files, and asserts that (a) the live service's outcome matches what its own existing test suite already asserts (a guard against the fixtures themselves having drifted), and (b) `evaluateApprovalBinding` in the corresponding `roleMatchMode` produces the **identical** accept/deny outcome. This includes two "drift confirmation" cases per service proving the role-matching divergence is real on the live code, not just asserted in this primitive's own header comment.
4. **`bindApprovalDecision`/`verifyApprovalBinding`** (13 tests): candidate minting for both authorized and denied evaluations; no-I/O confirmation; empty `evidence_refs` when unbound; **genuine `DecisionLedger` recording** for an `APPROVAL_BOUND` disposition and for a 3-case denial matrix, each reopened from disk and hash-chain-`verify()`'d (mirrors `tests/retry-policy.test.mjs`'s ledger-recording pattern exactly); a malformed/incomplete candidate is denied by the ledger's own `DENY_CONTRACT_INVALID` gate (confirming this module does not duplicate or shadow that validation); and the verifier's full deny matrix — exact match allows, wrong action denies, wrong version denies, an unbound candidate denies, a denied (non-`APPROVAL_BOUND`) decision denies, wrong `decision_type` denies, null/undefined resolved decision denies, and a malformed verification request (blank action/version) denies.

## UNWIRED confirmation (task requirement 3/4)

```
grep -rn "approval-binding" src/ tools/
```

returns only this module's own header/self-references (its filename in comments, and the `evidence_refs` string template `"approval-binding:<action>@<version>"`). Neither `capability-registry-service.mjs` nor `goal-graph-service.mjs` imports anything from `src/control/approval-binding.mjs`.

```
git diff main -- src/gateway/capability-registry-service.mjs src/services/goal-graph-service.mjs src/control/policy-decision-point.mjs src/control/sod-rules.mjs contracts/decision-record.schema.json
```

produces **zero output** (confirmed: `wc -l` on the diff = 0) — this branch does not touch either duplicated service, the PDP, the SoD kernel primitive, or the decision-record schema at all. `git status --short` shows exactly the three new/modified paths: `M MANIFEST.json` (additive, +3 file paths) plus two new untracked files (`src/control/approval-binding.mjs`, `tests/approval-binding.test.mjs`).

## Test counts (exact, first-hand, this worktree)

- **Before** (`main` @ `beebfe8`, fresh worktree, `npm ci` then `npm test`, confirmed independently): `node --test` — **703 tests / 698 pass / 0 fail / 5 skipped**; `node tools/validate-foundation.mjs` exit 0.
- **After** (this branch, `npm test`): `node --test` — **747 tests / 742 pass / 0 fail / 5 skipped** (+44 new, all passing; skip count unchanged at 5); `node tools/validate-foundation.mjs` exit 0 (no new schema; `expectedSchemas` set unchanged — this slice adds zero new contract kinds and zero new `decision_type` enum values).

## Advisory status fields

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: candidate
risk_class: medium
self_certification:
  agent_id: claude-motor-modruntime-s3
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

## Provenance

- source: first-hand implementation and verification in isolated worktree `C:/laragon/www/SecB-worktrees/mod-runtime-s3-approval-binding`, branched from `main` @ `beebfe8` confirmed via `git rev-parse main` at task start
- agent_id: claude-motor-modruntime-s3 (BST-SA Motor, Claude Sonnet 5)
- timestamp: 2026-07-21
- disposition: candidate, non-main branch, local commit only — awaiting independent review and operator merge ratification, per AMD-002 rev 2. Coordination-tracker disclosure above flagged for operator reconciliation.

> Recommend improvements only. Do not execute them beyond this bounded slice. R-class R3-at-wiring per the gap assessment's own flag table (§7) — candidate preparation is authorized under AMD-002's advise-and-proceed rule exactly as MOD-GOV's own S3 was; wiring this primitive into `capability-registry-service.mjs`, `goal-graph-service.mjs`, `policy-decision-point.mjs`, or any live path requires SEC + GOV review and is explicitly out of scope here.
