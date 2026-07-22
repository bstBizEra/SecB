---
name: architecture-fitness-functions
description: Converts architecture decisions and quality constraints into automated or repeatable conformance checks. Use after decisions are explicit and measurable. Does not replace independent review, operational evidence, or governance decisions.
---

# Architecture Fitness Functions

## Authority boundary

Operate in proposal-only mode. Do not mutate the target repository, grant authority, mark an architecture decision accepted, waive findings, or claim operational activation. Escalate when scope, evidence, identity, or decision rights are ambiguous.

## Required inputs

- ADRs
- quality scenarios
- architecture constraints
- repository and runtime observability surfaces

## Workflow

1. Select architecture rules that can be tested deterministically or measured continuously.
2. Define the protected property, scope, authoritative inputs, expected result, tolerance, and owner.
3. Choose static, build-time, integration, runtime, security, data, dependency, or operational checks.
4. Design positive, negative, boundary, and adversarial cases.
5. Define failure severity, evidence capture, waiver authority, expiry, and escalation.
6. Integrate checks into appropriate CI, runtime, conformance, or governance gates.
7. Review fitness functions when decisions, architecture, dependencies, or risk change.

## Required outputs

- fitness-function catalogue
- test specifications
- gate integration plan
- failure and waiver policy
- evidence requirements

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
