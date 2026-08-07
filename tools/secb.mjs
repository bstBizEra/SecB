#!/usr/bin/env node
/**
 * SecB — the internal command surface.
 *
 * Why this exists: `.mcp.json` and `.vscode/mcp.json` registered the SecB MCP
 * server as `npx -y secb-agent-registry@latest`. That name is unpublished, so
 * the entry could never start — and because `npx` resolves against the public
 * registry (no `.npmrc`, no private mirror configured), the name is claimable by
 * anyone, after which `-y` would fetch and execute it without a prompt. "Used
 * internally" describes who runs the tool, not where its code is fetched from;
 * internal systems are the target class for that substitution, not an exempt
 * one. Routing through a local command removes the resolution path entirely.
 *
 * This is a DISPATCHER, not a new capability. Every subcommand delegates to the
 * tool that already owns the behaviour, so there is exactly one implementation
 * of each and nothing here can drift from it.
 *
 * Boundary — working rule 5 (no activation without operator authorization):
 * dispatching is not activating. `secb mcp serve` still refuses to start
 * without `SECB_MCP_DEPLOYMENT_AUTHORIZED=operator`, because that gate lives in
 * run-secb-mcp-server.mjs and this file deliberately does not reach past it.
 * Nothing here writes a user config either; `secb mcp config` prints, exactly
 * as secb-mcp-config.mjs already does.
 *
 * Boundary — working rule 8 (unknown fails closed): an unrecognised subcommand
 * is an error with the known set listed, never a guess and never a fallthrough
 * to a shell.
 *
 * Usage:
 *   secb graph [...]           scan the knowledge graph
 *   secb skills [...]          skills registry
 *   secb mcp config [...]      print a client config (never writes)
 *   secb mcp doctor [...]      diagnose declared upstreams
 *   secb mcp serve [...]       run the MCP server over stdio (operator-gated)
 *   secb validate              foundation validation
 */

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

/**
 * Subcommand -> the tool that owns it.
 *
 * Nested objects are subcommand groups. Leaves are paths relative to the repo
 * root; they are resolved against ROOT rather than the caller's cwd so `secb`
 * behaves identically from any directory.
 */
export const COMMANDS = Object.freeze({
  graph: "tools/secb-graph.mjs",
  skills: "tools/secb-skills.mjs",
  validate: "tools/validate-foundation.mjs",
  mcp: Object.freeze({
    config: "tools/secb-mcp-config.mjs",
    doctor: "tools/secb-mcp-doctor.mjs",
    serve: "tools/run-secb-mcp-server.mjs"
  })
});

export class SecbCliError extends Error {}

/** Every invocable path, e.g. ["graph", "mcp config", ...] — for error text and docs. */
export function knownCommands(node = COMMANDS, prefix = []) {
  const out = [];
  for (const [name, value] of Object.entries(node)) {
    const path = [...prefix, name];
    if (typeof value === "string") out.push(path.join(" "));
    else out.push(...knownCommands(value, path));
  }
  return out.sort();
}

/**
 * Pure resolution: argv -> { script, args }.
 *
 * Pure so the routing table is testable without spawning a process; the spawn
 * is the only impure part of this file and it does nothing but forward.
 *
 * @param {string[]} argv subcommand words followed by the tool's own arguments
 * @returns {{ script: string, args: string[], command: string }}
 */
export function resolveCommand(argv) {
  let node = COMMANDS;
  const path = [];

  for (let i = 0; i < argv.length; i += 1) {
    const word = argv[i];
    // Stop descending at the first flag: everything from there belongs to the
    // tool, not to the routing table.
    if (word.startsWith("-")) break;
    // Own properties only. A plain `node[word]` also reaches Object.prototype,
    // so "constructor"/"toString" would resolve to a function instead of
    // undefined and skip the unknown branch below — and a polluted
    // `Object.prototype.<name> = "path.mjs"` would resolve to a script this
    // file would then spawn. Closing that is the whole point of the file.
    const next = Object.hasOwn(node, word) ? node[word] : undefined;
    if (next === undefined) {
      throw new SecbCliError(
        `unknown command '${[...path, word].join(" ")}'. Known: ${knownCommands().join(", ")}`
      );
    }
    path.push(word);
    if (typeof next === "string") {
      return { script: resolve(ROOT, next), args: argv.slice(i + 1), command: path.join(" ") };
    }
    node = next;
  }

  // Ran out of words while still inside a group — name the group, do not guess
  // a default (working rule 8: unknown scope fails closed).
  const where = path.length ? `'${path.join(" ")}'` : "secb";
  throw new SecbCliError(
    `${where} needs a subcommand. Known: ${knownCommands(node, path).join(", ")}`
  );
}

/**
 * Spawn the resolved tool, forwarding stdio verbatim.
 *
 * `stdio: "inherit"` is required, not incidental: `mcp serve` speaks JSON-RPC
 * over stdin/stdout, so any buffering or re-encoding here would corrupt the
 * protocol. Inheriting also means the child's exit code is the only status this
 * process reports.
 */
export function runCommand({ script, args }, { spawnFn = spawn } = {}) {
  return new Promise((resolvePromise) => {
    const child = spawnFn(process.execPath, [script, ...args], { stdio: "inherit" });
    child.on("close", (code, signal) => resolvePromise(signal ? 1 : (code ?? 1)));
    child.on("error", () => resolvePromise(1));
  });
}

async function main(argv) {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    process.stdout.write(
      `secb — SecB internal command surface\n\nCommands:\n` +
        knownCommands().map((c) => `  secb ${c}\n`).join("") +
        `\nArguments after a subcommand are passed through unchanged.\n`
    );
    return 0;
  }
  try {
    return await runCommand(resolveCommand(argv));
  } catch (error) {
    if (error instanceof SecbCliError) {
      process.stderr.write(`secb: ${error.message}\n`);
      return 2;
    }
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
