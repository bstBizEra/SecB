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
//
// LEDGER REHYDRATION (fast-follow, second independent review of S2/S3,
// docs/03-project-control/candidates/mod-evid-s2-s3-second-independent-review-001.md,
// finding #4): #records used to start as an empty Map on every construction,
// trusting only whatever the current process happened to remember. A second
// instance pointed at the SAME ledger file (an ordinary process restart,
// redeploy, or crash recovery) therefore saw a governed, previously-ACCEPTED
// identity as unregistered -- silently defeating the DENY_DUPLICATE guard
// (registerEnvelope re-admitted the identity as fresh CAPTURED with
// attacker-controlled content) and making verifyChain() report `valid: true`
// with empty accepted/sealed arrays despite the ledger still holding the
// real history. The fix: #rehydrate() below reconstructs #records from the
// durable ledger's own SEAL/VERIFICATION_REQUEST/VERIFICATION/ACCEPTANCE
// entries at the END of construction, so the duplicate guard, status reads,
// and SoD checks are always evaluated against ledger-derived truth, never an
// empty process-lifetime Map. No other ledger-backed service in this repo
// (context-federation-service, handoff-service, work-package-service,
// goal-graph-service, knowledge-linkage-service) injects a full
// append+read+verify DurableLedger AND keeps an in-memory lifecycle
// projection over it the way this one does, so there was no existing
// rehydrate-on-construct pattern to reuse; this introduces one, scoped to
// this service.
//
// SCOPE NOTE (honest limitation, not a new gap): registerEnvelope() itself
// still does not append to the ledger -- only sealEnvelope() and the S2
// ladder methods do (audit-before-effect, unchanged by this fix). A record
// that is registered (CAPTURED) but never sealed therefore has no durable
// trace anywhere and cannot be rehydrated; after a restart it is simply
// unknown again, exactly as if it had never been registered. This is not a
// security regression: no governed lifecycle event was ever durably
// recorded for a CAPTURED-only record, so there is nothing for a restart to
// silently erase or for a forged re-registration to overwrite. Rehydration
// begins at SEALED, the first durable event in this service's lifecycle.
//
// EDGE-LEGALITY FAST-FOLLOW (independent review of the rehydration fix
// above, docs/03-project-control/candidates/
// mod-evid-s2-s3-ledger-rehydration-fix-independent-review-001.md, finding
// #4): #rehydrate() originally copied payload.sealed_status / payload.next_
// status verbatim from ledger entries with no state-machine edge-legality
// check, unlike every live ladder method below (sealEnvelope,
// requestVerification, recordVerification, acceptEvidence), which all run
// #assertEdge before accepting a transition. Since DurableLedger.append()
// only validates structural shape (see validateEntry() in
// durable-ledger.mjs), not payload semantics per entry.type, an actor with
// direct append() access -- bypassing this service's own API -- could
// forge a single EVIDENCE_SEAL entry with sealed_status: "ACCEPTED", or a
// forged EVIDENCE_VERIFICATION entry with an illegal next_status, and
// rehydrate an identity straight to ACCEPTED with no verification/
// acceptance trail. #rehydrate() now calls the SAME #assertEdge helper on
// every status-bearing entry as it folds through the ledger's chronological
// history, validating each claimed transition against the currently-
// accumulated status exactly as the live API would -- no new/separate
// check. An illegal edge denies the whole rehydration (fail-closed, this
// file's established convention), not just the offending entry.
//
// TRANSITION-GUARD CONVERGENCE (round-3 fast-follow, independent review of
// the edge-legality fix above, docs/03-project-control/candidates/
// mod-evid-s2-s3-rehydration-edge-legality-fix-independent-review-001.md,
// section 5): raw #assertEdge validates the ABSTRACT STATE_MACHINES.Evidence
// graph, but four live methods each enforce a NARROWER rule than "is this
// edge graph-legal" -- because QUARANTINED/REJECTED are graph-reachable from
// several source states (a generic "reject/supersede at any time" shape this
// service does not fully implement), while every live method that can
// produce those targets only ever does so from ONE specific source (or with
// an extra SoD/shape check #assertEdge alone cannot express). Confirmed
// exploitable in 4 variants: SEALED->QUARANTINED via a forged
// EVIDENCE_VERIFICATION with no preceding VERIFICATION_REQUEST; a forged
// EVIDENCE_SEAL claiming sealed_status QUARANTINED as the first entry; a
// forged EVIDENCE_VERIFICATION claiming next_status REJECTED (a value
// recordVerification() can never produce -- VERDICT_TARGETS only maps to
// VERIFIED/QUARANTINED); and, most severely, a forged EVIDENCE_ACCEPTANCE
// entry retroactively re-targeting an already-legitimately-ACCEPTED record
// to QUARANTINED, rewriting real governance history.
//
// FIX (approach a -- single source of truth, same pattern sod-rules.mjs's
// AUTHORIZE_TIME_LADDER already established for this repo): every ladder
// transition's FULL guard -- source-status pin, target derivation, edge
// check, and SoD check -- is now factored into one shared private method per
// transition (#assertSealTransition, #assertRequestVerificationTransition,
// #verdictTarget + #assertRecordVerificationTransition,
// #assertApprovals + #assertAcceptEvidenceTransition, all in the "shared
// internals" section below). Each live ladder method calls its own guard
// with its OWN live arguments; #rehydrate() calls the SAME guard with values
// folded from the ledger entry's payload plus the currently-accumulated
// record. There is exactly one place each transition's legality is decided,
// so a live method and rehydration can never again drift apart on how much
// of that legality they check -- closing this recursion (round 1: read the
// ledger at all; round 2: check graph edges; round 3: check the SAME rule
// the live method itself enforces, not just the graph) rather than
// point-patching the four reported variants. Two structural consequences
// worth naming explicitly: (1) for SEAL / VERIFICATION_REQUEST / ACCEPTANCE
// entries, the live method only EVER writes one hardcoded target status, so
// the shared guard independently derives that ONE literal target
// (SEALED_STATE / VERIFICATION_PENDING_STATE / ACCEPTED_STATE) and denies
// fail-closed, BEFORE the graph-edge check even runs, the instant
// payload.sealed_status / payload.next_status disagrees with it -- not
// silently substituting the correct literal and letting a forged claim
// through unremarked, and not trusting the ledger's claim verbatim either.
// (2) for VERIFICATION entries, the target is derived from payload.verdict
// via the same VERDICT_TARGETS map recordVerification() itself consults, and
// payload.next_status is cross-checked against that derived target rather
// than trusted on its own -- so a forged REJECTED/ACCEPTED next_status is
// denied even when paired with a superficially-legal verdict.
//
// ENVELOPE-ESTABLISHMENT CONVERGENCE (round-4 fast-follow, independent
// review of the round-3 convergence fix above, docs/03-project-control/
// candidates/mod-evid-s2-s3-rehydration-guard-parity-fix-independent-review-001.md,
// section 6): round 3 converged rehydration with every live method's
// TRANSITION guard, but every one of those guards only ever runs on a
// record that ALREADY EXISTS in #records. None of them cover the one
// event that CREATES a record in the first place. On the live path,
// registerEnvelope() is that creation gate -- schema validation (18
// required fields, closed object), a content_hash recomputation check,
// and a forge-on-entry check that verification_status is the ladder's
// one entry state -- and it runs BEFORE any record is ever admitted.
// registerEnvelope() itself never reaches the durable ledger (see the
// SCOPE NOTE above), so in the ledger-only world #rehydrate() replays,
// the first EVIDENCE_SEAL entry for a given (evidence_id, version) key
// is the SOLE durable proxy for that entire creation event -- yet
// #rehydrate()'s SEAL branch was, until this fix, gating that first
// sighting on nothing but "does envelope.evidence_id/version look like
// a string/integer" (see the loose pre-check below the fold's opening
// line). An actor with direct DurableLedger.append() access could
// therefore inject a single, wholly fabricated EVIDENCE_SEAL entry --
// missing most required envelope fields, an arbitrary non-matching
// content_hash, any actor_id of their choosing -- for an identity that
// was NEVER registered through registerEnvelope() at all, and it
// rehydrated as a fully legitimate SEALED record; three more
// forged-but-internally-consistent entries walked it all the way to
// ACCEPTED, with resolveAccepted() (the real S3 consumption port)
// returning ok: true for a completely fabricated record. The SoD checks
// provided no protection because the attacker also controls `producer`
// via the fabricated envelope's own actor_id -- there was no
// independently-anchored identity anywhere once the founding envelope
// itself was unverified. This is a materially different, and more
// severe, axis than the round-3 residual (which assumes the established
// envelope is trustworthy and only asks whether a LATER entry's embedded
// copy matches it): this gap is in the establishment itself.
//
// FIX (same "single source of truth" principle as round 3, applied one
// level earlier): registerEnvelope()'s full creation-time validation --
// schema gate, content_hash self-consistency, forge-on-entry check -- is
// now factored into one shared private method, #assertEnvelopeEstablishment,
// called by BOTH registerEnvelope() (its own live argument) AND
// #rehydrate()'s EVIDENCE_SEAL branch, but ONLY on true first sighting of
// a key (no existing record) -- exactly the one point at which a
// legitimate registerEnvelope() call would ever have had to occur for
// that identity to reach the ledger at all. A second EVIDENCE_SEAL entry
// for an ALREADY-established key is not re-subjected to this guard (an
// established record's envelope is immutable, exactly as on the live
// path, where registerEnvelope() can only ever be called once per key);
// it is instead denied unconditionally by #assertSealTransition, because
// STATE_MACHINES.Evidence makes SEALED reachable from CAPTURED alone --
// no already-advanced status has an edge back to SEALED -- so a forged
// re-seal attempting to swap an established envelope's content can never
// pass the pre-existing transition guard regardless of this fix.

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
    this.#rehydrate();
  }

  // Reconstructs #records from the durable ledger's own entries (see the
  // header comment's LEDGER REHYDRATION note). Runs once, at the end of
  // construction, so every instance -- the first one ever created against a
  // ledger file, or the tenth one after nine restarts -- starts from the
  // same ledger-derived truth instead of an empty Map. Read-only: never
  // appends, never mutates the ledger, and denies fail-closed (rather than
  // silently starting from a partially-rehydrated state) if the ledger
  // itself cannot be read and verified.
  //
  // EDGE-LEGALITY FIX (fast-follow, independent review of the rehydration
  // fix itself, docs/03-project-control/candidates/
  // mod-evid-s2-s3-ledger-rehydration-fix-independent-review-001.md, finding
  // #4): the fold below used to copy payload.sealed_status / payload.next_
  // status VERBATIM into record.status with no revalidation, unlike every
  // live ladder method (sealEnvelope, requestVerification, recordVerification,
  // acceptEvidence), which all run the claimed transition through
  // #assertEdge before accepting it. That let a ledger entry appended
  // directly through DurableLedger.append() (bypassing this service's own
  // API entirely -- a narrower, higher-privilege attack surface than the
  // original restart bug, but the same silent-wrong-state defect class)
  // rehydrate straight to an illegal status such as ACCEPTED with zero
  // verification/acceptance trail. The fix reuses the SAME #assertEdge
  // helper the live ladder already trusts -- no new/separate check -- and
  // calls it on every status-bearing entry as the fold walks the ledger's
  // own chronological order, so each claimed transition is validated
  // against #records' currently-accumulated status exactly as if that same
  // sequence of transitions had happened through the live API. Per this
  // file's established fail-closed convention (see DENY_CHAIN_BROKEN above),
  // an illegal edge denies the WHOLE rehydration rather than being silently
  // skipped -- skipping just the bad entry and continuing could itself
  // produce a different, equally wrong reconstructed state.
  #rehydrate() {
    let records;
    try {
      records = this.#ledger.read();
    } catch (error) {
      if (["LEDGER_INTEGRITY_FAILURE", "LEDGER_CORRUPT"].includes(error?.code)) {
        deny("DENY_CHAIN_BROKEN", `Durable ledger chain is broken; cannot rehydrate: ${error.message}`);
      }
      deny("DENY_LEDGER_REHYDRATION", `Durable ledger read failed; cannot rehydrate: ${error?.message ?? error}`);
    }

    const [entryState] = ENTRY_STATES;

    // Ledger lines are append-only and DurableLedger#verifyRecords enforces
    // strictly increasing `sequence`, so `records` (as returned by read())
    // is already in chronological append order; folding over it in order
    // reproduces exactly the same field-by-field record shape each live
    // ladder method builds when it appends, with no re-ordering needed --
    // and, per the edge-legality fix above, the same #assertEdge gate each
    // live method runs before it accepts that shape.
    for (const line of records) {
      const type = line?.entry?.type;
      const envelope = line?.entry?.payload?.envelope;
      if (!envelope || typeof envelope.evidence_id !== "string" || !Number.isInteger(envelope.version)) continue;

      const key = recordKey(envelope.evidence_id, envelope.version);
      const ledgerReceipt = { sequence: line.sequence, recordHash: line.recordHash };

      if (type === SEAL_ENTRY_TYPE) {
        // The SEAL entry is the earliest durable event for any identity, so
        // it is where the record scaffold is first created -- UNLESS a
        // record already exists for this key (a second SEAL entry for the
        // same evidence_id+version, which the live sealEnvelope() can never
        // produce: re-sealing an already-sealed-or-further record always
        // denies DENY_UNDEFINED_TRANSITION). Either way, the claimed
        // transition is asserted via the SAME shared guard sealEnvelope()
        // itself calls (#assertSealTransition) -- which, per the round-3
        // convergence fix above, denies fail-closed if payload.sealed_status
        // disagrees with the ONE literal (SEALED_STATE) sealEnvelope() can
        // ever write, rather than either trusting it verbatim (the round-2
        // gap) or silently substituting the literal and continuing.
        const existing = this.#records.get(key);

        // ENVELOPE-ESTABLISHMENT GUARD (round-4 fast-follow, see header
        // comment): on TRUE first sighting of this key (no existing
        // record), this SEAL entry's embedded envelope is the only
        // ledger-visible proxy for a legitimate registerEnvelope() call,
        // so it must pass the SAME schema/content-hash/forge-on-entry
        // guard registerEnvelope() itself calls -- BEFORE the transition
        // guard below, mirroring the live path where registration always
        // precedes sealing. An already-established key's SEAL entry
        // never re-runs this (an established envelope is immutable, same
        // as live); it is denied unconditionally by #assertSealTransition
        // instead, because SEALED has no inbound edge except from
        // CAPTURED.
        if (!existing) {
          this.#assertEnvelopeEstablishment(envelope);
        }

        const fromStatus = existing ? existing.status : entryState;
        this.#assertSealTransition(fromStatus, line.entry.payload.sealed_status);

        // registeredAt is reconstructed as this seal timestamp -- a
        // documented best-effort proxy, since registerEnvelope() itself
        // never reaches the ledger (see the SCOPE NOTE above); it is
        // informational output only and is never consulted by any guard or
        // SoD check.
        this.#records.set(key, {
          envelope: frozenClone(envelope),
          status: SEALED_STATE,
          registeredAt: existing?.registeredAt ?? line.entry.timestamp,
          sealedAt: line.entry.timestamp,
          ledgerSequence: ledgerReceipt.sequence,
          ledgerRecordHash: ledgerReceipt.recordHash
        });
      } else if (type === VERIFICATION_REQUEST_ENTRY_TYPE) {
        const record = this.#records.get(key);
        if (!record) continue; // no seal entry precedes it; unreachable on a self-consistent ledger
        // Same shared guard requestVerification() calls; denies fail-closed
        // if payload.next_status disagrees with the ONE literal
        // (VERIFICATION_PENDING_STATE) requestVerification() can ever write.
        this.#assertRequestVerificationTransition(record.status, line.entry.payload.next_status);
        record.status = VERIFICATION_PENDING_STATE;
        record.verificationRequestedAt = line.entry.timestamp;
        record.verificationRequestedBy = line.entry.payload.requested_by;
        record.verificationRequestLedger = ledgerReceipt;
      } else if (type === VERIFICATION_ENTRY_TYPE) {
        const record = this.#records.get(key);
        if (!record) continue;
        // Same shared guards recordVerification() calls: the target is
        // derived from payload.verdict via VERDICT_TARGETS and cross-checked
        // against payload.next_status (a mismatch -- e.g. verdict "pass"
        // paired with a forged next_status "REJECTED" -- denies fail-closed
        // rather than trusting either field alone); the source is pinned to
        // VERIFICATION_PENDING (not merely graph-legal); and the verifier/
        // producer SoD check is replayed using the record's own
        // ledger-established envelope actor_id as producer -- not the
        // forgeable payload.producer field.
        const verifier = line.entry.payload.verifier;
        const verdict = line.entry.payload.verdict;
        const producer = record.envelope.actor_id;
        const target = this.#verdictTarget(verdict);
        this.#assertRecordVerificationTransition({
          status: record.status,
          target,
          claimedStatus: line.entry.payload.next_status,
          verifier,
          producer
        });
        record.status = target;
        record.verifiedAt = line.entry.timestamp;
        record.verifierActorId = verifier;
        record.verdict = verdict;
        record.verificationLedger = ledgerReceipt;
      } else if (type === ACCEPTANCE_ENTRY_TYPE) {
        const record = this.#records.get(key);
        if (!record) continue;
        // Same shared guards acceptEvidence() calls: approvals shape,
        // claimedStatus checked against the ONE literal ACCEPTED_STATE
        // acceptEvidence() can ever write, source pinned to VERIFIED (so a
        // forged ACCEPTANCE entry can never retroactively re-target an
        // already-ACCEPTED record -- the round-3 review's most severe
        // finding), and the acceptor/producer/verifier SoD check replayed
        // from the record's own ledger-established fields.
        const acceptor = line.entry.payload.acceptor;
        const approvals = line.entry.payload.approvals;
        const producer = record.envelope.actor_id;
        this.#assertApprovals(approvals);
        this.#assertAcceptEvidenceTransition({
          status: record.status,
          claimedStatus: line.entry.payload.next_status,
          acceptor,
          producer,
          verifier: record.verifierActorId
        });
        record.status = ACCEPTED_STATE;
        record.acceptedAt = line.entry.timestamp;
        record.acceptorActorId = acceptor;
        record.approvals = Object.freeze([...approvals]);
        record.acceptanceLedger = ledgerReceipt;
      }
      // Any other entry type in the same ledger file is not this service's
      // concern and is skipped rather than denied -- read-only rehydration
      // must never fail closed over content it does not own.
    }
  }

  registerEnvelope(envelope) {
    if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
      deny("DENY_MALFORMED_REQUEST", "Evidence envelope must be an object");
    }

    // Full creation-time validation (schema gate, content_hash
    // self-consistency, forge-on-entry status check), shared with
    // #rehydrate()'s EVIDENCE_SEAL first-sighting branch (round-4
    // convergence fix, see header comment's "ENVELOPE-ESTABLISHMENT
    // CONVERGENCE" note).
    this.#assertEnvelopeEstablishment(envelope);

    const [entryState] = ENTRY_STATES;
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
    // an illegal edge never reaches the audit layer). Shared with
    // #rehydrate() (round-3 convergence fix, see header comment).
    this.#assertSealTransition(record.status, SEALED_STATE);

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
    // Shared with #rehydrate() (round-3 convergence fix, see header comment).
    this.#assertRequestVerificationTransition(record.status, VERIFICATION_PENDING_STATE);

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
    const target = this.#verdictTarget(verdict);
    const record = this.#requireRecord(evidenceId, version);

    // Source guard + edge + SoD, shared with #rehydrate() (round-3
    // convergence fix, see header comment): QUARANTINED is reachable from
    // several states in the abstract graph, so the target-edge check alone
    // is insufficient — pin the source to VERIFICATION_PENDING so a fail
    // verdict cannot quarantine straight from SEALED (a ladder skip).
    const producer = record.envelope.actor_id;
    this.#assertRecordVerificationTransition({ status: record.status, target, claimedStatus: target, verifier, producer });

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
    this.#assertApprovals(approvals);
    const record = this.#requireRecord(evidenceId, version);

    // Source guard + edge + SoD, shared with #rehydrate() (round-3
    // convergence fix, see header comment): ACCEPTED is reachable only from
    // VERIFIED, so pinning the source rejects accept-before-verify AND a
    // retroactive re-target of an already-ACCEPTED record alike, and the
    // acceptor != producer / acceptor != verifier SoD gate reuses sod-rules'
    // default AUTHORIZE_TIME_LADDER.EVIDENCE_ACCEPTOR exclusion.
    const producer = record.envelope.actor_id;
    this.#assertAcceptEvidenceTransition({ status: record.status, claimedStatus: ACCEPTED_STATE, acceptor, producer, verifier: record.verifierActorId });

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

  // ---- shared transition guards (round-3 convergence fix) -----------------
  //
  // Single source of truth for each ladder edge's FULL legality, not just its
  // graph-edge legality: every live ladder method below calls exactly one of
  // these with its own live arguments, and #rehydrate() calls the SAME
  // method with values folded from the ledger entry's payload plus the
  // currently-accumulated record. See the header comment's "TRANSITION-GUARD
  // CONVERGENCE" note for the full rationale. Each method either returns
  // (silently, or with the derived target status) or throws via deny() —
  // never returns a "denied" value, matching this file's fail-closed
  // convention throughout.

  // ---- shared envelope-establishment guard (round-4 convergence fix) ------
  //
  // registerEnvelope()'s full creation-time validation, factored out so
  // #rehydrate()'s EVIDENCE_SEAL first-sighting branch can replay the exact
  // same scrutiny a live registration would have received. See the header
  // comment's "ENVELOPE-ESTABLISHMENT CONVERGENCE" note. Throws via deny()
  // on any failure; never returns a "denied" value.
  #assertEnvelopeEstablishment(envelope) {
    // Schema gate first: the evidenceEnvelope contract kind must exist and
    // the candidate must satisfy it (closed object, all required fields).
    this.#validate("evidenceEnvelope", envelope);

    // Self-verification: recompute content_hash over the envelope with the
    // hash excluded (repo-wide convention). NOTE (honesty): the caller
    // (or, in the rehydration fold, whoever appended the ledger entry)
    // controls both envelope and hash, so this is tamper-evidence for the
    // STORED envelope, not source authentication.
    const { content_hash, ...sealBody } = envelope;
    if (fingerprint(sealBody) !== content_hash) {
      deny("DENY_CONTENT_HASH_MISMATCH", "Envelope content_hash does not match the server recomputation");
    }

    // Forge-on-entry guard: establishment admits ONLY the ladder's start
    // state. Any envelope carrying an advanced status (SEALED, VERIFIED,
    // ACCEPTED, ...) at the point of establishment is a forged lifecycle
    // claim, not a genuine registration.
    const [entryState] = ENTRY_STATES;
    if (envelope.verification_status !== entryState) {
      deny(
        "DENY_STATUS_FORGERY",
        `Registration requires verification_status ${entryState}; got ${envelope.verification_status}`
      );
    }
  }

  // ---- shared transition guards (round-3 convergence fix) -----------------
  //
  // Single source of truth for each ladder edge's FULL legality, not just its
  // graph-edge legality: every live ladder method below calls exactly one of
  // these with its own live arguments, and #rehydrate() calls the SAME
  // method with values folded from the ledger entry's payload plus the
  // currently-accumulated record. See the header comment's "TRANSITION-GUARD
  // CONVERGENCE" note for the full rationale. Each method either returns
  // (silently, or with the derived target status) or throws via deny() —
  // never returns a "denied" value, matching this file's fail-closed
  // convention throughout.

  // sealEnvelope() never writes anything but the ONE literal SEALED_STATE.
  // claimedStatus is the status being adopted -- the live call site always
  // passes the literal itself (trivially matching); #rehydrate() passes the
  // ledger entry's payload.sealed_status, so a forged claim that disagrees
  // with the one status sealEnvelope() could ever produce is denied
  // fail-closed BEFORE the graph-edge check even runs (not silently
  // corrected to the literal and allowed through).
  #assertSealTransition(fromStatus, claimedStatus) {
    if (claimedStatus !== SEALED_STATE) {
      deny("DENY_UNDEFINED_TRANSITION", `Evidence cannot transition from ${fromStatus} to ${claimedStatus}`);
    }
    this.#assertEdge(fromStatus, SEALED_STATE);
  }

  // requestVerification() never writes anything but the ONE literal
  // VERIFICATION_PENDING_STATE. Same claimed-vs-literal discipline as above.
  #assertRequestVerificationTransition(fromStatus, claimedStatus) {
    if (claimedStatus !== VERIFICATION_PENDING_STATE) {
      deny("DENY_UNDEFINED_TRANSITION", `Evidence cannot transition from ${fromStatus} to ${claimedStatus}`);
    }
    this.#assertEdge(fromStatus, VERIFICATION_PENDING_STATE);
  }

  // recordVerification()'s target is ALWAYS derived from verdict via
  // VERDICT_TARGETS — never trusted verbatim from a caller/ledger-supplied
  // next_status. Denies DENY_MALFORMED_REQUEST for any verdict outside
  // {pass, fail}, exactly as the live method's own input validation does.
  #verdictTarget(verdict) {
    const target = typeof verdict === "string" ? VERDICT_TARGETS[verdict] : undefined;
    if (!target) deny("DENY_MALFORMED_REQUEST", `verdict must be one of: ${Object.keys(VERDICT_TARGETS).join(", ")}`);
    return target;
  }

  // Source guard + edge + SoD for recordVerification(). claimedStatus is
  // checked against the verdict-derived target FIRST (the live call site
  // always passes target itself, trivially matching; #rehydrate() passes
  // payload.next_status, so a forged mismatch — e.g. verdict "pass" paired
  // with next_status "REJECTED" — denies fail-closed here). QUARANTINED
  // (and VERIFIED) are graph-reachable from several states, so the
  // target-edge check alone is insufficient — pinning the source to
  // VERIFICATION_PENDING is what then rejects a verdict applied straight
  // from SEALED (a ladder skip) or from any later state (a downgrade of an
  // already-advanced record, the round-3 review's most severe finding when
  // replayed against ACCEPTANCE instead — see
  // #assertAcceptEvidenceTransition below).
  #assertRecordVerificationTransition({ status, target, claimedStatus, verifier, producer }) {
    if (claimedStatus !== target) {
      deny("DENY_UNDEFINED_TRANSITION", `Evidence cannot transition from ${status} to ${claimedStatus}`);
    }
    if (status !== VERIFICATION_PENDING_STATE) {
      deny("DENY_UNDEFINED_TRANSITION", `recordVerification requires status ${VERIFICATION_PENDING_STATE}; current ${status}`);
    }
    this.#assertEdge(VERIFICATION_PENDING_STATE, target);
    const sod = checkProhibitedActors("EVIDENCE_VERIFIER", verifier, { producer }, {
      ladder: EVIDENCE_VERIFIER_LADDER,
      code: "DENY_VERIFIER_IS_PRODUCER"
    });
    if (!sod.ok) deny(sod.code, sod.message);
  }

  // acceptEvidence()'s approvals shape requirement, shared verbatim.
  #assertApprovals(approvals) {
    if (!Array.isArray(approvals) || approvals.length === 0 || approvals.some(isBlank)) {
      deny("DENY_MALFORMED_REQUEST", "approvals must be a non-empty array of non-blank strings");
    }
  }

  // Source guard + edge + SoD for acceptEvidence(). acceptEvidence() never
  // writes anything but the ONE literal ACCEPTED_STATE, so claimedStatus is
  // checked against it first (same claimed-vs-literal discipline as seal/
  // request-verification above). ACCEPTED is graph-reachable only from
  // VERIFIED, so pinning the source rejects accept-before-verify AND — the
  // round-3 review's most severe finding — a forged ACCEPTANCE-typed ledger
  // entry retroactively re-targeting an already-ACCEPTED record (status
  // ACCEPTED !== VERIFIED, denied here before the edge or SoD checks even
  // run).
  #assertAcceptEvidenceTransition({ status, claimedStatus, acceptor, producer, verifier }) {
    if (claimedStatus !== ACCEPTED_STATE) {
      deny("DENY_UNDEFINED_TRANSITION", `Evidence cannot transition from ${status} to ${claimedStatus}`);
    }
    if (status !== VERIFIED_STATE) {
      deny("DENY_UNDEFINED_TRANSITION", `acceptEvidence requires status ${VERIFIED_STATE}; current ${status}`);
    }
    this.#assertEdge(VERIFIED_STATE, ACCEPTED_STATE);
    const sod = checkProhibitedActors("EVIDENCE_ACCEPTOR", acceptor, { producer, evidenceVerifier: verifier });
    if (!sod.ok) deny(sod.code, sod.message);
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
