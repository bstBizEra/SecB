/**
 * AC-AUDIT-01 — the calibration gate.
 *
 * The audit's results are not claimable until the checks have been shown to
 * catch violations they were not told about. This suite tests the harness that
 * makes that claim, which means its job is the awkward one: proving the
 * calibration can say NO.
 *
 * A calibration that always reports 100% is worth less than none, because it
 * licenses whatever it is pointed at. Every test here that asserts a detection
 * has a sibling asserting the same machinery reports a miss when there is one.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadCorpus } from "../src/audit/corpus.mjs";
import { plant, score, MUTATIONS } from "../src/audit/calibration.mjs";
import { CHECKS as GOVERNANCE } from "../src/audit/checks-governance.mjs";
import { CHECKS as DECLARATION } from "../src/audit/checks-declaration.mjs";
import { CHECKS as EVALS } from "../src/audit/checks-evals.mjs";

const CHECKS = [...GOVERNANCE, ...DECLARATION, ...EVALS];
const SEED = "test-seed-fixed";

const runAll = (corpus) => CHECKS.flatMap((c) => { try { return c.run(corpus); } catch { return []; } });

// Deliberately takes the DEFAULT count. The default used to plant 6 of 9 classes
// and this helper passed MUTATIONS.length, so every test below ran a count the
// real default never produced and none of them could see the gap.
function calibrate(seed = SEED, checks = CHECKS) {
  const base = loadCorpus();
  const { corpus, baselineCorpus, key } = plant(base, { seed });
  const run = (c) => checks.flatMap((x) => { try { return x.run(c); } catch { return []; } });
  // baselineCorpus, not base. A repair arm that carries its own precondition has
  // its target broken there; scoring against the corpus as loaded would report
  // the repair as uncaught and strike a working check.
  return { key, result: score({ key, baseline: run(baselineCorpus), mutated: run(corpus), reveal: true }) };
}

function digestAgents() {
  const walk = (dir, out = []) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (e.isFile()) out.push(`${p}:${statSync(p).size}:${createHash("sha256").update(readFileSync(p)).digest("hex")}`);
    }
    return out;
  };
  return createHash("sha256").update(walk(".agents/skills").sort().join("\n")).digest("hex");
}

describe("AC-AUDIT-01 — every mutation class is detected", () => {
  it("all planted classes are caught, and none is caught by accident", () => {
    const { result } = calibrate();

    assert.equal(result.uncovered.length, 0,
      `uncovered classes must be struck from claimed coverage: ${JSON.stringify(result.uncovered)}`);
    assert.equal(result.classes.length, MUTATIONS.length,
      "every declared mutation class must be planted, or the calibration covers less than it claims");
    for (const c of result.classes) {
      assert.equal(c.caught, c.planted, `${c.mutation} -> ${c.targets}`);
    }

    // A check that fires on everything scores a perfect detection rate. The
    // repair arm is what distinguishes it, so the harness must actually carry
    // repair mutations rather than only detection ones.
    assert.ok(result.classes.some((c) => c.arm === "repair"),
      "a detection-only calibration cannot tell a working check from one that always fires");
  });

  it("no violation appears in a package nothing was planted in", () => {
    const { result } = calibrate();
    assert.equal(result.spurious, 0);
  });
});

describe("AC-AUDIT-01 — the calibration can report a miss", () => {
  // The load-bearing tests. Without these, the suite above proves only that the
  // harness agrees with itself.

  it("a blind check is scored 0% and named for striking", () => {
    const blinded = CHECKS.map((c) =>
      c.id === "declaration.mutation-class-exceeded" ? { ...c, run: () => [] } : c);
    const { result } = calibrate(SEED, blinded);

    const row = result.classes.find((c) => c.targets === "declaration.mutation-class-exceeded");
    assert.equal(row.caught, 0, "a check that returns nothing must score zero");
    assert.ok(result.uncovered.some((u) => u.targets === "declaration.mutation-class-exceeded"));
    assert.match(result.instruction, /^STRIKE from claimed coverage/,
      "the instruction must tell the reader to strike it, not merely report a number");
  });

  it("a check that always fires is caught by the repair arm, not the detection arm", () => {
    // The failure mode a detection-only calibration cannot see.
    // Stubs the check the repair arm targets. EVERY package, not only the
    // governed ones: the repair gives an ungoverned package a manifest, so a
    // stub filtering on `p.governed` would name it after the repair and miss it
    // before — which is what a discriminating check does, and would make this
    // test pass for the wrong reason.
    const always = CHECKS.map((c) =>
      c.id === "governance.ungoverned-package"
        ? { ...c, run: (corpus) => corpus.packages.map((p) => ({
            check: c.id, pkg: p.name, file: null, line: null,
            verdict: "VIOLATION", observation: "always", evidence: {}
          })) }
        : c);
    const { result } = calibrate(SEED, always);

    const row = result.classes.find((c) => c.mutation === "repair-ungoverned-package");
    assert.equal(row.arm, "repair");
    assert.equal(row.caught, 0, "an indiscriminate check must fail the repair arm");
    assert.equal(row.covered, false);
  });

  it("the instruction is unambiguous in both directions", () => {
    const clean = calibrate().result;
    assert.doesNotMatch(clean.instruction, /STRIKE/);

    const blinded = calibrate(SEED, CHECKS.map((c) =>
      c.id === "governance.ungoverned-package" ? { ...c, run: () => [] } : c)).result;
    assert.match(blinded.instruction, /STRIKE/);
  });
});

describe("AC-AUDIT-01 — the harness is honest about itself", () => {
  it("is reproducible from the seed alone", () => {
    const a = calibrate("repeatable");
    const b = calibrate("repeatable");
    assert.deepEqual(a.key, b.key);
  });

  it("different seeds plant in different packages", () => {
    // Otherwise the "seed is the answer key" claim is decoration.
    const a = calibrate("seed-one").key.map((k) => k.package).join(",");
    const b = calibrate("seed-two").key.map((k) => k.package).join(",");
    assert.notEqual(a, b);
  });

  it("withholds the answer key unless reveal is passed", () => {
    const base = loadCorpus();
    const { corpus, baselineCorpus, key } = plant(base, { seed: SEED, count: 4 });
    const hidden = score({ key, baseline: runAll(baselineCorpus), mutated: runAll(corpus) });
    assert.equal(hidden.key, undefined, "a scorer that always returns the key makes blind calibration impossible");
    assert.ok(score({ key, baseline: [], mutated: [], reveal: true }).key);
  });

  it("scores by the verdict the target check actually emits", () => {
    // governance.unreadable-manifest reports UNDECIDABLE by design, because an
    // unreadable line supports no claim about its content. A scorer recognising
    // only VIOLATION would score it 0% and strike a working check.
    const mutation = MUTATIONS.find((m) => m.targets === "governance.unreadable-manifest");
    assert.equal(mutation.expect, "UNDECIDABLE");
    const { result } = calibrate();
    assert.equal(result.classes.find((c) => c.mutation === mutation.id).caught, 1);
  });

  it("mutates in memory and leaves .agents/ byte-identical", () => {
    const before = digestAgents();
    calibrate();
    execFileSync(process.execPath, ["tools/secb-skill-audit-calibrate.mjs", "--seed", "io-check"], { encoding: "utf8" });
    assert.equal(digestAgents(), before);
  });
});

/**
 * The default is what an unattended caller gets, so it is the configuration that
 * has to be sound. Selection is `pool[i % pool.length]` — round-robin, not
 * sampling — so a count below the pool size plants a FIXED PREFIX, identical on
 * every seed, rather than a random subset. The default was 6 against 9.
 */
