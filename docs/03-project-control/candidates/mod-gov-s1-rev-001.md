# Independent Review: MOD-GOV-S1 SoD rule primitive extraction (REV-001)

- review_id: MOD-GOV-S1-REV-001
- status: CANDIDATE (advisory review; operator ratification still required)
- reviewer: claude-immune-rev-modgov-s1 (BST-SA immune agent, independent identity)
- producer_reviewed: claude-motor (commit `d8ad7a0`, `[MOD-GOV-S1] Extract SoD primitive; authority-engine delegates behavior-preservingly`)
- review_branch: `claude/rev/mod-gov-s1` (created FROM `bst/mod-gov-s1-sod-rules` @ `d8ad7a0`)
- base_reviewed: main `49d1e0c` (pre-extraction authority-engine)
- mandate: Slice S1 in `docs/03-project-control/candidates/mod-gov-gap-assessment-001.md` on branch `bst/mod-gov-assessment` @ `62da42e` — "behavior-preserving extraction, nothing else" (mandate lines 63-64, 86; activation risk R3 per mandate line 96)
- governance: CLAUDE.md BST-SA advisory contract + user CLAUDE.md (non-main branch, no push, no merge)
- date: 2026-07-20

All findings below were reproduced first-hand in an isolated worktree by
building BOTH the pre-extraction (`49d1e0c`) and post-extraction (`d8ad7a0`)
`AuthorityEngine` and diffing their outputs on a shared scenario matrix. No
producer measurement was taken on trust.

## Verdict

**APPROVE_WITH_NOTES.**

Behavior is provably IDENTICAL across the entire well-formed input domain
(string actor ids / string roles) — the security-relevant domain. Every
divergence found is confined to malformed, non-legitimate input and every one
is **fail-closed** (the new engine is equal or more restrictive; there is no
fail-open weakening anywhere). Approval is qualified by two MEDIUM notes
recording that the extraction adds input-type guards the inlined logic lacked,
which is a (security-positive) deviation from the strict "nothing else" wording
of the S1 mandate. Operator/GOV holds the decision on whether to accept the
hardening as-is or require exact permissive parity.

## Findings table

