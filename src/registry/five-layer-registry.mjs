/**
 * SecB 5-Layer Provider-Neutral Agent & Runtime Registry Architecture
 * Per ADR-SECB-AGENT-RUNTIME-001 §1 & §4.
 *
 * Layers:
 *  1. ProviderRegistry (Vendor e.g. OpenAI, Anthropic, Google, Moonshot)
 *  2. ModelRegistry (Reasoning model specs e.g. gpt-4o, claude-sonnet, gemini-3.6-flash, kimi-k1.5)
 *  3. RuntimeRegistryFiveLayer (Installed executable/CLI harness e.g. codex, claude, gemini, kimi)
 *  4. AgentRegistryFiveLayer (Governed SecB worker identity e.g. codex-implementer-01)
 *  5. SessionRegistry (Active execution instance with PID, worktree, work package ID)
 */

export const RUNTIME_LIFECYCLE_STATES = Object.freeze([
  "DISCOVERED",
  "INSPECTED",
  "CONFORMANCE_PENDING",
  "APPROVAL_PENDING",
  "ACTIVE",
  "DEGRADED",
  "QUARANTINED",
  "RETIRED"
]);

export const VALID_LIFECYCLE_TRANSITIONS = Object.freeze({
  DISCOVERED: ["INSPECTED", "QUARANTINED"],
  INSPECTED: ["CONFORMANCE_PENDING", "QUARANTINED"],
  CONFORMANCE_PENDING: ["APPROVAL_PENDING", "QUARANTINED"],
  APPROVAL_PENDING: ["ACTIVE", "QUARANTINED", "RETIRED"],
  ACTIVE: ["DEGRADED", "QUARANTINED", "RETIRED"],
  DEGRADED: ["ACTIVE", "QUARANTINED", "RETIRED"],
  QUARANTINED: ["RETIRED", "DISCOVERED"],
  RETIRED: []
});

export class FiveLayerRegistryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "FiveLayerRegistryError";
    this.code = code;
  }
}

/** 1. Provider Registry */
export class ProviderRegistry {
  #providers = new Map();

  registerProvider({ provider_id, name, vendor, website }) {
    if (!provider_id) throw new FiveLayerRegistryError("INVALID_PROVIDER", "provider_id required");
    this.#providers.set(provider_id, Object.freeze({ provider_id, name, vendor, website }));
    return this.#providers.get(provider_id);
  }

  getProvider(provider_id) {
    return this.#providers.get(provider_id) ?? null;
  }

  listProviders() {
    return Array.from(this.#providers.values());
  }
}

/** 2. Model Registry */
export class ModelRegistry {
  #models = new Map();

  registerModel({ model_id, provider_id, name, context_window, tool_support = true, coding_agent = true }) {
    if (!model_id || !provider_id) throw new FiveLayerRegistryError("INVALID_MODEL", "model_id and provider_id required");
    const record = Object.freeze({ model_id, provider_id, name, context_window, tool_support, coding_agent });
    this.#models.set(model_id, record);
    return record;
  }

  getModel(model_id) {
    return this.#models.get(model_id) ?? null;
  }

  listModelsByProvider(provider_id) {
    return Array.from(this.#models.values()).filter(m => m.provider_id === provider_id);
  }
}

/** 3. Runtime Registry (CLI Executables / Harnesses) */
export class RuntimeRegistryFiveLayer {
  #runtimes = new Map();

  registerRuntime({ runtime_id, provider_id, harness, executable, transport = {}, supported_roles = [], authority_profile = "A0" }) {
    if (!runtime_id || !provider_id || !executable) {
      throw new FiveLayerRegistryError("INVALID_RUNTIME", "runtime_id, provider_id, and executable are required");
    }
    const record = {
      runtime_id,
      provider_id,
      harness,
      executable,
      transport: { control: "process", tools: "mcp", telemetry: "event-adapter", ...transport },
      supported_roles,
      authority_profile,
      status: "DISCOVERED",
      discovered_at: new Date().toISOString()
    };
    this.#runtimes.set(runtime_id, record);
    return Object.freeze({ ...record });
  }

