import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { canonicalFingerprint } from "../src/contracts/canonical-fingerprint.mjs";
import { createMemoryLifecycleRuntimeComposition, createMemoryLifecycleUnifiedService, MemoryLifecycleUnifiedConfigurationError,
  verifyMemoryContextLifecycleBinding } from "../src/index.mjs";
import { createMemoryAuthorityGateway } from "../src/services/memory-authority-gateway-service.mjs";
import { createMemoryCandidateProvider } from "../src/services/memory-candidate-provider.mjs";
import { normalizeCandidateSources } from "../src/services/candidate-source-port.mjs";
import { ContextFederationService, mintReceiptDocument } from "../src/services/context-federation-service.mjs";
import { DurableContextReplayAdapter } from "../src/services/durable-context-replay-adapter.mjs";
import { WorkPackageContractService } from "../src/services/work-package-service.mjs";
import { DurableAnchoredLedger } from "../src/ledger/durable-anchored-ledger.mjs";
import { DurableHeadAnchor } from "../src/ledger/durable-head-anchor.mjs";
import { MemoryLifecycleLedger } from "../src/ledger/memory-lifecycle-ledger.mjs";
import { checkPairwiseDistinct } from "../src/control/sod-rules.mjs";

const NOW = "2026-08-03T12:00:00.000Z";
const fenceFields = () => ({ fence_revision: "d".repeat(64), lifecycle_head_hash: "c".repeat(64) });

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

function bindingLedgerFixture({ onAppend = () => {} } = {}) {
  const records = [];
  return {
    records,
    ledger: {
      verifyTrusted() { return { valid: true, ledgerId: "memory-context-binding-test", count: records.length, headHash: records.at(-1)?.recordHash ?? "0".repeat(64) }; },
      read() { return structuredClone(records); },
      append(entry, { expectedSequence, preWriteCheck } = {}) {
        onAppend(entry);
        const replay = records.find((record) => record.entry.idempotencyKey === entry.idempotencyKey);
        if (replay) {
          if (canonicalFingerprint(replay.entry) !== canonicalFingerprint(entry)) throw new Error("idempotency conflict");
          return { ...structuredClone(replay), replayed: true };
        }
        if (expectedSequence !== records.length) throw new Error("sequence conflict");
        const veto = preWriteCheck?.(structuredClone(records), structuredClone(entry));
        if (veto) return veto;
        const record = { ledgerId: "memory-context-binding-test", sequence: records.length + 1,
          previousHash: records.at(-1)?.recordHash ?? "0".repeat(64), entry: structuredClone(entry),
          entryHash: canonicalFingerprint(entry) };
        record.recordHash = canonicalFingerprint({ ledgerId: record.ledgerId, sequence: record.sequence,
          previousHash: record.previousHash, entryHash: record.entryHash });
        records.push(record);
        return { ...structuredClone(record), replayed: false };
      }
    }
  };
}

const trustedAnchor = (ledger) => {
  const { ledgerId, count, headHash } = ledger.verifyTrusted();
  return { ledgerId, count, headHash };
};

