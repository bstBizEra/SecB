import { canonicalFingerprint as fingerprint } from "../contracts/canonical-fingerprint.mjs";
import { findReservedDelimiter } from "../contracts/reserved-delimiters.mjs";
import { validateContract } from "../contracts/contract-validator.mjs";
import { runRetrieval } from "./context-retrieval-policy.mjs";

// P0-10 R2 ContextFederationService (GOV-P010-01..07, adopted; R2 gate
// waived 2026-07-19). Sole authoritative boundary for Context Receipts,
// composing over an injected WorkPackageContractService.resolveEffective
// (live at issuance AND consumption). The composed ALLOW is necessary but
// not sufficient; the federation service applies its own hardened checks
// (schema, seal, binding tuple, scope subset, freshness, session, chain)
// and either layer's denial denies. Fail-closed typed NONE throughout.

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const CLASS_ORDER = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"];

const ISSUE_KEYS = Object.freeze([
  "document", "candidateSources", "classificationCeiling", "minimumSufficient",
  "actorId", "authorityRef", "baseline", "ttlMs", "idempotencyKey"
]);

export class ContextFederationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ContextFederationError";
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
const frozenClone = (v) => deepFreeze(structuredClone(v));
const isBlank = (v) => typeof v !== "string" || v.trim() === "";
function deny(code, message) { throw new ContextFederationError(code, message); }
const key = (projectId, receiptId) => JSON.stringify([projectId, receiptId]);

// path containment identical to V-002 / the P0-11 comparator.
function pathSubset(candidate, bound) {
  const hasParent = (v) => v.split(/[\\/]/).includes("..");
  if (candidate.some(hasParent)) return false;
  const bounds = bound.map((p) => p.replace(/\/+$/, ""));
  return candidate.every((p) => bounds.some((e) => p === e || p.startsWith(`${e}/`)));
}

export class ContextFederationService {
  #wp;
  #now;
  #receipts = new Map();      // key -> [versions...]
  #idempotency = new Map();

  constructor({ workPackageService, now = () => new Date() } = {}) {
    if (!workPackageService || typeof workPackageService.resolveEffective !== "function") {
      deny("DENY_CONFIG", "workPackageService with resolveEffective is required");
    }
    this.#wp = workPackageService;
    this.#now = now;
  }

