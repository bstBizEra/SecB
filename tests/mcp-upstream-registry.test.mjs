/**
 * SecB MCP upstream registry — declaration, host projection, and the WSL bridge.
 *
 * The central property under test is that ONE registry document resolves
 * correctly from both hosts. bizera-win-mcp-hub could not do this: its
 * servers.yaml baked `wsl.exe -d <distro> -- bash -lic ...` into every entry, so
 * the catalogue was only ever valid from Windows.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { resolve } from "node:path";

import {
  UpstreamRegistryError,
  buildShellCommand,
  detectHost,
  loadUpstreamRegistry,
  resolveRegistry,
  resolveUpstream,
  shellQuote,
  validateUpstreamRegistry
} from "../src/mcp/upstream-registry.mjs";

const REGISTRY_PATH = resolve(import.meta.dirname, "..", ".secb", "mcp-upstreams.json");

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

const registryOf = (upstreams, overrides = {}) => ({
  schema_version: "1.0",
  registry_id: "test-registry",
  wsl_distro: "test-distro",
  upstreams,
  ...overrides
});

// --- host detection --------------------------------------------------------

test("detectHost identifies Windows from platform", () => {
  assert.equal(detectHost({ platform: "win32" }), "windows");
});

test("detectHost identifies WSL from /proc/version, not from env", () => {
  assert.equal(detectHost({ platform: "linux", procVersion: "Linux version 6.6.114.1-microsoft-standard-WSL2+" }), "wsl");
});

test("detectHost identifies plain Linux", () => {
  assert.equal(detectHost({ platform: "linux", procVersion: "Linux version 6.8.0-generic" }), "linux");
});

// --- shell quoting ---------------------------------------------------------

test("shellQuote wraps a plain token", () => {
  assert.equal(shellQuote("npx"), "'npx'");
});

test("shellQuote neutralises shell metacharacters", () => {
  assert.equal(shellQuote("a b; rm -rf /"), "'a b; rm -rf /'");
  assert.equal(shellQuote("$HOME"), "'$HOME'");
});

test("shellQuote escapes embedded single quotes", () => {
  // A naive wrapper would close the quote here and leak the rest as shell code.
  assert.equal(shellQuote("it's"), `'it'\\''s'`);
});

test("buildShellCommand quotes every token", () => {
  assert.equal(buildShellCommand("npx", ["-y", "a b"]), "'npx' '-y' 'a b'");
});

// --- validation ------------------------------------------------------------

test("validateUpstreamRegistry accepts a well-formed document", () => {
  const doc = validateUpstreamRegistry(registryOf([stdioUpstream()]));
  assert.equal(doc.upstreams.length, 1);
});

test("validateUpstreamRegistry rejects a duplicate upstream id", () => {
  assert.throws(
    () => validateUpstreamRegistry(registryOf([stdioUpstream(), stdioUpstream()])),
    (error) => error instanceof UpstreamRegistryError && error.code === "DENY_UPSTREAM_ID_DUPLICATE"
  );
});

test("validateUpstreamRegistry rejects a stdio upstream with no command", () => {
  const upstream = stdioUpstream();
  delete upstream.command;
  assert.throws(
    () => validateUpstreamRegistry(registryOf([upstream])),
    (error) => error.code === "DENY_UPSTREAM_REGISTRY_INVALID"
  );
});

test("validateUpstreamRegistry rejects an sse upstream with no url", () => {
  const upstream = stdioUpstream({ transport: "sse", command: undefined });
  delete upstream.command;
  assert.throws(
    () => validateUpstreamRegistry(registryOf([upstream])),
    (error) => error.code === "DENY_UPSTREAM_REGISTRY_INVALID"
  );
});

test("validateUpstreamRegistry rejects an unknown field", () => {
  assert.throws(
    () => validateUpstreamRegistry(registryOf([stdioUpstream({ spawn_as_root: true })])),
    (error) => error.code === "DENY_UPSTREAM_REGISTRY_INVALID"
  );
});

test("validateUpstreamRegistry rejects an id that cannot be a namespace prefix", () => {
  assert.throws(
    () => validateUpstreamRegistry(registryOf([stdioUpstream({ id: "Bad_Id" })])),
    (error) => error.code === "DENY_UPSTREAM_REGISTRY_INVALID"
  );
});

test("loadUpstreamRegistry denies a blank path", () => {
  assert.throws(
    () => loadUpstreamRegistry("   "),
    (error) => error.code === "DENY_UPSTREAM_REGISTRY_PATH"
  );
});

test("loadUpstreamRegistry denies a missing file", () => {
  assert.throws(
    () => loadUpstreamRegistry(resolve(import.meta.dirname, "no-such-registry.json")),
    (error) => error.code === "DENY_UPSTREAM_REGISTRY_UNREADABLE"
  );
});

// --- host projection: the core property ------------------------------------

test("a wsl upstream resolves to a direct spawn when already inside WSL", () => {
  const plan = resolveUpstream(stdioUpstream(), { host: "wsl", wslDistro: "d" });
  assert.equal(plan.reachable, true);
  assert.equal(plan.command, "npx");
  assert.deepEqual(plan.args, ["-y", "server"]);
  assert.equal(plan.bridged, undefined);
});

test("the same wsl upstream resolves to a wsl.exe bridge from Windows", () => {
  const plan = resolveUpstream(stdioUpstream(), { host: "windows", wslDistro: "bizera-wsl" });
  assert.equal(plan.reachable, true);
  assert.equal(plan.command, "wsl.exe");
  assert.deepEqual(plan.args, ["-d", "bizera-wsl", "--", "bash", "-lic", "'npx' '-y' 'server'"]);
  assert.equal(plan.bridged, true);
});

test("bridging folds env into the bash line, because wsl.exe does not forward it", () => {
  const plan = resolveUpstream(stdioUpstream({ env: { LOCAL_TIMEZONE: "Asia/Bangkok" } }), {
    host: "windows",
    wslDistro: "d"
  });
  assert.equal(plan.args.at(-1), "LOCAL_TIMEZONE='Asia/Bangkok' 'npx' '-y' 'server'");
  assert.deepEqual(plan.env, {});
});

test("bridging from Windows without a distro is a typed denial", () => {
  assert.throws(
    () => resolveUpstream(stdioUpstream(), { host: "windows" }),
    (error) => error.code === "DENY_UPSTREAM_WSL_DISTRO"
  );
});

test("a windows-runtime upstream is unreachable from WSL rather than a plan that may fail at spawn", () => {
  const plan = resolveUpstream(stdioUpstream({ runtime: "windows", command: "python" }), { host: "wsl" });
  assert.equal(plan.reachable, false);
  assert.equal(plan.reason, "HOST_UNREACHABLE");
});

test("an any-runtime upstream resolves directly on both hosts", () => {
  for (const host of ["windows", "wsl"]) {
    const plan = resolveUpstream(stdioUpstream({ runtime: "any" }), { host, wslDistro: "d" });
    assert.equal(plan.reachable, true);
    assert.equal(plan.command, "npx");
  }
});

test("a disabled upstream never resolves to a plan", () => {
  const plan = resolveUpstream(stdioUpstream({ enabled: false }), { host: "wsl" });
  assert.equal(plan.reachable, false);
  assert.equal(plan.reason, "DISABLED");
});

test("resolveUpstream rejects an unknown host", () => {
  assert.throws(
    () => resolveUpstream(stdioUpstream(), { host: "solaris" }),
    (error) => error.code === "DENY_UPSTREAM_HOST"
  );
});

// --- url transports --------------------------------------------------------

test("a loopback url is refused across the WSL boundary", () => {
  const upstream = stdioUpstream({ transport: "sse", runtime: "wsl", url: "http://localhost:8020/sse" });
  delete upstream.command;
  const plan = resolveUpstream(upstream, { host: "windows", wslDistro: "d" });
  assert.equal(plan.reachable, false);
  assert.equal(plan.reason, "LOOPBACK_ACROSS_BOUNDARY");
});

test("a loopback url resolves on its own host", () => {
  const upstream = stdioUpstream({ transport: "sse", runtime: "wsl", url: "http://127.0.0.1:8020/sse" });
  delete upstream.command;
  const plan = resolveUpstream(upstream, { host: "wsl" });
  assert.equal(plan.reachable, true);
  assert.equal(plan.url, "http://127.0.0.1:8020/sse");
});

test("a routable url crosses the boundary untouched", () => {
  const upstream = stdioUpstream({ transport: "http", runtime: "wsl", url: "https://mcp.example.com/mcp" });
  delete upstream.command;
  const plan = resolveUpstream(upstream, { host: "windows", wslDistro: "d" });
  assert.equal(plan.reachable, true);
  assert.equal(plan.url, "https://mcp.example.com/mcp");
});

// --- the shipped migration -------------------------------------------------

test("the migrated registry validates", () => {
  const registry = loadUpstreamRegistry(REGISTRY_PATH);
  assert.equal(registry.registry_id, "secb-mcp-upstreams");
  // servers.yaml declared 17. sqlite-bst-intel was dropped on operator
  // instruction, so 16 is the floor; anything lower means an entry was lost
  // rather than retired.
  assert.ok(registry.upstreams.length >= 16, "the migrated entries are carried over");
  assert.ok(
    !registry.upstreams.some((u) => u.id === "sqlite-bst-intel"),
    "the operator-removed upstream stays removed"
  );
});

test("the migrated registry no longer references the renamed organism root", () => {
  const registry = loadUpstreamRegistry(REGISTRY_PATH);
  const serialized = JSON.stringify(registry.upstreams.map((u) => [u.command, u.args, u.url]));
  assert.ok(!serialized.includes("/opt/bizera-smartthink"), "the renamed root is not targeted by any entry");
});

test("the migrated registry projects onto both hosts without throwing", () => {
  const registry = loadUpstreamRegistry(REGISTRY_PATH);
  for (const host of ["windows", "wsl"]) {
    const projection = resolveRegistry(registry, { host });
    assert.equal(projection.total, registry.upstreams.length);
    assert.equal(projection.reachable + projection.unreachable, projection.total);
  }
});

test("windows-only upstreams drop out of the WSL projection but survive on Windows", () => {
  const registry = loadUpstreamRegistry(REGISTRY_PATH);
  const fromWsl = resolveRegistry(registry, { host: "wsl" });
  const fromWindows = resolveRegistry(registry, { host: "windows" });
  const windowsMcp = (projection) => projection.upstreams.find((u) => u.id === "windows-mcp");
  assert.equal(windowsMcp(fromWsl).reachable, false);
  assert.equal(windowsMcp(fromWindows).reachable, true);
});

test("every enabled wsl upstream is bridged when projected from Windows", () => {
  const registry = loadUpstreamRegistry(REGISTRY_PATH);
  const projection = resolveRegistry(registry, { host: "windows" });
  const bridgeable = projection.upstreams.filter((u) => u.reachable && u.runtime === "wsl" && u.transport === "stdio");
  assert.ok(bridgeable.length > 0, "the migration carries bridgeable stdio upstreams");
  for (const plan of bridgeable) {
    assert.equal(plan.command, "wsl.exe");
    assert.equal(plan.bridged, true);
  }
});
