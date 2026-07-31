import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { secbWorktreeStatus, secbWorktreeListCrates, secbWorktreeInspectStorage } from "../src/mcp/worktree-mcp-tools.mjs";
import { SecBSkillsHub } from "../src/skills/skills-hub-service.mjs";
import { SecBMcpServer } from "../src/mcp/secb-mcp-server.mjs";

test("secbWorktreeStatus resolves Worktree repo details", () => {
  const status = secbWorktreeStatus();
  assert.equal(status.ok, true);
  assert.equal(typeof status.path, "string");
  assert.equal(status.isRustWorkspace, true);
  assert.equal(status.isTurborepo, true);
  assert.ok(status.cratesCount >= 6);
  assert.ok(status.crates.includes("worktree-server"));
});

test("secbWorktreeListCrates returns crate list", () => {
  const cratesRes = secbWorktreeListCrates();
  assert.equal(cratesRes.ok, true);
  assert.ok(cratesRes.count >= 6);
  const serverCrate = cratesRes.crates.find((c) => c.name === "worktree-server");
  assert.ok(serverCrate);
  assert.equal(serverCrate.hasCargo, true);
});

test("secbWorktreeInspectStorage inspects worktree-server storage", () => {
  const storageRes = secbWorktreeInspectStorage();
  assert.equal(storageRes.ok, true);
  assert.ok(storageRes.fileCount > 0);
  const zipFile = storageRes.files.find((f) => f.isArchive);
  assert.ok(zipFile);
  assert.equal(zipFile.name, "Software_v2.0.zip");
});

// The worktree and secb-project-registry packages carry no manifest.yaml, so
// they have no governed identity to resolve. They index for discovery and
// withhold on access; previously the unwired-resolver path returned their
// content outright.
test("SecBSkillsHub withholds the ungoverned worktree package", () => {
  const hub = new SecBSkillsHub({ services: { skillResolver: { resolveSkill: () => ({ skill: {}, code: "ALLOW" }) } } });
  const context = { projectId: "prj_secb", runtime: "claude-code", dataClassification: "INTERNAL" };

  const searchRes = hub.searchSkills("worktree", context);
  assert.equal(searchRes.ok, true);
  assert.equal(searchRes.count, 0);
  assert.ok(searchRes.withheld_count >= 1);

  const skill = hub.getSkill("worktree", context);
  assert.equal(skill.ok, false);
  assert.equal(skill.deny_code, "DENY_UNGOVERNED_PACKAGE");
});

test("SecBMcpServer dispatches Worktree tools successfully", () => {
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

  const res = server.handle(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "secb_worktree_status",
        arguments: {}
      }
    },
    { callerInstanceId: "test-agent" }
  );

  assert.equal(res.id, 1);
  assert.ok(res.result);
  assert.equal(res.result.data.ok, true);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].tool, "secb_worktree_status");
});

test("SecBWorktreeAdapter plugin inspects external worktree repository", async () => {
  const { SecBWorktreeAdapter } = await import("../src/plugins/secb-worktree-adapter.mjs");
  const adapter = new SecBWorktreeAdapter();
  const report = adapter.inspect();
  assert.equal(report.plugin_name, "secb-worktree-adapter");
  assert.equal(report.type, "plugin");
  assert.equal(report.status.ok, true);
  assert.equal(report.crates.ok, true);
  assert.equal(report.storage.ok, true);
});

test("SecBSkillsHub withholds the ungoverned secb-project-registry package", () => {
  const hub = new SecBSkillsHub();
  const skill = hub.getSkill("secb-project-registry", {
    projectId: "prj_secb",
    runtime: "claude-code",
    dataClassification: "INTERNAL"
  });
  assert.equal(skill.ok, false);
  assert.equal(skill.deny_code, "DENY_NO_RESOLVER");
});
