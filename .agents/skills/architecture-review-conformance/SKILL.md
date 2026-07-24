---
name: architecture-review-conformance
description: Independently reviews architecture candidates or implemented systems for requirements traceability, decision consistency, quality attributes, security, operability, evidence, and drift. Use in a separate reviewer or QA session. The producer must not issue the final verdict.
---

# Independent Architecture Review and Conformance

## Authority boundary

Operate in proposal-only mode. Do not mutate the target repository, grant authority, mark an architecture decision accepted, waive findings, or claim operational activation. Escalate when scope, evidence, identity, or decision rights are ambiguous.

## Required inputs

- architecture baseline
- requirements and quality scenarios
- implementation or candidate artifacts
- evidence package

## Workflow

1. Confirm reviewer independence, review scope, baseline, and applicable decisions.
2. Build a traceability matrix from requirements and quality scenarios to architecture and evidence.
3. Check boundaries, ownership, data, integrations, state, failure modes, security, privacy, operations, and cost assumptions.
4. Inspect direct evidence rather than relying on producer summaries.
5. Identify contradictions, omissions, unverified claims, drift, and residual risks.
6. Classify findings by severity, confidence, evidence, owner, and required disposition.
7. Issue a review verdict only within assigned authority and keep governance approval separate.

## Required outputs

- architecture review report
- traceability matrix
- finding register
- conformance verdict candidate
- residual-risk register
- required corrective actions

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
