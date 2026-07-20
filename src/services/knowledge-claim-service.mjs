// MOD-KNOW Slice S1 — Knowledge claim lifecycle facade, UNWIRED.
//
// Assessment: docs/03-project-control/candidates/mod-know-gap-assessment-001.md
// (bst/mod-know-assessment @ 3ddfe41). This module closes G1 (no claim
// lifecycle service wrapping the KnowledgeLedger admission primitive) and G2
// (no admission SoD on the knowledge path) by composing a deny-by-default
// proposal pipeline IN FRONT of an injected KnowledgeLedger. It mirrors the
// MOD-MEM S1 facade (src/services/memory-gateway-service.mjs) and the MOD-GOV
// S3 "unwired facade" precedent: nothing wires this module, every collaborator
// is injected, and it holds no state, no I/O, no persistence, and no ledger
// authority of its own.
//
// Scope discipline (S1 charter, R3+ HARD LINE):
//   - The facade NEVER alters KnowledgeLedger.appendClaim, its learning
//     boundary (evidence-chain statuses VERIFIED/ACCEPTED), or
//     ACCEPTED_EVIDENCE_STATUSES. It WRAPS ONLY: admission is DELEGATED to
//     `knowledgeLedger.appendClaim` unchanged, and the ledger's own denials
//     (e.g. DENY_EVIDENCE_CHAIN, DENY_INVALID_TEMPORAL_WINDOW) pass through
//     VERBATIM — never pre-empted, never reinterpreted, never re-coded.
//   - Admission SoD REUSES the kernel primitive (sod-rules.mjs
//     checkPairwiseDistinct) CONFIG-ONLY: the facade supplies actor sets and a
//     deny code, and makes zero changes to sod-rules.mjs exported behavior.
//   - `evidenceResolver` is an INJECTED PORT ({ resolveAccepted(ref) ->
//     { ok: true, envelope } | deny }) decoupling this slice from the unbuilt
//     MOD-EVID accepted-evidence resolver (assessment G5: blocked). The port
//     check is RESOLVABILITY ONLY — the learning-boundary status/identity
//     checks remain the ledger's alone (no duplication, no pre-emption).
//   - Fail-closed everywhere: malformed construction throws; malformed
//     requests, an unavailable clock, a contract-invalid claim, an
//     unresolvable evidence ref, an admission SoD violation, an unavailable
//     audit writer, and a throwing ledger all yield structured denials with
//     stage-specific codes. proposeClaim/getClaim/listClaims never throw.
//
// Trusted-time: the facade stamps `proposed_at` on admission and supplies the
// server-derived resolution instant to `knowledgeLedger.resolveClaim` from the
// injected `now` clock — closing the temporal-ledgers consumer obligation
// ("an enforcing consumer must supply a trusted server-derived instant").
// A caller may not supply the enforcement instant.

import { validateContract } from "../contracts/contract-validator.mjs";

const PROPOSE_KEYS = Object.freeze(["claim", "admission", "idempotencyKey", "expectedSequence"]);
const ADMISSION_KEYS = Object.freeze(["proposer", "reviewer", "approver"]);
const GET_KEYS = Object.freeze(["claim_id"]);
const LIST_KEYS = Object.freeze(["project_id"]);

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isBlank = (value) => typeof value !== "string" || value.trim() === "";

export class KnowledgeClaimConfigurationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "KnowledgeClaimConfigurationError";
    this.code = code;
  }
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

