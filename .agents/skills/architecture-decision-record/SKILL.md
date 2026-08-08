---
name: architecture-decision-record
description: Creates or updates an Architecture Decision Record and can select a bounded architecture decision candidate when current, non-self-issued A2 authority evidence is independently verifiable. Use for significant design choices requiring options, consequences, exact target binding, and traceable disposition; every output remains candidate and not effective.
---

# Architecture Decision Record

## Authority modes

Resolve one mode before selecting an option:

- **Advisory:** Use when no decision is requested and authority evidence is absent. Produce a recommendation with `ADVISORY_ONLY`.
- **Decision-candidate:** Use only when direct, externally issued evidence identifies the decision owner, actor, project, decision type, scope, exact target/baseline, validity window, revocation state, and permission to select a candidate. Produce `DECISION_CANDIDATE` with `NOT_EFFECTIVE`.
- **Deny:** Use when a decision is requested but authority is stale, ambiguous, self-issued, unverifiable, consumed, revoked, out of scope, or above A2. Produce `DENY_AUTHORITY_UNVERIFIED`.

An explicit instruction from an owner counts only when repository policy recognizes that owner and decision channel. Never infer authority from repository access, a runtime name, authentication alone, prior decisions, or the skill invocation itself.

Every artifact produced by this skill remains `CANDIDATE / NOT_EFFECTIVE`, including `DECISION_CANDIDATE`. This skill may not accept risk or evidence, change authority or separation of duties, approve its own output, release, deploy, or activate a system.

Repository mutation requires separate implementation authority. A decision does not grant mutation authority by itself.

## Required inputs

- decision statement and exact affected target
- architecture baseline
- options and trade-offs
- evidence and known limitations
- decision-owner identity and immutable authority-evidence references
- requested disposition; effectiveness is fixed to `NOT_EFFECTIVE`

## Workflow

1. Assign or confirm an immutable decision ID and exact target/baseline.
2. Verify authority evidence independently of the proposed decision.
3. Resolve `ADVISORY`, `DECISION_CANDIDATE`, or `DENY`; fail closed on ambiguity.
4. State context, scope, drivers, options, consequences, risks, and reversibility.
5. Select an option only in `DECISION_CANDIDATE` mode; otherwise recommend or deny deterministically.
6. Keep control disposition separate from the selected option: `disposition` must be one canonical disposition token; put the chosen option only in the schema field `decision`. Never emit `selected_option`.
7. Record a reason code, authority reference, evidence references, limitations, effective window, review triggers, and supersession rules.
8. Unconditionally route higher-risk, authority-affecting, evidence-acceptance, release, memory/knowledge/skill promotion, and activation decisions to the responsible human role.

## Canonical serialization contract

Before returning a structured ADR, normalize and validate the complete artifact
against `../../schemas/architecture-decision-record.schema.json`. Emit the
following control tokens byte-for-byte; do not translate, lowercase, title-case,
hyphenate, or paraphrase them:

- `ADVISORY` with `ADVISORY_ONLY`;
- `DECISION_CANDIDATE` with `DECISION_CANDIDATE`; or
- `DENY` with `DENY_AUTHORITY_UNVERIFIED`.

Always emit `effective_status` as `NOT_EFFECTIVE`. If the runtime cannot
validate the complete artifact or preserve these exact tokens, fail closed with
`DENY` and `DENY_AUTHORITY_UNVERIFIED`; do not emit a decision candidate.

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

Confirm that the target and authority evidence remain current, the disposition stays within A2 and the granted scope, the artifact is explicitly not effective, required evidence is traceable, no reserved gate was crossed, limitations are visible, and the next responsible role is named.

## Supporting files

- Read `references/workflow.md` for authority-resolution and decision checks.
- Use `assets/output-template.md` for the disposition-bearing ADR.
- Use `evals/cases.yaml` to evaluate advisory, delegated, and adversarial behavior.
