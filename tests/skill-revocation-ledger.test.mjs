// Tests for the MOD-SKILL Slice S3 governed revocation primitive
// (src/ledger/skill-revocation-ledger.mjs), an UNWIRED CANDIDATE built on the
// same two reused primitives as the S2 sibling, per
// docs/03-project-control/candidates/mod-skill-gap-assessment-001.md §5.3 / §7
// (IMM-SKILL-V1, components 1+2 ONLY — resolution-time re-validation is the
// out-of-scope component 3):
//   - src/control/approval-binding.mjs (N-5 SoD evaluation, exact-action/
//     version bind) — imported read-only, never re-derived.
//   - DurableLedger's `preWriteCheck` hook (src/ledger/durable-ledger.mjs) —
//     the atomic-from-day-one "already revoked" terminal-state gate.
//
// Five groups of coverage:
//   1. Legitimate revocation (single version + all versions), decision bound.
//   2. Already-revoked terminal denial, proved genuinely atomic via a PROBE1-
//      style regression (mirrors the S2 / mod-wspace-s3 regression test).
//   3. SoD violation denial, reusing approval-binding's own disposition matrix
//      (parity, not reimplementation).
//   4. Risk-floor, reason, version-set, and charset structural denials.
//   5. Malformed-input fail-closed cases, inherited base-ledger behavior, and
//      reuse / unwired / skill-resolver-untouched guards.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  REVOKE_SKILL_ACTION,
  SkillRevocationLedger
} from "../src/ledger/skill-revocation-ledger.mjs";
import { evaluateApprovalBinding, INDEPENDENT_REVIEW_ROLE, GOVERNANCE_ROLE } from "../src/control/approval-binding.mjs";
import { LedgerError } from "../src/ledger/durable-ledger.mjs";

function withTempLedger(operation) {
  const directory = mkdtempSync(join(tmpdir(), "secb-skill-revocation-"));
  try {
    return operation(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const CONTENT_HASH = "b".repeat(64);
const PRODUCER = "claude-motor";
const REVIEWER = "agent.claude.rev.01";
const APPROVER = "operator.gov.01";

function approvals(overrides = {}) {
  return [
    { role: INDEPENDENT_REVIEW_ROLE, actor_id: REVIEWER, decided_at: "2026-07-22T09:00:00Z" },
    { role: GOVERNANCE_ROLE, actor_id: APPROVER, decided_at: "2026-07-22T09:05:00Z" },
    ...(overrides.extra ?? [])
  ];
}

function baseRequest(overrides = {}) {
  return {
    skillId: "skill.demo.example",
    skillVersion: "1.0.0",
    reason: "confirmed security regression in v1.0.0",
    producerActorId: PRODUCER,
    approvals: approvals(),
    roleMatchMode: "strict",
    riskClass: "R3",
    decisionId: "dec_skill_revocation_001",
    projectId: "prj_secb_local",
    workPackageId: "wp_p0_modskill_s3_001",
    sessionId: "ses_local_modskill_s3_001",
    actorId: APPROVER,
    decidedAt: "2026-07-22T12:00:00Z",
    contentHash: CONTENT_HASH,
    ...overrides
  };
}

function newLedger(directory, name = "revocations.ndjson") {
  return new SkillRevocationLedger({ filePath: join(directory, name) });
}

// ---------------------------------------------------------------------------
// 1. Legitimate revocation
// ---------------------------------------------------------------------------

test("revoke() authorizes a well-formed N-5 bundle and persists REVOKED with the bound governed decision", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  const result = ledger.revoke(baseRequest(), { expectedSequence: 0, idempotencyKey: "idem_001" });

  assert.equal(result.ok, true);
  assert.equal(result.record.sequence, 1);
  assert.deepEqual(result.knownBadVersions, ["1.0.0"]);
  assert.equal(result.decisionRecord.outcome, "APPROVAL_BOUND");
  assert.equal(result.decisionRecord.decision_type, "GOVERNANCE");
  assert.deepEqual(result.decisionRecord.evidence_refs, [`approval-binding:${JSON.stringify([REVOKE_SKILL_ACTION, "skill.demo.example@1.0.0"])}`]);

  const reopened = newLedger(directory);
  const persisted = reopened.read();
  assert.equal(persisted.length, 1);
  const payload = persisted[0].entry.payload;
  assert.equal(payload.status, "REVOKED");
  assert.equal(payload.skill_id, "skill.demo.example");
  assert.equal(payload.all_versions, false);
  assert.deepEqual(payload.known_bad_versions, ["1.0.0"]);
  assert.equal(payload.reason, "confirmed security regression in v1.0.0");
  assert.equal(payload.independent_review_actor_id, REVIEWER);
  assert.equal(payload.governance_actor_id, APPROVER);
  assert.equal(payload.producer_actor_id, PRODUCER);
  // Component 2: the REVOCATION is bound to a governed GOVERNANCE decision.
  assert.equal(payload.decision.decision_type, "GOVERNANCE");
  assert.equal(payload.decision.outcome, "APPROVAL_BOUND");

  assert.deepEqual(reopened.verify(), {
    valid: true,
    ledgerId: "secb-skill-revocation-ledger",
    count: 1,
    headHash: result.record.recordHash
  });

  const resolved = reopened.resolveRevoked("skill.demo.example");
  assert.equal(resolved.ok, true);
  assert.equal(resolved.allVersions, false);
  assert.deepEqual(resolved.knownBadVersions, ["1.0.0"]);
  assert.equal(resolved.decisionId, "dec_skill_revocation_001");
}));

test("revoke() with allVersions records the full known version set as known_bad_versions and binds to the bare skillId", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  const result = ledger.revoke(baseRequest({
    allVersions: true,
    skillVersion: undefined,
    knownVersions: ["1.0.0", "1.1.0", "2.0.0", "1.0.0"],
    decisionId: "dec_skill_revocation_all"
  }), { expectedSequence: 0, idempotencyKey: "idem_all" });

  assert.equal(result.ok, true);
  // De-duplicated, order-preserving.
  assert.deepEqual(result.knownBadVersions, ["1.0.0", "1.1.0", "2.0.0"]);
  // All-versions binds to the bare skillId (injective vs skillId@version).
  assert.deepEqual(result.decisionRecord.evidence_refs, [`approval-binding:${JSON.stringify([REVOKE_SKILL_ACTION, "skill.demo.example"])}`]);

  const payload = newLedger(directory).read()[0].entry.payload;
  assert.equal(payload.all_versions, true);
  assert.deepEqual(payload.known_bad_versions, ["1.0.0", "1.1.0", "2.0.0"]);
}));

