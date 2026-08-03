import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { canonicalFingerprint } from "../src/contracts/canonical-fingerprint.mjs";
import {
  MemoryLifecycleConfigurationError,
  MemoryLifecycleLedger,
  createMemoryLifecycleService
} from "../src/index.mjs";

const NOW = new Date("2026-08-03T12:00:00.000Z");
const MANIFEST_HASH = "c".repeat(64);

function memory(overrides = {}) {
  const record = {
    memory_record_id: "mem-1",
    version: 1,
    project_id: "project-1",
    work_package_id: "wp-1",
    session_id: "session-1",
    actor_id: "producer-1",
    layer: "project",
    source: "MemoryGatewayService",
    statement: "governed memory",
    classification: "INTERNAL",
    confidence: 0.9,
    provenance: { evidence_refs: ["evidence-1"], origin_record_id: "origin-1" },
    valid_from: "2026-08-01T00:00:00.000Z",
    valid_until: "2026-09-01T00:00:00.000Z",
    access_policy: "project-readers",
    retention_policy: "retain-30-days",
    admitted_at: "2026-08-01T00:00:00.000Z",
    ...overrides
  };
  if (!Object.prototype.hasOwnProperty.call(overrides, "content_hash")) {
    const { admitted_at: admittedAt, ...hashBody } = record;
    void admittedAt;
    record.content_hash = canonicalFingerprint(hashBody);
  }
  return record;
}

function authority(expected, overrides = {}) {
  return {
    decision: "ALLOW",
    code: "ALLOW_MEMORY_LIFECYCLE",
    ...expected,
    actor_id: "governor-1",
    work_package_id: "wp-lifecycle",
    session_id: "session-lifecycle",
    authority_ref: "authority:memory-lifecycle",
    valid_from: "2026-08-03T11:00:00.000Z",
    valid_until: "2026-08-03T13:00:00.000Z",
    ...overrides
  };
}

function mutation(eventType, overrides = {}) {
  return {
    project_id: "project-1",
    layer: "project",
    memory_record_id: "mem-1",
    memory_record_version: 1,
    event_type: eventType,
    reason: "governed lifecycle transition",
    idempotency_key: `idem-${eventType}`,
    ...overrides
  };
}

function resolution(overrides = {}) {
  return {
    project_id: "project-1",
    layer: "project",
    memory_record_id: "mem-1",
    memory_record_version: 1,
    ...overrides
  };
}

function harness(t, overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), "secb-memory-lifecycle-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filePath = join(directory, "lifecycle.jsonl");
  const ledger = overrides.ledger ?? new MemoryLifecycleLedger({ filePath });
  let records = overrides.records ?? [memory()];
  const service = createMemoryLifecycleService({
    ledger,
    now: overrides.now ?? (() => new Date(NOW)),
    authorityResolver: overrides.authorityResolver ?? (async (expected) => authority(expected)),
    recordResolver: overrides.recordResolver ?? (async () => records),
    retentionPolicyResolver: overrides.retentionPolicyResolver ?? (async (request) => ({
      decision: "ALLOW",
      code: "ALLOW_RETENTION",
      project_id: request.project_id,
      memory_record_id: request.memory_record_id,
      memory_record_version: request.memory_record_version,
      policy_id: request.policy_id,
      retain_until: "2026-09-02T00:00:00.000Z"
    }))
  });
  return { directory, filePath, ledger, service, setRecords(value) { records = value; } };
}

test("construction fails closed when lifecycle collaborators are absent", () => {
  assert.throws(
    () => createMemoryLifecycleService(),
    (error) => error instanceof MemoryLifecycleConfigurationError && error.code === "INVALID_LIFECYCLE_LEDGER"
  );
});

test("a current, temporally valid, retained record resolves effective", async (t) => {
  const { service } = harness(t);
  const result = await service.resolve(resolution());
  assert.deepEqual(result, {
    ok: true,
    code: "MEMORY_EFFECTIVE",
    project_id: "project-1",
    layer: "project",
    memory_record_id: "mem-1",
    memory_record_version: 1,
    content_hash: memory().content_hash,
    evaluated_at: NOW.toISOString(),
    lifecycle_sequence: 0,
    lifecycle_head_hash: "0".repeat(64),
    active_legal_hold_count: 0,
    preservation_required: false
  });
  assert.ok(Object.isFrozen(result));
});

