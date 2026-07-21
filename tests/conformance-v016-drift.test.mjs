/**
 * V-016 DRIFT conformance — CANDIDATE (AMD-002 advise-and-proceed)
 *
 * Covers the DEFERRED half of verification-matrix.md V-016
 *   "Recovery: verified checkpoint resumes / drifted checkpoint denied".
 * The resolved half (resume-point lookup / fail-closed unknown / tamper
 * detection) is already live in tests/conformance-p0-18-candidate.test.mjs;
 * this file exercises the DRIFT COMPARATOR — checkpoint-ledger non-goal #3 —
 * that decides verified-resume vs drift-denied.
 *
 * Discipline (identical to the rest of the harness):
 *   - Exercises the REAL pure comparator (src/control/checkpoint-drift-comparator.mjs)
 *     and composes the REAL CheckpointLedger READ-ONLY over temp fixtures. No
 *     primitive is modified (byte-identity guard at the bottom pins every composed
 *     ledger/contract module to its git blob hash at main @ ec5aa76).
 *   - Every negative asserts the SPECIFIC deny code the comparator emits.
 *   - Every adversarial proves FAIL-CLOSED behaviour: an unverifiable or ambiguous
 *     comparison ALWAYS denies and is NEVER silently resumed.
 *
 * SCOPE HONESTY: this is conformance COVERAGE for a CANDIDATE comparator. It is
 * NOT wired into any restore/self-pilot/replay path, is NOT the P0-20 governance
 * verdict, and is NOT P0-18 sign-off.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  evaluateResume,
  evaluateResumeFromLedger,
  CHECKPOINT_DRIFT_DENY_CODES
} from "../src/control/checkpoint-drift-comparator.mjs";
import { CheckpointLedger } from "../src/ledger/checkpoint-ledger.mjs";

const NUL = String.fromCharCode(0);
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

// A recorded checkpoint (contract-shaped) and the observed restore state that
// MATCHES it. Any override lets a test perturb exactly one dimension.
function recordedCheckpoint(overrides = {}) {
  return {
    checkpoint_id: "chk_v016_drift_001",
    version: 1,
    project_id: "prj_v016",
    work_package_id: "wp_v016",
    session_id: "ses_v016",
    actor_id: "claude-motor-v016-drift",
    source_ledger_id: "secb-event-ledger",
    sequence_at_checkpoint: 7,
    state_snapshot_ref: "opaque://session-snapshots/ses_v016/7",
    created_at: "2026-07-20T18:00:00Z",
    content_hash: HASH_A,
    ...overrides
  };
}

// The observed/restore state carries the three evidence dimensions the comparator
// checks: recomputed content_hash, observed source-ledger sequence, loaded ref.
function matchingObserved(overrides = {}) {
  return {
    content_hash: HASH_A,
    sequence: 7,
    state_snapshot_ref: "opaque://session-snapshots/ses_v016/7",
    ...overrides
  };
}

// --- POSITIVE: no drift -> verified, resume permitted -----------------------

test("V-016 positive: observed state matching the checkpoint verifies and permits resume", () => {
  const result = evaluateResume({ checkpoint: recordedCheckpoint(), observedState: matchingObserved() });
  assert.deepEqual(result, { ok: true, verified: true });
  assert.ok(Object.isFrozen(result), "verified result is deep-frozen");
});

// --- NEGATIVE: drift on any single dimension -> DENY_CHECKPOINT_DRIFT --------

test("V-016 negative: any drifted dimension (hash / sequence advanced / snapshot-ref) denies resume", () => {
  // content_hash differs
  assert.equal(
    evaluateResume({ checkpoint: recordedCheckpoint(), observedState: matchingObserved({ content_hash: HASH_B }) }).code,
    "DENY_CHECKPOINT_DRIFT"
  );
  // source-ledger sequence advanced under the checkpoint
  assert.equal(
    evaluateResume({ checkpoint: recordedCheckpoint(), observedState: matchingObserved({ sequence: 8 }) }).code,
    "DENY_CHECKPOINT_DRIFT"
  );
  // snapshot ref changed (points at different materialized state)
  assert.equal(
    evaluateResume({
      checkpoint: recordedCheckpoint(),
      observedState: matchingObserved({ state_snapshot_ref: "opaque://attacker/forged" })
    }).code,
    "DENY_CHECKPOINT_DRIFT"
  );

  // A drift result is a deep-frozen structured denial, never a throw.
  const drift = evaluateResume({ checkpoint: recordedCheckpoint(), observedState: matchingObserved({ sequence: 9 }) });
  assert.equal(drift.ok, false);
  assert.ok(Object.isFrozen(drift));
});

// --- ADVERSARIAL: fail-closed on ambiguity / tamper / hostility -------------

test("V-016 adversarial: a missing comparison field is UNVERIFIABLE, never a silent resume", () => {
  // Missing on the OBSERVED side.
  const noObservedHash = matchingObserved();
  delete noObservedHash.content_hash;
  const r1 = evaluateResume({ checkpoint: recordedCheckpoint(), observedState: noObservedHash });
  assert.equal(r1.code, "DENY_DRIFT_UNVERIFIABLE");
  assert.notEqual(r1.ok, true, "an unverifiable comparison must NEVER be permitted");

  // Missing on the RECORDED side.
  const noRecordedSeq = recordedCheckpoint();
  delete noRecordedSeq.sequence_at_checkpoint;
  assert.equal(
    evaluateResume({ checkpoint: noRecordedSeq, observedState: matchingObserved() }).code,
    "DENY_DRIFT_UNVERIFIABLE"
  );

  // Present-but-unusable (blank / null-byte / wrong type) is equally unverifiable,
  // never coerced toward a match.
  assert.equal(
    evaluateResume({ checkpoint: recordedCheckpoint(), observedState: matchingObserved({ state_snapshot_ref: "" }) }).code,
    "DENY_DRIFT_UNVERIFIABLE"
  );
  assert.equal(
    evaluateResume({ checkpoint: recordedCheckpoint(), observedState: matchingObserved({ content_hash: `${HASH_A.slice(0, 63)}${NUL}` }) }).code,
    "DENY_DRIFT_UNVERIFIABLE"
  );
  assert.equal(
    evaluateResume({ checkpoint: recordedCheckpoint(), observedState: matchingObserved({ sequence: "7" }) }).code,
    "DENY_DRIFT_UNVERIFIABLE"
  );
});

test("V-016 adversarial: a hostile getter forging a matching hash is contained -> MALFORMED (deny-by-default)", () => {
  const hostile = { sequence: 7, state_snapshot_ref: "opaque://session-snapshots/ses_v016/7" };
  Object.defineProperty(hostile, "content_hash", {
    enumerable: true,
    configurable: true,
    get() { throw new Error("hostile accessor forging a match"); }
  });
  const result = evaluateResume({ checkpoint: recordedCheckpoint(), observedState: hostile });
  assert.equal(result.code, "DENY_DRIFT_MALFORMED");
  assert.notEqual(result.ok, true);
});

test("V-016 adversarial: atomic single-read — each field getter is invoked EXACTLY ONCE, drift still denies", () => {
  // A getter that returns a DRIFTED value and counts its own reads. Atomic
  // single-read means it is consulted exactly once; the drifted value it yields
  // on that one read denies. A TOCTOU getter therefore cannot flip the decision.
  let reads = 0;
  const observed = { sequence: 7, state_snapshot_ref: "opaque://session-snapshots/ses_v016/7" };
  Object.defineProperty(observed, "content_hash", {
    enumerable: true,
    configurable: true,
    get() { reads += 1; return HASH_B; } // drifted, never matches HASH_A
  });
  const result = evaluateResume({ checkpoint: recordedCheckpoint(), observedState: observed });
  assert.equal(result.code, "DENY_CHECKPOINT_DRIFT");
  assert.equal(reads, 1, "content_hash getter must be read exactly once (no TOCTOU re-read)");
});

test("V-016 adversarial: prototype-pollution of a comparison field is NOT read as own -> UNVERIFIABLE", () => {
  const polluted = Object.defineProperty({}, "content_hash", { value: HASH_A });
  // sequence/state_snapshot_ref present as own; content_hash only via prototype.
  const observed = Object.assign(Object.create(polluted), {
    sequence: 7,
    state_snapshot_ref: "opaque://session-snapshots/ses_v016/7"
  });
  // Guard: the value IS reachable via the prototype chain (so a naive `obj.x`
  // read would see it), but it is NOT an own key.
  assert.equal(observed.content_hash, HASH_A);
  assert.equal(Object.prototype.hasOwnProperty.call(observed, "content_hash"), false);
  const result = evaluateResume({ checkpoint: recordedCheckpoint(), observedState: observed });
  assert.equal(result.code, "DENY_DRIFT_UNVERIFIABLE");
  assert.notEqual(result.ok, true, "a prototype-injected field must not satisfy the comparison");
});

test("V-016 adversarial: malformed containers and array inputs deny-by-default", () => {
  assert.equal(evaluateResume(null).code, "DENY_DRIFT_MALFORMED");
  assert.equal(evaluateResume({ checkpoint: null, observedState: matchingObserved() }).code, "DENY_DRIFT_MALFORMED");
  assert.equal(evaluateResume({ checkpoint: recordedCheckpoint(), observedState: [] }).code, "DENY_DRIFT_MALFORMED");
  // Every emitted code is in the frozen closed set.
  for (const code of ["DENY_DRIFT_MALFORMED", "DENY_CHECKPOINT_DRIFT", "DENY_DRIFT_UNVERIFIABLE"]) {
    assert.ok(CHECKPOINT_DRIFT_DENY_CODES.includes(code));
  }
  assert.ok(Object.isFrozen(CHECKPOINT_DRIFT_DENY_CODES));
});

// --- Ledger composition: read-only fetch + tamper surfaces before comparison -

function withLedger(operation) {
  const dir = mkdtempSync(join(tmpdir(), "secb-v016-drift-"));
  try {
    return operation(join(dir, "checkpoints.ndjson"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("V-016 composition: resolves a checkpoint read-only and verifies a matching resume", () => withLedger((path) => {
  const ledger = new CheckpointLedger({ filePath: path });
  ledger.appendCheckpoint(recordedCheckpoint(), { expectedSequence: 0, idempotencyKey: "idem_v016_drift_1" });

  // Positive via the ledger-composing entry point.
  const ok = evaluateResumeFromLedger({ ledger, checkpointId: "chk_v016_drift_001", observedState: matchingObserved() });
  assert.deepEqual(ok, { ok: true, verified: true });

  // resolveLatest path works identically.
  const okLatest = evaluateResumeFromLedger({ ledger, sessionId: "ses_v016", observedState: matchingObserved() });
  assert.deepEqual(okLatest, { ok: true, verified: true });

  // Drift through the ledger denies.
  assert.equal(
    evaluateResumeFromLedger({ ledger, checkpointId: "chk_v016_drift_001", observedState: matchingObserved({ sequence: 8 }) }).code,
    "DENY_CHECKPOINT_DRIFT"
  );

  // An unknown checkpoint cannot be fetched -> cannot verify -> fail-closed.
  assert.equal(
    evaluateResumeFromLedger({ ledger, checkpointId: "chk_ghost", observedState: matchingObserved() }).code,
    "DENY_DRIFT_UNVERIFIABLE"
  );

  // Ambiguous/absent locator is malformed (deny-by-default).
  assert.equal(evaluateResumeFromLedger({ ledger, observedState: matchingObserved() }).code, "DENY_DRIFT_MALFORMED");
  assert.equal(
    evaluateResumeFromLedger({ ledger, sessionId: "ses_v016", checkpointId: "chk_v016_drift_001", observedState: matchingObserved() }).code,
    "DENY_DRIFT_MALFORMED"
  );
}));

test("V-016 composition: a tampered checkpoint ledger surfaces LEDGER_INTEGRITY_FAILURE before comparison", () => withLedger((path) => {
  const ledger = new CheckpointLedger({ filePath: path });
  ledger.appendCheckpoint(recordedCheckpoint(), { expectedSequence: 0, idempotencyKey: "idem_v016_drift_1" });

  // Tamper the persisted record body (forged snapshot ref) — the hash chain no
  // longer verifies.
  const raw = readFileSync(path, "utf8").trim().split("\n");
  const record0 = JSON.parse(raw[0]);
  record0.entry.payload.state_snapshot_ref = "opaque://attacker/forged";
  raw[0] = JSON.stringify(record0);
  writeFileSync(path, raw.join("\n") + "\n", "utf8");

  const reopened = new CheckpointLedger({ filePath: path });
  // The integrity fault is an EXCEPTION that surfaces before any comparison — it
  // is NOT converted into a soft resume decision.
  assert.throws(
    () => evaluateResumeFromLedger({ ledger: reopened, checkpointId: "chk_v016_drift_001", observedState: matchingObserved() }),
    (error) => error.code === "LEDGER_INTEGRITY_FAILURE"
  );
}));

// --- Byte-identity guard (main @ ec5aa76) -----------------------------------
//   Proves every ledger/contract primitive this candidate composes is unmodified.
//   If any pinned blob drifts, the candidate has silently mutated a primitive and
//   this fails.

function repoPath(rel) {
  return fileURLToPath(new URL(`../${rel}`, import.meta.url));
}

function gitBlobSha1(rel) {
  const normalized = readFileSync(repoPath(rel), "utf8").replace(/\r\n/g, "\n");
  const body = Buffer.from(normalized, "utf8");
  const header = Buffer.from(`blob ${body.length}${NUL}`, "utf8");
  return createHash("sha1").update(header).update(body).digest("hex");
}

const PINNED_BLOBS = Object.freeze({
  "src/ledger/checkpoint-ledger.mjs": "4df391f892f8bac2b569c5bf9fd627ee0101c542",
  "src/ledger/durable-ledger.mjs": "6be08fc14ff31a7c871c5e86888af42285d40529",
  "src/contracts/contract-validator.mjs": "c3b37776ad1c928395fe681a3e9934c6decff42e",
  "src/contracts/canonical-fingerprint.mjs": "721e99032ce7040312e77138c8f156b649fd996e"
});

test("byte-identity: every primitive composed by this candidate is unchanged vs main @ ec5aa76", () => {
  for (const [rel, pinned] of Object.entries(PINNED_BLOBS)) {
    assert.equal(gitBlobSha1(rel), pinned, `${rel} blob-identical to main @ ec5aa76`);
  }
});
