import { resolve } from "node:path";

import { canonicalFingerprint } from "../contracts/canonical-fingerprint.mjs";
import { findReservedDelimiter } from "../contracts/reserved-delimiters.mjs";
import { validateContract } from "../contracts/contract-validator.mjs";
import { classificationDecision, projectEvents, projectEvidence } from "../ui/report-projections.mjs";
import { CATALOG_BY_NAME, PINNED_PROTOCOL_VERSION, TOOL_CATALOG, TOOL_LIST_PROJECTION } from "./tool-catalog.mjs";
import { formatGraphDataForDashboard } from "../../tools/build-graphify-data.mjs";
import { SecBAgentRegistry } from "../gateway/secb-agent-registry.mjs";
import { SecBSkillsHub } from "../skills/skills-hub-service.mjs";
import { secbWorktreeStatus, secbWorktreeListCrates, secbWorktreeInspectStorage } from "./worktree-mcp-tools.mjs";
import { ProjectRegistrationService } from "../project/project-registration-service.mjs";
import { projectRegistrationProjection } from "../ui/registration-projection.mjs";
import { SecBPlaneAdapter } from "../plugins/secb-plane-adapter.mjs";
import { CrossProjectKnowledgeService } from "../services/cross-project-knowledge.mjs";
import { SwarmDelegationService } from "../services/swarm-delegation-service.mjs";
import { SecBModuleRecommender } from "../control/module-recommender.mjs";
import { SecondBrainService } from "../brain/second-brain-service.mjs";
import { KnowledgeMaturityPipeline } from "../brain/knowledge-maturity-pipeline.mjs";
import { ProjectWorktreeManager } from "../project/project-worktree-manager.mjs";
import { ProjectMilestoneService } from "../project/project-milestone-service.mjs";
import { ImplementationMergeOrchestrator } from "../control/implementation-merge-orchestrator.mjs";
import { SecBOpenProjectAdapter } from "../plugins/secb-openproject-adapter.mjs";
import { SecBControlPlaneBus } from "../bus/secb-control-plane-bus.mjs";
import { MemoryConsolidationService } from "../memory/memory-consolidation-service.mjs";
import { CommandCenterDashboardServer } from "../ui/dashboard-server.mjs";
import { getSystemSettings } from "../config/system-settings.mjs";
import { GovernanceAuditDossier } from "../control/governance-audit-dossier.mjs";
import { detectHost, loadUpstreamRegistry, resolveRegistry } from "./upstream-registry.mjs";

// P0-21 SecB MCP Server dispatch core (GOV-MCP-01..09, adopted). A
// projection of existing authority, never a source of it: every answer is
// one the caller could obtain by running the underlying service under the
// same policy. Deleting the server removes a convenience, never an
// authority. Deny-by-default: five JSON-RPC methods, everything else
// method-not-found; nine READ-ONLY tools, everything else unknown-tool.
//
// HONESTY (SARCHI-AA-01): caller identity is resolved against the seeded
// registry, but the real enforcement boundary is the OS process spawn -
// these checks bind cooperative callers. Alpha is read-only precisely
// because caller identity cannot be cryptographically verified yet.

const CLASS_ORDER = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"];
const DATA_UNTRUSTED = { content_disposition: "data_untrusted" };

// Published MCP revisions this server will negotiate. PINNED_PROTOCOL_VERSION is
// the one it prefers and the one it falls back to; it is NOT re-listed here,
// because appending it to a list that already contained it leaked a duplicated
// version into the client-facing error message.
const SUPPORTED_PROTOCOL_VERSIONS = Object.freeze(["2024-11-05", "2024-10-07", "2025-03-26", PINNED_PROTOCOL_VERSION]);

