import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

import { canonicalFingerprint } from "../contracts/canonical-fingerprint.mjs";
import { validateContract } from "../contracts/contract-validator.mjs";

const require = createRequire(import.meta.url);
const OUTBOX_EVENT_KEYS = Object.freeze([
  "outbox_id", "type", "disposition", "idempotency_key", "project_id", "layer",
  "memory_record_id", "version", "content_hash", "admitted_at", "actor_id", "classification"
]);
const MAX_NODE_TIMEOUT_MS = 2_147_483_647;
const MAX_SCOPED_READ_LIMIT = 1_000;
const CURRENT_SCHEMA_VERSION = 2;
const OUTBOX_V1_COLUMNS = Object.freeze([
  "outbox_id", "idempotency_key", "event_fingerprint", "event_json",
  "delivery_status", "delivery_attempts", "delivered_at"
]);
const OUTBOX_V2_COLUMNS = Object.freeze([
  ...OUTBOX_V1_COLUMNS, "claim_token", "claimed_at", "claim_expires_at"
]);

const CREATE_CORE_SCHEMA_SQL = `
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
`;

const CREATE_OUTBOX_V2_SQL = `
  CREATE TABLE memory_audit_outbox (
    outbox_id TEXT PRIMARY KEY,
    idempotency_key TEXT NOT NULL UNIQUE,
    event_fingerprint TEXT NOT NULL,
    event_json TEXT NOT NULL,
    delivery_status TEXT NOT NULL CHECK (delivery_status IN ('PENDING', 'IN_FLIGHT', 'DELIVERED')),
    delivery_attempts INTEGER NOT NULL DEFAULT 0 CHECK (delivery_attempts >= 0),
    delivered_at TEXT,
    claim_token TEXT,
    claimed_at TEXT,
    claim_expires_at TEXT,
    CHECK (
      (delivery_status = 'PENDING' AND delivered_at IS NULL AND claim_token IS NULL AND claimed_at IS NULL AND claim_expires_at IS NULL)
      OR (delivery_status = 'IN_FLIGHT' AND delivered_at IS NULL AND claim_token IS NOT NULL AND claimed_at IS NOT NULL AND claim_expires_at IS NOT NULL AND delivery_attempts >= 1)
      OR (delivery_status = 'DELIVERED' AND delivery_attempts >= 1 AND delivered_at IS NOT NULL AND claim_token IS NULL AND claimed_at IS NULL AND claim_expires_at IS NULL)
    ),
    FOREIGN KEY (idempotency_key) REFERENCES memory_admission_receipts(idempotency_key) ON DELETE RESTRICT
  );
`;

