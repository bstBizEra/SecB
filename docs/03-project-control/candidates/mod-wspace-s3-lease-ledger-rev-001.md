# MOD-WSPACE Slice S3 — Workspace-Lease Durable Record + WorkspaceLeaseLedger — Independent Immune Review REV-001

- reviewer_identity: `claude-immune-rev-wspace-s3-01`
- team_id: BST-SA
- role: immune (security / governance / authority-boundary review — advisory only)
- review_target_branch: `bst/mod-wspace-s3-lease-ledger`
- review_target_commit: `da36c50` (`da36c503c7ba9c631931fd6c609983e820a54ec2`)
- base: `main` @ `0c0f3d2` (`0c0f3d2882402a172d3252667c7abea7b42c4537`) — target's direct parent
- review_branch: `claude/rev/wspace-s3-001` (cut FROM `da36c50`)
- timestamp: 2026-07-21T08:28:06Z
- method: first-hand. Isolated worktree; `npm ci`; full suite + foundation validator measured directly at `da36c50`; every changed file diffed against base; byte-identity of shared infra verified by `git rev-parse`/`git diff`; independent fail-closed probe harness run in-tree (never committed) with fresh vectors; a live tamper probe run against the repinned guards in a scratch mutation.

## Verdict

**APPROVE_FOR_MERGE.**

No BLOCKER / HIGH / MEDIUM findings. Three LOW advisories (below), none merge-blocking. The slice is a clean, self-contained additive durable-record primitive. All shared infrastructure (DurableLedger, the 16 pre-existing schemas, the MCP gateway, the S1/S2 policy primitives) is byte-identical to base. The 7 repinned sibling guards are legitimately repinned and demonstrably still fail-closed on unrelated drift. resolveActiveLease and the single-writer gate are correctly fail-closed in every probed direction.

## 1. DurableLedger reuse — CLEAN

- `src/ledger/durable-ledger.mjs` is **byte-identical** to base (`git diff 0c0f3d2 da36c50 -- src/ledger/durable-ledger.mjs` = 0 lines). Hash-chain (`#verifyRecords`), idempotency-key replay + conflict, optimistic concurrency (`expectedSequence`), duplicate `entryId` rejection, and writer-lock are inherited UNMODIFIED.
- `WorkspaceLeaseLedger extends DurableLedger` mirrors `CheckpointLedger` exactly: constructor passes a fixed `ledgerId` (`secb-workspace-lease-ledger`); `appendLease` calls `validateContract` then delegates to base `append(...)`. It adds only (a) an atomic single-read `snapshotLease` (via `structuredClone`), and (b) the single-writer gate. It does NOT reimplement or weaken any base-class invariant. Confirmed by reading both `checkpoint-ledger.mjs` and `durable-ledger.mjs` in full.

## 2. The 7 repinned byte-identity guards — CLEAN (no weakening)

Ruling: **CLEAN — legitimate repin, no assertion removed or loosened.**

- The authorized new blob for `tools/validate-foundation.mjs` is `d0ba1e920f295b7522cb7561c2f9e3bfda2093ce`, which is the **actual** `git rev-parse da36c50:tools/validate-foundation.mjs`. Base blob was `082638c16e0c158d01e61ac067d60f0847633895`. The repin tracks a genuine, authorized change (16→17 schema registration, G6).
- Two mechanisms, both preserving coverage:
  - **PINNED_BLOBS object** (`event-family-policy`, `replay-assembler`): the `tools/validate-foundation.mjs` **key remains**; only its expected value moved `082638c1 → d0ba1e92`.
  - **Loop array + explicit pin** (`cadence-policy`, `kpi-registry`, `overlap-policy`, `scorecard-assembler`, `write-set-policy`): `validate-foundation` was removed from the base-comparison loop (it now legitimately differs from base, so a base-equality loop entry would false-fail) and **replaced with an explicit `assert.equal` against the new blob** `d0ba1e92`. Net effect: the file is still hard-guarded, against the correct authorized value.
- **No other guarded path was dropped or loosened** in any of the 7 files. Verified mechanically: for each file, the set of removed diff lines that are neither the `validate-foundation` entry nor the old `082638c1` value is EMPTY.
- **Tamper still fails-closed (live probe).** In a scratch mutation I appended a comment to `tools/validate-foundation.mjs` (blob → `607b2c49…`) and ran both a loop-array guard (`scorecard-assembler`) and a PINNED_BLOBS guard (`replay-assembler`): **both FAILED** on the byte-identity assertion (`validate-foundation.mjs pinned to its post-MOD-WSPACE-S3 blob` / `blob differs`). Restored to `d0ba1e92`; tree clean. The repin narrowed the guard's expected value, not its reach.

