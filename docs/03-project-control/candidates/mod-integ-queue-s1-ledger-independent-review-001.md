# MOD-INTEG Slice S1 — Queue-Entry Contract + IntegrationQueueLedger — Independent Review

**Record ID:** mod-integ-queue-s1-ledger-independent-review-001
**Status:** ADVISORY — NOT EFFECTIVE (no merge/execution authority)
**Reviewer:** REV/SEC role, independent of the producer, no prior relationship to this change
**Date:** 2026-07-21
**Branch reviewed:** `bst/mod-integ-queue-s1-ledger` @ `19a695642dcf3b4f17cc9f61884a10af80810a44`
**Base:** `origin/main` @ `385ac65943f2a5b158c8ec20a5fd947f06cd2987` (verified via `git merge-base` in-repo — matches exactly)
**Producer record reviewed:** `docs/03-project-control/candidates/mod-integ-queue-s1-ledger-producer-verification-001.md`
**Assessment reviewed:** `docs/03-project-control/candidates/mod-integ-queue-gap-assessment-001.md` (`bst/mod-integ-queue-assessment` @ `241a483`)
**Working copy used:** fresh, isolated detached-HEAD worktree at `19a6956` (`.claude/worktrees/revsec-mod-integ-s1-<timestamp>`, created via `git worktree add --detach`, `npm ci`), separate from the producer's own worktree at `.claude/worktrees/mod-integ-queue-s1-ledger`, which was not touched. No changes were made to the reviewed branch except this record, committed via a second, separate detached-HEAD worktree + `git update-ref` (see Provenance).

## Verdict

**APPROVE_WITH_NOTES**

The atomic duplicate-claim gate (MI-2) is genuine and holds under independent, adversarial reproduction — including a stronger variant than the producer's own PROBE1 test (a second instance's `read()` made to *lie* by returning an empty array rather than merely throwing). The "latest version per `queue_entry_id`" reduction the producer says they self-caught pre-commit is correct for every reachable history, and the one theoretically-fragile branch (a tie on equal version numbers) is provably unreachable through the public API. All producer-claimed test counts, `validate-foundation.mjs` exit status, and the "not wired anywhere" / "no hardcoded test-ID branching" claims were independently reproduced exactly. One real, non-blocking gap was found and is disclosed below: the schema and ledger enforce no status **transition** validity at all — a caller can insert `status: "MERGED"` directly as version 1, or move a terminal entry backward to `SUBMITTED` under the same `queue_entry_id` — this was never named as an S1 requirement in the assessment, so it is not a scope violation, but it should be closed (or explicitly deferred by name, the way MI-3/MI-4/MI-5 were) before this ledger is ever consumed by a live gate that trusts `status` as proof a merge actually happened.

---

## 1. Test counts (reproduced independently)

Ran `npm test` myself in a fresh, isolated worktree (`git worktree add --detach`, then `npm ci` from scratch — no `node_modules` reused from any other checkout):

| | tests | pass | fail | skipped |
|---|---|---|---|---|
| Branch, `19a6956`, fresh isolated worktree + `npm ci` | 1122 | 1117 | 0 | 5 |

Exact match to the producer's claimed **1098/1093/0/5 (before) → 1122/1117/0/5 (after)**. I did not additionally re-clone `origin/main`@`385ac65` for a from-scratch "before" run (the delta is unambiguous: `git diff --stat` shows only additive new test files plus the 6 mechanical repin diffs reviewed in §5, so the arithmetic is not in question), but the "after" count matches to the digit.

Ran the new test file in isolation as a sanity check:
```
node --test tests/integration-queue-ledger.test.mjs
```
→ **24/24 pass**, matching the producer's claimed new-test count exactly.

`node tools/validate-foundation.mjs` → top-level `"status": "PASS"`, exit code `0`, confirmed directly (not inferred from the test suite alone).

## 2. Schema review (`contracts/integration-queue-entry.schema.json`)

Read directly. Draft 2020-12, `additionalProperties: false`, 13 required fields, matches the house style of the other 17 closed contracts.

- **`content_hash`**: `{"type": "string", "pattern": "^[a-f0-9]{64}$"}`. Probed directly against `validateContract("integrationQueueEntry", ...)`:
  - empty string → **rejected** ✓
  - 63-char hash (one short) → **rejected** ✓
  - 65-char hash (one long) → **rejected** ✓
  - uppercase hex (`"B".repeat(64)`) → **rejected** (pattern is lowercase-only) ✓
  - Constraint is sound; no bypass found.
