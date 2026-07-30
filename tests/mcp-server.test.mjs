import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { MUTATING_TOOLS, PINNED_PROTOCOL_VERSION, TOOL_CATALOG } from "../src/mcp/tool-catalog.mjs";
import { SecBMcpServer } from "../src/mcp/secb-mcp-server.mjs";

const CALLER = "inst_ok";

function registryStub() {
  return {
    resolve(id) {
      if (id === CALLER) {
        return { resolved: true, quarantined: false, identity: { agent_instance_id: CALLER, max_data_classification: "INTERNAL", permitted_roles: ["ENGIN"] } };
      }
      if (id === "inst_candidate") return { resolved: false, quarantined: true, reason: "Evaluation status is CANDIDATE, not APPROVED" };
      return { resolved: false, quarantined: true, reason: "Unknown agent instance" };
    }
  };
}

function eventLedgerStub(classification = "RESTRICTED") {
  return {
    verify: () => ({ valid: true, headHash: "h".repeat(64), count: 1 }),
    read: () => [{
      sequence: 1,
      entry: { entryId: "evt1", type: "host.observed", actorId: "a", sessionId: "s", timestamp: "2026-07-18T10:00:00Z", payload: { classification, content_hash: "c".repeat(64), observed_fact: { secret: "TOP" } } }
    }]
  };
}

function harness({ log } = {}) {
  const calls = [];
  const invocationLog = log ?? ((entry) => { calls.push(entry); });
  const server = new SecBMcpServer({
    services: {
      registry: registryStub(),
      workPackage: { resolveEffective: (p, w) => ({ effective: { project_id: p, work_package_id: w }, code: "ALLOW", version: 1 }) },
      eventLedger: eventLedgerStub(),
      evidenceLedger: eventLedgerStub("INTERNAL"),
      skillResolver: { resolveSkill: () => ({ code: "ALLOW" }) }
    },
    invocationLog,
    now: () => new Date("2026-07-19T00:00:00Z")
  });
  const call = (name, args, caller = CALLER) => server.handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, { callerInstanceId: caller });
  return { server, calls, call };
}

// Spec (Lifecycle / version negotiation): a server MUST echo a version it
// supports, and MUST otherwise answer with one it DOES support so the client can
// decide. This previously asserted the opposite — that an unsupported version is
// refused — which made the server unreachable from any client newer than the
// pinned revision and would have re-broken at every future spec revision.
test("initialize echoes a supported protocol version", () => {
  const { server } = harness();
  const init = (protocolVersion) => server.handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion } });
  assert.equal(init(PINNED_PROTOCOL_VERSION).result.protocolVersion, PINNED_PROTOCOL_VERSION);
  assert.equal(init("2024-11-05").result.protocolVersion, "2024-11-05");
});

test("initialize downgrades an unsupported version instead of refusing it", () => {
  const { server } = harness();
  for (const newer of ["2025-11-25", "2026-07-28", "1999-01-01"]) {
    const response = server.handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: newer } });
    assert.equal(response.error, undefined, `${newer} must not be refused`);
    assert.equal(response.result.protocolVersion, PINNED_PROTOCOL_VERSION);
  }
});

test("initialize still refuses a missing or malformed protocolVersion", () => {
  const { server } = harness();
  for (const params of [{}, { protocolVersion: "" }, { protocolVersion: "   " }, { protocolVersion: 20250618 }, { protocolVersion: null }]) {
    const response = server.handle({ jsonrpc: "2.0", id: 1, method: "initialize", params });
    assert.equal(response.error.data.code, "DENY_PROTOCOL_VERSION", `${JSON.stringify(params)} must be refused`);
  }
  // The advertised list must not repeat the pinned version.
  const message = server.handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }).error.message;
  const listed = message.slice(message.indexOf("supports ") + 9).split(", ");
  assert.equal(new Set(listed).size, listed.length, `duplicate version advertised: ${message}`);
});

