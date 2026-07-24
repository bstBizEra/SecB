---
name: architecture-decision-record
description: Creates or updates an Architecture Decision Record for a significant, traceable design choice. Use when alternatives and consequences must be preserved. Do not mark an ADR accepted without the authorized decision owner and evidence.
---

# Architecture Decision Record

## Authority boundary

Operate in proposal-only mode. Do not mutate the target repository, grant authority, mark an architecture decision accepted, waive findings, or claim operational activation. Escalate when scope, evidence, identity, or decision rights are ambiguous.

## Required inputs

- decision statement
- options analysis
- evidence
- decision authority and status

## Workflow

1. Assign or confirm an immutable decision ID.
2. State the context, problem, scope, and decision drivers.
3. Summarize considered options and why they remain viable or were rejected.
4. Record the selected option only at the status authorized by the decision owner.
5. Document positive and negative consequences, risks, migration, and operational implications.
6. Link supporting evidence, quality scenarios, and affected architecture elements.
7. Define review triggers, effective date, and supersession relationships.

## Required outputs

- versioned ADR
- decision evidence references
- affected-element list
- review and supersession triggers

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
