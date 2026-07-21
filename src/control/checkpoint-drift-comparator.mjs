// MOD-RUNTIME Slice S2 — Checkpoint drift comparator (PURE, UNWIRED).
//
// Purpose (closes checkpoint-ledger non-goal #3, the deferred half of V-016
// "Recovery: verified checkpoint resumes / drifted checkpoint denied"): give
// `src/` a single pure, frozen, deny-by-default answer to "does the observed
// restore state still match the state a checkpoint recorded — i.e. is a resume
// VERIFIED, or has the world DRIFTED underneath the checkpoint?". The
// CheckpointLedger primitive gives existence + fail-closed lookup only; it
// explicitly does NOT compare a checkpoint's recorded position/content against
// an observed restore state (see checkpoint-ledger.mjs restore-semantics note,
// step (3) "explicitly deferred"). This evaluator is that step (3), and NOTHING
// more: it decides verified-resume vs drift-denied over data passed in by the
// caller.
//
// Scope discipline: pure decision over inputs. The pure comparator does no I/O,
// no persistence, no transport, and needs NO clock (the comparison is a pure
// equality of recorded-vs-observed evidence and is time-independent, so no clock
// is injected — there is no time-derived branch to make deterministic). The one
// composing helper (evaluateResumeFromLedger) reads a CheckpointLedger through
// its EXISTING read-only resolvers (resolveLatest / resolveCheckpoint) and never
// mutates it. NOTHING consumes this evaluator in this slice — wiring it into a
// restore-execution / self-pilot / intervention-replay path is a later,
// separately governed step (candidate doc §"CANDIDATE — not wired/adopted").
//
// Fail-closed doctrine (the load-bearing rule): a resume is PERMITTED only on
// affirmative, fully-verifiable evidence that the observed triple
// (content_hash, sequence, state_snapshot_ref) is byte-equal to the checkpoint's
// recorded triple. ANY mismatch, ANY missing/unusable comparison field, ANY
// unreadable input, and ANY ambiguity resolves to DENY. The evaluator NEVER
// returns "no drift" for a comparison it could not actually perform — an
// un-performable comparison is DENY_DRIFT_UNVERIFIABLE, never a silent resume.
//
// House style (matches src/control/write-set-policy.mjs): result objects. Every
// return value is a deep-frozen `{ ok: true, verified: true }` or
// `{ ok: false, code, message }`. Audit-before-effect holds by construction: the
// returned frozen result IS the decision record; the pure comparator has no side
// effect, so a caller necessarily observes the decision before acting on it.

// The full closed set of deny codes this comparator can emit, frozen so callers
// may switch on it without risk of silent drift.
export const CHECKPOINT_DRIFT_DENY_CODES = Object.freeze([
  // Input container itself is not a usable object, or a hostile accessor / Proxy
  // trap made the input impossible to inspect. Contained, never thrown.
  "DENY_DRIFT_MALFORMED",
  // Every comparison field was readable and well-formed on both sides, but at
  // least one recorded value differs from the observed value: the world drifted.
  "DENY_CHECKPOINT_DRIFT",
  // A comparison could not be performed at all — a required field is missing or
  // not a usable value on one/both sides. Fail-closed: an un-performable
  // comparison DENIES; it is NEVER reported as "no drift".
  "DENY_DRIFT_UNVERIFIABLE"
]);

const NULL_BYTE = "\0";
const isCleanString = (v) => typeof v === "string" && v.length > 0 && !v.includes(NULL_BYTE);
const isSequence = (v) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

// A sentinel for "this own key was absent". Compared by identity only; never
// emitted and never a legal comparison value, so it can only ever DENY.
const MISSING = Symbol("checkpoint-drift-missing-field");

// The comparison surface: the exact three evidence fields that decide a resume.
// checkpointKey is the checkpoint contract's field name; observedKey is the
// field name on the caller-supplied observed/restore state. valid() gates each
// value to a usable comparison type BEFORE any equality is considered.
const FIELD_SPECS = Object.freeze([
  Object.freeze({ label: "content_hash", checkpointKey: "content_hash", observedKey: "content_hash", valid: isCleanString }),
  Object.freeze({ label: "sequence", checkpointKey: "sequence_at_checkpoint", observedKey: "sequence", valid: isSequence }),
  Object.freeze({ label: "state_snapshot_ref", checkpointKey: "state_snapshot_ref", observedKey: "state_snapshot_ref", valid: isCleanString })
]);

