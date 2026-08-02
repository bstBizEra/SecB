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

  #evidenceLookup;
  #now;

  // decisionLookup is REQUIRED and is the trust root for publication:
  // without it, promotion would be self-attested. It MUST be bound to the
  // governed DecisionLedger and SHOULD be resolveEffective-based, so reverted
  // or expired promotion decisions deny.
  //
  // WP-SK-R2 / DEF-R2. Resolution-time re-validation is no longer deferred.
  // Previously decisionLookup was consulted ONLY here at registration, and
  // resolveSkill read a deep-frozen clone captured at that moment. Probe:
  // resolution after valid_until, and after the decision was REVERTED, both
  // returned ALLOW. With no unregister API, a grant once made could never
  // expire and never be revoked - a live violation of governance-baseline
  // section 3, which requires denial when an approval "is expired, revoked,
  // replayed, or for a different object".
  //
  // TRUSTED INSTANT. The instant is derived per call from `now` and passed to
  // the lookup as a second argument. Capturing it at construction would make
  // expiry permanently stale, which is the same defect wearing a fix's clothes.
  // Existing single-argument lookups are unaffected - JavaScript ignores the
  // extra argument - so a lookup that pins its own instant stays deterministic
  // for tests that want that.
  //
  // evidenceLookup (DEF-R3) is required WHERE IT BITES rather than at
  // construction: registering a PUBLISHED manifest without one throws. A
  // constructor-level requirement would break both production wirings, which
  // this work package is forbidden to touch, and breaking them is worse than a
  // requirement enforced at the only point it matters. Recorded as an amendment
  // to AC-R2-06 rather than silently weakened.
  constructor({ decisionLookup, evidenceLookup, now } = {}) {
    if (typeof decisionLookup !== "function") {
      throw new SkillResolverError("INVALID_RESOLVER_CONFIG", "decisionLookup function is required");
    }
    this.#decisionLookup = decisionLookup;
    this.#evidenceLookup = typeof evidenceLookup === "function" ? evidenceLookup : null;
    this.#now = typeof now === "function" ? now : () => new Date().toISOString();
  }

  // Re-resolves every claimed HUMAN_PROMOTION at the current instant. Returns
  // null when all promotions are effective, or a typed deny when any is not.
  // Any throw from the lookup denies: a lookup that cannot answer is not a
  // lookup that says yes.
  #promotionsEffective(manifest) {
    const promotions = manifest.approval_history.filter((entry) => entry.decision_type === "HUMAN_PROMOTION");
    if (promotions.length === 0) {
      return { skill: null, code: "DENY_PROMOTION_NOT_EFFECTIVE", reason: "No promotion decision is recorded" };
    }
    const at = this.#now();
    for (const promotion of promotions) {
      let decision;
      try {
        decision = resolvedDecision(this.#decisionLookup(promotion.decision_id, at));
      } catch (_err) {
        return { skill: null, code: "DENY_PROMOTION_NOT_EFFECTIVE", reason: "Promotion decision could not be resolved" };
      }
      if (!decision || decision.id !== promotion.decision_id || decision.type !== "GOVERNANCE") {
        return {
          skill: null,
          code: "DENY_PROMOTION_NOT_EFFECTIVE",
          reason: "Promotion decision is no longer effective"
        };
      }
    }
    return null;
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
        // A throwing lookup previously propagated a raw Error out of
        // registerSkill instead of a typed deny - so a ledger outage crashed
        // the caller rather than refusing the registration. Resolution already
        // wrapped this; registration did not.
        let decision;
        try {
          decision = resolvedDecision(this.#decisionLookup(promotion.decision_id, this.#now()));
        } catch (_err) {
          throw new SkillResolverError(
            "DENY_UNAPPROVED_PUBLICATION",
            `HUMAN_PROMOTION could not be resolved: ${promotion.decision_id}`
          );
        }
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
      // DEF-R3. evidence_refs was checked for length and nothing else - never
      // resolved against the EvidenceLedger. `evidence_refs: ["lol"]`
      // registered successfully. Counting references is not carrying evidence.
      if (!this.#evidenceLookup) {
        throw new SkillResolverError(
          "DENY_UNVERIFIED_EVIDENCE",
          "PUBLISHED registration requires an evidenceLookup bound to the governed EvidenceLedger"
        );
      }
      for (const ref of manifest.evidence_refs) {
        let evidence;
        try {
          evidence = this.#evidenceLookup(ref);
        } catch (_err) {
          throw new SkillResolverError("DENY_UNVERIFIED_EVIDENCE", `Evidence reference could not be resolved: ${ref}`);
        }
        if (!evidence) {
          throw new SkillResolverError("DENY_UNVERIFIED_EVIDENCE", `Evidence reference does not resolve: ${ref}`);
        }
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
    // DEF-R2: the promotion must still be effective NOW, not merely have been
    // effective when the manifest was registered. This is the check whose
    // absence made a grant permanent.
    const ineffective = this.#promotionsEffective(manifest);
    if (ineffective) return ineffective;
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
