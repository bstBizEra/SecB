# SecB P0 MCP Tooling Research (Recorded Candidate)

**Document ID:** SECB-MCP-RESEARCH-2026-07-19
**Status:** DRAFT / NOT EFFECTIVE — recorded research evidence, not an approved control
**Classification:** EXTERNAL_REFERENCE (cites external sources; claims not independently re-verified by SecB)
**Provenance:** Operator-supplied research packet, delivered 2026-07-19 in a Claude (BST-SA worker) session; recorded verbatim below the marker. Recording agent: Claude (BST-SA, motor/hippocampus). External citations were not re-fetched at recording time.
**Governance note:** This document proposes MCP/A2A-relevant controls. Per `docs/AGENTS.md`, any change that alters MCP/A2A permissions requires independent REV and QA before becoming effective. The normative candidate derived from this research is [`secb-mcp-p0-001-control-plane.md`](secb-mcp-p0-001-control-plane.md).

---

<!-- VERBATIM RESEARCH PACKET BEGINS -->

## Executive disposition

For SecB P0, the best-fit model is **not to install multiple MCP servers directly into Codex, Claude, or other harnesses**.

The recommended operating model is:

```text
Codex / Claude / Other Harnesses
                │
                ▼
        SecB MCP Gateway
        ├─ Agent identity
        ├─ Project Contract
        ├─ Workspace Lease
        ├─ Tool allowlist
        ├─ Authorization policy
        ├─ Input validation
        ├─ Secret brokering
        ├─ Output redaction
        └─ Evidence receipt
                │
                ▼
       Approved MCP Adapters
```

MCP tools can expose arbitrary data-access and code-execution paths, and even MCP tool annotations must be treated as untrusted unless the server itself is trusted. The protocol therefore expects explicit authorization and strong host-side controls.

The public MCP Registry should only be treated as a **discovery and intake source**. It is currently in preview, stores metadata pointing to public packages or services, does not support private servers, and recommends a private registry for internal deployments.

## 1. Recommended P0 MCP portfolio

| Priority | Capability              | Recommended implementation                           | P0 disposition                 |
| -------- | ----------------------- | ---------------------------------------------------- | ------------------------------ |
| P0-A     | MCP control plane       | **SecB MCP Gateway and private capability registry** | **MANDATORY — BUILD**          |
| P0-B     | MCP testing             | Official **MCP Inspector**                           | **APPROVE**                    |
| P0-C     | Workspace retrieval     | Official **Filesystem MCP**, filtered                | **APPROVE WITH WRAPPER**       |
| P0-D     | Git inspection          | Official **Git MCP**, filtered                       | **APPROVE WITH WRAPPER**       |
| P0-E     | Gitea integration       | **SecB Gitea MCP Adapter** using Gitea REST API      | **MANDATORY — BUILD**          |
| P0-F     | Security verification   | **Semgrep MCP**                                      | **APPROVE**                    |
| P0-G     | Technical documentation | **Context7 MCP**                                     | **APPROVE WITH RESTRICTIONS**  |
| P0-H     | Document ingestion      | **SecB Document Intake MCP** using MarkItDown        | **BUILD AS SANDBOXED WRAPPER** |
| P0-I     | Memory recall           | **SecB Recall MCP**                                  | **BUILD; BACKEND-GATED**       |
| P0-J     | GitHub integration      | Official **GitHub MCP Server**                       | **CONDITIONAL**                |
| P1+      | Semantic code editing   | Serena                                               | **DEFER**                      |
| P1+      | Browser automation      | Playwright MCP                                       | **DEFER**                      |
| P1+      | General web retrieval   | Fetch MCP                                            | **DEFER OR DOMAIN-ALLOWLIST**  |

### Recommended P0 baseline

1. SecB MCP Gateway
2. SecB private MCP registry
3. MCP Inspector
4. Filesystem read adapter
5. Git read adapter
6. Gitea read adapter
7. Semgrep verification adapter
8. Context7 documentation adapter
9. Document Intake adapter
10. Recall adapter

Only the first eight need to be operational for the initial Project Registration and Repository Conformance pilot. Document intake and recall can follow immediately after the core boundary controls pass.

## 2. SecB MCP Gateway — mandatory control plane

This is the most important P0 component. It should be owned by SecB rather than sourced as a generic third-party gateway.

Every MCP call should carry a SecB-issued execution context:

