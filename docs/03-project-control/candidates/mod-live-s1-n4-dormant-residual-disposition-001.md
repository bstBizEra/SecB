# MOD-LIVE S1 — N4 Dormant Residual Disposition (operator-directed)

**Record ID:** SECB-MOD-LIVE-N4-DISPOSITION-001
**Status:** OPERATOR DISPOSITION — N4 ACCEPTED AS DORMANT RESIDUAL (tracked)
**Date:** 2026-07-21
**Subject:** `src/live/event-family-policy.mjs` `assessEnvelopeConformance` (main @ a49843f)

## The finding (N4)

`assessEnvelopeConformance` reads each doctrine field's value via a per-field
`getOwnPropertyDescriptor`. On a hostile **Proxy** envelope, a `getOwnPropertyDescriptor`
trap can forge or mutate a **sibling** field's captured value with no deny — a cross-field
TOCTOU. Independently reproduced (cross-review of PR #65).

## Why it is not mechanically closeable (proven)

The N1 -> N2 -> N3 -> N4 chain is a documented merry-go-round:
- N2 (Proxy descriptor-trap cross-field) was closed by the atomic-snapshot hardening
  (PR #44) using a single `Reflect.ownKeys` presence snapshot.
- N3 (value single-read) required per-field value capture; the fix (PR #65) re-introduced
  a per-field `getOwnPropertyDescriptor`, reopening N2 as **N4**.
- The N4-closure attempt (`claude-motor-live-s1-n4-close-01`) **proved** the two
  requirements are mutually exclusive for a fully hostile input: closing N4 (zero
  descriptor calls) reopens N3's cross-field vector; the swap FAILS the N3 regression
  suite (PoC A/B/D). No ordering/two-pass/batching closes cross-field mutation of a
  data-property victim in JS's object model.

## Disposition — ACCEPTED AS DORMANT RESIDUAL

Per operator direction, N4 is **accepted as a tracked dormant residual**:

- **Blast radius today: ZERO.** The module is PURE + UNWIRED — no live/production path
  imports `assessEnvelopeConformance`; the vector is unreachable in the current system.
- **Risk class:** MEDIUM-if-wired / LOW-dormant.
- This is the governance-blessed interim posture already recorded by the PR #65
  cross-review gate ("close or re-disclose before wiring to a Proxy-capable consumer").

## HARD CONDITION — must close before wiring (unchanged, operator/SEC-GOV)

N4 **must** be closed or explicitly re-risk-accepted **before** `assessEnvelopeConformance`
is wired to any Proxy-capable consumer. The only true fix (the reviewers' endorsed path)
is to **redesign the input contract to reject exotic/accessor/Proxy envelopes outright**
(accept only plain-object, non-accessor inputs at the boundary) — an R3+ design +
governance change requiring a written spec and SEC/GOV approval. It is NOT a mechanical
read-swap and is OUT OF SCOPE of this disposition. Wiring event-family conformance into
any consumer remains gated behind this condition.

## Advisory fields

- `truth_status`: verified_true (impossibility proven empirically + formally)
- `authority_status`: execution_requires_operator (the input-contract redesign is gated)
- `implementation_status`: blocked (no in-place mechanical fix exists)
- `risk_class`: medium (if wired) / low (dormant)

```yaml
self_certification:
  agent_id: claude-motor-n4-disposition-scribe
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
