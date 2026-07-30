/**
 * SecB Module Recommender Engine
 * 
 * Standardizes advisory next-step recommendations across SecB modules per the
 * Advise-and-Proceed Decision Rule (SECB-AGENTS-AMD-002). Generates advisory
 * handoffs with decision rationale, risk class (R0-R4), and human GOV requirements.
 */

export class ModuleRecommenderError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ModuleRecommenderError";
    this.code = code;
  }
}

export class SecBModuleRecommender {
  recommendNextAction({ module, currentStatus, context = {} }) {
    if (!module || typeof module !== "string") {
      throw new ModuleRecommenderError("INVALID_MODULE", "module parameter is required");
    }

    const status = currentStatus ? currentStatus.toUpperCase() : "DRAFT";

    switch (module.toLowerCase()) {
      case "project_registration":
        return this.#recommendProjectRegistration(status, context);
      case "work_package":
        return this.#recommendWorkPackage(status, context);
      case "swarm_delegation":
        return this.#recommendSwarmDelegation(status, context);
      case "skills_hub":
        return this.#recommendSkillsHub(status, context);
      default:
        throw new ModuleRecommenderError("UNKNOWN_MODULE", `Unrecognized module: ${module}`);
    }
  }

  #recommendProjectRegistration(status, context) {
    if (status === "REGISTERED_PROPOSAL_ONLY") {
      return {
        module: "project_registration",
        current_status: status,
        recommended_option: "Submit Bootstrap Decision Request to Human GOV",
        rationale: "Project registration package is staged in proposal-only mode. Human GOV approval is required before bootstrap execution.",
        risk_class: "R3",
        requires_human_gov: true,
        next_action: "authorize_bootstrap",
        alternatives: ["Inspect proposed change manifest", "Revoke staged draft"]
      };
    }
    if (status === "AUTHORIZED_FOR_BOOTSTRAP") {
      return {
        module: "project_registration",
        current_status: status,
        recommended_option: "Execute Sandboxed Bootstrap to Target Worktree",
        rationale: "Human GOV authorization is verified. Execute bootstrap executor onto non-main target path.",
        risk_class: "R2",
        requires_human_gov: false,
        next_action: "execute_bootstrap",
        alternatives: ["Re-verify signed decision record"]
      };
    }
    return {
      module: "project_registration",
      current_status: status,
      recommended_option: "Register Proposal-Only Draft",
      rationale: "Conduct read-only repository analysis and stage registration package.",
      risk_class: "R1",
      requires_human_gov: false,
      next_action: "register_draft",
      alternatives: []
    };
  }

  #recommendWorkPackage(status, context) {
    if (status === "DRAFT") {
      return {
        module: "work_package",
        current_status: status,
        recommended_option: "Submit Work Package for Independent Review",
        rationale: "Work package contract is drafted. Submit for reviewer assignment and obligation verification.",
        risk_class: "R1",
        requires_human_gov: false,
        next_action: "submit_review",
        alternatives: ["Update evidence obligations"]
      };
    }
    if (status === "VERIFICATION_PENDING") {
      return {
        module: "work_package",
        current_status: status,
        recommended_option: "Submit Sealed QA Evidence Envelope",
        rationale: "Execution completed. QA verifier must submit evidence envelope and request GOV acceptance.",
        risk_class: "R2",
        requires_human_gov: false,
        next_action: "seal_evidence",
        alternatives: ["Request rework cycle"]
      };
    }
    return {
      module: "work_package",
      current_status: status,
      recommended_option: "Proceed with Governed Execution Stage",
      rationale: "Advance work package through universal lifecycle.",
      risk_class: "R1",
      requires_human_gov: false,
      next_action: "advance_stage",
      alternatives: []
    };
  }

  #recommendSwarmDelegation(status, context) {
    return {
      module: "swarm_delegation",
      current_status: status,
      recommended_option: "Mint Consumable R2 Handoff Receipt",
      rationale: "Delegate task to subagent while enforcing Maker-Checker SoD boundaries.",
      risk_class: "R1",
      requires_human_gov: false,
      next_action: "mint_r2_handoff",
      alternatives: ["Verify delegation chain integrity"]
    };
  }

  #recommendSkillsHub(status, context) {
    return {
      module: "skills_hub",
      current_status: status,
      recommended_option: "Perform Classification Ceiling Filtered Search",
      rationale: "Search local skills hub under active caller data classification ceiling.",
      risk_class: "R0",
      requires_human_gov: false,
      next_action: "search_skills",
      alternatives: ["Inspect skill content"]
    };
  }
}
