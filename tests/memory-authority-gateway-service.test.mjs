import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { canonicalFingerprint } from "../src/contracts/canonical-fingerprint.mjs";
import {
  createMemoryAuthorityGateway,
  MemoryAuthorityGatewayConfigurationError
} from "../src/services/memory-authority-gateway-service.mjs";
import { createMemoryGateway } from "../src/services/memory-gateway-service.mjs";
import { createSqliteMemoryRecordStore } from "../src/services/sqlite-memory-record-store.mjs";
import * as packageRoot from "../src/index.mjs";

const PROJECT = "proj-memory-authority";
const ACTOR = "agent-memory-producer";
const NOW = new Date("2026-07-20T10:00:00.000Z");

function callerRecord(overrides = {}) {
  return {
    memory_record_id: "memory-authority-1",
    version: 1,
    project_id: PROJECT,
    work_package_id: "wp-memory-authority-1",
    session_id: "session-memory-authority-1",
    source: "KnowledgeLedger",
    statement: "Authority-bound memory",
    classification: "INTERNAL",
    confidence: 0.9,
    provenance: { evidence_refs: ["evidence-memory-authority-1"], origin_record_id: "knowledge-1" },
    valid_from: "2026-07-20T09:00:00.000Z",
    valid_until: "2026-07-20T11:00:00.000Z",
    retention_policy: "retain-30-days",
    ...overrides
  };
}

const allowIdentity = () => ({ decision: "ALLOW", decision_id: "identity-1", actor_id: ACTOR });
const allowScope = () => ({ decision: "ALLOW", decision_id: "scope-1", actor_id: ACTOR, project_id: PROJECT });
const allowAdmission = ({ project_id, layer }) => ({
  decision: "ALLOW",
  decision_id: "admission-authority-1",
  actor_id: ACTOR,
  project_id,
  layer,
  producer: ACTOR,
  reviewer: null,
  approver: layer === "project" ? "human-memory-approver" : null
});
const allowRetrieval = ({ project_id, layer }) => ({
  decision: "ALLOW",
  decision_id: "retrieval-authority-1",
  actor_id: ACTOR,
  project_id,
  layer
});

function fakeGateway() {
  const calls = { admit: [], retrieve: [] };
  const memoryGateway = {
    async admit(request) {
      calls.admit.push(request);
      const admittedAt = NOW.toISOString();
      const admittedRecord = { ...request.record, layer: request.layer, admitted_at: admittedAt };
      return {
        decision: "ALLOW",
        code: "ADMITTED",
        admitted_at: admittedAt,
        record: admittedRecord,
        append: {
          status: "COMMITTED",
          idempotency_key: JSON.stringify([request.record.project_id, request.layer, request.record.memory_record_id, request.record.version]),
          memory_record_id: request.record.memory_record_id,
          version: request.record.version,
          content_hash: request.record.content_hash,
          record_fingerprint: canonicalFingerprint(admittedRecord),
          created: true,
          sequence: 1
        }
      };
    },
    retrieve(request) {
      calls.retrieve.push(request);
      return { decision: "ALLOW", code: "RETRIEVED", retrieved_at: NOW.toISOString(), records: [], next_cursor: null };
    }
  };
  return { memoryGateway, calls };
}

function facade(memoryGateway, overrides = {}) {
  return createMemoryAuthorityGateway({
    memoryGateway,
    identityResolver: allowIdentity,
    scopeResolver: allowScope,
    admissionAuthorityResolver: allowAdmission,
    retrievalAuthorityResolver: allowRetrieval,
    ...overrides
  });
}

test("construction captures both gateway ports and exports a frozen facade", () => {
  const hasCode = (code) => (error) => error instanceof MemoryAuthorityGatewayConfigurationError && error.code === code;
  assert.throws(() => createMemoryAuthorityGateway(), hasCode("INVALID_MEMORY_GATEWAY"));
  assert.throws(() => createMemoryAuthorityGateway({ memoryGateway: { admit() {} } }), hasCode("INVALID_MEMORY_GATEWAY"));
  assert.throws(
    () => createMemoryAuthorityGateway({ memoryGateway: { admit() {}, retrieve() {} }, identityResolver: true }),
    hasCode("INVALID_AUTHORITY_RESOLVER")
  );
  const built = fakeGateway();
  const instance = facade(built.memoryGateway);
  built.memoryGateway.admit = () => { throw new Error("replacement"); };
  built.memoryGateway.retrieve = () => { throw new Error("replacement"); };
  assert.ok(Object.isFrozen(instance));
  assert.deepEqual(Object.keys(instance), ["admit", "retrieve"]);
  assert.equal(packageRoot.createMemoryAuthorityGateway, createMemoryAuthorityGateway);
  assert.equal(packageRoot.MemoryAuthorityGatewayConfigurationError, MemoryAuthorityGatewayConfigurationError);
});