test("resolution rejects caller extras, symbol keys, and hostile accessors", async (t) => {
  const { service } = harness(t);
  assert.equal((await service.resolve({ ...resolution(), actor_id: "smuggled" })).code, "DENY_LIFECYCLE_REQUEST_MALFORMED");
  assert.equal((await service.resolve({ ...resolution(), [Symbol("x")]: true })).code, "DENY_LIFECYCLE_REQUEST_MALFORMED");
  const hostile = resolution();
  Object.defineProperty(hostile, "project_id", { enumerable: true, get() { throw new Error("trap"); } });
  assert.equal((await service.resolve(hostile)).code, "DENY_LIFECYCLE_REQUEST_MALFORMED");
});

test("exact authority is required before lineage is read", async (t) => {
  let recordReads = 0;
  const { service } = harness(t, {
    authorityResolver: async () => ({ decision: "DENY" }),
    recordResolver: async () => { recordReads += 1; return [memory()]; }
  });
  assert.equal((await service.resolve(resolution())).code, "DENY_LIFECYCLE_AUTHORITY");
  assert.equal(recordReads, 0);
});

test("authority scope, operation, event type, validity, and closed shape are exact", async (t) => {
  for (const mutate of [
    (value) => ({ ...value, project_id: "other" }),
    (value) => ({ ...value, operation: "other" }),
    (value) => ({ ...value, event_type: "TOMBSTONED" }),
    (value) => ({ ...value, valid_until: NOW.toISOString() }),
    (value) => ({ ...value, extra: true })
  ]) {
    const { service } = harness(t, { authorityResolver: async (expected) => mutate(authority(expected)) });
    const result = await service.resolve(resolution());
    assert.equal(result.code, "DENY_LIFECYCLE_AUTHORITY");
  }
});

test("superseded records deny and identify the unique chain head", async (t) => {
  const second = memory({ memory_record_id: "mem-2", version: 2, supersedes: "mem-1", statement: "replacement memory" });
  const { service } = harness(t, { records: [memory(), second] });
  const old = await service.resolve(resolution());
  assert.equal(old.code, "DENY_MEMORY_SUPERSEDED");
  assert.equal(old.chain_head_id, "mem-2");
  assert.equal(old.chain_head_version, 2);
  const head = await service.resolve(resolution({ memory_record_id: "mem-2", memory_record_version: 2 }));
  assert.equal(head.code, "MEMORY_EFFECTIVE");
});

test("higher versions of the same immutable record identity supersede lower versions", async (t) => {
  const second = memory({ version: 2, statement: "version two", admitted_at: "2026-08-02T00:00:00.000Z" });
  const { service } = harness(t, { records: [memory(), second] });
  assert.equal((await service.resolve(resolution())).code, "DENY_MEMORY_SUPERSEDED");
  assert.equal((await service.resolve(resolution({ memory_record_version: 2 }))).code, "MEMORY_EFFECTIVE");
});

test("missing parents, forks, ambiguous ids, and missing targets fail closed", async (t) => {
  const cases = [
    [[memory({ memory_record_id: "mem-2", version: 2, supersedes: "missing" })], resolution({ memory_record_id: "mem-2", memory_record_version: 2 }), "DENY_LINEAGE_INVALID"],
    [[memory(), memory({ memory_record_id: "mem-2", version: 2, supersedes: "mem-1", statement: "child two" }), memory({ memory_record_id: "mem-3", version: 3, supersedes: "mem-1", statement: "child three" })], resolution(), "DENY_LINEAGE_FORK"],
    [[memory(), memory()], resolution(), "DENY_LINEAGE_INVALID"],
    [[memory({ memory_record_id: "other" })], resolution(), "DENY_MEMORY_RECORD_NOT_FOUND"]
  ];
  for (const [records, request, code] of cases) {
    const { service } = harness(t, { records });
    assert.equal((await service.resolve(request)).code, code);
  }
});

test("invalid and oversized lineage responses fail closed", async (t) => {
  const invalid = harness(t, { recordResolver: async () => [{ ...memory(), rogue: true }] });
  assert.equal((await invalid.service.resolve(resolution())).code, "DENY_LINEAGE_INVALID");
  const oversized = harness(t, { recordResolver: async () => Array.from({ length: 10_001 }, (_, index) => memory({ memory_record_id: `m-${index}`, version: index + 1 })) });
  assert.equal((await oversized.service.resolve(resolution())).code, "DENY_LINEAGE_INVALID");
});

