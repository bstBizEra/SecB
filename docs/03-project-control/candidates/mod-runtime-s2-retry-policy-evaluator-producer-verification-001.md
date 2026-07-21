# MOD-RUNTIME Slice S2 — Producer Self-Verification (mod-runtime-s2-retry-policy-evaluator-producer-verification-001)

- producer_identity: `claude-motor-modruntime-s2`
- producer_role: BST-SA Motor (bounded implementation, advise-and-proceed)
- target_branch: `bst/mod-runtime-s2-retry-policy-evaluator`
- base: `main` @ `4e25129` (`Merge pull request #19 from bstBizEra/claude/rev/mod-know-s2`) — confirmed first-hand via `git rev-parse main` in a fresh worktree at task start; NOT the same SHA the assessment or S1 cited (`ed7981f`), since `main` moved between those records and this one. This slice branches from the current SHA, not from S1's branch (S1 has not merged).
- assessment_source: `docs/03-project-control/candidates/mod-runtime-gap-assessment-001.md` (`bst/mod-runtime-assessment` @ `e9c478f`) — closes gap **MR-2** (retry orchestration primitive, entirely missing), advances **MR-6** (retry doctrine/schema vocabulary already named, codified), Slice **S2** of the assessment's bounded 3-slice plan
- prior-slice cross-check: read `docs/03-project-control/candidates/mod-runtime-s1-checkpoint-ledger-producer-verification-001.md` and `mod-runtime-s1-checkpoint-ledger-independent-review-001.md` (`bst/mod-runtime-s1-checkpoint-ledger` @ `4c83e16`/`454c6fb`, independently reviewed APPROVE_FOR_MERGE) in full before starting. S1 touches `contracts/checkpoint.schema.json`, `src/ledger/checkpoint-ledger.mjs`, and the two mechanical registration points (`src/contracts/contract-validator.mjs`, `tools/validate-foundation.mjs`); this slice touches none of those files and adds no new contract kind, so there is no collision or duplication with S1's work. `git diff` confirms zero overlap (see "Behavior-preservation" below).
- governance: `AGENTS.md` `SECB-AGENTS-AMD-002` (revision 2) advise-and-proceed; standing pre-authorization for bounded `src/**`/`tests/**`/`tools/**`/`contracts/**` slices; non-`main` branch; local commit only, no push, no merge, no production declaration. Per the gap assessment's own §8 AMD-002 analysis, S2 is standing-pre-authorized (R1/R2, no authority/identity/evidence-acceptance/security-boundary touch).
- date: 2026-07-20

## What was built

1. **`src/control/retry-policy.mjs`** — pure retry-policy evaluator. Exports:
   - `FAILURE_CLASSES` — the ten doctrine failure-class codes, verbatim from `docs/12-execution/04-failure-to-capability-loop.md` "Failure classes" (`F-AUTH`, `F-TECH`, `F-DEP`, `F-EVID`, `F-QUAL`, `F-SEC`, `F-OPS`, `F-OUT`, `F-KNOW`, `F-SKILL`).
   - `RETRY_AUTHORIZED` — the literal `work_disposition` string from `docs/templates/failure-evidence-envelope.yaml` (also restated in `docs/00-governance/SECB-GOV-001.md` §3.1 and `04-failure-to-capability-loop.md`). This is the **only** positive outcome the evaluator ever returns; it is not a code this slice invented.
   - `evaluateRetry({ attempt, retryBudget, priorFailureClass, hypothesisChanged, boundCorrectiveDecisionRef })` — pure, no I/O, deny-by-default. Returns `{ ok: true }` or `{ ok: false, code }`.
   - `buildRetryDecisionRecord(evaluation, identity)` — pure candidate-minting function. Builds a `decision-record`-shaped object (`decision_type: "DISPOSITION"`, `outcome` = `RETRY_AUTHORIZED` or the exact deny code) but performs **no I/O** and holds no ledger authority — it never opens or appends to a ledger. The caller appends the returned candidate through the existing, unmodified `DecisionLedger.appendDecision(...)`.
2. **`tests/retry-policy.test.mjs`** — 23 new tests (disposition matrix, boundary conditions, precedence, and real ledger-recording — see below).
3. **`MANIFEST.json`** updated +3 (the two new files above plus this record). No schema, no contract-validator/foundation-validator registration touched — this slice adds no new contract kind, so those mechanical registration points (which S1 correctly touched for its new `checkpoint` kind) are correctly left untouched here.

## Disposition vocabulary and its doctrine source (grepped before writing any code)

