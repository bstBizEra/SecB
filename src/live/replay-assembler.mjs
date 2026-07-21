// MOD-LIVE Slice S3 (closes gap G3, advances G4 in
// docs/03-project-control/candidates/mod-live-gap-assessment-001.md,
// bst/mod-live-assessment): replay-package assembler + ordering/correlation
// reconciliation. PURE + UNWIRED.
//
// This module is an ASSEMBLER, not an enforcer and not a ledger. Given
// CALLER-SUPPLIED, already-verified record arrays, `assembleReplayPackage`
// answers exactly one question — "what does the structured replay VIEW of
// these records look like, which source class does each belong to, and where
// are the ordering/duplicate/contradiction/gap findings?". Nothing in this
// file reads a ledger, touches the filesystem, reads an ambient clock, spawns
// a process, or is wired into `ops-report-generator`, `EventLedger`,
// `host-runtime-agent`, `TransitionEngine`, or any live path. The caller runs
// `verify()`/`read()` on its sources first, exactly as `ops-report-generator`
// does before handing `report-projections.mjs` its records. Adoption by any
// report/UI/live path is later, separately-governed work (assessment §5 #5).
//
// The supplied records are DATA_UNTRUSTED input: they are never fetched from a
// live ledger by this module, never trusted to be well-ordered, and never
// mutated or reordered. The assembler builds a fresh VIEW (its own descriptor
// objects carrying snapshotted scalars) and surfaces every ordering anomaly as
// a FINDING — it NEVER silently reorders, drops, de-duplicates, or overwrites a
// caller record. Because the returned view contains only freshly-minted objects
// (no reference to any caller record), deep-freezing the output cannot freeze,
// and therefore cannot mutate, the caller's inputs.
//
// Boundary rulings honoured (assessment §3):
//   B1 — PEER of the P0-17 ops report, NOT a fold-in. Produces the structured
//        manifest MODEL only: no HTML, no CSP posture, no integrity-failure
//        page, no ledger/FS read. The report MAY later consume this model; this
//        module neither hooks into nor replaces it.
//   B2 — replay (BACKWARD reconstruction of the observation record) is NOT
//        checkpoint resume (FORWARD resumable execution state). This module
//        imports NO checkpoint-ledger and no live path; the two never fold into
//        each other.
//   B3 — event ≠ evidence. The five caller streams (events, evidence, context
//        receipts, handoff envelopes, policy decisions) are kept PARTITIONED:
//        each view descriptor retains its origin `stream`, and ordering
//        reconciliation runs over the EVENT stream only — evidence/context/
//        handoff/policy records are segregated by source class but never merged
//        into, nor sequence-reconciled against, the event stream.
//   B7 — ordering findings NEVER mutate or re-sequence any ledger. This module
//        holds no ledger; `DurableLedger`'s per-ledger monotonic sequence and
//        idempotency-dup rejection at append time are untouched. S3 operates
//        one plane up, over an already-assembled multi-source set, emitting
//        cross-stream disorder/duplicate/contradiction/gap as advisory findings.
//
// AUTHORITATIVE SOURCE (doctrine codified; doc-parity enforced by
// tests/replay-assembler.test.mjs):
//   - Source classes to distinguish: docs/05-live-operations/intervention-and-
//     replay.md (SECB-LIVE-CONTROL-001) "Replay must distinguish observed
//     facts, provider assertions, human annotations, inferences, redactions,
//     and missing data." Codified 1:1 in SOURCE_CLASSES.
//   - Ordering doctrine: docs/05-live-operations/event-envelope.md
//     (SECB-LIVE-EVENT-001) "Sequence is authoritative within a session
//     stream"; "Late or duplicate events are retained but marked and
//     reconciled"; "contradictions become findings rather than silent
//     overwrites". This is exactly the retain-and-mark (never drop/overwrite)
//     discipline the finding emitters below implement.
//
// ATOMIC-SNAPSHOT DISCIPLINE (ratified house standard, LIVE-S1 rev-002 N1/N2 +
// atomic-snapshot-hardening): every field consulted off caller-supplied input
// is captured BEFORE any evaluation.
//   - The five stream arrays are each captured with the single-pass
//     `snapshotArray` pattern (deliberate local twin of
//     src/control/write-set-policy.mjs — Array.isArray gate, untampered-iterator
//     check WITHOUT invoking the iterator, one length read, one [[Get]] per
//     index) into fresh own-data arrays.
//   - Each record's own-key set is captured in ONE `Reflect.ownKeys` structural
//     snapshot; presence is decided from that Set alone (no per-field
//     `hasOwn`/descriptor probe that a Proxy `getOwnPropertyDescriptor`/`has`
//     trap could use to inject or delete a SIBLING field), and each consulted
//     value is taken with ONE contained `[[Get]]`. Every record is fully
//     snapshotted into a self-owned descriptor before ANY cross-record
//     reconciliation runs, so a hostile getter on one record cannot alter
//     another record's already-captured assessment (cross-record TOCTOU closed).
//   - `now` is INJECTED (no ambient clock); a function is invoked exactly once
//     inside the contained snapshot.
// A throw anywhere in extraction is contained to the structured malformed
// denial — the assembler never throws.
//
// RESOURCE-BOUNDED GAP ANALYSIS (F1 fix, mod-live-s3-second-independent-
// review-001, applied on bst/mod-live-s3-resource-exhaustion-fix-001):
// `sequenceGaps` used to compute `Math.min(...set)`/`Math.max(...set)` over
// every declared `sequence` value and then synchronously fill every integer in
// `[min..max]`. Both steps are unbounded on ordinary, non-adversarial numeric
// input: a spread of >~100k distinct values overflows V8's call-argument limit
// (`RangeError: Maximum call stack size exceeded`), and a large declared span
// (e.g. two records with `sequence` 0 and 1e9) either stalls for seconds or
// throws `RangeError: Invalid array length` — silently contradicting this
// file's own "never throws" invariant on input this module itself labels
// DATA_UNTRUSTED. The fix keeps two properties: (1) min/max are now computed
// with a manual reduce loop, which has no call-argument limit regardless of
// set size; (2) before materializing `[min..max]`, the SPAN (`max - min`) is
// checked against `MAX_SEQUENCE_GAP_SPAN` (see its own comment for the exact
// value and rationale). A span over the ceiling does NOT throw and does NOT
// silently report "no gaps" — it returns a distinct, explicitly-flagged
// `SEQUENCE_GAP_ANALYSIS_SPAN_EXCEEDED` finding and `package.gaps === null`
// (never `[]`, so a caller cannot mistake "not analyzed" for "no gaps"),
// fail-closed and observable rather than crashing or lying. This is the only
// behavior change in this module; every previously-analyzable sequence range
// (span <= MAX_SEQUENCE_GAP_SPAN) produces byte-identical findings/gaps.
//
// House style (matches scorecard-assembler.mjs, report-projections.mjs,
// event-family-policy.mjs): result objects — deep-frozen { ok: true, ... } on
// success, deep-frozen { ok: false, code, message } deny-by-default on any
// malformed/unreadable input. Findings are advisory DATA on an ok:true package,
// never denials. Audit-before-effect holds by construction: the assembler has
// no side effect; its decision record IS its returned frozen result.

