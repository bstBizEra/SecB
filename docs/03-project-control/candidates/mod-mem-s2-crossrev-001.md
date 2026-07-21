# MOD-MEM S2 Memory-Record Contract — Cross-Provider Immune Review

- Reviewer: `claude-immune-crossrev-mem-s2-01` (BST-SA Immune, Claude / cross-provider vs Codex-lane candidate)
- Review type: CROSS-PROVIDER independent security/governance review (advisory only)
- Target branch: `origin/bst/mod-mem-s2-memory-record-contract`
- Target tip: `00c7212` (code commit `2e4595f`)
- Base main: `bd00c53` (current); merge-base with branch: `ee31db7`
- Timestamp: 2026-07-21T17:41:55Z

## Verdict: APPROVE_WITH_NOTES

The candidate is correct, in-scope, fail-closed, and regression-clean. The byte-identity
guard repins are legitimate and were tamper-verified as still-effective. The single reason
this is APPROVE_WITH_NOTES rather than APPROVE_FOR_MERGE is a **mandatory merge-sequencing
obligation** (below) — a coordinator action, not a defect in the candidate. No blocking
defect found.

---

## 1. Schema-registration ruling: CORRECT

`src/contracts/contract-validator.mjs` adds exactly one line to `schemaPaths`
(`memoryRecord: "memory-record.schema.json"`) — no other primitive logic touched.
`tools/validate-foundation.mjs` adds `memory-record` to three structures in lockstep:

- `expectedSchemas[]` (now 18; set-equality guard is preserved — fail-closed on any
  unexpected addition OR missing canonical schema).
- `mandatoryIdentityFields{}` — memory-record entry:
  `[memory_record_id, version, project_id, work_package_id, session_id, actor_id, layer,
  source, classification, valid_from, valid_until, content_hash]`, a true subset of the
  schema's own `required`.
- The count-assertion comment updated 10→11 governed extensions (7 bootstrap + 11 = 18).

Verified at runtime:
- `supportedContractKinds().length === 18`, and `includes("memoryRecord") === true`.
- `node tools/validate-foundation.mjs` → exit 0, `schemas.count` PASS.
- `npm run validate` → exit 0.

## 2. Byte-identity guard repin audit: CLEAN — no assertion or path dropped/loosened

The registration legitimately changed two guarded blobs:
`tools/validate-foundation.mjs` `d0ba1e92…` → `aa8f6038…` and
`src/contracts/contract-validator.mjs` `c3b37776…` → `c1756309…`.
Both current-file hashes were confirmed by `git hash-object` to equal the new pinned values.

Repins across 8 test files were audited; every one ONLY swaps the expected blob to the new
authorized value (and updates the explanatory comment). None dropped or loosened an
assertion or a guarded path:

- `tests/cadence-policy.test.mjs` — validate-foundation pin repinned.
- `tests/scorecard-assembler.test.mjs` — validate-foundation pin repinned.
- `tests/kpi-registry.test.mjs` — validate-foundation pin repinned.
- `tests/overlap-policy.test.mjs` — validate-foundation pin repinned.
- `tests/replay-assembler.test.mjs` — validate-foundation `PINNED_BLOBS` entry repinned.
- `tests/write-set-policy.test.mjs` — validate-foundation pin repinned.
- `tests/event-family-policy.test.mjs` — validate-foundation `PINNED_BLOBS` entry repinned.
- `tests/conformance-p0-18-candidate.test.mjs` — contract-validator `PINNED_BLOBS` repinned.
- `tests/conformance-v016-drift.test.mjs` — contract-validator `PINNED_BLOBS` repinned.
- `tests/p0-19-self-pilot.test.mjs` — contract-validator `PINNED_BLOBS` repinned.
- `tests/workspace-lease-ledger.test.mjs` — the "every OTHER schema unchanged" loop gained
  one exclusion (`memory-record.schema.json`). This is **necessary, not a weakening**: the
  file postdates that guard's BASE and cannot be diffed against a commit where the path does
  not exist. All 17 pre-existing schemas remain guarded byte-identical; the new file's
  additive-only nature is proven by `contract-validator.test.mjs` coverage.

**Tamper spot-check (independent):** appended a byte to `tools/validate-foundation.mjs` and
ran `tests/cadence-policy.test.mjs` → the byte-identity guard FAILED as designed
(`pass 39 / fail 1`); tree restored to blob `aa8f6038…`. The repin still catches unrelated
unauthorized drift — it was moved, not defeated.

## 3. Existing-schema byte-identity: ALL 17 IDENTICAL to base

