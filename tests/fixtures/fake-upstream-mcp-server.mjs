#!/usr/bin/env node
/**
 * Minimal stdio MCP server used only by tests/mcp-upstream-proxy.test.mjs.
 *
 * Real upstreams are fetched by npx/uvx at run time, which would make the proxy
 * tests network-dependent and non-hermetic. This fixture speaks just enough of
 * the protocol to exercise handshake, listing, calling, and each failure mode.
 *
 * Behaviour is switched by argv[2]:
 *   normal   - answers correctly
 *   noisy    - prints a non-JSON banner before speaking protocol
 *   silent   - never answers (exercises the request timeout)
 *   crash    - exits non-zero immediately after initialize
 *   toolfail - returns a JSON-RPC error from tools/call
 *   clingy   - never answers AND does not exit when stdin closes
 *
 * "clingy" exists for the orphan test. Every other mode only reads stdin, so
 * when the parent dies the pipe closes, readline ends, nothing is left holding
 * the loop, and the process exits on its own — which made an orphan test pass
 * whether or not the hub had any signal handling at all. A real upstream
 * routinely holds a socket, a watcher, or a timer, so it does NOT exit for free.
 * This mode holds a timer to reproduce that, and is the only mode that can tell
 * a reaped child from a self-terminating one.
 */

import { createInterface } from "node:readline";

const mode = process.argv[2] ?? "normal";

if (mode === "clingy") setInterval(() => {}, 1000);

if (mode === "noisy") {
  process.stdout.write("fake-upstream starting up, please wait\n");
  process.stdout.write("not json either\n");
}

const TOOLS = [
  { name: "echo", description: "Echo the given message back." },
  { name: "add", description: "Add two numbers." },
  { name: "big", description: "Return a payload of the requested byte size." },
  { name: "slow", description: "Answer after the requested delay in ms." }
];

const write = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`);

createInterface({ input: process.stdin, crlfDelay: Infinity }).on("line", (line) => {
  const trimmed = line.trim();
  if (trimmed === "") return;
  if (mode === "silent" || mode === "clingy") return;

  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    return;
  }
  const { id, method, params } = message;
  if (id === undefined || id === null) return; // notification

  if (method === "initialize") {
    write({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: params?.protocolVersion ?? "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: `fake-upstream-${mode}`, version: "1.0.0" }
      }
    });
    if (mode === "crash") process.exit(3);
    return;
  }

  if (method === "tools/list") {
    write({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
    return;
  }

  if (method === "tools/call") {
    if (mode === "toolfail") {
      write({ jsonrpc: "2.0", id, error: { code: -32000, message: "upstream refused" } });
      return;
    }
    const name = params?.name;
    const args = params?.arguments ?? {};
    if (name === "echo") {
      write({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: String(args.message ?? "") }] } });
      return;
    }
    if (name === "add") {
      write({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: String(Number(args.a ?? 0) + Number(args.b ?? 0)) }] } });
      return;
    }
    if (name === "big") {
      write({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: "x".repeat(Number(args.bytes ?? 1024)) }] } });
      return;
    }
    if (name === "slow") {
      setTimeout(() => {
        write({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: "slept" }] } });
      }, Number(args.ms ?? 50));
      return;
    }
    write({ jsonrpc: "2.0", id, error: { code: -32602, message: `unknown tool: ${name}` } });
    return;
  }

  write({ jsonrpc: "2.0", id, error: { code: -32601, message: `method not found: ${method}` } });
});
