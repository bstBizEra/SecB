# Governance Baseline

**Document ID:** SECB-GOV-BASE-001
**Version:** 1.0.0-draft
**Status:** DRAFT / NOT EFFECTIVE

## 1. Constitutional Principles

1. SecB is the authority and assurance control plane; agents and runtimes are execution workers.
2. Authority is server-derived, scoped, time-bounded, and non-transferable except through governed delegation.
3. Every state transition is explicitly permitted; unspecified transitions are denied.
4. Evidence acceptance is independent from evidence production.
5. No actor may approve or promote its own output as final.
6. Raw events and transcripts are not organizational truth.
7. Memory, knowledge, and skills require provenance, scope, temporal validity, evaluation, and approval.
8. Human authority governs irreversible, production, regulatory, exceptional, and promotion decisions.
9. Security, privacy, data residency, and retention apply across the full agent lifecycle.
10. Failure to establish identity, scope, baseline, authority, or evidence results in fail-closed behavior.

## 2. Decision Rights

| Decision | Proposer | Verifier | Final authority |
|---|---|---|---|
| Project registration | Owner / SARCHI | REV | Human GOV |
| Risk classification | SARCHI / SEC | REV / QA | GOV |
| Work Package authorization | SARCHI / ARCHI | REV | GOV or delegated policy authority |
| Code or artifact acceptance | ENGIN | REV + QA | Authorized integration authority |
| Evidence acceptance | Evidence service | Independent verifier | Evidence acceptance authority |
| Memory admission | KNOW | REV / QA | Knowledge authority |
| Skill publication | Skill owner | Evaluation + REV + QA + SEC | Human promotion authority |
| Production release | OPS | QA + SEC | Human release authority |
| Policy exception | Requesting owner | SEC / REV | Human GOV |

## 3. Fail-Closed Conditions

Deny and preserve evidence when any of the following occurs:

- actor or project identity cannot be verified;
- Project Contract is missing, expired, suspended, or inconsistent;
- authorization scope does not cover the requested action;
- workspace baseline differs from the authorized baseline;
- required reviewer or QA independence is absent;
- evidence hash, signature, sequence, or provenance is invalid;
- approval is expired, revoked, replayed, or for a different object;
- requested tool, model, MCP method, skill, command, path, network destination, or data class is not allowed;
- context is stale or scoped to another project;
- state transition is undefined; or
- rollback and recovery obligations are unmet.

## 4. Governance States

```text
DRAFT
→ REVIEW_REQUIRED
→ APPROVED_NOT_EFFECTIVE
→ EFFECTIVE
→ SUSPENDED
→ SUPERSEDED / REVOKED / RETIRED
```

Approval and effectiveness are separate. A document may be approved as a design without granting operational authority.

## 5. Exception Management

Exceptions must identify:

- exact control being varied;
- business justification;
- affected project, environment, data, and time window;
- compensating controls;
- accountable owner;
- independent review;
- residual risk;
- expiry and revocation conditions; and
- evidence destination.

No standing or self-renewing exception is permitted for R3/R4 controls.
