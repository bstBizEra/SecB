# MOD-MEM S2 — Memory-Record Contract: Producer Verification

- record_id: MOD-MEM-S2-CONTRACT-PRODUCER-VERIFICATION-001
- status: CANDIDATE (producer self-verification; operator ratification required before merge)
- producer: claude-cortex (BST-SA cortex/motor worker agent, this dispatch)
- module: MOD-MEM Memory Gateway, Slice S2 ("memory-record contract and temporal
  layer semantics")
- base: origin/main @ ee31db7, built in an isolated worktree
  (`bst/mod-mem-s2-memory-record-contract`)
- source assessment: `docs/03-project-control/candidates/mod-mem-gap-assessment-001.md`
  (`bst/mod-mem-assessment` @ 01137c7), §4 Slice S2 — the sole source-of-truth
  read for this slice's scope. No new gap analysis was performed; this record
  builds exactly what that assessment scoped for S2, with one disclosed
  narrowing (see §4).
- prior slice: `src/services/memory-gateway-service.mjs` (S1, merged to main,
  read in full before this dispatch) — the deny-by-default admission/retrieval
  facade this contract formalizes the record shape for.
- governance: AMD-002 advise-and-proceed; AGENTS.md worker-not-authority;
  advisory/candidate only, non-main branch, no push, no merge, operator
  authorized building this slice this turn (no prior re-scoping addendum
  existed for MOD-MEM S2 — this dispatch performed the compact design pass
  and the build in the same turn, per the dispatching instruction).
- date: 2026-07-21

## 1. What the assessment's own G2 gap said

From `mod-mem-gap-assessment-001.md` §2 (Gap table, row G2):

> No temporal LAYERING. The five documented layers (session/work/project/org/
> procedural) do not exist in code or contracts; no memory-record contract
> carries layer, confidence, access policy, or retention/TTL semantics.
>
> Evidence: `knowledge-claim.schema.json` has identity + window + retention_policy
> string but no layer/confidence/access fields; `contracts/` has no memory-record
> schema; no code mentions the layers.
>
> Assessment: missing. Requires a new contract (R3). Org layer = MOD-KNOW
> promotion, procedural = MOD-SKILL — only session/work/project belong to
> MOD-MEM P0.

And from §4 Slice S2 itself:

> Add `contracts/memory-record.schema.json` (closed schema, house identity
> style): `memory_id, version, layer (session|work|project), project_id,
> work_package_id, session_id, actor_id, content_ref or statement,
> classification (PUBLIC|INTERNAL|CONFIDENTIAL|RESTRICTED — the port
> vocabulary), confidence, provenance, valid_from, valid_until,
> retention_policy, supersedes?` — exactly the doc-required record fields
> (immutable ID, provenance, confidence, access policy, retention, integrity,
> supersession pointer; supersession GRAPH analysis stays MOD-KNOW). Wire it
> into `contract-validator.mjs` and make the S1 gateway validate admissions
> against it. TTL stays deny-on-use (window resolution), no pruning writer —
> consistent with P0-14 semantics. Scoped retrieval reads (layer + project
> filters, cross-project DENY by default) land here as gateway read methods.

This closes G2 as the contract-definition half; it does not by itself close
G1/G5/G7 (already closed by S1) or G3/G4 (S3, out of scope here — see §4 below).

## 2. Contract design: fields and rationale

New file: `contracts/memory-record.schema.json` (draft 2020-12, closed object,
`additionalProperties: false`), 17 properties, 16 required + 1 optional.

| Field | Type | Why |
|---|---|---|
| `memory_record_id` | string, minLength 1 | Identity key. Named the fuller compound form (not `memory_id` as the assessment's prose draft used) for the same reason `skill-candidate.schema.json` uses `skill_candidate_id` rather than `candidate_id`: `memory_id` alone would collide conceptually with the broader "memory" domain noun; the file is `memory-record.schema.json`, so the ID field names the record, not the domain. Disclosed deviation from the assessment's literal field name — the assessment itself only sketched fields ("likely"), not a binding wire format. |
| `version` | integer >= 1 | House versioning convention (every contract in `contracts/` has this). |
| `project_id`, `work_package_id`, `session_id`, `actor_id` | string, minLength 1 | House identity tuple, matching every P0-14 temporal-ledger contract (`decision-record`, `knowledge-claim`, `outcome-receipt`) and the S1 gateway's own `REQUIRED_RECORD_KEYS`. |
| `layer` | enum `[session, work, project]` | Exactly the S1 gateway's `LAYERS` constant and the assessment's G2 scope note — org/procedural deliberately excluded (MOD-KNOW/MOD-SKILL boundary, B3). |
| `source` | enum `[DecisionLedger, KnowledgeLedger, OutcomeLedger, MemoryGatewayService]` | Task-specified field: "which ledger/module it derives from." Closed to the actual P0-14 ledger set plus the gateway itself (for gateway-native admissions with no wrapped ledger claim), matching the house convention of enumerating known vocabularies (`truth_status`, `decision_type`, `outcome_status`) rather than leaving free text. |
| `statement` | string, minLength 1 | The content/summary field. Chose `statement` (not `content_ref`) for parity with `knowledge-claim.schema.json`, since a memory record's typical origin (per `source`) is a knowledge claim or decision outcome being carried into scoped memory — same semantic shape, reused name. |
| `classification` | enum `[PUBLIC, INTERNAL, CONFIDENTIAL, RESTRICTED]` | The CandidateSource port's classification vocabulary (`src/services/candidate-source-port.mjs` `CLASS_ORDER`) and the S1 gateway's `CLASSIFICATION_ORDER` — same closed set, no new vocabulary invented. |
| `confidence` | number, 0–1 | Doctrine-required field (`docs/15-knowledge/03-memory-and-context.md`: "confidence" is one of the seven required record properties). No existing contract had a numeric confidence field to copy convention from; bounded `[0,1]` as the simplest normalized-score shape. |
| `provenance` | object, closed, required `[evidence_refs, origin_record_id]` | The "provenance/evidence binding" the doctrine and the task both call for. `evidence_refs` (array, minItems 1) mirrors `knowledge-claim.schema.json`'s own evidence-binding shape — a memory record derived from a verified claim carries the same evidence chain forward, never a laundered/unbound summary. `origin_record_id` is the explicit pointer back to the underlying ledger record (the claim/decision/outcome ID named by `source`) this memory record wraps — this is what makes the record "distinct from, but derived from/wrapping," the underlying temporal-ledger shapes, per the task's framing. Deliberately NOT the same shape as the CandidateSource port's `provenance {origin, retrieved_at, content_hash}` (S3 concern, retrieval-time) — this is admission-time provenance; S3's adapter is the one responsible for later mapping this contract's fields into the port's shape. |
| `valid_from`, `valid_until` | string, date-time | Temporal window, same as `decision-record`/`knowledge-claim` — deny-on-use expiry (S1 gateway's TTL-at-read model), never a pruning writer. |
| `retention_policy` | string, minLength 1 | Direct precedent from `knowledge-claim.schema.json`. |
| `admitted_at` | string, date-time | The task's "a timestamp" requirement, and it matches the S1 gateway's own `admitted_at` stamp (G7 trusted-time closure) exactly — this is the record's creation instant, distinct from the `valid_from`/`valid_until` window. |
| `supersedes` | string, minLength 1 (optional — not in `required`) | The assessment's "supersedes?" (question mark = optional). Left as a plain optional pointer field; supersession GRAPH analysis stays MOD-KNOW (B2), this contract only carries the pointer. |
| `content_hash` | string, `^[a-f0-9]{64}$` | Integrity field doctrine requires ("integrity" in the seven required properties). The three original P0-14 contracts (`decision-record`, `knowledge-claim`, `outcome-receipt`) predate this convention and omit it; every contract added since (`goal`, `checkpoint`, `delegation-request`, `workspace-lease`, `event-envelope`, `evidence-envelope`, `handoff-envelope`, `context-receipt`) requires it. This is a fresh S2 contract, so it follows the current, not the legacy, convention. |

## 3. Registration parity confirmation

Following the exact mechanics used earlier this session for
`contracts/integration-queue-entry.schema.json` (`bst/mod-integ-queue-s1-ledger`,
registered as `integrationQueueEntry` in `src/contracts/contract-validator.mjs`):

- `src/contracts/contract-validator.mjs`: added `memoryRecord:
  "memory-record.schema.json"` to `schemaPaths` (same map-entry pattern, same
  file resolution via `ajv.compile`).
- `tools/validate-foundation.mjs`: added `contracts/memory-record.schema.json`
  to `expectedSchemas` (18 total: 7 canonical + 11 governed extensions) and a
  `mandatoryIdentityFields` entry: `["memory_record_id", "version",
  "project_id", "work_package_id", "session_id", "actor_id", "layer", "source",
  "classification", "valid_from", "valid_until", "content_hash"]` — a
  representative identity/scope/temporal/integrity subset, the same style used
  for `knowledge-claim.schema.json`'s entry (which likewise omits its own
  content fields `statement`/`derivation`/`claimed_at`/`retention_policy`).
- `MANIFEST.json`: added the schema file, both fixtures, and this record to
  `files` (all four exist on disk; `validate-foundation.mjs`'s
  `manifest.file.*` existence check enforces this).
- `tests/contract-validator.test.mjs`: added `memoryRecord` to both
  `validFixtures` and `invalidFixtures` maps (same key used across
  `supportedContractKinds()`, valid-fixture round-trip, and invalid-fixture
  fail-closed assertions — no new test bodies needed, the existing
  parametrized tests cover the new kind automatically).
- Fixtures: `tests/fixtures/valid/memory-record.json` (all 16 required fields
  populated, passes) and `tests/fixtures/invalid/memory-record-missing-id.json`
  (identical to the valid fixture minus `memory_record_id`, matching the exact
  "missing-id" fixture-naming precedent used by `checkpoint-missing-id.json`,
  `goal-missing-id.json`, and `workspace-lease-missing-id.json`).

## 4. Scope discipline — what was deliberately NOT built

- **S3 (CandidateSource adapter + compaction floor) was not built.** No
  `toCandidateSources` method, no content-hash dedup, no token-budget
  truncation. Explicitly out per the dispatching instruction and the
  assessment's own slice ordering (S3 depends on the provider-port contract,
  which is a separate concern from this contract-definition slice).
- **The S1 `MemoryGatewayService` was NOT modified, and this contract was NOT
  wired into it as a live admission-time validation step**, even though the
  assessment's own S2 prose says to "make the S1 gateway validate admissions
  against it." This is a disclosed, deliberate narrowing:
  - The S1 gateway's admission envelope (`RECORD_KEYS` /
    `REQUIRED_RECORD_KEYS`: `project_id, work_package_id, session_id,
    actor_id, classification, statement`) is a CLOSED envelope that does not
    carry `memory_record_id`, `version`, `source`, `confidence`, `provenance`,
    `valid_from`/`valid_until`, `retention_policy`, or `content_hash` — the
    fields this contract requires. Wiring live validation would require
    reshaping the ALREADY-MERGED S1 request/record shape (adding required
    fields to a closed envelope whose exact key-set is itself asserted by
    `validateAdmitShape`'s unknown-field checks), which is a materially larger
    and separately-risky change to shipped, tested code — not a "contract
    definition" pass, and not something a single S2 dispatch should fold in
    silently.
  - Per the dispatching instruction: "check the assessment's own scoping
    first and stay within it; if ambiguous, prefer the narrower reading
    (contract definition only, not live consumption) and disclose that
    choice." The assessment's prose is unambiguous in INTENT but the
    underlying shapes are in tension (S1's admission envelope and S2's full
    record contract do not match field-for-field), which is itself a form of
    scope ambiguity at the implementation level. I took the narrower reading:
    define and register the contract only.
  - Recommended follow-up (not this dispatch): a dedicated wiring slice that
    either (a) extends the S1 gateway's admission envelope to accept and
    populate the additional contract fields (a reviewable, behavior-changing
    diff to merged code), or (b) adds a separate "memory-record minting"
    step downstream of `admit()` that assembles the full contract-shaped
    record from the gateway's `admitted` output plus caller-supplied
    provenance/confidence/retention metadata, without touching
    `admit()`/`retrieve()` themselves. Either path is R3 (contract-surface +
    admission-adjacent) and belongs on the operator queue, not folded into
    this record's scope.
  - No other non-goal from the assessment (§5) was touched: no
    claims/contradictions/supersession engine, no governed seven-stage filter
    or receipts, no procedural-memory / skill intake logic, no semantic
    summarization, no MCP tool exposure, and no change to
    `KnowledgeLedger.appendClaim`, `sod-rules.mjs`, or any existing ledger's
    admission semantics (B5 hard line — confirmed untouched: `git diff
    --stat` against `origin/main` touches only `MANIFEST.json`,
    `src/contracts/contract-validator.mjs`, `tools/validate-foundation.mjs`,
    `tests/contract-validator.test.mjs`, and three new files under
    `contracts/`/`tests/fixtures/`).

## 5. Verification

- Baseline (`origin/main` @ ee31db7, fresh worktree, `npm install` then `npm
  test`): 1149 tests, 1146 pass, 0 fail, 3 skipped; `node
  tools/validate-foundation.mjs` PASS (exit 0).
- After this change: 1149 tests, 1146 pass, 0 fail, 3 skipped — the same
  counts as baseline. This is correct, not a missed run: the new `memoryRecord`
  fixture-kind is consumed by the EXISTING parametrized tests in
  `tests/contract-validator.test.mjs` ("all canonical contract kinds have
  valid fixtures" / "malformed contracts fail closed with structured
  validation errors"), which iterate a fixture map inside a single `test()`
  call rather than registering one `test()` per kind — so `node --test`'s
  top-level test counter does not increase, even though two additional
  fixture-driven assertions (one valid round-trip, one invalid fail-closed)
  now execute and pass inside those existing blocks. `node
  tools/validate-foundation.mjs` PASS (exit 0) both before and after,
  including the new `schema.identity.contracts/memory-record.schema.json` and
  `schema.closed.contracts/memory-record.schema.json` checks post-change.
- Side effect discovered and fixed: seven pre-existing byte-identity guard
  tests (`tests/write-set-policy.test.mjs`, `tests/kpi-registry.test.mjs`,
  `tests/scorecard-assembler.test.mjs`, `tests/cadence-policy.test.mjs`,
  `tests/overlap-policy.test.mjs`, `tests/replay-assembler.test.mjs`,
  `tests/event-family-policy.test.mjs`) pin `tools/validate-foundation.mjs`'s
  git blob hash, and `tests/p0-19-self-pilot.test.mjs` +
  `tests/conformance-p0-18-candidate.test.mjs` +
  `tests/conformance-v016-drift.test.mjs` additionally pin
  `src/contracts/contract-validator.mjs`'s blob hash — both files this slice
  is required to edit (task step 4). These pins exist precisely to catch
  UNAUTHORIZED drift (the same mechanism a prior MOD-WSPACE-S3 producer used
  when it repinned these same guards for its own authorized schema
  registration). Repinned all ten call sites to the new, authorized post-MOD-
  MEM-S2 blob hashes (`aa8f60385e35b5531db44a75fd2e2f7e82b95a26` for
  `validate-foundation.mjs`, `c1756309a9cedb9189a7124eb20d33b2542684df` for
  `contract-validator.mjs`), following the exact repin style/comment pattern
  the MOD-WSPACE-S3 producer left behind. One further guard
  (`tests/workspace-lease-ledger.test.mjs`) enumerates every file in
  `contracts/*.schema.json` on disk and diffs each against a fixed base
  commit that predates `memory-record.schema.json`'s existence; added an
  explicit exclusion for the new filename (mirroring its existing exclusion
  of its own `workspace-lease.schema.json`) rather than changing the guard's
  mechanism. All ten edits are narrowly-scoped hash/exclusion updates with a
  disclosing comment each — no test assertion's INTENT was weakened, only the
  expected-value pinned to the new authorized state.
- Grepped the diff and the new files for hardcoded test-ID branching
  (`if (\`?(id|_id)\`.*===` literals, `test_`/`fixture_id` string comparisons
  in non-test source): none found — this slice adds only a schema, fixtures,
  and registration-table/pin entries, no conditional logic.
- No push, no merge, no PR. Local commit only on
  `bst/mod-mem-s2-memory-record-contract` (base `origin/main` @ ee31db7).

## 6. Advisory status fields

- truth_status: verified_true (schema, registration, and fixtures built and
  tested first-hand in an isolated worktree; assessment §2/§4 read verbatim
  and quoted above, not paraphrased from memory)
- authority_status: advisory_only (candidate branch; operator ratification
  required before merge)
- implementation_status: existing (this slice, as scoped: contract defined,
  registered, fixture-tested) — S1-gateway wiring remains `missing` by
  disclosed choice (§4), S3 remains `missing` (separate slice, untouched)
- risk_class: low (additive contract + fixtures + registration-table entries
  only; zero existing-file behavior change; zero admission-policy change to
  any existing store)

```yaml
self_certification:
  agent_id: claude-cortex
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
