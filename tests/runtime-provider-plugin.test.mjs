import assert from "node:assert/strict";
import test from "node:test";

import { validateContract } from "../src/contracts/contract-validator.mjs";
import {
  RuntimeProviderPluginRegistry,
  RuntimeProviderPluginRegistryError
} from "../src/runtime/runtime-provider-plugin-registry.mjs";
import { canonicalFingerprint } from "../src/contracts/canonical-fingerprint.mjs";
import {
  RUFLO_RUNTIME_PROVIDER_PLUGIN,
  RUFLO_RUNTIME_PROVIDER_PLUGIN_FINGERPRINT,
  RufloRuntimeProviderCandidate
} from "../src/runtime/providers/ruflo-runtime-provider-plugin.mjs";
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
  assert.equal(
    RUFLO_RUNTIME_PROVIDER_PLUGIN_FINGERPRINT,
    canonicalFingerprint(RUFLO_RUNTIME_PROVIDER_PLUGIN)
  );
  assert.equal(
    RUFLO_RUNTIME_PROVIDER_PLUGIN.implementation.export_name,
    "RufloRuntimeProviderCandidate"
  );
  const candidate = new RufloRuntimeProviderCandidate();
  assert.deepEqual(candidate.describe(), RUFLO_RUNTIME_PROVIDER_PLUGIN);
  for (const forbidden of ["dispatch", "createBridge", "activate", "authorize", "appendEvidence"]) {
    assert.equal(candidate[forbidden], undefined, `${forbidden} must not exist on the inert candidate`);
  }
});

test("Ruflo agent adapters bind to the provider plugin without gaining authority", () => {
  for (const adapter of Object.values(RUFLO_ADAPTERS)) {
    assert.equal(adapter.runtime_provider_plugin_id, "runtime-provider-ruflo");
    assert.equal(adapter.runtime_provider_plugin_version, RUFLO_RUNTIME_PROVIDER_PLUGIN.plugin_version);
    assert.equal(adapter.runtime_provider_plugin_fingerprint, RUFLO_RUNTIME_PROVIDER_PLUGIN_FINGERPRINT);
    assert.equal(adapter.provider_id, RUFLO_RUNTIME_PROVIDER_PLUGIN.provider_id);
    assert.equal(adapter.runtime_deployment_id, "RT-RUFLO-LOCAL-001");
    assert.equal(adapter.evaluation_status, "CANDIDATE");
    assert.equal(adapter.lifecycle_state, "PENDING");
    assert.deepEqual(validateContract("agentRegistration", adapter), {
      kind: "agentRegistration",
      valid: true
    });
  }
});

