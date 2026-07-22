# Detailed Workflow — AI and Multi-Agent System Architecture

## Preconditions

- Confirm: business outcomes.
- Confirm: agent use cases.
- Confirm: risk classification.
- Confirm: model and tool constraints.
- Confirm: governance requirements.

## Detailed checks

- Define where AI adds value and where deterministic or human processes remain authoritative.
- Separate provider, runtime, deployment, profile, instance, role, session, and authority identities.
- Define minimum-sufficient agent team topology and separation of duties by risk.
- Design model routing, context receipts, memory boundaries, skill discovery, tool access, MCP and A2A controls.
- Define durable workflow ownership, checkpoints, intervention, recovery, and terminal disposition.
- Define evaluation, evidence, human decision rights, outcome observation, and learning admission.
- Threat-model autonomy, propagation, poisoning, unsupported claims, cost, privacy, and operational failure.

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
