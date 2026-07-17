# Knowledge Graph and Code Graph

**Document ID:** SECB-GRAPH-001
**Version:** 1.0.0-draft
**Status:** DRAFT / NOT EFFECTIVE

## Knowledge Graph

Represents projects, objectives, agents, roles, work, decisions, evidence, policies, knowledge, skills, incidents, releases, and outcomes.

## Code Graph

Represents repositories, commits, modules, packages, files, classes, functions, APIs, schemas, tests, owners, dependencies, vulnerabilities, and changes.

## Unified Impact Query

```text
Proposed Change
→ Affected Code and Data
→ Affected Services and Interfaces
→ Affected Tests and Controls
→ Affected Projects and Owners
→ Historical Incidents and Decisions
→ Relevant Knowledge and Skills
→ Required Reviewers and Exit Gates
```

## Trust Rules

- Graph nodes link to authoritative source IDs and evidence.
- Extracted facts, inferred relationships, and human-approved claims are distinct.
- Inference never silently becomes verified fact.
- Graph updates are versioned and attributable.
- A graph is a relationship projection, not the evidence source of truth.
