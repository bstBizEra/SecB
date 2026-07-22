# Detailed Workflow — Domain and Bounded Context Design

## Preconditions

- Confirm: business capabilities.
- Confirm: domain terminology.
- Confirm: workflows.
- Confirm: ownership model.

## Detailed checks

- Identify core, supporting, and generic domain capabilities.
- Build a glossary and expose overloaded or conflicting terms.
- Group cohesive models, invariants, rules, and lifecycle ownership into bounded contexts.
- Define context relationships, upstream/downstream responsibilities, and translation boundaries.
- Test boundaries against business change, transactional consistency, data ownership, team ownership, and operational failure.
- Identify modular-monolith, service, or process boundaries without assuming microservices.
- Produce candidate boundaries and unresolved domain questions.

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