// --- Deny codes -------------------------------------------------------------

// The single top-level deny code. Deny-by-default on any structurally invalid
// input: non-object input; a stream field present but not a genuine untampered
// array (non-array events included); a record that is not a non-array object; a
// record with no valid `sourceClass`; a record whose optional ordering scalars
// (`sequence`/`idempotencyKey`/`contentHash`/`source`) are present but
// ill-typed; an unreadable field (hostile getter / Proxy trap); or a missing/
// ill-typed injected `now`. A malformed input never coerces to a permissive
// default and never partially assembles.
export const DENY_REPLAY_MALFORMED = "DENY_REPLAY_MALFORMED";

export const REPLAY_DENY_CODES = Object.freeze([DENY_REPLAY_MALFORMED]);

// --- Finding types (advisory; NOT denials) ----------------------------------

// Emitted on an ok:true package. Each is a retain-and-mark reconciliation
// result over the EVENT stream — never a mutation, never a drop, never an
// overwrite (SECB-LIVE-EVENT-001).
//   ORDER_DISORDER      — declared `sequence` is not strictly increasing in
//                         arrival order (equal sequences included: a collision
//                         is disorder). Records without a sequence are skipped.
//   ORDER_DUPLICATE     — the same `idempotencyKey` appears on >1 event record
//                         with matching (or absent) `contentHash`: a retained,
//                         marked duplicate.
//   ORDER_CONTRADICTION — the same `idempotencyKey` appears on >1 event record
//                         with DIFFERING `contentHash`: same identity, conflicting
//                         content — a finding, never a silent overwrite.
//   SEQUENCE_GAP        — holes in the event stream's declared sequence range
//                         [min..max]: missing sequence numbers.
//   SEQUENCE_GAP_ANALYSIS_SPAN_EXCEEDED — the declared sequence range's span
//                         (max - min) exceeds MAX_SEQUENCE_GAP_SPAN; gap
//                         analysis was not performed for this range (fail-
//                         closed, not silently reported as gapless, and never
//                         a throw or a multi-second synchronous stall — F1
//                         fix, mod-live-s3-second-independent-review-001).
export const REPLAY_FINDING_TYPES = Object.freeze([
  "ORDER_DISORDER",
  "ORDER_DUPLICATE",
  "ORDER_CONTRADICTION",
  "SEQUENCE_GAP",
  "SEQUENCE_GAP_ANALYSIS_SPAN_EXCEEDED"
]);

