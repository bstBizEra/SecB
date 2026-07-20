# Independent Review: MOD-GOV Module Completion (REV-001)

- review_id: MOD-GOV-COMPLETION-REV-001
- status: CANDIDATE (advisory review; operator ratification required — no push, no merge)
- reviewer: claude-immune-rev-modgov-complete-01 (BST-SA immune agent, independent identity)
- producers_reviewed: claude motor agents (S1 `[MOD-GOV-S1]`, S2 `[MOD-GOV-S2]`, S3 `[MOD-GOV-S3]`)
- target_branch: `bst/mod-gov-s3-decision-point` @ `576dc789ab0f1bf26e9225450e3d3929ec53e4f8`
- review_branch: `claude/rev/mod-gov-completion` (created FROM the target tip)
- slices_in_target: S1 sod-rules + delegation (fold of `claude/rev/mod-gov-s1` @ `8bab140`, incl. its REV record) / S2 risk-registry (`e61082e`) / S3 policy-decision-point (`576dc78`)
- prior_records_read: `docs/03-project-control/candidates/mod-gov-gap-assessment-001.md` (on `bst/mod-gov-assessment` @ `62da42e`; K-1..K-16 map + module bar), `docs/03-project-control/candidates/mod-gov-s1-rev-001.md` (S1 APPROVE_WITH_NOTES)
- catalog_scope: MOD-GOV "Identity, policy, authority, risk, SoD"
- governance: BST-SA advisory contract (worker, not authority); AMD-002 candidate preparation; operator-only merge
- date: 2026-07-20T07:38:32Z
- method: first-hand. `npm ci`; validator + full suite measured directly; doc-parity claims re-verified by reading the four authoritative docs; S3 attacked with an independent adversarial probe harness (identity/contract/grant forgery, prototype pollution, prototype-key risk classes, mutation-class omission, serverDerived). No producer measurement taken on trust.

---

## Module verdict

**FINISHED_WITH_TRACKED_FOLLOWUPS.**

The deny-by-default kernel primitives for four of the five catalog dimensions —
**policy** (unified PDP choke point), **authority** (A0-A5 classes + ceilings),
**risk** (R0-R4/M0-M5 registry with a live doc-parity control), and **SoD**
(shared `sod-rules` primitive) — are delivered, pure, frozen, fail-closed, and
independently verified. The fifth dimension, **identity**, is covered for
*verification* (pre-existing `RuntimeRegistry.resolve` + registration-time
ceiling) but **issuance** (K-12) is deliberately un-started and, with its
dependent `serverDerived` closure (K-16), is the one substantive tracked
follow-up — it needs a GOV design decision on workload-identity binding, exactly
as the gap assessment scoped it (non-goal 4). The remaining follow-ups are the
adoption/activation wiring (K-9 at 3 sites, K-13 enforcement, K-14/K-15
activation), all left out by design under the kernel-first charter and R3-gated.
No gate was weakened; every slice stayed inside its declared scope; nothing is
wired into a live authorization path. Judged against the module's catalog scope
(not perfection), the kernel is complete with governance-gated follow-ups
tracked below.

---

## Scope 1 — S2 risk-registry (first full review)

### Findings

