// MOD-MEM Slice S1 — Memory gateway facade tests.
//
// Scope: fail-closed construction; the deny-by-default admission pipeline
// (shape -> clock -> layer -> classification ceiling -> admission SoD ->
// audit-first -> store append); scoped retrieval with cross-project denial,
// honest TTL-expiry filtering, and frozen data_untrusted outputs. Plus a GUARD
// test proving temporal-ledgers.mjs and sod-rules.mjs are byte-identical to
// main (wrap-not-modify: the gateway can only narrow, never widen).
//
// The gateway is UNWIRED: nothing in the runtime constructs it, and every
// collaborator here is a test double or the real kernel sod-rules primitive.

import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createMemoryGateway, MemoryGatewayConfigurationError } from "../src/services/memory-gateway-service.mjs";
import { checkPairwiseDistinct } from "../src/control/sod-rules.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const FIXED_NOW = new Date("2026-07-20T10:00:00Z");

// Kernel SoD primitive, reused config-only (no wrapper behavior added).
const kernelSodRules = { checkPairwiseDistinct };

function makeStore() {
  const rows = [];
  return {
    rows,
    append(record) {
      rows.push(record);
      return { sequence: rows.length };
    },
    read() {
      return rows.slice();
    }
  };
}

function makeAuditWriter() {
  const entries = [];
  const writer = (entry) => {
    entries.push(entry);
    return { audited: true };
  };
  writer.entries = entries;
  return writer;
}

function layerConfig(overrides = {}) {
  return {
    session: { store: makeStore(), admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } },
    work: { store: makeStore(), admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 300_000, sod: "producer-only" } },
    project: { store: makeStore(), admission: { classificationCeiling: "RESTRICTED", ttlMs: 900_000, sod: "distinct-approver" } },
    ...overrides
  };
}

function makeGateway({ now = () => FIXED_NOW, ledgerWriter = makeAuditWriter(), layerStores = layerConfig() } = {}) {
  const gateway = createMemoryGateway({ layerStores, sodRules: kernelSodRules, now, ledgerWriter });
  return { gateway, layerStores, ledgerWriter };
}

function sessionRecord(overrides = {}) {
  return {
    project_id: "proj-1",
    work_package_id: "wp-1",
    session_id: "sess-1",
    actor_id: "agent-a",
    classification: "INTERNAL",
    statement: "user prefers dark mode",
    ...overrides
  };
}

// --- Construction ----------------------------------------------------------

test("construction is fail-closed on every missing or malformed collaborator", () => {
  const hasCode = (code) => (err) => err instanceof MemoryGatewayConfigurationError && err.code === code;
  assert.throws(() => createMemoryGateway(), hasCode("INVALID_LAYER_STORES"));
  assert.throws(() => createMemoryGateway({ layerStores: {}, sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter: () => {} }), hasCode("INVALID_LAYER_STORES"));
  assert.throws(
    () => createMemoryGateway({ layerStores: { org: { store: makeStore(), admission: { classificationCeiling: "PUBLIC", ttlMs: 1, sod: "producer-only" } } }, sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter: () => {} }),
    hasCode("INVALID_LAYER")
  );
  assert.throws(
    () => createMemoryGateway({ layerStores: { session: { store: {}, admission: { classificationCeiling: "PUBLIC", ttlMs: 1, sod: "producer-only" } } }, sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter: () => {} }),
    hasCode("INVALID_LAYER_STORE")
  );
  assert.throws(
    () => createMemoryGateway({ layerStores: { session: { store: makeStore(), admission: { classificationCeiling: "NOPE", ttlMs: 1, sod: "producer-only" } } }, sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter: () => {} }),
    hasCode("INVALID_ADMISSION_CONFIG")
  );
  assert.throws(
    () => createMemoryGateway({ layerStores: { session: { store: makeStore(), admission: { classificationCeiling: "PUBLIC", ttlMs: 0, sod: "producer-only" } } }, sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter: () => {} }),
    hasCode("INVALID_ADMISSION_CONFIG")
  );
  assert.throws(
    () => createMemoryGateway({ layerStores: layerConfig(), sodRules: {}, now: () => FIXED_NOW, ledgerWriter: () => {} }),
    hasCode("INVALID_SOD_RULES")
  );
  assert.throws(
    () => createMemoryGateway({ layerStores: layerConfig(), sodRules: kernelSodRules, now: "not-a-function", ledgerWriter: () => {} }),
    hasCode("INVALID_CLOCK")
  );
  assert.throws(
    () => createMemoryGateway({ layerStores: layerConfig(), sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter: null }),
    hasCode("INVALID_LEDGER_WRITER")
  );
});

test("the gateway surface is frozen and exposes only admit and retrieve", () => {
  const { gateway } = makeGateway();
  assert.ok(Object.isFrozen(gateway));
  assert.deepEqual(Object.keys(gateway).sort(), ["admit", "retrieve"]);
});

// --- Admission happy path --------------------------------------------------

