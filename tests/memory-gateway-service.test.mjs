// MOD-MEM Slice S1 — Memory gateway facade tests.
//
// Scope: fail-closed construction; the deny-by-default admission pipeline
// (shape -> clock -> layer -> classification ceiling -> admission SoD ->
// audit-first -> store append -> leased verification+terminal audit); scoped
// retrieval with cross-project denial,
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
import { createMemoryGateway as createMemoryGatewayImpl, MemoryGatewayConfigurationError } from "../src/services/memory-gateway-service.mjs";
import { validateContract } from "../src/contracts/contract-validator.mjs";
import { canonicalFingerprint } from "../src/contracts/canonical-fingerprint.mjs";
import { checkPairwiseDistinct } from "../src/control/sod-rules.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const FIXED_NOW = new Date("2026-07-20T10:00:00Z");
const TEST_CURSOR_MAC_KEY = Buffer.alloc(32, 0x53);

function createMemoryGateway(options) {
  const suppliedKey = options !== null && options !== undefined && Object.prototype.hasOwnProperty.call(options, "cursorMacKey");
  return createMemoryGatewayImpl({ ...(options ?? {}), cursorMacKey: suppliedKey ? options.cursorMacKey : TEST_CURSOR_MAC_KEY });
}

// Kernel SoD primitive, reused config-only (no wrapper behavior added).
const kernelSodRules = { checkPairwiseDistinct };

function withTestReadLease(store) {
  const read = store.read.bind(store);
  Object.defineProperty(store, "withReadLease", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: async (selector, callback) => {
      const rows = await read();
      const row = Array.isArray(rows)
        ? rows.find((candidate) =>
          candidate?.project_id === selector.project_id
          && candidate?.layer === selector.layer
          && candidate?.memory_record_id === selector.memory_record_id
          && candidate?.version === selector.version
          && candidate?.content_hash === selector.content_hash
        )
        : undefined;
      return callback(row ?? null);
    }
  });
  return store;
}

function makeStore() {
  const rows = [];
  const receipts = new Map();
  return withTestReadLease({
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
        created: true,
        sequence: rows.length
      };
      receipts.set(idempotency_key, receipt);
      return receipt;
    },
    read() {
      this.readCalls += 1;
      return rows.slice();
    }
  });
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

function makeGateway({ now = () => FIXED_NOW, ledgerWriter = makeAuditWriter(), layerStores = layerConfig(), replayResolver, timeouts } = {}) {
  const gateway = createMemoryGateway({ layerStores, sodRules: kernelSodRules, now, ledgerWriter, replayResolver, timeouts });
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
    access_policy: "project-members",
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
    () => createMemoryGateway({ layerStores: { session: { store: { append() {}, read() { return []; } }, admission: { classificationCeiling: "PUBLIC", ttlMs: 1, sod: "producer-only" } } }, sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter: () => {} }),
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
  assert.throws(
    () => createMemoryGateway({ layerStores: layerConfig(), sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter: () => {}, replayResolver: {} }),
    hasCode("INVALID_REPLAY_RESOLVER")
  );
  for (const cursorMacKey of [null, "public-key", new Uint8Array(31)]) {
    assert.throws(
      () => createMemoryGateway({ layerStores: layerConfig(), sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter: () => {}, cursorMacKey }),
      hasCode("INVALID_CURSOR_MAC_KEY")
    );
  }
  assert.throws(
    () => createMemoryGatewayImpl({ layerStores: layerConfig(), sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter: () => {} }),
    hasCode("INVALID_CURSOR_MAC_KEY")
  );
  for (const timeouts of [null, { audit_ms: 0 }, { replay_ms: 2_147_483_648 }, { rogue: 1 }]) {
    assert.throws(
      () => createMemoryGateway({ layerStores: layerConfig(), sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter: () => {}, timeouts }),
      hasCode("INVALID_TIMEOUTS")
    );
  }
  const reads = { audit: 0, replay: 0 };
  const timeoutSnapshot = {
    get audit_ms() { reads.audit += 1; return 25; },
    get replay_ms() { reads.replay += 1; return 30; }
  };
  createMemoryGateway({ layerStores: layerConfig(), sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter: () => {}, timeouts: timeoutSnapshot });
  assert.deepEqual(reads, { audit: 1, replay: 1 });
  assert.throws(
    () => createMemoryGateway({
      layerStores: layerConfig(),
      sodRules: kernelSodRules,
      now: () => FIXED_NOW,
      ledgerWriter: () => {},
      timeouts: { get audit_ms() { throw new Error("hostile timeout"); } }
    }),
    hasCode("INVALID_TIMEOUTS")
  );
});

test("the gateway surface is frozen and exposes only admit and retrieve", () => {
  const { gateway } = makeGateway();
  assert.ok(Object.isFrozen(gateway));
  assert.deepEqual(Object.keys(gateway).sort(), ["admit", "retrieve"]);
});

