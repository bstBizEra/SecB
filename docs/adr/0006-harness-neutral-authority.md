# ADR-0002 — Harness-Neutral Authority

## Status

Accepted for v0.1 design baseline.

## Decision

Codex, Claude Code, Antigravity and all future harnesses are registered execution products. SecB issues role, scope, context, budget, policy and evidence obligations per session. A harness may not infer authority from provider, model, user identity or local filesystem access.

## Consequences

- Work can move across harnesses without changing governance.
- Cross-harness review becomes possible.
- Adapter quality affects maximum approved risk class.
- Canonical contracts must remain independent of tool-specific instructions.