| # | Check | Method | Result | Severity |
|---|---|---|---|---|
| S2-1 | Doc-parity tests parse the *authoritative markdown at runtime*, not fixtures | Read `tests/risk-registry.test.mjs`: `readFileSync` of the four real docs via `parseTable()`; no embedded golden copies | PASS — genuine runtime parse of `authority-and-risk-model.md`, `16-security/02`, `SECB-GOV-001.md`, `11-agents/01`; any doc/code drift fails CI | PASS |
| S2-2 | Codified risk indicators + controls match LEGACY `authority-and-risk-model.md` §2 | Read doc lines 22-28 vs `RISK_CLASSES` R0-R4 | Byte-identical for all 5 rows (indicators + requiredControls) | PASS |
| S2-3 | Authority classes A0-A5 verbatim from §1 | Read doc lines 9-16 vs `AUTHORITY_CLASSES` | Names + permitted scope identical for all 6 | PASS |
| S2-4 | Mutation classes M0-M5 verbatim from `16-security/02` | Read doc lines 15-22 vs `MUTATION_CLASSES` | Capability text identical for all 6; single-sourced (no legacy counterpart) | PASS |
| S2-5 | Role topology + humanApproval from `SECB-GOV-001` §8 | Read doc lines 124-130; `humanApproval` derives from `/human/i` on the topology cell | Topology identical R0-R4; humanApproval false/false/false/**true**/**true** — matches "human GOV"(R3), "human approvals"(R4) | PASS |
| S2-6 | 5 recorded legacy-vs-v0.1 discrepancies | Read `16-security/02` risk table (lines 7-11) vs the 5 `DIVERGENCE(v0.1)` code notes | All 5 accurate: R0 adds "mutation"; R1 "reversible internal work"; R2 drops "config"/adds non-prod scope; R3 adds privacy/regulated, drops "shared platform"; R4 swaps "systemic,high-value" for "public,safety-critical" | PASS |
| S2-7 | DERIVED R->M ceiling conservative / no over-permit | Traced R0->M0, R1->M1, R2->M2, R3->M3, R4->M5; M4 excluded; monotone-nondecreasing test | Conservative: ceilings track the tighter reading (R2->M2 "isolated non-production"; R4 jumps to M5). M4 (restricted-env activation) never risk-derived — only A4-reachable. No R-class over-permits. NOT doc-parity asserted (no doc states R->M) and honestly flagged for v0.1 | PASS |
| S2-8 | DERIVED A->M ceiling | `A_n -> M_n` by index; invariant test | 1:1 index equality (A5->M5 governance-root->production). Defensible reading of §1 vs mutation table; flagged as invariant-not-doc-parity | PASS |
| S2-9 | humanApproval regex conservative | `/human/i` presence => true; consumed by PDP as `!== false` | Any topology naming "human" forces the gate; conservative | PASS |
| S2-10 | Frozen immutability | `Object.isFrozen` on all tables + entries; strict-mode mutation throws | Deep-frozen; `RISK_CLASSES.R0.mutationCeiling = "M5"` throws TypeError | PASS |
| S2-11 | Deny-by-default lookups | Ran `riskProfile`/`requiredControls`/`mutationCeilingFor`/`mutationCapability`/`isRiskAtMost`/`isMutationAtMost` on unknown + prototype keys | Every unknown/`""`/`undefined`/`null`/prototype key (`toString`,`constructor`,`hasOwnProperty`,`__proto__`,`valueOf`) returns typed `{ok:false, code:DENY_*}` via `Object.hasOwn` own-property lookup; never a default | PASS |

**Over-permit hunt:** none found. The registry classifies nothing — it maps a
supplied class to controls. Codifying LEGACY (authoritative until v0.1
acceptance) is the correct conservative choice; the doc-parity test binds code
to LEGACY so a silent drift on either side fails. The v0.1 classification
widening (privacy/regulated) is an input-classification/doc-acceptance matter,
not a registry defect — honestly flagged.

**S2 severity tally: 0 critical / 0 high / 0 medium / 0 low. Clean.**

## Scope 2 — S3 policy-decision-point (adversarial)

Independent probe harness built and run against the real module (`_probe.mjs`,
run inside the repo tree, deleted after). Outcomes:

