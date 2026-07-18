import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ContractValidationError } from "../src/contracts/contract-validator.mjs";
import { LedgerError } from "../src/ledger/durable-ledger.mjs";
import { DecisionLedger, KnowledgeLedger, OutcomeLedger } from "../src/ledger/temporal-ledgers.mjs";

const IDS = {
  project: "prj_secb_local",
  workPackage: "wp_p0_14_001",
  session: "ses_p0_14_001"
};

function decision(overrides = {}) {
  return {
    decision_id: "dec_p0_14_001",
    version: 1,
    project_id: IDS.project,
    work_package_id: IDS.workPackage,
    session_id: IDS.session,
    actor_id: "gov-actor",
    decision_type: "GOVERNANCE",
    outcome: "ACCEPT",
    rationale: "Work package accepted on complete evidence",
    authority_ref: "grant_gov",
    evidence_refs: ["ev_accept_001"],
    decided_at: "2026-07-19T10:00:00Z",
    valid_from: "2026-07-19T10:00:00Z",
    valid_until: "2026-12-31T00:00:00Z",
    ...overrides
  };
}

function claim(overrides = {}) {
  return {
    claim_id: "kc_p0_14_001",
    version: 1,
    project_id: IDS.project,
    work_package_id: IDS.workPackage,
    session_id: IDS.session,
    actor_id: "hippocampus-actor",
    statement: "The composite-key delimiter must be denied at both service gates",
    derivation: "Derived from Immune round-1 probe evidence and round-2 closure verification",
    truth_status: "verified_true",
    evidence_refs: ["ev_verified_001"],
    claimed_at: "2026-07-19T10:00:00Z",
    valid_from: "2026-07-19T10:00:00Z",
    valid_until: "2026-10-01T00:00:00Z",
    retention_policy: "retain-12-months",
    ...overrides
  };
}

function outcome(overrides = {}) {
  return {
    outcome_id: "out_p0_14_001",
    version: 1,
    project_id: IDS.project,
    work_package_id: IDS.workPackage,
    session_id: IDS.session,
    actor_id: "business-actor",
    decision_ref: "dec_p0_14_001",
    knowledge_refs: ["kc_p0_14_001"],
    skill_refs: [],
    outcome_status: "VALIDATED",
    details: "Accepted work package operated as decided",
    evidence_refs: ["ev_outcome_001"],
    observed_at: "2026-07-19T11:00:00Z",
    reversion_required: false,
    ...overrides
  };
}

const EVIDENCE_STORE = {
  ev_verified_001: { verification_status: "VERIFIED" },
  ev_accepted_001: { verification_status: "ACCEPTED" },
  ev_captured_001: { verification_status: "CAPTURED" },
  ev_rejected_001: { verification_status: "REJECTED" }
};

function harness() {
  const dir = mkdtempSync(join(tmpdir(), "secb-temporal-"));
  const decisions = new DecisionLedger({ filePath: join(dir, "decision.ndjson") });
  const knowledge = new KnowledgeLedger({
    filePath: join(dir, "knowledge.ndjson"),
    evidenceLookup: (ref) => EVIDENCE_STORE[ref] ?? null
  });
  const outcomes = new OutcomeLedger({
    filePath: join(dir, "outcome.ndjson"),
    decisionLookup: (ref) => decisions.read().find((record) => record.entry.entryId === ref) ?? null
  });
  const cleanup = () => rmSync(dir, { recursive: true, force: true });
  return { decisions, knowledge, outcomes, cleanup };
}

function denies(fn, code, ErrorClass = LedgerError) {
  assert.throws(fn, (error) => error instanceof ErrorClass && error.code === code);
}

