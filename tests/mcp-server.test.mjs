// SecB MCP Server — alpha test suite
//
// Scope for this slice: the frozen tool catalog. Later slices will add
// tests for the transport layer, dispatch pipeline, invocation ledger,
// caller precondition, classification floor, reserved-delimiter guard,
// and hostile-fixture rendering.
//
// Doctrine tested here (from cortex-advisory-001):
//   - Deep-frozen catalog at every level.
//   - Byte-identity snapshot of the tools/list projection (rug-pull defense).
//   - Names + name pattern conformance.
//   - Schema shape conformance (additionalProperties: false; type: object).
//   - No model-directive language in descriptions.
//   - Import-surface scan: src/mcp files import no forbidden Node APIs.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

import { TOOL_BY_NAME, TOOL_CATALOG } from "../src/mcp/tool-catalog.mjs";

const MCP_SRC_DIR = resolve(import.meta.dirname, "..", "src", "mcp");

// -------------------------------------------------------------------------
// Catalog shape and immutability
// -------------------------------------------------------------------------

test("catalog contains exactly 9 tools", () => {
  assert.equal(TOOL_CATALOG.length, 9);
});

test("catalog and every nested value is deep-frozen", () => {
  function assertFrozen(node, path) {
    if (node === null || typeof node !== "object") return;
    assert.equal(
      Object.isFrozen(node),
      true,
      `not frozen at ${path}: ${JSON.stringify(node)}`,
    );
    for (const key of Object.keys(node)) {
      assertFrozen(node[key], `${path}.${key}`);
    }
  }
  assertFrozen(TOOL_CATALOG, "TOOL_CATALOG");
  assertFrozen(TOOL_BY_NAME, "TOOL_BY_NAME");
});

test("mutation attempts on the catalog throw in strict mode", () => {
  assert.throws(() => TOOL_CATALOG.push({ name: "hijack" }), TypeError);
  assert.throws(() => TOOL_CATALOG.pop(), TypeError);
  assert.throws(() => {
    "use strict";
    TOOL_CATALOG[0].name = "hijacked";
  }, TypeError);
  assert.throws(() => {
    "use strict";
    TOOL_CATALOG[0].inputSchema.required.push("x");
  }, TypeError);
});

// -------------------------------------------------------------------------
// Name and lookup conformance
// -------------------------------------------------------------------------

test("all tool names match /^secb_[a-z_]+$/", () => {
  for (const t of TOOL_CATALOG) {
    assert.match(t.name, /^secb_[a-z_]+$/, `bad tool name: ${t.name}`);
  }
});

test("all tool names are unique", () => {
  const names = TOOL_CATALOG.map((t) => t.name);
  assert.equal(new Set(names).size, names.length, "duplicate names in catalog");
});

test("TOOL_BY_NAME projection equals TOOL_CATALOG by identity", () => {
  assert.equal(Object.keys(TOOL_BY_NAME).length, TOOL_CATALOG.length);
  for (const t of TOOL_CATALOG) {
    assert.equal(
      TOOL_BY_NAME[t.name],
      t,
      `TOOL_BY_NAME[${t.name}] is not the same reference as TOOL_CATALOG entry`,
    );
  }
});

// -------------------------------------------------------------------------
// Schema shape
// -------------------------------------------------------------------------

test("all input schemas are type=object with additionalProperties=false", () => {
  for (const t of TOOL_CATALOG) {
    assert.equal(t.inputSchema.type, "object", `${t.name}: schema type`);
    assert.equal(
      t.inputSchema.additionalProperties,
      false,
      `${t.name}: additionalProperties must be false`,
    );
  }
});

test("all input schemas declare required as an array", () => {
  for (const t of TOOL_CATALOG) {
    assert.ok(
      Array.isArray(t.inputSchema.required),
      `${t.name}: required must be an array (possibly empty)`,
    );
  }
});

test("all schema properties reference the declared object", () => {
  for (const t of TOOL_CATALOG) {
    for (const key of t.inputSchema.required) {
      assert.ok(
        key in t.inputSchema.properties,
        `${t.name}: required key ${key} not in properties`,
      );
    }
  }
});

// -------------------------------------------------------------------------
// Description content
// -------------------------------------------------------------------------

test("all descriptions are non-empty strings", () => {
  for (const t of TOOL_CATALOG) {
    assert.equal(typeof t.description, "string", `${t.name}: description type`);
    assert.ok(
      t.description.length > 0,
      `${t.name}: empty description`,
    );
  }
});