test("store port methods are snapshotted against post-construction replacement", async () => {
  const store = makeStore();
  const layerStores = layerConfig({ session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } });
  const gateway = createMemoryGateway({ layerStores, sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter: makeAuditWriter() });
  store.append = () => { throw new Error("replacement append must not be used"); };
  store.read = () => { throw new Error("replacement read must not be used"); };
  store.withReadLease = async () => ({ forged: true });

  const result = await gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } });

  assert.equal(result.decision, "ALLOW");
  assert.equal(store.rows.length, 1);
});

test("store and port accessors are each read exactly once during construction", async () => {
  const store = makeStore();
  const originals = {
    append: store.append.bind(store),
    read: store.read.bind(store),
    withReadLease: store.withReadLease.bind(store)
  };
  const reads = { store: 0, append: 0, read: 0, withReadLease: 0 };
  for (const method of ["append", "read", "withReadLease"]) {
    Object.defineProperty(store, method, {
      enumerable: true,
      configurable: true,
      get() {
        reads[method] += 1;
        if (reads[method] > 1) throw new Error(`${method} accessor was read more than once`);
        return originals[method];
      }
    });
  }
  const config = { admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } };
  Object.defineProperty(config, "store", {
    enumerable: true,
    get() {
      reads.store += 1;
      if (reads.store > 1) throw new Error("store accessor was read more than once");
      return store;
    }
  });

  const gateway = createMemoryGateway({
    layerStores: { session: config },
    sodRules: kernelSodRules,
    now: () => FIXED_NOW,
    ledgerWriter: makeAuditWriter()
  });
  const result = await gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } });

  assert.equal(result.decision, "ALLOW");
  assert.deepEqual(reads, { store: 1, append: 1, read: 1, withReadLease: 1 });
});

test("throwing store accessors fail as controlled configuration errors", () => {
  const hasControlledLayerCode = (error) => error instanceof MemoryGatewayConfigurationError && ["INVALID_LAYER_CONFIG", "INVALID_LAYER_STORE"].includes(error.code);
  for (const accessor of ["store", "append", "read", "withReadLease"]) {
    const store = makeStore();
    const config = { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } };
    Object.defineProperty(accessor === "store" ? config : store, accessor, {
      enumerable: true,
      configurable: true,
      get() { throw new Error(`hostile ${accessor} accessor`); }
    });
    assert.throws(
      () => createMemoryGateway({ layerStores: { session: config }, sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter: makeAuditWriter() }),
      hasControlledLayerCode
    );
  }
});

test("the complete layer and admission policy graph is snapshotted exactly once", async () => {
  const store = makeStore();
  const reads = { layer: 0, admission: 0, classificationCeiling: 0, ttlMs: 0, sod: 0 };
  const admission = {};
  const firstValues = { classificationCeiling: "PUBLIC", ttlMs: 60_000, sod: "producer-only" };
  const weakerValues = { classificationCeiling: "RESTRICTED", ttlMs: 600_000, sod: "producer-only" };
  for (const field of Object.keys(firstValues)) {
    Object.defineProperty(admission, field, {
      enumerable: true,
      get() {
        reads[field] += 1;
        return reads[field] === 1 ? firstValues[field] : weakerValues[field];
      }
    });
  }
  const config = { store };
  Object.defineProperty(config, "admission", {
    enumerable: true,
    get() {
      reads.admission += 1;
      if (reads.admission > 1) throw new Error("admission accessor reread");
      return admission;
    }
  });
  const layerStores = {};
  Object.defineProperty(layerStores, "session", {
    enumerable: true,
    get() {
      reads.layer += 1;
      if (reads.layer > 1) {
        return { store, admission: weakerValues };
      }
      return config;
    }
  });

  const gateway = createMemoryGateway({ layerStores, sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter: makeAuditWriter() });
  const result = await gateway.admit({
    layer: "session",
    record: sessionRecord({ classification: "RESTRICTED" }),
    admission: { producer: "agent-a" }
  });

  assert.equal(result.code, "DENY_CLASSIFICATION_CEILING");
  assert.deepEqual(reads, { layer: 1, admission: 1, classificationCeiling: 1, ttlMs: 1, sod: 1 });
  assert.equal(store.rows.length, 0);
});

test("hostile layer-map and admission accessors fail closed without policy bypass", () => {
  const options = { sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter: makeAuditWriter() };
  const symbolLayers = { session: layerConfig().session, [Symbol("hidden")]: layerConfig().project };
  assert.throws(
    () => createMemoryGateway({ ...options, layerStores: symbolLayers }),
    (error) => error instanceof MemoryGatewayConfigurationError && error.code === "INVALID_LAYER_STORES"
  );
  const hostileMap = new Proxy({}, { ownKeys() { throw new Error("ownKeys trap"); } });
  assert.throws(
    () => createMemoryGateway({ ...options, layerStores: hostileMap }),
    (error) => error instanceof MemoryGatewayConfigurationError && error.code === "INVALID_LAYER_STORES"
  );
  for (const field of ["admission", "classificationCeiling", "ttlMs", "sod"]) {
    const store = makeStore();
    const admission = { classificationCeiling: "PUBLIC", ttlMs: 60_000, sod: "producer-only" };
    const config = { store, admission };
    Object.defineProperty(field === "admission" ? config : admission, field, {
      enumerable: true,
      configurable: true,
      get() { throw new Error(`hostile ${field} accessor`); }
    });
    assert.throws(
      () => createMemoryGateway({ ...options, layerStores: { session: config } }),
      (error) => error instanceof MemoryGatewayConfigurationError && error.code === "INVALID_LAYER_CONFIG"
    );
  }
});

