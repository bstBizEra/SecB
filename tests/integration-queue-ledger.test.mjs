import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { ContractValidationError, validateContract } from "../src/contracts/contract-validator.mjs";
import { IntegrationQueueLedger } from "../src/ledger/integration-queue-ledger.mjs";
import { LedgerError } from "../src/ledger/durable-ledger.mjs";

const root = resolve(import.meta.dirname, "..");
// The commit this dispatch branched from (origin/main). Every existing file
// this pure-additive slice read must stay byte-identical to it.
const BASE = "385ac65";

const HASH = "a".repeat(64);

function entry(overrides = {}) {
  return {
    queue_entry_id: "iq_test_001",
    version: 1,
    project_id: "prj_secb_local",
    work_package_id: "wp_test_001",
    session_id: "ses_test_001",
    candidate_branch: "bst/test-candidate-001",
    candidate_tip_commit: "0123456789abcdef0123456789abcdef01234567",
    base_ref: "main",
    declared_write_set: ["src/example", "tests/example"],
    status: "SUBMITTED",
    submitted_by: "claude-motor-modintegqueue-s1",
    submitted_at: "2026-07-21T18:00:00+07:00",
    content_hash: HASH,
    ...overrides
  };
}

function withTempLedger(operation) {
  const directory = mkdtempSync(join(tmpdir(), "secb-integration-queue-ledger-"));
  try {
    return operation(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const newLedger = (directory) => new IntegrationQueueLedger({ filePath: join(directory, "queue.ndjson") });

// --- Happy path: append + resolve -------------------------------------------

test("appendEntry persists a verifiable hash chain and resolveActiveClaim returns the live entry", () => withTempLedger((directory) => {
  const path = join(directory, "queue.ndjson");
  const ledger = new IntegrationQueueLedger({ filePath: path });

  const appended = ledger.appendEntry(entry(), { expectedSequence: 0, idempotencyKey: "idem_1" });
  assert.equal(appended.ok, true);
  assert.equal(appended.record.sequence, 1);
  assert.equal(appended.record.replayed, false);

  const resolved = ledger.resolveActiveClaim("bst/test-candidate-001");
  assert.equal(resolved.ok, true);
  assert.equal(resolved.entry.queue_entry_id, "iq_test_001");
  assert.equal(resolved.version, 1);
  assert.equal(resolved.sequence, 1);

  // Chain persists across instances.
  const reopened = new IntegrationQueueLedger({ filePath: path });
  assert.deepEqual(reopened.verify(), {
    valid: true,
    ledgerId: "secb-integration-queue-ledger",
    count: 1,
    headHash: appended.record.recordHash
  });
}));

test("appendEntry validates the integration-queue-entry contract before durable append", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  assert.throws(
    () => ledger.appendEntry(entry({ content_hash: "not-a-hash" }), { expectedSequence: 0, idempotencyKey: "idem_bad" }),
    (error) => error instanceof ContractValidationError && error.code === "DENY_CONTRACT_INVALID"
  );
  // Nothing was persisted by the rejected append.
  assert.equal(ledger.verify().count, 0);
}));

test("appendEntry requires an idempotency key", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  assert.throws(
    () => ledger.appendEntry(entry(), { expectedSequence: 0 }),
    (error) => error instanceof LedgerError && error.code === "DENY_MISSING_ENTRY_FIELDS"
  );
}));

// --- resolveActiveClaim / resolveEntry: fail-closed unknown / invalid -------

test("resolveActiveClaim fails closed on unknown branch and invalid branch id", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  ledger.appendEntry(entry(), { expectedSequence: 0, idempotencyKey: "idem_1" });

  const unknown = ledger.resolveActiveClaim("bst/never-existed");
  assert.equal(unknown.ok, false);
  assert.equal(unknown.code, "DENY_QUEUE_UNKNOWN_BRANCH");

  const badBranch = ledger.resolveActiveClaim("");
  assert.equal(badBranch.code, "DENY_QUEUE_INVALID_BRANCH");
}));

test("resolveActiveClaim reports no active claim once the entry resolves to MERGED/REJECTED", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  ledger.appendEntry(entry(), { expectedSequence: 0, idempotencyKey: "idem_1" });
  ledger.appendEntry(entry({ version: 2, status: "IN_REVIEW" }), { expectedSequence: 1, idempotencyKey: "idem_2" });
  ledger.appendEntry(entry({ version: 3, status: "MERGED" }), { expectedSequence: 2, idempotencyKey: "idem_3" });

  const resolved = ledger.resolveActiveClaim("bst/test-candidate-001");
  assert.equal(resolved.ok, false);
  assert.equal(resolved.code, "DENY_QUEUE_NO_ACTIVE_CLAIM");
}));

