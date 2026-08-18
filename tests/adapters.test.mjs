import assert from "node:assert/strict";
import test from "node:test";
import {
  CLAUDE_CODE_ADAPTER,
  CODEX_ADAPTER,
  GEMINI_CLI_ADAPTER,
  KIMI_CLI_ADAPTER,
  GENERIC_ADAPTER,
  KNOWN_ADAPTERS,
  createAdapterRegistration
} from "../src/registry/adapters.mjs";
import { RuntimeRegistry } from "../src/registry/runtime-registry.mjs";

test("Claude Code adapter has correct provider and product identity", () => {
  assert.equal(CLAUDE_CODE_ADAPTER.provider_id, "anthropic");
  assert.equal(CLAUDE_CODE_ADAPTER.runtime_product_id, "claude-code");
  assert.equal(CLAUDE_CODE_ADAPTER.authority_ceiling, "A0");
  assert.deepEqual(CLAUDE_CODE_ADAPTER.permitted_roles, ["ENGIN"]);
});

test("Codex adapter has correct provider and product identity", () => {
  assert.equal(CODEX_ADAPTER.provider_id, "openai");
  assert.equal(CODEX_ADAPTER.runtime_product_id, "codex-cli");
  assert.equal(CODEX_ADAPTER.authority_ceiling, "A0");
  assert.deepEqual(CODEX_ADAPTER.permitted_roles, ["ENGIN"]);
});

test("Generic adapter has no permitted roles and minimal capabilities", () => {
  assert.equal(GENERIC_ADAPTER.provider_id, "generic");
  assert.deepEqual(GENERIC_ADAPTER.permitted_roles, []);
  assert.deepEqual(GENERIC_ADAPTER.approved_models, []);
  assert.deepEqual(GENERIC_ADAPTER.approved_tools, []);
});

test("all adapters start as CANDIDATE/PENDING", () => {
  for (const adapter of Object.values(KNOWN_ADAPTERS)) {
    assert.equal(adapter.evaluation_status, "CANDIDATE");
    assert.equal(adapter.lifecycle_state, "PENDING");
  }
});

test("all adapters are frozen", () => {
  for (const adapter of Object.values(KNOWN_ADAPTERS)) {
    assert.throws(() => { adapter.provider_id = "mutated"; },
    TypeError);
  }
});

test("KNOWN_ADAPTERS maps product names to their adapters", () => {
  assert.equal(KNOWN_ADAPTERS["claude-code"], CLAUDE_CODE_ADAPTER);
  assert.equal(KNOWN_ADAPTERS["codex-cli"], CODEX_ADAPTER);
  assert.equal(KNOWN_ADAPTERS["gemini-cli"], GEMINI_CLI_ADAPTER);
  assert.equal(KNOWN_ADAPTERS["kimi-cli"], KIMI_CLI_ADAPTER);
  assert.equal(KNOWN_ADAPTERS["generic-agent"], GENERIC_ADAPTER);
  assert.equal(Object.keys(KNOWN_ADAPTERS).length, 5);
});

test("createAdapterRegistration produces a unique registerable record", () => {
  const reg = new RuntimeRegistry();
  const record = createAdapterRegistration(CLAUDE_CODE_ADAPTER, {
    agent_instance_id: "inst_claude_session_42"
  });
  assert.equal(record.evaluation_status, "CANDIDATE");
  assert.equal(record.lifecycle_state, "PENDING");
  assert.equal(record.agent_instance_id, "inst_claude_session_42");
  const result = reg.register(record);
  assert.equal(result.registered, true);
});

test("createAdapterRegistration always resets to CANDIDATE/PENDING even if overrides try otherwise", () => {
  const record = createAdapterRegistration(CLAUDE_CODE_ADAPTER, {
    agent_instance_id: "inst_forced",
    evaluation_status: "APPROVED",
    lifecycle_state: "ACTIVE"
  });
  assert.equal(record.evaluation_status, "CANDIDATE");
  assert.equal(record.lifecycle_state, "PENDING");
});

test("all known adapters register and resolve through the full lifecycle", () => {
  const reg = new RuntimeRegistry();
  for (const [name, base] of Object.entries(KNOWN_ADAPTERS)) {
    const record = createAdapterRegistration(base, {
      agent_instance_id: `inst_lifecycle_${name}`
    });
    reg.register(record);
    reg.transitionEvaluation(`inst_lifecycle_${name}`, "APPROVED");
    reg.transitionLifecycle(`inst_lifecycle_${name}`, "ACTIVE");
    const resolution = reg.resolve(`inst_lifecycle_${name}`);
    assert.equal(resolution.resolved, true, `${name} should resolve after APPROVED+ACTIVE`);
    assert.equal(resolution.identity.runtime_product_id, base.runtime_product_id);
  }
});

test("ADR-0002: product name does not grant authority — ceiling stays A0", () => {
  for (const adapter of Object.values(KNOWN_ADAPTERS)) {
    assert.equal(adapter.authority_ceiling, "A0");
  }
});
