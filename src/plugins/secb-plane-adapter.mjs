/**
 * SecB Plane Plugin Adapter
 * 
 * Provides a governed, read-only plugin adapter interfacing SecB work package state,
 * milestone goals, and project registration contracts with external Plane work-management projects.
 */

export class PlaneAdapterError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PlaneAdapterError";
    this.code = code;
  }
}

const STATE_MAPPINGS = Object.freeze({
  DRAFT: "Backlog",
  SUBMITTED: "In Review",
  IN_REVIEW: "In Review",
  APPROVED_NOT_EFFECTIVE: "Planned",
  ACTIVE: "In Progress",
  EXECUTION_IN_PROGRESS: "In Progress",
  VERIFICATION_PENDING: "In Verification",
  ACCEPTED: "Done",
  REWORK: "Rework Required",
  CANCELLED: "Cancelled",
  REVOKED: "Cancelled"
});

export class SecBPlaneAdapter {
  #planeEndpoint;
  #projectId;

  constructor({ planeEndpoint = "https://plane.secb.local/api/v1", projectId = "SECB" } = {}) {
    this.#planeEndpoint = planeEndpoint;
    this.#projectId = projectId;
  }

  get planeEndpoint() {
    return this.#planeEndpoint;
  }

  get projectId() {
    return this.#projectId;
  }

  mapWorkPackageToPlaneIssue(workPackage) {
    if (!workPackage || !workPackage.work_package_id) {
      throw new PlaneAdapterError("INVALID_WORK_PACKAGE", "Work package object with work_package_id is required");
    }

    const planeState = STATE_MAPPINGS[workPackage.status] ?? "Backlog";

    return {
      secb_type: "work_package_projection",
      work_package_id: workPackage.work_package_id,
      title: workPackage.title || `Work Package ${workPackage.work_package_id}`,
      plane_project_id: this.#projectId,
      plane_state: planeState,
      risk_class: workPackage.risk_class || "R1",
      sync_mode: "read_only_projection"
    };
  }

  inspectPlugin() {
    return {
      plugin_name: "secb-plane-adapter",
      type: "plugin",
      plane_endpoint: this.#planeEndpoint,
      secb_project_id: this.#projectId,
      governance: "GOV-MCP-01..09",
      supported_state_mappings: { ...STATE_MAPPINGS }
    };
  }
}
