/**
 * tools/secb-branch-sweep.mjs — deleting only branches whose loss is provably nothing.
 *
 * Every case builds a throwaway repository, so the suite never depends on this
 * repository's own branches. Two of the cases pin the failures the tool was
 * written after:
 *
 *   1. A branch whose every patch is on main (`git cherry` shows no `+`) but
 *      which still carries a hand-made merge resolution must be KEPT. The
 *      shortcut "cherry is clean, so it landed" would have deleted it.
 *
 *   2. A branch that is the only ref reaching a detached worktree's HEAD must
 *      be KEPT, even when it would otherwise qualify for deletion.
 *
 * Each negative case is paired with a positive one, so a tool that keeps
 * everything fails the suite as surely as one that deletes too much.
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planSweep, applySweep, restoreScript, mergeEffect } from "../tools/secb-branch-sweep.mjs";

const dirs = [];
afterEach(() => { while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true }); });

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), "secb-branch-sweep-"));
  dirs.push(dir);
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.name", "sweep-test");
  git("config", "user.email", "sweep-test@example.invalid");
  git("config", "commit.gpgsign", "false");
  git("config", "core.autocrlf", "false");
  const commit = (file, content, msg = `edit ${file}`) => {
    writeFileSync(join(dir, file), content);
    git("add", file);
    git("commit", "-q", "-m", msg);
    return git("rev-parse", "HEAD");
  };
  commit("a.txt", "one\n", "root");
  return { dir, git, commit };
}

const row = (plan, branch) => plan.rows.find((r) => r.branch === branch);

describe("secb-branch-sweep / what qualifies for deletion", () => {
  it("deletes a branch fully merged into the base", () => {
    const { dir, git, commit } = makeRepo();
    git("switch", "-q", "-c", "feat");
    commit("b.txt", "b\n");
    git("switch", "-q", "main");
    git("merge", "-q", "--no-ff", "-m", "merge feat", "feat");
    const plan = planSweep({ cwd: dir });
    assert.deepEqual([row(plan, "feat").action, row(plan, "feat").reason], ["DELETE", "merged"]);
  });

  it("keeps a branch with a commit the base does not have, and counts it", () => {
    const { dir, git, commit } = makeRepo();
    git("switch", "-q", "-c", "wip");
    commit("b.txt", "b\n");
    git("switch", "-q", "main");
    const r = row(planSweep({ cwd: dir }), "wip");
    assert.deepEqual([r.action, r.reason, r.unique], ["KEEP", "unique", 1]);
  });

  it("deletes a cherry-picked branch when merging it would change nothing", () => {
    const { dir, git, commit } = makeRepo();
    git("switch", "-q", "-c", "picked");
    const c = commit("b.txt", "b\n");
    git("switch", "-q", "main");
    commit("z.txt", "unrelated\n", "main diverges"); // so the pick is a distinct commit
    git("cherry-pick", c);
    const r = row(planSweep({ cwd: dir }), "picked");
    assert.deepEqual([r.action, r.reason], ["DELETE", "noop"]);
  });

  it("keeps a cherry-picked branch once the base has moved past it — patch-equivalent is not proof", () => {
    const { dir, git, commit } = makeRepo();
    git("switch", "-q", "-c", "picked");
    const c = commit("a.txt", "two\n");
    git("switch", "-q", "main");
    commit("z.txt", "unrelated\n", "main diverges"); // so the pick is a distinct commit
    git("cherry-pick", c);
    commit("a.txt", "three\n", "main moves on");
    const r = row(planSweep({ cwd: dir }), "picked");
    assert.equal(r.action, "KEEP");
    assert.equal(r.reason, "patch-equivalent");
  });

  it("keeps a branch whose only unique content is a merge resolution (the cherry blind spot)", () => {
    const { dir, git, commit } = makeRepo();
    git("switch", "-q", "-c", "side");
    commit("a.txt", "side\n");
    git("switch", "-q", "main");
    commit("a.txt", "main\n");
    // resolution branch: merges side into main with a hand-made resolution
    git("switch", "-q", "-c", "resolved");
    try { git("merge", "-q", "side"); } catch { /* conflict expected */ }
    writeFileSync(join(dir, "a.txt"), "hand-made resolution\n");
    git("add", "a.txt");
    git("commit", "-q", "--no-edit");
    // main resolves the same conflict differently
    git("switch", "-q", "main");
    try { git("merge", "-q", "side"); } catch { /* conflict expected */ }
    writeFileSync(join(dir, "a.txt"), "main's resolution\n");
    git("add", "a.txt");
    git("commit", "-q", "--no-edit");
    // precondition: git cherry sees nothing unique — the shortcut would delete
    assert.equal(git("cherry", "main", "resolved"), "");
    const r = row(planSweep({ cwd: dir }), "resolved");
    assert.equal(r.action, "KEEP");
    assert.equal(r.reason, "patch-equivalent");
  });
});

