// MOD-EVID S3 (R3, additive) — the first true end-to-end provenance chain.
//
// Assessment: docs/03-project-control/candidates/mod-evid-gap-assessment-001.md
// (bst/mod-evid-assessment @ a79cfde) G5 — evidence -> decision/knowledge
// linkage was "partial": citing refs bound to nothing. S3 closes it with
// EvidenceEnvelopeService.resolveAccepted(ref) + toEvidenceLookup().
//
// This suite proves the loop closes over the REAL STACK — no doubles on either
// side of the boundary:
//   - a REAL EvidenceEnvelopeService drives register -> seal -> requestVerification
//     -> recordVerification -> acceptEvidence with THREE DISTINCT actors
//     (producer != verifier != acceptor) over a REAL DurableLedger hash chain;
//   - its resolver then feeds BOTH existing consumers unchanged:
//       (a) knowledge-claim-service's injected `evidenceResolver` port, and
//       (b) a REAL temporal-ledgers KnowledgeLedger's `evidenceLookup`;
//   - a claim citing the ACCEPTED envelope is ADMITTED end-to-end (through the
//     port AND the ledger's own learning boundary), while a claim citing merely
//     SEALED evidence is DENIED — at the ledger with its VERBATIM boundary
//     message, and at the port with the structured NOT_ACCEPTED denial.
//
// The evidence service, the KnowledgeLedger, and the knowledge-claim facade are
// all the real modules on main; only the file-backed ledgers are temp files.

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { canonicalFingerprint } from "../src/contracts/canonical-fingerprint.mjs";
import { DurableLedger, LedgerError } from "../src/ledger/durable-ledger.mjs";
import { KnowledgeLedger } from "../src/ledger/temporal-ledgers.mjs";
import { EvidenceEnvelopeService } from "../src/services/evidence-envelope-service.mjs";
import { createKnowledgeClaimService } from "../src/services/knowledge-claim-service.mjs";
import { checkPairwiseDistinct } from "../src/control/sod-rules.mjs";

const FIXED_NOW = new Date("2026-07-21T09:00:00Z");

// Distinct actors across the evidence ladder — the SoD gates require
// verifier != producer and acceptor != {producer, verifier}.
const PRODUCER = "agent-producer-ev";
const VERIFIER = "agent-verifier-ev";
const ACCEPTOR = "agent-acceptor-ev";

function seal(envelope) {
  const { content_hash, ...body } = envelope;
  return { ...envelope, content_hash: canonicalFingerprint(body) };
}

function envelope(overrides = {}) {
  return seal({
    evidence_id: "ev_provenance_001",
    version: 1,
    project_id: "prj_secb_local",
    work_package_id: "wp_modevid_s3",
    session_id: "ses_modevid_s3",
    actor_id: PRODUCER,
    evidence_type: "test-result",
    source: "npm test",
    observed_at: "2026-07-21T08:00:00Z",
    procedure: "Run the provenance-chain suite",
    result: "PASS",
    exit_status: 0,
    limitations: ["local file store"],
    content_hash: "0".repeat(64),
    verification_status: "CAPTURED",
    classification: "INTERNAL",
    retention_policy: "phase0-bootstrap",
    ...overrides
  });
}

function claim(overrides = {}) {
  return {
    claim_id: "kc_provenance_001",
    version: 1,
    project_id: "prj_secb_local",
    work_package_id: "wp_modevid_s3",
    session_id: "ses_modevid_s3",
    actor_id: "hippocampus-actor",
    statement: "The provenance chain binds knowledge to accepted evidence",
    derivation: "Derived end-to-end from MOD-EVID S3",
    truth_status: "verified_true",
    evidence_refs: ["ev_provenance_001"],
    claimed_at: "2026-07-21T09:00:00Z",
    valid_from: "2026-07-21T09:00:00Z",
    valid_until: "2026-10-01T00:00:00Z",
    retention_policy: "retain-12-months",
    ...overrides
  };
}

