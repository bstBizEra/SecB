# MOD-WSPACE S1 — Write-Set Containment Evaluator — Consolidation 001 (converged rework candidate)

**Record ID:** mod-wspace-s1-consolidation-001
**Status:** ADVISORY — NOT EFFECTIVE
**Producer:** claude-motor-wspace-s1-consolidate-01 (BST-SA motor)
**Date:** 2026-07-21
**Branch:** `bst/mod-wspace-s1-converged`
**Consolidates (merge parents):**
- **Lane A** — `ced265fd39260ffcea5dff544b160c1bdedc5b4f` (`bst/mod-wspace-s1-write-set-rework-001`, parent `3225c13`) — Claude motor rework closing Codex `WSPACE-S1-REV-002` (fail-closed single-read extraction) + Claude REV note `N1` (Windows trailing-space/dot collapse).
- **Lane B** — `b58169a254d948b77c30dcdfeafbbe44fcb0466d` + record `fa6a2a54fb31ab728226a2c25ffbbd8cd471516c` (`codex/rework/mod-wspace-s1-002`, parent `8b77db0` → `3225c13`) — Codex rework closing BLOCKING `WSPACE-S1-REV-001` (path-alias bypasses: `//`, `/./`, backslash, NFC, trailing-space/dot, ADS colon, case-folded prohibited match). **Produced in the operator's other session by `codex-root`; carried here verbatim from its committed branch, with provenance records `mod-wspace-s1-rev-001.md` and `mod-wspace-s1-rework-002-producer-verification-001.md` merged into the tree.**

**Reviews being retired by this converged candidate:**
- BINDING — `codex/rev/mod-wspace-s1-001:docs/03-project-control/candidates/mod-wspace-s1-rev-001.md` — `REQUEST_CHANGES / DENY_FAIL_CLOSED` at `3225c13` (findings REV-001 BLOCKING, REV-002 MEDIUM).
- ADVISORY — `claude/rev/wspace-s1-001:docs/03-project-control/candidates/mod-wspace-s1-write-set-rev-001.md` — `APPROVE_WITH_NOTES` at `3225c13` (note N1 LOW; N2/N3 INFO, no change required).

The slice remains **pure and unwired**: no import of the evaluator exists outside its own module and test; no I/O, clock, network, or persistence.

---

## 1. Closure map

| Finding | Sev | Closed by | How, in the converged evaluator |
|---|---|---|---|
| Codex `WSPACE-S1-REV-001` — non-canonical aliases (`//`, `/./`, non-canonical bounds) bypass prohibited prefixes | BLOCKING | **✓ Lane B** | One lexical grammar (`canonicalizePath`) applied to candidates AND both bound lists before any prefix comparison: interior empty segments, `.` segments, backslashes, non-NFC spellings, segment-edge whitespace, trailing-dot segments, and `:` (ADS) all deny `DENY_WRITE_SET_MALFORMED`; trailing separators collapse to the canonical spelling BEFORE matching so an alias can never reach a different verdict than its canonical form; prohibited matching additionally case-folds. All three original review probes re-run and deny. |
| Codex `WSPACE-S1-REV-002` — hostile property access escapes the structured-denial boundary | MEDIUM | **✓ Lane A** | Single-read destructure + defensive `snapshotArray` (Array.isArray gate, tampered-iterator rejection without invocation, one `[[Get]]` per element) inside one try/catch, running FIRST; every later check operates on plain-string snapshot copies only. Lane B's whole-function outer try/catch retained as belt-and-braces (expected unreachable). Invocation-count probe re-run over converged code: each field getter invoked exactly once. |
| Claude `N1` — Windows trailing-space/dot component collapse (`.. ` → `..`) | LOW | **✓ composed** | Both protections hold: Lane A's `hasWindowsCollapsibleComponent` candidate check (which preserves canonical `.`/`..` for the TRAVERSAL contract) runs at the malformed-entry stage; Lane B's `canonicalizePath` independently rejects trailing-dot and edge-whitespace segments in ALL three lists. Same deny code from both layers: `DENY_WRITE_SET_MALFORMED`. |
| Claude `N2`, `N3` | INFO | no change | Reviewer classed as informational; N2 lookalikes now additionally constrained by NFC/canonical grammar where applicable. |

