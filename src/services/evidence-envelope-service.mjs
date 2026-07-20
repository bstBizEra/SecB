import { canonicalFingerprint as fingerprint } from "../contracts/canonical-fingerprint.mjs";
import { validateContract } from "../contracts/contract-validator.mjs";
import { STATE_MACHINES } from "../control/state-machine.mjs";

// MOD-EVID S1 (R2, additive): EvidenceEnvelopeService — register + seal.
// Closes the forge-on-entry half of the 013-class hole (MOD-EVID-ASSESS-001
// G1/G2): an envelope can no longer enter the system already carrying an
// advanced verification_status. The verify/accept ladder with SoD is S2 and
// is intentionally NOT here.
//
// SEAL-MODELING CHOICE (documented honestly): the canonical Evidence ladder
// in STATE_MACHINES.Evidence is consulted STRICTLY READ-ONLY to derive the
// entry state and to check edge legality (CAPTURED -> SEALED). The
// TransitionEngine + authority-engine path ("Evidence:*->SEALED" ->
// EVIDENCE_PRODUCER) is NOT invoked, because wiring an authority resolver
// into the evidence ladder is S2 scope (R4: authority-engine / sod-rules
// mutation). Instead, seal is modeled as this service (1) appending an
// EVIDENCE_SEAL entry to the injected DurableLedger hash chain FIRST
// (audit-before-effect: an append failure denies and leaves the record
// unsealed), then (2) recording the SEALED status on its own store. The
// ledger hash chain — not the in-memory status field — is the tamper
// evidence: verifyChain() re-verifies the chain and requires every sealed
// record to be backed by a chain-valid seal entry whose envelope content
// matches what was registered.
//
// The registered envelope content is immutable in the store; the lifecycle
// status lives on the service record. content_hash follows the repo-wide
// sealing convention (handoff-service, context-federation-service):
// sha-256 canonical fingerprint over the envelope with content_hash itself
// excluded.

const EVIDENCE_MACHINE = STATE_MACHINES.Evidence;
const REACHABLE_STATES = new Set(Object.values(EVIDENCE_MACHINE).flat());
// The ladder's start state is the unique state with no inbound edge.
const ENTRY_STATES = Object.freeze(Object.keys(EVIDENCE_MACHINE).filter((state) => !REACHABLE_STATES.has(state)));
const SEALED_STATE = "SEALED";
const SEAL_ENTRY_TYPE = "EVIDENCE_SEAL";

export class EvidenceEnvelopeServiceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "EvidenceEnvelopeServiceError";
    this.code = code;
  }
}

function deny(code, message) { throw new EvidenceEnvelopeServiceError(code, message); }

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const frozenClone = (value) => deepFreeze(structuredClone(value));
const isBlank = (value) => typeof value !== "string" || value.trim() === "";

// Delimiter-free composite key (same structural pattern as handoff-service):
// JSON.stringify of the id tuple cannot be collided by id content.
const recordKey = (evidenceId, version) => JSON.stringify([evidenceId, version]);

export class EvidenceEnvelopeService {
  #validate;
  #ledger;
  #now;
  #records = new Map();

  constructor({ schemaValidator = validateContract, durableLedger, now = () => new Date() } = {}) {
    if (typeof schemaValidator !== "function") {
      deny("DENY_CONFIG", "schemaValidator must be a function");
    }
    if (!durableLedger || ["append", "read", "verify"].some((method) => typeof durableLedger[method] !== "function")) {
      deny("DENY_CONFIG", "durableLedger with append + read + verify is required");
    }
    if (typeof now !== "function") deny("DENY_CONFIG", "now must be a function");
    if (ENTRY_STATES.length !== 1) {
      deny("DENY_CONFIG", `Evidence ladder must have exactly one entry state, found: ${ENTRY_STATES.join(", ") || "none"}`);
    }
    this.#validate = schemaValidator;
    this.#ledger = durableLedger;
    this.#now = now;
  }

