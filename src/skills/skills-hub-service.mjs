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
 * A package's own `manifest.yaml` supplies its LOOKUP IDENTITY, and nothing
 * more. `status: published` in a file on disk is a self-attestation, not a
 * promotion decision, and is never read here.
 *
 * IDENTITY BINDING (IMM-SKILL-HUB-03). An earlier revision of this header
 * claimed the package manifest "is never an authorization input". That was
 * false: `skill_id` and `version` are lifted from the package's own
 * manifest.yaml and used as the resolver lookup key, so a package that
 * declared a governed identity inherited that identity's authorization and
 * was then served with its OWN body — a confused deputy. Two controls now
 * stand between a declared identity and an ALLOW:
 *
 *   1. an identity claimed by more than one indexed package is poisoned for
 *      all of them (DENY_AMBIGUOUS_IDENTITY), so impersonation cannot win a
 *      race with the genuine package; and
 *   2. the resolved governed manifest must name the directory it was found
 *      in (DENY_IDENTITY_MISMATCH).
 *
 * RESIDUAL, deliberately not closed here: control 2 binds to a filesystem
 * name, not to content. An actor who can both displace the genuine package
 * directory and author its manifest still impersonates it. Closing that needs
 * a content digest carried IN the governed manifest and verified at
 * resolution — the `source.commit_sha` field the contract already reserves.
 * That is intake and promotion work (FR-SKI-002), not a hub-local fix.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const SNIPPET_LIMIT = 400;
const DESCRIPTION_LIMIT = 150;

// Every deny code the hub will report. A resolver-supplied code outside this
// set is bucketed as DENY_UNRESOLVED rather than trusted into an output key:
// the resolver is an injected dependency, so its codes are not this module's
// to vouch for.
const DENY_CODES = new Set([
  // hub-local
  "DENY_NO_RESOLVER",
  "DENY_UNGOVERNED_PACKAGE",
  "DENY_AMBIGUOUS_IDENTITY",
  "DENY_IDENTITY_MISMATCH",
  "DENY_RESOLVER_ERROR",
  "DENY_SKILL_NOT_FOUND",
  "DENY_UNRESOLVED",
  // governed SkillResolver resolution-time codes
  "DENY_UNBOUND_CONTEXT",
  "DENY_DATA_CLASSIFICATION",
  "DENY_UNKNOWN_SKILL",
  "DENY_NOT_PUBLISHED",
  "DENY_REVOKED",
  "DENY_PROJECT_SCOPE",
  "DENY_RUNTIME",
  // WP-SK-R2 / DEF-R2: the promotion decision is no longer effective - expired
  // or reverted. Distinct from DENY_REVOKED, which reads a REVOCATION entry
  // recorded IN the manifest; this one is the ledger disagreeing with a
  // manifest that still claims to be published.
  "DENY_PROMOTION_NOT_EFFECTIVE",
  // WP-SK-R1: a promotion that does not name what it authorizes, and one that
  // names something else. Bucketing these as DENY_UNRESOLVED would lose exactly
  // the distinction the fix exists to create.
  "DENY_UNBOUND_SUBJECT",
  "DENY_SUBJECT_MISMATCH"
]);

/**
 * Parses the top-level scalar entries of a YAML document.
 *
 * This is NOT a YAML parser and must never be treated as one. It reads
 * identity and labels only, and every divergence from real YAML below is
 * resolved in the direction that denies rather than admits, because the keys
 * it extracts are used as an authorization lookup key.
 *
 * Divergences a real loader would handle, closed here because each one let a
 * crafted manifest smuggle a `skill_id` past a reviewer reading the same file:
 *
 *   - a second `---` document separator ends parsing; only document 1 is read,
 *     so an identity hidden in document 2 is not seen;
 *   - a multi-line double- or single-quoted scalar is consumed to its closing
 *     quote, so a `skill_id:` line sitting at column 0 INSIDE a quoted value
 *     is part of that value, not a key;
 *   - a duplicate top-level key poisons that key entirely rather than taking
 *     last-wins, because strict loaders reject the document and the hub must
 *     not silently pick a different answer than the validator does; and
 *   - an unquoted inline `# comment` is stripped from the value.
 *
 * Nested maps and sequences are skipped: an indented key is never promoted to
 * a top-level one.
 */

/**
 * Reads a manifest into top-level scalars, nested blocks, and nested sequences,
 * under the SAME hardening as parseTopLevelScalars.
 *
 * Exported because a second reader was written for the descriptor mapper with
 * none of these controls, and the two disagreed on the governed identity of a
 * crafted manifest: the mapper accepted a duplicate key, a key in document 2,
 * and a key inside a quoted scalar, each of which this reader refuses. The
 * mapper's output is the intended promotion input, so two readers with opposite
 * postures is a confused deputy. There is now one reader.
 */
