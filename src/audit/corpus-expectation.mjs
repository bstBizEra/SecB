/**
 * The corpus this repository is expected to contain, and an independent count.
 *
 * WHY THIS EXISTS
 *
 * The audit's tests asserted `packages === 25, governed === 22, ungoverned === 3`.
 * Those numbers are true of `feat/secb-ruflo-command-center` and false of `main`,
 * which carries 22 packages, all governed, because `graphify`,
 * `secb-project-registry` and `worktree` exist only on the working branch.
 *
 * That made the audit unextractable: the tests would fail on `main` for a reason
 * that has nothing to do with the audit being wrong.
 *
 * The naive fix is to delete the assertion. That loses a real tripwire — the
 * corpus changing without anyone noticing. So the assertion is SPLIT instead:
 *
 *   independentCounts()  counts the corpus a second way, through plain fs rather
 *                        than through the audit's own loader. Comparing the two
 *                        catches a loader that miscounts, ON ANY CORPUS. This is
 *                        strictly stronger than a memorised constant, which
 *                        agrees with nothing except itself.
 *
 *   EXPECTED_CORPUS      the tripwire, kept but made portable. It records what
 *                        this checkout is expected to hold, and travels with the
 *                        corpus rather than being frozen into an assertion.
 *                        Extracting the audit to `main` means updating this file
 *                        in the extraction commit — a visible, reviewable act
 *                        rather than a test edit buried in a rebase.
 *
 * Both are needed. The first proves the audit counts correctly; the second
 * proves nobody changed the corpus quietly. Neither implies the other.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { CORPUS_ROOT } from "./corpus.mjs";

/**
 * What this checkout is expected to hold.
 *
 * UPDATE THIS DELIBERATELY, IN THE SAME COMMIT AS THE CORPUS CHANGE. A diff
 * here is the record that a skill package was added or removed. If updating it
 * feels like clearing a nuisance failure, that is the tripwire working.
 */
export const EXPECTED_CORPUS = {
  packages: 24,
  governed: 24,
  ungoverned: 0,
  /**
   * Named, not merely counted. A corpus that swapped one ungoverned package for
   * another would keep every count identical. The list is empty now, and an
   * entry appearing in it is the signal that something ungoverned was added to
   * `.agents/skills/` — which is how the last three got there.
   */
  ungovernedNames: [],
  note:
    "24 / 24 / 0 since 2026-08-25, when bizscout (SECB-BIZ-001) arrived through " +
    "the skills-pack route with a manifest, the seven shared sections, and a " +
    "hand-written eval suite. Previously 23 / 23 / 0 since 2026-08-11, when " +
    "graphify, secb-project-registry and worktree were moved to " +
    ".agents/tool-notes/ — they were never skills. 26 / 23 / 3 before that, and " +
    "25 / 22 / 3 before SECB-ARCH-023."
};

/**
 * Count the corpus WITHOUT going through the audit's loader.
 *
 * Deliberately duplicates a little logic. A test that counts by calling the
 * thing it is testing proves only that the function is deterministic. The point
 * here is a second opinion, so this walks the directory itself and applies the
 * governed rule directly: a package is governed if it has a manifest.
 *
 * @param {string} root
 */
export function independentCounts(root = CORPUS_ROOT) {
  if (!existsSync(root)) {
    return { packages: 0, governed: 0, ungoverned: 0, ungovernedNames: [] };
  }
  const names = readdirSync(root)
    .filter((name) => statSync(join(root, name)).isDirectory())
    .sort();

  const ungovernedNames = names
    .filter((name) => !existsSync(join(root, name, "manifest.yaml")))
    .sort();

  return {
    packages: names.length,
    governed: names.length - ungovernedNames.length,
    ungoverned: ungovernedNames.length,
    ungovernedNames
  };
}