test("legal hold placement and release are append-only and durable across restart", async (t) => {
  const { service, filePath } = harness(t);
  const placed = await service.recordLifecycleEvent(mutation("LEGAL_HOLD_PLACED", { hold_id: "hold-1" }));
  assert.equal(placed.code, "MEMORY_LIFECYCLE_RECORDED");
  assert.equal((await service.resolve(resolution())).active_legal_hold_count, 1);
  const replay = await service.recordLifecycleEvent(mutation("LEGAL_HOLD_PLACED", { hold_id: "hold-1" }));
  assert.equal(replay.ok, true);
  assert.equal(replay.receipt.replayed, true);

  const restarted = createMemoryLifecycleService({
    ledger: new MemoryLifecycleLedger({ filePath }),
    now: () => new Date(NOW),
    authorityResolver: async (expected) => authority(expected),
    recordResolver: async () => [memory()],
    retentionPolicyResolver: async (request) => ({ decision: "ALLOW", code: "ALLOW_RETENTION", project_id: request.project_id, memory_record_id: request.memory_record_id, memory_record_version: request.memory_record_version, policy_id: request.policy_id, retain_until: null })
  });
  assert.equal((await restarted.resolve(resolution())).active_legal_hold_count, 1);
  const released = await restarted.recordLifecycleEvent(mutation("LEGAL_HOLD_RELEASED", { hold_id: "hold-1", idempotency_key: "release-1" }));
  assert.equal(released.ok, true);
  assert.equal((await restarted.resolve(resolution())).active_legal_hold_count, 0);
});

test("invalid legal-hold transitions deny without appending", async (t) => {
  const { service, ledger } = harness(t);
  assert.equal((await service.recordLifecycleEvent(mutation("LEGAL_HOLD_RELEASED", { hold_id: "absent" }))).code, "DENY_LEGAL_HOLD_NOT_ACTIVE");
  assert.equal(ledger.verify().count, 0);
  await service.recordLifecycleEvent(mutation("LEGAL_HOLD_PLACED", { hold_id: "hold-1" }));
  assert.equal((await service.recordLifecycleEvent(mutation("LEGAL_HOLD_PLACED", { hold_id: "hold-1", reason: "different duplicate request", idempotency_key: "other-id" }))).code, "DENY_LEGAL_HOLD_ALREADY_ACTIVE");
  assert.equal(ledger.verify().count, 1);
});

test("retention expiry denies retrieval while active hold preserves storage obligation", async (t) => {
  const { service } = harness(t, { retentionPolicyResolver: async (request) => ({ decision: "ALLOW", code: "ALLOW_RETENTION", project_id: request.project_id, memory_record_id: request.memory_record_id, memory_record_version: request.memory_record_version, policy_id: request.policy_id, retain_until: "2026-08-03T11:59:59.000Z" }) });
  assert.equal((await service.resolve(resolution())).preservation_required, false);
  await service.recordLifecycleEvent(mutation("LEGAL_HOLD_PLACED", { hold_id: "hold-retention" }));
  const held = await service.resolve(resolution());
  assert.equal(held.code, "DENY_RETENTION_EXPIRED");
  assert.equal(held.preservation_required, true);
});

test("malformed or drifting retention decisions fail closed", async (t) => {
  const cases = [
    { decision: "DENY" },
    { decision: "ALLOW", code: "ALLOW", project_id: "other", memory_record_id: "mem-1", memory_record_version: 1, policy_id: "retain-30-days", retain_until: null },
    { decision: "ALLOW", code: "ALLOW", project_id: "project-1", memory_record_id: "mem-1", memory_record_version: 1, policy_id: "retain-30-days", retain_until: null, extra: true }
  ];
  for (const decision of cases) {
    const { service } = harness(t, { retentionPolicyResolver: async () => decision });
    assert.equal((await service.resolve(resolution())).code, "DENY_RETENTION_POLICY");
  }
});

test("temporal validity is re-evaluated at trusted resolution time", async (t) => {
  const { service } = harness(t, { records: [memory({ valid_until: NOW.toISOString() })] });
  assert.equal((await service.resolve(resolution())).code, "DENY_MEMORY_NOT_TEMPORALLY_VALID");
});

test("authority and retention are re-evaluated at the final trusted-time boundary", async (t) => {
  let authorityClockCalls = 0;
  const authorityDrift = harness(t, {
    now: () => new Date(authorityClockCalls++ === 0 ? "2026-08-03T12:00:00.000Z" : "2026-08-03T13:00:00.000Z")
  });
  assert.equal((await authorityDrift.service.resolve(resolution())).code, "DENY_LIFECYCLE_AUTHORITY");

  let retentionClockCalls = 0;
  const retentionDrift = harness(t, {
    now: () => new Date(retentionClockCalls++ === 0 ? "2026-08-03T12:00:00.000Z" : "2026-08-03T12:30:00.000Z"),
    authorityResolver: async (expected) => authority(expected, { valid_until: "2026-08-03T14:00:00.000Z" }),
    retentionPolicyResolver: async (request) => ({ decision: "ALLOW", code: "ALLOW_RETENTION", project_id: request.project_id, memory_record_id: request.memory_record_id, memory_record_version: request.memory_record_version, policy_id: request.policy_id, retain_until: "2026-08-03T12:15:00.000Z" })
  });
  assert.equal((await retentionDrift.service.resolve(resolution())).code, "DENY_RETENTION_EXPIRED");
});

