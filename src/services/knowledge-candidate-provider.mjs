// MOD-KNOW Slice S3 — Knowledge CandidateSource PROVIDER, UNWIRED.
//
// Assessment: docs/03-project-control/candidates/mod-know-gap-assessment-001.md
// (G6, S3). This module closes the SUPPLY half of the B1 boundary that
// src/services/candidate-source-port.mjs (MOD-CONTEXT S2) defined the RECEIVE
// half of: it PROJECTS admitted-and-current knowledge claims into typed
// CandidateSource entries (kind "knowledge") shaped EXACTLY like the port's
// provider-input entry {id, kind, project_id, classification, verified,
// current, resolvable, relevance?, provenance {origin, retrieved_at,
// content_hash?}}, so a caller can hand the output straight to
// normalizeCandidateSources with ZERO port-level exclusions (shape-perfect)
// and then mint a Context Receipt over the normalized candidates.
//
// PURE MAPPER, R2, ADDITIVE ONLY: nothing wires this module. It holds no
// state, no I/O and no ledger authority; every collaborator is injected. It
// reads ONLY through the ratified S1 read path (claimService.getClaim) and the
// ratified S2 currency walk (linkageService.resolveCurrent) — it never appends,
// never resolves evidence, never mutates a claim, and never widens anything.
// The knowledge-claim schema, S1 and S2 stay byte-identical to base.
//
// SUBTRACTIVE ACCOUNTING (mirrors the port's "stage 0" pattern): each ref maps
// to exactly one outcome — an INCLUDED CandidateSource entry, or an EXCLUDED
// typed record {ref, stage: "knowledge-provider", reason, code?, detail} whose
// {ref, stage, reason} core matches the port / pipeline exclusion entries. The
// invariant included.length + excluded.length === refs.length holds always;
// nothing is silently dropped and nothing throws per-ref (deny-by-default).
//
// EXCLUSION REASONS (closed vocabulary):
//   - KNOWLEDGE_UNRESOLVED: the claim (or the current version of its lineage)
//     did not resolve through the S1 read path. Carries the VERBATIM S1/ledger
//     passthrough `code` (e.g. DENY_UNKNOWN_CLAIM, DENY_TEMPORAL_BOUNDARY) —
//     never pre-empted, never re-coded. A throwing claim service lands here too.
//   - CURRENT_SUPERSEDED: the claim resolves but S2 currency says a newer
//     version wins (resolveCurrent.current_claim_id !== ref). Carries that id.
//   - LINEAGE_BROKEN: S2 currency denied DENY_BROKEN_LINEAGE (branched or
//     cyclic). Carries the lineage_issue and the passthrough code.
//
// HONEST FIELD MAPPING (documented, because none of it is free):
//   - classification: the knowledge-claim contract (contracts/knowledge-claim
//     .schema.json, additionalProperties:false) carries NO classification field.
//     An honest mapper cannot assert PUBLIC for knowledge it cannot see the
//     sensitivity of, so knowledge-ledger claims default to "INTERNAL"
//     (approved, project-scoped internal knowledge). IF a future claim ever
//     carries an explicit, valid classification it is honored verbatim — this
//     only ever NARROWS toward the claim's own label, never widens past it.
//   - verified: truth_status has six values (verified_true, verified_false,
//     partially_supported, conflicted, unverified, outdated). ONLY
//     "verified_true" genuinely supports verified:true; every other status maps
//     to verified:false. A CONTESTED claim (see below) is forced verified:false
//     regardless — the ledger status alone never overrides a live contradiction.
//   - contested (contradictions present on the current claim): the entry is
//     INCLUDED, not excluded — mirroring the S2 doctrine that a contradiction
//     is linkage, not a verdict, and never blocks resolution. Honesty is
//     preserved by carrying it as verified:false and a LOWERED relevance (0 vs
//     1 for an uncontested current claim). relevance here is NOT a
//     query-similarity score (a pure mapper has none); it is the only
//     port-surviving numeric channel to annotate contested-vs-clean, so it is
//     used exactly and only for that.
//   - current / resolvable: an included entry is current by construction
//     (current_claim_id === ref) and resolvable by construction (it resolved
//     through S1), so both are honestly true.
//   - provenance.origin = "knowledge-ledger"; retrieved_at = one server instant
//     from the injected now() clock (single call per projection → deterministic).
//     content_hash: absent from the knowledge-claim schema, so carried ONLY when
//     a claim happens to expose a valid 64-lowercase-hex content_hash.