test("resolveEntry fails closed on unknown id and invalid id, and resolves the highest version otherwise", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  ledger.appendEntry(entry(), { expectedSequence: 0, idempotencyKey: "idem_1" });
  ledger.appendEntry(entry({ version: 2, status: "IN_REVIEW" }), { expectedSequence: 1, idempotencyKey: "idem_2" });

  const resolved = ledger.resolveEntry("iq_test_001");
  assert.equal(resolved.code, "ALLOW");
  assert.equal(resolved.version, 2);
  assert.equal(resolved.entry.status, "IN_REVIEW");

  const unknown = ledger.resolveEntry("iq_never_existed");
  assert.equal(unknown.code, "DENY_QUEUE_UNKNOWN_ENTRY");

  const badId = ledger.resolveEntry("");
  assert.equal(badId.code, "DENY_QUEUE_INVALID_ID");
}));

// --- Status-transition versioning (self-claim, never a conflict) -----------

test("a status-transition version bump on the SAME queue_entry_id is not a duplicate-claim conflict", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  const first = ledger.appendEntry(entry(), { expectedSequence: 0, idempotencyKey: "idem_v1" });
  assert.equal(first.ok, true);

  const transitioned = ledger.appendEntry(
    entry({ version: 2, status: "IN_REVIEW" }),
    { expectedSequence: 1, idempotencyKey: "idem_v2" }
  );
  assert.equal(transitioned.ok, true);
  assert.equal(transitioned.record.sequence, 2);

  const merged = ledger.appendEntry(
    entry({ version: 3, status: "MERGED" }),
    { expectedSequence: 2, idempotencyKey: "idem_v3" }
  );
  assert.equal(merged.ok, true);
  assert.equal(merged.record.sequence, 3);
}));

test("after MERGED/REJECTED, the same candidate_branch may be resubmitted under a NEW queue_entry_id", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  ledger.appendEntry(entry(), { expectedSequence: 0, idempotencyKey: "idem_1" });
  // SUBMITTED -> IN_REVIEW -> REJECTED: the only legal path to a terminal
  // status (a direct SUBMITTED -> REJECTED skip is itself an invalid
  // transition now denied by DENY_INVALID_STATUS_TRANSITION; covered
  // separately below).
  ledger.appendEntry(entry({ version: 2, status: "IN_REVIEW" }), { expectedSequence: 1, idempotencyKey: "idem_2" });
  ledger.appendEntry(entry({ version: 3, status: "REJECTED" }), { expectedSequence: 2, idempotencyKey: "idem_3" });

  const resubmitted = ledger.appendEntry(
    entry({ queue_entry_id: "iq_test_002", version: 1 }),
    { expectedSequence: 3, idempotencyKey: "idem_4" }
  );
  assert.equal(resubmitted.ok, true);
  assert.equal(resubmitted.record.sequence, 4);
}));

// --- Status-transition validity (atomic preWriteCheck-based gate) ----------
//
// Regression coverage for the exact gap disclosed in the independent review
// (docs/03-project-control/candidates/
// mod-integ-queue-s1-ledger-independent-review-001.md §2): neither the
// schema nor the ledger enforced any status-TRANSITION discipline, so a
// caller could insert `status: "MERGED"` directly as version 1, or walk a
// terminal (MERGED/REJECTED) entry backward to an active status under the
// SAME queue_entry_id. Both scenarios are reproduced here exactly as the
// reviewer described them, then closed by DENY_INVALID_STATUS_TRANSITION.

test("appendEntry denies status: MERGED inserted directly as version 1 (reviewer scenario a)", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  const result = ledger.appendEntry(
    entry({ queue_entry_id: "q1", version: 1, status: "MERGED" }),
    { expectedSequence: 0, idempotencyKey: "idem_1" }
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "DENY_INVALID_STATUS_TRANSITION");
  assert.equal(result.queueEntryId, "q1");
  assert.equal(result.fromStatus, null);
  assert.equal(result.toStatus, "MERGED");
  assert.equal(Object.isFrozen(result), true);
  // Nothing was persisted by the denied append.
  assert.equal(ledger.verify().count, 0);
}));

