import { canonicalFingerprint as fingerprint } from "../contracts/canonical-fingerprint.mjs";
import { findReservedDelimiter } from "../contracts/reserved-delimiters.mjs";
import { validateContract } from "../contracts/contract-validator.mjs";
import { RISK_ORDER, intersectWithParent, withinCeiling } from "./non-escalation-comparator.mjs";

// P0-11 HandoffService R1 (GOV-P011-01..08, adopted; R1 gate waived
// 2026-07-19). Dedicated authoritative boundary for handoff envelopes,
// composing over an injected WorkPackageContractService (resolveEffective
// + getDecisionLedger, live at offer AND acceptance) and a NULLABLE
// receiptResolver (absent at R1: context_receipt_ref present -> deny).
//
// AUTHORITY NEVER TRANSFERS: the envelope confers no role, no grant, no
// transition right. The target's capability is bounded by its own live
// grant INTERSECT the effective contract INTERSECT the handoff ceiling.
// Deleting this service removes a constraint surface, never an authority.

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DEPTH_CAP = 4;
const INDEPENDENCE_ROLES = Object.freeze(["REV", "QA", "GOV"]);

const OFFER_KEYS = Object.freeze([
  "envelope", "actorId", "authorityRef", "sourceSessionId", "ceiling",
  "baseline", "parentHandoffId", "idempotencyKey", "contextReceiptRef", "claimedTimestamp"
]);

export class HandoffServiceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "HandoffServiceError";
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

const frozenClone = (value) => deepFreeze(structuredClone(value));
const isBlank = (value) => typeof value !== "string" || value.trim() === "";
function deny(code, message) { throw new HandoffServiceError(code, message); }

// Delimiter-free composite key (IMM-P009-01 structural fix): JSON.stringify
// of the id tuple cannot be collided by any character in the ids and keeps
// this file plain text and reviewable.
const recordKey = (projectId, handoffId) => JSON.stringify([projectId, handoffId]);

function assertIdCharset(fields) {
  for (const [name, value] of Object.entries(fields)) {
    const hit = findReservedDelimiter(value);
    if (hit) deny("DENY_ID_CHARSET", `${name} must not contain '${hit}'`);
  }
}

export class HandoffService {
  #wp;
  #receiptResolver;
  #now;
  #records = new Map();
  #idempotency = new Map();
  #depthCap;
  #ttlMs;

  // workPackageService MUST expose resolveEffective + getDecisionLedger.
  // receiptResolver is null at R1; when non-null it is P0-10
  // consumeReceipt-shaped and flips context_receipt_ref to verifiable.
  constructor({ workPackageService, receiptResolver = null, now = () => new Date(), depthCap = DEFAULT_DEPTH_CAP, ttlMs = DEFAULT_TTL_MS } = {}) {
    if (!workPackageService || typeof workPackageService.resolveEffective !== "function" || typeof workPackageService.getDecisionLedger !== "function") {
      deny("DENY_CONFIG", "workPackageService with resolveEffective + getDecisionLedger is required");
    }
    if (receiptResolver !== null && typeof receiptResolver !== "function") {
      deny("DENY_CONFIG", "receiptResolver, when provided, must be a function");
    }
    this.#wp = workPackageService;
    this.#receiptResolver = receiptResolver;
    this.#now = now;
    this.#depthCap = depthCap;
    this.#ttlMs = ttlMs;
  }

