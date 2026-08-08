// MOD-LIVE S3 — tests for src/live/replay-assembler.mjs.
//
// Sections:
//   1. Doc-parity fixtures (SECB-LIVE-CONTROL-001 source classes) parsed from
//      the ACTUAL doctrine markdown at test runtime; code/doc drift fails the
//      suite (mirrors MOD-GOV S2 / MOD-LIVE S1 doc-parity discipline).
//   2. Source-class segregation (B3: event ≠ evidence; streams stay partitioned).
//   3. Ordering / correlation reconciliation: disorder, duplicate, contradiction,
//      gap — emitted as FINDINGS, never silent reorder/drop/overwrite.
//   4. Deny-by-default: malformed input, non-array streams, malformed records,
//      missing/invalid injected `now`.
//   5. Accessor-attack regressions (throwing getters, Proxy get/ownKeys/
//      getOwnPropertyDescriptor traps, poisoned iterator, invocation-count === 1)
//      + cross-field AND cross-record TOCTOU.
//   6. Purity / determinism: deep-frozen outputs, mutation tests, never-mutates-
//      caller, injected-`now` determinism.
//   7. Byte-identity guards vs main @ c52db71.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  SOURCE_CLASSES,
  STREAM_NAMES,
  REPLAY_FINDING_TYPES,
  REPLAY_DENY_CODES,
  DENY_REPLAY_MALFORMED,
  MAX_SEQUENCE_GAP_SPAN,
  GAP_ANALYSIS_SPAN_EXCEEDED,
  assembleReplayPackage
} from "../src/live/replay-assembler.mjs";

const NUL = String.fromCharCode(0);
const NOW = "2026-07-21T00:00:00Z";
const clock = () => NOW;

function repoPath(rel) {
  return fileURLToPath(new URL(`../${rel}`, import.meta.url));
}
function readRepoFile(rel) {
  return readFileSync(repoPath(rel), "utf8");
}

// A well-formed event record carrying the ordering scalars.
function eventRecord(overrides = {}) {
  return { sourceClass: "observed_fact", sequence: 1, idempotencyKey: "idem-1", contentHash: "h1", source: "host", ...overrides };
}

// ---------------------------------------------------------------------------
// 1. Doc-parity fixtures (SECB-LIVE-CONTROL-001)
// ---------------------------------------------------------------------------

const CONTROL_DOC = "docs/05-live-operations/intervention-and-replay.md";

// The doctrine sentence enumerates the six classes in plural prose; the code
// codifies them snake_case. Each class must map to a phrase present, verbatim,
// in the "Replay must distinguish …" sentence, in the doctrine's order.
const CLASS_DOCTRINE_PHRASE = Object.freeze({
  observed_fact: "observed facts",
  provider_assertion: "provider assertions",
  human_annotation: "human annotations",
  inference: "inferences",
  redaction: "redactions",
  missing: "missing data"
});

test("doc-parity: SOURCE_CLASSES are the six SECB-LIVE-CONTROL-001 classes, in doctrine order", () => {
  const doc = readRepoFile(CONTROL_DOC);
  const sentence = doc.slice(doc.indexOf("Replay must distinguish"));
  assert.ok(sentence.startsWith("Replay must distinguish"), "distinguish sentence found");
  assert.equal(SOURCE_CLASSES.length, 6);
  let cursor = -1;
  for (const cls of SOURCE_CLASSES) {
    const phrase = CLASS_DOCTRINE_PHRASE[cls];
    const at = sentence.indexOf(phrase);
    assert.ok(at > cursor, `"${phrase}" (class ${cls}) present and in doctrine order`);
    cursor = at;
  }
});

test("doc-parity: the event-envelope ordering doctrine (retain-and-mark, contradictions-as-findings) is present", () => {
  const doc = readRepoFile("docs/05-live-operations/event-envelope.md");
  assert.ok(doc.includes("Sequence is authoritative within a session stream"));
  assert.ok(doc.includes("Late or duplicate events are retained but marked"));
  assert.ok(doc.includes("contradictions become findings rather than silent overwrites"));
});

