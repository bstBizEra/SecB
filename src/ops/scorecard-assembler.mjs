// MOD-OPS Slice S2 — scorecard assembler (PURE, UNWIRED).
//
// Purpose (G2 from mod-ops-gap-assessment-001, bst/mod-ops-assessment): give
// `src/` a single pure, frozen, deny-by-default answer to "given a set of
// caller-supplied KPI measurements, what does the operations scorecard look
// like, and which cataloged KPIs have no measurement?". The scorecard's KPI
// universe is NOT invented here — it is read from the ratified S1 registry
// (src/ops/kpi-registry.mjs). This slice assembles over CALLER-SUPPLIED
// measurements only: a missing measurement becomes a FINDING, never an
// invented zero; nothing is computed, aggregated, or thresholded.
//
// Scope discipline: pure assembler. No I/O, no clock, no timers, no schema,
// no persistence, no transport. The ONLY import is the S1 KPI registry, read
// read-only as the KPI vocabulary source (same-plan dependency; still unwired
// to any live path). NOTHING consumes this assembler in this slice — adoption
// by any report/live path is later, separately-governed work (assessment
// §5 #4). It never opens a ledger, re-validates an envelope, or reads a file
// (B2): the caller verifies its measurement sources first, exactly as the
// P0-17 report does for its records.
//
// NOT computed here (assessment §5 #3, #5, G4-future): no formulas, no
// aggregates, no ratios, no thresholds/targets, no red/amber/green ratings.
// Inventing any of those would be un-sourced authority. Values are carried
// through verbatim; they are not summed, averaged, or compared.
//
// ATOMIC SNAPSHOT (upgraded house standard, LIVE-S1 rev-002 N1): every field
// this assembler consults off caller-supplied input is captured in a SINGLE
// contained read into a local const BEFORE any evaluation logic runs. The
// top-level {groupId, measurements} is snapshotted once (with a defensive
// array copy); then every measurement's {kpiId, value} is snapshotted once
// each — ALL reads complete before ANY classification. A hostile getter or
// Proxy trap therefore cannot (a) throw past the guard, nor (b) return one
// value to a check and another to the body, nor (c) side-effect a sibling
// field that has already been captured. Decisions bind to the first snapshot.
//
// Registry composition (read-only, B-parity): unknown/out-of-universe KPI ids
// mirror the registry's own-property semantics — prototype keys ("toString",
// "__proto__", "constructor") are own-property misses and deny as UNKNOWN
// (registry N1). The registry is imported and consulted; it is never mutated.
//
// House style: result objects. `assembleScorecard` returns a deep-frozen
// { ok: true, ... } on success and a deep-frozen { ok: false, code, message }
// on any malformed/unknown input (deny-by-default — the assembler denies
// ATOMICALLY on the first offending measurement; it never partially
// assembles, never silently drops, never coerces).
//
// Audit-before-effect holds by construction: the assembler has no side
// effects; its decision record IS its returned frozen result.

import { KPI_CATALOG, listKpisByGroup } from "./kpi-registry.mjs";

// The full closed set of top-level deny codes this assembler can emit, frozen
// so callers may switch on it without risk of silent drift.
//
//   DENY_SCORECARD_MALFORMED — deny-by-default on any structurally invalid
//     input: non-object input; non-array measurements; a measurement that is
//     not a non-array object; an unreadable measurement field (throwing getter
//     / Proxy trap); a kpiId that is not a non-blank null-byte-free string; a
//     value that is not a finite number (NaN / Infinity / -Infinity / string /
//     bigint / boolean / null / object all reject — with detail); or a
//     duplicate measurement for the same KPI id. Contained extraction: the
//     offending field is read exactly once inside a try/catch.
//   DENY_KPI_UNKNOWN — a well-formed measurement kpiId that is not a member of
//     THIS scorecard's KPI universe: either uncataloged in the registry, or
//     cataloged but outside the requested groupId scope. Mirrors the registry's
//     own-property lookup (prototype keys deny here too, registry N1). The id
//     is never coerced to a default and never silently dropped.
//   DENY_GROUP_UNKNOWN — a supplied groupId that is not one of the four
//     doctrine KPI groups (delegated verbatim to the S1 registry). Only an
//     absent groupId (undefined) selects the full 24-KPI universe.
export const SCORECARD_DENY_CODES = Object.freeze([
  "DENY_SCORECARD_MALFORMED",
  "DENY_KPI_UNKNOWN",
  "DENY_GROUP_UNKNOWN"
]);

const NULL_BYTE = "\0";

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const deny = (code, message) => deepFreeze({ ok: false, code, message });

// --- Atomic input snapshot ---------------------------------------------------

// Single contained read of the two consulted top-level fields, with a
// defensive shallow copy of the measurements array — all inside ONE
// try/catch. `input?.groupId` and `input?.measurements` are each read exactly
// once; the array is `.slice()`d so a getter/Proxy cannot hand a different
// array to the body than it showed the guard. A throw anywhere (hostile input
// object, hostile array trap during copy) is contained as a malformed snapshot.
function snapshotInput(input) {
  try {
    const groupId = input?.groupId;
    const measurements = input?.measurements;
    if (!Array.isArray(measurements)) {
      return { ok: false };
    }
    // Shallow copy: element references are captured now; each element's own
    // fields are snapshotted separately below (one read each), never here.
    const measurementsCopy = measurements.slice();
    return { ok: true, groupId, measurements: measurementsCopy };
  } catch {
    return { ok: false };
  }
}

