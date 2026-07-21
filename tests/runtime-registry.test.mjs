import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  RuntimeRegistry,
  RegistryError,
  AUTHORITY_LEVELS,
  EVALUATION_TRANSITIONS,
  LIFECYCLE_TRANSITIONS
} from "../src/registry/runtime-registry.mjs";

const fixturesDir = resolve(import.meta.dirname, "fixtures");
const validRegistration = JSON.parse(readFileSync(resolve(fixturesDir, "valid", "agent-registration.json"), "utf8"));
const badCeiling = JSON.parse(readFileSync(resolve(fixturesDir, "invalid", "agent-registration-bad-ceiling.json"), "utf8"));

function registration(overrides = {}) {
  return { ...validRegistration, ...overrides };
}

// --- Registration ---

test("a valid CANDIDATE/PENDING registration succeeds", () => {
  const reg = new RuntimeRegistry();
  const result = reg.register(registration());
  assert.equal(result.registered, true);
  assert.equal(result.agent_instance_id, "inst_claude_001");
  assert.equal(reg.size, 1);
});

test("duplicate instance ID is rejected", () => {
  const reg = new RuntimeRegistry();
  reg.register(registration());
  assert.throws(
    () => reg.register(registration()),
    (err) => err instanceof RegistryError && err.code === "DENY_DUPLICATE_INSTANCE"
  );
});

test("schema-invalid record is rejected", () => {
  const reg = new RuntimeRegistry();
  assert.throws(
    () => reg.register({ provider_id: "x" }),
    (err) => err instanceof RegistryError && err.code === "DENY_INVALID_REGISTRATION"
  );
});

test("non-CANDIDATE evaluation_status on registration is rejected", () => {
  const reg = new RuntimeRegistry();
  assert.throws(
    () => reg.register(registration({ evaluation_status: "APPROVED" })),
    (err) => err instanceof RegistryError && err.code === "DENY_INITIAL_STATUS"
  );
});

test("non-PENDING lifecycle_state on registration is rejected", () => {
  const reg = new RuntimeRegistry();
  assert.throws(
    () => reg.register(registration({ lifecycle_state: "ACTIVE" })),
    (err) => err instanceof RegistryError && err.code === "DENY_INITIAL_STATE"
  );
});

// --- Authority ceiling enforcement ---

test("authority ceiling exceeding policy ceiling is rejected", () => {
  const reg = new RuntimeRegistry({ policyCeiling: "A0" });
  assert.throws(
    () => reg.register(registration({
      agent_instance_id: "inst_high_ceiling",
      authority_ceiling: "A5"
    })),
    (err) => err instanceof RegistryError && err.code === "DENY_CEILING_EXCEEDED"
  );
});

test("authority ceiling within policy ceiling is accepted", () => {
  const reg = new RuntimeRegistry({ policyCeiling: "A2" });
  const result = reg.register(registration({ authority_ceiling: "A1" }));
  assert.equal(result.registered, true);
});

test("invalid policy ceiling on construction throws", () => {
  assert.throws(
    () => new RuntimeRegistry({ policyCeiling: "A9" }),
    (err) => err instanceof RegistryError && err.code === "INVALID_POLICY_CEILING"
  );
});

// --- Resolve (V-019: approved adapter works, unknown/untrusted quarantined) ---

test("V-019 positive: approved and active adapter resolves identity", () => {
  const reg = new RuntimeRegistry();
  reg.register(registration());
  reg.transitionEvaluation("inst_claude_001", "APPROVED");
  reg.transitionLifecycle("inst_claude_001", "ACTIVE");

  const result = reg.resolve("inst_claude_001");
  assert.equal(result.resolved, true);
  assert.equal(result.quarantined, false);
  assert.equal(result.identity.provider_id, "anthropic");
  assert.equal(result.identity.runtime_product_id, "claude-code");
  assert.deepEqual(result.identity.permitted_roles, ["ENGIN"]);
  assert.equal(result.identity.authority_ceiling, "A0");
});

