# ADR-0009 — Scoped Non-Human Integration Principal

**Document ID:** SECB-ADR-0009

**Version:** 0.1.0-draft

**Status:** PROPOSED / NOT EFFECTIVE

**Decision owner:** Human GOV

**Last updated:** 2026-08-05

## Context

The effective root rule prohibits every agent merge to `main`. Human GOV asked
whether a non-human operator could perform a precisely authorized integration
without turning SecB into a self-authorizing super-agent. Canonical A3 permits
candidate preparation but not protected merge. Security review of AMD-003
revision 1 showed that a bearer-like unsigned grant could be fabricated and
replayed, target movement was not compare-and-swapped, and receipts lacked an
integrity and recovery contract.

## Options

1. Retain human-only integration indefinitely. This is simplest and strongest,
   but keeps a manual bottleneck.
2. Permit a server-derived A4 integration principal only through a signed,
   single-use, exact-object external enforcement and receipt contract, while
   retaining human per-operation approval and every A5 gate.
3. Allow any authenticated agent with repository credentials to merge after
   tests pass. This conflates authentication, evidence and authority and is
   rejected.

## Proposed decision

Recommend option 2 as a candidate only, using
[`../00-governance/integration-principal-control-contract.md`](../00-governance/integration-principal-control-contract.md).
This ADR does not decide or activate the option. Human GOV must explicitly
accept, reject or require rework after independent REV, QA and SEC.

## Consequences

- A3 remains preparation-only; the narrow protected-integration action is A4.
- Human approval is still required for each operation, while the external
  enforcement path makes execution deterministic, scoped and auditable.
- Direct protected pushes, squash, rebase, replay, self-issued authority and
  self-verification remain denied.
- Policy adoption does not activate runtime authority. External PDP, trusted
  keys/revocation, atomic consumption/CAS, durable receipts and recovery must be
  separately implemented, reviewed and activated.
- Production activation, release, evidence/risk acceptance, policy exceptions
  and future changes to this authority basis remain human A5 decisions.

## Required decision process

Independent REV + QA + SEC must bind the exact amendment, this ADR, the
decision-rights change and the control contract. Human GOV then records the
decision here or in an immutable linked disposition. A human operator performs
the bootstrap merge under the prior rule. No agent may use this candidate to
authorize that merge.
