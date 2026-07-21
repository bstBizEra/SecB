import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildRetryDecisionRecord, evaluateRetry, FAILURE_CLASSES, RETRY_AUTHORIZED } from "../src/control/retry-policy.mjs";
import { DecisionLedger } from "../src/ledger/temporal-ledgers.mjs";

const IDS = Object.freeze({
  project: "prj_secb_local",
  workPackage: "wp_p0_modruntime_s2",
  session: "ses_modruntime_s2"
});

// A fully valid input, so every test below overrides only the field(s) it
// wants to exercise (mirrors the `checkpoint(overrides)` / `decision(overrides)`
// helper pattern already established in tests/checkpoint-ledger.test.mjs and
// tests/temporal-ledgers.test.mjs).
function retryInput(overrides = {}) {
  return {
    attempt: 0,
    retryBudget: 3,
    priorFailureClass: "F-TECH",
    hypothesisChanged: true,
    boundCorrectiveDecisionRef: "dec_corrective_001",
    ...overrides
  };
}

function withTempLedger(operation) {
  const directory = mkdtempSync(join(tmpdir(), "secb-retry-policy-"));
  try {
    return operation(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

// --- Positive path -----------------------------------------------------

test("evaluateRetry authorizes a within-budget, authorized, changed-hypothesis retry", () => {
  assert.deepEqual(evaluateRetry(retryInput()), { ok: true });
});

test("evaluateRetry authorizes at every attempt count strictly below the budget", () => {
  assert.deepEqual(evaluateRetry(retryInput({ attempt: 0, retryBudget: 3 })), { ok: true });
  assert.deepEqual(evaluateRetry(retryInput({ attempt: 1, retryBudget: 3 })), { ok: true });
  assert.deepEqual(evaluateRetry(retryInput({ attempt: 2, retryBudget: 3 })), { ok: true });
});

// --- Boundary: budget exhaustion at exactly max attempts ----------------

test("evaluateRetry denies exactly at the budget boundary (attempt === retryBudget)", () => {
  assert.deepEqual(evaluateRetry(retryInput({ attempt: 3, retryBudget: 3 })), { ok: false, code: "DENY_RETRY_BUDGET_EXHAUSTED" });
});

test("evaluateRetry denies beyond the budget boundary (attempt > retryBudget)", () => {
  assert.deepEqual(evaluateRetry(retryInput({ attempt: 4, retryBudget: 3 })), { ok: false, code: "DENY_RETRY_BUDGET_EXHAUSTED" });
});

test("evaluateRetry denies a zero-budget policy on the very first evaluation (attempt === 0 === retryBudget)", () => {
  // docs/templates/failure-evidence-envelope.yaml default: retry_budget: 0.
  assert.deepEqual(evaluateRetry(retryInput({ attempt: 0, retryBudget: 0 })), { ok: false, code: "DENY_RETRY_BUDGET_EXHAUSTED" });
});

test("evaluateRetry authorizes one attempt below a budget of exactly 1", () => {
  assert.deepEqual(evaluateRetry(retryInput({ attempt: 0, retryBudget: 1 })), { ok: true });
  assert.deepEqual(evaluateRetry(retryInput({ attempt: 1, retryBudget: 1 })), { ok: false, code: "DENY_RETRY_BUDGET_EXHAUSTED" });
});

// --- Doctrine rule 5: no relaxation without governance approval ---------

test("evaluateRetry denies with no bound corrective decision (missing, null, blank, non-string)", () => {
  assert.deepEqual(evaluateRetry(retryInput({ boundCorrectiveDecisionRef: undefined })), { ok: false, code: "DENY_RETRY_UNAUTHORIZED" });
  assert.deepEqual(evaluateRetry(retryInput({ boundCorrectiveDecisionRef: null })), { ok: false, code: "DENY_RETRY_UNAUTHORIZED" });
  assert.deepEqual(evaluateRetry(retryInput({ boundCorrectiveDecisionRef: "" })), { ok: false, code: "DENY_RETRY_UNAUTHORIZED" });
  assert.deepEqual(evaluateRetry(retryInput({ boundCorrectiveDecisionRef: "   " })), { ok: false, code: "DENY_RETRY_UNAUTHORIZED" });
  assert.deepEqual(evaluateRetry(retryInput({ boundCorrectiveDecisionRef: 12345 })), { ok: false, code: "DENY_RETRY_UNAUTHORIZED" });
});

test("evaluateRetry denies with no corrective decision even for every recognized failure class", () => {
  for (const failureClass of FAILURE_CLASSES) {
    assert.deepEqual(
      evaluateRetry(retryInput({ priorFailureClass: failureClass, boundCorrectiveDecisionRef: "" })),
      { ok: false, code: "DENY_RETRY_UNAUTHORIZED" },
      `failure class ${failureClass} must still require a bound corrective decision`
    );
  }
});

// --- Doctrine rule 1: changed hypothesis/input/environment/action -------

test("evaluateRetry denies an unchanged-hypothesis retry even with budget and authorization intact", () => {
  assert.deepEqual(evaluateRetry(retryInput({ hypothesisChanged: false })), { ok: false, code: "DENY_RETRY_UNCHANGED" });
});

test("evaluateRetry strictly types hypothesisChanged (no truthy coercion of a non-boolean)", () => {
  assert.deepEqual(evaluateRetry(retryInput({ hypothesisChanged: "false" })), { ok: false, code: "DENY_INVALID_HYPOTHESIS_FLAG" });
  assert.deepEqual(evaluateRetry(retryInput({ hypothesisChanged: "true" })), { ok: false, code: "DENY_INVALID_HYPOTHESIS_FLAG" });
  assert.deepEqual(evaluateRetry(retryInput({ hypothesisChanged: 1 })), { ok: false, code: "DENY_INVALID_HYPOTHESIS_FLAG" });
  assert.deepEqual(evaluateRetry(retryInput({ hypothesisChanged: null })), { ok: false, code: "DENY_INVALID_HYPOTHESIS_FLAG" });
  assert.deepEqual(evaluateRetry(retryInput({ hypothesisChanged: undefined })), { ok: false, code: "DENY_INVALID_HYPOTHESIS_FLAG" });
});

// --- Fail-closed malformed input -----------------------------------------

test("evaluateRetry fails closed on a malformed attempt", () => {
  assert.deepEqual(evaluateRetry(retryInput({ attempt: -1 })), { ok: false, code: "DENY_INVALID_ATTEMPT" });
  assert.deepEqual(evaluateRetry(retryInput({ attempt: 1.5 })), { ok: false, code: "DENY_INVALID_ATTEMPT" });
  assert.deepEqual(evaluateRetry(retryInput({ attempt: "1" })), { ok: false, code: "DENY_INVALID_ATTEMPT" });
  assert.deepEqual(evaluateRetry(retryInput({ attempt: undefined })), { ok: false, code: "DENY_INVALID_ATTEMPT" });
  assert.deepEqual(evaluateRetry(retryInput({ attempt: Number.NaN })), { ok: false, code: "DENY_INVALID_ATTEMPT" });
});

test("evaluateRetry fails closed on a malformed retryBudget", () => {
  assert.deepEqual(evaluateRetry(retryInput({ retryBudget: -1 })), { ok: false, code: "DENY_INVALID_RETRY_BUDGET" });
  assert.deepEqual(evaluateRetry(retryInput({ retryBudget: 2.5 })), { ok: false, code: "DENY_INVALID_RETRY_BUDGET" });
  assert.deepEqual(evaluateRetry(retryInput({ retryBudget: "3" })), { ok: false, code: "DENY_INVALID_RETRY_BUDGET" });
  assert.deepEqual(evaluateRetry(retryInput({ retryBudget: undefined })), { ok: false, code: "DENY_INVALID_RETRY_BUDGET" });
});

test("evaluateRetry fails closed on an unrecognized or missing failure class", () => {
  assert.deepEqual(evaluateRetry(retryInput({ priorFailureClass: "F-MADE-UP" })), { ok: false, code: "DENY_UNKNOWN_FAILURE_CLASS" });
  assert.deepEqual(evaluateRetry(retryInput({ priorFailureClass: "" })), { ok: false, code: "DENY_UNKNOWN_FAILURE_CLASS" });
  assert.deepEqual(evaluateRetry(retryInput({ priorFailureClass: undefined })), { ok: false, code: "DENY_UNKNOWN_FAILURE_CLASS" });
  assert.deepEqual(evaluateRetry(retryInput({ priorFailureClass: 42 })), { ok: false, code: "DENY_UNKNOWN_FAILURE_CLASS" });
});

test("evaluateRetry recognizes every doctrine failure class as valid when otherwise authorized", () => {
  for (const failureClass of FAILURE_CLASSES) {
    assert.deepEqual(
      evaluateRetry(retryInput({ priorFailureClass: failureClass })),
      { ok: true },
      `failure class ${failureClass} must be a recognized class`
    );
  }
});

test("evaluateRetry denies on a completely empty/undefined input", () => {
  assert.deepEqual(evaluateRetry(), { ok: false, code: "DENY_INVALID_ATTEMPT" });
  assert.deepEqual(evaluateRetry({}), { ok: false, code: "DENY_INVALID_ATTEMPT" });
});

// --- Deterministic precedence across simultaneous violations ------------

test("evaluateRetry checks malformed input before any doctrine gate", () => {
  // Budget exhausted AND malformed attempt at once: malformed-input check wins.
  assert.deepEqual(
    evaluateRetry(retryInput({ attempt: -1, retryBudget: 0, boundCorrectiveDecisionRef: "", hypothesisChanged: false })),
    { ok: false, code: "DENY_INVALID_ATTEMPT" }
  );
});

test("evaluateRetry checks budget exhaustion before authorization before hypothesis-change", () => {
  // All three doctrine gates violated at once: budget wins first.
  assert.deepEqual(
    evaluateRetry(retryInput({ attempt: 3, retryBudget: 3, boundCorrectiveDecisionRef: "", hypothesisChanged: false })),
    { ok: false, code: "DENY_RETRY_BUDGET_EXHAUSTED" }
  );
  // Budget fine, but authorization and hypothesis-change both violated:
  // authorization (rule 5, governance approval) wins over rule 1.
  assert.deepEqual(
    evaluateRetry(retryInput({ attempt: 0, retryBudget: 3, boundCorrectiveDecisionRef: "", hypothesisChanged: false })),
    { ok: false, code: "DENY_RETRY_UNAUTHORIZED" }
  );
});

// --- Decision-record candidate construction ------------------------------

function identity(overrides = {}) {
  return {
    decisionId: "dec_retry_001",
    version: 1,
    projectId: IDS.project,
    workPackageId: IDS.workPackage,
    sessionId: IDS.session,
    actorId: "codex-motor-modruntime-s2",
    authorityRef: "grant_producer_s2",
    evidenceRefs: ["ev_retry_attempt_001"],
    decidedAt: "2026-07-20T12:00:00Z",
    validFrom: "2026-07-20T12:00:00Z",
    validUntil: "2026-12-31T00:00:00Z",
    ...overrides
  };
}

test("buildRetryDecisionRecord mints a DISPOSITION candidate with outcome RETRY_AUTHORIZED on authorization", () => {
  const evaluation = evaluateRetry(retryInput());
  const record = buildRetryDecisionRecord(evaluation, identity());
  assert.equal(record.decision_type, "DISPOSITION");
  assert.equal(record.outcome, RETRY_AUTHORIZED);
  assert.equal(record.outcome, "RETRY_AUTHORIZED");
  assert.ok(record.rationale.length > 0);
  assert.equal(record.decision_id, "dec_retry_001");
  assert.equal(record.project_id, IDS.project);
});

test("buildRetryDecisionRecord mints a DISPOSITION candidate whose outcome is the exact deny code", () => {
  const evaluation = evaluateRetry(retryInput({ attempt: 3, retryBudget: 3 }));
  const record = buildRetryDecisionRecord(evaluation, identity({ decisionId: "dec_retry_002" }));
  assert.equal(record.decision_type, "DISPOSITION");
  assert.equal(record.outcome, "DENY_RETRY_BUDGET_EXHAUSTED");
  assert.ok(record.rationale.includes("budget"));
});

test("buildRetryDecisionRecord performs no I/O — a candidate can be built without any ledger existing", () => {
  // No filesystem path, no ledger import used at all in this test; if this
  // function touched the filesystem it would need a temp dir like every
  // ledger test in this repo does.
  const evaluation = evaluateRetry(retryInput());
  const record = buildRetryDecisionRecord(evaluation, identity({ decisionId: "dec_retry_003" }));
  assert.equal(typeof record, "object");
});

// --- Real ledger recording: every disposition is genuinely appended -----

test("an authorized retry disposition is genuinely appended to DecisionLedger and hash-chain verifies", () => withTempLedger((directory) => {
  const ledger = new DecisionLedger({ filePath: join(directory, "decisions.ndjson") });
  const evaluation = evaluateRetry(retryInput());
  assert.deepEqual(evaluation, { ok: true });

  const record = buildRetryDecisionRecord(evaluation, identity({ decisionId: "dec_retry_authorized_001" }));
  const appended = ledger.appendDecision(record, { expectedSequence: 0, idempotencyKey: "idem_retry_authorized_001" });
  assert.equal(appended.sequence, 1);

  // Not just a return value: reopen the ledger from disk and confirm the
  // disposition is really there, hash-chain-verified.
  const reopened = new DecisionLedger({ filePath: join(directory, "decisions.ndjson") });
  const persisted = reopened.read();
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].entry.payload.outcome, "RETRY_AUTHORIZED");
  assert.equal(persisted[0].entry.payload.decision_type, "DISPOSITION");
  assert.deepEqual(reopened.verify(), {
    valid: true,
    ledgerId: "secb-decision-ledger",
    count: 1,
    headHash: appended.recordHash
  });

  const resolved = reopened.resolveEffective("dec_retry_authorized_001", { at: "2026-08-01T00:00:00Z" });
  assert.equal(resolved.code, "ALLOW");
  assert.equal(resolved.decision.outcome, "RETRY_AUTHORIZED");
}));

test("every denial disposition in the matrix is genuinely appended to DecisionLedger, not just returned", () => withTempLedger((directory) => {
  const ledger = new DecisionLedger({ filePath: join(directory, "decisions.ndjson") });

  const denialCases = [
    { name: "budget_exhausted", input: retryInput({ attempt: 3, retryBudget: 3 }) },
    { name: "unauthorized", input: retryInput({ boundCorrectiveDecisionRef: "" }) },
    { name: "unchanged", input: retryInput({ hypothesisChanged: false }) }
  ];

  let expectedSequence = 0;
  for (const { name, input } of denialCases) {
    const evaluation = evaluateRetry(input);
    assert.equal(evaluation.ok, false);
    const record = buildRetryDecisionRecord(evaluation, identity({ decisionId: `dec_retry_deny_${name}` }));
    const appended = ledger.appendDecision(record, { expectedSequence, idempotencyKey: `idem_retry_deny_${name}` });
    expectedSequence = appended.sequence;
  }

  const reopened = new DecisionLedger({ filePath: join(directory, "decisions.ndjson") });
  const persisted = reopened.read();
  assert.equal(persisted.length, denialCases.length);
  assert.deepEqual(
    persisted.map((record) => record.entry.payload.outcome),
    ["DENY_RETRY_BUDGET_EXHAUSTED", "DENY_RETRY_UNAUTHORIZED", "DENY_RETRY_UNCHANGED"]
  );
  for (const record of persisted) {
    assert.equal(record.entry.payload.decision_type, "DISPOSITION");
  }
  assert.equal(reopened.verify().valid, true);
}));

test("a malformed-input candidate that omits identity fields is denied by the ledger's own contract validation, not silently accepted", () => withTempLedger((directory) => {
  const ledger = new DecisionLedger({ filePath: join(directory, "decisions.ndjson") });
  const evaluation = evaluateRetry(retryInput());
  // Deliberately build a candidate missing required identity fields — this
  // module must not duplicate DecisionLedger's own fail-closed contract
  // gate, and that gate must still catch it.
  const incompleteRecord = buildRetryDecisionRecord(evaluation, { decisionId: "dec_retry_incomplete" });
  assert.throws(
    () => ledger.appendDecision(incompleteRecord, { expectedSequence: 0, idempotencyKey: "idem_incomplete" }),
    (error) => error.code === "DENY_CONTRACT_INVALID"
  );
}));
