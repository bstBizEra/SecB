import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { canonicalFingerprint } from "../src/contracts/canonical-fingerprint.mjs";
import { checkPairwiseDistinct } from "../src/control/sod-rules.mjs";
import { mintReceiptDocument } from "../src/services/context-federation-service.mjs";
import { createMemoryCandidateProvider } from "../src/services/memory-candidate-provider.mjs";
import { createMemoryContextSourceService, MemoryContextSourceConfigurationError } from "../src/services/memory-context-source-service.mjs";
import { createMemoryGateway } from "../src/services/memory-gateway-service.mjs";
import { createSqliteMemoryRecordStore } from "../src/services/sqlite-memory-record-store.mjs";
import * as packageRoot from "../src/index.mjs";

const NOW = new Date("2026-07-20T10:00:00.000Z");
const PROJECT = "proj-memory-integration";
const allowScope = () => ({ decision: "ALLOW", decision_id: "scope-1", project_id: PROJECT });
const allowActivation = () => ({
  decision: "ALLOW",
  decision_id: "gov-memory-candidate-1",
  capability: "memory-context-retrieval",
  project_id: PROJECT,
  layer: "session"
});

function candidateSource(id = "memory-1") {
  return {
    id,
    kind: "memory",
    project_id: PROJECT,
    classification: "INTERNAL",
    verified: true,
    current: true,
    resolvable: true,
    relevance: 0.9,
    provenance: { origin: "KnowledgeLedger", retrieved_at: NOW.toISOString(), content_hash: "a".repeat(64) }
  };
}

function retrievedRecord(overrides = {}) {
  return {
    memory_record_id: "memory-1",
    version: 1,
    project_id: PROJECT,
    work_package_id: "wp-memory-1",
    session_id: "session-memory-1",
    actor_id: "agent-memory-producer",
    layer: "session",
    statement: "Bound memory candidate",
    classification: "INTERNAL",
    confidence: 0.9,
    source: "KnowledgeLedger",
    provenance: { evidence_refs: ["evidence-memory-1"], origin_record_id: "knowledge-1" },
    content_hash: "a".repeat(64),
    valid_from: "2026-07-20T09:00:00.000Z",
    valid_until: "2026-07-20T11:00:00.000Z",
    retention_policy: "retain-30-days",
    admitted_at: NOW.toISOString(),
    ...overrides
  };
}

function service(overrides = {}) {
  const calls = { gateway: 0, provider: 0 };
  const memoryGateway = {
    retrieve(query) {
      calls.gateway += 1;
      void query;
      return {
        decision: "ALLOW",
        code: "RETRIEVED",
        retrieved_at: NOW.toISOString(),
        records: [{ data_untrusted: true, record: retrievedRecord() }],
        next_cursor: null
      };
    }
  };
  const memoryCandidateProvider = {
    toCandidateSources(query) {
      calls.provider += 1;
      return {
        decision: "ALLOW",
        code: "MEMORY_SOURCES_PROJECTED",
        data_untrusted: true,
        project_id: PROJECT,
        retrieved_at: NOW.toISOString(),
        sources: [candidateSource()],
        exclusions: [],
        accounting: {
          requested: 1,
          included: 1,
          excluded: 0,
          ...(query.token_budget === undefined ? {} : { token_budget: query.token_budget, tokens_used: 1 })
        }
      };
    }
  };
  const instance = createMemoryContextSourceService({ memoryGateway, memoryCandidateProvider, ...overrides });
  return { instance, calls, memoryGateway, memoryCandidateProvider };
}

