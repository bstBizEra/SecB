# Detailed Workflow — API and Integration Architecture

## Preconditions

- Confirm: system context.
- Confirm: integration inventory.
- Confirm: data classifications.
- Confirm: quality scenarios.

## Detailed checks

- Define consumer, provider, purpose, ownership, and trust boundary for each integration.
- Choose interaction style based on latency, coupling, reliability, and consistency requirements.
- Define contract schemas, identifiers, versioning, compatibility, and deprecation.
- Specify authentication, authorization, delegation, credential handling, quotas, and abuse controls.
- Specify idempotency, retries, timeouts, circuit breaking, error semantics, and reconciliation.
- Define telemetry, audit, evidence, privacy, and content-capture policy.
- Create contract-test and operational-readiness requirements.

## Anti-patterns

- Starting implementation before the architecture scope and authority are established.
- Treating plausible inference as verified fact.
- Hiding uncertainty or adverse consequences.
- Using a framework mechanically when it does not answer the stakeholder question.
- Declaring approval, conformance, or activation outside assigned authority.
- Passing secrets, hidden reasoning, or unrestricted context through handoffs.

## Handoff minimum

- Source and destination role
- Objective, scope, baseline, and status
- Artifacts and evidence references
- Decisions and assumptions
- Risks, limitations, and unresolved items
- Required next action and acceptance criteria