test("resolution denies when lifecycle head changes during the read", async (t) => {
  let verification = 0;
  const ledger = {
    appendLifecycleEvent() { throw new Error("unused"); },
    readLifecycleEvents() { return []; },
    verify() {
      verification += 1;
      return verification === 1
        ? { count: 0, headHash: "0".repeat(64) }
        : { count: 1, headHash: "1".repeat(64) };
    }
  };
  const { service } = harness(t, { ledger });
  assert.equal((await service.resolve(resolution())).code, "DENY_LIFECYCLE_CHANGED");
});

test("redaction and tombstone are terminal deny-on-use states", async (t) => {
  const redacted = harness(t);
  assert.equal((await redacted.service.recordLifecycleEvent(mutation("REDACTION_APPLIED", { redaction_manifest_hash: MANIFEST_HASH }))).ok, true);
  assert.equal((await redacted.service.resolve(resolution())).code, "DENY_MEMORY_REDACTED");
  assert.equal((await redacted.service.recordLifecycleEvent(mutation("TOMBSTONED", { idempotency_key: "tombstone-after-redaction" }))).code, "DENY_LIFECYCLE_TERMINAL");

  const tombstoned = harness(t);
  assert.equal((await tombstoned.service.recordLifecycleEvent(mutation("TOMBSTONED"))).ok, true);
  assert.equal((await tombstoned.service.resolve(resolution())).code, "DENY_MEMORY_TOMBSTONED");
});

test("event-specific mutation fields are closed and caller identity cannot be smuggled", async (t) => {
  const { service, ledger } = harness(t);
  assert.equal((await service.recordLifecycleEvent(mutation("REDACTION_APPLIED"))).code, "DENY_LIFECYCLE_REQUEST_MALFORMED");
  assert.equal((await service.recordLifecycleEvent(mutation("TOMBSTONED", { hold_id: "smuggled" }))).code, "DENY_LIFECYCLE_REQUEST_MALFORMED");
  assert.equal((await service.recordLifecycleEvent({ ...mutation("TOMBSTONED"), actor_id: "caller" })).code, "DENY_LIFECYCLE_REQUEST_MALFORMED");
  assert.equal(ledger.verify().count, 0);
});

test("lifecycle events bind the immutable target hash and detect later drift", async (t) => {
  const fixture = harness(t);
  await fixture.service.recordLifecycleEvent(mutation("LEGAL_HOLD_PLACED", { hold_id: "hold-drift" }));
  fixture.setRecords([memory({ statement: "legitimate replacement bytes under the same forbidden identity" })]);
  assert.equal((await fixture.service.resolve(resolution())).code, "DENY_LIFECYCLE_TARGET_DRIFT");
});

test("idempotency conflicts do not append a second lifecycle event", async (t) => {
  const { service, ledger } = harness(t);
  await service.recordLifecycleEvent(mutation("LEGAL_HOLD_PLACED", { hold_id: "hold-1", idempotency_key: "same" }));
  const conflict = await service.recordLifecycleEvent(mutation("LEGAL_HOLD_PLACED", { hold_id: "hold-2", idempotency_key: "same" }));
  assert.equal(conflict.code, "DENY_IDEMPOTENCY_CONFLICT");
  assert.equal(ledger.verify().count, 1);
});

test("ledger tampering is detected before lifecycle state is returned", async (t) => {
  const { service, filePath } = harness(t);
  await service.recordLifecycleEvent(mutation("LEGAL_HOLD_PLACED", { hold_id: "hold-1" }));
  const rows = readFileSync(filePath, "utf8").trim().split(/\r?\n/);
  const record = JSON.parse(rows[0]);
  record.entry.payload.reason = "tampered";
  writeFileSync(filePath, `${JSON.stringify(record)}\n`, "utf8");
  assert.equal((await service.resolve(resolution())).code, "LEDGER_INTEGRITY_FAILURE");
});

test("mutation of an absent target is denied and does not write", async (t) => {
  const { service, ledger } = harness(t, { records: [memory({ memory_record_id: "other" })] });
  assert.equal((await service.recordLifecycleEvent(mutation("TOMBSTONED"))).code, "DENY_MEMORY_RECORD_NOT_FOUND");
  assert.equal(ledger.verify().count, 0);
});
