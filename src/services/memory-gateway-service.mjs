// MOD-MEM Slice S1 — Memory gateway facade, UNWIRED.
//
// Assessment: docs/03-project-control/candidates/mod-mem-gap-assessment-001.md
// (bst/mod-mem-assessment). This module closes G1 (no memory-gateway service),
// G5 (no admission SoD), and G7 (trusted-time enforcement missing) by composing
// a deny-by-default admission/retrieval pipeline IN FRONT of injected layer
// stores. It follows the MOD-GOV S3 "unwired facade" precedent
// (src/control/policy-decision-point.mjs): nothing wires this module, every
// collaborator is injected, and it holds no state, no I/O, no persistence, and
// no ledger authority of its own.
//
// Scope discipline (S1 charter):
//   - The gateway NEVER touches an existing store's admission policy. It appends
//     ONLY through the injected layer store (wrap-not-modify). The live learning
//     boundary inside KnowledgeLedger.appendClaim, sod-rules.mjs, and the
//     temporal ledgers are untouched — the gateway can only NARROW, never widen
//     (R3+ HARD LINE: no admission-policy change to existing stores).
//   - Admission SoD REUSES the kernel primitive (sod-rules.mjs
//     checkPairwiseDistinct) CONFIG-ONLY: the gateway supplies actor sets and a
//     deny code, and makes zero changes to sod-rules.mjs exported behavior.
//   - Fail-closed everywhere: malformed construction throws; malformed requests,
//     an unavailable clock, an unknown layer, a classification breach, an
//     admission SoD violation, an unavailable audit writer, and a throwing store
//     all yield structured denials with stage-specific codes. admit()/retrieve()
//     themselves never throw.
//
// Trusted-time (G7): the gateway stamps `admitted_at` on admission and supplies
// the server-derived `retrieved_at` instant on retrieval from the injected
// `now` clock — closing the temporal-ledgers consumer obligation. A caller may
// not supply the enforcement instant.
//
// TTL honesty (G4 floor): time-to-live is DATA on each layer's admission config
// (`ttlMs`). Expiry is COMPUTED at read time (admitted_at + ttlMs vs the
// server instant), never stored and never pruned — deny-on-use, consistent with
// P0-14 temporal semantics.

