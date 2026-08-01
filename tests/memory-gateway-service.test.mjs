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
import { validateContract } from "../src/contracts/contract-validator.mjs";
import { canonicalFingerprint } from "../src/contracts/canonical-fingerprint.mjs";
import { checkPairwiseDistinct } from "../src/control/sod-rules.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const FIXED_NOW = new Date("2026-07-20T10:00:00Z");

// Kernel SoD primitive, reused config-only (no wrapper behavior added).
const kernelSodRules = { checkPairwiseDistinct };

function makeStore() {
  const rows = [];
  const receipts = new Map();
  return {
    rows,
    appendCalls: 0,
    readCalls: 0,
    append(record, { idempotency_key } = {}) {
      this.appendCalls += 1;
      const prior = receipts.get(idempotency_key);
      if (prior) return prior;
      rows.push(record);
      const receipt = {
        status: "COMMITTED",
        idempotency_key,
        memory_record_id: record.memory_record_id,
        version: record.version,
        content_hash: record.content_hash,
        record_fingerprint: canonicalFingerprint(record),
        sequence: rows.length
      };
      receipts.set(idempotency_key, receipt);
      return receipt;
    },
    read() {
      this.readCalls += 1;
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

function sessionRecord(overrides = {}, layer = "session") {
  const record = {
    memory_record_id: "mem-1",
    version: 1,
    project_id: "proj-1",
    work_package_id: "wp-1",
    session_id: "sess-1",
    actor_id: "agent-a",
    source: "KnowledgeLedger",
    classification: "INTERNAL",
    confidence: 0.9,
    provenance: { evidence_refs: ["ev-1"], origin_record_id: "kc-1" },
    valid_from: "2026-07-20T09:00:00Z",
    valid_until: "2026-07-20T11:00:00Z",
    retention_policy: "retain-30-days",
    statement: "user prefers dark mode",
    ...overrides
  };
  if (!Object.prototype.hasOwnProperty.call(overrides, "content_hash")) {
    record.content_hash = canonicalFingerprint({ ...record, layer });
  }
  return record;
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

test("admit ADMITS a well-formed session record and stamps a server-derived instant", async () => {
  const { gateway, layerStores, ledgerWriter } = makeGateway();
  const result = await gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } });
  assert.equal(result.decision, "ALLOW");
  assert.equal(result.code, "ADMITTED");
  assert.equal(result.admitted_at, FIXED_NOW.toISOString());
  assert.equal(result.record.layer, "session");
  assert.equal(result.record.admitted_at, FIXED_NOW.toISOString());
  assert.deepEqual(validateContract("memoryRecord", result.record), { kind: "memoryRecord", valid: true });
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.record));
  assert.equal(layerStores.session.store.rows.length, 1);
  assert.deepEqual(ledgerWriter.entries.map((entry) => entry.disposition), ["ATTEMPTED", "COMMITTED"]);
  assert.deepEqual(ledgerWriter.entries.map((entry) => entry.replay), [false, false]);
  assert.equal(result.append.status, "COMMITTED");
});

test("project-layer admission ADMITS when producer and approver are distinct", async () => {
  const { gateway, layerStores } = makeGateway();
  const result = await gateway.admit({
    layer: "project",
    record: sessionRecord({ classification: "RESTRICTED" }, "project"),
    admission: { producer: "agent-a", approver: "agent-b" }
  });
  assert.equal(result.decision, "ALLOW");
  assert.equal(layerStores.project.store.rows.length, 1);
});

// --- Admission deny paths --------------------------------------------------

test("admit denies a non-object / unknown-field / missing-field request", async () => {
  const { gateway } = makeGateway();
  assert.equal((await gateway.admit(null)).code, "DENY_MALFORMED_REQUEST");
  assert.equal((await gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "agent-a" }, extra: 1 })).code, "DENY_MALFORMED_REQUEST");
  assert.equal((await gateway.admit({ layer: "session", record: { ...sessionRecord(), rogue: 1 }, admission: { producer: "agent-a" } })).code, "DENY_MALFORMED_REQUEST");
  const missing = await gateway.admit({ layer: "session", record: sessionRecord({ statement: "" }), admission: { producer: "agent-a" } });
  assert.equal(missing.code, "DENY_MISSING_FIELDS");
});