```yaml
request_context:
  agent_id: agent.codex.builder.01
  harness_id: codex-desktop
  project_id: SECB
  work_package_id: SECB-P0-WP-003
  workspace_lease_id: lease-20260719-001
  session_id: session-uuid
  authorization_id: auth-uuid
  capability_id: filesystem.read
  purpose: repository-conformance-analysis
  evidence_required: true
```

The gateway must enforce: server and tool allowlists; project-scoped paths; repository and branch scope; read/write classification; human-approval requirements; network egress restrictions; credential-handle resolution; request and response size limits; output redaction; timeouts and concurrency limits; evidence-envelope creation; emergency revocation and kill switch.

Credentials must not be passed through from an agent to downstream services. MCP security guidance explicitly classifies token passthrough as an anti-pattern because it weakens audience validation, auditing, attribution, and trust boundaries.

### Required architectural rule

```text
DENY:
Harness ───────────────► Third-party MCP

ALLOW:
Harness ─► SecB Gateway ─► Approved MCP Adapter
```

No Codex, Claude, Antigravity, or other harness should retain unrestricted MCP credentials or authoritative MCP configuration.

## 3. Official MCP Inspector — approve for conformance testing

MCP Inspector provides both an interactive UI and CLI for listing tools, invoking them, examining responses, and testing different transports. It supports `stdio`, SSE, and Streamable HTTP.

P0 use cases: tool inventory; input and output schema snapshots; invalid-input results; boundary-escape tests; read-only enforcement tests; destructive-tool denial tests; authentication tests; timeout tests; evidence-receipt validation; regression test fixtures.

Security restriction: the Inspector proxy can launch local processes and must remain bound to localhost or an isolated test network. Its own documentation warns against exposing the proxy to untrusted networks.

**Disposition:** approved as a testing and certification tool, but not as a permanent production gateway.

## 4. Filesystem MCP — approve only through strict filtering

The official Filesystem MCP supports file reads, writes, directory creation and deletion, moves, searches, and metadata retrieval. It can restrict access to configured directories, but client-provided Roots may replace server-side directory settings. For SecB, directory authority must remain server-side. Do not depend on the harness to declare safe roots.

### P0 approved paths

```text
C:\laragon\www\SecB
C:\laragon\www\SecB-evidence
C:\laragon\www\SecB-worktrees\<authorized-lease>
```

Each work package should receive only the smallest applicable subset.

### P0 approved tools (pure-read operations)

```text
read_text_file
read_media_file
read_multiple_files
list_directory
list_directory_with_sizes
directory_tree
search_files
get_file_info
list_allowed_directories
```

### P0 denied tools

```text
write_file
edit_file
create_directory
move_file
delete or overwrite operations
```

Even when a project is authorized for implementation, filesystem mutation should be performed through a separate **Workspace Mutation MCP profile**, not by expanding the registration profile.

**Disposition:** approve the official implementation as an upstream dependency, but expose only a SecB-owned filtered interface.

## 5. Git MCP — approve for inspection, not mutation

The official Git MCP can inspect and manipulate repositories and is explicitly described as being in early development.

### P0 approved capabilities

```text
git_status
git_diff_unstaged
git_diff_staged
git_diff
git_log
git_show
git_branch        # listing only
```

### P0 denied capabilities

```text
git_add
git_commit
git_reset
git_create_branch
git_checkout
push
merge
rebase
tag creation
remote modification
```

Although `git_checkout` may appear operationally minor, it changes the working-tree state and therefore violates the deterministic read-only registration boundary.

### Recommended architecture

```text
SecB Git Read MCP
      │
      ├── libgit2 / git executable
      ├── command allowlist
      ├── canonical path validation
      ├── repository identity check
      ├── timeout
      └── normalized Git Evidence Envelope
```

The upstream Git MCP can be used as a reference or internal dependency, but it should not be exposed directly to agents during P0.

## 6. Gitea MCP — build a SecB-native adapter

Because the primary SecB repository provider is the local Gitea instance, Gitea should be treated as a first-class provider rather than forcing GitHub semantics onto it. Gitea exposes an official REST API and OpenAPI specification, making it practical to build a narrow SecB MCP facade with only the required endpoints.

### P0 Gitea tools

```text
gitea_get_repository
gitea_get_repository_settings
gitea_list_branches
gitea_get_branch_protection
gitea_get_commit
gitea_list_commits
gitea_list_pull_requests
gitea_get_pull_request
gitea_list_issues
gitea_get_issue
gitea_list_workflows
gitea_get_workflow_run
gitea_list_webhooks_metadata
gitea_get_repository_permissions
```

