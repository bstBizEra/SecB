# P0 Verification Matrix

**Document ID:** SECB-VERIFY-P0-001
**Version:** 1.0.0-draft
**Status:** DRAFT / NOT RUN

## Verification Strategy

Each control requires positive, negative, and adversarial cases where applicable.

| ID | Control | Positive case | Negative/adversarial case |
|---|---|---|---|
| V-001 | Identity | registered actor starts scoped session | spoofed actor ID rejected |
| V-002 | Project scope | approved repository read succeeds | unrelated project access denied |
| V-003 | Authority | A0 read action succeeds | A0 mutation denied |
| V-004 | Context | current receipt accepted | stale/tampered receipt denied |
| V-005 | SoD | distinct producer/REV/QA accepted | self-review rejected |
| V-006 | Workflow | permitted transition succeeds | skipped/undefined transition rejected |
| V-007 | Idempotency | repeated transition returns same result | duplicate side effect prevented |
| V-008 | Evidence | sealed evidence verifies | changed payload fails integrity check |
| V-009 | Approval | bound approval authorizes exact action | replay/wrong-version approval denied |
| V-010 | Terminal | observer can view | observer input denied |
| V-011 | Redaction | secrets removed before storage | raw secret capture blocked/quarantined |
| V-012 | Memory | project-scoped verified retrieval succeeds | cross-project or candidate retrieval denied |
| V-013 | Skill | approved restricted skill resolves | unapproved version denied |
| V-014 | MCP | allowed method executes with bounded credential | unapproved method/server denied |
| V-015 | A2A | delegated task within authority accepted | escalation attempt denied |
| V-016 | Recovery | verified checkpoint resumes | drifted checkpoint denied |
| V-017 | Knowledge | evidence-backed candidate created | raw transcript promotion denied |
| V-018 | Outcome | outcome receipt linked to objective | unsupported success claim rejected |
| V-019 | Runtime | approved adapter emits normalized events | unknown/untrusted adapter quarantined |
| V-020 | Governance | human decision changes allowed state | agent self-activation denied |

## Result Values

`PASS`, `FAIL`, `BLOCKED`, `NOT_RUN`, and `NOT_APPLICABLE_WITH_JUSTIFICATION` are permitted. `PARTIAL`, `ASSUMED`, and `WAIVED` do not qualify as pass.
