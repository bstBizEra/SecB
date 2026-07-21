# MOD-A2A Slice S2 — Third Independent Review (Non-Escalation Gate)

- reviewer_identity: `claude-immune` (BST-SA Immune worker; advisory only, no execution/approval authority)
- review_type: third independent pass, deliberately adversarial — dispatched to look specifically for what the prior two (fast, converging, ~4-minutes-apart) first-looks did NOT scrutinize
- module: `src/control/delegation-gate.mjs` (214 LOC) — `evaluateDelegation`, `evaluateDelegationRequest`, `buildDelegationDecisionRecord`
- candidate commit (already merged to `main`): `ac3258c` — reviewed at current `origin/main` tip `0aa13f8` (isolated detached-HEAD worktree, no live branch touched)
- prior review records read in full: `mod-a2a-s2-non-escalation-gate-producer-verification-001.md`, `mod-a2a-s2-non-escalation-gate-independent-review-001.md` (APPROVE_FOR_MERGE), `mod-a2a-s2-non-escalation-gate-rev-001.md` (APPROVE_WITH_NOTES)
- related cross-referenced records: `mod-a2a-s3-escalation-route-crossprovider-review-001.md` (S3's own M2 finding — escalation-route never calls S2)
- date: 2026-07-22
- environment: isolated `git worktree --detach` at `.claude/worktrees/immune-a2a-s2-third-review`, `npm ci` clean (6 packages), no push, no merge, no live branch touched

---

## Verdict: **APPROVE_WITH_NOTES**

`evaluateDelegation`'s core non-escalation logic is sound. I independently reconstructed every ordered-dimension boundary (exact-equality and off-by-one, both directions, across all five `RISK_ORDER`/`DATA_CLASS_ORDER` transitions), confirmed `withinCeiling` is called with the correct, non-swapped argument order (`requestedCeiling` as candidate, `boundingCeiling` as bound), confirmed the human-approval short-circuit fires correctly and only on the *requested* class, and confirmed malformed/missing/wrongly-shaped input fails closed via the comparator's own `validShape` in every case I tried. No hardcoded test-ID branching. Full suite green (1279 tests, 1276 pass, 0 fail, 3 skipped — this branch's own 24 tests also pass standalone). This reconfirms, independently, what both prior fast reviews concluded about `evaluateDelegation` itself.

However, going one level past where both prior reviews stopped — into `buildDelegationDecisionRecord`, which neither prior review's adversarial probes touched — I found a **real, previously-unflagged integrity gap**: the function trusts its `evaluation` argument completely at face value, with **no verification that it was actually produced by a real call to `evaluateDelegation`**, and the resulting decision record embeds **no trace whatsoever** of the `requestedCeiling`/`boundingCeiling` that were supposedly compared. A hand-fabricated `{ ok: true, code: "ALLOW" }` object produces a schema-valid `DISPOSITION` record byte-for-byte identical in shape to one produced by a genuine evaluation of a genuinely hostile escalation attempt — including a rationale string that reads as though the non-escalation invariant was checked, when it demonstrably was not. This directly confirms, from S2's own side, the same class of structural gap the S3 cross-provider review found from the caller's side (`escalation-route.mjs` never calls this gate at all): even a future, corrected wiring layer that *does* call `evaluateDelegation` faithfully would still produce an audit trail that cannot itself prove the recorded outcome came from a real evaluation of the recorded ceilings.

Not a blocker: the module remains genuinely UNWIRED (confirmed — nothing under `src/` or `tools/` imports it beyond itself), the gap is a pre-existing house-style pattern shared verbatim with `retry-policy.mjs`'s `buildRetryDecisionRecord` (not a regression this slice introduced), and `contracts/decision-record.schema.json` itself doesn't require input-binding for any decision record type. But it is real, it is novel relative to both prior reviews, and it should be a named fast-follow before any wiring layer is built on top of either `buildDelegationDecisionRecord` or the still-open S3 gap.

---

## 1. Ceiling-comparison boundary verification (independently reconstructed)

Built fresh fixtures, distinct from the shipped 24 tests, covering every adjacent pair on both frozen orders:

| Probe | Result |
|---|---|
| `riskClass` exact equality, all 5 classes (R0..R4) | R0/R1/R2 → `ALLOW`; R3/R4 → `DENY_HUMAN_APPROVAL_REQUIRED` (ceiling check itself allows; human-approval short-circuit correctly fires) |
| `riskClass` off-by-one **above** bound, all 4 adjacent pairs (R1>R0, R2>R1, R3>R2, R4>R3) | all four `DENY_ESCALATION` on dimension `riskClass` — correct |
| `riskClass` off-by-one **below** bound (narrower request), all 4 adjacent pairs | all four `ALLOW` (except where the *requested* side itself lands on R3/R4, which correctly still trips human-approval — not a ceiling-comparison defect, just the independent human-approval gate) |
| `dataClassification` off-by-one above/below, all 3 adjacent pairs (PUBLIC/INTERNAL/CONFIDENTIAL/RESTRICTED) | above → `DENY_ESCALATION`; below → `ALLOW`, all six probes correct |
| Argument-order sanity: `withinCeiling(wide, narrow)` called directly vs. via the gate with the same wide-requested/narrow-bound pair | identical `DENY_ESCALATION` in both — confirms the gate does **not** swap `requestedCeiling`/`boundingCeiling` when calling `withinCeiling` |
| `evaluateDelegationRequest` wrapper vs. direct `evaluateDelegation` call, same inputs | byte-identical result — confirms the wrapper forwards `.ceiling` unmodified without reordering params |

No off-by-one or boundary-inversion bug found. This matches (and independently reconfirms, at the exact-boundary level) what both prior reviews' equality/superset/chained probes concluded.

## 2. Shape-validation on injected collaborators (MOD-GOV-S3 PDP bug class) — **does not apply to this module the same way, confirmed by design**

The MOD-GOV-S3 PDP bug class concerned a **caller-injectable** collaborator (`policy-decision-point.mjs` accepts an optional `riskRegistry` override parameter, and only trusts it after checking `for (const method of ["riskProfile","isMutationAtMost"])` that it exposes the expected surface). `delegation-gate.mjs` has **no equivalent injection point at all** — `withinCeiling` and `riskProfile` are static ES-module imports (`import { withinCeiling } from "../services/non-escalation-comparator.mjs"`; `import { riskProfile } from "./risk-registry.mjs"`), not parameters a caller can substitute. There is structurally nothing for a caller to inject a hostile shape into.

Within that trust model, I confirmed the shape validation that *does* happen is real, not assumed:
- `withinCeiling` runs `validShape()` on **both** `requestedCeiling` and `boundingCeiling` before any comparison and returns `{ok:false, code:"DENY_ESCALATION_UNCOMPARABLE", dimension:"shape"}` on any malformed shape — reproduced directly for `undefined`, `null`, no-args, missing `riskClass`, non-array `paths`, and an array passed where an object was expected.
- `riskProfile(requestedCeiling.riskClass)`'s return value (`profile.value.humanApproval`) is only ever a value from the module's own frozen, internal `RISK_CLASSES` table — never attacker- or caller-supplied data — so there is no shape to attack on that return path either.
- Re-ran the REV review's own prototype-chain probes independently (own-property-shadows-inherited, `__proto__`-literal via spread, and a **new** probe not in either prior review: an object with **zero own properties at all**, entirely backed by a hostile/polluted prototype, on both the candidate and the bound side, including a live `Object.prototype.riskClass = "R4"` pollution test). In every case the comparison either read the inherited value symmetrically on both sides (consistent with REV review's already-disclosed, accepted L3 finding on the comparator) or failed closed on a glob/shape check first. No case produced an unwarranted `ALLOW`.

## 3. Silent-fail-open — confirmed absent

Every malformed/unexpected input I tried (`undefined`, `null`, no arguments, missing dimension, wrong-typed dimension, array-instead-of-object, a `delegationRequest` with no `.ceiling`) denied via the comparator's own `DENY_ESCALATION_UNCOMPARABLE` code. No path coerces malformed input into a permissive default. This reconfirms both prior reviews' conclusions with a fresh, independently-constructed fixture set.

## 4. Decision-record integrity — **REAL GAP, not previously scrutinized by either prior review**

Neither prior review's adversarial probes exercised `buildDelegationDecisionRecord` beyond confirming it mints the *expected* record for an *honestly-obtained* `evaluation` object. I tested the actual security question the task asked: **could a caller construct a decision record that doesn't match what was actually evaluated?**

Reproduced directly:

```js
const fabricatedEval = { ok: true, code: "ALLOW" }; // never called evaluateDelegation
const forgedRecord = buildDelegationDecisionRecord(fabricatedEval, identity);
```

produces a fully schema-valid `DISPOSITION` record — `additionalProperties:false`-compliant against `contracts/decision-record.schema.json`, would pass `DecisionLedger.appendDecision`'s contract gate — with `outcome: "ALLOW"` and a `rationale` string asserting "the requested ceiling sits within the delegating principal's own bounding ceiling on every dimension (non-escalation-comparator.withinCeiling)... A delegate cannot receive more authority than the delegator possesses," **even when constructed against a real, simultaneously-verified hostile escalation attempt** (`requestedCeiling` = R4/RESTRICTED/`paths:["/"]`/`tools:["*"]` vs `boundingCeiling` = R0/PUBLIC/empty, which `evaluateDelegation` itself correctly denies as `DENY_ESCALATION`). The forged record is **byte-for-byte structurally identical** (same field set, same JSON shape modulo `decision_id`) to a genuinely-obtained `ALLOW` record for an unrelated, harmless, actually-equal-ceiling request. Nothing in `identity` (`evidenceRefs` etc.) is validated against the evaluation's actual inputs either — `evidenceRefs` is caller-supplied free text, unchecked.

Root cause: `buildDelegationDecisionRecord(evaluation, identity)` derives `outcome`/`rationale` from `evaluation.ok`/`evaluation.code` alone (lines 182–183 of `delegation-gate.mjs`) and never touches `requestedCeiling`/`boundingCeiling` at all — those values aren't even in scope inside this function. There is no hash, no injective binding string, no closure capture linking the minted record back to a specific gate invocation over specific ceilings.

**This is exactly the S3-side gap, confirmed from S2's own side.** The S3 cross-provider review (`mod-a2a-s3-escalation-route-crossprovider-review-001.md`, finding M2) already found that `escalation-route.mjs` never calls `evaluateDelegation` at all. What I've confirmed here is the second half: **even if a future wiring layer fixed that and called `evaluateDelegation` faithfully**, nothing in `buildDelegationDecisionRecord` would prevent that same wiring layer (through bug or malice) from later minting an `ALLOW` decision record disconnected from the ceilings actually evaluated — and nothing in the resulting ledger entry would let an auditor detect the mismatch after the fact. Notably, S2's own sibling S3 slice (`escalation-route.mjs`'s `bindEscalationRoute`) already demonstrates the fix pattern this module lacks: it mints an **injective binding string over `[delegationId, version, role, actorId]`** into `evidence_refs` and a `verifyEscalation` function that re-derives and checks it. `delegation-gate.mjs` has no analogous binding for its own decision candidates.

