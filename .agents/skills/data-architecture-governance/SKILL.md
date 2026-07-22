---
name: data-architecture-governance
description: Designs authoritative data domains, entities, ownership, classification, lineage, lifecycle, retention, access, quality, and analytical projections. Use for operational, evidence, memory, knowledge, or analytics architecture. A vector index is never treated as the source of truth by default.
---

# Data Architecture and Governance

## Authority boundary

Operate in proposal-only mode. Do not mutate the target repository, grant authority, mark an architecture decision accepted, waive findings, or claim operational activation. Escalate when scope, evidence, identity, or decision rights are ambiguous.

## Required inputs

- domain model
- data requirements
- systems of record
- security and retention rules

## Workflow

1. Identify data domains, authoritative entities, owners, consumers, and legal or policy constraints.
2. Classify data sensitivity, integrity needs, residency, retention, and deletion rules.
3. Define identifiers, temporal semantics, provenance, versioning, and supersession.
4. Map data creation, validation, transformation, movement, storage, indexing, and disposal.
5. Separate authoritative stores from event stores, object stores, search indexes, vector indexes, caches, and analytical projections.
6. Define data quality rules, reconciliation, lineage, access decisions, and audit evidence.
7. Model failure, restore, migration, and cross-project leakage scenarios.

## Required outputs

- data-domain catalogue
- system-of-record matrix
- data flow and lineage model
- classification and retention policy
- quality and reconciliation rules

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
