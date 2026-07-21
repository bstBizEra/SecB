# MOD-REG F-VER / F-IDNORM Producer Fix — Self-Verification Record

- record_id: mod-reg-f-ver-f-idnorm-fix-producer-verification-001
- status: CANDIDATE (advisory producer self-verification; operator ratification required per AMD-002 rev 2 advise-and-proceed — no push, no merge, no execution authority exercised)
- producer_identity: claude-producer-mod-reg-fver-idnorm-01 (BST-SA worker agent)
- authorization: SECB-AGENTS-AMD-002 (revision 2), standing implementation authorization — bounded slice under `src/**`, `tests/**`, `tools/**`
- branch: `bst/mod-reg-f-ver-f-idnorm-fix-001`
- base_commit: `fc29f583892a51f080c5726a590fec90fba7671e` (`main` at task start, verified via `git rev-parse main`)
- worktree: isolated git worktree (`SecB-worktrees/bst-mod-reg-f-ver-f-idnorm-fix-001`), created via `git worktree add ... -b bst/mod-reg-f-ver-f-idnorm-fix-001 main`
- date: 2026-07-21
- inputs_read:
  - `docs/03-project-control/candidates/mod-reg-qa-001.md` @ `278c536` (`claude/qa/mod-reg-001`) — source of F-VER and F-IDNORM
  - `docs/03-project-control/candidates/mod-reg-human-gov-disposition-candidate-001.md` @ `bc1a4ad` — read for context only; that disposition is separate, still-pending, and is neither touched nor depended on by this fix
  - `src/registry/runtime-registry.mjs` (full, both at frozen candidate `09d686c` and at current `main`)
  - `tools/secb-mcp-server-wiring.mjs` (full, the real caller F-VER names)
  - `tests/runtime-registry.test.mjs`, `tests/mcp-server-deployment.test.mjs` (full, existing coverage)

---

## 0. A load-bearing correction to the task's own branching assumption

The task instructions assumed "current main likely already contains this registry code merged via a later PR." **This is false, and was verified false rather than assumed true**, per the task's own instruction to check first:

- `git merge-base --is-ancestor 09d686c64f4bb3d8cd053f91b5f443b0ad69f811 main` → **NOT ANCESTOR**.
- `git log --oneline --all -- src/registry/runtime-registry.mjs` shows five total commits to this file across the whole repo: `15ff81b` (P0-15A, base), `af9d063` (P0-18, unrelated conformance fix), then three **independent, never-merged** retargets of the same discovery feature — `b4ec06a`, `cad7c20`, `09d686c` — each on its own `codex/mod-reg/registry-services-00N` branch, none an ancestor of another (confirmed in the QA record itself, section 3).
- `main`'s actual current `src/registry/runtime-registry.mjs` (at `af9d063`) is the **pre-discovery-feature** version: it has `register()`, `get()`, `resolve()`, `transitionEvaluation()`, `transitionLifecycle()`, `listByProduct/Provider/Deployment()`, but **no** `DISCOVERY_DIMENSIONS`, no `discoverBy()`, no `deepFreeze()`, and no `listByRole/ApprovedModel/ApprovedTool/ApprovedSkill/RepositoryScope/EnvironmentScope()`. The frozen QA target `09d686c` (on the still-unmerged `codex/mod-reg/registry-services-003` branch) adds all of that on top, per `git diff af9d063:... 09d686c:...`.

**Why this doesn't block the task**: both F-VER and F-IDNORM concern code paths that are **byte-identical** between `main`'s current version and the frozen `09d686c` candidate — the diff between them touches only the discovery-dimension feature (added), never the duplicate-ID check in `register()` or the `expectedVersion` opt-in check in `transitionEvaluation`/`transitionLifecycle` (both present, unchanged, in both versions). So branching from current `main` and fixing it there closes the exact same gaps QA found, on the code that is actually live in the mainline, without requiring the separate and still-pending decision on whether/how `registry-services-003` itself gets merged. This is the more useful outcome for the project: the fix lands on the branch other work will actually build on next, instead of on a frozen, disconnected candidate commit.

---

## 1. F-VER — assessed and fixed (not merely documented)

**Read `tools/secb-mcp-server-wiring.mjs` in full to verify the caller's actual execution context before making any call**, per the task's instruction not to assume:

- The one real (non-test) caller is `seedRegistry()` (lines ~125–139 pre-fix). It runs a plain synchronous `for...of` loop over `registrations`, calling `registry.register(registration)` then, in the same iteration and same synchronous stack, `registry.transitionEvaluation(id, "APPROVED")` and `registry.transitionLifecycle(id, "ACTIVE")` — with **no `await`** anywhere between them.
- `seedRegistry` is invoked exactly once per `prepareDeployment()` call (single process, single seed load), confirmed by reading `prepareDeployment()`'s call site (`const registry = seedRegistry(loadRegistrySeed(config.seedPath));`).
- **Conclusion, matching the QA record's own finding**: there is no live TOCTOU/concurrent-writer window at this call site *today*. This is a single-writer, synchronous sequence.

