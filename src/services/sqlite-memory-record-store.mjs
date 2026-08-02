import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";

import { canonicalFingerprint } from "../contracts/canonical-fingerprint.mjs";
import { validateContract } from "../contracts/contract-validator.mjs";

const require = createRequire(import.meta.url);

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

  function appendAtomic(snapshot, idempotencyKey, fingerprint, recordJson) {
    assertOpen();
    try {
      database.exec("BEGIN IMMEDIATE");
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
        database.exec("COMMIT");
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
      database.exec("COMMIT");
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

  function read() {
    assertOpen();
    try {
      return readAll.all().map(decodeStoredRow);
    } catch (cause) {
      if (cause instanceof SqliteMemoryStoreError) throw cause;
      throw new SqliteMemoryStoreError("READ_FAILED", "memory records could not be read", { cause });
    }
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

  return Object.freeze({ append, read, withReadLease, close });
}
