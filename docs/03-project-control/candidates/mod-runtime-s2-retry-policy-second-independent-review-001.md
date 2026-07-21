# MOD-RUNTIME S2 Retry Policy Evaluator — Second Independent Review 001

**Record ID:** MOD-RUNTIME-000 / mod-runtime-s2-retry-policy-second-independent-review-001
**Status:** ADVISORY — INDEPENDENT REVIEW, NOT A MERGE DECISION
**Reviewer identity:** claude-immune (BST-SA Immune worker; independent of both the producer and the first reviewer)
**Reviewed:** `src/control/retry-policy.mjs` as merged to `main` via PR #23 (`b667eb5`, implementation `f6bef0b`, first review `7075c27`)
**Reviewed against:** `docs/03-project-control/candidates/mod-runtime-s2-retry-policy-evaluator-independent-review-001.md` (first review, `APPROVE_WITH_NOTES`) and `mod-runtime-s2-retry-policy-evaluator-producer-verification-001.md`
**Method:** Isolated `git worktree add --detach` checkout of `origin/main` (`a67169b`) at `C:\laragon\www\SecB\.worktrees\immune-runtime-s2-review`, own `node_modules`, no live branch touched, no push. This review does not simply re-derive the first review's conclusions — it independently re-read the full module and targeted specifically what the first pass's own summary shows it did *not* probe: cross-slice interaction with MOD-RUNTIME-S1's CheckpointLedger (fixed this session, not yet merged), and check-then-act/TOCTOU integrity of the retry ceiling once this decision function is actually wired to a live caller.
**Date:** 2026-07-21

---

## Verdict: **APPROVE_WITH_NOTES**

The merged code is correct, genuinely pure, fail-closed, and exactly as narrow in scope as it claims. No defect was found in `evaluateRetry` or `buildRetryDecisionRecord` themselves, and the CheckpointLedger stale-resume bug (fixed this session on `bst/mod-runtime-s1-checkpoint-ordering-fix-001`, not yet merged) never had any bearing on this module. However, this review identifies one substantive, previously-undisclosed **design gap in the guarantee surface**: the ledger substrate this module's output is meant to be recorded through (`DecisionLedger.appendDecision`) provides **no atomic ceiling-enforcement hook**, unlike `CheckpointLedger`'s own `preWriteCheck`-based regression gate added in this session's S1 fix. That gap does not make any merged code incorrect today (nothing is wired), but it means the "bounded retry count" guarantee this evaluator's doctrine citation rests on is **not actually enforceable as a ratchet** by any mechanism that exists in this codebase yet — it depends entirely on a not-yet-written future caller getting an ordering discipline right that nothing here checks, tests, or even documents. This should be recorded as a fast-follow requirement on whichever slice first wires a caller, not treated as blocking S2 itself.

---

## 1. Full-file independent re-read — confirms first review's structural claims

Read `src/control/retry-policy.mjs` in full (237 lines) independent of the first review's account. Confirms:
- `evaluateRetry` is genuinely pure: five destructured parameters in, a plain `{ ok, code? }` object out. No `import` of any ledger, filesystem, clock, or randomness source anywhere in the file.
- `buildRetryDecisionRecord` only reads a static `RATIONALE_BY_OUTCOME` lookup table and the caller-supplied `identity` object — it constructs a candidate record, nothing more.
- Deny-by-default ordering: malformed input (`DENY_INVALID_ATTEMPT` / `DENY_INVALID_RETRY_BUDGET` / `DENY_UNKNOWN_FAILURE_CLASS` / `DENY_INVALID_HYPOTHESIS_FLAG`) is checked before any doctrine gate; budget exhaustion is checked before the corrective-decision-reference gate; hypothesis-change is checked last. Boundary is `attempt >= retryBudget` (inclusive at equality) — correct per the module's own comment ("attempt is the count already consumed").
- `grep -in "test.?case|testcase|TEST_ID|caseId"` against `src/control/retry-policy.mjs`: **no hits**. No hardcoded test-ID branching in this module.

## 2. TOCTOU / check-then-act on the retry ceiling — no internal state to race against, but a real gap in the guarantee surface once wired

`evaluateRetry` consults **no external or mutable state at all**. `attempt` and `retryBudget` are plain caller-supplied integers; the function never reads a counter, a ledger, a checkpoint, or a clock. So within this file, by construction, there is no check-then-act race — there is nothing to race against, because there is no I/O.

