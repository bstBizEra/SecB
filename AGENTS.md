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
