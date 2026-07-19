# Context and Handoff

## Context Receipt

Agents receive minimum sufficient context containing:

- project, goal, module and work package;
- assigned role and authority;
- baseline version;
- requirements and acceptance criteria;
- applicable decisions and approved knowledge;
- risks, assumptions and unresolved questions;
- allowed tools, skills, MCP and network;
- evidence obligations and token budget;
- freshness timestamp and source references.

Context Receipts are versioned and integrity-protected. Architecture or requirement changes invalidate affected receipts.

## Handoff Envelope

Every handoff states:

- source agent/session and destination role;
- objective and authorized scope;
- completed work and artifact references;
- decisions, assumptions and evidence;
- checks performed;
- limitations, findings and risks;
- recommended next action;
- confidence and context delta.

The receiving agent must inspect authoritative evidence rather than trust the narrative alone.
