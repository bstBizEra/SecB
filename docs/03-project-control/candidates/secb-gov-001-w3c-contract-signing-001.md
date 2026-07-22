# SECB-GOV-001 — W3c Contract-Signing Record (G7)

**Artifact ID:** SECB-GOV-001-W3C-CONTRACT-SIGNING-001
**Status:** SCAFFOLD_PENDING_OPERATOR_SIGNING / NOT EFFECTIVE
**Wave:** 3c (per `secb-gov-001-readiness-closure-plan-001.md`, ratified PR #114)
**Gap closed on signing:** G7 — effective Project Contract
**Drafted by:** claude-coordinator-w3c-draft-01 (agent; advisory only — scaffold only)
**Drafted at:** 2026-07-22
**Base at drafting:** main @ `e9204741903301eaaba9009f9e98b3d77dbb29f0`

---

## 1. What this record is — and how it differs from W3a/W3b

For G6 (W3a) and G8 (W3b), the operator's merge of the record WAS the authority
act. **Signing a contract is different**: it requires operator-supplied content
(owners, approvals, effectiveness date), not just ratification of an enumeration.

Therefore:

- **Merging this scaffold does NOT sign the contract and does NOT close G7.**
  It only lands the signing vehicle on main.
- The contract becomes EFFECTIVE only when the operator populates §5 through one
  of the two paths in §6 and ratifies the populated revision.

## 2. The contract being signed (exact version pin)

- **Document:** `docs/03-project-control/candidates/secb-gov-001-project-contract-v2-r3-draft-001.md`
- **Version pin (git blob):** `8c1179eea7b344b5b201f109b4e8b577a6875104`
  (at main @ `e920474`; signing applies to this byte-exact revision only)
- **Predecessor chain:** supersedes `secb-local-v2-r2.project-contract.yaml`
  (`project_contract_prj_secb_local_v2_r2_candidate`), which superseded v1 —
  extend-only, by reference.

## 3. Preconditions — all now satisfied and citable

| Precondition | State |
|---|---|
| G4 single baseline | ✅ `c2ec6458b60ded0a93d74e717cd7816f55834f01` accepted (PR #115) |
| G5 + W2 evidence chain | ✅ E1–E4 complete; G1 APPROVE_WITH_NOTES (#118), G2 QA_PASS_WITH_NOTES (#117), G3 SEC_PASS_WITH_NOTES (#119) |
| G6 evidence acceptance | ✅ operator-accepted (PR #121, merge `bf2b20d`) |
| G8 governing lifecycle policy | ✅ ADOPTED / EFFECTIVE at pin `15a3b012…` (PR #122, merge `e920474`) — the contract's `governing_lifecycle_policy` dependency is satisfied |

## 4. Open decision the operator resolves AT signing (flagged, not pre-resolved)

**Schema-shape divergence (from the W1c honest flag):** the canonical
`contracts/project-contract.schema.json` is a strict, narrower shape
(`additionalProperties: false`) that the rich v2-r2/v2-r3 contract does not
validate against. The drafter deliberately did NOT drop the contract's
authority-boundary fields to force validation. At signing, the operator chooses:

- **Option A — sign the rich shape as normative:** record in §5 that the v2-r3
  document shape governs and the strict schema is a floor for a future alignment
  slice; or
- **Option B — order a schema-alignment slice first:** G7 signing waits; an agent
  slice reconciles document and schema (operator-dispatched), then a re-pinned
  signing follows.

## 5. THE SIGNING BLOCK — OPERATOR INPUT ONLY

> An agent (Claude, Codex, any LLM) filling any field below is a governance
> violation. This block is populated only by the operator, per §6.

```yaml
g7_contract_signing:
  contract_document: docs/03-project-control/candidates/secb-gov-001-project-contract-v2-r3-draft-001.md
  contract_version_pin: 8c1179eea7b344b5b201f109b4e8b577a6875104
  baseline_binding: c2ec6458b60ded0a93d74e717cd7816f55834f01
  owners: []                    # OPERATOR: named owner(s) with roles
  approvals: []                 # OPERATOR: signing approvals (who, role, date)
  effective_from: null          # OPERATOR: ISO-8601 timestamp at signing
  expires_at: null              # OPERATOR: per contract expiry_policy SET_AT_SIGNING_BY_OPERATOR
  schema_shape_decision: null   # OPERATOR: OPTION_A_RICH_SHAPE_NORMATIVE | OPTION_B_ALIGNMENT_SLICE_FIRST
  signed: false
  agent_fill_is_a_violation: true
```

## 6. Signing paths (either is valid)

1. **Direct:** the operator edits this record (own commit — IDE or web UI),
   populates §5, sets `signed: true`, and merges that revision to main.
2. **Transcription:** the operator states the §5 values explicitly in the
   operator channel and orders the coordinating agent to transcribe them into a
   successor revision (`…-002.md`) and stage it; the operator then orders that
   merge. Transcription of an explicit operator decision is permitted (precedent:
   the P0-20 HOLD disposition); agent invention of any value is not.

On ratification of the populated revision: **G7 closes; the Project Contract at
the §2 pin is EFFECTIVE** per its own terms, governed by the adopted G8 lifecycle
policy (demotion/rollback available by governed decision from day one).

## 7. What signing does NOT do

Signing does NOT seal G9, does NOT touch the P0-20 sealed slot
(`verdict: null`, `agent_fill_is_a_violation: true`), and does NOT declare
promotion or production. G9 (W4) remains the final, operator-only act.

## 8. Self-certification

```yaml
self_certification:
  agent_id: claude-coordinator-w3c-draft-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
