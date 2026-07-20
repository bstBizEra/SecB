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
  }
]);

export const CATALOG_BY_NAME = freeze(Object.fromEntries(TOOL_CATALOG.map((t) => [t.name, t])));
