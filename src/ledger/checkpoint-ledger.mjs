import { validateContract } from "../contracts/contract-validator.mjs";
import { DurableLedger, LedgerError } from "./durable-ledger.mjs";

// MOD-RUNTIME Slice S1 (closes gap MR-1 in
// docs/03-project-control/candidates/mod-runtime-gap-assessment-001.md):
// checkpoint contract + CheckpointLedger primitive. This is a ledger
// PRIMITIVE, not a running checkpoint/restore service — it gives a
// checkpoint record durable, hash-chained, idempotent, optimistic-
// concurrency-controlled persistence and two read-side resolution
// helpers. Nothing in this file executes a restore, materializes a
// state_snapshot_ref, or is wired into any live session/runtime path.
//
// Granularity: one checkpoint entry represents a single (project_id,
// work_package_id, session_id) resume point, anchored to an exact
// position (source_ledger_id, sequence_at_checkpoint) in whichever
// other durable ledger the checkpointed session was tracking progress
// against (e.g. the EventLedger). state_snapshot_ref is an opaque
// pointer to where the actual session/runtime state snapshot content
// lives — this ledger stores the pointer and its provenance, never the
// raw snapshot payload, keeping MOD-MEM's (memory/content) territory
// and MOD-RUNTIME's (execution-resume metadata) territory separate
// per the gap assessment's boundary note B1.
//
// Restore semantics (design-only in this slice — no execution path):
// a future restore-execution consumer would (1) call resolveLatest (or
// resolveCheckpoint for an exact id) to fail-closed-resolve a
// checkpoint record, (2) dereference state_snapshot_ref through
// whatever store owns that content, (3) compare the ledger named by
// source_ledger_id at sequence_at_checkpoint against its current head
// to decide verified-resume vs. drift-denied (V-016) — step (3) is
// explicitly deferred: this slice gives existence + lookup only, per
// the assessment's non-goal #3.

function checkpointEntry(checkpoint, idempotencyKey) {
  return {
    entryId: checkpoint.checkpoint_id,
    projectId: checkpoint.project_id,
    workPackageId: checkpoint.work_package_id,
    sessionId: checkpoint.session_id,
    actorId: checkpoint.actor_id,
    type: "CHECKPOINT",
    payload: checkpoint,
    timestamp: checkpoint.created_at,
    idempotencyKey
  };
}

// FIX (bst/mod-runtime-s1-checkpoint-ordering-fix-001, closes
// mod-runtime-s1-checkpoint-ledger-second-independent-review-001 §1
// REQUEST_CHANGES + §2 advisory):
//
// §1 (blocking): `resolveLatest` used to pick the checkpoint with the
// highest `record.sequence` (DurableLedger's own LEDGER-APPEND-ORDER
// counter) for a session. That is not what "latest" means for a resume
// point — `sequence_at_checkpoint` (the checkpoint's own CONTENT-order
// field, i.e. how far the checkpointed session had actually progressed in
// its source ledger) is the field that matters, and nothing enforced that
// checkpoints for one session are ever appended in increasing
// `sequence_at_checkpoint` order. A regressed checkpoint appended after a
// more-advanced one for the same session was silently returned as
// "latest." Fixed on BOTH sides, per the reviewer's own §6 recommendation
// that the write-side gate is the stronger fix (it also stops the
// regressed record from being durably persisted at all, not just from
// being resolved incorrectly later):
//
//   - resolve-side: `resolveLatest` now reduces over `sequence_at_checkpoint`
//     (content order), never `record.sequence` (append order).
//   - write-side: `appendCheckpoint` now runs a `preWriteCheck` (the SAME
//     atomic, lock-held pattern `WorkspaceLeaseLedger` uses for its
//     single-writer gate — see durable-ledger.mjs's `append` doc comment)
//     that denies (`DENY_CHECKPOINT_REGRESSION`) a new checkpoint whose
//     `sequence_at_checkpoint` is not strictly greater than the current
//     highest `sequence_at_checkpoint` already recorded for the same
//     `(session_id, source_ledger_id)` pair. Scoped to that pair, not just
//     `session_id` alone, because `source_ledger_id` names which OTHER
//     ledger's position `sequence_at_checkpoint` is measured against —
//     collapsing two different source ledgers' progress counters into one
//     monotonic sequence would be a category error, not a stronger check.
//     There is no rollback-checkpoint concept anywhere in this codebase
//     (grep across src/ and contracts/checkpoint.schema.json confirms no
//     "rollback"/"revert" checkpoint kind or flag exists), so rejecting
//     regression outright — rather than designing an explicit
//     rollback-allowed exception — is the correct, non-speculative fix for
//     what this slice actually models today. Evaluated against the SAME
//     lock-held, freshly-verified `records` snapshot `DurableLedger.append`
//     already read for this write, never a separate unlocked `read()` (that
//     would reintroduce exactly the TOCTOU shape mod-wspace-s3 fixed).
//
// §2 (advisory, non-blocking): also closes the `actor_id` continuity gap.
// Analogous to `goal-graph-service.mjs`'s `producerActorId` immutability
// fix (bst/mod-work-sod-version-spoof-fix-001): `actor_id` is now bound to
// a session's FIRST-ever-recorded checkpoint and a later checkpoint
// supplying a different `actor_id` for the same `session_id` is denied
// (`DENY_ACTOR_ID_IMMUTABLE`) rather than silently accepted. Unlike the
// producer case there is no legitimate "re-version" concept here that
// would need a differently-scoped exception, so a flat pin is sufficient.
function currentLatestForSourceLedger(records, sessionId, sourceLedgerId) {
  return records.reduce((best, record) => {
    if (record.entry.sessionId !== sessionId) return best;
    if (record.entry.payload.source_ledger_id !== sourceLedgerId) return best;
    if (!best || record.entry.payload.sequence_at_checkpoint > best.entry.payload.sequence_at_checkpoint) {
      return record;
    }
    return best;
  }, null);
}

