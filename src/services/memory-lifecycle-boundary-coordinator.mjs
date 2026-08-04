import { AsyncLocalStorage } from "node:async_hooks";

import { canonicalFingerprint } from "../contracts/canonical-fingerprint.mjs";

const isHash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

function clone(value, label) {
  try { return structuredClone(value); }
  catch { throw new MemoryLifecycleBoundaryError("MEMORY_BOUNDARY_SOURCE_INVALID", `${label} source is not safely cloneable`); }
}

export class MemoryLifecycleBoundaryError extends Error {
  constructor(code, message) { super(message); this.name = "MemoryLifecycleBoundaryError"; this.code = code; }
}

export function createMemoryLifecycleBoundaryCoordinator({ lifecycleLedger, recordSource,
  authoritySource, retentionSource, evidenceSource } = {}) {
  let verify;
  let withBoundaryLease;
  try { verify = lifecycleLedger?.verify; withBoundaryLease = lifecycleLedger?.withBoundaryLease; } catch {
    throw new MemoryLifecycleBoundaryError("INVALID_MEMORY_BOUNDARY_LEDGER", "lifecycle ledger could not be inspected");
  }
  if (typeof verify !== "function") throw new MemoryLifecycleBoundaryError("INVALID_MEMORY_BOUNDARY_LEDGER", "lifecycleLedger.verify is required");
  if (typeof withBoundaryLease !== "function") throw new MemoryLifecycleBoundaryError("INVALID_MEMORY_BOUNDARY_LEDGER", "lifecycleLedger.withBoundaryLease is required");
  for (const [name, operation] of Object.entries({ recordSource, authoritySource, retentionSource, evidenceSource })) {
    if (typeof operation !== "function") throw new MemoryLifecycleBoundaryError("INVALID_MEMORY_BOUNDARY_SOURCE", `${name} is required`);
  }
  const verifyLifecycle = Function.prototype.bind.call(verify, lifecycleLedger);
  const runBoundaryLease = Function.prototype.bind.call(withBoundaryLease, lifecycleLedger);
  const context = new AsyncLocalStorage();
  let locked = false;

  const head = () => {
    let value;
    try { value = clone(verifyLifecycle(), "lifecycle head"); } catch (cause) {
      if (cause instanceof MemoryLifecycleBoundaryError) throw cause;
      throw new MemoryLifecycleBoundaryError(cause?.code ?? "MEMORY_BOUNDARY_HEAD_UNAVAILABLE", "lifecycle head is unavailable");
    }
    if (!isPlainObject(value) || Reflect.ownKeys(value).length !== 4 || value.valid !== true
      || value.ledgerId !== "secb-memory-lifecycle-ledger" || !Number.isSafeInteger(value.count)
      || value.count < 0 || !isHash(value.headHash)) {
      throw new MemoryLifecycleBoundaryError("MEMORY_BOUNDARY_HEAD_INVALID", "lifecycle head evidence is malformed");
    }
    return value;
  };

  const tokenFor = (value) => Object.freeze({ lifecycle_sequence: value.count, lifecycle_head_hash: value.headHash,
    fence_revision: canonicalFingerprint({ ledger_id: value.ledgerId, count: value.count, head_hash: value.headHash }) });
  const sameHead = (left, right) => left.count === right.count && left.headHash === right.headHash && left.ledgerId === right.ledgerId;

  const enterSync = (operation, requireStable) => {
    const active = context.getStore();
    if (active !== undefined) return operation(active);
    if (locked) throw new MemoryLifecycleBoundaryError("MEMORY_BOUNDARY_BUSY", "lifecycle boundary is owned by another operation");
    locked = true;
    try {
      const before = head();
      const token = tokenFor(before);
      const result = context.run(token, () => operation(token));
      if (requireStable && !sameHead(before, head())) {
        throw new MemoryLifecycleBoundaryError("MEMORY_BOUNDARY_HEAD_CHANGED", "lifecycle head changed inside boundary");
      }
      return result;
    }
    finally { locked = false; }
  };

  async function withIssuanceFence(request, callback) {
    if (typeof callback !== "function") throw new MemoryLifecycleBoundaryError("MEMORY_BOUNDARY_REQUEST_INVALID", "issuance callback is required");
    if (context.getStore() !== undefined || locked) {
      throw new MemoryLifecycleBoundaryError("MEMORY_BOUNDARY_BUSY", "issuance fence cannot be nested or overlap another owner");
    }
    clone(request, "issuance request");
    locked = true;
    try {
      return await runBoundaryLease(async () => {
        const before = head();
        const token = tokenFor(before);
        const result = await context.run(token, () => callback(token));
        const after = head();
        if (!sameHead(before, after)) throw new MemoryLifecycleBoundaryError("MEMORY_BOUNDARY_HEAD_CHANGED", "lifecycle head changed inside issuance fence");
        return result;
      });
    } finally { locked = false; }
  }

  function withResolutionFence(request, callback) {
    if (typeof callback !== "function") throw new MemoryLifecycleBoundaryError("MEMORY_BOUNDARY_REQUEST_INVALID", "resolution callback is required");
    return enterSync(() => callback(Object.freeze({
      records: clone(recordSource(clone(request.input, "resolution input")), "records"),
      retention: clone(retentionSource(clone(request.retention_request, "retention request")), "retention"),
      authority: clone(authoritySource(clone(request.authority_expected, "authority request")), "authority")
    })), true);
  }

  function withMutationFence(request, callback) {
    if (typeof callback !== "function") throw new MemoryLifecycleBoundaryError("MEMORY_BOUNDARY_REQUEST_INVALID", "mutation callback is required");
    return enterSync(() => callback(Object.freeze({
      records: clone(recordSource(clone(request.input, "mutation input")), "records"),
      evidence: clone(evidenceSource({ ...clone(request.evidence_expected, "evidence request"),
        active_legal_hold_count: request.active_legal_hold_count }), "evidence"),
      authority: clone(authoritySource(clone(request.authority_expected, "authority request")), "authority")
    })), false);
  }

  return Object.freeze({
    resolveRecords(request) { return clone(recordSource(clone(request, "record request")), "records"); },
    resolveAuthority(request) { return clone(authoritySource(clone(request, "authority request")), "authority"); },
    resolveRetention(request) { return clone(retentionSource(clone(request, "retention request")), "retention"); },
    resolveEvidence(request) { return clone(evidenceSource(clone(request, "evidence request")), "evidence"); },
    withIssuanceFence, withResolutionFence, withMutationFence
  });
}
