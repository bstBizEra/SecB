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
