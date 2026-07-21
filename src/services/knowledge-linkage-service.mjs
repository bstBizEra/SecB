// MOD-KNOW Slice S2 — Supersession + contradiction SIDECAR linkage records, UNWIRED.
//
// Assessment: docs/03-project-control/candidates/mod-know-gap-assessment-001.md
// (bst/mod-know-assessment @ 3ddfe41). This module closes G3 (no contradiction
// primitives) and G4 (no supersession semantics) with SIDECAR relation records:
// SUPERSEDES / CONTRADICTS assertions are appended as their OWN audit-first
// entries in an injected sidecar ledger (same DurableLedger pattern), NEVER as
// new fields on the closed knowledge-claim schema and NEVER as a mutation of
// either linked claim. Rationale (assessment section 3, S2): mutating
// knowledge-claim.schema.json is an R3 contract change (G7); sidecar records
// keep S2 at R2. The knowledge-claim schema, temporal-ledgers.mjs and
// sod-rules.mjs remain byte-identical to base — guarded by test.
//
// Placement: a SIBLING of the S1 facade (src/services/knowledge-claim-service
// .mjs) rather than an extension of it. S1 is ratified on main (PR #17);
// keeping its file byte-stable proves wrap-not-modify at the S1 layer too and
// keeps the eventual fold clean. S2 composes OVER S1: both linked claims must
// resolve through the S1 read path (getClaim), whose ledger passthrough
// denials (DENY_UNKNOWN_CLAIM, DENY_TEMPORAL_BOUNDARY, ...) surface VERBATIM
// here — never pre-empted, never re-coded.
//
// Honest P0 bar (assessment G3): REGISTRATION + LINKAGE ONLY. This module
// performs no semantic or NLP contradiction detection; a contradiction record
// is an asserted, approved linkage between two resolvable claims with a
// human-supplied basis note — nothing more.
//
// Assertion SoD — derivation from docs/15-knowledge/02-evidence-knowledge-skill.md:
// the pipeline stage "Knowledge review -> Approved knowledge claim" and the
// claim-contract field "approver and admission decision" are the doctrine's
// only actor rule. A supersession (and a contradiction registration) changes
// which knowledge counts as approved-and-current, so it carries the same
// admission-class rule the S1 facade mirrored for proposals: the asserter may
// not approve their own assertion — asserter, approver (and reviewer, when
// present) must be pairwise-distinct. Enforced by REUSING the kernel primitive
// sod-rules.checkPairwiseDistinct CONFIG-ONLY (actor set + deny code supplied
// here; zero changes to sod-rules.mjs exported behavior).
//
// resolveCurrent is READ-ONLY: it walks effective supersession sidecar records
// to answer "which claim version wins at instant T", deterministically.
// Temporal-query semantics (temporal-ledgers consumer note): a caller-supplied
// `at` selects WHICH ASSERTIONS are effective for the walk — it is a query
// instant, not an enforcement clock, and it defaults to the trusted
// server-derived instant. The WINNING claim itself is then resolved through
// the S1 read path (which enforces at the trusted server instant), so a
// forged `at` can never resurrect an expired or unknown claim. Broken lineage
// (branched or cyclic) yields a structured DENY_BROKEN_LINEAGE — never a
// throw. Contradicted-but-not-superseded claims still resolve, carrying a
// frozen contradictions[] annotation. All outputs are frozen and marked
// data_untrusted; deny-by-default throughout.

const SUPERSESSION_KEYS = Object.freeze([
  "newClaimRef",
  "supersededClaimRef",
  "authorization",
  "idempotencyKey",
  "expectedSequence"
]);
const CONTRADICTION_KEYS = Object.freeze([
  "claimRefA",
  "claimRefB",
  "basisNote",
  "authorization",
  "idempotencyKey",
  "expectedSequence"
]);
const AUTHORIZATION_KEYS = Object.freeze(["asserter", "approver", "reviewer"]);
const RESOLVE_OPTION_KEYS = Object.freeze(["at"]);

const SUPERSESSION_TYPE = "KNOWLEDGE_SUPERSESSION";
const CONTRADICTION_TYPE = "KNOWLEDGE_CONTRADICTION";

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isBlank = (value) => typeof value !== "string" || value.trim() === "";

export class KnowledgeLinkageConfigurationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "KnowledgeLinkageConfigurationError";
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

