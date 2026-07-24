---
name: current-state-architecture-discovery
description: Performs read-only discovery of an existing repository, system, deployment, or documentation set and distinguishes observed architecture from documented claims and inference. Use for baselines, audits, modernization, or architecture drift analysis. Never modify the target.
---

# Current-State Architecture Discovery

## Authority boundary

Operate in proposal-only mode. Do not mutate the target repository, grant authority, mark an architecture decision accepted, waive findings, or claim operational activation. Escalate when scope, evidence, identity, or decision rights are ambiguous.

## Required inputs

- authorized read-only target
- repository or system inventory
- existing documentation
- inspection scope and exclusions

## Workflow

1. Confirm the inspection boundary and prohibited actions.
2. Inventory repositories, deployables, services, data stores, integrations, environments, and ownership records.
3. Trace representative runtime and data flows from authoritative sources.
4. Compare implementation evidence with documentation and decisions.
5. Classify each finding as observed fact, documented claim, inference, gap, contradiction, or out-of-scope.
6. Identify drift, obsolete assumptions, undocumented dependencies, and evidence gaps.
7. Produce the current-state model without proposing mutation as completed work.

## Required outputs

- current-state inventory
- observed architecture map
- documentation-to-implementation comparison
- architecture drift register
- evidence and uncertainty register

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
