#!/usr/bin/env node
/**
 * SecB MCP client-config generator
 *
 * Replaces `bizera-win-mcp-hub/scripts/install.ps1`. That script WROTE into the
 * operator's live client config, so generating a config and activating it were
 * the same act and there was no way to inspect a plan before adopting it. Here
 * the two are split: this tool prints to stdout and never touches
 * `~/.codex/`, `claude_desktop_config.json`, or any other user file. Installing
 * the output is the operator's step, because writing a live client config is
 * activation under AGENTS.md working rule 5.
 *
 * Boundary (same as src/mcp/upstream-registry.mjs): pure and deterministic.
 * Reads one JSON file, returns text. No clock, no network, no spawning — so the
 * same registry always renders the same config for the same host.
 *
 * Usage:
 *   node tools/secb-mcp-config.mjs [--format codex|claude|json]
 *                                  [--host windows|wsl|linux]
 *                                  [--registry <path>]
 *                                  [--include-unreachable]
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { HOSTS, detectHost, loadUpstreamRegistry, resolveRegistry } from "../src/mcp/upstream-registry.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

export const DEFAULT_REGISTRY_PATH = resolve(ROOT, ".secb", "mcp-upstreams.json");
export const FORMATS = Object.freeze(["codex", "claude", "json"]);

/**
 * Startup timeout emitted for every stdio entry.
 *
 * Deliberately a constant rather than derived from the registry's `timeout_ms`:
 * that field is a PER-REQUEST ceiling (see the schema), and reusing it as a
 * startup budget would silently mean two different things. 60s because most
 * entries launch through `npx -y` or `uvx`, which cold-fetch the package on
 * first run; a 10s startup budget reports a working upstream as broken.
 */
export const DEFAULT_STARTUP_TIMEOUT_SEC = 60;

export class McpConfigError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "McpConfigError";
    this.code = code;
  }
}

// --- TOML emission ---------------------------------------------------------

// A TOML literal string ('...') cannot contain a single quote or a control
// character — there is no escape inside one. Windows paths and the wsl.exe
// bridge args both hit this: resolveUpstream() shell-quotes the inner command,
// so a Windows-host resolution yields args like `'-y' '@scope/pkg'`. Emitting
// those as a literal string would produce a TOML parse error, so those values
// fall back to a basic ("...") string with escapes.
const TOML_NEEDS_BASIC = /['\x00-\x1f\x7f]/;

const TOML_BARE_KEY = /^[A-Za-z0-9_-]+$/;

export function tomlString(value) {
  const text = String(value);
  if (!TOML_NEEDS_BASIC.test(text)) return `'${text}'`;
  const escaped = text
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\b", "\\b")
    .replaceAll("\t", "\\t")
    .replaceAll("\n", "\\n")
    .replaceAll("\f", "\\f")
    .replaceAll("\r", "\\r")
    // Any remaining C0/C7 control character has no shorthand escape.
    .replace(/[\x00-\x1f\x7f]/g, (c) => `\\u${c.codePointAt(0).toString(16).padStart(4, "0")}`);
  return `"${escaped}"`;
}

export function tomlKey(key) {
  return TOML_BARE_KEY.test(key) ? key : tomlString(key);
}

const tomlArray = (values) => `[${values.map(tomlString).join(", ")}]`;

function tomlEntry(verdict) {
  const lines = [`[mcp_servers.${tomlKey(verdict.id)}]`];
  if (verdict.transport === "stdio") {
    lines.push(`command = ${tomlString(verdict.command)}`);
    lines.push(`args = ${tomlArray(verdict.args ?? [])}`);
    lines.push(`startup_timeout_sec = ${DEFAULT_STARTUP_TIMEOUT_SEC}`);
    const env = Object.entries(verdict.env ?? {});
    if (env.length > 0) {
      lines.push("");
      lines.push(`[mcp_servers.${tomlKey(verdict.id)}.env]`);
      for (const [key, value] of env) lines.push(`${tomlKey(key)} = ${tomlString(value)}`);
    }
  } else {
    lines.push(`url = ${tomlString(verdict.url)}`);
  }
  return lines.join("\n");
}

// TOML forbids control characters in comments (tab excepted). Values are already
// scrubbed by tomlString, but registry_id and an upstream note flow into comment
// text, where a bare CR or ESC produced a file no TOML parser would accept.
const scrubControls = (text) => String(text).replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "\uFFFD");

const commentBlock = (text) =>
  scrubControls(text)
    .split("\n")
    .map((line) => (line === "" ? "#" : `# ${line}`))
    .join("\n");

// --- projection ------------------------------------------------------------

const hasRemoteTransport = (verdicts) => verdicts.some((v) => v.transport !== "stdio");

function splitVerdicts(resolution) {
  return {
    reachable: resolution.upstreams.filter((v) => v.reachable),
    unreachable: resolution.upstreams.filter((v) => !v.reachable)
  };
}

function clientEntry(verdict) {
  if (verdict.transport !== "stdio") return { url: verdict.url };
  const entry = { command: verdict.command, args: [...(verdict.args ?? [])] };
  const env = verdict.env ?? {};
  if (Object.keys(env).length > 0) entry.env = { ...env };
  return entry;
}

const unreachableNote = (verdict) => ({
  id: verdict.id,
  transport: verdict.transport,
  runtime: verdict.runtime,
  reason: verdict.reason,
  detail: verdict.detail
});

// --- renderers -------------------------------------------------------------

