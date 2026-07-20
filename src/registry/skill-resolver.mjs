import { validateContract } from "../contracts/contract-validator.mjs";
import { findReservedDelimiter } from "../contracts/reserved-delimiters.mjs";

// V-013 / SECB-SKILL-001 distribution rule: agents receive only skill
// versions authorized for their project, runtime, and data class, and a
// skill is consumable only in PUBLISHED state backed by a HUMAN_PROMOTION
// decision that resolves in the governed DecisionLedger — approval
// history in the manifest is caller-supplied data and is never trusted
// on its own (IMM-P014-R2-01). Everything else fails closed.

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

function resolvedDecision(value) {
  if (!value || typeof value !== "object") return null;
  return {
    id: value.entry?.entryId ?? value.decision_id ?? null,
    type: value.entry?.payload?.decision_type ?? value.decision_type ?? null
  };
}

export class SkillResolver {
  #skills = new Map();
  #decisionLookup;

  // decisionLookup is REQUIRED and is the trust root for publication:
  // without it, promotion would be self-attested. Lookup contract
  // (IMM-SKILL-V1): it MUST be bound to the governed DecisionLedger and
  // SHOULD be resolveEffective-based at a trusted instant, so reverted or
  // expired promotion decisions deny at registration. Resolution-time
  // re-validation/unpublication is folded into the open revocation
  // lifecycle V-item.
  constructor({ decisionLookup } = {}) {
    if (typeof decisionLookup !== "function") {
      throw new SkillResolverError("INVALID_RESOLVER_CONFIG", "decisionLookup function is required");
    }
    this.#decisionLookup = decisionLookup;
  }

  registerSkill(manifest) {
    validateContract("skillManifest", manifest);
    // GOV-P011-08: system-wide reserved delimiters denied in identity
    // fields ('@' is this registry's own key delimiter).
    for (const field of ["skill_id", "version"]) {
      const hit = findReservedDelimiter(manifest[field]);
      if (hit) throw new SkillResolverError("DENY_ID_CHARSET", `${field} must not contain '${hit}'`);
    }
    if (manifest.status === "PUBLISHED") {
      const promotions = manifest.approval_history.filter((entry) => entry.decision_type === "HUMAN_PROMOTION");
      if (promotions.length === 0) {
        throw new SkillResolverError("DENY_UNAPPROVED_PUBLICATION", "PUBLISHED skills must record a HUMAN_PROMOTION decision");
      }
      // Every claimed promotion must resolve in the decision ledger,
      // identity-bound and typed as a governance decision. A fabricated
      // approval entry is a forgery, not a formality gap.
      for (const promotion of promotions) {
        const decision = resolvedDecision(this.#decisionLookup(promotion.decision_id));
        if (!decision || decision.id !== promotion.decision_id || decision.type !== "GOVERNANCE") {
          throw new SkillResolverError(
            "DENY_UNAPPROVED_PUBLICATION",
            `HUMAN_PROMOTION does not resolve to a governed decision: ${promotion.decision_id}`
          );
        }
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
    // A recorded REVOCATION entry poisons the version even while its
    // status field still says PUBLISHED (no in-memory transition exists).
    if (manifest.approval_history.some((entry) => entry.decision_type === "REVOCATION")) {
      return { skill: null, code: "DENY_REVOKED", reason: "Skill version carries a revocation record" };
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