function rehashChain(records) {
  let priorHash = "0".repeat(64);
  records.forEach((record, index) => {
    record.sequence = index + 1;
    record.previousHash = priorHash;
    record.entryHash = canonicalFingerprint(record.entry);
    record.recordHash = canonicalFingerprint({ ledgerId: record.ledgerId, sequence: record.sequence,
      previousHash: record.previousHash, entryHash: record.entryHash });
    priorHash = record.recordHash;
  });
  return records;
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
    evaluated_at: request.as_of, batch_fingerprint: canonicalFingerprint(request), ...fenceFields(),
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
  const contextFederation = { replayReceipt() { return { decision: "DENY", code: "DENY_CONTEXT_REPLAY_MISS" }; }, ...(overrides.contextFederation ?? { issueReceipt(request) {
    calls.federation += 1;
    return { receiptId: request.document.receipt_id, projectId: request.document.project_id, version: 1, state: "ISSUED",
      boundWpVersion: 1, expiresAt: "2026-08-04T12:00:00.000Z", exclusions: [], replayed: false };
  } }) };
  const lifecycleBindingLedger = overrides.lifecycleBindingLedger ?? bindingLedgerFixture().ledger;
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
      memoryCandidateProvider: { toCandidateSources() {} }, contextFederation: { issueReceipt() {}, replayReceipt() {} },
      lifecycleBindingLedger: { append() {}, read() {}, verifyTrusted() {} }, now() { return new Date(NOW); } };
    delete ports[missing];
    assert.throws(() => createMemoryLifecycleUnifiedService(ports), MemoryLifecycleUnifiedConfigurationError);
  }
  assert.throws(() => createMemoryLifecycleUnifiedService({ memoryAuthorityGateway: { retrieve() {} },
    lifecycleResolver: { resolveBatch() {} }, memoryCandidateProvider: { toCandidateSources() {} },
    contextFederation: { issueReceipt() {}, replayReceipt() {} }, lifecycleBindingLedger: { append() {}, read() {}, verifyTrusted() {} },
    now() { return new Date(NOW); } }), MemoryLifecycleUnifiedConfigurationError);
  assert.throws(() => createMemoryLifecycleUnifiedService({ memoryAuthorityGateway: { retrieve() {} },
    lifecycleResolver: { resolveBatch() {}, withIssuanceFence() {} }, memoryCandidateProvider: { toCandidateSources() {} },
    contextFederation: { issueReceipt() {} }, lifecycleBindingLedger: { append() {}, read() {}, verifyTrusted() {} },
    now() { return new Date(NOW); } }), (error) => error.code === "INVALID_CONTEXT_RECOVERY");
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
      evaluated_at: NOW, batch_fingerprint: canonicalFingerprint(request), ...fenceFields(), decisions: [{
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
        evaluated_at: NOW, batch_fingerprint: canonicalFingerprint(request), ...fenceFields(), decisions: request.records.map((item) => effectiveDecision(request, item)) };
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
      evaluated_at: request.as_of, batch_fingerprint: canonicalFingerprint(request), ...fenceFields(), decisions: [{
        request_index: 0, ok: false, code: "DENY_MEMORY_TOMBSTONED", memory_record_id: item.memory_record_id,
        memory_record_version: item.memory_record_version, content_hash: null, target_record_fingerprint: null,
        state_fingerprint: null, lifecycle_head_hash: null, authority_decision_id: null
      }] });
  } }, contextFederation: { issueReceipt() { federationCalls += 1; throw new Error("must not run"); } } });
  assert.equal((await terminal.service.issueReceipt({ retrieval: retrieval(), issue })).code, "DENY_UNIFY_FINAL_LIFECYCLE");
  assert.equal(federationCalls, 0);

  const bindingEvidence = bindingLedgerFixture();
  const good = await harness({ lifecycleBindingLedger: bindingEvidence.ledger }).service.issueReceipt({ retrieval: retrieval(), issue });
  assert.equal(good.state, "ISSUED");
  assert.equal(good.sourceStateBinding.context_receipt_fingerprint, issue.document.content_hash);
  assert.match(good.sourceStateBinding.lifecycle_state_digest, /^[a-f0-9]{64}$/);
  assert.equal(good.sourceStateBinding.evaluated_at, NOW);
  const anchor = trustedAnchor(bindingEvidence.ledger);
  assert.equal(verifyMemoryContextLifecycleBinding(good.sourceStateBinding, bindingEvidence.records, anchor), true);
  assert.equal(verifyMemoryContextLifecycleBinding(good.sourceStateBinding), false);
  assert.equal(verifyMemoryContextLifecycleBinding({ ...good.sourceStateBinding,
    lifecycle_state_digest: "f".repeat(64) }, bindingEvidence.records, anchor), false);
  assert.equal(verifyMemoryContextLifecycleBinding({ ...good.sourceStateBinding,
    ledger_sequence: "evil" }, bindingEvidence.records, anchor), false);
  assert.equal(verifyMemoryContextLifecycleBinding({ ...good.sourceStateBinding,
    ledger_record_hash: "bad" }, bindingEvidence.records, anchor), false);
  assert.equal(verifyMemoryContextLifecycleBinding({ ...good.sourceStateBinding,
    replayed: "yes" }, bindingEvidence.records, anchor), false);
  assert.equal(verifyMemoryContextLifecycleBinding({ ...good.sourceStateBinding,
    replayed: true }, bindingEvidence.records, anchor), false);
  for (const mutate of [
    (records) => { records[0].entry.payload.status = "COMMITTED"; },
    (records) => { records[0].entryHash = "f".repeat(64); },
    (records) => { records[1].recordHash = "f".repeat(64); },
    (records) => { records[1].previousHash = "f".repeat(64); },
    (records) => { records.reverse(); },
    (records) => { records.shift(); }
  ]) {
    const tampered = structuredClone(bindingEvidence.records); mutate(tampered);
    assert.equal(verifyMemoryContextLifecycleBinding(good.sourceStateBinding, tampered, anchor), false);
  }
  const orphan = structuredClone([bindingEvidence.records[1]]);
  orphan[0].sequence = 1; orphan[0].previousHash = "0".repeat(64);
  orphan[0].entryHash = canonicalFingerprint(orphan[0].entry);
  orphan[0].recordHash = canonicalFingerprint({ ledgerId: orphan[0].ledgerId, sequence: orphan[0].sequence,
    previousHash: orphan[0].previousHash, entryHash: orphan[0].entryHash });
  assert.equal(verifyMemoryContextLifecycleBinding({ ...good.sourceStateBinding,
    ledger_sequence: 1, ledger_record_hash: orphan[0].recordHash }, orphan,
  { ledgerId: orphan[0].ledgerId, count: 1, headHash: orphan[0].recordHash }), false);
  const selfConsistentForgery = structuredClone(bindingEvidence.records);
  selfConsistentForgery[1].entry.entryId = "attacker-entry";
  let priorHash = "0".repeat(64);
  for (const forged of selfConsistentForgery) {
    forged.previousHash = priorHash;
    forged.entryHash = canonicalFingerprint(forged.entry);
    forged.recordHash = canonicalFingerprint({ ledgerId: forged.ledgerId, sequence: forged.sequence,
      previousHash: forged.previousHash, entryHash: forged.entryHash });
    priorHash = forged.recordHash;
  }
  assert.equal(verifyMemoryContextLifecycleBinding({ ...good.sourceStateBinding,
    ledger_record_hash: selfConsistentForgery[1].recordHash }, selfConsistentForgery,
  { ledgerId: selfConsistentForgery[0].ledgerId, count: 2, headHash: selfConsistentForgery[1].recordHash }), false);
  const actorForgery = rehashChain(structuredClone(bindingEvidence.records));
  actorForgery[0].entry.actorId = "ATTACKER"; actorForgery[1].entry.actorId = "ATTACKER";
  rehashChain(actorForgery);
  assert.equal(verifyMemoryContextLifecycleBinding({ ...good.sourceStateBinding,
    ledger_record_hash: actorForgery[1].recordHash }, actorForgery,
  { ledgerId: actorForgery[0].ledgerId, count: 2, headHash: actorForgery[1].recordHash }), false);
  const reversedSemantics = rehashChain(structuredClone(bindingEvidence.records).reverse());
  assert.equal(verifyMemoryContextLifecycleBinding({ ...good.sourceStateBinding,
    ledger_sequence: 1, ledger_record_hash: reversedSemantics[0].recordHash }, reversedSemantics,
  { ledgerId: reversedSemantics[0].ledgerId, count: 2, headHash: reversedSemantics[1].recordHash }), false);
  const malformedFamily = structuredClone(bindingEvidence.records);
  malformedFamily.push({ ledgerId: malformedFamily[0].ledgerId, entry: { ...structuredClone(malformedFamily[0].entry),
    entryId: "malformed-family", type: "MEMORY_CONTEXT_LIFECYCLE_BINDING_ABORTED", payload: {} } });
  rehashChain(malformedFamily);
  assert.equal(verifyMemoryContextLifecycleBinding({ ...good.sourceStateBinding,
    ledger_record_hash: malformedFamily[1].recordHash }, malformedFamily,
  { ledgerId: malformedFamily[0].ledgerId, count: 3, headHash: malformedFamily[2].recordHash }), false);
  const conflictingCommitted = structuredClone(bindingEvidence.records);
  const { binding_fingerprint: ignoredBindingFingerprint, ...bindingBody } = conflictingCommitted[0].entry.payload.binding;
  void ignoredBindingFingerprint;
  const bindingB = { ...bindingBody, binding_attempt: bindingBody.binding_attempt + 2 };
  bindingB.binding_fingerprint = canonicalFingerprint(bindingB);
  for (const sourceRecord of bindingEvidence.records) {
    const recordB = structuredClone(sourceRecord);
    const status = recordB.entry.payload.status;
    recordB.entry.payload.binding = structuredClone(bindingB);
    recordB.entry.entryId = canonicalFingerprint({ binding_fingerprint: bindingB.binding_fingerprint, status });
    recordB.entry.idempotencyKey = JSON.stringify([recordB.entry.projectId, issue.document.receipt_id,
      bindingB.binding_fingerprint, status]);
    conflictingCommitted.push(recordB);
  }
  rehashChain(conflictingCommitted);
  const conflictingAnchor = { ledgerId: conflictingCommitted[0].ledgerId, count: 4,
    headHash: conflictingCommitted[3].recordHash };
  assert.equal(verifyMemoryContextLifecycleBinding({ ...good.sourceStateBinding,
    ledger_record_hash: conflictingCommitted[1].recordHash }, conflictingCommitted, conflictingAnchor), false);
  assert.equal(verifyMemoryContextLifecycleBinding({ ...bindingB, binding_status: "COMMITTED", ledger_sequence: 4,
    ledger_record_hash: conflictingCommitted[3].recordHash, replayed: false }, conflictingCommitted, conflictingAnchor), false);
  const launderedReservation = structuredClone(bindingEvidence.records);
  const preparedB = structuredClone(conflictingCommitted[2]);
  const abortedB = structuredClone(preparedB);
  abortedB.entry.type = "MEMORY_CONTEXT_LIFECYCLE_BINDING_ABORTED";
  abortedB.entry.payload = { binding: structuredClone(bindingB), status: "ABORTED", reason: "LAUNDER_RESERVATION" };
  abortedB.entry.entryId = canonicalFingerprint({ binding_fingerprint: bindingB.binding_fingerprint, status: "ABORTED" });
  abortedB.entry.idempotencyKey = JSON.stringify([abortedB.entry.projectId, issue.document.receipt_id,
    bindingB.binding_fingerprint, "ABORTED"]);
  launderedReservation.push(preparedB, abortedB);
  rehashChain(launderedReservation);
  assert.equal(verifyMemoryContextLifecycleBinding({ ...good.sourceStateBinding,
    ledger_record_hash: launderedReservation[1].recordHash }, launderedReservation,
  { ledgerId: launderedReservation[0].ledgerId, count: 4, headHash: launderedReservation[3].recordHash }), false);
  assert.equal(verifyMemoryContextLifecycleBinding(good.sourceStateBinding, bindingEvidence.records,
    { ...anchor, headHash: "f".repeat(64) }), false);
  const preparedEntry = bindingEvidence.records[0].entry;
  bindingEvidence.ledger.append({ ...structuredClone(preparedEntry),
    entryId: canonicalFingerprint({ binding_fingerprint: good.sourceStateBinding.binding_fingerprint, status: "ABORTED" }),
    type: "MEMORY_CONTEXT_LIFECYCLE_BINDING_ABORTED",
    payload: { binding: structuredClone(preparedEntry.payload.binding), status: "ABORTED", reason: "IMPOSSIBLE_AFTER_COMMIT" },
    idempotencyKey: JSON.stringify([issue.document.project_id, issue.document.receipt_id,
      good.sourceStateBinding.binding_fingerprint, "ABORTED"])
  }, { expectedSequence: 2 });
  assert.equal(verifyMemoryContextLifecycleBinding(good.sourceStateBinding, bindingEvidence.records,
    trustedAnchor(bindingEvidence.ledger)), false);
  const expectedContextRequest = { ...issue, candidateSources: normalizeCandidateSources([source(memory())]).candidates };
  assert.equal(good.sourceStateBinding.context_issue_fingerprint,
    canonicalFingerprint({ op: "ISSUE", request: { ...expectedContextRequest, idempotencyKey: undefined } }));
});

