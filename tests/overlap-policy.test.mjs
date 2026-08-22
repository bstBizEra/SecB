import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  evaluateOverlap,
  OVERLAP_CLASSES,
  OVERLAP_ORDER,
  OVERLAP_DENY_CODES
} from "../src/control/overlap-policy.mjs";

const root = resolve(import.meta.dirname, "..");

// The commit this slice branches from; the byte-identity guard pins every file
// this module reads-but-does-not-modify against it.
const BASE = "c52db71";

// Convenience wrapper: supplies a fully-answered, non-escalating doctrine frame
// so a case only overrides the dimension it exercises. Defaults are the O0 floor.
const evalO = (over = {}) =>
  evaluateOverlap({
    writeSetA: ["src/moduleA/a.mjs"],
    writeSetB: ["src/moduleB/b.mjs"],
    sameModule: false,
    sameSymbol: false,
    protectedBranch: false,
    globalConfig: false,
    ...over
  });

// ===========================================================================
// Row-by-row O-class ladder (positive classification)
// ===========================================================================

test("O0: separate modules/files, nothing asserted -> Parallel", () => {
  const res = evalO();
  assert.deepEqual(res, {
    ok: true,
    overlapClass: "O0",
    control: "Parallel",
    overlap: "Separate modules/files"
  });
});

test("O1: same module, separate files -> Declared ownership", () => {
  const res = evalO({ sameModule: true });
  assert.equal(res.ok, true);
  assert.equal(res.overlapClass, "O1");
  assert.equal(res.control, "Declared ownership");
});

test("O2: shared file (derived from write sets) -> Reservation and conflict forecast", () => {
  const res = evaluateOverlap({
    writeSetA: ["src/shared/file.mjs"],
    writeSetB: ["src/shared/file.mjs"],
    sameModule: true,
    sameSymbol: false,
    protectedBranch: false,
    globalConfig: false
  });
  assert.equal(res.overlapClass, "O2");
  assert.equal(res.control, "Reservation and conflict forecast");
});

test("O2: prefix-ancestor overlap (dir vs file under it) is derived as same file", () => {
  const res = evaluateOverlap({
    writeSetA: ["src/shared"],
    writeSetB: ["src/shared/nested/deep.mjs"],
    sameModule: true,
    sameSymbol: false,
    protectedBranch: false,
    globalConfig: false
  });
  assert.equal(res.overlapClass, "O2");
});

// ===========================================================================
// F-1 regression — case-sensitivity silent-fail-open (second independent
// review, mod-wspace-s2-overlap-policy-second-independent-review-001).
// Two write sets naming the SAME file with different case must classify as a
// real collision (O2+), not O0/Parallel. Reproduces the reviewer's exact
// probe: writeSetA:["src/Foo.js"], writeSetB:["src/foo.js"], all four doctrine
// dimensions false. Before the fix this returned O0; the fix reuses write-
// set-policy's existing case-folded PROHIBITED-branch comparison (built
// originally to defeat a case-varying bypass of a declared prohibited prefix)
// as a fallback, rather than reimplementing case-folding logic here.
// ===========================================================================

test("F-1 regression: same file, differing case -> O2 (real collision), NOT O0", () => {
  const res = evaluateOverlap({
    writeSetA: ["src/Foo.js"],
    writeSetB: ["src/foo.js"],
    sameModule: false,
    sameSymbol: false,
    protectedBranch: false,
    globalConfig: false
  });
  assert.equal(res.ok, true);
  assert.equal(res.overlapClass, "O2", "case-differing same-file pair must NOT classify as O0");
  assert.equal(res.control, "Reservation and conflict forecast");
});

test("F-1 regression: case-fold applies symmetrically regardless of argument order", () => {
  const forward = evaluateOverlap({
    writeSetA: ["src/Foo.js"],
    writeSetB: ["src/foo.js"],
    sameModule: false,
    sameSymbol: false,
    protectedBranch: false,
    globalConfig: false
  });
  const reversed = evaluateOverlap({
    writeSetA: ["src/foo.js"],
    writeSetB: ["src/Foo.js"],
    sameModule: false,
    sameSymbol: false,
    protectedBranch: false,
    globalConfig: false
  });
  assert.equal(forward.overlapClass, "O2");
  assert.equal(reversed.overlapClass, "O2");
});