// The distinct, explicitly-flagged outcome code returned (never thrown) when
// a declared sequence span is too large to bound-safely gap-fill. See
// MAX_SEQUENCE_GAP_SPAN below for the exact ceiling and its rationale.
export const GAP_ANALYSIS_SPAN_EXCEEDED = "GAP_ANALYSIS_SPAN_EXCEEDED";

// --- Doctrine data (verbatim; doc-parity enforced) --------------------------

// The six source classes SECB-LIVE-CONTROL-001 requires replay to distinguish,
// in the doctrine's own order. Codified 1:1; doc-parity fixture fails the suite
// on drift.
export const SOURCE_CLASSES = Object.freeze([
  "observed_fact",
  "provider_assertion",
  "human_annotation",
  "inference",
  "redaction",
  "missing"
]);

// The five caller-supplied record streams the assembler segregates. `events` is
// the only sequence-reconciled stream (B3); the rest are segregated by source
// class but never merged into the event stream.
export const STREAM_NAMES = Object.freeze([
  "eventRecords",
  "evidenceRecords",
  "contextReceipts",
  "handoffEnvelopes",
  "policyDecisions"
]);

const SOURCE_CLASS_SET = new Set(SOURCE_CLASSES);

// --- Internals --------------------------------------------------------------

const NULL_BYTE = String.fromCharCode(0);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const deny = (message) => deepFreeze({ ok: false, code: DENY_REPLAY_MALFORMED, message });

const isNonBlankString = (v) =>
  typeof v === "string" && v.trim().length > 0 && !v.includes(NULL_BYTE);
const isSafeNonNegativeInteger = (v) => Number.isSafeInteger(v) && v >= 0;
const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v);

// Single-pass array snapshot (WSPACE-S1 / write-set-policy `snapshotArray`
// twin). Returns NOT_ARRAY for a non-array / iterator-tampered / degenerate
// input, else a fresh own-data copy. May throw ONLY into the caller's
// contained try/catch (a hostile length/index accessor propagates there).
const NOT_ARRAY = Symbol("replay-not-array");
const ARRAY_ITERATOR = Array.prototype[Symbol.iterator];
function snapshotArray(value) {
  if (!Array.isArray(value)) return NOT_ARRAY;
  if (value[Symbol.iterator] !== ARRAY_ITERATOR) return NOT_ARRAY;
  const len = value.length;
  if (!Number.isSafeInteger(len) || len < 0) return NOT_ARRAY;
  const out = new Array(len);
  for (let i = 0; i < len; i++) out[i] = value[i];
  return out;
}

// --- Phase A: atomic input snapshot -----------------------------------------

