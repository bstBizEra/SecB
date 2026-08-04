import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import test from "node:test";

import { VERDICT, loadCorpus } from "../src/audit/corpus.mjs";
import { EXPECTED_CORPUS, independentCounts } from "../src/audit/corpus-expectation.mjs";
import { CHECKS, deriveExpectedSections, synthCorpus, synthPackage } from "../src/audit/checks-declaration.mjs";

const REPO = resolve(import.meta.dirname, "..");
const SKILLS = join(REPO, ".agents", "skills");

// The section set the work package was written against, recorded here as an
// independent claim so the test can report whether the corpus still agrees with
// it rather than silently adopting whatever the corpus happens to say today.
const OBSERVED_SECTIONS = [
  "authority boundary", "required inputs", "workflow", "required outputs",
  "evidence and reasoning discipline", "completion gate", "supporting files"
];

function tally(findings) {
  return findings.reduce((acc, f) => { acc[f.verdict] = (acc[f.verdict] ?? 0) + 1; return acc; }, { VIOLATION: 0, NO_EVIDENCE: 0, UNDECIDABLE: 0 });
}

// ---------------------------------------------------------------------------
// Read-only proof (AC-AUDIT-07)
// ---------------------------------------------------------------------------

/** Content digest plus the sorted file inventory. Both, because a digest over
 *  contents alone cannot see a file added or removed. */
function treeState(dir) {
  const files = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = join(d, e.name);
      if (e.isDirectory()) walk(abs);
      else if (e.isFile()) files.push({ rel: abs.slice(dir.length + 1).split(sep).join("/"), size: statSync(abs).size, sha256: createHash("sha256").update(readFileSync(abs)).digest("hex") });
    }
  };
  walk(dir);
  return {
    count: files.length,
    inventory: files.map((f) => f.rel).join("\n"),
    digest: createHash("sha256").update(files.map((f) => `${f.rel}:${f.size}:${f.sha256}`).join("\n")).digest("hex")
  };
}

function gitStatus() {
  try {
    return execFileSync("git", ["status", "--porcelain", "--", ".agents"], { cwd: REPO, encoding: "utf8" });
  } catch {
    return "<git-unavailable>";
  }
}

// ---------------------------------------------------------------------------
// Module contract
// ---------------------------------------------------------------------------

test("CHECKS matches the shared module contract", () => {
  assert.ok(Array.isArray(CHECKS) && CHECKS.length === 3, "expected three checks");
  const ids = CHECKS.map((c) => c.id);
  assert.deepEqual(ids, [
    "declaration.structural-conformance",
    "declaration.mutation-class-exceeded",
    "declaration.authority-boundary-consistency"
  ]);
  for (const check of CHECKS) {
    assert.equal(typeof check.describe, "string");
    assert.ok(check.describe.length > 20, `${check.id}: describe is too short to say anything`);
    assert.equal(check.describe.trim().split(/(?<=\.)\s+/).filter(Boolean).length, 1, `${check.id}: describe must be one sentence`);
    assert.equal(typeof check.run, "function");
    assert.equal(typeof check.selfTest, "function");
  }
});

// ---------------------------------------------------------------------------
// AC-AUDIT-02 — both arms, for every check
// ---------------------------------------------------------------------------

const selfTestResults = new Map();

test("every check fires on its positive control and stays silent on its negative", (t) => {
  for (const check of CHECKS) {
    const result = check.selfTest();
    selfTestResults.set(check.id, result);

    assert.ok(result && result.positive && result.negative, `${check.id}: selfTest must return both arms`);
    assert.equal(typeof result.positive.fired, "boolean");
    assert.equal(typeof result.negative.fired, "boolean");

    assert.equal(result.positive.fired, true,
      `${check.id}: positive control did NOT fire. A check that cannot produce a VIOLATION must be fixed or deleted, never shipped — shipping it would make every zero it reports unfalsifiable.`);
    assert.equal(result.negative.fired, false,
      `${check.id}: negative control fired. A check that fires on conformant text inflates violation counts and destroys the meaning of the positive arm.`);

    assert.ok(result.positive.detail.violations > 0, `${check.id}: positive arm reports fired but no violations`);
    assert.equal(result.negative.detail.violations, 0, `${check.id}: negative arm reports not-fired but has violations`);

    t.diagnostic(`${check.id} positive: ${result.positive.detail.violations} violation(s) — ${result.positive.detail.input}`);
    t.diagnostic(`${check.id} negative: ${result.negative.detail.violations} violation(s) — ${result.negative.detail.input}`);
  }
});