test("admit ADMITS a well-formed session record and stamps a server-derived instant", () => {
  const { gateway, layerStores, ledgerWriter } = makeGateway();
  const result = gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } });
  assert.equal(result.decision, "ALLOW");
  assert.equal(result.code, "ADMITTED");
  assert.equal(result.admitted_at, FIXED_NOW.toISOString());
  assert.equal(result.record.layer, "session");
  assert.equal(result.record.admitted_at, FIXED_NOW.toISOString());
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.record));
  assert.equal(layerStores.session.store.rows.length, 1);
  assert.equal(ledgerWriter.entries.length, 1);
});

test("project-layer admission ADMITS when producer and approver are distinct", () => {
  const { gateway, layerStores } = makeGateway();
  const result = gateway.admit({
    layer: "project",
    record: sessionRecord({ classification: "RESTRICTED" }),
    admission: { producer: "agent-a", approver: "agent-b" }
  });
  assert.equal(result.decision, "ALLOW");
  assert.equal(layerStores.project.store.rows.length, 1);
});

// --- Admission deny paths --------------------------------------------------

test("admit denies a non-object / unknown-field / missing-field request", () => {
  const { gateway } = makeGateway();
  assert.equal(gateway.admit(null).code, "DENY_MALFORMED_REQUEST");
  assert.equal(gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "a" }, extra: 1 }).code, "DENY_MALFORMED_REQUEST");
  assert.equal(gateway.admit({ layer: "session", record: { ...sessionRecord(), rogue: 1 }, admission: { producer: "a" } }).code, "DENY_MALFORMED_REQUEST");
  const missing = gateway.admit({ layer: "session", record: sessionRecord({ statement: "" }), admission: { producer: "a" } });
  assert.equal(missing.code, "DENY_MISSING_FIELDS");
});

test("admit denies DENY_CLOCK_UNAVAILABLE when the clock throws or returns NaN", () => {
  const throwing = makeGateway({ now: () => { throw new Error("no clock"); } });
  assert.equal(throwing.gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "a" } }).code, "DENY_CLOCK_UNAVAILABLE");
  const nan = makeGateway({ now: () => new Date("not-a-date") });
  assert.equal(nan.gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "a" } }).code, "DENY_CLOCK_UNAVAILABLE");
});

test("admit denies DENY_UNKNOWN_LAYER for an unconfigured layer", () => {
  const { gateway } = makeGateway();
  const result = gateway.admit({ layer: "procedural", record: sessionRecord(), admission: { producer: "a" } });
  assert.equal(result.code, "DENY_UNKNOWN_LAYER");
});

test("admit denies DENY_CLASSIFICATION_CEILING for unknown or over-ceiling classification", () => {
  const { gateway } = makeGateway();
  const unknown = gateway.admit({ layer: "session", record: sessionRecord({ classification: "COSMIC" }), admission: { producer: "a" } });
  assert.equal(unknown.code, "DENY_CLASSIFICATION_CEILING");
  // session ceiling is CONFIDENTIAL; RESTRICTED exceeds it.
  const over = gateway.admit({ layer: "session", record: sessionRecord({ classification: "RESTRICTED" }), admission: { producer: "a" } });
  assert.equal(over.code, "DENY_CLASSIFICATION_CEILING");
});

test("admit denies DENY_ADMISSION_SOD when the producer is the sole approver (project layer)", () => {
  const { gateway, layerStores } = makeGateway();
  const result = gateway.admit({
    layer: "project",
    record: sessionRecord({ classification: "RESTRICTED" }),
    admission: { producer: "agent-a", approver: "agent-a" }
  });
  assert.equal(result.decision, "DENY");
  assert.equal(result.code, "DENY_ADMISSION_SOD");
  assert.equal(layerStores.project.store.rows.length, 0, "no store append on SoD denial");
});

test("admit denies DENY_MISSING_FIELDS when project layer has no approver", () => {
  const { gateway } = makeGateway();
  const result = gateway.admit({
    layer: "project",
    record: sessionRecord({ classification: "RESTRICTED" }),
    admission: { producer: "agent-a" }
  });
  assert.equal(result.code, "DENY_MISSING_FIELDS");
});

test("admit denies DENY_AUDIT_UNAVAILABLE when the audit writer throws, before any store append", () => {
  const store = makeStore();
  const layerStores = layerConfig({ session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } });
  const gateway = createMemoryGateway({
    layerStores,
    sodRules: kernelSodRules,
    now: () => FIXED_NOW,
    ledgerWriter: () => { throw new Error("audit down"); }
  });
  const result = gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "a" } });
  assert.equal(result.code, "DENY_AUDIT_UNAVAILABLE");
  assert.equal(store.rows.length, 0, "audit-first: no store mutation when audit is unavailable");
});

test("audit-first: the audit entry is written strictly before the store append", () => {
  const order = [];
  const store = makeStore();
  const wrappedStore = {
    rows: store.rows,
    append(record) { order.push("store"); return store.append(record); },
    read: store.read
  };
  const layerStores = layerConfig({ session: { store: wrappedStore, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } });
  const gateway = createMemoryGateway({
    layerStores,
    sodRules: kernelSodRules,
    now: () => FIXED_NOW,
    ledgerWriter: () => { order.push("audit"); }
  });
  const result = gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "a" } });
  assert.equal(result.decision, "ALLOW");
  assert.deepEqual(order, ["audit", "store"]);
});

