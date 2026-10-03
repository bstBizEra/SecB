# MOD-MEM Gap Assessment (001)

- record_id: MOD-MEM-000-ASSESS-001
- status: CANDIDATE (advisory gap assessment; operator ratification required before any slice is built)
- planner: claude-cortex-modmem-assess-01 (BST-SA cortex agent, module-loop planner identity)
- module: MOD-MEM Memory Gateway (catalog scope: "Scoped temporal memory", P0 priority High)
- base_of_record: unified main @ f04dee6 (assessed first-hand in an isolated worktree)
- tracker: docs/03-project-control/candidates/module-completion-tracker-001.md (row 10, "QUEUED — temporal ledgers P0-14 delivered; gateway facade missing")
- boundary_contract: mod-context-gap-assessment-001.md (bst/mod-context-assessment), notes B1/B2 — MOD-MEM owns candidate-source stores (temporal memory layers) and payload/token compaction; MOD-CONTEXT owns the governed filter, receipt binding, and the CandidateSource provider port; MOD-KNOW owns claims/contradictions/supersession engines
- governance: AMD-002 advise-and-proceed; AGENTS.md worker-not-authority; advisory-only, non-main branch, no push, no merge
- date: 2026-07-20

All inventory and gap evidence below was read from the actual code, contracts, and
docs at f04dee6 (plus the referenced provider-port candidate at 37352c6). The
foundation validator was run first-hand (exit 0) before and after adding this
record. No production code, contract, schema, or policy was mutated; this record
is the sole output artifact.

## 1. Inventory (what exists at f04dee6)

### Code

- `src/ledger/temporal-ledgers.mjs` (P0-14) — the three temporal ledgers, studied
  first-hand:
  - `DecisionLedger` — append with validity window (`valid_from` < `valid_until`),
    REVERSION-only suppression (reverts must name an EXISTING decision; only
    REVERSION may carry `reverts`), fail-closed `resolveEffective(id, {at})`
    returning typed DENY codes (INVALID_INSTANT / UNKNOWN_DECISION / REVERTED /
    TEMPORAL_BOUNDARY) — deny-on-use, no timer-driven pruning.
  - `KnowledgeLedger` — `appendClaim` enforces the LEARNING BOUNDARY: every
    `evidence_refs` entry must resolve through the injected `evidenceLookup` to an
    envelope whose `evidence_id` matches the ref AND whose `verification_status`
    is VERIFIED or ACCEPTED; `resolveClaim(id, {at})` is window-bounded, expired
    claims DENY rather than decay (V-012).
  - `OutcomeLedger` — outcome receipts bound to resolvable decisions with enforced
    reversion-obligation consistency (V-018).
  - Scoping as implemented: every entry carries `project_id` / `work_package_id` /
    `session_id` / `actor_id` (required-present via DurableLedger), but these are
    RECORDED identity fields, not enforced admission authority — any caller
    holding a ledger handle can append, and no session/work/project/org LAYER
    concept exists in code.
  - Header consumer obligation (verbatim concern): resolution instants `at` are
    caller-supplied — "temporal-query APIs, not enforcement clocks"; an enforcing
    consumer must supply a trusted server-derived instant.
- `src/ledger/governed-ledgers.mjs` — EventLedger + EvidenceLedger (schema-
  validated appends over the same DurableLedger).
- `src/ledger/durable-ledger.mjs` — hash-chained, sequence-checked, idempotent
  append-only store with corruption detection. No TTL or pruning writer (by
  design: deny-on-use).
- Wiring reality: `KnowledgeLedger` and `OutcomeLedger` are EXPORTED from
  `src/index.mjs` but composed by NO service — `grep` finds no runtime consumer.
  `DecisionLedger` is live (work-package-service, handoff-service SoD/effective
  checks, skill-resolver approval binding). The knowledge side of P0-14 is a
  delivered-but-unwired substrate.
- `src/control/sod-rules.mjs` (MOD-GOV S1, on main) — the kernel SoD primitive:
  `normalizeRole`, `checkConflictingRoles`, `checkProhibitedActors` (ladder),
  `checkPairwiseDistinct`. Canonical role list already carries EVIDENCE_PRODUCER /
  EVIDENCE_VERIFIER / EVIDENCE_ACCEPTOR precedent; no memory-admission roles yet.
  This is the reuse target for admission SoD.
- `src/mcp/tool-catalog.mjs` — nine read-only tools (work-package/project
  resolve-effective, ledger verify summary, events/evidence read, skill/registry
  resolve, contract validate, canonical fingerprint). NO memory tools: no
  knowledge-claim read, no decision read, no admission surface. MOD-MEM has zero
  MCP exposure today.