- **`candidate_tip_commit`**: `{"pattern": "^[a-f0-9]{7,40}$"}` — reasonable bound for a git abbreviated-or-full SHA; not independently fuzzed beyond pattern inspection (low risk, same shape as `content_hash`, already proven sound above).
- **`status`**: closed enum (`SUBMITTED`/`IN_REVIEW`/`MERGED`/`REJECTED`, no other value accepted) — confirmed the enum itself is closed. **However, the schema (correctly, since a JSON Schema validates one record in isolation) enforces nothing about which status a given `queue_entry_id`'s *first* version, or any subsequent version, is allowed to hold relative to its prior version.** Nothing else in `integration-queue-ledger.mjs` enforces this either — `appendEntry` validates the contract shape and runs the duplicate-claim gate only. Concretely reproduced (fresh probe script, not the producer's tests):
  - `appendEntry({ queue_entry_id: "q1", version: 1, status: "MERGED" }, ...)` as the **very first** append for that id → **succeeds** (`ok: true`). A caller can claim an entry was merged without ever having gone through `SUBMITTED`/`IN_REVIEW`.
  - `appendEntry({ queue_entry_id: "q1", version: 3, status: "SUBMITTED" }, ...)` after `v1 SUBMITTED → v2 MERGED` → **succeeds** (`ok: true`). A terminal (`MERGED`/`REJECTED`) entry can be walked backward to an active state under its own id, with no gate objecting (this is distinct from, and not covered by, the producer's own "resubmission under a NEW queue_entry_id" test).
  - `appendEntry({ queue_entry_id: "q1", version: 99, ... })` immediately after `version: 1` → **succeeds**; version numbers are not required to be contiguous/monotonic-by-1.
  - **Disposition:** I checked the gap assessment (`mod-integ-queue-gap-assessment-001.md`) for whether status-transition-validity was a named S1 requirement. It is not — MI-2 is specifically "atomic duplicate-claim check," and no MI item names transition enforcement as in-scope for any slice (MI-5 is ordering/priority, a different concern). So this is **a real gap, but not a silently-dropped scope item** — it was simply never asked for. Flagging it here because the module's own header comment states the ledger enforces "the one atomic invariant this module exists to enforce: a candidate branch cannot be claimed... by two independent queue entries at once" — true and verified (§3) — but a reader could reasonably assume `status` transitions are also gated given how central lifecycle state is to the design-decisions section of the producer's own record. They are not, today.

## 3. The atomic duplicate-claim gate (MI-2) — independent adversarial reproduction

Wrote a fresh probe script (not copied from `tests/integration-queue-ledger.test.mjs`), importing only the public `IntegrationQueueLedger` class, run against my own isolated worktree.

### 3.1 PROBE1 reproduction (throw variant, as producer tested)
Second instance's public `read()` overridden to `throw`. Result: **denied**, `DENY_QUEUE_DUPLICATE_CLAIM`, `read()` call count confirmed **0** (instrumented the override to count invocations, not just to throw). Matches the producer's claim exactly.

### 3.2 Stronger variant: `read()` LIES instead of throwing
This goes beyond the producer's own coverage. Overrode the second instance's `read()` to return `[]` (silently claims the ledger is empty) rather than throwing. If the gate ever fell back to a separate `this.read()` call for *any* reason (e.g. a future refactor that catches the throw and retries via `read()`), a lying-but-not-throwing override is the scenario that would actually let a second claim land, since a throw is comparatively easy to notice/guard while a wrong-but-quiet answer is not. Result: **still correctly denied**, `DENY_QUEUE_DUPLICATE_CLAIM`. This is the strongest available proof that the gate's `records` parameter (supplied only via `DurableLedger.append`'s locked, freshly-verified read, per `durable-ledger.mjs`'s `preWriteCheck` contract) is the sole source of truth — a hostile `read()` cannot influence the decision in either direction (confirmed both an over-permissive lie in §3.2 and, separately, that a `read()`-throws ledger still allows a legitimate non-conflicting append with no false deny, matching the producer's own second test).

### 3.3 Code-path confirmation
Read `src/ledger/durable-ledger.mjs`'s `append()` directly: `records` is read and hash-chain-verified (`#readRecords()` + `#verifyRecords()`) **before** `preWriteCheck` is invoked, and is passed to the hook as `structuredClone(records)` — the exact same snapshot the write itself is about to use, never a second independent read. `#detectDuplicateClaim` in `integration-queue-ledger.mjs` takes `records` only as this parameter and contains no reference to `this.read()` anywhere in the file (confirmed by direct read of the full 286-line source, not grep alone). The atomicity claim holds by construction, not merely by the tests that happen to exercise it.

**Conclusion: the duplicate-claim gate genuinely closes the TOCTOU class named in MOD-LIVE/MOD-WSPACE. Held up under both my own reproduction and a deliberately harder variant.**

## 4. Version-reduction ("latest version per `queue_entry_id`") — adversarial histories

The producer's own record discloses a self-found-and-fixed pre-commit bug (an older active version resurrecting a since-MERGED/REJECTED entry). Independently constructed and ran the following, beyond the producer's own fixtures:

