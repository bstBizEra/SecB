// MOD-LIVE S1 — tests for src/live/event-family-policy.mjs.
//
// Sections:
//   1. Doc-parity fixtures (SECB-LIVE-EVENT-001): the 19-family list and the
//      conformance-element doctrine phrases are parsed from the ACTUAL
//      doctrine markdown at test runtime; any code/doc drift fails the suite
//      (mirrors MOD-GOV S2 risk-registry / MOD-RUNTIME S2 retry-policy
//      doc-parity discipline).
//   2. Classifier behavior: positive coverage of all 19 families, and every
//      deny path (malformed + unknown), deny-by-default.
//   3. Conformance assessor behavior: findings for the G1 subset gap.
//   4. Accessor-attack regressions (WSPACE-S1 fail-closed extraction):
//      throwing getters, Proxy traps, poisoned iterator, and the
//      invocation-count === 1 probe.
//   5. Byte-identity guards: every pre-existing file read while producing
//      this slice is asserted byte-identical to its blob at main @ 280d32c
//      (MANIFEST.json excluded — it is intentionally modified by this slice).

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  EVENT_FAMILIES,
  DOCTRINE_CONFORMANCE_ELEMENTS,
  DENY_EVENT_TYPE_MALFORMED,
  DENY_EVENT_FAMILY_UNKNOWN,
  DENY_EVENT_ENVELOPE_MALFORMED,
  classifyEventType,
  assessEnvelopeConformance
} from "../src/live/event-family-policy.mjs";

const NUL = String.fromCharCode(0);

function repoPath(rel) {
  return fileURLToPath(new URL(`../${rel}`, import.meta.url));
}

function readRepoFile(rel) {
  return readFileSync(repoPath(rel), "utf8");
}

// A minimal event that satisfies exactly the 13 required fields of the live
// closed schema (contracts/event-envelope.schema.json). Because that schema
// is additionalProperties:false, this is also the MAXIMAL doctrine surface a
// schema-valid event can carry — every doctrine element the assessor checks
// is necessarily absent.
function minimalSchemaValidEvent() {
  return {
    event_id: "evt-001",
    version: 1,
    project_id: "secb-local",
    work_package_id: "wp-live-s1",
    session_id: "sess-01",
    actor_id: "claude-motor-live-s1-01",
    event_type: "session.started",
    occurred_at: "2026-07-21T00:00:00Z",
    observed_fact: {},
    source: "host-runtime-agent",
    idempotency_key: "idem-001",
    classification: "INTERNAL",
    content_hash: "a".repeat(64)
  };
}

// An event carrying every doctrine element the assessor checks.
function doctrineConformantEvent() {
  return {
    ...minimalSchemaValidEvent(),
    trace_id: "trace-01",
    span_id: "span-01",
    sequence: 7,
    prior_event_hash: "b".repeat(64),
    fact_classification: "observed_fact",
    content_capture_level: "metadata",
    redaction_status: "none",
    evidence_candidate: false
  };
}

// ---------------------------------------------------------------------------
// 1. Doc-parity fixtures (SECB-LIVE-EVENT-001)
// ---------------------------------------------------------------------------

const DOCTRINE_DOC = "docs/05-live-operations/event-envelope.md";

