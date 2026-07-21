// MOD-OPS Slice S3 — cadence catalog + due-action evaluator tests.
//
// Controls in this suite:
//   1. DOC-PARITY fixture: parses docs/12-execution/02-schedule-and-cadence.md
//      at test runtime and asserts a 1:1 match against the codified catalogs —
//      the 7 event-driven triggers (name, required-action cell, enumerated
//      actions split, order), the 8 operating-rhythm rows (cadence, activity,
//      required output, order, plus schedule hour/minute/weekday cross-checked
//      against the cadence text), and the 6 checkpoint conditions — PLUS an
//      independent derivation of every stable id from the doc text. Drift on
//      names, order, counts, split, or schedule fails the suite.
//   2. TRIGGER lookup: every trigger resolves; unknown/malformed deny.
//   3. DUE-DECISION semantics at fixed injected instants (timezone-explicit,
//      Asia/Ho_Chi_Minh UTC+7): daily / weekly most-recent-occurrence,
//      lastRun suppression, monthly first-Tuesday at day resolution (incl.
//      previous-month rollover), quarterly SCHEDULE_UNDERSPECIFIED finding,
//      trigger-context due item.
//   4. DENY-by-default, every code: DENY_CADENCE_MALFORMED, DENY_CADENCE_UNKNOWN.
//   5. CLOCK discipline: now as string / NaN / Infinity / -Infinity / negative
//      / bigint / boolean / null / missing => MALFORMED; evaluatedAt echoes
//      the injected clock (no ambient clock).
//   6. ATOMIC SNAPSHOT / cross-field TOCTOU (house standard): throwing getters,
//      Proxy traps, invocation-count === 1 per field (now, triggerId, lastRun,
//      per lastRun own key), shifty getters, Reflect.ownKeys structural capture.
//   7. Deep-frozen outputs + mutation attempts throw in strict mode; caller
//      inputs are never mutated.
//   8. DECISION-NOT-SCHEDULER / purity guard (B4): the module imports nothing
//      and references no clock, timer, or I/O token.
//   9. BYTE-IDENTITY guard: every pre-existing file this slice read but must
//      not modify is blob-identical to main @ c52db71.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CADENCE_DENY_CODES,
  CADENCE_FINDING_CODES,
  TIMEZONE,
  CADENCE_TRIGGERS,
  OPERATING_RHYTHM,
  CHECKPOINT_TRIGGERS,
  requiredActionsForTrigger,
  listTriggers,
  listRhythm,
  listCheckpointTriggers,
  evaluateDueActions
} from "../src/ops/cadence-policy.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE_COMMIT = "c52db71776e57aaf624002e53382d4857816773f"; // main @ c52db71
const DOC_REL = "docs/12-execution/02-schedule-and-cadence.md";

const TZ_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Ho_Chi_Minh, fixed UTC+7
// A UTC epoch-ms for a given Asia/Ho_Chi_Minh local wall-clock time. Built
// with Date.UTC ONLY in the test harness (never in the pure module) to express
// fixtures readably; the value handed to the module is a plain number.
const hcm = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) - TZ_OFFSET_MS;

// --- Doctrine-doc harness ----------------------------------------------------
// Independent slug + split, mirroring the scheme the module documents.
const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const splitClause = (cell) =>
  cell.split(/,\s*/).flatMap((s) => s.split(/\s+and\s+/)).map((s) => s.trim()).filter(Boolean);

// Parse the doc into { triggers:[[trig,action]], rhythm:[[cad,act,out]],
// checkpoints:[cond] } from the three `##` sections, independently of code.
function parseCadenceDoc(markdown) {
  const out = { triggers: [], rhythm: [], checkpoints: [] };
  let section = null;
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = line.match(/^## (.+)$/);
    if (heading) {
      const h = heading[1].trim();
      section = h === "Event-driven cadence" ? "triggers"
        : h === "Recommended operating rhythm" ? "rhythm"
        : h === "Session checkpoint policy" ? "checkpoints"
        : null;
      continue;
    }
    if (!section) continue;
    if (section === "checkpoints") {
      const bullet = line.match(/^- (.+?)[;.]?$/);
      if (bullet) out.checkpoints.push(bullet[1].trim());
      continue;
    }
    if (line.startsWith("|")) {
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      if (cells.every((c) => /^-+$/.test(c))) continue;          // separator row
      if (section === "triggers" && cells[0] === "Trigger") continue;   // header
      if (section === "rhythm" && cells[0] === "Cadence") continue;     // header
      if (section === "triggers") out.triggers.push([cells[0], cells[1]]);
      else out.rhythm.push([cells[0], cells[1], cells[2]]);
    }
  }
  return out;
}

