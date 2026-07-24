---
name: graphify
description: Parse 36+ AST file types, build persistent queryable knowledge graphs, serve MCP tools, and triage PR conflicts (71.5x token compression)
---

# Graphify Knowledge Graph Skill

Graphify parses codebases using 36 local AST grammars (Tree-sitter), multimodal extractors, and LLM backends to produce persistent queryable knowledge graphs.

## Supported File Extensions & Grammars (36 Types)

| Type | Extensions & Formats | Notes |
|---|---|---|
| **Code (AST)** | `.py` `.ts` `.mts` `.cts` `.js` `.jsx` `.tsx` `.mjs` `.go` `.rs` `.java` `.c` `.cpp` `.h` `.hpp` `.rb` `.cs` `.kt` `.scala` `.php` `.swift` `.lua` `.zig` `.ps1` `.ex` `.m` `.jl` `.vue` `.svelte` `.astro` `.groovy` `.dart` `.v` `.sv` `.sql` `.sh` `.bash` `.json` `.sln` `.csproj` | Local Tree-sitter AST extraction with **zero API calls** |
| **Salesforce Apex** | `.cls` `.trigger` | Classes, interfaces, methods, SOQL/DML edges |
| **Terraform / HCL** | `.tf` `.tfvars` `.hcl` | Infrastructure resource graph extraction |
| **MCP Configs** | `.mcp.json` `mcp.json` `mcp_servers.json` `claude_desktop_config.json` | Server nodes, package refs, environment dependencies |
| **Package Manifests** | `package.json` `pyproject.toml` `go.mod` `pom.xml` | Canonical package node per dependency |
| **Docs & Markdown** | `.md` `.mdx` `.qmd` `.html` `.txt` `.rst` `.yaml` `.yml` | Markdown links & `[[wikilinks]]` references edges |
| **Office & PDFs** | `.docx` `.xlsx` `.pdf` | Structured text extraction |
| **Multimodal** | `.png` `.jpg` `.webp` `.mp4` `.mp3` YouTube URLs | Vision & faster-whisper transcription |

---

## Core Command Reference

```bash
# Code-only local AST extraction (100% offline, zero API keys)
python -m graphify extract . --code-only

# Incremental update (re-extract changed files only)
python -m graphify ./src --update

# Force full rebuild (overwrites stale nodes)
python -m graphify extract . --force

# Query graph relationships from terminal
python -m graphify query "what connects AuthorityEngine to WorkPackage?"
python -m graphify path "UserService" "DatabasePool"
python -m graphify explain "RateLimiter"

# Generate Markdown Wiki or Mermaid Callflow HTML
python -m graphify . --wiki
python -m graphify export callflow-html
```

---

## MCP Server Integration (`graphify.serve`)

Expose `graph.json` as an MCP server for agents:

```bash
# Stdio transport (default)
python -m graphify.serve graphify-out/graph.json

# HTTP Streamable transport (team-shared MCP endpoint)
python -m graphify.serve graphify-out/graph.json --transport http --host 0.0.0.0 --port 8080 --api-key "$SECRET"
```

### Provided MCP Tools:
- `query_graph`: Execute natural language or graph queries.
- `get_node`: Inspect node metadata and source file location.
- `get_neighbors`: Retrieve outbound and inbound edge dependencies.
- `shortest_path`: Compute shortest path between two symbols.
- `list_prs` / `get_pr_impact` / `triage_prs`: PR conflict risk analysis.

---

## PR Triage & Community Conflict Analysis

```bash
# Display PR dashboard (CI state, review status, graph impact)
python -m graphify prs

# AI-ranked review queue triage
python -m graphify prs --triage

# Detect PRs sharing graph communities (merge-order risk)
python -m graphify prs --conflicts
```

---

## Git Hooks & Merge Driver

```bash
# Install git hooks & automatic union-merge driver for graph.json
python -m graphify hook install
```

---

## Environment Variables Reference

| Variable | Target Backend / Purpose | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude (Anthropic) backend (`--backend claude`) | Required for Claude |
| `GEMINI_API_KEY` or `GOOGLE_API_KEY` | Google Gemini backend (`--backend gemini`) | Required for Gemini |
| `OPENAI_API_KEY` | OpenAI or local compatible server | Required for OpenAI |
| `OPENAI_BASE_URL` | OpenAI-compatible server (llama.cpp, vLLM, LM Studio) | `https://api.openai.com/v1` |
| `DEEPSEEK_API_KEY` | DeepSeek backend (`--backend deepseek`) | Required for DeepSeek |
| `MOONSHOT_API_KEY` | Kimi Code backend (`--backend kimi`) | Required for Kimi |
| `OLLAMA_BASE_URL` | Ollama local inference URL (`--backend ollama`) | `http://localhost:11434` |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI Service backend (`--backend azure`) | Required for Azure |
| `GRAPHIFY_MAX_WORKERS` | AST parallelism thread count | Auto (CPU count) |
| `GRAPHIFY_API_TIMEOUT` | Per-call request timeout (seconds) | `600` |
| `GRAPHIFY_FORCE` | Force graph rebuild even with fewer nodes | `0` |
| `GRAPHIFY_MAX_GRAPH_BYTES` | Maximum allowed `graph.json` size limit | `512 MiB` |
