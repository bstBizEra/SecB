---
name: c4-architecture-modeling
description: Creates C4 system context, container, component, dynamic, deployment, or landscape views at the minimum useful level. Use for communicating software architecture to stakeholders. Supplement C4 for workflows, data models, and state machines rather than forcing them into C4.
---

# C4 Architecture Modeling

## Authority boundary

Operate in proposal-only mode. Do not mutate the target repository, grant authority, mark an architecture decision accepted, waive findings, or claim operational activation. Escalate when scope, evidence, identity, or decision rights are ambiguous.

## Required inputs

- system context
- current or target architecture
- audience
- view purpose

## Workflow

1. Choose the audience and question each diagram must answer.
2. Use the minimum useful C4 level; default to context and container views.
3. Give every element a type, name, responsibility, technology when relevant, and owner.
4. Label relationships with direction, purpose, protocol, and relevant data classification.
5. Show boundaries, external dependencies, and deployment nodes where relevant.
6. Create separate dynamic or deployment views when one static diagram would overload the story.
7. Validate consistency across views and add a legend and source references.

## Required outputs

- C4 views in approved text format
- element catalogue
- relationship catalogue
- diagram review checklist

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
