# SECB-RESEARCH-GRAPHIFY-001 — SecB Integration Architecture for Graphify Knowledge Graph Engine

**Document ID:** SECB-RESEARCH-GRAPHIFY-001  
**Version:** 1.1.0  
**Status:** APPROVED / ACTIVE  
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
  - Code-only AST extraction: python -m graphify extract . --code-only
  - Headless multi-backend extraction: python -m graphify extract . --backend [claude|gemini|openai|ollama]
  - Query graph: python -m graphify query "relationship between AuthorityEngine and WorkPackage"
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

---

## 4. Security & Governance Boundaries

- **Authority Ceiling:** Graphify runs strictly in **Read-Only (`R0` / `M0`)** mode.
- **Cache Integrity:** Cached graph nodes use SecB's SHA-256 entry hash validation.
- **No Remote Egress:** Local AST parsing via Tree-sitter without third-party API dependencies when running `--code-only`.

---

## 5. Environment Variables & Model Backends Reference

| Variable | Used For | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | `--backend claude` | Claude (Anthropic) backend API key |
| `ANTHROPIC_BASE_URL` | `--backend claude` | Custom endpoint (LiteLLM proxy) |
| `ANTHROPIC_MODEL` | `--backend claude` | Model override (e.g. `claude-sonnet-4-6`) |
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` | `--backend gemini` | Google Gemini backend key |
| `OPENAI_API_KEY` | `--backend openai` | OpenAI API key |
| `OPENAI_BASE_URL` | `--backend openai` | OpenAI-compatible server (llama.cpp, vLLM, LM Studio) |
| `OPENAI_MODEL` | `--backend openai` | OpenAI model override (default `gpt-4.1-mini`) |
| `DEEPSEEK_API_KEY` | `--backend deepseek` | DeepSeek backend key |
| `MOONSHOT_API_KEY` | `--backend kimi` | Kimi Code backend key |
| `OLLAMA_BASE_URL` | `--backend ollama` | Ollama local inference URL (`http://localhost:11434`) |
| `OLLAMA_MODEL` | `--backend ollama` | Ollama model name |
| `AZURE_OPENAI_API_KEY` | `--backend azure` | Azure OpenAI key |
| `AZURE_OPENAI_ENDPOINT` | `--backend azure` | Azure endpoint URL |
| `GRAPHIFY_MAX_WORKERS` | AST parallelism | Parallel AST parsing thread count |
| `GRAPHIFY_API_TIMEOUT` | Headless HTTP | Per-call HTTP timeout (default: 600s) |
| `GRAPHIFY_MAX_GRAPH_BYTES` | Graph limit | Size cap override (default: 512 MiB) |