test("default authority ports deny before the Memory Gateway", async () => {
  const { memoryGateway, calls } = fakeGateway();
  const instance = createMemoryAuthorityGateway({ memoryGateway });
  assert.equal((await instance.admit({ layer: "session", record: callerRecord() })).code, "DENY_MEMORY_IDENTITY");
  assert.equal(instance.retrieve({ project_id: PROJECT, layer: "session" }).code, "DENY_MEMORY_IDENTITY");
  assert.deepEqual(calls, { admit: [], retrieve: [] });
});

test("admission injects server identity and authority roles and computes the bound content hash", async () => {
  const { memoryGateway, calls } = fakeGateway();
  const result = await facade(memoryGateway).admit({ layer: "session", record: callerRecord() });
  assert.equal(result.decision, "ALLOW");
  assert.equal(result.identity_decision_id, "identity-1");
  assert.equal(result.scope_decision_id, "scope-1");
  assert.equal(result.authority_decision_id, "admission-authority-1");
  assert.equal(calls.admit.length, 1);
  const forwarded = calls.admit[0];
  assert.deepEqual(forwarded.admission, { producer: ACTOR });
  assert.equal(forwarded.record.actor_id, ACTOR);
  const { content_hash, ...recordWithoutHash } = forwarded.record;
  assert.equal(content_hash, canonicalFingerprint({ ...recordWithoutHash, layer: "session" }));
  assert.equal(Object.isFrozen(result), true);
});

test("project admission forwards only the authority-resolved distinct approver", async () => {
  const { memoryGateway, calls } = fakeGateway();
  const result = await facade(memoryGateway).admit({ layer: "project", record: callerRecord() });
  assert.equal(result.decision, "ALLOW");
  assert.deepEqual(calls.admit[0].admission, {
    producer: ACTOR,
    approver: "human-memory-approver"
  });
});

test("caller cannot smuggle identity, scope, admission actors, or trusted hashes", async () => {
  const { memoryGateway, calls } = fakeGateway();
  const instance = facade(memoryGateway);
  const attempts = [
    { layer: "session", record: { ...callerRecord(), actor_id: "attacker" } },
    { layer: "session", record: { ...callerRecord(), content_hash: "a".repeat(64) } },
    { layer: "session", record: callerRecord(), admission: { producer: "attacker" } }
  ];
  for (const attempt of attempts) assert.equal((await instance.admit(attempt)).code, "DENY_MALFORMED_REQUEST");
  assert.equal(instance.retrieve({ project_id: PROJECT, scope_project_id: PROJECT, layer: "session" }).code, "DENY_MALFORMED_REQUEST");
  assert.deepEqual(calls, { admit: [], retrieve: [] });
});

test("unfingerprintable caller content is contained without reaching the gateway", async () => {
  const { memoryGateway, calls } = fakeGateway();
  const result = await facade(memoryGateway).admit({
    layer: "session",
    record: callerRecord({ statement: 1n })
  });
  assert.equal(result.code, "DENY_MALFORMED_REQUEST");
  assert.deepEqual(calls, { admit: [], retrieve: [] });
});

