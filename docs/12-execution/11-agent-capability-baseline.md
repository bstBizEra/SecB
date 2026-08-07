# BOPEN-ENG-CAP-001 — Agent Capability Baseline & ADR Obligations

## Document Control

| Field | Value |
|---|---|
| Artifact ID | BOPEN-ENG-CAP-001 |
| Version | 1.0.0-draft |
| Status | DRAFT / NOT EFFECTIVE |
| Owner | SecB Engineering & Governance Authority |
| Extends | [`08-bopen-engineering-loop.md`](08-bopen-engineering-loop.md) |
| Effective when | Approved by human GOV and referenced in `AGENTS.md` |

---

## 1. Purpose

The loop states what an agent does at each stage. This document states what an
agent is assumed to be able to do at all of them, and when it owes an ADR.

---

## 2. Eight baseline skills

Each skill is **mapped to its existing authoritative definition, not restated
here**. A second statement of a rule is a second rule.

| Skill | Authoritative definition |
|---|---|
| Verification before completion | [`AGENTS.md`](../../AGENTS.md) working rule 6 |
| Requirements traceability | [`work-package-contract.md`](../03-project-control/work-package-contract.md) |
| Context engineering | [`SECB-GOV-SURFACE-001.md`](../00-governance/SECB-GOV-SURFACE-001.md) §2 |
| Systematic debugging | [`SECB-GOV-SURFACE-001.md`](../00-governance/SECB-GOV-SURFACE-001.md) §3 |
| Test-driven development | [`08-bopen-engineering-loop.md`](08-bopen-engineering-loop.md) §3.3 (negative tests and probes) |
| Security and authorization review | [`authority-and-risk-model.md`](../00-governance/authority-and-risk-model.md) |
| Agent orchestration and subagent isolation | [`06-parallel-execution.md`](06-parallel-execution.md), [`07-context-and-handoff.md`](07-context-and-handoff.md), and [`10-inner-loop-efficiency.md`](10-inner-loop-efficiency.md) §3.2 |
| Safe integration engineering | [`threat-model.md`](../08-security/threat-model.md) and [`ADR-0011`](../adr/0011-single-mcp-invocation-enforcement-pipeline.md) |

Verification before completion is the controlling one. An edit whose result was
not observed is not a completed edit, whatever else was satisfied.

---

## 3. Nine-layer capability matrix

| Layer | Responsibilities |
|---|---|
| Governance | Traceability, authorization, definition of ready and done, gate compliance |
| Context | Repository orientation, AST indexing, ADR retrieval |
| Design | Architecture, ADR drafting, API contracts, schema modelling |
| Execution | TDD cycle, minimal diffs, clean-code standards |
| Diagnosis | Log and trace inspection, root-cause isolation, performance analysis |
| Coordination | Orchestration, subagent isolation, worktree parallelism, structured status returns |
| Integration | MCP engineering, external APIs, safe migrations |
| Assurance | Specification review, code review, security review, regression testing |
| Delivery | Pipeline diagnosis, build provenance, rollback readiness |

---

## 4. ADR obligations

An ADR is drafted when a slice touches any of:

- a schema change;
- a new external dependency;
- the authority model;
- a breaking contract.

Rules:

1. Drafts go to the **existing** [`docs/adr/`](../adr/) directory under its
   established `NNNN-slug.md` convention. No new ADR location is created.
2. A drafted ADR enters at status `Proposed`.
3. Only an operator merge to `main` moves an ADR to `Accepted`. An agent never
   writes `Accepted`.
4. A drafted ADR records the options considered and the residual risk, not only
   the option chosen. An ADR that lists one option has recorded a preference,
   not a decision.
