import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  RISK_CLASSES,
  MUTATION_CLASSES,
  AUTHORITY_CLASSES,
  RISK_ORDER,
  MUTATION_ORDER,
  AUTHORITY_ORDER,
  INDEPENDENCE_ORDER,
  riskProfile,
  requiredControls,
  mutationCeilingFor,
  mutationCapability,
  isRiskAtMost,
  isMutationAtMost
} from "../src/control/risk-registry.mjs";

// --- Markdown table harness -------------------------------------------------
// The doc-parity control: parse the ACTUAL governance markdown at test runtime
// and assert the codified tables match. Any future drift between code and the
// authoritative docs fails CI.

function docPath(rel) {
  return fileURLToPath(new URL(`../${rel}`, import.meta.url));
}

function readDoc(rel) {
  return readFileSync(docPath(rel), "utf8");
}

// Parse the first GitHub-flavoured markdown table whose header row contains all
// of `headerIncludes`. Returns an array of row objects keyed by header cell.
function parseTable(markdown, headerIncludes) {
  const lines = markdown.split(/\r?\n/);
  const isRow = (l) => /^\s*\|.*\|\s*$/.test(l);
  const cells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  for (let i = 0; i < lines.length; i += 1) {
    if (!isRow(lines[i])) continue;
    const header = cells(lines[i]);
    if (!headerIncludes.every((h) => header.includes(h))) continue;
    // Next line must be the separator row (---).
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

// ============================================================================
// DOC-PARITY (the S2 control)
// ============================================================================

test("doc-parity: risk indicators + controls match LEGACY authority-and-risk-model.md §2", () => {
  const doc = readDoc("docs/00-governance/authority-and-risk-model.md");
  const rows = parseTable(doc, ["Class", "Indicators", "Required controls"]);
  const byClass = Object.fromEntries(rows.map((r) => [r.Class, r]));
  for (const cls of RISK_ORDER) {
    const entry = RISK_CLASSES[cls];
    const docRow = byClass[cls];
    assert.ok(docRow, `${cls} present in legacy risk table`);
    assert.equal(entry.indicators, docRow.Indicators, `${cls} indicators verbatim`);
    assert.equal(entry.requiredControls, docRow["Required controls"], `${cls} controls verbatim`);
  }
  // Table dimensions: the code covers exactly the doc's risk rows.
  assert.equal(rows.length, RISK_ORDER.length, "risk row count matches");
});

test("doc-parity: authority classes match authority-and-risk-model.md §1", () => {
  const doc = readDoc("docs/00-governance/authority-and-risk-model.md");
  const rows = parseTable(doc, ["Class", "Name", "Permitted scope"]);
  const byClass = Object.fromEntries(rows.map((r) => [r.Class, r]));
  for (const cls of AUTHORITY_ORDER) {
    const entry = AUTHORITY_CLASSES[cls];
    const docRow = byClass[cls];
    assert.ok(docRow, `${cls} present in authority table`);
    assert.equal(entry.name, docRow.Name, `${cls} name verbatim`);
    assert.equal(entry.permittedScope, docRow["Permitted scope"], `${cls} scope verbatim`);
  }
  assert.equal(rows.length, AUTHORITY_ORDER.length, "authority row count matches");
});

test("doc-parity: mutation classes match 16-security/02-risk-and-mutation-classes.md", () => {
  const doc = readDoc("docs/16-security/02-risk-and-mutation-classes.md");
  const rows = parseTable(doc, ["Class", "Capability"]);
  const byClass = Object.fromEntries(rows.map((r) => [r.Class, r]));
  for (const cls of MUTATION_ORDER) {
    const entry = MUTATION_CLASSES[cls];
    const docRow = byClass[cls];
    assert.ok(docRow, `${cls} present in mutation table`);
    assert.equal(entry.capability, docRow.Capability, `${cls} capability verbatim`);
  }
  assert.equal(rows.length, MUTATION_ORDER.length, "mutation row count matches");
});

test("doc-parity: role topology + humanApproval match SECB-GOV-001 §8", () => {
  const doc = readDoc("docs/00-governance/SECB-GOV-001.md");
  const rows = parseTable(doc, ["Risk", "Required topology"]);
  const byClass = Object.fromEntries(rows.map((r) => [r.Risk, r]));
  for (const cls of RISK_ORDER) {
    const entry = RISK_CLASSES[cls];
    const docRow = byClass[cls];
    assert.ok(docRow, `${cls} present in minimum-roles table`);
    assert.equal(entry.requiredRoleTopology, docRow["Required topology"], `${cls} topology verbatim`);
    // humanApproval is DERIVED from the presence of "human" in the topology cell.
    assert.equal(entry.humanApproval, /human/i.test(docRow["Required topology"]), `${cls} humanApproval derives from topology`);
  }
});

test("doc-parity: independence floors consistent with docs/11-agents/01 prose", () => {
  const doc = readDoc("docs/11-agents/01-roles-and-separation-of-duties.md");
  // I-level labels exist as a table in the doc.
  const rows = parseTable(doc, ["Level", "Requirement"]);
  const levels = rows.map((r) => r.Level);
  assert.deepEqual(levels, [...INDEPENDENCE_ORDER], "independence levels match doc table");
  // Prose: "R2 requires at least I2 for final review. R3/R4 should use I3 or I4."
  assert.match(doc, /R2 requires at least I2/i);
  assert.match(doc, /R3\/R4 should use I3 or I4/i);
  // I0 is documented as R0 advisory work.
  assert.match(doc, /I0 \| Producer self-check only; R0 advisory work/);
  // Codified floors honour the doc: R0->I0 (exact), R2>=I2, R3/R4 in {I3,I4}.
  assert.equal(RISK_CLASSES.R0.independence, "I0");
  assert.ok(INDEPENDENCE_ORDER.indexOf(RISK_CLASSES.R2.independence) >= INDEPENDENCE_ORDER.indexOf("I2"));
  assert.ok(["I3", "I4"].includes(RISK_CLASSES.R3.independence));
  assert.ok(["I3", "I4"].includes(RISK_CLASSES.R4.independence));
});

// ============================================================================
// DERIVED-mapping invariants (not doc-parity; flagged for v0.1 acceptance)
// ============================================================================

test("derived: authority class grants exactly M_n by index (A->M invariant)", () => {
  for (let i = 0; i < AUTHORITY_ORDER.length; i += 1) {
    const a = AUTHORITY_ORDER[i];
    assert.equal(AUTHORITY_CLASSES[a].mutationCeiling, MUTATION_ORDER[i], `${a} ceiling is ${MUTATION_ORDER[i]}`);
  }
});

test("derived: risk mutation ceilings are monotone non-decreasing and conservative", () => {
  const ceilings = RISK_ORDER.map((r) => MUTATION_ORDER.indexOf(RISK_CLASSES[r].mutationCeiling));
  for (let i = 1; i < ceilings.length; i += 1) {
    assert.ok(ceilings[i] >= ceilings[i - 1], "risk ceiling never drops as risk rises");
  }
  // Conservative anchors: R0 observes only; R4 reaches production.
  assert.equal(RISK_CLASSES.R0.mutationCeiling, "M0");
  assert.equal(RISK_CLASSES.R4.mutationCeiling, "M5");
  // M4 (restricted env activation) is never a risk-derived ceiling.
  assert.ok(!RISK_ORDER.some((r) => RISK_CLASSES[r].mutationCeiling === "M4"));
});

// ============================================================================
// Lookup functions incl. all deny paths
// ============================================================================

test("riskProfile: returns frozen entry for known class, denies unknown", () => {
  const ok = riskProfile("R3");
  assert.equal(ok.ok, true);
  assert.equal(ok.value.class, "R3");
  assert.deepEqual(riskProfile("R9"), { ok: false, code: "DENY_UNKNOWN_RISK_CLASS" });
  assert.deepEqual(riskProfile(""), { ok: false, code: "DENY_UNKNOWN_RISK_CLASS" });
  assert.deepEqual(riskProfile(undefined), { ok: false, code: "DENY_UNKNOWN_RISK_CLASS" });
  // Prototype keys must not resolve.
  assert.deepEqual(riskProfile("toString"), { ok: false, code: "DENY_UNKNOWN_RISK_CLASS" });
});

test("requiredControls: bundles controls for known class, denies unknown", () => {
  const r = requiredControls("R2");
  assert.equal(r.ok, true);
  assert.equal(r.value.requiredRoleTopology, "SARCHI/ARCHI + ENGIN + REV + QA");
  assert.equal(r.value.independence, "I2");
  assert.equal(r.value.mutationCeiling, "M2");
  assert.equal(r.value.humanApproval, false);
  assert.deepEqual(requiredControls("nope"), { ok: false, code: "DENY_UNKNOWN_RISK_CLASS" });
});

test("mutationCeilingFor: maps authority class, denies unknown", () => {
  assert.deepEqual(mutationCeilingFor("A0"), { ok: true, value: "M0" });
  assert.deepEqual(mutationCeilingFor("A5"), { ok: true, value: "M5" });
  assert.deepEqual(mutationCeilingFor("A6"), { ok: false, code: "DENY_UNKNOWN_AUTHORITY_CLASS" });
  assert.deepEqual(mutationCeilingFor(null), { ok: false, code: "DENY_UNKNOWN_AUTHORITY_CLASS" });
});

test("mutationCapability: describes mutation class, denies unknown", () => {
  assert.deepEqual(mutationCapability("M4"), { ok: true, value: "Restricted environment activation" });
  assert.deepEqual(mutationCapability("M6"), { ok: false, code: "DENY_UNKNOWN_MUTATION_CLASS" });
});

test("isRiskAtMost: ordered compare with deny paths", () => {
  assert.deepEqual(isRiskAtMost("R1", "R3"), { ok: true });
  assert.deepEqual(isRiskAtMost("R3", "R3"), { ok: true });
  assert.deepEqual(isRiskAtMost("R4", "R2"), { ok: false, code: "DENY_RISK_EXCEEDS" });
  assert.deepEqual(isRiskAtMost("R9", "R2"), { ok: false, code: "DENY_UNKNOWN_RISK_CLASS" });
  assert.deepEqual(isRiskAtMost("R2", "RX"), { ok: false, code: "DENY_UNKNOWN_RISK_CLASS" });
});

test("isMutationAtMost: ordered compare with deny paths", () => {
  assert.deepEqual(isMutationAtMost("M2", "M5"), { ok: true });
  assert.deepEqual(isMutationAtMost("M5", "M2"), { ok: false, code: "DENY_MUTATION_EXCEEDS" });
  assert.deepEqual(isMutationAtMost("M9", "M2"), { ok: false, code: "DENY_UNKNOWN_MUTATION_CLASS" });
});

// ============================================================================
// Frozen-immutability assertions
// ============================================================================

test("registries and their entries are deeply frozen", () => {
  assert.ok(Object.isFrozen(RISK_CLASSES));
  assert.ok(Object.isFrozen(MUTATION_CLASSES));
  assert.ok(Object.isFrozen(AUTHORITY_CLASSES));
  assert.ok(Object.isFrozen(RISK_ORDER));
  assert.ok(Object.isFrozen(MUTATION_ORDER));
  assert.ok(Object.isFrozen(AUTHORITY_ORDER));
  assert.ok(Object.isFrozen(INDEPENDENCE_ORDER));
  for (const cls of RISK_ORDER) assert.ok(Object.isFrozen(RISK_CLASSES[cls]), `${cls} entry frozen`);
  for (const cls of MUTATION_ORDER) assert.ok(Object.isFrozen(MUTATION_CLASSES[cls]), `${cls} entry frozen`);
  for (const cls of AUTHORITY_ORDER) assert.ok(Object.isFrozen(AUTHORITY_CLASSES[cls]), `${cls} entry frozen`);
});

test("mutation attempts on frozen tables throw in strict mode", () => {
  assert.throws(() => { RISK_CLASSES.R0 = {}; }, TypeError);
  assert.throws(() => { RISK_CLASSES.R0.mutationCeiling = "M5"; }, TypeError);
  assert.throws(() => { MUTATION_ORDER.push("M6"); }, TypeError);
  assert.throws(() => { AUTHORITY_CLASSES.A0.name = "hacked"; }, TypeError);
});
