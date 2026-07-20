#!/usr/bin/env node
// P0-21 CLI entry (GOV-MCP-04/06/08). Wires the delivered services into a
// SecBMcpServer over stdio. Refuses to start without a registry seed and a
// writable invocation-ledger path (fail-closed audit). READ-ONLY alpha.
//
// This is an integration entry point (spawns per client per GOV-MCP-01);
// the gate logic it exposes is unit-tested in tests/mcp-server.test.mjs.
// It is intentionally minimal: real service construction + seed validation
// belong to the operator-authorized deployment step, not this skeleton.
import { serveStdio } from "../src/mcp/jsonrpc-stdio.mjs";

// eslint-disable-next-line no-unused-vars
export function bootstrap({ server, callerInstanceId }) {
  return serveStdio(server, { callerInstanceId });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stderr.write("run-secb-mcp-server: service wiring + registry-seed validation are an operator-authorized deployment step (alpha skeleton).\n");
  process.exit(2);
}
