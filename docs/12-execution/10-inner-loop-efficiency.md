# BOPEN-ENG-EFFICIENCY-001 — Inner-Loop Efficiency

## Document Control

| Field | Value |
|---|---|
| Artifact ID | BOPEN-ENG-EFFICIENCY-001 |
| Version | 1.0.0-draft |
| Status | DRAFT / NOT EFFECTIVE |
| Owner | SecB Engineering & Governance Authority |
| Extends | [`08-bopen-engineering-loop.md`](08-bopen-engineering-loop.md) §3.2–§3.4 |
| Effective when | Approved by human GOV and referenced in `AGENTS.md` |

---

## 1. Feedback latency budgets

| Tier | Scope | Budget |
|---|---|---|
| 1 | LSP diagnostics and AST lint on edit | < 100 ms |
| 2 | Selective test run over impacted modules | < 1 s |
| 3 | Panel review evaluation | < 15 s |

These are budgets, not gates. Missing one is a signal to investigate the harness.
It is never a reason to refuse, skip, shorten, or defer a check.

---

## 2. Token cost layers

| Layer | Technique |
|---|---|
| 1 | Static KV prefix ordering — system persona, tool schemas, repository map, then dynamic turns |
| 2 | AST pruning — signatures and imports retained, method bodies stripped |
| 3 | Model cascading — cheaper tier for intake, search parsing and formatting; frontier tier for architecture and patch generation |
| 4 | Subagent context isolation — verbose exploration runs in a disposable frame that returns a distilled summary |
| 5 | Search/replace block diffs — targeted edits instead of whole-file rewrites |

---

## 3. Two invariants that bound the layers

Cost reduction is not unconditionally good in a governed control plane. Two
constraints bound every technique in §2.

### 3.1 Optimization must not reduce evidence

The VERIFY stage always runs `npm run validate` and `npm test` in full. Model
cascading, AST pruning, and selective test execution apply to PLAN and ACT only.

No evidence-producing run is ever abbreviated, sampled, or served from cache. A
cheaper run that yields a weaker claim has not saved anything — it has replaced
evidence with an assertion, which working rule 6 does not accept.

### 3.2 Isolation must not erase provenance

A subagent returning a distilled summary must carry source, timestamp, and agent
ID in that summary. Discarding a subagent's raw history is permitted; discarding
its provenance is not.

---

## 4. Conformance

A slice conforms to this document when its evidence-producing runs are complete
runs, and every distilled subagent result in its record names its source,
timestamp, and agent ID.
