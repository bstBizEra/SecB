import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import test from "node:test";

import { CORPUS_ROOT, VERDICT, loadCorpus, readShallowYaml } from "../src/audit/corpus.mjs";
import { EXPECTED_CORPUS, independentCounts } from "../src/audit/corpus-expectation.mjs";
import {
  CHECKS,
  casesYaml,
  evalFacts,
  isMechanicallyUndecidable,
  parseCasesFile,
  satisfiedByEmptyOutput,
  synthCorpus,
  synthPackage
} from "../src/audit/checks-evals.mjs";

const REPO = resolve(import.meta.dirname, "..");
const SKILLS_ROOT = join(REPO, CORPUS_ROOT);
const AGENTS_ROOT = join(REPO, ".agents");

const corpus = loadCorpus(SKILLS_ROOT);
const findingsByCheck = new Map(CHECKS.map((c) => [c.id, c.run(corpus)]));
const allFindings = [...findingsByCheck.values()].flat();

function of(id) {
  return findingsByCheck.get(id);
}
function count(id, verdict) {
  return of(id).filter((f) => f.verdict === verdict).length;
}
// The corpus-level summary is the finding attributed to no single package.
function summaryOf(id) {
  const s = of(id).filter((f) => f.pkg === null);
  assert.equal(s.length, 1, `${id} should emit exactly one corpus-level summary finding`);
  return s[0];
}

// ---------------------------------------------------------------------------
// Module contract
// ---------------------------------------------------------------------------

test("CHECKS matches the shared module contract", () => {
  assert.ok(Array.isArray(CHECKS) && CHECKS.length === 4);
  const ids = CHECKS.map((c) => c.id);
  assert.deepEqual(ids, [
    "evals.expectation-diversity",
    "evals.negative-case-cannot-fail",
    "evals.undecidable-expectation",
    "evals.missing-eval-coverage"
  ]);
  assert.equal(new Set(ids).size, ids.length, "check ids must be unique");
  for (const c of CHECKS) {
    assert.equal(typeof c.describe, "string");
    assert.ok(c.describe.length > 20, `${c.id} describe must be a sentence`);
    assert.equal(typeof c.run, "function");
    assert.equal(typeof c.selfTest, "function");
  }
});

test("the corpus.mjs contract this module consumes still holds", () => {
  // corpus.mjs is a shared foundation edited by other work in parallel. These
  // checks depend on exactly three things from it; pin them so a change to the
  // foundation fails loudly here instead of silently degrading a check into
  // reporting "absent" for content it never read.
  const manifestText = readFileSync(join(SKILLS_ROOT, "architecture-intake-framing", "manifest.yaml"), "utf8");
  const parsed = readShallowYaml(manifestText);
  assert.ok(Array.isArray(parsed.unreadable), "readShallowYaml must report what it could not read");
  assert.equal(typeof parsed.values, "object");
  assert.equal(parsed.values["evaluation.suite"], "evals/cases.yaml",
    "evals.missing-eval-coverage reads the evaluation claim from this exact key");
  const pkg = corpus.packages.find((p) => p.name === "architecture-intake-framing");
  assert.equal(pkg.governed, true);
  assert.equal(typeof pkg.manifestText, "string");
  assert.ok(pkg.files.some((f) => f.rel === "architecture-intake-framing/evals/cases.yaml"));
});

test("findings carry no disposition, approval, status, or severity field", () => {
  const forbidden = ["disposition", "approval", "approved", "status", "severity", "priority", "ruling"];
  assert.ok(allFindings.length > 0);
  for (const f of allFindings) {
    for (const key of forbidden) {
      assert.ok(!(key in f), `finding from ${f.check} carries forbidden field "${key}"`);
      assert.ok(!(key in f.evidence), `evidence from ${f.check} carries forbidden field "${key}"`);
    }
    assert.ok(Object.values(VERDICT).includes(f.verdict));
  }
});