// Parse the fenced ```text list under "## Event Families" from the ACTUAL
// doctrine markdown.
function familiesFromDoctrine(markdown) {
  const match = markdown.match(/## Event Families\s+```text\r?\n([\s\S]*?)```/);
  assert.ok(match, "Event Families fenced block found in doctrine doc");
  return match[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

test("doc-parity: EVENT_FAMILIES matches the SECB-LIVE-EVENT-001 fenced family list verbatim, in order", () => {
  const docFamilies = familiesFromDoctrine(readRepoFile(DOCTRINE_DOC));
  assert.equal(docFamilies.length, 19, "doctrine names exactly 19 families");
  assert.deepEqual(
    EVENT_FAMILIES.map((family) => `${family}.*`),
    docFamilies,
    "codified families are the doc's `<family>.*` entries, 1:1 and in order"
  );
});

test("doc-parity: every conformance element cites a doctrine Requirements phrase that is present verbatim", () => {
  const doc = readRepoFile(DOCTRINE_DOC);
  const requirements = doc.slice(doc.indexOf("## Requirements"));
  assert.ok(requirements.length > 0, "Requirements section found");
  for (const spec of DOCTRINE_CONFORMANCE_ELEMENTS) {
    assert.ok(
      requirements.includes(spec.doctrine),
      `doctrine phrase "${spec.doctrine}" (element ${spec.element}) present in Requirements`
    );
  }
});

test("doc-parity: assessed elements are exactly the doctrine elements ABSENT from the minimal live schema", () => {
  const schema = JSON.parse(readRepoFile("contracts/event-envelope.schema.json"));
  const schemaFields = new Set([...schema.required, ...Object.keys(schema.properties)]);
  for (const spec of DOCTRINE_CONFORMANCE_ELEMENTS) {
    assert.ok(
      !schemaFields.has(spec.element),
      `${spec.element} is not carried by the minimal live schema (subset gap G1)`
    );
  }
  // The schema stays closed: the assessor surfaces the gap, it does not widen
  // the contract (assessment B6 / non-goal #4).
  assert.equal(schema.additionalProperties, false, "live schema remains a closed contract");
  assert.equal(schema.required.length, 13, "live schema still requires exactly 13 fields");
});

// ---------------------------------------------------------------------------
// 2. classifyEventType behavior
// ---------------------------------------------------------------------------

test("classify: every one of the 19 families classifies positively", () => {
  for (const family of EVENT_FAMILIES) {
    const result = classifyEventType({ eventType: `${family}.probe` });
    assert.deepEqual(result, { ok: true, family }, `${family}.probe -> ${family}`);
  }
});

test("classify: multi-segment suffixes classify by first dotted prefix only", () => {
  assert.deepEqual(classifyEventType({ eventType: "tool.call.completed" }), { ok: true, family: "tool" });
  assert.deepEqual(classifyEventType({ eventType: "git.commit.created" }), { ok: true, family: "git" });
});

test("classify: positive result is frozen and mutation attempts throw", () => {
  const result = classifyEventType({ eventType: "incident.raised" });
  assert.ok(Object.isFrozen(result), "result frozen");
  assert.throws(() => {
    result.family = "session";
  }, TypeError);
  assert.throws(() => {
    result.injected = true;
  }, TypeError);
});

test("classify deny: non-object inputs are malformed (deny-by-default)", () => {
  for (const input of [undefined, null, "session.started", 42, true, ["session.started"]]) {
    const result = classifyEventType(input);
    assert.equal(result.ok, false);
    assert.equal(result.code, DENY_EVENT_TYPE_MALFORMED, `input ${JSON.stringify(input)} denied malformed`);
    assert.equal(typeof result.message, "string");
    assert.ok(Object.isFrozen(result), "denial frozen");
  }
});

test("classify deny: missing eventType key and prototype-key smuggling are malformed", () => {
  assert.equal(classifyEventType({}).code, DENY_EVENT_TYPE_MALFORMED);
  // eventType present only on the prototype must NOT be honoured.
  const smuggled = Object.create({ eventType: "session.started" });
  const result = classifyEventType(smuggled);
  assert.equal(result.ok, false);
  assert.equal(result.code, DENY_EVENT_TYPE_MALFORMED, "inherited eventType denied");
});

test("classify deny: non-string, empty, blank, and null-byte eventType are malformed", () => {
  for (const eventType of [42, null, undefined, {}, ["a"], "", "   ", `session${NUL}.started`, `session.st${NUL}art`]) {
    const result = classifyEventType({ eventType });
    assert.equal(result.ok, false);
    assert.equal(result.code, DENY_EVENT_TYPE_MALFORMED, `eventType ${String(eventType)} denied malformed`);
  }
});

test("classify deny: undotted, leading-dot, and trailing-dot types are malformed", () => {
  for (const eventType of ["session", ".started", "session.", "."]) {
    const result = classifyEventType({ eventType });
    assert.equal(result.ok, false);
    assert.equal(result.code, DENY_EVENT_TYPE_MALFORMED, `"${eventType}" denied malformed`);
  }
});

test("classify deny: unmapped family prefix is DENY_EVENT_FAMILY_UNKNOWN — never a guessed family", () => {
  for (const eventType of ["brainwave.spike", "sessions.started", "Session.started", "SESSION.started", "toolx.call"]) {
    const result = classifyEventType({ eventType });
    assert.equal(result.ok, false);
    assert.equal(result.code, DENY_EVENT_FAMILY_UNKNOWN, `"${eventType}" denied unknown`);
    assert.equal(result.family, undefined, "no family is ever guessed on a denial");
    assert.ok(Object.isFrozen(result));
  }
});

// ---------------------------------------------------------------------------
// 3. assessEnvelopeConformance behavior
// ---------------------------------------------------------------------------

test("conformance: a minimal schema-valid event surfaces ALL eight doctrine findings (the G1 subset gap)", () => {
  const result = assessEnvelopeConformance(minimalSchemaValidEvent());
  assert.equal(result.ok, true, "findings are advisory data, not a denial");
  assert.equal(result.findings.length, DOCTRINE_CONFORMANCE_ELEMENTS.length);
  assert.deepEqual(
    result.findings.map((finding) => finding.code),
    [
      "MISSING_TRACE_ID",
      "MISSING_SPAN_ID",
      "MISSING_SEQUENCE",
      "MISSING_PRIOR_EVENT_HASH",
      "MISSING_FACT_CLASSIFICATION",
      "MISSING_CAPTURE_LEVEL",
      "MISSING_REDACTION_STATUS",
      "MISSING_EVIDENCE_CANDIDATE_FLAG"
    ]
  );
  for (const finding of result.findings) {
    assert.deepEqual(Object.keys(finding).sort(), ["code", "element", "note", "status"]);
    assert.equal(finding.status, "absent");
    assert.equal(typeof finding.note, "string");
    assert.ok(finding.note.includes("SECB-LIVE-EVENT-001"), "note cites the doctrine");
  }
});

test("conformance: a fully doctrine-conformant event yields zero findings", () => {
  const result = assessEnvelopeConformance(doctrineConformantEvent());
  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
});

test("conformance: only absent elements are surfaced (partial conformance)", () => {
  const event = minimalSchemaValidEvent();
  event.trace_id = "trace-01";
  event.sequence = 0; // falsy but present — must count as present
  event.evidence_candidate = false; // falsy but present — must count as present
  const result = assessEnvelopeConformance(event);
  assert.equal(result.ok, true);
  const codes = result.findings.map((finding) => finding.code);
  assert.ok(!codes.includes("MISSING_TRACE_ID"));
  assert.ok(!codes.includes("MISSING_SEQUENCE"));
  assert.ok(!codes.includes("MISSING_EVIDENCE_CANDIDATE_FLAG"));
  assert.deepEqual(codes, [
    "MISSING_SPAN_ID",
    "MISSING_PRIOR_EVENT_HASH",
    "MISSING_FACT_CLASSIFICATION",
    "MISSING_CAPTURE_LEVEL",
    "MISSING_REDACTION_STATUS"
  ]);
});

test("conformance: null-valued and prototype-inherited elements count as ABSENT (deny-by-default presence rule)", () => {
  const nullValued = minimalSchemaValidEvent();
  nullValued.trace_id = null;
  nullValued.span_id = undefined;
  const nullResult = assessEnvelopeConformance(nullValued);
  assert.ok(nullResult.findings.map((finding) => finding.code).includes("MISSING_TRACE_ID"));
  assert.ok(nullResult.findings.map((finding) => finding.code).includes("MISSING_SPAN_ID"));

  const smuggled = Object.assign(Object.create({ trace_id: "smuggled" }), minimalSchemaValidEvent());
  const smuggledResult = assessEnvelopeConformance(smuggled);
  assert.ok(
    smuggledResult.findings.map((finding) => finding.code).includes("MISSING_TRACE_ID"),
    "prototype-supplied trace_id is not honoured"
  );
});

test("conformance: output is frozen at every level and the input event is never mutated", () => {
  const event = minimalSchemaValidEvent();
  const snapshot = JSON.stringify(event);
  const result = assessEnvelopeConformance(event);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.findings));
  for (const finding of result.findings) {
    assert.ok(Object.isFrozen(finding));
    assert.throws(() => {
      finding.status = "present";
    }, TypeError);
  }
  assert.throws(() => {
    result.findings.push({ forged: true });
  }, TypeError);
  assert.equal(JSON.stringify(event), snapshot, "assessor did not mutate the event");
});

test("conformance deny: malformed envelope inputs yield a structured frozen denial, never a throw", () => {
  for (const input of [undefined, null, "event", 42, true, [minimalSchemaValidEvent()]]) {
    const result = assessEnvelopeConformance(input);
    assert.equal(result.ok, false);
    assert.equal(result.code, DENY_EVENT_ENVELOPE_MALFORMED, `input ${JSON.stringify(input)} denied malformed`);
    assert.equal(typeof result.message, "string");
    assert.ok(Object.isFrozen(result));
  }
});

// ---------------------------------------------------------------------------
// 4. Accessor-attack regressions (WSPACE-S1 fail-closed extraction)
// ---------------------------------------------------------------------------

test("attack: throwing eventType getter yields the malformed denial, not a throw", () => {
  const hostile = {};
  Object.defineProperty(hostile, "eventType", {
    enumerable: true,
    get() {
      throw new Error("hostile getter");
    }
  });
  const result = classifyEventType(hostile);
  assert.equal(result.ok, false);
  assert.equal(result.code, DENY_EVENT_TYPE_MALFORMED);
});

test("attack: eventType getter is invoked exactly once (single contained read — no guard/body double-read)", () => {
  let invocations = 0;
  const probe = {};
  Object.defineProperty(probe, "eventType", {
    enumerable: true,
    get() {
      invocations += 1;
      return "session.started";
    }
  });
  const result = classifyEventType(probe);
  assert.deepEqual(result, { ok: true, family: "session" });
  assert.equal(invocations, 1, "exactly one property read");
});

test("attack: Proxy get / getOwnPropertyDescriptor traps that throw yield the malformed denial (classify)", () => {
  const getTrap = new Proxy(
    { eventType: "session.started" },
    {
      get() {
        throw new Error("hostile get trap");
      }
    }
  );
  assert.equal(classifyEventType(getTrap).code, DENY_EVENT_TYPE_MALFORMED);

  const descriptorTrap = new Proxy(
    { eventType: "session.started" },
    {
      getOwnPropertyDescriptor() {
        throw new Error("hostile descriptor trap");
      }
    }
  );
  assert.equal(classifyEventType(descriptorTrap).code, DENY_EVENT_TYPE_MALFORMED);
});

test("attack: throwing getter on each assessed envelope field yields the malformed denial, never a throw", () => {
  for (const spec of DOCTRINE_CONFORMANCE_ELEMENTS) {
    const hostile = minimalSchemaValidEvent();
    Object.defineProperty(hostile, spec.element, {
      enumerable: true,
      get() {
        throw new Error(`hostile getter on ${spec.element}`);
      }
    });
    const result = assessEnvelopeConformance(hostile);
    assert.equal(result.ok, false, `${spec.element} hostile getter denied`);
    assert.equal(result.code, DENY_EVENT_ENVELOPE_MALFORMED);
  }
});

test("attack: each assessed envelope field is read exactly once (invocation-count probe)", () => {
  const counts = {};
  const probe = minimalSchemaValidEvent();
  for (const spec of DOCTRINE_CONFORMANCE_ELEMENTS) {
    counts[spec.element] = 0;
    Object.defineProperty(probe, spec.element, {
      enumerable: true,
      get() {
        counts[spec.element] += 1;
        return "present-value";
      }
    });
  }
  const result = assessEnvelopeConformance(probe);
  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, [], "all probed elements read as present");
  for (const spec of DOCTRINE_CONFORMANCE_ELEMENTS) {
    assert.equal(counts[spec.element], 1, `${spec.element} read exactly once`);
  }
});

