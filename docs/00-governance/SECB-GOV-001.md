# SECB-GOV-001 — SecB Governed Platform, Product, Module and Delivery Operating Model v0.1

## Document control

| Field | Value |
|---|---|
| Artifact ID | SECB-GOV-001 |
| Version | 0.1 |
| Status | DRAFT_FOR_IMPLEMENTATION_REVIEW |
| Owner | SecB Governance Authority |
| Applies to | SecB platform, products, modules, projects, agents, harnesses, skills and delivery workflows |
| Effective when | Approved Project Contract and implementation baseline reference this version |

## 1. Purpose

This operating model defines how SecB converts organizational intent into governed execution, evidence, outcomes, knowledge and reusable capability. It is the normative bridge between platform architecture and day-to-day delivery.

## 2. Strategic position

SecB is not a single coding agent and not a conventional task tracker. It is the governed control plane that coordinates:

```text
Governance and Identity
+ Portfolio, Product and Project Control
+ Agent and Harness Operations
+ Durable Execution and Workspaces
+ Evidence and Assurance
+ Memory and Context Federation
+ Knowledge and Code Intelligence
+ SkillsHub
+ MCP and A2A Federation
+ Live Operations, Cost and Outcome Intelligence
```

## 3. Operating doctrine

### 3.1 Safety and learning are separate state dimensions

SecB must deny actions that lack authority, exceed scope, expose secrets, violate separation of duties or threaten protected environments. That denial protects the system boundary.

The associated work item must not disappear into an undifferentiated terminal state. It transitions to one of:

- `RESEARCH_REQUIRED`
- `AUTHORITY_CORRECTION_REQUIRED`
- `REPLAN_REQUIRED`
- `DEPENDENCY_REQUIRED`
- `INCIDENT_RESPONSE_REQUIRED`
- `RISK_ACCEPTANCE_REQUIRED`
- `RETRY_AUTHORIZED`
- `RETIRED_WITH_RATIONALE`

### 3.2 Evidence is the conversion medium

SecB does not learn from confidence or narration. It learns from attributable observations, verified evidence, outcomes and explicit decisions.

### 3.3 Harnesses do not own governance

Codex, Claude Code, Antigravity and future tools are runtime products. Roles, authority, scope, budgets, context, evidence and final dispositions are issued by SecB.

## 4. Scope model

```text
Portfolio
→ Product
→ Platform Capability
→ Module
→ Project
→ Goal
→ Objective / Key Result
→ Work Package
→ Task
→ Session
→ Artifact / Evidence
→ Outcome
→ Knowledge / Skill
```

Every lower-level entity must reference its parent and authoritative source.

## 5. Product and module governance

Each module must have:

- module ID and owner;
- business and technical purpose;
- boundaries and dependencies;
- data classification;
- APIs and event contracts;
- primary and secondary harness assignments;
- quality, security and operational acceptance criteria;
- evidence obligations;
- release and rollback authority;
- knowledge and skill publication rules.

## 6. Universal delivery lifecycle

```text
Intent → Registration → Framing → Research → Options → Decision
→ Design → Planning → Authorization → Execution → Self-Verification
→ Independent Review → QA/Security → Governance → Delivery
→ Outcome Observation → Learning → Knowledge → Skill → Improvement
```

Risk-based Project Profiles may compress stages but may not remove identity, authority, acceptance criteria, evidence, outcome or learning controls.

## 7. Goal and schedule governance

Goals are outcome-oriented, time-bounded and measurable. Schedules create control rhythms rather than artificial activity.

Required cadence families:

- session preflight and checkpoint cadence;
- daily portfolio and evidence cadence;
- weekly planning, integration and learning cadence;
- monthly architecture, security, cost and skill governance cadence;
- quarterly product and capability review.

## 8. Role topology

SecB uses dynamic role assignment. A role is a temporary accountability in a specific work context, not a permanent property of a model or runtime.

Minimum roles by risk:

| Risk | Required topology |
|---|---|
| R0 | Producer + evidence check |
| R1 | Producer + REV |
| R2 | SARCHI/ARCHI + ENGIN + REV + QA |
| R3 | R2 + SEC + DOMAIN + human GOV |
| R4 | Independent design, ENGIN, REV, QA, SEC, OPS, release authority and explicit human approvals |

## 9. Failure-to-capability lifecycle

```text
Failed, blocked, denied or rejected attempt
→ Failure Evidence Envelope
→ Classification and containment
→ Reproduction and root analysis
→ Research and option generation
→ Corrective decision
→ Authorized retry or replan
→ Experience candidate
→ Knowledge candidate
→ Skill candidate
→ Evaluation and promotion
```

Learning is mandatory when the failure is repeatable, high-impact, cross-project, caused by a control gap, or likely to recur.

## 10. Parallel delivery

SecB supports partitioned parallel build, competitive variants and producer-assurance parallelism. Shared authoritative symbols, migrations, lockfiles and protected branches remain single-writer or serialized.

## 11. Knowledge model

SecB keeps distinct Work, Event, Evidence, Decision, Knowledge, Capability and Outcome ledgers. Retrieval indexes and vector stores are projections, not sources of truth.

## 12. Skill model

Skills are versioned, bounded, testable capability packages with explicit inputs, outputs, tool permissions, model/harness compatibility, evidence, evaluation and lifecycle state.

## 13. Human authority

Human governance retains final authority over:

- production activation;
- irreversible or regulated actions;
- risk acceptance and policy exceptions;
- skill publication to broad organizational scope;
- cross-project knowledge promotion;
- credential and secret-management policy;
- changes to this operating model.

## 14. Conformance

A module or project conforms when it can prove:

- canonical identity and scope;
- approved goal and work package;
- valid role and harness assignments;
- bounded execution and observable events;
- fresh verification and independent review;
- accepted evidence and outcome receipt;
- structured learning disposition;
- no unauthorized privilege, secret or promotion path.