const LAYERS = Object.freeze(["session", "work", "project"]);
// Port classification vocabulary (candidate-source-port kind "memory").
const CLASSIFICATION_ORDER = Object.freeze(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"]);
const SOD_MODES = Object.freeze(["producer-only", "distinct-approver"]);

const RECORD_KEYS = Object.freeze(["project_id", "work_package_id", "session_id", "actor_id", "classification", "statement"]);
const REQUIRED_RECORD_KEYS = Object.freeze(["project_id", "work_package_id", "session_id", "actor_id", "classification", "statement"]);
const ADMIT_KEYS = Object.freeze(["layer", "record", "admission"]);
const ADMISSION_KEYS = Object.freeze(["producer", "reviewer", "approver"]);
const RETRIEVE_KEYS = Object.freeze(["layer", "project_id", "scope_project_id"]);

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isBlank = (value) => typeof value !== "string" || value.trim() === "";

export class MemoryGatewayConfigurationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MemoryGatewayConfigurationError";
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

function classificationRank(value) {
  return CLASSIFICATION_ORDER.indexOf(value);
}

export function createMemoryGateway({ layerStores, sodRules, now, ledgerWriter } = {}) {
  // --- Fail-closed construction ------------------------------------------
  if (!isPlainObject(layerStores) || Object.keys(layerStores).length === 0) {
    throw new MemoryGatewayConfigurationError("INVALID_LAYER_STORES", "createMemoryGateway requires a non-empty layerStores map");
  }
  for (const name of Object.keys(layerStores)) {
    if (!LAYERS.includes(name)) {
      throw new MemoryGatewayConfigurationError("INVALID_LAYER", `Unknown memory layer configured: ${name}`);
    }
    const cfg = layerStores[name];
    if (!isPlainObject(cfg) || !isPlainObject(cfg.store) || typeof cfg.store.append !== "function" || typeof cfg.store.read !== "function") {
      throw new MemoryGatewayConfigurationError("INVALID_LAYER_STORE", `Layer ${name} requires a store with append() and read() functions`);
    }
    const adm = cfg.admission;
    if (!isPlainObject(adm)) {
      throw new MemoryGatewayConfigurationError("INVALID_ADMISSION_CONFIG", `Layer ${name} requires an admission config`);
    }
    if (!CLASSIFICATION_ORDER.includes(adm.classificationCeiling)) {
      throw new MemoryGatewayConfigurationError("INVALID_ADMISSION_CONFIG", `Layer ${name} admission.classificationCeiling must be one of ${CLASSIFICATION_ORDER.join(", ")}`);
    }
    if (!Number.isInteger(adm.ttlMs) || adm.ttlMs <= 0) {
      throw new MemoryGatewayConfigurationError("INVALID_ADMISSION_CONFIG", `Layer ${name} admission.ttlMs must be a positive integer (TTL semantics as data)`);
    }
    if (!SOD_MODES.includes(adm.sod)) {
      throw new MemoryGatewayConfigurationError("INVALID_ADMISSION_CONFIG", `Layer ${name} admission.sod must be one of ${SOD_MODES.join(", ")}`);
    }
  }
  if (!isPlainObject(sodRules) || typeof sodRules.checkPairwiseDistinct !== "function") {
    throw new MemoryGatewayConfigurationError("INVALID_SOD_RULES", "sodRules must expose a checkPairwiseDistinct function (kernel primitive reuse)");
  }
  if (typeof now !== "function") {
    throw new MemoryGatewayConfigurationError("INVALID_CLOCK", "createMemoryGateway requires a now() clock function (server-derived instants)");
  }
  if (typeof ledgerWriter !== "function") {
    throw new MemoryGatewayConfigurationError("INVALID_LEDGER_WRITER", "createMemoryGateway requires a ledgerWriter function (audit-first admission)");
  }

  // Snapshot of the layer configuration: later mutation of the caller's options
  // object cannot alter admission behavior. The admission metadata is frozen;
  // the injected store reference is deliberately left untouched (freezing it
  // would freeze the store's own internal state — wrap-not-modify).
  const layers = Object.freeze(
    Object.fromEntries(
      Object.entries(layerStores).map(([name, cfg]) => [
        name,
        Object.freeze({
          store: cfg.store,
          admission: Object.freeze({
            classificationCeiling: cfg.admission.classificationCeiling,
            ttlMs: cfg.admission.ttlMs,
            sod: cfg.admission.sod
          })
        })
      ])
    )
  );

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

  function deny(code, reason) {
    return deepFreeze({ decision: "DENY", code, reason });
  }

  // --- Admission shape validation (closed envelope) ----------------------
  function validateAdmitShape(request) {
    if (!isPlainObject(request)) return { code: "DENY_MALFORMED_REQUEST", reason: "Admission request must be an object" };
    const unknown = Object.keys(request).filter((key) => !ADMIT_KEYS.includes(key));
    if (unknown.length > 0) return { code: "DENY_MALFORMED_REQUEST", reason: `Unknown request fields: ${unknown.join(", ")}` };
    if (isBlank(request.layer)) return { code: "DENY_MALFORMED_REQUEST", reason: "layer must be a non-blank string" };
    if (!isPlainObject(request.record)) return { code: "DENY_MALFORMED_REQUEST", reason: "record must be an object" };
    const unknownRecord = Object.keys(request.record).filter((key) => !RECORD_KEYS.includes(key));
    if (unknownRecord.length > 0) return { code: "DENY_MALFORMED_REQUEST", reason: `Unknown record fields: ${unknownRecord.join(", ")}` };
    const missing = REQUIRED_RECORD_KEYS.filter((key) => isBlank(request.record[key]));
    if (missing.length > 0) return { code: "DENY_MISSING_FIELDS", reason: `Missing record fields: ${missing.join(", ")}` };
    if (!isPlainObject(request.admission)) return { code: "DENY_MALFORMED_REQUEST", reason: "admission must be an object" };
    const unknownAdmission = Object.keys(request.admission).filter((key) => !ADMISSION_KEYS.includes(key));
    if (unknownAdmission.length > 0) return { code: "DENY_MALFORMED_REQUEST", reason: `Unknown admission fields: ${unknownAdmission.join(", ")}` };
    if (isBlank(request.admission.producer)) return { code: "DENY_MISSING_FIELDS", reason: "admission.producer is required" };
    for (const key of ["reviewer", "approver"]) {
      if (request.admission[key] !== undefined && isBlank(request.admission[key])) {
        return { code: "DENY_MALFORMED_REQUEST", reason: `admission.${key}, when present, must be a non-blank string` };
      }
    }
    return null;
  }

  // Deny-by-default admission pipeline. Stage order is part of the contract
  // (tested): 1 shape -> 2 clock -> 3 layer -> 4 classification ceiling ->
  // 5 admission SoD -> 6 audit-first -> 7 store append -> ADMITTED.
  function admit(request) {
    const shapeError = validateAdmitShape(request);
    if (shapeError) return deny(shapeError.code, shapeError.reason);

    // 2. Clock: server-derived instant only. A throwing/NaN clock denies.
    const instant = serverInstant();
    if (instant === null) return deny("DENY_CLOCK_UNAVAILABLE", "Server time source is unavailable");

    // 3. Layer must be a configured, known layer.
    const layer = layers[request.layer];
    if (!layer) return deny("DENY_UNKNOWN_LAYER", `Unknown or unconfigured memory layer: ${request.layer}`);

    // 4. Classification ceiling: unknown or above the layer ceiling denies.
    const rank = classificationRank(request.record.classification);
    if (rank === -1) {
      return deny("DENY_CLASSIFICATION_CEILING", `Unknown classification: ${request.record.classification}`);
    }
    if (rank > classificationRank(layer.admission.classificationCeiling)) {
      return deny(
        "DENY_CLASSIFICATION_CEILING",
        `Classification ${request.record.classification} exceeds ${request.layer} ceiling ${layer.admission.classificationCeiling}`
      );
    }

    // 5. Admission SoD — kernel primitive reuse, config-only. For the
    // distinct-approver mode (project layer): the memory's producer may not be
    // its sole approver; producer, approver (and reviewer if present) must be
    // pairwise-distinct. Lighter layers are honestly producer-only.
    if (layer.admission.sod === "distinct-approver") {
      if (isBlank(request.admission.approver)) {
        return deny("DENY_MISSING_FIELDS", `Layer ${request.layer} admission requires a distinct approver`);
      }
      const actors = [
        { role: "PRODUCER", actorId: request.admission.producer },
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
    }

    // Admitted record: the gateway stamps the trusted admitted_at instant and
    // the resolved layer. TTL is NOT stored (computed at read from layer.ttlMs).
    const admittedRecord = deepFreeze({
      project_id: request.record.project_id,
      work_package_id: request.record.work_package_id,
      session_id: request.record.session_id,
      actor_id: request.record.actor_id,
      classification: request.record.classification,
      statement: request.record.statement,
      layer: request.layer,
      admitted_at: instant.iso,
      admitted_by: request.admission.producer
    });

    // 6. Audit-first: the admission audit is written BEFORE any store mutation.
    // A throwing/unavailable audit writer denies with no store side effect.
    try {
      ledgerWriter({
        type: "MEMORY_ADMISSION_AUDIT",
        layer: request.layer,
        admitted_at: instant.iso,
        project_id: admittedRecord.project_id,
        actor_id: admittedRecord.actor_id,
        classification: admittedRecord.classification
      });
    } catch {
      return deny("DENY_AUDIT_UNAVAILABLE", "Audit ledger writer is unavailable; admission denied before store append");
    }

    // 7. Store append via the INJECTED layer store ONLY. The gateway never
    // reaches into any existing ledger's admission policy.
    let appendResult;
    try {
      appendResult = layer.store.append(admittedRecord);
    } catch {
      return deny("DENY_STORE_UNAVAILABLE", "Layer store append failed");
    }

    return deepFreeze({
      decision: "ALLOW",
      code: "ADMITTED",
      admitted_at: instant.iso,
      record: admittedRecord,
      append: appendResult ?? null
    });
  }

  // --- Retrieval shape validation ----------------------------------------
  function validateRetrieveShape(query) {
    if (!isPlainObject(query)) return { code: "DENY_MALFORMED_REQUEST", reason: "Retrieval query must be an object" };
    const unknown = Object.keys(query).filter((key) => !RETRIEVE_KEYS.includes(key));
    if (unknown.length > 0) return { code: "DENY_MALFORMED_REQUEST", reason: `Unknown query fields: ${unknown.join(", ")}` };
    const missing = RETRIEVE_KEYS.filter((key) => isBlank(query[key]));
    if (missing.length > 0) return { code: "DENY_MISSING_FIELDS", reason: `Missing query fields: ${missing.join(", ")}` };
    return null;
  }

  // Layer + project scoped reads. Cross-project access denies (no implicit
  // fallback); TTL-expired records are filtered honestly (computed, not stored);
  // surviving records are returned frozen and marked data_untrusted.
  function retrieve(query) {
    const shapeError = validateRetrieveShape(query);
    if (shapeError) return deny(shapeError.code, shapeError.reason);

    const instant = serverInstant();
    if (instant === null) return deny("DENY_CLOCK_UNAVAILABLE", "Server time source is unavailable");

    const layer = layers[query.layer];
    if (!layer) return deny("DENY_UNKNOWN_LAYER", `Unknown or unconfigured memory layer: ${query.layer}`);

    // Cross-project guard: the requested project must equal the caller's
    // authorized scope. No implicit cross-project fallback.
    if (query.project_id !== query.scope_project_id) {
      return deny("DENY_CROSS_PROJECT", `Cross-project retrieval denied: scope ${query.scope_project_id} may not read project ${query.project_id}`);
    }

    let rows;
    try {
      rows = layer.store.read();
    } catch {
      return deny("DENY_STORE_UNAVAILABLE", "Layer store read failed");
    }
    if (!Array.isArray(rows)) return deny("DENY_STORE_UNAVAILABLE", "Layer store read did not return a list");

    const records = [];
    for (const row of rows) {
      if (!isPlainObject(row)) continue;
      if (row.project_id !== query.project_id) continue; // project scoping
      if (row.layer !== query.layer) continue; // layer scoping
      const admittedMs = Date.parse(row.admitted_at);
      if (!Number.isFinite(admittedMs)) continue; // unresolvable instant -> excluded
      // TTL honesty: expired-by-computation records are filtered, never returned.
      if (instant.ms >= admittedMs + layer.admission.ttlMs) continue;
      records.push(deepFreeze({ data_untrusted: true, record: structuredClone(row) }));
    }

    return deepFreeze({
      decision: "ALLOW",
      code: "RETRIEVED",
      retrieved_at: instant.iso,
      records: Object.freeze(records)
    });
  }

  return Object.freeze({ admit, retrieve });
}
