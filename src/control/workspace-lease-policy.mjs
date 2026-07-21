// MOD-WSPACE Slice S2 (this dispatch) — Workspace-lease lifecycle primitive
// (PURE, UNWIRED, LEDGER-FREE).
//
// Purpose (G2 from mod-wspace-gap-assessment-001): `workspace_lease_id` is a
// hard-required gateway context field (mcp-gateway-core.mjs:11,352,780) that no
// code mints, tracks, expires, or renews — an opaque string with no lifecycle.
// This module supplies the missing pure lifecycle primitive: mint a lease-record
// candidate, evaluate a lease against an injected clock + a requested write set,
// and renew a lease into a new candidate — all as deep-frozen, deny-by-default
// values over caller-supplied state, with the clock reading injected as a
// parameter (this module never calls Date.now / Date.parse).
//
// SCOPE DIVERGENCE FROM ASSESSMENT S3 (disclosed, AMD-002 rule 3 design note):
// the assessment's own §4 lease slice is S3 — a `workspace-lease.schema.json`
// contract + a `WorkspaceLeaseLedger extends DurableLedger` + contract-validator
// / validate-foundation registration. THIS dispatch is deliberately narrower: a
// pure policy primitive with NO ledger class, NO schema, NO validator edit, NO
// I/O — the caller persists the frozen candidate this module mints, exactly
// mirroring the approval-binding "mint / verify only; the caller appends"
// discipline (src/control/approval-binding.mjs bindApprovalDecision, and
// retry-policy.mjs buildRetryDecisionRecord). This is strictly a SUBSET of the
// pre-authorized S3 additive scope (assessment §7): fewer files, no live wiring,
// no durable-storage class. Wiring any of this into mcp-gateway-core.mjs (B5),
// materializing a worktree (B4), or folding into CheckpointLedger (B2) all remain
// out of scope and R3, per the assessment's non-goals §5 #1/#3/#5.
//
// Boundary rulings honored:
//   B2 — a lease is workspace-scoped authorization-to-mutate, NOT session-scoped
//        resume state; nothing here touches or subsumes CheckpointLedger.
//   B4 — a lease's writeSet is stored as declared path data; no worktree/branch
//        is ever materialized (no filesystem, no process spawn).
//   B5 — mcp-gateway-core.mjs is NOT modified or wired; it still consumes
//        workspace_lease_id opaquely. A byte-identity guard test pins it.
//
// TIMESTAMP MODEL (disclosed design decision): times are injected as integer
// epoch-millisecond readings supplied by the caller (`issuedAt`, `now`,
// `renewedAt`); `ttl` is a positive integer millisecond duration; expiry is the
// derived integer `issuedAt + ttl`. The assessment's S3 schema sketch used ISO
// `granted_at`/`expires_at` strings; this pure primitive uses numeric injected
// clock values because this dispatch's charter is explicit that the clock value
// is "injected as a parameter — never Date.now", and integer arithmetic
// (`issuedAt + ttl`) is unambiguous and parse-free. A future S3 ledger may
// serialize these to ISO at its schema boundary without changing this primitive.
//
// House style: result envelopes. Every return value is a deep-frozen
// `{ ok: true, ... }` or `{ ok: false, code, ... }`; a malformed shape NEVER
// coerces to a permissive default. Fail-closed single-read extraction contains
// any hostile getter / Proxy trap / poisoned iterator into DENY_LEASE_MALFORMED
// and never propagates. Expiry is fail-closed: a missing or invalid timestamp
// denies rather than defaulting to "not expired".
//
// evaluateWriteSet REUSE (B3 chain): the requested-write-set-within-lease check
// delegates to src/control/write-set-policy.mjs `evaluateWriteSet`, imported
// READ-ONLY and left byte-identical (a byte-identity guard test pins it, and a
// parity test asserts evaluateLease's write-set verdict equals a direct
// evaluateWriteSet call). The lease's own `writeSet` plays the `allowedPaths`
// role and the caller's `requestedWriteSet` plays the `candidatePaths` role;
// `prohibitedPaths` is the empty set (a lease grants a positive allowance, it
// does not carry its own prohibitions — those live on the effective contract and
// are a later, separately-governed composition). Any non-ok write-set verdict is
// surfaced as the lease-plane code DENY_LEASE_WRITE_SET_EXCEEDED, carrying the
// underlying write-set deny code in `detail` for observability.

import { evaluateWriteSet } from "./write-set-policy.mjs";

