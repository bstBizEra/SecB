# Detailed Workflow — Current-State Architecture Discovery

## Preconditions

- Confirm: authorized read-only target.
- Confirm: repository or system inventory.
- Confirm: existing documentation.
- Confirm: inspection scope and exclusions.

## Detailed checks

- Confirm the inspection boundary and prohibited actions.
- Inventory repositories, deployables, services, data stores, integrations, environments, and ownership records.
- Trace representative runtime and data flows from authoritative sources.
- Compare implementation evidence with documentation and decisions.
- Classify each finding as observed fact, documented claim, inference, gap, contradiction, or out-of-scope.
- Identify drift, obsolete assumptions, undocumented dependencies, and evidence gaps.
- Produce the current-state model without proposing mutation as completed work.

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