test("the SoD collaborator method is captured once against later replacement", async () => {
  let methodReads = 0;
  const sodRules = {};
  Object.defineProperty(sodRules, "checkPairwiseDistinct", {
    enumerable: true,
    configurable: true,
    get() {
      methodReads += 1;
      if (methodReads > 1) throw new Error("SoD method accessor reread");
      return () => ({ ok: false, code: "DENY_ADMISSION_SOD", message: "captured policy denial" });
    }
  });
  const gateway = createMemoryGateway({ layerStores: layerConfig(), sodRules, now: () => FIXED_NOW, ledgerWriter: makeAuditWriter() });
  Object.defineProperty(sodRules, "checkPairwiseDistinct", { configurable: true, value: () => ({ ok: true }) });

  const result = await gateway.admit({
    layer: "project",
    record: sessionRecord({ classification: "RESTRICTED" }, "project"),
    admission: { producer: "agent-a", approver: "agent-b" }
  });

  assert.equal(result.code, "DENY_ADMISSION_SOD");
  assert.equal(methodReads, 1);
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

test("a non-settling attempted audit times out before any store mutation", async () => {
  const store = makeStore();
  const gateway = createMemoryGateway({
    layerStores: layerConfig({ session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } }),
    sodRules: kernelSodRules,
    now: () => FIXED_NOW,
    ledgerWriter: () => new Promise(() => {}),
    timeouts: { audit_ms: 20, replay_ms: 20 }
  });
  const startedAt = Date.now();

  const result = await gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } });

  assert.equal(result.code, "DENY_AUDIT_UNAVAILABLE");
  assert.ok(Date.now() - startedAt < 500, "audit timeout must return promptly");
  assert.equal(store.rows.length, 0);
});

test("audit-first: the audit entry is written strictly before the store append", async () => {
  const order = [];
  const store = makeStore();
  const wrappedStore = withTestReadLease({
    rows: store.rows,
    append(record, options) { order.push("store"); return store.append(record, options); },
    read: store.read
  });
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
  const store = withTestReadLease({ append() { throw new Error("disk full"); }, read() { return []; } });
  const layerStores = layerConfig({ session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } });
  const ledgerWriter = makeAuditWriter();
  const gateway = createMemoryGateway({ layerStores, sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter });
  const result = await gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } });
  assert.equal(result.code, "ADMISSION_RECONCILIATION_REQUIRED");
  assert.equal(result.record_observed, false);
  assert.deepEqual(ledgerWriter.entries.map((entry) => entry.disposition), ["ATTEMPTED", "RECONCILIATION_REQUIRED"]);
});

test("admit awaits an asynchronous store and records reconciliation, never a false FAILED", async () => {
  const store = withTestReadLease({ async append() { throw new Error("async disk full"); }, read() { return []; } });
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
  const store = withTestReadLease({ async append() { throw new Error("disk full"); }, read() { return []; } });
  const layerStores = layerConfig({ session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } });
  const gateway = createMemoryGateway({ layerStores, sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter });
  const result = await gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } });
  assert.equal(result.code, "ADMISSION_RECONCILIATION_REQUIRED");
  assert.equal(result.audit_recorded, false);
  assert.deepEqual(entries.map((entry) => entry.disposition), ["ATTEMPTED", "RECONCILIATION_REQUIRED"]);
});

test("mutate-then-reject is reconciliation-required and reports the observed record", async () => {
  const rows = [];
  const store = withTestReadLease({
    async append(record) { rows.push(record); throw new Error("ack lost"); },
    read() { return rows.slice(); }
  });
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
  ].map(withTestReadLease);
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
  assert.equal(replay.reason, "STORE_LEASE_RECORD_MISSING_OR_CONFLICT");
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
  assert.equal(replay.reason, "STORE_LEASE_RECORD_MISSING_OR_CONFLICT");
  assert.equal(store.appendCalls, 1);
  assert.notEqual(replay.decision, "ALLOW");
});

test("upsert-style store cannot heal deleted or tampered state during replay", async () => {
  const rows = [];
  let appendCalls = 0;
  const store = withTestReadLease({
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
        created: true,
        sequence: appendCalls
      };
    },
    read() { return rows.slice(); }
  });
  const layerStores = layerConfig({ session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } });
  const request = { layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } };

  const deletionGateway = createMemoryGateway({ layerStores, sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter: makeAuditWriter() });
  assert.equal((await deletionGateway.admit(request)).decision, "ALLOW");
  rows.splice(0);
  const deletedReplay = await deletionGateway.admit(request);
  assert.equal(deletedReplay.decision, "RECONCILIATION_REQUIRED");
  assert.equal(deletedReplay.reason, "STORE_LEASE_RECORD_MISSING_OR_CONFLICT");
  assert.equal(appendCalls, 1, "replay never gave the upsert store a chance to recreate the row");
  assert.equal(rows.length, 0);

  const tamperGateway = createMemoryGateway({ layerStores, sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter: makeAuditWriter() });
  assert.equal((await tamperGateway.admit(request)).decision, "ALLOW");
  rows[0] = { ...rows[0], statement: "tampered before replay" };
  const tamperedReplay = await tamperGateway.admit(request);
  assert.equal(tamperedReplay.decision, "RECONCILIATION_REQUIRED");
  assert.equal(tamperedReplay.reason, "STORE_LEASE_RECORD_MISSING_OR_CONFLICT");
  assert.equal(appendCalls, 2, "only the second gateway's first admission appended");
  assert.equal(rows[0].statement, "tampered before replay", "replay did not overwrite the evidence of tampering");
});

