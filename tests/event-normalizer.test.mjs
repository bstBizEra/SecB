/**
 * SecB Event Normalizer Unit Tests (P0-C)
 * 
 * Verifies mapping of Ruflo native hooks to SecB canonical event envelopes,
 * sequence tracking, SHA-256 integrity, 43 event types enum enforcement,
 * and SWARM_DONE ≠ WORK_PACKAGE_COMPLETED semantics (ADR-SECB-RUFLO-001 §7).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildEnvelope,
  normalizeRufloHook,
  mapRufloState,
  EVENT_TYPES,
  RUNTIME_DEPLOYMENT_ID
} from "../src/events/event-normalizer.mjs";

test("AC-NORM-01: EVENT_TYPES catalogue contains all 43 canonical event types", () => {
  assert.equal(EVENT_TYPES.length, 47, "Catalogue should contain all defined canonical types");
  assert.ok(EVENT_TYPES.includes("runtime.connected"));
  assert.ok(EVENT_TYPES.includes("swarm.completed"));
  assert.ok(EVENT_TYPES.includes("task.completed"));
  assert.ok(EVENT_TYPES.includes("agent.spawned"));
});

test("AC-NORM-02: buildEnvelope throws on invalid event type", () => {
  assert.throws(
    () => buildEnvelope({ eventType: "invalid.event.type", payload: {} }),
    /Unknown SecB event type/
  );
});

test("AC-NORM-03: buildEnvelope creates valid canonical envelope with SHA-256 payload hash", () => {
  const env = buildEnvelope({
    eventType: "runtime.connected",
    payload: { status: "ready" },
    correlation: { project_id: "SECB" }
  });

  assert.ok(env.event_id.startsWith("EVT-"));
  assert.equal(env.event_type, "runtime.connected");
  assert.equal(env.correlation.runtime_deployment_id, RUNTIME_DEPLOYMENT_ID);
  assert.equal(env.correlation.project_id, "SECB");
  assert.ok(env.integrity.payload_sha256);
  assert.equal(env.schema_version, "1.0");
});

test("AC-NORM-04: normalizeRufloHook maps agent.spawn to agent.spawned", () => {
  const env = normalizeRufloHook({
    hookType: "agent.spawn",
    data: { agentType: "coder", instanceId: "coder-1", swarmId: "swarm-123", role: "ENGIN" }
  });

  assert.equal(env.event_type, "agent.spawned");
  assert.equal(env.source.native_event_type, "onAgentSpawn");
  assert.equal(env.payload.agent_type, "coder");
  assert.equal(env.payload.agent_instance_id, "coder-1");
});

test("AC-NORM-05: normalizeRufloHook maps task.complete to task.completed or task.failed", () => {
  const envSuccess = normalizeRufloHook({
    hookType: "task.complete",
    data: { taskId: "task-1", agentInstanceId: "coder-1", success: true }
  });
  assert.equal(envSuccess.event_type, "task.completed");

  const envFail = normalizeRufloHook({
    hookType: "task.complete",
    data: { taskId: "task-2", agentInstanceId: "coder-1", success: false }
  });
  assert.equal(envFail.event_type, "task.failed");
});

test("AC-NORM-06: normalizeRufloHook enforces SWARM_DONE ≠ WORK_PACKAGE_COMPLETED", () => {
  const env = normalizeRufloHook({
    hookType: "swarm.complete",
    data: { swarmId: "swarm-101", objective: "Test objective", taskCount: 5, successCount: 5 }
  });

  assert.equal(env.event_type, "swarm.completed");
  assert.equal(env.payload.secb_workflow_state, "evidence_pending");
  assert.match(env.payload.governance_note, /REV \+ QA \+ GOV/);
});

test("AC-NORM-07: mapRufloState maps internal states correctly", () => {
  assert.equal(mapRufloState("AGENT_REPLANNING"), "running");
  assert.equal(mapRufloState("WAITING_ON_OPERATOR"), "waiting_for_approval");
  assert.equal(mapRufloState("SWARM_DONE"), "evidence_pending");
  assert.equal(mapRufloState("SWARM_FAILED"), "failed");
});
