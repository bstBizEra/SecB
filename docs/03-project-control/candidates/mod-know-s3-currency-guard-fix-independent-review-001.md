# MOD-KNOW S3 — Currency-Path Malformed-Claim Guard Fix — Independent Review 001

**Record ID:** mod-know-s3-currency-guard-fix-independent-review-001
**Status:** DRAFT / ADVISORY — NOT EFFECTIVE
**Reviewer identity:** BST-SA REV/SEC worker agent, independent from the producer (`claude-motor`) and from the original second-independent reviewer (`claude-rev-sec-modknow-s3-second-01`) — this is a third, separate agent instance/session.
**Worktree:** isolated detached-HEAD worktree checked out at `e62f33d3954af345790540daa896786b29febd5e`, branch `bst/mod-know-s3-currency-guard-fix-001`, base `origin/main @ ec5aa76cdc404ffbecfb5ca9de07a0c943da29b1` (confirmed via `git merge-base`). No changes made to the live branch; this record is written to a detached worktree and will be attached via `git update-ref`, not a live-branch commit.
**Governance frame:** advisory-only, worker role (BST-SA REV/SEC). This record authorizes nothing. No merge to `main`, no push, no PR opened. Per the standing BST-SA contract, Claude is a worker, not an approving authority.

## Scope of this review

Independent (third-party) verification of the producer's claimed fix for Finding 3 (LOW) of `mod-know-s3-second-independent-review-001`: `resolveCurrency` in `src/services/knowledge-candidate-provider.mjs` was missing the `isPlainObject(currency.claim)` guard its sibling `resolveClaim` already has.

## What was verified

### 1–2. Branch checkout and diff

Checked out `bst/mod-know-s3-currency-guard-fix-001` at `e62f33d` into an isolated worktree; confirmed `git merge-base` against `origin/main` is exactly `ec5aa76`, matching the stated base. Full diff (`+158 -0` across 4 files) read in full:

- `src/services/knowledge-candidate-provider.mjs` (+10): the added guard, placed immediately after the `CURRENT_SUPERSEDED` check and before `return { claim: currency.claim, ... }`, byte-for-byte as described in the producer record — same `isPlainObject` helper, same `exclude(ref, "KNOWLEDGE_UNRESOLVED", "DENY_LINKAGE_MALFORMED_CLAIM", ...)` shape as `resolveClaim`'s sibling guard.
- `tests/knowledge-candidate-provider.test.mjs` (+44): one new regression test, `"S3 resolveCurrency denies a malformed ALLOW claim per-ref instead of crashing the batch"`, reproducing the reviewer's exact fake-`linkageService` probe in a mixed batch (`kc_bad` / `kc_ok`).
- `docs/.../mod-know-s3-currency-guard-fix-producer-verification-001.md` (+103, new file) and one line appended to `module-completion-tracker-001.md` — documentation only, no source impact.

No other file touched. No export signature changed. `EXCLUSION_REASONS` vocabulary unchanged (new `DENY_LINKAGE_MALFORMED_CLAIM` is a passthrough `code`, not a new `reason`) — confirmed by reading the full 295-line file, not just the diff hunk.

### 3. Fresh reproduction of the exact scenario

