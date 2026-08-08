import { ProjectRegistrationError } from "../project/project-registration-service.mjs";

export class BootstrapAuthorizationGate {
  #registrationService;

  constructor({ registrationService }) {
    if (!registrationService) {
      throw new Error("BootstrapAuthorizationGate requires registrationService");
    }
    this.#registrationService = registrationService;
  }

  authorizeBootstrap({ projectId, authorizationRecord, reviewerSignature }) {
    if (!projectId) {
      throw new ProjectRegistrationError("DENY_INVALID_PROJECT_ID", "projectId is required");
    }
    if (!authorizationRecord || !reviewerSignature) {
      throw new ProjectRegistrationError(
        "DENY_UNAUTHORIZED_MUTATION",
        "Repository bootstrap authorization fails closed: signed authorization record is required"
      );
    }

    const payload = {
      ...authorizationRecord,
      reviewerSignature,
      authorizedAt: new Date().toISOString()
    };

    return this.#registrationService.transitionState(projectId, "AUTHORIZED_FOR_BOOTSTRAP", payload);
  }
}
