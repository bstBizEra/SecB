import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * Worktree MCP Tool Providers — Governed Read-Only Projections
 */

export function resolveWorktreeDir(customPath) {
  if (customPath) {
    const p = resolve(customPath);
    if (existsSync(p)) return p;
  }
  const defaultPath = resolve(process.cwd(), "worktree");
  if (existsSync(defaultPath)) return defaultPath;
  return null;
}

export function secbWorktreeStatus({ worktreeDir: customDir } = {}) {
  const dir = resolveWorktreeDir(customDir);
  if (!dir) {
    return { ok: false, error: "Worktree repository directory not found" };
  }

  const hasCargo = existsSync(join(dir, "Cargo.toml"));
  const hasPackageJson = existsSync(join(dir, "package.json"));
  const hasTurbo = existsSync(join(dir, "turbo.json"));

  let crates = [];
  const cratesPath = join(dir, "crates");
  if (existsSync(cratesPath)) {
    try {
      crates = readdirSync(cratesPath, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch (_e) {}
  }

  let apps = [];
  const appsPath = join(dir, "apps");
  if (existsSync(appsPath)) {
    try {
      apps = readdirSync(appsPath, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch (_e) {}
  }

  return {
    ok: true,
    path: dir,
    isRustWorkspace: hasCargo,
    isTurborepo: hasPackageJson && hasTurbo,
    cratesCount: crates.length,
    crates,
    appsCount: apps.length,
    apps
  };
}

export function secbWorktreeListCrates({ worktreeDir: customDir } = {}) {
  const dir = resolveWorktreeDir(customDir);
  if (!dir) {
    return { ok: false, error: "Worktree repository directory not found" };
  }

  const cratesPath = join(dir, "crates");
  if (!existsSync(cratesPath)) {
    return { ok: true, count: 0, crates: [] };
  }

  const crates = [];
  try {
    const entries = readdirSync(cratesPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const crateDir = join(cratesPath, entry.name);
        const cargoPath = join(crateDir, "Cargo.toml");
        const hasCargo = existsSync(cargoPath);
        crates.push({
          name: entry.name,
          path: crateDir,
          hasCargo
        });
      }
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }

  return {
    ok: true,
    count: crates.length,
    crates
  };
}

export function secbWorktreeInspectStorage({ worktreeDir: customDir } = {}) {
  const dir = resolveWorktreeDir(customDir);
  if (!dir) {
    return { ok: false, error: "Worktree repository directory not found" };
  }

  const storagePath = join(dir, "crates", "worktree-server", "src", "storage");
  if (!existsSync(storagePath)) {
    return { ok: false, error: "worktree-server storage directory not found" };
  }

  const files = [];
  try {
    const entries = readdirSync(storagePath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        const filePath = join(storagePath, entry.name);
        const st = statSync(filePath);
        files.push({
          name: entry.name,
          sizeBytes: st.size,
          isArchive: entry.name.endsWith(".zip") || entry.name.endsWith(".tar.gz")
        });
      }
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }

  return {
    ok: true,
    storagePath,
    fileCount: files.length,
    files
  };
}