Severity assessment: **not blocking** — the module is genuinely unwired (reconfirmed: `grep -rl "delegation-gate" src/ tools/` matches only the file itself), so nothing in current production can exploit this today, and the pattern is inherited house style (`retry-policy.mjs`'s `buildRetryDecisionRecord` has the identical shape), not a regression unique to this slice. But it is a real, concrete, previously-unflagged gap directly on-point for this review's mandate, and should be named as a fast-follow: bind `buildDelegationDecisionRecord`'s output (e.g., a hash or injective string over `requestedCeiling`+`boundingCeiling`+`outcome` into `evidence_refs`, mirroring S3's own `bindEscalationRoute` pattern) before any live wiring layer is built to consume it, and before the S3 gap is closed — otherwise closing the S3 gap alone would still leave the resulting audit trail forgeable at the record-minting layer.

## 5. S3 structural-binding gap, confirmed from S2's own side

Confirmed independently: `grep -rl "delegation-gate" src/ tools/` returns only `src/control/delegation-gate.mjs` itself — no consumer exists anywhere in the live tree, matching the S3 review's own finding that `escalation-route.mjs` imports only `sod-rules.mjs`, never this gate. From S2's own side there is **no structural mechanism** — no export, no required-parameter, no capability token — that would force a caller to have actually invoked `evaluateDelegation` before calling `buildDelegationDecisionRecord`, and (per §4 above) no way to verify after the fact that it did. The two findings compound: S3 doesn't call S2 (their finding), and even a fixed S3 that did call S2 would produce a decision record indistinguishable from a fabricated one (my finding). Both halves of "prove this was actually gated by S2" are currently open.

