// Every disabled control has a reason, a decider, and a condition that ends the
// hold — and the condition is EVALUATED, not just written down.
//
// WORK PACKAGE (recorded here, per the advancement mandate's Phase E)
//
//   Objective    Convert silently-disabled controls into monitored ones.
//   Problem      14 skip sites are declared across tests/; 5 skip at runtime.
//                Their blockers are free prose inside the skip message, bound to
//                revisions that have moved — V-016 cites `main @ 4abfff2`, more
//                than 200 commits stale — and NOTHING re-evaluates whether a
//                blocker still holds. A skip whose condition is resolved keeps
//                skipping forever. The control never returns and never goes red.
//   Scope        tests/ only. No production module, contract or policy changes.
//   Exclusions   Does not re-enable any skipped test. Re-enabling V-011, V-016
//                or V-020 requires the authority each entry names.
//   Authority    Ordinary implementation, AMD-002 §1 pre-authorized path. Adds a
//                constraint and removes none; no authority, policy, SoD, release
//                gate, evidence-acceptance or activation surface is touched.
//   Completion   The runtime skip set is pinned by NAME; every blocker carries an
//                evaluated release predicate; a lifted blocker turns this red.
//
// WHY A PREDICATE AND NOT PROSE
//
// The module disposition register records why a module is held. Prose is enough
// there because a held module's state is visible in the import graph, which this
// suite computes. A skipped test is invisible: it reports `ok ... # SKIP` and
// counts toward the pass total. So each blocker here also declares a `lifted()`
// predicate the suite evaluates. Every one must currently be FALSE. The first
// time a blocker is resolved, this file fails and says which control should come
// back — which is the only way a disabled control ever returns on purpose.
//
// I diagnosed V-016 as a stale blocker before writing this, and was WRONG. The
// checkpoint-drift comparator exists and is wired, but its comparison surface is
// content_hash / sequence / state_snapshot_ref, and evaluateResumeFromLedger
// reads a CHECKPOINT ledger, not a live source-ledger head. It cannot detect
// source-ledger drift. The blocker holds. Establishing that took reading three
// modules, which is the cost this register removes for the next reader.

import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(resolve(REPO, rel), "utf8");

const KIND = Object.freeze({
  BLOCKED: "a control that would run here but for a named, unmet condition",
  PLATFORM: "a control that is not applicable on this host and runs elsewhere"
});

/**
 * Every test that skips at runtime.
 *
 * DO NOT ADD AN ENTRY TO SILENCE A FAILURE. A new line is a record that a
 * control was switched off, and it belongs in a commit that says who decided.
 * `lifted()` must return false while the blocker holds; when it returns true
 * this file fails, which is the notification that the control can come back.
 */
const REGISTERED_SKIPS = Object.freeze({
  "V-011 redaction: data classification enforcement on events (storage plane)": {
    kind: KIND.BLOCKED,
    site: "tests/conformance-stubs.test.mjs:318",
    reason:
      "Storage-plane redaction is a P0-08 security policy surface. The evaluator exists at " +
      "src/security/redaction-policy.mjs but is PURE + UNWIRED, and its own header places " +
      "pre-storage enforcement out of scope as separately SEC/GOV-gated work.",
    decider: "SEC/GOV",
    release_condition: "redaction-policy is adopted into a storage path and reachable from the public surface",
    lifted: () => read("src/index.mjs").includes("security/redaction-policy.mjs")
  },

  "V-016 recovery: source-ledger drift comparison denies a drifted checkpoint": {
    kind: KIND.BLOCKED,
    site: "tests/conformance-stubs.test.mjs:571",
    reason:
      "Needs a primitive that compares source_ledger_id at sequence_at_checkpoint against the LIVE " +
      "source-ledger head. checkpoint-drift-comparator.mjs is wired but compares content_hash, " +
      "sequence and state_snapshot_ref against a caller-supplied observed state, and " +
      "evaluateResumeFromLedger reads a checkpoint ledger rather than a source-ledger head. " +
      "Its skip message cites `main @ 4abfff2`; that citation is stale, the claim is not.",
    decider: "MOD-RUNTIME owner",
    release_condition: "a comparator field spec covers source_ledger_id against a live source-ledger head",
    lifted: () => read("src/control/checkpoint-drift-comparator.mjs").includes("source_ledger_id")
  },

  "V-020 positive (PENDING — activation-gated): human GOV decision changes allowed state": {
    kind: KIND.BLOCKED,
    site: "tests/conformance-v020-governance.test.mjs:331",
    reason:
      "Requires a real human GOV decision plus operator activation. Covering it here would " +
      "self-authorize activation, which AMD-002's retained hard gates forbid.",
    decider: "operator / GOV",
    release_condition: "P0-20 operator activation disposition 002 is ratified",
    lifted: () =>
      !read("docs/03-project-control/candidates/p0-20-operator-activation-disposition-002.md").includes(
        "OPERATOR_VERDICT_TRANSCRIBED_PENDING_RATIFICATION"
      )
  },

  "SIGINT during startup leaves no orphaned child": {
    kind: KIND.PLATFORM,
    site: "tests/secb-mcp-doctor.test.mjs",
    reason: "Asserts POSIX signal and orphan semantics. Runs on a POSIX host.",
    decider: "not a decision — a host property",
    release_condition: "runs wherever process.platform is not win32",
    lifted: () => process.platform !== "win32"
  },

  "lookupCommandOnPath requires the execute bit on a unix host": {
    kind: KIND.PLATFORM,
    site: "tests/secb-mcp-doctor.test.mjs:379",
    reason: "Asserts unix execute-bit semantics, which Windows does not have.",
    decider: "not a decision — a host property",
    release_condition: "runs wherever process.platform is not win32",
    lifted: () => process.platform !== "win32"
  }
});