test("advertised tools carry a spec-required inputSchema derived from the catalog", () => {
  const { server } = harness();
  const { tools } = server.handle({ jsonrpc: "2.0", id: 1, method: "tools/list" }).result;
  // The official client SDK's Tool schema makes inputSchema REQUIRED and rejects
  // the whole listing without it, so an omitted schema hid every tool.
  for (const tool of tools) {
    assert.equal(tool.inputSchema?.type, "object", `${tool.name} has no object inputSchema`);
    assert.equal(typeof tool.inputSchema.properties, "object");
  }
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
  const wp = byName.secb_work_package_resolve_effective.inputSchema;
  assert.deepEqual(wp.required, ["project_id", "work_package_id"]);
  // id params are type-checked as strings at dispatch, so they are typed here.
  assert.deepEqual(wp.properties.project_id, { type: "string" });
  // a declared-but-untyped param stays unconstrained rather than guessed
  assert.deepEqual(wp.properties.baseline, {});
  // a no-argument tool still gets a valid empty object schema, not a missing one
  assert.deepEqual(byName.secb_events_read.inputSchema, { type: "object", properties: {} });
});

test("a tool result carries a spec content block without losing the governance envelope", () => {
  const { call } = harness();
  const result = call("secb_canonical_fingerprint", { document: { a: 1 } }).result;
  // Spec shape: the client reads content; a missing content array is defaulted to
  // [] by the SDK, so the payload was silently invisible rather than erroring.
  assert.equal(Array.isArray(result.content), true);
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, "text");
  assert.deepEqual(JSON.parse(result.content[0].text), result.data);
  assert.deepEqual(result.structuredContent, result.data);
  // Retained: the untrusted-data marker is a governance control, and `data` keeps
  // the payload at a stable path for existing callers.
  assert.equal(result.content_disposition, "data_untrusted");
  assert.equal(typeof result.data.content_hash, "string");
});

test("notifications are never answered, whatever their method", () => {
  const { server } = harness();
  // No id means notification. Enumerating only notifications/initialized meant
  // every other notification got an id-less response, which real clients report
  // as "response for an unknown message ID".
  for (const method of ["notifications/initialized", "notifications/cancelled", "notifications/roots/list_changed", "notifications/anything"]) {
    assert.equal(server.handle({ jsonrpc: "2.0", method }), null, `${method} must not be answered`);
  }
  // A request with an id is still answered normally.
  assert.equal(server.handle({ jsonrpc: "2.0", id: 7, method: "ping" }).id, 7);
});