| # | Attack | Input | Observed | Verdict | Severity |
|---|---|---|---|---|---|
| S3-1 | Stage-order bypass | Multi-factor failing requests | Sequential pipeline shape->clock->identity->contract->authority->SoD(conflict)->SoD(ladder)->risk->mutation->human; earliest failing stage always wins (verified identity>contract>authority>SoD>risk; mutation-exceeds>human at R3/M5). No branch skips a stage | No bypass | PASS |
| S3-2 | Identity forgery | `{resolved:1}`, `{resolved:"true"}` | DENY_IDENTITY (strict `=== true`) | Denied | PASS |
| S3-3 | Contract forgery | `{allowed:"true"}`, `{allowed:1}` | DENY_CONTRACT_INEFFECTIVE | Denied | PASS |
| S3-4 | Grant forgery | `{allowed:true}` (no decisionId), `{resolved:1}`, `{allowed:"true",decisionId:"d"}`, `{allowed:true,decisionId:123}` | DENY_AUTHORITY on all (requires `allowed===true` AND non-blank string decisionId; numeric id fails `isBlank`) | Denied | PASS |
| S3-5 | Prototype pollution | JSON with own `__proto__` key + nested `{polluted:true}` | DENY_MALFORMED_REQUEST (closed envelope); `Object.prototype.polluted === undefined` after | No pollution | PASS |
| S3-6 | Prototype-key risk class | `risk_class` = `toString`/`constructor`/`hasOwnProperty`/`__proto__`/`valueOf` | DENY_UNKNOWN_RISK_CLASS (registry `Object.hasOwn`) | Denied | PASS |
| S3-7 | mutation_class omission | R2 request, no `mutation_class` | **ALLOW** — ceiling check skipped when absent | See finding S3-F1 | LOW |
| S3-8 | Human gate never converts | R3/M2, R3/M3, R4/M5 | DENY_HUMAN_APPROVAL_REQUIRED on all; `humanApproval !== false` => deny | Gate holds | PASS |
| S3-9 | DENY_RECORD_INVALID degradation | Code path review | ALLOW with null candidate -> forced DENY_RECORD_INVALID (fail-closed terminal guard); unreachable on well-formed ALLOW but present | Fail-closed | PASS |
| S3-10 | Record candidate schema-valid, both outcomes | Ran ALLOW + DENY (identity, human-gate) candidates through `validateContract("decisionRecord",...)` | All 14 required fields present + typed; `decision_type:AUTHORITY`; `authority_ref` = grant id post-grant, `authority:not-established` sentinel pre-grant; zero-width validity window; shape/clock denials carry `candidate:null` (honest — no validated ctx/clock) | PASS |
| S3-11 | serverDerived honesty | grep source + probe every outcome | Every envelope hardcodes `serverDerived:false`; **no code path emits true**; flag lives on the envelope, NOT inside the closed decision-record schema (`additionalProperties:false`, no such field); `"serverDerived" in candidate === false` | Honest | PASS |
| S3-12 | decision_id determinism | Same request twice; allow vs related deny | `pdp_<24hex>` = `canonicalFingerprint({request,outcome,code})`; stable across calls (clock-bearing fields excluded from fingerprint); allow != deny | Deterministic | PASS |
| S3-13 | Unwired-by-construction | `git diff main...HEAD -- state-machine.mjs` + in-repo import guard test | `state-machine.mjs` untouched; no `policy-decision-point` import anywhere in live paths | Unwired | PASS |
| S3-14 | Frozen facade + config capture | Froze facade/result/candidate; mutated options post-construction | All frozen (strict-mode write throws); post-construction option swap cannot alter behavior (closure capture) | PASS |

### S3-F1 (LOW, adoption-gated) — mutation_class omission skips the ceiling gate

`decide()` guards the ceiling check with `if (request.mutation_class !== null)`.
`mutation_class` is optional, so omitting it (materialized as `null`) **skips**
the S2 ceiling comparison entirely; an R0/R1/R2 request can then ALLOW with no
mutation-ceiling enforcement (verified: R2 request minus `mutation_class` ->
ALLOW). Exposure is bounded and not a live over-permit:

- R3/R4 are caught unconditionally by the human gate regardless of
  `mutation_class`, so omission cannot manufacture an inappropriate ALLOW there.
