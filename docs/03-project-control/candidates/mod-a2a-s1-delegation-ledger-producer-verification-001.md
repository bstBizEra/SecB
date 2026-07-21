# MOD-A2A Slice S1 — Producer Self-Verification (mod-a2a-s1-delegation-ledger-producer-verification-001)

- producer_identity: `claude-motor-moda2a-s1`
- producer_role: BST-SA Motor (bounded implementation, advise-and-proceed)
- target_branch: `bst/mod-a2a-s1-delegation-ledger`
- base: `main` @ `4e25129d7c965e51843ac10db320d5e8dd1b8024` (`Merge pull request #19 from bstBizEra/claude/rev/mod-know-s2`) — confirmed first-hand via `git rev-parse main` in a fresh worktree at task start, not assumed from any prior record
- assessment_source: `docs/03-project-control/candidates/mod-a2a-gap-assessment-001.md` (`bst/mod-a2a-assessment` @ `e96e83b`) — closes gap **MA-1**'s schema/persistence half (delegation-request contract + `DelegationLedger`), Slice **S1** of the assessment's bounded 3-slice plan
- doctrine_source: `docs/07-capabilities/mcp-a2a-governance.md` line 28 ("A2A Gateway" section) — see field-mapping table below
- prior-slice cross-check: read `docs/03-project-control/candidates/mod-runtime-s1-checkpoint-ledger-producer-verification-001.md` and `mod-runtime-s2-retry-policy-evaluator-producer-verification-001.md` (`bst/mod-runtime-s1-checkpoint-ledger`, `bst/mod-runtime-s2-retry-policy-evaluator`) in full before starting, per task instruction, for the established thin-`DurableLedger`-subclass convention this slice follows exactly. This slice touches none of MOD-RUNTIME's new files (`contracts/checkpoint.schema.json`, `src/ledger/checkpoint-ledger.mjs`, `src/control/retry-policy.mjs`) — no collision, no duplication.
- governance: `AGENTS.md` `SECB-AGENTS-AMD-002` (revision 2) advise-and-proceed; standing pre-authorization for bounded `src/**`/`tests/**`/`tools/**`/`contracts/**` slices; non-`main` branch; local commit only, no push, no merge, no production declaration. Per the gap assessment's own §9 AMD-002 analysis, S1 is standing-pre-authorized (R2, no authority/identity/evidence-acceptance/security-boundary touch; unconsumed ledger).
- date: 2026-07-20

## What was built

