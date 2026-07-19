// SecB MCP Server — dispatch pipeline
//
// Sits above jsonrpc-stdio.mjs (transport) and tool-catalog.mjs (catalog).
// Implements deny-by-default method routing, caller precondition, param
// schema validation, reserved-delimiter guard, request fingerprinting,
// injectable service dispatch, and fail-closed invocation ledgering.
//
// Does not touch process.stdin/stdout. Callers frame requests through
// jsonrpc-stdio.mjs and pass parsed requests to handleRequest().
//
// Doctrine constraints:
//   - No node:http/https/net/child_process (import-surface test enforces)
//   - SARCHI-AA-01 honesty: registry check binds cooperative callers only;
//     enforcement boundary is the OS process spawn, not this module
//   - GOV-P011-08: reserved delimiters '|','@' denied in all id params
//   - GOV-MCP-06: fail-closed DENY_AUDIT_UNAVAILABLE when invocation record
//     cannot be appended (one bounded retry on LEDGER_BUSY)
//   - Data-not-instructions: results carry content_disposition:'data_untrusted'
//   - Session-scoped idempotency: identical requests return replayed:true

import { createHash } from "node:crypto";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { TOOL_CATALOG, TOOL_BY_NAME } from "./tool-catalog.mjs";
import { ErrorCodes, buildResponse, buildErrorResponse, isNotification } from "./jsonrpc-stdio.mjs";
import { minCeiling } from "../ui/report-projections.mjs";

// GOV-MCP-09: pinned MCP protocol version. Non-matching initialize is refused
// outright with a typed error; there is no silent best-effort fallback.
export const PINNED_PROTOCOL_VERSION = "2024-11-05";

// GOV-P011-08: system-wide reserved delimiter set (shared constant; not re-declared).
const RESERVED_DELIMITERS = Object.freeze(["|", "@"]);

// Deny-by-default method allowlist (GOV-MCP-02).
const ALLOWED_METHODS = Object.freeze(
  new Set(["initialize", "tools/list", "tools/call", "ping", "notifications/initialized"])
);

// Ajv 2020-12 validators compiled from the frozen catalog schemas.
// Compilation happens here (dispatch boundary); the catalog stays dependency-free.
const _ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(_ajv);
const COMPILED_SCHEMAS = new Map(
  TOOL_CATALOG.map((t) => [t.name, _ajv.compile(t.inputSchema)])
);

// -------------------------------------------------------------------------
// Internal helpers
// -------------------------------------------------------------------------

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((k) => [k, canonicalize(value[k])])
    );
  }
  return value;
}

function sha256hex(obj) {
  return createHash("sha256").update(JSON.stringify(canonicalize(obj))).digest("hex");
}

// Returns { field, delimiter } for the first reserved-delimiter hit in
// top-level string params, or null if none found.
function findReservedDelimiter(params) {
  if (!params || typeof params !== "object" || Array.isArray(params)) return null;
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      for (const d of RESERVED_DELIMITERS) {
        if (value.includes(d)) return { field: key, delimiter: d };
      }
    }
  }
  return null;
}

// -------------------------------------------------------------------------
// Public error class
// -------------------------------------------------------------------------

export class McpServerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "McpServerError";
    this.code = code;
  }
}

// -------------------------------------------------------------------------
// McpServer
// -------------------------------------------------------------------------

export class McpServer {
  #registry;
  #invocationLedger;
  #services;
  #serverCeiling;
  #callerInstanceId;
  #pinnedProtocolVersion;
  #now;
  #sessionId;
  #initialized = false;
  // Monotonically increasing count of records appended to the invocation
  // ledger this session (initialized from current ledger count at startup).
  #ledgerSequence = 0;
  // Session-scoped dedup cache: request fingerprint -> { response, decisionCode }
  #idempotencyCache = new Map();