// The full closed set of deny codes this primitive can emit, frozen so callers
// may switch on it without risk of silent drift.
export const WORKSPACE_LEASE_DENY_CODES = Object.freeze([
  "DENY_LEASE_MALFORMED",
  "DENY_LEASE_EXPIRED",
  "DENY_LEASE_WRITE_SET_EXCEEDED"
]);

const isNonBlankString = (v) => typeof v === "string" && v.trim().length > 0;
// A whole-number epoch-ms reading: finite, safe, and non-negative. Fail-closed —
// NaN, Infinity, floats, negatives, non-numbers, and unsafe integers all reject.
const isEpochMs = (v) => Number.isSafeInteger(v) && v >= 0;
// A ttl: a strictly-positive whole-number millisecond duration (a zero/negative
// ttl grants no live window and is rejected as malformed rather than silently
// yielding an already-expired lease).
const isTtlMs = (v) => Number.isSafeInteger(v) && v > 0;

const deny = (code, extra) => Object.freeze({ ok: false, code, ...extra });
const DENY_MALFORMED = (message) => deny("DENY_LEASE_MALFORMED", { message });

// --- Fail-closed single-read extraction (mirrors write-set-policy REV-002) ---
// Destructure the caller-supplied object EXACTLY ONCE inside a try/catch. A
// throwing property getter, a Proxy get/has trap that throws, or any other
// hostile accessor is contained here and converted to DENY_LEASE_MALFORMED; it
// never propagates past this boundary and is never retried (each field read once).
const NOT_READABLE = Symbol("workspace-lease-not-readable");
function readFields(source, keys) {
  if (source === null || typeof source !== "object" || Array.isArray(source)) {
    return NOT_READABLE;
  }
  try {
    const out = {};
    for (const key of keys) {
      out[key] = source[key]; // single [[Get]] per field
    }
    return out;
  } catch {
    return NOT_READABLE;
  }
}

// --- Single-read array snapshot (WSPACE-S1 snapshotArray discipline) ----------
// Deliberate local twin of src/control/write-set-policy.mjs `snapshotArray`
// (that module is imported READ-ONLY and pinned byte-identical by a guard test,
// so its helper cannot be exported without breaking the pin). Copies each index
// of a genuine, untampered array EXACTLY ONCE via [[Get]] into a fresh own-data
// array: reads `length` once, rejects a tampered `Symbol.iterator` WITHOUT
// invoking it, and never re-reads an index. Returns NOT_ARRAY for a
// non-array/tampered/degenerate-length input, or a plain snapshot array
// otherwise. May throw ONLY into a caller try/catch (a throwing length/index
// accessor / Proxy get trap), where it becomes DENY_LEASE_MALFORMED.
const NOT_ARRAY = Symbol("workspace-lease-not-array");
const ARRAY_ITERATOR = Array.prototype[Symbol.iterator];
function snapshotArray(value) {
  if (!Array.isArray(value)) return NOT_ARRAY;
  if (value[Symbol.iterator] !== ARRAY_ITERATOR) return NOT_ARRAY;
  const len = value.length;
  if (!Number.isSafeInteger(len) || len < 0) return NOT_ARRAY;
  const out = new Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = value[i];
  }
  return out;
}

