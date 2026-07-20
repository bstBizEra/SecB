// SECB-MCP-P0-001 candidate private capability registry service (rules N-3, N-5).
// Pure in-process core only: no transport, port, filesystem, network, credential
// access, or process spawning. Persistence is delegated to an injected
// append-only ledger writer; every state change is written to the ledger BEFORE
// it takes effect (audit-first), and a throwing writer yields a structured
// denial with no state change. Deny-by-default: resolve() only ever returns
// PROMOTED records, promotion requires the N-5 gate approvals (independent
// review plus governance, where the independent reviewer, the governance
// approver, and the record producer are three pairwise-distinct actors), and
// revocation is always available under governance approval. Runtime activation
// remains a separate operator-authorized step.

export const INDEPENDENT_REVIEW_ROLE = "independent_review";
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

function approvalValid(approval) {
  return approval !== null
    && typeof approval === "object"
    && !Array.isArray(approval)
    && !isBlank(approval.role)
    && !isBlank(approval.actor_id)
    && !isBlank(approval.decided_at)
    && Number.isFinite(Date.parse(approval.decided_at));
}

export class CapabilityRegistryService {
  #schemaValidator;
  #ledgerWriter;
  #now;
  #capabilities = new Map();
  #nextSequence = 1;

  constructor({ schemaValidator, ledgerWriter, now = () => new Date() } = {}) {
    if (typeof schemaValidator !== "function") {
      throw new Error("CapabilityRegistryService requires a schemaValidator function (fail-closed record validation)");
    }
    if (typeof ledgerWriter !== "function") {
      throw new Error("CapabilityRegistryService requires an append-only ledgerWriter function (fail-closed audit)");
    }
    if (typeof now !== "function") throw new Error("now must be a function");
    this.#schemaValidator = schemaValidator;
    this.#ledgerWriter = ledgerWriter;
    this.#now = now;
  }

  // Writes the audit entry for the attempted action BEFORE any effect. A
  // throwing writer denies the action entirely (audit-first, fail-closed).
  #audit(event, disposition, fields) {
    try {
      this.#ledgerWriter(hardenedRecord([
        ["sequence", this.#nextSequence++],
        ["attempted_at", fields.attempted_at ?? null],
        ["component", "capability-registry"],
        ["event", event],
        ["disposition", disposition],
        ["capability_id", fields.capability_id ?? null],
        ["version", fields.version ?? null],
        ["adapter_id", fields.adapter_id ?? null],
        ["access", fields.access ?? null],
        ["producer", fields.producer ?? null],
        ["actors", Object.freeze(fields.actors ?? [])],
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

  #versions(capabilityId) {
    return this.#capabilities.get(capabilityId);
  }

  registerCandidate(record) {
    const attemptedAt = this.#attemptedAt();
    const fields = {
      attempted_at: attemptedAt,
      capability_id: isBlank(record?.capability_id) ? null : record.capability_id,
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
    if (record?.revocation?.revoked !== false || isBlank(record?.source_identity?.maintainer)) {
      return this.#denyAudited("REGISTER_CANDIDATE", "DENY_RECORD_INVALID", fields);
    }

    const versions = this.#versions(record.capability_id);
    if (versions?.has(record.version)) {
      return this.#denyAudited("REGISTER_CANDIDATE", "DENY_DUPLICATE_CAPABILITY_VERSION", fields);
    }

    // Intake always enters as CANDIDATE regardless of the submitted status;
    // promotion is a separate gated action (N-5).
    const stored = deepFreeze({ ...structuredClone(record), status: "CANDIDATE" });
    if (!this.#audit("REGISTER_CANDIDATE", "ALLOW", {
      ...fields,
      adapter_id: stored.adapter_id,
      access: stored.access,
      producer: stored.source_identity.maintainer,
    })) {
      return deny("DENY_AUDIT_UNAVAILABLE");
    }
    const target = versions ?? new Map();
    target.set(stored.version, { stored, status: "CANDIDATE" });
    this.#capabilities.set(stored.capability_id, target);
    return hardenedRecord([
      ["ok", true],
      ["capability_id", stored.capability_id],
      ["version", stored.version],
      ["status", "CANDIDATE"],
    ]);
  }

