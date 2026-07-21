import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ContractValidationError } from "../src/contracts/contract-validator.mjs";
import { DurableLedger, LedgerError } from "../src/ledger/durable-ledger.mjs";
import { EventLedger, EvidenceLedger } from "../src/ledger/governed-ledgers.mjs";

function event(overrides = {}) {
  return {
    event_id: "evt_p0_ledger_001",
    version: 1,
    project_id: "prj_secb_local",
    work_package_id: "wp_p0_ledger_001",
    session_id: "ses_local_ledger_001",
    actor_id: "codex-local",
    event_type: "TRANSITION_REQUESTED",
    occurred_at: "2026-07-17T12:50:00+07:00",
    observed_fact: { from: "DRAFT", to: "PLANNED" },
    source: "state-machine",
    idempotency_key: "idem_event_001",
    classification: "INTERNAL",
    content_hash: "f".repeat(64),
    ...overrides
  };
}

function evidence(overrides = {}) {
  return {
    evidence_id: "ev_p0_ledger_001",
    version: 1,
    project_id: "prj_secb_local",
    work_package_id: "wp_p0_ledger_001",
    session_id: "ses_local_ledger_001",
    actor_id: "codex-local",
    evidence_type: "test-result",
    source: "npm test",
    observed_at: "2026-07-17T12:50:00+07:00",
    procedure: "Run ledger tests",
    result: "PASS",
    exit_status: 0,
    limitations: ["local file store"],
    content_hash: "e".repeat(64),
    verification_status: "CAPTURED",
    classification: "INTERNAL",
    retention_policy: "phase0-bootstrap",
    ...overrides
  };
}

