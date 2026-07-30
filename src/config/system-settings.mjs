/**
 * SecB Central System Settings Service
 *
 * Manages machine-readable system configuration, port topology, governance ceilings,
 * security limits, and ledger storage locations per ADR-SECB-RUFLO-001 & ADR-002.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createAjv } from "../contracts/lazy-ajv.mjs";

const schemaPath = resolve(import.meta.dirname, "..", "..", "contracts", "system-settings.schema.json");
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));

// Compiled on first validation, not at import — see lazy-ajv.mjs.
let validate = null;
const getValidate = () => (validate ??= createAjv({ allErrors: true, strict: true, useDefaults: true }).compile(schema));

export class SystemSettingsError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SystemSettingsError";
    this.code = code;
  }
}

export const DEFAULT_SYSTEM_SETTINGS = Object.freeze({
  schema_version: "1.0",
  environment: "development",
  governance: {
    policy_ceiling: "A0",
    enforce_sod: true,
    fail_closed: true,
    max_data_classification: "INTERNAL"
  },
  ports: {
    control_api: 3000,
    event_ingress: 3001,
    ruflo_ui: 3002,
    ruflo_mcp: 3003,
    ruflo_adapter: 3004,
    secb_mcp: 3005
  },
  swarm: {
    default_topology: "hierarchical",
    max_agents: 8,
    task_timeout_sec: 300,
    cost_ceiling_usd: 20.0
  },
  security: {
    secret_scanning: true,
    path_traversal_prevention: true,
    cve_scanning: true,
    blocked_file_patterns: ["\\.env$", "credentials\\.json$", "\\.pem$", "\\.key$"]
  },
  knowledge: {
    graphify_enabled: true,
    ast_cache_enabled: true,
    compression_mode: "71.5x",
    backend: "code-only",
    ollama_base_url: "http://localhost:11434",
    api_timeout_sec: 600,
    max_workers: 8,
    max_graph_mb: 512
  },
  ledgers: {
    event_ledger_path: ".secb/ledger/events.ndjson",
    evidence_ledger_path: ".secb/ledger/evidence.ndjson",
    storage_backend: "local_ndjson"
  }
});

let _activeSettings = structuredClone(DEFAULT_SYSTEM_SETTINGS);

/**
 * Validate a candidate settings object against system-settings.schema.json.
 */
export function validateSystemSettings(settings) {
  const candidate = structuredClone(settings);
  const check = getValidate();
  if (!check(candidate)) {
    const errors = check.errors?.map(e => `${e.instancePath} ${e.message}`).join("; ") ?? "Schema error";
    throw new SystemSettingsError("INVALID_SYSTEM_SETTINGS", `System settings validation failed: ${errors}`);
  }
  return Object.freeze(candidate);
}

/**
 * Get active deep-frozen system settings.
 */
export function getSystemSettings() {
  return Object.freeze(structuredClone(_activeSettings));
}

/**
 * Update system settings with overrides.
 */
export function updateSystemSettings(overrides = {}) {
  const merged = {
    ..._activeSettings,
    ...overrides,
    governance: { ..._activeSettings.governance, ...(overrides.governance ?? {}) },
    ports: { ..._activeSettings.ports, ...(overrides.ports ?? {}) },
    swarm: { ..._activeSettings.swarm, ...(overrides.swarm ?? {}) },
    security: { ..._activeSettings.security, ...(overrides.security ?? {}) },
    knowledge: { ..._activeSettings.knowledge, ...(overrides.knowledge ?? {}) },
    ledgers: { ..._activeSettings.ledgers, ...(overrides.ledgers ?? {}) }
  };
  _activeSettings = validateSystemSettings(merged);
  return getSystemSettings();
}

/**
 * Reset active settings to DEFAULT_SYSTEM_SETTINGS.
 */
export function resetSystemSettings() {
  _activeSettings = structuredClone(DEFAULT_SYSTEM_SETTINGS);
  return getSystemSettings();
}
