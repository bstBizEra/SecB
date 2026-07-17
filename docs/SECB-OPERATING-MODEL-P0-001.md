# SecB Phase 0 Implementation Control

**Document ID:** SECB-OPERATING-MODEL-P0-001
**Version:** 0.3.0-alpha.0
**Status:** LOCAL BOOTSTRAP CANDIDATE

## Objective

Establish the minimum operating constitution and executable contract baseline before feature development.

## Authorized local bootstrap scope

- operating model and system-of-record boundaries;
- project, Work Package, Context Receipt, Handoff, and Evidence schemas;
- deterministic repository validation;
- local Git history and evidence-producing checks.

External remote configuration, publication, deployment, production activation, autonomous memory, and skill publication are outside this bootstrap slice.

## Phase 0 deliverables

| ID | Deliverable | Proof |
|---|---|---|
| P0-01 | Operating constitution | Required sections and source digest validate |
| P0-02 | Canonical identity and version rules | Executable contract validation rejects missing identity/version and unknown fields |
| P0-03 | Universal lifecycle and state rules | Transition engine rejects undefined transitions, unknown states, denied policy, ineffective authority, missing evidence, and conflicting replays |
| P0-04 | Risk, roles, and separation of duties | R0–R4 topology and independence rules exist |
| P0-05 | Context and handoff contracts | JSON Schemas parse and require bounded fields |
| P0-06 | Evidence contract | Evidence identity, provenance, hash, result, and status required |
| P0-07 | Seven-ledger and source-of-truth boundaries | Canonical responsibilities are uniquely assigned |
| P0-08 | Bootstrap verification | `npm test` passes from a clean local checkout |

## Current implementation evidence

- Contract schemas are compiled with JSON Schema Draft 2020-12 validation.
- Five canonical valid fixtures and five targeted invalid fixtures exercise identity, scope, hash, status, and closed-object boundaries.
- Project, Work Package, Session, and Evidence transitions use explicit allowlists.
- Authority resolution defaults to deny and must return a server-side decision identifier.
- Identical idempotent requests replay the prior disposition; conflicting key reuse fails closed.
- The control logic remains an in-process library. The local ledger proves restart durability and single-host writer exclusion; distributed storage and concurrency are not yet implemented.

### Authority and ledger increment

- Authority grants are resolved from server-held configuration, scoped to actor, project, Work Package, role, transition, status, and validity window.
- Conflicting producer/reviewer, reviewer/QA, QA/GOV, skill producer/publisher, and evidence producer/acceptor roles fail configuration.
- Event and Evidence ledgers persist append-only NDJSON records with canonical SHA-256 entry hashes and record hash chaining.
- Atomic writer locks and optimistic expected-sequence checks fail closed on concurrent or stale writes.
- Idempotent replay returns the original record; conflicting replay, duplicate identity, corruption, and tampering are denied.
- The local ledger is a Phase 0 durability proof. PostgreSQL and a production event store remain future system-of-record implementations.

## Canonical bootstrap states

```text
Project: DRAFT → REVIEW → APPROVED_NOT_EFFECTIVE → ACTIVE → SUSPENDED → CLOSED / REVOKED
WorkPackage: DRAFT → PLANNED → REVIEWED → AUTHORIZED → READY → RUNNING
             → SELF_VERIFIED → REVIEW → QA → GOV_DECISION
             → ACCEPTED / REWORK / BLOCKED / QUARANTINED / CANCELLED
Session: CREATED → CONTEXT_BINDING → READY → RUNNING → REVIEW_HANDOFF → COMPLETED
Evidence: CAPTURED → SEALED → VERIFICATION_PENDING → VERIFIED
          → ACCEPTED / REJECTED / SUPERSEDED / QUARANTINED
```

## Exit gate

Phase 0 is not complete until one read-only Work Package can be traced from intent through outcome using canonical identities, current state, Context Receipt, handoff, evidence, independent review, QA, and human disposition. Missing, assumed, waived, or untested gates block activation.

## Required next review

An independent reviewer must examine the source assessment, contract schemas, validator, and repository diff directly. Producer verification is evidence, not final acceptance.
