// ADR-0012 candidate pure handshake transcript validation.
//
// This module performs no cryptography, filesystem, socket, network, process,
// credential, clock-source, replay-store, or session I/O. It checks an
// already-supplied public transcript against an injected schema validator and
// caller-supplied trusted context. A successful result remains non-authorizing:
// a later SEC-reviewed proof verifier and atomic replay store must consume it.

export const LOCAL_BRIDGE_HANDSHAKE_MAX_TTL_MS = 30 * 1000;

const OPTION_KEYS = new Set([
  "acceptedProtocolVersions",
  "expectedAuthorityDomainId",
  "expectedEndpointBindingId",
  "expectedHarnessInstallationId",
  "expectedInstallationKeyId",
  "expectedLocatorId",
  "expectedRuntimeDeploymentId",
  "expectedServiceInstanceId",
  "expectedServiceKeyId",
  "minimumProtocolVersion",
  "now",
  "replayState",
  "validateTranscript"
]);

const EXPECTED_BINDINGS = [
  ["harness_installation_id", "expectedHarnessInstallationId", "DENY_HANDSHAKE_INSTALLATION_MISMATCH"],
  ["installation_key_id", "expectedInstallationKeyId", "DENY_HANDSHAKE_INSTALLATION_MISMATCH"],
  ["runtime_deployment_id", "expectedRuntimeDeploymentId", "DENY_HANDSHAKE_CONTEXT_MISMATCH"],
  ["service_instance_id", "expectedServiceInstanceId", "DENY_HANDSHAKE_SERVICE_MISMATCH"],
  ["service_key_id", "expectedServiceKeyId", "DENY_HANDSHAKE_SERVICE_MISMATCH"],
  ["authority_domain_id", "expectedAuthorityDomainId", "DENY_HANDSHAKE_CONTEXT_MISMATCH"],
  ["locator_id", "expectedLocatorId", "DENY_HANDSHAKE_CONTEXT_MISMATCH"],
  ["endpoint_binding_id", "expectedEndpointBindingId", "DENY_HANDSHAKE_CONTEXT_MISMATCH"]
];

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deny(code) {
  throw new LocalBridgeHandshakeError(code);
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function validateOptions(options) {
  if (!isPlainObject(options)) deny("DENY_HANDSHAKE_OPTIONS");
  for (const key of Object.keys(options)) {
    if (!OPTION_KEYS.has(key)) deny("DENY_HANDSHAKE_OPTIONS");
  }
  for (const [, optionKey] of EXPECTED_BINDINGS) {
    if (typeof options[optionKey] !== "string" || options[optionKey] === "") {
      deny("DENY_HANDSHAKE_TRUSTED_CONTEXT");
    }
  }
}

function validateContract(transcript, validateTranscript) {
  if (typeof validateTranscript !== "function") {
    deny("DENY_HANDSHAKE_VALIDATOR_UNAVAILABLE");
  }
  try {
    const candidate = structuredClone(transcript);
    const result = validateTranscript(candidate);
    if (result !== true && result?.valid !== true) {
      deny("DENY_HANDSHAKE_TRANSCRIPT_INVALID");
    }
    return candidate;
  } catch (error) {
    if (error instanceof LocalBridgeHandshakeError) throw error;
    deny("DENY_HANDSHAKE_TRANSCRIPT_INVALID");
  }
}

function safeNow(now) {
  if (typeof now !== "function") deny("DENY_HANDSHAKE_CLOCK_UNAVAILABLE");
  try {
    const value = now();
    const epochMs = Date.prototype.getTime.call(value);
    if (!Number.isFinite(epochMs)) deny("DENY_HANDSHAKE_CLOCK_UNAVAILABLE");
    return epochMs;
  } catch (error) {
    if (error instanceof LocalBridgeHandshakeError) throw error;
    deny("DENY_HANDSHAKE_CLOCK_UNAVAILABLE");
  }
}

function validateTimeWindow(transcript, nowMs) {
  const requestedAtMs = Date.parse(transcript.requested_at);
  const expiresAtMs = Date.parse(transcript.expires_at);
  if (!Number.isFinite(requestedAtMs) || !Number.isFinite(expiresAtMs) || expiresAtMs <= requestedAtMs) {
    deny("DENY_HANDSHAKE_TIME_INVALID");
  }
  if (expiresAtMs - requestedAtMs > LOCAL_BRIDGE_HANDSHAKE_MAX_TTL_MS) {
    deny("DENY_HANDSHAKE_TTL_EXCEEDED");
  }
  if (nowMs < requestedAtMs) deny("DENY_HANDSHAKE_NOT_YET_VALID");
  if (nowMs >= expiresAtMs) deny("DENY_HANDSHAKE_EXPIRED");
  return { requestedAtMs, expiresAtMs };
}

function validateBindings(transcript, options) {
  for (const [field, optionKey, code] of EXPECTED_BINDINGS) {
    if (transcript[field] !== options[optionKey]) deny(code);
  }
}

function validateVersionList(value) {
  if (!Array.isArray(value) || value.length === 0) {
    deny("DENY_HANDSHAKE_PROTOCOL_POLICY");
  }
  const unique = new Set();
  for (const version of value) {
    if (typeof version !== "string" || !/^[1-9][0-9]{0,5}$/.test(version) || unique.has(version)) {
      deny("DENY_HANDSHAKE_PROTOCOL_POLICY");
    }
    unique.add(version);
  }
  return unique;
}

function validateProtocol(transcript, acceptedProtocolVersions, minimumProtocolVersion) {
  const accepted = validateVersionList(acceptedProtocolVersions);
  if (
    typeof minimumProtocolVersion !== "string"
    || !/^[1-9][0-9]{0,5}$/.test(minimumProtocolVersion)
    || !accepted.has(minimumProtocolVersion)
  ) {
    deny("DENY_HANDSHAKE_PROTOCOL_POLICY");
  }

  const client = new Set(transcript.client_supported_protocol_versions);
  const service = new Set(transcript.service_supported_protocol_versions);
  const common = [...accepted].filter(
    (version) =>
      client.has(version)
      && service.has(version)
      && BigInt(version) >= BigInt(minimumProtocolVersion)
  );
  if (common.length === 0) deny("DENY_HANDSHAKE_PROTOCOL_INCOMPATIBLE");

  common.sort((left, right) => {
    const leftValue = BigInt(left);
    const rightValue = BigInt(right);
    return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
  });
  const strongestCommon = common.at(-1);
  if (transcript.selected_protocol_version !== strongestCommon) {
    deny("DENY_HANDSHAKE_DOWNGRADE");
  }
}

function validateReplay(transcript, replayState) {
  if (!isPlainObject(replayState)) deny("DENY_HANDSHAKE_REPLAY_STATE");
  const keys = Object.keys(replayState);
  if (
    keys.length !== 3
    || !keys.includes("handshake_ids")
    || !keys.includes("client_nonces")
    || !keys.includes("service_nonces")
  ) {
    deny("DENY_HANDSHAKE_REPLAY_STATE");
  }
  for (const key of keys) {
    if (!Array.isArray(replayState[key]) || replayState[key].some((value) => typeof value !== "string")) {
      deny("DENY_HANDSHAKE_REPLAY_STATE");
    }
  }
  if (transcript.client_nonce === transcript.service_nonce) {
    deny("DENY_HANDSHAKE_NONCE_COLLISION");
  }
  if (
    replayState.handshake_ids.includes(transcript.handshake_id)
    || replayState.client_nonces.includes(transcript.client_nonce)
    || replayState.service_nonces.includes(transcript.service_nonce)
  ) {
    deny("DENY_HANDSHAKE_REPLAY");
  }
}

export class LocalBridgeHandshakeError extends Error {
  constructor(code) {
    super("Local bridge handshake transcript denied");
    this.name = "LocalBridgeHandshakeError";
    this.code = code;
  }
}

export function validateLocalBridgeHandshakeTranscript(transcript, options = {}) {
  validateOptions(options);
  const candidate = validateContract(transcript, options.validateTranscript);
  const nowMs = safeNow(options.now);
  const { requestedAtMs, expiresAtMs } = validateTimeWindow(candidate, nowMs);
  validateBindings(candidate, options);
  validateProtocol(
    candidate,
    options.acceptedProtocolVersions,
    options.minimumProtocolVersion
  );
  validateReplay(candidate, options.replayState);

  return deepFreeze({
    validation_status: "CANDIDATE_TRANSCRIPT_VERIFIED",
    cryptographic_verification_required: true,
    replay_commit_required: true,
    session_issuance_authorized: false,
    handshake_id: candidate.handshake_id,
    purpose: candidate.purpose,
    harness_installation_id: candidate.harness_installation_id,
    runtime_deployment_id: candidate.runtime_deployment_id,
    service_instance_id: candidate.service_instance_id,
    authority_domain_id: candidate.authority_domain_id,
    locator_id: candidate.locator_id,
    installation_key_id: candidate.installation_key_id,
    service_key_id: candidate.service_key_id,
    endpoint_binding_id: candidate.endpoint_binding_id,
    selected_protocol_version: candidate.selected_protocol_version,
    requested_at: new Date(requestedAtMs).toISOString(),
    expires_at: new Date(expiresAtMs).toISOString(),
    replay_claims: {
      handshake_id: candidate.handshake_id,
      client_nonce: candidate.client_nonce,
      service_nonce: candidate.service_nonce
    }
  });
}
