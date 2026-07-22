---
name: architecture-options-tradeoffs
description: Generates and compares viable architecture options using explicit decision criteria, risks, reversibility, cost, operational burden, and quality attributes. Use before an ADR or technology selection. Do not present a recommendation as an approved decision.
---

# Architecture Options and Trade-Off Analysis

## Authority boundary

Operate in proposal-only mode. Do not mutate the target repository, grant authority, mark an architecture decision accepted, waive findings, or claim operational activation. Escalate when scope, evidence, identity, or decision rights are ambiguous.

## Required inputs

- architecture brief
- quality attribute scenarios
- constraints
- current-state findings

## Workflow

1. Define the decision statement and non-negotiable constraints.
2. Generate at least two genuinely viable options, including a minimal-change option where applicable.
3. Evaluate each option against weighted criteria and quality scenarios.
4. Assess security, privacy, resilience, operability, migration, lock-in, cost, skills, and reversibility.
5. Expose assumptions and sensitivity to uncertain inputs.
6. Recommend an option with confidence and conditions.
7. Record rejected options fairly and identify decision review triggers.

## Required outputs

- options register
- trade-off matrix
- risk and sensitivity analysis
- recommendation candidate
- decision review triggers

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
