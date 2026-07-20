import { findReservedDelimiter } from "../contracts/reserved-delimiters.mjs";

// MOD-CONTEXT S2 (closes the INTERFACE half of gap G4, per
// docs/03-project-control/candidates/mod-context-gap-assessment-001.md
// boundary note B1): the typed CandidateSource PROVIDER PORT between
// MOD-MEM / MOD-KNOW (which own candidate sourcing) and MOD-CONTEXT (which
// owns the governed seven-stage subtractive filter). The port validates
// provider-supplied sources FAIL-CLOSED at the boundary and normalizes them
// into the exact candidate shape the existing runRetrieval pipeline
// consumes ({ref, projectId, classification, verified, current, resolvable,
// relevance}), carrying kind and provenance through untouched.
//
// R3 CANDIDATE, OPTIONAL AND ADDITIVE ONLY: nothing existing calls this
// module. The live issue/mint paths keep accepting the raw candidate array
// unchanged; a caller opts in by normalizing first and passing the returned
// canonical array as candidateSources. This port never widens anything: a
// malformed entry can only be EXCLUDED (never repaired, never upgraded).
//
// Exclusion accounting: malformed entries are NOT silently dropped and NOT
// thrown — each is recorded as a typed exclusion {ref, stage:
// "provider-port", reason: <code>, detail} whose {ref, stage, reason} core
// matches the seven-stage pipeline's exclusion entries exactly, so the
// port acts as a natural "stage 0" extension of the pipeline's subtractive
// exclusion accounting. The port checks TYPES fail-closed; the pipeline
// then judges VALUES (e.g. verified:false is well-typed here and is
// excluded by stage 4 with its own stage record).

const CLASS_ORDER = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"];
const CONTENT_HASH_RE = /^[a-f0-9]{64}$/;

// Provider-declared source kinds at the B1 boundary (candidate enum; kind
// evolution is a contract change and stays operator-gated like the rest of
// this port).
export const CANDIDATE_SOURCE_KINDS = Object.freeze([
  "memory",     // MOD-MEM scoped temporal memory layers
  "knowledge",  // MOD-KNOW approved knowledge claims
  "document",   // governed repository / doc artifacts
  "evidence",   // sealed evidence envelopes (MOD-EVID)
  "operator"    // operator-supplied references
]);

export const PORT_STAGE = "provider-port";

// Closed typed-exclusion reason codes (the port's fail-closed vocabulary).
export const PORT_EXCLUSION_REASONS = Object.freeze([
  "not-an-object",
  "unknown-field",
  "invalid-id",
  "duplicate-id",
  "invalid-kind",
  "invalid-project",
  "invalid-classification",
  "invalid-flag",
  "invalid-relevance",
  "invalid-provenance"
]);

const SOURCE_KEYS = Object.freeze([
  "id", "kind", "project_id", "classification",
  "verified", "current", "resolvable", "relevance", "provenance"
]);
const PROVENANCE_KEYS = Object.freeze(["origin", "retrieved_at", "content_hash"]);

export class CandidateSourcePortError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CandidateSourcePortError";
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

const isPlainObject = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const isBlank = (v) => typeof v !== "string" || v.trim() === "";

// Returns the typed-exclusion reason code for the first defect found in a
// single provider entry, or null when the entry is well-formed. Order is
// fixed so exclusion reasons are deterministic.
function entryDefect(entry) {
  if (!isPlainObject(entry)) return ["not-an-object", "candidate source must be a plain object"];
  const unknown = Object.keys(entry).filter((k) => !SOURCE_KEYS.includes(k));
  if (unknown.length) return ["unknown-field", `unknown field(s): ${unknown.join(", ")}`];
  if (isBlank(entry.id)) return ["invalid-id", "id must be a non-blank string"];
  const hit = findReservedDelimiter(entry.id);
  if (hit) return ["invalid-id", `id must not contain '${hit}'`];
  if (!CANDIDATE_SOURCE_KINDS.includes(entry.kind)) return ["invalid-kind", `kind must be one of: ${CANDIDATE_SOURCE_KINDS.join(", ")}`];
  if (isBlank(entry.project_id)) return ["invalid-project", "project_id must be a non-blank string"];
  if (!CLASS_ORDER.includes(entry.classification)) return ["invalid-classification", `classification must be one of: ${CLASS_ORDER.join(", ")}`];
  for (const flag of ["verified", "current", "resolvable"]) {
    if (typeof entry[flag] !== "boolean") return ["invalid-flag", `${flag} must be a boolean`];
  }
  if (entry.relevance !== undefined && (typeof entry.relevance !== "number" || !Number.isFinite(entry.relevance))) {
    return ["invalid-relevance", "relevance must be a finite number when present"];
  }
  const p = entry.provenance;
  if (!isPlainObject(p)) return ["invalid-provenance", "provenance must be a plain object"];
  const pUnknown = Object.keys(p).filter((k) => !PROVENANCE_KEYS.includes(k));
  if (pUnknown.length) return ["invalid-provenance", `unknown provenance field(s): ${pUnknown.join(", ")}`];
  if (isBlank(p.origin)) return ["invalid-provenance", "provenance.origin must be a non-blank string"];
  if (typeof p.retrieved_at !== "string" || !Number.isFinite(Date.parse(p.retrieved_at))) {
    return ["invalid-provenance", "provenance.retrieved_at must be a parseable date-time string"];
  }
  if (p.content_hash !== undefined && (typeof p.content_hash !== "string" || !CONTENT_HASH_RE.test(p.content_hash))) {
    return ["invalid-provenance", "provenance.content_hash must be 64 lowercase hex characters when present"];
  }
  return null;
}

// Pure, deterministic port-boundary validation. Input: an array of typed
// CandidateSource entries {id, kind, project_id, classification, verified,
// current, resolvable, relevance?, provenance {origin, retrieved_at,
// content_hash?}}. Output (deep-frozen): {candidates, exclusions} where
// candidates is the canonical array runRetrieval consumes and every
// rejected entry appears exactly once in exclusions with a typed reason —
// candidates.length + exclusions.length === sources.length always.
// A non-array input is a malformed PORT call (not a malformed entry) and
// fails closed with a typed throw.
export function normalizeCandidateSources(sources) {
  if (!Array.isArray(sources)) {
    throw new CandidateSourcePortError("DENY_MALFORMED_REQUEST", "Candidate sources must be an array");
  }
  const candidates = [];
  const exclusions = [];
  const acceptedIds = new Set();
  sources.forEach((entry, index) => {
    const ref = isPlainObject(entry) && !isBlank(entry.id) ? entry.id : `#${index}`;
    const defect = entryDefect(entry)
      ?? (acceptedIds.has(entry?.id) ? ["duplicate-id", "id already accepted from an earlier entry"] : null);
    if (defect) {
      exclusions.push({ ref, stage: PORT_STAGE, reason: defect[0], detail: defect[1] });
      return;
    }
    acceptedIds.add(entry.id);
    candidates.push({
      ref: entry.id,
      projectId: entry.project_id,
      classification: entry.classification,
      verified: entry.verified,
      current: entry.current,
      resolvable: entry.resolvable,
      relevance: entry.relevance ?? 0,
      kind: entry.kind,
      provenance: {
        origin: entry.provenance.origin,
        retrieved_at: entry.provenance.retrieved_at,
        ...(entry.provenance.content_hash !== undefined ? { content_hash: entry.provenance.content_hash } : {})
      }
    });
  });
  return deepFreeze({ candidates, exclusions });
}