test("F-1 regression: case-fold applies to ancestor/descendant paths too", () => {
  const res = evaluateOverlap({
    writeSetA: ["src/Shared"],
    writeSetB: ["src/shared/nested/deep.mjs"],
    sameModule: false,
    sameSymbol: false,
    protectedBranch: false,
    globalConfig: false
  });
  assert.equal(res.overlapClass, "O2", "case-differing ancestor bound must still overlap its descendant");
});

test("F-1 no-regression: prefix-confusion boundary stays NOT-overlap even under case folding", () => {
  // src/Foo vs src/foobar must still NOT overlap: case-folding must not turn the
  // classic prefix-confusion boundary into a false collision.
  const res = evaluateOverlap({
    writeSetA: ["src/Foo"],
    writeSetB: ["src/foobar"],
    sameModule: false,
    sameSymbol: false,
    protectedBranch: false,
    globalConfig: false
  });
  assert.equal(res.overlapClass, "O0", "case-varying prefix-confusion pair must remain non-overlapping");
});

test("F-1 no-regression: disjoint case-varying paths remain O0", () => {
  const res = evaluateOverlap({
    writeSetA: ["src/Alpha.mjs"],
    writeSetB: ["src/Beta.mjs"],
    sameModule: false,
    sameSymbol: false,
    protectedBranch: false,
    globalConfig: false
  });
  assert.equal(res.overlapClass, "O0", "genuinely different files must not collide merely because casing differs");
});

// ===========================================================================
// F-2 regression — deny-code order-dependence on doubly-malformed input
// (second independent review, same record, §2.4). evaluateOverlap(A,B) and
// evaluateOverlap(B,A) must return the SAME deny code (never a different
// verdict — this was already true) when both write sets are independently
// malformed in different ways.
// ===========================================================================

test("F-2 regression: doubly-malformed input yields the same deny code regardless of argument order", () => {
  const forward = evaluateOverlap({
    writeSetA: [],
    writeSetB: ["../etc/passwd"],
    sameModule: false,
    sameSymbol: false,
    protectedBranch: false,
    globalConfig: false
  });
  const reversed = evaluateOverlap({
    writeSetA: ["../etc/passwd"],
    writeSetB: [],
    sameModule: false,
    sameSymbol: false,
    protectedBranch: false,
    globalConfig: false
  });
  assert.equal(forward.ok, false);
  assert.equal(reversed.ok, false);
  assert.equal(forward.code, reversed.code, "deny code must not depend on which malformed set landed in slot A");
  assert.equal(forward.code, "DENY_OVERLAP_MALFORMED", "grammar violation outranks a merely-empty set");
});

test("O3: same symbol/API/schema -> Variant or serialize", () => {
  const res = evalO({ sameSymbol: true });
  assert.equal(res.overlapClass, "O3");
  assert.equal(res.control, "Variant or serialize");
});

test("O4: lockfile/generated/global config -> Single writer", () => {
  const res = evalO({ globalConfig: true });
  assert.equal(res.overlapClass, "O4");
  assert.equal(res.control, "Single writer");
});

test("O5: protected branch/release/prod config -> Serialized and human authorized", () => {
  const res = evalO({ protectedBranch: true });
  assert.equal(res.overlapClass, "O5");
  assert.equal(res.control, "Serialized and human authorized");
});

// ===========================================================================
// Most-restrictive-wins / contradiction escalation (deny-by-default extended)
// ===========================================================================

test("most-restrictive wins: protectedBranch dominates every lower dimension", () => {
  const res = evaluateOverlap({
    writeSetA: ["src/shared/file.mjs"],
    writeSetB: ["src/shared/file.mjs"],
    sameModule: true,
    sameSymbol: true,
    protectedBranch: true,
    globalConfig: true
  });
  assert.equal(res.overlapClass, "O5");
});

test("escalation ladder: each higher flag outranks the lower ones", () => {
  // globalConfig outranks sameSymbol/file-overlap.
  assert.equal(evalO({ sameSymbol: true, globalConfig: true }).overlapClass, "O4");
  // sameSymbol outranks a derived file overlap.
  const symbolWins = evaluateOverlap({
    writeSetA: ["src/shared/file.mjs"],
    writeSetB: ["src/shared/file.mjs"],
    sameModule: true,
    sameSymbol: true,
    protectedBranch: false,
    globalConfig: false
  });
  assert.equal(symbolWins.overlapClass, "O3");
});

