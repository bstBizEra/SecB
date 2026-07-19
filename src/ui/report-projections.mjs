// SecB shared classification floor — reused by every output plane (P0-17
// display, MCP invocation). Never reimplemented; import this module.
//
// GOV-P017-02 + GOV-MCP-05: effective ceiling = min(server config, caller
// max_data_classification), default INTERNAL, exact-match lattice,
// unknown classification -> RESTRICTED (withheld).

export const CLASSIFICATION_LEVELS = Object.freeze({
  PUBLIC: 0,
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  RESTRICTED: 3,
});

export const CLASSIFICATION_NAMES = Object.freeze(
  Object.fromEntries(Object.entries(CLASSIFICATION_LEVELS).map(([k, v]) => [v, k]))
);

// Returns numeric level; unknown strings map to RESTRICTED (highest) so
// they are withheld at any ceiling below RESTRICTED.
export function classificationLevel(classification) {
  const level = CLASSIFICATION_LEVELS[classification];
  return level !== undefined ? level : CLASSIFICATION_LEVELS.RESTRICTED;
}

// Returns the lower of two classification strings (i.e. less permissive ceiling).
export function minCeiling(a, b) {
  return classificationLevel(a) <= classificationLevel(b) ? a : b;
}

// True iff entryClassification is at or below the ceiling.
export function isWithinCeiling(entryClassification, ceiling) {
  return classificationLevel(entryClassification) <= classificationLevel(ceiling);
}

// Apply classification floor to an array of entries that each carry a
// `classification` field. Returns { entries, withheld_count, truncated }.
export function applyClassificationFloor(entries, ceiling) {
  const allowed = [];
  let withheld = 0;
  for (const entry of entries) {
    if (isWithinCeiling(entry.classification ?? "RESTRICTED", ceiling)) {
      allowed.push(entry);
    } else {
      withheld++;
    }
  }
  return {
    entries: allowed,
    withheld_count: withheld,
    truncated: withheld > 0,
  };
}
