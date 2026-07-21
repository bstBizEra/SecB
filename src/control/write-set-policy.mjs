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
//        (DENY_SCOPE_WIDENING) VERBATIM. That source is not modified; a
//        byte-identity guard test pins it, and a config-equivalence parity test
//        proves this matcher agrees with it on a shared fixture table so the two
//        cannot drift.
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

// --- Semantics reused VERBATIM from context-federation-service.mjs:43-48 ------
// `pathSubset` there does: reject any candidate with a `..` segment (split on
// either separator), strip trailing forward-slashes from each bound, and accept
// a path iff it equals a bound or sits under `${bound}/`. These three helpers
// are that exact logic, factored so the distinct deny codes below can name which
// clause failed while remaining bit-for-bit equivalent to the source matcher.
const hasParentSegment = (p) => p.split(/[\\/]/).includes("..");
const stripTrailingSlashes = (bound) => bound.replace(/\/+$/, "");
const withinBound = (p, bounds) =>
  bounds.map(stripTrailingSlashes).some((e) => p === e || p.startsWith(`${e}/`));

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
//   6. any prohibited-prefix hit      -> DENY_WRITE_SET_PROHIBITED  (wins over allowed)
//   7. any path outside allowed set   -> DENY_WRITE_SET_OUTSIDE_ALLOWED
//   else                              -> ok
export function evaluateWriteSet(input) {
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

  for (const p of candidatePaths) {
    if (hasParentSegment(p)) {
      return deny("DENY_WRITE_SET_TRAVERSAL", `candidate path escapes via '..': ${p}`);
    }
  }
  for (const p of candidatePaths) {
    if (isAbsolute(p)) {
      return deny("DENY_WRITE_SET_ABSOLUTE", `absolute path not permitted: ${p}`);
    }
  }
  for (const p of candidatePaths) {
    if (withinBound(p, prohibitedPaths)) {
      return deny("DENY_WRITE_SET_PROHIBITED", `candidate path is within a prohibited prefix: ${p}`);
    }
  }
  for (const p of candidatePaths) {
    if (!withinBound(p, allowedPaths)) {
      return deny("DENY_WRITE_SET_OUTSIDE_ALLOWED", `candidate path is outside the allowed set: ${p}`);
    }
  }
  return ALLOW;
}
