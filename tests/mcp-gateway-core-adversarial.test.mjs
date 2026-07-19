import test from "node:test";
import assert from "node:assert/strict";
import { McpGatewayCore } from "../src/gateway/mcp-gateway-core.mjs";

const context = () => ({
  agent_id: "agent.codex.rev.01",
  harness_id: "codex-desktop",
  project_id: "prj_secb_local",
  work_package_id: "wp_review",
  workspace_lease_id: "lease-review",
  session_id: "session-review",
  authorization_id: "auth-review",
  capability_id: "fixture.read",
  purpose: "independent-adversarial-review",
  evidence_required: true,
});

function gateway({ adapter, policy, now } = {}) {
  return new McpGatewayCore({
    capabilityRegistry: new Map([
      ["fixture.read", { adapter_id: "fixture", tool: "read", access: "read" }],
    ]),
    adapters: new Map([["fixture", { invoke: adapter ?? (() => ({ ok: true })) }]]),
    invocationLog: () => {},
    policy: policy ?? null,
    now: now ?? (() => new Date("2026-07-19T10:00:00.000Z")),
  });
}

test("throwing policy becomes a structured denial", () => {
  const core = gateway({ policy: { allow: () => { throw new Error("policy backend unavailable"); } } });
  assert.doesNotThrow(() => core.invoke(context()));
  assert.equal(core.invoke(context()).ok, false);
});

test("throwing clock becomes a structured denial", () => {
  const core = gateway({ now: () => { throw new Error("clock unavailable"); } });
  assert.doesNotThrow(() => core.invoke(context()));
  assert.equal(core.invoke(context()).ok, false);
});

test("async adapter rejection becomes a structured denial", async () => {
  const core = gateway({ adapter: async () => { throw new Error("async backend down"); } });
  const result = await core.invoke(context());
  assert.equal(result.ok, false);
  assert.equal(result.deny_code, "DENY_ADAPTER_ERROR");
});

test("adapter cannot mutate receipt attribution", () => {
  const request = context();
  const core = gateway({ adapter: (_tool, _params, mutableContext) => {
    mutableContext.work_package_id = "forged-work-package";
    mutableContext.session_id = "forged-session";
    return { ok: true };
  } });
  const result = core.invoke(request);
  assert.equal(result.receipt.work_package_id, "wp_review");
  assert.equal(result.receipt.session_id, "session-review");
});

test("narrowing-only policy cannot reroute an approved read capability", () => {
  let writeAdapterCalled = false;
  const capability = { adapter_id: "fixture", tool: "read", access: "read" };
  const core = new McpGatewayCore({
    capabilityRegistry: new Map([["fixture.read", capability]]),
    adapters: new Map([
      ["fixture", { invoke: () => ({ safe: true }) }],
      ["write-adapter", { invoke: () => { writeAdapterCalled = true; return { wrote: true }; } }],
    ]),
    invocationLog: () => {},
    policy: { allow: (_context, mutableCapability) => {
      mutableCapability.adapter_id = "write-adapter";
      mutableCapability.tool = "write";
      return true;
    } },
  });
  const result = core.invoke(context());
  assert.equal(result.ok, false);
  assert.equal(writeAdapterCalled, false);
});

test("denied attempts are recorded for audit", () => {
  const entries = [];
  const core = new McpGatewayCore({
    capabilityRegistry: new Map(),
    adapters: new Map(),
    invocationLog: (entry) => entries.push(entry),
  });
  const result = core.invoke({ ...context(), capability_id: "unknown.read" });
  assert.equal(result.ok, false);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].disposition, "DENY_UNKNOWN_CAPABILITY");
});

test("adapter failures do not disclose backend error text", () => {
  const core = gateway({ adapter: () => { throw new Error("token=super-secret-value"); } });
  const result = core.invoke(context());
  assert.equal(result.ok, false);
  assert.doesNotMatch(result.message, /super-secret-value/);
});
