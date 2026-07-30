/**
 * MCP revision 2026-07-28 — dual-era behaviour. Work-package items C1 and C2.
 *
 * Specification text these tests hold the server to is recorded in
 * docs/03-project-control/candidates/mcp-spec-2026-07-28-research.md, retrieved
 * from modelcontextprotocol.io on 2026-07-30.
 *
 * The defect that motivated this is subtle enough to be worth naming: SecB used
 * to serve a request declaring 2026-07-28 under 2025-06-18 semantics, with no
 * error. The client believed one version, the server another, and neither
 * learned otherwise. A silent mismatch is worse than a clean failure, so most
 * of what is asserted here is that the two eras stay distinguishable.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  MODERN_PROTOCOL_VERSION,
  PROTOCOL_VERSION_META_KEY,
  SERVER_INFO_META_KEY,
  SecBMcpServer,
  declaredProtocolVersion,
  toolListCacheScope
} from "../src/mcp/secb-mcp-server.mjs";
import { PINNED_PROTOCOL_VERSION } from "../src/mcp/tool-catalog.mjs";

const registryStub = {
  resolve: (id) =>
    id === "inst_ok"
      ? { resolved: true, identity: { agent_instance_id: "inst_ok", max_data_classification: "INTERNAL" } }
      : { resolved: false, reason: "Unknown agent instance" }
};

const server = (calls = []) =>
  new SecBMcpServer({
    services: {
      registry: registryStub,
      workPackage: { resolveEffective: () => ({ ok: true }) },
      eventLedger: { verify: () => ({ valid: true, headHash: "h", count: 0 }), read: () => [] },
      evidenceLedger: { verify: () => ({ valid: true, headHash: "h", count: 0 }), read: () => [] },
      skillResolver: { resolveSkill: () => ({ ok: true }) }
    },
    invocationLog: (entry) => calls.push(entry),
    classificationCeiling: "INTERNAL"
  });

const modern = (method, params = {}) => ({
  jsonrpc: "2.0",
  id: 1,
  method,
  params: { ...params, _meta: { [PROTOCOL_VERSION_META_KEY]: MODERN_PROTOCOL_VERSION, ...(params._meta ?? {}) } }
});

const legacy = (method, params) => ({ jsonrpc: "2.0", id: 1, method, ...(params ? { params } : {}) });

// --- version declaration ---------------------------------------------------

test("a declared version is read from _meta; its absence is not an error", () => {
  assert.equal(declaredProtocolVersion({ _meta: { [PROTOCOL_VERSION_META_KEY]: "2026-07-28" } }), "2026-07-28");
  assert.equal(declaredProtocolVersion({}), null, "absence means legacy, not malformed");
  assert.equal(declaredProtocolVersion(undefined), null);
  assert.equal(declaredProtocolVersion({ _meta: { [PROTOCOL_VERSION_META_KEY]: "  " } }), null, "blank is not a declaration");
});

// --- server/discover -------------------------------------------------------

test("server/discover returns the shape the spec defines", () => {
  const res = server().handle(modern("server/discover"));
  const r = res.result;
  assert.equal(r.resultType, "complete");
  assert.deepEqual(r.supportedVersions, [MODERN_PROTOCOL_VERSION]);
  assert.deepEqual(r.capabilities, { tools: {} }, "only what this server actually serves is advertised");
  assert.equal(r._meta[SERVER_INFO_META_KEY].name, "secb-mcp-server");
  assert.ok(Number.isInteger(r.ttlMs) && r.ttlMs >= 0, "ttlMs MUST be >= 0");
  assert.ok(["public", "private"].includes(r.cacheScope));
});

test("server/discover is answered without a declared version, because it is the probe", () => {
  // A dual-era client sends this to find out what the server speaks. Requiring
  // the answer in order to ask the question would defeat it.
  const res = server().handle(legacy("server/discover"));
  assert.equal(res.result.resultType, "complete");
});

// --- version negotiation ---------------------------------------------------

test("an unsupported declared version is refused with -32022 and a retry list", () => {
  const res = server().handle({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: { _meta: { [PROTOCOL_VERSION_META_KEY]: "1900-01-01" } }
  });
  assert.equal(res.error.code, -32022);
  assert.equal(res.error.message, "Unsupported protocol version");
  assert.deepEqual(res.error.data.supported, [MODERN_PROTOCOL_VERSION]);
  assert.equal(res.error.data.requested, "1900-01-01");
});

test("a legacy version declared in modern metadata is refused, not silently served", () => {
  // This is the exact silent mismatch the change exists to close.
  const res = server().handle({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: { _meta: { [PROTOCOL_VERSION_META_KEY]: PINNED_PROTOCOL_VERSION } }
  });
  assert.equal(res.error.code, -32022, "a handshake-era version is not a modern-era version");
});

test("initialize carrying modern metadata is a contradiction and is refused", () => {
  const res = server().handle(modern("initialize", { protocolVersion: PINNED_PROTOCOL_VERSION }));
  assert.equal(res.error.code, -32022);
});

// --- modern results carry caching hints (C2) -------------------------------

test("a modern tools/list carries resultType and the caching hints", () => {
  const r = server().handle(modern("tools/list")).result;
  assert.equal(r.resultType, "complete");
  assert.ok(Array.isArray(r.tools) && r.tools.length > 0);
  assert.ok(Number.isInteger(r.ttlMs) && r.ttlMs >= 0);
  assert.equal(r.cacheScope, "public");
});

test("cacheScope is derived from whether the listing varies by caller", () => {
  // "public" is truthful only while every caller sees the same listing. The
  // spec says a public response MAY be shared between callers even from an
  // authenticated endpoint, so if U3's filtering ever becomes per-caller this
  // must flip, or the cache leaks which tools others can see.
  assert.equal(toolListCacheScope({ variesByCaller: false }), "public");
  assert.equal(toolListCacheScope({ variesByCaller: true }), "private");
});

test("two callers currently receive an identical listing, which is what makes public honest", () => {
  const a = server().handle(modern("tools/list"), { callerInstanceId: "inst_ok" }).result;
  const b = server().handle(modern("tools/list"), { callerInstanceId: "inst_other" }).result;
  assert.equal(JSON.stringify(a.tools), JSON.stringify(b.tools));
});

// --- legacy era is untouched ------------------------------------------------

test("legacy initialize is unchanged", () => {
  const r = server().handle(legacy("initialize", { protocolVersion: PINNED_PROTOCOL_VERSION })).result;
  assert.equal(r.protocolVersion, PINNED_PROTOCOL_VERSION);
  assert.deepEqual(r.capabilities, { tools: {} });
  assert.equal(r.serverInfo.name, "secb-mcp-server");
});

test("a legacy tools/list carries no modern fields", () => {
  const r = server().handle(legacy("tools/list")).result;
  assert.deepEqual(Object.keys(r), ["tools"], "the legacy shape is exactly what it was");
});

test("a modern tools/call reaches dispatch and is audited like any other", () => {
  const calls = [];
  const res = server(calls).handle(modern("tools/call", { name: "secb_canonical_fingerprint", arguments: { document: {} } }), {
    callerInstanceId: "inst_ok"
  });
  assert.ok(typeof res.result.data.content_hash === "string");
  assert.equal(calls.at(-1).decision, "ALLOW");
});

test("an unknown method is still method-not-found in both eras", () => {
  assert.equal(server().handle(modern("no/such")).error.code, -32601);
  assert.equal(server().handle(legacy("no/such")).error.code, -32601);
});

// --- the guard must cover BOTH dispatch paths ------------------------------

test("the version guard is one function, reachable from either path", async () => {
  // Regression. The proxy routes a namespaced tools/call to its own dispatch and
  // never passes through the core's handle(), so the check that lived inside the
  // core was unreachable for upstream calls: a client declaring a version SecB
  // does not implement was refused on a native tool and SERVED on an upstream
  // one — the control was bypassable for exactly the traffic that leaves the
  // organism. Both paths now call the same exported guard.
  const { SecBMcpUpstreamProxy } = await import("../src/mcp/upstream-proxy.mjs");
  const { UpstreamClient } = await import("../src/mcp/upstream-client.mjs");
  const { resolve: resolvePath } = await import("node:path");
  const fixture = resolvePath(import.meta.dirname, "fixtures", "fake-upstream-mcp-server.mjs");

  const client = new UpstreamClient({
    plan: { id: "fake", transport: "stdio", runtime: "any", host: "wsl", reachable: true, command: process.execPath, args: [fixture, "normal"], env: {} },
    timeoutMs: 5_000
  });
  await client.start();
  try {
    const proxy = new SecBMcpUpstreamProxy({
      core: server(),
      clients: new Map([["fake", client]]),
      invocationLog: () => {},
      classificationCeiling: "INTERNAL"
    });
    await proxy.refreshTools();

    const send = (name, version) =>
      proxy.handle(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name,
            arguments: { message: "x", document: {} },
            ...(version ? { _meta: { [PROTOCOL_VERSION_META_KEY]: version } } : {})
          }
        },
        { callerInstanceId: "inst_ok" }
      );

    assert.equal((await send("secb_canonical_fingerprint", "1900-01-01")).error.code, -32022, "native path refuses");
    assert.equal((await send("fake__echo", "1900-01-01")).error.code, -32022, "upstream path refuses too");
    assert.ok((await send("fake__echo", MODERN_PROTOCOL_VERSION)).result, "a supported version still works");
    assert.ok((await send("fake__echo", null)).result, "an undeclared version is legacy and untouched");
  } finally {
    await client.close();
  }
});