- `src/registry/skill-resolver.mjs` — procedural-memory READ path exists but is
  MOD-SKILL-owned (approval bound to the governed DecisionLedger); boundary only.

### Contracts

- `contracts/knowledge-claim.schema.json` — closed 14-field schema: full identity
  tuple, statement/derivation, `truth_status` enum, `evidence_refs` (minItems 1),
  temporal window, `retention_policy`. Note: NO layer, confidence, access-policy,
  contradictions, or supersedes fields.
- No memory-record contract of any kind exists in `contracts/`.

### Docs (doctrine)

- `docs/15-knowledge/03-memory-and-context.md` — five memory layers (Session /
  Work / Project / Organizational / Procedural), the retrieval order, and the
  record requirements: "immutable IDs, provenance, confidence, access policy,
  retention, integrity and supersession. Caller-declared authority and implicit
  cross-project fallback are prohibited."
- Legacy `docs/06-intelligence/memory-and-knowledge.md` (SECB-MEM-KNOW-001,
  DRAFT/RED/NOT EFFECTIVE) — same five layers, the seven ledgers, the ADMISSION
  PIPELINE (capture → classification → evidence verification → dedup/contradiction
  → scope+temporal → confidence → independent review → approval → admission), and
  critical controls including "token budgeting and hierarchical compaction".
- `docs/15-knowledge/02-evidence-knowledge-skill.md` — admission prohibitions
  (no transcript-to-knowledge automatic promotion; no unsupported inference as
  fact; no vector similarity overriding scope/temporal state).
- Memory pollution guard status: the literal phrase appears NOWHERE in the repo —
  it is a global BST-SA contract term. In-repo it exists as (a) doctrine (the
  admission pipeline + prohibitions above) and (b) exactly ONE enforced-in-code
  control: the KnowledgeLedger learning boundary. Everything upstream of that
  single check (classification, dedup, scope determination, independent review,
  approval) is doctrine without a code home.

### Cross-branch (not on main; dependency context only)

- `src/services/candidate-source-port.mjs` @ 37352c6 (bst/mod-context-s2-provider-
  port, itself an R3 CANDIDATE awaiting operator gate) — the B1 boundary port.
  Reserves kind `"memory"` for "MOD-MEM scoped temporal memory layers". Entry
  shape MOD-MEM must produce: `{id, kind, project_id, classification
  (PUBLIC|INTERNAL|CONFIDENTIAL|RESTRICTED), verified, current, resolvable,
  relevance?, provenance {origin, retrieved_at, content_hash?}}`, validated
  fail-closed with typed stage-0 exclusions.

## 2. Gap table (with evidence)

| # | Gap | Evidence | Impl status | Assessment |
|---|-----|----------|-------------|------------|
| G1 | No memory-gateway service as code. Admission today is an unguarded ledger append: identity fields are recorded, never authorized. The doctrine's admission pipeline (review → approval → admission) and "who may admit what into which layer" have no code home. | `temporal-ledgers.mjs` validates SHAPE and evidence chain only; any holder of a ledger handle appends. No `src/services/*memory*` exists. Admission pipeline lives only in SECB-MEM-KNOW-001 (DRAFT/RED). | missing | Primary gap. A deny-by-default gateway is buildable as an additive, unwired candidate (MOD-GOV S3 precedent). |
| G2 | No temporal LAYERING. The five documented layers (session/work/project/org/procedural) do not exist in code or contracts; no memory-record contract carries layer, confidence, access policy, or retention/TTL semantics. | `knowledge-claim.schema.json` has identity + window + retention_policy string but no layer/confidence/access fields; `contracts/` has no memory-record schema; no code mentions the layers. | missing | Requires a new contract (R3). Org layer = MOD-KNOW promotion, procedural = MOD-SKILL — only session/work/project belong to MOD-MEM P0. |
| G3 | No retrieval-as-provider. Nothing produces CandidateSource-shaped entries of kind "memory"; the MOD-CONTEXT port (when it lands) has no MOD-MEM feed, and `candidateSources` remains a raw caller array. | Port reserves kind "memory" (37352c6, comment: "MOD-MEM scoped temporal memory layers"); no adapter exists on main or any branch; MOD-CONTEXT G4 notes "nothing sources candidates from real stores". | missing | The honest MOD-MEM half of MOD-CONTEXT's B1 boundary. Depends on the port candidate being ratified — flagged. |
| G4 | Payload/token compaction primitives absent. Doctrine requires "token budgeting and hierarchical compaction"; no summarization, dedup, or budget primitive exists in MOD-MEM scope. | `grep` finds no compaction code outside `compactReceipt` (MOD-CONTEXT receipt lifecycle, explicitly NOT payload compaction per its B2). | missing (heavy part deferred) | Honest P0 bar: deterministic dedup (content-hash) + token-budget truncation WITH typed exclusion accounting. Semantic summarization is not deterministic kernel code — defer (non-goal). |
| G5 | No admission SoD. The pipeline requires independent review + approval before admission; no SoD check runs at any append. The kernel primitive (`sod-rules.mjs`) exists and is designed for exactly this reuse but has no memory-admission ladder or roles. | `appendClaim` checks evidence status only; `sod-rules.mjs` header lists four current call-site shapes, none memory-related; CANONICAL_ROLES has no MEMORY_* roles. | partial (primitive exists, application missing) | Reuse `checkPairwiseDistinct` / ladder config in the gateway; role-vocabulary addition rides the alias map, not a kernel change. |
| G6 | Knowledge substrate unwired and unreadable. KnowledgeLedger/OutcomeLedger have no composing service and no MCP read tool; admitted knowledge is invisible to the governed tool surface. | `src/index.mjs` exports them; no service constructs them; `tool-catalog.mjs` has no knowledge/decision read tool. | partial | The gateway (G1) is the natural composing consumer; MCP exposure itself is MOD-MCP wave scope — flag, don't build. |
| G7 | Trusted-time enforcement missing. The ledger header explicitly assigns the trusted server-derived `at` instant to "an enforcing consumer"; for knowledge resolution no such consumer exists, so every temporal answer trusts the caller's clock. | `temporal-ledgers.mjs` lines 9–14 (consumer obligation note); no knowledge-side consumer on main. | missing | Closed for free by the gateway supplying server-derived instants on both admit and retrieve paths. |

