/**
 * Pack manifest -> skill package descriptor (ADR-0013, WP-SK-01).
 *
 * NEVER INVENTS A VALUE. Every field emitted is present in the package or
 * derived from something the filesystem already knows. `owner` and
 * `source.licence` are not derivable from a package, so this mapper does not
 * supply them and does not guess; it reports them as findings. FR-SKI-004
 * forbids intake fabricating exactly these, and filling them with a placeholder
 * would be fabricating with extra steps.
 *
 * ONE READER (fix round 1). This file previously reimplemented the manifest
 * read with a local regex helper that had none of the hub's four anti-smuggling
 * controls, and the two disagreed on the governed identity of a crafted
 * manifest. It now uses the hub's `parseManifestSections`. It also used the
 * lookahead `(?=^\S|\Z)`, and JavaScript has no `\Z` anchor - it is an identity
 * escape matching a literal "Z" - so the LAST top-level block of every manifest
 * was unreadable. `evaluation` is the last block in all 22, so `evaluation` was
 * silently dropped from 22 of 22 descriptors while the tests stayed green.
 *
 * LOSS IS A FINDING, NOT A SILENCE. A manifest key with a descriptor
 * counterpart that fails to carry across is reported. Dropping an optional
 * field always validates, so validation alone can never detect a lossy mapping.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { parseManifestSections } from "./skills-hub-service.mjs";

const RISK_CLASSES = new Set(["R0", "R1", "R2", "R3", "R4"]);
const AUTHORITY_CEILINGS = new Set(["A0", "A1", "A2", "A3", "A4", "A5"]);
const CONTROL_KEYS = ["repository_mutation", "external_facts", "secret_handling", "approval_claims"];

function frontmatter(content) {
  const lines = String(content ?? "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return {};
  const closing = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (closing === -1) return {};
  const { scalars } = parseManifestSections(lines.slice(1, closing).join("\n"));
  return scalars;
}

function list(block, key) {
  const value = block?.[key];
  return Array.isArray(value) && value.length > 0 ? value : null;
}

/**
 * @returns {{descriptor: object|null, findings: string[]}}
 */
