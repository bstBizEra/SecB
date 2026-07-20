// P0-10 retrieval policy (GOV-P010 frozen artifact): the SECB-OM-CONTEXT-001
// seven-stage order as an ordered, subtractive, fail-closed pipeline. Stages
// 1-5 remove sources; stage 6 reorders only; stage 7 removes only. No stage
// may add, widen, or upgrade an item excluded by an earlier stage. Every
// stage records what it excluded so the receipt's exclusions metadata proves
// compaction was subtractive. Pure and unit-testable in isolation.
//
// A candidate source is { ref, projectId, classification, verified,
// current (not superseded/stale), resolvable, relevance }.

const CLASS_ORDER = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"];

function classAtOrBelow(classification, ceiling) {
  const c = CLASS_ORDER.indexOf(classification);
  const b = CLASS_ORDER.indexOf(ceiling);
  return c !== -1 && b !== -1 && c <= b;
}

// Returns { included: [refs...], exclusions: [{ ref, stage, reason }...] }.
// Deterministic: stable order preserved except stage 6's relevance reorder.
export function runRetrieval(candidates, { projectId, classificationCeiling, minimumSufficient = Infinity }) {
  const exclusions = [];
  let pool = candidates.slice();
  const drop = (stage, predicateFails, reason) => {
    pool = pool.filter((s) => {
      if (predicateFails(s)) { exclusions.push({ ref: s.ref, stage, reason }); return false; }
      return true;
    });
  };

  // 1 project scope
  drop("project-scope", (s) => s.projectId !== projectId, "not bound to project");
  // 2 authority filter (classification ceiling)
  drop("authority-filter", (s) => !classAtOrBelow(s.classification, classificationCeiling), "exceeds authority classification");
  // 3 temporal / current-state
  drop("temporal", (s) => s.current !== true, "superseded or stale");
  // 4 verification status
  drop("verification", (s) => s.verified !== true, "unverified");
  // 5 exact source evidence (must be resolvable)
  drop("exact-source", (s) => s.resolvable !== true, "source reference does not resolve");

  // 6 relevance rank: REORDER ONLY (stable desc by relevance, no removal)
  pool = pool
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (b.s.relevance ?? 0) - (a.s.relevance ?? 0) || a.i - b.i)
    .map((x) => x.s);

  // 7 minimum-sufficient: REMOVE ONLY (keep the top N, record the tail)
  if (pool.length > minimumSufficient) {
    for (const s of pool.slice(minimumSufficient)) {
      exclusions.push({ ref: s.ref, stage: "minimum-sufficient", reason: "beyond minimum-sufficient cutoff" });
    }
    pool = pool.slice(0, minimumSufficient);
  }

  return { included: pool.map((s) => s.ref), exclusions };
}
