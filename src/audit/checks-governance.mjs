import { VERDICT, finding, lineOf, readShallowYaml } from "./corpus.mjs";

// WP-SK-AUDIT-01 — governance lens. Deterministic checks over the evidence layer
// in corpus.mjs. This module JUDGES only what corpus.mjs already COMPUTED; it
// never re-reads the tree and it never writes. Nothing here opens a file handle
// at all: every input arrives as a corpus object.
//
// .agents/** is READ-ONLY to this work package (PACK.yaml mutation_authorized:
// false, WP-SK-AUDIT-01 prohibited_paths). Synthetic corpora for the AC-AUDIT-02
// control matrix are therefore built IN MEMORY by synthCorpus() below, never
// seeded onto disk, and their paths carry a `synthetic://` scheme so a citation
// from a control case can never be mistaken for a citation into the real tree.
//
// Three verdicts, and the distinction is load-bearing (AC-AUDIT-04):
//   VIOLATION    the evidence contradicts a declaration
//   NO_EVIDENCE  the check ran and found nothing. NOT a pass — see noEvidence()
//   UNDECIDABLE  the check cannot answer for this input by this method
//
// Every check emits at least one finding. A check that produced an empty array
// would be indistinguishable from a check that never ran, which is how a partial
// audit becomes a false clean bill (AC-AUDIT-06).

const IDENTITY_FIELDS = Object.freeze(["skill_id", "name", "version", "status"]);

/**
 * The NO_EVIDENCE finding a check emits when it fired on nothing.
 *
 * The observation states the method's reach explicitly, because the one thing
 * this finding must never be summarised as is "clean". `method_limits` is not
 * decoration: it is the record of what this check could not have seen, so a
 * reader cannot upgrade silence into absence.
 */
function noEvidence({ check, examined, methodLimits, scope }) {
  return finding({
    check,
    verdict: VERDICT.NO_EVIDENCE,
    observation:
      `Check ran over ${examined} package(s) and found no instance of the condition it detects. ` +
      `This is NO_EVIDENCE and not a pass: the check detects only what its method reaches, ` +
      `and static analysis cannot establish that no such condition exists.`,
    evidence: { examined, method_limits: methodLimits, scope }
  });
}

/** True when a check produced anything other than NO_EVIDENCE. */
function fired(findings) {
  return findings.some((f) => f.verdict !== VERDICT.NO_EVIDENCE);
}

function summarise(findings) {
  const byVerdict = {};
  for (const f of findings) byVerdict[f.verdict] = (byVerdict[f.verdict] ?? 0) + 1;
  const cites = findings
    .filter((f) => f.file !== null)
    .map((f) => `${f.file}:${f.line}`)
    .slice(0, 4);
  return `${findings.length} finding(s) ${JSON.stringify(byVerdict)}${cites.length ? ` cites ${cites.join(", ")}` : ""}`;
}

/**
 * Records the coverage bound a check operated under, on every finding it emits
 * (AC-AUDIT-06). A bound that appears only when it bites is a bound nobody sees.
 */
function scopeOf(corpus, { examined, skipped, skipReason }) {
  return { root: corpus.root, packages_in_corpus: corpus.packages.length, examined, skipped, skip_reason: skipReason };
}

/** Governed packages only, with the skip recorded rather than silently applied. */
function governedSlice(corpus) {
  const governed = corpus.packages.filter((p) => p.manifest !== null);
  const skipped = corpus.packages.length - governed.length;
  return {
    governed,
    scope: scopeOf(corpus, {
      examined: governed.length,
      skipped,
      skipReason: skipped
        ? "packages without a manifest.yaml carry no declaration for this check to test; they are reported by governance.ungoverned-package instead of being double-counted here"
        : "none"
    })
  };
}

/** 1-indexed line of a TOP-LEVEL key in a manifest, or null. */
function topLevelKeyLine(text, key) {
  return lineOf(text, new RegExp(`^${key}\\s*:`));
}