test("exports: finding types, deny codes, and stream names are frozen and complete", () => {
  assert.deepEqual([...REPLAY_FINDING_TYPES], [
    "ORDER_DISORDER",
    "ORDER_DUPLICATE",
    "ORDER_CONTRADICTION",
    "SEQUENCE_GAP",
    "SEQUENCE_GAP_ANALYSIS_SPAN_EXCEEDED"
  ]);
  assert.deepEqual([...REPLAY_DENY_CODES], [DENY_REPLAY_MALFORMED]);
  assert.deepEqual([...STREAM_NAMES], [
    "eventRecords",
    "evidenceRecords",
    "contextReceipts",
    "handoffEnvelopes",
    "policyDecisions"
  ]);
  assert.ok(Object.isFrozen(SOURCE_CLASSES));
  assert.ok(Object.isFrozen(STREAM_NAMES));
  assert.ok(Object.isFrozen(REPLAY_FINDING_TYPES));
  assert.ok(Object.isFrozen(REPLAY_DENY_CODES));
});

// ---------------------------------------------------------------------------
// 2. Source-class segregation (B3)
// ---------------------------------------------------------------------------

test("segregation: records land in their declared source-class bucket, tagged by origin stream", () => {
  const result = assembleReplayPackage(
    {
      eventRecords: [{ sourceClass: "observed_fact", sequence: 1 }],
      evidenceRecords: [{ sourceClass: "observed_fact" }, { sourceClass: "provider_assertion" }],
      contextReceipts: [{ sourceClass: "human_annotation" }],
      handoffEnvelopes: [{ sourceClass: "inference" }],
      policyDecisions: [{ sourceClass: "redaction" }, { sourceClass: "missing" }]
    },
    { now: clock }
  );
  assert.equal(result.ok, true);
  const { sourceClasses, streams } = result.package;
  // event and evidence both contributed an observed_fact, but stay partitioned
  // by origin stream (B3: event ≠ evidence).
  assert.deepEqual(sourceClasses.observed_fact, [
    { stream: "eventRecords", index: 0 },
    { stream: "evidenceRecords", index: 0 }
  ]);
  assert.deepEqual(sourceClasses.provider_assertion, [{ stream: "evidenceRecords", index: 1 }]);
  assert.deepEqual(sourceClasses.human_annotation, [{ stream: "contextReceipts", index: 0 }]);
  assert.deepEqual(sourceClasses.inference, [{ stream: "handoffEnvelopes", index: 0 }]);
  assert.deepEqual(sourceClasses.redaction, [{ stream: "policyDecisions", index: 0 }]);
  assert.deepEqual(sourceClasses.missing, [{ stream: "policyDecisions", index: 1 }]);
  assert.deepEqual(streams, {
    eventRecords: 1,
    evidenceRecords: 2,
    contextReceipts: 1,
    handoffEnvelopes: 1,
    policyDecisions: 2
  });
});

test("segregation: absent streams default to empty; every source-class bucket always present", () => {
  const result = assembleReplayPackage({ eventRecords: [] }, { now: clock });
  assert.equal(result.ok, true);
  for (const cls of SOURCE_CLASSES) {
    assert.deepEqual(result.package.sourceClasses[cls], []);
  }
  assert.deepEqual(result.package.streams, {
    eventRecords: 0,
    evidenceRecords: 0,
    contextReceipts: 0,
    handoffEnvelopes: 0,
    policyDecisions: 0
  });
  assert.deepEqual(result.package.findings, []);
  assert.deepEqual(result.package.gaps, []);
  assert.equal(result.package.assembledAt, NOW);
});

// ---------------------------------------------------------------------------
// 3. Ordering / correlation reconciliation
// ---------------------------------------------------------------------------

test("ordering: an in-order, gapless, unique stream yields no findings", () => {
  const result = assembleReplayPackage(
    {
      eventRecords: [
        eventRecord({ sequence: 1, idempotencyKey: "a", contentHash: "h1" }),
        eventRecord({ sequence: 2, idempotencyKey: "b", contentHash: "h2" }),
        eventRecord({ sequence: 3, idempotencyKey: "c", contentHash: "h3" })
      ]
    },
    { now: clock }
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.package.findings, []);
  assert.deepEqual(result.package.gaps, []);
});

test("ordering: declared-sequence-vs-arrival disorder is a finding; records are NOT reordered", () => {
  const events = [
    eventRecord({ sequence: 1, idempotencyKey: "a" }),
    eventRecord({ sequence: 3, idempotencyKey: "b" }),
    eventRecord({ sequence: 2, idempotencyKey: "c" }) // out of order on arrival
  ];
  const result = assembleReplayPackage({ eventRecords: events }, { now: clock });
  const disorder = result.package.findings.filter((f) => f.type === "ORDER_DISORDER");
  assert.equal(disorder.length, 1);
  assert.equal(disorder[0].atIndex, 2);
  assert.equal(disorder[0].sequence, 2);
  assert.equal(disorder[0].previousIndex, 1);
  assert.equal(disorder[0].previousSequence, 3);
  // gap 2 is in [1..3]? no — sequences {1,2,3} are complete, so no gap finding.
  assert.deepEqual(result.package.gaps, []);
});

