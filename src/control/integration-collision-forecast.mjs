// MOD-INTEG Slice S2 — Collision-forecast, PURE and UNWIRED.
//
// Purpose (closes MI-3's consumption gap per
// docs/03-project-control/candidates/mod-integ-queue-gap-assessment-001.md
// §4 Slice S2, "Collision-forecast wiring"): given a NEW merge-candidate's
// declared write set and the IntegrationQueueLedger's own `records` (the same
// raw record array `IntegrationQueueLedger#appendEntry`'s `preWriteCheck`
// hook receives — see the IntegrationQueueLedger class in src/ledger/), forecast
// whether the candidate would collide with any currently SUBMITTED/IN_REVIEW
// entry already queued, and at what O-level.
//
// Naming note: the gap assessment's own S2 sketch (§4) proposed the file name
// `src/control/integration-collision-check.mjs` and the function name
// `checkCollisionAgainstQueue(candidateEntry, activeEntries)`. This producer's
// dispatch instructions name the function `forecastCollision(candidateWriteSet,
// records)` explicitly and frame the whole slice as "collision-forecast wiring"
// / "forecast whether a NEW candidate... collides" throughout — a forecast a
// future orchestrator consults for a not-yet-submitted candidate, not a
// deny/block gate over an already-constructed queue entry. This file follows
// the dispatch instructions' naming (more specific, and matches the "forecast,
// not enforcement" scope discipline below); the assessment's sketch is cited
// here so a future reader does not treat the naming difference as an
// undisclosed deviation from the plan it continues.
//
// REUSE, not reimplementation (per assessment §3 B4 / task dispatch): ALL
// collision classification is delegated to MOD-WSPACE's existing pure
// evaluator, `evaluateOverlap` from src/control/overlap-policy.mjs, imported
// read-only and unmodified. This file adds no path-containment logic, no
// O-ladder logic, and no doctrine-string logic of its own — every field of
// evaluateOverlap's result (`overlapClass`, `control`, `overlap`, or the deny
// `code`/`message`) is threaded straight through to this module's own return
// value, never re-derived, renamed, or lossily summarized. `OVERLAP_ORDER` is
// imported (not re-invented) to rank multiple simultaneous collisions by
// severity.
//
// Scope discipline (dispatch requirement, matches the assessment's own S2
// R-class note "pure evaluator, reuses overlap-policy.mjs verbatim"):
//   - This is a FORECAST/advisory function, not an enforcement gate. It is
//     NOT called from IntegrationQueueLedger#appendEntry's preWriteCheck, and
//     it does not veto, block, or mutate anything. Wiring a real
//     forecastCollision(...) call into any live append/submission path is a
//     separate, later, operator-gated decision (assessment §4 Slice S2 note,
//     §5 non-goal #5) — out of scope for this slice.
//   - No new ledger, no new schema, no new contract. IntegrationQueueLedger
//     and its integrationQueueEntry contract are read-shape-compatible only:
//     this module consumes the SAME `records` array shape
//     IntegrationQueueLedger already hands to preWriteCheck (an array of
//     `{ entry: { payload: { queue_entry_id, version, status,
//     declared_write_set, ... } }, ... }` records) and re-derives "which
//     entries are CURRENTLY queued" using the identical highest-version-per-
//     queue_entry_id + SUBMITTED/IN_REVIEW-only reduction
//     IntegrationQueueLedger's own private `#detectDuplicateClaim` /
//     `latestByEntryId` already use. That small reduction (a handful of
//     lines, no collision math) is intentionally re-expressed locally here,
//     not imported, so this slice touches zero bytes of the already
//     independently-reviewed, APPROVE_FOR_MERGE-verdicted S1 ledger file —
//     "No new ledger" per the assessment's own S2 file list is read literally
//     as "do not edit the ledger file at all," not merely "do not add a
//     second ledger class."
//   - Doctrine dimensions overlap-policy.mjs cannot derive from raw paths
//     alone (`sameModule`, `sameSymbol`, `protectedBranch`, `globalConfig`)
//     are NOT fabricated here. IntegrationQueueLedger's `integrationQueueEntry`
//     contract (contracts/integration-queue-entry.schema.json) carries no
//     module-map, symbol-table, protected-branch, or global-config
//     classification for a queue entry — only `declared_write_set` (an array
//     of canonical paths). This module therefore answers all four dimensions
//     `false`, the exact "O0 floor" convention overlap-policy.mjs's OWN test
//     suite already establishes (tests/overlap-policy.test.mjs's `evalO`
//     helper: "supplies a fully-answered, non-escalating doctrine frame...
//     Defaults are the O0 floor"). This is a real, disclosed scope limit, not
//     a silent one: this forecast can only ever surface O0 (no collision) or
//     O2 (file/path-level collision, the one dimension `declared_write_set`
//     alone can support) — never O1/O3/O4/O5, which need module/symbol/
//     branch/config metadata this ledger does not collect. A future slice
//     that wants full O-ladder fidelity would need to extend the queue-entry
//     contract with that metadata first; that is a new, separately-governed
//     decision, not something this slice invents a value for.

import { evaluateOverlap, OVERLAP_ORDER } from "./overlap-policy.mjs";

// Mirrors IntegrationQueueLedger's own ACTIVE_STATUSES set exactly (currently
// "in the queue" = not yet resolved to a terminal state). Duplicated here
// deliberately (see header) rather than imported, so this file adds zero
// coupling to the ledger's internals beyond the `records` shape it already
// documents as its preWriteCheck contract.
const ACTIVE_STATUSES = new Set(["SUBMITTED", "IN_REVIEW"]);