| # | Check | Method | Result | Severity |
| --- | --- | --- | --- | --- |
| 1 | Behavior preservation — well-formed domain | Built old (`49d1e0c`) + new (`d8ad7a0`) engines side by side; ran clean allow, `actor==producer` DENY_SOD, GOV-with-qa/evidenceVerifier-in-history, EVIDENCE_ACCEPTOR-with-reviewer, QA-with-falsy-producer, ENGIN-no-ladder, role trailing-space, role mixed-case, actorId-null-mismatch. | Byte-identical result objects on all. Aliases/case/whitespace do NOT drift: the engine calls `checkConflictingRoles` with `normalize=false` and passes already-canonical roles, so `ROLE_ALIASES`/`normalizeRole` are never exercised by the engine — grant-role matching stays exact `Array.includes`, unchanged. | PASS |
| 2 | Constructor conflicting-role check | Old `hasConflict` vs new `checkConflictingRoles`; scoped sets: duplicate roles `[REV,REV]`, `REV+QA`, two grants combining to `ENGIN+REV`, `GOV+QA` (pair-order). | Identical throw/construct outcomes. Code preserved as `SOD_ROLE_CONFLICT`; `pair` preserved in `[left,right]` order; first-found pair selection preserved (same `pairs` array, same order); `${scope} combines conflicting roles X/Y` message preserved. The new `DENY_MALFORMED_ROLES` try/catch branch is unreachable from the constructor (roles is always a valid `Set`). | PASS |
| 3 | Authorize-time actor-history ladder | Old inline REV/QA/GOV/EVIDENCE_ACCEPTOR ladder vs new `checkProhibitedActors` w/ `AUTHORIZE_TIME_LADDER`; full 6 role x 6 actor matrix (producer's own parity test) + my extra roles. | Identical for all string actors. Ladder reproduces exactly: REV->producer; QA->producer,reviewer; GOV & EVIDENCE_ACCEPTOR->producer,reviewer,qa,evidenceVerifier; other roles->no exclusion. `filter(Boolean)` semantics preserved via `collectProhibited`'s falsy skip. `DENY_SOD` code + `Separation of duties prohibits actor {id} from role {role}` message preserved. | PASS |
| 4 | Input-type guard drift — non-string actorId | Constructed a grant + context with numeric `actorId=123` (survives construction: required-field check only rejects undefined/null/"" and `findReservedDelimiter` returns null for non-strings). Reachable through public `authorize()` because `grant.actorId === context.actorId` passes with matching numbers. | **DIVERGENCE (fail-closed).** OLD: `{allowed:true}` (numeric actor slips through `[...].filter(Boolean).includes(123)`). NEW: `{allowed:false, code:"DENY_MALFORMED_ACTOR"}`. Second case (numeric `actorId==producer`): OLD `DENY_SOD` -> NEW `DENY_MALFORMED_ACTOR` (deny code changes). | MEDIUM |
| 5 | Input-type guard drift — array-valued history field | Passed `producerActorId:["rev-1"]` (malformed) with `actorId:"rev-1"`. | **DIVERGENCE (fail-closed).** OLD: `{allowed:true}` (array treated as a single non-matching element by `.includes`). NEW: `{allowed:false, code:"DENY_SOD"}` (`collectProhibited` expands arrays/Sets and matches membership). | MEDIUM |
| 6 | CONFLICTING_ROLES re-export (value + reference) | Compared old local const vs new `CONFLICTING_ROLE_PAIRS` re-export; checked `src/index.mjs` and `src/services/work-package-service.mjs` consumers. | Value-identical (`JSON` equal, same 5 pairs, same order). Freeze semantics identical: outer frozen, inner arrays NOT frozen — in BOTH old and new. `index.mjs` re-export line unchanged; only consumer observes value, none does identity comparison; `work-package-service` imports only `AuthorityEngine`+`REQUIRED_ROLE`. No reference-identity hazard reachable. | PASS |
| 7 | Config-equivalence claims not tautological | Read handoff + capability-registry equivalence tests critically; verified the hand-written reference reproductions against the REAL services. | `referenceHandoff` in the test faithfully mirrors `handoff-service.acceptHandoff()` SoD block (`src/services/handoff-service.mjs` lines 293-300: INDEPENDENCE_ROLES=[REV,QA,GOV], source excluded, prohibited=executors +reviewer(QA/GOV) +qa(GOV)); 30-scenario parity is genuine, not a strawman. Capability-registry test exercises real `checkPairwiseDistinct`+`normalizeRole`. Config-equivalence is demonstration-only; no service rewired in S1 (verified). | PASS (see Note 3) |
| 8 | Scope discipline | `git diff --name-only 49d1e0c..d8ad7a0`; grep primitive for imports/IO; MANIFEST diff. | Exactly 4 files (MANIFEST.json, authority-engine.mjs, sod-rules.mjs, sod-rules.test.mjs). No service other than authority-engine touched. `sod-rules.mjs` has ZERO imports and ZERO I/O (pure functions). MANIFEST +2 (registers both new files). | PASS |
| 9 | Test + validator totals | `npm ci`; `node tools/validate-foundation.mjs`; `node --test tests/*.test.mjs`; per-file runs. | Validator exit 0. Full suite **312 tests / 307 pass / 0 fail / 5 skip** — matches producer claim exactly. `tests/sod-rules.test.mjs` 19/19; `tests/authority-engine.test.mjs` 13/13. The 19 new tests account for the 293->312 delta. | PASS |

## Drift-hunt outcomes (adversarial)

- **Role aliasing / case / whitespace:** No drift. Engine never calls
  `normalizeRole`; grant-role matching remains exact. `"REV "` (trailing space)
  and `"Rev"` (mixed case) in `grant.roles` behave identically old vs new
  (both fail to satisfy a `REV` requirement, same as before). Aliases only bind
  if a caller opts into `normalize:true`, which the engine does not.
- **Malformed input (non-string / array):** Two fail-closed divergences
  (Findings 4, 5). Both require inputs no legitimate SecB caller produces; both
  make the engine equal-or-more restrictive. No fail-OPEN divergence exists —
  I specifically searched for any input where NEW allows and OLD denied and
  found none; the new guards and the Set-based ladder only ever add denials or
  preserve them.
- **Check ordering / deny-code races:** Preserved. `authorize()` order is
  unchanged (role-rule -> grant -> status -> actor -> scope -> window ->
  role-assigned -> transition -> SoD), SoD remains last. Constructor conflict
  uses the same `pairs` array in the same order, so the first-found pair (and
  thus the reported pair and message) is identical.
- **CONFLICTING_ROLES re-export:** value-identical and freeze-identical; no
  consumer relies on reference identity.

## Extra adversarial scenarios I authored (beyond producer fixtures) and outcomes

Run by building both engine versions and diffing `authorize()` / constructor
outputs. `OK` = old and new identical; `DIFF` = divergence.

| Scenario | Outcome |
| --- | --- |
| `grant.roles=["REV "]` (trailing space), context requires REV | OK (both deny "does not assign required role REV") |
| `grant.roles=["Rev"]` (mixed case), context requires REV | OK (both deny) |
| Clean allow, producer distinct | OK (`allowed:true` identical) |
| `actorId==producer` | OK (both `DENY_SOD`, identical message) |
| GOV role, actor previously `qaActorId` | OK (both `DENY_SOD`) |
| GOV role, actor is `evidenceVerifierActorId` | OK (both `DENY_SOD`) |
| EVIDENCE_ACCEPTOR role, actor is `reviewerActorId` | OK (both `DENY_SOD`) |
| QA role, `producerActorId=""` (falsy) not prohibiting | OK (both allow) |
| ENGIN role, `actor==producer` (no ladder) | OK (both allow) |
| `actorId=null` (mismatches string grant.actorId) | OK (both `DENY_AUTHORITY` "belongs to another actor" — guarded before SoD) |
| **numeric `actorId=123`, producer distinct** | **DIFF** — OLD `allowed:true`; NEW `DENY_MALFORMED_ACTOR` |
| **numeric `actorId=123 == producer`** | **DIFF** — OLD `DENY_SOD`; NEW `DENY_MALFORMED_ACTOR` |
| **`producerActorId=["rev-1"]` (array), `actorId="rev-1"`** | **DIFF** — OLD `allowed:true`; NEW `DENY_SOD` |
| Constructor: duplicate roles `[REV,REV]` same scope | OK (Set dedups; both construct) |
| Constructor: `REV+QA` same scope | OK (both throw `SOD_ROLE_CONFLICT`) |
| Constructor: two grants -> `ENGIN+REV` same scope | OK (both throw `SOD_ROLE_CONFLICT`) |
| Constructor: `GOV+QA` (pair order) | OK (both throw, same reported pair `QA/GOV`) |

## Notes attached to the approval

1. **Note (MEDIUM) — new `DENY_MALFORMED_ACTOR` guard (Finding 4).** The
   inlined ladder had no actor-type guard; a non-string `actorId` that matched a
   non-string `grant.actorId` previously reached (and could PASS) SoD. The
   primitive now denies it as malformed. This is fail-closed and reachable only
   with input outside the legitimate domain, but it exceeds "extraction is
   behavior-preserving only" (mandate line 86). Operator should either accept it
   as intended hardening (recommended) or, for strict parity, the follow-up
   should restore the exact permissive path. Recommend documenting it as an
   intended input-hardening in the S1 mandate rather than reverting.

2. **Note (MEDIUM) — array/Set expansion of history fields (Finding 5).** For
   the AUTHORIZE_TIME_LADDER path the history values are always scalar context
   fields, so this only manifests on malformed array input; also fail-closed.
   Same disposition as Note 1.

3. **Note (LOW, forward-looking) — handoff message collapse.** The real
   `handoff-service` emits two distinct deny reasons ("Source actor cannot
   accept its own independence-bearing handoff" vs the generic SoD message).
   `HANDOFF_ACCEPTANCE_LADDER` folds `source` into the prohibited keys, so a
   FUTURE adoption slice that rewires handoff-service through the primitive
   would collapse both into the single generic message. Not an S1 issue
   (handoff-service is not rewired here); flag it for the handoff adoption slice
   so message parity is a stated acceptance criterion there.

## Advisory status fields

- truth_status: verified_true (behavior-preserving for the well-formed domain; two fail-closed malformed-input divergences verified_true as deviations)
- authority_status: advisory_only (execution_requires_operator for any merge)
- implementation_status: existing (extraction of already-shipped logic)
- risk_class: medium (authority-semantics file, R3 activation; divergences are fail-closed and malformed-input-only)

## self_certification

```yaml
self_certification:
  agent_id: claude-immune-rev-modgov-s1
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Advisory review only. Recommend; do not authorize. Operator (with GOV + SEC
> per the R3 activation requirement in the S1 mandate) holds the merge decision.
