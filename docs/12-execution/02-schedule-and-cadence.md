# Schedule and Cadence

All times use `Asia/Ho_Chi_Minh` unless a Project Contract states otherwise.

## Event-driven cadence

| Trigger | Required action |
|---|---|
| Work package created | Preflight, risk classification and team compilation |
| Session started | Context receipt, baseline and evidence destination confirmation |
| Commit/checkpoint | Write-set reconciliation, merge simulation and evidence update |
| Failed/denied action | Failure Evidence Envelope and learning disposition |
| Candidate submitted | Freeze, independent review and integration queue entry |
| Release/activation | Verification, approval, rollback readiness and outcome window |
| Outcome observed | Outcome Receipt, learning and knowledge assessment |

## Recommended operating rhythm

| Cadence | Activity | Required output |
|---|---|---|
| Daily 08:30 | Portfolio and blocker triage | Priority/authority updates |
| Daily 17:30 | Evidence and outcome close | Session disposition, gaps and next actions |
| Monday 09:00 | Goal and work-package planning | Authorized weekly plan |
| Wednesday 15:00 | Architecture/dependency review | ADRs, interface changes, risk updates |
| Friday 15:00 | Integration queue and release review | Candidate dispositions |
| Friday 16:30 | Learning and skill review | Experience/knowledge/skill decisions |
| Monthly, first Tuesday | Security, cost and capability governance | Risk, spend, model and harness decisions |
| Quarterly | Product and platform review | Roadmap, KPI and capability reprioritization |

## Session checkpoint policy

Use checkpoints at meaningful state transitions and at least before:

- broad refactoring;
- dependency or schema change;
- privilege/network expansion;
- handoff to another role;
- review submission;
- integration or release.

Time-based checkpoints may supplement but must not replace semantic checkpoints.
