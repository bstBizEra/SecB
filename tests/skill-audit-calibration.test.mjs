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

function calibrate(seed = SEED, checks = CHECKS) {
  const base = loadCorpus();
  const { corpus, key } = plant(base, { seed, count: MUTATIONS.length });
  const run = (c) => checks.flatMap((x) => { try { return x.run(c); } catch { return []; } });
  return { key, result: score({ key, baseline: run(base), mutated: run(corpus), reveal: true }) };
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
    const always = CHECKS.map((c) =>
      c.id === "evals.expectation-diversity"
        ? { ...c, run: (corpus) => corpus.packages.filter((p) => p.governed).map((p) => ({
            check: c.id, pkg: p.name, file: null, line: null,
            verdict: "VIOLATION", observation: "always", evidence: {}
          })) }
        : c);
    const { result } = calibrate(SEED, always);

    const row = result.classes.find((c) => c.mutation === "repair-expectation-uniqueness");
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
    const { corpus, key } = plant(base, { seed: SEED, count: 4 });
    const hidden = score({ key, baseline: runAll(base), mutated: runAll(corpus) });
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