// Single contained read of a measurement's two consulted fields. `m.kpiId` and
// `m.value` are read exactly once each, together, before any evaluation. A
// non-object measurement, or a throwing getter / Proxy trap, is contained as a
// malformed snapshot — never a throw.
function snapshotMeasurement(m) {
  if (m === null || typeof m !== "object" || Array.isArray(m)) {
    return Object.freeze({ ok: false, detail: "measurement must be a non-array object" });
  }
  let kpiId;
  let value;
  try {
    kpiId = m.kpiId;
    value = m.value;
  } catch {
    return Object.freeze({ ok: false, detail: "measurement field could not be read safely" });
  }
  return Object.freeze({ ok: true, kpiId, value });
}

// --- Snapshot validation (pure; operates only on captured snapshots) ---------

const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v);

const isUsableId = (v) =>
  typeof v === "string" && v.trim().length > 0 && !v.includes(NULL_BYTE);

// Describe why a captured value is not a finite number, for the deny detail.
// Purely descriptive — no coercion, no computation.
function valueDefect(value) {
  if (typeof value === "number") return "value must be finite (NaN and Infinity reject)";
  return `value must be a finite number, received ${typeof value}`;
}

// --- Assembler ---------------------------------------------------------------

// assembleScorecard({ groupId?, measurements }) — assemble a frozen scorecard
// over caller-supplied measurements against the S1 KPI universe.
//
// Success shape (deep-frozen):
//   {
//     ok: true,
//     data_untrusted: true,                 // measurements are caller-side data
//     scorecard: {
//       groupId: <string|null>,             // the scoped group, or null (all)
//       entries: [                          // one per universe KPI, doc order
//         { kpiId, group, status: "measured", value }  // measurement supplied
//         | { kpiId, group, status: "missing" }         // no measurement
//       ],
//       findings: [                         // every missing KPI, doc order
//         { kpiId, status: "missing" }      // a missing measurement is a
//       ]                                   // FINDING, never an invented zero
//     }
//   }
//
// Denial shape (deep-frozen): { ok: false, code, message } with `code` drawn
// from SCORECARD_DENY_CODES. Denies atomically on the first offending
// measurement — no partial scorecard is ever returned.
export function assembleScorecard(input) {
  // Phase A — ATOMIC SNAPSHOT: capture every consulted input field first.
  const top = snapshotInput(input);
  if (!top.ok) {
    return deny(
      "DENY_SCORECARD_MALFORMED",
      "input must be an object with an array `measurements` field"
    );
  }
  const snaps = top.measurements.map(snapshotMeasurement);

  // Phase B — EVALUATION: bind to the captured snapshots only; no further
  // input reads occur past this point.

  // Resolve the KPI universe from the registry (never invented here). Absent
  // groupId (undefined) => full 24-KPI catalog; any supplied groupId is
  // validated verbatim by the registry.
  let universe;
  let scopedGroupId;
  if (top.groupId === undefined) {
    universe = KPI_CATALOG;
    scopedGroupId = null;
  } else {
    const scoped = listKpisByGroup({ groupId: top.groupId });
    if (!scoped.ok) {
      return deny(
        "DENY_GROUP_UNKNOWN",
        "groupId, when supplied, must be one of the four doctrine KPI groups"
      );
    }
    universe = scoped.kpis;
    scopedGroupId = scoped.group.id;
  }
  const universeIds = new Set(universe.map((kpi) => kpi.id));

  // Classify every measurement snapshot; deny atomically on the first defect.
  const measuredValues = new Map();
  for (let index = 0; index < snaps.length; index += 1) {
    const snap = snaps[index];
    if (!snap.ok) {
      return deny("DENY_SCORECARD_MALFORMED", `measurements[${index}]: ${snap.detail}`);
    }
    if (!isUsableId(snap.kpiId)) {
      return deny(
        "DENY_SCORECARD_MALFORMED",
        `measurements[${index}].kpiId must be a non-blank string without null bytes`
      );
    }
    if (!isFiniteNumber(snap.value)) {
      return deny(
        "DENY_SCORECARD_MALFORMED",
        `measurements[${index}].${valueDefect(snap.value)}`
      );
    }
    if (!universeIds.has(snap.kpiId)) {
      // Own-membership miss: uncataloged, out-of-scope, or a prototype key
      // (registry N1). Never coerced, never dropped.
      return deny(
        "DENY_KPI_UNKNOWN",
        `measurements[${index}].kpiId "${snap.kpiId}" is not a KPI in this scorecard's universe`
      );
    }
    if (measuredValues.has(snap.kpiId)) {
      return deny(
        "DENY_SCORECARD_MALFORMED",
        `measurements[${index}].kpiId "${snap.kpiId}" is a duplicate measurement`
      );
    }
    measuredValues.set(snap.kpiId, snap.value);
  }

  // Assemble entries (one per universe KPI, doc order) and findings (every
  // universe KPI with no measurement, doc order). A missing measurement is a
  // finding — never an invented value, never a silent zero.
  const entries = [];
  const findings = [];
  for (const kpi of universe) {
    if (measuredValues.has(kpi.id)) {
      entries.push({ kpiId: kpi.id, group: kpi.group, status: "measured", value: measuredValues.get(kpi.id) });
    } else {
      entries.push({ kpiId: kpi.id, group: kpi.group, status: "missing" });
      findings.push({ kpiId: kpi.id, status: "missing" });
    }
  }

  return deepFreeze({
    ok: true,
    data_untrusted: true,
    scorecard: {
      groupId: scopedGroupId,
      entries,
      findings
    }
  });
}