### Explicitly excluded from the P0 profile

```text
create_repository
update_repository
create_branch
push_commit
merge_pull_request
create_or_modify_webhook
create_token
modify_collaborator
modify_branch_protection
trigger_workflow
delete_anything
```

### Authentication model

Use a dedicated Gitea service account with a minimal read scope. The token should be stored by the SecB Credential Broker and injected only into the Gitea adapter process. It must never be given to the agent runtime.

## 7. Semgrep MCP — approve as the independent verification lane

Semgrep provides an MCP server started through `semgrep mcp`, allowing coding assistants to run Semgrep scans. Semgrep supports code analysis, dependency analysis, and secrets detection capabilities.

P0 role: Semgrep should act as a **REV/QA verification service**, not as the implementation agent's self-approval mechanism.

P0 allowed operations: scan an authorized path or Git diff; apply approved, pinned rulesets; return structured findings; return rule identifiers and source locations; produce SARIF or normalized SecB findings; record scanner and ruleset versions.

P0 prohibited operations: automatic source-code correction; unreviewed custom-rule generation; downloading arbitrary community rules during execution; suppressing findings without a decision record; treating a clean scan as authorization to merge.

**Disposition:** one of the strongest third-party MCP candidates for P0.

## 8. Context7 MCP — approve as external documentation evidence

Context7 exposes two narrow MCP tools (`resolve-library-id`, `query-docs`) and supports library-specific and version-specific documentation retrieval. This is well aligned with P0 because it provides retrieval rather than repository mutation.

Required SecB restrictions: approved library allowlist; version must be declared where material; maximum result size; no automatic dependency installation; no automatic code execution; retrieved text classified as `EXTERNAL_REFERENCE`; documentation must not override project policy or approved architecture; hash and source metadata recorded in the context receipt.

Context7 states that its indexed projects are community-contributed and that it cannot guarantee the accuracy, completeness, or security of every library's documentation. Therefore, Context7 output should be treated as **supporting technical evidence**, not an authoritative SecB decision source.

## 9. MarkItDown — build a sandboxed Document Intake MCP

MarkItDown converts documents and files into Markdown while preserving structures such as headings, lists, tables, and links. It should not be executed directly by an agent: it performs I/O with the privileges of its process and explicitly recommends sanitizing untrusted input, restricting paths and URI schemes, and using the narrowest conversion function.

### Recommended wrapper

```text
SecB Document Intake MCP
    │
    ├── Upload quarantine
    ├── MIME verification
    ├── File-size limit
    ├── Archive depth limit
    ├── Malware scan
    ├── Macro rejection
    ├── Network disabled
    ├── Read-only temporary volume
    ├── MarkItDown conversion
    ├── Content redaction
    └── Evidence + provenance receipt
```

### P0 tools

```text
document_inspect_metadata
document_convert_to_markdown
document_extract_structure
document_generate_content_hash
document_get_conversion_receipt
```

The original document should remain immutable in the evidence store; the Markdown output is a derived artifact.

## 10. Recall MCP — build as a SecB facade

Agents should not connect directly to a memory database. The correct boundary:

```text
Agent
  │
  ▼
SecB Recall MCP
  ├─ Project scope
  ├─ Classification check
  ├─ Purpose check
  ├─ Retrieval limits
  ├─ Provenance
  ├─ Context receipt
  └─ No write tools
        │
        ▼
Approved recall backend
```

The official Qdrant MCP exposes both `qdrant-store` and `qdrant-find`, and provides a `QDRANT_READ_ONLY` mode that disables storage. For P0, only a retrieval operation equivalent to `qdrant-find` should be available.

### Deja Vu status consideration

The current controlling Deja Vu disposition remains `P0-020_PHASE_A_EXPIRED_BLOCKED_PREREQUISITES`. Therefore: do not install or operationally activate Deja Vu under the expired authorization; build and test the SecB Recall MCP contract against fixtures or an approved read-only backend; connect Deja Vu only after a new intake authorization explicitly permits repository access, execution, MCP registration, evaluation, and evidence production. This preserves the architecture decision without bypassing the existing fail-closed state.

## 11. GitHub MCP — conditional provider adapter