test("durable binding failure denies before Context Federation mutation", async () => {
  const issue = { document: receiptDocument(), actorId: "actor", authorityRef: "auth", baseline: "base", idempotencyKey: "idem" };
  let federationCalls = 0;
  const fixture = harness({ lifecycleBindingLedger: { verifyTrusted() { return { valid: false }; }, read() { return []; }, append() { throw new Error("must not append"); } },
    contextFederation: { issueReceipt() { federationCalls += 1; throw new Error("must not issue"); } } });
  assert.equal((await fixture.service.issueReceipt({ retrieval: retrieval(), issue })).code, "DENY_UNIFY_BINDING_RECOVERY");
  assert.equal(federationCalls, 0);
});

test("complete PREPARED entry is bounded below head-anchor capacity", async () => {
  const binding = bindingLedgerFixture();
  const fixture = harness({ lifecycleBindingLedger: binding.ledger });
  const issue = { document: receiptDocument({ acceptance_criteria: ["x".repeat(7 * 1024 * 1024)] }),
    actorId: "actor", authorityRef: "auth", baseline: "base", idempotencyKey: "idem-large-prepared" };
  const denied = await fixture.service.issueReceipt({ retrieval: retrieval(), issue });
  assert.equal(denied.code, "DENY_UNIFY_BINDING_LEDGER");
  assert.equal(fixture.calls.federation, 0);
  assert.equal(binding.records.length, 0);
});

