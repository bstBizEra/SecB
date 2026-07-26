import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PassThrough } from "node:stream";
import test from "node:test";

import { PINNED_PROTOCOL_VERSION } from "../src/mcp/tool-catalog.mjs";
import {
  DeploymentError,
  OPERATOR_AUTH_MESSAGE,
  composeServices,
  createInvocationLedgerWriter,
  loadRegistrySeed,
  prepareDeployment,
  seedRegistry,
  validateSeed
} from "../tools/secb-mcp-server-wiring.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLE_SEED_PATH = resolve(HERE, "fixtures", "valid", "mcp-registry-seed.example.json");
const EXAMPLE_SEED = JSON.parse(readFileSync(EXAMPLE_SEED_PATH, "utf8"));
const SEEDED_CALLER = EXAMPLE_SEED.registrations[0].registration.agent_instance_id;

function scratch() {
  return mkdtempSync(join(tmpdir(), "secb-mcp-deploy-"));
}

function baseEnv(dir, overrides = {}) {
  return {
    SECB_MCP_DEPLOYMENT_AUTHORIZED: "operator",
    SECB_MCP_REGISTRY_SEED: EXAMPLE_SEED_PATH,
    SECB_MCP_INVOCATION_LEDGER: join(dir, "invocation-ledger.jsonl"),
    SECB_MCP_EVENT_LEDGER: join(dir, "event-ledger.jsonl"),
    SECB_MCP_EVIDENCE_LEDGER: join(dir, "evidence-ledger.jsonl"),
    SECB_MCP_CALLER_INSTANCE: SEEDED_CALLER,
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Seed validation — fail-closed cases.
// ---------------------------------------------------------------------------

test("the example seed loads and normalizes", () => {
  const seed = loadRegistrySeed(EXAMPLE_SEED_PATH);
  assert.equal(seed.policyCeiling, "A0");
  assert.equal(seed.registrations.length, 1);
  assert.equal(seed.registrations[0].approve, true);
  assert.equal(seed.registrations[0].activate, true);
});

test("missing seed file denies (fail-closed)", () => {
  assert.throws(() => loadRegistrySeed(join(tmpdir(), "does-not-exist-secb-seed.json")), (error) => {
    assert.ok(error instanceof DeploymentError);
    assert.equal(error.code, "DENY_SEED_UNREADABLE");
    return true;
  });
});

test("malformed JSON seed denies", () => {
  const dir = scratch();
  const path = join(dir, "bad.json");
  writeFileSync(path, "{ not valid json");
  try {
    assert.throws(() => loadRegistrySeed(path), (error) => error.code === "DENY_SEED_MALFORMED");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("seed with wrong version denies", () => {
  assert.throws(() => validateSeed({ ...EXAMPLE_SEED, seed_version: "9" }), (error) => error.code === "DENY_SEED_VERSION");
});

test("seed with an empty registrations array denies", () => {
  assert.throws(() => validateSeed({ ...EXAMPLE_SEED, registrations: [] }), (error) => error.code === "DENY_SEED_EMPTY");
});

test("seed with a contract-invalid registration denies", () => {
  const broken = structuredClone(EXAMPLE_SEED);
  delete broken.registrations[0].registration.agent_instance_id;
  assert.throws(() => validateSeed(broken), (error) => error.code === "DENY_SEED_REGISTRATION_INVALID");
});

test("seed that activates without approving denies", () => {
  const broken = structuredClone(EXAMPLE_SEED);
  broken.registrations[0].approve = false;
  broken.registrations[0].activate = true;
  assert.throws(() => validateSeed(broken), (error) => error.code === "DENY_SEED_ENTRY_FLAGS");
});

test("a non-object seed denies", () => {
  assert.throws(() => validateSeed([]), (error) => error.code === "DENY_SEED_SHAPE");
});

test("seeded registry resolves the approved+active caller and quarantines others", () => {
  const registry = seedRegistry(loadRegistrySeed(EXAMPLE_SEED_PATH));
  const ok = registry.resolve(SEEDED_CALLER);
  assert.equal(ok.resolved, true);
  assert.equal(ok.identity.max_data_classification, "INTERNAL");
  assert.equal(registry.resolve("inst_unknown").resolved, false);
});

// ---------------------------------------------------------------------------
// Guard — refuse to serve without explicit operator authorization.
// ---------------------------------------------------------------------------

test("prepareDeployment refuses without the authorization env var (same message)", () => {
  const dir = scratch();
  try {
    const env = baseEnv(dir);
    delete env.SECB_MCP_DEPLOYMENT_AUTHORIZED;
    assert.throws(() => prepareDeployment({ env }), (error) => {
      assert.ok(error instanceof DeploymentError);
      assert.equal(error.code, "DENY_DEPLOYMENT_UNAUTHORIZED");
      assert.equal(error.message, OPERATOR_AUTH_MESSAGE);
      return true;
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("prepareDeployment refuses when the env var has the wrong value", () => {
  const dir = scratch();
  try {
    assert.throws(
      () => prepareDeployment({ env: baseEnv(dir, { SECB_MCP_DEPLOYMENT_AUTHORIZED: "true" }) }),
      (error) => error.code === "DENY_DEPLOYMENT_UNAUTHORIZED"
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("prepareDeployment refuses when authorized but the seed is invalid", () => {
  const dir = scratch();
  try {
    const badSeed = join(dir, "bad-seed.json");
    writeFileSync(badSeed, JSON.stringify({ seed_version: "1", registrations: [] }));
    assert.throws(
      () => prepareDeployment({ env: baseEnv(dir, { SECB_MCP_REGISTRY_SEED: badSeed }) }),
      (error) => error.code === "DENY_SEED_EMPTY"
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("prepareDeployment refuses when no caller instance is asserted", () => {
  const dir = scratch();
  try {
    const env = baseEnv(dir);
    delete env.SECB_MCP_CALLER_INSTANCE;
    assert.throws(() => prepareDeployment({ env }), (error) => error.code === "DENY_CALLER_UNBOUND");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Invocation ledger — append-only, fail-closed on write failure.
// ---------------------------------------------------------------------------

test("the invocation writer requires a path and denies an unwritable one", () => {
  assert.throws(() => createInvocationLedgerWriter(""), (error) => error.code === "DENY_LEDGER_PATH");
  const dir = scratch();
  try {
    // A ledger path whose parent is a regular file cannot be created/opened.
    const parentFile = join(dir, "not-a-dir");
    writeFileSync(parentFile, "x");
    const unwritable = join(parentFile, "ledger.jsonl");
    assert.throws(() => createInvocationLedgerWriter(unwritable), (error) => error.code === "DENY_LEDGER_UNWRITABLE");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Wired end-to-end stdio round-trip (in-process).
// ---------------------------------------------------------------------------

function roundTrip(server, callerInstanceId, requests) {
  return new Promise((resolvePromise, reject) => {
    const input = new PassThrough();
    const output = new PassThrough();
    const responses = [];
    let buffer = "";
    output.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) responses.push(JSON.parse(line));
      }
      if (responses.length >= requests.filter((r) => r.id !== undefined).length) resolvePromise(responses);
    });
    // serveDeployment path is exercised elsewhere; here we drive the composed
    // server directly through the same stdio transport.
    import("../src/mcp/jsonrpc-stdio.mjs")
      .then(({ serveStdio }) => {
        serveStdio(server, { callerInstanceId, input, output });
        for (const request of requests) input.write(`${JSON.stringify(request)}\n`);
      })
      .catch(reject);
  });
}

test("wired end-to-end: initialize + tools/list + a read tool call, audited", async () => {
  const dir = scratch();
  try {
    const { server, callerInstanceId } = prepareDeployment({ env: baseEnv(dir) });
    assert.equal(callerInstanceId, SEEDED_CALLER);

    const responses = await roundTrip(server, callerInstanceId, [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: PINNED_PROTOCOL_VERSION } },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "secb_ledger_verify_summary", arguments: { ledger: "event" } } }
    ]);

    const byId = new Map(responses.map((r) => [r.id, r]));
    assert.equal(byId.get(1).result.protocolVersion, PINNED_PROTOCOL_VERSION);
    assert.equal(byId.get(2).result.tools.length, 12);
    const call = byId.get(3).result;
    assert.equal(call.content_disposition, "data_untrusted");
    assert.equal(call.tool, "secb_ledger_verify_summary");
    // Empty durable event ledger verifies clean: valid chain, zero entries.
    assert.equal(call.data.verified, true);
    assert.equal(call.data.count, 0);

    // The invocation ledger recorded the tools/call (initialize/list are not
    // tool invocations and are not audited).
    const ledgerPath = baseEnv(dir).SECB_MCP_INVOCATION_LEDGER;
    const lines = readFileSync(ledgerPath, "utf8").trim().split(/\r?\n/).filter(Boolean);
    assert.ok(lines.length >= 1);
    const entry = JSON.parse(lines.at(-1));
    assert.equal(entry.type, "MCP_INVOCATION");
    assert.equal(entry.tool, "secb_ledger_verify_summary");
    assert.equal(entry.decision, "ALLOW");
    assert.equal(entry.caller, SEEDED_CALLER);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("wired end-to-end: an invocation-ledger write failure denies the call (fail-closed audit)", async () => {
  const dir = scratch();
  try {
    const registry = seedRegistry(loadRegistrySeed(EXAMPLE_SEED_PATH));
    const ledgerPath = join(dir, "audit.jsonl");
    const invocationLog = createInvocationLedgerWriter(ledgerPath);
    const server = composeServices({
      registry,
      invocationLog,
      eventLedgerPath: join(dir, "event.jsonl"),
      evidenceLedgerPath: join(dir, "evidence.jsonl")
    });

    // Preflight proved the path writable; now make the write fail at call time
    // by replacing the file with a directory of the same name (EISDIR).
    rmSync(ledgerPath, { force: true });
    mkdirSync(ledgerPath);

    const responses = await roundTrip(server, SEEDED_CALLER, [
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "secb_canonical_fingerprint", arguments: { document: { a: 1 } } } }
    ]);
    assert.equal(responses[0].error.data.code, "DENY_AUDIT_UNAVAILABLE");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
