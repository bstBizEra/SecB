#!/usr/bin/env node
/**
 * SecB MCP upstream doctor
 *
 * Replaces `bizera-win-mcp-hub/scripts/verify_install.py`. That script proved an
 * upstream by launching it, so "diagnose" and "run" were the same act — you
 * could not ask what was wrong without starting 17 servers. Here the check is
 * static: resolve the spawn plan, then look for its command on PATH and for the
 * absolute paths its args name. Nothing is spawned, and nothing is written.
 *
 * Network access is opt-in. sse/http upstreams report their resolution only
 * unless `--probe` is passed, because a diagnostic that silently contacts eight
 * endpoints is a network action disguised as a read.
 *
 * The registry's `verified_status` is advisory provenance (what was observed on
 * 2026-07-30), never an input to a verdict. This tool reports what it observes
 * NOW and flags entries where the two disagree, so drift surfaces instead of
 * being papered over by a recorded value. The registry file is never rewritten.
 *
 * Usage:
 *   node tools/secb-mcp-doctor.mjs [--host windows|wsl|linux]
 *                                  [--registry <path>]
 *                                  [--probe] [--timeout-ms <n>]
 *                                  [--json]
 */

import { accessSync, constants, existsSync, statSync } from "node:fs";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { HOSTS, detectHost, loadUpstreamRegistry, resolveRegistry } from "../src/mcp/upstream-registry.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

export const DEFAULT_REGISTRY_PATH = resolve(ROOT, ".secb", "mcp-upstreams.json");
export const DEFAULT_PROBE_TIMEOUT_MS = 2000;
export const VERDICTS = Object.freeze(["ok", "unreachable", "disabled", "unknown"]);

export class McpDoctorError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "McpDoctorError";
    this.code = code;
  }
}

// --- local probes (default implementations) --------------------------------

// Windows resolves a bare name through PATHEXT; a unix PATH scan would miss
// `wsl.exe` written as `wsl`. Kept explicit rather than shelling out to
// `which`/`where`, which would be a spawn.
const WINDOWS_EXTENSIONS = [".COM", ".EXE", ".BAT", ".CMD"];

