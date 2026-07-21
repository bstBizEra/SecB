# MOD-RUNTIME S2 Retry Policy Evaluator — Independent Review 001

**Record ID:** MOD-RUNTIME-000 / mod-runtime-s2-retry-policy-evaluator-independent-review-001
**Status:** ADVISORY — INDEPENDENT REVIEW, NOT A MERGE DECISION
**Reviewer identity:** claude-rev-modruntime-s2 (BST-SA REV worker, independent of the producer)
**Reviewed branch/commit:** `bst/mod-runtime-s2-retry-policy-evaluator` @ `dfc7004` (S2 record commit) / `f6bef0b` (implementation commit), base `main` @ `4e25129`
**Reviewed against:** `docs/03-project-control/candidates/mod-runtime-gap-assessment-001.md` (`bst/mod-runtime-assessment` @ `e9c478f`) and `docs/03-project-control/candidates/mod-runtime-s2-retry-policy-evaluator-producer-verification-001.md` (this branch)
**Method:** All findings below were reproduced first-hand in an isolated `git worktree --detach` checkout at commit `dfc7004`, with its own copy of `node_modules`, separate from the producer's own worktree (`C:\laragon\www\SecB-worktrees\mod-runtime-s2-retry-policy-evaluator`) and from any other concurrent agent session. A second isolated detached worktree at `main` @ `4e25129` was used for the baseline count. Nothing on this branch was modified by any means other than this review's own final commit; no push, no merge, no operator-authority action taken.
**Date:** 2026-07-20

---

## Verdict: **APPROVE_WITH_NOTES**

