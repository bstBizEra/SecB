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
 * KEYED BY CODE NAME, WHICH IS COARSER THAN THE TRUTH. One code can be thrown
 * from several modules -- DENY_INVALID_PROJECT_ID was thrown from three, on two
 * different error classes -- and a single test naming it anywhere clears the
 * entry for all of them. No mechanical check here can tell which SITE a test
 * reached, so this is stated rather than guarded: when you close an entry, look
 * for the code's other homes and close those too. The round that closed
 * DENY_INVALID_PROJECT_ID demonstrated all three sites for exactly this reason.
 *
 * THIS LIST MAY SHRINK. Adding to it is not a fix — it records that a new
 * refusal shipped without ever being shown to fire, and the commit that adds a
 * line should say why that was acceptable. Removing a line means a test now
 * triggers that code, which is the only direction this is meant to move.
 */
const UNDEMONSTRATED = Object.freeze([]);


/**
 * Refusals a STRICTER check always reaches first, so no caller can trigger them
 * through the public API.
 *
 * These are not debt. Recording them as undemonstrated would ask someone to
 * write a test that cannot be written without first weakening the check that
 * shadows them. They are defence in depth and should stay: each becomes
 * reachable the moment its shadowing check loosens.
 *
 * Each entry names the check that shadows it and the test that asserts the
 * shadowing still holds. That test, not this list, is what fails if the shadow
 * ever lifts.
 */
const SHADOWED = Object.freeze({
  DENY_EVIDENCE_INDEPENDENCE: {
    shadowed_by:
      "separation of duties, twice — SOD_ROLE_CONFLICT refuses an ENGIN/REV grant when the authority " +
      "engine is built, and DENY_SOD bars any actor in executorActorIds from entering REVIEW or QA. " +
      "Independence can only fail when a covering item's actor is the executor, and the evidence filter " +
      "admits a REVIEW-stage item only from the reviewer, so the reviewer would have to BE the executor.",
    asserted_by: "tests/work-package-service.test.mjs :: DENY_EVIDENCE_INDEPENDENCE is SHADOWED"
  },
  DENY_NOT_CANDIDATE: {
    shadowed_by:
      "promote(), twice and in order -- a REVOKED entry is taken by DENY_REVOKED, and a PROMOTED entry is "
      + "taken by DENY_ALREADY_PROMOTED because that loop iterates versions.values(), which INCLUDES the "
      + "entry itself. With a status domain of exactly {CANDIDATE, PROMOTED, REVOKED}, only CANDIDATE "
      + "reaches the check, where the condition is false.",
    asserted_by:
      "tests/capability-registry-service.test.mjs :: DENY_NOT_CANDIDATE is SHADOWED, and :: the shadow "
      + "rests on a three-value status domain (the second is the tripwire for a fourth status)"
  },
  DENY_INVALID_EXPIRY: {
    shadowed_by: "contract validation (DENY_CONTRACT_INVALID) — the date-time format check on valid_until",
    asserted_by: "tests/work-package-service.test.mjs :: DENY_INVALID_EXPIRY is SHADOWED"
  }
});

/**
 * Refusals that cannot be reached because of a STRUCTURAL invariant, not because
 * a stricter check stands in front of them.
 *
 * Kept separate from SHADOWED on purpose. SHADOWED means "another check gets
 * there first"; this means the state never occurs at the position the check
 * examines. Collapsing the two would make SHADOWED stop meaning anything, and
 * the two lift for completely different reasons — a shadow lifts when a check
 * loosens, a structural invariant lifts when a data structure changes.
 *
 * Each entry names the invariant and the test that fails if it breaks.
 */
const UNREACHABLE_BY_STRUCTURE = Object.freeze({
  DENY_SUPERSEDED: {
    invariant:
      "#chainHead returns the TAIL of the version array, and the only line that writes SUPERSEDED "
      + "(parent.status in compactReceipt) is immediately followed by pushing an ISSUED successor onto the "
      + "same array. A superseded record is therefore never the tail, so #resolveHead never sees one. "
      + "compactReceipt also refuses unless the head is ISSUED, so it cannot leave one there.",
    asserted_by:
      "tests/context-federation.test.mjs :: DENY_SUPERSEDED is unreachable — a superseded record is never "
      + "the chain head (CF-12 asserts the same consequence from the consume side)"
  }
});

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
 * The exclusion is load-bearing. This file lists every undemonstrated code by
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

test("a SHADOWED refusal is not also counted as debt, and still exists", () => {
  const { onLive, onHeld } = denyCodes();
  const known = new Set(UNDEMONSTRATED);
  for (const [code, entry] of Object.entries(SHADOWED)) {
    assert.ok(!known.has(code), `${code} is both shadowed and listed as debt; it is one or the other`);
    assert.ok(onLive.has(code) || onHeld.has(code), `${code} is recorded as shadowed but no longer exists in src/`);
    for (const field of ["shadowed_by", "asserted_by"]) {
      assert.ok(
        typeof entry[field] === "string" && entry[field].trim().length > 0,
        `${code}: ${field} is empty — a shadow nobody can check is a claim, not a control`
      );
    }
  }
});