**Decision: wire it in anyway, rather than merely document a non-issue.** Rationale:
1. The caller already holds the exact version returned by each prior call (`register()` returns `{ version: 1 }`; `transitionEvaluation()` returns `{ version: N+1 }`), so passing `expectedVersion` costs nothing — it is guaranteed to match during normal single-writer operation, meaning **zero behavior change today**.
2. It directly implements QA's own stated remediation option ("have `secb-mcp-server-wiring.mjs` start passing it"), rather than the alternative option (making `expectedVersion` mandatory on the registry API), which would be a wider, more invasive behavioral change to `RuntimeRegistry` affecting every caller including the test suite.
3. It closes the QA-identified forward-looking gap (a future async refactor of this loop silently accepting a lost update) *before* it can ever manifest, at effectively no cost — a materially better outcome than a documentation-only disposition for a change this cheap and this safe.

**Fix** (`tools/secb-mcp-server-wiring.mjs`, `seedRegistry`): thread the version returned by each prior call as `expectedVersion` into the next:

```js
const { version: registeredVersion } = registry.register(registration);
let currentVersion = registeredVersion;
if (approve) {
  ({ version: currentVersion } = registry.transitionEvaluation(id, "APPROVED", { expectedVersion: currentVersion }));
}
if (activate) {
  registry.transitionLifecycle(id, "ACTIVE", { expectedVersion: currentVersion });
}
```

A version mismatch (would only occur under a future concurrent-writer scenario) is caught by the existing `try/catch` and re-thrown as the existing `DENY_SEED_REGISTER` code — no new error path, no new denial surface for the normal case.

## 2. F-IDNORM — fixed

`register()`'s duplicate guard was a raw `Map.has(candidate.agent_instance_id)` — byte-exact, no case-fold, trim, or Unicode normalization, exactly as QA's P2/P3 probes demonstrated by execution.

**Fix** (`src/registry/runtime-registry.mjs`):
- Added a local helper `normalizeIdentifierForComparison(value)` — `value.trim().normalize("NFC").toLowerCase()` — since no shared `semantic-validator.mjs` / `normalizeIdentifierForComparison` exists anywhere in this repository. **Verified, not assumed**: `git grep -l "normalizeIdentifierForComparison"` across every commit on every branch (`git rev-list --all`) returns zero hits; no file named `semantic-validator.mjs` or containing `normalizeIdentifier` exists in the repo's history. The task's own instructions anticipated this case ("or write an equivalent local helper if the registry module doesn't currently import from that file").
- Added a second, parallel index `#normalizedIds` (`Map<normalizedId, originalId>`), populated alongside `#entries` in `register()`.
- `register()`'s duplicate check now rejects when **either** the raw ID **or** its normalized form is already present.

**Deliberate scope boundary — what did *not* change**:
- `#entries` (the primary store) is still keyed by the caller's **original, unmodified** `agent_instance_id`. `get()`, `resolve()`, `transitionEvaluation()`, `transitionLifecycle()`, `listByProduct/Provider/Deployment()` are **untouched** and still do exact-match lookups against the raw ID — normalization only participates in the *duplicate-detection* comparison in `register()`, per the task's explicit scope. A test (`F-IDNORM: registered entries remain keyed and retrievable by their original, unmodified agent_instance_id`) locks this down: a differently-cased lookup of a mixed-case-registered ID returns `null`, proving lookup behavior is unchanged.
- Verified the fix is directionally correct, not a false-positive risk in reverse: a dedicated test (`genuinely distinct IDs that do not normalize to the same form still register independently`) confirms two IDs that are not normalization-confusable (`inst_claude_001` vs `inst_claude_002`) still register as two separate entries — case-insensitive/normalized *collision* detection is exactly the behavior being added, and it does not over-collapse genuinely distinct identities.

## 3. Tests added (reproducing QA's own demonstrated cases)

