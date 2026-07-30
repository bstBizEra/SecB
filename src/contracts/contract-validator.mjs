import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createAjv } from "./lazy-ajv.mjs";

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
  goal: "goal.schema.json"
};

let ajv = null;
const getAjv = () => (ajv ??= createAjv({ allErrors: true, strict: true }));

/**
 * Compiled validators, populated on first use rather than at import.
 *
 * Work-package item U1. Compiling all 13 schemas eagerly cost 3,525ms of the
 * 3,964ms it took to import secb-mcp-server.mjs — 89% of the MCP server's
 * time-to-first-response, paid in full before answering a handshake that needs
 * no schema at all, and paid again by every CLI and test that touches this
 * module. Ajv construction and addFormats are cheap; compile() is not.
 *
 * Safe to defer because no schema $refs another file, so each compiles
 * independently. Compilation is still synchronous, so validateContract and
 * every caller above it stay synchronous.
 */
const validators = new Map();

function validatorFor(kind) {
  const cached = validators.get(kind);
  if (cached) return cached;
  const file = schemaPaths[kind];
  if (file === undefined) return null;
  const path = resolve(import.meta.dirname, "..", "..", "contracts", file);
  const compiled = getAjv().compile(JSON.parse(readFileSync(path, "utf8")));
  validators.set(kind, compiled);
  return compiled;
}

export class ContractValidationError extends Error {
  constructor(code, message, errors = []) {
    super(message);
    this.name = "ContractValidationError";
    this.code = code;
    this.errors = errors;
  }
}

export function validateContract(kind, candidate) {
  const validate = validatorFor(kind);
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
  // Declared kinds, NOT compiled ones. Reading the cache here was equivalent
  // while every schema was compiled at import; under lazy compilation it would
  // report a shrinking set that depends on which contracts happened to have
  // been validated already, so a caller checking support would get a different
  // answer depending on when it asked.
  return Object.keys(schemaPaths);
}
