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

// Mirrors checkpoint-ledger.mjs's private `checkpointEntry` mapping, so a
// test can call the INHERITED base `DurableLedger.append` directly on a
// `CheckpointLedger` instance — bypassing `appendCheckpoint`'s contract
// validation and (post-fix) its `preWriteCheck` gate entirely. This is the
// same style `durable-ledger.test.mjs`'s own `genericEntry` helper uses to
// exercise the base class directly. Used ONLY to reconstruct ledger states
// that the fixed public API would now refuse to create (e.g. legacy data
// written before this fix, or the reviewer's raw repro), so resolveLatest's
// read-side correctness can be verified independently of the write-side gate.
function rawCheckpointEntry(checkpointRecord, idempotencyKey) {
  return {
    entryId: checkpointRecord.checkpoint_id,
    projectId: checkpointRecord.project_id,
    workPackageId: checkpointRecord.work_package_id,
    sessionId: checkpointRecord.session_id,
    actorId: checkpointRecord.actor_id,
    type: "CHECKPOINT",
    payload: checkpointRecord,
    timestamp: checkpointRecord.created_at,
    idempotencyKey
  };
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

// --- Ordering fix (bst/mod-runtime-s1-checkpoint-ordering-fix-001) ----------
// Closes mod-runtime-s1-checkpoint-ledger-second-independent-review-001 §1
// (REQUEST_CHANGES): "latest" must mean highest sequence_at_checkpoint
// (content order), not highest ledger-append-order sequence, and a regressed
// checkpoint must be denied at write time, not merely mis-resolved at read
// time.

test("appendCheckpoint denies the reviewer's exact reproduction: sequence_at_checkpoint 10 then 3 for the same session is rejected at write time", () => withTempLedger((directory) => {
  const ledger = new CheckpointLedger({ filePath: join(directory, "checkpoints.ndjson") });
  ledger.appendCheckpoint(
    checkpoint({ checkpoint_id: "chk_a", sequence_at_checkpoint: 10 }),
    { expectedSequence: 0, idempotencyKey: "idem_a" }
  );

  // Same actor_id as the first checkpoint here, to isolate the ordering
  // gate from the separate actor_id-continuity gate (covered by its own
  // tests below, including the reviewer's actor_HOSTILE variant).
  assert.throws(
    () => ledger.appendCheckpoint(
      checkpoint({ checkpoint_id: "chk_b", sequence_at_checkpoint: 3 }),
      { expectedSequence: 1, idempotencyKey: "idem_b" }
    ),
    (error) => error instanceof LedgerError && error.code === "DENY_CHECKPOINT_REGRESSION"
  );

  // The rejected write must not have been persisted, and resolveLatest must
  // still correctly report the un-regressed checkpoint as latest.
  assert.equal(ledger.verify().count, 1);
  const latest = ledger.resolveLatest("ses_local_test_001");
  assert.equal(latest.checkpoint.checkpoint_id, "chk_a");
  assert.equal(latest.checkpoint.sequence_at_checkpoint, 10);
}));

test("appendCheckpoint denies a checkpoint whose sequence_at_checkpoint merely repeats (not strictly greater than) the current latest", () => withTempLedger((directory) => {
  const ledger = new CheckpointLedger({ filePath: join(directory, "checkpoints.ndjson") });
  ledger.appendCheckpoint(checkpoint({ sequence_at_checkpoint: 5 }), { expectedSequence: 0, idempotencyKey: "idem_1" });
  assert.throws(
    () => ledger.appendCheckpoint(
      checkpoint({ checkpoint_id: "chk_repeat", sequence_at_checkpoint: 5 }),
      { expectedSequence: 1, idempotencyKey: "idem_2" }
    ),
    (error) => error instanceof LedgerError && error.code === "DENY_CHECKPOINT_REGRESSION"
  );
}));

test("appendCheckpoint continues to accept a legitimate strictly-increasing sequence_at_checkpoint series exactly as before", () => withTempLedger((directory) => {
  const ledger = new CheckpointLedger({ filePath: join(directory, "checkpoints.ndjson") });
  const first = ledger.appendCheckpoint(checkpoint({ sequence_at_checkpoint: 1 }), { expectedSequence: 0, idempotencyKey: "idem_1" });
  const second = ledger.appendCheckpoint(
    checkpoint({ checkpoint_id: "chk_p0_test_002", sequence_at_checkpoint: 5 }),
    { expectedSequence: 1, idempotencyKey: "idem_2" }
  );
  const third = ledger.appendCheckpoint(
    checkpoint({ checkpoint_id: "chk_p0_test_003", sequence_at_checkpoint: 42 }),
    { expectedSequence: 2, idempotencyKey: "idem_3" }
  );
  assert.equal(first.sequence, 1);
  assert.equal(second.sequence, 2);
  assert.equal(third.sequence, 3);

  const latest = ledger.resolveLatest("ses_local_test_001");
  assert.equal(latest.checkpoint.checkpoint_id, "chk_p0_test_003");
  assert.equal(latest.checkpoint.sequence_at_checkpoint, 42);
}));

test("regression monotonicity is scoped per (session_id, source_ledger_id): a lower sequence_at_checkpoint on a DIFFERENT source ledger for the same session is not a regression", () => withTempLedger((directory) => {
  const ledger = new CheckpointLedger({ filePath: join(directory, "checkpoints.ndjson") });
  ledger.appendCheckpoint(
    checkpoint({ checkpoint_id: "chk_a", source_ledger_id: "secb-event-ledger", sequence_at_checkpoint: 10 }),
    { expectedSequence: 0, idempotencyKey: "idem_a" }
  );
  // Same session_id, a DIFFERENT source_ledger_id, lower sequence_at_checkpoint
  // -- this is a different progress counter entirely, not a regression of the
  // first one.
  const second = ledger.appendCheckpoint(
    checkpoint({ checkpoint_id: "chk_b", source_ledger_id: "secb-other-event-ledger", sequence_at_checkpoint: 1 }),
    { expectedSequence: 1, idempotencyKey: "idem_b" }
  );
  assert.equal(second.sequence, 2);
}));

test("resolveLatest resolves by sequence_at_checkpoint content order, independent of ledger append order, against a ledger state the fixed write-side gate would now refuse to create (e.g. legacy pre-fix data)", () => withTempLedger((directory) => {
  const ledger = new CheckpointLedger({ filePath: join(directory, "checkpoints.ndjson") });
  // Bypasses appendCheckpoint's preWriteCheck by calling the inherited base
  // DurableLedger.append directly, reproducing the reviewer's exact ledger
  // shape (append-order 1 = sequence_at_checkpoint 10, append-order 2 =
  // sequence_at_checkpoint 3, same session) so resolveLatest's read-side fix
  // is proven correct even when such a ledger state exists (e.g. rows written
  // before this fix shipped).
  ledger.append(
    rawCheckpointEntry(checkpoint({ checkpoint_id: "chk_a", sequence_at_checkpoint: 10 }), "idem_a"),
    { expectedSequence: 0 }
  );
  ledger.append(
    rawCheckpointEntry(checkpoint({ checkpoint_id: "chk_b", sequence_at_checkpoint: 3, actor_id: "actor_HOSTILE" }), "idem_b"),
    { expectedSequence: 1 }
  );

  const latest = ledger.resolveLatest("ses_local_test_001");
  assert.equal(latest.code, "ALLOW");
  assert.equal(latest.checkpoint.checkpoint_id, "chk_a", "must resolve the higher sequence_at_checkpoint, not the higher ledger-append sequence");
  assert.equal(latest.checkpoint.sequence_at_checkpoint, 10);
  assert.equal(latest.sequence, 1, "ledger-append sequence of the resolved record is 1, confirming this is NOT append-order selection");
}));

// --- actor_id continuity (second independent review §2, advisory) ----------
// Analogous to goal-graph-service.mjs's producerActorId immutability fix
// (bst/mod-work-sod-version-spoof-fix-001): actor_id is pinned to a
// session's first-ever-recorded checkpoint.

test("appendCheckpoint denies a checkpoint whose actor_id differs from the session's first-recorded checkpoint (reviewer's actor_HOSTILE scenario)", () => withTempLedger((directory) => {
  const ledger = new CheckpointLedger({ filePath: join(directory, "checkpoints.ndjson") });
  ledger.appendCheckpoint(
    checkpoint({ checkpoint_id: "chk_a", actor_id: "actor_A", sequence_at_checkpoint: 1 }),
    { expectedSequence: 0, idempotencyKey: "idem_a" }
  );

  assert.throws(
    () => ledger.appendCheckpoint(
      checkpoint({ checkpoint_id: "chk_b", actor_id: "actor_HOSTILE", sequence_at_checkpoint: 2 }),
      { expectedSequence: 1, idempotencyKey: "idem_b" }
    ),
    (error) => error instanceof LedgerError && error.code === "DENY_ACTOR_ID_IMMUTABLE"
  );
  assert.equal(ledger.verify().count, 1);
}));

test("appendCheckpoint accepts subsequent checkpoints for the same session when actor_id matches the first-recorded checkpoint", () => withTempLedger((directory) => {
  const ledger = new CheckpointLedger({ filePath: join(directory, "checkpoints.ndjson") });
  ledger.appendCheckpoint(
    checkpoint({ checkpoint_id: "chk_a", actor_id: "actor_A", sequence_at_checkpoint: 1 }),
    { expectedSequence: 0, idempotencyKey: "idem_a" }
  );
  const second = ledger.appendCheckpoint(
    checkpoint({ checkpoint_id: "chk_b", actor_id: "actor_A", sequence_at_checkpoint: 2 }),
    { expectedSequence: 1, idempotencyKey: "idem_b" }
  );
  assert.equal(second.sequence, 2);
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
