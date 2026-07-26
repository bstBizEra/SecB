#!/usr/bin/env node
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

process.env.SECB_MCP_DEPLOYMENT_AUTHORIZED = "operator";
process.env.SECB_MCP_REGISTRY_SEED = resolve(ROOT, "tests", "fixtures", "valid", "mcp-registry-seed.example.json");
process.env.SECB_MCP_INVOCATION_LEDGER = resolve(ROOT, ".secb", "ledgers", "invocation-ledger.jsonl");
process.env.SECB_MCP_EVENT_LEDGER = resolve(ROOT, ".secb", "ledgers", "event-ledger.jsonl");
process.env.SECB_MCP_EVIDENCE_LEDGER = resolve(ROOT, ".secb", "ledgers", "evidence-ledger.jsonl");
process.env.SECB_MCP_CALLER_INSTANCE = "agt-secb-seed-test-001";

import("./run-secb-mcp-server.mjs");
