# SecB Governed Operating Model v0.1

**Artifact:** `SECB-GOV-001`  
**Title:** SecB Governed Platform, Product, Module and Delivery Operating Model  
**Version:** `0.1`  
**Status:** `DRAFT_FOR_IMPLEMENTATION_REVIEW`  
**Scope:** Repository-wide governance, multi-agent delivery, evidence, research, organizational learning and skill promotion.

This pack makes SecB the governed control plane for platform development and organizational learning. It defines how goals become work, how work is assigned across Codex, Claude Code, Antigravity and other harnesses, how implementation is observed and reviewed, and how unsuccessful attempts become research, knowledge and reusable skills.

## Governing proposition

> Unsafe or unauthorized mutation stops. Learning does not stop.

SecB therefore uses two related but separate dispositions:

1. **Execution disposition:** allow, deny, error, partial or complete.
2. **Work disposition:** continue, research-required, replan-required, escalation-required, retry-authorized, delivered or retired.

A denied command or failed implementation is not the end of the work lifecycle. It must create a structured failure record, a causal assessment and an authorized next action.

## Start here

- [`AGENTS.md`](../../00-governance/agents-instructions-om-v0.1-candidate.md) — repository-wide instructions for every agent and harness.
- [`docs/README.md`](../../README.md) — documentation map.
- [`docs/00-governance/SECB-GOV-001.md`](../../00-governance/SECB-GOV-001.md) — controlling operating model.
- [`docs/12-execution/04-failure-to-capability-loop.md`](../../12-execution/04-failure-to-capability-loop.md) — Fail → Learn → Research → Knowledge → Skill lifecycle.
- [`docs/14-delivery/01-module-allocation.md`](../../14-delivery/01-module-allocation.md) — module and harness split.
- [`docs/templates/`](../../templates/) — machine-readable contracts.

## Repository control hierarchy

```text
Human Governance Authority
→ SECB-GOV-001
→ Root AGENTS.md
→ Approved Project Contract
→ Approved Work Package
→ Context Receipt and Harness Assignment
→ Nested AGENTS.md, when present
→ Runtime-specific instructions
```

Lower-level instructions may narrow scope but may not expand authority or override safety, evidence, credential, separation-of-duties or promotion controls.
