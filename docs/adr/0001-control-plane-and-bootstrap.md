# ADR-0001: SecB is a control plane and bootstraps constitution first

**Status:** Accepted for local bootstrap
**Date:** 2026-07-17

## Context

The design assessment approves SecB's strategic direction while rating implementation readiness at 5.5/10. Building dashboard, graph, memory, or additional agents first would leave identity, authority, workflow, evidence, and outcome semantics ambiguous.

## Decision

SecB will be implemented as a governed agent work and learning control plane. Phase 0 establishes the operating constitution and canonical contracts before runtime features. The repository remains local-only until separately authorized for remote publication.

## Consequences

- Runtime products remain workers, never authority by name.
- Feature work depends on explicit identity, scope, state, evidence, and exit-gate contracts.
- Review, QA, evidence acceptance, publication, and activation remain distinct transitions.
- Bootstrap artifacts are reviewable candidates and cannot approve themselves.
