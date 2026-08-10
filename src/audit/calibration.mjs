import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readShallowYaml } from "./corpus.mjs";

// AC-AUDIT-01 — the calibration gate. Nothing this audit reports is claimable
// until the checks have been shown to catch violations they were not told about.
//
// WHAT THIS MEASURES, stated before anything else because overstating it would
// defeat the point:
//
//   It measures whether a check detects a mutation THIS HARNESS KNOWS HOW TO
//   MAKE. It cannot measure detection of a violation class nobody thought to
//   plant. A perfect score here is not evidence the corpus is sound; it is
//   evidence that the checks fire on the specific failures enumerated below,
//   and on nothing else that has been tested.
//
//   The blindness AC-AUDIT-01 asks for is that the PRODUCER not tune the checks
//   against the answer key. That is enforced by the seed being held outside this
//   file and by `score()` returning per-class rates without the key unless
//   `reveal` is explicitly passed. It is not cryptographic blindness and is not
//   presented as such.
//
// TWO ARMS, because one is not calibration.
//
//   DETECTION    plant a violation, expect the check to fire.
//   FALSE-POSITIVE  plant a REPAIR of an existing violation, expect the check to
//                stop firing for that package.
//
//   The second arm exists because four checks already report violations on every
//   governed package in the real corpus. Planting more violations there proves
//   nothing — a check hard-wired to always fire would score 100% detection. Only
//   the repair arm can tell "detects the defect" from "shouts unconditionally".
//
// The corpus is mutated IN MEMORY. `.agents/` is never written, per the work
// package's prohibited_paths and PACK.yaml's mutation_authorized: false.

/** Deterministic PRNG. Seeded so a run is reproducible from the seed alone. */
function rng(seed) {
  let h = parseInt(createHash("sha256").update(String(seed)).digest("hex").slice(0, 8), 16) >>> 0;
  return () => {
    h ^= h << 13; h >>>= 0;
    h ^= h >>> 17;
    h ^= h << 5; h >>>= 0;
    return h / 0x100000000;
  };
}

function pick(list, next) {
  return list[Math.floor(next() * list.length)];
}

function clonePackage(pkg, changes) {
  return Object.freeze({ ...pkg, ...changes });
}

function reparse(pkg, manifestText) {
  return clonePackage(pkg, { manifestText, manifest: readShallowYaml(manifestText) });
}

/**
 * Mutations. Each names the check it targets, so a class with zero detections
 * identifies exactly which check must be struck from claimed coverage.
 *
 * `arm` is "detection" (plant a defect, expect a fire) or "repair" (remove a
 * real defect, expect the fire to stop).
 */