test("admit denies contract-invalid records before audit and store side effects", async () => {
  const cases = [
    sessionRecord({ confidence: 1.1 }),
    sessionRecord({ content_hash: "ABC" }),
    sessionRecord({ provenance: { evidence_refs: [], origin_record_id: "kc-1" } }),
    sessionRecord({ version: 0 })
  ];

  for (const record of cases) {
    const { gateway, layerStores, ledgerWriter } = makeGateway();
    const result = await gateway.admit({ layer: "session", record, admission: { producer: "agent-a" } });
    assert.equal(result.decision, "DENY");
    assert.equal(result.code, "DENY_MEMORY_RECORD_INVALID");
    assert.equal(ledgerWriter.entries.length, 0, "invalid contract must not be audited as an admission");
    assert.equal(layerStores.session.store.rows.length, 0, "invalid contract must not reach storage");
  }
});

test("admit rejects caller-owned layer/admitted_at and stamps trusted values", async () => {
  for (const ownedField of ["layer", "admitted_at"]) {
    const { gateway, layerStores, ledgerWriter } = makeGateway();
    const result = await gateway.admit({
      layer: "session",
      record: sessionRecord({ [ownedField]: ownedField === "layer" ? "project" : "2000-01-01T00:00:00Z" }),
      admission: { producer: "agent-a" }
    });
    assert.equal(result.code, "DENY_MALFORMED_REQUEST");
    assert.equal(ledgerWriter.entries.length, 0);
    assert.equal(layerStores.session.store.rows.length, 0);
  }

  const { gateway } = makeGateway();
  const admitted = await gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } });
  assert.equal(admitted.record.layer, "session");
  assert.equal(admitted.record.admitted_at, FIXED_NOW.toISOString());
});

test("admit binds record actor attribution to the producer before SoD, audit, or store", async () => {
  const { gateway, layerStores, ledgerWriter } = makeGateway();
  const result = await gateway.admit({
    layer: "project",
    record: sessionRecord({ actor_id: "agent-b", classification: "RESTRICTED" }, "project"),
    admission: { producer: "agent-a", approver: "agent-b" }
  });
  assert.equal(result.decision, "DENY");
  assert.equal(result.code, "DENY_PRODUCER_MISMATCH");
  assert.equal(ledgerWriter.entries.length, 0);
  assert.equal(layerStores.project.store.rows.length, 0);
});

test("admit denies DENY_CLOCK_UNAVAILABLE when the clock throws or returns NaN", async () => {
  const throwing = makeGateway({ now: () => { throw new Error("no clock"); } });
  assert.equal((await throwing.gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } })).code, "DENY_CLOCK_UNAVAILABLE");
  const nan = makeGateway({ now: () => new Date("not-a-date") });
  assert.equal((await nan.gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } })).code, "DENY_CLOCK_UNAVAILABLE");
});

test("admit denies DENY_UNKNOWN_LAYER for an unconfigured layer", async () => {
  const { gateway } = makeGateway();
  const result = await gateway.admit({ layer: "procedural", record: sessionRecord(), admission: { producer: "agent-a" } });
  assert.equal(result.code, "DENY_UNKNOWN_LAYER");
});

test("admit denies DENY_CLASSIFICATION_CEILING for unknown or over-ceiling classification", async () => {
  const { gateway } = makeGateway();
  const unknown = await gateway.admit({ layer: "session", record: sessionRecord({ classification: "COSMIC" }), admission: { producer: "agent-a" } });
  assert.equal(unknown.code, "DENY_CLASSIFICATION_CEILING");
  // session ceiling is CONFIDENTIAL; RESTRICTED exceeds it.
  const over = await gateway.admit({ layer: "session", record: sessionRecord({ classification: "RESTRICTED" }), admission: { producer: "agent-a" } });
  assert.equal(over.code, "DENY_CLASSIFICATION_CEILING");
});

