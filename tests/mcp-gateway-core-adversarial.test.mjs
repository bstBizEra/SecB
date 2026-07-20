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
  dispatchGuard,
  resultValidator = () => true,
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
    dispatchGuard,
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
    resultValidator: () => true,
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
    resultValidator: () => true,
  });
  const result = await core.invoke({ ...context(), capability_id: "unknown.read" });
  assert.equal(result.ok, false);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].disposition, "DENY_UNKNOWN_CAPABILITY");
  assert.equal(entries[0].terminal, true);
  assert.equal(entries[0].evidence_disposition, "EVIDENCE_CANDIDATE_NOT_ACCEPTED");
  assert.equal(entries[0].sequence, 1);
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
    resultValidator: () => true,
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

  const adapterCore = gateway({
    adapter: never,
    timeouts: short,
    limits: { max_request_bytes: 4_096, max_response_bytes: 4_096, max_concurrency: 1 },
  });
  const adapterResult = await adapterCore.invoke(context());
  assert.equal(adapterResult.deny_code, "DENY_ADAPTER_TIMEOUT_PENDING");
  const afterTimedOutAdapter = await adapterCore.invoke({ ...context(), session_id: "session-after-timeout" });
  assert.equal(afterTimedOutAdapter.deny_code, "DENY_CONCURRENCY_LIMIT");
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

test("underscore-delimited provider tokens in adapter output are denied (FU-2 / Gap C)", async () => {
  // The value screen previously used a hyphen-only separator and missed the
  // most common real-world GitHub token family plus sk_ underscore variants.
  for (const token of [
    "ghp_0123456789abcdefghij",
    "github_pat_11ABCDEF0123456789ABCDEF",
    "sk_live_0123456789abcdef",
  ]) {
    const result = await gateway({ adapter: () => ({ note: token }) }).invoke(context());
    assert.equal(result.deny_code, "DENY_RESULT_INVALID", `expected ${token} to be denied`);
  }
});

test("AWS access-key id in adapter output is denied regardless of field name (FU-3 / A-FIND-2)", async () => {
  const result = await gateway({ adapter: () => ({ note: "AKIAIOSFODNN7EXAMPLE" }) }).invoke(context());
  assert.equal(result.deny_code, "DENY_RESULT_INVALID");
});