/**
 * Builds a corpus object in memory with the shape loadCorpus() returns.
 *
 * Used by every selfTest(). Manifest text is run through the real
 * readShallowYaml so the synthetic manifest's line numbers are genuine line
 * numbers in that text — a control case that cited a made-up line would not be
 * testing the citation rule it exists to exercise.
 */
export function synthCorpus(specs, root = "synthetic://corpus") {
  const packages = specs.map((spec) => {
    const manifestText = spec.manifestText ?? null;
    const manifest = manifestText === null ? null : readShallowYaml(manifestText);
    const dir = `${root}/${spec.name}`;
    const manifestPath = manifestText === null ? null : `${dir}/manifest.yaml`;
    const files = manifestText === null
      ? []
      : [{ rel: `${spec.name}/manifest.yaml`, path: manifestPath, bytes: manifestText.length, sha256: "synthetic" }];
    return Object.freeze({
      name: spec.name,
      dir,
      files: Object.freeze(files),
      digest: "synthetic",
      manifestPath,
      manifestText,
      manifest,
      skillPath: null,
      skillText: spec.skillText ?? null,
      governed: manifestText !== null
    });
  });
  return Object.freeze({
    root,
    loadedAt: null,
    packages: Object.freeze(packages),
    counts: Object.freeze({
      packages: packages.length,
      governed: packages.filter((p) => p.governed).length,
      ungoverned: packages.filter((p) => !p.governed).length,
      files: packages.reduce((n, p) => n + p.files.length, 0)
    })
  });
}

/** A well-formed manifest, used as the negative control in several checks. */
function goodManifest({ id = "SECB-SYNTH-001", name = "synth-good", version = "0.1.0", status = "candidate" } = {}) {
  return [
    `skill_id: ${id}`,
    `name: ${name}`,
    `version: ${version}`,
    `status: ${status}`,
    "classification:",
    "  risk_class: R0",
    "  mutation_class: M0",
    ""
  ].join("\n");
}

const UNGOVERNED_PACKAGE = {
  id: "governance.ungoverned-package",
  describe: "Flags a package directory that carries no manifest.yaml, so nothing declares its identity or authority ceiling.",

  run(corpus) {
    const ungoverned = corpus.packages.filter((p) => p.manifest === null);
    const scope = scopeOf(corpus, { examined: corpus.packages.length, skipped: 0, skipReason: "none" });

    if (ungoverned.length === 0) {
      return [noEvidence({
        check: this.id,
        examined: corpus.packages.length,
        methodLimits:
          "detects only the absence of a file literally named manifest.yaml at the package root; " +
          "a present-but-meaningless manifest is governance.identity-fields' concern, not this check's",
        scope
      })];
    }

    return ungoverned.map((p) => finding({
      check: this.id,
      pkg: p.name,
      // A directory has no line. Citing it here as a directory rather than
      // inventing a file:line is the honest form of AC-AUDIT-05: `file` stays
      // null precisely so no unresolvable citation reaches the report.
      file: null,
      line: null,
      verdict: VERDICT.VIOLATION,
      observation:
        `Package directory ${p.dir} contains no manifest.yaml. Nothing in the package declares a skill_id, ` +
        `version, classification or authority ceiling, so every statement the package makes about itself is ` +
        `unverifiable by construction. Cited as a directory: a directory has no line, so file and line are null ` +
        `rather than fabricated.`,
      evidence: {
        dir: p.dir,
        file_count: p.files.length,
        files: p.files.map((f) => f.rel),
        citation_form: "directory",
        scope
      }
    }));
  },

  selfTest() {
    const positive = UNGOVERNED_PACKAGE.run(synthCorpus([
      { name: "synth-ungoverned", manifestText: null, skillText: "# no manifest here" },
      { name: "synth-governed", manifestText: goodManifest() }
    ]));
    const negative = UNGOVERNED_PACKAGE.run(synthCorpus([
      { name: "synth-a", manifestText: goodManifest({ id: "SECB-SYNTH-A", name: "synth-a" }) },
      { name: "synth-b", manifestText: goodManifest({ id: "SECB-SYNTH-B", name: "synth-b" }) }
    ]));
    return {
      positive: { fired: fired(positive), detail: `one package without manifest.yaml -> ${summarise(positive)}` },
      negative: { fired: fired(negative), detail: `both packages carry manifest.yaml -> ${summarise(negative)}` }
    };
  }
};

