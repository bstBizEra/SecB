import { validateContract } from "../contracts/contract-validator.mjs";
import { DurableLedger, LedgerError } from "./durable-ledger.mjs";

// P0-14: decision/knowledge/outcome ledgers with temporal claims and the
// learning boundary. All three extend the hash-chained DurableLedger and
// compose over injected lookups (option-C style): the ledger never trusts
// caller claims about evidence or decisions — it resolves them.
//
// Temporal semantics: deny-on-use with no timer-driven mutation or pruning
// writer. NOTE (consumer obligation): resolution instants (`at`) are
// caller-supplied — these are temporal-query APIs, not enforcement clocks.
// An enforcing consumer (e.g. the P0-09 service) must supply a trusted
// server-derived instant; a forged instant only mis-answers that caller's
// own query, never mutates the ledger.
// Evidence acceptance follows the learning boundary: knowledge may only be
// derived from evidence whose verification_status is VERIFIED or ACCEPTED,
// resolved through the injected lookup. Lookup contract: the lookup MUST
// return the envelope bound to the requested ref (identity is asserted
// here) and SHOULD be bound to the sealed Evidence ledger.
// Reversion semantics: reverting a REVERSION does not reinstate its
// target — reinstatement is a new decision version, never a resurrection.

const ACCEPTED_EVIDENCE_STATUSES = Object.freeze(["VERIFIED", "ACCEPTED"]);

function assertWindow(record, label) {
  const from = Date.parse(record.valid_from);
  const until = Date.parse(record.valid_until);
  if (!Number.isFinite(from) || !Number.isFinite(until) || from >= until) {
    throw new LedgerError("DENY_INVALID_TEMPORAL_WINDOW", `${label} must have valid_from earlier than valid_until`);
  }
}

function assertLookup(lookup, name) {
  if (typeof lookup !== "function") {
    throw new LedgerError("INVALID_LEDGER_CONFIG", `${name} lookup function is required`);
  }
  return lookup;
}

function toEntry(payload, { entryId, type, timestamp, idempotencyKey }) {
  return {
    entryId,
    projectId: payload.project_id,
    workPackageId: payload.work_package_id,
    sessionId: payload.session_id,
    actorId: payload.actor_id,
    type,
    payload,
    timestamp,
    idempotencyKey
  };
}

export class DecisionLedger extends DurableLedger {
  constructor({ filePath }) {
    super({ filePath, ledgerId: "secb-decision-ledger" });
  }

  appendDecision(record, { expectedSequence, idempotencyKey }) {
    validateContract("decisionRecord", record);
    assertWindow(record, "Decision record");
    if (!idempotencyKey) throw new LedgerError("DENY_MISSING_ENTRY_FIELDS", "idempotencyKey is required for decision append");
    if (record.decision_type === "REVERSION" && !record.reverts) {
      throw new LedgerError("DENY_INCONSISTENT_REVERSION", "REVERSION decisions must name the decision they revert");
    }
    // Only REVERSION decisions may carry reverts — otherwise any decision
    // append could silently suppress another decision without reversion
    // authority.
    if (record.decision_type !== "REVERSION" && record.reverts !== undefined) {
      throw new LedgerError("DENY_INCONSISTENT_REVERSION", "Only REVERSION decisions may carry a reverts reference");
    }
    // No pre-emptive reversion: the target must already exist in this
    // ledger, or a reversion could lie in wait for a future decision.
    if (record.decision_type === "REVERSION" && !this.read().some((existing) => existing.entry.entryId === record.reverts)) {
      throw new LedgerError("DENY_UNKNOWN_DECISION", `Reversion targets an unknown decision: ${record.reverts}`);
    }
    return this.append(
      toEntry(record, { entryId: record.decision_id, type: record.decision_type, timestamp: record.decided_at, idempotencyKey }),
      { expectedSequence }
    );
  }

  // Fail-closed temporal resolution: unknown, out-of-window, or reverted
  // decisions resolve to NONE with a typed reason — never a stale record.
  resolveEffective(decisionId, { at }) {
    const instant = Date.parse(at);
    if (!Number.isFinite(instant)) {
      return { decision: null, code: "DENY_INVALID_INSTANT", reason: "Resolution instant must be a date-time" };
    }
    const records = this.read();
    const match = records.find((record) => record.entry.entryId === decisionId);
    if (!match) return { decision: null, code: "DENY_UNKNOWN_DECISION", reason: `Unknown decision: ${decisionId}` };
    const payload = match.entry.payload;
    // Defense in depth: only a REVERSION-typed decision suppresses another
    // decision, mirroring the append-time constraint.
    if (records.some((record) => record.entry.payload.decision_type === "REVERSION" && record.entry.payload.reverts === decisionId)) {
      return { decision: null, code: "DENY_REVERTED", reason: "Decision has been reverted" };
    }
    if (instant < Date.parse(payload.valid_from) || instant >= Date.parse(payload.valid_until)) {
      return { decision: null, code: "DENY_TEMPORAL_BOUNDARY", reason: "Decision is outside its validity window" };
    }
    return { decision: structuredClone(payload), code: "ALLOW" };
  }
}