const OPERATIONAL_INDEXES = Object.freeze([
  Object.freeze({
    name: "memory_records_scope_sequence_idx",
    table: "memory_records",
    unique: 0,
    partial: 0,
    columns: Object.freeze(["project_id", "layer", "sequence"]),
    sql: "CREATE INDEX IF NOT EXISTS memory_records_scope_sequence_idx ON memory_records(project_id, layer, sequence)"
  }),
  Object.freeze({
    name: "memory_records_scope_anchor_idx",
    table: "memory_records",
    unique: 0,
    partial: 0,
    columns: Object.freeze(["project_id", "layer", "record_version", "content_hash"]),
    sql: "CREATE INDEX IF NOT EXISTS memory_records_scope_anchor_idx ON memory_records(project_id, layer, record_version, content_hash)"
  }),
  Object.freeze({
    name: "memory_outbox_delivery_status_idx",
    table: "memory_audit_outbox",
    unique: 0,
    partial: 0,
    columns: Object.freeze(["delivery_status"]),
    sql: "CREATE INDEX IF NOT EXISTS memory_outbox_delivery_status_idx ON memory_audit_outbox(delivery_status)"
  }),
  Object.freeze({
    name: "memory_outbox_claim_expiry_idx",
    table: "memory_audit_outbox",
    unique: 0,
    partial: 0,
    columns: Object.freeze(["delivery_status", "claim_expires_at"]),
    sql: "CREATE INDEX IF NOT EXISTS memory_outbox_claim_expiry_idx ON memory_audit_outbox(delivery_status, claim_expires_at)"
  }),
  Object.freeze({
    name: "memory_outbox_claim_token_idx",
    table: "memory_audit_outbox",
    unique: 1,
    partial: 1,
    columns: Object.freeze(["claim_token"]),
    sql: "CREATE UNIQUE INDEX IF NOT EXISTS memory_outbox_claim_token_idx ON memory_audit_outbox(claim_token) WHERE claim_token IS NOT NULL"
  })
]);
const CREATE_OPERATIONAL_INDEXES_SQL = `${OPERATIONAL_INDEXES.map((index) => `${index.sql};`).join("\n")}`;

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
    const deliveredMs = typeof row.delivered_at === "string" ? Date.parse(row.delivered_at) : NaN;
    const claimedMs = typeof row.claimed_at === "string" ? Date.parse(row.claimed_at) : NaN;
    const claimExpiresMs = typeof row.claim_expires_at === "string" ? Date.parse(row.claim_expires_at) : NaN;
    if (
      event.outbox_id !== row.outbox_id
      || event.idempotency_key !== row.idempotency_key
      || canonicalFingerprint(event) !== row.event_fingerprint
      || !["PENDING", "IN_FLIGHT", "DELIVERED"].includes(row.delivery_status)
      || !Number.isSafeInteger(row.delivery_attempts)
      || row.delivery_attempts < 0
      || (row.delivery_status === "PENDING" && (
        row.delivered_at !== null
        || row.claim_token !== null
        || row.claimed_at !== null
        || row.claim_expires_at !== null
      ))
      || (row.delivery_status === "IN_FLIGHT" && (
        row.delivered_at !== null
        || row.delivery_attempts < 1
        || typeof row.claim_token !== "string"
        || row.claim_token === ""
        || !Number.isFinite(claimedMs)
        || new Date(claimedMs).toISOString() !== row.claimed_at
        || !Number.isFinite(claimExpiresMs)
        || new Date(claimExpiresMs).toISOString() !== row.claim_expires_at
        || claimExpiresMs <= claimedMs
      ))
      || (row.delivery_status === "DELIVERED" && (
        row.delivery_attempts < 1
        || !Number.isFinite(deliveredMs)
        || new Date(deliveredMs).toISOString() !== row.delivered_at
        || row.claim_token !== null
        || row.claimed_at !== null
        || row.claim_expires_at !== null
      ))
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

function tableExists(database, tableName) {
  return database.prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName) !== undefined;
}

function tableColumns(database, tableName) {
  return database.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name);
}

function sameColumns(actual, expected) {
  return actual.length === expected.length && actual.every((column, index) => column === expected[index]);
}

function normalizedSchemaSql(sql) {
  return typeof sql === "string" ? sql.replace(/[\s;]+/g, " ").trim().toLowerCase() : "";
}

function validateV2OutboxDefinition(database) {
  const row = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'memory_audit_outbox'").get();
  if (normalizedSchemaSql(row?.sql) !== normalizedSchemaSql(CREATE_OUTBOX_V2_SQL)) {
    throw new SqliteMemoryStoreError("SCHEMA_INTEGRITY_VIOLATION", "Memory audit outbox definition does not match schema v2");
  }
}

function validateAllOutboxRows(database) {
  const rows = database.prepare(`
    SELECT outbox_id, idempotency_key, event_fingerprint, event_json,
           delivery_status, delivery_attempts, delivered_at,
           claim_token, claimed_at, claim_expires_at
      FROM memory_audit_outbox
  `).all();
  for (const row of rows) decodeOutboxRow(row);
}

function validateUniqueClaimTokens(database, code) {
  const duplicate = database.prepare(`
    SELECT claim_token, COUNT(*) AS duplicate_count
      FROM memory_audit_outbox
     WHERE claim_token IS NOT NULL
     GROUP BY claim_token
    HAVING COUNT(*) > 1
     LIMIT 1
  `).get();
  if (duplicate !== undefined) {
    throw new SqliteMemoryStoreError(code, "Memory audit outbox contains duplicate non-null claim tokens");
  }
}

