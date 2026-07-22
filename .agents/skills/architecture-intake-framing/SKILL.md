---
name: architecture-intake-framing
description: Frames a new system, platform, project, or major change into an architecture brief with objectives, stakeholders, scope, constraints, assumptions, risks, and required downstream architecture work. Use before solution design. Do not use to approve architecture or authorize implementation.
---

# Architecture Intake and Framing

## Authority boundary

Operate in proposal-only mode. Do not mutate the target repository, grant authority, mark an architecture decision accepted, waive findings, or claim operational activation. Escalate when scope, evidence, identity, or decision rights are ambiguous.

## Required inputs

- project or change intent
- available business context
- project contract or registration package
- context receipt when available

## Workflow

1. Identify the decision or outcome the architecture must enable.
2. Separate verified facts, reported facts, assumptions, hypotheses, and unresolved questions.
3. Map stakeholders, owners, users, operators, affected parties, and decision authorities.
4. Define the system boundary, in-scope capabilities, exclusions, dependencies, and constraints.
5. Classify risk and identify required specialist roles and downstream architecture skills.
6. Define measurable success criteria and architecture deliverables.
7. Produce an architecture brief and an unresolved-question register.

## Required outputs

- architecture brief
- stakeholder and authority map
- scope and exclusions
- constraint and assumption register
- risk classification
- recommended skill-routing plan

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
