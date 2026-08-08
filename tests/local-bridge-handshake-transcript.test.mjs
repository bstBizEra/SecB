import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  LOCAL_BRIDGE_HANDSHAKE_MAX_TTL_MS,
  LocalBridgeHandshakeError,
  validateLocalBridgeHandshakeTranscript
} from "../src/bridge/local-bridge-handshake-transcript.mjs";
import { validateContract } from "../src/contracts/contract-validator.mjs";

const fixture = (relativePath) =>
  JSON.parse(
    readFileSync(resolve(import.meta.dirname, "fixtures", relativePath), "utf8")
  );

const transcript = fixture("valid/local-bridge-handshake-transcript.json");
const validateTranscript = (candidate) =>
  validateContract("localBridgeHandshakeTranscript", candidate);
const duringHandshake = () => new Date("2026-07-31T08:02:15Z");
const emptyReplayState = () => ({
  handshake_ids: [],
  client_nonces: [],
  service_nonces: []
});
const validOptions = (overrides = {}) => ({
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
  now: duringHandshake,
  replayState: emptyReplayState(),
  validateTranscript,
  ...overrides
});

const expectCode = (code, action) => {
  assert.throws(
    action,
    (error) =>
      error instanceof LocalBridgeHandshakeError
      && error.code === code
      && error.message === "Local bridge handshake transcript denied"
  );
};

test("valid transcript produces a frozen, explicitly non-authorizing candidate", () => {
  const replayState = emptyReplayState();
  const result = validateLocalBridgeHandshakeTranscript(
    transcript,
    validOptions({ replayState })
  );

  assert.equal(result.validation_status, "CANDIDATE_TRANSCRIPT_VERIFIED");
  assert.equal(result.cryptographic_verification_required, true);
  assert.equal(result.replay_commit_required, true);
  assert.equal(result.session_issuance_authorized, false);
  assert.deepEqual(result.replay_claims, {
    handshake_id: transcript.handshake_id,
    client_nonce: transcript.client_nonce,
    service_nonce: transcript.service_nonce
  });
  assert.deepEqual(replayState, emptyReplayState());
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.replay_claims), true);
  assert.throws(() => {
    result.session_issuance_authorized = true;
  }, TypeError);
});

test("replayed handshake ID or either nonce denies without mutating replay input", () => {
  const cases = [
    { handshake_ids: [transcript.handshake_id], client_nonces: [], service_nonces: [] },
    { handshake_ids: [], client_nonces: [transcript.client_nonce], service_nonces: [] },
    { handshake_ids: [], client_nonces: [], service_nonces: [transcript.service_nonce] }
  ];
  for (const replayState of cases) {
    const snapshot = structuredClone(replayState);
    expectCode("DENY_HANDSHAKE_REPLAY", () =>
      validateLocalBridgeHandshakeTranscript(
        transcript,
        validOptions({ replayState })
      )
    );
    assert.deepEqual(replayState, snapshot);
  }
});

test("reflection-style client and service nonce collision denies", () => {
  expectCode("DENY_HANDSHAKE_NONCE_COLLISION", () =>
    validateLocalBridgeHandshakeTranscript(
      { ...transcript, service_nonce: transcript.client_nonce },
      validOptions()
    )
  );
});

test("selected protocol must be the strongest mutually accepted version", () => {
  expectCode("DENY_HANDSHAKE_DOWNGRADE", () =>
    validateLocalBridgeHandshakeTranscript(
      { ...transcript, selected_protocol_version: "1" },
      validOptions()
    )
  );
  expectCode("DENY_HANDSHAKE_PROTOCOL_INCOMPATIBLE", () =>
    validateLocalBridgeHandshakeTranscript(
      {
        ...transcript,
        client_supported_protocol_versions: ["1"],
        service_supported_protocol_versions: ["2"],
        selected_protocol_version: "1"
      },
      validOptions()
    )
  );
  expectCode("DENY_HANDSHAKE_DOWNGRADE", () =>
    validateLocalBridgeHandshakeTranscript(
      {
        ...transcript,
        client_supported_protocol_versions: ["1", "2", "3"],
        service_supported_protocol_versions: ["1", "2", "3"]
      },
      validOptions({ minimumProtocolVersion: "2", acceptedProtocolVersions: ["1", "2", "3"] })
    )
  );
});

