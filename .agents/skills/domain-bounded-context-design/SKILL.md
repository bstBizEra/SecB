---
name: domain-bounded-context-design
description: Models domains, subdomains, bounded contexts, ownership, context relationships, and integration contracts. Use when business concepts or service boundaries are ambiguous. Do not split services solely by database tables or team names.
---

# Domain and Bounded Context Design

## Authority boundary

Operate in proposal-only mode. Do not mutate the target repository, grant authority, mark an architecture decision accepted, waive findings, or claim operational activation. Escalate when scope, evidence, identity, or decision rights are ambiguous.

## Required inputs

- business capabilities
- domain terminology
- workflows
- ownership model

## Workflow

1. Identify core, supporting, and generic domain capabilities.
2. Build a glossary and expose overloaded or conflicting terms.
3. Group cohesive models, invariants, rules, and lifecycle ownership into bounded contexts.
4. Define context relationships, upstream/downstream responsibilities, and translation boundaries.
5. Test boundaries against business change, transactional consistency, data ownership, team ownership, and operational failure.
6. Identify modular-monolith, service, or process boundaries without assuming microservices.
7. Produce candidate boundaries and unresolved domain questions.

## Required outputs

- domain map
- bounded-context catalogue
- context relationship map
- ubiquitous language glossary
- boundary decision candidates

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