function renderCodex(resolution, { includeUnreachable }) {
  const { reachable, unreachable } = splitVerdicts(resolution);
  const header = [
    `SecB MCP client config — codex`,
    ``,
    `registry: ${resolution.registry_id}`,
    `host:     ${resolution.host}`,
    `emitted:  ${reachable.length} of ${resolution.total} declared upstreams` +
      (unreachable.length > 0 ? ` (${unreachable.length} not reachable from this host)` : ``),
    ``,
    `Paste into ~/.codex/config.toml. This was printed, not installed: writing a`,
    `live client config is activation (AGENTS.md working rule 5).`
  ];
  if (hasRemoteTransport(reachable)) {
    header.push(
      ``,
      `NOTE: one or more entries below are sse/http and carry 'url' instead of`,
      `'command'. Whether your Codex build consumes a url upstream depends on its`,
      `version; a stdio-only build will ignore or reject those entries.`
    );
  }
  const blocks = [commentBlock(header.join("\n"))];
  for (const verdict of reachable) blocks.push(tomlEntry(verdict));

  if (includeUnreachable && unreachable.length > 0) {
    // Commented out, never live: a config line that is known not to work is
    // worse than an absent one, because the failure surfaces at spawn time.
    const notes = [`Not emitted — resolution says unreachable from host '${resolution.host}':`, ``];
    for (const verdict of unreachable) {
      notes.push(`[mcp_servers.${verdict.id}]  ${verdict.reason}`);
      if (verdict.detail) notes.push(`  ${verdict.detail}`);
    }
    blocks.push(commentBlock(notes.join("\n")));
  }
  return `${blocks.join("\n\n")}\n`;
}

function renderClaude(resolution, { includeUnreachable }) {
  const { reachable, unreachable } = splitVerdicts(resolution);
  const document = { mcpServers: {} };
  for (const verdict of reachable) document.mcpServers[verdict.id] = clientEntry(verdict);
  if (includeUnreachable && unreachable.length > 0) {
    // Sibling of mcpServers, not inside it: an unknown top-level key is ignored
    // by the client, whereas a disabled-looking server entry would be launched.
    document._unreachable = unreachable.map(unreachableNote);
  }
  return `${JSON.stringify(document, null, 2)}\n`;
}

function renderJson(resolution, { includeUnreachable }) {
  const { reachable, unreachable } = splitVerdicts(resolution);
  const document = {
    registry_id: resolution.registry_id,
    host: resolution.host,
    wsl_distro: resolution.wsl_distro,
    total: resolution.total,
    reachable: resolution.reachable,
    unreachable: resolution.unreachable,
    upstreams: reachable
  };
  if (includeUnreachable) document._unreachable = unreachable;
  return `${JSON.stringify(document, null, 2)}\n`;
}

const RENDERERS = Object.freeze({ codex: renderCodex, claude: renderClaude, json: renderJson });

/**
 * Render a client config from an already-loaded registry document.
 * Separated from the CLI so callers and tests can supply a registry inline.
 */
export function buildClientConfig(registry, { format = "codex", host = detectHost(), includeUnreachable = false } = {}) {
  if (!FORMATS.includes(format)) {
    throw new McpConfigError("DENY_CONFIG_FORMAT", `Unknown format: ${format}. Expected one of ${FORMATS.join(", ")}`);
  }
  if (!HOSTS.includes(host)) {
    throw new McpConfigError("DENY_CONFIG_HOST", `Unknown host: ${host}. Expected one of ${HOSTS.join(", ")}`);
  }
  const resolution = resolveRegistry(registry, { host });
  return RENDERERS[format](resolution, { includeUnreachable });
}

export function generateClientConfig({
  registryPath = DEFAULT_REGISTRY_PATH,
  format = "codex",
  host = detectHost(),
  includeUnreachable = false
} = {}) {
  return buildClientConfig(loadUpstreamRegistry(registryPath), { format, host, includeUnreachable });
}

// --- CLI -------------------------------------------------------------------

const USAGE = `Usage: node tools/secb-mcp-config.mjs [options]

  --format <codex|claude|json>   Output format (default: codex)
  --host <windows|wsl|linux>     Target host (default: detected)
  --registry <path>              Upstream registry (default: .secb/mcp-upstreams.json)
  --include-unreachable          Also report unreachable upstreams, inert
  --help                         Show this message

Prints to stdout only. Installing the output is a separate operator step.`;

export function parseArgs(argv) {
  const options = { format: "codex", includeUnreachable: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const readValue = () => {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new McpConfigError("DENY_CONFIG_ARG", `Flag ${flag} requires a value`);
      }
      index += 1;
      return value;
    };
    switch (flag) {
      case "--format":
        options.format = readValue();
        break;
      case "--host":
        options.host = readValue();
        break;
      case "--registry":
        options.registry = readValue();
        break;
      case "--include-unreachable":
        options.includeUnreachable = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new McpConfigError("DENY_CONFIG_ARG", `Unknown argument: ${flag}`);
    }
  }
  return options;
}

export function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${USAGE}\n`);
    return 2;
  }
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  try {
    process.stdout.write(
      generateClientConfig({
        // `!== undefined`, not truthiness: --registry "" is falsy and silently
        // fell back to the default registry instead of failing closed.
        registryPath: options.registry !== undefined ? resolve(options.registry) : DEFAULT_REGISTRY_PATH,
        format: options.format,
        host: options.host ?? detectHost(),
        includeUnreachable: options.includeUnreachable
      })
    );
  } catch (error) {
    // Typed registry and config failures are operator-actionable; report the
    // code so the cause is not flattened into a generic non-zero exit.
    process.stderr.write(`${error.code ? `${error.code}: ` : ""}${error.message}\n`);
    return 1;
  }
  return 0;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath && (import.meta.url === pathToFileURL(invokedPath).href || fileURLToPath(import.meta.url) === invokedPath)) {
  process.exitCode = main();
}
