#!/usr/bin/env node
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareDeployment } from "./secb-mcp-server-wiring.mjs";
import { serveStdio } from "../src/mcp/jsonrpc-stdio.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

// Defaults only: an MCP host that already asserts a seed, caller, or ledger
// path keeps it. Assigning unconditionally made these unoverridable, so a
// client config could not point the server at an operator-authorized seed.
// ROOT is derived from this file's own URL, so the same launcher resolves
// correctly whether it is spawned from Windows or from inside WSL.
const setDefault = (key, value) => {
  if (typeof process.env[key] !== "string" || process.env[key].trim() === "") process.env[key] = value;
};

setDefault("SECB_MCP_DEPLOYMENT_AUTHORIZED", "operator");
setDefault("SECB_MCP_REGISTRY_SEED", resolve(ROOT, "tests", "fixtures", "valid", "mcp-registry-seed.example.json"));
setDefault("SECB_MCP_INVOCATION_LEDGER", resolve(ROOT, ".secb", "ledgers", "invocation-ledger.jsonl"));
setDefault("SECB_MCP_EVENT_LEDGER", resolve(ROOT, ".secb", "ledgers", "event-ledger.jsonl"));
setDefault("SECB_MCP_EVIDENCE_LEDGER", resolve(ROOT, ".secb", "ledgers", "evidence-ledger.jsonl"));
// Must name an identity that the active seed actually carries, or every
// tools/call fails DENY_UNRESOLVED_CALLER while tools/list still succeeds.
// The default seed above is the example seed and carries exactly this one.
setDefault("SECB_MCP_CALLER_INSTANCE", "inst_claude_alpha_ro");

const { server, callerInstanceId } = prepareDeployment({ argv: process.argv.slice(2), env: process.env });
serveStdio(server, { callerInstanceId });