const doc = parseCadenceDoc(readFileSync(resolve(root, DOC_REL), "utf8"));

// ============================================================================
// DOC-PARITY (the S3 control)
// ============================================================================

test("doc-parity: 7 event-driven triggers, verbatim + ordered, ids and split derived from doc", () => {
  assert.equal(doc.triggers.length, 7, "doc names 7 triggers");
  assert.equal(CADENCE_TRIGGERS.length, 7);
  for (let i = 0; i < 7; i += 1) {
    const [trigName, action] = doc.triggers[i];
    const code = CADENCE_TRIGGERS[i];
    assert.equal(code.trigger, trigName, `#${i} trigger name verbatim`);
    assert.equal(code.requiredAction, action, `#${i} required action verbatim`);
    assert.equal(code.id, slug(trigName), `#${i} id derives from doc`);
    assert.deepEqual([...code.actions], splitClause(action), `#${i} actions split from doc`);
  }
});

test("doc-parity: 8 operating-rhythm rows, verbatim + ordered, ids derived from doc", () => {
  assert.equal(doc.rhythm.length, 8, "doc names 8 rhythm rows");
  assert.equal(OPERATING_RHYTHM.length, 8);
  for (let i = 0; i < 8; i += 1) {
    const [cadence, activity, output] = doc.rhythm[i];
    const row = OPERATING_RHYTHM[i];
    assert.equal(row.cadence, cadence, `#${i} cadence verbatim`);
    assert.equal(row.activity, activity, `#${i} activity verbatim`);
    assert.equal(row.requiredOutput, output, `#${i} required output verbatim`);
    assert.equal(row.id, slug(cadence), `#${i} id derives from doc`);
  }
});

test("doc-parity: rhythm schedule fields are consistent with the cadence text", () => {
  const WEEKDAY = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
  for (const row of OPERATING_RHYTHM) {
    const timeMatch = row.cadence.match(/(\d{1,2}):(\d{2})/);
    if (row.schedule.kind === "daily" || row.schedule.kind === "weekly") {
      assert.ok(timeMatch, `${row.cadence} carries a HH:MM in doc text`);
      assert.equal(row.schedule.hour, Number(timeMatch[1]), `${row.cadence} hour matches doc`);
      assert.equal(row.schedule.minute, Number(timeMatch[2]), `${row.cadence} minute matches doc`);
    }
    if (row.schedule.kind === "weekly") {
      const dayName = Object.keys(WEEKDAY).find((d) => row.cadence.includes(d));
      assert.equal(row.schedule.weekday, WEEKDAY[dayName], `${row.cadence} weekday matches doc`);
    }
    if (row.schedule.kind === "monthly-weekday") {
      assert.ok(/Monthly/.test(row.cadence) && /Tuesday/.test(row.cadence));
      assert.equal(row.schedule.weekday, WEEKDAY.Tuesday);
      assert.equal(row.schedule.ordinal, 1, "first");
    }
  }
});

test("doc-parity: 6 checkpoint conditions, verbatim + ordered, ids derived from doc", () => {
  assert.equal(doc.checkpoints.length, 6, "doc names 6 checkpoint conditions");
  assert.equal(CHECKPOINT_TRIGGERS.length, 6);
  for (let i = 0; i < 6; i += 1) {
    assert.equal(CHECKPOINT_TRIGGERS[i].condition, doc.checkpoints[i], `#${i} condition verbatim`);
    assert.equal(CHECKPOINT_TRIGGERS[i].id, slug(doc.checkpoints[i]), `#${i} id derives from doc`);
  }
});

