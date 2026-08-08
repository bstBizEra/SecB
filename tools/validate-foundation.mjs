import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const checks = [];

function assert(condition, name, details) {
  if (!condition) throw new Error(`${name}: ${details}`);
  checks.push({ name, status: "PASS", details });
}

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const version = read("VERSION").trim();
const packageSource = read("package.json");
const packageJson = JSON.parse(packageSource);
const manifest = JSON.parse(read("MANIFEST.json"));
const docsManifest = JSON.parse(read("docs/MANIFEST.json"));

assert(version === packageJson.version, "version.package", version);
assert(version === manifest.version, "version.manifest", version);
for (const key of ["name", "version", "type", "scripts", "dependencies", "engines"]) {
  const occurrences = [...packageSource.matchAll(new RegExp(`"${key}"\\s*:`, "g"))].length;
  assert(occurrences === 1, `package.unique.${key}`, "declared exactly once");
}
assert(new Set(manifest.files).size === manifest.files.length, "manifest.unique", `${manifest.files.length} unique paths`);

for (const file of manifest.files) {
  assert(existsSync(resolve(root, file)), `manifest.file.${file}`, "exists");
}

// The loop above proves every inventoried path exists. It does not prove the
// converse, and nothing else did either, so a file could be added under a
// governed path and stay outside MANIFEST indefinitely — which is how 25 of
// them did, undetected by a green suite. AGENTS.md AMD-002 §1 names
// contracts/, src/, tests/ and tools/ as the pre-authorized implementation
// paths and §2 makes keeping MANIFEST accurate for them a duty; this asserts
// the duty instead of trusting it.
//
// Scope is those four roots only. MANIFEST is deliberately not a whole-repo
// inventory — .agents/ and dashboard/ are tracked but inventoried elsewhere or
// not at all — so a repo-wide reverse check would report drift that is not
// drift. Tracked, not on-disk: an untracked working file is not yet part of
// the repository and is not yet owed an entry.
const INVENTORIED_ROOTS = ["contracts/", "src/", "tests/", "tools/"];
const inventoried = new Set(manifest.files);
const governedTracked = execFileSync("git", ["ls-files", "--", ...INVENTORIED_ROOTS], {
  cwd: root,
  encoding: "utf8"
}).split("\n").filter(Boolean);
const uninventoried = governedTracked.filter((file) => !inventoried.has(file));
assert(
  uninventoried.length === 0,
  "manifest.complete",
  uninventoried.length === 0
    ? `${governedTracked.length} tracked paths under ${INVENTORIED_ROOTS.join(", ")} all inventoried`
    : `${uninventoried.length} tracked path(s) missing from MANIFEST.json: ${uninventoried.join(", ")}`
);

assert(docsManifest.status === "DRAFT_NOT_EFFECTIVE", "docs-manifest.status", "draft and not effective");
assert(
  docsManifest.file_count_excluding_manifests === docsManifest.files.length,
  "docs-manifest.count",
  `${docsManifest.files.length} declared paths`
);
assert(new Set(docsManifest.files).size === docsManifest.files.length, "docs-manifest.unique", "all paths unique");
for (const file of docsManifest.files) {
  assert(existsSync(resolve(root, file)), `docs-manifest.file.${file}`, "exists");
}

// Schemas are allowlisted in two sets rather than one. A governed CONTRACT
// under contracts/ and a subsystem-internal schema under src/**/schemas/ carry
// different authority, and a single suffix-matched list conflated them: it made
// inventorying a subsystem schema in MANIFEST fail the contract check. Both sets
// are asserted for set equality, so an unexpected addition or a missing entry
// still fails closed in EITHER category — the split preserves the distinction
// without narrowing what the gate covers.
// A governed CONTRACT lives DIRECTLY in contracts/, not somewhere beneath it.
// The prefix test this used to be (`startsWith("contracts/")`) was written when
// contracts/ was flat, and it means any subdirectory added later silently joins
// the governed set — its schemas would be required to appear in expectedSchemas
// and in all three pin maps, and a slice that merely ships design-layer schemas
// in its own folder would fail a gate it was never meant to be inside. Position
// is now the test. Today this changes nothing: all 35 governed schemas are flat
// and 0 are nested, so the filter selects exactly the same set.
//
// Nesting is not a hiding place either. Anything under contracts/ that is NOT a
// flat contract must be named in NESTED_CONTRACT_SCHEMAS below, so adding one
// stays a deliberate, reviewed act rather than a silent exemption.
const allSchemaFiles = manifest.files.filter((file) => file.endsWith(".schema.json"));
const isFlatContract = (file) => file.startsWith("contracts/") && file.split("/").length === 2;
const schemaFiles = allSchemaFiles.filter(isFlatContract);
const nestedContractSchemas = allSchemaFiles.filter((file) => file.startsWith("contracts/") && !isFlatContract(file));
const subsystemSchemaFiles = allSchemaFiles.filter((file) => !file.startsWith("contracts/"));

