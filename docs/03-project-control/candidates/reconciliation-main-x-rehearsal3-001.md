# Reconciliation Record: main x bst/integration-rehearsal-3 (001)

- record_id: MOD-INTEG-001-RECONCILIATION-001
- status: CANDIDATE (operator ratification required)
- branch: `bst/reconcile-main-x-rehearsal3`
- merge_commit: `76d59e2dd296abfd763bece5bc8f6711e0eedaff`
- prepared_by: claude-motor (BST-SA motor agent)
- governance: AGENTS.md + SECB-AGENTS-AMD-002 advise-and-proceed (non-main branch, no push, no merge to main)
- module_loop_ref: `docs/03-project-control/candidates/module-completion-tracker-001.md` (iteration 1, MOD-INTEG)
- date: 2026-07-20

## 1. What was merged

Two divergent SecB lineages, both descending from the shared base
`6152897` ("[P0-08-REWORK] Close integration REV findings"):

| Side | Tip | Content since base |
| --- | --- | --- |
| `main` | `6b47cf1` | AMD-002 AGENTS.md revision, OM v0.1 docs pack (sections 10-17, ADR 0005-0007, `docs/source/om-v0.1/`, templates), sanctioned-remotes validator (`fa54862` lineage). Docs and validator only; no `src/` or `tests/` changes since base. |
| `bst/integration-rehearsal-3` | `1c77958` | Full delivered P0 program: P0-09 work-package auth service, TE hardening, P0-14 temporal ledgers + 4 schemas, skill resolver, P0-17 report generator, P0-11 HandoffService, P0-10 R2 ContextFederationService, P0-21 MCP server (`src/mcp/`), reserved-delimiters module, candidate/disposition records, 248-test suite. No AGENTS.md or OM-docs changes. |

The divergence was disjoint except for two files modified on both sides:
`MANIFEST.json` and `tools/validate-foundation.mjs`. Git auto-merged both;
each auto-merge was then manually verified (section 2). Zero textual
conflict markers were produced. Neither side contains `src/gateway/**` or
`tools/secb*` (checked explicitly per the mission brief); the "gateway
core seed" referenced in earlier planning lives in the shared base's
service stack, so there was nothing main-only to protect beyond docs,
AGENTS.md, and the validator.

## 2. Resolution table (per overlapping or policy-relevant file)

| File / area | Both sides changed? | Resolution | Rationale | Verification |
| --- | --- | --- | --- | --- |
| `MANIFEST.json` | Yes | Union of both file lists | Rule (a): every file from both sides listed once | Scripted check: merged list = exact union (170 main + 187 r3 = 237 unique), 0 duplicates, 0 listed-but-absent, 0 union entries missing, 0 extra entries. Only tracked-but-unlisted file is `MANIFEST.json` itself (self-reference, same as both parents). |
| `tools/validate-foundation.mjs` | Yes | Composition of both changes (disjoint hunks) | Rule (d): keep main's sanctioned-remotes allowlist (`fa54862` lineage) — retained verbatim. Rehearsal-3's change is a different hunk (expanded fail-closed 11-schema set check) and is required because the union MANIFEST carries r3's 4 new schemas; dropping it would fail the merged tree. Both intents preserved. | Diff inspection pre-merge confirmed disjoint regions; validator PASS on merged tree (481 checks, 0 fail). |
| `AGENTS.md` | No (main only) | main's version (AMD-002) | Rule (e). Rehearsal-3 did not modify AGENTS.md, so no additive reconciliation was needed. | `git diff 6152897 bst/integration-rehearsal-3 -- AGENTS.md` empty. |
| `src/**`, `tests/**`, `tools/generate-ops-report.mjs`, `tools/run-secb-mcp-server.mjs`, `contracts/*.schema.json` (4 new) | No (r3 only) | rehearsal-3's versions | Rule (b): main's copies (where they exist) are the ancestor `6152897` versions; r3's are their reviewed descendants. Main-only additions: none exist under `src/` since base. | Name-status diffs both directions; no deletions on either side. |
| Docs: OM v0.1 pack (`docs/10-*` … `docs/17-*`, `docs/adr/0005-0007`, `docs/source/om-v0.1/`, `docs/templates/*`, `docs/00-governance/*`) | No (main only) | main's versions kept | Rule (c): union of doc packs. | Present in merged tree; MANIFEST union covers all. |
| Docs: candidate/disposition records (`docs/03-project-control/candidates/*`), `docs/09-delivery/backlog-p0.md` | No (r3 only) | rehearsal-3's versions kept | Rule (c): union of doc packs. | Present in merged tree; MANIFEST union covers all. |
| `package.json`, `package-lock.json`, `VERSION` | Neither side changed since base | base version (0.3.0-alpha.0) | No conflict existed. | `version.package` / `version.manifest` checks PASS. |

