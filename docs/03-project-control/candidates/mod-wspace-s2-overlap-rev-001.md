# MOD-WSPACE S2 Overlap-Class Evaluator — Independent Immune Review 001

**Record ID:** mod-wspace-s2-overlap-rev-001
**Status:** DRAFT / ADVISORY — NOT EFFECTIVE
**Verdict:** **APPROVE_FOR_MERGE**
**Reviewer:** `claude-immune-rev-wspace-overlap-01` (BST-SA Immune, independent review gate)
**Review target:** branch `bst/mod-wspace-s2-overlap` @ `33ffdf56819b109572aaa6741cf0858d4d174c8f`
**Base:** unified `main` @ `c52db71776e57aaf624002e53382d4857816773f`
**Authoritative spec:** `docs/03-project-control/candidates/mod-wspace-gap-assessment-001.md` (G5, Slice S2) on `bst/mod-wspace-assessment`
**Method:** all findings read/executed first-hand in an isolated worktree; classification, contradiction, fail-closed and TOCTOU/accessor-attack suites re-built independently of the branch's own tests; byte-identity and doc-parity re-derived by the reviewer.

---

## 1. Scope of change (verified)

`git diff --stat c52db71 33ffdf5` → exactly three files, additive only:

| File | Change |
|---|---|
| `src/control/overlap-policy.mjs` | +252 (new) |
| `tests/overlap-policy.test.mjs` | +479 (new, 28 tests) |
| `MANIFEST.json` | +2 (register the two new files) |

- **Unwired:** `git grep overlap-policy` over `src/`, `tools/`, `contracts/` (excluding the sibling test) returns **zero importers**. Nothing consumes the evaluator — matches the assessment's "pure + unwired" R2 posture (§4 S2, §5 non-goals #4/#7).
- Branch `33ffdf5` is a single commit whose parent **is** the base `c52db71`.

## 2. Verification results

| Check | Result |
|---|---|
| Full suite `npm test` | **989 tests / 984 pass / 0 fail / 5 skip** (baseline 961/956/0/5 + 28) |
| `npm run validate` (`validate-foundation.mjs`) | **exit 0** |
| Merge-cleanliness vs `main` @ c52db71 | **clean fast-forward** (`c52db71` is ancestor of `33ffdf5`); `git merge-tree --write-tree` produced a tree with no conflict. The predicted MANIFEST-tail conflict does **not** materialize against this base because the branch's `+2` insertion sits above the already-present `workspace-lease-policy` tail lines that c52db71 already contains. A tail conflict would only appear if a *sibling* branch that also appends to the same MANIFEST region were merged first — informational, not a defect of this branch. |

## 3. Requirement-by-requirement findings

### 3.1 Doc-parity honesty — VERIFIED
- O0–O5 `overlap`/`control` strings in `OVERLAP_CLASSES` match `docs/12-execution/06-parallel-execution.md` "Overlap policy" table **1:1 verbatim** (reviewer read the doc directly).
- The parity test (`doc-parity: O0-O5 …`) does **`readFileSync` of the live doc at runtime** and parses the actual markdown table with a generic table parser, then asserts each class's `overlap`+`control` equals the parsed cell **and** that the row count equals `OVERLAP_ORDER.length`. It is **not** an embedded fixture — any drift in either the doc or the embedded copy fails the suite. This is stronger than the S2 prose ("embeds the O-table rows as fixtures") and satisfies the review requirement of runtime parsing.
- The doc file is byte-identical vs c52db71 (not modified to fit the code).

