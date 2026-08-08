import { test } from "node:test";
import assert from "node:assert/strict";
import { ProjectMilestoneService, ProjectMilestoneError } from "../src/project/project-milestone-service.mjs";
import { ImplementationMergeOrchestrator, MergeOrchestratorError } from "../src/control/implementation-merge-orchestrator.mjs";
import { SecBOpenProjectAdapter } from "../src/plugins/secb-openproject-adapter.mjs";
import { SecBMcpServer } from "../src/mcp/secb-mcp-server.mjs";

test("ProjectMilestoneService manages milestones and evaluates completion certificates", () => {
  const pms = new ProjectMilestoneService();
  const ms = pms.createMilestone({
    projectId: "SECB",
    title: "v0.3.0 Release Milestone",
    targetVersion: "v0.3.0",
    exitCriteria: ["52/52 tests passing", "100% manifest inventory matched"]
  });

  assert.equal(ms.project_id, "SECB");
  assert.equal(ms.status, "OPEN");
  assert.ok(ms.milestone_id.startsWith("MILESTONE-SECB-"));

  pms.addWorkPackageToMilestone({ milestoneId: ms.milestone_id, workPackageId: "WP-01" });
  pms.addWorkPackageToMilestone({ milestoneId: ms.milestone_id, workPackageId: "WP-02" });

  const cert = pms.evaluateMilestoneCompletion({ milestoneId: ms.milestone_id, verifiedWpCount: 2 });
  assert.equal(cert.completion_certified, true);
  assert.equal(cert.status, "COMPLETED");
  assert.ok(cert.certificate_fingerprint);
});

test("ImplementationMergeOrchestrator enforces pre-merge release invariants", () => {
  const imo = new ImplementationMergeOrchestrator();

  // Fails closed on missing authorizationRecord signature
  assert.throws(
    () =>
      imo.orchestrateMergeRelease({
        projectId: "SECB",
        allocationId: "ALLOC-01",
        authorizationRecord: null,
        evidenceEnvelope: { fingerprint: "hash" }
      }),
    (err) => err instanceof MergeOrchestratorError && err.code === "DENY_UNAUTHORIZED_MERGE"
  );

  // Fails closed on unsealed evidence envelope
  assert.throws(
    () =>
      imo.orchestrateMergeRelease({
        projectId: "SECB",
        allocationId: "ALLOC-01",
        authorizationRecord: { reviewerSignature: "sig-gov" },
        evidenceEnvelope: {}
      }),
    (err) => err instanceof MergeOrchestratorError && err.code === "DENY_UNSEALED_EVIDENCE"
  );

  // Succeeds on valid parameters
  const release = imo.orchestrateMergeRelease({
    projectId: "SECB",
    allocationId: "ALLOC-01",
    authorizationRecord: { reviewerSignature: "sig-gov-valid" },
    evidenceEnvelope: { fingerprint: "a".repeat(64), test_results: { fail: 0 } }
  });

  assert.equal(release.ok, true);
  assert.equal(release.release_packet.status, "APPROVED_FOR_MAIN_MERGE");
  assert.ok(release.release_packet.fingerprint);
});

test("SecBOpenProjectAdapter maps work packages to OpenProject types and statuses", () => {
  const adapter = new SecBOpenProjectAdapter({ projectId: "SECB" });
  const mapped = adapter.mapWorkPackageToOpenProject({
    workPackageId: "WP-SECB-101",
    status: "ACTIVE",
    type: "Feature"
  });

  assert.equal(mapped.openproject_wp_id, "OP-WP-WP-SECB-101");
  assert.equal(mapped.openproject_status, "In Progress");
  assert.equal(mapped.openproject_type, "Feature");

  const pluginInfo = adapter.inspectPlugin();
  assert.equal(pluginInfo.plugin_name, "SecBOpenProjectAdapter");
  assert.equal(pluginInfo.status, "ACTIVE");
});

test("SecBMcpServer dispatches project management and implementation tools", () => {
  const pms = new ProjectMilestoneService();
  const ms = pms.createMilestone({ projectId: "SECB-MCP", title: "MCP Milestone" });

  const registry = {
    resolve: (id) => ({
      resolved: true,
      identity: { agent_instance_id: id, max_data_classification: "INTERNAL", state: "ACTIVE" }
    })
  };
  const logs = [];
  const server = new SecBMcpServer({
    services: { registry, projectMilestoneService: pms },
    invocationLog: (entry) => logs.push(entry),
    classificationCeiling: "INTERNAL"
  });

  const msRes = server.handle(
    {
      jsonrpc: "2.0",
      id: 700,
      method: "tools/call",
      params: {
        name: "secb_project_milestones_inspect",
        arguments: { milestone_id: ms.milestone_id }
      }
    },
    { callerInstanceId: "test-agent" }
  );

  assert.equal(msRes.id, 700);
  assert.equal(msRes.result.data.project_id, "SECB-MCP");

  const opRes = server.handle(
    {
      jsonrpc: "2.0",
      id: 701,
      method: "tools/call",
      params: {
        name: "secb_openproject_adapter_inspect",
        arguments: { projectId: "SECB-MCP" }
      }
    },
    { callerInstanceId: "test-agent" }
  );

  assert.equal(opRes.id, 701);
  assert.equal(opRes.result.data.plugin_name, "SecBOpenProjectAdapter");
});
