// MOD-WSPACE Slice S2 — Overlap-class (O0–O5) evaluator (PURE, UNWIRED).
//
// Purpose (G5 from mod-wspace-gap-assessment-001): give `src/` a single pure,
// frozen, deny-by-default codification of the parallel-execution doctrine's
// overlap ladder — classify the relationship between TWO declared workspace
// write sets into one of O0..O5 and return the doctrine's mandated control.
// Today that ladder exists only as DRAFT prose in
// `docs/12-execution/06-parallel-execution.md` ("Overlap policy" table); nothing
// in code classifies two write sets into an O-class or names the control.
//
// Scope discipline: pure function over data passed in by the caller. No I/O, no
// clock, no persistence, no transport, no filesystem read, no scheduler wiring.
// NOTHING consumes this evaluator in this slice — adoption by any live dispatch,
// reservation, or lease-granting path is a later, separately governed step
// (assessment §5 #4, #5, #7; §7). This is a doctrine-codifying classifier, not a
// gate: a classifiable input always yields `{ ok: true, overlapClass, control }`.
//
// Boundary rulings honored:
//   B-reuse — path OVERLAP between the two write sets is decided by REUSING the
//        ratified S1 primitive `evaluateWriteSet` from
//        src/control/write-set-policy.mjs (containment / prefix / traversal /
//        absolute / canonical-grammar semantics), read-only. This module does
//        NOT reimplement path logic; write-set-policy.mjs is imported unmodified
//        and pinned byte-for-byte by a byte-identity guard test vs main @ c52db71,
//        and a parity test proves this module's overlap decision agrees with an
//        independent containment oracle so the reuse cannot silently drift.
//   B1 — does NOT re-validate any work-package contract shape (that is MOD-WORK's
//        work-package-service.mjs); operates one plane down over concrete
//        candidate write sets supplied by the caller.
//   No wiring — mirrors the S1 posture: overlap classification does not touch
//        mcp-gateway-core.mjs, work-package-service.mjs,
//        context-federation-service.mjs, handoff-service.mjs, or state-machine.mjs.
//
// House style: result objects. Deny-by-default on any malformed / unclassifiable
// input; every return value is a deep-frozen `{ ok: true, overlapClass, control,
// overlap }` or `{ ok: false, code, message }`.
//
// Atomic-snapshot discipline (ratified house standard, MANDATORY): ALL consulted
// input fields are snapshotted atomically BEFORE any evaluation. The six fields
// are destructured from `input` EXACTLY ONCE (each property [[Get]] invoked once);
// the two write-set arrays are copied via a single-pass, single-read-per-element
// snapshotArray that rejects tampered iterators WITHOUT invoking them; the four
// doctrine scalars are read once each into locals. No accessor is invoked more
// than once, so a getter on a writeSetA element can never influence writeSetB's
// classification (cross-array TOCTOU closed by construction). Any throw from a
// hostile getter / Proxy trap / element accessor is contained and converted to
// the frozen DENY_OVERLAP_MALFORMED result — it never propagates.
//
// Audit-before-effect (holds by construction): the evaluator's decision record
// IS its returned frozen result; it has no side effect of its own, so a caller
// necessarily observes the class + control before it could act on it.

import { evaluateWriteSet } from "./write-set-policy.mjs";

// --- Doctrine O-ladder, verbatim from parallel-execution.md "Overlap policy" ---
// The `overlap` and `control` strings below are copied VERBATIM from the doc's
// table cells; a doc-parity test parses the actual markdown at runtime and
// asserts byte-for-byte agreement, so any drift between code and doctrine fails
// the suite (mirrors MOD-GOV S2's risk-registry doc-parity discipline).
export const OVERLAP_CLASSES = Object.freeze({
  O0: Object.freeze({ overlap: "Separate modules/files", control: "Parallel" }),
  O1: Object.freeze({ overlap: "Same module, separate files/symbols", control: "Declared ownership" }),
  O2: Object.freeze({ overlap: "Same file, separate regions", control: "Reservation and conflict forecast" }),
  O3: Object.freeze({ overlap: "Same symbol/API/schema", control: "Variant or serialize" }),
  O4: Object.freeze({ overlap: "Lockfile/migration/generated/global config", control: "Single writer" }),
  O5: Object.freeze({ overlap: "Protected branch/release/prod config", control: "Serialized and human authorized" })
});

// Ordered most-permissive → most-restrictive; exported so callers can compare
// severities without re-deriving the ladder.
export const OVERLAP_ORDER = Object.freeze(["O0", "O1", "O2", "O3", "O4", "O5"]);

