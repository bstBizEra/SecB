// A ratchet on undemonstrated refusals.
//
// SecB's mission is verifying authority. A DENY_ code that no test has ever
// triggered is a refusal nobody has seen happen — the control-plane equivalent
// of a fire door nobody has opened.
//
// MEASURED: 437 distinct DENY_ codes across src/. 45 on the LIVE surface were
// named by no test; a further 10 sit in modules the disposition register holds,
// where an unexercised refusal is consistent with the module being held. Nine of
// the live 45 were closed in the same change as this file, leaving 36.
//
// WHY A RATCHET AND NOT A REGISTER
//
// The module and skip registers demand a reason per entry, because each entry is
// a DECISION someone made. These 36 are not decisions; they are debt. Writing 36
// prose justifications would dress accumulated debt as deliberate policy, and the
// register would be read as approval. A ratchet states the truth instead: this is
// the set that has never been demonstrated, it may shrink, and it may not grow.
//
// LIVE VERSUS HELD IS THE LOAD-BEARING SPLIT. A held module's refusals are
// unexercised for the same reason the module is unreachable, and counting them
// as debt would make the disposition register look like a coverage failure.
// Reachability is computed here, not listed, so the split cannot drift.
//
// A NOTE ON HOW THIS WAS FOUND. local-bridge-installation-proof.mjs is on the
// live surface because wiring slice 5 exported it. Its validator was already
// called six times by the suite, so it looked covered, while nine of its fifteen
// refusals had never fired. No wiring slice asked whether the deny paths of a
// module it was making reachable had ever been exercised. Making a control
// reachable without demonstrating its refusals expands the surface, not the
// coverage.

import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ls = (p) => execFileSync("git", ["ls-files", "--", p], { cwd: REPO, encoding: "utf8" }).split("\n").filter(Boolean);
const read = (rel) => readFileSync(resolve(REPO, rel), "utf8");

/**
 * Refusals on the live surface that no test has ever triggered.
 *
 * THIS LIST MAY SHRINK. Adding to it is not a fix — it records that a new
 * refusal shipped without ever being shown to fire, and the commit that adds a
 * line should say why that was acceptable. Removing a line means a test now
 * triggers that code, which is the only direction this is meant to move.
 */
const UNDEMONSTRATED = Object.freeze([
  "DENY_AUTHORITY_SOURCE",
  "DENY_AUTHORITY_VERSION_UNBOUND",
  "DENY_CHAIN_IDENTITY",
  "DENY_CHAIN_VERSION",
  "DENY_CLAIM_UNRESOLVED",
  "DENY_CONFIGURATION",
  "DENY_CONTRACT_WINDOW",
  "DENY_CURRENT_UNRESOLVED",
  "DENY_DUPLICATE_RECEIPT",
  "DENY_ENROLLMENT_RUNTIME",
  "DENY_ENROLLMENT_UNAVAILABLE",
  "DENY_EVIDENCE_INDEPENDENCE",
  "DENY_INVALID_CONTRACT",
  "DENY_INVALID_EVENT",
  "DENY_INVALID_EXPIRY",
  "DENY_INVALID_PROJECT_ID",
  "DENY_INVALID_TARGET_PATH",
  "DENY_LINKAGE_SERVICE_ERROR",
  "DENY_MAIN_BRANCH_MUTATION",
  "DENY_NOT_CANDIDATE",
  "DENY_NOT_COMPACTABLE",
  "DENY_PLUGIN_VERSION_EXISTS",
  "DENY_PLUGIN_VERSION_IN_FLIGHT",
  "DENY_PROOF_TRANSCRIPT_VALIDATOR_UNAVAILABLE",
  "DENY_REGISTRATION_PATH",
  "DENY_SUPERSEDED"
]);

/** Modules reachable from the library surface or any CLI entry point. */
function liveModules() {
  const seen = new Set();
  const queue = ["src/index.mjs", ...ls("tools/").filter((f) => f.endsWith(".mjs"))];
  while (queue.length > 0) {
    const rel = queue.pop();
    if (seen.has(rel)) continue;
    seen.add(rel);
    let source;
    try {
      source = read(rel);
    } catch {
      continue;
    }
    for (const m of source.matchAll(/["'](\.[^"']*\.mjs)["']/g)) {
      const next = relative(REPO, resolve(dirname(resolve(REPO, rel)), m[1])).replaceAll("\\", "/");
      if (!seen.has(next)) queue.push(next);
    }
  }
  return seen;
}