// N2 hardening (mod-live-s1-toctou-fix-rev-001) + N3 hardening (this slice,
// mod-live-s1-value-mutation-fix-001): key PRESENCE is still derived ONLY
// from a single Reflect.ownKeys structural snapshot, unconditionally
// unaffected by anything a descriptor trap does. VALUES are now captured via
// one descriptor read per PRESENT doctrine field (Phase 1) before any getter
// runs (Phase 2) — this is what closes N3 (see the PoC A-D suite below). A
// throwing descriptor trap is still fully contained (denial, never a throw);
// it is no longer literally "never invoked" (that was the prior revision's
// mechanism), because invoking it — safely, once per present field, gated by
// the immutable ownKeys Set — is exactly how this revision now also captures
// VALUES without the N3 gap. Key-presence itself remains exactly as
// impervious to this trap as before.
test("attack: a throwing Proxy getOwnPropertyDescriptor trap is CONTAINED — denies, never throws, never perturbs presence (N2)", () => {
  const descriptorTrap = new Proxy(minimalSchemaValidEvent(), {
    getOwnPropertyDescriptor() {
      throw new Error("hostile descriptor trap");
    }
  });
  let result;
  assert.doesNotThrow(() => {
    result = assessEnvelopeConformance(descriptorTrap);
  });
  // minimalSchemaValidEvent carries no doctrine element, so the ownKeys gate
  // never even calls the trap for this input -- the trap is dead code here.
  assert.equal(result.ok, true, "no doctrine element is present, so the descriptor trap is never reached");
  assert.equal(result.findings.length, DOCTRINE_CONFORMANCE_ELEMENTS.length);
});

