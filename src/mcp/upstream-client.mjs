/**
 * SecB MCP upstream client — one child process, one stdio JSON-RPC peer.
 *
 * BOUNDARY: this is the first module in src/mcp that spawns a process. Every
 * layer beneath it (upstream-registry, mcp-gateway-core, secb-mcp-server) is
 * pure by construction; activation was always meant to be a separate,
 * operator-authorized step, and this is that step. Nothing here decides WHETHER
 * an upstream may run — it receives an already-resolved plan and runs it.
 *
 * The client is deliberately dumb about policy: namespacing, classification
 * ceilings, and audit live in upstream-proxy.mjs. A client that also enforced
 * policy would be a second place for policy to drift.
 */

import { spawn as nodeSpawn } from "node:child_process";

export const DEFAULT_UPSTREAM_PROTOCOL_VERSION = "2024-11-05";
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export class UpstreamClientError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "UpstreamClientError";
    this.code = code;
  }
}

const STATES = Object.freeze({
  IDLE: "idle",
  STARTING: "starting",
  READY: "ready",
  FAILED: "failed",
  CLOSED: "closed"
});

/**
 * Ceiling on a single unterminated stdout line.
 *
 * The framing buffer was unbounded and never reset, so an upstream that simply
 * never emits a newline grew it without limit: measured ~2.5 GB of heap at
 * 500 MB of input, then a RangeError thrown out of the 'data' handler that took
 * the whole hub down. No response ceiling, timeout, or concurrency cap
 * intervened, because none of them are on this path — the reply never became a
 * message. 8 MiB matches the registry's max_response_bytes maximum, so a line
 * that could never be an acceptable response is refused before it is buffered.
 */
/**
 * Variables a spawned upstream is allowed to inherit from this process.
 *
 * Children previously received the FULL parent environment. A probe upstream
 * could therefore read SECB_MCP_UPSTREAMS_AUTHORIZED and
 * SECB_MCP_DEPLOYMENT_AUTHORIZED — the operator activation flags — along with
 * the caller instance and the path of every audit ledger. Sixteen third-party
 * servers learning where the audit trail lives is not a theoretical concern.
 *
 * The allowlist is what a process genuinely needs to execute: PATH to find its
 * interpreter, HOME and the XDG/APPDATA paths that npx and uvx use for their
 * package caches, TMPDIR, and locale/terminal settings. Anything an upstream
 * actually requires is declared per-entry in the registry's `env` field, which
 * is the reviewable place for it.
 */
export const INHERITED_ENV_KEYS = Object.freeze([
  "PATH", "Path", "HOME", "USERPROFILE", "SHELL", "LANG", "LC_ALL", "TZ",
  "TMPDIR", "TEMP", "TMP", "XDG_CACHE_HOME", "XDG_DATA_HOME", "XDG_CONFIG_HOME",
  "APPDATA", "LOCALAPPDATA", "SYSTEMROOT", "windir", "COMSPEC", "PATHEXT",
  "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR"
]);

export function scopedChildEnv(declared = {}, source = process.env) {
  const env = {};
  for (const key of INHERITED_ENV_KEYS) {
    if (typeof source[key] === "string") env[key] = source[key];
  }
  // Registry-declared values win, and are the only non-allowlisted keys that
  // ever reach a child.
  return { ...env, ...declared };
}

export const DEFAULT_MAX_LINE_BYTES = 8 * 1024 * 1024;

export class UpstreamClient {
  #plan;
  #timeoutMs;
  #protocolVersion;
  #spawn;
  #child = null;
  #pending = new Map();
  #nextId = 1;
  #buffer = "";
  #maxLineBytes;
  #state = STATES.IDLE;
  #failure = null;
  #stderr = "";

