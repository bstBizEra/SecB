import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { ContractValidationError, validateContract } from "../src/contracts/contract-validator.mjs";
import { WorkspaceLeaseLedger } from "../src/ledger/workspace-lease-ledger.mjs";
import { LedgerError } from "../src/ledger/durable-ledger.mjs";

const root = resolve(import.meta.dirname, "..");
// The commit this dispatch branched from (main). Every existing file this
// pure-additive slice read must stay byte-identical to it.
const BASE = "0c0f3d2";

// Fixed ISO clock anchors + their epoch-ms equivalents, so `now` (epoch-ms) and
// the record's ISO `expires_at` are always compared over the same instant.
const ISSUED_ISO = "2026-07-21T09:00:00+07:00";
const EXPIRES_ISO = "2026-07-21T10:00:00+07:00"; // ISSUED + 1h
const ISSUED_MS = Date.parse(ISSUED_ISO);
const EXPIRES_MS = Date.parse(EXPIRES_ISO);
const TTL_MS = EXPIRES_MS - ISSUED_MS;
const WITHIN = ISSUED_MS + 60_000; // one minute in — lease live
const HASH = "a".repeat(64);

function lease(overrides = {}) {
  return {
    lease_id: "wl_test_001",
    version: 1,
    project_id: "prj_secb_local",
    work_package_id: "wp_test_001",
    session_id: "ses_test_001",
    actor_id: "claude-motor-wspace-s3-ledger-01",
    write_set: ["src/ledger", "tests"],
    issued_at: ISSUED_ISO,
    ttl: TTL_MS,
    expires_at: EXPIRES_ISO,
    content_hash: HASH,
    ...overrides
  };
}

function withTempLedger(operation) {
  const directory = mkdtempSync(join(tmpdir(), "secb-workspace-lease-ledger-"));
  try {
    return operation(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const newLedger = (directory) => new WorkspaceLeaseLedger({ filePath: join(directory, "leases.ndjson") });

// --- Happy path: append + resolve -------------------------------------------

test("appendLease persists a verifiable hash chain and resolveActiveLease returns the live lease", () => withTempLedger((directory) => {
  const path = join(directory, "leases.ndjson");
  const ledger = new WorkspaceLeaseLedger({ filePath: path });

  const appended = ledger.appendLease(lease(), { expectedSequence: 0, idempotencyKey: "idem_1", now: WITHIN });
  assert.equal(appended.ok, true);
  assert.equal(appended.record.sequence, 1);
  assert.equal(appended.record.replayed, false);

  const resolved = ledger.resolveActiveLease("wl_test_001", { now: WITHIN });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.lease.lease_id, "wl_test_001");
  assert.equal(resolved.version, 1);
  assert.equal(resolved.sequence, 1);

  // Chain persists across instances.
  const reopened = new WorkspaceLeaseLedger({ filePath: path });
  assert.deepEqual(reopened.verify(), {
    valid: true,
    ledgerId: "secb-workspace-lease-ledger",
    count: 1,
    headHash: appended.record.recordHash
  });
}));

test("appendLease validates the workspace-lease contract before durable append", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  assert.throws(
    () => ledger.appendLease(lease({ content_hash: "not-a-hash" }), { expectedSequence: 0, idempotencyKey: "idem_bad", now: WITHIN }),
    (error) => error instanceof ContractValidationError && error.code === "DENY_CONTRACT_INVALID"
  );
  // Nothing was persisted by the rejected append.
  assert.equal(ledger.verify().count, 0);
}));

test("appendLease requires an idempotency key and a valid clock reading", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  assert.throws(
    () => ledger.appendLease(lease(), { expectedSequence: 0, now: WITHIN }),
    (error) => error instanceof LedgerError && error.code === "DENY_MISSING_ENTRY_FIELDS"
  );
  assert.throws(
    () => ledger.appendLease(lease(), { expectedSequence: 0, idempotencyKey: "idem_1", now: -1 }),
    (error) => error instanceof LedgerError && error.code === "DENY_LEASE_INVALID_NOW"
  );
  assert.throws(
    () => ledger.appendLease(lease(), { expectedSequence: 0, idempotencyKey: "idem_1", now: 1.5 }),
    (error) => error instanceof LedgerError && error.code === "DENY_LEASE_INVALID_NOW"
  );
}));

