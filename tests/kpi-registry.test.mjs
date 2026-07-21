// MOD-OPS Slice S1 — KPI catalog registry tests.
//
// Controls in this suite:
//   1. DOC-PARITY fixture: parses docs/17-operations/02-kpis-and-scorecards.md
//      at test runtime and asserts a 1:1 match (group headings, KPI names,
//      order, counts) against the codified catalog, PLUS an independent
//      derivation of every stable id from the doc text — so doc/code drift on
//      either names or the id scheme fails the suite.
//   2. Positive lookups across all four groups and all 24 KPIs.
//   3. Every deny path, deny-by-default (malformed vs unknown distinct for
//      KPI ids; every group failure path -> DENY_GROUP_UNKNOWN).
//   4. FAIL-CLOSED EXTRACTION regressions (WSPACE-S1 house lesson): throwing
//      getters, Proxy traps, invocation-count === 1 probes, getter that
//      changes its answer between reads.
//   5. Deep-frozen outputs + mutation attempts throw in strict mode.
//   6. Purity guard: the module imports nothing and references no I/O/clock.
//   7. BYTE-IDENTITY guard: every pre-existing file this slice read but must
//      not modify is blob-identical to main @ a7d82b5.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  KPI_DENY_CODES,
  KPI_GROUP_ORDER,
  KPI_GROUPS,
  KPI_CATALOG,
  getKpi,
  listKpisByGroup,
  listGroups
} from "../src/ops/kpi-registry.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE_COMMIT = "a7d82b58313eceb9545b6245fce8bb4354f5ad3c"; // main @ a7d82b5

const DOC_REL = "docs/17-operations/02-kpis-and-scorecards.md";

// --- Doctrine-doc harness ----------------------------------------------------
// Parse the KPI doc's `## <Group>` headings and `- <name>;` bullets, in order.
// Trailing ";" / "." bullet punctuation is list grammar, not part of the name.
function parseKpiDoc(markdown) {
  const groups = [];
  let current = null;
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = line.match(/^## (.+)$/);
    if (heading) {
      current = { heading: heading[1].trim(), names: [] };
      groups.push(current);
      continue;
    }
    const bullet = line.match(/^- (.+?)[;.]?$/);
    if (bullet && current) current.names.push(bullet[1].trim());
  }
  return groups;
}

// Independent stable-id derivation (mirrors the scheme the module documents):
// lowercase, every non-alphanumeric run -> single hyphen, trimmed.
function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const docGroups = parseKpiDoc(readFileSync(resolve(root, DOC_REL), "utf8"));

// ============================================================================
// DOC-PARITY (the S1 control)
// ============================================================================

test("doc-parity: four group headings match the doc verbatim, in doc order", () => {
  assert.equal(docGroups.length, KPI_GROUP_ORDER.length, "doc group count");
  const codeNames = KPI_GROUP_ORDER.map((id) => KPI_GROUPS[id].name);
  assert.deepEqual(docGroups.map((g) => g.heading), codeNames, "headings verbatim + ordered");
});

test("doc-parity: every group's KPI names match the doc bullets verbatim, in doc order", () => {
  for (let i = 0; i < KPI_GROUP_ORDER.length; i += 1) {
    const groupId = KPI_GROUP_ORDER[i];
    const res = listKpisByGroup({ groupId });
    assert.equal(res.ok, true, `${groupId} listable`);
    assert.deepEqual(
      res.kpis.map((k) => k.name),
      docGroups[i].names,
      `${groupId} names verbatim + ordered vs doc`
    );
  }
});

test("doc-parity: catalog is exactly the 24 doctrine KPIs (6 per group)", () => {
  assert.equal(KPI_CATALOG.length, 24, "24 KPIs total");
  const docTotal = docGroups.reduce((n, g) => n + g.names.length, 0);
  assert.equal(docTotal, 24, "doc names 24 KPIs");
  for (const g of docGroups) assert.equal(g.names.length, 6, `${g.heading} has 6 KPIs`);
  for (const groupId of KPI_GROUP_ORDER) {
    assert.equal(listKpisByGroup({ groupId }).kpis.length, 6, `${groupId} has 6 KPIs`);
  }
  // No duplicate ids or names.
  assert.equal(new Set(KPI_CATALOG.map((k) => k.id)).size, 24, "ids unique");
  assert.equal(new Set(KPI_CATALOG.map((k) => k.name)).size, 24, "names unique");
});

