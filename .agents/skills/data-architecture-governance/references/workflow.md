# Detailed Workflow — Data Architecture and Governance

## Preconditions

- Confirm: domain model.
- Confirm: data requirements.
- Confirm: systems of record.
- Confirm: security and retention rules.

## Detailed checks

- Identify data domains, authoritative entities, owners, consumers, and legal or policy constraints.
- Classify data sensitivity, integrity needs, residency, retention, and deletion rules.
- Define identifiers, temporal semantics, provenance, versioning, and supersession.
- Map data creation, validation, transformation, movement, storage, indexing, and disposal.
- Separate authoritative stores from event stores, object stores, search indexes, vector indexes, caches, and analytical projections.
- Define data quality rules, reconciliation, lineage, access decisions, and audit evidence.
- Model failure, restore, migration, and cross-project leakage scenarios.

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