test("admit denies DENY_ADMISSION_SOD when the producer is the sole approver (project layer)", async () => {
  const { gateway, layerStores } = makeGateway();
  const result = await gateway.admit({
    layer: "project",
    record: sessionRecord({ classification: "RESTRICTED" }, "project"),
    admission: { producer: "agent-a", approver: "agent-a" }
  });
  assert.equal(result.decision, "DENY");
  assert.equal(result.code, "DENY_ADMISSION_SOD");
  assert.equal(layerStores.project.store.rows.length, 0, "no store append on SoD denial");
});

test("admit denies DENY_MISSING_FIELDS when project layer has no approver", async () => {
  const { gateway } = makeGateway();
  const result = await gateway.admit({
    layer: "project",
    record: sessionRecord({ classification: "RESTRICTED" }, "project"),
    admission: { producer: "agent-a" }
  });
  assert.equal(result.code, "DENY_MISSING_FIELDS");
});

test("admit denies DENY_AUDIT_UNAVAILABLE when the audit writer throws, before any store append", async () => {
  const store = makeStore();
  const layerStores = layerConfig({ session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } });
  const gateway = createMemoryGateway({
    layerStores,
    sodRules: kernelSodRules,
    now: () => FIXED_NOW,
    ledgerWriter: () => { throw new Error("audit down"); }
  });
  const result = await gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } });
  assert.equal(result.code, "DENY_AUDIT_UNAVAILABLE");
  assert.equal(store.rows.length, 0, "audit-first: no store mutation when audit is unavailable");
});

test("admit awaits an asynchronous audit and denies a rejected audit before storage", async () => {
  const store = makeStore();
  const layerStores = layerConfig({ session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } });
  const gateway = createMemoryGateway({
    layerStores,
    sodRules: kernelSodRules,
    now: () => FIXED_NOW,
    ledgerWriter: async () => { throw new Error("async audit down"); }
  });
  const result = await gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } });
  assert.equal(result.code, "DENY_AUDIT_UNAVAILABLE");
  assert.equal(store.rows.length, 0, "rejected audit Promise must prevent storage");
});

test("audit-first: the audit entry is written strictly before the store append", async () => {
  const order = [];
  const store = makeStore();
  const wrappedStore = {
    rows: store.rows,
    append(record, options) { order.push("store"); return store.append(record, options); },
    read: store.read
  };
  const layerStores = layerConfig({ session: { store: wrappedStore, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } });
  const gateway = createMemoryGateway({
    layerStores,
    sodRules: kernelSodRules,
    now: () => FIXED_NOW,
    ledgerWriter: () => { order.push("audit"); }
  });
  const result = await gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } });
  assert.equal(result.decision, "ALLOW");
  assert.deepEqual(order, ["audit", "store", "audit"]);
});

test("admit marks reconciliation required when the store append throws", async () => {
  const store = { append() { throw new Error("disk full"); }, read() { return []; } };
  const layerStores = layerConfig({ session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } });
  const ledgerWriter = makeAuditWriter();
  const gateway = createMemoryGateway({ layerStores, sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter });
  const result = await gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } });
  assert.equal(result.code, "ADMISSION_RECONCILIATION_REQUIRED");
  assert.equal(result.record_observed, false);
  assert.deepEqual(ledgerWriter.entries.map((entry) => entry.disposition), ["ATTEMPTED", "RECONCILIATION_REQUIRED"]);
});

test("admit awaits an asynchronous store and records reconciliation, never a false FAILED", async () => {
  const store = { async append() { throw new Error("async disk full"); }, read() { return []; } };
  const layerStores = layerConfig({ session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } });
  const ledgerWriter = makeAuditWriter();
  const gateway = createMemoryGateway({ layerStores, sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter });
  const result = await gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } });
  assert.equal(result.decision, "RECONCILIATION_REQUIRED");
  assert.equal(result.code, "ADMISSION_RECONCILIATION_REQUIRED");
  assert.deepEqual(ledgerWriter.entries.map((entry) => entry.disposition), ["ATTEMPTED", "RECONCILIATION_REQUIRED"]);
});