test("ordering: equal sequences (a collision) count as disorder", () => {
  const result = assembleReplayPackage(
    { eventRecords: [eventRecord({ sequence: 5, idempotencyKey: "a" }), eventRecord({ sequence: 5, idempotencyKey: "b" })] },
    { now: clock }
  );
  const disorder = result.package.findings.filter((f) => f.type === "ORDER_DISORDER");
  assert.equal(disorder.length, 1);
  assert.equal(disorder[0].sequence, 5);
  assert.equal(disorder[0].previousSequence, 5);
});

test("correlation: same idempotency key + matching content -> DUPLICATE finding (retained, not dropped)", () => {
  const events = [
    eventRecord({ sequence: 1, idempotencyKey: "dup", contentHash: "same" }),
    eventRecord({ sequence: 2, idempotencyKey: "dup", contentHash: "same" })
  ];
  const result = assembleReplayPackage({ eventRecords: events }, { now: clock });
  const dups = result.package.findings.filter((f) => f.type === "ORDER_DUPLICATE");
  assert.equal(dups.length, 1);
  assert.equal(dups[0].idempotencyKey, "dup");
  assert.deepEqual(dups[0].indices, [0, 1]);
  // both records are still counted — nothing dropped.
  assert.equal(result.package.streams.eventRecords, 2);
});

test("correlation: same idempotency key + differing content -> CONTRADICTION finding (never a silent overwrite)", () => {
  const events = [
    eventRecord({ sequence: 1, idempotencyKey: "k", contentHash: "hA", source: "provider" }),
    eventRecord({ sequence: 2, idempotencyKey: "k", contentHash: "hB", source: "host" })
  ];
  const result = assembleReplayPackage({ eventRecords: events }, { now: clock });
  const contra = result.package.findings.filter((f) => f.type === "ORDER_CONTRADICTION");
  assert.equal(contra.length, 1);
  assert.equal(contra[0].idempotencyKey, "k");
  assert.deepEqual(contra[0].indices, [0, 1]);
  assert.deepEqual([...contra[0].contentHashes].sort(), ["hA", "hB"]);
  assert.deepEqual([...contra[0].sources].sort(), ["host", "provider"]);
  assert.equal(result.package.findings.filter((f) => f.type === "ORDER_DUPLICATE").length, 0);
});

test("gap: holes in the declared sequence range are a finding and surface in gaps[]", () => {
  const events = [
    eventRecord({ sequence: 1, idempotencyKey: "a" }),
    eventRecord({ sequence: 2, idempotencyKey: "b" }),
    eventRecord({ sequence: 5, idempotencyKey: "c" })
  ];
  const result = assembleReplayPackage({ eventRecords: events }, { now: clock });
  assert.deepEqual(result.package.gaps, [3, 4]);
  const gapFindings = result.package.findings.filter((f) => f.type === "SEQUENCE_GAP");
  assert.equal(gapFindings.length, 1);
  assert.deepEqual(gapFindings[0].missing, [3, 4]);
});

// ---------------------------------------------------------------------------
// F1 fix: resource-bounded gap analysis (mod-live-s3-second-independent-
// review-001). `sequenceGaps()` used to compute `Math.min(...set)`/
// `Math.max(...set)` and then unconditionally fill every integer in
// [min..max]. Both are unbounded on ordinary, non-adversarial numeric input —
// no Proxies or hostile getters needed. These regressions reproduce the
// reviewer's three exact scenarios first-hand and assert each now completes
// quickly without throwing, per the module's own "never throws" invariant.
// ---------------------------------------------------------------------------

test("F1: MAX_SEQUENCE_GAP_SPAN is documented, positive, and comfortably covers the gap-assessment's own named plausible scale (131k-200k distinct sequence values)", () => {
  assert.equal(typeof MAX_SEQUENCE_GAP_SPAN, "number");
  assert.ok(Number.isSafeInteger(MAX_SEQUENCE_GAP_SPAN));
  assert.ok(MAX_SEQUENCE_GAP_SPAN > 200_000, "ceiling exceeds the assessment's named 131k-200k scale");
});

