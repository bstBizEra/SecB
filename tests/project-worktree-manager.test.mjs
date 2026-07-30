import { test } from "node:test";
import assert from "node:assert/strict";
import { ProjectWorktreeManager, ProjectWorktreeError } from "../src/project/project-worktree-manager.mjs";
import { SecBMcpServer } from "../src/mcp/secb-mcp-server.mjs";

test("ProjectWorktreeManager allocates non-main worktree workspace", () => {
  const manager = new ProjectWorktreeManager();
  const allocation = manager.createWorktreeAllocation({
    projectId: "SECB",
    branchName: "feature/brain-v2"
  });

  assert.ok(allocation.allocation_id.startsWith("WORKTREE-ALLOC-SECB-"));
  assert.equal(allocation.project_id, "SECB");
  assert.equal(allocation.target_branch, "feature/brain-v2");
  assert.equal(allocation.status, "ALLOCATED");
  assert.ok(allocation.target_path.includes("feature_brain-v2"));
});

test("ProjectWorktreeManager denies main branch allocation", () => {
  const manager = new ProjectWorktreeManager();
  assert.throws(
    () => manager.createWorktreeAllocation({ projectId: "SECB", branchName: "main" }),
    (err) => err instanceof ProjectWorktreeError && err.code === "DENY_MAIN_BRANCH_ALLOCATION"
  );
});

test("ProjectWorktreeManager verifies evidence-sealed merge readiness", () => {
  const manager = new ProjectWorktreeManager();
  const allocation = manager.createWorktreeAllocation({
    projectId: "PROJ-ALPHA",
    branchName: "feature/core-auth"
  });

  // Verification without evidence sealing
  const unready = manager.verifyMergeReadiness({
    allocationId: allocation.allocation_id,
    evidenceEnvelope: {}
  });
  assert.equal(unready.merge_ready, false);

  // Verification with valid evidence envelope
  const ready = manager.verifyMergeReadiness({
    allocationId: allocation.allocation_id,
    evidenceEnvelope: {
      fingerprint: "a".repeat(64),
      test_results: { fail: 0 }
    }
  });
  assert.equal(ready.merge_ready, true);
  assert.ok(ready.recommended_action.includes("Human GOV"));
});

test("SecBMcpServer dispatches secb_project_worktree_manage tool", () => {
  const manager = new ProjectWorktreeManager();
  const alloc = manager.createWorktreeAllocation({
    projectId: "PROJ-MCP",
    branchName: "feature/mcp-integration"
  });

  const registry = {
    resolve: (id) => ({
      resolved: true,
      identity: { agent_instance_id: id, max_data_classification: "INTERNAL", state: "ACTIVE" }
    })
  };
  const logs = [];
  const server = new SecBMcpServer({
    services: { registry, projectWorktreeManager: manager },
    invocationLog: (entry) => logs.push(entry),
    classificationCeiling: "INTERNAL"
  });

  const res = server.handle(
    {
      jsonrpc: "2.0",
      id: 600,
      method: "tools/call",
      params: {
        name: "secb_project_worktree_manage",
        arguments: { allocation_id: alloc.allocation_id }
      }
    },
    { callerInstanceId: "test-agent" }
  );

  assert.equal(res.id, 600);
  assert.equal(res.result.data.project_id, "PROJ-MCP");
  assert.equal(res.result.data.target_branch, "feature/mcp-integration");
});
