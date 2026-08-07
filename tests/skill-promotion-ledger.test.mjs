// Tests for the MOD-SKILL Slice S2 governed promotion primitive
// (src/ledger/skill-promotion-ledger.mjs), an UNWIRED CANDIDATE built on two
// reused primitives per docs/03-project-control/candidates/
// mod-skill-gap-assessment-001-addendum-001.md §5:
//   - src/control/approval-binding.mjs (N-5 SoD evaluation, exact-action/
//     version bind) — imported read-only, never re-derived.
//   - DurableLedger's `preWriteCheck` hook (src/ledger/durable-ledger.mjs) —
//     the atomic-from-day-one "already published" duplicate-transition gate.
//
// Five groups of coverage:
//   1. Legitimate promotion (correct SoD, no prior promotion).
//   2. Duplicate-promotion denial, proved genuinely atomic via a PROBE1-style
//      regression (mirrors mod-wspace-s3-single-writer-toctou-fix-001's own
//      regression test): a second ledger instance's public `read()` accessor
//      is overridden to throw, and the gate must still deny correctly because
//      it never calls `read()` at all.
//   3. SoD violation denial, reusing approval-binding's own disposition
//      matrix (parity, not reimplementation).
//   4. Risk-floor and evidence-refs structural denials.
//   5. Malformed-input fail-closed cases, inherited base-ledger behavior, and
//      reuse/non-reimplementation guards.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  PROMOTE_SKILL_ACTION,
  SkillPromotionLedger
} from "../src/ledger/skill-promotion-ledger.mjs";
import { evaluateApprovalBinding, INDEPENDENT_REVIEW_ROLE, GOVERNANCE_ROLE } from "../src/control/approval-binding.mjs";
import { LedgerError } from "../src/ledger/durable-ledger.mjs";

function withTempLedger(operation) {
  const directory = mkdtempSync(join(tmpdir(), "secb-skill-promotion-"));
  try {
    return operation(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const CONTENT_HASH = "a".repeat(64);
const PRODUCER = "claude-motor";
const REVIEWER = "agent.claude.rev.01";
const APPROVER = "operator.gov.01";

function approvals(overrides = {}) {
  return [
    { role: INDEPENDENT_REVIEW_ROLE, actor_id: REVIEWER, decided_at: "2026-07-21T09:00:00Z" },
    { role: GOVERNANCE_ROLE, actor_id: APPROVER, decided_at: "2026-07-21T09:05:00Z" },
    ...(overrides.extra ?? [])
  ];
}

function baseRequest(overrides = {}) {
  return {
    skillCandidateId: "skill.demo.example",
    skillVersion: "1.0.0",
    producerActorId: PRODUCER,
    approvals: approvals(),
    roleMatchMode: "strict",
    riskClass: "R3",
    evidenceRefs: ["evidence:intake:skill.demo.example:0001"],
    decisionId: "dec_skill_promotion_001",
    projectId: "prj_secb_local",
    workPackageId: "wp_p0_modskill_s2_001",
    sessionId: "ses_local_modskill_s2_001",
    actorId: APPROVER,
    decidedAt: "2026-07-21T12:00:00Z",
    contentHash: CONTENT_HASH,
    ...overrides
  };
}

function newLedger(directory, name = "promotions.ndjson") {
  return new SkillPromotionLedger({ filePath: join(directory, name) });
}

// ---------------------------------------------------------------------------
// 1. Legitimate promotion
// ---------------------------------------------------------------------------

test("promote() authorizes a well-formed N-5 bundle with no prior promotion and persists PUBLISHED", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  const result = ledger.promote(baseRequest(), { expectedSequence: 0, idempotencyKey: "idem_001" });

  assert.equal(result.ok, true);
  assert.equal(result.record.sequence, 1);
  assert.equal(result.decisionRecord.outcome, "APPROVAL_BOUND");
  assert.deepEqual(result.decisionRecord.evidence_refs, [`approval-binding:${JSON.stringify([PROMOTE_SKILL_ACTION, "skill.demo.example@1.0.0"])}`]);

  const reopened = newLedger(directory);
  const persisted = reopened.read();
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].entry.payload.status, "PUBLISHED");
  assert.equal(persisted[0].entry.payload.skill_candidate_id, "skill.demo.example");
  assert.equal(persisted[0].entry.payload.independent_review_actor_id, REVIEWER);
  assert.equal(persisted[0].entry.payload.governance_actor_id, APPROVER);
  assert.equal(persisted[0].entry.payload.producer_actor_id, PRODUCER);
  assert.deepEqual(reopened.verify(), {
    valid: true,
    ledgerId: "secb-skill-promotion-ledger",
    count: 1,
    headHash: result.record.recordHash
  });

  const resolved = reopened.resolvePublished("skill.demo.example");
  assert.equal(resolved.ok, true);
  assert.equal(resolved.skillVersion, "1.0.0");
  assert.equal(resolved.decisionId, "dec_skill_promotion_001");
}));

