# MOD-A2A S3 — Independent Review Request 001

| Field | Value |
|---|---|
| Artifact ID | `MOD-A2A-S3-INDEPENDENT-REVIEW-REQUEST-001` |
| Status | `DISPATCHED_PENDING_RESPONSES` |
| Exact implementation target | `bc320c92289a57084fdb07f6194c8b0eb82a047a` |
| Target tree | `8541cdb08ba106a7a1936e511132324dcf4d41b5` |
| Branch | `codex/mod-a2a-s3-escalation-route` |
| Producer | `codex-root` |
| Requested lanes | `REV`, `SEC` |
| Authority | `ADVISORY_ONLY` |
| Current gate | `HOLD_PENDING_INDEPENDENT_RESPONSES` |

## Review constraints

- Use a fresh detached exact-SHA workspace; do not review the producer session's workspace.
- No producer self-acceptance, merge, push, wiring, dispatch, authority grant, or activation.
- Re-run targeted tests, foundation validator, and full suite independently.
- Treat any successor SHA as a new object requiring a new request.

## Required probes

1. Verify `ESCALATION_ROLES` is derived from the shared handoff SoD ladder and does not drift from `REV`/`QA`/`GOV` semantics.
2. Probe malformed delegation records, malformed roles/actors, unknown roles, route mismatch, and source-actor self-escalation.
3. Probe exact binding and replay across delegation ID, version, escalation role, and escalation actor identity.
4. Verify wrong decision type, denied outcome, missing evidence binding, and malformed verification requests fail closed.
5. Confirm the candidate emits only schema-shaped `GOVERNANCE` records, uses injective binding references, and performs no I/O or ledger append.
6. Confirm no existing service, schema, policy, gateway, or transport file is modified and the candidate remains unwired.

## Required outputs

`verdict`, `commands_and_environment`, `fresh_test_results`, `evidence_references`, `residual_risks`, `acceptance_or_blockers`, and an explicit SoD attestation.

## Hard gate

Remain `HOLD_PENDING_INDEPENDENT_RESPONSES` until fresh REV and SEC dispositions exist. This packet grants no acceptance or activation authority.