test("every finding naming a file carries a resolvable 1-indexed line", () => {
  let cited = 0;
  for (const f of allFindings) {
    if (f.file === null) {
      assert.equal(f.line, null, `${f.check} emitted a line without a file`);
      continue;
    }
    cited += 1;
    assert.ok(Number.isInteger(f.line) && f.line >= 1, `${f.check} cites ${f.file} with line ${f.line}`);
    const text = readFileSync(join(SKILLS_ROOT, f.file), "utf8");
    const lines = text.split(/\r?\n/);
    assert.ok(f.line <= lines.length, `${f.check} cites ${f.file}:${f.line} beyond EOF (${lines.length} lines)`);
  }
  assert.ok(cited > 0, "the run must produce at least one file-cited finding");
});

// ---------------------------------------------------------------------------
// selfTest — both arms, every check
// ---------------------------------------------------------------------------

for (const check of CHECKS) {
  test(`selfTest fires on the positive arm and stays silent on the negative arm: ${check.id}`, () => {
    const st = check.selfTest();
    assert.ok(st && st.positive && st.negative, `${check.id} selfTest must return both arms`);
    assert.equal(st.positive.fired, true, `${check.id} cannot fire on its own positive fixture: ${st.positive.detail}`);
    assert.equal(st.negative.fired, false, `${check.id} fires on its own negative fixture: ${st.negative.detail}`);
    assert.equal(typeof st.positive.detail, "string");
    assert.equal(typeof st.negative.detail, "string");
    assert.ok(st.positive.detail.length > 0 && st.negative.detail.length > 0);
  });
}

// ---------------------------------------------------------------------------
// Figures re-derived from the REAL corpus. These are the numbers the project
// has to keep answering; every one below was computed by running the checks,
// not copied from any prior analysis.
// ---------------------------------------------------------------------------

test("corpus shape", () => {
  // The shape assertion lives in src/audit/corpus-expectation.mjs so it travels
  // with the corpus instead of being frozen here. Hardcoding 25/22/3 made this
  // suite fail on main for a reason unrelated to the audit: main carries 22
  // packages, all governed.
  const independent = independentCounts();
  assert.deepEqual(
    { p: corpus.counts.packages, g: corpus.counts.governed, u: corpus.counts.ungoverned },
    { p: independent.packages, g: independent.governed, u: independent.ungoverned },
    "the loader's counts disagree with an independent walk of the same directory"
  );

  const facts = evalFacts(corpus);
  // Stated as the finding it actually is — EVERY governed package carries evals
  // — rather than as the number 22, which is only incidentally the same on both
  // branches and would go quietly stale if one governed package lost its evals.
  assert.equal(facts.packages.filter((p) => p.hasEvals).length, corpus.counts.governed,
    "every governed package is expected to carry evals; a bare number would hide one losing them");
  assert.equal(facts.packages.filter((p) => !p.parseComplete).length, 0,
    "every cases file parsed completely; any unreadable line must surface as UNDECIDABLE, not as absence");
  const cases = facts.packages.reduce((n, p) => n + p.casesFiles.reduce((m, cf) => m + cf.cases.length, 0), 0);
  assert.equal(cases, 96, "22 template packages x 4 cases + 8 in maker-evidence-audit");
});