## 3. 16→17 registration — CLEAN

- `contract-validator.mjs` `schemaPaths` gains exactly one key, `"workspace-lease"`. No other key changed.
- `supportedContractKinds()` returns **17** and includes `workspace-lease` (runtime-checked).
- `validate-foundation.mjs`: `expectedSchemas` set-equality now lists 17; `mandatoryIdentityFields` adds `workspace-lease` → `[lease_id, version, project_id, work_package_id, session_id, actor_id, content_hash]`, which matches the schema's identity + content_hash fields.
- Schema-file count at `da36c50` = **17**; the 16 pre-existing `contracts/*.schema.json` are **byte-identical** to base (`git diff --stat 0c0f3d2 da36c50 -- contracts/` shows only the new file added).
- `npm run validate` exit **0**, reporting "7 canonical bootstrap schemas + 10 governed extensions … MOD-WSPACE workspace-lease".

## 4. resolveActiveLease fail-closed — CLEAN (all probes deny-by-default)

Independent probe harness results (fresh vectors, run in-tree, not committed):

| Probe | Result |
|---|---|
| unknown lease id | `DENY_LEASE_UNKNOWN` |
| empty / non-string id | `DENY_LEASE_INVALID_ID` |
| `now` = NaN / negative / float | `DENY_LEASE_INVALID_NOW` (each) |
| `now === expires_at` (boundary) | `DENY_LEASE_EXPIRED` (`>=` fail-closed — not active) |
| `now > expires_at` | `DENY_LEASE_EXPIRED` |
| `now < expires_at` | `ok:true` |
| three versions (1,3,2) all active | highest-version-active wins → version **3** |
| chain tamper (mutate sealed payload) | `LEDGER_INTEGRITY_FAILURE` thrown BEFORE any lease returned |
| output mutation | deeply frozen (`Object.isFrozen` true on lease + envelope) |

- **Unparseable stored expiry → NOT active** is code-verified: `Number.isFinite(expiresMs) && now < expiresMs` yields `false` when `Date.parse` returns `NaN`, so an ambiguous expiry NEVER grants authorization. It cannot be reached dynamically through the public API because (a) the closed schema rejects a non-`date-time` `expires_at` at append (`DENY_CONTRACT_INVALID`, probed), and (b) forging it post-seal breaks the hash chain and fails at `LEDGER_INTEGRITY_FAILURE` (probed). The branch is correct defense-in-depth for an API-unreachable state — a strength, not a gap.

## 5. Single-writer divergence (DENY_LEASE_SINGLE_WRITER) — RULING: ACCEPTABLE (do not revert)

**Ruling: ACCEPTABLE as an in-scope R2 addition. Do not require revert.**

