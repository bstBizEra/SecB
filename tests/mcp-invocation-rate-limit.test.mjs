/**
 * Per-caller invocation rate limit — work-package item S8.
 *
 * The property that matters most here is not "a limit exists" but that ONE
 * limit applies across both dispatch paths. The core and the proxy resolve
 * different tools, and the failure mode of getting this wrong is a system that
 * honestly reports enforcing 120/min while actually allowing 240.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { resolve } from "node:path";

import { InvocationRateLimiter } from "../src/mcp/invocation-rate-limiter.mjs";
import { SecBMcpServer } from "../src/mcp/secb-mcp-server.mjs";
import { SecBMcpUpstreamProxy } from "../src/mcp/upstream-proxy.mjs";
import { UpstreamClient } from "../src/mcp/upstream-client.mjs";

const FIXTURE = resolve(import.meta.dirname, "fixtures", "fake-upstream-mcp-server.mjs");

// --- the limiter itself ----------------------------------------------------

test("admit allows up to the limit and then denies", () => {
  const limiter = new InvocationRateLimiter({ maxPerWindow: 3, windowMs: 1000, now: () => 0 });
  for (let i = 1; i <= 3; i += 1) {
    const verdict = limiter.admit("caller");
    assert.equal(verdict.allowed, true);
    assert.equal(verdict.observed, i);
  }
  const denied = limiter.admit("caller");
  assert.equal(denied.allowed, false);
  assert.equal(denied.maxPerWindow, 3);
  assert.ok(denied.retryAfterMs > 0);
});

test("a denial consumes nothing, so being denied does not delay recovery", () => {
  let clock = 0;
  const limiter = new InvocationRateLimiter({ maxPerWindow: 1, windowMs: 100, now: () => clock });
  assert.equal(limiter.admit("c").allowed, true);
  // Hammering while denied must not push the retry window forward.
  for (let i = 0; i < 5; i += 1) assert.equal(limiter.admit("c").allowed, false);
  clock = 101;
  assert.equal(limiter.admit("c").allowed, true, "the original hit aged out on schedule");
});

test("the window slides rather than resetting on a boundary", () => {
  let clock = 0;
  const limiter = new InvocationRateLimiter({ maxPerWindow: 2, windowMs: 100, now: () => clock });
  limiter.admit("c"); // t=0
  clock = 90;
  limiter.admit("c"); // t=90
  clock = 95;
  assert.equal(limiter.admit("c").allowed, false, "two hits are still inside the window");
  clock = 101; // the t=0 hit expires, the t=90 one does not
  assert.equal(limiter.admit("c").allowed, true);
  assert.equal(limiter.admit("c").allowed, false, "a fixed window would have granted a fresh budget here");
});

test("callers are budgeted independently", () => {
  const limiter = new InvocationRateLimiter({ maxPerWindow: 1, windowMs: 1000, now: () => 0 });
  assert.equal(limiter.admit("a").allowed, true);
  assert.equal(limiter.admit("a").allowed, false);
  assert.equal(limiter.admit("b").allowed, true, "b does not pay for a's traffic");
});

test("sweep drops callers whose window has emptied", () => {
  let clock = 0;
  const limiter = new InvocationRateLimiter({ maxPerWindow: 5, windowMs: 100, now: () => clock });
  limiter.admit("a");
  limiter.admit("b");
  assert.equal(limiter.sweep(), 2);
  clock = 500;
  assert.equal(limiter.sweep(), 0);
});

test("the constructor rejects a nonsense configuration", () => {
  // Named, not merely counted as three throws. A rate limiter that rejected
  // every configuration -- including valid ones -- would satisfy a bare
  // assert.throws three times over and report a working limiter.
  assert.throws(() => new InvocationRateLimiter({ maxPerWindow: 0 }), /positive integer maxPerWindow/);
  assert.throws(() => new InvocationRateLimiter({ maxPerWindow: 1.5 }), /positive integer maxPerWindow/);
  assert.throws(() => new InvocationRateLimiter({ windowMs: 0 }), /positive integer windowMs/);
});

// --- enforcement in the governed core --------------------------------------

const registryStub = {
  resolve: (id) =>
    id.startsWith("inst_")
      ? { resolved: true, identity: { agent_instance_id: id, max_data_classification: "INTERNAL" } }
      : { resolved: false, reason: "Unknown agent instance" }
};

function coreServer(calls, rateLimiter = null) {
  return new SecBMcpServer({
    services: {
      registry: registryStub,
      workPackage: { resolveEffective: () => ({ ok: true }) },
      eventLedger: { verify: () => ({ valid: true, headHash: "h", count: 0 }), read: () => [] },
      evidenceLedger: { verify: () => ({ valid: true, headHash: "h", count: 0 }), read: () => [] },
      skillResolver: { resolveSkill: () => ({ ok: true }) }
    },
    invocationLog: (entry) => calls.push(entry),
    classificationCeiling: "INTERNAL",
    rateLimiter
  });
}

const nativeCall = (server, caller = "inst_ok") =>
  server.handle(
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "secb_canonical_fingerprint", arguments: { document: {} } } },
    { callerInstanceId: caller }
  );

test("the core denies past the limit, with a typed code and a ledger row", () => {
  const calls = [];
  const limiter = new InvocationRateLimiter({ maxPerWindow: 2, windowMs: 1000, now: () => 0 });
  const server = coreServer(calls, limiter);

  assert.ok(nativeCall(server).result);
  assert.ok(nativeCall(server).result);
  const denied = nativeCall(server);
  assert.equal(denied.error.data.code, "DENY_RATE_LIMITED");
  assert.ok(denied.error.data.retryAfterMs > 0, "the caller is told when to retry");

  const row = calls.find((c) => c.decision === "DENY_RATE_LIMITED");
  assert.ok(row, "the denial is ledgered like every other decision");
  assert.equal(row.caller, "inst_ok");
});

test("an unresolved caller is denied before it can occupy limiter memory", () => {
  const calls = [];
  const limiter = new InvocationRateLimiter({ maxPerWindow: 1, windowMs: 1000, now: () => 0 });
  const server = coreServer(calls, limiter);
  for (let i = 0; i < 5; i += 1) {
    assert.equal(nativeCall(server, `stranger-${i}`).error.data.code, "DENY_UNRESOLVED_CALLER");
  }
  // The budget was never touched by any of them.
  assert.ok(nativeCall(server).result);
});

test("the core without a limiter is unchanged", () => {
  const server = coreServer([]);
  for (let i = 0; i < 50; i += 1) assert.ok(nativeCall(server).result);
});

test("the core rejects a limiter that cannot admit", () => {
  assert.throws(() => coreServer([], { nope: true }), /admit function/);
});

// --- one budget across both dispatch paths ---------------------------------

/**
 * Build a proxy over the fake upstream and always tear the child down, even if
 * an assertion throws: a surviving UpstreamClient keeps its child process alive
 * and the test runner then hangs instead of reporting the failure.
 */