test("doc-parity: timezone default is the doctrine timezone", () => {
  const src = readFileSync(resolve(root, DOC_REL), "utf8");
  assert.ok(src.includes("Asia/Ho_Chi_Minh"), "doc declares the timezone");
  assert.equal(TIMEZONE, "Asia/Ho_Chi_Minh");
});

// ============================================================================
// Catalog listers + deny-code sets
// ============================================================================

test("deny codes: the closed set is exactly the two published codes", () => {
  assert.deepEqual([...CADENCE_DENY_CODES], ["DENY_CADENCE_MALFORMED", "DENY_CADENCE_UNKNOWN"]);
  assert.ok(Object.isFrozen(CADENCE_DENY_CODES));
  assert.deepEqual([...CADENCE_FINDING_CODES], ["SCHEDULE_UNDERSPECIFIED"]);
});

test("listers: return the frozen catalogs", () => {
  assert.equal(listTriggers().triggers, CADENCE_TRIGGERS);
  assert.equal(listRhythm().rhythm, OPERATING_RHYTHM);
  assert.equal(listCheckpointTriggers().checkpoints, CHECKPOINT_TRIGGERS);
});

// ============================================================================
// Trigger lookup
// ============================================================================

test("requiredActionsForTrigger: resolves all 7 triggers with verbatim actions", () => {
  for (const t of CADENCE_TRIGGERS) {
    const res = requiredActionsForTrigger({ triggerId: t.id });
    assert.equal(res.ok, true, `${t.id} resolves`);
    assert.equal(res.trigger, t.trigger);
    assert.equal(res.requiredAction, t.requiredAction);
    assert.deepEqual(res.actions, [...t.actions]);
  }
});

test("requiredActionsForTrigger: malformed triggerId => DENY_CADENCE_MALFORMED", () => {
  for (const triggerId of [undefined, null, 42, "", "   ", "commit-checkpoint\0", ["x"], { toString: () => "x" }]) {
    const res = requiredActionsForTrigger({ triggerId });
    assert.equal(res.ok, false, `${JSON.stringify(triggerId)} denied`);
    assert.equal(res.code, "DENY_CADENCE_MALFORMED");
  }
  assert.equal(requiredActionsForTrigger(undefined).code, "DENY_CADENCE_MALFORMED");
  assert.equal(requiredActionsForTrigger(null).code, "DENY_CADENCE_MALFORMED");
});

test("requiredActionsForTrigger: unknown but well-formed trigger => DENY_CADENCE_UNKNOWN, never guesses", () => {
  for (const triggerId of ["work package created", "Work-package-created", "deploy", "toString", "__proto__", "constructor"]) {
    const res = requiredActionsForTrigger({ triggerId });
    assert.equal(res.ok, false, `"${triggerId}" denied`);
    assert.equal(res.code, "DENY_CADENCE_UNKNOWN", `"${triggerId}" is not coerced`);
  }
});

// ============================================================================
// Due-decision semantics — fixed injected instants, timezone-explicit
// ============================================================================

// Reference instant: Friday 2026-07-24 16:00 Asia/Ho_Chi_Minh.
const FRI_1600 = hcm(2026, 7, 24, 16, 0);
const dueIds = (res) => res.due.filter((d) => d.kind === "rhythm").map((d) => d.id);

test("due: at Fri 16:00 HCM, the six precisely-scheduled rows are due, quarterly is a finding", () => {
  const res = evaluateDueActions({ now: FRI_1600 });
  assert.equal(res.ok, true);
  assert.equal(res.timezone, "Asia/Ho_Chi_Minh");
  assert.equal(res.evaluatedAt, FRI_1600, "clock echoed, no ambient clock");
  assert.deepEqual(dueIds(res), [
    "daily-08-30", "daily-17-30", "monday-09-00",
    "wednesday-15-00", "friday-15-00", "friday-16-30", "monthly-first-tuesday"
  ]);
  assert.deepEqual(res.findings.map((f) => [f.id, f.code]), [["quarterly", "SCHEDULE_UNDERSPECIFIED"]]);
});

