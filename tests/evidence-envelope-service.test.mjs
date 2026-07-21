import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { canonicalFingerprint } from "../src/contracts/canonical-fingerprint.mjs";
import { ContractValidationError } from "../src/contracts/contract-validator.mjs";
import { DurableLedger } from "../src/ledger/durable-ledger.mjs";
import { EvidenceEnvelopeService, EvidenceEnvelopeServiceError } from "../src/services/evidence-envelope-service.mjs";

// MOD-EVID S1: register + seal lifecycle. Forge-on-entry (013-class),
// hash-mismatch, duplicate, ledger-audit-first, and chain-tamper coverage.

const ADVANCED_STATUSES = [
  "SEALED", "VERIFICATION_PENDING", "VERIFIED", "ACCEPTED", "REJECTED", "SUPERSEDED", "QUARANTINED"
];

function seal(envelope) {
  const { content_hash, ...body } = envelope;
  return { ...envelope, content_hash: canonicalFingerprint(body) };
}

function envelope(overrides = {}) {
  return seal({
    evidence_id: "ev_modevid_s1_001",
    version: 1,
    project_id: "prj_secb_local",
    work_package_id: "wp_modevid_s1",
    session_id: "ses_modevid_s1",
    actor_id: "claude-motor",
    evidence_type: "test-result",
    source: "npm test",
    observed_at: "2026-07-20T10:00:00+07:00",
    procedure: "Run evidence-envelope-service tests",
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

function withHarness(operation) {
  const directory = mkdtempSync(join(tmpdir(), "secb-evid-"));
  try {
    const path = join(directory, "evidence-seals.ndjson");
    const ledger = new DurableLedger({ filePath: path, ledgerId: "secb-evidence-seal-ledger" });
    const service = new EvidenceEnvelopeService({
      durableLedger: ledger,
      now: () => new Date("2026-07-20T10:05:00+07:00")
    });
    return operation({ service, ledger, path });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function denies(fn, code) {
  assert.throws(fn, (e) => e instanceof EvidenceEnvelopeServiceError && e.code === code);
}

test("happy path: register at CAPTURED, seal onto the hash chain, verify the chain", () => withHarness(({ service, ledger }) => {
  const registered = service.registerEnvelope(envelope());
  assert.equal(registered.verificationStatus, "CAPTURED");
  assert.equal(registered.evidenceId, "ev_modevid_s1_001");
  assert.equal(registered.version, 1);

  const sealed = service.sealEnvelope("ev_modevid_s1_001", 1);
  assert.equal(sealed.verificationStatus, "SEALED");
  assert.equal(sealed.ledgerSequence, 1);
  assert.match(sealed.ledgerRecordHash, /^[a-f0-9]{64}$/);
  assert.equal(sealed.replayed, false);

  const fetched = service.getEnvelope("ev_modevid_s1_001", 1);
  assert.equal(fetched.verificationStatus, "SEALED");
  assert.equal(fetched.envelope.verification_status, "CAPTURED"); // registered content is immutable
  assert.equal(fetched.ledgerRecordHash, sealed.ledgerRecordHash);

  const chain = service.verifyChain("ev_modevid_s1_001");
  assert.equal(chain.valid, true);
  assert.deepEqual(chain.registeredVersions, [1]);
  assert.deepEqual(chain.sealedVersions, [1]);
  assert.equal(chain.ledger.count, 1);
  assert.equal(ledger.verify().headHash, chain.ledger.headHash);
}));

for (const status of ADVANCED_STATUSES) {
  test(`forge-on-entry: registration carrying verification_status ${status} is denied`, () => withHarness(({ service }) => {
    denies(() => service.registerEnvelope(envelope({ verification_status: status })), "DENY_STATUS_FORGERY");
    // and the forged envelope was NOT admitted
    denies(() => service.getEnvelope("ev_modevid_s1_001", 1), "DENY_UNKNOWN_EVIDENCE");
  }));
}

test("self-verification: a tampered envelope whose content_hash does not match is denied", () => withHarness(({ service }) => {
  const tampered = { ...envelope(), result: "mutated-after-seal" };
  denies(() => service.registerEnvelope(tampered), "DENY_CONTENT_HASH_MISMATCH");
}));

test("schema gate: a contract-invalid envelope is denied by the contract validator", () => withHarness(({ service }) => {
  assert.throws(
    () => service.registerEnvelope(seal({ ...envelope(), verification_status: "TRUST_ME" })),
    (e) => e instanceof ContractValidationError && e.code === "DENY_CONTRACT_INVALID"
  );
  assert.throws(
    () => service.registerEnvelope(seal({ ...envelope(), smuggled: true })),
    (e) => e instanceof ContractValidationError && e.code === "DENY_CONTRACT_INVALID"
  );
}));

test("duplicate evidence_id+version is denied; a new version registers", () => withHarness(({ service }) => {
  service.registerEnvelope(envelope());
  denies(() => service.registerEnvelope(envelope()), "DENY_DUPLICATE");
  const v2 = service.registerEnvelope(envelope({ version: 2 }));
  assert.equal(v2.version, 2);
}));

test("seal denials: unknown evidence, then re-seal is an undefined transition", () => withHarness(({ service }) => {
  denies(() => service.sealEnvelope("ev_ghost", 1), "DENY_UNKNOWN_EVIDENCE");
  service.registerEnvelope(envelope());
  service.sealEnvelope("ev_modevid_s1_001", 1);
  denies(() => service.sealEnvelope("ev_modevid_s1_001", 1), "DENY_UNDEFINED_TRANSITION");
}));

test("audit-before-effect: a throwing ledger denies the seal and leaves the record CAPTURED", () => {
  const throwingLedger = {
    read: () => [],
    verify: () => ({ valid: true, count: 0, headHash: "0".repeat(64) }),
    append: () => { throw new Error("disk full"); }
  };
  const service = new EvidenceEnvelopeService({ durableLedger: throwingLedger });
  service.registerEnvelope(envelope());
  denies(() => service.sealEnvelope("ev_modevid_s1_001", 1), "DENY_LEDGER_APPEND");
  assert.equal(service.getEnvelope("ev_modevid_s1_001", 1).verificationStatus, "CAPTURED");
});

test("chain-tamper: a mutated ledger record is detected as DENY_CHAIN_BROKEN", () => withHarness(({ service, path }) => {
  service.registerEnvelope(envelope());
  service.sealEnvelope("ev_modevid_s1_001", 1);
  writeFileSync(path, readFileSync(path, "utf8").replace("PASS", "FAIL"), "utf8");
  denies(() => service.verifyChain("ev_modevid_s1_001"), "DENY_CHAIN_BROKEN");
}));

test("chain-tamper: a truncated ledger with no backing seal entry is DENY_CHAIN_BROKEN", () => withHarness(({ service, path }) => {
  service.registerEnvelope(envelope());
  service.sealEnvelope("ev_modevid_s1_001", 1);
  writeFileSync(path, "", "utf8"); // self-consistent empty chain, seal receipt unbacked
  denies(() => service.verifyChain("ev_modevid_s1_001"), "DENY_CHAIN_BROKEN");
}));

test("seal onto an already-broken chain is refused as DENY_CHAIN_BROKEN", () => withHarness(({ service, path }) => {
  service.registerEnvelope(envelope());
  service.sealEnvelope("ev_modevid_s1_001", 1);
  service.registerEnvelope(envelope({ evidence_id: "ev_modevid_s1_002" }));
  writeFileSync(path, readFileSync(path, "utf8").replace("PASS", "FAIL"), "utf8");
  denies(() => service.sealEnvelope("ev_modevid_s1_002", 1), "DENY_CHAIN_BROKEN");
}));

test("read-only denials: unknown evidence and malformed arguments", () => withHarness(({ service }) => {
  denies(() => service.registerEnvelope(null), "DENY_MALFORMED_REQUEST");
  denies(() => service.registerEnvelope([]), "DENY_MALFORMED_REQUEST");
  denies(() => service.sealEnvelope("", 1), "DENY_MALFORMED_REQUEST");
  denies(() => service.sealEnvelope("ev_x", 0), "DENY_MALFORMED_REQUEST");
  denies(() => service.getEnvelope("  ", 1), "DENY_MALFORMED_REQUEST");
  denies(() => service.getEnvelope("ev_ghost", 1), "DENY_UNKNOWN_EVIDENCE");
  denies(() => service.verifyChain(""), "DENY_MALFORMED_REQUEST");
  denies(() => service.verifyChain("ev_ghost"), "DENY_UNKNOWN_EVIDENCE");
}));

test("constructor fails closed without a capable durable ledger", () => {
  denies(() => new EvidenceEnvelopeService(), "DENY_CONFIG");
  denies(() => new EvidenceEnvelopeService({ durableLedger: { append: () => {} } }), "DENY_CONFIG");
  denies(() => new EvidenceEnvelopeService({ durableLedger: { append: () => {}, read: () => [], verify: () => ({}) }, schemaValidator: "nope" }), "DENY_CONFIG");
});

test("outputs are deeply frozen", () => withHarness(({ service }) => {
  const registered = service.registerEnvelope(envelope());
  const sealed = service.sealEnvelope("ev_modevid_s1_001", 1);
  const fetched = service.getEnvelope("ev_modevid_s1_001", 1);
  const chain = service.verifyChain("ev_modevid_s1_001");
  for (const output of [registered, sealed, fetched, chain]) {
    assert.equal(Object.isFrozen(output), true);
  }
  assert.equal(Object.isFrozen(fetched.envelope), true);
  assert.equal(Object.isFrozen(fetched.envelope.limitations), true);
  assert.equal(Object.isFrozen(chain.ledger), true);
  assert.throws(() => { fetched.envelope.result = "mutated"; }, TypeError);
}));

// ---------------------------------------------------------------------------
// MOD-EVID S2: governed verify + accept ladder (R4). Distinct actors:
// producer = envelope.actor_id ("claude-motor"), a requester, a verifier, an
// acceptor. Covers happy path, every SoD denial, undefined-transition denials,
// audit-first per edge, ladder chain coverage, and frozen outputs.
// ---------------------------------------------------------------------------

const PRODUCER = "claude-motor"; // envelope() default actor_id
const REQUESTER = "stem-requester";
const VERIFIER = "codex-verifier";
const ACCEPTOR = "gov-acceptor";
const APPROVALS = ["gov-approval-001"];
const EV = "ev_modevid_s1_001";

// A durable-ledger facade that throws on the first append of a chosen entry
// type, to exercise audit-before-effect per ladder edge.
function throwingOn(realLedger, type) {
  return {
    read: (...args) => realLedger.read(...args),
    verify: (...args) => realLedger.verify(...args),
    append: (entry, options) => {
      if (entry.type === type) throw new Error("disk full");
      return realLedger.append(entry, options);
    }
  };
}

function withWrappedLedger(wrap, operation) {
  const directory = mkdtempSync(join(tmpdir(), "secb-evid-"));
  try {
    const path = join(directory, "evidence-seals.ndjson");
    const real = new DurableLedger({ filePath: path, ledgerId: "secb-evidence-seal-ledger" });
    const service = new EvidenceEnvelopeService({
      durableLedger: wrap ? wrap(real) : real,
      now: () => new Date("2026-07-20T10:05:00+07:00")
    });
    return operation({ service, ledger: real, path });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

// Advance a fresh evidence record to SEALED (helper for the ladder tests).
function toSealed(service) {
  service.registerEnvelope(envelope());
  service.sealEnvelope(EV, 1);
}

test("S2 happy path: register -> seal -> request -> verify(pass) -> accept with distinct actors", () => withHarness(({ service, ledger }) => {
  toSealed(service);

  const requested = service.requestVerification(EV, 1, REQUESTER);
  assert.equal(requested.verificationStatus, "VERIFICATION_PENDING");
  assert.equal(requested.requestedBy, REQUESTER);

  const verified = service.recordVerification(EV, 1, VERIFIER, "pass");
  assert.equal(verified.verificationStatus, "VERIFIED");
  assert.equal(verified.verifier, VERIFIER);

  const accepted = service.acceptEvidence(EV, 1, ACCEPTOR, APPROVALS);
  assert.equal(accepted.verificationStatus, "ACCEPTED");
  assert.equal(accepted.acceptor, ACCEPTOR);
  assert.deepEqual(accepted.approvals, APPROVALS);

  const resolved = service.resolveAcceptedStatus(EV, 1);
  assert.deepEqual(resolved, { evidenceId: EV, version: 1, accepted: true, status: "ACCEPTED" });

  const fetched = service.getEnvelope(EV, 1);
  assert.equal(fetched.verificationStatus, "ACCEPTED");
  assert.equal(fetched.verifierActorId, VERIFIER);
  assert.equal(fetched.acceptorActorId, ACCEPTOR);
  assert.equal(fetched.verdict, "pass");

  const chain = service.verifyChain(EV);
  assert.equal(chain.valid, true);
  assert.deepEqual(chain.sealedVersions, []); // advanced past SEALED (currently-sealed view)
  assert.deepEqual(chain.verifiedVersions, [1]);
  assert.deepEqual(chain.acceptedVersions, [1]);
  assert.equal(chain.ledger.count, 4); // seal + request + verification + acceptance
  assert.equal(ledger.verify().headHash, chain.ledger.headHash);
}));

test("S2 failed verdict quarantines and blocks acceptance", () => withHarness(({ service }) => {
  toSealed(service);
  service.requestVerification(EV, 1, REQUESTER);
  const failed = service.recordVerification(EV, 1, VERIFIER, "fail");
  assert.equal(failed.verificationStatus, "QUARANTINED");
  assert.equal(service.resolveAcceptedStatus(EV, 1).accepted, false);
  denies(() => service.acceptEvidence(EV, 1, ACCEPTOR, APPROVALS), "DENY_UNDEFINED_TRANSITION");
  const chain = service.verifyChain(EV);
  assert.deepEqual(chain.quarantinedVersions, [1]);
  assert.deepEqual(chain.verifiedVersions, []);
}));

test("S2 SoD: the producer cannot verify its own evidence", () => withHarness(({ service }) => {
  toSealed(service);
  service.requestVerification(EV, 1, REQUESTER);
  denies(() => service.recordVerification(EV, 1, PRODUCER, "pass"), "DENY_VERIFIER_IS_PRODUCER");
  assert.equal(service.getEnvelope(EV, 1).verificationStatus, "VERIFICATION_PENDING");
}));

test("S2 SoD: the producer cannot accept its own evidence", () => withHarness(({ service }) => {
  toSealed(service);
  service.requestVerification(EV, 1, REQUESTER);
  service.recordVerification(EV, 1, VERIFIER, "pass");
  denies(() => service.acceptEvidence(EV, 1, PRODUCER, APPROVALS), "DENY_SOD");
  assert.equal(service.getEnvelope(EV, 1).verificationStatus, "VERIFIED");
}));

test("S2 SoD: the verifier cannot accept the evidence it verified", () => withHarness(({ service }) => {
  toSealed(service);
  service.requestVerification(EV, 1, REQUESTER);
  service.recordVerification(EV, 1, VERIFIER, "pass");
  denies(() => service.acceptEvidence(EV, 1, VERIFIER, APPROVALS), "DENY_SOD");
  assert.equal(service.getEnvelope(EV, 1).verificationStatus, "VERIFIED");
}));

test("S2 undefined transitions: skip-ahead, verify-before-request, accept-before-verify, re-verify, re-accept", () => withHarness(({ service }) => {
  // request before seal (status CAPTURED)
  service.registerEnvelope(envelope());
  denies(() => service.requestVerification(EV, 1, REQUESTER), "DENY_UNDEFINED_TRANSITION");

  service.sealEnvelope(EV, 1);
  // verify before request (status SEALED) — fail verdict must NOT quarantine straight from SEALED
  denies(() => service.recordVerification(EV, 1, VERIFIER, "fail"), "DENY_UNDEFINED_TRANSITION");
  // accept before verify (status SEALED)
  denies(() => service.acceptEvidence(EV, 1, ACCEPTOR, APPROVALS), "DENY_UNDEFINED_TRANSITION");

  service.requestVerification(EV, 1, REQUESTER);
  // accept before verify (status VERIFICATION_PENDING)
  denies(() => service.acceptEvidence(EV, 1, ACCEPTOR, APPROVALS), "DENY_UNDEFINED_TRANSITION");

  service.recordVerification(EV, 1, VERIFIER, "pass");
  // re-verify (status VERIFIED)
  denies(() => service.recordVerification(EV, 1, VERIFIER, "pass"), "DENY_UNDEFINED_TRANSITION");

  service.acceptEvidence(EV, 1, ACCEPTOR, APPROVALS);
  // re-accept (status ACCEPTED)
  denies(() => service.acceptEvidence(EV, 1, ACCEPTOR, APPROVALS), "DENY_UNDEFINED_TRANSITION");
}));

test("S2 audit-first: a throwing ledger denies requestVerification and leaves SEALED", () => withWrappedLedger((real) => throwingOn(real, "EVIDENCE_VERIFICATION_REQUEST"), ({ service }) => {
  toSealed(service);
  denies(() => service.requestVerification(EV, 1, REQUESTER), "DENY_LEDGER_APPEND");
  assert.equal(service.getEnvelope(EV, 1).verificationStatus, "SEALED");
}));

test("S2 audit-first: a throwing ledger denies recordVerification and leaves VERIFICATION_PENDING", () => withWrappedLedger((real) => throwingOn(real, "EVIDENCE_VERIFICATION"), ({ service }) => {
  toSealed(service);
  service.requestVerification(EV, 1, REQUESTER);
  denies(() => service.recordVerification(EV, 1, VERIFIER, "pass"), "DENY_LEDGER_APPEND");
  assert.equal(service.getEnvelope(EV, 1).verificationStatus, "VERIFICATION_PENDING");
}));

test("S2 audit-first: a throwing ledger denies acceptEvidence and leaves VERIFIED", () => withWrappedLedger((real) => throwingOn(real, "EVIDENCE_ACCEPTANCE"), ({ service }) => {
  toSealed(service);
  service.requestVerification(EV, 1, REQUESTER);
  service.recordVerification(EV, 1, VERIFIER, "pass");
  denies(() => service.acceptEvidence(EV, 1, ACCEPTOR, APPROVALS), "DENY_LEDGER_APPEND");
  assert.equal(service.getEnvelope(EV, 1).verificationStatus, "VERIFIED");
}));

test("S2 chain coverage: a ladder receipt dropped from a self-consistent chain is DENY_CHAIN_BROKEN", () => withWrappedLedger(null, ({ service, path }) => {
  toSealed(service);
  service.requestVerification(EV, 1, REQUESTER);
  service.recordVerification(EV, 1, VERIFIER, "pass");
  service.acceptEvidence(EV, 1, ACCEPTOR, APPROVALS);
  // Truncate to only the seal line: a valid single-entry chain, but the
  // record's stored verify/accept receipts are now unbacked.
  const [sealLine] = readFileSync(path, "utf8").trim().split(/\r?\n/);
  writeFileSync(path, `${sealLine}\n`, "utf8");
  denies(() => service.verifyChain(EV), "DENY_CHAIN_BROKEN");
}));

test("S2 chain coverage: a mutated ladder ledger entry is DENY_CHAIN_BROKEN", () => withHarness(({ service, path }) => {
  toSealed(service);
  service.requestVerification(EV, 1, REQUESTER);
  service.recordVerification(EV, 1, VERIFIER, "pass");
  service.acceptEvidence(EV, 1, ACCEPTOR, APPROVALS);
  writeFileSync(path, readFileSync(path, "utf8").replace(ACCEPTOR, "attacker"), "utf8");
  denies(() => service.verifyChain(EV), "DENY_CHAIN_BROKEN");
}));

test("S2 malformed and unknown-evidence denials across the ladder", () => withHarness(({ service }) => {
  toSealed(service);
  denies(() => service.requestVerification("", 1, REQUESTER), "DENY_MALFORMED_REQUEST");
  denies(() => service.requestVerification(EV, 1, "  "), "DENY_MALFORMED_REQUEST");
  denies(() => service.requestVerification("ev_ghost", 1, REQUESTER), "DENY_UNKNOWN_EVIDENCE");
  service.requestVerification(EV, 1, REQUESTER);
  denies(() => service.recordVerification(EV, 1, VERIFIER, "maybe"), "DENY_MALFORMED_REQUEST");
  denies(() => service.recordVerification(EV, 1, VERIFIER, true), "DENY_MALFORMED_REQUEST");
  denies(() => service.recordVerification(EV, 1, "", "pass"), "DENY_MALFORMED_REQUEST");
  service.recordVerification(EV, 1, VERIFIER, "pass");
  denies(() => service.acceptEvidence(EV, 1, ACCEPTOR, []), "DENY_MALFORMED_REQUEST");
  denies(() => service.acceptEvidence(EV, 1, ACCEPTOR, ["ok", "  "]), "DENY_MALFORMED_REQUEST");
  denies(() => service.acceptEvidence(EV, 1, "", APPROVALS), "DENY_MALFORMED_REQUEST");
  denies(() => service.resolveAcceptedStatus("ev_ghost", 1), "DENY_UNKNOWN_EVIDENCE");
}));

test("S2 ladder outputs are deeply frozen", () => withHarness(({ service }) => {
  toSealed(service);
  const requested = service.requestVerification(EV, 1, REQUESTER);
  const verified = service.recordVerification(EV, 1, VERIFIER, "pass");
  const accepted = service.acceptEvidence(EV, 1, ACCEPTOR, APPROVALS);
  const resolved = service.resolveAcceptedStatus(EV, 1);
  for (const output of [requested, verified, accepted, resolved]) {
    assert.equal(Object.isFrozen(output), true);
  }
  assert.equal(Object.isFrozen(accepted.approvals), true);
  assert.throws(() => { accepted.approvals.push("x"); }, TypeError);
}));

// ---------------------------------------------------------------------------
// LEDGER REHYDRATION FIX: closes the second independent review's finding #4
// (docs/03-project-control/candidates/mod-evid-s2-s3-second-independent-review-001.md).
// Reproduces the reviewer's exact restart/new-instance scenario: a "process A"
// instance runs the full lifecycle, then a FRESH "process B" instance is
// constructed against the SAME ledger file (the ordinary consequence of a
// restart, redeploy, or crash recovery) with an empty starting Map of its own.
// Pre-fix, process B saw nothing, silently re-admitted a forged registration,
// and verifyChain() lied (`valid: true`, empty accepted/sealed arrays).
// ---------------------------------------------------------------------------

function freshInstance(path, now) {
  const ledger = new DurableLedger({ filePath: path, ledgerId: "secb-evidence-seal-ledger" });
  return new EvidenceEnvelopeService({ durableLedger: ledger, now });
}

test("REHYDRATION: a fresh instance over the same ledger sees the true ACCEPTED status, not CAPTURED", () => {
  const directory = mkdtempSync(join(tmpdir(), "secb-evid-rehydrate-"));
  try {
    const path = join(directory, "evidence-seals.ndjson");
    const clock = () => new Date("2026-07-20T10:05:00+07:00");

    // Process A: full lifecycle to ACCEPTED with distinct actors.
    const serviceA = freshInstance(path, clock);
    serviceA.registerEnvelope(envelope());
    serviceA.sealEnvelope(EV, 1);
    serviceA.requestVerification(EV, 1, REQUESTER);
    serviceA.recordVerification(EV, 1, VERIFIER, "pass");
    serviceA.acceptEvidence(EV, 1, ACCEPTOR, APPROVALS);
    assert.equal(serviceA.getEnvelope(EV, 1).verificationStatus, "ACCEPTED");

    // Process B: brand-new instance, same ledger file, simulating a restart.
    // The reviewer's reproduction: pre-fix this threw DENY_UNKNOWN_EVIDENCE
    // (the fresh Map had no record at all).
    const serviceB = freshInstance(path, clock);
    const fetched = serviceB.getEnvelope(EV, 1);
    assert.equal(fetched.verificationStatus, "ACCEPTED");
    assert.equal(fetched.verifierActorId, VERIFIER);
    assert.equal(fetched.acceptorActorId, ACCEPTOR);
    assert.equal(fetched.verdict, "pass");
    assert.deepEqual(fetched.approvals, APPROVALS);

    // resolveAccepted must likewise see the real, live ACCEPTED state.
    const resolved = serviceB.resolveAccepted(EV);
    assert.equal(resolved.ok, true);
    assert.equal(resolved.envelope.verification_status, "ACCEPTED");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("REHYDRATION: the duplicate-registration guard on a fresh instance is enforced against the real ledger history", () => {
  const directory = mkdtempSync(join(tmpdir(), "secb-evid-rehydrate-"));
  try {
    const path = join(directory, "evidence-seals.ndjson");
    const clock = () => new Date("2026-07-20T10:05:00+07:00");

    const serviceA = freshInstance(path, clock);
    serviceA.registerEnvelope(envelope());
    serviceA.sealEnvelope(EV, 1);
    serviceA.requestVerification(EV, 1, REQUESTER);
    serviceA.recordVerification(EV, 1, VERIFIER, "pass");
    serviceA.acceptEvidence(EV, 1, ACCEPTOR, APPROVALS);

    // Process B: the reviewer's exact attack. Pre-fix, this SUCCEEDED (no
    // DENY_DUPLICATE) and silently reset the identity's live view to a fresh
    // CAPTURED record carrying attacker-controlled content and a forged actor.
    const serviceB = freshInstance(path, clock);
    const forged = envelope({ actor_id: "attacker-evil", result: "FORGED" });
    denies(() => serviceB.registerEnvelope(forged), "DENY_DUPLICATE");

    // The real ACCEPTED history must remain visible and untouched by the
    // forgery attempt.
    const fetched = serviceB.getEnvelope(EV, 1);
    assert.equal(fetched.verificationStatus, "ACCEPTED");
    assert.equal(fetched.envelope.result, "PASS");
    assert.equal(fetched.envelope.actor_id, PRODUCER);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("REHYDRATION: verifyChain on a fresh instance reports the TRUE state, not empty accepted/sealed arrays", () => {
  const directory = mkdtempSync(join(tmpdir(), "secb-evid-rehydrate-"));
  try {
    const path = join(directory, "evidence-seals.ndjson");
    const clock = () => new Date("2026-07-20T10:05:00+07:00");

    const serviceA = freshInstance(path, clock);
    serviceA.registerEnvelope(envelope());
    serviceA.sealEnvelope(EV, 1);
    serviceA.requestVerification(EV, 1, REQUESTER);
    serviceA.recordVerification(EV, 1, VERIFIER, "pass");
    serviceA.acceptEvidence(EV, 1, ACCEPTOR, APPROVALS);
    const chainA = serviceA.verifyChain(EV);

    const serviceB = freshInstance(path, clock);
    const chainB = serviceB.verifyChain(EV);

    // Pre-fix reproduction: serviceB.verifyChain(EV) returned
    // `{ valid: true, sealedVersions: [], acceptedVersions: [], quarantinedVersions: [], ledger: { count: 4 } }`
    // -- reporting a governed, previously-ACCEPTED identity as never-sealed/
    // never-accepted. Post-fix it must match process A's own view exactly.
    assert.equal(chainB.valid, true);
    assert.deepEqual(chainB.registeredVersions, chainA.registeredVersions);
    assert.deepEqual(chainB.acceptedVersions, [1]);
    assert.deepEqual(chainB.verifiedVersions, chainA.verifiedVersions);
    assert.deepEqual(chainB.sealedVersions, chainA.sealedVersions);
    assert.deepEqual(chainB.quarantinedVersions, chainA.quarantinedVersions);
    assert.equal(chainB.ledger.count, 4);
    assert.equal(chainB.ledger.headHash, chainA.ledger.headHash);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("REHYDRATION: a fresh instance mid-ladder (SEALED only) continues the SAME lifecycle correctly", () => {
  const directory = mkdtempSync(join(tmpdir(), "secb-evid-rehydrate-"));
  try {
    const path = join(directory, "evidence-seals.ndjson");
    const clock = () => new Date("2026-07-20T10:05:00+07:00");

    const serviceA = freshInstance(path, clock);
    serviceA.registerEnvelope(envelope());
    serviceA.sealEnvelope(EV, 1);

    // Restart mid-ladder: instance B only ever sees the SEAL entry.
    const serviceB = freshInstance(path, clock);
    assert.equal(serviceB.getEnvelope(EV, 1).verificationStatus, "SEALED");

    // The ladder continues correctly on the rehydrated record, including SoD.
    serviceB.requestVerification(EV, 1, REQUESTER);
    denies(() => serviceB.recordVerification(EV, 1, PRODUCER, "pass"), "DENY_VERIFIER_IS_PRODUCER");
    serviceB.recordVerification(EV, 1, VERIFIER, "pass");
    denies(() => serviceB.acceptEvidence(EV, 1, VERIFIER, APPROVALS), "DENY_SOD");
    const accepted = serviceB.acceptEvidence(EV, 1, ACCEPTOR, APPROVALS);
    assert.equal(accepted.verificationStatus, "ACCEPTED");

    // A THIRD instance, restarted again after full acceptance, sees it all.
    const serviceC = freshInstance(path, clock);
    const chain = serviceC.verifyChain(EV);
    assert.deepEqual(chain.acceptedVersions, [1]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("REHYDRATION: a QUARANTINED-only restart is visible and re-registration is still denied", () => {
  const directory = mkdtempSync(join(tmpdir(), "secb-evid-rehydrate-"));
  try {
    const path = join(directory, "evidence-seals.ndjson");
    const clock = () => new Date("2026-07-20T10:05:00+07:00");

    const serviceA = freshInstance(path, clock);
    serviceA.registerEnvelope(envelope());
    serviceA.sealEnvelope(EV, 1);
    serviceA.requestVerification(EV, 1, REQUESTER);
    serviceA.recordVerification(EV, 1, VERIFIER, "fail");

    const serviceB = freshInstance(path, clock);
    assert.equal(serviceB.getEnvelope(EV, 1).verificationStatus, "QUARANTINED");
    denies(() => serviceB.registerEnvelope(envelope()), "DENY_DUPLICATE");
    denies(() => serviceB.acceptEvidence(EV, 1, ACCEPTOR, APPROVALS), "DENY_UNDEFINED_TRANSITION");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("REHYDRATION: multiple evidence identities and versions all rehydrate independently", () => {
  const directory = mkdtempSync(join(tmpdir(), "secb-evid-rehydrate-"));
  try {
    const path = join(directory, "evidence-seals.ndjson");
    const clock = () => new Date("2026-07-20T10:05:00+07:00");

    const serviceA = freshInstance(path, clock);
    // v1: full accept.
    serviceA.registerEnvelope(envelope());
    serviceA.sealEnvelope(EV, 1);
    serviceA.requestVerification(EV, 1, REQUESTER);
    serviceA.recordVerification(EV, 1, VERIFIER, "pass");
    serviceA.acceptEvidence(EV, 1, ACCEPTOR, APPROVALS);
    // v2 of the same evidence_id: only sealed.
    serviceA.registerEnvelope(envelope({ version: 2 }));
    serviceA.sealEnvelope(EV, 2);
    // A second, distinct evidence_id: only registered+sealed, never verified.
    const OTHER = "ev_modevid_s1_other";
    serviceA.registerEnvelope(envelope({ evidence_id: OTHER }));
    serviceA.sealEnvelope(OTHER, 1);

    const serviceB = freshInstance(path, clock);
    assert.equal(serviceB.getEnvelope(EV, 1).verificationStatus, "ACCEPTED");
    assert.equal(serviceB.getEnvelope(EV, 2).verificationStatus, "SEALED");
    assert.equal(serviceB.getEnvelope(OTHER, 1).verificationStatus, "SEALED");
    const chain = serviceB.verifyChain(EV);
    assert.deepEqual(chain.acceptedVersions, [1]);
    assert.deepEqual(chain.sealedVersions, [2]);
    assert.deepEqual(chain.registeredVersions, [1, 2]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("REHYDRATION: construction against a chain-broken ledger fails closed (DENY_CHAIN_BROKEN)", () => {
  const directory = mkdtempSync(join(tmpdir(), "secb-evid-rehydrate-"));
  try {
    const path = join(directory, "evidence-seals.ndjson");
    const clock = () => new Date("2026-07-20T10:05:00+07:00");

    const serviceA = freshInstance(path, clock);
    serviceA.registerEnvelope(envelope());
    serviceA.sealEnvelope(EV, 1);
    writeFileSync(path, readFileSync(path, "utf8").replace("PASS", "FAIL"), "utf8");

    denies(() => freshInstance(path, clock), "DENY_CHAIN_BROKEN");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("REHYDRATION: construction with a ledger whose read() throws an unrecognized error denies DENY_LEDGER_REHYDRATION", () => {
  const throwingLedger = {
    read: () => { throw new Error("disk unavailable"); },
    verify: () => ({ valid: true, count: 0, headHash: "0".repeat(64) }),
    append: () => { throw new Error("disk unavailable"); }
  };
  denies(() => new EvidenceEnvelopeService({ durableLedger: throwingLedger }), "DENY_LEDGER_REHYDRATION");
});

// ---------------------------------------------------------------------------
// REHYDRATION EDGE-LEGALITY FIX: closes the independent review's finding #4
// (docs/03-project-control/candidates/
// mod-evid-s2-s3-ledger-rehydration-fix-independent-review-001.md). Both
// reproductions forge a ledger entry DIRECTLY through DurableLedger.append(),
// bypassing EvidenceEnvelopeService's own API entirely -- a narrower,
// higher-privilege attack surface than the original restart bug, but the
// same silent-wrong-state defect class. Pre-fix, #rehydrate() copied
// payload.sealed_status / payload.next_status verbatim with no edge-legality
// check; post-fix it reuses #assertEdge, the same helper every live ladder
// method already trusts.
// ---------------------------------------------------------------------------

test("REHYDRATION SECURITY: a forged EVIDENCE_SEAL entry claiming sealed_status ACCEPTED as the FIRST entry is denied, not silently rehydrated to ACCEPTED", () => {
  const directory = mkdtempSync(join(tmpdir(), "secb-evid-rehydrate-"));
  try {
    const path = join(directory, "evidence-seals.ndjson");
    const ledger = new DurableLedger({ filePath: path, ledgerId: "secb-evidence-seal-ledger" });
    const env = envelope();

    // The reviewer's exact exploit #1: a single forged EVIDENCE_SEAL entry
    // with sealed_status: "ACCEPTED" and NOTHING else in the ledger -- no
    // verification, no acceptance entries at all.
    const forgedSeal = {
      entryId: JSON.stringify([env.evidence_id, env.version, "SEAL"]),
      projectId: env.project_id,
      workPackageId: env.work_package_id,
      sessionId: env.session_id,
      actorId: "attacker",
      type: "EVIDENCE_SEAL",
      payload: {
        envelope: env,
        previous_status: "CAPTURED",
        sealed_status: "ACCEPTED", // forged: never a legal edge from CAPTURED
        content_hash: env.content_hash
      },
      timestamp: "2026-07-20T10:05:00+07:00",
      idempotencyKey: JSON.stringify(["evidence-seal", env.evidence_id, env.version])
    };
    ledger.append(forgedSeal, { expectedSequence: 0 });

    // Pre-fix: a fresh instance rehydrated straight to ACCEPTED, verifyChain()
    // reported valid: true with the identity in acceptedVersions, and
    // resolveAccepted() returned ok: true. Post-fix: construction itself
    // must fail closed via the same #assertEdge the live ladder uses.
    denies(
      () => new EvidenceEnvelopeService({
        durableLedger: new DurableLedger({ filePath: path, ledgerId: "secb-evidence-seal-ledger" })
      }),
      "DENY_UNDEFINED_TRANSITION"
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("REHYDRATION SECURITY: a forged EVIDENCE_VERIFICATION entry claiming an illegal next_status ACCEPTED is denied, not silently rehydrated past verification", () => {
  const directory = mkdtempSync(join(tmpdir(), "secb-evid-rehydrate-"));
  try {
    const path = join(directory, "evidence-seals.ndjson");
    const clock = () => new Date("2026-07-20T10:05:00+07:00");

    // Legitimate SEAL + VERIFICATION_REQUEST through the real live API.
    const serviceA = freshInstance(path, clock);
    serviceA.registerEnvelope(envelope());
    serviceA.sealEnvelope(EV, 1);
    serviceA.requestVerification(EV, 1, REQUESTER);
    assert.equal(serviceA.getEnvelope(EV, 1).verificationStatus, "VERIFICATION_PENDING");

    // The reviewer's exact exploit #2: a forged EVIDENCE_VERIFICATION entry
    // with next_status: "ACCEPTED" -- never a legal VERDICT_TARGETS output
    // (only VERIFIED or QUARANTINED are) -- appended directly through the
    // ledger, bypassing recordVerification()'s edge check and SoD gate
    // entirely.
    const env = envelope();
    const ledger = new DurableLedger({ filePath: path, ledgerId: "secb-evidence-seal-ledger" });
    const expectedSequence = ledger.read().length;
    const forgedVerification = {
      entryId: JSON.stringify([EV, 1, "VERIFICATION", "forged"]),
      projectId: env.project_id,
      workPackageId: env.work_package_id,
      sessionId: env.session_id,
      actorId: "attacker",
      type: "EVIDENCE_VERIFICATION",
      payload: {
        envelope: env,
        previous_status: "VERIFICATION_PENDING",
        next_status: "ACCEPTED", // forged: not a legal edge from VERIFICATION_PENDING
        content_hash: env.content_hash,
        verifier: "attacker",
        verdict: "pass",
        producer: PRODUCER
      },
      timestamp: clock().toISOString(),
      idempotencyKey: JSON.stringify(["VERIFICATION-forged", EV, 1])
    };
    ledger.append(forgedVerification, { expectedSequence });

    // Pre-fix: the record reached ACCEPTED with acceptorActorId: null,
    // approvals: null, and no acceptanceLedger receipt -- the entire
    // acceptEvidence() SoD gate and approvals requirement silently bypassed,
    // and verifyChain()'s ladder-coverage loop passed cleanly since it only
    // validates receipts that are already set. Post-fix: construction must
    // fail closed via #assertEdge before the illegal status is ever adopted.
    denies(() => freshInstance(path, clock), "DENY_UNDEFINED_TRANSITION");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// REHYDRATION TRANSITION-GUARD CONVERGENCE (round 3): closes the round-3
// independent review's finding (docs/03-project-control/candidates/
// mod-evid-s2-s3-rehydration-edge-legality-fix-independent-review-001.md,
// section 5) -- #assertEdge alone validates the ABSTRACT
// STATE_MACHINES.Evidence graph, but four live methods each enforce a
// NARROWER rule than raw graph-edge legality (a fixed single target, a
// pinned source status, or a verdict/approvals/SoD shape check).
// Reproduces the reviewer's exact four variants, all forged directly through
// DurableLedger.append() (bypassing EvidenceEnvelopeService's own API
// entirely), then adds a property-style parity test across a representative
// set of legitimate ledger histories produced through the real live API.
// ---------------------------------------------------------------------------

test("REHYDRATION SECURITY (round 3, variant 1): a forged EVIDENCE_VERIFICATION claiming next_status QUARANTINED immediately after SEAL, with no preceding EVIDENCE_VERIFICATION_REQUEST, is denied", () => {
  const directory = mkdtempSync(join(tmpdir(), "secb-evid-rehydrate-"));
  try {
    const path = join(directory, "evidence-seals.ndjson");
    const clock = () => new Date("2026-07-20T10:05:00+07:00");

    // Legitimate SEAL only through the real live API -- no request.
    const serviceA = freshInstance(path, clock);
    serviceA.registerEnvelope(envelope());
    serviceA.sealEnvelope(EV, 1);
    assert.equal(serviceA.getEnvelope(EV, 1).verificationStatus, "SEALED");

    // The forged entry: on the LIVE API, recordVerification() from status
    // SEALED (skipping requestVerification entirely) is always denied
    // DENY_UNDEFINED_TRANSITION by its explicit source guard -- this exact
    // ledger shape can never be produced by the live API at all.
    const env = envelope();
    const ledger = new DurableLedger({ filePath: path, ledgerId: "secb-evidence-seal-ledger" });
    const expectedSequence = ledger.read().length;
    const forgedVerification = {
      entryId: JSON.stringify([EV, 1, "VERIFICATION", "forged-v1"]),
      projectId: env.project_id,
      workPackageId: env.work_package_id,
      sessionId: env.session_id,
      actorId: "attacker",
      type: "EVIDENCE_VERIFICATION",
      payload: {
        envelope: env,
        previous_status: "SEALED",
        next_status: "QUARANTINED", // graph-legal from SEALED, but recordVerification() itself pins its source to VERIFICATION_PENDING
        content_hash: env.content_hash,
        verifier: "attacker",
        verdict: "fail",
        producer: PRODUCER
      },
      timestamp: clock().toISOString(),
      idempotencyKey: JSON.stringify(["VERIFICATION-forged-v1", EV, 1])
    };
    ledger.append(forgedVerification, { expectedSequence });

    denies(() => freshInstance(path, clock), "DENY_UNDEFINED_TRANSITION");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("REHYDRATION SECURITY (round 3, variant 2): a forged EVIDENCE_SEAL entry claiming sealed_status QUARANTINED as the FIRST/ONLY entry is denied", () => {
  const directory = mkdtempSync(join(tmpdir(), "secb-evid-rehydrate-"));
  try {
    const path = join(directory, "evidence-seals.ndjson");
    const ledger = new DurableLedger({ filePath: path, ledgerId: "secb-evidence-seal-ledger" });
    const env = envelope();

    // sealEnvelope() never writes anything but the ONE literal SEALED_STATE
    // (hardcoded); this exact ledger content is unreachable via the live API
    // for this entry type at all.
    const forgedSeal = {
      entryId: JSON.stringify([env.evidence_id, env.version, "SEAL"]),
      projectId: env.project_id,
      workPackageId: env.work_package_id,
      sessionId: env.session_id,
      actorId: "attacker",
      type: "EVIDENCE_SEAL",
      payload: {
        envelope: env,
        previous_status: "CAPTURED",
        sealed_status: "QUARANTINED", // graph-legal from CAPTURED, but sealEnvelope() itself can only ever write SEALED
        content_hash: env.content_hash
      },
      timestamp: "2026-07-20T10:05:00+07:00",
      idempotencyKey: JSON.stringify(["evidence-seal", env.evidence_id, env.version])
    };
    ledger.append(forgedSeal, { expectedSequence: 0 });

    denies(
      () => new EvidenceEnvelopeService({
        durableLedger: new DurableLedger({ filePath: path, ledgerId: "secb-evidence-seal-ledger" })
      }),
      "DENY_UNDEFINED_TRANSITION"
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("REHYDRATION SECURITY (round 3, variant 3): a forged EVIDENCE_VERIFICATION entry claiming an illegal next_status REJECTED is denied", () => {
  const directory = mkdtempSync(join(tmpdir(), "secb-evid-rehydrate-"));
  try {
    const path = join(directory, "evidence-seals.ndjson");
    const clock = () => new Date("2026-07-20T10:05:00+07:00");

    // Legitimate SEAL + VERIFICATION_REQUEST through the real live API.
    const serviceA = freshInstance(path, clock);
    serviceA.registerEnvelope(envelope());
    serviceA.sealEnvelope(EV, 1);
    serviceA.requestVerification(EV, 1, REQUESTER);
    assert.equal(serviceA.getEnvelope(EV, 1).verificationStatus, "VERIFICATION_PENDING");

    // VERDICT_TARGETS -- the only mapping recordVerification() ever consults
    // -- is { pass: VERIFIED, fail: QUARANTINED }. REJECTED is not a
    // producible output of this method under ANY verdict; a record showing
    // REJECTED is therefore always forged, by construction.
    const env = envelope();
    const ledger = new DurableLedger({ filePath: path, ledgerId: "secb-evidence-seal-ledger" });
    const expectedSequence = ledger.read().length;
    const forgedVerification = {
      entryId: JSON.stringify([EV, 1, "VERIFICATION", "forged-v3"]),
      projectId: env.project_id,
      workPackageId: env.work_package_id,
      sessionId: env.session_id,
      actorId: "attacker",
      type: "EVIDENCE_VERIFICATION",
      payload: {
        envelope: env,
        previous_status: "VERIFICATION_PENDING",
        next_status: "REJECTED", // not a legal VERDICT_TARGETS output for ANY verdict
        content_hash: env.content_hash,
        verifier: "attacker",
        verdict: "pass", // even paired with a superficially-legal verdict, the claimed target disagrees with it
        producer: PRODUCER
      },
      timestamp: clock().toISOString(),
      idempotencyKey: JSON.stringify(["VERIFICATION-forged-v3", EV, 1])
    };
    ledger.append(forgedVerification, { expectedSequence });

    denies(() => freshInstance(path, clock), "DENY_UNDEFINED_TRANSITION");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("REHYDRATION SECURITY (round 3, variant 4 -- most severe): a forged EVIDENCE_ACCEPTANCE entry retroactively downgrading an already-legitimately-ACCEPTED record to QUARANTINED is denied", () => {
  const directory = mkdtempSync(join(tmpdir(), "secb-evid-rehydrate-"));
  try {
    const path = join(directory, "evidence-seals.ndjson");
    const clock = () => new Date("2026-07-20T10:05:00+07:00");

    // Run the FULL real ladder through the live API to a genuine ACCEPTED.
    const serviceA = freshInstance(path, clock);
    serviceA.registerEnvelope(envelope());
    serviceA.sealEnvelope(EV, 1);
    serviceA.requestVerification(EV, 1, REQUESTER);
    serviceA.recordVerification(EV, 1, VERIFIER, "pass");
    serviceA.acceptEvidence(EV, 1, ACCEPTOR, APPROVALS);
    assert.equal(serviceA.getEnvelope(EV, 1).verificationStatus, "ACCEPTED");

    // Append ONE forged EVIDENCE_ACCEPTANCE entry claiming next_status
    // QUARANTINED. acceptEvidence() never writes anything but the ONE
    // literal ACCEPTED_STATE, so this exact shape can never come from the
    // live API -- yet, pre-round-3, raw #assertEdge(ACCEPTED, QUARANTINED)
    // was graph-legal and rehydration silently overwrote a real, SoD-checked,
    // approved acceptance with an attacker-controlled quarantine.
    const env = envelope();
    const ledger = new DurableLedger({ filePath: path, ledgerId: "secb-evidence-seal-ledger" });
    const expectedSequence = ledger.read().length;
    const forgedAcceptance = {
      entryId: JSON.stringify([EV, 1, "ACCEPTANCE", "forged-v4"]),
      projectId: env.project_id,
      workPackageId: env.work_package_id,
      sessionId: env.session_id,
      actorId: "attacker",
      type: "EVIDENCE_ACCEPTANCE",
      payload: {
        envelope: env,
        previous_status: "ACCEPTED",
        next_status: "QUARANTINED", // graph-legal from ACCEPTED, but acceptEvidence() itself can only ever write ACCEPTED
        content_hash: env.content_hash,
        acceptor: "attacker",
        approvals: ["forged-approval"],
        producer: PRODUCER,
        verifier: VERIFIER
      },
      timestamp: clock().toISOString(),
      idempotencyKey: JSON.stringify(["ACCEPTANCE-forged-v4", EV, 1])
    };
    ledger.append(forgedAcceptance, { expectedSequence });

    denies(() => freshInstance(path, clock), "DENY_UNDEFINED_TRANSITION");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

// Full-state parity: for a representative set of legitimate ledger histories
// produced entirely through the real live API, a freshly-rehydrated instance
// must expose EXACTLY the same observable state (getEnvelope + verifyChain)
// as the live instance that produced that history -- not merely "denies the
// four known-bad forgeries," but "agrees byte-for-byte with the live ladder
// on everything it legitimately produced." Mechanical cross-check, not point
// examples: extends the existing REHYDRATION scenarios into one parity
// assertion reused across five representative histories.
function assertFullStateParity(serviceA, serviceB, identities) {
  const evidenceIds = new Set();
  for (const [evidenceId, version] of identities) {
    evidenceIds.add(evidenceId);
    assert.deepEqual(
      serviceB.getEnvelope(evidenceId, version),
      serviceA.getEnvelope(evidenceId, version),
      `getEnvelope(${evidenceId}, v${version}) must match exactly after rehydration`
    );
  }
  for (const evidenceId of evidenceIds) {
    assert.deepEqual(
      serviceB.verifyChain(evidenceId),
      serviceA.verifyChain(evidenceId),
      `verifyChain(${evidenceId}) must match exactly after rehydration`
    );
  }
}

test("REHYDRATION PARITY: a rehydrated instance's full observable state matches the live instance's, across representative legitimate histories", () => {
  const directory = mkdtempSync(join(tmpdir(), "secb-evid-rehydrate-parity-"));
  try {
    const path = join(directory, "evidence-seals.ndjson");
    const clock = () => new Date("2026-07-20T10:05:00+07:00");
    const serviceA = freshInstance(path, clock);
    const identities = [];

    // Scenario 1: full ladder to ACCEPTED.
    serviceA.registerEnvelope(envelope({ evidence_id: "ev_parity_accepted", version: 1 }));
    serviceA.sealEnvelope("ev_parity_accepted", 1);
    serviceA.requestVerification("ev_parity_accepted", 1, REQUESTER);
    serviceA.recordVerification("ev_parity_accepted", 1, VERIFIER, "pass");
    serviceA.acceptEvidence("ev_parity_accepted", 1, ACCEPTOR, APPROVALS);
    identities.push(["ev_parity_accepted", 1]);

    // Scenario 2: quarantined via a failed verdict (QUARANTINED reached
    // legitimately, from VERIFICATION_PENDING).
    serviceA.registerEnvelope(envelope({ evidence_id: "ev_parity_quarantined", version: 1 }));
    serviceA.sealEnvelope("ev_parity_quarantined", 1);
    serviceA.requestVerification("ev_parity_quarantined", 1, REQUESTER);
    serviceA.recordVerification("ev_parity_quarantined", 1, VERIFIER, "fail");
    identities.push(["ev_parity_quarantined", 1]);

    // Scenario 3: verified but never accepted.
    serviceA.registerEnvelope(envelope({ evidence_id: "ev_parity_verified", version: 1 }));
    serviceA.sealEnvelope("ev_parity_verified", 1);
    serviceA.requestVerification("ev_parity_verified", 1, REQUESTER);
    serviceA.recordVerification("ev_parity_verified", 1, VERIFIER, "pass");
    identities.push(["ev_parity_verified", 1]);

    // Scenario 4: mid-ladder, sealed only.
    serviceA.registerEnvelope(envelope({ evidence_id: "ev_parity_sealed", version: 1 }));
    serviceA.sealEnvelope("ev_parity_sealed", 1);
    identities.push(["ev_parity_sealed", 1]);

    // Scenario 5: multiple versions of the SAME evidence_id at different
    // ladder stages (exercises recordKey isolation across versions).
    serviceA.registerEnvelope(envelope({ evidence_id: "ev_parity_multi", version: 1 }));
    serviceA.sealEnvelope("ev_parity_multi", 1);
    serviceA.requestVerification("ev_parity_multi", 1, REQUESTER);
    serviceA.recordVerification("ev_parity_multi", 1, VERIFIER, "pass");
    serviceA.acceptEvidence("ev_parity_multi", 1, ACCEPTOR, APPROVALS);
    serviceA.registerEnvelope(envelope({ evidence_id: "ev_parity_multi", version: 2 }));
    serviceA.sealEnvelope("ev_parity_multi", 2);
    identities.push(["ev_parity_multi", 1], ["ev_parity_multi", 2]);

    const serviceB = freshInstance(path, clock);
    assertFullStateParity(serviceA, serviceB, identities);

    // Parity is not a one-shot coincidence of the first restart: drive one
    // more legitimate transition on the rehydrated instance B, then rehydrate
    // a THIRD instance from B's continuation of the same ledger and confirm
    // it too matches B (and therefore A + B) exactly.
    serviceB.requestVerification("ev_parity_sealed", 1, REQUESTER);
    identities.push(["ev_parity_sealed", 1]);
    const serviceC = freshInstance(path, clock);
    assertFullStateParity(serviceB, serviceC, identities);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// ROUND 4: envelope-establishment convergence (independent review of the
// round-3 transition-guard convergence, docs/03-project-control/candidates/
// mod-evid-s2-s3-rehydration-guard-parity-fix-independent-review-001.md,
// section 6) -- round 3 converged every live method's TRANSITION guard with
// #rehydrate(), but none of those guards ever run on the record's CREATION:
// the very first EVIDENCE_SEAL entry for a never-before-seen key. On the
// live path, registerEnvelope() gates creation with schema validation,
// content_hash self-consistency, and a forge-on-entry status check, BEFORE
// any record is ever admitted -- and registerEnvelope() itself never
// reaches the ledger, so the first EVIDENCE_SEAL entry is the SOLE
// ledger-visible proxy for that whole creation event. Pre-fix, #rehydrate()
// gated first-sighting SEAL entries on nothing but "does envelope have a
// string evidence_id and an integer version" -- a wholly fabricated
// envelope (missing most required fields, an arbitrary non-matching
// content_hash, an attacker-chosen actor_id) rehydrated as a legitimate
// SEALED record, and three more forged-but-internally-consistent entries
// walked it all the way to ACCEPTED with resolveAccepted() reporting
// ok: true for a completely fabricated record with no legitimate founding
// envelope at all.
// ---------------------------------------------------------------------------

function appendRaw(ledgerPath, entry, expectedSequence) {
  const ledger = new DurableLedger({ filePath: ledgerPath, ledgerId: "secb-evidence-seal-ledger" });
  ledger.append(entry, { expectedSequence });
}

function forgedSealEntry(envelope, { sealedStatus = "SEALED", timestamp = "2026-07-21T10:05:00+07:00" } = {}) {
  return {
    entryId: JSON.stringify([envelope.evidence_id, envelope.version, "SEAL", "forged"]),
    projectId: "unknown",
    workPackageId: "unknown",
    sessionId: "unknown",
    actorId: "attacker",
    type: "EVIDENCE_SEAL",
    payload: {
      envelope,
      previous_status: "CAPTURED",
      sealed_status: sealedStatus,
      content_hash: envelope.content_hash
    },
    timestamp,
    idempotencyKey: JSON.stringify(["evidence-seal-forged", envelope.evidence_id, envelope.version])
  };
}

test("REHYDRATION SECURITY (round 4): the reviewer's exact scenario -- a forged EVIDENCE_SEAL entry with a malformed envelope (missing most required fields) and a non-matching content_hash, as the FIRST/ONLY entry -- is denied, not silently rehydrated to SEALED", () => {
  const directory = mkdtempSync(join(tmpdir(), "secb-evid-rehydrate-round4-"));
  try {
    const path = join(directory, "evidence-seals.ndjson");
    // A never-registered identity: only 5 of the 17 required envelope
    // fields present, and a content_hash that is not a fingerprint of
    // anything -- exactly the reviewer's construction.
    const forgedEnvelope = {
      evidence_id: "ev_round4_forged",
      version: 1,
      actor_id: "attacker-controlled-producer",
      verification_status: "CAPTURED",
      content_hash: "deadbeef".repeat(8)
    };
    appendRaw(path, forgedSealEntry(forgedEnvelope), 0);

    // Pre-fix: this rehydrated as a fully legitimate SEALED record.
    // Post-fix: #assertEnvelopeEstablishment's schema gate runs first and
    // denies before any record is ever created -- the whole construction
    // fails closed, matching this file's established convention.
    assert.throws(
      () => freshInstance(path, () => new Date("2026-07-21T10:05:00+07:00")),
      (e) => e instanceof ContractValidationError && e.code === "DENY_CONTRACT_INVALID"
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("REHYDRATION SECURITY (round 4): the reviewer's exact scenario walked to ACCEPTED via three more forged-but-internally-consistent entries -- denied at the founding SEAL, never reaches ACCEPTED", () => {
  const directory = mkdtempSync(join(tmpdir(), "secb-evid-rehydrate-round4-"));
  try {
    const path = join(directory, "evidence-seals.ndjson");
    const EVX = "ev_round4_forged_ladder";
    const forgedEnvelope = {
      evidence_id: EVX,
      version: 1,
      actor_id: "attacker-producer",
      verification_status: "CAPTURED",
      content_hash: "deadbeef".repeat(8)
    };

    appendRaw(path, forgedSealEntry(forgedEnvelope), 0);
    appendRaw(path, {
      entryId: JSON.stringify([EVX, 1, "VERIFICATION_REQUEST", "forged"]),
      projectId: "unknown", workPackageId: "unknown", sessionId: "unknown",
      actorId: "attacker-requester",
      type: "EVIDENCE_VERIFICATION_REQUEST",
      payload: { envelope: forgedEnvelope, previous_status: "SEALED", next_status: "VERIFICATION_PENDING", requested_by: "attacker-requester" },
      timestamp: "2026-07-21T10:06:00+07:00",
      idempotencyKey: JSON.stringify(["evidence-verification-request-forged", EVX, 1])
    }, 1);
    appendRaw(path, {
      entryId: JSON.stringify([EVX, 1, "VERIFICATION", "forged"]),
      projectId: "unknown", workPackageId: "unknown", sessionId: "unknown",
      actorId: "attacker-verifier",
      type: "EVIDENCE_VERIFICATION",
      payload: { envelope: forgedEnvelope, previous_status: "VERIFICATION_PENDING", next_status: "VERIFIED", verifier: "attacker-verifier", verdict: "pass", producer: "attacker-producer" },
      timestamp: "2026-07-21T10:07:00+07:00",
      idempotencyKey: JSON.stringify(["evidence-verification-forged", EVX, 1])
    }, 2);
    appendRaw(path, {
      entryId: JSON.stringify([EVX, 1, "ACCEPTANCE", "forged"]),
      projectId: "unknown", workPackageId: "unknown", sessionId: "unknown",
      actorId: "attacker-acceptor",
      type: "EVIDENCE_ACCEPTANCE",
      payload: { envelope: forgedEnvelope, previous_status: "VERIFIED", next_status: "ACCEPTED", acceptor: "attacker-acceptor", approvals: ["forged-approval"], producer: "attacker-producer", verifier: "attacker-verifier" },
      timestamp: "2026-07-21T10:08:00+07:00",
      idempotencyKey: JSON.stringify(["evidence-acceptance-forged", EVX, 1])
    }, 3);

    // Pre-fix: this fully fabricated identity -- three distinct
    // attacker-controlled actor ids, no genuine founding envelope
    // whatsoever -- reached ACCEPTED, and resolveAccepted() (the actual S3
    // consumption port) returned ok: true. Post-fix: construction denies
    // at the founding SEAL entry before any of the other three forged
    // entries are ever folded.
    assert.throws(
      () => freshInstance(path, () => new Date("2026-07-21T10:08:00+07:00")),
      (e) => e instanceof ContractValidationError && e.code === "DENY_CONTRACT_INVALID"
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("REHYDRATION SECURITY (round 4): a forged EVIDENCE_SEAL entry with a schema-valid envelope but a non-matching content_hash, as the FIRST/ONLY entry, is denied (DENY_CONTENT_HASH_MISMATCH)", () => {
  const directory = mkdtempSync(join(tmpdir(), "secb-evid-rehydrate-round4-"));
  try {
    const path = join(directory, "evidence-seals.ndjson");
    // Schema-complete (all 17 required fields present, satisfies the
    // contract), but content_hash was never recomputed over this exact
    // body -- a swapped/tampered envelope presented as a fresh seal.
    const forgedEnvelope = { ...envelope({ evidence_id: "ev_round4_hash_mismatch", version: 1 }), content_hash: "1".repeat(64) };
    appendRaw(path, forgedSealEntry(forgedEnvelope), 0);

    assert.throws(
      () => freshInstance(path, () => new Date("2026-07-21T10:05:00+07:00")),
      (e) => e instanceof EvidenceEnvelopeServiceError && e.code === "DENY_CONTENT_HASH_MISMATCH"
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("REHYDRATION SECURITY (round 4): a forged EVIDENCE_SEAL entry with a schema-valid, content-hash-consistent envelope whose verification_status is already ACCEPTED (forge-on-entry), as the FIRST/ONLY entry, is denied (DENY_STATUS_FORGERY) even though the entry's OWN sealed_status literal is the legal SEALED value", () => {
  const directory = mkdtempSync(join(tmpdir(), "secb-evid-rehydrate-round4-"));
  try {
    const path = join(directory, "evidence-seals.ndjson");
    // The entry's payload.sealed_status is the one literal
    // #assertSealTransition ever accepts (SEALED) -- the round-3 guard
    // alone would NOT catch this, because it never inspects
    // envelope.verification_status at all. Only the establishment guard's
    // forge-on-entry check (the same one registerEnvelope() runs) does.
    const forgedEnvelope = envelope({ evidence_id: "ev_round4_status_forgery", version: 1, verification_status: "ACCEPTED" });
    appendRaw(path, forgedSealEntry(forgedEnvelope, { sealedStatus: "SEALED" }), 0);

    assert.throws(
      () => freshInstance(path, () => new Date("2026-07-21T10:05:00+07:00")),
      (e) => e instanceof EvidenceEnvelopeServiceError && e.code === "DENY_STATUS_FORGERY"
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("REHYDRATION SECURITY (round 4): a SECOND forged EVIDENCE_SEAL entry for an ALREADY-established key, embedding a DIFFERENT (malformed, non-matching) envelope, is still denied by the pre-existing transition guard -- establishment is asserted ONLY on true first sighting, re-seal remains structurally impossible regardless", () => {
  const directory = mkdtempSync(join(tmpdir(), "secb-evid-rehydrate-round4-"));
  try {
    const path = join(directory, "evidence-seals.ndjson");
    const clock = () => new Date("2026-07-21T10:05:00+07:00");

    // A genuine, legitimately-established SEAL through the real live API.
    const serviceA = freshInstance(path, clock);
    serviceA.registerEnvelope(envelope({ evidence_id: "ev_round4_reseal", version: 1 }));
    serviceA.sealEnvelope("ev_round4_reseal", 1);
    assert.equal(serviceA.getEnvelope("ev_round4_reseal", 1).verificationStatus, "SEALED");

    // Append a SECOND, wholly-forged SEAL entry for the SAME key,
    // attempting to swap the established envelope's content -- this
    // record already exists, so #assertEnvelopeEstablishment is never
    // even called for it (see the "only on true first sighting" comment
    // in #rehydrate()); it must instead be denied by #assertSealTransition,
    // because SEALED has no inbound edge except from CAPTURED.
    const swapEnvelope = {
      evidence_id: "ev_round4_reseal",
      version: 1,
      actor_id: "attacker",
      verification_status: "CAPTURED",
      content_hash: "deadbeef".repeat(8)
    };
    appendRaw(path, forgedSealEntry(swapEnvelope), 1);

    assert.throws(
      () => freshInstance(path, clock),
      (e) => e instanceof EvidenceEnvelopeServiceError && e.code === "DENY_UNDEFINED_TRANSITION"
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("ENVELOPE-ESTABLISHMENT PARITY: registerEnvelope() (live) and #rehydrate()'s first-sighting SEAL branch enforce IDENTICAL creation-time rules, same deny codes for the same malformed input", () => {
  const cases = [
    {
      name: "malformed/missing-fields envelope",
      build: () => ({ evidence_id: "ev_parity_estab_1", version: 1, actor_id: "x", verification_status: "CAPTURED", content_hash: "deadbeef".repeat(8) }),
      code: "DENY_CONTRACT_INVALID",
      errorClass: ContractValidationError
    },
    {
      name: "content_hash mismatch",
      build: () => ({ ...envelope({ evidence_id: "ev_parity_estab_2", version: 1 }), content_hash: "2".repeat(64) }),
      code: "DENY_CONTENT_HASH_MISMATCH",
      errorClass: EvidenceEnvelopeServiceError
    },
    {
      name: "forge-on-entry (verification_status already ACCEPTED)",
      build: () => envelope({ evidence_id: "ev_parity_estab_3", version: 1, verification_status: "ACCEPTED" }),
      code: "DENY_STATUS_FORGERY",
      errorClass: EvidenceEnvelopeServiceError
    }
  ];

  for (const { name, build, code, errorClass } of cases) {
    // Live path.
    withHarness(({ service }) => {
      assert.throws(
        () => service.registerEnvelope(build()),
        (e) => e instanceof errorClass && e.code === code,
        `registerEnvelope() must deny ${code} for: ${name}`
      );
    });

    // Rehydration path: the same envelope, as a forged first-sighting SEAL
    // entry, must be denied with the SAME code.
    const directory = mkdtempSync(join(tmpdir(), "secb-evid-rehydrate-round4-parity-"));
    try {
      const path = join(directory, "evidence-seals.ndjson");
      appendRaw(path, forgedSealEntry(build()), 0);
      assert.throws(
        () => freshInstance(path, () => new Date("2026-07-21T10:05:00+07:00")),
        (e) => e instanceof errorClass && e.code === code,
        `#rehydrate() must deny ${code} for: ${name}`
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

test("REHYDRATION: normal single-instance lifecycle is entirely unaffected (no double-rehydration drift)", () => withHarness(({ service }) => {
  // The construction-time rehydrate() on an empty, freshly-created ledger
  // must be a no-op: identical to pre-fix behavior for the common case of a
  // single continuously-running instance.
  const registered = service.registerEnvelope(envelope());
  assert.equal(registered.verificationStatus, "CAPTURED");
  const sealed = service.sealEnvelope(EV, 1);
  assert.equal(sealed.verificationStatus, "SEALED");
  const requested = service.requestVerification(EV, 1, REQUESTER);
  assert.equal(requested.verificationStatus, "VERIFICATION_PENDING");
  const verified = service.recordVerification(EV, 1, VERIFIER, "pass");
  assert.equal(verified.verificationStatus, "VERIFIED");
  const accepted = service.acceptEvidence(EV, 1, ACCEPTOR, APPROVALS);
  assert.equal(accepted.verificationStatus, "ACCEPTED");
  const chain = service.verifyChain(EV);
  assert.equal(chain.valid, true);
  assert.deepEqual(chain.acceptedVersions, [1]);
}));
