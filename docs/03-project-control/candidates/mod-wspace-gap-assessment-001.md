# MOD-WSPACE Gap Assessment 001 — Workspace Orchestrator

**Record ID:** MOD-WSPACE-000 / mod-wspace-gap-assessment-001
**Status:** DRAFT / ADVISORY — NOT EFFECTIVE
**Assessed baseline:** unified `main` @ `beebfe8f29c5dd8c0b201d7a29d23669c20f0c32`
**Author:** claude-cortex-wspace-assess-02 (BST-SA cortex, module-loop planner)
**Date:** 2026-07-21
**Catalog scope under assessment:** MOD-WSPACE "Workspace Orchestrator" — `docs/10-platform/03-module-catalog.md` row 9: "Worktree, namespace, lease and write-set control" (Critical priority); `docs/14-delivery/01-module-allocation.md` line 11: lead ENGIN — Codex, review SEC + QA.
**Tracker:** `docs/03-project-control/candidates/module-completion-tracker-001.md` row 6 (on `bst/mod-runtime-assessment`) — "QUEUED — worktree/lease practice exists operationally; code module missing".
**Governance frame:** AMD-002 rev 2 advise-and-proceed (candidate preparation only; `AGENTS.md` `SECB-AGENTS-AMD-002` revision 2, lines 45/64/70); operator-only merge; no push.
**Method:** all findings below were read first-hand from the actual source, contracts, tests, and docs at the cited baseline. No prior candidate branch for this module exists (`git log --all --oneline --grep="MOD-WSPACE" -i` returns zero hits before this record). `npm test` (validator + full suite) was run first-hand in an isolated worktree before drafting: **703 tests / 698 pass / 0 fail / 5 skip**, `node tools/validate-foundation.mjs` exit 0.

---

## 1. Existing-surface inventory (main @ beebfe8)

The catalog names four sub-responsibilities — **worktree, namespace, lease, write-set control**. None has a dedicated code module. What exists is a set of *declared data fields* and *document-plane subset checks* that reference the workspace concern, plus operational (by-hand) worktree practice.

