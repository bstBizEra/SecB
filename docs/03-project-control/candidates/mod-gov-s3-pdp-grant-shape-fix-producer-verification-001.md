# Producer Verification: MOD-GOV S3 PDP Grant-Shape Fix (S3-N1)

- record_id: MOD-GOV-S3-PDP-GRANT-SHAPE-FIX-PRODUCER-VERIFICATION-001
- status: CANDIDATE (advisory work product; operator ratification required — no push, no merge, no live branch touched)
- producer: claude-motor (BST-SA motor role: execution planning, implementation, receipts)
- team_id: BST-SA
- worker role: advisory/implementation only. This session neither approves nor authorizes merge/production.
- branch: `bst/mod-gov-s3-pdp-grant-shape-fix-001`
- base: `origin/main` @ `385ac65943f2a5b158c8ec20a5fd947f06cd2987` (same commit the second independent review was performed against)
- source finding: `docs/03-project-control/candidates/mod-gov-s2-s3-second-independent-review-001.md` (ref `refs/candidates/mod-gov-s2-s3-second-independent-review-001`), section "2.3 NEW FINDING (S3-N1, MEDIUM)"
- reviewer: claude-immune (second independent review, `mod-gov-s2-s3-second-independent-review-001`)

---

## Root cause (confirmed by independent read of the source, not re-trusted from the review writeup)

`src/control/policy-decision-point.mjs`'s `decide()` validates the caller-supplied `request` envelope with strict, closed-schema discipline (`validateShape()`: unknown-key deny, blank-string deny, nested-shape deny). It applies NO equivalent discipline to the return value of the injected `grantResolver` collaborator before feeding it into the S1 SoD primitives (`sod-rules.mjs`):

```js
// pre-fix, lines ~314-321
const roleSet = new Set(Array.isArray(grant.roles) || grant.roles instanceof Set ? grant.roles : []);
roleSet.add(request.role);
const conflict = sod.checkConflictingRoles(roleSet, { normalize: true });
...
const ladder = sod.checkProhibitedActors(normalizedRole, request.actor_id, grant.history ?? {});
```

Two independent silent-degradation paths existed:

1. If `grant.roles` was present but not an `Array`/`Set` (e.g. a bare string from a grantResolver bug or an internal representation mismatch), the ternary silently produced an EMPTY role set rather than denying — the conflicting-role check could never fire regardless of the actor's real granted roles.
2. `grant.history` is consumed via `sod.checkProhibitedActors(..., grant.history ?? {})`, and internally via `history?.[key]` lookups keyed to the hardcoded `AUTHORIZE_TIME_LADDER` vocabulary (`producer`, `reviewer`, `qa`, `evidenceVerifier` — S1's convention). If the resolver's actual history object used a different key name for the same real-world fact (e.g. `producerActorId` instead of `producer`), the lookup silently found nothing at the expected key and the actor-history prohibition could never fire, even though the disqualifying fact was present in the payload under a different name.

Both paths flip a real `SOD_ROLE_CONFLICT` / `DENY_SOD` fact into a clean `ALLOW`, with no error, no log, no typed denial code — asymmetric with how the module treats every other input (`identity.resolved`, `contract.allowed`, `grant.allowed`/`decisionId` ARE strictly type-checked; only the two SoD-input fields were not).

Confirmed unwired at the time of this fix: `grep -rn "policy-decision-point|createPolicyDecisionPoint" src/` shows no live import outside `policy-decision-point.mjs` itself and its own test file plus documentation cross-references in `approval-binding.mjs`, `delegation-gate.mjs`, `retry-policy.mjs` — matching the reviewer's account. No live exploitation path exists today; this closes a fast-follow before any K-14 activation slice wires a real `grantResolver`.

## The fix

In `src/control/policy-decision-point.mjs`, between the authority stage (5) and the SoD stage (6-7):

1. `grant.roles`, when present (`!== undefined`), must be an `Array` or a `Set`. Any other type denies with a new code `DENY_MALFORMED_GRANT_SHAPE` (reason names the field).
2. `grant.history`, when present, must be a plain object (`isPlainObject`, the same predicate used for `request`/`contract`/`grant` themselves). Any other type (array, string, etc.) denies with `DENY_MALFORMED_GRANT_SHAPE`.
3. When `grant.history` IS a plain object, every one of its own keys must belong to the closed vocabulary `KNOWN_GRANT_HISTORY_KEYS = {producer, reviewer, qa, evidenceVerifier}` — the union of all `AUTHORIZE_TIME_LADDER` values, imported directly from `sod-rules.mjs` (single source of truth, not re-declared). Any unrecognized key denies with `DENY_MALFORMED_GRANT_SHAPE`, naming the offending key(s) in the reason string. This is the check that actually closes the renamed-key scenario (B): `history` there IS a syntactically valid plain object, so only a vocabulary check — not a bare type check — catches it.

All three checks fail closed (`deny(...)`, never a throw, never a silent default), run BEFORE the existing `try { ... } catch { return deny("DENY_SOD", ...) }` block, and are bound to `grant.decisionId` exactly like every other post-authority denial in the pipeline. Absent fields (`grant.roles === undefined`, `grant.history === undefined`) are unaffected — both remain documented-optional per the `grantResolver` contract comment, which was also updated in-file to state the closed inner-key vocabulary explicitly (reviewer's recommendation 3).

No other file changed. `sod-rules.mjs` (S1) is read-only imported (`AUTHORIZE_TIME_LADDER`) — not modified.

## Regression tests (reviewer's exact scenarios A-E, reproduced first-hand)

Added to `tests/policy-decision-point.test.mjs`:

| Scenario | grantResolver output | Pre-fix (reproduced) | Post-fix (this branch) |
|---|---|---|---|
| A — baseline correct shape | `roles:["REV"], history:{producer:"agent-engin-01"}`, actor is the producer | `DENY DENY_SOD` | `DENY DENY_SOD` (unchanged) |
| B — history key mismatch | `roles:["REV"], history:{producerActorId:"agent-engin-01"}` | `ALLOW ALLOW` (confirmed false-positive by inspection of pre-fix logic) | `DENY DENY_MALFORMED_GRANT_SHAPE` — **closed** |
| C — history omitted | `roles:["REV"]`, no `history` field | `ALLOW` (intended optional-field behavior) | `ALLOW` (unchanged) |
| D — baseline, array roles | `roles:["ENGIN"]`, request role `REV` | `DENY SOD_ROLE_CONFLICT` | `DENY SOD_ROLE_CONFLICT` (unchanged) |
| E — roles shape mismatch | `roles:"ENGIN"` (string), request role `REV` | `ALLOW ALLOW` (confirmed false-positive by inspection of pre-fix logic) | `DENY DENY_MALFORMED_GRANT_SHAPE` — **closed** |

Additional tests added beyond the reviewer's five, to guard against over-correction (false NEW denials):

- `grant.roles` as a genuine `Set` (not just an `Array`) is still accepted and still finds a real conflict — proves the fix didn't narrow acceptance to `Array` only.
- `grant.history` populated with all four recognized ladder keys (`producer`, `reviewer`, `qa`, `evidenceVerifier`) is accepted as well-formed and a genuine `DENY_SOD` still fires on a real match — proves the vocabulary check doesn't reject legitimate, fully-populated history.
- `grant.history` as an array (not a plain object) denies with `DENY_MALFORMED_GRANT_SHAPE` — direct type-shape coverage independent of the key-vocabulary check.

All pre-existing tests in the file (constructor guards, request shape, clock, identity, contract, authority, the original SoD tests including "the requested role is part of the conflict set" and "actor-history prohibition... producer may not review its own work", risk gate, stage ordering, decision-record candidates, `serverDerived`, frozen-output, options-mutation-immunity, and the unwired-by-construction guard) pass unchanged — confirming the well-shaped/normal case behaves exactly as before, with zero new false denials.

Method note: scenarios B and E were reproduced and confirmed pre-fix by direct inspection of the pre-fix logic shown above (the ternary `Array.isArray(grant.roles) || grant.roles instanceof Set ? grant.roles : []` literally evaluates to `[]` for a string `grant.roles`, and `history?.["producer"]` on `{producerActorId: "..."}` literally evaluates to `undefined`) — both are deterministic, non-probabilistic code paths, and the same two test cases are what now assert the post-fix `DENY_MALFORMED_GRANT_SHAPE` outcome against the actual (not simulated) fixed module.

## Test counts

- Module file (`tests/policy-decision-point.test.mjs`): **28 tests (before) -> 36 tests (after, +8 new)**, all passing both before and after.
- Full repo suite (`node --test tests/*.test.mjs`), independently re-run in this worktree both before touching source and after the fix:
  - **Before**: 1098 tests / 1093 pass / 0 fail / 5 skip.
  - **After**: 1106 tests / 1100 pass / **1 fail** / 5 skip.
- `node tools/validate-foundation.mjs`: exit 0 both before and after (no FAIL entries; grep hits on "failure" in the output are unrelated doc filenames, e.g. `docs/adr/0005-failure-is-a-learning-transition.md`).
- Hardcoded test-ID branching: none found — grepped `src/control/policy-decision-point.mjs` directly and `src/` broadly for actor-id/decision-id literals and `NODE_ENV`/test-mode conditionals; only match is inert (this file's own doc comments).

### The one new full-suite failure (expected, not a regression in this change)

`tests/approval-binding.test.mjs`'s `F4 byte-identity: protected source files are byte-identical to main @ beebfe8 AND @ 71b9d41` test hardcodes that `src/control/policy-decision-point.mjs` (among five other files) has an unchanged git blob hash versus two named main commits. That guard was written for a DIFFERENT rework (MOD-RUNTIME S3 `approval-binding.mjs`) to prove IT did not touch shared authority primitives. This S3-N1 fix is a separately authorized, in-scope change to exactly that file, so the guard's premise (this file will never be touched by any other branch) is now stale for a legitimate reason. This is a cross-branch test-ownership conflict, not a fault introduced by this fix: `sod-rules.mjs`, `risk-registry.mjs`, and the other three protected files in that guard remain untouched (only `policy-decision-point.mjs` drifted, and only for the reason documented above). Resolving it — updating `approval-binding.test.mjs`'s expected baseline hash, or excluding `policy-decision-point.mjs` from that specific guard's file list with a comment pointing here — is left for operator/cross-branch reconciliation and is explicitly NOT attempted by this producer (out of this fix's bounded scope, and not this producer's branch to edit unilaterally).

## Cross-primitive "three independent un-snapshotted reads" gap (§2.4 of the review)

The same second independent review flagged, separately from S3-N1, that `identityResolver`/`contractResolver`/`grantResolver` are each independently injected and, once wired to real stores, could read their own store's state with no shared "as-of" snapshot across the three calls — an architectural property of the unwired facade, not a bug in current code, explicitly deferred by the reviewer to the K-14 activation acceptance criteria. This fix does **not** touch that concern: it is out of scope for S3-N1 (a distinct, narrower shape-trust bug), remains informational/deferred to K-14 activation exactly as the review recommended, and nothing in this diff changes the resolver call sequence, ordering, or snapshot behavior.

## Status

- Local commit only on `bst/mod-gov-s3-pdp-grant-shape-fix-001`. No push, no merge, no operator ratification yet.
- Still UNWIRED — `state-machine.mjs` untouched (the existing "state-machine.mjs remains untouched by S3" guard test still passes); no new import added anywhere; only one new deny code (`DENY_MALFORMED_GRANT_SHAPE`) and no new export surface beyond that code appearing in `decide()`'s existing result shape.

```yaml
self_certification:
  agent_id: claude-motor
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

---

## Addendum 001: grant.history VALUE-shape fast-follow (S3-N1, one level deeper)

- record_id: MOD-GOV-S3-PDP-GRANT-SHAPE-FIX-PRODUCER-VERIFICATION-001-ADD-001
- status: CANDIDATE (advisory work product; operator ratification required — no push, no merge, no live branch touched)
- producer: claude-motor (BST-SA motor role: execution planning, implementation, receipts)
- team_id: BST-SA
- worker role: advisory/implementation only. This session neither approves nor authorizes merge/production.
- branch: `bst/mod-gov-s3-pdp-grant-shape-fix-001` (built on top of `2ee971c`, not a new branch)
- source finding: `docs/03-project-control/candidates/mod-gov-s3-pdp-grant-shape-fix-independent-review-001.md` (independent review of the fix above, commit `2ee971c`), §2b "RESIDUAL GAP CONFIRMED"
- reviewer of the prior fix: claude (REV/SEC role), verdict APPROVE_WITH_NOTES with this one open item

### Extends, does not restate

This addendum does not rewrite anything above. The original fix (`507b24d`), fast-follow (`95bdbcc`), and this producer-verification record's account of them stand unchanged. This addendum covers only the second-layer gap the independent review found in the fix described above.

### Root cause (one level deeper than the original fix)

The original fix validates `grant.history` **key names** against the closed vocabulary (`producer`/`reviewer`/`qa`/`evidenceVerifier`) but not key **values**. `sod-rules.mjs`'s `collectProhibited()` adds any truthy `history[key]` value to the prohibited set AS-IS:

```js
// sod-rules.mjs, collectProhibited()
} else if (value) {
  prohibited.add(value);        // a truthy non-string value (object, number) is added AS-IS
}
```

`prohibited.has(actorId)` then compares by strict equality. A syntactically valid key (e.g. `"producer"`) paired with a malformed value — an object such as `{ agentInstanceId: "agent-x-01" }`, or a number — can never strictly-equal the string `actor_id` the PDP is checking, so a genuine same-actor prohibition silently never fires. This reproduces the identical S3-N1 silent-ALLOW bug class one level deeper than the key-shape check reaches.

### The fix

In `src/control/policy-decision-point.mjs`, inside the existing `isPlainObject(grant.history)` block (same fail-fast location as the key-vocabulary check, still strictly before the SoD `try` block), added a second check: every one of `grant.history`'s own (already-vocabulary-validated) keys must have a value that is either a non-blank string, or an Array/Set whose every element is a non-blank string. This is the same actor-id convention already used elsewhere in this codebase — `sod-rules.mjs`'s `checkProhibitedActors()` (`typeof actorId !== "string" || actorId.length === 0` denies as malformed) and this same file's own `isBlank()` helper (`typeof value !== "string" || value.trim() === ""`) — not a new, invented format. Any value that fails this check denies with the **same** `DENY_MALFORMED_GRANT_SHAPE` code used by the key-shape check, since this is the same bug class, not a new one; the reason string names the offending key(s). An empty Array/Set value is accepted (vacuously well-formed — no actors named, no restriction), matching `collectProhibited()`'s own treatment of an empty collection.

No other file changed. `sod-rules.mjs` remains read-only imported, not modified.

### Regression tests (reviewer's exact scenario, reproduced first-hand)

Added to `tests/policy-decision-point.test.mjs`:

- **Reviewer's exact scenario**: `history: { producer: { agentInstanceId: "agent-x-01" } }`, requester `actor_id: "agent-x-01"`, role `REV` — pre-fix (confirmed by reading the unpatched value-consumption path) this returns `ALLOW`; post-fix this returns `DENY` / `DENY_MALFORMED_GRANT_SHAPE`. **Closed.**
- Same scenario with a number (`producer: 12345`) instead of an object — same closure.
- `producer` as a blank/whitespace-only string — denies as malformed rather than silently falling through as "no restriction."
- `producer` as an Array containing one well-formed and one malformed (object) entry — denies (any malformed element inside a collection value still denies).
- Well-shaped values unaffected: a plain actor-id string reproduces the reviewer's scenario A shape and still denies via the real `DENY_SOD` path (not swallowed as a false `DENY_MALFORMED_GRANT_SHAPE`).
- Well-shaped Array/Set-of-actor-id-string values are still accepted with no new false denial.
- An empty Array value is accepted (no actors named, no restriction) with no new false denial.

### Test counts

- Module file (`tests/policy-decision-point.test.mjs`): **36 tests (before this addendum) -> 43 tests (after, +7 new)**, all passing both before and after.
- Full repo suite (`node --test tests/*.test.mjs`), re-run in this same worktree both before and after this addendum's change:
  - **Before**: 1106 tests / 1101 pass / 0 fail / 5 skip (matches the independent review's independently-reproduced count exactly).
  - **After**: 1113 tests / 1108 pass / 0 fail / 5 skip.
- `node tools/validate-foundation.mjs`: exit 0 both before and after (no FAIL entries).
- Hardcoded test-ID branching: none found — re-grepped `src/control/policy-decision-point.mjs` and `src/` broadly for actor-id/decision-id literals and `NODE_ENV`/test-mode conditionals; no matches outside inert doc comments.

### Status

- Local commit only on `bst/mod-gov-s3-pdp-grant-shape-fix-001`, built directly on top of `2ee971c` (same branch, not a new one). No push, no merge, no operator ratification yet.
- Still UNWIRED — no change to the PDP's export surface, no new deny code (reuses `DENY_MALFORMED_GRANT_SHAPE`), no new import anywhere, `state-machine.mjs` untouched.
- The independent review's other findings (§2c empty-array-vs-undefined, §2d sibling-collaborator check, §2e fail-fast ordering, §2.4 cross-primitive snapshot gap deferred to K-14) are unaffected by and out of scope for this addendum; none of them called for a code change.

```yaml
self_certification:
  agent_id: claude-motor
  peer_agent_id: claude-rev-sec
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

---

## Addendum 002: grant.roles ELEMENT-shape fast-follow (S3-N1, round 4)

- record_id: MOD-GOV-S3-PDP-GRANT-SHAPE-FIX-PRODUCER-VERIFICATION-001-ADD-002
- status: CANDIDATE (advisory work product; operator ratification required — no push, no merge, no live branch touched)
- producer: claude-motor (BST-SA motor role: execution planning, implementation, receipts)
- team_id: BST-SA
- worker role: advisory/implementation only. This session neither approves nor authorizes merge/production.
- branch: `bst/mod-gov-s3-pdp-grant-shape-fix-001` (built on top of `037da18`, not a new branch)
- source finding: `docs/03-project-control/candidates/mod-gov-s3-pdp-grant-shape-fix-round3-independent-review-001.md` (independent review of Addendum 001's fix, commit `037da18`), §2b "Round-4 probe: `grant.roles`' OWN elements — NOT checked. Confirmed real gap", scenario T3b
- reviewer of the prior fix: claude-rev-sec (REV/SEC role), verdict APPROVE_WITH_NOTES with this one open item, recommended as a named round-4 fast-follow

### Extends, does not restate

This addendum does not rewrite anything above. The original fix (`507b24d`), fast-follows (`95bdbcc`, `037da18`), and this record's own account of them (including Addendum 001) stand unchanged. This addendum covers only the fourth-layer gap the round-3 independent review found.

### Root cause (round 1's container-only mistake, repeated one field over)

The round-1 fix validates `grant.roles`' **container** type (`Array.isArray(...) || grant.roles instanceof Set`) but never its own **elements**. `grant.roles` then flows unchanged into `new Set(grant.roles ?? [])`, and `sod.checkConflictingRoles(roleSet, { normalize: true })` (`sod-rules.mjs:96-114`) maps every element through `normalizeRole()` (`sod-rules.mjs:68-71`), which returns `null` for any non-string input:

```js
// sod-rules.mjs, normalizeRole()
export function normalizeRole(role) {
  if (typeof role !== "string" || role.length === 0) return null;
  return ROLE_ALIASES[role] ?? role;
}
```

`null` can never equal a `CONFLICTING_ROLE_PAIRS` entry (all literal role strings), so a malformed element is silently treated as "no role" instead of denying. The round-3 review's `T3b` scenario (`roles:[{shouldHaveBeen:"ENGIN"}]`, requester role `REV`) demonstrates this is not harmless noise: when the malformed element is the ONLY element, the real conflict it stands in for is entirely lost and the result flips to a clean `ALLOW` — the identical coercion-to-permissive-absence bug class rounds 1-3 each closed one field/level at a time (`grant.roles` container type -> `grant.history` key names -> `grant.history` values), now confirmed for `grant.roles`' own elements.

### The fix

In `src/control/policy-decision-point.mjs`, immediately after the existing `grant.roles` container-type check (same fail-fast location, still strictly before the SoD `try` block), added: when `grant.roles` IS an Array or Set, every one of its elements must be a well-formed (non-blank) role string. This reuses the **exact same well-formedness convention already used throughout this file** — `isBlank()` (`typeof value !== "string" || value.trim() === ""`), the same predicate this file already applies to the top-level request's own `role` field in `validateShape()` and to `grant.history` values in Addendum 001 — not a new, invented format. `sod-rules.mjs`'s own role/actor-shape checks (`checkProhibitedActors()`'s `typeof role !== "string" || role.length === 0`) confirm the same non-blank-string convention is what this codebase treats as "well-formed" for role tokens; `CANONICAL_ROLES` (the closed vocabulary of role names) is documentation only and is not enforced as a membership check anywhere in `sod-rules.mjs`, so restricting to that enumeration would have been inventing a new, stricter convention rather than reusing the existing one — deliberately not done here. Any malformed element denies with the **same** `DENY_MALFORMED_GRANT_SHAPE` code used by every prior round, since this is the same bug class, not a new one. An empty Array/Set is accepted (vacuously well-formed — no roles granted, no restriction), matching the existing treatment of empty collections elsewhere in this fix line.

No other file changed. `sod-rules.mjs` remains read-only imported, not modified.

### Regression tests (reviewer's exact scenario, reproduced first-hand)

Added to `tests/policy-decision-point.test.mjs`:

- **Reviewer's exact scenario (T3b)**: `roles:[{shouldHaveBeen:"ENGIN"}]`, requester role `REV` — pre-fix (confirmed by reading the unpatched element-consumption path through `normalizeRole()`) this returns `ALLOW`; post-fix this returns `DENY` / `DENY_MALFORMED_GRANT_SHAPE`. **Closed.**
- T3's shape (`roles:["ENGIN", {fake:"role"}]`, a genuine conflicting string alongside a malformed element) — still denies post-fix, now via `DENY_MALFORMED_GRANT_SHAPE` (shape validation runs before the SoD check) rather than `SOD_ROLE_CONFLICT`; fail-closed either way, never `ALLOW`.
- A blank/whitespace-only string element (`["ENGIN", "   "]`) denies as malformed, not silently treated as no role.
- A Set containing a malformed non-string element (`new Set(["ENGIN", 42])`) denies as malformed.
- Well-shaped `roles` (all valid role strings, both Array and Set forms) remain unaffected: a genuine conflict still denies via `SOD_ROLE_CONFLICT`, and a genuinely non-conflicting well-shaped grant still `ALLOW`s — no new false denials.
- An empty Array/Set `grant.roles` is accepted (no roles granted, no restriction) — no new false denial.

### Test counts

- Module file (`tests/policy-decision-point.test.mjs`): **43 tests (before this addendum) -> 49 tests (after, +6 new)**, all passing both before and after.
- Full repo suite (`node --test tests/*.test.mjs`), re-run in this same worktree both before and after this addendum's change:
  - **Before**: 1113 tests / 1108 pass / 0 fail / 5 skip (matches the round-3 independent review's independently-reproduced count exactly).
  - **After**: 1119 tests / 1114 pass / 0 fail / 5 skip.
- `node tools/validate-foundation.mjs`: exit 0 both before and after (no FAIL entries).
- Hardcoded test-ID branching: none found — re-grepped `src/control/policy-decision-point.mjs` and `src/control/sod-rules.mjs` for `NODE_ENV`/`process.env`, and `policy-decision-point.mjs` for literal actor-id/decision-id equality branching; repo-wide `grep -rl "NODE_ENV" src/` also empty.

### Explicitly out of scope: Unicode/whitespace-confusable actor-id concern (not touched)

The round-3 review's §4 finding (a zero-width space, U+200B, passes `isBlank()`'s shape check as "well-formed" yet is semantically inert against real actor-ids) is **deliberately not addressed by this addendum**, per the review's own correct assessment: this is an identity-canonicalization concern, not a shape-validation defect, and there is no convention mismatch to close — `sod-rules.mjs`'s `collectProhibited()`/`checkProhibitedActors()` performs **zero normalization** of its own (raw strict equality), so the PDP's `isBlank` check and the SoD module's comparison are already mutually consistent (neither normalizes). Adding Unicode-aware trimming or normalization at the shape-validation boundary would introduce an inconsistency between what the gate accepts and what the matcher expects, not close one. This producer concurs with the reviewer's disposition and has not touched it; it remains an out-of-scope, undeferred-elsewhere note for any future K-14-activation-time identity-canonicalization slice, should the PDP ever be wired to real, external-string actor-ids.

### Recursion assessment: does round 5 exist?

The round-3 independent review's own conclusion: **no.** Its reasoning, endorsed here after independently re-deriving it from the current source rather than merely re-stating it:

- Every nested field `decide()` reads from an injected collaborator is now shape-checked: the caller's `request` envelope has been validated since the module's original merge (closed-key, non-blank-string, nested `target`/`context` shapes); `grant.roles` now has both its container type (round 1, `507b24d`) AND its own elements (this round 4) validated; `grant.history` now has its key names (round 1, `507b24d`) AND its values, including element-level checks inside Array/Set values (round 2 / Addendum 001, `037da18`), validated.
- `grant.decisionId` is already `isBlank`-checked; `grant.allowed` is already strict-`=== true`-checked; the round-3 review's own prior round confirmed no sibling-collaborator gap on `identity`/`contract`/`risk`.
- No further nested field inside the `grant` object exists that `sod-rules.mjs` dereferences without an existing PDP-side check. The shape-validation dimension of this fix line is, as of this commit, structurally complete.

This producer's own confirmation, independent of merely trusting the reviewer's prose: reading `decide()` top to bottom, every value passed to `sod.checkConflictingRoles`/`sod.checkProhibitedActors` (the only two SoD-facing collaborator outputs) is now shape-validated at every level the SoD primitives themselves dereference (`roleSet` elements; `history` keys and, per-key, values and their own Array/Set elements). No round 5 is anticipated for this fix line; a future change to `sod-rules.mjs`'s own dereferencing pattern (e.g. a new field consumed by a new SoD primitive) would be a new charter, not a continuation of this one.

### Status

- Local commit only on `bst/mod-gov-s3-pdp-grant-shape-fix-001`, built directly on top of `037da18` (same branch, not a new one). No push, no merge, no operator ratification yet.
- Still UNWIRED — no change to the PDP's export surface, no new deny code (reuses `DENY_MALFORMED_GRANT_SHAPE`), no new import anywhere, `state-machine.mjs` untouched.
- The round-3 review's Unicode/whitespace-confusable-actor-id finding (§4) is explicitly out of scope, per above — not attempted, not deferred elsewhere as a fast-follow of this fix line, left as a standing identity-canonicalization note.

```yaml
self_certification:
  agent_id: claude-motor
  peer_agent_id: claude-rev-sec
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
