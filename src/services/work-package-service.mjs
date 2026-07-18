import { canonicalFingerprint as fingerprint } from "../contracts/canonical-fingerprint.mjs";
import { validateContract } from "../contracts/contract-validator.mjs";
import { AuthorityEngine, REQUIRED_ROLE } from "../control/authority-engine.mjs";
import { STATE_MACHINES, TransitionEngine } from "../control/state-machine.mjs";

// P0-09 Work Package service (option C per p0-09-gov-disposition.yaml):
// this service is the sole authoritative boundary for work package
// authorization and acceptance. The shared TransitionEngine result is
// necessary but not sufficient — the service's hardened pre-validation
// runs first and either layer's denial denies.

// Canonical REQUIRED_ROLE only gates RUNNING/SELF_VERIFIED/REVIEW/QA/
// GOV_DECISION/ACCEPTED. Every other WorkPackage edge is gated here,
// keyed by "CURRENT->REQUESTED", without modifying the shared engine.
export const WORK_PACKAGE_SERVICE_ROLE_GATES = Object.freeze({
  "DRAFT->PLANNED": "ENGIN",
  "REWORK->PLANNED": "ENGIN",
  "BLOCKED->PLANNED": "ENGIN",
  "PLANNED->REVIEWED": "REV",
  "REVIEWED->AUTHORIZED": "GOV",
  "REVIEWED->REWORK": "REV",
  "AUTHORIZED->READY": "ENGIN",
  "AUTHORIZED->REVOKED": "GOV",
  "READY->BLOCKED": "ENGIN",
  "RUNNING->BLOCKED": "ENGIN",
  "RUNNING->QUARANTINED": "GOV",
  "SELF_VERIFIED->REWORK": "ENGIN",
  "REVIEW->REWORK": "REV",
  "REVIEW->BLOCKED": "REV",
  "QA->REWORK": "QA",
  "QA->BLOCKED": "QA",
  "GOV_DECISION->REWORK": "GOV",
  "GOV_DECISION->BLOCKED": "GOV",
  "GOV_DECISION->QUARANTINED": "GOV",
  "GOV_DECISION->CANCELLED": "GOV",
  "DRAFT->CANCELLED": "ENGIN",
  "PLANNED->CANCELLED": "ENGIN",
  "REVIEWED->CANCELLED": "ENGIN",
  "AUTHORIZED->CANCELLED": "GOV",
  "READY->CANCELLED": "GOV",
  "RUNNING->CANCELLED": "GOV",
  "REWORK->CANCELLED": "GOV",
  "BLOCKED->CANCELLED": "GOV",
  "QUARANTINED->CANCELLED": "GOV"
});

// GOV-P009-05: at most one effective version; highest version in one of
// these states wins and supersedes all lower versions.
export const EFFECTIVE_STATES = Object.freeze([
  "AUTHORIZED",
  "READY",
  "RUNNING",
  "SELF_VERIFIED",
  "REVIEW",
  "QA",
  "GOV_DECISION",
  "ACCEPTED"
]);

// GOV-P009-03: after expiry only these exits remain reachable.
const POST_EXPIRY_TARGETS = Object.freeze(["REWORK", "CANCELLED", "REVOKED"]);

// GOV-P009-07: the obligation prefix (before the first ':') binds an
// obligation to its producing stage and role. Unprefixed obligations are
// legacy and behave as 'any' for one deprecation cycle. A null stage
// list means attachable at any stage.
const OBLIGATION_ATTACH_STAGES = Object.freeze({
  self: Object.freeze(["RUNNING", "SELF_VERIFIED"]),
  review: Object.freeze(["REVIEW"]),
  qa: Object.freeze(["QA"]),
  gov: Object.freeze(["GOV_DECISION"]),
  any: null
});

function obligationType(obligation) {
  const separator = obligation.indexOf(":");
  return separator === -1 ? "any" : obligation.slice(0, separator);
}

const ENVELOPE_KEYS = Object.freeze([
  "projectId",
  "workPackageId",
  "version",
  "requestedState",
  "actorId",
  "authorityRef",
  "policyDecision",
  "evidence",
  "idempotencyKey",
  "reasonCode",
  "claimedTimestamp"
]);

