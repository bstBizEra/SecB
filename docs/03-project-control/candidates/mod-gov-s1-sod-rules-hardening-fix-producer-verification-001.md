# Producer Verification: MOD-GOV-S1 SoD rules hardening fix

- record_id: MOD-GOV-S1-SOD-RULES-HARDENING-FIX-PRODUCER-VERIFICATION-001
- status: CANDIDATE (advisory; operator ratification and merge required)
- producer: claude-motor (BST-SA motor agent, advisory_only, no merge/execution authority)
- peer_agent_id: codex-motor | null (no Codex-motor counterpart engaged for this pass)
- base: `origin/main` @ `bd00c53` (verified identical to local `main` at fix time)
- branch: `bst/mod-gov-s1-sod-rules-hardening-fix-001` (isolated worktree, not pushed, not merged)
- reviewed finding this fix closes: `docs/03-project-control/candidates/mod-gov-s1-sod-rules-second-independent-review-001.md` (ref `refs/bst-review/mod-gov-s1-sod-rules-second-independent-review-001`, commit `843fda0`), verdict REQUEST_CHANGES
- date: 2026-07-22

## Scope

`src/control/sod-rules.mjs` only. Test additions in `tests/sod-rules.test.mjs`.
No consumer file changed — both fixes are internal to the primitive; every
current and future consumer benefits automatically.

## Finding 1 — normalization-completeness gap (fail-open)

**Root cause:** `normalizeRole` did an exact-string `ROLE_ALIASES` lookup only
(`ROLE_ALIASES[role] ?? role`) — no case-fold, no trim. Any token that was not
byte-identical to an alias key or already canonical passed through
**unchanged** instead of denying. This defeated `checkProhibitedActors`'s
plain object-key ladder lookup (`ladder[role] ?? []`) for any near-miss
spelling: `checkProhibitedActors("Rev", "same-actor", { producer: "same-actor" })`
returned `{ ok: true }` (producer-reviews-own-work incorrectly ALLOWED) while
`"REV"` correctly denied. `checkConflictingRoles(..., { normalize: true })`
did not rescue this either, since its `normalize` option only re-runs the same
unfixed `normalizeRole`.

**Fix:** `normalizeRole` now trims whitespace and case-folds
(`.trim().toLowerCase()`) BEFORE lookup, against a `ROLE_LOOKUP` table built
once at module load from both `CANONICAL_ROLES` and `ROLE_ALIASES` (each
keyed by its own lowercased form). A token that does not resolve after
folding now returns `null` (deny-by-default) instead of passing through
unchanged — extending the module's own stated deny-by-default principle from
empty/non-string input to unrecognized near-miss spellings, per the
reviewer's explicit fix direction.

**Normalization approach matched, and why:** trim + ASCII case-fold, no
Unicode (NFC) normalization. This mirrors the codebase's existing
`runtime-registry.mjs` `normalizeIdentifierForComparison` precedent
(`value.trim().normalize("NFC").toLowerCase()`) for the trim+case-fold shape,
but deliberately omits the NFC step: applying full Unicode normalization to a
closed, ASCII-only role vocabulary (`CANONICAL_ROLES` / `ROLE_ALIASES`) would
risk silently accepting Unicode confusables as equivalent to a canonical
ASCII role, which is a maximalist stance the task explicitly warned against.
Since the fixed `normalizeRole` denies (`null`) anything that doesn't resolve
to a known alias or `CANONICAL_ROLES` member after folding, an exotic
Unicode-confusable token simply fails to match any lowercased lookup key and
is correctly rejected — the narrower, fail-closed stance the module's own
deny-by-default philosophy already establishes.

## Finding 2 — shared-mutable-state gap

**Root cause:** `CONFLICTING_ROLE_PAIRS`'s outer array was frozen but its five
nested pair arrays were not, asymmetric with `AUTHORIZE_TIME_LADDER` (whose
nested arrays are each individually frozen, e.g. `REV: Object.freeze(["producer"])`).
Any code holding the import could mutate a pair in place
(`CONFLICTING_ROLE_PAIRS[2][1] = "ENGIN"`) and corrupt the shared singleton
for every consumer, globally, for the process lifetime.

