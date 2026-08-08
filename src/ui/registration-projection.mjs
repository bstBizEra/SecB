import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * SecB Staged Project Registration Projection Service
 * Formats staged registration packages, proposed manifests, and SHA-256 fingerprints
 * for SecB Command Center visualizers and reporting UI.
 */

export function projectRegistrationProjection(stagingBaseDir) {
  const baseDir = stagingBaseDir ? resolve(stagingBaseDir) : resolve(process.cwd(), ".secb", "staging", "projects");

  if (!existsSync(baseDir)) {
    return {
      total_staged: 0,
      projects: []
    };
  }

  const projects = [];
  try {
    const entries = readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pkgPath = join(baseDir, entry.name, "registration-package.json");
        if (existsSync(pkgPath)) {
          const raw = JSON.parse(readFileSync(pkgPath, "utf8"));
          const proposed = raw.proposed_changes ?? [];
          projects.push({
            project_id: raw.project_id,
            registration_id: raw.registration_id,
            status: raw.status,
            mode: raw.mode,
            repository_mutation_authorized: raw.repository_mutation_authorized,
            identity: raw.identity,
            proposed_count: proposed.length,
            proposed_changes: proposed,
            created_at: raw.created_at
          });
        }
      }
    }
  } catch (_e) {
    // Graceful projection fallback
  }

  return {
    total_staged: projects.length,
    projects
  };
}
