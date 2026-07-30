/**
 * SecB MCP Upstream Registry
 *
 * Replaces the bizera-win-mcp-hub `config/servers.yaml` catalogue. That file
 * hard-coded a Windows spawn line per entry (`wsl.exe -d <distro> -- bash -lic
 * "<cmd>"`), so the same catalogue could not be used from inside WSL: the whole
 * catalogue was one host's view. Here an upstream declares WHAT it is and WHERE
 * it must run; the host-specific spawn plan is derived.
 *
 * Boundary (matches src/gateway/mcp-gateway-core.mjs): this module is pure.
 * It reads one JSON file and returns plain objects. It never spawns a process,
 * opens a socket, or contacts an upstream — resolving a plan is not running it.
 * Activation stays a separate operator-authorized step.
 */

import Ajv2020 from "ajv/dist/2020.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const schemaPath = resolve(import.meta.dirname, "..", "..", "contracts", "mcp-upstream-registry.schema.json");
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

export const HOSTS = Object.freeze(["windows", "wsl", "linux"]);

export class UpstreamRegistryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "UpstreamRegistryError";
    this.code = code;
  }
}

/**
 * Identify the host SecB is running on.
 *
 * WSL is detected from /proc/version rather than an env var: WSL_DISTRO_NAME is
 * absent under some service managers and login shells, and a false "linux"
 * would silently resolve a wsl-runtime upstream as a direct spawn.
 */
export function detectHost({ platform = process.platform, procVersion } = {}) {
  if (platform === "win32") return "windows";
  if (platform !== "linux") return platform === "darwin" ? "linux" : "linux";
  let version = procVersion;
  if (version === undefined) {
    try {
      version = readFileSync("/proc/version", "utf8");
    } catch {
      version = "";
    }
  }
  return /microsoft|wsl/i.test(version) ? "wsl" : "linux";
}

/**
 * Wrap a command for `bash -lic`. Single-quote everything and escape embedded
 * single quotes, so an argument carrying a space, $, or ; crosses the bridge as
 * one literal token instead of becoming shell syntax.
 */
export function shellQuote(token) {
  return `'${String(token).replaceAll("'", `'\\''`)}'`;
}

export function buildShellCommand(command, args = []) {
  return [command, ...args].map(shellQuote).join(" ");
}

export function validateUpstreamRegistry(document) {
  const candidate = structuredClone(document);
  if (!validate(candidate)) {
    const errors = validate.errors?.map((e) => `${e.instancePath || "/"} ${e.message}`).join("; ") ?? "Schema error";
    throw new UpstreamRegistryError("DENY_UPSTREAM_REGISTRY_INVALID", `Upstream registry validation failed: ${errors}`);
  }
  const seen = new Set();
  for (const upstream of candidate.upstreams) {
    if (seen.has(upstream.id)) {
      throw new UpstreamRegistryError("DENY_UPSTREAM_ID_DUPLICATE", `Duplicate upstream id: ${upstream.id}`);
    }
    seen.add(upstream.id);
  }
  return candidate;
}

export function loadUpstreamRegistry(registryPath) {
  if (typeof registryPath !== "string" || registryPath.trim() === "") {
    throw new UpstreamRegistryError("DENY_UPSTREAM_REGISTRY_PATH", "Upstream registry path must be a non-blank string");
  }
  let raw;
  try {
    raw = readFileSync(resolve(registryPath), "utf8");
  } catch (error) {
    throw new UpstreamRegistryError("DENY_UPSTREAM_REGISTRY_UNREADABLE", `Upstream registry is unreadable: ${error.code ?? error.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new UpstreamRegistryError("DENY_UPSTREAM_REGISTRY_MALFORMED", `Upstream registry is not valid JSON: ${error.message}`);
  }
  return validateUpstreamRegistry(parsed);
}

const LOOPBACK = /^(?:https?:)?\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i;

/**
 * Project one upstream onto a host. Returns a resolution verdict; a verdict of
 * reachable:false is a normal answer, not an exception.
 */
