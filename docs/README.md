# SecB Documentation Control Center

**Version:** 0.3.0-alpha.0
**Status:** PHASE_0_CONTROL_CANDIDATE

## Canonical documents

- [Operating Model](SECB-OPERATING-MODEL-001.md) — universal lifecycle, roles, reasoning discipline, ledgers, and system boundaries.
- [Phase 0 Implementation Control](SECB-OPERATING-MODEL-P0-001.md) — bounded deliverables, validation, and exit gates.
- [ADR-0001](adr/0001-control-plane-and-bootstrap.md) — control-plane identity and constitution-first bootstrap decision.
- [`contracts/`](../contracts/) — machine-readable contract schemas.
- [`src/control/`](../src/control/) — fail-closed state-transition enforcement.
- [`src/contracts/`](../src/contracts/) — executable JSON Schema validation.
- [`src/ledger/`](../src/ledger/) — local append-only event and evidence ledger.
- [ADR-0002](adr/0002-authority-and-local-durable-ledger.md) — scoped authority and durable ledger decision.

## Current disposition

This repository is local-only. Phase 0 artifacts are reviewable implementation candidates. They do not grant remote publication, deployment, production activation, or self-approval authority.

## Draft governance and architecture pack

The following imported documents are controlled candidates. They are available for required reading and implementation alignment but remain `DRAFT / NOT EFFECTIVE` until independently reviewed and accepted.

### Governance

- [Governance baseline](00-governance/governance-baseline.md)
- [Authority and risk model](00-governance/authority-and-risk-model.md)
- [System-of-record boundaries](00-governance/system-of-record-boundaries.md)

### Architecture and operating model

- [Target architecture](01-architecture/target-architecture.md)
- [Canonical entity model](01-architecture/canonical-entity-model.md)
- [Project profiles](01-architecture/project-profiles.md)
- [Universal work lifecycle](02-operating-model/universal-work-lifecycle.md)
- [Agent team and separation of duties](02-operating-model/agent-team-and-sod.md)
- [Context Receipt and handoff](02-operating-model/context-receipt-and-handoff.md)
- [State machines](02-operating-model/state-machines.md)

### Project control and assurance

- [Project Contract](03-project-control/project-contract.md)
- [Work Package Contract](03-project-control/work-package-contract.md)
- [Read-only self-pilot](03-project-control/self-pilot.md)
- [Local Project Contract candidate](03-project-control/candidates/secb-local.project-contract.yaml)
- [Read-only self-pilot Work Package candidate](03-project-control/candidates/wp-p0-19-read-only-self-pilot.work-package.yaml)
- [Evidence and provenance](04-assurance/evidence-and-provenance.md)
- [Verification matrix](04-assurance/verification-matrix.md)
- [Exit gates](04-assurance/exit-gates.md)

### Operations, intelligence, capabilities, and security

- [Live operations architecture](05-live-operations/live-operations-architecture.md)
- [Event envelope](05-live-operations/event-envelope.md)
- [Intervention and replay](05-live-operations/intervention-and-replay.md)
- [Memory and knowledge](06-intelligence/memory-and-knowledge.md)
- [Knowledge and code graphs](06-intelligence/knowledge-code-graphs.md)
- [SkillsHub lifecycle](07-capabilities/skillshub-lifecycle.md)
- [MCP and A2A governance](07-capabilities/mcp-a2a-governance.md)
- [Superpowers intake](07-capabilities/superpowers-intake.md)
- [Threat model](08-security/threat-model.md)
- [Data, privacy, and retention](08-security/data-privacy-retention.md)

### Delivery and controlled artifacts

- [Phase 0 backlog](09-delivery/backlog-p0.md)
- [Definition of done](09-delivery/definition-of-done.md)
- [Implementation roadmap](09-delivery/implementation-roadmap.md)
- [Source traceability](SOURCE-TRACEABILITY.md)
- [Documentation-specific agent instructions](AGENTS.md)
- [Documentation pack manifest](MANIFEST.json)
- [`templates/`](templates/) — candidate Project Contract, Work Package, Context Receipt, handoff, evidence, event, decision, agent, and skill templates.

The ADR directory contains both the original local bootstrap decisions and the imported draft architecture decisions. Filename identity is the stable reference; numeric prefixes alone are not globally unique across the two source sets.

## Source basis

The controlling design source is the user-provided “SecB System Design — Deep Architecture Assessment,” verified by the digest recorded in [`source/ASSESSMENT.sha256`](source/ASSESSMENT.sha256).