const CHECKPOINT_KEYS = Object.freeze(FIELD_SPECS.map((spec) => spec.checkpointKey));
const OBSERVED_KEYS = Object.freeze(FIELD_SPECS.map((spec) => spec.observedKey));

const VERIFIED = Object.freeze({ ok: true, verified: true });
const deny = (code, message) => Object.freeze({ ok: false, code, message });

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// --- Atomic single-read snapshot (descriptor-trap-safe) ---------------------
// Snapshot exactly the needed keys of `obj` into a fresh own-data record.
//   - Reflect.ownKeys(obj) is consulted ONCE to establish own-membership, so a
//     value smuggled onto Object.prototype (prototype pollution) is NOT an own
//     key and resolves to MISSING (-> UNVERIFIABLE), never read.
//   - Each needed key is read AT MOST ONCE via a single [[Get]] (`obj[k]`), and
//     ONLY when it is a genuine own key — so a hostile own getter is invoked
//     exactly once (a throwing getter propagates to the extraction guard below
//     and becomes DENY_DRIFT_MALFORMED) and a getter that returns different
//     values on repeated reads CANNOT influence the decision because it is never
//     read twice (no TOCTOU).
//   - No getOwnPropertyDescriptor double-read: membership comes from ownKeys and
//     the value comes from the single [[Get]], so a Proxy whose descriptor and
//     get traps disagree cannot split the check from the value it validates.
// May throw ONLY into the single extraction try/catch in evaluateResume.
function snapshotOwn(obj, keys) {
  const own = new Set(Reflect.ownKeys(obj));
  const snap = {};
  for (const key of keys) {
    snap[key] = own.has(key) ? obj[key] : MISSING;
  }
  return snap;
}

// evaluateResume({ checkpoint, observedState })
//   -> Object.freeze({ ok: true, verified: true })            resume PERMITTED
//   -> Object.freeze({ ok: false, code, message })            resume DENIED
//
// Decision precedence (most structural first; deny-by-default throughout):
//   1. checkpoint / observedState not a plain object   -> DENY_DRIFT_MALFORMED
//   2. hostile/unreadable extraction (getter/Proxy)    -> DENY_DRIFT_MALFORMED (contained)
//   3. any comparison field missing/unusable either side -> DENY_DRIFT_UNVERIFIABLE
//   4. all fields usable but any recorded != observed  -> DENY_CHECKPOINT_DRIFT
//   else (all three fields present, usable, equal)      -> ok, verified
//
// Note the ordering of (3) before (4): verifiability is checked for ALL fields
// before any equality is judged, so a comparison we could not even perform is
// reported honestly as UNVERIFIABLE and is NEVER downgraded to a soft "no drift"
// or misreported as DRIFT.
function evaluateResumeInternal({ checkpoint, observedState }) {
  if (!isPlainObject(checkpoint)) {
    return deny("DENY_DRIFT_MALFORMED", "checkpoint must be a plain object");
  }
  if (!isPlainObject(observedState)) {
    return deny("DENY_DRIFT_MALFORMED", "observedState must be a plain object");
  }

  let cpSnap, obSnap;
  try {
    // Each needed field is read exactly once here, before any validation runs.
    cpSnap = snapshotOwn(checkpoint, CHECKPOINT_KEYS);
    obSnap = snapshotOwn(observedState, OBSERVED_KEYS);
  } catch {
    // Any throw from a hostile getter / Proxy trap lands here and is converted
    // to the frozen malformed denial — it can never propagate out.
    return deny("DENY_DRIFT_MALFORMED", "input could not be safely inspected");
  }

  // (3) Verifiability first: every field must be present and well-typed on BOTH
  // sides, else the comparison is un-performable and fails closed.
  for (const spec of FIELD_SPECS) {
    const recorded = cpSnap[spec.checkpointKey];
    const observed = obSnap[spec.observedKey];
    if (recorded === MISSING || !spec.valid(recorded)) {
      return deny(
        "DENY_DRIFT_UNVERIFIABLE",
        `checkpoint ${spec.checkpointKey} is missing or unusable - cannot verify resume, fail-closed`
      );
    }
    if (observed === MISSING || !spec.valid(observed)) {
      return deny(
        "DENY_DRIFT_UNVERIFIABLE",
        `observed ${spec.observedKey} is missing or unusable - cannot verify resume, fail-closed`
      );
    }
  }

  // (4) Equality: any single divergence is drift; the resume is denied.
  for (const spec of FIELD_SPECS) {
    if (cpSnap[spec.checkpointKey] !== obSnap[spec.observedKey]) {
      return deny(
        "DENY_CHECKPOINT_DRIFT",
        `observed ${spec.observedKey} does not match recorded ${spec.checkpointKey} - checkpoint drift, resume denied`
      );
    }
  }

  return VERIFIED;
}

