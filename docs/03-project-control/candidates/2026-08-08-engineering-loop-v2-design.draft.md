# Engineering Loop v2 — Design

## Document Control

| Field | Value |
|---|---|
| Artifact ID | SECB-ENG-LOOP-V2-DESIGN |
| Version | 1.0.0-draft |
| Status | DRAFT / NOT EFFECTIVE — candidate awaiting operator ratification |
| Date | 2026-08-08 |
| Author | Claude (Motor Agent), on operator instruction |
| Applies to | `docs/12-execution/**`, `AGENTS.md`, `MANIFEST.json`, `docs/MANIFEST.json` |
| Supersedes | Nothing. This design is additive under extend-only. |

---

## 1. Purpose

Extend the SecB Agentic Engineering Loop (`BOPEN-ENG-LOOP-001`) with four mechanism
groups drawn from the *Unified Review Engineer Loop* (URE-Loop) v0.9 design paper,
and bind the resulting loop to worker-agent behaviour through a new `AGENTS.md`
amendment.

The existing loop specifies **what stages exist** (`GOAL → PLAN → ACT → VERIFY →
DONE`). It does not specify how VERIFY is conducted beyond running the automated
suite, what efficiency obligations agents carry, or what baseline engineering
skills are assumed. This design fills those three gaps and makes the loop
normative rather than descriptive.

---

## 2. Source and exclusions

**Source input:** *Unified Review Engineer Loop (URE-Loop)*, developer BST,
version 0.9, dated 2026-08-07. Recorded in `docs/SOURCE-TRACEABILITY.md`.

Five of the twelve URE-Loop mechanisms are **deliberately not adopted**. The
exclusion list is part of this design, not an omission from it:

| URE-Loop § | Mechanism | Why excluded |
|---|---|---|
| §4 | Continuous Skill & Memory Synthesis | Duplicates `docs/13-skills/02-skill-lifecycle.md`, which already governs skill promotion with evaluation and revocation controls. |
| §6 | Autonomous Git Lifecycle Engine | Directly contradicts retained hard gates: it has agents run `gh pr merge --squash`, push CI fixes, and auto-merge at score ≥ 85. `AGENTS.md` reserves merge to `main` and all remote action to the operator. |
| §8 | State & Telemetry Reconciliation Engine | Its third pillar auto-heals production from APM alerts, which is production activation without operator authorization. The spec/code-drift pillar is not adopted separately, to avoid importing half an engine. |
| §10 | 13-folder topology + G0–G7 stage gates | SecB already has a 18-directory controlled tree and its own gate sequence. A second gate ladder would create competing authority over the same decisions. |
| §12 | `BAL-GOV-001` ballot governance | Duplicates the existing governance decision records and operator-only merge. A ballot layer would introduce a second path to the same authority. |

**Naming:** `BOPEN-ENG-LOOP-001` remains the canonical name. "URE-Loop" is
recorded as a source, never introduced as a second loop identity, per the
`docs/AGENTS.md` rule of one authoritative definition per concept.

---

## 3. Scope

**In scope**

- `docs/12-execution/08-bopen-engineering-loop.md` — **unchanged**. Its state
  machine is the base this design extends, not revises.
- Three new documents: `09-panel-review-and-rubric.md`,
  `10-inner-loop-efficiency.md`, `11-agent-capability-baseline.md`.
- One new `AGENTS.md` amendment: `SECB-AGENTS-AMD-004`.
- Inventory and index updates: `MANIFEST.json`, `docs/MANIFEST.json`,
  `docs/README.md`, `docs/SOURCE-TRACEABILITY.md`.

**Out of scope**

- No CLI, tooling, or runtime implementation. This design produces documents and
  one amendment; nothing here executes.
- No changes to the content of existing ADRs under `docs/adr/`.
- No change to the `DRAFT / NOT EFFECTIVE` status of the Phase 0 documentation
  pack. The new documents inherit that status.

---

## 4. Document 09 — Panel Review & Rubric (`BOPEN-ENG-PANEL-001`)

Extends the VERIFY stage defined in `08-bopen-engineering-loop.md` §3.4.

### 4.1 Three review lenses

| Lens | Examines |
|---|---|
| Staff Architect | Module boundaries, API compatibility, query efficiency, extensibility |
| Security & Edge-Case | Input bounds, injection, null and boundary handling, concurrency, failure modes |
| Performance & QA | Coverage, benchmark regression, execution latency |