test("identity, scope, and authority substitutions fail closed before gateway access", async () => {
  const cases = [
    ["identity", { identityResolver: () => ({ decision: "ALLOW", decision_id: "identity-1", actor_id: "" }) }, "DENY_MEMORY_IDENTITY"],
    ["scope actor", { scopeResolver: () => ({ decision: "ALLOW", decision_id: "scope-1", actor_id: "attacker", project_id: PROJECT }) }, "DENY_MEMORY_SCOPE"],
    ["scope project", { scopeResolver: () => ({ decision: "ALLOW", decision_id: "scope-1", actor_id: ACTOR, project_id: "proj-other" }) }, "DENY_MEMORY_SCOPE"],
    ["admission producer", { admissionAuthorityResolver: ({ project_id, layer }) => ({ decision: "ALLOW", decision_id: "auth-1", actor_id: ACTOR, project_id, layer, producer: "attacker", reviewer: null, approver: null }) }, "DENY_MEMORY_ADMISSION_AUTHORITY"],
    ["admission project", { admissionAuthorityResolver: ({ layer }) => ({ decision: "ALLOW", decision_id: "auth-1", actor_id: ACTOR, project_id: "proj-other", layer, producer: ACTOR, reviewer: null, approver: null }) }, "DENY_MEMORY_ADMISSION_AUTHORITY"],
    ["retrieval actor", { retrievalAuthorityResolver: ({ project_id, layer }) => ({ decision: "ALLOW", decision_id: "auth-1", actor_id: "attacker", project_id, layer }) }, "DENY_MEMORY_RETRIEVAL_AUTHORITY"]
  ];
  for (const [label, overrides, expected] of cases) {
    const { memoryGateway, calls } = fakeGateway();
    const instance = facade(memoryGateway, overrides);
    const result = label.startsWith("retrieval")
      ? instance.retrieve({ project_id: PROJECT, layer: "session" })
      : await instance.admit({ layer: "session", record: callerRecord() });
    assert.equal(result.code, expected, label);
    assert.deepEqual(calls, { admit: [], retrieve: [] }, label);
  }
});

test("project admission enforces distinct producer, reviewer, and approver at the facade", async () => {
  const cases = [
    ["producer is approver", { producer: ACTOR, reviewer: null, approver: ACTOR }],
    ["producer is reviewer", { producer: ACTOR, reviewer: ACTOR, approver: "human-memory-approver" }],
    ["reviewer is approver", { producer: ACTOR, reviewer: "human-memory-approver", approver: "human-memory-approver" }],
    ["missing approver", { producer: ACTOR, reviewer: null, approver: null }]
  ];
  for (const [label, roles] of cases) {
    const { memoryGateway, calls } = fakeGateway();
    const instance = facade(memoryGateway, {
      admissionAuthorityResolver: ({ project_id, layer }) => ({
        decision: "ALLOW",
        decision_id: "admission-authority-1",
        actor_id: ACTOR,
        project_id,
        layer,
        ...roles
      })
    });
    const result = await instance.admit({ layer: "project", record: callerRecord() });
    assert.equal(result.code, "DENY_MEMORY_ADMISSION_SOD", label);
    assert.equal(calls.admit.length, 0, label);
  }
});

test("retrieval derives scope and carries all decision bindings", () => {
  const { memoryGateway, calls } = fakeGateway();
  const result = facade(memoryGateway).retrieve({ project_id: PROJECT, layer: "session", limit: 10 });
  assert.equal(result.decision, "ALLOW");
  assert.equal(result.actor_id, ACTOR);
  assert.equal(result.identity_decision_id, "identity-1");
  assert.equal(result.scope_decision_id, "scope-1");
  assert.equal(result.authority_decision_id, "retrieval-authority-1");
  assert.deepEqual(calls.retrieve, [{ project_id: PROJECT, scope_project_id: PROJECT, layer: "session", limit: 10 }]);
});

test("fabricated expired, future-valid, hash-tampered, and over-limit retrieval pages deny", () => {
  const admittedAt = "2026-07-20T09:30:00.000Z";
  const memoryRecord = (overrides = {}) => {
    const body = {
      ...callerRecord(),
      actor_id: ACTOR,
      layer: "session",
      admitted_at: admittedAt,
      ...overrides
    };
    return { ...body, content_hash: canonicalFingerprint(Object.fromEntries(Object.entries(body).filter(([key]) => key !== "admitted_at"))) };
  };
  const pageGateway = (records) => ({
    admit: async () => ({ decision: "DENY", code: "NOT_USED" }),
    retrieve: () => ({
      decision: "ALLOW",
      code: "RETRIEVED",
      retrieved_at: NOW.toISOString(),
      records: records.map((record) => ({ data_untrusted: true, record })),
      next_cursor: null
    })
  });
  const expired = facade(pageGateway([memoryRecord({ valid_until: "2026-07-20T10:00:00.000Z" })]))
    .retrieve({ project_id: PROJECT, layer: "session" });
  assert.equal(expired.code, "DENY_MEMORY_RETRIEVAL");
  const future = facade(pageGateway([memoryRecord({ valid_from: "2026-07-20T10:30:00.000Z", valid_until: "2026-07-20T11:30:00.000Z" })]))
    .retrieve({ project_id: PROJECT, layer: "session" });
  assert.equal(future.code, "DENY_MEMORY_RETRIEVAL");
  const original = memoryRecord();
  const hashTampered = facade(pageGateway([{ ...original, statement: "substituted after hashing" }]))
    .retrieve({ project_id: PROJECT, layer: "session" });
  assert.equal(hashTampered.code, "DENY_MEMORY_RETRIEVAL");
  const first = memoryRecord();
  const secondBody = memoryRecord({ memory_record_id: "memory-authority-2" });
  const overLimit = facade(pageGateway([first, secondBody]))
    .retrieve({ project_id: PROJECT, layer: "session", limit: 1 });
  assert.equal(overLimit.code, "DENY_MEMORY_RETRIEVAL");
});

