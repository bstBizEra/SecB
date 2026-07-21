// Unit tests for the MOD-SKILL-S1 skill candidate intake registry.
// Covers every deny path (fail-closed), the duplicate/charset guards, the
// audit-first ledger discipline, producer-or-governance withdrawal (SoD
// sourced only from injected kernel config), and frozen/data-untrusted reads.
// Also guards that the S1 slice does NOT touch the existing skill-resolver or
// SoD rules (byte-identity assertion) and exposes NO promotion/revocation
// surface.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateContract } from "../src/contracts/contract-validator.mjs";
import {
  SkillCandidateRegistry,
  GOVERNANCE_ROLE,
} from "../src/registry/skill-candidate-registry.mjs";

const FIXED_NOW = () => new Date("2026-07-20T10:00:00.000Z");
const PRODUCER = "bst-motor";
const GOV_ACTOR = "operator.gov.01";

const validCandidate = (overrides = {}) => ({
  skill_candidate_id: "skill.pdf.extract",
  version: "0.1.0",
  name: "PDF table extraction",
  purpose: "Extract tabular data from PDF documents into structured rows.",
  status: "CANDIDATE",
  source_identity: {
    maintainer: PRODUCER,
    repository: "https://github.com/bstBizEra/SecB",
    namespace: "@secb/skill-pdf-extract",
  },
  immutable_version: {
    commit: "0a1b2c3d4e5f60718293a4b5c6d7e8f901234567",
    tag_or_digest: "sha256:bb22cc33dd44ee55ff667788990011223344556677889900aabbccddeeff1122",
  },
  integrity: {
    sha256: "bb22cc33dd44ee55ff667788990011223344556677889900aabbccddeeff1122",
  },
  tool_inventory: ["read_text_file", "list_directory"],
  filesystem_boundary: "workspace-lease-root-read-only",
  network_boundary: "none",
  credential_handle: null,
  harness_compatibility: [
    { harness_id: "claude-code", compatibility_level: "C3" },
  ],
  intake_evidence_refs: ["evidence:intake:skill-pdf-extract:0001"],
  withdrawal: { withdrawn: false, reason: null },
  ...overrides,
});

const producerAuth = (overrides = {}) => ({
  role: "producer",
  actor_id: PRODUCER,
  decided_at: "2026-07-20T09:00:00.000Z",
  ...overrides,
});

const governanceAuth = (overrides = {}) => ({
  role: GOVERNANCE_ROLE,
  actor_id: GOV_ACTOR,
  decided_at: "2026-07-20T09:05:00.000Z",
  ...overrides,
});

function build({ ledgerWriter, schemaValidator, now, kernelConfig } = {}) {
  const entries = [];
  const service = new SkillCandidateRegistry({
    schemaValidator: schemaValidator ?? ((record) => validateContract("skillCandidate", record)),
    ledgerWriter: ledgerWriter ?? ((entry) => entries.push(entry)),
    now: now ?? FIXED_NOW,
    kernelConfig: kernelConfig ?? { governanceActors: [GOV_ACTOR] },
  });
  return { service, entries };
}

// --- construction --------------------------------------------------------

test("constructor fails closed without validator, ledger writer, or clock", () => {
  assert.throws(() => new SkillCandidateRegistry({}), /schemaValidator/);
  assert.throws(() => new SkillCandidateRegistry({ schemaValidator: () => true }), /ledgerWriter/);
  assert.throws(
    () => new SkillCandidateRegistry({ schemaValidator: () => true, ledgerWriter: () => {}, now: null }),
    /now/,
  );
});

// --- registration deny paths --------------------------------------------

test("schema-invalid record denies with DENY_RECORD_INVALID", () => {
  const { service } = build();
  const record = validCandidate();
  delete record.integrity;
  const outcome = service.registerCandidate(record);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.deny_code, "DENY_RECORD_INVALID");
});

test("a record submitted as already withdrawn cannot enter intake", () => {
  const { service } = build();
  const outcome = service.registerCandidate(validCandidate({
    status: "WITHDRAWN",
    withdrawal: { withdrawn: true, reason: "pulled" },
  }));
  assert.equal(outcome.deny_code, "DENY_RECORD_INVALID");
});

test("reserved composite-key delimiters in identity fields deny DENY_ID_CHARSET", () => {
  const { service } = build();
  assert.equal(service.registerCandidate(validCandidate({ skill_candidate_id: "skill@evil" })).deny_code, "DENY_ID_CHARSET");
  assert.equal(service.registerCandidate(validCandidate({ version: "0.1.0|x" })).deny_code, "DENY_ID_CHARSET");
});