test("N2 regression: a getOwnPropertyDescriptor trap that would INJECT a sibling cannot fabricate presence", () => {
  // trace_id present, evidence_candidate absent in the structural snapshot.
  const target = { ...minimalSchemaValidEvent(), trace_id: "t" };
  let descriptorInvocations = 0;
  const proxy = new Proxy(target, {
    getOwnPropertyDescriptor(t, key) {
      descriptorInvocations += 1;
      // A trap fired for trace_id (the only present doctrine field) injects
      // evidence_candidate as a side effect. Because presence is decided
      // ONLY from the Reflect.ownKeys Set captured BEFORE this trap could
      // ever run, the injected key is never looked up at all -- the ownKeys
      // gate excludes it unconditionally.
      t.evidence_candidate = true;
      return Reflect.getOwnPropertyDescriptor(t, key);
    }
  });
  // The key set the assessor commits to, taken the same way it takes it.
  const structuralKeys = new Set(Reflect.ownKeys(target));
  assert.ok(!structuralKeys.has("evidence_candidate"), "evidence_candidate absent at snapshot time");
  const result = assessEnvelopeConformance(proxy);
  assert.equal(descriptorInvocations, 1, "descriptor trap invoked exactly once, gated to the one present field (trace_id)");
  assert.equal(result.ok, true);
  const codes = result.findings.map((finding) => finding.code);
  assert.ok(codes.includes("MISSING_EVIDENCE_CANDIDATE_FLAG"), "sibling injection suppressed no finding");
  assert.ok(!codes.includes("MISSING_TRACE_ID"), "trace_id (present at snapshot) is not flagged");
});

