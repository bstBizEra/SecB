import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ContractValidationError, validateContract } from "../src/contracts/contract-validator.mjs";
import { DelegationLedger } from "../src/ledger/delegation-ledger.mjs";
import { LedgerError } from "../src/ledger/durable-ledger.mjs";

function delegationRequest(overrides = {}) {
  return {
    delegation_id: "del_p0_test_001",
    version: 1,
    project_id: "prj_secb_local",
    work_package_id: "wp_p0_test_001",
    session_id: "ses_local_test_001",
    source_actor_id: "claude-motor-moda2a-s1",
    destination_role: "ENGIN",
    objective: "Implement the bounded MOD-A2A S1 delegation-request contract and ledger",
    inputs: ["opaque://docs/07-capabilities/mcp-a2a-governance.md"],
    expected_output: "A merged, tested DelegationLedger primitive and delegation-request schema",
    acceptance_criteria: ["npm test green", "validate-foundation exit 0", "no live wiring"],
    ceiling: {
      riskClass: "R2",
      dataClassification: "INTERNAL",
      paths: ["src/ledger", "contracts", "tests"],
      tools: ["fs-read", "fs-write"],
      transitions: ["DRAFT_TO_CANDIDATE"]
    },
    skills: ["nodejs", "json-schema"],
    budget: { amount: 4, unit: "hours" },
    due_condition: "before the next module-completion tracker review",
    escalation_route: "GOV",
    evidence_obligations: ["npm-test-output", "producer-verification-record"],
    created_at: "2026-07-20T18:00:00+07:00",
    content_hash: "a".repeat(64),
    ...overrides
  };
}