test("appendEntry denies version 1 inserted directly as REJECTED, or as IN_REVIEW", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  for (const status of ["REJECTED", "IN_REVIEW"]) {
    const result = ledger.appendEntry(
      entry({ queue_entry_id: `q_${status}`, version: 1, status }),
      { expectedSequence: 0, idempotencyKey: `idem_${status}` }
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, "DENY_INVALID_STATUS_TRANSITION");
    assert.equal(result.fromStatus, null);
    assert.equal(result.toStatus, status);
  }
  assert.equal(ledger.verify().count, 0);
}));

test("appendEntry denies a terminal (MERGED) entry followed by any new version under the same queue_entry_id (reviewer scenario b)", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  ledger.appendEntry(entry({ queue_entry_id: "q1" }), { expectedSequence: 0, idempotencyKey: "idem_v1" });
  ledger.appendEntry(entry({ queue_entry_id: "q1", version: 2, status: "IN_REVIEW" }), { expectedSequence: 1, idempotencyKey: "idem_v2" });
  ledger.appendEntry(entry({ queue_entry_id: "q1", version: 3, status: "MERGED" }), { expectedSequence: 2, idempotencyKey: "idem_v3" });

  // Reviewer's exact repro: a terminal entry walked backward to SUBMITTED
  // under the SAME queue_entry_id.
  const backward = ledger.appendEntry(
    entry({ queue_entry_id: "q1", version: 4, status: "SUBMITTED" }),
    { expectedSequence: 3, idempotencyKey: "idem_v4" }
  );
  assert.equal(backward.ok, false);
  assert.equal(backward.code, "DENY_INVALID_STATUS_TRANSITION");
  assert.equal(backward.fromStatus, "MERGED");
  assert.equal(backward.toStatus, "SUBMITTED");
  // Any further version is denied regardless of claimed status, not just SUBMITTED.
  const reaffirmed = ledger.appendEntry(
    entry({ queue_entry_id: "q1", version: 4, status: "MERGED" }),
    { expectedSequence: 3, idempotencyKey: "idem_v4b" }
  );
  assert.equal(reaffirmed.ok, false);
  assert.equal(reaffirmed.code, "DENY_INVALID_STATUS_TRANSITION");
  // Only the 3 legitimate versions were ever persisted.
  assert.equal(ledger.verify().count, 3);
}));

test("appendEntry denies a terminal (REJECTED) entry followed by any new version under the same queue_entry_id", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  ledger.appendEntry(entry({ queue_entry_id: "q2" }), { expectedSequence: 0, idempotencyKey: "idem_v1" });
  ledger.appendEntry(entry({ queue_entry_id: "q2", version: 2, status: "IN_REVIEW" }), { expectedSequence: 1, idempotencyKey: "idem_v2" });
  ledger.appendEntry(entry({ queue_entry_id: "q2", version: 3, status: "REJECTED" }), { expectedSequence: 2, idempotencyKey: "idem_v3" });

  const afterTerminal = ledger.appendEntry(
    entry({ queue_entry_id: "q2", version: 4, status: "IN_REVIEW" }),
    { expectedSequence: 3, idempotencyKey: "idem_v4" }
  );
  assert.equal(afterTerminal.ok, false);
  assert.equal(afterTerminal.code, "DENY_INVALID_STATUS_TRANSITION");
  assert.equal(afterTerminal.fromStatus, "REJECTED");
  assert.equal(ledger.verify().count, 3);
}));

test("appendEntry denies SUBMITTED skipping directly to MERGED or REJECTED (must pass through IN_REVIEW)", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  ledger.appendEntry(entry({ queue_entry_id: "q3" }), { expectedSequence: 0, idempotencyKey: "idem_v1" });

  const skipToMerged = ledger.appendEntry(
    entry({ queue_entry_id: "q3", version: 2, status: "MERGED" }),
    { expectedSequence: 1, idempotencyKey: "idem_v2" }
  );
  assert.equal(skipToMerged.ok, false);
  assert.equal(skipToMerged.code, "DENY_INVALID_STATUS_TRANSITION");
  assert.equal(skipToMerged.fromStatus, "SUBMITTED");
  assert.equal(skipToMerged.toStatus, "MERGED");
  assert.equal(ledger.verify().count, 1);
}));

