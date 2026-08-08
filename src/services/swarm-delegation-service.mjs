import { createHash } from "node:crypto";
import { HandoffService } from "./handoff-service.mjs";

export class SwarmDelegationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SwarmDelegationError";
    this.code = code;
  }
}

function hashString(val) {
  return createHash("sha256").update(val).digest("hex");
}

export class SwarmDelegationService {
  #handoffService;
  #delegations = new Map();

  constructor({ handoffService } = {}) {
    this.#handoffService = handoffService ?? new HandoffService({
      evidenceLedger: { append: () => ({ valid: true }), verify: () => ({ valid: true }) },
      workPackageService: {
        resolveEffective: () => ({ status: "ACTIVE" }),
        getDecisionLedger: () => ({ read: () => [] })
      }
    });
  }

  delegateTask({ parentAgentId, subagentId, taskId, role = "specialist", payload = {} }) {
    if (!parentAgentId || !subagentId || !taskId) {
      throw new SwarmDelegationError("INVALID_DELEGATION_PARAMS", "parentAgentId, subagentId, and taskId are required");
    }

    // SoD invariant: Parent agent cannot delegate to itself as a subagent (Maker-Checker violation)
    if (parentAgentId === subagentId) {
      throw new SwarmDelegationError("DENY_SOD_SELF_DELEGATION", "Maker-Checker SoD violation: Agent cannot delegate to itself as a subagent");
    }

    const delegationId = `SWARM-DEL-${taskId}-${Date.now()}`;
    const timestamp = new Date().toISOString();

    const handoffEnvelope = {
      handoff_id: `HANDOFF-${delegationId}`,
      producer_agent: parentAgentId,
      consumer_agent: subagentId,
      task_id: taskId,
      role,
      payload,
      created_at: timestamp
    };

    const fingerprint = hashString(JSON.stringify(handoffEnvelope));

    const record = {
      delegation_id: delegationId,
      parent_agent_id: parentAgentId,
      subagent_id: subagentId,
      task_id: taskId,
      role,
      status: "DELEGATED",
      fingerprint,
      handoff_envelope: handoffEnvelope,
      created_at: timestamp
    };

    this.#delegations.set(delegationId, record);
    return record;
  }

  verifyDelegationChain(delegationId) {
    const record = this.#delegations.get(delegationId);
    if (!record) {
      throw new SwarmDelegationError("DELEGATION_NOT_FOUND", `Delegation ${delegationId} not found`);
    }

    const expectedHash = hashString(JSON.stringify(record.handoff_envelope));
    const isIntegrityValid = record.fingerprint === expectedHash;

    return {
      ok: true,
      delegation_id: delegationId,
      status: record.status,
      parent_agent_id: record.parent_agent_id,
      subagent_id: record.subagent_id,
      integrity_verified: isIntegrityValid,
      sod_compliant: record.parent_agent_id !== record.subagent_id
    };
  }
}