// --- resolveActiveLease: fail-closed unknown / expired / invalid ------------

test("resolveActiveLease fails closed on unknown lease, invalid id, and invalid clock", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  ledger.appendLease(lease(), { expectedSequence: 0, idempotencyKey: "idem_1", now: WITHIN });

  const unknown = ledger.resolveActiveLease("wl_never_existed", { now: WITHIN });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.code, "DENY_LEASE_UNKNOWN");

  const badId = ledger.resolveActiveLease("", { now: WITHIN });
  assert.equal(badId.code, "DENY_LEASE_INVALID_ID");

  const badNow = ledger.resolveActiveLease("wl_test_001", { now: "later" });
  assert.equal(badNow.code, "DENY_LEASE_INVALID_NOW");
}));

test("resolveActiveLease treats a lease at/after expiry as NOT active (now >= expires_at)", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  ledger.appendLease(lease(), { expectedSequence: 0, idempotencyKey: "idem_1", now: WITHIN });

  // Exactly at expiry: fail-closed dead.
  const atExpiry = ledger.resolveActiveLease("wl_test_001", { now: EXPIRES_MS });
  assert.equal(atExpiry.ok, false);
  assert.equal(atExpiry.code, "DENY_LEASE_EXPIRED");

  // After expiry: dead.
  const past = ledger.resolveActiveLease("wl_test_001", { now: EXPIRES_MS + 1 });
  assert.equal(past.code, "DENY_LEASE_EXPIRED");

  // One ms before expiry: still live.
  const live = ledger.resolveActiveLease("wl_test_001", { now: EXPIRES_MS - 1 });
  assert.equal(live.ok, true);
}));

test("resolveActiveLease returns the highest-version active lease (renewal supersedes)", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  // v1 expires at EXPIRES_ISO; v2 (renewal, same lease_id) re-anchors later.
  const laterExpiryIso = "2026-07-21T11:00:00+07:00";
  const laterExpiryMs = Date.parse(laterExpiryIso);
  ledger.appendLease(lease({ version: 1 }), { expectedSequence: 0, idempotencyKey: "idem_v1", now: WITHIN });
  ledger.appendLease(
    lease({ version: 2, expires_at: laterExpiryIso, ttl: laterExpiryMs - ISSUED_MS }),
    { expectedSequence: 1, idempotencyKey: "idem_v2", now: WITHIN }
  );

  const resolved = ledger.resolveActiveLease("wl_test_001", { now: WITHIN });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.version, 2);
  assert.equal(resolved.sequence, 2);

  // After v1's expiry but before v2's: v2 still active, v1 ignored.
  const betweenExpiries = ledger.resolveActiveLease("wl_test_001", { now: EXPIRES_MS + 1 });
  assert.equal(betweenExpiries.ok, true);
  assert.equal(betweenExpiries.version, 2);
}));

// --- Single-writer / lease-conflict denial ----------------------------------

test("appendLease denies a SECOND active lease for the same session (single writer)", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  ledger.appendLease(lease({ lease_id: "wl_A" }), { expectedSequence: 0, idempotencyKey: "idem_A", now: WITHIN });

  const conflict = ledger.appendLease(
    lease({ lease_id: "wl_B" }),
    { expectedSequence: 1, idempotencyKey: "idem_B", now: WITHIN }
  );
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, "DENY_LEASE_SINGLE_WRITER");
  assert.equal(conflict.conflictingLeaseId, "wl_A");
  assert.equal(conflict.sessionId, "ses_test_001");
  assert.equal(Object.isFrozen(conflict), true);

  // The denied second lease was NOT persisted.
  assert.equal(ledger.verify().count, 1);
}));

