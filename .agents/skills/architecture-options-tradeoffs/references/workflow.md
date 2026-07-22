# Detailed Workflow — Architecture Options and Trade-Off Analysis

## Preconditions

- Confirm: architecture brief.
- Confirm: quality attribute scenarios.
- Confirm: constraints.
- Confirm: current-state findings.

## Detailed checks

- Define the decision statement and non-negotiable constraints.
- Generate at least two genuinely viable options, including a minimal-change option where applicable.
- Evaluate each option against weighted criteria and quality scenarios.
- Assess security, privacy, resilience, operability, migration, lock-in, cost, skills, and reversibility.
- Expose assumptions and sensitivity to uncertain inputs.
- Recommend an option with confidence and conditions.
- Record rejected options fairly and identify decision review triggers.

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
