# SECB-GOV-001 — W3c Contract-Signing Record (G7) — Revision 002 (SIGNED TRANSCRIPTION)

**Artifact ID:** SECB-GOV-001-W3C-CONTRACT-SIGNING-002
**Status:** OPERATOR_VALUES_TRANSCRIBED_PENDING_RATIFICATION
**Supersedes:** SECB-GOV-001-W3C-CONTRACT-SIGNING-001 (the scaffold, PR #123, merge `8161531`) — by reference, extend-only
**Wave:** 3c (per `secb-gov-001-readiness-closure-plan-001.md`, ratified PR #114)
**Gap closed on ratification of THIS revision:** G7 — effective Project Contract
**Transcribed by:** claude-coordinator-w3c-transcribe-01 (agent; transcription only, per scaffold §6 path 2)
**Transcribed at:** 2026-07-22
**Base at transcription:** main @ `81615312862657adfbb84a367f1ad40dd63f624e`

---

## 1. Provenance of the values below

Per scaffold §6 path 2 (transcription): **the operator stated each value below as
an explicit selection in the operator channel on 2026-07-22**, in response to a
four-question decision prompt, and ordered this transcription. The transcribing
agent originated NO value. (Precedent: the P0-20 HOLD disposition transcription.)

Operator's verbatim selections:
1. Owner/approver: **"BizEra (operator)"**
2. Schema shape: **"Option A — rich shape normative"**
3. Expiry: **"180 days from signing"**
4. Effective from: **"At ratification merge"** (merge-as-act semantics, as used for G6/G8)

## 2. The signing block — populated by transcription of the operator's decisions

```yaml
g7_contract_signing:
  contract_document: docs/03-project-control/candidates/secb-gov-001-project-contract-v2-r3-draft-001.md
  contract_version_pin: 8c1179eea7b344b5b201f109b4e8b577a6875104
  baseline_binding: c2ec6458b60ded0a93d74e717cd7816f55834f01
  owners:
    - name: BizEra
      role: operator
  approvals:
    - actor: BizEra
      role: operator/SEC-GOV
      via: explicit selection + transcription order in the operator channel
      date: 2026-07-22
  effective_from: RATIFICATION_MERGE_TIMESTAMP   # semantics chosen by operator: the
                                                 # timestamp of the operator-ordered merge
                                                 # of THIS revision to main (on/about 2026-07-22)
  expires_at: RATIFICATION_MERGE_TIMESTAMP + P180D   # 180 days from signing (on/about 2027-01-18);
                                                     # renewal or re-signing record required after
  schema_shape_decision: OPTION_A_RICH_SHAPE_NORMATIVE
  signed: true
  signed_via: TRANSCRIPTION_OF_EXPLICIT_OPERATOR_SELECTIONS (scaffold §6 path 2)
  agent_fill_is_a_violation: true   # unchanged; the values above are operator decisions,
                                    # transcribed on operator order — not agent-originated
```

## 3. Effect of the schema-shape decision (Option A)

The v2-r3 document shape is **normative** for this contract. The strict
`contracts/project-contract.schema.json` is recorded as the **floor for a future
alignment slice** (operator-dispatchable); the divergence remains tracked, not
erased. No authority-boundary field was dropped to force validation.

## 4. Ratification semantics

> **The operator's ratification of THIS revision on main (merge of its staging
> PR, ordered explicitly by the operator) completes the G7 signing: the Project
> Contract at pin `8c1179ee…` becomes EFFECTIVE from the merge timestamp, expiring
> 180 days later, governed by the adopted G8 lifecycle policy (demotion/rollback
> available by governed decision from day one).**

- Ratification closes **G7** — the ninth of the ten readiness gaps.
- It does NOT seal G9, does NOT touch the P0-20 sealed slot (`verdict: null`,
  `agent_fill_is_a_violation: true`), and does NOT declare promotion or
  production. G9 (W4) remains the final, operator-only act.
- An agent merging this revision without an explicit operator order is a
  governance violation.

## 5. Self-certification

```yaml
self_certification:
  agent_id: claude-coordinator-w3c-transcribe-01
  peer_agent_id: null
  certification_scope: advisory_only   # transcription of operator decisions; no agent-originated value
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
