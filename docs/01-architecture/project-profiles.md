# Universal Project Profiles

**Document ID:** SECB-ARCH-PROFILE-001
**Version:** 1.0.0-draft
**Status:** DRAFT / NOT EFFECTIVE

## Universal Kernel

All profiles share:

```text
Identity → Objective → Work → Decision → Evidence → Approval → Delivery → Outcome → Learning
```

Profiles specialize artifacts, validators, roles, evidence, and gates without redefining authority or identity.

## Initial Profiles

| Profile | Core artifacts | Primary assurance |
|---|---|---|
| Software Engineering | design, interfaces, diff, tests, build, scans | deterministic tests, review, QA, release evidence |
| Data and AI | data contract, lineage, model card, evaluation, drift | data quality, reproducibility, bias/security checks |
| Business and Strategy | problem frame, options, financial/business case, decision | source quality, assumptions, sensitivity, stakeholder acceptance |
| Research and Policy | methodology, source register, evidence pack, synthesis | citations, contradiction analysis, confidence, peer review |
| Product and Service | user needs, service blueprint, requirements, pilot | usability, acceptance, operational KPI, outcome observation |
| Operations and Incident | runbook, telemetry, action log, recovery receipt | safety, service restoration, post-incident review |
| Financial Modeling | assumptions, source data, formulas, scenarios, reconciliation | formula audit, sensitivity, independent review |
| Legal and Compliance | applicable rules, interpretation, review opinion, approvals | qualified review, effective date, jurisdiction, audit trail |

## Profile Contract

Each profile must define:

- profile ID and version;
- permitted lifecycle compression by risk class;
- mandatory roles and independence;
- canonical artifacts;
- deterministic and judgment-based validators;
- evidence requirements;
- exit gates;
- retention and data-classification rules;
- outcome metrics; and
- prohibited operations.
