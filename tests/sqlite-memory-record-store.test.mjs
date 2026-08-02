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

function withoutCreated(receipt) {
  const { created, ...stable } = receipt;
  return stable;
}

function makeReplayLedger() {
  const anchors = new Map();
  return {
    writer(entry) {
      if (entry.disposition === "COMMITTED") {
        anchors.set(entry.idempotency_key, Object.freeze({
          status: "COMMITTED",
          idempotency_key: entry.idempotency_key,
          project_id: entry.project_id,
          layer: entry.layer,
          memory_record_id: entry.memory_record_id,
          version: entry.version,
          content_hash: entry.content_hash,
          admitted_at: entry.admitted_at
        }));
      }
      return { audited: true };
    },
    resolver({ idempotency_key: idempotencyKey }) {
      return anchors.get(idempotencyKey) ?? null;
    }
  };
}

test("optional adapter fails with a controlled code when node:sqlite is disabled", async () => {
  const probe = `
    import { createSqliteMemoryRecordStore } from ${JSON.stringify(STORE_MODULE_URL)};
    try {
      createSqliteMemoryRecordStore({ databasePath: ":memory:" });
      process.stdout.write("UNEXPECTED_AVAILABLE");
    } catch (error) {
      process.stdout.write(error.code ?? "NO_CODE");
    }
  `;
  const { stdout } = await execFileAsync(process.execPath, ["--no-warnings", "--no-experimental-sqlite", "--input-type=module", "--eval", probe]);
  assert.equal(stdout, "SQLITE_UNAVAILABLE");
});

test("SQLite store atomically persists one idempotent identity across restart", async (t) => {
  const databasePath = databasePathFor(t);
  const record = storedRecord();
  const store = createSqliteMemoryRecordStore({ databasePath });

  const first = await store.append(record, { idempotency_key: "admit-1" });
  const replay = await store.append(structuredClone(record), { idempotency_key: "admit-1" });
  assert.equal(first.created, true);
  assert.equal(replay.created, false);
  assert.deepEqual(withoutCreated(replay), withoutCreated(first));
  assert.equal(store.read().length, 1);
  store.close();

  const restarted = createSqliteMemoryRecordStore({ databasePath });
  assert.deepEqual(restarted.read(), [record]);
  const restartedReplay = await restarted.append(record, { idempotency_key: "admit-1" });
  assert.equal(restartedReplay.created, false);
  assert.deepEqual(withoutCreated(restartedReplay), withoutCreated(first));
  await assert.rejects(
    restarted.append({ ...record, statement: "conflict" }, { idempotency_key: "admit-1" }),
    (error) => error instanceof SqliteMemoryStoreError && error.code === "IDEMPOTENCY_CONFLICT"
  );
  restarted.close();
});