test("deny-by-default methods and malformed requests", () => {
  const { server } = harness();
  assert.equal(server.handle({ jsonrpc: "2.0", id: 1, method: "resources/list" }).error.code, -32601);
  assert.equal(server.handle({ jsonrpc: "1.0", id: 1, method: "ping" }).error.code, -32600);
  assert.equal(server.handle({ jsonrpc: "2.0", id: 1, method: "ping" }).result !== undefined, true);
  assert.equal(server.handle({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
});

test("tools/list projects the frozen catalog (36 read-only tools)", () => {
  const { server } = harness();
  const tools = server.handle({ jsonrpc: "2.0", id: 1, method: "tools/list" }).result.tools;
  assert.equal(tools.length, 36);
  assert.ok(tools.every((t) => typeof t.description === "string"));
  assert.throws(() => { TOOL_CATALOG.push({}); }, TypeError);
});

test("caller resolution: unresolved and quarantined callers are denied and ledgered", () => {
  const { call, calls } = harness();
  assert.equal(call("secb_canonical_fingerprint", { document: {} }, "").error.data.code, "DENY_UNRESOLVED_CALLER");
  assert.equal(call("secb_canonical_fingerprint", { document: {} }, "inst_candidate").error.data.code, "DENY_UNRESOLVED_CALLER");
  assert.ok(calls.every((c) => c.type === "MCP_INVOCATION"));
  assert.equal(calls.filter((c) => c.decision === "DENY_UNRESOLVED_CALLER").length, 2);
});

test("unknown tool, missing params, and reserved delimiters deny (all ledgered)", () => {
  const { call, calls } = harness();
  assert.equal(call("secb_ghost", {}).error.data.code, "DENY_UNKNOWN_TOOL");
  assert.equal(call("secb_work_package_resolve_effective", { project_id: "p" }).error.data.code, "DENY_INVALID_PARAMS");
  assert.equal(call("secb_work_package_resolve_effective", { project_id: "p|x", work_package_id: "w" }).error.data.code, "DENY_RESERVED_DELIMITER");
  assert.equal(call("secb_registry_resolve", { agent_instance_id: "a@b" }).error.data.code, "DENY_RESERVED_DELIMITER");
  assert.ok(calls.length >= 4);
});

test("an optional id param may be omitted, but a present one is still screened", () => {
  const { call } = harness();
  // Omitted: the catalog declares host optional, so this must dispatch.
  assert.ok(call("secb_mcp_upstream_resolve", {}).result);
  // Present but not a string, and present with a reserved delimiter: still denied.
  assert.equal(call("secb_mcp_upstream_resolve", { host: 7 }).error.data.code, "DENY_INVALID_PARAMS");
  assert.equal(call("secb_mcp_upstream_resolve", { host: "wsl|x" }).error.data.code, "DENY_RESERVED_DELIMITER");
  // A required id param is still mandatory.
  assert.equal(call("secb_registry_resolve", {}).error.data.code, "DENY_INVALID_PARAMS");
});

test("happy path returns a data_untrusted-marked projection", () => {
  const { call } = harness();
  const r = call("secb_work_package_resolve_effective", { project_id: "prj", work_package_id: "wp" }).result;
  assert.equal(r.content_disposition, "data_untrusted");
  assert.equal(r.tool, "secb_work_package_resolve_effective");
  assert.equal(r.data.code, "ALLOW");
});

test("classification floor: RESTRICTED event payload withheld at an INTERNAL caller ceiling", () => {
  const { call } = harness();
  const events = call("secb_events_read", {}).result.data;
  assert.equal(events[0].payloadRendered, false);
  assert.equal(events[0].withheldReason, "ABOVE_CEILING");
  assert.ok(!JSON.stringify(events).includes("TOP"));
});

test("audit fail-closed: an unauditable call is denied and the result withheld", () => {
  const { call } = harness({ log: () => { throw new Error("ledger busy"); } });
  const r = call("secb_work_package_resolve_effective", { project_id: "prj", work_package_id: "wp" });
  assert.equal(r.error.data.code, "DENY_AUDIT_UNAVAILABLE");
});

test("registry_resolve never leaks another instance's full identity", () => {
  const { call } = harness();
  const r = call("secb_registry_resolve", { agent_instance_id: CALLER }).result.data;
  assert.equal(r.resolved, true);
  assert.equal(r.agent_instance_id, CALLER);
  assert.equal(r.permitted_roles, undefined); // full identity not exposed
});

test("constructor requires registry and a fail-closed invocation log", () => {
  assert.throws(() => new SecBMcpServer({ services: {}, invocationLog: () => {} }));
  assert.throws(() => new SecBMcpServer({ services: { registry: { resolve: () => {} } } }));
});

test("secb_graph_build is strictly pure read-only with zero disk side-effects (GOV-MCP-03)", () => {
  const { call } = harness();

  // This test previously asserted ONLY the returned node counts, so it passed
  // green for the entire period during which the tool rewrote
  // dashboard/public/graph-data.json on every call. A read-only claim has to be
  // checked against the filesystem, not against the payload.
  const repoRoot = resolve(import.meta.dirname, "..");
  const watched = [
    resolve(repoRoot, "dashboard", "public", "graph-data.json"),
    resolve(repoRoot, "dashboard", "public", "graphify-out", "graph.html")
  ];
  const digest = (file) => (existsSync(file) ? createHash("sha256").update(readFileSync(file)).digest("hex") : "ABSENT");
  const before = watched.map(digest);

  const r = call("secb_graph_build", {}).result;

  const after = watched.map(digest);
  for (const [index, file] of watched.entries()) {
    assert.equal(after[index], before[index], `GOV-MCP-03 violated: ${file} changed during secb_graph_build`);
  }

  assert.equal(r.content_disposition, "data_untrusted");
  assert.equal(r.tool, "secb_graph_build");
  assert.ok(r.data.total_nodes > 0, "Returns graph nodes");
  assert.equal(r.data.quality_rating, "100%");
});

test("an inherited property name is an unknown tool, denied and ledgered", () => {
  const { call, calls } = harness();
  // CATALOG_BY_NAME was a plain object, so "__proto__" and "constructor"
  // resolved to something truthy off Object.prototype: the !tool guard was
  // skipped, dispatch threw, the client got -32603 carrying internal
  // implementation text, and the throw escaped before the audit — leaving no
  // ledger row for a call that was never recorded as denied.
  for (const name of ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf"]) {
    const before = calls.length;
    const response = call(name, {});
    assert.equal(response.error.code, -32602, `${name} must be a protocol error`);
    assert.equal(response.error.data.code, "DENY_UNKNOWN_TOOL", `${name} must deny as unknown tool`);
    assert.equal(calls.length, before + 1, `${name} must be ledgered exactly once`);
    assert.equal(/is not iterable|Internal error/.test(response.error.message), false, "must not leak internals");
  }
});

test("every advertised tool carries honest annotations", () => {
  const { server } = harness();
  const { tools } = server.handle({ jsonrpc: "2.0", id: 1, method: "tools/list" }).result;
  for (const tool of tools) {
    assert.equal(typeof tool.annotations, "object", `${tool.name} has no annotations`);
    // Omitting annotations means destructiveHint/openWorldHint default to TRUE,
    // so every read-only tool was previously advertised as destructive.
    assert.equal(tool.annotations.openWorldHint, false, `${tool.name}: native tools contact no external entity`);
    assert.equal(tool.annotations.readOnlyHint, !MUTATING_TOOLS.has(tool.name), `${tool.name}: readOnlyHint disagrees with MUTATING_TOOLS`);
  }
  const mutating = tools.filter((t) => !t.annotations.readOnlyHint).map((t) => t.name);
  assert.deepEqual(mutating, ["secb_project_register_draft"]);
});

test("a readOnlyHint claim is backed by the filesystem, not by intent", () => {
  // Mechanised guard for the annotation above. Any tool callable with no
  // arguments and advertised read-only must leave the tree untouched. This is
  // what stops a newly added mutating tool from silently inheriting the claim —
  // the GOV-MCP-03 failure was exactly a read-only claim nothing ever checked.
  const { call } = harness();
  const repoRoot = resolve(import.meta.dirname, "..");
  const watched = [resolve(repoRoot, "dashboard", "public"), resolve(repoRoot, ".secb")];
  const snapshot = () =>
    watched
      .flatMap((dir) => (existsSync(dir) ? readdirSync(dir, { recursive: true, withFileTypes: true }) : []))
      .filter((e) => e.isFile())
      .map((e) => {
        const file = resolve(e.parentPath ?? e.path, e.name);
        try {
          return `${file}:${statSync(file).size}:${statSync(file).mtimeMs}`;
        } catch {
          return `${file}:gone`;
        }
      })
      .sort()
      .join("\n");

  const zeroArg = TOOL_CATALOG.filter((t) => t.required.length === 0).map((t) => t.name);
  assert.ok(zeroArg.length >= 10, "expected a meaningful sample of zero-argument tools");

  for (const name of zeroArg) {
    if (MUTATING_TOOLS.has(name)) continue;
    const before = snapshot();
    call(name, {});
    assert.equal(snapshot(), before, `${name} is advertised readOnlyHint:true but changed the filesystem`);
  }
});
