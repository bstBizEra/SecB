# MOD-A2A Slice S2 — Independent Immune Review (mod-a2a-s2-non-escalation-gate-rev-001)

- reviewer_identity: `claude-immune-rev-a2a-s2-01`
- reviewer_role: BST-SA Immune (independent cross-provider review; advisory only, no execution authority)
- review_type: cross-provider gate — Codex-produced candidate, Claude-independent Immune review
- candidate_branch: `bst/mod-a2a-s2-non-escalation-gate` @ `ac3258c723c6e2c9e8c55d0fda93655d66d18bb7`
- base: `main` @ `fc29f583892a51f080c5726a590fec90fba7671e`
- current main at review time: `71b9d4139e00ce1e8ec3ea856e41982e73dfc4d3`
- authoritative_spec: `docs/03-project-control/candidates/mod-a2a-gap-assessment-001.md` (`bst/mod-a2a-assessment`) §4 "Slice S2 — Delegation non-escalation gate, UNWIRED"
- producer_record: `docs/03-project-control/candidates/mod-a2a-s2-non-escalation-gate-producer-verification-001.md`
- date: 2026-07-21
- environment: isolated worktree; `npm ci` clean (6 packages); no push, no merge, review commit on non-main branch `claude/rev/a2a-s2-001`

---

## Verdict: APPROVE_WITH_NOTES

The candidate faithfully implements the authoritative S2 slice: a pure, deny-by-default, UNWIRED delegation non-escalation gate that reuses `non-escalation-comparator.withinCeiling` and `risk-registry.riskProfile` verbatim, writes nothing itself, and is wired into no live path. The core security property — **a delegate can never hold more authority than its delegator** — holds under every adversarial probe run. Byte-identity of all guarded S1/foundation files is exact against both base and current main. Full suite green, both validators exit 0. The only non-code note is a mechanical MANIFEST.json merge conflict against current main (main advanced since base); all substantive findings are LOW/advisory. Nothing blocks merge on correctness or authority grounds.

---

## Findings by severity

### Blocking
- none.

