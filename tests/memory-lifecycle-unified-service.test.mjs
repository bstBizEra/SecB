import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { canonicalFingerprint } from "../src/contracts/canonical-fingerprint.mjs";
import { createMemoryLifecycleUnifiedService, MemoryLifecycleUnifiedConfigurationError,
  verifyMemoryContextLifecycleBinding } from "../src/index.mjs";
import { createMemoryAuthorityGateway } from "../src/services/memory-authority-gateway-service.mjs";
import { createMemoryCandidateProvider } from "../src/services/memory-candidate-provider.mjs";
import { normalizeCandidateSources } from "../src/services/candidate-source-port.mjs";
import { ContextFederationService, mintReceiptDocument } from "../src/services/context-federation-service.mjs";
import { WorkPackageContractService } from "../src/services/work-package-service.mjs";
import { DurableLedger } from "../src/ledger/durable-ledger.mjs";

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

function receiptDocument(overrides = {}) {
  const body = { receipt_id: "receipt-1", version: 1, project_id: "project-1", objective_id: "objective-1",
    work_package_id: "wp-1", session_id: "session-1", assigned_role: "REV", authority_scope: ["src/services"],
    baseline_version: "9".repeat(40), acceptance_criteria: ["review"], allowed_tools: ["read"], allowed_skills: [],
    evidence_obligations: ["review-report"], freshness_timestamp: NOW, source_references: ["mem-1"], ...overrides };
  return { ...body, content_hash: canonicalFingerprint(body) };
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
  const calls = { lifecycle: 0, fence: 0, provider: 0, federation: 0 };
  const memoryAuthorityGateway = overrides.memoryAuthorityGateway ?? { retrieve() {
    return { decision: "ALLOW", code: "RETRIEVED", retrieved_at: NOW,
      records: rows.map((row) => ({ data_untrusted: true, record: row })), next_cursor: null,
      actor_id: "actor-1", identity_decision_id: "identity-1", scope_decision_id: "scope-1", authority_decision_id: "gateway-authority-1" };
  } };
  const batch = (request) => ({ ok: true, code: "MEMORY_BATCH_RESOLVED", project_id: request.project_id, layer: request.layer,
    evaluated_at: request.as_of, batch_fingerprint: canonicalFingerprint(request),
    decisions: request.records.map((item) => effectiveDecision(request, item)) });
  const lifecycleResolver = {
    async resolveBatch(request) { calls.lifecycle += 1; return batch(request); },
    async withIssuanceFence(request, callback) { calls.fence += 1; return callback(batch(request)); },
    ...overrides.lifecycleResolver
  };
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
  const bindingRecords = [];
  const lifecycleBindingLedger = overrides.lifecycleBindingLedger ?? {
    verify() { return { valid: true, ledgerId: "memory-context-binding-test", count: bindingRecords.length, headHash: bindingRecords.at(-1)?.recordHash ?? "0".repeat(64) }; },
    read() { return structuredClone(bindingRecords); },
    append(entry, { expectedSequence }) {
      const replay = bindingRecords.find((record) => record.entry.idempotencyKey === entry.idempotencyKey);
      if (replay) {
        if (canonicalFingerprint(replay.entry) !== canonicalFingerprint(entry)) throw new Error("idempotency conflict");
        return { ...structuredClone(replay), replayed: true };
      }
      if (expectedSequence !== bindingRecords.length) throw new Error("sequence conflict");
      const record = { ledgerId: "memory-context-binding-test", sequence: bindingRecords.length + 1,
        previousHash: bindingRecords.at(-1)?.recordHash ?? "0".repeat(64), entry: structuredClone(entry),
        entryHash: canonicalFingerprint(entry) };
      record.recordHash = canonicalFingerprint({ ledgerId: record.ledgerId, sequence: record.sequence,
        previousHash: record.previousHash, entryHash: record.entryHash });
      bindingRecords.push(record);
      return { ...structuredClone(record), replayed: false };
    }
  };
  return { calls, service: createMemoryLifecycleUnifiedService({
    memoryAuthorityGateway, lifecycleResolver, memoryCandidateProvider, contextFederation, lifecycleBindingLedger,
    now: overrides.now ?? (() => new Date(NOW)), timeoutMs: overrides.timeoutMs ?? 50,
    freshnessMs: overrides.freshnessMs ?? 1_000
  }) };
}

const retrieval = (overrides = {}) => ({ project_id: "project-1", layer: "project", ...overrides });

