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

function gateway({
  adapter,
  policy,
  now,
  invocationLog = () => {},
  revocationCheck = () => false,
  resultValidator,
  limits,
  timeouts,
} = {}) {
  return new McpGatewayCore({
    capabilityRegistry: new Map([
      ["fixture.read", { adapter_id: "fixture", tool: "read", access: "read" }],
    ]),
    adapters: new Map([["fixture", { invoke: adapter ?? (() => ({ ok: true })) }]]),
    invocationLog,
    policy: policy ?? null,
    now: now ?? (() => new Date("2026-07-19T10:00:00.000Z")),
    revocationCheck,
    resultValidator,
    limits,
    timeouts,
  });
}

test("throwing policy becomes a structured denial", async () => {
  const core = gateway({ policy: { allow: () => { throw new Error("policy backend unavailable"); } } });
  const result = await core.invoke(context());
  assert.equal(result.ok, false);
  assert.equal(result.deny_code, "DENY_POLICY_UNAVAILABLE");
});

test("throwing clock becomes a structured denial", async () => {
  const core = gateway({ now: () => { throw new Error("clock unavailable"); } });
  const result = await core.invoke(context());
  assert.equal(result.ok, false);
  assert.equal(result.deny_code, "DENY_CLOCK_UNAVAILABLE");
});

test("async adapter rejection becomes a structured denial", async () => {
  const core = gateway({ adapter: async () => { throw new Error("async backend down"); } });
  const result = await core.invoke(context());
  assert.equal(result.ok, false);
  assert.equal(result.deny_code, "DENY_ADAPTER_ERROR");
});

test("adapter cannot mutate receipt attribution", async () => {
  const request = context();
  const core = gateway({ adapter: (_tool, _params, mutableContext) => {
    mutableContext.work_package_id = "forged-work-package";
    mutableContext.session_id = "forged-session";
    return { ok: true };
  } });
  const result = await core.invoke(request);
  assert.equal(result.ok, false);
  assert.equal(result.deny_code, "DENY_ADAPTER_ERROR");
  assert.equal(request.work_package_id, "wp_review");
  assert.equal(request.session_id, "session-review");
});

test("narrowing-only policy cannot reroute an approved read capability", async () => {
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
    revocationCheck: () => false,
  });
  const result = await core.invoke(context());
  assert.equal(result.ok, false);
  assert.equal(writeAdapterCalled, false);
});

test("denied attempts are recorded for audit", async () => {
  const entries = [];
  const core = new McpGatewayCore({
    capabilityRegistry: new Map(),
    adapters: new Map(),
    invocationLog: (entry) => entries.push(entry),
    revocationCheck: () => false,
  });
  const result = await core.invoke({ ...context(), capability_id: "unknown.read" });
  assert.equal(result.ok, false);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].disposition, "DENY_UNKNOWN_CAPABILITY");
});

test("adapter failures do not disclose backend error text", async () => {
  const core = gateway({ adapter: () => { throw new Error("token=super-secret-value"); } });
  const result = await core.invoke(context());
  assert.equal(result.ok, false);
  assert.doesNotMatch(result.message, /super-secret-value/);
});

test("hostile capability access getter yields an audited structured denial", async () => {
  const entries = [];
  const hostileCapability = {
    adapter_id: "fixture",
    tool: "read",
    get access() { throw new Error("coercion trap"); },
  };
  const core = new McGatewayForHostileMetadata(hostileCapability, entries);
  const result = await core.invoke(context());
  assert.equal(result.ok, false);
  assert.equal(result.deny_code, "DENY_INVALID_CAPABILITY");
  assert.equal(entries.at(-1).disposition, "DENY_INVALID_CAPABILITY");
});

function McGatewayForHostileMetadata(capability, entries) {
  return new McpGatewayCore({
    capabilityRegistry: new Map([["fixture.read", capability]]),
    adapters: new Map([["fixture", { invoke: () => ({ ok: true }) }]]),
    invocationLog: (entry) => entries.push(entry),
    revocationCheck: () => false,
  });
}

test("request and response byte budgets deny oversized envelopes", async () => {
  const requestCore = gateway({ limits: { max_request_bytes: 256, max_response_bytes: 1_024, max_concurrency: 1 } });
  const requestResult = await requestCore.invoke(context(), { payload: "x".repeat(1_024) });
  assert.equal(requestResult.deny_code, "DENY_REQUEST_INVALID");

  const responseCore = gateway({
    adapter: () => ({ payload: "x".repeat(1_024) }),
    limits: { max_request_bytes: 4_096, max_response_bytes: 128, max_concurrency: 1 },
  });
  const responseResult = await responseCore.invoke(context(), {});
  assert.equal(responseResult.deny_code, "DENY_RESULT_INVALID");
});