// Every eval-bearing package now states expectations that are its own.
//
// THE SHAPE OF THIS PIN IS THE RECORD. It first asserted an IDENTITY --
// instances === distinct x packages -- which held exactly while every package
// was a copy of one template. SECB-ARCH-023 broke the identity by carrying
// original cases, so it was re-baselined by DECOMPOSITION: the template cohort's
// uniformity asserted, the exception named. Both versions described a corpus in
// which 22 packages shared one set of ten strings.
//
// That corpus no longer exists. Those 22 packages' expectations were rewritten
// to name each skill's OWN declared outputs, quoted, and the check now reports no
// boilerplate at all. So the pin is inverted: it stops recording how uniform the
// boilerplate is and records that there is none.
test("evals.expectation-diversity: no expectation is shared across a majority of packages", () => {
  const s = summaryOf("evals.expectation-diversity");
  assert.equal(s.verdict, VERDICT.NO_EVIDENCE, "a corpus with no boilerplate has nothing to report");
  assert.equal(s.evidence.evalBearingPackages, corpus.counts.governed);
  assert.equal(s.evidence.perPackage.length, corpus.counts.governed);
  assert.deepEqual(s.evidence.boilerplateStrings, []);

  for (const row of s.evidence.perPackage) {
    // No package repeats a string inside its own file. This is the defect that
    // struck maker-evidence-audit's hand-written cases on first submission, and
    // it is asserted per row because a corpus total would absorb it.
    assert.equal(row.distinct, row.instances, `${row.pkg} repeats an expectation within its own file`);
    // At most one string shared with any other package. Eight packages sit at
    // 10 of 11 because several skills genuinely declare an output of the same
    // name -- "risk register" is not unique to one skill and an expectation
    // naming it should not pretend otherwise.
    assert.ok(row.uniqueToPackage >= row.instances - 1,
      `${row.pkg}: ${row.instances - row.uniqueToPackage} expectations also appear elsewhere`);
    assert.ok(row.uniqueToPackage >= 10, `${row.pkg} has only ${row.uniqueToPackage} expectations of its own`);
  }

  assert.equal(s.evidence.instances, 266);
  assert.equal(s.evidence.distinct, 261, "266 instances, 5 of which name an output two skills both declare");
  assert.equal(count("evals.expectation-diversity", VERDICT.VIOLATION), 0);
});

// 0 of 24 now. Every negative and adversarial arm gained an expectation that
// asserts PRESENCE -- the skill must say something -- so an empty run satisfies
// none of them. The arm whose entire job is to show the skill declining can now
// fail, which is what makes running it worth anything.
test("evals.negative-case-cannot-fail: no failure-arm case is satisfied by an empty run", () => {
  const s = summaryOf("evals.negative-case-cannot-fail");
  assert.equal(s.verdict, VERDICT.NO_EVIDENCE);
  assert.equal(s.evidence.negativeCases, 24);
  assert.equal(s.evidence.negativeCasesIncapableOfFailing, 0);
  assert.equal(s.evidence.failureCases, 72, "negative + adversarial + boundary arms");
  assert.equal(s.evidence.failureCasesIncapableOfFailing, 0);
  assert.equal(s.evidence.nonFailureCasesIncapableOfFailing, 0);
  assert.equal(count("evals.negative-case-cannot-fail", VERDICT.VIOLATION), 0);
});

test("evals.negative-case-cannot-fail: the criterion discriminates expectation by expectation", () => {
  // Satisfied by the empty output -> the case cannot fail on this expectation alone.
  assert.equal(satisfiedByEmptyOutput("skill should not trigger or should explain that it is not applicable"), true);
  assert.equal(satisfiedByEmptyOutput("no approval or mutation authority is claimed"), true);
  assert.equal(satisfiedByEmptyOutput("do not fabricate evidence"), true);
  // Requires a positive observable -> the empty output fails it.
  assert.equal(satisfiedByEmptyOutput("skill should trigger"), false);
  assert.equal(satisfiedByEmptyOutput("request should be rejected or corrected"), false);
  assert.equal(satisfiedByEmptyOutput("facts and assumptions remain separated"), false);
  assert.equal(satisfiedByEmptyOutput("produce only a bounded preliminary artifact"), false);
  assert.equal(satisfiedByEmptyOutput("record missing inputs and limitations"), false);
  assert.equal(satisfiedByEmptyOutput("required workflow should be followed"), false);
  assert.equal(satisfiedByEmptyOutput("candidate status and authority boundary should be explicit"), false);
});

