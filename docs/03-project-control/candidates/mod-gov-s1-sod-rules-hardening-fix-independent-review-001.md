# Independent Review: MOD-GOV-S1 SoD rules hardening fix

- record_id: MOD-GOV-S1-SOD-RULES-HARDENING-FIX-INDEPENDENT-REVIEW-001
- status: CANDIDATE (advisory; operator ratification and merge required)
- reviewer: claude-rev (independent, role REV/SEC, advisory_only, no merge/execution authority)
- peer_agent_id: null (no Codex counterpart engaged for this pass)
- base: `origin/main` @ `bd00c53ad88cf195830609fd6db7e5582391b684` (verified via `git rev-parse origin/main`)
- reviewed commit: `bst/mod-gov-s1-sod-rules-hardening-fix-001` @ `d5a076bac82a534d31f60fa0f65f4790f2dea1a1`
- reviewed artifact: `docs/03-project-control/candidates/mod-gov-s1-sod-rules-hardening-fix-producer-verification-001.md`
- worktree: isolated detached checkout at `.claude/worktrees/rev-sod-rules-hardening-fix-review-001` (not the live branch; no push, no merge)
- date: 2026-07-22

## Verdict

**APPROVE_WITH_NOTES**

Both of the original reviewer's findings are genuinely closed and the fix is
safe to merge. One additional, real gap was found during adversarial testing
that the producer's own safety claim does not actually hold in full — it does
not block merge (it is not a regression introduced by this fix; the
vulnerability class pre-dates it and is outside this fix's declared scope),
but it must be logged as a follow-up, and the producer verification doc's
Unicode-safety claim should be corrected/narrowed before being cited as
settled.

## 1. Original scenarios — independently reproduced, both closed

Ran a fresh, from-scratch adversarial script (not copied from
`tests/sod-rules.test.mjs`) against the built commit:

- `checkProhibitedActors(normalizeRole("Rev"), "same-actor", {producer:
  "same-actor"})` now denies (`ok:false`) identically to the `"REV"` case —
  **CONFIRMED CLOSED**.
- `CONFLICTING_ROLE_PAIRS[2][1] = "ENGIN"` now throws `TypeError` —
  **CONFIRMED CLOSED**.

## 2. Adversarial findings

### 2a. ROLE_LOOKUP coverage — no gap found

Every one of the 10 `CANONICAL_ROLES` entries and all 5 `ROLE_ALIASES` keys
round-trip correctly in both canonical and lowercased form (verified
programmatically, not by inspection). No missing/un-normalizable entry.

### 2b. Case/whitespace/substring adversarial inputs — all correct

`"Independent_Review"`, `"INDEPENDENT_REVIEW"` resolve to `"REV"`. `"REVE"`
and `"RE"` (substring/superset of `"REV"`) both correctly deny (`null`).
Leading/trailing/mixed whitespace combined with case variance (`"  rEv  "`)
resolves to `"REV"`. Empty string and whitespace-only strings (`"   "`,
`"\t\n"`) correctly deny rather than accidentally normalizing.

### 2c. Unicode-confusable acceptance — REAL GAP FOUND, contradicts producer's stated safety claim

The producer verification doc claims: *"an exotic Unicode-confusable token
simply fails to match any lowercased lookup key and is correctly rejected."*
This is **only partially true**. Cyrillic and fullwidth confusables for `REV`
and `governance` were tried and correctly denied (`null`) — those pass.

However: **the KELVIN SIGN (U+212A), a distinct Unicode code point commonly
used as a `K` look-alike, is folded to ASCII `"k"` by JavaScript's own
`String.prototype.toLowerCase()`** — this happens with *no* `.normalize("NFC")`
call at all, so the producer's "we don't do NFC, so we're safe" reasoning
does not cover it. Two canonical roles contain `K`: `SKILL_PRODUCER` and
`SKILL_PUBLISHER`. Confirmed independently:

```
"SKILL_PRODUCER"                    -> normalizeRole -> "SKILL_PRODUCER"   (real ASCII K)
"S" + "K" + "ILL_PRODUCER"      -> normalizeRole -> "SKILL_PRODUCER"   (Kelvin-sign K, SILENTLY ACCEPTED)
"SKILL_PRODUCER".toLowerCase() === "skill_producer"   // true
```

So a role token containing a Kelvin-sign stand-in for `K` is silently
accepted as identical to the canonical `SKILL_PRODUCER` / `SKILL_PUBLISHER`
role — a genuine Unicode-confusable acceptance gap, exactly the class of risk
the producer's design note claims is impossible. This is **not a regression
introduced by this fix** (the pre-fix `normalizeRole` had the same
`toLowerCase()`-based exposure wherever an exact alias match wasn't hit, and
arguably was already vulnerable to it via a different path), and it is not
one of the two findings this fix was scoped to close, so it does not block
merging this fix. But the verification doc's blanket Unicode-safety claim is
overstated and should not be relied upon as-is. Recommend a follow-up
finding/ticket: either special-case-reject non-ASCII input in
`normalizeRole` (simplest, matches the module's own "closed ASCII
vocabulary" framing) or explicitly document the Kelvin-sign-class exception.

### 2d. `normalize: true` option interaction — correct

`checkConflictingRoles(new Set(["ENGIN","Rev"]), {normalize:true})` now
denies identically to the `"REV"` case (deep-equal results, not just
"doesn't crash"). Verified it does NOT introduce false positives: garbage
tokens under `normalize:true` correctly report `ok:true` (both fold to
`null`, `null` matches no real pair); alias-mediated conflicts
(`["QA","governance"]`) still correctly resolve to the `["QA","GOV"]` pair;
non-conflicting case-variant sets (`["Rev","gov"]`, i.e. REV+GOV, not a
declared pair) are correctly permitted, not falsely denied.

### 2e. `AUTHORIZE_TIME_LADDER` — no regression

Still frozen at both the outer-object and every nested-array level (`REV`,
`QA`, `GOV`, `EVIDENCE_ACCEPTOR`); `.push()` on any nested array still throws
`TypeError`. The fix touched only `CONFLICTING_ROLE_PAIRS`; `git diff`
confirms zero lines changed in the `AUTHORIZE_TIME_LADDER` block.

### 2f. Six repinned/excluded test guards — all six spot-checked, all legitimate

Read the actual diff (not just the disclosure table) for all six:

- `tests/approval-binding.test.mjs` — `sod-rules.mjs` removed from
  `PROTECTED_SOURCE_FILES` (fixed-SHA baseline list `beebfe8`/`71b9d41`);
  correct, since re-pinning to a third baseline isn't this guard's shape.
- `tests/conformance-v020-governance.test.mjs` — pinned blob SHA changed to
  `314f6da194ed3eb5342eb224f2084fb7fe631359`. **Verified independently**:
  `git hash-object src/control/sod-rules.mjs` on the built commit produces
  exactly this SHA. Correct.
- `tests/knowledge-claim-service.test.mjs` — `sod-rules.mjs` removed from the
  byte-identity-vs-`main` loop; comment discloses reason. Correct, no other
  drift in the diff (only the array literal and comment changed).
- `tests/knowledge-linkage-service.test.mjs` — same pattern, `sod-rules.mjs`
  removed from the S2-base byte-identity list; diff shows no other change.
- `tests/memory-gateway-service.test.mjs` — same pattern; diff shows no other
  change.
- `tests/skill-candidate-registry.test.mjs` — pinned sha256 changed to
  `2d951ed7935bebaab2951c4c0dee420e4169ebf9e3a2903c751328753a3a894f`.
  **Verified independently**: raw-UTF8 sha256 of the built commit's
  `sod-rules.mjs` matches exactly. The sibling `skill-resolver.mjs` digest in
  the same map is untouched, correctly, since that file did not change.

No illegitimate repin or masked unrelated drift found in any of the six.

### 2g. Consumer call paths — unaffected

`checkpoint-ledger.mjs` does not import `sod-rules.mjs` at all (grep
confirmed; not an actual consumer despite being named as one to check).
Real consumers — `authority-engine.mjs`, `approval-binding.mjs`,
`goal-graph-service.mjs`, `policy-decision-point.mjs`,
`evidence-envelope-service.mjs` — all still resolve correctly-cased canonical
role strings (e.g. `"REV"`, `"GOV"`) identically to before (dedicated test
files for all four re-run in isolation: 120/120 pass, 0 fail). One
intentional, correct behavior change in `policy-decision-point.mjs`: a
genuinely malformed/unrecognized `request.role` now denies
`DENY_MALFORMED_ROLES` via `checkProhibitedActors(null, ...)` instead of
silently passing through as an unrestricted role — this is the fail-open bug
being closed, not a false new denial on a legitimate canonical role.

## 3. Test suite — independently run, count confirmed

`npm test` in this isolated worktree: **1154 tests / 1151 pass / 0 fail / 3
skipped** — matches the producer's claimed post-fix, post-repin count
exactly. (The producer's doc separately reports an intermediate 1154/1145/6
fail state *before* the six guards were repinned within the same commit;
since the repins are already part of `d5a076b`, the state actually on this
branch is the fully green 1151/1151 non-skipped count, confirmed here.)

## 4. Hardcoded test-ID branching

`grep -nE "test-id|testId|TEST_ID|process\.env|bypass" src/control/sod-rules.mjs tests/sod-rules.test.mjs`
— only match is a doc-comment use of the word "bypass" (describing what
Finding 1 closes), no code branch. No hardcoded test-ID branching found.

## Advisory status fields

- truth_status: partially_supported (both closed findings verified_true; the
  producer's Unicode-safety claim is only partially true — Kelvin-sign class
  gap found and independently confirmed)
- authority_status: advisory_only (execution_requires_operator for merge)
- implementation_status: existing (fix already committed on candidate branch;
  this review recommends operator ratification, with a logged follow-up, not
  further code changes to this fix)
- risk_class: medium (both HIGH-rated original findings are genuinely closed;
  the newly found Kelvin-sign gap is real but narrow — affects only 2 of 10
  canonical roles, requires a specific non-ASCII code point deliberately
  chosen by an adversary with codebase knowledge, and is not a regression
  introduced by this fix)

## Recommendation

APPROVE_WITH_NOTES. Merge this fix — it correctly and verifiably closes both
findings from the second independent review with no regressions across 1151
passing tests, faithful test additions, and six legitimately repinned/excluded
guards. Separately, open a follow-up finding for the Kelvin-sign-class
Unicode-confusable gap in `normalizeRole` (pre-existing risk surface, not
introduced here) and correct the producer verification doc's Unicode-safety
claim to note this specific, now-demonstrated exception rather than asserting
blanket immunity.

## Self-certification

```yaml
self_certification:
  agent_id: claude-rev
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
