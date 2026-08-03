// MOD-MEM Slice S3 — Memory CandidateSource PROVIDER + deterministic compaction
// floor, UNWIRED.
//
// Assessment: docs/03-project-control/candidates/mod-mem-gap-assessment-001.md
// (bst/mod-mem-assessment), §4 Slice S3 — "CandidateSource provider adapter +
// deterministic compaction floor (closes G3, honest part of G4)". This module
// closes the SUPPLY half of the B1 boundary that
// src/services/candidate-source-port.mjs (MOD-CONTEXT S2) defined the RECEIVE
// half of: it PROJECTS already-verified memory records into typed
// CandidateSource entries (kind "memory") shaped EXACTLY like the port's
// provider-input entry {id, kind, project_id, classification, verified,
// current, resolvable, relevance?, provenance {origin, retrieved_at,
// content_hash?}}, so a caller can hand the output straight to
// normalizeCandidateSources with ZERO port-level exclusions (shape-perfect).
//
// AUTHORIZATION (recorded in the producer-verification doc): the operator
// reclassified MOD-MEM S3 from R3 -> R2 on 2026-07-22 (operator decision via the
// coordinator's question channel), BY ANALOGY to the already-merged MOD-KNOW R2
// slice src/services/knowledge-candidate-provider.mjs. This is operator-
// authorized R2 producer work, NOT a self-authorized gate change. Only the pure,
// additive, UNWIRED slice is built here; nothing is wired into any retrieval or
// orchestrator path.
//
// PURE MAPPER, R2, ADDITIVE ONLY: nothing wires this module (zero importers).
// It holds no state, no I/O and no ledger authority; the clock is injected. It
// reads NO ledger/authority/clock-of-record/fs/network/process — its ONLY inputs
// are the already-verified memory records the caller supplies and the injected
// now() server clock. The memory-record contract (contracts/memory-record
// .schema.json, S2), S1, and S2 stay byte-identical to base. No schema is added.
//
// SUBTRACTIVE ACCOUNTING (mirrors the MOD-KNOW provider's per-ref pattern and the
// port's "stage 0" pattern): each supplied record maps to exactly one outcome —
// an INCLUDED CandidateSource entry, or an EXCLUDED typed record {ref, stage:
// "memory-provider", reason, code?, detail} whose {ref, stage, reason} core
// matches the port / pipeline exclusion entries. The invariant
// included.length + excluded.length === records.length holds always; nothing is
// silently dropped and nothing throws per-record (deny-by-default).
//
// DETERMINISTIC COMPACTION FLOOR (the honest part of G4; semantic/LLM
// summarization stays a non-goal): two subtractive stages run over the records
// that survive mapping validation and project scope, in input order:
//   1. content-hash dedup — the record's OWN content_hash (the schema's required
//      64-lowercase-hex integrity field; the codebase's standard content hash, so
//      NO new hash is invented) is the dedup key. The FIRST occurrence of a hash
//      wins; every later record carrying an already-seen hash is EXCLUDED as
//      DEDUP_DUPLICATE (detail.duplicate_of names the winner). Dedup is decided by
//      content identity ALONE and is independent of the later budget outcome.
//   2. token-budget truncation — when the query carries a positive integer
//      token_budget, records are admitted in order until the budget is exhausted;
//      the FIRST record whose token cost would overflow the remaining budget, and
//      EVERY record after it, is EXCLUDED as BUDGET_EXCEEDED (a hard tail
//      truncation, not bin-packing — deterministic and order-stable). Token cost
//      is a pure function of the record's `statement` via the injected/default
//      estimator. With no token_budget the floor performs dedup only.
//
// EXCLUSION REASONS (closed vocabulary):
//   - MEMORY_MALFORMED: the record failed the atomic-snapshot mapping validation
//     (structurally hostile, unknown/missing field, or a bad field type/enum/
//     window/charset). Carries a specific DENY_* `code`. A record can never throw
//     out of the provider — a hostile accessor/Proxy trap is contained here.
//   - MEMORY_PROJECT_MISMATCH: the record's project_id is not the query's
//     project_id (cross-project DENY by default; carries code DENY_PROJECT_SCOPE).
//   - DEDUP_DUPLICATE: the record's content_hash was already admitted by an
//     earlier record (detail.duplicate_of names the winner).
//   - BUDGET_EXCEEDED: the deterministic token budget was exhausted before this
//     record (detail carries token_cost / budget_used / token_budget).
//
// HONEST FIELD MAPPING (documented, because none of it is free):
//   - classification: carried through VERBATIM. The memory-record contract makes
//     classification a REQUIRED port-vocabulary enum (PUBLIC|INTERNAL|
//     CONFIDENTIAL|RESTRICTED), so — unlike the schema-classless knowledge claim,
//     which had to default — an honest memory mapper always has the record's own
//     label and never widens or defaults it.
//   - verified: honest report of EVIDENCE-BACKED admission (assessment §4:
//     "verified = evidence-backed admission status"). A record is verified when
//     its provenance carries a non-empty evidence_refs array. The contract
//     requires evidence_refs (minItems 1), so a schema-valid record is
//     evidence-backed and reports verified:true; the mapping is written to report
//     false honestly for any record whose evidence is absent (such a record is in
//     fact rejected upstream as MEMORY_MALFORMED, so verified:false never actually
//     reaches an included entry — the value is honest, not fabricated).
//   - current: COMPUTED at the one server instant — valid_from <= now < valid_until
//     (assessment §4: "current = within validity window at the server-derived
//     instant"). Unlike the knowledge provider (which EXCLUDES a superseded ref and
//     so every included entry is current by construction), a memory record is
//     mapped with its HONEST window verdict: an out-of-window record is INCLUDED
//     with current:false and the MOD-CONTEXT filter judges the value downstream —
//     the provider maps, it does not pre-judge currency.
//   - resolvable: true for every projected record — these are already-verified,
//     ledger-resident records the caller resolved before handing them in
//     (assessment §4: "resolvable = true for ledger-resident records").
//   - relevance: carries the record's OWN confidence (a required 0..1 number on
//     the contract). Like the knowledge provider's relevance, this is NOT a
//     query-similarity score — a pure mapper has none; it is the only port-
//     surviving numeric channel and is used exactly and only to pass the record's
//     stored confidence through honestly.
//   - provenance.origin = the record's source ledger (its `source` enum);
//     retrieved_at = one server instant from the injected now() clock (a single
//     call per projection -> uniform, deterministic); content_hash = the record's
//     required 64-hex content_hash, carried verbatim.
//
// ATOMIC-SNAPSHOT DISCIPLINE (house standard; descriptor-trap-safe variant —
// matches src/control/checkpoint-drift-comparator.mjs and
// src/security/redaction-policy.mjs): every caller-supplied record (and its
// nested provenance object and evidence_refs array) is read through a SINGLE
// Reflect.ownKeys presence snapshot plus a SINGLE [[Get]] per field. NO per-field
// Object.getOwnPropertyDescriptor probe is used, so a hostile
// getOwnPropertyDescriptor trap is never even invoked, and no field is ever read
// twice (no TOCTOU: a getter that returns different values on repeated reads
// cannot influence the decision because it is read exactly once). A custom
// prototype and any symbol own key are structurally REJECTED; a throwing
// accessor / Proxy get trap / poisoned iterator is CONTAINED in the surrounding
// try/catch and becomes MEMORY_MALFORMED, never a throw and never one value to a
// guard and another to the body. Non-finite numbers and unparseable windows are
// rejected by typed validation; every output is deep-frozen with a cycle guard.

