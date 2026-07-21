import { validateContract } from "../contracts/contract-validator.mjs";
import { DurableLedger, LedgerError } from "./durable-ledger.mjs";

// MOD-INTEG Slice S1 — Queue-entry contract + IntegrationQueueLedger, UNWIRED
// (closes MI-1's schema/persistence half, advances MI-8) per
// docs/03-project-control/candidates/mod-integ-queue-gap-assessment-001.md §4
// Slice S1 (bst/mod-integ-queue-assessment).
//
// This is a ledger PRIMITIVE, not a running queue/merge service. It gives an
// integration-queue entry (a submitted merge-candidate branch claiming a slot
// in the serialized-integration order) durable, hash-chained, idempotent,
// optimistic-concurrency-controlled, append-only persistence, plus the one
// atomic invariant this module exists to enforce: a candidate branch cannot
// be claimed (SUBMITTED/IN_REVIEW) by two independent queue entries at once.
// Nothing in this file performs collision-forecasting against declared write
// sets (MI-3/overlap-policy.mjs — sketched S2, not this slice), merge
// simulation or composite verification (MI-4 — sketched S3), ordering/
// priority (MI-5), or any live git/CI wiring. It does not read from, write
// to, or supersede docs/03-project-control/candidates/
// module-completion-tracker-001.md (assessment boundary B6) — that markdown
// table remains the operator-facing coordination surface; this is a
// candidate, parallel data structure only.
//
// ATOMIC DUPLICATE-CLAIM GATE — DESIGNED IN FROM THE START (assessment §6,
// MI-2, boundary B1), NOT bolted on afterward. This project has already
// shipped two after-the-fact fixes and flagged a third near-miss for the
// exact same bug shape this session:
//   1. MOD-LIVE (bst/mod-live-s1-toctou-fix-001): assessEnvelopeConformance
//      read sibling fields via live getters at different points instead of
//      one atomic snapshot.
//   2. MOD-WSPACE (bst/mod-wspace-s3-single-writer-toctou-fix-001, commit
//      108bd0f + fast-follow 338ba04): WorkspaceLeaseLedger's single-writer
//      gate took an UNLOCKED `this.read()` snapshot BEFORE calling the
//      locked `append()`, so two producers could both pass a stale
//      "no active lease" check and both write — fixed by moving the scan
//      INSIDE `DurableLedger.append`'s own lock via the `preWriteCheck` hook
//      (durable-ledger.mjs), so the gate consults the SAME freshly-read,
//      freshly-verified `records` snapshot the write itself is about to use,
//      never a separate, independently-racing read.
//   3. MOD-SKILL (addendum, not yet built): flagged the identical risk for a
//      future promotion/revocation gate before any code was written.
//
// `#detectDuplicateClaim` below follows fix #2's established, twice-
// battle-tested shape exactly: it is invoked as `preWriteCheck(records, entry)`
// from `appendEntry`'s call into the inherited `append()`, and it takes
// `records` ONLY as the parameter handed to it inside the lock — it never
// calls `this.read()`. This file has no fourth instance of the bug to fix
// later; the citation above is precedent this slice follows, not a novel
// design cited for the first time here.
//
// Versioned-record convention (mirrors WorkspaceLeaseLedger's lease_id/
// version composite entryId): a queue entry's identity is `queue_entry_id`;
// each durable append is a numbered VERSION of that entry (a status
// transition — e.g. SUBMITTED -> IN_REVIEW -> MERGED — re-anchors the record
// as a higher version under the same queue_entry_id, exactly like a lease
// renewal). entryId is the composite `${queue_entry_id}@v${version}`, so the
// base ledger's duplicate-entryId dedup rejects an exact (queue_entry_id,
// version) replay while still letting one entry accumulate multiple
// lifecycle versions. The duplicate-CLAIM gate below is a SEPARATE, coarser
// invariant: no OTHER queue_entry_id may hold an active claim on the same
// candidate_branch while this one is still SUBMITTED/IN_REVIEW. A
// self-transition (same queue_entry_id, next version) is never a conflict —
// exactly as a lease renewal is never a single-writer conflict for
// WorkspaceLeaseLedger.
//
// project_id/work_package_id/session_id: the assessment's own illustrative
// S1 field list (§4) does not separately name work_package_id/session_id.
// DurableLedger's entry envelope structurally requires both as non-empty
// fields for every ledger-backed record type in this codebase (every
// existing DurableLedger subclass — Checkpoint/Delegation/WorkspaceLease/
// Event/Evidence/Decision/Knowledge/Outcome — carries both). Rather than
// invent a misleading placeholder (e.g. reusing candidate_branch as
// sessionId), this slice adds `work_package_id` (the work package this
// candidate branch implements — plain traceability identifier only, no
// import of or wiring into goal-graph-service, preserving boundary B3) and
// `session_id` (the session that most recently submitted/updated this queue
// entry) as required contract fields, matching this project's own
// established schema shape exactly. Recorded here for asynchronous GOV
// ratification at merge review per AMD-002's advise-and-proceed rule, same
// disclosure discipline the MOD-RUNTIME S1 checkpoint-ledger producer used
// for its own `source_ledger_id` addition beyond its assessment's literal
// field list.

