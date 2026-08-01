import assert from "node:assert/strict";
import test from "node:test";

import { validateContract } from "../src/contracts/contract-validator.mjs";
import {
  RuntimeProviderPluginRegistry,
  RuntimeProviderPluginRegistryError
} from "../src/runtime/runtime-provider-plugin-registry.mjs";
import { RUFLO_RUNTIME_PROVIDER_PLUGIN } from "../src/runtime/providers/ruflo-runtime-provider-plugin.mjs";
import { RUFLO_ADAPTERS } from "../src/registry/ruflo-adapters.mjs";

const FIXED_NOW = new Date("2026-08-02T00:00:00.000Z");

function registry(overrides = {}) {
  const audits = [];
  const instance = new RuntimeProviderPluginRegistry({
    auditWriter: (entry) => audits.push(entry),
    now: () => FIXED_NOW,
    ...overrides
  });
  return { instance, audits };
}

test("Ruflo is a valid harness-neutral runtime provider plugin descriptor", () => {
  assert.deepEqual(validateContract("runtimeProviderPlugin", RUFLO_RUNTIME_PROVIDER_PLUGIN), {
    kind: "runtimeProviderPlugin",
    valid: true
  });
  assert.equal(RUFLO_RUNTIME_PROVIDER_PLUGIN.plugin_id, "runtime-provider-ruflo");
  assert.equal(RUFLO_RUNTIME_PROVIDER_PLUGIN.boundaries.authority_source, "SECB");
  for (const [key, value] of Object.entries(RUFLO_RUNTIME_PROVIDER_PLUGIN.boundaries)) {
    if (key !== "authority_source") assert.equal(value, false, `${key} must remain false`);
  }
  assert.equal(RUFLO_RUNTIME_PROVIDER_PLUGIN.ui.mode, "projection");
  assert.equal(RUFLO_RUNTIME_PROVIDER_PLUGIN.security.output_trust, "UNTRUSTED_CANDIDATE");
});

test("Ruflo agent adapters bind to the provider plugin without gaining authority", () => {
  for (const adapter of Object.values(RUFLO_ADAPTERS)) {
    assert.equal(adapter.runtime_provider_plugin_id, "runtime-provider-ruflo");
    assert.equal(adapter.evaluation_status, "CANDIDATE");
    assert.equal(adapter.lifecycle_state, "PENDING");
  }
});

test("candidate registration is audit-first, immutable, and explicitly non-effective", () => {
  const order = [];
  const instance = new RuntimeProviderPluginRegistry({
    auditWriter: () => order.push("audit"),
    now: () => FIXED_NOW
  });
  const result = instance.registerCandidate({
    descriptor: RUFLO_RUNTIME_PROVIDER_PLUGIN,
    idempotency_key: "idem-ruflo-plugin-001"
  });
  order.push("returned");

  assert.deepEqual(order, ["audit", "returned"]);
  assert.equal(result.status, "CANDIDATE");
  assert.equal(result.operationally_effective, false);
  assert.equal(result.replayed, false);
  assert.equal(result.registered_at, FIXED_NOW.toISOString());
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.descriptor));
  assert.equal(instance.listCandidates().length, 1);
});

test("the candidate registry exposes no promotion, activation, authority, or evidence-acceptance API", () => {
  const { instance } = registry();
  for (const forbidden of ["promote", "activate", "authorize", "acceptEvidence", "resolveForExecution"]) {
    assert.equal(instance[forbidden], undefined, `${forbidden} must not exist on the candidate registry`);
  }
});

test("idempotent replay is stable and conflicting replay fails closed", () => {
  const { instance, audits } = registry();
  const request = {
    descriptor: RUFLO_RUNTIME_PROVIDER_PLUGIN,
    idempotency_key: "idem-ruflo-plugin-002"
  };
  const first = instance.registerCandidate(request);
  const replay = instance.registerCandidate(request);
  assert.equal(first.descriptor_fingerprint, replay.descriptor_fingerprint);
  assert.equal(replay.replayed, true);
  assert.equal(audits.length, 1, "replay must not duplicate the registration audit");

  const conflicting = structuredClone(RUFLO_RUNTIME_PROVIDER_PLUGIN);
  conflicting.plugin_version = "0.1.1";
  assert.throws(
    () => instance.registerCandidate({ descriptor: conflicting, idempotency_key: request.idempotency_key }),
    (error) => error instanceof RuntimeProviderPluginRegistryError && error.code === "DENY_IDEMPOTENCY_CONFLICT"
  );
});

test("audit failure and malformed time leave the registry empty", () => {
  const auditDown = new RuntimeProviderPluginRegistry({
    auditWriter: () => { throw new Error("down"); },
    now: () => FIXED_NOW
  });
  assert.throws(
    () => auditDown.registerCandidate({ descriptor: RUFLO_RUNTIME_PROVIDER_PLUGIN, idempotency_key: "idem-audit-down" }),
    (error) => error instanceof RuntimeProviderPluginRegistryError && error.code === "DENY_AUDIT_UNAVAILABLE"
  );
  assert.equal(auditDown.listCandidates().length, 0);

  const badClock = registry({ now: () => new Date("invalid") }).instance;
  assert.throws(
    () => badClock.registerCandidate({ descriptor: RUFLO_RUNTIME_PROVIDER_PLUGIN, idempotency_key: "idem-bad-clock" }),
    (error) => error instanceof RuntimeProviderPluginRegistryError && error.code === "DENY_CLOCK_UNAVAILABLE"
  );
  assert.equal(badClock.listCandidates().length, 0);

  const wrongClockType = registry({ now: () => "2026-08-02T00:00:00Z" }).instance;
  assert.throws(
    () => wrongClockType.registerCandidate({ descriptor: RUFLO_RUNTIME_PROVIDER_PLUGIN, idempotency_key: "idem-wrong-clock-type" }),
    (error) => error instanceof RuntimeProviderPluginRegistryError && error.code === "DENY_CLOCK_UNAVAILABLE"
  );
  assert.equal(wrongClockType.listCandidates().length, 0);
});

test("DRAFT descriptors validate as proposals but cannot enter the candidate registry", () => {
  const draft = structuredClone(RUFLO_RUNTIME_PROVIDER_PLUGIN);
  draft.candidate_status = "DRAFT";
  assert.doesNotThrow(() => validateContract("runtimeProviderPlugin", draft));
  const { instance } = registry();
  assert.throws(
    () => instance.registerCandidate({ descriptor: draft, idempotency_key: "idem-draft" }),
    (error) => error instanceof RuntimeProviderPluginRegistryError && error.code === "DENY_PLUGIN_NOT_CANDIDATE"
  );
});
