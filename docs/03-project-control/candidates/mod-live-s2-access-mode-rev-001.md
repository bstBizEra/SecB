# MOD-LIVE S2 — Access-Mode Authorization Ladder Evaluator — Independent Review 001

**Record ID:** mod-live-s2-access-mode-rev-001
**Status:** ADVISORY — INDEPENDENT REVIEW (candidate; authorizes no merge)
**Reviewer identity:** claude-immune-rev-live-s2-01 (BST-SA immune, independent review gate)
**Review class:** authority-adjacent (access-mode authorization) — strict bar
**Reviewed commit:** `677f149` (`[MOD-LIVE-S2] Access-mode authorization ladder evaluator (G2, PURE + UNWIRED)`), branch `bst/mod-live-s2-access-mode`
**Base:** `main @ adfeb8e` (merge-base); current `main @ 332b7ab`
**Authoritative spec:** `mod-live-gap-assessment-001.md` (`bst/mod-live-assessment`) — G2, S2, boundary B5
**Doctrine sources:** `docs/05-live-operations/intervention-and-replay.md` (SECB-LIVE-CONTROL-001), `docs/17-operations/01-live-operations.md`
**Method:** every finding read/executed first-hand in an isolated worktree at the exact commit. Full suite + validator + 61-case adversarial runtime probe run before drafting.

---

## Verdict: APPROVE_WITH_NOTES

The slice is a faithful, fail-closed, pure + unwired codification of the SECB-LIVE-CONTROL-001 access ladder and its doctrine-mandated explicit-authorization gate. Every task-critical surface — ladder honesty, authorization semantics, boundary B5, adversarial containment, and regression — verified clean. Two **advisory, non-blocking** notes are carried for the future adoption/wiring slice (§ Findings). No blocking finding. The cross-field TOCTOU (N1-class) probe class raised by the coordinating lane **does not land** and is recorded explicitly below.

---

## 1. Ladder honesty — PASS

- **Table (intervention-and-replay.md `## Access Modes`)** codified 1:1 into `ACCESS_MODES` — six modes, mode+capability verbatim, in doc row order: Observe / Annotate / Approve / Steer / Control / Emergency. Read first-hand.
- **Arrow ladder (01-live-operations.md `## Human access modes`)**: `Observe → Annotate → Approve → Steer → Control → Emergency` — matches `ACCESS_MODE_ORDER` verbatim.
- **Three-way parity is genuine and runtime**: `tests/access-mode-policy.test.mjs` `readFileSync`s BOTH live docs at test time (not embedded fixtures) and asserts code↔table↔arrow agreement + transitive table↔arrow agreement. Drift in either doc fails the suite.
- **Gated set = {Control, Emergency} exactly.** `requiresExplicitAuthorization` is DERIVED from the verbatim phrase "Writable terminal control and emergency intervention require explicit authorization and are fully audited"; the phrase is doc-parity pinned and the derivation asserted. Control is the writable-terminal mode ("Enter terminal or runtime input"); Emergency is emergency intervention. No other mode is gated.

## 2. Authorization semantics — PASS (probed hard, 61 runtime cases)

| Probe | Expected | Result |
|---|---|---|
| requested > granted with `explicitAuthorization:true` | DENY_ACCESS_ESCALATION | ✅ escalation cannot be bought with authorization |
| requested > granted with `riskClass:R0` | DENY_ACCESS_ESCALATION | ✅ escalation checked before any auth logic |
| gated mode within grant, no auth | DENY_ACCESS_AUTHORIZATION_REQUIRED | ✅ |
| gated + `explicitAuthorization===true` | ALLOW (`explicit-authorization`) | ✅ |
| gated + riskClass R0/R1/R2 (`humanApproval===false`) | ALLOW (`risk-class-no-human-gate`) | ✅ short-circuits |
| gated + riskClass R3/R4 (`humanApproval===true`) | DENY_ACCESS_AUTHORIZATION_REQUIRED | ✅ no short-circuit |
| gated + riskClass unknown / undefined / absent | DENY_ACCESS_AUTHORIZATION_REQUIRED | ✅ fail-closed (riskProfile `{ok:false}` → require attestation) |
| `explicitAuthorization` truthy-not-true: `'true'`, `1`, `{}`, `[]`, `'yes'` | DENY | ✅ strict `=== true` only |
| non-gated modes (Observe..Steer) within grant | ALLOW, `requiresExplicitAuthorization:false`, `not-required` | ✅ no auth demanded |
| Observe (rank 0) under every valid grant ≥ 0 | ALLOW | ✅ across all six grants |