const ACTIVE_STATUSES = new Set(["SUBMITTED", "IN_REVIEW"]);

// Status-transition validity — closes the gap disclosed in the independent
// review (docs/03-project-control/candidates/
// mod-integ-queue-s1-ledger-independent-review-001.md, "status" finding):
// neither this contract nor this ledger enforced any transition discipline,
// so a caller could insert `status: "MERGED"` directly as version 1, or walk
// a terminal (MERGED/REJECTED) entry backward to an active status under the
// SAME queue_entry_id. The only legal path for one queue_entry_id's lifecycle
// is version 1 = SUBMITTED, then SUBMITTED -> IN_REVIEW -> {MERGED,
// REJECTED}; a new version may also re-affirm (stay at) SUBMITTED or
// IN_REVIEW, but MERGED/REJECTED are terminal — no further version is ever
// valid once reached, regardless of the status it claims. Keyed by
// FROM-status; a `from` with no entry here (MERGED, REJECTED, or anything
// unrecognized) has zero legal next states.
const VALID_STATUS_TRANSITIONS = {
  SUBMITTED: new Set(["SUBMITTED", "IN_REVIEW"]),
  IN_REVIEW: new Set(["IN_REVIEW", "MERGED", "REJECTED"])
};

function integrationQueueEntry(entry, idempotencyKey) {
  return {
    entryId: `${entry.queue_entry_id}@v${entry.version}`,
    projectId: entry.project_id,
    workPackageId: entry.work_package_id,
    sessionId: entry.session_id,
    actorId: entry.submitted_by,
    type: "INTEGRATION_QUEUE_ENTRY",
    payload: entry,
    timestamp: entry.submitted_at,
    idempotencyKey
  };
}

const deny = (code, message, extra) => Object.freeze({ ok: false, code, message, ...extra });