test("promote() supports roleMatchMode 'normalized' (threaded verbatim to evaluateApprovalBinding)", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  const result = ledger.promote(baseRequest({
    decisionId: "dec_skill_promotion_normalized",
    approvals: [
      { role: "REV", actor_id: REVIEWER, decided_at: "2026-07-21T09:00:00Z" },
      { role: "GOV", actor_id: APPROVER, decided_at: "2026-07-21T09:05:00Z" }
    ],
    roleMatchMode: "normalized"
  }), { expectedSequence: 0, idempotencyKey: "idem_normalized" });
  assert.equal(result.ok, true);

  // The SAME canonical-token bundle in "strict" mode is denied — proves the
  // mode is genuinely threaded through, not silently ignored.
  const ledger2 = newLedger(directory, "promotions-strict.ndjson");
  const strictResult = ledger2.promote(baseRequest({
    decisionId: "dec_skill_promotion_strict_control",
    approvals: [
      { role: "REV", actor_id: REVIEWER, decided_at: "2026-07-21T09:00:00Z" },
      { role: "GOV", actor_id: APPROVER, decided_at: "2026-07-21T09:05:00Z" }
    ],
    roleMatchMode: "strict"
  }), { expectedSequence: 0, idempotencyKey: "idem_strict_control" });
  assert.equal(strictResult.ok, false);
  assert.equal(strictResult.code, "DENY_APPROVALS");
}));

// ---------------------------------------------------------------------------
// 2. Duplicate-promotion denial — atomic, PROBE1-style proof
// ---------------------------------------------------------------------------

test("promote() denies re-promoting the exact same (skill_candidate_id, skill_version)", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  const first = ledger.promote(baseRequest(), { expectedSequence: 0, idempotencyKey: "idem_dup_1" });
  assert.equal(first.ok, true);

  const second = ledger.promote(baseRequest({ decisionId: "dec_skill_promotion_dup_2" }), {
    expectedSequence: 1,
    idempotencyKey: "idem_dup_2"
  });
  assert.equal(second.ok, false);
  assert.equal(second.code, "DENY_ALREADY_PUBLISHED");
  assert.equal(second.conflictingVersion, "1.0.0");

  assert.equal(newLedger(directory).verify().count, 1);
}));

test("promote() denies promoting a DIFFERENT version while one version is already published (cross-version singleton)", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  const first = ledger.promote(baseRequest(), { expectedSequence: 0, idempotencyKey: "idem_xver_1" });
  assert.equal(first.ok, true);

  const second = ledger.promote(baseRequest({
    skillVersion: "2.0.0",
    decisionId: "dec_skill_promotion_xver_2",
    evidenceRefs: ["evidence:intake:skill.demo.example:0002"]
  }), { expectedSequence: 1, idempotencyKey: "idem_xver_2" });
  assert.equal(second.ok, false);
  assert.equal(second.code, "DENY_ALREADY_PUBLISHED");
  assert.equal(second.conflictingVersion, "1.0.0");
}));

test("a DIFFERENT skill_candidate_id may be published concurrently — no false-positive conflict", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  const first = ledger.promote(baseRequest(), { expectedSequence: 0, idempotencyKey: "idem_other_1" });
  assert.equal(first.ok, true);

  const second = ledger.promote(baseRequest({
    skillCandidateId: "skill.demo.other",
    decisionId: "dec_skill_promotion_other",
    evidenceRefs: ["evidence:intake:skill.demo.other:0001"]
  }), { expectedSequence: 1, idempotencyKey: "idem_other_2" });
  assert.equal(second.ok, true);
  assert.equal(newLedger(directory).verify().count, 2);
}));

