import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  LocalBridgeHandshakeError,
  validateLocalBridgeHandshakeTranscript
} from "../src/bridge/local-bridge-handshake-transcript.mjs";
import {
  LocalBridgeInstallationProofError,
  validateLocalBridgeInstallationProof
} from "../src/bridge/local-bridge-installation-proof.mjs";
import {
  ContractValidationError,
  validateContract
} from "../src/contracts/contract-validator.mjs";

const fixture = (relativePath) =>
  JSON.parse(
    readFileSync(resolve(import.meta.dirname, "fixtures", relativePath), "utf8")
  );

const transcript = fixture("valid/local-bridge-handshake-transcript.json");
const proof = fixture("valid/local-bridge-installation-proof.json");
const validateTranscript = (candidate) =>
  validateContract("localBridgeHandshakeTranscript", candidate);
const validateProof = (candidate) =>
  validateContract("localBridgeInstallationProof", candidate);
const now = () => new Date("2026-07-31T08:02:15Z");
const handshakeOptions = {
  acceptedProtocolVersions: ["1", "2"],
  expectedAuthorityDomainId: transcript.authority_domain_id,
  expectedEndpointBindingId: transcript.endpoint_binding_id,
  expectedHarnessInstallationId: transcript.harness_installation_id,
  expectedInstallationKeyId: transcript.installation_key_id,
  expectedLocatorId: transcript.locator_id,
  expectedRuntimeDeploymentId: transcript.runtime_deployment_id,
  expectedServiceInstanceId: transcript.service_instance_id,
  expectedServiceKeyId: transcript.service_key_id,
  minimumProtocolVersion: "1",
  now,
  replayState: {
    handshake_ids: [],
    client_nonces: [],
    service_nonces: []
  },
  validateTranscript
};
const proofOptions = {
  acceptedProofProfileIds: [proof.proof_profile_id],
  now,
  validateProof,
  validateTranscript
};

const expectContractInvalid = (kind, candidate) => {
  assert.throws(
    () => validateContract(kind, candidate),
    (error) =>
      error instanceof ContractValidationError
      && error.code === "DENY_CONTRACT_INVALID"
  );
};

test("all seven ADR-0012 Stage 1 contract families have valid inert fixtures", () => {
  for (const [kind, path] of [
    ["localBridgeEndpoint", "valid/local-bridge-endpoint-windows.json"],
    ["localBridgeFrame", "valid/local-bridge-frame.json"],
    ["localBridgeHandshakeTranscript", "valid/local-bridge-handshake-transcript.json"],
    ["localBridgeInstallationProof", "valid/local-bridge-installation-proof.json"],
    ["localBridgeSession", "valid/local-bridge-session.json"],
    ["localBridgeDenial", "valid/local-bridge-denial.json"],
    ["localBridgeLifecycle", "valid/local-bridge-lifecycle.json"]
  ]) {
    assert.deepEqual(validateContract(kind, fixture(path)), { kind, valid: true });
  }

  const session = fixture("valid/local-bridge-session.json");
  const lifecycle = fixture("valid/local-bridge-lifecycle.json");
  assert.equal(session.lifecycle_state, "CANDIDATE");
  assert.equal(session.authority_source, "SERVER_DERIVED");
  assert.equal(session.proof_verification_status, "NOT_VERIFIED");
  assert.equal(session.replay_commit_status, "NOT_COMMITTED");
  assert.equal(session.authorization_reference, null);
  assert.equal(lifecycle.decision_status, "CANDIDATE_NOT_EFFECTIVE");
  assert.equal(lifecycle.authority_reference, null);
});

test("frame, proof, session, denial, and lifecycle contracts reject authority or secret extensions", () => {
  for (const [kind, path] of [
    ["localBridgeFrame", "invalid/local-bridge-frame-caller-authority.json"],
    ["localBridgeInstallationProof", "invalid/local-bridge-installation-proof-secret.json"],
    ["localBridgeSession", "invalid/local-bridge-session-bearer.json"],
    ["localBridgeDenial", "invalid/local-bridge-denial-detail.json"],
    ["localBridgeLifecycle", "invalid/local-bridge-lifecycle-token.json"]
  ]) {
    expectContractInvalid(kind, fixture(path));
  }
});

test("frame payload declaration is bounded before any transport implementation exists", () => {
  expectContractInvalid("localBridgeFrame", {
    ...fixture("valid/local-bridge-frame.json"),
    declared_payload_bytes: 1048577
  });
});

test("frame request correlation and connection-only empty-frame rules fail closed", () => {
  const frame = fixture("valid/local-bridge-frame.json");
  expectContractInvalid("localBridgeFrame", {
    ...frame,
    request_id: null
  });
  expectContractInvalid("localBridgeFrame", {
    ...frame,
    message_type: "HEARTBEAT",
    request_id: "caller-request",
    declared_payload_bytes: 0
  });
  expectContractInvalid("localBridgeFrame", {
    ...frame,
    message_type: "EOF",
    request_id: null,
    declared_payload_bytes: 1
  });
});

test("active sessions require verified proof, committed replay, and an authority reference", () => {
  const session = fixture("valid/local-bridge-session.json");
  expectContractInvalid("localBridgeSession", {
    ...session,
    lifecycle_state: "ACTIVE"
  });
  assert.deepEqual(
    validateContract("localBridgeSession", {
      ...session,
      lifecycle_state: "ACTIVE",
      proof_verification_status: "VERIFIED",
      replay_commit_status: "COMMITTED",
      authorization_reference: "authz_bridge_session_alpha_001"
    }),
    { kind: "localBridgeSession", valid: true }
  );
});