// Deep-freeze a plain data value so a resolved queue entry cannot be mutated
// by a caller and reflected back into the ledger's cloned state (mirrors
// WorkspaceLeaseLedger's deepFreeze).
function deepFreeze(value) {
  if (value === null || typeof value !== "object") return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

// Atomic single-read snapshot of a caller-supplied queue entry. Every own
// string-keyed property is read EXACTLY ONCE via structuredClone, which
// produces trap-free plain data and preserves ALL own enumerable keys (so a
// smuggled additionalProperties key still reaches — and is rejected by — the
// closed schema). A hostile getter / Proxy trap that throws is contained
// here and never propagates a half-read object into validation, the
// duplicate-claim gate, or the hash chain. Because validateContract,
// #detectDuplicateClaim, AND integrationQueueEntry all consume this ONE
// snapshot, a value-varying getter cannot make the stored record differ from
// the validated/gated record (single-read TOCTOU closure, mirrors
// WorkspaceLeaseLedger's snapshotLease / write-set-policy REV-002).
function snapshotEntry(source) {
  if (source === null || typeof source !== "object" || Array.isArray(source)) {
    throw new LedgerError("DENY_QUEUE_ENTRY_MALFORMED", "integration queue entry must be an object");
  }
  try {
    return structuredClone(source);
  } catch {
    throw new LedgerError("DENY_QUEUE_ENTRY_MALFORMED", "integration queue entry could not be safely inspected");
  }
}

// A queue entry's CURRENT lifecycle state is its HIGHEST-version record, not
// every version ever appended (an older, superseded version's status must
// never be consulted once a newer version exists — e.g. v1 SUBMITTED, v2
// MERGED: the entry is MERGED, not "still SUBMITTED because v1 said so").
// This reduces `records` to one latest record per queue_entry_id BEFORE any
// active/claim decision is made, so both the duplicate-claim gate and
// resolveActiveClaim reason about current state only.
function latestByEntryId(records) {
  const latest = new Map();
  for (const record of records) {
    const payload = record.entry.payload;
    const existing = latest.get(payload.queue_entry_id);
    if (!existing || payload.version > existing.entry.payload.version) {
      latest.set(payload.queue_entry_id, record);
    }
  }
  return latest;
}

export class IntegrationQueueLedger extends DurableLedger {
  constructor({ filePath }) {
    super({ filePath, ledgerId: "secb-integration-queue-ledger" });
  }

  // Durable append of a validated integration-queue-entry record. The hash
  // chain, idempotency-key replay, optimistic concurrency (expectedSequence),
  // duplicate entry-id rejection, and writer-lock contention are all
  // inherited UNMODIFIED from DurableLedger.append — nothing below
  // reimplements or weakens any of it (mirrors CheckpointLedger.
  // appendCheckpoint / WorkspaceLeaseLedger.appendLease exactly). This method
  // adds three things on top: an atomic single-read snapshot of the caller
  // entry, the status-transition-validity gate, and the duplicate-claim gate
  // — the latter two both evaluated inside the SAME `preWriteCheck` call.
  //
  // Returns a frozen allow/deny envelope for the business-rule decision:
  //   { ok: true, record }  — where record is the base append result
  //   { ok: false, code: "DENY_INVALID_STATUS_TRANSITION", message, ... }
  //   { ok: false, code: "DENY_QUEUE_DUPLICATE_CLAIM", message, ... }
  // Structural problems (unreadable entry, contract-invalid, missing
  // idempotencyKey) fail closed by THROWING a typed error, exactly as the
  // sibling ledgers do; only the two business rules above return a
  // structured deny.
  appendEntry(entry, { expectedSequence, idempotencyKey } = {}) {
    const snapshot = snapshotEntry(entry);
    validateContract("integrationQueueEntry", snapshot);
    if (!idempotencyKey) {
      throw new LedgerError("DENY_MISSING_ENTRY_FIELDS", "idempotencyKey is required for integration-queue-entry append");
    }

    // Both business-rule gates run as ONE `preWriteCheck`, INSIDE
    // DurableLedger's own lock, against the SAME freshly-read+verified
    // `records` the base class is about to write against — not two separate,
    // differently-timed checks (this project has already paid for that
    // mistake once; see the mod-wspace-s3 single-writer-toctou-fix citation
    // above). A true idempotent replay (same queue_entry_id, version, AND
    // idempotencyKey) never reaches either gate below — DurableLedger.append
    // intercepts it earlier via its own idempotency-key replay check, before
    // preWriteCheck is invoked at all.
    const result = this.append(integrationQueueEntry(snapshot, idempotencyKey), {
      expectedSequence,
      preWriteCheck: (records) => {
        const invalidTransition = this.#detectInvalidStatusTransition(snapshot, records);
        if (invalidTransition) {
          return deny(
            "DENY_INVALID_STATUS_TRANSITION",
            `queue entry ${snapshot.queue_entry_id} cannot move from ${invalidTransition.fromStatus ?? "(no prior version)"} to ${invalidTransition.toStatus}`,
            { queueEntryId: snapshot.queue_entry_id, fromStatus: invalidTransition.fromStatus, toStatus: invalidTransition.toStatus }
          );
        }
        const conflict = this.#detectDuplicateClaim(snapshot, records);
        if (!conflict) return null;
        return deny(
          "DENY_QUEUE_DUPLICATE_CLAIM",
          `branch ${snapshot.candidate_branch} already has an active queue claim ${conflict.queueEntryId} (status ${conflict.status})`,
          { candidateBranch: snapshot.candidate_branch, conflictingQueueEntryId: conflict.queueEntryId, conflictingStatus: conflict.status }
        );
      }
    });

    if (result && result.ok === false) return result;
    return Object.freeze({ ok: true, record: result });
  }

  // Status-transition validity gate. Runs against the SAME `records`
  // parameter #detectDuplicateClaim (below) consumes — the locked,
  // freshly-verified snapshot `preWriteCheck` receives, never a separate
  // `this.read()`. Reduces `records` to the CURRENT (highest-version) record
  // for THIS entry's OWN queue_entry_id only (a different id is irrelevant
  // here; that cross-entry concern is #detectDuplicateClaim's job), then
  // checks whether `entry.status` is a legal next state from there:
  //   no prior version  -> only SUBMITTED is legal (this is version 1 of
  //                         this queue_entry_id's lifecycle)
  //   prior status X     -> only VALID_STATUS_TRANSITIONS[X] is legal;
  //                         MERGED/REJECTED have no entry in that table, so
  //                         ANY further version is denied once reached —
  //                         terminal really means terminal, forever.
  // Returns null (no problem) or { fromStatus, toStatus } describing the
  // illegal move. `fromStatus` is null when there is no prior version.
  #detectInvalidStatusTransition(entry, records) {
    const current = latestByEntryId(records).get(entry.queue_entry_id);
    if (!current) {
      return entry.status === "SUBMITTED" ? null : { fromStatus: null, toStatus: entry.status };
    }
    const fromStatus = current.entry.payload.status;
    const toStatus = entry.status;
    const allowed = VALID_STATUS_TRANSITIONS[fromStatus];
    return allowed && allowed.has(toStatus) ? null : { fromStatus, toStatus };
  }

  // Duplicate-claim gate. Scans `records` — the exact, already
  // locked+verified snapshot `DurableLedger.append` just read for this same
  // write (passed in via the `preWriteCheck` hook, never fetched
  // independently here) — for a DIFFERENT queue entry (a different
  // queue_entry_id) that still holds an ACTIVE claim (status SUBMITTED or
  // IN_REVIEW) on the SAME candidate_branch. A re-append of the same
  // queue_entry_id (idempotent replay, or a status-transition version bump —
  // SUBMITTED -> IN_REVIEW -> MERGED/REJECTED) is NOT a conflict: that is the
  // same claim's own lifecycle, not a second claimant. A branch whose only
  // prior entries are MERGED/REJECTED is also not conflicted — resolution
  // frees the branch for a fresh submission. Because `records` comes from
  // inside the locked critical section, a tampered ledger still fails closed
  // before this method ever runs (verifyRecords throws first).
  #detectDuplicateClaim(entry, records) {
    for (const record of latestByEntryId(records).values()) {
      const held = record.entry.payload;
      if (held.candidate_branch !== entry.candidate_branch) continue;
      if (held.queue_entry_id === entry.queue_entry_id) continue;
      if (ACTIVE_STATUSES.has(held.status)) {
        return { queueEntryId: held.queue_entry_id, status: held.status };
      }
    }
    return null;
  }

  // Fail-closed active-claim resolution by candidate_branch. Returns the
  // highest-version entry among those currently ACTIVE (SUBMITTED/IN_REVIEW)
  // for the branch, or a structured deny:
  //   invalid branch          -> DENY_QUEUE_INVALID_BRANCH
  //   no record for the branch -> DENY_QUEUE_UNKNOWN_BRANCH
  //   records but none active  -> DENY_QUEUE_NO_ACTIVE_CLAIM
  // mirrors CheckpointLedger.resolveLatest / WorkspaceLeaseLedger.
  // resolveActiveLease's deny-on-use discipline. read() verifies the chain,
  // so tamper fails closed with LEDGER_INTEGRITY_FAILURE before any entry is
  // returned.
  resolveActiveClaim(candidateBranch) {
    if (!candidateBranch || typeof candidateBranch !== "string") {
      return deny("DENY_QUEUE_INVALID_BRANCH", "candidateBranch must be a non-empty string");
    }
    // Reduce to each queue_entry_id's CURRENT (highest-version) state first —
    // an entry whose latest version is MERGED/REJECTED must never be
    // resurrected as "active" by an earlier, superseded version's status.
    const currentByEntryId = [...latestByEntryId(this.read()).values()];
    const forBranch = currentByEntryId.filter((record) => record.entry.payload.candidate_branch === candidateBranch);
    if (forBranch.length === 0) {
      return deny("DENY_QUEUE_UNKNOWN_BRANCH", `No queue entry recorded for branch: ${candidateBranch}`);
    }
    const active = forBranch.filter((record) => ACTIVE_STATUSES.has(record.entry.payload.status));
    if (active.length === 0) {
      return deny("DENY_QUEUE_NO_ACTIVE_CLAIM", `No active queue claim for branch: ${candidateBranch}`);
    }
    // At most one queue_entry_id should ever be active for a branch at once
    // (the duplicate-claim gate enforces this at write time); pick the
    // highest version defensively in case of any future relaxation.
    const latest = active.reduce(
      (best, record) => (record.entry.payload.version > best.entry.payload.version ? record : best),
      active[0]
    );
    return deepFreeze({
      ok: true,
      entry: structuredClone(latest.entry.payload),
      version: latest.entry.payload.version,
      sequence: latest.sequence
    });
  }

  // Fail-closed exact lookup by queue_entry_id: returns the highest-version
  // record for that id (its current lifecycle state), or NONE with a typed
  // reason, mirroring DelegationLedger.resolveDelegationRequest /
  // CheckpointLedger.resolveCheckpoint's deny-on-use shape.
  resolveEntry(queueEntryId) {
    if (!queueEntryId || typeof queueEntryId !== "string") {
      return { entry: null, code: "DENY_QUEUE_INVALID_ID", reason: "queueEntryId must be a non-empty string" };
    }
    const matches = this.read().filter((record) => record.entry.payload.queue_entry_id === queueEntryId);
    if (matches.length === 0) {
      return { entry: null, code: "DENY_QUEUE_UNKNOWN_ENTRY", reason: `Unknown queue entry: ${queueEntryId}` };
    }
    const latest = matches.reduce(
      (best, record) => (record.entry.payload.version > best.entry.payload.version ? record : best),
      matches[0]
    );
    return { entry: structuredClone(latest.entry.payload), version: latest.entry.payload.version, sequence: latest.sequence, code: "ALLOW" };
  }
}