1. **`contracts/delegation-request.schema.json`** — new closed contract (draft 2020-12, `additionalProperties: false`, identity+version required), matching this project's established schema house style (`checkpoint.schema.json`, `handoff-envelope.schema.json`, etc.). Required fields: `delegation_id`, `version`, `project_id`, `work_package_id`, `session_id`, `source_actor_id`, `destination_role`, `objective`, `inputs`, `expected_output`, `acceptance_criteria`, `ceiling`, `skills`, `budget`, `due_condition`, `escalation_route`, `evidence_obligations`, `created_at`, `content_hash`.
2. **`src/ledger/delegation-ledger.mjs`** — `DelegationLedger extends DurableLedger`, following the exact thin-subclass pattern `CheckpointLedger` (`bst/mod-runtime-s1-checkpoint-ledger`) and `DecisionLedger` (`src/ledger/temporal-ledgers.mjs`) already establish: `appendDelegationRequest()` validates the contract then delegates to the unmodified base-class `append()` (hash chain, idempotency-key replay, optimistic-concurrency `expectedSequence`, writer lock — all inherited, none reimplemented); `resolveDelegationRequest(delegationId)` is a single fail-closed exact-lookup read-side helper, mirroring `CheckpointLedger.resolveCheckpoint`'s deny-on-use shape.
3. **Registrations (mechanical, same pattern MOD-RUNTIME S1 used):** `delegationRequest` kind added to `src/contracts/contract-validator.mjs` `schemaPaths` (additive, 15th entry on this branch — this repo's `main` currently carries 13 registered kinds plus `skillCandidate`, so this is the 15th); `tools/validate-foundation.mjs` `expectedSchemas` and `mandatoryIdentityFields` extended; `tests/contract-validator.test.mjs` `validFixtures`/`invalidFixtures` extended additively (required because that test asserts `supportedContractKinds().sort()` equals `Object.keys(validFixtures).sort()` — leaving it unextended would have broken an existing, unrelated test).
4. **Fixtures:** `tests/fixtures/valid/delegation-request.json`, `tests/fixtures/invalid/delegation-request-missing-budget.json` (missing `budget`, following the same "omit one required field" pattern as the sibling `goal-missing-id.json`/`checkpoint-missing-id.json` fixtures).
5. **Tests:** `tests/delegation-ledger.test.mjs` — 17 new tests covering: positive path (hash-chain persistence across instances, contract validation before append, idempotency-key requirement), read-side lookup (`resolveDelegationRequest` exact match + fail-closed unknown/invalid id), idempotency/OCC (identical-append replay, conflicting idempotency-key reuse denied, stale optimistic sequence denied, duplicate entry-id denied, writer-lock contention denied), tamper/hash-chain detection (payload tamper detected on `read()` **and** propagates through `resolveDelegationRequest()`; flipped `recordHash` breaks `verify()`; a removed ledger line breaks the sequence chain on `verify()`), doctrine-named field enforcement (four dedicated tests — see below), and closed-schema/ceiling-shape discipline (unrecognized top-level field rejected; malformed/incomplete `ceiling` rejected) — matching the rigor `tests/checkpoint-ledger.test.mjs` and `tests/durable-ledger.test.mjs` already apply to sibling ledgers.
6. **`MANIFEST.json`** updated +6 (the five new files above plus this record).

## Doctrine sourcing for the field vocabulary (grepped before writing any schema)

`docs/07-capabilities/mcp-a2a-governance.md` line 28, "A2A Gateway" section:

> "Every delegation declares source, destination, objective, scope, inputs, expected output, acceptance criteria, authority ceiling, tools, skills, data, budget, due condition, evidence obligations, and escalation route."

This is the exact, and only, place in the repo naming these fields — confirmed by `grep -rniE "due.condition|escalation.route|expected.output|authority ceiling" docs/ src/` before writing the schema, which returned exactly this line (plus this module's own new files afterward) and the gap-assessment record's restatement of it. No parallel/invented vocabulary was introduced for any doctrine-named concept.

| Doctrine term (verbatim from line 28) | Schema field used | Resolution |
|---|---|---|
| `source` | `source_actor_id` | Verbatim concept, house-style identity-field name (matches `actor_id` convention across `checkpoint.schema.json`, `event-envelope.schema.json`, `decision-record.schema.json`). |
| `destination` | `destination_role` | **Reused verbatim from `HandoffService`'s existing field name and convention** — a single declared role, never a set, per the assessment's boundary note B4. No agent-instance routing in this slice. |
| `objective` | `objective` | Verbatim. |
| `scope` | `ceiling.paths` | **Folded, not duplicated.** "Scope" and "authority ceiling" describe the same bounded-paths concept from two doctrine angles; a second, independently-drifting `scope` array would invite exactly the kind of parallel-vocabulary drift the task instructed against. This is the gap assessment's own already-reviewed S1 resolution (§4, Slice S1 text), not an independent producer decision. |
| `inputs` | `inputs` | Verbatim field name. Array of opaque string refs, never raw content — "pointer, not payload," matching `state_snapshot_ref`'s discipline in MOD-RUNTIME's checkpoint slice. |
| `expected output` | `expected_output` | Verbatim concept, snake_case per house style. |
| `acceptance criteria` | `acceptance_criteria` | Verbatim concept, snake_case per house style. |
| `authority ceiling` | `ceiling` | **Imported shape, not re-derived** — identical to `non-escalation-comparator.mjs`'s own five-dimension ceiling object (`riskClass`, `dataClassification`, `paths`, `tools`, `transitions`), read directly from `src/services/non-escalation-comparator.mjs`'s `DIMENSIONS`/`validShape`. |
| `tools` | `ceiling.tools` | **Folded, not duplicated.** Doctrine names "tools" separately from "authority ceiling," but the comparator's ceiling already has its own `tools` dimension; a second top-level `tools` list would drift against it independently. Same resolution style as `scope` above. |
| `skills` | `skills` | Verbatim — the "required capability set" the task instruction names explicitly. |
| `data` | `ceiling.dataClassification` | **Folded, not duplicated**, same rationale as `tools`/`scope`. |
| `budget` | `budget` | Verbatim concept; opaque `{amount, unit}` pair per the assessment's own S1 text ("opaque numeric/unit pair, no accounting logic in this slice"). |
| `due condition` | `due_condition` | Verbatim concept, snake_case; opaque string claim, not enforced/evaluated in this slice (per the assessment's own S1 text). |
| `evidence obligations` | `evidence_obligations` | Verbatim concept, snake_case. |
| `escalation route` | `escalation_route` | Verbatim concept, snake_case; a single declared role, present but **not yet consumed** — the assessment's separate S3 slice is where an escalation-route primitive would consume this field. Not wired here. |

**Identity/provenance fields beyond doctrine's literal list (disclosed producer addition, per task instruction to check this repo's existing contract conventions):** `session_id` and `created_at`. Doctrine and the gap assessment's own literal S1 field enumeration name neither. `session_id` was added because every other recent identity-bearing contract this repo registers (`checkpoint.schema.json`, `event-envelope.schema.json`, `evidence-envelope.schema.json`, `decision-record.schema.json`) requires the `project_id`/`work_package_id`/`session_id`/`actor_id`/`content_hash` quintet, and the task explicitly instructed checking that convention. `created_at` was added because `DurableLedger.append()`'s base-class `validateEntry()` requires `entry.timestamp` to be a valid ISO date-time (`Number.isFinite(Date.parse(entry.timestamp))`) — a checkpoint-style ledger entry needs a source field to map to that base-class requirement, exactly as `CheckpointLedger` maps `checkpoint.created_at` to `entry.timestamp`. Both additions are schema-shape-only, no new authority semantics, no new dependency — recorded here for asynchronous GOV ratification per AMD-002's advise-and-proceed rule, mirroring how MOD-RUNTIME S1 disclosed its own `source_ledger_id` addition beyond the assessment's literal field list.

## No status field (explicit scoping decision)

The task instruction anticipated a possible need for a minimal `status` field (e.g. `PENDING`). This slice adds **none**. A delegation-request record, as scoped by the assessment's S1 slice and by this module's own boundary note B1, is a single immutable fact — "this request was made" — not a stateful entity. `HandoffService`'s own ledger, by contrast, genuinely needs a status because it models an explicit `OFFERED -> ACCEPTED/DECLINED/REVOKED` state machine for a two-party, same-work-package exchange; nothing in this slice implements or needs an analogous transition. Adding a `status` enum with no code path that ever transitions it would be an unused, untested field — the opposite of the task's own "keep it minimal" instruction. Status-transition logic for a delegation request (accept/reject/complete) is explicitly out of scope here (per task constraint 3) and is a distinct future slice's concern, not this one's — most likely the natural continuation once MA-1's authorization half (assessment Slice S2, the delegation non-escalation gate) and MA-2 (escalation-route primitive, assessment Slice S3) exist to react to a status transition meaningfully.

## Design decisions (advise-and-proceed, recorded per AMD-002 rule 3.1)

- **`ceiling` sub-schema strictness beyond the comparator's own runtime check.** `non-escalation-comparator.mjs`'s `validShape()` only checks that `riskClass`/`dataClassification` are strings and `paths`/`tools`/`transitions` are string arrays — it does not itself restrict `riskClass`/`dataClassification` to the comparator's own frozen `RISK_ORDER`/`DATA_CLASS_ORDER` values (out-of-order values are instead caught later, at comparison time, via `DENY_ESCALATION_UNCOMPARABLE`). This schema's `ceiling.riskClass`/`ceiling.dataClassification` use JSON Schema `enum` restricted to those exact frozen orders, so a malformed ceiling is rejected at ledger-append time rather than only at some future comparison time. This is a disclosed, non-regressive strengthening — it never accepts anything the comparator would have accepted, and it rejects nothing the comparator would have accepted either, since the comparator denies out-of-order values anyway. Same spirit as `retry-policy.mjs`'s disclosed strict-boolean-typing strengthening in MOD-RUNTIME S2.
- **Single read-side lookup only.** Unlike `CheckpointLedger` (which needed both an exact lookup and a "latest for session" resume-point lookup because checkpoints have an inherent recency ordering a restore consumer needs), a delegation request has no equivalent "latest" concept a minimal S1 slice should invent — multiple simultaneous open requests to the same role are normal, not something to collapse to "the newest one." This slice therefore provides exactly one read primitive, `resolveDelegationRequest(delegationId)` (exact lookup, fail-closed on unknown/invalid id), deliberately not a "list pending for role" or similar lifecycle-adjacent query — matching the assessment's own minimal S1 scoping ("ledger existence and validated shape only").
- **`budget` shape.** Defined as `{amount: number >= 0, unit: string}`, a closed sub-object. This is the assessment's own literal description ("opaque numeric/unit pair, no accounting logic in this slice") made concrete; no unit-conversion, budget-consumption-tracking, or budget-remaining logic exists anywhere in this file, matching the assessment's explicit non-goal.

## Behavior-preservation confirmation

```
git diff main -- src/ledger/durable-ledger.mjs src/ledger/governed-ledgers.mjs src/ledger/temporal-ledgers.mjs src/ledger/checkpoint-ledger.mjs src/services/handoff-service.mjs src/services/non-escalation-comparator.mjs
```

produces **zero output** — this branch does not touch the base ledger class, any sibling ledger, `HandoffService`, or `non-escalation-comparator.mjs` at all (`checkpoint-ledger.mjs` does not exist on this branch since it lives, unmerged, on `bst/mod-runtime-s1-checkpoint-ledger`; the diff command is included above for completeness and produces no output either way). `git status --short` on this branch shows exactly: `M MANIFEST.json`, `M src/contracts/contract-validator.mjs`, `M tests/contract-validator.test.mjs`, `M tools/validate-foundation.mjs` (each verified by inspection to only ADD the `delegationRequest`/15th entry, never remove or reorder an existing one) plus five new untracked files (`contracts/delegation-request.schema.json`, `src/ledger/delegation-ledger.mjs`, `tests/delegation-ledger.test.mjs`, `tests/fixtures/valid/delegation-request.json`, `tests/fixtures/invalid/delegation-request-missing-budget.json`). No existing service, ledger, contract, or test file's behavior was modified anywhere in this repository.

## No live wiring (per task constraint and assessment §5 non-goals)

`grep -rn "delegation-ledger\|DelegationLedger\|delegationRequest" src/ tests/ tools/` outside this slice's own new files and the three mechanical registration points returns no hits: nothing in `HandoffService`, `non-escalation-comparator.mjs`, `RuntimeRegistry`, `HostRuntimeAgent`, `policy-decision-point.mjs`, or any gateway/service imports `DelegationLedger`. It is not constructed anywhere outside `tests/delegation-ledger.test.mjs`. This matches the assessment's S1 scoping ("no dispatch, no authorization decision, no wiring to `RuntimeRegistry`, `HandoffService`, or the PDP in this slice") and the task's own explicit constraint against wiring into any live path.

## Test counts (exact, first-hand, this worktree)

- **Before** (`main` @ `4e25129`, `npm test`, confirmed independently in this worktree — not assumed from the gap assessment's or MOD-RUNTIME S2's own reported counts, even though both cite the same SHA): `node --test` — **612 tests / 607 pass / 0 fail / 5 skipped**; `node tools/validate-foundation.mjs` exit 0.
- **After** (this branch, `npm test`, captured after this record's own file existed so `MANIFEST.json`'s reference to it resolves): `node --test` — **629 tests / 624 pass / 0 fail / 5 skipped** (+17 tests, all new, all passing; skip count unchanged at 5); `node tools/validate-foundation.mjs` exit 0 (15-schema set, `schema.identity.contracts/delegation-request.schema.json` and `schema.closed.contracts/delegation-request.schema.json` checks pass).

## Advisory status fields

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: candidate
risk_class: medium
self_certification:
  agent_id: claude-motor-moda2a-s1
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

## Provenance

- source: first-hand implementation and verification in isolated worktree `C:\laragon\www\SecB-worktrees\mod-a2a-s1-delegation-ledger` (not the shared main working directory)
- agent_id: claude-motor-moda2a-s1 (BST-SA Motor, Claude Sonnet 5)
- timestamp: 2026-07-20
- disposition: candidate, non-main branch, local commit only — awaiting independent review and operator merge ratification, per AMD-002 rev 2

> Recommend improvements only. Do not execute them beyond this bounded slice. R-class R2 per the gap assessment's own flag table (§7); no authority semantics; unconsumed ledger.
