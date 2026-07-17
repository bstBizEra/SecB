# Intervention, Replay, and Human Control

**Document ID:** SECB-LIVE-CONTROL-001
**Version:** 1.0.0-draft
**Status:** DRAFT / NOT EFFECTIVE

## Access Modes

| Mode | Capability |
|---|---|
| Observe | View events, terminal, diff, tests, and evidence |
| Annotate | Add signed comments/findings |
| Approve | Approve or reject a pending bounded action |
| Steer | Send a governed message to the agent |
| Control | Enter terminal or runtime input |
| Emergency | Pause, terminate, quarantine, revoke, or isolate |

Observe is the default. Each higher mode requires separate authority and is fully audited.

## Replay Package

A replay package includes:

- workflow event history;
- structured runtime events;
- host process, command, Git, file, and test observations;
- terminal recording when policy allows;
- conversation visible to participants;
- Context Receipts and Handoff Envelopes;
- policy decisions and approvals;
- evidence manifest and integrity proof;
- redactions, gaps, clock offsets, and contradictions;
- baseline/final repository identities;
- terminal disposition.

Replay must distinguish observed facts, provider assertions, human annotations, inferences, redactions, and missing data.

## Privacy Rule

Do not capture hidden chain-of-thought. Capture only user-visible content, deliberate rationale summaries, tool activity, artifacts, evidence, and outcomes according to approved capture policy.
