// AMD-002 §1 requires a bounded slice to stay on a non-`main` branch, and the
// retained hard gates say no agent merges to `main`. Neither was checkable, and
// both were broken nine times in three days before anyone noticed — including by
// the agent that wrote most of the guards in this repository.
//
// HOW A DIRECT COMMIT IS DETECTED
//
// A commit authored on a branch and merged with `--no-ff` hangs off the merge's
// SECOND parent. It never appears on `main`'s first-parent chain. So:
//
//     git rev-list --first-parent --no-merges main
//
// returns exactly the commits that were written while standing on `main`. No
// heuristics, no message parsing, no reflog — the shape of the graph says it.
//
// WHY A BASELINE INSTEAD OF ZERO
//
// Twenty-three already exist. Fourteen predate this workflow (2026-07-17/19,
// when the repository was built directly on `main` and no branch rule applied).
// Nine are mine, from 2026-08-08 to 2026-08-10, and they are the reason this file
// exists. Rewriting nine pushed commits to erase them would destroy verified,
// public history to improve an agent's record, so they are DISCLOSED instead:
// pinned below by SHA, permanently, where every future reader sees them.
//
// The pin is the list and not the count. A count of 23 would stay green if one
// disclosed commit were swapped for an undisclosed one — the same defect the
// corpus tripwire avoids by naming its exceptions rather than tallying them.
//
// WHAT THIS DOES NOT CLAIM
//
// It does not prove a slice was reviewed. A branch merged by its own author
// satisfies this check and satisfies nothing else. It proves only that the merge
// boundary EXISTS, which is the precondition for review, not review.

import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Commits authored directly on `main`, disclosed.
 *
 * DO NOT ADD TO THIS LIST TO MAKE A FAILURE GO AWAY. A new entry here is a
 * record that the branch rule was broken again, and it belongs in a commit whose
 * message says so. If adding a line feels like clearing a nuisance, that is the
 * tripwire working.
 */
const DISCLOSED_DIRECT_COMMITS = [
  // 2026-08-08 .. 2026-08-10 — this workflow was in force and the rule was broken.
  "7517981b65d83d2db791dc2fff550d296f90e861", // wire six more modules (slice 5)
  "f325380b6877007802139358ab214f7d5ee7bf16", // the gates are mostly not on these files
  "ebc370ce5e4e9cd1269b3edb158778996bc98042", // four of the 21 were never gated
  "315a14735851eb679f0f98ef62de426683db81a1", // PLAN artifact for wiring completion
  "8f3adf2dbcf266d88760f6f0ec3d4ddf12c56383", // triage the unmerged branches
  "3b14f8f68a83025d8d7cdf018b920287918c6a14", // test the file every other gate lives in
  "2e90463eb0d3f76fce45a713f06978ee5c2fbff5", // map the wp-mem stream
  "e6b39db863ebbd7aed5f5073e90670cbb05938e3", // give AMD-003 back to its candidate
  "f9d4640f7df97a70620240d5f3d43c0cc6e2d003", // stop three guards drifting with their ref

  // 2026-07-17 .. 2026-07-19 — repository bootstrap, before the branch rule.
  "6152897bf498754ee51b4546b58a644ce28d55dd",
  "d142322fd6fafef8e37a6eec015a3e805cd2196a",
  "90a9dd0b6cb573ee90aa81e370312520bbc43a96",
  "76a7c054090ee17fe8ad9fd545d6fb155319e6ed",
  "d27ae323dbfbdf8246f8214ed662cbfda8784edd",
  "6a2955355134803ad46fc4acf159e6f077290eff",
  "26e299c160f58a5305b143456e8e43ecf2adac12",
  "2c2c24ce98482fbf6068d2e34655658440a2de56",
  "2a2ffb66ae0385c46e90d05a55f1bdb0e219ef16",
  "a0abba2f23c24d208f3d212cc4db8aba6c7e7341",
  "e3af0fdd4d644559f0fe8235c77fbef93067593d",
  "b6f4934ce43e0a2ba53ae9aec9999b6e7764a659",
  "adb1ff0e21455cf62c998a5cf5411ca5c963fd04",
  "c623f245632918bf9c04898873b163331b86609c"
];

/** The commits written while standing on `main`, straight from the graph shape. */
function directCommits() {
  return execFileSync("git", ["rev-list", "--first-parent", "--no-merges", "main"], {
    cwd: REPO,
    encoding: "utf8"
  })
    .split("\n")
    .filter(Boolean);
}

function describe(sha) {
  try {
    return execFileSync("git", ["log", "-1", "--format=%h %ad %s", "--date=short", sha], {
      cwd: REPO,
      encoding: "utf8"
    }).trim();
  } catch {
    return sha;
  }
}

test("no new commit was authored directly on main", () => {
  const disclosed = new Set(DISCLOSED_DIRECT_COMMITS);
  const undisclosed = directCommits().filter((sha) => !disclosed.has(sha));

  assert.deepEqual(
    undisclosed.map(describe),
    [],
    "These commits sit on main's first-parent chain and are not merges, which means they were " +
      "written while standing on main. AMD-002 §1 requires a bounded slice to stay on a non-main " +
      "branch, and the retained hard gates forbid agent merges to main — a commit authored on main " +
      "needs no merge, so it does not bypass that gate, it makes it vacuous. Move the work to a " +
      "branch and merge it with --no-ff. Do not add the SHA to DISCLOSED_DIRECT_COMMITS to make " +
      "this pass unless a human has decided the history should stand."
  );
});

test("every disclosed exception still exists and is still direct", () => {
  // A disclosed SHA that no longer appears means history was rewritten, and a
  // disclosure list quietly describing commits nobody can find is worse than no
  // list. This also stops the list being padded with SHAs that were never on the
  // chain in the first place.
  const actual = new Set(directCommits());
  const stale = DISCLOSED_DIRECT_COMMITS.filter((sha) => !actual.has(sha));

  assert.deepEqual(
    stale.map(describe),
    [],
    "disclosed as a direct commit but no longer on main's first-parent chain"
  );
});

test("the disclosure list has no duplicates", () => {
  assert.equal(new Set(DISCLOSED_DIRECT_COMMITS).size, DISCLOSED_DIRECT_COMMITS.length);
});

test("nine of the disclosed commits fall inside the branch-rule era, and that is recorded", () => {
  // Pinned so the count cannot quietly grow while the list is edited. This is the
  // number that matters: bootstrap-era commits broke no rule, these nine did.
  const RULE_ERA = DISCLOSED_DIRECT_COMMITS.slice(0, 9);
  const dates = RULE_ERA.map((sha) =>
    execFileSync("git", ["log", "-1", "--format=%ad", "--date=short", sha], {
      cwd: REPO,
      encoding: "utf8"
    }).trim()
  );

  assert.equal(RULE_ERA.length, 9);
  for (const date of dates) {
    assert.ok(date >= "2026-08-08", `${date} is not in the branch-rule era — the list order moved`);
  }
});