test("due: daily occurrence is today-at-or-before-now, else yesterday", () => {
  const res = evaluateDueActions({ now: FRI_1600 });
  const d0830 = res.due.find((d) => d.id === "daily-08-30");
  const d1730 = res.due.find((d) => d.id === "daily-17-30");
  assert.equal(d0830.scheduledFor, hcm(2026, 7, 24, 8, 30), "08:30 today (<= now)");
  assert.equal(d1730.scheduledFor, hcm(2026, 7, 23, 17, 30), "17:30 rolled to yesterday (> now)");
  assert.equal(d0830.resolution, "minute");
});

test("due: weekly occurrence is the most recent target weekday at-or-before now", () => {
  const res = evaluateDueActions({ now: FRI_1600 });
  assert.equal(res.due.find((d) => d.id === "friday-15-00").scheduledFor, hcm(2026, 7, 24, 15, 0), "today 15:00");
  assert.equal(res.due.find((d) => d.id === "friday-16-30").scheduledFor, hcm(2026, 7, 17, 16, 30), "16:30 > now -> last Friday");
  assert.equal(res.due.find((d) => d.id === "monday-09-00").scheduledFor, hcm(2026, 7, 20, 9, 0), "this Monday");
  assert.equal(res.due.find((d) => d.id === "wednesday-15-00").scheduledFor, hcm(2026, 7, 22, 15, 0), "this Wednesday");
});

test("due: monthly first-Tuesday anchors at 00:00 local, day resolution", () => {
  // First Tuesday of July 2026 is the 7th.
  const res = evaluateDueActions({ now: FRI_1600 });
  const m = res.due.find((d) => d.id === "monthly-first-tuesday");
  assert.equal(m.scheduledFor, hcm(2026, 7, 7, 0, 0), "00:00 local of first Tuesday");
  assert.equal(m.resolution, "day");
});

test("due: monthly first-Tuesday rolls to previous month before this month's occurrence", () => {
  // 2026-07-03 is before July's first Tuesday (the 7th) -> June's first Tuesday (the 2nd).
  const res = evaluateDueActions({ now: hcm(2026, 7, 3, 12, 0) });
  const m = res.due.find((d) => d.id === "monthly-first-tuesday");
  assert.equal(m.scheduledFor, hcm(2026, 6, 2, 0, 0), "June first Tuesday");
});

test("due: monthly rollover crosses a year boundary (Jan -> Dec)", () => {
  // First Tuesday of Jan 2026 is the 6th; before it -> Dec 2025 first Tuesday (the 2nd).
  const res = evaluateDueActions({ now: hcm(2026, 1, 3, 9, 0) });
  const m = res.due.find((d) => d.id === "monthly-first-tuesday");
  assert.equal(m.scheduledFor, hcm(2025, 12, 2, 0, 0), "Dec 2025 first Tuesday across year boundary");
});

test("due: before a daily time on a quiet day still rolls each row to its prior occurrence", () => {
  // Sunday 2026-07-19 08:00 (before 08:30): daily-08-30 -> yesterday 08:30.
  const res = evaluateDueActions({ now: hcm(2026, 7, 19, 8, 0) });
  assert.equal(res.due.find((d) => d.id === "daily-08-30").scheduledFor, hcm(2026, 7, 18, 8, 30));
});

// ============================================================================
// lastRun suppression + trigger context
// ============================================================================

test("lastRun: a row completed at-or-after its occurrence is NOT due; earlier completion stays due", () => {
  const base = evaluateDueActions({ now: FRI_1600 });
  const occ = base.due.find((d) => d.id === "friday-15-00").scheduledFor;
  const suppressed = evaluateDueActions({ now: FRI_1600, lastRun: { "friday-15-00": occ } });
  assert.equal(suppressed.due.some((d) => d.id === "friday-15-00"), false, "completed exactly at occurrence => not due");
  const stale = evaluateDueActions({ now: FRI_1600, lastRun: { "friday-15-00": occ - 1 } });
  assert.equal(stale.due.some((d) => d.id === "friday-15-00"), true, "completed before occurrence => still due");
});

test("lastRun: suppressing every decidable row leaves only the quarterly finding", () => {
  const base = evaluateDueActions({ now: FRI_1600 });
  const lastRun = {};
  for (const d of base.due) if (d.kind === "rhythm") lastRun[d.id] = d.scheduledFor;
  const res = evaluateDueActions({ now: FRI_1600, lastRun });
  assert.equal(res.due.length, 0, "all rhythm rows suppressed");
  assert.equal(res.findings.length, 1);
});

