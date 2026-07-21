# Second Independent Review: MOD-GOV S2 (risk-registry) + S3 (policy-decision-point)

- review_id: MOD-GOV-S2-S3-SECOND-INDEPENDENT-REVIEW-001
- status: CANDIDATE (advisory review; operator ratification required — no push, no merge, no live branch touched)
- reviewer: claude-immune (BST-SA immune role: security, policy, governance, authority-boundary review)
- team_id: BST-SA
- worker role: advisory only. This session neither approves nor authorizes execution.
- reviewed_at_commit: `origin/main` @ `385ac65943f2a5b158c8ec20a5fd947f06cd2987` (2026-07-21), isolated detached-HEAD worktree, no live branch touched
- prior_record_read: `docs/03-project-control/candidates/mod-gov-completion-rev-001.md` (module's ONE existing completion review, 2026-07-20) and `docs/03-project-control/candidates/mod-gov-s1-rev-001.md` (S1-only)
- mandate: S2 and S3 have never had a dedicated, adversarial, slice-level second look — only the single broad module-completion pass. This review's job is to independently re-verify that pass's claims and hunt specifically for the check-then-act / TOCTOU / authority-boundary bug shapes that a second, genuinely independent review has repeatedly found elsewhere in this codebase (MOD-RUNTIME-S3, MOD-LIVE-S1 x3, MOD-LIVE-S3, MOD-WSPACE-S3).
- method: first-hand. Built and ran an original adversarial probe harness against the real S3 module (deleted after use, never committed); read S2 and S3 source in full; traced every live caller of both via grep; ran the full suite and targeted suites myself; did not trust the prior review's account of any claim without independent reproduction.

---

## Verdict: APPROVE_WITH_NOTES (fast-follow required, non-blocking)

S2 (risk-registry) is re-confirmed clean: frozen at module load, no runtime mutable state, no race window, deny-by-default on every lookup. No new finding.

S3 (policy-decision-point) has a **real, previously-missed, reproducible bug**: the composition of S1's SoD primitive inside the PDP facade trusts the *shape* of the injected `grantResolver`'s output (`roles`, `history`) without validating it, and silently degrades a would-be **DENY** into an **ALLOW** when that shape is malformed or uses different key names than the ladder expects. This is exactly the "authority-boundary overreach / silent DENY-to-ALLOW downgrade" shape the mandate asked me to hunt for, and it was not exercised by the prior completion review's probe harness (which tested prototype-pollution and known-bad-shape inputs on the *request*, not on the *injected collaborator outputs*).

Because S3 remains genuinely unwired (verified below), there is no live exploitation path today — this is a **fast-follow, not a merge-blocker**, since S1-S3 are already merged to main. It must be closed (or explicitly accepted with a stated compensating control) before any K-14 activation slice wires a real `grantResolver` into `state-machine.mjs` or a service, because that is precisely the moment this gap becomes live-exploitable.

---

## Scope 1 — S2 risk-registry: independent re-verification

Read `src/control/risk-registry.mjs` in full (not re-trusted from the prior review).

| Check | My method | Result |
|---|---|---|
| Doc-parity is a real runtime check, not a fixture | Ran `tests/risk-registry.test.mjs` directly; confirmed it reads the actual markdown files | Confirmed — genuine, not stubbed |
| Immutability / tamper-resistance | `RISK_CLASSES`, `MUTATION_CLASSES`, `AUTHORITY_CLASSES` are `Object.freeze`d **at module-load time** from static literals. Nothing in the module re-computes or re-reads them after import; there is no setter, no cache-invalidation path, no I/O at call time | **No race window exists.** A caller cannot "race a classification against a concurrent registry update" because there is no concurrent update mechanism at all — the registry is a pure, permanently-frozen constant table for the lifetime of the process. This satisfies the mandate's tamper-resistance question cleanly. |
| Unknown/malformed risk class handling | Re-ran `riskProfile`, `requiredControls`, `mutationCeilingFor`, `mutationCapability`, `isRiskAtMost`, `isMutationAtMost` against unknown strings, `""`, `null`, `undefined`, and prototype-chain keys (`toString`, `constructor`, `__proto__`, `hasOwnProperty`) | Every case returns a typed `{ ok:false, code:DENY_* }` via `Object.hasOwn` own-property lookup (`ownEntry()`). Never a default. Deny-by-default holds. |
| Live callers | Grepped `src/`: consumed by `approval-binding.mjs`, `delegation-gate.mjs`, `access-mode-policy.mjs` (already independently reviewed in MOD-RUNTIME-S3 / MOD-LIVE module passes per the tracker). Spot-checked each caller's use of `riskProfile()`: all three gate on `profile.ok && profile.value.humanApproval === false` (or the deny-first inverse), which is safe — an unresolved profile (`ok:false`) can never satisfy the truthy branch, so it always falls through to deny-by-default. No check-then-act gap found in these consumers. | Confirmed safe |

**S2 verdict: clean, no new finding.**

---

## Scope 2 — S3 policy-decision-point: adversarial re-verification

### 2.1 Confirmed still unwired (live-caller trace)

```
grep -rn "policy-decision-point|createPolicyDecisionPoint" src/
```
Only self-references and comments in `approval-binding.mjs`, `delegation-gate.mjs`, `retry-policy.mjs` (documentation cross-references, not imports). `src/control/state-machine.mjs:173` still does `if (request.policyDecision !== "ALLOW")` — a **caller-supplied string**, exactly as the prior review reported. No import of `policy-decision-point.mjs` anywhere in a live path. This claim is re-verified, not re-trusted.

### 2.2 Stage-order / forgery re-probe

Re-ran the prior review's own adversarial categories (identity/contract/grant forgery, prototype pollution, prototype-key risk classes) independently rather than trusting the writeup — all reproduced as reported: no bypass, closed-envelope request validation holds, `serverDerived` is honestly always `false`, decision-record candidates are schema-valid on both outcomes. No divergence from the prior review here.

### 2.3 NEW FINDING (S3-N1, MEDIUM) — grant.roles / grant.history shape is trusted, not validated; malformed shape silently disables SoD

`decide()` validates the caller-supplied `request` extremely strictly (closed envelope, unknown-key deny, blank-string deny — `validateShape()`). It does **not** apply the same discipline to the *injected collaborators'* return values. Concretely, in the SoD stage:

```js
const roleSet = new Set(Array.isArray(grant.roles) || grant.roles instanceof Set ? grant.roles : []);
roleSet.add(request.role);
...
const ladder = sod.checkProhibitedActors(normalizedRole, request.actor_id, grant.history ?? {});
```

If `grant.roles` is present but **not** an Array/Set (e.g. a string, from a grantResolver bug or a different internal representation), it silently falls back to an **empty** role set rather than denying — meaning the conflicting-role check can never fire, no matter what roles the actor actually holds.

If `grant.history` uses different key names than the hardcoded `AUTHORIZE_TIME_LADDER` expects (`producer`, `reviewer`, `qa`, `evidenceVerifier` — S1's convention, not independently validated at the S3 boundary), the prohibited-actor lookup finds nothing at those keys and silently permits, even when the real-world fact (this actor previously acted as producer) is present in the payload under a different key.

**Reproduced first-hand** (probe script written to the worktree root, run, then deleted — never committed):

| Scenario | grantResolver output | Real-world fact | Result | Expected |
|---|---|---|---|---|
| A (baseline, correct shape) | `roles:["REV"], history:{producer:"agent-engin-01"}` | actor is the producer, requesting REV | `DENY DENY_SOD` | DENY — matches |
| B (history key mismatch) | `roles:["REV"], history:{producerActorId:"agent-engin-01"}` | same actor, same fact, only the key name differs | **`ALLOW ALLOW`** | should DENY — **silent downgrade** |
| C (history omitted) | `roles:["REV"]` (no `history` field at all) | n/a | `ALLOW ALLOW` | plausibly-intended (optional field), flagged for completeness |
| D (baseline, array roles) | `roles:["ENGIN"]`, request role `REV` | actor's grant carries ENGIN+REV together | `DENY SOD_ROLE_CONFLICT` | DENY — matches |
| E (roles shape mismatch) | `roles:"ENGIN"` (string, not array), request role `REV` | same conflicting combination | **`ALLOW ALLOW`** | should DENY — **silent downgrade** |

Scenarios B and E are the load-bearing ones: identical underlying facts, differently-shaped-but-plausible collaborator output, and the PDP's answer flips from DENY to ALLOW with **no error, no log, no typed denial code** — it just looks like a clean ALLOW. This is precisely the "silently downgrade a DENY to an ALLOW under some edge condition" pattern the mandate named, and it sits exactly at the S1(SoD)+S3(PDP composition) seam the mandate asked me to scrutinize — not a timing race, but a **trust-boundary gap on the shape of injected collaborator state**, which is the facade-composition analogue of the check-then-act bugs found elsewhere in this codebase (the "check" — did SoD find a conflict — silently no-ops instead of failing closed when its input is malformed, and the "act" — ALLOW — proceeds anyway).

Contrast with how the module treats the `request`: a malformed request field is **always** a typed deny. A malformed *resolver output* field is, for `roles`/`history`, silently coerced to "empty" (least restrictive) rather than denied. That asymmetry is the root cause. (`identity.resolved`, `contract.allowed`, `grant.allowed`/`decisionId` ARE strictly type-checked — only `roles` and `history`, the two SoD-input fields, are not.)

**Why this is a fast-follow, not a blocker:** S3 is unwired (2.1). No live `grantResolver` exists yet, so there is no exploitable path today. But this is exactly the shape of bug that becomes live the moment a K-14 activation slice wires a real grant store behind `grantResolver` — and grant/history shape drift between the grant store's native representation and the PDP's hardcoded `AUTHORIZE_TIME_LADDER` key names is a realistic integration failure mode, not a contrived one.

**Recommended fast-follow (not authorized by this review — advisory only):**
1. Validate `grant.roles` is an Array/Set and `grant.history` is a plain object at the PDP boundary; deny with a typed code (e.g. `DENY_MALFORMED_GRANT_SHAPE`) rather than silently defaulting to empty.
2. Add this exact scenario (mismatched/malformed `roles`/`history` shape) as a required, versioned acceptance test on `tests/policy-decision-point.test.mjs` before any K-14 activation PR is reviewed.
3. State the expected `history` key vocabulary as part of the `grantResolver` contract docstring (it currently states the top-level shape `{allowed, decisionId, roles?, history?}` but not the required inner key names for `history`).

**Severity: MEDIUM** (fail-closed violated only on malformed/mismatched collaborator output, not on well-formed input; no live exploitation path exists today because the module is unwired; becomes HIGH-relevant at the moment of K-14 wiring if not fixed first).

### 2.4 Cross-primitive TOCTOU / atomicity (S1+S2 composition inside S3)

Traced explicitly per the mandate:
- `identityResolver`, `contractResolver`, `grantResolver` are called **sequentially, synchronously** (no `await`, no Promise handling — a resolver returning a Promise fails the `isPlainObject`/`resolved===true` check and denies). JS's single-threaded execution model means no interleaving can occur *inside* `decide()` itself between these three calls.
- However, **each resolver is independently injected** and, once wired to a real store, could read that store's state at its own call-time with no shared "as-of" snapshot or version token passed between them. `decide()` does not request a consistent point-in-time view across identity/contract/grant — it takes three independent reads and composes them. This is an architectural property, not a bug in the current code (nothing is wired yet, and the module explicitly documents that adoption/wiring is a separately-governed, R3/SEC/GOV-gated slice) — but it is a **latent cross-primitive consistency gap** that the K-14 activation acceptance criteria should explicitly require adopters to close (e.g., a single snapshot/version passed to all three resolvers), the same class of problem as the file-header TOCTOU bugs found in MOD-LIVE, just at the composition layer rather than inside a single primitive.
- Within the risk gate itself (S2), there is no state to race (2.1) — `risk.riskProfile()` is a pure function of caller-supplied `risk_class`, not of any external store, so S1+S2 composition inside S3 (the conflicting-roles/prohibited-actor/risk-gate sequence, stage 6-10) is internally atomic: all inputs to those stages come from either the single frozen `request` or the single `grant` object already resolved in stage 5. **No TOCTOU found in the S1+S2 composition itself** — the gap is upstream, in resolver-shape trust (2.3), and in the identity/contract/grant snapshot question (not yet exploitable, unwired).

### 2.5 Authority-boundary check

No path lets a caller self-authorize what should require human/GOV sign-off: `profile.value.humanApproval !== false` unconditionally denies with `DENY_HUMAN_APPROVAL_REQUIRED` for R3/R4, re-verified directly. The PDP itself never substitutes for a human approval. The one authority-boundary-relevant gap found is 2.3 (a malformed/mismatched grant shape can suppress an SoD **denial**, not manufacture a human-approval bypass — R3/R4 stay gated by the unconditional risk check regardless of SoD outcome).

---

## Scope 3 — Test suite (measured first-hand)

- `node tools/validate-foundation.mjs` → **exit 0**
- `node --test tests/*.test.mjs` → **tests 1098 / pass 1093 / fail 0 / skipped 5** (measured directly, matches growth from the prior review's 419-test baseline as the repo has since grown; 0 unexplained failures)
- Targeted: `node --test tests/policy-decision-point.test.mjs tests/risk-registry.test.mjs tests/sod-rules.test.mjs` → **62/62 pass, 0 fail**
- Confirmed via direct read of `tests/policy-decision-point.test.mjs`: every `grantResolver` fixture in the existing suite supplies well-formed `roles` (array) and `history` (plain object, correct keys). **No existing test exercises malformed/mismatched `roles`/`history` shape** — this is precisely why 2.3 was not caught by either the producer's own tests or the prior completion review's probe harness.

## Scope 4 — Hardcoded test-ID / environment bypass sweep

`grep -rniE "NODE_ENV|test.?id|TESTING|DEBUG_MODE|bypass|skip.?auth|__test|isTest" src/control/ src/live/access-mode-policy.mjs src/live/event-family-policy.mjs` → one hit, a comment in `write-set-policy.mjs` referencing a *closed* prior finding ("bypasses (Codex REV-001) are closed by..."), not live bypass code. **No hardcoded test-ID branching or environment-based bypass found in S2/S3 or their direct neighbors.**

---

## Advisory status fields

- truth_status: verified_true (all findings reproduced first-hand in an isolated worktree; nothing taken on trust from the prior completion review)
- authority_status: advisory_only (execution_requires_operator for any merge, fix, or activation decision)
- implementation_status: existing, with one candidate fast-follow (S3-N1: validate grantResolver output shape before trusting it in the SoD composition)
- risk_class: medium (authority-defining primitive; the gap found is fail-closed-violating only under malformed collaborator input, module remains unwired today, no live exploitation path exists)

## Findings summary

| ID | Slice | Severity | Summary | Blocking? |
|---|---|---|---|---|
| S3-N1 | S3 (composition w/ S1) | MEDIUM | Malformed/mismatched `grant.roles` or `grant.history` shape from an injected `grantResolver` silently defaults to "no roles / no history" instead of denying, converting a would-be DENY_SOD/SOD_ROLE_CONFLICT into ALLOW | No (unwired; fast-follow before K-14 activation) |
| — | S2 | — | Re-confirmed clean; no new finding | — |

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

> Advisory review only. Recommend; do not authorize. S1-S3 are already merged to `main` — nothing here blocks that merge. S3-N1 is a fast-follow recommendation for the K-14 activation slice, not a revert or hotfix demand. Operator (with GOV + SEC, consistent with the module's own R3-activation gating) holds all decisions on remediation timing and scope.