The test-count, behavior-preservation, purity, and no-wiring claims all reproduce exactly as stated. The disposition-vocabulary sourcing claim holds for four of five cited terms but is **overstated for one** (`RETRY_AUTHORIZED`'s primary citation), and the assessment's own explicit S2 acceptance check — a doc-parity fixture test — was **not implemented and not disclosed as omitted**. Both are documentation/completeness gaps, not correctness defects: the code's actual behavior is sound, fail-closed, genuinely pure, and its ledger round-trip is real. Neither finding blocks merge; both should be corrected before or shortly after merge. See §2 and §6.

---

## 1. Test-count claim — CONFIRMED, exact match

Ran `npm test` first-hand in an isolated detached-HEAD worktree at `dfc7004` (own `node_modules` copy):

- **This branch:** `tests 635 / pass 630 / fail 0 / skipped 5` — exact match to the claimed `635/630/0/5`.
- **`main` baseline** (also reproduced first-hand in a second isolated worktree at `4e25129`): `tests 612 / pass 607 / fail 0 / skipped 5` — exact match to the claimed baseline and to the `+23` delta (confirmed independently: `tests/retry-policy.test.mjs` has exactly 23 `test(` call sites, all passing).

Claim holds exactly.

## 2. Behavior-preservation claim — CONFIRMED, empty diff (with one documentation-consistency finding)

```
git diff main bst/mod-runtime-s2-retry-policy-evaluator -- src/ledger/durable-ledger.mjs src/ledger/governed-ledgers.mjs src/ledger/temporal-ledgers.mjs src/ledger/checkpoint-ledger.mjs contracts/decision-record.schema.json
```

reproduced first-hand: **zero output**. Note `src/ledger/checkpoint-ledger.mjs` does not exist on this branch at all (S1 has not merged; S2 branches independently from `main` @ `4e25129`, consistent with the producer's own disclosure of this fact) — the command was run and confirmed to produce nothing regardless. `git diff --stat` for the whole branch confirms the only touched paths are `MANIFEST.json` (pure append, +3 entries, nothing removed/reordered), the tracker log (append), the new `src/control/retry-policy.mjs`, `tests/retry-policy.test.mjs`, and this slice's own producer-verification record — 5 files, 628 insertions, 1 deletion (the deletion is the MANIFEST array's trailing-comma restructure from the append, not a removal of content). Claim holds.

**Finding (documentation-consistency, non-blocking):** the module's own header comment and the producer-verification record both cite `RETRY_AUTHORIZED` as "the literal `work_disposition` string from `docs/templates/failure-evidence-envelope.yaml`... restated in `SECB-GOV-001.md` §3.1 and `04-failure-to-capability-loop.md`." I read `docs/templates/failure-evidence-envelope.yaml` directly. Its actual `work_disposition` field literal is:

```
work_disposition: "RESEARCH_REQUIRED|REPLAN_REQUIRED|AUTHORITY_CORRECTION_REQUIRED|DEPENDENCY_RESOLUTION_REQUIRED|INCIDENT_RESPONSE_REQUIRED|RISK_ACCEPTANCE_REQUIRED"
```

`RETRY_AUTHORIZED` is **not** in that enum string. It genuinely exists, verbatim, in `docs/12-execution/04-failure-to-capability-loop.md`'s "Work disposition" list (which is fuller — it also has `CONTINUE`, `DELIVERED`, and `RETIRED_WITH_RATIONALE`, none of which appear in the envelope template either) and in `docs/00-governance/SECB-GOV-001.md` §3.1's work-item-transition list. So the *value* is genuinely doctrine-sourced and not invented — but the envelope template is the file the code comment names as primary source, and that specific file's enum is stale/incomplete relative to the fuller doctrine list. This is the same class of finding the gap assessment itself made about a different file (§6, the stale "P0-10 Checkpoint federation" skip-reason) — a pre-existing doc-vs-doc drift, not something this slice caused, but the slice's own sourcing citation should have named `04-failure-to-capability-loop.md`/`SECB-GOV-001.md` as primary and the envelope template as, at most, a field-name reference (which is accurate — the envelope's `retry_budget: 0` field name/default *does* verify verbatim). Recommend the citation be corrected in a follow-up (or opportunistically before merge); it does not change any code behavior.

## 3. `evaluateRetry` purity, and `buildRetryDecisionRecord`'s I/O-free candidate-minting — CONFIRMED

Read `src/control/retry-policy.mjs` in full (237 lines). `evaluateRetry` performs no filesystem, network, clock, or randomness access; it only reads its five destructured parameters and returns a plain object. `buildRetryDecisionRecord` only destructures `identity` and reads a static lookup table (`RATIONALE_BY_OUTCOME`) — it never constructs a `DecisionLedger`, opens a file, or appends anything.

Independently probed (not relying on the shipped 23 tests) with a standalone script run against the actual module:
- **No input mutation:** called `evaluateRetry` and `buildRetryDecisionRecord` with input objects captured before/after by structural clone comparison — neither function mutated its input.
- **Determinism:** five repeated calls with structurally-identical-but-distinct input objects produced byte-identical JSON output.
- **Frozen exports:** `FAILURE_CLASSES.push("F-FAKE")` threw `TypeError` (the array is genuinely `Object.freeze`d, not just documented as such) and left the array unchanged.

All purity claims hold under independent reproduction, not just by reading the source.

## 4. Disposition-vocabulary doctrine-sourcing — CONFIRMED for 4 of 5 rows, one overstated (see §2)

Grepped `docs/templates/failure-evidence-envelope.yaml`, `docs/00-governance/SECB-GOV-001.md`, and `docs/12-execution/04-failure-to-capability-loop.md` directly, independent of the producer's own citation table:

| Term | Independently confirmed source | Result |
|---|---|---|
| `retry_budget` field name / `0` default | `docs/templates/failure-evidence-envelope.yaml:25` — `retry_budget: 0` | CONFIRMED verbatim |
| Five retry-control rules | `docs/12-execution/04-failure-to-capability-loop.md` "Retry control" section, read in full — all five bullets match verbatim | CONFIRMED verbatim |
| `F-AUTH`..`F-SKILL` | Same doc's "Failure classes" table — all ten codes present and match `FAILURE_CLASSES` exactly | CONFIRMED verbatim |
| `decision_type: "DISPOSITION"` | `contracts/decision-record.schema.json:15` enum `["GOVERNANCE","AUTHORITY","DISPOSITION","REVERSION"]` — no new value added, `DISPOSITION` pre-exists | CONFIRMED, existing value reused |
| `DENY_RETRY_BUDGET_EXHAUSTED` / `DENY_RETRY_UNAUTHORIZED` / `DENY_RETRY_UNCHANGED` | `mod-runtime-gap-assessment-001.md` §4 Slice S2 text, verbatim | CONFIRMED — these three codes are lifted directly from the already-reviewed plan, not invented independently |
| `RETRY_AUTHORIZED` | Doctrine-sourced, but primary citation (envelope template) is inaccurate — see §2 | **PARTIALLY CONFIRMED** (value real, citation imprecise) |

## 5. Fail-closed malformed-input codes disclosed as producer addition — CONFIRMED

`DENY_INVALID_ATTEMPT`, `DENY_INVALID_RETRY_BUDGET`, `DENY_UNKNOWN_FAILURE_CLASS`, `DENY_INVALID_HYPOTHESIS_FLAG` are explicitly listed in the producer-verification record's sourcing table with the label "**Disclosed producer addition**, beyond the assessment's literal three-code sketch," with a stated rationale (fail-closed malformed-input handling, following the codebase's `DENY_<REASON>` house style) and an explicit statement that this is "Recorded here for asynchronous GOV ratification per AMD-002 rule 3.1." This is a genuine disclosure, not an implied doctrine-sourcing — confirmed by direct read of the record (lines 33–34 of the producer-verification doc).

## 6. Novel test probes (distinct from the shipped 23) — all results as predicted by reading the code, none surfaced a defect

Independently authored and ran 18 novel probes against the real module (not copies of any shipped test):

**(a) Boundary probes beyond what's shipped:**
- `attempt = 3.0` (a float literal for an exact integer) with `retryBudget = 3` → `DENY_RETRY_BUDGET_EXHAUSTED`, i.e. treated identically to integer `3` — `Number.isInteger(3.0) === true` in JS, so this is correct, not a loophole.
- `attempt = Number.MAX_SAFE_INTEGER - 1` / `Number.MAX_SAFE_INTEGER` with a matching large budget → authorized / exhausted correctly at scale — no integer-comparison bug at extreme values.
- `attempt = -0` → treated as `0`, authorized — `-0 >= 0` and `Number.isInteger(-0)` are both `true` in JS, so this is correct and not a validation gap.

**(b) `boundCorrectiveDecisionRef` present-but-malformed (not simply absent):**
- `{}`, `[]`, `false` (all present, non-blank in a colloquial sense, but wrong type) → all correctly denied `DENY_RETRY_UNAUTHORIZED`, because `isNonBlankString` checks `typeof value === "string"` first.
- **Key probe:** a syntactically-garbage but non-blank *string* (`"###not-a-real-decision-ref-shape@@@"`) → **authorized**. This confirms directly what the task asked me to determine: the check validates only presence-and-non-blank-string-ness, **not** the reference's shape or its existence against any real ledger entry. This is not a bug in this slice — it is the documented, correct scope boundary. The gap assessment's own S3 slice (`bindApproval`/`verifyApproval`, not yet built) is explicitly the primitive responsible for resolving a reference to a real decision and verifying it names the exact action/version; S2's job, per its own scoping, is only "is *something* bound," not "is the bound thing real and matching." Confirmed this boundary is intentional, not an oversight, by cross-reading the assessment's MR-3/B2/B3 boundary notes (§3 of the assessment) — S2 was never scoped to do reference resolution.
- A genuine Unicode non-breaking space (` `, code point 160) as the sole content of the ref → correctly denied as blank (JS's `String.prototype.trim()` strips Unicode whitespace per spec, and the code relies on exactly that).

**(c) `hypothesisChanged` strict-boolean-typing probe, independent of the shipped `"false"`/`"true"`/`1`/`null`/`undefined` cases:**
- `0` (falsy number, distinct from the shipped truthy `1` case) → `DENY_INVALID_HYPOTHESIS_FLAG`.
- `""` (falsy string) → `DENY_INVALID_HYPOTHESIS_FLAG`, not coerced to "unchanged."
- `new Boolean(false)` (boxed Boolean object; `typeof` is `"object"`, not `"boolean"`) → `DENY_INVALID_HYPOTHESIS_FLAG`.
- `NaN` → `DENY_INVALID_HYPOTHESIS_FLAG`.

All four confirm the "strict-boolean typing" claim independently and closed a gap the shipped suite left implicit (it tests truthy-but-wrong-type values; it does not test falsy-but-wrong-type values, which is exactly the direction where a naive `!value` coercion bug would hide). No coercion bug found — every non-boolean, regardless of truthiness, is denied.

## 7. `buildRetryDecisionRecord` round-trip through the real `DecisionLedger`, and independently-reproduced tamper detection — CONFIRMED

First noted: the shipped `tests/retry-policy.test.mjs` genuinely does append-then-reopen-then-verify (its "Real ledger recording" tests, confirmed by reading them in full) — this is real, not a return-value-only check. However, on close reading, **the shipped suite's only adversarial-append test is a malformed-*candidate* rejection at append time** (`DENY_CONTRACT_INVALID` for a record missing identity fields) — it is not a post-append *file-tampering* test. `grep -n "tamper" tests/retry-policy.test.mjs` returns no hits. The task's framing that this "simulat[es] what the producer's own tests apparently already do" does not hold for a literal post-persistence tamper test in this specific file (that pattern exists in S1's `checkpoint-ledger.test.mjs`, not here) — noted for accuracy, not as a defect, since S2 correctly relies on the base `DurableLedger`/`DecisionLedger` tamper-detection machinery already proven elsewhere and behavior-preserved (§2) rather than re-proving it.

I built and ran my own independent tamper test against a real, temporary `DecisionLedger`:
1. Built a genuine `evaluateRetry` → `buildRetryDecisionRecord` → `DecisionLedger.appendDecision` candidate (an authorized retry disposition), with real identity fields.
2. Confirmed a clean reopen (`new DecisionLedger(...).verify()`) returns `{ valid: true, ... }`.
3. Read the raw persisted NDJSON line, located the persisted `payload.outcome` field (`"RETRY_AUTHORIZED"`), and flipped one character (`RETRY_AUTHORIZED` → `RETRY_AUTHORIZEX`) via direct `writeFileSync` — a tamper on a field nested inside the payload, not the wrapper's `recordHash`/`previousHash` themselves.
4. Reopened the ledger and called both `read()` and `verify()`.

Both calls threw `LedgerError` with code `LEDGER_INTEGRITY_FAILURE`. Tamper detection on a genuinely persisted retry decision record is real, independently reproduced, and not narrower than claimed — the hash covers the full nested payload, not just top-level wrapper fields.

## 8. Design-soundness assessment: uniform governance-approval-for-every-retry via `boundCorrectiveDecisionRef`

This is a reasonable, conservative default for the current R1/R2, unwired candidate scope — with one caveat worth flagging for the wiring stage, not now.

**Why it's reasonable now:** `evaluateRetry` has no input dimension that could tell it "this particular retry doesn't relax any safety/evidence control" versus "it does" — doctrine's rule 5 ("no relaxation... without governance approval") is conditional on relaxation occurring, but the evaluator cannot detect that condition from its current inputs. Given this codebase's established fail-closed idiom (`risk-registry.mjs`'s `humanApproval` default, `policy-decision-point.mjs`'s `DENY_HUMAN_APPROVAL_REQUIRED` unless an explicit `false`), applying rule 5 unconditionally — deny unless a corrective-decision reference is bound — is the only fail-closed way to enforce a rule the evaluator cannot otherwise evaluate. Inventing a per-failure-class retryable/terminal table to relax this (as the producer's own "Deliberate non-inventions" section explains it deliberately did not do) would have been the actual overreach: doctrine names no such table, and building one would be exactly the kind of invented-vocabulary risk this task explicitly wanted checked for. On that axis, the uniform gate is the more disciplined choice, not the lazier one.

**Where the "too restrictive to be usable" risk genuinely lives:** nothing in `evaluateRetry`'s contract prevents a single governance-produced corrective decision from being referenced across every attempt within one authorized retry-budget window — the check only validates that *some* non-blank reference is present on *this* call, not that a fresh, distinct decision must be minted per attempt. Read this way, "governance approval for every retry" amortizes to "one governance decision authorizes a bounded retry sequence, referenced on each attempt within it," which is materially less restrictive than "fresh human sign-off before each individual retry attempt." Whether a live wiring step actually implements the cheaper amortized interpretation or the expensive per-attempt one is an open design question this slice does not resolve (and, per its own non-goals, correctly does not attempt to) — it is the same "adoption is later, separately-governed work" boundary the assessment already drew. Recommend this specific ambiguity (one decision per retry-attempt vs. one decision per retry-budget-window) be resolved explicitly, in writing, at whichever future slice actually wires a caller to this evaluator — not before then, since resolving it now would be scope creep past what this slice was dispatched to build.

**Verdict on this axis:** reasonable and appropriately conservative for R1/R2 candidate-preparation scope; the design choice does not, by itself, make the evaluator unusable — the amortization question above is what will determine usability once wired, and that question is correctly deferred rather than pre-answered here.

## 9. Hardcoded test-case-ID branching — CONFIRMED absent

`grep -in "test.*case|testcase|TEST_ID|caseId" src/control/retry-policy.mjs` returns nothing. Read the full file independent of the grep: every branch is keyed on the function's five real parameters (`attempt`, `retryBudget`, `priorFailureClass`, `hypothesisChanged`, `boundCorrectiveDecisionRef`); there is no code path that special-cases a literal test fixture value, identifier, or magic string tied to `tests/retry-policy.test.mjs`. Confirms the module is genuinely pure and test-agnostic, not shaped around its own test suite.

## 10. No live wiring — CONFIRMED

`grep -rn "retry-policy" src/ tools/` outside the module's own header-comment self-reference returns nothing. `grep -rln "evaluateRetry|buildRetryDecisionRecord"` across `src/`, `tools/`, `tests/` returns exactly the module's own file and its own test file. Nothing in `HostRuntimeAgent`, `state-machine.mjs`, or `policy-decision-point.mjs` references this module. Matches the assessment's S2 scoping and the task's own no-wiring constraint.

## 11. Assessment-scoping observation (non-blocking, inherited from the planning stage, not this slice)

The gap assessment's own S2 heading is "Retry policy evaluator (**closes MR-2**, MR-6)," but MR-2's gap description names a fuller "Retry orchestration primitive (attempt counter, budget, backoff policy, idempotent replay awareness)." This slice — by its own header comment's explicit framing, "a DECISION FUNCTION, not a retry executor" — implements only the authorization-decision portion: no internal attempt-counter state, no backoff shape, and no retry-specific idempotent-replay logic beyond what `DecisionLedger`'s generic idempotency key already provides. This is not a defect in what was produced — the slice correctly built exactly what its own bounded plan described, and the "Deliberate non-inventions" section discloses the backoff omission explicitly — but "closes MR-2" is a generous characterization inherited from the assessment stage: an orchestration primitive with attempt-tracking and backoff is a materially different (and larger) thing than a pure policy evaluator. Flagged for the tracker/operator record so MR-2 is understood as *partially* closed (the decision-gate portion) rather than fully closed, pending a future slice that actually tracks attempts and backoff if doctrine ever names a backoff shape.

---

## Summary of findings

| # | Item | Result |
|---|---|---|
| 1 | Test counts (635/630/0/5, +23 over 612/607/0/5) | CONFIRMED exact |
| 2 | Behavior preservation (empty diff on ledger files + schema) | CONFIRMED; one doc-citation overstatement noted (`RETRY_AUTHORIZED` primary source) |
| 3 | `evaluateRetry` purity / `buildRetryDecisionRecord` I/O-freedom | CONFIRMED, independently reproduced |
| 4 | Disposition vocabulary doctrine-sourcing | CONFIRMED for 4/5 rows; 1 overstated citation, value still real |
| 5 | Malformed-input codes disclosed as producer addition | CONFIRMED, genuinely disclosed |
| 6 | Novel test probes (boundary, malformed-ref, strict-boolean) | 18/18 as predicted, no defect surfaced |
| 7 | Ledger round-trip + independently-reproduced tamper detection | CONFIRMED; shipped suite's "adversarial" test is input-validation, not post-persist tamper — corrected framing, not a defect |
| 8 | Governance-approval-for-every-retry design choice | Reasonable/conservative now; one amortization ambiguity flagged for wiring-time resolution |
| 9 | No hardcoded test-case-ID branching | CONFIRMED absent |
| 10 | No live wiring | CONFIRMED |
| 11 | "Closes MR-2" scoping characterization | Partially generous; disclosed omissions (backoff, attempt-tracking) are real and correctly flagged by producer, but "closes" overstates completeness of MR-2 itself |

## Recommendation

**APPROVE_WITH_NOTES.** The implementation is correct, genuinely pure, fail-closed, non-regressive, and unwired exactly as claimed, with real (not simulated) ledger round-trip and tamper-detection behavior. Two documentation-quality notes should be corrected — ideally before merge since both are single-line/paragraph fixes, but neither blocks it:

1. Correct the `RETRY_AUTHORIZED` sourcing citation in `src/control/retry-policy.mjs`'s header comment and the producer-verification record to name `docs/12-execution/04-failure-to-capability-loop.md` and `docs/00-governance/SECB-GOV-001.md` §3.1 as primary sources, not `docs/templates/failure-evidence-envelope.yaml` (whose `work_disposition` enum does not actually contain this value).
2. Either add the doc-parity fixture test the gap assessment's own S2 acceptance checks called for (embedding the five retry-control doctrine bullets as fixtures so future drift against `04-failure-to-capability-loop.md` fails the suite), or explicitly disclose its omission in the producer-verification record the way other scope deviations in this record are disclosed.

Neither finding weakens any existing guarantee, touches any live path, or contradicts the behavior-preservation/test-count/purity claims, all of which hold exactly as stated under independent, first-hand reproduction.

---

## Advisory status fields

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: existing
risk_class: low
self_certification:
  agent_id: claude-rev-modruntime-s2
  peer_agent_id: claude-motor-modruntime-s2
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

## Provenance

- source: first-hand reproduction in isolated detached-HEAD worktrees at `dfc7004` (this branch) and `4e25129` (`main` baseline), each with an independent `node_modules` copy, separate from the producer's own worktree
- agent_id: claude-rev-modruntime-s2 (BST-SA REV worker, independent of producer)
- timestamp: 2026-07-20
- disposition: advisory independent review, committed to this branch via an isolated detached-HEAD worktree with the branch ref moved by `git update-ref` — no push, no merge, no operator-authority action taken

> Recommend improvements only. Do not execute them. This review is advisory input to the operator's merge decision, not a merge action itself.