test("trigger context: a supplied triggerId adds one trigger due item after the rhythm rows", () => {
  const res = evaluateDueActions({ now: FRI_1600, triggerId: "candidate-submitted" });
  const last = res.due[res.due.length - 1];
  assert.equal(last.kind, "trigger");
  assert.equal(last.id, "candidate-submitted");
  assert.equal(last.requiredAction, "Freeze, independent review and integration queue entry");
  assert.deepEqual(last.actions, ["Freeze", "independent review", "integration queue entry"]);
});

// ============================================================================
// Clock discipline — malformed now
// ============================================================================

test("clock: now as string / NaN / Infinity / -Infinity / negative / bigint / etc => MALFORMED", () => {
  const bad = ["1700000000000", NaN, Infinity, -Infinity, -1, -0.5, 5n, true, false, null, undefined, {}, [], () => 0];
  for (const now of bad) {
    const res = evaluateDueActions({ now });
    assert.equal(res.ok, false, `now ${String(now)} denied`);
    assert.equal(res.code, "DENY_CADENCE_MALFORMED");
  }
});

test("clock: now === 0 (epoch) is a valid non-negative instant", () => {
  const res = evaluateDueActions({ now: 0 });
  assert.equal(res.ok, true);
  assert.equal(res.evaluatedAt, 0);
});

// ============================================================================
// DENY_CADENCE_MALFORMED / DENY_CADENCE_UNKNOWN — structural + naming
// ============================================================================

test("malformed: non-object input => MALFORMED", () => {
  for (const input of [undefined, null, 42, "nope", true, ["arr"]]) {
    const res = evaluateDueActions(input);
    assert.equal(res.ok, false, `${JSON.stringify(input)} denied`);
    assert.equal(res.code, "DENY_CADENCE_MALFORMED");
  }
});

test("malformed: lastRun that is not a plain object => MALFORMED", () => {
  for (const lastRun of [42, "x", true, ["arr"]]) {
    const res = evaluateDueActions({ now: FRI_1600, lastRun });
    assert.equal(res.ok, false, `lastRun ${JSON.stringify(lastRun)} denied`);
    assert.equal(res.code, "DENY_CADENCE_MALFORMED");
  }
  // Absent lastRun (undefined / null) is fine — selects the empty map.
  assert.equal(evaluateDueActions({ now: FRI_1600, lastRun: undefined }).ok, true);
  assert.equal(evaluateDueActions({ now: FRI_1600, lastRun: null }).ok, true);
});

test("malformed: a lastRun value that is not a finite non-negative number => MALFORMED", () => {
  for (const v of [NaN, Infinity, -1, "0", 5n, true, null, {}]) {
    const res = evaluateDueActions({ now: FRI_1600, lastRun: { "daily-08-30": v } });
    assert.equal(res.ok, false, `value ${String(v)} denied`);
    assert.equal(res.code, "DENY_CADENCE_MALFORMED");
  }
});

test("unknown: a lastRun own-key that is not a rhythm id => DENY_CADENCE_UNKNOWN", () => {
  for (const key of ["nope", "daily-0830", "toString", "hasOwnProperty", "friday"]) {
    const res = evaluateDueActions({ now: FRI_1600, lastRun: { [key]: 1 } });
    assert.equal(res.ok, false, `key "${key}" denied`);
    assert.equal(res.code, "DENY_CADENCE_UNKNOWN", `"${key}" is not coerced`);
  }
});

test("unknown: an unknown triggerId in evaluateDueActions => DENY_CADENCE_UNKNOWN", () => {
  assert.equal(evaluateDueActions({ now: FRI_1600, triggerId: "deploy" }).code, "DENY_CADENCE_UNKNOWN");
  assert.equal(evaluateDueActions({ now: FRI_1600, triggerId: 42 }).code, "DENY_CADENCE_MALFORMED");
  assert.equal(evaluateDueActions({ now: FRI_1600, triggerId: "" }).code, "DENY_CADENCE_MALFORMED");
});

// ============================================================================
// ATOMIC SNAPSHOT / cross-field TOCTOU regressions
// ============================================================================