test("F1 regression (a): sequence 0 and 1e8 — over the ceiling; completes quickly, never throws, gaps===null with an explicit span-exceeded finding (previously: ok:true after ~3.6s, 100M-element array)", () => {
  const t0 = Date.now();
  let result;
  assert.doesNotThrow(() => {
    result = assembleReplayPackage(
      {
        eventRecords: [
          { sourceClass: "observed_fact", sequence: 0 },
          { sourceClass: "observed_fact", sequence: 1e8 }
        ]
      },
      { now: clock }
    );
  });
  const elapsedMs = Date.now() - t0;
  assert.equal(result.ok, true);
  assert.equal(result.package.gaps, null, "gaps is null (not []) — not analyzed, not lied about");
  const exceeded = result.package.findings.filter((f) => f.type === "SEQUENCE_GAP_ANALYSIS_SPAN_EXCEEDED");
  assert.equal(exceeded.length, 1);
  assert.equal(exceeded[0].code, GAP_ANALYSIS_SPAN_EXCEEDED);
  assert.equal(exceeded[0].boundedOut, true);
  assert.equal(exceeded[0].min, 0);
  assert.equal(exceeded[0].max, 1e8);
  assert.equal(exceeded[0].span, 1e8);
  assert.equal(exceeded[0].limit, MAX_SEQUENCE_GAP_SPAN);
  // Timing regression guard: the reviewer measured ~3.6s wall-clock for this
  // exact input before the fix. A generous 1s ceiling here still catches any
  // future regression back toward the unbounded synchronous fill, without
  // being flaky on a slow CI box.
  assert.ok(elapsedMs < 1000, `expected < 1000ms, got ${elapsedMs}ms`);
});

test("F1 regression (b): sequence 0 and 1e9 — previously an uncaught RangeError: Invalid array length; now completes quickly, never throws", () => {
  const t0 = Date.now();
  let result;
  assert.doesNotThrow(() => {
    result = assembleReplayPackage(
      {
        eventRecords: [
          { sourceClass: "observed_fact", sequence: 0 },
          { sourceClass: "observed_fact", sequence: 1e9 }
        ]
      },
      { now: clock }
    );
  });
  const elapsedMs = Date.now() - t0;
  assert.equal(result.ok, true);
  assert.equal(result.package.gaps, null);
  const exceeded = result.package.findings.filter((f) => f.type === "SEQUENCE_GAP_ANALYSIS_SPAN_EXCEEDED");
  assert.equal(exceeded.length, 1);
  assert.equal(exceeded[0].min, 0);
  assert.equal(exceeded[0].max, 1e9);
  assert.equal(exceeded[0].span, 1e9);
  assert.ok(elapsedMs < 1000, `expected < 1000ms, got ${elapsedMs}ms`);
});

test("F1 regression (c): 200,000 distinct declared sequence values, no gap — previously an uncaught RangeError: Maximum call stack size exceeded from the Math.min/max spread; now completes quickly, never throws, and correctly reports no gaps (span is under the ceiling)", () => {
  const n = 200000;
  const events = Array.from({ length: n }, (_, i) => ({ sourceClass: "observed_fact", sequence: i }));
  const t0 = Date.now();
  let result;
  assert.doesNotThrow(() => {
    result = assembleReplayPackage({ eventRecords: events }, { now: clock });
  });
  const elapsedMs = Date.now() - t0;
  assert.equal(result.ok, true);
  // span (199,999) is under MAX_SEQUENCE_GAP_SPAN: this is a real, completed
  // gap analysis, not a span-exceeded outcome — the record-count crash mode
  // is fixed without changing the (correct, empty) gap-analysis result.
  assert.deepEqual(result.package.gaps, []);
  assert.equal(
    result.package.findings.some((f) => f.type === "SEQUENCE_GAP_ANALYSIS_SPAN_EXCEEDED"),
    false
  );
  // Timing regression guard for this exact crash class (record-count driven,
  // distinct from the magnitude-driven scenarios above).
  assert.ok(elapsedMs < 2000, `expected < 2000ms, got ${elapsedMs}ms`);
});