import { findReservedDelimiter } from "../contracts/reserved-delimiters.mjs";

const MEMORY_KIND = "memory";
const PROVIDER_STAGE = "memory-provider";

// The closed memory-record key set this mapper accepts (contracts/memory-record
// .schema.json, additionalProperties:false). An own key outside this set is an
// unknown field and fails closed — the closed-record discipline, mirrored here.
const RECORD_KEYS = Object.freeze([
  "memory_record_id",
  "version",
  "project_id",
  "work_package_id",
  "session_id",
  "actor_id",
  "layer",
  "source",
  "statement",
  "classification",
  "confidence",
  "provenance",
  "valid_from",
  "valid_until",
  "access_policy",
  "retention_policy",
  "admitted_at",
  "supersedes",
  "content_hash"
]);
const PROVENANCE_KEYS = Object.freeze(["evidence_refs", "origin_record_id"]);

const VALID_CLASSIFICATIONS = Object.freeze(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"]);
const VALID_SOURCES = Object.freeze(["DecisionLedger", "KnowledgeLedger", "OutcomeLedger", "MemoryGatewayService"]);
const CONTENT_HASH_RE = /^[a-f0-9]{64}$/;

const QUERY_KEYS = Object.freeze(["project_id", "records", "token_budget"]);

const EXCLUSION_REASONS = Object.freeze([
  "MEMORY_MALFORMED",
  "MEMORY_PROJECT_MISMATCH",
  "DEDUP_DUPLICATE",
  "BUDGET_EXCEEDED"
]);

// Default deterministic token estimator: a pure, parse-free function of the
// record's statement length (a well-worn ~4-chars-per-token heuristic), floored
// at 1 so every record costs at least one token. It is deliberately NOT a real
// tokenizer — the compaction floor only needs a STABLE, order-independent cost,
// and honesty forbids claiming a fidelity this pure primitive does not have. A
// caller may inject a better estimator; it must be a pure function of the record.
const DEFAULT_CHARS_PER_TOKEN = 4;
const defaultEstimateTokens = (record) =>
  Math.max(1, Math.ceil((typeof record.statement === "string" ? record.statement.length : 0) / DEFAULT_CHARS_PER_TOKEN));

// Sentinels: compared by identity only, never emitted.
const MISSING = Symbol("memory-record-missing-field");
const NOT_ARRAY = Symbol("memory-record-not-array");

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isBlank = (value) => typeof value !== "string" || value.trim() === "";
const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

export class MemoryCandidateProviderConfigurationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MemoryCandidateProviderConfigurationError";
    this.code = code;
  }
}