function validateOperationalIndexes(database) {
  for (const expected of OPERATIONAL_INDEXES) {
    const listed = database.prepare(`PRAGMA index_list(${expected.table})`).all()
      .find((row) => row.name === expected.name);
    const definition = database.prepare("SELECT tbl_name, sql FROM sqlite_master WHERE type = 'index' AND name = ?").get(expected.name);
    const columns = database.prepare(`PRAGMA index_info(${expected.name})`).all().map((row) => row.name);
    if (
      listed === undefined
      || definition === undefined
      || definition.tbl_name !== expected.table
      || Number(listed.unique) !== expected.unique
      || Number(listed.partial) !== expected.partial
      || columns.length !== expected.columns.length
      || columns.some((column, index) => column !== expected.columns[index])
      || normalizedSchemaSql(definition.sql) !== normalizedSchemaSql(expected.sql.replace(" IF NOT EXISTS", ""))
    ) {
      throw new SqliteMemoryStoreError("SCHEMA_INTEGRITY_VIOLATION", `Operational index ${expected.name} does not match its required definition`);
    }
  }
}

function ensureOperationalIndexes(database) {
  validateUniqueClaimTokens(database, "SCHEMA_INTEGRITY_VIOLATION");
  try {
    database.exec(CREATE_OPERATIONAL_INDEXES_SQL);
  } catch (cause) {
    throw new SqliteMemoryStoreError("SCHEMA_INDEX_FAILED", "SQLite memory operational indexes could not be established", { cause });
  }
  validateOperationalIndexes(database);
}

