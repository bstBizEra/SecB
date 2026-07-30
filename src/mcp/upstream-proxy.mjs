/**
 * SecB MCP upstream proxy — the aggregation layer that lets SecB stand in for
 * bizera-win-mcp-hub.
 *
 * The old hub aggregated by writing 17 server entries into every MCP client's
 * config: the client held the fan-out, so nothing observed or constrained the
 * traffic. Here SecB is the single configured server and the fan-out happens
 * behind one governed surface, so every upstream call passes the same audit
 * ledger and classification ceiling as a native tool.
 *
 * Composition, not modification: the frozen SecBMcpServer core is wrapped, never
 * edited. Native tools keep their exact synchronous behaviour; only namespaced
 * calls take the async upstream path.
 */

import { findReservedDelimiter } from "../contracts/reserved-delimiters.mjs";

// "__" is safe: RESERVED_ID_DELIMITERS is ["|", "@"], and underscore is legal in
// MCP tool names, so a namespaced name stays a valid single identifier.
export const NAMESPACE_SEPARATOR = "__";

const CLASS_ORDER = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"];
const DATA_UNTRUSTED = { content_disposition: "data_untrusted" };

// Mirrors src/gateway/mcp-gateway-core.mjs DEFAULT_LIMITS. An upstream is
// third-party code whose reply lands in a model context, so both the number of
// concurrent calls and the size of a single reply are bounded by default rather
// than by the upstream's goodwill.
export const DEFAULT_UPSTREAM_LIMITS = Object.freeze({
  max_concurrency: 4,
  max_response_bytes: 256 * 1024,
  max_queue_depth: 32
});

const rpcError = (id, code, message, data) => ({ jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } });
const rpcResult = (id, result) => ({ jsonrpc: "2.0", id, result });

export function namespaceToolName(upstreamId, toolName) {
  return `${upstreamId}${NAMESPACE_SEPARATOR}${toolName}`;
}

export function splitNamespacedToolName(name) {
  if (typeof name !== "string") return null;
  const index = name.indexOf(NAMESPACE_SEPARATOR);
  if (index <= 0) return null;
  const upstreamId = name.slice(0, index);
  const toolName = name.slice(index + NAMESPACE_SEPARATOR.length);
  if (upstreamId === "" || toolName === "") return null;
  return { upstreamId, toolName };
}

export class SecBMcpUpstreamProxy {
  #core;
  #clients;
  #upstreamPolicy;
  #invocationLog;
  #ceiling;
  #now;
  #limits;
  #toolsByUpstream = new Map();
  #gates = new Map();

  /**
   * @param core           a SecBMcpServer (its handle() stays synchronous)
   * @param clients        Map<upstreamId, UpstreamClient>
   * @param upstreamPolicy Map<upstreamId, { classification_ceiling }>
   * @param invocationLog  (entry) => void; throwing is the fail-closed signal
   */
  constructor({ core, clients = new Map(), upstreamPolicy = new Map(), invocationLog, classificationCeiling = "INTERNAL", limits = {}, now = () => new Date() } = {}) {
    if (!core || typeof core.handle !== "function") {
      throw new Error("SecBMcpUpstreamProxy requires a core server with handle()");
    }
    if (typeof invocationLog !== "function") {
      throw new Error("SecBMcpUpstreamProxy requires an invocationLog function (fail-closed audit)");
    }
    if (!CLASS_ORDER.includes(classificationCeiling)) {
      throw new Error(`Unknown classificationCeiling: ${classificationCeiling}`);
    }
    this.#core = core;
    this.#clients = clients;
    this.#upstreamPolicy = upstreamPolicy;
    this.#invocationLog = invocationLog;
    this.#ceiling = classificationCeiling;
    this.#limits = { ...DEFAULT_UPSTREAM_LIMITS, ...limits };
    this.#now = now;
  }