test("binding-ledger delay is rechecked immediately before Context mutation", async () => {
  const issue = { document: receiptDocument(), actorId: "actor", authorityRef: "auth", baseline: "base", idempotencyKey: "idem" };
  let clockMs = Date.parse(NOW);
  let federationCalls = 0;
  const binding = bindingLedgerFixture({ onAppend: () => { clockMs += 5_000; } });
  const fixture = harness({ freshnessMs: 1_000, now: () => new Date(clockMs), lifecycleBindingLedger: binding.ledger,
    contextFederation: { issueReceipt() { federationCalls += 1; throw new Error("must not issue"); } } });
  assert.equal((await fixture.service.issueReceipt({ retrieval: retrieval(), issue })).code, "DENY_UNIFY_FRESHNESS");
  assert.equal(federationCalls, 0);
  assert.deepEqual(binding.records.map((record) => record.entry.payload.status), ["PREPARED", "ABORTED"]);
});

test("Context failure records ABORTED and a deterministic retry can COMMIT", async () => {
  const issue = { document: receiptDocument(), actorId: "actor", authorityRef: "auth", baseline: "base", idempotencyKey: "idem" };
  const binding = bindingLedgerFixture();
  let contextCalls = 0;
  const fixture = harness({ lifecycleBindingLedger: binding.ledger, contextFederation: { issueReceipt(request) {
    contextCalls += 1;
    if (contextCalls === 1) return { decision: "DENY" };
    return { receiptId: request.document.receipt_id, projectId: request.document.project_id, version: 1, state: "ISSUED",
      boundWpVersion: 1, expiresAt: "2026-08-04T12:00:00.000Z", exclusions: [], replayed: false };
  } } });
  assert.equal((await fixture.service.issueReceipt({ retrieval: retrieval(), issue })).code, "DENY_UNIFY_CONTEXT");
  const issued = await fixture.service.issueReceipt({ retrieval: retrieval(), issue });
  assert.equal(issued.state, "ISSUED");
  assert.equal(issued.sourceStateBinding.binding_status, "COMMITTED");
  assert.deepEqual(binding.records.map((record) => record.entry.payload.status), ["PREPARED", "ABORTED", "PREPARED", "COMMITTED"]);
});