test("construction requires trusted clock, atomic batch resolver, issuance fence, provider, and federation", () => {
  for (const missing of ["memoryAuthorityGateway", "lifecycleResolver", "memoryCandidateProvider", "contextFederation", "lifecycleBindingLedger"]) {
    const ports = { memoryAuthorityGateway: { retrieve() {} }, lifecycleResolver: { resolveBatch() {}, withIssuanceFence() {} },
      memoryCandidateProvider: { toCandidateSources() {} }, contextFederation: { issueReceipt() {} },
      lifecycleBindingLedger: { append() {}, read() {}, verify() {} }, now() { return new Date(NOW); } };
    delete ports[missing];
    assert.throws(() => createMemoryLifecycleUnifiedService(ports), MemoryLifecycleUnifiedConfigurationError);
  }
  assert.throws(() => createMemoryLifecycleUnifiedService({ memoryAuthorityGateway: { retrieve() {} },
    lifecycleResolver: { resolveBatch() {} }, memoryCandidateProvider: { toCandidateSources() {} },
    contextFederation: { issueReceipt() {} }, lifecycleBindingLedger: { append() {}, read() {}, verify() {} },
    now() { return new Date(NOW); } }), MemoryLifecycleUnifiedConfigurationError);
});

test("one authority-bound page is atomically lifecycle-resolved and normalized", async () => {
  const { service, calls } = harness();
  const result = await service.retrieveCandidateSources(retrieval());
  assert.equal(result.code, "MEMORY_LIFECYCLE_UNIFIED");
  assert.equal(result.sources[0].ref, "mem-1");
  assert.equal(result.authority_decision_id, "gateway-authority-1");
  assert.deepEqual(calls, { lifecycle: 1, fence: 0, provider: 1, federation: 0 });
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
  const nonCanonical = harness({ memoryAuthorityGateway: { retrieve() { return { decision: "ALLOW", code: "RETRIEVED",
    retrieved_at: "August 3, 2026 12:00:00Z", records: [], next_cursor: null, actor_id: "a",
    identity_decision_id: "i", scope_decision_id: "s", authority_decision_id: "g" }; } } });
  assert.equal((await nonCanonical.service.retrieveCandidateSources(retrieval())).code, "DENY_UNIFY_GATEWAY");
  const stuckCursor = harness({ memoryAuthorityGateway: { retrieve() { return { decision: "ALLOW", code: "RETRIEVED",
    retrieved_at: NOW, records: [], next_cursor: "same", actor_id: "a", identity_decision_id: "i",
    scope_decision_id: "s", authority_decision_id: "g" }; } } });
  assert.equal((await stuckCursor.service.retrieveCandidateSources(retrieval({ cursor: "same" }))).code, "DENY_UNIFY_GATEWAY");
});