| # | Surface | Workspace-relevant behavior | Notes |
|---|---|---|---|
| 1 | `contracts/work-package.schema.json:20-21` | `allowed_paths` (minItems 1) and `prohibited_paths` (minItems 1) are **required** fields on every work package — the declared write set. | The write-set is captured as contract *data*. Nothing in `src/` evaluates a concrete list of intended file writes against these arrays at mutation time. |
| 2 | `src/services/work-package-service.mjs:398-405` | On draft ingest, validates each `allowed_paths` entry: rejects `..` traversal segments (`DENY_REPOSITORY_SCOPE`) and any path outside the effective project contract's approved `repositories` (`DENY_REPOSITORY_SCOPE`). | **Contract-shape** validation only — "is this declared path legal for this project." It is not a runtime "did this producer's actual write set stay inside the declared allowance." WP service owns the former; MOD-WSPACE would own the latter (see B1). |
| 3 | `src/services/context-federation-service.mjs:206` | `pathSubset(document.authority_scope, resolution.effective.allowed_paths)` → `DENY_SCOPE_WIDENING`. | The one live subset check protecting against scope widening — but at the **context-receipt document plane** (a receipt's `authority_scope` vs the effective contract), not over a concrete candidate write set. Establishes the exact subset semantics a write-set evaluator must reuse (B3). |
| 4 | `src/services/handoff-service.mjs:200` | Handoff ceiling carries `paths: contract.allowed_paths` into the non-escalation comparison, so a child handoff cannot widen paths beyond the parent contract. | Path scope is already threaded through the non-escalation ceiling — another consumer of `allowed_paths`, again at the document/authority plane, not a mutation-time file-set check. |
| 5 | `src/gateway/mcp-gateway-core.mjs:11,352,780` | `workspace_lease_id` is a `REQUIRED_CONTEXT_FIELD`; the gateway requires it be present and non-blank, echoes it into the reservation/decision record, but **mints nothing, tracks no TTL/expiry, resolves no lease, and detects no lease conflict**. | The lease identity is consumed as an **opaque string** with no issuer. This is the clearest "referenced everywhere, owned nowhere" gap — a lease field with no lease lifecycle (see G2). |
| 6 | `src/control/state-machine.mjs:31-42` `STATE_MACHINES.Session` | `CREATED→CONTEXT_BINDING→READY→RUNNING→{REVIEW_HANDOFF,PAUSED,BLOCKED,QUARANTINED,FAILED,TERMINATED}`. | The in-code session lifecycle has no workspace/lease-bearing states (`WORKSPACE_LEASED`, `LEASE_EXPIRED`, `LEASE_REVOKED`). Same doc-vs-code granularity gap MOD-RUNTIME flagged as MR-4 for checkpoint/approval states — an authority-bearing kernel file, out of additive scope (see G4). |
| 7 | `src/ledger/checkpoint-ledger.mjs` (MOD-RUNTIME S1) | `CheckpointLedger extends DurableLedger`: session-scoped, hash-chained, append-only resume points; `resolveLatest(sessionId)` fail-closed. | **Adjacent, must not be folded into.** A checkpoint is "resumable execution state at a sequence position"; a workspace lease is "who may mutate which paths in which worktree until when." Different records; both should extend `DurableLedger`, neither subsumes the other (B2). |
| 8 | `docs/12-execution/06-parallel-execution.md` | Overlap policy table O0–O5 (`Separate modules` … `Protected branch/release` → controls Parallel/Declared ownership/Reservation/Variant-or-serialize/Single writer/Serialized+human). Lane contract lists "workspace lease" and "declared write set and prohibited paths" as required lane inputs. | The overlap classes and the lane's write-set/lease requirements are **doctrine prose**, with no code that classifies two declared write sets into an O-class or enforces the lane's lease/write-set obligations (G1, G5). Same "codify what's already named" shape as MOD-GOV S2's risk-registry treatment of DRAFT tables. |
| 9 | `docs/12-execution/07-context-and-handoff.md` | Context Receipt includes "baseline version" and "allowed tools/skills/MCP/network"; Handoff Envelope states "authorized scope". | Confirms the write-set/scope concern is threaded through context and handoff at the document plane, reinforcing that the *missing* piece is mutation-plane enforcement, not scope declaration. |
| 10 | `docs/09-delivery/codex-claude-git-worktree-build-plan.md` (SECB-PLAN-WORKTREE-001) | Plans, by hand, one worktree per mutation-capable agent, disjoint declared/prohibited write sets, and per-lane baselines — but is explicitly "DRAFT / NOT AUTHORIZED" and creates nothing. | Worktree + namespace + lease allocation is an **operational, human-driven** practice today. Actual `git worktree add` / namespace allocation spawns processes and touches the filesystem, which the gateway-core posture (`mcp-gateway-core.mjs:1-4`: "no transport, port, filesystem, network, credential access, or process spawning") explicitly excludes — so worktree creation cannot be a pure additive R2 slice (see B4, G3). |
| 11 | `docs/03-project-control/candidates/module-completion-tracker-001.md` row 6 | "MOD-WSPACE Workspace Orchestrator | Codex ENGIN | QUEUED — worktree/lease practice exists operationally; code module missing." | The tracker's own one-line verdict matches this assessment: practice exists, code module absent. |

## 2. Gap table

| ID | Capability | Status | Evidence |
|---|---|---|---|
| G1 | Write-set control primitive — evaluate a concrete candidate write set (list of file paths a producer intends to touch) against an effective work package's `allowed_paths`/`prohibited_paths`; deny widening, prohibited-path hits, `..` traversal, absolute escapes | **partial** | The declared data exists (item #1) and three document-plane consumers subset-check scope (items #2/#3/#4), but `grep -rin "write.?set" src/` returns no reusable primitive that takes an actual candidate file list and returns a fail-closed allow/deny. The O2/O4 lane obligations in `parallel-execution.md` (item #8: "declared write set and prohibited paths") have no code enforcer. This is MOD-WSPACE's most directly additive, most-referenced gap. |
| G2 | Lease lifecycle primitive — mint / track / expire / renew a workspace lease; single-writer conflict denial for overlapping write sets | **partial (opaque field, no lifecycle)** | `workspace_lease_id` is a hard-required gateway context field (item #5) that no code issues, expires, or resolves. The lane contract (item #8) lists "workspace lease" as a required lane input with a "checkpoint and expiry policy" — nothing implements grant/TTL/expiry/conflict. A lease record should extend `DurableLedger` (item #7 pattern), not invent parallel storage. |
| G3 | Worktree + namespace orchestration — create an isolated worktree, allocate a namespace, bind it to a lease and baseline | **missing / operational-only** | Done by hand per SECB-PLAN-WORKTREE-001 (item #10). Actual worktree/namespace creation spawns processes and touches the filesystem, which the candidate in-process posture forbids (item #10, gateway header). Cannot be a pure R2 slice; R3/R4 operator-gated. |
| G4 | Session/runtime state-machine coverage for workspace states (`WORKSPACE_LEASED`, `LEASE_EXPIRED`, `LEASE_REVOKED`) | **partial** | `STATE_MACHINES.Session` (item #6) has no lease-bearing states. Widening it is an edit to a live authority-semantics-bearing kernel file (`state-machine.mjs` is consumed by `TransitionEngine`) — the identical situation MOD-RUNTIME rated R3 and made an explicit non-goal (its MR-4). Out of additive scope here. |
| G5 | Overlap-class evaluator — classify two declared write sets into O0–O5 and return the doctrine's control | **missing** | `parallel-execution.md`'s O-table (item #8) is DRAFT prose with no code counterpart. A pure evaluator over two path sets is additive and doctrine-codifying — the same shape as MOD-GOV S2 codifying risk classes from a doc table. |
| G6 | Contract-validator / foundation-validator registration for any new workspace contract kind (mechanical) | **missing (mechanical)** | Adding a `workspace-lease` schema kind touches the fail-closed set-equality schema set in `src/contracts/contract-validator.mjs` (`schemaPaths`) and `tools/validate-foundation.mjs` (`expectedSchemas` set-equality + `mandatoryIdentityFields`) — the exact mechanical gap MOD-RUNTIME's MR-8 and MOD-WORK's G1 hit, at the same R2 rating. Bundled into whichever slice adds a schema (S3). |
| G7 | P0 backlog anchor for workspace orchestration as a deliverable | **missing** | `docs/09-delivery/backlog-p0.md` has no line naming worktree/lease/namespace/write-set control as a deliverable; the nearest artifact is the un-authorized build plan (item #10). Like MOD-RUNTIME's MR-9, this is an operator scope-anchoring question a slice plan cannot resolve on its own. |

**Gap counts: partial 3 (G1, G2, G4) · missing 3 (G3, G5, G7) · missing-mechanical 1 (G6). Reusable substrate: `DurableLedger` subclass pattern (item #7) and the `pathSubset` subset semantics (item #3) are directly extendable — no new persistence or subset logic need be invented.**

## 3. Boundary notes (no-duplication rulings)

- **B1 — Write-set control vs. WP contract validation (MOD-WORK).** `work-package-service.mjs:398-405` already validates that *declared* `allowed_paths` are legal for the project (repository-scoped, no `..`). MOD-WSPACE must **not** re-validate the contract shape. Its write-set primitive operates one plane down: given an already-effective contract's `allowed_paths`/`prohibited_paths` (passed in as data) and a **concrete candidate write set** (the actual files a producer intends to touch), decide allow/deny at mutation time. WP owns contract legality; MOD-WSPACE owns mutation-time containment.
- **B2 — Workspace lease vs. Checkpoint (MOD-RUNTIME).** `checkpoint-ledger.mjs` records "resumable execution state at a sequence position," keyed by `(project, work_package, session)`. A workspace lease records "which agent/harness may mutate which paths in which worktree until when," keyed by `workspace_lease_id`. Both extend `DurableLedger`; **neither folds into the other.** A lease is workspace-scoped authorization-to-mutate, not session-scoped resume state.
- **B3 — Write-set scope vs. Context Receipt authority_scope (MOD-CONTEXT).** `context-federation-service.mjs:206` already denies a receipt whose `authority_scope` widens beyond the effective contract's `allowed_paths` (`DENY_SCOPE_WIDENING`) — that is **document-plane scope recording** at receipt issuance. MOD-WSPACE's write-set evaluator is the **mutation-plane** enforcement counterpart over a concrete file list. It must reuse the same subset semantics (`pathSubset`) but must not re-implement, replace, or wrap the receipt path. `mintReceiptDocument` stays MOD-CONTEXT's; the write-set primitive is a peer, not a hook into it.
- **B4 — Worktree/namespace creation vs. pure-in-process posture.** Actual `git worktree add`, branch creation, and namespace allocation spawn processes and touch the filesystem — explicitly excluded by the gateway-core candidate posture (`mcp-gateway-core.mjs:1-4`). Worktree orchestration (G3) is therefore R3/R4, operator-gated, and is **not** proposed as an additive slice. This assessment covers only the pure, in-process policy primitives (write-set, overlap, lease record) that such an orchestrator would later compose.
- **B5 — Lease wiring into the MCP gateway.** `mcp-gateway-core.mjs` already requires `workspace_lease_id` but validates nothing about it. Wiring a lease ledger so the gateway requires a *resolvable, unexpired, conflict-free* lease changes a **live enforcement path** → R3, out of scope. S3 mints the lease-record primitive only; it does not touch the gateway.
- **B6 — Scoped memory (MOD-MEM).** `memory-gateway-service.mjs` owns scoped temporal memory (content). A workspace lease and a write set are authorization/topology metadata, not memory content. No overlap; the lease-record `state`/refs never carry memory payloads.

## 4. Bounded producer work plan (max 3 slices)

Scope discipline mirrors the prior module assessments (MOD-RUNTIME, MOD-GOV, MOD-CONTEXT): every slice is additive, behavior-preserving, wrap-not-modify. No existing service (`work-package-service`, `context-federation-service`, `handoff-service`, `mcp-gateway-core`, `state-machine`) is rewired in this plan; adoption is deferred to later, separately-governed slices. House style throughout: structured denials `{ ok: false, code, message }`, deny-by-default on malformed input, injected dependencies, deep-frozen outputs, no live wiring.

### Slice S1 — Write-set control evaluator, PURE + UNWIRED (closes G1, advances G5)

- **Files:** new `src/control/write-set-policy.mjs`; new `tests/write-set-policy.test.mjs`; `MANIFEST.json` updated. **No new schema, no new ledger, no I/O** — a pure evaluator over data passed in by the caller.
- **Behavior:** frozen-result function(s) in `risk-registry.mjs` house style: `evaluateWriteSet({ candidatePaths, allowedPaths, prohibitedPaths })` → `Object.freeze({ ok: true })` or `Object.freeze({ ok: false, code, message })`. Deny codes: `DENY_WRITE_SET_EMPTY` (no candidate paths), `DENY_WRITE_SET_MALFORMED` (non-array / non-string / blank entry — deny-by-default), `DENY_WRITE_SET_TRAVERSAL` (any `..` segment), `DENY_WRITE_SET_ABSOLUTE` (drive-letter or leading-slash escape), `DENY_WRITE_SET_PROHIBITED` (a candidate path is under a `prohibited_paths` prefix), `DENY_WRITE_SET_OUTSIDE_ALLOWED` (a candidate path is not a subset of any `allowed_paths` prefix). The subset/prefix semantics are the **same** ones `context-federation-service`'s `pathSubset` uses (B3) — extracted/reused, not reinvented; a parity test asserts equivalence with the existing `pathSubset` behavior so the two cannot drift. **Audit-before-effect:** the evaluator emits its decision record (allow/deny + code + the offending path) as the returned frozen result *before* any caller could act — it has no side effect of its own, so "audit precedes effect" holds by construction. It does **not** re-validate the contract (B1) and does **not** read the filesystem — `candidatePaths` is supplied by the caller.
- **Acceptance checks:** unit tests for every deny code including fail-closed malformed-input cases (non-array, non-string entry, blank, `null`, prototype-key smuggling); positive subset case; `pathSubset` parity test; frozen-output assertion; `npm test` green including the new suite; `node tools/validate-foundation.mjs` exit 0; no existing test's behavior changes.
- **Est. size:** ~110–160 LOC + tests.
- **R-class:** **R2** — pure additive policy evaluator; no authority semantics, no wiring, no I/O. **This is the slice a motor producer can start immediately.**

### Slice S2 — Overlap-class evaluator, PURE + UNWIRED (closes G5)

- **Files:** new `src/control/overlap-policy.mjs`; new `tests/overlap-policy.test.mjs`; `MANIFEST.json` updated. No schema, no ledger, no I/O.
- **Behavior:** `classifyOverlap({ writeSetA, writeSetB, sameModule, sameFile, sameSymbol, protectedBranch, globalConfig })` → `Object.freeze({ class, control })` codifying the `parallel-execution.md` O0–O5 table **verbatim** (O0 separate modules → Parallel; … O4 lockfile/generated/global config → Single writer; O5 protected/release → Serialized+human). A **doc-parity test** embeds the O-table rows as fixtures so any drift between code and `docs/12-execution/06-parallel-execution.md` fails the suite (mirrors MOD-GOV S2's risk-registry doc-parity discipline). Deny-by-default: malformed / missing inputs resolve to the most restrictive class rather than a permissive one.
- **Acceptance checks:** row-by-row unit tests for each O-class; doc-parity fixture test; most-restrictive-on-malformed test; frozen output; `npm test` green; validator exit 0.
- **Est. size:** ~100–150 LOC + tests.
- **R-class:** **R2** — pure doctrine codification; no wiring into any live scheduler or reservation path.

### Slice S3 — Workspace-lease record contract + WorkspaceLeaseLedger, UNWIRED (closes G2, closes G6)

- **Files:** new `contracts/workspace-lease.schema.json`; edit `src/contracts/contract-validator.mjs` (add `workspace-lease` to `schemaPaths`); edit `tools/validate-foundation.mjs` (add to `expectedSchemas` set-equality + `mandatoryIdentityFields`); new `src/ledger/workspace-lease-ledger.mjs` (`WorkspaceLeaseLedger extends DurableLedger`, following the `EventLedger`/`CheckpointLedger` thin-subclass pattern exactly); new fixtures `tests/fixtures/valid/workspace-lease.json` + `tests/fixtures/invalid/workspace-lease-missing-id.json`; new `tests/workspace-lease-ledger.test.mjs`; `MANIFEST.json` updated.
- **Behavior:** closed schema — `workspace_lease_id`, `version`, `project_id`, `work_package_id`, `session_id`, `agent_id`, `harness_id`, `allowed_paths` (array), `prohibited_paths` (array), `baseline`, `granted_at`, `expires_at`, `content_hash`. `WorkspaceLeaseLedger.append` reuses `DurableLedger`'s hash chain + idempotency + optimistic concurrency unmodified. Read helper `resolveActiveLease(workspaceLeaseId, { now })` → **fail-closed** on unknown lease, on expired lease (`now >= expires_at`), and on any tamper. The ledger records lease grant/expiry as durable, append-only fact; it does **not** mint leases into the gateway, does **not** enforce conflict against other active leases (single-writer conflict detection is a later, separately-scoped consumer once a real lease-granting authority exists), and is **not** wired into `mcp-gateway-core.mjs` (B5). Stores a lease's declared paths as data; it never materializes a worktree (B4).
- **Acceptance checks:** valid/invalid fixture round-trip through `validateContract("workspace-lease", …)`; unknown-lease, expired-lease, and tamper fail-closed tests; `expectedSchemas` set-equality still passes; `npm test` green; validator exit 0; no existing behavior changes.
- **Est. size:** ~140–200 LOC + tests.
- **R-class:** **R2** — new contract kind extending the fail-closed validator schema set (same rating MOD-RUNTIME S1's checkpoint kind and MOD-WORK's `goal` kind carried). No authority semantics; nothing consumes this ledger yet. **Wiring the gateway to require a resolvable lease (B5) is R3, out of scope.**

**Sequencing:** S1, S2, S3 are mutually independent (no shared mutable files, no ordering dependency). S1 is the recommended first dispatch — smallest, purest, and it establishes the `pathSubset`-parity discipline S3's tests can then lean on. Either order among the three is safe.

## 5. Explicit non-goals

1. No worktree, branch, or namespace *creation* (G3) — spawning `git worktree add` / allocating namespaces touches the filesystem and processes, forbidden by the candidate in-process posture; R3/R4 operator-gated.
2. No widening of `STATE_MACHINES.Session` with `WORKSPACE_LEASED`/`LEASE_EXPIRED`/`LEASE_REVOKED` (G4) — `state-machine.mjs` is a live authority-semantics-bearing kernel file; widening it is R3 kernel work requiring parity tests + SEC/GOV review, not additive extraction (mirrors MOD-RUNTIME non-goal #2).
3. No wiring of `mcp-gateway-core.mjs` to validate, resolve, or expire `workspace_lease_id` against the new S3 ledger (B5) — that changes a live enforcement path; R3, operator-gated.
4. No rewiring of `work-package-service`, `context-federation-service`, or `handoff-service` onto the S1 write-set primitive — adoption is later, separately-governed work.
5. No single-writer / lease-conflict *enforcement* — S3 records lease facts only; deciding that two overlapping active leases conflict, and blocking the second, needs a lease-granting authority this plan does not build.
6. No new `decision_type` enum value and no change to any existing schema beyond the additive `workspace-lease` kind in S3.
7. No enforcement hook that actually blocks a live write, lease grant, or parallel dispatch — all three slices are unwired evaluators/ledgers, per the "candidate, not activation" discipline the prior module slices held to.
8. No new P0 backlog line (G7) — adding one is an operator/portfolio decision.

## 6. R-class flags

| Item | Flag |
|---|---|
| S1 (write-set control evaluator) | **R2** — pure additive policy function; no wiring, no I/O. |
| S2 (overlap-class evaluator) | **R2** — pure doctrine codification; no wiring. |
| S3 (workspace-lease contract + ledger) | **R2** — extends the fail-closed validator schema set; no authority semantics; unconsumed ledger. |
| G3 (worktree/namespace creation) | **R3/R4, out of this plan** — filesystem + process spawning; operator-gated. |
| G4 (session state-machine widening) | **R3, out of this plan** — authority-semantics-bearing kernel file; non-goal #2. |
| Lease wiring into `mcp-gateway-core` (B5) | **R3, out of this plan** — changes a live enforcement path; non-goal #3. |
| Adoption of S1 by WP/context/handoff services | **R2 for the extraction, R3 for rewiring live services** — deferred; non-goal #4. |

## 7. AMD-002 rev 2 authorization analysis

Read directly from `AGENTS.md` (`SECB-AGENTS-AMD-002` revision 2) at this baseline (lines 45/64/70):

- **Pre-authorized now, no fresh Human-GOV needed:** producing S1, S2, and S3 as bounded additive slices under `src/**`, `tests/**`, `tools/**`, `contracts/**` on this non-main branch, with scope + acceptance checks declared and exact results reported. None touches authority, identity, evidence acceptance, remote/external actions, or a security boundary (the rule-8 narrowing exceptions at line 64), so no per-step halt applies. This is squarely AMD-002 rule 1's standing implementation authorization — the same footing MOD-RUNTIME S1/S2 stood on.
- **Would need the SEC + GOV review AMD-002 already reserves (line 70), not a new amendment:** (a) worktree/namespace creation (G3); (b) widening `STATE_MACHINES.Session` (G4); (c) wiring any of the three primitives into `mcp-gateway-core.mjs`, `work-package-service.mjs`, `context-federation-service.mjs`, or any live dispatch/write path; (d) any change that makes a lease's expiry or a write-set denial actually gate a live service's behavior. All four are explicit non-goals (§5 items #1–#5) and none is proposed for producer dispatch here.
- **Conclusion:** this gap assessment and its bounded S1–S3 plan do not require a *new* Human-GOV authorization beyond AMD-002 rev 2's standing pre-authorization for additive candidate slices. What would require the reserved SEC+GOV review is any subsequent *activation/wiring* step — which this plan does not include.

## 8. Advisory status fields

```yaml
truth_status: verified_true            # all evidence read directly from cited files at beebfe8; npm test run first-hand (703/698/0/5), validator exit 0
authority_status: advisory_only
implementation_status: candidate       # this record proposes; it authorizes nothing
risk_class: R1                         # the record itself: documentation candidate on a non-main branch
self_certification:
  agent_id: claude-cortex-wspace-assess-02
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Recommend improvements only. Do not execute them. Producer round scope is bounded to S1–S3 above; anything else — including any wiring/activation step named in §5 and §7 — is a new decision.
