/**
 * SecB MCP upstream doctor — verdicts, honest unknowns, and network default-off.
 *
 * Two properties matter most here:
 *
 *   1. The doctor never converts "I cannot tell" into a negative verdict. A
 *      cross-host plan or an unset PATH yields `unknown`, because reporting a
 *      working upstream as broken is what makes a diagnostic untrustworthy.
 *   2. No network traffic happens without --probe. The probe function is
 *      injected in these tests and asserted NOT to have been called, so the
 *      default-off guarantee is verified rather than assumed.
 *
 * Registry documents are built inline so these tests survive legitimate edits to
 * .secb/mcp-upstreams.json; the final smoke test is the only one that reads it.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { accessSync, constants } from "node:fs";
import { resolve } from "node:path";

import {
  DEFAULT_PROBE_TIMEOUT_MS,
  McpDoctorError,
  absolutePathArgs,
  inspectRegistry,
  lookupCommandOnPath,
  parseArgs,
  renderReport
} from "../tools/secb-mcp-doctor.mjs";
import { loadUpstreamRegistry } from "../src/mcp/upstream-registry.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const REGISTRY_PATH = resolve(REPO_ROOT, ".secb", "mcp-upstreams.json");

const stdioUpstream = (overrides = {}) => ({
  id: "example",
  description: "Example upstream",
  enabled: true,
  transport: "stdio",
  runtime: "wsl",
  command: "npx",
  args: ["-y", "server"],
  classification_ceiling: "INTERNAL",
  ...overrides
});

const sseUpstream = (overrides = {}) => ({
  id: "remote",
  description: "Remote upstream",
  enabled: true,
  transport: "sse",
  runtime: "any",
  url: "https://mcp.example.test/sse",
  classification_ceiling: "PUBLIC",
  ...overrides
});

const registryOf = (upstreams, overrides = {}) => ({
  schema_version: "1.0",
  registry_id: "test-registry",
  wsl_distro: "test-distro",
  upstreams,
  ...overrides
});

// Deterministic stand-ins: the real probes touch PATH, the filesystem, and the
// network, none of which a unit test should depend on.
const found = (path = "/usr/bin/npx") => () => ({ found: true, path });
const notFound = () => ({ found: false });
const indeterminate = () => ({ found: null, reason: "PATH_UNSET" });
const allPathsExist = () => true;

const inspect = (registry, overrides = {}) =>
  inspectRegistry(registry, {
    host: "wsl",
    actualHost: "wsl",
    lookupCommand: found(),
    pathExists: allPathsExist,
    probe: async () => {
      throw new Error("probe must not be called");
    },
    ...overrides
  });

const only = (report) => {
  assert.equal(report.upstreams.length, 1);
  return report.upstreams[0];
};

// --- verdicts carried over from resolution ---------------------------------

test("a disabled upstream is reported disabled, with the registry note as detail", () => {
  const registry = registryOf([stdioUpstream({ enabled: false, note: "superseded" })]);
  return inspect(registry).then((report) => {
    const entry = only(report);
    assert.equal(entry.verdict, "disabled");
    assert.equal(entry.reason, "DISABLED");
    assert.equal(entry.detail, "superseded");
    assert.deepEqual(entry.checks, []);
  });
});

test("an upstream whose runtime this host cannot satisfy is unreachable", async () => {
  const report = await inspect(registryOf([stdioUpstream({ runtime: "windows" })]));
  const entry = only(report);
  assert.equal(entry.verdict, "unreachable");
  assert.equal(entry.reason, "HOST_UNREACHABLE");
});

test("a loopback url across the wsl boundary is unreachable, not probed", async () => {
  const registry = registryOf([sseUpstream({ url: "http://localhost:8020/sse", runtime: "windows" })]);
  const report = await inspect(registry, { probeEnabled: true });
  const entry = only(report);
  assert.equal(entry.verdict, "unreachable");
  assert.equal(entry.reason, "LOOPBACK_ACROSS_BOUNDARY");
});

// --- stdio checks ----------------------------------------------------------

test("a resolvable command with existing path args is ok", async () => {
  const registry = registryOf([stdioUpstream({ args: ["-y", "@scope/server", "/opt"] })]);
  const report = await inspect(registry);
  const entry = only(report);
  assert.equal(entry.verdict, "ok");
  assert.equal(entry.reason, undefined);
  assert.deepEqual(
    entry.checks.map((check) => [check.kind, check.target, check.result]),
    [
      ["command", "npx", "ok"],
      ["path", "/opt", "ok"]
    ]
  );
});

test("a command missing from PATH is unreachable as COMMAND_NOT_FOUND", async () => {
  const report = await inspect(registryOf([stdioUpstream()]), { lookupCommand: notFound });
  const entry = only(report);
  assert.equal(entry.verdict, "unreachable");
  assert.equal(entry.reason, "COMMAND_NOT_FOUND");
  assert.match(entry.detail, /not on PATH/);
});

test("a missing absolute path arg is unreachable as PATH_MISSING", async () => {
  const registry = registryOf([stdioUpstream({ args: ["--repository", "/opt/gone"] })]);
  const report = await inspect(registry, { pathExists: () => false });
  const entry = only(report);
  assert.equal(entry.verdict, "unreachable");
  assert.equal(entry.reason, "PATH_MISSING");
  assert.match(entry.detail, /\/opt\/gone \(missing\)/);
});

test("an indeterminate command check yields unknown, never a failure", async () => {
  const report = await inspect(registryOf([stdioUpstream()]), { lookupCommand: indeterminate });
  const entry = only(report);
  assert.equal(entry.verdict, "unknown");
  assert.equal(entry.reason, "CHECK_INDETERMINATE");
});

test("a missing command outranks an indeterminate path check", async () => {
  const registry = registryOf([stdioUpstream({ args: ["/opt/x"] })]);
  const report = await inspect(registry, { lookupCommand: notFound, pathExists: () => null });
  assert.equal(only(report).verdict, "unreachable");
});

test("for npx and uvx entries the launcher is checked, not the package", async () => {
  const asked = [];
  const registry = registryOf([
    stdioUpstream({ id: "via-npx", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "/opt"] }),
    stdioUpstream({ id: "via-uvx", command: "uvx", args: ["--with", "mcp<2", "mcp-server-time"] })
  ]);
  await inspect(registry, {
    lookupCommand: (command) => {
      asked.push(command);
      return { found: true, path: `/usr/bin/${command}` };
    }
  });
  assert.deepEqual(asked, ["npx", "uvx"]);
});

test("absolutePathArgs ignores flags, package specs, and composed shell lines", () => {
  assert.deepEqual(absolutePathArgs(["-y", "@scope/pkg", "/opt", "mcp<2"]), ["/opt"]);
  assert.deepEqual(absolutePathArgs(["-lic", "cd /opt/x && source .venv/bin/activate && python -m m"]), []);
  assert.deepEqual(absolutePathArgs(["C:\\Program\\node.exe"]), ["C:\\Program\\node.exe"]);
  assert.deepEqual(absolutePathArgs(["C:\\Program Files\\node.exe"]), []);
  assert.deepEqual(absolutePathArgs(), []);
});

test("a cross-host plan is unknown and performs no local checks at all", async () => {
  const asked = [];
  const report = await inspectRegistry(registryOf([stdioUpstream({ runtime: "windows" })]), {
    host: "windows",
    actualHost: "wsl",
    lookupCommand: (command) => {
      asked.push(command);
      return { found: false };
    },
    pathExists: () => {
      throw new Error("pathExists must not be called across hosts");
    },
    probe: async () => {
      throw new Error("probe must not be called");
    }
  });
  const entry = only(report);
  assert.equal(entry.verdict, "unknown");
  assert.equal(entry.reason, "CROSS_HOST_UNCHECKABLE");
  assert.match(entry.detail, /runs on 'wsl'/);
  assert.deepEqual(asked, []);
});

// --- network is opt-in -----------------------------------------------------

test("sse and http upstreams are not contacted without --probe", async () => {
  let calls = 0;
  const report = await inspect(registryOf([sseUpstream()]), {
    probe: async () => {
      calls += 1;
      return { ok: true, status: 200 };
    }
  });
  const entry = only(report);
  assert.equal(calls, 0, "default mode made a network call");
  assert.equal(entry.verdict, "unknown");
  assert.equal(entry.reason, "PROBE_NOT_RUN");
  assert.equal(entry.url, "https://mcp.example.test/sse");
  assert.equal(report.probed, false);
});

test("--probe contacts each url once and reports the status", async () => {
  const seen = [];
  const report = await inspect(registryOf([sseUpstream()]), {
    probeEnabled: true,
    timeoutMs: 750,
    probe: async (url, options) => {
      seen.push([url, options.timeoutMs]);
      return { ok: true, status: 404 };
    }
  });
  const entry = only(report);
  assert.deepEqual(seen, [["https://mcp.example.test/sse", 750]]);
  // Any HTTP status proves a listener; the doctor does not assert MCP conformance.
  assert.equal(entry.verdict, "ok");
  assert.equal(entry.detail, "HTTP 404");
  assert.equal(report.probed, true);
});

test("a failed probe is unreachable and carries the transport error", async () => {
  const report = await inspect(registryOf([sseUpstream()]), {
    probeEnabled: true,
    probe: async () => ({ ok: false, error: "ECONNREFUSED" })
  });
  const entry = only(report);
  assert.equal(entry.verdict, "unreachable");
  assert.equal(entry.reason, "PROBE_FAILED");
  assert.match(entry.detail, /ECONNREFUSED/);
});

// --- advisory provenance ---------------------------------------------------

test("verified_status is advisory: it never changes a verdict", async () => {
  const registry = registryOf([stdioUpstream({ verified_status: "unreachable" })]);
  const report = await inspect(registry);
  assert.equal(only(report).verdict, "ok");
});

test("an observation that contradicts verified_status is flagged as drift", async () => {
  const registry = registryOf([
    stdioUpstream({ id: "was-working", verified_status: "reachable" }),
    stdioUpstream({ id: "agrees", verified_status: "reachable" })
  ]);
  const report = await inspect(registry, {
    lookupCommand: (command, options) => (options.host === "wsl" ? { found: false } : { found: true })
  });
  // Both observe unreachable; both recorded reachable.
  assert.deepEqual(report.disagreements, [
    { id: "was-working", observed: "unreachable", recorded: "reachable" },
    { id: "agrees", observed: "unreachable", recorded: "reachable" }
  ]);
});

test("agreement with verified_status produces no drift entry", async () => {
  const report = await inspect(registryOf([stdioUpstream({ verified_status: "reachable" })]));
  assert.deepEqual(report.disagreements, []);
});

test("an unverified or absent verified_status is never treated as disagreement", async () => {
  const registry = registryOf([
    stdioUpstream({ id: "unverified-one", verified_status: "unverified" }),
    stdioUpstream({ id: "silent" })
  ]);
  const report = await inspect(registry, { lookupCommand: notFound });
  assert.deepEqual(report.disagreements, []);
  assert.equal(report.upstreams[1].verified_status, "unverified");
});

test("an unknown verdict never counts as drift, in either recorded direction", async () => {
  const registry = registryOf([
    stdioUpstream({ id: "recorded-reachable", verified_status: "reachable" }),
    stdioUpstream({ id: "recorded-unreachable", verified_status: "unreachable" })
  ]);
  const report = await inspect(registry, { lookupCommand: indeterminate });
  assert.deepEqual(report.disagreements, []);
});

// --- report shape ---------------------------------------------------------

test("the tally counts every upstream exactly once", async () => {
  const registry = registryOf([
    stdioUpstream({ id: "a" }),
    stdioUpstream({ id: "b", enabled: false }),
    stdioUpstream({ id: "c", runtime: "windows" }),
    sseUpstream({ id: "d" })
  ]);
  const report = await inspect(registry);
  assert.deepEqual(report.tally, { ok: 1, unreachable: 1, disabled: 1, unknown: 1 });
  assert.equal(report.total, 4);
  assert.equal(Object.values(report.tally).reduce((sum, n) => sum + n, 0), report.total);
});

test("inspecting never mutates the registry document it was given", async () => {
  const registry = registryOf([stdioUpstream({ env: { A: "1" } }), sseUpstream()]);
  const before = structuredClone(registry);
  await inspect(registry, { probeEnabled: true, probe: async () => ({ ok: true, status: 200 }) });
  assert.deepEqual(registry, before);
});

test("renderReport prints a row per upstream and surfaces the drift section", async () => {
  const registry = registryOf([stdioUpstream({ id: "was-working", verified_status: "reachable" })]);
  const text = renderReport(await inspect(registry, { lookupCommand: notFound }));
  assert.match(text, /^SecB MCP doctor — registry test-registry, host wsl$/m);
  assert.match(text, /1 declared: 0 ok, 1 unreachable, 0 disabled, 0 unknown/);
  assert.match(text, /^unreachable was-working\s+stdio\s+COMMAND_NOT_FOUND/m);
  assert.match(text, /Advisory drift/);
  assert.match(text, /was-working: observed unreachable, recorded reachable/);
  assert.match(text, /never rewrites the registry/);
});

test("renderReport tells the operator how to opt into probing when it skipped urls", async () => {
  const text = renderReport(await inspect(registryOf([sseUpstream()])));
  assert.match(text, /Pass --probe/);
  assert.equal(text.includes("network probe ON"), false);
});

test("an unknown host is refused with a typed error", async () => {
  await assert.rejects(() => inspect(registryOf([stdioUpstream()]), { host: "solaris" }), (error) => {
    assert.ok(error instanceof McpDoctorError);
    assert.equal(error.code, "DENY_DOCTOR_HOST");
    return true;
  });
});

// --- the real PATH probe --------------------------------------------------

test("lookupCommandOnPath returns unknown, not false, when PATH is unset", () => {
  assert.deepEqual(lookupCommandOnPath("npx", { host: "linux", env: {} }), { found: null, reason: "PATH_UNSET" });
});

test("lookupCommandOnPath rejects a blank command", () => {
  assert.deepEqual(lookupCommandOnPath("", { host: "linux", env: { PATH: "/usr/bin" } }), { found: false });
  assert.deepEqual(lookupCommandOnPath(undefined, { host: "linux" }), { found: false });
});

test("lookupCommandOnPath scans PATH entries for a bare name", () => {
  // Windows host semantics: existence is enough, no execute bit needed, so this
  // works against an ordinary repository file on any platform.
  const hit = lookupCommandOnPath("package.json", { host: "windows", env: { PATH: REPO_ROOT } });
  assert.equal(hit.found, true);
  assert.match(hit.path, /package\.json$/);
  assert.equal(lookupCommandOnPath("definitely-absent-binary", { host: "windows", env: { PATH: REPO_ROOT } }).found, false);
});

test("lookupCommandOnPath checks an explicit path where it points instead of searching", () => {
  const absolute = resolve(REPO_ROOT, "package.json");
  assert.equal(lookupCommandOnPath(absolute, { host: "windows", env: { PATH: "" } }).found, true);
  assert.equal(lookupCommandOnPath(resolve(REPO_ROOT, "nope.json"), { host: "windows", env: { PATH: "" } }).found, false);
});

test("lookupCommandOnPath requires the execute bit on a unix host", { skip: process.platform === "win32" }, () => {
  assert.equal(lookupCommandOnPath("/bin/sh", { host: "linux", env: { PATH: "" } }).found, true);

  // The negative case needs a file that is readable but NOT executable, and it
  // must come from outside the repository: this checkout can live on a DrvFs/9p
  // mount of a Windows drive, where every file reports mode 777 and no such
  // fixture can exist. Skipped rather than faked if the host has none.
  const nonExecutable = ["/etc/hostname", "/etc/hosts", "/etc/passwd"].find((candidate) => {
    try {
      accessSync(candidate, constants.R_OK);
    } catch {
      return false;
    }
    try {
      accessSync(candidate, constants.X_OK);
      return false;
    } catch {
      return true;
    }
  });
  if (nonExecutable === undefined) return;
  assert.equal(lookupCommandOnPath(nonExecutable, { host: "linux", env: { PATH: "" } }).found, false);
  // Same file, Windows semantics: existence alone is enough there.
  assert.equal(lookupCommandOnPath(nonExecutable, { host: "windows", env: { PATH: "" } }).found, true);
});

// --- CLI argument parsing ------------------------------------------------

test("parseArgs defaults to no probe, text output, and the default timeout", () => {
  assert.deepEqual(parseArgs([]), { probe: false, json: false, timeoutMs: DEFAULT_PROBE_TIMEOUT_MS });
});

test("parseArgs reads every supported flag", () => {
  assert.deepEqual(parseArgs(["--host", "linux", "--registry", "/tmp/r.json", "--probe", "--timeout-ms", "500", "--json"]), {
    host: "linux",
    registry: "/tmp/r.json",
    probe: true,
    json: true,
    timeoutMs: 500
  });
});

test("parseArgs rejects a non-positive or non-numeric timeout", () => {
  for (const bad of ["0", "-1", "abc", "1.5"]) {
    assert.throws(() => parseArgs(["--timeout-ms", bad]), (error) => error.code === "DENY_DOCTOR_ARG", `accepted ${bad}`);
  }
});

test("parseArgs rejects an unknown flag rather than silently ignoring it", () => {
  assert.throws(() => parseArgs(["--fix"]), (error) => {
    assert.equal(error.code, "DENY_DOCTOR_ARG");
    return true;
  });
});

// --- smoke against the real registry ------------------------------------

test("smoke: the committed registry validates and inspects without network access", async () => {
  const registry = loadUpstreamRegistry(REGISTRY_PATH);
  const report = await inspectRegistry(registry, {
    host: "wsl",
    actualHost: "wsl",
    lookupCommand: found(),
    pathExists: allPathsExist,
    probe: async () => {
      throw new Error("smoke test must not touch the network");
    }
  });
  assert.equal(report.registry_id, "secb-mcp-upstreams");
  assert.equal(report.upstreams.length, report.total);
  assert.equal(Object.values(report.tally).reduce((sum, n) => sum + n, 0), report.total);
  for (const entry of report.upstreams) {
    assert.ok(["ok", "unreachable", "disabled", "unknown"].includes(entry.verdict), `bad verdict: ${entry.verdict}`);
  }
});
