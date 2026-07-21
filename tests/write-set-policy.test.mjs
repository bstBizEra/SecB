import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluateWriteSet, WRITE_SET_DENY_CODES } from "../src/control/write-set-policy.mjs";

const root = resolve(import.meta.dirname, "..");

// Convenience wrapper; prohibitedPaths defaults to empty unless a case supplies it.
const evalWS = ({ candidatePaths, allowedPaths, prohibitedPaths = [] }) =>
  evaluateWriteSet({ candidatePaths, allowedPaths, prohibitedPaths });

// ---------------------------------------------------------------------------
// Deny-code coverage — one assertion per code, plus positive allow.
// ---------------------------------------------------------------------------

test("allow: candidate write set is a subset of allowed and clear of prohibited", () => {
  const res = evalWS({
    candidatePaths: ["src/control/write-set-policy.mjs", "tests/write-set-policy.test.mjs"],
    allowedPaths: ["src/control", "tests"],
    prohibitedPaths: ["src/gateway"]
  });
  assert.deepEqual(res, { ok: true });
});

test("DENY_WRITE_SET_EMPTY: no candidate paths", () => {
  const res = evalWS({ candidatePaths: [], allowedPaths: ["src"] });
  assert.equal(res.ok, false);
  assert.equal(res.code, "DENY_WRITE_SET_EMPTY");
});

test("DENY_WRITE_SET_MALFORMED: input is not a plain object", () => {
  for (const bad of [null, undefined, "x", 7, [], ["src/a"]]) {
    const res = evaluateWriteSet(bad);
    assert.equal(res.ok, false, `input ${JSON.stringify(bad)}`);
    assert.equal(res.code, "DENY_WRITE_SET_MALFORMED");
  }
});

test("DENY_WRITE_SET_MALFORMED: non-array candidate / allowed / prohibited", () => {
  assert.equal(evaluateWriteSet({ candidatePaths: "src/a", allowedPaths: ["src"], prohibitedPaths: [] }).code, "DENY_WRITE_SET_MALFORMED");
  assert.equal(evaluateWriteSet({ candidatePaths: ["src/a"], allowedPaths: "src", prohibitedPaths: [] }).code, "DENY_WRITE_SET_MALFORMED");
  assert.equal(evaluateWriteSet({ candidatePaths: ["src/a"], allowedPaths: ["src"], prohibitedPaths: "x" }).code, "DENY_WRITE_SET_MALFORMED");
  // prohibitedPaths omitted entirely (undefined) is deny-by-default malformed.
  assert.equal(evaluateWriteSet({ candidatePaths: ["src/a"], allowedPaths: ["src"] }).code, "DENY_WRITE_SET_MALFORMED");
  // Object masquerading as an array-like is not an array.
  assert.equal(evaluateWriteSet({ candidatePaths: { 0: "src/a", length: 1 }, allowedPaths: ["src"], prohibitedPaths: [] }).code, "DENY_WRITE_SET_MALFORMED");
});

test("DENY_WRITE_SET_MALFORMED: non-string, blank, null-byte and non-primitive entries", () => {
  const allowed = ["src"];
  for (const badEntry of [42, null, undefined, "", "   \0hidden", { path: "src/a" }, ["src/a"]]) {
    // Note "   \0hidden" is non-blank but carries a null byte -> still malformed.
    const res = evalWS({ candidatePaths: ["src/a", badEntry], allowedPaths: allowed });
    assert.equal(res.ok, false, `entry ${String(badEntry)}`);
    assert.equal(res.code, "DENY_WRITE_SET_MALFORMED", `entry ${String(badEntry)}`);
  }
  // Blank string alone.
  assert.equal(evalWS({ candidatePaths: [""], allowedPaths: allowed }).code, "DENY_WRITE_SET_MALFORMED");
  // Malformed entry in the bound arrays is deny-by-default too.
  assert.equal(evalWS({ candidatePaths: ["src/a"], allowedPaths: ["src", 9] }).code, "DENY_WRITE_SET_MALFORMED");
  assert.equal(evalWS({ candidatePaths: ["src/a"], allowedPaths: ["src"], prohibitedPaths: ["\0"] }).code, "DENY_WRITE_SET_MALFORMED");
});

test("DENY_WRITE_SET_MALFORMED: hostile accessors and proxies are contained and read once", () => {
  let reads = 0;
  const hostile = Object.defineProperty({}, "candidatePaths", {
    get() {
      reads += 1;
      throw new Error("getter boom");
    }
  });
  const accessorResult = evaluateWriteSet(hostile);
  assert.deepEqual(accessorResult, {
    ok: false,
    code: "DENY_WRITE_SET_MALFORMED",
    message: "input could not be safely inspected"
  });
  assert.equal(reads, 1, "hostile accessor must not be retried");
  assert.equal(Object.isFrozen(accessorResult), true);

  const proxyResult = evaluateWriteSet(new Proxy({}, {
    get() {
      throw new Error("proxy boom");
    }
  }));
  assert.equal(proxyResult.code, "DENY_WRITE_SET_MALFORMED");
  assert.equal(Object.isFrozen(proxyResult), true);
});