  constructor({ plan, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, protocolVersion = DEFAULT_UPSTREAM_PROTOCOL_VERSION, spawn = nodeSpawn, maxLineBytes = DEFAULT_MAX_LINE_BYTES } = {}) {
    if (!plan || typeof plan.id !== "string" || plan.id.trim() === "") {
      throw new UpstreamClientError("DENY_UPSTREAM_PLAN", "UpstreamClient requires a resolved plan carrying an id");
    }
    if (plan.reachable !== true) {
      throw new UpstreamClientError("DENY_UPSTREAM_UNREACHABLE", `Upstream '${plan.id}' resolved unreachable: ${plan.reason ?? "unknown"}`);
    }
    if (plan.transport !== "stdio") {
      // sse/http upstreams are declared in the registry and resolve fine, but
      // fronting them needs an HTTP client, not a child process. Refusing here
      // is better than silently treating a url as a command.
      throw new UpstreamClientError("DENY_UPSTREAM_TRANSPORT", `UpstreamClient handles stdio only; '${plan.id}' is ${plan.transport}`);
    }
    this.#plan = plan;
    this.#timeoutMs = timeoutMs;
    this.#protocolVersion = protocolVersion;
    this.#spawn = spawn;
    this.#maxLineBytes = maxLineBytes;
  }

  get id() {
    return this.#plan.id;
  }

  get state() {
    return this.#state;
  }

  get failure() {
    return this.#failure;
  }

  async start() {
    if (this.#state !== STATES.IDLE) {
      throw new UpstreamClientError("DENY_UPSTREAM_STATE", `Upstream '${this.id}' cannot start from state '${this.#state}'`);
    }
    this.#state = STATES.STARTING;
    try {
      this.#child = this.#spawn(this.#plan.command, this.#plan.args ?? [], {
        stdio: ["pipe", "pipe", "pipe"],
        env: scopedChildEnv(this.#plan.env)
      });
    } catch (error) {
      return this.#fail("DENY_UPSTREAM_SPAWN", `Spawn failed: ${error.code ?? error.message}`);
    }

