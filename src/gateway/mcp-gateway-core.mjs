// SECB-MCP-P0-001 candidate gateway dispatch core (rules N-1..N-3). A pure
// policy-enforcement seam between harnesses and approved MCP adapters:
// no transport, no port, no filesystem, no process spawn — activation is a
// separate operator-authorized deployment step (same boundary as the P0-21
// run-secb-mcp-server skeleton). Deny-by-default: every path that is not an
// explicitly allowed read invocation returns a structured denial.
//
// Audit-first (fail-closed): the injected invocation log is called before
// adapter dispatch on every attempt, and a throwing log denies the call —
// an invocation that cannot be recorded must not happen.

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

const isBlank = (v) => typeof v !== "string" || v.trim() === "";

const deny = (code, message) => ({ ok: false, deny_code: code, message });

export class McpGatewayCore {
  #capabilities;
  #adapters;
  #invocationLog;
  #policy;
  #now;

  // capabilityRegistry: Map<capability_id, { adapter_id, tool, access }>
  // adapters: Map<adapter_id, { invoke(tool, params, context) }>
  // invocationLog: (entry) => void — MUST record every attempt; throwing => deny.
  // policy: optional { allow(context, capability) => boolean } — absent => allow
  //         (allowlist membership is still mandatory; policy only narrows).
  constructor({ capabilityRegistry, adapters, invocationLog, policy = null, now = () => new Date() } = {}) {
    if (!(capabilityRegistry instanceof Map)) throw new Error("McpGatewayCore requires a capabilityRegistry Map");
    if (!(adapters instanceof Map)) throw new Error("McpGatewayCore requires an adapters Map");
    if (typeof invocationLog !== "function") throw new Error("McpGatewayCore requires an invocationLog function (fail-closed audit)");
    if (policy !== null && typeof policy.allow !== "function") throw new Error("policy, when provided, requires an allow function");
    this.#capabilities = capabilityRegistry;
    this.#adapters = adapters;
    this.#invocationLog = invocationLog;
    this.#policy = policy;
    this.#now = now;
  }

  // Single entry point. Returns { ok: true, result, receipt } or a denial;
  // never throws for a caller-supplied condition.
  invoke(requestContext, params = {}) {
    const context = requestContext ?? {};
    for (const field of REQUIRED_CONTEXT_FIELDS) {
      if (isBlank(context[field])) return deny("DENY_CONTEXT", `request_context.${field} is required`);
    }
    if (context.evidence_required !== true) {
      return deny("DENY_CONTEXT", "request_context.evidence_required must be true in P0");
    }

    const capability = this.#capabilities.get(context.capability_id);
    if (!capability) return deny("DENY_UNKNOWN_CAPABILITY", `capability not in allowlist: ${context.capability_id}`);
    if (capability.access !== "read") {
      return deny("DENY_NON_READ", `P0 gateway profile is read-only; capability access is ${String(capability.access)}`);
    }
    if (this.#policy && this.#policy.allow(context, capability) !== true) {
      return deny("DENY_POLICY", `authorization policy denied capability: ${context.capability_id}`);
    }

    const adapter = this.#adapters.get(capability.adapter_id);
    if (!adapter || typeof adapter.invoke !== "function") {
      return deny("DENY_NO_ADAPTER", `no registered adapter for: ${String(capability.adapter_id)}`);
    }

    const attemptedAt = this.#now().toISOString();
    try {
      this.#invocationLog({
        attempted_at: attemptedAt,
        agent_id: context.agent_id,
        harness_id: context.harness_id,
        project_id: context.project_id,
        work_package_id: context.work_package_id,
        session_id: context.session_id,
        authorization_id: context.authorization_id,
        capability_id: context.capability_id,
        adapter_id: capability.adapter_id,
        tool: capability.tool,
        purpose: context.purpose,
      });
    } catch (error) {
      return deny("DENY_AUDIT_UNAVAILABLE", `invocation log failed; refusing to dispatch: ${error.message}`);
    }

    try {
      const result = adapter.invoke(capability.tool, params, context);
      return {
        ok: true,
        result,
        receipt: {
          capability_id: context.capability_id,
          adapter_id: capability.adapter_id,
          tool: capability.tool,
          work_package_id: context.work_package_id,
          session_id: context.session_id,
          attempted_at: attemptedAt,
          content_disposition: DATA_UNTRUSTED,
        },
      };
    } catch (error) {
      return deny("DENY_ADAPTER_ERROR", `adapter failed: ${error.message}`);
    }
  }
}
