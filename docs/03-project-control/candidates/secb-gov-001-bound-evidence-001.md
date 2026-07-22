# SECB-GOV-001 Bound Test Evidence (G5, Wave 1a)

| Field | Value |
|---|---|
| Artifact | `secb-gov-001-bound-evidence-001` |
| Executor | `claude-motor-w1a-baseline-01` (BST-SA Motor, advisory) — **one executor; see §5 honesty note** |
| Dispatch | Operator dispatch of **Wave 1a/W1d** of `secb-gov-001-readiness-closure-plan-001.md` (merged PR #114) |
| Gap addressed | **G5** — "Independently reproduced test evidence bound to that accepted SHA" (first readiness review §7 item 5; closure plan §2 G5 card) |
| Bound to commit | `c2ec6458b60ded0a93d74e717cd7816f55834f01` (proposed G4 baseline; `secb-gov-001-baseline-recut-001.md`) |
| Bound to tree | `3b7300f1b7cd378d373cf8e2da10dc459bb8f63b` |
| Timestamp (UTC) | 2026-07-22T04:06:54Z (evidence-run window ~03:50–04:07Z) |
| Scope | First-hand execution record of the acceptance checks at exactly the proposed baseline. NOT a QA verdict, NOT an acceptance, NOT a promotion input by itself. |
| Authority | Advisory only. |

> **Binding statement (read this before using any number below).** Every number
> in this record was produced by commands run on a detached checkout of commit
> `c2ec6458b60ded0a93d74e717cd7816f55834f01` (tree
> `3b7300f1b7cd378d373cf8e2da10dc459bb8f63b`) and is valid **only** for that
> exact commit and tree. If the SHA you are evaluating differs in even one
> character — including any later main tip, any re-cut successor baseline, and
> any branch containing this commit as a mere ancestor — this evidence is
> **void for your purpose** and must be re-derived at your SHA. Do not cite
> these totals against any other commit.

---

## 1. Checkout binding (commands + outputs)

```
$ git fetch origin main && git rev-parse FETCH_HEAD
c2ec6458b60ded0a93d74e717cd7816f55834f01          # origin/main tip == the baseline

$ git checkout --detach c2ec6458b60ded0a93d74e717cd7816f55834f01
HEAD is now at c2ec645 Merge pull request #114 from bstBizEra/bst/readiness-closure-plan

$ git rev-parse HEAD HEAD^{tree}
c2ec6458b60ded0a93d74e717cd7816f55834f01
3b7300f1b7cd378d373cf8e2da10dc459bb8f63b

$ git status --short
(clean — no local modifications before the run)
```

## 2. Environment

| Item | Value |
|---|---|
| OS | Microsoft Windows 11 Pro, `[Version 10.0.26200.8875]` |
| Shell | Git Bash / MINGW64_NT-10.0-26200 (x86_64, Msys) |
| `node --version` | `v24.12.0` |
| `npm --version` | `11.6.2` |
| Dependency install | `npm ci` — exit 0 (clean install from lockfile before any test run) |
| Validator version | `0.3.0-alpha.0` (self-reported in `validate-foundation` JSON output) |

## 3. Full test suite (`npm test`)

`npm test` at this tree is defined as `npm run validate && node --test tests/*.test.mjs` (package.json), so the suite run below already chains the validator; §4 additionally records a direct standalone validator invocation.

```
$ npm test        # exit code 0
ℹ tests 1325
ℹ suites 0
ℹ pass 1322
ℹ fail 0
ℹ cancelled 0
ℹ skipped 3
ℹ todo 0
ℹ duration_ms 6295.683
```

- **Totals bound to `c2ec6458b60ded0a93d74e717cd7816f55834f01`: 1325 tests / 1322 pass / 0 fail / 3 skipped / 0 cancelled / 0 todo, exit 0.**
- **Stability re-run:** a second full pass of the same suite in the same checkout (`node --test --test-reporter=tap tests/*.test.mjs`) produced **1325 `ok` / 0 `not ok`** test points — same totals, no flake observed between the two runs.
- **Per-suite-file summary:** `tests/` contains **65** `*.test.mjs` files, all included by the `tests/*.test.mjs` glob. A per-file test-count breakdown is **not cheaply available**: the node test runner's TAP output at this tree flattens all 1325 subtests to top level without per-file grouping (verified: 1325 top-level `# Subtest:` entries, none file-scoped), and re-running 65 files individually was out of scope. Honestly recorded as omitted rather than approximated.

## 4. Foundation validator (standalone)

```
$ node tools/validate-foundation.mjs   # exit code 0
status: "PASS"
checks: 859 total, 0 non-PASS
schemas.count check: PASS — "7 canonical bootstrap schemas + 13 governed extensions"
```

- **Bound validator facts: exit 0, status PASS, 859/859 checks PASS, schemas.count = 20 (7 canonical + 13 governed).**
- Cross-check: `ls contracts/*.schema.json | wc -l` → **20** files, consistent with the validator's schema count.
- Context (not this record's claim to defend): the check total has grown monotonically with recent merges (856 @ `2a22e52` closure report, 857 @ `1ef3ae9` A2A review, **859 @ `c2ec645`**) — growth is from added guards, with 0 failures at each point.

## 5. Honesty note — one executor, not yet independent

This is **ONE executor's first-hand evidence**, produced by the same Wave-1a
motor agent that drafted the G4 baseline-re-cut proposal. It replaces the old
packet's defect of *unbound, stale, producer-tree* self-reports (the 559-test
figure bound to no on-main SHA) with a **bound, tip-fresh, on-main** run — but
it does **not** satisfy the independence requirement by itself. The G1 (REV),
G2 (QA), and G3 (SEC) lanes in **Wave 2** must re-derive their own runs at this
same SHA (`c2ec6458b60ded0a93d74e717cd7816f55834f01`) with executors distinct
from this agent (SoD: producer ≠ REV ≠ QA; plan §3 decision point B). If the
operator re-cuts the baseline instead of accepting it, this record is void per
the binding statement and W1d must be re-executed at the new SHA.

## 6. What this record does NOT do

- Does **not** close G5 on its own authority — it supplies the bound-evidence
  artifact the gap requires; weight-bearing use of it follows the operator's
  G4 acceptance of the SHA it binds to.
- Does **not** claim readiness, does **not** touch the P0-20 packet, HOLD, or
  sealed human-GOV slot, and changes **zero** files under `src/`, `contracts/`,
  `tools/`, or `tests/` (test execution only).

## 7. Advisory status fields

```yaml
truth_status: verified_true        # every number above produced first-hand by the recorded commands at the bound SHA
authority_status: advisory_only    # evidence record; acceptance/weight-bearing use is operator-gated via G4
implementation_status: candidate   # bound evidence staged for operator review; Wave-2 independent re-derivation pending
risk_class: low                    # per the plan's G5 card; reproducible binary checks, docs + test execution only
```

## 8. Self-certification

```yaml
self_certification:
  agent_id: claude-motor-w1a-baseline-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Certified: every command and output above was executed and observed
> first-hand at commit `c2ec6458b60ded0a93d74e717cd7816f55834f01` in a clean,
> detached, isolated worktree. This record carries no execution or approval
> authority; it is one executor's bound evidence awaiting independent Wave-2
> re-derivation and operator acceptance.
