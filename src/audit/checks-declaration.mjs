import { VERDICT, finding, lineOf, readShallowYaml } from "./corpus.mjs";

// WP-SK-AUDIT-01 — declaration lens.
//
// Three checks that compare what a skill package DECLARES in its manifest
// against what its SKILL.md actually says. Nothing here writes; nothing here
// reads the tree directly. Every check is a pure function of the corpus object
// produced by corpus.mjs, which is the only component that touches disk.
//
// .agents/** is READ-ONLY to this work package (PACK.yaml mutation_authorized:
// false; WP-SK-AUDIT-01 prohibited_paths). Every synthetic corpus below is built
// in memory. There is no code path in this file that opens a file for writing.
//
// EPISTEMIC POSITION, stated once and repeated in the observation text of every
// finding this file emits: SKILL.md is instruction text for an agent, not a
// program. Reading it establishes what a package ASKS FOR. It can never
// establish what an agent CAN DO, because the package is not the security
// boundary — a SKILL.md saying "analyse only" cannot stop an agent that holds a
// write tool. Every verdict below is therefore a claim about language, and is
// worded as one.
//
// VERDICT DISCIPLINE (AC-AUDIT-04):
//   VIOLATION    the text contradicts the declaration
//   UNDECIDABLE  the text is genuinely ambiguous, or the method does not apply
//   NO_EVIDENCE  the check ran over this package and found nothing. This is NOT
//                a pass. It is emitted only by the two checks that search for
//                the presence of something, because absence cannot be proven
//                from static text.
//
// declaration.structural-conformance emits no NO_EVIDENCE, deliberately: a
// heading either is or is not in the document, so conformance there is decided,
// not merely unobserved. Emitting NO_EVIDENCE for a decidable property would
// blur the one distinction AC-AUDIT-04 exists to protect.

// ---------------------------------------------------------------------------
// Markdown decomposition
// ---------------------------------------------------------------------------

/**
 * Splits a SKILL.md into logical units, each carrying the 1-indexed line of its
 * FIRST physical line and the raw text of that line as a citation anchor.
 *
 * Wrapped prose is joined before analysis. That matters: a sentence split across
 * two physical lines would otherwise be analysed as two fragments, and the
 * fragment carrying the object would have lost the "Do not" that governs it —
 * turning a prohibition into a fabricated violation. Joining first is the
 * difference between reading the document and reading its line breaks.
 */
