# SECB-MCP-P0-001 — SecB P0 MCP Control Plane (Candidate)

**Document ID:** SECB-MCP-P0-001
**Version:** 0.1.0-draft
**Status:** DRAFT / NOT EFFECTIVE — candidate control document; requires independent REV + QA (MCP/A2A permission change per repo [`AGENTS.md`](../../../AGENTS.md) and the [`docs/AGENTS.md`](../../AGENTS.md) review rules) and operator/GOV acceptance before any activation
**Owner:** unassigned (operator to assign)
**Derived from:** [`secb-mcp-p0-tooling-research-2026-07-19.md`](secb-mcp-p0-tooling-research-2026-07-19.md) (EXTERNAL_REFERENCE research packet)
**Relation to P0-21:** The delivered SecB MCP Server read-only alpha (stdio, 9-tool frozen catalog, on `bst/integration-rehearsal-3`) is the seed of the Gateway lane below. This document does not activate it; its wiring remains an operator-authorized deployment step.
**Authority fields:** truth_status: partially_supported (research claims not independently re-verified) · authority_status: advisory_only · implementation_status: candidate · risk_class: high (MCP permission surface)

## N-1. Normative rule — single gateway path

```text
DENY:  Harness ───────────────► Third-party MCP
ALLOW: Harness ─► SecB Gateway ─► Approved MCP Adapter
```

No harness (Codex, Claude, Antigravity, other) retains authoritative MCP configuration or unrestricted MCP credentials. Harness-side MCP configuration is limited to the SecB Gateway endpoint (plus harness-vendor internal runtimes). Status 2026-07-19: Codex `config.toml` already conforms — zero third-party MCP servers configured.

## N-2. Normative rule — execution context

Every MCP call through the Gateway carries a SecB-issued `request_context` binding: `agent_id`, `harness_id`, `project_id`, `work_package_id`, `workspace_lease_id`, `session_id`, `authorization_id`, `capability_id`, `purpose`, `evidence_required`. Calls without a resolvable context fail closed.

## N-3. Normative rule — gateway enforcement set

The Gateway enforces, minimally: server/tool allowlists; project-scoped paths; repository and branch scope; read/write classification; human-approval requirements; network egress restrictions; credential-handle resolution (no token passthrough — anti-pattern); request/response size limits; output redaction; timeouts and concurrency limits; evidence-envelope creation; emergency revocation / kill switch.

## N-4. P0 portfolio dispositions (candidate)

| ID   | Capability            | Implementation                          | Disposition                 |
| ---- | --------------------- | --------------------------------------- | --------------------------- |
| P0-A | MCP control plane     | SecB MCP Gateway + private registry     | MANDATORY — BUILD           |
| P0-B | MCP testing           | MCP Inspector (localhost only)          | APPROVE                     |
| P0-C | Workspace retrieval   | Official Filesystem MCP, filtered       | APPROVE WITH WRAPPER        |
| P0-D | Git inspection        | Official Git MCP, filtered              | APPROVE WITH WRAPPER        |
| P0-E | Gitea integration     | SecB Gitea MCP Adapter (REST facade)    | MANDATORY — BUILD           |
| P0-F | Security verification | Semgrep MCP (REV/QA lane)               | APPROVE                     |
| P0-G | Documentation         | Context7 MCP                            | APPROVE WITH RESTRICTIONS   |
| P0-H | Document ingestion    | SecB Document Intake MCP (MarkItDown)   | BUILD AS SANDBOXED WRAPPER  |
| P0-I | Memory recall         | SecB Recall MCP (read-only facade)      | BUILD; BACKEND-GATED        |
| P0-J | GitHub integration    | Official GitHub MCP (read-only+lockdown)| CONDITIONAL (per-project)   |

Deferred/rejected for P0 direct activation: Serena editing; Playwright; unrestricted Fetch; raw PostgreSQL; generic shell/terminal/container MCP; mutable reference-memory as authoritative storage; public-registry auto-installation; direct harness-to-MCP credentials; unfilterable combined read/write servers.

Read-profile details (approved/denied tool lists for Filesystem, Git, Gitea; Semgrep allowed/prohibited operations; Context7 restrictions; Document Intake pipeline; Recall facade and Deja Vu gate) are as enumerated in the derived-from research packet, adopted here by reference pending REV/QA.

## N-5. Intake gates

No MCP server or adapter enters the SecB private registry without the full gate table from the research packet (source identity, immutable version, package integrity, dependency inventory, licensing, tool inventory, capability classification, filesystem boundary, network boundary, credential model, static security, protocol tests, negative tests, evidence envelope, independent review, signed promotion, revocation path). Tool annotations are hints only — untrusted unless the server is trusted.

## N-6. Exit gates for this document

1. Independent REV and QA review recorded (distinct actors from the recording agent).
2. SEC review recorded (MCP permission surface = R3+).
3. Operator/GOV acceptance decision recorded.
4. Only then: work packages may be authorized for P0-A/P0-E builds and adapter intakes.

## Open items

- Assign owner and work-package IDs for P0-A (Gateway) and P0-E (Gitea adapter) builds.
- Decide whether the P0-21 alpha server catalog becomes the Gateway's first in-process adapter or remains a parallel projection lane.
- Define the private-registry record schema (candidate: extend `contracts/agent-registration.schema.json` patterns to capability records).
- Weekly MCP security-and-release watch: proposed in research; not scheduled (operator opt-in).