test("single-writer gate is scoped per session and lifts once the incumbent expires", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  ledger.appendLease(lease({ lease_id: "wl_A", session_id: "ses_1" }), { expectedSequence: 0, idempotencyKey: "idem_A", now: WITHIN });

  // A DIFFERENT session may hold its own active lease concurrently — no conflict.
  const otherSession = ledger.appendLease(
    lease({ lease_id: "wl_C", session_id: "ses_2" }),
    { expectedSequence: 1, idempotencyKey: "idem_C", now: WITHIN }
  );
  assert.equal(otherSession.ok, true);
  assert.equal(otherSession.record.sequence, 2);

  // Once ses_1's incumbent has expired, a new lease for ses_1 is allowed.
  const afterExpiry = ledger.appendLease(
    lease({ lease_id: "wl_B", session_id: "ses_1" }),
    { expectedSequence: 2, idempotencyKey: "idem_B", now: EXPIRES_MS + 1 }
  );
  assert.equal(afterExpiry.ok, true);
  assert.equal(afterExpiry.record.sequence, 3);
}));

test("a renewal (same lease_id, higher version) is NOT a single-writer conflict", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  ledger.appendLease(lease({ version: 1 }), { expectedSequence: 0, idempotencyKey: "idem_v1", now: WITHIN });
  const renewal = ledger.appendLease(
    lease({ version: 2, expires_at: "2026-07-21T11:00:00+07:00", ttl: Date.parse("2026-07-21T11:00:00+07:00") - ISSUED_MS }),
    { expectedSequence: 1, idempotencyKey: "idem_v2", now: WITHIN }
  );
  assert.equal(renewal.ok, true);
  assert.equal(renewal.record.sequence, 2);
}));

// --- Inherited hash-chain integrity + idempotency + concurrency -------------

test("identical lease append replays and idempotency-key reuse for different content is denied (inherited)", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  const first = ledger.appendLease(lease(), { expectedSequence: 0, idempotencyKey: "idem_replay", now: WITHIN });
  const replay = ledger.appendLease(lease(), { expectedSequence: 0, idempotencyKey: "idem_replay", now: WITHIN });
  assert.equal(replay.ok, true);
  assert.equal(replay.record.replayed, true);
  assert.equal(replay.record.recordHash, first.record.recordHash);

  // Reuse the same idempotency key for DIFFERENT content, in a DIFFERENT session
  // so the single-writer gate (which is checked first) does not pre-empt the
  // inherited idempotency-conflict denial being exercised here.
  assert.throws(
    () => ledger.appendLease(lease({ lease_id: "wl_other", session_id: "ses_other" }), { expectedSequence: 1, idempotencyKey: "idem_replay", now: WITHIN }),
    (error) => error instanceof LedgerError && error.code === "DENY_IDEMPOTENCY_CONFLICT"
  );
}));

test("stale optimistic sequence and duplicate (lease_id, version) fail closed (inherited)", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  ledger.appendLease(lease(), { expectedSequence: 0, idempotencyKey: "idem_1", now: WITHIN });

  assert.throws(
    () => ledger.appendLease(lease({ lease_id: "wl_x", session_id: "ses_other" }), { expectedSequence: 0, idempotencyKey: "idem_2", now: WITHIN }),
    (error) => error instanceof LedgerError && error.code === "DENY_SEQUENCE_CONFLICT"
  );

  // Same lease_id AND version = same composite entryId -> duplicate.
  assert.throws(
    () => ledger.appendLease(lease(), { expectedSequence: 1, idempotencyKey: "idem_dup", now: WITHIN }),
    (error) => error instanceof LedgerError && error.code === "DENY_DUPLICATE_ENTRY_ID"
  );
}));

