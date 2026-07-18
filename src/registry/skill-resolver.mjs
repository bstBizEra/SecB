import { validateContract } from "../contracts/contract-validator.mjs";

// V-013 / SECB-SKILL-001 distribution rule: agents receive only skill
// versions authorized for their project, runtime, and data class, and a
// skill is consumable only in PUBLISHED state backed by a recorded
// HUMAN_PROMOTION decision. Everything else fails closed.

const DATA_CLASS_ORDER = Object.freeze(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"]);

export class SkillResolverError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SkillResolverError";
    this.code = code;
  }
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function isBlank(value) {
  return typeof value !== "string" || value.trim() === "";
}

export class SkillResolver {
  #skills = new Map();

  // Registration accepts any lifecycle state (the hub tracks candidates
  // too), but a PUBLISHED manifest must already carry its human promotion
  // decision and at least one evidence reference — publication without
  // them is refused rather than resolved-around later.
  registerSkill(manifest) {
    validateContract("skillManifest", manifest);
    if (manifest.status === "PUBLISHED") {
      const promoted = manifest.approval_history.some((entry) => entry.decision_type === "HUMAN_PROMOTION");
      if (!promoted) {
        throw new SkillResolverError("DENY_UNAPPROVED_PUBLICATION", "PUBLISHED skills must record a HUMAN_PROMOTION decision");
      }
      if (manifest.evidence_refs.length === 0) {
        throw new SkillResolverError("DENY_UNAPPROVED_PUBLICATION", "PUBLISHED skills must carry evidence references");
      }
    }
    const key = `${manifest.skill_id}@${manifest.version}`;
    if (this.#skills.has(key)) {
      throw new SkillResolverError("DENY_DUPLICATE_SKILL", `Skill version already registered: ${key}`);
    }
    this.#skills.set(key, deepFreeze(structuredClone(manifest)));
    return { skillId: manifest.skill_id, version: manifest.version, status: manifest.status };
  }

  // Fail-closed resolution for invocation. Any missing or mismatched
  // fact resolves to NONE with a typed reason — never a fallback skill.
  resolveSkill(skillId, version, { projectId, runtime, dataClassification } = {}) {
    if (isBlank(projectId) || isBlank(runtime) || isBlank(dataClassification)) {
      return { skill: null, code: "DENY_UNBOUND_CONTEXT", reason: "projectId, runtime, and dataClassification must be asserted" };
    }
    if (!DATA_CLASS_ORDER.includes(dataClassification)) {
      return { skill: null, code: "DENY_DATA_CLASSIFICATION", reason: `Unknown data classification: ${dataClassification}` };
    }
    const manifest = this.#skills.get(`${skillId}@${version}`);
    if (!manifest) {
      return { skill: null, code: "DENY_UNKNOWN_SKILL", reason: `Unknown skill version: ${skillId}@${version}` };
    }
    if (manifest.status !== "PUBLISHED") {
      return { skill: null, code: "DENY_NOT_PUBLISHED", reason: `Skill is ${manifest.status}, not PUBLISHED` };
    }
    if (!manifest.project_scopes.includes(projectId)) {
      return { skill: null, code: "DENY_PROJECT_SCOPE", reason: "Skill is not scoped to this project" };
    }
    if (!manifest.supported_runtimes.includes(runtime)) {
      return { skill: null, code: "DENY_RUNTIME", reason: "Skill does not support this runtime" };
    }
    if (DATA_CLASS_ORDER.indexOf(dataClassification) > DATA_CLASS_ORDER.indexOf(manifest.max_data_classification)) {
      return { skill: null, code: "DENY_DATA_CLASSIFICATION", reason: "Requested data class exceeds the skill's ceiling" };
    }
    return deepFreeze({ skill: structuredClone(manifest), code: "ALLOW" });
  }
}
