# Detailed Workflow — System Context and Boundary Modeling

## Preconditions

- Confirm: architecture brief.
- Confirm: stakeholder map.
- Confirm: integration inventory.
- Confirm: data classification.

## Detailed checks

- Name the system of interest and the business capabilities it owns.
- Identify human actors, organizations, devices, agents, and external systems.
- Describe each relationship with direction, purpose, protocol class, data class, and ownership.
- Mark organizational, network, identity, project, data-residency, and trust boundaries.
- Assign authoritative systems of record and responsibility for each major information domain.
- Check for hidden dependencies, circular ownership, direct bypasses, and ambiguous boundaries.
- Produce context and boundary models with a legend and evidence references.

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
