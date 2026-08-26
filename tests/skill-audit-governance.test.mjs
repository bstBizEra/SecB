/**
 * WP-SK-AUDIT-01 — governance lens control matrix and ground truth.
 *
 * Three obligations, and they are not interchangeable:
 *
 *   AC-AUDIT-02 (BOTH ARMS) — every check is shown producing both outcomes. A
 *     check whose positive control does not fire is a check that cannot fail,
 *     and a check that cannot fail reporting zero findings is not evidence of
 *     anything. Those checks must be deleted or fixed, never shipped.
 *   Ground truth — every check also runs against the real corpus and its counts
 *     are pinned. Where the tree disagreed with the brief, the tree wins and the
 *     test says so by name.
 *   AC-AUDIT-07 (READ-ONLY PROOF) — .agents/ is digested before and after a full
 *     run and compared. The digest covers content; the file inventory covers
 *     additions and removals. Both, because either alone misses a class.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import { VERDICT, loadCorpus } from "../src/audit/corpus.mjs";
import { EXPECTED_CORPUS } from "../src/audit/corpus-expectation.mjs";
import { CHECKS, synthCorpus } from "../src/audit/checks-governance.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const AGENTS_DIR = join(ROOT, ".agents");
const SKILLS_ROOT = join(AGENTS_DIR, "skills");

/** Fields a finding must never carry (AC-AUDIT-08). */
const DISPOSITION_FIELDS = ["disposition", "approval", "approved", "status", "severity", "decision", "waiver"];

function walkFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(abs, out);
    else if (entry.isFile()) out.push(abs);
  }
  return out;
}

/**
 * Content digest plus file inventory for a tree. Returned together because a
 * content-only digest cannot see a file that was added and a name-only listing
 * cannot see a byte that changed.
 */
function treeState(dir) {
  const files = walkFiles(dir)
    .map((abs) => ({
      rel: relative(dir, abs).split(sep).join("/"),
      sha256: createHash("sha256").update(readFileSync(abs)).digest("hex")
    }))
    .sort((a, b) => a.rel.localeCompare(b.rel));
  return {
    count: files.length,
    inventory: files.map((f) => f.rel),
    digest: createHash("sha256").update(files.map((f) => `${f.rel}:${f.sha256}`).join("\n")).digest("hex")
  };
}

const realCorpus = loadCorpus(SKILLS_ROOT);
const findingsFor = new Map(CHECKS.map((check) => [check.id, check.run(realCorpus)]));
const violations = (id) => findingsFor.get(id).filter((f) => f.verdict === VERDICT.VIOLATION);
const undecidable = (id) => findingsFor.get(id).filter((f) => f.verdict === VERDICT.UNDECIDABLE);

// ---------------------------------------------------------------------------
// AC-AUDIT-02 — both arms, per check
// ---------------------------------------------------------------------------

test("the governance lens exposes the checks it claims", () => {
  assert.deepEqual(
    CHECKS.map((c) => c.id),
    [
      "governance.ungoverned-package",
      "governance.duplicate-identity",
      "governance.unreadable-manifest",
      "governance.identity-fields"
    ]
  );
  for (const check of CHECKS) {
    assert.equal(typeof check.describe, "string", `${check.id} has no describe`);
    assert.ok(check.describe.length > 20, `${check.id} describe is too thin to be useful`);
    assert.equal(typeof check.run, "function", `${check.id} has no run`);
    assert.equal(typeof check.selfTest, "function", `${check.id} has no selfTest`);
  }
});

for (const check of CHECKS) {
  test(`${check.id}: positive control fires and negative control does not`, () => {
    const result = check.selfTest();

    for (const arm of ["positive", "negative"]) {
      assert.ok(result[arm], `${check.id} selfTest returned no ${arm} arm`);
      assert.equal(typeof result[arm].fired, "boolean", `${check.id} ${arm}.fired is not a boolean`);
      assert.equal(typeof result[arm].detail, "string", `${check.id} ${arm}.detail is not a string`);
      assert.ok(result[arm].detail.length > 0, `${check.id} ${arm}.detail is empty`);
    }

    // The load-bearing pair. A check that cannot be tripped cannot fail, and a
    // check that fires on a clean input reports noise as signal.
    assert.equal(
      result.positive.fired,
      true,
      `${check.id} POSITIVE CONTROL DID NOT FIRE — this check cannot fail and must be fixed or deleted, ` +
        `never shipped reporting zero. detail: ${result.positive.detail}`
    );
    assert.equal(
      result.negative.fired,
      false,
      `${check.id} negative control fired on a clean input. detail: ${result.negative.detail}`
    );
  });
}

