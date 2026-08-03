// Governed, UNWIRED authority facade for the Memory Gateway.
//
// Caller input never owns actor identity, project scope, admission roles, or
// authority decisions. Those values are resolved through captured server-side
// ports which default to DENY. The facade narrows the existing gateway; it does
// not alter Memory admission policy or activate a runtime path.

import { canonicalFingerprint } from "../contracts/canonical-fingerprint.mjs";
import { validateContract } from "../contracts/contract-validator.mjs";

const OPERATIONS = Object.freeze({ ADMIT: "memory-admit", RETRIEVE: "memory-retrieve" });
const LAYERS = Object.freeze(["session", "work", "project"]);
const ADMIT_REQUEST_KEYS = Object.freeze(["layer", "record"]);
const RETRIEVE_REQUEST_KEYS = Object.freeze(["project_id", "layer", "limit", "cursor"]);
const CALLER_RECORD_KEYS = Object.freeze([
  "memory_record_id", "version", "project_id", "work_package_id", "session_id",
  "source", "statement", "classification", "confidence", "provenance",
  "valid_from", "valid_until", "retention_policy", "supersedes"
]);
const REQUIRED_CALLER_RECORD_KEYS = Object.freeze(CALLER_RECORD_KEYS.filter((key) => key !== "supersedes"));
const IDENTITY_KEYS = Object.freeze(["decision", "decision_id", "actor_id"]);
const SCOPE_KEYS = Object.freeze(["decision", "decision_id", "actor_id", "project_id"]);
const ADMISSION_AUTHORITY_KEYS = Object.freeze([
  "decision", "decision_id", "actor_id", "project_id", "layer", "producer", "reviewer", "approver"
]);
const RETRIEVAL_AUTHORITY_KEYS = Object.freeze(["decision", "decision_id", "actor_id", "project_id", "layer"]);
const ADMIT_ALLOW_KEYS = Object.freeze(["decision", "code", "admitted_at", "record", "append"]);
const RETRIEVE_ALLOW_KEYS = Object.freeze(["decision", "code", "retrieved_at", "records", "next_cursor"]);
const RECORD_ENVELOPE_KEYS = Object.freeze(["data_untrusted", "record"]);
const APPEND_KEYS = Object.freeze([
  "status", "idempotency_key", "memory_record_id", "version", "content_hash",
  "record_fingerprint", "created", "sequence"
]);
const REQUIRED_APPEND_KEYS = Object.freeze(APPEND_KEYS.filter((key) => key !== "sequence"));
const MAX_LIMIT = 1_000;
const DEFAULT_LIMIT = 100;
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
    const out = { __proto__: null };
    for (const key of allowedKeys) if (ownKeys.includes(key)) out[key] = value[key];
    return out;
  } catch {
    return null;
  }
}

function detached(value) {
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

function appendReceiptIsBound(append, record, layer, admittedAt) {
  if (!isPlainObject(append)) return false;
  const keys = Reflect.ownKeys(append);
  if (
    keys.some((key) => typeof key !== "string" || !APPEND_KEYS.includes(key))
    || REQUIRED_APPEND_KEYS.some((key) => !keys.includes(key))
  ) return false;
  const idempotencyKey = JSON.stringify([record.project_id, layer, record.memory_record_id, record.version]);
  return append.status === "COMMITTED"
    && append.idempotency_key === idempotencyKey
    && append.memory_record_id === record.memory_record_id
    && append.version === record.version
    && append.content_hash === record.content_hash
    && append.record_fingerprint === canonicalFingerprint({ ...record, layer, admitted_at: admittedAt })
    && typeof append.created === "boolean"
    && (append.sequence === undefined || (Number.isSafeInteger(append.sequence) && append.sequence > 0));
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

function defaultIdentity() {
  return { decision: "DENY", decision_id: "default-deny", actor_id: "" };
}

function defaultScope() {
  return { decision: "DENY", decision_id: "default-deny", actor_id: "", project_id: "" };
}

function defaultAdmissionAuthority() {
  return {
    decision: "DENY", decision_id: "default-deny", actor_id: "", project_id: "", layer: "",
    producer: "", reviewer: null, approver: null
  };
}

function defaultRetrievalAuthority() {
  return { decision: "DENY", decision_id: "default-deny", actor_id: "", project_id: "", layer: "" };
}

export class MemoryAuthorityGatewayConfigurationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MemoryAuthorityGatewayConfigurationError";
    this.code = code;
  }
}

