// P0-21 SecB MCP Server - FROZEN alpha tool catalog (GOV-MCP-03).
// READ-ONLY tools only; no mutation surface exists in alpha. Descriptions
// are static constants (a description is itself a model-instruction channel;
// no ledger- or caller-derived text may ever reach it). idParams are scanned
// for reserved delimiters before dispatch. The catalog is deep-frozen and
// tools/list is a pure projection of it.

export const PINNED_PROTOCOL_VERSION = "2025-06-18";

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

export const TOOL_CATALOG = freeze([
  {
    name: "secb_work_package_resolve_effective",
    description: "Resolve the effective work-package contract for a project and work package at an asserted baseline. Read-only; returns the governed resolution verdict.",
    required: ["project_id", "work_package_id"],
    optional: ["baseline"],
    idParams: ["project_id", "work_package_id"]
  },
  {
    name: "secb_project_resolve_effective",
    description: "Resolve the effective project contract for a project at an asserted baseline. Read-only.",
    required: ["project_id"],
    optional: ["baseline"],
    idParams: ["project_id"]
  },
  {
    name: "secb_ledger_verify_summary",
    description: "Verify a governed ledger's hash chain and return { verified, headHash, count }. Never returns entry contents.",
    required: ["ledger"],
    optional: [],
    idParams: []
  },
  {
    name: "secb_events_read",
    description: "Return the verified event-ledger projection under the effective classification floor. Fails closed on a broken chain.",
    required: [],
    optional: [],
    idParams: []
  },
  {
    name: "secb_evidence_read",
    description: "Return the verified evidence-ledger projection under the effective classification floor. Fails closed on a broken chain.",
    required: [],
    optional: [],
    idParams: []
  },
  {
    name: "secb_skill_resolve",
    description: "Resolve a skill version for a project/runtime/data-classification context. Read-only policy query; returns the ALLOW or typed-DENY verdict.",
    required: ["skill_id", "version", "context"],
    optional: [],
    idParams: ["skill_id"]
  },
  {
    name: "secb_registry_resolve",
    description: "Resolve an agent-instance identity or its quarantine reason from the runtime registry. Read-only.",
    required: ["agent_instance_id"],
    optional: [],
    idParams: ["agent_instance_id"]
  },
  {
    name: "secb_contract_validate",
    description: "Validate a document against a governed contract schema. Pure function; returns the validation verdict.",
    required: ["kind", "document"],
    optional: [],
    idParams: []
  },
  {
    name: "secb_canonical_fingerprint",
    description: "Compute the canonical SHA-256 fingerprint of a document. Pure function.",
    required: ["document"],
    optional: [],
    idParams: []
  },
  {
    name: "secb_graph_build",
    description: "Scan target codebase folder AST triples, degree centrality, and Louvain community clusters. Saves token costs by returning a high-level graph summary.",
    required: [],
    optional: ["targetDir"],
    idParams: []
  },
  {
    name: "secb_agent_config_resolve",
    description: "Resolve effective agent role capabilities, security ceilings, and profile rules from .secb/agent-config.toml. Pure function; returns resolution verdict.",
    required: ["agent_type"],
    optional: [],
    idParams: ["agent_type"]
  },
  {
    name: "secb_skill_hub_search",
    description: "Token-efficient search across local governed skills in .agents/skills/ with classification ceiling enforcement. Pure function; returns minimal skill snippets.",
    required: [],
    optional: ["query"],
    idParams: []
  },
  {
    name: "secb_worktree_status",
    description: "Resolve structure, crate counts, and app layout for the Worktree repository. Read-only.",
    required: [],
    optional: ["worktreeDir"],
    idParams: []
  },
  {
    name: "secb_worktree_list_crates",
    description: "List Rust workspace crates and Cargo metadata in the Worktree repository. Read-only.",
    required: [],
    optional: ["worktreeDir"],
    idParams: []
  },
  {
    name: "secb_worktree_inspect_storage",
    description: "Inspect worktree-server content-addressable storage backend configuration and zip artifacts. Read-only.",
    required: [],
    optional: ["worktreeDir"],
    idParams: []
  },
  {
    name: "secb_project_register_draft",
    description: "Conduct non-mutating discovery and stage a proposal-only Project Registration Package in SecB staging boundary. Read-only.",
    required: ["project_id"],
    optional: ["name", "owners", "classification", "repository_path"],
    idParams: ["project_id"]
  },
  {
    name: "secb_project_registration_inspect",
    description: "Inspect staged Project Registration Package and proposed artifacts for a registered project ID. Read-only.",
    required: ["project_id"],
    optional: [],
    idParams: ["project_id"]
  },
  {
    name: "secb_project_proposed_manifest_verify",
    description: "Verify SHA-256 canonical fingerprints of proposed change manifests for a registered project. Read-only.",
    required: ["project_id"],
    optional: [],
    idParams: ["project_id"]
  },
  {
    name: "secb_project_registration_projection",
    description: "Format staged Project Registration Packages and proposed change manifests for dashboard UI visualizers. Read-only.",
    required: [],
    optional: ["stagingBaseDir"],
    idParams: []
  },
  {
    name: "secb_plane_adapter_inspect",
    description: "Inspect SecB Plane Plugin Adapter configuration and work-package issue state mappings. Read-only.",
    required: [],
    optional: ["planeEndpoint", "projectId"],
    idParams: []
  },
  {
    name: "secb_knowledge_cross_project_synthesize",
    description: "Synthesize AST Knowledge Graphs and project registration metadata into token-efficient context receipts. Read-only.",
    required: [],
    optional: ["projectId"],
    idParams: []
  },
  {
    name: "secb_swarm_delegation_verify",
    description: "Verify subagent swarm task delegation chain integrity and Separation of Duties compliance. Read-only.",
    required: ["delegation_id"],
    optional: [],
    idParams: ["delegation_id"]
  },
  {
    name: "secb_module_recommend",
    description: "Generate structured advisory next-step recommendations for SecB modules per Advise-and-Proceed Decision Rule. Read-only.",
    required: ["module"],
    optional: ["currentStatus"],
    idParams: ["module"]
  },
  {
    name: "secb_brain_query",
    description: "Perform ceiling-filtered searches across SecB Second Brain PARA categories and return context receipts. Read-only.",
    required: [],
    optional: ["query", "category"],
    idParams: []
  },
  {
    name: "secb_brain_inspect_para",
    description: "Inspect SecB Second Brain PARA framework summary (Projects, Areas, Resources, Archives counts). Read-only.",
    required: [],
    optional: [],
    idParams: []
  },
  {
    name: "secb_brain_maturity_promote",
    description: "Inspect or advance Knowledge Maturity Pipeline stages (Session -> Evidence -> Knowledge -> Experience -> Skill). Read-only.",
    required: ["pipeline_id"],
    optional: [],
    idParams: ["pipeline_id"]
  },
  {
    name: "secb_project_worktree_manage",
    description: "Inspect project Git worktree allocation and verify evidence-sealed merge readiness. Read-only.",
    required: ["allocation_id"],
    optional: [],
    idParams: ["allocation_id"]
  },
  {
    name: "secb_project_milestones_inspect",
    description: "Inspect project milestone release targets, sprint exit criteria, and linked work packages. Read-only.",
    required: ["milestone_id"],
    optional: [],
    idParams: ["milestone_id"]
  },
  {
    name: "secb_implementation_merge_verify",
    description: "Verify pre-merge release invariants and inspect MergeReleasePacket status. Read-only.",
    required: ["release_id"],
    optional: [],
    idParams: ["release_id"]
  },
  {
    name: "secb_openproject_adapter_inspect",
    description: "Inspect SecB OpenProject Plugin Adapter configuration and Work Package mappings. Read-only.",
    required: [],
    optional: ["openprojectEndpoint", "projectId"],
    idParams: []
  },
  {
    name: "secb_bus_events_inspect",
    description: "Inspect live inter-module control plane bus event history and audit fingerprints. Read-only.",
    required: [],
    optional: ["limit", "eventType"],
    idParams: []
  },
  {
    name: "secb_memory_consolidate_inspect",
    description: "Inspect multi-tiered memory summary across short-term, working, and long-term PARA memory stores. Read-only.",
    required: [],
    optional: [],
    idParams: []
  },
  {
    name: "secb_dashboard_inspect",
    description: "Inspect real-time system dashboard state aggregating Stages 1 through 9. Read-only.",
    required: [],
    optional: [],
    idParams: []
  },
  {
    name: "secb_system_settings_inspect",
    description: "Inspect active central system configuration, ports, classification ceilings, and limits. Read-only.",
    required: [],
    optional: [],
    idParams: []
  },
  {
    name: "secb_governance_dossier_generate",
    description: "Generate a printable Governance Audit Dossier for a registered project. Read-only.",
    required: [],
    optional: ["projectId"],
    idParams: ["projectId"]
  },
  {
    name: "secb_mcp_upstream_resolve",
    description: "Project the declared MCP upstream registry onto a host and return each upstream's spawn plan or its typed unreachability reason. Read-only; resolving a plan never starts an upstream.",
    required: [],
    optional: ["host"],
    idParams: ["host"]
  }
]);

export const CATALOG_BY_NAME = freeze(Object.fromEntries(TOOL_CATALOG.map((t) => [t.name, t])));