// ---------------------------------------------------------------------------
// Finding hygiene — applies to every finding from every check, on real and
// synthetic input alike
// ---------------------------------------------------------------------------

test("every finding cites a resolvable file:line or no file at all (AC-AUDIT-05)", () => {
  for (const [id, findings] of findingsFor) {
    for (const f of findings) {
      if (f.file === null) {
        assert.equal(f.line, null, `${id} carries a line with no file`);
        continue;
      }
      assert.ok(Number.isInteger(f.line) && f.line >= 1, `${id} cites ${f.file} without a 1-indexed line`);
      // Resolve it. A citation that does not land is an opinion.
      const lineCount = readFileSync(f.file, "utf8").split(/\r?\n/).length;
      assert.ok(
        f.line <= lineCount,
        `${id} cites ${f.file}:${f.line} but that file has only ${lineCount} lines`
      );
    }
  }
});

test("no finding carries a field a reader could mistake for a ruling (AC-AUDIT-08)", () => {
  for (const [id, findings] of findingsFor) {
    for (const f of findings) {
      for (const banned of DISPOSITION_FIELDS) {
        assert.equal(
          Object.hasOwn(f, banned),
          false,
          `${id} emitted a finding carrying a "${banned}" field`
        );
      }
      assert.ok(VERDICT[f.verdict], `${id} emitted an unknown verdict ${f.verdict}`);
    }
  }
});

test("every check emits at least one finding, so silence is never mistaken for not running (AC-AUDIT-06)", () => {
  for (const [id, findings] of findingsFor) {
    assert.ok(findings.length >= 1, `${id} returned an empty array — indistinguishable from a check that never ran`);
    for (const f of findings) {
      assert.ok(f.evidence.scope, `${id} emitted a finding with no scope, so its coverage bound is invisible`);
      assert.equal(typeof f.evidence.scope.examined, "number");
      assert.equal(typeof f.evidence.scope.skipped, "number");
      assert.ok(f.evidence.scope.skip_reason.length > 0);
    }
  }
});

test("NO_EVIDENCE is never worded as a pass (AC-AUDIT-04)", () => {
  const noEvidenceFindings = [...findingsFor.values()].flat().filter((f) => f.verdict === VERDICT.NO_EVIDENCE);
  assert.ok(noEvidenceFindings.length > 0, "no NO_EVIDENCE finding was produced, so this assertion proved nothing");
  for (const f of noEvidenceFindings) {
    assert.match(f.observation, /not a pass/i, `${f.check} NO_EVIDENCE observation does not disclaim being a pass`);
    assert.doesNotMatch(f.observation, /\bpassed\b|\bclean\b|\bno violations\b/i, `${f.check} worded NO_EVIDENCE as clean`);
    assert.ok(f.evidence.method_limits.length > 0, `${f.check} NO_EVIDENCE states no method limits`);
  }
});

test("UNDECIDABLE and NO_EVIDENCE are distinct verdicts, and UNDECIDABLE is reachable (AC-AUDIT-04)", () => {
  assert.notEqual(VERDICT.UNDECIDABLE, VERDICT.NO_EVIDENCE);

  const real = [...findingsFor.values()].flat();
  assert.ok(real.some((f) => f.verdict === VERDICT.NO_EVIDENCE), "no NO_EVIDENCE verdict is reachable on the real corpus");

  // The real corpus produces ZERO UNDECIDABLE at this commit, and that is a
  // fact about the corpus rather than a hole in the checks: since the evidence
  // layer's reader was fixed, every governed manifest is fully representable,
  // so no check has an input it cannot answer for. Reachability must therefore
  // be demonstrated on control input — which is exactly why it is demonstrated
  // rather than assumed.
  assert.equal(real.filter((f) => f.verdict === VERDICT.UNDECIDABLE).length, 0);

  const check = CHECKS.find((c) => c.id === "governance.unreadable-manifest");
  const control = check.run(synthCorpus([
    { name: "deep", manifestText: ["skill_id: SECB-T-D", "a:", "  b:", "    c: 1", ""].join("\n") }
  ]));
  assert.ok(
    control.some((f) => f.verdict === VERDICT.UNDECIDABLE),
    "UNDECIDABLE is not reachable even on control input — the verdict is dead code"
  );
});

