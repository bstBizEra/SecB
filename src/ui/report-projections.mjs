// P0-17 Live Operations report projections (GOV-P017-01..07).
// Pure functions: verified ledger records in, frozen view models out.
// No I/O, no clock, no ledger reference — deterministic and testable in
// isolation. The classification floor is display-plane only and is NOT
// storage redaction (GOV-P017 invariant).

export const CLASSIFICATION_ORDER = Object.freeze(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"]);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

// Exact-match only: case variants, padding, confusables, and novel
// strings are UNKNOWN and treated as RESTRICTED — fail-closed.
export function classificationDecision(classification, ceiling) {
  const level = CLASSIFICATION_ORDER.indexOf(classification);
  if (level === -1) return { render: false, reason: "UNRECOGNIZED_CLASSIFICATION" };
  if (level > CLASSIFICATION_ORDER.indexOf(ceiling)) return { render: false, reason: "ABOVE_CEILING" };
  return { render: true, reason: null };
}

function projectRecord(record, ceiling, payloadField) {
  const payload = record.entry.payload;
  const decision = classificationDecision(payload.classification, ceiling);
  return {
    sequence: record.sequence,
    entryId: record.entry.entryId,
    type: record.entry.type,
    actorId: record.entry.actorId,
    sessionId: record.entry.sessionId,
    timestamp: record.entry.timestamp,
    classification: payload.classification,
    contentHash: payload.content_hash,
    payloadRendered: decision.render,
    withheldReason: decision.reason,
    payload: decision.render ? JSON.stringify(payload[payloadField]) : null
  };
}

export function projectEvents(records, ceiling) {
  return deepFreeze(records.map((record) => projectRecord(record, ceiling, "observed_fact")));
}

export function projectEvidence(records, ceiling) {
  return deepFreeze(records.map((record) => projectRecord(record, ceiling, "result")));
}

export function integritySummary(ledgerLabel, verifyResult) {
  return deepFreeze({
    ledger: ledgerLabel,
    valid: verifyResult.valid === true,
    count: verifyResult.count,
    headHash: verifyResult.headHash
  });
}