  constructor({
    registry,
    invocationLedger,
    services = {},
    serverCeiling = "INTERNAL",
    callerInstanceId,
    pinnedProtocolVersion = PINNED_PROTOCOL_VERSION,
    now = () => new Date().toISOString(),
    sessionId,
  } = {}) {
    if (!registry) {
      throw new McpServerError("MISSING_REGISTRY", "RuntimeRegistry is required");
    }
    if (!invocationLedger || typeof invocationLedger.append !== "function") {
      throw new McpServerError("MISSING_LEDGER", "Invocation ledger is required");
    }
    if (!callerInstanceId || typeof callerInstanceId !== "string") {
      throw new McpServerError("MISSING_CALLER_ID", "callerInstanceId is required");
    }
    if (!["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"].includes(serverCeiling)) {
      throw new McpServerError("INVALID_CEILING", `Unknown classification ceiling: ${serverCeiling}`);
    }

    this.#registry = registry;
    this.#invocationLedger = invocationLedger;
    this.#services = services;
    this.#serverCeiling = serverCeiling;
    this.#callerInstanceId = callerInstanceId;
    this.#pinnedProtocolVersion = pinnedProtocolVersion;
    this.#now = now;
    this.#sessionId =
      sessionId ??
      `mcp_sess_${sha256hex({ ts: Date.now(), r: Math.random() }).slice(0, 16)}`;

    // Seed ledger sequence from current ledger count so expectedSequence is
    // correct even when appending to a pre-existing invocation ledger file.
    if (typeof invocationLedger.verify === "function") {
      try {
        const status = invocationLedger.verify();
        this.#ledgerSequence = typeof status.count === "number" ? status.count : 0;
      } catch {
        this.#ledgerSequence = 0;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Public entry point
  // -------------------------------------------------------------------------

  // Takes a parsed request (from parseLine) and returns a response object,
  // or null for notifications (which MUST NOT be replied to per JSON-RPC 2.0).
  async handleRequest(request) {
    if (isNotification(request)) {
      return null;
    }

    const { id, method } = request;

    if (!ALLOWED_METHODS.has(method)) {
      return buildErrorResponse(id, ErrorCodes.MethodNotFound, "Method not found", {
        method,
        allowed: [...ALLOWED_METHODS].filter((m) => !m.startsWith("notifications/")),
      });
    }

    switch (method) {
      case "initialize":
        return this.#handleInitialize(id, request.params ?? {});
      case "tools/list":
        return this.#handleToolsList(id);
      case "tools/call":
        return this.#handleToolsCall(id, request.params ?? {});
      case "ping":
        return buildResponse(id, {});
      default:
        return buildErrorResponse(id, ErrorCodes.InternalError, "Internal error");
    }
  }

  // -------------------------------------------------------------------------
  // Method handlers
  // -------------------------------------------------------------------------

  #handleInitialize(id, params) {
    const clientVersion = params.protocolVersion;
    if (clientVersion !== this.#pinnedProtocolVersion) {
      return buildErrorResponse(id, ErrorCodes.InvalidRequest, "Unsupported protocol version", {
        code: "DENY_PROTOCOL_VERSION",
        requested: clientVersion ?? null,
        supported: this.#pinnedProtocolVersion,
      });
    }
    this.#initialized = true;
    return buildResponse(id, {
      protocolVersion: this.#pinnedProtocolVersion,
      capabilities: { tools: {} },
      serverInfo: { name: "secb-mcp-server", version: "0.1.0-alpha" },
    });
  }

  #handleToolsList(id) {
    return buildResponse(id, {
      tools: TOOL_CATALOG.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    });
  }

  async #handleToolsCall(id, params) {
    const startTime = Date.now();
    const toolName = typeof params.name === "string" ? params.name : null;
    const toolParams = params.arguments != null && typeof params.arguments === "object"
      ? params.arguments
      : {};

    // Compute fingerprint up front; used for session-scoped dedup.
    const fp = sha256hex({ tool: toolName, params: toolParams, caller: this.#callerInstanceId });

    // Session-scoped idempotency: identical request returns replayed result.
    const cached = this.#idempotencyCache.get(fp);
    if (cached) {
      return { ...cached.response, replayed: true };
    }

    // --------------- Pipeline below: every exit ledgers and caches ----------------

    // 1. Tool existence check (before caller check: method-level routing).
    if (!toolName || !TOOL_BY_NAME[toolName]) {
      return this.#finalizeCall(id, fp, "DENY_UNKNOWN_TOOL",
        buildErrorResponse(id, ErrorCodes.MethodNotFound, "Tool not found", {
          code: "DENY_UNKNOWN_TOOL",
          tool: toolName,
        }),
        this.#serverCeiling, Date.now() - startTime, toolName ?? "(unknown)"
      );
    }

    // 2. Caller precondition (GOV-MCP-04; SARCHI-AA-01 honesty clause applies).
    const callerResolution = this.#registry.resolve(this.#callerInstanceId);
    const callerMaxClass = callerResolution.resolved
      ? (callerResolution.identity.max_data_classification ?? "INTERNAL")
      : "INTERNAL";
    const effectiveCeiling = minCeiling(this.#serverCeiling, callerMaxClass);

    if (!callerResolution.resolved) {
      return this.#finalizeCall(id, fp, "DENY_CALLER_QUARANTINED",
        buildErrorResponse(id, ErrorCodes.InvalidRequest, "Caller precondition failed", {
          code: "DENY_CALLER_QUARANTINED",
          reason: callerResolution.reason,
        }),
        effectiveCeiling, Date.now() - startTime, toolName
      );
    }

    // 3. Param schema validation (Ajv 2020-12, compiled at module load).
    const validate = COMPILED_SCHEMAS.get(toolName);
    if (validate) {
      const paramsForValidation = JSON.parse(JSON.stringify(toolParams));
      if (!validate(paramsForValidation)) {
        const errs = (validate.errors ?? []).map((e) => ({
          path: e.instancePath,
          message: e.message,
        }));
        return this.#finalizeCall(id, fp, "DENY_INVALID_PARAMS",
          buildErrorResponse(id, ErrorCodes.InvalidParams, "Invalid parameters", {
            code: "DENY_INVALID_PARAMS",
            errors: errs,
          }),
          effectiveCeiling, Date.now() - startTime, toolName
        );
      }
    }

    // 4. Reserved-delimiter scan (GOV-P011-08).
    const delimHit = findReservedDelimiter(toolParams);
    if (delimHit) {
      return this.#finalizeCall(id, fp, "DENY_RESERVED_DELIMITER",
        buildErrorResponse(id, ErrorCodes.InvalidParams, "Reserved delimiter in parameter", {
          code: "DENY_RESERVED_DELIMITER",
          field: delimHit.field,
          delimiter: delimHit.delimiter,
        }),
        effectiveCeiling, Date.now() - startTime, toolName
      );
    }

