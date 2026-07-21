// MOD-LIVE Slice S1 (closes gap G1 in
// docs/03-project-control/candidates/mod-live-gap-assessment-001.md,
// bst/mod-live-assessment): event-family classifier + envelope-doctrine
// conformance evaluator. PURE + UNWIRED.
//
// This module is an EVALUATOR, not an enforcer. `classifyEventType` answers
// exactly one question — "which SECB-LIVE-EVENT-001 family does this
// event_type belong to" — and `assessEnvelopeConformance` answers exactly one
// question — "which doctrine-required envelope elements are absent from this
// supplied event". Nothing in this file reads a ledger, touches the
// filesystem, reads a clock, validates the live closed schema, or is wired
// into `HostRuntimeAgent`, `EventLedger`, `contract-validator`, or any live
// path. Adoption is later, separately-governed work (assessment §5 #5).
//
// Boundary rulings honoured (assessment §3):
//   B3 — operates over the event_type taxonomy only; never classifies,
//        wraps, or touches evidence envelopes.
//   B6 — one plane ABOVE `contract-validator`'s `eventEnvelope` shape check:
//        given an already-well-formed event, classify its family and surface
//        conformance FINDINGS for doctrine elements the minimal 13-field
//        live schema does not yet require. It must not re-validate, replace,
//        or widen `contracts/event-envelope.schema.json` (widening is R3,
//        assessment §5 #4/#6).
//
// AUTHORITATIVE SOURCE (verbatim codification, doc-parity enforced by
// tests/event-family-policy.test.mjs):
//   - The 19 event families: docs/05-live-operations/event-envelope.md
//     (SECB-LIVE-EVENT-001) "Event Families" fenced list, codified 1:1 in
//     order. The doc-parity fixture test parses that fenced block at test
//     runtime and fails the suite on any drift (mirrors MOD-GOV S2
//     `risk-registry` / MOD-RUNTIME S2 `retry-policy` doc-parity
//     discipline).
//   - The doctrine-required envelope elements assessed for conformance:
//     the same doc's "Requirements" bullets, restricted to the elements the
//     minimal live schema (`contracts/event-envelope.schema.json`, 13
//     required fields) does NOT carry — the exact subset gap the assessment
//     names in G1: trace/span identifiers, sequence, prior-event hash,
//     observed-fact/provider-assertion/inference classification,
//     content-capture level, redaction status, evidence-candidate flag.
//
// FAIL-CLOSED EXTRACTION (mandatory house lesson, WSPACE-S1): every property
// read off a caller-supplied input is a SINGLE contained read inside
// try/catch — a hostile getter, Proxy trap, or poisoned object yields the
// structured malformed denial, never a throw, and can never return one value
// to a guard and another to the body (there is only one read).
//
// House style (matches `risk-registry.mjs`, `retry-policy.mjs`,
// `report-projections.mjs`): structured denials { ok: false, code, message },
// deny-by-default on malformed/unknown input, deep-frozen outputs.

// --- Deny codes -------------------------------------------------------------

// event_type is structurally unusable: input not a plain object, eventType
// not an own property (prototype-key smuggling), not a string, blank,
// contains a null byte, not a dotted `<family>.<name>` type, or the
// contained extraction itself threw (hostile getter / Proxy trap).
export const DENY_EVENT_TYPE_MALFORMED = "DENY_EVENT_TYPE_MALFORMED";

// event_type is well-formed but its dotted family prefix is not in the
// SECB-LIVE-EVENT-001 family set. Deny-by-default: this classifier never
// guesses a family for an unmapped type.
export const DENY_EVENT_FAMILY_UNKNOWN = "DENY_EVENT_FAMILY_UNKNOWN";

// The supplied envelope is not assessable: not a plain object, or a
// contained property probe/read threw (hostile getter / Proxy trap).
export const DENY_EVENT_ENVELOPE_MALFORMED = "DENY_EVENT_ENVELOPE_MALFORMED";

// --- Doctrine data (verbatim; doc-parity enforced) --------------------------

// The 19 SECB-LIVE-EVENT-001 event families, in the doc's own order. Each
// entry is the family prefix; the doc writes them as `<family>.*`.
export const EVENT_FAMILIES = Object.freeze([
  "session",
  "workflow",
  "conversation",
  "agent",
  "subagent",
  "delegation",
  "tool",
  "command",
  "terminal",
  "file",
  "git",
  "test",
  "security",
  "policy",
  "approval",
  "evidence",
  "checkpoint",
  "cost",
  "incident"
]);

// Doctrine-required envelope elements ABSENT from the minimal live schema
// (`contracts/event-envelope.schema.json` requires only: event_id, version,
// project_id, work_package_id, session_id, actor_id, event_type, occurred_at,
// observed_fact, source, idempotency_key, classification, content_hash — and
// is a CLOSED contract, additionalProperties:false, so a schema-valid minimal
// event cannot carry any of the elements below; the assessor will surface
// every one of them as a finding, which is exactly the G1 subset gap).
//
// `element` is the doctrine element name normalized to snake_case (no field
// with this name exists in the live schema — see above). `doctrine` is the
// verbatim phrase from the SECB-LIVE-EVENT-001 "Requirements" bullet that
// names the element (doc-parity enforced: the test asserts each phrase is
// present in the doc).
export const DOCTRINE_CONFORMANCE_ELEMENTS = Object.freeze([
  Object.freeze({
    element: "trace_id",
    code: "MISSING_TRACE_ID",
    doctrine: "trace and span identifiers"
  }),
  Object.freeze({
    element: "span_id",
    code: "MISSING_SPAN_ID",
    doctrine: "trace and span identifiers"
  }),
  Object.freeze({
    element: "sequence",
    code: "MISSING_SEQUENCE",
    doctrine: "server timestamp, and sequence"
  }),
  Object.freeze({
    element: "prior_event_hash",
    code: "MISSING_PRIOR_EVENT_HASH",
    doctrine: "payload hash, prior-event hash, and signature reference"
  }),
  Object.freeze({
    element: "fact_classification",
    code: "MISSING_FACT_CLASSIFICATION",
    doctrine: "observed fact/provider assertion/inference classification"
  }),
  Object.freeze({
    element: "content_capture_level",
    code: "MISSING_CAPTURE_LEVEL",
    doctrine: "data classification and content-capture level"
  }),
  Object.freeze({
    element: "redaction_status",
    code: "MISSING_REDACTION_STATUS",
    doctrine: "redaction status and evidence-candidate flag"
  }),
  Object.freeze({
    element: "evidence_candidate",
    code: "MISSING_EVIDENCE_CANDIDATE_FLAG",
    doctrine: "redaction status and evidence-candidate flag"
  })
]);

