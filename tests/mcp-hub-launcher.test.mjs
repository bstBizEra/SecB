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
function writeTestRegistry({ mode = "normal", timeoutMs, marker } = {}) {
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
          // The marker is inert argv the fixture ignores. It exists so a test
          // can count ITS OWN spawned children: node --test runs files
          // concurrently and another file spawns the same fixture, so counting
          // by fixture path alone would be flaky rather than wrong-looking.
          args: marker === undefined ? [FAKE, mode] : [FAKE, mode, marker],
          classification_ceiling: "INTERNAL",
          ...(timeoutMs === undefined ? {} : { timeout_ms: timeoutMs })
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

/**
 * Like runHub, but records WHEN the first response arrived and keeps stdin open
 * until then. Time-to-first-response is the whole point of U2 and is invisible
 * to runHub, which only reports what arrived by exit.
 */
function runHubStreaming(lines, { args = [], closeAfterFirstResponseMs = 0, timeoutMs = 40_000 } = {}) {
  return new Promise((resolvePromise, reject) => {
    const started = Date.now();
    const child = spawn(process.execPath, [HUB, ...args], {
      cwd: ROOT,
      env: { ...process.env, SECB_MCP_UPSTREAMS_AUTHORIZED: "operator", UV_LINK_MODE: "copy" },
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let firstResponseMs = null;
    let stderrAtFirstResponse = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`hub did not exit within ${timeoutMs}ms (stderr: ${stderr.slice(-400)})`));
    }, timeoutMs);

    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      stdout += chunk;
      if (firstResponseMs === null && stdout.includes("\n")) {
        firstResponseMs = Date.now() - started;
        // Snapshot stderr AT that moment: what matters is what the hub had
        // already reported when it answered, not what it reported eventually.
        stderrAtFirstResponse = stderr;
        setTimeout(() => child.stdin.end(), closeAfterFirstResponseMs);
      }
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("exit", (code) => {
      clearTimeout(timer);
      const responses = stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "")
        .map((line) => JSON.parse(line));
      resolvePromise({ code, stdout, stderr: stderrAtFirstResponse, stderrFull: stderr, responses, firstResponseMs });
    });

    for (const line of lines) child.stdin.write(`${JSON.stringify(line)}\n`);
  });
}

/** Count live fixture processes carrying this test's unique marker. */
function countFixtureProcesses(execFileSync, marker) {
  let out = "";
  try {
    out = execFileSync("ps", ["-eo", "args="], { encoding: "utf8" });
  } catch {
    return 0;
  }
  return out.split("\n").filter((line) => line.includes(marker) && line.includes(FAKE)).length;
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

// --- U2: the handshake must not wait on upstreams -------------------------

test("the handshake is answered before any upstream is contacted", async () => {
  // The fixture in silent mode accepts the spawn but never answers, so it stays
  // mid-startup for the whole test. A pre-serve startup would block here until
  // the upstream's own timeout; the handshake must come back regardless.
  const registry = writeTestRegistry({ mode: "silent", timeoutMs: 30_000 });
  const result = await runHubStreaming(
    [{ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } }],
    { args: ["--registry", registry], closeAfterFirstResponseMs: 100 }
  );
  assert.ok(result.firstResponseMs !== null, "a response arrived");
  assert.ok(
    result.firstResponseMs < 10_000,
    `handshake took ${result.firstResponseMs}ms; it must not wait on the upstream's 30s timeout`
  );
  assert.equal(result.responses[0].result.protocolVersion, "2024-11-05");
  assert.ok(!/up faketest/.test(result.stderr), "no upstream reported ready before the handshake was served");
});

test("a proxied call still succeeds once the background startup completes", async () => {
  const registry = writeTestRegistry();
  const result = await runHub(
    [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } },
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "faketest__echo", arguments: { message: "lazy" } } }
    ],
    { args: ["--registry", registry] }
  );
  const byId = new Map(result.responses.map((r) => [r.id, r]));
  // The namespaced call arrives before startup finishes, so this asserts the
  // readiness gate waited rather than answering DENY_UNKNOWN_TOOL.
  assert.ok(!byId.get(2).error, `expected a result, got ${JSON.stringify(byId.get(2).error)}`);
  assert.equal(byId.get(2).result.data.content[0].text, "lazy");
});

// --- U5: no orphan on a signal during startup ------------------------------

test("SIGINT during startup leaves no orphaned child", async () => {
  const { execFileSync } = await import("node:child_process");
  const marker = `secb-u5-orphan-${process.pid}-${Date.now()}`;
  // clingy, not silent: a silent fixture exits by itself the moment the parent's
  // stdin pipe closes, so it could never BE an orphan and this test passed with
  // the hub's signal handling removed entirely. clingy holds a timer, like a
  // real upstream holding a socket, so surviving the parent is possible and the
  // assertion means something.
  const registry = writeTestRegistry({ mode: "clingy", timeoutMs: 60_000, marker });

  const child = spawn(process.execPath, [HUB, "--registry", registry], {
    cwd: ROOT,
    env: { ...process.env, SECB_MCP_UPSTREAMS_AUTHORIZED: "operator", UV_LINK_MODE: "copy" },
    stdio: ["pipe", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr.setEncoding("utf8").on("data", (c) => { stderr += c; });

  try {
    // Wait until the child actually exists, or the test would pass trivially by
    // signalling before anything had been spawned.
    await new Promise((resolveWait, rejectWait) => {
      const deadline = setTimeout(() => rejectWait(new Error(`upstream never spawned; stderr: ${stderr}`)), 30_000);
      const poll = setInterval(() => {
        if (countFixtureProcesses(execFileSync, marker) > 0) {
          clearInterval(poll);
          clearTimeout(deadline);
          resolveWait();
        }
      }, 100);
    });

    child.kill("SIGINT");
    await new Promise((resolveExit) => child.once("exit", resolveExit));
    // Let the OS finish reaping before counting.
    await new Promise((r) => setTimeout(r, 500));

    assert.equal(
      countFixtureProcesses(execFileSync, marker),
      0,
      "the fixture upstream outlived the hub that spawned it"
    );
  } finally {
    child.kill("SIGKILL");
    // Never leave a stray behind even if an assertion above threw.
    try {
      execFileSync("pkill", ["-f", marker]);
    } catch {
      // pkill exits non-zero when nothing matched, which is the good case.
    }
  }
});
