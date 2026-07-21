# Independent Review (Round 3): MOD-GOV S3 PDP Grant-Shape Fix, history VALUE-shape fast-follow

- record_id: MOD-GOV-S3-PDP-GRANT-SHAPE-FIX-ROUND3-INDEPENDENT-REVIEW-001
- status: CANDIDATE (advisory work product; operator ratification required — no push, no merge, no live branch touched)
- reviewer: claude (REV/SEC role), independent of the producer session
- team_id: BST-SA
- worker role: advisory/independent-verification only. This review neither approves nor authorizes merge/production.
- branch reviewed: `bst/mod-gov-s3-pdp-grant-shape-fix-001` @ `037da18` (commit under review, parent `2ee971c`)
- base: `origin/main` @ `385ac65943f2a5b158c8ec20a5fd947f06cd2987`
- prior records reviewed: `mod-gov-s3-pdp-grant-shape-fix-producer-verification-001.md` (original fix `507b24d` + Addendum 001 for `037da18`), `mod-gov-s3-pdp-grant-shape-fix-independent-review-001.md` (this reviewer's own prior round, `2ee971c`, APPROVE_WITH_NOTES)
- method: fresh isolated detached-HEAD `git worktree` at `C:\Users\ounkh\AppData\Local\Temp\claude\secb-review-round3`, independent of the producer's working copy; `npm ci` run to materialize `node_modules` in this worktree; all reproduction scripts (`scratch-repro.mjs`) written fresh, not copied from `tests/policy-decision-point.test.mjs`.

---

## Verdict: APPROVE_WITH_NOTES

`037da18` does exactly what it claims: it validates `grant.history` **values** (not just key names) against the actor-id convention, correctly closes the reviewer's own `§2b` scenario from `2ee971c`, denies with the same `DENY_MALFORMED_GRANT_SHAPE` code, and — contrary to a superficial reading — its `.every(isWellFormedActorId)` element-level check on Array/Set history values means round 3 does **not** repeat round 1's container-vs-element mistake for `grant.history`. Test counts (1113/1108/0/5) are independently reproduced exactly. Scope and hardcoded-test-ID discipline hold.

However, this review confirms a **real, reproducible fourth-layer gap that `037da18` does not touch**: `grant.roles`' own array/set **elements** receive zero value-level scrutiny — only the round-1 container-type check (`Array.isArray || instanceof Set`) applies. A malformed element inside `grant.roles` is silently dropped from meaningful role comparison (via `normalizeRole()` returning `null` for non-strings) rather than denied, and — contrary to the prior review's characterization of this as "lower severity" — this review's fresh reproduction (`T3b` below) shows it can **mask a genuine role conflict into a false ALLOW**, the identical bug class rounds 1–3 all exist to close, just one field over. This does not block merge (same unwired posture, no live exploitation path today, and the producer/reviewer chain has consistently and honestly disclosed each layer as found) — but it should be tracked as an explicit round-4 fast-follow, exactly as `§2b` was tracked and then closed by this commit.

A second, narrower finding: Unicode/whitespace-adjacent inputs (zero-width space) pass the shape check as "well-formed" yet are semantically inert against real actor-ids. This is real but is a fundamentally different *kind* of problem (identity canonicalization, not shape/type validation) and this review does not recommend folding it into the same fast-follow — see §4.

---

## 1. Fresh reproduction of the round-3 claimed scenario

Standalone script (`scratch-repro.mjs`), `createPolicyDecisionPoint` invoked directly with hand-built resolvers, executed against this independent worktree checkout of `037da18` — not against the producer's test file.

| Test | Setup | Result |
|---|---|---|
| T1 | `history: { producer: { agentInstanceId: "agent-x-01" } }`, requester `actor_id: "agent-x-01"`, role `REV` | **`DENY` / `DENY_MALFORMED_GRANT_SHAPE`** — confirmed closed (previously silently `ALLOW`, per both prior records' independent reproduction of the pre-fix path) |
| T6 (baseline sanity) | `history: { producer: "agent-x-01" }` (well-shaped string), same requester/role | `DENY` / `DENY_SOD` — genuine prohibition still fires correctly, not swallowed as a false `DENY_MALFORMED_GRANT_SHAPE` |
| T7 (baseline sanity) | `roles: ["ENGIN"]`, `history: { producer: "someone-else" }`, requester role `QA`, distinct actor | `ALLOW` — well-shaped, no real conflict, correctly unaffected |

The headline scenario is genuinely closed, and well-shaped grants are unaffected (no new false denials observed anywhere in this review's probes).

## 2. Round-4 probe: array/set ELEMENT-level scrutiny

### 2a. `grant.history[key]` as an Array/Set — IS each element checked? Yes.

```
T2: history: { producer: ["valid-actor", { nested: "object" }] }, requester "agent-x-01", role REV
  => DENY DENY_MALFORMED_GRANT_SHAPE (key: producer)
T2b: same array, requester actor_id = "valid-actor" (the well-formed element itself)
  => DENY DENY_MALFORMED_GRANT_SHAPE (key: producer)
```

The source (`isWellFormedHistoryValue`, `policy-decision-point.mjs:391-394`) runs `[...value].every(isWellFormedActorId)` — every element of an Array/Set history value is individually checked, not just the container type. **This is round 3 correctly avoiding round 1's original mistake** (round 1 checked only that `grant.roles` was *a* Array/Set, not that its elements were well-formed) for the `history`-value dimension. No gap found here.

### 2b. `grant.roles`' OWN elements — NOT checked. Confirmed real gap.

The prior review (`2ee971c` §2b) flagged this in passing and called it "a lower-severity variant since `checkConflictingRoles` operates on a fixed canonical vocabulary rather than caller-supplied actor ids." This review re-examined that claim empirically and finds it needs correction:

```
T3:  roles: ["ENGIN", { fake: "role" }], history: {}, requester actor_id "agent-x-01", role REV
  => DENY SOD_ROLE_CONFLICT   (the genuine "ENGIN" string survives alongside the malformed element; conflict still detected)

T3b: roles: [{ shouldHaveBeen: "ENGIN" }], history: {}, requester actor_id "agent-x-01", role REV
  => ALLOW ALLOW   <-- the malformed element is the ONLY element; the real conflict it stands in for is silently lost
```

Mechanism: `grant.roles !== undefined && !Array.isArray(...) && !(instanceof Set)` only checks the *container*. The array `[{ shouldHaveBeen: "ENGIN" }]` passes (it IS an Array). It then flows into `new Set(grant.roles ?? [])` unchanged, and `sod.checkConflictingRoles(roleSet, { normalize: true })` (`sod-rules.mjs:96-114`) calls `normalizeRole()` on every element; `normalizeRole()` (`sod-rules.mjs:68-71`) returns `null` for any non-string input. `null` can never equal a `CONFLICTING_ROLE_PAIRS` entry (all literal role strings), so the malformed element is silently treated as "no role" — **exactly the same coercion-to-permissive-absence bug class** that rounds 1–3 each closed one field/level at a time (`grant.roles` container type → `grant.history` key names → `grant.history` values). T3b demonstrates this is not merely "the malformed element fails to match anything" (harmless noise) — if a grantResolver bug or internal-representation mismatch replaces what *should have been* a real conflicting role string with a malformed element, the conflict is lost and the result flips to `ALLOW` with no denial, no error, no code. This is the identical shape and severity of bug `507b24d`/`037da18` exist to close, just not yet reached.

This is **not a defect introduced by `037da18`** — it predates this commit and predates `507b24d` — and it does not block merge under the same reasoning the producer/reviewer chain has consistently applied (PDP is fully unwired; `grep -rn "createPolicyDecisionPoint" src/` still shows no live caller outside the module's own test file). It should be recorded as an explicit, named fast-follow (round 4), not left as an offhand parenthetical in a review doc as it currently is.

## 3. Recursion assessment: is there a natural stopping point, or does round 4 exist?

**Round 4 exists and is concretely identified above** (`grant.roles` element-level shape). This review's own assessment of whether the pattern continues past round 4:

- The three rounds so far (container type → key vocabulary → value type, now proposed round 4: sibling field's element type) are all **structurally identical**: each closes "a shape check applied to field/level N of the grant object was a container/type check but not a full recursive shape check of its contents," and each was found by literally the same method (read `collectProhibited`/`checkConflictingRoles` in `sod-rules.mjs`, find where a value is used with an implicit type assumption the PDP doesn't enforce). Round 4 (`grant.roles` elements) is the last field of this kind: after `grant.roles` elements and `grant.history` values (both now identified), there is no further *nested* field inside the `grant` object that `sod-rules.mjs` dereferences without an existing check — `grant.decisionId` is already `isBlank`-checked, `grant.allowed` is already strict-`=== true`-checked (§2d of the prior review confirmed no sibling-collaborator gap on `identity`/`contract`/`risk`). So the *shape-validation* recursion has a genuine, nameable stopping point: fixing round 4 (mirror the exact `isWellFormedActorId`-over-elements pattern already proven correct for `history`, applied to `roles`) exhausts the grant object's shape surface.
- What does **not** have a stopping point at this layer is the adjacent, different problem class in §4 below (Unicode/identity-canonicalization) — but that is deliberately out of scope for "shape validation" as this file itself scopes its own charter (K-16: identity issuance/binding is explicitly not this facade's job in this slice). Recommend NOT chasing that into a "round 5" of the same fix; it belongs to a future identity-canonicalization concern, if the PDP is ever wired to real, external-string actor-ids.

**Recommendation: close round 4 (`grant.roles` element shape) as a fast-follow using the identical pattern already validated for `history` values, then treat the shape-validation dimension of this fix line as complete.**

## 4. Whitespace / Unicode-confusable actor-id probe

```
T4: history: { producer: "   " } (three ASCII spaces)
  => DENY DENY_MALFORMED_GRANT_SHAPE   -- correctly denied; isBlank()'s trim() strips ASCII/Unicode whitespace-class chars

T5: history: { producer: "​" } (zero-width space, U+200B), requester actor_id "agent-x-01" (normal string)
  => ALLOW ALLOW   -- passes shape validation as "well-formed" (JS's String.prototype.trim() does NOT strip U+200B), never matches the real requester, no prohibition fires

T5b: same "​" history value, requester actor_id ALSO literally "​" (degenerate exact-byte match)
  => DENY DENY_SOD   -- when both sides are byte-identical, the existing strict-equality comparison in sod-rules.mjs still works correctly
```

Finding: `isBlank()`'s `trim() === ""` check does **not** use the same character class as a canonicalization/normalization routine would (`​` is not in ECMAScript's `WhiteSpace`/`LineTerminator` production, so `trim()` leaves it untouched, and it reads as non-blank). This means a technically-non-blank string can still be semantically meaningless as an actor-id.

This is **not**, however, a "convention mismatch between the shape check and the actual downstream comparison" in the sense the task hypothesized — `sod-rules.mjs`'s `collectProhibited()`/`checkProhibitedActors()` performs **zero normalization**: it is raw strict-equality (`prohibited.has(actorId)`, effectively `===`) with no `.trim()`/case-fold/Unicode-normalize step of its own. So the PDP's `isBlank` check and the SoD module's comparison are already consistent with each other (neither normalizes) — there is no divergence between what the shape gate accepts and what the matcher expects. The real exposure is one layer further out: if an upstream `grantResolver`/store ever produced a corrupted or confusable actor-id string (whether from encoding bugs, copy-paste of an invisible character, or genuinely adversarial input) instead of the true actor-id, no layer in this file or in `sod-rules.mjs` would catch it, because "is this string well-formed" and "is this string the SAME identity as that other string" are different questions, and only the first is what shape validation can ever answer. This file explicitly disclaims the second question for `actor_id` itself already (K-16 `serverDerived` honesty note) — the same disclaimer implicitly extends to `grant.history` values, which are just actor-ids from a different source. Recommend documenting this as an explicit **out-of-scope note** (identity-canonicalization is a K-14-activation-time concern, same disposition as the already-deferred §2.4 cross-primitive-snapshot finding), not a fast-follow against this fix.

## 5. Test suite — independently re-run, counts match exactly

Ran `npm test` (`npm run validate && node --test tests/*.test.mjs`) in this review's own isolated worktree (after `npm ci` to materialize dependencies), independent of the producer's checkout:

- Exit code: `0`.
- **1113 tests / 1108 pass / 0 fail / 5 skip** — matches the producer's Addendum 001 claimed post-fix counts exactly.
- Re-inspected the one known cross-branch item from the prior round (`approval-binding.test.mjs`'s byte-identity guard excluding `policy-decision-point.mjs`): still passes, still correctly excluded with a dated, documented rationale; no new instance of this class of conflict introduced by `037da18`.

## 6. Hardcoded test-ID branching — none found

```
grep -n "NODE_ENV\|process.env" src/control/policy-decision-point.mjs src/control/sod-rules.mjs   -> no matches
grep -n '"agent-\|"dec_\|=== *"agent\|actorId *===\|actor_id *==='  src/control/policy-decision-point.mjs -> no matches
grep -rl "NODE_ENV" src/ -> no matches
```

Confirms the producer's and prior reviewer's grep claims independently; no test-mode conditionals, no literal actor-id/decision-id branching anywhere in the reviewed source.

## 7. Scope discipline — confirmed

`git diff --stat 2ee971c 037da18`:

```
 .../candidates/mod-gov-s3-pdp-grant-shape-fix-producer-verification-001.md |  73 ++++
 .../candidates/module-completion-tracker-001.md                            |   1 +
 src/control/policy-decision-point.mjs                                      |  38 ++-
 tests/policy-decision-point.test.mjs                                       | 117 ++++++
```

Only `policy-decision-point.mjs` (source), its own test file, and documentation changed. `sod-rules.mjs` remains read-only imported, unmodified. PDP remains fully unwired (no new import surface; `Object.freeze({ decide })` unchanged).

## 8. Well-shaped / legitimate cases — confirmed unaffected

T2b, T6, T7 above, plus T3 (a genuinely conflicting `["ENGIN", <malformed>]` array still denies on the real `ENGIN` string) all confirm: no new false denials on any well-shaped or partially-malformed-but-still-genuinely-conflicting input probed in this review.

## Recommendation

**APPROVE_WITH_NOTES.** `037da18` correctly and verifiably closes the exact scenario it targets (`history` value shape, including element-level scrutiny inside Array/Set values — it does NOT repeat round 1's container-only mistake for this field), regresses nothing, keeps strict scope discipline, and its test counts are independently reproduced exactly (1113/1108/0/5, exit 0). This review confirms one open, real, same-severity-class item the fix does not reach: `grant.roles` element-level shape (a malformed array element can mask a genuine `SOD_ROLE_CONFLICT` into a silent `ALLOW`, empirically reproduced in `T3b`) — recommend a named round-4 fast-follow using the identical `.every(isWellFormedActorId)`-style pattern already proven for `history`, before any K-14 activation slice wires a real `grantResolver`. A second, lower-priority note (Unicode/zero-width-space actor-id strings passing shape validation while being semantically inert) is flagged as an out-of-scope identity-canonicalization concern, not a shape-validation defect, and should not be folded into the round-4 fast-follow. With round 4 closed, this reviewer's assessment is that the shape-validation dimension of this fix line will be structurally complete — no further recursion is anticipated within `grant`'s own fields.

```yaml
self_certification:
  agent_id: claude-rev-sec
  peer_agent_id: claude-motor
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

---

### Provenance

- Source: independent read of `src/control/policy-decision-point.mjs` and `src/control/sod-rules.mjs` @ `037da18`, plus fresh reproduction scripts run in an isolated detached-HEAD worktree.
- Timestamp: 2026-07-21T12:11:44Z.
- Agent ID: claude-rev-sec (REV/SEC role, BST-SA team, worker/advisory only — no approval or execution authority).
