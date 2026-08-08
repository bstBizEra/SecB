/**
 * SecB P0 Self-Pilot Work Package & Execution Contract Generator (P0-B / Step 1)
 *
 * Compiles and validates:
 *  1. WorkPackage contract: WP-SECB-P0-PILOT (read-only, R0/M0)
 *  2. ContextReceipt contract: CTX-SECB-PILOT-01 (signed SHA-256 context of SecB repo)
 *  3. SwarmExecutionContract: EXEC-SECB-PILOT-001 (issued to RT-RUFLO-LOCAL-001)
 *
 * Usage:
 *  node tools/create-pilot-work-package.mjs
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { validateContract } from "../src/contracts/contract-validator.mjs";
import { createSwarmExecutionContract, validateSwarmExecutionContract } from "../src/contracts/swarm-execution-contract.mjs";

const NOW = new Date().toISOString();
const EXPIRES = new Date(Date.now() + 90 * 60 * 1000).toISOString();

// 1. Work Package Contract
export const WORK_PACKAGE = {
  work_package_id: "WP-SECB-P0-PILOT",
  version: 1,
  project_id: "SECB",
  objective: "Perform read-only SecB repository governance assessment, evidence ledger verification, and negative boundary validation (SECB-PILOT-P0-001).",
  risk_class: "R0",
  status: "AUTHORIZED",
  baseline: "f1eea272442a0587ab5843ba28c6ce47b91e1615",
  scope: [
    "Read-only inspection of src/**",
    "Read-only inspection of contracts/**",
    "Read-only inspection of tests/**",
    "Negative boundary testing (mutation denial, tampered hash rejection, SoD enforcement)"
  ],
  non_scope: [
    "Production release",
    "Git push to remote",
    "Skill publication",
    "File modification outside test sandboxes"
  ],
  acceptance_criteria: [
    "All 10 negative boundary test cases pass and fail closed",
    "Ruflo 5-agent research swarm completes telemetry reporting to SecB EventLedger",
    "Independent REV and QA evidence envelopes sealed",
    "Human operator attestation recorded"
  ],
  roles: {
    producer: "ruflo-swarm-coordinator",
    reviewer: "claude-reviewer-01",
    qa: "gemini-scout-01",
    governance: "HUMAN-OPERATOR-001"
  },
  allowed_paths: [
    "src/**",
    "contracts/**",
    "tests/**",
    "docs/**"
  ],
  prohibited_paths: [
    "secrets/**",
    ".env*",
    ".gitea/**",
    "credentials.json"
  ],
  evidence_obligations: [
    "context-receipt",
    "event-manifest",
    "test-results",
    "review-findings",
    "qa-verdict"
  ],
  valid_until: EXPIRES
};

// Compute content hash
const contextDigest = createHash("sha256")
  .update(JSON.stringify(WORK_PACKAGE))
  .digest("hex");

// 2. Context Receipt (Strict Schema Matching)
export const CONTEXT_RECEIPT = {
  receipt_id: "CTX-SECB-PILOT-01",
  version: 1,
  project_id: "SECB",
  objective_id: "OBJ-SECB-PILOT-01",
  work_package_id: "WP-SECB-P0-PILOT",
  session_id: "SESS-SECB-PILOT-001",
  assigned_role: "ENGIN",
  authority_scope: ["read_repository", "run_tests"],
  baseline_version: "f1eea272442a0587ab5843ba28c6ce47b91e1615",
  acceptance_criteria: WORK_PACKAGE.acceptance_criteria,
  allowed_tools: ["read_repository", "run_tests"],
  allowed_skills: ["swarm-orchestration", "memory-management"],
  evidence_obligations: WORK_PACKAGE.evidence_obligations,
  freshness_timestamp: NOW,
  source_references: ["secb://requirements/WP-SECB-P0-PILOT"],
  content_hash: contextDigest
};

// 3. Swarm Execution Contract (ADR-SECB-RUFLO-001 §6)
export const SWARM_CONTRACT = createSwarmExecutionContract({
  execution_id: "EXEC-SECB-PILOT-001",
  project_id: "SECB",
  work_package_id: "WP-SECB-P0-PILOT",
  runtime_deployment_id: "RT-RUFLO-LOCAL-001",
  objective_statement: WORK_PACKAGE.objective,
  acceptance_criteria: WORK_PACKAGE.acceptance_criteria,
  authorized_paths: WORK_PACKAGE.allowed_paths,
  prohibited_paths: WORK_PACKAGE.prohibited_paths,
  mutation_class: "M0",
  risk_class: "R0",
  required_roles: ["ENGIN", "REV", "QA"],
  maximum_agents: 5,
  allowed_tools: ["read_repository", "run_tests"],
  prohibited_tools: ["direct_main_push", "write_repository", "deployment"],
  context_receipt_id: CONTEXT_RECEIPT.receipt_id,
  context_receipt_sha256: contextDigest,
  lease_id: "WL-SECB-PILOT-01",
  baseline_sha: WORK_PACKAGE.baseline,
  worktree_root: "c:/laragon/www/SecB",
  validity_minutes: 90
});

// Run contract validations
validateContract("workPackage", WORK_PACKAGE);
validateContract("contextReceipt", CONTEXT_RECEIPT);
validateSwarmExecutionContract(SWARM_CONTRACT);

// Output generated contracts to .secb/runtime/pilot/
const outDir = resolve(import.meta.dirname, "..", ".secb", "runtime", "pilot");
mkdirSync(outDir, { recursive: true });

writeFileSync(resolve(outDir, "work-package.json"), JSON.stringify(WORK_PACKAGE, null, 2));
writeFileSync(resolve(outDir, "context-receipt.json"), JSON.stringify(CONTEXT_RECEIPT, null, 2));
writeFileSync(resolve(outDir, "swarm-execution-contract.json"), JSON.stringify(SWARM_CONTRACT, null, 2));

console.log("✅ WP-SECB-P0-PILOT Work Package, ContextReceipt, and SwarmExecutionContract successfully generated and validated!");
console.log(`📁 Contracts saved to: ${outDir}`);
console.log(`📜 Execution ID: ${SWARM_CONTRACT.execution.execution_id}`);
console.log(`🔑 Content Hash: ${CONTEXT_RECEIPT.content_hash}`);
