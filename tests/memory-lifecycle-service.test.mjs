import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { canonicalFingerprint } from "../src/contracts/canonical-fingerprint.mjs";
import { checkPairwiseDistinct } from "../src/control/sod-rules.mjs";
import {
  MemoryLifecycleConfigurationError,
  MemoryLifecycleLedger,
  createMemoryLifecycleService
} from "../src/index.mjs";

const NOW = new Date("2026-08-03T12:00:00.000Z");
const MANIFEST_HASH = "c".repeat(64);
const INTEGRITY_KEY = Buffer.alloc(32, 7);

function createHeadAnchor() {
  let checkpoint = { count: 0, headHash: "0".repeat(64) };
  return {
    read() { return structuredClone(checkpoint); },
    compareAndSet({ expected, next }) {
      if (canonicalFingerprint(expected) !== canonicalFingerprint(checkpoint)) return false;
      checkpoint = structuredClone(next);
      return true;
    }
  };
}

function createBoundaryCoordinator(getRecords, overrides = {}) {
  const authorityDecision = overrides.authorityDecision ?? ((expected) => authority(expected));
  const evidenceDecision = overrides.evidenceDecision ?? ((request) => evidence(request));
  const retentionDecision = overrides.retentionDecision ?? ((request) => ({
    decision: "ALLOW", code: "ALLOW_RETENTION", decision_id: "retention-decision-1",
    project_id: request.project_id, memory_record_id: request.memory_record_id,
    memory_record_version: request.memory_record_version, policy_id: request.policy_id,
    retain_until: "2026-09-02T00:00:00.000Z"
  }));
  return {
    withMutationFence(request, callback) {
      return callback({
        records: getRecords(),
        evidence: evidenceDecision({ ...request.evidence_expected, active_legal_hold_count: request.active_legal_hold_count }),
        authority: authorityDecision(request.authority_expected)
      });
    },
    withResolutionFence(request, callback) {
      return callback({ records: getRecords(), retention: retentionDecision(request.retention_request), authority: authorityDecision(request.authority_expected) });
    }
  };
}

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
    decision_id: "decision-memory-lifecycle-1",
    actor_id: "governor-1",
    producer_actor_id: "producer-1",
    reviewer_actor_id: "reviewer-1",
    approver_actor_id: "governor-1",
    work_package_id: "wp-lifecycle",
    session_id: "session-lifecycle",
    authority_ref: "authority:memory-lifecycle",
    valid_from: "2026-08-03T11:00:00.000Z",
    valid_until: "2026-08-03T13:00:00.000Z",
    ...overrides
  };
}

