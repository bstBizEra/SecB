---
name: security-threat-modeling
description: Performs system and agentic threat modeling across identities, trust boundaries, tools, MCP, A2A, memory, skills, evidence, runtimes, credentials, and human approvals. Use during architecture design and review. Produces mitigations and verification requirements, not security approval.
---

# Security and Agentic Threat Modeling

## Authority boundary

Operate in proposal-only mode. Do not mutate the target repository, grant authority, mark an architecture decision accepted, waive findings, or claim operational activation. Escalate when scope, evidence, identity, or decision rights are ambiguous.

## Required inputs

- system context
- trust boundaries
- data flows
- asset and identity inventory
- risk tolerance

## Workflow

1. Identify assets, safety or business impacts, adversaries, entry points, and trust boundaries.
2. Enumerate threats across spoofing, tampering, repudiation, disclosure, denial, privilege escalation, and agentic-specific failure modes.
3. Cover prompt injection, memory poisoning, skill supply chain, tool abuse, delegation escalation, agent impersonation, false evidence, approval replay, and reviewer collusion.
4. Assess likelihood, impact, detectability, blast radius, and reversibility.
5. Design preventive, detective, responsive, and recovery controls.
6. Trace controls to owners, policies, tests, telemetry, evidence, and incident procedures.
7. Record accepted residual risk only when an authorized human decision exists.

## Required outputs

- threat model
- abuse-case catalogue
- risk register
- control architecture
- security verification matrix
- residual-risk candidates

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
