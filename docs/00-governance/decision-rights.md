# Decision Rights and Authority

## Authority classes

| Class | Meaning | Typical holder |
|---|---|---|
| A0 | Observe/read only | Research or audit agent |
| A1 | Draft and recommend | SARCHI, ARCHI, RESEARCH, DOCS |
| A2 | Bounded non-production mutation | ENGIN under work package |
| A3 | Candidate integration preparation | INTEGRATOR under queue policy |
| A4 | Restricted protected integration or non-production environment activation | Authorized integration/OPS principal plus per-operation human approval |
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

The A4 protected-integration capability is prospective and inactive. It exists
only through the closed contract in
[`integration-principal-control-contract.md`](integration-principal-control-contract.md)
after SECB-AGENTS-AMD-003 and ADR-0009 are adopted by human governance. A3
continues to prohibit protected merge. Restricted non-production environment
activation may follow a different A4 control path; it is outside the integration
contract. Production release/activation, policy exceptions and changes to the
authority basis remain human A5 decisions. The current executable risk registry
retains the pre-amendment A4 wording; protected integration remains inactive
until a separately reviewed registry successor is effective.
