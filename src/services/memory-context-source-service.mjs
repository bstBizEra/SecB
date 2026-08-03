// MOD-MEM integration candidate: governed Memory -> Context CandidateSource.
//
// This composition is exported but not constructed by any runtime. It cannot
// self-activate: project scope and capability effectiveness come only from
// injected server-side resolvers, both of which default to DENY. A successful
// call composes the independently reviewed Memory gateway and candidate
// provider, then crosses the typed CandidateSource port used by Context
// Federation. It does not admit knowledge, issue a Context Receipt, or grant
// authority.

import { normalizeCandidateSources } from "./candidate-source-port.mjs";
import { MEMORY_PROVIDER_EXCLUSION_REASONS, MEMORY_PROVIDER_STAGE } from "./memory-candidate-provider.mjs";
import { validateContract } from "../contracts/contract-validator.mjs";

const CAPABILITY = "memory-context-retrieval";
const REQUEST_KEYS = Object.freeze(["project_id", "layer", "limit", "cursor", "token_budget"]);
const REQUIRED_REQUEST_KEYS = Object.freeze(["project_id", "layer"]);
const SCOPE_KEYS = Object.freeze(["decision", "decision_id", "project_id"]);
const ACTIVATION_KEYS = Object.freeze(["decision", "decision_id", "capability", "project_id", "layer"]);
const GATEWAY_ALLOW_KEYS = Object.freeze(["decision", "code", "retrieved_at", "records", "next_cursor"]);
const RECORD_ENVELOPE_KEYS = Object.freeze(["data_untrusted", "record"]);
const PROVIDER_ALLOW_KEYS = Object.freeze(["decision", "code", "data_untrusted", "project_id", "retrieved_at", "sources", "exclusions", "accounting"]);
const ACCOUNTING_KEYS = Object.freeze(["requested", "included", "excluded"]);
const BUDGET_ACCOUNTING_KEYS = Object.freeze([...ACCOUNTING_KEYS, "token_budget", "tokens_used"]);
const MAX_LIMIT = 1_000;
const MAX_CURSOR_LENGTH = 2_048;

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isBlank = (value) => typeof value !== "string" || value.trim() === "";

function deepFreeze(value, seen = new WeakSet()) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    if (seen.has(value)) return value;
    seen.add(value);
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested, seen);
  }
  return value;
}

function snapshotClosed(value, allowedKeys, requiredKeys = allowedKeys) {
  try {
    if (!isPlainObject(value)) return null;
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return null;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string" || !allowedKeys.includes(key))) return null;
    if (requiredKeys.some((key) => !ownKeys.includes(key))) return null;
    const snapshot = { __proto__: null };
    for (const key of allowedKeys) {
      if (ownKeys.includes(key)) snapshot[key] = value[key];
    }
    return snapshot;
  } catch {
    return null;
  }
}

function detachedSnapshot(value) {
  try {
    return structuredClone(value);
  } catch {
    return null;
  }
}

function hasExactKeys(value, keys) {
  if (!isPlainObject(value)) return false;
  const ownKeys = Reflect.ownKeys(value);
  return ownKeys.length === keys.length
    && ownKeys.every((key) => typeof key === "string" && keys.includes(key))
    && keys.every((key) => ownKeys.includes(key));
}

function projectionIsBound(records, projected, normalized, projectId, layer, tokenBudget, gatewayRetrievedAt) {
  const accountingKeys = tokenBudget === undefined ? ACCOUNTING_KEYS : BUDGET_ACCOUNTING_KEYS;
  if (
    !hasExactKeys(projected.accounting, accountingKeys)
    || projected.accounting.requested !== records.length
    || projected.accounting.included !== projected.sources.length
    || projected.accounting.excluded !== projected.exclusions.length
    || projected.accounting.included + projected.accounting.excluded !== projected.accounting.requested
    || projected.sources.length + projected.exclusions.length !== records.length
    || normalized.exclusions.length !== 0
    || normalized.candidates.length !== projected.sources.length
  ) return false;
  if (tokenBudget !== undefined && (
    projected.accounting.token_budget !== tokenBudget
    || !Number.isSafeInteger(projected.accounting.tokens_used)
    || projected.accounting.tokens_used < 0
    || projected.accounting.tokens_used > tokenBudget
  )) return false;

  try {
    for (const record of records) {
      validateContract("memoryRecord", record);
      if (record.project_id !== projectId || record.layer !== layer) return false;
    }
  } catch {
    return false;
  }

  if (projected.retrieved_at !== gatewayRetrievedAt) return false;
  const projectionMs = Date.parse(gatewayRetrievedAt);
  const consumed = new Set();
  for (const candidate of normalized.candidates) {
    const matching = [];
    records.forEach((record, index) => {
      if (
        !consumed.has(index)
        && record.memory_record_id === candidate.ref
        && record.content_hash === candidate.provenance?.content_hash
      ) matching.push(index);
    });
    if (matching.length !== 1) return false;
    const index = matching[0];
    const record = records[index];
    const expectedCurrent = Date.parse(record.valid_from) <= projectionMs && projectionMs < Date.parse(record.valid_until);
    if (
      candidate.kind !== "memory"
      || candidate.projectId !== projectId
      || record.project_id !== projectId
      || candidate.classification !== record.classification
      || candidate.verified !== true
      || candidate.current !== expectedCurrent
      || candidate.resolvable !== true
      || candidate.relevance !== record.confidence
      || candidate.provenance.origin !== record.source
      || candidate.provenance.retrieved_at !== projected.retrieved_at
    ) return false;
    consumed.add(index);
  }

  for (const exclusion of projected.exclusions) {
    if (
      !isPlainObject(exclusion)
      || typeof exclusion.ref !== "string"
      || exclusion.stage !== MEMORY_PROVIDER_STAGE
      || !MEMORY_PROVIDER_EXCLUSION_REASONS.includes(exclusion.reason)
      || ["MEMORY_MALFORMED", "MEMORY_PROJECT_MISMATCH"].includes(exclusion.reason)
      || (exclusion.reason === "BUDGET_EXCEEDED" && tokenBudget === undefined)
    ) return false;
    const matching = records.findIndex((record, index) => !consumed.has(index) && record.memory_record_id === exclusion.ref);
    if (matching === -1) return false;
    if (exclusion.reason === "DEDUP_DUPLICATE") {
      const record = records[matching];
      const earlierDuplicate = records.some((prior, index) => index < matching && prior.content_hash === record.content_hash);
      if (!earlierDuplicate) return false;
    }
    consumed.add(matching);
  }
  return consumed.size === records.length;
}

