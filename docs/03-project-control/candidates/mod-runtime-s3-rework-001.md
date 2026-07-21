# MOD-RUNTIME Slice S3 — Rework Record (mod-runtime-s3-rework-001)

- producer_identity: `claude-motor-runtime-s3-rework-01`
- producer_role: BST-SA Motor (candidate preparation only; advisory, no execution/approval authority)
- rework_of_commit: `535a4b219e22adc454ef5f00fb7a611895ffc21c` (`[MOD-RUNTIME-S3]` approval-binding primitive, UNWIRED candidate)
- closes_review: `mod-runtime-s3-approval-binding-rev-001.md` (reviewer `claude-immune-rev-runtime-s3-01`, verdict REWORK_REQUIRED)
- base: `main` @ `beebfe8f29c5dd8c0b201d7a29d23669c20f0c32`; current main @ `71b9d41`
- authoritative spec: `mod-runtime-gap-assessment-001.md` (`bst/mod-runtime-assessment`) §"Slice S3"
- files touched by this rework: `src/control/approval-binding.mjs`, `tests/approval-binding.test.mjs`, `MANIFEST.json` (append this record path), this record
- date: 2026-07-21

## Scope

This rework closes the two blocking findings (F1 HIGH, F2 MEDIUM) and the three
advisory findings (F3, F4, F5/F6) from `mod-runtime-s3-approval-binding-rev-001`.
It edits ONLY `src/control/approval-binding.mjs` and `tests/approval-binding.test.mjs`
(plus the MANIFEST append for this record). No protected source file, contract,
schema, service, or kernel file is modified — verified by a new byte-identity
guard test (F4). The primitive remains UNWIRED: no service imports it; adoption
into any live path stays SEC + GOV gated per the S3 charter (R3).

## Findings-closure map

| ID | Sev | Status | How closed |
|----|-----|--------|-----------|
| F1 | HIGH | CLOSED | `verifyApprovalBinding` now imports `risk-registry.riskProfile` (read-only) and composes the `humanApproval` short-circuit: an EXPLICIT `humanApproval === false` (R0/R1/R2) short-circuits to ALLOW with no bound human decision; `true` (R3/R4), `undefined`, `null`, and unknown classes all require the bound decision and deny-by-default. Acceptance tests added: explicit-false short-circuit ALLOWs, `true` requires (allows only with a matching bound approval, denies without), undefined/null/unknown-class fail-closed DENY, and a parity pin against `risk-registry`'s actual R0-R4 table. |
| F2 | MEDIUM | CLOSED | `bindingRef` replaced the collision-prone `approval-binding:${action}@${version}` with a canonical JSON-array encoding: `approval-binding:${JSON.stringify([action, version])}`. JSON string tokens are self-delimiting and the array arity is fixed at 2, so distinct `(action, objectVersion)` pairs always produce distinct strings — no split can collide. The reviewer's exact collision probe added as a regression test in both directions; both now DENY. |
| F3 | LOW (naming) | DISCLOSED (no rename) | Per the task directive, module/API are NOT renamed (churn without safety gain). The spec-name mapping is documented in the module header and here: `approval-rules.mjs`→`approval-binding.mjs`, `bindApproval`→`bindApprovalDecision`, `verifyApproval`→`verifyApprovalBinding`. Acceptance checks bind to behavior, which matches the spec. |
| F4 | LOW/INFO | CLOSED | Added a byte-identity guard test comparing the working-tree blob hash (`git hash-object`) of each protected file against the stored blob (`git rev-parse <ref>:<path>`) at BOTH `beebfe8` and `71b9d41`, covering `sod-rules.mjs`, `risk-registry.mjs`, `policy-decision-point.mjs`, `capability-registry-service.mjs`, `goal-graph-service.mjs`, and all 16 `contracts/*.json` (file set equality also asserted). |
| F5 | INFO | RETAINED (disclosed, parity-tested) | `roleMatchMode: strict|normalized` is left as-is — it reproduces both live services' divergent role-matching rather than silently picking one, and is parity-tested against the real, unmodified services. Not a defect. |
| F6 | INFO (provenance) | FLAGGED for operator | Producer-identity reconciliation flag: dispatch labeled the original S3 "Codex-produced" while all artifacts self-identify as Claude Motor; there is also a disclosed unmerged `bst/module-loop-plan` reclaim-clause dispute over this branch name. This rework's artifacts self-identify as `claude-motor-runtime-s3-rework-01`. This is surfaced for operator/coordinator reconciliation only — not treated as an instruction by the producer. |