test("legitimate lifecycle paths still succeed: SUBMITTED -> IN_REVIEW -> MERGED and SUBMITTED -> IN_REVIEW -> REJECTED", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);

  const mergedPath = [
    ledger.appendEntry(entry({ queue_entry_id: "q_merged_path" }), { expectedSequence: 0, idempotencyKey: "idem_m1" }),
    ledger.appendEntry(entry({ queue_entry_id: "q_merged_path", version: 2, status: "IN_REVIEW" }), { expectedSequence: 1, idempotencyKey: "idem_m2" }),
    ledger.appendEntry(entry({ queue_entry_id: "q_merged_path", version: 3, status: "MERGED" }), { expectedSequence: 2, idempotencyKey: "idem_m3" })
  ];
  for (const step of mergedPath) assert.equal(step.ok, true);
  assert.equal(ledger.resolveEntry("q_merged_path").entry.status, "MERGED");

  const rejectedPath = [
    ledger.appendEntry(entry({ queue_entry_id: "q_rejected_path", candidate_branch: "bst/rejected-path" }), { expectedSequence: 3, idempotencyKey: "idem_r1" }),
    ledger.appendEntry(entry({ queue_entry_id: "q_rejected_path", candidate_branch: "bst/rejected-path", version: 2, status: "IN_REVIEW" }), { expectedSequence: 4, idempotencyKey: "idem_r2" }),
    ledger.appendEntry(entry({ queue_entry_id: "q_rejected_path", candidate_branch: "bst/rejected-path", version: 3, status: "REJECTED" }), { expectedSequence: 5, idempotencyKey: "idem_r3" })
  ];
  for (const step of rejectedPath) assert.equal(step.ok, true);
  assert.equal(ledger.resolveEntry("q_rejected_path").entry.status, "REJECTED");
}));

test("a new version re-affirming the SAME non-terminal status (stay) is a legal transition", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  ledger.appendEntry(entry({ queue_entry_id: "q_stay" }), { expectedSequence: 0, idempotencyKey: "idem_1" });
  const staySubmitted = ledger.appendEntry(
    entry({ queue_entry_id: "q_stay", version: 2 }),
    { expectedSequence: 1, idempotencyKey: "idem_2" }
  );
  assert.equal(staySubmitted.ok, true);
  const toReview = ledger.appendEntry(
    entry({ queue_entry_id: "q_stay", version: 3, status: "IN_REVIEW" }),
    { expectedSequence: 2, idempotencyKey: "idem_3" }
  );
  assert.equal(toReview.ok, true);
  const stayReview = ledger.appendEntry(
    entry({ queue_entry_id: "q_stay", version: 4, status: "IN_REVIEW" }),
    { expectedSequence: 3, idempotencyKey: "idem_4" }
  );
  assert.equal(stayReview.ok, true);
  assert.equal(ledger.resolveEntry("q_stay").version, 4);
}));

test("idempotent re-append of the exact same version is unaffected by the new status-transition gate (base-class replay path)", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  const first = ledger.appendEntry(entry({ queue_entry_id: "q_replay" }), { expectedSequence: 0, idempotencyKey: "idem_replay" });
  assert.equal(first.ok, true);

  // Exact same entry + same idempotencyKey: DurableLedger.append's own
  // idempotency-key replay check intercepts this BEFORE preWriteCheck (and
  // therefore before #detectInvalidStatusTransition) is ever invoked again.
  const replay = ledger.appendEntry(entry({ queue_entry_id: "q_replay" }), { expectedSequence: 0, idempotencyKey: "idem_replay" });
  assert.equal(replay.ok, true);
  assert.equal(replay.record.replayed, true);
  assert.equal(replay.record.recordHash, first.record.recordHash);
  assert.equal(ledger.verify().count, 1);

  // A legitimate subsequent version transition after the replay still works normally.
  const advanced = ledger.appendEntry(
    entry({ queue_entry_id: "q_replay", version: 2, status: "IN_REVIEW" }),
    { expectedSequence: 1, idempotencyKey: "idem_replay_v2" }
  );
  assert.equal(advanced.ok, true);
  assert.equal(ledger.verify().count, 2);
}));

// --- Duplicate-claim denial (atomic preWriteCheck-based gate) ---------------

