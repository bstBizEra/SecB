# MOD-WORK Gap Assessment 001

**Record ID:** MOD-WORK-GAP-001
**Module:** MOD-WORK — Work and Goal Graph (catalog scope: "Portfolio-to-task traceability", P0 priority Critical)
**Planner identity:** claude-cortex-modwork-assess-01 (BST-SA cortex, advisory)
**Baseline assessed:** unified `main` @ a8ef0d1 (branch cut FROM main)
**Governance:** AMD-002 advisory. READ-ONLY assessment except this record. No push, no merge.
**Status:** DRAFT — candidate advisory record, extend-only.

## Advisory status fields

- `truth_status`: verified_true (findings read directly from source at a8ef0d1)
- `authority_status`: advisory_only
- `implementation_status`: partial (WP linkage exists as free-text only; goal graph missing)
- `risk_class`: medium

## 1. Existing-surface inventory (read at a8ef0d1)

| Artifact | What exists | Relevance to traceability |
|---|---|---|
| `src/services/work-package-service.mjs` | `WorkPackageContractService`: P0-09 hardened WP lifecycle. Service-gated role edges, version-scope authority binding, supersession (`everAuthorized`, `EFFECTIVE_STATES`, `resolveEffective` with baseline assertion), SoD over ledger-derived actors, typed evidence obligations, optional `projectResolver` project-scope binding, per-record append-only `ledger`. | WP is the leaf of the traceability chain and is fully identity/version-bound. The `objective` field (schema line 12; service create-guard line 316) is validated **non-blank only** — it is a free-text string bound to no goal/objective entity. |
| `src/project/project-contract-service.mjs` | `ProjectContractService`: project-contract lifecycle DRAFT→REVIEW→APPROVED_NOT_EFFECTIVE→ACTIVE→SUSPENDED/REVOKED; `resolveEffective` returns the effective contract incl. `repositories`. | Project is the governance anchor above WP; `resolveEffective` is the pattern MOD-WORK should consume for effective-scope checks. No goal/objective concept. |
| `contracts/work-package.schema.json` | Closed schema (`additionalProperties:false`); `objective` is `string minLength 1`. No `objective_id`, no `goal_id`, no parent linkage. | Traceability id-binding is absent at the schema level. |
| `contracts/project-contract.schema.json` | Closed schema; no goal references. | No portfolio/objective anchor in the project contract. |
| `docs/templates/goal.yaml` (v0.1 pack) | Fields: `goal_id`, `parent_id`, `level` (PORTFOLIO/PRODUCT/MODULE/WORK_PACKAGE), `outcome`, `baseline`, `target{metric,value,due_at}`, `owners{accountable,governance}`, `evidence_required[]`, `review_triggers[]`, `status`. | A **template only** — no JSON schema, no validator kind, no service. It is the design intent for the goal entity, unrealized in code. |
| `docs/templates/schedule.yaml` (v0.1 pack) | `schedule_id`, `cadence{type,trigger,recurrence}`, `scope_ref`, `required_inputs/outputs`, `escalation_on_miss`. | Template only; no schema/service. Scheduling, not traceability. |
| `docs/12-execution/01-goal-system.md` (OM v0.1 DRAFT) | Goal hierarchy North Star→…→Module Goal→Work Package→Task→Session→Outcome Receipt; goal quality standard. | Names the portfolio→task chain MOD-WORK must make traceable. Doc-only. |
| `docs/12-execution/05-work-package-lifecycle.md` (OM v0.1 DRAFT) | A longer conceptual WP lifecycle (FRAMED…DELIVERED…LEARNING_REVIEW…CLOSED) and required WP fields incl. "parent goal". | Diverges from the authoritative code state machine (`STATE_MACHINES.WorkPackage`); "identity and parent goal" is a required field in doctrine but not in the closed schema. |
| `docs/12-execution/02-schedule-and-cadence.md` (OM v0.1 DRAFT) | Event-driven + rhythm cadence tables. | Confirms schedule is doctrine, not a P0 traceability primitive. |
| `docs/01-architecture/canonical-entity-model.md` | Entities `Objective`, `Outcome`; relationships `Project HAS Objective`, `WorkPackage ADVANCES Objective`, `Objective REALIZED_BY Outcome`. | The canonical target: `WorkPackage ADVANCES Objective` is the linkage MOD-WORK must enforce as ids. |
| `src/ui/report-projections.mjs` | Ops/live-report read projections (P0-17). | Precedent for a **pure read-model** module; no goal rollup exists. |