test("F1: the span-exceeded ceiling is exact — a span exactly at MAX_SEQUENCE_GAP_SPAN is fully analyzed; one past it is span-exceeded", () => {
  const atCeiling = assembleReplayPackage(
    {
      eventRecords: [
        { sourceClass: "observed_fact", sequence: 0 },
        { sourceClass: "observed_fact", sequence: MAX_SEQUENCE_GAP_SPAN }
      ]
    },
    { now: clock }
  );
  assert.equal(atCeiling.ok, true);
  assert.ok(Array.isArray(atCeiling.package.gaps));
  assert.equal(
    atCeiling.package.findings.some((f) => f.type === "SEQUENCE_GAP_ANALYSIS_SPAN_EXCEEDED"),
    false
  );

  const overCeiling = assembleReplayPackage(
    {
      eventRecords: [
        { sourceClass: "observed_fact", sequence: 0 },
        { sourceClass: "observed_fact", sequence: MAX_SEQUENCE_GAP_SPAN + 1 }
      ]
    },
    { now: clock }
  );
  assert.equal(overCeiling.ok, true);
  assert.equal(overCeiling.package.gaps, null);
  assert.equal(
    overCeiling.package.findings.some((f) => f.type === "SEQUENCE_GAP_ANALYSIS_SPAN_EXCEEDED"),
    true
  );
});

test("reconciliation runs over the EVENT stream only (B3/B7): evidence sequences never gap-checked against events", () => {
  const result = assembleReplayPackage(
    {
      eventRecords: [eventRecord({ sequence: 1, idempotencyKey: "e1" })],
      // evidence carries a wildly different sequence — must NOT create a gap
      // finding against the event stream.
      evidenceRecords: [{ sourceClass: "observed_fact", sequence: 99, idempotencyKey: "e1" }]
    },
    { now: clock }
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.package.gaps, []);
  assert.deepEqual(result.package.findings, []);
});

// ---------------------------------------------------------------------------
// 4. Deny-by-default
// ---------------------------------------------------------------------------

test("deny: non-object input is malformed", () => {
  for (const input of [undefined, null, "x", 42, true, [eventRecord()]]) {
    const result = assembleReplayPackage(input, { now: clock });
    assert.equal(result.ok, false);
    assert.equal(result.code, DENY_REPLAY_MALFORMED, `input ${JSON.stringify(input)} denied`);
    assert.ok(Object.isFrozen(result));
  }
});

test("deny: a stream present but not an array (non-array events) is malformed", () => {
  assert.equal(assembleReplayPackage({ eventRecords: "nope" }, { now: clock }).code, DENY_REPLAY_MALFORMED);
  assert.equal(assembleReplayPackage({ eventRecords: {} }, { now: clock }).code, DENY_REPLAY_MALFORMED);
  assert.equal(assembleReplayPackage({ evidenceRecords: 7 }, { now: clock }).code, DENY_REPLAY_MALFORMED);
});

test("deny: a record that is not a non-array object is malformed", () => {
  for (const bad of [null, "r", 1, true, ["x"]]) {
    const result = assembleReplayPackage({ eventRecords: [bad] }, { now: clock });
    assert.equal(result.ok, false);
    assert.equal(result.code, DENY_REPLAY_MALFORMED, `record ${JSON.stringify(bad)} denied`);
  }
});

test("deny: a record with absent/invalid/prototype-smuggled sourceClass is malformed", () => {
  assert.equal(assembleReplayPackage({ eventRecords: [{}] }, { now: clock }).code, DENY_REPLAY_MALFORMED);
  assert.equal(assembleReplayPackage({ eventRecords: [{ sourceClass: "bogus" }] }, { now: clock }).code, DENY_REPLAY_MALFORMED);
  assert.equal(assembleReplayPackage({ eventRecords: [{ sourceClass: 42 }] }, { now: clock }).code, DENY_REPLAY_MALFORMED);
  // inherited sourceClass is not honoured (own-key rule).
  const smuggled = Object.create({ sourceClass: "observed_fact" });
  assert.equal(assembleReplayPackage({ eventRecords: [smuggled] }, { now: clock }).code, DENY_REPLAY_MALFORMED);
});

test("deny: ill-typed optional ordering scalars are malformed", () => {
  const bads = [
    { sourceClass: "observed_fact", sequence: -1 },
    { sourceClass: "observed_fact", sequence: 1.5 },
    { sourceClass: "observed_fact", sequence: "1" },
    { sourceClass: "observed_fact", idempotencyKey: "" },
    { sourceClass: "observed_fact", idempotencyKey: `k${NUL}` },
    { sourceClass: "observed_fact", contentHash: 7 },
    { sourceClass: "observed_fact", source: "  " }
  ];
  for (const bad of bads) {
    const result = assembleReplayPackage({ eventRecords: [bad] }, { now: clock });
    assert.equal(result.ok, false, `${JSON.stringify(bad)} denied`);
    assert.equal(result.code, DENY_REPLAY_MALFORMED);
  }
});

