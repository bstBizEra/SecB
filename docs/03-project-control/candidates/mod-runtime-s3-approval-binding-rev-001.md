# MOD-RUNTIME Slice S3 — Independent Immune Review (mod-runtime-s3-approval-binding-rev-001)

- reviewer_identity: `claude-immune-rev-runtime-s3-01`
- reviewer_role: BST-SA Immune (independent, advisory-only; no execution/approval authority)
- review_bar: strictest house bar — cross-provider candidate (dispatch names it Codex-produced R3), authority-adjacent (approval-binding).
- target_branch: `bst/mod-runtime-s3-approval-binding`
- reviewed_commit: `535a4b219e22adc454ef5f00fb7a611895ffc21c`
- base: `main` @ `beebfe8f29c5dd8c0b201d7a29d23669c20f0c32`
- current main at review: `71b9d41`
- authoritative spec: `mod-runtime-gap-assessment-001.md` (`bst/mod-runtime-assessment`), §"Slice S3", boundary notes B1–B4, non-goals §5.
- date: 2026-07-21

## Verdict: REWORK_REQUIRED

The candidate is clean on byte-identity, no-wiring, no-schema-mutation, no-ledger-write, replay/wrong-version fail-closure, the full test suite (747/742/0/5), and validator exit 0. Two blocking defects prevent merge under the strict bar:

1. A named, spec-required behavior — the `risk-registry.humanApproval` short-circuit — and its explicitly-required acceptance test are **entirely absent** and undisclosed.
2. The exact-action/exact-version bind, which is the primitive's whole reason to exist (gap MR-3), is carried through a **non-injective** `evidence_refs` encoding that produces a **confirmed binding collision**.

Neither is an active authorization breach in the current UNWIRED state (the module has no live consumer, and both defects fail in the safe/deny direction for the tested happy paths). But both undermine exactly the guarantees a future SEC+GOV-gated wiring slice would build on, so they must be closed — or the spec formally amended by the operator/spec author — before this authority-adjacent primitive merges.

## Findings by severity