Every pre-existing `contracts/*.schema.json` (agent-registration, capability-record,
checkpoint, context-receipt, decision-record, delegation-request, event-envelope,
evidence-envelope, goal, handoff-envelope, knowledge-claim, outcome-receipt,
project-contract, skill-candidate, skill-manifest, work-package, workspace-lease) was
confirmed `git hash-object`-identical to `bd00c53`. No other schema was touched.

## 4. Contract shape: closed, identity-bearing, deny-by-default

- `additionalProperties: false` at top level AND on nested `provenance` object.
- 17 required fields incl. full identity tuple + `content_hash` (`^[a-f0-9]{64}$`),
  `confidence` bounded [0,1], `layer`/`source`/`classification` closed enums,
  `provenance.evidence_refs` `minItems: 1`. `supersedes` is the only optional field.
- Valid fixture round-trips through `validateContract` (parametrized suite passes).
- Invalid fixture (`memory-record-missing-id.json`) drops `memory_record_id` → correctly
  rejected by the `required` set. Deny-by-default on malformed confirmed.

## 5. Scope ruling: IN SCOPE (apparent extra changes are merge-base artifacts)

The branch's TRUE footprint (`ee31db7..00c7212`, 2 commits) is: the schema, its
registration (+1 src line in contract-validator only — confirmed the ONLY `src/*` touch),
fixtures, producer-verification, its own independent review (APPROVE_FOR_MERGE), the guard
repins, and a **single append-only entry** to `module-completion-tracker-001.md` (extend-only
compliant).

The two-dot diff `bd00c53..00c7212` additionally shows `p0-20-governance-decision-packet-001.md`
edits and a `session-summary-2026-07…md` deletion. These are **NOT branch changes** — they
are main's own later commits (session-summary #93, tracker reconciliation #86/#87, p0-20
citation #83) that the branch simply predates. The branch does not touch those files.

Unwired confirmed: no `src/` path consumes memory records beyond the validator registration.
The schema is registered but dormant — the disclosed, sound decision not to reshape S1's
closed `MemoryGatewayService` admission envelope (an R3-scoped change) is honored.

## 6. Regression + merge sequencing

- Full suite (`npm test`): **tests 1149 / pass 1146 / fail 0 / skipped 3** — exact match to
  the producer's self-report.
- `node tools/validate-foundation.mjs` exit 0; `npm run validate` exit 0; 18 schemas.
- **Merge-cleanliness vs current main (`bd00c53`):** `git merge-tree` reports conflicts on
  `MANIFEST.json` and `docs/.../module-completion-tracker-001.md` (both from divergence, not
  from `src`). `contract-validator.mjs` / `validate-foundation.mjs` do NOT conflict with
  current main. A rebase onto current main resolves these deterministically (re-append the
  MOD-MEM manifest lines + tracker entry after main's reconciled content).

### NOTE (blocking on process, not on candidate) — MUST be merge-SEQUENCED with SKILL-S2

SKILL-S2 also adds a schema and edits the SAME three files
(`contract-validator.mjs`, `validate-foundation.mjs`, `MANIFEST.json`). If SKILL-S2 lands
first:
1. The schema count must become **19**, and `schemaPaths` / `expectedSchemas` /
   `mandatoryIdentityFields` must carry BOTH additions.
2. **Every byte-identity repin in this branch becomes STALE** — the pinned blobs
   `aa8f6038…` (validate-foundation) and `c1756309…` (contract-validator) assume
   memory-record is the ONLY addition. Post-SKILL-S2 both files change again, so all 11
   repinned call sites must be RE-pinned to the post-both-schemas blob or the guards will
   false-fail. Coordinator must handle this re-pin during sequencing.

## Minor observation (non-blocking)

The branch's own independent-review doc
(`mod-mem-s2-memory-record-contract-independent-review-001.md`) is not listed in
`MANIFEST.json`. This is consistent with existing practice (only 5 of 15 review docs on disk
are manifested) and the validator passes without it (exit 0). No action required.

---

```yaml
advisory:
  truth_status: verified_true
  authority_status: execution_requires_operator
  implementation_status: existing        # schema registered + fixtures + guards; unwired by design
  risk_class: low
  verdict: APPROVE_WITH_NOTES
  repin_audit: clean_not_weakened        # tamper-verified guard still fails on unrelated drift
  schema_registration: correct_18_schemas
  existing_17_schemas: byte_identical_to_base
  suite: "1149/1146/0/3"
  validator_exit: 0
  merge_sequencing: required_with_SKILL_S2   # coordinator must re-pin guards + count 18->19 if SKILL-S2 lands first
```

```yaml
self_certification:
  agent_id: claude-immune-crossrev-mem-s2-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
