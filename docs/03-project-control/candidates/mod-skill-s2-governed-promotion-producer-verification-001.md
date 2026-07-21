# MOD-SKILL Slice S2 — Governed Promotion, Producer Verification

**Record ID:** MOD-SKILL-S2-GOVERNED-PROMOTION-PRODUCER-VERIFICATION-001
**Module:** MOD-SKILL (SkillsHub)
**Slice:** S2 — governed promotion transition (CANDIDATE -> PUBLISHED)
**Base:** `origin/main` @ `ee31db7`
**Branch:** `bst/mod-skill-s2-governed-promotion`
**Producer identity:** `claude-motor` (BST-SA motor, worker only)
**Authority:** AMD-002 advise-and-proceed; BST-SA global contract Dual-Agent Self-Certification Rule. Operator has EXPLICITLY authorized building this slice this turn (previously R3+/operator-gated for wiring; build/candidate-prep authorized now). No merge to main, no push, no self-declared production-readiness.
**Extends:** `docs/03-project-control/candidates/mod-skill-gap-assessment-001-addendum-001.md` §5 (MOD-SKILL-ASSESS-001-ADD-001, branch `bst/mod-skill-s2-design-addendum-001`, not yet merged — its re-scoping is the design brief this slice implements).
**Recorded:** 2026-07-21

## 1. What was built

- `contracts/skill-promotion.schema.json` — new closed contract (18th schema in the registry) for a durable skill-promotion FACT record. `additionalProperties: false`; identity + `content_hash` fields required per house convention (mirrors `checkpoint.schema.json` / `workspace-lease.schema.json`).
- `src/contracts/contract-validator.mjs` — one added registry entry (`skillPromotion: "skill-promotion.schema.json"`), no other change.
- `src/ledger/skill-promotion-ledger.mjs` — new `SkillPromotionLedger extends DurableLedger` (ledgerId `secb-skill-promotion-ledger`). Public surface: `promote(request, { expectedSequence, idempotencyKey })` (the sole write path) and `resolvePublished(skillCandidateId)` (fail-closed read helper). Exports `PROMOTE_SKILL_ACTION = "PROMOTE_SKILL"`.
- `tests/skill-promotion-ledger.test.mjs` — 34 new tests (see §4).
- `tests/fixtures/valid/skill-promotion.json`, `tests/fixtures/invalid/skill-promotion-missing-id.json`, plus the matching entries added to `tests/contract-validator.test.mjs`'s `validFixtures`/`invalidFixtures` maps (required by that file's own `supportedContractKinds()` exhaustiveness assertion).
- `tools/validate-foundation.mjs` — extended (not rewritten) the hardcoded `expectedSchemas` list and `mandatoryIdentityFields` map with the new schema, matching the exact pattern every prior ledger/contract addition (checkpoint, workspace-lease, delegation-request, goal, …) used at introduction.
- `MANIFEST.json` — appended the 6 new file paths (extend-only).
- `docs/03-project-control/candidates/module-completion-tracker-001.md` — one appended iteration-log line (extend-only).
- **Byte-identity guard repins (disclosed, additive-only).** Nine pre-existing tests in eight OTHER test files pin the git blob hash of `tools/validate-foundation.mjs` and/or `src/contracts/contract-validator.mjs` (each guarding that ITS OWN candidate slice touched no shared primitive it merely composes). Since this slice makes an authorized, disclosed edit to both files (registering the 18th schema), each pin was repinned to the new, correct post-S2 blob hash — the exact same disclosed treatment `mod-wspace-s3-single-writer-toctou-fix-001` already used on these same guards when IT last touched `validate-foundation.mjs`: `tests/cadence-policy.test.mjs`, `tests/scorecard-assembler.test.mjs`, `tests/overlap-policy.test.mjs`, `tests/kpi-registry.test.mjs`, `tests/event-family-policy.test.mjs`, `tests/replay-assembler.test.mjs` (all `validate-foundation.mjs`); `tests/conformance-p0-18-candidate.test.mjs`, `tests/conformance-v016-drift.test.mjs`, `tests/p0-19-self-pilot.test.mjs` (all `contract-validator.mjs`). `tests/workspace-lease-ledger.test.mjs`'s own contracts-directory-enumeration byte-identity guard also gained one additional schema-filename exclusion (`skill-promotion.schema.json`, mirroring its existing `workspace-lease.schema.json` self-exclusion). Every repin was computed from the ACTUAL new working-tree blob hash (`git hash-object`), never guessed, and verified by re-running the full suite green afterward (§4).

