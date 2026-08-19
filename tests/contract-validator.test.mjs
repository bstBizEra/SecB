import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { ContractValidationError, supportedContractKinds, validateContract } from "../src/contracts/contract-validator.mjs";

function fixture(relativePath) {
  return JSON.parse(readFileSync(resolve(import.meta.dirname, "fixtures", relativePath), "utf8"));
}

const validFixtures = {
  agentEnrollmentRequest: "valid/agent-enrollment-request.json",
  agentRegistration: "valid/agent-registration.json",
  localBridgeEndpoint: "valid/local-bridge-endpoint-windows.json",
  localBridgeFrame: "valid/local-bridge-frame.json",
  localBridgeHandshakeTranscript: "valid/local-bridge-handshake-transcript.json",
  localBridgeInstallationProof: "valid/local-bridge-installation-proof.json",
  localBridgeSession: "valid/local-bridge-session.json",
  localBridgeDenial: "valid/local-bridge-denial.json",
  localBridgeLifecycle: "valid/local-bridge-lifecycle.json",
  project: "valid/project.json",
  workPackage: "valid/work-package.json",
  contextReceipt: "valid/context-receipt.json",
  handoffEnvelope: "valid/handoff-envelope.json",
  eventEnvelope: "valid/event-envelope.json",
  evidenceEnvelope: "valid/evidence-envelope.json",
  capabilityRecord: "valid/capability-record.json",
  decisionRecord: "valid/decision-record.json",
  knowledgeClaim: "valid/knowledge-claim.json",
  outcomeReceipt: "valid/outcome-receipt.json",
  skillManifest: "valid/skill-manifest.json",
  skillPackageDescriptor: "valid/skill-package-descriptor.json",
  skillGrantRecord: "valid/skill-grant-record.json",
  runtimeProviderPlugin: "valid/runtime-provider-plugin.json",
  goal: "valid/goal.json",
  skillCandidate: "valid/skill-candidate.json",
  delegationRequest: "valid/delegation-request.json",
  checkpoint: "valid/checkpoint.json",
  "workspace-lease": "valid/workspace-lease.json",
  memoryRecord: "valid/memory-record.json",
  skillPromotion: "valid/skill-promotion.json",
  integrationQueueEntry: "valid/integration-queue-entry.json"
};

const invalidFixtures = {
  agentEnrollmentRequest: "invalid/agent-enrollment-request-bad-key.json",
  agentRegistration: "invalid/agent-registration-bad-ceiling.json",
  localBridgeEndpoint: "invalid/local-bridge-endpoint-http.json",
  localBridgeFrame: "invalid/local-bridge-frame-caller-authority.json",
  localBridgeHandshakeTranscript: "invalid/local-bridge-handshake-transcript-secret.json",
  localBridgeInstallationProof: "invalid/local-bridge-installation-proof-secret.json",
  localBridgeSession: "invalid/local-bridge-session-bearer.json",
  localBridgeDenial: "invalid/local-bridge-denial-detail.json",
  localBridgeLifecycle: "invalid/local-bridge-lifecycle-token.json",
  project: "invalid/project-missing-id.json",
  workPackage: "invalid/work-package-unknown-field.json",
  contextReceipt: "invalid/context-bad-hash.json",
  handoffEnvelope: "invalid/handoff-missing-scope.json",
  eventEnvelope: "invalid/event-missing-idempotency.json",
  evidenceEnvelope: "invalid/evidence-bad-status.json",
  capabilityRecord: "invalid/capability-record-bad-status.json",
  decisionRecord: "invalid/decision-record-bad-type.json",
  knowledgeClaim: "invalid/knowledge-claim-no-evidence.json",
  outcomeReceipt: "invalid/outcome-receipt-bad-status.json",
  skillManifest: "invalid/skill-manifest-bad-status.json",
  skillPackageDescriptor: "invalid/skill-package-descriptor-declares-scope.json",
  skillGrantRecord: "invalid/skill-grant-record-bad-status.json",
  runtimeProviderPlugin: "invalid/runtime-provider-plugin-declares-authority.json",
  goal: "invalid/goal-missing-id.json",
  skillCandidate: "invalid/skill-candidate-bad-status.json",
  delegationRequest: "invalid/delegation-request-missing-budget.json",
  checkpoint: "invalid/checkpoint-missing-id.json",
  "workspace-lease": "invalid/workspace-lease-missing-id.json",
  memoryRecord: "invalid/memory-record-missing-id.json",
  skillPromotion: "invalid/skill-promotion-missing-id.json",
  integrationQueueEntry: "invalid/integration-queue-entry-missing-id.json"
};

