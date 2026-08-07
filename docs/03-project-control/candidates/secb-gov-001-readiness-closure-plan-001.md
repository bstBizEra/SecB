# SECB-GOV-001 Readiness-Gap Closure Plan (PLAN-001)

| Field | Value |
|---|---|
| Artifact | `secb-gov-001-readiness-closure-plan-001` |
| Author | `claude-cortex-readiness-plan-01` (BST-SA Cortex, advisory) |
| Baseline of this plan | main @ `df43bd6` (PR #113 merge; detached-worktree read) |
| Smoke context at baseline | `npm ci && npm test`: 1325 tests / 1322 pass / 0 fail / 3 skip, exit 0 (run first-hand at `df43bd6`) |
| Timestamp | 2026-07-22 |
| Scope | Advisory closure PLAN for the SECB-GOV-001 readiness gaps. NOT a closure of any gap, NOT a promotion, NOT a P0-20 seal, NOT an activation. |
| Authority | Advisory only. Every wave in this plan requires an explicit operator dispatch order before any work starts. |

> **Authority boundary of THIS record.** This document plans; it does not execute.
> No gap is closed by this document. It proposes concrete deliverables, executor
> classes, dependencies, and a wave order for the operator to dispatch — or reject.
> Restricted execution remains blocked; promotion/activation remains operator-only
> per AMD-002 retained hard gates and the P0-20 operator HOLD (PR #78).

---

## 1. Context

**What SECB-GOV-001 is.** `docs/00-governance/SECB-GOV-001.md` is the candidate
governance pack whose promotion to effective would (a) make OM v0.1 the normative
operating model, superseding the legacy Phase-0 constitution on overlapping topics,
and (b) adopt `docs/00-governance/agents-instructions-om-v0.1-candidate.md` as the
replacement for root `AGENTS.md` — a governance-substrate (R3/R4-class) change
(first readiness review §5).

**The two NOT_READY verdicts.**

1. `secb-gov-001-promotion-readiness-rev-001.md` — first independent readiness
   review (Immune, `claude-immune-rev-gov001-readiness-01`), 2026-07-21T09:27:27Z,
   baseline main `d4f5e36`, landed via PR #56. Verdict: **`NOT_READY` (evidence
   gaps)** — "the acceptance evidence that a promotion-to-ACTIVE decision requires
   does not exist yet." Its §7 defines the canonical gap list (items 1–9 below).
2. `secb-gov-001-second-independent-readiness-review-001.md` — second, independent
   readiness review (Immune, `claude-immune-gov001-second-review-01`), 2026-07-21,
   baseline `origin/main` @ `f78c4fb`, landed via **PR #80** (merge `ee31db7`).
   Verdict: "**The first review's verdict holds up: `NOT_READY`.** Independent
   re-verification confirms all 9 of its claimed gaps are real," and it adds **one
   additional gap** (NEW-1, tracker staleness — its §7 item 10).

**True gap count (honesty note).** The reviews jointly define **10** gaps, not 9:
the first review's 9 (§7 items 1–9) plus the second review's NEW-1 (its §7 item
10). The Phase-0 closure report's open register (`p0-closure-report-001.md` §6
item 4) records "9 SECB-GOV-001 readiness gaps" and separately lists the
STABLE/demotion/rollback policy as its own item 5 — i.e. it breaks review-gap #8
out as a standalone register line. This plan uses the full review-defined set of
**10**, of which **1 (G10) is CLOSED_SINCE_REVIEW** (see §2), leaving **9 open** —
consistent with the closure report's count.

**Why closure precedes the P0-20 seal.** The coordinator's recommended sequencing
is **readiness → verdict → wiring**: close the readiness gaps first, then the
operator's formal P0-20 verdict/seal, then (and only then) any wiring/adoption.
This ordering is structurally reflected on main: the P0-20 operator HOLD
disposition (`p0-20-operator-hold-disposition-001.md`, "What HOLD leaves open")
lists "The 9 SECB-GOV-001 readiness gaps; a STABLE/demotion/rollback policy"
alongside the formal P0-20 verdict record, and the closure report §6 keeps the
GOV-001 gaps (item 4) and the P0-20 seal (item 1) as separate operator gates with
the readiness gaps feeding the promotion decision the seal would rest on. Sealing
P0-20 before the readiness evidence exists would invert the evidence chain.

