import assert from "node:assert/strict";
import test from "node:test";

import { canonicalFingerprint } from "../src/contracts/canonical-fingerprint.mjs";
import { createMemoryLifecycleUnifiedService, MemoryLifecycleUnifiedConfigurationError } from "../src/index.mjs";

const NOW = "2026-08-03T12:00:00.000Z";

function memory(overrides = {}) {
  const row = {
    memory_record_id: "mem-1", version: 1, project_id: "project-1", work_package_id: "wp-1",
    session_id: "session-1", actor_id: "producer-1", layer: "project", source: "MemoryGatewayService",
    statement: "governed memory", classification: "INTERNAL", confidence: 0.9,
    provenance: { evidence_refs: ["evidence-1"], origin_record_id: "origin-1" },
    valid_from: "2026-08-01T00:00:00.000Z", valid_until: "2026-09-01T00:00:00.000Z",
    access_policy: "project-readers", retention_policy: "retain-30-days", admitted_at: "2026-08-01T00:00:00.000Z",
    ...overrides
  };
  if (!Object.prototype.hasOwnProperty.call(overrides, "content_hash")) {
    const { admitted_at: ignoredAt, ...body } = row; void ignoredAt;
    row.content_hash = canonicalFingerprint(body);
  }
  return row;
}

function source(row) {
  return {
    id: row.memory_record_id, kind: "memory", project_id: row.project_id, classification: row.classification,
    verified: true, current: true, resolvable: true, relevance: row.confidence,
    provenance: { origin: row.source, retrieved_at: NOW, content_hash: row.content_hash }
  };
}

function effectiveDecision(request, item) {
  return {
    request_index: item.request_index, ok: true, code: "MEMORY_EFFECTIVE",
    memory_record_id: item.memory_record_id, memory_record_version: item.memory_record_version,
    content_hash: item.content_hash, target_record_fingerprint: item.target_record_fingerprint,
    state_fingerprint: "b".repeat(64), lifecycle_head_hash: "c".repeat(64), authority_decision_id: "lifecycle-authority-1"
  };
}

function harness(overrides = {}) {
  const rows = overrides.rows ?? [memory()];
  const calls = { lifecycle: 0, provider: 0, federation: 0 };
  const memoryAuthorityGateway = overrides.memoryAuthorityGateway ?? { retrieve() {
    return { decision: "ALLOW", code: "RETRIEVED", retrieved_at: NOW,
      records: rows.map((row) => ({ data_untrusted: true, record: row })), next_cursor: null,
      actor_id: "actor-1", identity_decision_id: "identity-1", scope_decision_id: "scope-1", authority_decision_id: "gateway-authority-1" };
  } };
  const lifecycleResolver = overrides.lifecycleResolver ?? { async resolveBatch(request) {
    calls.lifecycle += 1;
    return { ok: true, code: "MEMORY_BATCH_RESOLVED", project_id: request.project_id, layer: request.layer,
      evaluated_at: NOW, batch_fingerprint: canonicalFingerprint(request),
      decisions: request.records.map((item) => effectiveDecision(request, item)) };
  } };
  const memoryCandidateProvider = overrides.memoryCandidateProvider ?? { toCandidateSources(query) {
    calls.provider += 1;
    return { decision: "ALLOW", code: "MEMORY_SOURCES_PROJECTED", data_untrusted: true,
      project_id: query.project_id, retrieved_at: NOW, sources: query.records.map(source), exclusions: [],
      accounting: { requested: query.records.length, included: query.records.length, excluded: 0 } };
  } };
  const contextFederation = overrides.contextFederation ?? { issueReceipt(request) {
    calls.federation += 1;
    return { receiptId: request.document.receipt_id, projectId: request.document.project_id, version: 1, state: "ISSUED",
      boundWpVersion: 1, expiresAt: "2026-08-04T12:00:00.000Z", exclusions: [], replayed: false };
  } };
  return { calls, service: createMemoryLifecycleUnifiedService({
    memoryAuthorityGateway, lifecycleResolver, memoryCandidateProvider, contextFederation,
    timeoutMs: overrides.timeoutMs ?? 50
  }) };
}

const retrieval = (overrides = {}) => ({ project_id: "project-1", layer: "project", ...overrides });

test("construction requires authority gateway, atomic batch resolver, provider, and federation", () => {
  for (const missing of ["memoryAuthorityGateway", "lifecycleResolver", "memoryCandidateProvider", "contextFederation"]) {
    const ports = { memoryAuthorityGateway: { retrieve() {} }, lifecycleResolver: { resolveBatch() {} },
      memoryCandidateProvider: { toCandidateSources() {} }, contextFederation: { issueReceipt() {} } };
    delete ports[missing];
    assert.throws(() => createMemoryLifecycleUnifiedService(ports), MemoryLifecycleUnifiedConfigurationError);
  }
});