Grepped the full repo (`grep -rniE "retry_budget|RETRY_AUTHORIZED|retryBudget"` and `grep -rniE "retry|backoff" src/`) before designing anything, per task instruction. Findings:

| Term | Source | Verbatim or derived |
|---|---|---|
| `RETRY_AUTHORIZED` | `docs/templates/failure-evidence-envelope.yaml` `work_disposition` enum; restated in `docs/00-governance/SECB-GOV-001.md` §3.1 and `docs/12-execution/04-failure-to-capability-loop.md` "Work disposition" | **Verbatim doctrine literal.** Used unmodified as the evaluator's only positive outcome. |
| `retry_budget` (as `retryBudget` param) | `docs/templates/failure-evidence-envelope.yaml` | **Verbatim field name** (camelCased for the JS parameter per this codebase's existing convention, e.g. `checkpoint_id` schema field vs. `checkpointId` JS parameter in `checkpoint-ledger.mjs`). |
| Five retry-control rules (changed hypothesis/input/environment/action; bounded count and budget; preserved prior evidence; explicit success criteria; no relaxation without governance approval) | `docs/12-execution/04-failure-to-capability-loop.md` "Retry control" | **Verbatim doctrine rules**, codified 1:1 as the evaluator's substantive gates (see below — one rule, "preserved prior evidence," is deliberately **not** gated in this slice; see "Scope note" below). |
| `F-AUTH`..`F-SKILL` failure-class codes | `docs/12-execution/04-failure-to-capability-loop.md` "Failure classes" table | **Verbatim codes**, used to fail-closed validate `priorFailureClass`. |
| `decision_type: "DISPOSITION"` | `contracts/decision-record.schema.json` enum (`GOVERNANCE`, `AUTHORITY`, `DISPOSITION`, `REVERSION`) | **Existing enum value reused**, per the gap assessment's own S2 slice text ("retries are recorded through the *existing* `DecisionLedger` (`decision_type: "DISPOSITION"`)... zero new persistence surface") and per the task's own instruction to reuse rather than add a new enum value — mirrors how the assessment's S3 (approval-binding) deliberately reuses `decision_type: "GOVERNANCE"` rather than adding `APPROVAL`. |
| `DENY_RETRY_BUDGET_EXHAUSTED`, `DENY_RETRY_UNAUTHORIZED`, `DENY_RETRY_UNCHANGED` | The gap assessment's own literal S2 slice description (§4, Slice S2) | **Taken verbatim from the reviewed, bounded plan** this slice was dispatched to implement — not invented independently. |
| `DENY_INVALID_ATTEMPT`, `DENY_INVALID_RETRY_BUDGET`, `DENY_UNKNOWN_FAILURE_CLASS`, `DENY_INVALID_HYPOTHESIS_FLAG` | Not named by the assessment or doctrine | **Disclosed producer addition**, beyond the assessment's literal three-code sketch — fail-closed malformed-input handling, following this codebase's established `DENY_<REASON>` house style (`risk-registry.mjs`'s `DENY_UNKNOWN_RISK_CLASS`, `checkpoint-ledger.mjs`'s `DENY_INVALID_CHECKPOINT_ID`, etc.). Recorded here for asynchronous GOV ratification per AMD-002 rule 3.1, mirroring how S1 disclosed its own `source_ledger_id` field addition beyond the assessment's literal S1 field list. |

### Deliberate non-inventions (doctrine is silent — nothing invented to fill the silence)

- **No backoff shape.** `grep -riE "retry|backoff" src/` returned zero hits before this slice, and the five retry-control rules in `04-failure-to-capability-loop.md` never name a backoff shape (fixed/exponential/jittered) — only bounded count/budget. Backoff timing is a retry-*loop* concern (deciding *when* to re-attempt), which the task explicitly excluded ("NOT a running retry executor"). Not implemented; not named.
- **No per-failure-class retryable/terminal partition.** The task prompt suggested a code like `RETRY_DENIED_NON_RETRYABLE_ERROR`, but no doctrine source names any failure class (including `F-SEC`, `F-AUTH`) as categorically non-retryable. Doctrine's actual mechanism for "don't retry unsafely" is rule 5 — no relaxation of safety/evidence controls without governance approval — which this slice enforces **uniformly across every failure class** via the mandatory `boundCorrectiveDecisionRef` (`DENY_RETRY_UNAUTHORIZED`), not via an invented per-class table. Inventing such a table would have been exactly the "invent parallel terms" the task instructed against. `priorFailureClass` is still fail-closed validated against the ten recognized codes (`DENY_UNKNOWN_FAILURE_CLASS`), so no class silently defaults to permissive.
- **Scope note — "preserved prior evidence" (doctrine rule 3) and "explicit success criteria" (rule 4) are not gated as separate deny codes.** The gap assessment's own literal S2 slice description enumerates exactly three deny codes (budget, unauthorized, unchanged), corresponding to rules 2, 5, and 1. It does not propose separate codes for rules 3/4. This slice implements exactly the assessment's bounded, already-reviewed plan rather than unilaterally expanding scope to add two more gates the assessment did not scope — an expansion of this kind would be a design decision belonging to the assessment/planning step, not to a producer executing a already-bounded slice. Flagged here for the record so a future slice or GOV ratification can decide whether rules 3/4 warrant their own evaluator gates (they are evidence/process obligations arguably owned by MOD-EVID's failure-envelope lifecycle rather than by the retry-authorization decision itself, since preserved evidence and success criteria live on the Failure Evidence Envelope, not on the retry decision inputs this evaluator was scoped to take).

## Design decisions (advise-and-proceed, recorded per AMD-002 rule 3.1)

- **`attempt`/`retryBudget` indexing convention.** The assessment names both fields but does not pin their exact indexing semantics. This slice defines `attempt` as the count of retries **already consumed** before this evaluation (0 = no retry attempted yet), and authorizes while `attempt < retryBudget`; the boundary case `attempt === retryBudget` is exhausted (no budget remains for a further retry). This is the conventional `for (attempt = 0; attempt < maxRetries; attempt++)` indexing already idiomatic in this codebase's numeric-boundary style (cf. `risk-registry.mjs`'s `isRiskAtMost`/`isMutationAtMost` using `<=` on frozen order arrays). Boundary tests cover both sides (`attempt = retryBudget - 1` authorized, `attempt = retryBudget` and beyond denied) plus the doctrine-named default of `retry_budget: 0` (denies on the very first evaluation, since no budget was ever authorized).
- **Deterministic precedence order.** Checks run: malformed input (attempt/retryBudget/failureClass/hypothesisChanged type/shape) → budget exhaustion → no bound corrective decision → hypothesis unchanged → authorized. Malformed input is checked first (fail-closed on garbage before evaluating doctrine gates against it); among the three doctrine gates, budget is checked first as the hardest resource constraint, then governance-approval-boundness, then the change requirement. Tested explicitly (`evaluateRetry checks budget exhaustion before authorization before hypothesis-change`) so this ordering is a documented, test-locked contract rather than an implementation accident.
- **Strict `hypothesisChanged` typing.** A non-boolean value (e.g. the string `"false"`) is denied with its own code (`DENY_INVALID_HYPOTHESIS_FLAG`) rather than coerced by truthiness. Truthy coercion would have let a caller accidentally pass `"false"` (a truthy JS string) and get authorized despite meaning to signal "unchanged" — a real fail-open risk on exactly the doctrine rule meant to stop bare loop-and-hope retries. This is a deliberate, disclosed strengthening beyond the assessment's literal sketch, in the same spirit as `checkpoint-ledger.mjs`'s disclosed `DENY_MISSING_ENTRY_FIELDS` strengthening over `EvidenceLedger`'s bare `TypeError` (flagged as a minor, non-regressive improvement in S1's independent review, §3).
- **`buildRetryDecisionRecord` mints, never appends.** Mirrors `policy-decision-point.mjs`'s own documented discipline ("the PDP holds no ledger authority, the caller appends it") and the assessment's S3 approach to `bindApproval`. This keeps the evaluator itself I/O-free and testable as a pure function, while still letting tests demonstrate genuine, real, hash-chained ledger recording (task requirement 3/4) by having the *test* call `DecisionLedger.appendDecision` with the candidate this module produces — exactly the "candidate, not activation" pattern this module family already establishes.