test("admit reports reconciliation honestly when its disposition cannot be audited", async () => {
  const entries = [];
  const ledgerWriter = async (entry) => {
    entries.push(entry);
    if (entry.disposition === "RECONCILIATION_REQUIRED") throw new Error("reconciliation audit down");
  };
  const store = { async append() { throw new Error("disk full"); }, read() { return []; } };
  const layerStores = layerConfig({ session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } });
  const gateway = createMemoryGateway({ layerStores, sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter });
  const result = await gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } });
  assert.equal(result.code, "ADMISSION_RECONCILIATION_REQUIRED");
  assert.equal(result.audit_recorded, false);
  assert.deepEqual(entries.map((entry) => entry.disposition), ["ATTEMPTED", "RECONCILIATION_REQUIRED"]);
});

test("mutate-then-reject is reconciliation-required and reports the observed record", async () => {
  const rows = [];
  const store = {
    async append(record) { rows.push(record); throw new Error("ack lost"); },
    read() { return rows.slice(); }
  };
  const layerStores = layerConfig({ session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } });
  const ledgerWriter = makeAuditWriter();
  const gateway = createMemoryGateway({ layerStores, sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter });
  const result = await gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } });
  assert.equal(result.decision, "RECONCILIATION_REQUIRED");
  assert.equal(result.record_observed, true);
  assert.equal(rows.length, 1);
  assert.deepEqual(ledgerWriter.entries.map((entry) => entry.disposition), ["ATTEMPTED", "RECONCILIATION_REQUIRED"]);
});

test("a no-op or malformed store receipt can never produce ALLOW", async () => {
  const stores = [
    { append() {}, read() { return []; } },
    { append() { return { status: "COMMITTED" }; }, read() { return []; } },
    { append(record, { idempotency_key }) { return { status: "COMMITTED", idempotency_key, memory_record_id: record.memory_record_id, version: record.version, content_hash: record.content_hash, rogue: true }; }, read() { return []; } }
  ];
  for (const store of stores) {
    const layerStores = layerConfig({ session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } });
    const gateway = createMemoryGateway({ layerStores, sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter: makeAuditWriter() });
    const result = await gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } });
    assert.equal(result.decision, "RECONCILIATION_REQUIRED");
    assert.equal(result.code, "ADMISSION_RECONCILIATION_REQUIRED");
  }
});

test("duplicate retry verifies the pre-existing durable row without append healing", async () => {
  const store = makeStore();
  const ledgerWriter = makeAuditWriter();
  let clock = FIXED_NOW;
  const layerStores = layerConfig({ session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } });
  const gateway = createMemoryGateway({ layerStores, sodRules: kernelSodRules, now: () => clock, ledgerWriter });
  const request = { layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } };
  const first = await gateway.admit(request);
  const auditCount = ledgerWriter.entries.length;
  clock = new Date(FIXED_NOW.getTime() + 300_000);
  const retry = await gateway.admit(request);
  assert.equal(first.decision, "ALLOW");
  assert.equal(retry.decision, "ALLOW");
  assert.equal(first.append.idempotency_key, retry.append.idempotency_key);
  assert.equal(first.append.sequence, retry.append.sequence);
  assert.deepEqual(retry.record, first.record, "retry returns the authoritative stored record, including original admitted_at");
  assert.equal(retry.admitted_at, first.admitted_at, "top-level retry timestamp must equal the authoritative stored admission timestamp");
  assert.equal(retry.admitted_at, retry.record.admitted_at);
  assert.equal(store.rows.length, 1);
  assert.equal(store.appendCalls, 1, "replay must not append or upsert before verifying pre-state");
  assert.equal(store.readCalls, 2, "replay must verify durable read-back");
  assert.equal(ledgerWriter.entries.length, auditCount + 2, "replay emits ATTEMPTED and COMMITTED telemetry");
  assert.deepEqual(ledgerWriter.entries.slice(-2).map((entry) => [entry.disposition, entry.replay]), [
    ["ATTEMPTED", true],
    ["COMMITTED", true]
  ]);
});

