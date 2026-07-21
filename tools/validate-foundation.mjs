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
// MOD-SKILL S1 skill-candidate intake, MOD-RUNTIME S1 checkpoint ledger).
// Set equality keeps this fail-closed: an unexpected schema addition or a
// missing canonical schema both fail.
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
  "contracts/checkpoint.schema.json"
];
assert(
  schemaFiles.length === expectedSchemas.length && expectedSchemas.every((file) => schemaFiles.includes(file)),
  "schemas.count",
  "7 canonical bootstrap schemas + 8 governed extensions (P0-14, skill resolver, capability record, skill candidate, MOD-WORK goal, MOD-RUNTIME checkpoint)"
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
  "contracts/checkpoint.schema.json": ["checkpoint_id", "version", "project_id", "session_id", "source_ledger_id", "sequence_at_checkpoint", "content_hash"]
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