  #limitFor(upstreamId, key) {
    const declared = this.#upstreamPolicy.get(upstreamId)?.[key];
    return typeof declared === "number" ? declared : this.#limits[key];
  }

  /**
   * Bounded concurrency gate per upstream. A saturated gate queues, and a
   * queue past max_queue_depth denies rather than growing without limit — an
   * unbounded queue only converts a slow upstream into a memory leak.
   */
  #acquire(upstreamId) {
    const cap = this.#limitFor(upstreamId, "max_concurrency");
    let gate = this.#gates.get(upstreamId);
    if (!gate) {
      gate = { active: 0, waiters: [] };
      this.#gates.set(upstreamId, gate);
    }
    if (gate.active < cap) {
      gate.active += 1;
      return { ok: true, release: () => this.#release(upstreamId) };
    }
    if (gate.waiters.length >= this.#limits.max_queue_depth) {
      return { ok: false };
    }
    const ticket = new Promise((resolve) => gate.waiters.push(resolve));
    return { ok: true, wait: ticket, release: () => this.#release(upstreamId) };
  }

  #release(upstreamId) {
    const gate = this.#gates.get(upstreamId);
    if (!gate) return;
    const next = gate.waiters.shift();
    if (next) next();
    else gate.active -= 1;
  }

  /**
   * Cache each ready upstream's tool list. Called once after the clients start;
   * tools/list must never fan out to live upstreams on the request path, or one
   * slow upstream would stall every listing.
   */
  async refreshTools() {
    this.#toolsByUpstream.clear();
    const results = [];
    for (const [id, client] of this.#clients) {
      if (client.state !== "ready") {
        results.push({ id, ok: false, reason: client.failure?.code ?? `state:${client.state}` });
        continue;
      }
      try {
        const tools = await client.listTools();
        this.#toolsByUpstream.set(id, tools);
        results.push({ id, ok: true, count: tools.length });
      } catch (error) {
        results.push({ id, ok: false, reason: error.code ?? "DENY_UPSTREAM_ERROR" });
      }
    }
    return results;
  }

  /**
   * Async superset of SecBMcpServer.handle. Native methods and tools are
   * delegated unchanged; only a namespaced tools/call goes upstream.
   */
  async handle(message, { callerInstanceId } = {}) {
    if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
      return this.#core.handle(message, { callerInstanceId });
    }

    if (message.method === "tools/list") {
      const base = this.#core.handle(message, { callerInstanceId });
      if (base?.error) return base;
      const proxied = [];
      for (const [upstreamId, tools] of this.#toolsByUpstream) {
        for (const tool of tools) {
          proxied.push({
            name: namespaceToolName(upstreamId, tool.name),
            // Upstream descriptions are model-instruction channels authored
            // outside SecB. They are passed through so the tool is usable, but
            // prefixed so a reader can always see whose text this is.
            description: `[upstream:${upstreamId}] ${tool.description}`
          });
        }
      }
      return rpcResult(message.id, { tools: [...base.result.tools, ...proxied] });
    }

    if (message.method === "tools/call") {
      const split = splitNamespacedToolName(message.params?.name);
      if (split && this.#clients.has(split.upstreamId)) {
        return this.#proxyCall(message, split, callerInstanceId);
      }
      return this.#core.handle(message, { callerInstanceId });
    }

    return this.#core.handle(message, { callerInstanceId });
  }

  async #proxyCall(message, { upstreamId, toolName }, callerInstanceId) {
    const id = message.id;
    const args = message.params?.arguments ?? {};
    const at = this.#now().toISOString();

    const audit = (decision, extra = {}) => {
      try {
        this.#invocationLog({
          type: "MCP_UPSTREAM_INVOCATION",
          upstream: upstreamId,
          tool: toolName,
          caller: callerInstanceId ?? null,
          decision,
          timestamp: at,
          ...extra
        });
        return true;
      } catch {
        return false;
      }
    };
    // An unauditable proxied call is a covert channel out of the organism, so it
    // is refused before the upstream is contacted, not after.
    const denyUnaudited = () => rpcError(id, -32000, "Invocation audit unavailable; call withheld", { code: "DENY_AUDIT_UNAVAILABLE" });

    if (typeof callerInstanceId !== "string" || callerInstanceId.trim() === "") {
      if (!audit("DENY_UNRESOLVED_CALLER")) return denyUnaudited();
      return rpcError(id, -32001, "Caller instance id is required", { code: "DENY_UNRESOLVED_CALLER" });
    }

    const hit = findReservedDelimiter(toolName);
    if (hit) {
      if (!audit("DENY_RESERVED_DELIMITER")) return denyUnaudited();
      return rpcError(id, -32602, `Tool name must not contain '${hit}'`, { code: "DENY_RESERVED_DELIMITER" });
    }

    // The upstream's declared ceiling is capped by the server's. An upstream
    // permitted to handle CONFIDENTIAL data is not reachable through a server
    // running at INTERNAL.
    const declared = this.#upstreamPolicy.get(upstreamId)?.classification_ceiling;
    if (declared && CLASS_ORDER.indexOf(declared) > CLASS_ORDER.indexOf(this.#ceiling)) {
      if (!audit("DENY_CLASSIFICATION_CEILING", { declared, server_ceiling: this.#ceiling })) return denyUnaudited();
      return rpcError(id, -32001, `Upstream '${upstreamId}' declares ${declared}, above the server ceiling ${this.#ceiling}`, { code: "DENY_CLASSIFICATION_CEILING" });
    }

    const client = this.#clients.get(upstreamId);
    if (!client || client.state !== "ready") {
      if (!audit("DENY_UPSTREAM_UNAVAILABLE", { state: client?.state ?? "absent" })) return denyUnaudited();
      return rpcError(id, -32000, `Upstream '${upstreamId}' is not available`, { code: "DENY_UPSTREAM_UNAVAILABLE" });
    }

    const slot = this.#acquire(upstreamId);
    if (!slot.ok) {
      if (!audit("DENY_UPSTREAM_SATURATED", { max_concurrency: this.#limitFor(upstreamId, "max_concurrency") })) return denyUnaudited();
      return rpcError(id, -32000, `Upstream '${upstreamId}' is saturated`, { code: "DENY_UPSTREAM_SATURATED" });
    }

    let payload;
    try {
      if (slot.wait) await slot.wait;
      payload = await client.callTool(toolName, args);
    } catch (error) {
      if (!audit("DENY_UPSTREAM_ERROR", { reason: error.code ?? "unknown" })) return denyUnaudited();
      return rpcError(id, -32000, `Upstream call failed: ${error.code ?? error.name}`, { code: error.code ?? "DENY_UPSTREAM_ERROR" });
    } finally {
      slot.release();
    }

    // Size is checked here, after the call, because that is where the reply
    // first becomes text bound for a model context. Refusing an oversized reply
    // is a context-integrity control, not a memory one.
    const maxBytes = this.#limitFor(upstreamId, "max_response_bytes");
    const size = Buffer.byteLength(JSON.stringify(payload ?? null), "utf8");
    if (size > maxBytes) {
      if (!audit("DENY_UPSTREAM_RESPONSE_TOO_LARGE", { size, max_response_bytes: maxBytes })) return denyUnaudited();
      return rpcError(id, -32000, `Upstream '${upstreamId}' returned ${size} bytes, above the ${maxBytes}-byte cap`, { code: "DENY_UPSTREAM_RESPONSE_TOO_LARGE" });
    }

    if (!audit("ALLOW", { size })) return denyUnaudited();
    // Upstream output is foreign data crossing into the organism; it carries the
    // same data_untrusted marking as every native projection.
    return rpcResult(id, { ...DATA_UNTRUSTED, tool: message.params.name, upstream: upstreamId, data: payload });
  }
}
