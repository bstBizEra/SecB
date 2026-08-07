import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ZERO_HASH = "0".repeat(64);
const requiredEntryFields = [
  "entryId",
  "projectId",
  "workPackageId",
  "sessionId",
  "actorId",
  "type",
  "payload",
  "timestamp",
  "idempotencyKey"
];

export class LedgerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "LedgerError";
    this.code = code;
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function hash(value) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function validateEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new LedgerError("DENY_MALFORMED_ENTRY", "Ledger entry must be an object");
  }
  const missing = requiredEntryFields.filter((field) => entry[field] === undefined || entry[field] === null || entry[field] === "");
  if (missing.length > 0) throw new LedgerError("DENY_MISSING_ENTRY_FIELDS", `Missing entry fields: ${missing.join(", ")}`);
  if (!entry.payload || typeof entry.payload !== "object" || Array.isArray(entry.payload)) {
    throw new LedgerError("DENY_INVALID_PAYLOAD", "Ledger payload must be an object");
  }
  if (!Number.isFinite(Date.parse(entry.timestamp))) {
    throw new LedgerError("DENY_INVALID_TIMESTAMP", "Ledger timestamp must be an ISO date-time");
  }
}

export class DurableLedger {
  #filePath;
  #ledgerId;
  #lockPath;

  constructor({ filePath, ledgerId }) {
    if (!filePath || !ledgerId) throw new LedgerError("INVALID_LEDGER_CONFIG", "filePath and ledgerId are required");
    this.#filePath = resolve(filePath);
    this.#ledgerId = ledgerId;
    this.#lockPath = `${this.#filePath}.lock`;
    mkdirSync(dirname(this.#filePath), { recursive: true });
  }

  #readRecords() {
    if (!existsSync(this.#filePath)) return [];
    const content = readFileSync(this.#filePath, "utf8").trim();
    if (!content) return [];
    try {
      return content.split(/\r?\n/).map((line) => JSON.parse(line));
    } catch (error) {
      throw new LedgerError("LEDGER_CORRUPT", `Ledger contains invalid JSON: ${error.message}`);
    }
  }

  #verifyRecords(records) {
    let previousHash = ZERO_HASH;
    records.forEach((record, index) => {
      const expectedSequence = index + 1;
      const entryHash = hash(record.entry);
      const recordHash = hash({
        ledgerId: record.ledgerId,
        sequence: record.sequence,
        previousHash: record.previousHash,
        entryHash
      });
      if (
        record.ledgerId !== this.#ledgerId
        || record.sequence !== expectedSequence
        || record.previousHash !== previousHash
        || record.entryHash !== entryHash
        || record.recordHash !== recordHash
      ) {
        throw new LedgerError("LEDGER_INTEGRITY_FAILURE", `Ledger integrity failed at sequence ${expectedSequence}`);
      }
      previousHash = record.recordHash;
    });
    return previousHash;
  }

  verify() {
    const records = this.#readRecords();
    const headHash = this.#verifyRecords(records);
    return { valid: true, ledgerId: this.#ledgerId, count: records.length, headHash };
  }

  read() {
    const records = this.#readRecords();
    this.#verifyRecords(records);
    return structuredClone(records);
  }

  // `preWriteCheck` (optional): a subclass business-rule hook invoked INSIDE
  // this same lock-held, freshly-read-and-verified critical section, after the
  // base structural checks (idempotency replay, duplicate entryId, optimistic
  // sequence) and immediately before the record is persisted. It receives a
  // structuredClone of the just-verified `records` and a structuredClone of
  // the candidate `entry` (so a subclass cannot mutate append()'s internal
  // working state in either argument — `entryHash` above is computed from
  // the pre-hook `entry`, so an in-place mutation of the original object
  // would otherwise desync `entryHash` from the persisted `entry` and cause
  // LEDGER_INTEGRITY_FAILURE on every later read()/verify()). If it
  // returns a truthy value, that value is returned AS-IS from append() and
  // NOTHING is written — the lock is still released via `finally` below. If it
  // returns a falsy value (or is omitted entirely), the append proceeds
  // exactly as before.
  //
  // This exists so a subclass invariant that depends on "what else is
  // currently in the chain" (e.g. WorkspaceLeaseLedger's single-writer-per-
  // session gate) can be evaluated atomically with the write, sharing this
  // lock, instead of the subclass taking its own separate unlocked `read()`
  // snapshot before calling append() — which is not atomic with the locked
  // write and admits a TOCTOU race (see the mod-wspace-s3 single-writer-
  // toctou-fix producer-verification record). Callers that omit
  // `preWriteCheck` (every other ledger subclass) see byte-for-byte identical
  // behavior to before this hook existed.
  append(entry, { expectedSequence, preWriteCheck } = {}) {
    validateEntry(entry);
    if (!Number.isInteger(expectedSequence) || expectedSequence < 0) {
      throw new LedgerError("DENY_INVALID_EXPECTED_SEQUENCE", "expectedSequence must be a non-negative integer");
    }
    if (preWriteCheck !== undefined && typeof preWriteCheck !== "function") {
      throw new LedgerError("DENY_INVALID_PRE_WRITE_CHECK", "preWriteCheck must be a function when provided");
    }

    try {
      mkdirSync(this.#lockPath);
    } catch (error) {
      if (error.code === "EEXIST") throw new LedgerError("LEDGER_BUSY", "Ledger is locked by another writer");
      throw error;
    }

    try {
      const records = this.#readRecords();
      const headHash = this.#verifyRecords(records);
      const entryHash = hash(entry);
      const replay = records.find((record) => record.entry.idempotencyKey === entry.idempotencyKey);
      if (replay) {
        if (replay.entryHash !== entryHash) {
          throw new LedgerError("DENY_IDEMPOTENCY_CONFLICT", "Idempotency key was reused for different ledger content");
        }
        return { ...structuredClone(replay), replayed: true };
      }
      if (records.some((record) => record.entry.entryId === entry.entryId)) {
        throw new LedgerError("DENY_DUPLICATE_ENTRY_ID", `Duplicate entry ID: ${entry.entryId}`);
      }
      if (records.length !== expectedSequence) {
        throw new LedgerError(
          "DENY_SEQUENCE_CONFLICT",
          `Expected sequence ${expectedSequence}, observed ${records.length}`
        );
      }
      if (preWriteCheck) {
        const veto = preWriteCheck(structuredClone(records), structuredClone(entry));
        if (veto) return veto;
      }

      const sequence = records.length + 1;
      const record = {
        ledgerId: this.#ledgerId,
        sequence,
        previousHash: headHash,
        entry: structuredClone(entry),
        entryHash
      };
      record.recordHash = hash({
        ledgerId: record.ledgerId,
        sequence: record.sequence,
        previousHash: record.previousHash,
        entryHash: record.entryHash
      });
      appendFileSync(this.#filePath, `${JSON.stringify(record)}\n`, { encoding: "utf8" });
      return { ...structuredClone(record), replayed: false };
    } finally {
      rmSync(this.#lockPath, { recursive: true, force: true });
    }
  }
}

export { ZERO_HASH };
