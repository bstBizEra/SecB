import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";

import { canonicalFingerprint } from "../contracts/canonical-fingerprint.mjs";
import { validateContract } from "../contracts/contract-validator.mjs";

const require = createRequire(import.meta.url);
const OUTBOX_EVENT_KEYS = Object.freeze([
  "outbox_id", "type", "disposition", "idempotency_key", "project_id", "layer",
  "memory_record_id", "version", "content_hash", "admitted_at", "actor_id", "classification"
]);
const MAX_NODE_TIMEOUT_MS = 2_147_483_647;

export class SqliteMemoryStoreError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "SqliteMemoryStoreError";
    this.code = code;
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function rollbackQuietly(database) {
  try {
    database.exec("ROLLBACK");
  } catch {
    // The original transaction error is more useful than a secondary rollback error.
  }
}

function snapshotRecord(record) {
  if (!isPlainObject(record)) {
    throw new SqliteMemoryStoreError("INVALID_RECORD", "record must be a plain object");
  }
  let snapshot;
  try {
    snapshot = structuredClone(record);
  } catch (cause) {
    throw new SqliteMemoryStoreError("INVALID_RECORD", "record must be cloneable", { cause });
  }
  const required = ["project_id", "layer", "memory_record_id", "version", "content_hash"];
  if (
    required.some((field) => snapshot[field] === undefined)
    || typeof snapshot.project_id !== "string"
    || typeof snapshot.layer !== "string"
    || typeof snapshot.memory_record_id !== "string"
    || !Number.isSafeInteger(snapshot.version)
    || snapshot.version < 1
    || typeof snapshot.content_hash !== "string"
  ) {
    throw new SqliteMemoryStoreError("INVALID_RECORD", "record identity is incomplete or malformed");
  }
  return snapshot;
}

function snapshotOutboxEntry(entry) {
  if (!isPlainObject(entry)) {
    throw new SqliteMemoryStoreError("INVALID_OUTBOX_ENTRY", "outbox_entry must be a plain object");
  }
  let snapshot;
  try {
    const keys = Reflect.ownKeys(entry);
    if (keys.some((key) => typeof key !== "string" || !OUTBOX_EVENT_KEYS.includes(key))) throw new Error("unknown outbox field");
    if (OUTBOX_EVENT_KEYS.some((key) => !Object.prototype.hasOwnProperty.call(entry, key))) throw new Error("missing outbox field");
    snapshot = Object.fromEntries(OUTBOX_EVENT_KEYS.map((key) => [key, entry[key]]));
  } catch (cause) {
    throw new SqliteMemoryStoreError("INVALID_OUTBOX_ENTRY", "outbox_entry could not be snapshotted safely", { cause });
  }
  const admittedMs = Date.parse(snapshot.admitted_at);
  if (
    typeof snapshot.outbox_id !== "string"
    || !/^[a-f0-9]{64}$/.test(snapshot.outbox_id)
    || snapshot.type !== "MEMORY_ADMISSION_DISPOSITION"
    || snapshot.disposition !== "COMMITTED"
    || ["idempotency_key", "project_id", "layer", "memory_record_id", "content_hash", "actor_id", "classification"].some((field) => typeof snapshot[field] !== "string" || snapshot[field] === "")
    || !Number.isSafeInteger(snapshot.version)
    || snapshot.version < 1
    || !Number.isFinite(admittedMs)
    || new Date(admittedMs).toISOString() !== snapshot.admitted_at
  ) {
    throw new SqliteMemoryStoreError("INVALID_OUTBOX_ENTRY", "outbox_entry is incomplete or malformed");
  }
  const { outbox_id: claimedId, ...eventBody } = snapshot;
  if (canonicalFingerprint(eventBody) !== claimedId) {
    throw new SqliteMemoryStoreError("INVALID_OUTBOX_ENTRY", "outbox_id must match the canonical event body");
  }
  return Object.freeze(snapshot);
}