test("cached replay metadata cannot authorize a record deleted after first commit", async () => {
  const store = makeStore();
  const ledgerWriter = makeAuditWriter();
  const layerStores = layerConfig({ session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } });
  const gateway = createMemoryGateway({ layerStores, sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter });
  const request = { layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } };
  assert.equal((await gateway.admit(request)).decision, "ALLOW");
  store.rows.splice(0);

  const replay = await gateway.admit(request);

  assert.equal(replay.decision, "RECONCILIATION_REQUIRED");
  assert.equal(replay.reason, "STORE_REPLAY_PRESTATE_MISSING_OR_CONFLICT");
  assert.equal(replay.record_observed, false);
  assert.equal(store.appendCalls, 1);
  assert.ok(store.readCalls >= 3, "failed verification and reconciliation both inspect durable state");
});

test("cached replay metadata cannot authorize a record tampered after first commit", async () => {
  const store = makeStore();
  const layerStores = layerConfig({ session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } });
  const gateway = createMemoryGateway({ layerStores, sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter: makeAuditWriter() });
  const request = { layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } };
  assert.equal((await gateway.admit(request)).decision, "ALLOW");
  store.rows[0] = { ...store.rows[0], statement: "post-commit tamper" };

  const replay = await gateway.admit(request);

  assert.equal(replay.decision, "RECONCILIATION_REQUIRED");
  assert.equal(replay.reason, "STORE_REPLAY_PRESTATE_MISSING_OR_CONFLICT");
  assert.equal(store.appendCalls, 1);
  assert.notEqual(replay.decision, "ALLOW");
});

test("upsert-style store cannot heal deleted or tampered state during replay", async () => {
  const rows = [];
  let appendCalls = 0;
  const store = {
    append(record, { idempotency_key }) {
      appendCalls += 1;
      rows.splice(0, rows.length, record);
      return {
        status: "COMMITTED",
        idempotency_key,
        memory_record_id: record.memory_record_id,
        version: record.version,
        content_hash: record.content_hash,
        record_fingerprint: canonicalFingerprint(record),
        sequence: appendCalls
      };
    },
    read() { return rows.slice(); }
  };
  const layerStores = layerConfig({ session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } });
  const request = { layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } };

  const deletionGateway = createMemoryGateway({ layerStores, sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter: makeAuditWriter() });
  assert.equal((await deletionGateway.admit(request)).decision, "ALLOW");
  rows.splice(0);
  const deletedReplay = await deletionGateway.admit(request);
  assert.equal(deletedReplay.decision, "RECONCILIATION_REQUIRED");
  assert.equal(deletedReplay.reason, "STORE_REPLAY_PRESTATE_MISSING_OR_CONFLICT");
  assert.equal(appendCalls, 1, "replay never gave the upsert store a chance to recreate the row");
  assert.equal(rows.length, 0);

  const tamperGateway = createMemoryGateway({ layerStores, sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter: makeAuditWriter() });
  assert.equal((await tamperGateway.admit(request)).decision, "ALLOW");
  rows[0] = { ...rows[0], statement: "tampered before replay" };
  const tamperedReplay = await tamperGateway.admit(request);
  assert.equal(tamperedReplay.decision, "RECONCILIATION_REQUIRED");
  assert.equal(tamperedReplay.reason, "STORE_REPLAY_PRESTATE_MISSING_OR_CONFLICT");
  assert.equal(appendCalls, 2, "only the second gateway's first admission appended");
  assert.equal(rows[0].statement, "tampered before replay", "replay did not overwrite the evidence of tampering");
});