test("revoke() supports roleMatchMode 'normalized' (threaded verbatim to evaluateApprovalBinding)", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  const result = ledger.revoke(baseRequest({
    decisionId: "dec_skill_revocation_normalized",
    approvals: [
      { role: "REV", actor_id: REVIEWER, decided_at: "2026-07-22T09:00:00Z" },
      { role: "GOV", actor_id: APPROVER, decided_at: "2026-07-22T09:05:00Z" }
    ],
    roleMatchMode: "normalized"
  }), { expectedSequence: 0, idempotencyKey: "idem_normalized" });
  assert.equal(result.ok, true);

  // The SAME canonical-token bundle in "strict" mode is denied — proves the
  // mode is genuinely threaded through, not silently ignored.
  const ledger2 = newLedger(directory, "revocations-strict.ndjson");
  const strictResult = ledger2.revoke(baseRequest({
    decisionId: "dec_skill_revocation_strict_control",
    approvals: [
      { role: "REV", actor_id: REVIEWER, decided_at: "2026-07-22T09:00:00Z" },
      { role: "GOV", actor_id: APPROVER, decided_at: "2026-07-22T09:05:00Z" }
    ],
    roleMatchMode: "strict"
  }), { expectedSequence: 0, idempotencyKey: "idem_strict_control" });
  assert.equal(strictResult.ok, false);
  assert.equal(strictResult.code, "DENY_APPROVALS");
}));

// ---------------------------------------------------------------------------
// 2. Already-revoked terminal denial — atomic, PROBE1-style proof
// ---------------------------------------------------------------------------

test("revoke() denies re-revoking the exact same (skill_id, version) — terminal-forever", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  const first = ledger.revoke(baseRequest(), { expectedSequence: 0, idempotencyKey: "idem_dup_1" });
  assert.equal(first.ok, true);

  const second = ledger.revoke(baseRequest({ decisionId: "dec_skill_revocation_dup_2" }), {
    expectedSequence: 1,
    idempotencyKey: "idem_dup_2"
  });
  assert.equal(second.ok, false);
  assert.equal(second.code, "DENY_ALREADY_REVOKED");

  assert.equal(newLedger(directory).verify().count, 1);
}));

