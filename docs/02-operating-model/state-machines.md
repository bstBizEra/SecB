# Canonical State Machines

**Document ID:** SECB-OM-STATE-001
**Version:** 1.0.0-draft
**Status:** DRAFT / NOT EFFECTIVE

## Project

```text
DRAFT → REVIEW → APPROVED_NOT_EFFECTIVE → ACTIVE → SUSPENDED → CLOSED
                                      └→ REVOKED
```

## Work Package

```text
DRAFT → PLANNED → REVIEWED → AUTHORIZED → READY → RUNNING
→ SELF_VERIFIED → REVIEW → QA → GOV_DECISION
→ ACCEPTED / REWORK / BLOCKED / QUARANTINED / CANCELLED
```

## Agent Session

```text
CREATED → CONTEXT_BINDING → READY → RUNNING
→ WAITING_FOR_AGENT / WAITING_FOR_TOOL / WAITING_FOR_APPROVAL
→ PAUSED → CHECKPOINTING → REVIEW_HANDOFF → COMPLETED

Exceptional: FAILED / BLOCKED / QUARANTINED / TERMINATED / RECOVERING
```

## Evidence

```text
CAPTURED → SEALED → VERIFICATION_PENDING → VERIFIED
→ ACCEPTED / REJECTED / SUPERSEDED / QUARANTINED
```

## Knowledge

```text
CANDIDATE → EVALUATING → REVIEW_REQUIRED → APPROVED_RESTRICTED
→ PUBLISHED → SUPERSEDED / DEPRECATED / REVOKED
```

## Skill

```text
DRAFT → CANDIDATE → SANDBOX → EVALUATING → SECURITY_REVIEW
→ APPROVAL_REQUIRED → PUBLISHED_RESTRICTED → PUBLISHED
→ DEPRECATED / REVOKED / QUARANTINED
```

## State Transition Contract

Every transition includes object ID/version, current state, requested state, actor, authority, policy decision, evidence references, idempotency key, timestamp, and reason code. Invalid transitions fail closed and emit an incident-grade event when risk is material.
