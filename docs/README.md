# SecB Documentation Index

Two controlled documentation packs coexist in this tree:

- **Governed Operating Model v0.1** (`SECB-GOV-001`, sections `10`–`17` + ADR 0005–0007) — DRAFT_FOR_IMPLEMENTATION_REVIEW; imported 2026-07-19, see [import map](source/om-v0.1/import-map.yaml).
- **Phase 0 operating constitution** (legacy sections `00`–`09` + ADR 0001–0004) — the currently pinned baseline; retire only by governed decision.

Where both packs cover a topic, the operating-model document is the intended successor; until acceptance, the legacy document remains authoritative.

## 00 — Governance (shared)

- [SECB-GOV-001 — Governed Operating Model](00-governance/SECB-GOV-001.md) *(v0.1 controlling document, DRAFT)*
- [Governing principles](00-governance/governing-principles.md) *(v0.1)*
- [Decision rights and authority](00-governance/decision-rights.md) *(v0.1)*
- [System-of-record boundaries](00-governance/system-of-record-boundaries.md) *(updated to v0.1)*
- [Agents instructions — v0.1 candidate](00-governance/agents-instructions-om-v0.1-candidate.md) *(NON-ACTIVE: candidate replacement for root `AGENTS.md`; adoption is an operator/GOV decision)*
- [Governance baseline](00-governance/governance-baseline.md) *(legacy)*
- [Authority and risk model](00-governance/authority-and-risk-model.md) *(legacy)*

## Governed Operating Model v0.1

### 10 — Platform and product

- [Target platform architecture](10-platform/01-target-platform-architecture.md)
- [Product operating model](10-platform/02-product-operating-model.md)
- [Module catalog](10-platform/03-module-catalog.md)

### 11 — Agents and harnesses

- [Roles and separation of duties](11-agents/01-roles-and-separation-of-duties.md)
- [Harness registry](11-agents/02-harness-registry.md)
- [Harness routing](11-agents/03-harness-routing.md)
- [Dynamic team topology](11-agents/04-dynamic-team-topology.md)

### 12 — Execution

- [Goal system](12-execution/01-goal-system.md)
- [Schedule and cadence](12-execution/02-schedule-and-cadence.md)
- [Universal delivery loop](12-execution/03-universal-delivery-loop.md)
- [Failure-to-capability loop](12-execution/04-failure-to-capability-loop.md)
- [Work package lifecycle](12-execution/05-work-package-lifecycle.md)
- [Parallel execution](12-execution/06-parallel-execution.md)
- [Context and handoff](12-execution/07-context-and-handoff.md)
- [bOPEN Engineering Loop](12-execution/08-bopen-engineering-loop.md)
- [Engineering Loop Specification](12-execution/ENGINEERING-LOOP.md)

### 13 — Skills

- [SecB skill set](13-skills/01-skill-set.md)
- [Skill lifecycle](13-skills/02-skill-lifecycle.md)
- [Harness compatibility](13-skills/03-harness-compatibility.md)

### 14 — Delivery

- [Module allocation](14-delivery/01-module-allocation.md)
- [Delivery roadmap](14-delivery/02-delivery-roadmap.md)
- [Exit gates](14-delivery/03-exit-gates.md)
- [Release and integration](14-delivery/04-release-and-integration.md)

### 15 — Knowledge and evidence

- [Seven-ledger model](15-knowledge/01-seven-ledger-model.md)
- [Evidence → Knowledge → Skill](15-knowledge/02-evidence-knowledge-skill.md)
- [Memory and context federation](15-knowledge/03-memory-and-context.md)

### 16 — Security

- [Credential handling](16-security/01-credential-handling.md)
- [Risk and mutation classes](16-security/02-risk-and-mutation-classes.md)
- [Agentic threat model](16-security/03-agentic-threat-model.md)

### 17 — Operations

- [Live operations](17-operations/01-live-operations.md)
- [KPIs and scorecards](17-operations/02-kpis-and-scorecards.md)

## Legacy Phase 0 constitution

### 01 — Architecture

- [Canonical entity model](01-architecture/canonical-entity-model.md)
- [Project profiles](01-architecture/project-profiles.md)
- [Target architecture](01-architecture/target-architecture.md)

### 02 — Operating model

- [Agent team and separation of duties](02-operating-model/agent-team-and-sod.md)
- [Context receipt and handoff](02-operating-model/context-receipt-and-handoff.md)
- [State machines](02-operating-model/state-machines.md)
- [Universal work lifecycle](02-operating-model/universal-work-lifecycle.md)

### 03 — Project control

- [Project contract](03-project-control/project-contract.md)
- [Work package contract](03-project-control/work-package-contract.md)
- [Self-pilot](03-project-control/self-pilot.md)
- [Agent Registry, MCP Gateway, CLI and Live Operations PRD](03-project-control/candidates/secb-agent-registry-mcp-gateway-prd-001.md) *(DRAFT / NOT EFFECTIVE)*
- [SkillsHub intake, evaluation, promotion and distribution PRD](03-project-control/candidates/secb-skillshub-prd-001.md) *(DRAFT / NOT EFFECTIVE / DEFECT-REGISTERED — current-state discovery, not a settled requirements candidate)*
- [SkillsHub PRD open defect register](03-project-control/candidates/skillshub-prd-defect-register-001.md) *(DRAFT / NOT EFFECTIVE / OPEN)*
- [SkillsHub DEF-C3 SEC decision request](03-project-control/candidates/skillshub-def-c3-sec-decision-001.md) *(DRAFT / AWAITING SEC RULING)*
- Candidates and effective records: [`03-project-control/`](03-project-control/)

