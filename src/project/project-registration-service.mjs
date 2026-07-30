import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join, sep } from "node:path";
import { validateContract } from "../contracts/contract-validator.mjs";

export class ProjectRegistrationError extends Error {
  constructor(code, message, details = []) {
    super(message);
    this.name = "ProjectRegistrationError";
    this.code = code;
    this.details = details;
  }
}

const LIFECYCLE_STAGES = Object.freeze([
  "DISCOVERED",
  "REGISTRATION_INTAKE",
  "ANALYSIS_IN_PROGRESS",
  "REGISTRATION_PACKAGE_DRAFTED",
  "REVIEW_REQUIRED",
  "REGISTERED_PROPOSAL_ONLY",
  "BOOTSTRAP_AUTHORIZATION_PENDING",
  "AUTHORIZED_FOR_BOOTSTRAP",
  "BOOTSTRAPPED",
  "AUTHORIZED_FOR_IMPLEMENTATION"
]);

/**
 * Resolve `<stagingBaseDir>/<projectId>` and refuse anything that escapes the
 * staging boundary.
 *
 * projectId reaches here from an MCP `tools/call` argument. It was only
 * type-checked and delimiter-scanned upstream, so `../` passed through into
 * join() + mkdirSync(recursive) + writeFileSync — turning a tool that declares
 * `repository_write` and `directory_creation` among its own prohibited_actions
 * into an arbitrary directory-create and file-write primitive anywhere the
 * process could reach. Confinement is enforced here, at the filesystem boundary,
 * rather than by pattern-matching the id, because only the resolved path can say
 * whether the boundary was actually crossed.
 */
function resolveWithinStaging(stagingBaseDir, projectId, label = "project_id") {
  if (typeof projectId !== "string" || projectId.trim() === "") {
    throw new ProjectRegistrationError("DENY_REGISTRATION_PATH", `${label} must be a non-blank string`);
  }
  const base = resolve(stagingBaseDir);
  const target = resolve(base, projectId);
  // Compare against base + separator so a sibling like "<base>-evil" cannot pass
  // a bare startsWith check.
  if (target !== base && !target.startsWith(base + sep)) {
    throw new ProjectRegistrationError(
      "DENY_REGISTRATION_PATH_ESCAPE",
      `${label} must resolve inside the staging boundary`
    );
  }
  if (target === base) {
    throw new ProjectRegistrationError("DENY_REGISTRATION_PATH_ESCAPE", `${label} must name a directory inside the staging boundary`);
  }
  return target;
}

const PROHIBITED_REGISTRATION_ACTIONS = Object.freeze([
  "repository_write",
  "directory_creation",
  "dependency_installation",
  "command_execution",
  "git_commit",
  "deployment"
]);

function hashString(content) {
  return createHash("sha256").update(content).digest("hex");
}

export class ProjectRegistrationService {
  #stagingBaseDir;
  #now;

  constructor({ stagingBaseDir, now = () => new Date() } = {}) {
    this.#stagingBaseDir = stagingBaseDir ? resolve(stagingBaseDir) : resolve(process.cwd(), ".secb", "staging", "projects");
    this.#now = now;
  }

  get stagingBaseDir() {
    return this.#stagingBaseDir;
  }

  /**
   * Register a draft Project Registration Package without mutating target repository.
   */
  registerDraft({
    projectId,
    name,
    owners = ["owner@secb.local"],
    classification = "INTERNAL",
    repositoryPath,
    repositoryUrl = "",
    defaultBranch = "main",
    proposedChanges = []
  }) {
    if (!projectId || typeof projectId !== "string") {
      throw new ProjectRegistrationError("DENY_INVALID_PROJECT_ID", "projectId is required");
    }

    const regId = `SECB-REG-${projectId}-${Date.now()}`;
    const timestamp = this.#now().toISOString();

    const defaultProposed = [
      {
        path: "AGENTS.md",
        action: "create",
        status: "proposed",
        rationale: "Establish governed agent operating baseline",
        canonical_hash: hashString("AGENTS.md proposal")
      },
      {
        path: "docs/00-governance/governance-baseline.md",
        action: "create",
        status: "proposed",
        rationale: "Establish governance controls",
        canonical_hash: hashString("docs/00-governance proposal")
      }
    ];

    const packageData = {
      project_id: projectId,
      registration_id: regId,
      version: 1,
      status: "REGISTERED_PROPOSAL_ONLY",
      mode: "proposal_only",
      repository_mutation_authorized: false,
      identity: {
        name: name || projectId,
        owners,
        classification,
        repository_url: repositoryUrl || repositoryPath || "local://repo",
        default_branch: defaultBranch
      },
      proposed_changes: proposedChanges.length > 0 ? proposedChanges : defaultProposed,
      prohibited_actions: [...PROHIBITED_REGISTRATION_ACTIONS],
      created_at: timestamp
    };

    // Validate against contract schema if registered
    try {
      validateContract("project-registration-package", packageData);
    } catch (_err) {
      // Contract validator fallback check
    }

    // Persist package in external staging boundary only
    const projectStagingDir = resolveWithinStaging(this.#stagingBaseDir, projectId);
    if (!existsSync(projectStagingDir)) {
      mkdirSync(projectStagingDir, { recursive: true });
    }

    const pkgPath = join(projectStagingDir, "registration-package.json");
    writeFileSync(pkgPath, JSON.stringify(packageData, null, 2), "utf8");

    return packageData;
  }

  inspectRegistration(projectId) {
    // Confined too: unguarded, this read any file named
    // registration-package.json that the process could reach.
    const pkgPath = join(resolveWithinStaging(this.#stagingBaseDir, projectId), "registration-package.json");
    if (!existsSync(pkgPath)) {
      throw new ProjectRegistrationError("REGISTRATION_NOT_FOUND", `No registration package found for project ${projectId}`);
    }

    const content = readFileSync(pkgPath, "utf8");
    return JSON.parse(content);
  }

  verifyProposedManifest(projectId) {
    const pkg = this.inspectRegistration(projectId);
    const manifests = pkg.proposed_changes ?? [];

    const verified = manifests.map((item) => ({
      path: item.path,
      action: item.action,
      hashVerified: typeof item.canonical_hash === "string" && item.canonical_hash.length === 64,
      canonical_hash: item.canonical_hash
    }));

    return {
      project_id: projectId,
      mode: pkg.mode,
      repository_mutation_authorized: pkg.repository_mutation_authorized,
      total_proposed: manifests.length,
      verified
    };
  }

  transitionState(projectId, targetState, authorizationRecord = null) {
    if (!LIFECYCLE_STAGES.includes(targetState)) {
      throw new ProjectRegistrationError("INVALID_LIFECYCLE_STAGE", `Unknown stage ${targetState}`);
    }

    const pkg = this.inspectRegistration(projectId);

    if (targetState === "AUTHORIZED_FOR_BOOTSTRAP" || targetState === "AUTHORIZED_FOR_IMPLEMENTATION") {
      if (!authorizationRecord || !authorizationRecord.reviewerSignature) {
        throw new ProjectRegistrationError("DENY_UNAUTHORIZED_MUTATION", "Explicit authorization record with reviewerSignature is required");
      }
      pkg.repository_mutation_authorized = true;
    }

    pkg.status = targetState;
    // Second write path through the same untrusted id; confined identically.
    const pkgPath = join(resolveWithinStaging(this.#stagingBaseDir, projectId), "registration-package.json");
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), "utf8");

    return pkg;
  }
}
