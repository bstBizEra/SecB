// MOD-GOV-S1 — Separation-of-duties (SoD) rule primitive.
//
// A single deny-by-default home for the SoD rule *shapes* that the SecB
// kernel and its services enforce today in four parallel places:
//
//   1. authority-engine.mjs (canonical): config-time conflicting-role pairs
//      over a scoped role set, and authorize-time actor-history exclusion
//      ("the producer may not review its own work", etc.).
//   2. work-package-service.mjs #serviceAuthorize: a mirror that reuses the
//      same conflicting-pairs check (via its internal AuthorityEngine) and a
//      service-edge role-gate map with no actor-history ladder.
//   3. handoff-service.mjs SoD-at-acceptance: an actor-history ladder over an
//      independence-bearing destination role, plus "source may not accept its
//      own handoff".
//   4. capability-registry-service.mjs (branch bst/mcp-registry-broker-
//      integration): promotion needs an independent_review actor *distinct*
//      from the record producer, plus a governance actor — a pairwise-distinct
//      shape expressed in a divergent role vocabulary (independent_review/
//      governance instead of REV/GOV).
//
// This module expresses all four as configurations of four shared, pure
// primitives:
//
//   - normalizeRole()            : role-alias vocabulary map
//   - checkConflictingRoles()    : conflicting-role-pairs check
//   - checkProhibitedActors()    : prohibited-actor ladder (actor-history)
//   - checkPairwiseDistinct()    : pairwise-distinct actor sets
//
// Every primitive is a pure function returning a structured result:
//   { ok: true }
//   { ok: false, code, message, ...detail }
// matching the house deny-by-default style. This module owns no state, reads
// no I/O, and changes NO service behavior in this slice: only authority-engine
// delegates to it (behavior-preservingly). The other three call sites are
// migrated under their own review cycles later — the config-equivalence tests
// in tests/sod-rules.test.mjs demonstrate their shapes are expressible here.

// --- Role-alias vocabulary -------------------------------------------------
//
// Canonical SecB role tokens are their own identity. Divergent vocabularies
// (today: the capability-registry promotion gate) declare aliases here so a
// later adoption slice can normalize without changing any kernel semantics.

export const CANONICAL_ROLES = Object.freeze([
  "ENGIN",
  "REV",
  "QA",
  "GOV",
  "SKILL_PRODUCER",
  "SKILL_PUBLISHER",
  "EVIDENCE_PRODUCER",
  "EVIDENCE_VERIFIER",
  "EVIDENCE_ACCEPTOR",
  "PRODUCER"
]);

export const ROLE_ALIASES = Object.freeze({
  independent_review: "REV",
  independent_reviewer: "REV",
  reviewer: "REV",
  governance: "GOV",
  producer: "PRODUCER"
});

// Case-folded lookup table built once at module load: every CANONICAL_ROLES
// member and every ROLE_ALIASES key, keyed by its trimmed-lowercase form, so
// "REV", "Rev", "rev", and " rev " all resolve identically. This mirrors the
// established convention elsewhere in this codebase for identity comparison
// (runtime-registry.mjs normalizeIdentifierForComparison: trim + case-fold)
// but deliberately narrower: NO Unicode (NFC) normalization is applied here,
// so confusable-but-distinct code points are never silently accepted as
// equivalent — a role token must fold to an ASCII-recognizable known alias or
// canonical token, or it is rejected outright.
const ROLE_LOOKUP = Object.freeze(
  Object.fromEntries([
    ...CANONICAL_ROLES.map((canonical) => [canonical.toLowerCase(), canonical]),
    ...Object.entries(ROLE_ALIASES).map(([alias, canonical]) => [alias.toLowerCase(), canonical])
  ])
);

// Normalize an external role token to its canonical SecB role.
// Folds case and trims surrounding whitespace BEFORE alias/canonical lookup,
// so near-miss spellings ("Rev", "REV ", "rev") all resolve identically
// instead of silently defeating the ladder checks downstream.
// Deny-by-default: a non-string / empty / all-whitespace token, OR a token
// that does not resolve (after folding) to a known alias or a member of
// CANONICAL_ROLES, normalizes to null (no role) — callers must treat null as
// "unknown role" rather than a permissive default. Unrecognized near-miss
// tokens are never passed through unchanged.
export function normalizeRole(role) {
  if (typeof role !== "string") return null;
  const trimmed = role.trim();
  if (trimmed.length === 0) return null;
  return ROLE_LOOKUP[trimmed.toLowerCase()] ?? null;
}

// --- Conflicting-role pairs ------------------------------------------------
//
// The canonical set of mutually-exclusive roles a single scoped actor may not
// simultaneously hold. Value-identical to authority-engine's historical
// CONFLICTING_ROLES; owned here so every SoD site shares one source of truth.

export const CONFLICTING_ROLE_PAIRS = Object.freeze([
  Object.freeze(["ENGIN", "REV"]),
  Object.freeze(["REV", "QA"]),
  Object.freeze(["QA", "GOV"]),
  Object.freeze(["SKILL_PRODUCER", "SKILL_PUBLISHER"]),
  Object.freeze(["EVIDENCE_PRODUCER", "EVIDENCE_ACCEPTOR"])
]);