Textual merge conflicts requiring manual conflict-marker resolution: **0**.
Files dropped from either side: **0**. Files renamed: **0**.

### Test-file reconciliation notes

No duplicate-filename/different-content collisions occurred. Two shared
test files were modified by rehearsal-3 only:

- `tests/conformance-stubs.test.mjs` — r3 evolved 13 base test names into
  18. The one base name not carried verbatim, "V-011 redaction: data
  classification enforcement on events", was **split, not dropped**: it
  became "V-011 ... (storage plane)" (still skipped/BLOCKED on the P0-08
  security policy surface) plus an implemented "V-011 display plane"
  test (unblocked by P0-17). Both behaviors retained; strict superset.
- `tests/contract-validator.test.mjs` — same 3 test names on both sides;
  r3 version is the reviewed descendant.

## 3. Check results (merged tree, exact)

- `node tools/validate-foundation.mjs` — **PASS, exit 0**; 481 checks, 0 failures; version 0.3.0-alpha.0; `manifest.unique` = "237 unique paths"; `git.remote.sanctioned.origin` PASS against the allowlist.
- `node --test tests/*.test.mjs` — **exit 0**; 248 tests, 243 pass, 5 skipped (BLOCKED conformance stubs), 0 fail, 0 cancelled, 19 test files.

Both-sides accounting (measured in clean worktrees of each tip, after `npm ci`):

| Tree | tests | pass | fail | skipped |
| --- | --- | --- | --- | --- |
| `main` @ 6b47cf1 | 152 | 139 | 0 | 13 |
| `bst/integration-rehearsal-3` @ 1c77958 | 248 | 243 | 0 | 5 |
| merged @ 76d59e2 | 248 | 243 | 0 | 5 |

The merged total equals rehearsal-3's because main added no tests after
the shared base; every main test is present in the merged suite (the two
r3-modified files are verified supersets, see section 2), and skipped
count fell 13 → 5 because r3 implemented 8 formerly-blocked stubs.

## 4. Readiness statement for the operator

This record supersedes the stale fast-forward-based promotion-readiness
assessment: `main` moved past the rehearsal-3 fork point (OM v0.1 pack +
sanctioned-remotes validator), so a fast-forward is no longer possible
and a true merge was required.

The CANDIDATE unified base on `bst/reconcile-main-x-rehearsal3` is ready
for operator review with the following properties:

1. All governance content from `main` is intact (AMD-002 AGENTS.md, OM v0.1 docs pack, sanctioned-remotes validator).
2. All delivered P0 program content from rehearsal-3 is intact (services, ledgers, MCP server, schemas, records, full test suite).
3. Nothing was dropped or renamed from either side; MANIFEST is a verified exact union.
4. Validator exits 0 and the full 248-test suite passes on the merged tree.

Remaining operator actions (not performed by this agent, per AMD-002):
review this record, ratify the reconciliation, and merge
`bst/reconcile-main-x-rehearsal3` to `main` via the operator-controlled
process. No push has been performed.

```yaml
self_certification:
  agent_id: claude-motor
  peer_agent_id: codex-motor
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
