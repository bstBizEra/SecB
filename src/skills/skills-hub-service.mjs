/**
 * SecBSkillsHub - Governed Local Skills Registry & Resolution Service
 * 
 * Provides local-first, air-gapped, token-efficient skill discovery
 * and governance policy verification per GOV-MCP-01 and GOV-MCP-03.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

export class SecBSkillsHub {
  #services;
  #skillsIndex = new Map();

  /**
   * @param {object} opts
   * @param {object} opts.services - SecB service bag (skillResolver, eventLedger)
   */
  constructor({ services } = {}) {
    this.#services = services;
    this.indexLocalSkills();
    if (this.#skillsIndex.size === 0) {
      this.seedDefaultSkills();
    }
  }

  seedDefaultSkills() {
    const defaults = [
      { name: "claims", title: "Claims Management", description: "Claims-based authorization and verification for agent operations", content: "# Claims Skill\nEnforces claims-based authorization." },
      { name: "embeddings", title: "Vector Embeddings", description: "HNSW vector embeddings with AgentDB persistence", content: "# Embeddings Skill\nHNSW vector search." },
      { name: "graphify", title: "Graphify Knowledge Graph", description: "AST knowledge graph extraction and Louvain clustering", content: "# Graphify Skill\nAST graph extraction." }
    ];
    for (const d of defaults) this.registerSkill(d);
  }

  registerSkill({ name, title = name, description = name, content = `# ${name}\n${description}` }) {
    this.#skillsIndex.set(name, { name, title, description, content, path: `in-memory:${name}` });
  }

  /**
   * Scans local .agents/skills/ directory and parses skill metadata
   */
  indexLocalSkills(skillsDir = ".agents/skills") {
    let fullPath = resolve(process.cwd(), skillsDir);
    if (!existsSync(fullPath)) {
      fullPath = resolve(process.cwd(), "..", "ruflo", ".agents", "skills");
    }
    if (!existsSync(fullPath)) return;

    try {
      const entries = readdirSync(fullPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillMdPath = join(fullPath, entry.name, "SKILL.md");
          if (existsSync(skillMdPath)) {
            const content = readFileSync(skillMdPath, "utf8");
            const firstLine = content.split("\n")[0]?.replace(/^#\s*/, '').trim() || entry.name;
            const description = content.slice(0, 300).replace(/\r?\n/g, ' ').trim();

            this.#skillsIndex.set(entry.name, {
              name: entry.name,
              title: firstLine,
              path: skillMdPath,
              description,
              content
            });
          }
        }
      }
    } catch (_err) {
      // Graceful fallback for unreadable paths
    }
  }

  /**
   * Token-efficient skill search with governance verification
   * Returns max 50-token snippets to conserve prompt context.
   */
  searchSkills(query = "", context = { classificationFloor: "INTERNAL" }) {
    const results = [];
    const q = query.toLowerCase().trim();

    for (const [name, skill] of this.#skillsIndex.entries()) {
      const isMatch = !q || name.toLowerCase().includes(q) || skill.description.toLowerCase().includes(q) || skill.title.toLowerCase().includes(q);

      if (isMatch) {
        let isDenied = false;
        if (this.#services?.skillResolver?.resolveSkill) {
          const verdict = this.#services.skillResolver.resolveSkill(name, "1.0.0", {
            projectId: context.projectId ?? "secb-project",
            runtime: context.runtime ?? "node",
            dataClassification: context.dataClassification ?? context.classificationFloor ?? "INTERNAL"
          });
          if (verdict?.verdict === "DENY" || verdict?.code === "DENY_POLICY_CEILING" || verdict?.deny_code === "DENY_POLICY_CEILING") {
            isDenied = true;
          }
        }

        if (!isDenied) {
          results.push({
            name: skill.name,
            title: skill.title,
            description: skill.description.slice(0, 150) + "...",
            snippet: skill.content.slice(0, 400)
          });
        }
      }
    }

    return {
      ok: true,
      query,
      count: results.length,
      skills: results
    };
  }

  /**
   * Get exact skill content by name
   */
  getSkill(name, context = { classificationFloor: "INTERNAL" }) {
    const skill = this.#skillsIndex.get(name);
    if (!skill) return { ok: false, deny_code: "DENY_SKILL_NOT_FOUND", message: `Skill ${name} not found` };

    if (this.#services?.skillResolver?.resolveSkill) {
      const verdict = this.#services.skillResolver.resolveSkill(name, "1.0.0", {
        projectId: context.projectId ?? "secb-project",
        runtime: context.runtime ?? "node",
        dataClassification: context.dataClassification ?? context.classificationFloor ?? "INTERNAL"
      });
      if (verdict?.verdict === "DENY" || verdict?.code === "DENY_POLICY_CEILING" || verdict?.deny_code === "DENY_POLICY_CEILING") {
        return { ok: false, deny_code: verdict.deny_code ?? verdict.code ?? "DENY_POLICY_CEILING", message: "Policy ceiling check failed" };
      }
    }

    return {
      ok: true,
      name: skill.name,
      title: skill.title,
      content: skill.content
    };
  }
}
