# MOD-SKILL S2 — Governed Promotion — Cross-Provider Review

**Record ID:** mod-skill-s2-crossrev-001
**Status:** ADVISORY — NOT EFFECTIVE (no merge/execution authority)
**Reviewer:** `claude-immune-crossrev-skill-s2-01` (BST-SA Immune, Claude provider — CROSS-PROVIDER review of a Codex-lane-produced candidate)
**Date:** 2026-07-22
**Branch reviewed:** `bst/mod-skill-s2-governed-promotion` @ tip `6001955d6ac02bacea1f0392a711a1ee2d018a1f` (detached checkout)
  - code commit `5172657` (`[MOD-SKILL-S2]`), own independent review `42053aa` (`APPROVE_FOR_MERGE`), tip `6001955` merges `origin/main` @ `a90b46f`
**Base:** `main` @ `bd00c53ad88cf195830609fd6db7e5582391b684` (current `origin/main`)
**True merge-base(branch, main):** `a90b46f` (PR #83) — branch predates current main; net scope measured against this base
**Producer record reviewed:** `docs/03-project-control/candidates/mod-skill-s2-governed-promotion-producer-verification-001.md`
**Own independent review reviewed:** `docs/03-project-control/candidates/mod-skill-s2-governed-promotion-independent-review-001.md` (verdict `APPROVE_FOR_MERGE` @ `5172657`)
**Design context:** `docs/03-project-control/candidates/mod-skill-gap-assessment-001-addendum-001.md` (§3/§4/§5, unmerged, branch `bst/mod-skill-s2-design-addendum-001`)
**Worktree:** isolated worktree `agent-acaab88c5560da35a`; `npm ci` run; no primary-checkout or other-worktree access; no push, no merge.

---

## Verdict

**APPROVE_WITH_NOTES**

The candidate is technically clean and its two headline safety claims hold under independent cross-provider verification: (1) `SkillPromotionLedger` is a `DurableLedger` subclass that reuses the base class **byte-identically** (blob `6be08fc` on both branch tip and main — the `preWriteCheck` hook it depends on already exists in the base, inherited unmodified from the MOD-WSPACE-S3 fix), and (2) all N-5 separation-of-duties is **fully delegated** to the reused, untouched `src/control/approval-binding.mjs` — this slice contains zero pairwise-distinctness, self-approval, or role-matching math of its own. Schema registration is exactly +1 (17→18); no other schema is touched. The 10 byte-identity guard repins are clean and all bite on tamper. Full suite `1188/1185/0 fail/3 skip`; `validate-foundation` exit 0.

The verdict is `APPROVE_WITH_NOTES` (not `APPROVE_FOR_MERGE`) for **merge-mechanics reasons only, not candidate defects**:

1. **Mandatory merge-sequencing vs MEM-S2 (coordinator-owned).** Both this candidate and MEM-S2 add a new contract schema **and** edit the same regions of `src/contracts/contract-validator.mjs` (`schemaPaths`) and `tools/validate-foundation.mjs` (`expectedSchemas` array + the `schemas.count` assertion string + `mandatoryIdentityFields`). Whichever lands second will textually conflict on those shared regions and must (a) bump its schema count `18→19`, (b) re-pin the `validate-foundation.mjs` byte-identity pins (7 test files) and the `contract-validator.mjs` byte-identity pins (3 test files) to the NEW post-first-merge blobs, and (c) resolve the MANIFEST/tracker append-region conflicts. These two cannot both fast-forward; a coordinator must sequence them.

2. **Branch is stale vs current main and does not merge clean as-is.** `git merge-tree bd00c53 6001955` reports content conflicts in `MANIFEST.json` and `docs/03-project-control/candidates/module-completion-tracker-001.md` — both pure append-region collisions caused by main advancing (PR #93 et al.) after the branch's merge-base `a90b46f`. Standard coordinator rebase/append-merge; no semantic conflict in code today, but see note 1 for the code-level conflict that appears the moment MEM-S2 lands first.

Neither note is a candidate defect; both are coordination-time mechanics the coordinator owns. Wiring remains `execution_requires_operator` — this is a primitive/candidate review, not a production-wiring approval.

---

## 1. Scope + regression

- **Net scope vs true merge-base `a90b46f`:** 23 files, all candidate-declared (schema, ledger, contract-validator, validate-foundation, MANIFEST, 2 review docs, tracker line, fixtures, and the byte-identity repins). No stray source touched. The `session-summary-…` deletion that appears in a naive `bd00c53..6001955` diff is **not** a candidate change — it is main-side-only content the branch (based on older `a90b46f`) never had; it will not be deleted by a real merge.
- **Full suite (my run, `npm test`):** `tests 1188 / pass 1185 / fail 0 / skipped 3`. Exact match to the producer's and the own-independent-review's claimed totals.
- **New ledger suite (`tests/skill-promotion-ledger.test.mjs`):** `39/39 pass, 0 fail`.
- **`npm run validate`:** exit `0`, top-level `PASS`, zero `FAIL` entries.
- **Schema count:** `contracts/*.schema.json` = 18 files; `validate-foundation` `schemas.count` assertion updated `10→11 governed extensions` / count `17→18`; PASS.

## 2. DurableLedger reuse — byte-identity ruling

**PASS — base reused byte-identically.**
- `src/ledger/durable-ledger.mjs` blob at branch tip `6be08fc14ff31a7c871c5e86888af42285d40529` == blob at main `bd00c53`. Not in the candidate diff. Hash-chain (`#verifyRecords`), idempotency (`idempotencyKey` replay + `DENY_IDEMPOTENCY_CONFLICT`), duplicate-entryId, OCC (`expectedSequence`/`DENY_SEQUENCE_CONFLICT`), and fail-closed lock (`mkdirSync` mutex, `finally` release) are all **inherited unmodified**.
- `SkillPromotionLedger.promote()` takes the append lock exactly once via the inherited `append()`; the "already PUBLISHED" duplicate-transition gate runs as the `preWriteCheck(records)` hook **inside** that lock, against the same freshly-read+verified `records` snapshot — `#detectAlreadyPublished` never calls `this.read()`, so there is no second, independent, overridable read for a TOCTOU race to exploit (mirrors the MOD-WSPACE-S3 single-writer fix pattern). Structural/malformed input **throws** before any lock; SoD/evidence/risk denials return a structured deny without taking the lock. Deny-by-default and fail-closed throughout.

## 3. SoD-on-promotion ruling

**PASS — governed, fully reused, pairwise-distinct.**
- `src/control/approval-binding.mjs`, `src/control/risk-registry.mjs`, `src/contracts/reserved-delimiters.mjs` are **all untouched** by this slice (confirmed empty diff).
- `promote()` enforces the governed transition via three independent calls into the reused primitive: `evaluateApprovalBinding` (one independent-review + one governance approval, **pairwise-distinct from each other and from the producer**, with a dedicated self-approval deny), then `bindApprovalDecision` binding the decision to the exact `PROMOTE_SKILL@${skillCandidateId}@${skillVersion}`, then `verifyApprovalBinding` re-verifying that exact action+version+riskClass before anything is written (MR-3-class replay defense — mint and verify are two separate calls, not one trusted round-trip).
- **R3+ floor is enforced before the verify call:** `promote()` denies `DENY_RISK_CLASS_BELOW_FLOOR` unless `riskProfile(riskClass).humanApproval === true`. This makes the `humanApproval:false` short-circuit inside `verifyApprovalBinding` structurally unreachable from this call site — a caller cannot downgrade risk to bypass the human gate.
- **GOV-P011-08 reapplied independently:** `findReservedDelimiter` rejects `@` in either id component before the composite `boundObjectVersion` is built, so no component split can masquerade as a different `(candidate, version)` pair. Applied here even though S1 also applies it, because this ledger is unwired to S1 and cannot assume upstream validation.
- Disclosed, candidate-appropriate scope choices (all in the producer/independent records, none blocking an UNWIRED slice): denial-audit is not written to a separate attempt sink (only successful PUBLISHED writes are durable); `evidence_refs` is validated structurally only, not resolved through MOD-EVID's chain; `risk_class` schema enum is permissive `R0–R4` while the runtime floor is R3+ (correct layering — the floor is a `promote()` business rule, not a schema constraint). Revocation (S3/IMM-SKILL-V1) is explicitly out of scope; no `revoke()` exists, which is why a second promotion of any version can never succeed today.

## 4. Repin audit

**PASS — 10 repins, all clean, all bite on tamper.**
- **`validate-foundation.mjs` repins (7 files):** `cadence-policy`, `kpi-registry`, `overlap-policy`, `scorecard-assembler`, `write-set-policy`, `event-family-policy`, `replay-assembler` — old pin `d0ba1e92…` (post-WSPACE-S3) → new `ec86c066aef9a77ee4b65eef45dbe6339a9110b6`, which **equals** the actual tip blob (`git hash-object tools/validate-foundation.mjs`).
- **`contract-validator.mjs` repins (3 files):** `conformance-p0-18-candidate`, `conformance-v016-drift`, `p0-19-self-pilot` — old pin `c3b37776…` → new `527f3fd5b4b552483d5b5b53408f90d7c7ce7f8b`, which **equals** the actual tip blob.
- Old pins `d0ba1e92…` / `c3b37776…` appear **nowhere** in `tests/` after the change (fully replaced, no stale duplicate pin left behind).
- Each repin changed only the pinned blob value + its disclosure comment; **no assertion was dropped or weakened**, and the surrounding guard structure (guarded file lists, byte-identity loops, sanity checks) is intact.
- `tests/workspace-lease-ledger.test.mjs` adds one exclusion (`skill-promotion.schema.json`) to its "all OTHER schemas unchanged" guard — the correct additive treatment already given to its own `workspace-lease.schema.json`; every other schema remains byte-identity-guarded.
- **Tamper spot-check:** appended a probe byte to `validate-foundation.mjs`; the `kpi-registry` byte-identity guard **failed** with `validate-foundation.mjs pinned to its post-MOD-SKILL-S2 blob` (1 fail). Restored to `ec86c066…`. Guard confirmed live, not vestigial.

## 5. Schema registration + count

**PASS — exactly +1, no other schema touched.**
- `contract-validator.mjs`: `schemaPaths` gains `skillPromotion: "skill-promotion.schema.json"` (only line added).
- `validate-foundation.mjs`: `expectedSchemas` +1; `schemas.count` assertion `17→18`; `mandatoryIdentityFields` gains the `skill-promotion` identity set (`decision_id, version, project_id, work_package_id, session_id, actor_id, skill_candidate_id, skill_version, content_hash`). Set-equality guard stays fail-closed.
- `contract-validator.test.mjs`: valid/invalid fixture maps gain the `skillPromotion` pair; fixtures `tests/fixtures/valid/skill-promotion.json` + `tests/fixtures/invalid/skill-promotion-missing-id.json` added.
- Schema is closed (`additionalProperties: false`), `status` enum `["PUBLISHED"]`, `content_hash` `^[a-f0-9]{64}$`, `evidence_refs` `minItems: 1`.

## 6. Merge cleanliness + MEM-S2 sequencing note

- **`git merge-tree bd00c53 6001955`:** content conflicts in `MANIFEST.json` and `module-completion-tracker-001.md` (append-region only; caused by main advancing past `a90b46f`). No code conflict vs main **today**.
- **MEM-S2 collision (FLAG):** MEM-S2 also adds a schema + edits `contract-validator.mjs` `schemaPaths` and `validate-foundation.mjs` `expectedSchemas`/`schemas.count`/`mandatoryIdentityFields`. These are the **same regions** this candidate edits → the second to merge will conflict on those code lines, must bump count `18→19`, and must re-pin all 10 byte-identity pins to the new post-first-merge blobs. **Must be merge-SEQUENCED; coordinator owns the ordering + the second-lander rebase.** This flag is the primary reason for `APPROVE_WITH_NOTES`.

---

## Authority + self-certification

- This record is advisory only. It does not merge, does not wire, does not authorize execution. It does not weaken any gate; the tamper spot-check confirms the byte-identity guards remain live.
- Restricted actions (merge, wiring the ledger into a live promotion path, production declaration) remain `execution_requires_operator`.

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: candidate
risk_class: medium

self_certification:
  agent_id: claude-immune-crossrev-skill-s2-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

**Provenance:** source — cross-provider immune review of `bst/mod-skill-s2-governed-promotion` @ `6001955` in isolated worktree `agent-acaab88c5560da35a`; base `main` @ `bd00c53`; timestamp 2026-07-22; agent `claude-immune-crossrev-skill-s2-01` (Claude Fable).
