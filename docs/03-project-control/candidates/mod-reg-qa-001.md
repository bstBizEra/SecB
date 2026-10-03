# MOD-REG Independent QA Pass (QA-001)

- record_id: mod-reg-qa-001
- status: CANDIDATE (advisory QA record; operator ratification required — no push, no merge, no execution authority exercised)
- reviewer_identity: claude-qa-modreg-independent-01 (BST-SA worker agent, second cross-provider check)
- reviewer_role: immune-adjacent QA (BST-SA advisory; this pass is deliberately independent of, and additional to, Codex's own QA lane on this same commit)
- producer_lane: codex-motor (`codex/mod-reg/registry-services-001/002/003`, agent_id `/root`)
- prior_reviews_read: `docs/03-project-control/candidates/mod-reg-xprov-rev-001.md` @ `8eef154` (Claude Fable 5, `claude/rev/mod-reg-xprov`, verdict `APPROVE_FOR_QA_GATE`)
- frozen_target_commit: `09d686c64f4bb3d8cd053f91b5f443b0ad69f811` ("[MOD-REG-001] Remove unbound project scope alias") — unchanged from the cross-provider review's target
- parent_base_commit: `a8ef0d1668ded92181f11e15d56147eef2868bc4` (PR #9, MOD-MCP deployment integration)
- distinct_from_codex_qa: Codex's own QA lane runs in a separate, locked worktree (`SecB-worktrees/codex-qa-mod-reg-001-09d686c`) at the same commit. That worktree was not touched, read, or written by this pass. This record is an independent, additional cross-provider QA opinion, not a substitute for or an inheritance of Codex's QA verdict.
- worktrees_used (this pass, all ephemeral/isolated): `SecB-worktrees/claude-qa-mod-reg-001-09d686c-independent` (frozen target, test/read/probe execution), `SecB-worktrees/claude-qa-mod-reg-verify-cad7c20` (temporary, created solely to re-measure the validator at the prior lineage commit for F-CNT, removed after use)
- method: first-hand only. No prior claim (Codex's or the reviewer's) was taken on trust; every number below was produced by an `npm install` + `npm test` / `node tools/validate-foundation.mjs` run inside an isolated worktree checked out at the exact frozen commit, and every source-code claim was formed by reading `src/registry/runtime-registry.mjs` and `tests/runtime-registry.test.mjs` in full.
- date: 2026-07-20

---

## Verdict

**READY FOR THE MODULE-COMPLETION DECISION. No blocking findings.**

Every claim in the cross-provider review (`mod-reg-xprov-rev-001.md`) reproduces exactly on a fresh, independent first-hand run. The one open item that review left unexplained — the F-CNT validator check-count delta (545 vs 548) — is resolved definitively below: both numbers are real, reproducible, and correspond to two different (correctly identified) commits in Codex's own retarget history; there is no defect and no drift at the frozen target. F-DEP and F-EVID are independently re-confirmed CLOSED by direct code reading, not by trusting either predecessor's characterization. Two **new** LOW, non-blocking, adoption-gated findings were surfaced by probes the prior review did not run (optimistic-concurrency is opt-in and its one real caller does not use it; identity-duplicate detection has no case/whitespace/Unicode-normalization). Neither is exploitable into an authority or confidentiality escalation in the current code, and both match this project's established pattern of shipping with tracked, non-blocking LOW notes (cf. MOD-GOV's S3-F1, MOD-WORK's alias-widening note). Nothing found here should block Codex's QA lane or the operator's module-completion decision on unchanged `09d686c`.

---

## 1. Reproduced totals (first-hand, this pass)

Environment: `npm install` (6 packages, clean) in an isolated worktree at `09d686c`, working tree clean at start and end.

| Metric | Codex claim (as restated by prior REV) | Prior REV measured | This pass measured | Result |
| --- | --- | --- | --- | --- |
| Registry suite (`node --test tests/runtime-registry.test.mjs`) | 46/46 | 46 pass / 0 fail / 0 skip | tests **46**, pass **46**, fail **0**, skip **0** | MATCH |
| Full suite (`node --test tests/*.test.mjs`) | 378 pass, 0 fail, 5 skip | tests 383, pass 378, fail 0, skip 5 | tests **383**, pass **378**, fail **0**, skip **5**, exit **0** | MATCH |
| Foundation validator (`node tools/validate-foundation.mjs`) | 545 checks | 548 checks, all PASS, exit 0 | checks **548**, status **PASS** (548/548 PASS), exit **0** | MATCHES PRIOR REV; see F-CNT for the 545 explanation |
| Workspace clean | clean | clean | clean before and after | MATCH |

Validator check-group breakdown (measured directly from the JSON output, `checks.length` = 548): `manifest.file` 273, `docs-manifest.file` 60, `schema.*` 48 (12 schemas × 4 checks), `docs.link` 140, plus 27 fixed structural/version/crypto/git checks = 548. This is deterministic given the tree state at `09d686c` — re-running it a second time on the same worktree reproduces 548 exactly.

## 2. F-CNT — definitively explained (not merely re-flagged)

The prior review left this as an unexplained, non-blocking LOW note ("counted at a different tree state or approximated"). This pass tracked down the actual cause:

**The candidate's "545" figure is the exact, reproducible validator count at the prior lineage commit `cad7c20` ("[MOD-REG-001] Retarget registry discovery onto current main"), not at the final frozen target `09d686c`.**

Verification performed: a temporary, isolated worktree was created at `cad7c20` (`npm install` + `node tools/validate-foundation.mjs`), then removed immediately after measurement. Result: **545 checks, all PASS, exit 0** — an exact match to Codex's claimed figure, to the digit.

Root cause of the +3 delta between `cad7c20` (545) and `09d686c` (548): `git diff --stat cad7c20..09d686c` shows `MANIFEST.json` gaining exactly 3 new file registrations (`tests/fixtures/valid/mcp-registry-seed.example.json`, `tests/mcp-server-deployment.test.mjs`, `tools/secb-mcp-server-wiring.mjs`), none of which are registry-scoped — they belong to the MCP server/deployment-wiring work that Codex's branch carried forward from its own prior context. Because `tools/validate-foundation.mjs` emits exactly one `manifest.file.<path>` check per entry in `MANIFEST.json` (confirmed by reading the validator source: `for (const file of manifest.files) assert(existsSync(...), \`manifest.file.${file}\`, ...)`), the check total is a whole-repository-manifest function, not a registry-module-scoped count. Adding 3 unrelated files to the manifest mechanically adds exactly 3 checks — 545 → 548 — with zero change to registry semantics.

Conclusion: this is not a miscount, not an approximation, and not evidence of any defect anywhere. It is a **stale-by-one-commit** figure — Codex's "545" was accurate for `cad7c20` and was carried forward in restated form without being re-measured against the final `09d686c` commit that bundled 3 incidental, out-of-registry-scope manifest entries. The number that matters for the gate — the validator result at the actual frozen target — is unambiguously **548/548 PASS, exit 0**, now independently reproduced twice (prior REV, this pass).

## 3. Scope discipline — re-verified across the full lineage, with a correction to the lineage model

`git diff --stat a8ef0d1..09d686c` (target vs its immediate parent) touches exactly the 2 claimed files:

- `src/registry/runtime-registry.mjs`
- `tests/runtime-registry.test.mjs`

This matches the prior review exactly. However, this pass additionally checked the task's premise that `b4ec06a` → `cad7c20` → `09d686c` form a linear "-001 → -002 → -003" commit chain. **They do not.** Each of the three commits has a *different* immediate parent on an evolving `main`:

| Commit | Parent | Parent is |
| --- | --- | --- |
| `b4ec06a` | `49d1e0c4` | PR #5 (`bst/reconcile-integration`) |
| `cad7c20` | `617a703` | PR #8 (`claude/rev/p0-09-unified-retarget`) |
| `09d686c` | `a8ef0d1` | PR #9 (`bst/p0-21-deployment-integration`) |

None of the three is an ancestor of another (`git merge-base --is-ancestor` confirms no pairwise ancestry). Each is an independent **retarget of the same registry feature onto whichever `main` tip was current at the time** (consistent with `cad7c20`'s own commit message, "Retarget registry discovery onto current main"), not sequential increments on top of each other. This matters for how "full lineage scope discipline" should be read: there is no single diff that spans all three "in sequence." Instead, each iteration was checked independently against its own immediate parent:

- `b4ec06a` vs `49d1e0c4`: 2 files (`runtime-registry.mjs`, `runtime-registry.test.mjs`)
- `cad7c20` vs `617a703`: 2 files (same two)
- `09d686c` vs `a8ef0d1`: 2 files (same two)

**All three independent retargets stay inside the same 2-file scope boundary.** Scope discipline result: CLEAN across the full lineage, with the lineage model corrected from "sequential chain" to "three independent same-scope retargets."

## 4. F-DEP / F-EVID — independently re-confirmed by direct code reading

Read `src/registry/runtime-registry.mjs` (251 lines) and `tests/runtime-registry.test.mjs` (519 lines) in full, independently of either prior document's characterization.

**F-DEP (misleading/unbound project-scope alias): CONFIRMED CLOSED.** `DISCOVERY_DIMENSIONS` (lines 15–25) exposes exactly nine frozen dimensions — `provider`, `product`, `deployment`, `role`, `approved_model`, `approved_tool`, `approved_skill`, `repository_scope`, `environment_scope` — each mapping to one distinct schema field (`provider_id`, `runtime_product_id`, `runtime_deployment_id`, `permitted_roles`, `approved_models`, `approved_tools`, `approved_skills`, `repository_scopes`, `environment_scopes`). No `project`-named token, and no two dimensions alias the same field. Test `project_scope is not an authorized discovery dimension` (line 375) locks `discoverBy("project_scope", ...)` to `DENY_UNKNOWN_DISCOVERY_DIMENSION`, and `DISCOVERY_DIMENSIONS exposes only deterministic supported dimensions` (line 451) pins the exact nine-key set with `Object.isFrozen` asserted. Verified directly, not inferred.

**F-EVID (typed fail-closed discovery coverage): CONFIRMED CLOSED.** `discoverBy()` (lines 223–243) enforces, in order: non-blank dimension (`DENY_INVALID_DISCOVERY_DIMENSION`), known dimension via `Object.hasOwn` — not `in` or bracket lookup, so prototype-chain names cannot leak through (`DENY_UNKNOWN_DISCOVERY_DIMENSION`), non-blank value (`DENY_INVALID_DISCOVERY_VALUE`). Unmatched lookups return `deepFreeze([])` — an empty, frozen, non-throwing result — rather than a broad/undefined match. Read the schema (`contracts/agent-registration.schema.json`) directly to verify the "latent-edge" claim from the prior review myself, rather than trusting it: every collection-type field used as a discovery dimension (`approved_models`, `approved_tools`, `approved_skills`, `repository_scopes`, `environment_scopes`) carries `"default": []` and is *not* in the schema's `required` list, and `runtime-registry.mjs` line 9 compiles Ajv with `useDefaults: true` against a `structuredClone` of the input (line 75) before validation — so every stored entry is guaranteed to have real arrays, and `descriptor.collection ? candidate.includes(value) : ...` (line 240) can never receive `undefined`. Confirmed independently: no `TypeError` escape path exists here.

## 5. New adversarial probes (beyond the prior review's table)

The prior review's adversarial table tested duplicate-ID rejection and version-conflict rejection only in their straightforward forms (exact-duplicate ID; explicit stale `expectedVersion`). This pass ran additional probes targeting the same class of gap this project's other module reviews have repeatedly found — optional/skippable enforcement and weak-equality identity checks — using a throwaway probe script executed inside the isolated worktree and deleted immediately after (no artifact retained; Script Management Protocol: ephemeral).

| # | Probe | Mechanism exercised | Outcome | Verdict |
| --- | --- | --- | --- | --- |
| P1 | Blind concurrent transition with `expectedVersion` **omitted** (not merely wrong) | Caller A approves an instance; caller B, holding a now-stale mental model of the same instance, calls `transitionEvaluation` again without ever passing `expectedVersion` | **No throw.** B's transition succeeds silently, landing the instance in `SUSPENDED` at version 3 with no lost-update signal to either caller | See **F-VER** below |
| P2 | Unicode-confusable identity: register the NFD form of `inst_café`, then register the NFC-normalized form of the same visual string | `#entries.has(id)` is a raw `Map` key lookup with no `.normalize()` call anywhere in `register()` | **No throw** on the second registration; registry size becomes 2 — two visually-identical but byte-distinct governed identities coexist | See **F-IDNORM** below |
| P3 | Case-variant (`INST_CLAUDE_001`) and trailing-whitespace-variant (`inst_claude_001 `) of an already-registered ID | Same raw `Map` key equality | **No throw** on either; registry size becomes 3 for what a human operator would read as "the same instance" | Folded into **F-IDNORM** |
| P4 | Prototype-key-shaped IDs (`__proto__`, `constructor`, `toString`, `hasOwnProperty`) as `agent_instance_id` | `#entries` is a `Map`, not a plain object — keys are not property lookups | All four register and round-trip via `get()` cleanly; `Object.prototype` unaffected (`({}).polluted === undefined`) | **PASS** — confirms `Map`-backed storage is immune to the prototype-pollution class of bug that would apply to a plain-object-keyed store |
| P5 | `authority_ceiling` set to a non-enum value (`"SUPERADMIN"`, `null`) to test whether `AUTHORITY_LEVELS.indexOf(candidate.authority_ceiling)` returning `-1` (not-found) could produce a false "not exceeded" comparison (`-1 > ceilingIndex` is always false) and silently admit an unrecognized ceiling | Schema `authority_ceiling: { "enum": ["A0".."A5"] }` runs via Ajv (line 76) **before** the `indexOf` comparison (line 87) is ever reached | Both throw `DENY_INVALID_REGISTRATION` at the schema gate; the `indexOf(-1)` code path is provably unreachable with an out-of-enum value | **PASS** — a plausible-looking fail-open shape is closed by defense-in-depth (schema-then-code ordering), verified by direct execution, not by code-reading alone |
| P6 | Same literal string reused as the value for two different single-valued dimensions (`provider_id` and `runtime_product_id` both set to `"shared-token"`), then queried via `listByProvider`, `listByProduct`, and an unrelated dimension (`deployment`) | Field-scoped comparison (`candidate[descriptor.field] === value`) | Each dimension returns only its own matches (1, 1, and 0 respectively); no cross-dimension bleed | **PASS** |
| P7 | Cache a `resolve()` snapshot, then transition the instance to `SUSPENDED`, then re-`resolve()` | `resolve()` returns a fresh `deepFreeze`d snapshot each call; the frozen earlier object is not live-linked to registry state | Earlier snapshot still reads `resolved:true` (expected — it is a frozen point-in-time snapshot, not a live view); a fresh `resolve()` correctly reports `quarantined:true`. Cross-checked the one real caller, `HostRuntimeAgent.emitEvent` (`src/host/host-runtime-agent.mjs:43`), and confirmed it calls `resolve()` fresh on every invocation rather than caching | **PASS** — no live-mutation-through-reference bug, and the one real caller uses the API correctly (does not cache) |

### F-VER (severity: LOW, informational, adoption-gated) — optimistic-concurrency check is opt-in, and the one real caller does not opt in

`transitionEvaluation`/`transitionLifecycle` only enforce `expectedVersion` when the caller supplies it (`if (expectedVersion !== undefined && ...)`, lines 146 and 169). This is not merely theoretical: `grep`ing the full source tree for callers of these two methods outside the test suite finds exactly one, `tools/secb-mcp-server-wiring.mjs:132-133`, and it calls both without ever passing `expectedVersion`. The state-machine legality tables (`EVALUATION_TRANSITIONS`/`LIFECYCLE_TRANSITIONS`) still gate what transitions are reachable regardless of version, so this cannot manufacture an illegal state; and the current runtime is single-threaded/synchronous JavaScript with no `await` between a `get()` and a `transition*()` call anywhere in the one real caller, so there is no live TOCTOU window today. The exposure is forward-looking: any future caller that reads registry state across an asynchronous boundary (a plausible direction for this codebase, which is otherwise moving toward multi-agent orchestration) and does not explicitly pass `expectedVersion` would silently accept a lost-update. Non-blocking; recommended tracked follow-up: either make `expectedVersion` mandatory on both transition methods, or have `secb-mcp-server-wiring.mjs` start passing it.

### F-IDNORM (severity: LOW, informational, adoption-gated) — identity-duplicate detection has no normalization

`register()`'s duplicate guard (`this.#entries.has(candidate.agent_instance_id)`, line 83) and every discovery/value comparison in `discoverBy()` (lines 236-240) are raw, byte-exact string comparisons. No case-folding, no whitespace-trimming, and no Unicode-normalization (`.normalize("NFC")`) is applied anywhere to `agent_instance_id` or to discovery values. Confirmed by direct execution (P2/P3 above): `"inst_café"` (NFD) and its NFC-normalized, visually-identical twin register as two independent governed identities; so do case variants and whitespace-padded variants of an existing ID. This does not by itself grant excess authority — each registered identity still passes through the same schema validation, ceiling check, and lifecycle gates independently — but it undermines the implicit "one governed identity per instance" assumption the registry exists to enforce: an operator or a downstream log/audit view could reasonably believe two such entries are "the same agent" when the registry treats them as fully distinct, with potentially different `authority_ceiling` or `permitted_roles`. Exploitability today is bounded by the fact that `agent_instance_id` values are presumably assigned by the registration pipeline/operator rather than self-declared by the registering agent — but nothing in the code or schema enforces that assumption. Non-blocking; recommended tracked follow-up: normalize (`trim()` + case-fold or reject non-canonical form + Unicode NFC-normalize) `agent_instance_id` at the `register()` boundary before the duplicate check, or explicitly document the byte-exact contract if intentional.

Neither F-VER nor F-IDNORM is a live over-permit, a fail-open authority path, or a confidentiality break in the code as it exists today; both are adoption-gated, LOW-severity, and structurally analogous to notes this project's other module reviews have shipped with (e.g. MOD-GOV's S3-F1, MOD-WORK's alias-widening disclosure).

## Advisory fields

- truth_status: verified_true (all reproduced numbers, F-DEP/F-EVID dispositions, and scope-discipline claims independently confirmed first-hand; F-CNT fully explained rather than merely reproduced)
- authority_status: advisory_only
- implementation_status: existing
- risk_class: low

## Self-certification

```yaml
self_certification:
  agent_id: claude-qa-modreg-independent-01
  peer_agent_id: codex-motor
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Advisory only. This is an independent, additional cross-provider QA opinion on an unchanged frozen candidate (`09d686c`), separate from Codex's own QA lane at the same commit. It certifies completeness of this QA pass and a recommended disposition (no blocker found). It does not authorize merge, execution, production declaration, or bypass of the operator queue. Operator/governance authority remains required to act, and Codex's own QA lane proceeds independently and is not superseded by this record.