test("SQLite read lease holds a writer fence through an asynchronous callback", async (t) => {
  const databasePath = databasePathFor(t);
  const record = storedRecord();
  const store = createSqliteMemoryRecordStore({ databasePath, busyTimeoutMs: 0 });
  const receipt = await store.append(record, { idempotency_key: "admit-1" });
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

test("read rejects raw JSON tampering before returning poisoned memory", async (t) => {
  const databasePath = databasePathFor(t);
  const record = storedRecord();
  const store = createSqliteMemoryRecordStore({ databasePath });
  await store.append(record, { idempotency_key: "admit-1" });
  const attacker = new DatabaseSync(databasePath);
  attacker.prepare("UPDATE memory_records SET record_json = ?").run(JSON.stringify({ ...record, statement: "poisoned" }));
  attacker.close();

  assert.throws(
    () => store.read(),
    (error) => error instanceof SqliteMemoryStoreError && error.code === "INTEGRITY_VIOLATION"
  );
  store.close();
});

test("an uncommitted process crash rolls back without deleting the durable record", async (t) => {
  const databasePath = databasePathFor(t);
  const record = storedRecord();
  const store = createSqliteMemoryRecordStore({ databasePath });
  await store.append(record, { idempotency_key: "admit-1" });
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
    const receipt = await store.append(${JSON.stringify(record)}, { idempotency_key: "admit-parallel" });
    store.close();
    process.stdout.write(JSON.stringify(receipt));
  `;

  const [left, right] = await Promise.all([
    execFileAsync(process.execPath, ["--no-warnings", "--input-type=module", "--eval", appendScript]),
    execFileAsync(process.execPath, ["--no-warnings", "--input-type=module", "--eval", appendScript])
  ]);
  const receipts = [JSON.parse(left.stdout), JSON.parse(right.stdout)];
  assert.deepEqual(receipts.map(({ created }) => created).sort(), [false, true]);
  assert.deepEqual(withoutCreated(receipts[0]), withoutCreated(receipts[1]));

  const store = createSqliteMemoryRecordStore({ databasePath });
  assert.deepEqual(store.read(), [record]);
  store.close();
});

test("parallel gateway first admissions with different clocks verify one durable identity", async (t) => {
  const databasePath = databasePathFor(t);
  const auditPath = `${databasePath}.audit`;
  createSqliteMemoryRecordStore({ databasePath }).close();
  const auditSetup = new DatabaseSync(auditPath);
  auditSetup.exec(`
    CREATE TABLE replay_anchors (
      idempotency_key TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      layer TEXT NOT NULL,
      memory_record_id TEXT NOT NULL,
      record_version INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      admitted_at TEXT NOT NULL
    )
  `);
  auditSetup.close();
  const request = { layer: "session", record: gatewayRecord(), admission: { producer: "agent-a" } };
  const admissionScript = (instant) => `
    import { createMemoryGateway } from ${JSON.stringify(GATEWAY_MODULE_URL)};
    import { createSqliteMemoryRecordStore } from ${JSON.stringify(STORE_MODULE_URL)};
    import { DatabaseSync } from "node:sqlite";
    const store = createSqliteMemoryRecordStore({ databasePath: ${JSON.stringify(databasePath)}, busyTimeoutMs: 10000 });
    const audit = new DatabaseSync(${JSON.stringify(auditPath)});
    audit.exec("PRAGMA busy_timeout = 10000");
    const appendAnchor = audit.prepare("INSERT OR IGNORE INTO replay_anchors (idempotency_key, project_id, layer, memory_record_id, record_version, content_hash, admitted_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
    const readAnchor = audit.prepare("SELECT idempotency_key, project_id, layer, memory_record_id, record_version, content_hash, admitted_at FROM replay_anchors WHERE idempotency_key = ?");
    const gateway = createMemoryGateway({
      layerStores: { session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60000, sod: "producer-only" } } },
      sodRules: { checkPairwiseDistinct: () => ({ ok: true }) },
      now: () => new Date(${JSON.stringify(instant)}),
      ledgerWriter: (entry) => {
        if (entry.disposition === "COMMITTED") appendAnchor.run(entry.idempotency_key, entry.project_id, entry.layer, entry.memory_record_id, entry.version, entry.content_hash, entry.admitted_at);
        return { audited: true };
      },
      replayResolver: ({ idempotency_key }) => {
        const row = readAnchor.get(idempotency_key);
        return row === undefined ? null : { status: "COMMITTED", idempotency_key: row.idempotency_key, project_id: row.project_id, layer: row.layer, memory_record_id: row.memory_record_id, version: row.record_version, content_hash: row.content_hash, admitted_at: row.admitted_at };
      }
    });
    const result = await gateway.admit(${JSON.stringify(request)});
    store.close();
    audit.close();
    process.stdout.write(JSON.stringify({ decision: result.decision, code: result.code }));
  `;

  const [left, right] = await Promise.all([
    execFileAsync(process.execPath, ["--no-warnings", "--input-type=module", "--eval", admissionScript(FIXED_NOW.toISOString())]),
    execFileAsync(process.execPath, ["--no-warnings", "--input-type=module", "--eval", admissionScript(new Date(FIXED_NOW.getTime() + 1).toISOString())])
  ]);
  assert.deepEqual(JSON.parse(left.stdout), { decision: "ALLOW", code: "ADMITTED" });
  assert.deepEqual(JSON.parse(right.stdout), { decision: "ALLOW", code: "ADMITTED" });

  const store = createSqliteMemoryRecordStore({ databasePath });
  assert.equal(store.read().length, 1);
  store.close();
});

test("same-instance concurrent admissions serialize instead of producing false reconciliation", async (t) => {
  const databasePath = databasePathFor(t);
  const store = createSqliteMemoryRecordStore({ databasePath });
  let releaseFirstCommit;
  let signalFirstCommit;
  const firstCommitEntered = new Promise((resolve) => { signalFirstCommit = resolve; });
  const firstCommitRelease = new Promise((resolve) => { releaseFirstCommit = resolve; });
  let committedCalls = 0;
  const replayLedger = makeReplayLedger();
  const gateway = createMemoryGateway({
    layerStores: {
      session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } }
    },
    sodRules: { checkPairwiseDistinct },
    now: () => FIXED_NOW,
    replayResolver: replayLedger.resolver,
    async ledgerWriter(entry) {
      if (entry.disposition === "COMMITTED" && ++committedCalls === 1) {
        signalFirstCommit();
        await firstCommitRelease;
      }
      return replayLedger.writer(entry);
    }
  });
  const request = { layer: "session", record: gatewayRecord(), admission: { producer: "agent-a" } };

  const firstPending = gateway.admit(structuredClone(request));
  await firstCommitEntered;
  const secondPending = gateway.admit(structuredClone(request));
  releaseFirstCommit();
  const [first, second] = await Promise.all([firstPending, secondPending]);

  assert.equal(first.decision, "ALLOW");
  assert.equal(second.decision, "ALLOW");
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

test("gateway restart at a later clock replays the durable admission instant", async (t) => {
  const databasePath = databasePathFor(t);
  const request = { layer: "session", record: gatewayRecord(), admission: { producer: "agent-a" } };
  const replayLedger = makeReplayLedger();
  const createGateway = (store, instant) => createMemoryGateway({
    layerStores: {
      session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } }
    },
    sodRules: { checkPairwiseDistinct },
    now: () => instant,
    ledgerWriter: replayLedger.writer,
    replayResolver: replayLedger.resolver
  });
  const firstStore = createSqliteMemoryRecordStore({ databasePath });
  const first = await createGateway(firstStore, FIXED_NOW).admit(structuredClone(request));
  firstStore.close();

  const restartedStore = createSqliteMemoryRecordStore({ databasePath });
  const replay = await createGateway(restartedStore, new Date(FIXED_NOW.getTime() + 300_000)).admit(structuredClone(request));

  assert.equal(first.decision, "ALLOW");
  assert.equal(replay.decision, "ALLOW");
  assert.equal(replay.admitted_at, first.admitted_at);
  assert.equal(replay.append.created, false);
  assert.equal(restartedStore.read().length, 1);
  restartedStore.close();
});
