# Target Platform Architecture

```text
SecB Governed Control Plane
├── Governance Kernel
│   ├── Identity, Policy, Authority, Risk, SoD and Human Decisions
├── Portfolio and Product Kernel
│   ├── Portfolio, Product, Module, Goal, Project and Work Graph
├── Agent Operations Kernel
│   ├── Provider, Harness, Runtime, Agent, Capability and Session Registries
├── Execution Kernel
│   ├── Durable Workflow, Workspace Leases, Tool Gateway and Recovery
├── Assurance Kernel
│   ├── Evidence, Evaluation, REV, QA, SEC and Exit Gates
├── Organizational Brain Fabric
│   ├── Event, Decision, Knowledge, Memory, Context and Outcome services
├── Skills and Capability Fabric
│   ├── SkillsHub, packaging, evaluation, promotion and distribution
├── Collaboration Fabric
│   ├── MCP Gateway, A2A Gateway and structured handoffs
└── Operations and Intelligence
    ├── Live Ops, replay, cost, incident and portfolio intelligence
```

## Design rule

Every module consumes canonical IDs and contracts. No module may create a separate definition of Project, Agent, Session, Evidence, Knowledge or Skill.
