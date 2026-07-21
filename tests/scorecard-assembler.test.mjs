// MOD-OPS Slice S2 — scorecard assembler tests.
//
// Controls in this suite:
//   1. Registry composition: the KPI universe is exactly the S1 catalog (all
//      24, or a scoped group's 6); nothing invented, nothing dropped.
//   2. Missing-measurement semantics: an absent measurement yields a
//      { kpiId, status: "missing" } entry AND a matching finding — never an
//      invented zero (the core S2 principle). Full-catalog-missing covered.
//   3. Every deny path, deny-by-default and ATOMIC: DENY_SCORECARD_MALFORMED
//      (non-object, non-array measurements, malformed entry, non-finite value,
//      duplicate), DENY_KPI_UNKNOWN (uncataloged, out-of-scope, prototype key),
//      DENY_GROUP_UNKNOWN (bad groupId).
//   4. VALUE discipline: only finite numbers accepted; NaN/Infinity/string/
//      bigint/boolean/null/object reject as MALFORMED with detail.
//   5. ATOMIC SNAPSHOT / cross-field TOCTOU regressions (LIVE-S1 rev-002 N1):
//      throwing getters, Proxy traps, invocation-count === 1 per field, and
//      shifty getters (per-read-varying value/kpiId) — proving decisions bind
//      to the first snapshot and no guard/body read split exists.
//   6. Deep-frozen outputs + mutation attempts throw in strict mode.
//   7. Purity guard: the module imports ONLY the KPI registry and references
//      no I/O, clock, or timers.
//   8. Composition guard: nothing computed/aggregated/thresholded — values are
//      carried through verbatim.
//   9. BYTE-IDENTITY guard: every pre-existing file this slice read but must
//      not modify is blob-identical to main @ e4b092d.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SCORECARD_DENY_CODES,
  assembleScorecard
} from "../src/ops/scorecard-assembler.mjs";
import { KPI_CATALOG, KPI_GROUP_ORDER } from "../src/ops/kpi-registry.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE_COMMIT = "e4b092d6016cc331d3adf943be97497debd2c85e"; // main @ e4b092d

// A representative valid KPI id from each group, for readable fixtures.
const PLATFORM_KPI = "platform.mean-recovery-time";
const DELIVERY_KPI = "delivery.defect-escape";

// Build a full measurement set for a set of catalog entries.
const measureAll = (kpis, valueFor = (_, i) => i) =>
  kpis.map((kpi, i) => ({ kpiId: kpi.id, value: valueFor(kpi, i) }));

// ============================================================================
// Registry composition — the universe is the S1 catalog
// ============================================================================

test("full universe: no groupId => one entry per all 24 catalog KPIs, doc order", () => {
  const res = assembleScorecard({ measurements: [] });
  assert.equal(res.ok, true);
  assert.equal(res.scorecard.groupId, null);
  assert.equal(res.scorecard.entries.length, 24);
  assert.deepEqual(
    res.scorecard.entries.map((e) => e.kpiId),
    KPI_CATALOG.map((k) => k.id),
    "entries mirror the catalog exactly, in doc order"
  );
});

test("scoped universe: a groupId restricts the universe to that group's 6 KPIs", () => {
  for (const groupId of KPI_GROUP_ORDER) {
    const res = assembleScorecard({ groupId, measurements: [] });
    assert.equal(res.ok, true, `${groupId} assembles`);
    assert.equal(res.scorecard.groupId, groupId);
    assert.equal(res.scorecard.entries.length, 6, `${groupId} has 6 entries`);
    for (const e of res.scorecard.entries) assert.equal(e.group, groupId);
  }
});

test("entries carry the registry group for segregation", () => {
  const res = assembleScorecard({ measurements: [] });
  for (const e of res.scorecard.entries) {
    const cat = KPI_CATALOG.find((k) => k.id === e.kpiId);
    assert.equal(e.group, cat.group, `${e.kpiId} carries its doctrine group`);
  }
});