test("admit denies DENY_STORE_UNAVAILABLE when the store append throws", () => {
  const store = { append() { throw new Error("disk full"); }, read() { return []; } };
  const layerStores = layerConfig({ session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } });
  const gateway = createMemoryGateway({ layerStores, sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter: makeAuditWriter() });
  const result = gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "a" } });
  assert.equal(result.code, "DENY_STORE_UNAVAILABLE");
});

// --- Retrieval -------------------------------------------------------------

function seed(gateway, layer, overrides, admission) {
  const result = gateway.admit({ layer, record: sessionRecord(overrides), admission });
  assert.equal(result.decision, "ALLOW", `seed admit should ALLOW: ${result.code}`);
  return result;
}

test("retrieve returns layer+project scoped records, frozen and marked data_untrusted", () => {
  const { gateway } = makeGateway();
  seed(gateway, "session", { statement: "fact one" }, { producer: "a" });
  seed(gateway, "session", { statement: "fact two", project_id: "proj-2" }, { producer: "a" });
  const result = gateway.retrieve({ layer: "session", project_id: "proj-1", scope_project_id: "proj-1" });
  assert.equal(result.decision, "ALLOW");
  assert.equal(result.code, "RETRIEVED");
  assert.equal(result.retrieved_at, FIXED_NOW.toISOString());
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].data_untrusted, true);
  assert.equal(result.records[0].record.statement, "fact one");
  assert.ok(Object.isFrozen(result.records[0]));
  assert.ok(Object.isFrozen(result));
});

test("retrieve denies DENY_CROSS_PROJECT when the requested project differs from the caller scope", () => {
  const { gateway } = makeGateway();
  seed(gateway, "session", {}, { producer: "a" });
  const result = gateway.retrieve({ layer: "session", project_id: "proj-2", scope_project_id: "proj-1" });
  assert.equal(result.decision, "DENY");
  assert.equal(result.code, "DENY_CROSS_PROJECT");
});

test("retrieve denies malformed / missing-field / unknown-layer queries and a throwing clock", () => {
  const { gateway } = makeGateway();
  assert.equal(gateway.retrieve(null).code, "DENY_MALFORMED_REQUEST");
  assert.equal(gateway.retrieve({ layer: "session", project_id: "proj-1", scope_project_id: "proj-1", rogue: 1 }).code, "DENY_MALFORMED_REQUEST");
  assert.equal(gateway.retrieve({ layer: "session", project_id: "proj-1" }).code, "DENY_MISSING_FIELDS");
  assert.equal(gateway.retrieve({ layer: "org", project_id: "proj-1", scope_project_id: "proj-1" }).code, "DENY_UNKNOWN_LAYER");
  const throwing = makeGateway({ now: () => { throw new Error("no clock"); } });
  assert.equal(throwing.gateway.retrieve({ layer: "session", project_id: "proj-1", scope_project_id: "proj-1" }).code, "DENY_CLOCK_UNAVAILABLE");
});

test("retrieve honestly filters TTL-expired records (computed, not stored, no pruning)", () => {
  // Admit at T0 into the session layer (ttl 60s), then read at T0+61s.
  let clock = new Date("2026-07-20T10:00:00Z");
  const layerStores = layerConfig();
  const gateway = createMemoryGateway({ layerStores, sodRules: kernelSodRules, now: () => clock, ledgerWriter: makeAuditWriter() });
  gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "a" } });

  // Before expiry: visible.
  clock = new Date("2026-07-20T10:00:30Z");
  const live = gateway.retrieve({ layer: "session", project_id: "proj-1", scope_project_id: "proj-1" });
  assert.equal(live.records.length, 1);

  // After expiry: filtered out, but the row remains in the store (deny-on-use).
  clock = new Date("2026-07-20T10:01:01Z");
  const expired = gateway.retrieve({ layer: "session", project_id: "proj-1", scope_project_id: "proj-1" });
  assert.equal(expired.records.length, 0, "expired record filtered honestly");
  assert.equal(layerStores.session.store.rows.length, 1, "no pruning: the record still exists in the store");
});

// --- Wrap-not-modify guard -------------------------------------------------

test("GUARD: temporal-ledgers.mjs and sod-rules.mjs are byte-identical to main (no admission-policy change)", () => {
  // Normalize platform line-ending translation (git stores LF; the working
  // tree may check out CRLF) so the guard compares tracked content honestly.
  const normalize = (text) => text.replace(/\r\n/g, "\n");
  for (const path of ["src/ledger/temporal-ledgers.mjs", "src/control/sod-rules.mjs"]) {
    const onMain = execFileSync("git", ["show", `main:${path}`], { cwd: REPO_ROOT, encoding: "utf8" });
    const onBranch = readFileSync(resolve(REPO_ROOT, path), "utf8");
    assert.equal(normalize(onBranch), normalize(onMain), `${path} must be untouched vs main (wrap-not-modify)`);
  }
});
