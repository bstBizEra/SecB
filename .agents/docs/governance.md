# Governance and Promotion Model

## Lifecycle

```text
DRAFT
→ CANDIDATE
→ STATICALLY_VALIDATED
→ EVALUATED
→ INDEPENDENTLY_REVIEWED
→ RESTRICTED_PILOT
→ APPROVED
→ PUBLISHED
→ MONITORED
→ DEPRECATED / REVOKED / QUARANTINED
```

## Required controls

- Source and package digests
- Complete content review, including scripts and references
- Trigger precision and negative-trigger evaluation
- Positive, negative, boundary, and adversarial output evaluation
- Cross-harness evaluation on every declared runtime
- Direct inspection of generated artifacts
- Separation between skill producer, reviewer, evaluator, and publisher
- Version pinning of external standards and protocol assumptions
- Explicit project, role, risk, authority, tool, and data-classification bindings
- Revocation and regression handling

## Authority classes used by this pack

- **A1:** Analysis and candidate production
- **A2:** Architecture recommendation or review candidate
- **A3:** Independent conformance verdict candidate

None of these classes grants A5 governance-root authority or operational activation.

## Mutation boundary

All included skills are M0 proposal-only. An architecture roadmap or work package is not a mutation authorization.
