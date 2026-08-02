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

const schemaFiles = manifest.files.filter((file) => file.endsWith(".schema.json"));
// 7 canonical bootstrap schemas plus governed extensions (P0-14 temporal
// ledgers, skill resolver, MOD-MCP capability registry, MOD-WORK goal graph,
// MOD-SKILL S1 skill-candidate intake, MOD-A2A S1 delegation-request
// contract, MOD-RUNTIME S1 checkpoint ledger, MOD-WSPACE S3 workspace-lease
// ledger, MOD-MEM S2 memory-record contract, MOD-SKILL S2 skill-promotion
// ledger, MOD-INTEG S1 integration-queue-entry ledger). Set equality keeps
// this fail-closed: an unexpected schema addition or a missing canonical
// schema both fail.
const expectedSchemas = [
  "contracts/agent-registration.schema.json",
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
  "contracts/capability-record.schema.json",
  "contracts/skill-candidate.schema.json",
  "contracts/goal.schema.json",
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
  "7 canonical bootstrap schemas + 13 governed extensions (P0-14, skill resolver, capability record, skill candidate, MOD-WORK goal, MOD-A2A delegation request, MOD-RUNTIME checkpoint, MOD-WSPACE workspace-lease, MOD-MEM memory-record, MOD-SKILL S2 skill-promotion, MOD-INTEG integration-queue-entry)"
);
const mandatoryIdentityFields = {
  "contracts/agent-registration.schema.json": ["provider_id", "runtime_product_id", "runtime_deployment_id", "agent_instance_id", "evaluation_status", "lifecycle_state"],
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
  "contracts/skill-candidate.schema.json": ["skill_candidate_id", "version", "status", "source_identity", "immutable_version", "integrity"],
  "contracts/goal.schema.json": ["goal_id", "version", "project_id", "level", "title", "status", "parent_goal_id", "content_hash"],
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

// EXACT-SET pins. The loop above is a SUBSET test: it proves the pinned
// identity fields are present and says nothing about what else joined them.
// It is retained deliberately - it names the fields a contract may never lose,
// which is a narrower and more legible claim than the sets below - but it is
// not a gate on contract shape and cannot be made into one.
//
// Sabotage-verified before this block existed: adding a property to
// contracts/decision-record.schema.json left `npm run validate` at exit 0, and
// pushing that property into the schema's `required` array ALSO left it at
// exit 0. Only the per-contract unit test caught either. A gate that a
// contract change can walk past is not a gate on contract change.
//
// BOTH dimensions are pinned, because neither implies the other:
//   - Every governed contract is `additionalProperties: false`, so its
//     property-name set IS its wire surface. A new OPTIONAL property is
//     already a contract change - it admits a payload the contract previously
//     rejected - and a required-only pin is blind to it.
//   - Promoting an existing optional property to required changes `required`
//     and leaves `properties` identical. Demoting required to optional is the
//     same move in reverse, and is the one that silently widens what the
//     system will accept.
//
// Both maps are recorded from the schema files themselves, and held by
// coverage assertions so a newly allowlisted contract cannot arrive unpinned.
// The maintenance cost is one line per deliberate contract change; the failure
// message names the file and the expected size.
const exactRequiredSets = {
  "contracts/agent-registration.schema.json": ["provider_id","runtime_product_id","runtime_deployment_id","agent_profile_id","agent_instance_id","runtime_version","deployment_location","owner","permitted_roles","authority_ceiling","max_data_classification","evaluation_status","lifecycle_state"],
  "contracts/capability-record.schema.json": ["capability_id","version","adapter_id","tool","access","status","source_identity","immutable_version","integrity","tool_inventory","filesystem_boundary","network_boundary","credential_handle","intake_evidence_refs","approvals","revocation"],
  "contracts/context-receipt.schema.json": ["receipt_id","version","project_id","objective_id","work_package_id","session_id","assigned_role","authority_scope","baseline_version","acceptance_criteria","allowed_tools","allowed_skills","evidence_obligations","freshness_timestamp","source_references","content_hash"],
  "contracts/evidence-envelope.schema.json": ["evidence_id","version","project_id","work_package_id","session_id","actor_id","evidence_type","source","observed_at","procedure","result","exit_status","limitations","content_hash","verification_status","classification","retention_policy"],
  "contracts/event-envelope.schema.json": ["event_id","version","project_id","work_package_id","session_id","actor_id","event_type","occurred_at","observed_fact","source","idempotency_key","classification","content_hash"],
  "contracts/handoff-envelope.schema.json": ["handoff_id","version","project_id","work_package_id","source_session_id","destination_role","objective","authorized_scope","work_completed","artifacts","assumptions","evidence_refs","checks","limitations","unresolved_findings","risks","recommended_next_action","context_delta","content_hash"],
  "contracts/project-contract.schema.json": ["project_id","version","status","profile_id","owners","repositories","approvals"],
  "contracts/work-package.schema.json": ["work_package_id","version","project_id","objective","risk_class","status","baseline","scope","non_scope","acceptance_criteria","roles","allowed_paths","prohibited_paths","evidence_obligations","valid_until"],
  "contracts/decision-record.schema.json": ["decision_id","version","project_id","work_package_id","session_id","actor_id","decision_type","outcome","rationale","authority_ref","evidence_refs","decided_at","valid_from","valid_until"],
  "contracts/knowledge-claim.schema.json": ["claim_id","version","project_id","work_package_id","session_id","actor_id","statement","derivation","truth_status","evidence_refs","claimed_at","valid_from","valid_until","retention_policy"],
  "contracts/outcome-receipt.schema.json": ["outcome_id","version","project_id","work_package_id","session_id","actor_id","decision_ref","knowledge_refs","skill_refs","outcome_status","details","evidence_refs","observed_at","reversion_required"],
  "contracts/skill-manifest.schema.json": ["skill_id","version","name","status","owner","source","purpose","supported_runtimes","project_scopes","max_data_classification","evidence_refs","approval_history","revocation_conditions"],
  "contracts/goal.schema.json": ["goal_id","version","project_id","level","title","status","parent_goal_id","provenance","content_hash"],
  "contracts/skill-candidate.schema.json": ["skill_candidate_id","version","name","purpose","status","source_identity","immutable_version","integrity","tool_inventory","filesystem_boundary","network_boundary","credential_handle","harness_compatibility","intake_evidence_refs","withdrawal"],
  "contracts/checkpoint.schema.json": ["checkpoint_id","version","project_id","work_package_id","session_id","actor_id","source_ledger_id","sequence_at_checkpoint","state_snapshot_ref","created_at","content_hash"],
  "contracts/delegation-request.schema.json": ["delegation_id","version","project_id","work_package_id","session_id","source_actor_id","destination_role","objective","inputs","expected_output","acceptance_criteria","ceiling","skills","budget","due_condition","escalation_route","evidence_obligations","created_at","content_hash"],
  "contracts/workspace-lease.schema.json": ["lease_id","version","project_id","work_package_id","session_id","actor_id","write_set","issued_at","ttl","expires_at","content_hash"],
  "contracts/memory-record.schema.json": ["memory_record_id","version","project_id","work_package_id","session_id","actor_id","layer","source","statement","classification","confidence","provenance","valid_from","valid_until","retention_policy","admitted_at","content_hash"],
  "contracts/skill-promotion.schema.json": ["decision_id","version","project_id","work_package_id","session_id","actor_id","skill_candidate_id","skill_version","status","producer_actor_id","independent_review_actor_id","governance_actor_id","bound_action","bound_object_version","evidence_refs","risk_class","decided_at","content_hash"],
  "contracts/integration-queue-entry.schema.json": ["queue_entry_id","version","project_id","work_package_id","session_id","candidate_branch","candidate_tip_commit","base_ref","declared_write_set","status","submitted_by","submitted_at","content_hash"]
};

const exactPropertySets = {
  "contracts/agent-registration.schema.json": ["provider_id","runtime_product_id","runtime_deployment_id","agent_profile_id","agent_instance_id","runtime_version","deployment_location","owner","permitted_roles","authority_ceiling","approved_models","approved_tools","approved_mcp_methods","approved_skills","repository_scopes","environment_scopes","max_data_classification","delegation_rights","evidence_obligations","workload_identity_ref","evaluation_status","lifecycle_state"],
  "contracts/capability-record.schema.json": ["capability_id","version","adapter_id","tool","access","status","source_identity","immutable_version","integrity","tool_inventory","filesystem_boundary","network_boundary","credential_handle","intake_evidence_refs","approvals","revocation"],
  "contracts/context-receipt.schema.json": ["receipt_id","version","project_id","objective_id","work_package_id","session_id","assigned_role","authority_scope","baseline_version","acceptance_criteria","allowed_tools","allowed_skills","evidence_obligations","freshness_timestamp","source_references","content_hash"],
  "contracts/evidence-envelope.schema.json": ["evidence_id","version","project_id","work_package_id","session_id","actor_id","evidence_type","source","observed_at","procedure","result","exit_status","limitations","content_hash","verification_status","classification","retention_policy"],
  "contracts/event-envelope.schema.json": ["event_id","version","project_id","work_package_id","session_id","actor_id","event_type","occurred_at","observed_fact","source","idempotency_key","classification","content_hash"],
  "contracts/handoff-envelope.schema.json": ["handoff_id","version","project_id","work_package_id","source_session_id","destination_role","objective","authorized_scope","work_completed","artifacts","assumptions","evidence_refs","checks","limitations","unresolved_findings","risks","recommended_next_action","context_delta","content_hash"],
  "contracts/project-contract.schema.json": ["project_id","version","status","profile_id","namespace","name","description","owners","repositories","risk_class","evidence_destination","valid_from","valid_until","risk_ceiling","environments","security_classification","data_categories","applicable_policies","governing_lifecycle_policy","evidence_chain","open_register_alignment","authority_invariant","approved_runtime_deployments","proposed_runtime_deployments","approved_agents","proposed_agent_registrations","approved_models","approved_tools","approved_mcp_methods","approved_skills","evidence_root","evidence_destination_status","memory_policy","release_authority","integration_authority","data_residency","provider_transport_policy","agent_tool_network_policy","credential_policy","retention_policy","required_exit_gates","activation_restrictions","revocation_policy","expiry_policy","effective_from","expires_at","approvals"],
  "contracts/work-package.schema.json": ["work_package_id","version","project_id","objective","risk_class","status","baseline","scope","non_scope","acceptance_criteria","roles","allowed_paths","prohibited_paths","evidence_obligations","valid_until"],
  "contracts/decision-record.schema.json": ["decision_id","version","project_id","work_package_id","session_id","actor_id","decision_type","outcome","rationale","authority_ref","evidence_refs","decided_at","valid_from","valid_until","reverts"],
  "contracts/knowledge-claim.schema.json": ["claim_id","version","project_id","work_package_id","session_id","actor_id","statement","derivation","truth_status","evidence_refs","claimed_at","valid_from","valid_until","retention_policy"],
  "contracts/outcome-receipt.schema.json": ["outcome_id","version","project_id","work_package_id","session_id","actor_id","decision_ref","knowledge_refs","skill_refs","outcome_status","details","evidence_refs","observed_at","reversion_required"],
  "contracts/skill-manifest.schema.json": ["skill_id","version","name","status","owner","source","purpose","supported_runtimes","project_scopes","max_data_classification","evidence_refs","approval_history","revocation_conditions"],
  "contracts/goal.schema.json": ["goal_id","version","project_id","level","title","status","parent_goal_id","provenance","content_hash"],
  "contracts/skill-candidate.schema.json": ["skill_candidate_id","version","name","purpose","status","source_identity","immutable_version","integrity","tool_inventory","filesystem_boundary","network_boundary","credential_handle","harness_compatibility","intake_evidence_refs","withdrawal"],
  "contracts/checkpoint.schema.json": ["checkpoint_id","version","project_id","work_package_id","session_id","actor_id","source_ledger_id","sequence_at_checkpoint","state_snapshot_ref","created_at","content_hash"],
  "contracts/delegation-request.schema.json": ["delegation_id","version","project_id","work_package_id","session_id","source_actor_id","destination_role","objective","inputs","expected_output","acceptance_criteria","ceiling","skills","budget","due_condition","escalation_route","evidence_obligations","created_at","content_hash"],
  "contracts/workspace-lease.schema.json": ["lease_id","version","project_id","work_package_id","session_id","actor_id","write_set","issued_at","ttl","expires_at","content_hash"],
  "contracts/memory-record.schema.json": ["memory_record_id","version","project_id","work_package_id","session_id","actor_id","layer","source","statement","classification","confidence","provenance","valid_from","valid_until","retention_policy","admitted_at","supersedes","content_hash"],
  "contracts/skill-promotion.schema.json": ["decision_id","version","project_id","work_package_id","session_id","actor_id","skill_candidate_id","skill_version","status","producer_actor_id","independent_review_actor_id","governance_actor_id","bound_action","bound_object_version","evidence_refs","risk_class","decided_at","content_hash"],
  "contracts/integration-queue-entry.schema.json": ["queue_entry_id","version","project_id","work_package_id","session_id","candidate_branch","candidate_tip_commit","base_ref","declared_write_set","status","submitted_by","submitted_at","content_hash"]
};

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
  const actual = [...JSON.parse(read(file)).required].sort();
  assert(
    JSON.stringify(actual) === JSON.stringify([...expected].sort()),
    `schema.required.exact.${file}`,
    `required set is exactly ${expected.length} fields`
  );
}
for (const [file, expected] of Object.entries(exactPropertySets)) {
  const actual = Object.keys(JSON.parse(read(file)).properties ?? {}).sort();
  assert(
    JSON.stringify(actual) === JSON.stringify([...expected].sort()),
    `schema.properties.exact.${file}`,
    `property set is exactly ${expected.length} names`
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