test("revoke() denies an all-versions revoke once any single version is already revoked (overlap)", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  const first = ledger.revoke(baseRequest(), { expectedSequence: 0, idempotencyKey: "idem_ov_1" });
  assert.equal(first.ok, true);

  const second = ledger.revoke(baseRequest({
    allVersions: true,
    skillVersion: undefined,
    knownVersions: ["1.0.0", "2.0.0"],
    decisionId: "dec_skill_revocation_ov_2"
  }), { expectedSequence: 1, idempotencyKey: "idem_ov_2" });
  assert.equal(second.ok, false);
  assert.equal(second.code, "DENY_ALREADY_REVOKED");
}));

test("revoke() allows revoking a DIFFERENT, non-overlapping version of the same skill", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  const first = ledger.revoke(baseRequest(), { expectedSequence: 0, idempotencyKey: "idem_diff_1" });
  assert.equal(first.ok, true);

  const second = ledger.revoke(baseRequest({
    skillVersion: "2.0.0",
    decisionId: "dec_skill_revocation_diff_2"
  }), { expectedSequence: 1, idempotencyKey: "idem_diff_2" });
  assert.equal(second.ok, true);
  assert.equal(newLedger(directory).verify().count, 2);
}));

test("a DIFFERENT skill_id may be revoked concurrently — no false-positive conflict", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  const first = ledger.revoke(baseRequest(), { expectedSequence: 0, idempotencyKey: "idem_other_1" });
  assert.equal(first.ok, true);

  const second = ledger.revoke(baseRequest({
    skillId: "skill.demo.other",
    decisionId: "dec_skill_revocation_other"
  }), { expectedSequence: 1, idempotencyKey: "idem_other_2" });
  assert.equal(second.ok, true);
  assert.equal(newLedger(directory).verify().count, 2);
}));

// --- PROBE1-style atomicity regression (mirrors mod-wspace-s3-single-writer-
// toctou-fix-001 / the S2 sibling's own regression test) -----------------

test("the already-revoked gate is atomic with the write: overriding the public read() accessor to fake a stale/empty view no longer lets a second overlapping revocation land", () => withTempLedger((directory) => {
  const path = join(directory, "revocations.ndjson");

  // "Process A": real, unmodified path. Chain length -> 1.
  const a = new SkillRevocationLedger({ filePath: path });
  const appendedA = a.revoke(baseRequest(), { expectedSequence: 0, idempotencyKey: "idem_race_a" });
  assert.equal(appendedA.ok, true);

  // "Process B": fresh instance, same file. Reproduce the WSPACE reviewer's
  // PROBE1 — override the PUBLIC read() accessor (the only thing a NAIVE,
  // unlocked-snapshot implementation of this gate would have called) to throw,
  // while `expectedSequence` is sourced correctly/freshly (1). Because
  // `#detectAlreadyRevoked` only ever consumes the `records` argument handed to
  // it by `DurableLedger.append`'s own locked, freshly-verified read,
  // overriding `read()` has NO effect.
  const b = new SkillRevocationLedger({ filePath: path });
  b.read = () => { throw new Error("stale/hostile read() must not be consulted by the already-revoked gate"); };

  const resultB = b.revoke(baseRequest({
    allVersions: true,
    skillVersion: undefined,
    knownVersions: ["1.0.0", "2.0.0"],
    decisionId: "dec_skill_revocation_race_b"
  }), { expectedSequence: 1, idempotencyKey: "idem_race_b" });

  assert.equal(resultB.ok, false);
  assert.equal(resultB.code, "DENY_ALREADY_REVOKED");
  assert.equal(resultB.conflictingDecisionId, "dec_skill_revocation_001");

  // Only the first revocation was ever persisted.
  const reopened = new SkillRevocationLedger({ filePath: path });
  assert.equal(reopened.verify().count, 1);
}));

// ---------------------------------------------------------------------------
// 3. SoD violation denial — PARITY with evaluateApprovalBinding, not reimplemented
// ---------------------------------------------------------------------------

