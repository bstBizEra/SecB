# ADR-0001 — Failure Is a Learning Transition

## Status

Accepted for v0.1 design baseline.

## Context

A purely terminal fail-closed workflow protects systems but can create operational paralysis, repeated unresolved blockers and lost learning.

## Decision

Retain deny-by-default controls at the mutation boundary. Separate execution disposition from work disposition. Every material failed, blocked, denied, rejected or quarantined attempt must produce a Failure Evidence Envelope and route to research, correction, replan, escalation, authorized retry or retirement.

## Consequences

- Safety is preserved.
- Work does not silently die.
- Repeated failures become knowledge and skill candidates.
- More state and evidence contracts are required.
- Blind retries and informal bypasses remain prohibited.
