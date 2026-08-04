---
name: architecture-decision-record
description: Creates or updates an Architecture Decision Record and can issue a bounded architecture disposition when current, non-self-issued decision authority is verified. Use for significant design choices that require options, consequences, target binding, and a traceable decision; fall back to advisory mode when authority is absent or incomplete.
---

# Architecture Decision Record

## Authority modes

Resolve one mode before selecting an option:

- **Advisory:** Use when decision authority is absent, stale, ambiguous, self-issued, out of scope, or above the skill's A2 ceiling. Produce a recommendation with `ADVISORY_ONLY` status.
- **Decision-capable:** Use only when direct evidence identifies the decision owner, actor, project, decision type, scope, exact target/baseline, validity window, and permitted status. Produce the bounded disposition the evidence authorizes.

An explicit instruction from an owner counts only when repository policy recognizes that owner and decision channel. Never infer authority from repository access, a runtime name, authentication alone, prior decisions, or the skill invocation itself.

This skill may record `DECIDED_NOT_EFFECTIVE`. It may record an effective A2 technical decision only when effectiveness is explicitly delegated and no higher gate applies. It may not accept risk or evidence, change authority or separation of duties, approve its own output, release, deploy, or activate a system.

Repository mutation requires separate implementation authority. A decision does not grant mutation authority by itself.

## Required inputs

- decision statement and exact affected target
- architecture baseline
- options and trade-offs
- evidence and known limitations
- decision-owner identity and authority evidence
- requested disposition and effectiveness status

## Workflow

1. Assign or confirm an immutable decision ID and exact target/baseline.
2. Verify authority evidence independently of the proposed decision.
3. Resolve `ADVISORY` or `DECISION_CAPABLE`; fail closed on ambiguity.
4. State context, scope, drivers, options, consequences, risks, and reversibility.
5. Select an option and issue only the status permitted by the resolved mode.
6. Record a reason code, authority reference, evidence references, limitations, effective window, review triggers, and supersession rules.
7. Route higher-risk, authority-affecting, evidence-acceptance, release, or activation decisions to the responsible human role.

## Required outputs

- versioned ADR
- decision mode and disposition
- exact target/baseline binding
- authority and evidence references
- affected-element list
- consequences, risks, rollback, review, and supersession triggers
- next-role action for every unresolved or separately gated transition

## Evidence discipline

Separate verified facts, reported facts, assumptions, inferences, recommendations, decisions, and policy. Use direct evidence where available. Never convert a producer summary into decision authority. Keep unknowns and contradictions visible.

## Completion gate

Confirm that the target and authority remain current, the disposition stays within A2 and the granted scope, required evidence is traceable, no reserved gate was crossed, limitations are visible, and the next responsible role is named.

## Supporting files

- Read `references/workflow.md` for authority-resolution and decision checks.
- Use `assets/output-template.md` for the disposition-bearing ADR.
- Use `evals/cases.yaml` to evaluate advisory, delegated, and adversarial behavior.