export function parseManifestSections(text) {
  const scalars = Object.create(null);
  const blocks = Object.create(null);
  const duplicated = new Set();
  const lines = String(text ?? "").split(/\r?\n/);
  let block = null;
  let sequenceKey = null;
  let nestedIndent = null;

  const finish = (raw, start) => {
    let value = raw.trim();
    const quote = value[0] === '"' || value[0] === "'" ? value[0] : null;
    let index = start;
    if (quote && !(value.length > 1 && value.endsWith(quote))) {
      while (index + 1 < lines.length) {
        index += 1;
        value += `\n${lines[index]}`;
        if (lines[index].trimEnd().endsWith(quote)) break;
      }
    }
    if (!quote) value = value.replace(/\s+#.*$/, "").trim();
    return { value: quote ? value.slice(1, -1) : value.replace(/^["']|["']$/g, ""), index };
  };

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    if (raw.trim() === "---" && i > 0) break;
    if (raw.trim() === "" || raw.trimStart().startsWith("#")) continue;

    if (!/^\s/.test(raw)) {
      sequenceKey = null;
      if (raw.startsWith("-")) { block = null; continue; }
      const match = /^([A-Za-z0-9_.-]+):\s*(.*)$/.exec(raw);
      if (!match) { block = null; continue; }
      const parsed = finish(match[2], i);
      i = parsed.index;
      if (parsed.value === "") {
        block = match[1];
        nestedIndent = null;
        if (block in blocks) duplicated.add(block);
        else blocks[block] = Object.create(null);
        continue;
      }
      block = null;
      if (match[1] in scalars) duplicated.add(match[1]);
      else scalars[match[1]] = parsed.value;
      continue;
    }

    if (!block) continue;

    // DEPTH IS BOUNDED AT TWO. A key indented deeper than the nested level was
    // previously read as if it sat at the nested level, so
    // `classification: { metadata: { risk_class: R0 } }` yielded
    // classification.risk_class - promoting a depth-3 key to depth 2. A reviewer
    // reading the same file with a real YAML loader sees no risk_class at that
    // level at all, which is precisely the smuggling this function claims to
    // close, landing on the risk class and the authority ceiling.
    //
    // Anything deeper than two levels POISONS its parent block rather than
    // being ignored: silently discarding structure the author wrote is how the
    // \Z bug hid, and this reader's posture is to deny rather than to guess.
    const indent = raw.length - raw.trimStart().length;
    // nestedIndent is null until the block's first nested key establishes the
    // level, so the check applies only once a level exists to compare against.
    // Sequence items legitimately sit deeper than their key.
    if (nestedIndent !== null && indent > nestedIndent && !/^\s+-\s+/.test(raw)) {
      duplicated.add(block);
      continue;
    }

    const item = /^\s+-\s+(.*)$/.exec(raw);
    if (item && sequenceKey) {
      blocks[block][sequenceKey].push(item[1].trim().replace(/^["']|["']$/g, ""));
      continue;
    }
    const nested = /^\s+([A-Za-z0-9_.-]+):\s*(.*)$/.exec(raw);
    if (!nested) continue;
    if (nestedIndent === null) nestedIndent = indent;
    const parsed = finish(nested[2], i);
    i = parsed.index;
    if (nested[1] in blocks[block]) { duplicated.add(`${block} ${nested[1]}`); continue; }
    if (parsed.value === "") {
      sequenceKey = nested[1];
      blocks[block][sequenceKey] = [];
    } else {
      sequenceKey = null;
      blocks[block][nested[1]] = parsed.value;
    }
  }

  // NUL is the composite-key delimiter because the key charset admits '.', so a
  // duplicated dotted key such as `risk_class.x` split on '.' and deleted an
  // unrelated sibling (`risk_class`) while leaving the duplicate in place.
  for (const key of duplicated) {
    if (key.includes(" ")) {
      const [outer, inner] = key.split(" ");
      if (blocks[outer]) delete blocks[outer][inner];
    } else {
      delete scalars[key];
      delete blocks[key];
    }
  }
  return { scalars, blocks };
}

/**
 * Top-level scalars only. A THIN WRAPPER, not a second implementation.
 *
 * The previous revision added parseManifestSections alongside this function and
 * a commit message claimed "both now use parseManifestSections". That was false
 * - the diff was 90 insertions and 0 deletions, this function was untouched,
 * and the hub kept reading through it while only the mapper adopted the new one.
 * The two then demonstrably disagreed on a crafted duplicate dotted key. One
 * implementation with one caller-facing projection is what "one reader" has to
 * mean.
 */
function parseTopLevelScalars(text) {
  return parseManifestSections(text).scalars;
}

function parseFrontmatter(content) {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return { data: {}, body: content };
  // Trailing whitespace on the closing delimiter previously made it
  // unmatchable, so the entire file - frontmatter included - became the body
  // and leaked into title, description, and snippet.
  const closing = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
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
      // The binding key: what the governed manifest must name for this entry
      // to resolve. For an on-disk package it is the directory, which is
      // filesystem-derived; for a programmatic registration it is the
      // caller-supplied name.
      bindingName: name,
      title,
      description,
      content,
      path: `in-memory:${name}`,
      skillId,
      version,
      packageStatus
    });
    this.#markAmbiguousIdentities();
  }

  /**
   * Poisons any governed identity claimed by more than one indexed package.
   *
   * Without this, several packages could each declare the same
   * `skill_id@version` and every one of them would resolve, because the
   * resolver is asked only about the identity and knows nothing about who
   * claimed it. Denying all claimants is the fail-closed reading: an
   * ambiguous identity is not evidence that one of them is genuine.
   */
  #markAmbiguousIdentities() {
    const claims = new Map();
    for (const entry of this.#skillsIndex.values()) {
      entry.ambiguousIdentity = false;
      if (!entry.skillId || !entry.version) continue;
      const key = `${entry.skillId}@${entry.version}`;
      if (!claims.has(key)) claims.set(key, []);
      claims.get(key).push(entry);
    }
    for (const claimants of claims.values()) {
      if (claimants.length > 1) for (const entry of claimants) entry.ambiguousIdentity = true;
    }
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
          // Filesystem-derived, NOT content-derived. The frontmatter `name`
          // is authored by whoever wrote the package, so binding to it would
          // let a package rename itself into another skill's identity.
          bindingName: entry.name,
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

    this.#markAmbiguousIdentities();
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
      return { allowed: false, deny_code: "DENY_NO_RESOLVER" };
    }
    if (!entry.skillId || !entry.version) {
      return { allowed: false, deny_code: "DENY_UNGOVERNED_PACKAGE" };
    }
    if (entry.ambiguousIdentity) {
      return { allowed: false, deny_code: "DENY_AMBIGUOUS_IDENTITY" };
    }

    let verdict;
    try {
      verdict = resolver.resolveSkill(entry.skillId, entry.version, {
        projectId: context.projectId,
        runtime: context.runtime,
        dataClassification: context.dataClassification
      });
    } catch (_err) {
      return { allowed: false, deny_code: "DENY_RESOLVER_ERROR" };
    }

    if (verdict?.code !== "ALLOW" || !verdict.skill) {
      // The resolver's `reason` is deliberately NOT propagated: it names the
      // governed skill_id@version, which is exactly what a caller denied this
      // skill must not learn.
      const code = typeof verdict?.code === "string" ? verdict.code : "DENY_UNRESOLVED";
      return { allowed: false, deny_code: code };
    }

    // The resolved manifest must describe THIS package. Without this, any
    // package declaring a governed identity is served under that identity's
    // authorization with its own body.
    if (verdict.skill.name !== entry.bindingName) {
      return { allowed: false, deny_code: "DENY_IDENTITY_MISMATCH" };
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
    // Null-prototype: the key is a resolver-supplied deny code, and on a plain
    // object a code of "__proto__" or "toString" corrupted the aggregate
    // instead of incrementing it - reporting 3 withheld when 25 were, which
    // defeats the one thing the tally exists to say.
    const withheld = Object.create(null);
    // `query` is an optional MCP argument and is therefore never type-screened
    // upstream; a non-string previously threw out of the tool handler.
    const q = String(query ?? "").toLowerCase().trim();

    for (const skill of this.#skillsIndex.values()) {
      const verdict = this.#authorize(skill, context);
      if (!verdict.allowed) {
        const code = DENY_CODES.has(verdict.deny_code) ? verdict.deny_code : "DENY_UNRESOLVED";
        withheld[code] = (withheld[code] ?? 0) + 1;
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

    // Sorted: insertion order followed index order, which revealed the deny
    // category of the alphabetically-first withheld package. Query-invariant,
    // so not an enumeration channel, but a positional signal with no purpose.
    const sortedWithheld = Object.create(null);
    for (const code of Object.keys(withheld).sort()) sortedWithheld[code] = withheld[code];

    return {
      ok: true,
      query: String(query ?? ""),
      count: results.length,
      skills: results,
      withheld_count: Object.values(sortedWithheld).reduce((sum, n) => sum + n, 0),
      withheld_reasons: sortedWithheld
    };
  }

  /**
   * Returns full skill content, gated on the same authorization decision.
   *
   * INTERNAL API - NOT CALLER-FACING. It is not in the MCP tool catalog and
   * has no callers outside tests. That matters, because its typed deny codes
   * distinguish "present but you may not see it" from "absent", which is a
   * per-name existence oracle of exactly the shape closed in searchSkills.
   * The resolver `reason` string, which named the governed skill_id@version,
   * is no longer propagated; the code distinction remains because it is
   * useful internally and unreachable externally.
   *
   * BEFORE EXPOSING THIS ON ANY CALLER-FACING SURFACE, collapse every deny to
   * one opaque code with a constant message and log the typed code
   * server-side. Routed to SEC as part of OD-SK-11.
   *
   * @param {string} name
   * @param {object} context - { projectId, runtime, dataClassification }
   */
  getSkill(name, context = {}) {
    const skill = this.#skillsIndex.get(name);
    if (!skill) return { ok: false, deny_code: "DENY_SKILL_NOT_FOUND", message: "Skill unavailable" };

    const verdict = this.#authorize(skill, context);
    if (!verdict.allowed) {
      return { ok: false, deny_code: verdict.deny_code, message: "Skill unavailable" };
    }

    return {
      ok: true,
      name: skill.name,
      title: skill.title,
      content: skill.content
    };
  }
}
