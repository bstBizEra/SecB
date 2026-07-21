# Second Independent Review: MOD-GOV-S1 SoD rule primitive (`src/control/sod-rules.mjs`)

- review_id: MOD-GOV-S1-SOD-RULES-SECOND-INDEPENDENT-REVIEW-001
- status: CANDIDATE (advisory review; operator ratification required)
- reviewer: claude-immune (BST-SA immune agent, independent identity; role per BST-SA contract: immune)
- peer_agent_id: null (no Codex-immune counterpart engaged for this pass)
- prior review reviewed: `docs/03-project-control/candidates/mod-gov-s1-rev-001.md` (MOD-GOV-S1-REV-001, verdict APPROVE_WITH_NOTES, 2026-07-20) — treated as an account to verify, not a source of truth
- subject: `src/control/sod-rules.mjs` @ main `bd00c53` (origin/main at review time)
- review method: isolated detached-HEAD git worktree at `origin/main`, no live branch touched, no push
- date: 2026-07-22

## Verdict

**REQUEST_CHANGES.**

Two real, independently-reproduced defects were found in this trust-anchor
primitive. Neither has a live production trigger today (both require either an
externally-influenced role string reaching an unwired consumer, or in-process
code deliberately/accidentally mutating a shared export), but given this
module's blast radius — it is imported by `authority-engine.mjs`,
`policy-decision-point.mjs`, `approval-binding.mjs`, `goal-graph-service.mjs`,
`evidence-envelope-service.mjs`, `knowledge-claim-service.mjs`,
`knowledge-linkage-service.mjs`, and `memory-gateway-service.mjs` — both should
be an immediate fast-follow, not a disclosed note.

## Real findings

### Finding 1 (HIGH) — `normalizeRole` is not a normalizer; case/whitespace variants silently defeat the entire actor-history ladder (fail-open)

`normalizeRole` does an exact-string alias-dictionary lookup only:

```js
export function normalizeRole(role) {
  if (typeof role !== "string" || role.length === 0) return null;
  return ROLE_ALIASES[role] ?? role;
}
```