function evidence(request, overrides = {}) {
  const { active_legal_hold_count: activeHoldCount, ...expected } = request;
  return {
    decision: "ACCEPTED",
    code: "EVIDENCE_ACCEPTED",
    evidence_id: "evidence-lifecycle-1",
    evidence_hash: "e".repeat(64),
    ...expected,
    evidence_acceptor_actor_id: "evidence-acceptor-1",
    preservation_action: activeHoldCount > 0 && ["REDACTION_APPLIED", "TOMBSTONED"].includes(request.event_type)
      ? "PRESERVE_ORIGINAL"
      : "NOT_APPLICABLE",
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
  const headAnchor = overrides.headAnchor ?? createHeadAnchor();
  const ledger = overrides.ledger ?? new MemoryLifecycleLedger({ filePath, integrityKey: INTEGRITY_KEY, headAnchor });
  let records = overrides.records ?? [memory()];
  const boundaryCoordinator = overrides.boundaryCoordinator ?? createBoundaryCoordinator(() => records);
  const service = createMemoryLifecycleService({
    ledger,
    now: overrides.now ?? (() => new Date(NOW)),
    authorityResolver: overrides.authorityResolver ?? (async (expected) => authority(expected)),
    recordResolver: overrides.recordResolver ?? (async () => records),
    evidenceResolver: overrides.evidenceResolver ?? (async (request) => evidence(request)),
    boundaryCoordinator,
    sodRules: overrides.sodRules ?? { checkPairwiseDistinct },
    timeouts: overrides.timeouts,
    retentionPolicyResolver: overrides.retentionPolicyResolver ?? (async (request) => ({
      decision: "ALLOW",
      code: "ALLOW_RETENTION",
      decision_id: "retention-decision-1",
      project_id: request.project_id,
      memory_record_id: request.memory_record_id,
      memory_record_version: request.memory_record_version,
      policy_id: request.policy_id,
      retain_until: "2026-09-02T00:00:00.000Z"
    }))
  });
  return { directory, filePath, headAnchor, ledger, service, setRecords(value) { records = value; } };
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
  assert.equal(result.ok, true);
  assert.equal(result.code, "MEMORY_EFFECTIVE");
  assert.equal(result.memory_record_id, "mem-1");
  assert.equal(result.content_hash, memory().content_hash);
  assert.equal(result.authority_decision_id, "decision-memory-lifecycle-1");
  assert.match(result.state_fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(result.lifecycle_sequence, 0);
  assert.equal(result.lifecycle_head_hash, "0".repeat(64));
  assert.equal(result.preservation_required, false);
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
  const { service, filePath, headAnchor } = harness(t);
  const placed = await service.recordLifecycleEvent(mutation("LEGAL_HOLD_PLACED", { hold_id: "hold-1" }));
  assert.equal(placed.code, "MEMORY_LIFECYCLE_RECORDED");
  assert.equal((await service.resolve(resolution())).active_legal_hold_count, 1);
  const replay = await service.recordLifecycleEvent(mutation("LEGAL_HOLD_PLACED", { hold_id: "hold-1" }));
  assert.equal(replay.ok, true);
  assert.equal(replay.receipt.replayed, true);

  const restarted = createMemoryLifecycleService({
    ledger: new MemoryLifecycleLedger({ filePath, integrityKey: INTEGRITY_KEY, headAnchor }),
    now: () => new Date(NOW),
    authorityResolver: async (expected) => authority(expected),
    recordResolver: async () => [memory()],
    evidenceResolver: async (request) => evidence(request),
    boundaryCoordinator: createBoundaryCoordinator(() => [memory()], { retentionDecision: (request) => ({
      decision: "ALLOW", code: "ALLOW_RETENTION", decision_id: "retention-decision-1", project_id: request.project_id,
      memory_record_id: request.memory_record_id, memory_record_version: request.memory_record_version,
      policy_id: request.policy_id, retain_until: null
    }) }),
    sodRules: { checkPairwiseDistinct },
    retentionPolicyResolver: async (request) => ({ decision: "ALLOW", code: "ALLOW_RETENTION", decision_id: "retention-decision-1", project_id: request.project_id, memory_record_id: request.memory_record_id, memory_record_version: request.memory_record_version, policy_id: request.policy_id, retain_until: null })
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
  const { service } = harness(t, { retentionPolicyResolver: async (request) => ({ decision: "ALLOW", code: "ALLOW_RETENTION", decision_id: "retention-decision-1", project_id: request.project_id, memory_record_id: request.memory_record_id, memory_record_version: request.memory_record_version, policy_id: request.policy_id, retain_until: "2026-08-03T11:59:59.000Z" }) });
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
    retentionPolicyResolver: async (request) => ({ decision: "ALLOW", code: "ALLOW_RETENTION", decision_id: "retention-decision-1", project_id: request.project_id, memory_record_id: request.memory_record_id, memory_record_version: request.memory_record_version, policy_id: request.policy_id, retain_until: "2026-08-03T12:15:00.000Z" })
  });
  assert.equal((await retentionDrift.service.resolve(resolution())).code, "DENY_RETENTION_EXPIRED");
});

test("resolution denies when lifecycle head changes during the read", async (t) => {
  let verification = 0;
  const ledger = {
    appendLifecycleEvent() { throw new Error("unused"); },
    readLifecycleEvents() { return []; },
    readLifecycleEventByIdempotencyKey() { return null; },
    validateLifecycleEvent(event) { return event; },
    verify() {
      verification += 1;
      return verification === 1
        ? { valid: true, ledgerId: "secb-memory-lifecycle-ledger", count: 0, headHash: "0".repeat(64) }
        : { valid: true, ledgerId: "secb-memory-lifecycle-ledger", count: 1, headHash: "1".repeat(64) };
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

test("concurrent tombstone during retention evaluation is denied at the return boundary", async (t) => {
  let injected = false;
  let fixture;
  fixture = harness(t, {
    retentionPolicyResolver: async (request) => {
      if (!injected) {
        injected = true;
        const tombstone = await fixture.service.recordLifecycleEvent(mutation("TOMBSTONED", { idempotency_key: "race-tombstone" }));
        assert.equal(tombstone.ok, true);
      }
      return {
        decision: "ALLOW", code: "ALLOW_RETENTION", decision_id: "retention-race",
        project_id: request.project_id, memory_record_id: request.memory_record_id,
        memory_record_version: request.memory_record_version, policy_id: request.policy_id, retain_until: null
      };
    }
  });
  assert.equal((await fixture.service.resolve(resolution())).code, "DENY_MEMORY_TOMBSTONED");
});

test("concurrent supersession during retention evaluation is denied", async (t) => {
  let fixture;
  fixture = harness(t, {
    retentionPolicyResolver: async (request) => {
      fixture.setRecords([
        memory(),
        memory({ memory_record_id: "mem-2", version: 2, supersedes: "mem-1", statement: "concurrent replacement" })
      ]);
      return {
        decision: "ALLOW", code: "ALLOW_RETENTION", decision_id: "retention-race",
        project_id: request.project_id, memory_record_id: request.memory_record_id,
        memory_record_version: request.memory_record_version, policy_id: request.policy_id, retain_until: null
      };
    }
  });
  assert.equal((await fixture.service.resolve(resolution())).code, "DENY_MEMORY_SUPERSEDED");
});

test("authority revoked after precheck denies before return or append", async (t) => {
  let calls = 0;
  const fixture = harness(t, {
    authorityResolver: async (expected) => {
      calls += 1;
      return calls === 1 ? authority(expected) : { decision: "DENY" };
    }
  });
  assert.equal((await fixture.service.resolve(resolution())).code, "DENY_LIFECYCLE_AUTHORITY");
  calls = 0;
  assert.equal((await fixture.service.recordLifecycleEvent(mutation("TOMBSTONED"))).code, "DENY_LIFECYCLE_AUTHORITY");
  assert.equal(fixture.ledger.verify().count, 0);
});

test("idempotent retry remains stable when trusted time advances", async (t) => {
  let clockCalls = 0;
  const { service, ledger } = harness(t, {
    now: () => new Date(clockCalls++ < 2 ? "2026-08-03T12:00:00.000Z" : "2026-08-03T12:30:00.000Z")
  });
  const request = mutation("LEGAL_HOLD_PLACED", { hold_id: "hold-stable-replay" });
  assert.equal((await service.recordLifecycleEvent(request)).ok, true);
  const replay = await service.recordLifecycleEvent(request);
  assert.equal(replay.ok, true);
  assert.equal(replay.receipt.replayed, true);
  assert.equal(ledger.verify().count, 1);
});

test("append without exact durable readback fails closed", async (t) => {
  const ledger = {
    appendLifecycleEvent() { return null; },
    readLifecycleEvents() { return []; },
    readLifecycleEventByIdempotencyKey() { return null; },
    validateLifecycleEvent(event) { return event; },
    verify() { return { valid: true, ledgerId: "secb-memory-lifecycle-ledger", count: 0, headHash: "0".repeat(64) }; }
  };
  const { service } = harness(t, { ledger });
  assert.equal((await service.recordLifecycleEvent(mutation("TOMBSTONED"))).code, "DENY_LIFECYCLE_DURABILITY");
});

test("malformed ledger output and dependency timeout are contained", async (t) => {
  const malformedLedger = {
    appendLifecycleEvent() { throw new Error("unused"); },
    readLifecycleEvents() { return {}; },
    readLifecycleEventByIdempotencyKey() { return null; },
    validateLifecycleEvent(event) { return event; },
    verify() { return { valid: true, ledgerId: "secb-memory-lifecycle-ledger", count: 0, headHash: "0".repeat(64) }; }
  };
  assert.equal((await harness(t, { ledger: malformedLedger }).service.resolve(resolution())).code, "DENY_LIFECYCLE_STORE_UNAVAILABLE");

  const never = new Promise(() => {});
  const timed = harness(t, { authorityResolver: async () => never, timeouts: { authority_ms: 5 } });
  assert.equal((await timed.service.resolve(resolution())).code, "DENY_LIFECYCLE_AUTHORITY");
});

test("same-id versions require monotonic admission time", async (t) => {
  const records = [memory(), memory({ version: 2, admitted_at: "2026-07-31T00:00:00.000Z", statement: "backdated version" })];
  assert.equal((await harness(t, { records }).service.resolve(resolution({ memory_record_version: 2 }))).code, "DENY_LINEAGE_INVALID");
});

test("commit authority, evidence, and separation-of-duties bindings are exact", async (t) => {
  const substituted = harness(t, {
    authorityResolver: async (expected) => authority(expected, expected.phase === "COMMIT" ? { parameters_hash: "f".repeat(64) } : {})
  });
  assert.equal((await substituted.service.recordLifecycleEvent(mutation("LEGAL_HOLD_PLACED", { hold_id: "hold-bound" }))).code, "DENY_LIFECYCLE_AUTHORITY");
  assert.equal(substituted.ledger.verify().count, 0);

  const badEvidence = harness(t, {
    evidenceResolver: async (request) => evidence(request, { target_content_hash: "a".repeat(64) })
  });
  assert.equal((await badEvidence.service.recordLifecycleEvent(mutation("TOMBSTONED"))).code, "DENY_LIFECYCLE_EVIDENCE");

  const overlapping = harness(t, {
    evidenceResolver: async (request) => evidence(request, { evidence_acceptor_actor_id: "producer-1" })
  });
  assert.equal((await overlapping.service.recordLifecycleEvent(mutation("TOMBSTONED"))).code, "DENY_LIFECYCLE_SOD");
});

test("authenticated lifecycle events reject malicious rewrite even after base hashes are recomputed", async (t) => {
  const { service, filePath } = harness(t);
  assert.equal((await service.recordLifecycleEvent(mutation("LEGAL_HOLD_PLACED", { hold_id: "hold-authenticated" }))).ok, true);
  const record = JSON.parse(readFileSync(filePath, "utf8").trim());
  record.entry.payload.reason = "malicious rewrite";
  record.entryHash = canonicalFingerprint(record.entry);
  record.recordHash = canonicalFingerprint({
    ledgerId: record.ledgerId,
    sequence: record.sequence,
    previousHash: record.previousHash,
    entryHash: record.entryHash
  });
  writeFileSync(filePath, `${JSON.stringify(record)}\n`, "utf8");
  assert.ok(["LIFECYCLE_EVENT_INTEGRITY_FAILURE", "LIFECYCLE_ROLLBACK_DETECTED"].includes((await service.resolve(resolution())).code));
});

test("integrity key and request resource bounds fail closed", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "secb-memory-key-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  assert.throws(() => new MemoryLifecycleLedger({ filePath: join(directory, "ledger.jsonl"), integrityKey: Buffer.alloc(8) }), /integrityKey/);

  const { service, ledger } = harness(t);
  assert.equal((await service.recordLifecycleEvent(mutation("TOMBSTONED", { reason: "x".repeat(2_049) }))).code, "DENY_LIFECYCLE_REQUEST_MALFORMED");
  assert.equal(ledger.verify().count, 0);
});

test("lineage is revalidated after COMMIT authority for resolve and destructive mutation", async (t) => {
  let resolveFixture;
  resolveFixture = harness(t, {
    authorityResolver: async (expected) => {
      if (expected.phase === "COMMIT") resolveFixture.setRecords([memory(), memory({ memory_record_id: "mem-2", version: 2, supersedes: "mem-1", statement: "late successor" })]);
      return authority(expected);
    }
  });
  assert.ok(["DENY_LINEAGE_CHANGED", "DENY_MEMORY_SUPERSEDED"].includes((await resolveFixture.service.resolve(resolution())).code));

  let mutationFixture;
  mutationFixture = harness(t, {
    authorityResolver: async (expected) => {
      if (expected.phase === "COMMIT") mutationFixture.setRecords([memory(), memory({ memory_record_id: "mem-2", version: 2, supersedes: "mem-1", statement: "late successor" })]);
      return authority(expected);
    }
  });
  assert.ok(["DENY_LINEAGE_CHANGED", "DENY_MEMORY_SUPERSEDED"].includes((await mutationFixture.service.recordLifecycleEvent(mutation("TOMBSTONED"))).code));
  assert.equal(mutationFixture.ledger.verify().count, 0);
});

test("target drift during retention cannot inherit the old policy decision", async (t) => {
  let fixture;
  fixture = harness(t, {
    retentionPolicyResolver: async (request) => {
      fixture.setRecords([memory({ statement: "changed target", retention_policy: "retain-new" })]);
      return { decision: "ALLOW", code: "ALLOW_RETENTION", decision_id: "old-policy", project_id: request.project_id,
        memory_record_id: request.memory_record_id, memory_record_version: request.memory_record_version,
        policy_id: request.policy_id, retain_until: null };
    }
  });
  assert.equal((await fixture.service.resolve(resolution())).code, "DENY_LINEAGE_CHANGED");
});

test("evidence must remain accepted and unexpired at the commit instant", async (t) => {
  let calls = 0;
  const { service, ledger } = harness(t, {
    now: () => new Date(calls++ === 0 ? "2026-08-03T12:00:00.000Z" : "2026-08-03T12:30:00.000Z"),
    authorityResolver: async (expected) => authority(expected, { valid_until: "2026-08-03T14:00:00.000Z" }),
    evidenceResolver: async (request) => evidence(request, { valid_until: "2026-08-03T12:15:00.000Z" })
  });
  assert.equal((await service.recordLifecycleEvent(mutation("TOMBSTONED"))).code, "DENY_LIFECYCLE_EVIDENCE");
  assert.equal(ledger.verify().count, 0);
});

test("all immutable authority provenance is stable across phases", async (t) => {
  const { service, ledger } = harness(t, {
    authorityResolver: async (expected) => authority(expected, expected.phase === "COMMIT"
      ? { work_package_id: "substituted-wp", session_id: "substituted-session" }
      : {})
  });
  assert.equal((await service.recordLifecycleEvent(mutation("TOMBSTONED"))).code, "DENY_LIFECYCLE_AUTHORITY");
  assert.equal(ledger.verify().count, 0);
});

test("replay requires fresh current authority and authenticated event validation", async (t) => {
  const fixture = harness(t);
  const request = mutation("TOMBSTONED");
  assert.equal((await fixture.service.recordLifecycleEvent(request)).ok, true);
  const denied = createMemoryLifecycleService({
    ledger: fixture.ledger, now: () => new Date(NOW), authorityResolver: async () => ({ decision: "DENY" }),
    recordResolver: async () => [memory()], retentionPolicyResolver: async () => ({ decision: "DENY" }),
    evidenceResolver: async () => ({ decision: "DENY" }), boundaryCoordinator: createBoundaryCoordinator(() => [memory()]),
    sodRules: { checkPairwiseDistinct }
  });
  assert.equal((await denied.recordLifecycleEvent(request)).code, "DENY_LIFECYCLE_AUTHORITY");
});

test("post-append success requires ledger count and head to match durable readback", async (t) => {
  let lookupCalls = 0;
  let persistedEvent;
  const ledger = {
    appendLifecycleEvent(event) { persistedEvent = { ...event, event_mac: "9".repeat(64) }; return null; },
    readLifecycleEvents() { return []; },
    readLifecycleEventByIdempotencyKey() {
      lookupCalls += 1;
      if (lookupCalls === 1) return null;
      return { sequence: 1, record_hash: "8".repeat(64), entry_hash: "7".repeat(64), idempotency_key: "idem-TOMBSTONED", event: persistedEvent };
    },
    validateLifecycleEvent(event) { return event; },
    verify() { return { valid: true, ledgerId: "secb-memory-lifecycle-ledger", count: 0, headHash: "0".repeat(64) }; }
  };
  assert.equal((await harness(t, { ledger }).service.recordLifecycleEvent(mutation("TOMBSTONED"))).code, "DENY_LIFECYCLE_DURABILITY");
});

test("unknown lifecycle events and throwing SoD ports fail closed", async (t) => {
  const base = memory();
  const unknown = {
    event_id: "1".repeat(64), event_version: 2, request_fingerprint: "2".repeat(64), parameters_hash: "3".repeat(64),
    project_id: "project-1", work_package_id: "wp", session_id: "session", actor_id: "gov", authority_ref: "auth",
    decision_id: "decision", producer_actor_id: "producer-1", reviewer_actor_id: "reviewer", approver_actor_id: "gov",
    evidence_acceptor_actor_id: "acceptor", event_type: "UNKNOWN_EVENT", layer: "project", memory_record_id: "mem-1",
    memory_record_version: 1, target_content_hash: base.content_hash, target_record_fingerprint: canonicalFingerprint(base),
    evidence_id: "evidence", evidence_hash: "4".repeat(64), preservation_action: "NOT_APPLICABLE", reason: "unknown",
    occurred_at: NOW.toISOString(), event_mac: "5".repeat(64)
  };
  const unknownLedger = {
    appendLifecycleEvent() { throw new Error("unused"); }, readLifecycleEventByIdempotencyKey() { return null; },
    validateLifecycleEvent(event) { return event; }, readLifecycleEvents() { return [{ sequence: 1, event: unknown }]; },
    verify() { return { valid: true, ledgerId: "secb-memory-lifecycle-ledger", count: 1, headHash: "6".repeat(64) }; }
  };
  assert.equal((await harness(t, { ledger: unknownLedger }).service.resolve(resolution())).code, "DENY_LIFECYCLE_STORE_UNAVAILABLE");
  const hostileSod = harness(t, { sodRules: { checkPairwiseDistinct() { throw new Error("sod trap"); } } });
  assert.equal((await hostileSod.service.resolve(resolution())).code, "DENY_LIFECYCLE_AUTHORITY");
});

test("canonical producer binding and monotonic head anchor prevent self-review and rollback", async (t) => {
  const selfReview = harness(t, {
    records: [memory({ actor_id: "actual-producer" })],
    authorityResolver: async (expected) => authority(expected, { producer_actor_id: "declared-producer", reviewer_actor_id: "actual-producer" })
  });
  assert.equal((await selfReview.service.recordLifecycleEvent(mutation("TOMBSTONED"))).code, "DENY_LIFECYCLE_SOD");

  const rollback = harness(t);
  assert.equal((await rollback.service.recordLifecycleEvent(mutation("TOMBSTONED"))).ok, true);
  writeFileSync(rollback.filePath, "", "utf8");
  assert.equal((await rollback.service.resolve(resolution())).code, "LIFECYCLE_ROLLBACK_DETECTED");
});

test("exception recovery rejects an authenticated competing event bound to another target", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "secb-memory-competing-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const headAnchor = createHeadAnchor();
  const real = new MemoryLifecycleLedger({ filePath: join(directory, "ledger.jsonl"), integrityKey: INTEGRITY_KEY, headAnchor });
  const wrapper = {
    appendLifecycleEvent(event, options) {
      const { event_id: ignored, event_mac: ignoredMac, ...body } = event;
      void ignored; void ignoredMac;
      const competingBody = { ...body, parameters_hash: "b".repeat(64), target_content_hash: "f".repeat(64), target_record_fingerprint: "e".repeat(64) };
      real.appendLifecycleEvent({ event_id: canonicalFingerprint(competingBody), ...competingBody }, options);
      throw Object.assign(new Error("competing append"), { code: "DENY_IDEMPOTENCY_CONFLICT" });
    },
    readLifecycleEvents(selector) { return real.readLifecycleEvents(selector); },
    readLifecycleEventByIdempotencyKey(key) { return real.readLifecycleEventByIdempotencyKey(key); },
    validateLifecycleEvent(event) { return real.validateLifecycleEvent(event); },
    verify() { return real.verify(); }
  };
  const result = await harness(t, { ledger: wrapper }).service.recordLifecycleEvent(mutation("TOMBSTONED"));
  assert.equal(result.code, "DENY_IDEMPOTENCY_CONFLICT");
  assert.equal(real.verify().count, 1);
});

test("final decisions execute inside one synchronous fenced boundary", async (t) => {
  let records = [memory()];
  let locked = false;
  let pendingRecords = null;
  const setRecords = (next) => { if (locked) pendingRecords = next; else records = next; };
  const coordinator = createBoundaryCoordinator(() => records);
  const fenced = {
    withMutationFence(request, callback) {
      locked = true;
      try { return coordinator.withMutationFence(request, callback); }
      finally { locked = false; if (pendingRecords !== null) { records = pendingRecords; pendingRecords = null; } }
    },
    withResolutionFence(request, callback) {
      locked = true;
      try { return coordinator.withResolutionFence(request, callback); }
      finally { locked = false; if (pendingRecords !== null) { records = pendingRecords; pendingRecords = null; } }
    }
  };
  let fixture;
  fixture = harness(t, {
    recordResolver: async () => records,
    boundaryCoordinator: fenced,
    now: () => {
      if (locked) setRecords([memory(), memory({ memory_record_id: "mem-2", version: 2, supersedes: "mem-1", statement: "queued successor" })]);
      return new Date(NOW);
    }
  });
  const linearized = await fixture.service.resolve(resolution());
  assert.equal(linearized.code, "MEMORY_EFFECTIVE");
  assert.equal((await fixture.service.resolve(resolution())).code, "DENY_MEMORY_SUPERSEDED");

  const asyncFence = harness(t, { boundaryCoordinator: {
    async withMutationFence(request, callback) { return callback({ records: [memory()], evidence: evidence({ ...request.evidence_expected, active_legal_hold_count: 0 }), authority: authority(request.authority_expected) }); },
    async withResolutionFence(request, callback) { return callback({ records: [memory()], retention: { decision: "DENY" }, authority: authority(request.authority_expected) }); }
  } });
  assert.equal((await asyncFence.service.recordLifecycleEvent(mutation("TOMBSTONED"))).code, "DENY_LIFECYCLE_FENCE");
});

test("swallowed duplicate and late boundary callbacks cannot authorize", async (t) => {
  const resolutionBase = createBoundaryCoordinator(() => [memory()]);
  let lateCallback;
  const duplicateResolution = harness(t, { boundaryCoordinator: {
    withMutationFence: resolutionBase.withMutationFence,
    withResolutionFence(request, callback) {
      lateCallback = callback;
      return resolutionBase.withResolutionFence(request, (snapshot) => {
        const first = callback(snapshot);
        try { callback(snapshot); } catch { /* malicious coordinator swallows the contract violation */ }
        return first;
      });
    }
  } });
  assert.equal((await duplicateResolution.service.resolve(resolution())).code, "DENY_LIFECYCLE_FENCE");
  assert.throws(() => lateCallback({}));

  const mutationBase = createBoundaryCoordinator(() => [memory()]);
  const duplicateMutation = harness(t, { boundaryCoordinator: {
    withResolutionFence: mutationBase.withResolutionFence,
    withMutationFence(request, callback) {
      return mutationBase.withMutationFence(request, (snapshot) => {
        const first = callback(snapshot);
        try { callback(snapshot); } catch { /* malicious coordinator swallows the contract violation */ }
        return first;
      });
    }
  } });
  assert.equal((await duplicateMutation.service.recordLifecycleEvent(mutation("TOMBSTONED"))).code, "DENY_LIFECYCLE_FENCE");
});