test("crash after Context issuance recovers original binding before any new lifecycle evaluation", async () => {
  const issue = { document: receiptDocument(), actorId: "actor", authorityRef: "auth", baseline: "base", idempotencyKey: "idem-crash" };
  let failCommit = true;
  const binding = bindingLedgerFixture({ onAppend(entry) {
    if (entry.payload.status === "COMMITTED" && failCommit) { failCommit = false; throw new Error("simulated crash"); }
  } });
  let contextCalls = 0;
  let originalRequest;
  let nowMs = Date.parse(NOW);
  const fixture = harness({ lifecycleBindingLedger: binding.ledger, now: () => new Date(nowMs), contextFederation: {
    replayReceipt(request) {
      if (originalRequest === undefined) return { decision: "DENY", code: "DENY_CONTEXT_REPLAY_MISS" };
      contextCalls += 1;
      assert.deepEqual(request, originalRequest);
      return { receiptId: request.document.receipt_id, projectId: request.document.project_id, version: 1, state: "ISSUED",
        boundWpVersion: 1, expiresAt: "2026-08-04T12:00:00.000Z", exclusions: [], replayed: true };
    }, issueReceipt(request) {
    contextCalls += 1;
    if (originalRequest === undefined) originalRequest = structuredClone(request);
    else assert.deepEqual(request, originalRequest);
    return { receiptId: request.document.receipt_id, projectId: request.document.project_id, version: 1, state: "ISSUED",
      boundWpVersion: 1, expiresAt: "2026-08-04T12:00:00.000Z", exclusions: [], replayed: contextCalls > 1 };
  } } });
  const first = await fixture.service.issueReceipt({ retrieval: retrieval(), issue });
  assert.equal(first.code, "DENY_UNIFY_BINDING_RECOVERY");
  assert.equal(first.recovery_required, true);
  assert.deepEqual(binding.records.map((record) => record.entry.payload.status), ["PREPARED"]);
  const bindingA = binding.records[0].entry.payload.binding.binding_fingerprint;
  const callsBeforeRecovery = structuredClone(fixture.calls);
  nowMs += 3_600_000;

  const conflicting = await fixture.service.issueReceipt({ retrieval: retrieval(), issue: { ...issue, baseline: "changed" } });
  assert.equal(conflicting.code, "DENY_UNIFY_BINDING_RECOVERY");
  const conflictingDocument = receiptDocument({ objective_id: "changed-objective" });
  const documentConflict = await fixture.service.issueReceipt({ retrieval: retrieval(), issue: { ...issue, document: conflictingDocument } });
  assert.equal(documentConflict.code, "DENY_UNIFY_BINDING_RECOVERY");
  assert.deepEqual(fixture.calls, callsBeforeRecovery);
  assert.equal(binding.records.length, 1);

  const recovered = await fixture.service.issueReceipt({ retrieval: retrieval(), issue });
  assert.equal(recovered.state, "ISSUED");
  assert.equal(recovered.replayed, true);
  assert.equal(recovered.sourceStateBinding.binding_status, "COMMITTED");
  assert.equal(recovered.sourceStateBinding.binding_fingerprint, bindingA);
  const callsAfterRecovery = { ...callsBeforeRecovery, fence: callsBeforeRecovery.fence + 1 };
  assert.deepEqual(fixture.calls, callsAfterRecovery);
  assert.deepEqual(binding.records.map((record) => record.entry.payload.status), ["PREPARED", "COMMITTED"]);
  assert.equal(verifyMemoryContextLifecycleBinding(recovered.sourceStateBinding,
    binding.records, trustedAnchor(binding.ledger)), true);

  const replay = await fixture.service.issueReceipt({ retrieval: retrieval(), issue });
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.sourceStateBinding, recovered.sourceStateBinding);
  assert.deepEqual(fixture.calls, callsAfterRecovery);
  assert.equal(binding.records.length, 2);
  assert.equal(contextCalls, 3);
});

test("failed ABORTED write surfaces an unresolved recovery-required state", async () => {
  const issue = { document: receiptDocument(), actorId: "actor", authorityRef: "auth", baseline: "base", idempotencyKey: "idem-abort" };
  const binding = bindingLedgerFixture({ onAppend(entry) {
    if (entry.payload.status === "ABORTED") throw new Error("simulated abort persistence failure");
  } });
  const fixture = harness({ lifecycleBindingLedger: binding.ledger, contextFederation: { issueReceipt() { return { decision: "DENY" }; } } });
  const denied = await fixture.service.issueReceipt({ retrieval: retrieval(), issue });
  assert.equal(denied.code, "DENY_UNIFY_BINDING_RECOVERY");
  assert.equal(denied.recovery_required, true);
  assert.deepEqual(binding.records.map((record) => record.entry.payload.status), ["PREPARED"]);
});