// --- Internals --------------------------------------------------------------

// U+0000. Built via fromCharCode so no raw control byte lives in this file.
const NULL_BYTE = String.fromCharCode(0);

function deny(code, message) {
  return Object.freeze({ ok: false, code, message });
}

function isPlainAssessableObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// --- classifyEventType ------------------------------------------------------

// Pure classifier. Input: `{ eventType }` (a caller-supplied object carrying
// the event_type string — the same value the live schema stores in
// `event_type`). Returns:
//   Object.freeze({ ok: true, family })            — family is one of
//                                                    EVENT_FAMILIES;
//   Object.freeze({ ok: false, code, message })    — deny-by-default.
//
// Never throws. Never guesses: an unmapped type is DENY_EVENT_FAMILY_UNKNOWN,
// not a best-effort family.
export function classifyEventType(input) {
  let eventType;
  try {
    if (!isPlainAssessableObject(input)) {
      return deny(DENY_EVENT_TYPE_MALFORMED, "input must be a plain object carrying eventType");
    }
    if (!Object.hasOwn(input, "eventType")) {
      // Prototype-key smuggling: an inherited eventType is not accepted.
      return deny(DENY_EVENT_TYPE_MALFORMED, "eventType must be an own property of the input");
    }
    // SINGLE contained read (fail-closed extraction, WSPACE-S1 lesson).
    ({ eventType } = input);
  } catch {
    return deny(DENY_EVENT_TYPE_MALFORMED, "eventType extraction failed (hostile accessor contained)");
  }

  if (typeof eventType !== "string") {
    return deny(DENY_EVENT_TYPE_MALFORMED, "eventType must be a string");
  }
  if (eventType.trim().length === 0) {
    return deny(DENY_EVENT_TYPE_MALFORMED, "eventType must not be empty or blank");
  }
  if (eventType.includes(NULL_BYTE)) {
    return deny(DENY_EVENT_TYPE_MALFORMED, "eventType must not contain null bytes");
  }

  const dot = eventType.indexOf(".");
  if (dot <= 0 || dot === eventType.length - 1) {
    // Not a well-formed `<family>.<name>` dotted type (no dot, leading dot,
    // or trailing dot with an empty name part).
    return deny(DENY_EVENT_TYPE_MALFORMED, "eventType must be a dotted <family>.<name> type");
  }

  const family = eventType.slice(0, dot);
  if (!EVENT_FAMILIES.includes(family)) {
    // Deny-by-default: never map an unknown prefix onto a nearby family.
    return deny(DENY_EVENT_FAMILY_UNKNOWN, `event family "${family}" is not in the SECB-LIVE-EVENT-001 family set`);
  }

  return Object.freeze({ ok: true, family });
}

// --- assessEnvelopeConformance ----------------------------------------------

// Pure ASSESSOR (not a validator, not a gate — B6). Given a caller-supplied
// event envelope, returns the doctrine-conformance findings for every
// doctrine-required element (DOCTRINE_CONFORMANCE_ELEMENTS) that is ABSENT
// from the event. Findings are advisory DATA, not denials: a minimal
// schema-valid event is `ok: true` with eight findings — that is the G1
// subset gap being surfaced, not an error.
//
//   Object.freeze({ ok: true, findings })          — findings is a frozen
//     array of Object.freeze({ element, code, status: "absent", note });
//   Object.freeze({ ok: false, code, message })    — only for a malformed
//     (non-assessable) envelope input; never a throw.
//
// Presence rule: an element counts as present only when it is an OWN
// property (prototype smuggling ignored) with a non-null, non-undefined
// value. Each element is probed with one `Object.hasOwn` and at most ONE
// contained property read (fail-closed extraction; invocation count of any
// getter is exactly 1). The event is never mutated.
export function assessEnvelopeConformance(envelope) {
  const findings = [];
  try {
    if (!isPlainAssessableObject(envelope)) {
      return deny(DENY_EVENT_ENVELOPE_MALFORMED, "envelope must be a plain object");
    }
    for (const spec of DOCTRINE_CONFORMANCE_ELEMENTS) {
      let present = false;
      if (Object.hasOwn(envelope, spec.element)) {
        // SINGLE contained read of the element value.
        const value = envelope[spec.element];
        present = value !== undefined && value !== null;
      }
      if (!present) {
        findings.push(
          Object.freeze({
            element: spec.element,
            code: spec.code,
            status: "absent",
            note: `SECB-LIVE-EVENT-001 requires "${spec.doctrine}"; the supplied event does not carry ${spec.element}.`
          })
        );
      }
    }
  } catch {
    return deny(DENY_EVENT_ENVELOPE_MALFORMED, "envelope assessment failed (hostile accessor contained)");
  }
  return Object.freeze({ ok: true, findings: Object.freeze(findings) });
}
