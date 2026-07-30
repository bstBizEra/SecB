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

const { server: core, callerInstanceId, config } = prepareDeployment({ argv, env: process.env });

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
      max_response_bytes: declared.max_response_bytes
    });
  }

  note(`host=${host} registry=${projection.registry_id} total=${projection.total} reachable=${projection.reachable}`);

  for (const [id, plan] of byId) {
    if (!plan.reachable) {
      note(`skip ${id}: ${plan.reason}`);
      continue;
    }
    if (plan.transport !== "stdio") {
      note(`skip ${id}: ${plan.transport} upstreams are declared but not yet fronted`);
      continue;
    }
    const client = new UpstreamClient({ plan, timeoutMs: declaredById.get(id)?.timeout_ms });
    try {
      const info = await client.start();
      clients.set(id, client);
      note(`up ${id} (${info.serverInfo?.name ?? "unknown"})`);
    } catch (error) {
      // One bad upstream degrades that upstream, never the hub.
      note(`down ${id}: ${error.code ?? error.name} ${error.message}`);
      await client.close();
    }
  }
}

await startUpstreams();

// Proxied calls land in the SAME durable invocation ledger as native calls.
// A separate (or absent) sink would mean the upstream traffic — the part that
// actually leaves the organism — were the only part not audited.
const proxy = new SecBMcpUpstreamProxy({
  core,
  clients,
  upstreamPolicy,
  invocationLog: createInvocationLedgerWriter(config.ledgerPath),
  classificationCeiling: config.classificationCeiling
});

const report = await proxy.refreshTools();
for (const row of report) {
  note(row.ok ? `tools ${row.id}: ${row.count}` : `tools ${row.id}: unavailable (${row.reason})`);
}

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

const rl = serveStdio(draining, { callerInstanceId });

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  // No further input can arrive once close has fired, so one drain pass is
  // enough to settle everything already accepted.
  await Promise.allSettled([...inFlight]);
  await Promise.all([...clients.values()].map((client) => client.close()));
  process.exit(0);
};

// Closed stdin means the MCP client is gone. Without this the spawned children
// keep the event loop alive and the hub lingers as an orphan holding every
// upstream open.
rl.on("close", shutdown);
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