## Behavior-preservation confirmation

```
git diff main -- src/ledger/durable-ledger.mjs src/ledger/governed-ledgers.mjs src/ledger/temporal-ledgers.mjs src/ledger/checkpoint-ledger.mjs contracts/decision-record.schema.json
```

produces **zero output** — this branch does not touch `DecisionLedger`, any other ledger class, S1's `checkpoint-ledger.mjs`, or the decision-record schema at all. `git status --short` on this branch shows exactly: `M MANIFEST.json` (additive: +3 file paths, nothing removed or reordered — confirmed by inspection of the diff, which is a pure append inside the `files` array) plus two new untracked files (`src/control/retry-policy.mjs`, `tests/retry-policy.test.mjs`). No existing service, ledger, contract, or test file's behavior was modified anywhere in this repository.

## No live wiring (per task constraint and assessment §5 non-goals)

`grep -rn "retry-policy" src/ tools/` outside this slice's own file returns no hits (the only match is the module's own header comment naming itself). `grep -rn "retry-policy" tests/` returns exactly one import, in `tests/retry-policy.test.mjs` itself. Nothing in `HostRuntimeAgent`, `state-machine.mjs`, `policy-decision-point.mjs`, or any gateway/service imports `evaluateRetry` or `buildRetryDecisionRecord`. It is not constructed or called anywhere outside this slice's own test file. This matches the assessment's S2 scoping ("no wiring into `HostRuntimeAgent` or any live retry loop in this slice") and the task's own constraint.