function withTempLedger(operation) {
  const directory = mkdtempSync(join(tmpdir(), "secb-delegation-ledger-"));
  try {
    return operation(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

// --- Positive path: create / append / read ---------------------------------

test("delegation ledger persists a verifiable hash chain across instances", () => withTempLedger((directory) => {
  const path = join(directory, "delegations.ndjson");
  const firstLedger = new DelegationLedger({ filePath: path });
  const first = firstLedger.appendDelegationRequest(delegationRequest(), { expectedSequence: 0, idempotencyKey: "idem_del_001" });
  const second = firstLedger.appendDelegationRequest(
    delegationRequest({ delegation_id: "del_p0_test_002" }),
    { expectedSequence: 1, idempotencyKey: "idem_del_002" }
  );
  assert.equal(first.sequence, 1);
  assert.equal(second.sequence, 2);
  assert.equal(second.previousHash, first.recordHash);

  const reopened = new DelegationLedger({ filePath: path });
  assert.deepEqual(reopened.verify(), {
    valid: true,
    ledgerId: "secb-delegation-ledger",
    count: 2,
    headHash: second.recordHash
  });
}));

test("appendDelegationRequest validates the delegation-request contract before durable append", () => withTempLedger((directory) => {
  const ledger = new DelegationLedger({ filePath: join(directory, "delegations.ndjson") });
  const appended = ledger.appendDelegationRequest(delegationRequest(), { expectedSequence: 0, idempotencyKey: "idem_del_001" });
  assert.equal(appended.sequence, 1);
  assert.throws(
    () => ledger.appendDelegationRequest(delegationRequest({ delegation_id: "del_bad", content_hash: "not-a-hash" }), {
      expectedSequence: 1,
      idempotencyKey: "idem_del_bad"
    }),
    (error) => error instanceof ContractValidationError && error.code === "DENY_CONTRACT_INVALID"
  );
}));

test("appendDelegationRequest requires an idempotency key", () => withTempLedger((directory) => {
  const ledger = new DelegationLedger({ filePath: join(directory, "delegations.ndjson") });
  assert.throws(
    () => ledger.appendDelegationRequest(delegationRequest(), { expectedSequence: 0 }),
    (error) => error instanceof LedgerError && error.code === "DENY_MISSING_ENTRY_FIELDS"
  );
}));

// --- Read-side lookup --------------------------------------------------------

test("resolveDelegationRequest resolves an exact delegation id, fail-closed on unknown/invalid id", () => withTempLedger((directory) => {
  const ledger = new DelegationLedger({ filePath: join(directory, "delegations.ndjson") });
  ledger.appendDelegationRequest(delegationRequest(), { expectedSequence: 0, idempotencyKey: "idem_1" });

  const resolved = ledger.resolveDelegationRequest("del_p0_test_001");
  assert.equal(resolved.code, "ALLOW");
  assert.equal(resolved.delegationRequest.destination_role, "ENGIN");
  assert.equal(resolved.sequence, 1);

  const unknown = ledger.resolveDelegationRequest("del_never_existed");
  assert.equal(unknown.code, "DENY_UNKNOWN_DELEGATION");
  assert.equal(unknown.delegationRequest, null);

  const invalid = ledger.resolveDelegationRequest(null);
  assert.equal(invalid.code, "DENY_INVALID_DELEGATION_ID");
}));

// --- Idempotency / optimistic concurrency (matches base-class conventions) --

test("identical delegation-request append replays and conflicting idempotency-key reuse is denied", () => withTempLedger((directory) => {
  const ledger = new DelegationLedger({ filePath: join(directory, "delegations.ndjson") });
  const first = ledger.appendDelegationRequest(delegationRequest(), { expectedSequence: 0, idempotencyKey: "idem_replay" });
  const replay = ledger.appendDelegationRequest(delegationRequest(), { expectedSequence: 0, idempotencyKey: "idem_replay" });
  assert.equal(replay.recordHash, first.recordHash);
  assert.equal(replay.replayed, true);

  assert.throws(
    () => ledger.appendDelegationRequest(
      delegationRequest({ delegation_id: "del_p0_test_002" }),
      { expectedSequence: 1, idempotencyKey: "idem_replay" }
    ),
    (error) => error instanceof LedgerError && error.code === "DENY_IDEMPOTENCY_CONFLICT"
  );
}));

test("stale optimistic sequence is denied", () => withTempLedger((directory) => {
  const ledger = new DelegationLedger({ filePath: join(directory, "delegations.ndjson") });
  ledger.appendDelegationRequest(delegationRequest(), { expectedSequence: 0, idempotencyKey: "idem_1" });
  assert.throws(
    () => ledger.appendDelegationRequest(
      delegationRequest({ delegation_id: "del_p0_test_002" }),
      { expectedSequence: 0, idempotencyKey: "idem_2" }
    ),
    (error) => error instanceof LedgerError && error.code === "DENY_SEQUENCE_CONFLICT"
  );
}));

test("duplicate delegation-request entry identity fails closed", () => withTempLedger((directory) => {
  const ledger = new DelegationLedger({ filePath: join(directory, "delegations.ndjson") });
  ledger.appendDelegationRequest(delegationRequest(), { expectedSequence: 0, idempotencyKey: "idem_1" });
  assert.throws(
    () => ledger.appendDelegationRequest(delegationRequest(), { expectedSequence: 1, idempotencyKey: "idem_different" }),
    (error) => error instanceof LedgerError && error.code === "DENY_DUPLICATE_ENTRY_ID"
  );
}));

test("an existing writer lock fails closed on delegation-request append", () => withTempLedger((directory) => {
  const path = join(directory, "delegations.ndjson");
  const ledger = new DelegationLedger({ filePath: path });
  mkdirSync(`${path}.lock`);
  assert.throws(
    () => ledger.appendDelegationRequest(delegationRequest(), { expectedSequence: 0, idempotencyKey: "idem_1" }),
    (error) => error instanceof LedgerError && error.code === "LEDGER_BUSY"
  );
}));

// --- Tamper / hash-chain detection (matches durable-ledger.test.mjs rigor) --

test("tampering the delegation ledger file is detected before records are returned", () => withTempLedger((directory) => {
  const path = join(directory, "delegations.ndjson");
  const ledger = new DelegationLedger({ filePath: path });
  ledger.appendDelegationRequest(delegationRequest(), { expectedSequence: 0, idempotencyKey: "idem_1" });
  const tampered = readFileSync(path, "utf8").replace("ENGIN", "GOV");
  writeFileSync(path, tampered, "utf8");
  assert.throws(
    () => ledger.read(),
    (error) => error instanceof LedgerError && error.code === "LEDGER_INTEGRITY_FAILURE"
  );
  assert.throws(
    () => ledger.resolveDelegationRequest("del_p0_test_001"),
    (error) => error instanceof LedgerError && error.code === "LEDGER_INTEGRITY_FAILURE"
  );
}));

test("a flipped recordHash on a delegation-request entry breaks chain verification", () => withTempLedger((directory) => {
  const path = join(directory, "delegations.ndjson");
  const ledger = new DelegationLedger({ filePath: path });
  ledger.appendDelegationRequest(delegationRequest(), { expectedSequence: 0, idempotencyKey: "idem_1" });
  ledger.appendDelegationRequest(
    delegationRequest({ delegation_id: "del_p0_test_002" }),
    { expectedSequence: 1, idempotencyKey: "idem_2" }
  );
  const lines = readFileSync(path, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
  lines[0].recordHash = "f".repeat(64);
  writeFileSync(path, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`, "utf8");
  assert.throws(
    () => ledger.verify(),
    (error) => error instanceof LedgerError && error.code === "LEDGER_INTEGRITY_FAILURE"
  );
}));

test("removing a delegation-request entry breaks the sequence chain", () => withTempLedger((directory) => {
  const path = join(directory, "delegations.ndjson");
  const ledger = new DelegationLedger({ filePath: path });
  ledger.appendDelegationRequest(delegationRequest(), { expectedSequence: 0, idempotencyKey: "idem_1" });
  ledger.appendDelegationRequest(
    delegationRequest({ delegation_id: "del_p0_test_002" }),
    { expectedSequence: 1, idempotencyKey: "idem_2" }
  );
  const lines = readFileSync(path, "utf8").trim().split(/\r?\n/);
  writeFileSync(path, `${lines[1]}\n`, "utf8");
  assert.throws(
    () => ledger.verify(),
    (error) => error instanceof LedgerError && error.code === "LEDGER_INTEGRITY_FAILURE"
  );
}));

// --- Doctrine-named field enforcement (genuinely required/validated, not --
// --- merely present in the schema with no enforcement) ---------------------
//
// docs/07-capabilities/mcp-a2a-governance.md: "Every delegation declares
// source, destination, objective, scope, inputs, expected output,
// acceptance criteria, authority ceiling, tools, skills, data, budget,
// due condition, evidence obligations, and escalation route." Each
// mutation below removes/degrades exactly one doctrine-named field
// (budget, skills, due_condition, expected_output) from an otherwise-
// valid delegation request and confirms the schema genuinely rejects it,
// not just that a well-formed request happens to include the field.

test("budget is genuinely required: missing, malformed, and unit-less budgets are all rejected", () => {
  assert.doesNotThrow(() => validateContract("delegationRequest", delegationRequest()));

  const { budget, ...withoutBudget } = delegationRequest();
  assert.throws(
    () => validateContract("delegationRequest", withoutBudget),
    (error) => error instanceof ContractValidationError && error.code === "DENY_CONTRACT_INVALID"
  );

  assert.throws(
    () => validateContract("delegationRequest", delegationRequest({ budget: { amount: 4 } })),
    (error) => error instanceof ContractValidationError && error.code === "DENY_CONTRACT_INVALID"
  );

  assert.throws(
    () => validateContract("delegationRequest", delegationRequest({ budget: { amount: -1, unit: "hours" } })),
    (error) => error instanceof ContractValidationError && error.code === "DENY_CONTRACT_INVALID"
  );

  assert.throws(
    () => validateContract("delegationRequest", delegationRequest({ budget: "four hours" })),
    (error) => error instanceof ContractValidationError && error.code === "DENY_CONTRACT_INVALID"
  );
});

test("skills is genuinely required: missing, empty, and non-string skill sets are all rejected", () => {
  const { skills, ...withoutSkills } = delegationRequest();
  assert.throws(
    () => validateContract("delegationRequest", withoutSkills),
    (error) => error instanceof ContractValidationError && error.code === "DENY_CONTRACT_INVALID"
  );

  assert.throws(
    () => validateContract("delegationRequest", delegationRequest({ skills: [] })),
    (error) => error instanceof ContractValidationError && error.code === "DENY_CONTRACT_INVALID"
  );

  assert.throws(
    () => validateContract("delegationRequest", delegationRequest({ skills: [""] })),
    (error) => error instanceof ContractValidationError && error.code === "DENY_CONTRACT_INVALID"
  );

  assert.throws(
    () => validateContract("delegationRequest", delegationRequest({ skills: [1, 2] })),
    (error) => error instanceof ContractValidationError && error.code === "DENY_CONTRACT_INVALID"
  );
});

test("due_condition is genuinely required: missing, empty, and non-string values are all rejected", () => {
  const { due_condition, ...withoutDueCondition } = delegationRequest();
  assert.throws(
    () => validateContract("delegationRequest", withoutDueCondition),
    (error) => error instanceof ContractValidationError && error.code === "DENY_CONTRACT_INVALID"
  );

  assert.throws(
    () => validateContract("delegationRequest", delegationRequest({ due_condition: "" })),
    (error) => error instanceof ContractValidationError && error.code === "DENY_CONTRACT_INVALID"
  );

  assert.throws(
    () => validateContract("delegationRequest", delegationRequest({ due_condition: null })),
    (error) => error instanceof ContractValidationError && error.code === "DENY_CONTRACT_INVALID"
  );
});

test("expected_output is genuinely required: missing, empty, and non-string values are all rejected", () => {
  const { expected_output, ...withoutExpectedOutput } = delegationRequest();
  assert.throws(
    () => validateContract("delegationRequest", withoutExpectedOutput),
    (error) => error instanceof ContractValidationError && error.code === "DENY_CONTRACT_INVALID"
  );

  assert.throws(
    () => validateContract("delegationRequest", delegationRequest({ expected_output: "" })),
    (error) => error instanceof ContractValidationError && error.code === "DENY_CONTRACT_INVALID"
  );

  assert.throws(
    () => validateContract("delegationRequest", delegationRequest({ expected_output: 42 })),
    (error) => error instanceof ContractValidationError && error.code === "DENY_CONTRACT_INVALID"
  );
});

// --- Closed-schema / additional-property discipline -------------------------

test("delegation-request schema is closed: an unrecognized field is rejected", () => {
  assert.throws(
    () => validateContract("delegationRequest", delegationRequest({ status: "PENDING" })),
    (error) => error instanceof ContractValidationError && error.code === "DENY_CONTRACT_INVALID"
  );
});

test("ceiling reuses the non-escalation-comparator shape and is itself closed and fail-closed", () => {
  assert.throws(
    () => validateContract("delegationRequest", delegationRequest({ ceiling: { riskClass: "R2", dataClassification: "INTERNAL", paths: [], tools: [] } })),
    (error) => error instanceof ContractValidationError && error.code === "DENY_CONTRACT_INVALID"
  );

  assert.throws(
    () => validateContract("delegationRequest", delegationRequest({
      ceiling: { riskClass: "R99", dataClassification: "INTERNAL", paths: [], tools: [], transitions: [] }
    })),
    (error) => error instanceof ContractValidationError && error.code === "DENY_CONTRACT_INVALID"
  );
});
