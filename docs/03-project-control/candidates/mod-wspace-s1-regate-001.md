# MOD-WSPACE S1 — Write-Set Containment Evaluator — Fresh Independent Re-Gate 001

**Record ID:** mod-wspace-s1-regate-001
**Status:** ADVISORY — NOT EFFECTIVE
**Reviewer:** claude-immune-regate-wspace-s1-01 (BST-SA immune, fresh independent gate)
**Date:** 2026-07-21
**Gate target:** branch `bst/mod-wspace-s1-converged` @ `ae0cf1bd8de02b8eaf76e56e90d56190e3d1cb44`
**Merge parents:** `ced265fd39260ffcea5dff544b160c1bdedc5b4f` (Lane A containment) + `fa6a2a54fb31ab728226a2c25ffbbd8cd471516c` (Lane B alias-hardening)
**Original candidate:** `3225c13a40fd3d4b35cad2714d229611caffcf72`
**Base lineage:** `71b9d4139e00ce1e8ec3ea856e41982e73dfc4d3`; current `main` @ `6a928a17a9ddfca23f66630a0e7c4627d57c7b6c`
**Authoritative spec:** `bst/mod-wspace-assessment:docs/03-project-control/candidates/mod-wspace-gap-assessment-001.md` — Slice S1; boundary rulings B1–B6.
**Files under gate:** `src/control/write-set-policy.mjs`, `tests/write-set-policy.test.mjs` (29 tests), consolidation record `mod-wspace-s1-consolidation-001.md`.
**Method:** neither lane's producer; the prior review verdicts (`REQUEST_CHANGES` at `3225c13`, `APPROVE_WITH_NOTES` at `3225c13`) do NOT transfer. Every binding probe rebuilt first-hand as throwaway scripts and executed against this exact commit in an isolated worktree; blob hashes, iterator instrumentation, parity oracle freshness, full suite, validator, and merge-cleanliness all re-derived, not trusted from producer/consolidation guard claims.

---

## Verdict: **GATE_CLOSED**

The converged candidate closes every finding of the binding Codex `REQUEST_CHANGES / DENY_FAIL_CLOSED` review (`WSPACE-S1-REV-001` alias bypass via Lane B canonical grammar; `WSPACE-S1-REV-002` accessor escape via Lane A fail-closed extraction) and the Claude advisory note `N1` (composed). The slice conforms exactly to S1: pure, unwired, six-code closed deny set, deny-by-default, prohibited-beats-allowed precedence, case-fold on prohibited matching only, `pathSubset` parity against a verified-fresh oracle, deep-frozen outputs, byte-identity of all read files vs `main @ 6a928a1`, full suite 732/727/0/5, validator exit 0, merge-clean except the expected MANIFEST tail conflict. No spec violation and no regression found. No merge, push, wiring, ratification, or production is authorized by this record.

---

## 1. REV-001 closure (alias / prohibited-prefix bypass) — CLOSED

Rebuilt probes against `evaluateWriteSet` at `ae0cf1b` (allowed `["src"]`, prohibited `["src/gateway"]` unless noted):

| Probe | Observed | Required | Result |
|---|---|---|---|
| `src//gateway/secret.mjs` | `DENY_WRITE_SET_MALFORMED` | deny | ✓ |
| `src/./gateway/secret.mjs` | `DENY_WRITE_SET_MALFORMED` | deny | ✓ |
| `src/gateway//` (trailing-separator spelling of a prohibited path) | `DENY_WRITE_SET_PROHIBITED` | deny (PROHIBITED after collapse) | ✓ — trailing separators collapse to canonical form BEFORE matching, so a prohibited path cannot be reached via any alias spelling |
| `src/gateway/x` (plain) | `DENY_WRITE_SET_PROHIBITED` | deny | ✓ |

Novel alias spellings I invented (not present in the producer/consolidation probe tables):

| Novel probe | Observed | Result |
|---|---|---|
| backslash mix `src\.\gateway\x` | `DENY_WRITE_SET_MALFORMED` | ✓ — backslash rejected by `canonicalizePath` (`includes("\\")`) |
| double-backslash interior `src\\gateway\\x` | `DENY_WRITE_SET_MALFORMED` | ✓ |
| NFD-decomposed prefix `src/café/secret` (e + U+0301) vs prohibited NFC `src/café` | `DENY_WRITE_SET_MALFORMED` | ✓ — non-NFC form denied by `normalize("NFC") !== canonical` BEFORE any prefix comparison, so a decomposed spelling can never evade an NFC-composed prohibited bound |

