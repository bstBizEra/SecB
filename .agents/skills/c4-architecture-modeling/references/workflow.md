# Detailed Workflow — C4 Architecture Modeling

## Preconditions

- Confirm: system context.
- Confirm: current or target architecture.
- Confirm: audience.
- Confirm: view purpose.

## Detailed checks

- Choose the audience and question each diagram must answer.
- Use the minimum useful C4 level; default to context and container views.
- Give every element a type, name, responsibility, technology when relevant, and owner.
- Label relationships with direction, purpose, protocol, and relevant data classification.
- Show boundaries, external dependencies, and deployment nodes where relevant.
- Create separate dynamic or deployment views when one static diagram would overload the story.
- Validate consistency across views and add a legend and source references.

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
