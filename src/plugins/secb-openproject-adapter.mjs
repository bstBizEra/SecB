/**
 * SecB OpenProject Plugin Adapter
 * Maps SecB work packages and project contracts to OpenProject Work Packages and statuses.
 */

export class OpenProjectAdapterError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "OpenProjectAdapterError";
    this.code = code;
  }
}

const STATUS_MAP = Object.freeze({
  DRAFT: "New",
  SUBMITTED: "In Progress",
  ACTIVE: "In Progress",
  VERIFICATION_PENDING: "Resolved",
  ACCEPTED: "Closed",
  REWORK: "New"
});

const SUPPORTED_TYPES = Object.freeze(["Task", "Feature", "Bug", "Phase", "Milestone"]);

export class SecBOpenProjectAdapter {
  #endpoint;
  #projectId;

  constructor({ openprojectEndpoint = "http://localhost:8080", projectId = "SECB" } = {}) {
    this.#endpoint = openprojectEndpoint;
    this.#projectId = projectId;
  }

  mapWorkPackageToOpenProject({ workPackageId, status, type = "Task" }) {
    if (!workPackageId || !status) {
      throw new OpenProjectAdapterError("INVALID_WP_PARAMS", "workPackageId and status are required");
    }

    const upperStatus = status.toUpperCase();
    const mappedStatus = STATUS_MAP[upperStatus];
    if (!mappedStatus) {
      throw new OpenProjectAdapterError("UNKNOWN_STATUS", `Unrecognized SecB work package status: ${status}`);
    }

    const isValidType = SUPPORTED_TYPES.includes(type);
    const finalType = isValidType ? type : "Task";

    return {
      secb_wp_id: workPackageId,
      secb_status: upperStatus,
      openproject_wp_id: `OP-WP-${workPackageId}`,
      openproject_status: mappedStatus,
      openproject_type: finalType,
      target_project: this.#projectId,
      synced_at: new Date().toISOString()
    };
  }

  inspectPlugin() {
    return {
      plugin_name: "SecBOpenProjectAdapter",
      status: "ACTIVE",
      openproject_endpoint: this.#endpoint,
      project_id: this.#projectId,
      supported_types: SUPPORTED_TYPES,
      status_mappings: STATUS_MAP
    };
  }
}