test("doc-parity: every stable id derives from the doc text (group-slug.kpi-slug)", () => {
  let i = 0;
  for (const docGroup of docGroups) {
    const expectedGroupId = slug(docGroup.heading);
    assert.equal(KPI_GROUP_ORDER.includes(expectedGroupId), true, `group id ${expectedGroupId} cataloged`);
    for (const name of docGroup.names) {
      const kpi = KPI_CATALOG[i];
      assert.equal(kpi.group, expectedGroupId, `#${i} group id derives from heading`);
      assert.equal(kpi.id, `${expectedGroupId}.${slug(name)}`, `#${i} id derives from doc name`);
      i += 1;
    }
  }
  assert.equal(i, 24, "derivation covered all 24");
});

// ============================================================================
// Positive lookups
// ============================================================================

test("getKpi: resolves all 24 cataloged ids across all four groups", () => {
  for (const kpi of KPI_CATALOG) {
    const res = getKpi({ kpiId: kpi.id });
    assert.equal(res.ok, true, `${kpi.id} resolves`);
    assert.equal(res.kpi, kpi, `${kpi.id} returns the catalog entry`);
    assert.deepEqual(
      { id: res.kpi.id, group: res.kpi.group, name: res.kpi.name },
      { id: kpi.id, group: kpi.group, name: kpi.name }
    );
  }
});

test("listKpisByGroup: returns group entry plus doc-ordered KPI list", () => {
  const res = listKpisByGroup({ groupId: "platform" });
  assert.equal(res.ok, true);
  assert.deepEqual(res.group, { id: "platform", name: "Platform" });
  assert.equal(res.kpis[0].id, "platform.governed-session-completion-rate");
  assert.equal(res.kpis[5].id, "platform.outcome-realization-rate");
});

test("listGroups: returns the four doctrine groups in doc order", () => {
  const res = listGroups();
  assert.equal(res.ok, true);
  assert.deepEqual(
    res.groups.map((g) => g.id),
    ["platform", "delivery", "agents-and-harnesses", "learning-and-skills"]
  );
  assert.deepEqual(
    res.groups.map((g) => g.name),
    ["Platform", "Delivery", "Agents and harnesses", "Learning and skills"]
  );
});

// ============================================================================
// Deny paths (deny-by-default)
// ============================================================================

test("deny codes: the closed set is exactly the three published codes", () => {
  assert.deepEqual([...KPI_DENY_CODES], [
    "DENY_KPI_ID_MALFORMED",
    "DENY_KPI_UNKNOWN",
    "DENY_GROUP_UNKNOWN"
  ]);
  assert.ok(Object.isFrozen(KPI_DENY_CODES));
});

test("getKpi: malformed inputs -> DENY_KPI_ID_MALFORMED", () => {
  const malformed = [
    undefined,               // no input at all
    null,                    // null input
    {},                      // kpiId absent
    { kpiId: undefined },
    { kpiId: null },
    { kpiId: 42 },           // non-string
    { kpiId: ["platform.mean-recovery-time"] }, // array smuggle
    { kpiId: { toString: () => "platform.mean-recovery-time" } }, // object smuggle
    { kpiId: "" },           // empty
    { kpiId: "   " },        // blank
    { kpiId: "platform.mean-recovery-time\0" } // null byte
  ];
  for (const input of malformed) {
    const res = getKpi(input);
    assert.equal(res.ok, false, `${JSON.stringify(input)} denied`);
    assert.equal(res.code, "DENY_KPI_ID_MALFORMED");
    assert.equal(typeof res.message, "string");
  }
});

test("getKpi: well-formed but uncataloged ids -> DENY_KPI_UNKNOWN, never guesses", () => {
  const unknown = [
    "platform.mean-recovery-time-2",     // near miss
    "platform.Mean-Recovery-Time",       // case variant is NOT coerced
    "mean recovery time",                // doctrine name is not an id
    "mean-recovery-time",                // group-less slug is not an id
    "platform",                          // a group id is not a KPI id
    "finops.spend",                      // group outside doctrine
    "toString",                          // prototype key never resolves
    "constructor",
    "__proto__",
    "hasOwnProperty"
  ];
  for (const kpiId of unknown) {
    const res = getKpi({ kpiId });
    assert.equal(res.ok, false, `"${kpiId}" denied`);
    assert.equal(res.code, "DENY_KPI_UNKNOWN", `"${kpiId}" unknown, not resolved`);
  }
});