test("deny: a missing or ill-typed injected now is malformed (no ambient clock)", () => {
  assert.equal(assembleReplayPackage({ eventRecords: [] }, undefined).code, DENY_REPLAY_MALFORMED);
  assert.equal(assembleReplayPackage({ eventRecords: [] }, {}).code, DENY_REPLAY_MALFORMED);
  assert.equal(assembleReplayPackage({ eventRecords: [] }, { now: "" }).code, DENY_REPLAY_MALFORMED);
  assert.equal(assembleReplayPackage({ eventRecords: [] }, { now: NaN }).code, DENY_REPLAY_MALFORMED);
  assert.equal(assembleReplayPackage({ eventRecords: [] }, { now: {} }).code, DENY_REPLAY_MALFORMED);
});

test("deny: a scalar now (string or finite number) is accepted verbatim", () => {
  assert.equal(assembleReplayPackage({ eventRecords: [] }, { now: NOW }).package.assembledAt, NOW);
  assert.equal(assembleReplayPackage({ eventRecords: [] }, { now: 1_700_000_000 }).package.assembledAt, 1_700_000_000);
});

test("deny: assembly is ATOMIC — one bad record denies the whole package (no partial assembly)", () => {
  const result = assembleReplayPackage(
    { eventRecords: [eventRecord(), { sourceClass: "nope" }, eventRecord({ sequence: 3 })] },
    { now: clock }
  );
  assert.equal(result.ok, false);
  assert.equal(result.package, undefined, "no partial package on denial");
});

// ---------------------------------------------------------------------------
// 5. Accessor-attack regressions + TOCTOU
// ---------------------------------------------------------------------------

test("attack: a throwing getter on any record field yields the malformed denial, never a throw", () => {
  for (const field of ["sourceClass", "sequence", "idempotencyKey", "contentHash", "source"]) {
    const hostile = eventRecord();
    Object.defineProperty(hostile, field, {
      enumerable: true,
      get() {
        throw new Error(`hostile getter on ${field}`);
      }
    });
    let result;
    assert.doesNotThrow(() => {
      result = assembleReplayPackage({ eventRecords: [hostile] }, { now: clock });
    });
    assert.equal(result.ok, false, `${field} hostile getter denied`);
    assert.equal(result.code, DENY_REPLAY_MALFORMED);
  }
});

test("attack: a throwing now() function is contained as a malformed denial", () => {
  const result = assembleReplayPackage(
    { eventRecords: [] },
    {
      now() {
        throw new Error("hostile clock");
      }
    }
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, DENY_REPLAY_MALFORMED);
});