// ============================================================================
// Measured / missing semantics — missing is a FINDING, never an invented zero
// ============================================================================

test("measured: a supplied measurement yields status measured + verbatim value", () => {
  const res = assembleScorecard({ measurements: [{ kpiId: PLATFORM_KPI, value: 3.5 }] });
  assert.equal(res.ok, true);
  const entry = res.scorecard.entries.find((e) => e.kpiId === PLATFORM_KPI);
  assert.deepEqual(entry, { kpiId: PLATFORM_KPI, group: "platform", status: "measured", value: 3.5 });
});

test("measured: value is carried verbatim — never computed, aggregated, or thresholded", () => {
  const res = assembleScorecard({
    measurements: [
      { kpiId: PLATFORM_KPI, value: 0 },        // a real zero is preserved as measured
      { kpiId: DELIVERY_KPI, value: -12.75 }    // negatives pass through untouched
    ]
  });
  assert.equal(res.scorecard.entries.find((e) => e.kpiId === PLATFORM_KPI).value, 0);
  assert.equal(res.scorecard.entries.find((e) => e.kpiId === DELIVERY_KPI).value, -12.75);
});

test("missing: an unmeasured KPI is status missing AND a finding — no invented zero", () => {
  const res = assembleScorecard({ measurements: [{ kpiId: PLATFORM_KPI, value: 9 }] });
  const missingEntry = res.scorecard.entries.find((e) => e.kpiId === DELIVERY_KPI);
  assert.deepEqual(missingEntry, { kpiId: DELIVERY_KPI, group: "delivery", status: "missing" });
  assert.equal("value" in missingEntry, false, "no invented value key on a missing entry");
  const finding = res.scorecard.findings.find((f) => f.kpiId === DELIVERY_KPI);
  assert.deepEqual(finding, { kpiId: DELIVERY_KPI, status: "missing" });
});

test("missing: empty measurements => every catalog KPI is a missing finding", () => {
  const res = assembleScorecard({ measurements: [] });
  assert.equal(res.scorecard.findings.length, 24);
  assert.deepEqual(
    res.scorecard.findings.map((f) => f.kpiId),
    KPI_CATALOG.map((k) => k.id)
  );
  for (const f of res.scorecard.findings) assert.equal(f.status, "missing");
  for (const e of res.scorecard.entries) assert.equal(e.status, "missing");
});

test("findings: full measurement set => zero findings", () => {
  const res = assembleScorecard({ measurements: measureAll(KPI_CATALOG) });
  assert.equal(res.ok, true);
  assert.equal(res.scorecard.findings.length, 0);
  assert.equal(res.scorecard.entries.filter((e) => e.status === "measured").length, 24);
});

test("scoped findings: a group's missing KPIs are limited to that group", () => {
  const platform = KPI_CATALOG.filter((k) => k.group === "platform");
  const res = assembleScorecard({
    groupId: "platform",
    measurements: [{ kpiId: platform[0].id, value: 1 }]
  });
  assert.equal(res.scorecard.findings.length, 5, "6 platform KPIs, 1 measured");
  for (const f of res.scorecard.findings) {
    assert.equal(KPI_CATALOG.find((k) => k.id === f.kpiId).group, "platform");
  }
});

test("result carries data_untrusted: true (measurements are caller-side data)", () => {
  const res = assembleScorecard({ measurements: [] });
  assert.equal(res.data_untrusted, true);
});

// ============================================================================
// Deny codes — closed set
// ============================================================================

test("deny codes: the closed set is exactly the three published codes", () => {
  assert.deepEqual([...SCORECARD_DENY_CODES], [
    "DENY_SCORECARD_MALFORMED",
    "DENY_KPI_UNKNOWN",
    "DENY_GROUP_UNKNOWN"
  ]);
  assert.ok(Object.isFrozen(SCORECARD_DENY_CODES));
});

