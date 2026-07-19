import assert from "node:assert/strict";
import test from "node:test";
import { PINNED_PROTOCOL_VERSION, TOOL_CATALOG } from "../src/mcp/tool-catalog.mjs";
import { SecBMcpServer } from "../src/mcp/secb-mcp-server.mjs";

const CALLER = "inst_ok";

function registryStub() {
  return {
    resolve(id) {
      if (id === CALLER) {
        return { resolved: true, quarantined: false, identity: { agent_instance_id: CALLER, max_data_classification: "INTERNAL", permitted_roles: ["ENGIN"] } };
      }
      if (id === "inst_candidate") return { resolved: false, quarantined: true, reason: "Evaluation status is CANDIDATE, not APPROVED" };
      return { resolved: false, quarantined: true, reason: "Unknown agent instance" };
    }
  };
}

function eventLedgerStub(classification = "RESTRICTED") {
  return {
    verify: () => ({ valid: true, headHash: "h".repeat(64), count: 1 }),
    read: () => [{
      sequence: 1,
      entry: { entryId: "evt1", type: "host.observed", actorId: "a", sessionId: "s", timestamp: "2026-07-18T10:00:00Z", payload: { classification, content_hash: "c".repeat(64), observed_fact: { secret: "TOP" } } }
    }]
  };
}

function harness({ log } = {}) {
  const calls = [];
  const invocationLog = log ?? ((entry) => { calls.push(entry); });
  const server = new SecBMcpServer({
    services: {
      registry: registryStub(),
      workPackage: { resolveEffective: (p, w) => ({ effective: { project_id: p, work_package_id: w }, code: "ALLOW", version: 1 }) },
      eventLedger: eventLedgerStub(),
      evidenceLedger: eventLedgerStub("INTERNAL"),
      skillResolver: { resolveSkill: () => ({ code: "ALLOW" }) }
    },
    invocationLog,
    now: () => new Date("2026-07-19T00:00:00Z")
  });
  const call = (name, args, caller = CALLER) => server.handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, { callerInstanceId: caller });
  return { server, calls, call };
}

test("initialize pins the protocol version and refuses others", () => {
  const { server } = harness();
  assert.equal(server.handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: PINNED_PROTOCOL_VERSION } }).result.protocolVersion, PINNED_PROTOCOL_VERSION);
  const bad = server.handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "1999-01-01" } });
  assert.equal(bad.error.data.code, "DENY_PROTOCOL_VERSION");
});

test("deny-by-default methods and malformed requests", () => {
  const { server } = harness();
  assert.equal(server.handle({ jsonrpc: "2.0", id: 1, method: "resources/list" }).error.code, -32601);
  assert.equal(server.handle({ jsonrpc: "1.0", id: 1, method: "ping" }).error.code, -32600);
  assert.equal(server.handle({ jsonrpc: "2.0", id: 1, method: "ping" }).result !== undefined, true);
  assert.equal(server.handle({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
});

test("tools/list projects the frozen catalog (9 read-only tools)", () => {
  const { server } = harness();
  const tools = server.handle({ jsonrpc: "2.0", id: 1, method: "tools/list" }).result.tools;
  assert.equal(tools.length, 9);
  assert.ok(tools.every((t) => typeof t.description === "string"));
  assert.throws(() => { TOOL_CATALOG.push({}); }, TypeError);
});

test("caller resolution: unresolved and quarantined callers are denied and ledgered", () => {
  const { call, calls } = harness();
  assert.equal(call("secb_canonical_fingerprint", { document: {} }, "").error.data.code, "DENY_UNRESOLVED_CALLER");
  assert.equal(call("secb_canonical_fingerprint", { document: {} }, "inst_candidate").error.data.code, "DENY_UNRESOLVED_CALLER");
  assert.ok(calls.every((c) => c.type === "MCP_INVOCATION"));
  assert.equal(calls.filter((c) => c.decision === "DENY_UNRESOLVED_CALLER").length, 2);
});

test("unknown tool, missing params, and reserved delimiters deny (all ledgered)", () => {
  const { call, calls } = harness();
  assert.equal(call("secb_ghost", {}).error.data.code, "DENY_UNKNOWN_TOOL");
  assert.equal(call("secb_work_package_resolve_effective", { project_id: "p" }).error.data.code, "DENY_INVALID_PARAMS");
  assert.equal(call("secb_work_package_resolve_effective", { project_id: "p|x", work_package_id: "w" }).error.data.code, "DENY_RESERVED_DELIMITER");
  assert.equal(call("secb_registry_resolve", { agent_instance_id: "a@b" }).error.data.code, "DENY_RESERVED_DELIMITER");
  assert.ok(calls.length >= 4);
});

test("happy path returns a data_untrusted-marked projection", () => {
  const { call } = harness();
  const r = call("secb_work_package_resolve_effective", { project_id: "prj", work_package_id: "wp" }).result;
  assert.equal(r.content_disposition, "data_untrusted");
  assert.equal(r.tool, "secb_work_package_resolve_effective");
  assert.equal(r.data.code, "ALLOW");
});

test("classification floor: RESTRICTED event payload withheld at an INTERNAL caller ceiling", () => {
  const { call } = harness();
  const events = call("secb_events_read", {}).result.data;
  assert.equal(events[0].payloadRendered, false);
  assert.equal(events[0].withheldReason, "ABOVE_CEILING");
  assert.ok(!JSON.stringify(events).includes("TOP"));
});

test("audit fail-closed: an unauditable call is denied and the result withheld", () => {
  const { call } = harness({ log: () => { throw new Error("ledger busy"); } });
  const r = call("secb_work_package_resolve_effective", { project_id: "prj", work_package_id: "wp" });
  assert.equal(r.error.data.code, "DENY_AUDIT_UNAVAILABLE");
});

test("registry_resolve never leaks another instance's full identity", () => {
  const { call } = harness();
  const r = call("secb_registry_resolve", { agent_instance_id: CALLER }).result.data;
  assert.equal(r.resolved, true);
  assert.equal(r.agent_instance_id, CALLER);
  assert.equal(r.permitted_roles, undefined); // full identity not exposed
});

test("constructor requires registry and a fail-closed invocation log", () => {
  assert.throws(() => new SecBMcpServer({ services: {}, invocationLog: () => {} }));
  assert.throws(() => new SecBMcpServer({ services: { registry: { resolve: () => {} } } }));
});