test("appendEntry denies a SECOND active queue_entry_id claiming the same candidate_branch", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  ledger.appendEntry(entry({ queue_entry_id: "iq_A" }), { expectedSequence: 0, idempotencyKey: "idem_A" });

  const conflict = ledger.appendEntry(
    entry({ queue_entry_id: "iq_B" }),
    { expectedSequence: 1, idempotencyKey: "idem_B" }
  );
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, "DENY_QUEUE_DUPLICATE_CLAIM");
  assert.equal(conflict.conflictingQueueEntryId, "iq_A");
  assert.equal(conflict.candidateBranch, "bst/test-candidate-001");
  assert.equal(Object.isFrozen(conflict), true);

  // The denied second claim was NOT persisted.
  assert.equal(ledger.verify().count, 1);
}));

test("duplicate-claim gate also fires while the incumbent is IN_REVIEW (not just SUBMITTED)", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  // version 1 must be SUBMITTED (state-machine rule); advance to IN_REVIEW
  // via a legitimate version-2 transition before exercising the
  // duplicate-claim gate against the IN_REVIEW incumbent.
  ledger.appendEntry(entry({ queue_entry_id: "iq_A" }), { expectedSequence: 0, idempotencyKey: "idem_A_v1" });
  ledger.appendEntry(entry({ queue_entry_id: "iq_A", version: 2, status: "IN_REVIEW" }), { expectedSequence: 1, idempotencyKey: "idem_A" });

  const conflict = ledger.appendEntry(
    entry({ queue_entry_id: "iq_B" }),
    { expectedSequence: 2, idempotencyKey: "idem_B" }
  );
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, "DENY_QUEUE_DUPLICATE_CLAIM");
  assert.equal(conflict.conflictingStatus, "IN_REVIEW");
}));

test("duplicate-claim gate is scoped per candidate_branch: a DIFFERENT branch may claim concurrently", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  ledger.appendEntry(entry({ queue_entry_id: "iq_A", candidate_branch: "bst/branch-a" }), { expectedSequence: 0, idempotencyKey: "idem_A" });

  const other = ledger.appendEntry(
    entry({ queue_entry_id: "iq_C", candidate_branch: "bst/branch-c" }),
    { expectedSequence: 1, idempotencyKey: "idem_C" }
  );
  assert.equal(other.ok, true);
  assert.equal(other.record.sequence, 2);
}));

// --- Inherited hash-chain integrity + idempotency + concurrency -------------

test("identical entry append replays and idempotency-key reuse for different content is denied (inherited)", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  const first = ledger.appendEntry(entry(), { expectedSequence: 0, idempotencyKey: "idem_replay" });
  const replay = ledger.appendEntry(entry(), { expectedSequence: 0, idempotencyKey: "idem_replay" });
  assert.equal(replay.ok, true);
  assert.equal(replay.record.replayed, true);
  assert.equal(replay.record.recordHash, first.record.recordHash);

  // Reuse the same idempotency key for DIFFERENT content, on a DIFFERENT
  // branch so the duplicate-claim gate (checked first) does not pre-empt the
  // inherited idempotency-conflict denial being exercised here.
  assert.throws(
    () => ledger.appendEntry(
      entry({ queue_entry_id: "iq_other", candidate_branch: "bst/other-branch" }),
      { expectedSequence: 1, idempotencyKey: "idem_replay" }
    ),
    (error) => error instanceof LedgerError && error.code === "DENY_IDEMPOTENCY_CONFLICT"
  );
}));

test("stale optimistic sequence and duplicate (queue_entry_id, version) fail closed (inherited)", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  ledger.appendEntry(entry(), { expectedSequence: 0, idempotencyKey: "idem_1" });

  assert.throws(
    () => ledger.appendEntry(
      entry({ queue_entry_id: "iq_x", candidate_branch: "bst/other-branch" }),
      { expectedSequence: 0, idempotencyKey: "idem_2" }
    ),
    (error) => error instanceof LedgerError && error.code === "DENY_SEQUENCE_CONFLICT"
  );

  // Same queue_entry_id AND version = same composite entryId -> duplicate.
  assert.throws(
    () => ledger.appendEntry(entry(), { expectedSequence: 1, idempotencyKey: "idem_dup" }),
    (error) => error instanceof LedgerError && error.code === "DENY_DUPLICATE_ENTRY_ID"
  );
}));

test("an existing writer lock fails closed on entry append (inherited)", () => withTempLedger((directory) => {
  const path = join(directory, "queue.ndjson");
  const ledger = new IntegrationQueueLedger({ filePath: path });
  mkdirSync(`${path}.lock`);
  assert.throws(
    () => ledger.appendEntry(entry(), { expectedSequence: 0, idempotencyKey: "idem_1" }),
    (error) => error instanceof LedgerError && error.code === "LEDGER_BUSY"
  );
}));

