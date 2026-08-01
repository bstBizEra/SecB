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
  goal: "valid/goal.json"
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
  goal: "invalid/goal-missing-id.json"
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
