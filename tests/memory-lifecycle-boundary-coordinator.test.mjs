import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryLifecycleBoundaryCoordinator } from "../src/services/memory-lifecycle-boundary-coordinator.mjs";

const ZERO = "0".repeat(64);

function fixture() {
  let head = { valid: true, ledgerId: "secb-memory-lifecycle-ledger", count: 0, headHash: ZERO };
  const coordinator = createMemoryLifecycleBoundaryCoordinator({ lifecycleLedger: {
    verify: () => ({ ...head }), withBoundaryLease: (operation) => operation()
  },
    recordSource: (request) => [{ memory_record_id: request.memory_record_id }],
    authoritySource: (request) => ({ decision: "ALLOW", ...request }),
    retentionSource: (request) => ({ decision: "ALLOW", ...request }),
    evidenceSource: (request) => ({ decision: "ACCEPTED", ...request }) });
  return { coordinator, advance() { head = { ...head, count: 1, headHash: "a".repeat(64) }; } };
}

test("one coordinator owns issuance plus nested lifecycle resolution", async () => {
  const { coordinator } = fixture();
  const request = { project_id: "project-1" };
  const result = await coordinator.withIssuanceFence(request, async (fence) => {
    assert.equal(fence.lifecycle_sequence, 0);
    assert.equal(fence.lifecycle_head_hash, ZERO);
    assert.match(fence.fence_revision, /^[a-f0-9]{64}$/);
    return coordinator.withResolutionFence({ input: { memory_record_id: "mem-1" },
      retention_request: { policy_id: "retain" }, authority_expected: { phase: "COMMIT" } }, (snapshot) => snapshot);
  });
  assert.equal(result.records[0].memory_record_id, "mem-1");
  assert.equal(result.retention.policy_id, "retain");
  assert.equal(result.authority.phase, "COMMIT");
});

test("head movement inside issuance is denied and overlapping owners fail closed", async () => {
  const first = fixture();
  await assert.rejects(first.coordinator.withIssuanceFence({}, async () => { first.advance(); return "issued"; }),
    (error) => error.code === "MEMORY_BOUNDARY_HEAD_CHANGED");

  const second = fixture();
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const owner = second.coordinator.withIssuanceFence({}, async () => held);
  await assert.rejects(second.coordinator.withIssuanceFence({}, async () => "competing"),
    (error) => error.code === "MEMORY_BOUNDARY_BUSY");
  release("done");
  assert.equal(await owner, "done");
});

test("standalone resolution detects head drift while mutation fence may advance it", () => {
  const resolution = fixture();
  assert.throws(() => resolution.coordinator.withResolutionFence({ input: { memory_record_id: "mem-1" },
    retention_request: {}, authority_expected: {} }, () => { resolution.advance(); return "allow"; }),
  (error) => error.code === "MEMORY_BOUNDARY_HEAD_CHANGED");

  const mutation = fixture();
  const result = mutation.coordinator.withMutationFence({ input: { memory_record_id: "mem-1" },
    evidence_expected: {}, authority_expected: {}, active_legal_hold_count: 0 }, () => { mutation.advance(); return "recorded"; });
  assert.equal(result, "recorded");
});

test("head-read failure releases coordinator ownership for a later retry", async () => {
  let fail = true;
  const coordinator = createMemoryLifecycleBoundaryCoordinator({ lifecycleLedger: { verify() {
    if (fail) { fail = false; throw new Error("head unavailable"); }
    return { valid: true, ledgerId: "secb-memory-lifecycle-ledger", count: 0, headHash: ZERO };
  }, withBoundaryLease: (operation) => operation() }, recordSource: () => [], authoritySource: () => ({}),
  retentionSource: () => ({}), evidenceSource: () => ({}) });
  await assert.rejects(coordinator.withIssuanceFence({}, async () => "never"), /unavailable/);
  assert.equal(await coordinator.withIssuanceFence({}, async () => "retried"), "retried");
});
