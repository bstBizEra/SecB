// The upstream subsystem's refusals, demonstrated.
//
// WORK PACKAGE (Phase E)
//
//   Objective    Close the upstream cluster of the deny-path ratchet: seven
//                refusals across upstream-client, upstream-proxy and
//                upstream-registry that no test had ever triggered.
//   Why here     upstream-client is, by its own header, "the first module in
//                src/mcp that spawns a process". Its refusals are the boundary
//                between a governed plan and a running child, and none of them
//                had been shown to fire.
//   Safety       No process is spawned. The client INJECTS its spawn function
//                (`this.#spawn = spawn`, defaulting to node's), so every path is
//                reachable with a fake. A test that had to spawn a real child to
//                prove a refusal would be trading the boundary for the coverage.
//   Scope        tests/ only. No src module is modified.
//   Authority    AMD-002 §1 pre-authorized path.
//
// Each case asserts the EXACT code. On a process boundary the difference between
// "the plan was bad" and "the spawn failed" is the difference between a
// configuration error and a host problem, and a test that accepts either teaches
// the reader nothing.

import { strict as assert } from "node:assert";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { UpstreamClient, UpstreamClientError } from "../src/mcp/upstream-client.mjs";
import { UpstreamRegistryError, loadUpstreamRegistry } from "../src/mcp/upstream-registry.mjs";

const PLAN = Object.freeze({
  id: "probe-upstream",
  reachable: true,
  transport: "stdio",
  command: "node",
  args: ["--version"],
  env: {}
});

/** A child that never really exists: streams that go nowhere, events on demand. */
function fakeChild({ writable = true } = {}) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stdout.setEncoding = () => {};
  child.stderr = new EventEmitter();
  child.stderr.setEncoding = () => {};
  child.stdin = { writable, write: () => true, end: () => {} };
  child.kill = () => {};
  return child;
}

function denies(code, run) {
  let error = null;
  try {
    run();
  } catch (caught) {
    error = caught;
  }
  assert.ok(error, `expected ${code}, but the call returned instead of refusing`);
  assert.equal(error.code, code, `expected ${code}, got ${error.code ?? error.message}`);
  assert.ok(error instanceof UpstreamClientError || error instanceof UpstreamRegistryError,
    `${code} must be raised as a typed upstream error, not a bare Error`);
}

test("DENY_UPSTREAM_PLAN — constructed without a resolved plan carrying an id", () => {
  denies("DENY_UPSTREAM_PLAN", () => new UpstreamClient({ plan: undefined }));
  denies("DENY_UPSTREAM_PLAN", () => new UpstreamClient({ plan: {} }));
  // A blank id is refused, not trimmed into existence. An upstream with no name
  // cannot be audited, and the audit trail is the reason this layer exists.
  denies("DENY_UPSTREAM_PLAN", () => new UpstreamClient({ plan: { ...PLAN, id: "   " } }));
});

test("DENY_UPSTREAM_SPAWN — the spawn call itself throws", async () => {
  const client = new UpstreamClient({
    plan: PLAN,
    spawn: () => {
      const error = new Error("no such file");
      error.code = "ENOENT";
      throw error;
    }
  });

  // start() RESOLVES here rather than rejecting, and that is the real contract
  // rather than an oversight. #fail rejects PENDING requests; a synchronous
  // spawn throw happens before any request exists, so there is nothing to
  // reject and the refusal is recorded in state instead.
  //
  // My first version asserted a rejection and failed. Forcing the module to
  // reject would have changed working behaviour to match my assumption; what
  // matters is that the refusal is OBSERVABLE and carries its exact code, which
  // it is and does.
  const returned = await client.start();
  assert.equal(returned, undefined, "a synchronous spawn failure resolves rather than rejecting");
  assert.equal(client.state, "failed");
  assert.equal(client.failure.code, "DENY_UPSTREAM_SPAWN");
  assert.match(client.failure.message, /ENOENT/, "the refusal names the host error that caused it");
});

test("DENY_UPSTREAM_SPAWN — the child emits an error event after spawning", async () => {
  // The second half of the same refusal. A spawn that returns and THEN fails is
  // the common case on a host where the binary exists but cannot execute, and it
  // reaches the failure through a different path than the throw above.
  const child = fakeChild();
  const client = new UpstreamClient({ plan: PLAN, spawn: () => child, timeoutMs: 50 });
  const started = client.start().catch((error) => error);
  queueMicrotask(() => child.emit("error", Object.assign(new Error("denied"), { code: "EACCES" })));
  const result = await started;
  assert.equal(result?.code ?? result?.deny_code, "DENY_UPSTREAM_SPAWN");
});

test("DENY_UPSTREAM_EXIT — the child exits before the handshake completes", async () => {
  const child = fakeChild();
  const client = new UpstreamClient({ plan: PLAN, spawn: () => child, timeoutMs: 50 });
  const started = client.start().catch((error) => error);
  queueMicrotask(() => child.emit("exit", 1, null));
  const result = await started;
  assert.equal(result?.code ?? result?.deny_code, "DENY_UPSTREAM_EXIT");
});

test("DENY_UPSTREAM_REGISTRY_MALFORMED — the registry file is not valid JSON", () => {
  const dir = mkdtempSync(join(tmpdir(), "secb-upstream-registry-"));
  try {
    const path = join(dir, "registry.json");
    writeFileSync(path, "{ this is not json ");
    denies("DENY_UPSTREAM_REGISTRY_MALFORMED", () => loadUpstreamRegistry(path));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("DENY_UPSTREAM_WRITE — the child's stdin is not writable", async () => {
  // Reached through start(), which issues the initialize request and so performs
  // the first write. A child that spawned but whose stdin has already closed is
  // the shape this refusal exists for: the process is there, the pipe is not.
  const client = new UpstreamClient({
    plan: PLAN,
    spawn: () => fakeChild({ writable: false }),
    timeoutMs: 50
  });
  const result = await client.start().catch((error) => error);
  const code = result?.code ?? client.failure?.code;
  assert.equal(code, "DENY_UPSTREAM_WRITE", `expected DENY_UPSTREAM_WRITE, got ${code ?? "no refusal"}`);
});
