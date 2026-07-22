import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { ContractValidationError, validateContract } from "../src/contracts/contract-validator.mjs";

// Schema-alignment slice (bst/schema-align-project-contract): proves the
// Option-A rich Project Contract shape — signed NORMATIVE in
// secb-gov-001-w3c-contract-signing-002.md (OPTION_A_RICH_SHAPE_NORMATIVE) —
// validates STRICTLY against the revised contracts/project-contract.schema.json,
// and that strictness (additionalProperties:false + typing) still bites.

function fixture(relativePath) {
  return JSON.parse(readFileSync(resolve(import.meta.dirname, "fixtures", relativePath), "utf8"));
}

test("SUPERSET: the narrow runtime shape (valid/project.json, consumed by ProjectContractService) STILL validates unchanged", () => {
  // Proof the alignment is a strict SUPERSET, not a replacement: the pre-existing
  // narrow runtime contract (string-array owners/repositories, risk_class,
  // valid_from/valid_until) that the ProjectContractService depends on continues
  // to validate against the revised schema.
  assert.deepEqual(
    validateContract("project", fixture("valid/project.json")),
    { kind: "project", valid: true }
  );
});

test("the rich v2-r2 candidate instance (secb-local-v2-r2.project-contract.yaml → JSON) validates against the revised schema", () => {
  assert.deepEqual(
    validateContract("project", fixture("valid/project-contract-rich.json")),
    { kind: "project", valid: true }
  );
});

test("the fuller v2-r3 normative object (all rich fields: revocation_policy, evidence_chain, authority_invariant, governing_lifecycle_policy, open_register_alignment, expiry_policy) validates as a strict superset", () => {
  assert.deepEqual(
    validateContract("project", fixture("valid/project-contract-rich-v2r3.json")),
    { kind: "project", valid: true }
  );
});

test("strictness held: an undeclared extra field is REJECTED (additionalProperties:false, no blanket loosening)", () => {
  assert.throws(
    () => validateContract("project", fixture("invalid/project-contract-rich-extra-field.json")),
    (error) =>
      error instanceof ContractValidationError &&
      error.code === "DENY_CONTRACT_INVALID" &&
      error.errors.some((e) => e.keyword === "additionalProperties")
  );
});

test("strictness held: a type violation is REJECTED (rich contract with a string version fails the integer typing)", () => {
  assert.throws(
    () => validateContract("project", fixture("invalid/project-contract-rich-bad-type.json")),
    (error) =>
      error instanceof ContractValidationError &&
      error.code === "DENY_CONTRACT_INVALID" &&
      error.errors.some((e) => e.keyword === "type")
  );
});

test("DISJOINT: a document mixing both shapes (narrow window fields AND risk_ceiling) is REJECTED by the oneOf, so the superset does not silently permit arbitrary mixing", () => {
  const mixed = {
    ...fixture("valid/project.json"),
    risk_ceiling: "R2"
  };
  assert.throws(
    () => validateContract("project", mixed),
    (error) =>
      error instanceof ContractValidationError &&
      error.code === "DENY_CONTRACT_INVALID" &&
      error.errors.some((e) => e.keyword === "oneOf")
  );
});