test("resolver failures and malformed upstream results are contained", async () => {
  const throwing = fakeGateway();
  const badIdentity = facade(throwing.memoryGateway, { identityResolver: () => { throw new Error("offline"); } });
  assert.equal(badIdentity.retrieve({ project_id: PROJECT, layer: "session" }).code, "DENY_MEMORY_IDENTITY");

  const malformedGateway = { admit: async () => null, retrieve: () => ({ decision: "DENY", code: "DENY_STORE_UNAVAILABLE" }) };
  const instance = facade(malformedGateway);
  const deniedAdmit = await instance.admit({ layer: "session", record: callerRecord() });
  assert.equal(deniedAdmit.code, "DENY_MEMORY_ADMISSION");
  const deniedRetrieve = instance.retrieve({ project_id: PROJECT, layer: "session" });
  assert.equal(deniedRetrieve.code, "DENY_MEMORY_RETRIEVAL");
  assert.equal(deniedRetrieve.upstream_code, "DENY_STORE_UNAVAILABLE");
});

test("malformed, substituted, extra, and hostile append receipts cannot produce ALLOW", async () => {
  const valid = fakeGateway();
  const originalAdmit = valid.memoryGateway.admit.bind(valid.memoryGateway);
  const cases = [
    ["empty", () => ({})],
    ["missing", (append) => { const { created, ...rest } = append; void created; return rest; }],
    ["extra", (append) => ({ ...append, rogue: true })],
    ["id substitution", (append) => ({ ...append, memory_record_id: "memory-other" })],
    ["version substitution", (append) => ({ ...append, version: 2 })],
    ["hash substitution", (append) => ({ ...append, content_hash: "f".repeat(64) })],
    ["fingerprint substitution", (append) => ({ ...append, record_fingerprint: "f".repeat(64) })],
    ["created malformed", (append) => ({ ...append, created: "true" })],
    ["sequence malformed", (append) => ({ ...append, sequence: 0 })]
  ];
  for (const [label, mutate] of cases) {
    const memoryGateway = {
      async admit(request) {
        const response = await originalAdmit(request);
        return { ...response, append: mutate(response.append) };
      },
      retrieve: valid.memoryGateway.retrieve
    };
    const result = await facade(memoryGateway).admit({ layer: "session", record: callerRecord() });
    assert.equal(result.code, "DENY_MEMORY_ADMISSION", label);
  }

  const hostileAppend = new Proxy({}, { ownKeys() { throw new Error("hostile receipt"); } });
  const hostileGateway = {
    async admit(request) {
      const response = await originalAdmit(request);
      return { ...response, append: hostileAppend };
    },
    retrieve: valid.memoryGateway.retrieve
  };
  assert.equal(
    (await facade(hostileGateway).admit({ layer: "session", record: callerRecord() })).code,
    "DENY_MEMORY_ADMISSION"
  );
});

test("E2E: authority-bound facade admits and retrieves through the durable SQLite gateway", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "secb-memory-authority-"));
  const store = createSqliteMemoryRecordStore({ databasePath: join(directory, "memory.sqlite") });
  t.after(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const gateway = createMemoryGateway({
    layerStores: { session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } },
    sodRules: { checkPairwiseDistinct: () => ({ ok: true }) },
    now: () => NOW,
    ledgerWriter: () => ({ audited: true }),
    cursorMacKey: Buffer.alloc(32, 0x61)
  });
  const instance = facade(gateway);
  const admitted = await instance.admit({ layer: "session", record: callerRecord() });
  assert.equal(admitted.decision, "ALLOW");
  assert.equal(admitted.record.actor_id, ACTOR);
  const retrieved = instance.retrieve({ project_id: PROJECT, layer: "session" });
  assert.equal(retrieved.decision, "ALLOW");
  assert.deepEqual(retrieved.records.map((entry) => entry.record.memory_record_id), ["memory-authority-1"]);
  assert.equal(retrieved.records[0].record.actor_id, ACTOR);
});
