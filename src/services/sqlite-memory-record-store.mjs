import { DatabaseSync } from "node:sqlite";

import { canonicalFingerprint } from "../contracts/canonical-fingerprint.mjs";

export class SqliteMemoryStoreError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "SqliteMemoryStoreError";
    this.code = code;
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
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

function receiptFromRow(row) {
  return Object.freeze({
    status: "COMMITTED",
    idempotency_key: row.idempotency_key,
    memory_record_id: row.memory_record_id,
    version: row.record_version,
    content_hash: row.content_hash,
    record_fingerprint: row.record_fingerprint,
    sequence: Number(row.sequence)
  });
}

export function createSqliteMemoryRecordStore({ databasePath, busyTimeoutMs = 5_000 } = {}) {
  if (typeof databasePath !== "string" || databasePath.trim() === "") {
    throw new SqliteMemoryStoreError("INVALID_DATABASE_PATH", "databasePath must be a non-empty string");
  }
  if (!Number.isSafeInteger(busyTimeoutMs) || busyTimeoutMs < 0 || busyTimeoutMs > 60_000) {
    throw new SqliteMemoryStoreError("INVALID_BUSY_TIMEOUT", "busyTimeoutMs must be an integer from 0 through 60000");
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
    `);
  } catch (cause) {
    try { database?.close(); } catch { /* construction already failed */ }
    throw new SqliteMemoryStoreError("DATABASE_OPEN_FAILED", "SQLite memory store could not be opened", { cause });
  }

  const selectReceipt = database.prepare(`
    SELECT r.sequence, r.project_id, r.layer, r.memory_record_id, r.record_version, r.content_hash,
           a.idempotency_key, a.record_fingerprint
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
  const readAll = database.prepare("SELECT record_json FROM memory_records ORDER BY sequence");

  let closed = false;
  let leaseActive = false;

  function assertOpen() {
    if (closed) throw new SqliteMemoryStoreError("STORE_CLOSED", "SQLite memory store is closed");
  }

  function append(record, { idempotency_key: idempotencyKey } = {}) {
    assertOpen();
    if (leaseActive) throw new SqliteMemoryStoreError("LEASE_REENTRANCY_DENIED", "append is denied while this store holds a read lease");
    if (typeof idempotencyKey !== "string" || idempotencyKey === "") {
      throw new SqliteMemoryStoreError("INVALID_IDEMPOTENCY_KEY", "idempotency_key must be a non-empty string");
    }
    const snapshot = snapshotRecord(record);
    const fingerprint = canonicalFingerprint(snapshot);
    const recordJson = JSON.stringify(snapshot);

    database.exec("BEGIN IMMEDIATE");
    try {
      const prior = selectReceipt.get(idempotencyKey);
      if (prior !== undefined) {
        if (
          prior.project_id !== snapshot.project_id
          || prior.layer !== snapshot.layer
          || prior.memory_record_id !== snapshot.memory_record_id
          || prior.record_version !== snapshot.version
          || prior.content_hash !== snapshot.content_hash
          || prior.record_fingerprint !== fingerprint
        ) {
          throw new SqliteMemoryStoreError("IDEMPOTENCY_CONFLICT", "idempotency key is already bound to different record content");
        }
        database.exec("COMMIT");
        return receiptFromRow(prior);
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
      database.exec("COMMIT");
      return Object.freeze({
        status: "COMMITTED",
        idempotency_key: idempotencyKey,
        memory_record_id: snapshot.memory_record_id,
        version: snapshot.version,
        content_hash: snapshot.content_hash,
        record_fingerprint: fingerprint,
        sequence
      });
    } catch (cause) {
      rollbackQuietly(database);
      if (cause instanceof SqliteMemoryStoreError) throw cause;
      throw new SqliteMemoryStoreError("APPEND_FAILED", "atomic memory append failed", { cause });
    }
  }

  function read() {
    assertOpen();
    try {
      return readAll.all().map(({ record_json: recordJson }) => JSON.parse(recordJson));
    } catch (cause) {
      throw new SqliteMemoryStoreError("READ_FAILED", "memory records could not be read", { cause });
    }
  }

  async function withReadLease(selector, callback) {
    assertOpen();
    if (leaseActive) throw new SqliteMemoryStoreError("LEASE_REENTRANCY_DENIED", "nested read leases are denied");
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

    database.exec("BEGIN IMMEDIATE");
    leaseActive = true;
    try {
      const args = [
        leaseSelector.project_id,
        leaseSelector.layer,
        leaseSelector.memory_record_id,
        leaseSelector.version,
        leaseSelector.content_hash,
        leaseSelector.record_fingerprint
      ];
      const before = selectLeased.get(...args);
      const row = before === undefined ? null : JSON.parse(before.record_json);
      const callbackResult = await callback(row);
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

  function close() {
    if (closed) return;
    if (leaseActive) throw new SqliteMemoryStoreError("LEASE_ACTIVE", "store cannot close while a read lease is active");
    database.close();
    closed = true;
  }

  return Object.freeze({ append, read, withReadLease, close });
}