// Cycle-guarded deep freeze (belt-and-braces: outputs are freshly built with no
// cycles, but the WeakSet guarantees termination against any future nesting).
function deepFreeze(value, seen = new WeakSet()) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    if (seen.has(value)) return value;
    seen.add(value);
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested, seen);
  }
  return value;
}

// --- Atomic single-read snapshot (descriptor-trap-safe) ---------------------
// ONE Reflect.ownKeys(obj) decides own-membership (prototype-smuggled keys are
// NOT own and resolve to MISSING); each allowed key is read AT MOST ONCE via a
// single [[Get]]. A custom prototype and any symbol own key reject structurally;
// an own key outside `allowedKeys` is an unknown field. Returns
//   { snap }               — a null-proto record of allowed keys (MISSING if absent)
//   { reject: <code> }     — a structural rejection code
// May THROW only on a hostile [[Get]] (contained by the caller's try/catch).
function snapshotOwn(obj, allowedKeys) {
  if (!isPlainObject(obj)) return { reject: "DENY_SNAPSHOT_MALFORMED" };
  const proto = Object.getPrototypeOf(obj);
  if (proto !== Object.prototype && proto !== null) return { reject: "DENY_SNAPSHOT_MALFORMED" };
  const own = new Set();
  for (const key of Reflect.ownKeys(obj)) {
    if (typeof key === "symbol") return { reject: "DENY_SNAPSHOT_MALFORMED" };
    if (!allowedKeys.includes(key)) return { reject: "DENY_UNKNOWN_FIELD" };
    own.add(key);
  }
  const snap = { __proto__: null };
  for (const key of allowedKeys) snap[key] = own.has(key) ? obj[key] : MISSING;
  return { snap };
}

