# Independent Review: MOD-GOV S3 PDP Grant-Shape Fix (S3-N1)

- record_id: MOD-GOV-S3-PDP-GRANT-SHAPE-FIX-INDEPENDENT-REVIEW-001
- status: CANDIDATE (advisory work product; operator ratification required — no push, no merge, no live branch touched)
- reviewer: claude (REV/SEC role, independent of the producer session)
- team_id: BST-SA
- worker role: advisory/independent-verification only. This review neither approves nor authorizes merge/production.
- branch reviewed: `bst/mod-gov-s3-pdp-grant-shape-fix-001` @ `95bdbcc` (fix `507b24d` + fast-follow `95bdbcc`)
- base: `origin/main` @ `385ac65943f2a5b158c8ec20a5fd947f06cd2987`
- producer verification reviewed: `docs/03-project-control/candidates/mod-gov-s3-pdp-grant-shape-fix-producer-verification-001.md`
- method: isolated detached-HEAD `git worktree` checkout, independent of the producer's working copy; all reproduction scripts written fresh, not copied from `tests/policy-decision-point.test.mjs`.

---

## Verdict: APPROVE_WITH_NOTES

The fix is real, correctly closes both scenarios the second independent review found, is fail-closed, fail-fast, does not narrow legitimate acceptance, and the vocabulary it validates against is a genuine single source of truth (imported, not re-declared). Test counts independently reproduced exactly as claimed. However, this review found **one residual gap the producer's account does not address**: the fix validates `grant.history` *key names* but not *key values* — a syntactically-valid key paired with a malformed value (object, number, etc. instead of an actor-id string) reproduces the *exact same class of silent SoD bypass* the fix was written to close. This does not block merge (no live exploitation path exists today — the PDP remains fully unwired, same as the base fix), but it should be tracked as a fast-follow before any K-14 activation slice wires a real `grantResolver`, exactly as `DENY_MALFORMED_GRANT_SHAPE`'s sibling checks were.

---

## 1. Fresh reproduction of the two claimed-closed scenarios

Written as a standalone script (`createPolicyDecisionPoint` invoked directly with hand-built resolvers), executed against the checked-out worktree, not against the producer's test file.

| Scenario | Setup | Result |
|---|---|---|
| Malformed `roles` type (string, not Array/Set) — real ENGIN/REV conflict hidden pre-fix | `grantResolver` returns `roles: "ENGIN"`, requester's role is `REV` | **DENY / `DENY_MALFORMED_GRANT_SHAPE`** — confirmed closed |
| Renamed `history` key (`producerActorId` vs `producer`) — real prohibited-actor fact hidden pre-fix | `grantResolver` returns `history: { producerActorId: "agent-x-01" }`, requester actor_id is `agent-x-01`, role `REV` | **DENY / `DENY_MALFORMED_GRANT_SHAPE`** — confirmed closed |

Both hold up exactly as claimed. Independent read of the pre-fix logic (`Array.isArray(...) || ... instanceof Set ? grant.roles : []` and `history?.["producer"]` against a renamed-key object) confirms these were real, deterministic silent-ALLOW paths before the fix, matching the producer's and original reviewer's account.

## 2. Adversarial probes (this review's own additions)

### 2a. Is `KNOWN_GRANT_HISTORY_KEYS` genuinely single-source-of-truth, or a hardcoded second copy?

Confirmed genuine. `policy-decision-point.mjs` imports `AUTHORIZE_TIME_LADDER` directly from `sod-rules.mjs` (line 65) and derives the vocabulary programmatically:

```js
const KNOWN_GRANT_HISTORY_KEYS = Object.freeze([...new Set(Object.values(AUTHORIZE_TIME_LADDER).flat())]);
```

This evaluates to `producer, reviewer, qa, evidenceVerifier` — the same four names, but *computed*, not re-typed. If `sod-rules.mjs` ever adds/renames/removes a ladder key, `KNOWN_GRANT_HISTORY_KEYS` updates automatically with zero edits to `policy-decision-point.mjs`. No drift risk. No separate hardcoded copy exists.

### 2b. `grant.history` VALUES, not just keys — RESIDUAL GAP CONFIRMED

The fix validates that `grant.history` is a plain object and that its keys are within the closed vocabulary. It does **not** validate that each key's *value* is a well-formed actor-id (string) or array/set of actor-ids, as `sod-rules.mjs`'s own `checkProhibitedActors`/`collectProhibited` expects:

```js
// sod-rules.mjs
function collectProhibited(keys, history) {
  const prohibited = new Set();
  for (const key of keys) {
    const value = history?.[key];
    if (Array.isArray(value) || value instanceof Set) {
      for (const actor of value) if (actor) prohibited.add(actor);
    } else if (value) {
      prohibited.add(value);        // <-- a truthy non-string value (object, number) is added AS-IS
    }
  }
  return prohibited;
}
```

`prohibited.has(actorId)` then compares by strict equality/reference. If `grant.history.producer` is `{ agentInstanceId: "agent-x-01" }` (an object) or `12345` (a number) instead of the string `"agent-x-01"`, the value is truthy so it gets added to the `prohibited` Set as that object/number — which can never `===` the string `actorId` the PDP is checking. The prohibition silently never fires, even though the key name is exactly right and the disqualifying fact is present.

**Independently reproduced** in a fresh script against the checked-out branch:

- `history: { producer: { agentInstanceId: "agent-x-01" } }`, requester `actor_id: "agent-x-01"`, role `REV` → **result: `ALLOW`** (should be `DENY_SOD` — the requester genuinely is the recorded producer).
- `history: { producer: 12345 }`, same requester/role → **result: `ALLOW`** (same false-positive-ALLOW class).

This is the *identical bug class* (S3-N1) surviving at one level deeper (value-shape instead of key-shape) after the key-shape fix. It is not a new bug introduced by this diff — the pre-fix code had the same value-blind behavior — but the fix's stated closure ("closes the renamed-key scenario... a syntactically valid plain object... only a vocabulary check... catches it") is accurate only for the key dimension; it does not close the value dimension, and neither the producer's verification doc nor its added tests (scenarios A–E plus the three anti-over-correction tests) mention or cover it. Recommend a fast-follow: validate that each `grant.history[key]` is either a non-blank string or an Array/Set of non-blank strings, denying `DENY_MALFORMED_GRANT_SHAPE` otherwise — symmetric with how `grant.roles` elements themselves are still unvalidated for element-type today (a `roles: [{evil:1}]` array would also pass the Array-type check and silently fail to match at `roleSet.add`/conflict comparison, though that is a lower-severity variant since `checkConflictingRoles` operates on a fixed canonical vocabulary rather than caller-supplied actor ids).

### 2c. Empty Array vs. `undefined` roles — no exploitable difference found

Reproduced both `roles: []` and `roles: undefined` (field omitted) against an otherwise-identical grant/request: both produce the same `decision`/`code`. This is expected and not a gap: `new Set(grant.roles ?? [])` treats both identically by construction, and a *resolver failure* is handled separately (a throwing `grantResolver` denies `DENY_AUTHORITY` before reaching this code at all). There is no code path today where "no roles because none exist" and "no roles because the resolver failed silently" are distinguishable AND security-relevant — a silent resolver failure that still returns a well-shaped, empty result is indistinguishable from a legitimate empty grant by design (the resolver's correctness, as opposed to its output shape, is outside the PDP's stated contract). Not a fix defect; flagged as an architectural note only, same disposition as the review's own deferred §2.4 finding.

### 2d. Sibling unvalidated-collaborator check — no same-shape sibling bug found

Checked `identityResolver` and `contractResolver` outputs (the other two injected collaborators) and the `riskRegistry`/`sodRules` override surface:

- `identity`: only `.resolved` is read, via strict `!== true` (deny-by-default; any non-`true` value denies). Extra/malformed fields on the identity object are never consumed elsewhere. Reproduced: an identity with garbage `roles`/`quarantined` fields alongside `resolved: true` has zero effect on the outcome.
- `contract`: only `.allowed` is read, same strict `!== true` pattern. Same result: extra fields inert.
- `risk.riskProfile()`/`risk.isMutationAtMost()`: both wrapped in the existing outer `try/catch` (any malformed shape that throws when dereferenced, e.g. `.value.mutationCeiling` on an `undefined` `.value`, is caught and denies `DENY_UNKNOWN_RISK_CLASS`), and `humanApproval` is compared with strict `!== false` (anything other than the literal boolean `false` requires human approval — deny-by-default, not permissive-by-default).
- `sod.checkConflictingRoles()`/`checkProhibitedActors()` results: `!conflict.ok` / `!ladder.ok` denies on any falsy `.ok`, including `undefined` from a malformed override.