// The full closed set of deny codes this evaluator can emit, frozen so callers
// may switch on it without risk of silent drift.
//   DENY_OVERLAP_MALFORMED      — contained extraction: input not a plain object,
//                                 a write set is not a genuine array, a hostile
//                                 accessor / Proxy trap threw, or a write-set path
//                                 is rejected by the reused write-set-policy path
//                                 grammar (traversal / absolute / non-canonical /
//                                 blank / null-byte). Path logic is delegated, not
//                                 reimplemented.
//   DENY_OVERLAP_EMPTY          — doctrine-mandated: the "Required lane contract"
//                                 lists a "declared write set" as a required lane
//                                 input; an empty writeSetA or writeSetB violates
//                                 that contract, so overlap cannot be assessed.
//   DENY_OVERLAP_UNKNOWN_CLASS  — fail-closed: a doctrine classification dimension
//                                 (sameModule / sameSymbol / protectedBranch /
//                                 globalConfig) is absent or not a strict boolean,
//                                 so the O-ladder cannot assign a class. The most
//                                 permissive class (O0/Parallel) is NEVER reached
//                                 by omission — the caller must explicitly answer
//                                 every non-derivable dimension.
export const OVERLAP_DENY_CODES = Object.freeze([
  "DENY_OVERLAP_MALFORMED",
  "DENY_OVERLAP_EMPTY",
  "DENY_OVERLAP_UNKNOWN_CLASS"
]);

// --- Fail-closed array extraction (atomic-snapshot house standard) -----------
// Identical discipline to write-set-policy.mjs's snapshotArray, kept local here
// because that helper is intentionally not exported (the S1 primitive exposes
// only evaluateWriteSet). This snapshot copies the caller's array once into a
// fresh own-data array so no later step can re-trigger a hostile accessor; it is
// snapshot discipline, NOT path logic (path logic is reused via evaluateWriteSet).
const NOT_ARRAY = Symbol("overlap-not-array");
// Canonical array iterator captured at module load, before any hostile input can
// be constructed. Compared by identity to reject arrays whose Symbol.iterator was
// overridden, WITHOUT ever invoking it.
const ARRAY_ITERATOR = Array.prototype[Symbol.iterator];

function snapshotArray(value) {
  if (!Array.isArray(value)) return NOT_ARRAY;
  if (value[Symbol.iterator] !== ARRAY_ITERATOR) return NOT_ARRAY;
  const len = value.length;
  if (!Number.isSafeInteger(len) || len < 0) return NOT_ARRAY;
  const out = new Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = value[i];
  }
  return out;
}

const deny = (code, message) => Object.freeze({ ok: false, code, message });
const allow = (overlapClass) =>
  Object.freeze({
    ok: true,
    overlapClass,
    control: OVERLAP_CLASSES[overlapClass].control,
    overlap: OVERLAP_CLASSES[overlapClass].overlap
  });

// Path-overlap probe, REUSING the S1 primitive read-only. Two canonical
// repository-relative paths "overlap" iff one is equal to or a prefix-ancestor of
// the other (they would touch the same file or the same subtree). Both directions
// are tested with evaluateWriteSet's containment semantics; no prefix/subset logic
// is reimplemented here.
const within = (path, bound) =>
  evaluateWriteSet({ candidatePaths: [path], allowedPaths: [bound], prohibitedPaths: [] }).ok;

const pathsOverlap = (a, b) => within(a, b) || within(b, a);

const writeSetsOverlap = (snapA, snapB) =>
  snapA.some((a) => snapB.some((b) => pathsOverlap(a, b)));

// Validate a write set through the reused S1 primitive: a set is always a subset
// of itself, so evaluateWriteSet(set, allowed=set) returns ok for a well-formed,
// non-empty, canonical set, and surfaces write-set-policy's own deny codes
// otherwise. Returns null on success, or a mapped overlap denial.
function validateWriteSet(snap, label) {
  const res = evaluateWriteSet({ candidatePaths: snap, allowedPaths: snap, prohibitedPaths: [] });
  if (res.ok) return null;
  if (res.code === "DENY_WRITE_SET_EMPTY") {
    return deny("DENY_OVERLAP_EMPTY", `${label} is an empty declared write set`);
  }
  // Every other write-set-policy denial (malformed / traversal / absolute /
  // non-canonical) means the path grammar the classifier depends on is violated.
  return deny("DENY_OVERLAP_MALFORMED", `${label} contains a path the write-set grammar rejects`);
}

// Most-restrictive-wins ladder over the doctrine dimensions. Order is the doctrine
// order O5 > O4 > O3 > O2 > O1 > O0; a contradictory input (e.g. sameSymbol asserted
// with no path overlap) escalates to the MORE restrictive class rather than a
// permissive one — deny-by-default extended to classification.
function classify(filesOverlap, sameModule, sameSymbol, protectedBranch, globalConfig) {
  if (protectedBranch) return "O5"; // Protected branch/release/prod config
  if (globalConfig) return "O4";    // Lockfile/migration/generated/global config
  if (sameSymbol) return "O3";      // Same symbol/API/schema
  if (filesOverlap) return "O2";    // Same file, separate regions (path overlap, reused)
  if (sameModule) return "O1";      // Same module, separate files/symbols
  return "O0";                      // Separate modules/files
}