That pushes the real question to the substrate this module's output is meant to flow through. I read `src/ledger/durable-ledger.mjs` (`DurableLedger.append`, lines 137–210) and `src/ledger/temporal-ledgers.mjs` (`DecisionLedger.appendDecision`, lines 54–81) in full:

- `DurableLedger.append` takes an exclusive filesystem lock (`mkdirSync` on a lock directory, throwing `LEDGER_BUSY` on `EEXIST`), then re-reads and re-verifies the ledger **inside** the lock, checks `expectedSequence` as an optimistic-concurrency-control token (`DENY_SEQUENCE_CONFLICT` if stale), and — critically — exposes an optional `preWriteCheck(records, entry)` hook that runs **inside the same lock-held critical section**, "so a subclass invariant that depends on 'what else is currently in the chain' ... can be evaluated atomically with the write" (durable-ledger.mjs:128–136, explicitly citing the MOD-WSPACE-S3 single-writer TOCTOU fix as the precedent this hook exists to generalize).
- `CheckpointLedger.appendCheckpoint` (fixed this session, `bst/mod-runtime-s1-checkpoint-ordering-fix-001`, `ca7f14c`) **uses** this hook: its new `preWriteCheck` throws `DENY_CHECKPOINT_REGRESSION` if the candidate's `sequence_at_checkpoint` is not strictly greater than the current latest for the same session — a genuine atomic ratchet.
- `DecisionLedger.appendDecision` (temporal-ledgers.mjs:59–81), the ledger this evaluator's `buildRetryDecisionRecord` output is designed to be appended through, **does not pass a `preWriteCheck`** to the base `append()` call at all (line 77–80: `this.append(toEntry(...), { expectedSequence })` — no third hook argument). It has no business-rule gate analogous to the checkpoint regression check.

