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
3. [`docs/02-operating-model/universal-work-lifecycle.md`](docs/02-operating-model/universal-work-lifecycle.md)
4. [`docs/02-operating-model/agent-team-and-sod.md`](docs/02-operating-model/agent-team-and-sod.md)
5. [`docs/03-project-control/project-contract.md`](docs/03-project-control/project-contract.md)
6. [`docs/03-project-control/work-package-contract.md`](docs/03-project-control/work-package-contract.md)
7. Documents and templates directly referenced by the active bounded slice.

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

### Registered skills (22)

ai-agent-system-architecture · api-integration-architecture ·
arc42-architecture-documentation · architecture-decision-record ·
architecture-evidence-handoff · architecture-fitness-functions ·
architecture-intake-framing · architecture-options-tradeoffs ·
architecture-review-conformance · architecture-roadmap-work-packages ·
c4-architecture-modeling · current-state-architecture-discovery ·
data-architecture-governance · deployment-environment-architecture ·
domain-bounded-context-design · event-driven-architecture ·
mcp-a2a-federation-architecture · quality-attribute-scenarios ·
runtime-resilience-observability · security-threat-modeling ·
stakeholder-capability-mapping · system-context-boundaries

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

## Scoped integration-principal amendment — 2026-08-05

**Amendment ID:** SECB-AGENTS-AMD-003

**Requested by:** Human operator, 2026-08-05

**Status:** DRAFT until independently reviewed and merged to `main` by a human
operator under the rules effective before this amendment

**Scope:** Prospective repository integration only; production/environment
activation is excluded and requires its own A4/A5 authority path

The normative contract is
[`docs/00-governance/integration-principal-control-contract.md`](docs/00-governance/integration-principal-control-contract.md).
Once this amendment and that contract are adopted, a non-human
`INTEGRATION_PRINCIPAL` may perform only the closed actions
`PUSH_CANDIDATE_BRANCH`, `OPEN_PR`, `UPDATE_PR`, and
`MERGE_EXACT_HEAD_TO_MAIN`, and only when every condition below is satisfied:

1. An external policy decision point authenticates a server-derived subject
   identity and a trusted human issuer; the actor may not verify itself.
2. A signed, single-use, expiring and revocable operation grant binds issuer,
   subject, A4 ceiling, Project Contract, Work Package, repository, one closed
   action, its exact mutation object and expected state, candidate commit/tree,
   nonce, idempotency key, composite evidence digest, assurance records and
   per-operation human GOV disposition.
3. Required independent REV, QA and SEC records are durable and bind the exact
   candidate commit and tree; the producer may not transcribe them.
4. Evidence acceptance, GOV disposition and integration remain separate records
   and actions. Authority for one does not imply another.
5. The external policy decision point revalidates signature trust, scope,
   expiry, revocation, non-consumption, branch protection and required checks
   immediately before mutation, then applies the action-specific conditional
   mutation defined by the control contract. Unknown or changed state fails
   closed.
6. Direct push to `main` or another protected ref is always prohibited. Merge
   uses exact-head protection, matches the reviewed result tree and preserves
   the reviewed commit as an ancestor. Squash and rebase are prohibited.
7. A durable append-only ledger records hash-chained `PREPARED`, `COMMITTED` or
   `ABORTED` receipts, including the actual provider-observed result. Recovery
   replays the original idempotent disposition and never performs a second
   mutation; terminal states are immutable.
8. No principal may issue or approve its own grant, accept its own evidence,
   waive findings, alter separation of duties, change this authority basis, or
   declare production status. Those remain human A5 decisions and human merges.

When effective, this amendment narrowly supersedes the retained rule “No agent
merges to `main`” only for `MERGE_EXACT_HEAD_TO_MAIN` executed through the
adopted external enforcement and receipt path above. The prior prohibition
continues unchanged for every other agent, principal, path and action. A policy
document, prompt, local credential or repository write access is not the
required external enforcement path.

This amendment does not authorize its own review, merge or effectiveness. It
does not make any current skill effective and does not authorize PR #140 or any
other existing candidate retroactively. The retained human bootstrap gate
remains controlling until this amendment, ADR-0009, the control contract and
its runtime enforcement have each passed their separate human activation gates.