describe("secb-branch-sweep / what is never deleted", () => {
  it("keeps the base, protected names, and branches checked out in a worktree", () => {
    const { dir, git } = makeRepo();
    git("branch", "claude/rev/preserve-abc123");
    git("branch", "busy");
    const wt = mkdtempSync(join(tmpdir(), "secb-branch-sweep-wt-"));
    dirs.push(wt);
    git("worktree", "add", "-q", join(wt, "w"), "busy");
    git("branch", "plain");
    const plan = planSweep({ cwd: dir });
    assert.equal(row(plan, "main").reason, "base");
    assert.equal(row(plan, "claude/rev/preserve-abc123").reason, "protected");
    assert.equal(row(plan, "busy").reason, "worktree");
    // positive arm: an identical, unprotected, unchecked-out branch is deleted
    assert.deepEqual([row(plan, "plain").action, row(plan, "plain").reason], ["DELETE", "merged"]);
    git("worktree", "remove", "--force", join(wt, "w"));
  });

  it("keeps the only branch reaching a detached worktree's HEAD", () => {
    const { dir, git, commit } = makeRepo();
    git("switch", "-q", "-c", "picked");
    const c = commit("b.txt", "b\n");
    git("switch", "-q", "main");
    commit("z.txt", "unrelated\n", "main diverges"); // so the pick is a distinct commit
    git("cherry-pick", c); // makes "picked" a noop candidate
    const wt = mkdtempSync(join(tmpdir(), "secb-branch-sweep-wt-"));
    dirs.push(wt);
    git("worktree", "add", "-q", "--detach", join(wt, "w"), c);
    const r = row(planSweep({ cwd: dir }), "picked");
    assert.deepEqual([r.action, r.reason], ["KEEP", "pins-worktree"]);
    git("worktree", "remove", "--force", join(wt, "w"));
    // positive arm: with the worktree gone, the same branch is deletable
    assert.equal(row(planSweep({ cwd: dir }), "picked").action, "DELETE");
  });

  it("fails closed when the base does not exist", () => {
    const { dir } = makeRepo();
    assert.throws(() => planSweep({ cwd: dir, base: "trunk" }), /base branch not found/);
  });

  it("reports unverifiable rather than noop when merge-tree cannot run", () => {
    const { dir } = makeRepo();
    assert.equal(mergeEffect(dir, "main", "0000000000000000000000000000000000000000"), "unverifiable");
  });
});

describe("secb-branch-sweep / applying a plan", () => {
  it("dry-run planning modifies nothing", () => {
    const { dir, git } = makeRepo();
    git("branch", "plain");
    const before = git("for-each-ref");
    planSweep({ cwd: dir });
    assert.equal(git("for-each-ref"), before);
  });

  it("deletes only DELETE rows, and the restore script brings them back exactly", () => {
    const { dir, git, commit } = makeRepo();
    git("branch", "plain");
    git("switch", "-q", "-c", "wip");
    commit("b.txt", "b\n");
    git("switch", "-q", "main");
    const plan = planSweep({ cwd: dir });
    const plainSha = row(plan, "plain").sha;
    const restorePath = join(dir, "restore.sh");
    const results = applySweep(plan, { cwd: dir, restorePath });
    assert.deepEqual(results.map((r) => [r.branch, r.outcome]), [["plain", "deleted"]]);
    assert.equal(git("branch", "--list", "plain"), "");
    assert.match(git("branch", "--list", "wip"), /wip/);
    execFileSync("sh", [restorePath], { cwd: dir });
    assert.equal(git("rev-parse", "refs/heads/plain"), plainSha);
  });

  it("skips a branch that moved after planning instead of deleting its new commit", () => {
    const { dir, git, commit } = makeRepo();
    git("branch", "plain");
    const plan = planSweep({ cwd: dir });
    git("switch", "-q", "plain");
    const moved = commit("c.txt", "c\n");
    git("switch", "-q", "main");
    const results = applySweep(plan, { cwd: dir, restorePath: join(dir, "restore.sh") });
    assert.equal(results[0].outcome, "skipped-moved");
    assert.equal(git("rev-parse", "refs/heads/plain"), moved);
  });

  it("skips a branch checked out after planning", () => {
    const { dir, git } = makeRepo();
    git("branch", "plain");
    const plan = planSweep({ cwd: dir });
    const wt = mkdtempSync(join(tmpdir(), "secb-branch-sweep-wt-"));
    dirs.push(wt);
    git("worktree", "add", "-q", join(wt, "w"), "plain");
    const results = applySweep(plan, { cwd: dir, restorePath: join(dir, "restore.sh") });
    assert.equal(results[0].outcome, "skipped-checked-out");
    git("worktree", "remove", "--force", join(wt, "w"));
  });

  it("quotes branch names in the restore script so a hostile name stays inert", () => {
    const hostile = "x';touch pwned;'";
    const script = restoreScript({ base: "main", baseSha: "b".repeat(40), rows: [
      { branch: hostile, sha: "a".repeat(40), action: "DELETE", reason: "merged" },
      { branch: "kept", sha: "c".repeat(40), action: "KEEP", reason: "unique" }
    ] });
    assert.ok(script.includes(`'refs/heads/x'\\'';touch pwned;'\\'''`));
    assert.ok(!script.includes("kept"), "KEEP rows are not restored");
  });

  it("the restore script refuses to overwrite a branch that exists again", () => {
    const { dir, git, commit } = makeRepo();
    git("branch", "plain");
    const plan = planSweep({ cwd: dir });
    const restorePath = join(dir, "restore.sh");
    applySweep(plan, { cwd: dir, restorePath });
    const newer = commit("d.txt", "d\n");
    git("branch", "plain", newer);
    assert.throws(() => execFileSync("sh", [restorePath], { cwd: dir, stdio: "ignore" }));
    assert.equal(git("rev-parse", "refs/heads/plain"), newer);
    assert.ok(readFileSync(restorePath, "utf8").includes("refs/heads/plain"));
  });
});