Control: the corresponding NFC candidate `src/café/x` under allowed NFC `src/café` returns `{ ok: true }`, and the same NFD string under any bound returns MALFORMED — confirming the NFD denial is the NFC-guard firing, not an unrelated reject. All alias forms land in a deny; none returns a permissive default. **REV-001 CLOSED.**

## 2. REV-002 closure (hostile property/element access) — CLOSED

Rebuilt per-field with invocation instrumentation:

| Probe | Field(s) | Invocation count | Outcome |
|---|---|---|---|
| throwing property getter | each of candidatePaths / allowedPaths / prohibitedPaths | reads = **1** per field | frozen `DENY_WRITE_SET_MALFORMED`, never thrown |
| Proxy throwing get/has trap (whole input) | — | — | frozen `DENY_WRITE_SET_MALFORMED`, never thrown |
| Proxy throwing get/has trap (array field) | candidatePaths | — | frozen `DENY_WRITE_SET_MALFORMED`, never thrown |
| poisoned `Symbol.iterator` as data property (generator that throws if run) | each field | **iterInvoked = 0** (instrumented — iterator NEVER invoked) | frozen `DENY_WRITE_SET_MALFORMED`, never thrown |
| poisoned `Symbol.iterator` as throwing accessor | candidatePaths | getter read = 1 | frozen `DENY_WRITE_SET_MALFORMED`, never thrown |
| throwing element getter (`defineProperty` on index 0) | each field | elemReads = **1** | frozen `DENY_WRITE_SET_MALFORMED`, never thrown |

Single-read integrity: a benign per-field counting getter is invoked exactly once each (`{candidatePaths:1, allowedPaths:1, prohibitedPaths:1}`). A getter returning a safe array on read 1 and a `../escape` array on read 2 is read exactly once (`n=1`) and the decision reflects only the first snapshot (`{ ok: true }`). The rejection of a tampered iterator is by identity comparison against the module-load-captured `Array.prototype[Symbol.iterator]` — never by invocation. **Invocation-count === 1 per field confirmed; every hostile input yields a frozen structured denial, never a throw. REV-002 CLOSED.**

## 3. N1 closure (Windows trailing-space/dot component collapse) — CLOSED

| Probe | Observed | Required | Result |
|---|---|---|---|
| `src/.. /x` | `DENY_WRITE_SET_MALFORMED` | deny | ✓ |
| `src/foo./x` | `DENY_WRITE_SET_MALFORMED` | deny | ✓ |
| canonical `..` | `DENY_WRITE_SET_TRAVERSAL` | TRAVERSAL preserved | ✓ |
| `src/../x` | `DENY_WRITE_SET_TRAVERSAL` | TRAVERSAL preserved | ✓ |

The code contract is preserved: the canonical `.`/`..` segments are excluded from the collapsible-component check (`isCanonicalDotSegment`), so a real `..` stays classified TRAVERSAL and does not drift to MALFORMED, while trailing-space/dot aliases are denied MALFORMED. Both layers hold (Lane A `hasWindowsCollapsibleComponent` on candidates; Lane B `canonicalizePath` trailing-dot/edge-whitespace rejection on all three lists). **N1 CLOSED.**

## 4. Semantics integrity — PASS

- **Closed deny-code set (all 6 reachable):** `WRITE_SET_DENY_CODES` is frozen and equals exactly `{ABSOLUTE, EMPTY, MALFORMED, OUTSIDE_ALLOWED, PROHIBITED, TRAVERSAL}`. Each reached first-hand: EMPTY (`[]`), MALFORMED (non-array / hostile), TRAVERSAL (`a/../b`), ABSOLUTE (`/etc/passwd`), PROHIBITED (`src/gateway/x`), OUTSIDE_ALLOWED (`docs/x`), plus positive ALLOW (`src/app/x` under `src/app`).
- **Prohibited-beats-allowed precedence:** `src/gateway/x` under allowed `src` + prohibited `src/gateway` → `DENY_WRITE_SET_PROHIBITED` (prohibited loop runs before allowed loop). ✓
- **Case-fold on prohibited matching ONLY:** `src/GATEWAY/x` vs prohibited `src/gateway` → `DENY_WRITE_SET_PROHIBITED` (case-folded). Allowed matching stays EXACT — probe `SRC/app` candidate vs allowed `src/app` (prohibited empty) → `DENY_WRITE_SET_OUTSIDE_ALLOWED`, confirming no permissive case-widening on the allow side. ✓
- **`pathSubset` parity:** the test's `referencePathSubset` mirrors the CURRENT `src/services/context-federation-service.mjs:43-48` source byte-for-byte (verified against live source at `ae0cf1b`, blob `7eb57a2…`). The 14-row parity fixture table passes with ≥4 allow and ≥4 deny rows; because aliases are denied BEFORE matching, the evaluator agrees row-for-row with the oracle on its canonical/well-formed domain (`node --test` row green). ✓
- **Deep-frozen outputs:** every observed result (`{ ok: true }` and every `{ ok: false, code, message }`) is `Object.isFrozen === true`; values are primitives so deep-frozen == frozen. ✓
- **Purity:** static scan of `src/control/write-set-policy.mjs` shows no `import`/`require`, no `Date`/`Math.random`, no `process`/`fs`/`fetch`, no `globalThis` — pure function over caller data. ✓
- **Unwired:** `grep -rn write-set-policy src/ tools/` (excluding the module itself) returns zero importers. ✓

