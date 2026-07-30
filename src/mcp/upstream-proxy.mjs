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
import { canonicalFingerprint } from "../contracts/canonical-fingerprint.mjs";

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

// An upstream is foreign code and may advertise a malformed schema. Anything that
// is not an object-typed JSON Schema is replaced rather than forwarded, because
// one bad entry makes a client reject the entire merged tools/list — including
// SecB's own native tools.
const isObjectSchema = (schema) =>
  schema !== null && typeof schema === "object" && !Array.isArray(schema) && schema.type === "object";

/**
 * Fingerprint the parts of a tool definition that steer a model.
 *
 * Covers name, description, and inputSchema, because the whole schema is
 * injection surface — parameter names, enums, and defaults carry instructions
 * just as the description does. Annotations are excluded deliberately: SecB
 * overwrites them with its own verdict, so an upstream changing them is not a
 * redefinition of anything SecB forwards.
 *
 * Reuses the repository's canonicalizer so the hash is stable under key
 * reordering, rather than hashing whatever key order the upstream happened to
 * serialize.
 */
export function fingerprintToolDefinition(tool) {
  return canonicalFingerprint({
    name: tool?.name ?? null,
    description: tool?.description ?? null,
    inputSchema: tool?.inputSchema ?? null
  });
}

/**
 * Classify a fronted tool's annotations. SecB's own verdict, never the upstream's.
 *
 * An upstream-supplied `readOnlyHint: true` is trivially forgeable and is exactly
 * the value a host uses to decide whether to skip a confirmation prompt, so
 * forwarding it hands any upstream an auto-approve bypass. SecB cannot verify what
 * foreign code does, so it declines to claim read-only for ANY fronted tool: the
 * annotations here are deliberately pessimistic and match the spec's own defaults.
 *
 * This is a floor, not an analysis. It is not a substitute for the operator
 * deciding which upstreams should be fronted with write tools at all.
 */
