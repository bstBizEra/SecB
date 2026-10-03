# MOD-GOV Gap Assessment 001 — Governance Kernel

**Record ID:** MOD-GOV-000 / mod-gov-gap-assessment-001
**Status:** DRAFT / ADVISORY — NOT EFFECTIVE
**Assessed baseline:** unified `main` @ `49d1e0c4436b088bc9428d67c9f915d113cea60a`
**Cross-read (not part of baseline):** `bst/mcp-registry-broker-integration` @ `3502d2d` (capability-registry promotion-approval pattern)
**Author:** claude-cortex-modgov-assess-01 (BST-SA cortex, module-loop planner)
**Date:** 2026-07-20
**Catalog scope under assessment:** MOD-GOV "Identity, policy, authority, risk, SoD"
**Governance frame:** AMD-002 advisory (candidate preparation only); operator-only merge; no push

---

## 1. Existing-surface inventory (main @ 49d1e0c)

| # | Surface | Kernel-relevant behavior | Notes |
|---|---|---|---|
| 1 | `src/control/authority-engine.mjs` | Grant-based authorization: `REQUIRED_ROLE` map per transition, grant scope/window/status checks, config-time pairwise SoD (`CONFLICTING_ROLES` over actor+project+WP scope), authorize-time actor-history SoD (producer/reviewer/qa prohibitions), deny-by-default | Canonical SoD + authority primitive today |
| 2 | `src/control/state-machine.mjs` | 4 frozen state machines (Project/WorkPackage/Session/Evidence); `TransitionEngine`: closed request envelope, idempotency fingerprinting, edge legality before authority, server-derived timestamps | `policyDecision` is a **caller-supplied string** checked for `=== "ALLOW"` (line 171) — no component computes it |
| 3 | `src/ledger/durable-ledger.mjs`, `governed-ledgers.mjs` | Hash-chained append-only event/evidence ledgers with contract validation | Audit substrate exists |
| 4 | `src/ledger/temporal-ledgers.mjs` | `DecisionLedger` (append + temporal `resolveEffective`, reversion semantics), `KnowledgeLedger` (learning boundary), `OutcomeLedger` (reversion obligation) | Decision **storage/resolution** is first-class; decision **emission** is not |
| 5 | `src/registry/runtime-registry.mjs` + `contracts/agent-registration.schema.json` | Agent-instance identity records; authority ceiling A0–A5 checked against policy ceiling at registration; evaluation/lifecycle machines; `resolve()` deny-by-default (APPROVED + ACTIVE only) | Identity **verification** exists; **issuance** does not (see gap I-2) |
| 6 | `src/project/project-contract-service.mjs` | Project lifecycle; requires `authority.serverDerived === true`; one-shot decision use (`#decisionIds`); effectiveness window resolution | `serverDerived` is an adapter-asserted flag, not produced by any kernel primitive |
| 7 | `src/services/work-package-service.mjs` (P0-09 lineage) | Sole WP authorization boundary; `#serviceAuthorize` is an explicit **mirror** of `AuthorityEngine.authorize` for service-gated edges (comment at line 183, lockstep by conformance test RISK-P009-01); effective-version + baseline binding | Second authority/SoD implementation |
| 8 | `src/services/handoff-service.mjs` | Authority-never-transfers; ceiling carried; **own** SoD-at-acceptance logic (INDEPENDENCE_ROLES + actor history, ~line 293) | Third SoD implementation |
| 9 | `src/services/non-escalation-comparator.mjs` | `RISK_ORDER` (R0–R4), `DATA_CLASS_ORDER`, ceiling-tuple lattice comparison, incomparable-denies | Only risk-as-code today; ordering only, no controls mapping |
| 10 | `contracts/` (12 schemas) | `decision-record` (GOVERNANCE/AUTHORITY/DISPOSITION/REVERSION), `agent-registration`, `project-contract`/`work-package` (risk_class enum R0–R4), evidence/event/handoff/etc. | Schema set is fail-closed in `tools/validate-foundation.mjs` |
| 11 | `docs/03-project-control/candidates/agents/*.agent-registration.yaml` | 6 hand-authored identity records (claude/codex per WP) | Identity issuance is a **manual YAML practice**, not server-derived |
| 12 | Governance docs: `docs/00-governance/decision-rights.md`, `authority-and-risk-model.md`, `SECB-GOV-001.md`; `docs/16-security/02-risk-and-mutation-classes.md`; `docs/11-agents/01-roles-and-separation-of-duties.md`; root `AGENTS.md` AMD-002 | A0–A5 classes, decision-rights matrix, authority-derivation intersection, R0–R4 + M0–M5, minimum-roles-by-risk topology, I0–I4 independence, prohibited role combinations | All DRAFT / NOT EFFECTIVE; tables exist **only as prose** |
| 13 | (branch 3502d2d) `src/gateway/capability-registry-service.mjs` | Audit-first promotion gate; **own** role constants (`independent_review`, `governance`) and producer≠reviewer self-approval check | Fourth SoD implementation, with a divergent role vocabulary vs REV/GOV |

