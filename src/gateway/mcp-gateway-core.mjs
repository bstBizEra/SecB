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
const isBlank = (value) => typeof value !== "string" || value.trim() === "";
const deny = (code, message) => Object.freeze({ ok: false, deny_code: code, message });

function freezeDeep(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) freezeDeep(child, seen);
  return Object.freeze(value);
}

function snapshotContext(requestContext) {
  const source = requestContext ?? {};
  const snapshot = {};
  for (const field of REQUIRED_CONTEXT_FIELDS) snapshot[field] = source[field];
  snapshot.evidence_required = source.evidence_required;
  return Object.freeze(snapshot);
}

function snapshotCapabilities(registry) {
  const snapshot = new Map();
  for (const [capabilityId, capability] of registry) {
    snapshot.set(capabilityId, Object.freeze({
      adapter_id: capability?.adapter_id,
      tool: capability?.tool,
      access: capability?.access,
    }));
  }
  return snapshot;
}

function snapshotAdapters(adapters) {
  const snapshot = new Map();
  for (const [adapterId, adapter] of adapters) {
    snapshot.set(adapterId, typeof adapter?.invoke === "function"
      ? Object.freeze({ invoke: adapter.invoke.bind(adapter) })
      : null);
  }
  return snapshot;
}

export class McpGatewayCore {
  #capabilities;
  #adapters;
  #invocationLog;
  #policyAllow;
  #now;

  constructor({ capabilityRegistry, adapters, invocationLog, policy = null, now = () => new Date() } = {}) {
    if (!(capabilityRegistry instanceof Map)) throw new Error("McpGatewayCore requires a capabilityRegistry Map");
    if (!(adapters instanceof Map)) throw new Error("McpGatewayCore requires an adapters Map");
    if (typeof invocationLog !== "function") throw new Error("McpGatewayCore requires an invocationLog function (fail-closed audit)");
    if (policy !== null && typeof policy.allow !== "function") throw new Error("policy, when provided, requires an allow function");
    if (typeof now !== "function") throw new Error("now must be a function");

    this.#capabilities = snapshotCapabilities(capabilityRegistry);
    this.#adapters = snapshotAdapters(adapters);
    this.#invocationLog = invocationLog;
    this.#policyAllow = policy === null ? null : policy.allow.bind(policy);
    this.#now = now;
  }

  #auditEntry(context, capability, attemptedAt, disposition) {
    const field = (name) => isBlank(context?.[name]) ? null : context[name];
    return Object.freeze({
      attempted_at: attemptedAt,
      disposition,
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

  async #audit(context, capability, attemptedAt, disposition) {
    try {
      await this.#invocationLog(this.#auditEntry(context, capability, attemptedAt, disposition));
      return true;
    } catch {
      return false;
    }
  }

  async #denyAudited(code, message, context, capability, attemptedAt) {
    if (!(await this.#audit(context, capability, attemptedAt, code))) {
      return deny("DENY_AUDIT_UNAVAILABLE", "invocation audit unavailable; request denied");
    }
    return deny(code, message);
  }

  // The async boundary contains policy, clock, audit, and adapter failures.
  // Every invocation attempt produces one pre-dispatch ALLOW or DENY audit
  // disposition. Caller-controlled data is snapshotted before evaluation.
  async invoke(requestContext, params = {}) {
    let context;
    try {
      context = snapshotContext(requestContext);
    } catch {
      context = Object.freeze({});
    }

    let attemptedAt = null;
    try {
      const observed = await this.#now();
      if (!(observed instanceof Date) || Number.isNaN(observed.getTime())) throw new Error("invalid clock result");
      attemptedAt = observed.toISOString();
    } catch {
      return this.#denyAudited(
        "DENY_CLOCK_UNAVAILABLE",
        "gateway clock unavailable; request denied",
        context,
        null,
        null,
      );
    }

    for (const field of REQUIRED_CONTEXT_FIELDS) {
      if (isBlank(context[field])) {
        return this.#denyAudited("DENY_CONTEXT", `request_context.${field} is required`, context, null, attemptedAt);
      }
    }
    if (context.evidence_required !== true) {
      return this.#denyAudited(
        "DENY_CONTEXT",
        "request_context.evidence_required must be true in P0",
        context,
        null,
        attemptedAt,
      );
    }

    const capability = this.#capabilities.get(context.capability_id);
    if (!capability) {
      return this.#denyAudited(
        "DENY_UNKNOWN_CAPABILITY",
        `capability not in allowlist: ${context.capability_id}`,
        context,
        null,
        attemptedAt,
      );
    }
    if (isBlank(capability.adapter_id) || isBlank(capability.tool)) {
      return this.#denyAudited(
        "DENY_INVALID_CAPABILITY",
        "capability routing record is invalid",
        context,
        capability,
        attemptedAt,
      );
    }
    if (capability.access !== "read") {
      return this.#denyAudited(
        "DENY_NON_READ",
        `P0 gateway profile is read-only; capability access is ${String(capability.access)}`,
        context,
        capability,
        attemptedAt,
      );
    }

    if (this.#policyAllow !== null) {
      let allowed = false;
      try {
        allowed = await this.#policyAllow(context, capability);
      } catch {
        return this.#denyAudited(
          "DENY_POLICY_UNAVAILABLE",
          "authorization policy unavailable; request denied",
          context,
          capability,
          attemptedAt,
        );
      }
      if (allowed !== true) {
        return this.#denyAudited(
          "DENY_POLICY",
          `authorization policy denied capability: ${context.capability_id}`,
          context,
          capability,
          attemptedAt,
        );
      }
    }

    const adapter = this.#adapters.get(capability.adapter_id);
    if (!adapter) {
      return this.#denyAudited(
        "DENY_NO_ADAPTER",
        `no registered adapter for: ${capability.adapter_id}`,
        context,
        capability,
        attemptedAt,
      );
    }

    let adapterParams;
    try {
      adapterParams = freezeDeep(structuredClone(params ?? {}));
    } catch {
      return this.#denyAudited(
        "DENY_PARAMS",
        "request parameters are not safely cloneable",
        context,
        capability,
        attemptedAt,
      );
    }

    if (!(await this.#audit(context, capability, attemptedAt, "ALLOW_DISPATCH"))) {
      return deny("DENY_AUDIT_UNAVAILABLE", "invocation audit unavailable; request denied");
    }

    let result;
    try {
      result = await adapter.invoke(capability.tool, adapterParams, context);
    } catch {
      return deny("DENY_ADAPTER_ERROR", "adapter invocation failed");
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
      }),
    });
  }
}