const isExecutableFile = (candidate) => {
  try {
    if (!statSync(candidate).isFile()) return false;
    accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

// Windows marks executability by extension, not by a mode bit, so requiring
// X_OK there would reject every real .exe.
const isWindowsFile = (candidate) => {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
};

/**
 * Look for `command` on PATH without spawning anything.
 * Returns { found: true, path } | { found: false } | { found: null, reason }
 * where null means "not determinable here", which must not be read as absent.
 */
export function lookupCommandOnPath(command, { host = detectHost(), env = process.env } = {}) {
  if (typeof command !== "string" || command.trim() === "") return { found: false };
  const windows = host === "windows";
  const exists = windows ? isWindowsFile : isExecutableFile;

  // An explicit path is checked where it points, not searched for.
  if (command.includes("/") || command.includes("\\")) {
    const candidate = isAbsolute(command) ? command : resolve(command);
    return exists(candidate) ? { found: true, path: candidate } : { found: false };
  }

  const pathValue = env.PATH ?? env.Path ?? "";
  if (pathValue.trim() === "") return { found: null, reason: "PATH_UNSET" };
  const extensions = windows ? ["", ...WINDOWS_EXTENSIONS] : [""];
  for (const directory of pathValue.split(delimiter)) {
    if (directory === "") continue;
    for (const extension of extensions) {
      const candidate = join(directory, `${command}${extension}`);
      if (exists(candidate)) return { found: true, path: candidate };
    }
  }
  return { found: false };
}

export function pathExistsOnDisk(target) {
  try {
    return existsSync(target);
  } catch {
    return null;
  }
}

/**
 * One short-timeout GET. Any HTTP status counts as reachable: the question is
 * whether something is listening, not whether it speaks MCP correctly — a 404
 * still proves a listener, and asserting protocol conformance would require the
 * handshake this tool deliberately does not perform.
 */
export async function probeUrl(url, { timeoutMs = DEFAULT_PROBE_TIMEOUT_MS } = {}) {
  try {
    const response = await fetch(url, { method: "GET", signal: AbortSignal.timeout(timeoutMs), redirect: "manual" });
    return { ok: true, status: response.status };
  } catch (error) {
    return { ok: false, error: error?.cause?.code ?? error?.name ?? "FETCH_FAILED" };
  }
}

// --- argument classification ----------------------------------------------

// Only unambiguous absolute paths are checked. An arg carrying whitespace is a
// composed shell line (`bash -lic "cd /x && ..."`), not a path, and treating it
// as one would report a false PATH_MISSING for a working upstream.
const POSIX_ABSOLUTE = /^\/\S*$/;
const WINDOWS_ABSOLUTE = /^[A-Za-z]:[\\/]\S*$/;

export function absolutePathArgs(args = []) {
  return args.filter((arg) => typeof arg === "string" && (POSIX_ABSOLUTE.test(arg) || WINDOWS_ABSOLUTE.test(arg)));
}

// A unix-family process cannot stat a Windows path (and vice versa), so cross-
// family checks report "unknown" rather than a misleading "missing".
const hostFamily = (host) => (host === "windows" ? "windows" : "unix");

// --- inspection -----------------------------------------------------------

const advisoryDisagrees = (verdict, verifiedStatus) => {
  if (verifiedStatus !== "reachable" && verifiedStatus !== "unreachable") return false;
  if (verdict === "ok") return verifiedStatus !== "reachable";
  if (verdict === "unreachable") return verifiedStatus !== "unreachable";
  return false;
};

async function inspectOne(upstream, verdictSource, options) {
  const { host, actualHost, inspectable, probe, probeEnabled, lookupCommand, pathExists, timeoutMs } = options;
  const base = {
    id: verdictSource.id,
    transport: verdictSource.transport,
    runtime: verdictSource.runtime,
    verified_status: upstream.verified_status ?? "unverified"
  };

  if (!verdictSource.reachable) {
    return {
      ...base,
      verdict: verdictSource.reason === "DISABLED" ? "disabled" : "unreachable",
      reason: verdictSource.reason,
      detail: verdictSource.detail,
      checks: []
    };
  }

  if (verdictSource.transport !== "stdio") {
    if (!probeEnabled) {
      return {
        ...base,
        verdict: "unknown",
        reason: "PROBE_NOT_RUN",
        detail: `Resolves to ${verdictSource.url}; pass --probe to contact it.`,
        url: verdictSource.url,
        checks: []
      };
    }
    const result = await probe(verdictSource.url, { timeoutMs });
    return {
      ...base,
      verdict: result.ok ? "ok" : "unreachable",
      reason: result.ok ? undefined : "PROBE_FAILED",
      detail: result.ok ? `HTTP ${result.status}` : `Probe failed: ${result.error}`,
      url: verdictSource.url,
      checks: [{ kind: "probe", target: verdictSource.url, result: result.ok ? "ok" : "fail" }]
    };
  }

  if (!inspectable) {
    return {
      ...base,
      verdict: "unknown",
      reason: "CROSS_HOST_UNCHECKABLE",
      detail: `Plan targets '${host}' but this process runs on '${actualHost}'; local PATH and filesystem say nothing about it.`,
      command: verdictSource.command,
      checks: []
    };
  }

  const checks = [];
  const command = lookupCommand(verdictSource.command, { host });
  checks.push({
    kind: "command",
    target: verdictSource.command,
    result: command.found === true ? "ok" : command.found === false ? "fail" : "unknown",
    path: command.path,
    reason: command.reason
  });

  for (const arg of absolutePathArgs(verdictSource.args)) {
    const present = pathExists(arg);
    checks.push({ kind: "path", target: arg, result: present === true ? "ok" : present === false ? "fail" : "unknown" });
  }

  const failed = checks.filter((check) => check.result === "fail");
  const unknown = checks.filter((check) => check.result === "unknown");
  let verdict = "ok";
  let reason;
  if (failed.length > 0) {
    verdict = "unreachable";
    reason = failed[0].kind === "command" ? "COMMAND_NOT_FOUND" : "PATH_MISSING";
  } else if (unknown.length > 0) {
    verdict = "unknown";
    reason = "CHECK_INDETERMINATE";
  }

  const describe = (check) =>
    check.kind === "command"
      ? `${check.target}${check.path ? ` -> ${check.path}` : ""}${check.result === "fail" ? " (not on PATH)" : ""}`
      : `${check.target}${check.result === "fail" ? " (missing)" : ""}`;

  return {
    ...base,
    verdict,
    reason,
    detail: checks.map(describe).join("; "),
    command: verdictSource.command,
    checks
  };
}

/**
 * Inspect every declared upstream. Pure with respect to the registry: it reads
 * nothing back into it and mutates nothing.
 */
export async function inspectRegistry(
  registry,
  {
    host = detectHost(),
    probeEnabled = false,
    timeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
    lookupCommand = lookupCommandOnPath,
    pathExists = pathExistsOnDisk,
    probe = probeUrl,
    actualHost = detectHost()
  } = {}
) {
  if (!HOSTS.includes(host)) {
    throw new McpDoctorError("DENY_DOCTOR_HOST", `Unknown host: ${host}. Expected one of ${HOSTS.join(", ")}`);
  }
  const resolution = resolveRegistry(registry, { host });
  const byId = new Map(registry.upstreams.map((upstream) => [upstream.id, upstream]));
  const options = {
    host,
    actualHost,
    inspectable: hostFamily(host) === hostFamily(actualHost),
    probe,
    probeEnabled,
    lookupCommand,
    pathExists,
    timeoutMs
  };

  const upstreams = [];
  for (const verdictSource of resolution.upstreams) {
    upstreams.push(await inspectOne(byId.get(verdictSource.id) ?? {}, verdictSource, options));
  }

  const tally = { ok: 0, unreachable: 0, disabled: 0, unknown: 0 };
  for (const entry of upstreams) tally[entry.verdict] += 1;
  const disagreements = upstreams
    .filter((entry) => advisoryDisagrees(entry.verdict, entry.verified_status))
    .map((entry) => ({ id: entry.id, observed: entry.verdict, recorded: entry.verified_status }));

  return {
    registry_id: resolution.registry_id,
    host,
    probed: probeEnabled,
    total: resolution.total,
    tally,
    disagreements,
    upstreams
  };
}

// --- rendering ------------------------------------------------------------

const pad = (text, width) => String(text).padEnd(width, " ");

export function renderReport(report) {
  const lines = [
    `SecB MCP doctor — registry ${report.registry_id}, host ${report.host}${report.probed ? ", network probe ON" : ""}`,
    `${report.total} declared: ${report.tally.ok} ok, ${report.tally.unreachable} unreachable, ${report.tally.disabled} disabled, ${report.tally.unknown} unknown`,
    ""
  ];
  const idWidth = Math.max(2, ...report.upstreams.map((entry) => entry.id.length));
  lines.push(`${pad("VERDICT", 12)}${pad("ID", idWidth + 2)}${pad("TRANSPORT", 11)}DETAIL`);
  for (const entry of report.upstreams) {
    const detail = [entry.reason, entry.detail].filter(Boolean).join(": ");
    lines.push(`${pad(entry.verdict, 12)}${pad(entry.id, idWidth + 2)}${pad(entry.transport, 11)}${detail}`);
  }
  if (report.disagreements.length > 0) {
    lines.push("");
    lines.push(`Advisory drift — observed now vs verified_status recorded in the registry:`);
    for (const item of report.disagreements) {
      lines.push(`  ${item.id}: observed ${item.observed}, recorded ${item.recorded}`);
    }
    lines.push(`(Reported only. This tool never rewrites the registry.)`);
  }
  if (!report.probed && report.upstreams.some((entry) => entry.reason === "PROBE_NOT_RUN")) {
    lines.push("");
    lines.push(`sse/http upstreams were not contacted. Pass --probe to opt into one short GET each.`);
  }
  return `${lines.join("\n")}\n`;
}

// --- CLI ------------------------------------------------------------------

const USAGE = `Usage: node tools/secb-mcp-doctor.mjs [options]

  --host <windows|wsl|linux>   Target host (default: detected)
  --registry <path>            Upstream registry (default: .secb/mcp-upstreams.json)
  --probe                      Opt in to one short GET per sse/http upstream
  --timeout-ms <n>             Probe timeout (default: ${DEFAULT_PROBE_TIMEOUT_MS})
  --json                       Emit the report as JSON
  --help                       Show this message

Diagnostic only: nothing is spawned, written, or activated. Verdicts never set
the exit code — exit 1 means the registry itself could not be read.`;

export function parseArgs(argv) {
  const options = { probe: false, json: false, timeoutMs: DEFAULT_PROBE_TIMEOUT_MS };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const readValue = () => {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new McpDoctorError("DENY_DOCTOR_ARG", `Flag ${flag} requires a value`);
      }
      index += 1;
      return value;
    };
    switch (flag) {
      case "--host":
        options.host = readValue();
        break;
      case "--registry":
        options.registry = readValue();
        break;
      case "--probe":
        options.probe = true;
        break;
      case "--timeout-ms": {
        const raw = readValue();
        // Matched as a whole token rather than parseInt'd: parseInt("1.5") is 1
        // and parseInt("30s") is 30, so a malformed timeout would be silently
        // truncated into a plausible-looking one.
        if (!/^[0-9]+$/.test(raw) || Number.parseInt(raw, 10) <= 0) {
          throw new McpDoctorError("DENY_DOCTOR_ARG", `--timeout-ms must be a positive integer, got: ${raw}`);
        }
        options.timeoutMs = Number.parseInt(raw, 10);
        break;
      }
      case "--json":
        options.json = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new McpDoctorError("DENY_DOCTOR_ARG", `Unknown argument: ${flag}`);
    }
  }
  return options;
}

export async function main(argv = process.argv.slice(2)) {
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
  let report;
  try {
    const registry = loadUpstreamRegistry(options.registry ? resolve(options.registry) : DEFAULT_REGISTRY_PATH);
    report = await inspectRegistry(registry, {
      host: options.host ?? detectHost(),
      probeEnabled: options.probe,
      timeoutMs: options.timeoutMs
    });
  } catch (error) {
    process.stderr.write(`${error.code ? `${error.code}: ` : ""}${error.message}\n`);
    return 1;
  }
  process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : renderReport(report));
  // Always 0 once a report exists: this is a diagnostic, not a gate.
  return 0;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath && (import.meta.url === pathToFileURL(invokedPath).href || fileURLToPath(import.meta.url) === invokedPath)) {
  main().then((code) => {
    process.exitCode = code;
  });
}
