# SecB Governed Multi-Agent Project Operating Model

**Document ID:** SECB-OPERATING-MODEL-001
**Version:** 0.2.0-alpha.0
**Status:** IMPLEMENTATION CANDIDATE / NOT OPERATIONALLY ACTIVATED

## 1. Constitutional model

SecB is the authority and assurance control plane above agent runtimes, project tools, source-control systems, model providers, MCP servers, and A2A transports. Every material action must be identifiable, scoped, authorized, observable, attributable, independently verifiable, and governed through an allowed transition.

Authority is derived from the conjunction of Agent Instance, Role Assignment, Project Contract, Work Package, governed session, temporary authorization, and policy decision. Runtime product names never grant authority.

## 2. Universal work lifecycle

```text
INTENT → REGISTER → DISCOVER → FRAME → RESEARCH → OPTIONS → DECIDE
→ DESIGN → PLAN → AUTHORIZE → EXECUTE → SELF-VERIFY
→ INDEPENDENT REVIEW → QA / ASSURANCE → GOVERNANCE DECISION
→ DELIVER / RELEASE → OBSERVE OUTCOME → LEARN
→ KNOWLEDGE CANDIDATE → SKILL CANDIDATE → PROMOTE / REJECT / RETIRE
```

Each transition requires the current object version, authorized actor, policy decision, evidence references, idempotency key, timestamp, and reason. Undefined transitions fail closed. Workflow compression is a policy decision based on risk, never an agent convenience.

## 3. Universal project kernel

All project profiles share:

```text
Identity → Objective → Work → Decision → Evidence → Approval
→ Delivery → Outcome → Learning
```

Initial profiles are Software Engineering, Data and AI, Business and Strategy, Research and Policy, Product and Service, Operations and Incident, Financial Modeling, and Legal and Compliance. Profiles specialize artifacts, validators, roles, evidence, and gates without redefining identity or authority.

## 4. Risk-based team topology

| Risk | Minimum topology |
|---|---|
| R0 — read-only or advisory | Producer plus evidence check |
| R1 — low-risk documentation or metadata | Producer plus independent REV |
| R2 — normal code, data, or configuration | SARCHI/ARCHI, ENGIN, REV, QA |
| R3 — security, finance, sensitive data, shared platform | Core team, SEC, human GOV |
| R4 — production, irreversible, regulatory, high impact | Independent design, ENGIN, REV, QA, SEC, release authority, human GOV |

Core roles are SARCHI, ARCHI, ENGIN, REV, QA, and GOV. Supporting functions are DOMAIN, RESEARCH, SEC, OPS, KNOW, and COST. Producer, final reviewer, QA verifier, evidence acceptor, and promotion authority must remain independent where applicable.

## 5. Professional judgment protocol

Agents must establish facts, identify uncertainty, generate options, analyze trade-offs, assess risk, decide or escalate, plan, execute, verify, challenge, observe outcomes, and learn. Records must distinguish verified fact, reported fact, assumption, hypothesis, inference, recommendation, decision, policy, and unresolved question.

## 6. Context and handoff

Every governed session receives a versioned, hashed Context Receipt scoped to project, objective, Work Package, role, authority, baseline, requirements, allowed capabilities, evidence obligations, risks, freshness, and source references.

Every delegation or role transition uses a structured Handoff Envelope. A recipient verifies source evidence directly and must not treat a producer summary as proof.

## 7. Seven-ledger organizational brain

| Ledger | Canonical responsibility |
|---|---|
| Work | Projects, objectives, Work Packages, assignments, dependencies, gates |
| Event | Append-only actions, calls, observations, interventions, transitions |
| Evidence | Sources, actors, procedures, hashes, verification, validity, acceptance |
| Decision | Options, rationale, authority, effective dates, supersession |
| Knowledge | Scoped temporal claims, confidence, contradictions, provenance |
| Capability | Agents, models, tools, MCP servers, skills, evaluations, restrictions |
| Outcome | Business and operational results, cost, incidents, benefit realization |

Captured Event is not Evidence. Evidence is not Knowledge. Knowledge is not a Skill. A Skill is not Authority. Hidden model chain-of-thought is never a governed artifact.

## 8. System-of-record boundaries

| Information | Authoritative system |
|---|---|
| Project authorization, agent identity, roles, evidence acceptance | SecB |
| Workflow state and gates | SecB durable runtime |
| Ordinary backlog UX | Plane, Jira, or GitHub Issues |
| Source code and version | Git provider |
| Test and security results | Original tool plus sealed SecB evidence |
| Knowledge approval | SecB Knowledge Authority |
| Skill package and version | SkillsHub |
| Operational telemetry | Observability platform |
| Business outcome | Domain system plus SecB Outcome Receipt |

PostgreSQL stores authoritative entities and current state; append-only storage keeps ordered events; object storage keeps evidence packages; graphs and search systems are projections, not authority.

## 9. Security boundary

The control plane must address prompt injection, memory and graph poisoning, skill supply-chain compromise, impersonation, delegation escalation, reviewer collusion, false evidence, project leakage, stale retrieval, tool spoofing, approval replay, cost exhaustion, and compromised runtimes. MCP and A2A calls use central policy, bounded credentials, method-level permissions, validation, and attributable evidence.

## 10. Activation boundary

This candidate becomes operational only through independent review, QA, applicable security review, accepted evidence, and an explicit human governance decision. Approval of architecture and authorization to execute, publish, deploy, or activate are separate decisions.