**Relation to the rest of the decision stack** (`p0-closure-report-001.md` §6):
this plan addresses open-register items **4** (the readiness gaps) and **5**
(STABLE/demotion/rollback policy = review gap G8). It does not touch items 1
(P0-20 seal — operator HOLD in force), 2 (wiring/adoption — SEC/GOV-gated behind
the HOLD), 3 (MI-4/MI-5), 6 (N4), 7 (CI/SAST), 8 (MOD-UI cross-review trigger),
or 9 (R3/R4 upper slices).

---

## 2. Per-gap closure cards

Verbatim gap text is quoted from `secb-gov-001-promotion-readiness-rev-001.md` §7
(the definitional list); confirmation status from
`secb-gov-001-second-independent-readiness-review-001.md` §2. "Since-review
credit" is checked against main @ `df43bd6` first-hand.

### G1 — Completed independent REV verdict

- **Gap (verbatim, first review §7 item 1):** "Completed independent REV verdict
  (not a dispatch) bound to one exact, on-main SHA — verdict + commands/environment
  + evidence refs + residual risks + acceptance/blockers." Second review §2 #1:
  "CONFIRMED still open."
- **Since-review credit:** none. No REV verdict artifact for the GOV-001 packet
  exists on main @ `df43bd6` (only the 6 packet records + the two readiness
  reviews match `secb-gov-001*` in the candidates dir).
- **What closes it:** a returned independent REV verdict record
  (`secb-gov-001-independent-rev-verdict-001.md`) produced by a non-producer
  reviewer against the re-cut packet at the single accepted on-main SHA (G4),
  with commands/environment, evidence refs, residual risks, and an explicit
  acceptance-or-blockers verdict.
- **Executor:** `AGENT_EXECUTABLE_UNDER_OPERATOR_DIRECTION` (independent reviewer
  agent, distinct from the packet producer; operator dispatches the lane).
- **risk_class:** medium (advisory artifact feeding a high-risk decision).
- **Dependencies:** G4 (needs one exact on-main target SHA).
- **Size:** M.

### G2 — Completed independent QA verdict

- **Gap (verbatim, item 2):** "Completed independent QA verdict with reproducible
  acceptance output, on the same exact SHA." Second review: "CONFIRMED still open."
- **Since-review credit:** none (no QA artifact for the GOV-001 decision exists).
- **What closes it:** a returned QA verdict record with a reproduced acceptance
  run (test suite + `validate-foundation`) bound to the same exact SHA as G1,
  executed by a QA lane distinct from both producer and REV reviewer.
- **Executor:** `AGENT_EXECUTABLE_UNDER_OPERATOR_DIRECTION`.
- **risk_class:** low (reproducible, binary checks).
- **Dependencies:** G4; consumes G5's bound evidence.
- **Size:** M.

### G3 — Completed SEC review

- **Gap (verbatim, item 3):** "Completed SEC review for the R3/R4
  activation-boundary controls and the `AGENTS.md`-replacement authority change,
  with residual risks recorded." Second review: "CONFIRMED still open."
- **Since-review credit:** none for the packet itself. (Adjacent but not
  substitutable: module-level SEC/immune gates exist for individual primitives,
  e.g. the gateway combined gate and MOD-WSPACE probes — none reviews the GOV-001
  activation boundary or the `AGENTS.md` replacement.)
- **What closes it:** a SEC review record covering (a) the
  `ACTIVE_READ_ONLY_CONTROLLED_ACTIVATION` boundary controls, (b) the root
  `AGENTS.md` replacement authority change (AMD-002 §19 port-forward
  verification), with residual risks enumerated for the operator.
- **Executor:** `AGENT_EXECUTABLE_UNDER_OPERATOR_DIRECTION` (Immune-lane advisory
  SEC review; the *acceptance* of residual risks stays with the operator).
- **risk_class:** high (subject matter is the governance-substrate swap).
- **Dependencies:** G4; strengthened by G8 existing first (rollback path is part
  of the boundary assessment).
- **Size:** M.

### G4 — Single, consistent, on-main baseline SHA

- **Gap (verbatim, item 4):** "Single, consistent, on-main baseline SHA —
  reconcile the five conflicting SHAs to one accepted commit reachable from the
  integration target; re-base or re-cut the producer baseline against current
  main d4f5e36 (close the 141-commit gap)." Second review: "CONFIRMED" (only
  `4fef2f1` of the five is an ancestor of main).
- **Since-review credit:** none on the packet — the six packet records on main
  still carry the five conflicting SHAs (`1fb7ba9`, `4fef2f1`, `c4a5f36`,
  `e3de3eb`, `e220002`). Main itself has advanced far past both review baselines
  (now `df43bd6`), so the re-cut target named in the gap text is itself stale;
  closure must target *current* main, not `d4f5e36`.
