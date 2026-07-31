const ADAPTER_DEFAULTS = Object.freeze({
  evaluation_status: "CANDIDATE",
  lifecycle_state: "PENDING",
  delegation_rights: [],
  project_scopes: [],
  workload_identity_ref: ""
});

function adapter(definition) {
  return Object.freeze({ ...ADAPTER_DEFAULTS, ...definition });
}

export const CLAUDE_CODE_ADAPTER = adapter({
  provider_id: "anthropic",
  runtime_product_id: "claude-code",
  runtime_deployment_id: "claude-code-local",
  agent_profile_id: "claude-code-motor",
  agent_instance_id: "inst_claude_code",
  runtime_version: "1.0.0",
  deployment_location: "local",
  owner: "secb-operator",
  permitted_roles: ["ENGIN"],
  authority_ceiling: "A0",
  approved_models: ["claude-opus-4-6", "claude-sonnet-4"],
  approved_tools: ["read", "edit", "write", "grep", "glob", "bash"],
  approved_mcp_methods: [],
  approved_skills: [],
  repository_scopes: ["secb"],
  project_scopes: ["prj_secb_local"],
  environment_scopes: ["local"],
  max_data_classification: "INTERNAL",
  evidence_obligations: ["context-receipt", "event-envelope"]
});

export const CODEX_ADAPTER = adapter({
  provider_id: "openai",
  runtime_product_id: "codex-cli",
  runtime_deployment_id: "codex-cli-local",
  agent_profile_id: "codex-motor",
  agent_instance_id: "inst_codex_cli",
  runtime_version: "1.0.0",
  deployment_location: "local",
  owner: "secb-operator",
  permitted_roles: ["ENGIN"],
  authority_ceiling: "A0",
  approved_models: ["codex"],
  approved_tools: ["read", "edit", "write", "grep", "bash"],
  approved_mcp_methods: [],
  approved_skills: [],
  repository_scopes: ["secb"],
  project_scopes: ["prj_secb_local"],
  environment_scopes: ["local"],
  max_data_classification: "INTERNAL",
  evidence_obligations: ["context-receipt", "event-envelope"]
});

export const GENERIC_ADAPTER = adapter({
  provider_id: "generic",
  runtime_product_id: "generic-agent",
  runtime_deployment_id: "generic-local",
  agent_profile_id: "generic-observer",
  agent_instance_id: "inst_generic",
  runtime_version: "0.0.0",
  deployment_location: "local",
  owner: "secb-operator",
  permitted_roles: [],
  authority_ceiling: "A0",
  approved_models: [],
  approved_tools: [],
  approved_mcp_methods: [],
  approved_skills: [],
  repository_scopes: [],
  environment_scopes: ["local"],
  max_data_classification: "INTERNAL",
  evidence_obligations: ["event-envelope"]
});

export const GEMINI_CLI_ADAPTER = adapter({
  provider_id: "google",
  runtime_product_id: "gemini-cli",
  runtime_deployment_id: "gemini-cli-local",
  agent_profile_id: "gemini-motor",
  agent_instance_id: "inst_gemini_cli",
  runtime_version: "1.0.0",
  deployment_location: "local",
  owner: "secb-operator",
  permitted_roles: ["ENGIN", "RESEARCH"],
  authority_ceiling: "A0",
  approved_models: ["gemini-3.6-flash", "gemini-3.6-pro"],
  approved_tools: ["read", "edit", "write", "grep", "bash"],
  approved_mcp_methods: [],
  approved_skills: [],
  repository_scopes: ["secb"],
  project_scopes: ["prj_secb_local"],
  environment_scopes: ["local"],
  max_data_classification: "INTERNAL",
  evidence_obligations: ["context-receipt", "event-envelope"]
});

export const KIMI_CLI_ADAPTER = adapter({
  provider_id: "moonshot",
  runtime_product_id: "kimi-cli",
  runtime_deployment_id: "kimi-cli-local",
  agent_profile_id: "kimi-motor",
  agent_instance_id: "inst_kimi_cli",
  runtime_version: "1.0.0",
  deployment_location: "local",
  owner: "secb-operator",
  permitted_roles: ["ENGIN", "RESEARCH"],
  authority_ceiling: "A0",
  approved_models: ["kimi-k1.5"],
  approved_tools: ["read", "edit", "write", "grep", "bash"],
  approved_mcp_methods: [],
  approved_skills: [],
  repository_scopes: ["secb"],
  project_scopes: ["prj_secb_local"],
  environment_scopes: ["local"],
  max_data_classification: "INTERNAL",
  evidence_obligations: ["context-receipt", "event-envelope"]
});

export function createAdapterRegistration(base, overrides = {}) {
  const record = { ...base, ...overrides };
  record.evaluation_status = "CANDIDATE";
  record.lifecycle_state = "PENDING";
  return record;
}

export const KNOWN_ADAPTERS = Object.freeze({
  "claude-code": CLAUDE_CODE_ADAPTER,
  "codex-cli": CODEX_ADAPTER,
  "gemini-cli": GEMINI_CLI_ADAPTER,
  "kimi-cli": KIMI_CLI_ADAPTER,
  "generic-agent": GENERIC_ADAPTER
});