test("descriptions contain no model-directive language", () => {
  // Descriptions state what the tool DOES; they must not direct the
  // consuming model. This is a defensive check against prompt-injection
  // via tool descriptions (rug-pull class attack).
  const forbidden = [
    /\bplease\b/i,
    /\byou must\b/i,
    /\byou should\b/i,
    /\bignore (previous|prior)\b/i,
    /\bsystem\b/i,
    /\bignore all\b/i,
    /\bact as\b/i,
    /\bpretend\b/i,
  ];
  for (const t of TOOL_CATALOG) {
    for (const pat of forbidden) {
      assert.equal(
        pat.test(t.description),
        false,
        `${t.name}: description contains directive pattern ${pat}`,
      );
    }
  }
});

// -------------------------------------------------------------------------
// Fingerprint snapshot (rug-pull defense)
// -------------------------------------------------------------------------

// This fingerprint is the SHA-256 of JSON.stringify() of the catalog
// projection {name, description, inputSchema}. It MUST remain stable
// until a governance re-registration cycle updates both this value AND
// the server's self-registration record.
//
// If this test fails, someone changed the catalog. The fix is one of:
//   (a) revert the catalog change (unauthorized);
//   (b) go through governance re-registration (authorized), which
//       includes updating this snapshot AND the server registration
//       record's methods=catalog fingerprint AND the tool-catalog
//       snapshot in the plan document.
const EXPECTED_CATALOG_FINGERPRINT =
  "aaf7e868ba9717f349b5907d7253b3b3a5cd89c5cbf97ab4f9f412f5732a02f5";

test("catalog fingerprint matches locked snapshot", () => {
  const projection = TOOL_CATALOG.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
  const json = JSON.stringify(projection);
  const actual = createHash("sha256").update(json).digest("hex");
  assert.equal(
    actual,
    EXPECTED_CATALOG_FINGERPRINT,
    `catalog fingerprint changed
      expected: ${EXPECTED_CATALOG_FINGERPRINT}
      actual:   ${actual}
      IF THIS IS AN AUTHORIZED CATALOG CHANGE, update EXPECTED_CATALOG_FINGERPRINT
      in this file AND re-register the server AND update the snapshot in the
      planning advisory.`,
  );
});

// -------------------------------------------------------------------------
// Import-surface scan
// -------------------------------------------------------------------------