**Fix:** each of the five nested pair literals is now individually wrapped in
its own `Object.freeze([...])`, exactly mirroring `AUTHORIZE_TIME_LADDER`'s
established pattern. No behavior change for any well-formed caller — `.find`,
`.join`, and spread (`[...conflict]`) all still work identically on frozen
arrays.

## Test additions (`tests/sod-rules.test.mjs`)

5 new tests, all passing:

1. `normalizeRole case-folds and trims before lookup (Finding 1 regression)` —
   `"Rev"`, `"rev"`, `"REV "`, `" rev "`, `"Governance"`,
   `"INDEPENDENT_REVIEW"` all resolve to their canonical form; whitespace-only
   still denies (`null`).
2. `normalizeRole denies unrecognized tokens after folding instead of passing
   them through` — `"Revv"`, `"not-a-role"` -> `null`.
3. `checkProhibitedActors: reviewer's normalizeRole("Rev") scenario now denies
   like normalizeRole("REV")` — reproduces the reviewer's exact repro
   (`checkProhibitedActors("Rev", "same-actor", { producer: "same-actor" })`),
   confirms the raw un-normalized ladder lookup behavior is unchanged (still
   `{ ok: true }` for a literal `"Rev"` key, since `checkProhibitedActors`
   itself never normalizes), and confirms the actual closure:
   `checkProhibitedActors(normalizeRole("Rev"), ...)` now equals
   `checkProhibitedActors(normalizeRole("REV"), ...)` exactly (`ok: false`,
   `code: "DENY_SOD"`).
4. `checkConflictingRoles normalize:true rescues case-variant role tokens` —
   `new Set(["ENGIN", "Rev"])` with `{ normalize: true }` now denies
   identically to `new Set(["ENGIN", "REV"])`.
5. `CONFLICTING_ROLE_PAIRS nested pair arrays are individually frozen
   (Finding 2 regression)` — asserts `Object.isFrozen()` on every nested pair;
   reproduces the reviewer's exact mutation attempt
   (`CONFLICTING_ROLE_PAIRS[2][1] = "ENGIN"`) and confirms it now throws
   `TypeError` (matching `AUTHORIZE_TIME_LADDER.REV.push(...)`'s already-correct
   frozen behavior, asserted in the same test); confirms the mutation was a
   true no-op by re-checking `["QA","GOV"]` still denies and `["QA","ENGIN"]`
   still does not (the exact corruption the reviewer demonstrated).

All pre-existing tests in the file (19) continue to pass unchanged, including
the alias-mapping test (`normalizeRole("REV")`, `normalizeRole("independent_review")`,
etc.), the parity tests against `AuthorityEngine`, and the three
config-equivalence tests — confirming normal, correctly-cased canonical-role
call paths are unaffected.

## Test results

- `node --test tests/sod-rules.test.mjs`: **before 19/19 pass; after 24/24
  pass** (5 new, 0 regressed).
- `npm test` (full suite) **before** (on unmodified `origin/main` @ `bd00c53`,
  verified via `git stash`): **1149 tests / 1146 pass / 0 fail / 3 skipped**
  — matches the second-independent-review's own reported baseline exactly.
- `npm test` (full suite) **after** the fix: **1154 tests / 1145 pass / 6 fail
  / 3 skipped.**

### The 6 new failures are expected, pre-existing pinned guards in OTHER modules — not a defect in this fix

All 6 failures are "wrap-not-modify" / byte-identity guard tests that live in
OTHER modules' own test files and assert `src/control/sod-rules.mjs`'s
content is byte-identical to a pinned reference (either the literal `main`
git ref, or a specific historical commit SHA). They exist to prove those
OTHER modules only *reuse* `sod-rules.mjs` read-only and never silently
reimplement/modify it — the same "B-reuse" discipline documented in
`overlap-policy.mjs`'s byte-identity guard on `write-set-policy.mjs`. Any
legitimate, reviewed change to `sod-rules.mjs` — including this one — will
trip these guards on a pre-merge candidate branch, because by construction
they can only compare against whatever `main` (or a fixed old SHA) currently
is, not against a to-be-merged fix:

