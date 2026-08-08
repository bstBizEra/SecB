/**
 * SecB Worktree Plugin Adapter & Inspection Service
 * 
 * Provides a loosely-coupled, policy-governed plugin boundary between SecB's
 * core runtime control plane and external cloned Worktree repositories.
 * Operates strictly read-only under SecB data classification ceilings.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { secbWorktreeStatus, secbWorktreeListCrates, secbWorktreeInspectStorage } from "../mcp/worktree-mcp-tools.mjs";

export class WorktreeAdapterError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "WorktreeAdapterError";
    this.code = code;
  }
}

export class SecBWorktreeAdapter {
  #worktreeDir;
  #classificationCeiling;

  constructor({ worktreeDir, classificationCeiling = "INTERNAL" } = {}) {
    this.#worktreeDir = worktreeDir ? resolve(worktreeDir) : resolve(process.cwd(), "worktree");
    this.#classificationCeiling = classificationCeiling;
  }

  get worktreeDir() {
    return this.#worktreeDir;
  }

  inspect() {
    if (!existsSync(this.#worktreeDir)) {
      throw new WorktreeAdapterError("WORKTREE_DIR_NOT_FOUND", `Worktree repository not found at ${this.#worktreeDir}`);
    }

    const status = secbWorktreeStatus({ worktreeDir: this.#worktreeDir });
    const crates = secbWorktreeListCrates({ worktreeDir: this.#worktreeDir });
    const storage = secbWorktreeInspectStorage({ worktreeDir: this.#worktreeDir });

    return {
      plugin_name: "secb-worktree-adapter",
      type: "plugin",
      governance: "GOV-MCP-01..09",
      classification_ceiling: this.#classificationCeiling,
      status,
      crates,
      storage
    };
  }
}
