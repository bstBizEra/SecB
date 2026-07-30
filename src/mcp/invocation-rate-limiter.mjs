/**
 * Per-caller invocation rate limit.
 *
 * Work-package item S8. The MCP spec lists "rate limit tool invocations" as a
 * MUST for servers, and SecB is a server on both entries — the read-only one and
 * the hub — so the limit lives here rather than in either of them.
 *
 * ONE limiter instance is shared by the governed core and the upstream proxy.
 * They are separate dispatch paths (native tools resolve in the core, namespaced
 * tools in the proxy), and giving each its own counter would mean a caller could
 * spend the full budget twice while both components honestly reported enforcing
 * the limit. Sharing the instance is what makes "the limit" a single number.
 *
 * Sliding window rather than a fixed one: a fixed window lets a caller spend the
 * whole budget in the last instant of one window and again in the first instant
 * of the next, which is twice the intended rate across that boundary.
 */

export const DEFAULT_MAX_PER_WINDOW = 120;
export const DEFAULT_WINDOW_MS = 60_000;

export class InvocationRateLimiter {
  #maxPerWindow;
  #windowMs;
  #now;
  #hits = new Map();

  constructor({ maxPerWindow = DEFAULT_MAX_PER_WINDOW, windowMs = DEFAULT_WINDOW_MS, now = () => Date.now() } = {}) {
    if (!Number.isInteger(maxPerWindow) || maxPerWindow < 1) {
      throw new Error("InvocationRateLimiter requires a positive integer maxPerWindow");
    }
    if (!Number.isInteger(windowMs) || windowMs < 1) {
      throw new Error("InvocationRateLimiter requires a positive integer windowMs");
    }
    if (typeof now !== "function") throw new Error("now must be a function");
    this.#maxPerWindow = maxPerWindow;
    this.#windowMs = windowMs;
    this.#now = now;
  }

  get limit() {
    return { maxPerWindow: this.#maxPerWindow, windowMs: this.#windowMs };
  }

  /**
   * Consume one slot for a caller.
   *
   * Call this only AFTER the caller has resolved. Tracking unresolved ids would
   * let anything that can open the transport grow this map by inventing new
   * ones; keyed on resolved identities it is bounded by the registry, and each
   * entry holds at most maxPerWindow timestamps.
   *
   * Returns { allowed: true } having consumed a slot, or { allowed: false } with
   * the numbers a caller needs to back off. Nothing is consumed on a denial, so
   * a rejected caller does not push its own recovery further away.
   */
  admit(callerId) {
    const at = this.#now();
    const cutoff = at - this.#windowMs;
    const timestamps = this.#hits.get(callerId) ?? [];

    // Timestamps are appended in order, so the survivors are a suffix.
    let firstLive = 0;
    while (firstLive < timestamps.length && timestamps[firstLive] <= cutoff) firstLive += 1;
    const live = firstLive === 0 ? timestamps : timestamps.slice(firstLive);

    if (live.length >= this.#maxPerWindow) {
      // Retry when the oldest live hit falls out of the window.
      const retryAfterMs = Math.max(1, live[0] + this.#windowMs - at);
      if (live.length !== timestamps.length) this.#hits.set(callerId, live);
      return {
        allowed: false,
        observed: live.length,
        maxPerWindow: this.#maxPerWindow,
        windowMs: this.#windowMs,
        retryAfterMs
      };
    }

    live.push(at);
    this.#hits.set(callerId, live);
    return { allowed: true, observed: live.length, maxPerWindow: this.#maxPerWindow, windowMs: this.#windowMs };
  }

  /**
   * Drop callers whose window has fully emptied. Not required for correctness —
   * admit() prunes the caller it touches — but a caller that goes silent forever
   * would otherwise keep its (empty) entry for the process lifetime.
   */
  sweep() {
    const cutoff = this.#now() - this.#windowMs;
    for (const [callerId, timestamps] of this.#hits) {
      if (timestamps.length === 0 || timestamps[timestamps.length - 1] <= cutoff) this.#hits.delete(callerId);
    }
    return this.#hits.size;
  }
}