Wrote a standalone script (not a copy of the producer's test) importing the fixed module directly, with a hand-built fake `linkageService.resolveCurrent` returning `{decision:"ALLOW", current_claim_id: ref, claim: undefined}` for `kc_bad` alongside well-formed `kc_ok` in the same batch. Result: no throw; `accounting = {requested:2, included:1, excluded:1}`; `kc_bad` excluded with `reason: "KNOWLEDGE_UNRESOLVED"`, `code: "DENY_LINKAGE_MALFORMED_CLAIM"`; `kc_ok` still resolves as `sources[0]`. Matches the producer's claim exactly.

**Baseline check (important, done independently):** re-ran the identical fresh script against the pre-fix (`ec5aa76`) version of the file, swapped in temporarily and reverted after. Confirmed it genuinely throws `TypeError: Cannot read properties of undefined (reading 'classification')` and crashes the whole batch pre-fix — the "before" behavior in the producer's record is real, not asserted.

### 4. Adversarial variations beyond the producer's single test case

All run against the fixed module in the fresh script, each with a well-formed neighbor in the same batch:

| Variation | Result (fixed) | Result (pre-fix, for comparison) |
|---|---|---|
| `claim: undefined` (exact finding scenario) | Denied, `DENY_LINKAGE_MALFORMED_CLAIM`; neighbor resolves | Throws, crashes whole batch |
| `claim: null` | Denied, `DENY_LINKAGE_MALFORMED_CLAIM`; neighbor resolves | Throws, crashes whole batch |
| `claim: [1,2,3]` (array) | Denied, `DENY_LINKAGE_MALFORMED_CLAIM`; neighbor resolves | **Does not throw** — silently produces a corrupted `CandidateSource` (`project_id: undefined`, etc.) that would have passed through to `normalizeCandidateSources` uncaught |
| `claim: "not-a-claim"` (string) | Denied, `DENY_LINKAGE_MALFORMED_CLAIM`; neighbor resolves | **Does not throw** — same silent-corruption outcome as the array case |
| 4 malformed refs (`undefined`, array, string, `null`) interleaved with 2 well-formed refs in one 6-ref batch | All 4 independently denied with the correct code; both good refs resolve; `accounting = {requested:6, included:2, excluded:4}` | Would throw on first `undefined`/`null` hit, silently corrupt on array/string |

**Finding (positive, not blocking):** the fix's benefit is broader than the original finding described. The finding and its regression test only exercised `claim: undefined` (an uncaught-throw case). Arrays and strings don't crash pre-fix (`claim.classification` etc. resolve to `undefined` via normal property access on non-null primitives/arrays, not a `TypeError`) — they instead silently produce a `CandidateSource` entry with `project_id: undefined` and other garbage fields, which is arguably worse than a crash (silent data corruption vs. a loud failure) and was NOT covered by the producer's own regression test. The `isPlainObject` guard closes this silent-corruption path too, as a byproduct of using the same "is this a plain object at all" check `resolveClaim` uses, rather than a narrower "is this `undefined`/`null`" check. This should be noted as an unstated-but-real additional benefit of the fix, not a gap — the fix already covers it; only the producer's test narrative under-describes the coverage.

**Ordering question (posed by the task):** does placing the guard after the `CURRENT_SUPERSEDED` check risk misclassifying a legitimately-superseded claim as something else if the *replacement* claim is malformed? Verified by construction: a ref that is genuinely superseded (`current_claim_id !== ref`) is excluded and returned at the `CURRENT_SUPERSEDED` branch unconditionally, before the new guard is ever reached — `currency.claim` is never inspected on that path. Built a probe where `resolveCurrent` returns `current_claim_id: "kc_new"` (i.e. the queried ref is not current) together with `claim: undefined`; result classified correctly as `CURRENT_SUPERSEDED` with `current_claim_id: "kc_new"`, never as `DENY_LINKAGE_MALFORMED_CLAIM`. The placement is correct: the guard only fires on the one path where `currency.claim` is actually dereferenced (the ref being its own current head), exactly as the producer's placement note claims.

### 5. Well-formed paths unaffected

Ran a normal current, well-formed, contested claim through the fixed module: included as before, `verified:false` from the contradiction annotation, `relevance` lowered, zero exclusions — behavior byte-identical to pre-fix for every well-formed path. No new false denials observed anywhere in the full suite (see below) or in the extra variations.

### 6. Full test suite, independently run

`npm test` in the isolated worktree (own copy of `node_modules`, same lockfile — no `package.json`/`package-lock.json` diff between `ec5aa76` and `e62f33d`): **tests 1116 / pass 1114 / fail 0 / skipped 2**, matching the claimed count exactly. `node tools/validate-foundation.mjs` → `PASS`. Module-scoped run (`knowledge-claim-service`, `knowledge-linkage-service`, `knowledge-candidate-provider`): **74/74 pass**, including the new regression test by name.

### 7. Hardcoded test-ID branching

`grep -nE 'test[_-]?id|===\s*["\x27](kc_|test_|TEST_)|if.*claim_id\s*==='` over `src/services/knowledge-*.mjs` → no matches. No hardcoded test-ID branching in source.

## Behavior preservation

Confirmed by reading the full file: no change to `resolveClaim`, `projectEntry`, `validateQuery`, `exclude`, the closed `EXCLUSION_REASONS` vocabulary, or any exported symbol. The module remains a pure, unwired mapper.

## Advisory status fields

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: existing
risk_class: low
```

```yaml
self_certification:
  agent_id: claude-rev-sec-modknow-s3-currency-guard-fix-001
  peer_agent_id: claude-motor
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

## Verdict

**APPROVE_FOR_MERGE**

The fix is narrow (+10 lines, one file touched at the source level), mirrors the sibling `resolveClaim` guard exactly, closes the exact crash scenario from the finding, and — as an unadvertised bonus verified independently — also closes a silent-corruption path (array/string malformed claims) the producer's own test didn't exercise. The guard's placement after the `CURRENT_SUPERSEDED` check is correct and does not risk misclassifying legitimately-superseded refs. Full suite count (1116/1114/0/2) and module suite (74/74) independently reproduced. No hardcoded test-ID branching. No regressions on well-formed paths. This record itself authorizes nothing beyond advisory verification; integration and merge remain an operator decision.

> Recommend improvements only. Do not execute them. This record neither merges nor authorizes merge; it certifies advisory/independent-review completeness only. Integration, PR staging, and ratification remain operator decisions.