- **What closes it:** a re-cut promotion packet
  (`secb-gov-001-promotion-refresh-003.yaml` + refreshed queue/readiness records,
  extend-only — supersede, do not rewrite, the 002-series) in which **every**
  record binds to ONE operator-accepted, on-main SHA.
- **Executor:** `MIXED` — agent drafts the re-cut records; the **choice/acceptance
  of the baseline SHA is an operator decision** (it is the commit the promotion
  would bind to).
- **risk_class:** medium.
- **Dependencies:** none. **Keystone gap — unblocks G1, G2, G3, G5.**
- **Size:** M.

### G5 — Independently reproduced test evidence bound to the accepted SHA

- **Gap (verbatim, item 5):** "Independently reproduced test evidence bound to
  that accepted SHA (replace the producer self-report)." Second review:
  "CONFIRMED, and drift is now larger" (it reproduced 1081/1076/0/5 at `f78c4fb`
  vs the packet's stale 559-test self-report).
- **Since-review credit: PARTIAL.** Independent reproductions now exist on main
  repeatedly — second review @ `f78c4fb` (1081/1076/0/5), P0 closure report @
  `2a22e52` (1325/1322/0/3; validator 856/856 exit 0), and this plan's own smoke
  @ `df43bd6` (1325/1322/0/3, exit 0). The reproduction *machinery and habit* are
  proven. **What is still missing is the binding**: none of these runs is bound to
  an accepted packet baseline, because G4's single SHA does not exist yet.
  Not double-counted as closed.
- **What closes it:** a fresh `npm ci && npm test` + `validate-foundation` run
  executed by a non-producer at exactly the G4-accepted SHA, recorded in the
  refresh-003 packet as bound evidence.
- **Executor:** `AGENT_EXECUTABLE_UNDER_OPERATOR_DIRECTION`.
- **risk_class:** low.
- **Dependencies:** G4.
- **Size:** S.

### G6 — Evidence-acceptance + retention record

- **Gap (verbatim, item 6):** "Evidence-acceptance + retention record." Second
  review: "CONFIRMED still open. No such record found anywhere in
  `docs/03-project-control/`."
- **Since-review credit: PARTIAL (mechanism, not record).** MOD-EVID has since
  delivered the acceptance *machinery* as ratified, UNWIRED candidates (S1
  register+seal, S2 verify/accept SoD ladder, S3 accepted-evidence resolver —
  per `mod-evid-completion-rev-001.md` and the tracker log). No
  evidence-acceptance record *instance* for the GOV-001 packet exists, and the
  primitives are unwired; the gap remains open.
- **What closes it:** an evidence-acceptance + retention record for the GOV-001
  packet's evidence set (G1/G2/G3 verdicts + G5 run), drafted per the MOD-EVID
  ladder's shape, with the **acceptance act performed by the operator** (accept
  is an authority act under the SoD ladder design).
- **Executor:** `MIXED` — agent drafts the record; operator performs acceptance.
- **risk_class:** medium.
- **Dependencies:** G1, G2, G3, G5.
- **Size:** S.

### G7 — Effective, schema-valid Project Contract

- **Gap (verbatim, item 7):** "Effective, schema-valid Project Contract (owners,
  signatures, exact repo/commit binding, environments, restrictions, retention,
  release authority, expiry, revocation) bound to the accepted baseline." Second
  review: "CONFIRMED" — both candidate YAMLs still DRAFT.
- **Since-review credit: PARTIAL (draft exists).** `secb-local-v2-r2.project-contract.yaml`
  exists on main as `DRAFT_REVIEW_REQUIRED_NOT_EFFECTIVE`, `effective_from: null`.
  A reviewable draft is real progress over nothing, but **effectiveness requires
  signatures and an operator declaration** — absent.
- **What closes it:** (a) agent finalizes the v2-r2 draft against the G4-accepted
  baseline (commit binding, environments, restrictions, retention, release
  authority, expiry, revocation fields complete + schema-valid); (b) independent
  review of the draft; (c) **operator signs and declares it effective**.
- **Executor:** `MIXED` — agent drafts/finalizes; effectiveness is
  `OPERATOR_ONLY`.
- **risk_class:** medium.
- **Dependencies:** G4 (commit binding). Signing naturally sequenced with wave 3.
- **Size:** M.

### G8 — Governed STABLE/demotion + rollback policy

