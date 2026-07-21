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