// --- PROBE1-style atomicity regression (mirrors mod-wspace-s3-single-writer-
// toctou-fix-001's own regression test) ---------------------------------

test("the already-published gate is atomic with the write: overriding the public read() accessor to fake a stale/empty view no longer lets a second published version land for the same skill candidate", () => withTempLedger((directory) => {
  const path = join(directory, "promotions.ndjson");

  // "Process A": real, unmodified path. Chain length -> 1.
  const a = new SkillPromotionLedger({ filePath: path });
  const appendedA = a.promote(baseRequest(), { expectedSequence: 0, idempotencyKey: "idem_race_a" });
  assert.equal(appendedA.ok, true);

  // "Process B": fresh instance, same file. Reproduce the WSPACE reviewer's
  // PROBE1 — override the PUBLIC read() accessor (the only thing a NAIVE,
  // unlocked-snapshot implementation of this gate would have called) to
  // throw, while `expectedSequence` is sourced correctly/freshly (1). If the
  // gate were (incorrectly) implemented as an unlocked `this.read()` taken
  // BEFORE `append()`, this override would make the gate itself throw or see
  // a stale/empty view; instead, `#detectAlreadyPublished` only ever
  // consumes the `records` argument handed to it by `DurableLedger.append`'s
  // own locked, freshly-verified read, so overriding `read()` has NO effect.
  const b = new SkillPromotionLedger({ filePath: path });
  b.read = () => { throw new Error("stale/hostile read() must not be consulted by the already-published gate"); };

  const resultB = b.promote(baseRequest({
    skillVersion: "2.0.0",
    decisionId: "dec_skill_promotion_race_b",
    evidenceRefs: ["evidence:intake:skill.demo.example:0002"]
  }), { expectedSequence: 1, idempotencyKey: "idem_race_b" });

  assert.equal(resultB.ok, false);
  assert.equal(resultB.code, "DENY_ALREADY_PUBLISHED");
  assert.equal(resultB.conflictingVersion, "1.0.0");
  assert.equal(resultB.conflictingDecisionId, "dec_skill_promotion_001");

  // Only the first promotion was ever persisted — no second published
  // version landed for skill.demo.example.
  const reopened = new SkillPromotionLedger({ filePath: path });
  assert.equal(reopened.verify().count, 1);
}));

// ---------------------------------------------------------------------------
// 3. SoD violation denial — PARITY with evaluateApprovalBinding, not reimplemented
// ---------------------------------------------------------------------------

const SOD_PARITY_CASES = [
  { name: "missing approvals bundle", approvals: undefined, expected: "DENY_APPROVALS" },
  { name: "empty approvals bundle", approvals: [], expected: "DENY_APPROVALS" },
  { name: "independent-only bundle", approvals: [{ role: INDEPENDENT_REVIEW_ROLE, actor_id: REVIEWER, decided_at: "2026-07-21T09:00:00Z" }], expected: "DENY_APPROVALS" },
  {
    name: "producer as independent reviewer (self-approval)",
    approvals: [
      { role: INDEPENDENT_REVIEW_ROLE, actor_id: PRODUCER, decided_at: "2026-07-21T09:00:00Z" },
      { role: GOVERNANCE_ROLE, actor_id: APPROVER, decided_at: "2026-07-21T09:05:00Z" }
    ],
    expected: "DENY_SELF_APPROVAL"
  },
  {
    name: "one non-producer actor holds both approvals",
    approvals: [
      { role: INDEPENDENT_REVIEW_ROLE, actor_id: "mallory", decided_at: "2026-07-21T09:00:00Z" },
      { role: GOVERNANCE_ROLE, actor_id: "mallory", decided_at: "2026-07-21T09:05:00Z" }
    ],
    expected: "DENY_SOD_VIOLATION"
  },
  {
    name: "producer holds the governance role",
    approvals: [
      { role: INDEPENDENT_REVIEW_ROLE, actor_id: REVIEWER, decided_at: "2026-07-21T09:00:00Z" },
      { role: GOVERNANCE_ROLE, actor_id: PRODUCER, decided_at: "2026-07-21T09:05:00Z" }
    ],
    expected: "DENY_SOD_VIOLATION"
  },
  {
    name: "malformed approval entry (blank actor_id)",
    approvals: [
      { role: INDEPENDENT_REVIEW_ROLE, actor_id: REVIEWER, decided_at: "2026-07-21T09:00:00Z" },
      { role: GOVERNANCE_ROLE, actor_id: APPROVER, decided_at: "2026-07-21T09:05:00Z" },
      { role: "extra", actor_id: "", decided_at: "2026-07-21T09:00:00Z" }
    ],
    expected: "DENY_APPROVALS"
  }
];

