# MOD-OPS Slice S2 — Scorecard Assembler — Independent Immune Review 001

**Record ID:** mod-ops-s2-scorecard-rev-001
**Status:** DRAFT / ADVISORY — NOT EFFECTIVE
**Reviewer identity:** `claude-immune-rev-ops-s2-01` (BST-SA immune, independent review gate)
**Review target:** branch `bst/mod-ops-s2-scorecard` @ `eb9a8c80650e9c97420e9a788e8a241140343baa`
**Declared base:** `main` @ `e4b092d6016cc331d3adf943be97497debd2c85e`
**Current main at review time:** `9648eb1`
**Authoritative spec:** `bst/mod-ops-assessment:docs/03-project-control/candidates/mod-ops-gap-assessment-001.md` — G2 slice S2, boundaries B1/B2/B5, non-goals §5.
**Governance frame:** AMD-002 rev 2 advise-and-proceed; operator-only merge; no push. This record is advisory only; it authorizes nothing.
**Method:** every check below was executed first-hand in an isolated worktree at the target commit (`npm ci`, full `npm test`, standalone validator, byte-blob hashing, scratch `git merge-tree`, and independent adversarial probes written by the reviewer — not the producer's own tests).

---

## Verdict: REWORK_REQUIRED

The scorecard-assembler module itself is **correct, pure, and secure** — it passes every behavioral, atomic-snapshot, and value-discipline check, including independent adversarial TOCTOU probes. **However, the branch as delivered leaves the full test suite RED:** it introduces a cross-file regression that fails a pre-existing S1 test. `npm test` exits non-zero (903 / **897** / **1** / 5), not the 903 / 898 / 0 / 5 the commit message claims. An immune gate cannot pass a branch whose full suite fails without weakening the gate. One blocking finding; fix is small and localized.

---

## Findings by severity

### BLOCKING

**F1 — Full `npm test` is RED: S2 breaks the pre-existing S1 unwired-purity test.**
`tests/kpi-registry.test.mjs:367` — *"purity: nothing in src/ or tools/ imports the registry (unwired)"* — asserts that `git grep -l "ops/kpi-registry" -- src tools` returns zero hits. S2's `src/ops/scorecard-assembler.mjs:8` contains the header-comment string `(src/ops/kpi-registry.mjs)`, which the grep now matches, so the assertion fails:
```
✖ purity: nothing in src/ or tools/ imports the registry (unwired)
  + [ 'src/ops/scorecard-assembler.mjs' ]
  - []
```
Observed full-suite totals: **tests 903 / pass 897 / fail 1 / skipped 5** (`npm test` exit 1). S2's own 37 tests all pass in isolation (`node --test tests/scorecard-assembler.test.mjs` → 37/37/0). The single failure is entirely this S1 guard. This violates the S2 acceptance criteria "`npm test` green" and "no existing test's behavior changes," and contradicts the commit message's stated "903 / 898 / 0 / 5." Root cause is architectural-by-design: S2 is the plan's authorized S1 consumer (the only inter-slice dependency, per assessment §4 sequencing), so the S1 unwired guard *must* be updated to acknowledge `scorecard-assembler.mjs` as the one sanctioned importer (or the guard scoped to exclude it). Renaming the comment to dodge the grep would be a false fix — the module genuinely imports S1. **Required rework:** update `tests/kpi-registry.test.mjs` so the unwired assertion allows the S2 assembler as the authorized consumer, re-run full `npm test` to green, and correct the commit-message test totals. Because the S1 test lives outside S2's declared 3-file scope, that scope must widen by one test file under the same slice — an intentional, reviewable change, not silent drift.

### ADVISORY (non-blocking)

**N1 — Spec mentions injected `now` / `assembledAt`; implementation drops the clock entirely.**
Assessment §S2 sketched `assembleScorecard(input, { now })` with an injected `assembledAt` and `data_untrusted`. The delivered contract is `assembleScorecard({ groupId?, measurements })` with **no** clock at all and `data_untrusted: true` present. This is a *strengthening* — it removes the ambient/injected-clock surface entirely (the purity test grep-asserts no `Date.now`/`new Date`/timers), and it matches the review checklist's groupId-scoped universe design. No action required; recorded for provenance so the deviation from the spec sketch is not mistaken for an omission.

**N2 — Pre-stated MANIFEST-tail merge conflict did not materialize.**
The review brief anticipated a MANIFEST tail conflict against `main @ 9648eb1`. Scratch `git merge-tree --write-tree 9648eb1 eb9a8c8` returned a clean tree (exit 0, no conflict markers). The S1 block (`src/ops/kpi-registry.mjs` … `mod-ops-s1-kpi-registry-rev-001.md`) is the tail of both sides over the shared base `e4b092d`, and S2's two entries append cleanly after it. Reported as a factual correction, not a defect.

---

## Verification detail (all first-hand)

### 1. Scope, unwired, byte-identity, non-mutation — PASS
- **3 files only vs base `e4b092d`:** `git diff --stat e4b092d..eb9a8c8` = `MANIFEST.json (+4/-1)`, `src/ops/scorecard-assembler.mjs` (new, 264 LOC), `tests/scorecard-assembler.test.mjs` (new, 467 LOC). No other file touched. MANIFEST net +2 entries (the two new files).
- **Unwired (zero production importers):** `git grep -n scorecard-assembler -- src tools tests` → only `tests/scorecard-assembler.test.mjs` (import + readFileSync grep-assert). No `src/`/`tools/` consumer.
- **Byte-identity vs base (blob hashes computed by reviewer):**
  - `src/ops/kpi-registry.mjs` — `0e5c855fc62a6fe6354fe3af99056327bc955c26` at both `e4b092d` and `eb9a8c8` — **identical**.
  - `docs/17-operations/02-kpis-and-scorecards.md` — `af74a4cc83afa2be40ebf2e12ff3539dafecc8c6` at both — **identical**.
  - `src/ops/scorecard-assembler.mjs` — absent at `e4b092d` (new file) — as expected.
- **Registry never mutated:** assembler consumes `KPI_CATALOG` (read via `.map`, `new Set`) and `listKpisByGroup` (read result only). `KPI_CATALOG` is frozen, length 24 (probe). No write path.

### 2. Missing-vs-zero semantics — PASS (independent probes)
| Probe | Result |
|---|---|
| empty `measurements` → all 24 entries `status:"missing"`, no `value` key, 24 findings | PASS |
| `{kpiId:P, value:0}` (real zero) → `status:"measured"`, `value:0`, `value` key present | PASS |
| KPI absent from measurements → `{status:"missing"}` entry + matching finding, no invented value | PASS |

### 3. Registry composition / prototype-key parity — PASS
- Universe = 24 catalog when `groupId` absent; the scoped 6 when a valid `groupId` supplied (`groupId:null` vs scoped id echoed back).
- Membership via `Set` of live registry ids ⇒ prototype keys are misses: `__proto__`, `constructor`, `toString`, `hasOwnProperty` → `DENY_KPI_UNKNOWN`. Cataloged-but-out-of-scope id (`delivery.*` under `groupId:"platform"`) → `DENY_KPI_UNKNOWN`. Bad `groupId` incl. `"__proto__"` → `DENY_GROUP_UNKNOWN`. Oracle is the live `src/ops/kpi-registry.mjs` module (imported, not a fixture copy).

### 4. Atomic snapshot / cross-field TOCTOU — PASS (independent probes)
- Shifty `value` getter (finite on read 1, `NaN` on read 2): **1 read**, `ok:true`, stored value `4` — decision bound to first snapshot; no second read exists to poison.
- Shifty `kpiId` getter (valid on read 1, `"attacker.bogus"` on read 2): **1 read**, measured id = first snapshot.
- Non-throwing Proxy element with per-access-varying `kpiId`: **1 access**, first-snapshot binding.
- Throwing `kpiId`/`value` getters and throwing-trap Proxy at input and element level → contained `DENY_SCORECARD_MALFORMED`, never throws.
- Sibling side-effect getter (kpiId setting its own `value` to `Infinity`) → deterministic contained `DENY_SCORECARD_MALFORMED`, no partial assembly.
- Mechanism verified in source: `snapshotInput` reads `groupId`/`measurements` once each in one try/catch with a defensive `.slice()`; `snapshotMeasurement` reads `kpiId`/`value` once each; Phase B binds only to captured `snap.*`.

### 5. Value discipline — PASS
Only finite numbers measured. `NaN`, `Infinity`, `-Infinity`, string, bigint, boolean, `null`, object, array, function → `DENY_SCORECARD_MALFORMED` with a `value`-detail message; never coerced. Duplicate ids → `DENY_SCORECARD_MALFORMED` (not silent last-wins). Atomic first-offender denial confirmed: a valid measurement followed by an unknown id yields a whole-input `DENY_KPI_UNKNOWN`, no partial scorecard. Deep-frozen success and denial outputs; mutation attempts throw (probe: result/scorecard/entries/entry all frozen).

### 6. Regression / validator / merge — MIXED
- **Full `npm test`: FAIL** — 903 / 897 / 1 / 5, exit 1 (see F1).
- **`npm run validate` (`node tools/validate-foundation.mjs`): PASS, exit 0**, status `PASS`, 369 unique manifest paths.
- **Merge-cleanliness vs `main @ 9648eb1`:** `git merge-tree --write-tree` clean, exit 0, no conflict (see N2).

---

## Advisory status fields

```yaml
truth_status: verified_true          # every result read/executed first-hand at eb9a8c8 in an isolated worktree
authority_status: advisory_only
implementation_status: blocked       # blocking regression F1 — full suite red; not merge-ready as delivered
risk_class: medium                   # assembler code is sound; blocker is a red suite (quality gate), not an authority/security breach
```

```yaml
self_certification:
  agent_id: claude-immune-rev-ops-s2-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Recommend improvements only. Do not execute them. This review neither merges nor authorizes merge; the blocking finding F1 must be reworked and the full suite returned to green before an operator considers integration.
