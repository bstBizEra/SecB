import { createHash } from "node:crypto";

/**
 * SecB Project Milestone & Sprint Target Service
 * Tracks milestone release targets, sprint exit criteria, and milestone completion certificates.
 */

export class ProjectMilestoneError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ProjectMilestoneError";
    this.code = code;
  }
}

function hashString(val) {
  return createHash("sha256").update(val).digest("hex");
}

export class ProjectMilestoneService {
  #milestones = new Map();

  createMilestone({ projectId, title, targetVersion = "v0.3.0", exitCriteria = [] }) {
    if (!projectId || !title) {
      throw new ProjectMilestoneError("INVALID_MILESTONE_PARAMS", "projectId and title are required");
    }

    const milestoneId = `MILESTONE-${projectId}-${Date.now()}`;
    const timestamp = new Date().toISOString();

    const payload = {
      milestone_id: milestoneId,
      project_id: projectId,
      title,
      target_version: targetVersion,
      status: "OPEN",
      exit_criteria: exitCriteria,
      linked_work_packages: [],
      created_at: timestamp
    };

    const fingerprint = hashString(JSON.stringify(payload));
    const record = { ...payload, fingerprint };

    this.#milestones.set(milestoneId, record);
    return record;
  }

  addWorkPackageToMilestone({ milestoneId, workPackageId }) {
    const record = this.#milestones.get(milestoneId);
    if (!record) {
      throw new ProjectMilestoneError("MILESTONE_NOT_FOUND", `Milestone ${milestoneId} not found`);
    }

    if (!record.linked_work_packages.includes(workPackageId)) {
      record.linked_work_packages.push(workPackageId);
    }
    record.fingerprint = hashString(JSON.stringify(record));
    return record;
  }

  inspectMilestone(milestoneId) {
    const record = this.#milestones.get(milestoneId);
    if (!record) {
      throw new ProjectMilestoneError("MILESTONE_NOT_FOUND", `Milestone ${milestoneId} not found`);
    }
    return record;
  }

  evaluateMilestoneCompletion({ milestoneId, verifiedWpCount = 0 }) {
    const record = this.inspectMilestone(milestoneId);
    const totalLinked = record.linked_work_packages.length;

    const isComplete = totalLinked > 0 && verifiedWpCount >= totalLinked;
    if (isComplete) {
      record.status = "COMPLETED";
      record.completed_at = new Date().toISOString();
    }

    const certificate = {
      milestone_id: milestoneId,
      project_id: record.project_id,
      title: record.title,
      target_version: record.target_version,
      status: record.status,
      total_linked_work_packages: totalLinked,
      verified_work_packages: verifiedWpCount,
      completion_certified: isComplete,
      certificate_fingerprint: hashString(JSON.stringify(record))
    };

    return certificate;
  }
}
