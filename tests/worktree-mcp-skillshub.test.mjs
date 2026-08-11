import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { secbWorktreeStatus, secbWorktreeListCrates, secbWorktreeInspectStorage } from "../src/mcp/worktree-mcp-tools.mjs";
import { SecBSkillsHub } from "../src/skills/skills-hub-service.mjs";
import { SecBMcpServer } from "../src/mcp/secb-mcp-server.mjs";

/**
 * A skills root containing one package with no manifest.
 *
 * These two tests used to point the hub at the REAL `.agents/skills` and name
 * `worktree` and `secb-project-registry`, which carried no manifest.yaml. That
 * made a genuine safety property -- the hub withholds a package with no governed
 * identity -- depend on the corpus continuing to contain an ungoverned package.
 * It stopped holding the moment those two were moved to `.agents/tool-notes/`,
 * where they belonged. The property is unchanged and still asserted; only the
 * subject is now built rather than borrowed.
 */
function withUngovernedPackage(run) {
  const root = mkdtempSync(join(tmpdir(), "secb-skills-ungoverned-"));
  try {
    const pkg = join(root, "fixture-ungoverned");
    mkdirSync(pkg, { recursive: true });
    const body = ["# fixture-ungoverned", "", "No manifest, so no governed identity.", ""].join(String.fromCharCode(10));
    writeFileSync(join(pkg, "SKILL.md"), body);
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function withWorktreeFixture(run) {
  const root = mkdtempSync(join(tmpdir(), "secb-worktree-fixture-"));
  try {
    writeFileSync(join(root, "Cargo.toml"), "[workspace]\nmembers = [\"crates/*\"]\n");
    writeFileSync(join(root, "package.json"), '{"private":true}\n');
    writeFileSync(join(root, "turbo.json"), '{}\n');
    for (const name of ["worktree-server", "worktree-core", "worktree-cli", "worktree-git", "worktree-api", "worktree-test"]) {
      const crate = join(root, "crates", name);
      mkdirSync(crate, { recursive: true });
      writeFileSync(join(crate, "Cargo.toml"), `[package]\nname = "${name}"\nversion = "0.1.0"\n`);
    }
    const storage = join(root, "crates", "worktree-server", "src", "storage");
    mkdirSync(storage, { recursive: true });
    writeFileSync(join(storage, "Software_v2.0.zip"), "fixture");
    mkdirSync(join(root, "apps", "dashboard"), { recursive: true });
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("secbWorktreeStatus resolves Worktree repo details", () => {
  withWorktreeFixture((worktreeDir) => {
  const status = secbWorktreeStatus({ worktreeDir });
  assert.equal(status.ok, true);
  assert.equal(typeof status.path, "string");
  assert.equal(status.isRustWorkspace, true);
  assert.equal(status.isTurborepo, true);
  assert.ok(status.cratesCount >= 6);
  assert.ok(status.crates.includes("worktree-server"));
  });
});

test("secbWorktreeListCrates returns crate list", () => {
  withWorktreeFixture((worktreeDir) => {
  const cratesRes = secbWorktreeListCrates({ worktreeDir });
  assert.equal(cratesRes.ok, true);
  assert.ok(cratesRes.count >= 6);
  const serverCrate = cratesRes.crates.find((c) => c.name === "worktree-server");
  assert.ok(serverCrate);
  assert.equal(serverCrate.hasCargo, true);
  });
});

test("secbWorktreeInspectStorage inspects worktree-server storage", () => {
  withWorktreeFixture((worktreeDir) => {
  const storageRes = secbWorktreeInspectStorage({ worktreeDir });
  assert.equal(storageRes.ok, true);
  assert.ok(storageRes.fileCount > 0);
  const zipFile = storageRes.files.find((f) => f.isArchive);
  assert.ok(zipFile);
  assert.equal(zipFile.name, "Software_v2.0.zip");
  });
});

test("SecBSkillsHub withholds a package that carries no manifest", () => {
  withUngovernedPackage((skillsDir) => {
    const hub = new SecBSkillsHub({
      skillsDir,
      services: { skillResolver: { resolveSkill: () => ({ skill: {}, code: "ALLOW" }) } }
    });
    const context = { projectId: "prj_secb", runtime: "claude-code", dataClassification: "INTERNAL" };

    // Indexes for discovery, withholds on access. The unwired-resolver path used
    // to return such a package's content outright.
    const searchRes = hub.searchSkills("fixture-ungoverned", context);
    assert.equal(searchRes.ok, true);
    assert.equal(searchRes.count, 0);
    assert.ok(searchRes.withheld_count >= 1);

    const skill = hub.getSkill("fixture-ungoverned", context);
    assert.equal(skill.ok, false);
    assert.equal(skill.deny_code, "DENY_UNGOVERNED_PACKAGE");
  });
});

test("SecBMcpServer dispatches Worktree tools successfully", () => {
  withWorktreeFixture((worktreeDir) => {
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
        arguments: { worktreeDir }
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
});

test("SecBWorktreeAdapter plugin inspects external worktree repository", async () => {
  const { SecBWorktreeAdapter } = await import("../src/plugins/secb-worktree-adapter.mjs");
  await withWorktreeFixture((worktreeDir) => {
  const adapter = new SecBWorktreeAdapter({ worktreeDir });
  const report = adapter.inspect();
  assert.equal(report.plugin_name, "secb-worktree-adapter");
  assert.equal(report.type, "plugin");
  assert.equal(report.status.ok, true);
  assert.equal(report.crates.ok, true);
  assert.equal(report.storage.ok, true);
  });
});

test("SecBSkillsHub denies when no resolver is wired, before any governance question", () => {
  withUngovernedPackage((skillsDir) => {
    const hub = new SecBSkillsHub({ skillsDir });
    const skill = hub.getSkill("fixture-ungoverned", {
      projectId: "prj_secb",
      runtime: "claude-code",
      dataClassification: "INTERNAL"
    });
    assert.equal(skill.ok, false);
    assert.equal(skill.deny_code, "DENY_NO_RESOLVER");
  });
});
