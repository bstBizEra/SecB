import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { validateContract } from "../src/contracts/contract-validator.mjs";
import {
  LOCAL_BRIDGE_LOCATOR_MAX_TTL_MS,
  LocalBridgeEndpointError,
  resolveLocalBridgeEndpoint
} from "../src/bridge/local-bridge-endpoint-resolver.mjs";

const fixture = (relativePath) =>
  JSON.parse(
    readFileSync(resolve(import.meta.dirname, "fixtures", relativePath), "utf8")
  );

const windowsLocator = fixture("valid/local-bridge-endpoint-windows.json");
const validateLocator = (candidate) =>
  validateContract("localBridgeEndpoint", candidate);
const duringLease = () => new Date("2026-07-31T08:02:00Z");

const expectCode = (code, action) => {
  assert.throws(
    action,
    (error) =>
      error instanceof LocalBridgeEndpointError &&
      error.code === code &&
      error.message === "Local bridge endpoint resolution denied"
  );
};

test("resolver derives a frozen candidate Windows named-pipe address", () => {
  const result = resolveLocalBridgeEndpoint(windowsLocator, {
    platform: "win32",
    now: duringLease,
    validateLocator
  });

  assert.equal(
    result.address,
    "\\\\.\\pipe\\LOCAL\\secb\\secb-0123456789abcdef0123456789abcdef"
  );
  assert.equal(result.resolution_status, "CANDIDATE_ENDPOINT");
  assert.equal(result.permission_verification_required, true);
  assert.equal(result.owner_scope, "CURRENT_USER");
  assert.equal(result.service_public_key_fingerprint, windowsLocator.service_public_key_fingerprint);
  assert.equal(Object.isFrozen(result), true);
  assert.throws(() => {
    result.address = "caller-controlled";
  }, TypeError);
});

test("resolver derives a bounded POSIX socket path from a canonical owner runtime directory", () => {
  const result = resolveLocalBridgeEndpoint(
    {
      ...windowsLocator,
      locator_id: "brloc_wsl_alpha_001",
      service_instance_id: "svc_wsl_alpha_001",
      transport: "unix_domain_socket"
    },
    {
      platform: "linux",
      runtimeDirectory: "/run/user/1000",
      now: duringLease,
      validateLocator
    }
  );

  assert.equal(
    result.address,
    "/run/user/1000/secb/secb-0123456789abcdef0123456789abcdef.sock"
  );
  assert.equal(result.permission_verification_required, true);
});

test("resolver rejects invalid, future, expired, inverted, and overlong locator leases", () => {
  expectCode("DENY_LOCATOR_INVALID", () =>
    resolveLocalBridgeEndpoint(
      { ...windowsLocator, endpoint_name: "caller/path" },
      { platform: "win32", now: duringLease, validateLocator }
    )
  );
  expectCode("DENY_LOCATOR_NOT_YET_VALID", () =>
    resolveLocalBridgeEndpoint(
      windowsLocator,
      {
        platform: "win32",
        now: () => new Date("2026-07-31T07:59:59Z"),
        validateLocator
      }
    )
  );
  expectCode("DENY_LOCATOR_EXPIRED", () =>
    resolveLocalBridgeEndpoint(
      windowsLocator,
      {
        platform: "win32",
        now: () => new Date(windowsLocator.expires_at),
        validateLocator
      }
    )
  );
  expectCode("DENY_LOCATOR_TIME_INVALID", () =>
    resolveLocalBridgeEndpoint(
      { ...windowsLocator, expires_at: windowsLocator.issued_at },
      { platform: "win32", now: duringLease, validateLocator }
    )
  );
  expectCode("DENY_LOCATOR_TTL_EXCEEDED", () =>
    resolveLocalBridgeEndpoint(
      {
        ...windowsLocator,
        expires_at: new Date(
          Date.parse(windowsLocator.issued_at) +
            LOCAL_BRIDGE_LOCATOR_MAX_TTL_MS +
            1
        ).toISOString()
      },
      { platform: "win32", now: duringLease, validateLocator }
    )
  );
});

test("resolver fails closed on platform and transport disagreement", () => {
  expectCode("DENY_PLATFORM_TRANSPORT_MISMATCH", () =>
    resolveLocalBridgeEndpoint(windowsLocator, {
      platform: "linux",
      runtimeDirectory: "/run/user/1000",
      now: duringLease,
      validateLocator
    })
  );
  expectCode("DENY_PLATFORM_TRANSPORT_MISMATCH", () =>
    resolveLocalBridgeEndpoint(
      { ...windowsLocator, transport: "unix_domain_socket" },
      { platform: "win32", now: duringLease, validateLocator }
    )
  );
  expectCode("DENY_PLATFORM_UNSUPPORTED", () =>
    resolveLocalBridgeEndpoint(windowsLocator, {
      platform: "browser",
      now: duringLease,
      validateLocator
    })
  );
});

test("resolver rejects unsafe, noncanonical, shared-temp, and overlong POSIX paths", () => {
  const posixLocator = {
    ...windowsLocator,
    transport: "unix_domain_socket"
  };
  for (const runtimeDirectory of [
    "run/user/1000",
    "/tmp",
    "/tmp/secb-user",
    "/run/user/1000/",
    "/run/user/../other",
    "/run//user/1000"
  ]) {
    expectCode("DENY_RUNTIME_DIRECTORY", () =>
      resolveLocalBridgeEndpoint(posixLocator, {
        platform: "linux",
        runtimeDirectory,
        now: duringLease,
        validateLocator
      })
    );
  }

  expectCode("DENY_ENDPOINT_PATH_TOO_LONG", () =>
    resolveLocalBridgeEndpoint(posixLocator, {
      platform: "linux",
      runtimeDirectory: `/run/user/${"a".repeat(60)}`,
      now: duringLease,
      validateLocator
    })
  );
  expectCode("DENY_RUNTIME_DIRECTORY_UNEXPECTED", () =>
    resolveLocalBridgeEndpoint(windowsLocator, {
      platform: "win32",
      runtimeDirectory: "/run/user/1000",
      now: duringLease,
      validateLocator
    })
  );
});

test("resolver requires explicit validation, a valid clock, and closed options", () => {
  expectCode("DENY_LOCATOR_VALIDATOR_UNAVAILABLE", () =>
    resolveLocalBridgeEndpoint(windowsLocator, {
      platform: "win32",
      now: duringLease
    })
  );
  expectCode("DENY_LOCATOR_INVALID", () =>
    resolveLocalBridgeEndpoint(windowsLocator, {
      platform: "win32",
      now: duringLease,
      validateLocator: () => false
    })
  );
  expectCode("DENY_CLOCK_UNAVAILABLE", () =>
    resolveLocalBridgeEndpoint(windowsLocator, {
      platform: "win32",
      now: () => new Date("invalid"),
      validateLocator
    })
  );
  expectCode("DENY_RESOLVER_OPTIONS", () =>
    resolveLocalBridgeEndpoint(windowsLocator, {
      platform: "win32",
      now: duringLease,
      validateLocator,
      fallbackUrl: "http://127.0.0.1:3000"
    })
  );
});

test("resolver source contains no operational I/O or transport capability", () => {
  const source = readFileSync(
    resolve(
      import.meta.dirname,
      "..",
      "src",
      "bridge",
      "local-bridge-endpoint-resolver.mjs"
    ),
    "utf8"
  );
  for (const forbidden of [
    "node:child_process",
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