## 2. Gap table vs OM v0.1 expectations

Expectations drawn from: `decision-rights.md` (authority classes, decision matrix), `authority-and-risk-model.md` §4 (effective authority = intersection of ten factors) and §5 (non-escalation), `16-security/02` (R0–R4 × M0–M5, "Risk determines the minimum roles, independence, evidence, credential and human-approval requirements"), `SECB-GOV-001` §"Minimum roles by risk" and §13 (human authority), `11-agents/01` (prohibited combinations, I0–I4).

| ID | Kernel capability | Status | Evidence |
|---|---|---|---|
| K-1 | Deny-by-default transition authorization for governed objects | **implemented** | `TransitionEngine` + `AuthorityEngine`; unknown anything denies; edge legality precedes authority (TE-H3) |
| K-2 | Grant-based authority: scope, validity window, decision binding, one-decision-one-use | **implemented** | `authority-engine.mjs` grant checks; `project-contract-service.mjs` `#decisionIds` reuse denial |
| K-3 | State machines for Project/WorkPackage/Session/Evidence | **implemented** | `STATE_MACHINES`, `ProjectContractService.TRANSITIONS`, registry evaluation/lifecycle machines |
| K-4 | Append-only, hash-chained audit/decision/knowledge/outcome ledgers with temporal resolution and reversion | **implemented** | `durable-ledger.mjs`, `temporal-ledgers.mjs` |
| K-5 | Identity record schema + registration-time ceiling check + deny-by-default identity resolution | **implemented** | `agent-registration.schema.json`; `RuntimeRegistry.register/resolve` |
| K-6 | Non-escalation of ceilings on delegation (fail-closed incomparable) | **implemented** | `non-escalation-comparator.mjs`; consumed by handoff lineage |
| K-7 | SoD conflicting-pairs at grant configuration + actor-history SoD at authorization | **implemented** | `CONFLICTING_ROLES` scope check (constructor), prohibited-actors check (`authorize`) |
| K-8 | Contract effectiveness resolution (ACTIVE + inside window, else typed denial) | **implemented** | `resolveEffective` in project-contract-service and work-package-service |
| K-9 | SoD as a **reusable primitive** other modules call | **partial** | Four parallel implementations: authority-engine (canonical), work-package-service `#serviceAuthorize` mirror, handoff-service SoD-at-acceptance, capability-registry FU-1 (branch, divergent role vocabulary `independent_review`/`governance`). Consistency today rests on lockstep conformance tests, not shared code |
| K-10 | Risk-class registry **as code** (R0–R4 → required role topology, independence I-level, mutation ceiling, human-approval flags) | **partial** | R0–R4 exist as schema enums and `RISK_ORDER`; the controls mapping (SECB-GOV-001 minimum-roles table, `16-security/02`, I0–I4) exists only in DRAFT prose; nothing in `src/` can answer "what does R3 require?" |
| K-11 | Mutation classes M0–M5 in code | **missing** | `grep M0|M5|mutation` over `src/` returns comments only; no data structure or enforcement |
| K-12 | Server-derived identity **issuance** (mint agent-instance records, bind workload identity, emit issuance decision) | **missing** | Practice is hand-authored `candidates/agents/*.yaml`; `RuntimeRegistry` only accepts pre-built records; SECB-GOV-001 requires SecB to *issue* identity/authority; prohibited combination "agent instance and its own authority issuer" has no code anchor |
| K-13 | Authority-ceiling (A0–A5) enforcement at authorization time | **partial** | Ceiling checked at registration and compared on delegation, but `AuthorityEngine`/`TransitionEngine` never consult the actor's ceiling; no A-level → permitted-action/mutation mapping exists in code |
| K-14 | Unified policy decision point (single choke point answering "may actor A do X under context C?") | **missing** | `policyDecision` is a caller-supplied claim (`state-machine.mjs:171`); no component computes the `authority-and-risk-model.md` §4 ten-factor intersection; identity resolution, contract effectiveness, grants, SoD, and ceilings are composed ad hoc per service |
| K-15 | Decision-record emission as first-class (every authorization decision emits a validated decision record) | **partial** | Schema + `DecisionLedger` exist; `authorize()` only echoes the pre-existing `grant.decisionId`; no kernel path emits a decision record for the authorization event itself; audit-first emission exists only in the branch capability-registry |
| K-16 | `serverDerived` authority produced by a kernel primitive (not adapter-asserted) | **partial** | `project-contract-service` demands the flag; nothing in the kernel mints it — follows K-14 |

