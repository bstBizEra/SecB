// MOD-WSPACE Slice S1 — Write-set containment evaluator (PURE, UNWIRED).
//
// Purpose (G1 from mod-wspace-gap-assessment-001): give `src/` a single pure,
// frozen, deny-by-default answer to "does this concrete candidate write set
// (the actual files a producer intends to touch) stay inside an already-effective
// work package's allowed_paths and clear of its prohibited_paths?". Today the
// write set exists only as declared contract data (work-package.schema.json
// allowed_paths / prohibited_paths) and three document-plane subset checks;
// nothing takes an actual candidate file list and returns a fail-closed
// allow/deny at the mutation plane.
//
// Scope discipline: pure function over data passed in by the caller. No I/O, no
// clock, no persistence, no transport, no filesystem read. NOTHING consumes this
// evaluator in this slice — adoption by work-package-service / context-federation
// / handoff / gateway is a later, separately governed step (assessment §5 #4).
//
// Boundary rulings honored:
//   B1 — does NOT re-validate contract shape (that is MOD-WORK's
//        work-package-service.mjs:398-405); operates one plane down over a
//        concrete candidate write set supplied by the caller.
//   B3 — reuses the SAME subset/traversal semantics as
//        src/services/context-federation-service.mjs:43-48 `pathSubset`
//        (DENY_SCOPE_WIDENING) for canonical repository-relative paths. That
//        source is not modified; a byte-identity guard test pins it, and a
//        config-equivalence parity test proves agreement on its valid domain.
//        This mutation-plane evaluator additionally denies non-canonical aliases
//        (`.` segments, repeated separators, and backslashes) before comparison.
//
// House style: result objects. Deny-by-default on any malformed input; every
// return value is a deep-frozen `{ ok: true }` or `{ ok: false, code, message }`.
//
// Audit-before-effect (holds by construction): the evaluator's decision record
// IS its returned frozen result; it has no side effect of its own, so a caller
// necessarily observes the decision before it could act on it.

// The full closed set of deny codes this evaluator can emit, frozen so callers
// may switch on it without risk of silent drift.
export const WRITE_SET_DENY_CODES = Object.freeze([
  "DENY_WRITE_SET_EMPTY",
  "DENY_WRITE_SET_MALFORMED",
  "DENY_WRITE_SET_TRAVERSAL",
  "DENY_WRITE_SET_ABSOLUTE",
  "DENY_WRITE_SET_PROHIBITED",
  "DENY_WRITE_SET_OUTSIDE_ALLOWED"
]);

const NULL_BYTE = "\0";
const isNonBlankString = (v) => typeof v === "string" && v.length > 0;
const isCleanEntry = (v) => isNonBlankString(v) && !v.includes(NULL_BYTE);

// --- Semantics reused from context-federation-service.mjs:43-48 ---------------
// `pathSubset` there does: reject any candidate with a `..` segment (split on
// either separator), strip trailing forward-slashes from each bound, and accept
// a path iff it equals a bound or sits under `${bound}/`. The helpers below keep
// that behavior on canonical inputs while applying one lexical grammar to both
// candidates and bounds before either prohibited or allowed matching occurs.
const hasParentSegment = (p) => p.split(/[\\/]/).includes("..");
const stripTrailingSlashes = (bound) => bound.replace(/\/+$/, "");
const withinBound = (p, bounds) =>
  bounds.some((e) => p === e || p.startsWith(`${e}/`));

const canonicalizePath = (p) => {
  const canonical = stripTrailingSlashes(p);
  if (canonical.length === 0 || canonical.includes("\\") || canonical.normalize("NFC") !== canonical) return null;
  const segments = canonical.split("/");
  if (segments.some((segment) =>
    segment === "" ||
    segment === "." ||
    segment.trim() !== segment ||
    segment.endsWith(".") ||
    segment.includes(":"))) return null;
  return canonical;
};

const canonicalizePaths = (paths) => {
  const canonical = [];
  for (const path of paths) {
    const normalized = canonicalizePath(path);
    if (normalized === null) return null;
    canonical.push(normalized);
  }
  return canonical;
};

