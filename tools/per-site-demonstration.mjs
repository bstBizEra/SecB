#!/usr/bin/env node
/**
 * per-site-demonstration — does EVERY module that emits a refusal demonstrate it?
 *
 * WHY THIS EXISTS
 *
 * tests/deny-path-coverage.test.mjs keys by CODE NAME, and says so in its own
 * comments: one test naming DENY_CLOCK_UNAVAILABLE anywhere clears the entry for
 * all thirteen modules that emit it. That limitation was written down because no
 * check inside a test file can tell which SITE a test actually reached.
 *
 * A check outside the test files can. Rename the code in ONE module, run the
 * tests that reference that module, and see whether anything fails. If nothing
 * does, that module's refusal has never been demonstrated no matter how many
 * other modules demonstrate the same name.
 *
 * 433 distinct DENY_ codes exist in src/; 76 are emitted from more than one
 * module. That is the size of the blind spot this measures.
 *
 * WHAT IT IS NOT
 *
 *  - Not a suite test. It EDITS FILES IN src/ and runs the test runner, which
 *    does not belong inside the suite it is measuring.
 *  - Not proof of a good test. A module counts as demonstrating a refusal if
 *    SOMETHING fails when the code is renamed. That the failing assertion is a
 *    meaningful one is a separate question, and the ratchet's own rule -- assert
 *    the exact code -- is what makes the answer usually yes.
 *
 * SAFETY
 *
 * It refuses to start unless src/ is clean, so restoration is always verifiable
 * as "back to HEAD" rather than "back to whatever I copied". Restoration runs in
 * a finally block AND on SIGINT/SIGTERM, because the first version of this sweep
 * was an inline shell loop that timed out mid-run and left a mutated file behind.
 * That is the reason this is a tool with a trap instead of a loop.
 *
 * USAGE
 *
 *   node tools/per-site-demonstration.mjs DENY_AUDIT_UNAVAILABLE
 *   node tools/per-site-demonstration.mjs DENY_CLOCK_UNAVAILABLE --limit 5
 *   node tools/per-site-demonstration.mjs DENY_AUDIT_UNAVAILABLE --only services/
 *
 * Two screening modes, both one run per module rather than per code:
 *
 *   --screen         rename EVERY deny code in a module; nothing failing means
 *                    none of that module's refusals is demonstrated
 *   --over-refusal   force EVERY guard to fire; nothing failing means no test
 *                    exercises a path THROUGH those guards, so the module's
 *                    permit behaviour is unverified
 *
 * The second is the mirror of the first, and the one a refusal-focused suite is
 * least likely to have covered: a module that refuses everything satisfies every
 * test that only ever asserts refusals.
 *
 * Exit 0 if every emitting module demonstrates the refusal, 1 otherwise.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const git = (...args) => execFileSync("git", args, { cwd: REPO, encoding: "utf8" });
const ls = (p) => git("ls-files", "--", p).split("\n").filter(Boolean);
const read = (rel) => readFileSync(resolve(REPO, rel), "utf8");

const MARKER = "DENY_PER_SITE_PROBE";

// Built rather than written as a literal: an escaped newline inside a string
// has collapsed on its way into this file seven times while it was being
// developed, each time producing a syntax error or a pattern that matched
// nothing. String.fromCharCode leaves nothing to collapse.
const NEWLINE = String.fromCharCode(10);

/** Restore a file to HEAD. Uses git, so "restored" means byte-identical to HEAD. */
const restore = (rel) => git("checkout", "--", rel);

/**
 * Test files that actually IMPORT the module, directly or transitively.
 *
 * The first version matched the module's basename anywhere in the file, which
 * counted PROSE. tests/upstream-deny-paths.test.mjs names upstream-proxy in its
 * header comment while importing only upstream-client and upstream-registry, so
 * the proxy was being screened against a file that never loads it.
 *
 * That over-match was CONSERVATIVE — extra files can only add failures, so it
 * could not have turned an undemonstrated site into a demonstrated one — but it
 * wasted runs and pointed at the wrong tests. Matching import specifiers instead.
 */