for (const { name, approvals: bundle, expected } of SOD_PARITY_CASES) {
  test(`promote() PARITY with evaluateApprovalBinding: ${name}`, () => withTempLedger((directory) => {
    const ledger = newLedger(directory);
    const result = ledger.promote(baseRequest({ decisionId: `dec_sod_${name.replace(/\W+/g, "_")}`, approvals: bundle }), {
      expectedSequence: 0,
      idempotencyKey: `idem_sod_${name.replace(/\W+/g, "_")}`
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, expected);

    // Direct parity: the primitive itself, called with the identical
    // arguments, produces the SAME code — proving promote() delegates rather
    // than reimplementing this logic.
    const direct = evaluateApprovalBinding({ approvals: bundle, producerActorId: PRODUCER, roleMatchMode: "strict" });
    const directCode = direct.ok ? "ALLOW" : direct.code;
    assert.equal(directCode, expected);

    // Nothing was written for a denied promotion attempt.
    assert.equal(newLedger(directory).verify().count, 0);
  }));
}

test("an unrecognized roleMatchMode denies DENY_INVALID_ROLE_MATCH_MODE (from the reused primitive, not a local check)", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  const result = ledger.promote(baseRequest({ roleMatchMode: "loose" }), { expectedSequence: 0, idempotencyKey: "idem_bad_mode" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "DENY_INVALID_ROLE_MATCH_MODE");
}));

// ---------------------------------------------------------------------------
// 4. Risk-floor and evidence-refs structural denials
// ---------------------------------------------------------------------------

for (const riskClass of ["R0", "R1", "R2"]) {
  test(`promote() denies riskClass ${riskClass} (below the R3+ promotion floor) even with a fully valid N-5 bundle`, () => withTempLedger((directory) => {
    const ledger = newLedger(directory);
    const result = ledger.promote(baseRequest({ riskClass }), { expectedSequence: 0, idempotencyKey: `idem_risk_${riskClass}` });
    assert.equal(result.ok, false);
    assert.equal(result.code, "DENY_RISK_CLASS_BELOW_FLOOR");
    assert.equal(newLedger(directory).verify().count, 0);
  }));
}

test("promote() denies an unknown risk class", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  const result = ledger.promote(baseRequest({ riskClass: "R9" }), { expectedSequence: 0, idempotencyKey: "idem_risk_unknown" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "DENY_RISK_CLASS_BELOW_FLOOR");
}));

test("promote() allows riskClass R4 (also above the floor)", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  const result = ledger.promote(baseRequest({ riskClass: "R4" }), { expectedSequence: 0, idempotencyKey: "idem_risk_r4" });
  assert.equal(result.ok, true);
}));

for (const evidenceRefs of [undefined, [], ["  "], [""], "not-an-array"]) {
  test(`promote() denies evidenceRefs=${JSON.stringify(evidenceRefs)} with DENY_EVIDENCE_REFS_REQUIRED`, () => withTempLedger((directory) => {
    const ledger = newLedger(directory);
    const result = ledger.promote(baseRequest({ evidenceRefs }), { expectedSequence: 0, idempotencyKey: "idem_evidence" });
    assert.equal(result.ok, false);
    assert.equal(result.code, "DENY_EVIDENCE_REFS_REQUIRED");
    assert.equal(newLedger(directory).verify().count, 0);
  }));
}

// ---------------------------------------------------------------------------
// 5. Malformed-input fail-closed cases + inherited base-ledger behavior
// ---------------------------------------------------------------------------

test("promote() throws on a missing/blank skillCandidateId or skillVersion", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  for (const overrides of [{ skillCandidateId: "" }, { skillCandidateId: null }, { skillVersion: "" }, { skillVersion: undefined }]) {
    assert.throws(
      () => ledger.promote(baseRequest(overrides), { expectedSequence: 0, idempotencyKey: "idem_malformed" }),
      (error) => error instanceof LedgerError && error.code === "DENY_PROMOTION_MALFORMED"
    );
  }
}));