export const MUTATIONS = Object.freeze([
  {
    id: "remove-manifest",
    arm: "detection",
    targets: "governance.ungoverned-package",
    applicable: (p) => p.governed,
    // The manifest FILE must go too. The first version cleared the parsed
    // manifest and left manifest.yaml in the file list, producing a package that
    // no real defect could produce: full six-file governed layout, manifest.yaml
    // present, governed:false.
    //
    // Found by the sibling lens during the AC-AUDIT-03 prototype, which flagged
    // it as the sharpest anomaly in the corpus for exactly that reason — it
    // detected the planted item through an artefact of the planting rather than
    // through the defect. A mutation that is detectable because it is
    // unrealistic inflates the detection rate and measures the harness.
    apply: (p) => clonePackage(p, {
      manifestText: null,
      manifest: null,
      manifestPath: null,
      governed: false,
      files: p.files.filter((f) => !f.rel.endsWith("/manifest.yaml"))
    })
  },
  {
    id: "collide-skill-id",
    arm: "detection",
    targets: "governance.duplicate-identity",
    applicable: (p) => p.governed && p.manifest.values.skill_id,
    // The donor MUST be a different package. The first version used a fixed
    // donor — the first governed package — so when the seed happened to select
    // that package as the target, the mutation rewrote its skill_id to its own
    // value, no collision existed, and the class scored 0%. On one hand-picked
    // seed it passed; on another it struck a working check.
    //
    // A calibration that is only correct for some seeds is not a calibration,
    // and this is the failure mode it exists to catch, so it must not be its own
    // instance of it. Found by the test asserting the instruction is
    // unambiguous in both directions, not by inspection.
    // A correct duplicate-identity check names BOTH sides of a collision, so the
    // donor appears in the findings without having been planted in. Declared
    // here so the scorer does not count it as a false positive - which it did,
    // reporting spurious: 1 against a check that was behaving exactly right.
    // Measuring correct behaviour as noise is its own measurement defect.
    implicates: (p, ctx) => [ctx.reservedName],
    apply: (p, ctx) => reparse(p, p.manifestText.replace(/^skill_id:.*$/m, `skill_id: ${ctx.donorFor(p)}`))
  },
  {
    id: "drop-identity-field",
    arm: "detection",
    targets: "governance.identity-fields",
    applicable: (p) => p.governed && /^version:/m.test(p.manifestText),
    // \r?\n, not \n. In JavaScript `.` does not match `\r`, so on a CRLF
    // checkout `^version:.*\n` never matches and this mutation silently did
    // nothing — see the no-op guard in plant() for how that surfaced.
    apply: (p) => reparse(p, p.manifestText.replace(/^version:.*\r?\n/m, ""))
  },
  {
    id: "inject-depth-three",
    arm: "detection",
    targets: "governance.unreadable-manifest",
    expect: "UNDECIDABLE",
    applicable: (p) => p.governed,
    apply: (p) => reparse(p, `${p.manifestText}\nrelease:\n  channel:\n    name: stable\n`)
  },
  {
    id: "drop-section",
    arm: "detection",
    targets: "declaration.structural-conformance",
    applicable: (p) => p.governed && /^## Completion gate/m.test(p.skillText ?? ""),
    apply: (p) => clonePackage(p, {
      skillText: p.skillText.replace(/^## Completion gate[\s\S]*?(?=^## |\Z)/m, "")
    })
  },
  {
    id: "instruct-write",
    arm: "detection",
    targets: "declaration.mutation-class-exceeded",
    applicable: (p) => p.governed && p.skillText,
    apply: (p) => clonePackage(p, {
      skillText: `${p.skillText}\n\n## Execution\n\nWrite the resulting manifest file to disk and modify the configuration file in place.\n`
    })
  },
  {
    id: "claim-prohibited-authority",
    arm: "detection",
    targets: "declaration.authority-boundary-consistency",
    applicable: (p) => p.governed && (p.manifest.values["roles.prohibited_final_authority"] ?? []).length > 0,
    // Edits the EXISTING authority-boundary section rather than appending a
    // second one. The first version appended a duplicate `## Authority boundary`
    // heading with text no author would write, the check reasonably read only
    // the first section, and the class scored 0% — which would have struck a
    // working check off the audit's claimed coverage.
    //
    // A mutation that does not resemble a real defect measures the harness, not
    // the check. This one is phrased the way the defect would actually appear:
    // a permission sentence inside the real section, using a verb the manifest
    // lists under roles.prohibited_final_authority.
    apply: (p) => clonePackage(p, {
      skillText: p.skillText.replace(
        /^(## Authority boundary\s*\n)/m,
        "$1\nThis skill may approve its own output and promote the result without further review.\n"
      )
    })
  },
  {
    // WAS `repair-eval-suite-path`, a repair arm, and it had to be inverted.
    //
    // A repair arm proves a check STOPS firing once the defect is fixed, which
    // needs a corpus that carries the defect. Every governed manifest used to
    // declare `suite: evals/<skill-name>` while the file on disk was
    // `evals/cases.yaml`, so all 23 declarations resolved to nothing and the
    // repair had 23 targets. Those declarations were corrected. The repair then
    // rewrote a correct path to the same correct path, changed nothing, and
    // scored as an undetected mutation — the harness reporting a miss against a
    // check that was working perfectly.
    //
    // On a clean corpus the equivalent and stronger test runs the other way:
    // break the declaration and require the check to notice. The break is the
    // exact defect the corpus used to carry.
    id: "break-eval-suite-path",
    arm: "detection",
    targets: "evals.missing-eval-coverage",
    applicable: (p) =>
      p.governed && /^\s*suite:\s*evals\/cases\.yaml\s*$/m.test(p.manifestText ?? ""),
    apply: (p) => reparse(p, p.manifestText.replace(/^(\s*)suite:.*$/m, `$1suite: evals/${p.name}`))
  },
  {
    // WAS `repair-expectation-uniqueness`, and inverted for the same reason as
    // the arm above. All 22 template packages once shared one set of ten
    // expectation strings, so a repair that made one package's expectations
    // unique had 22 targets. Their expectations were rewritten to name each
    // skill's own declared outputs, and the repair became a no-op scoring as a
    // miss.
    //
    // Planting the defect needs strings that appear in ANOTHER package — an
    // expectation unique to the target is not a diversity violation, it is the
    // cure. So the target's cases file is overwritten with the RESERVED DONOR's,
    // verbatim: every string the target then states also exists in the donor,
    // none is unique to the target, which is exactly what the check reports.
    //
    // checks-evals.mjs reads `f.text` when present and falls back to disk, so the
    // in-memory override is already supported and nothing is written to
    // `.agents/`. An earlier version of this arm set an `overrides` key nothing
    // reads, so the mutation never happened and the class scored 0% — a harness
    // defect that would have struck a working check off the audit's coverage.
    id: "break-expectation-uniqueness",
    arm: "detection",
    targets: "evals.expectation-diversity",
    _note: "see repair-ungoverned-package below for where the repair arm went",
    applicable: (p) => p.files.some((f) => f.rel.endsWith("evals/cases.yaml")),
    apply: (p, ctx) => clonePackage(p, {
      files: p.files.map((f) => f.rel.endsWith("evals/cases.yaml")
        ? { ...f, text: ctx.donorCasesText() }
        : f)
    })
  },
  {
    // THE REPAIR ARM. The harness requires at least one, and its own tests say
    // why: "a detection-only calibration cannot tell a working check from one
    // that always fires". Planting defects proves a check fires; only removing a
    // REAL defect proves it stops.
    //
    // Both previous repair arms died when the corpus they repaired was fixed —
    // the eval-suite paths now resolve and the expectations are now per-skill, so
    // repairing either changed nothing and scored as a miss. Inverting both to
    // detection arms left the harness with zero repair coverage, which its tests
    // correctly refused.
    //
    // So the repair arm moved to the defect that is still real: three packages in
    // this corpus carry no manifest at all. Giving one a valid manifest must make
    // `governance.ungoverned-package` stop naming it. When those three are
    // governed, this arm becomes inapplicable and the harness will need a new
    // real defect — which is the correct pressure, not a bug. A calibration that
    // can always find something to repair is calibrating against a corpus nobody
    // is fixing.
    id: "repair-ungoverned-package",
    arm: "repair",
    targets: "governance.ungoverned-package",
    applicable: (p) => !p.governed && p.name,
    apply: (p) => {
      const id = p.name.toUpperCase().replace(/[^A-Z0-9]+/g, "-");
      const manifestText = `skill_id: CALIB-${id}
name: ${p.name}
version: 0.0.0
status: candidate
classification:
  risk_class: R0
  mutation_class: M0
  authority_ceiling: A1
`;
      return clonePackage(p, {
        manifestText,
        manifest: readShallowYaml(manifestText),
        manifestPath: `${p.name}/manifest.yaml`,
        governed: true,
        files: [...p.files, { rel: `${p.name}/manifest.yaml`, text: manifestText }]
      });
    }
  }
]);

/**
 * Builds a mutated corpus from a seed. Returns the corpus and the answer key.
 * Callers that must stay blind take the corpus and discard the key.
 */
export function plant(corpus, { seed, count } = {}) {
  const next = rng(seed);
  const key = [];
  const byName = new Map(corpus.packages.map((p) => [p.name, p]));

  // RESERVED DONOR. One governed package is held out of every mutation, and its
  // skill_id is what collide-skill-id collides against.
  //
  // Two defects led here, both seed-dependent, and both would have struck a
  // working check off the audit's coverage:
  //
  //   1. A fixed donor could be the mutation's own target, so the rewrite set a
  //      skill_id to its own value and no collision existed.
  //   2. Excluding only the target was not enough: remove-manifest had already
  //      un-governed the donor earlier in the same run, so the target collided
  //      with a package that no longer declared an identity.
  //
  // The second is the interesting one — the mutations were not independent, and
  // nothing in the design said they had to be. Reserving the donor makes that
  // independence structural instead of incidental. Found by a test asserting the
  // calibration's instruction is unambiguous in both directions, on a seed that
  // differed from the one used by hand.
  const reserved = corpus.packages.find((p) => p.governed && p.manifest.values.skill_id);
  if (!reserved) throw new Error("calibration needs at least one governed package to reserve as a collision donor");

  const ctx = {
    reservedName: reserved.name,
    donorFor: () => reserved.manifest.values.skill_id,
    // The reserved donor's own cases file, read from disk. Used to plant a
    // diversity violation: strings copied from a package that is never mutated
    // are guaranteed to exist in two places at scoring time.
    donorCasesText: () => {
      const f = reserved.files.find((x) => x.rel.endsWith("evals/cases.yaml"));
      if (!f) throw new Error(`reserved donor "${reserved.name}" has no evals/cases.yaml to copy from`);
      return f.text ?? readFileSync(f.path, "utf8");
    },
    uniqueExpectations: (name) =>
      `cases:\n  - id: ${name}-unique\n    type: positive\n    expect:\n      - "${name} emits its own distinctive expectation text at exit code 0"\n`
  };

  const pool = MUTATIONS.filter((m) => corpus.packages.some((p) => m.applicable(p)));

  /**
   * THE DEFAULT MUST REACH EVERY CLASS IN THE POOL.
   *
   * Selection is `pool[i % pool.length]` — round-robin, not sampling — so a
   * count below the pool size does not plant a random subset, it plants a FIXED
   * prefix. The default was 6 against a pool of 9, and the three it never
   * reached were `claim-prohibited-authority` and BOTH repair-arm classes,
   * identically on every seed. The repair arm is the only thing that separates
   * "detects the defect" from "shouts unconditionally", so the default measured
   * detection alone and `score()` then reported `uncovered: []` — a clean bill
   * of health for a calibration that had not run half its argument.
   *
   * Derived from the pool rather than from MUTATIONS.length so that a class
   * applicable to nothing in this corpus does not push the count past what can
   * be planted, and a class added later is covered without editing this line.
   */
  const planned = count ?? pool.length;

  for (let i = 0; i < planned; i += 1) {
    const mutation = pool[i % pool.length];
    const candidates = corpus.packages.filter((p) =>
      mutation.applicable(p) &&
      p.name !== reserved.name &&                       // the donor is never a target
      !key.some((k) => k.package === p.name));         // one mutation per package

    /**
     * A CLASS WITH NOWHERE TO PLANT IS NOT A CLASS THAT PASSED.
     *
     * This was `continue`. The class then never entered `key`, so `score()`
     * built no row for it, `uncovered` could not name it, and the run reported
     * full coverage of a class it had not exercised — the same false negative
     * the no-op guard forty lines below throws to prevent, arriving through a
     * different door. Symmetry is the point: both are "the mutation did not
     * happen", and both must be loud.
     *
     * Reached two ways. `applicable` may hold only for the reserved donor, which
     * is excluded as a target, so the class is in the pool and has no candidate.
     * Or a count above the pool size may revisit a class after the one-mutation-
     * per-package rule has consumed every package it applies to.
     */
    if (candidates.length === 0) {
      throw new Error(
        `calibration mutation "${mutation.id}" has no package to plant in. ` +
        "Skipping it would omit the class from the answer key, and a class absent from the key " +
        "is scored as covered rather than reported as uncovered. " +
        `Lower count (${planned}) or widen the corpus rather than the score.`
      );
    }

    const target = pick(candidates, next);
    const seeded = mutation.apply(target, ctx);

    /**
     * A MUTATION THAT CHANGED NOTHING IS NOT A MUTATION.
     *
     * Without this, a no-op apply is planted, keyed, and then scored as "the
     * check failed to detect it" — reporting a class as UNCOVERED when what
     * actually happened is that nothing was ever planted. The audit then
     * strikes a check that works fine, which is a false negative dressed as
     * rigour.
     *
     * This is not hypothetical. `drop-identity-field` used `/^version:.*\n/m`,
     * which cannot match on a CRLF checkout because `.` does not match `\r`.
     * On a branch carrying .gitattributes the corpus is LF and the mutation
     * worked; on `main`, which has no .gitattributes, it silently did nothing
     * and `governance.identity-fields` was struck as uncovered on every seed
     * tried. The check was never at fault.
     *
     * Failing loudly here is the same rule the audit applies to everything
     * else: a control that cannot fire is not evidence.
     */
    /**
     * Compare everything a mutation is able to write, not just the two obvious
     * fields. The first version of this guard checked manifestText and skillText
     * only, and immediately reported `repair-expectation-uniqueness` as a no-op
     * on a corpus where it works fine — that mutation writes an in-memory
     * override into `files[].text`, which the guard could not see. A guard that
     * misses the thing it is guarding is worse than none, because it fails
     * loudly in the wrong place.
     */
    const shapeOf = (p) => JSON.stringify([
      p.manifestText ?? null,
      p.skillText ?? null,
      (p.files ?? []).map((f) => [f.rel, f.text ?? null])
    ]);

    if (shapeOf(seeded) === shapeOf(target)) {
      throw new Error(
        `calibration mutation "${mutation.id}" applied to "${target.name}" changed nothing. ` +
        "A no-op seed scores as an undetected class and would strike a working check. " +
        "Fix the mutation rather than the score — check line endings first."
      );
    }

    byName.set(target.name, seeded);
    key.push({
      mutation: mutation.id,
      arm: mutation.arm,
      targets: mutation.targets,
      package: target.name,
      implicates: mutation.implicates ? mutation.implicates(target, ctx) : []
    });
  }

  const mutated = Object.freeze({
    ...corpus,
    packages: Object.freeze(corpus.packages.map((p) => byName.get(p.name)))
  });
  return { corpus: mutated, key };
}

/**
 * Scores a run. Returns per-class rates and, only when `reveal` is set, the key.
 *
 * A class with zero detections is reported as UNCOVERED, and the caller is
 * expected to strike it from the audit's claimed coverage rather than report it
 * as "no violations found". That instruction is in the returned object rather
 * than left to a reader's discretion.
 */
export function score({ key, baseline, mutated, reveal = false }) {
  // Match the verdict the TARGET CHECK actually emits. The first version
  // counted only VIOLATION, so governance.unreadable-manifest - which reports
  // UNDECIDABLE by design, because an unreadable line supports no claim about
  // its content - scored 0% and would have been struck as uncovered. A scorer
  // that only recognises one verdict cannot calibrate a three-valued audit.
  const expectedOf = (mutationId) => MUTATIONS.find((m) => m.id === mutationId)?.expect ?? "VIOLATION";
  const firedIn = (findings, check, pkg, verdict) =>
    findings.some((f) => f.check === check && f.verdict === verdict && (f.pkg === pkg || f.file?.includes(`/${pkg}/`)));

  const byClass = new Map();
  for (const entry of key) {
    const verdict = expectedOf(entry.mutation);
    const before = firedIn(baseline, entry.targets, entry.package, verdict);
    const after = firedIn(mutated, entry.targets, entry.package, verdict);
    const caught = entry.arm === "detection" ? (after && !before) : (before && !after);

    const row = byClass.get(entry.mutation) ?? { mutation: entry.mutation, arm: entry.arm, targets: entry.targets, planted: 0, caught: 0 };
    row.planted += 1;
    if (caught) row.caught += 1;
    byClass.set(entry.mutation, row);
  }

  const classes = [...byClass.values()].map((r) => ({
    ...r,
    rate: r.planted === 0 ? null : r.caught / r.planted,
    covered: r.caught > 0
  }));

  const uncovered = classes.filter((c) => !c.covered);
  return {
    classes,
    uncovered: uncovered.map((c) => ({ mutation: c.mutation, targets: c.targets, arm: c.arm })),
    // A false positive here is a finding that appeared for a package nothing was
    // planted in. It is reported alongside detection because a check that fires
    // everywhere scores perfectly on detection and is still useless.
    spurious: (() => {
      // Expected = planted packages, plus packages a mutation declares a correct
      // check will legitimately also name (the other side of a collision, for
      // instance). Without the second set this counted correct behaviour as
      // noise.
      const expected = new Set(key.flatMap((k) => [k.package, ...(k.implicates ?? [])]));
      return mutated.filter((f) =>
        f.verdict === "VIOLATION" &&
        !baseline.some((b) => b.check === f.check && b.pkg === f.pkg && b.line === f.line) &&
        !expected.has(f.pkg)
      ).length;
    })(),
    instruction: uncovered.length === 0
      ? "Every planted class was caught. This licenses the checks named here and no others."
      : `STRIKE from claimed coverage: ${uncovered.map((c) => c.targets).join(", ")}. A class with zero detections is a class this audit does not cover, and its zero must not be reported as "no violations found".`,
    key: reveal ? key : undefined
  };
}
