import { createHash } from "node:crypto";
import { resolve } from "node:path";

/**
 * SecB Project Worktree Manager
 * Connects Controlled Projects with isolated Worktree workspaces for candidate execution
 * and evidence-sealed merge readiness verification.
 */

export class ProjectWorktreeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ProjectWorktreeError";
    this.code = code;
  }
}

function hashString(val) {
  return createHash("sha256").update(val).digest("hex");
}

export class ProjectWorktreeManager {
  #allocations = new Map();
  #baseWorktreeDir;

  constructor({ baseWorktreeDir } = {}) {
    this.#baseWorktreeDir = baseWorktreeDir ? resolve(baseWorktreeDir) : resolve(process.cwd(), ".secb", "worktrees");
  }

  createWorktreeAllocation({ projectId, branchName = "feature/worktree-branch" }) {
    if (!projectId || !branchName) {
      throw new ProjectWorktreeError("INVALID_ALLOCATION_PARAMS", "projectId and branchName are required");
    }

    if (branchName.toLowerCase() === "main" || branchName.toLowerCase() === "master") {
      throw new ProjectWorktreeError("DENY_MAIN_BRANCH_ALLOCATION", "Direct allocation on main/master branch is strictly prohibited");
    }

    const allocationId = `WORKTREE-ALLOC-${projectId}-${Date.now()}`;
    const targetPath = resolve(this.#baseWorktreeDir, projectId, branchName.replace(/[^a-zA-Z0-9_-]/g, "_"));
    const timestamp = new Date().toISOString();

    const payload = {
      allocation_id: allocationId,
      project_id: projectId,
      target_branch: branchName,
      target_path: targetPath,
      status: "ALLOCATED",
      created_at: timestamp
    };

    const fingerprint = hashString(JSON.stringify(payload));
    const allocation = { ...payload, fingerprint };

    this.#allocations.set(allocationId, allocation);
    return allocation;
  }

  inspectWorktreeAllocation(allocationId) {
    const allocation = this.#allocations.get(allocationId);
    if (!allocation) {
      throw new ProjectWorktreeError("ALLOCATION_NOT_FOUND", `Allocation ${allocationId} not found`);
    }
    return allocation;
  }

  verifyMergeReadiness({ allocationId, evidenceEnvelope = {} }) {
    const allocation = this.inspectWorktreeAllocation(allocationId);

    const hasFingerprint = Boolean(evidenceEnvelope.fingerprint);
    const isTestPassed = evidenceEnvelope.test_results?.fail === 0 || evidenceEnvelope.status === "PASSED";

    const isReady = hasFingerprint && isTestPassed;

    return {
      ok: true,
      allocation_id: allocationId,
      project_id: allocation.project_id,
      target_branch: allocation.target_branch,
      evidence_sealed: hasFingerprint,
      test_passed: isTestPassed,
      merge_ready: isReady,
      recommended_action: isReady
        ? "Submit Signed Merge Request to Human GOV"
        : "Complete test execution and seal evidence envelope before requesting merge"
    };
  }
}