test("read lease blocks concurrent delete and tamper through terminal audit", async () => {
  const rows = [];
  const receipts = new Map();
  let leaseHeld = false;
  let blockedDeletes = 0;
  let blockedTampers = 0;
  const store = {
    append(record, { idempotency_key }) {
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
        created: true,
        sequence: rows.length
      };
      receipts.set(idempotency_key, receipt);
      return receipt;
    },
    read() { return rows.slice(); },
    async withReadLease(selector, callback) {
      assert.equal(leaseHeld, false, "test store permits only one lease owner");
      assert.ok(Object.isFrozen(selector));
      leaseHeld = true;
      try {
        const row = rows.find((candidate) =>
          candidate.project_id === selector.project_id
          && candidate.layer === selector.layer
          && candidate.memory_record_id === selector.memory_record_id
          && candidate.version === selector.version
          && candidate.content_hash === selector.content_hash
        );
        return await callback(row ?? null);
      } finally {
        leaseHeld = false;
      }
    },
    tryDelete() {
      if (leaseHeld) { blockedDeletes += 1; return false; }
      rows.splice(0);
      return true;
    },
    tryTamper() {
      if (leaseHeld) { blockedTampers += 1; return false; }
      if (rows[0]) rows[0] = { ...rows[0], statement: "concurrent tamper" };
      return true;
    }
  };
  const ledgerWriter = makeAuditWriter();
  const baseWriter = ledgerWriter.bind(null);
  const racingWriter = async (entry) => {
    baseWriter(entry);
    if (entry.disposition === "COMMITTED") {
      assert.equal(store.tryDelete(), false, "delete must be denied while terminal audit is inside the lease");
      assert.equal(store.tryTamper(), false, "tamper must be denied while terminal audit is inside the lease");
      await Promise.resolve();
      assert.equal(leaseHeld, true, "lease remains held across an asynchronous audit boundary");
    }
  };
  racingWriter.entries = ledgerWriter.entries;
  const layerStores = layerConfig({ session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } });
  const gateway = createMemoryGateway({ layerStores, sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter: racingWriter });
  const request = { layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } };

  const first = await gateway.admit(request);
  const replay = await gateway.admit(request);

  assert.equal(first.decision, "ALLOW");
  assert.equal(replay.decision, "ALLOW");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].statement, "user prefers dark mode");
  assert.equal(blockedDeletes, 2);
  assert.equal(blockedTampers, 2);
});

test("read-lease failure or forged callback handoff can never produce ALLOW", async () => {
  const cases = [
    {
      reason: "STORE_READ_LEASE_UNAVAILABLE",
      withReadLease: async () => { throw new Error("lease backend down"); }
    },
    {
      reason: "STORE_READ_LEASE_PROTOCOL_INVALID",
      withReadLease: async () => undefined
    },
    {
      reason: "STORE_READ_LEASE_PROTOCOL_INVALID",
      withReadLease: async (selector, callback, rows) => ({ ...(await callback(rows[0])) })
    },
    {
      reason: "STORE_READ_LEASE_UNAVAILABLE",
      withReadLease: async (selector, callback, rows) => {
        await callback(rows[0]);
        throw new Error("lease release crashed");
      }
    },
    {
      reason: "STORE_READ_LEASE_UNAVAILABLE",
      withReadLease: async (selector, callback, rows) => {
        const first = await callback(rows[0]);
        await callback(rows[0]);
        return first;
      }
    }
  ];
  for (const testCase of cases) {
    const base = makeStore();
    base.withReadLease = async (selector, callback) => testCase.withReadLease(selector, callback, base.rows);
    const layerStores = layerConfig({ session: { store: base, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } });
    const result = await createMemoryGateway({ layerStores, sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter: makeAuditWriter() })
      .admit({ layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } });
    assert.equal(result.decision, "RECONCILIATION_REQUIRED");
    assert.equal(result.reason, testCase.reason);
  }
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
  const store = withTestReadLease({
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
        created: true,
        sequence: 1
      };
    },
    read() { return rows.slice(); }
  });
  const layerStores = layerConfig({ session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } });
  const gateway = createMemoryGateway({ layerStores, sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter: makeAuditWriter() });
  const result = await gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } });
  assert.equal(result.decision, "RECONCILIATION_REQUIRED");
  assert.notEqual(result.decision, "ALLOW");
});