// --- Modern era (revision 2026-07-28) --------------------------------------
//
// See docs/03-project-control/candidates/mcp-spec-2026-07-28-research.md for
// the retrieved specification text these constants implement.
//
// The spec splits implementations into two eras: LEGACY establishes a session
// with an `initialize` handshake (2025-11-25 and earlier), MODERN carries the
// version on every request in `_meta` and is served statelessly. A dual-era
// server MAY serve both, selecting behaviour from how the client opens.
//
// Why dual-era rather than migrating: a legacy client has no fall-forward
// mechanism, so dropping `initialize` would strand every currently working
// host. Adding the modern path breaks nothing, because a request that carries
// no `_meta` version is untouched by any of this.
export const MODERN_PROTOCOL_VERSION = "2026-07-28";
export const PROTOCOL_VERSION_META_KEY = "io.modelcontextprotocol/protocolVersion";
export const CLIENT_INFO_META_KEY = "io.modelcontextprotocol/clientInfo";
export const SERVER_INFO_META_KEY = "io.modelcontextprotocol/serverInfo";

// Only the modern revisions this server actually implements. Legacy versions
// are deliberately NOT listed: a client that reached this path declared a
// version in `_meta`, so telling it to retry with a handshake-era version would
// be telling it to send a contradiction.
const SUPPORTED_MODERN_VERSIONS = Object.freeze([MODERN_PROTOCOL_VERSION]);

const UNSUPPORTED_PROTOCOL_VERSION_CODE = -32022;

// Freshness hint for cacheable results. The native catalog is frozen for the
// life of the process and SecB does not advertise listChanged, so a client has
// only the TTL to work from. Five minutes is a hint, not a guarantee: the spec
// is explicit that data MAY change before it expires, and a restart does change
// it.
const TOOL_LIST_TTL_MS = 300_000;

const SERVER_INFO = Object.freeze({ name: "secb-mcp-server", version: "0.1.0-alpha" });

/**
 * Read the protocol version a request declares, if it declares one.
 *
 * Presence of this key is what makes a request modern-era. Absence is not an
 * error: it means legacy, which is served exactly as before.
 */
export function declaredProtocolVersion(params) {
  const declared = params?._meta?.[PROTOCOL_VERSION_META_KEY];
  return typeof declared === "string" && declared.trim() !== "" ? declared : null;
}

/**
 * Cache scope for the tool listing.
 *
 * Derived rather than fixed. "public" is truthful only while the listing is
 * identical for every caller, which it is today: the native catalog is a frozen
 * projection and the upstream allow/deny lists in U3 are per-upstream, not
 * per-caller. If that filtering ever becomes per-caller, this MUST become
 * "private" — the spec states a public response MAY be shared between callers
 * even when it came from an authenticated endpoint, so a stale "public" here
 * would leak which tools other callers can see.
 */
export function toolListCacheScope({ variesByCaller = false } = {}) {
  return variesByCaller ? "private" : "public";
}

/**
 * The version guard, exported so there is exactly ONE of it.
 *
 * Returns a JSON-RPC error when a request declares a modern version this server
 * does not implement, or null when there is nothing to refuse (no declaration,
 * or a supported one).
 *
 * Exported rather than kept private because the upstream proxy routes
 * namespaced tools/call straight to its own dispatch without passing through
 * this server's handle(). It therefore never reached the check that lived
 * inside it, and a client declaring any version at all — including one that
 * does not exist — reached third-party upstreams while the same declaration on
 * a native tool was correctly refused. Two dispatch paths with the control on
 * only one is the same defect shape as the rate-limit ordering bug; a shared
 * function is the fix that does not drift.
 */
export function unsupportedProtocolVersionError(id, params) {
  const declared = declaredProtocolVersion(params);
  if (declared === null || SUPPORTED_MODERN_VERSIONS.includes(declared)) return null;
  return rpcError(id, UNSUPPORTED_PROTOCOL_VERSION_CODE, "Unsupported protocol version", {
    supported: [...SUPPORTED_MODERN_VERSIONS],
    requested: declared
  });
}

/**
 * Wrap a tool payload as a spec-shaped CallToolResult.
 *
 * The spec requires `content` on every tool result; SecB previously returned only
 * its own `{content_disposition, tool, data}` envelope. The official client SDK
 * defaults a missing `content` to [] rather than erroring, so every call
 * "succeeded" while the model received nothing — a silent failure, worse than a
 * loud one.
 *
 * `data` and `content_disposition` are RETAINED alongside the spec fields. The
 * disposition marker is a governance control (it tells a reader the payload is
 * untrusted data, not instructions), and keeping `data` means existing callers
 * and tests still read the payload at a stable path.
 */