**Stays UNWIRED**, per instruction: no import of `skill-promotion-ledger.mjs` was added to `src/registry/skill-candidate-registry.mjs`, any resolver, or any other `src/` module. Verified two ways: (1) `git diff --stat origin/main -- src/registry/skill-candidate-registry.mjs src/registry/ src/gateway/` is empty (no live file touched); (2) a dedicated test (`skill-candidate-registry.mjs and every other src/ module have no reference to SkillPromotionLedger (stays unwired)`) greps `src/` for the class name and asserts the only hit is the ledger's own definition file.

## 2. Confirmation of reuse, not reimplementation

### 2.1 `src/control/approval-binding.mjs` (MOD-RUNTIME-S3)

`promote()` calls, in order:
1. `evaluateApprovalBinding({ approvals, producerActorId, roleMatchMode })` — the ENTIRE N-5 SoD disposition (well-formedness, self-approval, pairwise-distinctness, role-matching mode) is decided here. `skill-promotion-ledger.mjs` contains zero pairwise-distinctness math, zero self-approval comparison, and zero role-matching logic of its own.
2. `bindApprovalDecision(evaluation, identity)` — mints the GOVERNANCE decision candidate bound to `boundAction: "PROMOTE_SKILL"` and `boundObjectVersion: "${skillCandidateId}@${skillVersion}"`.
3. `verifyApprovalBinding(decisionRecord, { exactAction, objectVersion, riskClass })` — re-verifies the freshly-minted binding before anything is written (defense in depth: mint and verify are two independent calls, not a single trusted round-trip).

Verified by direct grep (`no direct sod-rules.mjs import` test): `skill-promotion-ledger.mjs` imports `evaluateApprovalBinding`/`bindApprovalDecision`/`verifyApprovalBinding` from `../control/approval-binding.mjs` and nothing from `sod-rules.mjs`. The SoD-parity test group (`SOD_PARITY_CASES`, 7 cases) calls `evaluateApprovalBinding` directly with the identical arguments `promote()` uses and asserts the SAME deny code both ways (missing/empty bundle, self-approval, SoD violation both directions, malformed entry, invalid roleMatchMode) — proving delegation, not divergence.

A byte-identity test pins `src/control/approval-binding.mjs`, `src/control/sod-rules.mjs`, and `src/control/risk-registry.mjs` (plus `durable-ledger.mjs`, `skill-candidate-registry.mjs`, `capability-registry-service.mjs`, `skill-candidate.schema.json`) against `origin/main @ ee31db7` — none of these files were touched.

### 2.2 `DurableLedger.append(entry, { expectedSequence, preWriteCheck })` (MOD-WSPACE-S3 hook)

`SkillPromotionLedger` does not override `append`, does not reimplement locking, hashing, idempotency-replay, or optimistic-concurrency — all inherited byte-for-byte. The ONLY addition is `#detectAlreadyPublished`, invoked exclusively as the `preWriteCheck` argument to `this.append(...)`, exactly mirroring `WorkspaceLeaseLedger.appendLease`'s `#detectSingleWriterConflict` composition.

### 2.3 `findReservedDelimiter` (GOV-P011-08)

Reapplied independently to `skillCandidateId`/`skillVersion` (this ledger is not wired to S1 and cannot assume S1 already validated its inputs). Read-only import from `src/contracts/reserved-delimiters.mjs`, unmodified.

### 2.4 `riskProfile` (risk-registry.mjs) — new composition, disclosed