function logicalUnits(md) {
  const lines = md.split(/\r?\n/);
  const units = [];
  let i = 0;
  let inFence = false;

  if (lines[0] !== undefined && lines[0].trim() === "---") {
    i = 1;
    for (; i < lines.length; i += 1) {
      if (lines[i].trim() === "---") { i += 1; break; }
      const m = /^([A-Za-z0-9_-]+):\s*(.+)$/.exec(lines[i]);
      if (m) units.push({ line: i + 1, text: m[2].trim(), anchor: lines[i].trim(), kind: `frontmatter:${m[1]}` });
    }
  }

  let buf = null;
  const flush = () => { if (buf) { units.push(buf); buf = null; } };

  for (; i < lines.length; i += 1) {
    const raw = lines[i];
    const t = raw.trim();
    if (/^(```|~~~)/.test(t)) { flush(); inFence = !inFence; units.push({ line: i + 1, text: t, anchor: t, kind: "fence" }); continue; }
    if (inFence) { units.push({ line: i + 1, text: t, anchor: t, kind: "code" }); continue; }
    if (t === "") { flush(); continue; }
    if (/^#+\s/.test(t)) { flush(); units.push({ line: i + 1, text: t, anchor: t, kind: "heading" }); continue; }
    const marker = /^(?:[-*+]\s+|\d+[.)]\s+)/.exec(t);
    if (marker) { flush(); buf = { line: i + 1, text: t.slice(marker[0].length), anchor: t, kind: "list" }; continue; }
    if (buf) { buf.text += ` ${t}`; continue; }
    buf = { line: i + 1, text: t, anchor: t, kind: "prose" };
  }
  flush();
  return units;
}

/** Headings with their level and a normalized label, in document order. */
function headings(md) {
  return logicalUnits(md)
    .filter((u) => u.kind === "heading")
    .map((u) => {
      const m = /^(#+)\s+(.*)$/.exec(u.text);
      return { level: m[1].length, label: normalizeLabel(m[2]), raw: m[2].trim(), line: u.line, anchor: u.anchor };
    });
}

function normalizeLabel(s) {
  return s.trim().toLowerCase().replace(/[`*_]/g, "").replace(/\s+/g, " ").replace(/[.:]+$/, "");
}

/** Sentence-ish split. Splits on `.` or `;` followed by whitespace, so `file.md`
 *  and `0.1.0` stay intact and a semicolon-joined prohibition keeps its scope. */
function sentences(text) {
  return text.split(/(?<=[.;])\s+/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Resolves a citation through lineOf(), as AC-AUDIT-05 requires. Returns null
 * when the anchor does not resolve, and every caller then drops the file
 * reference rather than publishing a citation it cannot stand behind.
 */
function cite(text, anchor) {
  const line = lineOf(text, anchor);
  return Number.isInteger(line) ? line : null;
}

// ---------------------------------------------------------------------------
// Prohibition scope
// ---------------------------------------------------------------------------

// A verb under a prohibition is not an instruction to perform it. "Do not mutate
// the target repository, grant authority, mark an ADR accepted" prohibits all
// three — the negation scopes over the whole coordinated list — so the guard
// scans everything to the left of the verb within its sentence rather than only
// the immediately preceding word.
const PROHIBITION = /\b(do not|does not|don't|never|must not|may not|cannot|can not|shall not|will not|without|avoid|refrain from|rather than|instead of|prohibited|forbidden|disallowed|not permitted|no authority)\b/i;

function prohibited(before) {
  return PROHIBITION.test(before);
}

// ---------------------------------------------------------------------------
// Instructional position
// ---------------------------------------------------------------------------

// A mutation word only instructs when it sits in a verb slot. In "declared write
// sets when applicable", "write" is a noun modifier and instructs nothing; the
// crude probes that count that as a hit are the reason a naive matcher is worse
// than useless here.
function positionOf(before) {
  if (/^\s*$/.test(before)) return "imperative";
  if (/\b(may|must|should|shall|can|could|will|to|then|also)\s+$/i.test(before)) return "modal";
  if (/\b(do not|does not|don't|never|must not|may not|cannot|shall not|not)\s+$/i.test(before)) return "negated";
  if (/(?:[,;:]|\bor\b|\band\b|\bnor\b)\s+$/i.test(before)) return "coordinated";
  return null;
}

// ---------------------------------------------------------------------------
// Object lexicons
// ---------------------------------------------------------------------------

const EXEC_TERMS = new Set([
  "file", "files", "filename", "filesystem", "disk", "path", "paths", "directory", "directories",
  "folder", "folders", "repository", "repositories", "repo", "branch", "branches", "commit",
  // "source" alone is deliberately absent. "add a legend and source references"
  // is bibliography, not source code, and a bare "source" turned that sentence
  // into a false violation on the real corpus.
  "commits", "pull request", "codebase", "code", "source code", "source file", "script", "scripts", "command",
  "commands", "shell", "terminal", "cli", "npm", "npx", "git", "binary", "executable", "build",
  "pipeline", "ci", "deployment", "deployments", "environment", "environments", "server",
  "servers", "service", "services", "container", "containers", "cluster", "infrastructure",
  "database", "databases", "migration", "migrations", "credential", "credentials", "secret",
  "secrets", "token", "tokens", "config", "configuration", "configurations", "configs",
  "settings", "manifest", "manifests", "package.json", "production", "runtime", "process",
  "daemon", "port", "registry", "ledger", "workspace", "worktree", "target repository"
]);

const DOC_TERMS = new Set([
  "record", "records", "report", "reports", "document", "documents", "documentation", "adr",
  "adrs", "decision record", "view", "views", "diagram", "diagrams", "model", "models",
  "register", "catalogue", "catalog", "matrix", "checklist", "checklists", "summary",
  "summaries", "analysis", "assessment", "requirement", "requirements", "criterion", "criteria",
  "scenario", "scenarios", "option", "options", "finding", "findings", "note", "notes", "list",
  "index", "template", "output", "outputs", "deliverable", "deliverables", "handoff", "plan",
  "plans", "roadmap", "work package", "statement", "description", "narrative", "rationale",
  "justification", "evidence", "claim", "claims", "assumption", "assumptions", "question",
  "questions", "risk", "risks", "threat", "threats", "control", "controls", "mitigation",
  "mitigations", "conformance", "boundary", "boundaries", "context", "contexts", "id",
  "identifier", "identifiers", "ids", "section", "sections", "table", "tables", "appendix",
  "glossary", "backlog", "inventory", "mapping", "taxonomy", "definition", "definitions",
  "guidance", "recommendation", "recommendations", "trade-off", "tradeoff", "abuse-case",
  "residual-risk", "acceptance criteria", "exclusions", "legend", "legends", "reference",
  "references", "citation", "citations", "caption", "annotation", "annotations"
]);

const FILE_EXT = /\.(md|mjs|cjs|js|ts|tsx|json|ya?ml|sh|ps1|bat|py|rb|go|rs|toml|ini|env|lock)$/i;

const PREPOSITION = /^(of|to|in|on|under|from|at|into|onto|with|without|for|by|about|across|against|via|per|through|between|within|beneath|beside)$/i;

// A subordinate clause is not part of the direct object. "modify a configuration
// file when the section list has changed" has object "a configuration file"; a
// fixed-width word window would swallow "section list" from the WHEN-clause,
// mix a document term into an execution object, and downgrade a real violation
// to UNDECIDABLE.
const CLAUSE_BOUNDARY = /\b(when|whenever|if|unless|while|until|once|after|before|because|although|though|whereas|that|which|where|so that|in order to|rather than|instead of)\b/i;

function objectWindow(rest) {
  const words = rest.trim().split(/\s+/).filter(Boolean).slice(0, 15).join(" ");
  const cut = CLAUSE_BOUNDARY.exec(words);
  return cut ? words.slice(0, cut.index) : words;
}

/**
 * Classifies the direct object of a mutation verb.
 *
 * The adjectival drop is load-bearing. "Create deployment evidence" and "Create
 * separate dynamic or deployment views" both contain the word "deployment", and
 * in both it modifies a document noun rather than naming a deployment. An
 * execution term immediately followed by a document term is dropped, because
 * English puts the head noun last in that construction.
 *
 * MIXED resolves to UNDECIDABLE, never to VIOLATION. Genuinely ambiguous
 * language is reported as ambiguous; inflating it into a violation count is the
 * failure mode this whole work package exists to avoid.
 */
function classifyObject(window) {
  const words = window.toLowerCase().replace(/[`*_()[\]<>]/g, " ").split(/[^a-z0-9.+/-]+/).filter(Boolean);
  const terms = [];
  for (let i = 0; i < words.length; i += 1) {
    const w = words[i].replace(/[.,;:]+$/, "");
    const nxt = i + 1 < words.length ? words[i + 1].replace(/[.,;:]+$/, "") : null;
    const bigram = nxt ? `${w} ${nxt}` : null;
    if (bigram && EXEC_TERMS.has(bigram)) { terms.push({ t: bigram, k: "EXEC", i }); i += 1; continue; }
    if (bigram && DOC_TERMS.has(bigram)) { terms.push({ t: bigram, k: "DOC", i }); i += 1; continue; }
    if (EXEC_TERMS.has(w)) terms.push({ t: w, k: "EXEC", i });
    else if (DOC_TERMS.has(w)) terms.push({ t: w, k: "DOC", i });
    else if (FILE_EXT.test(w)) terms.push({ t: w, k: "EXEC", i });
  }

  const docPositions = terms.filter((t) => t.k === "DOC").map((t) => t.i);
  const kept = terms.filter((term) => {
    if (term.k !== "EXEC") return true;
    // Coordinated-modifier drop. In "context, container, component, dynamic,
    // deployment, or landscape views" every term before "views" shares that head
    // noun; none of them names a deployment. Drop an execution term when a
    // document term follows it closely with nothing but coordinators and
    // unclassified modifiers between — no preposition, which would start a new
    // phrase and mean the two nouns are not sharing a head.
    const head = docPositions.find((i) => i > term.i && i - term.i <= 8);
    if (head === undefined) return true;
    const between = words.slice(term.i + 1, head).map((w) => w.replace(/[.,;:]+$/, ""));
    return between.some((w) => PREPOSITION.test(w));
  });

  const hasExec = kept.some((t) => t.k === "EXEC");
  const hasDoc = kept.some((t) => t.k === "DOC");
  if (hasExec && hasDoc) return { kind: "MIXED", terms: kept.map((t) => t.t) };
  if (hasExec) return { kind: "EXEC", terms: kept.map((t) => t.t) };
  if (hasDoc) return { kind: "DOC", terms: kept.map((t) => t.t) };
  return { kind: "UNKNOWN", terms: [] };
}

const MUTATION_VERBS = [
  "write", "writes", "rewrite", "rewrites", "overwrite", "overwrites", "create", "creates",
  "modify", "modifies", "edit", "edits", "update", "updates", "delete", "deletes", "remove",
  "removes", "append", "appends", "generate", "generates", "execute", "executes", "run", "runs",
  "deploy", "deploys", "install", "installs", "commit", "commits", "push", "pushes", "merge",
  "merges", "apply", "applies", "patch", "patches", "mutate", "mutates", "provision",
  "provisions", "configure", "configures", "rename", "renames", "move", "moves", "copy",
  "copies", "add", "adds"
];

// Hyphen guards on both sides. Without them "append-only history" matched the
// verb "append" and produced a finding about a compound adjective; the same trap
// waits in "read-write", "copy-on-write", and "add-on".
const MUTATION_RE = new RegExp(`(?<![-\\w])(${MUTATION_VERBS.join("|")})(?![-\\w])`, "gi");

/** Shell-command syntax inside backticks or a fenced block. Requires a known
 *  executable followed by an argument, so a backticked path such as
 *  `references/workflow.md` cannot be mistaken for a command. */
const COMMAND_RE = /\b(git|npm|npx|pnpm|yarn|node|bash|sh|zsh|powershell|pwsh|rm|mv|cp|mkdir|touch|chmod|chown|curl|wget|docker|kubectl|helm|terraform|pip|python|make|sed|awk)\s+(-{0,2}[\w./:=-]+)/;

function verbOccurrences(sentence) {
  const out = [];
  MUTATION_RE.lastIndex = 0;
  let m;
  while ((m = MUTATION_RE.exec(sentence)) !== null) {
    const before = sentence.slice(0, m.index);
    const position = positionOf(before);
    if (!position) continue;
    out.push({
      verb: m[1].toLowerCase(),
      position,
      prohibited: prohibited(before),
      window: objectWindow(sentence.slice(m.index + m[0].length))
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Manifest access
// ---------------------------------------------------------------------------

/**
 * Reads the `roles:` block through corpus.mjs at its DOTTED paths.
 *
 * Read `values["roles.allowed"]`, never `values["roles"]`. The parent key is a
 * container and is expected to be empty. An earlier readShallowYaml collapsed
 * both nested sequences into the parent, so every manifest read as
 *   roles = ["ARCHI","REV","GOV","A5-GOVERNANCE-ROOT","SELF-APPROVAL","SELF-PROMOTION"]
 * and a check reading the parent as the allowed set would have concluded that
 * SELF-APPROVAL is an ALLOWED role — the precise inversion of the manifest, and
 * invisible, because the parent still looked populated.
 *
 * The `roles-parent-populated` branch below is a deliberate tripwire against
 * that shape returning. It is not dead code: if the reader ever re-collapses,
 * this check reports UNDECIDABLE instead of silently inverting a prohibition
 * into a permission. A check that cannot notice its own input going wrong is
 * not a control.
 */
function readRoles(pkg) {
  const values = pkg.manifest?.values;
  if (!values) return { ok: false, reason: "no-manifest" };

  const parent = values.roles;
  const allowed = values["roles.allowed"];
  const prohibited = values["roles.prohibited_final_authority"];

  if (Array.isArray(parent) && parent.length > 0) {
    return { ok: false, reason: "roles-parent-populated", parent };
  }
  if (!Array.isArray(allowed) && !Array.isArray(prohibited)) {
    return { ok: false, reason: parent === undefined ? "no-roles-block" : "roles-subkeys-unreadable" };
  }
  const unreadable = (pkg.manifest.unreadable ?? []).filter((u) => /roles|allowed|prohibited/i.test(u.text));
  if (unreadable.length > 0) return { ok: false, reason: "roles-lines-unreadable", unreadable };

  return {
    ok: true,
    roles: {
      allowed: Array.isArray(allowed) ? allowed : [],
      prohibited_final_authority: Array.isArray(prohibited) ? prohibited : []
    },
    line: values["roles__line"] ?? null
  };
}

function manifestValue(pkg, key) {
  const v = pkg.manifest?.values?.[key];
  return typeof v === "string" ? v : null;
}

/** Locates the `## Authority boundary` section at any heading depth. */
function sectionBody(md, labelRe) {
  const hs = headings(md);
  const idx = hs.findIndex((h) => labelRe.test(h.label));
  if (idx === -1) return null;
  const start = hs[idx];
  const next = hs.slice(idx + 1).find((h) => h.level <= start.level);
  const lines = md.split(/\r?\n/);
  const end = next ? next.line - 1 : lines.length;
  return { heading: start, text: lines.slice(start.line, end).join("\n") };
}

// ---------------------------------------------------------------------------
// Check 1 — structural conformance
// ---------------------------------------------------------------------------

const MAJORITY = 0.8;
const MIN_CORPUS_FOR_DERIVATION = 5;

/**
 * Derives the expected section set FROM the corpus rather than from anyone's
 * memory of it. A section is expected when a large majority of governed
 * packages carry it; the canonical order is the mean document position across
 * the packages that do. Returns the tally as well, so a reviewer can see the
 * derivation rather than trust its output.
 */
export function deriveExpectedSections(corpus) {
  const governed = corpus.packages.filter((p) => p.governed && typeof p.skillText === "string");
  if (governed.length < MIN_CORPUS_FOR_DERIVATION) {
    return { ok: false, reason: "corpus-too-small-to-derive", sampled: governed.length, expected: [], tally: [] };
  }

  const seen = new Map();
  for (const pkg of governed) {
    const l2 = headings(pkg.skillText).filter((h) => h.level === 2);
    const once = new Map();
    l2.forEach((h, order) => { if (!once.has(h.label)) once.set(h.label, { order, raw: h.raw }); });
    for (const [label, meta] of once) {
      const rec = seen.get(label) ?? { label, raw: meta.raw, count: 0, orderSum: 0 };
      rec.count += 1;
      rec.orderSum += meta.order;
      seen.set(label, rec);
    }
  }

  const threshold = Math.ceil(governed.length * MAJORITY);
  const tally = [...seen.values()]
    .map((r) => ({ label: r.label, raw: r.raw, count: r.count, share: r.count / governed.length, meanOrder: r.orderSum / r.count }))
    .sort((a, b) => b.count - a.count || a.meanOrder - b.meanOrder);
  const expected = tally.filter((r) => r.count >= threshold).sort((a, b) => a.meanOrder - b.meanOrder);

  return { ok: expected.length > 0, reason: expected.length > 0 ? null : "no-shared-section-set", sampled: governed.length, threshold, expected, tally };
}

const OBSERVED_SECTIONS = [
  "authority boundary", "required inputs", "workflow", "required outputs",
  "evidence and reasoning discipline", "completion gate", "supporting files"
];

const structuralConformance = {
  id: "declaration.structural-conformance",
  describe: "Every governed package's SKILL.md carries the section set that a large majority of the corpus shares.",

  run(corpus) {
    const out = [];
    const derived = deriveExpectedSections(corpus);
    const governed = corpus.packages.filter((p) => p.governed);

    if (!derived.ok) {
      out.push(finding({
        check: this.id,
        verdict: VERDICT.UNDECIDABLE,
        observation: `No expected section set could be derived from this corpus (${derived.reason}); structural conformance has no baseline to compare against and reports nothing rather than defaulting to a hardcoded list.`,
        evidence: { reason: derived.reason, sampled: derived.sampled, governed: governed.length }
      }));
      return out;
    }

    const expected = derived.expected.map((e) => e.label);
    const expectedSet = new Set(expected);
    // Recorded on every finding so a reader can see whether the derivation
    // matched the set the work package was written against.
    const driftFromObserved = {
      matches_observed_set: expected.length === OBSERVED_SECTIONS.length && expected.every((l, i) => l === OBSERVED_SECTIONS[i]),
      derived: expected,
      observed_in_work_package: OBSERVED_SECTIONS
    };

    for (const pkg of governed) {
      if (typeof pkg.skillText !== "string") {
        out.push(finding({
          check: this.id,
          pkg: pkg.name,
          verdict: VERDICT.UNDECIDABLE,
          observation: `${pkg.name} carries a manifest but no SKILL.md, so there is no document whose structure could be compared; this is reported as undecidable by this check rather than as a missing section.`,
          evidence: { ref: pkg.digest, expected, ...driftFromObserved }
        }));
        continue;
      }

      const hs = headings(pkg.skillText);
      const anyLabels = new Set(hs.map((h) => h.label));
      const l2Labels = new Set(hs.filter((h) => h.level === 2).map((h) => h.label));
      const overlapAny = expected.filter((l) => anyLabels.has(l)).length;
      const overlapL2 = expected.filter((l) => l2Labels.has(l)).length;
      const anchor = hs[0]?.anchor ?? null;
      const anchorLine = anchor ? cite(pkg.skillText, anchor) : null;

      const undecidable = (reason, note) => finding({
        check: this.id,
        pkg: pkg.name,
        file: anchorLine === null ? null : pkg.skillPath,
        line: anchorLine,
        verdict: VERDICT.UNDECIDABLE,
        observation: note,
        evidence: { ref: pkg.digest, reason, expected, headings: hs.map((h) => `h${h.level}:${h.raw}`), overlapAny, overlapL2, ...driftFromObserved }
      });

      if (hs.length === 0) {
        out.push(undecidable("no-headings", `${pkg.name}'s SKILL.md carries no markdown headings at all, so a section-by-section comparison against the corpus set is meaningless; this is undecidable by this method, not a set of missing sections.`));
        continue;
      }
      if (overlapAny === 0) {
        out.push(undecidable("no-shared-vocabulary", `${pkg.name}'s SKILL.md shares no heading label with the ${expected.length} sections the corpus majority uses, so it is organised on a different scheme; reporting ${expected.length} missing sections here would be an artefact of the comparison rather than a finding about the package.`));
        continue;
      }
      if (overlapL2 === 0) {
        out.push(undecidable("heading-depth-differs", `${pkg.name}'s SKILL.md uses the corpus section labels at a different heading depth than the level-2 convention the majority uses, so a depth-sensitive comparison cannot decide conformance.`));
        continue;
      }
      if (overlapAny / expectedSet.size < 0.5) {
        out.push(undecidable("structure-not-comparable", `${pkg.name}'s SKILL.md matches only ${overlapAny} of ${expectedSet.size} expected sections at any depth, which is too little shared structure for "missing section" to mean anything; undecidable by this method.`));
        continue;
      }

      expected.forEach((label, position) => {
        if (l2Labels.has(label)) return;
        const elsewhere = anyLabels.has(label);
        // Cite the nearest preceding expected section that IS present, so the
        // citation points at where the missing section should begin.
        let citeAnchor = anchor;
        for (let k = position - 1; k >= 0; k -= 1) {
          const prev = hs.find((h) => h.label === expected[k] && h.level === 2);
          if (prev) { citeAnchor = prev.anchor; break; }
        }
        const line = citeAnchor ? cite(pkg.skillText, citeAnchor) : null;
        out.push(finding({
          check: this.id,
          pkg: pkg.name,
          file: line === null ? null : pkg.skillPath,
          line,
          verdict: VERDICT.VIOLATION,
          observation: elsewhere
            ? `${pkg.name}'s SKILL.md carries the section "${label}" at a heading depth other than the level-2 convention that ${derived.expected.find((e) => e.label === label).count} of ${derived.sampled} governed packages use; the citation points at the section that precedes where it is expected.`
            : `${pkg.name}'s SKILL.md is missing the section "${label}", which ${derived.expected.find((e) => e.label === label).count} of ${derived.sampled} governed packages carry; the citation points at the section that precedes where it is expected.`,
          evidence: {
            ref: pkg.digest,
            missing_section: label,
            mode: elsewhere ? "wrong-depth" : "absent",
            expected,
            present_level2: [...l2Labels],
            ...driftFromObserved
          }
        }));
      });
    }
    return out;
  },

  selfTest() {
    const complete = (name) => synthPackage({
      name,
      skill: `---\nname: ${name}\ndescription: Analyses a system and documents the result.\n---\n\n# ${name}\n\n${OBSERVED_SECTIONS.map((s) => `## ${title(s)}\n\nBody text for ${s}.\n`).join("\n")}`,
      manifest: MINIMAL_MANIFEST(name)
    });

    // Positive: nine conformant packages plus one that drops "Completion gate".
    // Nine of ten keeps the section above the 80% majority threshold, so the
    // expectation survives the very package that violates it.
    const broken = synthPackage({
      name: "pkg-missing-gate",
      skill: `---\nname: pkg-missing-gate\ndescription: Analyses a system and documents the result.\n---\n\n# pkg-missing-gate\n\n${OBSERVED_SECTIONS.filter((s) => s !== "completion gate").map((s) => `## ${title(s)}\n\nBody text for ${s}.\n`).join("\n")}`,
      manifest: MINIMAL_MANIFEST("pkg-missing-gate")
    });

    const nine = Array.from({ length: 9 }, (_, i) => complete(`pkg-ok-${i}`));
    const posFindings = this.run(synthCorpus([...nine, broken]));
    const posViolations = posFindings.filter((f) => f.verdict === VERDICT.VIOLATION);

    const negFindings = this.run(synthCorpus(Array.from({ length: 10 }, (_, i) => complete(`pkg-ok-${i}`))));
    const negViolations = negFindings.filter((f) => f.verdict === VERDICT.VIOLATION);

    return {
      positive: {
        fired: posViolations.length > 0,
        detail: {
          input: "10 synthetic governed packages; pkg-missing-gate omits '## Completion gate'",
          violations: posViolations.length,
          sections: posViolations.map((f) => f.evidence.missing_section),
          cited: posViolations.map((f) => `${f.pkg}:${f.line}`),
          verdicts: tally(posFindings)
        }
      },
      negative: {
        fired: negViolations.length > 0,
        detail: {
          input: "10 synthetic governed packages, all carrying the full section set",
          violations: negViolations.length,
          verdicts: tally(negFindings)
        }
      }
    };
  }
};

// ---------------------------------------------------------------------------
// Check 2 — mutation class exceeded
// ---------------------------------------------------------------------------

const mutationClassExceeded = {
  id: "declaration.mutation-class-exceeded",
  describe: "A package declaring mutation_class M0 instructs its agent to write, execute, or deploy something that a higher mutation class would be required for.",

  run(corpus) {
    const out = [];
    for (const pkg of corpus.packages.filter((p) => p.governed)) {
      const declared = manifestValue(pkg, "classification.mutation_class");
      const mLine = pkg.manifest?.values?.["classification.mutation_class__line"] ?? null;

      if (declared === null) {
        out.push(finding({
          check: this.id,
          pkg: pkg.name,
          file: pkg.manifestPath && Number.isInteger(mLine) ? pkg.manifestPath : null,
          line: pkg.manifestPath && Number.isInteger(mLine) ? mLine : null,
          verdict: VERDICT.UNDECIDABLE,
          observation: `${pkg.name}'s manifest declares no readable classification.mutation_class, so there is no ceiling for its SKILL.md to exceed; the check cannot decide for this package rather than assuming M0.`,
          evidence: { ref: pkg.digest, reason: "mutation-class-unreadable", unreadable: pkg.manifest?.unreadable?.length ?? null }
        }));
        continue;
      }

      if (declared !== "M0") {
        out.push(finding({
          check: this.id,
          pkg: pkg.name,
          file: null,
          line: null,
          verdict: VERDICT.UNDECIDABLE,
          observation: `${pkg.name} declares mutation_class ${declared}. This check only carries a ruleset for M0, which is analyse-and-document-only; it has no basis to decide what ${declared} permits, and records that as undecidable so the package is not silently dropped from coverage.`,
          evidence: { ref: pkg.digest, reason: "no-ruleset-for-class", declared }
        }));
        continue;
      }

      if (typeof pkg.skillText !== "string") {
        out.push(finding({
          check: this.id,
          pkg: pkg.name,
          verdict: VERDICT.UNDECIDABLE,
          observation: `${pkg.name} declares mutation_class M0 but carries no SKILL.md, so there is no instruction text to compare against the declaration.`,
          evidence: { ref: pkg.digest, reason: "no-skill-text" }
        }));
        continue;
      }

      const local = [];
      for (const unit of logicalUnits(pkg.skillText)) {
        if (unit.kind === "heading") continue;
        const line = cite(pkg.skillText, unit.anchor);

        if ((unit.kind === "code" || /`/.test(unit.text)) && COMMAND_RE.test(unit.text)) {
          const cmd = COMMAND_RE.exec(unit.text);
          local.push(finding({
            check: this.id,
            pkg: pkg.name,
            file: line === null ? null : pkg.skillPath,
            line,
            verdict: VERDICT.VIOLATION,
            observation: `${pkg.name} declares mutation_class M0 (analyse and document only) but its SKILL.md presents a runnable command, "${cmd[0]}". Executing a command is outside M0. This is an inference about the instruction text, not an observation of behaviour: SKILL.md cannot make an agent run anything, and an agent without a shell cannot run it regardless.`,
            evidence: { ref: pkg.digest, declared, trigger: "command-syntax", command: cmd[0], unit: unit.text.slice(0, 200) }
          }));
          continue;
        }

        for (const sentence of sentences(unit.text)) {
          for (const occ of verbOccurrences(sentence)) {
            if (occ.prohibited) continue;
            const obj = classifyObject(occ.window);
            if (obj.kind === "DOC") continue;

            const shared = {
              ref: pkg.digest,
              declared,
              verb: occ.verb,
              position: occ.position,
              object_terms: obj.terms,
              object_class: obj.kind,
              sentence: sentence.slice(0, 240),
              section: unit.kind
            };

            if (obj.kind === "EXEC") {
              local.push(finding({
                check: this.id,
                pkg: pkg.name,
                file: line === null ? null : pkg.skillPath,
                line,
                verdict: VERDICT.VIOLATION,
                observation: `${pkg.name} declares mutation_class M0 (analyse and document only) but its SKILL.md instructs the agent to "${occ.verb}" a target this check reads as a file, repository, or execution surface (${obj.terms.join(", ")}). That exceeds M0. This is a claim about what the text asks for, not proof that any agent did it — SKILL.md is instruction text and the package is not the enforcement boundary.`,
                evidence: { ...shared, trigger: "exec-object" }
              }));
            } else {
              local.push(finding({
                check: this.id,
                pkg: pkg.name,
                file: line === null ? null : pkg.skillPath,
                line,
                verdict: VERDICT.UNDECIDABLE,
                observation: obj.kind === "MIXED"
                  ? `${pkg.name}'s SKILL.md instructs the agent to "${occ.verb}" something whose object names both a document artefact and an execution surface (${obj.terms.join(", ")}). The language will not decide between "produce a document about deployment" and "perform a deployment", so this is recorded as undecidable rather than counted as a violation.`
                  : `${pkg.name}'s SKILL.md instructs the agent to "${occ.verb}" an object this check cannot classify as either a document artefact or an execution surface. Whether it exceeds M0 depends on a reading of intent the text does not settle, so it is recorded as undecidable rather than counted as a violation.`,
                evidence: { ...shared, trigger: obj.kind === "MIXED" ? "mixed-object" : "unclassified-object" }
              }));
            }
          }
        }
      }

      if (local.length > 0) { out.push(...local); continue; }

      const anchorH = headings(pkg.skillText)[0];
      const line = anchorH ? cite(pkg.skillText, anchorH.anchor) : null;
      out.push(finding({
        check: this.id,
        pkg: pkg.name,
        file: line === null ? null : pkg.skillPath,
        line,
        verdict: VERDICT.NO_EVIDENCE,
        observation: `${pkg.name} declares mutation_class M0 and this check found no instruction in its SKILL.md that it reads as exceeding M0. This is NOT a statement that the package is clean. It is a statement that a language-level search over instruction text found nothing — which cannot prove absence, and says nothing at all about what an agent loading this package is actually permitted to do at runtime.`,
        evidence: { ref: pkg.digest, declared, method: "verb-position, prohibition-scope, object-classification, command-syntax", units_scanned: logicalUnits(pkg.skillText).length }
      }));
    }
    return out;
  },

  selfTest() {
    // The positive input is shaped like a real package in this corpus — same
    // frontmatter, same seven sections, same tone — and differs only in two
    // workflow steps. A check that only fires on a bare control string has not
    // been shown to fire on anything it will actually meet.
    const positivePkg = synthPackage({
      name: "pkg-writes-files",
      manifest: MINIMAL_MANIFEST("pkg-writes-files"),
      skill: [
        "---",
        "name: pkg-writes-files",
        "description: Maintains the skill manifest set and keeps generated documentation in step with it.",
        "---",
        "",
        "# Skill Manifest Maintenance",
        "",
        "## Authority boundary",
        "",
        "Operate in proposal-only mode. Escalate when scope or decision rights are ambiguous.",
        "",
        "## Required inputs",
        "",
        "- current manifest set",
        "- target section list",
        "",
        "## Workflow",
        "",
        "1. Review the current manifest set and record the sections that are missing.",
        "2. Summarise the gaps in a short report for the reviewing role.",
        "3. Write the corrected manifest file to disk at the package path.",
        "4. You may modify a configuration file when the section list has changed.",
        "5. Run `npm run validate` to confirm the corpus still loads.",
        "",
        "## Required outputs",
        "",
        "- gap report",
        "",
        "## Evidence and reasoning discipline",
        "",
        "- Separate verified facts from inference.",
        "",
        "## Completion gate",
        "",
        "Before completion, verify that every required output exists.",
        "",
        "## Supporting files",
        "",
        "- Read `references/workflow.md` for detailed checks and anti-patterns."
      ].join("\n")
    });

    // The negative reproduces the real corpus template verbatim in shape,
    // including the prohibition sentence whose coordinated list ("Do not mutate
    // the target repository, grant authority, ...") is the exact construction a
    // naive matcher turns into four false violations.
    const negativePkg = synthPackage({
      name: "pkg-analysis-only",
      manifest: MINIMAL_MANIFEST("pkg-analysis-only"),
      skill: [
        "---",
        "name: pkg-analysis-only",
        "description: Creates or updates an Architecture Decision Record for a significant, traceable design choice. Never modify the target.",
        "---",
        "",
        "# Architecture Decision Record",
        "",
        "## Authority boundary",
        "",
        "Operate in proposal-only mode. Do not mutate the target repository, grant authority, mark an architecture decision accepted, waive findings, or claim operational activation. Escalate when scope, evidence, identity, or decision rights are ambiguous.",
        "",
        "## Required inputs",
        "",
        "- decision statement",
        "",
        "## Workflow",
        "",
        "1. Assign or confirm an immutable decision ID.",
        "2. Record the selected option only at the status authorized by the decision owner.",
        "3. Document positive and negative consequences, risks, migration, and operational implications.",
        "4. Define deliverables, explicit exclusions, declared write sets when applicable, and acceptance criteria.",
        "",
        "## Required outputs",
        "",
        "- versioned ADR",
        "",
        "## Evidence and reasoning discipline",
        "",
        "- Use direct evidence where available; never substitute a producer summary for verification.",
        "",
        "## Completion gate",
        "",
        "Before completion, verify that every required output exists.",
        "",
        "## Supporting files",
        "",
        "- Use `assets/output-template.md` for the deliverable structure."
      ].join("\n")
    });

    const pos = this.run(synthCorpus([positivePkg]));
    const neg = this.run(synthCorpus([negativePkg]));
    const posV = pos.filter((f) => f.verdict === VERDICT.VIOLATION);
    const negV = neg.filter((f) => f.verdict === VERDICT.VIOLATION);

    return {
      positive: {
        fired: posV.length > 0,
        detail: {
          input: "realistic M0 SKILL.md with three added workflow steps: write a manifest file to disk, modify a configuration file, run an npm command",
          violations: posV.length,
          triggers: posV.map((f) => f.evidence.trigger),
          cited: posV.map((f) => `${f.pkg}:${f.line}`),
          sentences: posV.map((f) => f.evidence.sentence ?? f.evidence.command),
          verdicts: tally(pos)
        }
      },
      negative: {
        fired: negV.length > 0,
        detail: {
          input: "the real corpus template verbatim in shape, including the coordinated prohibition and the nominal phrase 'declared write sets'",
          violations: negV.length,
          verdicts: tally(neg),
          note: "NO_EVIDENCE here is the correct outcome and is not a pass"
        }
      }
    };
  }
};

// ---------------------------------------------------------------------------
// Check 3 — authority boundary consistency
// ---------------------------------------------------------------------------

const AUTHORITY_ASSERTIONS = [
  { re: /\bapprov(e|es|ing)\b/i, token: "SELF-APPROVAL", act: "approve" },
  { re: /\baccept(s|ing)?\b/i, token: "SELF-APPROVAL", act: "accept" },
  { re: /\bsign\s*-?\s*off\b/i, token: "SELF-APPROVAL", act: "sign off" },
  { re: /\bratif(y|ies|ying)\b/i, token: "SELF-APPROVAL", act: "ratify" },
  { re: /\bwaiv(e|es|ing)\b/i, token: "SELF-APPROVAL", act: "waive" },
  { re: /\bpromot(e|es|ing)\b/i, token: "SELF-PROMOTION", act: "promote" },
  { re: /\bpublish(es|ing)?\b/i, token: "SELF-PROMOTION", act: "publish" },
  { re: /\bactivat(e|es|ing)\b/i, token: "SELF-PROMOTION", act: "activate" },
  { re: /\bregister(s|ing)?\b/i, token: "SELF-PROMOTION", act: "register" },
  { re: /\bgrant(s|ing)?\s+(authority|permission|access)\b/i, token: "A5-GOVERNANCE-ROOT", act: "grant authority" },
  { re: /\boverrid(e|es|ing)\b/i, token: "A5-GOVERNANCE-ROOT", act: "override" },
  { re: /\bfinal\s+authority\b/i, token: "A5-GOVERNANCE-ROOT", act: "claim final authority" },
  { re: /\bauthoriz(e|es|ing)\b/i, token: "A5-GOVERNANCE-ROOT", act: "authorize" }
];

const MARK_ACCEPTED = /\bmark(s|ing)?\b[^.;]{0,60}\b(accepted|approved|closed|final|complete)\b/i;

const authorityBoundaryConsistency = {
  id: "declaration.authority-boundary-consistency",
  describe: "A package's SKILL.md authority-boundary text claims an authority that its own manifest prohibits or caps.",

  run(corpus) {
    const out = [];
    for (const pkg of corpus.packages.filter((p) => p.governed)) {
      const parsed = readRoles(pkg);
      const ceiling = manifestValue(pkg, "classification.authority_ceiling");
      const approvalClaims = manifestValue(pkg, "controls.approval_claims");
      const repoMutation = manifestValue(pkg, "controls.repository_mutation");

      // A roles block that is present but unreadable is NOT the same as one that
      // is absent, and the difference decides whether this check may run at all.
      // If the prohibited set cannot be trusted, an empty prohibited set would
      // silently convert every prohibition into a permission and the check would
      // return NO_EVIDENCE on a package it never actually examined.
      const rolesTrusted = parsed.ok || (parsed.reason === "no-roles-block" && (ceiling !== null || approvalClaims !== null));
      if (!rolesTrusted) {
        out.push(finding({
          check: this.id,
          pkg: pkg.name,
          verdict: VERDICT.UNDECIDABLE,
          observation: `${pkg.name}'s manifest does not yield a trustworthy roles declaration (${parsed.reason}), so this check has no reliable prohibited-authority set to compare the SKILL.md against. It reports undecidable rather than proceeding with an empty prohibited set, which would turn every prohibition the manifest states into a permission this check silently accepts.`,
          evidence: { ref: pkg.digest, reason: parsed.reason, authority_ceiling: ceiling, approval_claims: approvalClaims, roles_parent: parsed.parent ?? null }
        }));
        continue;
      }

      const prohibitedTokens = (parsed.ok ? parsed.roles.prohibited_final_authority : []).map((s) => String(s).toUpperCase());
      const allowedRoles = parsed.ok ? parsed.roles.allowed : [];

      if (typeof pkg.skillText !== "string") {
        out.push(finding({
          check: this.id,
          pkg: pkg.name,
          verdict: VERDICT.UNDECIDABLE,
          observation: `${pkg.name} carries a manifest declaring an authority boundary but no SKILL.md, so there is no text that could contradict it.`,
          evidence: { ref: pkg.digest, reason: "no-skill-text", prohibited_final_authority: prohibitedTokens, authority_ceiling: ceiling }
        }));
        continue;
      }

      const section = sectionBody(pkg.skillText, /^authority boundar(y|ies)$/);
      if (section === null) {
        const anchorH = headings(pkg.skillText)[0];
        const line = anchorH ? cite(pkg.skillText, anchorH.anchor) : null;
        out.push(finding({
          check: this.id,
          pkg: pkg.name,
          file: line === null ? null : pkg.skillPath,
          line,
          verdict: VERDICT.NO_EVIDENCE,
          observation: `${pkg.name}'s SKILL.md has no authority-boundary section, so it makes no authority claim that could contradict the manifest. Silence is not agreement and is not a pass: the manifest's boundary is unrestated in the text an agent actually reads.`,
          evidence: { ref: pkg.digest, reason: "authority-section-absent", prohibited_final_authority: prohibitedTokens, authority_ceiling: ceiling, approval_claims: approvalClaims }
        }));
        continue;
      }

      const local = [];

      // Two scan targets. The authority-boundary section is decomposed into its
      // own units; the frontmatter description is a single unit whose anchor is
      // the raw frontmatter line, so its citation resolves in SKILL.md rather
      // than in the extracted substring.
      const scanTargets = [{
        where: "authority-boundary-section",
        units: logicalUnits(section.text).filter((u) => u.kind !== "heading")
      }];
      const desc = logicalUnits(pkg.skillText).find((u) => u.kind === "frontmatter:description");
      if (desc) scanTargets.push({ where: "frontmatter-description", units: [desc] });

      for (const target of scanTargets) {
        for (const unit of target.units) {
          const line = cite(pkg.skillText, unit.anchor) ?? cite(pkg.skillText, section.heading.anchor);

          for (const sentence of sentences(unit.text)) {
            for (const rule of AUTHORITY_ASSERTIONS) {
              const m = rule.re.exec(sentence);
              if (!m) continue;
              const before = sentence.slice(0, m.index);
              if (prohibited(before)) continue;
              if (!positionOf(before)) continue;

              const contradictsToken = prohibitedTokens.includes(rule.token);
              const contradictsControl = rule.token === "SELF-APPROVAL" && approvalClaims === "prohibited";

              local.push(finding({
                check: this.id,
                pkg: pkg.name,
                file: line === null ? null : pkg.skillPath,
                line,
                verdict: contradictsToken || contradictsControl ? VERDICT.VIOLATION : VERDICT.UNDECIDABLE,
                observation: contradictsToken || contradictsControl
                  ? `${pkg.name}'s manifest ${contradictsToken ? `lists ${rule.token} under roles.prohibited_final_authority` : "sets controls.approval_claims to prohibited"}, but its SKILL.md tells the agent it may "${rule.act}" without qualifying the statement as a prohibition. The instruction text grants what the manifest withholds. This is a contradiction between two declarations, not evidence that the authority was ever exercised.`
                  : `${pkg.name}'s SKILL.md asserts "${rule.act}" in its ${target.where}, and the manifest neither prohibits nor permits that act in a field this check can read. Whether it exceeds the declared boundary is not settled by the two documents, so it is recorded as undecidable rather than counted as a violation.`,
                evidence: {
                  ref: pkg.digest,
                  trigger: "authority-assertion",
                  act: rule.act,
                  maps_to_token: rule.token,
                  prohibited_final_authority: prohibitedTokens,
                  approval_claims: approvalClaims,
                  authority_ceiling: ceiling,
                  where: target.where,
                  sentence: sentence.slice(0, 240)
                }
              }));
            }

            const mk = MARK_ACCEPTED.exec(sentence);
            if (mk && !prohibited(sentence.slice(0, mk.index)) && (prohibitedTokens.includes("SELF-APPROVAL") || approvalClaims === "prohibited")) {
              local.push(finding({
                check: this.id,
                pkg: pkg.name,
                file: line === null ? null : pkg.skillPath,
                line,
                verdict: VERDICT.VIOLATION,
                observation: `${pkg.name}'s SKILL.md instructs the agent to mark something accepted or approved while its manifest withholds self-approval. Marking a record accepted is an approval act under any reading, and the manifest denies it.`,
                evidence: { ref: pkg.digest, trigger: "mark-accepted", prohibited_final_authority: prohibitedTokens, approval_claims: approvalClaims, where: target.where, sentence: sentence.slice(0, 240) }
              }));
            }

            // A named authority level above the manifest ceiling.
            if (ceiling && /^A[0-5]$/.test(ceiling)) {
              const am = /\bA([0-5])\b/.exec(sentence);
              if (am && Number(am[1]) > Number(ceiling.slice(1))) {
                local.push(finding({
                  check: this.id,
                  pkg: pkg.name,
                  file: line === null ? null : pkg.skillPath,
                  line,
                  verdict: VERDICT.VIOLATION,
                  observation: `${pkg.name}'s manifest caps classification.authority_ceiling at ${ceiling}, but its SKILL.md names authority level A${am[1]}, which is above that cap.`,
                  evidence: { ref: pkg.digest, trigger: "ceiling-exceeded", authority_ceiling: ceiling, named_level: `A${am[1]}`, where: target.where, sentence: sentence.slice(0, 240) }
                }));
              }
            }

            // The authority section itself asserting a repository mutation that
            // controls.repository_mutation prohibits.
            if (repoMutation === "prohibited" && target.where === "authority-boundary-section") {
              for (const occ of verbOccurrences(sentence)) {
                if (occ.prohibited) continue;
                const obj = classifyObject(occ.window);
                if (obj.kind !== "EXEC") continue;
                local.push(finding({
                  check: this.id,
                  pkg: pkg.name,
                  file: line === null ? null : pkg.skillPath,
                  line,
                  verdict: VERDICT.VIOLATION,
                  observation: `${pkg.name}'s manifest sets controls.repository_mutation to prohibited, but the authority-boundary section of its SKILL.md tells the agent to "${occ.verb}" ${obj.terms.join(", ")}. The section that exists to state the limit is the one exceeding it.`,
                  evidence: { ref: pkg.digest, trigger: "repo-mutation-in-authority-section", verb: occ.verb, object_terms: obj.terms, repository_mutation: repoMutation, sentence: sentence.slice(0, 240) }
                }));
              }
            }
          }
        }
      }

      if (local.length > 0) { out.push(...dedupe(local)); continue; }

      const line = cite(pkg.skillText, section.heading.anchor);
      out.push(finding({
        check: this.id,
        pkg: pkg.name,
        file: line === null ? null : pkg.skillPath,
        line,
        verdict: VERDICT.NO_EVIDENCE,
        observation: `${pkg.name}'s SKILL.md carries an authority-boundary section and this check found no unprohibited claim in it that contradicts the manifest's prohibited_final_authority (${prohibitedTokens.join(", ") || "none readable"}), approval-claims control, or A-level ceiling. This is NOT a pass. A static comparison of two declarations cannot show that the boundary holds at runtime, and both documents are written by the same producer.`,
        evidence: {
          ref: pkg.digest,
          reason: "no-contradiction-detected",
          prohibited_final_authority: prohibitedTokens,
          allowed_roles: allowedRoles,
          authority_ceiling: ceiling,
          approval_claims: approvalClaims,
          repository_mutation: repoMutation,
          roles_block_readable: parsed.ok
        }
      }));
    }
    return out;
  },

  selfTest() {
    const manifest = (name, extra = "") => [
      `skill_id: SECB-TEST-${name}`,
      `name: ${name}`,
      "version: 0.1.0",
      "status: candidate",
      "classification:",
      "  risk_class: R0",
      "  mutation_class: M0",
      "  authority_ceiling: A2",
      "roles:",
      "  allowed:",
      "  - ARCHI",
      "  - REV",
      "  prohibited_final_authority:",
      "  - A5-GOVERNANCE-ROOT",
      "  - SELF-APPROVAL",
      "  - SELF-PROMOTION",
      "controls:",
      "  repository_mutation: prohibited",
      "  approval_claims: prohibited",
      extra
    ].filter(Boolean).join("\n");

    const skill = (name, authorityBody) => [
      "---",
      `name: ${name}`,
      "description: Reviews an architecture decision and records the outcome for the decision owner.",
      "---",
      "",
      "# Architecture Review",
      "",
      "## Authority boundary",
      "",
      authorityBody,
      "",
      "## Required inputs",
      "",
      "- decision statement",
      "",
      "## Workflow",
      "",
      "1. Summarise the decision and record the outcome.",
      "",
      "## Required outputs",
      "",
      "- review record",
      "",
      "## Completion gate",
      "",
      "Before completion, verify that every required output exists."
    ].join("\n");

    const positivePkg = synthPackage({
      name: "pkg-claims-approval",
      manifest: manifest("pkg-claims-approval"),
      skill: skill("pkg-claims-approval", "You may approve the architecture decision once the analysis is complete, and may mark the record accepted on the decision owner's behalf. Escalate only when evidence is missing.")
    });

    const negativePkg = synthPackage({
      name: "pkg-restates-boundary",
      manifest: manifest("pkg-restates-boundary"),
      skill: skill("pkg-restates-boundary", "Operate in proposal-only mode. Do not mutate the target repository, grant authority, mark an architecture decision accepted, waive findings, or claim operational activation. Escalate when scope, evidence, identity, or decision rights are ambiguous.")
    });

    const pos = this.run(synthCorpus([positivePkg]));
    const neg = this.run(synthCorpus([negativePkg]));
    const posV = pos.filter((f) => f.verdict === VERDICT.VIOLATION);
    const negV = neg.filter((f) => f.verdict === VERDICT.VIOLATION);

    return {
      positive: {
        fired: posV.length > 0,
        detail: {
          input: "manifest prohibits SELF-APPROVAL and sets approval_claims: prohibited; SKILL.md authority section says the agent may approve and may mark the record accepted",
          violations: posV.length,
          triggers: posV.map((f) => f.evidence.trigger),
          acts: posV.map((f) => f.evidence.act ?? f.evidence.trigger),
          cited: posV.map((f) => `${f.pkg}:${f.line}`),
          verdicts: tally(pos)
        }
      },
      negative: {
        fired: negV.length > 0,
        detail: {
          input: "identical manifest; SKILL.md authority section is the real corpus prohibition sentence, which names approve/accept/waive/grant only under 'Do not'",
          violations: negV.length,
          verdicts: tally(neg),
          note: "NO_EVIDENCE here is the correct outcome and is not a pass"
        }
      }
    };
  }
};

// ---------------------------------------------------------------------------
// Synthetic corpus construction (in memory only — never touches .agents/)
// ---------------------------------------------------------------------------

function title(label) {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function MINIMAL_MANIFEST(name) {
  return [
    `skill_id: SECB-TEST-${name}`,
    `name: ${name}`,
    "version: 0.1.0",
    "status: candidate",
    "classification:",
    "  risk_class: R0",
    "  mutation_class: M0",
    "  authority_ceiling: A1",
    "roles:",
    "  allowed:",
    "  - ARCHI",
    "  prohibited_final_authority:",
    "  - SELF-APPROVAL",
    "controls:",
    "  repository_mutation: prohibited",
    "  approval_claims: prohibited"
  ].join("\n");
}

/**
 * Builds a package object with the same shape loadCorpus produces, entirely in
 * memory. `digest` is a stable synthetic marker rather than a real hash: these
 * packages have no bytes on disk, and computing a hash over invented content
 * would dress a fixture up as evidence.
 */
export function synthPackage({ name, skill = null, manifest = null, manifestOverride = null }) {
  return Object.freeze({
    name,
    dir: `<synthetic>/${name}`,
    files: [],
    digest: `synthetic:${name}`,
    manifestPath: manifest === null && manifestOverride === null ? null : `<synthetic>/${name}/manifest.yaml`,
    manifestText: manifest,
    // manifestOverride injects a hand-built parse result. It exists so a test can
    // reproduce a reader shape the current reader will not produce — such as the
    // collapsed `roles` array that readShallowYaml used to emit — and prove this
    // check still refuses it.
    manifest: manifestOverride ?? (manifest === null ? null : readShallowYaml(manifest)),
    skillPath: skill === null ? null : `<synthetic>/${name}/SKILL.md`,
    skillText: skill,
    governed: manifest !== null || manifestOverride !== null
  });
}

export function synthCorpus(packages) {
  return Object.freeze({
    root: "<synthetic>",
    loadedAt: null,
    packages: Object.freeze(packages),
    counts: Object.freeze({
      packages: packages.length,
      governed: packages.filter((p) => p.governed).length,
      ungoverned: packages.filter((p) => !p.governed).length,
      files: 0
    })
  });
}

function tally(findings) {
  return findings.reduce((acc, f) => { acc[f.verdict] = (acc[f.verdict] ?? 0) + 1; return acc; }, {});
}

function dedupe(findings) {
  const seen = new Set();
  return findings.filter((f) => {
    const k = `${f.pkg}|${f.line}|${f.verdict}|${f.evidence.trigger}|${f.evidence.act ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export const CHECKS = [structuralConformance, mutationClassExceeded, authorityBoundaryConsistency];