- **Gap (verbatim, item 8):** "Governed STABLE/demotion + rollback policy defined
  before any promotion, so the effectiveness change is reversible by a governed
  decision." Second review: "CONFIRMED — `find` for ADR/policy files matching
  stable/demotion patterns returns nothing."
- **Since-review credit:** none. Re-checked at `df43bd6`: no STABLE/demotion/
  rollback policy document exists in `docs/00-governance/` or
  `docs/03-project-control/`. Also carried as open-register item 5 and named in
  the P0-20 HOLD disposition's "What HOLD leaves open".
- **What closes it:** a policy candidate document (e.g.
  `docs/00-governance/stable-demotion-rollback-policy-candidate.md` or an ADR)
  defining STABLE disposition criteria, governed demotion (who may demote an
  effective pack, on what evidence), and the rollback path for the
  OM-v0.1/`AGENTS.md` supersession — followed by **operator/GOV adoption** of the
  policy (a policy-adoption decision, not agent-declarable).
- **Executor:** `MIXED` — agent drafts the candidate; adoption is `OPERATOR_ONLY`.
- **risk_class:** high (it is itself governance policy; mitigated by
  candidate-only drafting).
- **Dependencies:** none (draftable immediately, in parallel with G4).
- **Size:** M.

### G9 — Explicit human GOV decision

- **Gap (verbatim, item 9):** "Explicit human GOV decision recorded in
  `human-gov-decision-001.yaml` (currently a correct, empty template) once gates
  1–8 are evidenced." Second review: "CONFIRMED, and still empty."
- **Since-review credit:** none — and correctly so. Verified at `df43bd6`:
  `status: PENDING_HUMAN_GOV`, preconditions false/pending, `producer_may_fill:
  false`, `codex_may_activate: false`. The template staying empty is the control
  working, not a defect.
- **What closes it:** the operator personally fills the decision record (or a
  refresh-003 successor template bound to the G4 SHA) with an explicit
  PASS / HOLD / REQUEST_CHANGES outcome. **No agent may draft, pre-fill, or
  simulate this record's decision fields** (V-020 invariant; agent fill is a
  governance violation).
- **Executor:** `OPERATOR_ONLY`.
- **risk_class:** critical (this is the authority act that swaps the governance
  source-of-truth).
- **Dependencies:** G1–G8 all evidenced.
- **Size:** S (in effort; not in weight).

### G10 — Module-completion-tracker refresh (second review NEW-1) — **CLOSED_SINCE_REVIEW**

- **Gap (verbatim, second review §7 item 10):** "Refresh
  `module-completion-tracker-001.md` against current `origin/main` before it (or
  the 'N modules ratified-complete' narrative it supports) is used as supporting
  context for the GOV-001 decision."