- Only R0/R1/R2 (ceilings M0/M1/M2, non-production) are affected, and escaping
  the M2 bound additionally requires the caller to mis-declare `risk_class` (an
  M3+ intent at true integration risk should classify R3, hitting the human
  gate) — defense in depth partially covers it.
- Nothing consumes the PDP (unwired), so there is no active gate to bypass.

**Disposition:** LOW. Not a blocker. The PDP cannot check a ceiling for a
mutation it was never given; this is defensible as an optional declared
constraint. **Adoption requirement for the wiring slice:** any adopter that
relies on the PDP for ceiling enforcement MUST make `mutation_class` mandatory
(or treat omission as the M0 floor). Recommend this be a stated acceptance
criterion on the K-14/K-15 activation slice.

**S3 severity tally: 0 critical / 0 high / 0 medium / 1 low (adoption-gated).**

## Scope 3 — S1 notes disposition (F4 / F5)

The S1 review (`mod-gov-s1-rev-001.md`) approved-with-notes on two fail-closed
malformed-input divergences the extraction introduced over the inlined logic:

- **F4** — non-string `actorId` matching a non-string `grant.actorId`: OLD could
  PASS (or return DENY_SOD); NEW returns `DENY_MALFORMED_ACTOR`.
- **F5** — array/Set-valued history field: OLD treated the array as a single
  non-matching element and could ALLOW; NEW expands it and denies (`DENY_SOD`).

I re-read the S1 evidence and the `sod-rules` guards (`checkProhibitedActors`
type guards; `collectProhibited` array/Set expansion). Both divergences are (a)
reachable only with input no legitimate SecB caller produces, (b) strictly
equal-or-more-restrictive, and (c) have **no fail-open counterpart** anywhere.

**Recommendation: ACCEPT AS STRICTNESS (input hardening) — do NOT revert.**
Rationale: reverting would re-introduce a permissive path where a non-string or
array-shaped actor field could slip through the SoD ladder — the opposite of the
deny-by-default posture the module exists to enforce. Accepting aligns with the
kernel's fail-closed contract. Document F4/F5 in the S1 mandate as intended
input-hardening rather than a scope breach. This is advisory; operator + GOV +
SEC hold the R3 activation decision.

## Scope 4 — K-gap coverage ruling (K-1 .. K-16)

| K | Capability | Pre (assessment) | Post S1-S3 | Evidence |
|---|---|---|---|---|
| K-1 | Deny-by-default transition authz | implemented | **closed** | unchanged (behavior-preserving) |
| K-2 | Grant scope/window/decision binding | implemented | **closed** | unchanged |
| K-3 | State machines P/WP/S/E | implemented | **closed** | unchanged |
| K-4 | Append-only ledgers + temporal/reversion | implemented | **closed** | unchanged |
| K-5 | Identity record + registration ceiling + deny-by-default resolve | implemented | **closed** | unchanged (identity *verification*) |
| K-6 | Non-escalation of ceilings | implemented | **closed** | unchanged |
| K-7 | SoD conflict-pairs + actor-history | implemented | **closed** | now sourced from `sod-rules` primitive |
| K-8 | Contract effectiveness resolution | implemented | **closed** | unchanged |
| K-9 | SoD as a reusable primitive others call | partial | **closed (kernel) / adoption follow-up** | S1 `sod-rules.mjs`; authority-engine delegates (1 of 4 sites); WP/handoff/capability-registry rewiring is charter non-goal 1 |
| K-10 | Risk-class registry as code | partial | **closed** | S2 `RISK_CLASSES` R0-R4 -> topology/independence/ceiling/human, doc-parity enforced |
| K-11 | Mutation classes M0-M5 in code | missing | **closed** | S2 `MUTATION_CLASSES` + `MUTATION_ORDER` + `isMutationAtMost`/`mutationCapability` |
| K-12 | Server-derived identity **issuance** | missing | **open (remaining slice)** | untouched by design (non-goal 4); needs GOV design decision on workload-identity binding |
| K-13 | Authority-ceiling A0-A5 enforcement at authorize time | partial | **partial (mapping added; enforcement wiring pending)** | S2 `AUTHORITY_CLASSES` A->M + `mutationCeilingFor` supply the missing map; AuthorityEngine/TransitionEngine still do not consult ceilings (unwired) |
| K-14 | Unified policy decision point | missing | **delivered-unwired (activation follow-up)** | S3 `policy-decision-point.mjs` composes identity+contract+grant+SoD+risk/ceiling; nothing consumes it; `state-machine.mjs:171` still trusts caller string |
| K-15 | Decision-record emission first-class | partial | **delivered-unwired (activation follow-up)** | S3 mints schema-valid `decisionRecordCandidate` on both outcomes; caller appends to ledger; no live path emits yet |
| K-16 | `serverDerived` minted by a kernel primitive | partial | **honestly deferred (blocked on K-12)** | PDP carries `serverDerived:false` always and documents it cannot honestly mint `true` without identity issuance |