// Deny if the given role collection contains any conflicting pair.
//
// roles   : iterable | Set of role tokens.
// options : { pairs = CONFLICTING_ROLE_PAIRS, normalize = false }.
//           normalize=true maps aliases before comparison.
//
// Returns { ok: true } when no conflict, else
// { ok: false, code: "SOD_ROLE_CONFLICT", message, pair: [left, right] }.
// The `pair` lets callers reproduce a scope-prefixed message verbatim.
export function checkConflictingRoles(roles, { pairs = CONFLICTING_ROLE_PAIRS, normalize = false } = {}) {
  let set;
  try {
    set = roles instanceof Set ? new Set(roles) : new Set(roles ?? []);
  } catch {
    return { ok: false, code: "DENY_MALFORMED_ROLES", message: "roles must be iterable" };
  }
  const applied = normalize ? new Set([...set].map(normalizeRole)) : set;
  const conflict = pairs.find(([left, right]) => applied.has(left) && applied.has(right));
  if (conflict) {
    return {
      ok: false,
      code: "SOD_ROLE_CONFLICT",
      message: `combines conflicting roles ${conflict.join("/")}`,
      pair: [...conflict]
    };
  }
  return { ok: true };
}

// --- Prohibited-actor ladder (actor-history exclusion) ---------------------
//
// For a target role, exclude any actor who previously held a "prior role" that
// the target role must stay independent from. The ladder maps a role to the
// list of prior-role keys whose actors are prohibited; the history object maps
// each prior-role key to an actor id or a list of actor ids.
//
// AUTHORIZE_TIME_LADDER reproduces authority-engine.authorize() exactly:
//   REV               -> producer must differ
//   QA                -> producer, reviewer must differ
//   GOV               -> producer, reviewer, qa, evidenceVerifier must differ
//   EVIDENCE_ACCEPTOR -> producer, reviewer, qa, evidenceVerifier must differ
//   (any other role)  -> no exclusion
//
// A role absent from the ladder yields no prohibition — matching the canonical
// engine, where roles such as ENGIN carry no actor-history SoD. Deny-by-default
// still governs *inputs*: a non-string actorId or role denies as malformed.

export const AUTHORIZE_TIME_LADDER = Object.freeze({
  REV: Object.freeze(["producer"]),
  QA: Object.freeze(["producer", "reviewer"]),
  GOV: Object.freeze(["producer", "reviewer", "qa", "evidenceVerifier"]),
  EVIDENCE_ACCEPTOR: Object.freeze(["producer", "reviewer", "qa", "evidenceVerifier"])
});

// handoff-service SoD-at-acceptance, expressed as a ladder configuration:
//   REV -> executors; QA -> executors + reviewer; GOV -> executors + reviewer
//   + qa; and every independence role additionally excludes the source actor.
export const HANDOFF_ACCEPTANCE_LADDER = Object.freeze({
  REV: Object.freeze(["source", "executors"]),
  QA: Object.freeze(["source", "executors", "reviewer"]),
  GOV: Object.freeze(["source", "executors", "reviewer", "qa"])
});

function collectProhibited(keys, history) {
  const prohibited = new Set();
  for (const key of keys) {
    const value = history?.[key];
    if (Array.isArray(value) || value instanceof Set) {
      for (const actor of value) if (actor) prohibited.add(actor);
    } else if (value) {
      prohibited.add(value);
    }
  }
  return prohibited;
}

// Deny if actorId is excluded from taking `role` by prior-role history.
//
// role    : target role token (already resolved to canonical vocabulary).
// actorId : the actor proposing to take the role.
// history : { <priorRoleKey>: actorId | actorId[] | Set<actorId> }.
// options : { ladder = AUTHORIZE_TIME_LADDER, code = "DENY_SOD" }.
//
// Returns { ok: true } when permitted, else
// { ok: false, code, message } with the canonical message shape.
export function checkProhibitedActors(role, actorId, history = {}, { ladder = AUTHORIZE_TIME_LADDER, code = "DENY_SOD" } = {}) {
  if (typeof role !== "string" || role.length === 0) {
    return { ok: false, code: "DENY_MALFORMED_ROLES", message: "role must be a non-empty string" };
  }
  if (typeof actorId !== "string" || actorId.length === 0) {
    return { ok: false, code: "DENY_MALFORMED_ACTOR", message: "actorId must be a non-empty string" };
  }
  const keys = ladder[role] ?? [];
  const prohibited = collectProhibited(keys, history);
  if (prohibited.has(actorId)) {
    return { ok: false, code, message: `Separation of duties prohibits actor ${actorId} from role ${role}` };
  }
  return { ok: true };
}

// --- Pairwise-distinct actor sets ------------------------------------------
//
// Deny if any two of the supplied (role -> actor) assignments name the same
// actor. Expresses the capability-registry promotion gate's "independent
// reviewer must differ from the producer" self-approval check, and any future
// multi-party gate requiring mutually distinct signers.
//
// actors  : array of actor id strings, or array of { role, actorId } entries.
//           Falsy actor ids are skipped (absent parties impose no constraint).
// options : { code = "DENY_SOD_NOT_DISTINCT" }.
//
// Returns { ok: true } when all present actors are distinct, else
// { ok: false, code, message, actorId, roles }.
export function checkPairwiseDistinct(actors, { code = "DENY_SOD_NOT_DISTINCT" } = {}) {
  let entries;
  try {
    entries = [...(actors ?? [])];
  } catch {
    return { ok: false, code: "DENY_MALFORMED_ACTOR", message: "actors must be iterable" };
  }
  const seen = new Map();
  for (const entry of entries) {
    const actorId = typeof entry === "string" ? entry : entry?.actorId;
    const role = typeof entry === "string" ? null : entry?.role ?? null;
    if (!actorId) continue;
    if (seen.has(actorId)) {
      const priorRole = seen.get(actorId);
      return {
        ok: false,
        code,
        message: `Separation of duties requires distinct actors; ${actorId} appears more than once`,
        actorId,
        roles: [priorRole, role].filter((value) => value !== null)
      };
    }
    seen.set(actorId, role);
  }
  return { ok: true };
}
