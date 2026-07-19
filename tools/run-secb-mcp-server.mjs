#!/usr/bin/env node
// SecB MCP Server — stdio entry point
//
// Wires real ledgers, seeds the RuntimeRegistry from a JSON file, and
// runs the dispatch pipeline over process.stdin / process.stdout.
// All diagnostic output goes to process.stderr; stdout carries only
// newline-delimited JSON-RPC 2.0 messages.
//
// Required environment variable:
//   SECB_CALLER_INSTANCE_ID  agent_instance_id of the connecting MCP caller;
//                             must be present in the loaded registry seed
//
// Optional environment variables:
//   SECB_SERVER_CEILING   PUBLIC|INTERNAL|CONFIDENTIAL|RESTRICTED (default INTERNAL)
//   SECB_DATA_DIR         directory for ledger NDJSON files (default ./secb-data)
//   SECB_REGISTRY_SEED    path to a registry seed JSON file
//                         (format: { agents: [{ registration, transitions }] })
//
// Seed file format:
//   {
//     "agents": [
//       {
//         "registration": { ...agent-registration fields, evaluation_status: "CANDIDATE", lifecycle_state: "PENDING" },
//         "transitions": { "evaluation": "APPROVED", "lifecycle": "ACTIVE" }
//       }
//     ]
//   }
//
// See tests/fixtures/mcp-registry-seed.json for a worked example.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

import { DurableLedger } from "../src/ledger/durable-ledger.mjs";
import { EventLedger, EvidenceLedger } from "../src/ledger/governed-ledgers.mjs";
import { createLineReader, createLineWriter } from "../src/mcp/jsonrpc-stdio.mjs";
import { McpServer } from "../src/mcp/secb-mcp-server.mjs";
import { makeToolServices } from "../src/mcp/tool-services.mjs";
import { RuntimeRegistry } from "../src/registry/runtime-registry.mjs";

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Required environment variable ${name} is not set`);
  return value;
}

function optionalEnv(name, fallback) {
  return process.env[name] ?? fallback;
}

// -------------------------------------------------------------------------
// Main
// -------------------------------------------------------------------------

async function main() {
  const callerInstanceId = requireEnv("SECB_CALLER_INSTANCE_ID");
  const serverCeiling = optionalEnv("SECB_SERVER_CEILING", "INTERNAL");
  const dataDir = resolve(optionalEnv("SECB_DATA_DIR", "./secb-data"));
  const seedPath = process.env.SECB_REGISTRY_SEED
    ? resolve(process.env.SECB_REGISTRY_SEED)
    : null;

  // -- Ledgers ---------------------------------------------------------------

  const eventsLedger = new EventLedger({
    filePath: resolve(dataDir, "events.ndjson"),
  });
  const evidenceLedger = new EvidenceLedger({
    filePath: resolve(dataDir, "evidence.ndjson"),
  });
  const invocationLedger = new DurableLedger({
    filePath: resolve(dataDir, "invocations.ndjson"),
    ledgerId: "secb-mcp-invocations",
  });

  // -- Registry --------------------------------------------------------------

  const registry = new RuntimeRegistry({ policyCeiling: "A5" });
  if (seedPath) {
    const seed = JSON.parse(readFileSync(seedPath, "utf8"));
    for (const agent of seed.agents ?? []) {
      registry.register(agent.registration);
      const { evaluation, lifecycle } = agent.transitions ?? {};
      if (evaluation) {
        registry.transitionEvaluation(agent.registration.agent_instance_id, evaluation);
      }
      if (lifecycle) {
        registry.transitionLifecycle(agent.registration.agent_instance_id, lifecycle);
      }
    }
    process.stderr.write(
      `[secb-mcp] registry seeded from ${seedPath} (${registry.size} agent(s))\n`
    );
  }

  // -- Server ----------------------------------------------------------------

  const services = makeToolServices({ registry, eventsLedger, evidenceLedger });
  const server = new McpServer({
    registry,
    invocationLedger,
    services,
    serverCeiling,
    callerInstanceId,
  });

  process.stderr.write(
    `[secb-mcp] ready  caller=${callerInstanceId}  ceiling=${serverCeiling}  data=${dataDir}\n`
  );

  // -- stdio loop ------------------------------------------------------------

  const writer = createLineWriter(process.stdout);
  for await (const parsed of createLineReader(process.stdin)) {
    if ("errorResponse" in parsed) {
      writer.write(parsed.errorResponse);
      continue;
    }
    const response = await server.handleRequest(parsed.request);
    if (response !== null) {
      writer.write(response);
    }
  }
}

main().catch((err) => {
  process.stderr.write(`[secb-mcp] fatal: ${err.message}\n`);
  process.exit(1);
});
