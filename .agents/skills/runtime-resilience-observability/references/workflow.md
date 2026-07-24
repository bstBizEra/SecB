# Detailed Workflow — Runtime, Resilience, and Observability Architecture

## Preconditions

- Confirm: runtime workflows.
- Confirm: quality scenarios.
- Confirm: failure modes.
- Confirm: operational constraints.

## Detailed checks

- Identify the authoritative owner for workflow and business state.
- Model normal, waiting, degraded, paused, recovering, quarantined, failed, and terminal states.
- Define idempotency, concurrency, timeouts, retries, backoff, checkpoints, resume validation, and compensation.
- Design health, readiness, backpressure, capacity, and dependency-failure behavior.
- Define telemetry using common semantic conventions and explicit correlation identifiers.
- Set privacy-aware content capture, redaction, retention, and evidence boundaries.
- Define SLOs, alerts, incident ownership, replay, disaster recovery, and resilience tests.

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