// Capture the injected clock exactly once. A function `now` is invoked a single
// time inside the contained snapshot; a scalar is used verbatim. The resolved
// value must be a non-blank string or a finite number (no ambient clock, no
// coercion). Returns { ok, value } or { ok: false }.
function snapshotNow(options) {
  try {
    const raw = options?.now;
    const resolved = typeof raw === "function" ? raw() : raw;
    if (isNonBlankString(resolved) || isFiniteNumber(resolved)) {
      return { ok: true, value: resolved };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

// Capture all five streams from `input` in one contained pass, using a single
// structural own-key snapshot so a Proxy trap cannot inject/delete a sibling
// stream mid-read. An absent stream defaults to an empty array; a present stream
// must snapshot to a genuine untampered array (non-array => malformed). Returns
// { ok, streams } (streams: { name -> own-data array }) or { ok: false }.
function snapshotStreams(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false };
  }
  try {
    const ownKeys = new Set(Reflect.ownKeys(input));
    const streams = {};
    for (const name of STREAM_NAMES) {
      if (!ownKeys.has(name)) {
        streams[name] = [];
        continue;
      }
      const snapshot = snapshotArray(input[name]);
      if (snapshot === NOT_ARRAY) return { ok: false };
      streams[name] = snapshot;
    }
    return { ok: true, streams };
  } catch {
    return { ok: false };
  }
}

// Snapshot ONE record into a self-owned descriptor. `sourceClass` is required
// and must be a member of SOURCE_CLASSES. The ordering scalars are optional but,
// when present as own keys, must be well-typed. Presence is decided ONLY from
// the single Reflect.ownKeys snapshot; each present value is taken with one
// contained [[Get]]. Returns { ok: true, descriptor } or { ok: false, detail }.
function snapshotRecord(record, stream, index) {
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    return { ok: false, detail: "record must be a non-array object" };
  }
  try {
    const ownKeys = new Set(Reflect.ownKeys(record));

    if (!ownKeys.has("sourceClass")) {
      return { ok: false, detail: "record must declare an own sourceClass" };
    }
    const sourceClass = record.sourceClass;
    if (typeof sourceClass !== "string" || !SOURCE_CLASS_SET.has(sourceClass)) {
      return { ok: false, detail: "sourceClass must be one of the six SECB-LIVE-CONTROL-001 classes" };
    }

    const descriptor = { stream, index, sourceClass };

    if (ownKeys.has("sequence")) {
      const sequence = record.sequence;
      if (!isSafeNonNegativeInteger(sequence)) {
        return { ok: false, detail: "sequence, when present, must be a safe non-negative integer" };
      }
      descriptor.sequence = sequence;
    }
    if (ownKeys.has("idempotencyKey")) {
      const idempotencyKey = record.idempotencyKey;
      if (!isNonBlankString(idempotencyKey)) {
        return { ok: false, detail: "idempotencyKey, when present, must be a non-blank string" };
      }
      descriptor.idempotencyKey = idempotencyKey;
    }
    if (ownKeys.has("contentHash")) {
      const contentHash = record.contentHash;
      if (!isNonBlankString(contentHash)) {
        return { ok: false, detail: "contentHash, when present, must be a non-blank string" };
      }
      descriptor.contentHash = contentHash;
    }
    if (ownKeys.has("source")) {
      const source = record.source;
      if (!isNonBlankString(source)) {
        return { ok: false, detail: "source, when present, must be a non-blank string" };
      }
      descriptor.source = source;
    }

    return { ok: true, descriptor };
  } catch {
    return { ok: false, detail: "record field could not be read safely" };
  }
}

// --- Phase B: reconciliation (pure; operates only on captured descriptors) ---

// Disorder: declared sequence not strictly increasing across sequenced event
// descriptors in arrival order. Equal sequences are disorder (a collision).
function orderingDisorderFindings(eventDescriptors) {
  const findings = [];
  let prev = null;
  for (const d of eventDescriptors) {
    if (d.sequence === undefined) continue;
    if (prev !== null && d.sequence <= prev.sequence) {
      findings.push(
        Object.freeze({
          type: "ORDER_DISORDER",
          atIndex: d.index,
          sequence: d.sequence,
          previousIndex: prev.index,
          previousSequence: prev.sequence,
          note:
            "declared sequence is not strictly increasing in arrival order; " +
            "records are retained and marked, never reordered (SECB-LIVE-EVENT-001)."
        })
      );
    }
    prev = d;
  }
  return findings;
}

// Duplicate vs contradiction, grouped by idempotencyKey (first-appearance
// order). Same key + matching/absent contentHash => retained DUPLICATE; same key
// + differing contentHash => CONTRADICTION (never a silent overwrite).
function correlationFindings(eventDescriptors) {
  const groups = new Map();
  for (const d of eventDescriptors) {
    if (d.idempotencyKey === undefined) continue;
    if (!groups.has(d.idempotencyKey)) groups.set(d.idempotencyKey, []);
    groups.get(d.idempotencyKey).push(d);
  }
  const findings = [];
  for (const [idempotencyKey, members] of groups) {
    if (members.length < 2) continue;
    const indices = members.map((m) => m.index);
    const hashes = members.filter((m) => m.contentHash !== undefined).map((m) => m.contentHash);
    const distinctHashes = new Set(hashes);
    if (distinctHashes.size > 1) {
      findings.push(
        Object.freeze({
          type: "ORDER_CONTRADICTION",
          idempotencyKey,
          indices: Object.freeze([...indices]),
          contentHashes: Object.freeze([...distinctHashes]),
          sources: Object.freeze([
            ...new Set(members.filter((m) => m.source !== undefined).map((m) => m.source))
          ]),
          note:
            "records share an idempotency key but carry conflicting content hashes; " +
            "raised as a contradiction finding rather than a silent overwrite (SECB-LIVE-EVENT-001)."
        })
      );
    } else {
      findings.push(
        Object.freeze({
          type: "ORDER_DUPLICATE",
          idempotencyKey,
          indices: Object.freeze([...indices]),
          note:
            "records share an idempotency key with matching content; " +
            "retained and marked as a duplicate, never dropped (SECB-LIVE-EVENT-001)."
        })
      );
    }
  }
  return findings;
}

