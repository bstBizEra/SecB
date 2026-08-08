/**
 * SecB P0 Self-Pilot Work Package Unit Tests (Step 1)
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { WORK_PACKAGE, CONTEXT_RECEIPT, SWARM_CONTRACT } from "../tools/create-pilot-work-package.mjs";
import { validateContract } from "../src/contracts/contract-validator.mjs";
import { validateSwarmExecutionContract } from "../src/contracts/swarm-execution-contract.mjs";

test("AC-PILOT-01: WORK_PACKAGE complies with work-package.schema.json", () => {
  const result = validateContract("workPackage", WORK_PACKAGE);
  assert.equal(result.valid, true);
  assert.equal(WORK_PACKAGE.work_package_id, "WP-SECB-P0-PILOT");
  assert.equal(WORK_PACKAGE.risk_class, "R0");
  assert.equal(WORK_PACKAGE.status, "AUTHORIZED");
});

test("AC-PILOT-02: CONTEXT_RECEIPT complies with context-receipt.schema.json", () => {
  const result = validateContract("contextReceipt", CONTEXT_RECEIPT);
  assert.equal(result.valid, true);
  assert.equal(CONTEXT_RECEIPT.receipt_id, "CTX-SECB-PILOT-01");
  assert.ok(CONTEXT_RECEIPT.content_hash);
});

test("AC-PILOT-03: SWARM_CONTRACT complies with swarm-execution-contract.schema.json", () => {
  const contract = validateSwarmExecutionContract(SWARM_CONTRACT);
  assert.equal(contract.execution.execution_id, "EXEC-SECB-PILOT-001");
  assert.equal(contract.execution.runtime_deployment_id, "RT-RUFLO-LOCAL-001");
  assert.equal(contract.scope.mutation_class, "M0");
});
