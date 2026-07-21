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
// Presence rule: an element counts as present only when it is an OWN property
// (prototype smuggling ignored) with a non-null, non-undefined value.
//
// ATOMIC STRUCTURAL + DESCRIPTOR SNAPSHOT — closes the cross-field TOCTOU
// class across THREE distinct mechanisms:
//   N1 — a plain getter injecting/deleting a sibling KEY (closed:
//        MOD-LIVE-S1-TOCTOU-FIX-REV-001).
//   N2 — a Proxy `getOwnPropertyDescriptor`-trap side effect during a
//        per-field PRESENCE probe (closed: this file's prior revision).
//   N3 — the residual VALUE-mutation channel identified by the independent
//        review of that revision
//        (docs/03-project-control/candidates/mod-live-s1-atomic-snapshot-hardening-independent-review-001.md,
//        commit cc63e9a, PoC A-D): because a fixed, public field order
//        (DOCTRINE_CONFORMANCE_ELEMENTS) was walked reading each field's
//        VALUE fresh at its own turn, an EARLIER field's getter could mutate
//        a LATER, already-genuinely-present-or-absent sibling's stored VALUE
//        before that sibling's own read — fabricating or suppressing its
//        finding without touching key presence at all. Re-ordering the loop,
//        or merely splitting "read values" from "decide" into two passes
//        over the SAME live-property reads, does NOT close this: whichever
//        field is read last in ANY fixed sequence of `envelope[key]`
//        (`[[Get]]`) calls remains open to every earlier read's side effect,
//        no matter which pass consumes the result.
//
// The actual fix: presence is (unchanged) decided ONLY from the single
// upfront `Reflect.ownKeys(envelope)` structural Set (N1's injection/deletion
// guarantee is untouched — nothing below can add to or remove from that Set).
// VALUES are captured in a dedicated PHASE 1 that reads each present field's
// raw property DESCRIPTOR (`Object.getOwnPropertyDescriptor`), not its value,
// for every doctrine field, before ANY field's getter is invoked. For a plain
// (non-Proxy) object this phase executes ZERO user code — retrieving a
// property's descriptor never invokes its accessor `get` function, it only
// returns a reference to it (or the already-resolved `.value` for a data
// property) — so every sibling's descriptor is an inert, DETACHED snapshot
// object before any getter anywhere has had a chance to run. PHASE 2 then
// resolves each field's final value strictly from ITS OWN captured
// descriptor (`.value` for a data property; invoking the captured `.get`
// reference — never re-reading `envelope[key]` — for an accessor) and
// decides/pushes its finding immediately. Because every OTHER field's
// descriptor was already captured in Phase 1, invoking one field's getter in
// Phase 2 can mutate the live `envelope` all it wants — it cannot change what
// Phase 1 already captured for any sibling.
//
// WHAT IS AND IS NOT GUARANTEED (same honesty discipline as the L1 note this
// replaces):
//   - PLAIN object: Phase 1's descriptor reads run no user code at all, so
//     value capture is genuinely atomic/side-effect-free for every field
//     whose value is a plain data property, regardless of what any OTHER
//     field's getter later does in Phase 2. This is what closes the review's
//     PoC A, B, and D (plain-getter suppression, fabrication, and
//     inject/delete of a sibling) with certainty — no Proxy trap is even in
//     play for those three.
//   - PROXY, `get`-trap vector (review PoC C, honest-passthrough descriptor
//     traps): resolving a field's value via its captured descriptor's `.get`
//     reference — a direct function call, never `envelope[key]` again —
//     never re-invokes the Proxy's `get` trap machinery, so a hostile `get`
//     trap keyed to one field cannot reach a sibling's already-captured
//     descriptor.
//   - PROXY, HOSTILE `getOwnPropertyDescriptor`-trap vector (not demonstrated
//     by the independent review, which deliberately kept this trap honest to
//     isolate the `get`-trap vector in PoC C): Phase 1 issues one descriptor
//     call per PRESENT doctrine field, gated by the same immutable
//     Reflect.ownKeys Set N2 already fixed — key PRESENCE cannot be altered
//     by any of these calls under any circumstances. But if such a trap uses
//     ITS OWN invocation (for an earlier field) to delete a LATER, still-
//     unqueried sibling's underlying data, that sibling's own descriptor call
//     will legitimately come back `undefined` even though Reflect.ownKeys
//     said it was present moments earlier — a genuine snapshot/read
//     inconsistency. Rather than silently reporting that sibling as a false
//     MISSING finding (fail-safe but factually wrong), this function treats
//     any such presence/descriptor inconsistency as proof the input is
//     unstable under read and DENIES the whole assessment
//     (DENY_EVENT_ENVELOPE_MALFORMED) — the same fail-closed posture this
//     module already takes for any other hostile-accessor signal. No finding
//     is ever fabricated by this path.
//   The event is never mutated by this function.
//
// N4 — DISCLOSED, ACCEPTED, NON-BLOCKING WHILE THIS MODULE STAYS UNWIRED (see
// docs/03-project-control/candidates/mod-live-s1-toctou-class-scope-disposition-001.md
// for the full disposition; independent review
// docs/03-project-control/candidates/mod-live-s1-value-mutation-fix-independent-review-001.md
// found this against the N3 fix). Phase 1 itself walks doctrine fields
// ONE-AT-A-TIME (`for (const spec of DOCTRINE_CONFORMANCE_ELEMENTS)`), same as
// the vulnerable pre-N3 Phase 2 did. A hostile `getOwnPropertyDescriptor`
// trap fired for an EARLIER field can REDEFINE (not delete) a not-yet-visited
// sibling's descriptor before Phase 1's own loop reaches it — a fully silent
// forge that trips neither existing safety net (the key is still present per
// Reflect.ownKeys; the later descriptor call still returns a well-formed,
// non-undefined descriptor, just a poisoned one) — functionally identical to
// N3, one structural layer deeper.
//
// This is NOT a fixable-by-one-more-phase bug: reading N named properties off
// a genuinely adversarial Proxy can never be made atomic in the JS object
// model. Any per-field read this function could add (a "Phase 0" descriptor-
// of-descriptors, etc.) gives that same Proxy N sequential chances to observe
// how far the read has progressed and mutate whatever hasn't been visited
// yet — the vulnerability recurses one layer for every layer of indirection
// added to close it. Chasing N5, N6, ... would not converge.
//
// THE ACTUAL BOUNDARY: this residual is scoped OUT, not fixed, because it is
// only reachable when `envelope` is an adversarial Proxy — and this module is
// PURE + UNWIRED (see file header): no live caller currently supplies any
// envelope, adversarial or otherwise. Per the scope-disposition record cited
// above, wiring this module to ANY live/adversarial-input path is gated on
// first adding a structural admission check (e.g. requiring `envelope` to
// have passed through `JSON.parse`/`structuredClone` first, which can never
// produce a Proxy or an accessor property, making the entire N1-N4 class
// structurally unreachable rather than defended-against-recursively) — that
// gate is the wiring work's own responsibility, not a change to this PURE
// evaluator's contract.
export function assessEnvelopeConformance(envelope) {
  const findings = [];
  try {
    if (!isPlainAssessableObject(envelope)) {
      return deny(DENY_EVENT_ENVELOPE_MALFORMED, "envelope must be a plain object");
    }
    // ONE structural snapshot: the own-key set, captured in a single
    // Reflect.ownKeys call (one `ownKeys` trap invocation for a Proxy).
    // Presence is decided from this set alone; no later observation can change
    // which keys are considered own. (N1/N2 closure, unchanged.)
    const ownKeys = new Set(Reflect.ownKeys(envelope));

    // PHASE 1 — descriptor snapshot for every doctrine field the structural
    // set says is present. No getter is invoked here (see doc comment above):
    // this fully decouples every sibling's captured descriptor from whatever
    // any OTHER field's getter does once Phase 2 starts invoking them. A
    // descriptor that comes back `undefined` for a key Reflect.ownKeys just
    // confirmed present is a structural inconsistency (the object mutated
    // itself mid-snapshot) — fail closed rather than silently treat it as
    // absent.
    const descriptors = new Map();
    for (const spec of DOCTRINE_CONFORMANCE_ELEMENTS) {
      if (ownKeys.has(spec.element)) {
        const descriptor = Object.getOwnPropertyDescriptor(envelope, spec.element);
        if (!descriptor) {
          throw new Error(`structural inconsistency: ${spec.element} present at snapshot, vanished before descriptor read`);
        }
        descriptors.set(spec.element, descriptor);
      }
    }

    // PHASE 2 — resolve each field's value strictly from ITS OWN captured
    // descriptor and decide immediately. `envelope[key]` is never read here;
    // only a data descriptor's already-resolved `.value`, or a direct call to
    // the descriptor's own captured `.get` reference, is used.
    for (const spec of DOCTRINE_CONFORMANCE_ELEMENTS) {
      const descriptor = descriptors.get(spec.element);
      let present = false;
      if (descriptor) {
        const value = Object.hasOwn(descriptor, "value")
          ? descriptor.value
          : typeof descriptor.get === "function"
            ? descriptor.get.call(envelope)
            : undefined;
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
