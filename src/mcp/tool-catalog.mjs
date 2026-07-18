// SecB MCP Server — frozen alpha tool catalog
//
// Provenance: implements the alpha_tool_allowlist_exact from
// docs/03-project-control/candidates/secb-mcp-server-planning-001.cortex-advisory.yaml.
//
// Doctrine constraints applied here:
//   - Deep-frozen: mutation throws; tools/list is a pure projection of this constant.
//   - Names, descriptions, and parameter schemas are static constants at
//     module load. Nothing dynamic reaches the description channel
//     (tool-description injection defense).
//   - Data-not-instructions: descriptions state what the tool DOES; they
//     do NOT direct the consuming model. Results carry a data_untrusted
//     marker (added by the dispatch pipeline).
//   - Read-only: all tools are projections of underlying service state.
//     ALL mutation surfaces are deliberately excluded per the planning
//     advisory's "deliberately_excluded_from_alpha" clause and defer to V-014.
//   - Reserved delimiters: '|' and '@' are prohibited in every id-typed
//     parameter. The dispatch pipeline enforces DENY_RESERVED_DELIMITER
//     before invoking the underlying service (GOV-P011-08 constant, not
//     re-declared here).
//   - Ajv compilation of these schemas happens at the dispatch pipeline
//     boundary; this module keeps the schemas raw so the catalog itself
//     is dependency-free.

// Recursively freeze a value. Arrays, plain objects, and their contents
// are frozen; primitives are returned as-is. The catalog uses this at
// export time so definitions can be written with natural literals.
function deepFreeze(value) {
  if (value === null || typeof value !== "object") return value;
  if (Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) {
    deepFreeze(value[key]);
  }
  return value;
}

// Shared schema fragments.
const NON_EMPTY_STRING = {
  type: "string",
  minLength: 1,
  // The reserved-delimiter check runs before the underlying service,
  // not via JSON Schema, because the delimiter constant is a governance
  // invariant separate from JSON Schema validation.
};

const OPTIONAL_BASELINE = {
  type: "string",
  minLength: 40,
  maxLength: 40,
  pattern: "^[0-9a-f]{40}$",
  description: "Optional git commit SHA-1 (40 hex chars) selecting an exact baseline; omit for current effective state.",
};

const LEDGER_ENUM = {
  type: "string",
  enum: ["events", "evidence", "durable", "governed"],
};

const CLASSIFICATION_CEILING_ENUM = {
  type: "string",
  enum: ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"],
  description: "Requested ceiling. Effective ceiling = min(server config, caller max, requested). Default INTERNAL if omitted.",
};

// Tool catalog. The exact order here IS the tools/list projection order
// and is part of the catalog fingerprint (rug-pull defense: snapshot
// tested; changing order changes the catalog fingerprint).
const RAW_CATALOG = [
  {
    name: "secb_work_package_resolve_effective",
    description:
      "Returns the effective disposition for a work package version chain: {allow: bool, reason: string, resolved_at: string, baseline: string, fingerprint: string}. Read-only; never mutates. No callable side effects. Underlying service enforces GOV-P011 authority-never-transfers and P0-09 supersession semantics.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["project_id", "work_package_id"],
      properties: {
        project_id: NON_EMPTY_STRING,
        work_package_id: NON_EMPTY_STRING,
        baseline: OPTIONAL_BASELINE,
      },
    },
  },

  {
    name: "secb_project_resolve_effective",
    description:
      "Returns the effective Project Contract for a project at the given baseline (or current effective). Read-only. Depends on ProjectContractService which is on main as of 6152897; missing baseline yields current effective per the service's own supersession rule. Fails closed on unknown project_id.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["project_id"],
      properties: {
        project_id: NON_EMPTY_STRING,
        baseline: OPTIONAL_BASELINE,
      },
    },
  },

  {
    name: "secb_ledger_verify_summary",
    description:
      "Verifies a governed ledger's integrity chain and returns {verified: bool, head_hash: string, count: number}. NEVER returns entry contents (that surface is secb_events_read / secb_evidence_read). Broken chain returns verified=false and a typed reason; partial results are never returned.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["ledger"],
      properties: {
        ledger: LEDGER_ENUM,
      },
    },
  },

  {
    name: "secb_events_read",
    description:
      "Reads events ledger entries as verified, classification-floored projections. Calls verify() before read(); a broken chain returns full-stop typed failure with zero entries. Applies ceiling = min(server, caller, requested). Above-ceiling entries are withheld with truncated:true marker; entry counts are never silently reduced.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {
        ceiling: CLASSIFICATION_CEILING_ENUM,
      },
    },
  },

  {
    name: "secb_evidence_read",
    description:
      "Reads evidence ledger entries as verified, classification-floored projections. Same semantics as secb_events_read but scoped to evidence records rather than events. Reuses src/ui/report-projections.mjs (no second projection implementation).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {
        ceiling: CLASSIFICATION_CEILING_ENUM,
      },
    },
  },

  {
    name: "secb_skill_resolve",
    description:
      "Returns the policy verdict for a skill invocation query: {allow: bool, reason: string, ceiling: string}. Pure policy query; does not resolve an actual skill or invoke it. Context is a caller-supplied JSON object interpreted by the SkillResolver policy layer.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["skill_id", "version"],
      properties: {
        skill_id: NON_EMPTY_STRING,
        version: NON_EMPTY_STRING,
        context: {
          type: "object",
          description: "Caller-supplied context envelope. Keys and structure are interpreted by SkillResolver.",
        },
      },
    },
  },

  {
    name: "secb_registry_resolve",
    description:
      "Returns an identity-or-quarantine projection for an agent instance: {status: 'APPROVED_ACTIVE'|'QUARANTINED', reason: string}. Read-only. Applies the RuntimeRegistry APPROVED+ACTIVE-or-quarantine connection-precondition. Uses the seeded in-memory registry snapshot.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["agent_instance_id"],
      properties: {
        agent_instance_id: NON_EMPTY_STRING,
      },
    },
  },

  {
    name: "secb_contract_validate",
    description:
      "Pure function: validates a document against a named contract kind and returns {valid: bool, errors: array}. Does not persist, does not authorize, does not mutate. Callable safely for any kind in the contract catalog.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "document"],
      properties: {
        kind: {
          type: "string",
          enum: [
            "agent-registration",
            "context-receipt",
            "evidence-envelope",
            "event-envelope",
            "handoff-envelope",
            "project-contract",
            "work-package",
          ],
        },
        document: {
          type: "object",
          description: "The document to validate against the contract schema for the given kind.",
        },
      },
    },
  },

  {
    name: "secb_canonical_fingerprint",
    description:
      "Pure function: returns the canonical SHA-256 fingerprint of a document using SecB's canonical JSON serialization. Deterministic; identical input always yields identical output. Does not persist and does not authorize.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["document"],
      properties: {
        document: {
          type: "object",
          description: "Any JSON-serializable document. The canonical form is defined by SecB's canonical serializer (not by the caller's key order).",
        },
      },
    },
  },
];

// Freeze the catalog and derived views on export. This is a startup
// invariant — subsequent code cannot mutate any part of the catalog.
export const TOOL_CATALOG = deepFreeze(RAW_CATALOG);

// Convenience: name -> tool projection. Not the tools/list channel; that
// projection is exported by the dispatch pipeline. This map is for
// internal lookup only.
export const TOOL_BY_NAME = deepFreeze(
  Object.fromEntries(TOOL_CATALOG.map((t) => [t.name, t])),
);
