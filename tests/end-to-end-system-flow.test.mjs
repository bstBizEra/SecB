import { test } from "node:test";
import assert from "node:assert/strict";

import { ProjectRegistrationService } from "../src/project/project-registration-service.mjs";
import { BootstrapAuthorizationGate } from "../src/control/bootstrap-authorization-gate.mjs";
import { SecBBootstrapExecutor } from "../src/control/bootstrap-executor.mjs";
import { ProjectWorktreeManager } from "../src/project/project-worktree-manager.mjs";
import { ProjectMilestoneService } from "../src/project/project-milestone-service.mjs";
import { ImplementationMergeOrchestrator } from "../src/control/implementation-merge-orchestrator.mjs";
import { SwarmDelegationService } from "../src/services/swarm-delegation-service.mjs";
import { SecondBrainService } from "../src/brain/second-brain-service.mjs";
import { KnowledgeMaturityPipeline } from "../src/brain/knowledge-maturity-pipeline.mjs";
import { MemoryConsolidationService } from "../src/memory/memory-consolidation-service.mjs";
import { SecBControlPlaneBus } from "../src/bus/secb-control-plane-bus.mjs";
import { SecBModuleRecommender } from "../src/control/module-recommender.mjs";
import { SecBPlaneAdapter } from "../src/plugins/secb-plane-adapter.mjs";
import { SecBOpenProjectAdapter } from "../src/plugins/secb-openproject-adapter.mjs";
import { SecBMcpServer } from "../src/mcp/secb-mcp-server.mjs";