test("duplicate candidate version denies", () => {
  const { service } = build();
  assert.equal(service.registerCandidate(validCandidate()).ok, true);
  assert.equal(service.registerCandidate(validCandidate()).deny_code, "DENY_DUPLICATE_CANDIDATE_VERSION");
});

test("invalid clock denies fail-closed", () => {
  const { service } = build({ now: () => "not-a-date" });
  assert.equal(service.registerCandidate(validCandidate()).deny_code, "DENY_CLOCK_UNAVAILABLE");
});

test("intake status is forced to CANDIDATE and no promotion surface exists", () => {
  const { service } = build();
  const outcome = service.registerCandidate(validCandidate());
  assert.equal(outcome.ok, true);
  assert.equal(outcome.status, "CANDIDATE");
  // The S1 registry deliberately exposes no promotion or revocation methods.
  assert.equal(typeof service.promote, "undefined");
  assert.equal(typeof service.revoke, "undefined");
  assert.equal(typeof service.resolve, "undefined");
});

// --- audit-first discipline ---------------------------------------------

test("throwing ledger writer denies registration with no state change (audit-first)", () => {
  const { service } = build({ ledgerWriter: () => { throw new Error("ledger unavailable"); } });
  const outcome = service.registerCandidate(validCandidate());
  assert.equal(outcome.deny_code, "DENY_AUDIT_UNAVAILABLE");
  const probe = build().service;
  assert.equal(probe.getCandidate("skill.pdf.extract", "0.1.0").deny_code, "DENY_UNKNOWN_CANDIDATE");
});

test("ledger write precedes registry effect", () => {
  const entries = [];
  const { service } = build({ ledgerWriter: (entry) => entries.push(entry) });
  service.registerCandidate(validCandidate());
  assert.equal(entries.length, 1);
  assert.equal(entries[0].component, "skill-candidate-registry");
  assert.equal(entries[0].event, "REGISTER_CANDIDATE");
  assert.equal(entries[0].disposition, "ALLOW");
  assert.equal(entries[0].attempted_at, "2026-07-20T10:00:00.000Z");
  assert.equal(entries[0].producer, PRODUCER);
});

test("a denied registration is still audited (deny disposition recorded)", () => {
  const entries = [];
  const { service } = build({ ledgerWriter: (entry) => entries.push(entry) });
  service.registerCandidate(validCandidate({ skill_candidate_id: "skill@evil" }));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].disposition, "DENY_ID_CHARSET");
});

// --- withdrawal (producer-or-governance, SoD via kernel config) ----------

test("withdrawal requires a reason", () => {
  const { service } = build();
  service.registerCandidate(validCandidate());
  assert.equal(service.withdrawCandidate("skill.pdf.extract", "0.1.0", "", producerAuth()).deny_code, "DENY_WITHDRAWAL_INVALID");
});

test("withdrawal with a malformed authorization denies", () => {
  const { service } = build();
  service.registerCandidate(validCandidate());
  for (const auth of [undefined, {}, producerAuth({ actor_id: "" }), producerAuth({ decided_at: "not-a-date" })]) {
    assert.equal(service.withdrawCandidate("skill.pdf.extract", "0.1.0", "obsolete", auth).deny_code, "DENY_AUTHORIZATION");
  }
});

test("withdrawal of an unknown candidate denies", () => {
  const { service } = build();
  assert.equal(service.withdrawCandidate("skill.pdf.extract", "0.1.0", "obsolete", producerAuth()).deny_code, "DENY_UNKNOWN_CANDIDATE");
});

test("the producer can withdraw its own candidate", () => {
  const { service, entries } = build();
  service.registerCandidate(validCandidate());
  const outcome = service.withdrawCandidate("skill.pdf.extract", "0.1.0", "superseded", producerAuth());
  assert.equal(outcome.ok, true);
  assert.equal(outcome.status, "WITHDRAWN");
  assert.deepEqual(entries.map((e) => `${e.event}:${e.disposition}`), [
    "REGISTER_CANDIDATE:ALLOW",
    "WITHDRAW_CANDIDATE:ALLOW",
  ]);
});

test("a config-listed governance actor can withdraw a candidate", () => {
  const { service } = build();
  service.registerCandidate(validCandidate());
  const outcome = service.withdrawCandidate("skill.pdf.extract", "0.1.0", "policy breach", governanceAuth());
  assert.equal(outcome.ok, true);
  assert.equal(outcome.status, "WITHDRAWN");
});