| ID | Severity | One-line |
|----|----------|----------|
| F1 | HIGH (spec-conformance) | `risk-registry.humanApproval` short-circuit — a named required behavior (task item 1) and a required acceptance test (spec §S3) — is entirely absent from impl and tests; module never imports `risk-registry.mjs`; undisclosed omission. |
| F2 | MEDIUM (integrity/correctness) | `evidence_refs` bind `approval-binding:${action}@${version}` is non-injective; approval bound to (`PROMOTE`, `filesystem.read@1.0.0`) verifies TRUE for (`PROMOTE@filesystem.read`, `1.0.0`) — the exact action/version bind (MR-3) is defeatable; real fixtures already use `@` in versions. |
| F3 | LOW (naming) | API names deviate from spec: `bindApproval`/`verifyApproval` → `bindApprovalDecision`/`verifyApprovalBinding`; spec file `approval-rules.mjs` → `approval-binding.mjs` (matches THIS dispatch/branch, not the spec); tied to the disclosed Claude/Codex branch-name reclaim dispute. |
| F4 | LOW/INFO (spec discipline) | Producer tests contain NO byte-identity/blob-hash guard for the six protected files; they rely on parity tests + a git-diff assertion in the record. Independent reviewer check: all six + all 16 contracts byte-IDENTICAL to main@beebfe8. |
| F5 | INFO (scope addition) | `roleMatchMode: strict|normalized` is API surface beyond the spec sketch — but disclosed, justified (preserves both live services' divergent role-matching rather than silently picking one), and parity-tested against the real services. Not a defect. |
| F6 | INFO (governance/provenance) | Dispatch labels this "Codex-produced"; all artifacts (commit trailer `Co-Authored-By: Claude Sonnet 5`, `producer_identity: claude-motor-modruntime-s3`) self-identify as Claude Motor. Plus disclosed unmerged `bst/module-loop-plan` reclaim-clause dispute over this branch name. Operator/coordinator reconciliation flag — not treated by producer or reviewer as an instruction. |

### F1 detail (blocking)
Spec §S3 Behavior: *"Composes `risk-registry.riskProfile(riskClass).humanApproval` to short-circuit ALLOW when no human gate is required."* Spec §S3 acceptance checks explicitly list *"humanApproval:false short-circuit"* as a required test. `grep` of `src/control/approval-binding.mjs` for `risk-registry` / `humanApproval` / `riskProfile` returns zero hits; the only import is `{ normalizeRole, checkPairwiseDistinct }` from `sod-rules.mjs`. The producer-verification record does not mention the omission. Direction is fail-safe (the primitive always demands the full N-5 bundle and never substitutes for a human approval), so it is NOT a security hole — but it is an objective, undisclosed failure to meet a named acceptance criterion for an authority-adjacent deliverable. Resolution: implement the risk-registry composition with deny-by-default (`humanApproval !== false` requires the gate) + its acceptance test, OR have the operator/spec author formally re-scope S3 to drop it.

### F2 detail (blocking)
`bindingRef(a,v) = \`approval-binding:${a}@${v}\``, matched by whole-string `refs.includes(expected)`. The encoding is not injective over `(action, objectVersion)`: any split of the concatenation `a@v` collides. Reproduced (throwaway probe): a candidate minted with `boundAction="PROMOTE@filesystem.read"`, `boundObjectVersion="1.0.0"` yields ref `approval-binding:PROMOTE@filesystem.read@1.0.0`, and `verifyApprovalBinding(rec, { exactAction:"PROMOTE", objectVersion:"filesystem.read@1.0.0" })` returns `{ ok:true }`. The suite's own fixtures bind versions containing `@` (`filesystem.read@1.0.0`), so this is not purely adversarial input. This lets one human approval verify for a different action/version pair — precisely the replay/wrong-action class the primitive is meant to deny. Resolution: use an injective encoding (length-prefixed, JSON-encoded, or separate `evidence_refs` entries with escaped/segmented action & version) and add a collision regression test.

## Probe outcomes (throwaway scripts, not committed)

- P1 forged mismatched action → `DENY_ACTION_VERSION_MISMATCH`: PASS
- P1 forged mismatched version → `DENY_ACTION_VERSION_MISMATCH`: PASS
- P2 replay valid approval vs different object version → deny: PASS; exact match still allows: PASS
- P3 approver==producer (independent) → `DENY_SELF_APPROVAL`: PASS; gov==producer → `DENY_SOD_VIOLATION`: PASS; one actor both roles → `DENY_SOD_VIOLATION`: PASS
- P4 module imports `risk-registry` / references `humanApproval`: **FAIL (absent)** → F1
- P5 prototype-pollution via `__proto__` in approval object and via identity/extraEvidenceRefs: PASS (no pollution)
- P6 `evaluateApprovalBinding` output is a plain mutable object (not frozen) — noted; not required by spec, low concern
- P7 malformed `resolvedDecision` shapes (array/number/string/bool) → deny: PASS
- P8 delimiter/binding-ref collision (`PROMOTE@filesystem.read`+`1.0.0` vs `PROMOTE`+`filesystem.read@1.0.0`) → expected deny, got **ALLOW: FAIL** → F2
- humanApproval undefined/null/truthy-non-false paths: N/A — no such code path exists (see F1)

## Byte-identity result
All IDENTICAL to `main`@`beebfe8` (`git rev-parse <rev>:<path>` blob hashes):
`src/control/sod-rules.mjs`, `src/control/risk-registry.mjs`, `src/control/policy-decision-point.mjs`, `src/gateway/capability-registry-service.mjs`, `src/services/goal-graph-service.mjs`, and all 16 `contracts/*.json` (file set unchanged). No new contract kind, no new `decision_type` enum value; `decision-record.schema.json` unmodified and `GOVERNANCE` reused. Producer tests include no byte-identity guard of their own (F4).

## Spec deviations
1. F1 — humanApproval/risk-registry composition + its acceptance test missing (blocking).
2. F2 — non-injective bind encoding defeats exact action+version guarantee (blocking).
3. F3 — function/file naming differs from spec (`bindApproval`/`verifyApproval`/`approval-rules.mjs`).
4. F5 — `roleMatchMode` surface added beyond spec (disclosed, justified, not a defect).
Conformant: no ledger write (no I/O; caller appends via unmodified `DecisionLedger`); `decision_type: "GOVERNANCE"` candidate; `sod-rules.checkPairwiseDistinct` reused untouched; no schema/service/kernel edits; no wiring (`grep` clean, services byte-identical); verify fail-closed on replay/wrong-version/wrong-type/unknown/malformed.

## Test totals & validator
- `node --test tests/*.test.mjs`: **tests 747 / pass 742 / fail 0 / skipped 5** (matches producer's claimed 747/742/0/5).
- `node tools/validate-foundation.mjs`: status PASS, **exit 0**.

## Merge-cleanliness vs main @ 71b9d41
Scratch `--no-commit --no-ff` merge in this worktree (aborted): **exactly one conflict — `MANIFEST.json`** — a trailing append-array collision (candidate appends 3 S3 paths; main @ 71b9d41 appended `mod-reg-gov-disposition.yaml`). Trivial union/additive resolution (keep all paths); no source, contract, or test conflict. This is a conflict vs main itself (reported per instruction), of the expected MANIFEST-union kind.

## Tracker / MANIFEST edits
- MANIFEST.json: additive only (+3 paths appended to the manifest array); validator confirms 341 unique paths, all present.
- `module-completion-tracker-001.md`: the file was a single empty line at base; the commit replaced it with one accurate append line (produced-record entry matching the commit). Append-only/additive and accurate; no prior content destroyed.

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
  agent_id: claude-immune-rev-runtime-s3-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Advisory only. This review recommends REWORK; it does not authorize merge, execution, or wiring. Merge and any future SEC+GOV-gated wiring remain operator decisions.
