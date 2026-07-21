# P0-20 Governance Decision Packet — Advisory Dossier for the Human GOV Verdict

**Document ID:** SECB-P0-20-DECISION-PACKET-001
**Status:** CANDIDATE / ADVISORY — NOT A VERDICT, NOT AN ACTIVATION
**Base:** main @ `24274b006712c1b5bbe5f7ea98ced28efafe29d1` (Merge PR #76)
**Producer:** `claude-immune-p0-20-decision-packet-01` (BST-SA Immune worker, advisory)
**Governance mode:** AMD-002 rev 2 advise-and-proceed (candidate + advisory packet on a non-`main` branch)

---

## 1. Purpose and authority boundary (read first)

This document is an **advisory dossier**. Its sole purpose is to assemble, in one
place and honestly, the evidence a **human GOV authority** needs to render the
**P0-20 governance verdict** — *residual risk and activation decision*
(`docs/09-delivery/backlog-p0.md` row P0-20; depends on P0-19). It is the input to
that decision, not the decision.

**What this packet is NOT and does NOT do:**

- It does **not render** the P0-20 verdict. The verdict field in §6 is an **empty
  template** an agent cannot fill.
- It does **not activate** anything, declare anything effective, or declare
  production.
- It **asserts no authority**. It carries no execution, approval, merge, or
  activation authority.
- It does **not** recommend as if authorized to activate. §5 is a *worker
  recommendation to the human* — advice, explicitly not a decision and not an
  authorization.

**Why an agent cannot render this verdict (structural, not stylistic).** The
V-020 governance invariant ratified on `main` establishes that an agent cannot
self-activate: the self-pilot's `GOV_DECISION_SLOT`
(`src/self-pilot/read-only-self-pilot.mjs:58`) is a deep-frozen operator-only slot
(`status: PENDING_OPERATOR`, `authority: HUMAN_GOV_REQUIRED`, `verdict: null`,
`rendered_by: null`, `effective: false`) with no code path to fill it; the P0-18
V-020 conformance candidate proves agent self-activation is denied across five
ratified surfaces (self-pilot slot, PDP human-gate, access-mode ladder,
approval-binding SoD, authority-engine GOV-role requirement). The decision record
in §6 mirrors that pattern deliberately: **the GOV decision slot is structurally
unfillable by an agent, and an agent filling it is a governance violation.**

> The verdict is the human's. This dossier only lays out the evidence.

---

## 2. Evidence summary — what is built and independently verified

### 2.1 Measured trunk state (first-hand, this packet, main @ `24274b0`)

| Measure | Measured | Method |
|---|---|---|
| `node tools/validate-foundation.mjs` | **exit 0**, all PASS | run first-hand in this worktree |
| Schema count | **17** (7 canonical bootstrap + 10 governed extensions) | validator `schemas.count` detail |
| `node --test tests/*.test.mjs` | **tests 1149 · pass 1146 · fail 0 · skipped 3 · todo 0** | run first-hand; exit 0 |

The 10 governed extensions: P0-14 ledgers, skill resolver, capability record, skill
candidate, MOD-WORK goal, MOD-A2A delegation request, MOD-RUNTIME checkpoint,
MOD-WSPACE workspace-lease (per validator detail).

### 2.2 Eleven module completion verdicts (each independently reviewed)

All eleven catalog modules named in the P0-20 dispatch carry a ratified,
independently-reviewed completion verdict on `main`. Every verdict is
**FINISHED_WITH_TRACKED_FOLLOWUPS** (MOD-REG closed via a signed
`APPROVE_NOT_EFFECTIVE` disposition rather than a completion review). Each verdict
is *module-scope complete* — **not** *end-to-end realized*; every module's own
review states the delivered primitives are pure and **unwired** (see §3).

| Module | Verdict record | Verdict | Key tracked follow-ups (residual) |
|---|---|---|---|
| MOD-MCP | `mod-mcp-completion-rev-001.md` (PRs #6–#9, main @ `a8ef0d1`) | FINISHED_WITH_TRACKED_FOLLOWUPS | FU-1 promotion SoD (one non-producer can hold both approval roles); FU-2 gateway secret-screen underscore gap (`ghp_`/`github_pat_`/`sk_` missed); FU-3 AWS key patterns + unforgeable sealer; deployment activation switch pending |
| MOD-GOV | `mod-gov-completion-rev-001.md` (PR #10) | FINISHED_WITH_TRACKED_FOLLOWUPS | K-12 server-derived identity **issuance** (open, needs GOV design); K-13/14/15 ceiling+PDP+decision-record wiring (delivered-unwired); K-9 SoD adoption at 3 sites; S3-F1 mandatory `mutation_class` acceptance criterion |
| MOD-WORK | `mod-work-completion-rev-001.md` (PR #12) | FINISHED_WITH_TRACKED_FOLLOWUPS | **WP-path adoption of the traceability index (R3, operator-gated)** — portfolio-to-task traceability is realizable but not realized; parent-rollup completion honesty (LOW); alias test lock (LOW) |
| MOD-CONTEXT | `mod-context-completion-rev-001.md` (PR #15) | FINISHED_WITH_TRACKED_FOLLOWUPS | OP-1..OP-4 schema-evolution decisions (R3, operator-gated); compaction-successor facet semantics (LOW) |
| MOD-KNOW | `mod-know-completion-rev-001.md` (PR #20) | FINISHED_WITH_TRACKED_FOLLOWUPS | G5 provenance chain (was blocked on EVID ladder — now latent-live); G7 schema/doctrine convergence (R3); walker cross-project read-path asymmetry (LOW) |
| MOD-EVID | `mod-evid-completion-rev-001.md` (PR #26, main @ `fc29f58`) | FINISHED_WITH_TRACKED_FOLLOWUPS | G4 failure-evidence first-class kind (R3+); **G5 decision-record `evidence_refs` binding (MR-3, open** — PDP emits a free-string fingerprint, not a resolver-bound sealed ref); G6 retention/classification enforcement (R3+) |
| MOD-REG | `mod-reg-human-gov-disposition-candidate-001.md` + signed `mod-reg-gov-disposition.yaml` (PRs #27/#28; F-VER/F-IDNORM fix PR #30) | **APPROVE_NOT_EFFECTIVE** (signed HUMAN_GOV) | Technical acceptance only; effectiveness/activation remains on the operator decision stack |
| MOD-RUNTIME | `mod-runtime-completion-rev-001.md` (PRs #22/#23/#32) | FINISHED_WITH_TRACKED_FOLLOWUPS | **Live-path adoption of all three primitives (checkpoint/retry/approval) — none consumed by any live path (R3)**; MR-4 session state-machine widening; MR-9 P0 anchor; MR-10 approval-shape consolidation |
| MOD-OPS | `mod-ops-completion-rev-001.md` (PRs #38/#43/#48) | FINISHED_WITH_TRACKED_FOLLOWUPS | G4 KPI computation (R2-future/R3); G5 incident record+lifecycle (R3); G6 FinOps/cost substrate (R3/R4); G8 P0 anchor; all three surfaces unwired |
| MOD-LIVE | `mod-live-completion-rev-001.md` (PRs #36/#40/#47/#44) | FINISHED_WITH_TRACKED_FOLLOWUPS | G5 terminal/PTY capture (R3/R4, host-spawning); G2-actuation/G6 intervention + session-state widening (R3/R4); G1-actuation event-schema widening (R3); **N4 dormant residual (see §3)** |
| MOD-WSPACE | `mod-wspace-completion-rev-002.md` (PR #52; supersedes rev-001 NOT_FINISHED) | FINISHED_WITH_TRACKED_FOLLOWUPS | Single-writer/lease-conflict live denial; G3 worktree/namespace creation (R3/R4); G4 session-state lease states (R3); gateway lease wiring (B5, R3); G7 P0 anchor |

Additional delivered (beyond the eleven): **MOD-A2A** S1 delegation ledger (PR #24)
and S2 non-escalation gate (PR #31, unwired). MOD-UI, MOD-INTEG (queue service),
and MOD-SKILL S2/S3 remain **missing/partial** (§3).

### 2.3 P0-19 read-only self-pilot — a demonstration, NOT completion

`p0-19-self-pilot-candidate-001.md` (+ `p0-19-self-pilot-crossrev-001.md`) is a
**CANDIDATE / NOT AUTHORIZED** advisory packet. What it proves:

- The governed evidence chain **composes and gates correctly, read-only,
  end-to-end** over deterministic fixtures — 12 chain steps, each gated by the
  real ratified primitive (contract-validator, work-package-service,
  runtime-registry, context-federation, host-runtime-agent, workspace-lease,
  access-mode/event-family, governed-ledgers, evidence-envelope SoD), backed by
  `src/self-pilot/read-only-self-pilot.mjs` + 15/15 tests, with all 17 composed
  source files pinned byte-identical.
- Fail-closed proofs execute: WP-not-AUTHORIZED halts the chain; lease over-reach
  denied; producer self-verify denied; Observe→Control escalation denied; and the
  **GOV decision slot's `verdict`/`rendered_by` are always `null`** — the module
  exports no verdict-setter and a completed run still leaves it empty.

What it explicitly is **not**: it does **not** constitute P0-19 completion, does
**not** render the P0-20 verdict, and is **not** activation. Its own "What remains
GATED" table marks as `missing`/`blocked` or `execution_requires_operator`: live
runtime adapter wiring, real Host Runtime Agent PTY/host observation, full P0-18
conformance over the live chain, a durable governed evidence destination,
independent REV+QA execution by distinct assigned actors, the P0-20 verdict, and
activation. **P0-19 is demonstrated read-only; it is not completed.**

### 2.4 P0-18 conformance coverage — coverage, NOT sign-off

Four candidate records add live conformance cases against ratified primitives (all
CANDIDATE / ADVISORY — NOT SIGN-OFF):

- `p0-18-conformance-candidate-001.md` (+ crossrev): moves V-002 (project scope),
  V-010 (terminal/observer), V-014 (MCP cred-bounded) from BLOCKED → fully covered
  (positive/negative/adversarial); V-016 recovery → **partial** (resume-point half
  only).
- `p0-18-v011-redaction-candidate-001.md` (+ crossrev): V-011 redaction primitives
  — CANDIDATE, storage-plane half **BLOCKED**.
- `p0-18-v016-drift-candidate-001.md` (+ crossrev): V-016 drift — CANDIDATE, drift
  comparator half **BLOCKED**.
- `p0-18-v020-governance-candidate-001.md` (+ crossrev): V-020 **deny-half**
  (agent self-activation denied) covered live across five surfaces; the **positive
  half (human decision changes allowed state) is an honest PENDING** — it is
  activation-gated and out of scope for any agent candidate.

All four are read-only compositions that mutate no primitive and pin every composed
module byte-identical; each is `authority_status: advisory_only`. **P0-18 is
coverage, not sign-off** — sign-off requires the operator plus the still-blocked
halves (V-011 storage, V-016 drift, V-020 positive).

---

## 3. Residual risk register

Each residual carries `truth_status` and `risk_class`. Severity reflects impact if
activation proceeds without closure.

| # | Residual | Severity | truth_status | risk_class | Status |
|---|---|---|---|---|---|
| R-1 | **N4 dormant TOCTOU residual (mechanically unclosable in place).** `assessEnvelopeConformance` (MOD-LIVE S1) can be re-opened to the N1 TOCTOU class when handed a `Proxy` envelope with a stateful (non-throwing) `getOwnPropertyDescriptor` trap: `Object.getOwnPropertyDescriptor` on a Proxy invokes attacker-controlled code by spec, so the two-pass snapshot cannot fully close it in place. Independently reproduced (`mod-live-s1-toctou-fix-independent-review-001.md` NOVEL-5; `mod-live-s1-value-mutation-crossrev-001.md` F1/N4). Mitigation is an **input gate**: reject exotic/Proxy envelopes before wiring. | MEDIUM (if wired) / LOW (dormant) | verified_true | low (dormant) → medium (if wired) | Dormant — module PURE + UNWIRED, zero live callers. Immune gate: MUST close or reject-exotic-input **before** wiring to any Proxy-capable consumer |
| R-2 | **All primitives UNWIRED — adoption gated.** Every one of the eleven modules' completion reviews states the delivered code is pure and consumed by no live path (grep-confirmed in each). Traceability, PDP, retry/checkpoint/approval, scorecards, access-mode, replay, lease — all realizable but not realized end-to-end. | HIGH (for activation) | verified_true | medium | Adoption is R3, operator+SEC/GOV-gated per each module's follow-ups |
| R-3 | **No live runtime adapter.** No real spawn/attach to a runtime exists; the self-pilot uses fixtures. | HIGH (for activation) | verified_true | high (if activated without it) | `missing`/`blocked` (P0-19 gated-items table) |
| R-4 | **Host Runtime Agent is an event-emission facade, not a real host agent.** `host-runtime-agent` resolves an adapter (`resolveAdapter`, registry resolve) and emits structured events over fixtures; it performs **no process spawn** and no real PTY/host observation. | HIGH (for activation) | verified_true | high (if activated without it) | `missing`/`blocked` (P0-19); MOD-LIVE G5 deferred R3/R4 |
| R-5 | **Command Center UI absent.** MOD-UI is QUEUED — missing (only a V-011 display-plane seed exists). No fleet/workflow/terminal/diff/evidence live UI. | MEDIUM | verified_true | medium | missing |
| R-6 | **MOD-INTEG is process-not-system.** Serialized-merge/operator-merge practice exists operationally; the integration-queue **service** is missing. | MEDIUM | verified_true | medium | missing (module proper QUEUED) |
| R-7 | **P0-18 still-blocked positive halves.** V-020 human-decision positive half (activation-gated, PENDING); V-011 storage-plane redaction-before-append (BLOCKED — no primitive redacts RESTRICTED before ledger append); V-016 restore-drift comparator (BLOCKED — checkpoint-ledger non-goal #3). | HIGH (for P0-18 sign-off) | verified_true | high | blocked; sign-off gated |
| R-8 | **SECB-GOV-001 promotion packet twice found NOT_READY — 9 gaps (+1).** `secb-gov-001-promotion-readiness-rev-001.md` (independent, NOT_READY, 9 gaps) and `secb-gov-001-second-independent-readiness-review-001.md` (independent second pass, all 9 gaps re-confirmed + NEW-1 stale tracker). Gaps: no completed REV/QA/SEC verdict for the packet; five conflicting off-main baseline SHAs (packet 141 commits behind main); self-reported (unreproduced) test evidence; no evidence-acceptance record; Project Contract DRAFT/NOT EFFECTIVE; no STABLE/demotion/rollback policy; empty human-GOV template. | HIGH | verified_true | high | NOT_READY (twice); promotion is operator-only |
| R-9 | **Doc pack DRAFT / NOT EFFECTIVE.** Two packs coexist (`docs/README.md`): OM v0.1 (`SECB-GOV-001`, DRAFT) and the legacy Phase 0 constitution (pinned baseline). Root `AGENTS.md` states the Phase 0 pack remains DRAFT/NOT EFFECTIVE; the v0.1 candidate `AGENTS.md` replacement is NON-ACTIVE. Until acceptance, the legacy document is authoritative. | MEDIUM | verified_true | medium | DRAFT / NOT EFFECTIVE by design |
| R-10 | **No CI/SAST/coverage gates.** Enforcement is `npm run validate` + `node --test` run by producers/reviewers; no CI pipeline, no SAST, no coverage-threshold gate is wired (CLAUDE.md Rules #15/#18 list these as ongoing, not implemented). The second readiness review flagged the append-only tracker itself silently stopped being extended across ~15 merges (NEW-1) — a process-integrity gap the doctrine is designed to catch. | MEDIUM | verified_true | medium | missing (governance tooling exists as scripts, not enforced gates) |
| R-11 | **Tracked MEDIUM security follow-ups on the merged MCP surface.** MOD-MCP FU-1 (promotion SoD collapses to one-non-producer-actor) and FU-2 (gateway output secret-screen misses underscore token families) are MEDIUM, non-blocking, tracked — but open on the one module whose scope is a real permission surface. | MEDIUM | verified_true | medium | tracked follow-ups; secondary boundary (broker screen already correct) |

**Register truth note:** every row above was read first-hand from the cited record
on this trunk; no severity is inflated and none is suppressed.

---

## 4. Activation impact and reversibility

### 4.1 What activation would change

The SECB-GOV-001 promotion packet requests `ACTIVE_READ_ONLY_CONTROLLED_ACTIVATION`
(local read-only; `mutation_authority: false`; network/remote/deploy/release/stable
all denied). Per the independent readiness reviews, making `SECB-GOV-001` effective
would:

1. **Flip the source-of-truth pointer.** OM v0.1 becomes the normative operating
   model on every topic where it overlaps the legacy Phase 0 constitution
   (`docs/README.md`: "until acceptance, the legacy document remains
   authoritative").
2. **Replace root `AGENTS.md` (highest-risk).** The candidate
   `docs/00-governance/agents-instructions-om-v0.1-candidate.md` is the declared
   replacement — swapping the effective operating instructions (authority model,
   SoD, evidence rules, fail-closed scope) for every agent. This is an R3/R4
   governance-substrate change.
3. **Cross the retained hard gate.** Declaring anything `ACTIVE` crosses the
   AMD-002 retained gate requiring SEC review + explicit human GOV. Even the
   bounded read-only scope is an authority-boundary change.

### 4.2 What is irreversible — and the missing prerequisite

- Superseding the legacy constitution and replacing root `AGENTS.md` moves the
  governance source-of-truth; **rollback is not trivial.**
- **PREREQUISITE FLAG:** there is **no governed `STABLE`/demotion/rollback policy
  defined** in the current normative pack (readiness rev-001 gap #8, re-confirmed
  by the second review gap #8). Until such a policy exists, an effectiveness change
  is **not reversible by a governed decision**. A defined STABLE/demotion/rollback
  policy is therefore a hard prerequisite to any activation the human GOV considers.

---

## 5. Worker advisory recommendation (NOT the verdict, NOT an authorization)

> This section is advice to the human GOV authority. It is **not** the P0-20
> verdict and **not** an activation authorization. The decision is the human's
> (§6). A worker cannot approve activation (V-020 invariant; AMD-002 retained
> gates).

**Advisory recommendation:** The governance and evidence substrate is genuinely
demonstrated — eleven modules carry independently-reviewed completion verdicts, the
read-only self-pilot proves the governed chain composes and gates fail-closed
end-to-end, and the V-020 deny-half proves agents cannot self-activate — but the
operational chain is entirely **unwired**, there is no live runtime adapter or real
host agent, the SECB-GOV-001 promotion packet has been found **NOT_READY twice**
against nine unmet gaps, and the reversibility, CI/SAST/coverage, and doc-pack
effectiveness gates are still open. On this state a worker would advise the human
GOV **against** a `PASS_FOR_P0_CONTROLLED_ACTIVATION` verdict now, and would advise
that — at minimum — the nine SECB-GOV-001 readiness gaps be closed (completed
independent REV/QA/SEC verdicts on one consistent on-main SHA, independently
reproduced tests, evidence-acceptance and effective Project Contract records), a
governed STABLE/demotion/rollback policy be defined **before** any effectiveness
change, at least one live path be wired and observed under the self-pilot, the
N4-dormant input gate be closed (reject exotic/Proxy envelopes) before that wiring,
and the P0-18 blocked positive halves (V-020 human-decision, V-011 storage, V-016
drift) be closed or explicitly risk-accepted, with CI/SAST/coverage gates stood up.
This is advice for the human to weigh, not a decision; the human GOV may hold,
request changes, scope a narrower controlled activation, or decide otherwise.

---

## 6. Human-GOV decision record — EMPTY TEMPLATE (operator-only; agent-unfillable)

> **DO NOT FILL.** This block mirrors the self-pilot `GOV_DECISION_SLOT`
> (`src/self-pilot/read-only-self-pilot.mjs:58`) and the ratified V-020 invariant.
> Only a **human GOV authority** may fill it. **An agent (Claude, Codex, any LLM)
> filling any field below is a governance violation.** The producer of this packet
> left every decision field `null`/`PENDING` and holds no authority to do
> otherwise.

```yaml
p0_20_governance_decision:
  slot: GOV_DECISION
  status: PENDING_HUMAN_GOV
  authority: HUMAN_GOV_REQUIRED
  # --- operator/human-GOV fills the fields below; agents may not ---
  verdict: null                 # e.g. PASS_FOR_P0_CONTROLLED_ACTIVATION | HOLD | REQUEST_CHANGES | (human GOV decides)
  residual_risk_disposition: <PENDING>   # human GOV's disposition of the §3 register
  decided_by: null              # human GOV identity only — never an agent
  decided_at: null              # ISO8601, set by the human GOV at decision time
  effective: false              # activation/effectiveness is a separate governed act
  activation_authorized: false
  conditions: []                # any gates the human GOV requires closed first
  producer_may_fill: false
  codex_may_activate: false
  claude_may_activate: false
  agent_fill_is_a_violation: true
  note: >-
    Operator-only. This dossier never fills this slot. The P0-20 verdict and any
    activation remain SEC/GOV-gated. An agent filling any decision field violates
    the V-020 invariant (agents cannot self-activate; the GOV decision slot is
    structurally unfillable by agents).
```

---

## 7. Advisory status fields and self-certification

```yaml
truth_status: verified_true            # trunk totals (1149/1146/0/3), validator exit 0, 17 schemas, and every cited record reproduced/read first-hand at main @ 24274b0
authority_status: execution_requires_operator   # the P0-20 verdict + any activation are human-GOV-only; the §6 decision record is blocked to agents
implementation_status: partial         # substrate + 11 module verdicts + read-only self-pilot demonstrated; operational chain unwired, no live adapter/host agent, UI absent
risk_class: high                       # if activated on this state it would cross an authority boundary with an unwired chain, open reversibility gate, and a twice-NOT_READY promotion packet; currently contained by unmet gates
```

```yaml
self_certification:
  agent_id: claude-immune-p0-20-decision-packet-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Recommend; do not authorize. This packet certifies its own advisory completeness
> for human-GOV review. It renders no verdict, activates nothing, and asserts no
> authority. Both agents may self-certify advisory work; neither may self-authorize
> execution. The P0-20 verdict and any activation remain human GOV authority.

## Provenance

- **Source:** first-hand reads of the cited records on `main` @ `24274b0` and
  first-hand `npm run validate` + `node --test tests/*.test.mjs` in an isolated
  worktree.
- **Agent ID:** `claude-immune-p0-20-decision-packet-01` (BST-SA Immune worker).
- **Timestamp:** 2026-07-21, Asia/Vientiane.
- **Truth status:** verified facts separated from governance limits; every
  authority boundary preserved.

## Cross-links

- [P0 backlog (P0-18 → P0-19 → P0-20)](../../09-delivery/backlog-p0.md)
- [Read-only self-pilot spec](../self-pilot.md) · [ADR-0004](../../adr/0004-read-only-self-pilot.md)
- [P0-19 self-pilot candidate](p0-19-self-pilot-candidate-001.md)
- [P0-18 conformance candidate](p0-18-conformance-candidate-001.md) · [V-020 governance candidate](p0-18-v020-governance-candidate-001.md)
- [SECB-GOV-001 readiness review (1st)](secb-gov-001-promotion-readiness-rev-001.md)
- [Module completion tracker](module-completion-tracker-001.md) · [reconciliation-002](module-completion-tracker-reconciliation-002.md)
- [Root AGENTS.md](../../../AGENTS.md) · [Documentation index](../../README.md) · [MANIFEST](../../../MANIFEST.json)