// ---------------------------------------------------------------------------
// Ground truth against the real corpus
// ---------------------------------------------------------------------------

test("the real corpus is the shape recorded in corpus-expectation.mjs", () => {
  // Was a hardcoded 25/22/3, which is true here and false on main, where the
  // corpus is 22/22/0. The expectation now travels with the corpus so this
  // suite can run wherever the audit is extracted to.
  assert.deepEqual(
    {
      packages: realCorpus.counts.packages,
      governed: realCorpus.counts.governed,
      ungoverned: realCorpus.counts.ungoverned
    },
    {
      packages: EXPECTED_CORPUS.packages,
      governed: EXPECTED_CORPUS.governed,
      ungoverned: EXPECTED_CORPUS.ungoverned
    },
    "corpus moved off the recorded expectation — update src/audit/corpus-expectation.mjs deliberately, in the same commit as the corpus change"
  );
});

test("governance.ungoverned-package finds exactly the packages that lack a manifest", () => {
  const found = violations("governance.ungoverned-package");
  // Two independent mechanisms reaching the same answer is the point: the check
  // walks the corpus, EXPECTED_CORPUS is maintained by hand. A disagreement
  // means one of them is wrong and the check is telling us which.
  //
  // Compared by NAME, not by count. A corpus that swapped one ungoverned
  // package for another keeps every count identical, and on main this list is
  // empty — which is why the emptiness is asserted rather than assumed.
  assert.deepEqual(found.map((f) => f.pkg).sort(), [...EXPECTED_CORPUS.ungovernedNames].sort());
  for (const f of found) {
    // A directory has no line. The finding must cite the directory in the
    // observation and leave file/line null rather than invent a line.
    assert.equal(f.file, null);
    assert.equal(f.line, null);
    assert.match(f.observation, /\.agents[/\\]skills[/\\]?/i);
    assert.equal(f.evidence.citation_form, "directory");
  }
});

test("governance.duplicate-identity finds no collision, and says NO_EVIDENCE rather than clean", () => {
  const findings = findingsFor.get("governance.duplicate-identity");
  assert.equal(violations("governance.duplicate-identity").length, 0);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].verdict, VERDICT.NO_EVIDENCE);
  assert.equal(findings[0].evidence.examined, 24);

  // The check must actually be capable of seeing the 22 identities it compared;
  // a zero produced by not looking is the failure mode this pins.
  const ids = realCorpus.packages
    .filter((p) => p.manifest !== null)
    .map((p) => p.manifest.values.skill_id);
  assert.equal(ids.length, 24);
  assert.equal(new Set(ids).size, 24, "the corpus itself has duplicate skill_ids and the check missed them");
});

test("every governed manifest is fully readable, so unreadable-manifest returns NO_EVIDENCE", () => {
  // The property worth pinning is that the corpus is representable at depth 2
  // by the evidence layer's reader. Asserting zero here means this fails if the
  // reader regresses OR if a manifest gains structure the reader cannot
  // represent — either way, downstream checks would start reasoning over
  // content that was never parsed, and that is the failure to catch early.
  const governed = realCorpus.packages.filter((p) => p.manifest !== null);
  assert.equal(governed.length, 24);
  for (const p of governed) {
    assert.deepEqual(
      p.manifest.unreadable,
      [],
      `${p.name} has unreadable manifest lines: ${JSON.stringify(p.manifest.unreadable)}`
    );
  }

  const findings = findingsFor.get("governance.unreadable-manifest");
  assert.equal(undecidable("governance.unreadable-manifest").length, 0);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].verdict, VERDICT.NO_EVIDENCE);
  assert.equal(findings[0].evidence.examined, 24);
});