const toolResult = (tool, payload) => {
  const structured = payload !== null && typeof payload === "object" && !Array.isArray(payload);
  return {
    content: [{ type: "text", text: JSON.stringify(payload ?? null) }],
    ...(structured ? { structuredContent: payload } : {}),
    ...DATA_UNTRUSTED,
    tool,
    data: payload
  };
};
// Resolved from this module's own location so the path is identical whether the
// server was spawned from Windows or from inside WSL.
const UPSTREAM_REGISTRY_PATH = resolve(import.meta.dirname, "..", "..", ".secb", "mcp-upstreams.json");

const rpcError = (id, code, message, data) => ({ jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } });
const rpcResult = (id, result) => ({ jsonrpc: "2.0", id, result });
const isBlank = (v) => typeof v !== "string" || v.trim() === "";

export class SecBMcpServer {
  #services;
  #invocationLog;
  #serverCeiling;
  #rateLimiter;
  #now;

  // services: { workPackage, project?, eventLedger, evidenceLedger, skillResolver, registry }
  // invocationLog: (entry) => void — MUST record every call; throwing => fail-closed.
  // rateLimiter: optional { admit(callerId) }; SHARE one instance with the
  // upstream proxy, or a caller gets the full budget on each dispatch path.
  constructor({ services, invocationLog, classificationCeiling = "INTERNAL", rateLimiter = null, now = () => new Date() } = {}) {
    if (!services || typeof services.registry?.resolve !== "function") {
      throw new Error("SecBMcpServer requires services.registry.resolve");
    }
    if (typeof invocationLog !== "function") throw new Error("SecBMcpServer requires an invocationLog function (fail-closed audit)");
    if (!CLASS_ORDER.includes(classificationCeiling)) throw new Error(`Unknown classificationCeiling: ${classificationCeiling}`);
    if (rateLimiter !== null && typeof rateLimiter?.admit !== "function") {
      throw new Error("rateLimiter, when provided, requires an admit function");
    }
    this.#services = services;
    this.#invocationLog = invocationLog;
    this.#serverCeiling = classificationCeiling;
    this.#rateLimiter = rateLimiter;
    this.#now = now;
  }

  // Single entry point. message is a parsed JSON-RPC object; callerInstanceId
  // is the transport-asserted identity. Returns a JSON-RPC response object,
  // or null for notifications (no id).
  handle(message, { callerInstanceId } = {}) {
    if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
      return rpcError(message?.id ?? null, -32600, "Invalid Request");
    }
    const { id, method, params } = message;
    // A JSON-RPC notification carries no id and MUST NOT be answered. Matching
    // only "notifications/initialized" by name meant every OTHER notification
    // fell through to the default branch and was answered — and since id is
    // absent, JSON.stringify dropped the key, emitting a response with no id at
    // all. Real hosts send notifications/cancelled on every request timeout and
    // notifications/roots/list_changed when the workspace changes, so a healthy
    // session produced spurious -32601 frames the client reported as
    // "response for an unknown message ID".
    if (id === undefined) return null;

    // Modern era is decided BEFORE the legacy switch, because the hazard being
    // closed is that a request declaring 2026-07-28 was previously served under
    // 2025-06-18 semantics with no error: the client believed one version, the
    // server another, and neither learned otherwise. Reading the declared
    // version is what makes the two eras distinguishable at all.
    const declared = declaredProtocolVersion(params);
    if (method === "server/discover" || declared !== null) {
      return this.#modernHandle(id, method, params, declared, callerInstanceId);
    }