test("candidate registration is audit-first, immutable, and explicitly non-effective", async () => {
  const order = [];
  const instance = new RuntimeProviderPluginRegistry({
    auditWriter: () => order.push("audit"),
    now: () => FIXED_NOW
  });
  const result = await instance.registerCandidate({
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

test("idempotent replay is stable and conflicting replay fails closed", async () => {
  const { instance, audits } = registry();
  const request = {
    descriptor: RUFLO_RUNTIME_PROVIDER_PLUGIN,
    idempotency_key: "idem-ruflo-plugin-002"
  };
  const first = await instance.registerCandidate(request);
  const replay = await instance.registerCandidate(request);
  assert.equal(first.descriptor_fingerprint, replay.descriptor_fingerprint);
  assert.equal(replay.replayed, true);
  assert.equal(audits.length, 1, "replay must not duplicate the registration audit");

  const conflicting = structuredClone(RUFLO_RUNTIME_PROVIDER_PLUGIN);
  conflicting.plugin_version = "0.1.1";
  await assert.rejects(
    instance.registerCandidate({ descriptor: conflicting, idempotency_key: request.idempotency_key }),
    (error) => error instanceof RuntimeProviderPluginRegistryError && error.code === "DENY_IDEMPOTENCY_CONFLICT"
  );
});

test("audit failure and malformed time leave the registry empty", async () => {
  const auditDown = new RuntimeProviderPluginRegistry({
    auditWriter: () => { throw new Error("down"); },
    now: () => FIXED_NOW
  });
  await assert.rejects(
    auditDown.registerCandidate({ descriptor: RUFLO_RUNTIME_PROVIDER_PLUGIN, idempotency_key: "idem-audit-down" }),
    (error) => error instanceof RuntimeProviderPluginRegistryError && error.code === "DENY_AUDIT_UNAVAILABLE"
  );
  assert.equal(auditDown.listCandidates().length, 0);

  const badClock = registry({ now: () => new Date("invalid") }).instance;
  await assert.rejects(
    badClock.registerCandidate({ descriptor: RUFLO_RUNTIME_PROVIDER_PLUGIN, idempotency_key: "idem-bad-clock" }),
    (error) => error instanceof RuntimeProviderPluginRegistryError && error.code === "DENY_CLOCK_UNAVAILABLE"
  );
  assert.equal(badClock.listCandidates().length, 0);

  const wrongClockType = registry({ now: () => "2026-08-02T00:00:00Z" }).instance;
  await assert.rejects(
    wrongClockType.registerCandidate({ descriptor: RUFLO_RUNTIME_PROVIDER_PLUGIN, idempotency_key: "idem-wrong-clock-type" }),
    (error) => error instanceof RuntimeProviderPluginRegistryError && error.code === "DENY_CLOCK_UNAVAILABLE"
  );
  assert.equal(wrongClockType.listCandidates().length, 0);
});

test("DRAFT descriptors validate as proposals but cannot enter the candidate registry", async () => {
  const draft = structuredClone(RUFLO_RUNTIME_PROVIDER_PLUGIN);
  draft.candidate_status = "DRAFT";
  assert.doesNotThrow(() => validateContract("runtimeProviderPlugin", draft));
  const { instance } = registry();
  await assert.rejects(
    instance.registerCandidate({ descriptor: draft, idempotency_key: "idem-draft" }),
    (error) => error instanceof RuntimeProviderPluginRegistryError && error.code === "DENY_PLUGIN_NOT_CANDIDATE"
  );
});

test("rejected asynchronous audit leaves the registry empty", async () => {
  const { instance } = registry({
    auditWriter: async () => { throw new Error("async audit down"); }
  });
  await assert.rejects(
    instance.registerCandidate({
      descriptor: RUFLO_RUNTIME_PROVIDER_PLUGIN,
      idempotency_key: "idem-async-audit-down"
    }),
    (error) => error instanceof RuntimeProviderPluginRegistryError && error.code === "DENY_AUDIT_UNAVAILABLE"
  );
  assert.equal(instance.listCandidates().length, 0);
});

test("an identical replay does not depend on a second clock read", async () => {
  let reads = 0;
  const { instance } = registry({
    now: () => {
      reads += 1;
      if (reads > 1) throw new Error("clock unavailable after registration");
      return FIXED_NOW;
    }
  });
  const request = {
    descriptor: RUFLO_RUNTIME_PROVIDER_PLUGIN,
    idempotency_key: "idem-clock-independent-replay"
  };
  await instance.registerCandidate(request);
  const replay = await instance.registerCandidate(request);
  assert.equal(replay.replayed, true);
  assert.equal(reads, 1);
});

test("implementation module traversal is rejected", async () => {
  const traversal = structuredClone(RUFLO_RUNTIME_PROVIDER_PLUGIN);
  traversal.implementation.module = "src/../../attacker.mjs";
  assert.throws(
    () => validateContract("runtimeProviderPlugin", traversal),
    (error) => error?.name === "ContractValidationError"
  );
  const { instance } = registry();
  await assert.rejects(
    instance.registerCandidate({ descriptor: traversal, idempotency_key: "idem-traversal" }),
    (error) => error instanceof RuntimeProviderPluginRegistryError
  );
  assert.equal(instance.listCandidates().length, 0);
});
