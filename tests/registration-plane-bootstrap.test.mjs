import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { ProjectRegistrationService } from "../src/project/project-registration-service.mjs";
import { projectRegistrationProjection } from "../src/ui/registration-projection.mjs";
import { SecBPlaneAdapter, PlaneAdapterError } from "../src/plugins/secb-plane-adapter.mjs";
import { BootstrapAuthorizationGate } from "../src/control/bootstrap-authorization-gate.mjs";
import { SecBBootstrapExecutor, BootstrapExecutorError } from "../src/control/bootstrap-executor.mjs";
import { SecBMcpServer } from "../src/mcp/secb-mcp-server.mjs";

const testStagingDir = resolve(process.cwd(), ".secb", "test-staging-options");
const testBootstrapDir = resolve(process.cwd(), ".secb", "test-bootstrap-target");

test.after(() => {
  if (existsSync(testStagingDir)) {
    rmSync(testStagingDir, { recursive: true, force: true });
  }
  if (existsSync(testBootstrapDir)) {
    rmSync(testBootstrapDir, { recursive: true, force: true });
  }
});

// OPTION A TESTS
test("projectRegistrationProjection formats staged projects for dashboard visualizer", () => {
  const regService = new ProjectRegistrationService({ stagingBaseDir: testStagingDir });
  regService.registerDraft({ projectId: "PROJ-OPT-A", name: "Option A Project" });

  const projection = projectRegistrationProjection(testStagingDir);
  assert.equal(projection.total_staged, 1);
  assert.equal(projection.projects[0].project_id, "PROJ-OPT-A");
  assert.equal(projection.projects[0].mode, "proposal_only");
  assert.equal(projection.projects[0].repository_mutation_authorized, false);
  assert.ok(projection.projects[0].proposed_count >= 2);
});

// OPTION B TESTS
test("SecBPlaneAdapter maps SecB work packages to Plane issue states", () => {
  const adapter = new SecBPlaneAdapter({ projectId: "SECB-PLANE" });
  const pluginInfo = adapter.inspectPlugin();
  assert.equal(pluginInfo.plugin_name, "secb-plane-adapter");
  assert.equal(pluginInfo.secb_project_id, "SECB-PLANE");

  const issueProjection = adapter.mapWorkPackageToPlaneIssue({
    work_package_id: "WP-101",
    title: "Implement Feature X",
    status: "EXECUTION_IN_PROGRESS",
    risk_class: "R2"
  });

  assert.equal(issueProjection.work_package_id, "WP-101");
  assert.equal(issueProjection.plane_state, "In Progress");
  assert.equal(issueProjection.risk_class, "R2");
});

test("SecBPlaneAdapter throws error on invalid work package", () => {
  const adapter = new SecBPlaneAdapter();
  assert.throws(
    () => adapter.mapWorkPackageToPlaneIssue({}),
    (err) => err instanceof PlaneAdapterError && err.code === "INVALID_WORK_PACKAGE"
  );
});

// OPTION C TESTS
test("SecBBootstrapExecutor fails closed when project is not authorized for bootstrap", () => {
  const regService = new ProjectRegistrationService({ stagingBaseDir: testStagingDir });
  regService.registerDraft({ projectId: "PROJ-OPT-C1" });
  const gate = new BootstrapAuthorizationGate({ registrationService: regService });
  const executor = new SecBBootstrapExecutor({ registrationService: regService, authorizationGate: gate });

  assert.throws(
    () => executor.executeBootstrap({ projectId: "PROJ-OPT-C1", targetPath: testBootstrapDir }),
    (err) => err instanceof BootstrapExecutorError && err.code === "DENY_UNAUTHORIZED_BOOTSTRAP"
  );
});

test("SecBBootstrapExecutor writes approved proposed files after explicit human GOV authorization", () => {
  const regService = new ProjectRegistrationService({ stagingBaseDir: testStagingDir });
  regService.registerDraft({ projectId: "PROJ-OPT-C2" });
  const gate = new BootstrapAuthorizationGate({ registrationService: regService });
  const executor = new SecBBootstrapExecutor({ registrationService: regService, authorizationGate: gate });

  const result = executor.executeBootstrap({
    projectId: "PROJ-OPT-C2",
    targetPath: testBootstrapDir,
    authorizationRecord: { decisionId: "DEC-OPT-C2", approvedBy: "gov-admin@secb.local" },
    reviewerSignature: "SIG-HUMAN-GOV-VERIFIED"
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "BOOTSTRAPPED");
  assert.ok(result.filesWritten >= 2);
  assert.equal(existsSync(join(testBootstrapDir, "AGENTS.md")), true);
});

// MCP DISPATCH TESTS FOR OPTIONS A & B
test("SecBMcpServer dispatches secb_project_registration_projection and secb_plane_adapter_inspect", () => {
  const registry = {
    resolve: (id) => ({
      resolved: true,
      identity: { agent_instance_id: id, max_data_classification: "INTERNAL", state: "ACTIVE" }
    })
  };
  const logs = [];
  const server = new SecBMcpServer({
    services: { registry },
    invocationLog: (entry) => logs.push(entry),
    classificationCeiling: "INTERNAL"
  });

  const projRes = server.handle(
    {
      jsonrpc: "2.0",
      id: 100,
      method: "tools/call",
      params: {
        name: "secb_project_registration_projection",
        arguments: { stagingBaseDir: testStagingDir }
      }
    },
    { callerInstanceId: "test-agent" }
  );

  assert.equal(projRes.id, 100);
  assert.ok(projRes.result.data);

  const planeRes = server.handle(
    {
      jsonrpc: "2.0",
      id: 101,
      method: "tools/call",
      params: {
        name: "secb_plane_adapter_inspect",
        arguments: {}
      }
    },
    { callerInstanceId: "test-agent" }
  );

  assert.equal(planeRes.id, 101);
  assert.equal(planeRes.result.data.plugin_name, "secb-plane-adapter");
});