`tests/runtime-registry.test.mjs` (+5 tests, F-IDNORM):
- case-variant of an already-registered ID (`INST_CLAUDE_001` vs `inst_claude_001`) → now `DENY_DUPLICATE_INSTANCE` (was QA's P3).
- whitespace-padded variant (`" inst_claude_001 "`) → now `DENY_DUPLICATE_INSTANCE` (was QA's P3).
- NFC/NFD-confusable twin, built from explicit code points (`String.fromCharCode(0x00e9)` vs `String.fromCharCode(0x0065, 0x0301)`, with fixture-sanity assertions proving the two literals are byte-distinct yet NFC-confusable before testing the registry behavior) → now `DENY_DUPLICATE_INSTANCE` (was QA's P2).
- negative control: genuinely distinct IDs still register independently.
- negative control: lookup methods remain keyed to the original raw ID (no behavior change outside the duplicate check).

`tests/mcp-server-deployment.test.mjs` (+2 tests, F-VER):
- instruments `RuntimeRegistry.prototype.transitionEvaluation`/`transitionLifecycle` via a save-and-restore prototype patch to assert `seedRegistry` passes `expectedVersion: 1` to the approve call and `expectedVersion: 2` to the activate call — direct proof the version is threaded correctly, not just that the seed still succeeds (which it would even with the fix absent).
- a fail-closed demonstration: patches `RuntimeRegistry.prototype.register` to simulate a concurrent writer that approves-then-suspends the same instance immediately after registration (both transitions individually legal, and `SUSPENDED -> APPROVED` — the seed loop's own next step — is *also* individually legal, so this is a genuine lost-update scenario, not one blocked by transition-legality alone). Asserts `seedRegistry` now throws `DENY_SEED_REGISTER` wrapping `DENY_VERSION_CONFLICT` — proving the fix actually changes outcome in the race case it targets, while the two "F-VER: ... exact expectedVersion" / normal-path tests and the full untouched existing suite prove zero change in the non-race case.

## 4. Exact test counts

All runs performed in the isolated worktree (`SecB-worktrees/bst-mod-reg-f-ver-f-idnorm-fix-001`), `npm install` clean (6 packages), from `main` @ `fc29f58`.

| Suite | Before (baseline, pre-fix) | After (post-fix + new tests) |
| --- | --- | --- |
| `node --test tests/runtime-registry.test.mjs` | tests **36**, pass **36**, fail **0**, skip **0** | tests **41**, pass **41**, fail **0**, skip **0** |
| `node --test tests/mcp-server-deployment.test.mjs` | tests **16**, pass **16**, fail **0**, skip **0** | tests **18**, pass **18**, fail **0**, skip **0** |
| `npm test` (full suite) | tests **703**, pass **698**, fail **0**, skip **5** | tests **710**, pass **705**, fail **0**, skip **5** |

Delta: +7 tests, +7 pass, 0 regressions, 0 change in skip count (5 skips before and after are pre-existing and unrelated to this slice). **No regression in the existing registry test suite or the full suite.**

## 5. Behavior-preservation evidence for anything not intentionally changed

- `git diff --numstat` for this slice touches exactly 4 files: `src/registry/runtime-registry.mjs` (+16/-1 lines), `tools/secb-mcp-server-wiring.mjs` (+24/-3 lines), `tests/runtime-registry.test.mjs` (+62/-0, test-only additions), `tests/mcp-server-deployment.test.mjs` (+59/-0, test-only additions). No other file under `src/**`, `tools/**`, or elsewhere was touched.
- All 36 pre-existing registry tests and all 16 pre-existing wiring tests pass **unmodified and unedited** — none of the fix commits altered an existing assertion; the "before" and "after" runs used the identical pre-existing test files for the non-new tests.
- `register()`'s primary `#entries` Map is still keyed by the caller's raw `agent_instance_id`; `get()`, `resolve()`, `transitionEvaluation()`, `transitionLifecycle()`, and all `listBy*()` methods are byte-for-byte unchanged.
- `seedRegistry()`'s control flow (register → conditionally approve → conditionally activate, wrapped in the same `try/catch` → `DENY_SEED_REGISTER`) is unchanged; only the `expectedVersion` option object is now populated instead of omitted, and it is populated with values guaranteed equal to the actual version during every normal (non-race) execution path, which both the full existing suite and the new "passes the exact expectedVersion it observed" test confirm.

## Advisory fields

- truth_status: verified_true (F-VER caller context, F-IDNORM absence of a shared normalization helper, and all test counts were verified first-hand in this pass, not inherited from any prior document)
- authority_status: advisory_only (implementation is complete and committed locally on a non-`main` branch per AMD-002 rev 2 advise-and-proceed; merge ratification is an operator action)
- implementation_status: existing (both fixes implemented and tested on this branch)
- risk_class: low

## Self-certification

```yaml
self_certification:
  agent_id: claude-producer-mod-reg-fver-idnorm-01
  peer_agent_id: codex-motor
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Advisory only. This record certifies completeness of the producer implementation and test verification for F-VER and F-IDNORM on branch `bst/mod-reg-f-ver-f-idnorm-fix-001`. It does not authorize merge, execution, production declaration, or bypass of the operator queue. It is independent of, and does not require or block on, the separate pending MOD-REG Human GOV disposition record (`mod-reg-human-gov-disposition-candidate-001.md`).