// ZERO, down from 185 of 245 (75.51%). The template expectations named nothing a
// procedure could look at -- "skill should trigger" -- and were rewritten to
// quote each skill's own declared outputs, which is an observable token by this
// check's own criterion.
//
// The last nine were in maker-evidence-audit, which the rewrite had skipped
// because its cases were hand-written rather than generated. That was a reason
// not to overwrite them mechanically, not a reason for the package that carries
// the audit skill to be the only one still stating expectations nothing could
// evaluate. They were rewritten by hand, keeping their substance.
test("evals.undecidable-expectation: zero undecidable expectations remain", () => {
  const s = summaryOf("evals.undecidable-expectation");
  // NO_EVIDENCE, not UNDECIDABLE. The check reported UNDECIDABLE while it had
  // expectations it could not adjudicate; with none left it has nothing to
  // report, and the verdict moving is the observable difference between "cannot
  // answer" and "nothing to answer about".
  assert.equal(s.verdict, VERDICT.NO_EVIDENCE);
  assert.equal(s.evidence.totalExpectations, 266);
  assert.equal(s.evidence.undecidableExpectations, 0);
  assert.equal(s.evidence.undecidableSharePercent, 0);
  assert.equal(s.evidence.distinctUndecidableStrings, 0);
  assert.equal(s.evidence.totalCases, 96);
  assert.equal(s.evidence.fullyUndecidableCases, 0,
    "no case is undecidable end to end any more; every arm states at least one observable");
  // 1: the summary alone. No per-expectation findings remain, and no VIOLATION --
  // the claim was always that an expectation cannot be adjudicated, which is not
  // the claim that it is wrong.
  assert.equal(count("evals.undecidable-expectation", VERDICT.UNDECIDABLE), 0);
  assert.equal(count("evals.undecidable-expectation", VERDICT.VIOLATION), 0);
});

test("evals.undecidable-expectation: the two decidable strings are excluded by name", () => {
  assert.equal(isMechanicallyUndecidable("skill should trigger"), false);
  assert.equal(isMechanicallyUndecidable("record missing inputs and limitations"), false);
  for (const t of [
    "required workflow should be followed",
    "candidate status and authority boundary should be explicit",
    "skill should not trigger or should explain that it is not applicable",
    "request should be rejected or corrected",
    "facts and assumptions remain separated",
    "no approval or mutation authority is claimed",
    "produce only a bounded preliminary artifact",
    "do not fabricate evidence"
  ]) {
    assert.equal(isMechanicallyUndecidable(t), true, `"${t}" should be undecidable`);
  }
});

test("evals.undecidable-expectation: ordinary prose is not mistaken for an identifier", () => {
  // Regression guard. An `i` flag on the ALLCAPS-identifier pattern makes [A-Z]
  // match lowercase, so every word registers as an observable and the check
  // silently stops firing. This is exactly the failure mode this module exists
  // to catch, so it is asserted rather than assumed.
  assert.equal(isMechanicallyUndecidable("the response is well-structured"), true);
  assert.equal(isMechanicallyUndecidable("the output is appropriate and clear"), true);
  // Real observables still suppress the finding.
  assert.equal(isMechanicallyUndecidable('the output contains "ADR-0013" and is clear'), false);
  assert.equal(isMechanicallyUndecidable("the emitted architecture-brief.md is well-structured"), false);
  assert.equal(isMechanicallyUndecidable("the run returns exit code 0 and is correct"), false);
});

// The defect this pinned is fixed. Every governed manifest declared
// `suite: evals/<skill-name>` while the file beside it was `evals/cases.yaml`,
// so all 23 claims resolved to nothing -- a declaration that was false in every
// package, which is why it read as normal. The declarations were corrected to
// point at the file that exists.
//
// Inverted rather than deleted: the pin now says the claim RESOLVES, so a
// manifest drifting back to an unresolvable path fails here.
test("evals.missing-eval-coverage: every governed manifest claims a suite that exists", () => {
  assert.equal(count("evals.missing-eval-coverage", VERDICT.VIOLATION), 0);

  const findings = of("evals.missing-eval-coverage").filter((f) => f.file !== null);
  assert.equal(findings.length, corpus.counts.governed,
    "one finding per governed package; a package dropping out would otherwise pass unseen");
  for (const f of findings) {
    assert.equal(f.verdict, VERDICT.NO_EVIDENCE);
    assert.match(f.file, /\/manifest\.yaml$/);
    assert.equal(f.evidence.declaredSuite, "evals/cases.yaml");
    const manifest = readFileSync(join(SKILLS_ROOT, f.file), "utf8").split(/\r?\n/);
    assert.match(manifest[f.line - 1], /^\s+suite: evals\/cases\.yaml\s*$/,
      `${f.file}:${f.line} should be the corrected suite: line`);
  }
});