// Validate the intrinsic well-formedness of a lease's own fields (identity +
// timing + writeSet), independent of any clock or requested write set. Returns
// a normalized { leaseId, sessionId, actorId, writeSet, issuedAt, ttl, expiresAt }
// on success, or a frozen DENY_LEASE_MALFORMED result. Used by evaluateLease and
// renewLease so both agree byte-for-byte on what "a well-formed lease" means.
//
// The writeSet is self-validated through evaluateWriteSet (candidatePaths ===
// allowedPaths === writeSet): a clean, canonical, non-empty set is trivially a
// subset of itself, so a writeSet carrying a traversal / absolute / non-canonical
// / empty entry is rejected AT THIS BOUNDARY (fail-early) instead of silently
// minting a lease that can never authorize anything.
//
// F3 HARDENING (mod-wspace-lease-primitive-rev-001): the caller's writeSet is
// snapshotted ONCE here — each index read exactly once — and the SAME plain
// snapshot is used for BOTH the self-containment check AND the stored frozen set
// (freezeLease spreads normalized.writeSet). Previously the caller array flowed
// through unsnapshotted: evaluateWriteSet read its elements twice (as
// candidatePaths and allowedPaths) and freezeLease spread it a third time, so a
// value-varying INDEX getter could make the STORED set differ from the VALIDATED
// set (rev-001 F3, probe 4e: stored ["src"] while "src/control/narrow.mjs" was
// the checked candidate). With one upfront snapshot, stored === validated
// always; a throwing index getter is contained to DENY_LEASE_MALFORMED here
// rather than propagating.
function normalizeLeaseFields(fields) {
  const { leaseId, sessionId, actorId, writeSet, issuedAt, ttl } = fields;
  if (!isNonBlankString(leaseId) || !isNonBlankString(sessionId) || !isNonBlankString(actorId)) {
    return DENY_MALFORMED("leaseId, sessionId and actorId must be non-blank strings");
  }
  let writeSetSnapshot;
  try {
    writeSetSnapshot = snapshotArray(writeSet);
  } catch {
    return DENY_MALFORMED("writeSet could not be safely inspected");
  }
  if (writeSetSnapshot === NOT_ARRAY) {
    return DENY_MALFORMED("writeSet must be an array of repository-relative paths");
  }
  if (!isEpochMs(issuedAt)) {
    return DENY_MALFORMED("issuedAt must be a non-negative safe-integer epoch-ms reading");
  }
  if (!isTtlMs(ttl)) {
    return DENY_MALFORMED("ttl must be a positive safe-integer millisecond duration");
  }
  const expiresAt = issuedAt + ttl;
  if (!Number.isSafeInteger(expiresAt)) {
    return DENY_MALFORMED("issuedAt + ttl overflows the safe-integer range");
  }
  // Self-containment check reuses evaluateWriteSet byte-identically over the
  // SAME snapshot that will be stored: the set must be a clean, canonical,
  // non-empty subset of itself.
  const selfCheck = evaluateWriteSet({
    candidatePaths: writeSetSnapshot,
    allowedPaths: writeSetSnapshot,
    prohibitedPaths: []
  });
  if (!selfCheck.ok) {
    return deny("DENY_LEASE_MALFORMED", {
      message: "writeSet contains an empty, traversal, absolute, or non-canonical path",
      detail: selfCheck.code
    });
  }
  return { leaseId, sessionId, actorId, writeSet: writeSetSnapshot, issuedAt, ttl, expiresAt };
}

// Build the deep-frozen lease-record candidate. The writeSet (already the plain
// single-read snapshot from normalizeLeaseFields) is copied into a fresh frozen
// array so a later mutation cannot reflect into the record, and the record
// itself is frozen. Because the input here is the validated snapshot, this
// spread reads only plain values — the stored set is provably the validated set.
function freezeLease({ leaseId, sessionId, actorId, writeSet, issuedAt, ttl, expiresAt }) {
  return Object.freeze({
    leaseId,
    sessionId,
    actorId,
    writeSet: Object.freeze([...writeSet]),
    issuedAt,
    ttl,
    expiresAt
  });
}

// mintLease({ leaseId, sessionId, actorId, writeSet, issuedAt, ttl })
//   -> Object.freeze({ ok: true, lease: <deep-frozen candidate> })
//   -> Object.freeze({ ok: false, code: "DENY_LEASE_MALFORMED", message, detail? })
//
// Mint-don't-write: returns a frozen candidate the CALLER persists (there is no
// ledger here). Deny-by-default on any malformed field. `issuedAt` is the
// injected clock reading at grant time; the lease's expiry is the derived
// `issuedAt + ttl`.
export function mintLease(input) {
  const fields = readFields(input, ["leaseId", "sessionId", "actorId", "writeSet", "issuedAt", "ttl"]);
  if (fields === NOT_READABLE) {
    return DENY_MALFORMED("input could not be safely inspected");
  }
  const normalized = normalizeLeaseFields(fields);
  if (normalized.ok === false) return normalized;
  return Object.freeze({ ok: true, lease: freezeLease(normalized) });
}