**Post S1-S3 tally:** closed 11 (K-1..K-11), partial 1 (K-13), delivered-unwired
2 (K-14, K-15), honestly-deferred/blocked 1 (K-16), open 1 (K-12).

**Remaining slices (for the tracker):**
1. **K-12 identity issuance** (+ K-16 `serverDerived` closure, which depends on
   it) — the one substantive kernel gap; requires a GOV design decision.
2. **K-14 / K-15 PDP activation** — wire the PDP into `state-machine.mjs` /
   services and append candidates to `DecisionLedger`; R3, SEC + GOV gated.
   Carry S3-F1 (mandatory `mutation_class`) as an acceptance criterion.
3. **K-13 ceiling-at-authorize enforcement** — have AuthorityEngine/TE consult
   the actor ceiling via `mutationCeilingFor`.
4. **K-9 SoD adoption** — rewire work-package-service, handoff-service, and
   (branch) capability-registry through `sod-rules` (mind the S1 Note-3 handoff
   message-parity criterion).

## Scope 5 — Measured totals (first-hand)

- `node tools/validate-foundation.mjs` -> **exit 0** (measured).
- `node --test tests/*.test.mjs` -> **tests 419 / pass 414 / fail 0 / skipped 5** (measured; exit 0). Matches the producer claim exactly.
- Per new file: `risk-registry` 15/15, `policy-decision-point` 28/28, `sod-rules` 19/19 — **0 skips in any new file**. The 5 skips are pre-existing and unrelated (S1 baseline was 312 total / 5 skip).
- Scope discipline (measured `git show --stat`): S3 = PDP+test+MANIFEST(+2) only; S2 = registry+test+MANIFEST(+2) only; S1 = authority-engine delegation (net -8 LOC) + sod-rules+test+MANIFEST. `state-machine.mjs` untouched vs `main`.

---

## Advisory status fields

- truth_status: verified_true (validator exit 0, suite 419/414/0/5, doc-parity, and all adversarial outcomes reproduced first-hand)
- authority_status: advisory_only (execution_requires_operator for any merge or PDP activation; K-12 and all wiring are R3, SEC + GOV gated)
- implementation_status: existing (S1-S3 kernel primitives delivered and verified) with candidate follow-ups (K-12 issuance, K-13/14/15 wiring, K-9 adoption)
- risk_class: medium (authority-defining primitives; all delivered fail-closed and unwired; one LOW adoption-gated finding S3-F1; no fail-open path found)

## self_certification

```yaml
self_certification:
  agent_id: claude-immune-rev-modgov-complete-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Advisory review only. Recommend; do not authorize. Verdict
> FINISHED_WITH_TRACKED_FOLLOWUPS decides the tracker's module status subject to
> operator ratification. Operator (with GOV + SEC per the R3 activation and K-12
> design requirements) holds all merge, activation, and issuance-design
> decisions.
