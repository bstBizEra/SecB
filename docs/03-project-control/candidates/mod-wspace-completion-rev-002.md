# MOD-WSPACE Module-Completion Review (REV-002) — RE-REVIEW after S3 lease-ledger

- review_id: MOD-WSPACE-COMPLETION-REV-002
- status: CANDIDATE (advisory module-completion re-review; operator ratification required — no push, no merge)
- reviewer: claude-immune-rev-modwspace-complete-02 (BST-SA immune agent, independent identity)
- **supersedes: `mod-wspace-completion-rev-001.md` (verdict NOT_FINISHED).** This record supersedes REV-001 on the single ground REV-001 itself named: the assessment-S3 lease durable half has now landed (PR #52). REV-001's three individual slice ratifications (S1/S2/lease-primitive) stand unchanged; only the module-completeness verdict is revised.
- pieces_reviewed: all four in-process policy pillars now merged to main — S1 write-set containment evaluator (PR #37), the workspace-lease lifecycle primitive (PR #42, F3-hardened via PR #44), the overlap-class O0–O5 evaluator (PR #46), **AND the S3 lease durable half (PR #52): `contracts/workspace-lease.schema.json` + `WorkspaceLeaseLedger` + `resolveActiveLease` + single-writer gate + 16→17 validator registration**
- target: unified main @ `944c3ff9e0d35be3d276223af678e1f2080dead2` (Merge PR #52)
- review_branch: `claude/rev/mod-wspace-completion-2` (created FROM main @ `944c3ff`)
- assessment_context: `mod-wspace-gap-assessment-001.md` on `bst/mod-wspace-assessment` (G1–G7 map, boundary rulings B1–B6, slice plan S1–S3, non-goals §5)
- prior_s3_slice_review: `mod-wspace-s3-lease-ledger-rev-001.md` (independent immune review of PR #52 @ da36c50 — APPROVE_FOR_MERGE, 3 LOW advisories; its findings re-verified first-hand here)
- catalog_scope: MOD-WSPACE Workspace Orchestrator — `docs/10-platform/03-module-catalog.md` row 9: "Worktree, namespace, lease and write-set control" (Critical priority); lead ENGIN — Codex, review SEC + QA
- governance: BST-SA advisory contract (worker, not authority); AMD-002 advise-and-proceed; operator-only merge
- date: 2026-07-21
- method: first-hand. Isolated worktree; `npm ci`; foundation validator + full suite measured directly at `944c3ff`; a whole-module composition smoke harness (26 assertions) exercised all four pieces together with fresh vectors (run in-tree, never committed); every S3 source file read directly; a live tamper probe and hostile-Proxy probe run against the ledger in scratch temp dirs; the 17-schema registration, the S1/S2/primitive/ledger/gateway/state-machine byte-identity, and the gap-closure all reproduced first-hand. No producer count or prior-review claim taken on trust.

---

## Module verdict

**FINISHED_WITH_TRACKED_FOLLOWUPS.**

The single blocker that drove REV-001's NOT_FINISHED verdict — the missing S3 lease
durable half — is **genuinely, soundly closed**. All four artifacts REV-001's
follow-up #1 enumerated now exist in main and pass first-hand verification:

1. `contracts/workspace-lease.schema.json` — closed (`additionalProperties:false`),
   11 required identity + write-set + timing + `content_hash` fields.
2. `src/ledger/workspace-lease-ledger.mjs` — `WorkspaceLeaseLedger extends
   DurableLedger`, thin-subclass pattern identical to `CheckpointLedger`; hash
   chain / idempotency / optimistic concurrency inherited UNMODIFIED.
3. `resolveActiveLease(leaseId, { now })` — fail-closed on unknown / invalid-id /
   invalid-now / expired (`now >= expires_at`, `>=` boundary) / tamper; highest-
   version-active wins.
4. Validator registration (G6) — `workspace-lease` added to `contract-validator.mjs`
   `schemaPaths` (16→17) and to `validate-foundation.mjs` `expectedSchemas`
   set-equality + `mandatoryIdentityFields`. Schema-file count on disk = **17**.

A **single-writer-per-session gate** (`DENY_LEASE_SINGLE_WRITER`) also landed as the
durable-record-local half of REV-001 follow-up #3 — verified fail-closed and, per
the S3 slice review's ruling (re-confirmed here), strictly a durable-record invariant
with **zero** live-path effect (gateway byte-identical, no state-machine widening,
no worktree materialization). It does not cross the deferred live-enforcement boundary.

With **G2 durable half + G6 both closed**, every gap that a bounded, additive,
buildable-now R2 slice could close within the assessment's own S1–S3 plan is now
closed. The remaining open items are exclusively the assessment's honest **R3/R4
non-goals** (worktree/namespace creation, session state-machine widening, gateway
lease wiring, single-writer *live* enforcement) and the **operator** P0 anchor —
none is a buildable-now R2 completeness gap. The disposition MOD-CONTEXT / MOD-WORK /
MOD-RUNTIME earned (FINISHED_WITH_TRACKED_FOLLOWUPS) is now honestly available here,
because — unlike at REV-001 — the residue is genuinely R3/operator, not an unbuilt R2
slice of the module's own plan.

The composition smoke and full suite are green; no BLOCKER/HIGH/MEDIUM findings in
the landed code. This is a module-completeness ruling on first-hand evidence.

---

## What changed since REV-001 (the delta that flips the verdict)

| | REV-001 (main @ 3f74683) | REV-002 (main @ 944c3ff) |
|---|---|---|
| assessment S1 (G1, write-set) | CLOSED | CLOSED (byte-identical, no drift) |
| assessment S2 (G5, overlap) | CLOSED | CLOSED (byte-identical, no drift) |
| lease lifecycle **primitive** (part of G2) | CLOSED | CLOSED (byte-identical, no drift) |
| **lease durable half (G2)** — schema + `WorkspaceLeaseLedger` + `resolveActiveLease` + single-writer | **OPEN (R2, unbuilt)** — the sole NOT_FINISHED driver | **CLOSED (PR #52)** — all four artifacts present, fail-closed, first-hand verified |
| **G6 validator registration** | PENDING (bundled with the unbuilt S3) | **CLOSED** — 16→17, set-equality + `mandatoryIdentityFields` |
| schema count | 16 | **17** |
| `npm test` total | 1062 / 1057 / 0 / 5 | **1081 / 1076 / 0 / 5** |
| module verdict | **NOT_FINISHED** | **FINISHED_WITH_TRACKED_FOLLOWUPS** |

REV-001's follow-ups #4–#7 (G3, G4, gateway wiring B5, G7) were already R3/R4/operator
and remain so. The only movement is follow-up #1 (S3 ledger half) OPEN→CLOSED, which
drags follow-up #2 (G6) and the durable half of #3 (single-writer) closed with it.

---

## First-hand gap-closure confirmation (the prior blocker)

Verified directly at `944c3ff`, not taken from the S3 slice review:

- **17 schemas registered.** `ls contracts/*.schema.json | wc -l` = 17;
  `grep workspace-lease src/contracts/contract-validator.mjs` = one `schemaPaths`
  key; `validate-foundation.mjs` `expectedSchemas` lists all 17 and
  `mandatoryIdentityFields["contracts/workspace-lease.schema.json"]` =
  `[lease_id, version, project_id, work_package_id, session_id, actor_id, content_hash]`.
  `npm run validate` exit **0**.
- **WorkspaceLeaseLedger persists + resolveActiveLease fail-closed.** Live harness:
  append → `ok:true` frozen envelope; `resolveActiveLease` active → `ok:true` deep-frozen
  lease; unknown → `DENY_LEASE_UNKNOWN`; `now === expires_at` → `DENY_LEASE_EXPIRED`
  (`>=` boundary); `now:NaN` → `DENY_LEASE_INVALID_NOW`.
- **Single-writer denial present + correct.** Second active lease under the same
  `session_id` → `DENY_LEASE_SINGLE_WRITER`; the denied append **persists nothing**
  (`resolveActiveLease` on the denied lease → `DENY_LEASE_UNKNOWN`); idempotent replay
  of the same `lease_id` → NOT a conflict (`ok:true`); different `session_id` → allowed.
- **Tamper fail-closed (live probe).** Editing a persisted record's `expires_at` to
  extend authorization and re-reading → **`LEDGER_INTEGRITY_FAILURE`** thrown before any
  lease is returned. Hostile Proxy lease (throwing getter) at append →
  **`DENY_LEASE_MALFORMED`**, contained, never propagated.
- **No drift in the other three pillars.** `git diff 0c0f3d2 944c3ff` over
  `write-set-policy.mjs`, `overlap-policy.mjs`, `workspace-lease-policy.mjs`,
  `durable-ledger.mjs`, `mcp-gateway-core.mjs`, `state-machine.mjs` = **empty
  (byte-identical)**. The S3 landing touched only the new ledger + schema + fixtures +
  tests and the +1-schema registration lines.

The REV-001 blocker text ("no `WorkspaceLeaseLedger`; no `resolveActiveLease`; no
`workspace-lease` in `schemaPaths`/`expectedSchemas`; no single-writer denial") is
now false in every clause. The blocker is genuinely resolved.

---

## Whole-module composition smoke (first-hand, 26/26 pass)

Independent harness exercised all four pieces together (fresh vectors, in-tree, never
committed). **All 26 assertions pass.**

| Piece | Probe | Outcome |
|---|---|---|
| S1 write-set | allowed subset / prohibited-wins / outside-allowed / `..` traversal / `null` | `ok:true` · `DENY_WRITE_SET_PROHIBITED` · `_OUTSIDE_ALLOWED` · `_TRAVERSAL` · deny-by-default; frozen |
| S2 overlap | O0 separate · O5 protected · O4 global-config · malformed | exact O-class + doctrine control; `DENY_OVERLAP_UNKNOWN_CLASS` on non-boolean |
| S3 primitive | mint · evaluate at `now===expiry` · widening · renew | frozen lease · `DENY_LEASE_EXPIRED` (`>=`) · `DENY_LEASE_WRITE_SET_EXCEEDED` · renew keeps `writeSet` unchanged |
| S3 ledger | append · resolve active · unknown · expiry `>=` · invalid now | `ok:true` frozen · deep-frozen lease · `DENY_LEASE_UNKNOWN` · `DENY_LEASE_EXPIRED` · `DENY_LEASE_INVALID_NOW` |
| S3 ledger | single-writer · denied-persists-nothing · idempotent-replay · different-session | `DENY_LEASE_SINGLE_WRITER` · `DENY_LEASE_UNKNOWN` · `ok:true` · `ok:true` |
| Compose | lease deny surfaces underlying write-set code | `detail: DENY_WRITE_SET_OUTSIDE_ALLOWED` |
| Compose | disjoint leased write sets → overlap | `O0` / Parallel |
| Compose | same-file leased sets → overlap | `O2` (Same file, separate regions) — **derived from actual path overlap via reused S1 containment, not a caller flag** |

**Compose + no-drift confirmed.** Both `overlap-policy.mjs` and
`workspace-lease-policy.mjs` `import { evaluateWriteSet }` from `write-set-policy.mjs`
and consume it **read-only** — the lease-primitive deny surfacing the underlying
`DENY_WRITE_SET_OUTSIDE_ALLOWED` in `detail`, and the overlap O2 derivation flowing
through the same containment, both prove the reuse is live, not reimplemented. The new
ledger's `snapshotLease` does an **atomic single-read** (`structuredClone`) so a
value-varying getter cannot make the stored record differ from the validated one
(single-read TOCTOU closure, mirroring write-set-policy REV-002). Every evaluator/ledger
is **deny-by-default** (malformed → frozen denial or typed throw, never a permissive
default), **atomic-snapshot**, and returns **deep-frozen** outputs. Audit-before-effect
holds by construction: each frozen result IS the decision record and no piece has a
live side effect.

---

## Updated G-coverage ruling (against assessment G1–G7 text, read first-hand)

| Gap | Assessment text (abridged) | REV-001 | **REV-002** | Finding |
|---|---|---|---|---|
| **G1** | Write-set control primitive — candidate write set vs `allowed_paths`/`prohibited_paths`; deny widening/prohibited/traversal/absolute | CLOSED | **CLOSED** | S1 `write-set-policy.mjs` byte-identical; six deny codes, prohibited-beats-allowed, `pathSubset` parity + byte-identity guards. Smoke green. |
| **G2** | Lease lifecycle primitive — mint/track/expire/renew; single-writer conflict denial for overlapping write sets | **PARTIAL** | **CLOSED** | Primitive (mint/evaluate/renew, fail-closed expiry, no-widen) **plus** the durable half: `WorkspaceLeaseLedger` **tracks** a lease, `resolveActiveLease` **resolves** one by id (fail-closed), and the **single-writer-per-session** denial is present (durable-record-local, fail-closed). The module's headline "required everywhere, owned nowhere" gap is now owned by a durable, resolvable ledger. *Live* single-writer enforcement remains a separately-scoped R3 consumer (follow-up). |
| **G3** | Worktree + namespace creation — isolated worktree, namespace, bind to lease + baseline | MISSING (by design) | **MISSING (by design)** | Honest non-goal §5 #1 — `git worktree add` / namespace allocation spawns processes + touches the filesystem, forbidden by the in-process posture; R3/R4 operator-gated. Byte-identity of the gateway confirms no creep. |
| **G4** | Session state-machine coverage for `WORKSPACE_LEASED` / `LEASE_EXPIRED` / `LEASE_REVOKED` | MISSING (by design) | **MISSING (by design)** | Honest non-goal §5 #2 — `state-machine.mjs` is a live authority-semantics kernel file (byte-identical, verified); widening it is R3. |
| **G5** | Overlap-class evaluator — classify two write sets into O0–O5, return doctrine control | CLOSED | **CLOSED** | S2 `overlap-policy.mjs` byte-identical; verbatim O0–O5 ladder, doc-parity test, O2 DERIVED via reused S1 containment, most-restrictive-on-malformed. Smoke green. |
| **G6** | Contract-/foundation-validator registration for a workspace schema kind (mechanical) | PENDING | **CLOSED** | First-hand: `workspace-lease` in `contract-validator.mjs` `schemaPaths` (16→17, `supportedContractKinds()`=17) and in `validate-foundation.mjs` `expectedSchemas` set-equality + `mandatoryIdentityFields`. `npm run validate` exit 0. |
| **G7** | P0 backlog anchor for workspace orchestration as a deliverable | OPEN (operator) | **OPEN (operator)** | Non-goal §5 #8 — a P0 backlog line is an operator/portfolio decision a slice plan cannot make. Correctly deferred. |

**Tally: 4 CLOSED (G1, G2, G5, G6) · 2 MISSING-by-design R3/R4 (G3, G4) · 1 operator
(G7).** Every gap the assessment's additive S1–S3 plan was scoped to close is closed.
The three remaining (G3, G4, G7) are the assessment's own explicit non-goals — R3/R4
filesystem/kernel work and an operator portfolio decision — not buildable-now R2 gaps.

---

## Remaining follow-ups (all R3/R4 or operator — no R2 buildable-now gap remains)

1. **Single-writer / lease-conflict LIVE enforcement (part of G2, R3).** The
   durable-record-local gate landed; deciding that two overlapping *active* leases
   conflict and blocking the second *live write* still needs a lease-granting
   authority wired into a live path. Assessment non-goal §5 #5. **R3.**
2. **Gateway lease wiring (B5, R3).** `mcp-gateway-core.mjs` still consumes
   `workspace_lease_id` opaquely (byte-identical, verified — mints/resolves/expires
   nothing); wiring it to require a resolvable, unexpired, conflict-free lease changes
   a live enforcement path. Assessment non-goal §5 #3. **R3.**
3. **G3 worktree / namespace creation (R3/R4).** Filesystem + process spawn;
   operator-gated. Non-goal §5 #1. **R3/R4.**
4. **G4 session state-machine lease states (R3).** `WORKSPACE_LEASED` /
   `LEASE_EXPIRED` / `LEASE_REVOKED` in `STATE_MACHINES.Session` — live kernel edit.
   Non-goal §5 #2. **R3.**
5. **G7 P0 backlog anchor (operator).** Non-goal §5 #8. **Operator.**
6. **S3 LOW-1 — schema field-set divergence (LOW, governance-traceability).** The
   landed schema uses a single `write_set` array + `issued_at`/`ttl`/`actor_id` and
   omits `prohibited_paths`/`baseline`/`harness_id` that REV-001 follow-up #1 and
   assessment §4 S3 sketched. It aligns the durable record to the S1 write-set
   vocabulary and is internally consistent (schema, fixtures, tests,
   `mandatoryIdentityFields` all agree). No security impact — a closed, unconsumed
   record weakens no gate. A future B5 consumer needing prohibited-path or baseline
   provenance would add those via an **additive** schema extension (itself part of the
   R3 wiring work). Carried so the tracker records the divergence; **not** an R2
   completeness gap.
7. **S3 LOW-2 — single-writer sequencing nuance (LOW, INFO).** S3 folded the
   durable-record half of single-writer (REV-001 follow-up #3) into the same slice
   rather than a later step. Accepted by the S3 slice review (durable-record-local,
   zero live-path effect, fail-closed) and re-confirmed here. INFO only.
8. **S3 LOW-3 — O(n) chain scan per append/resolve (LOW, INFO).** Both
   `#detectSingleWriterConflict` and `resolveActiveLease` full-read+verify the chain
   per call, as the sibling ledgers do. Fine for a durable primitive; noted for scale
   awareness if a live consumer ever calls it on a hot path. INFO only.

**Confirmation:** items 1–5 are R3/R4/operator (the assessment's own non-goals); items
6–8 are LOW advisories carried from the S3 slice review (traceability/INFO), none
merge-blocking and none an R2 buildable-now gap. **No R2 slice of the module's own
plan remains unbuilt.**

---

## Measured totals (first-hand, exact, at `944c3ff`)

| Measure | Expected | Measured | Match |
|---|---|---|---|
| `npm test` total | 1081 | **1081** | yes |
| `npm test` pass | 1076 | **1076** | yes |
| `npm test` fail | 0 | **0** | yes |
| `npm test` skipped | 5 | **5** | yes |
| `npm run validate` exit | 0 | **0** | yes |
| schemas registered | 17 | **17** | yes |

Change surface of THIS review vs main `944c3ff`: 2 files — this review record + its
root `MANIFEST.json` entry. No `src/**`, `contracts/**`, `tools/**`, `tests/**`,
`docs/templates/**`, or `docs/03-project-control/effective/**` touched.

---

## Findings by severity

**BLOCKER: none. HIGH: none. MEDIUM: none.** (No defect in the landed code; the
verdict change is a module-completeness ruling driven by the S3 half landing.)

- **INFO-1.** The `workspace-lease-policy.mjs` header still self-labels "Slice S2
  (this dispatch)", the numbering-hygiene note REV-001 raised (INFO-1). Cosmetic; the
  file's own scope-divergence note maps it correctly to the assessment-S3 primitive.
  Advisory only.
- **INFO-2.** The S3 durable record's schema vocabulary (`write_set`, `issued_at`,
  `ttl`) intentionally diverges from the primitive-facing sketch; recorded as
  follow-up #6 for governance traceability so a future B5 consumer knows an additive
  extension is required for prohibited-path/baseline provenance.

---

## Advisory status fields

- truth_status: verified_true (validator, full suite 1081/1076/0/5, 17-schema registration, whole-module composition smoke 26/26, tamper + hostile-Proxy fail-closed probes, and the four-artifact gap closure all reproduced first-hand at `944c3ff`)
- authority_status: advisory_only (module verdict is a recommendation; every remaining wiring/creation/enforcement item is execution_requires_operator; the P0 anchor is operator/portfolio)
- implementation_status: existing (all four in-process pillars — S1 write-set, S2 overlap, S3 lease primitive, S3 lease durable half incl. `WorkspaceLeaseLedger` + `resolveActiveLease` + single-writer gate + validator registration — are live in-module; G3/G4/gateway-wiring/live-single-writer are blocked/non-goal by design)
- risk_class: low (the landed pieces are pure, unwired, deny-by-default evaluators + an unconsumed durable ledger with no live authority surface — gateway byte-identical, no state-machine widening; the residual risk is completeness/traceability of the LOW schema-divergence note, not a security defect)

## Self-certification

```yaml
self_certification:
  agent_id: claude-immune-rev-modwspace-complete-02
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

## Authority boundary

This is an advisory module-completion re-review. It changes no production code,
contract, schema, template, effective receipt, policy, or ADR beyond adding this
review record to the root MANIFEST. No branch was pushed and nothing was merged. It
supersedes REV-001's NOT_FINISHED verdict on first-hand evidence that the S3 lease
durable half landed and is sound. Operator ratification is required before
MOD-WSPACE's tracker status is set to FINISHED_WITH_TRACKED_FOLLOWUPS and before any
of the R3/R4/operator follow-ups (gateway wiring, live single-writer, worktree/
namespace creation, state-machine widening, P0 anchor) is produced.
