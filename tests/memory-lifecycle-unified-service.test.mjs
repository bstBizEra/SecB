import assert from "node:assert/strict";
import test from "node:test";

import {
  createMemoryLifecycleUnifiedService,
  MemoryLifecycleUnifiedConfigurationError
} from "../src/index.mjs";

const HASH = "a".repeat(64);

function record(overrides = {}) {
  return {
    project_id: "project-1", layer: "project", memory_record_id: "mem-1", version: 1,
    content_hash: HASH, statement: "memory", ...overrides
  };
}

function harness(overrides = {}) {
  const rows = overrides.rows ?? [record()];
  const calls = { lifecycle: 0, provider: 0, federation: 0 };
  const memoryGateway = overrides.memoryGateway ?? {
    retrieve() {
      return { decision: "ALLOW", code: "RETRIEVED", retrieved_at: "2026-08-03T12:00:00.000Z",
        records: rows.map((row) => ({ data_untrusted: true, record: row })), next_cursor: null };
    }
  };
  const lifecycleResolver = overrides.lifecycleResolver ?? {
    async resolve(request) {
      calls.lifecycle += 1;
      return { ok: true, code: "MEMORY_EFFECTIVE", project_id: request.project_id, layer: request.layer,
        memory_record_id: request.memory_record_id, memory_record_version: request.memory_record_version,
        content_hash: rows.find((row) => row.memory_record_id === request.memory_record_id)?.content_hash };
    }
  };
  const memoryCandidateProvider = overrides.memoryCandidateProvider ?? {
    toCandidateSources(query) {
      calls.provider += 1;
      return { decision: "ALLOW", code: "MEMORY_SOURCES_PROJECTED", data_untrusted: true,
        project_id: query.project_id, retrieved_at: "2026-08-03T12:00:00.000Z",
        sources: query.records.map((row) => ({ id: row.memory_record_id, kind: "memory" })),
        exclusions: [], accounting: { requested: query.records.length, included: query.records.length, excluded: 0 } };
    }
  };
  const contextFederation = overrides.contextFederation ?? {
    issueReceipt(request) { calls.federation += 1; return { code: "ISSUED", candidate_ids: request.candidateSources.map((source) => source.id) }; }
  };
  return { calls, service: createMemoryLifecycleUnifiedService({ memoryGateway, lifecycleResolver, memoryCandidateProvider, contextFederation }) };
}

const retrieval = (overrides = {}) => ({ project_id: "project-1", scope_project_id: "project-1", layer: "project", ...overrides });

test("construction requires all four unified ports", () => {
  for (const missing of ["memoryGateway", "lifecycleResolver", "memoryCandidateProvider", "contextFederation"]) {
    const ports = {
      memoryGateway: { retrieve() {} }, lifecycleResolver: { resolve() {} },
      memoryCandidateProvider: { toCandidateSources() {} }, contextFederation: { issueReceipt() {} }
    };
    delete ports[missing];
    assert.throws(() => createMemoryLifecycleUnifiedService(ports), MemoryLifecycleUnifiedConfigurationError);
  }
});

test("gateway records reach the provider only after the one shared lifecycle resolver allows them", async () => {
  const { service, calls } = harness();
  const result = await service.retrieveCandidateSources(retrieval());
  assert.equal(result.code, "MEMORY_LIFECYCLE_UNIFIED");
  assert.deepEqual(result.sources, [{ id: "mem-1", kind: "memory" }]);
  assert.deepEqual(calls, { lifecycle: 1, provider: 1, federation: 0 });
  assert.deepEqual(result.accounting, { requested: 1, lifecycle_effective: 1, included: 1, excluded: 0 });
});

test("terminal lifecycle decisions are subtractive and never reach the provider", async () => {
  let providerRecords;
  const { service } = harness({
    lifecycleResolver: { async resolve() { return { ok: false, code: "DENY_MEMORY_TOMBSTONED" }; } },
    memoryCandidateProvider: { toCandidateSources(query) {
      providerRecords = query.records;
      return { decision: "ALLOW", code: "MEMORY_SOURCES_PROJECTED", data_untrusted: true, project_id: query.project_id,
        retrieved_at: "2026-08-03T12:00:00.000Z", sources: [], exclusions: [], accounting: { requested: 0, included: 0, excluded: 0 } };
    } }
  });
  const result = await service.retrieveCandidateSources(retrieval());
  assert.deepEqual(providerRecords, []);
  assert.equal(result.exclusions[0].code, "DENY_MEMORY_TOMBSTONED");
  assert.deepEqual(result.accounting, { requested: 1, lifecycle_effective: 0, included: 0, excluded: 1 });
});

test("malformed or substituted lifecycle ALLOW fails closed before projection", async () => {
  for (const decision of [
    { ok: true, code: "MEMORY_EFFECTIVE" },
    { ok: true, code: "MEMORY_EFFECTIVE", project_id: "other", layer: "project", memory_record_id: "mem-1", memory_record_version: 1, content_hash: HASH }
  ]) {
    const { service, calls } = harness({ lifecycleResolver: { async resolve() { return decision; } } });
    assert.ok(["DENY_UNIFY_LIFECYCLE_BINDING", "DENY_UNIFY_LIFECYCLE"].includes((await service.retrieveCandidateSources(retrieval())).code));
    assert.equal(calls.provider, 0);
  }
});

test("Context Federation receives only the candidates produced by the unified lifecycle path", async () => {
  const { service, calls } = harness();
  const issued = await service.issueReceipt({ retrieval: retrieval(), issue: { document: { source_references: ["mem-1"] }, actorId: "agent" } });
  assert.deepEqual(issued, { code: "ISSUED", candidate_ids: ["mem-1"] });
  assert.deepEqual(calls, { lifecycle: 1, provider: 1, federation: 1 });
  const bypass = await service.issueReceipt({ retrieval: retrieval(), issue: { candidateSources: [{ id: "smuggled" }] } });
  assert.equal(bypass.code, "DENY_UNIFY_ISSUE_REQUEST");
});
