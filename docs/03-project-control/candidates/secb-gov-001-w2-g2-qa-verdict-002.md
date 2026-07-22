# SECB-GOV-001 Independent QA Verdict at Accepted RE-CUT Baseline (G2-002, Wave 2b)

| Field | Value |
|---|---|
| Artifact | `secb-gov-001-w2-g2-qa-verdict-002` |
| Executor (this record) | `claude-qa-w2-g2-02` (BST-SA, QA re-derivation lane — **independent QA verdict**, advisory) |
| Peer producer (SoD counterpart) | `claude-motor-a2-recut-01` (author of `secb-gov-001-bound-evidence-002.md`, the G5 re-cut bound-evidence — a **distinct** executor from this lane) |
| Supersedes (by reference) | `secb-gov-001-w2-g2-qa-verdict-001.md` (bound to `c2ec645…`) — extend-only; the -001 verdict is NOT edited or deleted. It self-voids at any SHA ≠ `c2ec645`; this record re-derives G2 at the accepted re-cut baseline. |
| Dispatch | Wave 2b re-derivation at the operator-accepted RE-CUT baseline (PR #131 accepted `3c439f7`); prior G2 verdict void at this SHA per its own binding clause. |
| Gap addressed | **G2** — "Completed independent QA verdict with reproducible acceptance output, on the same exact SHA" (first readiness review §7 item 2; closure plan §2 G2 card) — re-derived at the accepted baseline. |
| Evidence bound to commit | `3c439f787e9ff15ffe195d5675feb8a1d5621fbe` (operator-accepted G4 re-cut baseline, PR #131) |
| Evidence bound to tree | `39d006117c853ff0625f80a5d5d431c6b49bf1b8` |
| Record authored on branch off | `main` @ `6a6e9de55a83d6ba91b44c62726d159dec8b4fe4` (current main tip at authoring time) |
| Timestamp (UTC) | 2026-07-22 |
| **Verdict** | **`QA_PASS_WITH_NOTES`** (see §7) |
| Scope | First-hand independent QA re-derivation of the acceptance checks at the accepted re-cut baseline, plus QA-grade guard/skip/accounting exercises. NOT a promotion, NOT an acceptance, NOT a P0-20 seal, NOT an activation. |
| Authority | Advisory only. |

> **Binding + self-void clause (read before using any number below).** Every
> acceptance number in this record was **produced** on a *separate*, detached
> checkout of commit `3c439f787e9ff15ffe195d5675feb8a1d5621fbe`
> (tree `39d006117c853ff0625f80a5d5d431c6b49bf1b8`) in an isolated worktree, and
> is valid **only** for that exact commit and tree. This record was **authored**
> on a branch cut from `main` @ `6a6e9de55a83d6ba91b44c62726d159dec8b4fe4`; the
> authoring tree and the evidence tree are deliberately different. **If the SHA
> you are evaluating differs from `3c439f7` in even one character — including any
> later main tip, any re-cut successor baseline, or any branch that merely
> contains `3c439f7` as an ancestor — this verdict is VOID for your purpose and
> must be re-derived at your SHA.** The prior G2 verdict (`-001`, bound to
> `c2ec645`) is likewise void at this SHA; this record supersedes it by reference.

---

## 1. Identity and Separation of Duties (SoD) attestation

- **This lane:** `claude-qa-w2-g2-02` — the G2 QA re-derivation lane, in an
  isolated worktree. A **distinct executor** from:
  - the re-cut bound-evidence producer `claude-motor-a2-recut-01`
    (`secb-gov-001-bound-evidence-002.md`), whose numbers this lane independently
    re-derives;
  - the original G2 QA lane `claude-qa-w2-g2-01` (verdict `-001` @ `c2ec645`);
  - the parallel G1 REV and G3 SEC re-run lanes.
  This lane did **not** coordinate with any of them; the run below is first-hand
  and independent.
- **Why this re-derivation exists:** the operator accepted a RE-CUT baseline
  (`3c439f7`, PR #131) after the original W2 verdicts were bound to `c2ec645`.
  Each of those verdicts self-voids at any other SHA. bound-evidence-002 is
  explicitly **one executor's** evidence (its §7 honesty note: "does **not**
  satisfy the independence requirement by itself") and calls for independent
  re-derivation at the new SHA. **This record is that independent G2
  re-derivation, bound to `3c439f7`.**
- **What SoD requires here:** producer ≠ REV ≠ QA. This lane honours it:
  independent detached checkout, independent `npm ci`, independent parsing of
  totals, an independent guard tamper-check **on a different guarded file** than
  the producer used, and an independent verdict.

## 2. Evidence-tree checkout binding (commands + outputs)

Run at a detached worktree of the accepted re-cut baseline (isolated from the authoring tree):

```
$ git worktree add --detach <tmp> 3c439f787e9ff15ffe195d5675feb8a1d5621fbe
Preparing worktree (detached HEAD 3c439f7)
HEAD is now at 3c439f7 Merge pull request #129 from bstBizEra/bst/schema-align-project-contract

$ git rev-parse HEAD HEAD^{tree}
3c439f787e9ff15ffe195d5675feb8a1d5621fbe
39d006117c853ff0625f80a5d5d431c6b49bf1b8

$ git status --short
(clean — no local modifications before the run; re-verified clean after the §5c tamper-check)
```

The tip is the merge commit of PR #129 (`bst/schema-align-project-contract`),
matching bound-evidence-002's binding (commit + tree byte-identical). Evaluated
as the exact commit, not an ancestor claim.

## 3. Environment

| Item | Value |
|---|---|
| OS | Microsoft Windows 11 Pro, `[Version 10.0.26200]` |
| Shell | Git Bash (MINGW64, x86_64) |
| `node --version` | `v24.12.0` |
| `npm --version` | `11.6.2` |
| Dependency install | `npm ci` — exit 0 (`added 6 packages in 1s`, clean install from lockfile before any test run) |
| Validator version | `0.3.0-alpha.0` (self-reported in `validate-foundation` JSON) |

Environment matches the bound-evidence-002 producer record (node `v24.12.0`,
npm `11.6.2`, validator `0.3.0-alpha.0`) — reproduction under the same toolchain.

## 4. Acceptance re-derivation (independent)

### 4.1 Full test suite — `npm test` run TWICE (flake check)

`npm test` at this tree is `npm run validate && node --test tests/*.test.mjs`
(package.json), so each run chains the foundation validator before the suite.

| Metric | Run 1 | Run 2 | bound-evidence-002 |
|---|---|---|---|
| tests | 1331 | 1331 | 1331 |
| pass | 1328 | 1328 | 1328 |
| fail | **0** | **0** | 0 |
| cancelled | 0 | 0 | 0 |
| skipped | 3 | 3 | 3 |
| todo | 0 | 0 | 0 |
| exit code | **0** | **0** | 0 |
| duration_ms | 6001.7917 | 6776.7225 | 6396.6674 (producer run 1) |

- **No flake observed:** both runs identical — 1331 / 1328 pass / 0 fail / 3 skip /
  0 cancelled / 0 todo, exit 0. Totals match bound-evidence-002 **exactly**.
- Both QA runs used the identical `npm test` command (validator re-chained each
  time) — the stricter flake harness (identical harness, twice).
- **Growth vs the `-001` baseline (`c2ec645`, 1325/1322/0/3):** +6 tests / +6
  pass, entirely the new `tests/project-contract-schema-alignment.test.mjs` suite
  from #129 (independently confirmed 6/6 standalone in §5a). Skips unchanged at 3.

### 4.2 Foundation validator — standalone (`node tools/validate-foundation.mjs`)

```
status: PASS         | version: 0.3.0-alpha.0
total checks: 898    | non-PASS: 0
exit code: 0
schemas.count check: PASS — "7 canonical bootstrap schemas + 13 governed extensions
  (P0-14, skill resolver, capability record, skill candidate, MOD-WORK goal,
   MOD-A2A delegation request, MOD-RUNTIME checkpoint, MOD-WSPACE workspace-lease,
   MOD-MEM memory-record, MOD-SKILL S2 skill-promotion, MOD-INTEG integration-queue-entry)"
```

- **Bound validator facts: exit 0, status PASS, 898/898 checks PASS,
  schemas.count = 20 (7 canonical + 13 governed).** Matches bound-evidence-002
  exactly (898 checks; check total grew 859 @ `c2ec645` → 898 @ `3c439f7`).
- Cross-check: `ls contracts/*.schema.json | wc -l` → **20** files — consistent
  with the validator's schema count (the #129 merge grew
  `contracts/project-contract.schema.json` without adding a schema file).

## 5. QA-grade exercises (beyond the plain run)

### (a) Standalone execution of 3 governance-critical suites (`--test` per file)

Confirms the governance-critical conformance suites run and pass in isolation
(not only inside the full-glob run). Includes the **NEW** #129 suite:

| Suite | tests | pass | fail | skip | exit |
|---|---|---|---|---|---|
| `project-contract-schema-alignment.test.mjs` (NEW, #129) | 6 | 6 | 0 | 0 | 0 |
| `conformance-v020-governance.test.mjs` | 8 | 7 | 0 | 1 | 0 |
| `conformance-stubs.test.mjs` | 15 | 13 | 0 | 2 | 0 |

- All three green standalone. The new suite accounts for the full +6 growth
  vs `c2ec645`; its 6 cases assert the project-contract schema alignment
  (narrow-window SUPERSET still validates; rich v2-r2 / v2-r3 instances validate
  as a strict superset; `additionalProperties:false` strictness held — undeclared
  field and type violations REJECTED; DISJOINT `oneOf` rejects a mixed-shape doc).
- The 3 suite-wide skips are fully accounted here: 1 (V-020 positive) in
  `v020-governance` + 2 (V-011 storage, V-016 drift) in `conformance-stubs` = **3**,
  exactly the suite total.

### (b) Skip-honesty re-verification (read the 3 skip bodies)

All 3 skips are **honest** — each is counted as *skipped* (never a silent pass),
and each `skip:` reason names a real blocker. Bodies read first-hand at `3c439f7`:

| Skip | File:line | Blocker named | Body style |
|---|---|---|---|
| V-020 positive (activation-gated) | `conformance-v020-governance.test.mjs:331` | "Requires a real human GOV decision + operator activation … covering it here would self-authorize activation — a hard block" | **`assert.fail("unreachable: activation-gated positive half is out of scope")`** — strongest blocked-positive net: removing the skip flag makes it FAIL, refusing to fabricate a human approval |
| V-011 redaction (storage plane) | `conformance-stubs.test.mjs:318` | "P0-08 security policy surface — storage-plane redaction only; display plane covered below" | empty body (comments); display-plane half covered **live** at line 326 |
| V-016 recovery (drift comparator) | `conformance-stubs.test.mjs:548` | "checkpoint-ledger non-goal #3 … no primitive on main @ 4abfff2 performs this comparison"; resume-point half covered live | empty body (comments) |

- **None is a silent pass.** V-020 uses the strongest form (an `assert.fail`
  that would trip if unblocked without a real decision).
- **Skip-line reconciliation:** a raw `grep "skip:" tests/*.test.mjs` returns
  **4** hits, but one (`conformance-v020-governance.test.mjs:34`) is inside a
  doc comment (`* ({ skip: true }) that names activation…`), not a runtime
  directive. The **3** runtime skips reconcile exactly with the suite total and
  the per-suite counts in (a).
- **Low-severity note (N1, carried from `-001`):** the two `conformance-stubs`
  skips have *empty* bodies rather than an `assert.fail` guard. Under `node:test`
  a skipped body never executes, so they are correctly reported as skipped today;
  but if a future edit removed the `skip:` flag **without** adding assertions,
  they would become vacuous passes. Both are backstopped by a live sibling
  covering the unblocked half (V-011 display plane @ line 326; V-016 resume-point
  half). Latent-robustness note, not a current defect — recommend converting to
  the V-020 `assert.fail` pattern when their blockers clear.

### (c) Tamper-check of ONE byte-identity guard — DIFFERENT file than evidence-002

The candidate ships a byte-identity guard
(`conformance-v020-governance.test.mjs` §"Byte-identity guard") pinning 11
composed primitives to their `git blob` SHA-1 (`PINNED_BLOBS`, lines 360–371).
To prove the guard net is **live** at the re-cut baseline without duplicating the
producer's probe, this lane tampered
**`src/control/risk-registry.mjs`** — a guarded file **distinct** from the one
bound-evidence-002 §6 used (`src/control/authority-engine.mjs`) and from the one
verdict `-001` §5c used (`src/control/sod-rules.mjs`):

| Step | Guarded file | `git hash-object` blob | Guard result |
|---|---|---|---|
| Baseline | `src/control/risk-registry.mjs` | `b8ee7f9b979fdb3c5d5261ad0e116ecd7c6a1816` (= pinned line 368) | GREEN — 1 test / 1 pass / 0 fail, exit 0 |
| **Tamper** (append `\n// TAMPER-PROBE-G2-02\n`) | `src/control/risk-registry.mjs` | `d7e8db46586e22c8152b0f89e8f7005e5a197fa0` | **FAIL** — 1 test / 0 pass / **1 fail**, exit **1**; assertion: `src/control/risk-registry.mjs blob-identical to main @ ec5aa76` |
| **Restore** (`git checkout -- …`) | `src/control/risk-registry.mjs` | `b8ee7f9b979fdb3c5d5261ad0e116ecd7c6a1816` (= pinned) | **GREEN** — 1 test / 1 pass / 0 fail, exit 0; `git status` clean, `git diff --stat` empty |

- **Proven:** the guard actually verifies primitive byte-identity — a single
  injected byte flips the pinned blob and the guard trips with the exact naming
  assertion; restoring the file returns it to green with a clean tree. The guard
  net is **live** at `3c439f7`, demonstrated on a **third, independent guarded
  file** (widening coverage beyond the producer and the `-001` lane). The
  evidence tree was left clean (`git diff --stat` empty after restore).

### (d) Test-count accounting

- **Test files:** `ls tests/*.test.mjs | wc -l` → **66** — matches
  bound-evidence-002 (was 65 @ `c2ec645`; #129 added
  `project-contract-schema-alignment.test.mjs`).
- **Suite total:** 1331 tests / 1328 pass / 0 fail / 3 skip — matches
  bound-evidence-002 and both QA runs.
- **Skip lines caveat (honest):** raw `grep "skip:"` = 4, one a doc comment →
  **3** runtime skips, reconciling with the suite total and the standalone
  per-suite counts in (a).

## 6. QA of the evidence record itself (`secb-gov-001-bound-evidence-002.md`)

Does bound-evidence-002 carry what a QA lane needs to reproduce, with complete
commands / environment / SHA-binding? **Yes — it is reproducible and correctly
bound.** It carries (a) the checkout binding commands + SHA/tree +
`git status --short`, (b) a full environment table (OS/shell/node/npm/validator
version + `npm ci` exit), (c) the `npm test` command + parsed totals for **two**
runs, (d) the standalone validator command + totals, (e) a `npm audit` production
check, and (f) a guard tamper→fail→restore cycle. Its binding statement and
self-void clause are complete and strong. This QA lane reproduced every headline
number from it first-hand without needing information outside the record. Gaps
found, by severity:

- **Low (E1, carried from `-001`):** §3 omits a **per-file test-count
  breakdown** ("not cheaply available … honestly recorded as omitted"). A QA lane
  wanting per-suite accounting must derive it independently. This lane did so for
  the 3 governance-critical suites (§5a) and confirmed the aggregate; full
  66-file per-file accounting remains out of scope here too. Producer-disclosed,
  not a hidden gap.
- **Info (E2):** §3 records `duration_ms` for **run 1 only** (6396.67); run 2's
  duration is omitted. Totals for both runs are given, so flake reproduction is
  unaffected. This lane records both durations (§4.1).
- **Info (E3):** §2 lists the shell as "Git Bash / MINGW64 + PowerShell 5.1"
  without pinning which shell ran which command. All checks here reproduced
  identically under Git Bash alone, so the ambiguity is cosmetic.
- **Info (E4):** §6 tamper covers **one** guarded file (`authority-engine.mjs`)
  of the 11 pinned. This lane widens guard-net assurance to a second distinct
  file (`risk-registry.mjs`, §5c); the `-001` lane covered a third
  (`sod-rules.mjs`). Across the three records, 3 of 11 pinned primitives now have
  a first-hand tamper proof. Not a defect — out of the producer's G5 scope.
- **By design, not a gap:** §7 of bound-evidence-002 self-discloses that it is
  **one executor's** evidence and does not satisfy independence by itself. That
  is exactly the requirement **this** G2 lane closes; recorded for completeness.

The evidence record is **sufficient for QA reproduction** at the bound SHA; the
only genuine gap (E1) is low-severity and producer-disclosed.

## 7. QA VERDICT — bound to `3c439f787e9ff15ffe195d5675feb8a1d5621fbe`

**`QA_PASS_WITH_NOTES`.** (Void at any SHA ≠ `3c439f7` per the binding clause above.)

- **PASS basis:** every acceptance check reproduced **exactly** at the accepted
  re-cut baseline, independently and first-hand — full suite 1331/1328 pass/0
  fail/3 skip exit 0 (twice, no flake); foundation validator PASS 898/898 exit 0,
  schemas.count 20; contracts/*.schema.json = 20; 66 test files. The 3
  governance-critical suites (incl. the new #129 schema-alignment suite, 6/6)
  pass standalone; the 3 skips are honest (none a silent pass); the byte-identity
  guard net is proven live on a third distinct guarded file (fails on a 1-byte
  tamper with the exact blob-mismatch assertion, green on restore, tree clean);
  test-count accounting reconciles with bound-evidence-002.
- **Why WITH_NOTES rather than a bare PASS:** low/info findings recorded below —
  none blocks acceptance; all are advisory quality notes surfaced honestly for
  the operator.

### Findings by severity

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| N1 | Low | 2 of 3 skips (`conformance-stubs` V-011 storage, V-016 drift) have empty bodies; if their `skip:` flag were removed without adding assertions they'd become vacuous passes. Both have live siblings covering the unblocked half. | Advisory — convert to the V-020 `assert.fail` pattern when blockers clear. Not a current defect. Carried from `-001`. |
| E1 | Low | bound-evidence-002 omits a per-file test-count breakdown (producer-disclosed as "not cheaply available"). | Advisory — aggregate reproduced; per-suite spot-check done for 3 governance suites. |
| E2 | Info | bound-evidence-002 records `duration_ms` for run 1 only. | Closed by this lane recording both run durations (§4.1). |
| E3 | Info | bound-evidence-002 does not pin which shell ran which command. | Closed — all checks reproduced under Git Bash alone. |
| E4 | Info | bound-evidence-002 tamper covers 1 of 11 pinned guards. | Widened by this lane's proof on a second distinct file (`risk-registry.mjs`); `-001` covered a third. |

**No BLOCKER / HIGH / MEDIUM findings.** No failing tests, no drift, no integrity
failure, no accounting mismatch.

## 8. What this record does NOT do

- Does **not** close G2 on its own authority — it supplies the independent QA
  verdict artifact the gap requires at the re-cut SHA; weight-bearing use follows
  the operator's evidence-acceptance act.
- Does **not** claim readiness, does **not** touch the P0-20 packet, the operator
  HOLD, or the sealed human-GOV slot (`verdict: null`).
- Changes **zero** files under `src/`, `contracts/`, `tools/`, or `tests/`. The
  §5c tamper was performed and reverted in an isolated detached evidence tree;
  that tree was left clean (`git status` empty, `git diff --stat` empty) and then
  removed.
- Does **not** edit any tracker or MANIFEST, does **not** push, and does **not** merge.

## 9. Advisory status fields

```yaml
truth_status: verified_true        # every number produced first-hand by the recorded commands at the bound SHA; all match bound-evidence-002
authority_status: advisory_only    # QA verdict; acceptance/weight-bearing use is operator-gated
implementation_status: candidate   # independent G2 re-derivation staged for operator review at the accepted baseline
risk_class: low                    # reproducible binary checks; docs + reverted test execution only
```

## 10. Self-certification

```yaml
self_certification:
  agent_id: claude-qa-w2-g2-02
  peer_agent_id: claude-motor-a2-recut-01
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Certified: this independent QA verdict is complete as an advisory work product.
> Every command and output was executed and observed first-hand at commit
> `3c439f787e9ff15ffe195d5675feb8a1d5621fbe` (tree
> `39d006117c853ff0625f80a5d5d431c6b49bf1b8`) in a clean, detached, isolated
> worktree distinct from the authoring tree (`main` @ `6a6e9de`), by an executor
> (`claude-qa-w2-g2-02`) distinct from the re-cut bound-evidence producer
> (`claude-motor-a2-recut-01`), the original G2 lane (`claude-qa-w2-g2-01`), and
> the parallel G1/G3 lanes (SoD: producer ≠ QA). It carries no execution or
> approval authority; closing G2, accepting the evidence, and the promotion
> decision itself remain with the operator/GOV. This verdict is bound to
> `3c439f7` and is void at any other SHA.