const DUPLICATE_IDENTITY = {
  id: "governance.duplicate-identity",
  describe: "Flags two or more packages declaring the same skill_id, distinguishing a bare skill_id collision from a skill_id plus version collision.",

  run(corpus) {
    const { governed, scope } = governedSlice(corpus);

    const groups = new Map();
    for (const p of governed) {
      const id = p.manifest.values.skill_id;
      if (typeof id !== "string" || id === "") continue; // absent identity is governance.identity-fields' finding
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(p);
    }

    const out = [];
    for (const [id, members] of groups) {
      if (members.length < 2) continue;

      const versions = members.map((p) => {
        const v = p.manifest.values.version;
        return typeof v === "string" ? v : null;
      });
      const versionCollision = versions.some((v, i) => v !== null && versions.indexOf(v) !== i);
      // A skill_id+version collision is strictly worse: two packages claim not
      // just the same identity but the same immutable release of it.
      const kind = versionCollision ? "skill_id+version" : "skill_id";

      for (const p of members) {
        const idLine = topLevelKeyLine(p.manifestText, "skill_id");
        const verLine = topLevelKeyLine(p.manifestText, "version");
        const others = members.filter((m) => m !== p).map((m) => m.manifestPath);

        if (idLine === null) {
          // The reader produced a skill_id we cannot locate in the raw text.
          // That is a contradiction inside the evidence layer, not a governance
          // violation, and it must not be published as a citation that will not
          // resolve.
          out.push(finding({
            check: this.id,
            pkg: p.name,
            verdict: VERDICT.UNDECIDABLE,
            observation:
              `Package ${p.name} participates in a ${kind} collision on skill_id "${id}", but the top-level ` +
              `skill_id key could not be located in the manifest text, so no resolvable citation is available ` +
              `and the collision is reported without a file reference rather than with an unresolvable one.`,
            evidence: { skill_id: id, collision_kind: kind, colliding_manifests: others, scope }
          }));
          continue;
        }

        out.push(finding({
          check: this.id,
          pkg: p.name,
          file: p.manifestPath,
          line: idLine,
          verdict: VERDICT.VIOLATION,
          observation:
            `Package ${p.name} declares skill_id "${id}"${versionCollision && verLine !== null ? ` at version "${p.manifest.values.version}"` : ""}, ` +
            `which ${members.length - 1} other package(s) also declare (${kind} collision). ` +
            `Identity is what a resolver keys on, so two packages answering to the same key means a lookup ` +
            `cannot be shown to return the package it named. Colliding manifests: ${others.join(", ")}.`,
          evidence: {
            skill_id: id,
            version: typeof p.manifest.values.version === "string" ? p.manifest.values.version : null,
            collision_kind: kind,
            group_size: members.length,
            colliding_manifests: others,
            version_line: verLine,
            scope
          }
        }));
      }
    }

    if (out.length === 0) {
      return [noEvidence({
        check: this.id,
        examined: governed.length,
        methodLimits:
          "compares only the literal top-level skill_id string across packages that carry a readable manifest; " +
          "case variants, whitespace variants and semantically equivalent identities are NOT treated as collisions, " +
          "and packages with no manifest are outside this check entirely",
        scope
      })];
    }
    return out;
  },

  selfTest() {
    const positive = DUPLICATE_IDENTITY.run(synthCorpus([
      { name: "synth-dup-a", manifestText: goodManifest({ id: "SECB-SYNTH-DUP", name: "synth-dup-a", version: "0.1.0" }) },
      { name: "synth-dup-b", manifestText: goodManifest({ id: "SECB-SYNTH-DUP", name: "synth-dup-b", version: "0.1.0" }) },
      { name: "synth-unique", manifestText: goodManifest({ id: "SECB-SYNTH-UNIQ", name: "synth-unique" }) }
    ]));
    const negative = DUPLICATE_IDENTITY.run(synthCorpus([
      { name: "synth-a", manifestText: goodManifest({ id: "SECB-SYNTH-A", name: "synth-a" }) },
      { name: "synth-b", manifestText: goodManifest({ id: "SECB-SYNTH-B", name: "synth-b" }) },
      { name: "synth-ungoverned", manifestText: null }
    ]));
    return {
      positive: {
        fired: fired(positive),
        detail: `two packages share skill_id SECB-SYNTH-DUP at version 0.1.0 -> ${summarise(positive)}`
      },
      negative: {
        fired: fired(negative),
        detail: `distinct skill_ids plus one ungoverned package -> ${summarise(negative)}`
      }
    };
  }
};

