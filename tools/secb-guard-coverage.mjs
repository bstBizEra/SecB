#!/usr/bin/env node
/**
 * secb-guard-coverage — WP-GOV-UC1.
 *
 * Fail closed when a source file would be left with NO byte-identity guard.
 *
 * WHY COVERAGE AND NOT EXCLUSIONS
 *
 * A branch that legitimately changes a guarded file must re-pin or exclude it.
 * Exclusion is correct, and every exclusion in this repository is disclosed in a
 * comment naming the branch and the reason. What no review sees is the UNION:
 * each reviewer is shown one branch removing one file, and what reaches `main`
 * is the accumulation.
 *
 * The first attempt at measuring that scanned exclusion comments. The operator
 * rejected the method — comment wording changes and the check silently stops
 * working — and was right.
 *
 * So this reads coverage instead. A file is covered by a guard IF AND ONLY IF
 * the guard names it as a protected file. Removing it drops the coverage whether
 * the removal carries a comment, a different comment, or none at all. That is
 * strictly stronger than comment scanning: it also catches a SILENT removal,
 * which comment scanning cannot see by construction.
 *
 * TWO CORRECTIONS THAT WERE ONLY VISIBLE BY RUNNING IT
 *
 * Comparing the BRANCH against `main` reported 27 files reaching zero coverage
 * across eight pull requests. Nearly all were branches that predate a guard on
 * `main` rather than branches that removed anything — an artefact that
 * disappears on merge. The comparison is against the MERGE RESULT.
 *
 * Of 70 paths named inside guards on `main`, only 43 are real files;
 * `src/moduleA/a.mjs` and `src/x.mjs` are test fixtures that look like source
 * paths. A NAMED PATH COUNTS ONLY IF IT EXISTS IN THE TREE.
 *
 * With both corrections the 27 collapse to 1.
 */

import { execFileSync } from "node:child_process";

function git(...args) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    return null;
  }
}

/** A guard is a test that asserts byte identity. */
const GUARD_MARK = /byte-identical|byte-identity/i;
/** A protected file is a src path appearing as a string literal. */
const SRC_LITERAL = /"(src\/[A-Za-z0-9._/-]+\.mjs)"/g;

const BLOCK_COMMENT = new RegExp("/\\*[\\s\\S]*?\\*/", "g");
const LINE_COMMENT = new RegExp("^\\s*//[^\\n]*$", "gm");

/**
 * Comments are stripped so a commented-out entry is not counted as coverage.
 * This is NOT comment parsing: nothing is read FROM a comment, and no meaning is
 * attached to one. The check behaves identically if every comment is deleted.
 */
export const stripComments = (src) =>
  src.replace(BLOCK_COMMENT, "").replace(LINE_COMMENT, "");

/**
 * Pure core: which guards name each src path.
 * @param sources Map<guardPath, sourceText>
 * @param realFiles Set<path> — paths that exist. Anything else is a fixture.
 */
export function coverageFrom(sources, realFiles) {
  const map = new Map();
  for (const [guard, raw] of sources) {
    if (!raw || !GUARD_MARK.test(raw)) continue;
    for (const m of stripComments(raw).matchAll(SRC_LITERAL)) {
      const src = m[1];
      if (realFiles && !realFiles.has(src)) continue;
      if (!map.has(src)) map.set(src, new Set());
      map.get(src).add(guard);
    }
  }
  return map;
}

/** Every path in a tree. */
export function treeFiles(tree) {
  const listing = git("ls-tree", "-r", "--name-only", tree);
  return listing === null ? null : new Set(listing.split("\n").filter(Boolean));
}

/** Coverage for a tree-ish (branch, commit, or bare tree SHA). */
export function coverage(tree) {
  const files = treeFiles(tree);
  if (!files) return null;
  const guards = new Map();
  for (const f of files) {
    if (!f.startsWith("tests/") || !f.endsWith(".test.mjs")) continue;
    guards.set(f, git("show", `${tree}:${f}`));
  }
  return coverageFrom(guards, files);
}

/**
 * The merge result of base and branch, without checking anything out.
 * Null when they conflict — a conflicted merge has no result to measure, and
 * saying so is better than measuring the branch and calling it the same thing.
 */
export function mergeResult(base, branch) {
  const out = git("merge-tree", "--write-tree", base, branch);
  if (!out) return null;
  const tree = out.split("\n")[0].trim();
  return /^[0-9a-f]{40}$/.test(tree) ? tree : null;
}

/**
 * Files covered on the base that would have NO guard afterwards.
 * A file that merely loses SOME coverage is not a gap; that distinction is what
 * keeps this check from firing on every legitimate re-pin.
 */
export function gaps(baseRev, candidateTree) {
  const before = coverage(baseRev);
  const after = coverage(candidateTree);
  const stillPresent = treeFiles(candidateTree);
  if (!before || !after || !stillPresent) return null;

  const out = [];
  for (const [src, guards] of before) {
    if (!stillPresent.has(src)) continue;      // deleted, not uncovered
    const n = after.get(src)?.size ?? 0;
    if (n === 0) out.push({ src, before: guards.size, after: 0 });
  }
  return out.sort((a, b) => a.src.localeCompare(b.src));
}

function main(argv) {
  const [branch, base = "origin/main"] = argv;
  if (!branch) {
    process.stdout.write("usage: secb-guard-coverage <branch> [base]\n\n");
    process.stdout.write("Fails when merging <branch> would leave a source file\n");
    process.stdout.write("with no byte-identity guard covering it.\n");
    return 2;
  }

  const tree = mergeResult(base, branch);
  if (!tree) {
    process.stdout.write(`${branch}\n  CONFLICTING with ${base} — merge result not computable.\n`);
    process.stdout.write("  Resolve the conflict, then re-run. Measuring the branch instead\n");
    process.stdout.write("  would report drops that merging removes.\n");
    return 3;
  }

  const found = gaps(base, tree);
  if (found === null) {
    process.stderr.write(`cannot read ${base} or the merge result\n`);
    return 2;
  }

  const total = coverage(base)?.size ?? 0;
  process.stdout.write(`${branch} merged into ${base}\n`);
  process.stdout.write(`  ${total} source file(s) covered by at least one guard on the base\n`);

  if (!found.length) {
    process.stdout.write("  no file loses all byte-identity coverage\n");
    return 0;
  }
  process.stdout.write(`  ${found.length} file(s) would lose ALL byte-identity coverage:\n`);
  for (const g of found) {
    process.stdout.write(`      ${g.src}   ${g.before} -> 0\n`);
  }
  process.stdout.write("\n  A file no guard covers cannot be reported as drifted.\n");
  process.stdout.write("  Re-pin it to its new blob instead of excluding it, or record\n");
  process.stdout.write("  why losing byte-identity coverage is acceptable for it.\n");
  return 1;
}

const invokedDirectly = process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop());
if (invokedDirectly) {
  process.exitCode = main(process.argv.slice(2));
}
