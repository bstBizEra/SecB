/**
 * SecBSkillsHub - Governed Local Skills Discovery
 *
 * Discovery is filesystem-derived. Authorization is NOT: a package is
 * consumable only when the governed SkillResolver returns ALLOW for the
 * caller's asserted project, runtime, and data classification
 * (SECB-SKILL-001 distribution rule).
 *
 * Fail-closed inversion (IMM-SKILL-HUB-01): the gate allow-lists the single
 * ALLOW code instead of deny-listing known deny codes. The previous form
 * only recognized `verdict === "DENY"` or `DENY_POLICY_CEILING`, so every
 * other typed deny the resolver emits — DENY_UNKNOWN_SKILL,
 * DENY_NOT_PUBLISHED, DENY_REVOKED, DENY_PROJECT_SCOPE, DENY_RUNTIME,
 * DENY_UNBOUND_CONTEXT — was read as an allow, and an unwired resolver
 * skipped the check entirely.
 *
 * A package's own `manifest.yaml` is discovery metadata and is never an
 * authorization input: `status: published` in a file on disk is a
 * self-attestation, not a promotion decision.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const SNIPPET_LIMIT = 400;
const DESCRIPTION_LIMIT = 150;

/**
 * Parses the top-level scalar entries of a YAML document. Nested maps and
 * sequences are skipped on purpose: the hub reads identity and labels only,
 * so an indented block is never silently promoted to a top-level key.
 */
function parseTopLevelScalars(text) {
  const data = {};
  for (const rawLine of text.split(/\r?\n/)) {
    if (rawLine.trim() === "" || rawLine.trimStart().startsWith("#")) continue;
    if (/^\s/.test(rawLine) || rawLine.startsWith("-")) continue;
    const match = /^([A-Za-z0-9_.-]+):\s*(.*)$/.exec(rawLine);
    if (!match) continue;
    const value = match[2].trim();
    if (value === "") continue; // block opener, not a scalar
    data[match[1]] = value.replace(/^["']|["']$/g, "");
  }
  return data;
}

function parseFrontmatter(content) {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return { data: {}, body: content };
  const closing = lines.indexOf("---", 1);
  if (closing === -1) return { data: {}, body: content };
  return {
    data: parseTopLevelScalars(lines.slice(1, closing).join("\n")),
    body: lines.slice(closing + 1).join("\n").replace(/^\s+/, "")
  };
}

function firstHeading(body) {
  for (const line of body.split(/\r?\n/)) {
    const match = /^#{1,6}\s+(.+?)\s*$/.exec(line);
    if (match) return match[1];
  }
  return null;
}

function firstProse(body) {
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed !== "" && !trimmed.startsWith("#")) return trimmed;
  }
  return "";
}

export class SecBSkillsHub {
  #services;
  #skillsIndex = new Map();

  /**
   * @param {object} opts
   * @param {object} opts.services - SecB service bag (skillResolver, eventLedger)
   * @param {string} [opts.skillsDir] - package root, defaults to .agents/skills
   */
  constructor({ services, skillsDir } = {}) {
    this.#services = services;
    this.indexLocalSkills(skillsDir);
  }

