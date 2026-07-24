# Detailed Workflow — Event-Driven Architecture

## Preconditions

- Confirm: workflows.
- Confirm: state machines.
- Confirm: data ownership.
- Confirm: reliability scenarios.

## Detailed checks

- Distinguish commands, domain events, integration events, observations, and evidence records.
- Define event ownership, producer authority, consumer responsibilities, and correlation identifiers.
- Specify schema, versioning, compatibility, ordering, partitioning, deduplication, and idempotency.
- Define delivery semantics without claiming exactly-once behavior unless proven end to end.
- Model replay, backfill, poison messages, dead letters, consumer lag, and recovery.
- Separate event history from workflow authority and materialized projections.
- Define observability, retention, privacy, sealing, and conformance tests.

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
