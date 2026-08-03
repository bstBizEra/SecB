// WP-MEM-UNIFY candidate: one unwired path from raw Memory Gateway rows through
// the authoritative lifecycle resolver, Candidate Provider, and Context
// Federation. This service grants no authority and performs no runtime wiring.

const REQUEST_KEYS = Object.freeze(["project_id", "layer", "scope_project_id", "limit", "cursor", "token_budget"]);
const REQUIRED_KEYS = Object.freeze(["project_id", "layer", "scope_project_id"]);
const ENVELOPE_KEYS = Object.freeze(["data_untrusted", "record"]);
const GATEWAY_KEYS = Object.freeze(["decision", "code", "retrieved_at", "records", "next_cursor"]);
const PROVIDER_KEYS = Object.freeze(["decision", "code", "data_untrusted", "project_id", "retrieved_at", "sources", "exclusions", "accounting"]);

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isBlank = (value) => typeof value !== "string" || value.trim() === "";

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function exactSnapshot(value, allowed, required = allowed) {
  if (!isPlainObject(value)) return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string" || !allowed.includes(key)) || required.some((key) => !keys.includes(key))) return null;
    return structuredClone(value);
  } catch {
    return null;
  }
}

const deny = (code, message, stage) => deepFreeze({ decision: "DENY", code, message, stage });

export class MemoryLifecycleUnifiedConfigurationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MemoryLifecycleUnifiedConfigurationError";
    this.code = code;
  }
}

