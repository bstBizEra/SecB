# SECB-RESEARCH-GRAPHIFY-001 — SecB Integration Architecture for Graphify Knowledge Graph Engine

**Document ID:** SECB-RESEARCH-GRAPHIFY-001  
**Version:** 1.0.0-draft  
**Status:** DRAFT / RESEARCH  
**Date:** 2026-07-25  
**Target Repository:** `Graphify-Labs/graphify` (PyPI: `graphifyy`)  

---

## 1. Executive Summary

Graphify is an open-source, multimodal AST parsing and knowledge graph engine that transforms codebases, SQL schemas, Markdown docs, and PDFs into persistent, queryable knowledge graphs (`graph.json`, `GRAPH_REPORT.md`, `wiki/`, `graph.html`).

Integrating Graphify into SecB provides:
1. **Knowledge Ledger Enhancement:** Converts Graphify's AST nodes and edge relationships into verified SecB `KnowledgeClaim` records.
2. **Context Compression (71.5x reduction):** Allows governed agents (Codex, Claude, Gemini, Kimi, Ruflo) to query code relationships via `graphify query` instead of consuming context by re-reading thousands of raw lines.
3. **Command Center Graph Visualization:** Embeds interactive graph topologies directly into SecB's React Dashboard.

---

## 2. Graphify Architecture Overview

```text
Project Codebase / Docs (AST & Multimodal)
                  │
                  ▼
         Graphify Engine (Python / Tree-sitter)
                  │
  ┌───────────────┼───────────────┬───────────────┐
  ▼               ▼               ▼               ▼
graph.json    GRAPH_REPORT.md   wiki/         graph.html
(Persistent)   (God Nodes)    (Articles)     (Interactive UI)
  │
  ▼
SecB Graphify Adapter (src/plugins/secb-graphify-adapter.mjs)
  │
  ▼
SecB KnowledgeLedger (knowledge-claim.schema.json)
```

### Graphify Artifact Output Structure

- `graphify-out/graph.json` — Persistent node & edge graph JSON (queries survive across agent sessions).
- `graphify-out/GRAPH_REPORT.md` — Identified "god nodes" (high centrality), hub connections, and structural risks.
- `graphify-out/wiki/` — Wikipedia-style Markdown articles indexed for agent fast traversal.
- `graphify-out/graph.html` — Standalone D3/Vis.js interactive web visualizer.
- `graphify-out/cache/` — Incremental parsing cache keyed by SHA-256 file digests.

---

## 3. Integration Blueprint into SecB

### A. SecB Agent Skill (`.agents/skills/graphify/SKILL.md`)

Exposes `$graphify` to Codex, Claude Code, Gemini CLI, Kimi CLI, and Ruflo Swarm:

```markdown
---
name: graphify
description: Build, update, or query codebase knowledge graph using Graphify AST parser
---

# Graphify Skill

Usage:
  - Build graph: graphify .
  - Update graph: graphify . --update
  - Query graph: graphify query "relationship between AuthorityEngine and WorkPackage"
```

### B. SecB Knowledge Ledger Plugin (`src/plugins/secb-graphify-adapter.mjs`)

Translates `graph.json` nodes and edges into canonical SecB `KnowledgeClaim` envelopes:

```javascript
import { readFileSync } from "node:fs";

export function ingestingGraphifyGraph(graphJsonPath, { project_id = "SECB" } = {}) {
  const raw = JSON.parse(readFileSync(graphJsonPath, "utf8"));
  const claims = [];

  for (const node of raw.nodes ?? []) {
    claims.push({
      schema_version: "1.0",
      claim_id: `KCLAIM-GRAPHIFY-${node.id}`,
      project_id,
      subject: node.label ?? node.id,
      predicate: "has_ast_type",
      object: node.type ?? "symbol",
      evidence_refs: [node.file_path ?? "repository"],
      verification_status: "VERIFIED"
    });
  }

  return claims;
}
```

### C. SecB Dashboard Knowledge Graph Tab (`dashboard/src/pages/KnowledgeGraph.tsx`)

Renders the interactive Graphify dependency graph directly inside the SecB Governance Dashboard on port `3000`.

---

## 4. Security & Governance Boundaries

- **Authority Ceiling:** Graphify runs strictly in **Read-Only (`R0` / `M0`)** mode.
- **Cache Integrity:** Cached graph nodes use SecB's SHA-256 entry hash validation.
- **No Remote Egress:** Local AST parsing via Tree-sitter without third-party API dependencies.

---

## 5. Next Actions for P1 Implementation

1. Register `$graphify` skill in `.agents/skills/graphify/SKILL.md`.
2. Add `src/plugins/secb-graphify-adapter.mjs` unit test suite.
3. Add `Knowledge Graph` tab to SecB Dashboard navigation.