test("prototype-key path strings are ordinary strings, not smuggled keys", () => {
  // "__proto__" / "constructor" are just path segments; deny-by-default puts
  // them OUTSIDE_ALLOWED, never a silent allow, and never mutate any prototype.
  const res = evalWS({ candidatePaths: ["__proto__/x", "constructor"], allowedPaths: ["src"] });
  assert.equal(res.ok, false);
  assert.equal(res.code, "DENY_WRITE_SET_OUTSIDE_ALLOWED");
  assert.equal(({}).polluted, undefined);
  // When explicitly allowed, such a literal path is contained like any other.
  assert.deepEqual(evalWS({ candidatePaths: ["__proto__/x"], allowedPaths: ["__proto__"] }), { ok: true });
});

test("DENY_WRITE_SET_TRAVERSAL: any '..' segment, both separators, mixed", () => {
  const allowed = ["src", "a"];
  for (const p of ["..", "../etc", "src/../secret", "a\\..\\b", "a/../b", "src/sub/..", "..\\win"]) {
    const res = evalWS({ candidatePaths: [p], allowedPaths: allowed });
    assert.equal(res.ok, false, `path ${p}`);
    assert.equal(res.code, "DENY_WRITE_SET_TRAVERSAL", `path ${p}`);
  }
  // "..foo" is NOT a traversal (not a whole segment) — must not false-positive.
  assert.notEqual(evalWS({ candidatePaths: ["src/..foo"], allowedPaths: ["src"] }).code, "DENY_WRITE_SET_TRAVERSAL");
});

test("DENY_WRITE_SET_ABSOLUTE: leading slash, drive letter, UNC", () => {
  const allowed = ["src"];
  for (const p of ["/etc/passwd", "\\windows\\system32", "C:\\Users\\x", "c:/users/x", "Z:relative", "\\\\server\\share\\x", "//server/share/x"]) {
    const res = evalWS({ candidatePaths: [p], allowedPaths: allowed });
    assert.equal(res.ok, false, `path ${p}`);
    assert.equal(res.code, "DENY_WRITE_SET_ABSOLUTE", `path ${p}`);
  }
});

test("non-canonical aliases cannot bypass prohibited-prefix matching", () => {
  const allowedPaths = ["src"];
  const prohibitedPaths = ["src/gateway"];
  for (const p of [
    "src//gateway/secret.mjs",
    "src/./gateway/secret.mjs",
    "src\\gateway\\secret.mjs",
    "src/gateway//secret.mjs",
    "src/gateway/./secret.mjs"
  ]) {
    const res = evalWS({ candidatePaths: [p], allowedPaths, prohibitedPaths });
    assert.equal(res.ok, false, `alias ${p}`);
    assert.equal(res.code, "DENY_WRITE_SET_MALFORMED", `alias ${p}`);
  }
});

test("Windows-equivalent aliases and alternate-data-stream syntax fail closed", () => {
  const allowedPaths = ["src"];
  const prohibitedPaths = ["src/gateway"];
  assert.equal(evalWS({
    candidatePaths: ["src/GATEWAY/secret.mjs"],
    allowedPaths,
    prohibitedPaths
  }).code, "DENY_WRITE_SET_PROHIBITED", "prohibited comparison is case-safe");

  for (const p of [
    "src/gateway./secret.mjs",
    "src/gateway /secret.mjs",
    "src/gateway/secret.mjs:stream",
    "src/ gateway/secret.mjs"
  ]) {
    assert.equal(evalWS({ candidatePaths: [p], allowedPaths, prohibitedPaths: [] }).code,
      "DENY_WRITE_SET_MALFORMED", `Windows alias ${p}`);
  }
});

test("non-canonical allowed and prohibited bounds fail closed before matching", () => {
  assert.equal(evalWS({
    candidatePaths: ["src/gateway/secret.mjs"],
    allowedPaths: ["src"],
    prohibitedPaths: ["src//gateway"]
  }).code, "DENY_WRITE_SET_MALFORMED");
  assert.equal(evalWS({
    candidatePaths: ["src/control/x.mjs"],
    allowedPaths: ["src/./control"],
    prohibitedPaths: []
  }).code, "DENY_WRITE_SET_MALFORMED");
  assert.equal(evalWS({
    candidatePaths: ["src/control/x.mjs"],
    allowedPaths: ["src\\control"],
    prohibitedPaths: []
  }).code, "DENY_WRITE_SET_MALFORMED");
});

