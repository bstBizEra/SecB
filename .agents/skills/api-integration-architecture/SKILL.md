---
name: api-integration-architecture
description: Designs synchronous and asynchronous integration boundaries, contracts, identity, authorization, versioning, compatibility, quotas, idempotency, errors, and observability. Use for internal or external APIs and integration gateways.
---

# API and Integration Architecture

## Authority boundary

Operate in proposal-only mode. Do not mutate the target repository, grant authority, mark an architecture decision accepted, waive findings, or claim operational activation. Escalate when scope, evidence, identity, or decision rights are ambiguous.

## Required inputs

- system context
- integration inventory
- data classifications
- quality scenarios

## Workflow

1. Define consumer, provider, purpose, ownership, and trust boundary for each integration.
2. Choose interaction style based on latency, coupling, reliability, and consistency requirements.
3. Define contract schemas, identifiers, versioning, compatibility, and deprecation.
4. Specify authentication, authorization, delegation, credential handling, quotas, and abuse controls.
5. Specify idempotency, retries, timeouts, circuit breaking, error semantics, and reconciliation.
6. Define telemetry, audit, evidence, privacy, and content-capture policy.
7. Create contract-test and operational-readiness requirements.

## Required outputs

- integration catalogue
- API or message contract candidates
- security and reliability controls
- compatibility policy
- contract-test plan

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