  registerEnvelope(envelope) {
    if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
      deny("DENY_MALFORMED_REQUEST", "Evidence envelope must be an object");
    }

    // Schema gate first: the evidenceEnvelope contract kind must exist and
    // the candidate must satisfy it (closed object, 18 required fields).
    this.#validate("evidenceEnvelope", envelope);

    // Self-verification: recompute content_hash over the envelope with the
    // hash excluded (repo-wide convention). NOTE (honesty): the caller
    // controls both envelope and hash, so this is tamper-evidence for the
    // STORED envelope, not registration-time source authentication.
    const { content_hash, ...sealBody } = envelope;
    if (fingerprint(sealBody) !== content_hash) {
      deny("DENY_CONTENT_HASH_MISMATCH", "Envelope content_hash does not match the server recomputation");
    }

    // Forge-on-entry guard: registration admits ONLY the ladder's start
    // state. Any caller-supplied advanced status (SEALED, VERIFIED,
    // ACCEPTED, ...) is a forged lifecycle claim, not a registration.
    const [entryState] = ENTRY_STATES;
    if (envelope.verification_status !== entryState) {
      deny(
        "DENY_STATUS_FORGERY",
        `Registration requires verification_status ${entryState}; got ${envelope.verification_status}`
      );
    }

    const key = recordKey(envelope.evidence_id, envelope.version);
    if (this.#records.has(key)) {
      deny("DENY_DUPLICATE", `Evidence already registered: ${envelope.evidence_id} v${envelope.version}`);
    }

    const registeredAt = this.#now().toISOString();
    const record = {
      envelope: frozenClone(envelope),
      status: entryState,
      registeredAt,
      sealedAt: null,
      ledgerSequence: null,
      ledgerRecordHash: null
    };
    this.#records.set(key, record);

