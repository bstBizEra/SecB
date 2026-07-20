import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ContractValidationError } from "../src/contracts/contract-validator.mjs";
import { CheckpointLedger } from "../src/ledger/checkpoint-ledger.mjs";
import { LedgerError } from "../src/ledger/durable-ledger.mjs";

function checkpoint(overrides = {}) {
  return {
    checkpoint_id: "chk_p0_test_001",
    version: 1,
    project_id: "prj_secb_local",
    work_package_id: "wp_p0_test_001",
    session_id: "ses_local_test_001",
    actor_id: "claude-motor-modruntime-s1",
    source_ledger_id: "secb-event-ledger",
    sequence_at_checkpoint: 1,
    state_snapshot_ref: "opaque://session-snapshots/ses_local_test_001/1",
    created_at: "2026-07-20T18:00:00+07:00",
    content_hash: "a".repeat(64),
    ...overrides
  };
}

function withTempLedger(operation) {
  const directory = mkdtempSync(join(tmpdir(), "secb-checkpoint-ledger-"));
  try {
    return operation(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

// --- Positive path: create / append / read ---------------------------------

test("checkpoint ledger persists a verifiable hash chain across instances", () => withTempLedger((directory) => {
  const path = join(directory, "checkpoints.ndjson");
  const firstLedger = new CheckpointLedger({ filePath: path });
  const first = firstLedger.appendCheckpoint(checkpoint(), { expectedSequence: 0, idempotencyKey: "idem_chk_001" });
  const second = firstLedger.appendCheckpoint(
    checkpoint({ checkpoint_id: "chk_p0_test_002", sequence_at_checkpoint: 2 }),
    { expectedSequence: 1, idempotencyKey: "idem_chk_002" }
  );
  assert.equal(first.sequence, 1);
  assert.equal(second.sequence, 2);
  assert.equal(second.previousHash, first.recordHash);

  const reopened = new CheckpointLedger({ filePath: path });
  assert.deepEqual(reopened.verify(), {
    valid: true,
    ledgerId: "secb-checkpoint-ledger",
    count: 2,
    headHash: second.recordHash
  });
}));

test("appendCheckpoint validates the checkpoint contract before durable append", () => withTempLedger((directory) => {
  const ledger = new CheckpointLedger({ filePath: join(directory, "checkpoints.ndjson") });
  const appended = ledger.appendCheckpoint(checkpoint(), { expectedSequence: 0, idempotencyKey: "idem_chk_001" });
  assert.equal(appended.sequence, 1);
  assert.throws(
    () => ledger.appendCheckpoint(checkpoint({ checkpoint_id: "chk_bad", content_hash: "not-a-hash" }), {
      expectedSequence: 1,
      idempotencyKey: "idem_chk_bad"
    }),
    (error) => error instanceof ContractValidationError && error.code === "DENY_CONTRACT_INVALID"
  );
}));

test("appendCheckpoint requires an idempotency key", () => withTempLedger((directory) => {
  const ledger = new CheckpointLedger({ filePath: join(directory, "checkpoints.ndjson") });
  assert.throws(
    () => ledger.appendCheckpoint(checkpoint(), { expectedSequence: 0 }),
    (error) => error instanceof LedgerError && error.code === "DENY_MISSING_ENTRY_FIELDS"
  );
}));

// --- Restore-lookup primitives (read side) ----------------------------------

test("resolveLatest returns the highest-sequence checkpoint for a session, fail-closed on unknown session", () => withTempLedger((directory) => {
  const ledger = new CheckpointLedger({ filePath: join(directory, "checkpoints.ndjson") });
  ledger.appendCheckpoint(checkpoint({ sequence_at_checkpoint: 1 }), { expectedSequence: 0, idempotencyKey: "idem_1" });
  ledger.appendCheckpoint(
    checkpoint({ checkpoint_id: "chk_p0_test_002", sequence_at_checkpoint: 5 }),
    { expectedSequence: 1, idempotencyKey: "idem_2" }
  );
  ledger.appendCheckpoint(
    checkpoint({
      checkpoint_id: "chk_other_session",
      session_id: "ses_local_other_999",
      sequence_at_checkpoint: 9
    }),
    { expectedSequence: 2, idempotencyKey: "idem_3" }
  );

  const latest = ledger.resolveLatest("ses_local_test_001");
  assert.equal(latest.code, "ALLOW");
  assert.equal(latest.checkpoint.checkpoint_id, "chk_p0_test_002");
  assert.equal(latest.sequence, 2);

  const unknown = ledger.resolveLatest("ses_does_not_exist");
  assert.equal(unknown.code, "DENY_UNKNOWN_SESSION");
  assert.equal(unknown.checkpoint, null);

  const invalid = ledger.resolveLatest("");
  assert.equal(invalid.code, "DENY_INVALID_SESSION_ID");
}));

test("resolveCheckpoint resolves an exact checkpoint id, fail-closed on unknown id", () => withTempLedger((directory) => {
  const ledger = new CheckpointLedger({ filePath: join(directory, "checkpoints.ndjson") });
  ledger.appendCheckpoint(checkpoint(), { expectedSequence: 0, idempotencyKey: "idem_1" });

  const resolved = ledger.resolveCheckpoint("chk_p0_test_001");
  assert.equal(resolved.code, "ALLOW");
  assert.equal(resolved.checkpoint.state_snapshot_ref, "opaque://session-snapshots/ses_local_test_001/1");
  assert.equal(resolved.sequence, 1);

  const unknown = ledger.resolveCheckpoint("chk_never_existed");
  assert.equal(unknown.code, "DENY_UNKNOWN_CHECKPOINT");

  const invalid = ledger.resolveCheckpoint(null);
  assert.equal(invalid.code, "DENY_INVALID_CHECKPOINT_ID");
}));

// --- Idempotency / optimistic concurrency (matches base-class conventions) --

test("identical checkpoint append replays and conflicting idempotency-key reuse is denied", () => withTempLedger((directory) => {
  const ledger = new CheckpointLedger({ filePath: join(directory, "checkpoints.ndjson") });
  const first = ledger.appendCheckpoint(checkpoint(), { expectedSequence: 0, idempotencyKey: "idem_replay" });
  const replay = ledger.appendCheckpoint(checkpoint(), { expectedSequence: 0, idempotencyKey: "idem_replay" });
  assert.equal(replay.recordHash, first.recordHash);
  assert.equal(replay.replayed, true);

  assert.throws(
    () => ledger.appendCheckpoint(
      checkpoint({ checkpoint_id: "chk_p0_test_002", sequence_at_checkpoint: 2 }),
      { expectedSequence: 1, idempotencyKey: "idem_replay" }
    ),
    (error) => error instanceof LedgerError && error.code === "DENY_IDEMPOTENCY_CONFLICT"
  );
}));

test("stale optimistic sequence is denied", () => withTempLedger((directory) => {
  const ledger = new CheckpointLedger({ filePath: join(directory, "checkpoints.ndjson") });
  ledger.appendCheckpoint(checkpoint(), { expectedSequence: 0, idempotencyKey: "idem_1" });
  assert.throws(
    () => ledger.appendCheckpoint(
      checkpoint({ checkpoint_id: "chk_p0_test_002" }),
      { expectedSequence: 0, idempotencyKey: "idem_2" }
    ),
    (error) => error instanceof LedgerError && error.code === "DENY_SEQUENCE_CONFLICT"
  );
}));

test("duplicate checkpoint entry identity fails closed", () => withTempLedger((directory) => {
  const ledger = new CheckpointLedger({ filePath: join(directory, "checkpoints.ndjson") });
  ledger.appendCheckpoint(checkpoint(), { expectedSequence: 0, idempotencyKey: "idem_1" });
  assert.throws(
    () => ledger.appendCheckpoint(checkpoint(), { expectedSequence: 1, idempotencyKey: "idem_different" }),
    (error) => error instanceof LedgerError && error.code === "DENY_DUPLICATE_ENTRY_ID"
  );
}));

test("an existing writer lock fails closed on checkpoint append", () => withTempLedger((directory) => {
  const path = join(directory, "checkpoints.ndjson");
  const ledger = new CheckpointLedger({ filePath: path });
  mkdirSync(`${path}.lock`);
  assert.throws(
    () => ledger.appendCheckpoint(checkpoint(), { expectedSequence: 0, idempotencyKey: "idem_1" }),
    (error) => error instanceof LedgerError && error.code === "LEDGER_BUSY"
  );
}));

// --- Tamper / hash-chain detection (matches durable-ledger.test.mjs rigor) --

test("tampering the checkpoint ledger file is detected before records are returned", () => withTempLedger((directory) => {
  const path = join(directory, "checkpoints.ndjson");
  const ledger = new CheckpointLedger({ filePath: path });
  ledger.appendCheckpoint(checkpoint(), { expectedSequence: 0, idempotencyKey: "idem_1" });
  const tampered = readFileSync(path, "utf8").replace("ses_local_test_001", "ses_hostile_001");
  writeFileSync(path, tampered, "utf8");
  assert.throws(
    () => ledger.read(),
    (error) => error instanceof LedgerError && error.code === "LEDGER_INTEGRITY_FAILURE"
  );
  assert.throws(
    () => ledger.resolveLatest("ses_local_test_001"),
    (error) => error instanceof LedgerError && error.code === "LEDGER_INTEGRITY_FAILURE"
  );
}));

test("a flipped recordHash on a checkpoint entry breaks chain verification", () => withTempLedger((directory) => {
  const path = join(directory, "checkpoints.ndjson");
  const ledger = new CheckpointLedger({ filePath: path });
  ledger.appendCheckpoint(checkpoint(), { expectedSequence: 0, idempotencyKey: "idem_1" });
  ledger.appendCheckpoint(
    checkpoint({ checkpoint_id: "chk_p0_test_002", sequence_at_checkpoint: 2 }),
    { expectedSequence: 1, idempotencyKey: "idem_2" }
  );
  const lines = readFileSync(path, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
  lines[0].recordHash = "f".repeat(64);
  writeFileSync(path, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`, "utf8");
  assert.throws(
    () => ledger.verify(),
    (error) => error instanceof LedgerError && error.code === "LEDGER_INTEGRITY_FAILURE"
  );
}));

test("removing a checkpoint entry breaks the sequence chain", () => withTempLedger((directory) => {
  const path = join(directory, "checkpoints.ndjson");
  const ledger = new CheckpointLedger({ filePath: path });
  ledger.appendCheckpoint(checkpoint(), { expectedSequence: 0, idempotencyKey: "idem_1" });
  ledger.appendCheckpoint(
    checkpoint({ checkpoint_id: "chk_p0_test_002", sequence_at_checkpoint: 2 }),
    { expectedSequence: 1, idempotencyKey: "idem_2" }
  );
  const lines = readFileSync(path, "utf8").trim().split(/\r?\n/);
  writeFileSync(path, `${lines[1]}\n`, "utf8");
  assert.throws(
    () => ledger.verify(),
    (error) => error instanceof LedgerError && error.code === "LEDGER_INTEGRITY_FAILURE"
  );
}));
