/**
 * SecB Swarm Execution Contract Unit Tests (P0-B)
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSwarmExecutionContract,
  validateSwarmExecutionContract
} from "../src/contracts/swarm-execution-contract.mjs";

test("AC-CONTRACT-01: createSwarmExecutionContract produces valid contract schema", () => {
  const contract = createSwarmExecutionContract({
    work_package_id: "SECB-WP-042",
    objective_statement: "Implement and verify deterministic lease validation",
    mutation_class: "M2",
    risk_class: "R2"
  });

  assert.equal(contract.schema_version, "1.0");
  assert.equal(contract.execution.work_package_id, "SECB-WP-042");
  assert.equal(contract.scope.mutation_class, "M2");
  assert.equal(contract.scope.risk_class, "R2");
  assert.equal(contract.team_policy.separation_of_duties.producer_may_review, false);
  assert.ok(contract.validity.expires_at);
});

test("AC-CONTRACT-02: validateSwarmExecutionContract rejects contract with missing required fields", () => {
  assert.throws(
    () => validateSwarmExecutionContract({ schema_version: "1.0" }),
    /validation failed/
  );
});

test("AC-CONTRACT-03: validateSwarmExecutionContract rejects illegal mutation or risk class", () => {
  assert.throws(
    () => createSwarmExecutionContract({
      work_package_id: "WP-001",
      objective_statement: "Test",
      mutation_class: "M99" // Invalid
    }),
    /validation failed/
  );
});