test("one authority-bound page is atomically lifecycle-resolved and normalized", async () => {
  const { service, calls } = harness();
  const result = await service.retrieveCandidateSources(retrieval());
  assert.equal(result.code, "MEMORY_LIFECYCLE_UNIFIED");
  assert.equal(result.sources[0].ref, "mem-1");
  assert.equal(result.authority_decision_id, "gateway-authority-1");
  assert.deepEqual(calls, { lifecycle: 1, provider: 1, federation: 0 });
  assert.deepEqual(result.accounting, { requested: 1, lifecycle_effective: 1, included: 1, excluded: 0 });
});

test("terminal batch decisions are opaque and subtractive", async () => {
  let providerRecords;
  const { service } = harness({ lifecycleResolver: { async resolveBatch(request) {
    const item = request.records[0];
    return { ok: true, code: "MEMORY_BATCH_RESOLVED", project_id: request.project_id, layer: request.layer,
      evaluated_at: NOW, batch_fingerprint: canonicalFingerprint(request), decisions: [{
        request_index: 0, ok: false, code: "DENY_MEMORY_TOMBSTONED", memory_record_id: item.memory_record_id,
        memory_record_version: item.memory_record_version, content_hash: null, target_record_fingerprint: null,
        state_fingerprint: null, lifecycle_head_hash: null, authority_decision_id: null
      }] };
  } }, memoryCandidateProvider: { toCandidateSources(query) {
    providerRecords = query.records;
    return { decision: "ALLOW", code: "MEMORY_SOURCES_PROJECTED", data_untrusted: true, project_id: query.project_id,
      retrieved_at: NOW, sources: [], exclusions: [], accounting: { requested: 0, included: 0, excluded: 0 } };
  } } });
  const result = await service.retrieveCandidateSources(retrieval());
  assert.deepEqual(providerRecords, []);
  assert.equal(result.exclusions[0].reason, "MEMORY_NOT_EFFECTIVE");
  assert.notEqual(result.exclusions[0].ref, "mem-1");
  assert.equal(Object.hasOwn(result.exclusions[0], "code"), false);
});

test("cross-project, duplicate, content-tampered, and malformed cursor pages deny", async () => {
  for (const gateway of [
    { rows: [memory({ project_id: "project-2" })] },
    { rows: [memory(), memory()] },
    { rows: [memory({ statement: "tampered", content_hash: "a".repeat(64) })] },
    { memoryAuthorityGateway: { retrieve() { return { decision: "ALLOW", code: "RETRIEVED", retrieved_at: NOW, records: [], next_cursor: {}, actor_id: "a", identity_decision_id: "i", scope_decision_id: "s", authority_decision_id: "g" }; } } }
  ]) assert.ok((await harness(gateway).service.retrieveCandidateSources(retrieval())).code.startsWith("DENY_UNIFY_GATEWAY"));
});

test("batch receipt must be closed, complete, unique, and fingerprint-bound", async () => {
  for (const mutate of [
    (value) => ({ ...value, batch_fingerprint: "f".repeat(64) }),
    (value) => ({ ...value, decisions: [] }),
    (value) => ({ ...value, decisions: [...value.decisions, value.decisions[0]] }),
    (value) => ({ ...value, decisions: [{ ...value.decisions[0], target_record_fingerprint: "d".repeat(64) }] })
  ]) {
    const { service } = harness({ lifecycleResolver: { async resolveBatch(request) {
      const base = { ok: true, code: "MEMORY_BATCH_RESOLVED", project_id: request.project_id, layer: request.layer,
        evaluated_at: NOW, batch_fingerprint: canonicalFingerprint(request), decisions: request.records.map((item) => effectiveDecision(request, item)) };
      return mutate(base);
    } } });
    assert.ok((await service.retrieveCandidateSources(retrieval())).code.startsWith("DENY_UNIFY_LIFECYCLE"));
  }
});

