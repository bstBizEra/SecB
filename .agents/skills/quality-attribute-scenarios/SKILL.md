---
name: quality-attribute-scenarios
description: Transforms vague non-functional expectations into measurable quality attribute scenarios for performance, reliability, security, usability, compatibility, maintainability, portability, safety, and cost. Use before selecting architecture options or acceptance gates.
---

# Quality Attribute Scenario Engineering

## Authority boundary

Operate in proposal-only mode. Do not mutate the target repository, grant authority, mark an architecture decision accepted, waive findings, or claim operational activation. Escalate when scope, evidence, identity, or decision rights are ambiguous.

## Required inputs

- architecture brief
- stakeholder concerns
- risk classification
- known service objectives

## Workflow

1. Select quality characteristics relevant to the system and project profile.
2. For each scenario define source, stimulus, environment, affected artifact, response, and measurable response.
3. Distinguish steady-state, peak, degraded, recovery, attack, and change scenarios.
4. Define measurement method, evidence source, threshold, owner, and review window.
5. Identify conflicts between scenarios and make trade-offs explicit.
6. Trace scenarios to architecture decisions, tests, monitoring, and exit gates.
7. Reject adjectives such as fast, scalable, secure, or resilient unless measurable.

## Required outputs

- quality attribute scenario register
- measurement and evidence plan
- quality trade-off register
- traceability to decisions and tests

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
