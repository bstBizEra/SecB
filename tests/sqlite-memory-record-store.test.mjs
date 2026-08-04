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
import { createMemoryGateway as createMemoryGatewayImpl } from "../src/services/memory-gateway-service.mjs";
import { createSqliteMemoryRecordStore, resolveUniqueScopedCursorAnchor, SqliteMemoryStoreError } from "../src/services/sqlite-memory-record-store.mjs";

const execFileAsync = promisify(execFile);
const FIXED_NOW = new Date("2026-07-20T10:00:00Z");
const STORE_MODULE_URL = new URL("../src/services/sqlite-memory-record-store.mjs", import.meta.url).href;
const GATEWAY_MODULE_URL = new URL("../src/services/memory-gateway-service.mjs", import.meta.url).href;
const TEST_CURSOR_MAC_KEY = Buffer.alloc(32, 0x53);

function createMemoryGateway(options) {
  const suppliedKey = options !== null && options !== undefined && Object.prototype.hasOwnProperty.call(options, "cursorMacKey");
  return createMemoryGatewayImpl({ ...(options ?? {}), cursorMacKey: suppliedKey ? options.cursorMacKey : TEST_CURSOR_MAC_KEY });
}

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
    access_policy: "project-members",
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

function outboxEntry(record, idempotencyKey = "admit-outbox-1", overrides = {}) {
  const body = {
    type: "MEMORY_ADMISSION_DISPOSITION",
    disposition: "COMMITTED",
    idempotency_key: idempotencyKey,
    project_id: record.project_id,
    layer: record.layer,
    memory_record_id: record.memory_record_id,
    version: record.version,
    content_hash: record.content_hash,
    admitted_at: record.admitted_at,
    actor_id: record.actor_id,
    classification: record.classification,
    ...overrides
  };
  return { outbox_id: canonicalFingerprint(body), ...body };
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

function seedLegacyOutboxDatabase(databasePath, { contradictory = false } = {}) {
  const record = storedRecord({ memory_record_id: contradictory ? "mem-legacy-invalid" : "mem-legacy" });
  const idempotencyKey = contradictory ? "admit-legacy-invalid" : "admit-legacy";
  const event = outboxEntry(record, idempotencyKey);
  const raw = new DatabaseSync(databasePath);
  raw.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE memory_records (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      layer TEXT NOT NULL,
      memory_record_id TEXT NOT NULL,
      record_version INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      record_fingerprint TEXT NOT NULL,
      record_json TEXT NOT NULL,
      UNIQUE (project_id, layer, memory_record_id, record_version)
    );
    CREATE TABLE memory_admission_receipts (
      idempotency_key TEXT PRIMARY KEY,
      sequence INTEGER NOT NULL UNIQUE,
      record_fingerprint TEXT NOT NULL,
      FOREIGN KEY (sequence) REFERENCES memory_records(sequence) ON DELETE RESTRICT
    );
    CREATE TABLE memory_audit_outbox (
      outbox_id TEXT PRIMARY KEY,
      idempotency_key TEXT NOT NULL UNIQUE,
      event_fingerprint TEXT NOT NULL,
      event_json TEXT NOT NULL,
      delivery_status TEXT NOT NULL,
      delivery_attempts INTEGER NOT NULL DEFAULT 0,
      delivered_at TEXT,
      FOREIGN KEY (idempotency_key) REFERENCES memory_admission_receipts(idempotency_key) ON DELETE RESTRICT
    );
  `);
  const fingerprint = canonicalFingerprint(record);
  raw.prepare(`
    INSERT INTO memory_records (
      project_id, layer, memory_record_id, record_version, content_hash,
      record_fingerprint, record_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(record.project_id, record.layer, record.memory_record_id, record.version, record.content_hash, fingerprint, JSON.stringify(record));
  raw.prepare("INSERT INTO memory_admission_receipts (idempotency_key, sequence, record_fingerprint) VALUES (?, 1, ?)")
    .run(idempotencyKey, fingerprint);
  raw.prepare(`
    INSERT INTO memory_audit_outbox (
      outbox_id, idempotency_key, event_fingerprint, event_json,
      delivery_status, delivery_attempts, delivered_at
    ) VALUES (?, ?, ?, ?, 'PENDING', 0, ?)
  `).run(event.outbox_id, idempotencyKey, canonicalFingerprint(event), JSON.stringify(event), contradictory ? FIXED_NOW.toISOString() : null);
  raw.close();
  return { record, event, idempotencyKey };
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

test("legacy unversioned outbox migrates transactionally to schema v2 without data loss", async (t) => {
  const databasePath = databasePathFor(t);
  const { record, event, idempotencyKey } = seedLegacyOutboxDatabase(databasePath);

  const store = createSqliteMemoryRecordStore({ databasePath });
  assert.deepEqual(store.read(), [record]);
  assert.deepEqual(store.readOutbox()[0].event, event);
  const replay = await store.appendWithOutbox(record, { idempotency_key: idempotencyKey, outbox_entry: event });
  assert.equal(replay.receipt.created, false);
  store.close();

  const raw = new DatabaseSync(databasePath);
  assert.equal(raw.prepare("PRAGMA user_version").get().user_version, 2);
  assert.deepEqual(
    raw.prepare("PRAGMA table_info(memory_audit_outbox)").all().map((column) => column.name),
    ["outbox_id", "idempotency_key", "event_fingerprint", "event_json", "delivery_status", "delivery_attempts", "delivered_at", "claim_token", "claimed_at", "claim_expires_at"]
  );
  assert.equal(raw.prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'memory_audit_outbox_v1'").get(), undefined);
  assert.equal(raw.prepare("SELECT COUNT(*) AS count FROM memory_audit_outbox").get().count, 1);
  raw.close();
});

test("pre-outbox memory database gains schema v2 without changing existing records", (t) => {
  const databasePath = databasePathFor(t);
  const { record } = seedLegacyOutboxDatabase(databasePath);
  const raw = new DatabaseSync(databasePath);
  raw.exec("DROP TABLE memory_audit_outbox");
  raw.close();

  const store = createSqliteMemoryRecordStore({ databasePath });
  assert.deepEqual(store.read(), [record]);
  assert.deepEqual(store.readOutbox(), []);
  store.close();
  const migrated = new DatabaseSync(databasePath);
  assert.equal(migrated.prepare("PRAGMA user_version").get().user_version, 2);
  migrated.close();
});

test("legacy migration fails closed and rolls back when an outbox row violates state invariants", (t) => {
  const databasePath = databasePathFor(t);
  seedLegacyOutboxDatabase(databasePath, { contradictory: true });

  assert.throws(
    () => createSqliteMemoryRecordStore({ databasePath }),
    (error) => error instanceof SqliteMemoryStoreError && error.code === "OUTBOX_INTEGRITY_VIOLATION"
  );
  const raw = new DatabaseSync(databasePath);
  assert.equal(raw.prepare("PRAGMA user_version").get().user_version, 0);
  assert.ok(raw.prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'memory_audit_outbox'").get());
  assert.equal(raw.prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'memory_audit_outbox_v1'").get(), undefined);
  raw.close();
});

test("unknown future schema version fails closed before creating memory tables", (t) => {
  const databasePath = databasePathFor(t);
  const raw = new DatabaseSync(databasePath);
  raw.exec("PRAGMA user_version = 99");
  raw.close();
  assert.throws(
    () => createSqliteMemoryRecordStore({ databasePath }),
    (error) => error instanceof SqliteMemoryStoreError && error.code === "UNSUPPORTED_SCHEMA_VERSION"
  );
});

test("declared schema v2 with missing constraints fails closed", (t) => {
  const databasePath = databasePathFor(t);
  seedLegacyOutboxDatabase(databasePath);
  const raw = new DatabaseSync(databasePath);
  raw.exec(`
    ALTER TABLE memory_audit_outbox ADD COLUMN claim_token TEXT;
    ALTER TABLE memory_audit_outbox ADD COLUMN claimed_at TEXT;
    ALTER TABLE memory_audit_outbox ADD COLUMN claim_expires_at TEXT;
    PRAGMA user_version = 2;
  `);
  raw.close();
  assert.throws(
    () => createSqliteMemoryRecordStore({ databasePath }),
    (error) => error instanceof SqliteMemoryStoreError && error.code === "SCHEMA_INTEGRITY_VIOLATION"
  );
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

test("scoped reads are bounded, project-and-layer isolated, and cursor paginated", async (t) => {
  const databasePath = databasePathFor(t);
  const store = createSqliteMemoryRecordStore({ databasePath });
  for (let index = 1; index <= 5; index += 1) {
    const record = storedRecord({
      memory_record_id: `mem-scoped-${index}`,
      project_id: index === 3 ? "proj-other" : "proj-1",
      statement: `scoped record ${index}`
    });
    await store.append(record, { idempotency_key: `scoped-${index}` });
  }

  const first = store.readScoped({ project_id: "proj-1", layer: "session", limit: 2 });
  assert.deepEqual(first.records.map((record) => record.memory_record_id), ["mem-scoped-1", "mem-scoped-2"]);
  assert.equal(first.has_more, true);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.records));

  const anchor = first.records.at(-1);
  const second = store.readScoped({
    project_id: "proj-1",
    layer: "session",
    limit: 2,
    after: { memory_record_id_hash: canonicalFingerprint({ memory_record_id: anchor.memory_record_id }), version: anchor.version, content_hash: anchor.content_hash }
  });
  assert.deepEqual(second.records.map((record) => record.memory_record_id), ["mem-scoped-4", "mem-scoped-5"]);
  assert.equal(second.has_more, false);
  assert.throws(
    () => store.readScoped({ project_id: "proj-1", layer: "session", limit: 1001 }),
    (error) => error instanceof SqliteMemoryStoreError && error.code === "INVALID_SCOPED_READ"
  );
  assert.throws(
    () => store.readScoped({ project_id: "proj-1", layer: "session", after: {} }),
    (error) => error instanceof SqliteMemoryStoreError && error.code === "INVALID_SCOPED_READ"
  );
  const raw = new DatabaseSync(databasePath);
  const indexes = new Set(raw.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map((row) => row.name));
  for (const name of [
    "memory_records_scope_sequence_idx",
    "memory_records_scope_anchor_idx",
    "memory_outbox_delivery_status_idx",
    "memory_outbox_claim_expiry_idx",
    "memory_outbox_claim_token_idx"
  ]) assert.ok(indexes.has(name), `missing operational index ${name}`);
  raw.close();
  store.close();
});

test("scoped cursor anchor resolution rejects missing and ambiguous identity digests", () => {
  const memoryRecordIdHash = canonicalFingerprint({ memory_record_id: "mem-anchor" });
  assert.equal(resolveUniqueScopedCursorAnchor([], memoryRecordIdHash), null);
  assert.equal(resolveUniqueScopedCursorAnchor([
    { memory_record_id: "mem-anchor", sequence: 7 },
    { memory_record_id: "mem-anchor", sequence: 8 }
  ], memoryRecordIdHash), null);
  assert.equal(resolveUniqueScopedCursorAnchor([{ memory_record_id: "mem-anchor", sequence: 7 }], memoryRecordIdHash), 7);
});

test("gateway cursor pagination survives restart without cross-project gaps or leakage", async (t) => {
  const databasePath = databasePathFor(t);
  const expected = [];
  let store = createSqliteMemoryRecordStore({ databasePath });
  for (let index = 1; index <= 12; index += 1) {
    const projectId = index % 3 === 0 ? "proj-noise" : "proj-page";
    const record = storedRecord({
      memory_record_id: `mem-page-restart-${index}`,
      project_id: projectId,
      statement: `restart page record ${index}`
    });
    await store.append(record, { idempotency_key: `page-restart-${index}` });
    if (projectId === "proj-page") expected.push(record.memory_record_id);
  }
  const gatewayFor = (currentStore) => createMemoryGateway({
    layerStores: {
      session: { store: currentStore, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } }
    },
    sodRules: { checkPairwiseDistinct },
    now: () => FIXED_NOW,
    ledgerWriter: () => ({ audited: true })
  });
  const query = { layer: "session", project_id: "proj-page", scope_project_id: "proj-page", limit: 2 };
  const first = gatewayFor(store).retrieve(query);
  assert.equal(first.decision, "ALLOW");
  assert.equal(first.records.length, 2);
  const cursorEnvelope = JSON.parse(Buffer.from(first.next_cursor, "base64url").toString("utf8"));
  assert.equal(cursorEnvelope.scope_hash, canonicalFingerprint({ project_id: "proj-page", layer: "session" }));
  assert.equal(Object.prototype.hasOwnProperty.call(cursorEnvelope, "sequence"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(cursorEnvelope, "project_id"), false);
  const observed = first.records.map((entry) => entry.record.memory_record_id);
  let cursor = first.next_cursor;
  store.close();

  store = createSqliteMemoryRecordStore({ databasePath });
  const restartedGateway = gatewayFor(store);
  while (cursor !== null) {
    const page = restartedGateway.retrieve({ ...query, cursor });
    assert.equal(page.decision, "ALLOW");
    observed.push(...page.records.map((entry) => entry.record.memory_record_id));
    cursor = page.next_cursor;
  }
  assert.deepEqual(observed, expected);
  assert.equal(new Set(observed).size, expected.length);
  store.close();
});

test("startup rejects same-name substitutions for every operational index", (t) => {
  const substitutions = [
    ["memory_records_scope_sequence_idx", "CREATE INDEX memory_records_scope_sequence_idx ON memory_records(sequence)"],
    ["memory_records_scope_anchor_idx", "CREATE INDEX memory_records_scope_anchor_idx ON memory_records(content_hash)"],
    ["memory_outbox_delivery_status_idx", "CREATE INDEX memory_outbox_delivery_status_idx ON memory_audit_outbox(outbox_id)"],
    ["memory_outbox_claim_expiry_idx", "CREATE INDEX memory_outbox_claim_expiry_idx ON memory_audit_outbox(delivery_status)"],
    ["memory_outbox_claim_token_idx", "CREATE INDEX memory_outbox_claim_token_idx ON memory_audit_outbox(claim_token)"]
  ];
  for (const [name, replacement] of substitutions) {
    const databasePath = databasePathFor(t);
    createSqliteMemoryRecordStore({ databasePath }).close();
    const raw = new DatabaseSync(databasePath);
    raw.exec(`DROP INDEX ${name}; ${replacement}`);
    raw.close();
    assert.throws(
      () => createSqliteMemoryRecordStore({ databasePath }),
      (error) => error instanceof SqliteMemoryStoreError
        && error.code === "SCHEMA_INTEGRITY_VIOLATION"
        && error.message.includes(name)
    );
  }
});

test("atomic append-with-outbox commits the record, receipt, and terminal event together", async (t) => {
  const databasePath = databasePathFor(t);
  const record = storedRecord({ memory_record_id: "mem-outbox-1" });
  const idempotencyKey = "admit-outbox-1";
  const event = outboxEntry(record, idempotencyKey);
  const store = createSqliteMemoryRecordStore({ databasePath });

  let factoryCalls = 0;
  const first = await store.appendWithOutbox(record, {
    idempotency_key: idempotencyKey,
    outbox_entry_factory(persisted, receipt) {
      factoryCalls += 1;
      assert.deepEqual(persisted, record);
      assert.equal(receipt.created, true);
      return event;
    }
  });
  assert.equal(factoryCalls, 1);
  assert.equal(first.receipt.created, true);
  assert.equal(first.outbox.delivery_status, "PENDING");
  assert.deepEqual(first.outbox.event, event);
  assert.deepEqual(store.read(), [record]);
  assert.equal(store.readOutbox().length, 1);

  const replay = await store.appendWithOutbox(structuredClone(record), { idempotency_key: idempotencyKey, outbox_entry: structuredClone(event) });
  assert.equal(replay.receipt.created, false);
  assert.equal(store.read().length, 1);
  assert.equal(store.readOutbox().length, 1);
  store.close();

  const restarted = createSqliteMemoryRecordStore({ databasePath });
  assert.deepEqual(restarted.read(), [record]);
  assert.deepEqual(restarted.readOutbox()[0].event, event);
  restarted.close();
});

test("outbox binding failure rolls back a newly inserted memory record", async (t) => {
  const databasePath = databasePathFor(t);
  const record = storedRecord({ memory_record_id: "mem-outbox-rollback" });
  const store = createSqliteMemoryRecordStore({ databasePath });
  const mismatched = outboxEntry(record, "admit-outbox-rollback", { admitted_at: "2099-01-01T00:00:00.000Z" });

  await assert.rejects(
    store.appendWithOutbox(record, { idempotency_key: "admit-outbox-rollback", outbox_entry: mismatched }),
    (error) => error instanceof SqliteMemoryStoreError && error.code === "OUTBOX_BINDING_MISMATCH"
  );
  assert.deepEqual(store.read(), []);
  assert.deepEqual(store.readOutbox(), []);
  store.close();
});

test("outbox delivery is bounded, retryable, and marked delivered only after success", async (t) => {
  const databasePath = databasePathFor(t);
  const record = storedRecord({ memory_record_id: "mem-outbox-delivery" });
  const event = outboxEntry(record, "admit-outbox-delivery");
  const store = createSqliteMemoryRecordStore({ databasePath });
  await store.appendWithOutbox(record, { idempotency_key: event.idempotency_key, outbox_entry: event });

  await assert.rejects(
    store.dispatchOutbox(() => true, { timeoutMs: 10, limit: 2, claimTtlMs: 20 }),
    (error) => error instanceof SqliteMemoryStoreError && error.code === "INVALID_OUTBOX_DISPATCH"
  );
  await assert.rejects(
    store.dispatchOutbox(() => true, { rogue: true }),
    (error) => error instanceof SqliteMemoryStoreError && error.code === "INVALID_OUTBOX_DISPATCH"
  );

  const startedAt = Date.now();
  const timedOut = await store.dispatchOutbox(() => new Promise(() => {}), { timeoutMs: 20, now: () => FIXED_NOW });
  assert.equal(timedOut[0].delivery, "TIMEOUT_PENDING");
  assert.ok(Date.now() - startedAt < 500, "dispatch timeout must release the caller promptly");
  assert.equal(store.readOutbox()[0].delivery_attempts, 1);

  const delivered = [];
  const falseAck = await store.dispatchOutbox(() => false, { timeoutMs: 100, now: () => FIXED_NOW });
  assert.equal(falseAck[0].delivery, "FAILED_PENDING");
  const success = await store.dispatchOutbox((entry) => { delivered.push(entry); return true; }, { timeoutMs: 100, now: () => FIXED_NOW });
  assert.equal(success[0].delivery, "DELIVERED");
  assert.deepEqual(delivered, [event]);
  assert.deepEqual(store.readOutbox(), []);
  store.close();
});

test("concurrent dispatcher instances claim one pending event only once", async (t) => {
  const databasePath = databasePathFor(t);
  const record = storedRecord({ memory_record_id: "mem-outbox-claim" });
  const event = outboxEntry(record, "admit-outbox-claim");
  const firstStore = createSqliteMemoryRecordStore({ databasePath });
  await firstStore.appendWithOutbox(record, { idempotency_key: event.idempotency_key, outbox_entry: event });
  const secondStore = createSqliteMemoryRecordStore({ databasePath });
  let releaseDelivery;
  let signalDelivery;
  const deliveryEntered = new Promise((resolve) => { signalDelivery = resolve; });
  const deliveryRelease = new Promise((resolve) => { releaseDelivery = resolve; });
  let deliveryCalls = 0;

  const firstPending = firstStore.dispatchOutbox(async () => {
    deliveryCalls += 1;
    signalDelivery();
    await deliveryRelease;
    return true;
  }, { timeoutMs: 200, claimTtlMs: 1_000, limit: 1, now: () => FIXED_NOW });
  await deliveryEntered;
  assert.throws(
    () => firstStore.close(),
    (error) => error instanceof SqliteMemoryStoreError && error.code === "LEASE_ACTIVE"
  );
  const second = await secondStore.dispatchOutbox(() => { deliveryCalls += 1; return true; }, {
    timeoutMs: 200,
    claimTtlMs: 1_000,
    limit: 1,
    now: () => FIXED_NOW
  });
  assert.deepEqual(second, []);
  releaseDelivery();
  const first = await firstPending;
  assert.equal(first[0].delivery, "DELIVERED");
  assert.equal(deliveryCalls, 1);
  assert.deepEqual(firstStore.readOutbox(), []);
  firstStore.close();
  secondStore.close();
});

test("an expired dispatcher claim is recovered and retried without losing the event", async (t) => {
  const databasePath = databasePathFor(t);
  const record = storedRecord({ memory_record_id: "mem-outbox-expired-claim" });
  const event = outboxEntry(record, "admit-outbox-expired-claim");
  const store = createSqliteMemoryRecordStore({ databasePath });
  await store.appendWithOutbox(record, { idempotency_key: event.idempotency_key, outbox_entry: event });
  const raw = new DatabaseSync(databasePath);
  raw.prepare(`
    UPDATE memory_audit_outbox
       SET delivery_status = 'IN_FLIGHT', delivery_attempts = 1,
           claim_token = 'orphaned-claim', claimed_at = ?, claim_expires_at = ?
  `).run(FIXED_NOW.toISOString(), new Date(FIXED_NOW.getTime() + 1_000).toISOString());
  raw.close();

  const later = new Date(FIXED_NOW.getTime() + 2_000);
  const recovered = await store.dispatchOutbox(() => true, {
    timeoutMs: 100,
    claimTtlMs: 1_000,
    limit: 1,
    now: () => later
  });
  assert.equal(recovered[0].delivery, "DELIVERED");
  assert.equal(recovered[0].record.delivery_attempts, 2);
  assert.deepEqual(store.readOutbox(), []);
  store.close();
});

test("delivery-clock failure releases the claim and preserves a retryable event", async (t) => {
  const databasePath = databasePathFor(t);
  const record = storedRecord({ memory_record_id: "mem-outbox-clock" });
  const event = outboxEntry(record, "admit-outbox-clock");
  const store = createSqliteMemoryRecordStore({ databasePath });
  await store.appendWithOutbox(record, { idempotency_key: event.idempotency_key, outbox_entry: event });
  let clockCalls = 0;
  await assert.rejects(
    store.dispatchOutbox(() => true, {
      timeoutMs: 100,
      limit: 1,
      claimTtlMs: 1_000,
      now: () => ++clockCalls === 1 ? FIXED_NOW : new Date(NaN)
    }),
    (error) => error instanceof SqliteMemoryStoreError && error.code === "OUTBOX_CLOCK_UNAVAILABLE"
  );
  assert.equal(store.readOutbox()[0].delivery_attempts, 1);
  const retry = await store.dispatchOutbox(() => true, { timeoutMs: 100, limit: 1, claimTtlMs: 1_000, now: () => FIXED_NOW });
  assert.equal(retry[0].delivery, "DELIVERED");
  store.close();
});

test("outbox integrity verification rejects raw payload tampering", async (t) => {
  const databasePath = databasePathFor(t);
  const record = storedRecord({ memory_record_id: "mem-outbox-integrity" });
  const event = outboxEntry(record, "admit-outbox-integrity");
  const store = createSqliteMemoryRecordStore({ databasePath });
  await store.appendWithOutbox(record, { idempotency_key: event.idempotency_key, outbox_entry: event });
  const raw = new DatabaseSync(databasePath);
  raw.prepare("UPDATE memory_audit_outbox SET event_json = ?").run(JSON.stringify({ ...event, admitted_at: "2099-01-01T00:00:00.000Z" }));
  raw.close();

  assert.throws(
    () => store.readOutbox(),
    (error) => error instanceof SqliteMemoryStoreError && error.code === "OUTBOX_INTEGRITY_VIOLATION"
  );
  store.close();
});

test("outbox integrity verification rejects contradictory delivery state", async (t) => {
  const databasePath = databasePathFor(t);
  const record = storedRecord({ memory_record_id: "mem-outbox-state" });
  const event = outboxEntry(record, "admit-outbox-state");
  const store = createSqliteMemoryRecordStore({ databasePath });
  await store.appendWithOutbox(record, { idempotency_key: event.idempotency_key, outbox_entry: event });
  const raw = new DatabaseSync(databasePath);
  assert.throws(() => raw.prepare("UPDATE memory_audit_outbox SET delivered_at = ?").run(FIXED_NOW.toISOString()), /constraint/i);
  raw.exec("PRAGMA ignore_check_constraints = ON");
  raw.prepare("UPDATE memory_audit_outbox SET delivered_at = ?").run(FIXED_NOW.toISOString());
  assert.throws(() => store.readOutbox(), (error) => error instanceof SqliteMemoryStoreError && error.code === "OUTBOX_INTEGRITY_VIOLATION");
  raw.prepare("UPDATE memory_audit_outbox SET delivery_status = 'DELIVERED', delivery_attempts = 0, delivered_at = 'garbage'").run();
  assert.throws(
    () => store.verifyOutboxIntegrity(),
    (error) => error instanceof SqliteMemoryStoreError && error.code === "OUTBOX_INTEGRITY_VIOLATION"
  );
  await assert.rejects(
    store.appendWithOutbox(record, { idempotency_key: event.idempotency_key, outbox_entry: event }),
    (error) => error instanceof SqliteMemoryStoreError && error.code === "OUTBOX_INTEGRITY_VIOLATION"
  );
  raw.close();
  store.close();
});

test("explicit and startup integrity checks reject duplicate non-null claim tokens", async (t) => {
  const databasePath = databasePathFor(t);
  const firstRecord = storedRecord({ memory_record_id: "mem-duplicate-claim-1" });
  const secondRecord = storedRecord({ memory_record_id: "mem-duplicate-claim-2" });
  const firstEvent = outboxEntry(firstRecord, "admit-duplicate-claim-1");
  const secondEvent = outboxEntry(secondRecord, "admit-duplicate-claim-2");
  const store = createSqliteMemoryRecordStore({ databasePath });
  await store.appendWithOutbox(firstRecord, { idempotency_key: firstEvent.idempotency_key, outbox_entry: firstEvent });
  await store.appendWithOutbox(secondRecord, { idempotency_key: secondEvent.idempotency_key, outbox_entry: secondEvent });

  const raw = new DatabaseSync(databasePath);
  raw.exec(`
    DROP INDEX memory_outbox_claim_token_idx;
    CREATE INDEX memory_outbox_claim_token_idx ON memory_audit_outbox(claim_token);
  `);
  raw.prepare(`
    UPDATE memory_audit_outbox
       SET delivery_status = 'IN_FLIGHT', delivery_attempts = 1,
           claim_token = 'duplicate-claim-token', claimed_at = ?, claim_expires_at = ?
  `).run(FIXED_NOW.toISOString(), new Date(FIXED_NOW.getTime() + 60_000).toISOString());
  raw.close();

  assert.throws(
    () => store.verifyOutboxIntegrity(),
    (error) => error instanceof SqliteMemoryStoreError && error.code === "OUTBOX_INTEGRITY_VIOLATION"
  );
  store.close();
  assert.throws(
    () => createSqliteMemoryRecordStore({ databasePath }),
    (error) => error instanceof SqliteMemoryStoreError && error.code === "SCHEMA_INTEGRITY_VIOLATION"
  );
});

test("outbox hot dispatch validates claimed rows while explicit sweep detects unrelated corruption", async (t) => {
  const databasePath = databasePathFor(t);
  const firstRecord = storedRecord({ memory_record_id: "mem-outbox-sweep-1" });
  const secondRecord = storedRecord({ memory_record_id: "mem-outbox-sweep-2" });
  const firstEvent = outboxEntry(firstRecord, "admit-outbox-sweep-1");
  const secondEvent = outboxEntry(secondRecord, "admit-outbox-sweep-2");
  const store = createSqliteMemoryRecordStore({ databasePath });
  await store.appendWithOutbox(firstRecord, { idempotency_key: firstEvent.idempotency_key, outbox_entry: firstEvent });
  const firstDelivery = await store.dispatchOutbox(() => true, { limit: 1, timeoutMs: 100, claimTtlMs: 1_000, now: () => FIXED_NOW });
  assert.equal(firstDelivery[0].delivery, "DELIVERED");
  await store.appendWithOutbox(secondRecord, { idempotency_key: secondEvent.idempotency_key, outbox_entry: secondEvent });

  const raw = new DatabaseSync(databasePath);
  raw.prepare("UPDATE memory_audit_outbox SET event_json = ? WHERE outbox_id = ?")
    .run(JSON.stringify({ ...firstEvent, admitted_at: "2099-01-01T00:00:00.000Z" }), firstEvent.outbox_id);
  raw.close();

  const secondDelivery = await store.dispatchOutbox(() => true, { limit: 1, timeoutMs: 100, claimTtlMs: 1_000, now: () => FIXED_NOW });
  assert.equal(secondDelivery[0].outbox_id, secondEvent.outbox_id);
  assert.equal(secondDelivery[0].delivery, "DELIVERED");
  assert.throws(
    () => store.verifyOutboxIntegrity(),
    (error) => error instanceof SqliteMemoryStoreError && error.code === "OUTBOX_INTEGRITY_VIOLATION"
  );
  store.close();
  assert.throws(
    () => createSqliteMemoryRecordStore({ databasePath }),
    (error) => error instanceof SqliteMemoryStoreError && error.code === "OUTBOX_INTEGRITY_VIOLATION"
  );
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
      },
      cursorMacKey: new Uint8Array(32).fill(83)
    });
    let result = await gateway.admit(${JSON.stringify(request)});
    await store.dispatchOutbox((entry) => {
      appendAnchor.run(entry.idempotency_key, entry.project_id, entry.layer, entry.memory_record_id, entry.version, entry.content_hash, entry.admitted_at);
      return true;
    });
    if (result.decision !== "ALLOW") result = await gateway.admit(${JSON.stringify(request)});
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

test("same-instance concurrent admissions converge through one bounded reconciliation retry", async (t) => {
  const databasePath = databasePathFor(t);
  const store = createSqliteMemoryRecordStore({ databasePath });
  const auditEntries = [];
  const replayLedger = makeReplayLedger();
  const gateway = createMemoryGateway({
    layerStores: {
      session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } }
    },
    sodRules: { checkPairwiseDistinct },
    now: () => FIXED_NOW,
    replayResolver: replayLedger.resolver,
    ledgerWriter(entry) {
      auditEntries.push(entry);
      return replayLedger.writer(entry);
    }
  });
  const request = { layer: "session", record: gatewayRecord(), admission: { producer: "agent-a" } };

  const firstPending = gateway.admit(structuredClone(request));
  const secondPending = gateway.admit(structuredClone(request));
  const [first, second] = await Promise.all([firstPending, secondPending]);

  assert.deepEqual([first.decision, second.decision].sort(), ["ALLOW", "RECONCILIATION_REQUIRED"]);
  const retry = await gateway.admit(structuredClone(request));
  assert.equal(retry.decision, "ALLOW");
  assert.equal(store.read().length, 1);
  assert.equal(auditEntries.filter((entry) => entry.disposition === "ATTEMPTED").length, 3);
  assert.equal(auditEntries.filter((entry) => entry.disposition === "RECONCILIATION_REQUIRED").length, 1);
  assert.equal(auditEntries.filter((entry) => entry.disposition === "COMMITTED").length, 2);
  assert.equal(store.readOutbox().length, 1);
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
  assert.equal(store.readOutbox().length, 1);
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

  const raw = new DatabaseSync(databasePath);
  raw.prepare(`
    UPDATE memory_audit_outbox
       SET delivery_status = 'IN_FLIGHT', delivery_attempts = 1,
           claim_token = 'active-restart-claim', claimed_at = ?, claim_expires_at = ?
  `).run(FIXED_NOW.toISOString(), new Date(FIXED_NOW.getTime() + 600_000).toISOString());
  raw.close();

  const restartedStore = createSqliteMemoryRecordStore({ databasePath });
  const replay = await createGateway(restartedStore, new Date(FIXED_NOW.getTime() + 300_000)).admit(structuredClone(request));

  assert.equal(first.decision, "ALLOW");
  assert.equal(replay.decision, "ALLOW");
  assert.equal(replay.admitted_at, first.admitted_at);
  assert.equal(replay.append.created, false);
  assert.equal(restartedStore.read().length, 1);
  restartedStore.close();
});
