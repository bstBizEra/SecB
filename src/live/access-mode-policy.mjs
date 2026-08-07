// MOD-LIVE Slice S2 (closes gap G2 in
// docs/03-project-control/candidates/mod-live-gap-assessment-001.md,
// bst/mod-live-assessment): access-mode authorization ladder EVALUATOR.
// PURE + UNWIRED.
//
// This module is a DECISION EVALUATOR, not an actuator. `evaluateAccessRequest`
// answers exactly one question — "is a request for access mode X authorized,
// given a claimed grant of mode Y (and, where the doctrine demands it, an
// explicit authorization or a risk class that carries no human-approval
// requirement)". Nothing in this file reads a ledger, touches the filesystem,
// reads a clock, mints a grant, mutates a session, or is wired into any live
// path.
//
// HARD BOUNDARY (assessment B5 / non-goal #2): this evaluator DECIDES
// authorization only. It performs NO intervention ACTUATION. Actually pausing,
// steering, controlling, or emergency-halting a live session mutates
// `STATE_MACHINES.Session` via `TransitionEngine` — a live authority path that
// is R3/R4, operator-gated. This module deliberately does NOT import
// `src/control/state-machine.mjs`, `src/control/transition-engine.mjs`, or any
// live/session/gateway path (assessment B5); it is wired to nothing. Adoption
// is later, separately-governed work (assessment §5 #5).
//
// AUTHORITATIVE SOURCES (verbatim codification, doc-parity enforced by
// tests/access-mode-policy.test.mjs — a three-way parity mirroring LIVE-S1):
//   1. The six-mode access ladder and each mode's capability:
//      docs/05-live-operations/intervention-and-replay.md
//      (SECB-LIVE-CONTROL-001) "## Access Modes" table, codified 1:1 in the
//      doc's own row order.
//   2. The same ladder as an ordered arrow sequence:
//      docs/17-operations/01-live-operations.md "## Human access modes"
//      (`Observe → Annotate → Approve → Steer → Control → Emergency`).
//      The doc-parity fixtures parse BOTH docs at test runtime and assert
//      code ↔ table ↔ arrow agree, so drift in either doc fails the suite
//      (mirrors MOD-LIVE S1 / MOD-GOV S2 / MOD-WSPACE S2 doc-parity
//      discipline).
//   3. The doctrine-mandated explicit-authorization gate for the two
//      writable/destructive modes:
//      docs/17-operations/01-live-operations.md — verbatim: "Writable
//      terminal control and emergency intervention require explicit
//      authorization and are fully audited." ("Writable terminal control" =
//      the Control mode, capability "Enter terminal or runtime input";
//      "emergency intervention" = the Emergency mode). The per-mode
//      `requiresExplicitAuthorization` flag is DERIVED from this phrase and
//      the phrase is doc-parity pinned, so any doctrine drift fails the suite.
//      The general rule "Each higher mode requires separate authority"
//      (intervention-and-replay.md) is enforced by the ladder check itself:
//      a request for a mode never resolves unless the claimed grant reaches
//      at least that mode's rank.
//
// FAIL-CLOSED EXTRACTION (mandatory house lesson, WSPACE-S1): every property
// read off the caller-supplied request is a SINGLE contained read inside
// try/catch, guarded by `Object.hasOwn` (prototype-key smuggling ignored) —
// a hostile getter, Proxy trap, or poisoned object yields the structured
// malformed denial, never a throw, and can never return one value to a guard
// and another to the body.
//
// RISK-REGISTRY COMPOSITION (approval-binding precedent, byte-identical
// parity pin): when the doctrine's explicit-authorization gate applies and a
// `riskClass` is supplied, this evaluator composes
// `risk-registry.riskProfile(riskClass).humanApproval` to short-circuit the
// gate when — and ONLY when — the named risk class carries an EXPLICIT
// `humanApproval === false` (that class of work requires no human-approval
// gate, so the additional explicit attestation is waived). EVERY other case
// is deny-by-default and falls through to require an explicit
// `explicitAuthorization === true` attestation on the request: an unknown
// risk class, `humanApproval === true`, an absent/undefined `humanApproval`,
// or no `riskClass` at all. This is the exact inverse-safe reading
// `approval-binding.verifyApprovalBinding` uses ("anything other than an
// explicit false requires the gate"). `risk-registry.mjs` is imported
// READ-ONLY and left byte-identical (no edit); its R0-R4 `humanApproval`
// table is the single source of truth this module parity-pins against.
//
// House style (matches `event-family-policy.mjs`, `risk-registry.mjs`,
// `approval-binding.mjs`): structured denials { ok: false, code, message },
// deny-by-default on malformed/unknown/insufficient input, deep-frozen
// outputs, no I/O, no clock.