**Consequence:** the ledger mechanism that *could* make "bounded retry count" an atomic ratchet — recomputing "how many retries has this work item already consumed" and vetoing an append that would exceed budget, evaluated inside the same lock as the write — exists in this codebase (proven out by `CheckpointLedger`'s own fix this session) but is **not wired for retry dispositions**. Today that is inert (nothing calls `evaluateRetry` or `appendDecision` for retry dispositions in any live path — confirmed, §5 below), so it is not a live bug. But it means a future caller that does the natural thing — read the ledger to count prior `RETRY_AUTHORIZED` dispositions for a work item, call `evaluateRetry(attempt: count, ...)`, actually perform the retried operation, *then* append the disposition — has no structural protection against two concurrent evaluations both reading the same stale count, both getting `{ ok: true }`, and both executing the retried operation before either append lands. The ledger's `expectedSequence` CAS would only catch this **after the fact**, at append time (one of the two appends would get `DENY_SEQUENCE_CONFLICT`) — too late to stop a double-execution of whatever "retry" means downstream, only useful for detecting that it happened. Only an execute-*after*-append ("reserve, then act") caller discipline, or a `preWriteCheck`-based ceiling gate analogous to `CheckpointLedger`'s, would actually prevent it.
- This is **not** something either the producer-verification record or the first independent review examined: I grepped both for `concurren|race|atomic|reserv` — no substantive discussion in either. The first review's §8 discusses a related-but-distinct question (whether one governance decision may be amortized across a retry window vs. requiring one per attempt) but does not address the append-vs-execute ordering question at all.

**Recommendation:** before any future slice wires a live caller to `evaluateRetry`, that slice should either (a) mandate and test a reserve-then-act calling convention (append the `RETRY_AUTHORIZED` disposition, using `expectedSequence`/idempotency as the actual admission gate, *before* the retried operation executes — not after), or (b) add a `preWriteCheck`-based ceiling gate to wherever retry dispositions are appended, mirroring `CheckpointLedger`'s regression gate. Neither exists today. This is advisory guidance for the next slice, not a defect in the merged S2 code.

## 3. Interaction with the just-fixed CheckpointLedger bug — none, confirmed by absence

`grep -n "Checkpoint|checkpoint|resolveLatest|resolveCheckpoint|Ledger" src/control/retry-policy.mjs`: **zero matches**. `retry-policy.mjs` does not import, call, or reference `CheckpointLedger`, `resolveLatest`, or `resolveCheckpoint` anywhere. It has no state of its own beyond its caller-supplied parameters.

The CheckpointLedger bug (fixed on `bst/mod-runtime-s1-checkpoint-ordering-fix-001`, `ca7f14c`, not yet merged to `main`) was that `resolveLatest` picked the checkpoint with the highest ledger-append-order `sequence` rather than the highest `sequence_at_checkpoint` (content order) for a session — a defect entirely internal to `CheckpointLedger`'s own resolution logic. Since retry-policy never calls into `CheckpointLedger` at all (confirmed by grep, and by the fact that S2 branched from `main` before S1 even existed on `main` — the first review independently noted `checkpoint-ledger.mjs` doesn't exist on S2's base commit), that bug had **no bearing whatsoever**, past or present, on retry-policy's correctness. Retry-policy's state (`attempt`, `retryBudget`) is entirely independent and was never at risk from the checkpoint-ordering bug.

## 4. Ceiling/ratchet integrity of the evaluator itself — sound, monotonic in its own terms

`attempt >= retryBudget` denies. Both are validated as non-negative integers before the comparison runs; a non-integer, negative, or wrong-typed value denies rather than being coerced (`isNonNegativeInteger` checks `typeof === "number" && Number.isInteger(value) && value >= 0`). There is no code path by which a malformed or adversarial `attempt`/`retryBudget` input relaxes the ceiling — every non-conforming input is a denial, not a default-allow. I independently re-verified this by hand-tracing all four validation branches against the five parameters; no branch order allows a later, more-permissive check to override an earlier ceiling-relevant one. This matches the first review's independently-reproduced boundary probes (§6(a) of the first review), which I did not need to re-run since they were reproduced first-hand there with real code execution, not just claimed.

The evaluator itself cannot be tricked into loosening a ceiling — the gap identified in §2 above is about the *absence* of an atomic enforcement mechanism once wired, not about this function computing the wrong answer for the inputs it's given.

## 5. Silent-fail-open — confirmed absent

Every one of the four malformed-input branches (`DENY_INVALID_ATTEMPT`, `DENY_INVALID_RETRY_BUDGET`, `DENY_UNKNOWN_FAILURE_CLASS`, `DENY_INVALID_HYPOTHESIS_FLAG`) denies. `boundCorrectiveDecisionRef` absent, blank, `null`, or non-string denies (`DENY_RETRY_UNAUTHORIZED`) — there is no default that treats "missing corrective decision" as "authorized." `hypothesisChanged` must be a strict boolean; any non-boolean (including truthy values like `1`, `"true"`) denies rather than being coerced to permissive `true`. No ambiguous or malformed input reaches the `{ ok: true }` return path. Confirmed by full read of the file; the first review's independently-executed probes (§6(b)/(c)) corroborate this at the input-fuzzing level.

## 6. Downstream consumers / trust-assumption gap

`grep -rn "retry-policy" src/ tools/` (outside the module's own header self-reference) and `grep -rln "evaluateRetry|buildRetryDecisionRecord"` across `src/`, `tools/`, `tests/`: only the module's own file and its own test file. **No live caller exists.** Nothing in `HostRuntimeAgent`, `state-machine.mjs`, or `policy-decision-point.mjs` references this module — reconfirmed independently, matching both the producer's and first reviewer's disclosure.

Because there is no caller yet, there is no live "caller assumes a guarantee that isn't true" bug today. The trust-assumption risk is prospective: the module's own header comment and doctrine citations imply "bounded retry count" is an enforced ceiling, but as detailed in §2, nothing in the current codebase would enforce that ceiling atomically across concurrent evaluations once a caller exists, unless that caller is deliberately built with the reserve-then-act / preWriteCheck-gated discipline this review recommends. This is the one point at which "what the doctrine implies" and "what the code can currently guarantee once wired" diverge, and it was not disclosed as a caveat by either the producer or the first reviewer.

## 7. Test suite — reproduced first-hand

- Full suite (`npm test` = `npm run validate && node --test tests/*.test.mjs`) in this isolated `main`-based worktree: `tests 1149 / pass 1146 / fail 0 / skipped 3 / cancelled 0 / todo 0`. `npm run validate` (`tools/validate-foundation.mjs`) passed as part of this run (no separate failure).
- `node --test tests/retry-policy.test.mjs` run directly: `tests 23 / pass 23 / fail 0 / skipped 0`. Matches the first review's claimed count exactly.
- Hardcoded test-ID branching: `grep -in "test.?case|testcase|TEST_ID|caseId" src/control/retry-policy.mjs` and `tests/retry-policy.test.mjs` — no hits in either.

## 8. Comparison to the first review's disclosed scope

The first review (`APPROVE_WITH_NOTES`, `7075c27`) thoroughly and verifiably reproduced test counts, purity, fail-closed behavior, doctrine-sourcing, ledger round-trip/tamper detection, and no-wiring claims — all confirmed again here independently. Its one design-soundness discussion (§8, "governance-approval-for-every-retry") correctly flagged an amortization ambiguity (one corrective decision per attempt vs. per retry-budget-window) as an open question for the wiring stage. It did **not**, however, examine the ledger-substrate mechanics (`preWriteCheck`, `expectedSequence` CAS) that would determine whether that ceiling is actually enforceable atomically once wired — that angle only became visible this session because `CheckpointLedger`'s sibling S1 fix demonstrated what a real atomic ceiling gate (`DENY_CHECKPOINT_REGRESSION`) looks like in this codebase, and `DecisionLedger.appendDecision` visibly lacks the equivalent. This review's contribution is narrowing that specific, previously-unexamined gap.

---

## Summary of findings

| # | Item | Result |
|---|---|---|
| 1 | Full-file re-read: purity, fail-closed ordering, no hardcoded test-ID branching | CONFIRMED, independently |
| 2 | TOCTOU/check-then-act on retry ceiling | No race exists *within* this module (no I/O at all); but `DecisionLedger.appendDecision` lacks the `preWriteCheck`-based atomic ceiling gate that `CheckpointLedger` now has — a real, previously-undisclosed gap for future wiring, not a live bug |
| 3 | Interaction with just-fixed CheckpointLedger bug | NONE — retry-policy never references CheckpointLedger; independent state, unaffected past or present |
| 4 | Ceiling/ratchet integrity of the evaluator's own logic | Sound — no input can loosen the ceiling; the gap is absence of atomic enforcement once wired, not a logic defect |
| 5 | Silent-fail-open | CONFIRMED absent — every ambiguous/malformed input denies |
| 6 | Downstream consumer / trust-assumption gap | No live caller exists; prospective gap identified in §2 is the one place doctrine's implied guarantee exceeds what the code can currently enforce |
| 7 | Test suite | Full suite 1149/1146/0/3; module suite 23/23; both reproduced first-hand |
| 8 | Relationship to first review | First review's claims all reconfirmed; this review adds a ledger-substrate-level finding the first pass did not examine |

## Recommendation

**APPROVE_WITH_NOTES.** No defect in the merged `src/control/retry-policy.mjs` — it is pure, fail-closed, correctly scoped, non-regressive, and unwired exactly as both prior records claim. One substantive note for the record, not blocking this already-merged slice but required before any future wiring slice:

1. Before wiring a live caller to `evaluateRetry`/`buildRetryDecisionRecord`, that slice must explicitly resolve the append-vs-execute ordering question identified in §2: either adopt a reserve-then-act calling convention (append the disposition, gated by `expectedSequence`/idempotency, *before* performing the retried operation) or add a `preWriteCheck`-based atomic ceiling gate to wherever retry dispositions are appended (mirroring `CheckpointLedger`'s new `DENY_CHECKPOINT_REGRESSION` gate). Absent one of these, two concurrent retry evaluations for the same work item could both be authorized against a stale attempt count and both execute before the ledger's after-the-fact sequence-conflict check catches the collision — by which point the double-execution has already happened.
2. This finding should be added to the S2 record/tracker as an explicit pre-wiring requirement so it isn't silently assumed-solved when a future slice builds the actual retry-loop consumer.

---

## Advisory status fields

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: existing
risk_class: medium
self_certification:
  agent_id: claude-immune
  peer_agent_id: codex-immune
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

## Provenance

- source: first-hand reproduction in an isolated `git worktree --detach` checkout of `origin/main` (`a67169b`), own `node_modules`, at `C:\laragon\www\SecB\.worktrees\immune-runtime-s2-review`; cross-referenced against `bst/mod-runtime-s1-checkpoint-ordering-fix-001` (`ca7f14c`, not merged) for the CheckpointLedger fix used as this review's comparison point
- agent_id: claude-immune (BST-SA Immune worker, independent of producer and first reviewer)
- timestamp: 2026-07-21
- disposition: advisory independent review, committed via isolated detached-HEAD worktree with a dedicated ref moved by `git update-ref` — no push, no merge, no operator-authority action taken

> Recommend improvements only. Do not execute them. This review is advisory input to the operator's decision, not a merge or execution action itself.