// Outer belt-and-braces guard: the extraction try/catch already contains every
// known hostile-input throw, so this is expected to be unreachable — it exists
// so ANY future throw introduced anywhere in the comparator still degrades to
// the frozen malformed denial instead of escaping the structured-denial
// boundary. A resume is thus fail-closed against unexpected faults too.
export function evaluateResume(input) {
  try {
    if (!isPlainObject(input)) {
      return deny("DENY_DRIFT_MALFORMED", "input must be a plain object with checkpoint and observedState");
    }
    return evaluateResumeInternal(input);
  } catch {
    return deny("DENY_DRIFT_MALFORMED", "input could not be safely inspected");
  }
}

// evaluateResumeFromLedger({ ledger, sessionId?, checkpointId?, observedState })
//   -> Object.freeze(...) result from evaluateResume, OR
//   -> Object.freeze({ ok: false, code: "DENY_DRIFT_UNVERIFIABLE", ... }) when
//      the checkpoint cannot be resolved from the ledger, OR
//   -> THROWS the ledger's own LedgerError (e.g. LEDGER_INTEGRITY_FAILURE) when
//      the persisted ledger is tampered.
//
// Composition, not modification: this helper fetches the checkpoint through the
// CheckpointLedger's EXISTING fail-closed read-only resolvers and hands the
// resolved record to the pure comparator. It never appends, never rewrites, and
// holds no reference to ledger internals beyond the two resolver methods.
//
// Tamper handling (deliberate): resolveLatest / resolveCheckpoint call the
// ledger's hash-chain-verified read(), which THROWS LedgerError
// LEDGER_INTEGRITY_FAILURE on a tampered file. That throw is NOT swallowed here:
// a tamper is an integrity fault that must SURFACE before any comparison, not a
// soft resume decision. Every OTHER (non-throwing) resolver outcome that is not
// a clean ALLOW — unknown checkpoint/session, invalid id — means the checkpoint
// could not be fetched and therefore the resume cannot be verified, which is
// DENY_DRIFT_UNVERIFIABLE (fail-closed), never a silent resume.
export function evaluateResumeFromLedger({ ledger, sessionId, checkpointId, observedState } = {}) {
  if (
    ledger === null ||
    typeof ledger !== "object" ||
    typeof ledger.resolveCheckpoint !== "function" ||
    typeof ledger.resolveLatest !== "function"
  ) {
    return deny("DENY_DRIFT_MALFORMED", "ledger must expose resolveCheckpoint and resolveLatest");
  }

  const hasCheckpointId = checkpointId !== undefined && checkpointId !== null;
  const hasSessionId = sessionId !== undefined && sessionId !== null;
  if (hasCheckpointId === hasSessionId) {
    return deny("DENY_DRIFT_MALFORMED", "exactly one of checkpointId or sessionId is required");
  }

  // Read-only resolve. A tampered ledger throws LEDGER_INTEGRITY_FAILURE here and
  // is intentionally allowed to surface BEFORE any comparison is attempted.
  const resolved = hasCheckpointId ? ledger.resolveCheckpoint(checkpointId) : ledger.resolveLatest(sessionId);
  if (!resolved || resolved.code !== "ALLOW" || !isPlainObject(resolved.checkpoint)) {
    const underlying = resolved && resolved.code ? resolved.code : "UNRESOLVED";
    return deny(
      "DENY_DRIFT_UNVERIFIABLE",
      `checkpoint could not be resolved (${underlying}) - cannot verify resume, fail-closed`
    );
  }

  return evaluateResume({ checkpoint: resolved.checkpoint, observedState });
}