test("Complete End-to-End System Workflow (Stage 1 to Stage 9)", () => {
  // STAGE 1: Project Registration & Discovery
  const regService = new ProjectRegistrationService();
  const stagedPkg = regService.registerDraft({
    projectId: "SECB-E2E",
    name: "SecB End-to-End System Test Project",
    owners: ["operator@secb.local"],
    classification: "INTERNAL"
  });

  assert.equal(stagedPkg.project_id, "SECB-E2E");
  assert.equal(stagedPkg.status, "REGISTERED_PROPOSAL_ONLY");
  assert.equal(stagedPkg.mode, "proposal_only");
  assert.equal(stagedPkg.repository_mutation_authorized, false);

  const manifestVerify = regService.verifyProposedManifest("SECB-E2E");
  assert.equal(manifestVerify.verified.length, 2);

  // STAGE 2: Advisory Recommendation & Human GOV Authorization Gate
  const recommender = new SecBModuleRecommender();
  const rec = recommender.recommendNextAction({
    module: "project_registration",
    currentStatus: stagedPkg.status
  });

  assert.equal(rec.requires_human_gov, true);
  assert.equal(rec.risk_class, "R3");

  const authGate = new BootstrapAuthorizationGate({ registrationService: regService });
  const signedRecord = authGate.authorizeBootstrap({
    projectId: "SECB-E2E",
    authorizationRecord: { reviewerSignature: "GOV-SIGN-E2E-APPROVED" },
    reviewerSignature: "GOV-SIGN-E2E-APPROVED"
  });

  stagedPkg.status = signedRecord.status; // Transition to AUTHORIZED_FOR_BOOTSTRAP

  // STAGE 3: Worktree Allocation & Sandboxed Bootstrap Execution
  const pwm = new ProjectWorktreeManager();
  const allocation = pwm.createWorktreeAllocation({
    projectId: "SECB-E2E",
    branchName: "feature/e2e-bootstrap"
  });

  assert.equal(allocation.status, "ALLOCATED");

  const executor = new SecBBootstrapExecutor({ registrationService: regService, authorizationGate: authGate });
  const execRes = executor.executeBootstrap({
    projectId: "SECB-E2E",
    targetPath: allocation.target_path,
    authorizationRecord: signedRecord,
    reviewerSignature: "GOV-SIGN-E2E-APPROVED"
  });

  assert.equal(execRes.ok, true);
  assert.equal(execRes.filesWritten, 2);

  // STAGE 4: Milestone & Work Package Integration
  const pms = new ProjectMilestoneService();
  const milestone = pms.createMilestone({
    projectId: "SECB-E2E",
    title: "E2E Release Milestone",
    targetVersion: "v1.0.0"
  });

  pms.addWorkPackageToMilestone({ milestoneId: milestone.milestone_id, workPackageId: "WP-E2E-01" });

  const planeAdapter = new SecBPlaneAdapter({ projectId: "SECB-E2E" });
  const planeMapping = planeAdapter.mapWorkPackageToPlaneIssue({ work_package_id: "WP-E2E-01", status: "ACTIVE" });
  assert.equal(planeMapping.plane_state, "In Progress");

  const openProjectAdapter = new SecBOpenProjectAdapter({ projectId: "SECB-E2E" });
  const opMapping = openProjectAdapter.mapWorkPackageToOpenProject({ workPackageId: "WP-E2E-01", status: "ACTIVE", type: "Feature" });
  assert.equal(opMapping.openproject_status, "In Progress");

  // STAGE 5: Swarm Delegation & Subagent Task Execution
  const swarmService = new SwarmDelegationService();
  const delegation = swarmService.delegateTask({
    parentAgentId: "agent-lead-e2e",
    subagentId: "agent-worker-e2e",
    taskId: "TASK-E2E-BUILD",
    role: "feature_developer"
  });

  assert.equal(delegation.status, "DELEGATED");

  const verifySwarm = swarmService.verifyDelegationChain(delegation.delegation_id);
  assert.equal(verifySwarm.sod_compliant, true);

  // STAGE 6: Knowledge Capture, PARA Storage & Memory Consolidation
  const brain = new SecondBrainService();
  const capturedKnowledge = brain.captureKnowledge({
    title: "E2E Test Artifact",
    content: "Full end-to-end execution verified successfully",
    category: "PROJECTS",
    classification: "INTERNAL"
  });

  assert.ok(capturedKnowledge.item_id.startsWith("PARA-PROJECTS-"));

  const memoryConsolidator = new MemoryConsolidationService({ secondBrainService: brain });
  const consRecord = memoryConsolidator.consolidateSessionMemory({
    sessionId: "SESSION-E2E-101",
    sessionTrace: "Executed 79 unit tests across 19 modules"
  });

  assert.ok(consRecord.consolidation_id.startsWith("MEM-CONS-"));

  // STAGE 7: 5-Stage Knowledge Maturity Pipeline & Evidence Sealing
  const maturityPipeline = new KnowledgeMaturityPipeline({ secondBrainService: brain });

  const p2 = maturityPipeline.promoteSessionToEvidence({
    sessionId: "SESSION-E2E-101",
    sessionTrace: "Execution logs for E2E flow",
    testResults: { fail: 0, pass: 79 }
  });

  const p3 = maturityPipeline.deriveKnowledgeFromEvidence({
    pipelineId: p2.pipeline_id,
    claimSummary: "E2E workflow 100% verified"
  });

  const p4 = maturityPipeline.synthesizeExperience({
    pipelineId: p2.pipeline_id,
    patternTitle: "E2E Deployment Pattern"
  });

  const p5 = maturityPipeline.promoteExperienceToSkill({
    pipelineId: p2.pipeline_id,
    skillName: "e2e-deployment-skill"
  });

  assert.equal(p5.stage_number, 5);
  assert.equal(p5.governed_skill.name, "e2e-deployment-skill");

  // STAGE 8: Pre-Merge Validation & Release Packet Orchestration
  const mergeReadiness = pwm.verifyMergeReadiness({
    allocationId: allocation.allocation_id,
    evidenceEnvelope: p2.evidence_envelope
  });

  assert.equal(mergeReadiness.merge_ready, true);

  const mergeOrchestrator = new ImplementationMergeOrchestrator();
  const mergeRelease = mergeOrchestrator.orchestrateMergeRelease({
    projectId: "SECB-E2E",
    allocationId: allocation.allocation_id,
    authorizationRecord: { reviewerSignature: "GOV-SIGN-E2E-APPROVED" },
    evidenceEnvelope: p2.evidence_envelope
  });

  assert.equal(mergeRelease.ok, true);
  assert.equal(mergeRelease.release_packet.status, "APPROVED_FOR_MAIN_MERGE");

  const milestoneCert = pms.evaluateMilestoneCompletion({
    milestoneId: milestone.milestone_id,
    verifiedWpCount: 1
  });

  assert.equal(milestoneCert.completion_certified, true);

  // STAGE 9: Control Plane Bus & MCP Server Tool Dispatch
  const bus = new SecBControlPlaneBus();
  const busEvents = [];

  bus.subscribe({
    eventType: "RELEASE_COMPLETED",
    subscriberId: "e2e-listener",
    handler: (evt) => busEvents.push(evt),
    classificationCeiling: "INTERNAL"
  });

  bus.publishEvent({
    eventType: "RELEASE_COMPLETED",
    sourceModule: "ImplementationMergeOrchestrator",
    payload: { releaseId: mergeRelease.release_packet.release_id },
    classification: "INTERNAL"
  });

  assert.equal(busEvents.length, 1);
  assert.equal(busEvents[0].payload.releaseId, mergeRelease.release_packet.release_id);

  // Verify MCP Server Tool Catalog (32 read-only tools)
  const registry = {
    resolve: (id) => ({
      resolved: true,
      identity: { agent_instance_id: id, max_data_classification: "INTERNAL", state: "ACTIVE" }
    })
  };

  const server = new SecBMcpServer({
    services: {
      registry,
      registrationService: regService,
      secondBrainService: brain,
      knowledgeMaturityPipeline: maturityPipeline,
      projectWorktreeManager: pwm,
      projectMilestoneService: pms,
      implementationMergeOrchestrator: mergeOrchestrator,
      swarmDelegationService: swarmService,
      controlPlaneBus: bus,
      memoryConsolidationService: memoryConsolidator,
      moduleRecommender: recommender
    },
    invocationLog: () => {},
    classificationCeiling: "INTERNAL"
  });

  const toolsListRes = server.handle({ jsonrpc: "2.0", id: 999, method: "tools/list" });
  assert.equal(toolsListRes.result.tools.length, 38);
});