test("contradiction (sameSymbol asserted, no path overlap) escalates, never relaxes", () => {
  // Disjoint write sets but sameSymbol true -> the MORE restrictive O3, not O0/O1.
  const res = evalO({ sameModule: false, sameSymbol: true });
  assert.equal(res.overlapClass, "O3");
});

test("file overlap forces at least O2 even if caller claims different modules", () => {
  const res = evaluateOverlap({
    writeSetA: ["src/x/shared.mjs"],
    writeSetB: ["src/x/shared.mjs"],
    sameModule: false, // contradictory: files overlap but 'different modules'
    sameSymbol: false,
    protectedBranch: false,
    globalConfig: false
  });
  assert.equal(res.overlapClass, "O2");
});

// ===========================================================================
// Deny codes
// ===========================================================================

test("DENY_OVERLAP_MALFORMED: input is not a plain object", () => {
  for (const bad of [null, undefined, "x", 7, [], ["src/a"], true]) {
    const res = evaluateOverlap(bad);
    assert.equal(res.ok, false, `input ${JSON.stringify(bad)}`);
    assert.equal(res.code, "DENY_OVERLAP_MALFORMED");
  }
});

test("DENY_OVERLAP_MALFORMED: write sets not genuine arrays", () => {
  assert.equal(evalO({ writeSetA: "src/a" }).code, "DENY_OVERLAP_MALFORMED");
  assert.equal(evalO({ writeSetB: { 0: "src/b", length: 1 } }).code, "DENY_OVERLAP_MALFORMED");
  assert.equal(evalO({ writeSetA: null }).code, "DENY_OVERLAP_MALFORMED");
});

test("DENY_OVERLAP_MALFORMED: write-set path grammar violations (delegated to S1)", () => {
  // Traversal, absolute, non-canonical alias, blank, null-byte, non-string.
  for (const bad of [
    ["src/../secret"],
    ["/etc/passwd"],
    ["C:\\Users\\x"],
    ["src//gateway"],
    ["src/./gateway"],
    ["src\\gateway"],
    [""],
    ["src/a\0b"],
    [42]
  ]) {
    const res = evalO({ writeSetA: bad });
    assert.equal(res.ok, false, `path ${JSON.stringify(bad)}`);
    assert.equal(res.code, "DENY_OVERLAP_MALFORMED", `path ${JSON.stringify(bad)}`);
  }
});

test("DENY_OVERLAP_EMPTY: an empty declared write set is denied (doctrine lane contract)", () => {
  assert.equal(evalO({ writeSetA: [] }).code, "DENY_OVERLAP_EMPTY");
  assert.equal(evalO({ writeSetB: [] }).code, "DENY_OVERLAP_EMPTY");
});

test("DENY_OVERLAP_UNKNOWN_CLASS: missing or non-boolean doctrine dimension fails closed", () => {
  const base = {
    writeSetA: ["src/a/x.mjs"],
    writeSetB: ["src/b/y.mjs"],
    sameModule: false,
    sameSymbol: false,
    protectedBranch: false,
    globalConfig: false
  };
  for (const field of ["sameModule", "sameSymbol", "protectedBranch", "globalConfig"]) {
    // Omitted entirely.
    const omitted = { ...base };
    delete omitted[field];
    assert.equal(evaluateOverlap(omitted).code, "DENY_OVERLAP_UNKNOWN_CLASS", `omit ${field}`);
    // Present but non-boolean (truthy string, 1, null).
    for (const val of ["true", 1, 0, null, {}]) {
      assert.equal(
        evaluateOverlap({ ...base, [field]: val }).code,
        "DENY_OVERLAP_UNKNOWN_CLASS",
        `${field}=${JSON.stringify(val)}`
      );
    }
  }
});

test("the permissive O0 floor is unreachable by omission (deny-by-default)", () => {
  // With no doctrine flags answered, an otherwise-O0-looking disjoint pair must
  // NOT classify as O0 — it fails closed to UNKNOWN_CLASS.
  const res = evaluateOverlap({ writeSetA: ["src/a/x.mjs"], writeSetB: ["src/b/y.mjs"] });
  assert.equal(res.code, "DENY_OVERLAP_UNKNOWN_CLASS");
});

