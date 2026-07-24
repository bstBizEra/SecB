# SECB-RESEARCH-GRAPHIFY-001 — SecB Integration Architecture for Graphify Knowledge Graph Engine

**Document ID:** SECB-RESEARCH-GRAPHIFY-001  
**Version:** 1.2.0  
**Status:** APPROVED / ACTIVE  
**Date:** 2026-07-25  
**Target Repository:** `Graphify-Labs/graphify` (PyPI: `graphifyy`)  

---

## 1. Executive Summary

Graphify is an open-source, multimodal AST parsing and knowledge graph engine that transforms codebases (36 Tree-sitter grammars), SQL schemas, Markdown docs, and PDFs into persistent, queryable knowledge graphs (`graph.json`, `GRAPH_REPORT.md`, `wiki/`, `graph.html`).

Integrating Graphify into SecB provides:
1. **Knowledge Ledger Enhancement:** Converts Graphify's AST nodes and edge relationships into verified SecB `KnowledgeClaim` records.
2. **Context Compression (71.5x reduction):** Allows governed agents (Codex, Claude, Gemini, Kimi, Ruflo) to query code relationships via `graphify query` instead of consuming context by re-reading thousands of raw lines.
3. **Command Center Graph Visualization:** Embeds interactive graph topologies directly into SecB's React Dashboard.
4. **MCP Tool Serving (`graphify.serve`):** Exposes graph traversal tools (`query_graph`, `get_node`, `get_neighbors`, `shortest_path`, `triage_prs`) over Stdio or Streamable HTTP.

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

## 3. Supported File Extensions & Grammars (36 Types)

- **Code:** `.py`, `.ts`, `.mts`, `.cts`, `.js`, `.jsx`, `.tsx`, `.mjs`, `.go`, `.rs`, `.java`, `.c`, `.cpp`, `.h`, `.rb`, `.cs`, `.kt`, `.scala`, `.php`, `.swift`, `.lua`, `.zig`, `.ps1`, `.ex`, `.sql`, `.sh`, `.json`, `.csproj`, etc.
- **Salesforce Apex:** `.cls`, `.trigger`
- **Terraform / HCL:** `.tf`, `.tfvars`, `.hcl`
- **MCP Configs:** `.mcp.json`, `mcp.json`, `mcp_servers.json`, `claude_desktop_config.json`
- **Package Manifests:** `package.json`, `pyproject.toml`, `go.mod`, `pom.xml`
- **Docs:** `.md`, `.mdx`, `.qmd`, `.html`, `.txt`, `.rst`, `.yaml`, `.yml`

---

## 4. MCP Server & Streamable HTTP Transport

Graphify serves `graph.json` over MCP (Model Context Protocol) via Stdio or HTTP:

```bash
# Stdio transport
python -m graphify.serve graphify-out/graph.json

# Shared team HTTP transport
python -m graphify.serve graphify-out/graph.json --transport http --host 0.0.0.0 --port 8080 --api-key "$SECRET"
```

### Registered Tools:
- `query_graph`
- `get_node`
- `get_neighbors`
- `shortest_path`
- `list_prs`
- `get_pr_impact`
- `triage_prs`

---

## 5. PR Dashboard & Merge-Order Conflict Triage

Graphify maps pull requests to graph communities to identify high-risk concurrent modifications:

```bash
# Display PR dashboard with CI & graph impact
python -m graphify prs

# Detect PRs sharing graph communities (merge-order risk)
python -m graphify prs --conflicts
```

---

## 6. Git Hooks & Multi-Agent Union Merge Driver

Running `python -m graphify hook install` configures a custom Git merge driver for `graph.json`. When two agents or developers commit graph changes concurrently, Git automatically union-merges the JSON graphs without conflict markers.