The official GitHub MCP Server supports explicit toolset allowlists, read-only mode, lockdown mode, and repository/issue/pull-request/Actions/security-oriented toolsets. Recommended configuration concept:

```text
--read-only
--lockdown-mode
--toolsets repos,pull_requests,issues,actions,code_security,secret_protection
```

The actual exposed tools should still be filtered by the SecB Gateway.

**P0 disposition:** include only when a registered project declares GitHub as an approved provider. Do not include it in every agent's default tool context because Gitea is the primary SecB repository provider.

## 12. Tools to defer or reject

- **Serena** — defer to controlled P1 (combined retrieval-and-editing surface exceeds the P0 registration boundary; requires tool-level filtering, authorized worktree leases, bounded mutation, diff limits, independent verification, rollback receipts). A future `SecB Semantic Code MCP` could use Serena internally while exposing only retrieval operations at first.
- **Playwright MCP** — defer to P1 Live Operations or Evaluation (external-world interaction, authentication-session exposure, download/upload risks, private-network access, form-submission mutation, prompt injection from webpages). Use an ephemeral browser, disposable profile, domain allowlist, no personal credentials, no unrestricted localhost access.
- **Fetch MCP** — defer or severely restrict (SSRF and data-exfiltration risk; use domain-specific retrieval adapters during P0).
- **Reference Memory MCP** — reject as authoritative memory (lacks project isolation, classification-aware retrieval, decision provenance, retention policy, evidence linkage, maker-checker promotion, revocation, governed write lifecycle).
- **Raw PostgreSQL MCP** — reject; implement task-specific read models (`project_registry_get`, `work_package_get`, `evidence_query`, `decision_query`, `capability_registry_get`) with tenant and project boundaries enforced inside the facade.
- **Shell, Podman and unrestricted process MCP** — reject from P0. No generic tool should accept arbitrary commands, executable paths, container images or environment variables from an agent.

## 13. Mandatory MCP intake gates

| Gate                      | Required evidence                                          |
| ------------------------- | ---------------------------------------------------------- |
| Source identity           | Maintainer, canonical repository and namespace             |
| Immutable version         | Exact Git commit, release tag and container digest         |
| Package integrity         | SHA-256 and signature where available                      |
| Dependency inventory      | Lockfile and SBOM                                          |
| Licensing                 | License and redistribution disposition                     |
| Tool inventory            | Every tool, resource and prompt enumerated                 |
| Capability classification | Read-only, mutating, destructive, external-world           |
| Filesystem boundary       | Explicit read/write paths                                  |
| Network boundary          | Explicit destinations, ports and DNS behavior              |
| Credential model          | Credential broker handle; no plaintext secret              |
| Static security           | Source, dependency and secret scan                         |
| Protocol tests            | Initialize, list, invoke, cancel and timeout               |
| Negative tests            | Traversal, injection, oversize input and unauthorized tool |
| Evidence                  | Complete test and decision envelope                        |
| Independent review        | REV/QA actor distinct from intake implementer              |
| Promotion                 | Signed approval into private registry                      |
| Revocation                | Disable switch and known-bad version list                  |

Tool annotations may be used as hints during intake, but they must be independently verified because the MCP specification says these descriptions are untrusted unless received from a trusted server.

## Final recommendation

**Approve for SecB P0:** SecB MCP Gateway; SecB Private MCP Registry; MCP Inspector; Filesystem MCP (read-only filtered); Git MCP (read-only filtered); SecB Gitea MCP Adapter; Semgrep MCP; Context7 MCP (restricted); SecB Document Intake MCP with MarkItDown; SecB Recall MCP (read-only, backend separately authorized); GitHub MCP (project-conditional).

**Do not approve for P0 direct activation:** Serena editing; Playwright browser automation; unrestricted Fetch; raw PostgreSQL; generic shell or terminal MCP; container-management MCP; Reference Memory as authoritative storage; direct public-registry auto-installation; direct Codex/Claude-to-MCP credentials; any MCP with combined read/write tools that cannot be filtered.

External sources cited by the original packet: MCP specification 2025-11-25; MCP Registry about page; MCP security best practices; modelcontextprotocol/inspector; modelcontextprotocol/servers (filesystem, git); Gitea API docs; semgrep/semgrep; upstash/context7; microsoft/markitdown; qdrant/mcp-server-qdrant; github/github-mcp-server; oraios/serena; microsoft/playwright-mcp.

<!-- VERBATIM RESEARCH PACKET ENDS -->
