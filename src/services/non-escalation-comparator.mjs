// P0-11 non-escalation comparator (GOV-P011-03, ratified: glob-prohibited,
// incomparable-denies). A ceiling is a tuple over ordered/lattice/set
// dimensions; a candidate ceiling is admissible only when it is <= the
// bounding ceiling on EVERY dimension. Any dimension that is missing,
// carries a value outside its frozen order, or cannot be compared yields
// a denial — incomparable IS escalation, fail-closed. Pure and
// data-driven so it is unit-testable in isolation.

export const RISK_ORDER = Object.freeze(["R0", "R1", "R2", "R3", "R4"]);
export const DATA_CLASS_ORDER = Object.freeze(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"]);

function ordered(order, candidate, bound) {
  const c = order.indexOf(candidate);
  const b = order.indexOf(bound);
  if (c === -1 || b === -1) return { ok: false, code: "DENY_ESCALATION_UNCOMPARABLE" };
  return c <= b ? { ok: true } : { ok: false, code: "DENY_ESCALATION" };
}

// Lexical containment identical to the V-002 rule: '..'-free, and each
// candidate path must sit inside some bound path (path === entry or
// startsWith(entry + '/')). '..' is uncomparable.
function pathSubset(candidatePaths, boundPaths) {
  const hasParent = (value) => value.split(/[\\/]/).includes("..");
  if (candidatePaths.some(hasParent) || boundPaths.some(hasParent)) {
    return { ok: false, code: "DENY_ESCALATION_UNCOMPARABLE" };
  }
  const bounds = boundPaths.map((p) => p.replace(/\/+$/, ""));
  for (const path of candidatePaths) {
    if (!bounds.some((entry) => path === entry || path.startsWith(`${entry}/`))) {
      return { ok: false, code: "DENY_ESCALATION" };
    }
  }
  return { ok: true };
}

// Exact-string subset; a glob is a widening device a subset check cannot
// bound, so any '*' in either set is uncomparable.
function exactSubset(candidate, bound) {
  if (candidate.some((v) => v.includes("*")) || bound.some((v) => v.includes("*"))) {
    return { ok: false, code: "DENY_ESCALATION_UNCOMPARABLE" };
  }
  const boundSet = new Set(bound);
  return candidate.every((v) => boundSet.has(v)) ? { ok: true } : { ok: false, code: "DENY_ESCALATION" };
}

const DIMENSIONS = ["riskClass", "dataClassification", "paths", "tools", "transitions"];

function validShape(ceiling) {
  if (!ceiling || typeof ceiling !== "object") return false;
  if (typeof ceiling.riskClass !== "string" || typeof ceiling.dataClassification !== "string") return false;
  return ["paths", "tools", "transitions"].every((k) => Array.isArray(ceiling[k]) && ceiling[k].every((v) => typeof v === "string"));
}

// candidate <= bound on every dimension. Returns { ok } or the first
// failing { ok:false, code, dimension }.
export function withinCeiling(candidate, bound) {
  if (!validShape(candidate) || !validShape(bound)) {
    return { ok: false, code: "DENY_ESCALATION_UNCOMPARABLE", dimension: "shape" };
  }
  const checks = {
    riskClass: () => ordered(RISK_ORDER, candidate.riskClass, bound.riskClass),
    dataClassification: () => ordered(DATA_CLASS_ORDER, candidate.dataClassification, bound.dataClassification),
    paths: () => pathSubset(candidate.paths, bound.paths),
    tools: () => exactSubset(candidate.tools, bound.tools),
    transitions: () => exactSubset(candidate.transitions, bound.transitions)
  };
  for (const dimension of DIMENSIONS) {
    const result = checks[dimension]();
    if (!result.ok) return { ok: false, code: result.code, dimension };
  }
  return { ok: true };
}

// Chain intersection: the effective ceiling of a hop is its requested
// ceiling narrowed to sit within the parent's recorded ceiling. Since
// withinCeiling already enforces candidate <= parent, the "intersection"
// at R1 is simply the requested ceiling once it passes — monotone
// non-increasing by construction (a hop can never recover dropped width).
export function intersectWithParent(requested, parentCeiling) {
  return withinCeiling(requested, parentCeiling);
}