test("listKpisByGroup: every failure path -> DENY_GROUP_UNKNOWN", () => {
  const bad = [
    undefined,
    null,
    {},
    { groupId: undefined },
    { groupId: 7 },
    { groupId: "" },
    { groupId: "Platform" },             // heading text is not the group id
    { groupId: "platform " },            // no trimming/coercion
    { groupId: "finops" },
    { groupId: "toString" },             // prototype key never resolves
    { groupId: "__proto__" }
  ];
  for (const input of bad) {
    const res = listKpisByGroup(input);
    assert.equal(res.ok, false, `${JSON.stringify(input)} denied`);
    assert.equal(res.code, "DENY_GROUP_UNKNOWN");
  }
});

// ============================================================================
// FAIL-CLOSED EXTRACTION (accessor-attack regressions)
// ============================================================================

test("fail-closed: throwing kpiId getter -> MALFORMED, never throws", () => {
  const hostile = {};
  Object.defineProperty(hostile, "kpiId", {
    enumerable: true,
    get() { throw new Error("getter boom"); }
  });
  let res;
  assert.doesNotThrow(() => { res = getKpi(hostile); });
  assert.deepEqual({ ok: res.ok, code: res.code }, { ok: false, code: "DENY_KPI_ID_MALFORMED" });
});

test("fail-closed: Proxy input with throwing get trap -> contained denials on both lookups", () => {
  const throwingHandler = { get() { throw new Error("trap boom"); } };
  let kpiRes;
  assert.doesNotThrow(() => { kpiRes = getKpi(new Proxy({}, throwingHandler)); });
  assert.equal(kpiRes.code, "DENY_KPI_ID_MALFORMED");
  let groupRes;
  assert.doesNotThrow(() => { groupRes = listKpisByGroup(new Proxy({}, throwingHandler)); });
  assert.equal(groupRes.code, "DENY_GROUP_UNKNOWN");
});

test("fail-closed: throwing groupId getter -> DENY_GROUP_UNKNOWN, never throws", () => {
  const hostile = {};
  Object.defineProperty(hostile, "groupId", {
    enumerable: true,
    get() { throw new Error("getter boom"); }
  });
  let res;
  assert.doesNotThrow(() => { res = listKpisByGroup(hostile); });
  assert.deepEqual({ ok: res.ok, code: res.code }, { ok: false, code: "DENY_GROUP_UNKNOWN" });
});

test("single-read: kpiId getter is invoked EXACTLY ONCE", () => {
  let reads = 0;
  const probe = {};
  Object.defineProperty(probe, "kpiId", {
    enumerable: true,
    get() { reads += 1; return "delivery.integration-queue-time"; }
  });
  const res = getKpi(probe);
  assert.equal(res.ok, true);
  assert.equal(reads, 1, "kpiId read exactly once");
});

test("single-read: groupId getter is invoked EXACTLY ONCE", () => {
  let reads = 0;
  const probe = {};
  Object.defineProperty(probe, "groupId", {
    enumerable: true,
    get() { reads += 1; return "learning-and-skills"; }
  });
  const res = listKpisByGroup(probe);
  assert.equal(res.ok, true);
  assert.equal(reads, 1, "groupId read exactly once");
});

test("single-read: a getter answering differently per read cannot split guard and body", () => {
  let reads = 0;
  const shifty = {};
  Object.defineProperty(shifty, "kpiId", {
    enumerable: true,
    get() {
      reads += 1;
      return reads === 1 ? "platform.mean-recovery-time" : "attacker.bogus-kpi";
    }
  });
  const res = getKpi(shifty);
  assert.equal(reads, 1, "no second read exists to poison");
  assert.equal(res.ok, true);
  assert.equal(res.kpi.id, "platform.mean-recovery-time", "decision bound to the single snapshot");
});

// ============================================================================
// Deep-frozen outputs + immutability
// ============================================================================

