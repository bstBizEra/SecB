// WP-MEM-HEAD-ANCHOR-001 candidate. A local, independently persisted,
// authenticated monotonic checkpoint provider for ledger heads. Construction
// and exports do not wire or activate it on any runtime path.

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync,
  renameSync, rmSync, statSync, writeFileSync
} from "node:fs";
import { dirname, resolve } from "node:path";

const ZERO_HASH = "0".repeat(64);
const MAX_ANCHOR_BYTES = 8 * 1024;
const MIN_INTEGRITY_KEY_BYTES = 32;

const isHash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const isBoundedString = (value, max = 256) => typeof value === "string" && value.trim() !== "" && value.length <= max;

function macBody({ version, ledger_id, count, head_hash }) {
  return JSON.stringify({ version, ledger_id, count, head_hash });
}

function macFor(key, state) {
  return createHmac("sha256", key).update(macBody(state), "utf8").digest("hex");
}

function exactCheckpoint(value, label) {
  let snapshot;
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)
      || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
      || Reflect.ownKeys(value).some((key) => typeof key !== "string")
      || Reflect.ownKeys(value).length !== 2 || !Object.hasOwn(value, "count") || !Object.hasOwn(value, "headHash")) throw new Error("shape");
    snapshot = structuredClone(value);
  } catch {
    throw new DurableHeadAnchorError("DENY_HEAD_ANCHOR_REQUEST", `${label} checkpoint is malformed`);
  }
  if (!Number.isSafeInteger(snapshot.count) || snapshot.count < 0 || !isHash(snapshot.headHash)
    || (snapshot.count === 0) !== (snapshot.headHash === ZERO_HASH)) {
    throw new DurableHeadAnchorError("DENY_HEAD_ANCHOR_REQUEST", `${label} checkpoint fields are invalid`);
  }
  return snapshot;
}

export class DurableHeadAnchorError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DurableHeadAnchorError";
    this.code = code;
  }
}

export class DurableHeadAnchor {
  #filePath;
  #lockPath;
  #ledgerId;
  #integrityKey;

