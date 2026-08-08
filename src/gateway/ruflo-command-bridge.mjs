/**
 * Ruflo → SecB Bridge
 * 
 * The bridge translates Ruflo swarm lifecycle events into SecB-governed
 * evidence envelopes and ledger entries.
 * 
 * Architecture:
 *  Ruflo (Swarm Coordinator) → Bridge → SecB (DurableLedger + EvidenceLedger)
 * 
 * This module is the single integration point. It is a PROJECTION adapter —
 * it records evidence only; it does not grant authority.
 * 
 * Local-first: no network calls, no remote writes, no daemon process.
 */

import { canonicalFingerprint } from "../contracts/canonical-fingerprint.mjs";
import { validateContract } from "../contracts/contract-validator.mjs";
import { RUFLO_ADAPTERS, createRufloAdapterRegistration } from "../registry/ruflo-adapters.mjs";

/**
 * RufloCommandBridge — wraps an existing SecB service bag and provides
 * typed methods that Ruflo agent lifecycle events can call.
 *
 * Usage:
 *   const bridge = new RufloCommandBridge({ services, now });
 *   await bridge.onAgentSpawn({ agentType: "coder", instanceId: "coder-1", swarmId: "swarm-abc" });
 *   await bridge.onTaskComplete({ taskId: "task-123", agentInstanceId: "coder-1", result: {...} });
 *   await bridge.onSwarmComplete({ swarmId: "swarm-abc", objective: "...", agents: [...] });
 */
export class RufloCommandBridge {
  #services;
  #now;

  /**
   * @param {object} opts
   * @param {object} opts.services - SecB service bag (eventLedger, evidenceLedger, registry)
   * @param {function} [opts.now] - clock override for testing
   */
  constructor({ services, now = () => new Date() } = {}) {
    if (!services?.eventLedger) throw new Error("RufloCommandBridge requires services.eventLedger");
    if (!services?.evidenceLedger) throw new Error("RufloCommandBridge requires services.evidenceLedger");
    this.#services = services;
    this.#now = now;
  }

  /**
   * Called when a Ruflo agent is spawned via `npx claude-flow agent spawn`.
   * Registers the agent in SecB's RuntimeRegistry and ledgers a governance event.
   *
   * @param {{ agentType: string, instanceId: string, swarmId: string, role?: string }} opts
   */
  async onAgentSpawn({ agentType, instanceId, swarmId, role = "ENGIN" }) {
    const adapterKey = `ruflo-${agentType}`;
    const baseAdapter = RUFLO_ADAPTERS[adapterKey] ?? RUFLO_ADAPTERS["ruflo-coder"];
    const registration = createRufloAdapterRegistration(baseAdapter, {
      agent_instance_id: instanceId,
      workload_identity_ref: `ruflo-swarm:${swarmId}`
    });

    // Ledger an agent-registration event envelope
    const envelope = {
      kind: "event-envelope",
      id: `ruflo-spawn-${instanceId}-${Date.now()}`,
      occurred_at: this.#now().toISOString(),
      producer_instance_id: instanceId,
      consumer_instance_id: "secb-command-center",
      event_type: "agent.spawn",
      payload: {
        agent_type: agentType,
        swarm_id: swarmId,
        role,
        adapter_profile: registration.agent_profile_id,
        authority_ceiling: registration.authority_ceiling,
        permitted_roles: registration.permitted_roles
      }
    };

    await this.#services.eventLedger.append(envelope);
    return { registered: true, instanceId, adapterKey };
  }

  /**
   * Called when a Ruflo task completes. Creates a SecB outcome-receipt
   * and streams it to the evidence ledger.
   *
   * @param {{ taskId: string, agentInstanceId: string, result: object, durationMs?: number }} opts
   */
  async onTaskComplete({ taskId, agentInstanceId, result, durationMs = 0 }) {
    const success = result?.success !== false;
    const fingerprintInput = JSON.stringify({ taskId, agentInstanceId, result });
    const fingerprint = await canonicalFingerprint(fingerprintInput);

    const outcomeReceipt = {
      kind: "outcome-receipt",
      id: `ruflo-outcome-${taskId}-${Date.now()}`,
      occurred_at: this.#now().toISOString(),
      producer_instance_id: agentInstanceId,
      consumer_instance_id: "secb-command-center",
      task_id: taskId,
      outcome: success ? "SUCCESS" : "FAILURE",
      duration_ms: durationMs,
      evidence_fingerprint: fingerprint,
      payload_summary: {
        task_id: taskId,
        agent: agentInstanceId,
        success,
        content_type: typeof result?.content
      }
    };

    await this.#services.evidenceLedger.append(outcomeReceipt);
    return { ledgered: true, outcomeId: outcomeReceipt.id, fingerprint };
  }

  /**
   * Called when a full Ruflo swarm run completes.
   * Summarizes the entire swarm lifecycle into a SecB evidence envelope.
   *
   * @param {{ swarmId: string, objective: string, agents: string[], taskCount: number, successCount: number }} opts
   */
  async onSwarmComplete({ swarmId, objective, agents = [], taskCount = 0, successCount = 0 }) {
    const envelope = {
      kind: "evidence-envelope",
      id: `ruflo-swarm-${swarmId}-${Date.now()}`,
      occurred_at: this.#now().toISOString(),
      producer_instance_id: "ruflo-swarm-coordinator",
      consumer_instance_id: "secb-command-center",
      evidence_type: "swarm.completion",
      payload: {
        swarm_id: swarmId,
        objective,
        agents,
        task_count: taskCount,
        success_count: successCount,
        failure_count: taskCount - successCount,
        pass_rate: taskCount > 0 ? ((successCount / taskCount) * 100).toFixed(1) + "%" : "N/A"
      }
    };

    await this.#services.evidenceLedger.append(envelope);
    return { ledgered: true, envelopeId: envelope.id };
  }
}