async function withRateLimitedProxy(limiter, fn) {
  const calls = [];
  const client = new UpstreamClient({
    plan: { id: "fake", transport: "stdio", runtime: "any", host: "wsl", reachable: true, command: process.execPath, args: [FIXTURE, "normal"], env: {} },
    timeoutMs: 5_000
  });
  await client.start();
  const proxy = new SecBMcpUpstreamProxy({
    core: coreServer(calls, limiter),
    clients: new Map([["fake", client]]),
    invocationLog: (entry) => calls.push(entry),
    classificationCeiling: "INTERNAL",
    rateLimiter: limiter
  });
  await proxy.refreshTools();
  // proxy.handle is async even for a native tool, unlike the core's.
  const send = (n, name, args = {}) =>
    proxy.handle({ jsonrpc: "2.0", id: n, method: "tools/call", params: { name, arguments: args } }, { callerInstanceId: "inst_ok" });
  try {
    return await fn({ proxy, calls, send });
  } finally {
    await client.close();
  }
}

test("native and proxied calls draw on the SAME budget", async () => {
  const limiter = new InvocationRateLimiter({ maxPerWindow: 2, windowMs: 60_000, now: () => 0 });
  await withRateLimitedProxy(limiter, async ({ send }) => {
    // One native call and one proxied call exhaust a budget of two.
    assert.ok((await send(1, "secb_canonical_fingerprint", { document: {} })).result);
    assert.ok((await send(2, "fake__echo", { message: "x" })).result);
    const third = await send(3, "fake__echo", { message: "x" });
    assert.equal(third.error.data.code, "DENY_RATE_LIMITED", "the second path did not get its own budget");
  });
});