// evaluateLease(lease, { now, requestedWriteSet })
//   -> Object.freeze({ ok: true })
//   -> Object.freeze({ ok: false, code, ... })
//
// Deny precedence (most structural first): DENY_LEASE_MALFORMED (unreadable /
// ill-formed lease, unreadable options, invalid `now`, non-array
// requestedWriteSet) > DENY_LEASE_EXPIRED (now >= issuedAt + ttl) >
// DENY_LEASE_WRITE_SET_EXCEEDED (requestedWriteSet not contained by the lease's
// writeSet, per evaluateWriteSet). Fail-closed expiry: a missing/invalid `now`
// or a lease with a missing/invalid issuedAt/ttl denies as MALFORMED rather than
// defaulting to "not expired".
export function evaluateLease(lease, options) {
  const leaseFields = readFields(lease, ["leaseId", "sessionId", "actorId", "writeSet", "issuedAt", "ttl"]);
  if (leaseFields === NOT_READABLE) {
    return DENY_MALFORMED("lease could not be safely inspected");
  }
  const normalized = normalizeLeaseFields(leaseFields);
  if (normalized.ok === false) return normalized;

  const opt = readFields(options, ["now", "requestedWriteSet"]);
  if (opt === NOT_READABLE) {
    return DENY_MALFORMED("evaluation options could not be safely inspected");
  }
  const { now, requestedWriteSet } = opt;
  if (!isEpochMs(now)) {
    return DENY_MALFORMED("now must be a non-negative safe-integer epoch-ms reading");
  }
  if (!Array.isArray(requestedWriteSet)) {
    return DENY_MALFORMED("requestedWriteSet must be an array of repository-relative paths");
  }

  // Fail-closed expiry: at or after the derived expiry, the lease is dead.
  if (now >= normalized.expiresAt) {
    return deny("DENY_LEASE_EXPIRED", {
      message: "lease has expired",
      now,
      expiresAt: normalized.expiresAt
    });
  }

  // Containment delegates byte-identically to evaluateWriteSet; any non-ok
  // verdict (empty request, traversal, absolute, outside-allowed, ...) is a
  // lease write-set excess from this plane's point of view.
  const contained = evaluateWriteSet({
    candidatePaths: requestedWriteSet,
    allowedPaths: normalized.writeSet,
    prohibitedPaths: []
  });
  if (!contained.ok) {
    return deny("DENY_LEASE_WRITE_SET_EXCEEDED", {
      message: "requested write set is not contained by the lease write set",
      detail: contained.code
    });
  }
  return Object.freeze({ ok: true });
}

// renewLease(lease, { renewedAt, ttl })
//   -> Object.freeze({ ok: true, lease: <NEW deep-frozen candidate> })
//   -> Object.freeze({ ok: false, code, ... })
//
// Produces a NEW lease-record candidate re-anchored at `renewedAt`, PRESERVING
// the original identity (leaseId/sessionId/actorId) and writeSet unchanged — a
// renewal is a time extension, never a scope change, so the writeSet can never
// widen through renewal (least-privilege). `ttl` is optional; when omitted the
// original lease's ttl is carried forward. The original lease object is only
// read, never mutated. Monotonic: `renewedAt` must be >= the original
// `issuedAt` (no backward-in-time renewal). Renewal does NOT itself gate on the
// original's expiry — whether a lapsed lease may be renewed is a grant-authority
// decision this pure primitive does not hold (mirrors the assessment's ruling
// that the lease record enforces no conflict/authority on its own).
export function renewLease(lease, options) {
  const leaseFields = readFields(lease, ["leaseId", "sessionId", "actorId", "writeSet", "issuedAt", "ttl"]);
  if (leaseFields === NOT_READABLE) {
    return DENY_MALFORMED("lease could not be safely inspected");
  }
  const normalized = normalizeLeaseFields(leaseFields);
  if (normalized.ok === false) return normalized;

  const opt = readFields(options, ["renewedAt", "ttl"]);
  if (opt === NOT_READABLE) {
    return DENY_MALFORMED("renewal options could not be safely inspected");
  }
  const { renewedAt } = opt;
  const nextTtl = opt.ttl === undefined ? normalized.ttl : opt.ttl;
  if (!isEpochMs(renewedAt)) {
    return DENY_MALFORMED("renewedAt must be a non-negative safe-integer epoch-ms reading");
  }
  if (!isTtlMs(nextTtl)) {
    return DENY_MALFORMED("ttl must be a positive safe-integer millisecond duration");
  }
  if (renewedAt < normalized.issuedAt) {
    return DENY_MALFORMED("renewedAt must not precede the original lease issuedAt");
  }
  const expiresAt = renewedAt + nextTtl;
  if (!Number.isSafeInteger(expiresAt)) {
    return DENY_MALFORMED("renewedAt + ttl overflows the safe-integer range");
  }
  return Object.freeze({
    ok: true,
    lease: freezeLease({
      leaseId: normalized.leaseId,
      sessionId: normalized.sessionId,
      actorId: normalized.actorId,
      writeSet: normalized.writeSet,
      issuedAt: renewedAt,
      ttl: nextTtl,
      expiresAt
    })
  });
}
