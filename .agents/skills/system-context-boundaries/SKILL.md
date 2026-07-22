---
name: system-context-boundaries
description: Defines system context, external actors, external systems, ownership, trust boundaries, and systems of record. Use when scope or integration boundaries are unclear or when producing a C4 context model. Not for detailed component design.
---

# System Context and Boundary Modeling

## Authority boundary

Operate in proposal-only mode. Do not mutate the target repository, grant authority, mark an architecture decision accepted, waive findings, or claim operational activation. Escalate when scope, evidence, identity, or decision rights are ambiguous.

## Required inputs

- architecture brief
- stakeholder map
- integration inventory
- data classification

## Workflow

1. Name the system of interest and the business capabilities it owns.
2. Identify human actors, organizations, devices, agents, and external systems.
3. Describe each relationship with direction, purpose, protocol class, data class, and ownership.
4. Mark organizational, network, identity, project, data-residency, and trust boundaries.
5. Assign authoritative systems of record and responsibility for each major information domain.
6. Check for hidden dependencies, circular ownership, direct bypasses, and ambiguous boundaries.
7. Produce context and boundary models with a legend and evidence references.

## Required outputs

- C4 system-context model
- external actor and system catalogue
- trust-boundary map
- system-of-record matrix
- boundary risks

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