test("construction snapshots the two Memory ports and exposes one frozen method", () => {
  const hasCode = (code) => (error) => error instanceof MemoryContextSourceConfigurationError && error.code === code;
  assert.throws(() => createMemoryContextSourceService(), hasCode("INVALID_MEMORY_GATEWAY"));
  assert.throws(() => createMemoryContextSourceService({ memoryGateway: {}, memoryCandidateProvider: {} }), hasCode("INVALID_MEMORY_GATEWAY"));
  assert.throws(() => createMemoryContextSourceService({ memoryGateway: { retrieve() {} }, memoryCandidateProvider: {} }), hasCode("INVALID_MEMORY_PROVIDER"));
  assert.throws(() => createMemoryContextSourceService({ memoryGateway: { retrieve() {} }, memoryCandidateProvider: { toCandidateSources() {} }, scopeResolver: true }), hasCode("INVALID_SCOPE_RESOLVER"));
  assert.throws(() => createMemoryContextSourceService({ memoryGateway: { retrieve() {} }, memoryCandidateProvider: { toCandidateSources() {} }, activationResolver: true }), hasCode("INVALID_ACTIVATION_RESOLVER"));
  const { instance } = service();
  assert.ok(Object.isFrozen(instance));
  assert.deepEqual(Object.keys(instance), ["retrieveCandidateSources"]);
  assert.equal(packageRoot.createMemoryContextSourceService, createMemoryContextSourceService);
  assert.equal(packageRoot.MemoryContextSourceConfigurationError, MemoryContextSourceConfigurationError);
  assert.equal(packageRoot.createMemoryGateway, createMemoryGateway);
  assert.equal(packageRoot.createMemoryCandidateProvider, createMemoryCandidateProvider);
  assert.equal(packageRoot.createSqliteMemoryRecordStore, createSqliteMemoryRecordStore);
  assert.equal(Object.prototype.hasOwnProperty.call(packageRoot, "resolveUniqueScopedCursorAnchor"), false);
});

test("post-construction replacement of Memory port methods cannot alter the composition", () => {
  const built = service({ scopeResolver: allowScope, activationResolver: allowActivation });
  built.memoryGateway.retrieve = () => { throw new Error("replacement gateway"); };
  built.memoryCandidateProvider.toCandidateSources = () => { throw new Error("replacement provider"); };
  assert.equal(built.instance.retrieveCandidateSources({ project_id: PROJECT, layer: "session" }).decision, "ALLOW");
});

test("default resolvers deny before Memory retrieval or projection", () => {
  const { instance, calls } = service();
  const result = instance.retrieveCandidateSources({ project_id: PROJECT, layer: "session" });
  assert.equal(result.code, "DENY_MEMORY_SCOPE_UNRESOLVED");
  assert.deepEqual(calls, { gateway: 0, provider: 0 });
});

test("activation denial stops before the gateway", () => {
  const { instance, calls } = service({ scopeResolver: allowScope });
  const result = instance.retrieveCandidateSources({ project_id: PROJECT, layer: "session" });
  assert.equal(result.code, "DENY_MEMORY_NOT_EFFECTIVE");
  assert.deepEqual(calls, { gateway: 0, provider: 0 });
});

test("server-derived scope is passed to the gateway and caller scope smuggling is rejected", () => {
  let observed;
  const memoryGateway = {
    retrieve(query) {
      observed = query;
      return { decision: "DENY", code: "DENY_CROSS_PROJECT", reason: "scope mismatch" };
    }
  };
  const instance = createMemoryContextSourceService({
    memoryGateway,
    memoryCandidateProvider: { toCandidateSources() { throw new Error("must not run"); } },
    scopeResolver: allowScope,
    activationResolver: allowActivation
  });
  const denied = instance.retrieveCandidateSources({ project_id: "proj-other", layer: "session" });
  assert.equal(denied.code, "DENY_MEMORY_SCOPE_MISMATCH");
  assert.equal(observed, undefined);
  assert.equal(instance.retrieveCandidateSources({ project_id: PROJECT, scope_project_id: PROJECT, layer: "session" }).code, "DENY_MALFORMED_REQUEST");
});

