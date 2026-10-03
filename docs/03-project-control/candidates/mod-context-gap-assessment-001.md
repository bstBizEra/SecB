# MOD-CONTEXT Gap Assessment (001)

- record_id: MOD-CONTEXT-000-ASSESS-001
- status: CANDIDATE (advisory gap assessment; operator ratification required before any slice is built)
- planner: claude-cortex-modcontext-assess-01 (BST-SA cortex agent, module-loop planner identity)
- module: MOD-CONTEXT Context Federation (catalog scope: "Context receipts, retrieval and compaction", P0 priority High)
- base_of_record: unified main @ f04dee6 (assessed first-hand in an isolated worktree)
- tracker: docs/03-project-control/candidates/module-completion-tracker-001.md (row 8, "partial — ContextFederationService P0-10 R2 delivered on lineage")
- governance: AMD-002 advise-and-proceed; AGENTS.md worker-not-authority; advisory-only, non-main branch, no push, no merge
- date: 2026-07-20

All inventory and gap evidence below was read from the actual code, contracts, and
docs at f04dee6. The foundation validator was run first-hand (exit 0) before and
after adding this record. No production code, contract, schema, or policy was
mutated; this record is the sole output artifact.

## 1. Inventory (what exists at f04dee6)

### Code

- `src/services/context-federation-service.mjs` — ContextFederationService, the sole
  authoritative boundary for Context Receipts (P0-10 R2; GOV-P010-01..07 adopted,
  R2 gate waived 2026-07-19). Public API, studied first-hand:
  - `issueReceipt(request)` — mints a version-1 receipt. Requires the caller to
    supply a fully-formed `document` (validated against contextReceipt schema) whose
    `content_hash` already equals the server seal (canonical fingerprint over the
    document with `content_hash` excluded). Runs `runRetrieval` over
    `candidateSources`; enforces set-equality between the sealed `source_references`
    and the subtractive survivor set (no smuggling, no duplicate under-claim). Live
    work-package effectiveness at issuance (`resolveEffective` ALLOW), baseline
    triple-equality, and `authority_scope` path-subset of the effective contract's
    approved paths. Idempotent by `idempotencyKey`. Records an ISSUE ledger entry;
    status ISSUED.
  - `verifyReceipt(projectId, receiptId, ctx)` — READ-ONLY fail-closed provenance
    gate (no ledger mutation). Re-verifies seal, session binding, baseline, expiry,
    live effectiveness, and bound-version equality. Used as the offer-time gate by
    composing services so a receipt is never CONSUME-marked for an operation that
    may still deny downstream.
  - `consumeReceipt(projectId, receiptId, ctx)` — same resolution, then on ALLOW
    appends a CONSUME ledger entry.
  - `compactReceipt(projectId, receiptId, compaction, {idempotencyKey})` —
    chain-and-supersede compaction: version N+1, subset-only across
    source_references / allowed_tools / allowed_skills / authority_scope,
    expires_at inherited (never extended), re-passes effectiveness; parent flips to
    SUPERSEDED (deny-on-use).
  - `revokeReceipt(projectId, receiptId, {actorId, role})` — role must equal "GOV";
    marks every version REVOKED and appends a REVOKE ledger entry. Header note: full
    grant-binding is a mutation-substrate concern (R1 honesty parity), so the GOV
    role is asserted, not cryptographically bound.
  - `getReceipt`, `getReceiptLedger` — read projections.
- `src/services/context-retrieval-policy.mjs` — `runRetrieval(candidates, {projectId,
  classificationCeiling, minimumSufficient})`. The SECB-OM-CONTEXT-001 seven-stage
  order as a pure, ordered, subtractive, fail-closed pipeline: stages 1-5 remove
  (project-scope, authority-filter, temporal, verification, exact-source), stage 6
  reorders by relevance only, stage 7 removes the minimum-sufficient tail. Every
  removal is recorded in `exclusions`. A candidate is shaped `{ref, projectId,
  classification, verified, current, resolvable, relevance}`.