test("DENY_WRITE_SET_PROHIBITED: prohibited match wins over allowed (deny precedence)", () => {
  // src/gateway is both inside allowed (src) and inside prohibited (src/gateway).
  const res = evalWS({
    candidatePaths: ["src/gateway/mcp-gateway-core.mjs"],
    allowedPaths: ["src"],
    prohibitedPaths: ["src/gateway"]
  });
  assert.equal(res.ok, false);
  assert.equal(res.code, "DENY_WRITE_SET_PROHIBITED");
  // Exact-equal prohibited entry (no trailing separator) also denies.
  assert.equal(evalWS({ candidatePaths: ["secrets"], allowedPaths: ["secrets"], prohibitedPaths: ["secrets"] }).code, "DENY_WRITE_SET_PROHIBITED");
});

test("DENY_WRITE_SET_OUTSIDE_ALLOWED: not a subset of any allowed prefix", () => {
  const res = evalWS({ candidatePaths: ["docs/readme.md"], allowedPaths: ["src", "tests"] });
  assert.equal(res.ok, false);
  assert.equal(res.code, "DENY_WRITE_SET_OUTSIDE_ALLOWED");
  // Empty allowed set allows nothing.
  assert.equal(evalWS({ candidatePaths: ["src/a"], allowedPaths: [] }).code, "DENY_WRITE_SET_OUTSIDE_ALLOWED");
});

test("prefix-collision: src/foo must NOT match allowed src/foobar and vice versa", () => {
  assert.equal(evalWS({ candidatePaths: ["src/foobar/x"], allowedPaths: ["src/foo"] }).code, "DENY_WRITE_SET_OUTSIDE_ALLOWED");
  assert.equal(evalWS({ candidatePaths: ["src/foo/x"], allowedPaths: ["src/foobar"] }).code, "DENY_WRITE_SET_OUTSIDE_ALLOWED");
  // The true prefix under the boundary separator is allowed.
  assert.deepEqual(evalWS({ candidatePaths: ["src/foo/x"], allowedPaths: ["src/foo"] }), { ok: true });
  // Exact equality is allowed.
  assert.deepEqual(evalWS({ candidatePaths: ["src/foo"], allowedPaths: ["src/foo"] }), { ok: true });
});

test("trailing-separator edge: trailing slashes on bounds are normalized", () => {
  assert.deepEqual(evalWS({ candidatePaths: ["src/foo/x"], allowedPaths: ["src/foo/"] }), { ok: true });
  assert.deepEqual(evalWS({ candidatePaths: ["src/foo"], allowedPaths: ["src/foo///"] }), { ok: true });
  // Prohibited bound with trailing slash still catches the path.
  assert.equal(evalWS({ candidatePaths: ["src/gen/out.js"], allowedPaths: ["src"], prohibitedPaths: ["src/gen/"] }).code, "DENY_WRITE_SET_PROHIBITED");
});

test("unicode paths are contained by ordinary prefix semantics", () => {
  assert.deepEqual(evalWS({ candidatePaths: ["src/café/naïve.js"], allowedPaths: ["src/café"] }), { ok: true });
  assert.equal(evalWS({ candidatePaths: ["src/cafe/x.js"], allowedPaths: ["src/café"] }).code, "DENY_WRITE_SET_OUTSIDE_ALLOWED");
});

// ---------------------------------------------------------------------------
// Frozen-output guarantee.
// ---------------------------------------------------------------------------

test("outputs are deep-frozen; mutation attempts do not take effect", () => {
  const allow = evalWS({ candidatePaths: ["src/a"], allowedPaths: ["src"] });
  const denyRes = evalWS({ candidatePaths: [], allowedPaths: ["src"] });
  for (const res of [allow, denyRes]) {
    assert.equal(Object.isFrozen(res), true);
    assert.throws(() => { "use strict"; res.ok = "tampered"; }, TypeError);
    assert.throws(() => { "use strict"; res.injected = true; }, TypeError);
  }
  // Post-attempt values are unchanged.
  assert.equal(allow.ok, true);
  assert.equal(denyRes.code, "DENY_WRITE_SET_EMPTY");
  assert.equal(denyRes.injected, undefined);
});

test("WRITE_SET_DENY_CODES is the frozen closed set actually emitted", () => {
  assert.equal(Object.isFrozen(WRITE_SET_DENY_CODES), true);
  assert.deepEqual([...WRITE_SET_DENY_CODES].sort(), [
    "DENY_WRITE_SET_ABSOLUTE",
    "DENY_WRITE_SET_EMPTY",
    "DENY_WRITE_SET_MALFORMED",
    "DENY_WRITE_SET_OUTSIDE_ALLOWED",
    "DENY_WRITE_SET_PROHIBITED",
    "DENY_WRITE_SET_TRAVERSAL"
  ]);
});

