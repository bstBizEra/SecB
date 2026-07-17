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
assert(schemaFiles.length === 6, "schemas.count", "6 canonical bootstrap schemas");
const mandatoryIdentityFields = {
  "contracts/project-contract.schema.json": ["project_id", "version", "status", "approvals"],
  "contracts/work-package.schema.json": ["work_package_id", "version", "project_id", "baseline", "status"],
  "contracts/context-receipt.schema.json": ["receipt_id", "version", "project_id", "work_package_id", "session_id", "content_hash"],
  "contracts/handoff-envelope.schema.json": ["handoff_id", "version", "project_id", "work_package_id", "source_session_id", "content_hash"],
  "contracts/event-envelope.schema.json": ["event_id", "version", "project_id", "work_package_id", "session_id", "actor_id", "idempotency_key", "content_hash"],
  "contracts/evidence-envelope.schema.json": ["evidence_id", "version", "project_id", "work_package_id", "session_id", "actor_id", "content_hash", "verification_status"]
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

const remotes = execFileSync("git", ["remote"], { cwd: root, encoding: "utf8" }).trim();
assert(remotes === "", "git.local-only", "no remotes configured");

console.log(JSON.stringify({ status: "PASS", version, checks }, null, 2));
