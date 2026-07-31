import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import { validateContract } from "../contracts/contract-validator.mjs";
import { canonicalFingerprint } from "../contracts/canonical-fingerprint.mjs";

const deny = (code) => Object.freeze({ ok: false, deny_code: code, message: "request denied" });
const digest = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const nonBlank = (value) => typeof value === "string" && value.trim() !== "";

function sameDigest(left, right) {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Proposal-only enrollment boundary.
 *
 * A caller supplies runtime claims and proof-key fingerprint. SecB generates
 * the canonical instance id and stores the record at the minimum possible
 * authority. Approval, activation, role assignment, and evidence acceptance
 * deliberately do not exist in this service.
 */
export class AgentEnrollmentService {
  #registry;
  #ledgerWriter;
  #now;
  #idFactory;
  #receiptFactory;
  #byIdempotency = new Map();
  #receipts = new Map();

  constructor({
    registry,
    ledgerWriter,
    now = () => new Date(),
    idFactory = () => `inst_${randomUUID().replaceAll("-", "")}`,
    receiptFactory = () => randomBytes(32).toString("base64url")
  } = {}) {
    if (!registry || typeof registry.register !== "function" || typeof registry.get !== "function") {
      throw new Error("AgentEnrollmentService requires a runtime registry");
    }
    if (typeof ledgerWriter !== "function") {
      throw new Error("AgentEnrollmentService requires an append-only ledgerWriter");
    }
    this.#registry = registry;
    this.#ledgerWriter = ledgerWriter;
    this.#now = now;
    this.#idFactory = idFactory;
    this.#receiptFactory = receiptFactory;
  }

  propose(request) {
    try {
      validateContract("agentEnrollmentRequest", request);
    } catch {
      return deny("DENY_ENROLLMENT_INVALID");
    }

    const requestFingerprint = canonicalFingerprint(request);
    const prior = this.#byIdempotency.get(request.idempotency_key);
    if (prior) {
      if (prior.requestFingerprint !== requestFingerprint) return deny("DENY_IDEMPOTENCY_CONFLICT");
      return Object.freeze({ ...prior.response, replayed: true });
    }

    const instanceId = this.#idFactory();
    const receipt = this.#receiptFactory();
    const proposedAt = this.#now().toISOString();
    if (!nonBlank(instanceId) || !nonBlank(receipt) || !Number.isFinite(Date.parse(proposedAt))) {
      return deny("DENY_ENROLLMENT_RUNTIME");
    }

    const registration = {
      provider_id: request.provider_id,
      runtime_product_id: request.runtime_product_id,
      runtime_deployment_id: request.runtime_deployment_id,
      agent_profile_id: request.agent_profile_id,
      agent_instance_id: instanceId,
      runtime_version: request.runtime_version,
      deployment_location: request.deployment_location,
      owner: "UNVERIFIED",
      permitted_roles: [],
      authority_ceiling: "A0",
      approved_models: [],
      approved_tools: [],
      approved_mcp_methods: [],
      approved_skills: [],
      repository_scopes: [],
      environment_scopes: [],
      max_data_classification: "PUBLIC",
      delegation_rights: [],
      evidence_obligations: ["independent-agent-evaluation"],
      workload_identity_ref: request.public_key_fingerprint,
      evaluation_status: "CANDIDATE",
      lifecycle_state: "PENDING"
    };
    if (this.#registry.get(instanceId)) return deny("DENY_DUPLICATE_INSTANCE");

    const event = Object.freeze({
      event_type: "AGENT_ENROLLMENT_PROPOSED",
      occurred_at: proposedAt,
      agent_instance_id: instanceId,
      request_fingerprint: requestFingerprint,
      idempotency_key: request.idempotency_key,
      disposition: "CANDIDATE_PENDING"
    });
    try {
      this.#ledgerWriter(event);
      this.#registry.register(registration);
    } catch {
      return deny("DENY_ENROLLMENT_UNAVAILABLE");
    }

    const response = Object.freeze({
      ok: true,
      agent_instance_id: instanceId,
      evaluation_status: "CANDIDATE",
      lifecycle_state: "PENDING",
      authority_ceiling: "A0",
      max_data_classification: "PUBLIC",
      registration_receipt: receipt
    });
    this.#receipts.set(instanceId, digest(receipt));
    this.#byIdempotency.set(request.idempotency_key, { requestFingerprint, response });
    return response;
  }

  inspect(agentInstanceId, registrationReceipt) {
    if (!nonBlank(agentInstanceId) || !nonBlank(registrationReceipt)) {
      return deny("DENY_ENROLLMENT_RECEIPT");
    }
    const expected = this.#receipts.get(agentInstanceId);
    if (!expected || !sameDigest(expected, digest(registrationReceipt))) {
      return deny("DENY_ENROLLMENT_RECEIPT");
    }
    const record = this.#registry.get(agentInstanceId);
    if (!record) return deny("DENY_UNKNOWN_INSTANCE");
    return Object.freeze({
      ok: true,
      agent_instance_id: record.agent_instance_id,
      provider_id: record.provider_id,
      runtime_product_id: record.runtime_product_id,
      runtime_deployment_id: record.runtime_deployment_id,
      agent_profile_id: record.agent_profile_id,
      evaluation_status: record.evaluation_status,
      lifecycle_state: record.lifecycle_state,
      authority_ceiling: record.authority_ceiling,
      permitted_roles: Object.freeze([...record.permitted_roles])
    });
  }
}