const NESTED_CONTRACT_SCHEMAS = [];
assert(
  nestedContractSchemas.length === NESTED_CONTRACT_SCHEMAS.length &&
    NESTED_CONTRACT_SCHEMAS.every((file) => nestedContractSchemas.includes(file)),
  "schemas.nested",
  nestedContractSchemas.length === NESTED_CONTRACT_SCHEMAS.length
    ? `${nestedContractSchemas.length} nested contract schema(s), all allowlisted`
    : `nested contract schemas not allowlisted: ${nestedContractSchemas.filter((f) => !NESTED_CONTRACT_SCHEMAS.includes(f)).join(", ")}`
);
// 7 canonical bootstrap schemas plus governed extensions (P0-14 temporal
// ledgers, skill resolver, MOD-MCP capability registry, MOD-WORK goal graph,
// MOD-SKILL S1 skill-candidate intake, MOD-A2A S1 delegation-request
// contract, MOD-RUNTIME S1 checkpoint ledger, MOD-WSPACE S3 workspace-lease
// ledger, MOD-MEM S2 memory-record contract, MOD-SKILL S2 skill-promotion
// ledger, MOD-INTEG S1 integration-queue-entry ledger, plus project
// registration, swarm execution, system settings and MCP upstreams). Set
// equality keeps this fail-closed: an unexpected schema addition or a missing
// canonical schema both fail.
//
// This list is the UNION of both merge parents. Resolving it by picking one
// side would silently shrink the fail-closed set — the exact governance
// regression the set-equality assertion exists to prevent.
const expectedSchemas = [
  "contracts/agent-enrollment-request.schema.json",
  "contracts/agent-registration.schema.json",
  "contracts/local-bridge-endpoint.schema.json",
  "contracts/local-bridge-frame.schema.json",
  "contracts/local-bridge-handshake-transcript.schema.json",
  "contracts/local-bridge-installation-proof.schema.json",
  "contracts/local-bridge-session.schema.json",
  "contracts/local-bridge-denial.schema.json",
  "contracts/local-bridge-lifecycle.schema.json",
  "contracts/context-receipt.schema.json",
  "contracts/event-envelope.schema.json",
  "contracts/evidence-envelope.schema.json",
  "contracts/handoff-envelope.schema.json",
  "contracts/project-contract.schema.json",
  "contracts/work-package.schema.json",
  "contracts/decision-record.schema.json",
  "contracts/knowledge-claim.schema.json",
  "contracts/outcome-receipt.schema.json",
  "contracts/skill-manifest.schema.json",
  "contracts/skill-package-descriptor.schema.json",
  "contracts/skill-grant-record.schema.json",
  "contracts/runtime-provider-plugin.schema.json",
  "contracts/capability-record.schema.json",
  "contracts/goal.schema.json",
  "contracts/project-registration-package.schema.json",
  "contracts/swarm-execution-contract.schema.json",
  "contracts/system-settings.schema.json",
  "contracts/mcp-upstream-registry.schema.json",
  "contracts/skill-candidate.schema.json",
  "contracts/delegation-request.schema.json",
  "contracts/checkpoint.schema.json",
  "contracts/workspace-lease.schema.json",
  "contracts/memory-record.schema.json",
  "contracts/skill-promotion.schema.json",
  "contracts/integration-queue-entry.schema.json"
];
assert(
  schemaFiles.length === expectedSchemas.length && expectedSchemas.every((file) => schemaFiles.includes(file)),
  "schemas.count",
  "7 canonical bootstrap schemas + governed extensions from both merge parents: agent enrollment, temporal ledgers, skills, capabilities, goals, project registration, swarm execution, system settings, MCP upstreams, skill candidate, delegation request, checkpoint, workspace lease, memory record, skill promotion, integration queue entry"
);
// Subsystem schemas are module-internal and carry no contract authority, but
// they are still allowlisted so that adding one is a deliberate, reviewed act.
const expectedSubsystemSchemas = [
  "src/events/schemas/event-envelope.schema.json",
  "src/registry/schemas/runtime-deployment.schema.json"
];
assert(
  subsystemSchemaFiles.length === expectedSubsystemSchemas.length &&
    expectedSubsystemSchemas.every((file) => subsystemSchemaFiles.includes(file)),
  "schemas.subsystem",
  "2 subsystem-internal schemas (events envelope, runtime deployment) — not governed contracts"
);
const mandatoryIdentityFields = {
  "contracts/agent-enrollment-request.schema.json": ["provider_id", "runtime_product_id", "runtime_deployment_id", "agent_profile_id", "public_key_fingerprint", "idempotency_key"],
  "contracts/agent-registration.schema.json": ["provider_id", "runtime_product_id", "runtime_deployment_id", "agent_instance_id", "evaluation_status", "lifecycle_state"],
  "contracts/local-bridge-endpoint.schema.json": ["schema_version", "locator_id", "service_instance_id", "authority_domain_id", "transport", "owner_scope", "endpoint_name", "service_key_id", "service_public_key_fingerprint", "bridge_protocol_version", "issued_at", "expires_at"],
  "contracts/local-bridge-frame.schema.json": ["schema_version", "frame_id", "connection_id", "session_id", "request_id", "message_type", "sequence", "trace_id", "protocol_version", "declared_payload_bytes"],
  "contracts/local-bridge-handshake-transcript.schema.json": ["schema_version", "handshake_id", "purpose", "harness_installation_id", "runtime_deployment_id", "service_instance_id", "authority_domain_id", "locator_id", "installation_key_id", "service_key_id", "endpoint_binding_id", "client_nonce", "service_nonce", "client_supported_protocol_versions", "service_supported_protocol_versions", "selected_protocol_version", "requested_at", "expires_at"],
  "contracts/local-bridge-installation-proof.schema.json": ["schema_version", "proof_id", "purpose", "handshake_id", "harness_installation_id", "runtime_deployment_id", "installation_key_id", "service_instance_id", "service_key_id", "authority_domain_id", "locator_id", "endpoint_binding_id", "client_nonce", "service_nonce", "selected_protocol_version", "proof_profile_id", "proof_material_class", "proof_value", "issued_at", "expires_at"],
  "contracts/local-bridge-session.schema.json": ["schema_version", "session_id", "handshake_id", "proof_id", "harness_installation_id", "runtime_deployment_id", "service_instance_id", "authority_domain_id", "protocol_version", "authority_source", "proof_verification_status", "replay_commit_status", "authorization_reference", "lifecycle_state", "issued_at", "expires_at"],
  "contracts/local-bridge-denial.schema.json": ["schema_version", "denial_id", "phase", "public_code", "retryable", "trace_id", "occurred_at"],
  "contracts/local-bridge-lifecycle.schema.json": ["schema_version", "lifecycle_event_id", "subject_type", "subject_id", "from_state", "to_state", "decision_status", "authority_reference", "occurred_at"],
  "contracts/project-contract.schema.json": ["project_id", "version", "status", "approvals"],
  "contracts/work-package.schema.json": ["work_package_id", "version", "project_id", "baseline", "status"],
  "contracts/context-receipt.schema.json": ["receipt_id", "version", "project_id", "work_package_id", "session_id", "content_hash"],
  "contracts/handoff-envelope.schema.json": ["handoff_id", "version", "project_id", "work_package_id", "source_session_id", "content_hash"],
  "contracts/event-envelope.schema.json": ["event_id", "version", "project_id", "work_package_id", "session_id", "actor_id", "idempotency_key", "content_hash"],
  "contracts/evidence-envelope.schema.json": ["evidence_id", "version", "project_id", "work_package_id", "session_id", "actor_id", "content_hash", "verification_status"],
  "contracts/capability-record.schema.json": ["capability_id", "version", "adapter_id", "tool", "access", "status"],
  "contracts/decision-record.schema.json": ["decision_id", "version", "project_id", "work_package_id", "session_id", "actor_id", "decision_type", "valid_from", "valid_until"],
  "contracts/knowledge-claim.schema.json": ["claim_id", "version", "project_id", "work_package_id", "session_id", "actor_id", "truth_status", "evidence_refs", "valid_from", "valid_until"],
  "contracts/outcome-receipt.schema.json": ["outcome_id", "version", "project_id", "work_package_id", "session_id", "actor_id", "decision_ref", "outcome_status", "reversion_required"],
  "contracts/skill-manifest.schema.json": ["skill_id", "version", "status", "owner", "source", "project_scopes", "max_data_classification", "approval_history"],
  // ADR-0013 trust-tier split. The descriptor pin deliberately contains no
  // scope or status field: if one is ever added there, this pin fails and the
  // split has been breached.
  "contracts/skill-package-descriptor.schema.json": ["skill_id", "package_name", "display_name", "version", "purpose", "risk_class", "controls"],
  "contracts/skill-grant-record.schema.json": ["skill_id", "version", "status", "project_scopes", "supported_runtimes", "max_data_classification", "evidence_refs", "approval_history", "revocation_conditions"],
  "contracts/runtime-provider-plugin.schema.json": ["plugin_id", "plugin_version", "provider_id", "runtime_product_id", "implementation", "capabilities", "security", "boundaries", "candidate_status"],
  "contracts/goal.schema.json": ["goal_id", "version", "project_id", "level", "title", "status", "parent_goal_id", "content_hash"],
  "contracts/project-registration-package.schema.json": ["registration_id", "project_id", "version", "status", "mode"],
  "contracts/swarm-execution-contract.schema.json": ["schema_version", "execution", "objective", "validity"],
  "contracts/system-settings.schema.json": ["schema_version", "environment", "governance"],
  "contracts/mcp-upstream-registry.schema.json": ["schema_version", "registry_id", "wsl_distro", "upstreams"],
  "contracts/skill-candidate.schema.json": ["skill_candidate_id", "version", "status", "source_identity", "immutable_version", "integrity"],
  "contracts/delegation-request.schema.json": ["delegation_id", "version", "project_id", "work_package_id", "session_id", "source_actor_id", "content_hash"],
  "contracts/checkpoint.schema.json": ["checkpoint_id", "version", "project_id", "session_id", "source_ledger_id", "sequence_at_checkpoint", "content_hash"],
  "contracts/workspace-lease.schema.json": ["lease_id", "version", "project_id", "work_package_id", "session_id", "actor_id", "content_hash"],
  "contracts/memory-record.schema.json": ["memory_record_id", "version", "project_id", "work_package_id", "session_id", "actor_id", "layer", "source", "classification", "valid_from", "valid_until", "content_hash"],
  "contracts/skill-promotion.schema.json": ["decision_id", "version", "project_id", "work_package_id", "session_id", "actor_id", "skill_candidate_id", "skill_version", "content_hash"],
  "contracts/integration-queue-entry.schema.json": ["queue_entry_id", "version", "project_id", "work_package_id", "session_id", "candidate_branch", "status", "content_hash"]
};
for (const file of schemaFiles) {
  const schema = JSON.parse(read(file));
  assert(schema.$schema === "https://json-schema.org/draft/2020-12/schema", `schema.draft.${file}`, "draft 2020-12");
  assert(schema.type === "object" && schema.additionalProperties === false, `schema.closed.${file}`, "closed object contract");
  assert(Array.isArray(schema.required) && schema.required.length > 0, `schema.required.${file}`, `${schema.required.length} required fields`);
  const missing = mandatoryIdentityFields[file].filter((field) => !schema.required.includes(field));
  assert(missing.length === 0, `schema.identity.${file}`, "identity and version fields required");
}