test("V-019 negative: unknown instance is quarantined", () => {
  const reg = new RuntimeRegistry();
  const result = reg.resolve("inst_nonexistent");
  assert.equal(result.resolved, false);
  assert.equal(result.quarantined, true);
  assert.match(result.reason, /Unknown/);
});

test("V-019 negative: CANDIDATE (unapproved) adapter is quarantined", () => {
  const reg = new RuntimeRegistry();
  reg.register(registration());
  const result = reg.resolve("inst_claude_001");
  assert.equal(result.resolved, false);
  assert.equal(result.quarantined, true);
  assert.match(result.reason, /CANDIDATE/);
});

test("V-019 negative: PENDING (inactive) adapter is quarantined", () => {
  const reg = new RuntimeRegistry();
  reg.register(registration());
  reg.transitionEvaluation("inst_claude_001", "APPROVED");
  const result = reg.resolve("inst_claude_001");
  assert.equal(result.resolved, false);
  assert.equal(result.quarantined, true);
  assert.match(result.reason, /PENDING/);
});

test("V-019 negative: suspended adapter is quarantined", () => {
  const reg = new RuntimeRegistry();
  reg.register(registration());
  reg.transitionEvaluation("inst_claude_001", "APPROVED");
  reg.transitionLifecycle("inst_claude_001", "ACTIVE");
  reg.transitionEvaluation("inst_claude_001", "SUSPENDED");

  const result = reg.resolve("inst_claude_001");
  assert.equal(result.resolved, false);
  assert.equal(result.quarantined, true);
});

test("V-019 negative: revoked adapter is quarantined", () => {
  const reg = new RuntimeRegistry();
  reg.register(registration());
  reg.transitionEvaluation("inst_claude_001", "REVOKED");

  const result = reg.resolve("inst_claude_001");
  assert.equal(result.resolved, false);
  assert.equal(result.quarantined, true);
});

// --- Evaluation transitions ---

test("CANDIDATE to APPROVED succeeds", () => {
  const reg = new RuntimeRegistry();
  reg.register(registration());
  const result = reg.transitionEvaluation("inst_claude_001", "APPROVED");
  assert.equal(result.previous, "CANDIDATE");
  assert.equal(result.current, "APPROVED");
});

test("CANDIDATE to SUSPENDED is denied", () => {
  const reg = new RuntimeRegistry();
  reg.register(registration());
  assert.throws(
    () => reg.transitionEvaluation("inst_claude_001", "SUSPENDED"),
    (err) => err instanceof RegistryError && err.code === "DENY_EVALUATION_TRANSITION"
  );
});

test("REVOKED is terminal for evaluation", () => {
  const reg = new RuntimeRegistry();
  reg.register(registration());
  reg.transitionEvaluation("inst_claude_001", "REVOKED");
  assert.throws(
    () => reg.transitionEvaluation("inst_claude_001", "APPROVED"),
    (err) => err instanceof RegistryError && err.code === "DENY_EVALUATION_TRANSITION"
  );
});

test("SUSPENDED can be re-approved", () => {
  const reg = new RuntimeRegistry();
  reg.register(registration());
  reg.transitionEvaluation("inst_claude_001", "APPROVED");
  reg.transitionEvaluation("inst_claude_001", "SUSPENDED");
  const result = reg.transitionEvaluation("inst_claude_001", "APPROVED");
  assert.equal(result.current, "APPROVED");
});

// --- Lifecycle transitions ---

test("PENDING to ACTIVE succeeds", () => {
  const reg = new RuntimeRegistry();
  reg.register(registration());
  const result = reg.transitionLifecycle("inst_claude_001", "ACTIVE");
  assert.equal(result.previous, "PENDING");
  assert.equal(result.current, "ACTIVE");
});

test("ACTIVE to DEACTIVATED succeeds", () => {
  const reg = new RuntimeRegistry();
  reg.register(registration());
  reg.transitionLifecycle("inst_claude_001", "ACTIVE");
  const result = reg.transitionLifecycle("inst_claude_001", "DEACTIVATED");
  assert.equal(result.current, "DEACTIVATED");
});

