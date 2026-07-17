# Authority and Risk Model

**Document ID:** SECB-GOV-AUTH-001
**Version:** 1.0.0-draft
**Status:** DRAFT / NOT EFFECTIVE

## 1. Authority Classes

| Class | Name | Permitted scope |
|---|---|---|
| A0 | Observe | Read approved metadata and evidence; no mutation |
| A1 | Analyze | Produce recommendations, plans, and candidates |
| A2 | Bounded Execute | Mutate within an authorized isolated workspace |
| A3 | Integrate Candidate | Prepare immutable integration candidates; no protected merge |
| A4 | Operational Authority | Perform bounded environment operations under explicit approval |
| A5 | Governance Root | Approve exceptions, release, activation, promotion, revocation, and risk acceptance |

A5 is human or formally constituted non-agent authority. Agents must not self-assign A5.

## 2. Risk Classification

| Class | Indicators | Required controls |
|---|---|---|
| R0 | Read-only, reversible, no sensitive data | Identity, scope, evidence check |
| R1 | Documentation or low-impact metadata | Independent REV, deterministic validation |
| R2 | Normal code/data/config mutation | Isolated workspace, ENGIN/REV/QA, rollback |
| R3 | Security boundary, financial logic, personal/sensitive data, shared platform | SEC, stronger independence, human GOV, adversarial tests |
| R4 | Production, irreversible, regulated, systemic, high-value | Independent design, release authority, change window, progressive delivery, human approvals |

## 3. Risk Inputs

Risk classification considers:

- reversibility and blast radius;
- production or customer impact;
- security and privacy boundary;
- data sensitivity and residency;
- financial, legal, or regulatory consequence;
- shared-service and cross-project dependency;
- novelty and uncertainty;
- model/tool/runtime trust level;
- privilege, network, and credential scope;
- evidence and rollback maturity.

## 4. Authority Derivation

Effective authority is the intersection of:

```text
Actor capability
∩ Role assignment
∩ Project Contract
∩ Work Package
∩ Environment policy
∩ Data classification
∩ Runtime deployment status
∩ Tool/model/MCP/skill allowlist
∩ Time window
∩ Current workflow state
```

Any empty or contradictory intersection produces no authority.

## 5. Non-Escalation

Delegation may reduce but never increase authority. The delegate receives the lesser of source authority, destination capability, Project Contract allowance, and Work Package scope.
