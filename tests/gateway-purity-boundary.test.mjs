// The MOD-MCP gateway cores make two claims in their own headers, and this file
// turns both into something that can fail.
//
// CLAIM 1 (all four) "Pure in-process core only: no transport, port, filesystem,
// network, credential access, or process spawning." A header comment is a
// promise about code someone will edit later. Checked transitively, because a
// pure module that imports an impure one is not pure.
//
// CLAIM 2 (credential-broker) the ANTI-PASSTHROUGH BOUNDARY: resolveForAdapter()
// output is for adapter process construction by the operator-authorized
// deployment step, and "must never appear in any code path reachable from
// McpGatewayCore.invoke() results, adapter results, receipts, evidence envelopes,
// or ledger entries."
//
// Until these modules were exported from src/index.mjs, claim 2 held for a reason
// nobody chose: no consumer could reach the broker at all. Wiring removed that
// accident. The boundary now rests on the import graph, so the import graph is
// what gets asserted — mcp-gateway-core must not reach credential-broker by any
// path. That is a necessary condition, not the whole boundary: a caller who holds
// both can still hand a sealed reference across by hand. What it does buy is that
// the gateway cannot do so on its own, which is the part a test can hold.

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Three of the four declare "Pure in-process core only". ruflo-command-bridge
// does not, and is deliberately absent: its header claims something weaker and
// different — "Local-first: no network calls, no remote writes, no daemon
// process" — which says nothing about the filesystem. It reaches node:fs through
// contract-validator, consistent with what it actually promises. Holding it to a
// neighbour's stricter sentence would fail it for keeping its own.
const PURE_CORES = [
  "src/gateway/capability-registry-service.mjs",
  "src/gateway/credential-broker.mjs",
  "src/gateway/mcp-gateway-core.mjs"
];

const LOCAL_FIRST = "src/gateway/ruflo-command-bridge.mjs";

// The capabilities the headers disclaim. node:crypto is absent deliberately —
// hashing is computation, not I/O, and the contracts layer fingerprints with it.
const IMPURE_BUILTINS = [
  "node:fs",
  "node:fs/promises",
  "node:net",
  "node:http",
  "node:https",
  "node:tls",
  "node:dgram",
  "node:child_process",
  "node:worker_threads",
  "node:cluster",
  "node:process"
];

/** Every module specifier a file imports, static or dynamic. */
function specifiersOf(absPath) {
  const source = readFileSync(absPath, "utf8");
  const found = new Set();
  // `import ... from "x"`, `export ... from "x"`, bare `import "x"`
  for (const m of source.matchAll(/\bfrom\s*["']([^"']+)["']/g)) found.add(m[1]);
  for (const m of source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) found.add(m[1]);
  for (const m of source.matchAll(/^\s*import\s*["']([^"']+)["']/gm)) found.add(m[1]);
  return [...found];
}

/**
 * Walk relative imports out from a set of entry files.
 *
 * Returns the reachable repository files AND every bare specifier seen along the
 * way, so a builtin pulled in three modules deep is still attributed to the entry
 * that reaches it.
 */
function closure(entries) {
  const files = new Set();
  const builtins = new Map(); // specifier -> the file that imports it
  const queue = [...entries];

  while (queue.length > 0) {
    const rel = queue.pop();
    if (files.has(rel)) continue;
    files.add(rel);

    const abs = resolve(REPO, rel);
    for (const spec of specifiersOf(abs)) {
      if (spec.startsWith(".")) {
        const next = relative(REPO, resolve(dirname(abs), spec)).replaceAll("\\", "/");
        if (!files.has(next)) queue.push(next);
      } else if (!builtins.has(spec)) {
        builtins.set(spec, rel);
      }
    }
  }
  return { files, builtins };
}

test("the gateway cores' purity claim holds transitively, not just at the top file", () => {
  for (const core of PURE_CORES) {
    const { builtins } = closure([core]);
    const violations = [...builtins]
      .filter(([spec]) => IMPURE_BUILTINS.includes(spec))
      .map(([spec, via]) => `${spec} (via ${via})`);

    assert.deepEqual(
      violations,
      [],
      `${core} declares itself a pure in-process core but reaches: ${violations.join(", ")}`
    );
  }
});

