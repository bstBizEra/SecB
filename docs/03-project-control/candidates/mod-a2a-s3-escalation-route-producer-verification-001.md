# MOD-A2A S3 Escalation Route — Producer Verification

| Field | Value |
|---|---|
| Record ID | `MOD-A2A-S3-ESCALATION-ROUTE-PV-001` |
| Implementation commit | `bc320c92289a57084fdb07f6194c8b0eb82a047a` |
| Implementation tree | `8541cdb08ba106a7a1936e511132324dcf4d41b5` |
| Branch | `codex/mod-a2a-s3-escalation-route` |
| Producer | `codex-root` (`ENGIN`) |
| Timestamp | `2026-07-21T12:32:09+07:00` |
| Truth status | `PRODUCER_VERIFIED` |
| Authority status | `ADVISORY_ONLY / NOT EFFECTIVE` |
| Required next role | `FRESH_INDEPENDENT_REV + SEC` |

## Scope

Pure, unwired candidate only: `src/control/escalation-route.mjs`, `tests/escalation-route.test.mjs`, and the root manifest. No ledger append, notification, dispatch, human escalation, authority grant, service wiring, transport, merge, push, release, or activation.

## Advisory design choices

- The assessment referred to private `HandoffService.INDEPENDENCE_ROLES`. The candidate does not modify that service; it derives `ESCALATION_ROLES` from the exported shared `HANDOFF_ACCEPTANCE_LADDER` in `sod-rules.mjs`, preserving the same `REV`/`QA`/`GOV` role set without a duplicate literal.
- The assessment's role-only API could not prove self-escalation. The candidate therefore requires `escalationActorId` and denies when it equals the delegation's `source_actor_id`. This is an additive candidate input and must be explicitly reviewed before any consumer adopts it.
- Binding metadata is carried in an injective JSON-array `evidence_refs` entry while reusing the existing closed `GOVERNANCE` decision type. No schema mutation is made.

## Checks

- `git diff --check`: pass.
- `node --test tests/escalation-route.test.mjs`: `11 total, 11 pass, 0 fail`.
- `node tools/validate-foundation.mjs`: `PASS`, exit `0`.
- `npm ci --offline --ignore-scripts`: installed 6 cached packages; audit reported 0 vulnerabilities.
- `npm test`: `799 total, 794 pass, 0 fail, 5 skipped`, exit `0`.

## Separation of duties

The producer session is not eligible for REV, QA, SEC, evidence acceptance, GOV, integration acceptance, or activation of this exact candidate. Fresh reviewers must independently inspect the role derivation, actor-identity addition, exact binding/replay probes, decision-record shape, no-wiring boundary, targeted tests, validator, and full suite. Any successor SHA requires a new disposition.