const ENVELOPE_REQUIRED_STRINGS = Object.freeze([
  "projectId",
  "workPackageId",
  "requestedState",
  "actorId",
  "authorityRef",
  "policyDecision",
  "reasonCode"
]);

export class WorkPackageServiceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "WorkPackageServiceError";
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

function frozenClone(value) {
  return deepFreeze(structuredClone(value));
}

function isBlank(value) {
  return typeof value !== "string" || value.trim() === "";
}

function deny(code, message) {
  throw new WorkPackageServiceError(code, message);
}

export class WorkPackageContractService {
  #authority;
  #engine;
  #grants = new Map();
  #now;
  #records = new Map();
  #idempotency = new Map();

  constructor({ grants = [], now = () => new Date() } = {}) {
    this.#now = now;
    // AuthorityEngine validates grant shape, windows, and SoD role
    // conflicts at construction; the service keeps its own copy of the
    // same grants to gate edges the canonical REQUIRED_ROLE map omits.
    this.#authority = new AuthorityEngine({ grants, now });
    for (const grant of grants) this.#grants.set(grant.grantId, structuredClone(grant));
    this.#engine = new TransitionEngine({ authorize: (context) => this.#resolveAuthority(context), now });
  }

  #resolveAuthority(context) {
    if (REQUIRED_ROLE[`WorkPackage:*->${context.requestedState}`]) {
      return this.#authority.authorize(context);
    }
    return this.#serviceAuthorize(context);
  }

  // Mirror of AuthorityEngine.authorize for service-gated edges. Kept in
  // lockstep by the edge-parity conformance test (RISK-P009-01).
  #serviceAuthorize(context) {
    const role = WORK_PACKAGE_SERVICE_ROLE_GATES[`${context.currentState}->${context.requestedState}`];
    if (!role) return { allowed: false, code: "DENY_ROLE_RULE_MISSING", reason: "No authority rule exists for this transition" };

    const grant = this.#grants.get(context.authorityRef);
    if (!grant) return { allowed: false, reason: "Authority grant was not found" };
    if (grant.status !== "ACTIVE") return { allowed: false, reason: "Authority grant is not active" };
    if (grant.actorId !== context.actorId) return { allowed: false, reason: "Authority grant belongs to another actor" };
    if (grant.projectId !== context.projectId || grant.workPackageId !== context.workPackageId) {
      return { allowed: false, reason: "Authority grant scope does not match the governed object" };
    }
    const now = this.#now().getTime();
    if (now < Date.parse(grant.validFrom) || now >= Date.parse(grant.validUntil)) {
      return { allowed: false, reason: "Authority grant is outside its validity window" };
    }
    if (!grant.roles.includes(role)) {
      return { allowed: false, reason: `Authority grant does not assign required role ${role}` };
    }
    if (!grant.allowedTransitions.includes(`WorkPackage:${context.currentState}->${context.requestedState}`)) {
      return { allowed: false, reason: "Authority grant does not allow the requested transition" };
    }
    return { allowed: true, decisionId: grant.decisionId, grantId: grant.grantId, role };
  }

  #key(projectId, workPackageId, version) {
    return `${projectId}|${workPackageId}|${version}`;
  }

  #checkIdempotency(idempotencyKey, requestFingerprint) {
    if (isBlank(idempotencyKey)) {
      deny("DENY_IDEMPOTENCY_KEY", "idempotencyKey must be a non-empty string");
    }
    const prior = this.#idempotency.get(idempotencyKey);
    if (!prior) return null;
    if (prior.fingerprint !== requestFingerprint) {
      deny("DENY_IDEMPOTENCY_CONFLICT", "Idempotency key was reused for a different request");
    }
    return deepFreeze({ ...structuredClone(prior.result), replayed: true });
  }

  createWorkPackage(draft, { idempotencyKey, actorId, authorityRef } = {}) {
    if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
      deny("DENY_MALFORMED_DRAFT", "Work package draft must be an object");
    }
    if (isBlank(actorId) || isBlank(authorityRef)) {
      deny("DENY_MALFORMED_DRAFT", "actorId and authorityRef are required to create a work package");
    }
    const createFingerprint = fingerprint({ op: "CREATE", draft, actorId, authorityRef });
    const replay = this.#checkIdempotency(idempotencyKey, createFingerprint);
    if (replay) return replay;

    validateContract("workPackage", draft);
    for (const field of ["work_package_id", "project_id", "objective", "risk_class", "status", "baseline", "valid_until"]) {
      if (isBlank(draft[field])) deny("DENY_BLANK_SCALAR", `${field} must be a non-blank string`);
    }
    // '|' is the composite-key delimiter; allowing it in ids would let two
    // identities collide into one record and cross-authorize (Immune finding).
    for (const field of ["work_package_id", "project_id"]) {
      if (draft[field].includes("|")) deny("DENY_ID_CHARSET", `${field} must not contain '|'`);
    }
    for (const field of ["scope", "non_scope", "acceptance_criteria", "allowed_paths", "prohibited_paths", "evidence_obligations"]) {
      if (draft[field].some(isBlank)) deny("DENY_BLANK_SCALAR", `${field} entries must be non-blank strings`);
    }
    for (const obligation of draft.evidence_obligations) {
      if (!(obligationType(obligation) in OBLIGATION_ATTACH_STAGES)) {
        deny("DENY_OBLIGATION_TYPE", `Unknown obligation type prefix: ${obligation}`);
      }
    }
    if (draft.status !== "DRAFT") {
      deny("DENY_NOT_DRAFT", "Work packages are created in DRAFT state only");
    }
    if (!Number.isFinite(Date.parse(draft.valid_until))) {
      deny("DENY_INVALID_EXPIRY", "valid_until must be a parseable date-time");
    }

    // Creation gate (Immune V-item): draft registration requires a valid
    // grant scoped to this identity, closing the identity-squatting path.
    // ENGIN (producer drafts) or GOV (governance-initiated drafts) qualify.
    const grant = this.#grants.get(authorityRef);
    const nowMs = this.#now().getTime();
    if (
      !grant ||
      grant.status !== "ACTIVE" ||
      grant.actorId !== actorId ||
      grant.projectId !== draft.project_id ||
      grant.workPackageId !== draft.work_package_id ||
      nowMs < Date.parse(grant.validFrom) ||
      nowMs >= Date.parse(grant.validUntil) ||
      !grant.roles.some((role) => role === "ENGIN" || role === "GOV")
    ) {
      deny("DENY_CREATE_AUTHORITY", "Creation requires an active ENGIN or GOV grant scoped to this work package identity");
    }

    const key = this.#key(draft.project_id, draft.work_package_id, draft.version);
    if (this.#records.has(key)) {
      deny("DENY_DUPLICATE_IDENTITY", `Work package ${draft.work_package_id} version ${draft.version} already exists`);
    }

    const createdAt = this.#now().toISOString();
    const contract = frozenClone(draft);
    const record = {
      projectId: draft.project_id,
      workPackageId: draft.work_package_id,
      version: draft.version,
      contract,
      fingerprint: fingerprint(draft),
      state: "DRAFT",
      revision: 1,
      cycle: 0,
      executorActorIds: new Set(),
      reviewerActorId: null,
      qaActorId: null,
      evidence: [],
      ledger: []
    };
    record.ledger.push(deepFreeze({
      seq: 1,
      type: "CREATE",
      projectId: draft.project_id,
      workPackageId: draft.work_package_id,
      version: draft.version,
      state: "DRAFT",
      actorId,
      authorityDecisionId: grant.decisionId,
      fingerprint: record.fingerprint,
      timestamp: createdAt,
      idempotencyKey
    }));
    this.#records.set(key, record);

    const result = {
      projectId: draft.project_id,
      workPackageId: draft.work_package_id,
      version: draft.version,
      state: "DRAFT",
      revision: 1,
      fingerprint: record.fingerprint,
      createdAt,
      replayed: false
    };
    this.#idempotency.set(idempotencyKey, { fingerprint: createFingerprint, result });
    return frozenClone(result);
  }

  submitTransition(envelope) {
    if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
      deny("DENY_MALFORMED_ENVELOPE", "Transition envelope must be an object");
    }
    const envelopeFingerprint = fingerprint({ op: "TRANSITION", envelope });
    const replay = this.#checkIdempotency(envelope.idempotencyKey, envelopeFingerprint);
    if (replay) return replay;

    const unknownKeys = Object.keys(envelope).filter((key) => !ENVELOPE_KEYS.includes(key));
    if (unknownKeys.length > 0) {
      deny("DENY_MALFORMED_ENVELOPE", `Unknown envelope fields: ${unknownKeys.join(", ")}`);
    }
    for (const field of ENVELOPE_REQUIRED_STRINGS) {
      if (isBlank(envelope[field])) deny("DENY_MALFORMED_ENVELOPE", `${field} must be a non-blank string`);
    }
    if (envelope.projectId.includes("|") || envelope.workPackageId.includes("|")) {
      deny("DENY_MALFORMED_ENVELOPE", "projectId and workPackageId must not contain '|'");
    }
    if (envelope.claimedTimestamp !== undefined && isBlank(envelope.claimedTimestamp)) {
      deny("DENY_MALFORMED_ENVELOPE", "claimedTimestamp, when present, must be a non-blank string");
    }
    if (!Number.isInteger(envelope.version) || envelope.version < 1) {
      deny("DENY_MALFORMED_ENVELOPE", "version must be a positive integer");
    }
    if (!Array.isArray(envelope.evidence) || envelope.evidence.length === 0) {
      deny("DENY_MALFORMED_ENVELOPE", "evidence must be a non-empty array");
    }
    for (const item of envelope.evidence) {
      if (!item || typeof item !== "object" || Array.isArray(item) || isBlank(item.ref)) {
        deny("DENY_MALFORMED_ENVELOPE", "evidence items must be objects with a non-blank ref");
      }
      if (item.obligation !== undefined && isBlank(item.obligation)) {
        deny("DENY_MALFORMED_ENVELOPE", "evidence obligation, when present, must be a non-blank string");
      }
    }

    const record = this.#records.get(this.#key(envelope.projectId, envelope.workPackageId, envelope.version));
    if (!record) {
      deny("DENY_UNKNOWN_WORK_PACKAGE", "Work package version is not registered");
    }
    const machine = STATE_MACHINES.WorkPackage;
    if (!(envelope.requestedState in machine)) {
      deny("DENY_UNKNOWN_STATE", `Unknown work package state: ${envelope.requestedState}`);
    }
    if (!machine[record.state].includes(envelope.requestedState)) {
      deny("DENY_UNDEFINED_TRANSITION", `WorkPackage cannot transition from ${record.state} to ${envelope.requestedState}`);
    }

    for (const item of envelope.evidence) {
      if (item.obligation === undefined) continue;
      if (!record.contract.evidence_obligations.includes(item.obligation)) {
        deny("DENY_UNKNOWN_OBLIGATION", `Obligation is not declared on the contract: ${item.obligation}`);
      }
      // GOV-P009-07 stage lock: typed obligation evidence may only be
      // attached while entering its producing stage.
      const stages = OBLIGATION_ATTACH_STAGES[obligationType(item.obligation)];
      if (stages && !stages.includes(envelope.requestedState)) {
        deny("DENY_OBLIGATION_STAGE", `Evidence for ${item.obligation} may only be attached when entering ${stages.join(" or ")}`);
      }
    }

    const serverNow = this.#now();
    if (serverNow.getTime() >= Date.parse(record.contract.valid_until) && !POST_EXPIRY_TARGETS.includes(envelope.requestedState)) {
      deny("DENY_EXPIRED", "Work package authorization has expired; only REWORK, CANCELLED, or REVOKED remain reachable");
    }

    // Service-level SoD over the ledger-derived actor history. The engine
    // repeats this from producer/reviewer/qa fields; the service checks
    // against the full executor set so a second ENGIN actor cannot slip
    // into an independent role.
    if (["REVIEW", "QA", "GOV_DECISION", "ACCEPTED"].includes(envelope.requestedState)) {
      const prohibited = new Set(record.executorActorIds);
      if (["QA", "GOV_DECISION", "ACCEPTED"].includes(envelope.requestedState) && record.reviewerActorId) {
        prohibited.add(record.reviewerActorId);
      }
      if (["GOV_DECISION", "ACCEPTED"].includes(envelope.requestedState) && record.qaActorId) {
        prohibited.add(record.qaActorId);
      }
      if (prohibited.has(envelope.actorId)) {
        deny("DENY_SOD", `Separation of duties prohibits actor ${envelope.actorId} from entering ${envelope.requestedState}`);
      }
    }

    if (envelope.requestedState === "GOV_DECISION") {
      this.#assertObligationsSatisfied(record, envelope);
    }

    const [runningExecutor] = record.executorActorIds;
    const engineResult = this.#engine.transition({
      objectType: "WorkPackage",
      objectId: `${envelope.workPackageId}@v${envelope.version}`,
      objectVersion: record.revision,
      projectId: envelope.projectId,
      workPackageId: envelope.workPackageId,
      currentState: record.state,
      requestedState: envelope.requestedState,
      actorId: envelope.actorId,
      authorityRef: envelope.authorityRef,
      policyDecision: envelope.policyDecision,
      evidenceRefs: envelope.evidence.map((item) => item.ref),
      idempotencyKey: envelope.idempotencyKey,
      timestamp: serverNow.toISOString(),
      reasonCode: envelope.reasonCode,
      producerActorId: runningExecutor,
      reviewerActorId: record.reviewerActorId ?? undefined,
      qaActorId: record.qaActorId ?? undefined
    });

    const previousState = record.state;
    record.state = envelope.requestedState;
    record.revision = engineResult.objectVersion;
    if (["RUNNING", "SELF_VERIFIED"].includes(envelope.requestedState)) record.executorActorIds.add(envelope.actorId);
    if (envelope.requestedState === "REVIEW") record.reviewerActorId = envelope.actorId;
    if (envelope.requestedState === "QA") record.qaActorId = envelope.actorId;

    for (const item of envelope.evidence) {
      record.evidence.push(deepFreeze({
        ref: item.ref,
        obligation: item.obligation ?? null,
        actorId: envelope.actorId,
        recordedAtState: envelope.requestedState,
        cycle: record.cycle,
        timestamp: engineResult.timestamp
      }));
    }
    // Immune V-item: any backward re-entry toward PLANNED (REWORK or
    // BLOCKED) opens a new evidence cycle so pre-loop review/QA evidence
    // cannot satisfy obligations again after re-execution.
    if (["REWORK", "BLOCKED"].includes(envelope.requestedState)) record.cycle += 1;
    record.ledger.push(deepFreeze({
      seq: record.ledger.length + 1,
      type: "TRANSITION",
      transitionId: engineResult.transitionId,
      projectId: envelope.projectId,
      workPackageId: envelope.workPackageId,
      version: envelope.version,
      previousState,
      state: envelope.requestedState,
      actorId: envelope.actorId,
      authorityDecisionId: engineResult.authorityDecisionId,
      evidence: structuredClone(envelope.evidence),
      reasonCode: envelope.reasonCode,
      timestamp: engineResult.timestamp,
      claimedTimestamp: envelope.claimedTimestamp ?? null,
      idempotencyKey: envelope.idempotencyKey
    }));

    const result = {
      transitionId: engineResult.transitionId,
      projectId: envelope.projectId,
      workPackageId: envelope.workPackageId,
      version: envelope.version,
      revision: record.revision,
      previousState,
      state: record.state,
      actorId: envelope.actorId,
      authorityDecisionId: engineResult.authorityDecisionId,
      evidence: structuredClone(envelope.evidence),
      reasonCode: envelope.reasonCode,
      timestamp: engineResult.timestamp,
      replayed: false
    };
    this.#idempotency.set(envelope.idempotencyKey, {
      fingerprint: envelopeFingerprint,
      result
    });
    return frozenClone(result);
  }

  // GOV-P009-04 + GOV-P009-07 + acceptance independence: every declared
  // obligation needs covering evidence from the CURRENT rework cycle,
  // produced by the role its type prefix binds it to; unless typed
  // "self:" at least one covering item must come from outside the
  // executor set.
  #assertObligationsSatisfied(record, envelope) {
    const items = [
      ...record.evidence.filter((item) => item.cycle === record.cycle),
      ...envelope.evidence.map((item) => ({ ...item, obligation: item.obligation ?? null, actorId: envelope.actorId }))
    ];
    const roleBound = (item, type) => {
      if (type === "self") return record.executorActorIds.has(item.actorId);
      if (type === "review") return item.actorId === record.reviewerActorId;
      if (type === "qa") return item.actorId === record.qaActorId;
      if (type === "gov") return item.actorId === envelope.actorId;
      return true;
    };
    for (const obligation of record.contract.evidence_obligations) {
      const type = obligationType(obligation);
      const covering = items.filter((item) => item.obligation === obligation && roleBound(item, type));
      if (covering.length === 0) {
        deny("DENY_EVIDENCE_INSUFFICIENT", `Evidence obligation is not satisfied: ${obligation}`);
      }
      const independent = covering.some((item) => !record.executorActorIds.has(item.actorId));
      if (type !== "self" && !independent) {
        deny("DENY_EVIDENCE_INDEPENDENCE", `Evidence obligation lacks independent evidence: ${obligation}`);
      }
    }
  }

  #versionsOf(projectId, workPackageId) {
    const versions = [];
    for (const record of this.#records.values()) {
      if (record.projectId === projectId && record.workPackageId === workPackageId) {
        versions.push({ version: record.version, record });
      }
    }
    return versions.sort((left, right) => right.version - left.version);
  }

  getWorkPackage(projectId, workPackageId, version) {
    const versions = this.#versionsOf(projectId, workPackageId);
    const match = version === undefined ? versions[0] : versions.find((entry) => entry.version === version);
    if (!match) deny("DENY_UNKNOWN_WORK_PACKAGE", "Work package is not registered");
    return frozenClone({
      contract: structuredClone(match.record.contract),
      state: match.record.state,
      revision: match.record.revision,
      fingerprint: match.record.fingerprint
    });
  }

  getDecisionLedger(projectId, workPackageId) {
    const versions = this.#versionsOf(projectId, workPackageId);
    if (versions.length === 0) deny("DENY_UNKNOWN_WORK_PACKAGE", "Work package is not registered");
    return frozenClone(versions
      .slice()
      .reverse()
      .flatMap((entry) => entry.record.ledger.map((line) => structuredClone(line))));
  }

  // GOV-P009-05/06: highest AUTHORIZED-or-later version wins; the chosen
  // version must be unexpired and match the caller's asserted baseline.
  // Any failure resolves to NONE — never a fallback to a lower version.
  resolveEffective(projectId, workPackageId, { baseline } = {}) {
    if (isBlank(baseline)) {
      return deepFreeze({ effective: null, code: "DENY_BASELINE_UNBOUND", reason: "Caller must assert the baseline it executes against" });
    }
    const candidate = this.#versionsOf(projectId, workPackageId)
      .find((entry) => EFFECTIVE_STATES.includes(entry.record.state));
    if (!candidate) {
      return deepFreeze({ effective: null, code: "DENY_NO_EFFECTIVE_VERSION", reason: "No version has reached AUTHORIZED or later" });
    }
    if (this.#now().getTime() >= Date.parse(candidate.record.contract.valid_until)) {
      return deepFreeze({ effective: null, code: "DENY_EXPIRED", reason: "Effective authorization has expired" });
    }
    if (candidate.record.contract.baseline !== baseline) {
      return deepFreeze({ effective: null, code: "DENY_BASELINE_MISMATCH", reason: "Asserted baseline does not match the authorized baseline" });
    }
    return frozenClone({
      effective: structuredClone(candidate.record.contract),
      state: candidate.record.state,
      version: candidate.version,
      code: "ALLOW"
    });
  }
}