- **Status: CLOSED_SINCE_REVIEW.** Evidence at `df43bd6`: the tracker has been
  extended (append-only, per its declared extend-only authority, PR #87) well
  past the state the second review flagged — dated 2026-07-21/2026-07-22 entries
  now record the MOD-MEM, MOD-SKILL, MOD-A2A completion reviews, the operator
  R3→R2 reclassifications, and the Phase-0 closure report
  (`git log -- module-completion-tracker-001.md` shows `be32082`, `5940729`,
  `57a2706` and more after PR #80); the PR #86 reconciliation
  (`module-completion-tracker-reconciliation-002.md`) restored tracker integrity.
  The tracker now reflects actual main state through the append-only iteration
  log. *Caveat, honestly noted:* the top "Queue and status" table is frozen by
  extend-only design (still reads QUEUED); the authoritative current state lives
  in the appended log lines, and per-module "FINISHED" tracker statuses still
  await operator ratification. That residue is an operator ratification act, not
  a reopening of the staleness gap the review defined.
- **Executor / size:** n/a (closed). No wave slot.

---

## 3. Sequencing proposal (dependency-ordered waves)

Every wave requires an **explicit operator dispatch order** before any work
begins. Operator decision points are marked ◆.

**◆ Decision point A (before Wave 1):** operator names the accepted baseline SHA
(current main tip at dispatch time) and issues the Wave-1 dispatch order.

- **Wave 1 — no-dependency drafting (agent-executable under direction, docs-only):**
  - W1a **G4** re-cut promotion packet (refresh-003) at the accepted SHA (agent
    drafts; operator's SHA choice from decision point A).
  - W1b **G8** STABLE/demotion/rollback policy candidate draft.
  - W1c **G7** Project Contract v2-r2 finalization draft (fields completed,
    bound to the accepted SHA once W1a fixes it; can start immediately, binds
    late).
  - W1d **G5** evidence run: `npm ci && npm test` + validator at the accepted
    SHA, recorded into the refresh-003 packet (piggybacks on W1a; trivially
    parallel).

**◆ Decision point B (before Wave 2):** operator dispatches the three independent
lanes with **distinct executors** (SoD: producer ≠ REV ≠ QA; SEC distinct from
producer), all targeting the exact refresh-003 SHA.

- **Wave 2 — independent verdict lanes (agent-executable under direction):**
  - W2a **G1** independent REV verdict on the re-cut packet.
  - W2b **G2** independent QA verdict (reproduces W1d's run independently).
  - W2c **G3** SEC review of the activation boundary + `AGENTS.md` replacement
    (reads W1b's draft policy as the rollback-path input).

**◆ Decision point C (Wave 3 — operator authority acts, agent drafts only):**

- **Wave 3 — acceptance and effectiveness:**
  - W3a **G6** evidence-acceptance + retention record: agent drafts; **operator
    performs the acceptance**.
  - W3b **G8** policy adoption: **operator/GOV adopts** (or amends) the Wave-1
    candidate.
  - W3c **G7** contract effectiveness: **operator signs and declares effective**.

**◆ Decision point D (Wave 4 — the promotion decision itself):**

- **Wave 4 — human GOV decision:**
  - W4a **G9** operator personally records PASS / HOLD / REQUEST_CHANGES in the
    human-GOV decision record. Whatever the outcome, it is the operator's own
    act; agents may only verify afterward that preconditions were evidenced.

Only after Wave 4 — and only if the operator's outcome is PASS — does the
coordinator sequencing proceed to the P0-20 verdict seal, and only after that to
any wiring. Neither step is part of this plan.

---

## 4. What this plan does NOT do

- Closes **no** gap: this document is a plan; G1–G9 remain open exactly as the
  two reviews left them (G10 was closed by prior, separately-merged work, not by
  this document).
- Performs **no** promotion, **no** effectiveness declaration, **no** activation,
  **no** P0-20 seal, and does not touch the sealed GOV slot (`verdict: null`)
  or the operator HOLD (PR #78).
- Grants **no** authority: each wave (1 through 4) requires its own explicit
  operator dispatch order; nothing here is self-dispatching, and no agent may
  treat this plan as authorization to start Wave 1.
- Pre-fills **nothing** of the human-GOV decision (G9) — its content is
  operator-only, per V-020.

---

## 5. Recommended first dispatch (1–3 items)

1. **W1a+W1d together — G4 packet re-cut + G5 bound evidence run** (single
   dispatch): highest unblock value — G4 is the keystone that G1, G2, G3, and G5
   all depend on, and the evidence run is near-free once the SHA is fixed.
   Docs-plus-test-run only; risk low; nothing wired, nothing activated.
2. **W1b — G8 STABLE/demotion/rollback policy candidate draft**: zero
   dependencies, named as a blocker in both readiness reviews, the P0-20 packet,
   the HOLD disposition, and open-register item 5 — and it is the reversibility
   precondition for *any* future effectiveness decision. Drafting it early gives
   the Wave-2 SEC review (W2c) its rollback-path input.
3. **W1c — G7 contract finalization draft** (optional third): the draft already
   exists (v2-r2); completing its fields in parallel shortens Wave 3.

Rationale: all three are lowest-risk (advisory/docs deliverables, candidate-only,
no wiring), and together they unblock every downstream wave while leaving every
authority act (baseline acceptance, lane dispatch, policy adoption, contract
signature, GOV decision) exactly where it belongs — with the operator.

---

## 6. Advisory status fields

```yaml
truth_status: verified_true        # every gap quote read from the on-main review records; since-review credits checked first-hand at df43bd6
authority_status: advisory_only    # plan only; every wave requires an explicit operator dispatch order
implementation_status: candidate   # proposes deliverables; builds none of them
risk_class: low                    # docs-only record; no code, schema, policy, or authority change
```

## 7. Self-certification

```yaml
self_certification:
  agent_id: claude-cortex-readiness-plan-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Certified: this closure plan is complete as an advisory work product,
> source-bound to the two NOT_READY readiness reviews and the Phase-0 closure
> report, with since-review credits verified first-hand at main `df43bd6`. It
> carries no execution or approval authority; closing any gap, and the promotion
> decision itself, remain with the operator/GOV.
