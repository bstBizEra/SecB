---
name: deployment-environment-architecture
description: Designs environments, deployment units, network zones, identities, configuration, secrets, promotion paths, release controls, scaling, backup, disaster recovery, and operational ownership. Use for target deployment topology and environment governance.
---

# Deployment and Environment Architecture

## Authority boundary

Operate in proposal-only mode. Do not mutate the target repository, grant authority, mark an architecture decision accepted, waive findings, or claim operational activation. Escalate when scope, evidence, identity, or decision rights are ambiguous.

## Required inputs

- container or component architecture
- environment requirements
- security zones
- availability and recovery objectives

## Workflow

1. Define environments and their purpose, data class, authority, and promotion relationship.
2. Map deployable units to compute, storage, network, identity, and external dependencies.
3. Define workload identity, configuration, secret references, credential leases, and administrative access.
4. Specify network zones, ingress, egress, service discovery, certificates, and trust boundaries.
5. Define deployment, rollback, progressive delivery, scaling, health, maintenance, backup, and recovery.
6. Assign operational ownership, on-call, incident, and change-window responsibilities.
7. Create deployment evidence, environment conformance, and recovery-test requirements.

## Required outputs

- deployment view
- environment catalogue
- network and identity model
- promotion and rollback model
- backup and recovery architecture
- operational ownership matrix

## Evidence and reasoning discipline

- Separate verified facts, reported facts, assumptions, hypotheses, inferences, recommendations, decisions, and policy.
- Cite external claims that may change or are not common knowledge.
- Use direct evidence where available; never substitute a producer summary for verification.
- Record uncertainty, limitations, contradictions, and unresolved questions.
- Preserve project, work, role, baseline, and source identities in the output.

## Completion gate

Before completion, verify that every required output exists, scope and authority remain bounded, claims are traceable, limitations are visible, and the next responsible role is identified.

## Supporting files

- Read `references/workflow.md` for detailed checks and anti-patterns.
- Use `assets/output-template.md` for the deliverable structure.
- Use `evals/cases.yaml` when evaluating trigger and output behavior.
