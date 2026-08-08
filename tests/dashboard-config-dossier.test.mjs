import { test } from "node:test";
import assert from "node:assert/strict";

import { getSystemSettings } from "../src/config/system-settings.mjs";
import { CommandCenterDashboardServer } from "../src/ui/dashboard-server.mjs";
import { GovernanceAuditDossier } from "../src/control/governance-audit-dossier.mjs";
import { SecBMcpServer } from "../src/mcp/secb-mcp-server.mjs";

test("CommandCenterDashboardServer aggregates real-time state across Stages 1-9", () => {
  const dash = new CommandCenterDashboardServer({});
  const state = dash.getDashboardState();

  assert.equal(state.system_name, "SecB Operating System & Control Plane");
  assert.equal(state.version, "0.3.0-alpha.0");
  assert.equal(typeof state.stages.stage_1_registration.total_staged_projects, "number");
  assert.equal(state.stages.stage_9_control_bus_mcp.mcp_tools_catalog_count, 32);
});

test("GovernanceAuditDossier generates printable Markdown audit document", () => {
  const dossierEngine = new GovernanceAuditDossier();
  const dossier = dossierEngine.generateDossier({ projectId: "SECB" });

  assert.ok(dossier.dossier_id.startsWith("DOSSIER-SECB-"));
  assert.equal(dossier.project_id, "SECB");
  assert.equal(typeof dossier.fingerprint, "string");
  assert.equal(dossier.fingerprint.length, 64);
  assert.ok(dossier.content.includes("Governance Audit Dossier"));
  assert.ok(dossier.content.includes("Stage 1–9 Lifecycle Verification"));
});

test("SecBMcpServer dispatches secb_dashboard_inspect, secb_system_settings_inspect, and secb_governance_dossier_generate", () => {
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

  const dashRes = server.handle(
    {
      jsonrpc: "2.0",
      id: 950,
      method: "tools/call",
      params: {
        name: "secb_dashboard_inspect",
        arguments: {}
      }
    },
    { callerInstanceId: "test-agent" }
  );

  assert.equal(dashRes.id, 950);
  assert.equal(dashRes.result.data.system_name, "SecB Operating System & Control Plane");

  const settingsRes = server.handle(
    {
      jsonrpc: "2.0",
      id: 951,
      method: "tools/call",
      params: {
        name: "secb_system_settings_inspect",
        arguments: {}
      }
    },
    { callerInstanceId: "test-agent" }
  );

  assert.equal(settingsRes.id, 951);
  assert.equal(settingsRes.result.data.environment, "development");

  const dossierRes = server.handle(
    {
      jsonrpc: "2.0",
      id: 952,
      method: "tools/call",
      params: {
        name: "secb_governance_dossier_generate",
        arguments: { projectId: "SECB-TEST" }
      }
    },
    { callerInstanceId: "test-agent" }
  );

  assert.equal(dossierRes.id, 952);
  assert.equal(dossierRes.result.data.project_id, "SECB-TEST");
  assert.ok(dossierRes.result.data.fingerprint);
});
