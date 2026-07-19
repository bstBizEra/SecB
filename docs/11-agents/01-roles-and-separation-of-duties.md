# Roles and Separation of Duties

## Role accountabilities

| Role | Accountability | Typical outputs |
|---|---|---|
| GOV | Final authority, risk acceptance, exception and release decision | Signed verdict |
| DOMAIN | Business intent, user value, outcome acceptance | Outcome criteria |
| SARCHI | Strategic framing and work decomposition | Goal map, options, roadmap |
| ARCHI | Contracts, architecture and dependency design | ADRs, interfaces, schemas |
| RESEARCH | Sources, uncertainty and contradiction analysis | Evidence pack |
| ENGIN | Bounded implementation | Commits, tests, producer evidence |
| REV | Independent conformance and quality challenge | Findings and verdict |
| QA | Independent acceptance verification | Verification report |
| SEC | Security/privacy threat and control evaluation | Security verdict |
| OPS | Runtime, release, rollback and incident readiness | Runbook, release receipt |
| KNOW | Knowledge claim curation | Approved/superseded claims |
| SKILL | Skill packaging and lifecycle | Skill package, evaluation |
| INTEGRATOR | Candidate reconciliation and queue control | Integration candidate |
| FINOPS | Cost, model and capacity governance | Budget and efficiency report |
| DOCS | Controlled documentation and traceability | Updated docs and changelog |

## Prohibited combinations in one work package

- ENGIN and final REV
- ENGIN and final QA
- Skill author and final publisher
- Evidence producer and sole evidence acceptor
- Integration candidate producer and sole protected-branch integrator
- Requester of a policy exception and sole exception approver
- Agent instance and its own authority issuer

## Independence strength

| Level | Requirement |
|---|---|
| I0 | Producer self-check only; R0 advisory work |
| I1 | Different session, same harness/model allowed |
| I2 | Different agent instance and independent context |
| I3 | Different model or provider plus independent evidence access |
| I4 | Human or formal external assurance required |

R2 requires at least I2 for final review. R3/R4 should use I3 or I4.