function deny(code, reason, stage, upstreamCode) {
  return deepFreeze({
    decision: "DENY",
    code,
    reason,
    stage,
    ...(upstreamCode === undefined ? {} : { upstream_code: upstreamCode })
  });
}

export class MemoryContextSourceConfigurationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MemoryContextSourceConfigurationError";
    this.code = code;
  }
}

export function createMemoryContextSourceService({
  memoryGateway,
  memoryCandidateProvider,
  scopeResolver,
  activationResolver
} = {}) {
  let gatewayRetrieve;
  let projectRecords;
  try {
    gatewayRetrieve = memoryGateway?.retrieve;
    projectRecords = memoryCandidateProvider?.toCandidateSources;
  } catch {
    throw new MemoryContextSourceConfigurationError("INVALID_MEMORY_PORT", "Memory collaborators could not be inspected safely");
  }
  if (!isPlainObject(memoryGateway) || typeof gatewayRetrieve !== "function") {
    throw new MemoryContextSourceConfigurationError("INVALID_MEMORY_GATEWAY", "memoryGateway must expose retrieve()");
  }
  if (!isPlainObject(memoryCandidateProvider) || typeof projectRecords !== "function") {
    throw new MemoryContextSourceConfigurationError("INVALID_MEMORY_PROVIDER", "memoryCandidateProvider must expose toCandidateSources()");
  }
  if (scopeResolver !== undefined && typeof scopeResolver !== "function") {
    throw new MemoryContextSourceConfigurationError("INVALID_SCOPE_RESOLVER", "scopeResolver must be a function when provided");
  }
  if (activationResolver !== undefined && typeof activationResolver !== "function") {
    throw new MemoryContextSourceConfigurationError("INVALID_ACTIVATION_RESOLVER", "activationResolver must be a function when provided");
  }

  const retrieveMemory = Function.prototype.bind.call(gatewayRetrieve, memoryGateway);
  const toCandidateSources = Function.prototype.bind.call(projectRecords, memoryCandidateProvider);
  const resolveScope = scopeResolver ?? (() => ({ decision: "DENY", decision_id: "default-deny", project_id: "" }));
  const resolveActivation = activationResolver ?? (() => ({
    decision: "DENY",
    decision_id: "default-deny",
    capability: CAPABILITY,
    project_id: "",
    layer: ""
  }));

  function retrieveCandidateSources(request) {
    const query = snapshotClosed(request, REQUEST_KEYS, REQUIRED_REQUEST_KEYS);
    if (query === null) return deny("DENY_MALFORMED_REQUEST", "Memory context request is not a closed safe object", "request");
    if (
      isBlank(query.project_id)
      || isBlank(query.layer)
      || (query.limit !== undefined && (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > MAX_LIMIT))
      || (query.cursor !== undefined && (
        typeof query.cursor !== "string" || query.cursor.length < 1 || query.cursor.length > MAX_CURSOR_LENGTH
        || !/^[A-Za-z0-9_-]+$/.test(query.cursor)
      ))
      || (query.token_budget !== undefined && (!Number.isSafeInteger(query.token_budget) || query.token_budget < 1))
    ) return deny("DENY_MALFORMED_REQUEST", "Memory context request fields are malformed", "request");

    const resolutionRequest = deepFreeze({ capability: CAPABILITY, project_id: query.project_id, layer: query.layer });
    let scope;
    try {
      scope = snapshotClosed(resolveScope(resolutionRequest), SCOPE_KEYS);
    } catch {
      scope = null;
    }
    if (
      scope === null
      || scope.decision !== "ALLOW"
      || isBlank(scope.decision_id)
      || isBlank(scope.project_id)
    ) return deny("DENY_MEMORY_SCOPE_UNRESOLVED", "Server-side project scope is not effective", "scope");
    if (scope.project_id !== query.project_id) {
      return deny("DENY_MEMORY_SCOPE_MISMATCH", "Requested project does not match the server-derived project scope", "scope");
    }

    let activation;
    try {
      activation = snapshotClosed(resolveActivation(resolutionRequest), ACTIVATION_KEYS);
    } catch {
      activation = null;
    }
    if (
      activation === null
      || activation.decision !== "ALLOW"
      || isBlank(activation.decision_id)
      || activation.capability !== CAPABILITY
      || activation.project_id !== scope.project_id
      || activation.layer !== query.layer
    ) return deny("DENY_MEMORY_NOT_EFFECTIVE", "Memory context capability is not effective for this scope", "activation");

    let retrieved;
    try {
      retrieved = detachedSnapshot(retrieveMemory({
        project_id: query.project_id,
        scope_project_id: scope.project_id,
        layer: query.layer,
        ...(query.limit === undefined ? {} : { limit: query.limit }),
        ...(query.cursor === undefined ? {} : { cursor: query.cursor })
      }));
    } catch {
      retrieved = null;
    }
    if (
      !hasExactKeys(retrieved, GATEWAY_ALLOW_KEYS)
      || retrieved.decision !== "ALLOW"
      || retrieved.code !== "RETRIEVED"
      || typeof retrieved.retrieved_at !== "string" || !Number.isFinite(Date.parse(retrieved.retrieved_at))
      || !Array.isArray(retrieved.records)
      || (retrieved.next_cursor !== null && (
        typeof retrieved.next_cursor !== "string"
        || retrieved.next_cursor.length < 1 || retrieved.next_cursor.length > MAX_CURSOR_LENGTH
        || !/^[A-Za-z0-9_-]+$/.test(retrieved.next_cursor)
      ))
    ) {
      return deny(
        "DENY_MEMORY_RETRIEVAL",
        "Memory gateway did not return an admissible page",
        "gateway",
        isPlainObject(retrieved) && typeof retrieved.code === "string" ? retrieved.code : undefined
      );
    }

    const records = [];
    for (const entry of retrieved.records) {
      if (!hasExactKeys(entry, RECORD_ENVELOPE_KEYS) || entry.data_untrusted !== true || !isPlainObject(entry.record)) {
        return deny("DENY_MEMORY_RETRIEVAL", "Memory gateway page contains an invalid record envelope", "gateway");
      }
      records.push(entry.record);
    }

    let projected;
    try {
      projected = detachedSnapshot(toCandidateSources({
        project_id: query.project_id,
        records,
        ...(query.token_budget === undefined ? {} : { token_budget: query.token_budget })
      }));
    } catch {
      projected = null;
    }
    if (
      !hasExactKeys(projected, PROVIDER_ALLOW_KEYS)
      || projected.decision !== "ALLOW"
      || projected.code !== "MEMORY_SOURCES_PROJECTED"
      || projected.data_untrusted !== true
      || projected.project_id !== query.project_id
      || typeof projected.retrieved_at !== "string" || !Number.isFinite(Date.parse(projected.retrieved_at))
      || !Array.isArray(projected.sources)
      || !Array.isArray(projected.exclusions)
      || !isPlainObject(projected.accounting)
    ) {
      return deny(
        "DENY_MEMORY_PROJECTION",
        "Memory candidate provider did not return an admissible projection",
        "provider",
        isPlainObject(projected) && typeof projected.code === "string" ? projected.code : undefined
      );
    }

    let normalized;
    try {
      normalized = normalizeCandidateSources(projected.sources);
    } catch {
      return deny("DENY_CANDIDATE_SOURCE_PORT", "Memory candidates failed the typed source boundary", "candidate-source-port");
    }
    if (!projectionIsBound(
      records,
      projected,
      normalized,
      query.project_id,
      query.layer,
      query.token_budget,
      retrieved.retrieved_at
    )) {
      return deny("DENY_MEMORY_PROVENANCE_BINDING", "Memory projection is not a subtractive binding of the retrieved records", "provider-binding");
    }

    const exclusions = [
      ...structuredClone(projected.exclusions),
      ...structuredClone(normalized.exclusions)
    ];
    return deepFreeze({
      decision: "ALLOW",
      code: "MEMORY_CONTEXT_SOURCES_READY",
      project_id: query.project_id,
      layer: query.layer,
      scope_decision_id: scope.decision_id,
      activation_decision_id: activation.decision_id,
      retrieved_at: retrieved.retrieved_at,
      candidate_sources: structuredClone(normalized.candidates),
      exclusions,
      accounting: {
        retrieved: records.length,
        provider_included: projected.sources.length,
        provider_excluded: projected.exclusions.length,
        port_included: normalized.candidates.length,
        port_excluded: normalized.exclusions.length
      },
      next_cursor: retrieved.next_cursor ?? null
    });
  }

  return Object.freeze({ retrieveCandidateSources });
}