test("N2/N3 boundary: a getOwnPropertyDescriptor trap that DELETES a not-yet-read sibling's data fails CLOSED (deny), never fabricates a finding", () => {
  // span_id and sequence both present in the structural snapshot. The trap
  // deletes `sequence`'s underlying data as a side effect of ANY descriptor
  // call (fired here while resolving span_id, which is read first). This is
  // a genuine structural inconsistency: Reflect.ownKeys said sequence was
  // present, but its own descriptor call (moments later, same Phase 1 pass)
  // comes back undefined. Rather than silently reporting a false
  // MISSING_SEQUENCE (fail-safe but factually wrong -- sequence WAS present),
  // the assessor treats this as proof the input is unstable under read and
  // denies the whole assessment. No finding is ever fabricated by this path.
  const target = { ...minimalSchemaValidEvent(), span_id: "s", sequence: 7 };
  let descriptorInvocations = 0;
  const proxy = new Proxy(target, {
    getOwnPropertyDescriptor(t, key) {
      descriptorInvocations += 1;
      delete t.sequence;
      return Reflect.getOwnPropertyDescriptor(t, key);
    }
  });
  let result;
  assert.doesNotThrow(() => {
    result = assessEnvelopeConformance(proxy);
  });
  assert.ok(descriptorInvocations >= 1, "descriptor trap was invoked");
  assert.equal(result.ok, false, "structural inconsistency between ownKeys snapshot and descriptor read denies the assessment");
  assert.equal(result.code, DENY_EVENT_ENVELOPE_MALFORMED);
  assert.ok(Object.isFrozen(result));
});

