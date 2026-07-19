# Failure-to-Capability Loop

## Policy objective

SecB must not confuse protective denial with organizational paralysis. Unsafe actions are contained, while the work is routed into a learning and corrective process.

## Dual-state model

### Execution disposition

- `COMPLETE`
- `PARTIAL`
- `ERROR`
- `DENIED_BY_POLICY`
- `BLOCKED_BY_DEPENDENCY`
- `REJECTED_BY_REVIEW`
- `QUARANTINED`

### Work disposition

- `CONTINUE`
- `RESEARCH_REQUIRED`
- `REPLAN_REQUIRED`
- `AUTHORITY_CORRECTION_REQUIRED`
- `DEPENDENCY_RESOLUTION_REQUIRED`
- `INCIDENT_RESPONSE_REQUIRED`
- `RETRY_AUTHORIZED`
- `RISK_ACCEPTANCE_REQUIRED`
- `DELIVERED`
- `RETIRED_WITH_RATIONALE`

No execution disposition automatically terminates the work item.

## Canonical conversion flow

```text
Attempt
→ Observed result
→ Containment, when required
→ Failure Evidence Envelope
→ Failure classification
→ Reproduction or evidence-gap analysis
→ Root-cause hypothesis
→ Research task
→ Options and corrective decision
→ Authorized retry, replan, escalation or retirement
→ Outcome receipt
→ Experience candidate
→ Knowledge candidate
→ Skill candidate
→ Evaluation and promotion
```

## Failure classes

| Code | Class | Example next action |
|---|---|---|
| F-AUTH | Authorization or scope gap | Correct contract or request authority |
| F-TECH | Technical defect | Reproduce, debug, test and repair |
| F-DEP | Missing or incompatible dependency | Research, pin, replace or defer |
| F-EVID | Evidence insufficiency | Re-run or add verifier |
| F-QUAL | Review/quality rejection | Address findings and resubmit |
| F-SEC | Security or privacy violation | Contain, investigate and remediate |
| F-OPS | Runtime/release failure | Recover, rollback and improve runbook |
| F-OUT | Business outcome miss | Reframe hypothesis or product decision |
| F-KNOW | Stale/contradictory knowledge | Revalidate, supersede or quarantine claim |
| F-SKILL | Skill regression or misuse | Re-evaluate, restrict, deprecate or revoke |

## Learning threshold

Create a formal Experience Candidate when any condition is true:

- repeated twice;
- affects R2+ work;
- exposes a control gap;
- causes material rework or delay;
- could recur across projects;
- produces a novel verified technique;
- invalidates existing knowledge or a skill.

## Retry control

A retry requires:

- changed hypothesis, input, environment or corrective action;
- bounded retry count and budget;
- preserved prior evidence;
- explicit success criteria;
- no relaxation of safety or evidence controls without governance approval.

## Required outputs

1. Failure Evidence Envelope.
2. Classification and severity.
3. Root-cause confidence and unknowns.
4. Research task and sources, when needed.
5. Corrective decision and authority.
6. Retest evidence or retirement rationale.
7. Experience/knowledge/skill disposition.
