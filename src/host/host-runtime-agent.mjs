import { createHash } from "node:crypto";

export class HostAgentError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "HostAgentError";
    this.code = code;
  }
}

function contentHash(payload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export class HostRuntimeAgent {
  #registry;
  #eventLedger;
  #projectId;
  #workPackageId;
  #sessionId;
  #sequence;

  constructor({ registry, eventLedger, projectId, workPackageId, sessionId }) {
    if (!registry) throw new HostAgentError("MISSING_REGISTRY", "RuntimeRegistry is required");
    if (!eventLedger) throw new HostAgentError("MISSING_LEDGER", "EventLedger is required");
    if (!projectId || !workPackageId || !sessionId) {
      throw new HostAgentError("MISSING_CONTEXT", "projectId, workPackageId, and sessionId are required");
    }
    this.#registry = registry;
    this.#eventLedger = eventLedger;
    this.#projectId = projectId;
    this.#workPackageId = workPackageId;
    this.#sessionId = sessionId;
    this.#sequence = 0;
  }

  resolveAdapter(instanceId) {
    return this.#registry.resolve(instanceId);
  }

  emitEvent(instanceId, { eventType, observedFact, classification = "INTERNAL", idempotencyKey }) {
    const resolution = this.#registry.resolve(instanceId);
    if (!resolution.resolved) {
      throw new HostAgentError("DENY_UNRESOLVED_ADAPTER", `Adapter quarantined: ${resolution.reason}`);
    }

    if (!eventType || !observedFact || !idempotencyKey) {
      throw new HostAgentError("DENY_INCOMPLETE_EVENT", "eventType, observedFact, and idempotencyKey are required");
    }

    const event = {
      event_id: `evt_${this.#sessionId}_${++this.#sequence}`,
      version: 1,
      project_id: this.#projectId,
      work_package_id: this.#workPackageId,
      session_id: this.#sessionId,
      actor_id: instanceId,
      event_type: eventType,
      occurred_at: new Date().toISOString(),
      observed_fact: observedFact,
      source: resolution.identity.runtime_product_id,
      idempotency_key: idempotencyKey,
      classification,
      content_hash: contentHash(observedFact)
    };

    const result = this.#eventLedger.appendEvent(event, { expectedSequence: this.#sequence - 1 });
    return { event, ledgerSequence: result.sequence };
  }

  observe(instanceId, { domain, detail, idempotencyKey }) {
    return this.emitEvent(instanceId, {
      eventType: `${domain}.observed`,
      observedFact: { domain, detail, read_only: true },
      idempotencyKey
    });
  }
}