test("N2 regression: the assessor captures the own-key set in EXACTLY ONE ownKeys invocation (single structural snapshot)", () => {
  let ownKeysInvocations = 0;
  const proxy = new Proxy(minimalSchemaValidEvent(), {
    ownKeys(t) {
      ownKeysInvocations += 1;
      return Reflect.ownKeys(t);
    }
  });
  const result = assessEnvelopeConformance(proxy);
  assert.equal(result.ok, true);
  assert.equal(ownKeysInvocations, 1, "own-key set captured in exactly one Reflect.ownKeys call");
  assert.equal(result.findings.length, DOCTRINE_CONFORMANCE_ELEMENTS.length);
});

// ---------------------------------------------------------------------------
// 4a. N3 value-mutation regressions (mod-live-s1-value-mutation-fix-001) —
// reproducing the independent review's exact PoC A-D
// (docs/03-project-control/candidates/mod-live-s1-atomic-snapshot-hardening-independent-review-001.md,
// review of commit cc63e9a). trace_id is iterated before span_id / sequence /
// evidence_candidate in DOCTRINE_CONFORMANCE_ELEMENTS, so it is used as the
// "earlier field" in every probe below, exactly as the review constructed it.
// ---------------------------------------------------------------------------

test("N3 PoC A: a plain-object getter cannot SUPPRESS a genuinely-absent sibling's finding by forging its value", () => {
  const envelope = minimalSchemaValidEvent();
  // span_id starts absent (null) -- correctly "absent" under the presence rule.
  envelope.span_id = null;
  // trace_id is a plain accessor property (no Proxy at all). When read, it
  // forges span_id's value as a side effect, BEFORE span_id's own turn in the
  // fixed DOCTRINE_CONFORMANCE_ELEMENTS order.
  Object.defineProperty(envelope, "trace_id", {
    enumerable: true,
    configurable: true,
    get() {
      envelope.span_id = "FORGED-BY-TRACE-ID-GETTER";
      return "trace-01";
    }
  });
  const result = assessEnvelopeConformance(envelope);
  assert.equal(result.ok, true);
  const codes = result.findings.map((finding) => finding.code);
  assert.ok(
    codes.includes("MISSING_SPAN_ID"),
    "span_id was genuinely absent; trace_id's getter must not be able to suppress that finding"
  );
});

