/**
 * SecB Swarm Execution Contract Unit Tests (P0-B)
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  ContractError,
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
    // Was /validation failed/ — a message regex, which any error carrying that
    // phrase satisfies. The code is the refusal; the message is prose.
    (error) => error instanceof ContractError && error.code === "DENY_INVALID_CONTRACT"
  );
});

test("AC-CONTRACT-03: validateSwarmExecutionContract rejects illegal mutation or risk class", () => {
  assert.throws(
    () => createSwarmExecutionContract({
      work_package_id: "WP-001",
      objective_statement: "Test",
      mutation_class: "M99" // Invalid
    }),
    (error) => error instanceof ContractError && error.code === "DENY_INVALID_CONTRACT"
  );
});

// ---------------------------------------------------------------------------
// DENY_INVALID_CONTRACT, asserted by code across distinct kinds of invalidity.
//
// The two rejections above were written as `/validation failed/` — a MESSAGE
// regex. Any error whose message happens to contain that phrase satisfies it,
// including one raised somewhere else entirely, so the refusal had never
// actually been pinned. Both now assert the code; this adds the shapes they
// did not cover.
// ---------------------------------------------------------------------------

test("DENY_INVALID_CONTRACT — every kind of schema failure refuses under one code", () => {
  const cases = {
    "not an object at all": "swarm",
    "an array where an object is required": [],
    "empty": {},
    "a required field of the wrong type": { schema_version: 1 }
  };
  for (const [what, contract] of Object.entries(cases)) {
    assert.throws(
      () => validateSwarmExecutionContract(contract),
      (error) => {
        assert.ok(error instanceof ContractError, `${what}: wrong error class`);
        assert.equal(error.code, "DENY_INVALID_CONTRACT", `${what}: wrong code`);
        return true;
      },
      what
    );
  }
});

test("useDefaults is inert here, which is why the validator's clone cannot be demonstrated", () => {
  // The validator structuredClones its input before validating, and the ajv
  // instance is built with `useDefaults` — which WRITES defaults into the object
  // it validates. That clone therefore looks load-bearing.
  //
  // It is not, TODAY, and a test asserting "validating does not mutate my
  // contract" passes whether the clone is there or not. I wrote that test first;
  // removing the clone did not move the suite, which is how the claim was
  // caught. The reason is here: the schema declares no defaults at all, so
  // useDefaults has nothing to write.
  //
  // So this asserts the premise instead. The moment a `default` is added to the
  // schema, useDefaults becomes live, the clone becomes genuinely load-bearing,
  // and a mutation test becomes both possible and necessary. This fails on that
  // day and says so.
  const schema = readFileSync(
    resolve(import.meta.dirname, "..", "contracts", "swarm-execution-contract.schema.json"),
    "utf8"
  );
  assert.equal(
    JSON.parse(schema) && (schema.match(/"default"\s*:/g) ?? []).length,
    0,
    "the schema now declares a default, so ajv's useDefaults will write into the validated object. " +
      "The structuredClone in validateSwarmExecutionContract is now load-bearing — add a test that " +
      "asserts a caller's contract is unchanged after validation, and confirm it fails without the clone."
  );
});
