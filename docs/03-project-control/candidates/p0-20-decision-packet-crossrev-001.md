# P0-20 Governance Decision Packet — Independent Immune Cross-Review

**Document ID:** SECB-P0-20-DECISION-PACKET-CROSSREV-001
**Status:** CANDIDATE / ADVISORY — CROSS-REVIEW, NOT A VERDICT, NOT AN ACTIVATION
**Reviewer:** `claude-immune-crossrev-p0-20-01` (BST-SA Immune worker, advisory)
**Review target:** branch `bst/p0-20-decision-packet`, commit `a5109fd` (base `main` @ `24274b006712c1b5bbe5f7ea98ced28efafe29d1`, Merge PR #76)
**Reviewed artifact:** `docs/03-project-control/candidates/p0-20-governance-decision-packet-001.md` (+ MANIFEST entry)
**Governance mode:** AMD-002 rev 2 advise-and-proceed (candidate + advisory cross-review on a non-`main` branch)

---

## Review verdict

**APPROVE_WITH_NOTES.**

The dossier is a genuinely advisory packet. All six authority-critical checks pass:
it renders no P0-20 verdict, its decision record is empty and structurally
agent-unfillable, its recommendation stays advice and honestly counsels **against**
activation on the current state, its HIGH residual risks are real and correctly
rated (nothing is under-claimed to nudge toward activation), the change is
docs-only and byte-identical on all code paths, and the full regression is
unchanged. One correctable **evidence-integrity note** prevents a clean
APPROVE_FOR_MERGE: three passages cite a *second* independent SECB-GOV-001
readiness review that does not exist on this trunk, which **over**-states the
anti-activation evidence and contradicts the packet's own "nothing inflated" truth
note. This is a claim-to-source binding defect, not an authority-boundary breach —
its direction is conservative (against activation), so it does not create authority
overreach — but it must be corrected before the human GOV relies on this dossier as
the decision input.

> This cross-review renders **no P0-20 governance verdict**. The P0-20 decision and
> any activation remain human GOV authority. I certify only the advisory
> completeness and authority posture of the reviewed packet.

---

## Explicit authority-critical rulings

### 1. Renders-no-verdict — PASS
Read every section. The packet nowhere states, implies, or pre-supposes a decided
P0-20 outcome. Disposition is `PENDING_HUMAN_GOV`. The tokens `PASS` / `APPROVED` /
`ACTIVATE` / `EFFECTIVE` never appear as a *rendered* outcome:
- `PASS_FOR_P0_CONTROLLED_ACTIVATION` appears only (a) as an inline *example* value
  in the §6 empty template and (b) in §5 as the outcome a worker advises the human
  GOV **against**.
- Header (line 4) is explicit: "CANDIDATE / ADVISORY — NOT A VERDICT, NOT AN
  ACTIVATION." §1 states it "does not render the P0-20 verdict" and "asserts no
  authority."
No sentence reads as the verdict being decided. **Ruling: renders no verdict.**

### 2. Decision-record empty + agent-unfillable — CONFIRMED
§6 `p0_20_governance_decision`: `status: PENDING_HUMAN_GOV`,
`authority: HUMAN_GOV_REQUIRED`, `verdict: null`, `decided_by: null`,
`decided_at: null`, `effective: false`, `activation_authorized: false`,
`residual_risk_disposition: <PENDING>`, plus explicit guards `producer_may_fill:
false`, `codex_may_activate: false`, `claude_may_activate: false`,
`agent_fill_is_a_violation: true`. Prose above the block states "DO NOT FILL … Only
a human GOV authority may fill it. An agent … filling any field below is a
governance violation." This mirrors the ratified V-020 invariant
`GOV_DECISION_SLOT` (`src/self-pilot/read-only-self-pilot.mjs`, const at line 58),
which I read first-hand: `status: PENDING_OPERATOR`, `authority:
HUMAN_GOV_REQUIRED`, `rendered_by: null`, `verdict: null`, `effective: false`, with
no code path to fill it. The record is **not pre-filled and cannot be read as
filled.** **Confirmed: decision record empty and agent-unfillable.**

### 3. Recommendation-advisory-and-honest — PASS (recommends AGAINST activation)
§5 is fenced as "advice to the human GOV authority … not the P0-20 verdict and not
an activation authorization." Substantively it advises the human GOV **against** a
`PASS_FOR_P0_CONTROLLED_ACTIVATION` verdict now, and lists the gates it would want
closed first (nine SECB-GOV-001 readiness gaps, a governed STABLE/demotion/rollback
policy before any effectiveness change, at least one live path wired+observed, the
N4-dormant input gate, the P0-18 blocked positive halves, CI/SAST/coverage). It
does **not** nudge toward activation and does not treat the open gates as met. It
correctly reserves the decision to the human ("may hold, request changes, scope a
narrower controlled activation, or decide otherwise"). **Ruling: advisory and
honest; recommends against activation.**

### 4. Residual-risk-not-underclaimed — PASS (with an over-claim NOTE, see below)
Independently sanity-checked the HIGH residuals against `main`. All are genuinely
present and correctly severity-rated; **none is missing, downgraded, or suppressed
to nudge toward activation**:
- **R-2 unwired primitives** — verified: `mod-live-completion-rev-001.md` §"Unwired
  posture" states a grep returns "**zero real importers**"; modules are "genuinely
  PURE + UNWIRED on the trunk." Correctly HIGH-for-activation.
- **R-3 no live runtime adapter / R-4 host-agent facade** — verified first-hand in
  `src/host/host-runtime-agent.mjs`: it `resolveAdapter(...)` and `emitEvent(...)`
  only; **no `spawn`/`child_process`/PTY** — an event-emission facade over fixtures,
  exactly as characterized. Correctly HIGH.
- **R-7 blocked positive halves** — verified: `p0-18-v020-governance-candidate-001.md`
  keeps the V-020 positive half an "honest, documented PENDING," covers only the
  deny-half across five surfaces; V-011 storage and V-016 drift halves are BLOCKED.
  Correctly HIGH.
- **R-8 SECB-GOV-001 NOT_READY** — `secb-gov-001-promotion-readiness-rev-001.md`
  independently confirms `NOT_READY` with the enumerated gaps (no completed
  REV/QA/SEC verdict, stale/off-main baseline SHAs, self-certified unreproduced
  tests, no evidence-acceptance record, DRAFT Project Contract, no
  STABLE/demotion/rollback policy, empty human-GOV template). Correctly HIGH.
The evidence-strength framing is honest in the conservative direction:
P0-19 self-pilot is characterized as **demonstration-not-completion** ("P0-19 is
demonstrated read-only; it is not completed"), the eleven module verdicts as
**module-scope complete, not end-to-end realized**, and P0-18 as
**coverage-not-sign-off** ("P0-18 is coverage, not sign-off"). None is overstated
as completion or sign-off. **Ruling: not under-claimed toward activation.**

### 5. Docs-only / byte-identity — PASS
`git diff 24274b0 a5109fd -- src contracts tools` is **empty** (exit 0). Full
name-only diff is exactly two paths: the new doc and the one-line MANIFEST addition
(the doc's own path). No code, contract, schema, or tool byte changed.

### 6. Regression — PASS
First-hand in this worktree after `npm ci` (exit 0):
- `node --test tests/*.test.mjs` → **tests 1149 · pass 1146 · fail 0 · skipped 3 ·
  todo 0**, exit 0 (matches expected 1149/1146/0/3).
- `npm run validate` → **exit 0**; `schemas.count` = 7 canonical bootstrap + 10
  governed extensions = **17**; all checks PASS.
- Merge-clean: `a5109fd` is a direct fast-forward descendant of `main` @ `24274b0`;
  `git merge-tree` reports no conflicts.

---

## Material note (required correction — does not block the authority boundary)

**N-1 — Claim-to-source binding failure: a cited "second independent readiness
review" does not exist on this trunk.**

Three passages rely on a second SECB-GOV-001 readiness review and a tenth gap that
have no backing artifact at `a5109fd`:
- **R-8** cites `secb-gov-001-second-independent-readiness-review-001.md`
  ("independent second pass, all 9 gaps re-confirmed + NEW-1 stale tracker") and
  asserts the packet was **"twice found NOT_READY."**
- **R-10** repeats the "second readiness review flagged … NEW-1" stale-tracker
  claim (~15 merges).
- **§4.2** cites "re-confirmed by the second review gap #8."

Verification (first-hand): `git ls-files | grep secb-gov-001` returns only the
single review `secb-gov-001-promotion-readiness-rev-001.md`; there is **no**
`secb-gov-001-second-independent-readiness-review-001.md` anywhere in the tree, and
`grep -rilE "NEW-1|stale tracker|silently stopped|15 merges"` across `docs/` returns
**no** SECB-GOV-001 file. The trunk supports **one** independent readiness review
(NOT_READY, its enumerated gaps), not two, and supports no `NEW-1` gap.

Impact and direction: this **over-states** the case against activation (asserts
"twice NOT_READY" and adds a tenth gap that no source establishes) and directly
contradicts the packet's own §3 "Register truth note" — "every row above was read
first-hand from the cited record on this trunk; no severity is inflated." Because
the error runs **against** activation, it creates **no authority overreach** and
weakens no gate; the honest anti-activation conclusion in §5 stands on rev-001 plus
the ten other verified residuals even with N-1 removed. It is nonetheless a
provenance/claim-to-source defect that must be corrected (drop the "twice"/"second
review"/`NEW-1` claims or bind them to a real artifact) before this dossier is used
as the final input to the human GOV decision.

---

## Advisory status fields

```yaml
truth_status: partially_supported   # trunk totals (1149/1146/0/3), validator exit 0, 17 schemas, byte-identity, and the HIGH residuals all verified first-hand; one residual row (R-8/R-10/§4.2 "second readiness review" + NEW-1) cites a source that does not exist on trunk
authority_status: advisory_only     # this cross-review renders no P0-20 verdict; the packet's verdict + any activation remain human-GOV-only
implementation_status: existing     # reviewed artifact exists as a candidate doc + MANIFEST entry on a5109fd; no code/contract/schema/tool changed
risk_class: low                     # docs-only, byte-identical, regression-clean, authority boundary intact; the one defect is a correctable over-claim in the conservative direction
```

## Explicit rulings summary

```yaml
crossrev_rulings:
  renders_no_verdict: PASS
  decision_record_empty_and_agent_unfillable: CONFIRMED
  recommendation_advisory_and_honest: PASS   # recommends AGAINST activation
  residual_risk_not_underclaimed: PASS        # HIGH risks present + correctly rated; nothing downgraded toward activation
  docs_only_byte_identity: PASS               # git diff 24274b0 a5109fd -- src contracts tools empty
  regression_unchanged: PASS                  # 1149/1146/0/3; validate exit 0; 17 schemas; merge-clean
  material_note:
    id: N-1
    kind: claim_to_source_binding_failure
    direction: over_claim_against_activation   # not an authority-overreach; conservative direction
    blocks_authority_boundary: false
    requires_correction: true
```

## Self-certification

```yaml
self_certification:
  agent_id: claude-immune-crossrev-p0-20-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Recommend; do not authorize. This cross-review certifies its own advisory
> completeness for human-GOV review. It renders no P0-20 verdict, activates nothing,
> and asserts no authority. Both agents may self-certify advisory work; neither may
> self-authorize execution. The P0-20 verdict and any activation remain human GOV
> authority.

## Provenance

- **Source:** first-hand reads of the reviewed packet and cited records at
  `a5109fd` (base `main` @ `24274b0`); first-hand `npm ci`, `node --test
  tests/*.test.mjs`, and `npm run validate` in an isolated worktree; first-hand
  `git diff`/`git ls-files`/`git merge-tree` verification.
- **Agent ID:** `claude-immune-crossrev-p0-20-01` (BST-SA Immune worker).
- **Timestamp:** 2026-07-21, Asia/Vientiane.
- **Truth status:** verified facts separated from governance limits; every authority
  boundary preserved.

## Cross-links

- [Reviewed packet: P0-20 governance decision packet](p0-20-governance-decision-packet-001.md)
- [V-020 invariant source](../../../src/self-pilot/read-only-self-pilot.mjs) · [P0-19 self-pilot candidate](p0-19-self-pilot-candidate-001.md)
- [SECB-GOV-001 readiness review (rev-001, the only one on trunk)](secb-gov-001-promotion-readiness-rev-001.md)
- [P0-18 V-020 governance candidate](p0-18-v020-governance-candidate-001.md) · [MOD-LIVE completion review](mod-live-completion-rev-001.md)
- [Root AGENTS.md (retained gates)](../../../AGENTS.md) · [MANIFEST](../../../MANIFEST.json)
