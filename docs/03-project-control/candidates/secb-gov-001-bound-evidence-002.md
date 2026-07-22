# SECB-GOV-001 Bound Test Evidence 002 (G5, Phase-A step A2)

| Field | Value |
|---|---|
| Artifact | `secb-gov-001-bound-evidence-002` |
| Executor | `claude-motor-a2-recut-01` (BST-SA Motor, advisory) — **one executor; see §6 honesty note** |
| Supersedes (by reference) | `secb-gov-001-bound-evidence-001.md` (bound to `c2ec6458…`) — extend-only; the -001 record is NOT edited or deleted |
| Dispatch | Operator-ordered **Phase-A step A2 RE-CUT** (2026-07-22) — fresh first-hand evidence at the re-cut baseline proposed in `secb-gov-001-baseline-recut-002.md` |
| Gap addressed | **G5** — "Independently reproduced test evidence bound to that accepted SHA" (first readiness review §7 item 5; closure plan §2 G5 card) |
| Bound to commit | `3c439f787e9ff15ffe195d5675feb8a1d5621fbe` (proposed G4 re-cut baseline) |
| Bound to tree | `39d006117c853ff0625f80a5d5d431c6b49bf1b8` |
| Timestamp (UTC) | 2026-07-22T10:48:19Z (evidence-run window ~10:35–10:50Z) |
| Scope | First-hand execution record of the acceptance checks at exactly the proposed re-cut baseline. NOT a QA verdict, NOT an acceptance, NOT a promotion input by itself. |
| Authority | Advisory only. |

> **Binding statement (read this before using any number below).** Every number
> in this record was produced by commands run on a detached checkout of commit
> `3c439f787e9ff15ffe195d5675feb8a1d5621fbe` (tree
> `39d006117c853ff0625f80a5d5d431c6b49bf1b8`) and is valid **only** for that
> exact commit and tree. If the SHA you are evaluating differs in even one
> character — including any later main tip, any re-cut successor baseline, and
> any branch containing this commit as a mere ancestor — this evidence is
> **void for your purpose** and must be re-derived at your SHA. Do not cite
> these totals against any other commit. (The -001 evidence bound to `c2ec645`
> is likewise void at this SHA; this record supersedes it by reference.)

---

## 1. Checkout binding (commands + outputs)

```
$ git fetch origin && git rev-parse origin/main
3c439f787e9ff15ffe195d5675feb8a1d5621fbe          # origin/main tip == the re-cut baseline

$ git rev-parse HEAD HEAD^{tree}
3c439f787e9ff15ffe195d5675feb8a1d5621fbe
39d006117c853ff0625f80a5d5d431c6b49bf1b8          # detached checkout at the tip

$ git status --short
(clean — no local modifications before the run)
```

`3c439f7` is the merge commit of PR #129 (`bst/schema-align-project-contract`) and is `origin/main`'s tip at execution time, byte-identical. It is the tip itself, not an ancestor claim.

## 2. Environment

| Item | Value |
|---|---|
| OS | Microsoft Windows 11 Pro, `[Version 10.0.26200]` |
| Shell | Git Bash / MINGW64 (x86_64) + PowerShell 5.1 |
| `node --version` | `v24.12.0` |
| `npm --version` | `11.6.2` |
| Dependency install | `npm ci` — exit 0 (clean install from lockfile before any test run) |
| Validator version | `0.3.0-alpha.0` (self-reported in `validate-foundation` JSON output) |

## 3. Full test suite (`npm test`) — run TWICE

`npm test` at this tree is defined as `npm run validate && node --test tests/*.test.mjs` (package.json), so each suite run below already chains the validator; §4 additionally records a direct standalone validator invocation.

**Run 1:**

```
$ npm test        # exit code 0
ℹ tests 1331
ℹ suites 0
ℹ pass 1328
ℹ fail 0
ℹ cancelled 0
ℹ skipped 3
ℹ todo 0
ℹ duration_ms 6396.6674
```

**Run 2 (stability, same checkout, same `npm test` command):**

```
$ npm test        # exit code 0
ℹ tests 1331
ℹ pass 1328
ℹ fail 0
ℹ cancelled 0
ℹ skipped 3
ℹ todo 0
```

