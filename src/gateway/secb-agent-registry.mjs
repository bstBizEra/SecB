/**
 * SecBAgentRegistry - Governed Agent Registry Engine
 * Bridging Ruflo Agent Configs into SecB Governance Control Plane.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseTomlKeyValue } from "../config/agent-config-parser.mjs";

export class SecBAgentRegistry {
  #services;
  #configPath;
  #configCache = null;

  constructor({ services, configPath = ".secb/agent-config.toml" } = {}) {
    if (!services?.eventLedger) throw new Error("SecBAgentRegistry requires services.eventLedger");
    this.#services = services;
    this.#configPath = configPath;
  }

  loadConfig() {
    if (this.#configCache) return this.#configCache;

    const fullPath = resolve(process.cwd(), this.#configPath);
    if (!existsSync(fullPath)) {
      // Fallback default config if file not found
      return Object.freeze({
        core: { classification_floor: "INTERNAL", max_classification_ceiling: "RESTRICTED" },
        agents: {
          coder: { type: "coder", permitted_roles: ["ENGIN"], max_classification: "INTERNAL" },
          "security-architect": { type: "security-architect", permitted_roles: ["GOV"], max_classification: "RESTRICTED" }
        }
      });
    }

    const content = readFileSync(fullPath, "utf8");
    this.#configCache = parseTomlKeyValue(content);
    return this.#configCache;
  }

  /**
   * Resolves agent role capabilities and registers activation event in SecB eventLedger.
   */
  registerAgent(agentType, instanceId, swarmId) {
    const config = this.loadConfig();
    const agentDef = config.agents?.[agentType] ?? config.agents?.coder ?? {
      type: agentType,
      permitted_roles: ["ENGIN"],
      max_classification: "INTERNAL"
    };

    const identity = Object.freeze({
      agent_instance_id: instanceId,
      agent_type: agentType,
      workload_identity_ref: `ruflo-swarm:${swarmId}`,
      permitted_roles: agentDef.permitted_roles ?? ["ENGIN"],
      max_data_classification: agentDef.max_classification ?? "INTERNAL",
      quarantine: false,
      registered_at: new Date().toISOString()
    });

    // Append AGENT_REGISTERED event to audit event ledger BEFORE returning
    this.#services.eventLedger.append({
      eventType: "AGENT_REGISTERED",
      payload: identity,
      classification: identity.max_data_classification
    });

    return identity;
  }

  /**
   * Resolves capability for MCP query
   */
  resolveCapability(agentType) {
    const config = this.loadConfig();
    const agentDef = config.agents?.[agentType];
    if (!agentDef) {
      return { ok: false, deny_code: "DENY_UNREGISTERED_AGENT", message: `Agent type ${agentType} not found in agent-config.toml` };
    }

    return {
      ok: true,
      agent_type: agentType,
      permitted_roles: agentDef.permitted_roles ?? ["ENGIN"],
      max_data_classification: agentDef.max_classification ?? "INTERNAL",
      workload_prefix: agentDef.workload_prefix ?? `agt-${agentType}`
    };
  }
}