test("secret-shaped or authority-bearing extra fields are rejected by the closed contract", () => {
  expectCode("DENY_HANDSHAKE_TRANSCRIPT_INVALID", () =>
    validateLocalBridgeHandshakeTranscript(
      fixture("invalid/local-bridge-handshake-transcript-secret.json"),
      validOptions()
    )
  );
  for (const field of ["bearer_token", "session_token", "signature", "agent_instance_id"]) {
    expectCode("DENY_HANDSHAKE_TRANSCRIPT_INVALID", () =>
      validateLocalBridgeHandshakeTranscript(
        { ...transcript, [field]: "caller-supplied-material" },
        validOptions()
      )
    );
  }
});

test("cross-installation, cross-service, and cross-context binding mismatches deny", () => {
  for (const [option, code] of [
    ["expectedHarnessInstallationId", "DENY_HANDSHAKE_INSTALLATION_MISMATCH"],
    ["expectedInstallationKeyId", "DENY_HANDSHAKE_INSTALLATION_MISMATCH"],
    ["expectedServiceInstanceId", "DENY_HANDSHAKE_SERVICE_MISMATCH"],
    ["expectedServiceKeyId", "DENY_HANDSHAKE_SERVICE_MISMATCH"],
    ["expectedRuntimeDeploymentId", "DENY_HANDSHAKE_CONTEXT_MISMATCH"],
    ["expectedAuthorityDomainId", "DENY_HANDSHAKE_CONTEXT_MISMATCH"],
    ["expectedLocatorId", "DENY_HANDSHAKE_CONTEXT_MISMATCH"],
    ["expectedEndpointBindingId", "DENY_HANDSHAKE_CONTEXT_MISMATCH"]
  ]) {
    expectCode(code, () =>
      validateLocalBridgeHandshakeTranscript(
        transcript,
        validOptions({ [option]: "other_installation_context" })
      )
    );
  }
});

test("future, expired, inverted, and overlong transcript windows deny", () => {
  expectCode("DENY_HANDSHAKE_NOT_YET_VALID", () =>
    validateLocalBridgeHandshakeTranscript(
      transcript,
      validOptions({ now: () => new Date("2026-07-31T08:01:59Z") })
    )
  );
  expectCode("DENY_HANDSHAKE_EXPIRED", () =>
    validateLocalBridgeHandshakeTranscript(
      transcript,
      validOptions({ now: () => new Date(transcript.expires_at) })
    )
  );
  expectCode("DENY_HANDSHAKE_TIME_INVALID", () =>
    validateLocalBridgeHandshakeTranscript(
      { ...transcript, expires_at: transcript.requested_at },
      validOptions()
    )
  );
  expectCode("DENY_HANDSHAKE_TTL_EXCEEDED", () =>
    validateLocalBridgeHandshakeTranscript(
      {
        ...transcript,
        expires_at: new Date(
          Date.parse(transcript.requested_at)
          + LOCAL_BRIDGE_HANDSHAKE_MAX_TTL_MS
          + 1
        ).toISOString()
      },
      validOptions()
    )
  );
});

test("validator, clock, trusted context, protocol policy, replay state, and options fail closed", () => {
  expectCode("DENY_HANDSHAKE_VALIDATOR_UNAVAILABLE", () =>
    validateLocalBridgeHandshakeTranscript(transcript, validOptions({ validateTranscript: undefined }))
  );
  expectCode("DENY_HANDSHAKE_TRANSCRIPT_INVALID", () =>
    validateLocalBridgeHandshakeTranscript(transcript, validOptions({ validateTranscript: () => false }))
  );
  expectCode("DENY_HANDSHAKE_CLOCK_UNAVAILABLE", () =>
    validateLocalBridgeHandshakeTranscript(transcript, validOptions({ now: () => new Date("invalid") }))
  );
  expectCode("DENY_HANDSHAKE_TRUSTED_CONTEXT", () =>
    validateLocalBridgeHandshakeTranscript(transcript, validOptions({ expectedLocatorId: "" }))
  );
  expectCode("DENY_HANDSHAKE_PROTOCOL_POLICY", () =>
    validateLocalBridgeHandshakeTranscript(transcript, validOptions({ acceptedProtocolVersions: ["1", "1"] }))
  );
  expectCode("DENY_HANDSHAKE_REPLAY_STATE", () =>
    validateLocalBridgeHandshakeTranscript(transcript, validOptions({ replayState: {} }))
  );
  expectCode("DENY_HANDSHAKE_OPTIONS", () =>
    validateLocalBridgeHandshakeTranscript(transcript, {
      ...validOptions(),
      fallbackUrl: "http://127.0.0.1:3000"
    })
  );
});

test("transcript validator source contains no cryptography or operational I/O capability", () => {
  const source = readFileSync(
    resolve(
      import.meta.dirname,
      "..",
      "src",
      "bridge",
      "local-bridge-handshake-transcript.mjs"
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