// ---------------------------------------------------------------------------
// The mutation probe's original three control strings
// ---------------------------------------------------------------------------

const MUTATION_CHECK = CHECKS.find((c) => c.id === "declaration.mutation-class-exceeded");

function m0Package(name, workflowLine) {
  return synthPackage({
    name,
    manifest: [
      `skill_id: SECB-TEST-${name}`, `name: ${name}`, "version: 0.1.0", "status: candidate",
      "classification:", "  risk_class: R0", "  mutation_class: M0", "  authority_ceiling: A1",
      "roles:", "  allowed:", "  - ARCHI", "  prohibited_final_authority:", "  - SELF-APPROVAL",
      "controls:", "  repository_mutation: prohibited", "  approval_claims: prohibited"
    ].join("\n"),
    skill: ["---", `name: ${name}`, "description: A synthetic package used as a control.", "---", "",
      `# ${name}`, "", "## Workflow", "", `1. ${workflowLine}`].join("\n")
  });
}

test("the original probe's three control strings still behave as the probe proved", (t) => {
  const cases = [
    { text: "Write the file to disk.", expect: VERDICT.VIOLATION },
    { text: "You may modify a config as needed.", expect: VERDICT.VIOLATION },
    { text: "Analyse the architecture only.", expect: VERDICT.NO_EVIDENCE }
  ];
  for (const [i, c] of cases.entries()) {
    const findings = MUTATION_CHECK.run(synthCorpus([m0Package(`ctrl-${i}`, c.text)]));
    assert.equal(findings.length, 1, `control "${c.text}" produced ${findings.length} findings`);
    assert.equal(findings[0].verdict, c.expect, `control "${c.text}" expected ${c.expect}, got ${findings[0].verdict}`);
    t.diagnostic(`control "${c.text}" -> ${findings[0].verdict}`);
  }
});

test("the mutation check is not fooled by prohibitions, nominal uses, or compound adjectives", () => {
  const traps = [
    "Do not mutate the target repository, grant authority, or waive findings.",
    "Define deliverables, explicit exclusions, declared write sets when applicable, and acceptance criteria.",
    "Use when asynchronous coordination or append-only history is required.",
    "Never modify the target.",
    "Validate consistency across views and add a legend and source references.",
    "Creates C4 system context, container, component, dynamic, deployment, or landscape views."
  ];
  for (const [i, text] of traps.entries()) {
    const findings = MUTATION_CHECK.run(synthCorpus([m0Package(`trap-${i}`, text)]));
    assert.equal(findings.length, 1, `trap "${text}" produced ${findings.length} findings`);
    assert.equal(findings[0].verdict, VERDICT.NO_EVIDENCE,
      `trap "${text}" produced ${findings[0].verdict} — this is language a naive matcher misreads, and misreading it is what makes a violation count meaningless`);
  }
});

// ---------------------------------------------------------------------------
// The third verdict — UNDECIDABLE must also be reachable
// ---------------------------------------------------------------------------

test("declaration.structural-conformance reaches UNDECIDABLE rather than inventing violations", () => {
  const check = CHECKS[0];
  const conformant = (n) => synthPackage({
    name: `ok-${n}`,
    manifest: `name: ok-${n}\nclassification:\n  mutation_class: M0\n`,
    skill: `# ok-${n}\n\n${OBSERVED_SECTIONS.map((s) => `## ${s}\n\nbody\n`).join("\n")}`
  });
  const base = Array.from({ length: 9 }, (_, i) => conformant(i));

  // Same labels, different depth. Reporting seven missing sections here would be
  // an artefact of the comparison, not a fact about the package.
  const depth = synthPackage({
    name: "pkg-depth",
    manifest: "name: pkg-depth\nclassification:\n  mutation_class: M0\n",
    skill: `# pkg-depth\n\n${OBSERVED_SECTIONS.map((s) => `### ${s}\n\nbody\n`).join("\n")}`
  });
  const depthFindings = check.run(synthCorpus([...base, depth])).filter((f) => f.pkg === "pkg-depth");
  assert.equal(depthFindings.length, 1);
  assert.equal(depthFindings[0].verdict, VERDICT.UNDECIDABLE);
  assert.equal(depthFindings[0].evidence.reason, "heading-depth-differs");

  // Entirely different organising scheme.
  const alien = synthPackage({
    name: "pkg-alien",
    manifest: "name: pkg-alien\nclassification:\n  mutation_class: M0\n",
    skill: "# pkg-alien\n\n## Purpose\n\nbody\n\n## Usage\n\nbody\n"
  });
  const alienFindings = check.run(synthCorpus([...base, alien])).filter((f) => f.pkg === "pkg-alien");
  assert.equal(alienFindings.length, 1);
  assert.equal(alienFindings[0].verdict, VERDICT.UNDECIDABLE);
  assert.equal(alienFindings[0].evidence.reason, "no-shared-vocabulary");

  // Too few packages to derive a majority at all.
  const tiny = check.run(synthCorpus([conformant(0), conformant(1)]));
  assert.equal(tiny.length, 1);
  assert.equal(tiny[0].verdict, VERDICT.UNDECIDABLE);
  assert.equal(tiny[0].evidence.reason, "corpus-too-small-to-derive");
});

