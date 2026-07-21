# P0-20 Governance Disposition — HOLD (operator-directed)

**Record ID:** SECB-P0-20-DISPOSITION-HOLD-001
**Status:** OPERATOR DISPOSITION (transcribed) / activation remains GATED
**Date:** 2026-07-21
**Disposes:** `p0-20-governance-decision-packet-001.md` (PR #77, main @ 0a2e118)

## Disposition

The human operator directed, in-session, a **HOLD** on the P0-20 governance verdict
and instructed that **activation remain gated**.

- **Verdict direction:** HOLD (no `PASS_FOR_P0_CONTROLLED_ACTIVATION`; no activation).
- **Effect:** the gate stays closed. No effectiveness change, no wiring adoption, no
  activation is authorized. SecB remains a control library with no service process.
- **Alignment:** consistent with the decision packet's own worker recommendation
  (advise against activation on the current state).

## Authority note (why this is a transcription, not a sealed verdict)

This record TRANSCRIBES the operator's instruction; it is prepared by a worker agent
as scribe. It does **not** fill the sealed human-GOV decision record in
`p0-20-governance-decision-packet-001.md` §6, which remains `verdict: null` /
`decided_by: null` / `status: PENDING_HUMAN_GOV` by design — an agent filling that
record is a governance violation (the ratified V-020 invariant; the self-pilot
`GOV_DECISION_SLOT`). If a formal, cryptographically-attributed human-GOV verdict
record is wanted, that is the operator's own signed act (cf. the MOD-REG signed
disposition, commit `251025a`).

## What HOLD leaves open (unchanged — all operator/SEC-GOV)

- The formal P0-20 verdict record (operator's own act, if desired).
- Activation, and any wiring/adoption of the unwired primitives.
- The 9 SECB-GOV-001 readiness gaps; a STABLE/demotion/rollback policy.
- The N4 input-gate (reject exotic/Proxy envelopes) before any event-family wiring.
- The P0-18 blocked positive halves (V-020 human-decision; V-011/V-016 adoption).

## Advisory fields

- `truth_status`: verified_true (transcribes an explicit operator instruction)
- `authority_status`: execution_requires_operator (formal sealed verdict is the operator's act)
- `implementation_status`: n/a (disposition record)
- `risk_class`: low (HOLD is the gated/safe direction; no activation)

```yaml
self_certification:
  agent_id: claude-motor-p0-20-hold-scribe
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
