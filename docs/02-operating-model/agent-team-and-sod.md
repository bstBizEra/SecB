# Agent Team and Separation of Duties

**Document ID:** SECB-OM-TEAM-001
**Version:** 1.0.0-draft
**Status:** DRAFT / NOT EFFECTIVE

## Dynamic Team Topology

SecB uses the minimum sufficient team for the resolved risk class. Roles are capabilities and accountabilities, not fixed numbers of agents.

### Core RACI

| Activity | SARCHI | ARCHI | ENGIN | REV | QA | GOV |
|---|---|---|---|---|---|---|
| Frame objective | A/R | C | I | C | I | C |
| Define architecture/contracts | C | A/R | C | C | I | I |
| Implement | I | C | A/R | I | I | I |
| Producer verification | I | C | A/R | I | I | I |
| Independent review | I | C | I | A/R | C | I |
| Acceptance verification | I | I | I | C | A/R | I |
| Exception/risk acceptance | C | C | I | C | C | A/R |
| Promotion/release | I | I | I | C | C | A/R |

### Supporting Functions

DOMAIN, RESEARCH, SEC, OPS, KNOW, and COST are assigned when profile, risk, or policy requires them.

## Independence Tests

Independence is invalid when:

- the same Agent Instance acts as producer and final reviewer;
- the reviewer relies solely on the producer’s summary;
- the reviewer can modify the producer workspace during review;
- the reviewer’s context contains unverified claims represented as facts;
- the QA verifier reuses producer test output without fresh execution where feasible;
- an approval token was created for another object, version, scope, or time window; or
- the promotion authority produced the candidate being promoted.

## Handoff Accountability

The source role is accountable for completeness of the handoff. The destination role is accountable for verifying evidence and rejecting unsupported claims.