**Gap counts: implemented 8, partial 5, missing 3.**

## 3. Bounded producer work plan (max 3 slices)

Scope discipline: MOD-GOV P0 bar is the **kernel** — deny-by-default primitives other modules call. All three slices are **additive extraction/consolidation**; no existing service is rewired, no schema changes, no existing gate weakened. Adoption by services is a later, separately-governed step.

### Slice S1 — SoD rule primitive extraction

- **Files:** new `src/control/sod-rules.mjs`; new `tests/sod-rules.test.mjs`; `src/control/authority-engine.mjs` re-exports and delegates (behavior-preserving); `MANIFEST.json`.
- **Behavior:** one reusable primitive owning: `CONFLICTING_ROLES` pairwise check over a role set; `prohibitedActorsForRole(role, context)` (the REV/QA/GOV/EVIDENCE_ACCEPTOR history ladder currently inlined in `authorize()`); a canonical role vocabulary with declared aliases (so the branch capability-registry's `independent_review`→REV, `governance`→GOV can bind on a later slice without kernel change). Handoff-service and capability-registry are **not** rewired in S1.
- **Acceptance checks:** all existing tests pass unchanged (`npm test`); new unit tests for the primitive; a parity test asserting `AuthorityEngine.authorize` verdicts identical pre/post for a matrix of allow/deny cases; `node tools/validate-foundation.mjs` exit 0.
- **Est. size:** ~150–250 LOC + tests.

### Slice S2 — Risk/authority/mutation class registry as code

- **Files:** new `src/control/risk-registry.mjs`; new `tests/risk-registry.test.mjs`; `MANIFEST.json`.
- **Behavior:** pure frozen data + lookups, codifying the DRAFT doc tables verbatim: `RISK_CLASSES` R0–R4 → { minimum role topology, minimum independence I-level, mutation ceiling, humanApproval flags } per SECB-GOV-001 and `16-security/02`; `MUTATION_CLASSES` M0–M5; `AUTHORITY_CLASSES` A0–A5 → permitted mutation ceiling; comparators reusing/re-exporting `RISK_ORDER`/`DATA_CLASS_ORDER` from `non-escalation-comparator.mjs` (single source of ordering). API: `requiredControls(riskClass)`, `mutationCeilingFor(authorityClass)`, `isRiskAtMost(a, b)`. Unknown class → typed denial, never a default.
- **Acceptance checks:** unit tests incl. fail-closed unknown-class behavior; a doc-parity test embedding the doc tables as fixtures so drift between code and `authority-and-risk-model.md`/`16-security/02` fails the suite; validator exit 0.
- **Est. size:** ~120–200 LOC + tests.

### Slice S3 — Policy decision point (PDP) facade, unwired

- **Files:** new `src/control/policy-decision-point.mjs`; new `tests/policy-decision-point.test.mjs`; `MANIFEST.json`.
- **Behavior:** single deny-by-default choke point `decide({ actor, action, context })` composing injected resolvers: identity (RuntimeRegistry `resolve`), contract effectiveness, grant authorization (`AuthorityEngine`), SoD (S1), risk/ceiling (S2). Returns a frozen `{ decision: "ALLOW"|"DENY", code, reasons, decisionRecordCandidate }` where `decisionRecordCandidate` validates against `contracts/decision-record.schema.json` (decision emission becomes first-class; the **caller** appends it to `DecisionLedger` — the PDP holds no ledger authority). Any missing/failing resolver denies. Output carries `serverDerived: true` only when every factor resolved server-side — closing K-16 for future adopters. **Nothing consumes the PDP in this slice**; it supplies the value the existing `policyDecision` field expects, for adoption under separate governance.
- **Acceptance checks:** unit tests for each denial factor; adversarial tests (unknown actor, suspended identity, expired contract, ceiling exceedance, SoD conflict, resolver throwing → deny); decision-record candidate schema-validates; existing suite untouched and green; validator exit 0.
- **Est. size:** ~250–350 LOC + tests.

## 4. Explicit non-goals

1. No rewiring of `work-package-service`, `handoff-service`, `project-contract-service`, gateway, or MCP server to the new primitives (adoption = later governed slices).
2. No changes to `contracts/*` schemas (validator's schema set is fail-closed) and no new schemas.
3. No changes to `CONFLICTING_ROLES` pair values, `REQUIRED_ROLE` map entries, A/R/M class **definitions**, or any SoD semantics — extraction is behavior-preserving only.
4. No identity **issuance** service in this round (K-12 needs a GOV design decision on workload-identity binding first; flagged as the next candidate after S1–S3).
5. No changes on or merges of `bst/mcp-registry-broker-integration`; the capability-registry alias binding is future work.
6. No persistence, transport, network, or credential surface; kernel stays pure in-process.
7. No modification of ADR-0015 R5, release gates, or operator queue; no production declaration.

## 5. R-class flags

| Item | Flag |
|---|---|
| S1 (touches `authority-engine.mjs` internals) | Authority-semantics-bearing file: treat activation as **R3** — behavior-preserving evidence (parity tests) required; SEC + GOV review at merge per `docs/AGENTS.md` |
| S2 (codifies DRAFT governance tables as code) | **R2** for the code; the tables' *content* is authority-defining, so any deviation from the docs would be R3 — the doc-parity test is the control |
| S3 (composes authority semantics into a PDP) | **R3** — candidate preparation authorized under AMD-002 advise-and-proceed; wiring/activation requires SEC + GOV; unwired-by-construction in this plan |
| Any future change to SoD pairs, REQUIRED_ROLE, A/R/M definitions, or service rewiring | **R3/R4 — out of scope here**; requires SEC + GOV pre-approval per AMD-002 retained hard gates |

## 6. Advisory status fields

```yaml
truth_status: verified_true            # all evidence read directly from cited files at 49d1e0c / 3502d2d
authority_status: advisory_only
implementation_status: candidate       # this record proposes; it authorizes nothing
risk_class: R1                         # the record itself: documentation candidate on a non-main branch
self_certification:
  agent_id: claude-cortex-modgov-assess-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Recommend improvements only. Do not execute them. Producer round scope is bounded to S1–S3 above; anything else is a new decision.