Confirmed absent in code (grep `goal` over `src/` → no matches): no `contracts/goal.schema.json`, no goal kind in `src/contracts/contract-validator.mjs` (`schemaPaths` lists 12 kinds, none a goal), no goal/objective service, no portfolio rollup projection.

## 2. Gap table

| # | Capability | State | Evidence |
|---|---|---|---|
| G1 | Goal/Objective entity as a closed contract | **Missing** | No `contracts/goal.schema.json`; `contract-validator.mjs` `schemaPaths` has no goal kind. Only `docs/templates/goal.yaml`. |
| G2 | Goal service (register + lifecycle + hierarchy enforcement) | **Missing** | No `src/services/goal-*.mjs`; grep `goal` in `src/` returns nothing. |
| G3 | Goal→WP linkage enforcement (`WorkPackage ADVANCES Objective` as ids) | **Partial (name-only)** | `work-package.schema.json` `objective` is free-text `string`; `work-package-service.mjs:316` validates it non-blank but binds it to no entity. Canonical model requires an id relationship. No referential check that the objective exists or is effective. |
| G4 | Portfolio→objective→WP traceability chain (parent linkage + level ordering) | **Missing** | `goal.yaml` template carries `parent_id`/`level` but nothing enforces hierarchy; no code holds the chain. |
| G5 | Portfolio rollup read models (goal progress from WP/evidence states) | **Missing** | No goal-rollup projection; `report-projections.mjs` covers ops, not goals. WP service exposes only per-WP `getWorkPackage`/`getDecisionLedger`/`resolveEffective`. |
| G6 | Schedule/cadence primitives | **Missing (defer)** | `schedule.yaml` template + doctrine only; no `schedule.schema.json`/service. Scheduling engine is outside the P0 traceability bar. |
| G7 | WP lifecycle-state coverage vs OM universal delivery loop | **Partial / divergent (defer)** | Code `STATE_MACHINES.WorkPackage` (16 states DRAFT…ACCEPTED/REVOKED) is authoritative; `05-work-package-lifecycle.md` lists a longer conceptual loop. Reconciliation is doctrine work, not a traceability primitive. |

Counts: implemented 0 · partial 2 (G3, G7) · missing 4 (G1, G2, G4, G5) · missing-defer 1 (G6). Traceability-critical gaps for P0: G1, G2, G3, G4, G5.

## 3. Bounded producer plan (≤3 slices)

P0 bar honored: ids, linkage, deny-by-default validation, read-only rollups. No scheduling engine, no UI, no authority mutation. Every slice extends existing contract patterns (closed schemas, fingerprints, deepFreeze, idempotency, ledger, injected resolvers) rather than new machinery.

### Slice 1 — Goal contract schema + validator registration (foundation, additive)

- **Files:** new `contracts/goal.schema.json`; edit `src/contracts/contract-validator.mjs` (add `goal` to `schemaPaths`); edit `tools/validate-foundation.mjs` (add goal to `expectedSchemas` set, add a `mandatoryIdentityFields` entry — required because line 90 filters that map for every schema file and would throw on an unmapped schema); new fixtures `tests/fixtures/valid/goal.json` + `tests/fixtures/invalid/goal-missing-id.json`; extend `tests/contract-validator.test.mjs`; add all new paths to root `MANIFEST.json`.
- **Behavior:** closed goal schema — `goal_id`, `version` (int ≥1), `project_id`, `parent_id` (string or null), `level` (enum PORTFOLIO/PRODUCT/MODULE/OBJECTIVE/WORK_PACKAGE), `outcome`, `baseline`, `target`, `owners`, `evidence_required`, `status`, `valid_until` required; `additionalProperties:false`. Deny-by-default validation; identity + version fields mandatory; fingerprintable via existing canonical-fingerprint.
- **Acceptance:** `validateContract("goal", valid)` passes; missing-id and unknown-field fixtures rejected; `expectedSchemas` set-equality still holds (goal added to both derived and expected sets); `npm run validate` exit 0; `node --test` green.
- **Size:** S (1 schema, 3 edits, 2 fixtures).
- **R-class:** **R2** — extends the fail-closed schema set and the validator identity-field map (governance tool). No authority semantics.

### Slice 2 — GoalGraphService (hierarchy + objective→WP linkage index, deny-by-default)

