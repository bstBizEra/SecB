#!/usr/bin/env node
// P0-21 CLI entry (GOV-MCP-04/06/08). Wires the delivered services into a
// SecBMcpServer over stdio. Refuses to start without explicit operator
// authorization, a valid registry seed, and a writable invocation-ledger path
// (fail-closed audit). READ-ONLY alpha.
//
// This is an integration entry point (spawns per client per GOV-MCP-01);
// the gate logic it exposes is unit-tested in tests/mcp-server.test.mjs and
// the deployment wiring in tests/mcp-server-deployment.test.mjs.
//
// The candidate deployment wiring now lives in secb-mcp-server-wiring.mjs.
// This entry stays non-activatable by default: without
// SECB_MCP_DEPLOYMENT_AUTHORIZED=operator (and a valid seed) it exits 2 with
// the operator-authorization message — activation remains an operator step.
import { pathToFileURL } from "node:url";
import { serveStdio } from "../src/mcp/jsonrpc-stdio.mjs";
import {
  DeploymentError,
  OPERATOR_AUTH_MESSAGE,
  prepareDeployment
} from "./secb-mcp-server-wiring.mjs";

// eslint-disable-next-line no-unused-vars
export function bootstrap({ server, callerInstanceId }) {
  return serveStdio(server, { callerInstanceId });
}

// Cross-platform entry-point detection (POSIX-identical; also correct on
// Windows, where `file://${process.argv[1]}` would never match a drive path).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { server, callerInstanceId } = prepareDeployment({ argv: process.argv.slice(2), env: process.env });
    bootstrap({ server, callerInstanceId });
  } catch (error) {
    const message = error instanceof DeploymentError ? error.message : `${OPERATOR_AUTH_MESSAGE} (${error.message})`;
    process.stderr.write(`${message}\n`);
    process.exit(2);
  }
}