// Single-read array snapshot (mirrors the WSPACE snapshotArray discipline):
// reads `length` once, rejects a tampered Symbol.iterator WITHOUT invoking it,
// copies each index exactly once via [[Get]]. Returns NOT_ARRAY or a fresh array.
// May throw only on a hostile length/index accessor (contained by the caller).
const ARRAY_ITERATOR = Array.prototype[Symbol.iterator];
function snapshotArray(value) {
  if (!Array.isArray(value)) return NOT_ARRAY;
  if (value[Symbol.iterator] !== ARRAY_ITERATOR) return NOT_ARRAY;
  const length = value.length;
  if (!Number.isSafeInteger(length) || length < 0) return NOT_ARRAY;
  const out = [];
  for (let index = 0; index < length; index += 1) out.push(value[index]);
  return out;
}

export function createMemoryCandidateProvider({ now, estimateTokens } = {}) {
  // --- Fail-closed construction ------------------------------------------
  if (typeof now !== "function") {
    throw new MemoryCandidateProviderConfigurationError(
      "INVALID_CLOCK",
      "createMemoryCandidateProvider requires a now() clock function (server-derived retrieved_at)"
    );
  }
  if (estimateTokens !== undefined && typeof estimateTokens !== "function") {
    throw new MemoryCandidateProviderConfigurationError(
      "INVALID_ESTIMATOR",
      "createMemoryCandidateProvider estimateTokens, when provided, must be a pure token-cost function"
    );
  }
  const tokenCost = estimateTokens ?? defaultEstimateTokens;

  // Server-derived instant: { iso, epochMs } or null when the clock is unusable.
  function serverInstant() {
    try {
      const epochMs = Date.prototype.getTime.call(now());
      if (!Number.isFinite(epochMs)) return null;
      return { iso: new Date(epochMs).toISOString(), epochMs };
    } catch {
      return null;
    }
  }

  function deny(code, reason) {
    return deepFreeze({ decision: "DENY", code, reason, data_untrusted: true });
  }

  function exclude(ref, reason, code, detail, extra = {}) {
    const record = { ref, stage: PROVIDER_STAGE, reason };
    if (code !== null && code !== undefined) record.code = code;
    if (detail !== undefined) record.detail = detail;
    Object.assign(record, extra);
    return record;
  }

  function validateQuery(query) {
    if (!isPlainObject(query)) return { code: "DENY_MALFORMED_REQUEST", reason: "Query must be an object" };
    const unknown = Object.keys(query).filter((key) => !QUERY_KEYS.includes(key));
    if (unknown.length > 0) return { code: "DENY_MALFORMED_REQUEST", reason: `Unknown query fields: ${unknown.join(", ")}` };
    if (isBlank(query.project_id)) return { code: "DENY_MISSING_FIELDS", reason: "project_id is required" };
    if (!Array.isArray(query.records)) return { code: "DENY_MALFORMED_REQUEST", reason: "records must be an array" };
    if (query.token_budget !== undefined && !(Number.isSafeInteger(query.token_budget) && query.token_budget > 0)) {
      return { code: "DENY_MALFORMED_REQUEST", reason: "token_budget, when present, must be a positive safe integer" };
    }
    return null;
  }

  // Map ONE already-verified memory record into a port-input entry, or return a
  // typed exclusion. `ref` is the best-effort id for accounting. Never throws:
  // every hostile-input path is contained and folded to MEMORY_MALFORMED.
  function projectRecord(record, index, projectId, instant) {
    let ref = `#${index}`;
    try {
      const snapResult = snapshotOwn(record, RECORD_KEYS);
      if (snapResult.reject) return { failed: exclude(ref, "MEMORY_MALFORMED", snapResult.reject, "record failed atomic snapshot") };
      const snap = snapResult.snap;

      // memory_record_id -> id (charset-guarded), and it also fixes `ref`.
      const id = snap.memory_record_id;
      if (isBlank(id)) return { failed: exclude(ref, "MEMORY_MALFORMED", "DENY_MISSING_FIELD", "memory_record_id must be a non-blank string") };
      ref = id;
      const delimiter = findReservedDelimiter(id);
      if (delimiter) return { failed: exclude(ref, "MEMORY_MALFORMED", "DENY_ID_CHARSET", `memory_record_id must not contain reserved delimiter '${delimiter}'`) };

      // project_id (consumed for scope + entry).
      if (isBlank(snap.project_id)) return { failed: exclude(ref, "MEMORY_MALFORMED", "DENY_MISSING_FIELD", "project_id must be a non-blank string") };

      // source -> provenance.origin (required enum).
      if (!VALID_SOURCES.includes(snap.source)) return { failed: exclude(ref, "MEMORY_MALFORMED", "DENY_FIELD_TYPE", "source must be a valid ledger source") };

      // classification -> carried through (required enum).
      if (!VALID_CLASSIFICATIONS.includes(snap.classification)) return { failed: exclude(ref, "MEMORY_MALFORMED", "DENY_FIELD_TYPE", "classification must be a port-vocabulary enum") };

      // confidence -> relevance (required finite 0..1).
      if (!isFiniteNumber(snap.confidence) || snap.confidence < 0 || snap.confidence > 1) {
        return { failed: exclude(ref, "MEMORY_MALFORMED", "DENY_FIELD_TYPE", "confidence must be a finite number in [0,1]") };
      }

      // statement -> token cost input (required non-blank string).
      if (isBlank(snap.statement)) return { failed: exclude(ref, "MEMORY_MALFORMED", "DENY_MISSING_FIELD", "statement must be a non-blank string") };

      // content_hash -> dedup key + provenance (required 64-hex).
      if (typeof snap.content_hash !== "string" || !CONTENT_HASH_RE.test(snap.content_hash)) {
        return { failed: exclude(ref, "MEMORY_MALFORMED", "DENY_FIELD_TYPE", "content_hash must be 64 lowercase hex characters") };
      }

      // valid_from / valid_until -> current window (required parseable date-time).
      const fromMs = Date.parse(snap.valid_from);
      const untilMs = Date.parse(snap.valid_until);
      if (!Number.isFinite(fromMs) || !Number.isFinite(untilMs)) {
        return { failed: exclude(ref, "MEMORY_MALFORMED", "DENY_FIELD_TYPE", "valid_from and valid_until must be parseable date-times") };
      }

      // provenance -> verified (nested atomic snapshot; evidence_refs required non-empty).
      const provResult = snapshotOwn(snap.provenance, PROVENANCE_KEYS);
      if (provResult.reject) return { failed: exclude(ref, "MEMORY_MALFORMED", provResult.reject, "provenance failed atomic snapshot") };
      const evidenceRefs = snapshotArray(provResult.snap.evidence_refs);
      if (evidenceRefs === NOT_ARRAY) return { failed: exclude(ref, "MEMORY_MALFORMED", "DENY_FIELD_TYPE", "provenance.evidence_refs must be an array") };
      // The contract requires evidence_refs (minItems 1); an empty or blank-bearing
      // array is contract-invalid and fails closed here. verified therefore reports
      // an honestly evidence-backed admission and is structurally true for every
      // included record — a verified:false entry can never reach the port.
      if (evidenceRefs.length === 0 || !evidenceRefs.every((entry) => !isBlank(entry))) {
        return { failed: exclude(ref, "MEMORY_MALFORMED", "DENY_FIELD_TYPE", "provenance.evidence_refs must be a non-empty array of non-blank strings") };
      }
      const evidenceBacked = true;

      const current = fromMs <= instant.epochMs && instant.epochMs < untilMs;

      const entry = {
        id,
        kind: MEMORY_KIND,
        project_id: snap.project_id,
        classification: snap.classification,
        verified: evidenceBacked,
        current,
        resolvable: true,
        relevance: snap.confidence,
        provenance: { origin: snap.source, retrieved_at: instant.iso, content_hash: snap.content_hash }
      };
      // Return the content_hash (dedup key), project_id (scope check), and a frozen
      // cost view (the record's payload fields the token estimator may consult)
      // alongside the entry, so no field is read a second time off the raw record.
      const costView = Object.freeze({
        memory_record_id: id,
        statement: snap.statement,
        content_hash: snap.content_hash,
        project_id: snap.project_id,
        classification: snap.classification,
        confidence: snap.confidence
      });
      return { entry, contentHash: snap.content_hash, projectId: snap.project_id, costView };
    } catch {
      // Hostile accessor / Proxy trap / poisoned iterator — contained, never thrown.
      return { failed: exclude(ref, "MEMORY_MALFORMED", "DENY_SNAPSHOT_MALFORMED", "record could not be safely inspected") };
    }
  }

  // Pure, deterministic projection of already-verified memory records into
  // CandidateSource entries plus the deterministic compaction floor. Iterates
  // records in order; calls the clock once so retrieved_at is uniform and the
  // whole result is deterministic. Every record lands in exactly one of
  // `sources` / `exclusions`; the accounting invariant is enforced.
  function toCandidateSources(query) {
    const queryError = validateQuery(query);
    if (queryError) return deny(queryError.code, queryError.reason);

    const instant = serverInstant();
    if (instant === null) return deny("DENY_CLOCK_UNAVAILABLE", "Server time source is unavailable");

    const records = snapshotArray(query.records);
    if (records === NOT_ARRAY) return deny("DENY_MALFORMED_REQUEST", "records must be a genuine, untampered array");

    const hasBudget = query.token_budget !== undefined;
    const budget = query.token_budget;

    const sources = [];
    const exclusions = [];
    const seenHashes = new Map(); // content_hash -> winning id
    let budgetUsed = 0;
    let budgetExhausted = false;

    for (let index = 0; index < records.length; index += 1) {
      const mapped = projectRecord(records[index], index, query.project_id, instant);
      if (mapped.failed) {
        exclusions.push(mapped.failed);
        continue;
      }

      // Project-scope: cross-project records are DENIED by default.
      if (mapped.projectId !== query.project_id) {
        exclusions.push(exclude(mapped.entry.id, "MEMORY_PROJECT_MISMATCH", "DENY_PROJECT_SCOPE", `record project ${mapped.projectId} is not query project ${query.project_id}`));
        continue;
      }

      // Compaction floor stage 1 — content-hash dedup (first occurrence wins).
      const winner = seenHashes.get(mapped.contentHash);
      if (winner !== undefined) {
        exclusions.push(exclude(mapped.entry.id, "DEDUP_DUPLICATE", null, `content_hash already admitted by ${winner}`, { duplicate_of: winner }));
        continue;
      }
      seenHashes.set(mapped.contentHash, mapped.entry.id);

      // Compaction floor stage 2 — deterministic token-budget tail truncation.
      if (hasBudget) {
        let numericCost;
        try {
          const rawCost = tokenCost(mapped.costView);
          if (!(Number.isSafeInteger(rawCost) && rawCost > 0)) throw new Error("invalid token cost");
          numericCost = rawCost;
        } catch {
          // A throwing or nonsensical estimator makes the floor untrustworthy;
          // deny-by-default rather than guess a cost. The default estimator is
          // pure and never trips this.
          return deny("DENY_ESTIMATOR_FAULT", "token estimator returned an invalid or throwing cost");
        }
        if (budgetExhausted || budgetUsed + numericCost > budget) {
          budgetExhausted = true;
          exclusions.push(exclude(mapped.entry.id, "BUDGET_EXCEEDED", null, "token budget exhausted before this record", {
            token_cost: numericCost,
            budget_used: budgetUsed,
            token_budget: budget
          }));
          continue;
        }
        budgetUsed += numericCost;
      }

      sources.push(mapped.entry);
    }

    return deepFreeze({
      decision: "ALLOW",
      code: "MEMORY_SOURCES_PROJECTED",
      data_untrusted: true,
      project_id: query.project_id,
      retrieved_at: instant.iso,
      sources,
      exclusions,
      accounting: {
        requested: records.length,
        included: sources.length,
        excluded: exclusions.length,
        ...(hasBudget ? { token_budget: budget, tokens_used: budgetUsed } : {})
      }
    });
  }

  return Object.freeze({ toCandidateSources });
}

export const MEMORY_PROVIDER_STAGE = PROVIDER_STAGE;
export const MEMORY_PROVIDER_EXCLUSION_REASONS = EXCLUSION_REASONS;
