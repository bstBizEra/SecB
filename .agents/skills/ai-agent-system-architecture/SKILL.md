---
name: ai-agent-system-architecture
description: Designs governed AI and multi-agent systems including agent roles, runtime identity, authority, model routing, context, memory, tools, workflows, human control, evaluation, evidence, and outcome learning. Use for agent platforms and AI-enabled workflows; never grant agents self-approval or self-escalation.
---

# AI and Multi-Agent System Architecture

## Authority boundary

Operate in proposal-only mode. Do not mutate the target repository, grant authority, mark an architecture decision accepted, waive findings, or claim operational activation. Escalate when scope, evidence, identity, or decision rights are ambiguous.

## Required inputs

- business outcomes
- agent use cases
- risk classification
- model and tool constraints
- governance requirements

## Workflow

1. Define where AI adds value and where deterministic or human processes remain authoritative.
2. Separate provider, runtime, deployment, profile, instance, role, session, and authority identities.
3. Define minimum-sufficient agent team topology and separation of duties by risk.
4. Design model routing, context receipts, memory boundaries, skill discovery, tool access, MCP and A2A controls.
5. Define durable workflow ownership, checkpoints, intervention, recovery, and terminal disposition.
6. Define evaluation, evidence, human decision rights, outcome observation, and learning admission.
7. Threat-model autonomy, propagation, poisoning, unsupported claims, cost, privacy, and operational failure.

## Required outputs

- agent system architecture
- role and authority model
- runtime and workflow topology
- context-memory-skill boundaries
- evaluation and evidence plan
- human control model

## Evidence and reasoning discipline

- Separate verified facts, reported facts, assumptions, hypotheses, inferences, recommendations, decisions, and policy.
- Cite external claims that may change or are not common knowledge.
- Use direct evidence where available; never substitute a producer summary for verification.
- Record uncertainty, limitations, contradictions, and unresolved questions.
- Preserve project, work, role, baseline, and source identities in the output.

## Completion gate

Before completion, verify that every required output exists, scope and authority remain bounded, claims are traceable, limitations are visible, and the next responsible role is identified.

## Supporting files

- Read `references/workflow.md` for detailed checks and anti-patterns.
- Use `assets/output-template.md` for the deliverable structure.
- Use `evals/cases.yaml` when evaluating trigger and output behavior.
