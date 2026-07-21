# MOD-MEM S2 Memory-Record Contract — Independent Review 001

**Record ID:** MOD-MEM-S2-CONTRACT / mod-mem-s2-memory-record-contract-independent-review-001
**Status:** ADVISORY — INDEPENDENT REVIEW, NOT A MERGE DECISION
**Reviewer identity:** claude-rev-modmem-s2 (BST-SA REV/SEC worker, independent of the producer)
**Reviewed branch/commit:** `bst/mod-mem-s2-memory-record-contract` @ `2e4595f` (base `main`/`origin/main` @ `ee31db7`)
**Reviewed against:** `docs/03-project-control/candidates/mod-mem-gap-assessment-001.md` (`bst/mod-mem-assessment`, read at the ref present in this checkout) §2 (G2) and §4 (Slice S2), and `docs/03-project-control/candidates/mod-mem-s2-memory-record-contract-producer-verification-001.md` (this branch)
**Method:** All findings below were reproduced first-hand in the isolated worktree at `C:\Users\ounkh\SecB-worktrees\mod-mem-s2-memory-record-contract` (separate from the producer's own dispatch and from any other concurrent agent session). `npm test` and `node tools/validate-foundation.mjs` were run directly; the contract validator was exercised directly (not just via the test suite) with a purpose-built adversarial probe script covering every field named in the review task. No push, no merge, no operator-authority action taken; the live branch tip was not advanced by this review except via the isolated detached-HEAD + `git update-ref` commit described in the Provenance section.
**Date:** 2026-07-21

---

## Verdict: **APPROVE_FOR_MERGE**

Every claim in the producer-verification record was independently reproduced exactly: the field-by-field G2 coverage is complete with only disclosed, traceable renames/additions; the registration is genuinely wired (validator compiles the schema, both fixtures round-trip correctly, `mandatoryIdentityFields` is a true subset of the schema's own `required` with zero drift); the schema itself correctly rejects every adversarial case probed (out-of-bound confidence, non-numeric confidence, off-enum/wrong-case layer, malformed/short/uppercase/non-hex `content_hash`, empty `evidence_refs`); the non-wiring decision against `MemoryGatewayService` is verified sound by reading S1's actual closed admission envelope; five of the ten repinned byte-identity guards were spot-checked line-by-line and are legitimate, narrowly-scoped hash/exclusion updates; and the full suite reproduces the claimed `1149/1146/0/3` exactly, both before test-ID-branching was ruled out by direct grep. No blocking defect found. Two low-risk observations are noted below for the record, neither of which changes the verdict.

---

## 1. G2 field-by-field coverage — COMPLETE, no missing fields, two disclosed elaborations (not scope creep)

Read `mod-mem-gap-assessment-001.md` in full (fetched from the local `bst/mod-mem-assessment` ref). G2's own field list (§4, Slice S2 prose):

> `memory_id, version, layer (session|work|project), project_id, work_package_id, session_id, actor_id, content_ref or statement, classification (PUBLIC|INTERNAL|CONFIDENTIAL|RESTRICTED), confidence, provenance, valid_from, valid_until, retention_policy, supersedes?`

And doctrine's seven required record properties (`docs/15-knowledge/03-memory-and-context.md:20`, verified verbatim): "immutable IDs, provenance, confidence, access policy, retention, integrity and supersession."

Mapping against the actual `contracts/memory-record.schema.json` (17 properties, 16 required + `supersedes` optional):

| G2/doctrine item | Schema field | Verdict |
|---|---|---|
| `memory_id` | `memory_record_id` | Renamed, disclosed in producer record §2 (parity with `skill_candidate_id` precedent). Not a gap — G2's own prose called its sketch "likely," not binding. |
| `version` | `version` | Present, matches. |
| `layer` | `layer` (enum `session\|work\|project`) | Present, exact enum match, org/procedural correctly excluded per B3. |
| `project_id`/`work_package_id`/`session_id`/`actor_id` | same names | Present, matches house identity tuple. |
| `content_ref or statement` | `statement` | Present — G2 offered an "or", producer picked `statement` for parity with `knowledge-claim.schema.json`. Reasonable. |
| `classification` | `classification` (same 4-value enum) | Present, exact match. |
| `confidence` | `confidence` (number 0-1) | Present. See §3 below for bound verification. |
| `provenance` | `provenance` (object, `evidence_refs` + `origin_record_id`) | Present. G2 named the field but not its sub-shape; the producer's shape reuses `knowledge-claim.schema.json`'s evidence-binding convention. Reasonable, not invented from nothing. |
| `valid_from`/`valid_until` | same | Present, date-time format. |
| `retention_policy` | same | Present. |
| `supersedes?` | `supersedes` (optional, not in `required`) | Present, correctly optional — confirmed by direct probe (§3). |
| doctrine "integrity" | `content_hash` (pattern `^[a-f0-9]{64}$`) | Not in G2's literal bracket list, but doctrine's own seven-property list names "integrity" explicitly, and every contract added since `goal.schema.json` carries `content_hash` for this reason. Filling a doctrine-named gap the bracket omitted — legitimate elaboration, not scope creep. |

Two fields exist in the schema that are named by **neither** G2's bracket list **nor** doctrine's seven properties:

- **`source`** (enum `DecisionLedger\|KnowledgeLedger\|OutcomeLedger\|MemoryGatewayService`) — the producer record attributes this to "the task's" own framing ("which ledger/module it derives from"), not to the gap assessment. I cannot independently verify the literal wording of that dispatching instruction (it is not part of either artifact I was asked to check this build against), but the field is closed-enum, harmless, and traceable to a stated rationale rather than invented silently.
- **`admitted_at`** — matches the S1 gateway's own G7-closing stamp exactly (verified directly in `memory-gateway-service.mjs:229`, `admitted_at: instant.iso`), a reasonable forward-compatibility field for the day this contract is wired to a live admission path.

**Assessment:** both are minor, disclosed, low-risk elaborations beyond G2's literal text — not the over-specification pattern the review task was watching for (e.g. no vendor-specific format lock-in, no premature narrowing of any of G2's own fields, no additional required fields that would make legitimate G2-described records fail). No underspecification found either: every G2-named field and every doctrine-named property has a home in the schema.

## 2. Registration completeness — CONFIRMED, no drift

Ran the validator suite directly:

- `node tools/validate-foundation.mjs` → exit 0, `"status": "PASS"`, including `schema.identity.contracts/memory-record.schema.json` and `schema.closed.contracts/memory-record.schema.json`.
- Wrote and ran an independent probe script (`scratchpad/probe-memory-record.mjs`) that imports `validateContract` directly from `src/contracts/contract-validator.mjs` (not through the test harness) and fed it both shipped fixtures:
  - `tests/fixtures/valid/memory-record.json` → **PASS** (validates clean).
  - `tests/fixtures/invalid/memory-record-missing-id.json` → **DENY**, error `"must have required property 'memory_record_id'"` — genuinely fails for the stated reason, not some other unrelated field.
- `mandatoryIdentityFields["contracts/memory-record.schema.json"]` in `tools/validate-foundation.mjs` (`memory_record_id, version, project_id, work_package_id, session_id, actor_id, layer, source, classification, valid_from, valid_until, content_hash`) is a strict subset of the schema's own `required` array (16 entries, superset). The foundation validator's own check (`missing = mandatoryIdentityFields[file].filter(f => !schema.required.includes(f))`) is a subset check by construction — I independently confirmed every one of those 12 field names literally appears in the schema's `required` list. **No drift** between the two independent declarations.

## 3. Adversarial schema probing — every named case correctly enforced

Probed the live schema through the real validator (not by re-reading the JSON text), one mutation per case against the valid fixture:

| Probe | Input | Result |
|---|---|---|
| `confidence` below bound | `-0.01` | **DENY** — "`/confidence must be >= 0`" |
| `confidence` above bound | `1.01` | **DENY** — "`/confidence must be <= 1`" |
| `confidence` non-numeric | `"0.5"` (string) | **DENY** — "`/confidence must be number`" |
| `confidence` boundaries | `0`, `1` | **PASS** (correct — inclusive bounds) |
| `layer` off-enum | `"org"`, `"procedural"` | **DENY** — both rejected, org/procedural correctly excluded |
| `layer` wrong case | `"SESSION"` | **DENY** — enum match is case-sensitive, no silent normalization |
| `content_hash` empty string | `""` | **DENY** — pattern mismatch |
| `content_hash` short | `"abc123"` | **DENY** — pattern mismatch |
| `content_hash` uppercase hex | `"AAAA...".repeat` (64 chars) | **DENY** — pattern requires lowercase `a-f` only |
| `content_hash` 64 non-hex chars | `"g".repeat(64)` | **DENY** — pattern mismatch |
| `content_hash` valid | `"0".repeat(64)` | **PASS** |
| `provenance.evidence_refs` empty array | `[]` | **DENY** — "`must NOT have fewer than 1 items`" — genuinely enforced `minItems: 1`, cannot claim provenance with an empty array |
| `provenance` missing `origin_record_id` | — | **DENY** |
| `provenance` additional property | extra key | **DENY** — nested object is also closed |
| top-level unknown field | extra key | **DENY** — `additionalProperties: false` enforced at top level too |
| `version` non-positive / non-integer | `0`, `-1`, `1.5` | **DENY** all three |
| `statement` empty | `""` | **DENY** — `minLength: 1` enforced |
| `valid_from` malformed | `"not-a-date"` | **DENY** — `format: date-time` enforced |
| `supersedes` omitted | — | **PASS** — correctly optional |
| `supersedes` empty string | `""` | **DENY** — when present, still `minLength: 1` |

**One genuine (non-blocking) gap found under probing, not asked for explicitly but relevant to the temporal-window intent:** the schema does **not** enforce `valid_from < valid_until` — a record with `valid_from` after `valid_until` passes schema validation (verified: `{valid_from: "2027-01-01...", valid_until: "2020-01-01..."}` **PASS**ed). This is **not** a defect specific to this schema — I checked `contracts/knowledge-claim.schema.json` and `contracts/decision-record.schema.json`, and neither enforces temporal ordering at the schema level either (both use bare `format: date-time` with no cross-field constraint). This is consistent house style: ordering is a ledger/application-level concern (e.g. `DecisionLedger` enforces `valid_from < valid_until` in code per the gap assessment's own inventory), not a JSON-Schema-level one. Noting for the record; not a merge blocker, not a schema-specific regression.

## 4. Non-wiring decision — CONFIRMED sound, field gaps are real

Read `src/services/memory-gateway-service.mjs` in full. The admission envelope is genuinely closed and genuinely missing the fields the producer claims:

```js
const RECORD_KEYS = Object.freeze(["project_id", "work_package_id", "session_id", "actor_id", "classification", "statement"]);
const REQUIRED_RECORD_KEYS = Object.freeze(["project_id", "work_package_id", "session_id", "actor_id", "classification", "statement"]);
```

`validateAdmitShape()` (`memory-gateway-service.mjs:144-164`) rejects any `request.record` key not in `RECORD_KEYS` outright (`DENY_MALFORMED_REQUEST: Unknown record fields: ...`). Confirmed by direct read: this envelope genuinely has no `memory_record_id`, `version`, `source`, `confidence`, `provenance`, `valid_from`/`valid_until`, `retention_policy`, or `content_hash` — exactly the gap list the producer asserted. `layer` and `admitted_at` are supplied out-of-band (`request.layer`, stamped internally), not part of the closed record envelope either. Wiring live contract validation today would indeed require either loosening this closed envelope's key-set assertion or reshaping already-merged, already-tested code — a materially different and separately-risky change, correctly deferred. The claimed field gaps are real, not asserted-only.

## 5. Repinned byte-identity guards — 5 of 10 spot-checked (task asked for ≥3), all legitimate

Independently computed the actual current blob hashes:

```
tools/validate-foundation.mjs      → aa8f60385e35b5531db44a75fd2e2f7e82b95a26
src/contracts/contract-validator.mjs → c1756309a9cedb9189a7124eb20d33b2542684df
```

Both match the pins verbatim. Diffed five of the ten guard files directly against base:

- `tests/write-set-policy.test.mjs`, `tests/kpi-registry.test.mjs`, `tests/event-family-policy.test.mjs` — each diff is a narrowly-scoped hash-value swap plus an updated disclosing comment (old MOD-WSPACE-S3 pin → new MOD-MEM-S2 pin, with the reason for the change spelled out inline). No other assertion or test body touched.
- `tests/conformance-p0-18-candidate.test.mjs` — same pattern for the `contract-validator.mjs` pin (`c3b3777...` → `c175630...`), one line changed.
- `tests/workspace-lease-ledger.test.mjs` — a different mechanism (enumerates `contracts/*.schema.json` on disk and diffs each against a base commit that predates the new file), correctly extended its existing filename-exclusion list to add `memory-record.schema.json` alongside its pre-existing `workspace-lease.schema.json` exclusion, with a comment explaining why (the file postdates the guard's base commit and cannot be diffed against a commit where it doesn't exist).

None of the five hides unrelated drift: each diff touches exactly the pinned hash/exclusion plus its comment, nothing else in the guarded assertion logic changed.

## 6. Full suite — CONFIRMED exact match

Ran `npm test` directly in the isolated worktree: **`tests 1149 / pass 1146 / fail 0 / skipped 3`** — exact match to both the claimed baseline and post-change counts (the producer's explanation for the unchanged count — new fixture kind consumed by existing parametrized tests rather than new `test()` blocks — is architecturally correct: `tests/contract-validator.test.mjs` iterates a fixture map inside single `test()` calls).

## 7. Hardcoded test-ID branching — none found

`grep -rniE "mem_mod_mem_s2_fixture|memory_record_id\s*===|memory-record-missing-id"` across `src/` and `tools/` returned zero matches. The diff touches only a schema file, two fixtures, four registration-table entries, and ten guard-pin values — no new conditional logic anywhere. Confirmed.

## 8. Manifest/tracker hygiene — consistent with precedent

`docs/03-project-control/candidates/module-completion-tracker-001.md` gained one append-only recap line for this slice — consistent with extend-only convention and accurately summarizes the change (spot-checked against the actual diff). `docs/MANIFEST.json` was correctly left untouched: cross-checked against precedent (recent candidate docs, e.g. the prior `secb-gov-001-second-independent-readiness-review-001.md`, are likewise registered only in the root `MANIFEST.json`, not `docs/MANIFEST.json`) — this is the established convention for `candidates/` producer/review records, not an omission.

---

## Summary of findings

| # | Item | Result |
|---|---|---|
| 1 | G2 field-by-field coverage | Complete; two disclosed elaborations (`source`, `admitted_at`) beyond G2's literal text, both low-risk and traceable |
| 2 | Registration completeness (validator, fixtures, `mandatoryIdentityFields`) | Confirmed, no drift |
| 3 | Adversarial schema probing (confidence/layer/content_hash/evidence_refs + others) | All correctly enforced; `valid_from < valid_until` not schema-enforced, but consistent with house-wide convention (non-blocking) |
| 4 | Non-wiring decision vs. S1 gateway | Confirmed sound, field gaps verified real by direct source read |
| 5 | Repinned guards (5 of 10 spot-checked) | All legitimate, narrowly scoped |
| 6 | Full suite | 1149/1146/0/3, exact match |
| 7 | Hardcoded test-ID branching | None found |
| 8 | Manifest/tracker hygiene | Consistent with precedent |

## Advisory status fields

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: existing
risk_class: low
self_certification:
  agent_id: claude-rev-modmem-s2
  peer_agent_id: claude-cortex
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

## Provenance

- source: first-hand reproduction in the isolated worktree `C:\Users\ounkh\SecB-worktrees\mod-mem-s2-memory-record-contract` (`bst/mod-mem-s2-memory-record-contract` @ `2e4595f`); gap assessment read from the local `bst/mod-mem-assessment` branch ref; the memory-record schema, the S1 gateway source, and five of ten repinned guard files read in full and diffed directly; an independent adversarial probe script exercised the live contract validator outside the shipped test suite.
- agent_id: claude-rev-modmem-s2 (BST-SA REV/SEC worker, Claude Sonnet 5)
- timestamp: 2026-07-21
- disposition: advisory review only; no execution/approval/merge authority exercised; no push; no merge; recorded on this candidate branch via isolated detached-HEAD worktree + `git update-ref` per AMD-002 rev 2.

> Recommend APPROVE_FOR_MERGE. This review recommends; it does not authorize merge.