test("frozen: catalog, groups, and all entries are deeply frozen", () => {
  assert.ok(Object.isFrozen(KPI_CATALOG));
  assert.ok(Object.isFrozen(KPI_GROUP_ORDER));
  assert.ok(Object.isFrozen(KPI_GROUPS));
  for (const kpi of KPI_CATALOG) assert.ok(Object.isFrozen(kpi), `${kpi.id} frozen`);
  for (const id of KPI_GROUP_ORDER) assert.ok(Object.isFrozen(KPI_GROUPS[id]), `${id} group frozen`);
});

test("frozen: every lookup result is deeply frozen (success and denial)", () => {
  const ok = getKpi({ kpiId: "platform.mean-recovery-time" });
  assert.ok(Object.isFrozen(ok));
  assert.ok(Object.isFrozen(ok.kpi));
  const groupOk = listKpisByGroup({ groupId: "delivery" });
  assert.ok(Object.isFrozen(groupOk));
  assert.ok(Object.isFrozen(groupOk.group));
  assert.ok(Object.isFrozen(groupOk.kpis));
  for (const kpi of groupOk.kpis) assert.ok(Object.isFrozen(kpi));
  const groupsOk = listGroups();
  assert.ok(Object.isFrozen(groupsOk));
  assert.ok(Object.isFrozen(groupsOk.groups));
  const denied = getKpi({ kpiId: "nope.nope" });
  assert.ok(Object.isFrozen(denied));
  assert.ok(Object.isFrozen(listKpisByGroup({ groupId: "nope" })));
});

test("frozen: mutation attempts throw in strict mode and change nothing", () => {
  const res = getKpi({ kpiId: "platform.mean-recovery-time" });
  assert.throws(() => { res.ok = false; }, TypeError);
  assert.throws(() => { res.kpi.name = "hacked"; }, TypeError);
  assert.throws(() => { KPI_CATALOG.push({ id: "x", group: "platform", name: "x" }); }, TypeError);
  assert.throws(() => { KPI_GROUPS.platform.name = "hacked"; }, TypeError);
  const groupRes = listKpisByGroup({ groupId: "platform" });
  assert.throws(() => { groupRes.kpis.push("smuggled"); }, TypeError);
  assert.throws(() => { listGroups().groups.pop(); }, TypeError);
  const denied = getKpi({ kpiId: "nope.nope" });
  assert.throws(() => { denied.code = "ALLOW"; }, TypeError);
  // Registry state unchanged after all attempts.
  assert.equal(KPI_CATALOG.length, 24);
  assert.equal(getKpi({ kpiId: "platform.mean-recovery-time" }).kpi.name, "mean recovery time");
});

// ============================================================================
// Purity guard — catalog only, nothing imported, no I/O/clock/wiring
// ============================================================================