// ============================================================================
// DENY_SCORECARD_MALFORMED — deny-by-default on structural defects
// ============================================================================

test("malformed: non-object / missing-or-non-array measurements", () => {
  const bad = [
    undefined,
    null,
    42,
    "nope",
    {},                              // measurements absent
    { measurements: undefined },
    { measurements: null },
    { measurements: "not-an-array" },
    { measurements: 7 },
    { measurements: { length: 1 } }  // array-like is not an array
  ];
  for (const input of bad) {
    const res = assembleScorecard(input);
    assert.equal(res.ok, false, `${JSON.stringify(input)} denied`);
    assert.equal(res.code, "DENY_SCORECARD_MALFORMED");
    assert.equal(typeof res.message, "string");
  }
});

test("malformed: a measurement entry that is not a non-array object", () => {
  for (const bad of [null, undefined, 5, "x", true, ["arr"]]) {
    const res = assembleScorecard({ measurements: [{ kpiId: PLATFORM_KPI, value: 1 }, bad] });
    assert.equal(res.ok, false, `entry ${JSON.stringify(bad)} denied`);
    assert.equal(res.code, "DENY_SCORECARD_MALFORMED");
    assert.match(res.message, /measurements\[1\]/);
  }
});

test("malformed: kpiId that is not a non-blank null-byte-free string", () => {
  for (const kpiId of [undefined, null, 42, "", "   ", `${PLATFORM_KPI}\0`, ["arr"], { toString: () => PLATFORM_KPI }]) {
    const res = assembleScorecard({ measurements: [{ kpiId, value: 1 }] });
    assert.equal(res.ok, false, `kpiId ${JSON.stringify(kpiId)} denied`);
    assert.equal(res.code, "DENY_SCORECARD_MALFORMED");
  }
});

test("value discipline: only finite numbers accepted; everything else MALFORMED", () => {
  const bad = [
    NaN, Infinity, -Infinity,        // non-finite numbers
    "5", "  ", "",                   // strings, incl numeric-looking
    10n,                             // bigint
    true, false,                     // boolean
    null, undefined,                 // absent
    {}, [], () => 1                  // object / array / function
  ];
  for (const value of bad) {
    const res = assembleScorecard({ measurements: [{ kpiId: PLATFORM_KPI, value }] });
    assert.equal(res.ok, false, `value ${String(value)} denied`);
    assert.equal(res.code, "DENY_SCORECARD_MALFORMED");
    assert.match(res.message, /value/);
  }
});

test("malformed: duplicate measurement for the same KPI id denies atomically", () => {
  const res = assembleScorecard({
    measurements: [
      { kpiId: PLATFORM_KPI, value: 1 },
      { kpiId: PLATFORM_KPI, value: 2 }
    ]
  });
  assert.equal(res.ok, false);
  assert.equal(res.code, "DENY_SCORECARD_MALFORMED");
  assert.match(res.message, /duplicate/);
});

// ============================================================================
// DENY_KPI_UNKNOWN — uncataloged, out-of-scope, prototype keys
// ============================================================================

test("unknown: an uncataloged kpiId denies, never guesses", () => {
  for (const kpiId of ["platform.does-not-exist", "finops.spend", "mean recovery time", "platform"]) {
    const res = assembleScorecard({ measurements: [{ kpiId, value: 1 }] });
    assert.equal(res.ok, false, `"${kpiId}" denied`);
    assert.equal(res.code, "DENY_KPI_UNKNOWN");
  }
});

test("unknown: prototype keys deny as UNKNOWN (registry N1 parity)", () => {
  for (const kpiId of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
    const res = assembleScorecard({ measurements: [{ kpiId, value: 1 }] });
    assert.equal(res.ok, false, `"${kpiId}" denied`);
    assert.equal(res.code, "DENY_KPI_UNKNOWN", `"${kpiId}" is an own-property miss`);
  }
});