test("attack: a Proxy stream with a throwing get trap is contained (malformed), never throws", () => {
  const hostileStream = new Proxy([eventRecord()], {
    get(t, k, r) {
      if (k === "length" || typeof k === "symbol") return Reflect.get(t, k, r);
      throw new Error("hostile index trap");
    }
  });
  let result;
  assert.doesNotThrow(() => {
    result = assembleReplayPackage({ eventRecords: hostileStream }, { now: clock });
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, DENY_REPLAY_MALFORMED);
});

test("attack: a stream with a tampered Symbol.iterator is rejected WITHOUT invoking it", () => {
  const poisoned = [eventRecord()];
  let iterated = false;
  poisoned[Symbol.iterator] = function () {
    iterated = true;
    throw new Error("poisoned iterator");
  };
  const result = assembleReplayPackage({ eventRecords: poisoned }, { now: clock });
  assert.equal(result.ok, false, "tampered-iterator array rejected as malformed");
  assert.equal(result.code, DENY_REPLAY_MALFORMED);
  assert.equal(iterated, false, "the poisoned iterator was never invoked");
});

test("attack: each record field is read EXACTLY ONCE (single contained read, no guard/body double-read)", () => {
  const counts = { sourceClass: 0, sequence: 0, idempotencyKey: 0, contentHash: 0, source: 0 };
  const probe = {};
  const values = { sourceClass: "observed_fact", sequence: 1, idempotencyKey: "k", contentHash: "h", source: "s" };
  for (const field of Object.keys(counts)) {
    Object.defineProperty(probe, field, {
      enumerable: true,
      get() {
        counts[field] += 1;
        return values[field];
      }
    });
  }
  const result = assembleReplayPackage({ eventRecords: [probe] }, { now: clock });
  assert.equal(result.ok, true);
  for (const field of Object.keys(counts)) {
    assert.equal(counts[field], 1, `${field} read exactly once`);
  }
});

test("attack: the record own-key set is captured in EXACTLY ONE ownKeys invocation (structural snapshot)", () => {
  let ownKeysInvocations = 0;
  const proxy = new Proxy(eventRecord(), {
    ownKeys(t) {
      ownKeysInvocations += 1;
      return Reflect.ownKeys(t);
    }
  });
  const result = assembleReplayPackage({ eventRecords: [proxy] }, { now: clock });
  assert.equal(result.ok, true);
  assert.equal(ownKeysInvocations, 1, "own-key set captured in exactly one Reflect.ownKeys call");
});

test("attack: a throwing getOwnPropertyDescriptor trap on a record is INERT — never invoked (presence from ownKeys snapshot)", () => {
  let descriptorInvocations = 0;
  const proxy = new Proxy(eventRecord(), {
    getOwnPropertyDescriptor() {
      descriptorInvocations += 1;
      throw new Error("hostile descriptor trap");
    }
  });
  let result;
  assert.doesNotThrow(() => {
    result = assembleReplayPackage({ eventRecords: [proxy] }, { now: clock });
  });
  assert.equal(descriptorInvocations, 0, "getOwnPropertyDescriptor trap never invoked");
  assert.equal(result.ok, true);
});

test("cross-record TOCTOU: a hostile getter on one record cannot perturb a SIBLING record's captured assessment", () => {
  // record[0]'s sourceClass getter mutates the sibling object AND flips a shared
  // flag. Because every record is fully snapshotted into a self-owned descriptor
  // before ANY reconciliation, and the assessment reads only descriptors, the
  // sibling's assessment is bound to the value read during ITS own single-read
  // snapshot — record[0] can neither double-read nor re-open record[1].
  const sibling = eventRecord({ sequence: 2, idempotencyKey: "b", contentHash: "h2" });
  let siblingSequenceReads = 0;
  Object.defineProperty(sibling, "sequence", {
    enumerable: true,
    get() {
      siblingSequenceReads += 1;
      return 2;
    }
  });
  const hostile = {};
  Object.defineProperty(hostile, "sourceClass", {
    enumerable: true,
    get() {
      // attempt to corrupt the sibling mid-assembly
      try {
        sibling.injected = "tamper";
      } catch {
        /* frozen or non-extensible: ignore */
      }
      return "observed_fact";
    }
  });
  hostile.sequence = 1;
  hostile.idempotencyKey = "a";
  hostile.contentHash = "h1";

  const result = assembleReplayPackage({ eventRecords: [hostile, sibling] }, { now: clock });
  assert.equal(result.ok, true);
  assert.equal(siblingSequenceReads, 1, "sibling sequence read exactly once, by its own snapshot");
  // deterministic assessment regardless of the hostile getter's side effects.
  assert.deepEqual(result.package.findings, []);
  assert.deepEqual(result.package.gaps, []);
  assert.equal(result.package.streams.eventRecords, 2);
});

test("cross-field TOCTOU: a getter returning different values per read cannot influence the decision (single read binds)", () => {
  let seqReads = 0;
  const record = { sourceClass: "observed_fact", idempotencyKey: "a", contentHash: "h" };
  Object.defineProperty(record, "sequence", {
    enumerable: true,
    get() {
      seqReads += 1;
      return seqReads; // 1 on first read, would be 2 on any second read
    }
  });
  const result = assembleReplayPackage({ eventRecords: [record] }, { now: clock });
  assert.equal(result.ok, true);
  assert.equal(seqReads, 1, "sequence read exactly once");
  // single-element stream, sequence bound to the first read (1): no gap, no disorder.
  assert.deepEqual(result.package.gaps, []);
  assert.deepEqual(result.package.findings, []);
});

// ---------------------------------------------------------------------------
// 6. Purity / determinism / immutability
// ---------------------------------------------------------------------------

test("immutability: the returned package is deep-frozen; mutation attempts throw", () => {
  const result = assembleReplayPackage(
    { eventRecords: [eventRecord({ sequence: 1 }), eventRecord({ sequence: 3, idempotencyKey: "b" })] },
    { now: clock }
  );
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.package));
  assert.ok(Object.isFrozen(result.package.sourceClasses));
  assert.ok(Object.isFrozen(result.package.sourceClasses.observed_fact));
  assert.ok(Object.isFrozen(result.package.findings));
  assert.ok(Object.isFrozen(result.package.gaps));
  assert.throws(() => {
    result.package.findings.push({ forged: true });
  }, TypeError);
  assert.throws(() => {
    result.package.assembledAt = "tamper";
  }, TypeError);
});

