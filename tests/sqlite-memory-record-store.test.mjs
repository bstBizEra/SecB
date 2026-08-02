import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { canonicalFingerprint } from "../src/contracts/canonical-fingerprint.mjs";
import { checkPairwiseDistinct } from "../src/control/sod-rules.mjs";
import { createMemoryGateway } from "../src/services/memory-gateway-service.mjs";
import { createSqliteMemoryRecordStore, SqliteMemoryStoreError } from "../src/services/sqlite-memory-record-store.mjs";

const execFileAsync = promisify(execFile);
const FIXED_NOW = new Date("2026-07-20T10:00:00Z");
const STORE_MODULE_URL = new URL("../src/services/sqlite-memory-record-store.mjs", import.meta.url).href;
const GATEWAY_MODULE_URL = new URL("../src/services/memory-gateway-service.mjs", import.meta.url).href;

function databasePathFor(t) {
  const directory = mkdtempSync(join(tmpdir(), "secb-memory-store-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return join(directory, "memory.sqlite");
}

function gatewayRecord(overrides = {}) {
  const record = {
    memory_record_id: "mem-sqlite-1",
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
    statement: "durable store candidate",
    ...overrides
  };
  if (!Object.hasOwn(overrides, "content_hash")) {
    record.content_hash = canonicalFingerprint({ ...record, layer: "session" });
  }
  return record;
}

function storedRecord(overrides = {}) {
  return {
    ...gatewayRecord(),
    layer: "session",
    admitted_at: FIXED_NOW.toISOString(),
    ...overrides
  };
}

test("SQLite store atomically persists one idempotent identity across restart", (t) => {
  const databasePath = databasePathFor(t);
  const record = storedRecord();
  const store = createSqliteMemoryRecordStore({ databasePath });

  const first = store.append(record, { idempotency_key: "admit-1" });
  const replay = store.append(structuredClone(record), { idempotency_key: "admit-1" });
  assert.deepEqual(replay, first);
  assert.equal(store.read().length, 1);
  store.close();

  const restarted = createSqliteMemoryRecordStore({ databasePath });
  assert.deepEqual(restarted.read(), [record]);
  assert.deepEqual(restarted.append(record, { idempotency_key: "admit-1" }), first);
  assert.throws(
    () => restarted.append({ ...record, statement: "conflict" }, { idempotency_key: "admit-1" }),
    (error) => error instanceof SqliteMemoryStoreError && error.code === "IDEMPOTENCY_CONFLICT"
  );
  restarted.close();
});

test("SQLite read lease holds a writer fence through an asynchronous callback", async (t) => {
  const databasePath = databasePathFor(t);
  const record = storedRecord();
  const store = createSqliteMemoryRecordStore({ databasePath, busyTimeoutMs: 0 });
  const receipt = store.append(record, { idempotency_key: "admit-1" });
  const selector = {
    project_id: record.project_id,
    layer: record.layer,
    memory_record_id: record.memory_record_id,
    version: record.version,
    content_hash: record.content_hash,
    record_fingerprint: receipt.record_fingerprint
  };
  const completion = Object.freeze({ exact: true });

  const returned = await store.withReadLease(selector, async (leased) => {
    assert.deepEqual(leased, record);
    await Promise.resolve();
    const attacker = new DatabaseSync(databasePath);
    attacker.exec("PRAGMA busy_timeout = 0");
    assert.throws(
      () => attacker.exec("DELETE FROM memory_records"),
      (error) => error?.code === "ERR_SQLITE_ERROR" && /locked/i.test(error.message)
    );
    attacker.close();
    return completion;
  });

  assert.strictEqual(returned, completion);
  assert.deepEqual(store.read(), [record]);
  store.close();
});

test("an uncommitted process crash rolls back without deleting the durable record", (t) => {
  const databasePath = databasePathFor(t);
  const record = storedRecord();
  const store = createSqliteMemoryRecordStore({ databasePath });
  store.append(record, { idempotency_key: "admit-1" });
  store.close();

  const crashScript = `
    import { DatabaseSync } from "node:sqlite";
    const database = new DatabaseSync(${JSON.stringify(databasePath)});
    database.exec("BEGIN IMMEDIATE; DELETE FROM memory_admission_receipts; DELETE FROM memory_records");
    process.exit(23);
  `;
  assert.throws(
    () => execFileSync(process.execPath, ["--no-warnings", "--input-type=module", "--eval", crashScript]),
    (error) => error.status === 23
  );

  const restarted = createSqliteMemoryRecordStore({ databasePath });
  assert.deepEqual(restarted.read(), [record]);
  restarted.close();
});

test("parallel first appends converge on one durable row and one receipt", async (t) => {
  const databasePath = databasePathFor(t);
  const record = storedRecord();
  createSqliteMemoryRecordStore({ databasePath }).close();
  const appendScript = `
    import { createSqliteMemoryRecordStore } from ${JSON.stringify(STORE_MODULE_URL)};
    const store = createSqliteMemoryRecordStore({ databasePath: ${JSON.stringify(databasePath)}, busyTimeoutMs: 10000 });
    const receipt = store.append(${JSON.stringify(record)}, { idempotency_key: "admit-parallel" });
    store.close();
    process.stdout.write(JSON.stringify(receipt));
  `;

  const [left, right] = await Promise.all([
    execFileAsync(process.execPath, ["--no-warnings", "--input-type=module", "--eval", appendScript]),
    execFileAsync(process.execPath, ["--no-warnings", "--input-type=module", "--eval", appendScript])
  ]);
  assert.deepEqual(JSON.parse(left.stdout), JSON.parse(right.stdout));

  const store = createSqliteMemoryRecordStore({ databasePath });
  assert.deepEqual(store.read(), [record]);
  store.close();
});

test("parallel gateway first admissions both verify one durable identity", async (t) => {
  const databasePath = databasePathFor(t);
  createSqliteMemoryRecordStore({ databasePath }).close();
  const request = { layer: "session", record: gatewayRecord(), admission: { producer: "agent-a" } };
  const admissionScript = `
    import { createMemoryGateway } from ${JSON.stringify(GATEWAY_MODULE_URL)};
    import { createSqliteMemoryRecordStore } from ${JSON.stringify(STORE_MODULE_URL)};
    const store = createSqliteMemoryRecordStore({ databasePath: ${JSON.stringify(databasePath)}, busyTimeoutMs: 10000 });
    const gateway = createMemoryGateway({
      layerStores: { session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60000, sod: "producer-only" } } },
      sodRules: { checkPairwiseDistinct: () => ({ ok: true }) },
      now: () => new Date(${JSON.stringify(FIXED_NOW.toISOString())}),
      ledgerWriter: () => ({ audited: true })
    });
    const result = await gateway.admit(${JSON.stringify(request)});
    store.close();
    process.stdout.write(JSON.stringify({ decision: result.decision, code: result.code }));
  `;

  const [left, right] = await Promise.all([
    execFileAsync(process.execPath, ["--no-warnings", "--input-type=module", "--eval", admissionScript]),
    execFileAsync(process.execPath, ["--no-warnings", "--input-type=module", "--eval", admissionScript])
  ]);
  assert.deepEqual(JSON.parse(left.stdout), { decision: "ALLOW", code: "ADMITTED" });
  assert.deepEqual(JSON.parse(right.stdout), { decision: "ALLOW", code: "ADMITTED" });

  const store = createSqliteMemoryRecordStore({ databasePath });
  assert.equal(store.read().length, 1);
  store.close();
});

test("Memory gateway admits and replays through the durable adapter without duplicate rows", async (t) => {
  const databasePath = databasePathFor(t);
  const store = createSqliteMemoryRecordStore({ databasePath });
  const auditEntries = [];
  const gateway = createMemoryGateway({
    layerStores: {
      session: {
        store,
        admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" }
      }
    },
    sodRules: { checkPairwiseDistinct },
    now: () => FIXED_NOW,
    ledgerWriter(entry) {
      auditEntries.push(entry);
      return { audited: true };
    }
  });
  const request = { layer: "session", record: gatewayRecord(), admission: { producer: "agent-a" } };

  const first = await gateway.admit(request);
  const replay = await gateway.admit(structuredClone(request));

  assert.equal(first.decision, "ALLOW");
  assert.equal(replay.decision, "ALLOW");
  assert.deepEqual(replay.record, first.record);
  assert.equal(store.read().length, 1);
  assert.deepEqual(auditEntries.map((entry) => entry.disposition), ["ATTEMPTED", "COMMITTED", "ATTEMPTED", "COMMITTED"]);
  store.close();
});
