// SECB-MCP-P0-001 candidate gateway dispatch core (rules N-1..N-3).
// Pure in-process policy enforcement only: no transport, port, filesystem,
// network, credential access, or process spawning. Runtime activation remains
// a separate operator-authorized step.

export const REQUIRED_CONTEXT_FIELDS = Object.freeze([
  "agent_id",
  "harness_id",
  "project_id",
  "work_package_id",
  "workspace_lease_id",
  "session_id",
  "authorization_id",
  "capability_id",
  "purpose",
]);

const DATA_UNTRUSTED = "data_untrusted";
const DEFAULT_LIMITS = Object.freeze({
  max_request_bytes: 64 * 1024,
  max_response_bytes: 256 * 1024,
  max_concurrency: 4,
});
const DEFAULT_TIMEOUTS = Object.freeze({
  clock_ms: 250,
  policy_ms: 250,
  audit_ms: 250,
  adapter_ms: 1_000,
  revocation_ms: 250,
  result_validator_ms: 250,
});
const SECRET_KEY = /(?:^|_)(?:api_?key|authorization|credential|password|passwd|private_?key|secret|token)(?:$|_)/i;
const SECRET_VALUE = /(?:\bbearer\s+[a-z0-9._~+\/-]{8,}|\b(?:sk|ghp|github_pat|xox[baprs])-[-a-z0-9_]{8,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/i;

const isBlank = (value) => typeof value !== "string" || value.trim() === "";
const deny = (code, message) => Object.freeze({ ok: false, deny_code: code, message });

function positiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive safe integer`);
  return value;
}

function normalizeSettings(candidate, defaults, name) {
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error(`${name} must be an object`);
  }
  const normalized = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    normalized[key] = positiveInteger(candidate[key] ?? fallback, `${name}.${key}`);
  }
  return Object.freeze(normalized);
}

function safeRead(source, field) {
  try {
    return { ok: true, value: source?.[field] };
  } catch {
    return { ok: false, value: undefined };
  }
}

function snapshotContext(requestContext) {
  const source = requestContext ?? {};
  const snapshot = {};
  for (const field of [...REQUIRED_CONTEXT_FIELDS, "evidence_required"]) {
    const observed = safeRead(source, field);
    if (!observed.ok) return Object.freeze({});
    snapshot[field] = observed.value;
  }
  return Object.freeze(snapshot);
}

function snapshotCapabilities(registry) {
  const snapshot = new Map();
  for (const [capabilityId, capability] of registry) {
    const adapterId = safeRead(capability, "adapter_id");
    const tool = safeRead(capability, "tool");
    const access = safeRead(capability, "access");
    snapshot.set(capabilityId, Object.freeze({
      snapshot_valid: adapterId.ok && tool.ok && access.ok,
      adapter_id: adapterId.value,
      tool: tool.value,
      access: access.value,
    }));
  }
  return snapshot;
}

function snapshotAdapters(adapters) {
  const snapshot = new Map();
  for (const [adapterId, adapter] of adapters) {
    const invoke = safeRead(adapter, "invoke");
    let bound = null;
    if (invoke.ok && typeof invoke.value === "function") {
      try {
        bound = invoke.value.bind(adapter);
      } catch {
        bound = null;
      }
    }
    snapshot.set(adapterId, bound === null ? null : Object.freeze({ invoke: bound }));
  }
  return snapshot;
}

function normalizeJson(value, { rejectSecrets = false } = {}, seen = new WeakSet()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    if (rejectSecrets && typeof value === "string" && SECRET_VALUE.test(value)) throw new Error("secret-like value");
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite number");
    return value;
  }
  if (typeof value !== "object" || seen.has(value)) throw new Error("non-JSON value");
  seen.add(value);
  if (Array.isArray(value)) {
    const output = value.map((entry) => normalizeJson(entry, { rejectSecrets }, seen));
    seen.delete(value);
    return Object.freeze(output);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error("non-plain object");
  const output = {};
  for (const [key, entry] of Object.entries(value)) {
    if (rejectSecrets && SECRET_KEY.test(key)) throw new Error("secret-like key");
    output[key] = normalizeJson(entry, { rejectSecrets }, seen);
  }
  seen.delete(value);
  return Object.freeze(output);
}

function cloneJson(value, options) {
  return normalizeJson(structuredClone(value), options);
}

function byteLength(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

async function boundedCall(operation, timeoutMs) {
  let timer;
  const operationPromise = Promise.resolve().then(operation).then(
    (value) => ({ status: "ok", value }),
    () => ({ status: "error" }),
  );
  const timeoutPromise = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ status: "timeout" }), timeoutMs);
  });
  const outcome = await Promise.race([operationPromise, timeoutPromise]);
  clearTimeout(timer);
  return outcome.status === "timeout" ? { ...outcome, settled: operationPromise } : outcome;
}

export class McpGatewayCore {
  #capabilities;
  #adapters;
  #invocationLog;
  #policyAllow;
  #now;
  #revocationCheck;
  #resultValidator;
  #limits;
  #timeouts;
  #activeInvocations = 0;
  #timedOutOperations = 0;

  constructor({
    capabilityRegistry,
    adapters,
    invocationLog,
    policy = null,
    now = () => new Date(),
    revocationCheck,
    resultValidator = () => true,
    limits = DEFAULT_LIMITS,
    timeouts = DEFAULT_TIMEOUTS,
  } = {}) {
    if (!(capabilityRegistry instanceof Map)) throw new Error("McpGatewayCore requires a capabilityRegistry Map");
    if (!(adapters instanceof Map)) throw new Error("McpGatewayCore requires an adapters Map");
    if (typeof invocationLog !== "function") throw new Error("McpGatewayCore requires an invocationLog function (fail-closed audit)");
    if (policy !== null && typeof policy.allow !== "function") throw new Error("policy, when provided, requires an allow function");
    if (typeof now !== "function") throw new Error("now must be a function");
    if (typeof revocationCheck !== "function") throw new Error("McpGatewayCore requires a revocationCheck function (fail-closed kill switch)");
    if (typeof resultValidator !== "function") throw new Error("resultValidator must be a function");

    this.#capabilities = snapshotCapabilities(capabilityRegistry);
    this.#adapters = snapshotAdapters(adapters);
    this.#invocationLog = invocationLog;
    this.#policyAllow = policy === null ? null : policy.allow.bind(policy);
    this.#now = now;
    this.#revocationCheck = revocationCheck;
    this.#resultValidator = resultValidator;
    this.#limits = normalizeSettings(limits, DEFAULT_LIMITS, "limits");
    this.#timeouts = normalizeSettings(timeouts, DEFAULT_TIMEOUTS, "timeouts");
  }

  #auditEntry(context, capability, attemptedAt, disposition) {
    const field = (name) => isBlank(context?.[name]) ? null : context[name];
    const terminal = disposition === "SUCCESS" || disposition.startsWith("FAILURE_");
    return Object.freeze({
      attempted_at: attemptedAt,
      disposition,
      terminal,
      evidence_disposition: terminal ? "EVIDENCE_CANDIDATE_NOT_ACCEPTED" : null,
      agent_id: field("agent_id"),
      harness_id: field("harness_id"),
      project_id: field("project_id"),
      work_package_id: field("work_package_id"),
      workspace_lease_id: field("workspace_lease_id"),
      session_id: field("session_id"),
      authorization_id: field("authorization_id"),
      capability_id: field("capability_id"),
      adapter_id: isBlank(capability?.adapter_id) ? null : capability.adapter_id,
      tool: isBlank(capability?.tool) ? null : capability.tool,
      purpose: field("purpose"),
    });
  }

  async #call(operation, timeoutMs) {
    const outcome = await boundedCall(operation, timeoutMs);
    if (outcome.status === "timeout") {
      this.#timedOutOperations += 1;
      outcome.settled.then(() => { this.#timedOutOperations -= 1; });
    }
    return outcome;
  }

  async #audit(context, capability, attemptedAt, disposition) {
    const outcome = await this.#call(
      () => this.#invocationLog(this.#auditEntry(context, capability, attemptedAt, disposition)),
      this.#timeouts.audit_ms,
    );
    return outcome.status === "ok";
  }

  async #denyAudited(code, message, context, capability, attemptedAt) {
    if (!(await this.#audit(context, capability, attemptedAt, code))) {
      return deny("DENY_AUDIT_UNAVAILABLE", "invocation audit unavailable; request denied");
    }
    return deny(code, message);
  }

  async invoke(requestContext, params = {}) {
    const context = snapshotContext(requestContext);
    const clock = await this.#call(this.#now, this.#timeouts.clock_ms);
    let attemptedAt = null;
    if (clock.status === "ok" && clock.value instanceof Date && !Number.isNaN(clock.value.getTime())) {
      attemptedAt = clock.value.toISOString();
    } else {
      return this.#denyAudited("DENY_CLOCK_UNAVAILABLE", "gateway clock unavailable; request denied", context, null, null);
    }

    for (const field of REQUIRED_CONTEXT_FIELDS) {
      if (isBlank(context[field])) {
        return this.#denyAudited("DENY_CONTEXT", `request_context.${field} is required`, context, null, attemptedAt);
      }
    }
    if (context.evidence_required !== true) {
      return this.#denyAudited("DENY_CONTEXT", "request_context.evidence_required must be true in P0", context, null, attemptedAt);
    }

    const capability = this.#capabilities.get(context.capability_id);
    if (!capability) {
      return this.#denyAudited("DENY_UNKNOWN_CAPABILITY", `capability not in allowlist: ${context.capability_id}`, context, null, attemptedAt);
    }
    if (!capability.snapshot_valid || isBlank(capability.adapter_id) || isBlank(capability.tool) || typeof capability.access !== "string") {
      return this.#denyAudited("DENY_INVALID_CAPABILITY", "capability routing record is invalid", context, capability, attemptedAt);
    }
    if (capability.access !== "read") {
      return this.#denyAudited("DENY_NON_READ", "P0 gateway profile is read-only", context, capability, attemptedAt);
    }

    const adapter = this.#adapters.get(capability.adapter_id);
    if (!adapter) {
      return this.#denyAudited("DENY_NO_ADAPTER", `no registered adapter for: ${capability.adapter_id}`, context, capability, attemptedAt);
    }

    let adapterParams;
    try {
      adapterParams = cloneJson(params ?? {});
      if (byteLength({ request_context: context, params: adapterParams }) > this.#limits.max_request_bytes) throw new Error("request too large");
    } catch {
      return this.#denyAudited("DENY_REQUEST_INVALID", "request exceeds bounds or is not safely serializable", context, capability, attemptedAt);
    }

    if (this.#activeInvocations + this.#timedOutOperations >= this.#limits.max_concurrency) {
      return this.#denyAudited("DENY_CONCURRENCY_LIMIT", "gateway concurrency limit reached; request denied", context, capability, attemptedAt);
    }
    this.#activeInvocations += 1;

    try {
      if (this.#policyAllow !== null) {
        const policy = await this.#call(() => this.#policyAllow(context, capability), this.#timeouts.policy_ms);
        if (policy.status !== "ok") {
          return this.#denyAudited("DENY_POLICY_UNAVAILABLE", "authorization policy unavailable; request denied", context, capability, attemptedAt);
        }
        if (policy.value !== true) {
          return this.#denyAudited("DENY_POLICY", `authorization policy denied capability: ${context.capability_id}`, context, capability, attemptedAt);
        }
      }

      const revocation = await this.#call(
        () => this.#revocationCheck(context, capability),
        this.#timeouts.revocation_ms,
      );
      if (revocation.status !== "ok") {
        return this.#denyAudited("DENY_REVOCATION_UNAVAILABLE", "revocation control unavailable; request denied", context, capability, attemptedAt);
      }
      if (revocation.value !== false) {
        return this.#denyAudited("DENY_REVOKED", "authorization or gateway capability is revoked; request denied", context, capability, attemptedAt);
      }

      if (!(await this.#audit(context, capability, attemptedAt, "ALLOW_DISPATCH"))) {
        return deny("DENY_AUDIT_UNAVAILABLE", "invocation audit unavailable; request denied");
      }

      const adapterOutcome = await this.#call(
        () => adapter.invoke(capability.tool, adapterParams, context),
        this.#timeouts.adapter_ms,
      );
      if (adapterOutcome.status !== "ok") {
        if (!(await this.#audit(context, capability, attemptedAt, "FAILURE_ADAPTER"))) {
          return deny("DENY_AUDIT_UNAVAILABLE", "invocation audit unavailable; request denied");
        }
        return deny("DENY_ADAPTER_ERROR", "adapter invocation failed");
      }

      let result;
      try {
        result = cloneJson(adapterOutcome.value, { rejectSecrets: true });
        if (byteLength(result) > this.#limits.max_response_bytes) throw new Error("response too large");
      } catch {
        if (!(await this.#audit(context, capability, attemptedAt, "FAILURE_RESULT"))) {
          return deny("DENY_AUDIT_UNAVAILABLE", "invocation audit unavailable; request denied");
        }
        return deny("DENY_RESULT_INVALID", "adapter result failed output controls");
      }

      const validation = await this.#call(
        () => this.#resultValidator(result, context, capability),
        this.#timeouts.result_validator_ms,
      );
      if (validation.status !== "ok" || validation.value !== true) {
        if (!(await this.#audit(context, capability, attemptedAt, "FAILURE_RESULT"))) {
          return deny("DENY_AUDIT_UNAVAILABLE", "invocation audit unavailable; request denied");
        }
        return deny("DENY_RESULT_INVALID", "adapter result failed output controls");
      }

      if (!(await this.#audit(context, capability, attemptedAt, "SUCCESS"))) {
        return deny("DENY_AUDIT_UNAVAILABLE", "terminal invocation audit unavailable; result withheld");
      }

      return Object.freeze({
        ok: true,
        result,
        receipt: Object.freeze({
          capability_id: context.capability_id,
          adapter_id: capability.adapter_id,
          tool: capability.tool,
          work_package_id: context.work_package_id,
          workspace_lease_id: context.workspace_lease_id,
          session_id: context.session_id,
          authorization_id: context.authorization_id,
          attempted_at: attemptedAt,
          content_disposition: DATA_UNTRUSTED,
          terminal_disposition: "SUCCESS",
        }),
      });
    } finally {
      this.#activeInvocations -= 1;
    }
  }
}
