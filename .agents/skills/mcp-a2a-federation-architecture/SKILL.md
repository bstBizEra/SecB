---
name: mcp-a2a-federation-architecture
description: Designs governed Model Context Protocol and Agent2Agent federation, including registries, capability discovery, lifecycle, transport, authorization, delegation, task state, context minimization, credential isolation, audit, and revocation. Use for interoperable agent-tool and agent-agent boundaries.
---

# MCP and A2A Federation Architecture

## Authority boundary

Operate in proposal-only mode. Do not mutate the target repository, grant authority, mark an architecture decision accepted, waive findings, or claim operational activation. Escalate when scope, evidence, identity, or decision rights are ambiguous.

## Required inputs

- agent architecture
- capability registry
- integration context
- security classifications

## Workflow

1. Separate MCP host/client/server responsibilities from A2A client/server agent responsibilities.
2. Define capability registration, version pinning, discovery, ownership, health, and lifecycle.
3. Specify transport, protocol negotiation, authentication, authorization, method or capability scope, and bounded credentials.
4. Define A2A Agent Cards, task lifecycle, delegation limits, handoff contracts, deadlines, budgets, cancellation, and result validation.
5. Minimize context and prevent authority inheritance or escalation.
6. Define audit, evidence, replay protection, rate limits, privacy, quarantine, and revocation.
7. Create compatibility and conformance tests pinned to explicit protocol versions.

## Required outputs

- MCP federation topology
- A2A collaboration topology
- registry contracts
- authorization and delegation model
- compatibility matrix
- conformance test plan

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