test("request and resolver fields are captured once and hostile values fail closed", () => {
  const reads = new Map();
  const request = {};
  for (const [key, value] of Object.entries({ project_id: PROJECT, layer: "session", limit: 10, cursor: "abc", token_budget: 20 })) {
    Object.defineProperty(request, key, {
      enumerable: true,
      get() {
        reads.set(key, (reads.get(key) ?? 0) + 1);
        return key === "project_id" && reads.get(key) > 1 ? "proj-other" : value;
      }
    });
  }
  let scopeProjectReads = 0;
  let activationProjectReads = 0;
  const { instance } = service({
    scopeResolver: () => ({
      decision: "ALLOW",
      decision_id: "scope-1",
      get project_id() { scopeProjectReads += 1; return scopeProjectReads === 1 ? PROJECT : "proj-other"; }
    }),
    activationResolver: () => ({
      decision: "ALLOW",
      decision_id: "activation-1",
      capability: "memory-context-retrieval",
      get project_id() { activationProjectReads += 1; return activationProjectReads === 1 ? PROJECT : "proj-other"; },
      layer: "session"
    })
  });
  const result = instance.retrieveCandidateSources(request);
  assert.equal(result.decision, "ALLOW");
  assert.deepEqual(Object.fromEntries(reads), { project_id: 1, layer: 1, limit: 1, cursor: 1, token_budget: 1 });
  assert.equal(scopeProjectReads, 1);
  assert.equal(activationProjectReads, 1);
  const hostile = new Proxy({}, { ownKeys() { throw new Error("hostile request"); } });
  assert.equal(instance.retrieveCandidateSources(hostile).code, "DENY_MALFORMED_REQUEST");
});

test("gateway and provider denials are contained with typed integration stages", () => {
  const gatewayDenied = createMemoryContextSourceService({
    memoryGateway: { retrieve: () => ({ decision: "DENY", code: "DENY_STORE_UNAVAILABLE" }) },
    memoryCandidateProvider: { toCandidateSources() { throw new Error("must not run"); } },
    scopeResolver: allowScope,
    activationResolver: allowActivation
  }).retrieveCandidateSources({ project_id: PROJECT, layer: "session" });
  assert.deepEqual(
    { code: gatewayDenied.code, stage: gatewayDenied.stage, upstream: gatewayDenied.upstream_code },
    { code: "DENY_MEMORY_RETRIEVAL", stage: "gateway", upstream: "DENY_STORE_UNAVAILABLE" }
  );

  const providerDenied = createMemoryContextSourceService({
    memoryGateway: { retrieve: () => ({ decision: "ALLOW", code: "RETRIEVED", retrieved_at: NOW.toISOString(), records: [], next_cursor: null }) },
    memoryCandidateProvider: { toCandidateSources: () => ({ decision: "DENY", code: "DENY_CLOCK_UNAVAILABLE" }) },
    scopeResolver: allowScope,
    activationResolver: allowActivation
  }).retrieveCandidateSources({ project_id: PROJECT, layer: "session" });
  assert.deepEqual(
    { code: providerDenied.code, stage: providerDenied.stage, upstream: providerDenied.upstream_code },
    { code: "DENY_MEMORY_PROJECTION", stage: "provider", upstream: "DENY_CLOCK_UNAVAILABLE" }
  );
});

test("a provider source rejected by the typed port denies the whole projection", () => {
  const { instance } = service({
    scopeResolver: allowScope,
    activationResolver: allowActivation,
    memoryCandidateProvider: {
      toCandidateSources: () => ({
        decision: "ALLOW",
        code: "MEMORY_SOURCES_PROJECTED",
        data_untrusted: true,
        project_id: PROJECT,
        retrieved_at: NOW.toISOString(),
        sources: [candidateSource(), { ...candidateSource("bad"), classification: "UNKNOWN" }],
        exclusions: [{ ref: "provider-cut", stage: "memory-provider", reason: "BUDGET_EXCEEDED" }],
        accounting: { requested: 2, included: 2, excluded: 1 }
      })
    }
  });
  const result = instance.retrieveCandidateSources({ project_id: PROJECT, layer: "session" });
  assert.equal(result.code, "DENY_MEMORY_PROVENANCE_BINDING");
  assert.equal(result.stage, "provider-binding");
});