test("declaration.mutation-class-exceeded reaches UNDECIDABLE for ambiguous objects and unknown classes", () => {
  const ambiguous = MUTATION_CHECK.run(synthCorpus([m0Package("amb", "Generate the artefact for the reviewing role.")]));
  assert.equal(ambiguous.length, 1);
  assert.equal(ambiguous[0].verdict, VERDICT.UNDECIDABLE);
  assert.equal(ambiguous[0].evidence.trigger, "unclassified-object");

  const higher = synthPackage({
    name: "pkg-m1",
    manifest: "name: pkg-m1\nclassification:\n  mutation_class: M1\n",
    skill: "---\nname: pkg-m1\n---\n\n# pkg-m1\n\n## Workflow\n\n1. Write the file to disk.\n"
  });
  const m1 = MUTATION_CHECK.run(synthCorpus([higher]));
  assert.equal(m1.length, 1);
  assert.equal(m1[0].verdict, VERDICT.UNDECIDABLE);
  assert.equal(m1[0].evidence.reason, "no-ruleset-for-class",
    "a package outside this check's ruleset must be reported as uncovered, not silently dropped (AC-AUDIT-06)");
});

test("declaration.authority-boundary-consistency refuses a roles block it cannot trust", () => {
  const check = CHECKS[2];

  // The exact shape readShallowYaml used to emit: both sequences collapsed into
  // the parent key, so SELF-APPROVAL would read as an ALLOWED role. If the
  // reader ever regresses, this check must refuse rather than invert a
  // prohibition into a permission.
  const collapsed = synthPackage({
    name: "pkg-collapsed",
    manifestOverride: {
      values: {
        roles: ["ARCHI", "REV", "GOV", "A5-GOVERNANCE-ROOT", "SELF-APPROVAL", "SELF-PROMOTION"],
        "classification.authority_ceiling": "A2",
        "controls.approval_claims": "prohibited"
      },
      unreadable: []
    },
    skill: "---\nname: pkg-collapsed\n---\n\n# pkg-collapsed\n\n## Authority boundary\n\nYou may approve the decision.\n"
  });
  const findings = check.run(synthCorpus([collapsed]));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].verdict, VERDICT.UNDECIDABLE);
  assert.equal(findings[0].evidence.reason, "roles-parent-populated");

  // An assertion the manifest neither permits nor prohibits.
  const unmapped = synthPackage({
    name: "pkg-unmapped",
    manifest: [
      "name: pkg-unmapped", "classification:", "  authority_ceiling: A2",
      "roles:", "  allowed:", "  - ARCHI", "  prohibited_final_authority:", "  - SELF-PROMOTION",
      "controls:", "  approval_claims: permitted"
    ].join("\n"),
    skill: "---\nname: pkg-unmapped\n---\n\n# pkg-unmapped\n\n## Authority boundary\n\nYou may approve the design review.\n"
  });
  const un = check.run(synthCorpus([unmapped]));
  assert.equal(un.length, 1);
  assert.equal(un[0].verdict, VERDICT.UNDECIDABLE);
});