test("a governance role claim from an actor absent from kernel config is not authorized", () => {
  const { service } = build({ kernelConfig: { governanceActors: [] } });
  service.registerCandidate(validCandidate());
  // Correct role string, but the actor is not declared in the kernel config:
  // SoD is config-only, so the self-asserted role does not authorize.
  assert.equal(service.withdrawCandidate("skill.pdf.extract", "0.1.0", "x", governanceAuth()).deny_code, "DENY_NOT_AUTHORIZED");
});

test("a non-producer non-governance actor cannot withdraw", () => {
  const { service } = build();
  service.registerCandidate(validCandidate());
  const stranger = { role: "producer", actor_id: "mallory", decided_at: "2026-07-20T09:00:00.000Z" };
  assert.equal(service.withdrawCandidate("skill.pdf.extract", "0.1.0", "x", stranger).deny_code, "DENY_NOT_AUTHORIZED");
});

test("a candidate cannot be withdrawn twice", () => {
  const { service } = build();
  service.registerCandidate(validCandidate());
  service.withdrawCandidate("skill.pdf.extract", "0.1.0", "superseded", producerAuth());
  assert.equal(service.withdrawCandidate("skill.pdf.extract", "0.1.0", "again", producerAuth()).deny_code, "DENY_ALREADY_WITHDRAWN");
});

test("throwing ledger writer denies withdrawal and leaves status CANDIDATE", () => {
  let fail = false;
  const { service } = build({
    ledgerWriter: (entry) => { if (fail) throw new Error("ledger unavailable"); void entry; },
  });
  service.registerCandidate(validCandidate());
  fail = true;
  assert.equal(service.withdrawCandidate("skill.pdf.extract", "0.1.0", "x", producerAuth()).deny_code, "DENY_AUDIT_UNAVAILABLE");
  fail = false;
  assert.equal(service.getCandidate("skill.pdf.extract", "0.1.0").record.status, "CANDIDATE");
});

// --- reads: frozen, data-untrusted --------------------------------------

test("getCandidate returns a deeply-frozen, data-untrusted record", () => {
  const { service } = build();
  service.registerCandidate(validCandidate());
  const outcome = service.getCandidate("skill.pdf.extract", "0.1.0");
  assert.equal(outcome.ok, true);
  assert.equal(outcome.data_untrusted, true);
  assert.equal(Object.isFrozen(outcome.record), true);
  assert.equal(Object.isFrozen(outcome.record.source_identity), true);
  assert.throws(() => { outcome.record.status = "PUBLISHED"; }, TypeError);
});

test("getCandidate of an unknown id/version denies", () => {
  const { service } = build();
  assert.equal(service.getCandidate("skill.pdf.extract", "0.1.0").deny_code, "DENY_UNKNOWN_CANDIDATE");
});

test("listCandidates returns frozen, data-untrusted summaries and is not ledgered", () => {
  const entries = [];
  const { service } = build({ ledgerWriter: (entry) => entries.push(entry) });
  service.registerCandidate(validCandidate());
  service.registerCandidate(validCandidate({ version: "0.2.0" }));
  const listed = service.listCandidates();
  assert.equal(listed.ok, true);
  assert.equal(listed.data_untrusted, true);
  assert.equal(Object.isFrozen(listed.candidates), true);
  assert.deepEqual(listed.candidates.map((c) => `${c.skill_candidate_id}@${c.version}:${c.status}`), [
    "skill.pdf.extract@0.1.0:CANDIDATE",
    "skill.pdf.extract@0.2.0:CANDIDATE",
  ]);
  // Two registrations, zero read audit entries.
  assert.equal(entries.length, 2);
});

// --- guard: S1 does not touch the existing resolver or SoD rules ----------

test("skill-resolver.mjs and sod-rules.mjs are byte-identical to main (S1 adds no surface there)", () => {
  const digests = {
    "src/registry/skill-resolver.mjs": "bfa958a41868a1c451831f8f5fd8de7e4db9fdf952e7e562786af88bb6d2912f",
    // Repinned by mod-gov-s1-sod-rules-hardening-fix-001 (see
    // mod-gov-s1-sod-rules-hardening-fix-producer-verification-001.md).
    "src/control/sod-rules.mjs": "2d951ed7935bebaab2951c4c0dee420e4169ebf9e3a2903c751328753a3a894f",
  };
  for (const [file, expected] of Object.entries(digests)) {
    const actual = createHash("sha256")
      .update(readFileSync(resolve(import.meta.dirname, "..", file)))
      .digest("hex");
    assert.equal(actual, expected, `${file} must remain untouched in S1`);
  }
});
