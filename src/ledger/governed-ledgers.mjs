import { validateContract } from "../contracts/contract-validator.mjs";
import { DurableLedger } from "./durable-ledger.mjs";

function eventEntry(event) {
  return {
    entryId: event.event_id,
    projectId: event.project_id,
    workPackageId: event.work_package_id,
    sessionId: event.session_id,
    actorId: event.actor_id,
    type: event.event_type,
    payload: event,
    timestamp: event.occurred_at,
    idempotencyKey: event.idempotency_key
  };
}

function evidenceEntry(evidence, idempotencyKey) {
  return {
    entryId: evidence.evidence_id,
    projectId: evidence.project_id,
    workPackageId: evidence.work_package_id,
    sessionId: evidence.session_id,
    actorId: evidence.actor_id,
    type: evidence.evidence_type,
    payload: evidence,
    timestamp: evidence.observed_at,
    idempotencyKey
  };
}

export class EventLedger extends DurableLedger {
  constructor({ filePath }) {
    super({ filePath, ledgerId: "secb-event-ledger" });
  }

  appendEvent(event, { expectedSequence }) {
    validateContract("eventEnvelope", event);
    return this.append(eventEntry(event), { expectedSequence });
  }
}

export class EvidenceLedger extends DurableLedger {
  constructor({ filePath }) {
    super({ filePath, ledgerId: "secb-evidence-ledger" });
  }

  appendEvidence(evidence, { expectedSequence, idempotencyKey }) {
    validateContract("evidenceEnvelope", evidence);
    if (!idempotencyKey) throw new TypeError("idempotencyKey is required for evidence append");
    return this.append(evidenceEntry(evidence, idempotencyKey), { expectedSequence });
  }
}