test("declaration.authority-boundary-consistency treats silence as NO_EVIDENCE, never as a pass", () => {
  const silent = synthPackage({
    name: "pkg-silent",
    manifest: [
      "name: pkg-silent", "classification:", "  authority_ceiling: A1",
      "roles:", "  allowed:", "  - ARCHI", "  prohibited_final_authority:", "  - SELF-APPROVAL",
      "controls:", "  approval_claims: prohibited"
    ].join("\n"),
    skill: "---\nname: pkg-silent\n---\n\n# pkg-silent\n\n## Workflow\n\n1. Summarise the decision.\n"
  });
  const findings = CHECKS[2].run(synthCorpus([silent]));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].verdict, VERDICT.NO_EVIDENCE);
  assert.equal(findings[0].evidence.reason, "authority-section-absent");
  assert.match(findings[0].observation, /not a pass|Silence is not agreement/i);
});

test("a package naming an authority level above its manifest ceiling is a VIOLATION", () => {
  const overreach = synthPackage({
    name: "pkg-ceiling",
    manifest: [
      "name: pkg-ceiling", "classification:", "  authority_ceiling: A2",
      "roles:", "  allowed:", "  - ARCHI", "  prohibited_final_authority:", "  - A5-GOVERNANCE-ROOT",
      "controls:", "  approval_claims: prohibited"
    ].join("\n"),
    skill: "---\nname: pkg-ceiling\n---\n\n# pkg-ceiling\n\n## Authority boundary\n\nYou may act at A4 when the decision owner is unavailable.\n"
  });
  const findings = CHECKS[2].run(synthCorpus([overreach]));
  const v = findings.filter((f) => f.verdict === VERDICT.VIOLATION);
  assert.ok(v.length >= 1);
  assert.ok(v.some((f) => f.evidence.trigger === "ceiling-exceeded"));
});

// ---------------------------------------------------------------------------
// The derived section set (reported, and compared against what was observed)
// ---------------------------------------------------------------------------

test("the expected section set is derived from the corpus and matches what was observed", (t) => {
  const corpus = loadCorpus(SKILLS);
  const derived = deriveExpectedSections(corpus);

  assert.equal(derived.ok, true, "no expected section set could be derived");
  const labels = derived.expected.map((e) => e.label);

  t.diagnostic(`derived from ${derived.sampled} governed packages, majority threshold ${derived.threshold}`);
  for (const e of derived.expected) t.diagnostic(`  ${e.count}/${derived.sampled}  ${e.label}`);

  assert.deepEqual(labels, OBSERVED_SECTIONS,
    `derived section set differs from the set recorded in the work package.\n  derived:  ${JSON.stringify(labels)}\n  observed: ${JSON.stringify(OBSERVED_SECTIONS)}`);

  // The derivation is unanimous, not merely a majority. Recorded because it
  // changes how much the check can find: with 22/22 agreement there is no
  // minority variant for the check to catch, so its real-corpus zero is a
  // property of the corpus rather than evidence of the check working.
  assert.ok(derived.expected.every((e) => e.count === derived.sampled),
    "expected some sections below unanimity; if this fails the corpus has drifted and the zero below means something different");
  assert.equal(derived.tally.length, OBSERVED_SECTIONS.length,
    "a level-2 heading exists in the corpus that is not part of the shared set");
});

// ---------------------------------------------------------------------------
// AC-AUDIT-07 — the real run, with the read-only proof wrapped around it
// ---------------------------------------------------------------------------

test("the full run over the real corpus leaves .agents/ byte-identical", (t) => {
  const before = treeState(SKILLS);
  const gitBefore = gitStatus();

  const corpus = loadCorpus(SKILLS);
  for (const check of CHECKS) check.run(corpus);

  const after = treeState(SKILLS);
  const gitAfter = gitStatus();

  assert.equal(after.digest, before.digest, ".agents/skills content changed during the audit run");
  assert.equal(after.inventory, before.inventory, ".agents/skills gained or lost a file during the audit run");
  assert.equal(after.count, before.count);
  assert.equal(gitAfter, gitBefore, "git reports a change under .agents/ that the audit run introduced");

  t.diagnostic(`.agents/skills unchanged: ${before.count} files, digest ${before.digest.slice(0, 16)}…`);
  t.diagnostic(`git status under .agents/: ${gitBefore.trim() === "" ? "clean, before and after" : JSON.stringify(gitBefore.trim())}`);
});

// ---------------------------------------------------------------------------
// AC-AUDIT-02 / AC-AUDIT-04 / AC-AUDIT-06 — real-corpus counts, and the rule
// that a zero is only publishable alongside a firing positive control
// ---------------------------------------------------------------------------

