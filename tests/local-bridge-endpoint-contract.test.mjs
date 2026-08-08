import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  ContractValidationError,
  validateContract
} from "../src/contracts/contract-validator.mjs";

const fixture = (relativePath) =>
  JSON.parse(
    readFileSync(resolve(import.meta.dirname, "fixtures", relativePath), "utf8")
  );

const validWindows = fixture("valid/local-bridge-endpoint-windows.json");

const expectInvalid = (candidate) => {
  assert.throws(
    () => validateContract("localBridgeEndpoint", candidate),
    (error) =>
      error instanceof ContractValidationError &&
      error.code === "DENY_CONTRACT_INVALID" &&
      error.errors.length > 0
  );
};

test("local bridge endpoint locator accepts closed Windows and POSIX IPC metadata", () => {
  assert.deepEqual(
    validateContract("localBridgeEndpoint", validWindows),
    { kind: "localBridgeEndpoint", valid: true }
  );

  const posix = {
    ...validWindows,
    locator_id: "brloc_wsl_alpha_001",
    service_instance_id: "svc_wsl_alpha_001",
    transport: "unix_domain_socket",
    endpoint_name: "secb-fedcba9876543210fedcba9876543210"
  };
  assert.deepEqual(
    validateContract("localBridgeEndpoint", posix),
    { kind: "localBridgeEndpoint", valid: true }
  );
});

test("local bridge endpoint locator refuses network transports and arbitrary endpoint paths", () => {
  expectInvalid(fixture("invalid/local-bridge-endpoint-http.json"));
  expectInvalid({
    ...validWindows,
    endpoint_name: "\\\\.\\pipe\\caller-selected"
  });
  expectInvalid({
    ...validWindows,
    endpoint_name: "/tmp/secb.sock"
  });
});

test("local bridge endpoint locator refuses secret-bearing and authority-like extensions", () => {
  expectInvalid({
    ...validWindows,
    bearer_token: "not-permitted"
  });
  expectInvalid({
    ...validWindows,
    caller_instance_id: "caller-controlled"
  });
  expectInvalid({
    ...validWindows,
    deployment_authorized: true
  });
});

test("local bridge endpoint locator pins versions, user scope, and public fingerprint shape", () => {
  expectInvalid({
    ...validWindows,
    schema_version: "2"
  });
  expectInvalid({
    ...validWindows,
    owner_scope: "ALL_USERS"
  });
  expectInvalid({
    ...validWindows,
    service_public_key_fingerprint: "private-key-material"
  });
});
