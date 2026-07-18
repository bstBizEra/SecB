// SecB MCP Server — JSON-RPC 2.0 framing over stdio
//
// Scope: line-oriented parsing and serialization. This module is
// deliberately transport-only:
//   - Reads newline-delimited JSON messages from a Readable stream
//   - Serializes outgoing responses/notifications with a trailing "\n"
//   - Validates JSON-RPC 2.0 request shape at parse time
//   - Enforces a maximum per-message byte size
//   - Never crashes on malformed input; returns typed parse errors
//
// This module knows nothing about MCP methods, tools, or dispatch.
// Method-level authorization, unknown-method rejection, and the
// initialize protocol-version pin all live in the dispatch layer
// (secb-mcp-server.mjs).
//
// Doctrine constraints:
//   - No node:http / node:https / node:net / node:child_process. This
//     module uses only node:buffer and node:readline. The import-surface
//     scan in tests enforces this.
//   - Deep-frozen ErrorCodes and shared constants; downstream code
//     cannot mutate them.
//   - Data-not-instructions: errors carry {code, message, data}. The
//     `data` field never contains model-directive text; it is a
//     structured object safe to render as JSON.

import { Buffer } from "node:buffer";
import { createInterface } from "node:readline";

// JSON-RPC 2.0 standard error codes plus one implementation-defined
// server-error range value we use for message-too-large.
export const ErrorCodes = Object.freeze({
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  // Implementation-defined server errors are -32000..-32099. We use
  // one specific value for size limit.
  MessageTooLarge: -32001,
});

export const PROTOCOL_VERSION = "2.0";

// Default maximum per-message payload in bytes (UTF-8). Callers may
// override at parse time.
export const DEFAULT_MAX_MESSAGE_BYTES = 1_048_576; // 1 MiB

// -------------------------------------------------------------------------
// Parsing
// -------------------------------------------------------------------------

// parseLine reads one line (already-stripped of trailing newline) and
// returns either { request } for a valid JSON-RPC 2.0 request/notification,
// or { errorResponse } for a fully-formed JSON-RPC error response ready
// to send back. Never throws for input reasons; only throws on programmer
// error (e.g., passing a non-string).
export function parseLine(line, maxBytes = DEFAULT_MAX_MESSAGE_BYTES) {
  if (typeof line !== "string") {
    throw new TypeError("parseLine: line must be a string");
  }
  if (typeof maxBytes !== "number" || maxBytes <= 0) {
    throw new TypeError("parseLine: maxBytes must be a positive number");
  }

  // Size guard BEFORE JSON.parse to avoid unbounded allocation attacks.
  const byteLength = Buffer.byteLength(line, "utf8");
  if (byteLength > maxBytes) {
    return {
      errorResponse: buildErrorResponse(null, ErrorCodes.MessageTooLarge, "message exceeds maximum size", {
        max_bytes: maxBytes,
        observed_bytes: byteLength,
      }),
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch (e) {
    return {
      errorResponse: buildErrorResponse(null, ErrorCodes.ParseError, "Parse error", {
        reason: "invalid JSON",
      }),
    };
  }

  const validation = validateRequestShape(parsed);
  if (!validation.valid) {
    // Extract id if present and well-typed so the client can correlate.
    const rawId = idFromMaybeObject(parsed);
    return {
      errorResponse: buildErrorResponse(rawId, ErrorCodes.InvalidRequest, "Invalid Request", {
        reason: validation.reason,
      }),
    };
  }

  return { request: parsed };
}

function idFromMaybeObject(obj) {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return null;
  if (!("id" in obj)) return null;
  const t = typeof obj.id;
  if (t === "string" || t === "number" || obj.id === null) return obj.id;
  return null;
}

function validateRequestShape(obj) {
  if (obj === null || typeof obj !== "object") {
    return { valid: false, reason: "request must be a JSON object" };
  }
  if (Array.isArray(obj)) {
    return { valid: false, reason: "batch requests not supported" };
  }
  if (obj.jsonrpc !== PROTOCOL_VERSION) {
    return { valid: false, reason: `jsonrpc must be "${PROTOCOL_VERSION}"` };
  }
  if (typeof obj.method !== "string" || obj.method.length === 0) {
    return { valid: false, reason: "method must be a non-empty string" };
  }
  if ("id" in obj) {
    const t = typeof obj.id;
    if (t !== "string" && t !== "number" && obj.id !== null) {
      return { valid: false, reason: "id must be a string, number, or null" };
    }
  }
  if ("params" in obj) {
    if (
      obj.params === null ||
      typeof obj.params !== "object"
    ) {
      // Arrays are objects in JS; JSON-RPC allows params to be array or object.
      // Null and non-object primitives are invalid.
      return { valid: false, reason: "params must be an object or array" };
    }
  }
  return { valid: true };
}

// isNotification returns true iff the request lacks an id (JSON-RPC 2.0
// notifications MUST NOT be responded to).
export function isNotification(request) {
  return !("id" in request);
}

// -------------------------------------------------------------------------
// Serialization / response builders
// -------------------------------------------------------------------------

export function buildResponse(id, result) {
  return { jsonrpc: PROTOCOL_VERSION, id: id ?? null, result };
}

export function buildErrorResponse(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: PROTOCOL_VERSION, id: id ?? null, error };
}

export function serializeMessage(message) {
  if (message === null || typeof message !== "object" || Array.isArray(message)) {
    throw new TypeError("serializeMessage: message must be a non-array object");
  }
  return JSON.stringify(message) + "\n";
}

// -------------------------------------------------------------------------
// Stream helpers
// -------------------------------------------------------------------------

// createLineReader wraps a Node Readable stream (e.g., process.stdin)
// in an async iterator that yields parse results per newline-delimited
// line. Empty lines are skipped.
export function createLineReader(input, maxBytes = DEFAULT_MAX_MESSAGE_BYTES) {
  const rl = createInterface({ input, crlfDelay: Infinity });
  const iterator = {
    async *[Symbol.asyncIterator]() {
      for await (const line of rl) {
        if (line.length === 0) continue;
        yield parseLine(line, maxBytes);
      }
    },
    close() {
      rl.close();
    },
  };
  return iterator;
}

// createLineWriter wraps a Node Writable stream and provides a single
// write(message) method that serializes and appends "\n".
export function createLineWriter(output) {
  if (output === null || typeof output !== "object" || typeof output.write !== "function") {
    throw new TypeError("createLineWriter: output must be a Writable stream");
  }
  return {
    write(message) {
      output.write(serializeMessage(message));
    },
  };
}