Short-circuit fires **only** on `riskProfile(class).value.humanApproval === false` — confirmed against the byte-identical R0–R4 registry table (R0/R1/R2 false; R3/R4 true; unknown → `{ok:false}`). The escalation guard runs before the authorization gate and before `riskClass` is even consulted, so no authorization flag can bypass it.

## 3. Boundary B5 — PASS

- **Imports:** exactly one — `import { riskProfile } from "../control/risk-registry.mjs"`. No import of `state-machine.mjs`, `transition-engine.mjs`, or any live/session/gateway/ledger path.
- **Importers:** zero. `git grep access-mode-policy` across the tip finds only the module and its test — wired to nothing.
- **No session/state/clock/FS/network reads.** Pure data-in → frozen-decision-out.
- **Byte-identity vs base `adfeb8e` (blob-hash, first-hand):**
  - `src/control/risk-registry.mjs` → `b8ee7f9b…` IDENTICAL
  - `docs/05-live-operations/intervention-and-replay.md` → `2b0be978…` IDENTICAL
  - `docs/17-operations/01-live-operations.md` → `67089d84…` IDENTICAL
  - (test's pinned parity hashes at lines 461–462 match these exactly.)
- **Changed surface** vs base: `MANIFEST.json` (M, +2 entries), `src/live/access-mode-policy.mjs` (A), `tests/access-mode-policy.test.mjs` (A). Nothing else.

## 4. Adversarial containment — PASS

- **Throwing getters / Proxy get-trap** on all four consulted props (`requestedMode`, `grantedMode`, `riskClass`, `explicitAuthorization`) → structured MALFORMED denial, never a throw. Contained by the single try/catch extraction block.
- **Invocation count == 1** for each of the four properties (single contained read; no re-entrant access).
- **Frozen outputs** (allow and deny) resist deep mutation; `Object.isFrozen` true; values unchanged after attempted tampering.
- **Case / confusable / padding:** `observe`, `OBSERVE`, `Observe ` (trailing), ` Observe` (leading), `OЬserve` (Cyrillic-ЬE confusable) → DENY_ACCESS_MODE_UNKNOWN (exact case-sensitive match only; never coerced).
- **Rank confusion:** numeric `0`/`5`, `['Observe']`, `null`, `true`, `{mode:'Observe'}` → DENY_ACCESS_MODE_MALFORMED (non-string rejected before any indexing).
- **Prototype pollution:** inherited `requestedMode`/`grantedMode` → MALFORMED (own-property required); inherited `riskClass` → ignored, falls through to DENY_ACCESS_AUTHORIZATION_REQUIRED.
- **Null byte / blank / non-object / array input** → MALFORMED.

### Cross-field TOCTOU (N1-class from LIVE-S1 rev-002) — DOES NOT LAND (recorded per coordinator addendum)

Probed the exact class the LIVE-S1 second review found:
- **(a)** getter on `requestedMode` that lowers `grantedMode` mid-eval → escalation DENY, coherent with captured tuple (fail-closed). ✅
- **(a-rev)** getter on `requestedMode` that raises `grantedMode` to Emergency → still hits the authorization gate (DENY_ACCESS_AUTHORIZATION_REQUIRED); no silent allow. ✅
- **(b)** getter on `riskClass` that sets `explicitAuthorization=true` → allow is coherent with the captured tuple `{Control,Control,R3,true}`; the value set is one the attacker already fully controls (equivalent to passing `explicitAuthorization:true` directly) — **no privilege gained, no gate bypassed**. ✅
- **(b-esc)** same getter on an escalation request (`Emergency` vs granted `Observe`) → DENY_ACCESS_ESCALATION; the smuggled flag is irrelevant because escalation is checked first. ✅

**Why inert (proven, not assumed):** the evaluator reads each of the four properties **exactly once** into a local inside one contained try/catch, then rules **only** on the captured locals — never re-reading `input.*`. There is therefore no time-of-check-vs-time-of-use gap for any field: check and use share one captured value. The security-critical escalation guard depends only on the first-two-read fields and runs before the auth fields are consulted; the auth fields can only ever *relax* the gate for a mode already within grant, never expand a grant nor bypass escalation. A cross-field getter can influence a later-read sibling's captured value, but the ruling stays coherent with the tuple it captured, and every path is fail-closed or a coherent allow of a request the attacker could make directly. The public exports (`ACCESS_MODES`, `ACCESS_MODE_ORDER`) expose only the doctrine ladder, not the input-field evaluation order, and inertness holds regardless of order knowledge. **Classification: N1-class cross-field TOCTOU — inert; non-blocking.** (See advisory Note N3 for the one structural nuance.)

## 5. Regression — PASS

- `npm test` → **tests 842 / pass 837 / fail 0 / skipped 5** — exact expected totals.
- `node tools/validate-foundation.mjs` → **exit 0**.
- Merge-cleanliness vs `main @ 332b7ab` (`git merge-tree`, non-destructive scratch): **only `MANIFEST.json` conflicts** (tail-append collision) — expected and mechanically resolvable by keeping both sides' appended entries. Both source files (`access-mode-policy.mjs`, its test) auto-merge cleanly.

---

## Findings by severity

**BLOCKING (CRITICAL/HIGH/MEDIUM): none.**

**LOW / advisory (non-blocking):**

- **N1 — API surface diverges from the S2 plan sketch (INFO, faithful to doctrine).** The S2 plan bullet illustrated `evaluateAccessMode(input)` over `{requestedMode, grantedAuthority}` with codes `DENY_ACCESS_MODE_UNKNOWN / DENY_AUTHORITY_UNKNOWN / DENY_INSUFFICIENT_AUTHORITY`. The implementation ships `evaluateAccessRequest(input)` over `{requestedMode, grantedMode, riskClass?, explicitAuthorization?}` with `MALFORMED / UNKNOWN / ESCALATION / AUTHORIZATION_REQUIRED`, adding the explicit-authorization gate + risk-class short-circuit. This exceeds the plan's minimal sketch but is **mandated by the SECB-LIVE-CONTROL-001 / 01-live-operations doctrine** the plan told it to codify verbatim ("Writable terminal control and emergency intervention require explicit authorization"). The divergence is a naming/scope enrichment faithful to the source of truth, not a spec violation. Recorded for traceability.

- **N2 — Risk-class waiver breadth for gated modes (LOW, design; flag for adoption slice).** A caller-supplied `riskClass` with `humanApproval===false` (R0/R1/R2) waives the explicit-authorization attestation for Control/Emergency via `risk-class-no-human-gate`. Pairing e.g. `R0` ("read-only, reversible, no sensitive data") with `Emergency` (pause/terminate/quarantine) is semantically incoherent yet accepted. This exactly matches the approval-binding precedent and the task's specified contract, and is harmless for an **unwired** evaluator. **Recommendation:** the future, separately-governed adoption/wiring layer must not trust a caller-supplied `riskClass` to waive the doctrine gate — it should constrain which risk classes may accompany a gated-mode request, since the evaluator is only as safe as the grant/risk-minting layer that feeds it. Not a defect in this pure slice; a boundary condition for its eventual consumer.

- **N3 — Extraction is sequential, not a single atomic snapshot (INFO).** The four properties are read one-by-one rather than in one destructuring snapshot, so an earlier-read getter can influence a later-read sibling's captured value. Proven inert (§4 N1-class) because each field is read exactly once, the ruling is coherent with the captured tuple, and escalation is checked first. No change required; noted so a future maintainer does not mistake the sequential reads for a re-read vulnerability.

---

## Advisory status fields

```yaml
truth_status: verified_true          # all evidence read/executed first-hand at 677f149; suite 842/837/0/5, validator exit 0
authority_status: advisory_only
implementation_status: existing      # reviewed a shipped candidate commit; this record authorizes no merge
risk_class: R2                        # pure additive evaluator under review; the review record itself is R1 documentation
verdict: APPROVE_WITH_NOTES
blocking_findings: 0
advisory_notes: 3                     # N1 (info), N2 (low/adoption), N3 (info)
self_certification:
  agent_id: claude-immune-rev-live-s2-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Recommend merge readiness only. This independent review authorizes no merge, push, wiring, or activation. Operator-only merge remains the gate. The two advisory notes (N1 naming/scope, N2 risk-class waiver) travel with the candidate to the adoption decision.