test("pre-Context crash aborts A read-only and requires fresh lifecycle evaluation for B", async () => {
  const issue = { document: receiptDocument(), actorId: "actor", authorityRef: "auth", baseline: "base", idempotencyKey: "idem-pre-context" };
  let failAbort = true;
  const binding = bindingLedgerFixture({ onAppend(entry) {
    if (entry.payload.status === "ABORTED" && failAbort) { failAbort = false; throw new Error("simulated crash before abort"); }
  } });
  let contextCalls = 0;
  const fixture = harness({ lifecycleBindingLedger: binding.ledger, contextFederation: {
    replayReceipt() { return { decision: "DENY", code: "DENY_CONTEXT_REPLAY_MISS" }; },
    issueReceipt(request) {
      contextCalls += 1;
      if (contextCalls === 1) return { decision: "DENY" };
      return { receiptId: request.document.receipt_id, projectId: request.document.project_id, version: 1, state: "ISSUED",
        boundWpVersion: 1, expiresAt: "2026-08-04T12:00:00.000Z", exclusions: [], replayed: false };
    }
  } });
  const first = await fixture.service.issueReceipt({ retrieval: retrieval(), issue });
  assert.equal(first.code, "DENY_UNIFY_BINDING_RECOVERY");
  const bindingA = binding.records[0].entry.payload.binding.binding_fingerprint;
  const callsAfterFirst = structuredClone(fixture.calls);

  const reconciled = await fixture.service.issueReceipt({ retrieval: retrieval(), issue });
  assert.equal(reconciled.code, "DENY_UNIFY_CONTEXT_NOT_ISSUED");
  assert.deepEqual(fixture.calls, { ...callsAfterFirst, fence: callsAfterFirst.fence + 1 });
  assert.equal(contextCalls, 1);

  const issued = await fixture.service.issueReceipt({ retrieval: retrieval(), issue });
  assert.equal(issued.state, "ISSUED");
  assert.notEqual(issued.sourceStateBinding.binding_fingerprint, bindingA);
  assert.equal(fixture.calls.lifecycle, callsAfterFirst.lifecycle + 1);
  assert.deepEqual(binding.records.map((record) => record.entry.payload.status),
    ["PREPARED", "ABORTED", "PREPARED", "COMMITTED"]);
});

test("atomic PREPARED reservation rejects an overlapping stale preflight before Context mutation", async () => {
  const issue = { document: receiptDocument(), actorId: "actor", authorityRef: "auth", baseline: "base", idempotencyKey: "idem-overlap" };
  const binding = bindingLedgerFixture();
  const first = harness({ lifecycleBindingLedger: binding.ledger });
  let secondContextCalls = 0;
  const second = harness({ lifecycleBindingLedger: binding.ledger,
    contextFederation: { issueReceipt() { secondContextCalls += 1; throw new Error("must not mutate"); } },
    lifecycleResolver: { async withIssuanceFence(request, callback) {
      const committedA = await first.service.issueReceipt({ retrieval: retrieval(), issue });
      assert.equal(committedA.state, "ISSUED");
      return callback({ ok: true, code: "MEMORY_BATCH_RESOLVED", project_id: request.project_id, layer: request.layer,
        evaluated_at: request.as_of, batch_fingerprint: canonicalFingerprint(request), ...fenceFields(),
        decisions: request.records.map((item) => effectiveDecision(request, item)) });
    } }
  });
  const deniedB = await second.service.issueReceipt({ retrieval: retrieval(), issue });
  assert.equal(deniedB.code, "DENY_UNIFY_BINDING_LEDGER");
  assert.equal(secondContextCalls, 0);
  assert.deepEqual(binding.records.map((record) => record.entry.payload.status), ["PREPARED", "COMMITTED"]);
});

test("timed-out issuance fence cannot invoke Context Federation later", async () => {
  const issue = { document: receiptDocument(), actorId: "actor",
    authorityRef: "auth", baseline: "base", idempotencyKey: "idem" };
  let federationCalls = 0;
  let lateCallback;
  const fixture = harness({ timeoutMs: 5, lifecycleResolver: { async withIssuanceFence(request, callback) {
    lateCallback = () => callback({ ok: true, code: "MEMORY_BATCH_RESOLVED", project_id: request.project_id,
      layer: request.layer, evaluated_at: request.as_of, batch_fingerprint: canonicalFingerprint(request), ...fenceFields(),
      decisions: request.records.map((item) => effectiveDecision(request, item)) });
    return new Promise(() => {});
  } }, contextFederation: { issueReceipt() { federationCalls += 1; throw new Error("must not run"); } } });
  assert.equal((await fixture.service.issueReceipt({ retrieval: retrieval(), issue })).code, "DENY_UNIFY_ISSUANCE_FENCE");
  lateCallback();
  assert.equal(federationCalls, 0);
});

