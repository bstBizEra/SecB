# MOD-MEM S3 — Memory CandidateSource Provider + Compaction Floor: Producer Verification

- record_id: MOD-MEM-S3-CANDIDATE-PROVIDER-PRODUCER-VERIFICATION-001
- status: CANDIDATE (producer self-verification; operator ratification required before merge)
- producer: claude-motor-mem-s3-01 (BST-SA motor worker agent, this dispatch)
- module: MOD-MEM Memory Gateway, Slice S3 ("CandidateSource provider adapter +
  deterministic compaction floor")
- base: main @ 942d09f (checked out detached in an isolated worktree)
- branch: `bst/mod-mem-s3-candidate-provider`
- source assessment: `mod-mem-gap-assessment-001.md` (`bst/mod-mem-assessment`),
  §4 Slice S3 — the sole source-of-truth read for this slice's scope. No new gap
  analysis was performed; this record builds exactly what that assessment scoped
  for S3, with disclosed design decisions (see §4/§5).
- template mirrored: `src/services/knowledge-candidate-provider.mjs` (MOD-KNOW S3,
  the already-merged R2 analogue) and its test — structure, purity, fail-closed
  style, per-ref exclusion accounting, deep-freeze, and feed-forward proof.
- date: 2026-07-22

## 1. Scope and authorization

### 1.1 What was built

Two additive, UNWIRED files plus this record:

- `src/services/memory-candidate-provider.mjs` — a pure factory
  `createMemoryCandidateProvider({ now, estimateTokens? })` exposing a single
  frozen method `toCandidateSources({ project_id, records, token_budget? })`.
  It maps already-verified memory records (shape per `contracts/memory-record
  .schema.json`, MOD-MEM S2) into typed CandidateSource entries of kind
  `"memory"` shaped EXACTLY like the MOD-CONTEXT S2 provider-port input, and
  applies the deterministic compaction floor (content-hash dedup + token-budget
  tail truncation) with typed, subtractive exclusion accounting.
- `tests/memory-candidate-provider.test.mjs` — 30 tests (all green).

### 1.2 Authorization basis (operator R3 → R2 reclassification)

The MOD-MEM gap assessment §6 originally flagged S3 as **R3** (it feeds
MOD-CONTEXT and depends on the provider port). On **2026-07-22** the operator
**reclassified MOD-MEM S3 from R3 → R2** (operator decision via the coordinator's
question channel), **by analogy to the already-merged MOD-KNOW R2 slice**
`src/services/knowledge-candidate-provider.mjs` — a byte-for-byte structural twin
that was accepted as R2 producer work. This record is produced under that
operator authorization.

This is **operator-authorized R2 producer work, NOT a self-authorized gate
change.** The agent did not reclassify anything itself; it built only the pure,
additive, UNWIRED slice and wired it into nothing. No retrieval path, orchestrator,
gateway, or live surface consumes this module.

## 2. Mirror discipline (what was inherited from the MOD-KNOW template)

The module mirrors `knowledge-candidate-provider.mjs` in spirit byte-for-byte:

- **Pure factory + injected clock**, single frozen `toCandidateSources` surface.
- **Per-item subtractive accounting**: every supplied record lands in exactly one
  of `sources` / `exclusions`; the invariant `included + excluded === records.length`
  holds always; nothing is silently dropped; nothing throws per record
  (deny-by-default). Exclusion entries share the `{ ref, stage, reason }` core
  used by the port and the seven-stage pipeline, with an optional `code` and
  `detail`, so the provider is a natural "stage -1" of the port's stage-0 accounting.
- **Single clock read per projection** → uniform `retrieved_at`, deterministic result.
- **`data_untrusted: true`** stamped on every ALLOW/DENY envelope.
- **Deep-frozen outputs**; typed configuration error class; exported stage +
  exclusion-reason constants for callers to switch on.
- **Feed-forward proof** over the REAL port + real mint (see §6).

## 3. Atomic-snapshot discipline

The module consumes RAW caller-supplied record objects (the MOD-KNOW template
consumed injected services, so it did not need this), therefore it adopts the
house **descriptor-trap-safe atomic snapshot** standard already used by
`src/control/checkpoint-drift-comparator.mjs` and `src/security/redaction-policy.mjs`:

- a **single `Reflect.ownKeys` presence snapshot** decides own-membership
  (prototype-smuggled keys are not own);
- a **single `[[Get]]` per field** captures values — **no per-field
  `Object.getOwnPropertyDescriptor` probe** is used, so a hostile
  `getOwnPropertyDescriptor` trap is never invoked and no field is read twice
  (no TOCTOU: a getter returning different values on repeated reads cannot
  influence the decision);
- a **custom prototype** and any **symbol own key** are structurally REJECTED
  (`DENY_SNAPSHOT_MALFORMED`); an own key outside the closed record key set is
  `DENY_UNKNOWN_FIELD`;
- a **throwing accessor / Proxy get trap / poisoned iterator** is CONTAINED in a
  surrounding try/catch and folded to `MEMORY_MALFORMED` — never a throw;
- **non-finite** numbers (confidence) and **unparseable** windows fail typed
  validation; the records array and `evidence_refs` array are read via a
  single-read array snapshot (length read once, tampered `Symbol.iterator`
  rejected without invocation, each index read once);
- every output is **deep-frozen with a WeakSet cycle guard**.

Honest note on "reject accessor/Proxy": consistent with the house standard, a
benign accessor is read exactly once (its single read cannot split check from
use), and a hostile accessor/Proxy is contained and denied. The module does not
descriptor-probe to pre-classify accessors, because that would reintroduce the
per-field `getOwnPropertyDescriptor` this discipline forbids.

## 4. Honest field mapping (per assessment §4)

| entry field | source | note |
|---|---|---|
| `id` | `memory_record_id` | charset-guarded via shared `reserved-delimiters.mjs` |
| `kind` | constant `"memory"` | the port's reserved MOD-MEM kind |
| `project_id` | `project_id` | equals the query project (cross-project excluded) |
| `classification` | `classification` | carried **verbatim** (required port-vocabulary enum — no default needed, unlike the schema-classless knowledge claim) |
| `verified` | evidence-backed | true when `provenance.evidence_refs` is a non-empty array of non-blank strings; the contract requires it (minItems 1), so an included entry is always evidence-backed — a `verified:false` entry can never reach the port |
| `current` | `valid_from ≤ now < valid_until` | **computed** at the one server instant; an out-of-window record is INCLUDED with `current:false` (the mapper reports, the MOD-CONTEXT filter judges) — this is the honest divergence from the knowledge provider, which excludes superseded refs so its included entries are current by construction |
| `resolvable` | constant `true` | already-verified, ledger-resident records (assessment §4) |
| `relevance` | `confidence` | the record's own stored 0..1 confidence; NOT a query-similarity score (a pure mapper has none) — the only port-surviving numeric channel, used honestly |
| `provenance.origin` | `source` | the record's source ledger enum |
| `provenance.retrieved_at` | injected `now()` | one server instant per projection |
| `provenance.content_hash` | `content_hash` | the record's required 64-hex integrity hash, verbatim |

## 5. Deterministic compaction floor (honest part of G4)

Two subtractive stages over records that survive mapping + project scope, in input order:

1. **content-hash dedup** — the dedup key is the record's OWN `content_hash` (the
   schema's required 64-lowercase-hex field; the codebase's standard content hash —
   **NO new hash was invented**, per the dispatch instruction). First occurrence
   wins; later records with an already-seen hash are `DEDUP_DUPLICATE`
   (`detail.duplicate_of` names the winner). Dedup is decided by content identity
   alone and precedes budget, so a duplicate is `DEDUP_DUPLICATE` even when the
   winner is later truncated.