Gap counts: 7 gaps total — 5 missing (G1, G2, G3, G4, G7), 2 partial (G5, G6);
1 primary (G1); heavy compaction inside G4 deferred as non-goal. 0 gaps require
mutating any existing store's admission semantics.

## 3. Boundary notes (drawn honestly, consistent with MOD-CONTEXT B1/B2)

- B1 — MOD-MEM owns the STORES and their scoped admission (temporal memory
  layers) plus payload/token compaction. MOD-CONTEXT owns the governed seven-stage
  filter, the receipt that binds its result, and the provider PORT. MOD-MEM's job
  is to FEED the port with well-typed kind-"memory" entries; it never re-implements
  the filter and never mints receipts.
- B2 — MOD-KNOW owns claims/contradictions/provenance/supersession ENGINES
  (contradiction analysis, supersession graphs, org-layer promotion). MOD-MEM may
  store and window-resolve claims via the existing KnowledgeLedger, but building
  contradiction/supersession logic here would annex MOD-KNOW — non-goal.
- B3 — Procedural memory is MOD-SKILL (skill-resolver + SkillsHub); MOD-MEM's
  layer model stops at session/work/project for P0.
- B4 — MCP tool exposure of memory reads is MOD-MCP wave governance scope; the
  gateway exposes a service API only.
- B5 — The learning boundary inside `KnowledgeLedger.appendClaim` is a LIVE
  admission control. MOD-MEM composes IN FRONT of it (defense in depth); it never
  relaxes, duplicates-and-diverges, or bypasses it.

## 4. Bounded plan (<=3 slices)

### Slice S1 — MemoryGatewayService: deny-by-default scoped admission (closes G1, G5, G7)

Add `src/services/memory-gateway-service.mjs` as an ADDITIVE, UNWIRED candidate
(MOD-GOV S3 "unwired facade" precedent): nothing existing calls it; the raw
ledger paths keep working unchanged. The gateway composes the EXISTING
KnowledgeLedger (and optionally DecisionLedger/OutcomeLedger read models) and
enforces, fail-closed with typed DENY codes:
(a) layer-scoped admission — an admission request names a target layer
(session|work|project) and the gateway checks the request's identity tuple is
consistent with that layer (session layer requires the admitting session's own
session_id; project layer requires elevated admission roles);
(b) admission SoD via `sod-rules.mjs` reuse — `checkPairwiseDistinct` over
producer vs independent reviewer vs approver for project-layer admission
(session/work layers: producer-only, honestly lighter), role tokens normalized
through the existing alias map;
(c) server-derived instants — the gateway stamps `admitted_at` and supplies the
trusted `at` on every resolve, closing the ledger header's consumer obligation;
(d) pass-through of the learning boundary — evidence checks stay in
`appendClaim`, untouched (defense in depth, never replacement).
Deliverable: service + unit tests proving every deny path and proving raw-ledger
behavior is byte-identical to before (no existing test changes).

### Slice S2 — Memory-record contract + temporal layer semantics (closes G2)

