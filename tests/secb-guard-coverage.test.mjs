/**
 * WP-GOV-UC1 — a file must never be left with zero byte-identity coverage.
 *
 * The acceptance criteria this pins are not hypotheticals. Each one is a way the
 * producer's own measurement was wrong before it was right:
 *
 *   AC-UC1-02  a check that fired on ANY coverage drop would fire on #94 for the
 *              wrong reason, and would fire on every legitimate re-pin
 *   AC-UC1-03  comparing the BRANCH instead of the MERGE RESULT reported 27
 *              files at zero across eight PRs; the true number is 1
 *   AC-UC1-04  70 paths are named inside guards on main and only 43 exist; the
 *              rest are fixtures like src/moduleA/a.mjs
 *   AC-UC1-05  the first method read exclusion COMMENTS and would have gone
 *              blind the moment anyone reworded one, and could never have seen
 *              a removal made with no comment at all
 *
 * The pure cases are hermetic. The integration cases skip when their fixture
 * branch is absent, so deleting a merged branch does not turn this suite red for
 * an unrelated reason — but AC-UC1-05, the one that matters most, is hermetic.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import {
  coverageFrom, stripComments, coverage, mergeResult, gaps
} from "../tools/secb-guard-coverage.mjs";

const has = (rev) => {
  try {
    execFileSync("git", ["rev-parse", "--quiet", "--verify", `${rev}^{commit}`],
      { stdio: ["ignore", "ignore", "ignore"] });
    return true;
  } catch { return false; }
};

const MAIN = "origin/main";
const PR94 = "origin/bst/mod-wspace-s2-overlap-case-fix-001";
const PR91 = "origin/bst/mod-runtime-s1-checkpoint-ordering-fix-001";
const PR88 = "origin/bst/mod-evid-s2-s3-ledger-rehydration-fix-001";

// ---------------------------------------------------------------- pure cases

const guardText = (files) => `
  test("byte-identity: these are unchanged", () => {
    const PROTECTED = [
${files.map((f) => `      "${f}",`).join("\n")}
    ];
  });
`;

describe("WP-GOV-UC1 / AC-UC1-05 — independent of comment wording", () => {
  const real = new Set(["src/a.mjs", "src/b.mjs"]);

  it("rewording or deleting an exclusion comment changes nothing", () => {
    const withComment = `
      // src/b.mjs is intentionally EXCLUDED here by some-branch: a disclosed fix.
      ${guardText(["src/a.mjs"])}`;
    const reworded = `
      /* b is left out on purpose, see the branch record */
      ${guardText(["src/a.mjs"])}`;
    const noComment = guardText(["src/a.mjs"]);

    const of = (src) => [...coverageFrom(new Map([["tests/g.test.mjs", src]]), real).keys()].sort();

    assert.deepEqual(of(withComment), ["src/a.mjs"]);
    assert.deepEqual(of(reworded), ["src/a.mjs"]);
    assert.deepEqual(of(noComment), ["src/a.mjs"],
      "the result must not depend on a comment existing at all");
  });

  it("catches a SILENT removal — the case comment scanning cannot see", () => {
    // This is the whole argument for reading coverage instead of exclusions.
    const before = coverageFrom(new Map([["tests/g.test.mjs", guardText(["src/a.mjs", "src/b.mjs"])]]), real);
    const after = coverageFrom(new Map([["tests/g.test.mjs", guardText(["src/a.mjs"])]]), real);

    assert.equal(before.get("src/b.mjs")?.size, 1, "covered before");
    assert.equal(after.get("src/b.mjs"), undefined,
      "removed with no comment whatsoever, and still detected");
  });

  it("a commented-out entry is not counted as coverage", () => {
    const disabled = `
      test("byte-identity", () => {
        const PROTECTED = [
          "src/a.mjs",
          // "src/b.mjs",
        ];
      });`;
    const cov = coverageFrom(new Map([["tests/g.test.mjs", disabled]]), real);
    assert.equal(cov.get("src/b.mjs"), undefined,
      "a disabled entry protects nothing and must not read as protection");
    // Positive arm: the live entry above it still counts, so the assertion is
    // about the comment and not about the parser having failed entirely.
    assert.equal(cov.get("src/a.mjs")?.size, 1);
  });

  it("a file named only in a NON-guard test is not coverage", () => {
    const notAGuard = `test("unrelated", () => { load("src/a.mjs"); });`;
    assert.equal(coverageFrom(new Map([["tests/x.test.mjs", notAGuard]]), real).size, 0);
  });

  it("stripComments leaves code intact", () => {
    assert.match(stripComments('const a = "src/a.mjs"; // gone'), /src\/a\.mjs/);
    assert.doesNotMatch(stripComments("// only a comment\n"), /comment/);
  });
});

describe("WP-GOV-UC1 / AC-UC1-04 — a named path counts only if it is a real file", () => {
  it("fixture paths inside a guard are not coverage", () => {
    const src = guardText(["src/real.mjs", "src/moduleA/a.mjs", "src/x.mjs"]);
    const cov = coverageFrom(new Map([["tests/g.test.mjs", src]]), new Set(["src/real.mjs"]));
    assert.deepEqual([...cov.keys()], ["src/real.mjs"]);
  });

  it("on main, fewer paths are real than are named", { skip: !has(MAIN) }, () => {
    // Pins the observed shape: guards name fixture paths, so an implementation
    // that stops filtering would inflate coverage and hide gaps.
    const withFilter = coverage(MAIN);
    const named = coverageFrom(
      new Map([...withFilter.keys()].length ? collectGuards(MAIN) : []), null);
    assert.ok(named.size > withFilter.size,
      `expected more named paths than real ones; got named=${named.size} real=${withFilter.size}`);
  });

  function collectGuards(rev) {
    const listing = execFileSync("git", ["ls-tree", "-r", "--name-only", rev], { encoding: "utf8" });
    const out = [];
    for (const f of listing.split("\n")) {
      if (!f.startsWith("tests/") || !f.endsWith(".test.mjs")) continue;
      out.push([f, execFileSync("git", ["show", `${rev}:${f}`], { encoding: "utf8", maxBuffer: 1 << 28 })]);
    }
    return out;
  }
});

// --------------------------------------------------------- integration cases

describe("WP-GOV-UC1 / AC-UC1-01 and AC-UC1-02 — the failing and passing arms", () => {
  it("#94 leaves a file with no guard and is reported", { skip: !has(MAIN) || !has(PR94) }, () => {
    const tree = mergeResult(MAIN, PR94);
    assert.ok(tree, "#94 should merge cleanly; if it now conflicts this needs re-scoping");
    const found = gaps(MAIN, tree);
    assert.ok(found.some((g) => g.src === "src/control/overlap-policy.mjs"),
      `expected overlap-policy.mjs to lose all coverage; got ${JSON.stringify(found)}`);
  });

  it("#91 loses SOME coverage and must PASS", { skip: !has(MAIN) || !has(PR91) }, () => {
    // The arm that makes the one above mean something. A check that fired on any
    // drop would fail here too, and would then be failing on #94 for the wrong
    // reason - and on every legitimate re-pin forever after.
    const tree = mergeResult(MAIN, PR91);
    assert.ok(tree);
    assert.deepEqual(gaps(MAIN, tree), [],
      "#91's excluded file keeps two guards, so it is not a coverage gap");
  });
});

describe("WP-GOV-UC1 / AC-UC1-03 — the comparison is the merge result, not the branch", () => {
  it("#88's branch looks catastrophic and its merge result is clean", { skip: !has(MAIN) || !has(PR88) }, () => {
    // Branch-vs-main reported 14 files at zero for #88 alone. Every one was the
    // branch predating a guard on main, not the branch removing anything.
    const branchGaps = gaps(MAIN, PR88);
    const mergeGaps = gaps(MAIN, mergeResult(MAIN, PR88));

    assert.ok(branchGaps.length > 0,
      "if the branch comparison ever stops looking bad, this regression no longer pins anything");
    assert.deepEqual(mergeGaps, [],
      "the merge result must be clean - measuring the branch is the bug this pins");
  });
});

describe("WP-GOV-UC1 / AC-UC1-06 — controls", () => {
  it("main merged with itself reports no gaps", { skip: !has(MAIN) }, () => {
    assert.deepEqual(gaps(MAIN, mergeResult(MAIN, MAIN)), []);
  });

  it("the detector can see coverage at all", { skip: !has(MAIN) }, () => {
    // Without this, every zero above is equally consistent with a dead detector.
    assert.ok(coverage(MAIN).size > 0, "a detector that sees no coverage reports no gaps");
  });

  it("a conflicted merge yields null rather than a measurement", () => {
    assert.equal(mergeResult(MAIN, "refs/heads/no-such-branch-xyz"), null);
  });
});
