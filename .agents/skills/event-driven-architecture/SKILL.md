---
name: event-driven-architecture
description: Designs domain and operational events, commands, streams, consumers, ordering, idempotency, replay, schema evolution, dead-letter handling, and event evidence. Use when asynchronous coordination or append-only history is required.
---

# Event-Driven Architecture

## Authority boundary

Operate in proposal-only mode. Do not mutate the target repository, grant authority, mark an architecture decision accepted, waive findings, or claim operational activation. Escalate when scope, evidence, identity, or decision rights are ambiguous.

## Required inputs

- workflows
- state machines
- data ownership
- reliability scenarios

## Workflow

1. Distinguish commands, domain events, integration events, observations, and evidence records.
2. Define event ownership, producer authority, consumer responsibilities, and correlation identifiers.
3. Specify schema, versioning, compatibility, ordering, partitioning, deduplication, and idempotency.
4. Define delivery semantics without claiming exactly-once behavior unless proven end to end.
5. Model replay, backfill, poison messages, dead letters, consumer lag, and recovery.
6. Separate event history from workflow authority and materialized projections.
7. Define observability, retention, privacy, sealing, and conformance tests.

## Required outputs

- event catalogue
- event envelope
- producer-consumer map
- delivery and replay policy
- schema evolution policy
- failure and recovery plan

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
