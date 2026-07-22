# P0-20 — Operator Activation Disposition 002 (CONTROLLED ACTIVATION)

**Artifact ID:** P0-20-OPERATOR-ACTIVATION-DISPOSITION-002
**Status:** OPERATOR_VERDICT_TRANSCRIBED_PENDING_RATIFICATION
**Supersedes:** `p0-20-operator-hold-disposition-001.md` (the HOLD, PR #78) — by reference, extend-only
**Transcribed by:** claude-coordinator-p020-transcribe-01 (agent; transcription only — HOLD-disposition precedent)
**Transcribed at:** 2026-07-22
**Base at transcription:** main @ `e8eb4ec5231dea29ee24a255de5fd6035bc78f91`

---

## 1. Provenance

Exactly as the HOLD was recorded (PR #78): this disposition **transcribes an
explicit operator decision stated in the operator channel on 2026-07-22** —
selection verbatim: **"ACTIVATE (controlled)"** — rendered in response to a
neutral prompt presenting SUSTAIN HOLD / ACTIVATE (controlled) /
ACTIVATE_CONDITIONAL. The transcribing agent originated no value and
recommended no option.

The original sealed decision record in `p0-20-governance-decision-packet-001.md`
§6 is **not edited by this disposition** (its header forbids agent fill without
exception); this disposition is the authoritative operator-verdict record in the
same way disposition-001 authoritatively recorded the HOLD.

## 2. THE P0-20 DISPOSITION — transcription of the operator's selection

```yaml
p0_20_operator_disposition:
  disposition: ACTIVATE_CONTROLLED
  supersedes: HOLD (disposition-001, PR #78)
  decided_by: BizEra (operator / SEC-GOV)
  decided_via: explicit selection + transcription order in the operator channel
  decided_at: 2026-07-22
  effective: RATIFICATION_MERGE_TIMESTAMP
  transcribed_not_agent_originated: true
```

## 3. What CONTROLLED activation means (and does not mean)

**Means:**
- The P0-20 HOLD is lifted on ratification. The platform's activation pathway is
  OPEN under operator control.
- The Phase-B wiring wave becomes **orderable** — each primitive's wiring remains
  its own explicit operator R3 dispatch (nothing wires automatically):
  MEM provider adoption → MEM envelope → SKILL component-3 (obligation N1 binds)
  → INTEG enforcement → A2A follow-ups, with the N4 input-contract redesign
  required before any MOD-LIVE wiring.
- The P0-18 blocked positive halves become un-skippable as their surfaces wire.

**Does not mean:**
- No primitive is wired by this record. Zero importers remain zero importers
  until each explicit wiring order.
- No production declaration. No remote/deploy/publish authority (AGENTS.md
  working rule 5 unchanged).
- ADR-0015 R5, V-020, and the sealed-slot pattern remain in force — activation
  does not alter the authority model.

## 4. Effect on ratification

> **The operator's ratification of this record on main (merge of its staging PR,
> ordered explicitly by the operator) lifts the P0-20 HOLD and renders the
> CONTROLLED ACTIVATION disposition effective — closing the final open item of
> Phase 0. Phase 0 of SecB is complete.**

## 5. Self-certification

```yaml
self_certification:
  agent_id: claude-coordinator-p020-transcribe-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
