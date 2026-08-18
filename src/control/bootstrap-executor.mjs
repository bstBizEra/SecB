import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";

export class BootstrapExecutorError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BootstrapExecutorError";
    this.code = code;
  }
}

export class SecBBootstrapExecutor {
  #registrationService;
  #authorizationGate;

  constructor({ registrationService, authorizationGate }) {
    if (!registrationService) {
      throw new Error("SecBBootstrapExecutor requires registrationService");
    }
    this.#registrationService = registrationService;
    this.#authorizationGate = authorizationGate;
  }

  executeBootstrap({ projectId, targetPath, authorizationRecord, reviewerSignature }) {
    if (!projectId) {
      throw new BootstrapExecutorError("DENY_INVALID_PROJECT_ID", "projectId is required");
    }
    if (!targetPath) {
      throw new BootstrapExecutorError("DENY_INVALID_TARGET_PATH", "targetPath is required");
    }

    let pkg = this.#registrationService.inspectRegistration(projectId);

    // If un-authorized, attempt to authorize via gate if record is provided
    if (pkg.status !== "AUTHORIZED_FOR_BOOTSTRAP") {
      if (this.#authorizationGate && authorizationRecord && reviewerSignature) {
        pkg = this.#authorizationGate.authorizeBootstrap({ projectId, authorizationRecord, reviewerSignature });
      }
    }

    // Fail-closed enforcement
    if (pkg.status !== "AUTHORIZED_FOR_BOOTSTRAP" || pkg.repository_mutation_authorized !== true) {
      throw new BootstrapExecutorError(
        "DENY_UNAUTHORIZED_BOOTSTRAP",
        `Bootstrap execution denied: project ${projectId} is not in AUTHORIZED_FOR_BOOTSTRAP state`
      );
    }

    const resolvedTarget = resolve(targetPath);

    // Prevent bootstrap from writing into the repository root.
    //
    // WAS GATED ON `process.env.NODE_ENV === "production"`, which meant it never
    // fired: NODE_ENV appears exactly once in this entire repository -- in the
    // condition itself. No npm script sets it, no test sets it, nothing in src/
    // or tools/ reads it. A guard whose activation depends on a variable nobody
    // sets is not a weak guard, it is dead code that reads as protection, and
    // the failure mode was fail-OPEN on a containment boundary in a codebase
    // whose whole discipline is fail-closed (working rule 8).
    //
    // Unconditional now. A caller that genuinely needs to write into the
    // repository root must say so through a path that is not this one.
    if (resolvedTarget === resolve(process.cwd())) {
      throw new BootstrapExecutorError("DENY_MAIN_BRANCH_MUTATION", "Direct bootstrap mutation on repository main root is prohibited");
    }

    const proposed = pkg.proposed_changes ?? [];
    const writtenFiles = [];

    for (const change of proposed) {
      if (change.action === "create" || change.action === "modify") {
        const destFile = join(resolvedTarget, change.path);
        const destDir = dirname(destFile);
        if (!existsSync(destDir)) {
          mkdirSync(destDir, { recursive: true });
        }
        const sampleContent = `# ${change.path}\nAuto-bootstrapped under SecB proposal ${pkg.registration_id}.\nRationale: ${change.rationale}\n`;
        writeFileSync(destFile, sampleContent, "utf8");
        writtenFiles.push(change.path);
      }
    }

    // Transition status to BOOTSTRAPPED
    this.#registrationService.transitionState(projectId, "BOOTSTRAPPED", {
      reviewerSignature: pkg.identity.owners[0] || "admin@secb.local"
    });

    return {
      ok: true,
      project_id: projectId,
      status: "BOOTSTRAPPED",
      targetPath: resolvedTarget,
      filesWritten: writtenFiles.length,
      writtenFiles
    };
  }
}