  promote(capabilityId, version, approvals) {
    const attemptedAt = this.#attemptedAt();
    const fields = {
      attempted_at: attemptedAt,
      capability_id: isBlank(capabilityId) ? null : capabilityId,
      version: isBlank(version) ? null : version,
      actors: Array.isArray(approvals)
        ? approvals.filter(approvalValid).map((approval) => `${approval.role}:${approval.actor_id}`)
        : [],
    };
    if (attemptedAt === null) return this.#denyAudited("PROMOTE", "DENY_CLOCK_UNAVAILABLE", fields);

    const versions = this.#versions(capabilityId);
    const entry = versions?.get(version);
    if (!entry) return this.#denyAudited("PROMOTE", "DENY_UNKNOWN_CAPABILITY", fields);
    if (entry.status === "REVOKED") return this.#denyAudited("PROMOTE", "DENY_REVOKED", fields);
    for (const other of versions.values()) {
      if (other.status === "PROMOTED") {
        return this.#denyAudited("PROMOTE", "DENY_ALREADY_PROMOTED", fields);
      }
    }
    if (entry.status !== "CANDIDATE") return this.#denyAudited("PROMOTE", "DENY_NOT_CANDIDATE", fields);

    if (!Array.isArray(approvals) || approvals.length === 0 || !approvals.every(approvalValid)) {
      return this.#denyAudited("PROMOTE", "DENY_APPROVALS", fields);
    }
    const independent = approvals.find((approval) => approval.role === INDEPENDENT_REVIEW_ROLE);
    const governance = approvals.find((approval) => approval.role === GOVERNANCE_ROLE);
    if (!independent || !governance) {
      return this.#denyAudited("PROMOTE", "DENY_APPROVALS", fields);
    }
    const producer = entry.stored.source_identity.maintainer;
    if (independent.actor_id === producer) {
      return this.#denyAudited("PROMOTE", "DENY_SELF_APPROVAL", { ...fields, producer });
    }
    // N-5 separation of duties: the two approval authorities and the record
    // producer must be three pairwise-distinct actors. Producer-as-independent
    // is caught above as DENY_SELF_APPROVAL; the remaining collapses (one
    // non-producer actor holding BOTH approvals, or the producer holding the
    // governance role) are denied here (A-FIND-1 / FU-1).
    if (independent.actor_id === governance.actor_id || governance.actor_id === producer) {
      return this.#denyAudited("PROMOTE", "DENY_SOD_VIOLATION", { ...fields, producer });
    }

    if (!this.#audit("PROMOTE", "ALLOW", {
      ...fields,
      adapter_id: entry.stored.adapter_id,
      access: entry.stored.access,
      producer,
    })) {
      return deny("DENY_AUDIT_UNAVAILABLE");
    }
    entry.status = "PROMOTED";
    entry.stored = deepFreeze({
      ...structuredClone(entry.stored),
      status: "PROMOTED",
      approvals: [...structuredClone(entry.stored.approvals), ...structuredClone(approvals)],
    });
    return hardenedRecord([
      ["ok", true],
      ["capability_id", capabilityId],
      ["version", version],
      ["status", "PROMOTED"],
    ]);
  }

  revoke(capabilityId, reason, approvals) {
    const attemptedAt = this.#attemptedAt();
    const fields = {
      attempted_at: attemptedAt,
      capability_id: isBlank(capabilityId) ? null : capabilityId,
      reason: isBlank(reason) ? null : reason,
      actors: Array.isArray(approvals)
        ? approvals.filter(approvalValid).map((approval) => `${approval.role}:${approval.actor_id}`)
        : [],
    };
    if (attemptedAt === null) return this.#denyAudited("REVOKE", "DENY_CLOCK_UNAVAILABLE", fields);
    if (isBlank(reason)) return this.#denyAudited("REVOKE", "DENY_REVOCATION_INVALID", fields);
    if (
      !Array.isArray(approvals)
      || !approvals.some((approval) => approvalValid(approval) && approval.role === GOVERNANCE_ROLE)
    ) {
      return this.#denyAudited("REVOKE", "DENY_APPROVALS", fields);
    }
    const versions = this.#versions(capabilityId);
    if (!versions) return this.#denyAudited("REVOKE", "DENY_UNKNOWN_CAPABILITY", fields);

    if (!this.#audit("REVOKE", "ALLOW", fields)) return deny("DENY_AUDIT_UNAVAILABLE");
    const knownBadVersions = [...versions.keys()];
    for (const entry of versions.values()) {
      entry.status = "REVOKED";
      entry.stored = deepFreeze({
        ...structuredClone(entry.stored),
        status: "REVOKED",
        revocation: {
          revoked: true,
          reason,
          known_bad_versions: knownBadVersions,
        },
      });
    }
    return hardenedRecord([
      ["ok", true],
      ["capability_id", capabilityId],
      ["status", "REVOKED"],
      ["known_bad_versions", Object.freeze(knownBadVersions)],
    ]);
  }

  // Read path: only PROMOTED records are ever visible to consumers. Reads do
  // not mutate state and are not ledgered.
  resolve(capabilityId) {
    const versions = this.#versions(capabilityId);
    if (!versions) return deny("DENY_UNKNOWN_CAPABILITY");
    let sawRevoked = false;
    for (const entry of versions.values()) {
      if (entry.status === "PROMOTED") {
        return hardenedRecord([
          ["ok", true],
          ["record", entry.stored],
        ]);
      }
      if (entry.status === "REVOKED") sawRevoked = true;
    }
    return deny(sawRevoked ? "DENY_REVOKED" : "DENY_CAPABILITY_NOT_PROMOTED");
  }

  // Adapter for McpGatewayCore: feed its capabilityRegistry Map exclusively
  // from PROMOTED records. The gateway snapshots this at construction time.
  toGatewayRegistry() {
    const registry = new Map();
    for (const [capabilityId, versions] of this.#capabilities) {
      for (const entry of versions.values()) {
        if (entry.status !== "PROMOTED") continue;
        registry.set(capabilityId, Object.freeze({
          adapter_id: entry.stored.adapter_id,
          tool: entry.stored.tool,
          access: entry.stored.access,
        }));
      }
    }
    return registry;
  }
}