### 04 — Assurance

- [Evidence and provenance](04-assurance/evidence-and-provenance.md)
- [Exit gates](04-assurance/exit-gates.md)
- [Verification matrix](04-assurance/verification-matrix.md)

### 05 — Live operations

- [Event envelope](05-live-operations/event-envelope.md)
- [Intervention and replay](05-live-operations/intervention-and-replay.md)
- [Live operations architecture](05-live-operations/live-operations-architecture.md)

### 06 — Intelligence

- [Knowledge and code graphs](06-intelligence/knowledge-code-graphs.md)
- [Memory and knowledge](06-intelligence/memory-and-knowledge.md)

### 07 — Capabilities

- [MCP and A2A governance](07-capabilities/mcp-a2a-governance.md)
- [SkillsHub lifecycle](07-capabilities/skillshub-lifecycle.md)
- [Superpowers intake](07-capabilities/superpowers-intake.md)

### 08 — Security

- [Data privacy and retention](08-security/data-privacy-retention.md)
- [Threat model](08-security/threat-model.md)

### 09 — Delivery

- [Backlog P0](09-delivery/backlog-p0.md)
- [Codex/Claude git worktree build plan](09-delivery/codex-claude-git-worktree-build-plan.md)
- [Definition of done](09-delivery/definition-of-done.md)
- [Implementation roadmap](09-delivery/implementation-roadmap.md)

## ADRs (single continuing series)

Legacy 0001/0002 each have two files (pre-existing duplication, retained unchanged):

- [ADR-0001: Control plane and bootstrap](adr/0001-control-plane-and-bootstrap.md) / [ADR-0001: SecB as control plane](adr/0001-secb-as-control-plane.md)
- [ADR-0002: Authority and local durable ledger](adr/0002-authority-and-local-durable-ledger.md) / [ADR-0002: Runtime, not authority](adr/0002-runtime-not-authority.md)
- [ADR-0003: Seven-ledger model](adr/0003-seven-ledger-model.md)
- [ADR-0004: Read-only self-pilot](adr/0004-read-only-self-pilot.md)
- [ADR-0005: Failure is a learning transition](adr/0005-failure-is-a-learning-transition.md) *(v0.1)*
- [ADR-0006: Harness-neutral authority](adr/0006-harness-neutral-authority.md) *(v0.1)*
- [ADR-0007: Serialized integration](adr/0007-serialized-integration.md) *(v0.1)*
- [ADR-0008: Root AGENTS adoption](adr/0008-root-agents-adoption.md) *(PROPOSED / NOT DECIDED)*
- [ADR-0009: MCP upstream fronting](adr/0009-mcp-upstream-fronting.md) *(PROPOSED / NOT DECIDED)*
- [ADR-0010: Canonical five-layer registry persistence](adr/0010-canonical-five-layer-registry-persistence.md) *(PROPOSED / NOT DECIDED)*
- [ADR-0011: Single MCP invocation enforcement pipeline](adr/0011-single-mcp-invocation-enforcement-pipeline.md) *(PROPOSED / NOT DECIDED)*
- [ADR-0012: Authenticated local stdio-to-IPC bridge](adr/0012-authenticated-local-stdio-ipc-bridge.md) *(PROPOSED / NOT DECIDED)*
- [ADR-0013: Skill manifest convergence by trust tier](adr/0013-skill-manifest-trust-tier-split.md) *(ACCEPTED — DRAFT / NOT EFFECTIVE)*

## Operating model docs at docs root

- [SECB-OPERATING-MODEL-001](SECB-OPERATING-MODEL-001.md) *(legacy)*
- [SECB-OPERATING-MODEL-P0-001](SECB-OPERATING-MODEL-P0-001.md) *(legacy)*
- [Source traceability](SOURCE-TRACEABILITY.md) *(updated to v0.1)*

## Templates

Machine-readable templates are in [`templates/`](templates/) — v0.1 updated: agent-profile, context-receipt, evidence-envelope, failure-evidence-envelope, goal, handoff-envelope, harness-profile, knowledge-candidate, module-manifest, project-contract, research-task, schedule, session, skill-candidate, work-package.

## Pack provenance

- v0.1 pack metadata: [`source/om-v0.1/`](source/om-v0.1/) — [PACK-README](source/om-v0.1/PACK-README.md), [VALIDATION.json](source/om-v0.1/VALIDATION.json), [MANIFEST.sha256](source/om-v0.1/MANIFEST.sha256), [import-map.yaml](source/om-v0.1/import-map.yaml)
- Legacy pack source digest: [`source/ASSESSMENT.sha256`](source/ASSESSMENT.sha256)