test("store cannot substitute trusted admission time even with a recomputed fingerprint", async () => {
  const rows = [];
  const store = withTestReadLease({
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
        created: true,
        sequence: 1
      };
    },
    read() { return rows.slice(); }
  });
  const layerStores = layerConfig({ session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } });
  const gateway = createMemoryGateway({ layerStores, sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter: makeAuditWriter() });

  const result = await gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } });

  assert.equal(result.decision, "RECONCILIATION_REQUIRED");
  assert.equal(result.reason, "UNVERIFIED_REPLAY_OR_TRUSTED_TIME_MISMATCH");
  assert.notEqual(result.decision, "ALLOW");
});

test("created false cannot waive trusted time without an independent committed replay anchor", async () => {
  const rows = [];
  const store = withTestReadLease({
    append(record, { idempotency_key }) {
      const substituted = { ...structuredClone(record), admitted_at: "2099-01-01T00:00:00.000Z" };
      rows.push(substituted);
      return {
        status: "COMMITTED",
        idempotency_key,
        memory_record_id: record.memory_record_id,
        version: record.version,
        content_hash: record.content_hash,
        record_fingerprint: canonicalFingerprint(substituted),
        created: false,
        sequence: 1
      };
    },
    read() { return rows.slice(); }
  });
  const gateway = createMemoryGateway({
    layerStores: layerConfig({ session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } }),
    sodRules: kernelSodRules,
    now: () => FIXED_NOW,
    ledgerWriter: makeAuditWriter()
  });

  const result = await gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } });

  assert.equal(result.decision, "RECONCILIATION_REQUIRED");
  assert.equal(result.reason, "DURABLE_REPLAY_UNVERIFIED");
});

test("a non-settling replay resolver is bounded before the store lease", async () => {
  const rows = [];
  let leaseCalls = 0;
  const store = withTestReadLease({
    append(record, { idempotency_key }) {
      rows.push(record);
      return {
        status: "COMMITTED",
        idempotency_key,
        memory_record_id: record.memory_record_id,
        version: record.version,
        content_hash: record.content_hash,
        record_fingerprint: canonicalFingerprint(record),
        created: false,
        sequence: 1
      };
    },
    read() { return rows.slice(); }
  });
  const originalLease = store.withReadLease.bind(store);
  store.withReadLease = async (...args) => { leaseCalls += 1; return originalLease(...args); };
  const gateway = createMemoryGateway({
    layerStores: layerConfig({ session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } }),
    sodRules: kernelSodRules,
    now: () => FIXED_NOW,
    ledgerWriter: makeAuditWriter(),
    replayResolver: () => new Promise(() => {}),
    timeouts: { audit_ms: 20, replay_ms: 20 }
  });

  const result = await gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } });

  assert.equal(result.reason, "DURABLE_REPLAY_UNVERIFIED");
  assert.equal(leaseCalls, 0, "resolver timeout occurs before acquiring a store lease");
});

test("store receipt fields are snapshotted once and hostile receipts are contained", async () => {
  const store = makeStore();
  let sequenceReads = 0;
  const wrappedStore = withTestReadLease({
    rows: store.rows,
    append(record, options) {
      const receipt = store.append(record, options);
      return {
        ...receipt,
        get sequence() { sequenceReads += 1; return sequenceReads === 1 ? 1 : 0; }
      };
    },
    read: store.read
  });
  const layerStores = layerConfig({ session: { store: wrappedStore, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } });
  const gateway = createMemoryGateway({ layerStores, sodRules: kernelSodRules, now: () => FIXED_NOW, ledgerWriter: makeAuditWriter() });
  const allowed = await gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } });
  assert.equal(allowed.decision, "ALLOW");
  assert.equal(allowed.append.sequence, 1);
  assert.equal(sequenceReads, 1);

  const throwingStore = withTestReadLease({
    append(record, { idempotency_key }) {
      return new Proxy({ status: "COMMITTED", idempotency_key, memory_record_id: record.memory_record_id, version: record.version, content_hash: record.content_hash, record_fingerprint: canonicalFingerprint(record) }, {
        ownKeys() { throw new Error("hostile receipt"); }
      });
    },
    read() { return []; }
  });
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

test("a forged atomic-outbox receipt cannot waive the independent terminal audit", async () => {
  const store = makeStore();
  store.appendWithOutbox = function appendWithOutbox(record, options) {
    const receipt = this.append(record, options);
    const event = options.outbox_entry_factory(record, receipt);
    return {
      receipt,
      outbox: {
        outbox_id: event.outbox_id,
        event_fingerprint: canonicalFingerprint(event),
        delivery_status: "PENDING",
        delivery_attempts: 0,
        delivered_at: null,
        event
      }
    };
  };
  const entries = [];
  const gateway = createMemoryGateway({
    layerStores: layerConfig({ session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } }),
    sodRules: kernelSodRules,
    now: () => FIXED_NOW,
    ledgerWriter(entry) {
      entries.push(entry);
      if (entry.disposition === "COMMITTED") throw new Error("independent terminal audit unavailable");
      return { audited: true };
    }
  });

  const result = await gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } });

  assert.equal(result.decision, "RECONCILIATION_REQUIRED");
  assert.equal(result.reason, "COMMIT_AUDIT_UNAVAILABLE");
  assert.deepEqual(entries.map((entry) => entry.disposition), ["ATTEMPTED", "COMMITTED", "RECONCILIATION_REQUIRED"]);
});