import { riskProfile } from "../control/risk-registry.mjs";

// --- Deny codes -------------------------------------------------------------

// The request is structurally unusable: input not a plain object, a required
// mode key not an own property (prototype-key smuggling), a mode value that
// is not a non-blank string free of null bytes, or a contained extraction
// threw (hostile getter / Proxy trap).
export const DENY_ACCESS_MODE_MALFORMED = "DENY_ACCESS_MODE_MALFORMED";

// A mode value is a well-formed string but is not one of the six
// SECB-LIVE-CONTROL-001 access modes. Deny-by-default: this evaluator never
// guesses, lowercases, or maps an unknown token onto a nearby mode.
export const DENY_ACCESS_MODE_UNKNOWN = "DENY_ACCESS_MODE_UNKNOWN";

// The requested mode ranks ABOVE the claimed granted mode on the ladder —
// the request would escalate beyond the granted authority.
export const DENY_ACCESS_ESCALATION = "DENY_ACCESS_ESCALATION";

// Doctrine-mandated (source 3): the requested mode requires explicit
// authorization ("Writable terminal control and emergency intervention
// require explicit authorization") and neither the risk-class short-circuit
// (a class whose humanApproval is explicit-false) nor an explicit
// `explicitAuthorization === true` attestation is present.
export const DENY_ACCESS_AUTHORIZATION_REQUIRED = "DENY_ACCESS_AUTHORIZATION_REQUIRED";

// --- Doctrine data (verbatim; doc-parity enforced) --------------------------

// The six SECB-LIVE-CONTROL-001 access modes, in the doctrine's own ladder
// order (rank = array index, Observe(0) … Emergency(5)). `capability` is the
// verbatim right-hand cell of the "## Access Modes" table.
// `requiresExplicitAuthorization` is DERIVED from the verbatim phrase
// "Writable terminal control and emergency intervention require explicit
// authorization" (docs/17-operations/01-live-operations.md); the phrase is
// doc-parity pinned and the derivation asserted, so drift on either side
// fails the suite.
export const ACCESS_MODES = Object.freeze([
  Object.freeze({
    mode: "Observe",
    capability: "View events, terminal, diff, tests, and evidence",
    requiresExplicitAuthorization: false
  }),
  Object.freeze({
    mode: "Annotate",
    capability: "Add signed comments/findings",
    requiresExplicitAuthorization: false
  }),
  Object.freeze({
    mode: "Approve",
    capability: "Approve or reject a pending bounded action",
    requiresExplicitAuthorization: false
  }),
  Object.freeze({
    mode: "Steer",
    capability: "Send a governed message to the agent",
    requiresExplicitAuthorization: false
  }),
  Object.freeze({
    mode: "Control",
    capability: "Enter terminal or runtime input",
    requiresExplicitAuthorization: true
  }),
  Object.freeze({
    mode: "Emergency",
    capability: "Pause, terminate, quarantine, revoke, or isolate",
    requiresExplicitAuthorization: true
  })
]);

// Ordered mode names — the ladder. Rank is the index in this frozen array.
export const ACCESS_MODE_ORDER = Object.freeze(ACCESS_MODES.map((entry) => entry.mode));

// --- Internals --------------------------------------------------------------

// U+0000. Built via fromCharCode so no raw control byte lives in this file.
const NULL_BYTE = String.fromCharCode(0);

