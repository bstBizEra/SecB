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

    // Prevent direct mutation of repository root main branch directly if specified as root
    if (resolvedTarget === resolve(process.cwd()) && process.env.NODE_ENV === "production") {
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
