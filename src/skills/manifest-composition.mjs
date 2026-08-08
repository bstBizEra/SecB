/**
 * descriptor ⊕ grant → skillManifest.
 *
 * PURE AND UNWIRED. No filesystem, no git, no ledger, no callers. Composing a
 * manifest is not the same act as registering one, and this module deliberately
 * cannot do the second. `SECB-ASSURANCE-SKILLSHUB-WIRING-001` refuses the
 * wiring and that refusal stands: `DEF-R5` means a governance decision cannot
 * currently record a refusal, and this branch has no separation-of-duties
 * mechanism. Both sit ahead of anything that would call this.
 *
 * WHY THIS SHAPE
 *
 * `skillManifest` requires 13 fields. Measured against the two governed
 * contracts that already exist:
 *
 *   grant       skill_id, version, status, supported_runtimes, project_scopes,
 *               max_data_classification, evidence_refs, approval_history,
 *               revocation_conditions
 *   descriptor  name (from display_name), purpose
 *   NEITHER     owner, source
 *
 * The trust-tier split under ADR-0013 already cut `skillManifest` along the line
 * a promotion needs. This module is that cut read in the other direction.
 *
 * THE TWO UNACCOUNTED FIELDS ARE HANDLED DIFFERENTLY ON PURPOSE
 *
 *   owner   a governance assignment. Not derivable from anything, and NOT
 *           defaulted — a default owner is an unowned skill wearing a name.
 *   source  bound to the bytes being promoted. Supplied by the caller, which
 *           must derive it from the commit actually being promoted rather than
 *           from whatever is checked out.
 *
 * Both are required arguments. A composition missing either is refused, not
 * completed with a guess.
 */

/** Fields a package author may never supply. Mirrors package-descriptor-mapper. */
export const GRANT_ONLY_FIELDS = Object.freeze([
  "project_scopes",
  "supported_runtimes",
  "max_data_classification",
  "status",
  "evidence_refs",
  "approval_history",
  "revocation_conditions"
]);

const GRANT_REQUIRED = Object.freeze([
  "skill_id", "version", "status", "project_scopes", "supported_runtimes",
  "max_data_classification", "evidence_refs", "approval_history", "revocation_conditions"
]);

const SOURCE_REQUIRED = Object.freeze(["repository", "commit_sha", "licence"]);

export class CompositionError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = "CompositionError";
    this.code = code;
    this.detail = detail;
  }
}

const missing = (obj, keys) => keys.filter((k) => obj?.[k] === undefined || obj?.[k] === null);

/**
 * Compose a skill manifest from an author descriptor and a governance grant.
 *
 * Refuses rather than repairs. Every denial is typed, because a caller that
 * cannot tell "the author overreached" from "the grant is incomplete" cannot
 * act on either.
 *
 * @param {object} args
 * @param {object} args.descriptor  a skill-package-descriptor
 * @param {object} args.grant       a skill-grant-record
 * @param {object} args.source      { repository, commit_sha, licence } — bound to the promoted bytes
 * @param {string} args.owner       a governance assignment
 * @returns {object} a candidate skillManifest. NOT validated here; the caller
 *   validates against the contract, because this module must not become a
 *   second, weaker copy of the schema.
 */
export function composeManifest({ descriptor, grant, source, owner } = {}) {
  if (!descriptor || typeof descriptor !== "object") {
    throw new CompositionError("DENY_NO_DESCRIPTOR", "A descriptor is required");
  }
  if (!grant || typeof grant !== "object") {
    throw new CompositionError("DENY_NO_GRANT", "A grant is required");
  }

  // The author must not have supplied anything the grant decides. The mapper
  // drops these silently on the way in; composing is the last place the
  // overreach is still visible, so it is refused here rather than dropped.
  const overreach = GRANT_ONLY_FIELDS.filter((f) => descriptor[f] !== undefined);
  if (overreach.length) {
    throw new CompositionError(
      "DENY_AUTHOR_SUPPLIED_GRANT",
      `Descriptor supplies grant-only field(s): ${overreach.join(", ")}`,
      { fields: overreach }
    );
  }

  const gaps = missing(grant, GRANT_REQUIRED);
  if (gaps.length) {
    throw new CompositionError("DENY_INCOMPLETE_GRANT", `Grant is missing: ${gaps.join(", ")}`, { fields: gaps });
  }

  // Identity must agree. A grant for one skill composed onto another author's
  // descriptor is the DEF-R1 defect arriving by a different route.
  if (descriptor.skill_id !== grant.skill_id) {
    throw new CompositionError(
      "DENY_IDENTITY_MISMATCH",
      `Descriptor names ${descriptor.skill_id}; grant names ${grant.skill_id}`,
      { descriptor: descriptor.skill_id, grant: grant.skill_id }
    );
  }
  if (descriptor.version !== grant.version) {
    throw new CompositionError(
      "DENY_VERSION_MISMATCH",
      `Descriptor is ${descriptor.version}; grant is ${grant.version}`,
      { descriptor: descriptor.version, grant: grant.version }
    );
  }

  if (typeof owner !== "string" || owner.trim() === "") {
    throw new CompositionError(
      "DENY_NO_OWNER",
      "owner is a governance assignment and has no default; a default owner is an unowned skill wearing a name"
    );
  }

  const sourceGaps = missing(source, SOURCE_REQUIRED);
  if (!source || sourceGaps.length) {
    throw new CompositionError(
      "DENY_NO_SOURCE",
      `source must bind the promoted bytes; missing: ${(sourceGaps.length ? sourceGaps : SOURCE_REQUIRED).join(", ")}`,
      { fields: sourceGaps.length ? sourceGaps : [...SOURCE_REQUIRED] }
    );
  }

  const name = descriptor.display_name ?? descriptor.package_name;
  if (typeof name !== "string" || name.trim() === "") {
    throw new CompositionError("DENY_NO_NAME", "Descriptor supplies neither display_name nor package_name");
  }
  if (typeof descriptor.purpose !== "string" || descriptor.purpose.trim() === "") {
    throw new CompositionError("DENY_NO_PURPOSE", "Descriptor supplies no purpose");
  }

  return {
    // from the grant
    skill_id: grant.skill_id,
    version: grant.version,
    status: grant.status,
    supported_runtimes: [...grant.supported_runtimes],
    project_scopes: [...grant.project_scopes],
    max_data_classification: grant.max_data_classification,
    evidence_refs: [...grant.evidence_refs],
    approval_history: grant.approval_history.map((e) => ({ ...e })),
    revocation_conditions: [...grant.revocation_conditions],
    // from the descriptor
    name,
    purpose: descriptor.purpose,
    // from neither
    owner,
    source: {
      repository: source.repository,
      commit_sha: source.commit_sha,
      licence: source.licence
    }
  };
}
