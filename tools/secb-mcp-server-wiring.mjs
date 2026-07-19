// P0-21 SecB MCP Server — CANDIDATE deployment wiring (advisory prepare only).
//
// This module makes the operator-authorized deployment step of
// run-secb-mcp-server.mjs READY without performing it. It composes the real
// delivered services into a SecBMcpServer over stdio (READ-ONLY alpha), but
// keeps the process non-activatable by default: prepareDeployment refuses to
// return a servable server unless the operator sets
// SECB_MCP_DEPLOYMENT_AUTHORIZED=operator AND a well-formed registry seed
// validates. Every failure is fail-closed and typed.
//
// Authority note (SARCHI-AA-01): the OS process spawn asserts callerInstanceId;
// this wiring binds cooperative callers against the seeded registry. It never
// grants authority — it only projects existing service authority.
import { appendFileSync, closeSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { SecBMcpServer } from "../src/mcp/secb-mcp-server.mjs";
import { serveStdio } from "../src/mcp/jsonrpc-stdio.mjs";
import { validateContract } from "../src/contracts/contract-validator.mjs";
import { AUTHORITY_LEVELS, RuntimeRegistry } from "../src/registry/runtime-registry.mjs";
import { SkillResolver } from "../src/registry/skill-resolver.mjs";
import { WorkPackageContractService } from "../src/services/work-package-service.mjs";
import { ProjectContractService } from "../src/project/project-contract-service.mjs";
import { EventLedger, EvidenceLedger } from "../src/ledger/governed-ledgers.mjs";

// The single operator-authorization message. Reused by the skeleton entry so
// the missing-authorization failure reads identically whether the guard trips
// in the skeleton or here.
export const OPERATOR_AUTH_MESSAGE =
  "run-secb-mcp-server: service wiring + registry-seed validation are an operator-authorized deployment step (alpha skeleton).";

export const DEPLOYMENT_ENV_FLAG = "SECB_MCP_DEPLOYMENT_AUTHORIZED";
export const DEPLOYMENT_ENV_VALUE = "operator";
export const SEED_VERSION = "1";
const CLASSIFICATION_CEILINGS = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"];

export class DeploymentError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DeploymentError";
    this.code = code;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonBlankString(value) {
  return typeof value === "string" && value.trim() !== "";
}

// ---------------------------------------------------------------------------
// Registry-seed loader (fail-closed).
// ---------------------------------------------------------------------------

// Read a JSON seed file. Missing file or malformed JSON deny.
export function readSeedFile(seedPath) {
  if (!isNonBlankString(seedPath)) {
    throw new DeploymentError("DENY_SEED_PATH", "Registry seed path must be a non-blank string");
  }
  let raw;
  try {
    raw = readFileSync(resolve(seedPath), "utf8");
  } catch (error) {
    throw new DeploymentError("DENY_SEED_UNREADABLE", `Registry seed is unreadable: ${error.code ?? error.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new DeploymentError("DENY_SEED_MALFORMED", `Registry seed is not valid JSON: ${error.message}`);
  }
}

// Strictly validate the seed envelope and every registration against the
// agent-registration contract. Returns a normalized { policyCeiling,
// registrations: [{ registration, approve, activate }] }.
export function validateSeed(seed) {
  if (!isPlainObject(seed)) {
    throw new DeploymentError("DENY_SEED_SHAPE", "Registry seed must be a JSON object");
  }
  if (seed.seed_version !== SEED_VERSION) {
    throw new DeploymentError("DENY_SEED_VERSION", `Registry seed must declare seed_version "${SEED_VERSION}"`);
  }
  const policyCeiling = seed.policy_ceiling ?? "A0";
  if (!AUTHORITY_LEVELS.includes(policyCeiling)) {
    throw new DeploymentError("DENY_SEED_POLICY_CEILING", `Unknown policy_ceiling: ${policyCeiling}`);
  }
  if (!Array.isArray(seed.registrations) || seed.registrations.length === 0) {
    throw new DeploymentError("DENY_SEED_EMPTY", "Registry seed must carry a non-empty registrations array");
  }

  const registrations = seed.registrations.map((item, index) => {
    if (!isPlainObject(item) || !isPlainObject(item.registration)) {
      throw new DeploymentError("DENY_SEED_ENTRY_SHAPE", `registrations[${index}] must be an object with a registration object`);
    }
    try {
      validateContract("agentRegistration", item.registration);
    } catch (error) {
      throw new DeploymentError("DENY_SEED_REGISTRATION_INVALID", `registrations[${index}] failed the agent-registration contract: ${error.code ?? error.message}`);
    }
    const approve = item.approve ?? true;
    const activate = item.activate ?? true;
    if (typeof approve !== "boolean" || typeof activate !== "boolean") {
      throw new DeploymentError("DENY_SEED_ENTRY_FLAGS", `registrations[${index}].approve/activate must be booleans`);
    }
    // A caller is only resolvable when APPROVED and ACTIVE. Activation without
    // approval is unreachable in the registry lifecycle, so reject it early.
    if (activate && !approve) {
      throw new DeploymentError("DENY_SEED_ENTRY_FLAGS", `registrations[${index}] cannot activate without approve`);
    }
    return { registration: item.registration, approve, activate };
  });

  return { policyCeiling, registrations };
}

export function loadRegistrySeed(seedPath) {
  return validateSeed(readSeedFile(seedPath));
}

// Build a RuntimeRegistry from a validated seed. Registrations enter as
// CANDIDATE/PENDING (registry invariant) and are then transitioned to
// APPROVED/ACTIVE per their seed flags so the seeded identities can resolve.
export function seedRegistry(validatedSeed) {
  const { policyCeiling, registrations } = validatedSeed;
  const registry = new RuntimeRegistry({ policyCeiling });
  for (const { registration, approve, activate } of registrations) {
    const { agent_instance_id: id } = registration;
    try {
      registry.register(registration);
      if (approve) registry.transitionEvaluation(id, "APPROVED");
      if (activate) registry.transitionLifecycle(id, "ACTIVE");
    } catch (error) {
      throw new DeploymentError("DENY_SEED_REGISTER", `Seeding instance ${id} denied: ${error.code ?? error.message}`);
    }
  }
  return registry;
}

// ---------------------------------------------------------------------------
// Invocation-ledger writer (append-only JSONL, fail-closed audit).
// ---------------------------------------------------------------------------

// Returns an invocationLog function: (entry) => void that appends one JSON line
// per call. A write failure THROWS, which the server treats as fail-closed
// (an unauditable read channel is a covert read channel). Path must be provided
// and, by default, is proven writable up front.
export function createInvocationLedgerWriter(ledgerPath, { preflight = true } = {}) {
  if (!isNonBlankString(ledgerPath)) {
    throw new DeploymentError("DENY_LEDGER_PATH", "Invocation-ledger path must be a non-blank string");
  }
  const absolute = resolve(ledgerPath);
  try {
    mkdirSync(dirname(absolute), { recursive: true });
    // Open the file handle in append mode (not an empty-string write, which on
    // some platforms short-circuits and never opens a directory target) to
    // prove the path is writable as a file up front.
    if (preflight) closeSync(openSync(absolute, "a"));
  } catch (error) {
    throw new DeploymentError("DENY_LEDGER_UNWRITABLE", `Invocation ledger is not writable: ${error.code ?? error.message}`);
  }
  return (entry) => {
    // No try/catch: a throw here is the fail-closed signal the server relies on.
    appendFileSync(absolute, `${JSON.stringify(entry)}\n`, { encoding: "utf8" });
  };
}

// ---------------------------------------------------------------------------
// Service composition (real services, read-only wiring).
// ---------------------------------------------------------------------------

// Compose a SecBMcpServer from the real delivered services. In this alpha the
// work-package, project, and skill stores are constructed empty (no persistence
// is wired yet) so their read tools fail closed with typed denies; the event
// and evidence ledgers are durable, file-backed, and projected read-only.
export function composeServices({
  registry,
  invocationLog,
  eventLedgerPath,
  evidenceLedgerPath,
  classificationCeiling = "INTERNAL",
  now = () => new Date()
}) {
  if (!registry || typeof registry.resolve !== "function") {
    throw new DeploymentError("DENY_COMPOSE_REGISTRY", "composeServices requires a registry with resolve()");
  }
  if (typeof invocationLog !== "function") {
    throw new DeploymentError("DENY_COMPOSE_AUDIT", "composeServices requires an invocationLog function");
  }
  if (!isNonBlankString(eventLedgerPath) || !isNonBlankString(evidenceLedgerPath)) {
    throw new DeploymentError("DENY_COMPOSE_LEDGERS", "composeServices requires event and evidence ledger paths");
  }
  if (!CLASSIFICATION_CEILINGS.includes(classificationCeiling)) {
    throw new DeploymentError("DENY_COMPOSE_CEILING", `Unknown classificationCeiling: ${classificationCeiling}`);
  }

  const services = {
    registry,
    workPackage: new WorkPackageContractService({ now }),
    project: new ProjectContractService({ now }),
    eventLedger: new EventLedger({ filePath: resolve(eventLedgerPath) }),
    evidenceLedger: new EvidenceLedger({ filePath: resolve(evidenceLedgerPath) }),
    skillResolver: new SkillResolver({ decisionLookup: () => null })
  };

  return new SecBMcpServer({ services, invocationLog, classificationCeiling, now });
}

// ---------------------------------------------------------------------------
// Deployment configuration + guard.
// ---------------------------------------------------------------------------

function argValue(argv, flag) {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  return argv[index + 1];
}

export function resolveDeploymentConfig({ argv = [], env = {} } = {}) {
  const pick = (flag, envKey) => argValue(argv, flag) ?? env[envKey];
  return {
    authorized: env[DEPLOYMENT_ENV_FLAG] === DEPLOYMENT_ENV_VALUE,
    seedPath: pick("--seed", "SECB_MCP_REGISTRY_SEED"),
    ledgerPath: pick("--ledger", "SECB_MCP_INVOCATION_LEDGER"),
    callerInstanceId: pick("--caller", "SECB_MCP_CALLER_INSTANCE"),
    eventLedgerPath: pick("--event-ledger", "SECB_MCP_EVENT_LEDGER"),
    evidenceLedgerPath: pick("--evidence-ledger", "SECB_MCP_EVIDENCE_LEDGER"),
    classificationCeiling: pick("--ceiling", "SECB_MCP_CLASSIFICATION_CEILING") ?? "INTERNAL"
  };
}

// The activation guard. Returns a servable { server, callerInstanceId } only
// when the operator explicitly authorized deployment AND the seed validates and
// every path is present/writable. Any failure throws a typed DeploymentError,
// keeping the candidate non-activatable by default.
export function prepareDeployment({ argv = [], env = {}, now = () => new Date() } = {}) {
  const config = resolveDeploymentConfig({ argv, env });

  // Guard 1: explicit operator authorization. Same message as the skeleton.
  if (!config.authorized) {
    throw new DeploymentError("DENY_DEPLOYMENT_UNAUTHORIZED", OPERATOR_AUTH_MESSAGE);
  }
  if (!isNonBlankString(config.callerInstanceId)) {
    throw new DeploymentError("DENY_CALLER_UNBOUND", "A caller instance id (--caller / SECB_MCP_CALLER_INSTANCE) must be asserted at spawn");
  }

  // Guard 2: the seed must validate (fail-closed) before any server exists.
  const registry = seedRegistry(loadRegistrySeed(config.seedPath));

  const invocationLog = createInvocationLedgerWriter(config.ledgerPath);
  const server = composeServices({
    registry,
    invocationLog,
    eventLedgerPath: config.eventLedgerPath,
    evidenceLedgerPath: config.evidenceLedgerPath,
    classificationCeiling: config.classificationCeiling,
    now
  });

  return { server, callerInstanceId: config.callerInstanceId, config };
}

// Convenience: prepare and serve over stdio. Used by the CLI entry.
export function serveDeployment({ argv = [], env = {}, now = () => new Date(), input, output } = {}) {
  const { server, callerInstanceId } = prepareDeployment({ argv, env, now });
  return serveStdio(server, { callerInstanceId, input, output });
}