// F1 fix ceiling (mod-live-s3-second-independent-review-001): the maximum
// [min..max] SPAN `sequenceGaps` will synchronously materialize. Chosen so
// that:
//   - it comfortably covers the plausible scale the module's own governing
//     gap-assessment names for this exact reconciliation function — "a long-
//     running session's event history" in the "entirely plausible... not a
//     contrived edge case" 131k-200k-distinct-declared-sequence-values range
//     (docs/03-project-control/candidates/mod-live-gap-assessment-001.md, G4;
//     reproduced first-hand at 200k in the F1 finding) — with roughly 5x
//     headroom above that named scale;
//   - it stays measured, first-hand, at low tens of milliseconds on this
//     ceiling (a 1,000,000-element fill measured ~20ms in this repo's own
//     environment; the F1 finding's own table shows 1e6 at ~31ms), several
//     orders of magnitude under any reasonable synchronous-stall budget, and
//     bounds the `missing[]` allocation to at most 1,000,000 small-integer
//     entries (a few MB, not the ~100M-entry / multi-second stall the F1
//     finding reproduced at 1e8);
//   - it is far below the 1e8 (~3.6s stall) and 1e9 (`RangeError`) magnitudes
//     the F1 finding reproduced, so both of those scenarios land safely on
//     the "span exceeded, not analyzed" side rather than the "attempt it and
//     hope" side.
// A future slice may make this configurable; today it is a single documented
// constant so the bound is auditable in one place.
export const MAX_SEQUENCE_GAP_SPAN = 1_000_000;

// Gaps: holes in the event stream's declared sequence range [min..max].
// Returns { boundedOut: false, missing } with the ascending list of missing
// sequence numbers (empty if none / <1 sequence), or — when the declared span
// exceeds MAX_SEQUENCE_GAP_SPAN — { boundedOut: true, min, max, span, limit }
// WITHOUT ever materializing the range. Never throws: min/max are computed by
// a manual reduce (not `Math.min(...set)`/`Math.max(...set)`, which overflows
// V8's call-argument limit once `present` holds roughly >100k distinct values
// — the second crash mode the F1 finding reproduced at 200k).
function sequenceGaps(eventDescriptors) {
  const present = new Set();
  for (const d of eventDescriptors) {
    if (d.sequence !== undefined) present.add(d.sequence);
  }
  if (present.size === 0) return { boundedOut: false, missing: [] };
  let min = Infinity;
  let max = -Infinity;
  for (const s of present) {
    if (s < min) min = s;
    if (s > max) max = s;
  }
  const span = max - min;
  if (span > MAX_SEQUENCE_GAP_SPAN) {
    return { boundedOut: true, min, max, span, limit: MAX_SEQUENCE_GAP_SPAN };
  }
  const missing = [];
  for (let s = min; s <= max; s += 1) {
    if (!present.has(s)) missing.push(s);
  }
  return { boundedOut: false, missing };
}

// --- Assembler --------------------------------------------------------------