function withTempLedger(operation) {
  const directory = mkdtempSync(join(tmpdir(), "secb-ledger-"));
  try {
    return operation(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("event ledger persists a verifiable hash chain across instances", () => withTempLedger((directory) => {
  const path = join(directory, "events.ndjson");
  const firstLedger = new EventLedger({ filePath: path });
  const first = firstLedger.appendEvent(event(), { expectedSequence: 0 });
  const second = firstLedger.appendEvent(event({
    event_id: "evt_p0_ledger_002",
    idempotency_key: "idem_event_002",
    observed_fact: { from: "PLANNED", to: "REVIEWED" }
  }), { expectedSequence: 1 });
  assert.equal(first.sequence, 1);
  assert.equal(second.sequence, 2);
  assert.equal(second.previousHash, first.recordHash);

  const reopened = new EventLedger({ filePath: path });
  assert.deepEqual(reopened.verify(), {
    valid: true,
    ledgerId: "secb-event-ledger",
    count: 2,
    headHash: second.recordHash
  });
}));

test("identical ledger append replays and conflicting reuse is denied", () => withTempLedger((directory) => {
  const ledger = new EventLedger({ filePath: join(directory, "events.ndjson") });
  const first = ledger.appendEvent(event(), { expectedSequence: 0 });
  const replay = ledger.appendEvent(event(), { expectedSequence: 0 });
  assert.equal(replay.recordHash, first.recordHash);
  assert.equal(replay.replayed, true);
  assert.throws(
    () => ledger.appendEvent(event({ observed_fact: { changed: true } }), { expectedSequence: 1 }),
    (error) => error instanceof LedgerError && error.code === "DENY_IDEMPOTENCY_CONFLICT"
  );
}));

test("stale optimistic sequence is denied", () => withTempLedger((directory) => {
  const ledger = new EventLedger({ filePath: join(directory, "events.ndjson") });
  ledger.appendEvent(event(), { expectedSequence: 0 });
  assert.throws(
    () => ledger.appendEvent(event({ event_id: "evt_002", idempotency_key: "idem_002" }), { expectedSequence: 0 }),
    (error) => error instanceof LedgerError && error.code === "DENY_SEQUENCE_CONFLICT"
  );
}));

test("tampering is detected before records are returned", () => withTempLedger((directory) => {
  const path = join(directory, "events.ndjson");
  const ledger = new EventLedger({ filePath: path });
  ledger.appendEvent(event(), { expectedSequence: 0 });
  const tampered = readFileSync(path, "utf8").replace("DRAFT", "ACTIVE");
  writeFileSync(path, tampered, "utf8");
  assert.throws(
    () => ledger.read(),
    (error) => error instanceof LedgerError && error.code === "LEDGER_INTEGRITY_FAILURE"
  );
}));

test("an existing writer lock fails closed", () => withTempLedger((directory) => {
  const path = join(directory, "events.ndjson");
  const ledger = new EventLedger({ filePath: path });
  mkdirSync(`${path}.lock`);
  assert.throws(
    () => ledger.appendEvent(event(), { expectedSequence: 0 }),
    (error) => error instanceof LedgerError && error.code === "LEDGER_BUSY"
  );
}));

test("evidence ledger validates contracts before durable append", () => withTempLedger((directory) => {
  const ledger = new EvidenceLedger({ filePath: join(directory, "evidence.ndjson") });
  const appended = ledger.appendEvidence(evidence(), { expectedSequence: 0, idempotencyKey: "idem_evidence_001" });
  assert.equal(appended.sequence, 1);
  assert.equal(ledger.verify().count, 1);
  assert.throws(
    () => ledger.appendEvidence(evidence({ verification_status: "TRUST_ME" }), { expectedSequence: 1, idempotencyKey: "idem_evidence_002" }),
    (error) => error instanceof ContractValidationError && error.code === "DENY_CONTRACT_INVALID"
  );
}));

test("generic ledger rejects malformed entry and invalid expected sequence", () => withTempLedger((directory) => {
  const ledger = new DurableLedger({ filePath: join(directory, "generic.ndjson"), ledgerId: "test-ledger" });
  assert.throws(() => ledger.append(null, { expectedSequence: 0 }), (error) => error.code === "DENY_MALFORMED_ENTRY");
  assert.throws(
    () => ledger.append({
      entryId: "entry_001",
      projectId: "prj",
      workPackageId: "wp",
      sessionId: "ses",
      actorId: "actor",
      type: "test",
      payload: {},
      timestamp: "2026-07-17T12:50:00+07:00",
      idempotencyKey: "idem"
    }, { expectedSequence: -1 }),
    (error) => error.code === "DENY_INVALID_EXPECTED_SEQUENCE"
  );
}));

test("generic ledger rejects invalid payloads and timestamps", () => withTempLedger((directory) => {
  const ledger = new DurableLedger({ filePath: join(directory, "generic.ndjson"), ledgerId: "test-ledger" });
  const base = {
    entryId: "entry_001",
    projectId: "prj",
    workPackageId: "wp",
    sessionId: "ses",
    actorId: "actor",
    type: "test",
    payload: {},
    timestamp: "2026-07-17T12:50:00+07:00",
    idempotencyKey: "idem"
  };
  assert.throws(() => ledger.append({ ...base, payload: [] }, { expectedSequence: 0 }), (error) => error.code === "DENY_INVALID_PAYLOAD");
  assert.throws(() => ledger.append({ ...base, timestamp: "not-a-date" }, { expectedSequence: 0 }), (error) => error.code === "DENY_INVALID_TIMESTAMP");
}));

// --- preWriteCheck hook (mod-wspace-s3-single-writer-toctou-fix-001) --------
//
// Added so a subclass business-rule gate (e.g. WorkspaceLeaseLedger's
// single-writer-per-session check) can run atomically with the write, inside
// this SAME lock-held, freshly-read-and-verified critical section, instead of
// the subclass taking its own separate unlocked `read()` snapshot before
// calling append() (a TOCTOU race — see
// docs/03-project-control/candidates/mod-wspace-s3-second-independent-review-001.md
// §3 and the producer verification record for this fix).

function genericEntry(overrides = {}) {
  return {
    entryId: "entry_001",
    projectId: "prj",
    workPackageId: "wp",
    sessionId: "ses",
    actorId: "actor",
    type: "test",
    payload: {},
    timestamp: "2026-07-17T12:50:00+07:00",
    idempotencyKey: "idem",
    ...overrides
  };
}

test("preWriteCheck receives the SAME freshly-read, freshly-verified records this write is about to use, and a truthy return aborts the write without persisting", () => withTempLedger((directory) => {
  const ledger = new DurableLedger({ filePath: join(directory, "generic.ndjson"), ledgerId: "test-ledger" });
  ledger.append(genericEntry(), { expectedSequence: 0 });

  let seenRecordsLength;
  let seenEntry;
  const veto = Object.freeze({ ok: false, code: "DENY_TEST_VETO" });
  const entry2 = genericEntry({ entryId: "entry_002", idempotencyKey: "idem2" });

  const result = ledger.append(entry2, {
    expectedSequence: 1,
    preWriteCheck: (records, entry) => {
      seenRecordsLength = records.length;
      seenEntry = entry;
      return veto;
    }
  });

  assert.equal(seenRecordsLength, 1, "preWriteCheck must see the just-appended prior record");
  assert.deepEqual(seenEntry, entry2, "preWriteCheck must see the same entry content");
  assert.notEqual(seenEntry, entry2, "preWriteCheck must receive a clone, not the caller's own entry object");
  assert.equal(result, veto, "a truthy preWriteCheck return value is returned as-is from append()");
  assert.equal(ledger.read().length, 1, "the vetoed entry must NOT be persisted");
}));

test("preWriteCheck returning a falsy value lets the append proceed exactly as if no hook were passed", () => withTempLedger((directory) => {
  const ledger = new DurableLedger({ filePath: join(directory, "generic.ndjson"), ledgerId: "test-ledger" });
  ledger.append(genericEntry(), { expectedSequence: 0 });

  const entry2 = genericEntry({ entryId: "entry_002", idempotencyKey: "idem2" });
  const allowed = ledger.append(entry2, { expectedSequence: 1, preWriteCheck: () => null });

  assert.equal(allowed.sequence, 2);
  assert.equal(allowed.replayed, false);
  assert.equal(ledger.read().length, 2);
}));

test("preWriteCheck receives a structuredClone of records, not internal mutable state", () => withTempLedger((directory) => {
  const ledger = new DurableLedger({ filePath: join(directory, "generic.ndjson"), ledgerId: "test-ledger" });
  ledger.append(genericEntry(), { expectedSequence: 0 });

  const entry2 = genericEntry({ entryId: "entry_002", idempotencyKey: "idem2" });
  ledger.append(entry2, {
    expectedSequence: 1,
    preWriteCheck: (records) => {
      records.length = 0; // mutate the hook's own copy
      records.push({ tampered: true });
      return null;
    }
  });

  // Mutating the hook's argument must not affect what was actually persisted.
  const stored = ledger.read();
  assert.equal(stored.length, 2);
  assert.equal(stored[0].entry.entryId, "entry_001");
}));

test("preWriteCheck mutating its entry argument in place must not corrupt the persisted record", () => withTempLedger((directory) => {
  const ledger = new DurableLedger({ filePath: join(directory, "generic.ndjson"), ledgerId: "test-ledger" });
  ledger.append(genericEntry(), { expectedSequence: 0 });

  const entry2 = genericEntry({ entryId: "entry_002", idempotencyKey: "idem2" });
  const result = ledger.append(entry2, {
    expectedSequence: 1,
    preWriteCheck: (records, entry) => {
      entry.payload = { tampered: true };
      entry.entryId = "tampered_entry";
      return null;
    }
  });

  // The hook's in-place mutation must not desync entryHash (computed before
  // the hook runs) from the persisted entry, and must not affect the caller's
  // own entry2 object.
  assert.equal(result.replayed, false);
  assert.equal(entry2.entryId, "entry_002", "the caller's own entry object must be untouched");
  assert.equal(entry2.payload.tampered, undefined);
  ledger.verify();
  const stored = ledger.read();
  assert.equal(stored[1].entry.entryId, "entry_002");
  assert.equal(stored[1].entry.entryId, "entry_002");
}));

test("append rejects a non-function preWriteCheck", () => withTempLedger((directory) => {
  const ledger = new DurableLedger({ filePath: join(directory, "generic.ndjson"), ledgerId: "test-ledger" });
  assert.throws(
    () => ledger.append(genericEntry(), { expectedSequence: 0, preWriteCheck: "not-a-function" }),
    (error) => error instanceof LedgerError && error.code === "DENY_INVALID_PRE_WRITE_CHECK"
  );
}));

test("invalid JSON and duplicate entry identity fail closed", () => withTempLedger((directory) => {
  const corruptPath = join(directory, "corrupt.ndjson");
  writeFileSync(corruptPath, "{not-json}\n", "utf8");
  const corrupt = new DurableLedger({ filePath: corruptPath, ledgerId: "corrupt-ledger" });
  assert.throws(() => corrupt.verify(), (error) => error.code === "LEDGER_CORRUPT");

  const path = join(directory, "events.ndjson");
  const ledger = new EventLedger({ filePath: path });
  ledger.appendEvent(event(), { expectedSequence: 0 });
  assert.throws(
    () => ledger.appendEvent(event({ idempotency_key: "different-key" }), { expectedSequence: 1 }),
    (error) => error.code === "DENY_DUPLICATE_ENTRY_ID"
  );
}));
