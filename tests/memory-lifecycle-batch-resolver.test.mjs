import assert from "node:assert/strict";
import test from "node:test";

import { canonicalFingerprint } from "../src/contracts/canonical-fingerprint.mjs";
import { createMemoryLifecycleBatchResolver } from "../src/services/memory-lifecycle-batch-resolver.mjs";

const NOW = "2026-08-03T12:00:00.000Z";
const HEAD = "a".repeat(64);
const REVISION = "b".repeat(64);
const record = (index = 0, overrides = {}) => ({ request_index: index, memory_record_id: `mem-${index + 1}`,
  memory_record_version: 1, content_hash: "c".repeat(64), target_record_fingerprint: "d".repeat(64), ...overrides });
const request = (records = [record()]) => ({ project_id: "project-1", layer: "project",
  gateway_retrieved_at: NOW, gateway_authority_decision_id: "gateway-authority-1", as_of: NOW, records });

function outcome(item, overrides = {}) {
  return { ok: true, code: "MEMORY_EFFECTIVE", project_id: "project-1", layer: "project",
    memory_record_id: item.memory_record_id, memory_record_version: item.memory_record_version,
    content_hash: item.content_hash, target_record_fingerprint: item.target_record_fingerprint,
    authority_decision_id: "lifecycle-authority-1", state_fingerprint: "e".repeat(64),
    evaluated_at: NOW, lifecycle_sequence: 0, lifecycle_head_hash: HEAD,
    active_legal_hold_count: 0, preservation_required: false, ...overrides };
}

function fixture(resolve = (input) => outcome(record(Number(input.memory_record_id.slice(4)) - 1))) {
  let fenceCalls = 0;
  const resolver = createMemoryLifecycleBatchResolver({ lifecycleService: { resolve }, now: () => new Date(NOW),
    issuanceCoordinator: { async withIssuanceFence(input, callback) {
      fenceCalls += 1;
      return callback({ fence_revision: REVISION, lifecycle_head_hash: HEAD, lifecycle_sequence: 0 });
    } } });
  return { resolver, fenceCalls: () => fenceCalls };
}

test("batch receipt binds one concrete fence revision and lifecycle head", async () => {
  const rows = [record(0), record(1)];
  const { resolver, fenceCalls } = fixture((input) => outcome(rows.find((row) => row.memory_record_id === input.memory_record_id)));
  const result = await resolver.resolveBatch(request(rows));
  assert.equal(result.ok, true);
  assert.equal(result.fence_revision, REVISION);
  assert.equal(result.lifecycle_head_hash, HEAD);
  assert.ok(result.decisions.every((decision) => decision.lifecycle_head_hash === HEAD));
  assert.equal(result.batch_fingerprint, canonicalFingerprint(request(rows)));
  assert.equal(fenceCalls(), 1);
});

test("mixed lifecycle heads fail the entire batch instead of becoming subtractive exclusions", async () => {
  const rows = [record(0), record(1)];
  const { resolver } = fixture((input) => outcome(rows.find((row) => row.memory_record_id === input.memory_record_id),
    input.memory_record_id === "mem-2" ? { lifecycle_head_hash: "f".repeat(64) } : {}));
  const result = await resolver.resolveBatch(request(rows));
  assert.equal(result.ok, false);
  assert.equal(result.code, "DENY_MEMORY_BATCH_HEAD_MISMATCH");
});

test("gateway instant and authority identity are canonical and bounded", async () => {
  const { resolver, fenceCalls } = fixture();
  for (const malformed of [
    { ...request(), gateway_retrieved_at: "August 3 2026" },
    { ...request(), gateway_retrieved_at: "2026-08-03T12:00:01.000Z" },
    { ...request(), gateway_authority_decision_id: "" },
    { ...request(), gateway_authority_decision_id: "x".repeat(513) }
  ]) {
    const result = await resolver.resolveBatch(malformed);
    assert.equal(result.code, "DENY_MEMORY_BATCH_REQUEST");
  }
  assert.equal(fenceCalls(), 0);
});

test("hostile request and lifecycle-result accessors are contained without mutation", async () => {
  const requestProxy = new Proxy({}, { getPrototypeOf() { throw new Error("request trap"); } });
  const safe = fixture();
  assert.equal((await safe.resolver.resolveBatch(requestProxy)).code, "DENY_MEMORY_BATCH_REQUEST");
  let reads = 0;
  const poisoned = fixture(() => {
    const result = outcome(record());
    Object.defineProperty(result, "ok", { enumerable: true, get() { reads += 1; throw new Error("result trap"); } });
    return result;
  });
  const denied = await poisoned.resolver.resolveBatch(request());
  assert.equal(denied.ok, true);
  assert.equal(denied.decisions[0].ok, false);
  assert.equal(reads, 1);
});
