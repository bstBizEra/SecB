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

// Schemas are allowlisted in two sets rather than one. A governed CONTRACT
// under contracts/ and a subsystem-internal schema under src/**/schemas/ carry
// different authority, and a single suffix-matched list conflated them: it made
// inventorying a subsystem schema in MANIFEST fail the contract check. Both sets
// are asserted for set equality, so an unexpected addition or a missing entry
// still fails closed in EITHER category — the split preserves the distinction
// without narrowing what the gate covers.
const allSchemaFiles = manifest.files.filter((file) => file.endsWith(".schema.json"));
const schemaFiles = allSchemaFiles.filter((file) => file.startsWith("contracts/"));
const subsystemSchemaFiles = allSchemaFiles.filter((file) => !file.startsWith("contracts/"));
// 7 canonical bootstrap schemas plus governed extensions (P0-14 temporal
// ledgers, skill resolver, MOD-MCP capability registry, MOD-WORK goal graph).
// Set equality keeps this fail-closed: an unexpected contract addition or a
// missing canonical contract both fail.
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
  "contracts/capability-record.schema.json",
  "contracts/goal.schema.json",
  "contracts/project-registration-package.schema.json",
  "contracts/swarm-execution-contract.schema.json",
  "contracts/system-settings.schema.json",
  "contracts/mcp-upstream-registry.schema.json"
];
assert(
  schemaFiles.length === expectedSchemas.length && expectedSchemas.every((file) => schemaFiles.includes(file)),
  "schemas.count",
  "7 canonical bootstrap schemas + governed extensions including agent enrollment, temporal ledgers, skills, capabilities, goals, project registration, swarm execution, system settings, and MCP upstreams"
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
  "contracts/goal.schema.json": ["goal_id", "version", "project_id", "level", "title", "status", "parent_goal_id", "content_hash"],
  "contracts/project-registration-package.schema.json": ["registration_id", "project_id", "version", "status", "mode"],
  "contracts/swarm-execution-contract.schema.json": ["schema_version", "execution", "objective", "validity"],
  "contracts/system-settings.schema.json": ["schema_version", "environment", "governance"],
  "contracts/mcp-upstream-registry.schema.json": ["schema_version", "registry_id", "wsl_distro", "upstreams"]
};
for (const file of schemaFiles) {
  const schema = JSON.parse(read(file));
  assert(schema.$schema === "https://json-schema.org/draft/2020-12/schema", `schema.draft.${file}`, "draft 2020-12");
  assert(schema.type === "object" && schema.additionalProperties === false, `schema.closed.${file}`, "closed object contract");
  assert(Array.isArray(schema.required) && schema.required.length > 0, `schema.required.${file}`, `${schema.required.length} required fields`);
  const missing = mandatoryIdentityFields[file].filter((field) => !schema.required.includes(field));
  assert(missing.length === 0, `schema.identity.${file}`, "identity and version fields required");
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
