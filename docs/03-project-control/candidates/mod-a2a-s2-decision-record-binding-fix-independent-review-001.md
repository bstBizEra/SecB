# MOD-A2A Slice S2 — Decision-Record Binding Fix — Independent Review (mod-a2a-s2-decision-record-binding-fix-independent-review-001)

- reviewer_identity: `claude-rev-sec` (BST-SA worker, role REV/SEC; advisory-only, no merge/execution authority)
- reviewer_role: independent reviewer, unaffiliated with the producer run that authored `12944cc`
- target: `bst/mod-a2a-s2-decision-record-binding-fix-001` @ `12944cc65e52d90cdf2e58e308c9b173c5f1bc7`
- base: `origin/main` @ `0aa13f8cd68be265bc3c2e3227fdd649daaba55b` (confirmed via `git log --oneline -5`; `12944cc` is exactly one commit ahead of `0aa13f8`)
- date: 2026-07-22
- environment: isolated detached-HEAD worktree at `12944cc` (`C:\Users\ounkh\SecB-worktrees\mod-a2a-s2-decision-record-binding-fix-independent-review-001`), separate from the producer's own worktree at `C:\laragon\www\SecB\.claude\worktrees\mod-a2a-s2-decision-record-binding-fix-001`. No push, no merge, no commit to `main`, no wiring performed. This review's own commit is landed on the target branch via `git update-ref` from this detached worktree, not by committing inside the shared live-branch worktree directly.
- self_certification:
  ```yaml
  self_certification:
    agent_id: claude-rev-sec
    peer_agent_id: claude-motor
    certification_scope: advisory_only
    execution_authority: false
    approval_authority: false
    ready_for_operator_review: true
  ```

## 1. Diff scope (verified via `git diff 0aa13f8 12944cc --stat`)

```
docs/.../mod-a2a-s2-decision-record-binding-fix-producer-verification-001.md |  72 ++
docs/.../module-completion-tracker-001.md                                    |   1 +
src/control/delegation-gate.mjs                                              |  96 ++-
tests/delegation-gate.test.mjs                                               | 149 ++-
4 files changed, 304 insertions(+), 14 deletions(-)
```

Only `delegation-gate.mjs` (+ its test file) and docs were touched. `escalation-route.mjs`, `non-escalation-comparator.mjs`, `risk-registry.mjs`, and `retry-policy.mjs` are untouched (`git diff 0aa13f8 12944cc -- src/control/retry-policy.mjs` is empty; confirmed by direct diff, not by assertion).

## 2. Side-by-side pattern comparison — genuine reuse, not reinvention

Read both files in full, not just the new hunks.

`escalation-route.mjs` (pre-existing, unmodified):
```js
const bindingRef = (id, version, role, actor) => `escalation-route:${JSON.stringify([id, version, role, actor])}`;
...
evidence_refs: [result.ok ? bindingRef(...) : "escalation-route:denied", ...(identity.evidenceRefs ?? [])]
...
export function verifyEscalation(decision, { exactDelegationId, exactDelegationVersion, escalationActorRole, escalationActorId } = {}) {
  if (!decision || typeof decision !== "object") return deny("DENY_UNKNOWN_ESCALATION");
  if (!nonBlank(exactDelegationId) || !Number.isInteger(exactDelegationVersion) || ...) return deny("DENY_MALFORMED_VERIFICATION_REQUEST");
  if (decision.decision_type !== "GOVERNANCE") return deny("DENY_WRONG_DECISION_TYPE");
  ...
  const expected = bindingRef(...);
  return Array.isArray(decision.evidence_refs) && decision.evidence_refs.includes(expected) ? { ok: true } : deny("DENY_DELEGATION_MISMATCH");
}
```

