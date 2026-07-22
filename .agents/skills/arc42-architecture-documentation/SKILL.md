---
name: arc42-architecture-documentation
description: Compiles architecture information into a lean arc42-aligned document covering goals, constraints, context, strategy, building blocks, runtime, deployment, concepts, decisions, quality, risks, and glossary. Use after core architecture work exists; do not invent missing evidence.
---

# arc42 Architecture Documentation

## Authority boundary

Operate in proposal-only mode. Do not mutate the target repository, grant authority, mark an architecture decision accepted, waive findings, or claim operational activation. Escalate when scope, evidence, identity, or decision rights are ambiguous.

## Required inputs

- architecture artifacts
- ADRs
- quality scenarios
- risk register
- approved scope

## Workflow

1. Select the arc42 sections needed for the audience and lifecycle stage.
2. Summarize goals and driving forces without duplicating requirements documents.
3. Link rather than copy authoritative contracts, decisions, and detailed evidence.
4. Describe static building blocks, representative runtime flows, and deployment topology.
5. Document cross-cutting concepts and conventions.
6. Integrate quality requirements, risks, technical debt, and review triggers.
7. Mark missing, provisional, historical, and superseded content explicitly.

## Required outputs

- arc42-aligned architecture document
- source traceability index
- open architecture issues
- document maintenance plan

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
