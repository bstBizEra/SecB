# MOD-KNOW Slice S3 — Second Independent Adversarial Review (mod-know-s3-second-independent-review-001)

- reviewer_identity: `claude-rev-sec-modknow-s3-second-01`
- review_role: BST-SA REV/SEC (independent second look, advisory-only worker)
- target: MOD-KNOW S3 — `src/services/knowledge-candidate-provider.mjs` (`[MOD-KNOW-S3] Knowledge CandidateSource provider (pure mapper)`, originally `ce9957f`, now on `main`)
- base / verification tip: `origin/main` @ `ec5aa76` (detached-HEAD isolated worktree, no live branch touched)
- prior records consulted (not trusted, independently re-derived): `mod-know-s1-rev-001.md` (APPROVE, 0 findings), `mod-know-s2-rev-001.md` (APPROVE_WITH_NOTES, 1 LOW: read-path cross-project scope asymmetry in `resolveCurrent`), `mod-know-completion-rev-001.md` (FINISHED_WITH_TRACKED_FOLLOWUPS — the only review that has looked at S3 directly, as one section of a broad module-completion pass)
- why this review exists: S1 and S2 each received a dedicated slice-level adversarial review; S3 never did — only the one broad completion review touched it. This record is that missing dedicated pass, run independently (own worktree, own probes, no reuse of the completion review's harness).

## Verdict

> **APPROVE_WITH_NOTES**

S3 (`knowledge-candidate-provider.mjs`) is a small, well-disciplined pure mapper. Every core guarantee claimed in its header — honest `verified`/`classification` mapping, contested-but-included annotation, exclusion-accounting invariant, determinism, frozen output, fail-closed construction — reproduces first-hand against both fake collaborators and the real S1+S2+port+mint stack. No provenance-leakage gap, no stale-supersession (check-then-act) gap, and no identity-continuity/spoofing gap analogous to MOD-WORK's `producerActorId` were found. One new LOW-severity gap was found and is not yet tracked anywhere: **`resolveCurrency` validates the collaborator's DENY shape but not its ALLOW shape**, so a linkage-service response of `{decision: "ALLOW", current_claim_id: ref, claim: <malformed>}` reaches `projectEntry` unchecked and throws, violating the module's own documented "never throws per-ref" invariant. It is not reachable through the real, ratified S1+S2 stack today (S2 always returns a well-formed claim on ALLOW), so it does not block merge (already merged) or require a fast-follow on urgency grounds — but it is a real, previously-unfound asymmetry in the same file, and is recorded here as a note for the next touch of this module.

## Method

- Fetched `origin/main`, created an isolated `git worktree add --detach` (no live branch touched, no push): `C:/Users/ounkh/SecB-worktrees/mod-know-s3-second-review-001` @ `ec5aa76`.
- Read the full S3 implementation (`src/services/knowledge-candidate-provider.mjs`, 285 lines) plus S1 (`knowledge-claim-service.mjs`) and S2 (`knowledge-linkage-service.mjs`) in full, since S3 composes over both. Read the completion review (`mod-know-completion-rev-001.md`) and the S2 review (`mod-know-s2-rev-001.md`) for context, but treated neither as ground truth — every claim below was independently re-derived from the code and from fresh probes, not copied from those records.
- Read `src/services/candidate-source-port.mjs` (MOD-CONTEXT S2, the RECEIVE half of the boundary) and `src/services/context-retrieval-policy.mjs` (`runRetrieval`) only far enough to determine which invariants are enforced downstream vs. which must hold in KNOW's own provider — did not re-review MOD-CONTEXT's S2/S3 logic itself (that is explicitly another agent's parallel scope).
- Ran `npm ci` (6 packages, clean), then the full suite and the module's own test files directly, plus the foundation validator.
- Wrote and ran two adversarial probes against the real module with hand-built fake collaborators (not the producer's test doubles), outside the committed test suite (not committed — ephemeral, per script-management discipline).
- Grepped for hardcoded test-ID branching in the knowledge-service files.

## Test results

| Check | Result |
|---|---|
| `npm ci` | 6 packages, clean |
| `npm test` (validator + full suite) | validator 757/757 PASS, exit 0; suite **tests 1115, pass 1113, fail 0, cancelled 0, skipped 2, todo 0** |
| `node --test tests/knowledge-claim-service.test.mjs tests/knowledge-linkage-service.test.mjs tests/knowledge-candidate-provider.test.mjs` (module files, direct) | **tests 73, pass 73, fail 0, skipped 0** |
| `node tools/validate-foundation.mjs` | 757 checks, 0 fail, exit 0 |

(The completion review measured 632 total tests at S3's original tip `ce9957f`; `main` has grown to 1115 total tests since — expected, as many other modules have landed. The knowledge-service-specific totals are unaffected and match: 73/73 pass both times.)

## Focus-area findings (adversarial, independently derived)

### 1. Claim identity/provenance leakage into federation — not found

`projectEntry` computes `verified` strictly as `claim.truth_status === "verified_true" && !contested` (line 219) and forces `verified:false` whenever the current claim carries any live contradiction, regardless of `truth_status`. Reprobed directly: for all six `truth_status` values only `verified_true`-and-uncontested yields `verified:true`; a contested `verified_true` claim is forced to `verified:false`. There is no path that upgrades an unverified/contested claim to look equivalent to a verified one. `provenance.origin` is a fixed literal (`"knowledge-ledger"`) and `retrieved_at` is a single server-clock read per projection — both honest, neither claims more provenance detail than the schema carries. The claim's own asserter (`actor_id`) is not carried into the CandidateSource entry at all, but this is a limitation of the shared port schema (`candidate-source-port.mjs`'s `PROVENANCE_KEYS = ["origin","retrieved_at","content_hash"]` has no asserter-identity field) — the same limitation would apply to every provider feeding this port, not something S3 introduced or could unilaterally fix without changing the shared B1 boundary. No leakage/flattening bug in KNOW's own mapping.

### 2. Supersession/contradiction state at the provider boundary (check-then-act) — not found

`resolveCurrency` calls `linkageService.resolveCurrent(ref)` fresh, per ref, inside the same `toCandidateSources` call — there is no cached/earlier snapshot reused. If `current_claim_id !== ref`, the ref is excluded `CURRENT_SUPERSEDED` carrying the winner's id; only the currently-winning claim (from S2's own read, at whatever instant S2 resolves it) is ever projected. Verified with a real-stack probe mirroring the shipped feed-forward test: after a real `recordSupersession(kc_a → kc_b)`, projecting `["kc_a","kc_b"]` includes only `kc_b` and excludes `kc_a` as `CURRENT_SUPERSEDED`. There is no earlier-read/later-act window inside S3 itself — the one place a genuine stale-supersession asymmetry exists (S2's `resolveCurrent` following a raw, service-bypassing cross-project edge without re-checking scope) is already tracked as NOTE-1 in `mod-know-s2-rev-001.md` and item 3 of the completion review's follow-ups; it requires a foreign writer bypassing the scope-gated write path, is bounded by `data_untrusted` + full `lineage[]` visibility, and — new observation added here — is further bounded downstream by `context-retrieval-policy.mjs`'s stage-1 `project-scope` drop (`s.projectId !== projectId`), which would exclude a cross-project winner's entry from any retrieval whose `projectId` is the anchor's project. Not re-flagged as new; confirmed still accurate and now shown to be doubly bounded.

### 3. Silent-fail-open on malformed claim data — found (LOW, new)

`resolveClaim` (the S1 read path) explicitly validates `isPlainObject(resolution) && resolution.decision === "ALLOW" && isPlainObject(resolution.claim)` before treating a result as usable (line 165) — a malformed `claim` on an otherwise-ALLOW response is correctly denied. `resolveCurrency` (the S2 read path, five lines below) does **not** perform the analogous check: it validates `isPlainObject(currency) && currency.decision === "ALLOW"` and then, if `currency.current_claim_id === ref`, returns `{ claim: currency.claim, ... }` **without ever checking `isPlainObject(currency.claim)`**. `projectEntry` then dereferences `claim.project_id` / `claim.classification` / `claim.truth_status` / `claim.content_hash` unconditionally.

Reproduced first-hand with a hand-built fake `linkageService` (not the shipped one) returning `{ decision: "ALLOW", current_claim_id: ref, contradictions: [], claim: undefined }`:

```
provider.toCandidateSources({ project_id: "p1", refs: ["kc_a", "kc_ok"] })
→ THREW: TypeError: Cannot read properties of undefined (reading 'classification')
```

This is not a data leak (nothing false is asserted; the call crashes rather than smuggling bad data through), but it does violate the module's own stated invariant — the file header promises "each ref maps to exactly one outcome … nothing throws per-ref (deny-by-default)" — and the crash takes down the **entire batch** (both `kc_a` and `kc_ok` in the probe, not just the malformed one), which is worse than a per-ref deny would be. It is not reachable via the real, ratified S2 (`knowledge-linkage-service.mjs` always returns a `structuredClone` of an S1-resolved, schema-valid claim on ALLOW, or a `DENY_BROKEN_LINEAGE`/passthrough denial otherwise) — construction-time checks only verify `typeof linkageService.resolveCurrent === "function"`, not the runtime shape of what it returns, so this is a latent robustness gap rather than a live exploit against the shipped stack. It would become live the moment any future rewire injects a non-conforming `linkageService` (bug or otherwise) into this provider. **Recommendation (advisory, non-blocking):** add the same `isPlainObject(currency.claim)` guard to `resolveCurrency`'s ALLOW branch that `resolveClaim` already has, denying `KNOWLEDGE_UNRESOLVED` / a new `DENY_LINKAGE_MALFORMED_CLAIM` code instead of falling through to `projectEntry`. A regression test with a fake linkage service returning a malformed-but-ALLOW claim should accompany the fix.

### 4. Identity-continuity gap analogous to MOD-WORK's `producerActorId` — not found

S3 holds no write path and introduces no new identity fields; it only ever echoes `claim.project_id` and does not surface `actor_id` at all (see finding 1). S2's `recordSupersession`/`recordContradiction` do not require the asserting actor to match the original claim's `actor_id` or admission `approver` — but this is a documented, honest design choice (S2's header: "REGISTRATION + LINKAGE ONLY... an asserted, approved linkage... nothing more"), gated by its own independent asserter/approver/reviewer SoD, not a false claim of continuity being smuggled through. No re-versioning path exists in this module that could let one actor's identity silently persist onto a claim actually produced by a different actor — there is no `version`-based mutation of an existing claim_id at all (claims are admitted once, immutably; "current version" is entirely a function of sidecar SUPERSEDES edges pointing at a *different* claim_id, never an in-place identity carry-forward on the *same* id). No MOD-WORK-shaped gap found.

## Hardcoded test-ID branching

`grep -nE "test[_-]?id|===\s*['\"](kc_|test_|TEST_)|if.*claim_id\s*===" src/services/knowledge-*.mjs` → **no matches**. No test-only branches or hardcoded ID special-casing found in any of the three knowledge-service source files.

## Findings by severity

- CRITICAL: none
- HIGH: none
- MEDIUM: none
- LOW:
  1. **NEW — `resolveCurrency` ALLOW-branch shape validation asymmetry** (finding 3 above). Not reachable via the real ratified stack today; recommend closing at the next touch of this file with a regression test.
- INFORMATIONAL:
  1. S2 NOTE-1 (cross-project read-path scope asymmetry, already tracked in `mod-know-s2-rev-001.md` and the completion review) is confirmed still accurate on re-derivation and is additionally bounded by `context-retrieval-policy.mjs`'s stage-1 project-scope filter — a downstream defense not previously called out in either prior record.
  2. The provider's discarded first S1 read (`resolveClaim(ref)` in `toCandidateSources`, whose `.claim` is fetched but never used — only `currency.claim` from the subsequent S2 call is projected) is redundant work, not a bug: it can only ever tighten (not loosen) the final result, since S2's own `resolveCurrent` re-resolves the winner via S1 internally anyway.

## Required status fields

- truth_status: verified_true (all findings re-derived first-hand from code at `ec5aa76`; test totals measured directly, not copied from prior records)
- authority_status: advisory_only (this module is already merged to `main`; no execution or merge authority is exercised or implied by this record)
- implementation_status: existing (S1/S2/S3 all ratified on `main`)
- risk_class: low

## self_certification

```yaml
self_certification:
  agent_id: claude-rev-sec-modknow-s3-second-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

## Provenance

- source: first-hand independent adversarial verification in an isolated detached-HEAD worktree of `C:\laragon\www\SecB` (`C:/Users/ounkh/SecB-worktrees/mod-know-s3-second-review-001`), fetched from `origin/main` @ `ec5aa76`
- agent_id: claude-rev-sec-modknow-s3-second-01 (BST-SA REV/SEC, Claude Sonnet 5)
- timestamp: 2026-07-21T12:55:08Z
- verdict: APPROVE_WITH_NOTES (advisory; no execution or merge authority exercised; module already merged via PR #20)