2. **token-budget truncation** — when `token_budget` (positive safe integer) is
   present, records are admitted in order until the budget is exhausted; the first
   record whose cost would overflow, and every record after it, is `BUDGET_EXCEEDED`
   (a **hard tail cut**, not bin-packing — deterministic, order-stable; verified by
   an explicit no-back-fill test). Token cost is a pure function of the record's
   `statement` via the default estimator (`ceil(len/4)`, floored at 1) or an
   injected estimator; a throwing/invalid injected estimator denies the whole query
   (`DENY_ESTIMATOR_FAULT`) rather than guessing a cost.

Semantic/LLM summarization compaction stays a **non-goal** (assessment §5), exactly
as scoped.

Disclosed design decisions (beyond the template):
- **Input is records, not injected services.** The dispatch specified "maps
  already-verified memory records"; the caller (the S1 gateway's window-resolved
  read) supplies the records. This keeps the module pure and free of any ledger
  handle.
- **`token_budget` is a per-call query field** (optional), not construction state —
  different retrieval contexts carry different budgets.
- **Shared `findReservedDelimiter` import.** The module imports the governed
  `src/contracts/reserved-delimiters.mjs` (GOV-P011-08) rather than inlining the
  delimiter list as the MOD-KNOW template did — a strictly reuse-compliant, positive
  divergence.

## 6. Purity / unwired proof

- **Zero importers.** `grep -rn "memory-candidate-provider" src/ tools/` returns
  only the module file itself. Nothing live consumes it. (Test-confirmed by the
  unwired grep in the dispatch.)
- **No I/O, no ledger/authority/clock-of-record/fs/network/process.** The only
  inputs are the caller's records and the injected `now()`; the only imports are the
  governed `reserved-delimiters.mjs` constant helper.
- **No schema added.** `contracts/memory-record.schema.json` (S2) and every other
  contract are byte-identical to base; `contract-validator.mjs` and
  `validate-foundation.mjs` were NOT touched. `schemas.count` remains **20**.
- **No admission-semantics change** to any existing store (B5): the module never
  appends, resolves evidence, or mutates a record — it only maps and subtracts.

## 7. Test evidence

- New file `tests/memory-candidate-provider.test.mjs`: **30/30 green**. Coverage:
  fail-closed construction (clock + estimator); query validation (unknown fields,
  blank project, non-array records, invalid token_budget); empty-records zero/zero;
  clock-unusable deny; honest field mapping (classification carried, verified from
  evidence, current true/false from the window, relevance=confidence, provenance);
  `MEMORY_MALFORMED` across 14 field/structure hostilities + symbol key + custom
  prototype + throwing accessor + hostile Proxy + cyclic + poisoned records array;
  `MEMORY_PROJECT_MISMATCH`; `DEDUP_DUPLICATE`; `BUDGET_EXCEEDED` (tail cut, no
  bin-packing, default + injected estimator, estimator fault, dedup-before-budget);
  accounting invariant on a mixed batch; determinism + uniform `retrieved_at`;
  deep-frozen output; and two feed-forward proofs (single entry and a
  deduped/truncated batch) that projected entries normalize with **zero port
  exclusions** and mint a sealed Context Receipt whose `source_references` carry
  the memory ref.
- Full suite and `validate-foundation.mjs` results are reported to the operator in
  the dispatch return (full totals + validator exit 0 + `schemas.count` = 20).

## 8. Self-certification

```yaml
self_certification:
  agent_id: claude-motor-mem-s3-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

Both can self-certify; neither can self-authorize. This packet certifies advisory
producer completeness only. It grants no merge, deployment, promotion, activation,
or live-adoption authority; MOD-MEM S3 remains a CANDIDATE awaiting an independent
review and operator ratification.
