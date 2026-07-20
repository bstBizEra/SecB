// MOD-SKILL-S1 candidate skill intake registry (gap G1).
// Pure in-process core only: no transport, port, filesystem, network,
// credential access, or process spawning. Persistence is delegated to an
// injected append-only ledger writer; every state change is written to the
// ledger BEFORE it takes effect (audit-first), and a throwing writer yields a
// structured denial with no state change. Deny-by-default: intake always
// enters as CANDIDATE regardless of the submitted status; a duplicate
// id@version is denied; reserved composite-key delimiters are denied in
// identity fields (GOV-P011-08).
//
// This registry deliberately has NO promotion or revocation surface. Skill
// PROMOTION (CANDIDATE->PUBLISHED, N-5 SoD, evidence binding) is R3+ and
// governance-gated (MOD-SKILL slice 2); revocation/resolution hardening is R3
// (slice 3). Neither is present here. The only lifecycle transition is
// producer-or-governance WITHDRAWAL, whose governance authority is sourced
// ONLY from the injected kernel config (SoD is config-only; the registry
// never self-authorizes a governance actor).

import { findReservedDelimiter } from "../contracts/reserved-delimiters.mjs";

export const GOVERNANCE_ROLE = "governance";

const isBlank = (value) => typeof value !== "string" || value.trim() === "";