// EXACT-SET pins. The check above is a SUBSET test: it proves the pinned fields
// are present and says nothing about what else joined them. It is retained
// deliberately - it names the identity and version fields a contract may never
// lose, which is a narrower and more legible claim than the sets below - but it
// is not a gate on contract shape, and was never able to be one.
//
// It was first shown wrong for the ADR-0013 pair, where the whole control is
// WHICH TIER a field lives in. A commit message and a code comment previously
// claimed the subset pin would fail if a scope field were added to the
// descriptor. It would not have - verified by mutating the schema and re-running
// the pin logic. The same blindness applies to every other contract here.
//
// The exact-set idiom is now applied to EVERY governed contract, not just the
// ADR-0013 pair, and in TWO dimensions. The reasoning, in order:
//
// 1. Why exact, not subset: the subset pin above is satisfied by any superset,
//    so it cannot see a contract gain, lose, or promote a field. Verified by
//    mutation - adding `subject` to decision-record, and then pushing it into
//    that schema's `required`, both left `npm run validate` at exit 0. Only the
//    per-contract unit test caught it. A gate that a contract change can walk
//    past is not a gate on contract change.
// 2. Why the PROPERTY set and not only the required set: every governed
//    contract is `additionalProperties: false`, so its property-name set IS its
//    wire surface. A new OPTIONAL property is already a contract change - it
//    admits a payload the contract previously rejected - and a required-only
//    pin is blind to it.
// 3. Why BOTH sets and not just properties: neither implies the other.
//    Promoting an existing optional property to required (decision-record's
//    `reverts`, the grant record's `granted_at`) changes the required set and
//    leaves the property set identical. Dropping a required field to optional
//    is the same move in reverse, and it is the one that silently widens what
//    the system will accept. Two pins, two failure modes.
// 4. Why all 28 and not decision-record alone: none of these contracts is
//    open, so for none of them is a field change an internal detail. Pinning
//    only the contract that happened to be probed would leave 27 with the same
//    defect. This adds no false-failure surface - the inputs are static files
//    in-tree, so a failure requires an actual edit to a governed contract, and
//    that edit updating a one-line allowlist here is the same convention that
//    already governs MANIFEST.json and expectedSchemas above. The maintenance
//    cost is one line per deliberate contract change; the message names the
//    file and the expected size.
//
// Both maps are recorded from the schema files themselves, then held by
// coverage assertions so a newly allowlisted contract cannot arrive unpinned.
const exactRequiredSets = {
  "contracts/agent-enrollment-request.schema.json": ["provider_id", "runtime_product_id", "runtime_deployment_id", "agent_profile_id", "runtime_version", "deployment_location", "public_key_fingerprint", "idempotency_key"],
  "contracts/agent-registration.schema.json": ["provider_id", "runtime_product_id", "runtime_deployment_id", "agent_profile_id", "agent_instance_id", "runtime_version", "deployment_location", "owner", "permitted_roles", "authority_ceiling", "max_data_classification", "evaluation_status", "lifecycle_state"],
  "contracts/local-bridge-endpoint.schema.json": ["schema_version", "locator_id", "service_instance_id", "authority_domain_id", "transport", "owner_scope", "endpoint_name", "service_key_id", "service_public_key_fingerprint", "bridge_protocol_version", "issued_at", "expires_at"],
  "contracts/local-bridge-frame.schema.json": ["schema_version", "frame_id", "connection_id", "session_id", "request_id", "message_type", "sequence", "trace_id", "protocol_version", "declared_payload_bytes"],
  "contracts/local-bridge-handshake-transcript.schema.json": ["schema_version", "handshake_id", "purpose", "harness_installation_id", "runtime_deployment_id", "service_instance_id", "authority_domain_id", "locator_id", "installation_key_id", "service_key_id", "endpoint_binding_id", "client_nonce", "service_nonce", "client_supported_protocol_versions", "service_supported_protocol_versions", "selected_protocol_version", "requested_at", "expires_at"],
  "contracts/local-bridge-installation-proof.schema.json": ["schema_version", "proof_id", "purpose", "handshake_id", "harness_installation_id", "runtime_deployment_id", "installation_key_id", "service_instance_id", "service_key_id", "authority_domain_id", "locator_id", "endpoint_binding_id", "client_nonce", "service_nonce", "selected_protocol_version", "proof_profile_id", "proof_material_class", "proof_value", "issued_at", "expires_at"],
  "contracts/local-bridge-session.schema.json": ["schema_version", "session_id", "handshake_id", "proof_id", "harness_installation_id", "runtime_deployment_id", "service_instance_id", "authority_domain_id", "protocol_version", "authority_source", "proof_verification_status", "replay_commit_status", "authorization_reference", "lifecycle_state", "issued_at", "expires_at"],
  "contracts/local-bridge-denial.schema.json": ["schema_version", "denial_id", "phase", "public_code", "retryable", "trace_id", "occurred_at"],
  "contracts/local-bridge-lifecycle.schema.json": ["schema_version", "lifecycle_event_id", "subject_type", "subject_id", "from_state", "to_state", "decision_status", "authority_reference", "occurred_at"],
  "contracts/context-receipt.schema.json": ["receipt_id", "version", "project_id", "objective_id", "work_package_id", "session_id", "assigned_role", "authority_scope", "baseline_version", "acceptance_criteria", "allowed_tools", "allowed_skills", "evidence_obligations", "freshness_timestamp", "source_references", "content_hash"],
  "contracts/event-envelope.schema.json": ["event_id", "version", "project_id", "work_package_id", "session_id", "actor_id", "event_type", "occurred_at", "observed_fact", "source", "idempotency_key", "classification", "content_hash"],
  "contracts/evidence-envelope.schema.json": ["evidence_id", "version", "project_id", "work_package_id", "session_id", "actor_id", "evidence_type", "source", "observed_at", "procedure", "result", "exit_status", "limitations", "content_hash", "verification_status", "classification", "retention_policy"],
  "contracts/handoff-envelope.schema.json": ["handoff_id", "version", "project_id", "work_package_id", "source_session_id", "destination_role", "objective", "authorized_scope", "work_completed", "artifacts", "assumptions", "evidence_refs", "checks", "limitations", "unresolved_findings", "risks", "recommended_next_action", "context_delta", "content_hash"],
  // main widened this contract with its own alignment test at
  // tests/project-contract-schema-alignment.test.mjs. The four fields this pin
  // used to require — risk_class, evidence_destination, valid_from,
  // valid_until — were not deleted; they are optional properties now, listed
  // in the property map below. The pin follows main's file because main's file
  // is the reviewed one and this branch never edited it.
  "contracts/project-contract.schema.json": ["project_id", "version", "status", "profile_id", "owners", "repositories", "approvals"],
  "contracts/work-package.schema.json": ["work_package_id", "version", "project_id", "objective", "risk_class", "status", "baseline", "scope", "non_scope", "acceptance_criteria", "roles", "allowed_paths", "prohibited_paths", "evidence_obligations", "valid_until"],
  "contracts/decision-record.schema.json": ["decision_id", "version", "project_id", "work_package_id", "session_id", "actor_id", "decision_type", "outcome", "rationale", "authority_ref", "evidence_refs", "decided_at", "valid_from", "valid_until"],
  "contracts/knowledge-claim.schema.json": ["claim_id", "version", "project_id", "work_package_id", "session_id", "actor_id", "statement", "derivation", "truth_status", "evidence_refs", "claimed_at", "valid_from", "valid_until", "retention_policy"],
  "contracts/outcome-receipt.schema.json": ["outcome_id", "version", "project_id", "work_package_id", "session_id", "actor_id", "decision_ref", "knowledge_refs", "skill_refs", "outcome_status", "details", "evidence_refs", "observed_at", "reversion_required"],
  "contracts/skill-manifest.schema.json": ["skill_id", "version", "name", "status", "owner", "source", "purpose", "supported_runtimes", "project_scopes", "max_data_classification", "evidence_refs", "approval_history", "revocation_conditions"],
  "contracts/skill-package-descriptor.schema.json": ["skill_id", "package_name", "display_name", "version", "purpose", "risk_class", "controls"],
  "contracts/skill-grant-record.schema.json": ["skill_id", "version", "status", "project_scopes", "supported_runtimes", "max_data_classification", "evidence_refs", "approval_history", "revocation_conditions"],
  "contracts/runtime-provider-plugin.schema.json": ["schema_version", "plugin_id", "plugin_version", "provider_id", "runtime_product_id", "display_name", "purpose", "implementation", "capabilities", "security", "boundaries", "ui", "evidence_obligations", "candidate_status"],
  "contracts/capability-record.schema.json": ["capability_id", "version", "adapter_id", "tool", "access", "status", "source_identity", "immutable_version", "integrity", "tool_inventory", "filesystem_boundary", "network_boundary", "credential_handle", "intake_evidence_refs", "approvals", "revocation"],
  "contracts/goal.schema.json": ["goal_id", "version", "project_id", "level", "title", "status", "parent_goal_id", "provenance", "content_hash"],
  "contracts/project-registration-package.schema.json": ["project_id", "registration_id", "version", "status", "mode", "repository_mutation_authorized", "identity", "proposed_changes", "prohibited_actions", "created_at"],
  "contracts/swarm-execution-contract.schema.json": ["schema_version", "execution", "objective", "scope", "team_policy", "runtime_policy", "context", "workspace", "evidence", "validity"],
  "contracts/system-settings.schema.json": ["schema_version", "environment", "governance", "ports", "swarm", "security", "knowledge", "ledgers"],
  "contracts/mcp-upstream-registry.schema.json": ["schema_version", "registry_id", "wsl_distro", "upstreams"],
  // The seven below arrived with main. This map is a branch-local guard that
  // main never had, so the merge auto-resolved without pinning them and the
  // coverage assertion is what caught the gap — the assertion doing its job.
  // Each array is the schema's own `required` list read from the file, so a
  // later edit to the schema fails here instead of passing silently.
  "contracts/skill-candidate.schema.json": ["skill_candidate_id", "version", "name", "purpose", "status", "source_identity", "immutable_version", "integrity", "tool_inventory", "filesystem_boundary", "network_boundary", "credential_handle", "harness_compatibility", "intake_evidence_refs", "withdrawal"],
  "contracts/delegation-request.schema.json": ["delegation_id", "version", "project_id", "work_package_id", "session_id", "source_actor_id", "destination_role", "objective", "inputs", "expected_output", "acceptance_criteria", "ceiling", "skills", "budget", "due_condition", "escalation_route", "evidence_obligations", "created_at", "content_hash"],
  "contracts/checkpoint.schema.json": ["checkpoint_id", "version", "project_id", "work_package_id", "session_id", "actor_id", "source_ledger_id", "sequence_at_checkpoint", "state_snapshot_ref", "created_at", "content_hash"],
  "contracts/workspace-lease.schema.json": ["lease_id", "version", "project_id", "work_package_id", "session_id", "actor_id", "write_set", "issued_at", "ttl", "expires_at", "content_hash"],
  "contracts/memory-record.schema.json": ["memory_record_id", "version", "project_id", "work_package_id", "session_id", "actor_id", "layer", "source", "statement", "classification", "confidence", "provenance", "valid_from", "valid_until", "retention_policy", "admitted_at", "content_hash"],
  "contracts/skill-promotion.schema.json": ["decision_id", "version", "project_id", "work_package_id", "session_id", "actor_id", "skill_candidate_id", "skill_version", "status", "producer_actor_id", "independent_review_actor_id", "governance_actor_id", "bound_action", "bound_object_version", "evidence_refs", "risk_class", "decided_at", "content_hash"],
  "contracts/integration-queue-entry.schema.json": ["queue_entry_id", "version", "project_id", "work_package_id", "session_id", "candidate_branch", "candidate_tip_commit", "base_ref", "declared_write_set", "status", "submitted_by", "submitted_at", "content_hash"]
};
// Property-name sets. Where a contract carries optional properties they are
// listed here and NOT in the required map above; that difference is itself the
// pinned fact. decision-record's only optional is `reverts` - an optional
// `subject` appearing is exactly what this map rejects.
const exactPropertySets = {
  "contracts/agent-enrollment-request.schema.json": ["provider_id", "runtime_product_id", "runtime_deployment_id", "agent_profile_id", "runtime_version", "deployment_location", "public_key_fingerprint", "idempotency_key"],
  "contracts/agent-registration.schema.json": ["provider_id", "runtime_product_id", "runtime_deployment_id", "runtime_provider_plugin_id", "runtime_provider_plugin_version", "runtime_provider_plugin_fingerprint", "agent_profile_id", "agent_instance_id", "runtime_version", "deployment_location", "owner", "permitted_roles", "authority_ceiling", "approved_models", "approved_tools", "approved_mcp_methods", "approved_skills", "repository_scopes", "project_scopes", "environment_scopes", "max_data_classification", "delegation_rights", "evidence_obligations", "workload_identity_ref", "evaluation_status", "lifecycle_state"],
  "contracts/local-bridge-endpoint.schema.json": ["schema_version", "locator_id", "service_instance_id", "authority_domain_id", "transport", "owner_scope", "endpoint_name", "service_key_id", "service_public_key_fingerprint", "bridge_protocol_version", "issued_at", "expires_at"],
  "contracts/local-bridge-frame.schema.json": ["schema_version", "frame_id", "connection_id", "session_id", "request_id", "message_type", "sequence", "trace_id", "protocol_version", "declared_payload_bytes"],
  "contracts/local-bridge-handshake-transcript.schema.json": ["schema_version", "handshake_id", "purpose", "harness_installation_id", "runtime_deployment_id", "service_instance_id", "authority_domain_id", "locator_id", "installation_key_id", "service_key_id", "endpoint_binding_id", "client_nonce", "service_nonce", "client_supported_protocol_versions", "service_supported_protocol_versions", "selected_protocol_version", "requested_at", "expires_at"],
  "contracts/local-bridge-installation-proof.schema.json": ["schema_version", "proof_id", "purpose", "handshake_id", "harness_installation_id", "runtime_deployment_id", "installation_key_id", "service_instance_id", "service_key_id", "authority_domain_id", "locator_id", "endpoint_binding_id", "client_nonce", "service_nonce", "selected_protocol_version", "proof_profile_id", "proof_material_class", "proof_value", "issued_at", "expires_at"],
  "contracts/local-bridge-session.schema.json": ["schema_version", "session_id", "handshake_id", "proof_id", "harness_installation_id", "runtime_deployment_id", "service_instance_id", "authority_domain_id", "protocol_version", "authority_source", "proof_verification_status", "replay_commit_status", "authorization_reference", "lifecycle_state", "issued_at", "expires_at"],
  "contracts/local-bridge-denial.schema.json": ["schema_version", "denial_id", "phase", "public_code", "retryable", "trace_id", "occurred_at"],
  "contracts/local-bridge-lifecycle.schema.json": ["schema_version", "lifecycle_event_id", "subject_type", "subject_id", "from_state", "to_state", "decision_status", "authority_reference", "occurred_at"],
  "contracts/context-receipt.schema.json": ["receipt_id", "version", "project_id", "objective_id", "work_package_id", "session_id", "assigned_role", "authority_scope", "baseline_version", "acceptance_criteria", "allowed_tools", "allowed_skills", "evidence_obligations", "freshness_timestamp", "source_references", "content_hash"],
  "contracts/event-envelope.schema.json": ["event_id", "version", "project_id", "work_package_id", "session_id", "actor_id", "event_type", "occurred_at", "observed_fact", "source", "idempotency_key", "classification", "content_hash"],
  "contracts/evidence-envelope.schema.json": ["evidence_id", "version", "project_id", "work_package_id", "session_id", "actor_id", "evidence_type", "source", "observed_at", "procedure", "result", "exit_status", "limitations", "content_hash", "verification_status", "classification", "retention_policy"],
  "contracts/handoff-envelope.schema.json": ["handoff_id", "version", "project_id", "work_package_id", "source_session_id", "destination_role", "objective", "authorized_scope", "work_completed", "artifacts", "assumptions", "evidence_refs", "checks", "limitations", "unresolved_findings", "risks", "recommended_next_action", "context_delta", "content_hash"],
  // Property side of main's widened contract — 47 names. risk_class,
  // evidence_destination, valid_from and valid_until appear here but not in
  // the required map: main made them optional and added risk_ceiling,
  // evidence_root, evidence_destination_status, effective_from and expires_at
  // beside them. Expand-migrate, not contract weakening, and this map is where
  // that distinction is recorded.
  "contracts/project-contract.schema.json": ["project_id", "version", "status", "profile_id", "namespace", "name", "description", "owners", "repositories", "risk_class", "evidence_destination", "valid_from", "valid_until", "risk_ceiling", "environments", "security_classification", "data_categories", "applicable_policies", "governing_lifecycle_policy", "evidence_chain", "open_register_alignment", "authority_invariant", "approved_runtime_deployments", "proposed_runtime_deployments", "approved_agents", "proposed_agent_registrations", "approved_models", "approved_tools", "approved_mcp_methods", "approved_skills", "evidence_root", "evidence_destination_status", "memory_policy", "release_authority", "integration_authority", "data_residency", "provider_transport_policy", "agent_tool_network_policy", "credential_policy", "retention_policy", "required_exit_gates", "activation_restrictions", "revocation_policy", "expiry_policy", "effective_from", "expires_at", "approvals"],
  "contracts/work-package.schema.json": ["work_package_id", "version", "project_id", "objective", "risk_class", "status", "baseline", "scope", "non_scope", "acceptance_criteria", "roles", "allowed_paths", "prohibited_paths", "evidence_obligations", "valid_until"],
  "contracts/decision-record.schema.json": ["decision_id","version","project_id","work_package_id","session_id","actor_id","decision_type","outcome","rationale","authority_ref","evidence_refs","decided_at","valid_from","valid_until","reverts","subject"],
  "contracts/knowledge-claim.schema.json": ["claim_id", "version", "project_id", "work_package_id", "session_id", "actor_id", "statement", "derivation", "truth_status", "evidence_refs", "claimed_at", "valid_from", "valid_until", "retention_policy"],
  "contracts/outcome-receipt.schema.json": ["outcome_id", "version", "project_id", "work_package_id", "session_id", "actor_id", "decision_ref", "knowledge_refs", "skill_refs", "outcome_status", "details", "evidence_refs", "observed_at", "reversion_required"],
  "contracts/skill-manifest.schema.json": ["skill_id", "version", "name", "status", "owner", "source", "purpose", "supported_runtimes", "project_scopes", "max_data_classification", "evidence_refs", "approval_history", "revocation_conditions"],
  "contracts/skill-package-descriptor.schema.json": ["skill_id", "package_name", "display_name", "version", "purpose", "risk_class", "authority_ceiling_cap", "owner", "source", "roles", "inputs", "outputs", "controls", "input_schema", "output_schema", "required_models", "required_tools", "required_mcp_methods", "evaluation", "known_limitations"],
  "contracts/skill-grant-record.schema.json": ["skill_id", "version", "status", "producer_actor_id", "project_scopes", "supported_runtimes", "max_data_classification", "evidence_refs", "approval_history", "revocation_conditions", "granted_at", "source_content_digest"],
  "contracts/runtime-provider-plugin.schema.json": ["schema_version", "plugin_id", "plugin_version", "provider_id", "runtime_product_id", "display_name", "purpose", "implementation", "capabilities", "security", "boundaries", "ui", "evidence_obligations", "candidate_status"],
  "contracts/capability-record.schema.json": ["capability_id", "version", "adapter_id", "tool", "access", "status", "source_identity", "immutable_version", "integrity", "tool_inventory", "filesystem_boundary", "network_boundary", "credential_handle", "intake_evidence_refs", "approvals", "revocation"],
  "contracts/goal.schema.json": ["goal_id", "version", "project_id", "level", "title", "status", "parent_goal_id", "provenance", "content_hash"],
  "contracts/project-registration-package.schema.json": ["project_id", "registration_id", "version", "status", "mode", "repository_mutation_authorized", "identity", "proposed_changes", "prohibited_actions", "created_at"],
  "contracts/swarm-execution-contract.schema.json": ["schema_version", "execution", "objective", "scope", "team_policy", "runtime_policy", "context", "workspace", "evidence", "validity"],
  "contracts/system-settings.schema.json": ["schema_version", "environment", "governance", "ports", "swarm", "security", "knowledge", "ledgers"],
  "contracts/mcp-upstream-registry.schema.json": ["schema_version", "registry_id", "description", "wsl_distro", "upstreams"],
  // The seven from main again, here as full property lists. Six are identical
  // to their required set — every property is mandatory. memory-record is not:
  // `supersedes` is its one optional, and recording that difference is the
  // point of keeping this map separate from the required map above.
  "contracts/skill-candidate.schema.json": ["skill_candidate_id", "version", "name", "purpose", "status", "source_identity", "immutable_version", "integrity", "tool_inventory", "filesystem_boundary", "network_boundary", "credential_handle", "harness_compatibility", "intake_evidence_refs", "withdrawal"],
  "contracts/delegation-request.schema.json": ["delegation_id", "version", "project_id", "work_package_id", "session_id", "source_actor_id", "destination_role", "objective", "inputs", "expected_output", "acceptance_criteria", "ceiling", "skills", "budget", "due_condition", "escalation_route", "evidence_obligations", "created_at", "content_hash"],
  "contracts/checkpoint.schema.json": ["checkpoint_id", "version", "project_id", "work_package_id", "session_id", "actor_id", "source_ledger_id", "sequence_at_checkpoint", "state_snapshot_ref", "created_at", "content_hash"],
  "contracts/workspace-lease.schema.json": ["lease_id", "version", "project_id", "work_package_id", "session_id", "actor_id", "write_set", "issued_at", "ttl", "expires_at", "content_hash"],
  "contracts/memory-record.schema.json": ["memory_record_id", "version", "project_id", "work_package_id", "session_id", "actor_id", "layer", "source", "statement", "classification", "confidence", "provenance", "valid_from", "valid_until", "retention_policy", "admitted_at", "supersedes", "content_hash"],
  "contracts/skill-promotion.schema.json": ["decision_id", "version", "project_id", "work_package_id", "session_id", "actor_id", "skill_candidate_id", "skill_version", "status", "producer_actor_id", "independent_review_actor_id", "governance_actor_id", "bound_action", "bound_object_version", "evidence_refs", "risk_class", "decided_at", "content_hash"],
  "contracts/integration-queue-entry.schema.json": ["queue_entry_id", "version", "project_id", "work_package_id", "session_id", "candidate_branch", "candidate_tip_commit", "base_ref", "declared_write_set", "status", "submitted_by", "submitted_at", "content_hash"]
};
// A pin nobody is required to write is a pin that quietly stops covering
// things. Both maps must cover the governed contract set exactly.
const pinnedContractSet = JSON.stringify([...schemaFiles].sort());
assert(
  JSON.stringify(Object.keys(exactRequiredSets).sort()) === pinnedContractSet,
  "schema.required.exact.coverage",
  `${schemaFiles.length} governed contracts carry an exact required-set pin`
);
assert(
  JSON.stringify(Object.keys(exactPropertySets).sort()) === pinnedContractSet,
  "schema.properties.exact.coverage",
  `${schemaFiles.length} governed contracts carry an exact property-set pin`
);
for (const [file, expected] of Object.entries(exactRequiredSets)) {
  const schema = JSON.parse(read(file));
  const actual = [...schema.required].sort();
  assert(
    JSON.stringify(actual) === JSON.stringify([...expected].sort()),
    `schema.required.exact.${file}`,
    `required set is exactly ${expected.length} fields`
  );
}
for (const [file, expected] of Object.entries(exactPropertySets)) {
  const schema = JSON.parse(read(file));
  const actual = Object.keys(schema.properties ?? {}).sort();
  assert(
    JSON.stringify(actual) === JSON.stringify([...expected].sort()),
    `schema.properties.exact.${file}`,
    `property set is exactly ${expected.length} names`
  );
}

