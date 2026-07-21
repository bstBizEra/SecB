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

// --- Fail-closed extraction (REV-002 containment) ---------------------------
// A sentinel returned by snapshotArray for anything that is not a genuine,
// untampered array. It is compared by identity only; it is never emitted.
const NOT_ARRAY = Symbol("write-set-not-array");
// The canonical array iterator captured once at module load, before any hostile
// input can be constructed. snapshotArray compares against this to reject arrays
// whose Symbol.iterator has been overridden, WITHOUT ever invoking it.
const ARRAY_ITERATOR = Array.prototype[Symbol.iterator];

// Defensive, single-read snapshot of a field into a fresh own-data array.
//   - Gates on Array.isArray so array-likes / Proxies-of-non-arrays are rejected.
//   - Rejects a tampered iterator (any override of the default array iterator) as
//     malformed rather than trusting OR invoking it, so a poisoned Symbol.iterator
//     cannot execute. The read of `value[Symbol.iterator]` happens here; a THROWING
//     iterator getter propagates to the extraction guard below (-> denial).
//   - Reads length once and each index exactly once via [[Get]] (no iterator
//     protocol, no element read repeated). A throwing length/index accessor or a
//     Proxy get trap likewise propagates to the guard and becomes a denial.
// Returns NOT_ARRAY for a non-array/tampered/degenerate-length input, or a plain
// snapshot array otherwise. May throw ONLY into the extraction try/catch.
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

// --- Windows component-collapse hazard (Claude REV N1) ----------------------
// A path component that ends in a space or a dot is normalized away by the
// Windows filesystem — e.g. "foo." -> "foo", "foo " -> "foo", ".. " -> "..",
// "..." -> "" / current-dir — so the literal string the evaluator validates can
// resolve on disk to a DIFFERENT target than the one it checked (the ".. "
// -> ".." case is a parent escape). The exact canonical dot-segments "." and ".."
// are excluded here because they are not name-collapse aliases: ".." is handled by
// the traversal check as DENY_WRITE_SET_TRAVERSAL, and "." is a benign current-dir
// ref. Every other trailing-space/dot component is a non-canonical, caller-
// precondition-violating path and is treated as malformed input (see rationale in
// the DENY code choice below). Repeated-separator ("//") and interior "./" alias
// bypasses (Codex REV-001) are closed by the canonical-grammar check below, which
// runs over the SAME plain-string snapshots after this check.
const isCanonicalDotSegment = (seg) => seg === "." || seg === "..";
const endsWithSpaceOrDot = (seg) => seg.endsWith(" ") || seg.endsWith(".");
const hasWindowsCollapsibleComponent = (p) =>
  p.split(/[\\/]/).some(
    (seg) => seg.length > 0 && !isCanonicalDotSegment(seg) && endsWithSpaceOrDot(seg)
  );

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
//   2. hostile/unreadable fields      -> DENY_WRITE_SET_MALFORMED  (contained, never thrown; Codex REV-002)
//   3. empty candidate set            -> DENY_WRITE_SET_EMPTY
//   4. malformed path entries         -> DENY_WRITE_SET_MALFORMED
//   5. Windows-collapsible component  -> DENY_WRITE_SET_MALFORMED  (Claude REV N1)
//   6. any `..` traversal segment     -> DENY_WRITE_SET_TRAVERSAL  (all three lists)
//   7. any absolute / drive / UNC     -> DENY_WRITE_SET_ABSOLUTE   (all three lists)
//   8. non-canonical path alias       -> DENY_WRITE_SET_MALFORMED  (all three lists; Codex REV-001)
//   9. any prohibited-prefix hit      -> DENY_WRITE_SET_PROHIBITED  (wins over allowed; case-fold safe)
//  10. any path outside allowed set   -> DENY_WRITE_SET_OUTSIDE_ALLOWED
//   else                              -> ok
//
// FAIL-CLOSED EXTRACTION (Codex REV-002): the three fields are destructured from
// `input` EXACTLY ONCE and each is snapshotted into a fresh own-data array inside
// a single try/catch, BEFORE any validation logic runs. A throwing property
// getter, a Proxy get/has trap that throws, a throwing array-element accessor
// (Object.defineProperty on an index), or a poisoned Symbol.iterator can never
// propagate an exception out of this function — each is converted to the frozen
// DENY_WRITE_SET_MALFORMED result. No accessor is invoked more than once, so a
// getter that returns a different array on repeated reads cannot influence the
// decision: only the single snapshot is ever consulted. Containment runs FIRST:
// every later step — including the REV-001 canonical-grammar check — operates
// only on the plain-string snapshot copies, never on caller-controlled objects.
function evaluateWriteSetInternal(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return deny("DENY_WRITE_SET_MALFORMED", "input must be a plain object");
  }

  let candidatePaths, allowedPaths, prohibitedPaths;
  try {
    // Each property getter is invoked exactly once here, into a local.
    ({ candidatePaths, allowedPaths, prohibitedPaths } = input);
    // Snapshot defensively (single read per element, no iterator protocol) so no
    // later step can re-trigger a hostile accessor.
    candidatePaths = snapshotArray(candidatePaths);
    allowedPaths = snapshotArray(allowedPaths);
    prohibitedPaths = snapshotArray(prohibitedPaths);
  } catch {
    // Any throw from a hostile getter / Proxy trap / iterator accessor lands here.
    // Message unified with the outer belt-and-braces guard (Lane B) so hostile
    // inputs are indistinguishable by which containment layer caught them.
    return deny(
      "DENY_WRITE_SET_MALFORMED",
      "input could not be safely inspected"
    );
  }

  if (candidatePaths === NOT_ARRAY || allowedPaths === NOT_ARRAY || prohibitedPaths === NOT_ARRAY) {
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

  // Claude REV N1: reject non-canonical components a Windows filesystem would
  // collapse (trailing space/dot) as malformed input. Chose DENY_WRITE_SET_MALFORMED
  // over DENY_WRITE_SET_TRAVERSAL deliberately: (a) the offending string is not a
  // literal `..` segment (".. " !== ".."), so classing it as TRAVERSAL would
  // overload that code and diverge from the context-federation `pathSubset`
  // semantics the parity/byte-identity guards pin; (b) it is fundamentally a
  // caller-precondition / well-formedness violation (a non-OS-canonical path),
  // which is exactly the malformed-input class alongside blank/null-byte entries.
  for (const p of candidatePaths) {
    if (hasWindowsCollapsibleComponent(p)) {
      return deny(
        "DENY_WRITE_SET_MALFORMED",
        `candidate path has a component a Windows filesystem would collapse (trailing space or dot): ${p}`
      );
    }
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

// Outer belt-and-braces guard (Lane B, REV-002 defense in depth): the targeted
// extraction try/catch above already contains every known hostile-input throw,
// so this catch is expected to be unreachable — it exists so that ANY future
// throw introduced anywhere in the evaluator still degrades to the frozen
// malformed denial instead of propagating past the structured-denial boundary.
export function evaluateWriteSet(input) {
  try {
    return evaluateWriteSetInternal(input);
  } catch {
    return deny("DENY_WRITE_SET_MALFORMED", "input could not be safely inspected");
  }
}
