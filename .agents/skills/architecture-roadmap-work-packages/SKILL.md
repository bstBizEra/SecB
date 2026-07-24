---
name: architecture-roadmap-work-packages
description: Translates approved or candidate architecture into sequenced, dependency-aware implementation work packages with roles, acceptance criteria, evidence, risks, and exit gates. Use for planning only; it does not authorize repository mutation, deployment, or activation.
---

# Architecture Roadmap and Work-Package Compilation

## Authority boundary

Operate in proposal-only mode. Do not mutate the target repository, grant authority, mark an architecture decision accepted, waive findings, or claim operational activation. Escalate when scope, evidence, identity, or decision rights are ambiguous.

## Required inputs

- architecture baseline
- decision records
- risk register
- delivery constraints
- governance gates

## Workflow

1. Define target outcomes and the architecture baseline each work package assumes.
2. Decompose work by cohesive capability, contract, dependency, and verification boundary.
3. Identify critical path, parallel lanes, integration points, migration steps, and rollback needs.
4. Assign producer, reviewer, QA, security, operations, domain, and governance responsibilities by risk.
5. Define deliverables, explicit exclusions, declared write sets when applicable, and acceptance criteria.
6. Define verification methods, evidence requirements, entry conditions, exit gates, and blocked dependencies.
7. Produce roadmap waves and work-package candidates without implying authorization.

## Required outputs

- architecture roadmap
- dependency graph
- work-package catalogue
- role and SoD matrix
- verification and evidence matrix
- exit-gate register

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