test("promote() denies a reserved composite-key delimiter ('@' or '|') in skillCandidateId or skillVersion (GOV-P011-08)", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  for (const overrides of [{ skillCandidateId: "skill@evil" }, { skillCandidateId: "skill|evil" }, { skillVersion: "1.0.0@evil" }, { skillVersion: "1.0.0|evil" }]) {
    const result = ledger.promote(baseRequest(overrides), { expectedSequence: 0, idempotencyKey: `idem_charset_${Math.random()}` });
    assert.equal(result.ok, false);
    assert.equal(result.code, "DENY_ID_CHARSET");
  }
}));

test("promote() throws on a missing idempotencyKey", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  assert.throws(
    () => ledger.promote(baseRequest(), { expectedSequence: 0 }),
    (error) => error instanceof LedgerError && error.code === "DENY_MISSING_ENTRY_FIELDS"
  );
}));

test("promote() throws on a missing decisionId or actorId", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  assert.throws(
    () => ledger.promote(baseRequest({ decisionId: "" }), { expectedSequence: 0, idempotencyKey: "idem_no_decision" }),
    (error) => error instanceof LedgerError && error.code === "DENY_PROMOTION_MALFORMED"
  );
  assert.throws(
    () => ledger.promote(baseRequest({ actorId: "" }), { expectedSequence: 0, idempotencyKey: "idem_no_actor" }),
    (error) => error instanceof LedgerError && error.code === "DENY_PROMOTION_MALFORMED"
  );
}));

test("promote() throws on a non-object request", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  for (const bad of [null, "string", 42, ["array"]]) {
    assert.throws(
      () => ledger.promote(bad, { expectedSequence: 0, idempotencyKey: "idem_bad_request" }),
      (error) => error instanceof LedgerError && error.code === "DENY_PROMOTION_MALFORMED"
    );
  }
}));

test("promote() fail-closed contract validation: a malformed content_hash throws DENY_CONTRACT_INVALID", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  assert.throws(
    () => ledger.promote(baseRequest({ contentHash: "not-a-sha256" }), { expectedSequence: 0, idempotencyKey: "idem_bad_hash" }),
    (error) => error.code === "DENY_CONTRACT_INVALID"
  );
}));

test("promote() fail-closed contract validation: a malformed decidedAt throws DENY_CONTRACT_INVALID", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  assert.throws(
    () => ledger.promote(baseRequest({ decidedAt: "not-a-date" }), { expectedSequence: 0, idempotencyKey: "idem_bad_date" }),
    (error) => error.code === "DENY_CONTRACT_INVALID"
  );
}));

test("promote() inherits stale-expectedSequence rejection from DurableLedger", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  ledger.promote(baseRequest(), { expectedSequence: 0, idempotencyKey: "idem_seq_1" });
  assert.throws(
    () => ledger.promote(baseRequest({ decisionId: "dec_skill_promotion_seq_2" }), { expectedSequence: 0, idempotencyKey: "idem_seq_2" }),
    (error) => error.code === "DENY_SEQUENCE_CONFLICT"
  );
}));

test("promote() inherits duplicate-entryId rejection: reusing a decisionId for different payload content throws", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  ledger.promote(baseRequest(), { expectedSequence: 0, idempotencyKey: "idem_entry_1" });
  assert.throws(
    () => ledger.promote(baseRequest({ skillCandidateId: "skill.demo.other", evidenceRefs: ["evidence:intake:skill.demo.other:0001"] }), {
      expectedSequence: 1,
      idempotencyKey: "idem_entry_2"
    }),
    (error) => error.code === "DENY_DUPLICATE_ENTRY_ID"
  );
}));

test("promote() inherits idempotent replay: the identical request + idempotencyKey replays the original record", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  const first = ledger.promote(baseRequest(), { expectedSequence: 0, idempotencyKey: "idem_replay" });
  const second = ledger.promote(baseRequest(), { expectedSequence: 1, idempotencyKey: "idem_replay" });
  assert.equal(second.ok, true);
  assert.equal(second.record.replayed, true);
  assert.equal(second.record.sequence, first.record.sequence);
  assert.equal(newLedger(directory).verify().count, 1);
}));

// --- resolvePublished ------------------------------------------------------