test("an existing writer lock fails closed on lease append (inherited)", () => withTempLedger((directory) => {
  const path = join(directory, "leases.ndjson");
  const ledger = new WorkspaceLeaseLedger({ filePath: path });
  mkdirSync(`${path}.lock`);
  assert.throws(
    () => ledger.appendLease(lease(), { expectedSequence: 0, idempotencyKey: "idem_1", now: WITHIN }),
    (error) => error instanceof LedgerError && error.code === "LEDGER_BUSY"
  );
}));

test("tampering the lease ledger file is detected before any lease is returned (inherited)", () => withTempLedger((directory) => {
  const path = join(directory, "leases.ndjson");
  const ledger = new WorkspaceLeaseLedger({ filePath: path });
  ledger.appendLease(lease(), { expectedSequence: 0, idempotencyKey: "idem_1", now: WITHIN });
  const tampered = readFileSync(path, "utf8").replace("ses_test_001", "ses_hostile_001");
  writeFileSync(path, tampered, "utf8");
  assert.throws(
    () => ledger.read(),
    (error) => error instanceof LedgerError && error.code === "LEDGER_INTEGRITY_FAILURE"
  );
  assert.throws(
    () => ledger.resolveActiveLease("wl_test_001", { now: WITHIN }),
    (error) => error instanceof LedgerError && error.code === "LEDGER_INTEGRITY_FAILURE"
  );
}));

// --- Fixture round-trip through the registered validator ---------------------

test("valid/invalid fixtures round-trip through validateContract('workspace-lease', ...)", () => {
  const valid = JSON.parse(readFileSync(resolve(root, "tests/fixtures/valid/workspace-lease.json"), "utf8"));
  assert.deepEqual(validateContract("workspace-lease", valid), { kind: "workspace-lease", valid: true });

  const invalid = JSON.parse(readFileSync(resolve(root, "tests/fixtures/invalid/workspace-lease-missing-id.json"), "utf8"));
  assert.throws(
    () => validateContract("workspace-lease", invalid),
    (error) => error instanceof ContractValidationError && error.code === "DENY_CONTRACT_INVALID" && error.errors.length > 0
  );

  // The valid fixture is also durably appendable.
  withTempLedger((directory) => {
    const ledger = newLedger(directory);
    const res = ledger.appendLease(valid, { expectedSequence: 0, idempotencyKey: "idem_fixture", now: Date.parse(valid.issued_at) });
    assert.equal(res.ok, true);
    assert.equal(res.record.entry.payload.lease_id, valid.lease_id);
  });
});

// --- Deep-frozen outputs -----------------------------------------------------

test("resolveActiveLease returns a deep-frozen result the caller cannot mutate back into the ledger", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  ledger.appendLease(lease(), { expectedSequence: 0, idempotencyKey: "idem_1", now: WITHIN });
  const resolved = ledger.resolveActiveLease("wl_test_001", { now: WITHIN });
  assert.equal(Object.isFrozen(resolved), true);
  assert.equal(Object.isFrozen(resolved.lease), true);
  assert.equal(Object.isFrozen(resolved.lease.write_set), true);
  assert.throws(() => { resolved.lease.lease_id = "mutated"; }, TypeError);
  assert.throws(() => { resolved.lease.write_set.push("hostile"); }, TypeError);

  // A second resolve is unaffected by any attempted mutation of the first.
  const again = ledger.resolveActiveLease("wl_test_001", { now: WITHIN });
  assert.equal(again.lease.lease_id, "wl_test_001");
  assert.deepEqual(again.lease.write_set, ["src/ledger", "tests"]);
}));

// --- Atomic single-read snapshot / accessor-attack discipline ---------------

