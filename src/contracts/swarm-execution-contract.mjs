/**
 * SecB Swarm Execution Contract Service (P0-B)
 *
 * Compiles and validates machine-readable SwarmExecutionContracts issued to external
 * execution providers (e.g. Ruflo RT-RUFLO-LOCAL-001) per ADR-SECB-RUFLO-001 §6.
 */

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const schema = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "..", "..", "contracts", "swarm-execution-contract.schema.json"), "utf8")
);
const ajv = new Ajv2020({ allErrors: true, strict: true, useDefaults: true });
addFormats(ajv);
const validate = ajv.compile(schema);

export class ContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ContractError";
    this.code = code;
  }
}

/**
 * Validate a raw SwarmExecutionContract object.
 */
export function validateSwarmExecutionContract(contract) {
  const candidate = structuredClone(contract);
  if (!validate(candidate)) {
    const errors = validate.errors?.map(e => `${e.instancePath} ${e.message}`).join("; ") ?? "Schema error";
    throw new ContractError("DENY_INVALID_CONTRACT", `SwarmExecutionContract validation failed: ${errors}`);
  }
  return Object.freeze(candidate);
}

/**
 * Create a new SwarmExecutionContract with defaults.
 */
export function createSwarmExecutionContract(opts) {
  const now = new Date();
  const expires = new Date(now.getTime() + (opts.validity_minutes ?? 90) * 60 * 1000);

  const contract = {
    schema_version: "1.0",
    execution: {
      execution_id: opts.execution_id ?? `EXEC-SECB-${Date.now()}`,
      project_id: opts.project_id ?? "SECB",
      project_session_id: opts.project_session_id ?? `PSESSION-${Date.now()}`,
      work_package_id: opts.work_package_id,
      runtime_deployment_id: opts.runtime_deployment_id ?? "RT-RUFLO-LOCAL-001"
    },
    objective: {
      statement: opts.objective_statement,
      acceptance_criteria: opts.acceptance_criteria ?? ["Implementation completes with passing tests and verified evidence"]
    },
    scope: {
      authorized_paths: opts.authorized_paths ?? ["src/**", "tests/**"],
      prohibited_paths: opts.prohibited_paths ?? ["secrets/**", ".env*", ".gitea/**"],
      mutation_class: opts.mutation_class ?? "M0",
      risk_class: opts.risk_class ?? "R0"
    },
    team_policy: {
      required_roles: opts.required_roles ?? ["ENGIN", "REV", "QA"],
      separation_of_duties: {
        producer_may_review: false,
        producer_may_issue_final_verdict: false
      },
      maximum_agents: opts.maximum_agents ?? 5,
      maximum_parallel_writers: opts.maximum_parallel_writers ?? 2
    },
    runtime_policy: {
      allowed_tools: opts.allowed_tools ?? ["read_repository", "edit_authorized_files", "run_tests"],
      prohibited_tools: opts.prohibited_tools ?? ["direct_main_push", "deployment", "unrestricted_shell"],
      maximum_turns: opts.maximum_turns ?? 30,
      maximum_retries: opts.maximum_retries ?? 2,
      maximum_duration_minutes: opts.maximum_duration_minutes ?? 90,
      cost_ceiling: opts.cost_ceiling ?? 20.0
    },
    context: {
      context_receipt_id: opts.context_receipt_id ?? `CTX-${opts.work_package_id}-V1`,
      context_receipt_sha256: opts.context_receipt_sha256 ?? "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      source_refs: opts.source_refs ?? [`secb://requirements/${opts.work_package_id}`]
    },
    workspace: {
      lease_id: opts.lease_id ?? `WL-${opts.work_package_id}`,
      baseline_sha: opts.baseline_sha ?? "a908bbe",
      worktree_root: opts.worktree_root ?? `C:/laragon/www/SecB-worktrees/${opts.work_package_id}`
    },
    evidence: {
      destination: `secb://evidence/${opts.work_package_id}`,
      required: opts.required_evidence ?? ["event_manifest", "write_set", "test_results", "review_findings", "qa_verdict"]
    },
    validity: {
      effective_at: now.toISOString(),
      expires_at: expires.toISOString()
    }
  };

  return validateSwarmExecutionContract(contract);
}