test("decision ledger: append, temporal resolution, and reversion fail closed", () => {
  const h = harness();
  try {
    h.decisions.appendDecision(decision(), { expectedSequence: 0, idempotencyKey: "idem_dec_1" });

    assert.equal(h.decisions.resolveEffective("dec_p0_14_001", { at: "2026-08-01T00:00:00Z" }).code, "ALLOW");
    assert.equal(h.decisions.resolveEffective("dec_p0_14_001", { at: "2027-01-01T00:00:00Z" }).code, "DENY_TEMPORAL_BOUNDARY");
    assert.equal(h.decisions.resolveEffective("dec_p0_14_001", { at: "2026-01-01T00:00:00Z" }).code, "DENY_TEMPORAL_BOUNDARY");
    assert.equal(h.decisions.resolveEffective("dec_ghost", { at: "2026-08-01T00:00:00Z" }).code, "DENY_UNKNOWN_DECISION");
    assert.equal(h.decisions.resolveEffective("dec_p0_14_001", { at: "not-a-date" }).code, "DENY_INVALID_INSTANT");

    denies(
      () => h.decisions.appendDecision(decision({ decision_id: "dec_bad_window", valid_from: "2026-12-31T00:00:00Z", valid_until: "2026-07-19T10:00:00Z" }), { expectedSequence: 1, idempotencyKey: "idem_dec_2" }),
      "DENY_INVALID_TEMPORAL_WINDOW"
    );
    denies(
      () => h.decisions.appendDecision(decision({ decision_id: "dec_rev_bad", decision_type: "REVERSION" }), { expectedSequence: 1, idempotencyKey: "idem_dec_3" }),
      "DENY_INCONSISTENT_REVERSION"
    );
    // reversion authority cannot be smuggled through a non-REVERSION type
    denies(
      () => h.decisions.appendDecision(decision({ decision_id: "dec_smuggle", decision_type: "GOVERNANCE", reverts: "dec_p0_14_001" }), { expectedSequence: 1, idempotencyKey: "idem_dec_6" }),
      "DENY_INCONSISTENT_REVERSION"
    );
    denies(
      () => h.decisions.appendDecision(decision({ decision_id: "dec_extra", smuggled: true }), { expectedSequence: 1, idempotencyKey: "idem_dec_4" }),
      "DENY_CONTRACT_INVALID",
      ContractValidationError
    );

    h.decisions.appendDecision(
      decision({ decision_id: "dec_reversion_001", decision_type: "REVERSION", outcome: "REVERT", reverts: "dec_p0_14_001", rationale: "Outcome invalidated the acceptance" }),
      { expectedSequence: 1, idempotencyKey: "idem_dec_5" }
    );
    assert.equal(h.decisions.resolveEffective("dec_p0_14_001", { at: "2026-08-01T00:00:00Z" }).code, "DENY_REVERTED");
  } finally {
    h.cleanup();
  }
});

test("knowledge ledger: claims require a verified evidence chain", () => {
  const h = harness();
  try {
    const appended = h.knowledge.appendClaim(claim(), { expectedSequence: 0, idempotencyKey: "idem_kc_1" });
    assert.equal(appended.replayed, false);
    h.knowledge.appendClaim(
      claim({ claim_id: "kc_p0_14_002", evidence_refs: ["ev_accepted_001"] }),
      { expectedSequence: 1, idempotencyKey: "idem_kc_2" }
    );

    denies(
      () => h.knowledge.appendClaim(claim({ claim_id: "kc_bad_1", evidence_refs: ["ev_ghost"] }), { expectedSequence: 2, idempotencyKey: "idem_kc_3" }),
      "DENY_EVIDENCE_CHAIN"
    );
    denies(
      () => h.knowledge.appendClaim(claim({ claim_id: "kc_bad_2", evidence_refs: ["ev_captured_001"] }), { expectedSequence: 2, idempotencyKey: "idem_kc_4" }),
      "DENY_EVIDENCE_CHAIN"
    );
    denies(
      () => h.knowledge.appendClaim(claim({ claim_id: "kc_bad_3", evidence_refs: ["ev_verified_001", "ev_rejected_001"] }), { expectedSequence: 2, idempotencyKey: "idem_kc_5" }),
      "DENY_EVIDENCE_CHAIN"
    );
    denies(
      () => h.knowledge.appendClaim(claim({ claim_id: "kc_bad_4", truth_status: "definitely" }), { expectedSequence: 2, idempotencyKey: "idem_kc_6" }),
      "DENY_CONTRACT_INVALID",
      ContractValidationError
    );
  } finally {
    h.cleanup();
  }
});

