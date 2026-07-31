/**
 * Lazy Ajv loading — work-package item U1.
 *
 * The property under test is an ABSENCE: that importing the MCP server does not
 * drag in the Ajv package. An absence cannot be observed from inside a process
 * that may already have loaded it for another reason, so each check runs in a
 * fresh child and inspects the CommonJS require cache.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

/** Run a snippet in a fresh node process and return its trimmed stdout. */
function inChild(source) {
  return execFileSync(process.execPath, ["--input-type=module", "-e", source], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 60_000
  }).trim();
}

const AJV_LOADED = `
  import { createRequire } from "node:module";
  const req = createRequire(${JSON.stringify(`${ROOT}/x.mjs`)});
  globalThis.__ajvLoaded = () =>
    Object.keys(req.cache).some((p) => {
      const normalized = p.replaceAll("\\\\", "/");
      return normalized.includes("node_modules/ajv/") || normalized.endsWith("node_modules/ajv");
    });
`;

test("importing the MCP server does not load Ajv", () => {
  const out = inChild(`
    ${AJV_LOADED}
    await import("./src/mcp/secb-mcp-server.mjs");
    console.log(globalThis.__ajvLoaded() ? "LOADED" : "not-loaded");
  `);
  assert.equal(out, "not-loaded", "Ajv is 2.5s of load time here and nothing in an import needs it");
});

test("importing the upstream registry does not load Ajv", () => {
  const out = inChild(`
    ${AJV_LOADED}
    await import("./src/mcp/upstream-registry.mjs");
    console.log(globalThis.__ajvLoaded() ? "LOADED" : "not-loaded");
  `);
  assert.equal(out, "not-loaded");
});

test("validating a contract does load Ajv, and still validates", () => {
  const out = inChild(`
    ${AJV_LOADED}
    const { validateContract } = await import("./src/contracts/contract-validator.mjs");
    const before = globalThis.__ajvLoaded();
    let code = "none";
    try { validateContract("goal", {}); } catch (e) { code = e.code; }
    console.log([before ? "LOADED" : "not-loaded", globalThis.__ajvLoaded() ? "LOADED" : "not-loaded", code].join("|"));
  `);
  assert.equal(out, "not-loaded|LOADED|DENY_CONTRACT_INVALID", "loaded on first use, not before, and the verdict is unchanged");
});

test("an unknown contract kind is refused without loading Ajv", () => {
  const out = inChild(`
    ${AJV_LOADED}
    const { validateContract } = await import("./src/contracts/contract-validator.mjs");
    let code = "none";
    try { validateContract("no-such-kind", {}); } catch (e) { code = e.code; }
    console.log([code, globalThis.__ajvLoaded() ? "LOADED" : "not-loaded"].join("|"));
  `);
  assert.equal(out, "DENY_UNKNOWN_CONTRACT|not-loaded", "an unknown kind is rejected before any schema work");
});

test("supportedContractKinds reports every declared kind, not just compiled ones", () => {
  const out = inChild(`
    const { supportedContractKinds, validateContract } = await import("./src/contracts/contract-validator.mjs");
    const before = supportedContractKinds().length;
    try { validateContract("goal", {}); } catch {}
    console.log([before, supportedContractKinds().length].join("|"));
  `);
  // Reading the compiled-validator cache here would have reported a set that
  // grew as contracts happened to be validated.
  assert.equal(out, "21|21");
});

test("a validated contract still round-trips after lazy compilation", () => {
  const out = inChild(`
    const { readFileSync } = await import("node:fs");
    const { validateContract } = await import("./src/contracts/contract-validator.mjs");
    const doc = JSON.parse(readFileSync("tests/fixtures/valid/agent-registration.json", "utf8"));
    console.log(JSON.stringify(validateContract("agentRegistration", doc)));
  `);
  assert.equal(out, JSON.stringify({ kind: "agentRegistration", valid: true }));
});
