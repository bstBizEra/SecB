// ADR-0012 candidate pure installation-proof envelope validation.
//
// This module deliberately does not interpret proof_value, choose a proof
// algorithm, perform cryptography, read credentials, access a replay store, or
// issue a session. It only validates public envelope shape, binding, policy,
// and time semantics before a future SEC-reviewed verifier is invoked.

export const LOCAL_BRIDGE_PROOF_MAX_TTL_MS = 30 * 1000;

const OPTION_KEYS = new Set([
  "acceptedProofProfileIds",
  "now",
  "validateProof",
  "validateTranscript"
]);

const TRANSCRIPT_BINDINGS = [
  ["handshake_id", "handshake_id"],
  ["harness_installation_id", "harness_installation_id"],
  ["runtime_deployment_id", "runtime_deployment_id"],
  ["installation_key_id", "installation_key_id"],
  ["service_instance_id", "service_instance_id"],
  ["service_key_id", "service_key_id"],
  ["authority_domain_id", "authority_domain_id"],
  ["locator_id", "locator_id"],
  ["endpoint_binding_id", "endpoint_binding_id"],
  ["client_nonce", "client_nonce"],
  ["service_nonce", "service_nonce"],
  ["selected_protocol_version", "selected_protocol_version"]
];

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deny(code) {
  throw new LocalBridgeInstallationProofError(code);
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function validateOptions(options) {
  if (!isPlainObject(options)) deny("DENY_PROOF_OPTIONS");
  for (const key of Object.keys(options)) {
    if (!OPTION_KEYS.has(key)) deny("DENY_PROOF_OPTIONS");
  }
}

function validateCandidate(value, validator, unavailableCode, invalidCode) {
  if (typeof validator !== "function") deny(unavailableCode);
  try {
    const candidate = structuredClone(value);
    const result = validator(candidate);
    if (result !== true && result?.valid !== true) deny(invalidCode);
    return candidate;
  } catch (error) {
    if (error instanceof LocalBridgeInstallationProofError) throw error;
    deny(invalidCode);
  }
}

function safeNow(now) {
  if (typeof now !== "function") deny("DENY_PROOF_CLOCK_UNAVAILABLE");
  try {
    const epochMs = Date.prototype.getTime.call(now());
    if (!Number.isFinite(epochMs)) deny("DENY_PROOF_CLOCK_UNAVAILABLE");
    return epochMs;
  } catch (error) {
    if (error instanceof LocalBridgeInstallationProofError) throw error;
    deny("DENY_PROOF_CLOCK_UNAVAILABLE");
  }
}

function validateProfiles(acceptedProofProfileIds, selectedProfileId) {
  if (
    !Array.isArray(acceptedProofProfileIds)
    || acceptedProofProfileIds.length === 0
    || acceptedProofProfileIds.some(
      (profile, index) =>
        typeof profile !== "string"
        || profile === ""
        || acceptedProofProfileIds.indexOf(profile) !== index
    )
  ) {
    deny("DENY_PROOF_PROFILE_POLICY");
  }
  if (!acceptedProofProfileIds.includes(selectedProfileId)) {
    deny("DENY_PROOF_PROFILE_NOT_ACCEPTED");
  }
}

function validateBinding(proof, transcript) {
  for (const [proofField, transcriptField] of TRANSCRIPT_BINDINGS) {
    if (proof[proofField] !== transcript[transcriptField]) {
      if (proofField === "installation_key_id" || proofField === "harness_installation_id") {
        deny("DENY_PROOF_INSTALLATION_MISMATCH");
      }
      if (proofField === "service_key_id" || proofField === "service_instance_id") {
        deny("DENY_PROOF_SERVICE_MISMATCH");
      }
      deny("DENY_PROOF_TRANSCRIPT_MISMATCH");
    }
  }
}

function validateTimeWindow(proof, transcript, nowMs) {
  const issuedAtMs = Date.parse(proof.issued_at);
  const expiresAtMs = Date.parse(proof.expires_at);
  const transcriptRequestedAtMs = Date.parse(transcript.requested_at);
  const transcriptExpiresAtMs = Date.parse(transcript.expires_at);
  if (
    !Number.isFinite(issuedAtMs)
    || !Number.isFinite(expiresAtMs)
    || !Number.isFinite(transcriptRequestedAtMs)
    || !Number.isFinite(transcriptExpiresAtMs)
    || expiresAtMs <= issuedAtMs
    || issuedAtMs < transcriptRequestedAtMs
    || expiresAtMs > transcriptExpiresAtMs
  ) {
    deny("DENY_PROOF_TIME_INVALID");
  }
  if (expiresAtMs - issuedAtMs > LOCAL_BRIDGE_PROOF_MAX_TTL_MS) {
    deny("DENY_PROOF_TTL_EXCEEDED");
  }
  if (nowMs < issuedAtMs) deny("DENY_PROOF_NOT_YET_VALID");
  if (nowMs >= expiresAtMs) deny("DENY_PROOF_EXPIRED");
  return { issuedAtMs, expiresAtMs };
}

export class LocalBridgeInstallationProofError extends Error {
  constructor(code) {
    super("Local bridge installation proof denied");
    this.name = "LocalBridgeInstallationProofError";
    this.code = code;
  }
}

export function validateLocalBridgeInstallationProof(proof, transcript, options = {}) {
  validateOptions(options);
  const candidateProof = validateCandidate(
    proof,
    options.validateProof,
    "DENY_PROOF_VALIDATOR_UNAVAILABLE",
    "DENY_PROOF_INVALID"
  );
  const candidateTranscript = validateCandidate(
    transcript,
    options.validateTranscript,
    "DENY_PROOF_TRANSCRIPT_VALIDATOR_UNAVAILABLE",
    "DENY_PROOF_TRANSCRIPT_INVALID"
  );
  const nowMs = safeNow(options.now);
  validateProfiles(options.acceptedProofProfileIds, candidateProof.proof_profile_id);
  validateBinding(candidateProof, candidateTranscript);
  const { issuedAtMs, expiresAtMs } = validateTimeWindow(
    candidateProof,
    candidateTranscript,
    nowMs
  );

  return deepFreeze({
    validation_status: "CANDIDATE_PROOF_ENVELOPE_VERIFIED",
    cryptographic_verification_required: true,
    proof_acceptance_authorized: false,
    replay_commit_required: true,
    session_issuance_authorized: false,
    proof_id: candidateProof.proof_id,
    proof_profile_id: candidateProof.proof_profile_id,
    handshake_id: candidateProof.handshake_id,
    harness_installation_id: candidateProof.harness_installation_id,
    runtime_deployment_id: candidateProof.runtime_deployment_id,
    service_instance_id: candidateProof.service_instance_id,
    authority_domain_id: candidateProof.authority_domain_id,
    installation_key_id: candidateProof.installation_key_id,
    service_key_id: candidateProof.service_key_id,
    issued_at: new Date(issuedAtMs).toISOString(),
    expires_at: new Date(expiresAtMs).toISOString()
  });
}
