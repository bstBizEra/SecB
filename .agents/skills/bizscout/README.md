# BizScout v0.1.0

**Business Research Intelligence** — candidate BADF/SecB skill.

## Purpose

BizScout orchestrates evidence-backed research across markets, products, customers, competitors, industries, trends, pricing, and opportunities.

## Package

- Main skill: `SKILL.md`
- Governance manifest: `manifest.yaml`
- Workflow reference: `references/workflow.md`
- Decision-packet template: `assets/output-template.md`
- Sub-skills: `subskills/*/SKILL.md`
- MCP/tool registry: `tools/mcp-registry.yaml`
- Evidence schema: `schemas/evidence.yaml`
- Evaluation suite: `evals/cases.yaml`

## v0.1 boundary

This release is proposal/research-only (`M0`). It does not approve investments, mutate target repositories, publish authoritative policy, deploy systems, or activate tools. MCP entries are candidate adapters; runtime availability must be verified by the host.

## Research modes

`SCAN` → `STANDARD` → `DEEP`; `CONTINUOUS` is reserved for a later release.

## Initial MCP/tool candidates

Perplexity Comet, DuckDuckGo, Brave Search, Firecrawl, GitHub, Filesystem, Fetch, Wikipedia, arXiv, News, and future regulatory/internal-data connectors.

## Evidence contract

Material findings should be traceable to a source and research-run ID, with claim type, verification status, confidence, and contradictions recorded. See `schemas/evidence.yaml`.