test("N3 PoC B: a plain-object getter cannot FABRICATE a spurious finding for a genuinely-present sibling", () => {
  const envelope = minimalSchemaValidEvent();
  // span_id starts genuinely supplied.
  envelope.span_id = "genuinely-supplied-span-id";
  // trace_id's getter forges span_id to null (absent) as a side effect,
  // before span_id's own turn.
  Object.defineProperty(envelope, "trace_id", {
    enumerable: true,
    configurable: true,
    get() {
      envelope.span_id = null;
      return "trace-01";
    }
  });
  const result = assessEnvelopeConformance(envelope);
  assert.equal(result.ok, true);
  const codes = result.findings.map((finding) => finding.code);
  assert.ok(
    !codes.includes("MISSING_SPAN_ID"),
    "span_id was genuinely present; trace_id's getter must not be able to fabricate a MISSING finding for it"
  );
});

test("N3 PoC C: a Proxy get-trap (honest ownKeys/getOwnPropertyDescriptor traps) cannot forge a sibling's value either", () => {
  const target = { ...minimalSchemaValidEvent(), span_id: null };
  const proxy = new Proxy(target, {
    // Honest pass-throughs -- isolates the `get`-trap-only vector, exactly as
    // the independent review's PoC C does.
    ownKeys(t) {
      return Reflect.ownKeys(t);
    },
    getOwnPropertyDescriptor(t, key) {
      return Reflect.getOwnPropertyDescriptor(t, key);
    },
    get(t, key, receiver) {
      if (key === "trace_id") {
        t.span_id = "FORGED-BY-GET-TRAP";
      }
      return Reflect.get(t, key, receiver);
    }
  });
  const result = assessEnvelopeConformance(proxy);
  assert.equal(result.ok, true);
  const codes = result.findings.map((finding) => finding.code);
  assert.ok(
    codes.includes("MISSING_SPAN_ID"),
    "a hostile get-trap side effect on an earlier field must not suppress a genuinely-absent sibling's finding"
  );
});

test("N3 PoC D: a plain-object getter's inject+delete cannot fabricate presence for the injected key OR suppress the deleted key's finding", () => {
  const envelope = { ...minimalSchemaValidEvent(), evidence_candidate: true };
  // trace_id absent from ownKeys at snapshot time is NOT the setup here --
  // trace_id itself is the accessor doing the damage, defined directly.
  Object.defineProperty(envelope, "trace_id", {
    enumerable: true,
    configurable: true,
    get() {
      // Deletes a sibling already captured present at snapshot time...
      delete envelope.evidence_candidate;
      // ...and injects a brand-new key not in the snapshot.
      envelope.span_id = "INJECTED-BY-TRACE-ID-GETTER";
      return "trace-01";
    }
  });
  const structuralKeys = new Set(Reflect.ownKeys(envelope));
  assert.ok(structuralKeys.has("evidence_candidate"), "evidence_candidate present at snapshot time");
  assert.ok(!structuralKeys.has("span_id"), "span_id absent at snapshot time");
  const result = assessEnvelopeConformance(envelope);
  assert.equal(result.ok, true);
  const codes = result.findings.map((finding) => finding.code);
  assert.ok(
    codes.includes("MISSING_SPAN_ID"),
    "N1 (injection): a key not in the structural snapshot cannot be fabricated present"
  );
  assert.ok(
    !codes.includes("MISSING_EVIDENCE_CANDIDATE_FLAG"),
    "N3 (value): evidence_candidate was genuinely present at snapshot time; a LATER deletion by an earlier " +
      "field's getter must not retroactively suppress its already-captured presence"
  );
});

test("N3 control: non-adversarial fully-conformant and minimal envelopes are unaffected by the descriptor-snapshot mechanism", () => {
  const conformant = assessEnvelopeConformance(doctrineConformantEvent());
  assert.equal(conformant.ok, true);
  assert.deepEqual(conformant.findings, []);

  const minimal = assessEnvelopeConformance(minimalSchemaValidEvent());
  assert.equal(minimal.ok, true);
  assert.equal(minimal.findings.length, DOCTRINE_CONFORMANCE_ELEMENTS.length);
});