- **Interleaved queue entries on one branch** (`qX`: SUBMITTED→REJECTED terminal; then `qY`: fresh SUBMITTED→IN_REVIEW; then `qZ` attempts a claim): correctly denies `qZ` and correctly attributes the conflict to `qY` (the live entry), not `qX` (terminal, superseded). ✓
- **MERGED → new SUBMITTED under a DIFFERENT `queue_entry_id`, same branch:** correctly allowed (fresh claim). ✓ — matches producer's own test.
- **MERGED → SUBMITTED again under the SAME `queue_entry_id` (backward transition):** succeeds with no gate objecting — see §2's status-transition finding; this is a schema/state-machine gap, not a version-reduction bug (the reduction itself correctly identifies `v3 SUBMITTED` as the entry's current state; it simply has no opinion on whether that transition was *legal*).
- **Two records at the identical `(queue_entry_id, version)` pair via the public API:** confirmed this is **already prevented one layer down**, in the base class, before `latestByEntryId`'s tie-break logic (first-wins-on-equal-version-number) could ever matter — `DurableLedger.append`'s duplicate-`entryId` check (`entryId = "${queue_entry_id}@v${version}"`) throws `DENY_DUPLICATE_ENTRY_ID` on the second attempt, and this check runs **before** `preWriteCheck`/`#detectDuplicateClaim` is ever invoked. Confirmed directly by reading `durable-ledger.mjs`'s `append()` ordering.
- **Hand-tampered ledger file forcing two same-version records for one `queue_entry_id`, bypassing `append()` entirely:** appended a forged second record with a broken hash chain but a duplicate-version payload directly to the ndjson file. `resolveActiveClaim` (and, by the same code path, the gate on any subsequent `appendEntry`) throws `LEDGER_INTEGRITY_FAILURE` before `latestByEntryId` is ever reached — the hash-chain verification in `#verifyRecords()` runs first and rejects the tampered file outright.
- **Conclusion:** `latestByEntryId`'s "first record wins on an exact version tie" branch is real code but **provably unreachable** through both the intended API and a direct file-tamper bypass, given the layers above it (base-class entryId dedup, then hash-chain integrity). Not a live defect. Worth a one-line comment in the source noting *why* the tie-break is unreachable (for the next reader who might otherwise assume it's exploitable), but not a merge blocker.

## 5. `candidate_branch` collision edge cases

Probed cases not in the producer's fixtures:
- **Case variants** (`feature/x` vs `feature/X`): treated as distinct branches — no case-folding anywhere in the schema or gate, so both can hold concurrent active claims. This matches plain-string schema semantics (no `format`/normalization declared) and is consistent with git's own byte-exact ref-name comparison; flagging only because a case-insensitive filesystem (default on Windows/macOS) could in principle let two "different" claimed branches collide at the git level even though this ledger sees them as unrelated. Out of scope for a pure ledger primitive; a future submission-layer gateway (not built in this slice) should canonicalize the branch string before calling `appendEntry` if this matters operationally.
- **Trailing-whitespace variant** (`feature/x` vs `feature/x `): same — treated as distinct, no normalization. Same disposition as above.
- Neither is a defect in this slice; both are pre-existing, inherent properties of an unconstrained string field, disclosed here as forward-looking notes rather than findings against this commit.

## 6. "Not imported by any service/gateway" claim