const isBool = (v) => typeof v === "boolean";

// evaluateOverlap({ writeSetA, writeSetB, sameModule, sameSymbol, protectedBranch, globalConfig })
//   -> Object.freeze({ ok: true, overlapClass, control, overlap })
//   -> Object.freeze({ ok: false, code, message })
//
// Doctrine dimensions:
//   writeSetA / writeSetB — required non-empty arrays of canonical, repo-relative
//     paths. File-level OVERLAP between them (the O2 "same file" signal) is DERIVED
//     by reusing write-set-policy containment — never a caller flag.
//   sameModule      — required boolean. Same module but no shared file → O1.
//     ("Module" needs a module map, not derivable from raw paths → caller answers.)
//   sameSymbol      — required boolean. Same symbol/API/schema → O3.
//   globalConfig    — required boolean. Target is lockfile/migration/generated/
//     global-config class → O4 (single writer).
//   protectedBranch — required boolean. Protected branch/release/prod config → O5.
//
// Check precedence (most structural first):
//   1. input not a plain object                       -> DENY_OVERLAP_MALFORMED
//   2. hostile/unreadable fields (contained)          -> DENY_OVERLAP_MALFORMED
//   3. writeSetA / writeSetB not genuine arrays        -> DENY_OVERLAP_MALFORMED
//   4. empty writeSetA / writeSetB (doctrine)         -> DENY_OVERLAP_EMPTY
//   5. write-set path grammar violation (reused)      -> DENY_OVERLAP_MALFORMED
//   6. non-boolean / missing doctrine dimension       -> DENY_OVERLAP_UNKNOWN_CLASS
//   else                                              -> ok + O-class + control
function evaluateOverlapInternal(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return deny("DENY_OVERLAP_MALFORMED", "input must be a plain object");
  }

  // ATOMIC SNAPSHOT: destructure every consulted field EXACTLY ONCE, then copy the
  // two arrays defensively. A throwing getter / Proxy trap / element accessor lands
  // in the catch below and becomes the frozen malformed denial. No Reflect.ownKeys
  // presence-probe is needed: a missing field reads as undefined and is rejected by
  // the array-shape or boolean-type checks, so omission can never silently pass.
  let writeSetA, writeSetB, sameModule, sameSymbol, protectedBranch, globalConfig;
  try {
    ({ writeSetA, writeSetB, sameModule, sameSymbol, protectedBranch, globalConfig } = input);
    writeSetA = snapshotArray(writeSetA);
    writeSetB = snapshotArray(writeSetB);
  } catch {
    return deny("DENY_OVERLAP_MALFORMED", "input could not be safely inspected");
  }

  if (writeSetA === NOT_ARRAY || writeSetB === NOT_ARRAY) {
    return deny("DENY_OVERLAP_MALFORMED", "writeSetA and writeSetB must both be arrays");
  }

  // Validate each write set through the reused S1 primitive (empty / grammar).
  const denyA = validateWriteSet(writeSetA, "writeSetA");
  if (denyA) return denyA;
  const denyB = validateWriteSet(writeSetB, "writeSetB");
  if (denyB) return denyB;

  // Fail-closed on any non-derivable doctrine dimension that is absent or not a
  // strict boolean — the O-ladder cannot be evaluated without a definite answer.
  if (!isBool(sameModule) || !isBool(sameSymbol) || !isBool(protectedBranch) || !isBool(globalConfig)) {
    return deny(
      "DENY_OVERLAP_UNKNOWN_CLASS",
      "sameModule, sameSymbol, protectedBranch and globalConfig must each be a boolean"
    );
  }

  const filesOverlap = writeSetsOverlap(writeSetA, writeSetB);
  const overlapClass = classify(filesOverlap, sameModule, sameSymbol, protectedBranch, globalConfig);
  return allow(overlapClass);
}

// Outer belt-and-braces guard (defense in depth): the targeted extraction try/catch
// above already contains every known hostile-input throw, so this catch is expected
// to be unreachable — it exists so that ANY future throw introduced anywhere in the
// evaluator still degrades to the frozen malformed denial instead of propagating past
// the structured-denial boundary.
export function evaluateOverlap(input) {
  try {
    return evaluateOverlapInternal(input);
  } catch {
    return deny("DENY_OVERLAP_MALFORMED", "input could not be safely inspected");
  }
}
