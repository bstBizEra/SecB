# MOD-A2A (A2A Gateway — Delegation, Handoff and Non-Escalation) — Module-Completion Review 001

- review_id: MOD-A2A-COMPLETION-REV-001
- status: CANDIDATE (advisory module-completion review; operator ratification required — no push, no merge)
- reviewer: claude-cortex-a2a-completion-01 (BST-SA cortex agent, independent module-completion identity)
- scope note: this reviews **row 17** of the completion tracker — "MOD-A2A A2A Gateway", the internal delegation/handoff/non-escalation subsystem governing how SecB's own agents/roles hand off and delegate bounded work to one another *within* the platform's project/work-package/session boundary. The gap assessment's §0 naming-ambiguity resolution is adopted verbatim: this is the **internal** "A2A Gateway" module, **not** the separate, still-closed-pending-a-distinct-Human-GOV-decision external Agent2Agent wire-protocol adapter lineage (`p0-a2a-adapter-plan-alignment-009`, `src/a2a/**` — which does not exist in this repository). This review touches, references as a dependency, and duplicates nothing in that separate workstream.
- pieces_reviewed: the ratified MOD-A2A S1+S2+S3 stack now on main:
  - **S1** (PRs #22–#24) — `contracts/delegation-request.schema.json` (a governed extension; the pre-execution delegation-request shape) + `DelegationLedger extends DurableLedger` (`src/ledger/delegation-ledger.mjs`), a thin subclass over the existing `DurableLedger` hash-chain/idempotency/optimistic-concurrency substrate
  - **S2** (PR #31) — `src/control/delegation-gate.mjs` (`evaluateDelegation` / `evaluateDelegationRequest` / `buildDelegationDecisionRecord`), a pure unwired delegation non-escalation gate that reuses `non-escalation-comparator.withinCeiling` and `risk-registry.riskProfile` verbatim
  - **S3** (PR #98) — `src/control/escalation-route.mjs` (`evaluateEscalationRoute` / `bindEscalationRoute` / `verifyEscalation`), a pure unwired escalation-route evaluator incl. the **TASK-014 binding-immutability hardening** (bound `GOVERNANCE` decision records and their `evidence_refs` arrays are deep-`Object.freeze`d — mutation throws `TypeError`)
- target: unified main @ `1ef3ae935585a3ac169ceaca1944cb2623ce2965` (carries all three A2A slices S1/S2/S3, ratified; PR #112 brought main to this tip — the A2A code is byte-present and first-hand verified here)
- review_branch: `bst/mod-a2a-completion-review` (created FROM main @ `1ef3ae9`)
- assessment_context: `mod-a2a-gap-assessment-001.md` on `bst/mod-a2a-assessment` @ `e96e83b` (MA-1…MA-9 gap table §2, boundary notes B1–B4 §3, bounded producer plan S1/S2/S3 §4, non-goals §5, V-014 documentation-consistency finding §6, R-class flags §7, external-lineage overlap check §8, AMD-002 authorization analysis §9)
- prior_slice_records (all on main, re-derived first-hand here):
  - `mod-a2a-s1-delegation-ledger-producer-verification-001.md` + `mod-a2a-s1-delegation-ledger-independent-review-001.md` (S1-REV: APPROVE_FOR_MERGE — 33 novel mutation probes + 3 tamper checks clean; 2 minor non-blocking schema-laxity notes)
  - `mod-a2a-s2-non-escalation-gate-producer-verification-001.md` + `mod-a2a-s2-non-escalation-gate-rev-001.md` (S2-REV: APPROVE_WITH_NOTES — non-escalation invariant verified via superset/chain/confusable/prototype probes, uncomparable fails closed, byte-identity zero drift; L1 return-not-frozen advisory, riskClass narrowing accepted)
  - `mod-a2a-s3-escalation-route-producer-verification-001.md` + `mod-a2a-s3-escalation-route-independent-review-request-001.md` + `mod-a2a-s3-escalation-route-crossprovider-review-001.md` (S3-REV: **APPROVE_WITH_NOTES** — cross-provider Codex-produced / Claude-independent; every guarded/reused foundation file byte-identical by hash across merge-base/main/candidate; M1 MANIFEST merge-cleanliness, M2 missing enforced linkage to S2's decision, L1 case-sensitive self-escalation, L2 narrow SoD — all wiring-time/future-slice, none blocking the unwired candidate) + `mod-a2a-s3-verify-001.md`
- catalog_scope: MOD-A2A — `docs/10-platform/03-module-catalog.md`: "Delegation, handoff and non-escalation" (Medium priority); `docs/14-delivery/01-module-allocation.md`: lead ARCHI — Claude, ENGIN — Codex, independent challenge SEC/QA, "Delegation non-escalation"
- governance: BST-SA advisory contract (worker, not authority); AMD-002 rev 2 advise-and-proceed; operator-only merge; `docs/07-capabilities/mcp-a2a-governance.md` (SECB-FEDERATION-001) doctrine anchor; `docs/00-governance/governance-baseline.md:10` ("Authority is server-derived, scoped, time-bounded, and non-transferable except through governed delegation")
- date: 2026-07-22
- method: first-hand. `npm ci` clean (exit 0); all three MOD-A2A module test files and `node tools/validate-foundation.mjs` run directly at `1ef3ae9`; the delegation-request schema's 19 required fields + `additionalProperties:false`, `DelegationLedger`'s thin-subclass reuse of `DurableLedger` (no storage reimplemented) with fail-closed `resolveDelegationRequest` deny-on-use, S2's verbatim `withinCeiling` + `riskProfile` reuse (no parallel ordering/risk table) with the `DENY_HUMAN_APPROVAL_REQUIRED` invariant, and S3's role-ladder-membership + route-match + self-escalation deny-by-default with deep-frozen `GOVERNANCE` binding records all read directly from source and confirmed against the six prior slice/review records. No producer count or prior-review verdict taken on trust.

---

## Module verdict

**FINISHED_WITH_TRACKED_FOLLOWUPS.**

Every buildable-now slice of the module's own S1–S3 plan is **delivered,
independently reviewed, and operator-ratified**, and no OPEN gap is a
buildable-now R2 slice of that plan. The gap assessment's producer plan (§4)
scoped exactly three slices:

- **S1** — the delegation-request contract + `DelegationLedger`, rated **R2** —
  delivered and ratified (PRs #22–#24), 16-schema world at merge.
- **S2** — the pure delegation non-escalation gate, rated **R1/R2** — delivered
  and ratified (PR #31).
- **S3** — the escalation-route primitive, rated **R3, candidate-preparation
  authorized under AMD-002 advise-and-proceed** — delivered as an **unwired
  candidate** and ratified (PR #98) with the TASK-014 binding-immutability
  hardening folded in.

This is a **more** complete delivery than the FINISHED_WITH_TRACKED_FOLLOWUPS
sibling MOD-INTEG earned: there, the plan's S3 was rated R3+ and was **not built
at all**. Here, MOD-A2A's own R3 candidate-prep slice (S3) **was** built, reviewed
cross-provider, and ratified as an unwired candidate — exactly the "the human
decision arrives with the work already done and only ratification pending"
discipline AMD-002 rule 3 reserves, identical in shape to MOD-GOV's S3 (PDP) and
MOD-RUNTIME's S3 (approval-binding). No R2 slice of the module's own plan remains
unbuilt; this is therefore **not** the MOD-WSPACE-REV-001 (NOT_FINISHED) situation,
where an R2 slice (the lease-ledger durable half) was genuinely unbuilt.

The module's primitives are all **UNWIRED**: nothing live consumes `DelegationLedger`,
`delegation-gate.mjs`, or `escalation-route.mjs` — `delegation-gate.mjs` is called
from no live path, and `escalation-route.mjs` has no importer in `src/`/`tools/`
(grep-confirmed; its only external reference is a deferral comment in
`delegation-ledger.mjs`). `HandoffService`, `non-escalation-comparator.mjs`,
`WorkPackageContractService`, `AuthorityEngine`, `RuntimeRegistry`, and
`policy-decision-point.mjs` are **not rewired** by any of the three slices —
adoption is later, separately-governed work. Every remaining gap (MA-3 live A2A
runtime/transport/dispatch, MA-5 role↔agent-instance identity bridging, MA-6 the
stale V-014 skip reason, plus S3's M2 enforced-S2-linkage / TOCTOU-atomicity /
L1 actor-id-canonicalization wiring-time obligations) is **R3/R4/operator/SEC-GOV**
— the assessment's own explicit non-goals — not a buildable-now R2 completeness gap.
Merge ≠ activation; adoption of any of these primitives remains SEC/GOV-gated behind
the **P0-20 HOLD**.

No BLOCKER / HIGH / MEDIUM finding in the landed code. This is a
module-completeness ruling on first-hand evidence, closing the one open item the
Phase-0 closure report flagged (`p0-closure-report-001.md` §2.1 / §6 item 8:
MOD-A2A's plan fully delivered + ratified but no completion-verdict record on main).

---

## MA-gap → CLOSED / OPEN map (against the assessment's §2 gap table, read first-hand)

| Gap | Assessment text (abridged) | Status | Closed-by / gate | Evidence |
|---|---|---|---|---|
| **MA-1** | Delegation-request surface (pre-execution task assignment: objective, inputs, expected output, acceptance criteria, tools/skills/data budget, due condition; distinct from the post-execution handoff/report) — schema/persistence half **and** authorization half | **CLOSED** | S1 (schema+ledger) + S2 (gate) | `contracts/delegation-request.schema.json` — closed (`additionalProperties:false`), **19 required fields** incl. `objective`, `inputs`, `expected_output`, `acceptance_criteria`, `ceiling`, `skills`, `budget`, `due_condition`, `escalation_route`, `evidence_obligations`, `content_hash` — the exact doctrine field list from `mcp-a2a-governance.md:28`. `DelegationLedger extends DurableLedger` (thin subclass; hash-chain/idempotency/optimistic-concurrency inherited byte-identical; no status field by design — a delegation-request is a single immutable fact). S2's `evaluateDelegation` closes the authorization half: allows only when the requested ceiling sits within the delegator's own bounding ceiling AND the risk class needs no human approval. |
| **MA-2** | Escalation-route primitive (the path a legitimate need-more-authority request takes to reach GOV — distinct from the escalation-*denial* mechanism P0-11 already has) | **CLOSED** | S3 | `src/control/escalation-route.mjs`: `evaluateEscalationRoute` deny-by-default (well-formed candidate → well-formed actor → role ∈ `REV/QA/GOV` and matches the request's declared `escalation_route` → `escalationActorId !== source_actor_id`); `bindEscalationRoute` mints a deep-frozen `GOVERNANCE` decision candidate with an injective `[delegationId, version, role, actorId]` binding ref; `verifyEscalation` fail-closes unless the bound decision names that exact delegation id+version. This is the "escalation-*routing*" the tracker row's "non-escalation gateway missing" named, turned from a doctrine string into a checkable primitive. |
| **MA-3** | Live A2A runtime / transport / cross-agent-instance dispatch | **OPEN** | **R3+/operator/SEC-GOV** | No code dispatches a task to another agent instance. Explicitly deferred by the P0-11 planning packet's own `explicit_non_scope` ("No transport, wire protocol, agent discovery, or live A2A runtime — transport belongs to P0-15/P0-16 adapters"), reaffirmed as non-goal #2. `RuntimeRegistry` (identity only) + `HostRuntimeAgent` (single-attempt emit only) remain the nearest surfaces; neither dispatches. Not a buildable-now R2 slice — deliberately out of the S1–S3 plan. |
| **MA-4** | Non-escalation comparator vs. risk-registry / policy-decision-point reuse (a live non-reuse flag, not yet a missing gap) | **CLOSED** | S2 (reuse-not-reimplement) | `delegation-gate.mjs` imports and calls `non-escalation-comparator.withinCeiling` and `risk-registry.riskProfile` **verbatim** — zero parallel ordering table, zero parallel risk-class table, zero parallel path/tool/transition subset logic (confirmed by import-list + code read). The new authorization surface did **not** become a third independent risk-gating implementation, exactly as the assessment required. |
| **MA-5** | Destination-role vs. destination-agent-instance routing | **OPEN** | **design decision, out of plan** | The delivered surface hands work to a declared `destination_role` (single role, never a set), never to a `RuntimeRegistry` `agent_instance_id`. Bridging the role-based and instance-based identity models is a named future boundary decision (B4), an explicit non-goal (#3), not sized or built in S1–S3. Not an R2 completeness gap. |
| **MA-6** | V-014 stale skip reason (documentation-consistency, not a slice) | **OPEN** | **doc/test-debt → operator** | `tests/conformance-stubs.test.mjs` still skips V-014 with `"BLOCKED: P0-10 Context federation + P0-11 A2A"`; both named blockers are fully merged on `main`. Editing a test outside this module's own files is out of scope (non-goal #8); flagged to the operator/tracker exactly as the assessment §6 did — same pattern as MOD-RUNTIME's stale skip-reason finding. Not a code gap. |
| **MA-7** | Handoff service + non-escalation comparator ("handoff and non-escalation" two-thirds of the catalog description) | **CLOSED (pre-existing, reused)** | P0-11 (existing) | `src/services/handoff-service.mjs` + `src/services/non-escalation-comparator.mjs`, R1+R2 merged pre-this-module, Immune `APPROVE_FOR_MERGE`, V-015 passing. The S1–S3 slices **extend** this surface (S2 reuses the comparator; S3 reuses the `HANDOFF_ACCEPTANCE_LADDER` role vocabulary) rather than rebuilding it — exactly as MA-7 required. |
| **MA-8** | Risk-registry / policy-decision-point human-approval gate (existing, reusable, unwired into this module) | **CLOSED (now consumed)** | S2 | S2's `evaluateDelegation` consults `risk-registry.riskProfile(...).humanApproval` to short-circuit `DENY_HUMAN_APPROVAL_REQUIRED`, mirroring the PDP's own "never substitutes for a human approval" invariant — the previously-unconsumed primitive is now consumed by the module's own gate. |
| **MA-9** | Delegation doctrine named end-to-end, no code counterpart | **CLOSED** | S1 + S2 + S3 | `mcp-a2a-governance.md`'s "A2A Gateway" doctrine (delegation fields + non-escalation/trust invariants) and `agentic-threat-model.md:9`'s "authority escalation through A2A delegation" threat now have real code counterparts: the delegation-request schema (fields), the delegation-gate (non-escalation invariant), and the escalation-route primitive (the routing the doctrine named). "Codify what's already named" — done. |

**Gap tally: 6 CLOSED (MA-1, MA-2, MA-4, MA-7, MA-8, MA-9) · 3 OPEN — all
R3+/operator/design-decision/doc-debt (MA-3, MA-5, MA-6).** No OPEN gap is a
buildable-now R2 slice of the module's own plan; all three R-classes of the S1–S3
plan (R2 / R1-R2 / R3-candidate-prep) are delivered and ratified.

---

## Gate classification of every OPEN item (one line each)

1. **MA-3 live A2A runtime / transport / cross-agent-instance dispatch** — **R3+/operator/SEC-GOV.** Explicitly deferred by the P0-11 planning packet to "P0-15/P0-16 adapters"; reaffirmed non-goal #2; no dispatch surface exists; not an R2 slice.
2. **MA-5 role↔agent-instance identity bridging** — **design decision, out of plan (operator/portfolio + SEC).** Named future boundary (B4), explicit non-goal #3; bridges `destination_role` and `RuntimeRegistry.agent_instance_id`; not sized here.
3. **MA-6 V-014 stale skip reason** — **doc/test-debt → operator.** Both named blockers merged; editing a test outside this module's files is non-goal #8; routed to the operator/tracker, not corrected here.
4. **S3-M2 enforced linkage to a real S2 denial** — **R3/wiring-time.** The unwired evaluator takes no prior-decision input; a future wiring layer **must** pass a freshly-read S2 denial (exact delegation id+version) as a non-optional precondition before `bindEscalationRoute`. Wiring-slice obligation, not an R2 gap in the pure candidate.
5. **S3-TOCTOU atomicity at bind time** — **R3/wiring-time.** The pure module defers, not eliminates, the read-decide-bind race; the wiring layer must read version + S2 outcome atomically (under `DelegationLedger`'s optimistic-version scheme). `verifyEscalation`'s exact-version replay check gives the *tool* to detect a stale bind; enforcing atomicity is the caller's job.
6. **S3-L1 actor-id canonicalization / L2 fuller SoD ladder** — **R3/wiring-time + upstream identity assurance.** Self-escalation is an exact-`===` string check (house convention); whatever authenticates `escalationActorId` upstream must guarantee canonical, case-normalized ids, and a wiring layer with fuller actor-history should reuse `checkProhibitedActors` directly. Boundary conditions a pure decision function cannot close.
7. **Any live wiring / activation of all three primitives into `HandoffService`, a live delegation/escalation path, or any GOV-facing surface** — **operator/SEC + GOV, behind the P0-20 HOLD.** Non-goals #1/#6; requires the SEC + GOV review AMD-002 itself reserves. Merge ≠ activation.
8. **S3-M1 MANIFEST merge-cleanliness** — **process, already resolved at merge.** Additive-vs-additive `artifacts`-array conflict cleared by the operator's fold at PR #98; not a code defect.

---

## Residual follow-ups carried from the slice reviews (all non-blocking; wiring-time or advisory)

9. **FU-WIRING-1 — enforced S2 linkage (S3-REV M2).** The escalation-route module must not, once wired, run independently of a genuine S2 denial. Recommend the enforced-precondition requirement be written into the eventual wiring slice's spec before any wiring work begins. R3/wiring-time.
10. **FU-WIRING-2 — bind-time atomicity (S3-REV M2/TOCTOU).** The wiring layer must read delegation version + S2 outcome atomically before `bindEscalationRoute`. R3/wiring-time.
11. **FU-WIRING-3 — actor-id canonicalization (S3-REV L1).** Upstream identity assurance must supply canonical, case-normalized actor ids; this module normalizes none. R3/wiring-time.
12. **FU-INFO-4 — S2 return-freeze (S2-REV L1).** `evaluateDelegation`'s returns are not `Object.freeze`d (S3's bound records improve on this and *are* frozen). Advisory tightening, no live blast radius while unwired.
13. **FU-DOC-5 — V-014 skip-reason string (MA-6).** Named for the operator; the skip reason keeps citing two cleared blockers. Doc-consistency, out of this review's scope.

Items 1–8 are R3/R4/operator/SEC-GOV (the assessment's own non-goals and the wiring-time
obligations); items 9–13 are wiring-time/advisory follow-ups carried for tracker
traceability. **No R2 slice of the module's own plan remains unbuilt.**

---

## Smoke-test totals (first-hand, exact, at `1ef3ae9`)

| Measure | Command | Result |
|---|---|---|
| MOD-A2A module tests | `node --test tests/delegation-ledger.test.mjs tests/delegation-gate.test.mjs tests/escalation-route.test.mjs` | **tests 53 · pass 53 · fail 0 · skipped 0** |
| Foundation validator | `node tools/validate-foundation.mjs` | **status PASS · exit 0** · 857 checks · 0 FAIL |
| Schema count | validator `schemas.count` check + `ls contracts/*.schema.json` | **PASS = 20** (7 canonical bootstrap + 13 governed extensions, incl. "MOD-A2A delegation request"; disk count 20) |
| `npm ci` | — | clean (exit 0) |

(The required smoke is the three module test files + the validator. The tracker's
own ratified full-suite figure for this main state is 1325/1322/0 fail/3 skip,
validator exit 0, 856/856 PASS, 20 schemas — recorded in `p0-closure-report-001.md`;
not additionally re-run in full this pass.)

Change surface of THIS review vs main `1ef3ae9`: 3 files — this review record, the
single appended tracker line, and the root `MANIFEST.json` entry. No `src/**`,
`contracts/**`, `tools/**`, `tests/**`, `docs/templates/**`, or
`docs/03-project-control/effective/**` touched.

---

## Findings by severity

**BLOCKER: none. HIGH: none. MEDIUM: none.** No defect in the landed code. S1-REV
was APPROVE_FOR_MERGE (clean); S2-REV and S3-REV were APPROVE_WITH_NOTES with every
note being a wiring-time/future-slice boundary condition (not a defect in the unwired
candidates). The verdict here is a module-completeness ruling, not a defect ruling.

- **INFO-1.** MA-6: the V-014 skip-reason string still names two cleared blockers; noted for the operator, out of scope.
- **INFO-2.** S3's TASK-014 hardening makes bound escalation records and their `evidence_refs` arrays deep-frozen (mutation throws `TypeError`) — stronger than S2's own return shape (S2-REV L1); recorded for GOV traceability, a security-positive delta.
- **INFO-3.** The internal "A2A Gateway" module is confirmed disjoint from the external Agent2Agent wire-protocol adapter lineage (`src/a2a/**`, which does not exist here); this review neither depends on nor touches that separate, still-gated workstream.

---

## Advisory status fields

- truth_status: verified_true (53/53/0 module tests, validator status PASS / exit 0 / 857 checks / 20 schemas, S1's 19-required-field closed schema + thin-subclass ledger, S2's verbatim `withinCeiling`+`riskProfile` reuse with the human-approval invariant, S3's deny-by-default role-ladder binding with deep-frozen TASK-014 records, and all six prior slice/review records reproduced/cross-checked first-hand at `1ef3ae9`)
- authority_status: advisory_only (module verdict is a recommendation; every remaining wiring/dispatch/identity-bridging/activation item is execution_requires_operator; adoption is SEC/GOV-gated behind the P0-20 HOLD)
- implementation_status: existing (S1 contract+ledger, S2 pure gate, S3 pure escalation-route with TASK-014 hardening are all live in-module and UNWIRED; MA-3/MA-5/live-wiring are blocked/non-goal by design)
- risk_class: low (the landed pieces are a hash-chained deny-by-default unconsumed durable ledger + two pure unwired evaluators with no live authority surface; residual risk is the wiring-time obligations and one INFO advisory, not a security defect)

## Self-certification

```yaml
self_certification:
  agent_id: claude-cortex-a2a-completion-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

## Authority boundary

This is an advisory module-completion review. It changes no production code,
contract, schema, template, effective receipt, policy, or ADR beyond adding this
review record + one tracker line + the root MANIFEST entry. No branch was pushed and
nothing was merged. The FINISHED_WITH_TRACKED_FOLLOWUPS verdict is a recommendation;
operator ratification is required before MOD-A2A's tracker status is set to FINISHED,
before the Phase-0 closure report's open-register item 8 (the outstanding MOD-A2A
module-completion review) is marked closed, and before any of the R3/R4/operator
follow-ups (live A2A runtime/transport/dispatch, role↔agent-instance identity
bridging, the V-014 skip-reason correction, S3 wiring with enforced-S2-linkage +
bind-time atomicity + actor-id canonicalization, or any live wiring/activation of the
three unwired primitives) is produced. Adoption remains SEC/GOV-gated behind the
P0-20 HOLD. This review does NOT touch, extend, or depend on the separate external
Agent2Agent wire-protocol adapter lineage, which carries its own distinct Human-GOV
gate. Recommend improvements only; do not execute them.