const proxiedAnnotations = () => ({ readOnlyHint: false, destructiveHint: true, openWorldHint: true });

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
  // upstreamId -> Map<toolName, fingerprint>. Trust-on-first-use pins.
  #toolPins = new Map();
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
   * Trust-on-first-use pinning of upstream tool definitions.
   *
   * A "rug pull" is an upstream that advertises a benign tool, gets approved,
   * and later redefines it — the description is a model-instruction channel, so
   * redefining it silently re-tasks the agent. The MCP specification has no
   * normative coverage of this at all; pinning is the best-documented mitigation
   * available, and almost no gateway implements it.
   *
   * First sighting pins the fingerprint. Any later listing whose fingerprint
   * differs has that tool WITHHELD rather than advertised, and the block is
   * audited. Withholding one tool is deliberate: dropping the whole upstream
   * would let a single altered tool disable fifteen working ones.
   *
   * Scope, stated honestly: pins live for the lifetime of this process, so this
   * closes redefinition WITHIN a session. Cross-restart pinning needs a
   * persisted store and an operator re-approval path, which is not built here.
   */
  #applyToolPins(upstreamId, tools) {
    let pins = this.#toolPins.get(upstreamId);
    if (!pins) {
      pins = new Map();
      this.#toolPins.set(upstreamId, pins);
    }
    const accepted = [];
    const blocked = [];
    for (const tool of tools) {
      const name = tool?.name;
      if (typeof name !== "string" || name === "") continue;
      const fingerprint = fingerprintToolDefinition(tool);
      const pinned = pins.get(name);
      if (pinned === undefined) {
        pins.set(name, fingerprint);
        accepted.push(tool);
        continue;
      }
      if (pinned === fingerprint) {
        accepted.push(tool);
        continue;
      }
      blocked.push(name);
      // Audited, not silent: a redefinition attempt is exactly the event an
      // operator needs to see, and the pin is deliberately NOT updated.
      try {
        this.#invocationLog({
          type: "MCP_UPSTREAM_INVOCATION",
          upstream: upstreamId,
          tool: name,
          caller: null,
          decision: "DENY_UPSTREAM_TOOL_REDEFINED",
          timestamp: this.#now().toISOString(),
          pinned_fingerprint: pinned,
          observed_fingerprint: fingerprint
        });
      } catch {
        // The tool stays blocked regardless. An unrecordable block is still a
        // block: failing to log must never be a reason to admit the tool.
      }
    }
    return { accepted, blocked };
  }

  /**
   * Record a listing decision. Spawning a child and enumerating its tools were
   * the two calls SecB itself made that produced no ledger row at all, so
   * "every upstream call passes the same audit ledger" was not true of them.
   */
  #logListing(upstreamId, decision, extra = {}) {
    try {
      this.#invocationLog({
        type: "MCP_UPSTREAM_LISTING",
        upstream: upstreamId,
        tool: null,
        caller: null,
        decision,
        timestamp: this.#now().toISOString(),
        ...extra
      });
    } catch {
      // A listing that cannot be recorded is still governed by its ceiling
      // above; the tools were already accepted or refused on their own merits.
    }
  }

  /** Current pins, for operator inspection. Copied so callers cannot mutate them. */
  toolPins() {
    return new Map([...this.#toolPins].map(([id, pins]) => [id, new Map(pins)]));
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
        // The listing path had no ceiling and no audit, so an upstream
        // advertising 400 tools with 10 KB descriptions produced a ~4 MB merged
        // listing against a 1 KB response cap — the exact context-flooding
        // channel max_response_bytes exists to close, left open on the one path
        // whose output is injected into EVERY subsequent request.
        const listingBytes = Buffer.byteLength(JSON.stringify(tools ?? []), "utf8");
        const listingCap = this.#limitFor(id, "max_response_bytes");
        if (listingBytes > listingCap) {
          this.#logListing(id, "DENY_UPSTREAM_LISTING_TOO_LARGE", { size: listingBytes, max_response_bytes: listingCap });
          results.push({ id, ok: false, reason: "DENY_UPSTREAM_LISTING_TOO_LARGE" });
          continue;
        }
        const { accepted, blocked } = this.#applyToolPins(id, tools);
        this.#logListing(id, "ALLOW_UPSTREAM_LISTING", { size: listingBytes, advertised: accepted.length, blocked: blocked.length });
        this.#toolsByUpstream.set(id, accepted);
        results.push({ id, ok: true, count: accepted.length, ...(blocked.length > 0 ? { blocked } : {}) });
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
            // prefixed so a reader can always see whose text this is. An
            // upstream may omit a description, so it is coalesced rather than
            // interpolated blind, which produced the literal text "undefined".
            description: `[upstream:${upstreamId}] ${tool.description ?? "(no description provided by upstream)"}`,
            // inputSchema is REQUIRED on every advertised tool: the official
            // client SDK rejects an entire tools/list that omits it, so dropping
            // the upstream's schema here hid every native tool too. The upstream
            // client already preserves it; fall back to an open object schema if
            // a non-conformant upstream sent none.
            inputSchema: isObjectSchema(tool.inputSchema) ? tool.inputSchema : { type: "object", properties: {} },
            // Deliberately NOT tool.annotations — see proxiedAnnotations().
            annotations: proxiedAnnotations()
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

    // Upstream output is foreign data crossing into the organism; it carries the
    // same data_untrusted marking as every native projection.
    //
    // An upstream already returns a spec-shaped CallToolResult. Burying it whole
    // under `data` left the OUTER result with no `content`, which the client SDK
    // defaults to [] — so a proxied call succeeded while delivering nothing. The
    // upstream's own content/structuredContent/isError are therefore surfaced at
    // the top level, and `data` retains the untouched reply.
    let serialisedPayload;
    try {
      serialisedPayload = JSON.stringify(payload ?? null);
    } catch (error) {
      // JSON.parse is iterative but JSON.stringify recurses, so a deeply nested
      // upstream reply parses and then throws RangeError here. Unguarded, that
      // escaped the proxy and killed the whole hub — one upstream taking down
      // the other fifteen and the native tool surface with them.
      if (!audit("DENY_UPSTREAM_UNSERIALISABLE", { reason: error.name })) return denyUnaudited();
      return rpcError(id, -32000, `Upstream '${upstreamId}' returned a reply that cannot be serialised (${error.name})`, { code: "DENY_UPSTREAM_UNSERIALISABLE" });
    }

    const result = {
      content: Array.isArray(payload?.content) ? payload.content : [{ type: "text", text: serialisedPayload }],
      ...(payload?.structuredContent !== undefined ? { structuredContent: payload.structuredContent } : {}),
      ...(payload?.isError !== undefined ? { isError: payload.isError } : {}),
      ...DATA_UNTRUSTED,
      tool: message.params.name,
      upstream: upstreamId,
      data: payload
    };

    // The ceiling measures the bytes actually EMITTED, not the raw payload.
    // Measuring the payload alone under-counted: the result carries it in both
    // `content` and `data`, so a ~2x larger response than the declared cap
    // reached the client — a context-integrity control silently off by half.
    const maxBytes = this.#limitFor(upstreamId, "max_response_bytes");
    let size;
    try {
      size = Buffer.byteLength(JSON.stringify(result), "utf8");
    } catch (error) {
      if (!audit("DENY_UPSTREAM_UNSERIALISABLE", { reason: error.name })) return denyUnaudited();
      return rpcError(id, -32000, `Upstream '${upstreamId}' reply could not be measured (${error.name})`, { code: "DENY_UPSTREAM_UNSERIALISABLE" });
    }
    if (size > maxBytes) {
      if (!audit("DENY_UPSTREAM_RESPONSE_TOO_LARGE", { size, max_response_bytes: maxBytes })) return denyUnaudited();
      return rpcError(id, -32000, `Upstream '${upstreamId}' returned ${size} bytes, above the ${maxBytes}-byte cap`, { code: "DENY_UPSTREAM_RESPONSE_TOO_LARGE" });
    }

    if (!audit("ALLOW", { size })) return denyUnaudited();
    return rpcResult(id, result);
  }
}
