/**
 * SecB Event Normalizer (P0-C)
 *
 * Translates Ruflo native events (onAgentSpawn, onTaskComplete, claude-flow hooks)
 * into canonical SecB event envelopes per ADR-SECB-RUFLO-001 §7.
 *
 * Local-first, append-only. No network writes. No authority grants.
 */

import { createHash, randomBytes } from "node:crypto";

export const ADAPTER_VERSION = "secb-ruflo-adapter@0.1.0";
export const RUNTIME_DEPLOYMENT_ID = "RT-RUFLO-LOCAL-001";

/**
 * All 43 canonical SecB event types per ADR-SECB-RUFLO-001 §7.
 */
export const EVENT_TYPES = Object.freeze([
  "runtime.connected", "runtime.disconnected", "runtime.heartbeat",
  "swarm.requested", "swarm.created", "swarm.started", "swarm.paused",
  "swarm.resumed", "swarm.completed", "swarm.failed", "swarm.cancelled",
  "plan.created", "plan.updated", "plan.rejected",
  "agent.requested", "agent.spawned", "agent.ready", "agent.blocked",
  "agent.completed", "agent.failed", "agent.terminated",
  "task.created", "task.assigned", "task.started", "task.progress",
  "task.blocked", "task.completed", "task.failed", "task.cancelled",
  "handoff.requested", "handoff.accepted", "handoff.completed", "handoff.rejected",
  "tool.requested", "tool.authorized", "tool.denied", "tool.started",
  "tool.completed", "tool.failed",
  "artifact.created", "artifact.updated", "artifact.submitted",
  "evidence.candidate_submitted", "finding.created", "decision.requested",
  "usage.recorded", "incident.detected"
]);

/** Map Ruflo SWARM_DONE → SecB EVIDENCE_PENDING semantics */
const RUFLO_STATE_MAP = {
  "AGENT_REPLANNING":     "running",
  "WAITING_ON_OPERATOR":  "waiting_for_approval",
  "SWARM_DONE":           "evidence_pending",   // NOT completed — must go through REV+QA+GOV
  "SWARM_FAILED":         "failed",
  "SWARM_CANCELLED":      "cancelled",
};

let _sequence = 0;

/** Generate a sortable, prefix-tagged event ID (simplified ULID-style). */
function generateEventId() {
  const ts = Date.now().toString(36).toUpperCase().padStart(10, "0");
  const rnd = randomBytes(6).toString("hex").toUpperCase();
  return `EVT-${ts}${rnd}`;
}

/** SHA-256 of the payload for integrity chaining. */
function payloadHash(payload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

/**
 * Build a canonical SecB event envelope from a raw Ruflo event.
 *
 * @param {object} opts
 * @param {string} opts.eventType - One of EVENT_TYPES
 * @param {object} opts.payload
 * @param {object} opts.correlation - runtime_deployment_id required; others optional
 * @param {string} [opts.nativeEventType] - original Ruflo hook name
 * @param {string} [opts.previousEventHash]
 * @param {Date} [opts.occurredAt]
 * @returns {object} Canonical event envelope
 */
export function buildEnvelope({ eventType, payload, correlation, nativeEventType, previousEventHash, occurredAt }) {
  if (!EVENT_TYPES.includes(eventType)) {
    throw new TypeError(`Unknown SecB event type: "${eventType}"`);
  }
  _sequence += 1;
  const now = new Date().toISOString();
  const pHash = payloadHash(payload);
  return {
    schema_version: "1.0",
    event_id: generateEventId(),
    event_type: eventType,
    occurred_at: occurredAt ? occurredAt.toISOString() : now,
    received_at: now,
    sequence: _sequence,
    correlation: {
      runtime_deployment_id: RUNTIME_DEPLOYMENT_ID,
      ...correlation
    },
    source: {
      runtime_deployment_id: RUNTIME_DEPLOYMENT_ID,
      adapter_version: ADAPTER_VERSION,
      ...(nativeEventType ? { native_event_type: nativeEventType } : {})
    },
    payload,
    integrity: {
      payload_sha256: pHash,
      ...(previousEventHash ? { previous_event_hash: previousEventHash } : {})
    }
  };
}

/**
 * Normalize a Ruflo claude-flow hook payload to a canonical event envelope.
 *
 * Handles the subset of hooks Ruflo emits:
 *   - agent.spawn  → agent.spawned
 *   - task.complete → task.completed / task.failed
 *   - swarm.complete → swarm.completed  (SecB state: evidence_pending)
 *   - heartbeat → runtime.heartbeat
 */
export function normalizeRufloHook({ hookType, data = {}, correlation = {}, previousEventHash }) {
  const maps = {
    "agent.spawn": {
      eventType: "agent.spawned",
      nativeEventType: "onAgentSpawn",
      buildPayload: (d) => ({
        agent_type: d.agentType ?? "unknown",
        agent_instance_id: d.instanceId,
        swarm_id: d.swarmId,
        role: d.role ?? "ENGIN"
      })
    },
    "task.complete": {
      eventType: data.success !== false ? "task.completed" : "task.failed",
      nativeEventType: "onTaskComplete",
      buildPayload: (d) => ({
        task_id: d.taskId,
        agent_instance_id: d.agentInstanceId,
        status: d.success !== false ? "completed" : "failed",
        duration_ms: d.durationMs ?? 0,
        summary: d.result?.summary ?? null,
        artifact_refs: d.result?.artifactRefs ?? []
      })
    },
    "swarm.complete": {
      eventType: "swarm.completed",
      nativeEventType: "onSwarmComplete",
      buildPayload: (d) => ({
        swarm_id: d.swarmId,
        objective: d.objective,
        agents: d.agents ?? [],
        task_count: d.taskCount ?? 0,
        success_count: d.successCount ?? 0,
        failure_count: (d.taskCount ?? 0) - (d.successCount ?? 0),
        // ⚠ SWARM_DONE ≠ WORK_PACKAGE_COMPLETED — SecB state maps to evidence_pending
        secb_workflow_state: RUFLO_STATE_MAP["SWARM_DONE"],
        governance_note: "Completion requires REV + QA + GOV decision before Work Package closes."
      })
    },
    "heartbeat": {
      eventType: "runtime.heartbeat",
      nativeEventType: "heartbeat",
      buildPayload: (d) => ({
        runtime_deployment_id: RUNTIME_DEPLOYMENT_ID,
        uptime_ms: d.uptimeMs ?? null,
        active_swarms: d.activeSwarms ?? 0,
        active_agents: d.activeAgents ?? 0
      })
    }
  };

  const map = maps[hookType];
  if (!map) {
    throw new TypeError(`Unknown Ruflo hook type: "${hookType}"`);
  }

  return buildEnvelope({
    eventType: typeof map.eventType === "function" ? map.eventType(data) : map.eventType,
    payload: map.buildPayload(data),
    correlation,
    nativeEventType: map.nativeEventType,
    previousEventHash
  });
}

/** Map a Ruflo internal state string to the canonical SecB workflow state. */
export function mapRufloState(rufloState) {
  return RUFLO_STATE_MAP[rufloState] ?? "running";
}