test("fail-closed: a throwing now getter => MALFORMED, never throws", () => {
  const hostile = { lastRun: {}, triggerId: undefined };
  Object.defineProperty(hostile, "now", { enumerable: true, get() { throw new Error("boom"); } });
  let res;
  assert.doesNotThrow(() => { res = evaluateDueActions(hostile); });
  assert.equal(res.code, "DENY_CADENCE_MALFORMED");
});

test("fail-closed: a throwing lastRun value getter => MALFORMED, never throws", () => {
  const lastRun = {};
  Object.defineProperty(lastRun, "daily-08-30", { enumerable: true, get() { throw new Error("boom"); } });
  let res;
  assert.doesNotThrow(() => { res = evaluateDueActions({ now: FRI_1600, lastRun }); });
  assert.equal(res.code, "DENY_CADENCE_MALFORMED");
});

test("fail-closed: a Proxy input with a throwing get trap => MALFORMED", () => {
  const throwing = new Proxy({}, { get() { throw new Error("trap"); } });
  let res;
  assert.doesNotThrow(() => { res = evaluateDueActions(throwing); });
  assert.equal(res.code, "DENY_CADENCE_MALFORMED");
});

test("single-read: now / triggerId / a lastRun own-key value are each read EXACTLY ONCE", () => {
  let nowReads = 0;
  let trigReads = 0;
  let valReads = 0;
  const input = {};
  Object.defineProperty(input, "now", { enumerable: true, get() { nowReads += 1; return FRI_1600; } });
  Object.defineProperty(input, "triggerId", { enumerable: true, get() { trigReads += 1; return "outcome-observed"; } });
  const lastRun = {};
  Object.defineProperty(lastRun, "friday-15-00", { enumerable: true, get() { valReads += 1; return 1; } });
  Object.defineProperty(input, "lastRun", { enumerable: true, value: lastRun });
  const res = evaluateDueActions(input);
  assert.equal(res.ok, true);
  assert.equal(nowReads, 1, "now read once");
  assert.equal(trigReads, 1, "triggerId read once");
  assert.equal(valReads, 1, "lastRun value read once");
});

test("cross-field TOCTOU: a shifty now getter cannot split the finite-check from the stored clock", () => {
  let reads = 0;
  const input = {};
  Object.defineProperty(input, "now", { enumerable: true, get() { reads += 1; return reads === 1 ? FRI_1600 : NaN; } });
  const res = evaluateDueActions(input);
  assert.equal(reads, 1, "no second read exists to poison");
  assert.equal(res.ok, true);
  assert.equal(res.evaluatedAt, FRI_1600, "decision bound to the first snapshot");
});

test("cross-field TOCTOU: a shifty lastRun value getter binds to the first snapshot", () => {
  let reads = 0;
  const lastRun = {};
  // First read is a valid, non-suppressing (stale) completion; a second read
  // would be a suppressing one. Single-read must keep the row DUE.
  const base = evaluateDueActions({ now: FRI_1600 });
  const occ = base.due.find((d) => d.id === "friday-15-00").scheduledFor;
  Object.defineProperty(lastRun, "friday-15-00", { enumerable: true, get() { reads += 1; return reads === 1 ? occ - 1 : occ; } });
  const res = evaluateDueActions({ now: FRI_1600, lastRun });
  assert.equal(reads, 1, "no second read exists to poison");
  assert.equal(res.due.some((d) => d.id === "friday-15-00"), true, "stale first read => still due");
});

// ============================================================================
// Deep-frozen outputs + isolation
// ============================================================================

test("frozen: a success result is deeply frozen (result, due, findings, entries)", () => {
  const res = evaluateDueActions({ now: FRI_1600, triggerId: "session-started" });
  assert.ok(Object.isFrozen(res));
  assert.ok(Object.isFrozen(res.due));
  assert.ok(Object.isFrozen(res.findings));
  for (const d of res.due) {
    assert.ok(Object.isFrozen(d));
    if (d.actions) assert.ok(Object.isFrozen(d.actions));
  }
  for (const f of res.findings) assert.ok(Object.isFrozen(f));
});

