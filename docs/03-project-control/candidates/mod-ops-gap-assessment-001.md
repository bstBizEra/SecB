# MOD-OPS Gap Assessment 001 — Operations and FinOps

**Record ID:** MOD-OPS-000 / mod-ops-gap-assessment-001
**Status:** DRAFT / ADVISORY — NOT EFFECTIVE
**Assessed baseline:** unified `main` @ `6a928a17a9ddfca23f66630a0e7c4627d57c7b6c`
**Author:** claude-cortex-ops-assess-01 (BST-SA cortex, module-loop planner)
**Date:** 2026-07-21
**Catalog scope under assessment:** MOD-OPS "Operations and FinOps" — `docs/10-platform/03-module-catalog.md:19`: "Health, incidents, cost and capacity" (High priority); `docs/14-delivery/01-module-allocation.md:22`: Operations/FinOps lead OPS/FINOPS — Codex analytics, review GOV/DOMAIN, focus "Cost, capacity and incidents". This record additionally covers the operations doctrine the catalog row implies but does not name: KPIs and scorecards (`docs/17-operations/02-kpis-and-scorecards.md`) and operational reporting cadence (`docs/12-execution/02-schedule-and-cadence.md`).
**Tracker:** `docs/03-project-control/candidates/module-completion-tracker-001.md:28` row 14 — "MOD-OPS Operations and FinOps | Codex | QUEUED — missing".
**Doctrine under assessment:** `docs/17-operations/02-kpis-and-scorecards.md` (24 named KPIs in four groups), `docs/12-execution/02-schedule-and-cadence.md` (event-driven cadence, operating rhythm, checkpoint policy), plus the FINOPS role definition (`docs/00-governance/agents-instructions-om-v0.1-candidate.md:111`) and the monthly cost-governance cadence (`docs/00-governance/SECB-GOV-001.md:115`) — all DRAFT / NOT EFFECTIVE.
**Governance frame:** AMD-002 rev 2 advise-and-proceed (candidate preparation only); operator-only merge; no push.
**Method:** all findings below were read first-hand from the actual source, contracts, tests, and docs at the cited baseline. `git grep -in "MOD-OPS"` finds only the catalog/tracker/allocation rows — no prior MOD-OPS gap-assessment or slice branch exists before this record. `npm test` (validator + full suite) was run first-hand in an isolated worktree before drafting: **788 tests / 783 pass / 0 fail / 5 skip**, `node tools/validate-foundation.mjs` exit 0.

---

## 1. Existing-surface inventory (main @ 6a928a1)

The catalog names four concerns — **health, incidents, cost, capacity** — and the operations doctrine adds **KPIs/scorecards** and **cadence**. The tracker calls MOD-OPS "missing", and that is accurate for code: no file under `src/` or `tools/` computes a KPI, assembles a scorecard, tracks an incident, meters cost, or evaluates a cadence. What exists is doctrine prose plus adjacent substrate owned by other modules:

| # | Surface | Ops-relevant behavior | Notes |
|---|---|---|---|
| 1 | `docs/17-operations/02-kpis-and-scorecards.md:3-37` | 24 named KPIs in four groups: Platform (6, incl. "governed session completion rate", "mean recovery time", "cost per accepted work package"), Delivery (6), Agents and harnesses (6), Learning and skills (6). | **Prose only.** Names, no definitions: no KPI identifiers, no formulas, no measurement sources, no thresholds/targets, no scorecard shape. `grep -rin "kpi\|scorecard" src/ tools/` → zero hits. Nothing in code can even enumerate the catalog (G1). |
| 2 | `docs/12-execution/02-schedule-and-cadence.md:5-41` | Event-driven cadence table (7 triggers → required actions, e.g. "Failed/denied action → Failure Evidence Envelope and learning disposition"); recommended operating rhythm (8 rows, Daily 08:30 … Quarterly, all `Asia/Ho_Chi_Minh`); session checkpoint policy (6 semantic checkpoint triggers). | **Prose only.** No code consults the trigger table or the rhythm; nothing answers "what is required when a candidate is submitted?" or "which cadence activities fall due at time T?" (G3). The checkpoint *policy* is prose; the checkpoint *ledger* exists (item #7) — policy and storage are currently unconnected. |
| 3 | `src/ui/ops-report-generator.mjs` (109 LOC) + `src/ui/report-projections.mjs` + `tools/generate-ops-report.mjs` | P0-17 static, read-only, zero-network "ops report": verified event + evidence ledger records rendered to HTML with a fail-closed display-plane classification floor. | Despite the name, this is a **MOD-LIVE observer snapshot**, not operational reporting: it lists raw records, computes **no rates, no aggregates, no KPI, no trend**, and carries no health/incident/cost/capacity view. It is however the house pattern S2 mirrors: pure projections, verified-records-in / frozen-view-out, no I/O, no clock (`report-projections.mjs:1-5`). |
| 4 | `src/ui/goal-rollup-projection.mjs:1-18` (MOD-WORK S3) | Pure read model over the goal hierarchy: per-goal work-package counts by status, completion signal from observable `ACCEPTED` states only, `data_untrusted: true` on every result. | **Adjacent, must not be folded into.** This is *work-completion* aggregation for the goal tree, not an operational KPI engine (B1). It demonstrates the exact aggregation discipline a scorecard needs: derive only from observable states, mark the unresolvable UNKNOWN, never infer. |
| 5 | `src/control/risk-registry.mjs:1-38` (MOD-GOV S2) | Doctrine tables (risk classes, authority classes, mutation classes) codified verbatim as pure, frozen, deny-by-default lookups with doc-parity tests. | **Adjacent pattern, not scope.** Risk/authority vocabulary belongs to MOD-GOV (B3). But this file is the direct template for S1: prose table → pure registry + `{ ok, value } / { ok, code }` lookups + doc-parity fixture so code/doc drift fails CI. |
| 6 | `src/control/retry-policy.mjs:5-12` (MOD-RUNTIME S2) | Pure retry-budget evaluator; its own header: "Nothing in this file re-attempts an operation, sleeps, schedules, or wraps any live call". | The **decision-function-not-scheduler** precedent S3 must follow: a cadence evaluator answers "what is due / what is required", it never owns a timer, sleeps, or fires actions (B4). Also the only budget-shaped control in `src/` — attempt budgets, not monetary cost. |
| 7 | `src/ledger/checkpoint-ledger.mjs`, `src/ledger/governed-ledgers.mjs`, `src/ledger/durable-ledger.mjs` | Durable hash-chained ledgers: events, evidence, decisions, checkpoints; `verify()`/`read()` discipline. | The **measurement raw material** for most Platform/Delivery KPIs already exists as governed streams. MOD-OPS must consume *caller-supplied, already-verified projections* of these — never open or re-read the authority streams itself (B2). No KPI computation over them exists anywhere (G4). |
| 8 | `src/gateway/mcp-gateway-core.mjs:300,538-544` | `#capacityInUse` vs `#limits.max_concurrency`: a live, fail-closed execution-concurrency gate inside the MCP gateway. | The only "capacity" in code is a **local enforcement gate**, not capacity observation/planning. Ops capacity reporting must not read or mutate gateway internals (B5); a capacity KPI would consume gateway-emitted records, not gateway state. |
| 9 | `docs/05-live-operations/event-envelope.md:28` | `incident.*` is one of the 19 doctrine event families. | Incidents exist **only as an event-family name**. No incident record shape, no incident lifecycle/state machine, no incident registry, no code path that opens or closes one (G5). `STATE_MACHINES` (`src/control/state-machine.mjs`) has Session/WorkPackage-class machines, none for incidents. |
| 10 | `docs/00-governance/agents-instructions-om-v0.1-candidate.md:111`; `docs/00-governance/SECB-GOV-001.md:115`; `docs/16-security/03-agentic-threat-model.md:17` | FINOPS role — "model, token, infrastructure and delivery-cost governance"; monthly "architecture, security, cost and skill governance cadence"; threat model names "cost exhaustion and runaway retries". | FinOps is a named role, a named cadence, and a named threat — with **zero code**: no spend record, no token metering, no budget contract, no cost-per-work-package computation (G6). Metering real spend requires provider/host integration — operational, not pure (§5 #2). |
| 11 | `tools/validate-foundation.mjs` | Repo-conformance validator (manifest set-equality, schema identity fields, remotes). | Repo hygiene, not operational health. Its `expectedSchemas` set is the mechanical surface any future ops contract kind would touch (G7) — not triggered by this plan. |
| 12 | `docs/09-delivery/backlog-p0.md` | `grep -in "ops\|report\|kpi\|incident\|cost"` → zero matches. | No P0 backlog line anchors any MOD-OPS work (G8). |

## 2. Gap table

| ID | Capability | Status | Evidence |
|---|---|---|---|
| G1 | KPI catalog as code — enumerate the 24 doctrine KPIs with stable identifiers, group membership, and doctrine-verbatim names; pure lookups (`getKpi`, `listKpisByGroup`) with structured denials | **missing** | Item #1: the catalog exists only as four prose bullet lists; zero `kpi`/`scorecard` hits in `src/`+`tools/`. Directly additive as a pure registry in the `risk-registry.mjs` house pattern (item #5) with a doc-parity fixture. Closed by **S1**. |
| G2 | Scorecard assembler — given caller-supplied measurements keyed by KPI id, produce a frozen scorecard segregated by doctrine group, with missing/unknown measurements surfaced as **findings** (never invented values, never silent zeros) | **missing** | No aggregation surface exists beyond the goal rollup (item #4), which counts work-package statuses, not KPIs. A **pure** assembler (measurements in → frozen scorecard out, `data_untrusted` marking, injected `now`) is directly additive; it computes nothing from ledgers itself (B2). Closed by **S2**. |
| G3 | Cadence catalog + due-action evaluator — codify the 7-trigger event-driven table and the 8-row operating rhythm verbatim; answer "what is required on trigger X" and "which rhythm activities are due at injected time T" as pure decisions | **missing** | Item #2: both tables are prose; nothing in code consults them. A pure evaluator is additive under the `retry-policy.mjs` decision-function-not-scheduler discipline (item #6, B4): no timers, no sleeps, no action firing. Closed by **S3**. |
| G4 | KPI measurement computation — actually compute e.g. "governed session completion rate" or "integration queue time" from verified event/evidence/decision projections | **missing** | Item #7: the raw streams exist; no computation over them does. A pure computation over caller-supplied verified records is R2-eligible **future** work (slice 4+, after S1/S2 fix the vocabulary); *binding* computations to live ledger reads or the P0-17 report is R3 wiring (§5 #4). Not in this max-3 plan. |
| G5 | Incident record + lifecycle — open/close incidents, severity, containment state, linkage to events and decisions | **missing** | Item #9: `incident.*` is a doctrine family name only. A real incident registry needs a new persisted record kind (contract + validator registration, G7 mechanical) and lifecycle states adjacent to the authority-bearing `state-machine.mjs` kernel — **R3**, operator-gated. Not a slice here. |
| G6 | Cost / FinOps substrate — spend records, token metering, budget contracts, "cost per accepted work package" | **missing** | Item #10: FINOPS is a named role and threat with zero code. Real metering touches provider APIs/host telemetry (**R3/R4 operational**); even a pure cost-aggregation model should wait until an operator decides the spend-record shape (§5 #2). The *KPI name* is carried by S1; its computation is G4-future. |
| G7 | Contract-validator / foundation-validator registration for any future ops contract kind (incident record, spend record, persisted scorecard) | **missing (mechanical)** | Item #11: the fail-closed `schemaPaths` / `expectedSchemas` set-equality would need extension — the same mechanical gap every prior module assessment flagged (MOD-LIVE G7 precedent). **Not triggered by this plan** (S1–S3 add no schema). |
| G8 | P0 backlog anchor for MOD-OPS | **missing** | Item #12: `backlog-p0.md` has no operations/FinOps line. Operator/portfolio decision; a slice plan cannot resolve it (MOD-LIVE G8 precedent). |

**Gap counts: missing 6 (G1–G6) · missing-mechanical 1 (G7, not triggered this round) · missing-operator 1 (G8). The tracker's "QUEUED — missing" is confirmed exactly: MOD-OPS has no code substrate of its own. Reusable substrate: the `risk-registry.mjs` doctrine-registry pattern (item #5), the `report-projections.mjs` purity discipline (item #3), the `goal-rollup-projection.mjs` observable-states-only aggregation (item #4), and the `retry-policy.mjs` decision-not-scheduler rule (item #6) mean S1–S3 invent no new discipline — they repeat four proven ones.**

## 3. Boundary notes (no-duplication rulings)

- **B1 — Scorecard vs. MOD-WORK goal rollup.** `goal-rollup-projection.mjs` aggregates work-package statuses across the goal hierarchy (completion view). S2's scorecard aggregates *KPI measurements* across the doctrine groups (operations view). Different axes, different consumers. S2 must **not** re-implement rollup arithmetic; a rollup result may later be *supplied to* S2 as a measurement by a caller — that wiring is deferred, and S2 never imports or invokes the rollup.
- **B2 — Ops measurement vs. MOD-LIVE authority streams.** MOD-OPS **reads projections, never raw authority**: KPI inputs arrive as caller-supplied, already-verified records/aggregates (the caller runs `verify()`/`read()`, exactly as `ops-report-generator` does for P0-17). No MOD-OPS slice opens `EventLedger`/`EvidenceLedger`/`DecisionLedger`, re-validates envelopes, or re-implements ledger sequencing. The P0-17 report itself stays untouched: it is a MOD-LIVE observer snapshot; S2's scorecard is a peer model a future report could consume, not a hook into it.
- **B3 — Ops vocabulary vs. MOD-GOV risk registry.** Risk/authority/mutation classes belong to `risk-registry.mjs` (single source, which itself re-exports `RISK_ORDER` rather than redefining it). No MOD-OPS slice defines a risk class; if an ops surface ever needs one, it imports from the registry. KPI group names are MOD-OPS vocabulary; risk classes are not.
- **B4 — Cadence evaluator vs. scheduling/execution.** S3 follows the `retry-policy.mjs` charter verbatim: a **decision function, not a scheduler**. It never sleeps, sets timers, fires actions, or wraps live calls; `now` is injected; the answer is data. Actually *running* a cadence (daily triage, Friday integration review) is human/operator process — no code slice automates it.
- **B5 — Capacity KPI vs. MCP gateway concurrency gate.** `mcp-gateway-core.mjs` `#capacityInUse` is live enforcement state inside a security-bearing gateway. No MOD-OPS surface reads, exposes, or tunes it. A capacity measurement would consume gateway-*emitted* records supplied by a caller (G4-future), never gateway internals.
- **B6 — Cadence triggers vs. state-machine kernel.** The 7 cadence triggers correspond to lifecycle moments that `STATE_MACHINES` transitions produce, but S3 codifies the *doctrine table*, keyed by trigger name — it does not import, consume, or widen `state-machine.mjs` (the R3 kernel-file ruling every prior module assessment upheld).
- **B7 — Incident family vs. incident module.** `incident.*` in the event-family taxonomy is MOD-LIVE classification vocabulary (its S1 classifier). An incident *registry/lifecycle* (G5) is MOD-OPS scope but R3; neither module should grow the other's surface in the interim.

## 4. Bounded producer work plan (max 3 slices)

Scope discipline mirrors the prior module assessments (MOD-RUNTIME, MOD-GOV, MOD-WSPACE, MOD-LIVE): every slice is additive, behavior-preserving, wrap-not-modify. No existing module (`goal-rollup-projection`, `ops-report-generator`, `report-projections`, `risk-registry`, `retry-policy`, `mcp-gateway-core`, any ledger) is rewired or widened in this plan; adoption/wiring is deferred to later, separately-governed slices. House style throughout: structured denials `{ ok: false, code, message }`, deny-by-default on malformed input, injected dependencies, deep-frozen outputs, no live wiring, no I/O. **Fail-closed extraction (WSPACE-S1 lesson):** every property read off a caller-supplied input is a **single contained read** into a local const *before* use — no re-entrant property access, so a hostile getter/proxy cannot return one value to the guard and another to the body.

### Slice S1 — KPI catalog registry, PURE + UNWIRED (closes G1) — R2, dispatchable now

- **Files:** new `src/ops/kpi-registry.mjs`; new `tests/kpi-registry.test.mjs`; `MANIFEST.json` updated. **No new schema, no ledger, no I/O** — pure data + pure lookups.
- **Behavior:** the four groups and 24 KPI names codified **verbatim** from `docs/17-operations/02-kpis-and-scorecards.md`, each KPI carrying a stable id (e.g. `platform.governed-session-completion-rate`), its group, and the doctrine-verbatim name. Frozen-result functions in the `risk-registry.mjs` house style:
  - `getKpi(input)` → `Object.freeze({ ok: true, kpi })` or `Object.freeze({ ok: false, code, message })`. A **single** contained read of `input?.kpiId` into a local const; then `DENY_KPI_ID_MALFORMED` (non-string / blank / prototype-key smuggling), `DENY_KPI_UNKNOWN` (id not in the catalog — never coerced to a default).
  - `listKpisByGroup(input)` → frozen list for a known group; `DENY_GROUP_UNKNOWN` otherwise. `listGroups()` → frozen group list.
  - A **doc-parity fixture test** embeds the doc's bullet lists so code/doc drift fails the suite (mirrors MOD-GOV S2 / MOD-LIVE S1 doc-parity discipline).
  - The registry **names** KPIs; it does not define formulas, thresholds, or data bindings (those are G4-future and operator-shaped). No side effects — audit-precedes-effect holds by construction.
- **Acceptance checks:** unit tests for every deny code incl. fail-closed malformed-input cases (non-object, non-string, blank, `null`, prototype-key); positive lookups across all four groups; 24-entry count assertion; doc-parity fixture; deep-frozen output assertion; `npm test` green incl. the new suite; `node tools/validate-foundation.mjs` exit 0; no existing test's behavior changes.
- **Est. size:** ~100–140 LOC + tests.
- **R-class:** **R2** — pure additive vocabulary registry; no authority semantics, no wiring, no I/O, no schema. **This is the slice a motor producer can start immediately.**

### Slice S2 — Scorecard assembler, PURE + UNWIRED (closes G2) — R2

- **Files:** new `src/ops/scorecard-assembler.mjs`; new `tests/scorecard-assembler.test.mjs`; `MANIFEST.json` updated. No schema, no ledger, no I/O.
- **Behavior:** `assembleScorecard(input, { now })` where `input.measurements` is a caller-supplied array of `{ kpiId, value, observedAt, source }` — the assembler reads **no** ledger and **no** filesystem (B2; mirrors `report-projections.mjs` purity — the caller verifies its sources first). Returns `Object.freeze({ ok: true, scorecard })` or a structured deny. The frozen `scorecard`:
  - segregates measurements by the S1 catalog's four doctrine groups (S1's registry is imported as the single KPI vocabulary source — same-plan dependency, still unwired to any live path);
  - lists every catalog KPI **without** a supplied measurement under `findings` as `MISSING_MEASUREMENT` — a missing value is a finding, never an invented zero (goal-rollup's observable-states-only discipline, item #4);
  - rejects measurements for unknown KPI ids (`DENY_KPI_UNKNOWN` finding per entry, fail-closed) and malformed entries (`DENY_MEASUREMENT_MALFORMED`);
  - carries `data_untrusted: true` (measurements are caller-side data) and injected `assembledAt` from `now` — no ambient clock;
  - deny-by-default at the top level: non-object input, non-array measurements, prototype-key smuggling → `DENY_SCORECARD_MALFORMED`. Single contained read of each input property.
- **Boundary:** produces the structured scorecard **model** only; no HTML, no rendering, no fold into the P0-17 report (B2), no rollup re-implementation (B1), no thresholds/ratings (no doctrine defines them yet — inventing them would be un-sourced).
- **Acceptance checks:** group-segregation tests; missing-measurement finding tests (incl. full-catalog-missing); unknown-id and malformed-entry denials; malformed/`null`/non-array/prototype-key top-level denies; injected-`now` determinism; `data_untrusted` presence; deep-frozen output; `npm test` green; validator exit 0.
- **Est. size:** ~130–180 LOC + tests.
- **R-class:** **R2** — pure assembler over caller-supplied measurements; no wiring, no I/O, no schema.

### Slice S3 — Cadence catalog + due-action evaluator, PURE + UNWIRED (closes G3) — R2

- **Files:** new `src/ops/cadence-policy.mjs`; new `tests/cadence-policy.test.mjs`; `MANIFEST.json` updated. No schema, no ledger, no I/O, **no timers**.
- **Behavior:** the event-driven cadence table (7 triggers → required actions) and the operating rhythm (8 rows with time/day/frequency, `Asia/Ho_Chi_Minh` default) codified **verbatim** from `docs/12-execution/02-schedule-and-cadence.md`, guarded by a doc-parity fixture.
  - `requiredActionsForTrigger(input)` → `Object.freeze({ ok: true, actions })` for a known trigger; `DENY_TRIGGER_MALFORMED` / `DENY_TRIGGER_UNKNOWN` otherwise (single contained read; deny-by-default — an unknown trigger never yields an empty "nothing required").
  - `listRhythm()` → the frozen rhythm rows. `dueActivities(input)` → given an injected `{ now }` (ISO string) and an optional last-completed map supplied by the caller, the rhythm rows currently due — a **decision function** in the `retry-policy.mjs` mold (item #6, B4): it never sleeps, schedules, or fires anything; malformed `now` → `DENY_NOW_MALFORMED`.
  - Checkpoint-policy triggers (the 6 semantic checkpoint conditions) are codified as a frozen list for future consumers; S3 does **not** touch `checkpoint-ledger.mjs` or mint checkpoints.
- **Acceptance checks:** per-trigger positive tests for all 7 triggers; unknown/malformed trigger denies; rhythm doc-parity fixture; due-evaluation tests at fixed injected times (incl. timezone-explicit cases and malformed-`now` deny); frozen output; no-timer assertion by construction (no `setTimeout`/`setInterval` in module — grep-asserted in test); `npm test` green; validator exit 0.
- **Est. size:** ~140–190 LOC + tests.
- **R-class:** **R2** — pure doctrine codification + decision function; no wiring into any live session, ledger, or scheduler path.

**Sequencing:** S1 first — S2 imports S1's catalog as its KPI vocabulary (the only inter-slice dependency). S3 is independent of both and safe in any order. S1 is the recommended first dispatch: smallest, purest, and it establishes the doc-parity fixture and `src/ops/` namespace S2 and S3 reuse.

## 5. Explicit non-goals

1. No incident registry, incident lifecycle, or incident state machine (G5) — new persisted record kind + kernel-adjacent states; R3, operator-gated (B7).
2. No FinOps metering, spend records, budget contracts, or token accounting (G6) — provider/host telemetry integration is R3/R4 operational; the spend-record shape is an operator decision that has not been made.
3. No KPI *computation* from ledgers or projections (G4) — deferred to a future slice after S1/S2 fix the vocabulary; pure computation over caller-supplied verified records would be R2 then, data-source binding R3.
4. No wiring of S1/S2/S3 into `ops-report-generator.mjs`, `goal-rollup-projection.mjs`, any ledger, any gateway, or any live path — adoption is later, separately-governed work (B1, B2, B5).
5. No thresholds, targets, ratings, or red/amber/green semantics on the scorecard — no doctrine defines them; inventing them would be un-sourced authority.
6. No scheduler, timer, cron, or automated cadence execution (B4) — S3 decides, humans/operators run the rhythm.
7. No new contract kind and no change to `contract-validator.mjs` `schemaPaths` or `tools/validate-foundation.mjs` `expectedSchemas` (G7) — S1–S3 add no schema; a future incident/spend/persisted-scorecard kind carries that mechanical work under its own slice.
8. No new P0 backlog line (G8) — adding one is an operator/portfolio decision.
9. No widening of `state-machine.mjs`, `risk-registry.mjs`, or any authority-bearing kernel file (B3, B6).

## 6. R-class flags

| Item | Flag |
|---|---|
| S1 (KPI catalog registry) | **R2** — pure additive vocabulary; no wiring, no I/O, no schema. |
| S2 (scorecard assembler) | **R2** — pure assembler over caller-supplied measurements; no I/O, no thresholds. |
| S3 (cadence catalog + due-action evaluator) | **R2** — pure doctrine codification, decision-not-scheduler; no timers. |
| G4 (KPI computation + data-source binding) | **R2 future for pure computation; R3 for live binding** — deferred; non-goal #3. |
| G5 (incident registry/lifecycle) | **R3, out of this plan** — new record kind + kernel-adjacent states; non-goal #1. |
| G6 (FinOps metering/spend) | **R3/R4, out of this plan** — provider/host telemetry; non-goal #2. |
| Adoption of S1/S2/S3 by report/UI/live paths | **R2 for the pure primitives, R3 for rewiring live services** — deferred; non-goal #4. |

## 7. AMD-002 rev 2 authorization analysis

- **Pre-authorized now, no fresh Human-GOV needed:** producing S1, S2, and S3 as bounded additive slices under `src/**` and `tests/**` on this non-main branch, with scope + acceptance checks declared and exact results reported. None touches authority, identity, evidence acceptance, remote/external actions, any live schema, any state machine, any ledger, or any scheduler — so no per-step halt applies. This is squarely AMD-002 rule 1's standing implementation authorization, the same footing MOD-RUNTIME, MOD-WSPACE, and MOD-LIVE slices stood on.
- **Would need the SEC + GOV review AMD-002 reserves, not a new amendment:** (a) an incident record kind or lifecycle (G5); (b) FinOps metering or any spend-record contract (G6); (c) wiring KPI computation to live ledger reads or the P0-17 report (G4 binding); (d) wiring any of the three primitives into any live report/UI/service path. All four are explicit non-goals (§5) and none is proposed for producer dispatch here.
- **Conclusion:** this gap assessment and its bounded S1–S3 plan do not require a *new* Human-GOV authorization beyond AMD-002 rev 2's standing pre-authorization for additive candidate slices. What would require the reserved SEC+GOV review is any subsequent *activation/wiring* step — which this plan does not include.

## 8. Advisory status fields

```yaml
truth_status: verified_true            # all evidence read directly from cited files at 6a928a1; npm test run first-hand (788/783/0/5), validator exit 0
authority_status: advisory_only
implementation_status: candidate       # this record proposes; it authorizes nothing
risk_class: R1                         # the record itself: documentation candidate on a non-main branch
self_certification:
  agent_id: claude-cortex-ops-assess-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Recommend improvements only. Do not execute them. Producer round scope is bounded to S1–S3 above; anything else — including any wiring/activation step named in §5 and §7 — is a new decision.
