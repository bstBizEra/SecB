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
