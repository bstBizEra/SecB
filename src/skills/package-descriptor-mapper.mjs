/**
 * Pack manifest -> skill package descriptor (ADR-0013, WP-SK-01).
 *
 * Maps a `.agents/skills/<dir>/manifest.yaml` plus its `SKILL.md` frontmatter
 * onto the authored tier of the split contract.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: it never invents a value. Every field
 * it emits is either present in the package or derived from something the
 * filesystem already knows. `owner` and `source.licence` are NOT derivable from
 * a package, so this mapper does not supply them and does not guess; it reports
 * them as findings. FR-SKI-004 forbids intake fabricating exactly these, and a
 * mapper that filled them with "unknown" would be fabricating with extra steps.
 *
 * WHY THEY ARE OPTIONAL IN THE DESCRIPTOR RATHER THAN BLOCKING. WP-SK-01
 * anticipated migration by "adding owner, source, purpose". Two of those turned
 * out not to be author-derivable at candidate stage. The resolution is not to
 * fabricate and not to stop: the descriptor requires what an author can assert
 * now, and `owner`/`licence` become PROMOTION preconditions. That is the same
 * trust-tier logic one level deeper - assertable-now versus required-at-promotion
 * - and it keeps the stop rule intact, because nothing is invented.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const RISK_CLASSES = new Set(["R0", "R1", "R2", "R3", "R4"]);
const AUTHORITY_CEILINGS = new Set(["A0", "A1", "A2", "A3", "A4", "A5"]);

function scalar(text, key) {
  const match = new RegExp(`^${key}:\\s*(.+)$`, "m").exec(text);
  if (!match) return null;
  const value = match[1].trim().replace(/\s+#.*$/, "").replace(/^["']|["']$/g, "");
  return value === "" ? null : value;
}

function nestedScalar(text, block, key) {
  const blockMatch = new RegExp(`^${block}:\\s*$([\\s\\S]*?)(?=^\\S|\\Z)`, "m").exec(text);
  if (!blockMatch) return null;
  const match = new RegExp(`^\\s+${key}:\\s*(.+)$`, "m").exec(blockMatch[1]);
  if (!match) return null;
  const value = match[1].trim().replace(/^["']|["']$/g, "");
  return value === "" ? null : value;
}

function frontmatter(content) {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return {};
  const closing = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (closing === -1) return {};
  return {
    name: scalar(lines.slice(1, closing).join("\n"), "name"),
    description: scalar(lines.slice(1, closing).join("\n"), "description")
  };
}

/**
 * @returns {{descriptor: object|null, findings: string[]}}
 */
export function mapPackageToDescriptor({ directoryName, manifestText, skillMdText, repository, commitSha }) {
  const findings = [];
  const fm = frontmatter(skillMdText ?? "");

  const skillId = scalar(manifestText ?? "", "skill_id");
  const version = scalar(manifestText ?? "", "version");
  if (!skillId) findings.push("manifest carries no skill_id");
  if (!version) findings.push("manifest carries no version");

  if (!/^[a-z0-9-]{1,64}$/.test(directoryName)) {
    findings.push(`directory name "${directoryName}" is not a valid package_name`);
  }

  const manifestName = scalar(manifestText ?? "", "name");
  if (manifestName && manifestName !== directoryName) {
    // The pack validator asserts this too. Disagreeing with it silently is how
    // an impersonating package would slip past a reviewer reading the manifest.
    findings.push(`manifest name "${manifestName}" does not match directory "${directoryName}"`);
  }

  const purpose = fm.description ?? null;
  if (!purpose) findings.push("SKILL.md frontmatter carries no description to serve as purpose");

  const riskClass = nestedScalar(manifestText ?? "", "classification", "risk_class");
  if (!riskClass) findings.push("manifest carries no classification.risk_class");
  else if (!RISK_CLASSES.has(riskClass)) findings.push(`unrecognized risk_class "${riskClass}"`);

  const repositoryMutation = nestedScalar(manifestText ?? "", "controls", "repository_mutation");
  const secretHandling = nestedScalar(manifestText ?? "", "controls", "secret_handling");
  if (!repositoryMutation) findings.push("manifest carries no controls.repository_mutation");
  if (!secretHandling) findings.push("manifest carries no controls.secret_handling");

  // Not derivable, never invented. These are promotion preconditions.
  findings.push("owner is absent and is not derivable from the package - required before promotion");
  if (!scalar(manifestText ?? "", "licence")) {
    findings.push("source.licence is absent and is not derivable from the package - required before promotion");
  }

  if (findings.some((f) => f.startsWith("manifest carries no") || f.startsWith("SKILL.md") || f.startsWith("directory name") || f.startsWith("unrecognized"))) {
    return { descriptor: null, findings };
  }

  const descriptor = {
    skill_id: skillId,
    package_name: directoryName,
    display_name: fm.name ?? directoryName,
    version,
    purpose,
    risk_class: riskClass,
    controls: { repository_mutation: repositoryMutation, secret_handling: secretHandling }
  };

  const externalFacts = nestedScalar(manifestText ?? "", "controls", "external_facts");
  if (externalFacts) descriptor.controls.external_facts = externalFacts;
  const approvalClaims = nestedScalar(manifestText ?? "", "controls", "approval_claims");
  if (approvalClaims) descriptor.controls.approval_claims = approvalClaims;

  const ceiling = nestedScalar(manifestText ?? "", "classification", "authority_ceiling");
  if (ceiling && AUTHORITY_CEILINGS.has(ceiling)) descriptor.authority_ceiling_cap = ceiling;

  const suite = nestedScalar(manifestText ?? "", "evaluation", "suite");
  if (suite) descriptor.evaluation = { suite };

  if (repository && commitSha) descriptor.source = { repository, commit_sha: commitSha };

  return { descriptor, findings };
}

/**
 * Maps every package under a root. Returns one entry per package so a failure
 * is recorded rather than skipped - a package that maps to nothing is a finding,
 * not an absence.
 */
export function mapPackageRoot(skillsRoot, { repository, commitSha } = {}) {
  const root = resolve(process.cwd(), skillsRoot);
  const results = [];
  if (!existsSync(root)) return results;

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(root, entry.name, "manifest.yaml");
    const skillMdPath = join(root, entry.name, "SKILL.md");
    if (!existsSync(skillMdPath)) continue;

    if (!existsSync(manifestPath)) {
      results.push({
        packageName: entry.name,
        descriptor: null,
        findings: ["package carries no manifest.yaml, so it has no governed identity"]
      });
      continue;
    }

    const mapped = mapPackageToDescriptor({
      directoryName: entry.name,
      manifestText: readFileSync(manifestPath, "utf8"),
      skillMdText: readFileSync(skillMdPath, "utf8"),
      repository,
      commitSha
    });
    results.push({ packageName: entry.name, ...mapped });
  }

  return results;
}
