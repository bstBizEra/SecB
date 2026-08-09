# SecB Local Build Rules

**Document ID:** SECB-AGENTS-LOCAL-001
**Version:** 0.3.0-alpha.0
**Effective scope:** Local repository development only
**External publication authority:** Not granted

## Mission

Build SecB as a governed agent work and learning control plane. SecB assigns and verifies authority; it is not a super-agent and runtime product names never imply authority.

## Working rules

1. Follow the implementation sequence in `docs/SECB-OPERATING-MODEL-P0-001.md`.
2. Use bounded slices with explicit acceptance checks and a clean Git baseline.
3. Keep verified facts, assumptions, recommendations, decisions, and policies distinct.
4. Treat events, evidence, knowledge, memory, skills, and authority as separate objects.
5. Do not configure, push, publish, deploy, or activate a remote without explicit user authorization.
6. Do not claim completion until checks run after the final change and their exact results are reported.
7. Preserve separation between producer verification, independent review, QA, and governance acceptance.
8. Unknown identity, scope, transition, evidence, or authority fails closed.

## Current bootstrap boundary

The Phase 0 artifacts are implementation candidates. They define future operational controls but do not self-authorize production, remote publication, mutation outside this repository, knowledge promotion, or skill publication.

## Documentation control amendment — 2026-07-17

The controlled documentation tree is rooted at [`docs/`](docs/). Before beginning a bounded slice, read the minimum sufficient chain in this order:

1. [`docs/README.md`](docs/README.md)
2. [`docs/00-governance/governance-baseline.md`](docs/00-governance/governance-baseline.md)
3. [`docs/00-governance/SECB-GOV-SURFACE-001.md`](docs/00-governance/SECB-GOV-SURFACE-001.md) (Governance Surface & High-Logic Agent Protocols)
4. [`docs/02-operating-model/universal-work-lifecycle.md`](docs/02-operating-model/universal-work-lifecycle.md)
5. [`docs/02-operating-model/agent-team-and-sod.md`](docs/02-operating-model/agent-team-and-sod.md)
6. [`docs/03-project-control/project-contract.md`](docs/03-project-control/project-contract.md)
7. [`docs/03-project-control/work-package-contract.md`](docs/03-project-control/work-package-contract.md)
8. [`docs/12-execution/08-bopen-engineering-loop.md`](docs/12-execution/08-bopen-engineering-loop.md) (Agentic Engineering Loop and EBIV)
9. Documents and templates directly referenced by the active bounded slice.

Changes under `docs/**` also follow [`docs/AGENTS.md`](docs/AGENTS.md). The repository-level [`MANIFEST.json`](MANIFEST.json) is the canonical local build inventory; [`docs/MANIFEST.json`](docs/MANIFEST.json) inventories the imported documentation pack.

The new documentation pack is `DRAFT / NOT EFFECTIVE`. Its presence satisfies required-reading availability but does not create an effective Project Contract, authorize a Work Package, assign a server-derived identity, accept evidence, or activate SecB. Those require their own governed records and independent decisions.

## Implementation authorization amendment — 2026-07-19

**Amendment ID:** SECB-AGENTS-AMD-002 (revision 2)
**Requested by:** Operator, 2026-07-19
**Status:** DRAFT until merged to `main` by the operator; EFFECTIVE thereafter
**Scope:** Local repository work only. This amendment extends the working rules above.

### Standing implementation authorization

For worker agents (Codex, Claude) operating in this repository:

1. **Pre-authorized implementation paths.** Bounded slices that create or modify files under `src/**`, `tests/**`, `tools/**`, and `contracts/**` are pre-authorized and need no per-step operator approval, provided the slice declares its scope and acceptance checks, runs the checks after the final change with exact results reported (working rule 6), and stays on a non-`main` branch.
2. **Manifest maintenance right.** Agents must keep [`MANIFEST.json`](MANIFEST.json) accurate for files they add, rename, or delete within a slice, updating it in the same commit. Updates to [`docs/MANIFEST.json`](docs/MANIFEST.json) are likewise authorized when a slice legitimately changes `docs/**` under [`docs/AGENTS.md`](docs/AGENTS.md).

### Advise-and-proceed decision rule

Agents do not halt work to wait for human GOV, except at the retained hard gates below.

1. At a decision point inside a pre-authorized slice, the agent (a) records an advisory decision — options considered, rationale, risk class, truth status — in the commit message or slice notes, (b) implements the recommended option immediately, and (c) marks the decision for asynchronous GOV ratification.
2. Ratification happens at merge review: the operator-only merge to `main` ratifies the advisory decisions carried by the branch. Rejecting one is ordinary revert/rework, not an incident.
3. For matters that still require GOV/SEC pre-approval (R3/R4, authority model, separation of duties, release gates, evidence acceptance, memory admission, skill promotion), agents do not activate anything — but they **do not idle either**: they prepare the candidate implementation and an advisory packet on a branch, so the human decision arrives with the work already done and only ratification pending.
4. Working rule 8 (fail closed) is narrowed to: unknown identity, authority mutation, evidence acceptance, remote/external actions, and security-boundary changes. All other ambiguity is resolved by advise-and-proceed with the smallest reversible step.