## 6. Hardcoded test-ID branching

`grep -niE "test|dec_delegation|===\s*['\"]|decisionId\s*===|if\s*\(.*id\s*===" src/control/delegation-gate.mjs` — zero hits. Confirmed absent, independently reproduced.

## 7. Test results

- `npm test` (full suite, this worktree, `npm ci` clean install): **1279 tests, 1276 pass, 0 fail, 0 cancelled, 3 skipped, 0 todo** — all green.
- `node --test tests/delegation-gate.test.mjs` (module's own test file, run directly, standalone): **24 tests, 24 pass, 0 fail**.
- Byte-identity of both reused primitives reconfirmed at current `main` tip `0aa13f8`: `non-escalation-comparator.mjs` blob `536758b3...` and `risk-registry.mjs` blob `b8ee7f9b...` — identical to the hashes both prior reviews recorded at the branch's original base. No drift.

---

## Advisory status fields

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: existing
risk_class: medium
```

(`risk_class: medium` reflects the decision-record integrity gap in §4 — a real, concrete, audit-trail-relevant finding, not the `low` both prior reviews recorded, though still not blocking given the module's confirmed UNWIRED status.)

```yaml
self_certification:
  agent_id: claude-immune
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

---

## Provenance

- source: first-hand reproduction in an isolated `git worktree --detach` checkout (`.claude/worktrees/immune-a2a-s2-third-review`, `origin/main` @ `0aa13f8`), separate from both prior reviews' worktrees; adversarial Node probe scripts run inside this worktree, never staged or committed, deleted after use.
- agent_id: claude-immune (BST-SA Immune worker, Claude Sonnet 5)
- timestamp: 2026-07-22
- disposition: advisory review only; no execution/approval/merge authority exercised; no push; no merge; recorded on a detached-HEAD ref via `git update-ref`, not on any live branch.

> Recommend APPROVE_WITH_NOTES. `evaluateDelegation`'s core non-escalation logic is confirmed sound under fresh, independently-constructed boundary/off-by-one/malformed-input/prototype-chain probes. The genuinely new finding this pass surfaces is in `buildDelegationDecisionRecord`: no binding ties a minted decision record to the ceilings actually evaluated, which — combined with the already-known S3 gap — means "this delegation was evaluated and allowed by S2" is not yet a provable claim end-to-end. Recommend a fast-follow to bind `buildDelegationDecisionRecord`'s output to its actual inputs (mirroring S3's own `bindEscalationRoute` injective-binding pattern) before any live wiring layer is built on either side of this gate. This review recommends; it does not authorize merge (already merged) or any wiring/execution action.