test("immutability: the assembler NEVER mutates, reorders, or freezes the caller's records/arrays", () => {
  const events = [
    eventRecord({ sequence: 3, idempotencyKey: "b", contentHash: "h3" }),
    eventRecord({ sequence: 1, idempotencyKey: "a", contentHash: "h1" })
  ];
  const before = JSON.stringify(events);
  const result = assembleReplayPackage({ eventRecords: events }, { now: clock });
  assert.equal(result.ok, true);
  assert.equal(JSON.stringify(events), before, "caller array/records unchanged in content");
  assert.equal(events[0].sequence, 3, "caller array not reordered");
  assert.ok(!Object.isFrozen(events), "caller array not frozen by the assembler");
  assert.ok(!Object.isFrozen(events[0]), "caller record not frozen by the assembler");
});

test("determinism: identical inputs with an identical injected now yield deeply equal packages", () => {
  const build = () =>
    assembleReplayPackage(
      {
        eventRecords: [
          eventRecord({ sequence: 1, idempotencyKey: "a", contentHash: "hA", source: "p" }),
          eventRecord({ sequence: 1, idempotencyKey: "a", contentHash: "hB", source: "q" }),
          eventRecord({ sequence: 4, idempotencyKey: "c" })
        ]
      },
      { now: NOW }
    );
  assert.deepEqual(build(), build());
});

// ---------------------------------------------------------------------------
// 7. Byte-identity guards (main @ c52db71)
// ---------------------------------------------------------------------------

// Every pre-existing repo file read while producing this slice, pinned to its
// git blob hash at main @ c52db71. MANIFEST.json is excluded — this slice
// intentionally appends its two new file entries there.
const PINNED_BLOBS = Object.freeze({
  "docs/05-live-operations/intervention-and-replay.md": "2b0be978ded8a04ece704c36ce132a787cfc8095",
  "docs/05-live-operations/event-envelope.md": "27269ad39d1d9b081ff480e857ed4035b63c5124",
  // Repinned by mod-live-s1-value-mutation-fix-001 (commit 24d5dcd): closes
  // N3 (a hostile getter mutating a later sibling's VALUE, not just key
  // presence -- see mod-live-s1-value-mutation-fix-producer-verification-001.md).
  // Pin tracks the post-fix blob so this guard still detects any
  // UNAUTHORIZED further drift of this file.
  "src/live/event-family-policy.mjs": "47ebc9bb7e5190c6f0f78232884379b3c284248d",
  "src/ops/scorecard-assembler.mjs": "9be7e9db992b4aa14f0030652c86c58548e0e5f5",
  "src/control/write-set-policy.mjs": "5f1e119c8089ba8250f3596164c0974662587449",
  // Repinned from 082638c1 by MOD-WSPACE-S3, then again by MOD-MEM S2: the
  // memory-record schema registration (17->18 schemas) is an authorized
  // additive edit to validate-foundation.mjs. Pin tracks the post-MOD-MEM-S2
  // blob so this guard still detects any UNAUTHORIZED further drift of the
  // validator.
  "tools/validate-foundation.mjs": "cadc8b2a133aefd4b794e9f9226365ca33a0e510",
  "package.json": "fc108a6b46be8007a8a2ae3e1371be4155e82510"
});

// git blob hash: sha1("blob <byteLength>\x00" + content). CRLF normalized to LF
// first, replicating git's core.autocrlf clean filter on this Windows checkout.
function gitBlobSha1(rel) {
  const normalized = readRepoFile(rel).replace(/\r\n/g, "\n");
  const body = Buffer.from(normalized, "utf8");
  const header = Buffer.from(`blob ${body.length}${NUL}`, "utf8");
  return createHash("sha1").update(header).update(body).digest("hex");
}

test("byte-identity: every pre-existing file read for this slice is unchanged vs main @ c52db71", () => {
  for (const [rel, pinned] of Object.entries(PINNED_BLOBS)) {
    assert.equal(gitBlobSha1(rel), pinned, `${rel} blob-identical to main @ c52db71`);
  }
});