`delegation-gate.mjs` (new):
```js
function delegationBindingRef(requestedCeiling, boundingCeiling, outcome) {
  return `delegation-gate:${JSON.stringify([requestedCeiling, boundingCeiling, outcome])}`;
}
...
evidence_refs: [delegationBindingRef(requestedCeiling, boundingCeiling, outcome), ...(Array.isArray(evidenceRefs) ? evidenceRefs : [])]
...
export function verifyDelegationDecision(decision, { requestedCeiling, boundingCeiling } = {}) {
  if (!decision || typeof decision !== "object") return { ok: false, code: DENY_UNKNOWN_DELEGATION_DECISION };
  if (decision.decision_type !== "DISPOSITION") return { ok: false, code: DENY_WRONG_DECISION_TYPE };
  const trueEvaluation = evaluateDelegation({ requestedCeiling, boundingCeiling });
  ...
  const expected = delegationBindingRef(requestedCeiling, boundingCeiling, trueOutcome);
  if (decision.outcome !== trueOutcome) return { ok: false, code: DENY_DECISION_MISMATCH };
  if (!Array.isArray(decision.evidence_refs) || !decision.evidence_refs.includes(expected)) return { ok: false, code: DENY_DECISION_MISMATCH };
  return { ok: true };
}
```

Confirmed: same `<module-prefix>:${JSON.stringify([...])}` construction, same "prepend fingerprint into `evidence_refs`" placement, same mint/verify split, same "verify recomputes ground truth via the real evaluator once" discipline. This is a genuine verbatim reuse of the S3 mechanism, not a divergent reinvention. One small, immaterial deviation: `verifyDelegationDecision` has no upfront `nonBlank`/`Number.isInteger`-style malformed-input guard on its own arguments the way `verifyEscalation` does (`DENY_MALFORMED_VERIFICATION_REQUEST`) — it relies entirely on `evaluateDelegation`'s own `validShape` fail-closed behavior to produce a deny outcome for malformed ceilings. This is not a security gap (see §4) but is a minor stylistic asymmetry worth a note.

## 3. Exact original scenario — reproduced fresh, independently, and closed