// ---------------------------------------------------------------------------
// Config-equivalence parity — the write-set matcher must agree with the live
// `pathSubset` in context-federation-service.mjs (B3). The reference below is
// that function copied VERBATIM from src/services/context-federation-service.mjs:43-48;
// the byte-identity guard test that follows pins the source so this copy cannot
// silently drift from it. (Parity-test style precedent: tests/sod-rules.test.mjs:297.)
// ---------------------------------------------------------------------------

function referencePathSubset(candidate, bound) {
  const hasParent = (v) => v.split(/[\\/]/).includes("..");
  if (candidate.some(hasParent)) return false;
  const bounds = bound.map((p) => p.replace(/\/+$/, ""));
  return candidate.every((p) => bounds.some((e) => p === e || p.startsWith(`${e}/`)));
}

test("config-equivalence: evaluateWriteSet agrees with context-federation pathSubset", () => {
  // Shared fixture table over WELL-FORMED, non-absolute inputs (the domain
  // pathSubset covers): traversal, exact match, subset, prefix-collision,
  // trailing separators, unicode, multi-path. For every row, with an empty
  // prohibited set, evaluateWriteSet(...).ok must equal referencePathSubset(...).
  const table = [
    { candidatePaths: ["src/control/x.mjs"], allowedPaths: ["src/control"] },
    { candidatePaths: ["src/control"], allowedPaths: ["src/control"] },
    { candidatePaths: ["src/foobar/x"], allowedPaths: ["src/foo"] },
    { candidatePaths: ["src/foo/x"], allowedPaths: ["src/foobar"] },
    { candidatePaths: ["src/a", "tests/b"], allowedPaths: ["src", "tests"] },
    { candidatePaths: ["src/a", "docs/b"], allowedPaths: ["src", "tests"] },
    { candidatePaths: ["src/foo/x"], allowedPaths: ["src/foo/"] },
    { candidatePaths: ["src/foo"], allowedPaths: ["src/foo///"] },
    { candidatePaths: ["src/café/x"], allowedPaths: ["src/café"] },
    { candidatePaths: ["src/../secret"], allowedPaths: ["src"] },
    { candidatePaths: ["a\\..\\b"], allowedPaths: ["a"] },
    { candidatePaths: ["docs/readme.md"], allowedPaths: ["src", "tests"] },
    { candidatePaths: ["src/a", "src/b", "src/c"], allowedPaths: ["src"] },
    { candidatePaths: ["src/a"], allowedPaths: [] }
  ];
  let allowRows = 0;
  let denyRows = 0;
  for (const row of table) {
    const oracle = referencePathSubset(row.candidatePaths, row.allowedPaths);
    const actual = evaluateWriteSet({ ...row, prohibitedPaths: [] }).ok;
    assert.equal(actual, oracle, `parity mismatch for ${JSON.stringify(row)}`);
    oracle ? (allowRows += 1) : (denyRows += 1);
  }
  // Guard against a degenerate table that trivially agrees on one polarity.
  assert.ok(allowRows >= 4, `expected several allow rows, got ${allowRows}`);
  assert.ok(denyRows >= 4, `expected several deny rows, got ${denyRows}`);
  assert.equal(allowRows + denyRows, table.length);
});

// ---------------------------------------------------------------------------
// Byte-identity guard — prove zero edits to the existing files this slice read
// but must not modify, by comparing each working-tree blob hash to main @ 71b9d41.
// context-federation-service.mjs is load-bearing here: the parity oracle above
// is a verbatim copy of its pathSubset, so this test is what keeps the copy honest.
// ---------------------------------------------------------------------------

test("byte-identity: files read but not modified are unchanged vs main @ 71b9d41", () => {
  const guarded = [
    "src/services/context-federation-service.mjs",
    "src/control/risk-registry.mjs",
    "tools/validate-foundation.mjs",
    "package.json"
  ];
  for (const rel of guarded) {
    const mainBlob = execFileSync("git", ["rev-parse", `main:${rel}`], { cwd: root, encoding: "utf8" }).trim();
    const worktreeBlob = execFileSync("git", ["hash-object", resolve(root, rel)], { cwd: root, encoding: "utf8" }).trim();
    assert.equal(worktreeBlob, mainBlob, `${rel} blob differs from main`);
  }
  // Sanity: the guarded source actually still contains the pathSubset the parity
  // oracle mirrors, so the guard is protecting the right thing.
  const cfs = readFileSync(resolve(root, "src/services/context-federation-service.mjs"), "utf8");
  assert.ok(cfs.includes("function pathSubset(candidate, bound)"), "pathSubset present in guarded source");
});
