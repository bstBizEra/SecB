import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const schemaPaths = {
  project: "project-contract.schema.json",
  workPackage: "work-package.schema.json",
  contextReceipt: "context-receipt.schema.json",
  handoffEnvelope: "handoff-envelope.schema.json",
  eventEnvelope: "event-envelope.schema.json",
  evidenceEnvelope: "evidence-envelope.schema.json",
  agentRegistration: "agent-registration.schema.json",
  capabilityRecord: "capability-record.schema.json",
  decisionRecord: "decision-record.schema.json",
  knowledgeClaim: "knowledge-claim.schema.json",
  outcomeReceipt: "outcome-receipt.schema.json",
  skillManifest: "skill-manifest.schema.json",
  skillCandidate: "skill-candidate.schema.json",
  goal: "goal.schema.json",
  delegationRequest: "delegation-request.schema.json",
  checkpoint: "checkpoint.schema.json",
  "workspace-lease": "workspace-lease.schema.json",
  skillPromotion: "skill-promotion.schema.json"
};

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

const validators = new Map(
  Object.entries(schemaPaths).map(([kind, file]) => {
    const path = resolve(import.meta.dirname, "..", "..", "contracts", file);
    const schema = JSON.parse(readFileSync(path, "utf8"));
    return [kind, ajv.compile(schema)];
  })
);

export class ContractValidationError extends Error {
  constructor(code, message, errors = []) {
    super(message);
    this.name = "ContractValidationError";
    this.code = code;
    this.errors = errors;
  }
}

export function validateContract(kind, candidate) {
  const validate = validators.get(kind);
  if (!validate) {
    throw new ContractValidationError("DENY_UNKNOWN_CONTRACT", `Unknown contract kind: ${kind}`);
  }

  if (!validate(candidate)) {
    throw new ContractValidationError(
      "DENY_CONTRACT_INVALID",
      `${kind} contract failed validation`,
      structuredClone(validate.errors ?? [])
    );
  }

  return { kind, valid: true };
}

export function supportedContractKinds() {
  return [...validators.keys()];
}