test("frozen: a denial result is deeply frozen", () => {
  assert.ok(Object.isFrozen(evaluateDueActions(null)));
  assert.ok(Object.isFrozen(requiredActionsForTrigger({ triggerId: "nope" })));
});

test("frozen: catalogs and every entry are deeply frozen", () => {
  for (const t of CADENCE_TRIGGERS) { assert.ok(Object.isFrozen(t)); assert.ok(Object.isFrozen(t.actions)); }
  for (const r of OPERATING_RHYTHM) { assert.ok(Object.isFrozen(r)); assert.ok(Object.isFrozen(r.schedule)); }
  for (const c of CHECKPOINT_TRIGGERS) assert.ok(Object.isFrozen(c));
});

test("frozen: mutation attempts throw in strict mode and change nothing", () => {
  const res = evaluateDueActions({ now: FRI_1600 });
  assert.throws(() => { res.ok = false; }, TypeError);
  assert.throws(() => { res.due.push({}); }, TypeError);
  assert.throws(() => { res.due[0].scheduledFor = 0; }, TypeError);
  assert.throws(() => { CADENCE_TRIGGERS.push({}); }, TypeError);
  assert.throws(() => { OPERATING_RHYTHM[0].schedule.hour = 0; }, TypeError);
});

test("isolation: the evaluator never mutates the caller's lastRun object", () => {
  const lastRun = { "daily-08-30": 1, "friday-15-00": 2 };
  const before = JSON.stringify(lastRun);
  evaluateDueActions({ now: FRI_1600, lastRun });
  assert.equal(JSON.stringify(lastRun), before, "caller lastRun untouched");
});

// ============================================================================
// Decision-not-scheduler / purity guard (B4)
// ============================================================================

test("purity: module imports nothing and references no clock, timer, or I/O token", () => {
  const source = readFileSync(resolve(root, "src/ops/cadence-policy.mjs"), "utf8");
  assert.equal(/^\s*import\s/m.test(source), false, "no import statements");
  assert.equal(/require\s*\(/.test(source), false, "no require calls");
  for (const forbidden of ["Date.now", "new Date", "setTimeout", "setInterval", "setImmediate", "node:fs", "node:child_process", "fetch(", "process."]) {
    assert.equal(source.includes(forbidden), false, `no ${forbidden}`);
  }
});

// ============================================================================
// Byte-identity guard — zero edits to every pre-existing file this slice read.
// (MANIFEST.json excluded: intentionally appended-to by this slice.)
// ============================================================================

test(`byte-identity: files read but not modified are unchanged vs main @ ${BASE_COMMIT.slice(0, 7)}`, () => {
  const guarded = [
    DOC_REL,                              // cadence doctrine source
    "src/control/retry-policy.mjs",       // decision-not-scheduler pattern consulted
    "src/ops/kpi-registry.mjs",           // S1 doc-parity / registry pattern consulted
    "src/ops/scorecard-assembler.mjs",    // S2 atomic-snapshot pattern consulted
    "package.json"                        // scripts consulted
  ];
  for (const rel of guarded) {
    const baseBlob = execFileSync("git", ["rev-parse", `${BASE_COMMIT}:${rel}`], { cwd: root, encoding: "utf8" }).trim();
    const worktreeBlob = execFileSync("git", ["hash-object", resolve(root, rel)], { cwd: root, encoding: "utf8" }).trim();
    assert.equal(worktreeBlob, baseBlob, `${rel} blob differs from base`);
  }
  // tools/validate-foundation.mjs was authorized-modified by MOD-WSPACE-S3 (G6
  // workspace-lease schema registration, 16->17 schemas) and, on this branch,
  // by MOD-INTEG S1 (integration-queue-entry schema registration, 17->18
  // schemas), so it is no longer blob-identical to the base commit. Pin it to
  // its post-MOD-INTEG-S1 blob so any UNAUTHORIZED further drift of the
  // validator still fails this guard.
  assert.equal(
    execFileSync("git", ["hash-object", resolve(root, "tools/validate-foundation.mjs")], { cwd: root, encoding: "utf8" }).trim(),
    "fb38ca55deeb965b62233ca514ac30506df9b98e",
    "validate-foundation.mjs pinned to its post-MOD-INTEG-S1 blob"
  );
});