test("resolvePublished() denies an unknown or invalid skillCandidateId", () => withTempLedger((directory) => {
  const ledger = newLedger(directory);
  assert.deepEqual(ledger.resolvePublished(""), { ok: false, code: "DENY_INVALID_SKILL_CANDIDATE_ID", message: "skillCandidateId must be a non-empty string" });
  assert.deepEqual(ledger.resolvePublished(null), { ok: false, code: "DENY_INVALID_SKILL_CANDIDATE_ID", message: "skillCandidateId must be a non-empty string" });
  assert.deepEqual(ledger.resolvePublished("skill.never.promoted"), { ok: false, code: "DENY_UNKNOWN_SKILL_CANDIDATE", message: "No published version recorded for skill candidate: skill.never.promoted" });
}));

// --- Reuse / non-reimplementation guards -----------------------------------

test("skill-promotion-ledger.mjs does not import sod-rules.mjs directly (SoD math is exclusively reused via approval-binding.mjs)", () => {
  const source = readFileSync(resolve(import.meta.dirname, "..", "src", "ledger", "skill-promotion-ledger.mjs"), "utf8");
  assert.equal(/from ["'].*sod-rules(\.mjs)?["']/.test(source), false, "must not import sod-rules.mjs directly");
  assert.match(source, /from ["']\.\.\/control\/approval-binding\.mjs["']/);
  assert.match(source, /from ["']\.\.\/control\/risk-registry\.mjs["']/);
});

test("no hardcoded test-ID / decisionId branching in skill-promotion-ledger.mjs", () => {
  const source = readFileSync(resolve(import.meta.dirname, "..", "src", "ledger", "skill-promotion-ledger.mjs"), "utf8");
  assert.equal(/dec_skill_promotion_\d+|idem_[a-z0-9_]+["']\s*===|decisionId\s*===\s*["']dec_/i.test(source), false, "no literal test fixture id should ever be branched on in source");
});

// --- byte-identity guard: reused primitives + S1 registry are untouched ----

const BYTE_IDENTITY_BASELINE = "ee31db7"; // origin/main tip this branch was cut from
// src/control/sod-rules.mjs is intentionally EXCLUDED here by
// mod-gov-s1-sod-rules-hardening-fix-001: an authorized, disclosed
// cross-cutting fix (fail-open normalization gap + unfrozen shared-mutable-
// state gap), not drift this guard should protect against.
const PROTECTED_SOURCE_FILES = [
  "src/control/approval-binding.mjs",
  "src/control/risk-registry.mjs",
  "src/ledger/durable-ledger.mjs",
  "src/registry/skill-candidate-registry.mjs",
  "src/gateway/capability-registry-service.mjs",
  "contracts/skill-candidate.schema.json"
];

function gitBlobHashAtRef(ref, path) {
  return execFileSync("git", ["rev-parse", `${ref}:${path}`], { encoding: "utf8" }).trim();
}
function gitWorkingBlobHash(path) {
  return execFileSync("git", ["hash-object", path], { encoding: "utf8" }).trim();
}

test(`byte-identity: reused primitives and the S1 registry are byte-identical to origin/main @ ${BYTE_IDENTITY_BASELINE}`, () => {
  for (const path of PROTECTED_SOURCE_FILES) {
    assert.equal(gitWorkingBlobHash(path), gitBlobHashAtRef(BYTE_IDENTITY_BASELINE, path), `${path} drifted from origin/main @ ${BYTE_IDENTITY_BASELINE}`);
  }
});

test("skill-candidate-registry.mjs and every other src/ module have no reference to SkillPromotionLedger (stays unwired)", () => {
  let grep;
  try {
    grep = execFileSync("git", ["grep", "--untracked", "-l", "SkillPromotionLedger", "--", "src/"], { encoding: "utf8" }).trim();
  } catch (error) {
    // git grep exits 1 with empty output when there are zero matches at all.
    if (error.status === 1 && (error.stdout ?? "").trim() === "") {
      grep = "";
    } else {
      throw error;
    }
  }
  const hits = grep.length === 0 ? [] : grep.split(/\r?\n/);
  assert.deepEqual(hits, ["src/ledger/skill-promotion-ledger.mjs"], "no src/ file other than the ledger's own definition may reference SkillPromotionLedger");
});
