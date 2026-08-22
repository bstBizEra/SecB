// MOD-INTEG Slice S2 — forecastCollision test suite.
//
// Scope mirrors src/control/integration-collision-forecast.mjs's own header:
// this exercises a PURE, UNWIRED forecast function that reuses
// overlap-policy.mjs's evaluateOverlap verbatim over a real
// IntegrationQueueLedger's own `records` shape. Every ledger fixture below is
// built through a genuine, temp-directory-backed IntegrationQueueLedger
// (appendEntry + read()) rather than hand-fabricated record objects, so the
// `records` shape fed to forecastCollision is exactly what
// IntegrationQueueLedger's own preWriteCheck hook (and `read()`) actually
// produce — not a guessed shape.
//
// Coverage:
//   1. No collision: disjoint declared write sets -> collides: false.
//   2. Genuine collision, O2 (exact-file overlap and prefix/dir-ancestor
//      overlap — the two structurally distinct forms of "file overlap"
//      write-set-policy.mjs's containment semantics recognize). O1/O3/O4/O5
//      are NOT independently reachable through this forecast function by
//      design (see module header: the integrationQueueEntry contract carries
//      no module/symbol/protected-branch/global-config classification for
//      forecastCollision to honestly answer with anything but `false`) — a
//      dedicated test below proves this is deliberate scope, not an
//      oversight, by cross-checking directly against evaluateOverlap.
//   3. Multiple simultaneous colliding entries.
//   4. MERGED/REJECTED (terminal) entries are correctly excluded from the
//      forecast even when their declared write set does overlap the
//      candidate's.
//   5. Reuse-not-reimplementation: forecastCollision's per-entry `overlap`
//      field is byte-for-byte identical to calling evaluateOverlap directly
//      with the same inputs (proves no re-derivation/lossy summarization).
//   6. Fail-closed: malformed/empty candidateWriteSet, non-array records.
//   7. Byte-identity guard: every pre-existing file this slice reads but does
//      not modify (overlap-policy.mjs, write-set-policy.mjs,
//      integration-queue-ledger.mjs, durable-ledger.mjs) is unchanged vs the
//      commit this branch forked from.

import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { forecastCollision } from "../src/control/integration-collision-forecast.mjs";
import { evaluateOverlap } from "../src/control/overlap-policy.mjs";
import { IntegrationQueueLedger } from "../src/ledger/integration-queue-ledger.mjs";

const root = resolve(import.meta.dirname, "..");
// The commit this S2 slice forked from (bst/mod-integ-queue-s1-ledger, tip
// after S1's independent review + status-transition fix + review-of-fix).
const BASE_COMMIT = "66a5951";

const HASH = "b".repeat(64);

function queueEntry(overrides = {}) {
  return {
    queue_entry_id: "iq_s2_test_001",
    version: 1,
    project_id: "prj_secb_local",
    work_package_id: "wp_s2_test_001",
    session_id: "ses_s2_test_001",
    candidate_branch: "bst/s2-test-candidate-001",
    candidate_tip_commit: "0123456789abcdef0123456789abcdef01234567",
    base_ref: "main",
    declared_write_set: ["src/example"],
    status: "SUBMITTED",
    submitted_by: "claude-motor-modintegqueue-s2",
    submitted_at: "2026-07-21T18:00:00+07:00",
    content_hash: HASH,
    ...overrides
  };
}