  transitionStatus(runtime_id, nextStatus) {
    const r = this.#runtimes.get(runtime_id);
    if (!r) throw new FiveLayerRegistryError("RUNTIME_NOT_FOUND", `Runtime not found: ${runtime_id}`);
    const allowed = VALID_LIFECYCLE_TRANSITIONS[r.status];
    if (!allowed || !allowed.includes(nextStatus)) {
      throw new FiveLayerRegistryError("INVALID_TRANSITION", `Cannot transition runtime ${runtime_id} from ${r.status} to ${nextStatus}`);
    }
    r.status = nextStatus;
    r.updated_at = new Date().toISOString();
    return Object.freeze({ ...r });
  }

  getRuntime(runtime_id) {
    const r = this.#runtimes.get(runtime_id);
    return r ? Object.freeze({ ...r }) : null;
  }

  listRuntimesByStatus(status) {
    return Array.from(this.#runtimes.values())
      .filter(r => r.status === status)
      .map(r => Object.freeze({ ...r }));
  }
}

/** 4. Agent Registry (Governed SecB Worker Identities) */
export class AgentRegistryFiveLayer {
  #agents = new Map();

  registerAgent({ agent_id, runtime_id, model_policy_id, role, capability_profile = "bounded-change", workspace_policy = "isolated-worktree" }) {
    if (!agent_id || !runtime_id || !role) {
      throw new FiveLayerRegistryError("INVALID_AGENT", "agent_id, runtime_id, and role are required");
    }
    const record = Object.freeze({
      agent_id,
      runtime_id,
      model_policy_id,
      role,
      capability_profile,
      workspace_policy,
      active: true,
      registered_at: new Date().toISOString()
    });
    this.#agents.set(agent_id, record);
    return record;
  }

  getAgent(agent_id) {
    return this.#agents.get(agent_id) ?? null;
  }

  listAgentsByRole(role) {
    return Array.from(this.#agents.values()).filter(a => a.role === role);
  }
}

/** 5. Session Registry (Active Executions) */
export class SessionRegistry {
  #sessions = new Map();

  createSession({ session_id, agent_id, work_package_id, worktree_root, pid = null }) {
    if (!session_id || !agent_id || !work_package_id) {
      throw new FiveLayerRegistryError("INVALID_SESSION", "session_id, agent_id, and work_package_id are required");
    }
    const record = {
      session_id,
      agent_id,
      work_package_id,
      worktree_root,
      pid,
      state: "STARTED",
      started_at: new Date().toISOString(),
      events: []
    };
    this.#sessions.set(session_id, record);
    return Object.freeze({ ...record });
  }

  updateSessionState(session_id, state) {
    const s = this.#sessions.get(session_id);
    if (!s) throw new FiveLayerRegistryError("SESSION_NOT_FOUND", `Session not found: ${session_id}`);
    s.state = state;
    if (["COMPLETED", "FAILED", "CANCELLED"].includes(state)) {
      s.ended_at = new Date().toISOString();
    }
    return Object.freeze({ ...s });
  }

  getSession(session_id) {
    const s = this.#sessions.get(session_id);
    return s ? Object.freeze({ ...s }) : null;
  }
}

/** Model Policy Router — Scores & routes work packages to agents */
export class ModelPolicyRouter {
  #agents;

  constructor({ agentRegistry }) {
    this.#agents = agentRegistry;
  }

  selectAgentForRole({ role, exclude_agent_id = null }) {
    const candidates = this.#agents.listAgentsByRole(role)
      .filter(a => a.active && a.agent_id !== exclude_agent_id);

    if (candidates.length === 0) {
      throw new FiveLayerRegistryError("NO_AGENT_AVAILABLE", `No active agent available for role: ${role}`);
    }

    // Return the first available matching candidate
    return candidates[0];
  }
}
