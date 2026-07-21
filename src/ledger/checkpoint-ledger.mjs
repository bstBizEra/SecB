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

export class CheckpointLedger extends DurableLedger {
  constructor({ filePath }) {
    super({ filePath, ledgerId: "secb-checkpoint-ledger" });
  }

  appendCheckpoint(checkpoint, { expectedSequence, idempotencyKey }) {
    validateContract("checkpoint", checkpoint);
    if (!idempotencyKey) {
      throw new LedgerError("DENY_MISSING_ENTRY_FIELDS", "idempotencyKey is required for checkpoint append");
    }
    return this.append(checkpointEntry(checkpoint, idempotencyKey), { expectedSequence });
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

  // Fail-closed resume-point lookup: resolves the highest ledger-sequence
  // checkpoint recorded for a session. A session with no recorded
  // checkpoint resolves to NONE rather than a stale/default value — a
  // caller must not silently resume from nothing.
  resolveLatest(sessionId) {
    if (!sessionId || typeof sessionId !== "string") {
      return { checkpoint: null, code: "DENY_INVALID_SESSION_ID", reason: "sessionId must be a non-empty string" };
    }
    const matches = this.read().filter((record) => record.entry.sessionId === sessionId);
    if (matches.length === 0) {
      return { checkpoint: null, code: "DENY_UNKNOWN_SESSION", reason: `No checkpoint recorded for session: ${sessionId}` };
    }
    const latest = matches.reduce((best, record) => (record.sequence > best.sequence ? record : best), matches[0]);
    return { checkpoint: structuredClone(latest.entry.payload), sequence: latest.sequence, code: "ALLOW" };
  }
}