  constructor({ filePath, ledgerId, integrityKey } = {}) {
    if (!isBoundedString(filePath, 4_096) || !isBoundedString(ledgerId)) {
      throw new DurableHeadAnchorError("INVALID_HEAD_ANCHOR_CONFIG", "filePath and bounded ledgerId are required");
    }
    let key;
    try {
      if (!(integrityKey instanceof Uint8Array)) throw new Error("not bytes");
      key = Buffer.from(integrityKey);
    } catch {
      throw new DurableHeadAnchorError("INVALID_HEAD_ANCHOR_CONFIG", "integrityKey must be server-owned bytes");
    }
    if (key.length < MIN_INTEGRITY_KEY_BYTES) {
      throw new DurableHeadAnchorError("INVALID_HEAD_ANCHOR_CONFIG", `integrityKey must contain at least ${MIN_INTEGRITY_KEY_BYTES} bytes`);
    }
    this.#filePath = resolve(filePath);
    this.#lockPath = `${this.#filePath}.lock`;
    this.#ledgerId = ledgerId;
    this.#integrityKey = key;
    mkdirSync(dirname(this.#filePath), { recursive: true });
  }

  #readState() {
    if (!existsSync(this.#filePath)) return { version: 1, ledger_id: this.#ledgerId, count: 0, head_hash: ZERO_HASH };
    if (statSync(this.#filePath).size > MAX_ANCHOR_BYTES) {
      throw new DurableHeadAnchorError("HEAD_ANCHOR_RESOURCE_LIMIT", "head anchor file exceeds its size limit");
    }
    let state;
    try { state = JSON.parse(readFileSync(this.#filePath, "utf8")); } catch {
      throw new DurableHeadAnchorError("HEAD_ANCHOR_INTEGRITY_FAILURE", "head anchor is not valid JSON");
    }
    const keys = state && typeof state === "object" && !Array.isArray(state) ? Reflect.ownKeys(state) : [];
    if (keys.length !== 5 || keys.some((key) => typeof key !== "string"
      || !["version", "ledger_id", "count", "head_hash", "mac"].includes(key))
      || state.version !== 1 || state.ledger_id !== this.#ledgerId || !Number.isSafeInteger(state.count) || state.count < 1
      || !isHash(state.head_hash) || state.head_hash === ZERO_HASH || !isHash(state.mac)) {
      throw new DurableHeadAnchorError("HEAD_ANCHOR_INTEGRITY_FAILURE", "head anchor contract is invalid");
    }
    const expectedMac = macFor(this.#integrityKey, state);
    if (!timingSafeEqual(Buffer.from(state.mac, "hex"), Buffer.from(expectedMac, "hex"))) {
      throw new DurableHeadAnchorError("HEAD_ANCHOR_AUTHENTICITY_FAILURE", "head anchor MAC is invalid");
    }
    return state;
  }

  #writeState(state) {
    const signed = { ...state, mac: macFor(this.#integrityKey, state) };
    const encoded = `${JSON.stringify(signed)}\n`;
    if (Buffer.byteLength(encoded, "utf8") > MAX_ANCHOR_BYTES) {
      throw new DurableHeadAnchorError("HEAD_ANCHOR_RESOURCE_LIMIT", "head anchor checkpoint exceeds its size limit");
    }
    const tempPath = `${this.#filePath}.${process.pid}.${randomUUID()}.tmp`;
    let handle;
    try {
      handle = openSync(tempPath, "wx", 0o600);
      writeFileSync(handle, encoded, { encoding: "utf8" });
      fsyncSync(handle);
      closeSync(handle);
      handle = undefined;
      renameSync(tempPath, this.#filePath);
      try { chmodSync(this.#filePath, 0o600); } catch { /* platform ACL remains authoritative */ }
      try {
        const directoryHandle = openSync(dirname(this.#filePath), "r");
        try { fsyncSync(directoryHandle); } finally { closeSync(directoryHandle); }
      } catch { /* directory fsync is unavailable on some Windows filesystems */ }
    } finally {
      if (handle !== undefined) closeSync(handle);
      rmSync(tempPath, { force: true });
    }
  }

  read() {
    const state = this.#readState();
    return Object.freeze({ count: state.count, headHash: state.head_hash });
  }

  compareAndSet({ expected, next } = {}) {
    const expectedCheckpoint = exactCheckpoint(expected, "expected");
    const nextCheckpoint = exactCheckpoint(next, "next");
    if (nextCheckpoint.count !== expectedCheckpoint.count + 1 || nextCheckpoint.headHash === expectedCheckpoint.headHash) {
      throw new DurableHeadAnchorError("DENY_HEAD_ANCHOR_NON_MONOTONIC", "next checkpoint must advance exactly one distinct ledger head");
    }
    try { mkdirSync(this.#lockPath); } catch (cause) {
      if (cause.code === "EEXIST") throw new DurableHeadAnchorError("HEAD_ANCHOR_BUSY", "head anchor is locked by another writer");
      throw new DurableHeadAnchorError("HEAD_ANCHOR_UNAVAILABLE", "head anchor lock could not be acquired");
    }
    try {
      const current = this.#readState();
      if (current.count !== expectedCheckpoint.count || current.head_hash !== expectedCheckpoint.headHash) return false;
      this.#writeState({ version: 1, ledger_id: this.#ledgerId,
        count: nextCheckpoint.count, head_hash: nextCheckpoint.headHash });
      const readback = this.#readState();
      if (readback.count !== nextCheckpoint.count || readback.head_hash !== nextCheckpoint.headHash) {
        throw new DurableHeadAnchorError("HEAD_ANCHOR_DURABILITY_FAILURE", "head anchor readback did not match the committed checkpoint");
      }
      return true;
    } finally {
      rmSync(this.#lockPath, { recursive: true, force: true });
    }
  }
}
