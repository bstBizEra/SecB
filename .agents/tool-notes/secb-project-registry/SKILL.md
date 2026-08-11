---
name: secb-project-registry
description: Governed reference architecture, catalog entity models, project definition contracts, and non-mutating registry composition for SecB.
---

# SecB Governed Project Registry — Reference Architecture & Composition

## Core Principle

SecB Project Registration operates strictly as a **proposal-only project-definition capability**. It generates project contracts, requirements, architecture, roadmaps, `AGENTS.md`, documentation proposals, and change manifests outside the target repository.

Repository mutation is isolated to a separately authorized bootstrap stage (`AUTHORIZED_FOR_BOOTSTRAP`).

---

## Recommended Composition & Reference Architecture

```text
SecB Project Registry
│
├── Catalog and Entity Model
│   └── Backstage-inspired entity models (Portfolio, Program, Project, Repository, Environment, ProjectProfile, RegistrationPackage, ProposedArtifact, Authorization, Evidence)
│
├── Project and Portfolio Projections
│   ├── OpenProject adapter (milestones, work packages, portfolio relationships)
│   ├── Plane adapter (cycles, issues, roadmaps via plane-mcp-server)
│   └── Taiga / Leantime adapters (agile backlogs & strategic goals)
│
├── Registration Contracts & Profiles
│   ├── SecB Project Contract
│   ├── Score-inspired Runtime & Workload Profile
│   ├── Requirements Register
│   └── Proposed Change Manifest (mode: proposal_only)
│
├── Architecture & Documentation Package
│   ├── arc42 (structure for proposed architecture package)
│   ├── Structurizr / C4 (architecture-as-code modeling)
│   ├── ADR (Architecture Decision Record log)
│   └── docToolchain (docs-as-code validation & publishing)
│
└── Authorized Bootstrap Engines (Post-Authorization Only)
    ├── Backstage Software Templates
    ├── Copier (template rendering behind explicit authorization)
    └── Cookiecutter (scaffolding behind AUTHORIZED_FOR_BOOTSTRAP)
```

---

## Governance & Adoption Rules

1. **Backstage Catalog Adoption**: Adapt the Backstage entity model to SecB's governance baseline without embedding the entire Backstage platform runtime.
2. **External Work Projections**: Use OpenProject/Plane as external work-management projections; do not treat them as SecB's internal authority engine.
3. **Bootstrap Isolation**: Scaffolding tools (Copier, Cookiecutter, Backstage Software Templates) must remain strictly disabled during proposal-only registration and execute only under an explicit `AUTHORIZED_FOR_BOOTSTRAP` decision record.