const SOD_PARITY_CASES = [
  { name: "missing approvals bundle", approvals: undefined, expected: "DENY_APPROVALS" },
  { name: "empty approvals bundle", approvals: [], expected: "DENY_APPROVALS" },
  { name: "governance-only bundle", approvals: [{ role: GOVERNANCE_ROLE, actor_id: APPROVER, decided_at: "2026-07-22T09:05:00Z" }], expected: "DENY_APPROVALS" },
  {
    name: "producer as independent reviewer (self-approval)",
    approvals: [
      { role: INDEPENDENT_REVIEW_ROLE, actor_id: PRODUCER, decided_at: "2026-07-22T09:00:00Z" },
      { role: GOVERNANCE_ROLE, actor_id: APPROVER, decided_at: "2026-07-22T09:05:00Z" }
    ],
    expected: "DENY_SELF_APPROVAL"
  },
  {
    name: "one non-producer actor holds both approvals",
    approvals: [
      { role: INDEPENDENT_REVIEW_ROLE, actor_id: "mallory", decided_at: "2026-07-22T09:00:00Z" },
      { role: GOVERNANCE_ROLE, actor_id: "mallory", decided_at: "2026-07-22T09:05:00Z" }
    ],
    expected: "DENY_SOD_VIOLATION"
  },
  {
    name: "producer holds the governance role",
    approvals: [
      { role: INDEPENDENT_REVIEW_ROLE, actor_id: REVIEWER, decided_at: "2026-07-22T09:00:00Z" },
      { role: GOVERNANCE_ROLE, actor_id: PRODUCER, decided_at: "2026-07-22T09:05:00Z" }
    ],
    expected: "DENY_SOD_VIOLATION"
  }
];

for (const { name, approvals: bundle, expected } of SOD_PARITY_CASES) {
  test(`revoke() PARITY with evaluateApprovalBinding: ${name}`, () => withTempLedger((directory) => {
    const ledger = newLedger(directory);
    const result = ledger.revoke(baseRequest({ decisionId: `dec_sod_${name.replace(/\W+/g, "_")}`, approvals: bundle }), {
      expectedSequence: 0,
      idempotencyKey: `idem_sod_${name.replace(/\W+/g, "_")}`
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, expected);

    // Direct parity: the primitive itself, called with the identical
    // arguments, produces the SAME code — proving revoke() delegates rather
    // than reimplementing this logic.
    const direct = evaluateApprovalBinding({ approvals: bundle, producerActorId: PRODUCER, roleMatchMode: "strict" });
    const directCode = direct.ok ? "ALLOW" : direct.code;
    assert.equal(directCode, expected);

    // Nothing was written for a denied revocation attempt.
    assert.equal(newLedger(directory).verify().count, 0);
  }));
}

test("an unrecognized roleMatchMode denies DENY_INVALID_ROLE_MATCH_MODE (from the reused primitive, not a local check)", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  const result = ledger.revoke(baseRequest({ roleMatchMode: "loose" }), { expectedSequence: 0, idempotencyKey: "idem_bad_mode" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "DENY_INVALID_ROLE_MATCH_MODE");
}));

// ---------------------------------------------------------------------------
// 4. Risk-floor, reason, version-set, and charset structural denials
// ---------------------------------------------------------------------------

for (const riskClass of ["R0", "R1", "R2"]) {
  test(`revoke() denies riskClass ${riskClass} (below the R3+ revocation floor) even with a fully valid N-5 bundle`, () => withTempLedger((directory) => {
    const ledger = newLedger(directory);
    const result = ledger.revoke(baseRequest({ riskClass }), { expectedSequence: 0, idempotencyKey: `idem_risk_${riskClass}` });
    assert.equal(result.ok, false);
    assert.equal(result.code, "DENY_RISK_CLASS_BELOW_FLOOR");
    assert.equal(newLedger(directory).verify().count, 0);
  }));
}

test("revoke() denies an unknown risk class", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  const result = ledger.revoke(baseRequest({ riskClass: "R9" }), { expectedSequence: 0, idempotencyKey: "idem_risk_unknown" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "DENY_RISK_CLASS_BELOW_FLOOR");
}));

test("revoke() allows riskClass R4 (also above the floor)", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  const result = ledger.revoke(baseRequest({ riskClass: "R4" }), { expectedSequence: 0, idempotencyKey: "idem_risk_r4" });
  assert.equal(result.ok, true);
}));