test("knowledge ledger: temporal boundary resolves fail-closed", () => {
  const h = harness();
  try {
    h.knowledge.appendClaim(claim(), { expectedSequence: 0, idempotencyKey: "idem_kc_t1" });
    assert.equal(h.knowledge.resolveClaim("kc_p0_14_001", { at: "2026-08-15T00:00:00Z" }).code, "ALLOW");
    assert.equal(h.knowledge.resolveClaim("kc_p0_14_001", { at: "2026-11-01T00:00:00Z" }).code, "DENY_TEMPORAL_BOUNDARY");
    assert.equal(h.knowledge.resolveClaim("kc_ghost", { at: "2026-08-15T00:00:00Z" }).code, "DENY_UNKNOWN_CLAIM");
    const resolved = h.knowledge.resolveClaim("kc_p0_14_001", { at: "2026-08-15T00:00:00Z" });
    resolved.claim.statement = "mutated";
    assert.notEqual(h.knowledge.resolveClaim("kc_p0_14_001", { at: "2026-08-15T00:00:00Z" }).claim.statement, "mutated");
  } finally {
    h.cleanup();
  }
});

test("outcome ledger: receipts bind to known decisions and enforce reversion consistency", () => {
  const h = harness();
  try {
    h.decisions.appendDecision(decision(), { expectedSequence: 0, idempotencyKey: "idem_dec_o1" });

    const validated = h.outcomes.appendOutcome(outcome(), { expectedSequence: 0, idempotencyKey: "idem_out_1" });
    assert.equal(validated.reversionRequired, false);

    const invalidated = h.outcomes.appendOutcome(
      outcome({ outcome_id: "out_p0_14_002", outcome_status: "INVALIDATED", reversion_required: true, details: "Outcome contradicted the decision" }),
      { expectedSequence: 1, idempotencyKey: "idem_out_2" }
    );
    assert.equal(invalidated.reversionRequired, true);

    denies(
      () => h.outcomes.appendOutcome(outcome({ outcome_id: "out_bad_1", decision_ref: "dec_ghost" }), { expectedSequence: 2, idempotencyKey: "idem_out_3" }),
      "DENY_UNKNOWN_DECISION"
    );
    denies(
      () => h.outcomes.appendOutcome(outcome({ outcome_id: "out_bad_2", outcome_status: "INVALIDATED", reversion_required: false }), { expectedSequence: 2, idempotencyKey: "idem_out_4" }),
      "DENY_INCONSISTENT_REVERSION"
    );
    denies(
      () => h.outcomes.appendOutcome(outcome({ outcome_id: "out_bad_3", reversion_required: true }), { expectedSequence: 2, idempotencyKey: "idem_out_5" }),
      "DENY_INCONSISTENT_REVERSION"
    );
  } finally {
    h.cleanup();
  }
});

test("temporal ledgers inherit hash-chain idempotency and sequence guards", () => {
  const h = harness();
  try {
    const first = h.decisions.appendDecision(decision(), { expectedSequence: 0, idempotencyKey: "idem_replay" });
    const replay = h.decisions.appendDecision(decision(), { expectedSequence: 0, idempotencyKey: "idem_replay" });
    assert.equal(replay.replayed, true);
    assert.equal(replay.recordHash, first.recordHash);

    denies(
      () => h.decisions.appendDecision(decision({ decision_id: "dec_conflict", rationale: "different content" }), { expectedSequence: 1, idempotencyKey: "idem_replay" }),
      "DENY_IDEMPOTENCY_CONFLICT"
    );
    denies(
      () => h.decisions.appendDecision(decision({ decision_id: "dec_seq" }), { expectedSequence: 5, idempotencyKey: "idem_seq" }),
      "DENY_SEQUENCE_CONFLICT"
    );
    assert.equal(h.decisions.verify().valid, true);
  } finally {
    h.cleanup();
  }
});