test("append snapshots the lease ONCE: a value-varying getter cannot make the stored record differ from the validated record", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  let reads = 0;
  const hostile = lease();
  // Replace lease_id with a getter that yields a valid value the FIRST read and
  // a distinct value on any subsequent read. structuredClone reads it exactly
  // once, so validation and storage both see the SAME first value.
  Object.defineProperty(hostile, "lease_id", {
    enumerable: true,
    configurable: true,
    get() {
      reads += 1;
      return reads === 1 ? "wl_snapshot_once" : `wl_varying_${reads}`;
    }
  });
  const res = ledger.appendLease(hostile, { expectedSequence: 0, idempotencyKey: "idem_1", now: WITHIN });
  assert.equal(res.ok, true);
  assert.equal(reads, 1, "lease_id getter must be read exactly once");
  assert.equal(res.record.entry.payload.lease_id, "wl_snapshot_once");
  const resolved = ledger.resolveActiveLease("wl_snapshot_once", { now: WITHIN });
  assert.equal(resolved.ok, true);
}));

test("a throwing property getter on the lease is contained to DENY_LEASE_MALFORMED, never propagated", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  const hostile = lease();
  Object.defineProperty(hostile, "write_set", {
    enumerable: true,
    configurable: true,
    get() { throw new Error("hostile accessor"); }
  });
  assert.throws(
    () => ledger.appendLease(hostile, { expectedSequence: 0, idempotencyKey: "idem_1", now: WITHIN }),
    (error) => error instanceof LedgerError && error.code === "DENY_LEASE_MALFORMED"
  );
  assert.equal(ledger.verify().count, 0);
}));

test("a non-object lease fails closed as DENY_LEASE_MALFORMED (deny-by-default)", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  for (const bad of [null, undefined, 42, "lease", ["src"]]) {
    assert.throws(
      () => ledger.appendLease(bad, { expectedSequence: 0, idempotencyKey: "idem_1", now: WITHIN }),
      (error) => error instanceof LedgerError && error.code === "DENY_LEASE_MALFORMED"
    );
  }
}));

// --- Single-writer TOCTOU fix (mod-wspace-s3-single-writer-toctou-fix-001) --
//
// Regression for docs/03-project-control/candidates/
// mod-wspace-s3-second-independent-review-001.md §3: the single-writer gate
// used to scan via an unlocked `this.read()` called BEFORE `this.append(...)`,
// so a caller whose pre-check ran against a stale view (here: the PUBLIC
// `read()` accessor overridden to return a stale/empty snapshot) but whose
// write used a correctly-fresh `expectedSequence` could land two
// simultaneously-active leases for one session. The fix moves the scan inside
// DurableLedger.append's own lock via a `preWriteCheck` hook, so the gate no
// longer calls `read()` at all — overriding it now has no effect.

test("single-writer gate is now atomic with the write: overriding the public read() accessor to fake a stale view no longer lets a second active lease land for the same session (regression, second-independent-review §3)", () => withTempLedger((directory) => {
  const path = join(directory, "leases.ndjson");

  // "Process A": real, unmodified path. Chain length -> 1.
  const a = new WorkspaceLeaseLedger({ filePath: path });
  const appendedA = a.appendLease(
    lease({ lease_id: "wl_A", session_id: "ses_race" }),
    { expectedSequence: 0, idempotencyKey: "idem_A", now: WITHIN }
  );
  assert.equal(appendedA.ok, true);

  // "Process B": fresh instance, same file. Reproduce the reviewer's PROBE1 —
  // override the PUBLIC read() accessor used only by the (former) unlocked
  // pre-check to return a stale/empty view, while `expectedSequence` is
  // sourced correctly/freshly (1), exactly matching the reviewer's scenario of
  // "the second writer's expectedSequence sourced independently of a read
  // taken at the exact same instant as its own single-writer check."
  const b = new WorkspaceLeaseLedger({ filePath: path });
  b.read = () => { throw new Error("stale/hostile read() must not be consulted by the single-writer gate"); };

  const resultB = b.appendLease(
    lease({ lease_id: "wl_B", session_id: "ses_race" }),
    { expectedSequence: 1, idempotencyKey: "idem_B", now: WITHIN }
  );

  // Correctly denied now, instead of the pre-fix bypass (bResult.ok === true).
  assert.equal(resultB.ok, false);
  assert.equal(resultB.code, "DENY_LEASE_SINGLE_WRITER");
  assert.equal(resultB.conflictingLeaseId, "wl_A");
  assert.equal(resultB.sessionId, "ses_race");

  // Only wl_A was ever persisted — no second active lease landed for ses_race.
  const reopened = new WorkspaceLeaseLedger({ filePath: path });
  assert.equal(reopened.verify().count, 1);
}));