export function createKnowledgeClaimService({ knowledgeLedger, sodRules, evidenceResolver, now, auditWriter } = {}) {
  // --- Fail-closed construction ------------------------------------------
  if (
    !knowledgeLedger ||
    typeof knowledgeLedger !== "object" ||
    typeof knowledgeLedger.appendClaim !== "function" ||
    typeof knowledgeLedger.resolveClaim !== "function" ||
    typeof knowledgeLedger.read !== "function"
  ) {
    throw new KnowledgeClaimConfigurationError(
      "INVALID_KNOWLEDGE_LEDGER",
      "createKnowledgeClaimService requires a knowledgeLedger with appendClaim(), resolveClaim() and read() (wrap-not-modify delegation target)"
    );
  }
  if (!isPlainObject(sodRules) || typeof sodRules.checkPairwiseDistinct !== "function") {
    throw new KnowledgeClaimConfigurationError(
      "INVALID_SOD_RULES",
      "sodRules must expose a checkPairwiseDistinct function (kernel primitive reuse, config-only)"
    );
  }
  if (!isPlainObject(evidenceResolver) || typeof evidenceResolver.resolveAccepted !== "function") {
    throw new KnowledgeClaimConfigurationError(
      "INVALID_EVIDENCE_RESOLVER",
      "evidenceResolver must expose a resolveAccepted(ref) function (injected MOD-EVID port)"
    );
  }
  if (typeof now !== "function") {
    throw new KnowledgeClaimConfigurationError(
      "INVALID_CLOCK",
      "createKnowledgeClaimService requires a now() clock function (server-derived instants)"
    );
  }
  if (typeof auditWriter !== "function") {
    throw new KnowledgeClaimConfigurationError(
      "INVALID_AUDIT_WRITER",
      "createKnowledgeClaimService requires an auditWriter function (audit-first admission)"
    );
  }

  // Server-derived instant: { ms, iso } or null when the clock is unusable.
  function serverInstant() {
    try {
      const epochMs = Date.prototype.getTime.call(now());
      if (!Number.isFinite(epochMs)) return null;
      return { ms: epochMs, iso: new Date(epochMs).toISOString() };
    } catch {
      return null;
    }
  }

  function deny(code, reason, detail = null) {
    const result = { decision: "DENY", code, reason };
    if (detail !== null) Object.assign(result, detail);
    return deepFreeze(result);
  }

  // --- Proposal shape validation (closed envelope) ------------------------
  function validateProposeShape(request) {
    if (!isPlainObject(request)) return { code: "DENY_MALFORMED_REQUEST", reason: "Proposal request must be an object" };
    const unknown = Object.keys(request).filter((key) => !PROPOSE_KEYS.includes(key));
    if (unknown.length > 0) return { code: "DENY_MALFORMED_REQUEST", reason: `Unknown request fields: ${unknown.join(", ")}` };
    if (!isPlainObject(request.claim)) return { code: "DENY_MALFORMED_REQUEST", reason: "claim must be an object" };
    if (!isPlainObject(request.admission)) return { code: "DENY_MALFORMED_REQUEST", reason: "admission must be an object" };
    const unknownAdmission = Object.keys(request.admission).filter((key) => !ADMISSION_KEYS.includes(key));
    if (unknownAdmission.length > 0) return { code: "DENY_MALFORMED_REQUEST", reason: `Unknown admission fields: ${unknownAdmission.join(", ")}` };
    const missing = ["proposer", "approver"].filter((key) => isBlank(request.admission[key]));
    if (missing.length > 0) return { code: "DENY_MISSING_FIELDS", reason: `Missing admission fields: ${missing.join(", ")} (doctrine requires an approver and admission decision)` };
    if (request.admission.reviewer !== undefined && isBlank(request.admission.reviewer)) {
      return { code: "DENY_MALFORMED_REQUEST", reason: "admission.reviewer, when present, must be a non-blank string" };
    }
    if (isBlank(request.idempotencyKey)) return { code: "DENY_MISSING_FIELDS", reason: "idempotencyKey is required" };
    if (!Number.isInteger(request.expectedSequence) || request.expectedSequence < 0) {
      return { code: "DENY_MALFORMED_REQUEST", reason: "expectedSequence must be a non-negative integer" };
    }
    return null;
  }

  // Deny-by-default proposal pipeline. Stage order is part of the contract
  // (tested): 1 shape -> 2 clock -> 3 contract schema -> 4 evidence port ->
  // 5 admission SoD -> 6 audit-first -> 7 DELEGATE to knowledgeLedger
  // .appendClaim UNCHANGED -> ADMITTED.
  function proposeClaim(request) {
    // 1. Shape: closed envelope, fail-closed.
    const shapeError = validateProposeShape(request);
    if (shapeError) return deny(shapeError.code, shapeError.reason);

    // 2. Clock: server-derived instant only. A throwing/NaN clock denies.
    const instant = serverInstant();
    if (instant === null) return deny("DENY_CLOCK_UNAVAILABLE", "Server time source is unavailable");

    // 3. Contract: the claim must satisfy the EXISTING knowledge-claim
    // contract via the reconciled validator (no schema fork, no extension).
    try {
      validateContract("knowledgeClaim", request.claim);
    } catch (error) {
      return deny(
        typeof error?.code === "string" && error.code.length > 0 ? error.code : "DENY_CONTRACT_INVALID",
        error?.message ?? "knowledgeClaim contract validation failed"
      );
    }

    // 4. Evidence port: every evidence_ref must RESOLVE through the injected
    // MOD-EVID port. Resolvability only — the learning-boundary status and
    // identity checks belong to the ledger (stage 7) and are NOT pre-empted
    // here. A port denial passes through inside the structured denial.
    for (const ref of request.claim.evidence_refs) {
      let resolution;
      try {
        resolution = evidenceResolver.resolveAccepted(ref);
      } catch {
        return deny("DENY_EVIDENCE_UNRESOLVED", `Evidence resolver failed for: ${ref}`);
      }
      if (!isPlainObject(resolution) || resolution.ok !== true || !isPlainObject(resolution.envelope)) {
        return deny("DENY_EVIDENCE_UNRESOLVED", `Evidence reference did not resolve to an accepted envelope: ${ref}`, {
          port_denial: isPlainObject(resolution)
            ? { code: resolution.code ?? null, reason: resolution.reason ?? null }
            : null
        });
      }
    }

    // 5. Admission SoD — kernel primitive reuse, config-only. The claim's
    // proposer may not be its own approver; proposer, approver (and reviewer
    // if present) must be pairwise-distinct.
    const actors = [
      { role: "PROPOSER", actorId: request.admission.proposer },
      { role: "APPROVER", actorId: request.admission.approver }
    ];
    if (!isBlank(request.admission.reviewer)) {
      actors.push({ role: "REV", actorId: request.admission.reviewer });
    }
    let sodResult;
    try {
      sodResult = sodRules.checkPairwiseDistinct(actors, { code: "DENY_ADMISSION_SOD" });
    } catch {
      return deny("DENY_ADMISSION_SOD", "Admission separation-of-duties check failed");
    }
    if (!sodResult || sodResult.ok !== true) {
      return deny(sodResult?.code ?? "DENY_ADMISSION_SOD", sodResult?.message ?? "Admission separation-of-duties violated");
    }

    // 6. Audit-first: the admission audit is written BEFORE any ledger
    // mutation. A throwing/unavailable audit writer denies with no append.
    try {
      auditWriter({
        type: "KNOWLEDGE_ADMISSION_AUDIT",
        claim_id: request.claim.claim_id,
        project_id: request.claim.project_id,
        actor_id: request.claim.actor_id,
        truth_status: request.claim.truth_status,
        proposed_at: instant.iso,
        proposer: request.admission.proposer,
        approver: request.admission.approver
      });
    } catch {
      return deny("DENY_AUDIT_UNAVAILABLE", "Audit ledger writer is unavailable; admission denied before ledger append");
    }

    // 7. DELEGATE to the injected KnowledgeLedger UNCHANGED. Its learning
    // boundary (evidence chain, identity binding, temporal window,
    // idempotency) runs exactly as on main; any LedgerError it raises is
    // surfaced VERBATIM (its own code and message) — never reinterpreted.
    let appendResult;
    try {
      appendResult = knowledgeLedger.appendClaim(structuredClone(request.claim), {
        expectedSequence: request.expectedSequence,
        idempotencyKey: request.idempotencyKey
      });
    } catch (error) {
      if (typeof error?.code === "string" && error.code.length > 0) {
        return deny(error.code, error.message, { source: "knowledge-ledger" });
      }
      return deny("DENY_LEDGER_UNAVAILABLE", "Knowledge ledger append failed");
    }

    return deepFreeze({
      decision: "ALLOW",
      code: "ADMITTED",
      proposed_at: instant.iso,
      claim_id: request.claim.claim_id,
      append: appendResult === undefined ? null : structuredClone(appendResult)
    });
  }

  // --- Read-only resolution ----------------------------------------------
  // Temporal resolution of ONE claim, delegated to the ledger's own
  // resolveClaim with the TRUSTED server-derived instant (consumer
  // obligation). Ledger deny codes (DENY_UNKNOWN_CLAIM,
  // DENY_TEMPORAL_BOUNDARY, ...) pass through verbatim.
  function getClaim(query) {
    if (!isPlainObject(query)) return deny("DENY_MALFORMED_REQUEST", "Claim query must be an object");
    const unknown = Object.keys(query).filter((key) => !GET_KEYS.includes(key));
    if (unknown.length > 0) return deny("DENY_MALFORMED_REQUEST", `Unknown query fields: ${unknown.join(", ")}`);
    if (isBlank(query.claim_id)) return deny("DENY_MISSING_FIELDS", "claim_id is required");

    const instant = serverInstant();
    if (instant === null) return deny("DENY_CLOCK_UNAVAILABLE", "Server time source is unavailable");

    let resolution;
    try {
      resolution = knowledgeLedger.resolveClaim(query.claim_id, { at: instant.iso });
    } catch {
      return deny("DENY_LEDGER_UNAVAILABLE", "Knowledge ledger resolution failed");
    }
    if (!isPlainObject(resolution) || resolution.code !== "ALLOW" || !isPlainObject(resolution.claim)) {
      return deny(
        typeof resolution?.code === "string" && resolution.code.length > 0 ? resolution.code : "DENY_LEDGER_UNAVAILABLE",
        resolution?.reason ?? "Knowledge ledger did not resolve the claim",
        { source: "knowledge-ledger" }
      );
    }

    return deepFreeze({
      decision: "ALLOW",
      code: "RESOLVED",
      resolved_at: instant.iso,
      data_untrusted: true,
      claim: structuredClone(resolution.claim)
    });
  }

  // Project-scoped read of admitted claims. Read-only: no mutation, no
  // pruning; every returned claim is frozen and marked data_untrusted.
  function listClaims(query) {
    if (!isPlainObject(query)) return deny("DENY_MALFORMED_REQUEST", "List query must be an object");
    const unknown = Object.keys(query).filter((key) => !LIST_KEYS.includes(key));
    if (unknown.length > 0) return deny("DENY_MALFORMED_REQUEST", `Unknown query fields: ${unknown.join(", ")}`);
    if (isBlank(query.project_id)) return deny("DENY_MISSING_FIELDS", "project_id is required");

    const instant = serverInstant();
    if (instant === null) return deny("DENY_CLOCK_UNAVAILABLE", "Server time source is unavailable");

    let rows;
    try {
      rows = knowledgeLedger.read();
    } catch {
      return deny("DENY_LEDGER_UNAVAILABLE", "Knowledge ledger read failed");
    }
    if (!Array.isArray(rows)) return deny("DENY_LEDGER_UNAVAILABLE", "Knowledge ledger read did not return a list");

    const claims = [];
    for (const row of rows) {
      const entry = row?.entry;
      if (!isPlainObject(entry) || !isPlainObject(entry.payload)) continue;
      if (entry.type !== "KNOWLEDGE_CLAIM") continue;
      if (entry.payload.project_id !== query.project_id) continue; // project scoping
      claims.push(deepFreeze({ data_untrusted: true, claim: structuredClone(entry.payload) }));
    }

    return deepFreeze({
      decision: "ALLOW",
      code: "LISTED",
      listed_at: instant.iso,
      claims: Object.freeze(claims)
    });
  }

  return Object.freeze({ proposeClaim, getClaim, listClaims });
}
