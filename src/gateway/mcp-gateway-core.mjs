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
// Value screen. The provider-token alternative uses a [-_] separator (matching
// the broker's SECRET_MATERIAL) so underscore-delimited tokens (ghp_,
// github_pat_, sk_) are caught, not just hyphen forms (FU-2 / Gap C). The AWS
// access-key id (AKIA + 16 upper-alnum) is distinctive enough to screen at the
// value level regardless of field name (FU-3 / A-FIND-2).
const SECRET_VALUE = /(?:\bbearer\s+[a-z0-9._~+\/-]{8,}|\b(?:sk|ghp|github_pat|xox[baprs])[-_][-a-z0-9_]{8,}|\bAKIA[0-9A-Z]{16}\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/i;
// AWS secret access keys are 40 base64-ish chars with NO distinctive prefix, so
// they are indistinguishable from ordinary base64/hex hashes. Screening every
// 40-char value would cause false-positive explosions, so this heuristic fires
// ONLY when the field name itself signals AWS access-key/secret material
// (AWS_SECRET_FIELD). Fields already matching SECRET_KEY_NORMALIZED are rejected
// wholesale by the key screen; this narrows the residual gap where an AWS secret
// hides under an aws/access-key-named field that the key screen does not cover.
const AWS_SECRET_VALUE = /(?<![A-Za-z0-9/+])[A-Za-z0-9/+]{40}(?![A-Za-z0-9/+])/;
const AWS_SECRET_FIELD = /(?:awssecret|accesskey|secretaccesskey)/;
const JSON_STRINGIFY_PRIMITIVE = JSON.stringify.bind(JSON);

const isBlank = (value) => typeof value !== "string" || value.trim() === "";

function hardenedRecord(entries) {
  const output = Object.create(null);
  for (const [key, value] of entries) {
    Object.defineProperty(output, key, {
      value,
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  return Object.freeze(output);
}

const deny = (code, evidenceStatus = null) => hardenedRecord([
  ["ok", false],
  ["deny_code", code],
  ["message", "request denied"],
  ...(evidenceStatus === null ? [] : [["evidence_status", evidenceStatus]]),
]);

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

// Field-name gate for the AWS secret-key value heuristic (see AWS_SECRET_VALUE).
// Fail-closed to true on any error, matching isSecretLikeKey.
function isAwsSecretField(key) {
  try {
    const normalized = key.normalize("NFKC").replace(/[^a-z0-9]/gi, "").toLowerCase();
    return AWS_SECRET_FIELD.test(normalized);
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
    const output = [];
    Object.setPrototypeOf(output, null);
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor)) throw new Error("sparse or accessor array");
      Object.defineProperty(output, String(index), {
        value: normalizeJson(descriptor.value, { rejectSecrets }, seen),
        enumerable: true,
        configurable: false,
        writable: false,
      });
    }
    const enumerableKeys = Object.keys(value);
    if (enumerableKeys.length !== value.length) {
      throw new Error("non-canonical array properties");
    }
    for (let index = 0; index < enumerableKeys.length; index += 1) {
      if (enumerableKeys[index] !== String(index)) throw new Error("non-canonical array properties");
    }
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
    if (rejectSecrets && isAwsSecretField(key) && typeof entry === "string" && AWS_SECRET_VALUE.test(entry)) {
      throw new Error("aws secret-key-shaped value");
    }
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

function canonicalJson(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
    return JSON_STRINGIFY_PRIMITIVE(value);
  }
  if (Array.isArray(value)) {
    let serialized = "[";
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor)) throw new Error("non-canonical array");
      if (index > 0) serialized += ",";
      serialized += canonicalJson(descriptor.value);
    }
    return `${serialized}]`;
  }
  if (value === null || typeof value !== "object" || Object.getPrototypeOf(value) !== null) {
    throw new Error("non-canonical object");
  }
  const keys = Object.keys(value);
  let serialized = "{";
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) throw new Error("non-canonical property");
    if (index > 0) serialized += ",";
    serialized += `${JSON_STRINGIFY_PRIMITIVE(key)}:${canonicalJson(descriptor.value)}`;
  }
  return `${serialized}}`;
}

