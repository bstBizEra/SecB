import { getSystemSettings } from "../config/system-settings.mjs";
import { projectRegistrationProjection } from "./registration-projection.mjs";

/**
 * SecB Command Center Unified Dashboard Server
 * Aggregates real-time state across all 9 Stages into a unified JSON API / Dashboard projection.
 */

export class CommandCenterDashboardServer {
  #services;

  constructor(services = {}) {
    this.#services = services;
  }

  getDashboardState() {
    const settings = getSystemSettings();
    const s = this.#services;

    // Stage 1: Registration
    const regProjection = projectRegistrationProjection();

    // Stage 2: Governance & Recommendations
    const recommender = s.moduleRecommender;
    const govRec = recommender
      ? recommender.recommendNextAction({ module: "project_registration", currentStatus: "REGISTERED_PROPOSAL_ONLY" })
      : null;

    // Stage 3: Worktrees
    const pwm = s.projectWorktreeManager;

    // Stage 4: Milestones
    const pms = s.projectMilestoneService;

    // Stage 5: Swarm Delegations
    const swarm = s.swarmDelegationService;

    // Stage 6: Second Brain & PARA
    const brain = s.secondBrainService;
    const paraSummary = brain ? brain.inspectPARA() : { PROJECTS: 0, AREAS: 0, RESOURCES: 0, ARCHIVES: 0, total_items: 0 };

    // Stage 7: Knowledge Maturity
    const pipeline = s.knowledgeMaturityPipeline;

    // Stage 8: Merge Orchestrator
    const merge = s.implementationMergeOrchestrator;

    // Stage 9: Bus & MCP
    const bus = s.controlPlaneBus;
    const recentBusEvents = bus ? bus.inspectEventHistory({ limit: 5 }) : [];

    return {
      system_name: "SecB Operating System & Control Plane",
      version: "0.3.0-alpha.0",
      settings: {
        environment: settings.environment,
        data_classification_ceiling: settings.governance.max_data_classification,
        secb_mcp_port: settings.ports.secb_mcp
      },
      stages: {
        stage_1_registration: {
          total_staged_projects: regProjection.total_staged,
          staged_projects: regProjection.staged_projects
        },
        stage_2_governance: {
          pending_advisory_recommendation: govRec
        },
        stage_3_worktrees: {
          allocated: pwm ? "ACTIVE" : "STANDBY"
        },
        stage_4_milestones: {
          milestone_service: pms ? "ACTIVE" : "STANDBY"
        },
        stage_5_swarm: {
          swarm_delegations: swarm ? "ACTIVE" : "STANDBY"
        },
        stage_6_brain_para: paraSummary,
        stage_7_maturity_pipeline: {
          pipeline_status: pipeline ? "ACTIVE" : "STANDBY"
        },
        stage_8_merge_orchestrator: {
          merge_status: merge ? "ACTIVE" : "STANDBY"
        },
        stage_9_control_bus_mcp: {
          recent_events_count: recentBusEvents.length,
          mcp_tools_catalog_count: 32
        }
      },
      projected_at: new Date().toISOString()
    };
  }
}