test("src/mcp files import no forbidden Node APIs (no network, no child process)", () => {
  // The MCP server MUST have zero network surface. No node:http, node:https,
  // node:net, or child_process may be imported anywhere under src/mcp/.
  // This is the structural implementation of GOV-MCP-01 (option A stdio
  // transport, no listening endpoint by construction).
  const forbidden = [
    /\bfrom\s+["']node:http["']/,
    /\bfrom\s+["']node:https["']/,
    /\bfrom\s+["']node:net["']/,
    /\bfrom\s+["']node:child_process["']/,
    /\bfrom\s+["']http["']/,
    /\bfrom\s+["']https["']/,
    /\bfrom\s+["']net["']/,
    /\bfrom\s+["']child_process["']/,
    /\brequire\(\s*["']node:http["']\s*\)/,
    /\brequire\(\s*["']node:https["']\s*\)/,
    /\brequire\(\s*["']node:net["']\s*\)/,
    /\brequire\(\s*["']node:child_process["']\s*\)/,
  ];

  const files = readdirSync(MCP_SRC_DIR).filter((f) => f.endsWith(".mjs"));
  assert.ok(
    files.length > 0,
    "src/mcp must contain at least one .mjs file",
  );

  for (const file of files) {
    const content = readFileSync(join(MCP_SRC_DIR, file), "utf8");
    for (const pat of forbidden) {
      assert.equal(
        pat.test(content),
        false,
        `${file}: forbidden import pattern ${pat}`,
      );
    }
  }
});

test("src/mcp files declare no dynamic imports of forbidden modules", () => {
  // Dynamic `import()` of network modules would bypass the static scan.
  const forbidden = [
    /\bimport\s*\(\s*["']node:http["']/,
    /\bimport\s*\(\s*["']node:https["']/,
    /\bimport\s*\(\s*["']node:net["']/,
    /\bimport\s*\(\s*["']node:child_process["']/,
  ];
  const files = readdirSync(MCP_SRC_DIR).filter((f) => f.endsWith(".mjs"));
  for (const file of files) {
    const content = readFileSync(join(MCP_SRC_DIR, file), "utf8");
    for (const pat of forbidden) {
      assert.equal(
        pat.test(content),
        false,
        `${file}: forbidden dynamic import ${pat}`,
      );
    }
  }
});

// -------------------------------------------------------------------------
// Transport: JSON-RPC 2.0 stdio framing
// -------------------------------------------------------------------------

import {
  buildErrorResponse,
  buildResponse,
  createLineReader,
  createLineWriter,
  DEFAULT_MAX_MESSAGE_BYTES,
  ErrorCodes,
  isNotification,
  parseLine,
  PROTOCOL_VERSION,
  serializeMessage,
} from "../src/mcp/jsonrpc-stdio.mjs";

test("ErrorCodes are frozen and match JSON-RPC 2.0 spec", () => {
  assert.equal(Object.isFrozen(ErrorCodes), true);
  assert.equal(ErrorCodes.ParseError, -32700);
  assert.equal(ErrorCodes.InvalidRequest, -32600);
  assert.equal(ErrorCodes.MethodNotFound, -32601);
  assert.equal(ErrorCodes.InvalidParams, -32602);
  assert.equal(ErrorCodes.InternalError, -32603);
  // Implementation-defined server error range: -32000..-32099
  assert.ok(ErrorCodes.MessageTooLarge <= -32000);
  assert.ok(ErrorCodes.MessageTooLarge >= -32099);
});

test("parseLine: valid request round-trips", () => {
  const line = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {},
  });
  const result = parseLine(line);
  assert.ok("request" in result);
  assert.equal(result.request.method, "tools/list");
  assert.equal(result.request.id, 1);
});

test("parseLine: invalid JSON yields ParseError with null id", () => {
  const result = parseLine("{not valid json");
  assert.ok("errorResponse" in result);
  assert.equal(result.errorResponse.error.code, ErrorCodes.ParseError);
  assert.equal(result.errorResponse.id, null);
});

test("parseLine: missing jsonrpc yields InvalidRequest", () => {
  const line = JSON.stringify({ method: "tools/list", id: 1 });
  const result = parseLine(line);
  assert.ok("errorResponse" in result);
  assert.equal(result.errorResponse.error.code, ErrorCodes.InvalidRequest);
  // id preserved when parseable
  assert.equal(result.errorResponse.id, 1);
});

test("parseLine: wrong jsonrpc version yields InvalidRequest", () => {
  const line = JSON.stringify({ jsonrpc: "1.0", method: "tools/list", id: 1 });
  const result = parseLine(line);
  assert.ok("errorResponse" in result);
  assert.equal(result.errorResponse.error.code, ErrorCodes.InvalidRequest);
});

test("parseLine: missing method yields InvalidRequest", () => {
  const line = JSON.stringify({ jsonrpc: "2.0", id: 1 });
  const result = parseLine(line);
  assert.ok("errorResponse" in result);
  assert.equal(result.errorResponse.error.code, ErrorCodes.InvalidRequest);
});

test("parseLine: empty method yields InvalidRequest", () => {
  const line = JSON.stringify({ jsonrpc: "2.0", method: "", id: 1 });
  const result = parseLine(line);
  assert.ok("errorResponse" in result);
  assert.equal(result.errorResponse.error.code, ErrorCodes.InvalidRequest);
});

test("parseLine: batch requests rejected as InvalidRequest", () => {
  const line = JSON.stringify([{ jsonrpc: "2.0", method: "ping", id: 1 }]);
  const result = parseLine(line);
  assert.ok("errorResponse" in result);
  assert.equal(result.errorResponse.error.code, ErrorCodes.InvalidRequest);
});

test("parseLine: id may be string, number, or null", () => {
  for (const id of ["abc", 42, null]) {
    const line = JSON.stringify({ jsonrpc: "2.0", method: "ping", id });
    const result = parseLine(line);
    assert.ok("request" in result, `id=${JSON.stringify(id)} should be valid`);
    assert.equal(result.request.id, id);
  }
});

test("parseLine: id of wrong type (boolean) rejected", () => {
  const line = JSON.stringify({ jsonrpc: "2.0", method: "ping", id: true });
  const result = parseLine(line);
  assert.ok("errorResponse" in result);
  assert.equal(result.errorResponse.error.code, ErrorCodes.InvalidRequest);
});

test("parseLine: notification (no id) parses as request", () => {
  const line = JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
  const result = parseLine(line);
  assert.ok("request" in result);
  assert.equal(isNotification(result.request), true);
});

test("parseLine: message exceeding max size yields MessageTooLarge", () => {
  const big = "x".repeat(1000);
  const line = JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1, params: { data: big } });
  const result = parseLine(line, 100);
  assert.ok("errorResponse" in result);
  assert.equal(result.errorResponse.error.code, ErrorCodes.MessageTooLarge);
  assert.ok(result.errorResponse.error.data.observed_bytes > 100);
});

test("parseLine: throws TypeError for non-string input", () => {
  assert.throws(() => parseLine(null), TypeError);
  assert.throws(() => parseLine(42), TypeError);
  assert.throws(() => parseLine({}), TypeError);
});

test("parseLine: throws TypeError for invalid maxBytes", () => {
  assert.throws(() => parseLine("{}", 0), TypeError);
  assert.throws(() => parseLine("{}", -1), TypeError);
  assert.throws(() => parseLine("{}", "1024"), TypeError);
});

test("buildResponse: correct shape", () => {
  const r = buildResponse(1, { ok: true });
  assert.equal(r.jsonrpc, "2.0");
  assert.equal(r.id, 1);
  assert.deepEqual(r.result, { ok: true });
});

test("buildResponse: id defaults to null", () => {
  const r = buildResponse(undefined, {});
  assert.equal(r.id, null);
});

test("buildErrorResponse: with and without data", () => {
  const withData = buildErrorResponse(1, ErrorCodes.InternalError, "boom", { detail: "x" });
  assert.equal(withData.error.code, ErrorCodes.InternalError);
  assert.equal(withData.error.message, "boom");
  assert.deepEqual(withData.error.data, { detail: "x" });

  const noData = buildErrorResponse(1, ErrorCodes.InternalError, "boom");
  assert.equal("data" in noData.error, false);
});

test("serializeMessage: appends newline exactly once", () => {
  const s = serializeMessage({ jsonrpc: "2.0", id: 1, result: {} });
  assert.equal(s.endsWith("\n"), true);
  assert.equal(s.match(/\n/g).length, 1);
});

test("serializeMessage: throws for non-object", () => {
  assert.throws(() => serializeMessage("string"), TypeError);
  assert.throws(() => serializeMessage(null), TypeError);
  assert.throws(() => serializeMessage([1, 2]), TypeError);
});

test("createLineWriter: throws on invalid output stream", () => {
  assert.throws(() => createLineWriter(null), TypeError);
  assert.throws(() => createLineWriter({}), TypeError);
  assert.throws(() => createLineWriter({ write: "not a function" }), TypeError);
});

test("createLineWriter: writes serialized message to output.write", async () => {
  const captured = [];
  const fakeOutput = { write: (s) => captured.push(s) };
  const writer = createLineWriter(fakeOutput);
  writer.write(buildResponse(1, { ok: true }));
  writer.write(buildResponse(2, { ok: false }));
  assert.equal(captured.length, 2);
  for (const s of captured) {
    assert.equal(s.endsWith("\n"), true);
    JSON.parse(s.trim());
  }
});

test("createLineReader: yields parsed messages from a stream", async () => {
  // Simulate stdin with a PassThrough
  const { PassThrough } = await import("node:stream");
  const stream = new PassThrough();
  const reader = createLineReader(stream);
  const messages = [];
  const iterPromise = (async () => {
    for await (const m of reader) messages.push(m);
  })();
  stream.write(JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }) + "\n");
  stream.write(JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 2 }) + "\n");
  stream.write("not valid json\n");
  stream.end();
  await iterPromise;
  assert.equal(messages.length, 3);
  assert.ok("request" in messages[0]);
  assert.ok("request" in messages[1]);
  assert.ok("errorResponse" in messages[2]);
  assert.equal(messages[2].errorResponse.error.code, ErrorCodes.ParseError);
});

test("PROTOCOL_VERSION and DEFAULT_MAX_MESSAGE_BYTES are exposed", () => {
  assert.equal(PROTOCOL_VERSION, "2.0");
  assert.equal(typeof DEFAULT_MAX_MESSAGE_BYTES, "number");
  assert.ok(DEFAULT_MAX_MESSAGE_BYTES > 0);
});

// -------------------------------------------------------------------------
// Dispatch pipeline: McpServer
// -------------------------------------------------------------------------

import {
  McpServer,
  McpServerError,
  PINNED_PROTOCOL_VERSION,
} from "../src/mcp/secb-mcp-server.mjs";
import { RuntimeRegistry } from "../src/registry/runtime-registry.mjs";

const CALLER_ID = "inst_test_mcp_001";

function makeRegistry({ approved = true, active = true } = {}) {
  const registry = new RuntimeRegistry({ policyCeiling: "A5" });
  registry.register({
    provider_id: "test-provider",
    runtime_product_id: "test-product",
    runtime_deployment_id: "test-deployment-001",
    agent_profile_id: "test-profile",
    agent_instance_id: CALLER_ID,
    runtime_version: "1.0.0",
    deployment_location: "local",
    owner: "test-owner",
    permitted_roles: ["ENGIN"],
    authority_ceiling: "A0",
    approved_models: ["test-model"],
    approved_tools: ["read"],
    approved_mcp_methods: [],
    approved_skills: [],
    repository_scopes: ["secb"],
    environment_scopes: ["local"],
    max_data_classification: "INTERNAL",
    delegation_rights: [],
    evidence_obligations: [],
    workload_identity_ref: "wl_test_001",
    evaluation_status: "CANDIDATE",
    lifecycle_state: "PENDING",
  });
  if (approved) registry.transitionEvaluation(CALLER_ID, "APPROVED");
  if (active) registry.transitionLifecycle(CALLER_ID, "ACTIVE");
  return registry;
}

function makeFakeLedger() {
  const records = [];
  return {
    records,
    verify() {
      return { valid: true, ledgerId: "fake", count: records.length, headHash: "0".repeat(64) };
    },
    append(entry, { expectedSequence }) {
      if (records.length !== expectedSequence) {
        const err = new Error("sequence conflict");
        err.code = "DENY_SEQUENCE_CONFLICT";
        throw err;
      }
      records.push(JSON.parse(JSON.stringify(entry)));
      return { sequence: records.length, replayed: false };
    },
  };
}

function makeAlwaysBusyLedger() {
  return {
    verify() { return { count: 0 }; },
    append() {
      const err = new Error("ledger locked");
      err.code = "LEDGER_BUSY";
      throw err;
    },
  };
}

function makeServer(overrides = {}) {
  return new McpServer({
    registry: makeRegistry(),
    invocationLedger: makeFakeLedger(),
    callerInstanceId: CALLER_ID,
    sessionId: "test-sess-001",
    now: () => "2026-07-19T00:00:00.000Z",
    ...overrides,
  });
}

function makeRequest(method, params, id = 1) {
  return { jsonrpc: "2.0", id, method, params };
}

function makeNotification(method, params) {
  return { jsonrpc: "2.0", method, params };
}

// -- Construction --

test("McpServer: throws on missing registry", () => {
  assert.throws(
    () => new McpServer({ invocationLedger: makeFakeLedger(), callerInstanceId: CALLER_ID }),
    (e) => e instanceof McpServerError && e.code === "MISSING_REGISTRY"
  );
});

test("McpServer: throws on missing invocation ledger", () => {
  assert.throws(
    () => new McpServer({ registry: makeRegistry(), callerInstanceId: CALLER_ID }),
    (e) => e instanceof McpServerError && e.code === "MISSING_LEDGER"
  );
});

test("McpServer: throws on missing callerInstanceId", () => {
  assert.throws(
    () => new McpServer({ registry: makeRegistry(), invocationLedger: makeFakeLedger() }),
    (e) => e instanceof McpServerError && e.code === "MISSING_CALLER_ID"
  );
});

test("McpServer: throws on invalid serverCeiling", () => {
  assert.throws(
    () => makeServer({ serverCeiling: "TOP_SECRET" }),
    (e) => e instanceof McpServerError && e.code === "INVALID_CEILING"
  );
});

test("McpServer: constructs with valid required params", () => {
  assert.ok(makeServer() instanceof McpServer);
});

// -- Deny-by-default method routing --

test("McpServer: unknown method returns MethodNotFound", async () => {
  const server = makeServer();
  const resp = await server.handleRequest(makeRequest("unknown/method", {}));
  assert.equal(resp.error.code, ErrorCodes.MethodNotFound);
});

test("McpServer: resources/list returns MethodNotFound (not in alpha subset)", async () => {
  const server = makeServer();
  const resp = await server.handleRequest(makeRequest("resources/list", {}));
  assert.equal(resp.error.code, ErrorCodes.MethodNotFound);
});

// -- Notifications --

test("McpServer: notifications/initialized notification returns null", async () => {
  const server = makeServer();
  const result = await server.handleRequest(makeNotification("notifications/initialized", {}));
  assert.equal(result, null);
});

test("McpServer: any notification (no id) returns null", async () => {
  const server = makeServer();
  assert.equal(await server.handleRequest(makeNotification("unknown/notify", {})), null);
});

// -- ping --

test("McpServer: ping returns empty result", async () => {
  const server = makeServer();
  const resp = await server.handleRequest(makeRequest("ping", {}));
  assert.ok("result" in resp);
  assert.deepEqual(resp.result, {});
});

// -- initialize --

test("McpServer: initialize with pinned version succeeds", async () => {
  const server = makeServer();
  const resp = await server.handleRequest(
    makeRequest("initialize", { protocolVersion: PINNED_PROTOCOL_VERSION, capabilities: {} })
  );
  assert.ok("result" in resp);
  assert.equal(resp.result.protocolVersion, PINNED_PROTOCOL_VERSION);
  assert.ok("capabilities" in resp.result);
  assert.ok("serverInfo" in resp.result);
});

test("McpServer: initialize with wrong version returns DENY_PROTOCOL_VERSION", async () => {
  const server = makeServer();
  const resp = await server.handleRequest(
    makeRequest("initialize", { protocolVersion: "1999-01-01" })
  );
  assert.ok("error" in resp);
  assert.equal(resp.error.data.code, "DENY_PROTOCOL_VERSION");
  assert.equal(resp.error.data.supported, PINNED_PROTOCOL_VERSION);
  assert.equal(resp.error.data.requested, "1999-01-01");
});

test("McpServer: initialize with missing protocolVersion returns DENY_PROTOCOL_VERSION", async () => {
  const server = makeServer();
  const resp = await server.handleRequest(makeRequest("initialize", {}));
  assert.ok("error" in resp);
  assert.equal(resp.error.data.code, "DENY_PROTOCOL_VERSION");
  assert.equal(resp.error.data.requested, null);
});

// -- tools/list --

test("McpServer: tools/list returns all 9 catalog tools", async () => {
  const server = makeServer();
  const resp = await server.handleRequest(makeRequest("tools/list", {}));
  assert.ok("result" in resp);
  assert.equal(resp.result.tools.length, TOOL_CATALOG.length);
});

test("McpServer: tools/list projection matches frozen catalog names", async () => {
  const server = makeServer();
  const resp = await server.handleRequest(makeRequest("tools/list", {}));
  const names = resp.result.tools.map((t) => t.name);
  const catalogNames = TOOL_CATALOG.map((t) => t.name);
  assert.deepEqual(names, catalogNames);
});

// -- tools/call: DENY_UNKNOWN_TOOL --

test("McpServer tools/call: unknown tool name returns DENY_UNKNOWN_TOOL", async () => {
  const ledger = makeFakeLedger();
  const server = makeServer({ invocationLedger: ledger });
  const resp = await server.handleRequest(
    makeRequest("tools/call", { name: "secb_nonexistent_tool", arguments: {} })
  );
  assert.ok("error" in resp);
  assert.equal(resp.error.data.code, "DENY_UNKNOWN_TOOL");
  // Denial is ledgered.
  assert.equal(ledger.records.length, 1);
  assert.equal(ledger.records[0].decision_code ?? ledger.records[0].payload?.decision_code, "DENY_UNKNOWN_TOOL");
});

// -- tools/call: DENY_CALLER_QUARANTINED --

test("McpServer tools/call: unknown caller instance returns DENY_CALLER_QUARANTINED", async () => {
  const ledger = makeFakeLedger();
  const server = makeServer({
    invocationLedger: ledger,
    callerInstanceId: "inst_does_not_exist",
  });
  const resp = await server.handleRequest(
    makeRequest("tools/call", { name: "secb_canonical_fingerprint", arguments: { document: { x: 1 } } })
  );
  assert.ok("error" in resp);
  assert.equal(resp.error.data.code, "DENY_CALLER_QUARANTINED");
  assert.equal(ledger.records.length, 1);
  assert.equal(ledger.records[0].payload.decision_code, "DENY_CALLER_QUARANTINED");
});

test("McpServer tools/call: CANDIDATE (not APPROVED) caller returns DENY_CALLER_QUARANTINED", async () => {
  const server = makeServer({ registry: makeRegistry({ approved: false, active: false }) });
  const resp = await server.handleRequest(
    makeRequest("tools/call", { name: "secb_canonical_fingerprint", arguments: { document: {} } })
  );
  assert.ok("error" in resp);
  assert.equal(resp.error.data.code, "DENY_CALLER_QUARANTINED");
});

test("McpServer tools/call: APPROVED but not ACTIVE caller returns DENY_CALLER_QUARANTINED", async () => {
  const server = makeServer({ registry: makeRegistry({ approved: true, active: false }) });
  const resp = await server.handleRequest(
    makeRequest("tools/call", { name: "secb_canonical_fingerprint", arguments: { document: {} } })
  );
  assert.ok("error" in resp);
  assert.equal(resp.error.data.code, "DENY_CALLER_QUARANTINED");
});

// -- tools/call: DENY_INVALID_PARAMS --

test("McpServer tools/call: missing required param returns DENY_INVALID_PARAMS", async () => {
  const ledger = makeFakeLedger();
  const server = makeServer({ invocationLedger: ledger });
  // secb_canonical_fingerprint requires "document"
  const resp = await server.handleRequest(
    makeRequest("tools/call", { name: "secb_canonical_fingerprint", arguments: {} })
  );
  assert.ok("error" in resp);
  assert.equal(resp.error.data.code, "DENY_INVALID_PARAMS");
  assert.ok(Array.isArray(resp.error.data.errors));
  assert.equal(ledger.records.length, 1);
  assert.equal(ledger.records[0].payload.decision_code, "DENY_INVALID_PARAMS");
});

test("McpServer tools/call: empty string for NON_EMPTY_STRING param returns DENY_INVALID_PARAMS", async () => {
  const server = makeServer();
  // secb_registry_resolve requires agent_instance_id (non-empty string)
  const resp = await server.handleRequest(
    makeRequest("tools/call", { name: "secb_registry_resolve", arguments: { agent_instance_id: "" } })
  );
  assert.ok("error" in resp);
  assert.equal(resp.error.data.code, "DENY_INVALID_PARAMS");
});

// -- tools/call: DENY_RESERVED_DELIMITER (GOV-P011-08) --

test("McpServer tools/call: pipe | in project_id returns DENY_RESERVED_DELIMITER", async () => {
  const ledger = makeFakeLedger();
  const server = makeServer({ invocationLedger: ledger });
  const resp = await server.handleRequest(
    makeRequest("tools/call", {
      name: "secb_project_resolve_effective",
      arguments: { project_id: "proj|injected" },
    })
  );
  assert.ok("error" in resp);
  assert.equal(resp.error.data.code, "DENY_RESERVED_DELIMITER");
  assert.equal(resp.error.data.delimiter, "|");
  assert.equal(ledger.records.length, 1);
  assert.equal(ledger.records[0].payload.decision_code, "DENY_RESERVED_DELIMITER");
});

test("McpServer tools/call: at-sign @ in work_package_id returns DENY_RESERVED_DELIMITER", async () => {
  const server = makeServer();
  const resp = await server.handleRequest(
    makeRequest("tools/call", {
      name: "secb_work_package_resolve_effective",
      arguments: { project_id: "p1", work_package_id: "wp@injected" },
    })
  );
  assert.ok("error" in resp);
  assert.equal(resp.error.data.code, "DENY_RESERVED_DELIMITER");
  assert.equal(resp.error.data.delimiter, "@");
});

test("McpServer tools/call: pipe | in agent_instance_id returns DENY_RESERVED_DELIMITER", async () => {
  const server = makeServer();
  const resp = await server.handleRequest(
    makeRequest("tools/call", {
      name: "secb_registry_resolve",
      arguments: { agent_instance_id: "inst|injected" },
    })
  );
  assert.ok("error" in resp);
  assert.equal(resp.error.data.code, "DENY_RESERVED_DELIMITER");
});

// -- tools/call: DENY_SERVICE_UNAVAILABLE --

test("McpServer tools/call: no service handler returns DENY_SERVICE_UNAVAILABLE", async () => {
  const ledger = makeFakeLedger();
  const server = makeServer({ invocationLedger: ledger, services: {} });
  const resp = await server.handleRequest(
    makeRequest("tools/call", {
      name: "secb_canonical_fingerprint",
      arguments: { document: { a: 1 } },
    })
  );
  assert.ok("error" in resp);
  assert.equal(resp.error.data.code, "DENY_SERVICE_UNAVAILABLE");
  assert.equal(resp.error.data.result.content_disposition, "data_untrusted");
  assert.equal(ledger.records.length, 1);
  assert.equal(ledger.records[0].payload.decision_code, "DENY_SERVICE_UNAVAILABLE");
});

// -- tools/call: ALLOW with data_untrusted --

test("McpServer tools/call: successful invocation carries data_untrusted marker", async () => {
  const ledger = makeFakeLedger();
  const serviceResult = { fingerprint: "abcd1234", canonical: true };
  const services = {
    secb_canonical_fingerprint: async () => serviceResult,
  };
  const server = makeServer({ invocationLedger: ledger, services });
  const resp = await server.handleRequest(
    makeRequest("tools/call", {
      name: "secb_canonical_fingerprint",
      arguments: { document: { key: "value" } },
    })
  );
  assert.ok("result" in resp, "expected result, got: " + JSON.stringify(resp));
  assert.equal(resp.result.content.length, 1);
  assert.equal(resp.result.content[0].type, "text");
  const parsed = JSON.parse(resp.result.content[0].text);
  assert.equal(parsed.content_disposition, "data_untrusted");
  assert.equal(parsed.fingerprint, "abcd1234");
  // Allowed call is also ledgered.
  assert.equal(ledger.records.length, 1);
  assert.equal(ledger.records[0].payload.decision_code, "ALLOW");
});

// -- tools/call: service receives effectiveCeiling --

test("McpServer tools/call: service handler receives effectiveCeiling = min(server, caller)", async () => {
  let capturedCtx;
  const services = {
    secb_canonical_fingerprint: async (_params, ctx) => {
      capturedCtx = ctx;
      return { fingerprint: "x" };
    },
  };
  // Server ceiling INTERNAL, caller max_data_classification INTERNAL → min = INTERNAL
  const server = makeServer({ services, serverCeiling: "INTERNAL" });
  await server.handleRequest(
    makeRequest("tools/call", {
      name: "secb_canonical_fingerprint",
      arguments: { document: {} },
    })
  );
  assert.equal(capturedCtx.effectiveCeiling, "INTERNAL");
});

// -- tools/call: session-scoped idempotent replay --

test("McpServer tools/call: identical request twice returns replayed:true on second", async () => {
  let callCount = 0;
  const services = {
    secb_canonical_fingerprint: async () => {
      callCount++;
      return { fingerprint: "fp1" };
    },
  };
  const server = makeServer({ services });
  const req = makeRequest("tools/call", {
    name: "secb_canonical_fingerprint",
    arguments: { document: { x: 1 } },
  });
  const first = await server.handleRequest(req);
  const second = await server.handleRequest({ ...req });
  assert.ok(!("replayed" in first) || first.replayed !== true, "first should not be replayed");
  assert.equal(second.replayed, true, "second should be replayed");
  assert.equal(callCount, 1, "service should be invoked exactly once");
});

// -- tools/call: all denials are ledgered --

test("McpServer tools/call: DENY_RESERVED_DELIMITER is ledgered", async () => {
  const ledger = makeFakeLedger();
  const server = makeServer({ invocationLedger: ledger });
  await server.handleRequest(
    makeRequest("tools/call", {
      name: "secb_project_resolve_effective",
      arguments: { project_id: "p|bad" },
    })
  );
  assert.equal(ledger.records.length, 1);
  assert.equal(ledger.records[0].payload.decision_code, "DENY_RESERVED_DELIMITER");
});

test("McpServer tools/call: DENY_INVALID_PARAMS is ledgered", async () => {
  const ledger = makeFakeLedger();
  const server = makeServer({ invocationLedger: ledger });
  await server.handleRequest(
    makeRequest("tools/call", {
      name: "secb_contract_validate",
      arguments: {},  // missing required "kind" and "document"
    })
  );
  assert.equal(ledger.records.length, 1);
  assert.equal(ledger.records[0].payload.decision_code, "DENY_INVALID_PARAMS");
});

// -- DENY_AUDIT_UNAVAILABLE (GOV-MCP-06: fail-closed) --

test("McpServer tools/call: always-busy invocation ledger returns DENY_AUDIT_UNAVAILABLE", async () => {
  const server = makeServer({ invocationLedger: makeAlwaysBusyLedger() });
  const resp = await server.handleRequest(
    makeRequest("tools/call", {
      name: "secb_canonical_fingerprint",
      arguments: { document: { a: 1 } },
    })
  );
  assert.ok("error" in resp);
  assert.equal(resp.error.data.code, "DENY_AUDIT_UNAVAILABLE");
});

test("McpServer tools/call: DENY_AUDIT_UNAVAILABLE supersedes DENY_UNKNOWN_TOOL", async () => {
  const server = makeServer({ invocationLedger: makeAlwaysBusyLedger() });
  const resp = await server.handleRequest(
    makeRequest("tools/call", { name: "nonexistent_tool", arguments: {} })
  );
  assert.ok("error" in resp);
  // The audit unavailable error takes precedence over the tool-not-found error.
  assert.equal(resp.error.data.code, "DENY_AUDIT_UNAVAILABLE");
});

// -- Ledger contains tool, fingerprint, decision_code, and ceiling --

test("McpServer tools/call: invocation record contains required audit fields", async () => {
  const ledger = makeFakeLedger();
  const server = makeServer({ invocationLedger: ledger });
  await server.handleRequest(
    makeRequest("tools/call", {
      name: "secb_canonical_fingerprint",
      arguments: { document: { x: 1 } },
    })
  );
  const record = ledger.records[0];
  const p = record.payload;
  assert.equal(p.tool, "secb_canonical_fingerprint");
  assert.equal(typeof p.fingerprint, "string");
  assert.equal(p.decision_code, "DENY_SERVICE_UNAVAILABLE");
  assert.equal(typeof p.effective_ceiling, "string");
  assert.equal(typeof p.duration_ms, "number");
  assert.equal(p.caller_assertion, CALLER_ID);
});
