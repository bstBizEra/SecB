# MOD-INTEG Queue (S1 ledger + S2 collision-forecast) — Third Independent Review 001

**Reviewer:** `claude-immune-third-review-integ-01` (Claude, BST-SA Immune, advisory-only)
**Role:** fresh, independent third look — NOT a re-run of the prior 20 adversarial probes; scoped to new angles only.
**Target:** `origin/main` @ `942d09f` (checked out detached, isolated worktree, node_modules junctioned from the live checkout — no live branch touched)
**Prior accounts NOT trusted, independently re-verified:**
- `docs/03-project-control/candidates/mod-integ-queue-s1-ledger-producer-verification-001.md`
- `docs/03-project-control/candidates/mod-integ-queue-s1-ledger-independent-review-001.md`
- `docs/03-project-control/candidates/mod-integ-queue-s1-status-transition-fix-producer-verification-001.md`
- `docs/03-project-control/candidates/mod-integ-queue-s1-status-transition-fix-independent-review-001.md`
- `docs/03-project-control/candidates/mod-integ-queue-s2-collision-forecast-producer-verification-001.md`
- `docs/03-project-control/candidates/mod-integ-queue-s2-collision-forecast-independent-review-001.md`
- `docs/03-project-control/candidates/mod-integ-s1-s2-crossrev-001.md` (`claude-immune-crossrev-integ-01`, 20/20 adversarial probes reproduced, APPROVE_FOR_MERGE at the time; PR #104 subsequently merged)

**Related, load-bearing context this review depends on:** this session independently found and fixed a case-sensitivity gap in `write-set-policy.mjs`'s allowed-set containment check (`withinBound`, not case-folded — contrast with the prohibited-set check on the same file, which IS case-folded), staged as `bst/mod-wspace-s2-overlap-case-fix-001` (commit `d902e94`, cross-reviewed at `3f79b33`). **That fix is NOT merged into `origin/main`** (`git merge-base --is-ancestor d902e94 origin/main` → not an ancestor). This review treats `overlap-policy.mjs`/`write-set-policy.mjs` as currently carrying that bug on main and asks whether MOD-INTEG's own S1/S2 work would have caught it.

---

## Verdict: REQUEST_CHANGES (fast-follow, not a merge-blocking regression)

```yaml
self_certification:
  agent_id: claude-immune-third-review-integ-01
  peer_agent_id: claude-immune-crossrev-integ-01
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

- `truth_status`: verified_true
- `authority_status`: advisory_only
- `implementation_status`: partial (S1 ledger: no bug found, robust; S2 forecast: confirmed silent false-negative, root cause is an upstream dependency not yet fixed on main)
- `risk_class`: medium (not yet exploitable — S2 is explicitly unwired/advisory-only per its own header — but it is a confirmed correctness defect in already-merged code that will become live-relevant the moment any future slice wires `forecastCollision` into a real gate, and PR #94, which fixes the root cause, is sitting unmerged)

**S1 ledger (`integration-queue-ledger.mjs`) — clean.** The atomic duplicate-claim gate and status-transition gate both held under a genuinely new, harder concurrency probe than any prior review ran (below). No bug found.

**S2 collision-forecast (`integration-collision-forecast.mjs`) — confirmed defect, currently masked by non-wiring.** It silently reports `collides: false` for two write sets naming the same file in different case (e.g. `src/foo.js` vs `src/Foo.js`) — the exact bug shape this session found and fixed in `overlap-policy.mjs`'s dependency chain. Codex's own test suite for this module (`tests/integration-collision-forecast.test.mjs`) and its reused primitive's suites (`tests/overlap-policy.test.mjs`, `tests/write-set-policy.test.mjs`) — 876 lines, 106 tests, all passing — contain **zero** case-variant path assertions. The producer's own review process would not have caught this; it silently inherited the vulnerability from a "trusted," byte-identity-pinned dependency without ever probing the dependency's actual behavior at this boundary.

**Fast-follow required (not blocking, since S2 is unwired):**
1. Prioritize merging `bst/mod-wspace-s2-overlap-case-fix-001` (PR #94) — MOD-INTEG's own forecast module silently depends on it being correct.
2. Add an explicit case-sensitivity regression test to `tests/integration-collision-forecast.test.mjs` (candidate `src/Foo.js` vs. queued `src/foo.js` → must produce `collides:true, mostRestrictiveClass:"O2"` once #94 lands) so this boundary can never silently regress again.
3. Add `maxLength` bounds to the queue-entry schema's unbounded string fields (low severity, see §3).

---

## 1. Status-transition + duplicate-claim gate: real cross-process race, a genuinely new angle

The prior status-transition-fix independent review already ran a real 2-process, 15-trial `child_process.spawn` race — but it targeted the **sequence-conflict / version-bump gate**: two processes racing to append the **next version of the SAME `queue_entry_id`** (`v3 MERGED` vs. `v4 REJECTED` off the same `expectedSequence`). The crossrev's "Duplicate-claim" line (`mod-integ-s1-s2-crossrev-001.md` §6) tested two DIFFERENT `queue_entry_id`s claiming the same branch, but as a sequential in-process check, not a real race.

This review targeted the **duplicate-claim gate specifically, under real OS-process contention**: **8, then 16, independent real Node processes** (`node:child_process`, separate OS processes, not `Promise.all`/in-process instances), each submitting version-1 `SUBMITTED` for a **DIFFERENT `queue_entry_id`** but the **SAME `candidate_branch`** (`shared/contested-branch`), each retrying on `LEDGER_BUSY`/`DENY_SEQUENCE_CONFLICT` until a 15s deadline.

Result across both runs (8-process and 16-process): **exactly one process won every time** (`ok: true`), every other process correctly received `DENY_QUEUE_DUPLICATE_CLAIM` naming the actual winner, and `ledger.verify()` reported `valid: true` with exactly 1 persisted record afterward — no corruption, no double-claim, no silent drop. This holds because `#detectDuplicateClaim` runs inside `preWriteCheck`, which `DurableLedger.append` invokes only after re-reading and re-verifying `records` under the OS-level `mkdirSync`/`EEXIST` lock — the same file-lock primitive the prior review verified is genuinely cross-process (not an in-process mutex that only serializes same-process callers). **The atomic gate holds under a harder, many-way real-process race than either prior review exercised for this specific invariant.**

## 2. Collision-forecast + the known overlap-policy case-sensitivity bug: reproduced, and NOT caught by the test suite

Built the exact scenario the task specified: a currently-queued (`SUBMITTED`) entry declaring `declared_write_set: ["src/foo.js"]`, fed as the `records` shape `forecastCollision` documents it consumes (identical to what `IntegrationQueueLedger`'s `preWriteCheck` hands it), then called `forecastCollision(["src/Foo.js"], records)` directly against the real module in the isolated worktree (main @ `942d09f`, `overlap-policy.mjs`/`write-set-policy.mjs` unfixed).

**Result: `{ ok: true, collides: false, mostRestrictiveClass: null }`** — the module reports these as unrelated files (`overlapClass: "O0"`, `control: "Parallel"`), when on any case-insensitive filesystem (Windows, default macOS) they are the same file. This is a genuine false negative in exactly the scenario `forecastCollision` exists to catch (its own header names O2 "file/path-level collision" as the one dimension it's designed to support from `declared_write_set` alone).

Root cause traced precisely: `write-set-policy.mjs`'s `evaluateWriteSet` case-folds the **prohibited**-path check (line ~256: `caseFoldedProhibited`) but does **not** case-fold the **allowed**-set containment check (`withinBound`, consumed via `evaluateWriteSet({..., allowedPaths: [bound]})`). `overlap-policy.mjs`'s `within(path, bound)` helper — which `pathsOverlap`/`writeSetsOverlap` use to derive the O2 "file overlap" signal `forecastCollision` relies on — calls `evaluateWriteSet` with the *allowed*-path shape, not the case-folded prohibited-path shape. So the one containment check `forecastCollision` transitively depends on for its core purpose is the one that was never case-folded.

Confirmed via direct execution that **the module's own test suite would not have caught this**: ran `tests/integration-collision-forecast.test.mjs`, `tests/overlap-policy.test.mjs`, and `tests/write-set-policy.test.mjs` directly (106 tests total) — all pass, none exercises a case-differing path pair against the same bound/comparison. `tests/write-set-policy.test.mjs` has exactly one uppercase-path literal (`"src/GATEWAY/secret.mjs"`, line 143), used for an unrelated absolute/prohibited check, not a same-file-different-case comparison. This directly answers the task's framing question: **Codex's own review process (3 self-reviews + independent review + cross-review, 20/20 probes) did not include this angle and would not have caught the bug this session found independently** — the collision-forecast module trusted `overlap-policy.mjs` (itself trusting `write-set-policy.mjs`) via a byte-identity pin that guarantees *no drift*, not *correctness* at this specific boundary, and no test exercised that boundary.

## 3. Schema/contract edge cases

- **Unbounded string lengths (real gap, not previously flagged):** `integration-queue-entry.schema.json` sets `minLength: 1` on `queue_entry_id`, `candidate_branch`, `session_id`, `work_package_id`, `project_id`, `submitted_by`, `base_ref` but **no `maxLength` on any of them**. Confirmed by direct `validateContract` call: a 100,000-character `queue_entry_id` and a 50,000-character `candidate_branch` are both **accepted**. Since `entryId = "${queue_entry_id}@v${version}"` is persisted forever in an append-only ndjson ledger (no compaction), this is a real, untested resource-growth gap — low severity (no bypass of any gate), but worth a `maxLength` fast-follow alongside #94.
- **`declared_write_set`:** `minItems: 1`, but no `maxItems` and no per-item `maxLength` either — same class of gap, lower urgency since write-sets are typically small and already bounded by `write-set-policy.mjs`'s own path grammar.
- **Investigated and ruled out — `entryId` delimiter ambiguity:** considered whether a `queue_entry_id` containing the literal substring `@v` followed by digits could produce a colliding `entryId` string for a different `(queue_entry_id, version)` pair (e.g., forging `"foo@v1"` + version `2` to collide with some other decomposition). Worked through the string construction: because `version` is schema-typed as an integer (never contains `@v` itself) and `entryId` is built by simple concatenation, the trailing `"@v" + <all-digit run to end of string>` decomposition is always unique for any given resulting string. **No collision is possible here** — not reporting as a finding.
- **`candidate_tip_commit` pattern** (`^[a-f0-9]{7,40}$`) correctly rejects uppercase hex, which is consistent with real Git SHA casing; not a gap.

## 4. Cross-consumer trust

`integration-collision-forecast.mjs`'s header explicitly documents that it reuses `evaluateOverlap` "read-only and unmodified" and adds "no path-containment logic ... of its own" — a deliberate, disclosed design choice, not an oversight. The undisclosed part is the **assumption that reuse-without-reimplementation also means reuse-without-verification-of-the-dependency's-own-correctness-boundaries**. §2 shows that assumption doesn't hold: `forecastCollision` inherits whatever `evaluateOverlap`/`evaluateWriteSet` get wrong, silently, with no defense-in-depth check of its own (e.g., no case-normalization at its own boundary, no cross-check against a second oracle). This is the same shape of risk the byte-identity guards are designed to catch for *drift* but structurally cannot catch for *pre-existing upstream defects* — a byte-identity pin proves "unchanged," not "correct."

## 5. Hardcoded test-ID branching

Grepped both files for test-ID special-casing, debug bypasses, or environment-conditional logic (`test`, `debug`, `NODE_ENV`, `bypass`, `skip`, literal ID comparisons other than the documented `queue_entry_id`/`candidate_branch` business logic). **None found.** All matches were doc-comment prose or the legitimate `latestByEntryId`/`#detectDuplicateClaim` business logic.

## 6. Test results

- Module's own test files run directly in the isolated worktree: `node --test tests/integration-collision-forecast.test.mjs tests/integration-queue-ledger.test.mjs tests/overlap-policy.test.mjs tests/write-set-policy.test.mjs` → **106/106 pass, 0 fail**.
- Full suite: `npm test` → **1249 tests, 1246 pass, 0 fail, 3 skipped** (skips are pre-existing, unrelated to MOD-INTEG — S2 undefined-transition / pairwise-distinct tests in other modules).
- `git merge-base --is-ancestor d902e94 origin/main` → **not an ancestor**, confirming the case-fix (PR #94) is genuinely unmerged and main genuinely carries the bug reproduced in §2.

## 7. Confidence

**High** on all findings reported. The S1 atomic-gate result was reproduced twice (8-process and 16-process runs) with consistent outcomes and a verified-clean ledger each time. The S2 false-negative was reproduced by direct execution against the real, unmodified module (not a mock or a re-derivation) and cross-checked against the actual test files' content via `grep` to confirm no coverage exists. The schema gap was confirmed by direct `validateContract` execution, not inference from reading the schema alone.

---

Source: fresh independent execution in an isolated detached-HEAD git worktree off `origin/main` @ `942d09f` (no live branch touched, no push). Timestamp: 2026-07-22. Agent ID: `claude-immune-third-review-integ-01` (Claude, BST-SA Immune, advisory-only, worker role — not an approving authority; per ADR-0015 R5 and the BST-SA Dual-Agent Self-Certification Rule, this advisory packet is self-certified for completeness only, not self-authorized for execution or merge).