  /**
   * Registers a package for discovery. `skillId`/`version` are the governed
   * identity used at resolution; a package without them can be discovered
   * but never authorized.
   */
  registerSkill({ name, title = name, description = name, content = `# ${name}\n${description}`, skillId = null, version = null, packageStatus = null }) {
    this.#skillsIndex.set(name, {
      name,
      title,
      description,
      content,
      path: `in-memory:${name}`,
      skillId,
      version,
      packageStatus
    });
  }

  /**
   * Scans the local skill package root and parses discovery metadata from
   * SKILL.md frontmatter and, when present, the package manifest.yaml.
   */
  indexLocalSkills(skillsDir = ".agents/skills") {
    let fullPath = resolve(process.cwd(), skillsDir ?? ".agents/skills");
    if (!existsSync(fullPath)) {
      fullPath = resolve(process.cwd(), "..", "ruflo", ".agents", "skills");
    }
    if (!existsSync(fullPath)) return;

    let entries;
    try {
      entries = readdirSync(fullPath, { withFileTypes: true });
    } catch (_err) {
      return; // unreadable root indexes to nothing, which denies everything
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillMdPath = join(fullPath, entry.name, "SKILL.md");
      if (!existsSync(skillMdPath)) continue;

      try {
        const raw = readFileSync(skillMdPath, "utf8");
        const { data, body } = parseFrontmatter(raw);
        const manifest = this.#readPackageManifest(join(fullPath, entry.name, "manifest.yaml"));

        this.#skillsIndex.set(entry.name, {
          name: data.name ?? entry.name,
          title: firstHeading(body) ?? data.name ?? entry.name,
          path: skillMdPath,
          description: data.description ?? firstProse(body),
          content: body,
          // Governed identity. Null when the package carries no manifest,
          // which resolves to DENY_UNGOVERNED_PACKAGE rather than a guess.
          skillId: manifest?.skill_id ?? null,
          version: manifest?.version ?? null,
          // Self-asserted; displayed, never authorizing.
          packageStatus: manifest?.status ?? null
        });
      } catch (_err) {
        // An unreadable package is simply not indexed.
      }
    }
  }

  #readPackageManifest(manifestPath) {
    if (!existsSync(manifestPath)) return null;
    try {
      return parseTopLevelScalars(readFileSync(manifestPath, "utf8"));
    } catch (_err) {
      return null;
    }
  }

  /**
   * The single authorization gate. Returns ALLOW only when the governed
   * resolver says so; every other outcome is a typed deny.
   *
   * @param {object} entry - indexed package
   * @param {object} context - caller-asserted { projectId, runtime, dataClassification }
   */
  #authorize(entry, context = {}) {
    const resolver = this.#services?.skillResolver;
    if (typeof resolver?.resolveSkill !== "function") {
      return { allowed: false, deny_code: "DENY_NO_RESOLVER", message: "No governed skill resolver is wired" };
    }
    if (!entry.skillId || !entry.version) {
      return { allowed: false, deny_code: "DENY_UNGOVERNED_PACKAGE", message: "Package carries no governed skill identity" };
    }

    let verdict;
    try {
      verdict = resolver.resolveSkill(entry.skillId, entry.version, {
        projectId: context.projectId,
        runtime: context.runtime,
        dataClassification: context.dataClassification
      });
    } catch (_err) {
      return { allowed: false, deny_code: "DENY_RESOLVER_ERROR", message: "Skill resolution failed" };
    }

    if (verdict?.code !== "ALLOW" || !verdict.skill) {
      const code = typeof verdict?.code === "string" ? verdict.code : "DENY_UNRESOLVED";
      return { allowed: false, deny_code: code, message: verdict?.reason ?? "Skill resolution did not return ALLOW" };
    }
    return { allowed: true, skill: verdict.skill };
  }

  /**
   * Token-efficient search across authorized skills.
   *
   * Withheld packages are reported as aggregate counts by deny code — enough
   * for an operator to see that the hub is gated rather than empty.
   *
   * ORDERING IS THE CONTROL (IMM-SKILL-HUB-02): authorization runs over the
   * WHOLE index and the caller's query is applied only to what it is already
   * authorized to see. The reverse order — filter by query, then tally the
   * denials among the matches — made the counter a query-conditioned existence
   * oracle: an unauthorized caller searching "graphify" and reading back
   * withheld_count === 1 learned that package exists, and iterating the query
   * space recovered the withheld corpus by name. The per-code breakdown leaked
   * further by category (DENY_PROJECT_SCOPE confirmed cross-project skills,
   * DENY_REVOKED disclosed incident volume).
   *
   * Because the tally no longer depends on `query`, it is constant for a given
   * caller context and carries no per-package signal. The corpus size is still
   * disclosed, but as a constant rather than a probe channel.
   *
   * @param {string} query
   * @param {object} context - { projectId, runtime, dataClassification }
   */
  searchSkills(query = "", context = {}) {
    const results = [];
    const withheld = {};
    const q = query.toLowerCase().trim();

    for (const skill of this.#skillsIndex.values()) {
      const verdict = this.#authorize(skill, context);
      if (!verdict.allowed) {
        withheld[verdict.deny_code] = (withheld[verdict.deny_code] ?? 0) + 1;
        continue;
      }

      // Query narrowing applies only to authorized entries, so it cannot
      // become a channel for probing what was withheld.
      const isMatch = !q
        || skill.name.toLowerCase().includes(q)
        || skill.description.toLowerCase().includes(q)
        || skill.title.toLowerCase().includes(q);
      if (!isMatch) continue;

      results.push({
        name: skill.name,
        title: skill.title,
        description: skill.description.length > DESCRIPTION_LIMIT
          ? `${skill.description.slice(0, DESCRIPTION_LIMIT)}...`
          : skill.description,
        snippet: skill.content.slice(0, SNIPPET_LIMIT)
      });
    }

    return {
      ok: true,
      query,
      count: results.length,
      skills: results,
      withheld_count: Object.values(withheld).reduce((sum, n) => sum + n, 0),
      withheld_reasons: withheld
    };
  }

  /**
   * Returns full skill content, gated on the same authorization decision.
   *
   * @param {string} name
   * @param {object} context - { projectId, runtime, dataClassification }
   */
  getSkill(name, context = {}) {
    const skill = this.#skillsIndex.get(name);
    if (!skill) return { ok: false, deny_code: "DENY_SKILL_NOT_FOUND", message: `Skill ${name} not found` };

    const verdict = this.#authorize(skill, context);
    if (!verdict.allowed) {
      return { ok: false, deny_code: verdict.deny_code, message: verdict.message };
    }

    return {
      ok: true,
      name: skill.name,
      title: skill.title,
      content: skill.content
    };
  }
}
