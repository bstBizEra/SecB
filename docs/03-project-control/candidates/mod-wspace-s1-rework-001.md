# MOD-WSPACE S1 — Write-Set Containment Evaluator — Rework 001 (findings closure)

**Record ID:** mod-wspace-s1-rework-001
**Status:** ADVISORY — NOT EFFECTIVE
**Producer:** claude-motor-wspace-s1-rework-01 (BST-SA motor)
**Date:** 2026-07-21
**Base commit (reworked from):** `3225c13a40fd3d4b35cad2714d229611caffcf72` (`[MOD-WSPACE-S1] Write-set containment evaluator (pure, unwired)`)
**Branch:** `bst/mod-wspace-s1-write-set`
**Files changed (this rework):** `src/control/write-set-policy.mjs`, `tests/write-set-policy.test.mjs`, `docs/03-project-control/candidates/mod-wspace-s1-rework-001.md`, `MANIFEST.json`
**Reviews addressed:**
- BINDING — `codex/rev/mod-wspace-s1-001:docs/03-project-control/candidates/mod-wspace-s1-rev-001.md` — verdict `REQUEST_CHANGES / DENY_FAIL_CLOSED`.
- ADVISORY — `claude/rev/wspace-s1-001:docs/03-project-control/candidates/mod-wspace-s1-write-set-rev-001.md` — verdict `APPROVE_WITH_NOTES` (single note N1).

---

## 1. Scope of this rework

This rework closes the **fail-closed extraction** finding (Codex `WSPACE-S1-REV-002`) and the **Windows component-collapse** note (Claude `N1`). It is intentionally confined to `src/control/write-set-policy.mjs` and `tests/write-set-policy.test.mjs` (plus this record and its MANIFEST entry). The slice remains **pure and unwired**: no import of the evaluator was added anywhere; no filesystem, clock, network, or persistence was introduced.

The Codex **BLOCKING** finding `WSPACE-S1-REV-001` (non-canonical path aliases — repeated separators `src//gateway` and interior `src/./gateway` bypassing prohibited prefixes) is **NOT** closed here. It is being reworked in parallel on `codex/rework/mod-wspace-s1-002` (`[TASK-009] Close MOD-WSPACE S1 path alias bypasses`). This record does not claim to close it; a converged successor that carries both closures must be independently re-reviewed at its new exact commit. See §5.

## 2. Findings-closure map

| Review | Finding | Sev | Disposition here | Where |
|---|---|---|---|---|
| Codex REV | `WSPACE-S1-REV-001` — non-canonical path aliases (`//`, `/./`) bypass prohibited prefixes | BLOCKING | **NOT CLOSED here** — owned by parallel `codex/rework/mod-wspace-s1-002`; out of this rework's declared scope | — |
| Codex REV | `WSPACE-S1-REV-002` — hostile property access escapes structured-denial boundary | MEDIUM | **CLOSED** | `src/control/write-set-policy.mjs` fail-closed extraction; 6 new fail-closed tests |
| Claude REV | `N1` — Windows trailing-space/dot component collapses (`.. ` → `..`) | LOW | **CLOSED** | `src/control/write-set-policy.mjs` collapsible-component check; 2 new N1 tests |
| Claude REV | `N2` — encoded/unicode/`....//` lookalikes ALLOW as literal names | INFO | No change (correct for a literal-path evaluator; reviewer marked INFO) | — |
| Claude REV | `N3` — `file:`-scheme string denied via `…_OUTSIDE_ALLOWED` not `…_ABSOLUTE` | INFO | No change (still fail-closed; code-choice only) | — |

## 3. `WSPACE-S1-REV-002` — fail-closed extraction (CLOSED)

**Defect at `3225c13`:** `evaluateWriteSet` destructured `candidatePaths` / `allowedPaths` / `prohibitedPaths` directly from `input` and then iterated them with `for…of`, `.every`, and `.map`. A throwing property getter, a Proxy get trap, a throwing array-element accessor, or a poisoned `Symbol.iterator` propagated an exception out of the function instead of returning the promised frozen structured denial. Reproduced: an input whose `candidatePaths` getter throws `getter boom` threw rather than returning `DENY_WRITE_SET_MALFORMED`.

**Fix (containment approach):**

1. **Read each field exactly once.** After the plain-object gate, the three fields are destructured from `input` a single time into locals, inside one `try`. A `get`-counting probe test asserts each getter is invoked **exactly once**; a "returns-a-different-array-on-second-read" probe proves that repeated-read attacks cannot influence the decision because only the first snapshot is ever consulted.
2. **Snapshot each array defensively, before any validation.** `snapshotArray(value)`:
   - gates on `Array.isArray` (array-likes / Proxies-of-non-arrays → sentinel `NOT_ARRAY` → malformed denial);
   - rejects a **tampered iterator** — `value[Symbol.iterator] !== Array.prototype[Symbol.iterator]` (captured once at module load) → malformed — so a poisoned `Symbol.iterator` is neither trusted **nor invoked**;
   - reads `length` once and copies each index exactly once via `[[Get]]` into a fresh own-data array (no iterator protocol, no element read repeated).