test("authorized lifecycle transitions require authority while inert candidates prohibit it", () => {
  const lifecycle = fixture("valid/local-bridge-lifecycle.json");
  expectContractInvalid("localBridgeLifecycle", {
    ...lifecycle,
    decision_status: "AUTHORIZED",
    authority_reference: null
  });
  expectContractInvalid("localBridgeLifecycle", {
    ...lifecycle,
    authority_reference: "caller_claimed_authority"
  });
  assert.deepEqual(
    validateContract("localBridgeLifecycle", {
      ...lifecycle,
      to_state: "ACTIVE",
      decision_status: "AUTHORIZED",
      authority_reference: "authz_bridge_lifecycle_alpha_001"
    }),
    { kind: "localBridgeLifecycle", valid: true }
  );
});

test("copied configuration with another installation key denies", () => {
  const copiedConfig = fixture("invalid/local-bridge-handshake-copied-config.json");
  assert.deepEqual(
    validateContract("localBridgeHandshakeTranscript", copiedConfig),
    { kind: "localBridgeHandshakeTranscript", valid: true }
  );
  assert.throws(
    () => validateLocalBridgeHandshakeTranscript(copiedConfig, handshakeOptions),
    (error) =>
      error instanceof LocalBridgeHandshakeError
      && error.code === "DENY_HANDSHAKE_INSTALLATION_MISMATCH"
  );
});

test("service impersonation with another instance and key denies", () => {
  const impersonation = fixture(
    "invalid/local-bridge-handshake-service-impersonation.json"
  );
  assert.deepEqual(
    validateContract("localBridgeHandshakeTranscript", impersonation),
    { kind: "localBridgeHandshakeTranscript", valid: true }
  );
  assert.throws(
    () => validateLocalBridgeHandshakeTranscript(impersonation, handshakeOptions),
    (error) =>
      error instanceof LocalBridgeHandshakeError
      && error.code === "DENY_HANDSHAKE_SERVICE_MISMATCH"
  );
});

test("valid proof envelope remains unaccepted until cryptographic verification and replay commit", () => {
  const result = validateLocalBridgeInstallationProof(
    proof,
    transcript,
    proofOptions
  );
  assert.equal(result.validation_status, "CANDIDATE_PROOF_ENVELOPE_VERIFIED");
  assert.equal(result.cryptographic_verification_required, true);
  assert.equal(result.proof_acceptance_authorized, false);
  assert.equal(result.replay_commit_required, true);
  assert.equal(result.session_issuance_authorized, false);
  assert.equal("proof_value" in result, false);
  assert.equal(Object.isFrozen(result), true);
});

test("expired proof and proof from another installation key deny", () => {
  assert.throws(
    () =>
      validateLocalBridgeInstallationProof(
        fixture("invalid/local-bridge-installation-proof-expired.json"),
        transcript,
        proofOptions
      ),
    (error) =>
      error instanceof LocalBridgeInstallationProofError
      && error.code === "DENY_PROOF_EXPIRED"
  );
  assert.throws(
    () =>
      validateLocalBridgeInstallationProof(
        fixture("invalid/local-bridge-installation-proof-wrong-key.json"),
        transcript,
        proofOptions
      ),
    (error) =>
      error instanceof LocalBridgeInstallationProofError
      && error.code === "DENY_PROOF_INSTALLATION_MISMATCH"
  );
});

test("cross-user and weakened owner-scope endpoint fixtures deny", () => {
  expectContractInvalid(
    "localBridgeEndpoint",
    fixture("invalid/local-bridge-endpoint-cross-user.json")
  );
  expectContractInvalid(
    "localBridgeEndpoint",
    fixture("invalid/local-bridge-endpoint-weakened-scope.json")
  );
});

test("proof guard fails closed on unaccepted profile, invalid time, and unavailable validation", () => {
  assert.throws(
    () =>
      validateLocalBridgeInstallationProof(proof, transcript, {
        ...proofOptions,
        acceptedProofProfileIds: ["proofprofile_other_reviewed_001"]
      }),
    (error) =>
      error instanceof LocalBridgeInstallationProofError
      && error.code === "DENY_PROOF_PROFILE_NOT_ACCEPTED"
  );
  assert.throws(
    () =>
      validateLocalBridgeInstallationProof(
        { ...proof, expires_at: proof.issued_at },
        transcript,
        proofOptions
      ),
    (error) =>
      error instanceof LocalBridgeInstallationProofError
      && error.code === "DENY_PROOF_TIME_INVALID"
  );
  assert.throws(
    () =>
      validateLocalBridgeInstallationProof(proof, transcript, {
        ...proofOptions,
        validateProof: undefined
      }),
    (error) =>
      error instanceof LocalBridgeInstallationProofError
      && error.code === "DENY_PROOF_VALIDATOR_UNAVAILABLE"
  );
});

test("proof guard source contains no cryptography or operational I/O capability", () => {
  const source = readFileSync(
    resolve(
      import.meta.dirname,
      "..",
      "src",
      "bridge",
      "local-bridge-installation-proof.mjs"
    ),
    "utf8"
  );
  for (const forbidden of [
    "node:child_process",
    "node:crypto",
    "node:dgram",
    "node:fs",
    "node:http",
    "node:https",
    "node:net",
    "node:tls",
    "fetch(",
    ".connect(",
    ".listen(",
    "spawn("
  ]) {
    assert.equal(source.includes(forbidden), false, `forbidden capability: ${forbidden}`);
  }
});