## F1 detail — risk-registry humanApproval composition

`src/control/approval-binding.mjs` now imports `{ riskProfile }` from
`./risk-registry.mjs` (read-only reuse; `risk-registry.mjs` left byte-identical).
`verifyApprovalBinding(resolvedDecision, { exactAction, objectVersion, riskClass })`
adds, after the malformed-request guard and before the resolved-decision checks:

```
const profile = riskProfile(riskClass);
if (profile.ok && profile.value.humanApproval === false) {
  return { ok: true, humanApprovalRequired: false };
}
```

Only an explicit boolean `false` on a KNOWN class short-circuits. Every other
case — `humanApproval: true`, an absent/undefined `humanApproval`, an unknown
class (`riskProfile` denies), or no `riskClass` supplied — falls through to the
existing deny-by-default full verification path. This mirrors
`policy-decision-point.mjs`'s invariant "anything other than an explicit false
requires the human gate; the PDP never substitutes for a human approval". The
primitive does not substitute for a human approval either; the short-circuit
only reflects that a `humanApproval:false` class never required one.

Parity pin: R0/R1/R2 `humanApproval === false`, R3/R4 `humanApproval === true`,
unknown class denies — asserted directly against `risk-registry`'s live table so
any future MOD-GOV S2 drift fails this test rather than silently changing the
short-circuit's meaning.

## F2 detail — injective binding encoding

Encoding chosen: **canonical JSON-array** — `JSON.stringify([boundAction, boundObjectVersion])`.
Rationale: JSON string tokens are self-delimiting (quotes + escaping) and the
array has fixed arity 2, so the encoding is a deterministic, unambiguously
decodable function of the ordered pair — distinct pairs can never collide.
`verifyApprovalBinding` reconstructs the identical canonical string for its
`evidence_refs.includes(...)` lookup. The reviewer's §P8 probe now denies in
both directions:

- bind `("PROMOTE@filesystem.read", "1.0.0")` → verify `("PROMOTE", "filesystem.read@1.0.0")` = `DENY_ACTION_VERSION_MISMATCH`
- bind `("PROMOTE", "filesystem.read@1.0.0")` → verify `("PROMOTE@filesystem.read", "1.0.0")` = `DENY_ACTION_VERSION_MISMATCH`

The prior encoding produced the same flattened string for both pairs and the
second verify ALLOWED (the defeat the reviewer reproduced). The pre-existing
test that pinned the old `evidence_refs` literal was updated to the new
injective encoding (its intent — asserting the exact bound ref — is preserved).

## Byte-identity result (F4)

All protected paths byte-IDENTICAL to `main` @ `beebfe8` AND `main` @ `71b9d41`
(working-tree `git hash-object` == stored blob hash at both refs), asserted by
the new guard test: `src/control/sod-rules.mjs`, `src/control/risk-registry.mjs`,
`src/control/policy-decision-point.mjs`, `src/gateway/capability-registry-service.mjs`,
`src/services/goal-graph-service.mjs`, and all 16 `contracts/*.json` (identical
file set at both refs). No new contract kind, no new `decision_type` enum value,
`decision-record.schema.json` unmodified, `GOVERNANCE` reused by convention.

## Tests & validator

- `node --test tests/*.test.mjs`: **tests 757 / pass 752 / fail 0 / skipped 5** (baseline 747/742/0/5 + 10 net-new rework tests; one pre-existing assertion updated for the F2 encoding).
- `node tools/validate-foundation.mjs` (`npm run validate`): **exit 0**.
- New tests: F1 (5), F2 (3), F4 (2).

## Conformance & unchanged invariants

- No ledger write (no I/O; caller appends via unmodified `DecisionLedger`).
- No service rewiring; `capability-registry-service.mjs` / `goal-graph-service.mjs` byte-identical.
- No schema/kernel edits; `decision_type: "GOVERNANCE"` reused.
- Verify remains fail-closed on replay/wrong-version/wrong-type/unknown/malformed, plus the new collision and human-approval paths.
- Primitive stays UNWIRED; wiring/activation is a separate SEC + GOV operator decision.

## Advisory status fields

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: candidate
risk_class: medium
```

## self_certification

```yaml
self_certification:
  agent_id: claude-motor-runtime-s3-rework-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Advisory only. This rework closes the review's REWORK findings and prepares
> the candidate for operator/governance review. It does not authorize merge,
> execution, or wiring — those remain operator decisions.