test("OVERLAP_DENY_CODES is the exact closed, frozen set", () => {
  assert.deepEqual(
    [...OVERLAP_DENY_CODES].sort(),
    ["DENY_OVERLAP_EMPTY", "DENY_OVERLAP_MALFORMED", "DENY_OVERLAP_UNKNOWN_CLASS"].sort()
  );
  assert.equal(Object.isFrozen(OVERLAP_DENY_CODES), true);
});

// ===========================================================================
// Atomic-snapshot / TOCTOU / accessor-attack suite
// ===========================================================================

test("accessor-attack: throwing field getter is contained and read exactly once", () => {
  let reads = 0;
  const hostile = Object.defineProperty(
    {
      writeSetB: ["src/b/y.mjs"],
      sameModule: false,
      sameSymbol: false,
      protectedBranch: false,
      globalConfig: false
    },
    "writeSetA",
    {
      enumerable: true,
      get() {
        reads += 1;
        throw new Error("getter boom");
      }
    }
  );
  const res = evaluateOverlap(hostile);
  assert.deepEqual(res, {
    ok: false,
    code: "DENY_OVERLAP_MALFORMED",
    message: "input could not be safely inspected"
  });
  assert.equal(reads, 1, "hostile field accessor must not be retried");
  assert.equal(Object.isFrozen(res), true);
});

test("accessor-attack: Proxy get-trap that throws is contained", () => {
  const res = evaluateOverlap(new Proxy({}, {
    get() {
      throw new Error("proxy boom");
    }
  }));
  assert.equal(res.code, "DENY_OVERLAP_MALFORMED");
  assert.equal(Object.isFrozen(res), true);
});

test("accessor-attack: tampered Symbol.iterator on a write set is rejected, never invoked", () => {
  let iterInvoked = false;
  const evil = ["src/a/x.mjs"];
  evil[Symbol.iterator] = function* () {
    iterInvoked = true;
    yield "src/../escape";
  };
  const res = evalO({ writeSetA: evil });
  assert.equal(res.code, "DENY_OVERLAP_MALFORMED");
  assert.equal(iterInvoked, false, "poisoned iterator must never be invoked");
});

test("TOCTOU cross-array: a writeSetA element getter cannot affect writeSetB classification", () => {
  // writeSetA[0] is an accessor; reading it once must be the only read, and it
  // must not be able to mutate any state that changes writeSetB's contribution.
  let elemReads = 0;
  let sideChannel = "src/b/y.mjs";
  const writeSetA = [];
  Object.defineProperty(writeSetA, 0, {
    enumerable: true,
    get() {
      elemReads += 1;
      // Hostile side effect: try to flip what writeSetB looks like mid-eval.
      sideChannel = "src/a/x.mjs"; // would create an overlap if re-read late
      return "src/a/x.mjs";
    }
  });
  writeSetA.length = 1;
  const writeSetB = ["src/b/y.mjs"]; // fixed, disjoint from writeSetA
  const res = evaluateOverlap({
    writeSetA,
    writeSetB,
    sameModule: false,
    sameSymbol: false,
    protectedBranch: false,
    globalConfig: false
  });
  // writeSetA element read at most a small bounded number of times, but each
  // read returns the SAME snapshotted value; classification stays O0 because the
  // snapshot of writeSetB was disjoint and was never re-derived from sideChannel.
  assert.equal(res.ok, true);
  assert.equal(res.overlapClass, "O0");
  assert.equal(elemReads, 1, "element snapshotted exactly once (no re-read of the hostile getter)");
  assert.equal(sideChannel, "src/a/x.mjs"); // proves the getter fired but changed nothing observable
});

test("TOCTOU: element getter that returns different values on repeated reads cannot drift the decision", () => {
  // The snapshot reads each index exactly once; a value that mutates on the 2nd
  // read is never observed a 2nd time by the evaluator.
  let n = 0;
  const writeSetA = [];
  Object.defineProperty(writeSetA, 0, {
    enumerable: true,
    get() {
      n += 1;
      return n === 1 ? "src/a/x.mjs" : "src/b/y.mjs"; // 2nd+ read would overlap B
    }
  });
  writeSetA.length = 1;
  const res = evaluateOverlap({
    writeSetA,
    writeSetB: ["src/b/y.mjs"],
    sameModule: false,
    sameSymbol: false,
    protectedBranch: false,
    globalConfig: false
  });
  assert.equal(res.overlapClass, "O0", "only the first snapshotted value is ever used");
});

// ===========================================================================
// Deep-frozen output + mutation resistance
// ===========================================================================