test("tampering the queue ledger file is detected before any entry is returned (inherited)", () => withTempLedger((directory) => {
  const path = join(directory, "queue.ndjson");
  const ledger = new IntegrationQueueLedger({ filePath: path });
  ledger.appendEntry(entry(), { expectedSequence: 0, idempotencyKey: "idem_1" });
  const tampered = readFileSync(path, "utf8").replace("bst/test-candidate-001", "bst/hostile-branch");
  writeFileSync(path, tampered, "utf8");
  assert.throws(
    () => ledger.read(),
    (error) => error instanceof LedgerError && error.code === "LEDGER_INTEGRITY_FAILURE"
  );
  assert.throws(
    () => ledger.resolveActiveClaim("bst/test-candidate-001"),
    (error) => error instanceof LedgerError && error.code === "LEDGER_INTEGRITY_FAILURE"
  );
}));

// --- Fixture round-trip through the registered validator ---------------------

test("valid/invalid fixtures round-trip through validateContract('integrationQueueEntry', ...)", () => {
  const valid = JSON.parse(readFileSync(resolve(root, "tests/fixtures/valid/integration-queue-entry.json"), "utf8"));
  assert.deepEqual(validateContract("integrationQueueEntry", valid), { kind: "integrationQueueEntry", valid: true });

  const invalid = JSON.parse(readFileSync(resolve(root, "tests/fixtures/invalid/integration-queue-entry-missing-id.json"), "utf8"));
  assert.throws(
    () => validateContract("integrationQueueEntry", invalid),
    (error) => error instanceof ContractValidationError && error.code === "DENY_CONTRACT_INVALID" && error.errors.length > 0
  );

  // The valid fixture is also durably appendable.
  withTempLedger((directory) => {
    const ledger = newLedger(directory);
    const res = ledger.appendEntry(valid, { expectedSequence: 0, idempotencyKey: "idem_fixture" });
    assert.equal(res.ok, true);
    assert.equal(res.record.entry.payload.queue_entry_id, valid.queue_entry_id);
  });
});

// --- Deep-frozen outputs -----------------------------------------------------

test("resolveActiveClaim returns a deep-frozen result the caller cannot mutate back into the ledger", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  ledger.appendEntry(entry(), { expectedSequence: 0, idempotencyKey: "idem_1" });
  const resolved = ledger.resolveActiveClaim("bst/test-candidate-001");
  assert.equal(Object.isFrozen(resolved), true);
  assert.equal(Object.isFrozen(resolved.entry), true);
  assert.equal(Object.isFrozen(resolved.entry.declared_write_set), true);
  assert.throws(() => { resolved.entry.queue_entry_id = "mutated"; }, TypeError);
  assert.throws(() => { resolved.entry.declared_write_set.push("hostile"); }, TypeError);

  // A second resolve is unaffected by any attempted mutation of the first.
  const again = ledger.resolveActiveClaim("bst/test-candidate-001");
  assert.equal(again.entry.queue_entry_id, "iq_test_001");
  assert.deepEqual(again.entry.declared_write_set, ["src/example", "tests/example"]);
}));

// --- Atomic single-read snapshot / accessor-attack discipline ---------------

test("append snapshots the entry ONCE: a value-varying getter cannot make the stored record differ from the validated record", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  let reads = 0;
  const hostile = entry();
  // Replace queue_entry_id with a getter that yields a valid value the FIRST
  // read and a distinct value on any subsequent read. structuredClone reads
  // it exactly once, so validation, the duplicate-claim gate, and storage all
  // see the SAME first value.
  Object.defineProperty(hostile, "queue_entry_id", {
    enumerable: true,
    configurable: true,
    get() {
      reads += 1;
      return reads === 1 ? "iq_snapshot_once" : `iq_varying_${reads}`;
    }
  });
  const res = ledger.appendEntry(hostile, { expectedSequence: 0, idempotencyKey: "idem_1" });
  assert.equal(res.ok, true);
  assert.equal(reads, 1, "queue_entry_id getter must be read exactly once");
  assert.equal(res.record.entry.payload.queue_entry_id, "iq_snapshot_once");
  const resolved = ledger.resolveEntry("iq_snapshot_once");
  assert.equal(resolved.code, "ALLOW");
}));

