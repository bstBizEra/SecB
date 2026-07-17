# SecB Target Architecture

**Document ID:** SECB-ARCH-001
**Version:** 1.0.0-draft
**Status:** DRAFT / NOT EFFECTIVE

## Governing Model

```text
SecB Governed Agent Work and Learning Operating System
│
├── Governance Kernel
│   ├── Identity and workload identity
│   ├── Policy and authorization
│   ├── Risk classification
│   ├── Separation of duties
│   ├── Human decision rights
│   └── Promotion and revocation authority
│
├── Portfolio and Work Kernel
│   ├── Portfolio / Program / Project
│   ├── Objective / Outcome / Work Package
│   ├── Universal work ontology
│   ├── Project profiles
│   ├── Work graph
│   └── Decision register
│
├── Execution Kernel
│   ├── Durable workflow
│   ├── Runtime adapters
│   ├── Workspace/worktree isolation
│   ├── Runtime namespaces and credentials
│   ├── Tool and command gateway
│   └── Checkpoint, recovery, and reconciliation
│
├── Assurance Kernel
│   ├── Evidence and provenance
│   ├── Evaluation harness
│   ├── Deterministic validation
│   ├── Independent REV / QA / SEC
│   ├── Exit-gate engine
│   └── Human approval workbench
│
├── Organizational Brain Fabric
│   ├── Work ledger
│   ├── Event ledger
│   ├── Evidence ledger
│   ├── Decision ledger
│   ├── Knowledge ledger
│   ├── Capability ledger
│   ├── Outcome ledger
│   └── Context federation
│
├── Capability Fabric
│   ├── Agent, provider, runtime, model, and tool registries
│   ├── SkillsHub
│   ├── Evaluation suites
│   └── Versioning, distribution, deprecation, and revocation
│
├── Collaboration Fabric
│   ├── MCP control plane
│   ├── A2A gateway
│   ├── Delegation service
│   └── Structured handoffs
│
└── Operations and Intelligence
    ├── Live Operations
    ├── OpenTelemetry
    ├── Terminal and desktop observation
    ├── Session replay
    ├── Cost and performance
    ├── Incident management
    └── Portfolio intelligence
```

## Deployment Principles

- Control-plane services use strong identity, authorization, and immutable audit.
- Durable workflow state is separated from live UI fan-out.
- PostgreSQL stores canonical entities and current state.
- Append-only event storage retains ordered lifecycle events.
- Object storage retains evidence packages and recordings.
- Graph and vector systems serve relationship and retrieval projections.
- Host Runtime Agents make outbound authenticated connections; browsers do not connect directly to hosts.
- Every adapter is versioned, evaluated, and revocable.
