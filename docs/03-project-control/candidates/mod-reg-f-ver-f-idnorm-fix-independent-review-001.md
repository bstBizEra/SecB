# MOD-REG F-VER / F-IDNORM Producer Fix — Independent Review 001

**Record ID:** mod-reg-f-ver-f-idnorm-fix-independent-review-001
**Status:** ADVISORY — INDEPENDENT REVIEW, NOT A MERGE DECISION
**Reviewer identity:** claude-rev-modreg-fver-fidnorm-01 (BST-SA REV worker, independent of the producer, no relationship to `claude-producer-mod-reg-fver-idnorm-01`)
**Reviewed branch/commit:** `bst/mod-reg-f-ver-f-idnorm-fix-001` @ `a4c342e`, base `main` @ `fc29f58`
**Reviewed against:** `docs/03-project-control/candidates/mod-reg-f-ver-f-idnorm-fix-producer-verification-001.md` (this branch) and `docs/03-project-control/candidates/mod-reg-qa-001.md` (`claude/qa/mod-reg-001` @ `278c536`, original source of F-VER/F-IDNORM)
**Method:** Findings reproduced first-hand in an isolated `git worktree add --detach` checkout at `a4c342e` (`C:\laragon\www\SecB-worktrees\claude-rev-mod-reg-fver-fidnorm-fix-001`), with its own `npm install`, separate from the producer's own worktree (`C:\laragon\www\SecB-worktrees\bst-mod-reg-f-ver-f-idnorm-fix-001`) and from any other concurrent agent session. A second isolated detached worktree at `main` @ `fc29f58` (`C:\laragon\www\SecB-worktrees\claude-rev-mod-reg-fver-fidnorm-baseline`) was used for the independent baseline count. Nothing on the branch was modified except this review's own final commit; no push, no merge, no operator-authority action taken.
**Date:** 2026-07-21

---

## Verdict: **APPROVE_FOR_MERGE**

Every claim in the producer's self-verification record reproduced exactly under independent, first-hand execution: the ancestor claim, the byte-identical-relevant-code-paths claim, all four test counts, the full diff shape, the F-VER threading logic, and the F-IDNORM normalization/scope-boundary claims. My own novel probes — a same-entry two-writer race (a different shape from the shipped approve-then-suspend chain) and independent case/whitespace/Unicode duplicate probes with fresh IDs not in the shipped test file — all produced the predicted result, and the F-IDNORM probes were confirmed to genuinely fail on pre-fix `main` (not merely pass trivially on both). One non-blocking scope observation is carried forward in §7; it does not affect this fix's correctness.

---

## 0. Load-bearing branching claim — CONFIRMED

```
git merge-base --is-ancestor 09d686c64f4bb3d8cd053f91b5f443b0ad69f811 main
```

reproduced first-hand: exit code `1` (**not an ancestor**), confirming `09d686c` (`codex/mod-reg/registry-services-003`) is genuinely never merged into `main`, exactly as the producer's own correction states.

**Byte-identical-relevant-code-paths claim — CONFIRMED.** Diffed `main`'s current registry file (`af9d063`) against the frozen candidate (`09d686c`) directly: the only changes are the discovery-dimension feature (`DISCOVERY_DIMENSIONS`, `deepFreeze`, `requireNonblankString`, `discoverBy()`, and swapping `Object.freeze` for `deepFreeze` on the returned/stored objects). Grepped both versions for the two lines this fix touches:

- `register()`'s duplicate guard: `if (this.#entries.has(candidate.agent_instance_id))` at line 57 in `af9d063` and line 83 in `09d686c` — identical text, only shifted by the interposed discovery code.
- `transitionEvaluation`/`transitionLifecycle`'s version gate: `if (expectedVersion !== undefined && entry._version !== expectedVersion)` — identical text at both commits, same shift pattern.

Confirmed: fixing on `main` closes the exact same gap QA found on `09d686c`, independent of that candidate's still-pending disposition.

## 1. Test counts — CONFIRMED, exact match on all four numbers

Ran `npm test` first-hand in the isolated worktree at `a4c342e` (clean `npm install`, 6 packages):

```
tests 710 / pass 705 / fail 0 / skipped 5
```

Ran `npm test` first-hand in a second isolated worktree at `main` @ `fc29f58`:

```
tests 703 / pass 698 / fail 0 / skipped 5
```

Both match the producer's claimed numbers exactly (`710/705/0/5`, baseline `703/698/0/5`, delta `+7/+7/0/0`) — the baseline was **not** assumed, it was independently re-derived in its own clean worktree. Per-file breakdown, also reproduced first-hand:

| Suite | `main` baseline | This branch | Delta |
| --- | --- | --- | --- |
| `tests/runtime-registry.test.mjs` | 36/36/0/0 | 41/41/0/0 | +5 (matches the 5 new F-IDNORM tests) |
| `tests/mcp-server-deployment.test.mjs` | 16/16/0/0 | 18/18/0/0 | +2 (matches the 2 new F-VER tests) |

## 2. F-VER fix — CONFIRMED correct, including under a novel race shape distinct from the shipped test