Wrote a from-scratch script (not copied from the producer's test file) importing `delegation-gate.mjs` directly and reproducing: requested `R4/RESTRICTED/paths:["/"]/tools:["*"]` vs. bounding `R0/PUBLIC/empty`.

- `evaluateDelegation(hostile)` → `{ ok: false, code: 'DENY_ESCALATION', dimension: 'riskClass' }` (ground truth: genuinely denied).
- Hand-fabricated `{ ok: true, code: "ALLOW" }` passed to `buildDelegationDecisionRecord(fabricated, identity(), hostile)` → mints `outcome: "ALLOW"` (mint performs no re-decision, as designed/disclosed).
- `verifyDelegationDecision(forged, hostile)` → `{ ok: false, code: 'DENY_DECISION_MISMATCH' }`.

The exact scenario from the third-independent-review is genuinely caught. Also independently confirmed a genuine `ALLOW` case and a genuine `DENY_ESCALATION` case (both built from `evaluateDelegation`'s own real output for its real inputs) verify clean (`{ ok: true }`), with **no new false `DENY_DECISION_MISMATCH`** for legitimate decisions.

## 4. Fingerprint injectivity — not universally injective, but the gap is not exploitable here

The producer's doc calls the binding "injective." Tested this directly against the raw `delegationBindingRef` construction (isolated probe script, not the module's exported surface — `delegationBindingRef` itself is private/unexported):

- **Naive concatenation ambiguity** (the class of bug this project has hit before, e.g. `"ab"+"c"` vs `"a"+"bc"`): **avoided**. `JSON.stringify(["ab","c"])` ≠ `JSON.stringify(["a","bc"])` because array/string delimiters are structural. Confirmed distinct for `paths:["ab"],tools:["c"]` vs `paths:["a"],tools:["bc"]`.
- **Key-insertion-order sensitivity**: semantically-identical ceilings with keys in a different insertion order produce *different* fingerprints (a false-negative risk, not a collision) — not a security issue, just a possible spurious-mismatch footgun if a caller ever reorders keys, which does not happen anywhere in this codebase's ceiling construction.
- **Real collisions found**, all traceable to standard `JSON.stringify` quirks, not to the array-vs-concatenation design:
  - an object key set to `undefined` vs. the key absent entirely (`{riskClass:"R1", extra: undefined}` vs `{riskClass:"R1"}`) — both serialize to `{"riskClass":"R1"}`.
  - `NaN`, `Infinity`, and `null` all serialize to `null` for a numeric-typed field.
  - a sparse-array hole vs. an explicit `undefined` array element both serialize to `null`.
- **Why this doesn't reopen the closed gap**: `evaluateDelegation`'s `withinCeiling` → `validShape` rejects any ceiling whose `riskClass`/`dataClassification` aren't strings or whose `paths`/`tools`/`transitions` aren't arrays of strings, denying `DENY_ESCALATION_UNCOMPARABLE` before a genuine `ALLOW`/`DENY_ESCALATION` can ever be produced from a malformed (NaN/undefined/hole-bearing) ceiling. A **well-formed** real ceiling pair (the only kind that can ever produce a genuine `ALLOW` or `DENY_ESCALATION` ground truth) can never JSON-collide with a malformed one, because well-formed fields always serialize as quoted strings/clean arrays, never as `null`. So an attacker cannot use these edge cases to make a forged `ALLOW` verify as legitimate against a real, well-formed, deny-worthy ceiling pair — the exact attack this fix targets remains closed.
- **Caveat worth disclosing** (not a blocker): `buildDelegationDecisionRecord`/`verifyDelegationDecision` do **not** shape-validate their `requestedCeiling`/`boundingCeiling` arguments before fingerprinting (unlike `verifyEscalation`'s own `nonBlank`/`Number.isInteger` guards on its scalar arguments). This is the same characteristic S3's identical `JSON.stringify`-based construction already has — it is inherited verbatim, not newly introduced, and is not reachable for the record-forgery scenario this fix targets. Recommend a fast-follow note (not a blocking issue) if `delegationBindingRef`/`bindingRef` are ever reused a third time: add explicit shape validation ahead of fingerprinting, since correctness currently depends on "callers only ever pass well-formed ceilings," which is true today but implicit rather than enforced by this function.

## 5. Reachability — is the protection actually wired, or just a theoretical export?

`grep -rn "delegation-gate" src/ tools/` (re-run independently in this worktree) returns **only** `src/control/delegation-gate.mjs` itself. `grep -rn "verifyDelegationDecision"` repo-wide (excluding `node_modules`) returns hits **only** in `delegation-gate.mjs`'s own definition/comments and in `tests/delegation-gate.test.mjs` — zero production call sites in `src/` or `tools/`.

**This means `verifyDelegationDecision` is not actually invoked anywhere a real decision record would flow through it.** The module remains genuinely unwired, exactly as both the producer's doc and the original review state. This is an accurate, disclosed characterization, not an overclaim — the producer's verification doc explicitly says "this fix does not connect `delegation-gate.mjs` to `HandoffService`, `RuntimeRegistry`, `DelegationLedger`, or any live dispatch path" and does not claim the protection is reachable in production today. The protection is **theoretically available and correctly implemented**, but a future wiring layer must remember to actually call `verifyDelegationDecision` at the point a decision record is consumed/trusted — that dependency is named, not hidden, but it is real and should stay tracked as a condition of this fix's practical value (the fix closes the *forgeability* gap in the function's own logic; it does not by itself protect any live system, because nothing live calls this module yet).

## 6. `retry-policy.mjs` — confirmed separate, unfixed, accurately characterized

`git diff 0aa13f8 12944cc -- src/control/retry-policy.mjs` is empty — genuinely untouched. `grep -n "buildRetryDecisionRecord" src/control/retry-policy.mjs` shows the function still exists with its original (pre-fix-pattern) signature, i.e. it still has the identical unbounded-trust gap this PR fixes for `delegation-gate.mjs`. The producer's doc explicitly and correctly names this as a **separate, not-yet-fixed** instance of the same pattern, deliberately out of scope, and does not claim or imply it is already fixed. Confirmed accurate.

## 7. Test suite — independently reproduced

Ran `npm test` fresh in this worktree:

```
tests 1286
pass 1283
fail 0
cancelled 0
skipped 3
```

Matches the claimed 1286/1283/0/3 exactly.

## 8. Hardcoded test-ID branching

`grep -niE "test|dec_delegation|===\s*['\"]|decisionId\s*===|if\s*\(.*id\s*===" src/control/delegation-gate.mjs` → zero hits, confirmed independently. No hardcoded test-ID branching found.

## Verdict: APPROVE_WITH_NOTES

The fix genuinely closes the exact gap the third independent review found: the reviewer's hand-fabricated-ALLOW-for-a-real-DENY_ESCALATION-pair scenario is reproduced fresh here and confirmed caught by `verifyDelegationDecision` with `DENY_DECISION_MISMATCH`. The mechanism is a faithful, verbatim reuse of S3's `bindEscalationRoute`/`verifyEscalation` pattern — same construction, same placement, same mint/verify split — not a divergent reinvention. Legitimate `ALLOW` and `DENY` cases built from `evaluateDelegation`'s own real output verify clean with no new false positives. `retry-policy.mjs`'s identical pre-existing gap is accurately named as a separate, deliberately out-of-scope, not-yet-fixed fast-follow. The full suite (1286/1283/0/3) matches the claim exactly, and no hardcoded test-ID branching was introduced.

Notes (non-blocking, recommended before or alongside a future wiring task):
1. The fingerprint is not universally injective (standard `JSON.stringify` quirks: `undefined`-key dropping, `NaN`/`Infinity`→`null`, sparse-array holes), but the only reachable collisions require malformed-shaped ceilings that `evaluateDelegation`'s own `validShape` already fail-closes before a genuine `ALLOW`/`DENY_ESCALATION` outcome could be produced from them — the specific attack this fix targets stays closed. Worth tightening (explicit shape validation ahead of fingerprinting in both `delegation-gate.mjs` and `escalation-route.mjs`) if this pattern is reused a third time, but not a blocker for this PR.
2. `verifyDelegationDecision` has no upfront malformed-input guard on its own arguments, unlike `verifyEscalation`'s `nonBlank`/`Number.isInteger` checks — minor asymmetry, not a functional gap given `evaluateDelegation`'s own fail-closed behavior.
3. **The fix's protection is not reachable in production today** — `verifyDelegationDecision` has zero call sites outside its own file and its test file. This is accurately disclosed by the producer (not an overclaim), but it means this PR closes a logic-level forgeability gap in an otherwise-inert module; it does not itself protect any live decision flow until a wiring layer is built and required to call `verifyDelegationDecision` at consumption time. Recommend that any future wiring task treat "call `verifyDelegationDecision`" as a mandatory acceptance criterion, not an optional enhancement.

## Provenance

- source: first-hand independent reproduction in an isolated detached-HEAD worktree (`C:\Users\ounkh\SecB-worktrees\mod-a2a-s2-decision-record-binding-fix-independent-review-001`) at `12944cc`, separate from the producer's own worktree; landed onto `bst/mod-a2a-s2-decision-record-binding-fix-001` via `git update-ref` (fast-forward from `12944cc`), not by committing directly inside the shared live-branch worktree.
- agent_id: claude-rev-sec (BST-SA REV/SEC worker, Claude Sonnet 5)
- timestamp: 2026-07-22
- disposition: advisory review only. Does not authorize merge, wiring, or production adoption. Recommends operator/governance review of the APPROVE_WITH_NOTES verdict and the three non-blocking notes above before this branch is proposed for merge.
