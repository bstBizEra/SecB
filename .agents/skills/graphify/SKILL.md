---
name: graphify
description: Transform codebase AST, docs, and schemas into persistent queryable knowledge graphs (71.5x token compression)
---

# Graphify Knowledge Graph Skill

Graphify parses codebases using local AST grammars (Tree-sitter) and multi-backend LLM extractors into persistent, queryable knowledge graphs.

## Quick Reference

```bash
# Code-only local AST extraction (no API keys needed)
python -m graphify extract . --code-only

# Headless full extraction with specific backend
python -m graphify extract . --backend claude
python -m graphify extract . --backend gemini
python -m graphify extract . --backend openai
python -m graphify extract . --backend ollama

# Incremental update (processes changed files only)
python -m graphify . --update

# Query codebase relationships without reading raw files
python -m graphify query "what connects AuthorityEngine to WorkPackage?"
```

## Environment Variables Reference

| Variable | Target Backend / Purpose | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude (Anthropic) backend (`--backend claude`) | Required for Claude |
| `ANTHROPIC_BASE_URL` | Custom Anthropic endpoint (LiteLLM proxy) | `https://api.anthropic.com` |
| `ANTHROPIC_MODEL` | Claude model override | `claude-sonnet-4-6` |
| `GEMINI_API_KEY` or `GOOGLE_API_KEY` | Google Gemini backend (`--backend gemini`) | Required for Gemini |
| `OPENAI_API_KEY` | OpenAI or local compatible server | Required for OpenAI |
| `OPENAI_BASE_URL` | OpenAI-compatible server (llama.cpp, vLLM, LM Studio) | `https://api.openai.com/v1` |
| `OPENAI_MODEL` | OpenAI model override | `gpt-4.1-mini` |
| `DEEPSEEK_API_KEY` | DeepSeek backend (`--backend deepseek`) | Required for DeepSeek |
| `MOONSHOT_API_KEY` | Kimi Code backend (`--backend kimi`) | Required for Kimi |
| `OLLAMA_BASE_URL` | Ollama local inference URL (`--backend ollama`) | `http://localhost:11434` |
| `OLLAMA_MODEL` | Ollama model name | Auto-detected |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI Service backend (`--backend azure`) | Required for Azure |
| `AZURE_OPENAI_ENDPOINT` | Azure resource endpoint URL | Required for Azure |
| `GRAPHIFY_MAX_WORKERS` | AST extraction worker thread count | Auto (CPU count) |
| `GRAPHIFY_API_TIMEOUT` | Per-call request timeout (seconds) | `600` |
| `GRAPHIFY_MAX_RETRIES` | Retry count for rate-limited (429) requests | `6` |
| `GRAPHIFY_FORCE` | Force graph rebuild even with fewer nodes | `0` |
| `GRAPHIFY_MAX_GRAPH_BYTES` | Maximum allowed `graph.json` size limit | `512 MiB` |

## Generated Artifacts (`graphify-out/`)

- `graph.json` — Persistent graph data (nodes, edges, communities).
- `GRAPH_REPORT.md` — Identified god nodes, hub connections, and structural risks.
- `wiki/` — Indexed Wikipedia-style Markdown articles for agent navigation.
- `graph.html` — Interactive graph visualization.

## SecB Governance Rule

Graphify execution runs in **Read-Only (`R0` / `M0`)** mode. Graphify output files are stored under `graphify-out/` or `.secb/runtime/graphify/`.
