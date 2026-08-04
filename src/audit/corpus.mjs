import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

// WP-SK-AUDIT-01 foundation. Loads the skill corpus into computed facts, so
// every check downstream reasons over the same evidence and none of them re-reads
// the tree with its own conventions.
//
// This module COMPUTES. It never judges. Nothing here emits a finding, a verdict,
// or a severity — that separation is the whole design: decidable facts are
// calculated, and only what is genuinely a judgement call is judged.
//
// READ-ONLY, structurally. Nothing in src/audit/ may write under .agents/ —
// PACK.yaml declares mutation_authorized: false, and WP-SK-AUDIT-01 lists
// .agents/** in prohibited_paths without exception. This module opens files for
// reading only and exposes no write path.

export const CORPUS_ROOT = ".agents/skills";

/**
 * Verdicts. Three-valued by AC-AUDIT-04, and the distinction is load-bearing:
 *
 *   VIOLATION    evidence contradicts a declaration
 *   NO_EVIDENCE  the check ran and found nothing. NOT "clean" — static analysis
 *                cannot prove absence, and rendering this as a pass would
 *                manufacture the exact defect this system exists to detect
 *   UNDECIDABLE  the check cannot answer for this input by this method
 */
export const VERDICT = Object.freeze({
  VIOLATION: "VIOLATION",
  NO_EVIDENCE: "NO_EVIDENCE",
  UNDECIDABLE: "UNDECIDABLE"
});

/**
 * A finding. Deliberately carries NO disposition, approval, status or severity
 * field (AC-AUDIT-08) — nothing a downstream reader could mistake for a ruling.
 * `line` is 1-indexed and required whenever `file` is set (AC-AUDIT-05); the
 * report builder rejects a citation it cannot resolve rather than publishing it
 * with a caveat.
 */
export function finding({ check, pkg = null, file = null, line = null, verdict, observation, evidence = {} }) {
  if (!VERDICT[verdict]) throw new Error(`finding: unknown verdict ${verdict}`);
  if (file !== null && !Number.isInteger(line)) {
    throw new Error(`finding: ${check} cites ${file} without an integer line`);
  }
  return Object.freeze({ check, pkg, file, line, verdict, observation, evidence: Object.freeze(evidence) });
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function walk(dir, root, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, root, out);
    else if (entry.isFile()) out.push(abs);
  }
  return out;
}

// Minimal YAML reader for the shapes this corpus actually uses: top-level
// scalars, one level of nested scalars, and sequences of scalars. It is NOT a
// YAML parser and does not pretend to be — anything it cannot represent is
// reported as unreadable so a check can return UNDECIDABLE rather than silently
// treating an unparsed field as absent. Treating "I could not read it" as "it is
// not there" is how a check stops being able to fail.
export function readShallowYaml(text) {
  const out = {};
  const unreadable = [];
  const lines = text.split(/\r?\n/);

  // A stack of { indent, path } for the enclosing mappings.
  //
  // DEFECT FIXED HERE, recorded because the fix is the interesting part. The
  // first version treated a nested sequence HEADER (`allowed:` under `roles:`)
  // as unreadable and left the current key pointing at the PARENT, so the items
  // beneath it were appended to the parent's array. Every manifest in this
  // corpus then read as
  //   roles = ["ARCHI","REV","GOV","A5-GOVERNANCE-ROOT","SELF-APPROVAL","SELF-PROMOTION"]
  // with `allowed` and `prohibited_final_authority` merged into one flat list.
  // A check reading `roles` as the allowed set would conclude SELF-APPROVAL is
  // an ALLOWED role — the exact inversion of what the manifest says.
  //
  // That is worse than incomplete data: it is confidently mis-attributed data,
  // and it would have been invisible because the parent key still looked
  // populated. The same collapse hit inputs/outputs/evaluation.
  const stack = [];

  const pathAt = (indent) => {
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    return stack.map((f) => f.key).join(".");
  };

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    if (!raw.trim() || raw.trimStart().startsWith("#")) continue;
    const indent = raw.length - raw.trimStart().length;
    const line = raw.trim();

    if (line.startsWith("- ")) {
      // A sequence item belongs to the nearest key strictly shallower than it.
      // YAML permits an item at the same indent as its key; both are handled by
      // taking the deepest frame with indent <= this line's.
      const frame = [...stack].reverse().find((f) => f.indent <= indent);
      if (!frame) { unreadable.push({ line: i + 1, text: raw, reason: "sequence item with no enclosing key" }); continue; }
      const key = stack.slice(0, stack.indexOf(frame) + 1).map((f) => f.key).join(".");
      if (!Array.isArray(out[key])) out[key] = [];
      out[key].push(scalar(line.slice(2)));
      continue;
    }

    const match = /^([A-Za-z0-9_.-]+):\s*(.*)$/.exec(line);
    if (!match) { unreadable.push({ line: i + 1, text: raw, reason: "not a key or sequence item" }); continue; }
    const [, key, rest] = match;

    const parent = pathAt(indent);
    const path = parent ? `${parent}.${key}` : key;

    if (stack.length >= 2 && parent !== "") {
      // Depth 3 and beyond. Reported rather than flattened: this reader can
      // represent two levels and says so, instead of producing a path it cannot
      // guarantee is the one the document meant.
      unreadable.push({ line: i + 1, text: raw, reason: "nesting deeper than two levels" });
      continue;
    }

    stack.push({ indent, key });
    out[`${path}__line`] = i + 1;
    if (rest === "") out[path] = [];   // mapping or sequence header; items follow
    else out[path] = scalar(rest);
  }
  return { values: out, unreadable };
}