test("purity: module imports nothing and references no I/O, clock, or timers", () => {
  const source = readFileSync(resolve(root, "src/ops/kpi-registry.mjs"), "utf8");
  assert.equal(/^\s*import\s/m.test(source), false, "no import statements");
  assert.equal(/require\s*\(/.test(source), false, "no require calls");
  for (const forbidden of ["node:fs", "node:child_process", "fetch(", "Date.now", "new Date", "setTimeout", "setInterval", "process."]) {
    assert.equal(source.includes(forbidden), false, `no ${forbidden}`);
  }
});

test("purity: the registry's only sanctioned importer is the S2 scorecard-assembler (otherwise unwired)", () => {
  // GOVERNED GUARD WIDENING — mod-ops-s2-scorecard-rework-001.
  //
  // At S1 this guard asserted the registry had ZERO importers across src/ and
  // tools/ (an empty set). That premise was correct AT S1. It is now superseded
  // by exactly ONE authorized consumer: S2's scorecard-assembler. Per the OPS
  // gap assessment (bst/mod-ops-assessment:mod-ops-gap-assessment-001, §4
  // sequencing), S2 *composes over* S1 — the assembler reads the KPI vocabulary
  // from the registry — and that inter-slice dependency is the single sanctioned
  // importer. So `src/ops/scorecard-assembler.mjs` is allowed; nothing else is.
  //
  // This assertion is STRICTLY MORE PRECISE than the old zero-importer check,
  // not weaker: it still fails LOUDLY on ANY unsanctioned importer, and the
  // registry itself (kpi-registry.mjs) must still stay unwired to every live /
  // gateway / report path (adoption of the assembler is later, separately
  // governed work — assessment §5 #4).
  //
  // Detection note (rework finding): the assembler's real dependency is the
  // ESM import on scorecard-assembler.mjs — `import { ... } from
  // "./kpi-registry.mjs"` — a RELATIVE path with no "ops/" segment. The old
  // guard grepped the substring "ops/kpi-registry", which matched only the
  // module's header COMMENT, never that import line. Removing the comment would
  // therefore have "passed" the old guard while the file still genuinely
  // imported the registry — a false fix. This guard instead enumerates on the
  // module BASENAME `kpi-registry`, which catches any real import form
  // (./kpi-registry.mjs, ../ops/kpi-registry.mjs, src/ops/kpi-registry.mjs)
  // regardless of importer location, then asserts the importer set is a subset
  // of the single sanctioned consumer.
  const SANCTIONED = ["src/ops/scorecard-assembler.mjs"];
  let hits = [];
  try {
    hits = execFileSync(
      "git", ["grep", "-l", "kpi-registry", "--", "src", "tools"],
      { cwd: root, encoding: "utf8" }
    ).trim().split(/\r?\n/).filter(Boolean);
  } catch (err) {
    if (err.status !== 1) throw err; // git grep exits 1 on zero matches
    hits = [];
  }
  // A module is not an "importer" of itself; drop the registry's own file(s).
  const importers = hits
    .map((p) => p.replace(/\\/g, "/"))
    .filter((p) => p !== "src/ops/kpi-registry.mjs");
  // Every importer must be sanctioned — any OTHER file fails loudly here.
  const unsanctioned = importers.filter((p) => !SANCTIONED.includes(p));
  assert.deepEqual(
    unsanctioned,
    [],
    `unsanctioned src/ or tools/ file imports the registry: ${JSON.stringify(unsanctioned)}`
  );
  // And the sanctioned consumer's dependency must be a REAL import statement,
  // not a stray textual mention — so the guard tracks an actual wiring edge and
  // cannot be satisfied by a comment alone.
  const assemblerSrc = readFileSync(resolve(root, "src/ops/scorecard-assembler.mjs"), "utf8");
  assert.match(
    assemblerSrc,
    /import\s+[^;]*from\s+["'][^"']*kpi-registry\.mjs["']/,
    "the sanctioned consumer must actually import the registry module"
  );
});

// ============================================================================
// Byte-identity guard — zero edits to every pre-existing file this slice read.
// (MANIFEST.json excluded: intentionally appended-to by this slice.)
// ============================================================================

test(`byte-identity: files read but not modified are unchanged vs main @ ${BASE_COMMIT.slice(0, 7)}`, () => {
  const guarded = [
    DOC_REL,                              // doctrine source of the catalog
    "src/control/risk-registry.mjs",      // house registry pattern consulted
    "tests/risk-registry.test.mjs",       // doc-parity test pattern consulted
    "package.json"                        // scripts consulted
  ];
  for (const rel of guarded) {
    const baseBlob = execFileSync("git", ["rev-parse", `${BASE_COMMIT}:${rel}`], { cwd: root, encoding: "utf8" }).trim();
    const worktreeBlob = execFileSync("git", ["hash-object", resolve(root, rel)], { cwd: root, encoding: "utf8" }).trim();
    assert.equal(worktreeBlob, baseBlob, `${rel} blob differs from base`);
  }
  // tools/validate-foundation.mjs was authorized-modified by MOD-WSPACE-S3 (G6
  // workspace-lease schema registration, 16->17 schemas), then again by
  // MOD-MEM S2 (memory-record schema registration, 17->18 schemas), so it is
  // no longer blob-identical to the base commit. Pin it to its post-MOD-MEM-S2
  // blob so any UNAUTHORIZED further drift of the validator still fails this
  // guard.
  assert.equal(
    execFileSync("git", ["hash-object", resolve(root, "tools/validate-foundation.mjs")], { cwd: root, encoding: "utf8" }).trim(),
    "aa8f60385e35b5531db44a75fd2e2f7e82b95a26",
    "validate-foundation.mjs pinned to its post-MOD-MEM-S2 blob"
  );
  // Sanity: the guarded doctrine doc still contains a KPI this suite pins, so
  // the guard is protecting the right file.
  const doc = readFileSync(resolve(root, DOC_REL), "utf8");
  assert.ok(doc.includes("cost per accepted work package"), "doctrine doc is the KPI doc");
});