function byteLength(value) {
  return new TextEncoder().encode(canonicalJson(value)).byteLength;
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
  #overflowEvidenceBusy = false;

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
    return hardenedRecord([
      ["sequence", reservation.nextSequence++],
      ["attempted_at", attemptedAt],
      ["disposition", disposition],
      ["terminal", terminal],
      ["evidence_disposition", terminal ? "EVIDENCE_CANDIDATE_NOT_ACCEPTED" : null],
      ["agent_id", field("agent_id")],
      ["harness_id", field("harness_id")],
      ["project_id", field("project_id")],
      ["work_package_id", field("work_package_id")],
      ["workspace_lease_id", field("workspace_lease_id")],
      ["session_id", field("session_id")],
      ["authorization_id", field("authorization_id")],
      ["capability_id", field("capability_id")],
      ["adapter_id", isBlank(capability?.adapter_id) ? null : capability.adapter_id],
      ["tool", isBlank(capability?.tool) ? null : capability.tool],
      ["purpose", field("purpose")],
    ]);
  }

  #newReservation(countsExecution) {
    let resolveDrained;
    const drained = new Promise((resolve) => { resolveDrained = resolve; });
    return {
      completed: false,
      pending: new Set(),
      released: false,
      nextSequence: 1,
      countsExecution,
      auditRecovery: Promise.resolve(),
      drained,
      resolveDrained,
    };
  }

  #releaseCapacityIfComplete(reservation) {
    if (reservation.completed && reservation.pending.size === 0 && !reservation.released) {
      reservation.released = true;
      if (reservation.countsExecution) this.#capacityInUse -= 1;
      reservation.resolveDrained();
    }
  }

  #holdCapacity(reservation, settlement) {
    reservation.pending.add(settlement);
    // Bounded abandonment (GATE2-BLOCKING-001): a truly-never-settling
    // hook/sink cannot be forced to resolve (no cross-realm cancellation in
    // JS), so this reservation's capacity slot must still be reclaimed on a
    // bound, or a hung hook permanently wedges #capacityInUse. This applies
    // only to settlements that already TIMED OUT and were handed here by
    // #call -- still-active work within its own timeout budget is never
    // released early (the overflow-evidence lane itself is separately
    // bounded via #overflowEvidenceBusy backpressure and cannot wedge).
    // Abandoning the pending entry after a bound does not stop `settlement`
    // from continuing in the background -- it only stops counting it against
    // capacity. If it later settles anyway, the .finally() below still fires
    // and is a safe no-op against an already-abandoned entry.
    const abandon = setTimeout(() => {
      if (reservation.pending.delete(settlement)) {
        this.#releaseCapacityIfComplete(reservation);
      }
    }, this.#timeouts.audit_ms * 4);
    settlement.finally(() => {
      clearTimeout(abandon);
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
      this.#scheduleAuditTimeout(outcome, context, capability, attemptedAt, reservation);
    }
    return outcome.status === "ok";
  }

  #scheduleAuditTimeout(outcome, context, capability, attemptedAt, reservation) {
    const previousRecovery = reservation.auditRecovery;
    const recovery = previousRecovery.catch(() => {}).then(async () => {
      const settled = await outcome.settled;
      const pending = await this.#call(
        () => this.#invocationLog(this.#auditEntry(
          context,
          capability,
          attemptedAt,
          "TIMEOUT_AUDIT_PENDING",
          reservation,
        )),
        this.#timeouts.audit_ms,
        reservation,
      );
      if (pending.status === "timeout") await pending.settled;
      const suffix = settled.status === "ok" ? "SUCCESS" : "FAILURE";
      const late = await this.#call(
        () => this.#invocationLog(this.#auditEntry(
          context,
          capability,
          attemptedAt,
          `LATE_SETTLEMENT_AUDIT_${suffix}`,
          reservation,
        )),
        this.#timeouts.audit_ms,
        reservation,
      );
      if (late.status === "timeout") await late.settled;
    }).catch(() => {});
    reservation.auditRecovery = recovery;
    this.#holdCapacity(reservation, recovery);
  }

  async #denyAudited(code, context, capability, attemptedAt, reservation) {
    if (!(await this.#audit(context, capability, attemptedAt, code, reservation))) {
      return deny("DENY_AUDIT_UNAVAILABLE");
    }
    return deny(code);
  }

  #scheduleLateSettlement(hook, outcome, context, capability, attemptedAt, reservation) {
    const auditRecovery = reservation.auditRecovery;
    const evidence = outcome.settled.then(async (settled) => {
      await auditRecovery.catch(() => {});
      const suffix = settled.status === "ok" ? "SUCCESS" : "FAILURE";
      await this.#audit(
        context,
        capability,
        attemptedAt,
        `LATE_SETTLEMENT_${hook}_${suffix}`,
        reservation,
      );
    }).catch(() => {});
    this.#holdCapacity(reservation, evidence);
  }

  async #denyTimedOut(hook, outcome, code, context, capability, attemptedAt, reservation) {
    const pendingRecorded = await this.#audit(
      context,
      capability,
      attemptedAt,
      `TIMEOUT_${hook}_PENDING`,
      reservation,
    );
    const denial = pendingRecorded
      ? await this.#denyAudited(code, context, capability, attemptedAt, reservation)
      : deny("DENY_AUDIT_UNAVAILABLE");
    this.#scheduleLateSettlement(hook, outcome, context, capability, attemptedAt, reservation);
    return denial;
  }

  async #denyConcurrencyAudited(requestContext) {
    if (this.#overflowEvidenceBusy) {
      return deny("DENY_CONCURRENCY_LIMIT", "EVIDENCE_NOT_RECORDED_BACKPRESSURE");
    }
    this.#overflowEvidenceBusy = true;
    const context = snapshotContext(requestContext);
    const capability = this.#capabilities.get(context.capability_id) ?? null;
    const evidenceSequence = { nextSequence: 1 };
    const outcome = await boundedCall(
      () => this.#invocationLog(this.#auditEntry(
        context,
        capability,
        null,
        "DENY_CONCURRENCY_LIMIT",
        evidenceSequence,
      )),
      this.#timeouts.audit_ms,
    );

    if (outcome.status === "timeout") {
      // The caller is bounded, but the single evidence slot remains occupied
      // until the underlying callback actually settles. Later overflow calls
      // receive explicit backpressure instead of joining an unbounded queue.
      outcome.settled.finally(() => {
        this.#overflowEvidenceBusy = false;
      }).catch(() => {});
      return deny("DENY_CONCURRENCY_LIMIT", "EVIDENCE_RECORDING_TIMEOUT_UNCONFIRMED");
    }

    this.#overflowEvidenceBusy = false;
    if (outcome.status === "ok") {
      return deny("DENY_CONCURRENCY_LIMIT", "EVIDENCE_CANDIDATE_RECORDED_NOT_ACCEPTED");
    }
    return deny("DENY_CONCURRENCY_LIMIT", "EVIDENCE_RECORDING_FAILED");
  }

  async invoke(requestContext, params = {}) {
    if (this.#capacityInUse >= this.#limits.max_concurrency) {
      return this.#denyConcurrencyAudited(requestContext);
    }
    this.#capacityInUse += 1;
    const reservation = this.#newReservation(true);

    try {
      let requestEnvelope;
      try {
        const evidenceRequired = safeRead(requestContext, "evidence_required");
        if (!evidenceRequired.ok) throw new Error("invalid request context");
        const contextSource = requestContext !== null
          && typeof requestContext === "object"
          && !Array.isArray(requestContext)
          && evidenceRequired.value === undefined
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

      const receipt = hardenedRecord([
        ["capability_id", context.capability_id],
        ["adapter_id", capability.adapter_id],
        ["tool", capability.tool],
        ["work_package_id", context.work_package_id],
        ["workspace_lease_id", context.workspace_lease_id],
        ["session_id", context.session_id],
        ["authorization_id", context.authorization_id],
        ["attempted_at", attemptedAt],
        ["content_disposition", DATA_UNTRUSTED],
        ["terminal_disposition", "SUCCESS"],
      ]);
      const response = hardenedRecord([
        ["ok", true],
        ["result", result],
        ["receipt", receipt],
      ]);
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