/** Test files that declare a skip, discovered rather than listed. */
function skipDeclaringFiles() {
  const files = execFileSync("git", ["ls-files", "--", "tests/"], { cwd: REPO, encoding: "utf8" })
    .split("\n")
    .filter((f) => f.endsWith(".mjs"));
  return files.filter((f) => f !== "tests/skip-disposition-register.test.mjs" && /\{\s*skip:/.test(read(f)));
}

/**
 * The names that actually skip, read from TAP rather than inferred from source.
 *
 * Memoised: the child run costs ~16s and two tests need the answer. Computing it
 * per test doubled the file's cost for an answer that cannot change within a run.
 */
let runtimeSkipCache = null;
function runtimeSkips() {
  if (runtimeSkipCache) return runtimeSkipCache;
  const env = { ...process.env };
  // Inherited, a nested `node --test` reports to the outer runner: output goes
  // quiet and a failing test exits 0. Measured elsewhere in this repository.
  delete env.NODE_TEST_CONTEXT;

  let out = "";
  try {
    out = execFileSync(process.execPath, ["--test", "--test-reporter=tap", ...skipDeclaringFiles()], {
      cwd: REPO,
      encoding: "utf8",
      env,
      maxBuffer: 64 * 1024 * 1024
    });
  } catch (error) {
    out = `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
  runtimeSkipCache = out
    .split("\n")
    // Leading whitespace is REQUIRED in this pattern. TAP indents subtests, so a
    // `^ok` anchor sees only top-level `test(...)` skips and misses every
    // `it(...)` inside a `describe(...)`. That is the dangerous class: the
    // conditional skips guarded by `{ skip: !has(MAIN) }`, which start skipping
    // silently the moment a ref they depend on disappears. Proven: with the
    // anchored pattern, flipping one of those to `skip: true` produced 0
    // failures — the guard reported all-clear over a control that had just been
    // switched off.
    .map((l) => /^\s*ok\s+\d+\s+-\s+(.*?)\s+#\s+SKIP\b/.exec(l))
    .filter(Boolean)
    .map((m) => m[1]);
  return runtimeSkipCache;
}

test("every test that skips at runtime is registered", () => {
  const unregistered = runtimeSkips().filter((name) => !(name in REGISTERED_SKIPS));
  assert.deepEqual(
    unregistered,
    [],
    "These tests skipped and no entry records why. A skip reports `ok ... # SKIP` and counts toward " +
      "the pass total, so a control switched off this way is invisible. Record the reason, the " +
      "decider, the release condition, and a predicate that evaluates it."
  );
});

test("every registered BLOCKED skip is still skipping", () => {
  const skipping = new Set(runtimeSkips());
  const stale = Object.entries(REGISTERED_SKIPS)
    .filter(([, d]) => d.kind === KIND.BLOCKED)
    .filter(([name]) => !skipping.has(name))
    .map(([name]) => name);
  assert.deepEqual(
    stale,
    [],
    "Registered as blocked but no longer skipping. Remove the entry deliberately — leaving it " +
      "makes this register describe a state that no longer exists."
  );
});

test("no blocker has been lifted without the control returning", () => {
  const lifted = Object.entries(REGISTERED_SKIPS)
    .filter(([, d]) => d.kind === KIND.BLOCKED)
    .filter(([, d]) => d.lifted() === true)
    .map(([name, d]) => `${name} — ${d.release_condition}`);

  assert.deepEqual(
    lifted,
    [],
    "THE BLOCKER IS GONE AND THE CONTROL IS STILL OFF. This is the failure this file exists to " +
      "produce. The release condition above is now satisfied, so the test should be re-enabled by " +
      "whoever the entry names — not silenced by editing the predicate."
  );
});

test("a platform skip is classified as a host property, not as a blocker", () => {
  for (const [name, d] of Object.entries(REGISTERED_SKIPS)) {
    if (d.kind !== KIND.PLATFORM) continue;
    // On a POSIX host these run, so they must not be asserted to keep skipping.
    // Getting this wrong would make the register fail in CI and pass locally.
    assert.equal(d.lifted(), process.platform !== "win32", `${name}: the predicate must track the host`);
  }
});

test("every registered skip is complete", () => {
  for (const [name, d] of Object.entries(REGISTERED_SKIPS)) {
    for (const field of ["kind", "site", "reason", "decider", "release_condition"]) {
      assert.ok(
        typeof d[field] === "string" && d[field].trim().length > 0,
        `${name}: ${field} is empty; an incomplete disposition records nothing`
      );
    }
    assert.ok(Object.values(KIND).includes(d.kind), `${name}: kind must be a declared kind, not free text`);
    assert.equal(typeof d.lifted, "function", `${name}: release_condition must be evaluated, not only described`);
    assert.ok(
      !/\b(agent|claude|codex|worker)\b/i.test(d.decider),
      `${name}: an agent may not be the decider that ends a hold`
    );
  }
});

test("the register's sites still name a file that declares a skip", () => {
  const declaring = new Set(skipDeclaringFiles());
  const orphaned = Object.entries(REGISTERED_SKIPS)
    .map(([name, d]) => [name, d.site.split(":")[0]])
    .filter(([, file]) => !declaring.has(file))
    .map(([name, file]) => `${name} -> ${file}`);
  assert.deepEqual(orphaned, [], "a registered skip points at a file that declares no skip");
});