for (const reason of [undefined, "", "   "]) {
  test(`revoke() denies a missing/blank reason (${JSON.stringify(reason)}) with DENY_REVOCATION_INVALID`, () => withTempLedger((directory) => {
    const ledger = newLedger(directory);
    const result = ledger.revoke(baseRequest({ reason }), { expectedSequence: 0, idempotencyKey: "idem_reason" });
    assert.equal(result.ok, false);
    assert.equal(result.code, "DENY_REVOCATION_INVALID");
    assert.equal(newLedger(directory).verify().count, 0);
  }));
}

test("revoke() denies a single-version request with a missing/blank skillVersion (DENY_MALFORMED_VERSION_SET)", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  for (const skillVersion of [undefined, "", "  "]) {
    const result = ledger.revoke(baseRequest({ skillVersion }), { expectedSequence: 0, idempotencyKey: `idem_ver_${Math.random()}` });
    assert.equal(result.ok, false);
    assert.equal(result.code, "DENY_MALFORMED_VERSION_SET");
  }
}));

for (const knownVersions of [undefined, [], ["  "], [""], "not-an-array"]) {
  test(`revoke() denies allVersions with knownVersions=${JSON.stringify(knownVersions)} (DENY_MALFORMED_VERSION_SET)`, () => withTempLedger((directory) => {
    const ledger = newLedger(directory);
    const result = ledger.revoke(baseRequest({ allVersions: true, skillVersion: undefined, knownVersions }), {
      expectedSequence: 0,
      idempotencyKey: "idem_known"
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "DENY_MALFORMED_VERSION_SET");
    assert.equal(newLedger(directory).verify().count, 0);
  }));
}

test("revoke() denies a reserved composite-key delimiter ('@' or '|') in skillId or any version (GOV-P011-08)", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  const singleCases = [{ skillId: "skill@evil" }, { skillId: "skill|evil" }, { skillVersion: "1.0.0@evil" }, { skillVersion: "1.0.0|evil" }];
  for (const overrides of singleCases) {
    const result = ledger.revoke(baseRequest(overrides), { expectedSequence: 0, idempotencyKey: `idem_charset_${Math.random()}` });
    assert.equal(result.ok, false);
    assert.equal(result.code, "DENY_ID_CHARSET");
  }
  // A poisoned version inside an allVersions set is caught too.
  const allResult = ledger.revoke(baseRequest({ allVersions: true, skillVersion: undefined, knownVersions: ["1.0.0", "2.0.0@evil"] }), {
    expectedSequence: 0,
    idempotencyKey: "idem_charset_all"
  });
  assert.equal(allResult.ok, false);
  assert.equal(allResult.code, "DENY_ID_CHARSET");
}));

// ---------------------------------------------------------------------------
// 5. Malformed-input fail-closed cases + inherited base-ledger behavior
// ---------------------------------------------------------------------------

test("revoke() throws on a missing/blank skillId", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  for (const overrides of [{ skillId: "" }, { skillId: null }, { skillId: "   " }]) {
    assert.throws(
      () => ledger.revoke(baseRequest(overrides), { expectedSequence: 0, idempotencyKey: "idem_malformed" }),
      (error) => error instanceof LedgerError && error.code === "DENY_REVOKE_MALFORMED"
    );
  }
}));

test("revoke() throws on a malformed contentHash", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  for (const contentHash of [undefined, "not-a-sha256", "A".repeat(64), "b".repeat(63)]) {
    assert.throws(
      () => ledger.revoke(baseRequest({ contentHash }), { expectedSequence: 0, idempotencyKey: "idem_bad_hash" }),
      (error) => error instanceof LedgerError && error.code === "DENY_REVOKE_MALFORMED"
    );
  }
}));

test("revoke() throws on a missing idempotencyKey", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  assert.throws(
    () => ledger.revoke(baseRequest(), { expectedSequence: 0 }),
    (error) => error instanceof LedgerError && error.code === "DENY_MISSING_ENTRY_FIELDS"
  );
}));

test("revoke() throws on a missing decisionId or actorId", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  assert.throws(
    () => ledger.revoke(baseRequest({ decisionId: "" }), { expectedSequence: 0, idempotencyKey: "idem_no_decision" }),
    (error) => error instanceof LedgerError && error.code === "DENY_REVOKE_MALFORMED"
  );
  assert.throws(
    () => ledger.revoke(baseRequest({ actorId: "" }), { expectedSequence: 0, idempotencyKey: "idem_no_actor" }),
    (error) => error instanceof LedgerError && error.code === "DENY_REVOKE_MALFORMED"
  );
}));

