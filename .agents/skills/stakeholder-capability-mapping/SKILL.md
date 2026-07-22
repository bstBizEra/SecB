---
name: stakeholder-capability-mapping
description: Maps business stakeholders, outcomes, capabilities, ownership, responsibilities, and architecture concerns. Use to connect technical architecture to business value and domain accountability. Do not use as a generic organization chart generator.
---

# Stakeholder and Capability Mapping

## Authority boundary

Operate in proposal-only mode. Do not mutate the target repository, grant authority, mark an architecture decision accepted, waive findings, or claim operational activation. Escalate when scope, evidence, identity, or decision rights are ambiguous.

## Required inputs

- business objectives
- stakeholder list
- operating model
- project profile

## Workflow

1. Identify outcome owners, decision authorities, operators, users, regulators, and affected stakeholders.
2. Translate objectives into business and platform capabilities.
3. Assign accountable owners and supporting roles to capabilities.
4. Map stakeholder concerns to architecture views, quality attributes, and evidence.
5. Identify ownership gaps, overlapping authority, and separation-of-duties conflicts.
6. Prioritize capabilities by value, risk, dependency, and implementation horizon.
7. Produce a capability map and architecture concern matrix.

## Required outputs

- stakeholder map
- capability map
- ownership matrix
- concern-to-view matrix
- capability priorities

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