// Drives a REAL EvidenceEnvelopeService all the way to ACCEPTED for the given
// evidence id, and leaves a second envelope only SEALED. Returns the live
// service plus its two ids so the resolver can be exercised over both.
function provenanceHarness(operation) {
  const directory = mkdtempSync(join(tmpdir(), "secb-provenance-"));
  try {
    const evidenceLedger = new DurableLedger({
      filePath: join(directory, "evidence-seals.ndjson"),
      ledgerId: "secb-evidence-seal-ledger"
    });
    const evidence = new EvidenceEnvelopeService({
      durableLedger: evidenceLedger,
      now: () => FIXED_NOW
    });

    // Accepted id: full ladder with distinct actors.
    const acceptedId = "ev_provenance_accepted";
    evidence.registerEnvelope(envelope({ evidence_id: acceptedId }));
    evidence.sealEnvelope(acceptedId, 1);
    evidence.requestVerification(acceptedId, 1, "agent-requester-ev");
    evidence.recordVerification(acceptedId, 1, VERIFIER, "pass");
    evidence.acceptEvidence(acceptedId, 1, ACCEPTOR, ["gov-approver-1"]);

    // Sealed-only id: stops at SEALED (never verified/accepted).
    const sealedId = "ev_provenance_sealed";
    evidence.registerEnvelope(envelope({ evidence_id: sealedId }));
    evidence.sealEnvelope(sealedId, 1);

    return operation({ evidence, acceptedId, sealedId, directory });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

// --- Resolver unit surface (the S3 port) -----------------------------------

test("resolveAccepted binds a bare evidence_id to its ACCEPTED envelope in the port shape, with the live status projected", () => {
  provenanceHarness(({ evidence, acceptedId }) => {
    const resolution = evidence.resolveAccepted(acceptedId);
    assert.equal(resolution.ok, true);
    assert.equal(resolution.evidenceId, acceptedId);
    assert.equal(resolution.version, 1);
    // Live status projected onto an envelope whose stored content is still CAPTURED.
    assert.equal(resolution.envelope.evidence_id, acceptedId);
    assert.equal(resolution.envelope.verification_status, "ACCEPTED");
    assert.ok(Object.isFrozen(resolution));
    assert.ok(Object.isFrozen(resolution.envelope));
  });
});

test("resolveAccepted denies structurally: unknown -> DENY_UNKNOWN_EVIDENCE, sealed-only -> DENY_NOT_ACCEPTED with the actual status", () => {
  provenanceHarness(({ evidence, sealedId }) => {
    const unknown = evidence.resolveAccepted("ev_does_not_exist");
    assert.equal(unknown.ok, false);
    assert.equal(unknown.code, "DENY_UNKNOWN_EVIDENCE");

    const blank = evidence.resolveAccepted("   ");
    assert.equal(blank.ok, false);
    assert.equal(blank.code, "DENY_UNKNOWN_EVIDENCE");

    const notAccepted = evidence.resolveAccepted(sealedId);
    assert.equal(notAccepted.ok, false);
    assert.equal(notAccepted.code, "DENY_NOT_ACCEPTED");
    assert.equal(notAccepted.status, "SEALED"); // the actual current lifecycle status
    assert.ok(Object.isFrozen(notAccepted));
  });
});

test("toEvidenceLookup yields the temporal-ledgers function shape: accepted -> bound envelope, non-accepted -> undefined", () => {
  provenanceHarness(({ evidence, acceptedId, sealedId }) => {
    const lookup = evidence.toEvidenceLookup();
    const bound = lookup(acceptedId);
    assert.equal(bound.evidence_id, acceptedId); // identity binding the ledger asserts
    assert.equal(bound.verification_status, "ACCEPTED"); // in ACCEPTED_EVIDENCE_STATUSES
    assert.equal(lookup(sealedId), undefined); // ledger converts falsy -> DENY_EVIDENCE_CHAIN
    assert.equal(lookup("ev_does_not_exist"), undefined);
  });
});

// --- The provenance chain: both real consumers over one real resolver ------

test("PROVENANCE CHAIN: accepted evidence ADMITS end-to-end through the knowledge-claim service AND a real KnowledgeLedger; sealed evidence DENIES with the ledger's verbatim boundary", () => {
  provenanceHarness(({ evidence, acceptedId, sealedId, directory }) => {
    // (b) A REAL KnowledgeLedger whose learning-boundary evidenceLookup IS the
    // S3 adapter — the ledger resolves citations through the accepted-evidence
    // resolver, nothing else.
    const knowledgeLedger = new KnowledgeLedger({
      filePath: join(directory, "knowledge.ndjson"),
      evidenceLookup: evidence.toEvidenceLookup()
    });

    // Direct-ledger proof: the ACCEPTED citation admits at the learning boundary.
    const acceptedClaim = claim({ claim_id: "kc_direct_accepted", evidence_refs: [acceptedId] });
    const appended = knowledgeLedger.appendClaim(acceptedClaim, { expectedSequence: 0, idempotencyKey: "idem-direct-accepted" });
    assert.ok(appended.sequence >= 1);

    // Direct-ledger proof: the SEALED citation is denied with the ledger's OWN
    // verbatim boundary message (falsy lookup -> DENY_EVIDENCE_CHAIN).
    const sealedClaim = claim({ claim_id: "kc_direct_sealed", evidence_refs: [sealedId] });
    assert.throws(
      () => knowledgeLedger.appendClaim(sealedClaim, { expectedSequence: 1, idempotencyKey: "idem-direct-sealed" }),
      (error) =>
        error instanceof LedgerError &&
        error.code === "DENY_EVIDENCE_CHAIN" &&
        error.message === `Evidence reference does not resolve: ${sealedId}`
    );

    // (a) The knowledge-claim-service facade wired over its OWN real
    // KnowledgeLedger (also lookup-bound to the S3 adapter) AND the resolver as
    // its evidenceResolver port. A single proposeClaim exercises BOTH consumers:
    // the port (stage 4) and the ledger learning boundary (stage 7).
    const serviceLedger = new KnowledgeLedger({
      filePath: join(directory, "knowledge-service.ndjson"),
      evidenceLookup: evidence.toEvidenceLookup()
    });
    const audit = [];
    const service = createKnowledgeClaimService({
      knowledgeLedger: serviceLedger,
      sodRules: { checkPairwiseDistinct },
      evidenceResolver: evidence, // the REAL resolver as the injected port
      now: () => FIXED_NOW,
      auditWriter: (entry) => audit.push(entry)
    });

    // ADMIT end-to-end: port resolves accepted, ledger admits accepted.
    const admit = service.proposeClaim({
      claim: claim({ claim_id: "kc_service_accepted", evidence_refs: [acceptedId] }),
      admission: { proposer: "agent-a", approver: "agent-b" },
      idempotencyKey: "idem-service-accepted",
      expectedSequence: 0
    });
    assert.equal(admit.decision, "ALLOW");
    assert.equal(admit.code, "ADMITTED");
    assert.equal(audit.length, 1);

    // DENY at the port: sealed evidence is not accepted; the facade reports the
    // structured NOT_ACCEPTED port denial and never reaches the ledger append.
    const denySealed = service.proposeClaim({
      claim: claim({ claim_id: "kc_service_sealed", evidence_refs: [sealedId] }),
      admission: { proposer: "agent-a", approver: "agent-b" },
      idempotencyKey: "idem-service-sealed",
      expectedSequence: 1
    });
    assert.equal(denySealed.decision, "DENY");
    assert.equal(denySealed.code, "DENY_EVIDENCE_UNRESOLVED");
    assert.equal(denySealed.port_denial.code, "DENY_NOT_ACCEPTED");
    assert.equal(audit.length, 1); // no second audit: denied before audit-first stage
    assert.equal(serviceLedger.read().length, 1); // only the admitted claim landed
  });
});