test("revoke() throws on a non-object request", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  for (const bad of [null, "string", 42, ["array"]]) {
    assert.throws(
      () => ledger.revoke(bad, { expectedSequence: 0, idempotencyKey: "idem_bad_request" }),
      (error) => error instanceof LedgerError && error.code === "DENY_REVOKE_MALFORMED"
    );
  }
}));

test("revoke() fail-closed contract validation: a malformed decidedAt throws DENY_CONTRACT_INVALID (reused decisionRecord schema)", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  assert.throws(
    () => ledger.revoke(baseRequest({ decidedAt: "not-a-date" }), { expectedSequence: 0, idempotencyKey: "idem_bad_date" }),
    (error) => error.code === "DENY_CONTRACT_INVALID"
  );
}));

test("revoke() inherits stale-expectedSequence rejection from DurableLedger", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  ledger.revoke(baseRequest(), { expectedSequence: 0, idempotencyKey: "idem_seq_1" });
  assert.throws(
    () => ledger.revoke(baseRequest({ skillId: "skill.demo.other", decisionId: "dec_skill_revocation_seq_2" }), { expectedSequence: 0, idempotencyKey: "idem_seq_2" }),
    (error) => error.code === "DENY_SEQUENCE_CONFLICT"
  );
}));

test("revoke() inherits duplicate-entryId rejection: reusing a decisionId for different payload content throws", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  ledger.revoke(baseRequest(), { expectedSequence: 0, idempotencyKey: "idem_entry_1" });
  assert.throws(
    () => ledger.revoke(baseRequest({ skillId: "skill.demo.other" }), {
      expectedSequence: 1,
      idempotencyKey: "idem_entry_2"
    }),
    (error) => error.code === "DENY_DUPLICATE_ENTRY_ID"
  );
}));

test("revoke() inherits idempotent replay: the identical request + idempotencyKey replays the original record", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  const first = ledger.revoke(baseRequest(), { expectedSequence: 0, idempotencyKey: "idem_replay" });
  const second = ledger.revoke(baseRequest(), { expectedSequence: 1, idempotencyKey: "idem_replay" });
  assert.equal(second.ok, true);
  assert.equal(second.record.replayed, true);
  assert.equal(second.record.sequence, first.record.sequence);
  assert.equal(newLedger(directory).verify().count, 1);
}));

// --- resolveRevoked --------------------------------------------------------

test("resolveRevoked() denies an unknown or invalid skillId", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  assert.deepEqual(ledger.resolveRevoked(""), { ok: false, code: "DENY_INVALID_SKILL_ID", message: "skillId must be a non-empty string" });
  assert.deepEqual(ledger.resolveRevoked(null), { ok: false, code: "DENY_INVALID_SKILL_ID", message: "skillId must be a non-empty string" });
  assert.deepEqual(ledger.resolveRevoked("skill.never.revoked"), { ok: false, code: "DENY_UNKNOWN_SKILL", message: "No revocation recorded for skill: skill.never.revoked" });
}));

// --- Atomic-snapshot / descriptor-trap-safe input handling -----------------

test("revoke() is descriptor-trap-safe: a hostile getter on a request field is read at most once and never reaches the chain", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  let reads = 0;
  const hostile = {};
  for (const [key, value] of Object.entries(baseRequest())) hostile[key] = value;
  Object.defineProperty(hostile, "reason", {
    enumerable: true,
    get() { reads += 1; return "read-once revocation reason"; }
  });
  const result = ledger.revoke(hostile, { expectedSequence: 0, idempotencyKey: "idem_trap" });
  assert.equal(result.ok, true);
  // structuredClone performs a single [[Get]] per own enumerable field.
  assert.equal(reads, 1);
  assert.equal(newLedger(directory).read()[0].entry.payload.reason, "read-once revocation reason");
}));

// --- Reuse / non-reimplementation guards -----------------------------------

