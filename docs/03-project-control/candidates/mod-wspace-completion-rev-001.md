# MOD-WSPACE Module-Completion Review (REV-001)

- review_id: MOD-WSPACE-COMPLETION-REV-001
- status: CANDIDATE (advisory module-completion review; operator ratification required — no push, no merge)
- reviewer: claude-immune-rev-modwspace-complete-01 (BST-SA immune agent, independent identity)
- pieces_reviewed: three ratified slices merged to main — S1 write-set containment evaluator (PR #37, converged + hardened), the workspace-lease lifecycle primitive (PR #42, F3-hardened via PR #44 — an assessment-S3 SUBSET, not full S3), the overlap-class O0–O5 evaluator (PR #46, the genuine assessment-S2)
- target: unified main @ `3f74683c77df9a54e14bfa405ca75818f20f7b46` (Merge PR #48)
- review_branch: `claude/rev/mod-wspace-completion` (created FROM main @ `3f74683`)
- assessment_context: `mod-wspace-gap-assessment-001.md` on `bst/mod-wspace-assessment` (G1–G7 map, boundary rulings B1–B6, slice plan S1–S3, non-goals §5)
- catalog_scope: MOD-WSPACE Workspace Orchestrator — `docs/10-platform/03-module-catalog.md` row 9: "Worktree, namespace, lease and write-set control" (Critical priority); lead ENGIN — Codex, review SEC + QA
- governance: BST-SA advisory contract (worker, not authority); AMD-002 advise-and-proceed; operator-only merge
- date: 2026-07-21
- method: first-hand. Isolated worktree; `npm ci`; foundation validator + full suite measured directly at `3f74683`; a whole-module composition smoke harness exercised the three pieces together with fresh vectors (run in-tree, never committed); every source file read directly; the S3 ledger-half absence confirmed by direct grep of `src/`, `tools/`, `contracts/`. No producer count or claim taken on trust.

---

## Module verdict

**NOT_FINISHED.**

The catalog scope names four responsibilities — **worktree, namespace, lease, and
write-set control**. Two of the four in-process policy pillars are genuinely,
soundly delivered (write-set control S1, overlap classification S2), and the lease
pillar has its *pure lifecycle primitive* delivered and F3-hardened. But the lease
pillar is only HALF built: the assessment's own §4 Slice **S3** — a
`workspace-lease.schema.json` contract, a `WorkspaceLeaseLedger extends
DurableLedger`, a fail-closed `resolveActiveLease(workspaceLeaseId, { now })` read
helper, and the mechanical contract-validator / foundation-validator registration
(G6) — has NOT landed. Only the pure policy primitive (`workspace-lease-policy.mjs`,
mint / evaluate / renew over caller-supplied state) shipped, and its own header
discloses this as a deliberate SUBSET of S3.

This is **not** the MOD-CONTEXT / MOD-WORK "finished-with-tracked-followups"
situation, and the honesty standard forbids borrowing that disposition here. In
those precedents the residue was **R3, operator-gated** schema-convergence or an
explicit non-goal. Here the headline residue — the S3 ledger half — is the
assessment's own **R2, pre-authorized, additive, buildable-now** slice (AMD-002
rev 2 standing authorization, assessment §7). It is not parked because it needs an
operator; it is simply unbuilt. It also directly closes the module's most-referenced
gap: G2's "`workspace_lease_id` is required everywhere in the gateway, minted /
resolved / expired by nothing" — a *durable, resolvable* lease. A pure primitive
that mints and evaluates a lease OBJECT passed to it does not close that gap;
nothing yet persists a lease or resolves one by id. Marking the module FINISHED (even
"with followups") would risk the tracker closing MOD-WSPACE while a named R2 slice
of its own plan sits at ~50%.

The three pieces that DID land are individually sound and correctly ratified — this
NOT_FINISHED verdict is a **module-completeness** ruling, not a defect finding. The
composition smoke and full suite are green; no blocking findings in the landed code.

---

## Numbering clarification (critical — read before the G-table)

The dispatch-local slice labels in the source headers do **not** all match the
assessment's slice numbers, and one label collides. The authoritative mapping is by
**gap / assessment slice**, never by dispatch label:

| Assessment slice (§4) | Closes | Landed file | Source header self-label | Status |
|---|---|---|---|---|
| **S1** write-set control evaluator | G1 (advances G5) | `src/control/write-set-policy.mjs` | "MOD-WSPACE Slice S1" | **CLOSED** (PR #37) |
| **S2** overlap-class O0–O5 evaluator | G5 | `src/control/overlap-policy.mjs` | "MOD-WSPACE Slice S2 — Overlap-class" | **CLOSED** (PR #46 — the genuine assessment-S2) |
| **S3** lease schema + `WorkspaceLeaseLedger` + `resolveActiveLease` + validator registration | G2, G6 | *(ledger half ABSENT)* + `src/control/workspace-lease-policy.mjs` (primitive only) | "MOD-WSPACE Slice S2 (this dispatch)" | **PARTIAL** — primitive landed (PR #42/#44); ledger half OPEN |

**The collision:** `workspace-lease-policy.mjs` self-labels "Slice **S2** (this
dispatch)" while `overlap-policy.mjs` also labels itself "Slice S2". These are two
different dispatches. The lease file's own "SCOPE DIVERGENCE FROM ASSESSMENT S3"
note (lines 13–25) resolves the ambiguity honestly: it is a **subset of assessment
S3**, NOT the assessment's S2. So:

- assessment **S1** (G1, write-set) = CLOSED
- assessment **S2** (G5, overlap) = CLOSED
- assessment **S3** (G2 + G6, lease durable record) = **PARTIAL** — pure lifecycle
  primitive only; schema + `WorkspaceLeaseLedger` + `resolveActiveLease` + validator
  registration remain OPEN.

**First-hand confirmation of the open half** (grep at `3f74683`): no
`contracts/workspace-lease.schema.json`; no `WorkspaceLeaseLedger` class anywhere in
`src/` (the only hit is a comment in the primitive naming the S3 scope it is *not*
doing); no `resolveActiveLease` anywhere in `src/`/`tools/`/`tests/`; no
`workspace-lease` in `src/contracts/contract-validator.mjs` `schemaPaths` or in
`tools/validate-foundation.mjs` `expectedSchemas`.

---

## Whole-module composition smoke (first-hand)

Independent harness exercised the three pieces together (fresh vectors, run in-tree,
never committed). **All assertions pass.**

| Piece | Probe | Outcome |
|---|---|---|
| S1 write-set | allowed subset | `ok:true` |
| S1 write-set | prohibited-prefix hit | `DENY_WRITE_SET_PROHIBITED` (prohibited wins over allowed) |
| S1 write-set | outside allowed | `DENY_WRITE_SET_OUTSIDE_ALLOWED` |
| S1 write-set | `..` traversal | `DENY_WRITE_SET_TRAVERSAL` |
| S1 write-set | malformed input (`null`) | `DENY_WRITE_SET_MALFORMED` (deny-by-default) |
| S2 overlap | O0 separate → O5 protected (all six rows) | each returns the exact O-class + verbatim doctrine control |
| S2 overlap | O2 derived from actual path overlap | `O2` derived by reusing S1 containment, not a caller flag |
| S2 overlap | non-boolean dimension | `DENY_OVERLAP_UNKNOWN_CLASS` (most-restrictive-on-malformed) |
| S3 primitive | mint | frozen lease, `expiresAt = issuedAt + ttl` |
| S3 primitive | evaluate at `now === expiresAt` | `DENY_LEASE_EXPIRED` (**expiry fail-closed**, `>=` boundary) |
| S3 primitive | evaluate widening request | `DENY_LEASE_WRITE_SET_EXCEEDED` (**no widening**) |
| S3 primitive | renew | new frozen lease, re-anchored expiry, **writeSet unchanged** (renewal never widens) |
| Composition | disjoint leased write sets → overlap-class | `O0` / Parallel |
| Composition | agent A requests a path in agent B's leased area | `DENY_LEASE_WRITE_SET_EXCEEDED`, `detail: DENY_WRITE_SET_OUTSIDE_ALLOWED` |

**Compose + no-drift confirmed.** Both `overlap-policy.mjs` and
`workspace-lease-policy.mjs` `import { evaluateWriteSet }` from
`write-set-policy.mjs` and consume it **read-only** — the lease deny surfacing the
underlying `DENY_WRITE_SET_OUTSIDE_ALLOWED` in its `detail` field, and the overlap
O2 derivation flowing through the same containment, both prove the reuse is live and
not reimplemented. The source carries byte-identity guard tests pinning
`write-set-policy.mjs` unmodified from both consumers, plus parity tests, so the
three cannot silently diverge. Each evaluator is **deny-by-default** (malformed →
frozen denial, never a permissive default) with **atomic single-read snapshot** of
all consulted fields (hostile getter / Proxy trap / poisoned iterator contained to a
MALFORMED denial, never thrown) and **deep-frozen** outputs. Audit-before-effect
holds by construction: each returned frozen result IS the decision record and no
piece has a side effect of its own.

---

## G-coverage ruling (against the assessment's G1–G7 text, read first-hand)

| Gap | Assessment text (abridged) | Status | Finding |
|---|---|---|---|
| **G1** | Write-set control primitive — evaluate a concrete candidate write set vs an effective WP's `allowed_paths`/`prohibited_paths`; deny widening/prohibited/traversal/absolute | **CLOSED** | S1 `write-set-policy.mjs`: six deny codes, prohibited-beats-allowed precedence, canonical-grammar + Windows-collapse hardening, `pathSubset` parity + byte-identity guards. Smoke green. |
| **G2** | Lease lifecycle primitive — mint / track / expire / renew a lease; single-writer conflict denial for overlapping write sets | **PARTIAL** | Lifecycle **primitive** closed (`workspace-lease-policy.mjs`: mint/evaluate/renew, fail-closed expiry, no-widen). **OPEN:** the *durable* half — no `WorkspaceLeaseLedger` to **track** a lease, no `resolveActiveLease` to resolve one by id, and **no single-writer conflict denial** (deferred; needs a lease-granting authority + the ledger). This is the module's headline gap ("required everywhere, owned nowhere") and it is only half-closed. |
| **G3** | Worktree + namespace creation — create an isolated worktree, allocate a namespace, bind to lease + baseline | **MISSING (by design)** | Honest non-goal §5 #1 — `git worktree add` / namespace allocation spawns processes + touches the filesystem, forbidden by the in-process posture; R3/R4 operator-gated. Correctly out of the additive plan. |
| **G4** | Session/runtime state-machine coverage for `WORKSPACE_LEASED` / `LEASE_EXPIRED` / `LEASE_REVOKED` | **MISSING (by design)** | Honest non-goal §5 #2 — `state-machine.mjs` is a live authority-semantics kernel file; widening it is R3. Out of scope. |
| **G5** | Overlap-class evaluator — classify two declared write sets into O0–O5 and return the doctrine control | **CLOSED** | S2 `overlap-policy.mjs`: verbatim O0–O5 ladder, doc-parity test vs `parallel-execution.md`, O2 overlap DERIVED via reused S1 containment, most-restrictive-on-malformed. Smoke green all six rows. |
| **G6** | Contract-validator / foundation-validator registration for a workspace schema kind (mechanical) | **PENDING (still triggered only when the S3 schema lands)** | Confirmed first-hand: no `workspace-lease` in `contract-validator.mjs` `schemaPaths` set-equality nor in `validate-foundation.mjs` `expectedSchemas` / `mandatoryIdentityFields`. Mechanical, but genuinely OPEN — it is part of the un-landed S3 ledger half, not a separately-closeable item. |
| **G7** | P0 backlog anchor for workspace orchestration as a deliverable | **OPEN (operator)** | Non-goal §5 #8 — adding a P0 backlog line is an operator/portfolio decision a slice plan cannot make. Correctly deferred. |

**Tally: 2 closed (G1, G5) · 1 partial-headline (G2) · 1 pending-mechanical bundled with S3 (G6) · 2 missing-by-design R3/R4 (G3, G4) · 1 operator (G7).** The two by-design-missing gaps (G3, G4) and G7 are defensible as honest non-goals; the module cannot be fully "done" in-process for worktree/namespace. The deciding item is **G2 partial + G6 pending**, both attributable to the single un-landed R2 slice (S3 ledger half).

---

## Follow-ups (precise, ordered by priority)

1. **HEADLINE — assessment S3 ledger half (OPEN, R2, pre-authorized, additive, buildable-now).** Land the four un-built S3 artifacts: (a) `contracts/workspace-lease.schema.json` (closed `additionalProperties:false` schema with the identity + `allowed_paths`/`prohibited_paths` + `granted_at`/`expires_at` + `content_hash` fields); (b) `src/ledger/workspace-lease-ledger.mjs` — `WorkspaceLeaseLedger extends DurableLedger`, thin-subclass pattern like `CheckpointLedger`/`EventLedger`; (c) `resolveActiveLease(workspaceLeaseId, { now })` — fail-closed on unknown lease, on expired lease (`now >= expires_at`), and on tamper; (d) validator registration — add `workspace-lease` to `contract-validator.mjs` `schemaPaths` (set-equality) and to `validate-foundation.mjs` `expectedSchemas` + `mandatoryIdentityFields`. Closes G2's durable half and **G6**. This is the item whose absence drives the NOT_FINISHED verdict.
2. **G6 validator registration (mechanical).** Not separately closeable — it lands with follow-up #1's schema. Recorded so the tracker does not treat G6 as independently done.
3. **Single-writer / lease-conflict denial (part of G2, OPEN).** Deciding that two overlapping *active* leases conflict and blocking the second needs a lease-granting authority + the ledger (#1). Assessment non-goal §5 #5; sequenced after the ledger exists.
4. **G3 worktree / namespace creation (OPEN by design, R3/R4).** Filesystem + process spawn; operator-gated. Non-goal §5 #1.
5. **G4 session state-machine lease states (OPEN by design, R3).** `WORKSPACE_LEASED` / `LEASE_EXPIRED` / `LEASE_REVOKED` in `STATE_MACHINES.Session` — live kernel edit. Non-goal §5 #2.
6. **Gateway lease wiring (B5, OPEN by design, R3).** `mcp-gateway-core.mjs` still consumes `workspace_lease_id` opaquely (mints/resolves/expires nothing); wiring it to require a resolvable, unexpired, conflict-free lease changes a live enforcement path. Non-goal §5 #3. Byte-identity guard tests confirm the gateway is untouched.
7. **G7 P0 backlog anchor (OPEN, operator).** Non-goal §5 #8.
8. **WSPACE-S1 two-lane TOCTOU history (CLOSED — INFO only).** The write-set primitive passed through S1 rework / regate / consolidation with a fail-closed single-read extraction hardening (REV-002: contained hostile getter / Proxy trap / poisoned `Symbol.iterator`, each field read exactly once) closing the earlier two-lane TOCTOU concern. Verified closed first-hand (the "single-read: a getter returning DIFFERENT arrays per read cannot influence the decision" and poisoned-iterator tests pass). No residual; noted for provenance completeness.

---

## Measured totals (first-hand, exact, at `3f74683`)

| Measure | Expected | Measured | Match |
|---|---|---|---|
| `npm test` total | 1062 | **1062** | yes |
| `npm test` pass | 1057 | **1057** | yes |
| `npm test` fail | 0 | **0** | yes |
| `npm test` skipped | 5 | **5** | yes |
| `npm run validate` exit | 0 | **0** | yes |

Change surface of THIS review vs main `3f74683`: 2 files — this record + its root
`MANIFEST.json` entry. No `src/**`, `contracts/**`, `tools/**`, `docs/templates/**`,
or `docs/03-project-control/effective/**` touched.

---

## Findings by severity

**BLOCKER: none. HIGH: none. MEDIUM: none.** (No defect in the landed code; the
NOT_FINISHED verdict is a module-completeness ruling, not a code fault.)

- **INFO-1 (numbering hygiene).** `workspace-lease-policy.mjs` self-labels "Slice S2
  (this dispatch)", colliding with `overlap-policy.mjs`'s "Slice S2". The file's own
  scope-divergence note correctly maps it to a *subset of assessment S3*. Recommend a
  future producer relabel the header to "assessment-S3 primitive subset" so the label
  matches the gap it closes (G2), removing the collision. Advisory only.
- **INFO-2 (expected, load-bearing).** The lease pillar is durable-half-open by the
  same honest disposition the assessment itself set: only pure in-process primitives
  were in the S1–S3 additive plan, and S3's ledger half was pre-authorized but has not
  yet been produced. Recorded so the tracker carries "S3 ledger half OPEN" explicitly
  rather than reading the three merged PRs as a finished module.

---

## Advisory status fields

- truth_status: verified_true (validator, full suite 1062/1057/0/5, whole-module composition smoke, and the S3-ledger-half absence all reproduced first-hand at `3f74683`)
- authority_status: advisory_only (module verdict is a recommendation; the S3 ledger half is pre-authorized R2 additive work for a producer, and every wiring/creation item is execution_requires_operator)
- implementation_status: partial (S1 write-set + S2 overlap + S3 lease *primitive* are live in-module; the S3 ledger half — schema + `WorkspaceLeaseLedger` + `resolveActiveLease` + validator registration — is missing; G3/G4/gateway-wiring are blocked/non-goal)
- risk_class: medium (the landed pieces are pure, unwired, deny-by-default evaluators with no new ALLOW and no live authority surface; the risk is completeness/provenance — a half-built lease pillar being read as done — not a security defect)

## Authority boundary

This is an advisory module-completion review. It changes no production code,
contract, schema, template, effective receipt, policy, or ADR beyond adding this
review record to the root MANIFEST. No branch was pushed and nothing was merged.
Operator ratification is required before MOD-WSPACE's tracker status is set and
before the S3 ledger half (follow-up #1) is produced.

```yaml
self_certification:
  agent_id: claude-immune
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
