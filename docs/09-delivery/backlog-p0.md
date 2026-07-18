# P0 Implementation Backlog

**Document ID:** SECB-BACKLOG-P0-001
**Version:** 1.0.0-draft
**Status:** DRAFT / NOT AUTHORIZED

| WP | Work package | Primary deliverable | Dependency |
|---|---|---|---|
| P0-01 | Governance baseline | document control, decision rights, fail-closed rules | none |
| P0-02 | Canonical identities | ID, version, actor, project, session schemas | P0-01 |
| P0-03 | Universal work ontology | portfolio-to-outcome relationships | P0-02 |
| P0-04 | Project profiles | initial eight profiles | P0-03 |
| P0-05 | Risk and authority engine | R0–R4, A0–A5 derivation | P0-02 |
| P0-06 | Role and SoD engine | assignments, conflicts, independence tests | P0-05 |
| P0-07 | Durable state machines | project/work/session/evidence/knowledge/skill | P0-02 |
| P0-08 | Project Contract service | validation, approval, activation, revocation | P0-05, P0-07 |
| P0-09 | Work Package service | authorization and acceptance contracts | P0-08 |
| P0-10 | Context federation | Context Receipt, retrieval policy, compaction | P0-08, P0-09 |
| P0-11 | Handoff and A2A envelope | structured handoff, non-escalation | P0-06, P0-10 |
| P0-12 | Event ledger | canonical envelope, ordering, trace correlation | P0-02, P0-07 |
| P0-13 | Evidence ledger | sealing, verification, acceptance, replay | P0-12 |
| P0-14 | Decision/knowledge/outcome ledgers | temporal claims and learning boundary | P0-13 |
| P0-15 | Runtime registry and adapters | Codex, Claude, generic adapter contracts | P0-02, P0-05 |
| P0-16 | Host Runtime Agent | read-only Windows/WSL/Linux observation | P0-12, P0-15 |
| P0-17 | Live Operations UI | fleet, workflow, terminal, diff, evidence | P0-12, P0-16 |
| P0-18 | Conformance harness | positive/negative/adversarial cases | P0-05–P0-17 |
| P0-19 | Read-only self-pilot | complete governed execution chain | P0-18 |
| P0-20 | Governance verdict | residual risk and activation decision | P0-19 |
| P0-21 | SecB MCP Server | governed read-only MCP tool surface (stdio, alpha) | P0-09, P0-10, P0-11 |

No P0 backlog item grants mutation authority merely by being implemented.

## Parallel Build Candidate

The proposed first Codex/Claude implementation wave is defined in [`codex-claude-git-worktree-build-plan.md`](codex-claude-git-worktree-build-plan.md). It pairs P0-08 with a bounded P0-15A tranche using disjoint worktrees and write sets. The plan is `DRAFT / NOT AUTHORIZED`.