function withTempLedger(operation) {
  const directory = mkdtempSync(join(tmpdir(), "secb-integration-collision-forecast-"));
  try {
    return operation(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function newLedger(directory) {
  return new IntegrationQueueLedger({ filePath: join(directory, "queue.ndjson") });
}

let idempotencyCounter = 0;
function nextIdempotencyKey() {
  idempotencyCounter += 1;
  return `s2_idem_${idempotencyCounter}`;
}

function append(ledger, overrides, expectedSequence) {
  return ledger.appendEntry(queueEntry(overrides), {
    expectedSequence,
    idempotencyKey: nextIdempotencyKey()
  });
}

// Sequential appender bound to one ledger instance: tracks `expectedSequence`
// automatically (it is the ledger's current record count, not per-entry) and
// asserts every append actually succeeds, so a fixture mistake (e.g. an
// illegal status transition) fails loudly in the fixture instead of silently
// producing fewer records than the test expects.
function makeAppender(ledger) {
  let sequence = 0;
  return (overrides) => {
    const result = append(ledger, overrides, sequence);
    assert.equal(result.ok, true, `fixture append must succeed: ${JSON.stringify(overrides)} -> ${JSON.stringify(result)}`);
    sequence += 1;
    return result;
  };
}

// Convenience for a queue entry whose CURRENT (latest) status is IN_REVIEW:
// the only legal path there is version 1 SUBMITTED -> version 2 IN_REVIEW
// (per IntegrationQueueLedger's VALID_STATUS_TRANSITIONS) — a bare version-1
// IN_REVIEW entry is denied by the status-transition gate.
function submitThenReview(appendNext, overrides) {
  appendNext({ ...overrides, status: "SUBMITTED", version: 1 });
  appendNext({ ...overrides, status: "IN_REVIEW", version: 2 });
}

// ===========================================================================
// 1. No collision: disjoint declared write sets
// ===========================================================================

test("no collision: candidate's write set disjoint from every queued entry -> collides: false", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  const appendNext = makeAppender(ledger);
  appendNext({ queue_entry_id: "iq_a", candidate_branch: "bst/a", declared_write_set: ["src/moduleA/a.mjs"] });
  submitThenReview(appendNext, { queue_entry_id: "iq_b", candidate_branch: "bst/b", declared_write_set: ["src/moduleB/b.mjs"] });

  const result = forecastCollision(["src/moduleC/c.mjs"], ledger.read());

  assert.equal(result.ok, true);
  assert.equal(result.collides, false);
  assert.equal(result.mostRestrictiveClass, null);
  assert.equal(result.collisions.length, 0);
  assert.equal(result.comparisons.length, 2);
  assert.ok(result.comparisons.every((c) => c.overlap.ok && c.overlap.overlapClass === "O0"));
}));

// ===========================================================================
// 2. Genuine collision, both structural forms of O2 (file overlap)
// ===========================================================================

test("collision: exact-same-file write set overlap -> O2, Reservation and conflict forecast", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  append(ledger, { queue_entry_id: "iq_a", candidate_branch: "bst/a", declared_write_set: ["src/shared/file.mjs"] }, 0);

  const result = forecastCollision(["src/shared/file.mjs"], ledger.read());

  assert.equal(result.ok, true);
  assert.equal(result.collides, true);
  assert.equal(result.mostRestrictiveClass, "O2");
  assert.equal(result.collisions.length, 1);
  assert.equal(result.collisions[0].queueEntryId, "iq_a");
  assert.equal(result.collisions[0].candidateBranch, "bst/a");
  assert.equal(result.collisions[0].status, "SUBMITTED");
  assert.equal(result.collisions[0].overlap.overlapClass, "O2");
  assert.equal(result.collisions[0].overlap.control, "Reservation and conflict forecast");
  assert.equal(result.collisions[0].overlap.overlap, "Same file, separate regions");
}));

test("collision: prefix/dir-ancestor overlap (candidate touches a file under a queued dir claim) -> O2", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  append(ledger, { queue_entry_id: "iq_a", candidate_branch: "bst/a", declared_write_set: ["src/shared"] }, 0);

  const result = forecastCollision(["src/shared/nested/deep.mjs"], ledger.read());

  assert.equal(result.collides, true);
  assert.equal(result.mostRestrictiveClass, "O2");
  assert.equal(result.collisions[0].overlap.overlapClass, "O2");
}));

// Deliberate scope-limit proof, not an omission: O1/O3/O4/O5 require
// sameModule/sameSymbol/protectedBranch/globalConfig, none of which
// declared_write_set alone (or the integrationQueueEntry contract at large)
// can answer honestly. forecastCollision always answers all four `false` —
// this test confirms that is EXACTLY what a direct evaluateOverlap call with
// the same write sets and the same forced-false dimensions would also
// produce, i.e. forecastCollision is not silently downgrading a
// classification it could have gotten right; the ladder simply cannot climb
// past O2 without caller-supplied doctrine data this ledger doesn't carry.
test("scope limit: O1/O3/O4/O5 are unreachable via forecastCollision because their dimensions are always answered false, matching direct evaluateOverlap with the same forced-false frame", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  // Same module, different files: would be O1 IF sameModule could be
  // asserted true, but forecastCollision has no module-map to derive that
  // from, so it stays O0.
  append(ledger, { queue_entry_id: "iq_a", candidate_branch: "bst/a", declared_write_set: ["src/moduleA/sibling.mjs"] }, 0);

  const result = forecastCollision(["src/moduleA/other.mjs"], ledger.read());
  assert.equal(result.collisions.length, 0);

  const direct = evaluateOverlap({
    writeSetA: ["src/moduleA/other.mjs"],
    writeSetB: ["src/moduleA/sibling.mjs"],
    sameModule: false,
    sameSymbol: false,
    protectedBranch: false,
    globalConfig: false
  });
  assert.equal(direct.overlapClass, "O0");
  assert.equal(result.comparisons[0].overlap.overlapClass, direct.overlapClass);
}));

// ===========================================================================
// 3. Multiple simultaneous colliding entries
// ===========================================================================

