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

// ---------------------------------------------------------------------------
// Containment: where the bootstrap executor may write.
//
// These two refusals are the executor's boundary, and one of them had never
// fired in this repository's history.
// ---------------------------------------------------------------------------

test("DENY_INVALID_TARGET_PATH — the executor refuses before it resolves anything", () => {
  const executor = new SecBBootstrapExecutor({
    registrationService: { inspectRegistration: () => { throw new Error("must not be consulted"); } }
  });
  for (const targetPath of [undefined, null, ""]) {
    assert.throws(
      () => executor.executeBootstrap({ projectId: "PROJ", targetPath }),
      (e) => e instanceof BootstrapExecutorError && e.code === "DENY_INVALID_TARGET_PATH",
      `targetPath ${JSON.stringify(targetPath)} must be refused`
    );
  }
  // The registration service throws if consulted. Reaching it would mean the
  // executor had begun work on a request with no destination.
});

test("DENY_MAIN_BRANCH_MUTATION — the repository root is refused in EVERY environment", () => {
  // This guard was gated on `process.env.NODE_ENV === "production"` and had
  // therefore never fired: NODE_ENV appears exactly once in this repository, in
  // the condition itself, and nothing sets it. Measured before the fix —
  // undefined, "test" and "development" all walked past it; only "production"
  // refused. A guard whose activation depends on a variable nobody sets is dead
  // code that reads as protection.
  //
  // proposed_changes is EMPTY on purpose. If the guard ever regresses, this test
  // must not become the thing that writes into the repository root.
  const authorized = {
    status: "AUTHORIZED_FOR_BOOTSTRAP",
    repository_mutation_authorized: true,
    registration_id: "reg_containment",
    proposed_changes: []
  };
  const executor = new SecBBootstrapExecutor({
    registrationService: { inspectRegistration: () => authorized }
  });

  const previous = process.env.NODE_ENV;
  try {
    for (const env of [undefined, "test", "development", "production"]) {
      if (env === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = env;
      assert.throws(
        () => executor.executeBootstrap({ projectId: "PROJ", targetPath: process.cwd() }),
        (e) => e instanceof BootstrapExecutorError && e.code === "DENY_MAIN_BRANCH_MUTATION",
        `the repository root must be refused with NODE_ENV=${String(env)}`
      );
    }
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