function initializeSchema(database) {
  const version = Number(database.prepare("PRAGMA user_version").get().user_version);
  if (!Number.isSafeInteger(version) || version < 0 || version > CURRENT_SCHEMA_VERSION) {
    throw new SqliteMemoryStoreError("UNSUPPORTED_SCHEMA_VERSION", `Unsupported SQLite memory schema version: ${version}`);
  }
  const hasRecords = tableExists(database, "memory_records");
  const hasReceipts = tableExists(database, "memory_admission_receipts");
  const hasOutbox = tableExists(database, "memory_audit_outbox");

  if (!hasRecords && !hasReceipts && !hasOutbox) {
    if (version !== 0) throw new SqliteMemoryStoreError("SCHEMA_INTEGRITY_VIOLATION", "Versioned database is missing the memory schema");
    database.exec(`BEGIN IMMEDIATE; ${CREATE_CORE_SCHEMA_SQL} ${CREATE_OUTBOX_V2_SQL} PRAGMA user_version = ${CURRENT_SCHEMA_VERSION}; COMMIT;`);
    validateV2OutboxDefinition(database);
    ensureOperationalIndexes(database);
    return;
  }
  if (!hasRecords || !hasReceipts) {
    throw new SqliteMemoryStoreError("SCHEMA_INTEGRITY_VIOLATION", "Memory schema is only partially present");
  }

  if (!hasOutbox) {
    if (version !== 0 && version !== 1) {
      throw new SqliteMemoryStoreError("SCHEMA_INTEGRITY_VIOLATION", "Current schema version is missing its audit outbox");
    }
    database.exec(`BEGIN IMMEDIATE; ${CREATE_OUTBOX_V2_SQL} PRAGMA user_version = ${CURRENT_SCHEMA_VERSION}; COMMIT;`);
    validateV2OutboxDefinition(database);
    ensureOperationalIndexes(database);
    return;
  }

  const columns = tableColumns(database, "memory_audit_outbox");
  if (sameColumns(columns, OUTBOX_V2_COLUMNS)) {
    if (version !== 0 && version !== CURRENT_SCHEMA_VERSION) {
      throw new SqliteMemoryStoreError("SCHEMA_INTEGRITY_VIOLATION", "Outbox schema and declared version disagree");
    }
    validateV2OutboxDefinition(database);
    validateAllOutboxRows(database);
    if (version === 0) database.exec(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION}`);
    ensureOperationalIndexes(database);
    return;
  }
  if (!sameColumns(columns, OUTBOX_V1_COLUMNS) || (version !== 0 && version !== 1)) {
    throw new SqliteMemoryStoreError("SCHEMA_INTEGRITY_VIOLATION", "Unknown memory audit outbox schema");
  }

  const legacyRows = database.prepare(`
    SELECT outbox_id, idempotency_key, event_fingerprint, event_json,
           delivery_status, delivery_attempts, delivered_at,
           NULL AS claim_token, NULL AS claimed_at, NULL AS claim_expires_at
      FROM memory_audit_outbox
  `).all();
  for (const row of legacyRows) decodeOutboxRow(row);
  try {
    database.exec(`
      BEGIN IMMEDIATE;
      ALTER TABLE memory_audit_outbox RENAME TO memory_audit_outbox_v1;
      ${CREATE_OUTBOX_V2_SQL}
      INSERT INTO memory_audit_outbox (
        outbox_id, idempotency_key, event_fingerprint, event_json,
        delivery_status, delivery_attempts, delivered_at
      )
      SELECT outbox_id, idempotency_key, event_fingerprint, event_json,
             delivery_status, delivery_attempts, delivered_at
        FROM memory_audit_outbox_v1;
      DROP TABLE memory_audit_outbox_v1;
      PRAGMA user_version = ${CURRENT_SCHEMA_VERSION};
      COMMIT;
    `);
  } catch (cause) {
    rollbackQuietly(database);
    throw new SqliteMemoryStoreError("SCHEMA_MIGRATION_FAILED", "SQLite memory schema migration failed", { cause });
  }
  validateAllOutboxRows(database);
  validateV2OutboxDefinition(database);
  ensureOperationalIndexes(database);
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
    `);
    initializeSchema(database);
  } catch (cause) {
    try { database?.close(); } catch { /* construction already failed */ }
    if (cause instanceof SqliteMemoryStoreError) throw cause;
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
  const readScopedPage = database.prepare(`
    SELECT sequence, project_id, layer, memory_record_id, record_version,
           content_hash, record_fingerprint, record_json
      FROM memory_records
     WHERE project_id = ? AND layer = ? AND sequence > ?
     ORDER BY sequence
     LIMIT ?
  `);
  const selectScopedCursorAnchors = database.prepare(`
    SELECT sequence, memory_record_id
      FROM memory_records
     WHERE project_id = ? AND layer = ?
       AND record_version = ? AND content_hash = ?
  `);
  const selectOutboxById = database.prepare(`
    SELECT outbox_id, idempotency_key, event_fingerprint, event_json,
           delivery_status, delivery_attempts, delivered_at,
           claim_token, claimed_at, claim_expires_at
      FROM memory_audit_outbox
     WHERE outbox_id = ?
  `);
  const selectOutboxByIdempotency = database.prepare(`
    SELECT outbox_id, idempotency_key, event_fingerprint, event_json,
           delivery_status, delivery_attempts, delivered_at,
           claim_token, claimed_at, claim_expires_at
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
           delivery_status, delivery_attempts, delivered_at,
           claim_token, claimed_at, claim_expires_at
      FROM memory_audit_outbox
     WHERE delivery_status = 'PENDING'
     ORDER BY rowid
     LIMIT ?
  `);
  const requeueExpiredOutboxClaims = database.prepare(`
    UPDATE memory_audit_outbox
       SET delivery_status = 'PENDING', claim_token = NULL, claimed_at = NULL, claim_expires_at = NULL
     WHERE delivery_status = 'IN_FLIGHT' AND claim_expires_at <= ?
  `);
  const claimOutboxStatement = database.prepare(`
    UPDATE memory_audit_outbox
       SET delivery_status = 'IN_FLIGHT', delivery_attempts = delivery_attempts + 1,
           claim_token = ?, claimed_at = ?, claim_expires_at = ?
     WHERE outbox_id = ? AND event_fingerprint = ? AND delivery_status = 'PENDING'
  `);
  const selectClaimedOutbox = database.prepare(`
    SELECT outbox_id, idempotency_key, event_fingerprint, event_json,
           delivery_status, delivery_attempts, delivered_at,
           claim_token, claimed_at, claim_expires_at
      FROM memory_audit_outbox
     WHERE claim_token = ? AND delivery_status = 'IN_FLIGHT'
  `);
  const markOutboxDeliveredStatement = database.prepare(`
    UPDATE memory_audit_outbox
       SET delivery_status = 'DELIVERED', delivered_at = ?,
           claim_token = NULL, claimed_at = NULL, claim_expires_at = NULL
     WHERE outbox_id = ? AND event_fingerprint = ?
       AND delivery_status = 'IN_FLIGHT' AND claim_token = ?
  `);
  const releaseOutboxClaimStatement = database.prepare(`
    UPDATE memory_audit_outbox
       SET delivery_status = 'PENDING', claim_token = NULL, claimed_at = NULL, claim_expires_at = NULL
     WHERE outbox_id = ? AND event_fingerprint = ?
       AND delivery_status = 'IN_FLIGHT' AND claim_token = ?
  `);

  let closed = false;
  let leaseActive = false;
  let activeDispatches = 0;
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

  function readScoped(options = {}) {
    assertOpen();
    let projectId;
    let layer;
    let limit;
    let after;
    try {
      if (!isPlainObject(options)) throw new Error("options is not a plain object");
      const optionKeys = Reflect.ownKeys(options);
      if (optionKeys.some((key) => typeof key !== "string" || !["project_id", "layer", "limit", "after"].includes(key))) {
        throw new Error("unknown scoped read option");
      }
      projectId = options.project_id;
      layer = options.layer;
      limit = options.limit ?? 100;
      after = options.after ?? null;
    } catch (cause) {
      throw new SqliteMemoryStoreError("INVALID_SCOPED_READ", "scoped read options could not be snapshotted safely", { cause });
    }
    if (
      typeof projectId !== "string" || projectId.trim() === ""
      || typeof layer !== "string" || layer.trim() === ""
      || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_SCOPED_READ_LIMIT
    ) {
      throw new SqliteMemoryStoreError("INVALID_SCOPED_READ", "project_id, layer, or limit is malformed");
    }
    try {
      let afterSequence = 0;
      if (after !== null) {
        const snapshot = structuredClone(after);
        if (!isPlainObject(snapshot)) throw new SqliteMemoryStoreError("INVALID_SCOPED_READ", "cursor anchor is not an object");
        const keys = Reflect.ownKeys(snapshot);
        if (
          keys.length !== 3
          || keys.some((key) => typeof key !== "string" || !["memory_record_id_hash", "version", "content_hash"].includes(key))
          || typeof snapshot.memory_record_id_hash !== "string" || !/^[a-f0-9]{64}$/.test(snapshot.memory_record_id_hash)
          || !Number.isSafeInteger(snapshot.version) || snapshot.version < 1
          || typeof snapshot.content_hash !== "string" || !/^[a-f0-9]{64}$/.test(snapshot.content_hash)
        ) throw new SqliteMemoryStoreError("INVALID_SCOPED_READ", "cursor anchor is malformed");
        const anchors = selectScopedCursorAnchors.all(
          projectId,
          layer,
          snapshot.version,
          snapshot.content_hash
        ).filter((candidate) => canonicalFingerprint({ memory_record_id: candidate.memory_record_id }) === snapshot.memory_record_id_hash);
        if (anchors.length !== 1 || !Number.isSafeInteger(Number(anchors[0].sequence)) || Number(anchors[0].sequence) < 1) {
          throw new SqliteMemoryStoreError("INVALID_SCOPED_READ", "cursor anchor is unavailable in this scope");
        }
        afterSequence = Number(anchors[0].sequence);
      }
      const rows = readScopedPage.all(projectId, layer, afterSequence, limit + 1);
      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;
      const records = pageRows.map(decodeStoredRow);
      return Object.freeze({
        records: Object.freeze(records),
        has_more: hasMore
      });
    } catch (cause) {
      if (cause instanceof SqliteMemoryStoreError) throw cause;
      throw new SqliteMemoryStoreError("SCOPED_READ_FAILED", "scoped memory records could not be read", { cause });
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

  function claimOutboxBatch(limit, claimedAt, claimExpiresAt) {
    return enqueue(() => {
      assertOpen();
      try {
        database.exec("BEGIN IMMEDIATE");
        requeueExpiredOutboxClaims.run(claimedAt);
        const pending = selectPendingOutbox.all(limit).map(decodeOutboxRow);
        const claimed = [];
        for (const item of pending) {
          const claimToken = randomUUID();
          const update = claimOutboxStatement.run(
            claimToken,
            claimedAt,
            claimExpiresAt,
            item.outbox_id,
            item.event_fingerprint
          );
          if (Number(update.changes) !== 1) {
            throw new SqliteMemoryStoreError("OUTBOX_CLAIM_CONFLICT", "pending outbox event could not be claimed atomically");
          }
          const row = selectClaimedOutbox.get(claimToken);
          const record = decodeOutboxRow(row);
          claimed.push(Object.freeze({ claim_token: claimToken, record }));
        }
        database.exec("COMMIT");
        return Object.freeze(claimed);
      } catch (cause) {
        rollbackQuietly(database);
        if (cause instanceof SqliteMemoryStoreError) throw cause;
        throw new SqliteMemoryStoreError("OUTBOX_CLAIM_FAILED", "outbox delivery claims could not be acquired", { cause });
      }
    });
  }

  function verifyOutboxIntegrity() {
    assertOpen();
    validateAllOutboxRows(database);
    validateUniqueClaimTokens(database, "OUTBOX_INTEGRITY_VIOLATION");
    validateOperationalIndexes(database);
    return Object.freeze({ verified: true });
  }

  function settleOutboxClaim(claimed, deliveredAt = null) {
    return enqueue(() => {
      assertOpen();
      try {
        database.exec("BEGIN IMMEDIATE");
        const before = selectOutboxById.get(claimed.record.outbox_id);
        if (before !== undefined) decodeOutboxRow(before);
        if (
          before === undefined
          || before.event_fingerprint !== claimed.record.event_fingerprint
          || before.delivery_status !== "IN_FLIGHT"
          || before.claim_token !== claimed.claim_token
        ) {
          database.exec("COMMIT");
          return null;
        }
        const update = deliveredAt === null
          ? releaseOutboxClaimStatement.run(claimed.record.outbox_id, claimed.record.event_fingerprint, claimed.claim_token)
          : markOutboxDeliveredStatement.run(deliveredAt, claimed.record.outbox_id, claimed.record.event_fingerprint, claimed.claim_token);
        if (Number(update.changes) !== 1) {
          throw new SqliteMemoryStoreError("OUTBOX_CLAIM_CONFLICT", "outbox claim changed before settlement");
        }
        const after = decodeOutboxRow(selectOutboxById.get(claimed.record.outbox_id));
        database.exec("COMMIT");
        return after;
      } catch (cause) {
        rollbackQuietly(database);
        if (cause instanceof SqliteMemoryStoreError) throw cause;
        throw new SqliteMemoryStoreError("OUTBOX_UPDATE_FAILED", "outbox delivery claim could not be settled", { cause });
      }
    });
  }

  async function dispatchOutbox(deliver, options = {}) {
    assertOpen();
    activeDispatches += 1;
    try {
      let timeoutMs;
      let claimTtlMs;
      let limit;
      let now;
      try {
        if (!isPlainObject(options)) throw new Error("options is not a plain object");
        const optionKeys = Reflect.ownKeys(options);
        if (optionKeys.some((key) => typeof key !== "string" || !["timeoutMs", "claimTtlMs", "limit", "now"].includes(key))) {
          throw new Error("unknown dispatch option");
        }
        timeoutMs = options.timeoutMs ?? 250;
        claimTtlMs = options.claimTtlMs;
        limit = options.limit ?? 100;
        now = options.now ?? (() => new Date());
      } catch (cause) {
        throw new SqliteMemoryStoreError("INVALID_OUTBOX_DISPATCH", "outbox dispatch options could not be snapshotted safely", { cause });
      }
      if (typeof deliver !== "function" || typeof now !== "function") {
        throw new SqliteMemoryStoreError("INVALID_OUTBOX_DISPATCH", "deliver and now functions are required");
      }
      if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs >= MAX_NODE_TIMEOUT_MS) {
        throw new SqliteMemoryStoreError("INVALID_OUTBOX_DISPATCH", "timeoutMs must be within the Node.js timer range");
      }
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
        throw new SqliteMemoryStoreError("INVALID_OUTBOX_DISPATCH", "limit must be an integer from 1 through 1000");
      }
      const minimumClaimTtlMs = timeoutMs * limit;
      if (!Number.isSafeInteger(minimumClaimTtlMs) || minimumClaimTtlMs >= MAX_NODE_TIMEOUT_MS) {
        throw new SqliteMemoryStoreError("INVALID_OUTBOX_DISPATCH", "timeoutMs multiplied by limit exceeds the claim lease range");
      }
      claimTtlMs ??= Math.min(MAX_NODE_TIMEOUT_MS, minimumClaimTtlMs * 2 + 1);
      if (!Number.isSafeInteger(claimTtlMs) || claimTtlMs <= minimumClaimTtlMs || claimTtlMs > MAX_NODE_TIMEOUT_MS) {
        throw new SqliteMemoryStoreError("INVALID_OUTBOX_DISPATCH", "claimTtlMs must exceed timeoutMs multiplied by limit and fit the timer range");
      }
      let claimedMs;
      let claimedAt;
      let claimExpiresAt;
      try {
        claimedMs = Date.prototype.getTime.call(now());
        if (!Number.isFinite(claimedMs) || claimedMs + claimTtlMs > 8_640_000_000_000_000) throw new Error("invalid claim clock");
        claimedAt = new Date(claimedMs).toISOString();
        claimExpiresAt = new Date(claimedMs + claimTtlMs).toISOString();
      } catch (cause) {
        throw new SqliteMemoryStoreError("OUTBOX_CLOCK_UNAVAILABLE", "outbox claim clock is unavailable", { cause });
      }
      const claimed = await claimOutboxBatch(limit, claimedAt, claimExpiresAt);
      const results = [];
      for (const item of claimed) {
        const outcome = await boundedCall(() => deliver(item.record.event), timeoutMs);
        // At-least-once contract: only an explicit `true` acknowledges delivery.
        // A receiver MUST durably deduplicate by outbox_id because timeout/crash
        // boundaries can cause the same event to be presented again.
        if (outcome.status === "ok" && outcome.value === true) {
          let deliveredAt;
          try {
            const epochMs = Date.prototype.getTime.call(now());
            if (!Number.isFinite(epochMs)) throw new Error("invalid delivery clock");
            deliveredAt = new Date(epochMs).toISOString();
          } catch (cause) {
            await settleOutboxClaim(item);
            throw new SqliteMemoryStoreError("OUTBOX_CLOCK_UNAVAILABLE", "outbox delivery clock is unavailable", { cause });
          }
          const updated = await settleOutboxClaim(item, deliveredAt);
          results.push(Object.freeze({
            outbox_id: item.record.outbox_id,
            delivery: updated === null ? "CLAIM_LOST" : "DELIVERED",
            ...(updated === null ? {} : { record: updated })
          }));
        } else {
          const updated = await settleOutboxClaim(item);
          results.push(Object.freeze({
            outbox_id: item.record.outbox_id,
            delivery: updated === null ? "CLAIM_LOST" : (outcome.status === "timeout" ? "TIMEOUT_PENDING" : "FAILED_PENDING"),
            ...(updated === null ? {} : { record: updated })
          }));
        }
      }
      return Object.freeze(results);
    } finally {
      activeDispatches -= 1;
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
    if (leaseActive || activeDispatches > 0 || pendingOperations > 0) {
      throw new SqliteMemoryStoreError("LEASE_ACTIVE", "store cannot close while leases, dispatches, or operations are active or queued");
    }
    database.close();
    closed = true;
  }

  return Object.freeze({ append, appendWithOutbox, read, readScoped, readOutbox, verifyOutboxIntegrity, dispatchOutbox, withReadLease, close });
}