## 2. Composition decisions

1. **Containment first, normalization second (task rule 1).** Order of checks: plain-object gate → Lane A extraction/snapshot (try/catch) → NOT_ARRAY → EMPTY → entry cleanliness → Lane A N1 candidate check → traversal (all lists, Lane B extension) → absolute (all lists) → Lane B canonical-grammar check (all lists) → case-fold-safe prohibited → allowed. `canonicalizePath`/`normalize("NFC")` therefore only ever see plain-string copies from the snapshots — a hostile object can never reach normalization code.
2. **Snapshot mechanism: Lane A's, wholesale.** Lane A's `snapshotArray` (iterator-identity rejection without invocation, single `[[Get]]` per index) is strictly stronger than Lane B's blanket catch and is what the binding REV-002 rework demanded ("without invoking an accessor more than once"). Lane B's outer `evaluateWriteSet` try/catch wrapper is kept as defense in depth so any future throw still degrades to the frozen malformed denial.
3. **Traversal/absolute widened to all three lists (Lane B).** Lane A checked candidates only; Lane B's stricter form (bounds included) is adopted, with Lane B's generalized message `path escapes via '..'`. No committed test pinned the old candidate-only message.
4. **`withinBound` no longer strips bounds inline (Lane B).** Stripping moved into `canonicalizePath` (which begins with `stripTrailingSlashes`), so matching always runs over canonical forms. Base trailing-separator tests still pass; parity with the `pathSubset` oracle holds (see §4).
5. **Both trailing-space/dot layers kept (task rule 1: compose, don't choose).** Lane A's candidate-stage check preserves the documented `.`/`..` exclusions that protect the TRAVERSAL deny-code contract; Lane B's segment grammar covers the bound lists. Removing either would narrow a review closure.
6. **Case-folded prohibited matching kept (Lane B).** Prohibited comparison runs exact AND case-folded (`src/GATEWAY` cannot evade prohibited `src/gateway`); allowed comparison stays exact so no permissive case-widening is introduced.
7. **Merge, not hand-copy.** The candidate is a true merge commit with parents `ced265f` and `fa6a2a5`, preserving both lanes' authorship in the DAG; only `src/control/write-set-policy.mjs` had textual conflicts, resolved per this section.

## 3. Deny-code reconciliations

| Input class | Lane A code | Lane B code | Converged | Rationale |
|---|---|---|---|---|
| Trailing-space/dot segment (candidate) | `DENY_WRITE_SET_MALFORMED` | `DENY_WRITE_SET_MALFORMED` | `DENY_WRITE_SET_MALFORMED` | No conflict — both lanes independently chose MALFORMED (Lane A's documented rationale: caller-precondition violation, not a literal `..` segment; TRAVERSAL would drift from the pinned `pathSubset` semantics). |
| Alias spellings `//`, `/./`, backslash, NFC, `:`, edge-whitespace | n/a (out of Lane A scope) | `DENY_WRITE_SET_MALFORMED` | `DENY_WRITE_SET_MALFORMED` | REV-001's required rework offered "normalize or deny"; Lane B chose deny-as-malformed, which the binding reviewer's own rework record ratifies. Adopted unchanged. |
| Hostile getter / Proxy / poisoned iterator | `DENY_WRITE_SET_MALFORMED`, message `write-set fields could not be read as arrays` | `DENY_WRITE_SET_MALFORMED`, message `input could not be safely inspected` | `DENY_WRITE_SET_MALFORMED`, message `input could not be safely inspected` | **Only reconciliation needed — message text, not deny code.** Lane B's test pins the exact message via `deepEqual`; Lane A's tests pin code + frozenness only. Unifying on Lane B's message (in both the inner extraction catch and the outer guard) makes hostile inputs indistinguishable by containment layer and let the union suite pass with **zero assertion adaptations**. |
| `..` traversal, absolute/drive/UNC, prohibited-hit, outside-allowed, empty, non-array | identical | identical | unchanged | All six original deny codes preserved; `WRITE_SET_DENY_CODES` closed-set test unmodified and green. |

**Test-assertion adaptations required by rule 2: none.** The union of both suites (17 base + 8 Lane A + 4 Lane B = 29) runs unmodified against the converged evaluator.

## 4. Verification (re-run first-hand on the converged tree)

| Check | Result |
|---|---|
| `node --test tests/write-set-policy.test.mjs` | **29 / 29 pass, 0 fail** (union: 17 base + 8 Lane A + 4 Lane B, none adapted) |
| `npm test` | **tests 732 · pass 727 · fail 0 · skipped 5** (baseline 720/715/0/5 + 8 + 4) |
| `npm run validate` | **exit 0** (`PASS`) |
| Codex REV-001 original probes (`src//gateway/secret.mjs`, `src/./gateway/secret.mjs` vs prohibited `src/gateway`; canonical candidate vs prohibited bound `src//gateway`) | all **DENY_WRITE_SET_MALFORMED** (were ALLOW at `3225c13`) |
| Task alias probes `a//b`, `a/./b`, `./a`, interior empty segment | all **DENY_WRITE_SET_MALFORMED**; trailing-separator-only spellings collapse to canonical BEFORE matching (`src/gateway//` vs prohibited `src/gateway` → **DENY_WRITE_SET_PROHIBITED**) — a prohibited path is not reachable via any alias spelling |
| Codex REV-002 original probes (throwing getter, throwing Proxy get/has, poisoned `Symbol.iterator`) | all frozen **DENY_WRITE_SET_MALFORMED**, nothing thrown; poisoned iterator **never invoked** |
| Single-read invocation-count probe (converged code) | each field getter invoked **exactly 1** time; decision uses only the first snapshot |
| Claude N1 probes (`src/.. /x`, `src/foo./x`) | **DENY_WRITE_SET_MALFORMED** (were ALLOW at `3225c13`) |
| Standard suite: traversal both separators, absolute POSIX/drive/UNC, prefix-collision, prohibited-beats-allowed, case-fold prohibited | all correct codes |
| `pathSubset` config-equivalence parity | **holds** — aliases are denied BEFORE matching, so the parity fixture table (canonical/well-formed inputs incl. trailing-slash bounds, unicode NFC, traversal rows) agrees row-for-row with the untouched `context-federation-service.mjs` oracle |
| Byte-identity guard (`context-federation-service.mjs`, `risk-registry.mjs`, `validate-foundation.mjs`, `package.json` vs `main`) | **PASS** — none modified |
| Deep-frozen outputs, purity, unwired | **PASS** — same `deny()`/`ALLOW` frozen constructors; no new imports of the evaluator anywhere |

## 5. Advisory status fields

```yaml
truth_status: verified_true          # every closure re-reproduced and re-verified first-hand on the converged tree
authority_status: advisory_only
implementation_status: candidate     # converged successor carrying REV-001 + REV-002 + N1 closures; supersedes both single-lane reworks
risk_class: medium                   # binding REQUEST_CHANGES verdict does not transfer; this exact commit requires FRESH independent review
```

## 6. Self-certification

```yaml
self_certification:
  agent_id: claude-motor-wspace-s1-consolidate-01
  peer_agent_id: codex-motor
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> This record certifies advisory consolidation completeness only. The converged candidate closes every finding of the binding Codex `REQUEST_CHANGES / DENY_FAIL_CLOSED` review (`REV-001` via Lane B, `REV-002` via Lane A) plus the Claude advisory note `N1` (composed), but per that review's own disposition the verdict does not transfer: a fresh independent reviewer must inspect and execute against this exact commit before any staging, merge, ratification, or wiring. Lane B's producer (Codex) and Lane A's producer (Claude motor) are both disqualified from that fresh review. No merge, push, wiring, or production is authorized by this record. Recommend improvements only. Do not execute them.