    this.#child.on("error", (error) => {
      this.#fail("DENY_UPSTREAM_SPAWN", `Spawn failed: ${error.code ?? error.message}`);
    });
    this.#child.stdout?.setEncoding("utf8");
    this.#child.stdout?.on("data", (chunk) => this.#onStdout(chunk));
    this.#child.stderr?.setEncoding("utf8");
    this.#child.stderr?.on("data", (chunk) => {
      // Bounded: a chatty upstream must not grow this without limit.
      this.#stderr = (this.#stderr + chunk).slice(-4096);
    });
    this.#child.on("exit", (code, signal) => {
      if (this.#state === STATES.CLOSED) return;
      this.#fail("DENY_UPSTREAM_EXIT", `Upstream exited (code=${code}, signal=${signal})${this.#stderr ? `: ${this.#stderr.trim().slice(-500)}` : ""}`);
    });

    const result = await this.#request("initialize", {
      protocolVersion: this.#protocolVersion,
      capabilities: {},
      clientInfo: { name: "secb-mcp-proxy", version: "0.1.0-alpha" }
    });
    this.#notify("notifications/initialized");
    this.#state = STATES.READY;
    return { id: this.id, protocolVersion: result?.protocolVersion ?? null, serverInfo: result?.serverInfo ?? null };
  }

  async listTools() {
    this.#assertReady();
    const result = await this.#request("tools/list", {});
    const tools = Array.isArray(result?.tools) ? result.tools : [];
    return tools.map((tool) => ({
      name: String(tool?.name ?? ""),
      description: typeof tool?.description === "string" ? tool.description : "",
      inputSchema: tool?.inputSchema ?? undefined
    })).filter((tool) => tool.name !== "");
  }

  async callTool(name, args = {}) {
    this.#assertReady();
    return this.#request("tools/call", { name, arguments: args });
  }

  /**
   * Stop the child, escalating if it ignores the polite request.
   *
   * SIGTERM alone is a request, not a guarantee: an upstream that traps it, or
   * one wedged in a syscall, simply stays alive, and because it holds our pipes
   * the hub cannot exit either. Work-package item U5. graceMs 0 skips straight
   * to SIGKILL, which is what an exit handler needs since it cannot await.
   */
  async close({ graceMs = 2000 } = {}) {
    if (this.#state === STATES.CLOSED) return;
    const previous = this.#state;
    this.#state = STATES.CLOSED;
    this.#rejectAll(new UpstreamClientError("DENY_UPSTREAM_CLOSED", `Upstream '${this.id}' was closed`));
    const child = this.#child;
    if (!child || previous === STATES.FAILED) return;
    if (child.exitCode !== null || child.signalCode !== null) return; // already reaped

    const exited = new Promise((resolveExit) => {
      child.once("exit", resolveExit);
      child.once("error", resolveExit);
    });

    try {
      child.stdin?.end();
      child.kill(graceMs > 0 ? "SIGTERM" : "SIGKILL");
    } catch {
      return; // already gone; closing is best-effort by design
    }
    if (graceMs <= 0) return;

    let timer;
    const grace = new Promise((resolveGrace) => {
      timer = setTimeout(resolveGrace, graceMs);
      timer.unref?.();
    });
    const winner = await Promise.race([exited.then(() => "exited"), grace.then(() => "timeout")]);
    clearTimeout(timer);
    if (winner === "timeout") {
      try {
        child.kill("SIGKILL");
      } catch {
        // Raced with a natural exit.
      }
    }
  }

  /**
   * Synchronous best-effort kill for process-exit handlers, where nothing may
   * be awaited. Without this an abnormal exit leaves every child running.
   */
  killNow() {
    this.#state = STATES.CLOSED;
    try {
      this.#child?.kill("SIGKILL");
    } catch {
      // Nothing to do at exit time.
    }
  }

  #assertReady() {
    if (this.#state !== STATES.READY) {
      throw new UpstreamClientError("DENY_UPSTREAM_STATE", `Upstream '${this.id}' is '${this.#state}', not ready`);
    }
  }

  #fail(code, message) {
    if (this.#state === STATES.CLOSED || this.#state === STATES.FAILED) return;
    this.#state = STATES.FAILED;
    this.#failure = { code, message };
    this.#rejectAll(new UpstreamClientError(code, `${this.id}: ${message}`));
  }

  #rejectAll(error) {
    for (const [, entry] of this.#pending) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.#pending.clear();
  }

  #onStdout(chunk) {
    this.#buffer += chunk;
    // Refuse before buffering more: without a newline there is no message to
    // parse, so an unterminated stream is not slow data, it is unbounded growth.
    if (Buffer.byteLength(this.#buffer, "utf8") > this.#maxLineBytes && !this.#buffer.includes("\n")) {
      this.#buffer = "";
      this.#fail(
        "DENY_UPSTREAM_LINE_TOO_LARGE",
        `Upstream '${this.id}' sent more than ${this.#maxLineBytes} bytes with no line terminator`
      );
      return;
    }
    let index;
    while ((index = this.#buffer.indexOf("\n")) !== -1) {
      const line = this.#buffer.slice(0, index).trim();
      this.#buffer = this.#buffer.slice(index + 1);
      if (line === "") continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        // A non-JSON line is upstream noise (banners, warnings). Ignoring it is
        // required: many servers print to stdout before speaking protocol.
        continue;
      }
      if (message?.id === undefined || message.id === null) continue; // notification
      const entry = this.#pending.get(message.id);
      if (!entry) continue;
      clearTimeout(entry.timer);
      this.#pending.delete(message.id);
      if (message.error) {
        entry.reject(new UpstreamClientError("DENY_UPSTREAM_ERROR", `${this.id}: ${message.error.message ?? "upstream error"}`));
      } else {
        entry.resolve(message.result);
      }
    }
  }

  #write(payload) {
    if (!this.#child?.stdin?.writable) {
      throw new UpstreamClientError("DENY_UPSTREAM_WRITE", `Upstream '${this.id}' stdin is not writable`);
    }
    this.#child.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  #notify(method, params) {
    try {
      this.#write({ jsonrpc: "2.0", method, ...(params ? { params } : {}) });
    } catch {
      // A failed notification is not fatal; the next request surfaces the fault.
    }
  }

  #request(method, params) {
    return new Promise((resolve, reject) => {
      if (this.#state === STATES.FAILED) {
        reject(new UpstreamClientError(this.#failure?.code ?? "DENY_UPSTREAM_STATE", `${this.id}: ${this.#failure?.message ?? "failed"}`));
        return;
      }
      const id = this.#nextId++;
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new UpstreamClientError("DENY_UPSTREAM_TIMEOUT", `${this.id}: ${method} timed out after ${this.#timeoutMs}ms`));
      }, this.#timeoutMs);
      // Never hold the event loop open on a pending upstream reply.
      timer.unref?.();
      this.#pending.set(id, { resolve, reject, timer });
      try {
        this.#write({ jsonrpc: "2.0", id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.#pending.delete(id);
        reject(error);
      }
    });
  }
}
