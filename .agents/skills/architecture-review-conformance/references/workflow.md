# Detailed Workflow — Independent Architecture Review and Conformance

## Preconditions

- Confirm: architecture baseline.
- Confirm: requirements and quality scenarios.
- Confirm: implementation or candidate artifacts.
- Confirm: evidence package.

## Detailed checks

- Confirm reviewer independence, review scope, baseline, and applicable decisions.
- Build a traceability matrix from requirements and quality scenarios to architecture and evidence.
- Check boundaries, ownership, data, integrations, state, failure modes, security, privacy, operations, and cost assumptions.
- Inspect direct evidence rather than relying on producer summaries.
- Identify contradictions, omissions, unverified claims, drift, and residual risks.
- Classify findings by severity, confidence, evidence, owner, and required disposition.
- Issue a review verdict only within assigned authority and keep governance approval separate.

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
