# Independent Review: Reconciliation main x bst/integration-rehearsal-3 (REV-001)

- review_id: MOD-INTEG-001-REV-001
- status: CANDIDATE (advisory review; operator ratification still required)
- reviewer: claude-immune-rev-reconcile-01 (BST-SA immune agent, independent identity)
- producer_reviewed: claude-motor (record `reconciliation-main-x-rehearsal3-001.md`)
- review_branch: `claude/rev/reconcile-main-x-rehearsal3` (created FROM `bst/reconcile-main-x-rehearsal3`)
- merge_commit: `76d59e2dd296abfd763bece5bc8f6711e0eedaff` (parents: main `6b47cf1`, rehearsal-3 `1c77958`)
- record_commit_reviewed: `4349e518a8373c9743001eea9f2da597113c9bac`
- merge_base: `6152897`
- governance: AGENTS.md + SECB-AGENTS-AMD-002 rev 2 (non-main branch, no push, no merge)
- date: 2026-07-20

All findings below were reproduced first-hand in an isolated worktree; no producer
measurement was taken on trust.

## Findings table

| # | Check | Method | Result | Verdict |
| --- | --- | --- | --- | --- |
| 1 | Merge integrity vs each parent | `git diff --name-status` main->merge and reh3->merge; content spot-check of 20 files | 0 deletions vs main, 0 deletions vs reh3. Only 2 files differ from BOTH parents: `MANIFEST.json` and `tools/validate-foundation.mjs` (the expected merge-resolved pair). All other changed files are verbatim from one parent. 10 main-side + 10 reh3-side spot-checked files match their parent byte-for-byte. Merge introduces nothing beyond the two parents. | PASS |
| 2 | MANIFEST union property | Scripted set comparison of `files[]` across both parents, merge, and `git ls-tree` | merge = 237 entries = exact union of main (170) + reh3 (187). 0 duplicates, 0 parent entries missing, 0 entries beyond the union, 0 listed-but-untracked. Only tracked-but-unlisted file is `MANIFEST.json` itself (self-reference, same convention as both parents). | PASS |
| 3 | Validator composition | Token scan of each parent + merge validator; execution | Merged `tools/validate-foundation.mjs` contains BOTH main's `SANCTIONED_REMOTES` allowlist AND rehearsal-3's expanded 11-schema fail-closed set. Main contributed the remotes guard (reh3 had none); reh3 contributed the 4 extra schema checks (main had 7). Stale `git.local-only` guard from reh3 correctly dropped (0 occurrences in merge). Runs exit 0. | PASS |
| 4 | Test accounting + superset | `npm ci` then `node --test tests/*.test.mjs` on merge, main, and record tip | Merged tree: 248 tests / 243 pass / 0 fail / 5 skip, exit 0, 19 test files — matches producer 248/243/0/5. Superset property: the two reh3-modified existing test files verified at test-name level. `conformance-stubs`: only base name not carried verbatim is the documented V-011 split ("...events" -> "...(storage plane)" [still skipped/BLOCKED] + "V-011 display plane" [implemented]); `contract-validator`: 3 names identical. Main @6b47cf1 independently measured 152/139/0/13; merged skip fell 13->5 = 8 formerly-blocked stubs implemented, as claimed. | PASS |
| 5 | Governance surfaces | `git show` AGENTS.md tail; `git ls-tree` for `*AGENTS.md`; docs/README.md head | Root `AGENTS.md` ends with SECB-AGENTS-AMD-002 rev 2 (Advise-and-proceed rule + Retained hard gates). `docs/README.md` is the merged two-pack index (OM v0.1 + Phase 0 constitution). Only two `AGENTS.md` files tracked (root + `docs/`), identical path set to base — no `*AGENTS.md` appeared at any new path. | PASS |
| 6 | Producer record accuracy | Cross-check every quantitative claim in `reconciliation-main-x-rehearsal3-001.md` | All claims reproduced: MANIFEST 170/187/237, 0 dups/missing/extra; validator PASS 481 checks / 237 paths on merge commit; test tables (main 152/139/0/13, merged 248/243/0/5); V-011 split narrative; "no `src/gateway/**` or `tools/secb*`" (confirmed absent); 0 conflicts / 0 drops / 0 renames. No discrepancies. | PASS |

## Discrepancies vs producer claims

None material.

One reconcilable numeric nuance, not a defect: the producer's validator figures
(481 checks, `manifest.unique` = 237 paths) are measured at the **merge commit**
`76d59e2`. Running the validator at the **record commit** `4349e51` (which the
producer's own record commit creates by adding `reconciliation-...-001.md` to
MANIFEST) yields 482 checks / 238 paths. The +1 is exactly the reconciliation
record the producer added; both figures are internally consistent and I confirmed
481/237 directly against `76d59e2`. This review commit adds one further candidate
file, so the post-edit validator count rises by one again (see below).

## Verdict

**APPROVE_FOR_OPERATOR_MERGE**

The CANDIDATE unified base on `bst/reconcile-main-x-rehearsal3` is a clean,
loss-free true merge of the two divergent lineages:
- Zero deletions relative to either parent; only the two legitimately-overlapping
  files (`MANIFEST.json`, `tools/validate-foundation.mjs`) carry merge-resolved
  content, and both resolutions are correct compositions/unions.
- MANIFEST is a verified exact union; validator composes both governance
  requirements and exits 0; the full 248-test suite passes with the superset
  property intact (V-011 split accounts for the only non-verbatim base test name).
- All `main` governance content (AMD-002 rev 2, OM v0.1 docs pack,
  sanctioned-remotes validator) and all rehearsal-3 P0 program content are intact.
- The producer's record is accurate; no claim failed verification.

Authority boundary preserved: this is an advisory review only. Operator ratification
and the operator-controlled merge to `main` remain required and were not performed.
No push, no merge, no configuration change was made by this reviewer.

```yaml
self_certification:
  agent_id: claude-immune-rev-reconcile-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