test("a throwing property getter on the entry is contained to DENY_QUEUE_ENTRY_MALFORMED, never propagated", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  const hostile = entry();
  Object.defineProperty(hostile, "declared_write_set", {
    enumerable: true,
    configurable: true,
    get() { throw new Error("hostile accessor"); }
  });
  assert.throws(
    () => ledger.appendEntry(hostile, { expectedSequence: 0, idempotencyKey: "idem_1" }),
    (error) => error instanceof LedgerError && error.code === "DENY_QUEUE_ENTRY_MALFORMED"
  );
  assert.equal(ledger.verify().count, 0);
}));

test("a non-object entry fails closed as DENY_QUEUE_ENTRY_MALFORMED (deny-by-default)", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  for (const bad of [null, undefined, 42, "entry", ["src"]]) {
    assert.throws(
      () => ledger.appendEntry(bad, { expectedSequence: 0, idempotencyKey: "idem_1" }),
      (error) => error instanceof LedgerError && error.code === "DENY_QUEUE_ENTRY_MALFORMED"
    );
  }
}));

// --- Duplicate-claim TOCTOU closure (mirrors mod-wspace-s3-single-writer- --
// --- toctou-fix-001's regression pattern) -----------------------------------
//
// The duplicate-claim check was designed atomically from this file's first
// line of code (see the module header), not retrofitted after a bug was
// found — but this project's own governance requires proving it, not just
// asserting it. This test reproduces the exact PROBE1 shape the second
// independent review of WorkspaceLeaseLedger used: override the PUBLIC
// read() accessor (the only thing an unlocked, pre-fix-shaped gate would ever
// have called) to throw, on a SECOND ledger instance pointed at the same
// file, and prove (a) the duplicate-claim denial still fires correctly, and
// (b) the gate never calls read() at all — there is no separate unlocked
// snapshot for a race to exploit in the first place.

test("duplicate-claim gate is atomic with the write: overriding the public read() accessor to fake a stale view does not let a second active claim land, and the gate never calls read() at all", () => withTempLedger((directory) => {
  const path = join(directory, "queue.ndjson");

  // "Process A": real, unmodified path. Chain length -> 1.
  const a = new IntegrationQueueLedger({ filePath: path });
  const appendedA = a.appendEntry(
    entry({ queue_entry_id: "iq_A", candidate_branch: "bst/race-branch" }),
    { expectedSequence: 0, idempotencyKey: "idem_A" }
  );
  assert.equal(appendedA.ok, true);

  // "Process B": fresh instance, same file. Override the PUBLIC read()
  // accessor to THROW — if the duplicate-claim gate ever fell back to (or
  // was refactored into) a separate unlocked `this.read()` snapshot instead
  // of consulting the `records` parameter `preWriteCheck` receives, this
  // test would fail with an uncaught exception instead of a clean denial.
  // `expectedSequence` is sourced correctly/freshly (1), matching the
  // reviewer's scenario of a second writer whose sequence number is correct
  // but whose business-rule check would otherwise race a separate read.
  const b = new IntegrationQueueLedger({ filePath: path });
  b.read = () => { throw new Error("stale/hostile read() must not be consulted by the duplicate-claim gate"); };

  const resultB = b.appendEntry(
    entry({ queue_entry_id: "iq_B", candidate_branch: "bst/race-branch" }),
    { expectedSequence: 1, idempotencyKey: "idem_B" }
  );

  // Correctly denied — via the in-lock preWriteCheck, not via read().
  assert.equal(resultB.ok, false);
  assert.equal(resultB.code, "DENY_QUEUE_DUPLICATE_CLAIM");
  assert.equal(resultB.conflictingQueueEntryId, "iq_A");
  assert.equal(resultB.candidateBranch, "bst/race-branch");

  // Only iq_A was ever persisted — no second active claim landed for the branch.
  const reopened = new IntegrationQueueLedger({ filePath: path });
  assert.equal(reopened.verify().count, 1);
}));