test("a non-settling terminal audit times out and releases the store lease", async () => {
  let leaseHeld = false;
  const base = makeStore();
  const originalLease = base.withReadLease.bind(base);
  base.withReadLease = async (selector, callback) => {
    leaseHeld = true;
    try { return await originalLease(selector, callback); } finally { leaseHeld = false; }
  };
  const gateway = createMemoryGateway({
    layerStores: layerConfig({ session: { store: base, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } }),
    sodRules: kernelSodRules,
    now: () => FIXED_NOW,
    ledgerWriter: (entry) => entry.disposition === "COMMITTED" ? new Promise(() => {}) : undefined,
    timeouts: { audit_ms: 20, replay_ms: 20 }
  });
  const watchdog = Symbol("aggregate-load watchdog");
  let watchdogHandle;
  const watchdogPromise = new Promise((resolveWatchdog) => {
    watchdogHandle = setTimeout(() => resolveWatchdog(watchdog), 500);
  });
  const result = await Promise.race([
    gateway.admit({ layer: "session", record: sessionRecord(), admission: { producer: "agent-a" } }),
    watchdogPromise
  ]).finally(() => clearTimeout(watchdogHandle));

  assert.notEqual(result, watchdog, "the configured dependency timeout must settle before the longer event-loop watchdog");
  assert.equal(result.decision, "RECONCILIATION_REQUIRED");
  assert.equal(result.reason, "COMMIT_AUDIT_UNAVAILABLE");
  assert.equal(leaseHeld, false);
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
  assert.equal(result.next_cursor, null);
});

test("retrieve uses the bounded scoped-read port and carries an opaque cursor", () => {
  const store = makeStore();
  store.read = () => { throw new Error("unbounded read must not be called"); };
  const scopedQueries = [];
  const firstRecord = {
    ...sessionRecord({ memory_record_id: "mem-page-1", statement: "page one" }),
    layer: "session",
    admitted_at: FIXED_NOW.toISOString()
  };
  store.readScoped = (query) => {
    scopedQueries.push(structuredClone(query));
    return query.after === null
      ? { records: [firstRecord], has_more: true }
      : { records: [], has_more: false };
  };
  const gateway = createMemoryGateway({
    layerStores: { session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } },
    sodRules: kernelSodRules,
    now: () => FIXED_NOW,
    ledgerWriter: makeAuditWriter()
  });

  const first = gateway.retrieve({
    layer: "session",
    project_id: "proj-1",
    scope_project_id: "proj-1",
    limit: 1
  });
  assert.equal(first.decision, "ALLOW");
  assert.equal(first.records.length, 1);
  assert.match(first.next_cursor, /^[A-Za-z0-9_-]+$/);
  const decodedCursor = JSON.parse(Buffer.from(first.next_cursor, "base64url").toString("utf8"));
  assert.equal(decodedCursor.scope_hash, canonicalFingerprint({ project_id: "proj-1", layer: "session" }));
  assert.equal(decodedCursor.memory_record_id_hash, canonicalFingerprint({ memory_record_id: firstRecord.memory_record_id }));
  assert.equal(Object.prototype.hasOwnProperty.call(decodedCursor, "sequence"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(decodedCursor, "project_id"), false);

  const second = gateway.retrieve({
    layer: "session",
    project_id: "proj-1",
    scope_project_id: "proj-1",
    limit: 1,
    cursor: first.next_cursor
  });
  assert.equal(second.decision, "ALLOW");
  assert.equal(second.records.length, 0);
  assert.equal(second.next_cursor, null);
  assert.deepEqual(scopedQueries, [
    { project_id: "proj-1", layer: "session", limit: 1, after: null },
    {
      project_id: "proj-1",
      layer: "session",
      limit: 1,
      after: {
        memory_record_id_hash: canonicalFingerprint({ memory_record_id: firstRecord.memory_record_id }),
        version: firstRecord.version,
        content_hash: firstRecord.content_hash
      }
    }
  ]);
});

test("retrieve defaults to 100, caps at 1000, and denies malformed cursors", () => {
  const store = makeStore();
  const limits = [];
  store.readScoped = (query) => {
    limits.push(query.limit);
    return { records: [], has_more: false };
  };
  const gateway = createMemoryGateway({
    layerStores: { session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } },
    sodRules: kernelSodRules,
    now: () => FIXED_NOW,
    ledgerWriter: makeAuditWriter()
  });
  const base = { layer: "session", project_id: "proj-1", scope_project_id: "proj-1" };
  assert.equal(gateway.retrieve(base).decision, "ALLOW");
  assert.equal(gateway.retrieve({ ...base, limit: 1000 }).decision, "ALLOW");
  assert.deepEqual(limits, [100, 1000]);
  for (const query of [
    { ...base, limit: 0 },
    { ...base, limit: 1001 },
    { ...base, cursor: "0" },
    { ...base, cursor: "not-a-cursor" }
  ]) assert.equal(gateway.retrieve(query).code, "DENY_MALFORMED_REQUEST");
});

