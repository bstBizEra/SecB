import { createInterface } from "node:readline";

// P0-21 thin stdio transport (GOV-MCP-01): newline-delimited JSON-RPC 2.0
// over stdin/stdout. No socket, no port, no bind — the entire remote-
// actuation attack class is structurally absent. Parse errors are answered
// per spec and never crash the process. The authorization lives in the
// injected SecBMcpServer, not here; this is framing only.
//
// callerInstanceId is asserted by the spawning host at construction
// (SARCHI-AA-01: the OS process spawn is the authentication event this
// layer provides; these checks bind cooperative callers).

export function serveStdio(server, { callerInstanceId, input = process.stdin, output = process.stdout } = {}) {
  const rl = createInterface({ input, crlfDelay: Infinity });
  const write = (obj) => { if (obj !== null) output.write(`${JSON.stringify(obj)}\n`); };
  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let message;
    try {
      message = JSON.parse(trimmed);
    } catch {
      write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      return;
    }
    try {
      write(server.handle(message, { callerInstanceId }));
    } catch (error) {
      write({ jsonrpc: "2.0", id: message?.id ?? null, error: { code: -32603, message: `Internal error: ${error.message}` } });
    }
  });
  return rl;
}