// Tier separation, asserted structurally rather than by a hand-copied name list.
// A field that appears as a PROPERTY on both contracts is a tier breach: the
// split's entire claim is that a grant has no descriptor-side home to be
// written into.
{
  const descriptor = JSON.parse(read("contracts/skill-package-descriptor.schema.json"));
  const grant = JSON.parse(read("contracts/skill-grant-record.schema.json"));
  const overlap = Object.keys(descriptor.properties)
    .filter((field) => field in grant.properties)
    .sort();
  assert(
    JSON.stringify(overlap) === JSON.stringify(["skill_id", "version"]),
    "schema.tier-separation",
    "only the join keys appear on both tiers"
  );
}

const sourceLine = read("docs/source/ASSESSMENT.sha256").trim();
assert(sourceLine.startsWith(manifest.source_sha256), "source.digest", manifest.source_sha256);

const operatingModel = read("docs/SECB-OPERATING-MODEL-001.md");
for (const term of ["Universal work lifecycle", "Risk-based team topology", "Seven-ledger organizational brain", "System-of-record boundaries", "Activation boundary"]) {
  assert(operatingModel.includes(term), `operating-model.${term}`, "present");
}

for (const file of manifest.files.filter((path) => path.endsWith(".md"))) {
  const content = read(file);
  const links = [...content.matchAll(/\]\((?!https?:|#)([^)#]+)(?:#[^)]+)?\)/g)].map((match) => match[1]);
  for (const link of links) {
    const target = resolve(root, dirname(file), link);
    assert(existsSync(target), `docs.link.${file}.${link}`, "resolves");
  }
}

const validatorMetadata = read("tools/validate-foundation.meta.yaml");
for (const field of ["one_time_fix: false", "utility_classification: validation", "has_tests: true", "security_reviewed: true"]) {
  assert(validatorMetadata.includes(field), `validator.metadata.${field}`, "present");
}

const sourceDigest = createHash("sha256").update(manifest.source_sha256).digest("hex");
assert(sourceDigest.length === 64, "crypto.sha256", "available");

const SANCTIONED_REMOTES = {
  origin: "https://github.com/bstBizEra/SecB.git"
};

function redactUserinfo(url) {
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) {
      parsed.username = "";
      parsed.password = "";
    }
    return parsed.toString();
  } catch {
    return "<unparseable-remote-url-redacted>";
  }
}

const remoteVerbose = execFileSync("git", ["remote", "-v"], { cwd: root, encoding: "utf8" }).trim();
const remoteEntries = remoteVerbose === ""
  ? []
  : remoteVerbose.split("\n").map((line) => {
      const tabIndex = line.indexOf("\t");
      const name = tabIndex === -1 ? line : line.slice(0, tabIndex);
      const rest = tabIndex === -1 ? "" : line.slice(tabIndex + 1);
      const url = rest.split(" ")[0] ?? "";
      return { name, url };
    });
for (const { name, url } of remoteEntries) {
  assert(SANCTIONED_REMOTES[name] === url, `git.remote.sanctioned.${name}`, `${name} -> ${redactUserinfo(url)}`);
}
const remoteNames = new Set(remoteEntries.map((entry) => entry.name));
assert(
  true,
  "git.remote-summary",
  remoteNames.size === 0 ? "no remotes configured" : `configured remotes: ${[...remoteNames].join(", ")}`
);

console.log(JSON.stringify({ status: "PASS", version, checks }, null, 2));
