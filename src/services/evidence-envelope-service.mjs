import { canonicalFingerprint as fingerprint } from "../contracts/canonical-fingerprint.mjs";
import { validateContract } from "../contracts/contract-validator.mjs";
import { STATE_MACHINES } from "../control/state-machine.mjs";
import { checkProhibitedActors } from "../control/sod-rules.mjs";

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

// MOD-EVID S2 (R4, additive): the governed verify+accept ladder. Same
// modeling discipline as S1's seal — STATE_MACHINES.Evidence is consulted
// STRICTLY READ-ONLY for edge legality, each transition lands on the durable
// hash chain BEFORE the status flips (audit-before-effect), and any SoD or
// ledger failure denies and leaves the record untouched.
const VERIFICATION_PENDING_STATE = "VERIFICATION_PENDING";
const VERIFIED_STATE = "VERIFIED";
const ACCEPTED_STATE = "ACCEPTED";
const QUARANTINED_STATE = "QUARANTINED";
const VERIFICATION_REQUEST_ENTRY_TYPE = "EVIDENCE_VERIFICATION_REQUEST";
const VERIFICATION_ENTRY_TYPE = "EVIDENCE_VERIFICATION";
const ACCEPTANCE_ENTRY_TYPE = "EVIDENCE_ACCEPTANCE";
// verdict -> ladder target. Both targets are edges the canonical Evidence
// machine already defines out of VERIFICATION_PENDING; any other verdict is
// denied deny-by-default. Failed verification lands on QUARANTINED (a defined
// VERIFICATION_PENDING edge), never a forged skip.
const VERDICT_TARGETS = Object.freeze({ pass: VERIFIED_STATE, fail: QUARANTINED_STATE });
// SoD (config-only, zero sod-rules edits): the verifier may not be the
// producer, expressed as an inline prohibited-actor ladder handed to the
// shared kernel primitive. The acceptor exclusion reuses sod-rules' own frozen
// AUTHORIZE_TIME_LADDER.EVIDENCE_ACCEPTOR (producer/reviewer/qa/evidenceVerifier)
// via checkProhibitedActors' default ladder.
const EVIDENCE_VERIFIER_LADDER = Object.freeze({ EVIDENCE_VERIFIER: Object.freeze(["producer"]) });

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
      // MOD-EVID S2 ladder lifecycle (additive; null until the edge is taken).
      verificationRequestedAt: record.verificationRequestedAt ?? null,
      verificationRequestedBy: record.verificationRequestedBy ?? null,
      verifiedAt: record.verifiedAt ?? null,
      verifierActorId: record.verifierActorId ?? null,
      verdict: record.verdict ?? null,
      acceptedAt: record.acceptedAt ?? null,
      acceptorActorId: record.acceptorActorId ?? null,
      approvals: record.approvals ? [...record.approvals] : null,
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

    // MOD-EVID S2: ladder coverage — every stored verify/accept receipt must
    // be backed by a chain-valid ledger entry whose envelope content matches
    // the registered envelope byte-for-byte (the seal discipline above, now
    // extended over the verification-request / verification / acceptance
    // entries). A truncated or swapped chain that drops a ladder receipt is
    // caught here even when the surviving chain self-verifies.
    const lineByRecordHash = new Map(records.map((line) => [line.recordHash, line]));
    const verifiedVersions = [];
    const acceptedVersions = [];
    const quarantinedVersions = [];
    for (const record of versions) {
      const receipts = [
        [record.verificationRequestLedger, "verification-request"],
        [record.verificationLedger, "verification"],
        [record.acceptanceLedger, "acceptance"]
      ];
      for (const [receipt, label] of receipts) {
        if (!receipt) continue;
        const line = lineByRecordHash.get(receipt.recordHash);
        const backedEnvelope = line?.entry?.payload?.envelope;
        if (!line || backedEnvelope?.evidence_id !== evidenceId || backedEnvelope?.version !== record.envelope.version) {
          deny("DENY_CHAIN_BROKEN", `Ladder ${label} entry for ${evidenceId} v${record.envelope.version} is missing from the chain`);
        }
        if (fingerprint(line.entry.payload.envelope) !== fingerprint(record.envelope)) {
          deny("DENY_CHAIN_BROKEN", `Ladder ${label} entry for ${evidenceId} v${record.envelope.version} does not match the registered envelope`);
        }
      }
      if (record.status === VERIFIED_STATE || record.status === ACCEPTED_STATE) verifiedVersions.push(record.envelope.version);
      if (record.status === ACCEPTED_STATE) acceptedVersions.push(record.envelope.version);
      if (record.status === QUARANTINED_STATE) quarantinedVersions.push(record.envelope.version);
    }

    return frozenClone({
      valid: true,
      evidenceId,
      registeredVersions: versions.map((record) => record.envelope.version).sort((a, b) => a - b),
      sealedVersions: sealedVersions.sort((a, b) => a - b),
      verifiedVersions: verifiedVersions.sort((a, b) => a - b),
      acceptedVersions: acceptedVersions.sort((a, b) => a - b),
      quarantinedVersions: quarantinedVersions.sort((a, b) => a - b),
      ledger: { count: head.count, headHash: head.headHash }
    });
  }

  // ---- MOD-EVID S2: governed verify + accept ladder (R4, additive) --------

  // SEALED -> VERIFICATION_PENDING. Opens the verification window; carries no
  // independence-bearing role, so no SoD gate (requesting is not verifying).
  requestVerification(evidenceId, version, requester) {
    this.#assertIdentity(evidenceId, version);
    if (isBlank(requester)) deny("DENY_MALFORMED_REQUEST", "requester must be a non-blank string");
    const record = this.#requireRecord(evidenceId, version);

    // VERIFICATION_PENDING is reachable ONLY from SEALED, so the read-only
    // edge check alone rejects every skip/replay source (CAPTURED, VERIFIED…).
    this.#assertEdge(record.status, VERIFICATION_PENDING_STATE);

    const timestamp = this.#now().toISOString();
    const appended = this.#appendLadder({
      evidenceId, version, record,
      marker: "VERIFICATION_REQUEST",
      type: VERIFICATION_REQUEST_ENTRY_TYPE,
      previousStatus: record.status,
      nextStatus: VERIFICATION_PENDING_STATE,
      actorId: requester,
      timestamp,
      extra: { requested_by: requester }
    });

    record.status = VERIFICATION_PENDING_STATE;
    record.verificationRequestedAt = timestamp;
    record.verificationRequestedBy = requester;
    record.verificationRequestLedger = { sequence: appended.sequence, recordHash: appended.recordHash };

    return frozenClone({
      evidenceId, version,
      verificationStatus: VERIFICATION_PENDING_STATE,
      requestedBy: requester,
      requestedAt: timestamp,
      ledgerSequence: appended.sequence,
      ledgerRecordHash: appended.recordHash,
      replayed: appended.replayed === true
    });
  }

  // VERIFICATION_PENDING -> VERIFIED (pass) or QUARANTINED (fail). SoD: the
  // verifier may not be the evidence producer.
  recordVerification(evidenceId, version, verifier, verdict) {
    this.#assertIdentity(evidenceId, version);
    if (isBlank(verifier)) deny("DENY_MALFORMED_REQUEST", "verifier must be a non-blank string");
    const target = typeof verdict === "string" ? VERDICT_TARGETS[verdict] : undefined;
    if (!target) deny("DENY_MALFORMED_REQUEST", `verdict must be one of: ${Object.keys(VERDICT_TARGETS).join(", ")}`);
    const record = this.#requireRecord(evidenceId, version);

    // Source guard: QUARANTINED is reachable from several states, so the
    // target-edge check alone is insufficient — pin the source to
    // VERIFICATION_PENDING so a fail verdict cannot quarantine straight from
    // SEALED (a ladder skip).
    if (record.status !== VERIFICATION_PENDING_STATE) {
      deny("DENY_UNDEFINED_TRANSITION", `recordVerification requires status ${VERIFICATION_PENDING_STATE}; current ${record.status}`);
    }
    this.#assertEdge(VERIFICATION_PENDING_STATE, target);

    // SoD (config-only): verifier != producer via inline prohibited-actor ladder.
    const producer = record.envelope.actor_id;
    const sod = checkProhibitedActors("EVIDENCE_VERIFIER", verifier, { producer }, {
      ladder: EVIDENCE_VERIFIER_LADDER,
      code: "DENY_VERIFIER_IS_PRODUCER"
    });
    if (!sod.ok) deny(sod.code, sod.message);

    const timestamp = this.#now().toISOString();
    const appended = this.#appendLadder({
      evidenceId, version, record,
      marker: "VERIFICATION",
      type: VERIFICATION_ENTRY_TYPE,
      previousStatus: record.status,
      nextStatus: target,
      actorId: verifier,
      timestamp,
      extra: { verifier, verdict, producer }
    });

    record.status = target;
    record.verifiedAt = timestamp;
    record.verifierActorId = verifier;
    record.verdict = verdict;
    record.verificationLedger = { sequence: appended.sequence, recordHash: appended.recordHash };

    return frozenClone({
      evidenceId, version,
      verificationStatus: target,
      verdict,
      verifier,
      verifiedAt: timestamp,
      ledgerSequence: appended.sequence,
      ledgerRecordHash: appended.recordHash,
      replayed: appended.replayed === true
    });
  }

  // VERIFIED -> ACCEPTED. SoD: the acceptor may not be the producer nor the
  // recorded verifier (sod-rules' frozen EVIDENCE_ACCEPTOR ladder). Acceptance
  // must be backed by at least one governance approval.
  acceptEvidence(evidenceId, version, acceptor, approvals) {
    this.#assertIdentity(evidenceId, version);
    if (isBlank(acceptor)) deny("DENY_MALFORMED_REQUEST", "acceptor must be a non-blank string");
    if (!Array.isArray(approvals) || approvals.length === 0 || approvals.some(isBlank)) {
      deny("DENY_MALFORMED_REQUEST", "approvals must be a non-empty array of non-blank strings");
    }
    const record = this.#requireRecord(evidenceId, version);

    // ACCEPTED is reachable only from VERIFIED; the source guard + read-only
    // edge check reject accept-before-verify and re-accept alike.
    if (record.status !== VERIFIED_STATE) {
      deny("DENY_UNDEFINED_TRANSITION", `acceptEvidence requires status ${VERIFIED_STATE}; current ${record.status}`);
    }
    this.#assertEdge(VERIFIED_STATE, ACCEPTED_STATE);

    // SoD (config-only): acceptor != producer AND acceptor != verifier via
    // sod-rules' default AUTHORIZE_TIME_LADDER.EVIDENCE_ACCEPTOR exclusion.
    const producer = record.envelope.actor_id;
    const sod = checkProhibitedActors("EVIDENCE_ACCEPTOR", acceptor, {
      producer,
      evidenceVerifier: record.verifierActorId
    });
    if (!sod.ok) deny(sod.code, sod.message);

    const approvalList = [...approvals];
    const timestamp = this.#now().toISOString();
    const appended = this.#appendLadder({
      evidenceId, version, record,
      marker: "ACCEPTANCE",
      type: ACCEPTANCE_ENTRY_TYPE,
      previousStatus: record.status,
      nextStatus: ACCEPTED_STATE,
      actorId: acceptor,
      timestamp,
      extra: { acceptor, approvals: approvalList, producer, verifier: record.verifierActorId }
    });

    record.status = ACCEPTED_STATE;
    record.acceptedAt = timestamp;
    record.acceptorActorId = acceptor;
    record.approvals = Object.freeze(approvalList);
    record.acceptanceLedger = { sequence: appended.sequence, recordHash: appended.recordHash };

    return frozenClone({
      evidenceId, version,
      verificationStatus: ACCEPTED_STATE,
      acceptor,
      approvals: approvalList,
      acceptedAt: timestamp,
      ledgerSequence: appended.sequence,
      ledgerRecordHash: appended.recordHash,
      replayed: appended.replayed === true
    });
  }

  // Read-only honest status the ladder makes meaningful. NOT the S3 resolver:
  // it does not re-derive ladder completeness, resolve refs, or gate
  // decision/temporal binding — it reports the current lifecycle status only.
  resolveAcceptedStatus(evidenceId, version) {
    this.#assertIdentity(evidenceId, version);
    const record = this.#requireRecord(evidenceId, version);
    return frozenClone({
      evidenceId,
      version,
      accepted: record.status === ACCEPTED_STATE,
      status: record.status
    });
  }

  // ---- MOD-EVID S3 (R3, additive): accepted-evidence resolver -------------
  //
  // Closes G5 (evidence -> decision/knowledge linkage): a citing ref no longer
  // binds to nothing. resolveAccepted(ref) resolves a bare evidence_id to its
  // ACCEPTED, chain-verified envelope in the EXACT port shape the two existing
  // consumers already speak — so the same object binds both:
  //   (a) knowledge-claim-service's injected `evidenceResolver` port:
  //         resolveAccepted(ref) -> { ok: true, envelope } | { ok: false, ... }
  //   (b) temporal-ledgers KnowledgeLedger's `evidenceLookup(ref)` via
  //       toEvidenceLookup(): (ref) -> envelope | undefined, where the ledger
  //       identity-binds `envelope.evidence_id === ref` and requires
  //       verification_status ∈ {VERIFIED, ACCEPTED}.
  //
  // REF FORMAT (documented honestly from what exists, NOT invented):
  //   ref === the bare `evidence_id`. This is FORCED, not chosen:
  //   temporal-ledgers.mjs identity-binds `evidence.evidence_id !== ref`
  //   against an envelope whose `evidence_id` is bare (no version), and
  //   knowledgeClaim.evidence_refs are plain non-empty strings. The SAME ref
  //   string flows to BOTH the port and the ledger lookup, so an
  //   `evidence_id@version` ref could never satisfy the existing bare-id
  //   identity binding — it is therefore rejected as unresolvable, not parsed.
  //   Version disambiguation is internal: among a ref's ACCEPTED versions the
  //   resolver binds the highest (latest accepted); a bare id never resolves to
  //   a superseded/older envelope while a newer accepted one exists.
  //
  // LIVE-STATUS PROJECTION (essential correctness point): the registered
  // envelope content is immutable and keeps its registration-time
  // verification_status (CAPTURED) forever — the authoritative lifecycle status
  // lives on the service record. The resolver therefore returns the stored
  // envelope with its verification_status PROJECTED to the live ACCEPTED status,
  // so the ledger's ACCEPTED_EVIDENCE_STATUSES check reads the true state, not
  // the frozen entry marker.
  //
  // Fail-closed & non-throwing (port discipline): resolveAccepted RETURNS a
  // structured deny — never throws — so a resolver fault can only deny a
  // citation, never crash the citing pipeline. Deny vocabulary is exactly:
  //   DENY_UNKNOWN_EVIDENCE  — ref blank/non-string or no such registered id
  //   DENY_NOT_ACCEPTED      — id exists but no ACCEPTED version (carries the
  //                            actual current status of the latest version)
  //   DENY_CHAIN_BROKEN      — the accepted envelope fails verifyChain
  resolveAccepted(ref) {
    if (isBlank(ref)) {
      return frozenClone({ ok: false, code: "DENY_UNKNOWN_EVIDENCE", reason: "Evidence ref must be a non-blank evidence_id string" });
    }

    // Bind by bare evidence_id (the only shape the ledger identity-binds).
    const matches = [];
    for (const record of this.#records.values()) {
      if (record.envelope.evidence_id === ref) matches.push(record);
    }
    if (matches.length === 0) {
      return frozenClone({ ok: false, code: "DENY_UNKNOWN_EVIDENCE", reason: `No registered evidence for ref: ${ref}`, evidenceId: ref });
    }

    // Latest-first ordering; disambiguate to the highest ACCEPTED version.
    matches.sort((a, b) => b.envelope.version - a.envelope.version);
    const accepted = matches.find((record) => record.status === ACCEPTED_STATE);
    if (!accepted) {
      const latest = matches[0];
      return frozenClone({
        ok: false,
        code: "DENY_NOT_ACCEPTED",
        reason: `Evidence ${ref} is not ACCEPTED (latest version ${latest.envelope.version} is ${latest.status})`,
        evidenceId: ref,
        version: latest.envelope.version,
        status: latest.status
      });
    }

    // Chain integrity: the accepted envelope must chain-verify green. verifyChain
    // re-verifies the full durable chain and every ladder receipt for this id;
    // any tamper/truncation throws and is converted to a structured deny.
    try {
      this.verifyChain(ref);
    } catch (error) {
      return frozenClone({
        ok: false,
        code: "DENY_CHAIN_BROKEN",
        reason: `Evidence ${ref} v${accepted.envelope.version} failed chain verification: ${error?.message ?? error}`,
        evidenceId: ref,
        version: accepted.envelope.version
      });
    }

    // Success: the bound envelope with its live ACCEPTED status projected on
    // (evidence_id === ref, verification_status === ACCEPTED). Frozen so no
    // consumer can mutate the resolved evidence.
    const envelope = frozenClone({ ...structuredClone(accepted.envelope), verification_status: ACCEPTED_STATE });
    return frozenClone({ ok: true, envelope, evidenceId: ref, version: accepted.envelope.version });
  }

  // temporal-ledgers-compatible adapter: returns the exact function shape
  // KnowledgeLedger's `evidenceLookup` consumes — (ref) -> envelope | undefined.
  // Single source of truth: it delegates to resolveAccepted, returning the
  // bound accepted envelope on success and a falsy value on any deny (the
  // ledger converts falsy to its verbatim DENY_EVIDENCE_CHAIN boundary).
  toEvidenceLookup() {
    return (ref) => {
      const resolution = this.resolveAccepted(ref);
      return resolution.ok === true ? resolution.envelope : undefined;
    };
  }

  // ---- shared internals for the S2 ladder ---------------------------------

  #assertIdentity(evidenceId, version) {
    if (isBlank(evidenceId)) deny("DENY_MALFORMED_REQUEST", "evidenceId must be a non-blank string");
    if (!Number.isInteger(version) || version < 1) deny("DENY_MALFORMED_REQUEST", "version must be a positive integer");
  }

  #requireRecord(evidenceId, version) {
    const record = this.#records.get(recordKey(evidenceId, version));
    if (!record) deny("DENY_UNKNOWN_EVIDENCE", `Evidence not registered: ${evidenceId} v${version}`);
    return record;
  }

  #assertEdge(from, to) {
    if (!EVIDENCE_MACHINE[from]?.includes(to)) {
      deny("DENY_UNDEFINED_TRANSITION", `Evidence cannot transition from ${from} to ${to}`);
    }
  }

  // Audit-before-effect ledger append shared by every ladder edge: the entry
  // must land on the durable hash chain before the caller flips any status.
  #appendLadder({ evidenceId, version, record, marker, type, previousStatus, nextStatus, actorId, timestamp, extra = {} }) {
    const entry = {
      entryId: JSON.stringify([evidenceId, version, marker]),
      projectId: record.envelope.project_id,
      workPackageId: record.envelope.work_package_id,
      sessionId: record.envelope.session_id,
      actorId,
      type,
      payload: {
        envelope: structuredClone(record.envelope),
        previous_status: previousStatus,
        next_status: nextStatus,
        content_hash: record.envelope.content_hash,
        ...extra
      },
      timestamp,
      idempotencyKey: JSON.stringify([marker, evidenceId, version])
    };
    try {
      const expectedSequence = this.#ledger.read().length;
      return this.#ledger.append(entry, { expectedSequence });
    } catch (error) {
      if (["LEDGER_INTEGRITY_FAILURE", "LEDGER_CORRUPT"].includes(error?.code)) {
        deny("DENY_CHAIN_BROKEN", `Durable ledger chain is broken; transition refused: ${error.message}`);
      }
      deny("DENY_LEDGER_APPEND", `Durable ledger append failed; transition refused: ${error?.message ?? error}`);
    }
  }
}