// assembleReplayPackage(input, { now }) — assemble a frozen replay-package VIEW
// over caller-supplied, already-verified records.
//
//   input: {
//     eventRecords?, evidenceRecords?, contextReceipts?,
//     handoffEnvelopes?, policyDecisions?     // each an array of records;
//   }                                          // absent => empty stream
//   options: { now }                           // injected clock (fn or scalar)
//
// Each record: { sourceClass: <one of SOURCE_CLASSES>,
//                sequence?, idempotencyKey?, contentHash?, source? }.
//
// Success shape (deep-frozen; contains ONLY assembler-owned objects — no caller
// record reference, so the freeze cannot touch the caller's inputs):
//   {
//     ok: true,
//     data_untrusted: true,
//     package: {
//       assembledAt,                           // the injected `now` value
//       streams: { <name>: <count> },          // per-stream record counts
//       sourceClasses: { <class>: [ {stream,index}, ... ] },  // segregation
//       findings: [ ...ordering/dup/contradiction/gap ],       // advisory data
//       gaps: [ ...missing sequence numbers ] | null           // also in findings;
//                                                               // null means the
//                                                               // declared span
//                                                               // exceeded
//                                                               // MAX_SEQUENCE_GAP_SPAN
//                                                               // and was NOT
//                                                               // analyzed (see the
//                                                               // SEQUENCE_GAP_
//                                                               // ANALYSIS_SPAN_
//                                                               // EXCEEDED finding) —
//                                                               // never conflate this
//                                                               // with "no gaps".
//     }
//   }
//
// Denial shape (deep-frozen): { ok: false, code: DENY_REPLAY_MALFORMED, message }.
// Denies atomically on the first offending stream/record — never partial.
export function assembleReplayPackage(input, options) {
  // Phase A — ATOMIC SNAPSHOT of every consulted input, before any evaluation.
  const nowSnap = snapshotNow(options);
  if (!nowSnap.ok) {
    return deny("options.now must be injected as a non-blank string, a finite number, or a function returning one");
  }
  const streamSnap = snapshotStreams(input);
  if (!streamSnap.ok) {
    return deny("input must be an object whose record streams, when present, are arrays");
  }

  // Snapshot every record in every stream into self-owned descriptors. ALL
  // reads complete here, before any cross-record reconciliation.
  const descriptorsByStream = {};
  const sourceClasses = {};
  for (const c of SOURCE_CLASSES) sourceClasses[c] = [];
  const streamCounts = {};

  for (const stream of STREAM_NAMES) {
    const records = streamSnap.streams[stream];
    streamCounts[stream] = records.length;
    const descriptors = [];
    for (let index = 0; index < records.length; index += 1) {
      const snap = snapshotRecord(records[index], stream, index);
      if (!snap.ok) {
        return deny(`${stream}[${index}]: ${snap.detail}`);
      }
      descriptors.push(snap.descriptor);
      sourceClasses[snap.descriptor.sourceClass].push(
        Object.freeze({ stream, index })
      );
    }
    descriptorsByStream[stream] = descriptors;
  }

  // Phase B — RECONCILIATION over the EVENT stream only (B3/B7). Evidence,
  // context, handoff, and policy records are segregated above but never
  // sequence-reconciled against events.
  const eventDescriptors = descriptorsByStream.eventRecords;
  const gapResult = sequenceGaps(eventDescriptors);
  const findings = [
    ...orderingDisorderFindings(eventDescriptors),
    ...correlationFindings(eventDescriptors)
  ];
  // `gaps` is `null` (never `[]`) when the span exceeded the ceiling, so a
  // caller cannot mistake "not analyzed" for "analyzed, no gaps found" (F1
  // fix: fail-closed and observable, not a silent lie about completeness).
  let gaps;
  if (gapResult.boundedOut) {
    gaps = null;
    findings.push(
      Object.freeze({
        type: "SEQUENCE_GAP_ANALYSIS_SPAN_EXCEEDED",
        code: GAP_ANALYSIS_SPAN_EXCEEDED,
        boundedOut: true,
        min: gapResult.min,
        max: gapResult.max,
        span: gapResult.span,
        limit: gapResult.limit,
        note:
          `the event stream's declared sequence range spans ${gapResult.span} ` +
          `(min ${gapResult.min}, max ${gapResult.max}), exceeding the ` +
          `${gapResult.limit}-wide MAX_SEQUENCE_GAP_SPAN ceiling; gap analysis ` +
          "was not performed for this range rather than crashing or silently " +
          "reporting it as gapless (F1 fix, SECB-LIVE-EVENT-001)."
      })
    );
  } else {
    gaps = gapResult.missing;
    if (gaps.length > 0) {
      findings.push(
        Object.freeze({
          type: "SEQUENCE_GAP",
          missing: Object.freeze([...gaps]),
          note:
            "the event stream's declared sequence range has holes; " +
            "surfaced as a gap finding (SECB-LIVE-EVENT-001), never backfilled."
        })
      );
    }
  }

  return deepFreeze({
    ok: true,
    data_untrusted: true,
    package: {
      assembledAt: nowSnap.value,
      streams: streamCounts,
      sourceClasses,
      findings,
      gaps
    }
  });
}