export function createKnowledgeLinkageService({ claimService, sidecarLedger, sodRules, now, auditWriter } = {}) {
  // --- Fail-closed construction ------------------------------------------
  if (!isPlainObject(claimService) || typeof claimService.getClaim !== "function") {
    throw new KnowledgeLinkageConfigurationError(
      "INVALID_CLAIM_SERVICE",
      "createKnowledgeLinkageService requires the S1 claim service (getClaim) as the ONLY claim read path"
    );
  }
  if (
    !sidecarLedger ||
    typeof sidecarLedger !== "object" ||
    typeof sidecarLedger.append !== "function" ||
    typeof sidecarLedger.read !== "function"
  ) {
    throw new KnowledgeLinkageConfigurationError(
      "INVALID_SIDECAR_LEDGER",
      "sidecarLedger must expose append() and read() (injected DurableLedger-pattern sidecar writer)"
    );
  }
  if (!isPlainObject(sodRules) || typeof sodRules.checkPairwiseDistinct !== "function") {
    throw new KnowledgeLinkageConfigurationError(
      "INVALID_SOD_RULES",
      "sodRules must expose a checkPairwiseDistinct function (kernel primitive reuse, config-only)"
    );
  }
  if (typeof now !== "function") {
    throw new KnowledgeLinkageConfigurationError(
      "INVALID_CLOCK",
      "createKnowledgeLinkageService requires a now() clock function (server-derived instants)"
    );
  }
  if (typeof auditWriter !== "function") {
    throw new KnowledgeLinkageConfigurationError(
      "INVALID_AUDIT_WRITER",
      "createKnowledgeLinkageService requires an auditWriter function (audit-first linkage)"
    );
  }

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

  // --- Shared stage helpers ----------------------------------------------

  function validateAuthorization(authorization) {
    if (!isPlainObject(authorization)) {
      return { code: "DENY_MALFORMED_REQUEST", reason: "authorization must be an object" };
    }
    const unknown = Object.keys(authorization).filter((key) => !AUTHORIZATION_KEYS.includes(key));
    if (unknown.length > 0) {
      return { code: "DENY_MALFORMED_REQUEST", reason: `Unknown authorization fields: ${unknown.join(", ")}` };
    }
    const missing = ["asserter", "approver"].filter((key) => isBlank(authorization[key]));
    if (missing.length > 0) {
      return {
        code: "DENY_MISSING_FIELDS",
        reason: `Missing authorization fields: ${missing.join(", ")} (doctrine requires an approver and admission decision)`
      };
    }
    if (authorization.reviewer !== undefined && isBlank(authorization.reviewer)) {
      return { code: "DENY_MALFORMED_REQUEST", reason: "authorization.reviewer, when present, must be a non-blank string" };
    }
    return null;
  }

  function validateEnvelope(request, allowedKeys) {
    if (!isPlainObject(request)) return { code: "DENY_MALFORMED_REQUEST", reason: "Request must be an object" };
    const unknown = Object.keys(request).filter((key) => !allowedKeys.includes(key));
    if (unknown.length > 0) return { code: "DENY_MALFORMED_REQUEST", reason: `Unknown request fields: ${unknown.join(", ")}` };
    if (isBlank(request.idempotencyKey)) return { code: "DENY_MISSING_FIELDS", reason: "idempotencyKey is required" };
    if (!Number.isInteger(request.expectedSequence) || request.expectedSequence < 0) {
      return { code: "DENY_MALFORMED_REQUEST", reason: "expectedSequence must be a non-negative integer" };
    }
    return validateAuthorization(request.authorization);
  }

  // Resolve one claim through the S1 read path ONLY. An S1/ledger denial is
  // surfaced VERBATIM (its own code and reason), tagged with the failing ref.
  function resolveViaS1(ref) {
    let resolution;
    try {
      resolution = claimService.getClaim({ claim_id: ref });
    } catch {
      return { failed: deny("DENY_LEDGER_UNAVAILABLE", "Claim read path failed", { failed_ref: ref }) };
    }
    if (!isPlainObject(resolution) || resolution.decision !== "ALLOW" || !isPlainObject(resolution.claim)) {
      return {
        failed: deny(
          typeof resolution?.code === "string" && resolution.code.length > 0 ? resolution.code : "DENY_LEDGER_UNAVAILABLE",
          resolution?.reason ?? "Claim did not resolve through the S1 read path",
          { failed_ref: ref, source: resolution?.source ?? "knowledge-claim-service" }
        )
      };
    }
    return { claim: resolution.claim };
  }

  // Assertion SoD — kernel primitive, config-only (see header derivation).
  function checkAssertionSod(authorization, code) {
    const actors = [
      { role: "ASSERTER", actorId: authorization.asserter },
      { role: "APPROVER", actorId: authorization.approver }
    ];
    if (!isBlank(authorization.reviewer)) {
      actors.push({ role: "REV", actorId: authorization.reviewer });
    }
    let sodResult;
    try {
      sodResult = sodRules.checkPairwiseDistinct(actors, { code });
    } catch {
      return deny(code, "Assertion separation-of-duties check failed");
    }
    if (!sodResult || sodResult.ok !== true) {
      return deny(sodResult?.code ?? code, sodResult?.message ?? "Assertion separation-of-duties violated");
    }
    return null;
  }

  function readSidecar() {
    let rows;
    try {
      rows = sidecarLedger.read();
    } catch {
      return { failed: deny("DENY_SIDECAR_UNAVAILABLE", "Sidecar ledger read failed") };
    }
    if (!Array.isArray(rows)) return { failed: deny("DENY_SIDECAR_UNAVAILABLE", "Sidecar ledger read did not return a list") };
    return { rows };
  }

  // A usable supersession sidecar row: correct type, SUPERSEDES payload,
  // non-blank refs, parseable assertion instant. Rows failing this shape are
  // not knowledge (deny-by-default: unusable assertions bind nothing) and are
  // excluded from every walk and gate.
  function supersessionEdges(rows) {
    const edges = [];
    for (const row of rows) {
      const entry = row?.entry;
      if (!isPlainObject(entry) || entry.type !== SUPERSESSION_TYPE) continue;
      const payload = entry.payload;
      if (!isPlainObject(payload) || payload.record_type !== "SUPERSEDES") continue;
      if (isBlank(payload.new_claim_ref) || isBlank(payload.superseded_claim_ref)) continue;
      const assertedMs = Date.parse(payload.asserted_at);
      if (!Number.isFinite(assertedMs)) continue;
      edges.push({ superseded: payload.superseded_claim_ref, next: payload.new_claim_ref, assertedMs });
    }
    return edges;
  }

  function contradictionRecords(rows) {
    const records = [];
    for (const row of rows) {
      const entry = row?.entry;
      if (!isPlainObject(entry) || entry.type !== CONTRADICTION_TYPE) continue;
      const payload = entry.payload;
      if (!isPlainObject(payload) || payload.record_type !== "CONTRADICTS") continue;
      if (isBlank(payload.claim_ref_a) || isBlank(payload.claim_ref_b)) continue;
      const assertedMs = Date.parse(payload.asserted_at);
      if (!Number.isFinite(assertedMs)) continue;
      records.push({ a: payload.claim_ref_a, b: payload.claim_ref_b, basisNote: payload.basis_note ?? null, assertedMs, assertedAt: payload.asserted_at });
    }
    return records;
  }

  function toSidecarEntry({ entryId, type, claim, actorId, timestamp, idempotencyKey, payload }) {
    return {
      entryId,
      projectId: claim.project_id,
      workPackageId: claim.work_package_id,
      sessionId: claim.session_id,
      actorId,
      type,
      payload,
      timestamp,
      idempotencyKey
    };
  }

  function appendSidecar(entry, expectedSequence) {
    try {
      return { record: sidecarLedger.append(entry, { expectedSequence }) };
    } catch (error) {
      if (typeof error?.code === "string" && error.code.length > 0) {
        return { failed: deny(error.code, error.message, { source: "sidecar-ledger" }) };
      }
      return { failed: deny("DENY_SIDECAR_UNAVAILABLE", "Sidecar ledger append failed") };
    }
  }

  // --- recordSupersession --------------------------------------------------
  // Stage order (tested): 1 shape (incl. self-ref) -> 2 clock -> 3 resolve
  // BOTH claims via the S1 read path (passthrough verbatim) -> 4 scope ->
  // 5 sidecar gates (already-superseded, cyclic) -> 6 assertion SoD ->
  // 7 audit-first -> 8 sidecar append. The linked claims are NEVER mutated:
  // the only write is one appended sidecar entry.
  function recordSupersession(request) {
    // 1. Shape.
    const shapeError = validateEnvelope(request, SUPERSESSION_KEYS);
    if (shapeError) return deny(shapeError.code, shapeError.reason);
    if (isBlank(request.newClaimRef) || isBlank(request.supersededClaimRef)) {
      return deny("DENY_MISSING_FIELDS", "newClaimRef and supersededClaimRef are required");
    }
    if (request.newClaimRef === request.supersededClaimRef) {
      return deny("DENY_SELF_SUPERSESSION", "A claim cannot supersede itself");
    }

    // 2. Clock.
    const instant = serverInstant();
    if (instant === null) return deny("DENY_CLOCK_UNAVAILABLE", "Server time source is unavailable");

    // 3. Both claims must resolve via the S1 read path.
    const newClaim = resolveViaS1(request.newClaimRef);
    if (newClaim.failed) return newClaim.failed;
    const supersededClaim = resolveViaS1(request.supersededClaimRef);
    if (supersededClaim.failed) return supersededClaim.failed;

    // 4. Scope: doctrine binds claims to project scope ("project/domain
    // scope"; prohibition: nothing overrides project scope). A claim may only
    // supersede knowledge inside its own project.
    if (newClaim.claim.project_id !== supersededClaim.claim.project_id) {
      return deny("DENY_SCOPE_MISMATCH", "Supersession may not cross project scope", {
        new_project_id: newClaim.claim.project_id,
        superseded_project_id: supersededClaim.claim.project_id
      });
    }

    // 5. Sidecar gates over usable existing records: a claim has at most one
    // superseder (deny-by-default against branching), and the new edge may
    // not close a cycle.
    const sidecar = readSidecar();
    if (sidecar.failed) return sidecar.failed;
    const edges = supersessionEdges(sidecar.rows);
    if (edges.some((edge) => edge.superseded === request.supersededClaimRef)) {
      return deny("DENY_ALREADY_SUPERSEDED", `Claim already has a superseder: ${request.supersededClaimRef}`);
    }
    // Cycle gate: deny if supersededClaimRef is reachable FROM newClaimRef
    // along existing supersession edges (the new edge would close a loop).
    const successors = new Map();
    for (const edge of edges) {
      if (!successors.has(edge.superseded)) successors.set(edge.superseded, new Set());
      successors.get(edge.superseded).add(edge.next);
    }
    const queue = [request.newClaimRef];
    const seen = new Set(queue);
    while (queue.length > 0) {
      const current = queue.shift();
      for (const next of successors.get(current) ?? []) {
        if (next === request.supersededClaimRef) {
          return deny("DENY_CYCLIC_LINEAGE", "Supersession would create a cyclic lineage");
        }
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }

    // 6. Assertion SoD.
    const sodDenial = checkAssertionSod(request.authorization, "DENY_SUPERSESSION_SOD");
    if (sodDenial) return sodDenial;

    // 7. Audit-first: written BEFORE the sidecar append.
    try {
      auditWriter({
        type: "KNOWLEDGE_SUPERSESSION_AUDIT",
        new_claim_ref: request.newClaimRef,
        superseded_claim_ref: request.supersededClaimRef,
        project_id: newClaim.claim.project_id,
        asserted_at: instant.iso,
        asserter: request.authorization.asserter,
        approver: request.authorization.approver
      });
    } catch {
      return deny("DENY_AUDIT_UNAVAILABLE", "Audit ledger writer is unavailable; supersession denied before sidecar append");
    }

    // 8. Append the sidecar record. NOT a mutation of either claim.
    const payload = {
      record_type: "SUPERSEDES",
      new_claim_ref: request.newClaimRef,
      superseded_claim_ref: request.supersededClaimRef,
      project_id: newClaim.claim.project_id,
      asserter: request.authorization.asserter,
      approver: request.authorization.approver,
      asserted_at: instant.iso
    };
    if (!isBlank(request.authorization.reviewer)) payload.reviewer = request.authorization.reviewer;
    const appended = appendSidecar(
      toSidecarEntry({
        entryId: `sup:${request.supersededClaimRef}->${request.newClaimRef}`,
        type: SUPERSESSION_TYPE,
        claim: newClaim.claim,
        actorId: request.authorization.asserter,
        timestamp: instant.iso,
        idempotencyKey: request.idempotencyKey,
        payload
      }),
      request.expectedSequence
    );
    if (appended.failed) return appended.failed;

    return deepFreeze({
      decision: "ALLOW",
      code: "SUPERSESSION_RECORDED",
      asserted_at: instant.iso,
      new_claim_ref: request.newClaimRef,
      superseded_claim_ref: request.supersededClaimRef,
      sequence: appended.record?.sequence ?? null
    });
  }

  // --- recordContradiction -------------------------------------------------
  // Registration + linkage ONLY (assessment G3 honest bar): no semantic
  // detection. Symmetric: the pair is canonicalized, so A-B and B-A are the
  // SAME link and a re-registration in either order denies DENY_ALREADY_LINKED.
  function recordContradiction(request) {
    // 1. Shape.
    const shapeError = validateEnvelope(request, CONTRADICTION_KEYS);
    if (shapeError) return deny(shapeError.code, shapeError.reason);
    if (isBlank(request.claimRefA) || isBlank(request.claimRefB)) {
      return deny("DENY_MISSING_FIELDS", "claimRefA and claimRefB are required");
    }
    if (request.claimRefA === request.claimRefB) {
      return deny("DENY_SELF_CONTRADICTION", "A claim cannot contradict itself");
    }
    if (isBlank(request.basisNote)) {
      return deny("DENY_MISSING_FIELDS", "basisNote is required and must be non-blank");
    }

    // 2. Clock.
    const instant = serverInstant();
    if (instant === null) return deny("DENY_CLOCK_UNAVAILABLE", "Server time source is unavailable");

    // 3. Both claims must resolve via the S1 read path.
    const claimA = resolveViaS1(request.claimRefA);
    if (claimA.failed) return claimA.failed;
    const claimB = resolveViaS1(request.claimRefB);
    if (claimB.failed) return claimB.failed;

    // 4. Scope (same doctrine rule as supersession).
    if (claimA.claim.project_id !== claimB.claim.project_id) {
      return deny("DENY_SCOPE_MISMATCH", "Contradiction linkage may not cross project scope", {
        claim_a_project_id: claimA.claim.project_id,
        claim_b_project_id: claimB.claim.project_id
      });
    }

    // 5. Symmetric duplicate gate: set-equality over BOTH orders, so even a
    // foreign non-canonical row blocks re-linking.
    const sidecar = readSidecar();
    if (sidecar.failed) return sidecar.failed;
    const duplicate = contradictionRecords(sidecar.rows).some(
      (record) =>
        (record.a === request.claimRefA && record.b === request.claimRefB) ||
        (record.a === request.claimRefB && record.b === request.claimRefA)
    );
    if (duplicate) {
      return deny("DENY_ALREADY_LINKED", "These claims are already linked as contradictory (linkage is symmetric)");
    }

    // 6. Assertion SoD.
    const sodDenial = checkAssertionSod(request.authorization, "DENY_CONTRADICTION_SOD");
    if (sodDenial) return sodDenial;

    // Canonical order: lexicographically smaller ref first, so the stored
    // record and its entryId are identical for A-B and B-A.
    const [low, high] = [request.claimRefA, request.claimRefB].sort();

    // 7. Audit-first.
    try {
      auditWriter({
        type: "KNOWLEDGE_CONTRADICTION_AUDIT",
        claim_ref_a: low,
        claim_ref_b: high,
        project_id: claimA.claim.project_id,
        asserted_at: instant.iso,
        asserter: request.authorization.asserter,
        approver: request.authorization.approver
      });
    } catch {
      return deny("DENY_AUDIT_UNAVAILABLE", "Audit ledger writer is unavailable; contradiction denied before sidecar append");
    }

    // 8. Append the sidecar record. NOT a mutation of either claim.
    const payload = {
      record_type: "CONTRADICTS",
      claim_ref_a: low,
      claim_ref_b: high,
      basis_note: request.basisNote,
      project_id: claimA.claim.project_id,
      asserter: request.authorization.asserter,
      approver: request.authorization.approver,
      asserted_at: instant.iso
    };
    if (!isBlank(request.authorization.reviewer)) payload.reviewer = request.authorization.reviewer;
    const appended = appendSidecar(
      toSidecarEntry({
        entryId: `con:${low}|${high}`,
        type: CONTRADICTION_TYPE,
        claim: claimA.claim,
        actorId: request.authorization.asserter,
        timestamp: instant.iso,
        idempotencyKey: request.idempotencyKey,
        payload
      }),
      request.expectedSequence
    );
    if (appended.failed) return appended.failed;

    return deepFreeze({
      decision: "ALLOW",
      code: "CONTRADICTION_RECORDED",
      asserted_at: instant.iso,
      claim_ref_a: low,
      claim_ref_b: high,
      sequence: appended.record?.sequence ?? null
    });
  }

  // --- resolveCurrent (read-only) -----------------------------------------
  // Deterministic lineage walk: from lineageRef, follow supersession edges
  // whose asserted_at <= T (inclusive, mirroring valid_from inclusivity).
  // Exactly one effective successor per node is lawful; more is branched and
  // a revisit is cyclic — both structured DENY_BROKEN_LINEAGE, never a throw.
  // The winning claim resolves through the S1 read path (trusted server
  // instant); its denials pass through verbatim. Effective contradictions
  // touching the winner are annotated, frozen — contradiction never blocks
  // resolution (registration is linkage, not verdict).
  function resolveCurrent(lineageRef, options = {}) {
    if (isBlank(lineageRef)) return deny("DENY_MISSING_FIELDS", "lineageRef is required");
    if (!isPlainObject(options)) return deny("DENY_MALFORMED_REQUEST", "Options must be an object");
    const unknown = Object.keys(options).filter((key) => !RESOLVE_OPTION_KEYS.includes(key));
    if (unknown.length > 0) return deny("DENY_MALFORMED_REQUEST", `Unknown option fields: ${unknown.join(", ")}`);

    const instant = serverInstant();
    if (instant === null) return deny("DENY_CLOCK_UNAVAILABLE", "Server time source is unavailable");

    let atMs = instant.ms;
    if (options.at !== undefined) {
      atMs = Date.parse(options.at);
      if (!Number.isFinite(atMs)) return deny("DENY_INVALID_INSTANT", "Resolution instant must be a date-time");
    }
    const atIso = new Date(atMs).toISOString();

    const sidecar = readSidecar();
    if (sidecar.failed) return sidecar.failed;
    const effectiveEdges = supersessionEdges(sidecar.rows).filter((edge) => edge.assertedMs <= atMs);

    const successors = new Map();
    for (const edge of effectiveEdges) {
      if (!successors.has(edge.superseded)) successors.set(edge.superseded, new Set());
      successors.get(edge.superseded).add(edge.next);
    }

    const lineage = [lineageRef];
    const visited = new Set(lineage);
    let current = lineageRef;
    for (;;) {
      const nextSet = successors.get(current);
      if (!nextSet || nextSet.size === 0) break;
      if (nextSet.size > 1) {
        return deny("DENY_BROKEN_LINEAGE", `Lineage is branched at ${current}: a claim may have at most one effective superseder`, {
          lineage_issue: "branched",
          at: atIso
        });
      }
      const [next] = nextSet;
      if (visited.has(next)) {
        return deny("DENY_BROKEN_LINEAGE", `Lineage is cyclic at ${next}`, { lineage_issue: "cyclic", at: atIso });
      }
      visited.add(next);
      lineage.push(next);
      current = next;
    }

    // The winner must resolve via the S1 read path (trusted server instant).
    const winner = resolveViaS1(current);
    if (winner.failed) return winner.failed;

    const contradictions = contradictionRecords(sidecar.rows)
      .filter((record) => record.assertedMs <= atMs && (record.a === current || record.b === current))
      .map((record) => ({
        with_claim_ref: record.a === current ? record.b : record.a,
        basis_note: record.basisNote,
        asserted_at: record.assertedAt
      }));

    return deepFreeze({
      decision: "ALLOW",
      code: "CURRENT_RESOLVED",
      lineage_ref: lineageRef,
      current_claim_id: current,
      at: atIso,
      resolved_at: instant.iso,
      data_untrusted: true,
      lineage,
      contradictions,
      claim: structuredClone(winner.claim)
    });
  }

  return Object.freeze({ recordSupersession, recordContradiction, resolveCurrent });
}