test("a proxied denial is ledgered", async () => {
  const limiter = new InvocationRateLimiter({ maxPerWindow: 1, windowMs: 60_000, now: () => 0 });
  await withRateLimitedProxy(limiter, async ({ calls, send }) => {
    assert.ok((await send(1, "fake__echo", { message: "x" })).result);
    const denied = await send(2, "fake__echo", { message: "x" });
    assert.equal(denied.error.data.code, "DENY_RATE_LIMITED");
    const row = calls.find((c) => c.type === "MCP_UPSTREAM_INVOCATION" && c.decision === "DENY_RATE_LIMITED");
    assert.ok(row, "the proxied denial is ledgered");
    assert.equal(row.upstream, "fake");
  });
});

test("the proxy rejects a limiter that cannot admit", () => {
  assert.throws(
    () =>
      new SecBMcpUpstreamProxy({
        core: coreServer([]),
        invocationLog: () => {},
        rateLimiter: { nope: true }
      }),
    /admit function/
  );
});

// --- ordering: the limit must precede every other post-resolution deny -------

test("a denied tool name still spends budget, so refused calls cannot be unbounded", async () => {
  // Regression. The exposure and delimiter checks sat ABOVE the rate limit, so
  // both were reachable without spending any: 50 calls against a limit of 3
  // produced 50 exposure denials and 0 rate-limit denials. Every one of those
  // writes a ledger row, which in deployment is a synchronous appendFileSync,
  // so a resolvable caller could drive unbounded disk writes through exactly
  // the path the limit exists to bound.
  const limiter = new InvocationRateLimiter({ maxPerWindow: 3, windowMs: 60_000, now: () => 0 });
  const calls = [];
  const proxy = new SecBMcpUpstreamProxy({
    core: coreServer(calls, limiter),
    clients: new Map([["u", { state: "ready" }]]),
    upstreamPolicy: new Map([["u", { tools_deny: ["secret"] }]]),
    invocationLog: (entry) => calls.push(entry),
    classificationCeiling: "INTERNAL",
    rateLimiter: limiter
  });
  for (let i = 0; i < 50; i += 1) {
    await proxy.handle(
      { jsonrpc: "2.0", id: i, method: "tools/call", params: { name: "u__secret", arguments: {} } },
      { callerInstanceId: "inst_ok" }
    );
  }
  const notExposed = calls.filter((c) => c.decision === "DENY_UPSTREAM_TOOL_NOT_EXPOSED").length;
  const limited = calls.filter((c) => c.decision === "DENY_RATE_LIMITED").length;
  assert.equal(notExposed, 3, "only the budget's worth of attempts reach the exposure check");
  assert.equal(limited, 47, "the rest are refused by the limit");
});

test("the limit is checked at the same point on both dispatch paths", () => {
  // Both orders are "immediately after caller resolution". Divergence is what
  // produced the bug above, so it is asserted rather than left to review.
  const nativeLimiter = new InvocationRateLimiter({ maxPerWindow: 1, windowMs: 60_000, now: () => 0 });
  const server = coreServer([], nativeLimiter);
  assert.ok(nativeCall(server).result);
  // An UNKNOWN tool on the core path is still rate limited, not answered
  // DENY_UNKNOWN_TOOL, which is the same precedence the proxy now uses.
  const denied = server.handle(
    { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "secb_no_such_tool", arguments: {} } },
    { callerInstanceId: "inst_ok" }
  );
  assert.equal(denied.error.data.code, "DENY_RATE_LIMITED");
});