  // Derive the actor history from the work package's decision ledger:
  // executors (RUNNING/SELF_VERIFIED), reviewer (REVIEW), qa (QA).
  #actorHistory(projectId, workPackageId) {
    const ledger = this.#wp.getDecisionLedger(projectId, workPackageId);
    const executors = new Set();
    let reviewer = null;
    let qa = null;
    for (const entry of ledger) {
      if (entry.type !== "TRANSITION") continue;
      if (["RUNNING", "SELF_VERIFIED"].includes(entry.state)) executors.add(entry.actorId);
      if (entry.state === "REVIEW") reviewer = entry.actorId;
      if (entry.state === "QA") qa = entry.actorId;
    }
    return { executors, reviewer, qa };
  }

  #checkIdempotency(idempotencyKey, requestFingerprint) {
    if (isBlank(idempotencyKey)) deny("DENY_IDEMPOTENCY_KEY", "idempotencyKey must be a non-empty string");
    const prior = this.#idempotency.get(idempotencyKey);
    if (!prior) return null;
    if (prior.fingerprint !== requestFingerprint) {
      deny("DENY_IDEMPOTENCY_CONFLICT", "Idempotency key was reused for a different request");
    }
    return frozenClone({ ...structuredClone(prior.result), replayed: true });
  }

  #deriveStatus(record) {
    return record.ledger[record.ledger.length - 1].state;
  }

  offerHandoff(request) {
    if (!request || typeof request !== "object" || Array.isArray(request)) {
      deny("DENY_MALFORMED_REQUEST", "Offer request must be an object");
    }
    const unknown = Object.keys(request).filter((k) => !OFFER_KEYS.includes(k));
    if (unknown.length > 0) deny("DENY_MALFORMED_REQUEST", `Unknown offer fields: ${unknown.join(", ")}`);

    const offerFingerprint = fingerprint({ op: "OFFER", request: { ...request, idempotencyKey: undefined } });
    const replay = this.#checkIdempotency(request.idempotencyKey, offerFingerprint);
    if (replay) return replay;

    const { envelope, actorId, authorityRef, sourceSessionId, ceiling, baseline, parentHandoffId, contextReceiptRef } = request;
    for (const [name, value] of [["actorId", actorId], ["authorityRef", authorityRef], ["sourceSessionId", sourceSessionId], ["baseline", baseline]]) {
      if (isBlank(value)) deny("DENY_MALFORMED_REQUEST", `${name} must be a non-blank string`);
    }

    // R1: receipts are not verifiable (no resolver). A reference present
    // without a resolver is exactly the smuggling channel P0-10 closes.
    // R2 (GOV-P011-07): with a resolver wired, context_receipt_ref is
    // MANDATORY and must resolve; the verification happens after the
    // envelope is schema-valid and the work package is confirmed
    // effective (below), so the receipt is checked against a real binding.
    if (this.#receiptResolver === null && contextReceiptRef !== undefined) {
      deny("DENY_RECEIPT_UNVERIFIABLE", "context_receipt_ref cannot be verified until P0-10 R2 (R1 denies when present)");
    }
    if (this.#receiptResolver !== null && contextReceiptRef === undefined) {
      deny("DENY_RECEIPT_REQUIRED", "context_receipt_ref is required once a receipt resolver is configured (R2)");
    }

    validateContract("handoffEnvelope", envelope);
    assertIdCharset({
      handoff_id: envelope.handoff_id, project_id: envelope.project_id,
      work_package_id: envelope.work_package_id, source_session_id: envelope.source_session_id,
      destination_role: envelope.destination_role, actorId, sourceSessionId
    });
    // Seal: server recomputes content_hash over the envelope with the hash
    // excluded. NOTE (honesty): the caller controls both envelope and hash,
    // so this is tamper-evidence for the STORED/FORWARDED envelope, not
    // offer-time source authentication.
    const { content_hash, ...sealBody } = envelope;
    if (fingerprint(sealBody) !== content_hash) {
      deny("DENY_FINGERPRINT_MISMATCH", "Envelope content_hash does not match the server recomputation");
    }

    const key = recordKey(envelope.project_id, envelope.handoff_id);
    if (this.#records.has(key)) deny("DENY_DUPLICATE_HANDOFF", `Handoff already exists: ${envelope.handoff_id}`);

    // live effectiveness at offer; record the resolved version.
    const resolution = this.#wp.resolveEffective(envelope.project_id, envelope.work_package_id, { baseline });
    if (!resolution || resolution.code !== "ALLOW") {
      deny("DENY_WORK_PACKAGE_NOT_EFFECTIVE", `Work package is not effective: ${resolution?.code ?? "no resolution"}`);
    }
    const contract = resolution.effective;
    if (contract.baseline !== baseline) deny("DENY_BASELINE_MISMATCH", "Asserted baseline does not match the effective contract");

    // R2 receipt verification: the referenced context receipt must resolve
    // ALLOW through the injected resolver AND bind the same (project, work
    // package, session, baseline) as this handoff. This closes the context
    // smuggling channel: no envelope ships context whose provenance the
    // system cannot check against the live federation service.
    if (this.#receiptResolver !== null) {
      if (!contextReceiptRef || typeof contextReceiptRef !== "object" || isBlank(contextReceiptRef.receipt_id)) {
        deny("DENY_MALFORMED_REQUEST", "context_receipt_ref must be an object with a non-blank receipt_id");
      }
      const resolved = this.#receiptResolver(contextReceiptRef, {
        projectId: envelope.project_id, workPackageId: envelope.work_package_id,
        sessionId: envelope.source_session_id, actorId, baseline
      });
      if (!resolved || resolved.code !== "ALLOW" || !resolved.receipt) {
        deny("DENY_RECEIPT_NOT_EFFECTIVE", `context receipt did not resolve ALLOW: ${resolved?.code ?? "no resolution"}`);
      }
      const r = resolved.receipt;
      if (r.project_id !== envelope.project_id || r.work_package_id !== envelope.work_package_id ||
          r.session_id !== envelope.source_session_id || r.baseline_version !== baseline) {
        deny("DENY_RECEIPT_BINDING", "context receipt binds a different project/work package/session/baseline");
      }
    }

    // server-derived bound: contract-sourced dimensions (risk, paths) are
    // authoritative; contract-silent dimensions (data class, tools,
    // transitions) are bounded by the parent chain when present, else by
    // the source's own declaration (RISK-P011-01, flagged in the result).
    const parent = parentHandoffId ? this.#requireAcceptedParent(envelope, parentHandoffId) : null;
    const contractBound = {
      riskClass: contract.risk_class,
      dataClassification: parent ? parent.ceiling.dataClassification : ceiling?.dataClassification,
      paths: contract.allowed_paths,
      tools: parent ? parent.ceiling.tools : ceiling?.tools,
      transitions: parent ? parent.ceiling.transitions : ceiling?.transitions
    };
    const requested = this.#normalizeCeiling(ceiling);
    const bound = this.#normalizeCeiling(contractBound);
    const cmp = withinCeiling(requested, bound);
    if (!cmp.ok) deny(cmp.code, `Requested ceiling exceeds the effective bound on dimension: ${cmp.dimension}`);
    if (parent) {
      const chainCmp = intersectWithParent(requested, this.#normalizeCeiling(parent.ceiling));
      if (!chainCmp.ok) deny(chainCmp.code, `Requested ceiling exceeds the parent ceiling on dimension: ${chainCmp.dimension}`);
    }

    const offeredAt = this.#now();
    const expiresAt = new Date(Math.min(offeredAt.getTime() + this.#ttlMs, Date.parse(contract.valid_until))).toISOString();
    const depth = parent ? parent.depth + 1 : 0;
    if (depth > this.#depthCap) deny("DENY_CHAIN_DEPTH", `Handoff chain depth ${depth} exceeds cap ${this.#depthCap}`);

    const record = {
      projectId: envelope.project_id,
      handoffId: envelope.handoff_id,
      workPackageId: envelope.work_package_id,
      boundVersion: resolution.version,
      baseline,
      sourceActorId: actorId,
      destinationRole: envelope.destination_role,
      ceiling: requested,
      parentHandoffId: parentHandoffId ?? null,
      depth,
      expiresAt,
      envelope: frozenClone(envelope),
      contextReceiptId: contextReceiptRef?.receipt_id ?? null,
      ledger: [deepFreeze({ seq: 1, type: "OFFER", state: "OFFERED", actorId, contextReceiptId: contextReceiptRef?.receipt_id ?? null, timestamp: offeredAt.toISOString() })]
    };
    this.#records.set(key, record);

    const result = {
      handoffId: envelope.handoff_id, projectId: envelope.project_id, state: "OFFERED",
      boundVersion: resolution.version, depth, expiresAt,
      ceiling: requested,
      contractSilentDimensions: parent ? [] : ["dataClassification", "tools", "transitions"],
      offeredAt: offeredAt.toISOString(), replayed: false
    };
    this.#idempotency.set(request.idempotencyKey, { fingerprint: offerFingerprint, result });
    return frozenClone(result);
  }

  #normalizeCeiling(ceiling) {
    return {
      riskClass: ceiling?.riskClass ?? "R4",
      dataClassification: ceiling?.dataClassification ?? "RESTRICTED",
      paths: ceiling?.paths ?? [],
      tools: ceiling?.tools ?? [],
      transitions: ceiling?.transitions ?? []
    };
  }

  #requireAcceptedParent(envelope, parentHandoffId) {
    const parent = this.#records.get(recordKey(envelope.project_id, parentHandoffId));
    if (!parent) deny("DENY_UNKNOWN_PARENT", `Parent handoff not found: ${parentHandoffId}`);
    if (this.#deriveStatus(parent) !== "ACCEPTED") deny("DENY_PARENT_NOT_ACCEPTED", "Parent handoff is not ACCEPTED");
    if (parent.workPackageId !== envelope.work_package_id) {
      deny("DENY_PARENT_SCOPE", "Parent handoff binds a different work package");
    }
    return parent;
  }

  acceptHandoff(projectId, handoffId, options) {
    if (!options || typeof options !== "object") deny("DENY_MALFORMED_REQUEST", "Accept options are required");
    const { actorId, authorityRef, sessionId, baseline, idempotencyKey } = options;
    for (const [name, value] of [["projectId", projectId], ["handoffId", handoffId], ["actorId", actorId], ["authorityRef", authorityRef], ["sessionId", sessionId], ["baseline", baseline]]) {
      if (isBlank(value)) deny("DENY_MALFORMED_REQUEST", `${name} must be a non-blank string`);
    }
    const acceptFingerprint = fingerprint({ op: "ACCEPT", projectId, handoffId, actorId, authorityRef, sessionId, baseline });
    const replay = this.#checkIdempotency(idempotencyKey, acceptFingerprint);
    if (replay) return replay;

    const record = this.#records.get(recordKey(projectId, handoffId));
    if (!record) deny("DENY_UNKNOWN_HANDOFF", `Handoff not found: ${handoffId}`);
    const status = this.#deriveStatus(record);
    if (status !== "OFFERED") deny("DENY_NOT_OFFERED", `Handoff is ${status}, not OFFERED`);

    const nowMs = this.#now().getTime();
    if (nowMs >= Date.parse(record.expiresAt)) deny("DENY_EXPIRED", "Handoff offer has expired");

    // triple baseline equality: asserted == offer-recorded first (local),
    // then == effective contract after live re-resolution.
    if (baseline !== record.baseline) deny("DENY_BASELINE_MISMATCH", "Asserted baseline does not match the offer-recorded baseline");
    const resolution = this.#wp.resolveEffective(record.projectId, record.workPackageId, { baseline });
    if (!resolution || resolution.code !== "ALLOW") deny("DENY_WORK_PACKAGE_NOT_EFFECTIVE", `Work package is not effective: ${resolution?.code ?? "no resolution"}`);
    if (resolution.version !== record.boundVersion) deny("DENY_VERSION_SUPERSEDED", "Effective version has changed since the offer");
    if (resolution.effective.baseline !== baseline) deny("DENY_BASELINE_MISMATCH", "Effective contract baseline does not match the assertion");

    // SoD at acceptance for independence-bearing roles.
    if (INDEPENDENCE_ROLES.includes(record.destinationRole)) {
      if (actorId === record.sourceActorId) deny("DENY_SOD", "Source actor cannot accept its own independence-bearing handoff");
      const { executors, reviewer, qa } = this.#actorHistory(record.projectId, record.workPackageId);
      const prohibited = new Set(executors);
      if (["QA", "GOV"].includes(record.destinationRole) && reviewer) prohibited.add(reviewer);
      if (record.destinationRole === "GOV" && qa) prohibited.add(qa);
      if (prohibited.has(actorId)) deny("DENY_SOD", `Separation of duties prohibits actor ${actorId} from ${record.destinationRole}`);
    }

    const acceptedAt = this.#now().toISOString();
    record.ledger.push(deepFreeze({ seq: record.ledger.length + 1, type: "ACCEPT", state: "ACCEPTED", actorId, sessionId, timestamp: acceptedAt }));

    const result = {
      handoffId, projectId, state: "ACCEPTED", actorId,
      effectiveCeiling: record.ceiling, boundVersion: record.boundVersion,
      acceptedAt, replayed: false
    };
    this.#idempotency.set(idempotencyKey, { fingerprint: acceptFingerprint, result });
    return frozenClone(result);
  }

  #terminal(projectId, handoffId, actorId, type, state, code, guard) {
    const record = this.#records.get(recordKey(projectId, handoffId));
    if (!record) deny("DENY_UNKNOWN_HANDOFF", `Handoff not found: ${handoffId}`);
    const status = this.#deriveStatus(record);
    if (status !== "OFFERED") deny(code, `Handoff is ${status}, not OFFERED`);
    guard(record);
    record.ledger.push(deepFreeze({ seq: record.ledger.length + 1, type, state, actorId, timestamp: this.#now().toISOString() }));
    return frozenClone({ handoffId, projectId, state });
  }

  declineHandoff(projectId, handoffId, { actorId } = {}) {
    if (isBlank(actorId)) deny("DENY_MALFORMED_REQUEST", "actorId is required");
    return this.#terminal(projectId, handoffId, actorId, "DECLINE", "DECLINED", "DENY_NOT_OFFERED", () => {});
  }

  revokeHandoff(projectId, handoffId, { actorId } = {}) {
    if (isBlank(actorId)) deny("DENY_MALFORMED_REQUEST", "actorId is required");
    return this.#terminal(projectId, handoffId, actorId, "REVOKE", "REVOKED", "DENY_NOT_OFFERED", (record) => {
      // source actor or GOV may revoke; GOV identity is asserted here (no
      // grant plumbing at R1) and recorded for audit.
      if (actorId !== record.sourceActorId && actorId !== "GOV") {
        deny("DENY_REVOKE_AUTHORITY", "Only the source actor or GOV may revoke");
      }
    });
  }

  getHandoff(projectId, handoffId) {
    const record = this.#records.get(recordKey(projectId, handoffId));
    if (!record) deny("DENY_UNKNOWN_HANDOFF", `Handoff not found: ${handoffId}`);
    return frozenClone({
      handoffId, projectId, state: this.#deriveStatus(record),
      workPackageId: record.workPackageId, boundVersion: record.boundVersion,
      destinationRole: record.destinationRole, ceiling: record.ceiling,
      parentHandoffId: record.parentHandoffId, depth: record.depth, expiresAt: record.expiresAt,
      envelope: structuredClone(record.envelope)
    });
  }

  getHandoffLedger(projectId, handoffId) {
    const record = this.#records.get(recordKey(projectId, handoffId));
    if (!record) deny("DENY_UNKNOWN_HANDOFF", `Handoff not found: ${handoffId}`);
    return frozenClone(record.ledger.map((line) => structuredClone(line)));
  }
}

export { RISK_ORDER };