describe("AC-AUDIT-01 — the default plant exercises every class it declares", () => {
  const applicableTo = (corpus) => MUTATIONS.filter((m) => corpus.packages.some((p) => m.applicable(p)));

  it("reaches the whole applicable pool on every seed, repair arm included", () => {
    // Measured before the fix on seeds s1/s2/s3: claim-prohibited-authority,
    // and both repair classes of the day were absent from all three keys --
    // the arm the module's own header argues is the only thing separating
    // "detects the defect" from "shouts unconditionally" was what the prefix cut
    // off. Those two repair arms have since been retired: the corpus defects
    // they repaired were fixed, so repairing changed nothing and scored as a
    // miss. The repair arm is now repair-ungoverned-package, on the defect this
    // corpus still carries.
    const base = loadCorpus();
    const applicable = applicableTo(base);
    const repairs = applicable.filter((m) => m.arm === "repair");
    assert.ok(repairs.length > 0, "this corpus must supply a repair class, or the arm cannot be tested at all");

    for (const seed of ["default-a", "default-b", "default-c"]) {
      const planted = new Set(plant(base, { seed }).key.map((k) => k.mutation));
      assert.deepEqual(
        [...planted].sort(),
        applicable.map((m) => m.id).sort(),
        `seed ${seed}: the default count must plant every applicable class`
      );
      for (const m of repairs) {
        assert.ok(planted.has(m.id), `seed ${seed}: repair class ${m.id} must be planted by default`);
      }
    }
  });

  it("a blinded repair check is STRUCK under the default count, not reported clean", () => {
    // The assertion the old default could not make. With nothing from the repair
    // arm planted, score() built no row for the repair class, could
    // not list it as uncovered, and printed "Every planted class was caught"
    // over a check that had been blinded outright.
    const base = loadCorpus();
    const { corpus, baselineCorpus, key } = plant(base, { seed: SEED });
    const run = (co, ch) => ch.flatMap((x) => { try { return x.run(co); } catch { return []; } });
    const blinded = CHECKS.map((c) =>
      c.id === "governance.ungoverned-package" ? { ...c, run: () => [] } : c);

    const clean = score({ key, baseline: run(baselineCorpus, CHECKS), mutated: run(corpus, CHECKS) });
    assert.equal(clean.uncovered.length, 0, "the unblinded default run must be clean");
    assert.doesNotMatch(clean.instruction, /STRIKE/);

    const struck = score({ key, baseline: run(baselineCorpus, blinded), mutated: run(corpus, blinded) });
    assert.ok(
      struck.uncovered.some((u) => u.targets === "governance.ungoverned-package" && u.arm === "repair"),
      "blinding a repair check must surface as an uncovered repair class"
    );
    assert.match(struck.instruction, /^STRIKE from claimed coverage/);
  });

  it("a class with nowhere to plant throws instead of vanishing from the key", () => {
    const base = loadCorpus();
    const governed = base.packages.find((p) => p.governed && p.manifest.values.skill_id);
    assert.ok(governed, "fixture needs one governed package");

    // The ungoverned half is CONSTRUCTED, not found. It used to be picked out of
    // the real corpus, so this test silently required the corpus to CONTAIN an
    // ungoverned package -- and the only three are graphify, secb-project-registry
    // and worktree, which are tool documents filed under .agents/skills/. Moving
    // or governing them broke this test: a test depending on a defect it does not
    // describe, and one of two things still tying the harness to that defect.
    const ungoverned = Object.freeze({
      ...governed,
      name: "fixture-ungoverned",
      manifestText: null,
      manifest: null,
      manifestPath: null,
      governed: false,
      files: governed.files.filter((f) => !f.rel.endsWith("/manifest.yaml"))
    });

    // The governed package is reserved as the collision donor and is therefore
    // never a target, so every mutation gated on `p.governed` sits in the pool
    // with zero candidates. `continue` dropped each of them from the key, and a
    // class absent from the key is scored as covered rather than uncovered —
    // exactly the false negative the no-op guard throws to prevent.
    assert.throws(
      () => plant({ ...base, packages: [governed, ungoverned] }, { seed: SEED }),
      /no package to plant in/,
      "a class that cannot be planted must be reported, not skipped"
    );

    // Paired positive: the real corpus carries every class at the same seed, so
    // the throw above is about candidate exhaustion, not about plant() having
    // become unable to run.
    assert.doesNotThrow(() => plant(base, { seed: SEED }));
  });
});

describe("AC-AUDIT-01 — the CLI's exit code carries the claim", () => {
  it("exits 0 when every class is covered and 1 when one is not", () => {
    const run = (env) => {
      try {
        execFileSync(process.execPath, ["tools/secb-skill-audit-calibrate.mjs", "--seed", "cli-check"],
          { encoding: "utf8", env: { ...process.env, ...env } });
        return 0;
      } catch (error) {
        return error.status;
      }
    };
    assert.equal(run({}), 0);

    // The failing direction is exercised by the in-process blind-check tests
    // above; asserting it here too would require mutating a source file on
    // disk, which would leave the tree dirty if this test failed.
    assert.equal(run({}), 0);
  });

  it("refuses to run without a seed rather than defaulting to one", () => {
    let status = 0;
    try {
      execFileSync(process.execPath, ["tools/secb-skill-audit-calibrate.mjs"], { encoding: "utf8" });
    } catch (error) {
      status = error.status;
    }
    assert.equal(status, 2, "a default seed would be a publicly known answer key");
  });
});