test("unknown: a cataloged KPI outside the requested group is out-of-universe => UNKNOWN", () => {
  // DELIVERY_KPI is a real catalog id, but not in the platform group scope.
  const res = assembleScorecard({ groupId: "platform", measurements: [{ kpiId: DELIVERY_KPI, value: 1 }] });
  assert.equal(res.ok, false);
  assert.equal(res.code, "DENY_KPI_UNKNOWN");
});

// ============================================================================
// DENY_GROUP_UNKNOWN — delegated to the registry
// ============================================================================

test("group: a supplied non-doctrine groupId denies", () => {
  for (const groupId of [null, 7, "", "Platform", "platform ", "finops", "toString", "__proto__"]) {
    const res = assembleScorecard({ groupId, measurements: [] });
    assert.equal(res.ok, false, `groupId ${JSON.stringify(groupId)} denied`);
    assert.equal(res.code, "DENY_GROUP_UNKNOWN");
  }
});

test("group: only an absent (undefined) groupId selects the full universe", () => {
  assert.equal(assembleScorecard({ groupId: undefined, measurements: [] }).ok, true);
  assert.equal(assembleScorecard({ measurements: [] }).scorecard.groupId, null);
});

// ============================================================================
// ATOMIC SNAPSHOT / cross-field TOCTOU regressions (LIVE-S1 rev-002 N1)
// ============================================================================

test("fail-closed: a throwing kpiId getter => MALFORMED, never throws", () => {
  const hostile = { value: 1 };
  Object.defineProperty(hostile, "kpiId", { enumerable: true, get() { throw new Error("boom"); } });
  let res;
  assert.doesNotThrow(() => { res = assembleScorecard({ measurements: [hostile] }); });
  assert.equal(res.code, "DENY_SCORECARD_MALFORMED");
});

test("fail-closed: a throwing value getter => MALFORMED, never throws", () => {
  const hostile = { kpiId: PLATFORM_KPI };
  Object.defineProperty(hostile, "value", { enumerable: true, get() { throw new Error("boom"); } });
  let res;
  assert.doesNotThrow(() => { res = assembleScorecard({ measurements: [hostile] }); });
  assert.equal(res.code, "DENY_SCORECARD_MALFORMED");
});

test("fail-closed: a Proxy input with a throwing get trap => MALFORMED", () => {
  const throwing = new Proxy({}, { get() { throw new Error("trap"); } });
  let res;
  assert.doesNotThrow(() => { res = assembleScorecard(throwing); });
  assert.equal(res.code, "DENY_SCORECARD_MALFORMED");
});

test("fail-closed: a Proxy measurement with a throwing get trap => MALFORMED", () => {
  const throwing = new Proxy({}, { get() { throw new Error("trap"); } });
  let res;
  assert.doesNotThrow(() => { res = assembleScorecard({ measurements: [throwing] }); });
  assert.equal(res.code, "DENY_SCORECARD_MALFORMED");
});

test("single-read: measurements is read EXACTLY ONCE (no re-read to poison)", () => {
  let reads = 0;
  const input = {};
  Object.defineProperty(input, "measurements", {
    enumerable: true,
    get() { reads += 1; return [{ kpiId: PLATFORM_KPI, value: 1 }]; }
  });
  const res = assembleScorecard(input);
  assert.equal(res.ok, true);
  assert.equal(reads, 1, "measurements read exactly once");
});

test("single-read: a measurement's kpiId and value getters are each invoked EXACTLY ONCE", () => {
  let kpiReads = 0;
  let valueReads = 0;
  const probe = {};
  Object.defineProperty(probe, "kpiId", { enumerable: true, get() { kpiReads += 1; return PLATFORM_KPI; } });
  Object.defineProperty(probe, "value", { enumerable: true, get() { valueReads += 1; return 4; } });
  const res = assembleScorecard({ measurements: [probe] });
  assert.equal(res.ok, true);
  assert.equal(kpiReads, 1, "kpiId read exactly once");
  assert.equal(valueReads, 1, "value read exactly once");
});

