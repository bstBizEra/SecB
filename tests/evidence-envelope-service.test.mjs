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
