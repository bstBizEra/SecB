import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { ContractValidationError, supportedContractKinds, validateContract } from "../src/contracts/contract-validator.mjs";

function fixture(relativePath) {
  return JSON.parse(readFileSync(resolve(import.meta.dirname, "fixtures", relativePath), "utf8"));
}

const validFixtures = {
  agentRegistration: "valid/agent-registration.json",
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
  skillCandidate: "valid/skill-candidate.json",
  goal: "valid/goal.json"
};

const invalidFixtures = {
  agentRegistration: "invalid/agent-registration-bad-ceiling.json",
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
  skillCandidate: "invalid/skill-candidate-bad-status.json",
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
