# Detailed Workflow — Architecture Fitness Functions

## Preconditions

- Confirm: ADRs.
- Confirm: quality scenarios.
- Confirm: architecture constraints.
- Confirm: repository and runtime observability surfaces.

## Detailed checks

- Select architecture rules that can be tested deterministically or measured continuously.
- Define the protected property, scope, authoritative inputs, expected result, tolerance, and owner.
- Choose static, build-time, integration, runtime, security, data, dependency, or operational checks.
- Design positive, negative, boundary, and adversarial cases.
- Define failure severity, evidence capture, waiver authority, expiry, and escalation.
- Integrate checks into appropriate CI, runtime, conformance, or governance gates.
- Review fitness functions when decisions, architecture, dependencies, or risk change.

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
