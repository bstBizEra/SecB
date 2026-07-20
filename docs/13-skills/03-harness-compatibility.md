# Skill and Harness Compatibility

## Compatibility levels

| Level | Meaning |
|---|---|
| C0 | Not evaluated |
| C1 | Instructions load successfully |
| C2 | Inputs/outputs conform |
| C3 | Tools and evidence conform |
| C4 | Pressure/adversarial tests pass |
| C5 | Outcome performance validated |

## Minimum matrix

Every published engineering skill records compatibility for Codex, Claude Code, Antigravity and Generic CLI. Unsupported harnesses must be explicit; SecB must not silently substitute an untested runtime for a high-risk skill.

## Portability principle

Canonical skill behavior lives in SecB contracts. Harness-specific adapters translate invocation, tool names, lifecycle hooks and evidence events without changing the skill's authority or acceptance criteria.