test("all canonical contract kinds have valid fixtures", () => {
  assert.deepEqual(supportedContractKinds().sort(), Object.keys(validFixtures).sort());
  for (const [kind, path] of Object.entries(validFixtures)) {
    assert.deepEqual(validateContract(kind, fixture(path)), { kind, valid: true });
  }
});

test("malformed contracts fail closed with structured validation errors", () => {
  for (const [kind, path] of Object.entries(invalidFixtures)) {
    assert.throws(
      () => validateContract(kind, fixture(path)),
      (error) => error instanceof ContractValidationError && error.code === "DENY_CONTRACT_INVALID" && error.errors.length > 0
    );
  }
});

test("unknown contract kinds fail closed", () => {
  assert.throws(
    () => validateContract("callerDefinedAuthority", {}),
    (error) => error instanceof ContractValidationError && error.code === "DENY_UNKNOWN_CONTRACT"
  );
});

// ---------------------------------------------------------------------------
// validateContract NEVER throws an error without a code — and two modules
// depend on that without saying so.
//
// tools/per-site-demonstration.mjs reported DENY_CONTRACT_INVALID as
// undemonstrated in src/mcp/secb-mcp-server.mjs and
// src/runtime/runtime-provider-plugin-registry.mjs. Both reach it the same way:
//
//     deny(error?.code ?? "DENY_CONTRACT_INVALID", ...)
//
// The `??` branch is UNREACHABLE through the public API, because this validator
// converts every failure into a coded ContractValidationError. It is not
// shadowed — nothing stricter stands in front of it — and it is not a data
// structure invariant. It is a GUARANTEE OF THIS MODULE that those two call
// sites rely on implicitly.
//
// So the guarantee is asserted here rather than left implicit. If it ever
// breaks, this fails, and at that moment those two fallbacks stop being dead
// code and become live refusals that no test demonstrates.
//
// HOW THE GUARANTEE IS ACTUALLY PROVIDED, because it is not what it looks like.
// This module contains NO try/catch. Every throw here is an explicit
// ContractValidationError. Awkward documents do not become coded errors by
// being caught — they become coded errors because ajv RETURNS FALSE for them
// instead of throwing. That makes the guarantee a property of the ajv version,
// which tests/supply-chain-integrity.test.mjs pins by lockfile AND by the
// version actually loaded at runtime. An unpinned ajv upgrade could change this
// without changing a line of SecB.
// ---------------------------------------------------------------------------

test("every failure mode of validateContract throws an error carrying a code", () => {
  const circular = { a: 1 };
  circular.self = circular;
  const throwingGetter = {};
  Object.defineProperty(throwingGetter, "boom", { get() { throw new Error("getter exploded"); }, enumerable: true });

  const cases = {
    "a document that fails its schema": ["runtimeProviderPlugin", {}],
    "an unknown contract kind": ["noSuchContractKind", {}],
    "an undefined kind": [undefined, {}],
    "a non-string kind": [42, {}],
    "an undefined document": ["runtimeProviderPlugin", undefined],
    // The four below are the ones that could plausibly throw UNCODED — a
    // circular or BigInt-bearing document is exactly what makes structuredClone
    // and JSON paths raise DataCloneError or TypeError. They do not, today.
    // The getter case is the weakest of the four and is labelled as such: ajv
    // may simply never read a property the schema does not mention, so it may
    // be passing for a reason unrelated to error coding.
    "a document that cannot be structured-cloned": ["runtimeProviderPlugin", circular],
    "a document holding a BigInt": ["runtimeProviderPlugin", { n: 1n }],
    "a document holding a Symbol": ["runtimeProviderPlugin", { s: Symbol("x") }],
    "a document with a throwing getter": ["runtimeProviderPlugin", throwingGetter]
  };

  for (const [what, [kind, document]] of Object.entries(cases)) {
    let thrown = null;
    try {
      validateContract(kind, document);
    } catch (error) {
      thrown = error;
    }
    assert.ok(thrown, `${what}: returned instead of throwing`);
    assert.ok(
      typeof thrown.code === "string" && thrown.code.startsWith("DENY_"),
      `${what}: threw ${thrown.constructor.name} with code ${String(thrown.code)}. Two modules fall back to ` +
        "DENY_CONTRACT_INVALID when this validator throws without a code; that fallback is dead only while " +
        "this holds. It no longer holds."
    );
  }
});