It performs **no** case-folding, no `.trim()`, no Unicode normalization. Any
role token that isn't byte-identical to a `ROLE_ALIASES` key or an already-
canonical token passes through **unchanged** — it does not deny (return
`null`), it does not normalize. This directly contradicts the module's own
stated deny-by-default principle ("a non-string/empty token normalizes to
null... callers must treat as unknown role rather than a permissive default")
— that principle only covers empty/non-string input, not near-miss spelling.

Reproduced live (node, this checkout):

```
normalizeRole("REV")  -> "REV"
normalizeRole("Rev")  -> "Rev"          (unchanged, NOT canonicalized)
normalizeRole("rev")  -> "rev"
normalizeRole("REV ") -> "REV "         (trailing space survives)
```

This is exploitable through `checkProhibitedActors`, whose ladder lookup is a
plain object-key index (`ladder[role] ?? []`): a role spelled `"Rev"` instead
of `"REV"` finds no ladder entry, so `keys = []`, `prohibited` is empty, and
the function returns `{ ok: true }` — **the entire SoD actor-history check
silently no-ops**. Reproduced:

```
checkProhibitedActors("Rev", "same-actor", { producer: "same-actor" })
  => { ok: true }                         // producer reviews own work: ALLOWED
checkProhibitedActors("REV", "same-actor", { producer: "same-actor" })
  => { ok: false, code: "DENY_SOD", ... } // control: correctly denied
```

I also confirmed `checkConflictingRoles(..., { normalize: true })` does not
rescue this: `normalize: true` only re-runs `normalizeRole` over the set, and
since `normalizeRole` itself does not fold case, `checkConflictingRoles(new
Set(["ENGIN", "Rev"]), { normalize: true })` returns `{ ok: true }` (no
conflict detected) where `checkConflictingRoles(new Set(["ENGIN", "REV"]),
{ normalize: true })` correctly denies. So the `normalize` option is not a
safety net against this class of input at all — it only substitutes the
handful of literal alias words in `ROLE_ALIASES`.

**Live blast radius today:** none found. Every currently-wired consumer
(`authority-engine.mjs`, `evidence-envelope-service.mjs`) passes a role
literal drawn from a fixed internal map (`REQUIRED_ROLE`) or a hardcoded
string, never an externally-supplied value, so this path isn't reachable in
production yet. The one consumer that *would* expose it —
`policy-decision-point.mjs`, whose `decide()` accepts `request.role` as a
caller-supplied field validated only for "non-blank string" (`isBlank`, no
enum/canonical check), then does exactly `sod.normalizeRole(request.role)` →
`sod.checkProhibitedActors(normalizedRole, ...)` — is explicitly documented in
its own file header as **UNWIRED** ("K-14... NOTHING wires this module...
adoption is a later, separately-governed slice"). So this is latent, not
active. But it is latent in *exactly* the component whose entire job is to be
the SoD choke point for a future live authorization path, and its own header
frames SoD as delegated wholesale to "the S1 primitive" — i.e., PDP's design
explicitly trusts `sod-rules.mjs` to make role tokens safe. It does not.

**Fix direction:** `normalizeRole` should fold case and trim whitespace before
alias lookup and canonical-role comparison (and arguably Unicode-normalize),
and should return `null` for any token that, after folding, still isn't a
recognized alias or a member of `CANONICAL_ROLES` — consistent with the
module's own deny-by-default philosophy, rather than passing unrecognized
near-miss tokens through as if they were valid.

### Finding 2 (HIGH) — `CONFLICTING_ROLE_PAIRS` nested pair arrays are not frozen: shared-mutable-state gap the first review saw but mis-assessed

```js
export const CONFLICTING_ROLE_PAIRS = Object.freeze([
  ["ENGIN", "REV"],
  ["REV", "QA"],
  ...
]);
```

`Object.freeze` is shallow: only the outer array is frozen. Each nested pair
(`["ENGIN","REV"]`, etc.) remains a fully mutable array. This is asymmetric
with `AUTHORIZE_TIME_LADDER` and `HANDOFF_ACCEPTANCE_LADDER`, whose nested
arrays are each individually wrapped in their own `Object.freeze(...)` — e.g.
`REV: Object.freeze(["producer"])`. Reproduced live:

```
Object.isFrozen(CONFLICTING_ROLE_PAIRS)      -> true
Object.isFrozen(CONFLICTING_ROLE_PAIRS[0])   -> false
Object.isFrozen(AUTHORIZE_TIME_LADDER.REV)   -> true   // correct, for comparison
```

Because `CONFLICTING_ROLE_PAIRS` is the default value of `checkConflictingRoles`'s
`pairs` parameter, and ES modules are process-wide singletons, any code
holding the import (every current consumer does) can mutate a pair in place
and corrupt SoD conflict enforcement **globally, for every other consumer, for
the remainder of the process**. Demonstrated:

```js
CONFLICTING_ROLE_PAIRS[2][1] = "ENGIN";   // was ["QA","GOV"] -> ["QA","ENGIN"]
// no throw — mutation succeeds

checkConflictingRoles(new Set(["QA", "GOV"]))    // => { ok: true }   (real conflict now MISSED)
checkConflictingRoles(new Set(["QA", "ENGIN"]))  // => denies SOD_ROLE_CONFLICT (spurious)
```

`AUTHORIZE_TIME_LADDER.REV.push(...)` correctly throws
("Cannot add property... object is not extensible") — that export is done
right. `CONFLICTING_ROLE_PAIRS` is not.

**This is not a new gap — the first review saw the exact shape and dismissed
it under the wrong threat model.** Finding #6 of `mod-gov-s1-rev-001.md`
states: *"Freeze semantics identical: outer frozen, inner arrays NOT frozen —
in BOTH old and new... No consumer relies on reference identity."* That
check (does any consumer do `===` on a pair array?) is the wrong question;
the real risk is in-place mutation corrupting the shared singleton, which
requires no consumer to compare identities at all — just one piece of code,
anywhere in the process, holding the reference and writing into it (e.g. a
future test fixture or a caller trying to "customize" pairs by mutating what
it assumed was a private copy). `tests/sod-rules.test.mjs` has the identical
blind spot: its only freeze assertion (`ladders and pairs remain frozen`,
lines 323-327) checks `Object.isFrozen()` at the top level for all three
exports and never checks nested-array depth, so this gap has zero test
coverage on either side of the ledger.

**Fix direction:** wrap each pair literal in its own `Object.freeze([...])`,
matching the pattern already used for `AUTHORIZE_TIME_LADDER` /
`HANDOFF_ACCEPTANCE_LADDER`. Trivial, no behavior change for well-formed
callers.

## Areas checked with no finding

- **`checkPairwiseDistinct` pairwise-distinctness completeness:** genuinely
  pairwise via a `Map` accumulator checked against every prior entry, not
  adjacent-only. Verified with constructed 4- and 5-actor sets with the
  repeat in non-adjacent positions (1st vs. 4th; 2nd vs. 5th) — both
  correctly detected and reported the correct `actorId`/`roles` pair. No bug.
- **`checkProhibitedActors` list-construction edge cases:** empty arrays,
  single-element arrays (matching and non-matching), and duplicate entries in
  a prohibited list all behave correctly (Set-based dedup, no false
  negatives). No bug.
- **`checkConflictingRoles` adversarial role-conflict scenarios:** beyond the
  producer's and first reviewer's fixtures, tried duplicate-role sets,
  3+-role sets spanning multiple pairs, and pair-order variants — all
  correctly resolve to the first matching pair in `pairs` order, consistent
  with documented behavior. No bug beyond Findings 1/2 above (which are
  normalization/mutability issues, not pair-matching logic issues).
- **Call-site correctness in real consumers:** `approval-binding.mjs` (line
  212) and `goal-graph-service.mjs` (line 114) both build `checkPairwiseDistinct`
  entries as `{ role, actorId }` objects matching the primitive's expected
  shape, in the argument order the primitive expects, and both correctly
  treat only `{ ok: false }` as the deny path. `policy-decision-point.mjs`
  (lines 314-321) is the one consumer that explicitly passes `{ normalize:
  true }` to `checkConflictingRoles` and pre-normalizes the role before
  `checkProhibitedActors` — it uses the primitive's contract exactly as
  documented; its exposure in Finding 1 is a defect in the primitive's
  contract, not a misuse of it. `authority-engine.mjs` (line 101) calls
  `checkConflictingRoles(roles)` without `normalize: true`, but its `roles`
  values always originate from `grant.roles`, which in every construction
  path observed is canonical-token literals, not alias vocabulary — matches
  the first review's own parity finding that this is unchanged pre-extraction
  behavior, not a new regression.
- **A framing correction, not a bug:** the task brief named
  `capability-registry-service.mjs`, `skill-promotion-ledger.mjs`, and
  `checkpoint-ledger.mjs`'s actor-immutability logic as trusting this
  primitive. As of `origin/main` @ `bd00c53`, none of these import
  `sod-rules.mjs` at all (`grep -rl "sod-rules" src/` confirms the actual
  consumer set is `authority-engine.mjs`, `approval-binding.mjs`,
  `policy-decision-point.mjs`, `evidence-envelope-service.mjs`,
  `goal-graph-service.mjs`, `knowledge-claim-service.mjs`,
  `knowledge-linkage-service.mjs`, `memory-gateway-service.mjs`); no file
  named `skill-promotion-ledger.mjs` exists in `src/` at all. The primitive's
  own header explicitly says the other SoD sites are "migrated under their
  own review cycles later" and are only demonstrated config-equivalent by
  test, not rewired. Worth correcting so downstream planning doesn't assume a
  trust dependency that doesn't exist yet.
- **Hardcoded test-ID branching:** none found in `sod-rules.mjs` or at any
  grep'd call site (`grep -n "test-id|testId|TEST_ID|process.env|bypass"`
  across the primitive and its three control-layer consumers: no matches).

## Test results (this checkout, independently run)

- `npm ci` clean.
- `npm test` (full suite): **1149 tests / 1146 pass / 0 fail / 3 skipped.**
- `node --test tests/sod-rules.test.mjs` directly: **19/19 pass.** Matches the
  first review's reported counts exactly — no regression, but see Finding 2
  re: the freeze test's blind spot, and note no test in this file exercises
  case/whitespace/Unicode variants of role tokens (Finding 1's gap has zero
  coverage either).

## Advisory status fields

- truth_status: verified_true (both findings independently reproduced live in
  this checkout with runnable scripts, not asserted)
- authority_status: advisory_only (execution_requires_operator for any fix
  merge)
- implementation_status: existing (defects are in already-merged, in-production
  code; not new/candidate code)
- risk_class: high (foundational SoD trust-anchor; Finding 1 is a fail-open
  actor-history bypass reachable the moment any current or future consumer
  passes a non-canonical-but-recognizable role string without its own
  independent case/whitespace canonicalization; Finding 2 is a process-wide
  shared-mutable-state corruption vector with no current trigger but no
  defense either)

## Recommendation

Both findings should be fixed together in a single small, low-risk fast-follow
slice (no behavior change for any well-formed canonical-role caller):
1. Make `normalizeRole` fold case/whitespace (and ideally reject anything that
   doesn't resolve to a known alias or `CANONICAL_ROLES` member, returning
   `null` per the module's own deny-by-default principle) instead of passing
   unrecognized near-miss tokens through unchanged.
2. Freeze each `CONFLICTING_ROLE_PAIRS` entry individually
   (`Object.freeze(["ENGIN","REV"])` etc.), matching `AUTHORIZE_TIME_LADDER`.
3. Add test coverage for both: case/whitespace/Unicode role-token variants
   through `normalizeRole`, `checkConflictingRoles(..., {normalize:true})`,
   and `checkProhibitedActors`; and `Object.isFrozen()` at nested-array depth
   for `CONFLICTING_ROLE_PAIRS`.

Given the "no fast-follow, just a note" instruction does not apply here (both
are real, reproducible defects in the single most-reused SoD primitive in the
codebase), this should be prioritized ahead of new adoption slices that would
otherwise extend trust in this primitive further (e.g. wiring up
`policy-decision-point.mjs`).

## self_certification

```yaml
self_certification:
  agent_id: claude-immune
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Advisory review only. Recommend; do not authorize. Operator (with GOV + SEC)
> holds the decision on scheduling and merging the fast-follow fix.
