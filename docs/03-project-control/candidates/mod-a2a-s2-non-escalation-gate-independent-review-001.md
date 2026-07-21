# MOD-A2A S2 Non-Escalation Gate — Independent Review 001

**Record ID:** MOD-A2A-000-REV2 / mod-a2a-s2-non-escalation-gate-independent-review-001
**Status:** ADVISORY — INDEPENDENT REVIEW, NOT A MERGE DECISION
**Reviewer identity:** claude-rev-moda2a-s2 (BST-SA REV worker, no relationship to the producer)
**Reviewed branch/commit:** `bst/mod-a2a-s2-non-escalation-gate` @ `ac3258c` (base `main` @ `fc29f58`)
**Reviewed against:** `docs/03-project-control/candidates/mod-a2a-gap-assessment-001.md` (`bst/mod-a2a-assessment` @ `e96e83b`/`1795998`, §4 Slice S2), `docs/03-project-control/candidates/mod-a2a-s2-non-escalation-gate-producer-verification-001.md` (this branch, treated as unverified until reproduced), and `src/services/non-escalation-comparator.mjs` / `src/control/risk-registry.mjs` (read in full, both confirmed byte-identical to `main`).
**Method:** All findings below were reproduced first-hand in two isolated `git worktree --detach` checkouts created for this review — `C:\laragon\www\SecB-worktrees\claude-rev-mod-a2a-s2-independent-001` (branch @ `ac3258c`) and `C:\laragon\www\SecB-worktrees\claude-rev-mod-a2a-s2-main-baseline-001` (`main` @ `71b9d41`) — separate from the producer's own worktree (`C:\laragon\www\SecB\.claude\worktrees\mod-a2a-s2-non-escalation-gate`). A standalone Node probe script was run inside my review worktree to construct fixtures distinct from the shipped 24 tests and the 384-scenario parity matrix; it was never staged or committed and was deleted after use. No push, no merge, no operator-authority action taken.
**Date:** 2026-07-21

---

## Verdict: **APPROVE_FOR_MERGE**

Every reproducible claim in the producer's verification record reproduces exactly, with one immaterial exception (a miscounted disclosure of a grep hit-count, §3). The genuinely load-bearing claim of this slice — that `delegation-gate.mjs` delegates ALL substantive comparison logic to the existing `non-escalation-comparator.withinCeiling` and `risk-registry.riskProfile` rather than reimplementing anything — holds up rigorously under line-by-line reading, independent grep reproduction, and eight novel edge-case probes distinct from the shipped tests, including two probes ((A) glob characters in the `paths` dimension, (B) empty candidate arrays) that exercise genuine special-casing quirks in the underlying comparator's own logic that a parallel reimplementation could easily have gotten wrong. The human-approval short-circuit was independently reconstructed with a strictly-narrower (not merely equal) requested/bound pair, distinct from the shipped equality-only tests, and fired exactly as claimed. No hardcoded test-ID branching found. A parallel review is already in progress on this exact commit — flagged in §7 for the coordinator's awareness, not treated as a blocker.

---

## 1. Test counts — CONFIRMED exact, including independently-verified baseline

Ran `npm test` first-hand in two isolated detached-HEAD worktrees with independent `npm install`:

- **`main` baseline, independently reproduced at `fc29f58`** (the branch's actual cited base, not assumed from the producer's own reported count): `tests 703 / pass 698 / fail 0 / skipped 5`. Exact match to the producer's cited "before" count.
- **This branch, `ac3258c`:** `tests 727 / pass 722 / fail 0 / skipped 5` — exact match to the claimed `727/722/0/5`, exactly `+24` new tests (`grep -c "^test(" tests/delegation-gate.test.mjs` independently confirms 24 `test()` calls), skip count unchanged at 5.
- `node tools/validate-foundation.mjs`: exit 0, top-level `"status": "PASS"` on this branch — reproduced directly (not merely inferred from `npm test`'s internal `npm run validate` step).

Claim holds exactly.

## 2. Targeted diff (behavior preservation) — CONFIRMED empty

```
git diff main bst/mod-a2a-s2-non-escalation-gate -- src/services/non-escalation-comparator.mjs src/ledger/delegation-ledger.mjs src/services/handoff-service.mjs src/ledger/temporal-ledgers.mjs src/ledger/durable-ledger.mjs contracts/decision-record.schema.json
```

reproduced literally, against **current `main` tip** (`71b9d41`, which has moved past this branch's actual base `fc29f58` via two unrelated merges — PR #27 `mod-reg-human-gov-disposition-candidate-001` and PR #28 `mod-reg-gov-disposition-signed`): **zero output**. The broader `git diff main bst/mod-a2a-s2-non-escalation-gate --stat` does show two files disappearing on the branch side (`mod-reg-gov-disposition.yaml`, `mod-reg-human-gov-disposition-candidate-001.md`) — this is base-drift from `main` advancing after this branch's cut point, not something this branch deleted; `git diff fc29f58 bst/mod-a2a-s2-non-escalation-gate --name-status` (the actual base) shows only the five files the producer's doc describes: `MANIFEST.json` (M, +3 lines exactly matching the two new files plus this record), `docs/.../mod-a2a-s2-non-escalation-gate-producer-verification-001.md` (A), `docs/.../module-completion-tracker-001.md` (M, one append-only block), `src/control/delegation-gate.mjs` (A), `tests/delegation-gate.test.mjs` (A). No existing service, ledger, contract, or test file's behavior is touched anywhere in this repository. Claim holds.

## 3. Verbatim-reuse claim — CONFIRMED rigorously, one minor disclosure miscount noted

Read `src/control/delegation-gate.mjs` (214 lines) line by line. `evaluateDelegation` contains exactly two substantive calls: `withinCeiling(requestedCeiling, boundingCeiling)` (step a — any denial returned as `return ceilingResult;`, the exact object, not re-derived) and `riskProfile(requestedCeiling.riskClass)` (step b — denial returned verbatim; on success, a single one-line boolean read of `profile.value.humanApproval` decides `DENY_HUMAN_APPROVAL_REQUIRED` vs `ALLOW`). That one-line boolean check is not a parallel comparison — it consumes a value the registry itself already computed; there is no local risk-class table, no local ordering array, and no local path/tool/transition subset logic anywhere in the file. `evaluateDelegationRequest` is confirmed to be a zero-logic wrapper: it only reaches into `.ceiling` and forwards to `evaluateDelegation`; it imports nothing from `DelegationLedger` or the delegation-request schema.

Independently re-ran the producer's own described grep methodology rather than trusting the reported counts:

- **Definition-only grep** (`^(export )?(const|function|class) (RISK_ORDER|DATA_CLASS_ORDER|ordered|pathSubset|exactSubset|RISK_CLASSES)`): zero matches, exit 1. Confirmed.
- **Unfiltered token grep** (`RISK_ORDER|DATA_CLASS_ORDER|function ordered|function pathSubset|function exactSubset|RISK_CLASSES`): exactly 2 hits, lines 24 and 110 — same line numbers the producer's doc cites, both header-comment prose ("`RISK_CLASSES` table S1's ceiling shape...", "...both modules share the same frozen `RISK_ORDER`..."). Confirmed accurate as characterized: prose, not code.
- **Import/dependency grep** (`^import|new DelegationLedger|validateContract\(.delegationRequest`): exactly 2 hits, the module's own two functional imports (`withinCeiling`, `riskProfile`). Confirmed.
- **Discrepancy found:** the producer's "Design decisions" section separately claims an unfiltered grep for the bare token `DelegationLedger` "does return 6 hits, all inside header-comment prose." I reproduced this grep myself (`grep -n "DelegationLedger" src/control/delegation-gate.mjs`, cross-checked with `grep -o` for raw occurrence count) and get **5 hits** (lines 13, 22, 60, 131, 135), not 6. I read all 5 individually: all are comment prose, none is a live import, instantiation, or call — so the qualitative claim ("prose only, no code dependency") holds, but the disclosed count is off by one. This is a minor, non-blocking inaccuracy in a self-disclosure whose entire purpose was to be checked rather than trusted — worth naming for the record precisely because the task instruction warned against trusting a count without reading every hit, and reading every hit is what surfaced the discrepancy.

## 4. Novel edge-case probes — CONFIRMED gate reproduces the comparator's exact special-case behavior, not just the common case

Built 8 fixtures distinct from the shipped 24 tests and the 384-scenario parity matrix, by reading `non-escalation-comparator.mjs`'s own source for special-casing rather than guessing:

- **(A) Glob character in the `paths` dimension.** `pathSubset()` only screens for `'..'` path-traversal components — unlike `exactSubset()` (used for `tools`/`transitions`), which explicitly rejects any value containing `'*'`. A literal `"src/control/*"` candidate path is therefore **not** treated as an uncomparable glob by the comparator; it passes as an ordinary string-prefix match (`"src/control/*".startsWith("src/control/")` is true) and the delegation is allowed. This is a genuine asymmetry in `non-escalation-comparator.mjs` itself (the paths dimension does not get the same glob-prohibition the file's own header comment implies applies generally), not a defect in this slice — but it is exactly the kind of quirk an independent reimplementation could easily "fix" by accident, diverging from the real comparator. Confirmed: `withinCeiling` returns `{ok:true}` and `evaluateDelegation` returns `{ok:true, code:"ALLOW"}` — byte-identical outcome, correctly inherited rather than independently re-derived.
- **(B) Empty candidate `paths` array against an unrelated non-empty bound.** `pathSubset`'s `for` loop over an empty `candidatePaths` never executes, vacuously returning `{ok:true}` regardless of the bound. Reproduced: comparator and gate both `ALLOW`, even with `boundingCeiling.paths = ["some/totally/unrelated/path"]`.
- **(C) Empty candidate AND bound `tools` arrays** — `exactSubset`'s `.every()` over an empty array is vacuously true. Both comparator and gate `ALLOW`.
- **(D) Empty *bound* `paths` array with a non-empty candidate** (the non-vacuous direction, to confirm (B)/(C) aren't simply "always allow on empty"): correctly denies `DENY_ESCALATION` on `paths`, comparator and gate identical.
- **(E) Trailing-slash normalization on the bound path only** (`pathSubset` strips trailing `/` from bound paths, not candidate paths) — comparator and gate both `ALLOW` identically for `boundPaths=["src/control/"]` vs `candidatePaths=["src/control/sub"]`.
- **(F)** Confirmed `risk-registry.mjs`'s `RISK_ORDER`/`DATA_CLASS_ORDER` are the *same object reference* re-exported from `non-escalation-comparator.mjs` (`comparatorMod.RISK_ORDER === registryMod.RISK_ORDER` → `true`), not a re-declared copy — genuinely single-sourced, not merely equal-by-value.
- **(G)** Re-confirmed the default fixture's empty-transitions-vs-non-empty-bound case independently (same result as (B)/(C), different dimension).
- **(H)** Lowercase `riskClass: "r1"` (case-sensitivity, not in any shipped test): correctly denies `DENY_ESCALATION_UNCOMPARABLE` on `riskClass`, comparator and gate identical.

In every case the gate's output was byte-identical (`deepEqual`) to a direct call to the underlying primitive. This is the substantive confirmation the task asked for: the gate is a genuine pass-through, including for behaviors an independent, drifted reimplementation would plausibly get wrong (A, B, E in particular are non-obvious special cases, not documented anywhere except by reading the comparator's own source).

## 5. Human-approval short-circuit — CONFIRMED, with a stricter probe than the shipped tests

The shipped tests only exercise the human-approval override at **exact equality** (requested `R3` == bound `R3`; requested `R4` == bound `R4`). I constructed a strictly-narrower case, distinct from the shipped tests, to isolate the claim from the ceiling check: requested `R3` (with every other dimension strictly inside bound) against a bound of `R4` (strictly wider on every dimension). A direct call to `withinCeiling` alone returns `{ok:true}` — proving the ceiling comparison by itself would allow this delegation — while `evaluateDelegation` still returns `{ok:false, code:"DENY_HUMAN_APPROVAL_REQUIRED"}`, exactly as claimed. A companion probe (requested `R1`, not human-approval-gated, against the same wide `R4` bound) correctly `ALLOW`s, confirming the human-approval decision is keyed off the **requested** risk class, not the bound's. The precedence claim (`DENY_ESCALATION` before `DENY_HUMAN_APPROVAL_REQUIRED` when both would apply) was also reproduced from the shipped test and is consistent.

## 6. Hardcoded test-ID branching — CONFIRMED absent

`grep -niE "test|dec_delegation|===\s*['\"]|decisionId\s*===|if\s*\(.*id\s*===" src/control/delegation-gate.mjs` and a follow-up literal grep for every fixture ID used in the test file (`dec_delegation`, `wp_p0_moda2a`, `ses_moda2a`, `prj_secb_local`, `claude-motor-moda2a`) against the source file: zero hits in both. No special-casing of any test identity anywhere in `delegation-gate.mjs`.

## 7. Documentation-consistency finding (module-completion-tracker) — understood, not duplicated

The producer's own doc and the branch's tracker-file diff (`git diff fc29f58 bst/mod-a2a-s2-non-escalation-gate -- docs/03-project-control/candidates/module-completion-tracker-001.md`) confirm the file was found blank on this branch's base and only an append-only iteration-log entry was added — consistent with the producer's own flagged finding. This is already being independently diagnosed and fixed elsewhere (`bst/tracker-restoration-fix-001` @ `eef091a`, "Restore module-completion-tracker-001.md after merge-truncation bug," confirmed to exist and address exactly this). Not re-investigated here, per task scope.

## 8. Parallel review already in progress — flagged for coordinator awareness

A **locked** worktree (`C:\laragon\www\SecB\.claude\worktrees\agent-aa3ee035c95358825`, held by a live `claude` process, pid 43568) is checked out at this exact commit (`ac3258c`, detached HEAD) and already contains an uncommitted-to-branch commit `d703236`, titled `[MOD-A2A-S2-REV] Immune review: delegation non-escalation gate — APPROVE_WITH_NOTES`, dated the same session. Its message describes an independent cross-provider Immune review reaching the same substantive conclusions (verbatim reuse verified, byte-identity guard, adversarial probes, regression counts 727/722/0/5, `validate-foundation` exit 0) plus two of its own notes (gate outputs not `Object.freeze`d; the tracker blank-on-main finding). This commit is **not yet reachable from** the `bst/mod-a2a-s2-non-escalation-gate` branch ref (confirmed via `git merge-base --is-ancestor`) — it exists only in that detached worktree, not yet published via `git update-ref`. I did not read or rely on that review's content as evidence for any claim in this document; every finding above was independently reproduced from source. This is noted per the task's explicit instruction to flag, not stop for, a concurrent independent review of the same candidate — an operator/coordinator should be aware two independent reviews (this one and the Immune one) are landing on this same commit and may want to reconcile which becomes canonical or whether both are retained.

---

## Summary of findings

| # | Item | Result |
|---|---|---|
| 1 | Test counts (727/722/0/5, +24 over independently-reproduced 703/698/0/5) | CONFIRMED exact |
| 2 | Targeted diff empty against actual base `fc29f58` | CONFIRMED (current-`main`-tip diff shows unrelated base drift, not a producer issue) |
| 3 | Verbatim-reuse claim (no reimplementation, only two substantive calls) | CONFIRMED rigorously; one immaterial grep-count discrepancy noted (claimed 6 `DelegationLedger` prose hits, actual 5, all still prose) |
| 4 | Novel edge-case probes reproduce comparator's special-case behavior (glob-in-paths asymmetry, vacuous-empty-array truth, trailing-slash normalization, case sensitivity) | CONFIRMED — gate is byte-identical to direct primitive calls in every probe |
| 5 | Human-approval short-circuit, tested with a strictly-narrower (not equality-only) case | CONFIRMED fires exactly as claimed, keyed on requested class |
| 6 | No hardcoded test-ID branching | CONFIRMED absent |
| 7 | Tracker blank-on-main finding | Understood, already being fixed elsewhere (`bst/tracker-restoration-fix-001` @ `eef091a`), not duplicated |
| 8 | Parallel review in progress on this exact commit | Flagged for coordinator (Immune review, commit `d703236`, not yet on branch ref) |

## Advisory status fields

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: existing
risk_class: low
self_certification:
  agent_id: claude-rev-moda2a-s2
  peer_agent_id: claude-motor-moda2a-s2
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

## Provenance

- source: first-hand reproduction in two isolated `git worktree --detach` checkouts (`bst/mod-a2a-s2-non-escalation-gate` @ `ac3258c` and `main` @ `71b9d41`), separate from the producer's own worktree and from the concurrently-active Immune-review worktree; independent Node probe script run inside the review worktree, never staged or committed, deleted after use.
- agent_id: claude-rev-moda2a-s2 (BST-SA REV worker, Claude Sonnet 5)
- timestamp: 2026-07-21
- disposition: advisory review only; no execution/approval/merge authority exercised; no push; no merge; recorded on this candidate branch for operator/GOV ratification per AMD-002 rev 2.

> Recommend APPROVE_FOR_MERGE. A parallel Immune review (commit `d703236`, not yet on the branch ref) reaches a compatible verdict (`APPROVE_WITH_NOTES`) independently — flagged in §8 for the coordinator to reconcile, not treated as a blocker or duplicated here. This review recommends; it does not authorize merge.