function scalar(value) {
  const v = value.trim().replace(/\s+#.*$/, "");
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}

/**
 * Loads the corpus. Returns computed facts only.
 *
 * Every package directory is included whether or not it carries a manifest —
 * a package without one is the finding, not an entry to skip. Skipping it would
 * be a silent cap (AC-AUDIT-06) and would hide the three ungoverned packages the
 * runtime already reports as DENY_UNGOVERNED_PACKAGE.
 */
export function loadCorpus(root = CORPUS_ROOT) {
  const dirs = readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const packages = dirs.map((name) => {
    const dir = join(root, name);
    const files = walk(dir, dir).map((abs) => {
      const bytes = readFileSync(abs);
      return {
        rel: relative(root, abs).split(sep).join("/"),
        path: abs.split(sep).join("/"),
        bytes: bytes.length,
        sha256: sha256(bytes)
      };
    }).sort((a, b) => a.rel.localeCompare(b.rel));

    const find = (suffix) => files.find((f) => f.rel.endsWith(suffix)) ?? null;
    const manifestFile = find(`${name}/manifest.yaml`);
    const skillFile = find(`${name}/SKILL.md`);

    const read = (f) => (f ? readFileSync(f.path, "utf8") : null);
    const manifestText = read(manifestFile);
    const manifest = manifestText === null ? null : readShallowYaml(manifestText);

    return Object.freeze({
      name,
      dir: dir.split(sep).join("/"),
      files,
      // Package digest over (path, content-hash) pairs, so a rename is drift and
      // a same-content move is not silently identical.
      digest: sha256(Buffer.from(files.map((f) => `${f.rel}:${f.sha256}`).join("\n"), "utf8")),
      manifestPath: manifestFile?.path ?? null,
      manifestText,
      manifest,
      skillPath: skillFile?.path ?? null,
      skillText: read(skillFile),
      governed: manifestFile !== null
    });
  });

  return Object.freeze({
    root,
    loadedAt: null, // stamped by the caller; this module takes no clock
    packages: Object.freeze(packages),
    counts: Object.freeze({
      packages: packages.length,
      governed: packages.filter((p) => p.governed).length,
      ungoverned: packages.filter((p) => !p.governed).length,
      files: packages.reduce((n, p) => n + p.files.length, 0)
    })
  });
}

/** 1-indexed line of the first match, or null. For AC-AUDIT-05 citations. */
export function lineOf(text, pattern) {
  if (typeof text !== "string") return null;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    if (pattern instanceof RegExp ? pattern.test(lines[i]) : lines[i].includes(pattern)) return i + 1;
  }
  return null;
}
