/**
 * SecB MCP hub launcher — process lifecycle.
 *
 * Every bug this file guards was found by running the hub by hand, not by a
 * unit test, because they are all properties of the PROCESS rather than of a
 * function: the activation gate, exiting when the client disconnects, and
 * answering a request that was accepted just before stdin closed.
 *
 * The hub is spawned against a generated registry that declares only the local
 * fake upstream, so these tests never reach npx, uvx, or the network.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const HUB = resolve(ROOT, "tools", "start-secb-mcp-hub.mjs");
const FAKE = resolve(ROOT, "tests", "fixtures", "fake-upstream-mcp-server.mjs");

/**
 * Write a registry declaring one stdio upstream that is the local fixture.
 * Paths are absolute because the registry carries argv verbatim — it has no
 * path-resolution behaviour of its own, by design.
 */
function writeTestRegistry() {
  const dir = mkdtempSync(join(tmpdir(), "secb-hub-test-"));
  const path = join(dir, "mcp-upstreams.json");
  writeFileSync(
    path,
    JSON.stringify({
      schema_version: "1.0",
      registry_id: "hub-launcher-test",
      wsl_distro: "test-distro",
      upstreams: [
        {
          id: "faketest",
          description: "Local fixture upstream",
          enabled: true,
          transport: "stdio",
          runtime: "any",
          command: process.execPath,
          args: [FAKE, "normal"],
          classification_ceiling: "INTERNAL"
        }
      ]
    }),
    "utf8"
  );
  return path;
}

/**
 * Spawn the hub, write the given JSON-RPC lines, close stdin, and collect the
 * result. Closing stdin is the point: it is what a disconnecting MCP client
 * does, and it is the trigger for the shutdown path under test.
 */
function runHub(lines, { authorized = true, args = [], timeoutMs = 20_000 } = {}) {
  return new Promise((resolvePromise, reject) => {
    const env = { ...process.env, UV_LINK_MODE: "copy" };
    if (authorized) env.SECB_MCP_UPSTREAMS_AUTHORIZED = "operator";
    else delete env.SECB_MCP_UPSTREAMS_AUTHORIZED;

    const child = spawn(process.execPath, [HUB, ...args], { cwd: ROOT, env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`hub did not exit within ${timeoutMs}ms (stderr: ${stderr.slice(-400)})`));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("exit", (code) => {
      clearTimeout(timer);
      const responses = stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "")
        .map((line) => JSON.parse(line));
      resolvePromise({ code, stdout, stderr, responses });
    });

    for (const line of lines) child.stdin.write(`${JSON.stringify(line)}\n`);
    child.stdin.end();
  });
}

test("the hub refuses to spawn upstreams without operator authorization", async () => {
  const result = await runHub([{ jsonrpc: "2.0", id: 1, method: "tools/list" }], { authorized: false });
  assert.equal(result.code, 2, "an unauthorized start is a distinct non-zero exit");
  assert.equal(result.responses.length, 0, "nothing is served");
  assert.match(result.stderr, /SECB_MCP_UPSTREAMS_AUTHORIZED/);
  // The refusal points at the narrower entry rather than dead-ending.
  assert.match(result.stderr, /start-secb-mcp\.mjs/);
});

test("the hub exits cleanly when stdin closes, leaving no orphan", async () => {
  const registry = writeTestRegistry();
  const result = await runHub([{ jsonrpc: "2.0", id: 1, method: "tools/list" }], { args: ["--registry", registry] });
  // A non-exit here is the orphan bug: spawned children keep the event loop
  // alive and the hub lingers holding every upstream open.
  assert.equal(result.code, 0);
});

test("the hub fronts a declared upstream under a namespace", async () => {
  const registry = writeTestRegistry();
  const result = await runHub([{ jsonrpc: "2.0", id: 1, method: "tools/list" }], { args: ["--registry", registry] });
  const names = result.responses[0].result.tools.map((t) => t.name);
  assert.ok(names.includes("secb_events_read"), "native tools are still served");
  assert.ok(names.includes("faketest__echo"), "upstream tools are namespaced");
  assert.match(result.stderr, /up faketest/);
});

test("a call accepted just before stdin closes is still answered", async () => {
  // Regression: stdin closing and a proxied call resolving are independent
  // events. Shutting down on close alone killed the upstream mid-request and
  // this answer came back DENY_UPSTREAM_CLOSED instead of a result.
  const registry = writeTestRegistry();
  const result = await runHub(
    [{ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "faketest__echo", arguments: { message: "drained" } } }],
    { args: ["--registry", registry] }
  );
  assert.equal(result.code, 0);
  assert.equal(result.responses.length, 1);
  const answer = result.responses[0];
  assert.ok(!answer.error, `expected a result, got ${JSON.stringify(answer.error)}`);
  assert.equal(answer.result.upstream, "faketest");
  assert.equal(answer.result.data.content[0].text, "drained");
});

test("a slow call accepted before close is drained rather than cut off", async () => {
  const registry = writeTestRegistry();
  const result = await runHub(
    [{ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "faketest__slow", arguments: { ms: 400 } } }],
    { args: ["--registry", registry] }
  );
  assert.equal(result.responses.length, 1);
  assert.ok(!result.responses[0].error, "the drain waits for work already accepted");
  assert.equal(result.responses[0].result.data.content[0].text, "slept");
});

test("--no-upstreams serves the core alone", async () => {
  const registry = writeTestRegistry();
  const result = await runHub([{ jsonrpc: "2.0", id: 1, method: "tools/list" }], {
    args: ["--registry", registry, "--no-upstreams"]
  });
  assert.equal(result.code, 0);
  const names = result.responses[0].result.tools.map((t) => t.name);
  assert.ok(names.includes("secb_events_read"));
  assert.ok(!names.some((n) => n.includes("__")), "no upstream is fronted");
  assert.match(result.stderr, /--no-upstreams/);
});

test("an unusable registry is fatal rather than a hub that silently serves nothing", async () => {
  const dir = mkdtempSync(join(tmpdir(), "secb-hub-bad-"));
  const path = join(dir, "broken.json");
  writeFileSync(path, "{ not json", "utf8");
  const result = await runHub([{ jsonrpc: "2.0", id: 1, method: "tools/list" }], { args: ["--registry", path] });
  assert.equal(result.code, 3);
  assert.match(result.stderr, /registry unusable/);
  assert.equal(result.responses.length, 0);
});

test("multiple requests on one connection are all answered", async () => {
  const registry = writeTestRegistry();
  const result = await runHub(
    [
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "faketest__add", arguments: { a: 2, b: 40 } } },
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "secb_canonical_fingerprint", arguments: { document: { a: 1 } } } },
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "faketest__echo", arguments: { message: "third" } } }
    ],
    { args: ["--registry", registry] }
  );
  assert.equal(result.responses.length, 3);
  const byId = new Map(result.responses.map((r) => [r.id, r]));
  assert.equal(byId.get(1).result.data.content[0].text, "42");
  assert.ok(typeof byId.get(2).result.data.content_hash === "string", "a native call is unaffected by the proxy path");
  assert.equal(byId.get(3).result.data.content[0].text, "third");
});
