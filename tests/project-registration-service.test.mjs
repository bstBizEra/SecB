import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { ProjectRegistrationService, ProjectRegistrationError } from "../src/project/project-registration-service.mjs";
import { BootstrapAuthorizationGate } from "../src/control/bootstrap-authorization-gate.mjs";
import { SecBMcpServer } from "../src/mcp/secb-mcp-server.mjs";

const testStagingDir = resolve(process.cwd(), ".secb", "test-staging-reg");

test.after(() => {
  if (existsSync(testStagingDir)) {
    rmSync(testStagingDir, { recursive: true, force: true });
  }
});

test("ProjectRegistrationService registers proposal-only draft in staging without target repo mutation", () => {
  const service = new ProjectRegistrationService({ stagingBaseDir: testStagingDir });
  const pkg = service.registerDraft({
    projectId: "SECB-TEST-001",
    name: "SecB Test Project",
    owners: ["admin@secb.local"],
    classification: "INTERNAL"
  });

  assert.equal(pkg.project_id, "SECB-TEST-001");
  assert.equal(pkg.mode, "proposal_only");
  assert.equal(pkg.repository_mutation_authorized, false);
  assert.equal(pkg.status, "REGISTERED_PROPOSAL_ONLY");
  assert.ok(pkg.proposed_changes.length >= 2);
  assert.ok(pkg.prohibited_actions.includes("repository_write"));

  const stagedFile = join(testStagingDir, "SECB-TEST-001", "registration-package.json");
  assert.equal(existsSync(stagedFile), true);
});

test("ProjectRegistrationService inspects registration and verifies proposed manifest fingerprints", () => {
  const service = new ProjectRegistrationService({ stagingBaseDir: testStagingDir });
  service.registerDraft({ projectId: "SECB-TEST-002", name: "Manifest Test" });

  const pkg = service.inspectRegistration("SECB-TEST-002");
  assert.equal(pkg.project_id, "SECB-TEST-002");

  const verification = service.verifyProposedManifest("SECB-TEST-002");
  assert.equal(verification.project_id, "SECB-TEST-002");
  assert.equal(verification.repository_mutation_authorized, false);
  assert.ok(verification.total_proposed >= 2);
  assert.equal(verification.verified.every((v) => v.hashVerified), true);
});

test("BootstrapAuthorizationGate fails closed on missing signature", () => {
  const service = new ProjectRegistrationService({ stagingBaseDir: testStagingDir });
  service.registerDraft({ projectId: "SECB-TEST-003" });

  const gate = new BootstrapAuthorizationGate({ registrationService: service });

  assert.throws(
    () => {
      gate.authorizeBootstrap({ projectId: "SECB-TEST-003", authorizationRecord: {} });
    },
    (err) => err instanceof ProjectRegistrationError && err.code === "DENY_UNAUTHORIZED_MUTATION"
  );
});

test("BootstrapAuthorizationGate authorizes bootstrap with signed human GOV decision record", () => {
  const service = new ProjectRegistrationService({ stagingBaseDir: testStagingDir });
  service.registerDraft({ projectId: "SECB-TEST-004" });

  const gate = new BootstrapAuthorizationGate({ registrationService: service });
  const updated = gate.authorizeBootstrap({
    projectId: "SECB-TEST-004",
    authorizationRecord: { decisionId: "DEC-001", approvedBy: "gov-admin@secb.local" },
    reviewerSignature: "SIG-HUMAN-GOV-APPROVED"
  });

  assert.equal(updated.status, "AUTHORIZED_FOR_BOOTSTRAP");
  assert.equal(updated.repository_mutation_authorized, true);
});

test("SecBMcpServer dispatches project registration tools", () => {
  const service = new ProjectRegistrationService({ stagingBaseDir: testStagingDir });
  const registry = {
    resolve: (id) => ({
      resolved: true,
      identity: { agent_instance_id: id, max_data_classification: "INTERNAL", state: "ACTIVE" }
    })
  };
  const logs = [];
  const server = new SecBMcpServer({
    services: { registry, registrationService: service },
    invocationLog: (entry) => logs.push(entry),
    classificationCeiling: "INTERNAL"
  });

  const draftRes = server.handle(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "secb_project_register_draft",
        arguments: { project_id: "SECB-MCP-PROJ" }
      }
    },
    { callerInstanceId: "test-agent" }
  );

  assert.equal(draftRes.id, 1);
  assert.ok(draftRes.result);
  assert.equal(draftRes.result.data.project_id, "SECB-MCP-PROJ");
  assert.equal(draftRes.result.data.mode, "proposal_only");

  const verifyRes = server.handle(
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "secb_project_proposed_manifest_verify",
        arguments: { project_id: "SECB-MCP-PROJ" }
      }
    },
    { callerInstanceId: "test-agent" }
  );

  assert.equal(verifyRes.id, 2);
  assert.equal(verifyRes.result.data.project_id, "SECB-MCP-PROJ");
  assert.equal(verifyRes.result.data.repository_mutation_authorized, false);
});