    return frozenClone({
      evidenceId: envelope.evidence_id,
      version: envelope.version,
      verificationStatus: entryState,
      contentHash: envelope.content_hash,
      registeredAt
    });
  }

  sealEnvelope(evidenceId, version) {
    if (isBlank(evidenceId)) deny("DENY_MALFORMED_REQUEST", "evidenceId must be a non-blank string");
    if (!Number.isInteger(version) || version < 1) deny("DENY_MALFORMED_REQUEST", "version must be a positive integer");

    const record = this.#records.get(recordKey(evidenceId, version));
    if (!record) deny("DENY_UNKNOWN_EVIDENCE", `Evidence not registered: ${evidenceId} v${version}`);

    // Edge legality per the canonical ladder, read-only (TE-H3 discipline:
    // an illegal edge never reaches the audit layer).
    if (!EVIDENCE_MACHINE[record.status]?.includes(SEALED_STATE)) {
      deny(
        "DENY_UNDEFINED_TRANSITION",
        `Evidence cannot transition from ${record.status} to ${SEALED_STATE}`
      );
    }

    // Audit-before-effect: the seal entry must land on the durable hash
    // chain BEFORE the status flips. Any ledger failure denies and leaves
    // the record unsealed.
    const sealedAt = this.#now().toISOString();
    const entry = {
      entryId: JSON.stringify([evidenceId, version, "SEAL"]),
      projectId: record.envelope.project_id,
      workPackageId: record.envelope.work_package_id,
      sessionId: record.envelope.session_id,
      actorId: record.envelope.actor_id,
      type: SEAL_ENTRY_TYPE,
      payload: {
        envelope: structuredClone(record.envelope),
        previous_status: record.status,
        sealed_status: SEALED_STATE,
        content_hash: record.envelope.content_hash
      },
      timestamp: sealedAt,
      idempotencyKey: JSON.stringify(["evidence-seal", evidenceId, version])
    };

    let appended;
    try {
      const expectedSequence = this.#ledger.read().length;
      appended = this.#ledger.append(entry, { expectedSequence });
    } catch (error) {
      if (["LEDGER_INTEGRITY_FAILURE", "LEDGER_CORRUPT"].includes(error?.code)) {
        deny("DENY_CHAIN_BROKEN", `Durable ledger chain is broken; seal refused: ${error.message}`);
      }
      deny("DENY_LEDGER_APPEND", `Durable ledger append failed; seal refused: ${error?.message ?? error}`);
    }

    record.status = SEALED_STATE;
    record.sealedAt = sealedAt;
    record.ledgerSequence = appended.sequence;
    record.ledgerRecordHash = appended.recordHash;

    return frozenClone({
      evidenceId,
      version,
      verificationStatus: SEALED_STATE,
      sealedAt,
      ledgerSequence: appended.sequence,
      ledgerRecordHash: appended.recordHash,
      replayed: appended.replayed === true
    });
  }

  getEnvelope(evidenceId, version) {
    if (isBlank(evidenceId)) deny("DENY_MALFORMED_REQUEST", "evidenceId must be a non-blank string");
    if (!Number.isInteger(version) || version < 1) deny("DENY_MALFORMED_REQUEST", "version must be a positive integer");
    const record = this.#records.get(recordKey(evidenceId, version));
    if (!record) deny("DENY_UNKNOWN_EVIDENCE", `Evidence not registered: ${evidenceId} v${version}`);
    return frozenClone({
      evidenceId,
      version,
      verificationStatus: record.status,
      registeredAt: record.registeredAt,
      sealedAt: record.sealedAt,
      ledgerSequence: record.ledgerSequence,
      ledgerRecordHash: record.ledgerRecordHash,
      envelope: structuredClone(record.envelope)
    });
  }

  // Read-only chain verification: re-verifies the full durable ledger hash
  // chain, then requires every SEALED version of this evidence to be backed
  // by a chain-valid EVIDENCE_SEAL entry whose envelope content matches the
  // registered envelope byte-for-byte (canonical fingerprint equality).
  verifyChain(evidenceId) {
    if (isBlank(evidenceId)) deny("DENY_MALFORMED_REQUEST", "evidenceId must be a non-blank string");

    const versions = [];
    for (const record of this.#records.values()) {
      if (record.envelope.evidence_id === evidenceId) versions.push(record);
    }
    if (versions.length === 0) deny("DENY_UNKNOWN_EVIDENCE", `Evidence not registered: ${evidenceId}`);

    let records;
    let head;
    try {
      records = this.#ledger.read();
      head = this.#ledger.verify();
    } catch (error) {
      deny("DENY_CHAIN_BROKEN", `Durable ledger chain verification failed: ${error?.message ?? error}`);
    }

    const sealEntries = records.filter(
      (line) => line.entry?.type === SEAL_ENTRY_TYPE && line.entry?.payload?.envelope?.evidence_id === evidenceId
    );

    const sealedVersions = [];
    for (const record of versions) {
      if (record.status !== SEALED_STATE) continue;
      const backing = sealEntries.find((line) => line.entry.payload.envelope.version === record.envelope.version);
      if (!backing) {
        deny("DENY_CHAIN_BROKEN", `Sealed evidence ${evidenceId} v${record.envelope.version} has no ledger seal entry`);
      }
      if (fingerprint(backing.entry.payload.envelope) !== fingerprint(record.envelope)) {
        deny("DENY_CHAIN_BROKEN", `Ledger seal entry for ${evidenceId} v${record.envelope.version} does not match the registered envelope`);
      }
      if (backing.recordHash !== record.ledgerRecordHash) {
        deny("DENY_CHAIN_BROKEN", `Ledger seal record hash for ${evidenceId} v${record.envelope.version} does not match the seal receipt`);
      }
      sealedVersions.push(record.envelope.version);
    }

    return frozenClone({
      valid: true,
      evidenceId,
      registeredVersions: versions.map((record) => record.envelope.version).sort((a, b) => a - b),
      sealedVersions: sealedVersions.sort((a, b) => a - b),
      ledger: { count: head.count, headHash: head.headHash }
    });
  }
}