Reasoning:
- **It is a review-NAMED follow-up.** The MOD-WSPACE completion review REV-001 follow-up #3 explicitly named "Single-writer / lease-conflict denial (part of G2, OPEN) … sequenced after the ledger exists." This slice lands the ledger; building the durable-record half of the denial alongside it is a defensible reading of "after the ledger exists."
- **It stays strictly on the safe side of the deferred boundary.** Both the assessment (§5 non-goal #5) and the completion review frame the DEFERRED item as *live enforcement* — "deciding that two overlapping active leases conflict, and blocking the second [live write], needs a lease-granting authority." The producer's `DENY_LEASE_SINGLE_WRITER` is a **durable-record invariant only**: it gates what THIS ledger will persist. It is NOT wired into any live path — `src/gateway/mcp-gateway-core.mjs` is **byte-identical** to base (0-line diff), there is no `STATE_MACHINES.Session` widening (verified — the only match is a comment naming what the file does NOT do), and no worktree/process materialization. Nothing downstream consults the gate to block a live write. The actual non-goal line (a live lease-granting authority) is NOT crossed.
- **It is verifiably correct.** Probed:
  - same-`lease_id` **idempotent replay** → EXCLUDED from denial (returns base replay record, `replayed:true`);
  - same-`lease_id` **higher-version renewal** → EXCLUDED (allowed);
  - different `lease_id`, same `session_id`, incumbent active → `DENY_LEASE_SINGLE_WRITER`;
  - **denied append persists nothing** (ledger length unchanged after a denial);
  - after incumbent expiry, the second writer is allowed.
- **Fail-closed direction is correct and deliberately OPPOSITE to resolveActiveLease.** `#detectSingleWriterConflict` treats an unparseable incumbent `expires_at` as **still active** (`Number.isFinite(expiresMs) ? now < expiresMs : true`), so an ambiguous incumbent BLOCKS the second writer (safe direction). resolveActiveLease treats unparseable as NOT active (never grants). Both default to deny; the opposite directions are individually correct for their use.

LOW advisory (sequencing nuance) is recorded below, but it does not change the ruling.

## 6. Isolation / snapshot / freeze — CLEAN

- **Atomic snapshot:** `snapshotLease` reads the caller object exactly once via `structuredClone` before both `validateContract` and entry construction consume that ONE snapshot — a value-varying getter / hostile Proxy trap cannot make the stored record differ from the validated record (single-read TOCTOU closure, mirrors write-set-policy REV-002). A throwing trap is contained → `DENY_LEASE_MALFORMED`, never propagates.
- **Deep-frozen outputs:** resolveActiveLease returns a `deepFreeze`d envelope + lease (probed frozen); deny envelopes are `Object.freeze`d; the allow envelope from appendLease is frozen.
- **Fixtures round-trip:** `valid/workspace-lease.json` validates; `invalid/workspace-lease-missing-id.json` (omits `lease_id`) is rejected — both wired into `contract-validator.test.mjs` additively.
- **No gateway wiring / unwired beyond the validator registration:** only two `src/` files touched — `contract-validator.mjs` (+1 schema line) and the new ledger. Gateway (B5) byte-identical.

## 7. Regression / merge — CLEAN

- `npm test`: **tests 1081 · pass 1076 · fail 0 · skipped 5** (exact match to expected).
- `npm run validate`: exit **0**, 17 schemas reported.
- Merge-cleanliness vs `main` @ `0c0f3d2`: `git merge-tree --write-tree 0c0f3d2 da36c50` exit 0, no conflict markers (target is a fast-forward descendant of base).

## Findings by severity

- **BLOCKER: none. HIGH: none. MEDIUM: none.**
- **LOW-1 (advisory — schema field-set divergence from the assessment/review sketch).** The completion review follow-up #1 and assessment §4 S3 sketched a schema with `allowed_paths`/`prohibited_paths`, `granted_at`, `baseline`, `agent_id`, `harness_id`. The landed schema instead uses a single `write_set` array, `issued_at`, `ttl`, `actor_id`, plus `version`/`work_package_id`; it omits `prohibited_paths`/`baseline`/`harness_id`. This aligns the durable record to the S1 write-set-policy vocabulary and is internally consistent (fixtures, tests, `mandatoryIdentityFields` all match). Because the record is unconsumed and the schema is closed+additive, a future enforcement consumer (B5) that needs prohibited-path or baseline provenance would require an additive schema extension. No security impact (a lossy unconsumed record weakens no gate); flagged for governance traceability only.
- **LOW-2 (advisory — single-writer sequencing).** The completion review listed single-writer as follow-up **#3**, sequenced after the ledger (#1) as a subsequent step, and the strictest reading of non-goal §5 #5 ("no single-writer / lease-conflict *enforcement*") could be read to bar even a durable-record-local denial. The producer took the broader reading and folded the durable half into this slice. Accepted (see §5) because it is review-named, strictly durable-record-local with zero live-path effect, and verifiably fail-closed — but noted so the tracker records that S3 delivered slightly ahead of the named sequencing.
- **LOW-3 (advisory — O(n) chain scan per append).** Both `#detectSingleWriterConflict` and `resolveActiveLease` call `this.read()` (full chain read + verify) on every invocation, same as the sibling ledgers. Acceptable for a durable primitive; noted for scale awareness if a live consumer ever calls it on a hot path.

## Advisory status fields

- truth_status: verified_true
- authority_status: advisory_only
- implementation_status: existing (slice is built and passing; review is advisory)
- risk_class: low

## Self-certification

```yaml
self_certification:
  agent_id: claude-immune-rev-wspace-s3-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Advisory only. This record recommends APPROVE_FOR_MERGE; it does not authorize the merge. Merge/authority remains with the operator/governance per BST-SA authority rules and ADR-0015 R5.