// Absolute escape: a POSIX/UNC leading separator (`/x`, `\x`, `\\server`,
// `//server`) OR a Windows drive-letter prefix (`C:`, `c:/x`, `C:\x`). Any of
// these would resolve outside the repo-relative allowed set, so they are denied
// before prefix containment is even considered.
const isAbsolute = (p) => /^(?:[/\\]|[A-Za-z]:)/.test(p);

const ALLOW = Object.freeze({ ok: true });
const deny = (code, message) => Object.freeze({ ok: false, code, message });

const allEntriesClean = (list) => list.every(isCleanEntry);

// evaluateWriteSet({ candidatePaths, allowedPaths, prohibitedPaths })
//   -> Object.freeze({ ok: true })
//   -> Object.freeze({ ok: false, code, message })
//
// Deny-by-default: a malformed shape never coerces to a permissive default.
// Check precedence (most structural first; prohibited beats allowed):
//   1. malformed input shape          -> DENY_WRITE_SET_MALFORMED
//   2. empty candidate set            -> DENY_WRITE_SET_EMPTY
//   3. malformed path entries         -> DENY_WRITE_SET_MALFORMED
//   4. any `..` traversal segment     -> DENY_WRITE_SET_TRAVERSAL
//   5. any absolute / drive / UNC     -> DENY_WRITE_SET_ABSOLUTE
//   6. non-canonical path alias       -> DENY_WRITE_SET_MALFORMED
//   7. any prohibited-prefix hit      -> DENY_WRITE_SET_PROHIBITED  (wins over allowed)
//   8. any path outside allowed set   -> DENY_WRITE_SET_OUTSIDE_ALLOWED
//   else                              -> ok
function evaluateWriteSetInternal(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return deny("DENY_WRITE_SET_MALFORMED", "input must be a plain object");
  }
  const { candidatePaths, allowedPaths, prohibitedPaths } = input;

  if (!Array.isArray(candidatePaths) || !Array.isArray(allowedPaths) || !Array.isArray(prohibitedPaths)) {
    return deny(
      "DENY_WRITE_SET_MALFORMED",
      "candidatePaths, allowedPaths and prohibitedPaths must all be arrays"
    );
  }
  if (candidatePaths.length === 0) {
    return deny("DENY_WRITE_SET_EMPTY", "candidate write set is empty");
  }
  if (!allEntriesClean(candidatePaths) || !allEntriesClean(allowedPaths) || !allEntriesClean(prohibitedPaths)) {
    return deny(
      "DENY_WRITE_SET_MALFORMED",
      "every path entry must be a non-blank string with no null byte"
    );
  }

  const allPaths = [...candidatePaths, ...allowedPaths, ...prohibitedPaths];
  for (const p of allPaths) {
    if (hasParentSegment(p)) {
      return deny("DENY_WRITE_SET_TRAVERSAL", `path escapes via '..': ${p}`);
    }
  }
  for (const p of allPaths) {
    if (isAbsolute(p)) {
      return deny("DENY_WRITE_SET_ABSOLUTE", `absolute path not permitted: ${p}`);
    }
  }

  const canonicalCandidates = canonicalizePaths(candidatePaths);
  const canonicalAllowed = canonicalizePaths(allowedPaths);
  const canonicalProhibited = canonicalizePaths(prohibitedPaths);
  if (canonicalCandidates === null || canonicalAllowed === null || canonicalProhibited === null) {
    return deny(
      "DENY_WRITE_SET_MALFORMED",
      "paths must use canonical repository-relative forward-slash form"
    );
  }

  const caseFoldedProhibited = canonicalProhibited.map((path) => path.toLowerCase());
  for (const p of canonicalCandidates) {
    if (withinBound(p, canonicalProhibited) || withinBound(p.toLowerCase(), caseFoldedProhibited)) {
      return deny("DENY_WRITE_SET_PROHIBITED", `candidate path is within a prohibited prefix: ${p}`);
    }
  }
  for (const p of canonicalCandidates) {
    if (!withinBound(p, canonicalAllowed)) {
      return deny("DENY_WRITE_SET_OUTSIDE_ALLOWED", `candidate path is outside the allowed set: ${p}`);
    }
  }
  return ALLOW;
}

export function evaluateWriteSet(input) {
  try {
    return evaluateWriteSetInternal(input);
  } catch {
    return deny("DENY_WRITE_SET_MALFORMED", "input could not be safely inspected");
  }
}