const UNREADABLE_MANIFEST = {
  id: "governance.unreadable-manifest",
  describe: "Reports every manifest line the evidence layer could not represent, so unparsed content is visible instead of being silently treated as absent.",

  run(corpus) {
    const { governed, scope } = governedSlice(corpus);

    const out = [];
    for (const p of governed) {
      const lines = p.manifest.unreadable;
      if (lines.length === 0) continue;
      for (const u of lines) {
        out.push(finding({
          check: this.id,
          pkg: p.name,
          file: p.manifestPath,
          line: u.line,
          // UNDECIDABLE, not VIOLATION. The reader could not represent this
          // line, so no claim about its content is available in either
          // direction — asserting a violation here would be asserting knowledge
          // of content that was never read.
          verdict: VERDICT.UNDECIDABLE,
          observation:
            `Line ${u.line} of ${p.manifestPath} could not be represented by the evidence layer's shallow YAML ` +
            `reader (${u.reason ?? "reason unspecified"}), so its content is unknown to every check downstream. ` +
            `This is UNDECIDABLE rather than a violation: nothing was read, so nothing is contradicted. It is ` +
            `reported rather than dropped because treating unparsed content as absent content is exactly how a ` +
            `check stops being able to fail.`,
          evidence: {
            raw: u.text,
            reason: u.reason ?? null,
            unreadable_lines_in_manifest: lines.length,
            all_unreadable_lines: lines.map((x) => x.line),
            reader: "readShallowYaml",
            scope
          }
        }));
      }
    }

    if (out.length === 0) {
      return [noEvidence({
        check: this.id,
        examined: governed.length,
        methodLimits:
          "reports only lines readShallowYaml itself flagged — currently nesting deeper than two levels, a line " +
          "that is neither a key nor a sequence item, and a sequence item with no enclosing key; a line the reader " +
          "represented INCORRECTLY rather than not at all is invisible to this check, and packages with no " +
          "manifest are outside it",
        scope
      })];
    }
    return out;
  },

  selfTest() {
    // FIXTURE REBUILT. The original positive used `  allowed:` — a nested key
    // with an empty value — because the reader of the day could not represent
    // it. That defect is fixed (the reader now splits roles.allowed from
    // roles.prohibited_final_authority correctly), so that shape parses and the
    // old fixture would no longer fire. A positive control that stopped firing
    // is a check that can no longer fail, and a real-corpus zero is only
    // publishable alongside a control that still trips.
    //
    // Rebuilt on the three shapes the current reader genuinely cannot
    // represent, one line each, so the control also pins the reason strings.
    const positive = UNREADABLE_MANIFEST.run(synthCorpus([
      {
        name: "synth-unreadable",
        manifestText: [
          "- orphan",                   // sequence item with no enclosing key
          "skill_id: SECB-SYNTH-U",
          "name: synth-unreadable",
          "version: 0.1.0",
          "status: candidate",
          "this line is not yaml at all", // not a key or sequence item
          "meta:",
          "  release:",
          "    channel: stable",        // nesting deeper than two levels
          ""
        ].join("\n")
      }
    ]));

    // NEGATIVE STRENGTHENED. This is the arc42 shape verbatim — two levels with
    // nested sequences — i.e. the exact input that produced 110 spurious
    // findings before the reader was fixed. Using it as the negative control
    // means a regression of that defect fails this arm rather than passing
    // quietly.
    const negative = UNREADABLE_MANIFEST.run(synthCorpus([
      {
        name: "synth-clean",
        manifestText: [
          "skill_id: SECB-SYNTH-C",
          "name: synth-clean",
          "version: 0.1.0",
          "status: candidate",
          "roles:",
          "  allowed:",
          "  - ARCHI",
          "  prohibited_final_authority:",
          "  - SELF-APPROVAL",
          "classification:",
          "  risk_class: R0",
          ""
        ].join("\n")
      }
    ]));

    const reasons = [...new Set(positive.map((f) => f.evidence.reason))].sort();
    return {
      positive: {
        fired: fired(positive),
        detail:
          `manifest carrying all three shapes the reader cannot represent [${reasons.join("; ")}] -> ` +
          summarise(positive)
      },
      negative: {
        fired: fired(negative),
        detail: `arc42-shaped manifest, two levels with nested sequences -> ${summarise(negative)}`
      }
    };
  }
};

