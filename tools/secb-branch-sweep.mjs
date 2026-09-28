#!/usr/bin/env node
/**
 * secb-branch-sweep — batch-delete local branches whose work is already in the base.
 *
 * WHY THIS EXISTS
 *
 * On 2026-09-28 this repository carried 527 local branches, 380 of them fully
 * merged. Sorting them by hand took a dozen ad-hoc commands, and two of the
 * shortcuts taken on the way were wrong in ways worth pinning:
 *
 *   1. "Every patch is already on main" (`git cherry` reports no `+`) was
 *      treated as "safe to delete". It is not: `git cherry` skips merge
 *      commits, so a branch whose only unique content is a hand-made conflict
 *      resolution reads as fully landed. One such branch held 1615 resolved
 *      lines that existed nowhere else.
 *
 *   2. Deleting a branch can orphan a commit that a detached review worktree
 *      is still sitting on, when that branch was the only ref reaching it.
 *
 * DESIGN RULE: a branch is deleted only when deleting it provably loses
 * nothing. Two tests qualify, and nothing weaker does:
 *
 *   merged  the tip is an ancestor of the base (what `git branch -d` accepts)
 *   noop    merging the branch into the base would leave the base's tree
 *           unchanged (`git merge-tree --write-tree`), so every change it
 *           carries, including any merge resolution, is already there
 *
 * Everything else is kept and the reason is stated. `patch-equivalent` names
 * the trap in (1): all patches are on the base, yet merging would still change
 * or conflict, so something only this branch holds may remain.
 *
 * Dry run by default. --apply writes a restore script BEFORE deleting, and
 * each delete is compare-and-swap against the planned commit, so a branch that
 * moved after planning is skipped rather than lost.
 *
 * This tool deletes local refs only. It never touches remotes, worktrees, or
 * the working tree.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// preserve-* is the convention for commits rescued from deleted worktrees;
// they look unmerged by design and must never be swept.
export const DEFAULT_PROTECT = "^(main|master)$|(^|/)preserve-";

function git(cwd, ...args) {
  try {
    return execFileSync("git", args, {
      cwd, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    return null;
  }
}

function gitOk(cwd, ...args) {
  return spawnSync("git", args, { cwd, stdio: "ignore" }).status === 0;
}

/** Branches checked out in any worktree, and the commits detached worktrees sit on. */
export function worktreeState(cwd) {
  const out = git(cwd, "worktree", "list", "--porcelain") ?? "";
  const checkedOut = new Set();
  const detachedHeads = [];
  for (const block of out.split(/\r?\n\r?\n/)) {
    const head = block.match(/^HEAD ([0-9a-f]+)$/m)?.[1];
    const branch = block.match(/^branch refs\/heads\/(.+)$/m)?.[1];
    if (branch) checkedOut.add(branch);
    else if (head && /^detached$/m.test(block)) detachedHeads.push(head);
  }
  return { checkedOut, detachedHeads };
}