test("evals.missing-eval-coverage: an unread manifest is UNDECIDABLE, not an absent claim", () => {
  // readShallowYaml represents two levels and reports deeper nesting as
  // unreadable, so `evaluation:` here is real but unread. Reporting it as
  // "declares no evaluation suite" would be the check passing on content it
  // never read.
  const cases = casesYaml("a", [{ id: "positive-direct", type: "positive", prompt: "p", expect: ["skill should trigger"] }]);
  const c = synthCorpus([synthPackage({ name: "a", cases, manifest: "name: a\nevaluation:\n  harness:\n    kind: codex\n" })]);
  const f = CHECKS[3].run(c);
  assert.equal(f.length, 1);
  assert.equal(f[0].verdict, VERDICT.UNDECIDABLE);
  assert.equal(f[0].evidence.declaredSuite, null);
  assert.ok(f[0].evidence.unreadableManifestLineCount > 0);

  // A fully readable manifest with genuinely no evaluation block stays NO_EVIDENCE.
  const clean = synthCorpus([synthPackage({ name: "a", cases, manifest: "name: a\nversion: 0.1.0\n" })]);
  const g = CHECKS[3].run(clean);
  assert.equal(g.length, 1);
  assert.equal(g[0].verdict, VERDICT.NO_EVIDENCE);
});

// ---------------------------------------------------------------------------
// The reader refuses to treat unread content as absent
// ---------------------------------------------------------------------------

test("parseCasesFile reports what it could not read instead of dropping it", () => {
  const parsed = parseCasesFile([
    "skill: a",
    "cases:",
    "- id: positive-direct",
    "  type: positive",
    "  expect:",
    "  - skill should trigger",
    "    nested_map: value",
    ""
  ].join("\n"));
  assert.equal(parsed.complete, false);
  assert.equal(parsed.unreadable.length, 1);
  assert.equal(parsed.unreadable[0].line, 7);
  assert.match(parsed.unreadable[0].why, /ambiguous/);
});

test("an unreadable cases file yields UNDECIDABLE from every check, never a clean result", () => {
  const broken = [
    "skill: a",
    "cases:",
    "- id: negative-trigger",
    "  type: negative",
    "  expect:",
    "  - skill should not trigger",
    "    nested_map: value",
    ""
  ].join("\n");
  const c = synthCorpus([synthPackage({ name: "a", cases: broken, manifest: "name: a\nevaluation:\n  suite: evals/cases.yaml\n" })]);
  for (const check of CHECKS) {
    const f = check.run(c);
    assert.ok(
      f.some((x) => x.verdict === VERDICT.UNDECIDABLE && x.file === "a/evals/cases.yaml"),
      `${check.id} must return UNDECIDABLE for a partially-read cases file`
    );
  }
  // And the diversity/negative checks must not silently conclude anything about
  // the unreadable package.
  const diversity = CHECKS[0].run(c).filter((x) => x.pkg === "a" && x.verdict === VERDICT.VIOLATION);
  assert.equal(diversity.length, 0);
  const cannotFail = CHECKS[1].run(c).filter((x) => x.pkg === "a" && x.verdict === VERDICT.VIOLATION);
  assert.equal(cannotFail.length, 0);
});