test("40-char AWS secret key under an aws/access-key-named field is denied (FU-3)", async () => {
  // Field name is aws-shaped but NOT matched by the general secret-key screen,
  // so this exercises the AWS-secret value heuristic specifically.
  const result = await gateway({
    adapter: () => ({ aws_access_key: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" }),
  }).invoke(context());
  assert.equal(result.deny_code, "DENY_RESULT_INVALID");
});

test("a 40-char base64-ish value under an innocuous field is NOT a false positive (FU-3 tradeoff)", async () => {
  const result = await gateway({
    adapter: () => ({ checksum: "a1b2c3d4e5f60718293a4b5c6d7e8f9011223344" }),
  }).invoke(context());
  assert.equal(result.ok, true);
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

test("global capacity is reserved before the clock and rejects overflow without running hooks", async () => {
  let releaseClock;
  const blockedClock = new Promise((resolve) => { releaseClock = resolve; });
  let clockCalls = 0;
  const entries = [];
  const core = gateway({
    now: () => { clockCalls += 1; return blockedClock; },
    invocationLog: (entry) => entries.push(entry),
    limits: { max_request_bytes: 4_096, max_response_bytes: 4_096, max_concurrency: 1 },
    timeouts: { clock_ms: 1_000, policy_ms: 50, audit_ms: 50, adapter_ms: 50, revocation_ms: 50, result_validator_ms: 50 },
  });
  const first = core.invoke(context());
  await new Promise((resolve) => setTimeout(resolve, 10));
  const overflow = await core.invoke({ ...context(), session_id: "overflow" });
  assert.equal(overflow.deny_code, "DENY_CONCURRENCY_LIMIT");
  assert.equal(overflow.evidence_status, "EVIDENCE_CANDIDATE_RECORDED_NOT_ACCEPTED");
  assert.equal(clockCalls, 1);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].disposition, "DENY_CONCURRENCY_LIMIT");
  assert.equal(entries[0].terminal, true);
  assert.equal(entries[0].sequence, 1);
  assert.equal(entries[0].session_id, "overflow");
  releaseClock(new Date("2026-07-19T10:00:00.000Z"));
  assert.equal((await first).ok, true);
});

test("timed-out clock retains capacity until settlement and records late evidence", async () => {
  let releaseClock;
  const blockedClock = new Promise((resolve) => { releaseClock = resolve; });
  const entries = [];
  const core = gateway({
    now: () => blockedClock,
    invocationLog: (entry) => entries.push(entry),
    limits: { max_request_bytes: 4_096, max_response_bytes: 4_096, max_concurrency: 1 },
    timeouts: { clock_ms: 20, policy_ms: 50, audit_ms: 50, adapter_ms: 50, revocation_ms: 50, result_validator_ms: 50 },
  });
  const timedOut = await core.invoke(context());
  assert.equal(timedOut.deny_code, "DENY_CLOCK_UNAVAILABLE");
  assert.equal(entries[0].disposition, "TIMEOUT_CLOCK_PENDING");
  assert.equal(entries[0].terminal, false);
  assert.equal((await core.invoke({ ...context(), session_id: "held" })).deny_code, "DENY_CONCURRENCY_LIMIT");
  releaseClock(new Date("2026-07-19T10:00:00.000Z"));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(entries.at(-1).disposition, "LATE_SETTLEMENT_CLOCK_SUCCESS");
  assert.equal(entries.at(-1).terminal, true);
  assert.equal((await core.invoke({ ...context(), session_id: "released" })).ok, true);
});

test("timeouts above the Node timer maximum are rejected at construction", () => {
  assert.throws(
    () => gateway({
      timeouts: {
        clock_ms: 2_147_483_648,
        policy_ms: 50,
        audit_ms: 50,
        adapter_ms: 50,
        revocation_ms: 50,
        result_validator_ms: 50,
      },
    }),
    /must not exceed 2147483647/,
  );
});

test("proxied and hostile clock values deny without escaping", async () => {
  const proxiedDate = new Proxy(new Date("2026-07-19T10:00:00.000Z"), {
    get() { throw new Error("clock metadata trap"); },
    getPrototypeOf() { throw new Error("clock prototype trap"); },
  });
  const result = await gateway({ now: () => proxiedDate }).invoke(context());
  assert.equal(result.deny_code, "DENY_CLOCK_UNAVAILABLE");
});

test("request budget covers the complete caller context and params before dispatch", async () => {
  let adapterCalled = false;
  const result = await gateway({
    adapter: () => { adapterCalled = true; return { safe: true }; },
    limits: { max_request_bytes: 512, max_response_bytes: 4_096, max_concurrency: 1 },
  }).invoke({ ...context(), ignoredCallerMetadata: "x".repeat(2_048) }, { small: true });
  assert.equal(result.deny_code, "DENY_REQUEST_INVALID");
  assert.equal(adapterCalled, false);
});

test("response budget covers result plus the complete receipt envelope", async () => {
  const result = await gateway({
    adapter: () => ({ ok: true }),
    limits: { max_request_bytes: 4_096, max_response_bytes: 64, max_concurrency: 1 },
  }).invoke(context());
  assert.equal(result.deny_code, "DENY_RESULT_INVALID");
});

test("normalized camelCase and punctuation variants of secret-like keys are denied", async () => {
  for (const key of ["apiToken", "private-Key", "clientSecret", "access.token", "AUTHORIZATION"]) {
    const result = await gateway({ adapter: () => ({ [key]: "redacted" }) }).invoke(context());
    assert.equal(result.deny_code, "DENY_RESULT_INVALID", `expected ${key} to be denied`);
  }
});

test("public denial messages never echo caller or internal routing identifiers", async () => {
  const callerCapability = "caller-private-capability";
  const unknown = await gateway().invoke({ ...context(), capability_id: callerCapability });
  assert.equal(unknown.message, "request denied");
  assert.doesNotMatch(unknown.message, /caller-private-capability|fixture|read/);

  const adapterFailure = await gateway({
    adapter: () => { throw new Error("internal-adapter-id secret-detail"); },
  }).invoke(context());
  assert.equal(adapterFailure.message, "request denied");
  assert.doesNotMatch(adapterFailure.message, /internal-adapter-id|secret-detail|fixture/);
});

test("revocation is rechecked after the allow audit immediately before adapter dispatch", async () => {
  let checks = 0;
  let adapterCalled = false;
  const entries = [];
  const result = await gateway({
    revocationCheck: () => { checks += 1; return checks === 2; },
    invocationLog: (entry) => entries.push(entry),
    adapter: () => { adapterCalled = true; return { safe: true }; },
  }).invoke(context());
  assert.equal(result.deny_code, "DENY_REVOKED");
  assert.equal(checks, 2);
  assert.equal(adapterCalled, false);
  assert.deepEqual(entries.map((entry) => entry.disposition), ["ALLOW_DISPATCH", "FAILURE_REVOKED"]);
});

test("adapter timeout remains pending, records late settlement, and never redispatches", async () => {
  let releaseAdapter;
  const blockedAdapter = new Promise((resolve) => { releaseAdapter = resolve; });
  let adapterCalls = 0;
  const entries = [];
  const core = gateway({
    adapter: () => { adapterCalls += 1; return blockedAdapter; },
    invocationLog: (entry) => entries.push(entry),
    limits: { max_request_bytes: 4_096, max_response_bytes: 4_096, max_concurrency: 1 },
    timeouts: { clock_ms: 50, policy_ms: 50, audit_ms: 50, adapter_ms: 20, revocation_ms: 50, result_validator_ms: 50 },
  });
  const timedOut = await core.invoke(context());
  assert.equal(timedOut.deny_code, "DENY_ADAPTER_TIMEOUT_PENDING");
  assert.deepEqual(entries.map((entry) => entry.disposition), [
    "ALLOW_DISPATCH",
    "TIMEOUT_ADAPTER_PENDING",
    "DENY_ADAPTER_TIMEOUT_PENDING",
  ]);
  assert.equal(entries[1].terminal, false);
  assert.equal(entries[2].terminal, true);
  assert.equal((await core.invoke({ ...context(), session_id: "held-adapter" })).deny_code, "DENY_CONCURRENCY_LIMIT");
  releaseAdapter({ safe: true });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(entries.at(-1).disposition, "LATE_SETTLEMENT_ADAPTER_SUCCESS");
  assert.equal(adapterCalls, 1);
});

test("prototype-control keys cannot bypass request or complete-response byte accounting", async () => {
  let requestAdapterCalled = false;
  const requestPayload = JSON.parse(`{"__proto__":{"padding":"${"x".repeat(5_000)}"}}`);
  const requestResult = await gateway({
    adapter: () => { requestAdapterCalled = true; return { safe: true }; },
    limits: { max_request_bytes: 512, max_response_bytes: 4_096, max_concurrency: 1 },
  }).invoke(context(), requestPayload);
  assert.equal(requestResult.deny_code, "DENY_REQUEST_INVALID");
  assert.equal(requestAdapterCalled, false);

  const responsePayload = JSON.parse(`{"__proto__":{"publicPayload":"${"x".repeat(5_000)}"}}`);
  const responseResult = await gateway({
    adapter: () => responsePayload,
    limits: { max_request_bytes: 4_096, max_response_bytes: 512, max_concurrency: 1 },
  }).invoke(context());
  assert.equal(responseResult.deny_code, "DENY_RESULT_INVALID");
});

test("normalized successful results use null prototypes and reject Unicode-confusable keys", async () => {
  const safe = await gateway({ adapter: () => ({ public_value: "ok" }) }).invoke(context());
  assert.equal(safe.ok, true);
  assert.equal(Object.getPrototypeOf(safe.result), null);

  for (const key of ["se\u0441ret", "t\u03bfken", "credentia\u04cf"]) {
    const result = await gateway({ adapter: () => ({ [key]: "not-for-callers" }) }).invoke(context());
    assert.equal(result.deny_code, "DENY_RESULT_INVALID", `expected confusable ${key} to be denied`);
  }
});

test("policy, revocation, result-validator, and audit timeouts record ordered late settlement", async () => {
  const short = {
    clock_ms: 50,
    policy_ms: 20,
    audit_ms: 20,
    adapter_ms: 50,
    revocation_ms: 20,
    result_validator_ms: 20,
  };

  for (const fixture of [
    { hook: "POLICY", option: "policy", unavailable: "DENY_POLICY_UNAVAILABLE" },
    { hook: "REVOCATION", option: "revocationCheck", unavailable: "DENY_REVOCATION_UNAVAILABLE" },
    { hook: "RESULT_VALIDATOR", option: "resultValidator", unavailable: "DENY_RESULT_INVALID" },
  ]) {
    let release;
    const blocked = new Promise((resolve) => { release = resolve; });
    const entries = [];
    const options = { invocationLog: (entry) => entries.push(entry), timeouts: short };
    options[fixture.option] = fixture.option === "policy" ? { allow: () => blocked } : () => blocked;
    const result = await gateway(options).invoke(context());
    assert.equal(result.deny_code, fixture.unavailable);
    assert.ok(entries.some((entry) => entry.disposition === `TIMEOUT_${fixture.hook}_PENDING`));
    assert.equal(entries.at(-1).disposition, fixture.unavailable);
    assert.equal(entries.at(-1).terminal, true);
    release(fixture.hook === "REVOCATION" ? false : true);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(entries.at(-1).disposition, `LATE_SETTLEMENT_${fixture.hook}_SUCCESS`);
    assert.deepEqual(entries.map((entry) => entry.sequence), entries.map((_entry, index) => index + 1));
  }

  let releaseAudit;
  const blockedAudit = new Promise((resolve) => { releaseAudit = resolve; });
  const auditEntries = [];
  let firstAudit = true;
  const auditResult = await gateway({
    invocationLog: (entry) => {
      auditEntries.push(entry);
      if (firstAudit) {
        firstAudit = false;
        return blockedAudit;
      }
      return undefined;
    },
    timeouts: short,
  }).invoke(context());
  assert.equal(auditResult.deny_code, "DENY_AUDIT_UNAVAILABLE");
  releaseAudit();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(auditEntries.map((entry) => entry.disposition), [
    "ALLOW_DISPATCH",
    "TIMEOUT_AUDIT_PENDING",
    "LATE_SETTLEMENT_AUDIT_SUCCESS",
  ]);
  assert.deepEqual(auditEntries.map((entry) => entry.sequence), [1, 2, 3]);
  assert.equal(auditEntries[1].terminal, false);
  assert.equal(auditEntries[2].terminal, true);
});

test("synchronous dispatch guard closes the queued-microtask revocation gap", async () => {
  let checks = 0;
  let revoked = false;
  let adapterCalled = false;
  const result = await gateway({
    revocationCheck: () => {
      checks += 1;
      if (checks === 2) queueMicrotask(() => { revoked = true; });
      return revoked;
    },
    adapter: () => { adapterCalled = true; return { safe: true }; },
  }).invoke(context());
  assert.equal(result.deny_code, "DENY_REVOKED");
  assert.equal(checks, 3);
  assert.equal(adapterCalled, false);
});

test("async revocation resolution requires a separate synchronous dispatch guard", async () => {
  const allowed = await gateway({
    revocationCheck: async () => false,
    dispatchGuard: () => false,
  }).invoke(context());
  assert.equal(allowed.ok, true);

  let adapterCalled = false;
  const denied = await gateway({
    revocationCheck: async () => false,
    dispatchGuard: async () => false,
    adapter: () => { adapterCalled = true; return { safe: true }; },
  }).invoke(context());
  assert.equal(denied.deny_code, "DENY_REVOCATION_UNAVAILABLE");
  assert.equal(adapterCalled, false);
});

test("dispatch guard return objects are denied without inspecting attacker-controlled then", async () => {
  let thenReads = 0;
  let adapterCalled = false;
  const entries = [];
  const hostile = Object.create(null, {
    then: {
      get() { thenReads += 1; throw new Error("then getter trap"); },
    },
  });
  const result = await gateway({
    dispatchGuard: () => hostile,
    invocationLog: (entry) => entries.push(entry),
    adapter: () => { adapterCalled = true; return { safe: true }; },
  }).invoke(context());
  assert.equal(result.deny_code, "DENY_REVOCATION_UNAVAILABLE");
  assert.equal(thenReads, 0);
  assert.equal(adapterCalled, false);
  assert.equal(entries.at(-1).disposition, "DENY_REVOCATION_UNAVAILABLE");
  assert.equal(entries.at(-1).terminal, true);

  const thrown = await gateway({
    dispatchGuard: () => { throw new Error("guard trap"); },
    adapter: () => { adapterCalled = true; return { safe: true }; },
  }).invoke(context());
  assert.equal(thrown.deny_code, "DENY_REVOCATION_UNAVAILABLE");
  assert.equal(adapterCalled, false);
});

test("original hook late settlement survives timeout-marker audit recovery", async () => {
  let releasePolicy;
  const blockedPolicy = new Promise((resolve) => { releasePolicy = resolve; });
  let releaseAudit;
  const blockedAudit = new Promise((resolve) => { releaseAudit = resolve; });
  const entries = [];
  const core = gateway({
    policy: { allow: () => blockedPolicy },
    invocationLog: (entry) => {
      entries.push(entry);
      if (entry.disposition === "TIMEOUT_POLICY_PENDING") return blockedAudit;
      return undefined;
    },
    limits: { max_request_bytes: 4_096, max_response_bytes: 4_096, max_concurrency: 1 },
    timeouts: {
      clock_ms: 50,
      policy_ms: 20,
      audit_ms: 20,
      adapter_ms: 50,
      revocation_ms: 50,
      result_validator_ms: 50,
    },
  });
  const result = await core.invoke(context());
  assert.equal(result.deny_code, "DENY_AUDIT_UNAVAILABLE");
  releasePolicy(true);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(entries.some((entry) => entry.disposition === "LATE_SETTLEMENT_POLICY_SUCCESS"), false);
  releaseAudit();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(entries.map((entry) => entry.disposition), [
    "TIMEOUT_POLICY_PENDING",
    "TIMEOUT_AUDIT_PENDING",
    "LATE_SETTLEMENT_AUDIT_SUCCESS",
    "LATE_SETTLEMENT_POLICY_SUCCESS",
  ]);
  assert.deepEqual(entries.map((entry) => entry.sequence), [1, 2, 3, 4]);
  assert.equal((await core.invoke({ ...context(), session_id: "after-audit-recovery" })).ok, true);
});

test("canonical sizing and returned envelopes ignore object and array prototype toJSON hooks", async () => {
  const objectToJSON = Object.getOwnPropertyDescriptor(Object.prototype, "toJSON");
  const arrayToJSON = Object.getOwnPropertyDescriptor(Array.prototype, "toJSON");
  try {
    Object.defineProperty(Object.prototype, "toJSON", {
      value: () => ({}),
      configurable: true,
      writable: true,
    });
    Object.defineProperty(Array.prototype, "toJSON", {
      value: () => [],
      configurable: true,
      writable: true,
    });

    let requestAdapterCalled = false;
    const oversizedRequest = await gateway({
      adapter: () => { requestAdapterCalled = true; return { safe: true }; },
      limits: { max_request_bytes: 512, max_response_bytes: 4_096, max_concurrency: 1 },
    }).invoke(context(), ["x".repeat(5_000)]);
    assert.equal(oversizedRequest.deny_code, "DENY_REQUEST_INVALID");
    assert.equal(requestAdapterCalled, false);

    const oversizedObject = await gateway({
      adapter: () => ({ payload: "x".repeat(5_000) }),
      limits: { max_request_bytes: 4_096, max_response_bytes: 512, max_concurrency: 1 },
    }).invoke(context());
    assert.equal(oversizedObject.deny_code, "DENY_RESULT_INVALID");

    const oversizedArray = await gateway({
      adapter: () => ["x".repeat(5_000)],
      limits: { max_request_bytes: 4_096, max_response_bytes: 512, max_concurrency: 1 },
    }).invoke(context());
    assert.equal(oversizedArray.deny_code, "DENY_RESULT_INVALID");

    const safe = await gateway({
      adapter: () => ({ items: [{ public_value: "ok" }] }),
      limits: { max_request_bytes: 4_096, max_response_bytes: 4_096, max_concurrency: 1 },
    }).invoke(context());
    assert.equal(safe.ok, true);
    assert.equal(Object.getPrototypeOf(safe), null);
    assert.equal(Object.getPrototypeOf(safe.receipt), null);
    assert.equal(Object.getPrototypeOf(safe.result), null);
    assert.equal(Object.getPrototypeOf(safe.result.items), null);
    assert.equal(Object.getPrototypeOf(safe.result.items[0]), null);
    assert.equal(safe.result.items[0].public_value, "ok");
  } finally {
    if (objectToJSON) Object.defineProperty(Object.prototype, "toJSON", objectToJSON);
    else delete Object.prototype.toJSON;
    if (arrayToJSON) Object.defineProperty(Array.prototype, "toJSON", arrayToJSON);
    else delete Array.prototype.toJSON;
  }
});

test("overflow evidence uses bounded non-blocking backpressure without releasing active work", async () => {
  let releaseClock;
  const blockedClock = new Promise((resolve) => { releaseClock = resolve; });
  let releaseFirstEvidence;
  const blockedEvidence = new Promise((resolve) => { releaseFirstEvidence = resolve; });
  const entries = [];
  let loggerCalls = 0;
  let clockCalls = 0;
  const short = {
    clock_ms: 1_000,
    policy_ms: 20,
    audit_ms: 20,
    adapter_ms: 20,
    revocation_ms: 20,
    result_validator_ms: 20,
  };
  const core = gateway({
    now: () => { clockCalls += 1; return blockedClock; },
    invocationLog: (entry) => {
      loggerCalls += 1;
      entries.push(entry);
      if (loggerCalls === 1) return blockedEvidence;
      return undefined;
    },
    limits: { max_request_bytes: 4_096, max_response_bytes: 4_096, max_concurrency: 1 },
    timeouts: short,
  });
  const within = (promise, milliseconds) => Promise.race([
    promise,
    new Promise((_resolve, reject) => setTimeout(
      () => reject(new Error(`operation exceeded ${milliseconds}ms bound`)),
      milliseconds,
    )),
  ]);

  const base = core.invoke(context());
  await new Promise((resolve) => setTimeout(resolve, 10));

  const firstOverflow = await within(
    core.invoke({ ...context(), session_id: "overflow-recording-timeout" }),
    250,
  );
  assert.equal(firstOverflow.deny_code, "DENY_CONCURRENCY_LIMIT");
  assert.equal(firstOverflow.evidence_status, "EVIDENCE_RECORDING_TIMEOUT_UNCONFIRMED");
  assert.equal(loggerCalls, 1);

  const laterOverflow = await within(Promise.all(
    Array.from({ length: 64 }, (_entry, index) => core.invoke({
      ...context(),
      session_id: `overflow-backpressure-${index}`,
    })),
  ), 100);
  for (const result of laterOverflow) {
    assert.equal(result.deny_code, "DENY_CONCURRENCY_LIMIT");
    assert.equal(result.evidence_status, "EVIDENCE_NOT_RECORDED_BACKPRESSURE");
  }
  assert.equal(loggerCalls, 1, "backpressured calls must not start or queue logger work");

  await new Promise((resolve) => setTimeout(resolve, 120));
  const stillSaturated = await within(
    core.invoke({ ...context(), session_id: "overflow-still-active" }),
    100,
  );
  assert.equal(stillSaturated.deny_code, "DENY_CONCURRENCY_LIMIT");
  assert.equal(stillSaturated.evidence_status, "EVIDENCE_NOT_RECORDED_BACKPRESSURE");
  assert.equal(clockCalls, 1, "elapsed time must not release still-active base work");
  assert.equal(loggerCalls, 1);

  releaseFirstEvidence();
  await new Promise((resolve) => setTimeout(resolve, 10));
  const recovered = await within(
    core.invoke({ ...context(), session_id: "overflow-after-recovery" }),
    100,
  );
  assert.equal(recovered.deny_code, "DENY_CONCURRENCY_LIMIT");
  assert.equal(recovered.evidence_status, "EVIDENCE_CANDIDATE_RECORDED_NOT_ACCEPTED");
  assert.equal(loggerCalls, 2);
  assert.deepEqual(entries.map((entry) => entry.session_id), [
    "overflow-recording-timeout",
    "overflow-after-recovery",
  ]);
  assert.deepEqual(entries.map((entry) => entry.sequence), [1, 1]);
  assert.ok(entries.every((entry) => entry.disposition === "DENY_CONCURRENCY_LIMIT"));
  assert.ok(entries.every((entry) => entry.terminal === true));

  releaseClock(new Date("2026-07-20T00:00:00.000Z"));
  assert.equal((await base).ok, true);
});

test("a timed-out clock retains capacity until actual settlement, then releases it", async () => {
  let releaseClock;
  const blockedClock = new Promise((resolve) => { releaseClock = resolve; });
  let clockCalls = 0;
  const short = { clock_ms: 20, policy_ms: 20, audit_ms: 20, adapter_ms: 20, revocation_ms: 20, result_validator_ms: 20 };
  const core = gateway({
    now: () => { clockCalls += 1; return blockedClock; },
    timeouts: short,
    limits: { max_request_bytes: 4_096, max_response_bytes: 4_096, max_concurrency: 1 },
  });

  const first = core.invoke(context());
  await new Promise((resolve) => setTimeout(resolve, 30));

  const immediatelyAfter = await core.invoke({ ...context(), session_id: "session-immediately-after" });
  assert.equal(immediatelyAfter.deny_code, "DENY_CONCURRENCY_LIMIT");

  await new Promise((resolve) => setTimeout(resolve, 120));
  const stillHeld = await core.invoke({ ...context(), session_id: "session-still-held" });
  assert.equal(stillHeld.deny_code, "DENY_CONCURRENCY_LIMIT");
  assert.equal(clockCalls, 1, "elapsed time must not release active work");

  releaseClock(new Date("2026-07-20T00:00:00.000Z"));
  await first;
  await new Promise((resolve) => setTimeout(resolve, 10));
  const recovered = await core.invoke({ ...context(), session_id: "session-after-settlement" });
  assert.equal(recovered.ok, true);
  assert.equal(clockCalls, 2, "actual settlement releases capacity");
});

test("saturated overflow rejects oversized canonical requests before evidence logging", async () => {
  let releaseClock;
  const blocked = new Promise((resolve) => { releaseClock = resolve; });
  let loggerCalls = 0;
  const core = gateway({
    now: () => blocked,
    invocationLog: () => { loggerCalls += 1; },
    limits: { max_request_bytes: 512, max_response_bytes: 4_096, max_concurrency: 1 },
    timeouts: { clock_ms: 1_000, policy_ms: 50, audit_ms: 50, adapter_ms: 50, revocation_ms: 50, result_validator_ms: 50 },
  });
  const compact = { agent_id: "a", harness_id: "h", project_id: "p", work_package_id: "w", workspace_lease_id: "l", session_id: "s", authorization_id: "z", capability_id: "fixture.read", purpose: "p", evidence_required: true };
  const first = core.invoke(compact);
  await new Promise((resolve) => setTimeout(resolve, 10));
  const oversized = await core.invoke({ ...context(), purpose: "x".repeat(1_000_000) }, { payload: "x".repeat(1_000_000) });
  assert.equal(oversized.deny_code, "DENY_REQUEST_INVALID");
  assert.equal(loggerCalls, 0);
  assert.equal((await core.invoke({ ...compact, session_id: "t" })).deny_code, "DENY_CONCURRENCY_LIMIT");
  releaseClock(new Date("2026-07-19T10:00:00.000Z"));
  assert.equal((await first).ok, true);
});

// The bounded-evidence lane remains live while actual execution capacity is
// exhausted: busy-flag backpressure answers overflow calls without a queue,
// while the active reservation remains charged until its operation settles.
test("a hung hook keeps execution capacity charged while overflow remains bounded", async () => {
  const short = { clock_ms: 20, policy_ms: 20, audit_ms: 20, adapter_ms: 20, revocation_ms: 20, result_validator_ms: 20 };
  let releaseAdapter;
  let adapterCalls = 0;
  const core = gateway({
    adapter: () => {
      adapterCalls += 1;
      if (adapterCalls === 1) return new Promise((resolve) => { releaseAdapter = resolve; });
      return { ok: true };
    },
    timeouts: short,
    limits: { max_request_bytes: 4_096, max_response_bytes: 4_096, max_concurrency: 1 },
  });

  await core.invoke(context()); // times out, holds the sole capacity slot

  // Queue several concurrency-limit responses while capacity is exhausted;
  // each traverses #denyConcurrencyAudited's bounded evidence lane.
  const overflowResults = await Promise.all([
    core.invoke({ ...context(), session_id: "overflow-1" }),
    core.invoke({ ...context(), session_id: "overflow-2" }),
    core.invoke({ ...context(), session_id: "overflow-3" }),
  ]);
  for (const result of overflowResults) {
    assert.equal(result.deny_code, "DENY_CONCURRENCY_LIMIT");
  }

  // Elapsed time must not release the still-active adapter reservation.
  await new Promise((resolve) => setTimeout(resolve, 120));
  const laneStillLive = await core.invoke({ ...context(), session_id: "session-lane-still-live" });
  assert.equal(laneStillLive.deny_code, "DENY_CONCURRENCY_LIMIT");
  assert.equal(adapterCalls, 1);

  releaseAdapter({ ok: true });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const recovered = await core.invoke({ ...context(), session_id: "session-lane-after-settlement" });
  assert.equal(recovered.ok, true);
  assert.equal(adapterCalls, 2);
});
