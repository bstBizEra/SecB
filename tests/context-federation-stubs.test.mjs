import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

// P0-10 ContextFederationService conformance — UNBLOCKED (R2 gate waived
// 2026-07-19). The 16-case CF negative matrix frozen from the planning packet is
// implemented as executable tests in tests/context-federation.test.mjs (issue
// closed-shape/blank/delimiter, non-effective/baseline, scope-widening,
// seal/schema, idempotency, source-match, consume session/unknown/expiry/
// version-supersession, compaction subset-only + parent-supersede, GOV revoke,
// immutability, resolveEffective-NONE composition) plus the subtractive
// retrieval pipeline exclusion test. This file records the closure so the frozen
// matrix's home is unambiguous.
//
// IT USED TO RECORD THAT WITH AN EMPTY BODY.
//
//     test("CF matrix delivered in tests/context-federation.test.mjs", () => {});
//
// Which is a test that cannot fail, counting toward the suite's pass total while
// verifying nothing — the same property the skill audit reports as
// `evals.negative-case-cannot-fail`, in the suite rather than in the corpus.
// Found by sweeping tests/ for bodies with no assertion.
//
// A marker recording where something lives should fail when it stops living
// there. Delete the CF file, rename it, or strip its cases, and this now goes red
// instead of continuing to assert delivery of something absent.

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CF_FILE = "tests/context-federation.test.mjs";

test("the CF matrix is where this file says it is", () => {
  const tracked = execFileSync("git", ["ls-files", "--", CF_FILE], { cwd: REPO, encoding: "utf8" }).trim();
  assert.equal(tracked, CF_FILE, `${CF_FILE} is not tracked; this file's claim of delivery is stale`);

  const src = readFileSync(resolve(REPO, CF_FILE), "utf8");

  // The case ids, named rather than counted. A count would survive one case
  // being deleted and another added, which is the drift a delivery marker exists
  // to catch.
  const ids = [...src.matchAll(/"(CF-\d+)/g)].map((m) => m[1]);
  const distinct = [...new Set(ids)].sort();
  assert.deepEqual(
    distinct,
    ["CF-01", "CF-02", "CF-03", "CF-04", "CF-05", "CF-06", "CF-07", "CF-08", "CF-09", "CF-13", "CF-14", "CF-15"],
    "the CF case set changed; update this marker deliberately, in the same commit as the change"
  );

  // The gaps are real and are recorded rather than smoothed over: CF-10, CF-11
  // and CF-12 carry no id in that file. Asserting the exact set above means a
  // later commit filling them in fails here and has to say so, which is the
  // point — a marker that accepts any set is not a marker.
  assert.equal(distinct.length, 12);
});