const deny = (code, message, extra) => Object.freeze({ ok: false, code, message, ...extra });

// Reduce a raw ledger `records` array down to the CURRENT (highest-version)
// payload for each distinct queue_entry_id, then keep only those whose
// current status is still SUBMITTED/IN_REVIEW. Same two-step shape as
// IntegrationQueueLedger's private `latestByEntryId` + `#detectDuplicateClaim`
// (a queue entry's true lifecycle state is its latest version only; an older,
// superseded version's status must never be consulted once a newer version
// exists), re-expressed locally rather than imported — see header note.
function currentlyQueuedPayloads(records) {
  const latest = new Map();
  for (const record of records) {
    const payload = record.entry.payload;
    const existing = latest.get(payload.queue_entry_id);
    if (!existing || payload.version > existing.version) {
      latest.set(payload.queue_entry_id, payload);
    }
  }
  return [...latest.values()].filter((payload) => ACTIVE_STATUSES.has(payload.status));
}

// Self-comparison validity probe for the candidate's own write set, REUSING
// evaluateOverlap exactly as overlap-policy.mjs's own internal
// `validateWriteSet` reuses evaluateWriteSet against itself (a well-formed,
// non-empty, canonical write set is always a valid "subset of itself"). This
// lets a malformed/empty candidateWriteSet fail closed at the TOP of
// forecastCollision, surfacing overlap-policy's own deny code/message
// verbatim, even when `records` has zero currently-queued entries to compare
// against (an empty queue must never be mistaken for "candidate is valid").
function selfCheck(writeSet) {
  return evaluateOverlap({
    writeSetA: writeSet,
    writeSetB: writeSet,
    sameModule: false,
    sameSymbol: false,
    protectedBranch: false,
    globalConfig: false
  });
}

// forecastCollision(candidateWriteSet, records)
//   -> Object.freeze({
//        ok: true,
//        collides: boolean,
//        mostRestrictiveClass: "O0".."O5" | null,
//        collisions: [...],   // comparisons where overlapClass !== "O0"
//        comparisons: [...],  // EVERY currently-queued entry compared, incl. clean ones
//        errors: [...]        // comparisons overlap-policy.mjs itself denied (malformed data)
//      })
//   -> Object.freeze({ ok: false, code, message, overlapDenial })  // candidateWriteSet itself invalid
//
// Each entry in `comparisons`/`collisions` is
//   Object.freeze({ queueEntryId, candidateBranch, status, overlap })
// where `overlap` is evaluateOverlap's OWN, unmodified result object
// (`{ ok: true, overlapClass, control, overlap }` or `{ ok: false, code,
// message }`) — the underlying primitive's reasoning surfaced directly, never
// re-derived or summarized into a different shape.
//
// This function performs NO I/O, holds NO lock, and calls NO ledger method —
// `records` is supplied by the caller exactly as IntegrationQueueLedger's own
// preWriteCheck hook already receives it (or as returned by `ledger.read()`);
// this module never calls `this.read()` or any ledger method itself.
export function forecastCollision(candidateWriteSet, records) {
  try {
    const candidateSelfCheck = selfCheck(candidateWriteSet);
    if (!candidateSelfCheck.ok) {
      return deny(
        "DENY_FORECAST_INVALID_CANDIDATE",
        `candidateWriteSet is invalid: ${candidateSelfCheck.message}`,
        { overlapDenial: candidateSelfCheck }
      );
    }

    if (!Array.isArray(records)) {
      return deny("DENY_FORECAST_MALFORMED_RECORDS", "records must be an array");
    }

    const queued = currentlyQueuedPayloads(records);

    const comparisons = queued.map((payload) => {
      const overlap = evaluateOverlap({
        writeSetA: candidateWriteSet,
        writeSetB: payload.declared_write_set,
        sameModule: false,
        sameSymbol: false,
        protectedBranch: false,
        globalConfig: false
      });
      return Object.freeze({
        queueEntryId: payload.queue_entry_id,
        candidateBranch: payload.candidate_branch,
        status: payload.status,
        overlap
      });
    });

    const errors = comparisons.filter((c) => !c.overlap.ok);
    const collisions = comparisons.filter((c) => c.overlap.ok && c.overlap.overlapClass !== "O0");

    const mostRestrictiveClass = collisions.length === 0
      ? null
      : collisions.reduce((worst, c) => (
          OVERLAP_ORDER.indexOf(c.overlap.overlapClass) > OVERLAP_ORDER.indexOf(worst)
            ? c.overlap.overlapClass
            : worst
        ), collisions[0].overlap.overlapClass);

    return Object.freeze({
      ok: true,
      collides: collisions.length > 0,
      mostRestrictiveClass,
      collisions: Object.freeze(collisions),
      comparisons: Object.freeze(comparisons),
      errors: Object.freeze(errors)
    });
  } catch {
    // Outer belt-and-braces guard, mirroring overlap-policy.mjs's own
    // evaluateOverlap wrapper: any unexpected throw (hostile getter, Proxy
    // trap, malformed record shape) degrades to a frozen denial instead of
    // propagating past this module's structured-result boundary.
    return deny("DENY_FORECAST_MALFORMED_RECORDS", "candidateWriteSet or records could not be safely inspected");
  }
}
