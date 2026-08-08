/**
 * SecB MCP client-config generator — emission, escaping, and the never-emit rule.
 *
 * The central property under test is that the generator never prints a config
 * line that is known not to work. bizera-win-mcp-hub's install.ps1 wrote all 17
 * entries into the live client config regardless of whether the target existed,
 * so a broken upstream first surfaced as a spawn failure inside the client. Here
 * an unreachable upstream is either absent or inert.
 *
 * Registry documents are built inline: these tests must not break when
 * .secb/mcp-upstreams.json legitimately changes. The one exception is the smoke
 * test at the end, which asserts only that the real file still renders.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { resolve } from "node:path";

import {
  DEFAULT_STARTUP_TIMEOUT_SEC,
  FORMATS,
  McpConfigError,
  buildClientConfig,
  generateClientConfig,
  parseArgs,
  tomlKey,
  tomlString
} from "../tools/secb-mcp-config.mjs";

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

const httpUpstream = (overrides = {}) => ({
  id: "remote",
  description: "Remote upstream",
  enabled: true,
  transport: "http",
  runtime: "any",
  url: "https://mcp.example.test/mcp",
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

const parseJson = (text) => JSON.parse(text);

// --- TOML string emission --------------------------------------------------

test("tomlString uses a literal string so Windows backslashes survive verbatim", () => {
  // A basic string would turn C:\Users into an invalid escape; a literal string
  // is the only correct rendering, and matches how the operator's real
  // ~/.codex/config.toml already writes Windows paths.
  assert.equal(tomlString("C:\\Users\\vily\\bin\\node.exe"), "'C:\\Users\\vily\\bin\\node.exe'");
});

test("tomlString falls back to a basic string when the value contains a single quote", () => {
  // resolveUpstream() shell-quotes the bridged inner command, so this is the
  // normal Windows-host case, not an exotic one.
  assert.equal(tomlString("'npx' '-y' '/opt'"), '"\'npx\' \'-y\' \'/opt\'"');
});

test("tomlString escapes backslashes and quotes once it is in basic form", () => {
  assert.equal(tomlString(`he said 'hi' and C:\\x "y"`), '"he said \'hi\' and C:\\\\x \\"y\\""');
});

test("tomlString escapes control characters that have no shorthand", () => {
  assert.equal(tomlString("a\u0001b"), '"a\\u0001b"');
  assert.equal(tomlString("tab\there"), '"tab\\there"');
});

test("tomlKey quotes a key that is not bare-safe", () => {
  assert.equal(tomlKey("LOCAL_TIMEZONE"), "LOCAL_TIMEZONE");
  assert.equal(tomlKey("has.dot"), "'has.dot'");
});

// --- codex format ----------------------------------------------------------

test("codex format emits one mcp_servers table per reachable upstream", () => {
  const output = buildClientConfig(registryOf([stdioUpstream()]), { format: "codex", host: "wsl" });
  assert.match(output, /^\[mcp_servers\.example\]$/m);
  assert.match(output, /^command = 'npx'$/m);
  assert.match(output, /^args = \['-y', 'server'\]$/m);
  assert.match(output, new RegExp(`^startup_timeout_sec = ${DEFAULT_STARTUP_TIMEOUT_SEC}$`, "m"));
});

test("codex format emits an env subtable only when the upstream declares env", () => {
  const without = buildClientConfig(registryOf([stdioUpstream()]), { format: "codex", host: "wsl" });
  assert.equal(without.includes(".env]"), false);

  const with_ = buildClientConfig(registryOf([stdioUpstream({ env: { LOCAL_TIMEZONE: "Asia/Bangkok" } })]), {
    format: "codex",
    host: "wsl"
  });
  assert.match(with_, /^\[mcp_servers\.example\.env\]$/m);
  assert.match(with_, /^LOCAL_TIMEZONE = 'Asia\/Bangkok'$/m);
});

test("codex format renders the wsl.exe bridge as valid TOML from a Windows host", () => {
  const output = buildClientConfig(registryOf([stdioUpstream()]), { format: "codex", host: "windows" });
  assert.match(output, /^command = 'wsl\.exe'$/m);
  // The inner bash line is single-quoted by resolveUpstream, so the args array
  // must have switched to basic strings rather than emitting broken literals.
  assert.match(output, /"'npx' '-y' 'server'"/);
  assert.equal(output.includes("'''"), false);
});

test("codex format skips unreachable upstreams by default", () => {
  const registry = registryOf([stdioUpstream({ id: "reachable" }), stdioUpstream({ id: "shut-off", enabled: false })]);
  const output = buildClientConfig(registry, { format: "codex", host: "wsl" });
  assert.match(output, /^\[mcp_servers\.reachable\]$/m);
  assert.equal(output.includes("shut-off"), false);
});

test("codex --include-unreachable reports unreachable upstreams inert, never as live config", () => {
  const registry = registryOf([stdioUpstream({ id: "shut-off", enabled: false, note: "turned off on purpose" })]);
  const output = buildClientConfig(registry, { format: "codex", host: "wsl", includeUnreachable: true });
  assert.match(output, /DISABLED/);
  assert.match(output, /turned off on purpose/);
  // Present as text, but every line mentioning it is a comment.
  for (const line of output.split("\n")) {
    if (line.includes("shut-off")) assert.match(line, /^#/, `expected comment, got: ${line}`);
  }
  assert.equal(/^\[mcp_servers\.shut-off\]$/m.test(output), false);
});

test("codex format warns when a url upstream is emitted, since stdio-only clients reject it", () => {
  const output = buildClientConfig(registryOf([httpUpstream()]), { format: "codex", host: "wsl" });
  assert.match(output, /^url = 'https:\/\/mcp\.example\.test\/mcp'$/m);
  assert.match(output, /# NOTE: .*sse\/http/s);
});

test("codex header does not warn about url upstreams when none are emitted", () => {
  const output = buildClientConfig(registryOf([stdioUpstream()]), { format: "codex", host: "wsl" });
  assert.equal(output.includes("NOTE:"), false);
});

// --- claude format ---------------------------------------------------------

test("claude format emits an mcpServers map keyed by upstream id", () => {
  const document = parseJson(buildClientConfig(registryOf([stdioUpstream()]), { format: "claude", host: "wsl" }));
  assert.deepEqual(document, { mcpServers: { example: { command: "npx", args: ["-y", "server"] } } });
});

test("claude format omits an empty env rather than emitting env: {}", () => {
  const document = parseJson(buildClientConfig(registryOf([stdioUpstream({ env: {} })]), { format: "claude", host: "wsl" }));
  assert.equal("env" in document.mcpServers.example, false);
});

test("claude format keeps unreachable entries out of mcpServers entirely", () => {
  const registry = registryOf([stdioUpstream({ id: "live" }), stdioUpstream({ id: "shut-off", enabled: false })]);
  const plain = parseJson(buildClientConfig(registry, { format: "claude", host: "wsl" }));
  assert.deepEqual(Object.keys(plain.mcpServers), ["live"]);
  assert.equal("_unreachable" in plain, false);

  const annotated = parseJson(buildClientConfig(registry, { format: "claude", host: "wsl", includeUnreachable: true }));
  // The unreachable entry is a sibling of mcpServers: an unknown top-level key
  // is ignored by the client, whereas a server entry would be launched.
  assert.deepEqual(Object.keys(annotated.mcpServers), ["live"]);
  assert.equal(annotated._unreachable.length, 1);
  assert.equal(annotated._unreachable[0].id, "shut-off");
  assert.equal(annotated._unreachable[0].reason, "DISABLED");
});

// --- json format -----------------------------------------------------------

test("json format returns the resolution projection with reachable upstreams only", () => {
  const registry = registryOf([stdioUpstream({ id: "live" }), stdioUpstream({ id: "shut-off", enabled: false })]);
  const document = parseJson(buildClientConfig(registry, { format: "json", host: "wsl" }));
  assert.equal(document.registry_id, "test-registry");
  assert.equal(document.host, "wsl");
  assert.equal(document.total, 2);
  assert.equal(document.reachable, 1);
  assert.equal(document.unreachable, 1);
  assert.deepEqual(
    document.upstreams.map((u) => u.id),
    ["live"]
  );
  assert.equal("_unreachable" in document, false);
});

test("json --include-unreachable carries the deny reason for each withheld upstream", () => {
  const registry = registryOf([stdioUpstream({ id: "windows-only", runtime: "windows" })]);
  const document = parseJson(buildClientConfig(registry, { format: "json", host: "wsl", includeUnreachable: true }));
  assert.deepEqual(document.upstreams, []);
  assert.equal(document._unreachable.length, 1);
  assert.equal(document._unreachable[0].reason, "HOST_UNREACHABLE");
  // The detail must name the runtime actually required, not a hardcoded host.
  assert.match(document._unreachable[0].detail, /must run on 'windows'/);
});

test("a wsl upstream resolved from plain linux explains the wsl bridge, not windows interop", () => {
  const registry = registryOf([stdioUpstream({ runtime: "wsl" })]);
  const document = parseJson(buildClientConfig(registry, { format: "json", host: "linux", includeUnreachable: true }));
  assert.match(document._unreachable[0].detail, /must run on 'wsl'/);
  assert.match(document._unreachable[0].detail, /wsl\.exe bridge/);
});

// --- the never-emit invariant ---------------------------------------------

test("no format ever emits a live entry for an unreachable upstream", () => {
  const registry = registryOf([
    stdioUpstream({ id: "live" }),
    stdioUpstream({ id: "disabled-one", enabled: false }),
    stdioUpstream({ id: "windows-only", runtime: "windows" }),
    httpUpstream({ id: "loopback", url: "http://localhost:8020/sse", runtime: "windows" })
  ]);
  const withheld = ["disabled-one", "windows-only", "loopback"];

  for (const includeUnreachable of [false, true]) {
    const codex = buildClientConfig(registry, { format: "codex", host: "wsl", includeUnreachable });
    const claude = parseJson(buildClientConfig(registry, { format: "claude", host: "wsl", includeUnreachable }));
    const json = parseJson(buildClientConfig(registry, { format: "json", host: "wsl", includeUnreachable }));
    for (const id of withheld) {
      assert.equal(new RegExp(`^\\[mcp_servers\\.${id}\\]$`, "m").test(codex), false, `codex emitted ${id}`);
      assert.equal(id in claude.mcpServers, false, `claude emitted ${id}`);
      assert.equal(
        json.upstreams.some((u) => u.id === id),
        false,
        `json emitted ${id}`
      );
    }
  }
});

test("rendering is deterministic and preserves registry order", () => {
  const registry = registryOf([stdioUpstream({ id: "b" }), stdioUpstream({ id: "a" }), stdioUpstream({ id: "c" })]);
  for (const format of FORMATS) {
    const first = buildClientConfig(registry, { format, host: "wsl" });
    const second = buildClientConfig(registry, { format, host: "wsl" });
    assert.equal(first, second, `${format} is not deterministic`);
  }
  const claude = parseJson(buildClientConfig(registry, { format: "claude", host: "wsl" }));
  assert.deepEqual(Object.keys(claude.mcpServers), ["b", "a", "c"]);
});

test("building a config never mutates the registry document it was given", () => {
  const registry = registryOf([stdioUpstream({ env: { A: "1" } })]);
  const before = structuredClone(registry);
  for (const format of FORMATS) buildClientConfig(registry, { format, host: "wsl", includeUnreachable: true });
  assert.deepEqual(registry, before);
});

// --- fail-closed inputs ---------------------------------------------------

test("an unknown format is refused with a typed error", () => {
  assert.throws(() => buildClientConfig(registryOf([stdioUpstream()]), { format: "yaml", host: "wsl" }), (error) => {
    assert.ok(error instanceof McpConfigError);
    assert.equal(error.code, "DENY_CONFIG_FORMAT");
    return true;
  });
});

test("an unknown host is refused with a typed error", () => {
  assert.throws(() => buildClientConfig(registryOf([stdioUpstream()]), { format: "codex", host: "solaris" }), (error) => {
    assert.equal(error.code, "DENY_CONFIG_HOST");
    return true;
  });
});

test("an invalid registry document is refused before anything is rendered", () => {
  assert.throws(
    () => buildClientConfig(registryOf([stdioUpstream({ classification_ceiling: "TOP_SECRET" })]), { format: "codex", host: "wsl" }),
    (error) => {
      assert.equal(error.code, "DENY_UPSTREAM_REGISTRY_INVALID");
      return true;
    }
  );
});

// --- CLI argument parsing -------------------------------------------------

test("parseArgs defaults to the codex format and no unreachable reporting", () => {
  assert.deepEqual(parseArgs([]), { format: "codex", includeUnreachable: false });
});

test("parseArgs reads every supported flag", () => {
  assert.deepEqual(parseArgs(["--format", "json", "--host", "windows", "--registry", "/tmp/r.json", "--include-unreachable"]), {
    format: "json",
    host: "windows",
    registry: "/tmp/r.json",
    includeUnreachable: true
  });
});

test("parseArgs rejects an unknown flag rather than silently ignoring it", () => {
  assert.throws(() => parseArgs(["--install"]), (error) => {
    assert.equal(error.code, "DENY_CONFIG_ARG");
    return true;
  });
});

test("parseArgs rejects a flag whose value is missing or is another flag", () => {
  assert.throws(() => parseArgs(["--format"]), (error) => error.code === "DENY_CONFIG_ARG");
  assert.throws(() => parseArgs(["--format", "--host"]), (error) => error.code === "DENY_CONFIG_ARG");
});

// --- smoke against the real registry --------------------------------------

test("smoke: the committed registry renders for every format and host", () => {
  for (const host of ["windows", "wsl", "linux"]) {
    for (const format of FORMATS) {
      const output = generateClientConfig({ registryPath: REGISTRY_PATH, format, host });
      assert.equal(typeof output, "string");
      assert.ok(output.length > 0);
      if (format !== "codex") JSON.parse(output);
    }
  }
});