test("retrieve contains malformed or hostile scoped pages as store-unavailable denial", () => {
  const base = { layer: "session", project_id: "proj-1", scope_project_id: "proj-1" };
  for (const readScoped of [
    () => ({ records: [], has_more: true }),
    () => ({ records: new Array(101).fill({}), has_more: false }),
    () => ({ records: [{ get project_id() { throw new Error("hostile row"); } }], has_more: false })
  ]) {
    const store = makeStore();
    store.readScoped = readScoped;
    const gateway = createMemoryGateway({
      layerStores: { session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } },
      sodRules: kernelSodRules,
      now: () => FIXED_NOW,
      ledgerWriter: makeAuditWriter()
    });
    assert.equal(gateway.retrieve(base).code, "DENY_STORE_UNAVAILABLE");
  }
});

test("retrieve snapshots a value-varying scoped row once before scope checks and output", () => {
  const row = {
    ...sessionRecord({ memory_record_id: "mem-snapshot-once", statement: "single snapshot" }),
    layer: "session",
    admitted_at: FIXED_NOW.toISOString()
  };
  let projectReads = 0;
  Object.defineProperty(row, "project_id", {
    enumerable: true,
    configurable: true,
    get() {
      projectReads += 1;
      return projectReads === 1 ? "proj-1" : "proj-other";
    }
  });
  const store = makeStore();
  store.readScoped = () => ({ records: [row], has_more: false });
  const gateway = createMemoryGateway({
    layerStores: { session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } },
    sodRules: kernelSodRules,
    now: () => FIXED_NOW,
    ledgerWriter: makeAuditWriter()
  });
  const result = gateway.retrieve({ layer: "session", project_id: "proj-1", scope_project_id: "proj-1" });
  assert.equal(result.decision, "ALLOW");
  assert.equal(result.records[0].record.project_id, "proj-1");
  assert.equal(projectReads, 1);
});

test("retrieve fails closed on scoped-port contamination", () => {
  const store = makeStore();
  store.readScoped = () => ({
    records: [{
      ...sessionRecord({ memory_record_id: "mem-foreign", project_id: "proj-other" }),
      layer: "session",
      admitted_at: FIXED_NOW.toISOString()
    }],
    has_more: false
  });
  const gateway = createMemoryGateway({
    layerStores: { session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } },
    sodRules: kernelSodRules,
    now: () => FIXED_NOW,
    ledgerWriter: makeAuditWriter()
  });
  assert.equal(
    gateway.retrieve({ layer: "session", project_id: "proj-1", scope_project_id: "proj-1" }).code,
    "DENY_STORE_UNAVAILABLE"
  );
});

test("retrieve cursor is integrity-bound, scope-bound, and rejects non-progressing pages", () => {
  const firstRecord = {
    ...sessionRecord({ memory_record_id: "mem-cursor-anchor", statement: "cursor anchor" }),
    layer: "session",
    admitted_at: FIXED_NOW.toISOString()
  };
  const store = makeStore();
  let repeatTerminalAnchor = false;
  store.readScoped = (query) => query.after === null || repeatTerminalAnchor
    ? { records: [firstRecord], has_more: !repeatTerminalAnchor }
    : { records: [], has_more: false };
  const cursorMacKey = Buffer.alloc(32, 0x41);
  const gateway = createMemoryGateway({
    layerStores: { session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } },
    sodRules: kernelSodRules,
    now: () => FIXED_NOW,
    ledgerWriter: makeAuditWriter(),
    cursorMacKey
  });
  const base = { layer: "session", project_id: "proj-1", scope_project_id: "proj-1", limit: 1 };
  const first = gateway.retrieve(base);
  assert.equal(first.decision, "ALLOW");
  assert.notEqual(first.next_cursor, null);
  cursorMacKey.fill(0); // the gateway must retain its construction-time key snapshot

  const finalCharacter = first.next_cursor.at(-1);
  const tampered = `${first.next_cursor.slice(0, -1)}${finalCharacter === "A" ? "B" : "A"}`;
  assert.equal(gateway.retrieve({ ...base, cursor: tampered }).code, "DENY_MALFORMED_REQUEST");
  const forgedEnvelope = JSON.parse(Buffer.from(first.next_cursor, "base64url").toString("utf8"));
  forgedEnvelope.memory_record_id_hash = "f".repeat(64);
  forgedEnvelope.mac = canonicalFingerprint({ forged: true });
  const forged = Buffer.from(JSON.stringify(forgedEnvelope), "utf8").toString("base64url");
  assert.equal(gateway.retrieve({ ...base, cursor: forged }).code, "DENY_MALFORMED_REQUEST");
  assert.equal(gateway.retrieve({ ...base, project_id: "proj-2", scope_project_id: "proj-2", cursor: first.next_cursor }).code, "DENY_MALFORMED_REQUEST");
  assert.equal(gateway.retrieve({ ...base, cursor: "A".repeat(2049) }).code, "DENY_MALFORMED_REQUEST");

  repeatTerminalAnchor = true;
  assert.equal(gateway.retrieve({ ...base, cursor: first.next_cursor }).code, "DENY_STORE_UNAVAILABLE");
});