## 5. Byte-identity of read-but-unmodified files vs `main @ 6a928a1` — PASS

Blob-hash compare (`ae0cf1b:$f` vs `6a928a1:$f`), all **IDENTICAL**:

| File | Blob |
|---|---|
| `src/services/context-federation-service.mjs` | `7eb57a289b8331d5576703c5c656624c98f1c029` |
| `src/control/risk-registry.mjs` | `b8ee7f9b979fdb3c5d5261ad0e116ecd7c6a1816` |
| `tools/validate-foundation.mjs` | `082638c16e0c158d01e61ac067d60f0847633895` |
| `package.json` | `6f91499257a6c441558840e2bfd6acb421e2b0a0` |
| `src/services/work-package-service.mjs` | `6b2af450726cef0b7f74601834b4f91c7db19ed2` |
| `contracts/work-package.schema.json` | `b83ac347a1fc15063c858c2c651e3c39a08fc008` |

Relative to its own base `71b9d41`, `ae0cf1b` modifies only `MANIFEST.json` (M) and adds new files (`src/control/write-set-policy.mjs`, `tests/write-set-policy.test.mjs`, 4 candidate docs). The files that appear "modified" in a `6a928a1..ae0cf1b` diff (`runtime-registry.mjs`, `secb-mcp-server-wiring.mjs`, `runtime-registry.test.mjs`, `mcp-server-deployment.test.mjs`, `module-completion-tracker-001.md`) are **main's own post-`71b9d41` advancement**, byte-identical between `ae0cf1b` and `71b9d41` — untouched by this candidate. ✓

## 6. Regression, validator, merge-cleanliness — PASS

| Check | Result |
|---|---|
| `node --test tests/write-set-policy.test.mjs` | **29 / 29 pass, 0 fail, 0 skipped** |
| `npm test` (full suite) | **tests 732 · pass 727 · fail 0 · skipped 5**, exit 0 — exact match to expected 732/727/0/5 |
| `npm run validate` | **exit 0**, 0 `"status": "FAIL"` entries (`PASS`) |
| merge-cleanliness vs `main @ 6a928a1` (`git merge-tree --write-tree`, non-destructive) | merged tree `b3d7f90…`; **only conflicted path = `MANIFEST.json`** (tail-append collision, markers at merged lines 348–366); S1 entries auto-present at lines 175–176; all source files auto-merge. Matches the expected "MANIFEST tail conflict only" — mechanically resolvable by keeping both sides' appended entries. |

## 7. Advisory status fields

```yaml
truth_status: verified_true          # every REV-001/REV-002/N1 closure + all semantics re-reproduced first-hand at ae0cf1b
authority_status: advisory_only
implementation_status: candidate     # fresh gate GATE_CLOSED; converged candidate carries all closures with zero regression
risk_class: low                      # pure, unwired, additive; all findings closed; no live write path consumes it
```

## 8. Self-certification

```yaml
self_certification:
  agent_id: claude-immune-regate-wspace-s1-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> This record certifies advisory re-gate completeness only. `GATE_CLOSED` is a reviewer's advisory finding that the converged candidate at `ae0cf1b` closes the binding `REQUEST_CHANGES` findings and introduces no regression; it is NOT a merge approval, staging authorization, wiring authorization, or production declaration. Operator/governance authority is required for any merge, activation, or adoption. The slice remains pure and unwired; filesystem/symlink resolution and live-service adoption of the evaluator (B1/B3/B4 boundaries, §5 non-goals) remain separately governed. Recommend improvements only. Do not execute them.