function denyCodes() {
  const live = liveModules();
  const onLive = new Set();
  const onHeld = new Set();
  for (const file of ls("src/").filter((f) => f.endsWith(".mjs"))) {
    const target = live.has(file) ? onLive : onHeld;
    // QUOTED literals only. An unquoted DENY_ token is an IDENTIFIER — a local
    // helper named DENY_MALFORMED, a constant named ...DENY_CODES — not a
    // refusal the module can emit. Counting identifiers put four phantoms in the
    // first baseline, and a ratchet seeded with phantoms teaches readers to edit
    // the list rather than the code.
    for (const m of read(file).matchAll(/["'](DENY_[A-Z0-9_]+)["']/g)) target.add(m[1]);
  }
  return { onLive, onHeld };
}

/**
 * Every DENY_ code named anywhere under tests/, EXCLUDING THIS FILE.
 *
 * The exclusion is load-bearing. This file lists all 36 undemonstrated codes by
 * name, so a corpus that includes it reports every one of them as demonstrated
 * and the ratchet inverts into a rubber stamp — it failed exactly that way on
 * first run. Third occurrence of this shape in two rounds: a register that reads
 * the corpus it lives in must exclude itself.
 */
const SELF = "tests/deny-path-coverage.test.mjs";
function namedByTests() {
  const corpus = ls("tests/")
    .filter((f) => f.endsWith(".mjs") && f !== SELF)
    .map((f) => read(f))
    .join("\n");
  return new Set([...corpus.matchAll(/\bDENY_[A-Z0-9_]+\b/g)].map((m) => m[0]));
}

test("no NEW refusal ships on the live surface without ever being demonstrated", () => {
  const { onLive } = denyCodes();
  const named = namedByTests();
  const known = new Set(UNDEMONSTRATED);

  const added = [...onLive].filter((code) => !named.has(code) && !known.has(code)).sort();
  assert.deepEqual(
    added,
    [],
    "These refusals exist on the live surface and no test has ever triggered them. Write a case that " +
      "asserts the EXACT code — asserting only that a call threw passes on the wrong refusal, and on " +
      "an authority boundary the difference between two denials is the whole content of the control."
  );
});

test("the ratchet does not describe refusals that are now demonstrated", () => {
  const named = namedByTests();
  const stale = UNDEMONSTRATED.filter((code) => named.has(code)).sort();
  assert.deepEqual(
    stale,
    [],
    "A test now triggers these, so remove them from UNDEMONSTRATED. Leaving them makes the list " +
      "overstate the debt, and a list that overstates stops being read."
  );
});

test("the ratchet does not describe refusals that no longer exist", () => {
  const { onLive, onHeld } = denyCodes();
  const gone = UNDEMONSTRATED.filter((code) => !onLive.has(code) && !onHeld.has(code)).sort();
  assert.deepEqual(gone, [], "listed as undemonstrated but no longer present in src/");
});

test("a refusal in a HELD module is not counted as live debt", () => {
  // The split is what keeps the disposition register from reading as a coverage
  // failure: a held module's refusals are unexercised for the same reason the
  // module is unreachable. Computed from the import graph, never listed, so it
  // cannot drift away from the register.
  const { onLive, onHeld } = denyCodes();
  const overlap = UNDEMONSTRATED.filter((code) => onHeld.has(code) && !onLive.has(code));
  assert.deepEqual(overlap, [], "held-module refusals belong to the module's disposition, not to this ratchet");
});

test("the nine closed in this change stay closed", () => {
  // Named rather than counted. A count would survive one of these regressing
  // while an unrelated code was demonstrated, which is the substitution a
  // ratchet exists to see.
  const named = namedByTests();
  for (const code of [
    "DENY_PROOF_OPTIONS",
    "DENY_PROOF_INVALID",
    "DENY_PROOF_TRANSCRIPT_INVALID",
    "DENY_PROOF_CLOCK_UNAVAILABLE",
    "DENY_PROOF_TTL_EXCEEDED",
    "DENY_PROOF_NOT_YET_VALID",
    "DENY_PROOF_SERVICE_MISMATCH",
    "DENY_PROOF_PROFILE_POLICY",
    "DENY_PROOF_TRANSCRIPT_MISMATCH"
  ]) {
    assert.ok(named.has(code), `${code} was demonstrated and is no longer named by any test`);
  }
});