test("an UNREACHABLE_BY_STRUCTURE refusal is not also counted as debt, and still exists", () => {
  const { onLive, onHeld } = denyCodes();
  const known = new Set(UNDEMONSTRATED);
  const shadowed = new Set(Object.keys(SHADOWED));
  for (const [code, entry] of Object.entries(UNREACHABLE_BY_STRUCTURE)) {
    assert.ok(!known.has(code), `${code} is both structurally unreachable and listed as debt; it is one or the other`);
    assert.ok(!shadowed.has(code), `${code} is in two categories; a shadow and a structural invariant lift for different reasons`);
    assert.ok(onLive.has(code) || onHeld.has(code), `${code} is recorded as unreachable but no longer exists in src/`);
    for (const field of ["invariant", "asserted_by"]) {
      assert.ok(
        typeof entry[field] === "string" && entry[field].trim().length > 0,
        `${code}: ${field} is empty — an invariant nobody can check is a claim, not a control`
      );
    }
  }
});

test("the code-name blind spot now has a way to be measured", () => {
  // The UNDEMONSTRATED comment says no mechanical check HERE can tell which site
  // a test reached. That is still true of this file, and it is why the tool
  // exists: it renames a code in ONE module, runs the tests referencing that
  // module, and reports whether anything failed. A check outside the test files
  // can do what a check inside them cannot.
  const tool = read("tools/per-site-demonstration.mjs");

  // The tool mutates files in src/ and restores them with `git checkout --`. If
  // it is killed mid-run — which happened twice while it was being built,
  // because a synchronous test run blocks the event loop and signal handlers
  // cannot fire — the leftover file is identified by a MARKER string. That
  // recovery is only sound while the marker appears NOWHERE ELSE in the tree.
  const marker = /const MARKER = "([A-Z_]+)"/.exec(tool)?.[1];
  assert.ok(marker, "the tool no longer declares a MARKER");

  const elsewhere = [...ls("src/"), ...ls("tests/"), ...ls("tools/")]
    .filter((f) => f.endsWith(".mjs") && f !== "tools/per-site-demonstration.mjs")
    .filter((f) => read(f).includes(marker));
  assert.deepEqual(
    elsewhere,
    [],
    `${marker} appears outside the tool. Its crash recovery restores any src/ file containing that ` +
      "string, so a second home for it would make the tool discard real work."
  );
});

test("a refusal exported as a CONSTANT is still asserted by some test that imports it", () => {
  // The hole neither this ratchet nor the per-site tool can see by renaming.
  //
  // Five modules export their deny codes as named constants. A test that
  // imports the constant and asserts `result.code === DENY_X` moves BOTH sides
  // together when the literal changes, so a rename-based probe reports "nothing
  // failed" and cannot tell a covered module from an uncovered one. The screen
  // in tools/per-site-demonstration.mjs first called all three of
  // event-family-policy, replay-assembler and redaction-policy blind for
  // exactly this reason; they are not, and it now says INCONCLUSIVE instead.
  //
  // What CAN be checked without mutation is this: some test imports the module
  // and names the constant. That is weaker than demonstrating the refusal, and
  // is labelled as weaker — but it fails outright if a constant is exported and
  // never referenced anywhere, which is the state a rename probe is blind to.
  const importsOf = (source) =>
    [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]);
  const testSources = ls("tests/")
    .filter((f) => f.endsWith(".mjs") && f !== SELF)
    .map((f) => [f, read(f)]);

  const unreferenced = [];
  for (const file of ls("src/").filter((f) => f.endsWith(".mjs"))) {
    const exported = [...read(file).matchAll(/export const (DENY_[A-Z0-9_]+)\s*=/g)].map((m) => m[1]);
    if (exported.length === 0) continue;
    const base = file.split("/").pop();
    const importers = testSources.filter(([, s]) => importsOf(s).some((spec) => spec.endsWith(base)));
    for (const name of exported) {
      // `\\b`. A bare \b inside a template literal is the BACKSPACE character,
      // so the pattern matches nothing and every constant reads as unreferenced.
      const seen = importers.some(([, s]) => new RegExp(`\\b${name}\\b`).test(s));
      if (!seen) unreferenced.push(`${file} :: ${name}`);
    }
  }

  assert.deepEqual(
    unreferenced,
    [],
    "These refusals are exported as constants and no test that imports their module ever names them. " +
      "A rename-based probe cannot see this — it reports success either way — so this assertion is the " +
      "only thing standing behind them."
  );
});