test("the corpus really is parsed at depth 2, not flattened into its parent key", () => {
  // The zero above is only meaningful if the reader is genuinely resolving
  // nested sequences rather than dropping them. This pins the specific
  // mis-attribution that produced the 110: `roles` merging the allowed list
  // with the prohibited-final-authority list, so a check reading `roles` as the
  // allowed set would have concluded SELF-APPROVAL is an ALLOWED role.
  let checked = 0;
  for (const p of realCorpus.packages.filter((x) => x.manifest !== null)) {
    const v = p.manifest.values;
    const allowed = v["roles.allowed"];
    const prohibited = v["roles.prohibited_final_authority"];
    if (!Array.isArray(allowed) || !Array.isArray(prohibited)) continue;
    checked += 1;
    assert.ok(allowed.length > 0, `${p.name} roles.allowed is empty`);
    for (const role of prohibited) {
      assert.equal(
        allowed.includes(role),
        false,
        `${p.name}: prohibited role ${role} leaked into roles.allowed — the parent-key collapse is back`
      );
    }
  }
  assert.equal(checked, 24, "expected all 24 governed manifests to expose split role lists");
});

test("HISTORY: the 110 unreadable lines were a parser defect, not a corpus property", () => {
  // Kept deliberately so the number moving is legible to whoever reads this
  // suite next.
  //
  // The brief gave arc42-architecture-documentation's 5 unreadable lines as
  // ground truth for governance.unreadable-manifest. That figure was correct
  // for arc42 but not distinctive: ALL 22 governed packages carried exactly 5,
  // for 110 findings corpus-wide. The condition was uniform because every
  // manifest uses the same nested-sequence layout (roles.allowed,
  // roles.prohibited_final_authority, inputs.required, outputs.required,
  // evaluation.cross_harness), and readShallowYaml could not represent a nested
  // sequence header — it left the current key pointing at the PARENT, so the
  // items were appended to the parent's array.
  //
  // So the 110 measured the reader, not the manifests. It was fixed in
  // src/audit/corpus.mjs with an explicit indent stack, and the corpus-wide
  // count is now 0. The finding stands as recorded; only its cause is resolved.
  //
  // This test asserts the resolved state and would fail if the defect returned.
  const findings = undecidable("governance.unreadable-manifest");
  assert.equal(findings.length, 0, "unreadable findings are back — check whether the parser regressed before the corpus");

  const arc42 = realCorpus.packages.find((p) => p.name === "arc42-architecture-documentation");
  assert.ok(arc42, "arc42-architecture-documentation is missing from the corpus");
  assert.deepEqual(arc42.manifest.unreadable, [], "the package the brief cited is readable now");
  // The five lines that used to be reported: they parse, and they parse into
  // the paths the document meant.
  assert.deepEqual(arc42.manifest.values["evaluation.cross_harness"], ["codex", "claude-code", "generic-agent-skills"]);
});

test("governance.identity-fields finds no missing identity, and says NO_EVIDENCE rather than clean", () => {
  const findings = findingsFor.get("governance.identity-fields");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].verdict, VERDICT.NO_EVIDENCE);
  assert.equal(findings[0].evidence.examined, 24);

  // Independent confirmation that the zero is a real zero: all 22 manifests do
  // carry all four identity fields as non-empty scalars.
  for (const p of realCorpus.packages.filter((x) => x.manifest !== null)) {
    for (const field of ["skill_id", "name", "version", "status"]) {
      const v = p.manifest.values[field];
      assert.equal(typeof v, "string", `${p.name} ${field} is not a scalar`);
      assert.notEqual(v, "", `${p.name} ${field} is empty`);
    }
  }
});