test("the ordinary, non-racing case is unaffected: a ledger whose read() accessor is overridden to throw still allows a legitimate, non-conflicting append (no false deny introduced)", () => withTempLedger((directory) => {
  const path = join(directory, "queue.ndjson");
  const ledger = new IntegrationQueueLedger({ filePath: path });
  ledger.read = () => { throw new Error("the duplicate-claim gate must never call read() anymore"); };

  const appended = ledger.appendEntry(
    entry({ queue_entry_id: "iq_solo", candidate_branch: "bst/solo-branch" }),
    { expectedSequence: 0, idempotencyKey: "idem_solo" }
  );
  assert.equal(appended.ok, true);
  assert.equal(appended.record.sequence, 1);

  // A legitimate status transition (same queue_entry_id, higher version) for
  // the same branch also still succeeds — same-claim re-append is never a
  // conflict.
  const transitioned = ledger.appendEntry(
    entry({ queue_entry_id: "iq_solo", candidate_branch: "bst/solo-branch", version: 2, status: "IN_REVIEW" }),
    { expectedSequence: 1, idempotencyKey: "idem_solo_v2" }
  );
  assert.equal(transitioned.ok, true);
  assert.equal(transitioned.record.sequence, 2);
}));

// --- Byte-identity guard: this additive slice modified no file it read -------

test(`byte-identity: all OTHER contract schemas and sibling ledgers unchanged vs ${BASE}`, () => {
  // src/ledger/checkpoint-ledger.mjs is intentionally EXCLUDED here by
  // mod-runtime-s1-checkpoint-ordering-fix-001: an authorized, disclosed
  // cross-cutting fix (resolveLatest content-order bug + a
  // preWriteCheck-based regression/actor_id gate), not drift this guard
  // should protect against.
  const guarded = [
    "src/ledger/workspace-lease-ledger.mjs",
    "src/ledger/delegation-ledger.mjs",
    "src/control/overlap-policy.mjs",
    "src/control/write-set-policy.mjs"
  ];
  // Every contract schema that EXISTED AT THIS SLICE'S OWN BASE, except the
  // newly added integration-queue-entry one, must be byte-identical to that
  // base commit — proof this slice touched no other schema. Schemas added by
  // LATER, separately-scoped slices (e.g. MOD-MEM S2's memory-record and
  // MOD-SKILL S2's skill-promotion) postdate BASE and are outside this guard's
  // remit by construction — checked for existence-at-BASE first so a later
  // additive schema never breaks this test.
  for (const file of readdirSync(resolve(root, "contracts")).filter((f) => f.endsWith(".schema.json"))) {
    if (file === "integration-queue-entry.schema.json") continue;
    try {
      execFileSync("git", ["cat-file", "-e", `${BASE}:contracts/${file}`], { cwd: root, encoding: "utf8" });
    } catch {
      continue; // did not exist at BASE — added by a later slice, not this guard's concern
    }
    guarded.push(`contracts/${file}`);
  }
  for (const rel of guarded) {
    const baseBlob = execFileSync("git", ["rev-parse", `${BASE}:${rel}`], { cwd: root, encoding: "utf8" }).trim();
    const worktreeBlob = execFileSync("git", ["hash-object", resolve(root, rel)], { cwd: root, encoding: "utf8" }).trim();
    assert.equal(worktreeBlob, baseBlob, `${rel} blob differs from ${BASE}`);
  }
  // Sanity: DurableLedger's preWriteCheck hook this slice depends on is still
  // present, and this slice did not need to touch it.
  const base = readFileSync(resolve(root, "src/ledger/durable-ledger.mjs"), "utf8");
  assert.ok(base.includes("export class DurableLedger"), "DurableLedger base still present");
  assert.ok(base.includes("preWriteCheck"), "preWriteCheck hook still present, unmodified by this slice");
  const durableLedgerBlob = execFileSync("git", ["rev-parse", `${BASE}:src/ledger/durable-ledger.mjs`], { cwd: root, encoding: "utf8" }).trim();
  const durableLedgerWorktreeBlob = execFileSync("git", ["hash-object", resolve(root, "src/ledger/durable-ledger.mjs")], { cwd: root, encoding: "utf8" }).trim();
  assert.equal(durableLedgerWorktreeBlob, durableLedgerBlob, "durable-ledger.mjs must be byte-identical to base — this slice adds a subclass, it does not modify the base class");
});

// --- Not wired anywhere -------------------------------------------------------

test("IntegrationQueueLedger is not imported by any existing service or gateway (unwired, candidate-only)", () => {
  const suspects = [
    "src/services",
    "src/gateway",
    "src/live",
    "src/control"
  ];
  for (const dir of suspects) {
    let files;
    try {
      files = readdirSync(resolve(root, dir));
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith(".mjs")) continue;
      const content = readFileSync(resolve(root, dir, file), "utf8");
      assert.ok(
        !content.includes("integration-queue-ledger"),
        `${dir}/${file} must not import integration-queue-ledger.mjs (S1 stays unwired)`
      );
    }
  }
});
