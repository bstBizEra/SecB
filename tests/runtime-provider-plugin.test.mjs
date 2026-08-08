import assert from "node:assert/strict";
import test from "node:test";
import * as publicApi from "../src/index.mjs";

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
import {
  RUFLO_ADAPTERS,
  RUFLO_CODER_ADAPTER,
  createRufloAdapterRegistration
} from "../src/registry/ruflo-adapters.mjs";
import { RegistryError, RuntimeRegistry } from "../src/registry/runtime-registry.mjs";

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
  assert.equal(publicApi.RufloCommandBridge, undefined, "legacy bridge must not be publicly exported");
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

test("concurrent identical registration shares one audit and one disposition", async () => {
  let audits = 0;
  const { instance } = registry({
    auditWriter: async () => {
      audits += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  });
  const request = {
    descriptor: RUFLO_RUNTIME_PROVIDER_PLUGIN,
    idempotency_key: "idem-concurrent-identical"
  };
  const [first, replay] = await Promise.all([
    instance.registerCandidate(request),
    instance.registerCandidate(request)
  ]);
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(audits, 1);
  assert.equal(instance.listCandidates().length, 1);
});

test("concurrent conflicting idempotency reuse is denied", async () => {
  let releaseAudit;
  const auditGate = new Promise((resolve) => { releaseAudit = resolve; });
  const { instance, audits } = registry({ auditWriter: async (entry) => {
    audits.push(entry);
    await auditGate;
  } });
  const first = instance.registerCandidate({
    descriptor: RUFLO_RUNTIME_PROVIDER_PLUGIN,
    idempotency_key: "idem-concurrent-conflict"
  });
  const conflicting = structuredClone(RUFLO_RUNTIME_PROVIDER_PLUGIN);
  conflicting.plugin_version = "0.1.1";
  await assert.rejects(
    instance.registerCandidate({ descriptor: conflicting, idempotency_key: "idem-concurrent-conflict" }),
    (error) => error instanceof RuntimeProviderPluginRegistryError && error.code === "DENY_IDEMPOTENCY_CONFLICT"
  );
  releaseAudit();
  await first;
  assert.equal(audits.length, 1);
  assert.equal(instance.listCandidates().length, 1);
});

test("failed audit releases the in-flight reservation for a safe retry", async () => {
  let auditAvailable = false;
  const { instance } = registry({ auditWriter: async () => {
    if (!auditAvailable) throw new Error("down");
  } });
  const request = {
    descriptor: RUFLO_RUNTIME_PROVIDER_PLUGIN,
    idempotency_key: "idem-reservation-cleanup"
  };
  await assert.rejects(instance.registerCandidate(request));
  auditAvailable = true;
  const result = await instance.registerCandidate(request);
  assert.equal(result.replayed, false);
  assert.equal(instance.listCandidates().length, 1);
});

function trustedRufloBinding() {
  return {
    resolved: true,
    plugin_id: RUFLO_RUNTIME_PROVIDER_PLUGIN.plugin_id,
    plugin_version: RUFLO_RUNTIME_PROVIDER_PLUGIN.plugin_version,
    descriptor_fingerprint: RUFLO_RUNTIME_PROVIDER_PLUGIN_FINGERPRINT,
    provider_id: RUFLO_RUNTIME_PROVIDER_PLUGIN.provider_id,
    runtime_product_id: RUFLO_RUNTIME_PROVIDER_PLUGIN.runtime_product_id,
    runtime_deployment_id: "RT-RUFLO-LOCAL-001",
    operationally_effective: false
  };
}

test("plugin-backed runtime registration requires exact SecB-owned binding", () => {
  const unresolved = new RuntimeRegistry();
  assert.throws(
    () => unresolved.register(RUFLO_CODER_ADAPTER),
    (error) => error instanceof RegistryError && error.code === "DENY_PLUGIN_BINDING_UNAVAILABLE"
  );

  const governed = new RuntimeRegistry({ runtimeProviderResolver: trustedRufloBinding });
  assert.deepEqual(governed.register(RUFLO_CODER_ADAPTER), {
    registered: true,
    agent_instance_id: RUFLO_CODER_ADAPTER.agent_instance_id,
    version: 1
  });
  assert.equal(governed.resolve(RUFLO_CODER_ADAPTER.agent_instance_id).quarantined, true);
});

test("Ruflo binding fields cannot be overridden or substituted", () => {
  assert.throws(
    () => createRufloAdapterRegistration(RUFLO_CODER_ADAPTER, { provider_id: "PROVIDER-HOSTILE" }),
    /cannot be overridden/
  );

  const substituted = structuredClone(RUFLO_CODER_ADAPTER);
  substituted.runtime_provider_plugin_version = "9.9.9";
  substituted.runtime_provider_plugin_fingerprint = "0".repeat(64);
  const governed = new RuntimeRegistry({ runtimeProviderResolver: trustedRufloBinding });
  assert.throws(
    () => governed.register(substituted),
    (error) => error instanceof RegistryError && error.code === "DENY_PLUGIN_BINDING_MISMATCH"
  );
});

test("plugin binding metadata is all-or-none and known Ruflo identity cannot strip it", () => {
  const bindingFields = [
    "runtime_provider_plugin_id",
    "runtime_provider_plugin_version",
    "runtime_provider_plugin_fingerprint"
  ];
  for (const retained of bindingFields) {
    const partial = structuredClone(RUFLO_CODER_ADAPTER);
    for (const field of bindingFields) {
      if (field !== retained) delete partial[field];
    }
    assert.throws(
      () => validateContract("agentRegistration", partial),
      (error) => error?.name === "ContractValidationError"
    );
  }

  const stripped = structuredClone(RUFLO_CODER_ADAPTER);
  for (const field of bindingFields) delete stripped[field];
  assert.deepEqual(validateContract("agentRegistration", stripped), {
    kind: "agentRegistration",
    valid: true
  });
  assert.throws(
    () => new RuntimeRegistry().register(stripped),
    (error) => error instanceof RegistryError && error.code === "DENY_PLUGIN_BINDING_REQUIRED"
  );
});

test("candidate plugin cannot become operational and effectiveness is rechecked on resolve", () => {
  let effective = false;
  const runtime = new RuntimeRegistry({
    runtimeProviderResolver: () => ({
      ...trustedRufloBinding(),
      operationally_effective: effective
    })
  });
  runtime.register(RUFLO_CODER_ADAPTER);
  assert.throws(
    () => runtime.transitionEvaluation(RUFLO_CODER_ADAPTER.agent_instance_id, "APPROVED"),
    (error) => error instanceof RegistryError && error.code === "DENY_PLUGIN_NOT_EFFECTIVE"
  );

  effective = true;
  runtime.transitionEvaluation(RUFLO_CODER_ADAPTER.agent_instance_id, "APPROVED");
  runtime.transitionLifecycle(RUFLO_CODER_ADAPTER.agent_instance_id, "ACTIVE");
  assert.equal(runtime.resolve(RUFLO_CODER_ADAPTER.agent_instance_id).resolved, true);

  effective = false;
  assert.deepEqual(runtime.resolve(RUFLO_CODER_ADAPTER.agent_instance_id), {
    resolved: false,
    quarantined: true,
    reason: "DENY_PLUGIN_NOT_EFFECTIVE"
  });
});