test("attack: poisoned Symbol.iterator on the envelope is inert (assessor never iterates the input)", () => {
  const poisoned = minimalSchemaValidEvent();
  poisoned[Symbol.iterator] = () => {
    throw new Error("poisoned iterator");
  };
  const result = assessEnvelopeConformance(poisoned);
  assert.equal(result.ok, true, "assessor does not consume the input's iterator");
  assert.equal(result.findings.length, DOCTRINE_CONFORMANCE_ELEMENTS.length);
});

// ---------------------------------------------------------------------------
// 5. Byte-identity guards (main @ 280d32c)
// ---------------------------------------------------------------------------

// Every pre-existing repo file read while producing this slice, pinned to its
// git blob hash at main @ 280d32c5b0c2067ae55907cb3ff580aad5688a76.
// MANIFEST.json is excluded because this slice intentionally appends its two
// new file entries there (the only pre-existing file this slice modifies).
const PINNED_BLOBS = Object.freeze({
  "docs/05-live-operations/event-envelope.md": "27269ad39d1d9b081ff480e857ed4035b63c5124",
  "contracts/event-envelope.schema.json": "b33ebcbdfa4f7bd78837e52d523fa437679c0761",
  "src/control/retry-policy.mjs": "3f7f4134fe47be39d0f9165d4783694ff73f7ec3",
  "src/control/risk-registry.mjs": "b8ee7f9b979fdb3c5d5261ad0e116ecd7c6a1816",
  "tests/risk-registry.test.mjs": "1ea047adbc00ab8a9f5b737be0b67ede01b5583d",
  // Repinned from 082638c1 by MOD-WSPACE-S3, then again by MOD-MEM S2: the
  // memory-record schema registration (17->18 schemas) is an authorized
  // additive edit to validate-foundation.mjs. Pin tracks the post-WP-GOV-VF1
  // blob so this guard still detects any UNAUTHORIZED further drift of the
  // validator.
  "tools/validate-foundation.mjs": "1cf857089d483f133f6d5fb724319e60bea961f8",
  "package.json": "6f91499257a6c441558840e2bfd6acb421e2b0a0"
});

// git blob hash: sha1("blob <byteLength>\x00" + content). CRLF is normalized
// to LF first, replicating git's core.autocrlf clean filter on this Windows
// checkout — the pinned hashes are what `git hash-object <file>` reports and
// what main @ 280d32c stores.
function gitBlobSha1(rel) {
  const normalized = readRepoFile(rel).replace(/\r\n/g, "\n");
  const body = Buffer.from(normalized, "utf8");
  const header = Buffer.from(`blob ${body.length}${NUL}`, "utf8");
  return createHash("sha1").update(header).update(body).digest("hex");
}

test("byte-identity: every pre-existing file read for this slice is unchanged vs main @ 280d32c", () => {
  for (const [rel, pinned] of Object.entries(PINNED_BLOBS)) {
    assert.equal(gitBlobSha1(rel), pinned, `${rel} blob-identical to main @ 280d32c`);
  }
});

// ---------------------------------------------------------------------------
// Determinism / export hygiene
// ---------------------------------------------------------------------------

test("purity: identical inputs yield deeply equal results; exported doctrine data is frozen", () => {
  assert.deepEqual(
    classifyEventType({ eventType: "policy.decision" }),
    classifyEventType({ eventType: "policy.decision" })
  );
  assert.deepEqual(
    assessEnvelopeConformance(minimalSchemaValidEvent()),
    assessEnvelopeConformance(minimalSchemaValidEvent())
  );
  assert.ok(Object.isFrozen(EVENT_FAMILIES));
  assert.ok(Object.isFrozen(DOCTRINE_CONFORMANCE_ELEMENTS));
  for (const spec of DOCTRINE_CONFORMANCE_ELEMENTS) {
    assert.ok(Object.isFrozen(spec));
  }
});