    // 5. Service invocation via injectable handler.
    const service = this.#services[toolName];
    let serviceData, decisionCode;
    if (!service) {
      decisionCode = "DENY_SERVICE_UNAVAILABLE";
      serviceData = { deny: true, code: decisionCode, tool: toolName };
    } else {
      try {
        serviceData = await service(toolParams, {
          callerIdentity: callerResolution.identity,
          effectiveCeiling,
          serverNow: this.#now,
        });
        decisionCode = "ALLOW";
      } catch (err) {
        decisionCode = "DENY_SERVICE_ERROR";
        serviceData = { deny: true, code: decisionCode, message: err.message };
      }
    }

    // 6. Build response (data-not-instructions; content_disposition marker on all results).
    const response = decisionCode === "ALLOW"
      ? buildResponse(id, {
          content: [{
            type: "text",
            text: JSON.stringify({ content_disposition: "data_untrusted", ...serviceData }),
          }],
        })
      : buildErrorResponse(id, ErrorCodes.InternalError, "Service invocation denied", {
          code: decisionCode,
          result: { content_disposition: "data_untrusted", ...serviceData },
        });

    return this.#finalizeCall(id, fp, decisionCode, response,
      effectiveCeiling, Date.now() - startTime, toolName
    );
  }

  // -------------------------------------------------------------------------
  // Finalization: ledger append + idempotency cache
  // -------------------------------------------------------------------------

  // Appends the invocation record and caches the result. Returns either the
  // original response or DENY_AUDIT_UNAVAILABLE if the ledger cannot record.
  // Every exit from #handleToolsCall (allow OR deny) goes through here.
  #finalizeCall(id, fp, decisionCode, response, effectiveCeiling, durationMs, toolName) {
    try {
      this.#appendInvocationRecord({ fp, toolName, decisionCode, effectiveCeiling, durationMs });
    } catch (err) {
      if (err.code === "DENY_AUDIT_UNAVAILABLE") {
        return buildErrorResponse(id, ErrorCodes.InternalError, "Audit unavailable", {
          code: "DENY_AUDIT_UNAVAILABLE",
        });
      }
      throw err;
    }
    this.#idempotencyCache.set(fp, { response, decisionCode });
    return response;
  }

  // -------------------------------------------------------------------------
  // Invocation ledger (GOV-MCP-06: fail-closed with one bounded retry)
  // -------------------------------------------------------------------------

  // Appends one record per call (allowed AND denied). Raw above-ceiling params
  // are NOT stored; only the fingerprint is recorded. Uses a unique
  // session-scoped idempotency key (not the request fingerprint) to avoid
  // DENY_IDEMPOTENCY_CONFLICT when the same request is retried with differing
  // duration_ms values; the fingerprint appears in the payload for analysis.
  #appendInvocationRecord({ fp, toolName, decisionCode, effectiveCeiling, durationMs }) {
    const timestamp = this.#now();
    const ledgerKey = `mcp_${this.#sessionId}_${this.#ledgerSequence}`;
    const entry = {
      entryId: `mcp_inv_${fp.slice(0, 24)}_${this.#ledgerSequence}`,
      projectId: "secb-mcp-server",
      workPackageId: "mcp-alpha",
      sessionId: this.#sessionId,
      actorId: this.#callerInstanceId,
      type: "mcp.invocation",
      payload: {
        tool: toolName,
        fingerprint: fp,
        decision_code: decisionCode,
        effective_ceiling: effectiveCeiling,
        duration_ms: durationMs,
        caller_assertion: this.#callerInstanceId,
      },
      timestamp,
      idempotencyKey: ledgerKey,
    };

    let lastErr;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        this.#invocationLedger.append(entry, { expectedSequence: this.#ledgerSequence });
        this.#ledgerSequence++;
        return;
      } catch (err) {
        if (err.code === "LEDGER_BUSY") {
          lastErr = err;
          continue;
        }
        throw new McpServerError(
          "DENY_AUDIT_UNAVAILABLE",
          `Invocation ledger error: ${err.message}`
        );
      }
    }
    throw new McpServerError(
      "DENY_AUDIT_UNAVAILABLE",
      `Invocation ledger busy after retry: ${lastErr.message}`
    );
  }
}