test("a fence that stalls after Context mutation quarantines the provisional receipt", async () => {
  const issue = { document: receiptDocument(), actorId: "actor",
    authorityRef: "auth", baseline: "base", idempotencyKey: "idem" };
  let federationCalls = 0;
  let secondDisposition;
  const fixture = harness({ timeoutMs: 5, lifecycleResolver: { async withIssuanceFence(request, callback) {
    const batch = { ok: true, code: "MEMORY_BATCH_RESOLVED", project_id: request.project_id, layer: request.layer,
      evaluated_at: request.as_of, batch_fingerprint: canonicalFingerprint(request), ...fenceFields(),
      decisions: request.records.map((item) => effectiveDecision(request, item)) };
    callback(batch);
    secondDisposition = callback(batch);
    return new Promise(() => {});
  } }, contextFederation: { issueReceipt(request) { federationCalls += 1; return {
    receiptId: request.document.receipt_id, projectId: request.document.project_id, version: 1, state: "ISSUED",
    boundWpVersion: 1, expiresAt: "2026-08-04T12:00:00.000Z", exclusions: [], replayed: false
  }; } } });
  const quarantined = await fixture.service.issueReceipt({ retrieval: retrieval(), issue });
  assert.equal(quarantined.code, "DENY_UNIFY_BINDING_RECOVERY");
  assert.equal(quarantined.recovery_required, true);
  assert.equal(federationCalls, 1);
  assert.equal(secondDisposition.code, "DENY_UNIFY_FENCE_CALLBACK");
});

test("a post-callback lifecycle fence rejection never exposes the issued receipt", async () => {
  const issue = { document: receiptDocument(), actorId: "actor",
    authorityRef: "auth", baseline: "base", idempotencyKey: "idem-post-fence" };
  let federationCalls = 0;
  const binding = bindingLedgerFixture();
  const fixture = harness({ lifecycleBindingLedger: binding.ledger,
    lifecycleResolver: { async withIssuanceFence(request, callback) {
      const batch = { ok: true, code: "MEMORY_BATCH_RESOLVED", project_id: request.project_id, layer: request.layer,
        evaluated_at: request.as_of, batch_fingerprint: canonicalFingerprint(request), ...fenceFields(),
        decisions: request.records.map((item) => effectiveDecision(request, item)) };
      callback(batch);
      throw Object.assign(new Error("lifecycle head changed after callback"), { code: "MEMORY_BOUNDARY_HEAD_CHANGED" });
    } }, contextFederation: { issueReceipt(request) { federationCalls += 1; return {
      receiptId: request.document.receipt_id, projectId: request.document.project_id, version: 1, state: "ISSUED",
      boundWpVersion: 1, expiresAt: "2026-08-04T12:00:00.000Z", exclusions: [], replayed: false
    }; } } });
  const quarantined = await fixture.service.issueReceipt({ retrieval: retrieval(), issue });
  assert.equal(quarantined.code, "DENY_UNIFY_BINDING_RECOVERY");
  assert.equal(quarantined.recovery_required, true);
  assert.equal(federationCalls, 1);
  assert.deepEqual(binding.records.map((record) => record.entry.payload.status), ["PREPARED", "ABORTED"]);
});