test("valid provider exclusions remain explicit and outputs are deeply frozen", () => {
  const { instance } = service({
    scopeResolver: allowScope,
    activationResolver: allowActivation,
    memoryCandidateProvider: {
      toCandidateSources: ({ token_budget }) => ({
        decision: "ALLOW",
        code: "MEMORY_SOURCES_PROJECTED",
        data_untrusted: true,
        project_id: PROJECT,
        retrieved_at: NOW.toISOString(),
        sources: [],
        exclusions: [{ ref: "memory-1", stage: "memory-provider", reason: "BUDGET_EXCEEDED" }],
        accounting: { requested: 1, included: 0, excluded: 1, token_budget, tokens_used: 0 }
      })
    }
  });
  const result = instance.retrieveCandidateSources({ project_id: PROJECT, layer: "session", token_budget: 1 });
  assert.equal(result.decision, "ALLOW");
  assert.equal(result.candidate_sources.length, 0);
  assert.deepEqual(result.exclusions.map((entry) => entry.stage), ["memory-provider"]);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.candidate_sources));
  assert.throws(() => result.candidate_sources.push({}), TypeError);
});

test("provider additions, substitutions, duplicates, silent drops, and accounting drift deny", () => {
  const gatewayFor = (records) => ({
    retrieve: () => ({
      decision: "ALLOW",
      code: "RETRIEVED",
      retrieved_at: NOW.toISOString(),
      records: records.map((record) => ({ data_untrusted: true, record })),
      next_cursor: null
    })
  });
  const providerFor = (sources, exclusions = [], accounting = { requested: 1, included: sources.length, excluded: exclusions.length }) => ({
    toCandidateSources: () => ({
      decision: "ALLOW",
      code: "MEMORY_SOURCES_PROJECTED",
      data_untrusted: true,
      project_id: PROJECT,
      retrieved_at: NOW.toISOString(),
      sources,
      exclusions,
      accounting
    })
  });
  const cases = [
    ["zero-to-one addition", [], providerFor([candidateSource()], [], { requested: 0, included: 1, excluded: 0 })],
    ["id substitution", [retrievedRecord()], providerFor([candidateSource("substituted")])],
    ["hash substitution", [retrievedRecord()], providerFor([{ ...candidateSource(), provenance: { ...candidateSource().provenance, content_hash: "b".repeat(64) } }])],
    ["cross-project substitution", [retrievedRecord()], providerFor([{ ...candidateSource(), project_id: "proj-other" }])],
    ["non-memory kind", [retrievedRecord()], providerFor([{ ...candidateSource(), kind: "knowledge" }])],
    ["classification substitution", [retrievedRecord()], providerFor([{ ...candidateSource(), classification: "CONFIDENTIAL" }])],
    ["origin substitution", [retrievedRecord()], providerFor([{ ...candidateSource(), provenance: { ...candidateSource().provenance, origin: "OutcomeLedger" } }])],
    ["confidence substitution", [retrievedRecord()], providerFor([{ ...candidateSource(), relevance: 0.1 }])],
    ["currency substitution", [retrievedRecord()], providerFor([{ ...candidateSource(), current: false }])],
    ["duplicate addition", [retrievedRecord()], providerFor([candidateSource(), candidateSource()], [], { requested: 1, included: 2, excluded: 0 })],
    ["silent drop", [retrievedRecord()], providerFor([], [], { requested: 1, included: 0, excluded: 0 })],
    ["fabricated exclusion", [retrievedRecord()], providerFor([], [{ ref: "fabricated", stage: "memory-provider", reason: "BUDGET_EXCEEDED" }], { requested: 1, included: 0, excluded: 1 })],
    ["accounting drift", [retrievedRecord()], providerFor([candidateSource()], [], { requested: 99, included: 1, excluded: 0 })]
  ];
  for (const [label, records, memoryCandidateProvider] of cases) {
    const result = createMemoryContextSourceService({
      memoryGateway: gatewayFor(records),
      memoryCandidateProvider,
      scopeResolver: allowScope,
      activationResolver: allowActivation
    }).retrieveCandidateSources({ project_id: PROJECT, layer: "session" });
    assert.equal(result.code, "DENY_MEMORY_PROVENANCE_BINDING", label);
  }
});