Add `contracts/memory-record.schema.json` (closed schema, house identity style):
`memory_id, version, layer (session|work|project), project_id, work_package_id,
session_id, actor_id, content_ref or statement, classification
(PUBLIC|INTERNAL|CONFIDENTIAL|RESTRICTED — the port vocabulary), confidence,
provenance, valid_from, valid_until, retention_policy, supersedes?` — exactly the
doc-required record fields (immutable ID, provenance, confidence, access policy,
retention, integrity, supersession pointer; supersession GRAPH analysis stays
MOD-KNOW). Wire it into `contract-validator.mjs` and make the S1 gateway validate
admissions against it. TTL stays deny-on-use (window resolution), no pruning
writer — consistent with P0-14 semantics. Scoped retrieval reads (layer + project
filters, cross-project DENY by default) land here as gateway read methods.

### Slice S3 — CandidateSource provider adapter + deterministic compaction floor (closes G3, honest part of G4)

`toCandidateSources({projectId, at})` on the gateway: map window-resolved records
to the port's entry shape — `id` = memory_id, `kind: "memory"`, `project_id`,
`classification` carried through, `verified` = evidence-backed admission status,
`current` = within validity window at the server-derived instant, `resolvable` =
true for ledger-resident records, `provenance {origin: ledgerId, retrieved_at:
server instant, content_hash}`. Plus the deterministic compaction floor:
content-hash dedup and token-budget truncation that RECORDS every dropped entry
as a typed exclusion (mirroring the port's stage-0 accounting). Semantic
summarization stays out. DEPENDENCY FLAG: the port contract lives at 37352c6 on
bst/mod-context-s2-provider-port, itself an operator-gated R3 candidate — S3
must not land before (or must vendor the shape only if) that port is ratified.

Order is strict: S1 is standalone and highest value; S2 gives S1's admissions a
contract; S3 feeds MOD-CONTEXT and is the only slice with a cross-module
dependency.

## 5. Non-goals

- Claims/contradictions/supersession engines, org-layer knowledge promotion — MOD-KNOW (B2).
- The governed seven-stage filter, receipts, or any port-side validation — MOD-CONTEXT (B1).
- Procedural memory / skill intake-eval-promotion — MOD-SKILL (B3).
- Semantic/LLM summarization compaction (non-deterministic; only the dedup + budget floor is in scope).
- MCP tool exposure of memory reads/writes — MOD-MCP wave governance (B4).
- Any change to `KnowledgeLedger.appendClaim`, the learning boundary, evidence
  statuses, or ANY existing store's admission semantics (B5; see R-flags).
- Timer-driven TTL pruning or retention deletion writers (deny-on-use stands).
- Durable-persistence redesign of the ledger substrate.

## 6. R-class flags

- R3+ HARD LINE (flag only, NOT in this plan): memory ADMISSION authority is a
  governance-sensitive surface — the pollution guard doctrine's only enforced
  control is the `appendClaim` learning boundary. ANY modification to admission
  policy for EXISTING stores (learning-boundary statuses, evidence-lookup
  contract, reversion semantics, window enforcement) is R3 minimum and is
  excluded from all three slices. The gateway is strictly additive and
  deny-by-default in FRONT of existing checks; it can only narrow, never widen.
- R2-adjacent (S1): unwired additive facade, but it REUSES the live SoD kernel
  primitive — reuse must be configuration-only (new ladder/role aliases), zero
  changes to `sod-rules.mjs` exported behavior; independent review required.
- R3 (S2): `contracts/memory-record.schema.json` is a NEW contract and its
  registration in the contract validator is a contract-surface change;
  operator-gated, must pass the foundation validator's closed-schema and
  identity-field checks.
- R3 (S3): provider entries drive MOD-CONTEXT retrieval-stage denials
  (classification/verified/current/resolvable), so the adapter is
  authority-relevant; additionally it depends on the UNMERGED 37352c6 port
  candidate — sequencing is operator-controlled, not assumable.
- No slice self-authorizes execution; all three are candidates for the operator
  queue.

## 7. Advisory status fields

- truth_status: verified_true (inventory and every gap reproduced first-hand from
  code, contracts, and docs at f04dee6, plus the port candidate read at 37352c6;
  validator run first-hand, exit 0)
- authority_status: advisory_only
- implementation_status: missing (temporal-ledger substrate exists and is partly
  live, but the module's named scope — a gateway with scoped admission, layers,
  provider retrieval, and compaction — does not exist as code)
- risk_class: medium (admission authority is a hard governance line; the plan
  keeps every existing admission surface untouched and all slices operator-gated)

## 8. Authority boundary

This is an advisory gap assessment only. No slice was built; no production code,
contract, schema, policy, or ADR was mutated; no branch was pushed and nothing
was merged. Operator ratification is required before any slice enters the build
queue.

```yaml
self_certification:
  agent_id: claude-cortex-modmem-assess-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