export function createMemoryAuthorityGateway({
  memoryGateway,
  identityResolver,
  scopeResolver,
  admissionAuthorityResolver,
  retrievalAuthorityResolver
} = {}) {
  let gatewayAdmit;
  let gatewayRetrieve;
  try {
    gatewayAdmit = memoryGateway?.admit;
    gatewayRetrieve = memoryGateway?.retrieve;
  } catch {
    throw new MemoryAuthorityGatewayConfigurationError("INVALID_MEMORY_GATEWAY", "Memory gateway ports could not be inspected safely");
  }
  if (!isPlainObject(memoryGateway) || typeof gatewayAdmit !== "function" || typeof gatewayRetrieve !== "function") {
    throw new MemoryAuthorityGatewayConfigurationError("INVALID_MEMORY_GATEWAY", "memoryGateway must expose admit() and retrieve()");
  }
  for (const [name, resolver] of Object.entries({ identityResolver, scopeResolver, admissionAuthorityResolver, retrievalAuthorityResolver })) {
    if (resolver !== undefined && typeof resolver !== "function") {
      throw new MemoryAuthorityGatewayConfigurationError("INVALID_AUTHORITY_RESOLVER", `${name} must be a function when provided`);
    }
  }

  const admitMemory = Function.prototype.bind.call(gatewayAdmit, memoryGateway);
  const retrieveMemory = Function.prototype.bind.call(gatewayRetrieve, memoryGateway);
  const resolveIdentity = identityResolver ?? defaultIdentity;
  const resolveScope = scopeResolver ?? defaultScope;
  const resolveAdmissionAuthority = admissionAuthorityResolver ?? defaultAdmissionAuthority;
  const resolveRetrievalAuthority = retrievalAuthorityResolver ?? defaultRetrievalAuthority;

  function resolveBindings(operation, projectId, layer) {
    const base = deepFreeze({ operation, project_id: projectId, layer });
    let identity;
    try {
      identity = snapshotClosed(resolveIdentity(base), IDENTITY_KEYS);
    } catch {
      identity = null;
    }
    if (identity === null || identity.decision !== "ALLOW" || isBlank(identity.decision_id) || isBlank(identity.actor_id)) {
      return { denial: deny("DENY_MEMORY_IDENTITY", "Server-derived caller identity is not effective", "identity") };
    }

    const scopeRequest = deepFreeze({ ...base, actor_id: identity.actor_id, identity_decision_id: identity.decision_id });
    let scope;
    try {
      scope = snapshotClosed(resolveScope(scopeRequest), SCOPE_KEYS);
    } catch {
      scope = null;
    }
    if (
      scope === null || scope.decision !== "ALLOW" || isBlank(scope.decision_id)
      || scope.actor_id !== identity.actor_id || scope.project_id !== projectId
    ) return { denial: deny("DENY_MEMORY_SCOPE", "Server-derived Memory scope is not effective for this actor and project", "scope") };

    return { identity, scope, base };
  }

  async function admit(request) {
    const query = snapshotClosed(request, ADMIT_REQUEST_KEYS);
    if (query === null || !LAYERS.includes(query.layer)) {
      return deny("DENY_MALFORMED_REQUEST", "Memory admission request is not a closed valid object", "request");
    }
    const recordSnapshot = snapshotClosed(query.record, CALLER_RECORD_KEYS, REQUIRED_CALLER_RECORD_KEYS);
    const callerRecord = recordSnapshot === null ? null : detached(recordSnapshot);
    if (callerRecord === null || isBlank(callerRecord.project_id)) {
      return deny("DENY_MALFORMED_REQUEST", "Memory admission record is not a closed safe object", "request");
    }

    const bindings = resolveBindings(OPERATIONS.ADMIT, callerRecord.project_id, query.layer);
    if (bindings.denial) return bindings.denial;
    const authorityRequest = deepFreeze({
      ...bindings.base,
      actor_id: bindings.identity.actor_id,
      identity_decision_id: bindings.identity.decision_id,
      scope_decision_id: bindings.scope.decision_id
    });
    let authority;
    try {
      authority = snapshotClosed(resolveAdmissionAuthority(authorityRequest), ADMISSION_AUTHORITY_KEYS);
    } catch {
      authority = null;
    }
    if (
      authority === null || authority.decision !== "ALLOW" || isBlank(authority.decision_id)
      || authority.actor_id !== bindings.identity.actor_id || authority.project_id !== callerRecord.project_id
      || authority.layer !== query.layer || authority.producer !== bindings.identity.actor_id
      || (authority.reviewer !== null && isBlank(authority.reviewer))
      || (authority.approver !== null && isBlank(authority.approver))
    ) return deny("DENY_MEMORY_ADMISSION_AUTHORITY", "Memory admission authority is not effective or is not exactly bound", "authority");
    const authorityActors = [authority.producer, authority.reviewer, authority.approver].filter((actor) => actor !== null);
    if (
      new Set(authorityActors).size !== authorityActors.length
      || (query.layer === "project" && authority.approver === null)
    ) return deny("DENY_MEMORY_ADMISSION_SOD", "Memory admission authority violates separation of duties", "authority");

    let record;
    try {
      record = {
        ...callerRecord,
        actor_id: bindings.identity.actor_id
      };
      record.content_hash = canonicalFingerprint({ ...record, layer: query.layer });
    } catch {
      return deny("DENY_MALFORMED_REQUEST", "Memory admission record cannot be fingerprinted safely", "request");
    }
    let upstream;
    try {
      upstream = detached(await admitMemory({
        layer: query.layer,
        record,
        admission: {
          producer: authority.producer,
          ...(authority.reviewer === null ? {} : { reviewer: authority.reviewer }),
          ...(authority.approver === null ? {} : { approver: authority.approver })
        }
      }));
    } catch {
      upstream = null;
    }
    let admittedRecordIsBound = false;
    try {
      validateContract("memoryRecord", upstream?.record);
      admittedRecordIsBound = (
        upstream.admitted_at === upstream.record.admitted_at
        && canonicalFingerprint(upstream.record) === canonicalFingerprint({
          ...record,
          layer: query.layer,
          admitted_at: upstream.admitted_at
        })
      );
    } catch {
      admittedRecordIsBound = false;
    }
    if (
      !hasExactKeys(upstream, ADMIT_ALLOW_KEYS)
      || upstream.decision !== "ALLOW" || upstream.code !== "ADMITTED"
      || typeof upstream.admitted_at !== "string" || !Number.isFinite(Date.parse(upstream.admitted_at))
      || !admittedRecordIsBound || !appendReceiptIsBound(upstream.append, record, query.layer, upstream.admitted_at)
    ) {
      return deny(
        "DENY_MEMORY_ADMISSION",
        "Memory gateway did not admit the authority-bound record",
        "gateway",
        isPlainObject(upstream) && typeof upstream.code === "string" ? upstream.code : undefined
      );
    }
    return deepFreeze({
      ...upstream,
      identity_decision_id: bindings.identity.decision_id,
      scope_decision_id: bindings.scope.decision_id,
      authority_decision_id: authority.decision_id
    });
  }

  function retrieve(request) {
    const query = snapshotClosed(request, RETRIEVE_REQUEST_KEYS, ["project_id", "layer"]);
    if (
      query === null || isBlank(query.project_id) || !LAYERS.includes(query.layer)
      || (query.limit !== undefined && (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > MAX_LIMIT))
      || (query.cursor !== undefined && (
        typeof query.cursor !== "string" || query.cursor.length < 1 || query.cursor.length > MAX_CURSOR_LENGTH
        || !/^[A-Za-z0-9_-]+$/.test(query.cursor)
      ))
    ) return deny("DENY_MALFORMED_REQUEST", "Memory retrieval request is not a closed valid object", "request");

    const bindings = resolveBindings(OPERATIONS.RETRIEVE, query.project_id, query.layer);
    if (bindings.denial) return bindings.denial;
    const authorityRequest = deepFreeze({
      ...bindings.base,
      actor_id: bindings.identity.actor_id,
      identity_decision_id: bindings.identity.decision_id,
      scope_decision_id: bindings.scope.decision_id
    });
    let authority;
    try {
      authority = snapshotClosed(resolveRetrievalAuthority(authorityRequest), RETRIEVAL_AUTHORITY_KEYS);
    } catch {
      authority = null;
    }
    if (
      authority === null || authority.decision !== "ALLOW" || isBlank(authority.decision_id)
      || authority.actor_id !== bindings.identity.actor_id || authority.project_id !== query.project_id
      || authority.layer !== query.layer
    ) return deny("DENY_MEMORY_RETRIEVAL_AUTHORITY", "Memory retrieval authority is not effective or is not exactly bound", "authority");

    let upstream;
    try {
      upstream = detached(retrieveMemory({
        project_id: query.project_id,
        scope_project_id: bindings.scope.project_id,
        layer: query.layer,
        ...(query.limit === undefined ? {} : { limit: query.limit }),
        ...(query.cursor === undefined ? {} : { cursor: query.cursor })
      }));
    } catch {
      upstream = null;
    }
    let pageIsBound = false;
    try {
      const retrievedMs = Date.parse(upstream?.retrieved_at);
      const effectiveLimit = query.limit ?? DEFAULT_LIMIT;
      pageIsBound = Array.isArray(upstream?.records)
        && upstream.records.length <= effectiveLimit
        && Number.isFinite(retrievedMs)
        && upstream.records.every((entry) => {
          if (!hasExactKeys(entry, RECORD_ENVELOPE_KEYS) || entry.data_untrusted !== true) return false;
          validateContract("memoryRecord", entry.record);
          const { admitted_at: admittedAt, content_hash: contentHash, ...hashBody } = entry.record;
          void admittedAt;
          return entry.record.project_id === query.project_id
            && entry.record.layer === query.layer
            && canonicalFingerprint(hashBody) === contentHash
            && Date.parse(entry.record.valid_from) <= retrievedMs
            && retrievedMs < Date.parse(entry.record.valid_until);
        });
    } catch {
      pageIsBound = false;
    }
    if (
      !hasExactKeys(upstream, RETRIEVE_ALLOW_KEYS)
      || upstream.decision !== "ALLOW" || upstream.code !== "RETRIEVED"
      || typeof upstream.retrieved_at !== "string" || !Number.isFinite(Date.parse(upstream.retrieved_at))
      || !pageIsBound
      || (upstream.next_cursor !== null && (
        typeof upstream.next_cursor !== "string" || upstream.next_cursor.length < 1
        || upstream.next_cursor.length > MAX_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(upstream.next_cursor)
      ))
    ) {
      return deny(
        "DENY_MEMORY_RETRIEVAL",
        "Memory gateway did not return an authority-bound page",
        "gateway",
        isPlainObject(upstream) && typeof upstream.code === "string" ? upstream.code : undefined
      );
    }
    return deepFreeze({
      ...upstream,
      actor_id: bindings.identity.actor_id,
      identity_decision_id: bindings.identity.decision_id,
      scope_decision_id: bindings.scope.decision_id,
      authority_decision_id: authority.decision_id
    });
  }

  return Object.freeze({ admit, retrieve });
}