test("provider cannot add, omit, duplicate, drift time, or forge accounting", async () => {
  const badOutputs = [
    (query) => ({ sources: [...query.records.map(source), source(memory({ memory_record_id: "evil" }))], exclusions: [], accounting: { requested: 1, included: 2, excluded: 0 }, retrieved_at: NOW }),
    () => ({ sources: [], exclusions: [], accounting: { requested: 1, included: 0, excluded: 0 }, retrieved_at: NOW }),
    (query) => ({ sources: [source(query.records[0]), source(query.records[0])], exclusions: [], accounting: { requested: 1, included: 2, excluded: 0 }, retrieved_at: NOW }),
    (query) => ({ sources: query.records.map(source), exclusions: [], accounting: { requested: 999, included: 1, excluded: 998 }, retrieved_at: NOW }),
    (query) => ({ sources: query.records.map(source), exclusions: [], accounting: { requested: 1, included: 1, excluded: 0 }, retrieved_at: "2099-01-01T00:00:00.000Z" })
  ];
  for (const make of badOutputs) {
    const { service } = harness({ memoryCandidateProvider: { toCandidateSources(query) {
      return { decision: "ALLOW", code: "MEMORY_SOURCES_PROJECTED", data_untrusted: true, project_id: query.project_id, ...make(query) };
    } } });
    assert.ok((await service.retrieveCandidateSources(retrieval())).code.startsWith("DENY_UNIFY_PROVIDER"));
  }
  const altered = harness({ memoryCandidateProvider: { toCandidateSources(query) {
    const changed = source(query.records[0]); changed.project_id = "other-project";
    return { decision: "ALLOW", code: "MEMORY_SOURCES_PROJECTED", data_untrusted: true,
      project_id: query.project_id, retrieved_at: NOW, sources: [changed], exclusions: [],
      accounting: { requested: 1, included: 1, excluded: 0 } };
  } } });
  assert.equal((await altered.service.retrieveCandidateSources(retrieval())).code, "DENY_UNIFY_PROVIDER_BINDING");
  const budget = harness({ memoryCandidateProvider: { toCandidateSources(query) {
    return { decision: "ALLOW", code: "MEMORY_SOURCES_PROJECTED", data_untrusted: true,
      project_id: query.project_id, retrieved_at: NOW, sources: query.records.map(source), exclusions: [],
      accounting: { requested: 1, included: 1, excluded: 0, token_budget: query.token_budget, tokens_used: query.token_budget + 1 } };
  } } });
  assert.equal((await budget.service.retrieveCandidateSources({ ...retrieval(), token_budget: 10 })).code, "DENY_UNIFY_PROVIDER");
});

test("throwing accessors and non-settling lifecycle batch are contained", async () => {
  const hostile = {};
  Object.defineProperty(hostile, "code", { enumerable: true, get() { throw new Error("trap"); } });
  const trapped = harness({ lifecycleResolver: { async resolveBatch() { return hostile; } } });
  assert.equal((await trapped.service.retrieveCandidateSources(retrieval())).code, "DENY_UNIFY_LIFECYCLE");
  const stalled = harness({ timeoutMs: 5, lifecycleResolver: { async resolveBatch() { return new Promise(() => {}); } } });
  assert.equal((await stalled.service.retrieveCandidateSources(retrieval())).code, "DENY_UNIFY_LIFECYCLE");
});

test("nested issue shape is closed against candidate smuggling, prototypes, symbols, and accessors", async () => {
  const { service } = harness();
  const base = { document: { receipt_id: "receipt-1", project_id: "project-1" }, actorId: "actor", authorityRef: "auth", baseline: "base", idempotencyKey: "idem" };
  for (const issue of [
    { ...base, candidateSources: [] },
    Object.assign(Object.create({ candidateSources: [] }), base),
    { ...base, [Symbol("candidateSources")]: [] }
  ]) assert.equal((await service.issueReceipt({ retrieval: retrieval(), issue })).code, "DENY_UNIFY_ISSUE_REQUEST");
  const hostile = { ...base };
  Object.defineProperty(hostile, "actorId", { enumerable: true, get() { throw new Error("trap"); } });
  assert.equal((await service.issueReceipt({ retrieval: retrieval(), issue: hostile })).code, "DENY_UNIFY_ISSUE_REQUEST");
  const nestedPrototype = { ...base, document: Object.assign(Object.create({ candidateSources: [] }), base.document) };
  assert.equal((await service.issueReceipt({ retrieval: retrieval(), issue: nestedPrototype })).code, "DENY_UNIFY_ISSUE_REQUEST");
});

test("Context Federation issuance result is exact and bound", async () => {
  const issue = { document: { receipt_id: "receipt-1", project_id: "project-1" }, actorId: "actor", authorityRef: "auth", baseline: "base", idempotencyKey: "idem" };
  const good = await harness().service.issueReceipt({ retrieval: retrieval(), issue });
  assert.equal(good.state, "ISSUED");
  for (const result of [
    { decision: "ALLOW", code: "SUBSTITUTED" },
    { ...good, projectId: "other" },
    { ...good, extra: true }
  ]) {
    const fixture = harness({ contextFederation: { issueReceipt() { return result; } } });
    assert.equal((await fixture.service.issueReceipt({ retrieval: retrieval(), issue })).code, "DENY_UNIFY_CONTEXT");
  }
});
