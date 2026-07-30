#!/usr/bin/env node
/**
 * SecB MCP hub entry — the SecB MCP server PLUS its declared upstreams.
 *
 * This is what replaces bizera-win-mcp-hub at the client-config level: an MCP
 * client configures ONE server (this one) instead of 17, and SecB fans out
 * behind a single governed surface.
 *
 * Activation gate: tools/start-secb-mcp.mjs serves read-only native projections
 * and needs only SECB_MCP_DEPLOYMENT_AUTHORIZED. This entry additionally SPAWNS
 * child processes declared in the registry, which is a strictly larger step, so
 * it carries its own flag. Without it this file serves nothing.
 *
 *   SECB_MCP_UPSTREAMS_AUTHORIZED=operator node tools/start-secb-mcp-hub.mjs
 *
 * Options:
 *   --host <windows|wsl|linux>   override host detection
 *   --registry <path>            override the upstream registry path
 *   --no-upstreams               start the core only (useful for bisecting)
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createInvocationLedgerWriter, prepareDeployment } from "./secb-mcp-server-wiring.mjs";
import { serveStdio } from "../src/mcp/jsonrpc-stdio.mjs";
import { detectHost, loadUpstreamRegistry, resolveRegistry } from "../src/mcp/upstream-registry.mjs";
import { UpstreamClient } from "../src/mcp/upstream-client.mjs";
import { SecBMcpUpstreamProxy } from "../src/mcp/upstream-proxy.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

const UPSTREAM_ENV_FLAG = "SECB_MCP_UPSTREAMS_AUTHORIZED";
const UPSTREAM_ENV_VALUE = "operator";

const argv = process.argv.slice(2);
const argValue = (flag) => {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
};

// Diagnostics go to stderr: stdout is the JSON-RPC channel and a stray line
// there corrupts the stream for the client.
const note = (message) => process.stderr.write(`[secb-mcp-hub] ${message}\n`);

if (process.env[UPSTREAM_ENV_FLAG] !== UPSTREAM_ENV_VALUE) {
  note(`refusing to start: spawning declared upstreams is an operator-authorized step (set ${UPSTREAM_ENV_FLAG}=${UPSTREAM_ENV_VALUE}).`);
  note("to serve SecB's own read-only tools without upstreams, use tools/start-secb-mcp.mjs.");
  process.exit(2);
}

const setDefault = (key, value) => {
  if (typeof process.env[key] !== "string" || process.env[key].trim() === "") process.env[key] = value;
};
setDefault("SECB_MCP_DEPLOYMENT_AUTHORIZED", "operator");
setDefault("SECB_MCP_REGISTRY_SEED", resolve(ROOT, "tests", "fixtures", "valid", "mcp-registry-seed.example.json"));
setDefault("SECB_MCP_INVOCATION_LEDGER", resolve(ROOT, ".secb", "ledgers", "invocation-ledger.jsonl"));
setDefault("SECB_MCP_EVENT_LEDGER", resolve(ROOT, ".secb", "ledgers", "event-ledger.jsonl"));
setDefault("SECB_MCP_EVIDENCE_LEDGER", resolve(ROOT, ".secb", "ledgers", "evidence-ledger.jsonl"));
setDefault("SECB_MCP_CALLER_INSTANCE", "inst_claude_alpha_ro");

const { server: core, callerInstanceId, config, rateLimiter } = prepareDeployment({ argv, env: process.env });

const clients = new Map();
const upstreamPolicy = new Map();

async function startUpstreams() {
  if (argv.includes("--no-upstreams")) {
    note("upstreams disabled by --no-upstreams; serving the core only.");
    return;
  }
  const registryPath = argValue("--registry") ?? process.env.SECB_MCP_UPSTREAMS ?? resolve(ROOT, ".secb", "mcp-upstreams.json");
  const host = argValue("--host") ?? detectHost();

  let registry;
  let projection;
  try {
    registry = loadUpstreamRegistry(registryPath);
    projection = resolveRegistry(registry, { host });
  } catch (error) {
    // A malformed registry must not silently degrade into "no upstreams": the
    // client would see a working hub that is quietly missing every tool.
    note(`FATAL: upstream registry unusable (${error.code ?? error.name}): ${error.message}`);
    process.exit(3);
  }

  const byId = new Map(projection.upstreams.map((u) => [u.id, u]));
  const declaredById = new Map(registry.upstreams.map((u) => [u.id, u]));
  for (const declared of registry.upstreams) {
    upstreamPolicy.set(declared.id, {
      classification_ceiling: declared.classification_ceiling,
      max_concurrency: declared.max_concurrency,
      max_response_bytes: declared.max_response_bytes,
      tools_allow: declared.tools_allow,
      tools_deny: declared.tools_deny
    });
  }

  note(`host=${host} registry=${projection.registry_id} total=${projection.total} reachable=${projection.reachable}`);

  const startable = [];
  for (const [id, plan] of byId) {
    if (!plan.reachable) {
      note(`skip ${id}: ${plan.reason}`);
      continue;
    }
    if (plan.transport !== "stdio") {
      note(`skip ${id}: ${plan.transport} upstreams are declared but not yet fronted`);
      continue;
    }
    startable.push([id, plan]);
  }

  // Concurrently, not one at a time. Startup is dominated by each upstream's own
  // package resolution and interpreter boot, which are independent; serialising
  // them made total time the SUM of eight such waits (18.2s measured warm, and
  // minutes cold). Work-package item U2.
  await Promise.all(
    startable.map(async ([id, plan]) => {
      // Registered before start() so a signal arriving mid-startup still finds
      // the child through the shutdown path — U5's orphan window.
      const client = new UpstreamClient({ plan, timeoutMs: declaredById.get(id)?.timeout_ms });
      clients.set(id, client);
      try {
        const info = await client.start();
        note(`up ${id} (${info.serverInfo?.name ?? "unknown"})`);
      } catch (error) {
        // One bad upstream degrades that upstream, never the hub.
        note(`down ${id}: ${error.code ?? error.name} ${error.message}`);
        clients.delete(id);
        await client.close();
      }
    })
  );
}

// Readiness is a deferred rather than the startup promise itself, because the
// proxy must exist before startup begins: startup is what populates `clients`,
// and the proxy holds that same Map by reference.
let markReady;
const ready = new Promise((resolveReady) => {
  markReady = resolveReady;
});

// Proxied calls land in the SAME durable invocation ledger as native calls.
// A separate (or absent) sink would mean the upstream traffic — the part that
// actually leaves the organism — were the only part not audited.
const proxy = new SecBMcpUpstreamProxy({
  core,
  clients,
  upstreamPolicy,
  invocationLog: createInvocationLedgerWriter(config.ledgerPath),
  classificationCeiling: config.classificationCeiling,
  // The same instance the core already holds, so one budget covers both paths.
  rateLimiter,
  ready
});

// Track in-flight work so shutdown can drain. stdin closing and a proxied call
// resolving are independent events: tearing down on close alone killed the
// upstream mid-request and the last answer came back DENY_UPSTREAM_CLOSED.
const inFlight = new Set();
const draining = {
  handle: (message, context) => {
    const answer = Promise.resolve(proxy.handle(message, context));
    inFlight.add(answer);
    // .finally() returns a DERIVED promise that re-rejects. serveStdio handles
    // `answer`, but nothing handled that derivative, so any rejection in the
    // proxy path became an unhandledRejection and killed the entire hub — every
    // upstream and the native tool surface with it. A deeply nested upstream
    // reply, or one malformed native call, was therefore a whole-hub kill
    // switch; the same input against the non-hub launcher exits cleanly.
    // .then(cb, cb) settles the tracking without creating an unhandled branch.
    answer.then(
      () => inFlight.delete(answer),
      () => inFlight.delete(answer)
    );
    return answer;
  }
};

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  // No further input can arrive once close has fired, so one drain pass is
  // enough to settle everything already accepted.
  await Promise.allSettled([...inFlight]);
  // close() escalates SIGTERM to SIGKILL, so an upstream that traps the polite
  // signal cannot hold the hub open by holding our pipes.
  await Promise.all([...clients.values()].map((client) => client.close()));
  process.exit(0);
};

// Installed BEFORE any child is spawned. They used to be registered only after
// startup finished, so a SIGINT during the startup window — 18.2s of it —
// terminated the hub with every child already spawned and none of them known to
// a handler, orphaning all of them. Work-package item U5.
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
// Last resort: 'exit' cannot await, so this is the synchronous SIGKILL sweep
// that stops an abnormal termination from leaving children behind.
process.on("exit", () => {
  for (const client of clients.values()) client.killNow();
});

// Serve BEFORE contacting any upstream. The handshake is the request with a
// client-side timeout, and it needs nothing from an upstream to answer.
const rl = serveStdio(draining, { callerInstanceId });
// Closed stdin means the MCP client is gone. Without this the spawned children
// keep the event loop alive and the hub lingers as an orphan holding every
// upstream open.
rl.on("close", shutdown);

// Startup now runs in the background; only the paths that need an upstream wait
// on `ready`. A failure here must still release the gate, or tools/list would
// hang forever instead of reporting a degraded hub.
startUpstreams()
  .then(() => proxy.refreshTools())
  .then((report) => {
    for (const row of report) {
      note(row.ok ? `tools ${row.id}: ${row.count}` : `tools ${row.id}: unavailable (${row.reason})`);
    }
  })
  .catch((error) => {
    note(`FATAL: upstream startup failed (${error.code ?? error.name}): ${error.message}`);
  })
  .finally(() => markReady());
