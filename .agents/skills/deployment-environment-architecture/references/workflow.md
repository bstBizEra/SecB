# Detailed Workflow — Deployment and Environment Architecture

## Preconditions

- Confirm: container or component architecture.
- Confirm: environment requirements.
- Confirm: security zones.
- Confirm: availability and recovery objectives.

## Detailed checks

- Define environments and their purpose, data class, authority, and promotion relationship.
- Map deployable units to compute, storage, network, identity, and external dependencies.
- Define workload identity, configuration, secret references, credential leases, and administrative access.
- Specify network zones, ingress, egress, service discovery, certificates, and trust boundaries.
- Define deployment, rollback, progressive delivery, scaling, health, maintenance, backup, and recovery.
- Assign operational ownership, on-call, incident, and change-window responsibilities.
- Create deployment evidence, environment conformance, and recovery-test requirements.

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