test("mcp-gateway-core cannot reach credential-broker by any import path", () => {
  const { files } = closure(["src/gateway/mcp-gateway-core.mjs"]);

  assert.equal(
    files.has("src/gateway/credential-broker.mjs"),
    false,
    "ANTI-PASSTHROUGH BOUNDARY: the gateway now has an import path to the credential " +
      "broker. resolveForAdapter() output must never be reachable from invoke() " +
      "results, receipts, evidence envelopes or ledger entries — and the gateway " +
      "holding the broker is how that starts."
  );
});

test("ruflo-command-bridge keeps the claim it actually makes: no network, no daemon", () => {
  // Its own words are "no network calls, no remote writes, no daemon process".
  // The filesystem is not disclaimed and node:fs arrives through
  // contract-validator, so node:fs is not a violation here — it would be in the
  // three above. Same walker, different promise.
  const NETWORK_OR_DAEMON = [
    "node:net",
    "node:http",
    "node:https",
    "node:tls",
    "node:dgram",
    "node:child_process",
    "node:cluster",
    "node:worker_threads"
  ];
  const { builtins } = closure([LOCAL_FIRST]);
  const violations = [...builtins]
    .filter(([spec]) => NETWORK_OR_DAEMON.includes(spec))
    .map(([spec, via]) => `${spec} (via ${via})`);

  assert.deepEqual(violations, [], `${LOCAL_FIRST} is local-first but reaches: ${violations.join(", ")}`);
});

test("the dependency between broker and gateway runs broker -> gateway, and that is what makes the boundary structural", () => {
  // The edge is credential-broker -> mcp-gateway-core: the broker imports
  // REQUIRED_CONTEXT_FIELDS. Asserted in both directions on purpose. The gateway
  // acquiring an import of the broker would not merely add an edge, it would
  // close a cycle — which is why the anti-passthrough boundary is cheap to hold
  // here and expensive to breach by accident. Delete this and a later refactor
  // that "extracts the shared constants" can quietly reverse the arrow.
  const broker = closure(["src/gateway/credential-broker.mjs"]);
  const gateway = closure(["src/gateway/mcp-gateway-core.mjs"]);

  assert.equal(broker.files.has("src/gateway/mcp-gateway-core.mjs"), true);
  assert.equal(gateway.files.has("src/gateway/credential-broker.mjs"), false);
});

test("exporting CredentialBroker did not give it a usable default", async () => {
  const { CredentialBroker } = await import("../src/index.mjs");

  // Each of the three refusals is a separate fail-closed default. A constructor
  // that accepted any of them by omission would let a consumer reach
  // resolveForAdapter() with no sealer, no promotion gate, or no audit trail.
  assert.throws(() => new CredentialBroker({}), /Sealer/);
  assert.throws(
    () => new CredentialBroker({ sealer: { seal: () => {}, isSealedRef: () => true } }),
    /registryResolver/
  );
  assert.throws(
    () =>
      new CredentialBroker({
        sealer: { seal: () => {}, isSealedRef: () => true },
        registryResolver: () => null
      }),
    /ledgerWriter/
  );
});

test("every gateway core is reachable from the public surface", async () => {
  const publicApi = await import("../src/index.mjs");

  for (const name of ["CapabilityRegistryService", "CredentialBroker", "McpGatewayCore"]) {
    assert.equal(typeof publicApi[name], "function", `${name} is not on the public surface`);
  }

  // Three of four, deliberately. RufloCommandBridge stays off the surface —
  // runtime-provider-plugin.test.mjs owns that assertion ("legacy bridge must not
  // be publicly exported") and this file does not restate it. Recorded here so
  // the omission reads as a decision rather than an oversight: the bridge was
  // superseded by RuntimeProviderPluginRegistry, and this slice's attempt to
  // export it was refused.
  assert.equal(publicApi.RufloCommandBridge, undefined);
});