The asymmetry the original review flagged — a *coercion to a permissive empty/absent default* rather than a strict equality-based deny — existed **only** at the `grant.roles`/`grant.history` site pre-fix. Every other collaborator boundary in this file already used the strict `!== true`/`isBlank`/try-catch pattern. No same-shape sibling bug found elsewhere in the PDP.

### 2e. Fail-fast ordering — confirmed

Constructed a `sodRules` override whose three methods throw if ever invoked, paired with a malformed `grant.roles` (a string). `decide()` returned `DENY_MALFORMED_GRANT_SHAPE` and the override's methods were **never called** — confirming the three new shape checks run strictly before the SoD `try` block, with no partial evaluation, no invocation of the S1 primitives, and no side effects from the SoD stage on a malformed-shape path.

## 3. Well-shaped / legitimate cases — confirmed unaffected

Constructed fresh (not reusing producer fixtures):

- A well-formed grant (`roles: ["ENGIN"]`, `history: { producer: "someone-else-01", reviewer: "someone-else-02" }`) with a requester who has no real conflict or prohibition (`role: "QA"`, distinct actor) → **ALLOW**, as expected.
- A well-formed grant with a **genuine** role conflict (`roles: ["ENGIN"]`, request role `REV`) → **DENY / `SOD_ROLE_CONFLICT`**, not swallowed as a false `DENY_MALFORMED_GRANT_SHAPE`.
- `grant.roles` as a genuine `Set` (not `Array`) still detects a real conflict → confirms the fix did not narrow acceptance to `Array`-only.

No new false denials found on any well-shaped input probed.

## 4. Test suite — independently re-run, counts match exactly

Ran `npm test` (`npm run validate && node --test tests/*.test.mjs`) in this review's own isolated worktree, independent of the producer's checkout:

- Exit code: `0`.
- **1106 tests / 1101 pass / 0 fail / 5 skip** — matches the producer's claimed post-fix, post-fast-follow counts exactly.
- The fast-follow commit (`95bdbcc`) correctly resolves the one expected failure the producer flagged (the `approval-binding.test.mjs` byte-identity guard excluding `policy-decision-point.mjs` with a documented, dated rationale pointing at this fix) — confirmed by reading the diff directly; the other four protected files (`sod-rules.mjs`, `risk-registry.mjs`, `capability-registry-service.mjs`, `goal-graph-service.mjs`) remain in the guard's list, unmodified.

## 5. Hardcoded test-ID branching — none found

`grep`'d `src/control/policy-decision-point.mjs` and broadly across `src/` for `NODE_ENV`/test-mode conditionals and literal actor-id/decision-id branching (`agent-engin-01`, `dec_grant_001`, `process.env.NODE_ENV`, string-literal identity comparisons). No matches outside inert doc comments. Confirms the producer's own grep claim.

## 6. Scope discipline — confirmed

- No other file changed beyond `policy-decision-point.mjs`, its own test file, and the one documented `approval-binding.test.mjs` exclusion line + comment.
- `sod-rules.mjs` is read-only imported, not modified — confirmed by diff.
- PDP remains fully unwired: no new import into `state-machine.mjs` or any service; `Object.freeze({ decide })` is the only export surface, unchanged.
- The §2.4 "three independent un-snapshotted reads" finding from the second independent review is correctly left out of scope and untouched by this diff, as the producer states.

## Recommendation

**APPROVE_WITH_NOTES.** Merge is reasonable: the fix closes exactly the two scenarios it was scoped to close, fails closed and fails fast, does not regress any well-shaped case, imports rather than duplicates its vocabulary, and the test counts are independently verified. The one open item — `grant.history` **value**-shape (not just key-shape) validation — reproduces the same silent-bypass bug class this fix exists to close, but at a level the fix's stated scope did not reach and its own tests do not probe. Given the PDP is still fully unwired (no live exploitation path today, same posture the original S3-N1 finding relied on to classify itself MEDIUM rather than urgent), this does not block merge, but should be filed as an explicit fast-follow tracked alongside the deferred §2.4 item, before K-14 activation wires a real `grantResolver`.

```yaml
self_certification:
  agent_id: claude-rev-sec
  peer_agent_id: claude-motor
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