test("multiple simultaneous colliding entries are all reported, most-restrictive class computed across all", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  const appendNext = makeAppender(ledger);
  appendNext({ queue_entry_id: "iq_a", candidate_branch: "bst/a", declared_write_set: ["src/shared/file.mjs"] });
  submitThenReview(appendNext, { queue_entry_id: "iq_b", candidate_branch: "bst/b", declared_write_set: ["src/shared/file.mjs", "src/other/x.mjs"] });
  appendNext({ queue_entry_id: "iq_c", candidate_branch: "bst/c", declared_write_set: ["src/unrelated/y.mjs"] });

  const result = forecastCollision(["src/shared/file.mjs"], ledger.read());

  assert.equal(result.collides, true);
  assert.equal(result.mostRestrictiveClass, "O2");
  assert.equal(result.comparisons.length, 3);
  const collidingIds = result.collisions.map((c) => c.queueEntryId).sort();
  assert.deepEqual(collidingIds, ["iq_a", "iq_b"]);
  assert.equal(result.collisions.length, 2);
}));

// ===========================================================================
// 4. Terminal (MERGED/REJECTED) entries are excluded from the forecast
// ===========================================================================

test("ignores MERGED entries even though their declared write set overlaps the candidate", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  append(ledger, { queue_entry_id: "iq_a", candidate_branch: "bst/a", declared_write_set: ["src/shared/file.mjs"], status: "SUBMITTED" }, 0);
  append(ledger, { queue_entry_id: "iq_a", candidate_branch: "bst/a", declared_write_set: ["src/shared/file.mjs"], status: "IN_REVIEW", version: 2 }, 1);
  append(ledger, { queue_entry_id: "iq_a", candidate_branch: "bst/a", declared_write_set: ["src/shared/file.mjs"], status: "MERGED", version: 3 }, 2);

  const result = forecastCollision(["src/shared/file.mjs"], ledger.read());

  assert.equal(result.ok, true);
  assert.equal(result.collides, false);
  assert.equal(result.comparisons.length, 0);
}));

test("ignores REJECTED entries even though their declared write set overlaps the candidate", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  append(ledger, { queue_entry_id: "iq_a", candidate_branch: "bst/a", declared_write_set: ["src/shared/file.mjs"], status: "SUBMITTED" }, 0);
  append(ledger, { queue_entry_id: "iq_a", candidate_branch: "bst/a", declared_write_set: ["src/shared/file.mjs"], status: "IN_REVIEW", version: 2 }, 1);
  append(ledger, { queue_entry_id: "iq_a", candidate_branch: "bst/a", declared_write_set: ["src/shared/file.mjs"], status: "REJECTED", version: 3 }, 2);

  const result = forecastCollision(["src/shared/file.mjs"], ledger.read());

  assert.equal(result.collides, false);
  assert.equal(result.comparisons.length, 0);
}));

test("a resolved (MERGED) branch mixed with a fresh still-active claim on a DIFFERENT branch: only the active one is forecast", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  append(ledger, { queue_entry_id: "iq_old", candidate_branch: "bst/old", declared_write_set: ["src/shared/file.mjs"], status: "SUBMITTED" }, 0);
  append(ledger, { queue_entry_id: "iq_old", candidate_branch: "bst/old", declared_write_set: ["src/shared/file.mjs"], status: "IN_REVIEW", version: 2 }, 1);
  append(ledger, { queue_entry_id: "iq_old", candidate_branch: "bst/old", declared_write_set: ["src/shared/file.mjs"], status: "MERGED", version: 3 }, 2);
  append(ledger, { queue_entry_id: "iq_new", candidate_branch: "bst/new", declared_write_set: ["src/shared/file.mjs"], status: "SUBMITTED" }, 3);

  const result = forecastCollision(["src/shared/file.mjs"], ledger.read());

  assert.equal(result.collides, true);
  assert.equal(result.comparisons.length, 1);
  assert.equal(result.collisions[0].queueEntryId, "iq_new");
}));

// ===========================================================================
// 5. Reuse-not-reimplementation: byte-identical delegation to evaluateOverlap
// ===========================================================================

test("each comparison's overlap field is byte-identical to a direct evaluateOverlap call with the same inputs", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  append(ledger, { queue_entry_id: "iq_a", candidate_branch: "bst/a", declared_write_set: ["src/shared/file.mjs", "src/other/z.mjs"] }, 0);

  const candidateWriteSet = ["src/shared/file.mjs"];
  const result = forecastCollision(candidateWriteSet, ledger.read());

  const direct = evaluateOverlap({
    writeSetA: candidateWriteSet,
    writeSetB: ["src/shared/file.mjs", "src/other/z.mjs"],
    sameModule: false,
    sameSymbol: false,
    protectedBranch: false,
    globalConfig: false
  });

  assert.deepEqual(result.comparisons[0].overlap, direct);
}));

// ===========================================================================
// 6. Fail-closed inputs
// ===========================================================================