test("outputs are deep-frozen and reject mutation", () => {
  const ok = evalO();
  assert.equal(Object.isFrozen(ok), true);
  assert.throws(() => { ok.overlapClass = "O5"; }, TypeError);
  assert.throws(() => { ok.ok = false; }, TypeError);

  const bad = evaluateOverlap(null);
  assert.equal(Object.isFrozen(bad), true);
  assert.throws(() => { bad.code = "X"; }, TypeError);
});

test("OVERLAP_CLASSES and its rows are frozen", () => {
  assert.equal(Object.isFrozen(OVERLAP_CLASSES), true);
  for (const cls of OVERLAP_ORDER) {
    assert.equal(Object.isFrozen(OVERLAP_CLASSES[cls]), true);
    assert.throws(() => { OVERLAP_CLASSES[cls].control = "mut"; }, TypeError);
  }
  assert.equal(Object.isFrozen(OVERLAP_ORDER), true);
});

// ===========================================================================
// DOC-PARITY — the S2 control: the codified O-table must match the doctrine
// markdown verbatim, parsed at runtime. Any drift fails the suite.
// ===========================================================================

function parseTable(markdown, headerIncludes) {
  const lines = markdown.split(/\r?\n/);
  const isRow = (l) => /^\s*\|.*\|\s*$/.test(l);
  const cells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  for (let i = 0; i < lines.length; i += 1) {
    if (!isRow(lines[i])) continue;
    const header = cells(lines[i]);
    if (!headerIncludes.every((h) => header.includes(h))) continue;
    if (i + 1 >= lines.length || !/^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) continue;
    const rows = [];
    for (let j = i + 2; j < lines.length && isRow(lines[j]); j += 1) {
      const values = cells(lines[j]);
      const row = {};
      header.forEach((h, idx) => { row[h] = values[idx]; });
      rows.push(row);
    }
    return rows;
  }
  throw new Error(`table with headers ${JSON.stringify(headerIncludes)} not found`);
}

test("doc-parity: O0-O5 overlap + control match parallel-execution.md verbatim", () => {
  const doc = readFileSync(resolve(root, "docs/12-execution/06-parallel-execution.md"), "utf8");
  const rows = parseTable(doc, ["Class", "Overlap", "Control"]);
  const byClass = Object.fromEntries(rows.map((r) => [r.Class, r]));
  for (const cls of OVERLAP_ORDER) {
    const docRow = byClass[cls];
    assert.ok(docRow, `${cls} present in overlap-policy table`);
    assert.equal(OVERLAP_CLASSES[cls].overlap, docRow.Overlap, `${cls} overlap verbatim`);
    assert.equal(OVERLAP_CLASSES[cls].control, docRow.Control, `${cls} control verbatim`);
  }
  // The code covers exactly the doctrine's O-rows (no more, no fewer).
  assert.equal(rows.length, OVERLAP_ORDER.length, "overlap row count matches doctrine");
});

// ===========================================================================
// Reuse parity pin — this module's file-overlap decision must agree with an
// INDEPENDENT containment oracle (verbatim copy of context-federation's
// pathSubset, which write-set-policy's containment mirrors). Keeps the reuse of
// evaluateWriteSet honest; the byte-identity guard below pins the reused source.
//
// NOTE (second independent review, F-1): this oracle is intentionally
// case-sensitive, same as it always was — it mirrors context-federation's
// pathSubset verbatim and is NOT updated to model the case-fold fast-follow
// applied to overlap-policy.mjs. Do not add a case-differing row to the table
// below; it would spuriously "fail" this parity check even though the module's
// case-fold behavior is correct (this oracle just doesn't model it). The
// case-fold property itself is asserted directly by the F-1 regression tests
// above, against the reviewer's exact scenario, not against this oracle.
// ===========================================================================

function referencePathSubset(candidate, bound) {
  const hasParent = (v) => v.split(/[\\/]/).includes("..");
  if (candidate.some(hasParent)) return false;
  const bounds = bound.map((p) => p.replace(/\/+$/, ""));
  return candidate.every((p) => bounds.some((e) => p === e || p.startsWith(`${e}/`)));
}

// Reference overlap: sets overlap iff some pair is ancestor-or-equal either way.
function referenceOverlap(a, b) {
  return a.some((pa) => b.some((pb) =>
    referencePathSubset([pa], [pb]) || referencePathSubset([pb], [pa])));
}

