// Unit tests for the SECB-MCP-P0-001 candidate gateway dispatch core.
// Covers every deny path (fail-closed) and the read-only happy path.
import test from "node:test";
import assert from "node:assert/strict";
import { McpGatewayCore, REQUIRED_CONTEXT_FIELDS } from "../src/gateway/mcp-gateway-core.mjs";

const FIXED_NOW = () => new Date("2026-07-19T10:00:00.000Z");

const validContext = () => ({
  agent_id: "agent.codex.builder.01",
  harness_id: "codex-desktop",
  project_id: "prj_secb_local",
  work_package_id: "wp_secb_mcp_a_gateway_core_001",
  workspace_lease_id: "lease-20260719-001",
  session_id: "session-0001",
  authorization_id: "auth-0001",
  capability_id: "filesystem.read",
  purpose: "repository-conformance-analysis",
  evidence_required: true,
});

function build({ log, adapterImpl, policy } = {}) {
  const entries = [];
  const capabilityRegistry = new Map([
    ["filesystem.read", { adapter_id: "fs-read", tool: "read_text_file", access: "read" }],
    ["workspace.write", { adapter_id: "fs-write", tool: "write_file", access: "write" }],
    ["orphan.read", { adapter_id: "missing-adapter", tool: "noop", access: "read" }],
  ]);
  const adapters = new Map([
    ["fs-read", { invoke: adapterImpl ?? ((tool, params) => ({ tool, echoed: params.path })) }],
  ]);
  const gateway = new McpGatewayCore({
    capabilityRegistry,
    adapters,
    invocationLog: log ?? ((e) => entries.push(e)),
    policy: policy ?? null,
    now: FIXED_NOW,
  });
  return { gateway, entries };
}

test("constructor fails closed without registry, adapters, or invocation log", () => {
  assert.throws(() => new McpGatewayCore({}), /capabilityRegistry/);
  assert.throws(() => new McpGatewayCore({ capabilityRegistry: new Map() }), /adapters/);
  assert.throws(
    () => new McpGatewayCore({ capabilityRegistry: new Map(), adapters: new Map() }),
    /invocationLog/,
  );
});

test("every missing request_context field denies with DENY_CONTEXT", () => {
  const { gateway } = build();
  for (const field of REQUIRED_CONTEXT_FIELDS) {
    const context = validContext();
    delete context[field];
    const outcome = gateway.invoke(context, {});
    assert.equal(outcome.ok, false, `expected denial when ${field} missing`);
    assert.equal(outcome.deny_code, "DENY_CONTEXT");
  }
});

test("evidence_required must be exactly true", () => {
  const { gateway } = build();
  for (const bad of [false, undefined, "true", 1]) {
    const context = { ...validContext(), evidence_required: bad };
    const outcome = gateway.invoke(context, {});
    assert.equal(outcome.ok, false);
    assert.equal(outcome.deny_code, "DENY_CONTEXT");
  }
});

test("unknown capability denies (deny-by-default allowlist)", () => {
  const { gateway } = build();
  const outcome = gateway.invoke({ ...validContext(), capability_id: "shell.exec" }, {});
  assert.equal(outcome.deny_code, "DENY_UNKNOWN_CAPABILITY");
});

test("non-read capability denies in the P0 profile", () => {
  const { gateway } = build();
  const outcome = gateway.invoke({ ...validContext(), capability_id: "workspace.write" }, {});
  assert.equal(outcome.deny_code, "DENY_NON_READ");
});

test("policy can only narrow: allow() !== true denies", () => {
  const { gateway } = build({ policy: { allow: () => false } });
  const outcome = gateway.invoke(validContext(), {});
  assert.equal(outcome.deny_code, "DENY_POLICY");
});

test("registered capability without a registered adapter denies", () => {
  const { gateway } = build();
  const outcome = gateway.invoke({ ...validContext(), capability_id: "orphan.read" }, {});
  assert.equal(outcome.deny_code, "DENY_NO_ADAPTER");
});

test("throwing invocation log denies dispatch (fail-closed audit)", () => {
  let adapterCalled = false;
  const { gateway } = build({
    log: () => { throw new Error("ledger unavailable"); },
    adapterImpl: () => { adapterCalled = true; return {}; },
  });
  const outcome = gateway.invoke(validContext(), {});
  assert.equal(outcome.deny_code, "DENY_AUDIT_UNAVAILABLE");
  assert.equal(adapterCalled, false, "adapter must not run when audit fails");
});

test("adapter throw becomes a structured denial, never an exception", () => {
  const { gateway } = build({ adapterImpl: () => { throw new Error("backend down"); } });
  const outcome = gateway.invoke(validContext(), {});
  assert.equal(outcome.ok, false);
  assert.equal(outcome.deny_code, "DENY_ADAPTER_ERROR");
});

test("read-only happy path: audit precedes dispatch, receipt marks data untrusted", () => {
  const calls = [];
  const { gateway } = build({
    log: () => calls.push("audit"),
    adapterImpl: (tool, params) => { calls.push("adapter"); return { tool, path: params.path }; },
  });
  const outcome = gateway.invoke(validContext(), { path: "docs/README.md" });
  assert.equal(outcome.ok, true);
  assert.deepEqual(calls, ["audit", "adapter"], "invocation log must run before the adapter");
  assert.equal(outcome.result.tool, "read_text_file");
  assert.equal(outcome.receipt.content_disposition, "data_untrusted");
  assert.equal(outcome.receipt.capability_id, "filesystem.read");
  assert.equal(outcome.receipt.attempted_at, "2026-07-19T10:00:00.000Z");
});

test("invocation log entry carries the attribution fields", () => {
  const { gateway, entries } = build();
  gateway.invoke(validContext(), { path: "x" });
  assert.equal(entries.length, 1);
  const entry = entries[0];
  for (const key of ["agent_id", "harness_id", "project_id", "work_package_id", "session_id", "authorization_id", "capability_id", "adapter_id", "tool", "purpose", "attempted_at"]) {
    assert.ok(entry[key], `log entry missing ${key}`);
  }
});