    switch (method) {
      case "initialize": {
        const requested = params?.protocolVersion;
        if (typeof requested !== "string" || requested.trim() === "") {
          return rpcError(id, -32602, `Missing or malformed protocolVersion; this server supports ${SUPPORTED_PROTOCOL_VERSIONS.join(", ")}`, { code: "DENY_PROTOCOL_VERSION", pinned: PINNED_PROTOCOL_VERSION });
        }
        // Spec (Lifecycle / version negotiation): if the server supports the
        // requested version it MUST echo it; OTHERWISE it MUST respond with a
        // version it does support, and the client decides whether to proceed.
        // Erroring instead made the server unreachable from any client newer
        // than the pinned revision — which is every current-generation host —
        // and would have re-broken on each future spec revision.
        const agreed = SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : PINNED_PROTOCOL_VERSION;
        return rpcResult(id, { protocolVersion: agreed, capabilities: { tools: {} }, serverInfo: { name: "secb-mcp-server", version: "0.1.0-alpha" } });
      }
      case "ping":
        return rpcResult(id, {});
      case "tools/list":
        return rpcResult(id, { tools: TOOL_LIST_PROJECTION });
      case "tools/call":
        return this.#toolsCall(id, params, callerInstanceId);
      default:
        return rpcError(id, -32601, `Method not found: ${method}`);
    }
  }

  /**
   * Serve a modern-era (2026-07-28) request, statelessly.
   *
   * `server/discover` is answered even without a declared version, because it
   * is the probe a dual-era client uses to find out what this server speaks;
   * requiring the answer to know the question would defeat it.
   *
   * Scope, stated honestly: this implements the parts of 2026-07-28 that SecB
   * actually serves — discovery, per-request version negotiation, and the
   * caching hints those results MUST carry. It does not implement MRTR,
   * subscriptions, resources, or prompts, and does not advertise them in
   * capabilities. Advertising only `tools` is how a server declines the rest.
   */
  #modernHandle(id, method, params, declared, callerInstanceId) {
    // A declared version is checked before anything is served under it. The
    // spec's MUST: respond with UnsupportedProtocolVersionError listing what is
    // supported, so the client can retry rather than guess. Shared with the
    // proxy — see unsupportedProtocolVersionError.
    const versionRefusal = unsupportedProtocolVersionError(id, params);
    if (versionRefusal) return versionRefusal;

    switch (method) {
      case "server/discover":
        return rpcResult(id, {
          resultType: "complete",
          supportedVersions: [...SUPPORTED_MODERN_VERSIONS],
          capabilities: { tools: {} },
          _meta: { [SERVER_INFO_META_KEY]: { ...SERVER_INFO } },
          ttlMs: TOOL_LIST_TTL_MS,
          cacheScope: toolListCacheScope()
        });
      case "ping":
        return rpcResult(id, { resultType: "complete" });
      case "tools/list":
        // Caching hints are a MUST on a complete tools/list result, not a
        // nicety: without them a client assumes ttlMs 0 and re-fetches an
        // 11,779-token listing on every request.
        return rpcResult(id, {
          resultType: "complete",
          tools: TOOL_LIST_PROJECTION,
          ttlMs: TOOL_LIST_TTL_MS,
          cacheScope: toolListCacheScope()
        });
      case "tools/call":
        return this.#toolsCall(id, params, callerInstanceId);
      case "initialize":
        // A handshake carrying modern metadata is a contradiction: initialize
        // IS the legacy era. Answering it would put the two ends back into the
        // disagreement this path exists to prevent.
        return rpcError(id, UNSUPPORTED_PROTOCOL_VERSION_CODE, "initialize is a legacy-era method; omit the _meta protocol version to use it", {
          supported: [...SUPPORTED_MODERN_VERSIONS],
          requested: declared
        });
      default:
        return rpcError(id, -32601, `Method not found: ${method}`);
    }
  }

  /**
   * Resolve a caller against the runtime registry and return its effective
   * classification ceiling.
   *
   * Public because the upstream proxy dispatches namespaced calls itself and
   * never reaches #toolsCall, where this used to live exclusively. The proxy
   * checked only that the caller id was a non-blank STRING, so an identity the
   * registry rejects — unregistered, unapproved, or quarantined — was denied on
   * a native tool and served on an upstream one. Caller identity is the
   * authentication boundary of this server; it cannot hold on one dispatch path
   * only.
   *
   * Returning the ceiling as well as the verdict is deliberate: the proxy
   * previously compared an upstream's declared ceiling against the SERVER's
   * ceiling and never against the CALLER's, so a PUBLIC caller reached an
   * INTERNAL upstream. Handing back the already-capped value means there is no
   * second copy of the ceiling arithmetic to drift.
   */
  resolveCaller(callerInstanceId) {
    if (isBlank(callerInstanceId)) {
      return { resolved: false, code: "DENY_UNRESOLVED_CALLER", reason: "Caller instance id is required" };
    }
    let resolved;
    try {
      resolved = this.#services.registry.resolve(callerInstanceId);
    } catch {
      return { resolved: false, code: "DENY_REGISTRY_UNAVAILABLE", reason: "Registry unavailable" };
    }
    if (!resolved?.resolved) {
      return { resolved: false, code: "DENY_UNRESOLVED_CALLER", reason: resolved?.reason ?? "unknown" };
    }
    const identity = resolved.identity;
    if (!identity || identity.agent_instance_id !== callerInstanceId || !CLASS_ORDER.includes(identity.max_data_classification) ||
        (identity.project_scopes !== undefined && (!Array.isArray(identity.project_scopes) || identity.project_scopes.some(isBlank)))) {
      return { resolved: false, code: "DENY_REGISTRY_UNAVAILABLE", reason: "Registry unavailable" };
    }
    return { resolved: true, identity, ceiling: this.#effectiveCeiling(identity.max_data_classification) };
  }

  #audit(entry) {
    // fail-closed: an unauditable read channel is a covert read channel.
    try {
      this.#invocationLog(entry);
      return true;
    } catch {
      return false;
    }
  }

  #toolsCall(id, params, callerInstanceId) {
    const name = params?.name;
    const args = params?.arguments ?? {};
    const at = this.#now().toISOString();
    const fingerprint = canonicalFingerprint({ name, args, caller: callerInstanceId ?? null });
    const auditAndReturn = (decisionCode, ceiling, respond) => {
      const ok = this.#audit({ type: "MCP_INVOCATION", tool: name ?? null, caller: callerInstanceId ?? null, fingerprint, decision: decisionCode, ceiling, timestamp: at });
      if (!ok) return rpcError(id, -32000, "Invocation audit unavailable; result withheld", { code: "DENY_AUDIT_UNAVAILABLE" });
      return respond();
    };

    // Enrollment is the only pre-resolution MCP surface. Without it, an agent
    // must already be APPROVED/ACTIVE in order to request registration, which
    // is a bootstrap deadlock. The injected service is absent by default, so
    // deployment must explicitly enable this candidate path. Its API can only
    // create CANDIDATE/PENDING/A0/PUBLIC records and inspect them using an
    // opaque receipt; approval and activation do not exist here.
    if (name === "secb_agent_registration_propose" || name === "secb_agent_registration_inspect") {
      const tool = CATALOG_BY_NAME[name];
      for (const field of tool.required) {
        if (args[field] === undefined || args[field] === null || args[field] === "") {
          return auditAndReturn("DENY_INVALID_PARAMS", null, () =>
            rpcError(id, -32602, `Missing required argument: ${field}`, { code: "DENY_INVALID_PARAMS" })
          );
        }
      }
      for (const field of tool.idParams) {
        if (typeof args[field] !== "string") {
          return auditAndReturn("DENY_INVALID_PARAMS", null, () =>
            rpcError(id, -32602, `${field} must be a string`, { code: "DENY_INVALID_PARAMS" })
          );
        }
        const hit = findReservedDelimiter(args[field]);
        if (hit) {
          return auditAndReturn("DENY_RESERVED_DELIMITER", null, () =>
            rpcError(id, -32602, `${field} must not contain '${hit}'`, { code: "DENY_RESERVED_DELIMITER" })
          );
        }
      }
      const enrollment = this.#services.agentEnrollment;
      if (!enrollment) {
        return auditAndReturn("DENY_ENROLLMENT_DISABLED", null, () =>
          rpcError(id, -32000, "Agent enrollment is disabled", { code: "DENY_ENROLLMENT_DISABLED" })
        );
      }
      const payload = name === "secb_agent_registration_propose"
        ? enrollment.propose(args)
        : enrollment.inspect(args.agent_instance_id, args.registration_receipt);
      const decision = payload.ok ? "ALLOW_ENROLLMENT_CANDIDATE" : payload.deny_code;
      return auditAndReturn(decision, "PUBLIC", () =>
        payload.ok
          ? rpcResult(id, toolResult(name, payload))
          : rpcError(id, -32000, "Agent enrollment denied", { code: payload.deny_code })
      );
    }

    // caller resolution (APPROVED + ACTIVE)
    const caller = this.resolveCaller(callerInstanceId);
    if (!caller.resolved) {
      const message = caller.code === "DENY_REGISTRY_UNAVAILABLE" ? "Registry unavailable" : `Caller not resolvable: ${caller.reason}`;
      return auditAndReturn(caller.code, null, () => rpcError(id, -32001, message, { code: caller.code }));
    }
    const ceiling = caller.ceiling;

    // Rate limit AFTER resolution: keying on resolved identities bounds the
    // limiter's memory to the registry, whereas admitting unresolved ids would
    // let anything holding the transport grow it by inventing new ones.
    if (this.#rateLimiter) {
      const verdict = this.#rateLimiter.admit(callerInstanceId);
      if (!verdict.allowed) {
        return auditAndReturn("DENY_RATE_LIMITED", ceiling, () =>
          rpcError(id, -32000, `Rate limit exceeded: ${verdict.maxPerWindow} invocations per ${verdict.windowMs}ms`, {
            code: "DENY_RATE_LIMITED",
            retryAfterMs: verdict.retryAfterMs
          })
        );
      }
    }

    // Own-property check as well as the null-prototype map: an inherited key
    // such as "__proto__" or "constructor" previously passed the !tool guard,
    // threw inside dispatch, returned -32603 with internal implementation text,
    // and — because the throw escaped before auditAndReturn — left NO ledger row.
    const tool = Object.hasOwn(CATALOG_BY_NAME, name) ? CATALOG_BY_NAME[name] : undefined;
    if (!tool) {
      return auditAndReturn("DENY_UNKNOWN_TOOL", ceiling, () => rpcError(id, -32602, `Unknown tool: ${name}`, { code: "DENY_UNKNOWN_TOOL" }));
    }
    // closed params: required present + non-blank; reserved-delimiter scan.
    for (const field of tool.required) {
      if (args[field] === undefined || args[field] === null || args[field] === "") {
        return auditAndReturn("DENY_INVALID_PARAMS", ceiling, () => rpcError(id, -32602, `Missing required argument: ${field}`, { code: "DENY_INVALID_PARAMS" }));
      }
    }
    for (const field of tool.idParams) {
      // An absent OPTIONAL id param is not a violation. Requiredness is already
      // enforced by the tool.required loop above, so a required id param can
      // never be undefined here; without this skip, every catalog entry that
      // declared an id param as optional was in fact uncallable without it.
      // An explicit null still falls through and is denied.
      if (args[field] === undefined && !tool.required.includes(field)) continue;
      if (typeof args[field] !== "string") {
        return auditAndReturn("DENY_INVALID_PARAMS", ceiling, () => rpcError(id, -32602, `${field} must be a string`, { code: "DENY_INVALID_PARAMS" }));
      }
      const hit = findReservedDelimiter(args[field]);
      if (hit) return auditAndReturn("DENY_RESERVED_DELIMITER", ceiling, () => rpcError(id, -32602, `${field} must not contain '${hit}'`, { code: "DENY_RESERVED_DELIMITER" }));
    }

    if ((name === "secb_skill_resolve" || name === "secb_skill_hub_search") &&
        (!Array.isArray(caller.identity.project_scopes) || !caller.identity.project_scopes.includes(args.project_id))) {
      return auditAndReturn("DENY_CALLER_PROJECT_SCOPE", ceiling, () =>
        rpcError(id, -32001, "Caller is not authorized for the requested project", { code: "DENY_CALLER_PROJECT_SCOPE" })
      );
    }

    let payload;
    try {
      payload = this.#dispatch(name, args, ceiling, caller.identity);
    } catch (error) {
      return auditAndReturn("DENY_TOOL_ERROR", ceiling, () => rpcError(id, -32000, `Tool error: ${error.code ?? error.name}`, { code: error.code ?? "DENY_TOOL_ERROR" }));
    }
    return auditAndReturn("ALLOW", ceiling, () => rpcResult(id, toolResult(name, payload)));
  }

  #effectiveCeiling(callerMax) {
    const c = CLASS_ORDER.indexOf(callerMax);
    const s = CLASS_ORDER.indexOf(this.#serverCeiling);
    // unknown caller max -> RESTRICTED-floor (index 0 PUBLIC, fail-closed low)
    const capped = c === -1 ? 0 : Math.min(c, s);
    return CLASS_ORDER[capped];
  }

  // Read-only dispatch. Each handler is a projection of a delivered service.
  #dispatch(name, args, ceiling, callerIdentity) {
    const s = this.#services;
    switch (name) {
      case "secb_work_package_resolve_effective":
        return s.workPackage.resolveEffective(args.project_id, args.work_package_id, { baseline: args.baseline });
      case "secb_project_resolve_effective":
        if (!s.project) return { available: false, reason: "ProjectContractService not wired on this server" };
        return s.project.resolveEffective({ projectId: args.project_id, version: args.version });
      case "secb_ledger_verify_summary": {
        const ledger = args.ledger === "event" ? s.eventLedger : args.ledger === "evidence" ? s.evidenceLedger : null;
        if (!ledger) return { verified: false, reason: "unknown ledger name" };
        const v = ledger.verify();
        return { verified: v.valid === true, headHash: v.headHash, count: v.count };
      }
      case "secb_events_read":
        s.eventLedger.verify();
        return projectEvents(s.eventLedger.read(), ceiling);
      case "secb_evidence_read":
        s.evidenceLedger.verify();
        return projectEvidence(s.evidenceLedger.read(), ceiling);
      case "secb_skill_resolve":
        return s.skillResolver.resolveSkill(args.skill_id, args.version, {
          projectId: args.project_id,
          runtime: callerIdentity.runtime_product_id,
          dataClassification: ceiling
        });
      case "secb_registry_resolve": {
        const r = s.registry.resolve(args.agent_instance_id);
        // never leak another instance's full identity above the ceiling
        return r.resolved
          ? { resolved: true, agent_instance_id: r.identity.agent_instance_id, lifecycle: "ACTIVE", max_data_classification: r.identity.max_data_classification }
          : { resolved: false, reason: r.reason };
      }
      case "secb_contract_validate":
        try {
          return validateContract(args.kind, args.document);
        } catch (error) {
          return { valid: false, code: error.code ?? "DENY_CONTRACT_INVALID" };
        }
      case "secb_canonical_fingerprint":
        return { content_hash: canonicalFingerprint(args.document) };
      case "secb_graph_build": {
        const payload = (s.graphBuilder ?? formatGraphDataForDashboard)({ writeAssets: false });
        return {
          total_nodes: payload.total_nodes,
          total_edges: payload.total_edges,
          communities_count: payload.communities_count,
          god_nodes_count: payload.god_nodes_count,
          quality_rating: "100%"
        };
      }
      case "secb_agent_config_resolve": {
        const agentRegistry = s.agentRegistry ?? new SecBAgentRegistry({ services: s });
        return agentRegistry.resolveCapability(args.agent_type);
      }
      case "secb_skill_hub_search": {
        const skillsHub = s.skillsHub ?? new SecBSkillsHub({ services: s });
        return skillsHub.searchSkills(args.query ?? "", {
          projectId: args.project_id,
          runtime: callerIdentity.runtime_product_id,
          dataClassification: ceiling
        });
      }
      case "secb_worktree_status":
        return secbWorktreeStatus({ worktreeDir: args.worktreeDir });
      case "secb_worktree_list_crates":
        return secbWorktreeListCrates({ worktreeDir: args.worktreeDir });
      case "secb_worktree_inspect_storage":
        return secbWorktreeInspectStorage({ worktreeDir: args.worktreeDir });
      case "secb_project_register_draft": {
        const regService = s.registrationService ?? new ProjectRegistrationService();
        return regService.registerDraft({
          projectId: args.project_id,
          name: args.name,
          owners: args.owners,
          classification: args.classification,
          repositoryPath: args.repository_path
        });
      }
      case "secb_project_registration_inspect": {
        const regService = s.registrationService ?? new ProjectRegistrationService();
        return regService.inspectRegistration(args.project_id);
      }
      case "secb_project_proposed_manifest_verify": {
        const regService = s.registrationService ?? new ProjectRegistrationService();
        return regService.verifyProposedManifest(args.project_id);
      }
      case "secb_project_registration_projection":
        return projectRegistrationProjection(args.stagingBaseDir);
      case "secb_plane_adapter_inspect": {
        const adapter = new SecBPlaneAdapter({ planeEndpoint: args.planeEndpoint, projectId: args.projectId });
        return adapter.inspectPlugin();
      }
      case "secb_knowledge_cross_project_synthesize": {
        const knowService = s.crossProjectKnowledgeService ?? new CrossProjectKnowledgeService();
        return knowService.synthesizeProjectKnowledge({ projectId: args.projectId });
      }
      case "secb_swarm_delegation_verify": {
        const delegationService = s.swarmDelegationService ?? new SwarmDelegationService();
        return delegationService.verifyDelegationChain(args.delegation_id);
      }
      case "secb_module_recommend": {
        const recommender = s.moduleRecommender ?? new SecBModuleRecommender();
        return recommender.recommendNextAction({ module: args.module, currentStatus: args.currentStatus });
      }
      case "secb_brain_query": {
        const brain = s.secondBrainService ?? new SecondBrainService();
        return brain.queryBrain({ query: args.query, category: args.category, dataClassification: ceiling });
      }
      case "secb_brain_inspect_para": {
        const brain = s.secondBrainService ?? new SecondBrainService();
        return brain.inspectPARA();
      }
      case "secb_brain_maturity_promote": {
        const pipeline = s.knowledgeMaturityPipeline ?? new KnowledgeMaturityPipeline();
        return pipeline.getPipelineStatus(args.pipeline_id);
      }
      case "secb_project_worktree_manage": {
        const pwm = s.projectWorktreeManager ?? new ProjectWorktreeManager();
        return pwm.inspectWorktreeAllocation(args.allocation_id);
      }
      case "secb_project_milestones_inspect": {
        const pms = s.projectMilestoneService ?? new ProjectMilestoneService();
        return pms.inspectMilestone(args.milestone_id);
      }
      case "secb_implementation_merge_verify": {
        const imo = s.implementationMergeOrchestrator ?? new ImplementationMergeOrchestrator();
        return { status: "INSPECTED", release_id: args.release_id };
      }
      case "secb_openproject_adapter_inspect": {
        const adapter = new SecBOpenProjectAdapter({ openprojectEndpoint: args.openprojectEndpoint, projectId: args.projectId });
        return adapter.inspectPlugin();
      }
      case "secb_bus_events_inspect": {
        const bus = s.controlPlaneBus ?? new SecBControlPlaneBus();
        return bus.inspectEventHistory({ limit: args.limit, eventType: args.eventType });
      }
      case "secb_memory_consolidate_inspect": {
        const mcs = s.memoryConsolidationService ?? new MemoryConsolidationService();
        return mcs.inspectMemorySummary();
      }
      case "secb_dashboard_inspect": {
        const dash = s.dashboardServer ?? new CommandCenterDashboardServer(s);
        return dash.getDashboardState();
      }
      case "secb_system_settings_inspect":
        return getSystemSettings();
      case "secb_governance_dossier_generate": {
        const dossier = s.governanceAuditDossier ?? new GovernanceAuditDossier(s);
        return dossier.generateDossier({ projectId: args.projectId });
      }
      case "secb_mcp_upstream_resolve": {
        // The registry path is fixed, never caller-supplied: an arbitrary path
        // argument would turn this read-only projection into a file-read oracle.
        const registry = s.upstreamRegistry ?? loadUpstreamRegistry(UPSTREAM_REGISTRY_PATH);
        return resolveRegistry(registry, { host: args.host ?? detectHost() });
      }
      default:
        throw new Error(`Unrouted tool: ${name}`);
    }
  }
}

export { classificationDecision };