async function boundedCall(operation, timeoutMs) {
  let timer;
  const operationPromise = Promise.resolve().then(operation).then(
    (value) => ({ status: "ok", value }),
    () => ({ status: "error" })
  );
  const timeoutPromise = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ status: "timeout" }), timeoutMs);
  });
  const outcome = await Promise.race([operationPromise, timeoutPromise]);
  clearTimeout(timer);
  return outcome.status === "timeout" ? { ...outcome, settled: operationPromise } : outcome;
}

function receiptFromRow(row, created) {
  return Object.freeze({
    status: "COMMITTED",
    idempotency_key: row.idempotency_key,
    memory_record_id: row.memory_record_id,
    version: row.record_version,
    content_hash: row.content_hash,
    record_fingerprint: row.record_fingerprint,
    created,
    sequence: Number(row.sequence)
  });
}

function decodeStoredRow(row) {
  try {
    const record = JSON.parse(row.record_json);
    validateContract("memoryRecord", record);
    if (
      record.project_id !== row.project_id
      || record.layer !== row.layer
      || record.memory_record_id !== row.memory_record_id
      || record.version !== row.record_version
      || record.content_hash !== row.content_hash
      || canonicalFingerprint(record) !== row.record_fingerprint
    ) {
      throw new Error("stored columns and record payload differ");
    }
    return record;
  } catch (cause) {
    throw new SqliteMemoryStoreError("INTEGRITY_VIOLATION", "stored memory record failed integrity verification", { cause });
  }
}

function decodeOutboxRow(row) {
  try {
    const event = snapshotOutboxEntry(JSON.parse(row.event_json));
    if (
      event.outbox_id !== row.outbox_id
      || event.idempotency_key !== row.idempotency_key
      || canonicalFingerprint(event) !== row.event_fingerprint
      || !["PENDING", "DELIVERED"].includes(row.delivery_status)
      || !Number.isSafeInteger(row.delivery_attempts)
      || row.delivery_attempts < 0
      || (row.delivery_status === "DELIVERED" && typeof row.delivered_at !== "string")
    ) throw new Error("outbox columns and payload differ");
    return Object.freeze({
      outbox_id: row.outbox_id,
      event_fingerprint: row.event_fingerprint,
      delivery_status: row.delivery_status,
      delivery_attempts: row.delivery_attempts,
      delivered_at: row.delivered_at,
      event
    });
  } catch (cause) {
    throw new SqliteMemoryStoreError("OUTBOX_INTEGRITY_VIOLATION", "stored outbox event failed integrity verification", { cause });
  }
}