test("E2E: admitted SQLite memory becomes a Context Receipt source only through effective server gates", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "secb-memory-context-"));
  const store = createSqliteMemoryRecordStore({ databasePath: join(directory, "memory.sqlite") });
  t.after(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const recordFor = (memoryRecordId) => ({
    memory_record_id: memoryRecordId,
    version: 1,
    project_id: PROJECT,
    work_package_id: "wp-memory-1",
    session_id: "session-memory-1",
    actor_id: "agent-memory-producer",
    source: "KnowledgeLedger",
    statement: "A governed memory source for Context Federation",
    classification: "INTERNAL",
    confidence: 0.95,
    provenance: { evidence_refs: ["evidence-memory-1"], origin_record_id: "knowledge-1" },
    valid_from: "2026-07-20T09:00:00.000Z",
    valid_until: "2026-07-20T11:00:00.000Z",
    retention_policy: "retain-30-days"
  });
  const gateway = createMemoryGateway({
    layerStores: { session: { store, admission: { classificationCeiling: "CONFIDENTIAL", ttlMs: 60_000, sod: "producer-only" } } },
    sodRules: { checkPairwiseDistinct },
    now: () => NOW,
    ledgerWriter: () => ({ audited: true }),
    cursorMacKey: Buffer.alloc(32, 0x49)
  });
  for (const memoryRecordId of ["memory-e2e-1", "memory-e2e-2"]) {
    const record = recordFor(memoryRecordId);
    record.content_hash = canonicalFingerprint({ ...record, layer: "session" });
    const admitted = await gateway.admit({ layer: "session", record, admission: { producer: "agent-memory-producer" } });
    assert.equal(admitted.decision, "ALLOW");
  }

  const integration = createMemoryContextSourceService({
    memoryGateway: gateway,
    memoryCandidateProvider: createMemoryCandidateProvider({ now: () => NOW }),
    scopeResolver: allowScope,
    activationResolver: allowActivation
  });
  const firstPage = integration.retrieveCandidateSources({ project_id: PROJECT, layer: "session", limit: 1, token_budget: 100 });
  assert.equal(firstPage.decision, "ALLOW");
  assert.deepEqual(firstPage.candidate_sources.map((entry) => entry.ref), ["memory-e2e-1"]);
  assert.notEqual(firstPage.next_cursor, null);
  assert.deepEqual(firstPage.accounting, {
    retrieved: 1,
    provider_included: 1,
    provider_excluded: 0,
    port_included: 1,
    port_excluded: 0
  });
  const secondPage = integration.retrieveCandidateSources({
    project_id: PROJECT,
    layer: "session",
    limit: 1,
    token_budget: 100,
    cursor: firstPage.next_cursor
  });
  assert.equal(secondPage.decision, "ALLOW");
  assert.deepEqual(secondPage.candidate_sources.map((entry) => entry.ref), ["memory-e2e-2"]);
  assert.equal(secondPage.next_cursor, null);

  const minted = mintReceiptDocument({
    receipt_id: "receipt-memory-e2e",
    project_id: PROJECT,
    objective_id: "objective-memory-e2e",
    work_package_id: "wp-memory-1",
    session_id: "session-memory-1",
    assigned_role: "REV",
    authority_scope: ["src/services"],
    baseline_version: "03190d0b27e6421b74314107a9a2d92577f21750",
    acceptance_criteria: ["memory source remains project scoped"],
    allowed_tools: ["read"],
    allowed_skills: [],
    evidence_obligations: ["memory-integration-evidence"],
    freshness_timestamp: NOW.toISOString(),
    candidateSources: [...firstPage.candidate_sources, ...secondPage.candidate_sources],
    classificationCeiling: "INTERNAL",
    include_exclusions_digest: true
  });
  assert.deepEqual(minted.document.source_references, ["memory-e2e-1", "memory-e2e-2"]);
});