- **Totals bound to `3c439f787e9ff15ffe195d5675feb8a1d5621fbe`: 1331 tests / 1328 pass / 0 fail / 3 skipped / 0 cancelled / 0 todo, exit 0 — identical across both runs (no flake observed).**
- **Growth vs the -001 baseline (`c2ec645`, 1325/1322/0/3):** +6 tests / +6 pass, all from the schema-alignment work package (#129, `tests/project-contract-schema-alignment.test.mjs` + `tests/approval-binding.test.mjs` + rich-contract fixtures). Skips unchanged at 3.
- **Per-suite-file summary:** `tests/` contains **66** `*.test.mjs` files (was 65 at `c2ec645`; #129 added `project-contract-schema-alignment.test.mjs`), all included by the `tests/*.test.mjs` glob. A per-file test-count breakdown is not cheaply available from the runner's flattened TAP output; honestly recorded as omitted rather than approximated (same disclosure as the -001 record; addressed for the guard net specifically in §5).

## 4. Foundation validator (standalone)

```
$ node tools/validate-foundation.mjs   # exit code 0
status: "PASS"
version: "0.3.0-alpha.0"
checks: 898 total, 0 non-PASS
schemas.count check: PASS — "7 canonical bootstrap schemas + 13 governed extensions"
```

- **Bound validator facts: exit 0, status PASS, 898/898 checks PASS, schemas.count = 20 (7 canonical + 13 governed).**
- Cross-check: `ls contracts/*.schema.json | wc -l` → **20** files, consistent with the validator's schema count. The schema-align merge (#129) grew `contracts/project-contract.schema.json` by +606 lines **without** adding a schema file, so the count stays 20.
- Context (not this record's claim to defend): the check total has grown monotonically with recent merges (859 @ `c2ec645`, 870 @ `b93cd7d` closure addendum, **898 @ `3c439f7`**) — growth is from added guards/checks, with 0 failures at each point.

## 5. Production audit (official registry)

```
$ npm audit --omit=dev --registry=https://registry.npmjs.org   # exit code 0
found 0 vulnerabilities
```

- **Bound audit fact: 0 vulnerabilities (production dependency tree), exit 0.**
- This is the post-remediation state: the W2-G3 SEC review found 1 HIGH (`fast-uri` 3.1.3, GHSA-v2hh-gcrm-f6hx, transitive via ajv), accepted as an informed finding at G6; PR #125 bumped the lockfile to fast-uri 3.1.4 (`package-lock.json` only). At `3c439f7` that HIGH is cleared. The configured registry (npmmirror) does not implement the audit endpoint, so the audit was run honestly against `registry.npmjs.org` (same convention as the W2-G3 SEC review).

## 6. Guard-net tamper spot-check (E3 — closes the gap bound-evidence-001 lacked)

The W2-G2 QA lane flagged (E3) that bound-evidence-001 asserted the byte-identity guards are green but never proved they actually **bite**. This record closes that gap with a live tamper→fail→restore→green cycle:

```
Target guarded file: src/control/authority-engine.mjs
  (pinned in tests/conformance-v020-governance.test.mjs PINNED_BLOBS to its
   git blob at main @ ec5aa76; the guard hashes the working-tree file)

STEP 1 (baseline)  node --test --test-name-pattern="byte-identity"
                   tests/conformance-v020-governance.test.mjs  → PASS (green)

STEP 2 (tamper)    printf '\n// TAMPER-PROBE-A2\n' >> src/control/authority-engine.mjs
                   re-run guard →
                   AssertionError [ERR_ASSERTION]:
                     src/control/authority-engine.mjs blob-identical to main @ ec5aa76
                   → guard FAILS (tamper caught)

STEP 3 (restore)   git checkout -- src/control/authority-engine.mjs
                   git status --short  → (clean)
                   re-run guard → tests 1 / pass 1 / fail 0, exit 0 → green again
```

- **Guard-net liveness proven: a 1-byte append to a guarded file makes the byte-identity guard FAIL with the specific blob-mismatch assertion; `git checkout` restore returns it to green with a clean tree.** The tamper was fully reverted — the committed tree at `3c439f7` is unmodified (verified `git diff --stat` empty after restore).

## 7. Honesty note — one executor, not yet independent

This is **ONE executor's first-hand evidence**, produced by the same A2 motor
agent that drafted the G4 re-cut-002 proposal. It replaces the -001 record's
`c2ec645` binding with a **bound, tip-fresh, on-main** run at `3c439f7` — but it
does **not** satisfy the independence requirement by itself. Per the W2 verdicts'
own binding clauses, those `c2ec645` G1/G2/G3 verdicts are void at this SHA; the
re-cut-002 proposal §5 surfaces whether they must be re-run (Reading A) or are
carried incrementally by the per-PR reviews of the delta (Reading B) as an
**operator G9 judgment** — not resolved here. If the operator re-cuts the
baseline again instead of accepting `3c439f7`, this record is void per the
binding statement and must be re-executed at the new SHA.

## 8. What this record does NOT do

- Does **not** close G5 on its own authority — it supplies the bound-evidence
  artifact the gap requires at the re-cut SHA; weight-bearing use follows the
  operator's G4 acceptance of the SHA it binds to.
- Does **not** rewrite the -001 record — extend-only supersede-by-reference.
- Does **not** claim readiness, does **not** touch the P0-20 packet, HOLD, or
  sealed human-GOV slot, and changes **zero** files under `src/`, `contracts/`,
  `tools/`, or `tests/` (the §6 tamper was reverted; test execution only).

## 9. Advisory status fields

```yaml
truth_status: verified_true        # every number above produced first-hand by the recorded commands at the bound SHA
authority_status: advisory_only    # evidence record; acceptance/weight-bearing use is operator-gated via G4
implementation_status: candidate   # bound evidence staged for operator review; independent re-derivation per §7 pending
risk_class: low                    # reproducible binary checks, docs + reverted test execution only
```

## 10. Self-certification

```yaml
self_certification:
  agent_id: claude-motor-a2-recut-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Certified: every command and output above was executed and observed
> first-hand at commit `3c439f787e9ff15ffe195d5675feb8a1d5621fbe` in a clean,
> detached, isolated worktree, including the E3 guard-net tamper cycle (which was
> fully reverted). This record carries no execution or approval authority; it is
> one executor's bound evidence at the operator-ordered re-cut baseline, awaiting
> independent re-derivation and operator acceptance.