  #versions(projectId, receiptId) {
    return this.#receipts.get(key(projectId, receiptId)) ?? [];
  }
  #chainHead(projectId, receiptId) {
    const v = this.#versions(projectId, receiptId);
    return v.length ? v[v.length - 1] : null;
  }

  #checkIdempotency(idempotencyKey, fp) {
    if (isBlank(idempotencyKey)) deny("DENY_IDEMPOTENCY_KEY", "idempotencyKey must be a non-empty string");
    const prior = this.#idempotency.get(idempotencyKey);
    if (!prior) return null;
    if (prior.fingerprint !== fp) deny("DENY_IDEMPOTENCY_CONFLICT", "Idempotency key reused for a different request");
    return frozenClone({ ...structuredClone(prior.result), replayed: true });
  }

  // Seal over the document with content_hash excluded (server authority).
  #seal(document) {
    const { content_hash, ...body } = document;
    return fingerprint(body);
  }

  issueReceipt(request) {
    if (!request || typeof request !== "object" || Array.isArray(request)) deny("DENY_MALFORMED_REQUEST", "Issue request must be an object");
    const unknown = Object.keys(request).filter((k) => !ISSUE_KEYS.includes(k));
    if (unknown.length) deny("DENY_MALFORMED_REQUEST", `Unknown issue fields: ${unknown.join(", ")}`);
    const fp = fingerprint({ op: "ISSUE", request: { ...request, idempotencyKey: undefined } });
    const replay = this.#checkIdempotency(request.idempotencyKey, fp);
    if (replay) return replay;

    const { document, candidateSources = [], classificationCeiling = "INTERNAL", minimumSufficient, actorId, authorityRef, baseline, ttlMs = DEFAULT_TTL_MS } = request;
    for (const [n, v] of [["actorId", actorId], ["authorityRef", authorityRef], ["baseline", baseline]]) {
      if (isBlank(v)) deny("DENY_MALFORMED_REQUEST", `${n} must be a non-blank string`);
    }
    if (!CLASS_ORDER.includes(classificationCeiling)) deny("DENY_MALFORMED_REQUEST", `Unknown classificationCeiling: ${classificationCeiling}`);

    validateContract("contextReceipt", document);
    for (const field of ["receipt_id", "project_id", "work_package_id", "session_id"]) {
      const hit = findReservedDelimiter(document[field]);
      if (hit) deny("DENY_ID_CHARSET", `${field} must not contain '${hit}'`);
    }
    // seal: caller content_hash must match server recomputation.
    if (this.#seal(document) !== document.content_hash) deny("DENY_FINGERPRINT_MISMATCH", "Document content_hash does not match the server recomputation");

    if (document.version !== 1) deny("DENY_NOT_INITIAL_VERSION", "Issued receipts start at version 1 (successors come from compaction)");
    if (this.#versions(document.project_id, document.receipt_id).length) deny("DENY_DUPLICATE_RECEIPT", `Receipt already exists: ${document.receipt_id}`);

    // live effectiveness at issuance; record the resolved version.
    const resolution = this.#wp.resolveEffective(document.project_id, document.work_package_id, { baseline });
    if (!resolution || resolution.code !== "ALLOW") deny("DENY_WORK_PACKAGE_NOT_EFFECTIVE", `Work package is not effective: ${resolution?.code ?? "no resolution"}`);
    if (document.baseline_version !== baseline || resolution.effective.baseline !== baseline) deny("DENY_BASELINE_MISMATCH", "Baseline is not equal across document, assertion, and effective contract");

    // scope must not widen beyond the effective contract's approved paths.
    if (!pathSubset(document.authority_scope, resolution.effective.allowed_paths)) {
      deny("DENY_SCOPE_WIDENING", "authority_scope exceeds the effective contract's approved paths");
    }

    // subtractive retrieval over the candidate pool; the surviving refs must
    // exactly match the sealed document's source_references (no smuggling).
    const retrieval = runRetrieval(candidateSources, { projectId: document.project_id, classificationCeiling, minimumSufficient });
    // Set equality (order-independent, duplicate-proof): source_references
    // must be exactly the survivor set — no unauthorized ref, and no
    // duplicate under-claim that would drop an authorized one (Immune note 1).
    const surviving = [...new Set(retrieval.included)].sort();
    const claimed = [...new Set(document.source_references)].sort();
    if (claimed.length !== document.source_references.length ||
        surviving.length !== claimed.length ||
        surviving.some((ref, i) => ref !== claimed[i])) {
      deny("DENY_SOURCE_MISMATCH", "source_references must exactly equal the subtractive retrieval survivor set");
    }

    const issuedAt = this.#now();
    const expiresAt = new Date(Math.min(issuedAt.getTime() + ttlMs, Date.parse(resolution.effective.valid_until))).toISOString();
    const record = {
      projectId: document.project_id, receiptId: document.receipt_id, version: 1,
      workPackageId: document.work_package_id, boundWpVersion: resolution.version,
      baseline, sessionId: document.session_id, contentHash: document.content_hash,
      document: frozenClone(document), issuedAt: issuedAt.toISOString(), expiresAt,
      status: "ISSUED", parentContentHash: null, exclusions: retrieval.exclusions,
      ledger: [deepFreeze({ seq: 1, type: "ISSUE", version: 1, actorId, authorityDecisionId: resolution.version, timestamp: issuedAt.toISOString() })]
    };
    this.#receipts.set(key(document.project_id, document.receipt_id), [record]);

    const result = { receiptId: document.receipt_id, projectId: document.project_id, version: 1, state: "ISSUED", boundWpVersion: resolution.version, expiresAt, exclusions: retrieval.exclusions, replayed: false };
    this.#idempotency.set(request.idempotencyKey, { fingerprint: fp, result });
    return frozenClone(result);
  }

  // Fail-closed consumption: any failure resolves to a typed NONE result
  // (never a throw for the resolution outcomes; malformed input throws).
  consumeReceipt(projectId, receiptId, { sessionId, actorId, baseline } = {}) {
    for (const [n, v] of [["projectId", projectId], ["receiptId", receiptId], ["sessionId", sessionId], ["actorId", actorId], ["baseline", baseline]]) {
      if (isBlank(v)) deny("DENY_MALFORMED_REQUEST", `${n} must be a non-blank string`);
    }
    const head = this.#chainHead(projectId, receiptId);
    if (!head) return deepFreeze({ receipt: null, code: "DENY_UNKNOWN_RECEIPT", reason: `Unknown receipt: ${receiptId}` });
    if (head.status === "REVOKED") return deepFreeze({ receipt: null, code: "DENY_REVOKED", reason: "Receipt chain is revoked" });
    if (head.status === "SUPERSEDED") return deepFreeze({ receipt: null, code: "DENY_SUPERSEDED", reason: "Consume the chain head", chainHeadVersion: this.#versions(projectId, receiptId).length });

    if (this.#seal(head.document) !== head.contentHash) return deepFreeze({ receipt: null, code: "DENY_FINGERPRINT_MISMATCH", reason: "Stored document failed seal re-verification" });
    if (head.sessionId !== sessionId) return deepFreeze({ receipt: null, code: "DENY_SESSION_MISMATCH", reason: "Receipt is bound to another session" });
    if (head.baseline !== baseline) return deepFreeze({ receipt: null, code: "DENY_BASELINE_MISMATCH", reason: "Asserted baseline does not match the receipt" });
    if (this.#now().getTime() >= Date.parse(head.expiresAt)) return deepFreeze({ receipt: null, code: "DENY_EXPIRED", reason: "Receipt has expired" });

    const resolution = this.#wp.resolveEffective(projectId, head.workPackageId, { baseline });
    if (!resolution || resolution.code !== "ALLOW") return deepFreeze({ receipt: null, code: "DENY_WORK_PACKAGE_NOT_EFFECTIVE", reason: resolution?.code ?? "no resolution" });
    if (resolution.version !== head.boundWpVersion) return deepFreeze({ receipt: null, code: "DENY_VERSION_SUPERSEDED", reason: "Effective work package version changed since issuance" });
    if (resolution.effective.baseline !== baseline) return deepFreeze({ receipt: null, code: "DENY_BASELINE_MISMATCH", reason: "Effective contract baseline changed" });

    head.ledger.push(deepFreeze({ seq: head.ledger.length + 1, type: "CONSUME", version: head.version, actorId, sessionId, timestamp: this.#now().toISOString() }));
    return frozenClone({ receipt: structuredClone(head.document), version: head.version, code: "ALLOW" });
  }

  // Chain-and-supersede compaction: version N+1, subset-only, expires_at <=
  // parent, re-passes effectiveness; parent becomes SUPERSEDED deny-on-use.
  compactReceipt(projectId, receiptId, compaction, { idempotencyKey } = {}) {
    if (!compaction || typeof compaction !== "object") deny("DENY_MALFORMED_REQUEST", "compaction document is required");
    const fp = fingerprint({ op: "COMPACT", projectId, receiptId, compaction });
    const replay = this.#checkIdempotency(idempotencyKey, fp);
    if (replay) return replay;

    const parent = this.#chainHead(projectId, receiptId);
    if (!parent) deny("DENY_UNKNOWN_RECEIPT", `Unknown receipt: ${receiptId}`);
    if (parent.status !== "ISSUED") deny("DENY_NOT_COMPACTABLE", `Receipt head is ${parent.status}, not ISSUED`);

    validateContract("contextReceipt", compaction);
    if (this.#seal(compaction) !== compaction.content_hash) deny("DENY_FINGERPRINT_MISMATCH", "Compaction content_hash does not match the server recomputation");
    if (compaction.receipt_id !== parent.receiptId || compaction.project_id !== parent.projectId) deny("DENY_CHAIN_IDENTITY", "Compaction must keep the same receipt identity");
    if (compaction.version !== parent.version + 1) deny("DENY_CHAIN_VERSION", `Compaction must be version ${parent.version + 1}`);

    // subset-only across sources, tools, skills, scope.
    const subset = (child, par) => child.every((x) => par.includes(x));
    if (!subset(compaction.source_references, parent.document.source_references)) deny("DENY_COMPACTION_ADDITIVE", "source_references are not a subset of the parent");
    if (!subset(compaction.allowed_tools, parent.document.allowed_tools)) deny("DENY_COMPACTION_ADDITIVE", "allowed_tools are not a subset of the parent");
    if (!subset(compaction.allowed_skills, parent.document.allowed_skills)) deny("DENY_COMPACTION_ADDITIVE", "allowed_skills are not a subset of the parent");
    if (!subset(compaction.authority_scope, parent.document.authority_scope)) deny("DENY_COMPACTION_ADDITIVE", "authority_scope is not a subset of the parent");

    // re-pass effectiveness; successor never outlives the parent.
    const resolution = this.#wp.resolveEffective(parent.projectId, parent.workPackageId, { baseline: parent.baseline });
    if (!resolution || resolution.code !== "ALLOW") deny("DENY_WORK_PACKAGE_NOT_EFFECTIVE", `Work package is not effective: ${resolution?.code ?? "no resolution"}`);

    const now = this.#now();
    const successor = {
      ...parent, version: compaction.version, contentHash: compaction.content_hash,
      document: frozenClone(compaction), parentContentHash: parent.contentHash, status: "ISSUED",
      expiresAt: parent.expiresAt, // successor expires_at <= parent (inherits; never extends)
      ledger: [...parent.ledger, deepFreeze({ seq: parent.ledger.length + 1, type: "COMPACT_CHAIN", version: compaction.version, parentContentHash: parent.contentHash, timestamp: now.toISOString() })]
    };
    parent.status = "SUPERSEDED";
    this.#receipts.get(key(projectId, receiptId)).push(successor);

    const result = { receiptId, projectId, version: compaction.version, state: "ISSUED", supersededParent: parent.version, replayed: false };
    this.#idempotency.set(idempotencyKey, { fingerprint: fp, result });
    return frozenClone(result);
  }

  // GOV-gated: the caller asserts the GOV role (recorded for audit; full
  // grant-binding is a mutation-substrate concern, R1 honesty parity).
  revokeReceipt(projectId, receiptId, { actorId, role } = {}) {
    if (isBlank(actorId)) deny("DENY_MALFORMED_REQUEST", "actorId is required");
    if (role !== "GOV") deny("DENY_REVOKE_AUTHORITY", "Only a GOV-role actor may revoke a receipt chain");
    const versions = this.#versions(projectId, receiptId);
    if (!versions.length) deny("DENY_UNKNOWN_RECEIPT", `Unknown receipt: ${receiptId}`);
    const now = this.#now().toISOString();
    for (const v of versions) v.status = "REVOKED";
    versions[versions.length - 1].ledger.push(deepFreeze({ seq: versions[versions.length - 1].ledger.length + 1, type: "REVOKE", actorId, timestamp: now }));
    return frozenClone({ receiptId, projectId, state: "REVOKED" });
  }

  getReceipt(projectId, receiptId, version) {
    const versions = this.#versions(projectId, receiptId);
    if (!versions.length) deny("DENY_UNKNOWN_RECEIPT", `Unknown receipt: ${receiptId}`);
    const match = version === undefined ? versions[versions.length - 1] : versions.find((v) => v.version === version);
    if (!match) deny("DENY_UNKNOWN_RECEIPT", `Unknown receipt version: ${version}`);
    return frozenClone({ receiptId, projectId, version: match.version, state: match.status, document: structuredClone(match.document), exclusions: match.exclusions });
  }

  getReceiptLedger(projectId, receiptId) {
    const head = this.#chainHead(projectId, receiptId);
    if (!head) deny("DENY_UNKNOWN_RECEIPT", `Unknown receipt: ${receiptId}`);
    return frozenClone(head.ledger.map((l) => structuredClone(l)));
  }
}
