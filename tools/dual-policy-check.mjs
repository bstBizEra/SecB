#!/usr/bin/env node
/**
 * dual-policy-check — BOPEN-GOV-EBAG-001 §8, made executable.
 *
 * A policy may never be the sole judge of its own change.
 *
 * WHAT THIS CATCHES
 *
 * A branch changes a guard. The guard now passes. Nobody can tell from a green
 * suite whether the branch satisfied the guard, or edited the guard until the
 * branch satisfied it. Those two are indistinguishable AFTER the fact and the
 * difference is the whole of governance.
 *
 * So both versions are run against the SAME tree:
 *
 *   OLD guard vs NEW tree   ->  did the work satisfy the rule as it stood?
 *   NEW guard vs NEW tree   ->  does the work satisfy the rule as proposed?
 *
 *   old FAIL + new PASS  ->  LOOSENED. The tree broke the old rule and the rule
 *                            moved to accept it. This is the self-approval
 *                            shape, and it is the only verdict that exits non-
 *                            zero. It is not automatically wrong -- a guard can
 *                            be legitimately wrong -- but it must be a disclosed
 *                            decision rather than a green check.
 *   old PASS + new FAIL  ->  TIGHTENED. Fine, and worth seeing.
 *   both PASS            ->  the change was orthogonal to this tree.
 *   both FAIL            ->  the tree violates both. Not a loosening.
 *
 * WHY NOT JUST READ THE DIFF
 *
 * Because "did this edit weaken the rule" is a question about behaviour on a
 * specific tree, not about text. A guard can be rewritten wholesale and stay
 * exactly as strict, or lose its teeth through one flipped comparison. Only
 * running it answers the question.
 *
 * HONEST LIMITS
 *
 *  - A guard deleted outright leaves nothing to run as the new version. Deletion
 *    is reported separately as REMOVED, which is always a loosening in effect.
 *  - An old guard that cannot execute against the new tree (its imports moved,
 *    its fixtures were renamed) is INDETERMINATE, not PASS and not FAIL. Calling
 *    a crash a rejection would manufacture LOOSENED verdicts; calling it a pass
 *    would hide real ones. It is surfaced for a human to read.
 *  - This compares a guard against ONE tree. It cannot tell whether the guard is
 *    a good guard. It answers a narrower question than review, and replaces none
 *    of it.
 *
 * USAGE
 *
 *   node tools/dual-policy-check.mjs [base-ref]      (default: main)
 */

import { execFileSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.argv[2] ?? "main";

const git = (args) => execFileSync("git", args, { cwd: REPO, encoding: "utf8" });

/** A guard is a test file, or the validator every repo-level gate lives in. */
function isGuard(path) {
  return path.endsWith(".test.mjs") || path === "tools/validate-foundation.mjs";
}

/**
 * Run one guard file and reduce it to PASS / FAIL / INDETERMINATE.
 *
 * A non-zero exit is only a FAIL if the process actually got far enough to
 * evaluate something. A module-resolution or parse error means the guard never
 * ran, and reporting that as a rejection would invent a loosening on every
 * refactor that moves a file.
 */
function runGuard(absPath) {
  const isTest = absPath.endsWith(".mjs") && !absPath.endsWith("validate-foundation.mjs");
  const args = isTest ? ["--test", absPath] : [absPath];

  // NODE_TEST_CONTEXT must not reach the child, and this is not a detail.
  //
  // Node sets it for processes spawned by its test runner. A `node --test` that
  // inherits it reports to the parent runner instead of standing on its own:
  // output goes quiet and, fatally here, A FAILING TEST EXITS 0. Verified:
  // exit 1 normally, exit 0 with the variable set, exit 1 with it stripped.
  //
  // Inherited, every guard would read PASS, every pair would classify as
  // UNCHANGED, and this tool would print "No guard was loosened" over a guard
  // that had just been gutted. A governance check whose failure mode is a
  // confident all-clear is worse than no check, so the child gets a clean env
  // rather than a filtered one.
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;

  try {
    execFileSync(process.execPath, args, { cwd: REPO, encoding: "utf8", stdio: "pipe", env });
    return { verdict: "PASS", detail: "" };
  } catch (error) {
    const output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    if (/ERR_MODULE_NOT_FOUND|SyntaxError|Cannot find module|ERR_UNSUPPORTED/.test(output)) {
      return { verdict: "INDETERMINATE", detail: output.split("\n").find((l) => l.trim()) ?? "" };
    }
    const failLine = output.split("\n").find((l) => /^\s*✖|AssertionError|Error:/.test(l));
    return { verdict: "FAIL", detail: (failLine ?? "").trim().slice(0, 160) };
  }
}

function classify(oldVerdict, newVerdict) {
  if (oldVerdict === "INDETERMINATE" || newVerdict === "INDETERMINATE") return "INDETERMINATE";
  if (oldVerdict === "FAIL" && newVerdict === "PASS") return "LOOSENED";
  if (oldVerdict === "PASS" && newVerdict === "FAIL") return "TIGHTENED";
  return "UNCHANGED";
}

function main() {
  let changed;
  try {
    changed = git(["diff", "--name-status", `${BASE}...HEAD`, "--", "tests/", "tools/"])
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [status, ...rest] = line.split("\t");
        return { status: status[0], path: rest[rest.length - 1] };
      })
      .filter((entry) => isGuard(entry.path));
  } catch {
    console.error(`dual-policy-check: cannot diff against '${BASE}'.`);
    process.exit(2);
  }

  if (changed.length === 0) {
    console.log(`dual-policy-check: no guard changed against ${BASE}. Nothing to dual-evaluate.`);
    return;
  }

  const rows = [];
  const temps = [];

  try {
    for (const { status, path } of changed) {
      if (status === "D") {
        rows.push({ path, old: "PASS", new: "REMOVED", delta: "LOOSENED", detail: "guard deleted" });
        continue;
      }
      if (status === "A") {
        const fresh = runGuard(resolve(REPO, path));
        rows.push({ path, old: "n/a", new: fresh.verdict, delta: "NEW", detail: fresh.detail });
        continue;
      }

      // The old copy lands beside the new one so its relative imports still
      // resolve. Named without ".test.mjs" so `npm test`'s glob cannot pick it
      // up if this process is interrupted before cleanup.
      const dir = dirname(resolve(REPO, path));
      const temp = resolve(dir, `dual-policy-base-${basename(path).replace(/\.test\.mjs$/, ".mjs")}`);
      writeFileSync(temp, git(["show", `${BASE}:${path}`]));
      temps.push(temp);

      const before = runGuard(temp);
      const after = runGuard(resolve(REPO, path));
      rows.push({
        path,
        old: before.verdict,
        new: after.verdict,
        delta: classify(before.verdict, after.verdict),
        detail: before.verdict === "FAIL" ? before.detail : after.detail
      });
    }
  } finally {
    for (const temp of temps) if (existsSync(temp)) rmSync(temp);
  }

  const width = Math.max(...rows.map((r) => r.path.length), 4);
  console.log(`dual-policy-check — base ${BASE}, ${rows.length} changed guard(s)\n`);
  console.log(`${"GUARD".padEnd(width)}  ${"OLD".padEnd(14)} ${"NEW".padEnd(14)} DELTA`);
  for (const r of rows) {
    console.log(`${r.path.padEnd(width)}  ${r.old.padEnd(14)} ${r.new.padEnd(14)} ${r.delta}`);
    if (r.detail) console.log(`${" ".repeat(width)}    ${r.detail}`);
  }

  const loosened = rows.filter((r) => r.delta === "LOOSENED");
  const indeterminate = rows.filter((r) => r.delta === "INDETERMINATE");

  if (indeterminate.length > 0) {
    console.log(
      `\n${indeterminate.length} guard(s) INDETERMINATE — the base version could not execute against ` +
        `this tree. Read them; this tool will not guess.`
    );
  }

  if (loosened.length > 0) {
    console.error(
      `\nLOOSENED: ${loosened.length} guard(s) reject this tree as they stood on ${BASE} and accept it ` +
        `as changed here.\n` +
        `This is not automatically wrong. It IS the shape of a change approving itself, so it must be a ` +
        `disclosed decision — name the guard, say what it stopped catching, and say why that is correct — ` +
        `rather than a green check.`
    );
    process.exit(1);
  }

  console.log(`\nNo guard was loosened against ${BASE}.`);
}

main();
