import { validateContract } from "../contracts/contract-validator.mjs";
import { DurableLedger, LedgerError } from "./durable-ledger.mjs";

// MOD-WSPACE Slice S3 — workspace-lease durable-record half (closes the OPEN
// ledger half of gap G2 and the mechanical registration gap G6 in
// docs/03-project-control/candidates/mod-wspace-gap-assessment-001.md §4 S3,
// the item the MOD-WSPACE completion review REV-001 named as the single
// buildable-now R2 slice keeping the module NOT_FINISHED).
//
// This is a ledger PRIMITIVE, not a running lease-granting service. It gives a
// workspace-lease record durable, hash-chained, idempotent, optimistic-
// concurrency-controlled, append-only persistence plus one fail-closed read
// helper (resolveActiveLease) and one write-time single-writer gate. Nothing
// in this file is wired into mcp-gateway-core.mjs (B5), materializes a worktree
// or spawns a process (B4), widens STATE_MACHINES.Session (G4/non-goal #2), or
// folds into CheckpointLedger (B2). The gateway still consumes
// workspace_lease_id opaquely; a byte-identity guard test pins it untouched.
//
// COMPOSITION WITH THE LEASE PRIMITIVE (read-only). The in-memory lifecycle
// authority — mint / evaluate / renew over caller-supplied state — lives in
// src/control/workspace-lease-policy.mjs and is NOT modified, imported, or
// wrapped here (a byte-identity guard test pins it). That primitive works in
// injected epoch-millisecond clock readings; this durable record serializes a
// lease FACT at the contract boundary with ISO-8601 `issued_at`/`expires_at`
// strings and the mandatory identity + `content_hash` fields the other 16
// schemas carry. The two are peers: the primitive decides, this ledger records.
//
// SCOPE NOTE — single-writer denial. The assessment's §4 S3 text deferred
// single-writer/lease-conflict enforcement (non-goal #5) to "a later, separately
// scoped consumer once a real lease-granting authority exists"; the completion
// review REV-001 follow-up #3 named it as the next step. This dispatch is
// pre-authorized (R2) to add the durable-ledger-local half of that denial:
// appendLease refuses to record a SECOND active lease for a session that already
// holds an unexpired one (single writer per session). This is a durable-record
// invariant, NOT a live gateway enforcement path — it gates what this ledger will
// persist, and nothing downstream yet consults it to block a live write (that
// remains B5, R3, out of scope).
//
// TOCTOU FIX (mod-wspace-s3-single-writer-toctou-fix-001). The second
// independent review of this merged slice (docs/03-project-control/candidates/
// mod-wspace-s3-second-independent-review-001.md §3) found that the ORIGINAL
// version of this gate scanned via an unlocked `this.read()` taken BEFORE
// calling `this.append(...)` — two independent reads not coupled by any lock,
// so a caller whose single-writer check ran against a stale view but whose
// write used a correctly-fresh `expectedSequence` could land two simultaneously
// -active leases for one session, defeating the exact invariant this gate
// exists to enforce. Fixed by moving the scan INSIDE `DurableLedger.append`'s
// own lock via the `preWriteCheck` hook (see durable-ledger.mjs): the base
// class does its normal locked read+verify, then hands THAT SAME
// freshly-read, freshly-verified `records` snapshot to the hook before it
// hands it to the write. `#detectSingleWriterConflict` no longer calls
// `this.read()` at all — there is no longer a second, independent,
// overridable read for the gate to race against.

// Map a validated workspace-lease record onto the DurableLedger entry envelope.
// entryId/idempotencyKey drive the base class's duplicate-id + idempotent-replay
// discipline; timestamp is the ISO `issued_at` (DurableLedger validates it with
// Date.parse). The full lease record is carried unchanged in `payload`.
//
// entryId is the composite `${lease_id}@v${version}`, NOT the bare lease_id: a
// lease's identity is `lease_id`, and each durable append is a numbered VERSION
// of that lease (a renewal re-anchors expiry as a higher version under the same
// lease_id). The base ledger dedups on entryId, so the composite lets a lease
// carry multiple versions while still rejecting an exact (lease_id, version)
// duplicate. resolveActiveLease groups by the PAYLOAD `lease_id` and picks the
// highest-version active record, so the composite entryId never leaks into
// resolution semantics.
function workspaceLeaseEntry(lease, idempotencyKey) {
  return {
    entryId: `${lease.lease_id}@v${lease.version}`,
    projectId: lease.project_id,
    workPackageId: lease.work_package_id,
    sessionId: lease.session_id,
    actorId: lease.actor_id,
    type: "WORKSPACE_LEASE",
    payload: lease,
    timestamp: lease.issued_at,
    idempotencyKey
  };
}

