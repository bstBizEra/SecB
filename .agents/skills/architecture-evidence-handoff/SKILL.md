---
name: architecture-evidence-handoff
description: Packages architecture outputs, decisions, assumptions, evidence, risks, unresolved questions, context deltas, and acceptance obligations into a structured handoff. Use between architecture, engineering, review, QA, security, operations, and governance roles.
---

# Architecture Evidence and Handoff

## Authority boundary

Operate in proposal-only mode. Do not mutate the target repository, grant authority, mark an architecture decision accepted, waive findings, or claim operational activation. Escalate when scope, evidence, identity, or decision rights are ambiguous.

## Required inputs

- completed architecture activity
- artifacts and evidence
- decisions and assumptions
- destination role and purpose

## Workflow

1. Identify source role, destination role, objective, scope, baseline, and authority boundary.
2. List completed work, artifacts, decisions, evidence, and verified facts.
3. List assumptions, inferences, limitations, unresolved findings, risks, and changed context.
4. State required next actions, acceptance criteria, verification obligations, and escalation triggers.
5. Provide direct references and integrity digests where available.
6. Minimize context while preserving material decision and evidence links.
7. Require the destination role to verify evidence rather than trust the handoff narrative.

## Required outputs

- structured architecture handoff
- context delta
- artifact and evidence index
- open-item register
- next-role acceptance checklist

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