function testsReferencing(moduleRel) {
  const base = moduleRel.split("/").pop();
  const direct = ls("tests/").filter((f) => f.endsWith(".mjs") && importsOf(read(f)).some((spec) => spec.endsWith(base)));
  if (direct.length > 0) return direct;
  // Fall back to the basename scan when nothing imports it directly: the module
  // may be reached transitively through a barrel or a sibling service.
  const stem = base.replace(/\.mjs$/, "");
  return ls("tests/").filter((f) => f.endsWith(".mjs") && read(f).includes(stem));
}

const importsOf = (source) =>
  [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]);

/** Failure count from a test run. Inherited NODE_TEST_CONTEXT makes a failing
 *  `node --test` exit 0, so it is stripped — the same trap dual-policy-check hit. */
function failures(testFiles) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  let out = "";
  try {
    out = execFileSync(process.execPath, ["--test", ...testFiles], { cwd: REPO, encoding: "utf8", env });
  } catch (error) {
    out = `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
  const m = /^ℹ fail (\d+)$/m.exec(out) ?? /^# fail (\d+)$/m.exec(out);
  return m ? Number(m[1]) : null;
}

/**
 * SCREEN MODE — the cheap generalisation.
 *
 * Per-code sweeping answers "is this refusal demonstrated where it lives", but
 * costs one test run per (code, module) pair. 433 codes across 122 modules is
 * far more than can be run.
 *
 * So screen instead: rename EVERY DENY_ literal in one module at once and run
 * that module's tests. If nothing fails, NONE of that module's refusals is
 * demonstrated — a strong finding for one run. If something fails, the module
 * has at least some real coverage and deserves a per-code sweep to find which.
 *
 * It cannot tell WHICH refusal is covered. That is the trade: 122 runs instead
 * of thousands, in exchange for a yes/no per module.
 */
function screen(argv) {
  const onlyAt = argv.indexOf("--only");
  const only = onlyAt >= 0 ? argv[onlyAt + 1] : null;
  const limitAt = argv.indexOf("--limit");
  const limit = limitAt >= 0 ? Number(argv[limitAt + 1]) : Infinity;

  recoverResidue();
  const dirty = git("status", "--porcelain", "--", "src/").trim();
  if (dirty) {
    console.error(`src/ is not clean; refusing to run.
${dirty}`);
    return 2;
  }

  const modules = ls("src/")
    .filter((f) => f.endsWith(".mjs") && /["'](DENY_[A-Z0-9_]+)["']/.test(read(f)))
    .filter((f) => (only ? f.includes(only) : true))
    .slice(0, limit);

  console.log(`screen — ${modules.length} module(s) that emit at least one DENY_ code
`);
  const blind = [];
  for (const rel of modules) {
    const tests = testsReferencing(rel);
    const name = rel.replace(/^src\//, "");
    const codes = new Set([...read(rel).matchAll(/["'](DENY_[A-Z0-9_]+)["']/g)].map((m) => m[1]));
    if (tests.length === 0) {
      console.log(`  ${name.padEnd(50)} NO TEST FILE REFERENCES THIS MODULE`);
      blind.push([rel, codes.size]);
      continue;
    }
    try {
      writeFileSync(resolve(REPO, rel), read(rel).replace(/["'](DENY_[A-Z0-9_]+)["']/g, `"${MARKER}"`), "utf8");
      const n = failures(tests);
      if (n === 0) {
        const viaConstants = assertsViaOwnConstants(rel, tests);
        if (viaConstants) {
          console.log(
            `  ${name.padEnd(50)} INCONCLUSIVE — ${viaConstants.file.replace("tests/", "")} asserts through this ` +
            `module's own exported constants (${viaConstants.names.join(", ")}), which a literal rename cannot detect`
          );
        } else {
          console.log(`  ${name.padEnd(50)} NONE OF ITS ${String(codes.size).padStart(2)} REFUSALS IS DEMONSTRATED`);
          blind.push([rel, codes.size]);
        }
      } else if (n === null) {
        console.log(`  ${name.padEnd(50)} could not read a failure count`);
      }
    } finally {
      restore(rel);
    }
  }

  const still = git("status", "--porcelain", "--", "src/").trim();
  if (still) {
    console.error(`
src/ DID NOT RESTORE CLEANLY:
${still}`);
    return 2;
  }
  console.log(`
src/ restored to HEAD.`);
  if (blind.length === 0) {
    console.log("Every module screened has at least one demonstrated refusal.");
    return 0;
  }
  console.log(`
${blind.length} module(s) where renaming EVERY deny code changed nothing:`);
  for (const [rel, count] of blind) console.log(`  ${rel}  (${count} code(s))`);
  return 1;
}