Read `tools/secb-mcp-server-wiring.mjs`'s full diff. The fix:

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

is genuinely correct threading, not stale-version reuse: `currentVersion` is reassigned from each call's own return value before being passed into the next call, and when `approve` is `false` the value legitimately stays at `registeredVersion` since no version-changing call occurred in between. Confirmed this is not cosmetic by reading `RuntimeRegistry.transitionEvaluation`/`transitionLifecycle` (`src/registry/runtime-registry.mjs:130-174`): the `expectedVersion` check runs **before** the transition-legality check in both methods.

**My own novel race probes** (built independently, run against the real module, not copied from the shipped tests) — the shipped test simulates a race via a **sequential chain** on one entry (external actor approves-then-suspends inside a patched `register()`, then `seedRegistry`'s own next call conflicts). I built a structurally different shape: **two callers racing on the SAME entry from the SAME captured version**, neither one being a chain of unrelated calls:

- Register an entry (version 1). Caller A reads version 1 and successfully calls `transitionEvaluation(..., "APPROVED", { expectedVersion: 1 })`, advancing to version 2. Caller B, having read the *same* version-1 snapshot, then calls `transitionEvaluation(..., "SUSPENDED", { expectedVersion: 1 })` — a transition that **is** legal from the resulting `APPROVED` state, so only the version gate can be stopping it. Result: `DENY_VERSION_CONFLICT`, and the entry's final state reflects only A's write (`APPROVED`, version 2) — not a partial or clobbered value.
- Same shape repeated for `transitionLifecycle` (`ACTIVE` → stale caller tries `DEACTIVATED` with `expectedVersion: 1`) — same result.
- A third variant confirms check ordering: a stale caller requesting a transition (`REVOKED`) that is legal from the *actual* current state but not from the caller's stale mental model still fails with `DENY_VERSION_CONFLICT`, not a confusing `DENY_EVALUATION_TRANSITION` — i.e., the version gate is checked independently of and before transition-legality, so a racing writer gets the correct diagnostic.

All three passed. As a control, I confirmed this class-level behavior is **not new** — it also passes on pre-fix `main` (the `expectedVersion` mechanism in `RuntimeRegistry` itself was never broken; only the real caller's failure to pass it was the gap), consistent with the producer's own framing that this is a wiring fix, not a registry-internals fix.

## 3. F-IDNORM fix — CONFIRMED correct, scope boundary genuinely holds

Full diff of `src/registry/runtime-registry.mjs`:

```js
function normalizeIdentifierForComparison(value) {
  return typeof value === "string" ? value.trim().normalize("NFC").toLowerCase() : value;
}
...
#normalizedIds = new Map();
...
const normalizedId = normalizeIdentifierForComparison(candidate.agent_instance_id);
if (this.#entries.has(candidate.agent_instance_id) || this.#normalizedIds.has(normalizedId)) {
  throw new RegistryError("DENY_DUPLICATE_INSTANCE", ...);
}
...
this.#entries.set(candidate.agent_instance_id, versioned);
this.#normalizedIds.set(normalizedId, candidate.agent_instance_id);
```

Confirmed `#entries` remains keyed by the raw, unmodified `agent_instance_id` — the only change to `#entries`' own key is none; a second, parallel `#normalizedIds` map is added purely for the duplicate-detection OR-check.

**Reproduced the shipped case-variant/whitespace/NFC-NFD probes**, then built four additional, independent probes with fresh IDs not present in the shipped test file, run directly against the real module in the isolated worktree:

1. **Combined whitespace+case variant** (`"agent_zeta_007"` then `"  AGENT_Zeta_007  "`) → `DENY_DUPLICATE_INSTANCE`, registry size stays 1.
2. **A different NFC/NFD-confusable pair** than the shipped é-based one: `å` (U+00E5, precomposed) vs `a` + combining ring above (U+0061 U+030A, decomposed) — confirmed byte-distinct and NFC-confusable as a fixture-sanity check, then confirmed the second registration is rejected as a duplicate.
3. **Raw-vs-normalized lookup distinction, fresh ID** (`"Agent_Test_Omega_009"`): `get()` with the *same* casing returns the entry; `get()` with a different casing, a different case+trim, and `resolve()` with a different casing all return "not found"/quarantined-unknown — **not** silently matched to the normalized-equal entry. This directly confirms normalization is scoped to duplicate-detection only, not general lookup.
4. **Transition behavior unchanged for the exact raw ID**: registering `"Agent_Test_Omega_009"` and then calling `transitionEvaluation`/`transitionLifecycle` with that exact same casing succeeds as before; calling either with a different casing throws `DENY_UNKNOWN_INSTANCE` (not a normalized match).

**Verified these are a genuine differentiator, not a tautology**: re-ran probe (1) against `main`'s pre-fix `RuntimeRegistry` in the baseline worktree — the padded/case-variant registration is **not** caught pre-fix (`reg.size` becomes `2`), confirming the fix changes real behavior rather than the probe passing regardless of the code under test.

## 4. Zero-regression claim — CONFIRMED

`tests/mcp-server-deployment.test.mjs`'s pre-existing (non-new) tests were reproduced passing for the same reason as before: `git diff fc29f58 a4c342e -- tests/mcp-server-deployment.test.mjs` and `tests/runtime-registry.test.mjs` show pure appends at the end of each file — no existing `test(...)` block's body or assertions were touched. Combined with the exact pass-count match at both the per-file and full-suite level (§1), this confirms no existing assertion changed behavior or was edited to keep passing.

## 5. Hardcoded test-ID branching — CONFIRMED absent

```
grep -n -i "inst_claude|test_id|TEST_MODE|if.*===.*['\"]inst_|NODE_ENV.*test|process\.env\[.TEST" src/registry/runtime-registry.mjs tools/secb-mcp-server-wiring.mjs
```

returns no hits. Read both changed source files in full independent of the grep: every branch in the diff is keyed on real parameters (`agent_instance_id`, `expectedVersion`, `approve`/`activate` seed flags) — no literal test-fixture ID or magic string is special-cased.

## 6. Scope boundedness — CONFIRMED

```
git diff fc29f58 a4c342e --stat
```

touches exactly five files: `docs/.../mod-reg-f-ver-f-idnorm-fix-producer-verification-001.md` (the producer's own record, expected), `src/registry/runtime-registry.mjs` (+16/-1), `tools/secb-mcp-server-wiring.mjs` (+24/-3), `tests/runtime-registry.test.mjs` (+62, pure addition), `tests/mcp-server-deployment.test.mjs` (+59, pure addition). No file outside `src/registry/runtime-registry.mjs`, `tools/secb-mcp-server-wiring.mjs`, and their two test files was touched. Matches the producer's own `git diff --numstat` claim exactly.

## 7. Non-blocking scope observation, carried forward (does not affect this fix's correctness)

The original QA finding (`mod-reg-qa-001.md`, F-IDNORM) also names `discoverBy()`'s field-value comparisons as unnormalized, in addition to `register()`'s duplicate-ID check. That part of F-IDNORM is **not** addressed by this fix — but this is correctly out of scope, not an omission: `discoverBy()`/`DISCOVERY_DIMENSIONS` do not exist on `main`'s current `runtime-registry.mjs` at all (confirmed in §0 — that code only exists on the frozen, unmerged `09d686c` candidate). There is nothing on `main` to fix for that half of the finding today. If/when the discovery-dimension feature is eventually merged from a resolved successor to `registry-services-003`, `discoverBy()`'s value-comparison normalization should be revisited at that time — this is the same forward-looking, adoption-gated shape as F-VER itself, not a defect in the fix under review here.

---

## Summary of findings

| # | Item | Result |
|---|---|---|
| 0 | `09d686c` not-an-ancestor + byte-identical relevant code paths | CONFIRMED, both independently re-verified |
| 1 | Test counts (710/705/0/5, +7 over 703/698/0/5) | CONFIRMED exact, baseline independently re-derived (not assumed) |
| 2 | F-VER threading correctness, incl. novel same-entry race shape | CONFIRMED; 3/3 novel probes behaved as predicted |
| 3 | F-IDNORM normalization + raw-vs-normalized lookup scope boundary | CONFIRMED; 4/4 novel probes behaved as predicted, one control-verified against pre-fix `main` to rule out a tautological test |
| 4 | Zero regression on pre-existing tests | CONFIRMED (pure appends only, exact count match) |
| 5 | No hardcoded test-ID branching | CONFIRMED absent |
| 6 | Scope boundedness (exactly the expected 4 code/test files + producer's own record) | CONFIRMED |
| 7 | `discoverBy()` normalization (frozen-candidate-only, non-`main` code) | Correctly out of scope; carried forward for whenever that candidate is resolved |

## Recommendation

**APPROVE_FOR_MERGE.** All test-count, behavior-preservation, and correctness claims in the producer's self-verification record reproduced exactly under independent, first-hand execution in isolated worktrees, including under race and normalization probes this reviewer built independently rather than reusing the shipped suite. The §7 observation is forward-looking and non-blocking; it does not weaken any claim made about the code actually changed by this fix. This review recommends; it does not authorize merge.

---

## Advisory status fields

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: existing
risk_class: low
self_certification:
  agent_id: claude-rev-modreg-fver-fidnorm-01
  peer_agent_id: claude-producer-mod-reg-fver-idnorm-01
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

## Provenance

- source: first-hand reproduction in isolated detached-HEAD worktrees at `a4c342e` (this branch) and `fc29f58` (`main` baseline), each with an independent `npm install`, separate from the producer's own worktree
- agent_id: claude-rev-modreg-fver-fidnorm-01 (BST-SA REV worker, independent of producer)
- timestamp: 2026-07-21
- disposition: advisory independent review, committed to this branch via an isolated detached-HEAD worktree with the branch ref moved by `git update-ref` — no push, no merge, no operator-authority action taken

> Recommend improvements only. Do not execute them. This review is advisory input to the operator's merge decision, not a merge action itself.
