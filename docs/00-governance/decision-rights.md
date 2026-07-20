# Decision Rights and Authority

## Authority classes

| Class | Meaning | Typical holder |
|---|---|---|
| A0 | Observe/read only | Research or audit agent |
| A1 | Draft and recommend | SARCHI, ARCHI, RESEARCH, DOCS |
| A2 | Bounded non-production mutation | ENGIN under work package |
| A3 | Candidate integration preparation | INTEGRATOR under queue policy |
| A4 | Restricted environment activation | Authorized OPS/release authority plus human approval |
| A5 | Governance root, policy exception and production authority | Human governance body |

## Decision rights matrix

| Decision | Propose | Execute | Verify | Approve |
|---|---|---|---|---|
| Goal/OKR | DOMAIN/SARCHI | — | FINOPS/QA | GOV/Product Owner |
| Architecture | ARCHI | ENGIN | REV/SEC | GOV or delegated architecture authority |
| Code mutation | ENGIN | ENGIN | REV/QA/SEC | Integration authority |
| Evidence acceptance | Producer may submit | — | QA/SEC | Evidence authority |
| Knowledge admission | KNOW/RESEARCH | — | REV/DOMAIN | Knowledge authority |
| Skill publication | SKILL | SkillsHub operator | QA/SEC | Human or delegated skill authority |
| Production release | OPS | Release operator | QA/SEC/OPS | A5 human authority |
| Policy exception | Any role may request | — | SEC/GOV analysis | A5 only |

No agent may infer approval from silence or from a prior approval issued for another baseline, scope or time window.