test("retry after restart without a durable replay anchor requires reconciliation", async () => {
  const store = makeStore();
  const layerStores = layerConfig({ session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } });
  const request = { layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } };
  const firstGateway = createMemoryGateway({ layerStores, sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter: makeAuditWriter() });
  const first = await firstGateway.admit(request);
  assert.equal(first.decision, "ALLOW");

  const restartedGateway = createMemoryGateway({
    layerStores,
    sodRules: kernelSodRules,
    now: () => new Date(FIXED_NOW.getTime() + 300_000),
    ledgerWriter: makeAuditWriter()
  });
  const replay = await restartedGateway.admit(request);

  assert.equal(replay.decision, "RECONCILIATION_REQUIRED");
  assert.equal(replay.reason, "UNVERIFIED_REPLAY_OR_TRUSTED_TIME_MISMATCH");
  assert.equal(store.rows.length, 1);
});

test("same claimed hash with changed payload is denied before audit or store", async () => {
  const store = makeStore();
  const ledgerWriter = makeAuditWriter();
  const layerStores = layerConfig({ session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } });
  const gateway = createMemoryGateway({ layerStores, sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter });
  const original = sessionRecord();
  const first = await gateway.admit({ layer: "session", record: original, admission: { producer: "agent-a" } });
  assert.equal(first.decision, "ALLOW");
  const auditCount = ledgerWriter.entries.length;
  const conflict = await gateway.admit({
    layer: "session",
    record: { ...original, statement: "different payload, same claimed hash" },
    admission: { producer: "agent-a" }
  });
  assert.equal(conflict.code, "DENY_CONTENT_HASH_MISMATCH");
  assert.equal(store.rows.length, 1);
  assert.equal(ledgerWriter.entries.length, auditCount);
});

test("same identity and version with different valid content is an idempotency conflict", async () => {
  const store = makeStore();
  const ledgerWriter = makeAuditWriter();
  const layerStores = layerConfig({ session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } });
  const gateway = createMemoryGateway({ layerStores, sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter });
  const first = await gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } });
  assert.equal(first.decision, "ALLOW");
  const auditCount = ledgerWriter.entries.length;

  const conflict = await gateway.admit({
    layer: "session",
    record: sessionRecord({ statement: "different valid content" }),
    admission: { producer: "agent-a" }
  });

  assert.equal(conflict.code, "DENY_IDEMPOTENCY_CONFLICT");
  assert.equal(store.rows.length, 1);
  assert.equal(ledgerWriter.entries.length, auditCount);
});

test("tampered full-record read-back cannot produce ALLOW even with a matching receipt tuple", async () => {
  const rows = [];
  const store = {
    append(record, { idempotency_key }) {
      const tampered = structuredClone(record);
      tampered.statement = "TAMPERED";
      rows.push(tampered);
      return {
        status: "COMMITTED",
        idempotency_key,
        memory_record_id: record.memory_record_id,
        version: record.version,
        content_hash: record.content_hash,
        record_fingerprint: canonicalFingerprint(tampered),
        sequence: 1
      };
    },
    read() { return rows.slice(); }
  };
  const layerStores = layerConfig({ session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } });
  const gateway = createMemoryGateway({ layerStores, sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter: makeAuditWriter() });
  const result = await gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } });
  assert.equal(result.decision, "RECONCILIATION_REQUIRED");
  assert.notEqual(result.decision, "ALLOW");
});

test("store cannot substitute trusted admission time even with a recomputed fingerprint", async () => {
  const rows = [];
  const store = {
    append(record, { idempotency_key }) {
      const tampered = { ...structuredClone(record), admitted_at: "2099-01-01T00:00:00.000Z" };
      rows.push(tampered);
      return {
        status: "COMMITTED",
        idempotency_key,
        memory_record_id: record.memory_record_id,
        version: record.version,
        content_hash: record.content_hash,
        record_fingerprint: canonicalFingerprint(tampered),
        sequence: 1
      };
    },
    read() { return rows.slice(); }
  };
  const layerStores = layerConfig({ session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } });
  const gateway = createMemoryGateway({ layerStores, sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter: makeAuditWriter() });

  const result = await gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } });

  assert.equal(result.decision, "RECONCILIATION_REQUIRED");
  assert.equal(result.reason, "UNVERIFIED_REPLAY_OR_TRUSTED_TIME_MISMATCH");
  assert.notEqual(result.decision, "ALLOW");
});

