# Governed Memory and Knowledge

**Document ID:** SECB-MEM-KNOW-001
**Version:** 1.0.0-draft
**Status:** DRAFT / RED / NOT EFFECTIVE

## Memory Layers

- **Session Memory:** temporary execution state.
- **Work Memory:** scoped to a Work Package or Project Session.
- **Project Memory:** durable project-specific facts, decisions, and patterns.
- **Organizational Knowledge:** cross-project claims that passed governance.
- **Procedural Memory:** approved skills and workflows.

## Seven Ledgers

1. Work Ledger
2. Event Ledger
3. Evidence Ledger
4. Decision Ledger
5. Knowledge Ledger
6. Capability Ledger
7. Outcome Ledger

Each ledger is logically distinct even when implemented on shared infrastructure.

## Knowledge Claim Contract

A knowledge claim includes:

- claim and claim type;
- project/organization scope;
- evidence references;
- confidence and uncertainty;
- valid-from and valid-until;
- current, historical, or transitional status;
- contradictions;
- supersedes/superseded-by;
- owner, reviewer, approver;
- access, retention, and deletion policy.

## Admission Pipeline

```text
Captured Event
→ Classification
→ Evidence verification
→ Deduplication and contradiction analysis
→ Scope and temporal determination
→ Confidence evaluation
→ Independent review
→ Approval
→ Memory/knowledge admission
```

## Critical Controls

- provider-neutral gateway;
- server-derived authority;
- no implicit repository/project fallback;
- immutable historical records;
- duplicate-ID rejection;
- temporal versioning and supersession;
- auditable retrieval decisions;
- token budgeting and hierarchical compaction;
- no cross-project retrieval without federation approval;
- no direct session-to-skill path.
