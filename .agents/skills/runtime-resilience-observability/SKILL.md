---
name: runtime-resilience-observability
description: Designs durable execution, state ownership, retries, checkpoints, recovery, backpressure, incidents, logs, metrics, traces, events, privacy, and operational evidence. Use for systems that must survive failures or support live operations and replay.
---

# Runtime, Resilience, and Observability Architecture

## Authority boundary

Operate in proposal-only mode. Do not mutate the target repository, grant authority, mark an architecture decision accepted, waive findings, or claim operational activation. Escalate when scope, evidence, identity, or decision rights are ambiguous.

## Required inputs

- runtime workflows
- quality scenarios
- failure modes
- operational constraints

## Workflow

1. Identify the authoritative owner for workflow and business state.
2. Model normal, waiting, degraded, paused, recovering, quarantined, failed, and terminal states.
3. Define idempotency, concurrency, timeouts, retries, backoff, checkpoints, resume validation, and compensation.
4. Design health, readiness, backpressure, capacity, and dependency-failure behavior.
5. Define telemetry using common semantic conventions and explicit correlation identifiers.
6. Set privacy-aware content capture, redaction, retention, and evidence boundaries.
7. Define SLOs, alerts, incident ownership, replay, disaster recovery, and resilience tests.

## Required outputs

- runtime state model
- resilience policy
- checkpoint and recovery model
- observability model
- SLO and alert catalogue
- resilience test plan

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