function hardenedRecord(entries) {
  const output = Object.create(null);
  for (const [key, value] of entries) {
    Object.defineProperty(output, key, {
      value,
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  return Object.freeze(output);
}

const deny = (code) => hardenedRecord([
  ["ok", false],
  ["deny_code", code],
  ["message", "request denied"],
]);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function normalizeAttemptedAt(value) {
  try {
    const epochMs = Date.prototype.getTime.call(value);
    if (!Number.isFinite(epochMs)) return null;
    return new Date(epochMs).toISOString();
  } catch {
    return null;
  }
}

function authorizationValid(authorization) {
  return authorization !== null
    && typeof authorization === "object"
    && !Array.isArray(authorization)
    && !isBlank(authorization.role)
    && !isBlank(authorization.actor_id)
    && !isBlank(authorization.decided_at)
    && Number.isFinite(Date.parse(authorization.decided_at));
}

function freezeGovernanceActors(kernelConfig) {
  const actors = Array.isArray(kernelConfig?.governanceActors)
    ? kernelConfig.governanceActors.filter((actor) => !isBlank(actor))
    : [];
  return Object.freeze(new Set(actors));
}

export class SkillCandidateRegistry {
  #schemaValidator;
  #ledgerWriter;
  #now;
  #governanceActors;
  #candidates = new Map();
  #nextSequence = 1;

  constructor({ schemaValidator, ledgerWriter, now = () => new Date(), kernelConfig } = {}) {
    if (typeof schemaValidator !== "function") {
      throw new Error("SkillCandidateRegistry requires a schemaValidator function (fail-closed record validation)");
    }
    if (typeof ledgerWriter !== "function") {
      throw new Error("SkillCandidateRegistry requires an append-only ledgerWriter function (fail-closed audit)");
    }
    if (typeof now !== "function") throw new Error("now must be a function");
    this.#schemaValidator = schemaValidator;
    this.#ledgerWriter = ledgerWriter;
    this.#now = now;
    // SoD source of truth is the injected kernel config ONLY. Absent config
    // means no governance actor exists, so governance-path withdrawal is
    // impossible until an operator wires one in.
    this.#governanceActors = freezeGovernanceActors(kernelConfig);
  }

  // Writes the audit entry for the attempted action BEFORE any effect. A
  // throwing writer denies the action entirely (audit-first, fail-closed).
  #audit(event, disposition, fields) {
    try {
      this.#ledgerWriter(hardenedRecord([
        ["sequence", this.#nextSequence++],
        ["attempted_at", fields.attempted_at ?? null],
        ["component", "skill-candidate-registry"],
        ["event", event],
        ["disposition", disposition],
        ["skill_candidate_id", fields.skill_candidate_id ?? null],
        ["version", fields.version ?? null],
        ["producer", fields.producer ?? null],
        ["actor", fields.actor ?? null],
        ["reason", fields.reason ?? null],
      ]));
      return true;
    } catch {
      return false;
    }
  }

  #denyAudited(event, code, fields) {
    if (!this.#audit(event, code, fields)) return deny("DENY_AUDIT_UNAVAILABLE");
    return deny(code);
  }

  #attemptedAt() {
    try {
      return normalizeAttemptedAt(this.#now());
    } catch {
      return null;
    }
  }

  #versions(skillCandidateId) {
    return this.#candidates.get(skillCandidateId);
  }

  registerCandidate(record) {
    const attemptedAt = this.#attemptedAt();
    const fields = {
      attempted_at: attemptedAt,
      skill_candidate_id: isBlank(record?.skill_candidate_id) ? null : record.skill_candidate_id,
      version: isBlank(record?.version) ? null : record.version,
    };
    if (attemptedAt === null) {
      return this.#denyAudited("REGISTER_CANDIDATE", "DENY_CLOCK_UNAVAILABLE", fields);
    }

    let validation;
    try {
      validation = this.#schemaValidator(record);
    } catch {
      return this.#denyAudited("REGISTER_CANDIDATE", "DENY_RECORD_INVALID", fields);
    }
    if (validation !== true && validation?.valid !== true) {
      return this.#denyAudited("REGISTER_CANDIDATE", "DENY_RECORD_INVALID", fields);
    }
    // Defense-in-depth beyond the schema: a record cannot enter intake already
    // claiming to be withdrawn, and the maintainer (producer identity) must be
    // present because it is the anchor for producer-path withdrawal.
    if (record?.withdrawal?.withdrawn !== false || isBlank(record?.source_identity?.maintainer)) {
      return this.#denyAudited("REGISTER_CANDIDATE", "DENY_RECORD_INVALID", fields);
    }

    // GOV-P011-08: system-wide reserved composite-key delimiters denied in
    // identity fields ('@' is this registry's own key delimiter).
    for (const field of ["skill_candidate_id", "version"]) {
      if (findReservedDelimiter(record[field])) {
        return this.#denyAudited("REGISTER_CANDIDATE", "DENY_ID_CHARSET", fields);
      }
    }

    const versions = this.#versions(record.skill_candidate_id);
    if (versions?.has(record.version)) {
      return this.#denyAudited("REGISTER_CANDIDATE", "DENY_DUPLICATE_CANDIDATE_VERSION", fields);
    }

    // Intake always enters as CANDIDATE regardless of the submitted status.
    // There is no promotion surface here (that is a separate governed action).
    const stored = deepFreeze({ ...structuredClone(record), status: "CANDIDATE" });
    if (!this.#audit("REGISTER_CANDIDATE", "ALLOW", {
      ...fields,
      producer: stored.source_identity.maintainer,
    })) {
      return deny("DENY_AUDIT_UNAVAILABLE");
    }
    const target = versions ?? new Map();
    target.set(stored.version, { stored, status: "CANDIDATE" });
    this.#candidates.set(stored.skill_candidate_id, target);
    return hardenedRecord([
      ["ok", true],
      ["skill_candidate_id", stored.skill_candidate_id],
      ["version", stored.version],
      ["status", "CANDIDATE"],
    ]);
  }

  // Producer-or-governance withdrawal. Allowed if the authorizing actor is the
  // record's own producer (self-withdrawal of a submission) OR a governance
  // actor declared in the injected kernel config. Governance identity is NEVER
  // self-asserted: the role claim alone is insufficient, the actor must also be
  // config-listed. There is no revocation of PROMOTED skills here (that is R3).
  withdrawCandidate(skillCandidateId, version, reason, authorization) {
    const attemptedAt = this.#attemptedAt();
    const fields = {
      attempted_at: attemptedAt,
      skill_candidate_id: isBlank(skillCandidateId) ? null : skillCandidateId,
      version: isBlank(version) ? null : version,
      reason: isBlank(reason) ? null : reason,
      actor: authorizationValid(authorization) ? `${authorization.role}:${authorization.actor_id}` : null,
    };
    if (attemptedAt === null) return this.#denyAudited("WITHDRAW_CANDIDATE", "DENY_CLOCK_UNAVAILABLE", fields);
    if (isBlank(reason)) return this.#denyAudited("WITHDRAW_CANDIDATE", "DENY_WITHDRAWAL_INVALID", fields);
    if (!authorizationValid(authorization)) {
      return this.#denyAudited("WITHDRAW_CANDIDATE", "DENY_AUTHORIZATION", fields);
    }

    const entry = this.#versions(skillCandidateId)?.get(version);
    if (!entry) return this.#denyAudited("WITHDRAW_CANDIDATE", "DENY_UNKNOWN_CANDIDATE", fields);
    if (entry.status === "WITHDRAWN") {
      return this.#denyAudited("WITHDRAW_CANDIDATE", "DENY_ALREADY_WITHDRAWN", fields);
    }

    const producer = entry.stored.source_identity.maintainer;
    const isProducer = authorization.actor_id === producer;
    const isGovernance = authorization.role === GOVERNANCE_ROLE
      && this.#governanceActors.has(authorization.actor_id);
    if (!isProducer && !isGovernance) {
      return this.#denyAudited("WITHDRAW_CANDIDATE", "DENY_NOT_AUTHORIZED", { ...fields, producer });
    }

    if (!this.#audit("WITHDRAW_CANDIDATE", "ALLOW", { ...fields, producer })) {
      return deny("DENY_AUDIT_UNAVAILABLE");
    }
    entry.status = "WITHDRAWN";
    entry.stored = deepFreeze({
      ...structuredClone(entry.stored),
      status: "WITHDRAWN",
      withdrawal: { withdrawn: true, reason },
    });
    return hardenedRecord([
      ["ok", true],
      ["skill_candidate_id", skillCandidateId],
      ["version", version],
      ["status", "WITHDRAWN"],
    ]);
  }

  // Read path: candidates are returned as deeply-frozen, data-untrusted copies.
  // A returned record confers no authority and is never a promotion signal.
  // Reads do not mutate state and are not ledgered.
  getCandidate(skillCandidateId, version) {
    const entry = this.#versions(skillCandidateId)?.get(version);
    if (!entry) return deny("DENY_UNKNOWN_CANDIDATE");
    return hardenedRecord([
      ["ok", true],
      ["record", deepFreeze(structuredClone(entry.stored))],
      ["data_untrusted", true],
    ]);
  }

  listCandidates() {
    const candidates = [];
    for (const versions of this.#candidates.values()) {
      for (const entry of versions.values()) {
        candidates.push(hardenedRecord([
          ["skill_candidate_id", entry.stored.skill_candidate_id],
          ["version", entry.stored.version],
          ["status", entry.status],
        ]));
      }
    }
    return hardenedRecord([
      ["ok", true],
      ["candidates", Object.freeze(candidates)],
      ["data_untrusted", true],
    ]);
  }
}
