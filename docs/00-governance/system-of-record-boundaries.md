# System-of-Record Boundaries

**Document ID:** SECB-GOV-SOR-001
**Version:** 1.0.0-draft
**Status:** DRAFT / NOT EFFECTIVE

## Boundary Matrix

| Information | Authoritative system | SecB treatment |
|---|---|---|
| Project authorization and contract | SecB | Authoritative |
| Agent identity, role, capability, and authority | SecB | Authoritative |
| Workflow state, approvals, and exit gates | SecB durable runtime | Authoritative |
| Ordinary backlog and task UX | Plane, Jira, GitHub/Gitea Issues | Referenced projection |
| Source code and version history | Git provider | Referenced and hashed |
| Build, test, scan, and deployment output | Original execution tools | Sealed evidence reference |
| Evidence acceptance and provenance | SecB evidence ledger | Authoritative |
| Decisions and supersession | SecB decision ledger | Authoritative |
| Knowledge approval and temporal claims | SecB knowledge ledger | Authoritative |
| Skills and versions | SecB SkillsHub | Authoritative |
| Runtime metrics and traces | Observability platform | Referenced projection |
| Business outcome | Domain system plus SecB outcome receipt | Federated authority |
| Secrets and credentials | Approved secrets manager | Never copied into context |

## Principles

- SecB ingests identifiers, hashes, receipts, and projections rather than duplicating every source record.
- Dual writes require an explicit reconciliation owner and failure policy.
- Vector and graph indexes are projections, not authoritative stores.
- A source-system update does not automatically alter an accepted SecB decision or evidence record; supersession must be explicit.
