# Detailed Workflow — Quality Attribute Scenario Engineering

## Preconditions

- Confirm: architecture brief.
- Confirm: stakeholder concerns.
- Confirm: risk classification.
- Confirm: known service objectives.

## Detailed checks

- Select quality characteristics relevant to the system and project profile.
- For each scenario define source, stimulus, environment, affected artifact, response, and measurable response.
- Distinguish steady-state, peak, degraded, recovery, attack, and change scenarios.
- Define measurement method, evidence source, threshold, owner, and review window.
- Identify conflicts between scenarios and make trade-offs explicit.
- Trace scenarios to architecture decisions, tests, monitoring, and exit gates.
- Reject adjectives such as fast, scalable, secure, or resilient unless measurable.

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