| File | Guard test | Pinned reference |
|---|---|---|
| `tests/approval-binding.test.mjs:718` | `F4 byte-identity: protected source files are byte-identical to main @ beebfe8 AND @ 71b9d41` | fixed commit SHA (beebfe8 / 71b9d41) |
| `tests/conformance-v020-governance.test.mjs:374` | `V-020 byte-identity: every primitive composed by this candidate is unchanged vs main @ ec5aa76` | fixed commit SHA (ec5aa76) |
| `tests/knowledge-claim-service.test.mjs:463` | `GUARD: temporal-ledgers.mjs and sod-rules.mjs are byte-identical to main (learning boundary untouched)` | literal `main` git ref |
| `tests/knowledge-linkage-service.test.mjs:645` | `GUARD: knowledge-claim schema, temporal-ledgers, sod-rules AND the S1 facade are byte-identical to the S2 base` | literal `main` git ref |
| `tests/memory-gateway-service.test.mjs:305` | `GUARD: temporal-ledgers.mjs and sod-rules.mjs are byte-identical to main (no admission-policy change)` | literal `main` git ref |
| `tests/skill-candidate-registry.test.mjs:279` | `skill-resolver.mjs and sod-rules.mjs are byte-identical to main (S1 adds no surface there)` | literal `main` git ref |

**Operator action required at merge time (NOT performed by this producer —
out of this fix's declared scope and outside Motor advisory authority):** once
this fix is ratified and merged to `main`, each of the 6 guards above needs
its pinned reference re-pointed to the new post-fix commit (the fixed-SHA
guards) or will self-resolve automatically (the literal-`main`-ref guards,
which compare live against whatever `main` is at test-run time, so they pass
again the moment `main` itself contains the fix). This is a lockfile-style
bump, not a weakening of the guards — the guards' purpose (catch a consumer
silently drifting from the ADOPTED baseline) is fully preserved; only the
baseline commit changes, exactly as it would for any other adopted
dependency version bump.

No other failures were introduced. `sod-rules.test.mjs` itself: 24/24 pass.

## `node tools/validate-foundation.mjs`

Ran clean: zero `"status": "FAIL"` entries in the output, before and after.

## Hardcoded test-ID branching

`grep -nE "test-id|testId|TEST_ID|process\.env|bypass" src/control/sod-rules.mjs tests/sod-rules.test.mjs`
— no matches other than a doc-comment use of the word "bypass" describing
what Finding 1 closes (not a code branch). No hardcoded test-ID branching
found.

## Blast radius this closes

Both fixes live entirely inside `src/control/sod-rules.mjs`'s exported
primitives (`normalizeRole`, `CONFLICTING_ROLE_PAIRS`). No consumer file
(`authority-engine.mjs`, `approval-binding.mjs`, `policy-decision-point.mjs`,
`evidence-envelope-service.mjs`, `goal-graph-service.mjs`,
`knowledge-claim-service.mjs`, `knowledge-linkage-service.mjs`,
`memory-gateway-service.mjs`) needs any change to benefit — every current
consumer, and any future consumer that imports this module, automatically
gets: (a) a `normalizeRole` that can no longer be defeated by case/whitespace
variants, closing the fail-open path the moment any consumer (e.g. a future
wiring of `policy-decision-point.mjs`) accepts externally-supplied role
strings; and (b) a `CONFLICTING_ROLE_PAIRS` whose pairs cannot be corrupted
in place by any caller, anywhere in the process.

## Advisory status fields

- truth_status: verified_true (both fixes independently exercised in this
  checkout: reviewer's exact repro scripts re-run and confirmed closed; full
  suite run before/after with counts above)
- authority_status: advisory_only (execution_requires_operator for merge)
- implementation_status: existing defects fixed in already-merged code (this
  candidate branch), not new/candidate functionality
- risk_class: high (same trust-anchor primitive the original finding rated
  high; this fix directly closes both HIGH findings)

## Self-certification

```yaml
self_certification:
  agent_id: claude-motor
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