3. **Single guard converts every throw to a denial.** The destructure and the three `snapshotArray` calls sit inside one `try/catch`. Any throw from a hostile getter, Proxy trap, or throwing iterator/element accessor lands in the `catch` and returns `Object.freeze({ ok:false, code:'DENY_WRITE_SET_MALFORMED', … })`. All subsequent validation runs over the plain snapshots, so no later step can re-trigger a hostile accessor.

**Invocation-count probe result:** with a getter incrementing a counter on each of the three fields, the counter is **1** for each after a full evaluation (asserted, green).

**New regression tests (6):** throwing getter on each of the three fields; Proxy with throwing get/has traps (wrapping the whole input and wrapping an array field); array with a throwing element getter via `Object.defineProperty` on an index; getter invoked exactly once; getter returning different arrays on repeated reads (single-read makes it irrelevant); poisoned `Symbol.iterator` as both a data override and a throwing accessor. Every case asserts `DENY_WRITE_SET_MALFORMED`, a frozen result, and `assert.doesNotThrow`.

## 4. Claude `N1` — Windows component-collapse (CLOSED)

**Hazard:** on Windows a path component with a trailing space or dot is normalized away by the filesystem (`foo.`→`foo`, `.. `→`..`, `...`→ current-dir), so the literal string the evaluator validates can resolve to a different on-disk target; the `.. ` case is a parent escape that the exact-`..` traversal check misses.

**Fix:** a candidate component that ends in a space or dot is denied. The canonical dot-segments `"."` and `".."` are excluded from this check — `".."` remains handled by the traversal check as `DENY_WRITE_SET_TRAVERSAL`, and `"."` is a benign current-dir reference — so the existing traversal contract is unchanged.

**Deny-code choice — `DENY_WRITE_SET_MALFORMED` (not `DENY_WRITE_SET_TRAVERSAL`).** Documented rationale: (a) the offending string is not a literal `..` segment (`".. " !== ".."`), so classing it as TRAVERSAL would overload that code and diverge from the `context-federation-service.mjs` `pathSubset` semantics that the parity and byte-identity guard tests pin; (b) a non-OS-canonical component is fundamentally a caller-precondition / well-formedness violation — the same class as blank and null-byte entries, which already return `DENY_WRITE_SET_MALFORMED`. The check is therefore placed at the malformed-input stage, after entry-cleanliness and before traversal.

**New regression tests (2):** `src/.. /x`, `src/foo /x`, `src/foo./x`, `src/.../x`, `src/bar. `, `src/baz ` → all `DENY_WRITE_SET_MALFORMED`; plus a boundary test asserting canonical `..` still returns `DENY_WRITE_SET_TRAVERSAL`, `..foo` is unaffected, and ordinary dotted names (`write-set-policy.mjs`) still ALLOW.

## 5. Preservation checks (re-run first-hand)

| Invariant | Result |
|---|---|
| All 6 deny codes present, `WRITE_SET_DENY_CODES` frozen closed set | PASS (test unchanged, green) |
| Deny-by-default precedence; prohibited beats allowed | PASS (unchanged) |
| `pathSubset` config-equivalence parity vs live `context-federation-service.mjs` | PASS — parity table is well-formed inputs only; N1/extraction changes do not touch those rows |
| Byte-identity guard (`context-federation-service.mjs`, `risk-registry.mjs`, `validate-foundation.mjs`, `package.json` vs `main`) | PASS — none modified |
| Deep-frozen `{ok:true}` / `{ok:false,…}` outputs | PASS — new denials use the same `deny()`/`ALLOW` frozen constructors |
| Purity — no I/O, clock, persistence, transport; still unwired | PASS — `grep` for an import of the evaluator returns zero outside the module/test |
| Existing 17 tests pass unmodified | PASS — no existing test edited; none asserted throwing behavior |

**Test totals (this worktree):**
- `node --test tests/write-set-policy.test.mjs`: **tests 25 · pass 25 · fail 0 · skipped 0** (17 existing + 8 new).
- `npm test`: **tests 728 · pass 723 · fail 0 · skipped 5** (baseline 720/715/0/5 + 8 new).
- `npm run validate`: **exit 0** (`PASS`).

## 6. Advisory status fields

```yaml
truth_status: verified_true          # both closed findings reproduced at 3225c13 then re-verified fixed first-hand
authority_status: advisory_only
implementation_status: partial       # closes REV-002 + N1; BLOCKING REV-001 remains open (parallel rework codex/rework/mod-wspace-s1-002)
risk_class: medium                   # binding review's BLOCKING finding is not closed by THIS branch; a converged successor must carry both and be re-reviewed
```

## 7. Self-certification

```yaml
self_certification:
  agent_id: claude-motor-wspace-s1-rework-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> This record certifies advisory rework completeness for the REV-002 and N1 closures on `bst/mod-wspace-s1-write-set`. It authorizes no merge, no wiring, and no production. The binding Codex `REQUEST_CHANGES / DENY_FAIL_CLOSED` verdict does not transfer to this rework; a successor commit — ideally one that also carries the parallel `WSPACE-S1-REV-001` path-alias closure — must be independently re-reviewed at its new exact commit before acceptance. Recommend improvements only. Do not execute them.