### Retained hard gates (unchanged)

- No remote configure, push, publish, deploy, or activation without explicit operator authorization (working rule 5).
- No agent merges to `main`; no self-declared completion or production status.
- R3/R4 and authority-affecting changes activate only after the reviews required by [`docs/AGENTS.md`](docs/AGENTS.md) — but candidate preparation for them is authorized per the advise-and-proceed rule.
- The Phase 0 documentation pack remains `DRAFT / NOT EFFECTIVE` per the bootstrap boundary above.

## Skills registry amendment — 2026-07-22

The repository carries an agent skills registry at [`.agents/`](.agents/) — the
**SecB Architecture Skills Pack v0.1** (`SECB-ARCH-SKILLS-PACK-001`), committed by
operator order (PR #127). Both agent lanes (Claude Code, Codex, and any Agent
Skills-compatible client) discover skills there.

### Registry

- **Location:** `.agents/skills/<skill-name>/` (portable `SKILL.md` + governance
  `manifest.yaml` + references/assets/evals per skill)
- **Catalog:** [`.agents/docs/skill-catalog.md`](.agents/docs/skill-catalog.md);
  pack rules: [`.agents/AGENTS.md`](.agents/AGENTS.md)
- **Integrity:** [`.agents/MANIFEST.sha256`](.agents/MANIFEST.sha256) (verify:
  `python .agents/scripts/validate_pack.py`); repo `MANIFEST.json` anchors the
  pack roots
- **Status:** every skill is **CANDIDATE / NOT EFFECTIVE**, mutation-class **M0**
  (analyze/model/recommend/document only)

### Registered skills (23)

ai-agent-system-architecture · api-integration-architecture ·
arc42-architecture-documentation · architecture-decision-record ·
architecture-evidence-handoff · architecture-fitness-functions ·
architecture-intake-framing · architecture-options-tradeoffs ·
architecture-review-conformance · architecture-roadmap-work-packages ·
c4-architecture-modeling · current-state-architecture-discovery ·
data-architecture-governance · deployment-environment-architecture ·
domain-bounded-context-design · event-driven-architecture ·
**maker-evidence-audit** · mcp-a2a-federation-architecture ·
quality-attribute-scenarios · runtime-resilience-observability ·
security-threat-modeling · stakeholder-capability-mapping ·
system-context-boundaries

`maker-evidence-audit` (`SECB-ARCH-023`, pack 0.2.0, 2026-08-10) is adapted from
the bOPEN pack skill of the same name. It audits a maker's own evidence
adversarially before the commit that makes it a candidate, and its boundary is
the one that matters here: it produces **findings, never a verdict**, and a
subagent sharing the maker's engine does not satisfy the Maker ≠ Verifier rule in
[`08-bopen-engineering-loop.md`](docs/12-execution/08-bopen-engineering-loop.md)
§3.1. Its citations were re-pointed during adaptation, because the bOPEN original
cites EBIV §3/§8 and loop §5 — sections SecB's own copy does not contain.

### Governing rules (additive to all rules above)

1. Skill output is a **candidate** — the pack's boundary (skill output →
   architecture candidate → independent review → authorized decision →
   separately authorized implementation) composes with the working rules and
   V-020; no skill confers approval, mutation, integration, deployment, or
   activation authority.
2. Making any skill EFFECTIVE (adoption/publication) is a separate
   operator/SEC-GOV act — committing the pack did not adopt it (tracker line
   2026-07-22, `claude-coordinator-skills-pack-01`).
3. Skill additions or revisions follow extend-only discipline: new pack version,
   re-verified `MANIFEST.sha256`, registry amendment here, operator-ratified PR.
4. The MOD-SKILL governed intake/promotion/revocation primitives
   (`skill-candidate-registry`, `skill-promotion-ledger`,
   `skill-revocation-ledger`) remain the eventual runtime registry; this
   file-based registry is the bootstrap surface until those are wired
   (SEC/GOV-gated).

## Engineering loop binding amendment — 2026-08-08

**Amendment ID:** SECB-AGENTS-AMD-004
**Requested by:** Operator, 2026-08-08
**Status:** DRAFT until merged to `main` by the operator; EFFECTIVE thereafter
**Scope:** Local repository work only. This amendment extends the working rules above.