test("retrieve snapshots every hostile query field exactly once before authorization", () => {
  const store = makeStore();
  const row = { ...sessionRecord({ memory_record_id: "mem-query-snapshot" }), layer: "session", admitted_at: FIXED_NOW.toISOString() };
  const storeQueries = [];
  store.readScoped = (query) => {
    storeQueries.push(query);
    return query.after === null && query.project_id === "proj-1"
      ? { records: [row], has_more: true }
      : { records: [], has_more: false };
  };
  const gateway = createMemoryGateway({
    layerStores: { session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } },
    sodRules: kernelSodRules,
    now: () => FIXED_NOW,
    ledgerWriter: makeAuditWriter()
  });
  const first = gateway.retrieve({ layer: "session", project_id: "proj-1", scope_project_id: "proj-1", limit: 1 });
  assert.equal(first.decision, "ALLOW");
  const reads = new Map();
  const query = {};
  for (const [key, value] of Object.entries({ layer: "session", project_id: "proj-1", scope_project_id: "proj-1", limit: 1, cursor: first.next_cursor })) {
    Object.defineProperty(query, key, {
      enumerable: true,
      get() {
        reads.set(key, (reads.get(key) ?? 0) + 1);
        return key === "project_id" && reads.get(key) > 1 ? "proj-other" : value;
      }
    });
  }
  const result = gateway.retrieve(query);
  assert.equal(result.decision, "ALLOW");
  assert.equal(result.records.length, 0);
  assert.equal(storeQueries.at(-1).project_id, "proj-1");
  assert.deepEqual(Object.fromEntries(reads), { layer: 1, project_id: 1, scope_project_id: 1, limit: 1, cursor: 1 });
  const hostile = new Proxy({}, { ownKeys() { throw new Error("hostile query"); } });
  assert.equal(gateway.retrieve(hostile).code, "DENY_MALFORMED_REQUEST");
});

test("cursor encoding stays bounded for a valid oversized memory record id", () => {
  const store = makeStore();
  const longIdRecord = { ...sessionRecord({ memory_record_id: "m".repeat(1_800) }), layer: "session", admitted_at: FIXED_NOW.toISOString() };
  store.readScoped = ({ after }) => after === null
    ? { records: [longIdRecord], has_more: true }
    : { records: [], has_more: false };
  const gateway = createMemoryGateway({
    layerStores: { session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } },
    sodRules: kernelSodRules,
    now: () => FIXED_NOW,
    ledgerWriter: makeAuditWriter()
  });
  const query = { layer: "session", project_id: "proj-1", scope_project_id: "proj-1", limit: 1 };
  const first = gateway.retrieve(query);
  assert.equal(first.decision, "ALLOW");
  assert.ok(first.next_cursor.length < 2_048);
  assert.equal(gateway.retrieve({ ...query, cursor: first.next_cursor }).decision, "ALLOW");
});

test("legacy retrieval also snapshots a value-varying row once", () => {
  const row = {
    ...sessionRecord({ memory_record_id: "mem-legacy-snapshot", statement: "legacy single snapshot" }),
    layer: "session",
    admitted_at: FIXED_NOW.toISOString()
  };
  let projectReads = 0;
  Object.defineProperty(row, "project_id", {
    enumerable: true,
    configurable: true,
    get() {
      projectReads += 1;
      return projectReads === 1 ? "proj-1" : "proj-other";
    }
  });
  const store = makeStore();
  store.rows.push(row);
  const gateway = createMemoryGateway({
    layerStores: { session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } },
    sodRules: kernelSodRules,
    now: () => FIXED_NOW,
    ledgerWriter: makeAuditWriter()
  });
  const result = gateway.retrieve({ layer: "session", project_id: "proj-1", scope_project_id: "proj-1" });
  assert.equal(result.decision, "ALLOW");
  assert.equal(result.records[0].record.project_id, "proj-1");
  assert.equal(projectReads, 1);
});

test("legacy retrieval rejects an ambiguous duplicate cursor anchor", () => {
  const duplicate = {
    ...sessionRecord({ memory_record_id: "mem-legacy-duplicate", statement: "duplicate anchor" }),
    layer: "session",
    admitted_at: FIXED_NOW.toISOString()
  };
  const store = makeStore();
  store.rows.push(duplicate, structuredClone(duplicate));
  const gateway = createMemoryGateway({
    layerStores: { session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } },
    sodRules: kernelSodRules,
    now: () => FIXED_NOW,
    ledgerWriter: makeAuditWriter()
  });
  const query = { layer: "session", project_id: "proj-1", scope_project_id: "proj-1", limit: 1 };
  const first = gateway.retrieve(query);
  assert.equal(first.decision, "ALLOW");
  assert.notEqual(first.next_cursor, null);
  assert.equal(gateway.retrieve({ ...query, cursor: first.next_cursor }).code, "DENY_STORE_UNAVAILABLE");
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