### 3.2 Classification semantics — VERIFIED (independent probe)
- Most-restrictive-wins ladder implemented as ordered precedence `protectedBranch→O5 > globalConfig→O4 > sameSymbol→O3 > filesOverlap→O2 > sameModule→O1 > O0`, matching doctrine order O5>O4>O3>O2>O1>O0.
- **Contradiction probes escalate, never relax:** `sameSymbol:true` + disjoint paths → **O3** (not O0/O1); file overlap + `sameModule:false` → **O2**; `sameSymbol:true`+`protectedBranch:true` → **O5**.
- **Fail-closed `DENY_OVERLAP_UNKNOWN_CLASS`** on absent/non-boolean for **each** of `sameModule`, `sameSymbol`, `protectedBranch`, `globalConfig` (probed omitted and `"true"`,`1`,`0`,`null`,`{}`,`undefined` individually — all 4 dimensions × all variants → UNKNOWN_CLASS). The permissive **O0 floor is unreachable by omission**: a disjoint pair with no booleans answered fails closed rather than reading as O0.
- **`DENY_OVERLAP_EMPTY`** on empty `writeSetA` or `writeSetB` (doctrine lane-contract: declared write set required non-empty).

### 3.3 write-set-policy reuse — VERIFIED
- `src/control/write-set-policy.mjs` blob `5f1e119c8089ba8250f3596164c0974662587449` is **byte-identical** to c52db71 (imported unmodified).
- Path overlap is **derived** by calling the reused `evaluateWriteSet` (containment both directions) — no prefix/subset logic reimplemented in this module. Reviewer confirmed faithful reuse on edges: prefix-collision `src/foo` vs `src/foobar` → **O0** (not overlap), ancestor `src/shared` vs `src/shared/x.mjs` → **O2**, multi-element overlap on a shared entry → **O2**, same-dir disjoint files → **O0**.
- The branch's own reuse-parity test binds the derived decision to an independent `pathSubset` oracle; the byte-identity guard pins the reused source.

### 3.4 ATOMIC-SNAPSHOT / cross-array TOCTOU — VERIFIED (independent rebuild)
- Getter on a `writeSetA` element does **not** alter `writeSetB` classification (cross-array stays O0) and the element is **read exactly once**.
- A value-varying element getter is bound to the **first snapshot** (2nd-read value never observed).
- A tampered `Symbol.iterator` on a write set is **rejected and never invoked** (identity comparison against the module-load-captured `Array.prototype[Symbol.iterator]`) → MALFORMED.
- Six input fields destructured exactly once; throwing field getter contained → MALFORMED, read once.
- Proxy `get`- and `ownKeys`-trap throws are **contained** → MALFORMED (never propagate past the structured-denial boundary).
- Outputs deep-frozen; mutation attempts ineffective / throw.

### 3.5 Deny-code closure & frozen exports — VERIFIED
- `OVERLAP_DENY_CODES` is the exact frozen closed set `{MALFORMED, EMPTY, UNKNOWN_CLASS}`; `OVERLAP_CLASSES`, its rows, and `OVERLAP_ORDER` are frozen.

## 4. Findings by severity

- **Critical / High / Medium:** none.
- **Low / Informational (no action required):**
  - **F-INFO-1 — Spec-shape deviation, all in the tightening direction.** The S2 prose named the function `classifyOverlap` with a `sameFile` caller flag and "embedded fixtures". The implementation instead exposes `evaluateOverlap` (result-object house style), **derives** file overlap from the two write sets via `write-set-policy` reuse (no `sameFile` flag), and parses the **live doc at runtime**. These deviations are documented in the commit's AMD-002-002 advisory-decision note, honor boundary **B-reuse** ("reuse, don't reimplement path logic"), and match the reviewer's authoritative requirements (runtime parity + write-set reuse). Recorded as a conscious, safe improvement, not a defect.
  - **F-INFO-2 — MANIFEST tail-conflict prediction not reproduced against this base** (see §2). Purely a consequence of merge order relative to sibling branches; no change requested.

## 5. Authority & self-certification

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: existing        # the S2 code exists on-branch; this record reviews it, authorizes nothing
risk_class: low
review_verdict: APPROVE_FOR_MERGE
blocked_actions:
  - no push
  - no merge
  - no main mutation
  - operator-only integration
self_certification:
  agent_id: claude-immune-rev-wspace-overlap-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Independent review gate: findings recommend integration readiness only. Merge and any downstream wiring/activation remain operator-authorized. Both agents may self-certify advisory completeness; neither self-authorizes execution.