test("policy, audit, and adapter hooks have hard fail-closed timeouts", async () => {
  const never = () => new Promise(() => {});
  const short = {
    clock_ms: 20,
    policy_ms: 20,
    audit_ms: 20,
    adapter_ms: 20,
    revocation_ms: 20,
    result_validator_ms: 20,
  };
  const policyResult = await gateway({ policy: { allow: never }, timeouts: short }).invoke(context());
  assert.equal(policyResult.deny_code, "DENY_POLICY_UNAVAILABLE");

  const auditResult = await gateway({ invocationLog: never, timeouts: short }).invoke(context());
  assert.equal(auditResult.deny_code, "DENY_AUDIT_UNAVAILABLE");

  const adapterResult = await gateway({ adapter: never, timeouts: short }).invoke(context());
  assert.equal(adapterResult.deny_code, "DENY_ADAPTER_ERROR");
});

test("concurrency cap rejects queued work without dispatch", async () => {
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const core = gateway({
    adapter: async () => { calls += 1; await blocked; return { safe: true }; },
    limits: { max_request_bytes: 4_096, max_response_bytes: 4_096, max_concurrency: 1 },
    timeouts: { clock_ms: 50, policy_ms: 50, audit_ms: 50, adapter_ms: 1_000, revocation_ms: 50, result_validator_ms: 50 },
  });
  const first = core.invoke(context());
  await new Promise((resolve) => setTimeout(resolve, 10));
  const second = await core.invoke({ ...context(), session_id: "session-review-2" });
  assert.equal(second.deny_code, "DENY_CONCURRENCY_LIMIT");
  assert.equal(calls, 1);
  release();
  assert.equal((await first).ok, true);
});

test("default output controls and injected validator fail closed", async () => {
  const secretKey = await gateway({ adapter: () => ({ api_token: "not-for-callers" }) }).invoke(context());
  assert.equal(secretKey.deny_code, "DENY_RESULT_INVALID");

  const secretValue = await gateway({ adapter: () => ({ output: "Bearer abcdefghijklmnop" }) }).invoke(context());
  assert.equal(secretValue.deny_code, "DENY_RESULT_INVALID");

  const narrowed = await gateway({
    adapter: () => ({ classification: "restricted" }),
    resultValidator: () => false,
  }).invoke(context());
  assert.equal(narrowed.deny_code, "DENY_RESULT_INVALID");
});

test("dispatch audit has pre-dispatch and terminal success or failure dispositions", async () => {
  const successEntries = [];
  const success = await gateway({ invocationLog: (entry) => successEntries.push(entry) }).invoke(context());
  assert.equal(success.ok, true);
  assert.deepEqual(successEntries.map((entry) => entry.disposition), ["ALLOW_DISPATCH", "SUCCESS"]);
  assert.equal(successEntries[1].terminal, true);
  assert.equal(successEntries[1].evidence_disposition, "EVIDENCE_CANDIDATE_NOT_ACCEPTED");

  const failureEntries = [];
  const failure = await gateway({
    invocationLog: (entry) => failureEntries.push(entry),
    adapter: () => { throw new Error("backend down"); },
  }).invoke(context());
  assert.equal(failure.deny_code, "DENY_ADAPTER_ERROR");
  assert.deepEqual(failureEntries.map((entry) => entry.disposition), ["ALLOW_DISPATCH", "FAILURE_ADAPTER"]);
  assert.equal(failureEntries[1].evidence_disposition, "EVIDENCE_CANDIDATE_NOT_ACCEPTED");
});

test("revocation and kill-switch check runs before dispatch and fails closed", async () => {
  let adapterCalled = false;
  const revoked = await gateway({
    revocationCheck: () => true,
    adapter: () => { adapterCalled = true; return { safe: true }; },
  }).invoke(context());
  assert.equal(revoked.deny_code, "DENY_REVOKED");
  assert.equal(adapterCalled, false);

  const unavailable = await gateway({ revocationCheck: () => { throw new Error("control offline"); } }).invoke(context());
  assert.equal(unavailable.deny_code, "DENY_REVOCATION_UNAVAILABLE");
});