export function mapPackageToDescriptor({ directoryName, manifestText, skillMdText, repository, commitSha }) {
  const findings = [];
  const blocking = [];
  const fm = frontmatter(skillMdText);
  const { scalars, blocks } = parseManifestSections(manifestText);

  const skillId = scalars.skill_id ?? null;
  const version = scalars.version ?? null;
  if (!skillId) blocking.push("manifest carries no readable skill_id");
  if (!version) blocking.push("manifest carries no readable version");
  if (!/^[a-z0-9-]{1,64}$/.test(directoryName)) blocking.push(`directory name "${directoryName}" is not a valid package_name`);

  // A manifest naming a package other than its own directory is the
  // impersonation shape the hub denies at DENY_IDENTITY_MISMATCH. It BLOCKS
  // here rather than warning: a descriptor is the promotion input, and emitting
  // one for a package that claims another identity hands the conflict forward.
  if (scalars.name && scalars.name !== directoryName) {
    blocking.push(`manifest name "${scalars.name}" does not match directory "${directoryName}"`);
  }

  const purpose = fm.description ?? null;
  if (!purpose) blocking.push("SKILL.md frontmatter carries no description to serve as purpose");

  const riskClass = blocks.classification?.risk_class ?? null;
  if (!riskClass) blocking.push("manifest carries no classification.risk_class");
  else if (!RISK_CLASSES.has(riskClass)) blocking.push(`unrecognized risk_class "${riskClass}"`);

  const repositoryMutation = blocks.controls?.repository_mutation ?? null;
  const secretHandling = blocks.controls?.secret_handling ?? null;
  if (!repositoryMutation) blocking.push("manifest carries no controls.repository_mutation");
  if (!secretHandling) blocking.push("manifest carries no controls.secret_handling");

  // A malformed authority value previously produced no cap AND no finding, and
  // an absent cap composes as "no skill-imposed cap" under min(). Silence on an
  // authority field is a fail-open default.
  const ceiling = blocks.classification?.authority_ceiling ?? null;
  if (ceiling && !AUTHORITY_CEILINGS.has(ceiling)) {
    blocking.push(`unrecognized classification.authority_ceiling "${ceiling}"`);
  }

  // A grant field declared in a package is dropped by the tier split - but
  // dropping it silently tells no one the package tried.
  for (const granted of ["project_scopes", "supported_runtimes", "max_data_classification", "status", "evidence_refs", "approval_history"]) {
    if (granted in scalars || granted in blocks) {
      findings.push(`manifest declares "${granted}", which is a grant and cannot be author-supplied - ignored`);
    }
  }

  // Not derivable, never invented. Promotion preconditions.
  findings.push("owner is absent and is not derivable from the package - required before promotion");
  findings.push("source.licence is absent and is not derivable from the package - required before promotion");

  if (blocking.length > 0) return { descriptor: null, findings: [...blocking, ...findings] };

  const descriptor = {
    skill_id: skillId,
    package_name: directoryName,
    display_name: fm.name ?? directoryName,
    version,
    purpose,
    risk_class: riskClass,
    controls: {}
  };
  for (const key of CONTROL_KEYS) {
    if (blocks.controls?.[key]) descriptor.controls[key] = blocks.controls[key];
  }
  if (ceiling) descriptor.authority_ceiling_cap = ceiling;

  const rolesAllowed = list(blocks.roles, "allowed");
  const rolesProhibited = list(blocks.roles, "prohibited_final_authority");
  if (rolesAllowed || rolesProhibited) {
    descriptor.roles = {};
    if (rolesAllowed) descriptor.roles.allowed = rolesAllowed;
    if (rolesProhibited) descriptor.roles.prohibited_final_authority = rolesProhibited;
  }

  const inputsRequired = list(blocks.inputs, "required");
  if (inputsRequired) descriptor.inputs = { required: inputsRequired };
  const outputsRequired = list(blocks.outputs, "required");
  if (outputsRequired) descriptor.outputs = { required: outputsRequired };

  const suite = blocks.evaluation?.suite ?? null;
  const crossHarness = list(blocks.evaluation, "cross_harness");
  if (suite || crossHarness) {
    descriptor.evaluation = {};
    if (suite) descriptor.evaluation.suite = suite;
    if (crossHarness) descriptor.evaluation.cross_harness = crossHarness;
  }

  if (repository && commitSha) descriptor.source = { repository, commit_sha: commitSha };

  // Loss detection: a manifest section with a descriptor counterpart that did
  // not carry across. Without this, the next lossy edit is silent again.
  const carried = [
    ["classification", descriptor.risk_class],
    ["controls", Object.keys(descriptor.controls).length > 0 ? true : null],
    ["roles", descriptor.roles],
    ["inputs", descriptor.inputs],
    ["outputs", descriptor.outputs],
    ["evaluation", descriptor.evaluation]
  ];
  for (const [section, mapped] of carried) {
    if (blocks[section] && !mapped) findings.push(`manifest declares "${section}" but it did not carry into the descriptor`);
  }

  return { descriptor, findings };
}

/**
 * Maps every package under a root. Emits ONE ENTRY PER PACKAGE DIRECTORY - a
 * package that cannot be mapped is a finding, never an omission. A previous
 * version skipped a package with no SKILL.md via `continue`, so a manifest on
 * disk could be absent from the result set entirely and a count derived from
 * that set could not notice.
 */
export function mapPackageRoot(skillsRoot, { repository, commitSha } = {}) {
  const root = resolve(process.cwd(), skillsRoot);
  const results = [];
  if (!existsSync(root)) return results;

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(root, entry.name, "manifest.yaml");
    const skillMdPath = join(root, entry.name, "SKILL.md");
    const hasManifest = existsSync(manifestPath);
    const hasSkillMd = existsSync(skillMdPath);

    if (!hasManifest || !hasSkillMd) {
      const findings = [];
      if (!hasManifest) findings.push("package carries no manifest.yaml, so it has no governed identity");
      if (!hasSkillMd) findings.push("package carries no SKILL.md");
      results.push({ packageName: entry.name, hasManifest, descriptor: null, findings });
      continue;
    }

    const mapped = mapPackageToDescriptor({
      directoryName: entry.name,
      manifestText: readFileSync(manifestPath, "utf8"),
      skillMdText: readFileSync(skillMdPath, "utf8"),
      repository,
      commitSha
    });
    results.push({ packageName: entry.name, hasManifest: true, ...mapped });
  }

  return results;
}
