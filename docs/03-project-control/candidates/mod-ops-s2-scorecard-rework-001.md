# MOD-OPS Slice S2 — Scorecard Assembler — Rework 001 (guard-widening)

**Record ID:** mod-ops-s2-scorecard-rework-001
**Status:** DRAFT / ADVISORY — NOT EFFECTIVE
**Producer identity:** `claude-motor-ops-s2-rework-01` (BST-SA motor, execution planning + implementation prep)
**Rework target:** branch `bst/mod-ops-s2-scorecard`, on top of `eb9a8c80650e9c97420e9a788e8a241140343baa`
**Closes review finding:** F1 (BLOCKING) of `mod-ops-s2-scorecard-rev-001.md` (`claude-immune-rev-ops-s2-01`)
**Authoritative spec:** `bst/mod-ops-assessment:docs/03-project-control/candidates/mod-ops-gap-assessment-001.md` — G2 slice S2, §4 sequencing (S2 composes over S1), §5 non-goals.
**Governance frame:** AMD-002 rev 2 advise-and-proceed; operator-only merge; no push. Advisory only; authorizes nothing.

---

## 1. What was reworked and why

Review `mod-ops-s2-scorecard-rev-001` returned **REWORK_REQUIRED** on a single BLOCKING finding, F1: the delivered S2 branch left the FULL suite RED. The ratified S1 test `tests/kpi-registry.test.mjs` contains an "unwired purity" guard that asserted the KPI registry had ZERO importers anywhere in `src/` and `tools/`. S2's `src/ops/scorecard-assembler.mjs` is the registry's FIRST legitimate consumer — the single inter-slice dependency authorized by the OPS gap assessment (§4 sequencing: S2 *composes over* S1). The registry is S2's KPI vocabulary source. So the S1 zero-importer guard now fails, and full `npm test` exits non-zero.

The review's own root-cause analysis is explicit: this is architectural-by-design, and "renaming the comment to dodge the grep would be a false fix — the module genuinely imports S1." The correct fix is to widen the S1 guard to acknowledge the one sanctioned consumer.

**Scope of this rework (exactly what the review prescribed):**
- Edited `tests/kpi-registry.test.mjs` — the one unwired-guard test only.
- Added this rework record.
- Registered this record in `MANIFEST.json`.
- **`src/ops/scorecard-assembler.mjs` and `tests/scorecard-assembler.test.mjs` were NOT touched** — the review certified the module correct, pure, and secure. This rework changes NO production code.

Because the edited S1 test lives outside S2's original 3-file delivery scope, this is a deliberate, reviewable **one-test-file scope widening under the same slice** — recorded here so it is not mistaken for silent drift.

## 2. Grep-match finding (requested proof)

The old guard ran `git grep -l "ops/kpi-registry" -- src tools`. Verified first-hand at `eb9a8c8`:

- `git grep -n "ops/kpi-registry" -- src/ops/scorecard-assembler.mjs` matches **line 8 ONLY** — the module's header COMMENT `// (src/ops/kpi-registry.mjs)`.
- The genuine ESM dependency is on **line 50**: `import { KPI_CATALOG, listKpisByGroup } from "./kpi-registry.mjs";`. That path is **relative** (`./kpi-registry.mjs`) and has **no `ops/` segment**, so it does NOT match the substring `ops/kpi-registry`.

**Conclusion — why comment-removal is a false fix and guard-widening is the honest fix:** under the old pattern, deleting the header comment would have made the file drop off the grep and "passed" the guard — while the file still genuinely imports the registry via line 50. That would be dishonest: the wiring edge is the `import` statement, not the comment. Proof the import itself is a real, detectable edge: `git grep -n "kpi-registry.mjs" -- src tools` matches **both** line 8 (comment) AND line 50 (the import). Any real import-detecting guard therefore flags the assembler regardless of the comment. The rework makes the guard a real import detector (see §3) rather than removing the comment.

Additional verified fact: `src/ops/kpi-registry.mjs` contains **no self-reference** to the string `kpi-registry` — so the registry's own file never appears as a false "importer"; the exclusion in the new guard is defensive robustness, not a required correction.

## 3. Guard-update approach (governed widening, strictly more precise)

The one test — previously "purity: nothing in src/ or tools/ imports the registry (unwired)" — is rewritten to "purity: the registry's only sanctioned importer is the S2 scorecard-assembler (otherwise unwired)". The new guard:

1. **Enumerates actual importers** across `src` + `tools` using the module BASENAME pattern `git grep -l "kpi-registry" -- src tools`. The basename catches every real import form (`./kpi-registry.mjs`, `../ops/kpi-registry.mjs`, `src/ops/kpi-registry.mjs`) regardless of importer location — unlike the old `ops/kpi-registry` substring, which missed the relative import.
2. Drops the registry's own file (`src/ops/kpi-registry.mjs`) — a module is not an importer of itself.
3. **Asserts the importer set ⊆ `{ src/ops/scorecard-assembler.mjs }`** — i.e. computes `unsanctioned = importers \ SANCTIONED` and asserts it is empty, **failing loudly with the offending path list** if ANY other file imports the registry.
4. **Asserts the sanctioned consumer's edge is a REAL import** via `/import\s+[^;]*from\s+["'][^"']*kpi-registry\.mjs["']/` on the assembler source — so the guard tracks an actual wiring edge and cannot be satisfied by a comment alone.

**Why this is strictly more precise, not weaker:** the old assertion was `importers == []`. The new assertion is `importers ⊆ {scorecard-assembler}` AND `scorecard-assembler actually imports the registry`. It still fails on ANY unsanctioned importer (the registry stays unwired to every live / gateway / report path), it now also fails if the sole allowed edge is faked as a mere mention, and it uses a broader detection pattern that would have caught the very relative-import the old pattern missed. The premise "zero importers" was correct at S1 and is superseded — not relaxed — by the one authorized S2 consumer.

The sibling S1 purity test — "purity: module imports nothing and references no I/O, clock, or timers" (asserting `kpi-registry.mjs` has no `import`/`require`, no `fs`/`child_process`/`fetch`/`Date`/timers/`process.`) — is **unchanged**; the registry itself remains provably pure and side-effect-free.

## 4. Verification (first-hand, at the rework commit)

| Check | Result |
|---|---|
| `node --test tests/kpi-registry.test.mjs` | 23 / 23 / 0 (widened guard passes) |
| `npm run validate` (`node tools/validate-foundation.mjs`) | status PASS, **exit 0** |
| Full `npm test` | **tests 903 / pass 898 / fail 0 / skipped 5, exit 0** — GREEN |
| `src/ops/scorecard-assembler.mjs` touched? | NO |
| `tests/scorecard-assembler.test.mjs` touched? | NO |

The 903 / 898 / 0 / 5 result now matches the totals the original S2 commit message claimed and that the review found unmet.

## 5. Advisory status fields

```yaml
truth_status: verified_true          # every result read/executed first-hand at the rework commit in an isolated worktree
authority_status: advisory_only
implementation_status: partial       # F1 closed and full suite green; operator merge still required
risk_class: low                      # test-only guard widening; no production code changed; strictly more precise assertion
```

```yaml
self_certification:
  agent_id: claude-motor
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Recommend improvements only. Do not execute them. This record neither merges nor authorizes merge; an operator must review and integrate. The full suite is green and validator exit 0 at the rework commit.