### Medium
- **M1 (merge-cleanliness, process not code):** `git merge-tree --write-tree ac3258c 71b9d41` reports `CONFLICT (content): Merge conflict in MANIFEST.json` (exit 1). Both current main (`71b9d41`, via the MOD-REG disposition PR #28) and this candidate append distinct entries to the tail of the same `artifacts` array. It is a pure additive-vs-additive JSON-array conflict — main added `mod-reg-*` entries, the candidate added the three `delegation-gate` entries — trivially resolved by keeping both. This is expected drift from a tail-append MANIFEST edit while main moved; a re-target/rebase onto current main clears it. Not a defect of the gate.

### Low / advisory
- **L1 (frozen-result wording vs behavior):** the spec describes S2 as a "pure, frozen-result function." `evaluateDelegation`'s returned objects are **not** `Object.frozen` (probe 7: `Object.isFrozen` = false; a returned `{ok:true,code:"ALLOW"}` is mutable). This matches the reused comparator's own unfrozen returns and the `retry-policy.mjs` house style, and the module's `RATIONALE_BY_OUTCOME` table *is* frozen, so "frozen-result" reads as deterministic/pure rather than literal `Object.freeze` on each return. Advisory hardening only: a caller could mutate a returned disposition in place. No security consequence given deny-by-default semantics and the unwired status.
- **L2 (denial shape vs task paraphrase):** denial objects carry `{ok:false, code, dimension}`, not the `{ok:false, code, message}` shape named loosely in the review-task framing. This is correct — it matches the authoritative gap-assessment's stated shape ("the comparator's own `{ok:false, code, dimension}` verbatim"). Human-readable text lives in `RATIONALE_BY_OUTCOME`, consumed only by the candidate-minting helper, not by the evaluator. No action.
- **L3 (prototype-chain read in `validShape`, defense-in-depth observation):** `non-escalation-comparator.validShape` reads `ceiling.riskClass`/`ceiling.dataClassification` via property access, which traverses the prototype chain. Probes 6a/6b confirmed no exploitable escalation: comparison always uses the object's actual (own-or-inherited) declared values on both candidate and bound, and the `risk-registry` lookup uses `Object.hasOwn` (own-property only), so inherited/`__proto__` keys cannot forge a more-permissive class. Recorded as an observation, not a defect; the invariant holds because both sides are compared symmetrically. (Guarded file — not in scope to change here.)
- **L4 (documentation-consistency, inherited from producer disclosure):** the producer transparently flagged that `docs/03-project-control/candidates/module-completion-tracker-001.md` is blank on `main` while a populated queue/status table exists on `bst/mod-a2a-assessment`. The candidate correctly did NOT reconcile/overwrite it — it appended one extend-only iteration-log line to the otherwise-empty file. This is a GOV documentation-consistency item to resolve separately; it is not a defect of this slice and the extend-only handling is correct.

### Positive / disclosed-and-accepted
- **Disclosed spec-sketch narrowing (accepted):** the gap-assessment's literal sketch names `evaluateDelegation({ requestedCeiling, boundingCeiling, riskClass })`. The producer deliberately did **not** add a separate top-level `riskClass` param, deriving the human-approval lookup from `requestedCeiling.riskClass` (the field the comparator already validated as a recognized, ordered class). This *eliminates* a two-sources-of-truth drift vector rather than introducing one and is consistent with the assessment's own "operates on ceilings directly, not on the delegation-request schema" text. Disclosed in the producer record for async GOV ratification per AMD-002 rule 3.1. Immune concurs: this strengthens, not weakens, the non-escalation invariant.

---

## Spec conformance (held to gap-assessment §4 S2, exactly)

| Spec requirement | Result |
|---|---|
| new `src/control/delegation-gate.mjs` | present (214 LOC) |
| new `tests/delegation-gate.test.mjs` | present (434 lines, 24 new tests) |
| `MANIFEST.json` updated; **no new ledger or schema** | +3 additive entries; no schema/contract/validator-registration touched — confirmed |
| pure `evaluateDelegation({requestedCeiling, boundingCeiling})` | pure; no I/O, no clock, no fs, no ledger import — confirmed |
| (a) calls existing `non-escalation-comparator.withinCeiling`, never re-implemented | only imports `withinCeiling`; zero local order tables / subset helpers (definition-grep exit 1) — confirmed |
| (b) consults existing `risk-registry` humanApproval, short-circuits `DENY_HUMAN_APPROVAL_REQUIRED` | via `riskProfile(...).value.humanApproval` — confirmed by probe 6c |
| deny-by-default on malformed input | every malformed probe fails closed with `DENY_ESCALATION_UNCOMPARABLE` — confirmed |
| parity / drift-canary test (byte-identical to `withinCeiling`) | present (384-scenario `deepEqual` parity matrix) — confirmed |
| no ledger writes **from the gate** | gate imports neither ledger; `buildDelegationDecisionRecord` mints a candidate only; the *test* appends via the real `DecisionLedger` — confirmed |
| UNWIRED — no live-path consumption | nothing under `src/`/`tools/` imports `delegation-gate` (only its own comment + test) — confirmed |
| no edits to existing files beyond MANIFEST + tracker | diff touches exactly: 2 new src/test files, 1 new producer record, MANIFEST (+3), tracker (append) — confirmed |
| R-class | R1/R2 pure evaluator, within AMD-002 standing pre-authorization — concur |

No spec deviations beyond the single disclosed, accepted, non-regressive `riskClass`-parameter narrowing above.

---

## Byte-identity guard (blob-hash, vs base `fc29f58` AND current main `71b9d41`)

All guarded files are **byte-identical across all three refs** (base, current main, candidate) — zero drift:

| File | blob @ fc29f58 = @ 71b9d41 = @ ac3258c |
|---|---|
| `src/ledger/delegation-ledger.mjs` | `c8dc7943` — identical |
| `contracts/delegation-request.schema.json` | `d47adc7c` — identical |
| `src/control/sod-rules.mjs` | `4ffbc201` — identical |
| `src/services/non-escalation-comparator.mjs` (imported primitive) | `536758b3` — identical |
| `src/control/risk-registry.mjs` (imported primitive) | `b8ee7f9b` — identical |
| all 16 `contracts/*.json` | each identical across all three refs |

Producer's own drift guard is **behavioral** (the 384-scenario `withinCeiling` parity test), not a blob-hash guard; the blob-hash guard here (Immune) confirms the source files themselves are untouched. Both agree: reused primitives are unmodified.

---

## Adversarial probe outcomes (throwaway, uncommitted; run then deleted)

Core invariant tested: a delegate can never obtain more authority than its delegator. Every escalation attempt denied; every malformed input fail-closed.

| # | Probe | Outcome |
|---|---|---|
| 1 | delegate requests **superset** tools | `DENY_ESCALATION` (dim tools) ✓ |
| 2 | **equal-set** ceiling (R1, no human-approval) | `ALLOW` ✓ (spec `<=`: equal authority is not escalation) |
| 3 | **chained** A→B→C, C risk R3 vs bound R1 | `DENY_ESCALATION` (dim riskClass) ✓ |
| 4a | case confusable `Read` vs `read` | `DENY_ESCALATION` ✓ |
| 4b | whitespace ` read` vs `read` | `DENY_ESCALATION` ✓ |
| 4c | unicode cyrillic homoglyph vs `read` | `DENY_ESCALATION` ✓ |
| 5a | empty candidate tools (requesting less) | `ALLOW` ✓ (vacuous subset — narrower authority) |
| 5b | empty bound, non-empty candidate | `DENY_ESCALATION` ✓ |
| 5c | `undefined` scope array | `DENY_ESCALATION_UNCOMPARABLE` (shape) ✓ |
| 6a | prototype-injected inherited `riskClass` (own shadows) | `ALLOW` on own value; injection did not leak ✓ |
| 6b | `__proto__` literal key via `JSON.parse` | no pollution; decided on own values ✓ |
| 6c | R3 within-ceiling, humanApproval=true | `DENY_HUMAN_APPROVAL_REQUIRED` ✓ (gate refuses to self-grant a human gate) |
| 7 | frozen-output mutation | outputs NOT frozen; mutation takes effect — see L1 |
| 8a–8e | null / undefined-arg / non-object / no-`.ceiling` / null wrapper | all `DENY_ESCALATION_UNCOMPARABLE` (shape) ✓ |
| 9a | path `..` traversal | `DENY_ESCALATION_UNCOMPARABLE` (paths) ✓ |
| 9b | glob `*` tool | `DENY_ESCALATION_UNCOMPARABLE` (tools) ✓ |
| 10 | unknown risk class `R9` | `DENY_ESCALATION_UNCOMPARABLE` (riskClass) ✓ |

No probe produced an authority-escalation pass. Confusables (case/whitespace/unicode) deny because scope matching is exact-string, case-sensitive, subset — correct. Human-approval risk classes deny even fully within ceiling. Non-escalation invariant: **VERIFIED**.

---

## Regression

- `npm test`: **727 tests, 722 pass, 0 fail, 0 cancelled, 5 skipped, 0 todo** — matches producer's reported "after" totals (703→727 = +24 new tests).
- `node tools/validate-foundation.mjs`: **exit 0**.
- `npm run validate`: **exit 0**.
- tracker edit: append-only, additive (blank file → one iteration-log entry); MANIFEST edit: additive (+3). No existing content rewritten.

---

## Merge-cleanliness vs main @ `71b9d41`

- `git merge-tree --write-tree ac3258c 71b9d41`: exit 1, **CONFLICT (content) in MANIFEST.json** (single file). Additive-vs-additive array-tail conflict, trivially resolvable (keep both). See finding M1. No other conflicts.

---

## Authority / governance boundary

- Candidate is **UNWIRED**: no live path imports it; it accepts/rejects/dispatches nothing; it writes no ledger. R1/R2 within AMD-002 rev 2 standing pre-authorization. This review is **advisory only** — it does not authorize merge, activation, wiring, or production. Operator/GOV retains merge authority.

---

## Advisory status fields

- truth_status: `verified_true` (all claims re-derived first-hand in this worktree)
- authority_status: `advisory_only`
- implementation_status: `existing` (candidate present and complete for its S2 scope)
- risk_class: `low`

---

```yaml
self_certification:
  agent_id: claude-immune-rev-a2a-s2-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