export function localBranches(cwd) {
  const out = git(cwd, "for-each-ref", "--format=%(objectname) %(refname)", "refs/heads") ?? "";
  return out.split("\n").filter(Boolean).map((line) => {
    const [sha, ref] = line.split(" ");
    return { branch: ref.replace(/^refs\/heads\//, ""), sha };
  });
}

/**
 * Would merging `sha` into the base change the base's tree?
 * Returns "noop", "changes", "conflicts", or "unverifiable" (git too old for
 * `merge-tree --write-tree`, or any other failure — fails closed).
 */
export function mergeEffect(cwd, base, sha) {
  const r = spawnSync("git", ["merge-tree", "--write-tree", base, sha], { cwd, encoding: "utf8" });
  const tree = (r.stdout ?? "").split("\n")[0].trim();
  // Status 1 means "conflicts" only when a tree was written. git also exits 1
  // on a bad object, with no tree on stdout — that is an error, not a verdict.
  if (!/^[0-9a-f]{40}([0-9a-f]{24})?$/.test(tree)) return "unverifiable";
  if (r.status === 1) return "conflicts";
  if (r.status !== 0) return "unverifiable";
  return tree === git(cwd, "rev-parse", `${base}^{tree}`)?.trim() ? "noop" : "changes";
}

function uniquePatches(cwd, base, sha) {
  return (git(cwd, "cherry", base, sha) ?? "").split("\n").filter((l) => l.startsWith("+")).length;
}

/**
 * Classify every local branch. Pure read: nothing is modified.
 * Each row: { branch, sha, action: "DELETE"|"KEEP", reason, unique? }
 */
export function planSweep({ cwd = process.cwd(), base = "main", protect = DEFAULT_PROTECT } = {}) {
  const baseSha = git(cwd, "rev-parse", "--verify", "--quiet", `refs/heads/${base}`)?.trim();
  if (!baseSha) throw new Error(`base branch not found: ${base}`);
  const protectRe = new RegExp(protect);
  const { checkedOut, detachedHeads } = worktreeState(cwd);

  const rows = localBranches(cwd).map(({ branch, sha }) => {
    const keep = (reason, extra = {}) => ({ branch, sha, action: "KEEP", reason, ...extra });
    if (branch === base) return keep("base");
    if (checkedOut.has(branch)) return keep("worktree");
    if (protectRe.test(branch)) return keep("protected");
    if (gitOk(cwd, "merge-base", "--is-ancestor", sha, baseSha)) {
      return { branch, sha, action: "DELETE", reason: "merged" };
    }
    const effect = mergeEffect(cwd, baseSha, sha);
    if (effect === "noop") return { branch, sha, action: "DELETE", reason: "noop" };
    if (effect === "unverifiable") return keep("unverifiable");
    const unique = uniquePatches(cwd, baseSha, sha);
    return unique > 0 ? keep("unique", { unique }) : keep("patch-equivalent");
  });

  // A detached worktree HEAD outside the base must stay reachable. If every
  // branch reaching it is slated for deletion, keep all of them.
  for (const head of detachedHeads) {
    if (gitOk(cwd, "merge-base", "--is-ancestor", head, baseSha)) continue;
    const reaching = rows.filter((r) => gitOk(cwd, "merge-base", "--is-ancestor", head, r.sha));
    if (reaching.length && reaching.every((r) => r.action === "DELETE")) {
      for (const r of reaching) Object.assign(r, { action: "KEEP", reason: "pins-worktree" });
    }
  }
  return { base, baseSha, rows };
}

/** POSIX single-quote. Git permits ; $ ' & | in branch names. */
const shq = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;

/**
 * Shell script recreating every DELETE row at its planned commit. The empty
 * old-value makes update-ref refuse to overwrite a branch that exists again.
 */
export function restoreScript(plan) {
  const lines = ["#!/usr/bin/env sh", `# secb-branch-sweep restore — base ${plan.base} @ ${plan.baseSha}`];
  for (const r of plan.rows.filter((row) => row.action === "DELETE")) {
    lines.push(`git update-ref ${shq(`refs/heads/${r.branch}`)} ${r.sha} ''`);
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Delete the DELETE rows. Writes the restore script first. Re-reads worktree
 * state so a branch checked out since planning is skipped, and deletes with
 * compare-and-swap so a branch that moved since planning is skipped.
 */
export function applySweep(plan, { cwd = process.cwd(), restorePath } = {}) {
  writeFileSync(restorePath, restoreScript(plan));
  const { checkedOut } = worktreeState(cwd);
  const results = [];
  for (const r of plan.rows.filter((row) => row.action === "DELETE")) {
    if (checkedOut.has(r.branch)) { results.push({ ...r, outcome: "skipped-checked-out" }); continue; }
    const ok = gitOk(cwd, "update-ref", "-d", `refs/heads/${r.branch}`, r.sha);
    results.push({ ...r, outcome: ok ? "deleted" : "skipped-moved" });
  }
  return results;
}

function summarize(rows) {
  const counts = {};
  for (const r of rows) counts[`${r.action} ${r.reason}`] = (counts[`${r.action} ${r.reason}`] ?? 0) + 1;
  return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
}

function parseArgs(argv) {
  const opts = { apply: false, json: false, base: "main", protect: DEFAULT_PROTECT, restore: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") opts.apply = true;
    else if (a === "--json") opts.json = true;
    else if (["--base", "--protect", "--restore"].includes(a) && argv[i + 1] !== undefined) opts[a.slice(2)] = argv[++i];
    else throw new Error(`unknown or incomplete argument: ${a}`);
  }
  return opts;
}

function main(argv) {
  let opts;
  try { opts = parseArgs(argv); } catch (e) {
    process.stderr.write(`${e.message}\nusage: secb-branch-sweep [--apply] [--base main] [--protect REGEX] [--restore FILE] [--json]\n`);
    return 2;
  }
  let plan;
  try { plan = planSweep(opts); } catch (e) { process.stderr.write(`${e.message}\n`); return 2; }

  if (opts.json && !opts.apply) { process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`); return 0; }
  process.stdout.write(`base ${plan.base} @ ${plan.baseSha.slice(0, 8)} — ${plan.rows.length} local branch(es)\n`);
  for (const [k, n] of summarize(plan.rows)) process.stdout.write(`  ${k.padEnd(24)} ${n}\n`);
  for (const r of plan.rows.filter((row) => row.reason === "patch-equivalent" || row.reason === "pins-worktree")) {
    process.stdout.write(`  keep ${r.reason}: ${r.branch}\n`);
  }
  const doomed = plan.rows.filter((r) => r.action === "DELETE").length;
  if (!opts.apply) {
    process.stdout.write(`\ndry run: ${doomed} branch(es) would be deleted. Re-run with --apply.\n`);
    return 0;
  }

  const restorePath = opts.restore ?? join(tmpdir(), `secb-branch-sweep-restore-${Date.now()}.sh`);
  const results = applySweep(plan, { restorePath });
  const deleted = results.filter((r) => r.outcome === "deleted").length;
  process.stdout.write(`\nrestore script: ${restorePath}\n`);
  for (const r of results.filter((x) => x.outcome !== "deleted")) process.stdout.write(`  ${r.outcome}: ${r.branch}\n`);
  process.stdout.write(`deleted ${deleted} of ${doomed}\n`);
  if (opts.json) process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  return deleted === doomed ? 0 : 1;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  process.exitCode = main(process.argv.slice(2));
}