test("reuse parity: derived file overlap agrees with the independent oracle", () => {
  const table = [
    { a: ["src/x/a.mjs"], b: ["src/y/b.mjs"] },              // disjoint
    { a: ["src/shared.mjs"], b: ["src/shared.mjs"] },        // identical file
    { a: ["src/shared"], b: ["src/shared/deep/x.mjs"] },     // ancestor / descendant
    { a: ["src/foo"], b: ["src/foobar"] },                   // prefix collision, NOT overlap
    { a: ["src/a", "tests/b"], b: ["docs/c", "tests/b"] },   // overlap on tests/b
    { a: ["src/a", "src/b"], b: ["src/c", "src/d"] }         // same dir, disjoint files
  ];
  let overlapRows = 0;
  let disjointRows = 0;
  for (const row of table) {
    const oracle = referenceOverlap(row.a, row.b);
    // Derive the module's answer: with all flags false, O2 iff files overlap,
    // else O0 (sameModule false). overlapClass === "O2" <=> filesOverlap.
    const res = evaluateOverlap({
      writeSetA: row.a,
      writeSetB: row.b,
      sameModule: false,
      sameSymbol: false,
      protectedBranch: false,
      globalConfig: false
    });
    const derived = res.overlapClass === "O2";
    assert.equal(derived, oracle, `overlap parity mismatch for ${JSON.stringify(row)}`);
    oracle ? (overlapRows += 1) : (disjointRows += 1);
  }
  assert.ok(overlapRows >= 2, `expected several overlap rows, got ${overlapRows}`);
  assert.ok(disjointRows >= 2, `expected several disjoint rows, got ${disjointRows}`);
});

// ===========================================================================
// Byte-identity guard — prove zero edits to the existing files this slice reads
// but must not modify, vs main @ c52db71. write-set-policy.mjs is load-bearing:
// this module imports and reuses it directly, so pinning it is what makes the
// "reuse, don't reimplement" claim verifiable.
// ===========================================================================

test("byte-identity: reused/consulted sources are unchanged vs main @ c52db71", () => {
  const guarded = [
    "src/control/write-set-policy.mjs",
    "src/services/context-federation-service.mjs",
    "src/control/risk-registry.mjs"
    
  ];
  for (const rel of guarded) {
    const baseBlob = execFileSync("git", ["rev-parse", `${BASE}:${rel}`], { cwd: root, encoding: "utf8" }).trim();
    const worktreeBlob = execFileSync("git", ["hash-object", resolve(root, rel)], { cwd: root, encoding: "utf8" }).trim();
    assert.equal(worktreeBlob, baseBlob, `${rel} blob differs from ${BASE}`);
  }
  // package.json was authorized-modified by cbe93cb (secb-graph CLI), 31ddfef
  // (skills hub), fe64aac (MCP upstream tooling) and c4025c5 (secb dispatcher
  // bin + script), so it is no longer blob-identical to the base commit. Pinned
  // rather than dropped: an unauthorized script or bin entry still fails here.
  assert.equal(
    execFileSync("git", ["hash-object", resolve(root, "package.json")], { cwd: root, encoding: "utf8" }).trim(),
    "fc108a6b46be8007a8a2ae3e1371be4155e82510",
    "package.json pinned to its post-c4025c5 blob"
  );
  // tools/validate-foundation.mjs was authorized-modified by MOD-WSPACE-S3 (G6
  // workspace-lease schema registration, 16->17 schemas), then again by
  // MOD-MEM S2 (memory-record schema registration, 17->18 schemas), so it is
  // no longer blob-identical to ${BASE}. Pin it to its post-MOD-MEM-S2 blob
  // instead of dropping the guard, so any UNAUTHORIZED further drift of the
  // validator still fails.
  assert.equal(
    execFileSync("git", ["hash-object", resolve(root, "tools/validate-foundation.mjs")], { cwd: root, encoding: "utf8" }).trim(),
    "0b9a48e6c793d7c984e23d2824482ea2db80ba94",
    "validate-foundation.mjs pinned to its post-fail-learn blob"
  );
  // Sanity: the reused primitive actually still exports the containment evaluator
  // this module leans on, so the guard protects the right thing.
  const wsp = readFileSync(resolve(root, "src/control/write-set-policy.mjs"), "utf8");
  assert.ok(wsp.includes("export function evaluateWriteSet"), "evaluateWriteSet present in reused source");
});
