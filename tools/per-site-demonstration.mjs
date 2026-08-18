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

/** Restore a file to HEAD. Uses git, so "restored" means byte-identical to HEAD. */
const restore = (rel) => git("checkout", "--", rel);

function testsReferencing(moduleRel) {
  const base = moduleRel.split("/").pop().replace(/\.mjs$/, "");
  return ls("tests/").filter((f) => f.endsWith(".mjs") && read(f).includes(base));
}

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

function main(argv) {
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
      else if (n === 0) { console.log(`  ${name.padEnd(50)} UNDEMONSTRATED`); undemonstrated.push(rel); }
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