export class KnowledgeLedger extends DurableLedger {
  #evidenceLookup;

  constructor({ filePath, evidenceLookup }) {
    super({ filePath, ledgerId: "secb-knowledge-ledger" });
    this.#evidenceLookup = assertLookup(evidenceLookup, "evidence");
  }

  // Learning boundary: every claim must chain to evidence that an
  // independent verification process has moved to VERIFIED or ACCEPTED.
  appendClaim(claim, { expectedSequence, idempotencyKey }) {
    validateContract("knowledgeClaim", claim);
    assertWindow(claim, "Knowledge claim");
    if (!idempotencyKey) throw new LedgerError("DENY_MISSING_ENTRY_FIELDS", "idempotencyKey is required for claim append");
    for (const ref of claim.evidence_refs) {
      const evidence = this.#evidenceLookup(ref);
      if (!evidence) {
        throw new LedgerError("DENY_EVIDENCE_CHAIN", `Evidence reference does not resolve: ${ref}`);
      }
      // Identity binding: a miswired lookup must fail loudly, not silently
      // collapse the learning boundary.
      if (evidence.evidence_id !== ref) {
        throw new LedgerError("DENY_EVIDENCE_CHAIN", `Evidence lookup returned a mismatched envelope for: ${ref}`);
      }
      if (!ACCEPTED_EVIDENCE_STATUSES.includes(evidence.verification_status)) {
        throw new LedgerError("DENY_EVIDENCE_CHAIN", `Evidence is not verified/accepted: ${ref} (${evidence.verification_status})`);
      }
    }
    return this.append(
      toEntry(claim, { entryId: claim.claim_id, type: "KNOWLEDGE_CLAIM", timestamp: claim.claimed_at, idempotencyKey }),
      { expectedSequence }
    );
  }

  // V-012 temporal boundary: a memory/knowledge record resolves only
  // within its validity window; expired records deny rather than decay.
  resolveClaim(claimId, { at }) {
    const instant = Date.parse(at);
    if (!Number.isFinite(instant)) {
      return { claim: null, code: "DENY_INVALID_INSTANT", reason: "Resolution instant must be a date-time" };
    }
    const match = this.read().find((record) => record.entry.entryId === claimId);
    if (!match) return { claim: null, code: "DENY_UNKNOWN_CLAIM", reason: `Unknown claim: ${claimId}` };
    const payload = match.entry.payload;
    if (instant < Date.parse(payload.valid_from) || instant >= Date.parse(payload.valid_until)) {
      return { claim: null, code: "DENY_TEMPORAL_BOUNDARY", reason: "Claim is outside its validity window" };
    }
    return { claim: structuredClone(payload), code: "ALLOW" };
  }
}

export class OutcomeLedger extends DurableLedger {
  #decisionLookup;

  constructor({ filePath, decisionLookup }) {
    super({ filePath, ledgerId: "secb-outcome-ledger" });
    this.#decisionLookup = assertLookup(decisionLookup, "decision");
  }

  // V-018: an outcome receipt validates or invalidates a decision; an
  // INVALIDATED outcome must carry (and the result surfaces) the
  // reversion obligation. The consistency is enforced, not inferred.
  appendOutcome(outcome, { expectedSequence, idempotencyKey }) {
    validateContract("outcomeReceipt", outcome);
    if (!idempotencyKey) throw new LedgerError("DENY_MISSING_ENTRY_FIELDS", "idempotencyKey is required for outcome append");
    const decision = this.#decisionLookup(outcome.decision_ref);
    if (!decision) {
      throw new LedgerError("DENY_UNKNOWN_DECISION", `Outcome references an unknown decision: ${outcome.decision_ref}`);
    }
    const decisionId = decision.entry?.entryId ?? decision.decision_id;
    if (decisionId !== outcome.decision_ref) {
      throw new LedgerError("DENY_UNKNOWN_DECISION", `Decision lookup returned a mismatched record for: ${outcome.decision_ref}`);
    }
    const mustRevert = outcome.outcome_status === "INVALIDATED";
    if (outcome.reversion_required !== mustRevert) {
      throw new LedgerError(
        "DENY_INCONSISTENT_REVERSION",
        `reversion_required must be ${mustRevert} for ${outcome.outcome_status} outcomes`
      );
    }
    const record = this.append(
      toEntry(outcome, { entryId: outcome.outcome_id, type: `OUTCOME_${outcome.outcome_status}`, timestamp: outcome.observed_at, idempotencyKey }),
      { expectedSequence }
    );
    return { ...record, reversionRequired: mustRevert };
  }
}
