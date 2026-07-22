import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { COMMAND_CENTER_DENY_CODES, COMMAND_CENTER_SECTIONS, composeCommandCenterSnapshot } from "../src/ui/command-center-snapshot.mjs";

const PROJECT = "prj_secb_local";
const NOW = "2026-07-21T15:00:00Z";
const source = (id, overrides = {}) => ({
  status: "AVAILABLE", project_id: PROJECT, source_version: `${id}-v1`,
  observed_at: NOW, integrity_ref: `sha256:${id}`, data: { section: id, rows: [] }, ...overrides
});
const request = (overrides = {}) => ({
  projectId: PROJECT, generatedAt: NOW,
  sections: Object.fromEntries(COMMAND_CENTER_SECTIONS.map((id) => [id, source(id)])), ...overrides
});

test("complete snapshot is detached, deeply frozen, and project scoped", () => {
  const input = request();
  const result = composeCommandCenterSnapshot(input);
  assert.equal(result.ok, true);
  assert.equal(result.overall_status, "COMPLETE");
  assert.equal(result.project_id, PROJECT);
  assert.equal(result.data_untrusted, true);
  input.sections.events.data.rows.push("later");
  assert.deepEqual(result.sections.events.data.rows, []);
  assert.throws(() => result.sections.events.data.rows.push("x"), TypeError);
});

test("missing, degraded, and unavailable sections remain visible", () => {
  const sections = { events: source("events"), runtime: source("runtime", { status: "DEGRADED", reason: "STALE" }), replay: { status: "UNAVAILABLE", reason: "NOT_RATIFIED" } };
  const result = composeCommandCenterSnapshot(request({ sections }));
  assert.equal(result.ok, true);
  assert.equal(result.overall_status, "DEGRADED");
  assert.equal(result.sections.evidence.reason, "SOURCE_NOT_PROVIDED");
  assert.deepEqual(result.findings.map((item) => item.section_id), ["evidence", "goals", "runtime", "workspace", "operations", "replay"]);
});

test("mixed project scope denies", () => {
  const sections = request().sections;
  sections.workspace = source("workspace", { project_id: "other" });
  assert.equal(composeCommandCenterSnapshot(request({ sections })).code, "DENY_PROJECT_SCOPE_MISMATCH");
});

test("closed input shapes reject malformed, unknown, inherited, and symbolic keys", () => {
  for (const value of [undefined, null, [], {}, { ...request(), rogue: true }]) {
    assert.equal(composeCommandCenterSnapshot(value).code, "DENY_SNAPSHOT_MALFORMED");
  }
  const inherited = Object.create({ events: source("events") });
  assert.equal(composeCommandCenterSnapshot(request({ sections: inherited })).code, "DENY_SNAPSHOT_MALFORMED");
  const symbolInput = request();
  symbolInput[Symbol("action")] = true;
  assert.equal(composeCommandCenterSnapshot(symbolInput).code, "DENY_SNAPSHOT_MALFORMED");
});

test("hostile top-level, section-map, and source accessors deny without escaping", () => {
  const top = request();
  Object.defineProperty(top, "generatedAt", { enumerable: true, get() { throw new Error("boom"); } });
  assert.doesNotThrow(() => composeCommandCenterSnapshot(top));
  assert.equal(composeCommandCenterSnapshot(top).code, "DENY_SNAPSHOT_MALFORMED");
  const map = request();
  map.sections = new Proxy(map.sections, { ownKeys() { throw new Error("boom"); } });
  assert.equal(composeCommandCenterSnapshot(map).code, "DENY_SNAPSHOT_MALFORMED");
  const item = request();
  Object.defineProperty(item.sections.events, "data", { enumerable: true, get() { return {}; } });
  assert.equal(composeCommandCenterSnapshot(item).code, "DENY_SNAPSHOT_MALFORMED");
});

test("F-IMM-1 closes: non-JSON collections and custom objects deny", () => {
  class Custom { constructor() { this.value = 1; } }
  const values = [new Map([["x", 1]]), new Set([1]), new Date(), /x/, new Uint8Array([1]), new Custom(), () => {}, undefined, 1n, Infinity, -Infinity, NaN];
  for (const value of values) {
    const input = request(); input.sections.events.data = value;
    assert.equal(composeCommandCenterSnapshot(input).code, "DENY_SNAPSHOT_MALFORMED", value?.constructor?.name);
  }
});

test("F-IMM-1 closes recursively for symbols, accessors, sparse arrays, and cycles", () => {
  const symbolic = {}; symbolic[Symbol("x")] = 1;
  const accessor = {}; Object.defineProperty(accessor, "x", { enumerable: true, get() { return 1; } });
  const decorated = [1]; decorated.extra = true;
  const cycle = {}; cycle.self = cycle;
  const cases = [symbolic, accessor, [, 1], decorated, cycle, { nested: { value: new Map() } }, new Proxy({ x: 1 }, {})];
  for (const data of cases) {
    const input = request(); input.sections.events.data = data;
    assert.equal(composeCommandCenterSnapshot(input).code, "DENY_SNAPSHOT_MALFORMED");
  }
});

test("valid JSON scalar and nested graphs are accepted and frozen", () => {
  const nullProto = Object.create(null); nullProto.constructor = "data";
  const values = [null, true, false, 0, 1.5, "text", [], {}, [1, { x: [false, null] }], nullProto];
  for (const data of values) {
    const input = request(); input.sections.events.data = data;
    const result = composeCommandCenterSnapshot(input);
    assert.equal(result.ok, true);
    if (result.sections.events.data && typeof result.sections.events.data === "object") assert.ok(Object.isFrozen(result.sections.events.data));
  }
});

test("consulted top-level fields are descriptor-snapshotted without getter execution", () => {
  const input = request();
  let executions = 0;
  Object.defineProperty(input, "generatedAt", { enumerable: true, get() { executions += 1; return NOW; } });
  assert.equal(composeCommandCenterSnapshot(input).code, "DENY_SNAPSHOT_MALFORMED");
  assert.equal(executions, 0);
});

test("deny registry is frozen and module remains pure, unwired, and action-free", () => {
  assert.deepEqual(COMMAND_CENTER_DENY_CODES, ["DENY_SNAPSHOT_MALFORMED", "DENY_PROJECT_SCOPE_MISMATCH"]);
  assert.ok(Object.isFrozen(COMMAND_CENTER_DENY_CODES));
  const text = readFileSync(resolve("src/ui/command-center-snapshot.mjs"), "utf8");
  assert.doesNotMatch(text, /from\s+["']node:(?:fs|net|http|https|child_process)/);
  assert.doesNotMatch(text, /\b(?:append|dispatch|approve|retry|terminate|activate)\s*\(/);
  for (const path of ["src/index.mjs", "src/ui/ops-report-generator.mjs", "src/mcp/secb-mcp-server.mjs"]) {
    assert.doesNotMatch(readFileSync(resolve(path), "utf8"), /command-center-snapshot/);
  }
});