All three lenses are seated together by this design.

*Deviation from source, stated deliberately:* URE-Loop §9 seats lenses
incrementally, activating the Architect lens first and leaving the Security and
Performance lenses described-but-unseated. This design seats all three at once.
Rationale: no lens carries authority, so incremental seating buys no safety, and
a panel advertised as three-lens while missing its security lens produces false
assurance — worse than no panel.

### 4.2 Authority boundaries

Every lens declares `execution_authority: false` and `approval_authority: false`.
Adapted from URE-Loop §9's four boundaries:

1. **Not a verifier seat.** `BOPEN-GOV-EBIV-001` governs independent
   verification. A lens informs the verifier; it does not replace one.
2. **Not an identity.** Lenses hold zero entries in the agent identity register.
3. **Not an authority over ADRs.** A lens does not supersede a human ADR
   disposition.
4. **Not a quorum contribution.** A lens cannot count toward any release quorum.

### 4.3 Rubric

```text
Score = 0.30 (Functional Correctness)
      + 0.25 (System Architecture & Scalability)
      + 0.20 (Security & Failure Safety)
      + 0.15 (Code Cleanliness & Documentation)
      + 0.10 (Execution Speed & Test Latency)
```

The weights are taken unchanged from URE-Loop §3. **The meaning of the score is
changed.** In the source, the score is a merge gate. Here it is advisory: it is
recorded in the slice notes or advisory packet, and it merges nothing, approves
nothing, and activates nothing.

Bands are routing hints for the agent, not authorizations:

| Band | Source behaviour | SecB behaviour |
|---|---|---|
| ≥ 85 | Auto-merge to `main` | Ready to propose for operator merge review; no further self-correction required |
| 60–84 | Targeted self-correction | Mandatory return to PLAN/ACT before proposing merge |
| < 60 | Escalate to human tech lead | Produce the advisory packet, set the slice disposition to `BLOCKED`, notify the operator — and continue preparing the candidate on the branch rather than idling, per the advise-and-proceed rule in `AGENTS.md` |

### 4.4 ADR interaction

Where a lens judges that a change carries an architectural trade-off, it raises
the ADR obligation defined in document 11 under "ADR obligations". The lens
does not author the disposition.

---

## 5. Document 10 — Inner-Loop Efficiency (`BOPEN-ENG-EFFICIENCY-001`)

### 5.1 Feedback latency budgets

| Tier | Scope | Budget |
|---|---|---|
| 1 | LSP diagnostics, AST lint on edit | < 100 ms |
| 2 | Selective test run over impacted modules | < 1 s |
| 3 | Panel review evaluation | < 15 s |

These are **SHOULD-level budgets, not gates**. Missing a budget is a signal to
investigate the harness, never a reason to refuse or skip a check.

### 5.2 Token cost layers

Adopted from URE-Loop §5: static KV prefix ordering, Tree-sitter AST pruning,
phase-based model cascading, subagent context isolation, and search/replace block
diffs.

### 5.3 Two SecB invariants added to the source

The source treats cost reduction as unconditionally good. In a governed control
plane it is not, so this design adds two constraints that URE-Loop does not
contain:

1. **Optimization must not reduce evidence.** The VERIFY stage always runs
   `npm run validate` and `npm test` in full. Model cascading, AST pruning, and
   selective test execution apply to PLAN and ACT only. No evidence-producing run
   is ever abbreviated, sampled, or served from cache.
2. **Isolation must not erase provenance.** A subagent returning a distilled
   summary must carry source, timestamp, and agent ID in that summary. Discarding
   a subagent's raw history is permitted; discarding its provenance is not.

---

## 6. Document 11 — Capability Baseline & ADR Obligations (`BOPEN-ENG-CAP-001`)

### 6.1 Eight baseline skills

Adopted from URE-Loop §11: requirements traceability, context engineering, TDD
contract, systematic debugging, verification before completion, security and
authorization review, agent orchestration with subagent isolation, and safe
integration engineering.

Each is **mapped to the existing SecB definition rather than redefined**, so that
no concept acquires a second authoritative statement:

| Skill | Authoritative definition lives in |
|---|---|
| Verification before completion | `AGENTS.md` working rule 6 |
| Requirements traceability | `docs/03-project-control/work-package-contract.md` |
| Context engineering, systematic debugging | `docs/00-governance/SECB-GOV-SURFACE-001.md` §2–§3 |
| Security and authorization review | `docs/00-governance/authority-and-risk-model.md` |
| Agent orchestration | `docs/12-execution/06-parallel-execution.md`, `07-context-and-handoff.md` |