function deny(code, message) {
  return Object.freeze({ ok: false, code, message });
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Resolve a caller-supplied mode token to its ladder rank, or a typed denial.
// Deny-by-default: non-string / blank / null-byte -> MALFORMED; well-formed
// but not a ladder mode -> UNKNOWN (never guessed).
function resolveModeRank(value, label) {
  if (typeof value !== "string") {
    return deny(DENY_ACCESS_MODE_MALFORMED, `${label} must be a string`);
  }
  if (value.trim().length === 0) {
    return deny(DENY_ACCESS_MODE_MALFORMED, `${label} must not be empty or blank`);
  }
  if (value.includes(NULL_BYTE)) {
    return deny(DENY_ACCESS_MODE_MALFORMED, `${label} must not contain null bytes`);
  }
  const rank = ACCESS_MODE_ORDER.indexOf(value);
  if (rank === -1) {
    // Deny-by-default: exact, case-sensitive match only. "observe", "OBSERVE",
    // and any unmapped token are UNKNOWN, never coerced to a nearby mode.
    return deny(
      DENY_ACCESS_MODE_UNKNOWN,
      `${label} "${value}" is not one of the SECB-LIVE-CONTROL-001 access modes`
    );
  }
  return { ok: true, rank };
}

// --- evaluateAccessRequest --------------------------------------------------

// Pure authorization-ladder EVALUATOR (assessment G2). Input:
//   { requestedMode, grantedMode, riskClass?, explicitAuthorization? }
//
//   requestedMode           — the access mode being requested (required).
//   grantedMode             — the access mode the caller claims to hold
//                             (required). Represents the "separate authority"
//                             the doctrine requires for each higher mode.
//   riskClass?              — optional R-class of the work; consulted ONLY for
//                             a mode whose `requiresExplicitAuthorization` is
//                             true. If the class carries an EXPLICIT
//                             `humanApproval === false` (risk-registry), the
//                             explicit-authorization gate is satisfied without
//                             an attestation (approval-binding precedent).
//   explicitAuthorization? — optional strict boolean; the ONLY value that
//                             satisfies the doctrine gate for a gated mode
//                             absent the risk-class short-circuit is the
//                             literal `true`. Any other value fails closed.
//
// Returns Object.freeze({ ok: true, mode, rank, grantedMode, grantedRank,
//   requiresExplicitAuthorization, authorizationSatisfiedBy }) on allow, or
// Object.freeze({ ok: false, code, message }) on deny-by-default. Never
// throws. Mints nothing, mutates nothing, is wired to nothing (B5).
//
// `authorizationSatisfiedBy` on an allow is one of:
//   "not-required"           — the mode does not require explicit
//                              authorization (Observe..Steer).
//   "risk-class-no-human-gate" — a gated mode whose supplied riskClass has
//                              humanApproval === false short-circuited.
//   "explicit-authorization" — a gated mode allowed by explicit
//                              `explicitAuthorization === true`.
export function evaluateAccessRequest(input) {
  if (!isPlainObject(input)) {
    return deny(DENY_ACCESS_MODE_MALFORMED, "input must be a plain object carrying requestedMode and grantedMode");
  }

  let requestedMode;
  let grantedMode;
  let riskClass;
  let explicitAuthorization;
  try {
    if (!Object.hasOwn(input, "requestedMode") || !Object.hasOwn(input, "grantedMode")) {
      // Prototype-key smuggling: inherited requestedMode/grantedMode are not
      // accepted; both must be own properties.
      return deny(DENY_ACCESS_MODE_MALFORMED, "requestedMode and grantedMode must be own properties of the input");
    }
    // SINGLE contained read of each consulted property (fail-closed
    // extraction, WSPACE-S1). Optional fields are honoured only as own
    // properties; inherited riskClass/explicitAuthorization are ignored.
    requestedMode = input.requestedMode;
    grantedMode = input.grantedMode;
    riskClass = Object.hasOwn(input, "riskClass") ? input.riskClass : undefined;
    explicitAuthorization = Object.hasOwn(input, "explicitAuthorization") ? input.explicitAuthorization : undefined;
  } catch {
    return deny(DENY_ACCESS_MODE_MALFORMED, "access-request extraction failed (hostile accessor contained)");
  }

  const requested = resolveModeRank(requestedMode, "requestedMode");
  if (!requested.ok) return requested;
  const granted = resolveModeRank(grantedMode, "grantedMode");
  if (!granted.ok) return granted;

  // Ladder check: requested must not exceed granted. This enforces the
  // doctrine's "Each higher mode requires separate authority" — the claimed
  // grant must reach at least the requested mode's rank.
  if (requested.rank > granted.rank) {
    return deny(
      DENY_ACCESS_ESCALATION,
      `requested mode "${requestedMode}" (rank ${requested.rank}) exceeds granted mode "${grantedMode}" (rank ${granted.rank})`
    );
  }

  const requiresExplicitAuthorization = ACCESS_MODES[requested.rank].requiresExplicitAuthorization;

  let authorizationSatisfiedBy = "not-required";
  if (requiresExplicitAuthorization) {
    // Doctrine gate (source 3). Compose risk-registry FIRST: an explicit
    // humanApproval===false class waives the attestation. Everything else is
    // deny-by-default and must carry `explicitAuthorization === true`.
    const profile = riskProfile(riskClass);
    if (profile.ok && profile.value.humanApproval === false) {
      authorizationSatisfiedBy = "risk-class-no-human-gate";
    } else if (explicitAuthorization === true) {
      authorizationSatisfiedBy = "explicit-authorization";
    } else {
      return deny(
        DENY_ACCESS_AUTHORIZATION_REQUIRED,
        `requested mode "${requestedMode}" requires explicit authorization; supply explicitAuthorization === true or a riskClass whose humanApproval is false`
      );
    }
  }

  return Object.freeze({
    ok: true,
    mode: requestedMode,
    rank: requested.rank,
    grantedMode,
    grantedRank: granted.rank,
    requiresExplicitAuthorization,
    authorizationSatisfiedBy
  });
}