test("real-corpus counts are recorded, and every zero is accompanied by proof the check can fire", (t) => {
  const corpus = loadCorpus(SKILLS);

  t.diagnostic(`corpus: ${corpus.counts.packages} packages, ${corpus.counts.governed} governed, ${corpus.counts.ungoverned} ungoverned, ${corpus.counts.files} files`);
  t.diagnostic(`ungoverned and therefore outside these three checks: ${corpus.packages.filter((p) => !p.governed).map((p) => p.name).join(", ")}`);

  // Two assertions doing two different jobs, where there used to be one
  // hardcoded triple that did neither well and made the audit unextractable.
  //
  // First: does the loader COUNT CORRECTLY? Checked against a second count taken
  // through plain fs rather than through the loader itself. This holds on any
  // corpus, which is what lets this suite run on main.
  const independent = independentCounts(SKILLS);
  assert.deepEqual(
    {
      packages: corpus.counts.packages,
      governed: corpus.counts.governed,
      ungoverned: corpus.counts.ungoverned
    },
    {
      packages: independent.packages,
      governed: independent.governed,
      ungoverned: independent.ungoverned
    },
    "the audit's counts disagree with an independent walk of the same directory"
  );

  // Second: has the corpus MOVED? The tripwire the old triple was really for,
  // kept but made portable — it now lives in a file that travels with the
  // corpus, so extracting this audit to main means updating that file in the
  // extraction commit rather than editing an assertion during a rebase.
  assert.deepEqual(
    {
      packages: corpus.counts.packages,
      governed: corpus.counts.governed,
      ungoverned: corpus.counts.ungoverned,
      ungovernedNames: corpus.packages.filter((p) => !p.governed).map((p) => p.name).sort()
    },
    {
      packages: EXPECTED_CORPUS.packages,
      governed: EXPECTED_CORPUS.governed,
      ungoverned: EXPECTED_CORPUS.ungoverned,
      ungovernedNames: [...EXPECTED_CORPUS.ungovernedNames].sort()
    },
    "corpus moved off the recorded expectation — update src/audit/corpus-expectation.mjs in the same commit as the corpus change, deliberately"
  );

  for (const check of CHECKS) {
    const findings = check.run(corpus);
    const counts = tally(findings);
    const self = selfTestResults.get(check.id) ?? check.selfTest();

    t.diagnostic(`${check.id}: VIOLATION=${counts.VIOLATION} NO_EVIDENCE=${counts.NO_EVIDENCE} UNDECIDABLE=${counts.UNDECIDABLE} (total ${findings.length})`);

    if (counts.VIOLATION === 0) {
      assert.equal(self.positive.fired, true,
        `${check.id} reports zero violations across the real corpus. That number is publishable only because its positive control fires — and it does not.`);
      t.diagnostic(`  zero violations is claimable: positive control fired with ${self.positive.detail.violations} violation(s)`);
    }

    // AC-AUDIT-06: every governed package is accounted for by every check that
    // scopes to governed packages, so a zero cannot be a coverage gap in disguise.
    if (check.id !== "declaration.structural-conformance") {
      const covered = new Set(findings.map((f) => f.pkg));
      assert.equal(covered.size, corpus.counts.governed,
        `${check.id} emitted findings for ${covered.size} of ${corpus.counts.governed} governed packages; a package with no finding at all is silent truncation`);
    }

    // AC-AUDIT-04: no finding may be rendered as a binary pass. The test must
    // distinguish a CLAIM of cleanliness from a DENIAL of it — "this is NOT a
    // statement that the package is clean" is the sentence the criterion wants
    // present, and an assertion that banned the word outright would forbid the
    // very disclaimer it exists to require.
    for (const f of findings) {
      assert.ok(Object.values(VERDICT).includes(f.verdict));
      for (const m of f.observation.matchAll(/\b(passed|passes|clean|compliant|conformant|no violations)\b/gi)) {
        const preceding = f.observation.slice(Math.max(0, m.index - 60), m.index);
        assert.match(preceding, /\b(not|never|no|neither|rather than)\b/i,
          `${check.id} asserts pass/clean language without negating it: "…${f.observation.slice(Math.max(0, m.index - 60), m.index + 40)}…"`);
      }
    }
  }
});