## Tests (23 new, exhaustive disposition matrix)

- **Positive path:** authorized at attempt 0 with a budget of 3; authorized at every attempt strictly below budget (0, 1, 2 of 3).
- **Budget boundary (task-required):** denied exactly at `attempt === retryBudget` (3 of 3); denied beyond it (4 of 3); denied on the doctrine-named default `retry_budget: 0` at the very first evaluation; the `retryBudget === 1` edge (authorized at attempt 0, denied at attempt 1).
- **Rule 5 (governance approval / non-retryable-without-authorization, task-required "non-retryable" case):** denied for missing/null/blank/whitespace/non-string `boundCorrectiveDecisionRef`, confirmed across every one of the ten doctrine failure classes (no class gets a free pass).
- **Rule 1 (changed hypothesis):** denied when explicitly unchanged; strict-boolean-typing tests confirm no truthy-coercion fail-open on non-boolean values (`"false"`, `"true"`, `1`, `null`, `undefined`).
- **Fail-closed malformed input:** negative/non-integer/wrong-type/undefined/`NaN` for `attempt` and `retryBudget`; unrecognized/blank/wrong-type `priorFailureClass`; every one of the ten recognized classes individually confirmed valid; fully empty/undefined call.
- **Deterministic precedence:** malformed input wins over doctrine gates; among doctrine gates, budget wins over authorization wins over hypothesis-change, confirmed with combined-violation inputs.
- **Candidate construction:** `RETRY_AUTHORIZED` outcome on authorization; exact deny code as outcome on denial; confirmed I/O-free (no ledger/filesystem touched to build a candidate).
- **Real ledger recording (task requirement 4 — not just returned):** an authorized disposition is appended via the real, unmodified `DecisionLedger.appendDecision`, then the ledger is **reopened from disk** and the persisted record's `outcome`/`decision_type` and the full hash-chain `verify()` are checked, plus `resolveEffective` resolves it `ALLOW`. All three denial-code dispositions in the matrix are appended in sequence and confirmed persisted-in-order on reopen with a valid hash chain. A final adversarial test confirms this module does **not** duplicate or shadow `DecisionLedger`'s own contract validation: a candidate missing required identity fields is rejected by the ledger itself with `DENY_CONTRACT_INVALID`, exactly as any other malformed decision record would be.

## Test counts (exact, first-hand, this worktree)

- **Before** (`main` @ `4e25129`, `npm test`, confirmed independently — not assumed from S1's or the assessment's own reported counts, both of which cited an earlier `main` SHA `ed7981f`): `node --test` — **612 tests / 607 pass / 0 fail / 5 skipped**; `node tools/validate-foundation.mjs` exit 0.
- **After** (this branch, `npm test`, captured after this record's own file existed so `MANIFEST.json`'s reference to it resolves): `node --test` — **635 tests / 630 pass / 0 fail / 5 skipped** (+23 tests, all new, all passing; skip count unchanged at 5); `node tools/validate-foundation.mjs` exit 0 (no new schema, no schema-count/identity checks affected — `expectedSchemas` set is unchanged at 14 entries, confirming this slice added zero new contract kinds).

## Advisory status fields

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: candidate
risk_class: low
self_certification:
  agent_id: claude-motor-modruntime-s2
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

## Provenance

- source: first-hand implementation and verification in isolated worktree `C:\laragon\www\SecB-worktrees\mod-runtime-s2-retry-policy-evaluator` (not the shared main working directory), branched from `main` @ `4e25129` confirmed via `git rev-parse main` at task start, not assumed from any prior record
- agent_id: claude-motor-modruntime-s2 (BST-SA Motor, Claude Sonnet 5)
- timestamp: 2026-07-20
- disposition: candidate, non-main branch, local commit only — awaiting independent review and operator merge ratification, per AMD-002 rev 2

> Recommend improvements only. Do not execute them beyond this bounded slice. R-class R1/R2 per the gap assessment's own flag table (§7): pure evaluator, doctrine codification, no wiring into any live path.