test("store receipt fields are snapshotted once and hostile receipts are contained", async () => {
  const store = makeStore();
  let sequenceReads = 0;
  const wrappedStore = {
    rows: store.rows,
    append(record, options) {
      const receipt = store.append(record, options);
      return {
        ...receipt,
        get sequence() { sequenceReads += 1; return sequenceReads === 1 ? 1 : 0; }
      };
    },
    read: store.read
  };
  const layerStores = layerConfig({ session: { store: wrappedStore, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } });
  const gateway = createMemoryGateway({ layerStores, sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter: makeAuditWriter() });
  const allowed = await gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } });
  assert.equal(allowed.decision, "ALLOW");
  assert.equal(allowed.append.sequence, 1);
  assert.equal(sequenceReads, 1);

  const throwingStore = {
    append(record, { idempotency_key }) {
      return new Proxy({ status: "COMMITTED", idempotency_key, memory_record_id: record.memory_record_id, version: record.version, content_hash: record.content_hash, record_fingerprint: canonicalFingerprint(record) }, {
        ownKeys() { throw new Error("hostile receipt"); }
      });
    },
    read() { return []; }
  };
  const hostileLayers = layerConfig({ session: { store: throwingStore, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } });
  const hostileGateway = createMemoryGateway({ layerStores: hostileLayers, sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter: makeAuditWriter() });
  const contained = await hostileGateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } });
  assert.equal(contained.decision, "RECONCILIATION_REQUIRED");
});

test("a failed terminal COMMITTED audit returns reconciliation-required after verified storage", async () => {
  const entries = [];
  const ledgerWriter = async (entry) => {
    entries.push(entry);
    if (entry.disposition === "COMMITTED") throw new Error("commit audit down");
  };
  const store = makeStore();
  const layerStores = layerConfig({ session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } });
  const gateway = createMemoryGateway({ layerStores, sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter });
  const result = await gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } });
  assert.equal(result.decision, "RECONCILIATION_REQUIRED");
  assert.equal(result.record_observed, true);
  assert.equal(result.audit_recorded, true);
  assert.deepEqual(entries.map((entry) => entry.disposition), ["ATTEMPTED", "COMMITTED", "RECONCILIATION_REQUIRED"]);
});

// --- Retrieval -------------------------------------------------------------

async function seed(gateway, layer, overrides, admission) {
  const result = await gateway.admit({ layer, record: sessionRecord(overrides), admission });
  assert.equal(result.decision, "ALLOW", `seed admit should ALLOW: ${result.code}`);
  return result;
}

test("retrieve returns layer+project scoped records, frozen and marked data_untrusted", async () => {
  const { gateway } = makeGateway();
  await seed(gateway, "session", { statement: "fact one" }, { producer: "agent-a" });
  await seed(gateway, "session", { statement: "fact two", project_id: "proj-2" }, { producer: "agent-a" });
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

test("retrieve denies DENY_CROSS_PROJECT when the requested project differs from the caller scope", async () => {
  const { gateway } = makeGateway();
  await seed(gateway, "session", {}, { producer: "agent-a" });
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

test("retrieve honestly filters TTL-expired records (computed, not stored, no pruning)", async () => {
  // Admit at T0 into the session layer (ttl 60s), then read at T0+61s.
  let clock = new Date("2026-07-20T10:00:00Z");
  const layerStores = layerConfig();
  const gateway = createMemoryGateway({ layerStores, sodRules: kernelSodRules, now: () => clock, ledgerWriter: makeAuditWriter() });
  await gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } });

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