function firstForSession(records, sessionId) {
  return records.reduce((first, record) => {
    if (record.entry.sessionId !== sessionId) return first;
    if (!first) return record;
    return record.sequence < first.sequence ? record : first;
  }, null);
}

export class CheckpointLedger extends DurableLedger {
  constructor({ filePath }) {
    super({ filePath, ledgerId: "secb-checkpoint-ledger" });
  }

  appendCheckpoint(checkpoint, { expectedSequence, idempotencyKey }) {
    validateContract("checkpoint", checkpoint);
    if (!idempotencyKey) {
      throw new LedgerError("DENY_MISSING_ENTRY_FIELDS", "idempotencyKey is required for checkpoint append");
    }
    return this.append(checkpointEntry(checkpoint, idempotencyKey), {
      expectedSequence,
      // Throws (rather than returning a resolve-style { checkpoint, code }
      // veto value) to match this class's own established convention: every
      // other write-time denial here (DENY_MISSING_ENTRY_FIELDS above, and
      // DENY_SEQUENCE_CONFLICT / DENY_DUPLICATE_ENTRY_ID / DENY_IDEMPOTENCY_
      // CONFLICT / LEDGER_BUSY inherited from the base class) is a thrown
      // LedgerError, not a returned deny object — the `{ checkpoint, code }`
      // shape belongs to resolveLatest/resolveCheckpoint's READ-side
      // fail-closed lookups, not to appendCheckpoint's write path.
      preWriteCheck: (records, entry) => {
        const firstExisting = firstForSession(records, entry.sessionId);
        if (firstExisting && firstExisting.entry.actorId !== entry.actorId) {
          throw new LedgerError(
            "DENY_ACTOR_ID_IMMUTABLE",
            `actor_id is bound to session ${entry.sessionId}'s first checkpoint (${firstExisting.entry.actorId}); attempted actor_id ${entry.actorId} was denied`
          );
        }

        const currentLatest = currentLatestForSourceLedger(
          records,
          entry.sessionId,
          entry.payload.source_ledger_id
        );
        if (currentLatest && entry.payload.sequence_at_checkpoint <= currentLatest.entry.payload.sequence_at_checkpoint) {
          throw new LedgerError(
            "DENY_CHECKPOINT_REGRESSION",
            `sequence_at_checkpoint ${entry.payload.sequence_at_checkpoint} is not strictly greater than the current latest (${currentLatest.entry.payload.sequence_at_checkpoint}) recorded for session ${entry.sessionId} on source ledger ${entry.payload.source_ledger_id}`
          );
        }

        return null;
      }
    });
  }

  // Fail-closed exact lookup: an unknown checkpoint_id resolves to NONE
  // with a typed reason, mirroring DecisionLedger.resolveEffective's
  // deny-on-use discipline.
  resolveCheckpoint(checkpointId) {
    if (!checkpointId || typeof checkpointId !== "string") {
      return { checkpoint: null, code: "DENY_INVALID_CHECKPOINT_ID", reason: "checkpointId must be a non-empty string" };
    }
    const match = this.read().find((record) => record.entry.entryId === checkpointId);
    if (!match) {
      return { checkpoint: null, code: "DENY_UNKNOWN_CHECKPOINT", reason: `Unknown checkpoint: ${checkpointId}` };
    }
    return { checkpoint: structuredClone(match.entry.payload), sequence: match.sequence, code: "ALLOW" };
  }

  // Fail-closed resume-point lookup: resolves the checkpoint with the
  // highest CONTENT-order `sequence_at_checkpoint` recorded for a session —
  // NOT the highest ledger-append-order `record.sequence` (see the FIX
  // comment above this class for why that distinction matters). A session
  // with no recorded checkpoint resolves to NONE rather than a stale/
  // default value — a caller must not silently resume from nothing.
  resolveLatest(sessionId) {
    if (!sessionId || typeof sessionId !== "string") {
      return { checkpoint: null, code: "DENY_INVALID_SESSION_ID", reason: "sessionId must be a non-empty string" };
    }
    const matches = this.read().filter((record) => record.entry.sessionId === sessionId);
    if (matches.length === 0) {
      return { checkpoint: null, code: "DENY_UNKNOWN_SESSION", reason: `No checkpoint recorded for session: ${sessionId}` };
    }
    const latest = matches.reduce(
      (best, record) => (record.entry.payload.sequence_at_checkpoint > best.entry.payload.sequence_at_checkpoint ? record : best),
      matches[0]
    );
    return { checkpoint: structuredClone(latest.entry.payload), sequence: latest.sequence, code: "ALLOW" };
  }
}
