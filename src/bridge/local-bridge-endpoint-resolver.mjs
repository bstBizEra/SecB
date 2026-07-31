// ADR-0012 candidate pure endpoint resolver.
//
// This module performs no filesystem, socket, network, process, credential, or
// transport I/O. It only validates an already-supplied locator through an
// injected contract validator, checks semantic time/platform constraints, and
// derives a candidate address. The platform adapter must independently verify
// the effective DACL/owner/mode before using that address.

export const LOCAL_BRIDGE_LOCATOR_MAX_TTL_MS = 5 * 60 * 1000;
export const LOCAL_BRIDGE_POSIX_PATH_MAX_BYTES = 100;

const POSIX_PLATFORMS = new Set([
  "aix",
  "darwin",
  "freebsd",
  "linux",
  "openbsd"
]);

const RESOLVER_OPTION_KEYS = new Set([
  "now",
  "platform",
  "runtimeDirectory",
  "validateLocator"
]);

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validDate(value) {
  try {
    const epochMs = Date.prototype.getTime.call(value);
    return Number.isFinite(epochMs) ? epochMs : null;
  } catch {
    return null;
  }
}

function safeNow(now) {
  if (typeof now !== "function") {
    throw new LocalBridgeEndpointError("DENY_CLOCK_UNAVAILABLE");
  }
  try {
    const epochMs = validDate(now());
    if (epochMs === null) {
      throw new LocalBridgeEndpointError("DENY_CLOCK_UNAVAILABLE");
    }
    return epochMs;
  } catch (error) {
    if (error instanceof LocalBridgeEndpointError) throw error;
    throw new LocalBridgeEndpointError("DENY_CLOCK_UNAVAILABLE");
  }
}

function validateOptions(options) {
  if (!isPlainObject(options)) {
    throw new LocalBridgeEndpointError("DENY_RESOLVER_OPTIONS");
  }
  for (const key of Object.keys(options)) {
    if (!RESOLVER_OPTION_KEYS.has(key)) {
      throw new LocalBridgeEndpointError("DENY_RESOLVER_OPTIONS");
    }
  }
}

function validateLocatorContract(locator, validateLocator) {
  if (typeof validateLocator !== "function") {
    throw new LocalBridgeEndpointError("DENY_LOCATOR_VALIDATOR_UNAVAILABLE");
  }
  let candidate;
  try {
    candidate = structuredClone(locator);
    const result = validateLocator(candidate);
    if (result !== true && result?.valid !== true) {
      throw new LocalBridgeEndpointError("DENY_LOCATOR_INVALID");
    }
  } catch (error) {
    if (error instanceof LocalBridgeEndpointError) throw error;
    throw new LocalBridgeEndpointError("DENY_LOCATOR_INVALID");
  }
  return candidate;
}

function validateTimeWindow(locator, nowMs) {
  const issuedAtMs = Date.parse(locator.issued_at);
  const expiresAtMs = Date.parse(locator.expires_at);
  if (!Number.isFinite(issuedAtMs) || !Number.isFinite(expiresAtMs) || expiresAtMs <= issuedAtMs) {
    throw new LocalBridgeEndpointError("DENY_LOCATOR_TIME_INVALID");
  }
  if (expiresAtMs - issuedAtMs > LOCAL_BRIDGE_LOCATOR_MAX_TTL_MS) {
    throw new LocalBridgeEndpointError("DENY_LOCATOR_TTL_EXCEEDED");
  }
  if (nowMs < issuedAtMs) {
    throw new LocalBridgeEndpointError("DENY_LOCATOR_NOT_YET_VALID");
  }
  if (nowMs >= expiresAtMs) {
    throw new LocalBridgeEndpointError("DENY_LOCATOR_EXPIRED");
  }
  return { issuedAtMs, expiresAtMs };
}

function windowsAddress(locator, runtimeDirectory) {
  if (runtimeDirectory !== undefined) {
    throw new LocalBridgeEndpointError("DENY_RUNTIME_DIRECTORY_UNEXPECTED");
  }
  return `\\\\.\\pipe\\LOCAL\\secb\\${locator.endpoint_name}`;
}

function validateRuntimeDirectory(runtimeDirectory) {
  if (
    typeof runtimeDirectory !== "string"
    || runtimeDirectory === ""
    || runtimeDirectory === "/"
    || runtimeDirectory.endsWith("/")
    || runtimeDirectory.includes("//")
    || runtimeDirectory.includes("/./")
    || runtimeDirectory.endsWith("/.")
    || runtimeDirectory.includes("/../")
    || runtimeDirectory.endsWith("/..")
    || !/^\/[A-Za-z0-9._/-]+$/.test(runtimeDirectory)
    || /^\/tmp(?:\/|$)/.test(runtimeDirectory)
  ) {
    throw new LocalBridgeEndpointError("DENY_RUNTIME_DIRECTORY");
  }
  return runtimeDirectory;
}

function posixAddress(locator, runtimeDirectory) {
  const base = validateRuntimeDirectory(runtimeDirectory);
  const address = `${base}/secb/${locator.endpoint_name}.sock`;
  if (new TextEncoder().encode(address).byteLength > LOCAL_BRIDGE_POSIX_PATH_MAX_BYTES) {
    throw new LocalBridgeEndpointError("DENY_ENDPOINT_PATH_TOO_LONG");
  }
  return address;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

export class LocalBridgeEndpointError extends Error {
  constructor(code) {
    super("Local bridge endpoint resolution denied");
    this.name = "LocalBridgeEndpointError";
    this.code = code;
  }
}

export function resolveLocalBridgeEndpoint(locator, options = {}) {
  validateOptions(options);
  const {
    now = () => new Date(),
    platform,
    runtimeDirectory,
    validateLocator
  } = options;

  const candidate = validateLocatorContract(locator, validateLocator);
  const nowMs = safeNow(now);
  const { issuedAtMs, expiresAtMs } = validateTimeWindow(candidate, nowMs);

  let address;
  if (platform === "win32") {
    if (candidate.transport !== "windows_named_pipe") {
      throw new LocalBridgeEndpointError("DENY_PLATFORM_TRANSPORT_MISMATCH");
    }
    address = windowsAddress(candidate, runtimeDirectory);
  } else if (POSIX_PLATFORMS.has(platform)) {
    if (candidate.transport !== "unix_domain_socket") {
      throw new LocalBridgeEndpointError("DENY_PLATFORM_TRANSPORT_MISMATCH");
    }
    address = posixAddress(candidate, runtimeDirectory);
  } else {
    throw new LocalBridgeEndpointError("DENY_PLATFORM_UNSUPPORTED");
  }

  return deepFreeze({
    resolution_status: "CANDIDATE_ENDPOINT",
    permission_verification_required: true,
    locator_id: candidate.locator_id,
    service_instance_id: candidate.service_instance_id,
    authority_domain_id: candidate.authority_domain_id,
    transport: candidate.transport,
    owner_scope: candidate.owner_scope,
    address,
    service_key_id: candidate.service_key_id,
    service_public_key_fingerprint: candidate.service_public_key_fingerprint,
    bridge_protocol_version: candidate.bridge_protocol_version,
    issued_at: new Date(issuedAtMs).toISOString(),
    expires_at: new Date(expiresAtMs).toISOString()
  });
}
