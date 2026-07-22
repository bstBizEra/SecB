# SECB-GOV-001 Project Contract v2-r3 Draft Refresh (G7, Wave 1c)

| Field | Value |
|---|---|
| Artifact | `secb-gov-001-project-contract-v2-r3-draft-001` |
| Status | **`DRAFT` / `SIGNING_REQUIRED_NOT_EFFECTIVE` / `EFFECTIVENESS_REQUIRES_OPERATOR`** |
| Author | `claude-cortex-w1c-contract-01` (BST-SA Cortex, advisory) |
| Baseline of this draft | main @ `d75a9bf` (PR #116 merge; detached-worktree read) — includes accepted G4 baseline record (PR #115) and G8 policy draft (PR #116) |
| Contract commit binding | `c2ec6458b60ded0a93d74e717cd7816f55834f01` (the G4 proposed single baseline; tree `3b7300f1b7cd378d373cf8e2da10dc459bb8f63b`) |
| Refreshes | `secb-local-v2-r2.project-contract.yaml` (record_id `project_contract_prj_secb_local_v2_r2_candidate`, status `DRAFT_REVIEW_REQUIRED_NOT_EFFECTIVE`) — **supersede-by-reference, extend-only; the v2-r2 file is NOT overwritten** |
| Wave | Wave 1c (W1c) of `secb-gov-001-readiness-closure-plan-001.md` (merged PR #114) — addresses review gap **G7** |
| Timestamp (UTC) | 2026-07-22T04:20:09Z |
| Scope | Advisory DRAFT refresh of the candidate Project Contract. Drafting only — the draft half of a MIXED gap. Signs nothing, declares nothing effective, activates nothing. |
| Authority | Advisory only. This contract becomes EFFECTIVE **only** when the operator/SEC-GOV signs and ratifies a signing record naming this document + a version pin (Wave 3, §3). Until then it has no force. |

> **Authority boundary of THIS record.** This document *drafts* a refreshed
> Project Contract; it does not *sign* or *enact* one. It does not promote
> `SECB-GOV-001`, does not populate owner/approver signatures, does not set
> `effective_from`, and does not itself become the effective contract the
> readiness reviews demanded until the operator signs and declares it effective.
> Drafting is the W1c half of a MIXED gap; the signing/effectiveness half is
> `OPERATOR_ONLY` and lands in Wave 3. Nothing here is self-signing. This draft
> does **not** modify ADR-0015 R5, the V-020 human-GOV sealed-slot pattern, the
> P0-20 operator HOLD (PR #78), or any `contracts/` schema; it composes with them.

---

## 0. The exact G7 complaint, source-bound

Both independent readiness reviews block promotion partly because no effective
Project Contract exists. Quoting the source records verbatim:

- **First review (`secb-gov-001-promotion-readiness-rev-001.md` §7 item 7):**
  > "Effective, schema-valid Project Contract (owners, signatures, exact
  > repo/commit binding, environments, restrictions, retention, release authority,
  > expiry, revocation) bound to the accepted baseline."

  Its §3 claim-to-source binding row records the contract as: "**Absent by
  design.** Correctly reported `DRAFT / NOT EFFECTIVE`; consistent with main."

- **Second review (`secb-gov-001-second-independent-readiness-review-001.md`
  §2 item 7):** "Project Contract still DRAFT/NOT EFFECTIVE — **CONFIRMED**.
  `docs/03-project-control/project-contract.md`: `Status: DRAFT / NOT EFFECTIVE`.
  Both candidate contract YAMLs (`secb-local.project-contract.yaml`,
  `secb-local-v2-r2.project-contract.yaml`) still read `DRAFT_NOT_EFFECTIVE` /
  `DRAFT_REVIEW_REQUIRED_NOT_EFFECTIVE`, `effective_from: null`."

- **Closure-plan G7 card (`secb-gov-001-readiness-closure-plan-001.md` §2 G7):**
  since-review credit **PARTIAL (draft exists)** — "`secb-local-v2-r2.project-contract.yaml`
  exists on main as `DRAFT_REVIEW_REQUIRED_NOT_EFFECTIVE`, `effective_from: null`.
  A reviewable draft is real progress over nothing, but **effectiveness requires
  signatures and an operator declaration** — absent." Executor: **MIXED** — agent
  drafts/finalizes; effectiveness is `OPERATOR_ONLY`. Dependency: G4 (commit
  binding). "Signing naturally sequenced with wave 3."

The precise, honest reading of the complaint: **the contract object is not the
problem — its bindings and completeness are.** The v2-r2 draft (a) binds to a
stale baseline commit unrelated to the accepted G4 SHA, (b) has no revocation
clause, (c) does not reference the reversibility policy (G8) or the evidence
chain (G5 + Wave-2 G1/G2/G3), and (d) carries empty owner/approval slots that
only the operator may fill. This refresh fixes (a)–(c) at the draft level and
leaves (d) — signatures and effectiveness — exactly where the reviews and the
plan place it: with the operator, in Wave 3.

---

## 1. What the contract is

`prj_secb_local` Project Contract is the normative authority-boundary artifact
for the SECB-GOV-001 promotion object. When effective, it is the contract the
promotion decision binds to — it fixes the exact repository/commit the work
targets, the environments, the risk ceiling, the activation restrictions, the
retention and release-authority regime, and (once signed) the owners and
approvers.

- **Promotion object definition.** The object this contract governs is the
  candidate governance pack `SECB-GOV-001` (`docs/00-governance/SECB-GOV-001.md`)
  whose promotion to effective would make OM v0.1 the normative operating model
  and adopt `docs/00-governance/agents-instructions-om-v0.1-candidate.md` as the
  `AGENTS.md` replacement (a governance-substrate R3/R4-class change — first
  readiness review §5). The contract does not itself promote that object; it is
  the boundary the promotion, once authorized, must stay inside.

- **Parties / authority model.**
  - **Operator / SEC-GOV authority** — the only party that may sign this
    contract, set `effective_from`, populate the owner slots, adopt the governing
    lifecycle policy (G8), and record the human-GOV promotion decision (G9). All
    effectiveness, signing, release, integration, demotion, and revocation acts
    are `OPERATOR_ONLY`.
  - **Agent lanes (advisory-only, per V-020)** — Cortex/Motor/Immune/QA agents
    may draft, finalize fields, reproduce evidence, and review, but may not sign,
    pre-fill decision/approval fields, or declare effectiveness. Per the V-020
    invariant carried in §2 delta D7, agent fill of a decision/approval field is
    a governance violation, not a shortcut.

- **Sealed-slot invariant it binds to.** This contract's effectiveness is
  downstream of the sealed human-GOV decision slot
  (`secb-gov-001-human-gov-decision-001.yaml`: `status: PENDING_HUMAN_GOV`,
  `producer_may_fill: false`, `codex_may_activate: false`). No agent — Claude,
  Codex, or any LLM — is an approving authority for this contract.

---

## 2. Refresh deltas vs the prior v2-r2 draft

Each change is a draft-level edit to the *proposed* v2-r3 contract object
(embedded in §5). The v2-r2 file is left byte-unchanged on main; v2-r3
supersedes it by reference.

- **D1 — Commit binding refreshed to the accepted G4 baseline.**
  `authorized_baseline_commit` moves from the stale `26e299c160f58a5305b143456e8e43ecf2adac12`
  (v2-r2, unrelated to the promotion baseline) to
  `c2ec6458b60ded0a93d74e717cd7816f55834f01`, and a companion
  `authorized_baseline_tree: 3b7300f1b7cd378d373cf8e2da10dc459bb8f63b` is added.
  *Why:* the G7 gap demands "exact repo/commit binding … bound to the accepted
  baseline"; G4 (`secb-gov-001-baseline-recut-001.md`) fixes that single on-main
  SHA. Binding note added: acceptance of this SHA remains the operator's G4 act;
  if main advances past `c2ec645` before signing, the contract re-binds to the
  re-cut successor (never to a second SHA).

- **D2 — Revocation clause added (was entirely missing).** New
  `revocation_policy` block: revocation and any post-effective demotion are
  `OPERATOR_ONLY`, executed as a governed decision per the G8 STABLE/demotion/
  rollback policy (revert-by-new-record, never history rewrite; pin-to-last-
  accepted-baseline via the G4 single-SHA anchor). *Why:* the G7 gap explicitly
  lists "revocation" as a required field; v2-r2 had no revocation field at all.

- **D3 — Governing lifecycle policy referenced (G8).** New
  `governing_lifecycle_policy` reference to
  `secb-gov-001-stable-demotion-rollback-policy-001.md` with an explicit
  `policy_adoption_status: PENDING_OPERATOR_ADOPTION_WAVE_3`. *Why:* the reviews
  require the effectiveness change be reversible by a governed decision (G8);
  the contract must name the policy that makes it reversible, while honestly
  recording that the policy is itself a candidate pending Wave-3 adoption.

- **D4 — Evidence chain referenced (G5 + Wave-2 G1/G2/G3).** New
  `evidence_chain` block naming: G5 bound evidence
  (`secb-gov-001-bound-evidence-001.md`, bound to `c2ec645`), and the pending
  Wave-2 independent verdict lanes — G1 REV, G2 QA, G3 SEC — as
  `PENDING_WAVE_2`. *Why:* the contract's release authority rests on an evidence
  chain; the reviews demand independent (non-producer) REV/QA/SEC verdicts, and
  the contract should point at them (and honestly mark them not-yet-returned).

- **D5 — Expiry made explicit as set-at-signing.** `expires_at` stays `null` but
  gains a companion `expiry_policy: SET_AT_SIGNING_BY_OPERATOR` note. *Why:* the
  G7 gap lists "expiry"; leaving `expires_at: null` silently is ambiguous, so the
  refresh records that the value is an operator input at signing, not an omission.

- **D6 — Closure-report open-register alignment.** New `open_register_alignment`
  note tying this contract to `p0-closure-report-001.md` §6 items 4 (readiness
  gaps) and 1 (P0-20 seal, operator HOLD in force). *Why:* the plan requires the
  contract "align with the closure report's open register"; this makes the
  linkage explicit and records that the P0-20 seal remains a separate operator
  gate.

- **D7 — Sealed-slot / V-020 authority invariant carried verbatim.** New
  `authority_invariant` block stating, verbatim in intent with the sealed slot:
  effectiveness/signing/promotion are `OPERATOR_ONLY`; the human-GOV decision
  slot stays `PENDING_HUMAN_GOV` / `producer_may_fill: false` /
  `codex_may_activate: false`; no LLM is an approving authority (V-020). *Why:*
  the plan requires the sealed-slot/V-020 authority invariant be carried
  verbatim; this hard-codes it into the contract so effectiveness cannot be
  read as agent-grantable.

- **D8 — Metadata refreshed (extend-only supersession).** `record_id` →
  `project_contract_prj_secb_local_v2_r3_candidate`; `supersedes_candidate` →
  `project_contract_prj_secb_local_v2_r2_candidate`; `version` → 3;
  `record_status` retained as `DRAFT_REVIEW_REQUIRED_NOT_EFFECTIVE` with the added
  status header `SIGNING_REQUIRED_NOT_EFFECTIVE`. *Why:* extend-only requires a
  new revision that supersedes without overwriting.

### 2a. Flagged for independent review (NOT resolved by this draft)

- **Schema-shape divergence (open question, deliberately not silently
  "fixed").** The canonical machine schema
  `contracts/project-contract.schema.json` (JSON Schema 2020-12,
  `additionalProperties: false`) requires a *different, narrower* field set
  (`risk_class`, `owners` as string array, `repositories` as string array,
  `valid_from`/`valid_until`, `evidence_destination`, `approvals`) than the rich
  governance shape v2-r2 uses (`risk_ceiling`, object-valued `owners`/
  `repositories`, `effective_from`/`expires_at`, `activation_restrictions`,
  `provider_transport_policy`, etc.). **v2-r2 is not valid against that strict
  schema, and neither is this v2-r3 refresh** — because forcing the strict shape
  would drop the authority-boundary fields the reviews actually care about. As an
  advisory drafter I do **not** unilaterally decide which schema is canonical or
  mutate `contracts/`. This is flagged as an **open item for the G7 independent
  review / Wave-3 signing**: the operator/reviewer must decide whether (a) the
  strict schema is authoritative and the rich fields move to an annex, or (b) the
  rich governance shape is authoritative and the schema is a separate, narrower
  registration record. This draft preserves the rich shape and records the
  divergence rather than hiding it.

---

## 3. Effectiveness path (Wave-3 signing)

Exactly what makes this contract EFFECTIVE, and what leaves it NOT EFFECTIVE:

1. **Now (Wave 1c, this record):** `DRAFT` / `SIGNING_REQUIRED_NOT_EFFECTIVE` /
   `EFFECTIVENESS_REQUIRES_OPERATOR`. `effective_from: null`, `owners.*: null`,
   `approvals: []`. The contract has no force.
2. **Wave 2 (independent verdicts, prerequisite):** G1 REV, G2 QA, G3 SEC
   verdicts returned by non-producer lanes at the accepted G4 SHA; G5 evidence
   bound. These populate the `evidence_chain` (D4) but do not sign anything.
3. **Wave 3 (operator authority acts — the effectiveness step):**
   - The operator/SEC-GOV populates the owner slots
     (`owners.business/technical/security/governance`).
   - The operator/GOV **adopts** the G8 lifecycle policy (W3b), flipping
     `policy_adoption_status` to adopted (a separate operator act).
   - The operator **signs and declares effective** (W3c): ratifies a **signing
     record** that names *this document* (`secb-gov-001-project-contract-v2-r3-draft-001`)
     and a **version pin** (the `record_id` + the `c2ec645` commit binding),
     populates `approvals` with the signer identities, and sets `effective_from`
     to the signing timestamp.
   - Only when that signing record is ratified on main does
     `record_status` become effective. **No agent statement, vote, score, or
     review can substitute for the operator's signing act.**
4. **Until step 3 completes:** the contract stays NOT EFFECTIVE. This draft
   reaching main changes no authoritative status.

---

## 4. What stays unchanged from v2-r2 (carried forward, not churned)

These sections drew no complaint from either review and are carried forward
verbatim (values identical to v2-r2 unless a delta above touches them):

- `project_id: prj_secb_local`, `namespace: bizera/secb/local`, `name`,
  `description`, `profile_id: software-engineering`, `risk_ceiling: R2`.
- `environments` — `env_secb_local_build`, kind `local_isolated_worktrees`,
  `activation_status: CANDIDATE`.
- `security_classification: INTERNAL` and the `data_categories` list.
- `applicable_policies` list (7 entries), `approved_runtime_deployments: []`,
  `proposed_runtime_deployments`, `approved_agents: []`,
  `proposed_agent_registrations`, and the empty `approved_models/tools/
  mcp_methods/skills` arrays.
- `evidence_root`, `evidence_destination_status: PROPOSED_NOT_PROVISIONED`.
- `memory_policy` (both `false`), `release_authority: HUMAN_GOV_REQUIRED`,
  `integration_authority: SEPARATE_HUMAN_AUTHORIZATION_REQUIRED`,
  `data_residency: [LOCAL_MACHINE_ONLY]`,
  `provider_transport_policy`, `agent_tool_network_policy: DENY_ALL`,
  `credential_policy`, `retention_policy: PROPOSED_30_DAYS_PENDING_GOV`.
- `required_exit_gates: [G0..G5, G7, G8]`.
- The four `activation_restrictions` (no main mutation; no remote/push/publish/
  deploy/activate; no MCP/A2A/browser/memory/knowledge/skill promotion; producer
  work limited to authorized sibling worktrees).
- `effective_from: null` and `approvals: []` — **unchanged and empty by design**
  (these are the operator's Wave-3 inputs, not a drafting gap).

---

## 5. Proposed refreshed contract object (v2-r3)

> **Not effective. Not signed.** This YAML is a *draft object* embedded for
> review. It is intentionally **not** emitted as a standalone
> `secb-local-v2-r3.project-contract.yaml` file by this Wave-1c record — the
> operator lifts it into the signed file at Wave-3 signing, so that no
> parallel "contract file" exists on main claiming a status it does not have.
> `owners.*` and `approvals` stay null/empty until the operator signs.

```yaml
schema_version: "1.0"
record_metadata:
  record_id: "project_contract_prj_secb_local_v2_r3_candidate"
  record_status: "DRAFT_REVIEW_REQUIRED_NOT_EFFECTIVE"   # + SIGNING_REQUIRED_NOT_EFFECTIVE / EFFECTIVENESS_REQUIRES_OPERATOR
  supersedes_candidate: "project_contract_prj_secb_local_v2_r2_candidate"
  supersede_mode: "SUPERSEDE_BY_REFERENCE_EXTEND_ONLY"    # v2-r2 file NOT overwritten
  source_template: "docs/templates/project-contract.yaml"
  refreshed_at: "2026-07-22T04:20:09Z"
  refreshed_by: "claude-cortex-w1c-contract-01"           # advisory drafter; NOT a signer
  producer_runtime: "Claude Code"
  producer_actor_id: null
project_contract:
  project_id: "prj_secb_local"
  namespace: "bizera/secb/local"
  name: "SecB Local Phase 0 Parallel Build Wave 1"
  description: "Candidate authority boundary for isolated local R2 implementation by Codex and Claude Code."
  version: 3
  status: "DRAFT"
  profile_id: "software-engineering"
  risk_ceiling: "R2"
  owners:                       # UNCHANGED — operator populates at signing (Wave 3)
    business: null
    technical: null
    security: null
    governance: null
  repositories:
    - repository_id: "repo_secb_local"
      provider: "local_git"
      path: "C:/laragon/www/SecB"
      default_branch: "main"
      protected_refs: ["main"]
      authorized_baseline_commit: "c2ec6458b60ded0a93d74e717cd7816f55834f01"   # D1: refreshed from stale 26e299c1
      authorized_baseline_tree: "3b7300f1b7cd378d373cf8e2da10dc459bb8f63b"     # D1: added
      baseline_source: "secb-gov-001-baseline-recut-001.md (G4 proposed single baseline)"
      baseline_acceptance: "PENDING_OPERATOR_G4_ACCEPTANCE"                    # D1: re-bind to re-cut successor if main advances
      remote: null
  environments:
    - environment_id: "env_secb_local_build"
      kind: "local_isolated_worktrees"
      activation_status: "CANDIDATE"
  security_classification: "INTERNAL"
  data_categories: ["repository_source", "governance_documents", "test_results", "build_evidence"]
  applicable_policies:
    - "AGENTS.md"
    - "docs/AGENTS.md"
    - "docs/00-governance/governance-baseline.md"
    - "docs/00-governance/authority-and-risk-model.md"
    - "docs/02-operating-model/agent-team-and-sod.md"
    - "docs/03-project-control/work-package-contract.md"
    - "docs/09-delivery/codex-claude-git-worktree-build-plan.md"
  governing_lifecycle_policy:                              # D3
    policy_ref: "docs/03-project-control/candidates/secb-gov-001-stable-demotion-rollback-policy-001.md"
    policy_adoption_status: "PENDING_OPERATOR_ADOPTION_WAVE_3"
  evidence_chain:                                          # D4
    bound_evidence: "docs/03-project-control/candidates/secb-gov-001-bound-evidence-001.md"   # G5, bound to c2ec645
    independent_rev_verdict: "PENDING_WAVE_2"              # G1
    independent_qa_verdict: "PENDING_WAVE_2"               # G2
    sec_review: "PENDING_WAVE_2"                           # G3
  open_register_alignment:                                 # D6
    closure_report_ref: "docs/03-project-control/candidates/p0-closure-report-001.md"
    readiness_gaps_item: 4
    p0_20_seal_item: 1
    p0_20_seal_status: "OPERATOR_HOLD_IN_FORCE (PR #78)"
  authority_invariant:                                    # D7 — sealed-slot / V-020, carried verbatim in intent
    effectiveness_authority: "OPERATOR_ONLY"
    signing_authority: "OPERATOR_ONLY"
    promotion_authority: "OPERATOR_ONLY"
    human_gov_slot_ref: "docs/03-project-control/candidates/secb-gov-001-human-gov-decision-001.yaml"
    human_gov_slot_state: "PENDING_HUMAN_GOV / producer_may_fill: false / codex_may_activate: false"
    llm_is_approving_authority: false                      # no Claude, Codex, or any LLM approves (V-020)
  approved_runtime_deployments: []
  proposed_runtime_deployments:
    - "runtime_deployment_codex_local_candidate"
    - "runtime_deployment_claude_code_local_2_1_139_candidate"
  approved_agents: []
  proposed_agent_registrations:
    - "docs/03-project-control/candidates/agents/codex-p0-08.agent-registration.yaml"
    - "docs/03-project-control/candidates/agents/claude-p0-15a.agent-registration.yaml"
  approved_models: []
  approved_tools: []
  approved_mcp_methods: []
  approved_skills: []
  evidence_root: "C:/laragon/www/SecB-evidence/p0-wave-1"
  evidence_destination_status: "PROPOSED_NOT_PROVISIONED"
  memory_policy:
    project_memory: false
    cross_project_publication: false
  release_authority: "HUMAN_GOV_REQUIRED"
  integration_authority: "SEPARATE_HUMAN_AUTHORIZATION_REQUIRED"
  data_residency: ["LOCAL_MACHINE_ONLY"]
  provider_transport_policy: "ALLOW_APPROVED_PROVIDER_CONTROL_PLANE_ONLY"
  agent_tool_network_policy: "DENY_ALL"
  credential_policy: "TEMPORARY_PROVIDER_AUTH_ONLY_NO_AGENT_SECRET_ACCESS"
  retention_policy: "PROPOSED_30_DAYS_PENDING_GOV"
  required_exit_gates: ["G0", "G1", "G2", "G3", "G4", "G5", "G7", "G8"]
  activation_restrictions:
    - "No direct mutation of main."
    - "No remote configuration, push, publication, deployment, or activation."
    - "No MCP, A2A, browser, memory, knowledge promotion, or skill publication."
    - "Producer work is limited to authorized sibling worktrees and exact write sets."
  revocation_policy:                                       # D2 — was entirely missing in v2-r2
    revocation_authority: "OPERATOR_ONLY"
    demotion_authority: "OPERATOR_ONLY"
    mechanism: "governed decision per governing_lifecycle_policy (G8): revert-by-new-record, never history rewrite; pin-to-last-accepted-baseline (c2ec645 G4 anchor)"
    agent_role: "RECOMMEND_ONLY"
  expiry_policy: "SET_AT_SIGNING_BY_OPERATOR"              # D5
  effective_from: null                                    # UNCHANGED — operator sets at signing
  expires_at: null                                        # UNCHANGED — operator sets at signing per expiry_policy
  approvals: []                                           # UNCHANGED — operator populates at signing
```

---

## 6. What this record does NOT do

- Does **not** close G7 (closure = the operator's Wave-3 signing + effectiveness
  declaration; this is the draft half only).
- Does **not** sign, populate owners/approvals, or set `effective_from`.
- Does **not** overwrite `secb-local-v2-r2.project-contract.yaml` — extend-only
  supersede-by-reference; v2-r2 stays byte-unchanged on main.
- Does **not** emit a standalone `secb-local-v2-r3.project-contract.yaml` file
  (deliberately — see §5 note; avoids a parallel contract file claiming a status
  it lacks).
- Does **not** adopt the G8 policy, accept the G4 SHA, or return any Wave-2
  verdict — it only references them.
- Does **not** touch the P0-20 decision packet, the operator HOLD, the sealed
  human-GOV slot, `contracts/` schemas, or ADR-0015 R5; does **not** pre-fill any
  decision/approval field (V-020).
- Changes **zero** files under `src/`, `contracts/`, `tools/`, or `tests/`.

---

## 7. Advisory status fields

```yaml
truth_status: verified_true        # G7 quotes read from both on-main reviews; v2-r2 fields, G4 SHA/tree, G8 + G5 refs, and schema divergence all checked first-hand
authority_status: execution_requires_operator   # signing/effectiveness is OPERATOR_ONLY; this draft has no force
implementation_status: partial     # draft half complete; signing + effectiveness (owners/approvals/effective_from) remain operator Wave-3 acts
risk_class: medium                 # per the plan's G7 card; docs-only draft, but it is the boundary a high-risk promotion would bind to
```

## 8. Self-certification

```yaml
self_certification:
  agent_id: claude-cortex-w1c-contract-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Certified: this v2-r3 Project Contract draft refresh is complete as an advisory
> work product, source-bound to the exact G7 complaint in both NOT_READY
> readiness reviews, refreshing (not overwriting) the existing
> `secb-local-v2-r2.project-contract.yaml`, bound to the G4 baseline
> `c2ec6458b60ded0a93d74e717cd7816f55834f01`, and referencing the G8 lifecycle
> policy + G5/Wave-2 evidence chain. It carries no execution or approval
> authority; G7 closes only when the operator signs and declares the contract
> effective in Wave 3.
