import { resolve } from "node:path";

import { canonicalFingerprint } from "../contracts/canonical-fingerprint.mjs";
import { findReservedDelimiter } from "../contracts/reserved-delimiters.mjs";
import { validateContract } from "../contracts/contract-validator.mjs";
import { classificationDecision, projectEvents, projectEvidence } from "../ui/report-projections.mjs";
import { CATALOG_BY_NAME, PINNED_PROTOCOL_VERSION, TOOL_CATALOG } from "./tool-catalog.mjs";
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
  #now;

  // services: { workPackage, project?, eventLedger, evidenceLedger, skillResolver, registry }
  // invocationLog: (entry) => void — MUST record every call; throwing => fail-closed.
  constructor({ services, invocationLog, classificationCeiling = "INTERNAL", now = () => new Date() } = {}) {
    if (!services || typeof services.registry?.resolve !== "function") {
      throw new Error("SecBMcpServer requires services.registry.resolve");
    }
    if (typeof invocationLog !== "function") throw new Error("SecBMcpServer requires an invocationLog function (fail-closed audit)");
    if (!CLASS_ORDER.includes(classificationCeiling)) throw new Error(`Unknown classificationCeiling: ${classificationCeiling}`);
    this.#services = services;
    this.#invocationLog = invocationLog;
    this.#serverCeiling = classificationCeiling;
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
    switch (method) {
      case "initialize": {
        const requested = params?.protocolVersion;
        const SUPPORTED_VERSIONS = ["2024-11-05", "2024-10-07", "2025-03-26", "2025-06-18", PINNED_PROTOCOL_VERSION];
        if (!requested || !SUPPORTED_VERSIONS.includes(requested)) {
          return rpcError(id, -32602, `Unsupported protocolVersion; this server supports ${SUPPORTED_VERSIONS.join(", ")}`, { code: "DENY_PROTOCOL_VERSION", pinned: PINNED_PROTOCOL_VERSION });
        }
        return rpcResult(id, { protocolVersion: requested, capabilities: { tools: {} }, serverInfo: { name: "secb-mcp-server", version: "0.1.0-alpha" } });
      }
      case "notifications/initialized":
        return null; // notification, no response
      case "ping":
        return rpcResult(id, {});
      case "tools/list":
        return rpcResult(id, { tools: TOOL_CATALOG.map((t) => ({ name: t.name, description: t.description })) });
      case "tools/call":
        return this.#toolsCall(id, params, callerInstanceId);
      default:
        return rpcError(id, -32601, `Method not found: ${method}`);
    }
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

    // caller resolution (APPROVED + ACTIVE)
    if (isBlank(callerInstanceId)) {
      return auditAndReturn("DENY_UNRESOLVED_CALLER", null, () => rpcError(id, -32001, "Caller instance id is required", { code: "DENY_UNRESOLVED_CALLER" }));
    }
    const resolved = this.#services.registry.resolve(callerInstanceId);
    if (!resolved?.resolved) {
      return auditAndReturn("DENY_UNRESOLVED_CALLER", null, () => rpcError(id, -32001, `Caller not resolvable: ${resolved?.reason ?? "unknown"}`, { code: "DENY_UNRESOLVED_CALLER", reason: resolved?.reason }));
    }
    const ceiling = this.#effectiveCeiling(resolved.identity.max_data_classification);

    const tool = CATALOG_BY_NAME[name];
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

    let payload;
    try {
      payload = this.#dispatch(name, args, ceiling);
    } catch (error) {
      return auditAndReturn("DENY_TOOL_ERROR", ceiling, () => rpcError(id, -32000, `Tool error: ${error.code ?? error.name}`, { code: error.code ?? "DENY_TOOL_ERROR" }));
    }
    return auditAndReturn("ALLOW", ceiling, () => rpcResult(id, { ...DATA_UNTRUSTED, tool: name, data: payload }));
  }

  #effectiveCeiling(callerMax) {
    const c = CLASS_ORDER.indexOf(callerMax);
    const s = CLASS_ORDER.indexOf(this.#serverCeiling);
    // unknown caller max -> RESTRICTED-floor (index 0 PUBLIC, fail-closed low)
    const capped = c === -1 ? 0 : Math.min(c, s);
    return CLASS_ORDER[capped];
  }

  // Read-only dispatch. Each handler is a projection of a delivered service.
  #dispatch(name, args, ceiling) {
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
        return s.skillResolver.resolveSkill(args.skill_id, args.version, args.context ?? {});
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
        const payload = formatGraphDataForDashboard({ writeAssets: false });
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
        return skillsHub.searchSkills(args.query ?? "", { classificationFloor: ceiling });
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