test("failed post-fence ABORT persistence cannot recover PREPARED without a fresh authoritative fence", async () => {
  const issue = { document: receiptDocument(), actorId: "actor",
    authorityRef: "auth", baseline: "base", idempotencyKey: "idem-post-fence-abort-fail" };
  let fenceCalls = 0;
  let issueCalls = 0;
  let replayCalls = 0;
  const binding = bindingLedgerFixture({ onAppend(entry) {
    if (entry.payload.status === "ABORTED") throw new Error("simulated quarantine persistence failure");
  } });
  const lifecycleResolver = { async withIssuanceFence(request, callback) {
    fenceCalls += 1;
    const batch = { ok: true, code: "MEMORY_BATCH_RESOLVED", project_id: request.project_id, layer: request.layer,
      evaluated_at: request.as_of, batch_fingerprint: canonicalFingerprint(request), ...fenceFields(),
      decisions: request.records.map((item) => effectiveDecision(request, item)) };
    callback(batch);
    throw Object.assign(new Error("final lifecycle fence rejected"), { code: "MEMORY_BOUNDARY_HEAD_CHANGED" });
  } };
  const contextFederation = {
    issueReceipt(request) { issueCalls += 1; return { receiptId: request.document.receipt_id,
      projectId: request.document.project_id, version: 1, state: "ISSUED", boundWpVersion: 1,
      expiresAt: "2026-08-04T12:00:00.000Z", exclusions: [], replayed: false }; },
    replayReceipt(request) { replayCalls += 1; return { receiptId: request.document.receipt_id,
      projectId: request.document.project_id, version: 1, state: "ISSUED", boundWpVersion: 1,
      expiresAt: "2026-08-04T12:00:00.000Z", exclusions: [], replayed: true }; }
  };
  const fixture = harness({ lifecycleBindingLedger: binding.ledger, lifecycleResolver, contextFederation });
  assert.equal((await fixture.service.issueReceipt({ retrieval: retrieval(), issue })).code, "DENY_UNIFY_BINDING_RECOVERY");
  assert.deepEqual(binding.records.map((record) => record.entry.payload.status), ["PREPARED"]);
  assert.equal((await fixture.service.issueReceipt({ retrieval: retrieval(), issue })).code, "DENY_UNIFY_BINDING_RECOVERY");
  assert.deepEqual(binding.records.map((record) => record.entry.payload.status), ["PREPARED"]);
  assert.deepEqual({ fenceCalls, issueCalls, replayCalls }, { fenceCalls: 2, issueCalls: 1, replayCalls: 1 });
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

test("real authority gateway, provider, durable replay adapter, Context Federation, and binding ledger compose", async (t) => {
  const projectId = "project-1";
  const actorId = "engineer-1";
  const wpId = "wp-1";
  const baseline = "9".repeat(40);
  let nowMs = Date.parse(NOW);
  const clock = () => new Date(nowMs++);
  const dir = mkdtempSync(join(tmpdir(), "secb-unify-binding-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bindingHeadAnchor = new DurableHeadAnchor({ filePath: join(dir, "bindings-head.json"),
    ledgerId: "memory-context-bindings", integrityKey: Buffer.alloc(32, 0x53), initialize: true });
  const lifecycleBindingLedger = new DurableAnchoredLedger({ filePath: join(dir, "bindings.jsonl"),
    ledgerId: "memory-context-bindings", headAnchor: bindingHeadAnchor });
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
  const replayHeadAnchor = new DurableHeadAnchor({ filePath: join(dir, "context-replay-head.json"),
    ledgerId: "secb-context-replay-ledger", integrityKey: Buffer.alloc(32, 0x52), initialize: true });
  const durableReplay = new DurableContextReplayAdapter({ filePath: join(dir, "context-replay.ndjson"),
    contextFederation: federation, headAnchor: replayHeadAnchor });
  const lifecycleHead = new DurableHeadAnchor({ filePath: join(dir, "lifecycle-head.json"),
    ledgerId: "secb-memory-lifecycle-ledger", integrityKey: Buffer.alloc(32, 0x54), initialize: true });
  const lifecycleLedger = new MemoryLifecycleLedger({ filePath: join(dir, "lifecycle.jsonl"),
    integrityKey: Buffer.alloc(32, 0x55), headAnchor: lifecycleHead });
  const lifecycleAuthority = (expected) => ({ decision: "ALLOW", code: "ALLOW_MEMORY_LIFECYCLE", ...expected,
    decision_id: "lifecycle-real-1", actor_id: "governor-1", producer_actor_id: row.actor_id,
    reviewer_actor_id: "reviewer-1", approver_actor_id: "governor-1", work_package_id: wpId,
    session_id: "session-real-1", authority_ref: "authority:lifecycle-real",
    valid_from: "2026-08-01T00:00:00.000Z", valid_until: "2026-09-01T00:00:00.000Z" });
  const retention = (request) => ({ decision: "ALLOW", code: "ALLOW_RETENTION", decision_id: "retention-real-1",
    project_id: request.project_id, memory_record_id: request.memory_record_id,
    memory_record_version: request.memory_record_version, policy_id: request.policy_id,
    retain_until: "2026-09-01T00:00:00.000Z" });
  const composition = createMemoryLifecycleRuntimeComposition({ lifecycleLedger, lifecycleBindingLedger,
    memoryAuthorityGateway: authorityGateway, memoryCandidateProvider: provider, contextFederation: durableReplay,
    recordSource: () => [row], authoritySource: lifecycleAuthority, retentionSource: retention,
    evidenceSource: () => null, sodRules: { checkPairwiseDistinct }, now: clock });
  const { lifecycleResolver, unifiedService: unified } = composition;
  const lifecycleProbeRequest = { project_id: projectId, layer: "project", gateway_retrieved_at: NOW,
    gateway_authority_decision_id: "retrieval-real-1", as_of: NOW,
    records: [{ request_index: 0, memory_record_id: row.memory_record_id, memory_record_version: row.version,
      content_hash: row.content_hash, target_record_fingerprint: canonicalFingerprint(row) }] };
  const lifecycleProbe = await lifecycleResolver.resolveBatch(lifecycleProbeRequest);
  assert.equal(lifecycleProbe.decisions[0]?.ok, true, JSON.stringify(lifecycleProbe));
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
  assert.equal(durableReplay.verify().count, 1);
  const realAnchor = trustedAnchor(lifecycleBindingLedger);
  assert.equal(realAnchor.count, 2);
  assert.equal(verifyMemoryContextLifecycleBinding(issued.sourceStateBinding,
    lifecycleBindingLedger.read(), realAnchor), true);
});