test("TERMINATED is terminal for lifecycle", () => {
  const reg = new RuntimeRegistry();
  reg.register(registration());
  reg.transitionLifecycle("inst_claude_001", "TERMINATED");
  assert.throws(
    () => reg.transitionLifecycle("inst_claude_001", "ACTIVE"),
    (err) => err instanceof RegistryError && err.code === "DENY_LIFECYCLE_TRANSITION"
  );
});

test("transition on unknown instance throws", () => {
  const reg = new RuntimeRegistry();
  assert.throws(
    () => reg.transitionEvaluation("ghost", "APPROVED"),
    (err) => err instanceof RegistryError && err.code === "DENY_UNKNOWN_INSTANCE"
  );
  assert.throws(
    () => reg.transitionLifecycle("ghost", "ACTIVE"),
    (err) => err instanceof RegistryError && err.code === "DENY_UNKNOWN_INSTANCE"
  );
});

// --- Lookup ---

test("get returns null for unregistered instance", () => {
  const reg = new RuntimeRegistry();
  assert.equal(reg.get("nonexistent"), null);
});

test("get returns frozen registration for known instance", () => {
  const reg = new RuntimeRegistry();
  reg.register(registration());
  const entry = reg.get("inst_claude_001");
  assert.equal(entry.provider_id, "anthropic");
  assert.throws(() => { entry.provider_id = "x"; });
});

test("listByProduct filters correctly", () => {
  const reg = new RuntimeRegistry();
  reg.register(registration());
  reg.register(registration({ agent_instance_id: "inst_codex_001", runtime_product_id: "codex" }));
  assert.equal(reg.listByProduct("claude-code").length, 1);
  assert.equal(reg.listByProduct("codex").length, 1);
  assert.equal(reg.listByProduct("unknown").length, 0);
});

test("listByProvider filters correctly", () => {
  const reg = new RuntimeRegistry();
  reg.register(registration());
  reg.register(registration({ agent_instance_id: "inst_other", provider_id: "openai" }));
  assert.equal(reg.listByProvider("anthropic").length, 1);
  assert.equal(reg.listByProvider("openai").length, 1);
});

test("listByDeployment filters correctly", () => {
  const reg = new RuntimeRegistry();
  reg.register(registration());
  assert.equal(reg.listByDeployment("claude-code-local-001").length, 1);
  assert.equal(reg.listByDeployment("none").length, 0);
});

// --- Registration is a deep copy, not a reference ---

test("mutations to the input object do not affect the registry", () => {
  const reg = new RuntimeRegistry();
  const input = registration();
  reg.register(input);
  input.owner = "attacker";
  assert.equal(reg.get("inst_claude_001").owner, "secb-operator");
});

// --- Exported constants ---

test("AUTHORITY_LEVELS is ordered A0 through A5", () => {
  assert.deepEqual(AUTHORITY_LEVELS, ["A0", "A1", "A2", "A3", "A4", "A5"]);
});

test("EVALUATION_TRANSITIONS has terminal REVOKED", () => {
  assert.deepEqual(EVALUATION_TRANSITIONS.REVOKED, []);
});

test("LIFECYCLE_TRANSITIONS has terminal TERMINATED", () => {
  assert.deepEqual(LIFECYCLE_TRANSITIONS.TERMINATED, []);
});

// --- Optimistic concurrency control ---

test("register returns version 1", () => {
  const reg = new RuntimeRegistry();
  const result = reg.register(registration());
  assert.equal(result.version, 1);
});

test("transitions increment version", () => {
  const reg = new RuntimeRegistry();
  reg.register(registration());
  const r1 = reg.transitionEvaluation("inst_claude_001", "APPROVED");
  assert.equal(r1.version, 2);
  const r2 = reg.transitionLifecycle("inst_claude_001", "ACTIVE");
  assert.equal(r2.version, 3);
});

test("stale expectedVersion on evaluation transition is rejected", () => {
  const reg = new RuntimeRegistry();
  reg.register(registration());
  reg.transitionEvaluation("inst_claude_001", "APPROVED");
  assert.throws(
    () => reg.transitionEvaluation("inst_claude_001", "SUSPENDED", { expectedVersion: 1 }),
    (err) => err instanceof RegistryError && err.code === "DENY_VERSION_CONFLICT"
  );
});