export function createMemoryLifecycleUnifiedService({ memoryGateway, lifecycleResolver, memoryCandidateProvider, contextFederation } = {}) {
  let retrieve;
  let resolveLifecycle;
  let project;
  let issue;
  try {
    retrieve = memoryGateway?.retrieve;
    resolveLifecycle = lifecycleResolver?.resolve;
    project = memoryCandidateProvider?.toCandidateSources;
    issue = contextFederation?.issueReceipt;
  } catch {
    throw new MemoryLifecycleUnifiedConfigurationError("INVALID_UNIFY_DEPENDENCY", "unify dependencies could not be safely inspected");
  }
  if (typeof retrieve !== "function") throw new MemoryLifecycleUnifiedConfigurationError("INVALID_MEMORY_GATEWAY", "memoryGateway.retrieve is required");
  if (typeof resolveLifecycle !== "function") throw new MemoryLifecycleUnifiedConfigurationError("INVALID_LIFECYCLE_RESOLVER", "the shared lifecycleResolver.resolve is required");
  if (typeof project !== "function") throw new MemoryLifecycleUnifiedConfigurationError("INVALID_MEMORY_PROVIDER", "memoryCandidateProvider.toCandidateSources is required");
  if (typeof issue !== "function") throw new MemoryLifecycleUnifiedConfigurationError("INVALID_CONTEXT_FEDERATION", "contextFederation.issueReceipt is required");

  const retrieveMemory = Function.prototype.bind.call(retrieve, memoryGateway);
  const resolveMemory = Function.prototype.bind.call(resolveLifecycle, lifecycleResolver);
  const projectMemory = Function.prototype.bind.call(project, memoryCandidateProvider);
  const issueContext = Function.prototype.bind.call(issue, contextFederation);

  async function retrieveCandidateSources(request) {
    const input = exactSnapshot(request, REQUEST_KEYS, REQUIRED_KEYS);
    if (input === null || isBlank(input.project_id) || isBlank(input.layer) || isBlank(input.scope_project_id)) {
      return deny("DENY_UNIFY_REQUEST", "unified memory request is malformed", "request");
    }
    let gateway;
    try {
      gateway = exactSnapshot(await retrieveMemory({
        project_id: input.project_id, scope_project_id: input.scope_project_id, layer: input.layer,
        ...(input.limit === undefined ? {} : { limit: input.limit }), ...(input.cursor === undefined ? {} : { cursor: input.cursor })
      }), GATEWAY_KEYS);
    } catch {
      gateway = null;
    }
    if (gateway === null || gateway.decision !== "ALLOW" || gateway.code !== "RETRIEVED" || !Array.isArray(gateway.records)) {
      return deny("DENY_UNIFY_GATEWAY", "Memory Gateway did not return an admissible page", "gateway");
    }

    const effective = [];
    const lifecycleExclusions = [];
    for (let index = 0; index < gateway.records.length; index += 1) {
      const envelope = exactSnapshot(gateway.records[index], ENVELOPE_KEYS);
      if (envelope === null || envelope.data_untrusted !== true || !isPlainObject(envelope.record)) {
        return deny("DENY_UNIFY_GATEWAY", "Memory Gateway returned a malformed record envelope", "gateway");
      }
      const record = envelope.record;
      let resolution;
      try {
        resolution = await resolveMemory({
          project_id: record.project_id, layer: record.layer,
          memory_record_id: record.memory_record_id, memory_record_version: record.version
        });
      } catch {
        return deny("DENY_UNIFY_LIFECYCLE", "shared lifecycle resolver failed", "lifecycle");
      }
      if (!isPlainObject(resolution) || typeof resolution.code !== "string" || typeof resolution.ok !== "boolean") {
        return deny("DENY_UNIFY_LIFECYCLE", "shared lifecycle resolver returned a malformed decision", "lifecycle");
      }
      if (resolution.ok !== true || resolution.code !== "MEMORY_EFFECTIVE") {
        lifecycleExclusions.push(deepFreeze({
          ref: typeof record.memory_record_id === "string" ? record.memory_record_id : `memory-index-${index}`,
          stage: "memory-lifecycle", reason: "MEMORY_NOT_EFFECTIVE", code: resolution.code
        }));
        continue;
      }
      if (resolution.project_id !== record.project_id || resolution.layer !== record.layer
        || resolution.memory_record_id !== record.memory_record_id || resolution.memory_record_version !== record.version
        || resolution.content_hash !== record.content_hash) {
        return deny("DENY_UNIFY_LIFECYCLE_BINDING", "lifecycle ALLOW was not bound to the exact gateway record", "lifecycle");
      }
      effective.push(record);
    }

    let projected;
    try {
      projected = exactSnapshot(await projectMemory({
        project_id: input.project_id, records: effective,
        ...(input.token_budget === undefined ? {} : { token_budget: input.token_budget })
      }), PROVIDER_KEYS);
    } catch {
      projected = null;
    }
    if (projected === null || projected.decision !== "ALLOW" || projected.code !== "MEMORY_SOURCES_PROJECTED"
      || projected.project_id !== input.project_id || !Array.isArray(projected.sources) || !Array.isArray(projected.exclusions)) {
      return deny("DENY_UNIFY_PROVIDER", "Candidate Provider did not return an admissible projection", "provider");
    }
    return deepFreeze({
      decision: "ALLOW", code: "MEMORY_LIFECYCLE_UNIFIED", project_id: input.project_id,
      retrieved_at: projected.retrieved_at, sources: projected.sources,
      exclusions: [...lifecycleExclusions, ...projected.exclusions],
      accounting: {
        requested: gateway.records.length,
        lifecycle_effective: effective.length,
        included: projected.sources.length,
        excluded: lifecycleExclusions.length + projected.exclusions.length
      },
      next_cursor: gateway.next_cursor
    });
  }

  async function issueReceipt(request) {
    const input = exactSnapshot(request, ["retrieval", "issue"]);
    if (input === null || !isPlainObject(input.issue) || Object.prototype.hasOwnProperty.call(input.issue, "candidateSources")) {
      return deny("DENY_UNIFY_ISSUE_REQUEST", "issue request is malformed or attempts to bypass unified candidates", "request");
    }
    const unified = await retrieveCandidateSources(input.retrieval);
    if (unified.decision !== "ALLOW") return unified;
    try {
      return deepFreeze(await issueContext({ ...structuredClone(input.issue), candidateSources: unified.sources }));
    } catch {
      return deny("DENY_UNIFY_CONTEXT", "Context Federation rejected the unified candidate set", "context-federation");
    }
  }

  return Object.freeze({ retrieveCandidateSources, issueReceipt });
}