test("the ordinary, non-racing case is unaffected by the fix: a ledger whose read() accessor is overridden to throw still allows a legitimate, non-conflicting append (no false deny introduced)", () => withTempLedger((directory) => {
  const path = join(directory, "leases.ndjson");
  const ledger = new WorkspaceLeaseLedger({ filePath: path });
  ledger.read = () => { throw new Error("the single-writer gate must never call read() anymore"); };

  const appended = ledger.appendLease(
    lease({ lease_id: "wl_solo", session_id: "ses_solo" }),
    { expectedSequence: 0, idempotencyKey: "idem_solo", now: WITHIN }
  );
  assert.equal(appended.ok, true);
  assert.equal(appended.record.sequence, 1);

  // A legitimate renewal (same lease_id, higher version) for the same session
  // also still succeeds — same-writer re-append is never a conflict.
  const renewed = ledger.appendLease(
    lease({ lease_id: "wl_solo", session_id: "ses_solo", version: 2, expires_at: "2026-07-21T11:00:00+07:00", ttl: Date.parse("2026-07-21T11:00:00+07:00") - ISSUED_MS }),
    { expectedSequence: 1, idempotencyKey: "idem_solo_v2", now: WITHIN }
  );
  assert.equal(renewed.ok, true);
  assert.equal(renewed.record.sequence, 2);
}));

// --- Byte-identity guard: this additive slice modified no file it read -------

test(`byte-identity: lease primitive and all OTHER contracts unchanged vs ${BASE}`, () => {
  // NOTE: src/ledger/durable-ledger.mjs is DELIBERATELY EXCLUDED from this
  // guard as of mod-wspace-s3-single-writer-toctou-fix-001. This slice's
  // original scope was purely additive against the base class; the TOCTOU fix
  // (see the SCOPE NOTE in workspace-lease-ledger.mjs and the producer
  // verification record mod-wspace-s3-single-writer-toctou-fix-producer-
  // verification-001.md) legitimately extends DurableLedger.append with an
  // optional `preWriteCheck` hook. That change is covered by its own direct
  // tests in tests/durable-ledger.test.mjs and is behavior-preserving for
  // every OTHER subclass (CheckpointLedger, DelegationLedger, EventLedger,
  // EvidenceLedger, DecisionLedger, KnowledgeLedger, OutcomeLedger), none of
  // which pass `preWriteCheck` and so see byte-for-byte identical behavior.
  const guarded = [
    "src/control/workspace-lease-policy.mjs",
    "src/control/write-set-policy.mjs"
  ];
  // Every contract schema that EXISTED AT THIS SLICE'S OWN BASE, except the
  // newly added workspace-lease one, must be byte-identical to that base
  // commit — proof this slice touched no other schema. Schemas added by
  // LATER, separately-scoped slices (e.g. MOD-INTEG S1's
  // integration-queue-entry.schema.json) postdate BASE and are outside this
  // guard's remit by construction — checked for existence-at-BASE first so a
  // later additive schema never breaks this test.
  for (const file of readdirSync(resolve(root, "contracts")).filter((f) => f.endsWith(".schema.json"))) {
    if (file === "workspace-lease.schema.json") continue;
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
  // Sanity: the reused lease primitive and base ledger are still present intact.
  const primitive = readFileSync(resolve(root, "src/control/workspace-lease-policy.mjs"), "utf8");
  assert.ok(primitive.includes("export function mintLease"), "lease primitive still exports mintLease");
  const base = readFileSync(resolve(root, "src/ledger/durable-ledger.mjs"), "utf8");
  assert.ok(base.includes("export class DurableLedger"), "DurableLedger base still present");
});
