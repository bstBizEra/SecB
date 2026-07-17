# Context Receipt and Handoff Envelope

**Document ID:** SECB-OM-CONTEXT-001
**Version:** 1.0.0-draft
**Status:** DRAFT / NOT EFFECTIVE

## Context Receipt

A Context Receipt proves which bounded information an agent was authorized to use.

Required fields:

- project, objective, work package, session, and role IDs;
- authority and data classification;
- repository/environment baseline and version;
- requirements and acceptance criteria;
- applicable decisions, policies, knowledge, risks, and unresolved questions;
- allowed models, tools, commands, skills, MCP methods, paths, networks, and data;
- evidence obligations;
- token/cost budget;
- source references and freshness timestamps;
- exclusions and redactions;
- receipt hash, issuer, issue time, expiry, and revocation status.

## Retrieval Order

```text
Project scope
→ Authority filter
→ Temporal/current-state filter
→ Verification status
→ Exact source evidence
→ Relevance ranking
→ Minimum-sufficient compaction
```

## Handoff Envelope

Every role transition uses a structured envelope containing:

- source identity and destination role;
- objective and authorized scope;
- work completed and artifacts created;
- decisions, assumptions, and evidence references;
- verification performed;
- known limitations, unresolved findings, and risks;
- context delta from the prior receipt;
- recommended next action and confidence;
- integrity hash and sequence.

A handoff is not evidence acceptance. The destination must examine authoritative artifacts and evidence directly.
