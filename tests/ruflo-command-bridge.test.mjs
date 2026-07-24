/**
 * SecB Agent Command Center — Ruflo Command Center Tests
 * 
 * Validates that the Ruflo bridge correctly creates governed evidence
 * envelopes and outcome receipts under SecB's local-first ledger contracts.
 * 
 * Acceptance checks (SECB-AGENTS-AMD-002 Rule 6):
 *   AC-RUFLO-01: onAgentSpawn ledgers an event-envelope with correct payload.
 *   AC-RUFLO-02: onTaskComplete ledgers an outcome-receipt with fingerprint.
 *   AC-RUFLO-03: onSwarmComplete ledgers an evidence-envelope with pass_rate.
 *   AC-RUFLO-04: RUFLO_ADAPTERS has swarm, coder, reviewer entries.
 *   AC-RUFLO-05: Missing services throw (fail-closed).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { RufloCommandBridge } from "../src/gateway/ruflo-command-bridge.mjs";
import { RUFLO_ADAPTERS, RUFLO_SWARM_ADAPTER, RUFLO_CODER_ADAPTER, RUFLO_REVIEWER_ADAPTER } from "../src/registry/ruflo-adapters.mjs";

// --- Minimal in-memory ledger stub ---
function makeStubLedger() {
  const entries = [];
  return { append: async (e) => { entries.push(e); }, entries };
}

// --- AC-RUFLO-04: Adapter registry completeness ---
test("AC-RUFLO-04: RUFLO_ADAPTERS has swarm, coder, reviewer entries", () => {
  assert.ok(RUFLO_ADAPTERS["ruflo-swarm"], "missing ruflo-swarm");
  assert.ok(RUFLO_ADAPTERS["ruflo-coder"], "missing ruflo-coder");
  assert.ok(RUFLO_ADAPTERS["ruflo-reviewer"], "missing ruflo-reviewer");
  assert.equal(RUFLO_SWARM_ADAPTER.runtime_product_id, "ruflo");
  assert.equal(RUFLO_CODER_ADAPTER.permitted_roles[0], "ENGIN");
  assert.ok(RUFLO_REVIEWER_ADAPTER.permitted_roles.includes("QA"), "reviewer missing QA role");
  assert.equal(RUFLO_SWARM_ADAPTER.authority_ceiling, "A1");
  assert.equal(RUFLO_CODER_ADAPTER.authority_ceiling, "A0");
  assert.equal(RUFLO_REVIEWER_ADAPTER.max_data_classification, "INTERNAL");
});

// --- AC-RUFLO-05: fail-closed on missing services ---
test("AC-RUFLO-05: Constructor throws when eventLedger is missing", () => {
  assert.throws(
    () => new RufloCommandBridge({ services: { evidenceLedger: makeStubLedger() } }),
    /eventLedger/
  );
});

test("AC-RUFLO-05: Constructor throws when evidenceLedger is missing", () => {
  assert.throws(
    () => new RufloCommandBridge({ services: { eventLedger: makeStubLedger() } }),
    /evidenceLedger/
  );
});

// --- AC-RUFLO-01: onAgentSpawn ledgers an event-envelope ---
test("AC-RUFLO-01: onAgentSpawn creates event-envelope in eventLedger", async () => {
  const eventLedger = makeStubLedger();
  const evidenceLedger = makeStubLedger();
  const bridge = new RufloCommandBridge({
    services: { eventLedger, evidenceLedger },
    now: () => new Date("2026-07-24T07:00:00.000Z")
  });

  const result = await bridge.onAgentSpawn({
    agentType: "coder",
    instanceId: "coder-1",
    swarmId: "swarm-secb-001",
    role: "ENGIN"
  });

  assert.equal(result.registered, true);
  assert.equal(result.instanceId, "coder-1");
  assert.equal(eventLedger.entries.length, 1);

  const entry = eventLedger.entries[0];
  assert.equal(entry.kind, "event-envelope");
  assert.equal(entry.event_type, "agent.spawn");
  assert.equal(entry.payload.agent_type, "coder");
  assert.equal(entry.payload.swarm_id, "swarm-secb-001");
  assert.equal(entry.payload.role, "ENGIN");
  assert.equal(evidenceLedger.entries.length, 0, "spawn must NOT touch evidenceLedger");
});

// --- AC-RUFLO-02: onTaskComplete ledgers an outcome-receipt ---
test("AC-RUFLO-02: onTaskComplete creates outcome-receipt with fingerprint in evidenceLedger", async () => {
  const eventLedger = makeStubLedger();
  const evidenceLedger = makeStubLedger();
  const bridge = new RufloCommandBridge({ services: { eventLedger, evidenceLedger } });

  const result = await bridge.onTaskComplete({
    taskId: "task-001",
    agentInstanceId: "coder-1",
    result: { success: true, content: [{ type: "text", text: "done" }] },
    durationMs: 420
  });

  assert.equal(result.ledgered, true);
  assert.ok(result.fingerprint, "fingerprint must be present");
  assert.equal(evidenceLedger.entries.length, 1);

  const entry = evidenceLedger.entries[0];
  assert.equal(entry.kind, "outcome-receipt");
  assert.equal(entry.outcome, "SUCCESS");
  assert.equal(entry.duration_ms, 420);
  assert.equal(entry.task_id, "task-001");
  assert.equal(eventLedger.entries.length, 0, "task complete must NOT touch eventLedger");
});

test("AC-RUFLO-02: onTaskComplete records FAILURE when result.success is false", async () => {
  const eventLedger = makeStubLedger();
  const evidenceLedger = makeStubLedger();
  const bridge = new RufloCommandBridge({ services: { eventLedger, evidenceLedger } });

  await bridge.onTaskComplete({
    taskId: "task-002",
    agentInstanceId: "coder-1",
    result: { success: false, error: "timeout" }
  });

  const entry = evidenceLedger.entries[0];
  assert.equal(entry.outcome, "FAILURE");
});

// --- AC-RUFLO-03: onSwarmComplete ledgers an evidence-envelope with pass_rate ---
test("AC-RUFLO-03: onSwarmComplete creates evidence-envelope with pass_rate", async () => {
  const eventLedger = makeStubLedger();
  const evidenceLedger = makeStubLedger();
  const bridge = new RufloCommandBridge({ services: { eventLedger, evidenceLedger } });

  const result = await bridge.onSwarmComplete({
    swarmId: "swarm-secb-001",
    objective: "Build SecB Ruflo command center bridge",
    agents: ["coder-1", "tester-1", "reviewer-1"],
    taskCount: 10,
    successCount: 9
  });

  assert.equal(result.ledgered, true);
  assert.equal(evidenceLedger.entries.length, 1);

  const entry = evidenceLedger.entries[0];
  assert.equal(entry.kind, "evidence-envelope");
  assert.equal(entry.evidence_type, "swarm.completion");
  assert.equal(entry.payload.swarm_id, "swarm-secb-001");
  assert.equal(entry.payload.task_count, 10);
  assert.equal(entry.payload.success_count, 9);
  assert.equal(entry.payload.failure_count, 1);
  assert.equal(entry.payload.pass_rate, "90.0%");
});