- `src/services/handoff-service.mjs` — HandoffService (P0-11). At R2 it consumes a
  receipt through an injected `receiptResolver` (consumeReceipt-shaped) and enforces
  the binding tuple (receipt project / work_package / session / baseline must equal
  the envelope's) — this is the live cross-module consumer of MOD-CONTEXT.

### Contracts

- `contracts/context-receipt.schema.json` — the machine schema the service validates
  against. Closed object, 17 required fields (receipt_id, version, project_id,
  objective_id, work_package_id, session_id, assigned_role, authority_scope,
  baseline_version, acceptance_criteria, allowed_tools, allowed_skills,
  evidence_obligations, freshness_timestamp, source_references, content_hash). It
  carries NO document-level exclusions, redactions, expiry, revocation, or
  token-budget fields — those live in the service record, not the sealed document.
- `contracts/handoff-envelope.schema.json` — the consumer envelope; references a
  receipt by `context_receipt_ref` at the service layer.

### Docs and templates

- Legacy `docs/02-operating-model/context-receipt-and-handoff.md` (SECB-OM-CONTEXT-001,
  DRAFT): the seven-stage retrieval order plus a receipt field list that DOES require
  exclusions, redactions, and revocation status.
- v0.1 `docs/12-execution/07-context-and-handoff.md` and
  `docs/15-knowledge/03-memory-and-context.md`: memory layers, retrieval order,
  and the prohibitions on caller-declared authority and implicit cross-project
  fallback.
- `docs/templates/context-receipt.yaml` (schema_version 0.1): richer field set with
  token_budget and integrity_sha256, no exclusions.
- `docs/03-project-control/effective/context-receipts/*.yaml` (schema_version 1.0,
  hand-authored operator receipts): richer still — authority_packet_ref,
  workspace_lease_id, agent_instance_id, agent_session_id, issued_at, expires_at,
  receipt_sha256.

## 2. Gap table (with evidence)

| # | Gap | Evidence | Impl status | Assessment |
|---|-----|----------|-------------|------------|
| G1 | Issuance-as-code is a VERIFIER, not a MINTER. Nothing constructs a valid receipt; the caller must pre-run retrieval, assemble the document, and precompute the exact server seal before `issueReceipt` will accept it. | `issueReceipt` recomputes `#seal(document)` and denies unless it equals `document.content_hash`; it also denies unless `source_references` exactly equals the `runRetrieval` survivor set. A caller must therefore duplicate both the seal and the retrieval logic to mint anything. No mint helper exists in the module. | partial | Primary usability/issuance gap. Highest-value slice. |
| G2 | Three divergent receipt shapes; the operator-authored receipts cannot be consumed by the service. | Machine schema = 17 closed fields with `session_id`; effective YAML uses `agent_session_id` / `agent_instance_id` / `authority_packet_ref` under `additionalProperties:false` semantics; template is schema_version 0.1 with `token_budget`. The code path and the hand-authored artifact path never meet. | partial | "Who mints receipts today" = operators, by hand, in a schema the service rejects. Convergence needed. |
| G3 | Document-level exclusions / redactions / revocation provenance missing. | SECB-OM-CONTEXT-001 requires the receipt to carry exclusions, redactions, and revocation status. In code these live in the service RECORD (`retrieval.exclusions`, `record.status`), not the sealed document, and the schema has no field for them. A forwarded receipt (e.g. via handoff `context_receipt_ref`) carries no subtractive-compaction proof. | partial | Weakens the "proves what was excluded" property for forwarded receipts. |
| G4 | No governed retrieval READ model / provider port. `runRetrieval` is pure and only invoked internally over a caller-supplied `candidateSources` ARRAY with no provenance contract. | `context-federation-service.mjs` line ~123 calls `runRetrieval(candidateSources, ...)`; `candidateSources` is a raw request field defaulting to `[]`. Nothing sources candidates from real stores. | missing (interface) / partial (policy) | The retrieval POLICY exists; the retrieval INTERFACE (a provider port) does not. See boundary note B1 — the sourcing belongs to MOD-MEM/MOD-KNOW; MOD-CONTEXT owns the port + the governed filter. |
| G5 | Receipt-lifecycle compaction EXISTS; context-payload / token-budget compaction does not. | `compactReceipt` implements subset-only chain-and-supersede. The receipt references sources; it has no context payload to summarize, and `token_budget` is absent from the machine schema and the service. | existing (receipt compaction) / deferred (payload compaction) | P0 bar for "compaction" is met by receipt compaction. Payload/token compaction is a MOD-MEM concern; defer (non-goal). |
| G6 | Lifecycle state completeness: issue→bind→verify→consume→compact→expire→revoke — CONSUMED and EXPIRED are not first-class states. | States in code: ISSUED, SUPERSEDED, REVOKED (stored `record.status`); EXPIRED is computed from `expiresAt` at resolve time; CONSUME is a ledger event, not a status. `getReceipt` exposes status only. | partial | Lifecycle is functionally complete; the missing piece is an explicit, queryable derived state (EXPIRED/CONSUMED) in read projections plus an authoritative lifecycle doc. |
| G7 | Receipts and their ledger are in-memory only; not on the seven-ledger durable brain. | `#receipts` / `#idempotency` are in-process `Map`s; no `src/ledger/**` write. | partial | Durable persistence is a MOD-RUNTIME/MOD-EVID integration concern; flag, do not build here (non-goal for this module's P0 bar). |
| G8 | Seal is caller-controlled; no independent issuer signature. | Code header honesty note: the caller controls both document and hash, so the seal is tamper-evidence for the STORED/FORWARDED receipt, not source authentication. | existing-with-known-limit | Acceptable for P0; a real issuer signature is R4 authority substrate — non-goal. |

Gap counts: 8 gaps total — 0 critical, 1 high-value primary (G1), 5 partial
(G2, G3, G4, G6, G7), 1 deferred/non-goal (G5), 1 known-limit accepted (G8).

## 3. Boundary notes (drawn honestly)

- B1 — Retrieval boundary. MOD-CONTEXT owns the GOVERNED FILTER (the seven-stage
  subtractive policy) and the RECEIPT that binds its result; it does NOT own the
  stores. Candidate SOURCING is MOD-MEM (scoped temporal memory: session / work /
  project / org / procedural layers) and MOD-KNOW (approved knowledge claims,
  contradictions, provenance, supersession — the material for retrieval stages 4-5).
  The honest "retrieval interface" for MOD-CONTEXT is therefore a PROVIDER PORT that
  MOD-MEM/MOD-KNOW plug into, not a memory store rebuilt here.
- B2 — Compaction boundary. Receipt compaction (subset chain-and-supersede) is
  MOD-CONTEXT. Context-payload / token-budget compaction (summarization of recalled
  content) is MOD-MEM. The catalog word "compaction" is satisfied by receipt
  compaction at P0.
- B3 — Consumer boundary. HandoffService (MOD-A2A lineage) is the live consumer via
  `receiptResolver`; MOD-CONTEXT must not absorb handoff semantics. The binding-tuple
  check stays a shared contract, enforced on both sides.
- B4 — Persistence boundary. Durable-ledger persistence of receipts is MOD-RUNTIME /
  MOD-EVID; MOD-CONTEXT exposes the ledger read model, it does not own durability.

## 4. Bounded plan (<=3 slices)

### Slice S1 — Receipt mint helper (closes G1)

Add a pure `mintReceiptDocument({intent fields, candidateSources, classification
ceiling, minimumSufficient})` that runs `runRetrieval`, assembles a schema-valid
document, and computes the canonical seal using the SAME seal function the service
uses, returning `{document, exclusions}` ready for `issueReceipt`. Refactor so the
seal and retrieval are shared (single source of truth) between mint and issue, and
mint cannot drift from what issue will accept. Behavior of every existing deny path
is preserved unchanged. Deliverable: helper module + unit tests proving a minted
document round-trips through `issueReceipt` with no reimplemented seal.

### Slice S2 — Retrieval provider port + document exclusions provenance (closes G3, G4)

(a) Define a typed CandidateSource provider-port contract (`ref, projectId,
classification, verified, current, resolvable, relevance`) as the documented
MOD-MEM/MOD-KNOW to MOD-CONTEXT boundary, so retrieval accepts governed provenance
rather than a raw array; wire `candidateSources` to accept a provider result while
keeping the array form for tests. (b) Bind the retrieval `exclusions` manifest to the
receipt so a forwarded receipt proves subtractive compaction — either as an OPTIONAL
additive schema field or as a separately-sealed retrieval manifest referenced by the
receipt. Keep additive/optional so the existing closed-schema validator and the live
issue path do not break.

### Slice S3 — Schema convergence + authoritative lifecycle doc (closes G2, G6)

Reconcile the three receipt shapes: map the effective YAML (1.0) and template (0.1)
onto the machine schema, documenting which fields are document-sealed vs
service-record vs operator-envelope. Add an authoritative MOD-CONTEXT lifecycle doc
covering issue→bind→verify→consume→compact→expire→revoke, and surface EXPIRED /
CONSUMED as explicit derived states in `getReceipt` read output. No deny-path change.

Slices are ordered by dependency and value: S1 is standalone and highest value; S2
depends on S1's shared seal; S3 is documentation-plus-read-model and can land last.

## 5. Non-goals

- Building MOD-MEM stores or MOD-KNOW claim/contradiction/supersession engines.
- Context-payload / token-budget compaction (summarization of recalled content) — B2.
- Durable-ledger persistence of receipts (MOD-RUNTIME / MOD-EVID) — G7 / B4.
- Cryptographic issuer signatures / independent source authentication — G8.
- Cross-session receipt sharing beyond the handoff re-binding path.
- Any change to HandoffService semantics or the P0-11 binding contract.

## 6. R-class flags

- R2-adjacent (S1): `issueReceipt` is a LIVE P0-10 R2 authority boundary. Sharing its
  seal + retrieval with a mint helper is a refactor of a live authority surface. It
  MUST be behavior-preserving and independently reviewed; the mint helper adds a
  construction path, never a new ALLOW.
- R3 (S2): adding a field to `contracts/context-receipt.schema.json` and formalizing
  the CandidateSource provider-port are contract changes. The provider inputs
  (classification / verified / current / resolvable) DRIVE retrieval stage 2/3/4/5
  denials, so the port is authority-relevant. Additions must stay optional and pass
  the foundation validator's closed-schema and identity-field checks. Operator-gated.
- R3/R4 (flag only, NOT in this plan): `revokeReceipt` asserts the GOV role without
  grant-binding (code honesty note). Any tightening to bind the grant, or any change
  to the seal/scope-widening/source-mismatch deny logic, is an authority-policy change
  (R3 minimum, R4 if it touches grant substrate) and is out of scope here.
- No slice self-authorizes execution; all three are candidates for the operator queue.

## 7. Advisory status fields

- truth_status: verified_true (inventory and every gap reproduced first-hand from
  code, contracts, and docs at f04dee6; validator run first-hand, exit 0)
- authority_status: advisory_only
- implementation_status: partial (receipt lifecycle + retrieval policy + compaction
  exist; mint helper, retrieval provider port, exclusions provenance, and schema
  convergence are missing)
- risk_class: medium (the module is a live authority boundary; the highest-value slice
  refactors a shared seal and one slice changes a contract — both operator-gated)

## 8. Authority boundary

This is an advisory gap assessment only. No slice was built; no production code,
contract, schema, policy, or ADR was mutated; no branch was pushed and nothing was
merged. Operator ratification is required before any slice enters the build queue.

```yaml
self_certification:
  agent_id: claude-cortex-modcontext-assess-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
