# Canonical Entity Model

**Document ID:** SECB-ARCH-ENTITY-001
**Version:** 1.0.0-draft
**Status:** DRAFT / NOT EFFECTIVE

## Minimum Entities

```text
Portfolio
Program
Project
ProjectProfile
ProjectContract
Repository
Environment
Objective
Outcome
WorkItem
WorkPackage
Workflow
ProjectSession
AgentSession
AgentProvider
RuntimeProduct
RuntimeDeployment
AgentProfile
AgentInstance
RoleAssignment
Capability
Model
Tool
MCPServer
Skill
ContextReceipt
HandoffEnvelope
Decision
Artifact
Event
Evidence
Evaluation
Approval
Policy
MemoryRecord
KnowledgeClaim
CodeEntity
Incident
Release
OutcomeReceipt
```

## Identity Rules

- IDs are immutable, globally unique within the SecB namespace, and never reused.
- Human-readable names may change without changing identity.
- Duplicate IDs fail closed.
- Project and tenant scope are mandatory where applicable.
- Actor identity is derived by SecB, not trusted from payload input.
- Every mutable business object uses explicit version and optimistic concurrency control.
- Historical decisions, events, evidence, and knowledge versions are append-only.

## Core Relationships

```text
Portfolio CONTAINS Program
Program CONTAINS Project
Project GOVERNED_BY ProjectContract
Project HAS Objective
Objective REALIZED_BY Outcome
WorkPackage ADVANCES Objective
AgentInstance ASSIGNED RoleAssignment
RoleAssignment AUTHORIZES AgentSession
AgentSession EXECUTES WorkPackage
AgentSession PRODUCES Artifact
Event OBSERVES AgentSession
Evidence SUPPORTS Claim or Decision
Decision AUTHORIZES Transition
KnowledgeClaim DERIVED_FROM Evidence
Skill IMPLEMENTS KnowledgeClaim
OutcomeReceipt VALIDATES or INVALIDATES Decision / Skill / KnowledgeClaim
```

## Temporal Semantics

Knowledge, policy, capability, and project state must support:

- valid from / valid until;
- current / historical / transitional status;
- supersedes / superseded by;
- effective / approved / revoked distinction; and
- source evidence and confidence.