export function createSqliteMemoryRecordStore({ databasePath, busyTimeoutMs = 5_000 } = {}) {
  if (typeof databasePath !== "string" || databasePath.trim() === "") {
    throw new SqliteMemoryStoreError("INVALID_DATABASE_PATH", "databasePath must be a non-empty string");
  }
  if (!Number.isSafeInteger(busyTimeoutMs) || busyTimeoutMs < 0 || busyTimeoutMs > 60_000) {
    throw new SqliteMemoryStoreError("INVALID_BUSY_TIMEOUT", "busyTimeoutMs must be an integer from 0 through 60000");
  }

  let DatabaseSync;
  try {
    ({ DatabaseSync } = require("node:sqlite"));
    if (typeof DatabaseSync !== "function") throw new Error("DatabaseSync is unavailable");
  } catch (cause) {
    throw new SqliteMemoryStoreError(
      "SQLITE_UNAVAILABLE",
      "node:sqlite is unavailable; this optional adapter requires an enabled Node.js SQLite runtime",
      { cause }
    );
  }

  let database;
  try {
    database = new DatabaseSync(databasePath);
    database.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = ${busyTimeoutMs};
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;

      CREATE TABLE IF NOT EXISTS memory_records (
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

      CREATE TABLE IF NOT EXISTS memory_admission_receipts (
        idempotency_key TEXT PRIMARY KEY,
        sequence INTEGER NOT NULL UNIQUE,
        record_fingerprint TEXT NOT NULL,
        FOREIGN KEY (sequence) REFERENCES memory_records(sequence) ON DELETE RESTRICT
      );

      CREATE TABLE IF NOT EXISTS memory_audit_outbox (
        outbox_id TEXT PRIMARY KEY,
        idempotency_key TEXT NOT NULL UNIQUE,
        event_fingerprint TEXT NOT NULL,
        event_json TEXT NOT NULL,
        delivery_status TEXT NOT NULL CHECK (delivery_status IN ('PENDING', 'DELIVERED')),
        delivery_attempts INTEGER NOT NULL DEFAULT 0,
        delivered_at TEXT,
        FOREIGN KEY (idempotency_key) REFERENCES memory_admission_receipts(idempotency_key) ON DELETE RESTRICT
      );
    `);
  } catch (cause) {
    try { database?.close(); } catch { /* construction already failed */ }
    throw new SqliteMemoryStoreError("DATABASE_OPEN_FAILED", "SQLite memory store could not be opened", { cause });
  }

  const selectReceipt = database.prepare(`
    SELECT r.sequence, r.project_id, r.layer, r.memory_record_id, r.record_version, r.content_hash,
           r.record_json, a.idempotency_key, a.record_fingerprint
      FROM memory_admission_receipts AS a
      JOIN memory_records AS r ON r.sequence = a.sequence
     WHERE a.idempotency_key = ?
  `);
  const selectIdentity = database.prepare(`
    SELECT sequence, project_id, layer, memory_record_id, record_version,
           content_hash, record_fingerprint, record_json
      FROM memory_records
     WHERE project_id = ? AND layer = ? AND memory_record_id = ? AND record_version = ?
  `);
  const selectLeased = database.prepare(`
    SELECT sequence, project_id, layer, memory_record_id, record_version,
           content_hash, record_fingerprint, record_json
      FROM memory_records
     WHERE project_id = ? AND layer = ? AND memory_record_id = ?
       AND record_version = ? AND content_hash = ? AND record_fingerprint = ?
  `);
  const insertRecord = database.prepare(`
    INSERT INTO memory_records (
      project_id, layer, memory_record_id, record_version, content_hash,
      record_fingerprint, record_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertReceipt = database.prepare(`
    INSERT INTO memory_admission_receipts (idempotency_key, sequence, record_fingerprint)
    VALUES (?, ?, ?)
  `);
  const readAll = database.prepare(`
    SELECT sequence, project_id, layer, memory_record_id, record_version,
           content_hash, record_fingerprint, record_json
      FROM memory_records
     ORDER BY sequence
  `);
  const selectOutboxById = database.prepare(`
    SELECT outbox_id, idempotency_key, event_fingerprint, event_json,
           delivery_status, delivery_attempts, delivered_at
      FROM memory_audit_outbox
     WHERE outbox_id = ?
  `);
  const selectOutboxByIdempotency = database.prepare(`
    SELECT outbox_id, idempotency_key, event_fingerprint, event_json,
           delivery_status, delivery_attempts, delivered_at
      FROM memory_audit_outbox
     WHERE idempotency_key = ?
  `);
  const insertOutbox = database.prepare(`
    INSERT INTO memory_audit_outbox (
      outbox_id, idempotency_key, event_fingerprint, event_json, delivery_status
    ) VALUES (?, ?, ?, ?, 'PENDING')
  `);
  const selectPendingOutbox = database.prepare(`
    SELECT outbox_id, idempotency_key, event_fingerprint, event_json,
           delivery_status, delivery_attempts, delivered_at
      FROM memory_audit_outbox
     WHERE delivery_status = 'PENDING'
     ORDER BY rowid
     LIMIT ?
  `);
  const markOutboxDeliveredStatement = database.prepare(`
    UPDATE memory_audit_outbox
       SET delivery_status = 'DELIVERED', delivery_attempts = delivery_attempts + 1, delivered_at = ?
     WHERE outbox_id = ? AND event_fingerprint = ? AND delivery_status = 'PENDING'
  `);
  const incrementOutboxAttempt = database.prepare(`
    UPDATE memory_audit_outbox
       SET delivery_attempts = delivery_attempts + 1
     WHERE outbox_id = ? AND event_fingerprint = ? AND delivery_status = 'PENDING'
  `);

  let closed = false;
  let leaseActive = false;
  let pendingOperations = 0;
  let operationTail = Promise.resolve();
  const leaseContext = new AsyncLocalStorage();
  const leaseToken = Object.freeze({ store: databasePath });

  function assertOpen() {
    if (closed) throw new SqliteMemoryStoreError("STORE_CLOSED", "SQLite memory store is closed");
  }

  function enqueue(operation) {
    pendingOperations += 1;
    const result = operationTail.then(operation, operation);
    operationTail = result.then(
      () => { pendingOperations -= 1; },
      () => { pendingOperations -= 1; }
    );
    return result;
  }

  function resolveOrInsertRecord(snapshot, idempotencyKey, fingerprint, recordJson) {
    const prior = selectReceipt.get(idempotencyKey);
    if (prior !== undefined) {
      const priorRecord = decodeStoredRow(prior);
      const { admitted_at: priorAdmittedAt, ...priorStableBody } = priorRecord;
      const { admitted_at: proposedAdmittedAt, ...proposedStableBody } = snapshot;
      if (
        prior.project_id !== snapshot.project_id
        || prior.layer !== snapshot.layer
        || prior.memory_record_id !== snapshot.memory_record_id
        || prior.record_version !== snapshot.version
        || prior.content_hash !== snapshot.content_hash
        || canonicalFingerprint(priorStableBody) !== canonicalFingerprint(proposedStableBody)
      ) {
        throw new SqliteMemoryStoreError("IDEMPOTENCY_CONFLICT", "idempotency key is already bound to different record content");
      }
      return receiptFromRow(prior, false);
    }

    const occupied = selectIdentity.get(snapshot.project_id, snapshot.layer, snapshot.memory_record_id, snapshot.version);
    if (occupied !== undefined) {
      throw new SqliteMemoryStoreError("IDENTITY_CONFLICT", "memory identity and version are already occupied");
    }

    const inserted = insertRecord.run(
      snapshot.project_id,
      snapshot.layer,
      snapshot.memory_record_id,
      snapshot.version,
      snapshot.content_hash,
      fingerprint,
      recordJson
    );
    const sequence = Number(inserted.lastInsertRowid);
    insertReceipt.run(idempotencyKey, sequence, fingerprint);
    return Object.freeze({
      status: "COMMITTED",
      idempotency_key: idempotencyKey,
      memory_record_id: snapshot.memory_record_id,
      version: snapshot.version,
      content_hash: snapshot.content_hash,
      record_fingerprint: fingerprint,
      created: true,
      sequence
    });
  }

  function appendAtomic(snapshot, idempotencyKey, fingerprint, recordJson) {
    assertOpen();
    try {
      database.exec("BEGIN IMMEDIATE");
      const receipt = resolveOrInsertRecord(snapshot, idempotencyKey, fingerprint, recordJson);
      database.exec("COMMIT");
      return receipt;
    } catch (cause) {
      rollbackQuietly(database);
      if (cause instanceof SqliteMemoryStoreError) throw cause;
      throw new SqliteMemoryStoreError("APPEND_FAILED", "atomic memory append failed", { cause });
    }
  }

  function append(record, options = {}) {
    assertOpen();
    if (leaseContext.getStore() === leaseToken) {
      throw new SqliteMemoryStoreError("LEASE_REENTRANCY_DENIED", "append is denied from inside this store's read-lease callback");
    }
    let idempotencyKey;
    try {
      idempotencyKey = options?.idempotency_key;
    } catch (cause) {
      throw new SqliteMemoryStoreError("INVALID_IDEMPOTENCY_KEY", "idempotency_key could not be inspected", { cause });
    }
    if (typeof idempotencyKey !== "string" || idempotencyKey === "") {
      throw new SqliteMemoryStoreError("INVALID_IDEMPOTENCY_KEY", "idempotency_key must be a non-empty string");
    }
    const snapshot = snapshotRecord(record);
    const fingerprint = canonicalFingerprint(snapshot);
    const recordJson = JSON.stringify(snapshot);
    return enqueue(() => appendAtomic(snapshot, idempotencyKey, fingerprint, recordJson));
  }

  function appendWithOutboxAtomic(snapshot, idempotencyKey, fingerprint, recordJson, outboxSource) {
    assertOpen();
    try {
      database.exec("BEGIN IMMEDIATE");
      const receipt = resolveOrInsertRecord(snapshot, idempotencyKey, fingerprint, recordJson);
      const persisted = selectReceipt.get(idempotencyKey);
      const persistedRecord = decodeStoredRow(persisted);
      const outboxEntry = snapshotOutboxEntry(
        typeof outboxSource === "function" ? outboxSource(persistedRecord, receipt) : outboxSource
      );
      if (
        outboxEntry.idempotency_key !== idempotencyKey
        || outboxEntry.project_id !== persistedRecord.project_id
        || outboxEntry.layer !== persistedRecord.layer
        || outboxEntry.memory_record_id !== persistedRecord.memory_record_id
        || outboxEntry.version !== persistedRecord.version
        || outboxEntry.content_hash !== persistedRecord.content_hash
        || outboxEntry.admitted_at !== persistedRecord.admitted_at
        || outboxEntry.actor_id !== persistedRecord.actor_id
        || outboxEntry.classification !== persistedRecord.classification
      ) {
        throw new SqliteMemoryStoreError("OUTBOX_BINDING_MISMATCH", "outbox event does not match the durable memory record");
      }

      const eventJson = JSON.stringify(outboxEntry);
      const eventFingerprint = canonicalFingerprint(outboxEntry);
      const existing = selectOutboxByIdempotency.get(idempotencyKey);
      if (existing === undefined) {
        insertOutbox.run(outboxEntry.outbox_id, idempotencyKey, eventFingerprint, eventJson);
      } else if (
        existing.outbox_id !== outboxEntry.outbox_id
        || existing.event_fingerprint !== eventFingerprint
        || existing.event_json !== eventJson
      ) {
        throw new SqliteMemoryStoreError("OUTBOX_CONFLICT", "idempotency key is already bound to a different outbox event");
      }
      const outbox = decodeOutboxRow(selectOutboxById.get(outboxEntry.outbox_id));
      database.exec("COMMIT");
      return Object.freeze({ receipt, outbox });
    } catch (cause) {
      rollbackQuietly(database);
      if (cause instanceof SqliteMemoryStoreError) throw cause;
      throw new SqliteMemoryStoreError("APPEND_WITH_OUTBOX_FAILED", "atomic memory append with outbox failed", { cause });
    }
  }

  function appendWithOutbox(record, options = {}) {
    assertOpen();
    if (leaseContext.getStore() === leaseToken) {
      throw new SqliteMemoryStoreError("LEASE_REENTRANCY_DENIED", "appendWithOutbox is denied from inside this store's read-lease callback");
    }
    let idempotencyKey;
    let outboxSource;
    try {
      if (!isPlainObject(options)) throw new Error("options is not a plain object");
      const optionKeys = Reflect.ownKeys(options);
      if (optionKeys.some((key) => typeof key !== "string" || !["idempotency_key", "outbox_entry", "outbox_entry_factory"].includes(key))) {
        throw new Error("unknown atomic append option");
      }
      const hasEntry = Object.prototype.hasOwnProperty.call(options, "outbox_entry");
      const hasFactory = Object.prototype.hasOwnProperty.call(options, "outbox_entry_factory");
      if (hasEntry === hasFactory) throw new Error("exactly one outbox source is required");
      idempotencyKey = options.idempotency_key;
      outboxSource = hasFactory ? options.outbox_entry_factory : snapshotOutboxEntry(options.outbox_entry);
    } catch (cause) {
      throw new SqliteMemoryStoreError("INVALID_OUTBOX_ENTRY", "atomic append options could not be inspected", { cause });
    }
    if (typeof idempotencyKey !== "string" || idempotencyKey === "") {
      throw new SqliteMemoryStoreError("INVALID_IDEMPOTENCY_KEY", "idempotency_key must be a non-empty string");
    }
    if (typeof outboxSource !== "function" && !isPlainObject(outboxSource)) {
      throw new SqliteMemoryStoreError("INVALID_OUTBOX_ENTRY", "outbox source must be an entry or synchronous factory");
    }
    const snapshot = snapshotRecord(record);
    const fingerprint = canonicalFingerprint(snapshot);
    const recordJson = JSON.stringify(snapshot);
    return enqueue(() => appendWithOutboxAtomic(snapshot, idempotencyKey, fingerprint, recordJson, outboxSource));
  }

  function read() {
    assertOpen();
    try {
      return readAll.all().map(decodeStoredRow);
    } catch (cause) {
      if (cause instanceof SqliteMemoryStoreError) throw cause;
      throw new SqliteMemoryStoreError("READ_FAILED", "memory records could not be read", { cause });
    }
  }

  function readOutbox({ status = "PENDING", limit = 100 } = {}) {
    assertOpen();
    if (status !== "PENDING") {
      throw new SqliteMemoryStoreError("INVALID_OUTBOX_QUERY", "only PENDING outbox reads are exposed by this candidate port");
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
      throw new SqliteMemoryStoreError("INVALID_OUTBOX_QUERY", "outbox limit must be an integer from 1 through 1000");
    }
    try {
      return selectPendingOutbox.all(limit).map(decodeOutboxRow);
    } catch (cause) {
      if (cause instanceof SqliteMemoryStoreError) throw cause;
      throw new SqliteMemoryStoreError("OUTBOX_READ_FAILED", "pending outbox events could not be read", { cause });
    }
  }

  function recordOutboxAttempt(outboxId, eventFingerprint, deliveredAt = null) {
    return enqueue(() => {
      assertOpen();
      try {
        database.exec("BEGIN IMMEDIATE");
        const before = selectOutboxById.get(outboxId);
        if (before === undefined || before.event_fingerprint !== eventFingerprint) {
          throw new SqliteMemoryStoreError("OUTBOX_RECEIPT_MISMATCH", "outbox delivery receipt does not match a pending event");
        }
        if (before.delivery_status === "DELIVERED") {
          database.exec("COMMIT");
          return decodeOutboxRow(before);
        }
        if (deliveredAt === null) {
          incrementOutboxAttempt.run(outboxId, eventFingerprint);
        } else {
          markOutboxDeliveredStatement.run(deliveredAt, outboxId, eventFingerprint);
        }
        const after = decodeOutboxRow(selectOutboxById.get(outboxId));
        database.exec("COMMIT");
        return after;
      } catch (cause) {
        rollbackQuietly(database);
        if (cause instanceof SqliteMemoryStoreError) throw cause;
        throw new SqliteMemoryStoreError("OUTBOX_UPDATE_FAILED", "outbox delivery state could not be updated", { cause });
      }
    });
  }

  async function dispatchOutbox(deliver, { timeoutMs = 250, limit = 100, now = () => new Date() } = {}) {
    assertOpen();
    if (typeof deliver !== "function" || typeof now !== "function") {
      throw new SqliteMemoryStoreError("INVALID_OUTBOX_DISPATCH", "deliver and now functions are required");
    }
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_NODE_TIMEOUT_MS) {
      throw new SqliteMemoryStoreError("INVALID_OUTBOX_DISPATCH", "timeoutMs must be within the Node.js timer range");
    }
    const pending = readOutbox({ status: "PENDING", limit });
    const results = [];
    for (const item of pending) {
      const outcome = await boundedCall(() => deliver(item.event), timeoutMs);
      if (outcome.status === "ok") {
        let deliveredAt;
        try {
          const epochMs = Date.prototype.getTime.call(now());
          if (!Number.isFinite(epochMs)) throw new Error("invalid delivery clock");
          deliveredAt = new Date(epochMs).toISOString();
        } catch (cause) {
          await recordOutboxAttempt(item.outbox_id, item.event_fingerprint);
          throw new SqliteMemoryStoreError("OUTBOX_CLOCK_UNAVAILABLE", "outbox delivery clock is unavailable", { cause });
        }
        const updated = await recordOutboxAttempt(item.outbox_id, item.event_fingerprint, deliveredAt);
        results.push(Object.freeze({ outbox_id: item.outbox_id, delivery: "DELIVERED", record: updated }));
      } else {
        const updated = await recordOutboxAttempt(item.outbox_id, item.event_fingerprint);
        results.push(Object.freeze({
          outbox_id: item.outbox_id,
          delivery: outcome.status === "timeout" ? "TIMEOUT_PENDING" : "FAILED_PENDING",
          record: updated
        }));
      }
    }
    return Object.freeze(results);
  }

  async function withReadLeaseAtomic(leaseSelector, callback) {
    assertOpen();
    try {
      database.exec("BEGIN IMMEDIATE");
      leaseActive = true;
      const args = [
        leaseSelector.project_id,
        leaseSelector.layer,
        leaseSelector.memory_record_id,
        leaseSelector.version,
        leaseSelector.content_hash,
        leaseSelector.record_fingerprint
      ];
      const before = selectLeased.get(...args);
      const row = before === undefined ? null : decodeStoredRow(before);
      const callbackResult = await leaseContext.run(leaseToken, () => callback(row));
      const after = selectLeased.get(...args);
      if (
        (before === undefined) !== (after === undefined)
        || (before !== undefined && (
          before.sequence !== after.sequence
          || before.record_json !== after.record_json
          || before.record_fingerprint !== after.record_fingerprint
        ))
      ) {
        throw new SqliteMemoryStoreError("LEASE_FENCE_VIOLATED", "leased memory record changed before transaction commit");
      }
      database.exec("COMMIT");
      return callbackResult;
    } catch (cause) {
      rollbackQuietly(database);
      if (cause instanceof SqliteMemoryStoreError) throw cause;
      throw new SqliteMemoryStoreError("LEASE_FAILED", "leased memory read failed", { cause });
    } finally {
      leaseActive = false;
    }
  }

  function withReadLease(selector, callback) {
    assertOpen();
    if (leaseContext.getStore() === leaseToken) {
      throw new SqliteMemoryStoreError("LEASE_REENTRANCY_DENIED", "nested read leases are denied");
    }
    if (!isPlainObject(selector) || typeof callback !== "function") {
      throw new SqliteMemoryStoreError("INVALID_LEASE_REQUEST", "selector and callback are required");
    }
    const fields = ["project_id", "layer", "memory_record_id", "version", "content_hash", "record_fingerprint"];
    let leaseSelector;
    try {
      leaseSelector = Object.fromEntries(fields.map((field) => [field, selector[field]]));
    } catch (cause) {
      throw new SqliteMemoryStoreError("INVALID_LEASE_REQUEST", "selector could not be inspected", { cause });
    }
    if (
      fields.some((field) => leaseSelector[field] === undefined)
      || !Number.isSafeInteger(leaseSelector.version)
      || fields.filter((field) => field !== "version").some((field) => typeof leaseSelector[field] !== "string")
    ) {
      throw new SqliteMemoryStoreError("INVALID_LEASE_REQUEST", "selector identity is incomplete or malformed");
    }
    return enqueue(() => withReadLeaseAtomic(leaseSelector, callback));
  }

  function close() {
    if (closed) return;
    if (leaseActive || pendingOperations > 0) throw new SqliteMemoryStoreError("LEASE_ACTIVE", "store cannot close while operations are active or queued");
    database.close();
    closed = true;
  }

  return Object.freeze({ append, appendWithOutbox, read, readOutbox, dispatchOutbox, withReadLease, close });
}
