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
const MAX_NODE_TIMEOUT_MS = 2_147_483_647;
const DANGEROUS_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const ASCII_OUTPUT_KEY = /^[\x20-\x7e]+$/;
const SECRET_KEY_NORMALIZED = /(?:apikey|authorization|credential|password|passwd|privatekey|secret|token)/;
const SECRET_VALUE = /(?:\bbearer\s+[a-z0-9._~+\/-]{8,}|\b(?:sk|ghp|github_pat|xox[baprs])-[-a-z0-9_]{8,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/i;

const isBlank = (value) => typeof value !== "string" || value.trim() === "";
const deny = (code) => Object.freeze({ ok: false, deny_code: code, message: "request denied" });

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

function normalizeTimeouts(candidate) {
  const normalized = normalizeSettings(candidate, DEFAULT_TIMEOUTS, "timeouts");
  for (const [key, value] of Object.entries(normalized)) {
    if (value > MAX_NODE_TIMEOUT_MS) {
      throw new Error(`timeouts.${key} must not exceed ${MAX_NODE_TIMEOUT_MS}`);
    }
  }
  return normalized;
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

function normalizeAttemptedAt(value) {
  try {
    const epochMs = Date.prototype.getTime.call(value);
    if (!Number.isFinite(epochMs)) return null;
    return new Date(epochMs).toISOString();
  } catch {
    return null;
  }
}

function isSecretLikeKey(key) {
  try {
    const normalized = key.normalize("NFKC").replace(/[^a-z0-9]/gi, "").toLowerCase();
    return SECRET_KEY_NORMALIZED.test(normalized);
  } catch {
    return true;
  }
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
  const output = Object.create(null);
  for (const [key, entry] of Object.entries(value)) {
    if (DANGEROUS_OBJECT_KEYS.has(key)) throw new Error("dangerous object key");
    if (rejectSecrets && !ASCII_OUTPUT_KEY.test(key)) throw new Error("non-ASCII output key");
    if (rejectSecrets && isSecretLikeKey(key)) throw new Error("secret-like key");
    Object.defineProperty(output, key, {
      value: normalizeJson(entry, { rejectSecrets }, seen),
      enumerable: true,
      configurable: false,
      writable: false,
    });
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
  #dispatchGuard;
  #resultValidator;
  #limits;
  #timeouts;
  #capacityInUse = 0;

  constructor({
    capabilityRegistry,
    adapters,
    invocationLog,
    policy = null,
    now = () => new Date(),
    revocationCheck,
    dispatchGuard = revocationCheck,
    resultValidator,
    limits = DEFAULT_LIMITS,
    timeouts = DEFAULT_TIMEOUTS,
  } = {}) {
    if (!(capabilityRegistry instanceof Map)) throw new Error("McpGatewayCore requires a capabilityRegistry Map");
    if (!(adapters instanceof Map)) throw new Error("McpGatewayCore requires an adapters Map");
    if (typeof invocationLog !== "function") throw new Error("McpGatewayCore requires an invocationLog function (fail-closed audit)");
    if (policy !== null && typeof policy.allow !== "function") throw new Error("policy, when provided, requires an allow function");
    if (typeof now !== "function") throw new Error("now must be a function");
    if (typeof revocationCheck !== "function") throw new Error("McpGatewayCore requires a revocationCheck function (fail-closed kill switch)");
    if (typeof dispatchGuard !== "function") throw new Error("dispatchGuard must be a synchronous function");
    if (typeof resultValidator !== "function") throw new Error("resultValidator must be a function");

    this.#capabilities = snapshotCapabilities(capabilityRegistry);
    this.#adapters = snapshotAdapters(adapters);
    this.#invocationLog = invocationLog;
    this.#policyAllow = policy === null ? null : policy.allow.bind(policy);
    this.#now = now;
    this.#revocationCheck = revocationCheck;
    this.#dispatchGuard = dispatchGuard;
    this.#resultValidator = resultValidator;
    this.#limits = normalizeSettings(limits, DEFAULT_LIMITS, "limits");
    this.#timeouts = normalizeTimeouts(timeouts);
  }

  #auditEntry(context, capability, attemptedAt, disposition, reservation) {
    const field = (name) => isBlank(context?.[name]) ? null : context[name];
    const terminal = disposition === "SUCCESS"
      || disposition.startsWith("DENY_")
      || disposition.startsWith("FAILURE_")
      || disposition.startsWith("LATE_SETTLEMENT_");
    return Object.freeze({
      sequence: reservation.nextSequence++,
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

  #releaseCapacityIfComplete(reservation) {
    if (reservation.completed && reservation.pending.size === 0 && !reservation.released) {
      reservation.released = true;
      this.#capacityInUse -= 1;
    }
  }

  #holdCapacity(reservation, settlement) {
    reservation.pending.add(settlement);
    settlement.finally(() => {
      reservation.pending.delete(settlement);
      this.#releaseCapacityIfComplete(reservation);
    }).catch(() => {});
  }

  async #call(operation, timeoutMs, reservation) {
    const outcome = await boundedCall(operation, timeoutMs);
    if (outcome.status === "timeout") {
      this.#holdCapacity(reservation, outcome.settled);
    }
    return outcome;
  }

  async #audit(context, capability, attemptedAt, disposition, reservation, trackTimeout = true) {
    const outcome = await this.#call(
      () => this.#invocationLog(this.#auditEntry(context, capability, attemptedAt, disposition, reservation)),
      this.#timeouts.audit_ms,
      reservation,
    );
    if (trackTimeout && outcome.status === "timeout") {
      this.#scheduleLateSettlement("AUDIT", outcome, context, capability, attemptedAt, reservation);
    }
    return outcome.status === "ok";
  }

  async #denyAudited(code, context, capability, attemptedAt, reservation) {
    if (!(await this.#audit(context, capability, attemptedAt, code, reservation))) {
      return deny("DENY_AUDIT_UNAVAILABLE");
    }
    return deny(code);
  }

  #scheduleLateSettlement(hook, outcome, context, capability, attemptedAt, reservation) {
    const evidence = outcome.settled.then(async (settled) => {
      const suffix = settled.status === "ok" ? "SUCCESS" : "FAILURE";
      await this.#audit(
        context,
        capability,
        attemptedAt,
        `LATE_SETTLEMENT_${hook}_${suffix}`,
        reservation,
        false,
      );
    }).catch(() => {});
    this.#holdCapacity(reservation, evidence);
  }

  async #denyTimedOut(hook, outcome, code, context, capability, attemptedAt, reservation) {
    if (!(await this.#audit(context, capability, attemptedAt, `TIMEOUT_${hook}_PENDING`, reservation))) {
      return deny("DENY_AUDIT_UNAVAILABLE");
    }
    const denial = await this.#denyAudited(code, context, capability, attemptedAt, reservation);
    this.#scheduleLateSettlement(hook, outcome, context, capability, attemptedAt, reservation);
    return denial;
  }

  async invoke(requestContext, params = {}) {
    if (this.#capacityInUse >= this.#limits.max_concurrency) {
      return deny("DENY_CONCURRENCY_LIMIT");
    }
    this.#capacityInUse += 1;
    const reservation = { completed: false, pending: new Set(), released: false, nextSequence: 1 };

    try {
      let requestEnvelope;
      try {
        const contextSource = requestContext !== null
          && typeof requestContext === "object"
          && !Array.isArray(requestContext)
          && requestContext.evidence_required === undefined
          ? Object.fromEntries(Object.entries(requestContext).filter(([key]) => key !== "evidence_required"))
          : requestContext ?? {};
        requestEnvelope = cloneJson({
          request_context: contextSource,
          params: params ?? {},
        });
        if (byteLength(requestEnvelope) > this.#limits.max_request_bytes) throw new Error("request too large");
      } catch {
        const fallbackClock = await this.#call(this.#now, this.#timeouts.clock_ms, reservation);
        const fallbackAttemptedAt = fallbackClock.status === "ok" ? normalizeAttemptedAt(fallbackClock.value) : null;
        if (fallbackClock.status === "timeout") {
          return this.#denyTimedOut(
            "CLOCK",
            fallbackClock,
            "DENY_REQUEST_INVALID",
            {},
            null,
            null,
            reservation,
          );
        }
        return this.#denyAudited("DENY_REQUEST_INVALID", {}, null, fallbackAttemptedAt, reservation);
      }

      const context = snapshotContext(requestEnvelope.request_context);
      const adapterParams = requestEnvelope.params;
      const clock = await this.#call(this.#now, this.#timeouts.clock_ms, reservation);
      const attemptedAt = clock.status === "ok" ? normalizeAttemptedAt(clock.value) : null;
      if (attemptedAt === null) {
        if (clock.status === "timeout") {
          return this.#denyTimedOut(
            "CLOCK",
            clock,
            "DENY_CLOCK_UNAVAILABLE",
            context,
            null,
            null,
            reservation,
          );
        }
        return this.#denyAudited("DENY_CLOCK_UNAVAILABLE", context, null, null, reservation);
      }

      for (const field of REQUIRED_CONTEXT_FIELDS) {
        if (isBlank(context[field])) {
          return this.#denyAudited("DENY_CONTEXT", context, null, attemptedAt, reservation);
        }
      }
      if (context.evidence_required !== true) {
        return this.#denyAudited("DENY_CONTEXT", context, null, attemptedAt, reservation);
      }

      const capability = this.#capabilities.get(context.capability_id);
      if (!capability) {
        return this.#denyAudited("DENY_UNKNOWN_CAPABILITY", context, null, attemptedAt, reservation);
      }
      if (!capability.snapshot_valid || isBlank(capability.adapter_id) || isBlank(capability.tool) || typeof capability.access !== "string") {
        return this.#denyAudited("DENY_INVALID_CAPABILITY", context, capability, attemptedAt, reservation);
      }
      if (capability.access !== "read") {
        return this.#denyAudited("DENY_NON_READ", context, capability, attemptedAt, reservation);
      }

      const adapter = this.#adapters.get(capability.adapter_id);
      if (!adapter) {
        return this.#denyAudited("DENY_NO_ADAPTER", context, capability, attemptedAt, reservation);
      }

      if (this.#policyAllow !== null) {
        const policy = await this.#call(() => this.#policyAllow(context, capability), this.#timeouts.policy_ms, reservation);
        if (policy.status === "timeout") {
          return this.#denyTimedOut(
            "POLICY",
            policy,
            "DENY_POLICY_UNAVAILABLE",
            context,
            capability,
            attemptedAt,
            reservation,
          );
        }
        if (policy.status !== "ok") {
          return this.#denyAudited("DENY_POLICY_UNAVAILABLE", context, capability, attemptedAt, reservation);
        }
        if (policy.value !== true) {
          return this.#denyAudited("DENY_POLICY", context, capability, attemptedAt, reservation);
        }
      }

      const revocation = await this.#call(
        () => this.#revocationCheck(context, capability),
        this.#timeouts.revocation_ms,
        reservation,
      );
      if (revocation.status === "timeout") {
        return this.#denyTimedOut(
          "REVOCATION",
          revocation,
          "DENY_REVOCATION_UNAVAILABLE",
          context,
          capability,
          attemptedAt,
          reservation,
        );
      }
      if (revocation.status !== "ok") {
        return this.#denyAudited("DENY_REVOCATION_UNAVAILABLE", context, capability, attemptedAt, reservation);
      }
      if (revocation.value !== false) {
        return this.#denyAudited("DENY_REVOKED", context, capability, attemptedAt, reservation);
      }

      if (!(await this.#audit(context, capability, attemptedAt, "ALLOW_DISPATCH", reservation))) {
        return deny("DENY_AUDIT_UNAVAILABLE");
      }

      const dispatchRevocation = await this.#call(
        () => this.#revocationCheck(context, capability),
        this.#timeouts.revocation_ms,
        reservation,
      );
      if (dispatchRevocation.status === "timeout") {
        return this.#denyTimedOut(
          "REVOCATION",
          dispatchRevocation,
          "DENY_REVOCATION_UNAVAILABLE",
          context,
          capability,
          attemptedAt,
          reservation,
        );
      }
      if (dispatchRevocation.status !== "ok") {
        if (!(await this.#audit(context, capability, attemptedAt, "FAILURE_REVOCATION", reservation))) {
          return deny("DENY_AUDIT_UNAVAILABLE");
        }
        return deny("DENY_REVOCATION_UNAVAILABLE");
      }
      if (dispatchRevocation.value !== false) {
        if (!(await this.#audit(context, capability, attemptedAt, "FAILURE_REVOKED", reservation))) {
          return deny("DENY_AUDIT_UNAVAILABLE");
        }
        return deny("DENY_REVOKED");
      }

      let dispatchGuard;
      try {
        dispatchGuard = this.#dispatchGuard(context, capability);
      } catch {
        dispatchGuard = null;
      }
      if (dispatchGuard !== false) {
        if (dispatchGuard && typeof dispatchGuard.then === "function") {
          Promise.resolve(dispatchGuard).catch(() => {});
        }
        const code = dispatchGuard === true ? "DENY_REVOKED" : "DENY_REVOCATION_UNAVAILABLE";
        return this.#denyAudited(code, context, capability, attemptedAt, reservation);
      }

      let adapterStarted;
      try {
        // The synchronous guard and adapter start deliberately share one call stack.
        // Revocation after this point remains a cancellation/isolation residual.
        adapterStarted = adapter.invoke(capability.tool, adapterParams, context);
      } catch {
        if (!(await this.#audit(context, capability, attemptedAt, "FAILURE_ADAPTER", reservation))) {
          return deny("DENY_AUDIT_UNAVAILABLE");
        }
        return deny("DENY_ADAPTER_ERROR");
      }
      const adapterOutcome = await this.#call(() => adapterStarted, this.#timeouts.adapter_ms, reservation);
      if (adapterOutcome.status === "timeout") {
        return this.#denyTimedOut(
          "ADAPTER",
          adapterOutcome,
          "DENY_ADAPTER_TIMEOUT_PENDING",
          context,
          capability,
          attemptedAt,
          reservation,
        );
      }
      if (adapterOutcome.status !== "ok") {
        if (!(await this.#audit(context, capability, attemptedAt, "FAILURE_ADAPTER", reservation))) {
          return deny("DENY_AUDIT_UNAVAILABLE");
        }
        return deny("DENY_ADAPTER_ERROR");
      }

      let result;
      try {
        result = cloneJson(adapterOutcome.value, { rejectSecrets: true });
      } catch {
        if (!(await this.#audit(context, capability, attemptedAt, "FAILURE_RESULT", reservation))) {
          return deny("DENY_AUDIT_UNAVAILABLE");
        }
        return deny("DENY_RESULT_INVALID");
      }

      const validation = await this.#call(
        () => this.#resultValidator(result, context, capability),
        this.#timeouts.result_validator_ms,
        reservation,
      );
      if (validation.status === "timeout") {
        return this.#denyTimedOut(
          "RESULT_VALIDATOR",
          validation,
          "DENY_RESULT_INVALID",
          context,
          capability,
          attemptedAt,
          reservation,
        );
      }
      if (validation.status !== "ok" || validation.value !== true) {
        if (!(await this.#audit(context, capability, attemptedAt, "FAILURE_RESULT", reservation))) {
          return deny("DENY_AUDIT_UNAVAILABLE");
        }
        return deny("DENY_RESULT_INVALID");
      }

      const response = Object.freeze({
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
      if (byteLength(response) > this.#limits.max_response_bytes) {
        if (!(await this.#audit(context, capability, attemptedAt, "FAILURE_RESULT", reservation))) {
          return deny("DENY_AUDIT_UNAVAILABLE");
        }
        return deny("DENY_RESULT_INVALID");
      }

      if (!(await this.#audit(context, capability, attemptedAt, "SUCCESS", reservation))) {
        return deny("DENY_AUDIT_UNAVAILABLE");
      }

      return response;
    } finally {
      reservation.completed = true;
      this.#releaseCapacityIfComplete(reservation);
    }
  }
}