test("skill-revocation-ledger.mjs does not import sod-rules.mjs directly (SoD math is exclusively reused via approval-binding.mjs)", () => {
  const source = readFileSync(resolve(import.meta.dirname, "..", "src", "ledger", "skill-revocation-ledger.mjs"), "utf8");
  assert.equal(/from ["'].*sod-rules(\.mjs)?["']/.test(source), false, "must not import sod-rules.mjs directly");
  assert.match(source, /from ["']\.\.\/control\/approval-binding\.mjs["']/);
  assert.match(source, /from ["']\.\.\/control\/risk-registry\.mjs["']/);
});

test("skill-revocation-ledger.mjs does not IMPORT skill-resolver.mjs or CALL resolveEffective (component 3 out of scope; resolver untouched)", () => {
  const source = readFileSync(resolve(import.meta.dirname, "..", "src", "ledger", "skill-revocation-ledger.mjs"), "utf8");
  // Match import statements and live calls only — the header comment names
  // skill-resolver.mjs / resolveEffective precisely to DISCLOSE they are out of
  // scope, so a bare word-match would false-positive on that disclosure. The
  // byte-identity guard below independently proves skill-resolver.mjs is
  // unchanged; this guard proves nothing in this module wires to it.
  assert.equal(/\bimport\b[^\n;]*skill-resolver/.test(source), false, "revocation ledger must not import skill-resolver.mjs");
  assert.equal(/from ["'][^"']*skill-resolver/.test(source), false, "revocation ledger must not import from skill-resolver.mjs");
  assert.equal(/resolveEffective\s*\(/.test(source), false, "revocation ledger must not call resolveEffective (component 3)");
});

test("no hardcoded test-ID / decisionId branching in skill-revocation-ledger.mjs", () => {
  const source = readFileSync(resolve(import.meta.dirname, "..", "src", "ledger", "skill-revocation-ledger.mjs"), "utf8");
  assert.equal(/dec_skill_revocation_\d+|idem_[a-z0-9_]+["']\s*===|decisionId\s*===\s*["']dec_/i.test(source), false, "no literal test fixture id should ever be branched on in source");
});

// --- byte-identity guard: reused primitives + siblings + resolver untouched -

const BYTE_IDENTITY_BASELINE = "8be8c9953716c06cadfc6a581fe248e819747380"; // canonical origin/main integration baseline
const PROTECTED_SOURCE_FILES = [
  "src/control/approval-binding.mjs",
  "src/control/sod-rules.mjs",
  "src/control/risk-registry.mjs",
  "src/ledger/durable-ledger.mjs",
  "src/ledger/skill-promotion-ledger.mjs",
  "src/registry/skill-candidate-registry.mjs",
  "src/registry/skill-resolver.mjs",
  "src/gateway/capability-registry-service.mjs",
  "src/contracts/reserved-delimiters.mjs",
  "contracts/decision-record.schema.json",
  "contracts/skill-manifest.schema.json",
  "contracts/skill-promotion.schema.json"
];

function gitBlobHashAtRef(ref, path) {
  return execFileSync("git", ["rev-parse", `${ref}:${path}`], { encoding: "utf8" }).trim();
}
function gitWorkingBlobHash(path) {
  return execFileSync("git", ["hash-object", path], { encoding: "utf8" }).trim();
}

test(`byte-identity: reused primitives, the S1/S2 siblings, and skill-resolver.mjs are byte-identical to origin/main @ ${BYTE_IDENTITY_BASELINE}`, () => {
  for (const path of PROTECTED_SOURCE_FILES) {
    assert.equal(gitWorkingBlobHash(path), gitBlobHashAtRef(BYTE_IDENTITY_BASELINE, path), `${path} drifted from origin/main @ ${BYTE_IDENTITY_BASELINE}`);
  }
});

test("no src/ file other than the ledger's own definition references SkillRevocationLedger (stays unwired)", () => {
  let grep;
  try {
    grep = execFileSync("git", ["grep", "--untracked", "-l", "SkillRevocationLedger", "--", "src/"], { encoding: "utf8" }).trim();
  } catch (error) {
    // git grep exits 1 with empty output when there are zero matches at all.
    if (error.status === 1 && (error.stdout ?? "").trim() === "") {
      grep = "";
    } else {
      throw error;
    }
  }
  const hits = grep.length === 0 ? [] : grep.split(/\r?\n/);
  assert.deepEqual(hits, ["src/ledger/skill-revocation-ledger.mjs"], "no src/ file other than the ledger's own definition may reference SkillRevocationLedger");
});
