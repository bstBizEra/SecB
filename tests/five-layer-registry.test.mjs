/**
 * SecB 5-Layer Registry & Model Policy Router Unit Tests
 * 
 * Verifies:
 *  - Layer 1: ProviderRegistry (OpenAI, Anthropic, Google, Moonshot)
 *  - Layer 2: ModelRegistry
 *  - Layer 3: RuntimeRegistryFiveLayer lifecycle state transitions
 *             (DISCOVERED -> INSPECTED -> CONFORMANCE_PENDING -> APPROVAL_PENDING -> ACTIVE)
 *  - Layer 4: AgentRegistryFiveLayer
 *  - Layer 5: SessionRegistry
 *  - ModelPolicyRouter role-based selection & SoD exclusion
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ProviderRegistry,
  ModelRegistry,
  RuntimeRegistryFiveLayer,
  AgentRegistryFiveLayer,
  SessionRegistry,
  ModelPolicyRouter
} from "../src/registry/five-layer-registry.mjs";

test("AC-5L-01: ProviderRegistry registers and queries vendors", () => {
  const reg = new ProviderRegistry();
  reg.registerProvider({ provider_id: "openai", name: "OpenAI", vendor: "OpenAI Inc." });
  reg.registerProvider({ provider_id: "google", name: "Google AI", vendor: "Google LLC" });

  assert.equal(reg.getProvider("openai").name, "OpenAI");
  assert.equal(reg.listProviders().length, 2);
});

test("AC-5L-02: ModelRegistry registers models and filters by provider", () => {
  const reg = new ModelRegistry();
  reg.registerModel({ model_id: "gpt-4o", provider_id: "openai", name: "GPT-4o", context_window: 128000 });
  reg.registerModel({ model_id: "gemini-3.6-pro", provider_id: "google", name: "Gemini 3.6 Pro", context_window: 1000000 });

  assert.equal(reg.getModel("gpt-4o").context_window, 128000);
  assert.equal(reg.listModelsByProvider("google").length, 1);
});

test("AC-5L-03: RuntimeRegistryFiveLayer enforces discovery-to-activation lifecycle", () => {
  const reg = new RuntimeRegistryFiveLayer();
  const rt = reg.registerRuntime({
    runtime_id: "runtime.codex.local",
    provider_id: "openai",
    harness: "codex-cli",
    executable: "codex",
    supported_roles: ["implementer"]
  });

  assert.equal(rt.status, "DISCOVERED");

  // Stepwise onboarding
  const s1 = reg.transitionStatus("runtime.codex.local", "INSPECTED");
  assert.equal(s1.status, "INSPECTED");

  const s2 = reg.transitionStatus("runtime.codex.local", "CONFORMANCE_PENDING");
  assert.equal(s2.status, "CONFORMANCE_PENDING");

  const s3 = reg.transitionStatus("runtime.codex.local", "APPROVAL_PENDING");
  assert.equal(s3.status, "APPROVAL_PENDING");

  const s4 = reg.transitionStatus("runtime.codex.local", "ACTIVE");
  assert.equal(s4.status, "ACTIVE");
});

test("AC-5L-04: RuntimeRegistryFiveLayer denies illegal lifecycle transitions", () => {
  const reg = new RuntimeRegistryFiveLayer();
  reg.registerRuntime({ runtime_id: "rt-1", provider_id: "p1", harness: "h1", executable: "e1" });

  assert.throws(
    () => reg.transitionStatus("rt-1", "ACTIVE"), // Cannot jump DISCOVERED -> ACTIVE directly
    /Cannot transition runtime/
  );
});

test("AC-5L-05: AgentRegistryFiveLayer and SessionRegistry track sessions", () => {
  const agentReg = new AgentRegistryFiveLayer();
  agentReg.registerAgent({
    agent_id: "codex-impl-01",
    runtime_id: "runtime.codex.local",
    role: "implementer"
  });

  const sessReg = new SessionRegistry();
  const sess = sessReg.createSession({
    session_id: "SESS-001",
    agent_id: "codex-impl-01",
    work_package_id: "WP-001",
    worktree_root: "C:/worktrees/WP-001"
  });

  assert.equal(sess.state, "STARTED");

  const ended = sessReg.updateSessionState("SESS-001", "COMPLETED");
  assert.equal(ended.state, "COMPLETED");
  assert.ok(ended.ended_at);
});

test("AC-5L-06: ModelPolicyRouter selects agent and respects exclusion (SoD)", () => {
  const agentReg = new AgentRegistryFiveLayer();
  agentReg.registerAgent({ agent_id: "codex-impl-01", runtime_id: "rt-codex", role: "implementer" });
  agentReg.registerAgent({ agent_id: "claude-impl-01", runtime_id: "rt-claude", role: "implementer" });

  const router = new ModelPolicyRouter({ agentRegistry: agentReg });

  // Normal selection
  const choice1 = router.selectAgentForRole({ role: "implementer" });
  assert.equal(choice1.agent_id, "codex-impl-01");

  // SoD exclusion — excluding codex-impl-01 forces fallback to claude-impl-01
  const choice2 = router.selectAgentForRole({ role: "implementer", exclude_agent_id: "codex-impl-01" });
  assert.equal(choice2.agent_id, "claude-impl-01");
});