const deny = (code, message, extra) => Object.freeze({ ok: false, code, message, ...extra });

// A whole-number epoch-ms clock reading: finite, safe, non-negative. Fail-closed
// — NaN, Infinity, floats, negatives, non-numbers all reject. Mirrors the
// workspace-lease-policy primitive's `isEpochMs`.
const isEpochMs = (v) => Number.isSafeInteger(v) && v >= 0;

// Deep-freeze a plain data value so a resolved lease cannot be mutated by a
// caller and reflected back into the ledger's cloned state.
function deepFreeze(value) {
  if (value === null || typeof value !== "object") return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

// Atomic single-read snapshot of a caller-supplied lease object. Every own
// string-keyed property is read EXACTLY ONCE via structuredClone, which produces
// trap-free plain data and preserves ALL own enumerable keys (so a smuggled
// additionalProperties key still reaches — and is rejected by — the closed
// schema). A hostile getter / Proxy trap that throws is contained here and never
// propagates a half-read object into validation or the hash chain. Because
// validateContract AND workspaceLeaseEntry both consume this ONE snapshot, a
// value-varying getter cannot make the stored record differ from the validated
// record (single-read TOCTOU closure, mirrors write-set-policy REV-002 /
// workspace-lease-policy F3).
function snapshotLease(source) {
  if (source === null || typeof source !== "object" || Array.isArray(source)) {
    throw new LedgerError("DENY_LEASE_MALFORMED", "workspace lease must be an object");
  }
  try {
    return structuredClone(source);
  } catch {
    throw new LedgerError("DENY_LEASE_MALFORMED", "workspace lease could not be safely inspected");
  }
}

export class WorkspaceLeaseLedger extends DurableLedger {
  constructor({ filePath }) {
    super({ filePath, ledgerId: "secb-workspace-lease-ledger" });
  }

  // Durable append of a validated workspace-lease record. The hash chain,
  // idempotency-key replay, optimistic concurrency (expectedSequence), duplicate
  // entry-id rejection, and writer-lock contention are all inherited UNMODIFIED
  // from DurableLedger.append — nothing below reimplements or weakens any of it
  // (mirrors CheckpointLedger.appendCheckpoint exactly). This method adds two
  // things on top: an atomic single-read snapshot of the caller lease, and the
  // single-writer-per-session gate.
  //
  // Returns a frozen allow/deny envelope for the single-writer decision:
  //   { ok: true, record }  — where record is the base append result
  //   { ok: false, code: "DENY_LEASE_SINGLE_WRITER", message, ... }
  // Structural problems (unreadable lease, contract-invalid, missing
  // idempotencyKey, invalid `now`) fail closed by THROWING a typed error, exactly
  // as the sibling ledgers do; only the single-writer business rule returns a
  // structured deny.
  appendLease(lease, { expectedSequence, idempotencyKey, now } = {}) {
    const snapshot = snapshotLease(lease);
    validateContract("workspace-lease", snapshot);
    if (!idempotencyKey) {
      throw new LedgerError("DENY_MISSING_ENTRY_FIELDS", "idempotencyKey is required for workspace-lease append");
    }
    if (!isEpochMs(now)) {
      throw new LedgerError("DENY_LEASE_INVALID_NOW", "now must be a non-negative safe-integer epoch-ms reading");
    }

    // The single-writer scan runs as `preWriteCheck`, INSIDE DurableLedger's own
    // lock, against the SAME freshly-read+verified `records` the base class is
    // about to write against — not a separate, earlier, unlocked `this.read()`.
    // This is the TOCTOU fix: see the SCOPE NOTE above.
    const result = this.append(workspaceLeaseEntry(snapshot, idempotencyKey), {
      expectedSequence,
      preWriteCheck: (records) => {
        const conflict = this.#detectSingleWriterConflict(snapshot, now, records);
        if (!conflict) return null;
        return deny(
          "DENY_LEASE_SINGLE_WRITER",
          `session ${snapshot.session_id} already holds active lease ${conflict.leaseId}`,
          { sessionId: snapshot.session_id, conflictingLeaseId: conflict.leaseId }
        );
      }
    });

    if (result && result.ok === false) return result;
    return Object.freeze({ ok: true, record: result });
  }

  // Single-writer-per-session gate. Scans `records` — the exact, already
  // locked+verified snapshot `DurableLedger.append` just read for this same
  // write (passed in via the `preWriteCheck` hook, never fetched independently
  // here) — for a DIFFERENT lease (a different lease_id) that is still active
  // (now < expires_at) under the SAME session_id. A re-append of the same
  // lease_id (idempotent replay or a renewal that re-anchors the same lease) is
  // NOT a conflict — that is the same writer, not a second one. Because
  // `records` comes from inside the locked critical section, a tampered ledger
  // still fails closed before this method ever runs (verifyRecords throws
  // first).
  //
  // Fail-closed expiry direction: an unparseable stored `expires_at` is treated
  // as STILL ACTIVE, so an ambiguous existing lease blocks the second writer
  // rather than being silently assumed dead. (resolveActiveLease takes the
  // opposite, equally deny-by-default direction: an unparseable expiry there is
  // treated as NOT active, so it never grants an ambiguous authorization.)
  #detectSingleWriterConflict(lease, now, records) {
    for (const record of records) {
      const held = record.entry.payload;
      if (held.session_id !== lease.session_id) continue;
      if (held.lease_id === lease.lease_id) continue;
      const expiresMs = Date.parse(held.expires_at);
      const active = Number.isFinite(expiresMs) ? now < expiresMs : true;
      if (active) return { leaseId: held.lease_id };
    }
    return null;
  }

  // Fail-closed active-lease resolution by id. Returns the highest-version,
  // non-expired lease recorded under `leaseId`, or a structured deny:
  //   invalid id           -> DENY_LEASE_INVALID_ID
  //   invalid clock reading -> DENY_LEASE_INVALID_NOW
  //   no record for the id  -> DENY_LEASE_UNKNOWN
  //   records but none live -> DENY_LEASE_EXPIRED
  // A lease is expired at or after its expiry (now >= expires_at); an unparseable
  // stored expiry is treated as NOT active (deny-by-default — never grant an
  // ambiguous authorization). read() verifies the chain, so tamper fails closed
  // with LEDGER_INTEGRITY_FAILURE before any lease is returned.
  resolveActiveLease(leaseId, { now } = {}) {
    if (!leaseId || typeof leaseId !== "string") {
      return deny("DENY_LEASE_INVALID_ID", "leaseId must be a non-empty string");
    }
    if (!isEpochMs(now)) {
      return deny("DENY_LEASE_INVALID_NOW", "now must be a non-negative safe-integer epoch-ms reading");
    }
    const forLease = this.read().filter((record) => record.entry.payload.lease_id === leaseId);
    if (forLease.length === 0) {
      return deny("DENY_LEASE_UNKNOWN", `Unknown lease: ${leaseId}`);
    }
    const active = forLease.filter((record) => {
      const expiresMs = Date.parse(record.entry.payload.expires_at);
      return Number.isFinite(expiresMs) && now < expiresMs;
    });
    if (active.length === 0) {
      return deny("DENY_LEASE_EXPIRED", `No active lease for id: ${leaseId}`);
    }
    const latest = active.reduce(
      (best, record) => (record.entry.payload.version > best.entry.payload.version ? record : best),
      active[0]
    );
    return deepFreeze({
      ok: true,
      lease: structuredClone(latest.entry.payload),
      version: latest.entry.payload.version,
      sequence: latest.sequence
    });
  }
}
