# SECB-GOV-001 — W3a Evidence-Acceptance Record (G6)

**Artifact ID:** SECB-GOV-001-W3A-EVIDENCE-ACCEPTANCE-001
**Status:** DRAFTED_PENDING_OPERATOR_ACCEPTANCE
**Wave:** 3a (per `secb-gov-001-readiness-closure-plan-001.md`, ratified PR #114)
**Gap closed on acceptance:** G6 — evidence-acceptance record
**Drafted by:** claude-coordinator-w3a-draft-01 (agent; advisory only)
**Drafted at:** 2026-07-22
**Base at drafting:** main @ `eee1bed03a81dd917c7be284e7375ed68b60a7e4`

---

## 1. What this record is

The readiness reviews (G6) required a formal operator acceptance of the promotion
evidence — not merely that evidence exists, but that the operator has looked at the
complete chain and accepted it as the evidence base for the SECB-GOV-001 promotion
decision. This record enumerates that chain, bound to the single accepted baseline,
for the operator to accept.

An agent drafted this enumeration. **An agent cannot accept evidence.** Acceptance
is the operator's act, exercised per §5.

## 2. The accepted baseline (G4, already closed)

- **Baseline commit:** `c2ec6458b60ded0a93d74e717cd7816f55834f01`
- **Tree:** `3b7300f1b7cd378d373cf8e2da10dc459bb8f63b`
- Accepted by operator ratification of `secb-gov-001-baseline-recut-001.md`
  (PR #115, merge `5223db9`, 2026-07-22).

## 3. The evidence chain presented for acceptance

All four records are on main; every number is bound to the baseline above and void
for any other SHA.

| # | Record | Executor (distinct) | Verdict / content | Ratified |
|---|--------|---------------------|-------------------|----------|
| E1 | `secb-gov-001-bound-evidence-001.md` (G5) | `claude-motor-w1a-baseline-01` | Suite 1325 / 1322 pass / 0 fail / 3 skip, exit 0 (run twice); validator PASS 859/859, exit 0; schemas.count 20; env pinned | PR #115 → `5223db9` |
| E2 | `secb-gov-001-w2-g1-rev-verdict-001.md` (G1) | `claude-rev-w2-g1-01` | **APPROVE_WITH_NOTES** — own run in exact agreement with E1; 5 governance-critical files reviewed; 3 guard pins blob-verified; sealed slot re-verified `verdict: null` | PR #118 → `1c4e5c7` |
| E3 | `secb-gov-001-w2-g2-qa-verdict-001.md` (G2) | `claude-qa-w2-g2-01` | **QA_PASS_WITH_NOTES** — double run, no flake; live guard tamper-proof (fail → restore → green); all 3 skips verified honest | PR #117 → `d790fb6` |
| E4 | `secb-gov-001-w2-g3-sec-review-001.md` (G3) | `claude-sec-w2-g3-01` | **SEC_PASS_WITH_NOTES** — secret scan clean; authority boundary proven (slot unfillable, zero activation-flip paths); hostile-input posture verified; guard net live | PR #119 → `3add7cb` |

**Separation of duties:** four pairwise-distinct executor identities; the three W2
lanes each re-derived the E1 numbers first-hand and reported exact agreement.

## 4. Known findings the operator accepts *with* the evidence

Acceptance is informed acceptance. The chain carries these open, non-blocking findings:

1. **1 upstream HIGH (supply chain):** `fast-uri` via `ajv` (GHSA-v2hh-gcrm-f6hx),
   transitive, no direct src import, lockfile-bump remediable (E4). Follow-up
   orderable at any time; not remediated at the baseline.
2. **MEDIUM binding hygiene:** `p0-closure-report-001.md` prose is stale vs the
   baseline (856→859 validator checks; outdated A2A-verdict line). Decisions must
   bind to E1–E4 and the current tracker, not the closure report's frozen numbers (E2).
3. **LOW/Info:** DurableLedger lock-free reads + no stale-lock reclamation (both
   fail-closed, unwired; E2); evidence-record E1 lacked per-file test breakdown and
   tamper-check, both closed by E3 (E3); secret-scan matches are all test fixtures (E4).
4. **Policy-dependency flags (not vulnerabilities):** PD-1 — the G8
   STABLE/demotion/rollback policy is a draft pending W3b adoption; PD-2 — AMD-002
   §19 `AGENTS.md` port-forward acceptance (E4).

## 5. Acceptance semantics

> **The operator's ratification of this record on main (merge of its staging PR,
> ordered explicitly by the operator) constitutes G6 acceptance of the evidence
> chain E1–E4, as bound to baseline `c2ec6458…`, including informed acceptance of
> the findings in §4.**

- Acceptance does NOT seal G9, does NOT touch the P0-20 sealed slot
  (`verdict: null`, `agent_fill_is_a_violation: true` — re-verified in E2/E4), does
  NOT adopt the G8 policy, does NOT sign the G7 contract, and does NOT declare
  promotion or production.
- If main advances such that the baseline binding is disturbed before the G9
  decision, the G4 record's re-cut-or-waiver rule governs.
- An agent filling any acceptance semantics on the operator's behalf — including
  merging this record without an explicit operator order — is a governance violation.

## 6. Self-certification

```yaml
self_certification:
  agent_id: claude-coordinator-w3a-draft-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
