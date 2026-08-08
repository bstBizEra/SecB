import { test } from "node:test";
import assert from "node:assert/strict";
import { SecBControlPlaneBus, ControlPlaneBusError } from "../src/bus/secb-control-plane-bus.mjs";
import { SecBMcpServer } from "../src/mcp/secb-mcp-server.mjs";

test("SecBControlPlaneBus publishes events with SHA-256 fingerprints and dispatches to subscribers", () => {
  const bus = new SecBControlPlaneBus();
  const received = [];

  bus.subscribe({
    eventType: "PROJECT_REGISTERED",
    subscriberId: "second-brain-listener",
    handler: (evt) => received.push(evt),
    classificationCeiling: "INTERNAL"
  });

  const event = bus.publishEvent({
    eventType: "PROJECT_REGISTERED",
    sourceModule: "ProjectRegistrationService",
    payload: { projectId: "SECB", status: "REGISTERED_PROPOSAL_ONLY" },
    classification: "INTERNAL"
  });

  assert.ok(event.event_id.startsWith("BUS-EVT-ProjectRegistrationService-"));
  assert.equal(event.event_type, "PROJECT_REGISTERED");
  assert.equal(typeof event.fingerprint, "string");
  assert.equal(event.fingerprint.length, 64);

  assert.equal(received.length, 1);
  assert.equal(received[0].payload.projectId, "SECB");
});

test("SecBControlPlaneBus enforces classification ceiling withholding for subscribers", () => {
  const bus = new SecBControlPlaneBus();
  const received = [];

  // Subscriber with INTERNAL ceiling (should NOT receive CONFIDENTIAL event)
  bus.subscribe({
    eventType: "SECRET_ROTATED",
    subscriberId: "low-ceiling-listener",
    handler: (evt) => received.push(evt),
    classificationCeiling: "INTERNAL"
  });

  bus.publishEvent({
    eventType: "SECRET_ROTATED",
    sourceModule: "CredentialBroker",
    payload: { secretId: "sec-99" },
    classification: "CONFIDENTIAL"
  });

  assert.equal(received.length, 0);
});

test("SecBMcpServer dispatches secb_bus_events_inspect tool", () => {
  const bus = new SecBControlPlaneBus();
  bus.publishEvent({
    eventType: "TEST_EVENT",
    sourceModule: "TestRunner",
    payload: { status: "PASS" }
  });

  const registry = {
    resolve: (id) => ({
      resolved: true,
      identity: { agent_instance_id: id, max_data_classification: "INTERNAL", state: "ACTIVE" }
    })
  };
  const logs = [];
  const server = new SecBMcpServer({
    services: { registry, controlPlaneBus: bus },
    invocationLog: (entry) => logs.push(entry),
    classificationCeiling: "INTERNAL"
  });

  const res = server.handle(
    {
      jsonrpc: "2.0",
      id: 800,
      method: "tools/call",
      params: {
        name: "secb_bus_events_inspect",
        arguments: { limit: 5 }
      }
    },
    { callerInstanceId: "test-agent" }
  );

  assert.equal(res.id, 800);
  assert.equal(res.result.data.length, 1);
  assert.equal(res.result.data[0].event_type, "TEST_EVENT");
});
