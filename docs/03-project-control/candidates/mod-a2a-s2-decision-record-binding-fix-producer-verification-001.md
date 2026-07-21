# MOD-A2A Slice S2 — Decision-Record Binding Fix — Producer Self-Verification (mod-a2a-s2-decision-record-binding-fix-producer-verification-001)

- producer_identity: `claude-motor` (BST-SA Motor worker; advise-and-proceed, no execution/approval/merge authority exercised beyond a local commit on an isolated branch)
- producer_role: BST-SA Motor (bounded implementation, advise-and-proceed per `AGENTS.md` `SECB-AGENTS-AMD-002` rev 2)
- target_branch: `bst/mod-a2a-s2-decision-record-binding-fix-001`
- base: `origin/main` @ `0aa13f8cd68be265bc3c2e3227fdd649daaba55b` (`Merge pull request #108 from bstBizEra/bst/mod-mem-s3-candidate-provider`) — confirmed first-hand via `git rev-parse origin/main` at task start, in an isolated `git worktree add` (not a detached HEAD; a real branch, uncommitted anywhere but this local worktree).
- fixes: `docs/03-project-control/candidates/mod-a2a-s2-non-escalation-gate-third-independent-review-001.md` §4 (read in full first-hand via `git show refs/immune-review/mod-a2a-s2-third-independent-review-001:...`, ref confirmed reachable via `git fetch origin`) — a **medium**-risk decision-record integrity gap the third independent review found in already-merged `main` code, not a regression this task introduces.
- date: 2026-07-22
- environment: isolated worktree/branch off `origin/main` tip, `.claude/worktrees/mod-a2a-s2-decision-record-binding-fix-001`. No push, no merge, no live branch touched.

## Root cause (confirmed first-hand, not merely restated from the review)

`buildDelegationDecisionRecord(evaluation, identity)` in `src/control/delegation-gate.mjs` derived `outcome`/`rationale` from `evaluation.ok`/`evaluation.code` alone and **never had `requestedCeiling`/`boundingCeiling` in scope at all** — those values were not parameters of the function. Read the pre-fix source directly (`buildDelegationDecisionRecord`, old lines 181–214): the function's only inputs were `evaluation` and `identity`; nothing about the ceilings that were supposedly compared reached this function. Consequently a hand-fabricated `{ ok: true, code: "ALLOW" }` — never produced by a real `evaluateDelegation` call — minted a `DISPOSITION` record that is schema-valid (`contracts/decision-record.schema.json`, `additionalProperties:false`-compliant) and byte-for-byte structurally identical to a genuine `ALLOW` record, even when the actual ceilings involved (e.g. requested R4/RESTRICTED/`paths:["/"]`/`tools:["*"]` vs. a bounding R0/PUBLIC/empty ceiling) are ones a real `evaluateDelegation` call denies as `DENY_ESCALATION`. Reproduced this exact scenario first-hand in this worktree before writing any fix (see "Regression tests" below) — confirmed the pre-fix function has no mechanism whatsoever to detect or reject this.

Not exploitable in current production: `grep -rl "delegation-gate" src/ tools/` (re-run in this worktree) still returns only `src/control/delegation-gate.mjs` itself — the module remains genuinely UNWIRED, matching the review's own finding. This fix closes the gap before any wiring layer is built on top of it, as the review recommended.

## The fix (reuses the S3 `bindEscalationRoute`/`verifyEscalation` pattern verbatim — no new mechanism invented)

Read `src/control/escalation-route.mjs`'s `bindEscalationRoute`/`verifyEscalation` in full before writing any code. Its mechanism: an injective binding string `` bindingRef(id, version, role, actor) => `escalation-route:${JSON.stringify([id, version, role, actor])}` `` embedded into `evidence_refs` at mint time, and a `verifyEscalation(decision, exactInputs)` function that recomputes the expected binding from ground-truth inputs and checks `decision.evidence_refs.includes(expected)`.

`delegation-gate.mjs` now reuses that **exact** mechanism, same naming convention, same construction, same placement:

1. **`delegationBindingRef(requestedCeiling, boundingCeiling, outcome)`** (private helper) — `` `delegation-gate:${JSON.stringify([requestedCeiling, boundingCeiling, outcome])}` ``. Same `<module-name>:JSON.stringify([...actual fields])` construction as S3's `bindingRef`, just this module's own prefix and its own actual-input tuple (ceilings + outcome, since ceilings are what this gate's decision is about — S3's tuple is `[id, version, role, actor]` because that's what *its* decision is about).
2. **`buildDelegationDecisionRecord(evaluation, identity = {}, { requestedCeiling, boundingCeiling } = {})`** — new third parameter carrying the ACTUAL ceilings the caller claims `evaluation` came from. The fingerprint over these actual inputs (plus the claimed outcome) is now prepended into `evidence_refs`, exactly mirroring how `bindEscalationRoute` prepends its own `bindingRef` into `evidence_refs` — **no new schema field, no `additionalProperties` violation, no new `decision_type`**. This function still performs **no re-decision**: it does not call `evaluateDelegation` or re-run `withinCeiling`/`riskProfile` — it only binds. This matches the task instruction's explicit constraint not to re-derive `evaluateDelegation`'s own logic a second time inside the minting function (that would duplicate the decision, not bind it).
3. **`verifyDelegationDecision(decision, { requestedCeiling, boundingCeiling } = {})`** (new export) — mirrors `verifyEscalation` exactly: checks `decision_type === "DISPOSITION"`, calls the existing `evaluateDelegation` **once** (the single source of truth — not a second parallel implementation of the comparator) to learn the actual ground-truth outcome for the given ceilings, recomputes the expected `delegationBindingRef`, and denies with the new `DENY_DECISION_MISMATCH` code if the decision's own `outcome`/`evidence_refs` don't match ground truth. This is where the "recompute and compare" step lives — deliberately kept out of the mint-time function, in the same place S3 keeps its own equivalent check (`verifyEscalation`, not `bindEscalationRoute`).
4. New exported constants: `DENY_UNKNOWN_DELEGATION_DECISION`, `DENY_WRONG_DECISION_TYPE`, `DENY_DECISION_MISMATCH` — direct analogues of S3's `DENY_UNKNOWN_ESCALATION`, `DENY_WRONG_DECISION_TYPE` (literally the same name, reused), `DENY_DELEGATION_MISMATCH`.

No new comparator table, no new risk-class table, no new schema, no new `decision_type` enum value. `non-escalation-comparator.mjs` and `risk-registry.mjs` are untouched.

## Regression tests (`tests/delegation-gate.test.mjs`, +7 new tests, 24 → 31)

- **Reviewer's exact scenario, reproduced and closed**: a hand-fabricated `{ ok: true, code: "ALLOW" }` evaluation is passed to `buildDelegationDecisionRecord` alongside the reviewer's own hostile ceiling pair (requested R4/RESTRICTED/`paths:["/"]`/`tools:["*"]` vs. bounding R0/PUBLIC/empty — confirmed via a direct `evaluateDelegation` call in the test that this pair genuinely denies with `DENY_ESCALATION`). The forged record's own `outcome` field still reads `"ALLOW"` (mint performs no re-decision, per the fix's design), but `verifyDelegationDecision(forgedRecord, hostileInputs)` now returns `{ ok: false, code: "DENY_DECISION_MISMATCH" }` — the forgery is caught.
- A second regression test confirms the forged record cannot be laundered by re-presenting it alongside a different, innocent-looking ceiling pair at verify time — the fingerprint was bound to the original hostile ceilings at mint time, so it doesn't match a different pair's expected fingerprint either.
- **Legitimate case, confirmed unchanged**: calling `buildDelegationDecisionRecord` with `evaluateDelegation`'s real output for its real inputs (both the `ALLOW` and a genuine `DENY_ESCALATION` case) still produces a record with the same `decision_type`, `outcome`, `decision_id`, `project_id`, and non-empty `rationale` as before the fix; the caller-supplied `evidenceRefs` entry (`"ev_delegation_gate_001"`) is preserved verbatim alongside the new binding fingerprint (`evidence_refs.length === 2`); and `verifyDelegationDecision` on this genuine record returns `{ ok: true }`.
- Three additional unit tests cover `verifyDelegationDecision`'s own fail-closed paths: null/undefined decision (`DENY_UNKNOWN_DELEGATION_DECISION`), wrong `decision_type` (`DENY_WRONG_DECISION_TYPE`), and missing/tampered `evidence_refs` (`DENY_DECISION_MISMATCH`).
- All 10 pre-existing `buildDelegationDecisionRecord`/ledger-integration call sites were updated to pass the actual ceilings as the new third argument (the one call site deliberately testing missing-identity-fields contract rejection was left at its original 2-argument call, since that test is specifically about identity, not ceilings, and the fix's third parameter correctly defaults to `{}`).

## Test counts

- **Module test file, standalone** (`node --test tests/delegation-gate.test.mjs`): **before 24/24 pass** (baseline, re-confirmed in this worktree) → **after 31/31 pass** (+7 new, 0 fail).
- **Full suite** (`npm test`): **before 1279 tests, 1276 pass, 0 fail, 3 skipped** (re-confirmed first-hand in this worktree, matches the third-independent-review's own recorded figures exactly) → **after 1286 tests, 1283 pass, 0 fail, 3 skipped** (+7, 0 fail, skip count unchanged).
- `node tools/validate-foundation.mjs`: **after fix**, top-level `"status": "PASS"`, exit code `0`, zero `FAIL` entries in the check list (schemas, MANIFEST, script-retention metadata, sanctioned-remote checks all pass; no schema was added or changed by this fix, so no contract-validator/foundation-validator re-registration was needed).

## Hardcoded test-ID branching

`grep -niE "test|dec_delegation|===\s*['\"]|decisionId\s*===|if\s*\(.*id\s*===" src/control/delegation-gate.mjs` — **zero hits**, confirmed first-hand in this worktree after the fix. No hardcoded test-ID branching was introduced.

## Scope discipline

- Only `src/control/delegation-gate.mjs` and `tests/delegation-gate.test.mjs` were modified (`git diff --stat`: 2 files, +231/−14 lines). `src/control/escalation-route.mjs` (the S3 pattern being reused) was read, not modified. `src/services/non-escalation-comparator.mjs` and `src/control/risk-registry.mjs` were not touched.
- **`retry-policy.mjs`'s `buildRetryDecisionRecord`** shares the identical pre-fix pattern (the third-independent-review explicitly noted this: "the gap is a pre-existing house-style pattern shared verbatim with `retry-policy.mjs`'s `buildRetryDecisionRecord` — not a regression this slice introduced"). This task's explicit scope was MOD-A2A S2's `delegation-gate.mjs` only; `retry-policy.mjs` was deliberately **not** touched here and remains an open, named fast-follow for a separate task.
- No wiring: this fix does not connect `delegation-gate.mjs` to `HandoffService`, `RuntimeRegistry`, `DelegationLedger`, or any live dispatch path. The module remains genuinely UNWIRED, confirmed by grep, exactly as before this fix.
- No push, no merge to `main`, no production declaration. Commit is local to `bst/mod-a2a-s2-decision-record-binding-fix-001` only.

## Self-certification

```yaml
self_certification:
  agent_id: claude-motor
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

## Provenance

- source: first-hand reproduction and fix in an isolated `git worktree add` checkout (`bst/mod-a2a-s2-decision-record-binding-fix-001`, off `origin/main` @ `0aa13f8`), separate from the third-independent-review's own (removed) worktree.
- agent_id: claude-motor (BST-SA Motor worker, Claude Sonnet 5)
- timestamp: 2026-07-22
- disposition: this record documents a completed local fix + regression tests on an isolated, unpushed, unmerged branch. It recommends operator/independent-review follow-up before this branch is proposed for merge; it does not itself authorize merge, wiring, or production adoption.