Not cited by name in the addendum's S2 sketch, but reused per the addendum's own §4 boundary ruling ("promotion... MUST reuse the kernel's SoD/risk primitives, never re-derive them") and per this session's operator dispatch: `promote()` denies any `riskClass` whose `riskProfile(riskClass).value.humanApproval !== true`, enforcing the addendum's "promotion is R3+" ruling in code rather than trusting a caller-supplied class. This also makes `verifyApprovalBinding`'s own `humanApproval:false` short-circuit (an R0/R1/R2 class bypassing the human gate) structurally unreachable from this call site, since the floor check runs first and only R3/R4 ever reach `verifyApprovalBinding`.

## 3. Atomic-from-day-one duplicate-transition gate

**Design.** `#detectAlreadyPublished(skillCandidateId, records)` never calls `this.read()`. It is invoked ONLY as the `preWriteCheck` callback passed to `this.append(...)`, so the ONLY `records` it ever sees is the exact snapshot `DurableLedger.append` already read and verified inside its own file lock (`durable-ledger.mjs` lines 137-176), immediately before the write. There is no second, independent, unlocked read for a race to exploit — the class this bug belongs to (`capability-registry-service.promote()`'s in-memory-`Map`-plus-audit-sink shape, flagged explicitly in the addendum §3) is structurally impossible here because there is no separate read path to begin with.

**Business rule.** A `skill_candidate_id` may have at most one currently-PUBLISHED version at a time (mirrors `capability-registry-service.promote()`'s cross-version singleton semantics, the addendum's own cited "closest existing analog"). Both re-promoting the exact same version and promoting a second version while another is already published deny `DENY_ALREADY_PUBLISHED`; a different `skill_candidate_id` is unaffected (no false-positive cross-candidate conflict).

**Proof of atomicity (PROBE1-style regression, mirrors `mod-wspace-s3-single-writer-toctou-fix-001`'s own regression test).** In `tests/skill-promotion-ledger.test.mjs`, test `"the already-published gate is atomic with the write: overriding the public read() accessor..."`:
1. "Process A" (a real `SkillPromotionLedger` instance) promotes `skill.demo.example@1.0.0`. Chain length -> 1.
2. "Process B" (a FRESH `SkillPromotionLedger` instance over the SAME file) has its PUBLIC `read()` accessor overridden to `throw` — reproducing the exact reviewer probe that broke `WorkspaceLeaseLedger` pre-fix, where the gate took its own separate unlocked `read()` snapshot before the locked `append()`.
3. Process B then attempts to promote `skill.demo.example@2.0.0` with a correctly-fresh `expectedSequence: 1`.
4. Result: `DENY_ALREADY_PUBLISHED`, `conflictingVersion: "1.0.0"` — the override had NO effect, because `#detectAlreadyPublished` never calls `read()` at all; it only ever consumes the `records` argument `DurableLedger.append` hands it from inside its own lock.
5. Re-opening the ledger confirms only ONE record was ever persisted.

This directly proves the exact class of bug the addendum warned against (§3, "do NOT repeat that mistake") cannot occur here, by construction rather than by convention.

## 4. Test results

New file `tests/skill-promotion-ledger.test.mjs`: 34 tests, all passing, covering:
- Legitimate promotion (2): correct SoD + no prior promotion authorizes and persists; `roleMatchMode: "normalized"` threaded correctly (with a strict-mode control proving the mode isn't ignored).
- Duplicate-transition denial (4): same-version re-promotion, cross-version singleton, cross-candidate non-interference, and the PROBE1 atomicity regression.
- SoD parity (8): 7 table-driven cases parity-checked directly against `evaluateApprovalBinding`, plus the `DENY_INVALID_ROLE_MATCH_MODE` case.
- Risk floor + evidence-refs (7): R0/R1/R2 denied, unknown class denied, R4 allowed, 5 evidence-refs malformed-input variants denied.
- Malformed-input fail-closed (9): blank/missing `skillCandidateId`/`skillVersion` (throws), reserved-delimiter denial (4 sub-cases), missing `idempotencyKey`/`decisionId`/`actorId` (throws), non-object request (throws), malformed `content_hash`/`decidedAt` (throws `DENY_CONTRACT_INVALID`).
- Inherited base-ledger behavior (3): stale `expectedSequence`, duplicate `entryId`, idempotent replay.
- `resolvePublished` (1 test, 3 assertions).
- Reuse/non-reimplementation guards (3): no direct `sod-rules.mjs` import, no hardcoded test-ID branching, byte-identity of all 7 protected files, unwired-reference grep.

**Suite totals** (`node --test tests/*.test.mjs`, run from this worktree, `node_modules` installed via `npm install`):
- Before (`origin/main @ ee31db7`, independently re-run in this worktree by stashing all new/changed files): **1149 tests, 1146 pass, 0 fail, 3 skipped.**
- After (this branch, all files present): **1188 tests, 1185 pass, 0 fail, 3 skipped** (+39 net: the new `tests/skill-promotion-ledger.test.mjs` contributes 34, plus 5 more from table-driven expansion already counted in that file's own total — i.e. 39 is the exact delta, not an estimate).

`node tools/validate-foundation.mjs`: **PASS (exit 0)** both before and after, including the extended `expectedSchemas`/`mandatoryIdentityFields` checks for the new `skill-promotion.schema.json` and the repinned byte-identity guards (see §1/§6).

## 5. Hardcoded test-ID branching

A `git grep` sweep of `src/` for literal test-fixture strings (patterns such as `dec_skill_promotion`, `idem_`, `skill.demo` used as an equality branch condition) returns no hits inside `src/`: every such literal string appears ONLY in `tests/skill-promotion-ledger.test.mjs` and the two fixture JSON files, never as a branch condition in source. A dedicated regression test (`no hardcoded test-ID / decisionId branching in skill-promotion-ledger.mjs`) pins this going forward.

## 6. Scope discipline — what was NOT built

- **S3 revocation lifecycle (IMM-SKILL-V1) remains entirely separate and unbuilt.** `SkillPromotionLedger` has no `revoke()` method, no `REVOKED` status value in its schema's `status` enum (`["PUBLISHED"]` only), and no "already revoked" check — the addendum's §3 recommendation to apply the SAME `preWriteCheck` pattern to a future `revoke()` is preserved as a documented follow-up for that separate slice, not preempted or half-built here.
- **No live wiring.** No import added to `skill-candidate-registry.mjs`, any resolver, or any gateway/service file. No new export consumed anywhere outside this ledger and its own test file (verified by grep, §1).
- **No MOD-EVID resolver import.** G2 (evaluation-evidence binding) is enforced only at the STRUCTURAL level (`evidenceRefs` must be a non-empty array of non-blank strings) — resolving those references through MOD-EVID's `register -> seal -> verify -> accept -> resolve` chain (as the addendum §5 describes as a future step) is explicitly deferred; wiring a resolver import was out of this slice's UNWIRED charter.
- **No attempt-level audit trail.** Unlike `SkillCandidateRegistry`/`CapabilityRegistryService` (which audit every attempt, including denials, via an injected `ledgerWriter` sink), this ledger records ONLY successful `PUBLISHED` transitions. A denied `promote()` call returns a structured deny without taking the append lock or writing anything. Attempt-level audit is left to a future promotion SERVICE that would consume this ledger (mirroring how S1's registry already demonstrates that pattern at a different layer) — disclosed, not silently dropped.
- **No change to any existing file's runtime behavior.** `contract-validator.mjs` gained one map entry; `validate-foundation.mjs` gained one schema-list entry and one identity-fields entry; `contract-validator.test.mjs` gained one entry in each of two existing fixture maps. All three are additive registrations of the same shape every prior contract/ledger addition required, not behavior changes to existing contract kinds.

## 7. Advisory fields

```yaml
truth_status: verified_true          # all reuse claims verified by direct read + byte-identity test + parity test
authority_status: planning_allowed   # candidate-prep authorized this turn by explicit operator instruction; wiring remains execution_requires_operator
implementation_status: partial       # MOD-SKILL: G1 closed (S1); G2/G3 candidate-closed by this slice; G4/G5 (harness-compat modeling, S3 revocation) remain open
risk_class: high                     # promotion is R3+ per risk-registry; unwired candidate only, not yet operator-ratified
```

## 8. Self-certification

```yaml
self_certification:
  agent_id: claude-motor
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