Document 11 links to these; it does not restate them.

### 6.2 Nine-layer capability matrix

Adopted from URE-Loop §11 unchanged: Governance, Context, Design, Execution,
Diagnosis, Coordination, Integration, Assurance, Delivery.

### 6.3 ADR obligations (URE-Loop §7)

An ADR is drafted when a slice touches any of: a schema change, a new external
dependency, the authority model, or a breaking contract.

- Drafts go to the **existing** `docs/adr/` directory under its established
  `NNNN-slug.md` convention. No new ADR location is created.
- A drafted ADR enters at status `Proposed`.
- Only an operator merge to `main` moves an ADR to `Accepted`. An agent never
  writes `Accepted`.

---

## 7. `AGENTS.md` — `SECB-AGENTS-AMD-004`

Appended as a new section, following the shape of `SECB-AGENTS-AMD-002`. No
existing text is modified.

Contents:

1. **Loop binding.** Bounded slices under the pre-authorized implementation paths
   execute under `BOPEN-ENG-LOOP-001` (`GOAL → PLAN → ACT → VERIFY → DONE`).
2. **Panel obligation.** The VERIFY stage runs the three lenses of
   `BOPEN-ENG-PANEL-001`, and the rubric score is recorded in the slice notes.
3. **Non-authority clause.** A rubric score, a panel verdict, and an ADR draft
   create no authority. They do not merge, approve, activate, accept evidence, or
   promote anything. The retained hard gates are unchanged and are restated by
   reference, not rewritten.
4. **Required reading.** `docs/12-execution/08-bopen-engineering-loop.md` is
   inserted into the documentation-control chain as the new item 8, immediately
   ahead of "Documents and templates directly referenced by the active bounded
   slice", which becomes item 9. The chain therefore grows from eight entries to
   nine; no existing entry changes its text or relative order.

**Status:** `DRAFT until merged to main by the operator; EFFECTIVE thereafter` —
the same status line AMD-002 carries.

**Version:** `AGENTS.md` moves from `0.3.0-alpha.0` to `0.4.0-alpha.0`, because
the amendment adds a normative obligation rather than clarifying an existing one.

---

## 8. Inventory and index changes

| File | Change |
|---|---|
| `MANIFEST.json` | Add the three new `docs/12-execution/` paths |
| `docs/MANIFEST.json` | Add the same three paths; raise `file_count_excluding_manifests` from 74 to 77 |
| `docs/README.md` | Add three links under the "12 — Execution" heading |
| `docs/SOURCE-TRACEABILITY.md` | Record URE-Loop v0.9 as a source input, together with the §2 exclusion table and its reasons |

Both manifests keep their existing ordering convention: entries are appended in
slice clusters, not sorted alphabetically.

---

## 9. Acceptance checks

The slice is complete when all of the following hold and their exact output is
reported:

1. `npm test` runs after the final change. Expected: the two known-red boundary
   digest guards in `tests/knowledge-claim-service.test.mjs` and
   `tests/memory-gateway-service.test.mjs` remain the only failures, already
   queued as of commit `f161746`. Any third failure blocks the slice.
2. `node tools/validate-foundation.mjs` passes, including `manifest.complete` and
   `docs-manifest.count`.
3. Every path added to either manifest exists on disk and is tracked in git.
4. `08-bopen-engineering-loop.md` is byte-identical to its pre-slice content.

---

## 10. Risks and known conditions

1. **Untracked prerequisites.** `docs/12-execution/08-bopen-engineering-loop.md`,
   `ENGINEERING-LOOP.md`, and `docs/00-governance/SECB-GOV-SURFACE-001.md` are
   referenced by both tracked manifests but are not yet tracked in git. They must
   enter the repository in the same commit as this work, or the inventory points
   at files with no history.
2. **Inherited draft status.** The new documents are `DRAFT / NOT EFFECTIVE`
   under the Phase 0 bootstrap boundary. Their existence satisfies required-reading
   availability; it does not activate the loop.
3. **Amendment effectiveness.** `SECB-AGENTS-AMD-004` is DRAFT until the operator
   merges it. Until then the loop binding is prepared, not in force.
4. **Branch.** All work stays on `feat/secb-ruflo-command-center`. No agent merge
   to `main`.
