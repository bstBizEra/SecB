# ADR-0002: Scoped authority and local durable ledgers

**Status:** Accepted for local Phase 0 candidate
**Date:** 2026-07-17

## Context

Normative state diagrams and JSON Schemas do not enforce authority, separation of duties, durability, concurrency, replay, or tamper detection. Phase 0 requires executable negative cases before a read-only self-pilot can be trusted.

## Decision

SecB resolves transition authority from registered, time-bounded grants scoped to actor, project, Work Package, role, and exact transition. Unknown rules and conflicting roles fail closed.

For the local Phase 0 proof, Event and Evidence ledgers use append-only NDJSON files protected by atomic writer locks, optimistic sequence checks, canonical entry hashes, and record hash chaining. This storage is an adapter-level durability proof, not the final production system of record.

## Consequences

- Caller-declared roles or authority cannot create a grant.
- Expired, revoked, cross-project, cross-work-package, or self-review grants are denied.
- Repeated identical writes return the original record without duplicate effects.
- Stale writers, conflicting idempotency keys, duplicate IDs, corruption, and tampering fail closed.
- A crashed writer can leave a lock requiring governed recovery; automatic unsafe lock eviction is prohibited.
- Production adoption still requires PostgreSQL/event-store adapters, recovery procedures, independent review, QA, and human governance activation.
