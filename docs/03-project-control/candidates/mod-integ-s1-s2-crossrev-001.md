# MOD-INTEG S1+S2 — Cross-Provider Immune Review 001

**Reviewer:** `claude-immune-crossrev-integ-01` (Claude, BST-SA Immune, advisory-only)
**Provider lane reviewed:** Codex-lane MOD-INTEG stack (S1 ledger + S1-FIX status gate + S2 collision-forecast)
**Target:** branch `origin/bst/mod-integ-queue-s2-collision-forecast`, tip `1dd13e1` (checked out detached)
**Base main:** `cc582e3` (19 schemas)
**Merge-base(target, main):** `ee31db7` (#80, 17 schemas)
**Review date:** 2026-07-22
**Scope:** cross-provider re-derivation of the 3 Codex own-review records — NOT a rubber-stamp.

Own-review records re-derived:
- `docs/03-project-control/candidates/mod-integ-queue-s1-ledger-independent-review-001.md` (S1-REV: APPROVE_WITH_NOTES)
- `docs/03-project-control/candidates/mod-integ-queue-s1-status-transition-fix-independent-review-001.md` (S1-FIX-REV: APPROVE_FOR_MERGE)
- `docs/03-project-control/candidates/mod-integ-queue-s2-collision-forecast-independent-review-001.md` (S2-REV: APPROVE_WITH_NOTES)

---

## Verdict

**REWORK_REQUIRED** — scoped strictly to a merge-readiness re-fold. The **code, design, and security of the slice are APPROVED**; the stack as committed at `1dd13e1` is **not mergeable into current main `cc582e3` as-is** and must be re-folded first.

- `truth_status`: verified_true
- `authority_status`: advisory_only
- `implementation_status`: partial (code complete; merge-readiness incomplete)
- `risk_class`: medium (merge-time governance-regression risk; the code itself is low-risk)

Rationale: the slice's ledger, status gate, forecast, schema, and primitive-reuse are all correct and independently reproduced (see below). But the branch is **stale**: its last fold was `main @ 4abfff2` (#66), predating two schemas that have since landed on main — `memory-record` (#97) and `skill-promotion` (#100). The branch therefore declares **18** schemas (17 -> 18), not the 20 a rebased stack would. A real 3-way merge into `cc582e3` produces **16 content conflicts** at exactly the schema-registration and byte-identity-guard points. Merging without a careful re-fold risks silently dropping the `memory-record`/`skill-promotion` registrations from `validate-foundation`'s fail-closed set — a governance regression an immune gate must not wave through. The required rework is mechanical and touches **no** ledger/forecast/schema logic.

---

## 1. Schema registration + count

- `integration-queue-entry` is registered in all three required points, verified against the merge-base `ee31db7`:
  - `src/contracts/contract-validator.mjs` `schemaPaths.integrationQueueEntry` (+1 entry)
  - `tools/validate-foundation.mjs` `expectedSchemas` (+1) and `mandatoryIdentityFields` (+1: `queue_entry_id, version, project_id, work_package_id, session_id, candidate_branch, status, content_hash`)
  - `supportedContractKinds()` includes `integrationQueueEntry`
- **Count is 18, not 20.** `supportedContractKinds().length === 18`. `npm run validate` reports "7 canonical bootstrap schemas + 11 governed extensions" = 18. The branch is internally consistent as a **17 -> 18** change on top of its merge-base, but it never folded in the `memory-record` + `skill-promotion` additions that took current main to 19. The task's "19 -> 20 / supportedContractKinds()==20" premise assumed a rebased stack; this branch is not rebased.
- **No OTHER schema touched.** Blob-check of all 17 shared schemas at `1dd13e1` vs `cc582e3`: every one IDENTICAL; only `integration-queue-entry.schema.json` is new. (`memory-record` and `skill-promotion` are main-only additions absent from this stale branch — the source of the merge conflict, not a deletion by this branch.)
- Schema shape verified: closed (`additionalProperties: false`), all 13 required fields, `candidate_tip_commit`/`content_hash` regex-pinned, `status` enum-restricted to `SUBMITTED|IN_REVIEW|MERGED|REJECTED`, `declared_write_set` `minItems: 1`.

## 2. Repin audit (S2 fold repinned 3 byte-identity guards)

The fold commit `1dd13e1` repinned the `contract-validator.mjs` pin in three guards:
`tests/conformance-p0-18-candidate.test.mjs`, `tests/conformance-v016-drift.test.mjs`, `tests/p0-19-self-pilot.test.mjs`.

- Each now pins `src/contracts/contract-validator.mjs` -> `3481c101f1fa3233850c0b64d1e45ada3b943668`, which **equals the actual blob at `1dd13e1`** (the S1-authorized, `integrationQueueEntry`-registered version). Authorized-blob swap only.
- **No assertion dropped:** each guard still pins every other composed primitive to its own (unchanged) hash; the full suite passes, proving all pins are self-consistent.
- **Tamper spot-check bites:** appending a comment to `contract-validator.mjs` and running `tests/p0-19-self-pilot.test.mjs` fails the byte-identity guard (`must be blob-identical to main @ 385ac65`); file restored clean. Ruling: repins are honest and the guard still enforces.

## 3. IntegrationQueueLedger (DurableLedger subclass) + status gate TOCTOU

- `IntegrationQueueLedger extends DurableLedger`; base reused **byte-identical** (`durable-ledger.mjs` blob `6be08fc…` identical at `1dd13e1` and `cc582e3`). Hash-chain, idempotency replay, optimistic concurrency, duplicate-entryId dedup, writer lock all inherited unmodified.
- **Both business gates run inside the lock via `preWriteCheck`.** `appendEntry` calls `this.append(…, { preWriteCheck })`; `#detectInvalidStatusTransition` and `#detectDuplicateClaim` consume ONLY the `records` parameter the base hands them inside the critical section — **neither calls `this.read()`**. No independent read -> no TOCTOU. Mirrors the WSPACE-S3 / SKILL-S2 fix shape. (The read-path methods `resolveActiveClaim`/`resolveEntry` do call `this.read()`, but they are pure queries, not the write gate — correct.)
- Deny-by-default: structural problems throw typed `LedgerError`; the two business rules return frozen `{ ok:false, code }`. Append-only preserved (versioned records; terminal MERGED/REJECTED accept no further version).
- Atomic single-read snapshot via `structuredClone` (`snapshotEntry`), consumed once by validate + both gates + record-builder, so a value-varying/hostile getter cannot make the stored record differ from the gated record; fail-closed to `DENY_QUEUE_ENTRY_MALFORMED`.

## 4. Collision-forecast (S2)

- `forecastCollision(candidateWriteSet, records)` imports `evaluateOverlap` + `OVERLAP_ORDER` from `overlap-policy.mjs` (blob `5cb2f20…` **byte-identical** to `cc582e3`), **read-only**. No path-containment, O-ladder, or doctrine logic re-implemented; every `evaluateOverlap` result field is threaded straight through.
- Pure, unwired (NOT called from any live path or from `preWriteCheck`), deep-frozen outputs.
- Fail-closed: invalid/empty candidate -> `DENY_FORECAST_INVALID_CANDIDATE`; non-array records -> `DENY_FORECAST_MALFORMED_RECORDS`; outer try/catch degrades any hostile-getter/Proxy throw to a frozen denial.
- Honest, disclosed capability limit: with only `declared_write_set` available, the forecast can surface O0 or O2 only (never O1/O3/O4/O5, which need module/symbol/branch/config metadata this contract does not carry). This is a disclosed scope limit, not a silent one. Concur.

## 5. Byte-identity of composed primitives vs `cc582e3`

All IDENTICAL (git blob hashes): `durable-ledger.mjs` `6be08fc…`, `overlap-policy.mjs` `5cb2f20…`, `write-set-policy.mjs` `5f1e119…`, `sod-rules.mjs` `4ffbc20…`. The stack composes ratified primitives without mutating any. Nothing live consumes the queue (unwired candidate).

## 6. Independent adversarial re-derivation (20/20 reproduced)

Ran an out-of-tree harness importing the real modules. All passed:
- Queue-entry denies: non-object -> `DENY_QUEUE_ENTRY_MALFORMED`; missing `queue_entry_id` -> contract throw; missing idempotencyKey -> `DENY_MISSING_ENTRY_FIELDS`; smuggled `additionalProperties` key rejected by closed schema.
- Invalid status transitions: v1 non-`SUBMITTED` (`MERGED`) -> `DENY_INVALID_STATUS_TRANSITION` (`fromStatus:null`); `SUBMITTED`->`MERGED` skip -> denied; terminal walk-back `MERGED`->`IN_REVIEW` -> denied (terminal forever); legal `SUBMITTED->IN_REVIEW->MERGED` -> allowed.
- Duplicate-claim: two ids, same branch, both active -> `DENY_QUEUE_DUPLICATE_CLAIM`; second entry allowed once first resolves (`MERGED` frees branch).
- Collision forecast: two overlapping candidates -> `collides:true, mostRestrictiveClass:"O2"`; disjoint -> O0/`collides:false`; MERGED entry excluded (active-only); empty candidate & non-array records fail closed; hostile getter on a record -> frozen denial, no throw.
- Adversarial: `__proto__` payload does not pollute `Object.prototype`; hostile throwing getter on `candidate_branch` -> `DENY_QUEUE_ENTRY_MALFORMED` (never uncaught); idempotent same-key replay -> `replayed:true` (no double-write); resolved entry deep-frozen.

## 7. Regression (measured)

- `npm test`: **tests 1198 / pass 1195 / fail 0 / skipped 3**, exit 0.
- `npm run validate`: **exit 0**, `schemas.count` PASS reporting **18** schemas ("7 canonical + 11 governed").
- `npm ci`: clean.

## 8. Merge-cleanliness vs `cc582e3` — NOT CLEAN

`git merge-tree --write-tree cc582e3 1dd13e1` returns non-zero with **16 CONFLICT (content)** files, including:
`src/contracts/contract-validator.mjs`, `tools/validate-foundation.mjs` (schema-registration collision: main added `memory-record`+`skill-promotion`, branch added `integration-queue-entry`, at overlapping lines), `MANIFEST.json`, `docs/03-project-control/candidates/module-completion-tracker-001.md`, and the byte-identity guard test files (`conformance-p0-18-candidate`, `conformance-v016-drift`, `p0-19-self-pilot`, `overlap-policy.test`, `write-set-policy.test`, `contract-validator.test`, `workspace-lease-ledger.test`, `cadence-policy.test`, `event-family-policy.test`, `kpi-registry.test`, `replay-assembler.test`, `scorecard-assembler.test`) whose `contract-validator` pin differs between the two lineages.

This is **not** "clean modulo MANIFEST/tracker unions." The correct merged state is **20** schemas (17 base + `memory-record` + `skill-promotion` + `integration-queue-entry`); neither side declares it, so a manual re-fold is mandatory to reconcile `expectedSchemas`/`schemaPaths`/`mandatoryIdentityFields`/`supportedContractKinds` to 20 and repin the byte-identity guards to the post-fold `contract-validator` blob.

## Required rework (bounded, no logic change)

1. Fold current main `cc582e3` into the branch (union), producing 20-schema registration across all four points.
2. Repin the byte-identity guards' `contract-validator.mjs` pin to the post-fold blob (its hash will change again once `memory-record`+`skill-promotion` registrations are present alongside `integration-queue-entry`).
3. Re-run `npm run validate` and confirm "7 canonical + 13 governed" = 20; re-run `npm test`.

No change to `integration-queue-ledger.mjs`, `integration-collision-forecast.mjs`, or `integration-queue-entry.schema.json` is required or recommended.

---

## Agreement with the 3 own-reviews

**Agree with all three** on the code, and independently reproduced every material claim with no discrepancy:
- **S1-REV (APPROVE_WITH_NOTES):** concur; the disclosed status-transition gap was real and was correctly closed by S1-FIX.
- **S1-FIX-REV (APPROVE_FOR_MERGE):** concur on the fix's correctness — the gate fails closed on unrecognized `from`-status (`VALID_STATUS_TRANSITIONS[x]` undefined -> falsy), transitions run atomically inside the lock, terminal states are terminal. Note: "APPROVE_FOR_MERGE" was accurate **at that slice's fold point**; it predates the current main and does not speak to merge-readiness vs `cc582e3`.
- **S2-REV (APPROVE_WITH_NOTES):** concur; pure, honestly-scoped forecast, genuine `overlap-policy` delegation, zero bytes of the S1 ledger touched. The duplicated-reduction drift note and unbounded-scaling note are valid pre-wiring items.

**Added cross-review finding the own-reviews could not see:** staleness vs the newer main (`memory-record` #97, `skill-promotion` #100 landed after this stack's merge-base). This is why my overall disposition is REWORK_REQUIRED (merge-readiness) rather than an unqualified approve — the code is sound; the branch must be re-folded before it can merge.

---

## self_certification

```yaml
self_certification:
  agent_id: claude-immune-crossrev-integ-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

Advisory only. This review does not merge, approve, or authorize merge; it is a local commit on `claude/rev/integ-crossrev`, no push. Restricted execution remains blocked; the operator/governance retains merge authority. A re-fold onto `cc582e3` is the recommended precondition to any merge decision.