- **Files:** new `src/services/goal-graph-service.mjs`; new `tests/goal-graph-service.test.mjs`; add both to `MANIFEST.json`.
- **Behavior:** mirror `WorkPackageContractService` conventions (private fields, `deepFreeze`/`frozenClone`, idempotency map, append-only `ledger`, `RESERVED_ID_DELIMITERS` guard on ids). `registerGoal(draft)` — `validateContract("goal", …)`, DRAFT-only, duplicate-identity deny, parent-existence + **level-ordering** enforcement (a WORK_PACKAGE/OBJECTIVE parent must be one level up; closed hierarchy, fail-closed on gaps). `linkWorkPackage(goalId,{projectId,workPackageId,version})` — binds a WP identity to an **OBJECTIVE-level** goal only; deny if goal unknown/not-objective; WP existence proven through an injected `workPackageResolver` bound to `WorkPackageContractService.getWorkPackage`/`resolveEffective` (deny-by-default when WP unknown). Linkage is an **index**, not an authority grant — it does not gate WP creation or transitions. Read APIs: `getGoal`, `traceChain(workPackageId)` → portfolio→…→objective→WP path.
- **Acceptance:** link denies unknown goal, unknown WP, non-objective parent, and reserved-delimiter ids; duplicate link is idempotent (same fingerprint replays, divergent conflicts); `traceChain` returns the deterministic ordered path; frozen outputs; tests green; `npm run validate` exit 0.
- **Size:** M.
- **R-class:** **R2** — new read/index service consuming existing authority via resolvers; no authority mutation. (Gating WP creation on linkage would be R3 — explicitly out of this slice.)

### Slice 3 — Read-only portfolio rollup projection

- **Files:** new `src/ui/goal-rollup-projection.mjs` (mirrors `src/ui/report-projections.mjs` pure-function style); new `tests/goal-rollup-projection.test.mjs`; add both to `MANIFEST.json`.
- **Behavior:** pure read model. Given goals + linked WP states (from GoalGraphService index + `WorkPackageContractService.getWorkPackage`/`getDecisionLedger`), derive per-goal progress: WP counts by state, effective-vs-superseded, evidence-obligation coverage; bubble WP states up the objective→product→portfolio chain. No mutation, no authority, no time-source dependence beyond inputs. Unknown goal → frozen deny result; empty inputs → empty frozen rollup.
- **Acceptance:** rollup deterministically reflects supplied WP states; output deeply frozen; unknown-goal path returns a deny code; tests green; `npm run validate` exit 0.
- **Size:** S/M.
- **R-class:** **R1** — pure read projection.

Sequencing: S1 → S2 → S3 (each depends on the prior). Any single slice is independently mergeable behind its own review.

## 4. Non-goals (this assessment and the slice plan)

- No scheduling/cadence engine; `schedule.yaml` stays a template, no `schedule.schema.json` in P0 (G6 deferred).
- No reconciliation of the code WP state machine with the OM long lifecycle (G7 deferred — doctrine work).
- No change to `work-package.schema.json` `objective` semantics and no modification of the hardened `work-package-service.mjs` authority path.
- No UI, no dashboard surface.
- No goal approval/authority workflow — goals are traceability/index objects in P0, not decision authorities.

## 5. R-class flags (authority-touching items — deferred)

- **R3 (defer):** making goal linkage **gate** WP creation or authorization (would move linkage into authority semantics on the hardened WP path). Keep linkage index-only in P0.
- **R3 (defer):** adding a required `objective_id` to `contracts/work-package.schema.json` — mutates an effective-path closed contract consumed by the hardened service and existing fixtures. Prefer the external GoalGraphService index (Slice 2) in P0; revisit id-embedding as a governed schema change later.
- **R4 (defer):** goal-as-governance-authority (goal approval issuing effective authority). Out of MOD-WORK P0 scope.

## 6. Defer recommendations

1. **Schedule/cadence primitives (G6):** defer to post-P0. Not traceability; introducing a scheduling engine now widens scope past the P0 bar.
2. **WP lifecycle reconciliation (G7):** defer; open a doctrine record to reconcile `05-work-package-lifecycle.md` with `STATE_MACHINES.WorkPackage` rather than change code.
3. **`objective_id` in WP schema:** defer; use the external linkage index first (reversible, lower blast radius) and only embed the id via a governed R3 schema change if the index proves insufficient.
4. **Goal authority workflow:** defer (R4).

## 7. Self-certification

```yaml
self_certification:
  agent_id: claude-cortex-modwork-assess-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Advisory only. Recommends the MOD-WORK producer plan; does not execute or authorize it. Slice implementation remains blocked pending operator/governance review under AMD-002.
