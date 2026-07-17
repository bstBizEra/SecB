# Exit Gates

**Document ID:** SECB-GATES-001
**Version:** 1.0.0-draft
**Status:** DRAFT / NOT EFFECTIVE

## Gate Families

### G0 — Administrative Baseline

Document identities, versions, owners, approval status, and hashes are complete.

### G1 — Canonical Identity and Scope

Project, agent, role, work, session, repository, environment, and evidence destination are resolved and immutable.

### G2 — Authority and Policy

Effective authority is derived server-side; unknown operations are denied; no role conflicts remain.

### G3 — Workflow and Durability

State transitions, idempotency, concurrency, checkpoint, recovery, and terminal disposition pass.

### G4 — Context and Handoff

Context Receipts and Handoff Envelopes validate, remain scoped, and preserve source references.

### G5 — Evidence and Assurance

Evidence integrity, verification, replay, REV, QA, and SEC obligations pass.

### G6 — Memory and Capability Boundaries

Cross-project leakage, raw promotion, mutable history, and unapproved skill use are denied.

### G7 — Live Operations and Privacy

Structured telemetry, host corroboration, read-only observation, redaction, retention, and replay access pass.

### G8 — Outcome and Governance

Outcome receipt, residual risk, human governance verdict, and required sign-offs are complete.

## Terminal Rule

All applicable gates must be `PASS`. A pending, missing, assumed, waived, or untested gate prevents activation.