test("governance.identity-fields separates absent from unknown", () => {
  // Case 3 (absent, every line readable) is VIOLATION; Case 2 (absent from the
  // parse but named on a line the reader failed on) is UNDECIDABLE. Conflating
  // them would report an unread line as a missing field.
  const check = CHECKS.find((c) => c.id === "governance.identity-fields");
  const findings = check.run(synthCorpus([
    {
      name: "absent-version",
      manifestText: ["skill_id: SECB-T-1", "name: absent-version", "status: candidate", ""].join("\n")
    },
    {
      // Depth-3 nesting is the shape the current reader cannot represent, and
      // the unparsed line names the missing field.
      name: "unknown-version",
      manifestText: [
        "skill_id: SECB-T-2",
        "name: unknown-version",
        "status: candidate",
        "meta:",
        "  release:",
        "    version: 0.1.0",
        ""
      ].join("\n")
    }
  ]));

  const absent = findings.filter((f) => f.pkg === "absent-version");
  assert.equal(absent.length, 1);
  assert.equal(absent[0].verdict, VERDICT.VIOLATION);
  assert.equal(absent[0].evidence.failure, "absent");
  assert.equal(absent[0].evidence.field, "version");

  const unknown = findings.filter((f) => f.pkg === "unknown-version");
  assert.equal(unknown.length, 1);
  assert.equal(unknown[0].verdict, VERDICT.UNDECIDABLE);
  assert.equal(unknown[0].evidence.failure, "unparsed_line_may_declare_field");
  assert.equal(unknown[0].line, 6, "should cite the unreadable line that names the field");
});

test("governance.duplicate-identity distinguishes a skill_id collision from a skill_id+version collision", () => {
  const check = CHECKS.find((c) => c.id === "governance.duplicate-identity");
  const manifest = (id, name, version) =>
    [`skill_id: ${id}`, `name: ${name}`, `version: ${version}`, "status: candidate", ""].join("\n");

  const sameVersion = check.run(synthCorpus([
    { name: "a", manifestText: manifest("SECB-T-DUP", "a", "0.1.0") },
    { name: "b", manifestText: manifest("SECB-T-DUP", "b", "0.1.0") }
  ]));
  assert.equal(sameVersion.length, 2);
  for (const f of sameVersion) assert.equal(f.evidence.collision_kind, "skill_id+version");

  const differentVersion = check.run(synthCorpus([
    { name: "a", manifestText: manifest("SECB-T-DUP", "a", "0.1.0") },
    { name: "b", manifestText: manifest("SECB-T-DUP", "b", "0.2.0") }
  ]));
  assert.equal(differentVersion.length, 2);
  for (const f of differentVersion) {
    assert.equal(f.evidence.collision_kind, "skill_id");
    assert.equal(f.line, 1, "should cite the line of the colliding skill_id key");
    assert.equal(f.verdict, VERDICT.VIOLATION);
  }
  // Both manifests are cited, not just one — a collision has two sides.
  assert.deepEqual(differentVersion.map((f) => f.file).sort(), [
    "synthetic://corpus/a/manifest.yaml",
    "synthetic://corpus/b/manifest.yaml"
  ]);
});

test("selfTest control corpora never touch the real tree", () => {
  // Every citation a control produces must carry the synthetic:// scheme. A
  // control that cited a real path would mean the control matrix was reading
  // .agents/ through a side door.
  for (const check of CHECKS) {
    const findings = [
      ...check.run(synthCorpus([{ name: "x", manifestText: "skill_id: SECB-T-X\nname: x\n" }])),
      ...check.run(synthCorpus([{ name: "y", manifestText: null }]))
    ];
    for (const f of findings) {
      if (f.file !== null) assert.match(f.file, /^synthetic:\/\//, `${check.id} control cited a non-synthetic path`);
      if (f.evidence.scope) assert.match(f.evidence.scope.root, /^synthetic:\/\//);
    }
  }
});

// ---------------------------------------------------------------------------
// AC-AUDIT-07 — read-only proof
// ---------------------------------------------------------------------------

test("a full run leaves .agents/ byte-identical (AC-AUDIT-07)", () => {
  const before = treeState(AGENTS_DIR);

  const corpus = loadCorpus(SKILLS_ROOT);
  for (const check of CHECKS) {
    check.run(corpus);
    check.selfTest();
  }

  const after = treeState(AGENTS_DIR);
  assert.equal(after.count, before.count, ".agents/ file count changed during the audit run");
  assert.deepEqual(after.inventory, before.inventory, ".agents/ file inventory changed during the audit run");
  assert.equal(after.digest, before.digest, ".agents/ content digest changed during the audit run");
  assert.ok(before.count > 0, "digested an empty tree, so this assertion proved nothing");
});