test("structural conformance covers all 22 governed packages even when it emits nothing", (t) => {
  const corpus = loadCorpus(SKILLS);
  const findings = CHECKS[0].run(corpus);
  const derived = deriveExpectedSections(corpus);

  // This check emits no NO_EVIDENCE by design: a heading either is or is not in
  // the document, so its silence is a decided result rather than an unobserved
  // one. The coverage claim is therefore made here, explicitly, instead of being
  // inferred from a finding count of zero.
  const governed = corpus.packages.filter((p) => p.governed);
  const nonConformant = governed.filter((p) => {
    const l2 = (p.skillText ?? "").split(/\r?\n/).filter((l) => /^##\s/.test(l)).map((l) => l.replace(/^##\s+/, "").trim().toLowerCase());
    return !derived.expected.every((e) => l2.includes(e.label));
  });

  assert.equal(nonConformant.length, findings.filter((f) => f.verdict === VERDICT.VIOLATION).length > 0 ? nonConformant.length : 0,
    "independent recount disagrees with the check");
  assert.equal(findings.length, 0);
  assert.equal(nonConformant.length, 0);
  t.diagnostic(`structural conformance: ${governed.length}/${governed.length} governed packages carry all ${derived.expected.length} expected sections; an independent recount agrees`);
});

// ---------------------------------------------------------------------------
// AC-AUDIT-05 and AC-AUDIT-08 — finding shape
// ---------------------------------------------------------------------------

test("every citation resolves at the audited ref, and no finding carries a disposition", () => {
  const corpus = loadCorpus(SKILLS);
  const synthetic = CHECKS.flatMap((c) => {
    const r = c.selfTest();
    return [r.positive, r.negative];
  });
  assert.equal(synthetic.length, 6);

  const all = CHECKS.flatMap((c) => c.run(corpus));
  assert.ok(all.length > 0);

  const DISPOSITION_FIELDS = ["disposition", "approval", "approved", "status", "severity", "accepted", "waived", "closed", "authorized", "decision", "ruling"];

  for (const f of all) {
    for (const field of DISPOSITION_FIELDS) {
      assert.equal(Object.hasOwn(f, field), false, `finding carries a ${field} field, which a reader could mistake for a ruling (AC-AUDIT-08)`);
    }
    assert.deepEqual(Object.keys(f).sort(), ["check", "evidence", "file", "line", "observation", "pkg", "verdict"]);
    assert.ok(Object.isFrozen(f));

    if (f.file !== null) {
      assert.ok(Number.isInteger(f.line) && f.line >= 1, `${f.check} cites ${f.file} without a 1-indexed line`);
      const lines = readFileSync(f.file, "utf8").split(/\r?\n/);
      assert.ok(f.line <= lines.length, `${f.check} cites ${f.file}:${f.line}, past the end of a ${lines.length}-line file`);
      assert.ok(lines[f.line - 1].trim().length > 0, `${f.check} cites ${f.file}:${f.line}, which is a blank line`);
    }
    // AC-AUDIT-03: the finding carries the content digest it was derived
    // against, so a reviewer can tell which bytes produced it.
    assert.equal(typeof f.evidence.ref, "string");
    assert.ok(f.evidence.ref.length > 0);
  }
});

test("the epistemic limit of reading instruction text is stated in the findings themselves", () => {
  const corpus = loadCorpus(SKILLS);
  const mutation = MUTATION_CHECK.run(corpus);
  const noEvidence = mutation.filter((f) => f.verdict === VERDICT.NO_EVIDENCE);
  assert.ok(noEvidence.length > 0);

  for (const f of noEvidence) {
    assert.match(f.observation, /NOT a statement that the package is clean/,
      "a NO_EVIDENCE finding must say in its own text that it is not a pass, because that is the sentence a summariser will copy");
    assert.match(f.observation, /cannot prove absence|says nothing at all about what an agent/,
      "a NO_EVIDENCE finding must state why absence was not proven");
  }

  // The positive control's VIOLATION text must be equally honest about being an
  // inference over language rather than an observation of behaviour.
  const positive = MUTATION_CHECK.selfTest().positive;
  assert.ok(positive.fired);
  const violations = MUTATION_CHECK.run(synthCorpus([m0Package("epi", "Write the file to disk.")])).filter((f) => f.verdict === VERDICT.VIOLATION);
  assert.equal(violations.length, 1);
  assert.match(violations[0].observation, /claim about what the text asks for|not proof|instruction text/i);
});