const KNOWLEDGE_KIND = "knowledge";
const PROVIDER_STAGE = "knowledge-provider";
const PROVENANCE_ORIGIN = "knowledge-ledger";
// Honest default for schema-classless knowledge (see header). Kept as a private
// constant, never widened here.
const DEFAULT_KNOWLEDGE_CLASSIFICATION = "INTERNAL";
const VALID_CLASSIFICATIONS = Object.freeze(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"]);
const CONTENT_HASH_RE = /^[a-f0-9]{64}$/;
const RESERVED_ID_DELIMITERS = Object.freeze(["|", "@"]);

// Relevance annotation channel (see header): clean current claim vs contested.
const RELEVANCE_CLEAN = 1;
const RELEVANCE_CONTESTED = 0;

const QUERY_KEYS = Object.freeze(["project_id", "refs"]);

const EXCLUSION_REASONS = Object.freeze(["KNOWLEDGE_UNRESOLVED", "CURRENT_SUPERSEDED", "LINEAGE_BROKEN"]);

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isBlank = (value) => typeof value !== "string" || value.trim() === "";
const reservedDelimiter = (value) =>
  typeof value === "string" ? RESERVED_ID_DELIMITERS.find((d) => value.includes(d)) ?? null : null;

export class KnowledgeCandidateProviderConfigurationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "KnowledgeCandidateProviderConfigurationError";
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

export function createKnowledgeCandidateProvider({ claimService, linkageService, now } = {}) {
  // --- Fail-closed construction ------------------------------------------
  if (!isPlainObject(claimService) || typeof claimService.getClaim !== "function") {
    throw new KnowledgeCandidateProviderConfigurationError(
      "INVALID_CLAIM_SERVICE",
      "createKnowledgeCandidateProvider requires the S1 claim service (getClaim) as the ONLY claim read path"
    );
  }
  if (!isPlainObject(linkageService) || typeof linkageService.resolveCurrent !== "function") {
    throw new KnowledgeCandidateProviderConfigurationError(
      "INVALID_LINKAGE_SERVICE",
      "createKnowledgeCandidateProvider requires the S2 linkage service (resolveCurrent) as the currency read path"
    );
  }
  if (typeof now !== "function") {
    throw new KnowledgeCandidateProviderConfigurationError(
      "INVALID_CLOCK",
      "createKnowledgeCandidateProvider requires a now() clock function (server-derived retrieved_at)"
    );
  }

  // Server-derived instant: { iso } or null when the clock is unusable.
  function serverInstant() {
    try {
      const epochMs = Date.prototype.getTime.call(now());
      if (!Number.isFinite(epochMs)) return null;
      return { iso: new Date(epochMs).toISOString() };
    } catch {
      return null;
    }
  }

  function deny(code, reason) {
    return deepFreeze({ decision: "DENY", code, reason, data_untrusted: true });
  }

  function validateQuery(query) {
    if (!isPlainObject(query)) return { code: "DENY_MALFORMED_REQUEST", reason: "Query must be an object" };
    const unknown = Object.keys(query).filter((key) => !QUERY_KEYS.includes(key));
    if (unknown.length > 0) return { code: "DENY_MALFORMED_REQUEST", reason: `Unknown query fields: ${unknown.join(", ")}` };
    if (isBlank(query.project_id)) return { code: "DENY_MISSING_FIELDS", reason: "project_id is required" };
    if (!Array.isArray(query.refs)) return { code: "DENY_MALFORMED_REQUEST", reason: "refs must be an array" };
    for (const ref of query.refs) {
      if (isBlank(ref)) return { code: "DENY_MALFORMED_REQUEST", reason: "every ref must be a non-blank string" };
      const hit = reservedDelimiter(ref);
      if (hit) return { code: "DENY_ID_CHARSET", reason: `ref must not contain reserved delimiter '${hit}'` };
    }
    return null;
  }

  // Resolve one claim through the S1 read path. { claim } on ALLOW, or
  // { failed: <exclusion> } carrying the verbatim passthrough code.
  function resolveClaim(ref) {
    let resolution;
    try {
      resolution = claimService.getClaim({ claim_id: ref });
    } catch {
      return { failed: exclude(ref, "KNOWLEDGE_UNRESOLVED", "DENY_CLAIM_SERVICE_ERROR", "Claim read path threw") };
    }
    if (!isPlainObject(resolution) || resolution.decision !== "ALLOW" || !isPlainObject(resolution.claim)) {
      const code =
        typeof resolution?.code === "string" && resolution.code.length > 0 ? resolution.code : "DENY_CLAIM_UNRESOLVED";
      return { failed: exclude(ref, "KNOWLEDGE_UNRESOLVED", code, resolution?.reason ?? "Claim did not resolve via S1") };
    }
    return { claim: resolution.claim };
  }

  // Currency check through the S2 walk. { claim, contradictions } when the ref
  // is itself the current head; { failed } otherwise (superseded / broken /
  // unresolved current version).
  function resolveCurrency(ref) {
    let currency;
    try {
      currency = linkageService.resolveCurrent(ref);
    } catch {
      return { failed: exclude(ref, "KNOWLEDGE_UNRESOLVED", "DENY_LINKAGE_SERVICE_ERROR", "Currency walk threw") };
    }
    if (!isPlainObject(currency) || currency.decision !== "ALLOW") {
      if (currency?.code === "DENY_BROKEN_LINEAGE") {
        return {
          failed: exclude(ref, "LINEAGE_BROKEN", currency.code, currency.reason ?? "Lineage is broken", {
            lineage_issue: currency.lineage_issue ?? null
          })
        };
      }
      const code =
        typeof currency?.code === "string" && currency.code.length > 0 ? currency.code : "DENY_CURRENT_UNRESOLVED";
      return { failed: exclude(ref, "KNOWLEDGE_UNRESOLVED", code, currency?.reason ?? "Current version did not resolve") };
    }
    if (currency.current_claim_id !== ref) {
      return {
        failed: exclude(ref, "CURRENT_SUPERSEDED", null, `Superseded by ${currency.current_claim_id}`, {
          current_claim_id: currency.current_claim_id ?? null
        })
      };
    }
    return { claim: currency.claim, contradictions: Array.isArray(currency.contradictions) ? currency.contradictions : [] };
  }

  function exclude(ref, reason, code, detail, extra = {}) {
    const record = { ref, stage: PROVIDER_STAGE, reason };
    if (code !== null && code !== undefined) record.code = code;
    if (detail !== undefined) record.detail = detail;
    Object.assign(record, extra);
    return record;
  }

  // Honest projection of ONE current, resolvable claim into a port-input entry.
  function projectEntry(ref, claim, contradictions, retrievedAt) {
    const contested = contradictions.length > 0;
    const classification = VALID_CLASSIFICATIONS.includes(claim.classification)
      ? claim.classification
      : DEFAULT_KNOWLEDGE_CLASSIFICATION;
    const verified = claim.truth_status === "verified_true" && !contested;
    const provenance = { origin: PROVENANCE_ORIGIN, retrieved_at: retrievedAt };
    if (typeof claim.content_hash === "string" && CONTENT_HASH_RE.test(claim.content_hash)) {
      provenance.content_hash = claim.content_hash;
    }
    return {
      id: ref,
      kind: KNOWLEDGE_KIND,
      project_id: claim.project_id,
      classification,
      verified,
      current: true,
      resolvable: true,
      relevance: contested ? RELEVANCE_CONTESTED : RELEVANCE_CLEAN,
      provenance
    };
  }

  // Pure, deterministic projection of a knowledge query into CandidateSource
  // entries. Iterates refs in order; calls the clock once so retrieved_at is
  // uniform and the whole result is deterministic. Every ref lands in exactly
  // one of `sources` / `exclusions`; the accounting invariant is enforced.
  function toCandidateSources(query) {
    const queryError = validateQuery(query);
    if (queryError) return deny(queryError.code, queryError.reason);

    const instant = serverInstant();
    if (instant === null) return deny("DENY_CLOCK_UNAVAILABLE", "Server time source is unavailable");

    const sources = [];
    const exclusions = [];
    for (const ref of query.refs) {
      const resolved = resolveClaim(ref);
      if (resolved.failed) {
        exclusions.push(resolved.failed);
        continue;
      }
      const currency = resolveCurrency(ref);
      if (currency.failed) {
        exclusions.push(currency.failed);
        continue;
      }
      sources.push(projectEntry(ref, currency.claim, currency.contradictions, instant.iso));
    }

    return deepFreeze({
      decision: "ALLOW",
      code: "KNOWLEDGE_SOURCES_PROJECTED",
      data_untrusted: true,
      project_id: query.project_id,
      retrieved_at: instant.iso,
      sources,
      exclusions,
      accounting: {
        requested: query.refs.length,
        included: sources.length,
        excluded: exclusions.length
      }
    });
  }

  return Object.freeze({ toCandidateSources });
}

export const KNOWLEDGE_PROVIDER_STAGE = PROVIDER_STAGE;
export const KNOWLEDGE_PROVIDER_EXCLUSION_REASONS = EXCLUSION_REASONS;