/**
 * OVER-REFUSAL SCREEN — the mirror of everything else this tool does.
 *
 * Every measurement here so far asks "is this refusal demonstrated". A suite
 * that only ever asserts refusals is satisfied by a module that refuses
 * EVERYTHING, and on a governance control plane that is not a harmless failure:
 * refusing legitimate work is how a system that looks maximally safe stops
 * being usable, and nothing in a refusal-only suite would say so.
 *
 * So: force every one-line `if (COND) deny(...)` guard in one module to fire,
 * and run that module's tests. If they still pass, no test exercises a path THROUGH
 * those guards — the module's permit behaviour is unverified.
 *
 * LIMIT, STATED. Only the one-line shape is rewritten: 245 of 910 refusal sites
 * in src/. A module whose guards are all multi-line is not exercised by this and
 * is reported as NOT APPLICABLE rather than as passing.
 */
function overRefusal(argv) {
  const onlyAt = argv.indexOf("--only");
  const only = onlyAt >= 0 ? argv[onlyAt + 1] : null;

  recoverResidue();
  const dirty = git("status", "--porcelain", "--", "src/").trim();
  if (dirty) {
    console.error(`src/ is not clean; refusing to run.
${dirty}`);
    return 2;
  }

  // Two guard shapes, both rewritten to `if (true)`. Done line-wise rather than
  // with a cross-line regex: the multi-line shape is `if (COND) {` followed by a
  // line whose first statement is the refusal, and matching that with a single
  // pattern across newlines is exactly the kind of regex that silently matches
  // nothing. Line-wise, a miss is visible as a lower guard count.
  const forceGuards = (source) => {
    const lines = source.split(NEWLINE);
    let forced = 0;
    const isRefusal = (l) => /^\s*(return\s+)?deny\(|^\s*throw new \w*Error\(/.test(l);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!/^\s*if \(/.test(line) || /^\s*if \(true\)/.test(line)) continue;
      const oneLine = /^(\s*)if \(.*\)\s*(return\s+)?(deny|throw)/.exec(line);
      if (oneLine) {
        lines[i] = line.replace(/^(\s*)if \(.*?\)(\s*)/, "$1if (true)$2");
        forced += 1;
        continue;
      }
      // `if (COND) {` whose block opens with the refusal.
      if (/\)\s*\{\s*$/.test(line) && i + 1 < lines.length && isRefusal(lines[i + 1])) {
        lines[i] = line.replace(/^(\s*)if \(.*\)(\s*\{\s*)$/, "$1if (true)$2");
        forced += 1;
      }
    }
    return { source: lines.join(NEWLINE), forced };
  };
  const modules = ls("src/")
    .filter((f) => f.endsWith(".mjs"))
    .filter((f) => (only ? f.includes(only) : true));

  console.log("over-refusal screen — forcing every one-line guard to fire");
  console.log("");
  const unverified = [];
  let applicable = 0;
  for (const rel of modules) {
    const source = read(rel);
    const { source: forcedSource, forced } = forceGuards(source);
    if (forced === 0) continue;
    const guards = { length: forced };
    const tests = testsReferencing(rel);
    const name = rel.replace(/^src\//, "");
    if (tests.length === 0) continue;
    applicable += 1;
    try {
      writeFileSync(resolve(REPO, rel), forcedSource, "utf8");
      const n = failures(tests);
      if (n === 0) {
        console.log(`  ${name.padEnd(50)} PERMIT PATH UNVERIFIED (${guards.length} guard(s) forced)`);
        unverified.push([rel, guards.length]);
      } else if (n === null) {
        console.log(`  ${name.padEnd(50)} could not read a failure count`);
      } else {
        // Printed rather than passed over in silence. A screen that only speaks
        // on failure is indistinguishable from one whose mutation never applied
        // — both are quiet. This number is the evidence that forcing the guards
        // actually changed something a test could see.
        console.log(`  ${name.padEnd(50)} ${String(n).padStart(3)} test(s) notice (${guards.length} forced)`);
      }
    } finally {
      restore(rel);
    }
  }

  const still = git("status", "--porcelain", "--", "src/").trim();
  if (still) {
    console.error(`
src/ DID NOT RESTORE CLEANLY:
${still}`);
    return 2;
  }
  console.log(`
${applicable} module(s) had a one-line guard to force. src/ restored to HEAD.`);
  if (unverified.length === 0) {
    console.log("Every applicable module has a test that notices when its guards refuse everything.");
    return 0;
  }
  console.log(`
${unverified.length} module(s) whose tests pass while the module refuses everything:`);
  for (const [rel, count] of unverified) console.log(`  ${rel}  (${count} guard(s))`);
  return 1;
}

function recoverResidue() {
  for (const rel of ls("src/")) {
    if (!rel.endsWith(".mjs")) continue;
    if (!read(rel).includes(MARKER)) continue;
    restore(rel);
    console.error(`recovered ${rel} — a previous run was killed while it was mutated.`);
  }
}


/**
 * Does any of these tests assert through the module's OWN exported DENY_
 * constants rather than through a literal?
 *
 * If so, a literal rename is INVISIBLE: the module returns the renamed value and
 * the test compares it against the same renamed value, imported from the same
 * place. Both sides move together and nothing fails.
 *
 * This is not a hypothetical. The screen first reported
 * src/security/redaction-policy.mjs as having none of its three refusals
 * demonstrated. tests/conformance-v011-redaction.test.mjs imports all three
 * constants and asserts result.code against them — the refusals ARE
 * demonstrated, and the tool was wrong. A "0 failures" result there means
 * "this method cannot see it", not "nothing covers it", and the two must not
 * print the same word.
 */
function assertsViaOwnConstants(moduleRel, testFiles) {
  const exported = [...read(moduleRel).matchAll(/export const (DENY_[A-Z0-9_]+)\s*=/g)].map((m) => m[1]);
  if (exported.length === 0) return null;
  const base = moduleRel.split("/").pop();
  for (const f of testFiles) {
    const source = read(f);
    if (!importsOf(source).some((spec) => spec.endsWith(base))) continue;
    // `\\b`, not `\b`: inside a template literal a bare \b is the BACKSPACE
    // character, so the pattern silently matched nothing and every module came
    // back as blind. Fourth time an escape has collapsed on its way into a file
    // in this repository; it is always this shape.
    const used = exported.filter((name) => new RegExp(`\\b${name}\\b`).test(source));
    if (used.length > 0) return { file: f, names: used };
  }
  return null;
}

function main(argv) {
  if (argv.includes("--screen")) return screen(argv);
  if (argv.includes("--over-refusal")) return overRefusal(argv);
  const code = argv.find((a) => a.startsWith("DENY_"));
  if (!code) {
    console.error("usage: node tools/per-site-demonstration.mjs DENY_SOME_CODE [--limit N]");
    return 2;
  }
  const limitAt = argv.indexOf("--limit");
  const limit = limitAt >= 0 ? Number(argv[limitAt + 1]) : Infinity;
  // --only lets a large code be swept in pieces. Some modules pull in dozens of
  // test files, and a sweep that cannot finish reports nothing at all.
  const onlyAt = argv.indexOf("--only");
  const only = onlyAt >= 0 ? argv[onlyAt + 1] : null;

  // RECOVER OUR OWN RESIDUE FIRST. If a previous run was killed mid-mutation,
  // the leftover file contains MARKER — a string that exists nowhere else in the
  // repository — so it is provably this tool's and safe to restore. Anything
  // else that is dirty is the operator's and is never touched.
  for (const rel of ls("src/")) {
    if (!rel.endsWith(".mjs")) continue;
    if (!read(rel).includes(MARKER)) continue;
    restore(rel);
    console.error(`recovered ${rel} — a previous run was killed while it was mutated.`);
  }

  const dirty = git("status", "--porcelain", "--", "src/").trim();
  if (dirty) {
    console.error("src/ is not clean. This tool edits src/ and restores with `git checkout --`,");
    console.error("which would discard your changes. Commit or stash first.\n");
    console.error(dirty);
    return 2;
  }

  const emitters = ls("src/")
    .filter((f) => f.endsWith(".mjs") && read(f).includes(`"${code}"`))
    .filter((f) => (only ? f.includes(only) : true))
    .slice(0, limit);
  if (emitters.length === 0) {
    console.error(`No module in src/ emits ${code}.`);
    return 2;
  }

  console.log(`per-site-demonstration — ${code}, ${emitters.length} emitting module(s)\n`);
  const undemonstrated = [];
  let current = null;
  // A SIGNAL HANDLER IS NOT ENOUGH AND THIS IS WHY THE RECOVERY ABOVE EXISTS.
  // The test run below is SYNCHRONOUS, so it blocks the event loop for exactly
  // the interval during which a file is mutated — the handler cannot fire in the
  // window it was written to cover. It was tested: a kill mid-sweep left a
  // mutated file behind, twice. The handler is kept for the case where the
  // signal lands between modules; the marker recovery is what actually holds.
  const onSignal = () => { if (current) restore(current); process.exit(130); };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  for (const rel of emitters) {
    const tests = testsReferencing(rel);
    const name = rel.replace(/^src\//, "");
    if (tests.length === 0) {
      console.log(`  ${name.padEnd(50)} NO TEST FILE REFERENCES THIS MODULE`);
      undemonstrated.push(rel);
      continue;
    }
    current = rel;
    try {
      writeFileSync(resolve(REPO, rel), read(rel).replaceAll(`"${code}"`, `"${MARKER}"`), "utf8");
      const n = failures(tests);
      if (n === null) console.log(`  ${name.padEnd(50)} COULD NOT READ A FAILURE COUNT`);
      else if (n === 0) {
        const viaConstants = assertsViaOwnConstants(rel, tests);
        if (viaConstants) {
          console.log(`  ${name.padEnd(50)} INCONCLUSIVE — asserted via this module's own exported constant`);
        } else {
          console.log(`  ${name.padEnd(50)} UNDEMONSTRATED`);
          undemonstrated.push(rel);
        }
      }
      else console.log(`  ${name.padEnd(50)} demonstrated (${n} failing)`);
    } finally {
      restore(rel);
      current = null;
    }
  }

  const stillDirty = git("status", "--porcelain", "--", "src/").trim();
  if (stillDirty) {
    console.error(`\nsrc/ DID NOT RESTORE CLEANLY:\n${stillDirty}`);
    return 2;
  }

  console.log(`\nsrc/ restored to HEAD.`);
  if (undemonstrated.length === 0) {
    console.log(`Every module emitting ${code} demonstrates it.`);
    return 0;
  }
  console.log(`\n${undemonstrated.length} module(s) emit ${code} without any test demonstrating it there:`);
  for (const rel of undemonstrated) console.log(`  ${rel}`);
  console.log("\nThe ratchet cannot see this: it keys by code name, and these names are");
  console.log("demonstrated elsewhere. Write a case against THIS module.");
  return 1;
}

process.exit(main(process.argv.slice(2)));
