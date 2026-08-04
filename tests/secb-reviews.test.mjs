/**
 * tools/secb-reviews.mjs — locating review evidence.
 *
 * The tool exists because three hand-written searches for the same verdict each
 * missed it. Its own first two runs were wrong in the two ways that matter, and
 * both failures are pinned here so they cannot return:
 *
 *   1. Binding on "is an ancestor of the branch" matched EVERYTHING. Every
 *      review record states the base it reviewed against, that base is on
 *      `main`, and everything on `main` is an ancestor of every branch. One
 *      pull request came back with all 21 refs as its evidence.
 *
 *   2. Scanning docs/ for records reported a review REQUEST as an approval, and
 *      a report ABOUT reviews as an approval. That path was removed; the test
 *      below pins that verdict extraction does not fire on request language.
 *
 * Integration cases are guarded: they assert against real refs when those refs
 * are present and skip otherwise, so deleting a merged branch does not turn
 * this suite red for an unrelated reason.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import {
  candidateRefs, verdictIn, namedCommits, bind, collectEvidence
} from "../tools/secb-reviews.mjs";

const has = (rev) => {
  try {
    execFileSync("git", ["rev-parse", "--quiet", "--verify", `${rev}^{commit}`],
      { stdio: ["ignore", "ignore", "ignore"] });
    return true;
  } catch { return false; }
};

describe("secb-reviews / verdict extraction states, never guesses", () => {
  it("reads a verdict only when the text states one", () => {
    assert.equal(verdictIn("Summary verdict\n**APPROVE_FOR_MERGE**"), "APPROVE_FOR_MERGE");
    assert.equal(verdictIn("**APPROVE_WITH_NOTES** — 0 blocking"), "APPROVE_WITH_NOTES");
    assert.equal(verdictIn("REQUEST_CHANGES: see finding 2"), "REQUEST_CHANGES");
    // The control. Absent a stated verdict the answer is null, not a guess, and
    // not the first token that looks approving.
    assert.equal(verdictIn("This packet requests an independent review of PR #136."), null);
    assert.equal(verdictIn("The reviewer approved of the approach in conversation."), null);
    assert.equal(verdictIn(""), null);
    assert.equal(verdictIn(null), null);
  });

  it("does not read a verdict out of request language", () => {
    // The removed docs/ scanner reported EXACT_REVIEW_EVIDENCE_FOUND for #137
    // from this exact kind of text.
    const request = `
      objective: Independent review of PR #136 — exact-set contract pins.
      recommended_next_action: Return a verdict as a record. The operator merges.
    `;
    assert.equal(verdictIn(request), null,
      "a request for a verdict must not be read as one");
  });
});

describe("secb-reviews / SHA extraction is shape-matched then verified", () => {
  it("keeps only tokens that are real commits", () => {
    const text = "reviewed at deadbeefdeadbeefdeadbeefdeadbeefdeadbeef and 0000000";
    assert.deepEqual(namedCommits(text), [],
      "hex that is not a commit in this repository must not be reported");
    assert.deepEqual(namedCommits(""), []);
  });

  it("resolves a commit that IS in this repository", function () {
    const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const found = namedCommits(`the change landed at ${head.slice(0, 8)}`);
    assert.deepEqual(found, [head], "a real short SHA must resolve to its full commit");
  });
});

describe("secb-reviews / ref discovery is discovery, not a hardcoded list", () => {
  it("returns only refs outside the three standard hierarchies", () => {
    for (const { ref } of candidateRefs()) {
      assert.ok(!ref.startsWith("refs/heads/"), ref);
      assert.ok(!ref.startsWith("refs/remotes/"), ref);
      assert.ok(!ref.startsWith("refs/tags/"), ref);
    }
  });
});

describe("secb-reviews / binding — the bug that made the first run worthless", () => {
  /**
   * The fixture branch must satisfy BOTH conditions or this test proves nothing:
   *
   *   ahead of the base   — otherwise the base commit IS the head, EXACT is the
   *                         correct answer, and the buggy and fixed versions agree
   *   CONTAINS the base   — otherwise `is-ancestor(base, branch)` is false under
   *                         the buggy version too, and they agree again
   *
   * The first version of this test required only the first condition and picked
   * a divergent working branch. Sabotage proved it: restoring the original bug
   * left the suite green at 9 pass / 0 fail. It was written to pin that bug and
   * could not detect it.
   */
  const contains = (rev, base) => {
    try {
      execFileSync("git", ["merge-base", "--is-ancestor", base, rev],
        { stdio: ["ignore", "ignore", "ignore"] });
      return true;
    } catch { return false; }
  };
  const ahead = ["origin/fix/vf1-reviewed", "origin/fix/validate-foundation-exact-pins", "HEAD"].find(
    (r) => has(r) && has("origin/main") &&
      execFileSync("git", ["rev-list", "--count", `origin/main..${r}`], { encoding: "utf8" }).trim() !== "0" &&
      contains(r, "origin/main"));

  it("a commit already on the base is NOT evidence about a branch", { skip: !ahead }, () => {
    const base = execFileSync("git", ["rev-parse", "origin/main"], { encoding: "utf8" }).trim();

    // A fabricated record naming ONLY a commit that is on main. Under the
    // original ancestor test this bound to every branch in the repository.
    const fake = [{
      ref: "refs/test/fabricated", refSha: base, files: [], verdict: "APPROVE_FOR_MERGE",
      names: [base]
    }];

    const result = bind(ahead, fake);
    assert.equal(result.status, "REVIEW_EVIDENCE_UNKNOWN",
      "a base commit must not bind as evidence — this is the check that could not fail");
  });

  it("a commit that IS the head binds as EXACT", { skip: !ahead }, () => {
    const head = execFileSync("git", ["rev-parse", ahead], { encoding: "utf8" }).trim();
    const evidence = [{
      ref: "refs/test/exact", refSha: head, files: [], verdict: "APPROVE_FOR_MERGE",
      names: [head]
    }];
    // Positive arm. Without it the denial above proves only that nothing binds.
    assert.equal(bind(ahead, evidence).status, "EXACT_REVIEW_EVIDENCE_FOUND");
  });

  it("an unknown branch is reported as unknown, not as empty evidence", () => {
    assert.equal(bind("refs/heads/branch-that-does-not-exist-xyz", []), null);
  });
});

describe("secb-reviews / the case three manual searches missed", () => {
  const BRANCH = "origin/bst/mod-work-sod-version-spoof-fix-001";
  const REF = "refs/reviews/mod-work-sod-version-spoof-fix-independent-review-001";

  it("finds the verdict on a ref outside refs/heads", { skip: !has(BRANCH) || !has(REF) }, () => {
    const result = bind(BRANCH, collectEvidence(BRANCH));
    const hit = result.hits.find((h) => h.ref === REF);
    assert.ok(hit, "the ref-namespace verdict must be located");
    assert.equal(hit.verdict, "APPROVE_WITH_NOTES");
    assert.equal(result.status, "STALE_REVIEW",
      "the head moved after that verdict, and saying so is the point");
  });
});
