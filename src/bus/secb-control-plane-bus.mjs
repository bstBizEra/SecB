import { createHash } from "node:crypto";

/**
 * SecB Control Plane Bus
 * Central event-driven publish/subscribe message bus connecting all SecB modules.
 * Enforces classification ceiling filtering (PUBLIC -> RESTRICTED) and SHA-256 fingerprint sealing.
 */

export class ControlPlaneBusError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ControlPlaneBusError";
    this.code = code;
  }
}

const CLASS_ORDER = Object.freeze(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"]);

function hashString(val) {
  return createHash("sha256").update(val).digest("hex");
}

export class SecBControlPlaneBus {
  #subscribers = new Map();
  #eventHistory = [];

  publishEvent({ eventType, sourceModule, payload = {}, classification = "INTERNAL" }) {
    if (!eventType || !sourceModule) {
      throw new ControlPlaneBusError("INVALID_EVENT_PARAMS", "eventType and sourceModule are required");
    }

    const eventId = `BUS-EVT-${sourceModule}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const timestamp = new Date().toISOString();

    const rawEvent = {
      event_id: eventId,
      event_type: eventType,
      source_module: sourceModule,
      payload,
      classification: classification.toUpperCase(),
      timestamp
    };

    const fingerprint = hashString(JSON.stringify(rawEvent));
    const eventRecord = { ...rawEvent, fingerprint };

    this.#eventHistory.push(eventRecord);

    // Dispatch to registered subscribers
    const handlers = this.#subscribers.get(eventType) ?? [];
    const eventRank = CLASS_ORDER.indexOf(eventRecord.classification);

    for (const sub of handlers) {
      const ceilingRank = CLASS_ORDER.indexOf(sub.classificationCeiling);
      // Withhold event payload if event classification is above subscriber ceiling
      if (eventRank <= ceilingRank) {
        try {
          sub.handler(eventRecord);
        } catch (_e) {}
      }
    }

    return eventRecord;
  }

  subscribe({ eventType, subscriberId, handler, classificationCeiling = "INTERNAL" }) {
    if (!eventType || !subscriberId || typeof handler !== "function") {
      throw new ControlPlaneBusError("INVALID_SUBSCRIBER_PARAMS", "eventType, subscriberId, and handler function are required");
    }

    if (!this.#subscribers.has(eventType)) {
      this.#subscribers.set(eventType, []);
    }

    const list = this.#subscribers.get(eventType);
    list.push({
      subscriberId,
      handler,
      classificationCeiling: classificationCeiling.toUpperCase()
    });

    return {
      subscribed: true,
      event_type: eventType,
      subscriber_id: subscriberId
    };
  }

  inspectEventHistory({ limit = 10, eventType = null } = {}) {
    let list = this.#eventHistory;
    if (eventType) {
      list = list.filter((e) => e.event_type === eventType);
    }
    return list.slice(-limit);
  }
}