export function resolveUpstream(upstream, { host = detectHost(), wslDistro } = {}) {
  if (!HOSTS.includes(host)) {
    throw new UpstreamRegistryError("DENY_UPSTREAM_HOST", `Unknown host: ${host}`);
  }
  const base = { id: upstream.id, transport: upstream.transport, runtime: upstream.runtime, host };

  if (upstream.enabled === false) {
    return { ...base, reachable: false, reason: "DISABLED", detail: upstream.note ?? "Upstream is disabled in the registry" };
  }

  if (upstream.transport === "sse" || upstream.transport === "http") {
    // A loopback URL names a different machine on each side of the WSL
    // boundary, so returning it unqualified would hand back an address that
    // resolves but points at the wrong host.
    if (LOOPBACK.test(upstream.url) && upstream.runtime !== "any" && upstream.runtime !== host) {
      return {
        ...base,
        reachable: false,
        reason: "LOOPBACK_ACROSS_BOUNDARY",
        detail: `Upstream listens on loopback inside '${upstream.runtime}' but is being resolved from '${host}'; a host-specific address is required.`,
        url: upstream.url
      };
    }
    return { ...base, reachable: true, url: upstream.url };
  }

  // stdio
  const args = upstream.args ?? [];
  const env = upstream.env ?? {};
  const direct = { ...base, reachable: true, command: upstream.command, args: [...args], env: { ...env } };

  if (upstream.runtime === "any" || upstream.runtime === host) return direct;

  if (upstream.runtime === "wsl" && host === "windows") {
    if (typeof wslDistro !== "string" || wslDistro.trim() === "") {
      throw new UpstreamRegistryError("DENY_UPSTREAM_WSL_DISTRO", `Resolving '${upstream.id}' from Windows requires a wsl_distro`);
    }
    // Env is folded into the bash line: wsl.exe does not forward the parent
    // environment into the distro, so passing env through would drop it.
    const assignments = Object.entries(env).map(([key, value]) => `${key}=${shellQuote(value)}`);
    const inner = [...assignments, buildShellCommand(upstream.command, args)].join(" ");
    return {
      ...base,
      reachable: true,
      command: "wsl.exe",
      args: ["-d", wslDistro, "--", "bash", "-lic", inner],
      env: {},
      bridged: true
    };
  }

  // Every remaining combination is a runtime this host cannot satisfy, and it is
  // declared unreachable rather than emitted as a plan that fails at spawn time.
  // Two distinct cases land here, so the detail names the actual one:
  //   - runtime "windows" from wsl/linux: WSL->Windows interop is opt-in
  //     (binfmt_misc WSLInterop) and absent on hardened or systemd-managed
  //     distros, so the bridge cannot be assumed.
  //   - runtime "wsl" from plain linux: there is no distro to enter, and the
  //     wsl.exe bridge exists only on a Windows host.
  const rationale =
    upstream.runtime === "windows"
      ? "WSL->Windows interop is not guaranteed."
      : "Only a Windows host can build the wsl.exe bridge into a distro.";
  return {
    ...base,
    reachable: false,
    reason: "HOST_UNREACHABLE",
    detail: `Upstream must run on '${upstream.runtime}' but is being resolved from '${host}'; ${rationale}`
  };
}

/**
 * Project a whole registry onto a host.
 */
export function resolveRegistry(registry, { host = detectHost() } = {}) {
  const validated = validateUpstreamRegistry(registry);
  const resolutions = validated.upstreams.map((upstream) =>
    resolveUpstream(upstream, { host, wslDistro: validated.wsl_distro })
  );
  return {
    registry_id: validated.registry_id,
    host,
    wsl_distro: validated.wsl_distro,
    total: resolutions.length,
    reachable: resolutions.filter((r) => r.reachable).length,
    unreachable: resolutions.filter((r) => !r.reachable).length,
    upstreams: resolutions
  };
}