test("batch receipt must be closed, complete, unique, and fingerprint-bound", async () => {
  for (const mutate of [
    (value) => ({ ...value, evaluated_at: "2000-01-01T00:00:00.000Z" }),
    (value) => ({ ...value, evaluated_at: "August 3, 2026 12:00:00Z" }),
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
  const { proxy, revoke } = Proxy.revocable({}, {}); revoke();
  assert.equal((await harness().service.retrieveCandidateSources(proxy)).code, "DENY_UNIFY_REQUEST");
  let tick = 0;
  const stale = harness({ freshnessMs: 5, now: () => new Date(Date.parse(NOW) + (tick++ === 0 ? 0 : 6)) });
  assert.equal((await stale.service.retrieveCandidateSources(retrieval())).code, "DENY_UNIFY_GATEWAY");
});

test("nested issue shape is closed against candidate smuggling, prototypes, symbols, and accessors", async () => {
  const { service } = harness();
  const base = { document: receiptDocument(), actorId: "actor", authorityRef: "auth", baseline: "base", idempotencyKey: "idem" };
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
  const issue = { document: receiptDocument(), actorId: "actor", authorityRef: "auth", baseline: "base", idempotencyKey: "idem" };
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

test("project substitution is denied before Context Federation is invoked", async () => {
  const { service, calls } = harness();
  const issue = { document: receiptDocument({ project_id: "other-project" }), actorId: "actor",
    authorityRef: "auth", baseline: "base", idempotencyKey: "idem" };
  assert.equal((await service.issueReceipt({ retrieval: retrieval(), issue })).code, "DENY_UNIFY_ISSUE_REQUEST");
  assert.equal(calls.federation, 0);
});

test("cross-phase clock regression and forward staleness deny before the issuance fence", async () => {
  const issue = { document: receiptDocument(), actorId: "actor", authorityRef: "auth", baseline: "base", idempotencyKey: "idem" };
  for (const offset of [-3_600_000, 3_600_000]) {
    let calls = 0;
    let fenceCalls = 0;
    const fixture = harness({ freshnessMs: 1_000,
      now: () => new Date(Date.parse(NOW) + (calls++ < 4 ? 0 : offset)),
      lifecycleResolver: { async withIssuanceFence() { fenceCalls += 1; throw new Error("must not run"); } } });
    assert.equal((await fixture.service.issueReceipt({ retrieval: retrieval(), issue })).code, "DENY_UNIFY_FRESHNESS");
    assert.equal(fenceCalls, 0);
    assert.equal(fixture.calls.federation, 0);
  }
});

test("final lifecycle revalidation occurs inside the single issuance fence and binds its state digest", async () => {
  const issue = { document: receiptDocument(), actorId: "actor",
    authorityRef: "auth", baseline: "base", idempotencyKey: "idem" };
  let federationCalls = 0;
  const terminal = harness({ lifecycleResolver: { async withIssuanceFence(request, callback) {
    const item = request.records[0];
    return callback({ ok: true, code: "MEMORY_BATCH_RESOLVED", project_id: request.project_id, layer: request.layer,
      evaluated_at: request.as_of, batch_fingerprint: canonicalFingerprint(request), decisions: [{
        request_index: 0, ok: false, code: "DENY_MEMORY_TOMBSTONED", memory_record_id: item.memory_record_id,
        memory_record_version: item.memory_record_version, content_hash: null, target_record_fingerprint: null,
        state_fingerprint: null, lifecycle_head_hash: null, authority_decision_id: null
      }] });
  } }, contextFederation: { issueReceipt() { federationCalls += 1; throw new Error("must not run"); } } });
  assert.equal((await terminal.service.issueReceipt({ retrieval: retrieval(), issue })).code, "DENY_UNIFY_FINAL_LIFECYCLE");
  assert.equal(federationCalls, 0);

  const good = await harness().service.issueReceipt({ retrieval: retrieval(), issue });
  assert.equal(good.state, "ISSUED");
  assert.equal(good.sourceStateBinding.context_receipt_fingerprint, issue.document.content_hash);
  assert.match(good.sourceStateBinding.lifecycle_state_digest, /^[a-f0-9]{64}$/);
  assert.equal(good.sourceStateBinding.evaluated_at, NOW);
  assert.equal(verifyMemoryContextLifecycleBinding(good.sourceStateBinding), true);
  assert.equal(verifyMemoryContextLifecycleBinding({ ...good.sourceStateBinding, lifecycle_state_digest: "f".repeat(64) }), false);
});

test("durable binding failure denies before Context Federation mutation", async () => {
  const issue = { document: receiptDocument(), actorId: "actor", authorityRef: "auth", baseline: "base", idempotencyKey: "idem" };
  let federationCalls = 0;
  const fixture = harness({ lifecycleBindingLedger: { verify() { return { valid: false }; }, read() { return []; }, append() { throw new Error("must not append"); } },
    contextFederation: { issueReceipt() { federationCalls += 1; throw new Error("must not issue"); } } });
  assert.equal((await fixture.service.issueReceipt({ retrieval: retrieval(), issue })).code, "DENY_UNIFY_BINDING_LEDGER");
  assert.equal(federationCalls, 0);
});

test("timed-out issuance fence cannot invoke Context Federation later", async () => {
  const issue = { document: receiptDocument(), actorId: "actor",
    authorityRef: "auth", baseline: "base", idempotencyKey: "idem" };
  let federationCalls = 0;
  let lateCallback;
  const fixture = harness({ timeoutMs: 5, lifecycleResolver: { async withIssuanceFence(request, callback) {
    lateCallback = () => callback({ ok: true, code: "MEMORY_BATCH_RESOLVED", project_id: request.project_id,
      layer: request.layer, evaluated_at: request.as_of, batch_fingerprint: canonicalFingerprint(request),
      decisions: request.records.map((item) => effectiveDecision(request, item)) });
    return new Promise(() => {});
  } }, contextFederation: { issueReceipt() { federationCalls += 1; throw new Error("must not run"); } } });
  assert.equal((await fixture.service.issueReceipt({ retrieval: retrieval(), issue })).code, "DENY_UNIFY_ISSUANCE_FENCE");
  lateCallback();
  assert.equal(federationCalls, 0);
});

test("a fence that stalls after its callback cannot turn an issued receipt into a timeout denial", async () => {
  const issue = { document: receiptDocument(), actorId: "actor",
    authorityRef: "auth", baseline: "base", idempotencyKey: "idem" };
  let federationCalls = 0;
  let secondDisposition;
  const fixture = harness({ timeoutMs: 5, lifecycleResolver: { async withIssuanceFence(request, callback) {
    const batch = { ok: true, code: "MEMORY_BATCH_RESOLVED", project_id: request.project_id, layer: request.layer,
      evaluated_at: request.as_of, batch_fingerprint: canonicalFingerprint(request),
      decisions: request.records.map((item) => effectiveDecision(request, item)) };
    callback(batch);
    secondDisposition = callback(batch);
    return new Promise(() => {});
  } }, contextFederation: { issueReceipt(request) { federationCalls += 1; return {
    receiptId: request.document.receipt_id, projectId: request.document.project_id, version: 1, state: "ISSUED",
    boundWpVersion: 1, expiresAt: "2026-08-04T12:00:00.000Z", exclusions: [], replayed: false
  }; } } });
  const issued = await fixture.service.issueReceipt({ retrieval: retrieval(), issue });
  assert.equal(issued.state, "ISSUED");
  assert.equal(federationCalls, 1);
  assert.equal(secondDisposition.code, "DENY_UNIFY_FENCE_CALLBACK");
});

test("clock movement after Context mutation cannot convert ISSUED into a freshness denial", async () => {
  const issue = { document: receiptDocument(), actorId: "actor", authorityRef: "auth", baseline: "base", idempotencyKey: "idem" };
  let clockMs = Date.parse(NOW);
  let federationCalls = 0;
  const fixture = harness({ now: () => new Date(clockMs), contextFederation: { issueReceipt(request) {
    federationCalls += 1;
    clockMs += 3_600_000;
    return { receiptId: request.document.receipt_id, projectId: request.document.project_id, version: 1, state: "ISSUED",
      boundWpVersion: 1, expiresAt: "2026-08-04T12:00:00.000Z", exclusions: [], replayed: false };
  } } });
  const issued = await fixture.service.issueReceipt({ retrieval: retrieval(), issue });
  assert.equal(issued.state, "ISSUED");
  assert.equal(federationCalls, 1);
});

test("real authority gateway, provider, Context Federation, and durable binding ledger compose with an advancing clock", async (t) => {
  const projectId = "project-1";
  const actorId = "engineer-1";
  const wpId = "wp-1";
  const baseline = "9".repeat(40);
  let nowMs = Date.parse(NOW);
  const clock = () => new Date(nowMs++);
  const dir = mkdtempSync(join(tmpdir(), "secb-unify-binding-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const lifecycleBindingLedger = new DurableLedger({ filePath: join(dir, "bindings.jsonl"), ledgerId: "memory-context-bindings" });
  const row = memory({ work_package_id: wpId, access_policy: "project-members" });
  const rawGateway = { admit() {}, retrieve() { return { decision: "ALLOW", code: "RETRIEVED", retrieved_at: clock().toISOString(),
    records: [{ data_untrusted: true, record: row }], next_cursor: null }; } };
  const authorityGateway = createMemoryAuthorityGateway({
    memoryGateway: rawGateway,
    identityResolver: () => ({ decision: "ALLOW", decision_id: "identity-real-1", actor_id: actorId }),
    scopeResolver: () => ({ decision: "ALLOW", decision_id: "scope-real-1", actor_id: actorId, project_id: projectId }),
    retrievalAuthorityResolver: ({ project_id, layer }) => ({ decision: "ALLOW", decision_id: "retrieval-real-1",
      actor_id: actorId, project_id, layer, classification_clearance: "CONFIDENTIAL", permitted_access_policies: ["project-members"] }),
    cursorMacKey: Buffer.alloc(32, 0x45)
  });
  const provider = createMemoryCandidateProvider({ now: clock });
  const grants = [
    { grantId: "grant-eng", decisionId: "decision-eng", actorId, projectId, workPackageId: wpId, workPackageVersion: 1,
      roles: ["ENGIN"], allowedTransitions: ["WorkPackage:DRAFT->PLANNED"], validFrom: "2026-08-01T00:00:00Z", validUntil: "2026-09-01T00:00:00Z", status: "ACTIVE" },
    { grantId: "grant-rev", decisionId: "decision-rev", actorId: "reviewer-1", projectId, workPackageId: wpId, workPackageVersion: 1,
      roles: ["REV"], allowedTransitions: ["WorkPackage:PLANNED->REVIEWED"], validFrom: "2026-08-01T00:00:00Z", validUntil: "2026-09-01T00:00:00Z", status: "ACTIVE" },
    { grantId: "grant-gov", decisionId: "decision-gov", actorId: "governor-1", projectId, workPackageId: wpId, workPackageVersion: 1,
      roles: ["GOV"], allowedTransitions: ["WorkPackage:REVIEWED->AUTHORIZED"], validFrom: "2026-08-01T00:00:00Z", validUntil: "2026-09-01T00:00:00Z", status: "ACTIVE" }
  ];
  const wp = new WorkPackageContractService({ grants, authoritySource: () => grants, now: clock });
  wp.createWorkPackage({ work_package_id: wpId, version: 1, project_id: projectId, objective: "unified composition",
    risk_class: "R2", status: "DRAFT", baseline, scope: ["src/"], non_scope: ["runtime/"],
    acceptance_criteria: ["composition passes"], roles: { producer: actorId }, allowed_paths: ["src/services"],
    prohibited_paths: ["runtime"], evidence_obligations: ["self:composition"], valid_until: "2026-09-01T00:00:00Z" },
  { idempotencyKey: "create-real-wp", actorId, authorityRef: "grant-eng" });
  for (const [requestedState, transitionActor, authorityRef, idempotencyKey] of [
    ["PLANNED", actorId, "grant-eng", "plan-real-wp"],
    ["REVIEWED", "reviewer-1", "grant-rev", "review-real-wp"],
    ["AUTHORIZED", "governor-1", "grant-gov", "authorize-real-wp"]
  ]) wp.submitTransition({ projectId, workPackageId: wpId, version: 1, requestedState, actorId: transitionActor,
    authorityRef, policyDecision: "ALLOW", evidence: [{ ref: `evidence-${requestedState}` }], idempotencyKey, reasonCode: "UNIFY_TEST" });
  const federation = new ContextFederationService({ workPackageService: wp, now: clock });
  const lifecycleResolver = {
    async resolveBatch(request) { return { ok: true, code: "MEMORY_BATCH_RESOLVED", project_id: request.project_id,
      layer: request.layer, evaluated_at: request.as_of, batch_fingerprint: canonicalFingerprint(request),
      decisions: request.records.map((item) => effectiveDecision(request, item)) }; },
    async withIssuanceFence(request, callback) { return callback({ ok: true, code: "MEMORY_BATCH_RESOLVED",
      project_id: request.project_id, layer: request.layer, evaluated_at: request.as_of,
      batch_fingerprint: canonicalFingerprint(request), decisions: request.records.map((item) => effectiveDecision(request, item)) }); }
  };
  const unified = createMemoryLifecycleUnifiedService({ memoryAuthorityGateway: authorityGateway, lifecycleResolver,
    memoryCandidateProvider: provider, contextFederation: federation, lifecycleBindingLedger, now: clock });
  const projected = provider.toCandidateSources({ project_id: projectId, records: [row] });
  const candidates = normalizeCandidateSources(projected.sources).candidates;
  const minted = mintReceiptDocument({ receipt_id: "receipt-real-1", project_id: projectId, objective_id: "objective-real-1",
    work_package_id: wpId, session_id: "session-real-1", assigned_role: "REV", authority_scope: ["src/services"],
    baseline_version: baseline, acceptance_criteria: ["review"], allowed_tools: ["read"], allowed_skills: [],
    evidence_obligations: ["review-report"], freshness_timestamp: NOW, candidateSources: candidates });
  const issued = await unified.issueReceipt({ retrieval: retrieval(), issue: { document: minted.document, actorId,
    authorityRef: "grant-eng", baseline, idempotencyKey: "issue-real-receipt" } });
  assert.equal(issued.state, "ISSUED");
  assert.equal(issued.projectId, projectId);
  assert.ok(Date.parse(issued.sourceStateBinding.evaluated_at) >= Date.parse(NOW));
  assert.match(issued.sourceStateBinding.lifecycle_state_digest, /^[a-f0-9]{64}$/);
  assert.match(issued.sourceStateBinding.binding_fingerprint, /^[a-f0-9]{64}$/);
  assert.match(issued.sourceStateBinding.ledger_record_hash, /^[a-f0-9]{64}$/);
  assert.equal(lifecycleBindingLedger.verify().count, 1);
});