test("cross-field TOCTOU: a shifty value getter cannot split the finite-check from the stored value", () => {
  // If the assembler read `value` twice (once for the finite guard, once to
  // store), this getter would pass the guard with 4 then store NaN. A single
  // snapshot binds guard AND body to the first read.
  let reads = 0;
  const shifty = { kpiId: PLATFORM_KPI };
  Object.defineProperty(shifty, "value", {
    enumerable: true,
    get() { reads += 1; return reads === 1 ? 4 : NaN; }
  });
  const res = assembleScorecard({ measurements: [shifty] });
  assert.equal(reads, 1, "no second read exists to poison");
  assert.equal(res.ok, true);
  assert.equal(res.scorecard.entries.find((e) => e.kpiId === PLATFORM_KPI).value, 4, "decision bound to first snapshot");
});

test("cross-field TOCTOU: a shifty kpiId getter cannot split the universe-check from the stored id", () => {
  let reads = 0;
  const shifty = { value: 7 };
  Object.defineProperty(shifty, "kpiId", {
    enumerable: true,
    get() { reads += 1; return reads === 1 ? PLATFORM_KPI : "attacker.bogus"; }
  });
  const res = assembleScorecard({ measurements: [shifty] });
  assert.equal(reads, 1, "no second read exists to poison");
  assert.equal(res.ok, true);
  assert.equal(res.scorecard.entries.find((e) => e.status === "measured").kpiId, PLATFORM_KPI);
});

test("cross-field TOCTOU: a kpiId getter side-effecting its sibling value is bound to the first snapshot", () => {
  // The kpiId getter mutates the measurement's own `value` after being read.
  // Because both fields are captured in one snapshot before any evaluation,
  // the post-read mutation changes nothing about the decision.
  const m = { value: 11 };
  Object.defineProperty(m, "kpiId", {
    enumerable: true,
    get() { m.value = Infinity; return PLATFORM_KPI; }
  });
  // value is snapshotted AFTER kpiId, so this proves single-read + containment
  // does not re-consult `value` during evaluation: whichever value the single
  // read captured is what the decision uses, and no throw/leak occurs.
  let res;
  assert.doesNotThrow(() => { res = assembleScorecard({ measurements: [m] }); });
  // Deterministic outcome: kpiId read once (sets value=Infinity), then value
  // read once (Infinity) => non-finite => MALFORMED. No partial assembly, no
  // throw — the decision is a clean contained denial bound to the snapshot.
  assert.equal(res.ok, false);
  assert.equal(res.code, "DENY_SCORECARD_MALFORMED");
});

// ============================================================================
// Deep-frozen outputs + immutability
// ============================================================================

test("frozen: a success result is deeply frozen (result, scorecard, entries, findings)", () => {
  const res = assembleScorecard({ measurements: [{ kpiId: PLATFORM_KPI, value: 1 }] });
  assert.ok(Object.isFrozen(res));
  assert.ok(Object.isFrozen(res.scorecard));
  assert.ok(Object.isFrozen(res.scorecard.entries));
  assert.ok(Object.isFrozen(res.scorecard.findings));
  for (const e of res.scorecard.entries) assert.ok(Object.isFrozen(e));
  for (const f of res.scorecard.findings) assert.ok(Object.isFrozen(f));
});

test("frozen: a denial result is deeply frozen", () => {
  assert.ok(Object.isFrozen(assembleScorecard(null)));
  assert.ok(Object.isFrozen(assembleScorecard({ groupId: "nope", measurements: [] })));
  assert.ok(Object.isFrozen(assembleScorecard({ measurements: [{ kpiId: "x.y", value: 1 }] })));
});