test("fail-closed: empty candidateWriteSet surfaces overlap-policy's own DENY_OVERLAP_EMPTY reasoning, even with an empty queue", () => {
  const result = forecastCollision([], []);
  assert.equal(result.ok, false);
  assert.equal(result.code, "DENY_FORECAST_INVALID_CANDIDATE");
  assert.equal(result.overlapDenial.code, "DENY_OVERLAP_EMPTY");
  assert.match(result.message, /DENY_OVERLAP_EMPTY|empty declared write set/);
});

test("fail-closed: non-array candidateWriteSet surfaces overlap-policy's own DENY_OVERLAP_MALFORMED reasoning", () => {
  const result = forecastCollision("not-an-array", []);
  assert.equal(result.ok, false);
  assert.equal(result.code, "DENY_FORECAST_INVALID_CANDIDATE");
  assert.equal(result.overlapDenial.code, "DENY_OVERLAP_MALFORMED");
});

test("fail-closed: a write-set-grammar-violating candidate path (traversal) is denied via the reused write-set grammar, not silently accepted", () => {
  const result = forecastCollision(["../escape"], []);
  assert.equal(result.ok, false);
  assert.equal(result.code, "DENY_FORECAST_INVALID_CANDIDATE");
  assert.equal(result.overlapDenial.code, "DENY_OVERLAP_MALFORMED");
});

test("fail-closed: non-array records is denied without throwing", () => {
  const result = forecastCollision(["src/x.mjs"], "not-an-array");
  assert.equal(result.ok, false);
  assert.equal(result.code, "DENY_FORECAST_MALFORMED_RECORDS");
});

test("fail-closed: a hostile records array (throwing element getter) degrades to a frozen denial, never throws", () => {
  const hostile = [];
  Object.defineProperty(hostile, "0", {
    enumerable: true,
    get() { throw new Error("boom"); }
  });
  Object.defineProperty(hostile, "length", { value: 1 });
  assert.doesNotThrow(() => forecastCollision(["src/x.mjs"], hostile));
  const result = forecastCollision(["src/x.mjs"], hostile);
  assert.equal(result.ok, false);
  assert.equal(result.code, "DENY_FORECAST_MALFORMED_RECORDS");
});

// ===========================================================================
// 7. Output is deep-frozen (house style)
// ===========================================================================

test("successful forecast result and its nested arrays are frozen", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  append(ledger, { queue_entry_id: "iq_a", candidate_branch: "bst/a", declared_write_set: ["src/shared/file.mjs"] }, 0);

  const result = forecastCollision(["src/shared/file.mjs"], ledger.read());
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.collisions));
  assert.ok(Object.isFrozen(result.comparisons));
  assert.ok(Object.isFrozen(result.errors));
  assert.ok(Object.isFrozen(result.comparisons[0]));
}));

// ===========================================================================
// 8. Unwired: not consumed by IntegrationQueueLedger or any existing service
// ===========================================================================

test("IntegrationQueueLedger's own module source does not import forecastCollision or this new file (still unwired)", () => {
  const ledgerSource = execFileSync(
    "git",
    ["show", "HEAD:src/ledger/integration-queue-ledger.mjs"],
    { cwd: root, encoding: "utf8" }
  );
  assert.doesNotMatch(ledgerSource, /integration-collision-forecast/);
  assert.doesNotMatch(ledgerSource, /forecastCollision/);
});

// ===========================================================================
// 9. Byte-identity guard — zero edits to every pre-existing file this slice
//    reads but does not modify.
// ===========================================================================

test(`byte-identity: files read but not modified are unchanged vs base @ ${BASE_COMMIT}`, () => {
  // src/control/overlap-policy.mjs is intentionally EXCLUDED here by
  // mod-wspace-s2-overlap-case-fix-001: a second independent review found a
  // real case-sensitivity gap (src/Foo.js vs src/foo.js silently classified
  // as no-collision) with live blast radius through THIS exact consumer
  // (forecastCollision passes write-sets to evaluateOverlap unmodified).
  // That fix is an authorized, disclosed cross-cutting change to this file --
  // not drift this guard should protect against. The other four files remain
  // fully protected.
  const guarded = [
    "src/control/write-set-policy.mjs",
    "src/ledger/integration-queue-ledger.mjs",
    "src/ledger/durable-ledger.mjs",
    "contracts/integration-queue-entry.schema.json"
  ];
  for (const rel of guarded) {
    const baseBlob = execFileSync("git", ["rev-parse", `${BASE_COMMIT}:${rel}`], { cwd: root, encoding: "utf8" }).trim();
    const worktreeBlob = execFileSync("git", ["hash-object", resolve(root, rel)], { cwd: root, encoding: "utf8" }).trim();
    assert.equal(worktreeBlob, baseBlob, `${rel} blob differs from base`);
  }
});