> **Errata, 2026-08-08.** This amendment first landed numbered AMD-003. That
> number was already taken by an exact-SHA delegated-merge policy candidate
> (candidate commit `d57fdd6c`) which had by then passed independent review
> (`SECB-AGENTS-AMD-003-REV-002`), QA (`QA_PASS_WITH_NOTES_CANDIDATE_ONLY`) and
> SEC (`SEC_PASS_TECHNICAL_CANDIDATE`), and was awaiting only human GOV
> disposition. AMD-003 looked free because it was checked against `main`, and
> the incumbent lived on unmerged branches — a claim about a ref mistaken for a
> claim about the repository. This one was renumbered rather than the incumbent:
> three independent review records bind to AMD-003 by exact ID and SHA, and
> invalidating them to keep a number would be the wrong trade. AMD-003 remains
> reserved for that candidate.

### Loop binding

Bounded slices under the pre-authorized implementation paths of AMD-002 §1 execute under [`BOPEN-ENG-LOOP-001`](docs/12-execution/08-bopen-engineering-loop.md): `GOAL` → `PLAN` → `ACT` → `VERIFY` → `DONE`. A slice that skips a stage has not run the loop, whatever its result.

### Panel obligation

The VERIFY stage runs the three lenses of [`BOPEN-ENG-PANEL-001`](docs/12-execution/09-panel-review-and-rubric.md) — Staff Architect, Security & Edge-Case, Performance & QA — and records the rubric score in the slice notes.

Efficiency obligations and their two bounding invariants are in [`BOPEN-ENG-EFFICIENCY-001`](docs/12-execution/10-inner-loop-efficiency.md); baseline skills and ADR obligations are in [`BOPEN-ENG-CAP-001`](docs/12-execution/11-agent-capability-baseline.md).

### Non-authority clause

A rubric score, a panel verdict, and an ADR draft create no authority. They do not merge, approve, activate, accept evidence, promote a skill, or admit a memory. A slice scoring 100 is a slice awaiting operator merge review.

The retained hard gates of AMD-002 are unchanged and are not restated here. Where this amendment and a retained hard gate appear to conflict, the gate governs.

### What this amendment does not do

It does not activate the loop documents. They remain `DRAFT / NOT EFFECTIVE` under the bootstrap boundary until human GOV approves them. This amendment binds worker-agent behaviour to a specification; it does not confer effectiveness on the specification.

## Evidence-backed governance candidate registration — 2026-08-10

**Amendment ID:** SECB-AGENTS-AMD-005
**Requested by:** Operator, 2026-08-10
**Status:** DRAFT until merged to `main` by the operator; EFFECTIVE thereafter
**Scope:** Registration only. This amendment grants nothing and narrows nothing.

The repository carries a governance design candidate at
[`BOPEN-GOV-EBAG-001`](docs/12-execution/12-evidence-backed-agent-governance.md) —
*Evidence-Backed Agent Governance*, from an operator-supplied design of
2026-08-10. It proposes replacing file-based protection with authority-delta
classification (G0–G5), so that changes an agent can prove stay inside an already
granted delegation envelope merge on evidence and independent ballots rather than
on a repeated human approval.

### Why it is registered rather than bound

`SECB-AGENTS-AMD-004` bound worker-agent behaviour to the engineering loop
because that specification constrains how agents work. This one changes **who may
approve**, and a worker agent wrote it. Binding it here would be a self-grant:
the document's own §1 records that, and the source design says the same thing in
its closing paragraph. The candidate therefore stands registered and inert.

Two findings from preparing it are worth carrying at this level, because both
change what the proposal means for this repository:

1. **The design's premise does not hold for SecB.** It reasons about a pull
   request touching `ci.yml`, a policy bundle, an ADR and a classifier. This
   repository tracks zero files under `.github/`, has no policy engine and no
   classifier. Sections of the design that harden a CI pipeline protect nothing
   here until such a pipeline exists.
2. **The primitives, however, largely do exist.** Eight of the eleven named
   mechanisms are delivered modules — approval binding, SoD rules, the N-5
   independent-review/governance gate, the delegation gate, escalation routing,
   evidence envelopes, hash-chained ledgers, and drift comparison — and all eight
   are now reachable from `src/index.mjs`. What SecB lacks is not primitives but
   a policy engine binding them, a surface to run them on, a signing identity,
   and an external trust anchor.

### Retained hard gates are unchanged

The gates of `SECB-AGENTS-AMD-002` stand exactly as written. In particular
`HUMAN_REQUIRED` is not retired, no change type is reclassified, no authority
ladder exists, and working rule 5 continues to forbid configuring the external
trusted verifier the design depends on. Where the candidate and a retained hard
gate appear to conflict, the gate governs.

### What would change this

A human GOV act — the Genesis Ratification of §12 — and nothing else. Not a
rubric score, not a unanimous agent council, not this amendment. The candidate's
own §11 lists seven blocked actions; a worker agent may prepare implementation
candidates for them on a branch under AMD-002 §3 and may activate none of them.