test("frozen: mutation attempts throw in strict mode and change nothing", () => {
  const res = assembleScorecard({ measurements: [{ kpiId: PLATFORM_KPI, value: 1 }] });
  assert.throws(() => { res.ok = false; }, TypeError);
  assert.throws(() => { res.scorecard.entries.push({}); }, TypeError);
  assert.throws(() => { res.scorecard.findings.pop(); }, TypeError);
  assert.throws(() => { res.scorecard.entries[0].value = 999; }, TypeError);
  const denied = assembleScorecard(null);
  assert.throws(() => { denied.code = "ALLOW"; }, TypeError);
});

test("isolation: the assembler never mutates the caller's measurements array or entries", () => {
  const measurements = [{ kpiId: PLATFORM_KPI, value: 1 }];
  const before = JSON.stringify(measurements);
  assembleScorecard({ measurements });
  assert.equal(JSON.stringify(measurements), before, "caller array untouched");
});

// ============================================================================
// Purity + composition guards
// ============================================================================

test("purity: module imports ONLY the KPI registry, references no I/O/clock/timers", () => {
  const source = readFileSync(resolve(root, "src/ops/scorecard-assembler.mjs"), "utf8");
  const imports = [...source.matchAll(/^\s*import\s.+from\s+["']([^"']+)["'];?\s*$/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ["./kpi-registry.mjs"], "only the S1 registry is imported");
  assert.equal(/require\s*\(/.test(source), false, "no require calls");
  for (const forbidden of ["node:fs", "node:child_process", "fetch(", "Date.now", "new Date", "setTimeout", "setInterval", "process."]) {
    assert.equal(source.includes(forbidden), false, `no ${forbidden}`);
  }
});

test("composition: nothing is aggregated — N measured values produce N verbatim entries", () => {
  const measurements = [
    { kpiId: PLATFORM_KPI, value: 2 },
    { kpiId: DELIVERY_KPI, value: 3 }
  ];
  const res = assembleScorecard({ measurements });
  const measured = res.scorecard.entries.filter((e) => e.status === "measured");
  assert.equal(measured.length, 2, "no rollup collapses the two");
  assert.deepEqual(measured.map((e) => e.value).sort(), [2, 3], "values verbatim, not summed/averaged");
  // No aggregate/threshold/rating keys leak onto the scorecard.
  assert.deepEqual(Object.keys(res.scorecard).sort(), ["entries", "findings", "groupId"]);
});

// ============================================================================
// Byte-identity guard — zero edits to every pre-existing file this slice read.
// (MANIFEST.json excluded: intentionally appended-to by this slice.)
// ============================================================================

test(`byte-identity: files read but not modified are unchanged vs main @ ${BASE_COMMIT.slice(0, 7)}`, () => {
  const guarded = [
    "src/ops/kpi-registry.mjs",                       // composed read-only (parity pin)
    "docs/17-operations/02-kpis-and-scorecards.md",   // KPI doctrine source consulted
    "package.json"                                    // scripts consulted
  ];
  for (const rel of guarded) {
    const baseBlob = execFileSync("git", ["rev-parse", `${BASE_COMMIT}:${rel}`], { cwd: root, encoding: "utf8" }).trim();
    const worktreeBlob = execFileSync("git", ["hash-object", resolve(root, rel)], { cwd: root, encoding: "utf8" }).trim();
    assert.equal(worktreeBlob, baseBlob, `${rel} blob differs from base`);
  }
  // tools/validate-foundation.mjs was authorized-modified by MOD-WSPACE-S3 (G6
  // workspace-lease schema registration, 16->17 schemas), so it is no longer
  // blob-identical to the base commit. Pin it to its post-S3 blob so any
  // UNAUTHORIZED further drift of the validator still fails this guard.
  assert.equal(
    execFileSync("git", ["hash-object", resolve(root, "tools/validate-foundation.mjs")], { cwd: root, encoding: "utf8" }).trim(),
    "d0ba1e920f295b7522cb7561c2f9e3bfda2093ce",
    "validate-foundation.mjs pinned to its post-MOD-WSPACE-S3 blob"
  );
});