Independently grepped (not trusting the producer's own test alone, though it duplicates this exactly):
```
grep -rln "integration-queue-ledger" src/services src/gateway src/live src/control
```
→ **zero matches.** Additionally ran a broader, unscoped sweep across all of `src/` for both the filename and the class name (`IntegrationQueueLedger`) outside the ledger's own file: **zero matches.** Confirmed unwired.

## 7. Hardcoded test-ID branching

```
grep -rniE "test-id|testId|TEST_ID|__TEST__" src/ledger/integration-queue-ledger.mjs contracts/integration-queue-entry.schema.json
```
→ **zero matches.** Confirmed no environment- or fixture-identity conditional logic anywhere in the new source.

## 8. Ancillary checks

- **`MANIFEST.json`**: diff reviewed directly — additive only (6 new paths appended: schema, both fixtures, ledger source, test file, producer verification doc). No removals, no reordering beyond the append.
- **`src/contracts/contract-validator.mjs`**: one additive line (`integrationQueueEntry: "integration-queue-entry.schema.json"`), consistent with every other registered kind.
- **`tools/validate-foundation.mjs`**: additive registration of the 18th schema plus its `mandatoryIdentityFields` entry; comment updated to match (7 canonical + 11 governed extensions). Confirmed via direct diff read, and confirmed executable (§1, exit 0).
- **6 repinned byte-identity guard tests** (`cadence-policy`, `event-family-policy`, `kpi-registry`, `overlap-policy`, `replay-assembler`, `scorecard-assembler`, `write-set-policy`): all repin `tools/validate-foundation.mjs`'s expected blob hash from the post-MOD-WSPACE-S3 value (`d0ba1e9...`) to the same new post-MOD-INTEG-S1 value (`fb38ca5...`) across all six files — confirmed identical target hash in every diff, consistent with a single genuine source change (not six independently-drifted pins). `write-set-policy.mjs`'s own byte-identity guard, `overlap-policy.mjs`'s, and the `durable-ledger.mjs`/sibling-ledger guard inside the new test file itself all passed in the full-suite run (§1) — i.e. this slice's own claim that it touched no other governed source file is independently confirmed by the very tests designed to catch that class of drift, executed in my own from-scratch worktree, not merely trusted from the producer's report.
- **`workspace-lease-ledger.test.mjs`**: its own schema-directory byte-identity guard was hardened to skip schemas that postdate its own BASE commit (via a `git cat-file -e ${BASE}:...` existence check) before adding the new schema to its guarded set — read the diff directly; this is a correct, forward-compatible fix (a schema added by a later, separately-scoped slice should not retroactively break an earlier slice's byte-identity guard), not a weakening of the guard for anything that existed at that guard's own base.
- **`docs/.../module-completion-tracker-001.md`**: diff is exactly one appended line, consistent with this project's extend-only convention; content matches the producer's own record's claims (test counts, scope, base commit) with no discrepancy found.
- **`resolveActiveClaim` / `resolveEntry` frozen-output discipline**: confirmed via the existing test (and spot-checked independently) that returned objects and nested arrays are genuinely deep-frozen, not just top-level-frozen.

## Status fields

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: existing
risk_class: low
self_certification:
  agent_id: claude-revsec-modintegqueue-s1
  peer_agent_id: claude-motor-modintegqueue-s1 (producer of the reviewed commit; no relationship to this review)
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

## Disposition

**APPROVE_WITH_NOTES.**

- The atomic duplicate-claim gate (MI-2) is genuine: independently reproduced the producer's own PROBE1 pattern from a fresh script, then went further with a `read()`-lies (returns stale-but-plausible empty state, no throw) variant that is a strictly harder bypass to defend against than a throw — the gate held in both. Direct source read confirms `records` is supplied only via `DurableLedger.append`'s locked, pre-verified snapshot; the gate contains no call to `this.read()` anywhere in the file.
- The "latest version per `queue_entry_id`" reduction is correct for every constructible history, including interleaved multi-entry, terminal-then-fresh-claim, and out-of-order-append scenarios. The one theoretically fragile branch (equal-version tie-break) is provably unreachable given the base ledger's own `entryId` dedup and hash-chain integrity verification, both of which run first.
- All claimed test counts (1122/1117/0/5, 24/24 new tests standalone, `validate-foundation.mjs` exit 0/PASS) were independently reproduced exactly, in a from-scratch isolated worktree with its own `npm ci`.
- No hardcoded test-ID branching found; "not imported by any service/gateway" confirmed via an independent, broader grep than the producer's own test scope.
- **One real, non-blocking gap disclosed:** neither the schema nor the ledger enforces status-transition validity — direct-to-`MERGED`-on-first-insert and terminal-state-reversal-under-the-same-id both succeed today. This was never named as an S1 requirement in the gap assessment (unlike MI-3/MI-4/MI-5, which were explicitly deferred by name), so it is not a scope violation by the producer, but it should be named and either closed or explicitly deferred before any later slice (S2/S3) or live consumer trusts `status` as tamper-evident proof that an actual merge/rejection decision occurred.
- Minor, non-blocking notes: `candidate_branch` has no case- or whitespace-normalization (inherent to an unconstrained string field, likely a submission-layer concern for a later slice, not this one); `latestByEntryId`'s equal-version tie-break branch would benefit from an inline comment explaining why it is unreachable, for the next reader.

This record carries no merge/execution authority. It is prepared for asynchronous GOV/operator ratification per this project's advise-and-proceed convention.

## Provenance

- source: first-hand independent review in a fresh, isolated detached-HEAD worktree (`.claude/worktrees/revsec-mod-integ-s1-<timestamp>`, `git worktree add --detach <path> 19a6956`, own `npm ci`), separate from the producer's own worktree; own adversarial probe script (not derived from `tests/integration-queue-ledger.test.mjs`); direct reads of every changed file's diff against `origin/main`@`385ac65`
- agent_id: claude-revsec-modintegqueue-s1 (BST-SA REV/SEC, Claude Sonnet 5)
- timestamp: 2026-07-21
- disposition: advisory, non-main branch, committed via a separate isolated detached-HEAD worktree + `git update-ref` (no push, no merge, no operator ratification) — awaiting operator/GOV review alongside the producer's own record