test("stale expectedVersion on lifecycle transition is rejected", () => {
  const reg = new RuntimeRegistry();
  reg.register(registration());
  reg.transitionLifecycle("inst_claude_001", "ACTIVE");
  assert.throws(
    () => reg.transitionLifecycle("inst_claude_001", "DEACTIVATED", { expectedVersion: 1 }),
    (err) => err instanceof RegistryError && err.code === "DENY_VERSION_CONFLICT"
  );
});

test("correct expectedVersion allows transition", () => {
  const reg = new RuntimeRegistry();
  reg.register(registration());
  const r1 = reg.transitionEvaluation("inst_claude_001", "APPROVED", { expectedVersion: 1 });
  assert.equal(r1.version, 2);
  const r2 = reg.transitionLifecycle("inst_claude_001", "ACTIVE", { expectedVersion: 2 });
  assert.equal(r2.version, 3);
});

// --- F-IDNORM: agent_instance_id duplicate detection is normalized ---
// (mod-reg-qa-001, probes P2/P3: case-variant, whitespace-padded, and
// NFC/NFD-confusable "same-looking" IDs must now be detected as duplicates.)

test("F-IDNORM: a case-variant of an already-registered ID is rejected as a duplicate", () => {
  const reg = new RuntimeRegistry();
  reg.register(registration());
  assert.throws(
    () => reg.register(registration({ agent_instance_id: "INST_CLAUDE_001" })),
    (err) => err instanceof RegistryError && err.code === "DENY_DUPLICATE_INSTANCE"
  );
  assert.equal(reg.size, 1);
});

test("F-IDNORM: a whitespace-padded variant of an already-registered ID is rejected as a duplicate", () => {
  const reg = new RuntimeRegistry();
  reg.register(registration());
  assert.throws(
    () => reg.register(registration({ agent_instance_id: " inst_claude_001 " })),
    (err) => err instanceof RegistryError && err.code === "DENY_DUPLICATE_INSTANCE"
  );
  assert.equal(reg.size, 1);
});

test("F-IDNORM: an NFD-normalized ID is rejected as a duplicate of its NFC-registered twin", () => {
  const reg = new RuntimeRegistry();
  // "cafe with an accent" as NFC (one precomposed code point, U+00E9) vs NFD
  // (base letter U+0065 followed by a combining acute accent, U+0301).
  // Built purely from explicit code points (no literal unicode in source)
  // so the two strings are guaranteed byte-distinct yet render identically
  // and are NFC-confusable.
  const nfc = "inst_caf" + String.fromCharCode(0x00e9);
  const nfd = "inst_caf" + String.fromCharCode(0x0065, 0x0301);
  assert.notEqual(nfc, nfd, "test fixture sanity: the two forms must be byte-distinct");
  assert.equal(nfc.normalize("NFC"), nfd.normalize("NFC"), "test fixture sanity: the two forms must be NFC-confusable");

  reg.register(registration({ agent_instance_id: nfc }));
  assert.throws(
    () => reg.register(registration({ agent_instance_id: nfd })),
    (err) => err instanceof RegistryError && err.code === "DENY_DUPLICATE_INSTANCE"
  );
  assert.equal(reg.size, 1);
});

test("F-IDNORM: genuinely distinct IDs that do not normalize to the same form still register independently", () => {
  const reg = new RuntimeRegistry();
  reg.register(registration());
  const result = reg.register(registration({ agent_instance_id: "inst_claude_002" }));
  assert.equal(result.registered, true);
  assert.equal(reg.size, 2);
});

test("F-IDNORM: registered entries remain keyed and retrievable by their original, unmodified agent_instance_id", () => {
  const reg = new RuntimeRegistry();
  reg.register(registration({ agent_instance_id: "Inst_Mixed_Case" }));
  const entry = reg.get("Inst_Mixed_Case");
  assert.equal(entry.agent_instance_id, "Inst_Mixed_Case");
  // A differently-cased lookup does not resolve to the same key: only the
  // duplicate-registration check is normalized, not get()/resolve() lookup.
  assert.equal(reg.get("inst_mixed_case"), null);
});