const IDENTITY_FIELDS_CHECK = {
  id: "governance.identity-fields",
  describe: "Flags a manifest missing skill_id, name, version or status, separating a field that is genuinely absent from one an unreadable line could plausibly hold.",

  run(corpus) {
    const { governed, scope } = governedSlice(corpus);

    const out = [];
    for (const p of governed) {
      const values = p.manifest.values;
      const unreadable = p.manifest.unreadable;

      for (const field of IDENTITY_FIELDS) {
        const value = values[field];
        if (typeof value === "string" && value !== "") continue;

        const keyLine = topLevelKeyLine(p.manifestText, field);

        // Case 1: the key is present but carries no scalar. Decidable, and the
        // offending line is citable exactly.
        if (keyLine !== null) {
          out.push(finding({
            check: this.id,
            pkg: p.name,
            file: p.manifestPath,
            line: keyLine,
            verdict: VERDICT.VIOLATION,
            observation:
              `Manifest ${p.manifestPath} declares required identity field "${field}" at line ${keyLine} but ` +
              `binds no scalar value to it (read as ${JSON.stringify(value ?? null)}). A declared-but-empty ` +
              `identity field is not an identity.`,
            evidence: { field, failure: "declared_without_scalar", read_as: value ?? null, scope }
          }));
          continue;
        }

        // Case 2: the field is nowhere in the parsed values AND an unreadable
        // line mentions it by name. The honest answer is that we do not know:
        // the reader may have failed on the very line that declares it.
        const candidates = unreadable.filter((u) => u.text.toLowerCase().includes(field.toLowerCase()));
        if (candidates.length > 0) {
          const cite = candidates[0];
          out.push(finding({
            check: this.id,
            pkg: p.name,
            file: p.manifestPath,
            line: cite.line,
            verdict: VERDICT.UNDECIDABLE,
            observation:
              `Required identity field "${field}" is absent from the parsed values of ${p.manifestPath}, but ` +
              `line ${cite.line} could not be read and mentions "${field}" in its raw text. The field may be ` +
              `declared on a line the reader failed on, so this is UNDECIDABLE rather than a violation — ` +
              `reporting it as absent would be claiming knowledge of a line that was never parsed.`,
            evidence: {
              field,
              failure: "unparsed_line_may_declare_field",
              candidate_lines: candidates.map((u) => u.line),
              raw: cite.text,
              unreadable_lines_in_manifest: unreadable.length,
              scope
            }
          }));
          continue;
        }

        // Case 3: absent, with no unreadable line that could plausibly hold it.
        // An absent field has no line of its own, so the citation is file-level
        // and anchored at line 1 under a stated convention — line 1 is where
        // the file begins, not a claim that the field belongs there.
        out.push(finding({
          check: this.id,
          pkg: p.name,
          file: p.manifestPath,
          line: 1,
          verdict: VERDICT.VIOLATION,
          observation:
            `Required identity field "${field}" appears nowhere in ${p.manifestPath}. ` +
            (unreadable.length > 0
              ? `The reader could not represent ${unreadable.length} line(s) of this manifest; none of them mentions ` +
                `"${field}", so the field is reported as absent rather than unknown, and that residual is stated here ` +
                `rather than assumed away. `
              : `Every line of this manifest was readable, so the absence is decidable. `) +
            `Citation is file-level and anchored at line 1: an absent field has no line of its own, and line 1 is ` +
            `the start of the cited file, not a claim about where the field should be.`,
          evidence: {
            field,
            failure: "absent",
            citation_convention: "file-level, anchored at line 1 because an absent field has no line",
            unreadable_lines_in_manifest: unreadable.length,
            unreadable_lines: unreadable.map((u) => u.line),
            scope
          }
        }));
      }
    }

    if (out.length === 0) {
      return [noEvidence({
        check: this.id,
        examined: governed.length,
        methodLimits:
          `checks presence and non-emptiness of the top-level scalars ${IDENTITY_FIELDS.join(", ")} only; ` +
          "it does NOT check that any value is well-formed, unique, or true, and packages with no manifest are outside it",
        scope
      })];
    }
    return out;
  },

  selfTest() {
    const positive = IDENTITY_FIELDS_CHECK.run(synthCorpus([
      {
        name: "synth-missing-version",
        // Two decidable arms in one package: `version` is absent with every
        // line readable (Case 3), and `status` is declared with no scalar
        // bound to it (Case 1).
        manifestText: [
          "skill_id: SECB-SYNTH-M",
          "name: synth-missing-version",
          "status:",
          "classification:",
          "  risk_class: R0",
          ""
        ].join("\n")
      },
      {
        name: "synth-undecidable-version",
        // The UNDECIDABLE arm (Case 2): no top-level `version`, but line 5 is
        // a shape the reader cannot represent AND its raw text names the
        // missing field. Absent-from-the-parse is not absent-from-the-file.
        //
        // Rebuilt alongside the unreadable-manifest fixture: this used to be
        // `metadata:` / `  version:`, which the current reader parses fine.
        // Depth-3 nesting is the shape it still cannot represent.
        manifestText: [
          "skill_id: SECB-SYNTH-N",
          "name: synth-undecidable-version",
          "status: candidate",
          "metadata:",
          "  release:",
          "    version: 0.1.0",
          ""
        ].join("\n")
      }
    ]));
    const negative = IDENTITY_FIELDS_CHECK.run(synthCorpus([
      { name: "synth-complete", manifestText: goodManifest({ id: "SECB-SYNTH-OK", name: "synth-complete" }) }
    ]));
    return {
      positive: {
        fired: fired(positive),
        detail:
          `one manifest with version absent and status declared without a scalar, one with version only on an ` +
          `unreadable line -> ${summarise(positive)}`
      },
      negative: {
        fired: fired(negative),
        detail: `manifest declaring all four identity fields as scalars -> ${summarise(negative)}`
      }
    };
  }
};

export const CHECKS = Object.freeze([
  UNGOVERNED_PACKAGE,
  DUPLICATE_IDENTITY,
  UNREADABLE_MANIFEST,
  IDENTITY_FIELDS_CHECK
]);
