/**
 * Ruflo Runtime Provider Plugin adapters for SecB
 * 
 * Registers Ruflo's claude-flow swarm system as a governed agent adapter
 * in SecB's RuntimeRegistry. This enables SecB to manage authority, SoD,
 * and evidence obligations for all Ruflo swarm agents.
 * 
 * Branch: feat/secb-ruflo-command-center
 * ADR compliance: SECB-AGENTS-AMD-002 (advise-and-proceed, ENGIN role)
 */

import {
  RUFLO_RUNTIME_PROVIDER_PLUGIN,
  RUFLO_RUNTIME_PROVIDER_PLUGIN_FINGERPRINT
} from "../runtime/providers/ruflo-runtime-provider-plugin.mjs";

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

/**
 * Ruflo Swarm Coordinator Adapter
 * Governs the UnifiedSwarmCoordinator and all child agents spawned via
 * `npx claude-flow agent spawn`.
 */
export const RUFLO_SWARM_ADAPTER = adapter({
  provider_id: RUFLO_RUNTIME_PROVIDER_PLUGIN.provider_id,
  runtime_product_id: "ruflo",
  runtime_provider_plugin_id: RUFLO_RUNTIME_PROVIDER_PLUGIN.plugin_id,
  runtime_provider_plugin_version: RUFLO_RUNTIME_PROVIDER_PLUGIN.plugin_version,
  runtime_provider_plugin_fingerprint: RUFLO_RUNTIME_PROVIDER_PLUGIN_FINGERPRINT,
  runtime_deployment_id: "RT-RUFLO-LOCAL-001",
  agent_profile_id: "ruflo-swarm-coordinator",
  agent_instance_id: "inst_ruflo_swarm",
  runtime_version: "3.32.9",
  deployment_location: "local",
  owner: "secb-operator",
  permitted_roles: ["ENGIN", "ARCH", "SEC"],
  authority_ceiling: "A1",
  approved_models: ["claude-sonnet-4-6", "claude-opus-4-6"],
  approved_tools: [
    "swarm_init", "agent_spawn", "task_orchestrate",
    "memory_store", "memory_search", "memory_retrieve",
    "hooks_pre_task", "hooks_post_task"
  ],
  approved_mcp_methods: [
    "tools/list", "tools/call", "notifications/initialized"
  ],
  approved_skills: [
    "swarm-orchestration", "memory-management", "verification-quality"
  ],
  repository_scopes: ["secb", "ruflo"],
  project_scopes: ["prj_secb_local"],
  environment_scopes: ["local"],
  max_data_classification: "INTERNAL",
  evidence_obligations: [
    "context-receipt", "event-envelope", "outcome-receipt", "agent-registration"
  ]
});

/**
 * Ruflo Coder Agent Adapter
 * Governs individual coder worker agents within the Ruflo swarm.
 */
export const RUFLO_CODER_ADAPTER = adapter({
  provider_id: RUFLO_RUNTIME_PROVIDER_PLUGIN.provider_id,
  runtime_product_id: "ruflo",
  runtime_provider_plugin_id: RUFLO_RUNTIME_PROVIDER_PLUGIN.plugin_id,
  runtime_provider_plugin_version: RUFLO_RUNTIME_PROVIDER_PLUGIN.plugin_version,
  runtime_provider_plugin_fingerprint: RUFLO_RUNTIME_PROVIDER_PLUGIN_FINGERPRINT,
  runtime_deployment_id: "RT-RUFLO-LOCAL-001",
  agent_profile_id: "ruflo-coder",
  agent_instance_id: "inst_ruflo_coder",
  runtime_version: "3.32.9",
  deployment_location: "local",
  owner: "secb-operator",
  permitted_roles: ["ENGIN"],
  authority_ceiling: "A0",
  approved_models: ["claude-sonnet-4-6"],
  approved_tools: ["read", "edit", "write", "grep", "bash"],
  approved_mcp_methods: [],
  approved_skills: [],
  repository_scopes: ["secb", "ruflo"],
  project_scopes: ["prj_secb_local"],
  environment_scopes: ["local"],
  max_data_classification: "INTERNAL",
  evidence_obligations: ["context-receipt", "event-envelope"]
});

/**
 * Ruflo Reviewer Agent Adapter
 * Governs the dedicated reviewer agent - enforces SecB SoD separation
 * between coder (producer) and reviewer (verifier).
 */
export const RUFLO_REVIEWER_ADAPTER = adapter({
  provider_id: RUFLO_RUNTIME_PROVIDER_PLUGIN.provider_id,
  runtime_product_id: "ruflo",
  runtime_provider_plugin_id: RUFLO_RUNTIME_PROVIDER_PLUGIN.plugin_id,
  runtime_provider_plugin_version: RUFLO_RUNTIME_PROVIDER_PLUGIN.plugin_version,
  runtime_provider_plugin_fingerprint: RUFLO_RUNTIME_PROVIDER_PLUGIN_FINGERPRINT,
  runtime_deployment_id: "RT-RUFLO-LOCAL-001",
  agent_profile_id: "ruflo-reviewer",
  agent_instance_id: "inst_ruflo_reviewer",
  runtime_version: "3.32.9",
  deployment_location: "local",
  owner: "secb-operator",
  permitted_roles: ["ENGIN", "QA"],
  authority_ceiling: "A0",
  approved_models: ["claude-sonnet-4-6"],
  approved_tools: ["read", "grep"],
  approved_mcp_methods: [],
  approved_skills: ["verification-quality"],
  repository_scopes: ["secb", "ruflo"],
  project_scopes: ["prj_secb_local"],
  environment_scopes: ["local"],
  max_data_classification: "INTERNAL",
  evidence_obligations: ["context-receipt", "event-envelope", "outcome-receipt"]
});

export function createRufloAdapterRegistration(base, overrides = {}) {
  const record = { ...base, ...overrides };
  record.evaluation_status = "CANDIDATE";
  record.lifecycle_state = "PENDING";
  return record;
}

export const RUFLO_ADAPTERS = Object.freeze({
  "ruflo-swarm": RUFLO_SWARM_ADAPTER,
  "ruflo-coder": RUFLO_CODER_ADAPTER,
  "ruflo-reviewer": RUFLO_REVIEWER_ADAPTER
});
