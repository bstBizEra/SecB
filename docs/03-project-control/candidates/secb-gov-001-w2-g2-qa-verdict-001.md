# SECB-GOV-001 Independent QA Verdict at Accepted Baseline (G2, Wave 2b)

| Field | Value |
|---|---|
| Artifact | `secb-gov-001-w2-g2-qa-verdict-001` |
| Executor (this record) | `claude-qa-w2-g2-01` (BST-SA, QA lane — **independent QA verdict**, advisory) |
| Peer producer (SoD counterpart) | `claude-motor-w1a-baseline-01` (W1a/G5 bound evidence producer — a **distinct** executor from this lane) |
| Dispatch | Wave 2b of `secb-gov-001-readiness-closure-plan-001.md` (§3 decision point B, W2b) |
| Gap addressed | **G2** — "Completed independent QA verdict with reproducible acceptance output, on the same exact SHA" (first readiness review §7 item 2; closure plan §2 G2 card) |
| Evidence bound to commit | `c2ec6458b60ded0a93d74e717cd7816f55834f01` (operator-accepted G4 promotion baseline, PR #115) |
| Evidence bound to tree | `3b7300f1b7cd378d373cf8e2da10dc459bb8f63b` |
| Record authored on branch off | `main` @ `5223db928128f9ed967279b15ce81b39e316c535` (PR #115 merge; current main tip) |
| Timestamp (UTC) | 2026-07-22 |
| **Verdict** | **`QA_PASS_WITH_NOTES`** (see §7) |
| Scope | First-hand independent QA re-derivation of the acceptance checks at the accepted baseline, plus QA-grade guard/skip/accounting exercises. NOT a promotion, NOT an acceptance, NOT a P0-20 seal, NOT an activation. |
| Authority | Advisory only. |

> **Two-tree discipline (read before using any number below).** This record was
> **authored** on a branch cut from `main` @ `5223db928128f9ed967279b15ce81b39e316c535`.
> Every acceptance number in it was **produced** on a *separate*, detached
> checkout of commit `c2ec6458b60ded0a93d74e717cd7816f55834f01`
> (tree `3b7300f1b7cd378d373cf8e2da10dc459bb8f63b`) in an isolated worktree, and
> is valid **only** for that exact commit and tree. The authoring tree
> (`5223db9`) and the evidence tree (`c2ec645`) are deliberately different: the
> accepted baseline is `c2ec645`, and `5223db9` is the current main that carries
> this closure workstream's records. If the SHA you are evaluating differs from
> `c2ec645` in even one character — including any later main tip or any branch
> that merely contains `c2ec645` as an ancestor — this evidence is **void for
> your purpose** and must be re-derived at your SHA.

---

## 1. Identity and Separation of Duties (SoD) attestation

- **This lane:** `claude-qa-w2-g2-01` — the G2 QA lane. A **distinct executor**
  from the W1a/G5 producer (`claude-motor-w1a-baseline-01`) whose bound-evidence
  record this lane independently re-derives, and distinct from the G1 REV and
  G3 SEC lanes running in parallel. This lane did **not** coordinate with those
  lanes; the run below is first-hand and independent.
- **Why G2 exists:** the readiness reviews found that *no* independent QA verdict
  bound to an on-main SHA existed — only producer self-reports and a dispatch
  record with no returned verdict (first review §§ on the independent-review
  question; closure plan §2 G2 card). The W1a bound-evidence record itself
  discloses (its §5) that it is "ONE executor's first-hand evidence … it does
  **not** satisfy the independence requirement by itself" and explicitly calls
  for the G1/G2/G3 Wave-2 lanes to re-derive at the same SHA with distinct
  executors. **This record is that independent G2 re-derivation.**
- **What SoD requires here (plan §3 decision point B):** producer ≠ REV ≠ QA.
  This lane honours it: independent re-run, independent parsing of totals,
  independent guard/skip verification, and an independent verdict.

## 2. Evidence-tree checkout binding (commands + outputs)

Run at a detached worktree of the accepted baseline (isolated from the authoring tree):

```
$ git worktree add --detach <tmp> c2ec6458b60ded0a93d74e717cd7816f55834f01
HEAD is now at c2ec645 Merge pull request #114 from bstBizEra/bst/readiness-closure-plan

$ git rev-parse HEAD HEAD^{tree}
c2ec6458b60ded0a93d74e717cd7816f55834f01
3b7300f1b7cd378d373cf8e2da10dc459bb8f63b

$ git status --short
(clean — no local modifications before the run; re-verified clean after the tamper-check in §5)
```

## 3. Environment

| Item | Value |
|---|---|
| OS | Microsoft Windows 11 Pro, `[Version 10.0.26200]` |
| Shell | Git Bash (MINGW64) |
| `node --version` | `v24.12.0` |
| `npm --version` | `11.6.2` |
| Dependency install | `npm ci` — exit 0 (`added 6 packages`, clean install from lockfile before any test run) |
| Validator version | `0.3.0-alpha.0` (self-reported in `validate-foundation` JSON) |

Environment matches the W1a producer record (node `v24.12.0`, npm `11.6.2`,
validator `0.3.0-alpha.0`) — reproduction was performed under the same toolchain.

## 4. Acceptance re-derivation (independent)

### 4.1 Full test suite — `npm test` run TWICE (flake check)

`npm test` at this tree is `npm run validate && node --test tests/*.test.mjs`
(package.json), so each run chains the foundation validator before the suite.

| Metric | Run 1 | Run 2 | W1a bound-evidence record |
|---|---|---|---|
| tests | 1325 | 1325 | 1325 |
| pass | 1322 | 1322 | 1322 |
| fail | **0** | **0** | 0 |
| cancelled | 0 | 0 | 0 |
| skipped | 3 | 3 | 3 |
| todo | 0 | 0 | 0 |
| exit code | **0** | **0** | 0 |
| duration_ms | 5822.79 | 5276.14 | 6295.68 (producer) |

- **No flake observed:** both runs identical — 1325 / 1322 pass / 0 fail / 3 skip,
  exit 0. Totals match the bound-evidence record **exactly**.
- Note: both QA runs used the **same** `npm test` command (which re-runs the
  validator each time). The producer's stability re-run used a different command
  (`node --test --test-reporter=tap`, validator not re-chained). This QA re-run
  is the stricter of the two for flake purposes (identical harness, twice).

### 4.2 Foundation validator — standalone (`node tools/validate-foundation.mjs`)

```
status: PASS         | version: 0.3.0-alpha.0
total checks: 859    | non-PASS: 0
exit code: 0
schemas.count check: PASS — "7 canonical bootstrap schemas + 13 governed extensions"
```

- **Bound validator facts: exit 0, status PASS, 859/859 checks PASS,
  schemas.count = 20 (7 canonical + 13 governed).** Matches the bound-evidence
  record exactly.
- Cross-check: `ls contracts/*.schema.json | wc -l` → **20** files — consistent
  with the validator's schema count.

## 5. QA-grade exercises (beyond the plain run)

### (a) Standalone execution of 3 governance-critical suites (`--test` per file)

Confirms the governance-critical conformance suites run and pass in isolation
(not only inside the full-glob run):

| Suite | tests | pass | fail | skip | exit |
|---|---|---|---|---|---|
| `conformance-v020-governance.test.mjs` | 8 | 7 | 0 | 1 | 0 |
| `conformance-stubs.test.mjs` | 15 | 13 | 0 | 2 | 0 |
| `conformance-p0-18-candidate.test.mjs` | 5 | 5 | 0 | 0 | 0 |

All three green standalone. The 3 suite-wide skips are fully accounted for here:
1 (V-020 positive) in `v020-governance` + 2 (V-011 storage, V-016 drift) in
`conformance-stubs` = **3**, exactly the suite total.

### (b) Skip-honesty verification (read the 3 skip bodies)

All 3 skips are **honest** — each is counted as *skipped* (never as a silent
pass), and each `skip:` reason names a real blocker:

| Skip | File:line | Blocker named | Body style |
|---|---|---|---|
| V-011 redaction (storage plane) | `conformance-stubs.test.mjs:318` | "P0-08 security policy surface — storage-plane redaction only; display plane covered below" | empty body (positive/negative intent in comments); display-plane half is covered **live** at line 326 |
| V-016 recovery (drift comparator) | `conformance-stubs.test.mjs:548` | "checkpoint-ledger non-goal #3 … no primitive on main @ 4abfff2 performs this comparison"; resume-point half covered live in the P0-18 suite | empty body (comments) |
| V-020 positive (activation-gated) | `conformance-v020-governance.test.mjs:331` | "Requires a real human GOV decision + operator activation … covering it here would self-authorize activation — a hard block" | **`assert.fail("unreachable: activation-gated positive half is out of scope")`** — strong blocked-positive pattern: if the skip flag were removed it FAILS, refusing to fabricate a human approval |

- **None is a silent pass.** V-020 uses the strongest form (an `assert.fail`
  that would trip if unblocked without a real decision — the exact honesty net
  asked for).
- **Low-severity note (N1):** the two `conformance-stubs` skips have *empty*
  bodies rather than an `assert.fail` guard. Under `node:test`, `{ skip }` means
  the body never executes, so they are correctly reported as skipped today; but
  if a future edit removed the `skip:` flag **without** adding assertions, they
  would become vacuous passes. Both are backstopped in practice (each has a live
  sibling covering the unblocked half), so this is a latent-robustness note, not
  a current defect. Recommend converting them to the V-020 `assert.fail` pattern
  when their blockers clear.

### (c) Tamper-check of ONE byte-identity guard (guard-net liveness proof)

The candidate ships a byte-identity guard
(`conformance-v020-governance.test.mjs` §"Byte-identity guard (main @ ec5aa76)")
that pins 11 composed primitives to their `git blob` SHA-1. To prove the guard
net is **live** at the baseline (not vacuous), this lane tampered one guarded
file, confirmed the guard FAILED, then restored and confirmed green:

| Step | Guarded file | `git hash-object` blob | Guard suite result |
|---|---|---|---|
| Baseline | `src/control/sod-rules.mjs` | `4ffbc2019aae88178ecf0e5e6d2aa6b1e4aa9530` (= pinned) | — |
| **Tamper** (append 1 byte `0x20` space) | `src/control/sod-rules.mjs` | `db74ebc4ebdf70352e8163bb51b444ebfa04b9f1` | **FAIL** — 8 tests / 6 pass / **1 fail**, exit **1**; assertion: `src/control/sod-rules.mjs blob-identical to main @ ec5aa76` |
| **Restore** (`git checkout -- …`) | `src/control/sod-rules.mjs` | `4ffbc2019aae88178ecf0e5e6d2aa6b1e4aa9530` (= pinned) | **GREEN** — 8 tests / 7 pass / 0 fail / 1 skip, exit 0; `git status` clean |

- **Proven:** the guard actually verifies primitive byte-identity — a single
  injected byte flips the pinned blob and the guard trips with the exact naming
  assertion; restoring the file returns the suite to green with a clean tree.
  The guard net is **live** at `c2ec645`. The evidence tree was left clean.

### (d) Test-count accounting

- **Test files:** `ls tests/*.test.mjs | wc -l` → **65** — matches the
  bound-evidence record.
- **Suite total:** 1325 tests / 1322 pass / 0 fail / 3 skip — matches the
  bound-evidence record and both QA runs.
- **Skip lines caveat (honest):** a raw `grep "skip:" tests/*.test.mjs` returns
  **4** hits, but one (`conformance-v020-governance.test.mjs:34`) is inside a
  doc comment (`* ({ skip: true }) that names activation…`), not a runtime skip
  directive. The **3** runtime skips reconcile exactly with the suite total and
  the standalone per-suite counts in (a).

## 6. QA of the evidence chain itself (`secb-gov-001-bound-evidence-001.md`)

Does the bound-evidence record contain what a QA lane needs to reproduce?
**Yes — it is reproducible.** It carries (a) the checkout binding commands +
SHA/tree, (b) a full environment table (OS/shell/node/npm/validator version),
(c) the `npm test` command + parsed totals, and (d) the standalone validator
command + totals. This QA lane reproduced every headline number from it without
needing any information outside the record. Gaps found, by severity:

- **Low (E1):** §3 of the bound-evidence record omits a **per-file test-count
  breakdown** ("not cheaply available … honestly recorded as omitted"). A QA
  lane wanting per-suite accounting must derive it independently. This lane did
  so for the 3 governance-critical suites (§5a) and confirmed the aggregate;
  full 65-file per-file accounting remains out of scope here too. Disclosed by
  the producer, not a hidden gap.
- **Info (E2):** the producer's stability re-run used a **different command**
  than its primary run (`node --test --test-reporter=tap`, which does not
  re-chain the validator). This QA lane closes that by running the identical
  `npm test` (validator-chained) twice (§4.1) — a stricter flake check.
- **Info (E3):** the bound-evidence record performs **no guard tamper-check** —
  it runs the suite green but does not prove the byte-identity guard would fail
  on drift. This lane adds that liveness proof (§5c). Not a defect in the
  producer record (out of its G5 scope); recorded as added QA assurance.

The evidence chain is **sufficient for QA reproduction** at the bound SHA; the
one genuine gap (E1) is low-severity and producer-disclosed.

## 7. QA VERDICT — bound to `c2ec6458b60ded0a93d74e717cd7816f55834f01`

**`QA_PASS_WITH_NOTES`.**

- **PASS basis:** every acceptance check reproduced **exactly** at the accepted
  baseline, independently and first-hand — full suite 1325/1322 pass/0 fail/3
  skip exit 0 (twice, no flake); foundation validator PASS 859/859 exit 0,
  schemas.count 20. The 3 governance-critical suites pass standalone; the 3
  skips are honest (none a silent pass); the byte-identity guard net is proven
  live (fails on a 1-byte tamper, green on restore); test-count accounting
  (65 files, 1325 total) reconciles with the bound-evidence record.
- **Why WITH_NOTES rather than a bare PASS:** three low/info findings recorded
  below — none blocks acceptance; all are advisory quality notes surfaced
  honestly for the operator.

### Findings by severity

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| N1 | Low | 2 of 3 skips (`conformance-stubs` V-011 storage, V-016 drift) have empty bodies; if their `skip:` flag were removed without adding assertions they'd become vacuous passes. Both have live siblings covering the unblocked half. | Advisory — convert to the V-020 `assert.fail` pattern when blockers clear. Not a current defect. |
| E1 | Low | Bound-evidence record omits a per-file test-count breakdown (producer-disclosed as "not cheaply available"). | Advisory — aggregate reproduced; per-suite spot-check done for 3 governance suites. |
| E2 | Info | Producer stability re-run used a different (non-validator-chained) command than its primary run. | Closed by this lane's identical-command double run. |
| E3 | Info | Bound-evidence record does not tamper-check the byte-identity guard. | Closed by this lane's guard-liveness proof (§5c). |

**No BLOCKER / HIGH / MEDIUM findings.** No failing tests, no drift, no
integrity failure, no accounting mismatch.

## 8. What this record does NOT do

- Does **not** close G2 on its own authority — it supplies the independent QA
  verdict artifact the gap requires; weight-bearing use follows the operator's
  evidence-acceptance act (plan G6, Wave 3).
- Does **not** claim readiness, does **not** touch the P0-20 packet, the
  operator HOLD (PR #78), or the sealed human-GOV slot (`verdict: null`).
- Changes **zero** files under `src/`, `contracts/`, `tools/`, or `tests/`. The
  §5c tamper was performed and reverted in an isolated detached evidence tree;
  that tree was left clean (`git status` empty).
- Does **not** push and does **not** merge.

## 9. Advisory status fields

```yaml
truth_status: verified_true        # every number produced first-hand by the recorded commands at the bound SHA; all match the bound-evidence record
authority_status: advisory_only    # QA verdict; acceptance/weight-bearing use is operator-gated via G6
implementation_status: candidate   # independent G2 verdict staged for operator review; feeds the G6 acceptance record
risk_class: low                    # per the plan's G2 card — reproducible binary checks; docs + test execution only
```

## 10. Self-certification

```yaml
self_certification:
  agent_id: claude-qa-w2-g2-01
  peer_agent_id: claude-motor-w1a-baseline-01
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Certified: this independent QA verdict is complete as an advisory work
> product. Every command and output was executed and observed first-hand at
> commit `c2ec6458b60ded0a93d74e717cd7816f55834f01` (tree
> `3b7300f1b7cd378d373cf8e2da10dc459bb8f63b`) in a clean, detached, isolated
> worktree distinct from the authoring tree (`main` @ `5223db9`), by an executor
> distinct from the W1a producer (SoD: producer ≠ QA). It carries no execution
> or approval authority; closing G2, accepting the evidence, and the promotion
> decision itself remain with the operator/GOV.
