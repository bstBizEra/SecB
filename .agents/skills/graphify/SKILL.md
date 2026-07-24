---
name: graphify
description: Transform codebase AST, docs, and schemas into persistent queryable knowledge graphs (71.5x token compression)
---

# Graphify Knowledge Graph Skill

Graphify parses codebases using local AST grammars (Tree-sitter) and generates persistent, queryable knowledge graphs.

## Quick Reference

```bash
# Generate knowledge graph for current repository
graphify .

# Incremental update (processes changed files only)
graphify . --update

# Deep mode (aggressive edge extraction)
graphify . --mode deep

# Query codebase relationships without reading raw files
graphify query "what connects AuthorityEngine to WorkPackage?"
```

## Generated Artifacts (`graphify-out/`)

- `graph.json` — Persistent graph data (nodes, edges, communities).
- `GRAPH_REPORT.md` — Identified god nodes, hub connections, and structural risks.
- `wiki/` — Indexed Wikipedia-style Markdown articles for agent navigation.
- `graph.html` — Interactive graph visualization.

## SecB Governance Rule

Graphify execution runs in **Read-Only (`R0` / `M0`)** mode. Graphify output files are stored under `graphify-out/` or `.secb/runtime/graphify/`.