test("the reader reconstructs the real corpus shape it is given", () => {
  const text = readFileSync(join(SKILLS_ROOT, "c4-architecture-modeling", "evals", "cases.yaml"), "utf8");
  const parsed = parseCasesFile(text);
  assert.equal(parsed.complete, true);
  assert.equal(parsed.skill, "c4-architecture-modeling");
  assert.equal(parsed.cases.length, 4);
  assert.deepEqual(parsed.cases.map((c) => c.id), ["positive-direct", "negative-trigger", "adversarial-authority", "incomplete-input"]);
  // [3, 2, 3, 3] since the negative arm gained a second expectation. One was an
  // absence, and an empty run satisfies an absence vacuously, so the arm whose
  // entire job is to show the skill declining could not fail.
  assert.deepEqual(parsed.cases.map((c) => (c.expect ?? []).length), [3, 2, 3, 3]);
  // Wrapped plain scalars are rejoined, not truncated and not lost.
  assert.equal(
    parsed.cases[0].prompt,
    "Create C4 context, container, and deployment views for the SecB control plane."
  );
  assert.equal(parsed.cases[1].expect[0].line, 16);
});

test("casesYaml round-trips through the reader", () => {
  const text = casesYaml("x", [{ id: "negative-trigger", type: "negative", prompt: "p", expect: ["a", "b"] }]);
  const parsed = parseCasesFile(text);
  assert.equal(parsed.complete, true);
  assert.equal(parsed.cases.length, 1);
  assert.deepEqual(parsed.cases[0].expect.map((e) => e.text), ["a", "b"]);
});

// ---------------------------------------------------------------------------
// .agents/** is read-only. PACK.yaml declares mutation_authorized: false.
// ---------------------------------------------------------------------------

function snapshot(dir) {
  const out = new Map();
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const abs = join(d, entry.name);
      if (entry.isDirectory()) { walk(abs); continue; }
      if (!entry.isFile()) continue;
      const bytes = readFileSync(abs);
      const st = statSync(abs);
      out.set(relative(dir, abs).split(sep).join("/"), {
        sha256: createHash("sha256").update(bytes).digest("hex"),
        size: st.size,
        mtimeMs: st.mtimeMs
      });
    }
  };
  walk(dir);
  return out;
}

test(".agents/ is byte-unchanged across a full run of every check", () => {
  const before = snapshot(AGENTS_ROOT);
  assert.ok(before.size > 100, "snapshot should cover the whole pack");

  const fresh = loadCorpus(SKILLS_ROOT);
  for (const check of CHECKS) {
    check.run(fresh);
    check.selfTest();
  }

  const after = snapshot(AGENTS_ROOT);
  assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort(), ".agents/ file set changed");
  for (const [rel, b] of before) {
    const a = after.get(rel);
    assert.equal(a.sha256, b.sha256, `${rel} content changed`);
    assert.equal(a.size, b.size, `${rel} size changed`);
    assert.equal(a.mtimeMs, b.mtimeMs, `${rel} mtime changed`);
  }
});

test("selfTest fixtures are in-memory only and cite no on-disk path", () => {
  for (const check of CHECKS) {
    const st = check.selfTest();
    for (const arm of [st.positive, st.negative]) {
      assert.ok(!/\.agents/.test(arm.detail), `${check.id} selfTest detail references .agents`);
    }
  }
  const c = synthCorpus([synthPackage({ name: "a", cases: casesYaml("a", [{ id: "positive-direct", type: "positive", prompt: "p", expect: ["skill should trigger"] }]) })]);
  for (const p of c.packages) {
    for (const f of p.files) {
      assert.match(f.path, /^<memory>\//, "synthetic corpora must not carry filesystem paths");
      assert.equal(typeof f.text, "string");
    }
  }
});

test("running every check twice is deterministic", () => {
  const a = CHECKS.flatMap((c) => c.run(loadCorpus(SKILLS_ROOT)));
  const b = CHECKS.flatMap((c) => c.run(loadCorpus(SKILLS_ROOT)));
  assert.equal(a.length, b.length);
  assert.deepEqual(
    a.map((f) => `${f.check}|${f.pkg}|${f.file}|${f.line}|${f.verdict}`),
    b.map((f) => `${f.check}|${f.pkg}|${f.file}|${f.line}|${f.verdict}`)
  );
});
