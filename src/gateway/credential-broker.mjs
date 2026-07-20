// SECB-MCP-P0-001 candidate credential broker core (rule N-3: credential-handle
// resolution, no token passthrough).
//
// Pure in-process core managing OPAQUE HANDLES only. The broker never accepts,
// stores, or returns plaintext secret material: bindings carry sealed
// references minted by an injected Sealer ({ seal(materialRef), isSealedRef(x) },
// e.g. a reference into an OS-protected store), and any value the injected
// sealer does not recognize as a sealed reference — or that looks like raw
// secret material — is rejected fail-closed.
//
// ANTI-PASSTHROUGH BOUNDARY (do not weaken): resolveForAdapter() output is for
// adapter PROCESS CONSTRUCTION only, performed by the operator-authorized
// deployment step. It must never appear in any code path reachable from
// McpGatewayCore.invoke() results, adapter results, receipts, evidence
// envelopes, or ledger entries. The gateway and its adapters see credential
// handles at most — never sealed references, never secret material.
//
// Audit-first: every attempted action (allowed or denied) is written to the
// injected append-only ledger BEFORE taking effect; a throwing writer denies.
// Ledger entries never contain sealed references.
//
// SEALER TRUST BOUNDARY (A-FIND-3, do not weaken): isSealedRef is the PRIMARY
// control and the SECRET_MATERIAL screen below is only a defense-in-depth
// backstop against a misbehaving sealer. The production sealer's isSealedRef
// MUST be UNFORGEABLE — an identity check that only the sealer can satisfy
// (e.g. a WeakSet of refs it minted), NOT a structural shape test. A shape-only
// isSealedRef is forgeable: an attacker can hand-craft an object of the right
// shape wrapping raw secret material, and the string-only backstop here does
// not run on objects. Injecting a shape-only sealer is a deployment defect.

import { REQUIRED_CONTEXT_FIELDS } from "./mcp-gateway-core.mjs";

const isBlank = (value) => typeof value !== "string" || value.trim() === "";

// Mirrors the gateway's secret-material screen: even a misbehaving injected
// sealer cannot cause the broker to accept plaintext-looking material. Includes
// the AWS access-key id (AKIA + 16 upper-alnum), which is distinctive enough to
// screen context-free (FU-3 / A-FIND-2). The gateway additionally screens
// 40-char AWS *secret* keys, but only under aws/access-key-named fields; that
// heuristic is deliberately NOT mirrored here because bind() sees a single
// context-free string (no field name), and a blanket 40-char match would reject
// legitimate 40-char base64 sealed refs.
const SECRET_MATERIAL = /(?:\bbearer\s+[a-z0-9._~+\/-]{8,}|\b(?:sk|ghp|github_pat|xox[baprs])[-_][-a-z0-9_]{8,}|\bAKIA[0-9A-Z]{16}\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/i;

function hardenedRecord(entries) {
  const output = Object.create(null);
  for (const [key, value] of entries) {
    Object.defineProperty(output, key, {
      value,
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  return Object.freeze(output);
}

const deny = (code) => hardenedRecord([
  ["ok", false],
  ["deny_code", code],
  ["message", "request denied"],
]);

function normalizeAttemptedAt(value) {
  try {
    const epochMs = Date.prototype.getTime.call(value);
    if (!Number.isFinite(epochMs)) return null;
    return new Date(epochMs).toISOString();
  } catch {
    return null;
  }
}

function safeRead(source, field) {
  try {
    return { ok: true, value: source?.[field] };
  } catch {
    return { ok: false, value: undefined };
  }
}

export class CredentialBroker {
  #sealer;
  #registryResolver;
  #ledgerWriter;
  #now;
  #handles = new Map();
  #nextSequence = 1;

  constructor({ sealer, registryResolver, ledgerWriter, now = () => new Date() } = {}) {
    if (
      sealer === null
      || typeof sealer !== "object"
      || typeof sealer.seal !== "function"
      || typeof sealer.isSealedRef !== "function"
    ) {
      throw new Error("CredentialBroker requires a Sealer { seal, isSealedRef } (no plaintext secret material)");
    }
    if (typeof registryResolver !== "function") {
      throw new Error("CredentialBroker requires a registryResolver function (PROMOTED capability gate)");
    }
    if (typeof ledgerWriter !== "function") {
      throw new Error("CredentialBroker requires an append-only ledgerWriter function (fail-closed audit)");
    }
    if (typeof now !== "function") throw new Error("now must be a function");
    this.#sealer = sealer;
    this.#registryResolver = registryResolver;
    this.#ledgerWriter = ledgerWriter;
    this.#now = now;
  }

  // Ledger entries deliberately exclude sealed references and any request
  // params: handle identity and dispositions only.
  #audit(event, disposition, fields) {
    try {
      this.#ledgerWriter(hardenedRecord([
        ["sequence", this.#nextSequence++],
        ["attempted_at", fields.attempted_at ?? null],
        ["component", "credential-broker"],
        ["event", event],
        ["disposition", disposition],
        ["handle_id", fields.handle_id ?? null],
        ["capability_id", fields.capability_id ?? null],
        ["adapter_id", fields.adapter_id ?? null],
        ["agent_id", fields.agent_id ?? null],
        ["session_id", fields.session_id ?? null],
      ]));
      return true;
    } catch {
      return false;
    }
  }

  #denyAudited(event, code, fields) {
    if (!this.#audit(event, code, fields)) return deny("DENY_AUDIT_UNAVAILABLE");
    return deny(code);
  }

  #attemptedAt() {
    try {
      return normalizeAttemptedAt(this.#now());
    } catch {
      return null;
    }
  }

  #isSealedRef(candidate) {
    try {
      return this.#sealer.isSealedRef(candidate) === true;
    } catch {
      return false;
    }
  }

  mint(handleSpec) {
    const attemptedAt = this.#attemptedAt();
    const handleId = safeRead(handleSpec, "handle_id");
    const capabilityId = safeRead(handleSpec, "capability_id");
    const scopeNote = safeRead(handleSpec, "scope_note");
    const fields = {
      attempted_at: attemptedAt,
      handle_id: handleId.ok && !isBlank(handleId.value) ? handleId.value : null,
      capability_id: capabilityId.ok && !isBlank(capabilityId.value) ? capabilityId.value : null,
    };
    if (attemptedAt === null) return this.#denyAudited("MINT", "DENY_CLOCK_UNAVAILABLE", fields);
    if (fields.handle_id === null || fields.capability_id === null || !scopeNote.ok || isBlank(scopeNote.value)) {
      return this.#denyAudited("MINT", "DENY_HANDLE_SPEC_INVALID", fields);
    }
    if (this.#handles.has(fields.handle_id)) {
      return this.#denyAudited("MINT", "DENY_HANDLE_EXISTS", fields);
    }
    if (!this.#audit("MINT", "ALLOW", fields)) return deny("DENY_AUDIT_UNAVAILABLE");
    this.#handles.set(fields.handle_id, {
      capability_id: fields.capability_id,
      scope_note: scopeNote.value,
      sealed_ref: null,
    });
    return hardenedRecord([
      ["ok", true],
      ["handle_id", fields.handle_id],
      ["capability_id", fields.capability_id],
      ["bound", false],
    ]);
  }

  bind(handleId, sealedRef) {
    const attemptedAt = this.#attemptedAt();
    const handle = isBlank(handleId) ? undefined : this.#handles.get(handleId);
    const fields = {
      attempted_at: attemptedAt,
      handle_id: isBlank(handleId) ? null : handleId,
      capability_id: handle?.capability_id ?? null,
    };
    if (attemptedAt === null) return this.#denyAudited("BIND", "DENY_CLOCK_UNAVAILABLE", fields);
    if (!handle) return this.#denyAudited("BIND", "DENY_HANDLE_UNKNOWN", fields);
    if (handle.sealed_ref !== null) return this.#denyAudited("BIND", "DENY_HANDLE_ALREADY_BOUND", fields);
    if (typeof sealedRef === "string" && SECRET_MATERIAL.test(sealedRef)) {
      return this.#denyAudited("BIND", "DENY_SEALER_INVALID", fields);
    }
    if (!this.#isSealedRef(sealedRef)) {
      return this.#denyAudited("BIND", "DENY_SEALER_INVALID", fields);
    }
    if (!this.#audit("BIND", "ALLOW", fields)) return deny("DENY_AUDIT_UNAVAILABLE");
    handle.sealed_ref = sealedRef;
    return hardenedRecord([
      ["ok", true],
      ["handle_id", fields.handle_id],
      ["capability_id", handle.capability_id],
      ["bound", true],
    ]);
  }

  // Returns the sealed reference for adapter process construction only (see
  // the anti-passthrough boundary in the file header). Requires: the full
  // gateway request-context check (REQUIRED_CONTEXT_FIELDS plus
  // evidence_required === true, and a capability_id that matches the handle),
  // a PROMOTED capability in the injected registry resolver, and an adapter_id
  // matching the promoted record.
  resolveForAdapter(handleId, adapterId, requestContext) {
    const attemptedAt = this.#attemptedAt();
    const handle = isBlank(handleId) ? undefined : this.#handles.get(handleId);
    const agentId = safeRead(requestContext, "agent_id");
    const sessionId = safeRead(requestContext, "session_id");
    const fields = {
      attempted_at: attemptedAt,
      handle_id: isBlank(handleId) ? null : handleId,
      capability_id: handle?.capability_id ?? null,
      adapter_id: isBlank(adapterId) ? null : adapterId,
      agent_id: agentId.ok && !isBlank(agentId.value) ? agentId.value : null,
      session_id: sessionId.ok && !isBlank(sessionId.value) ? sessionId.value : null,
    };
    if (attemptedAt === null) return this.#denyAudited("RESOLVE_FOR_ADAPTER", "DENY_CLOCK_UNAVAILABLE", fields);

    for (const field of REQUIRED_CONTEXT_FIELDS) {
      const observed = safeRead(requestContext, field);
      if (!observed.ok || isBlank(observed.value)) {
        return this.#denyAudited("RESOLVE_FOR_ADAPTER", "DENY_CONTEXT", fields);
      }
    }
    const evidenceRequired = safeRead(requestContext, "evidence_required");
    if (!evidenceRequired.ok || evidenceRequired.value !== true) {
      return this.#denyAudited("RESOLVE_FOR_ADAPTER", "DENY_CONTEXT", fields);
    }

    if (!handle) return this.#denyAudited("RESOLVE_FOR_ADAPTER", "DENY_HANDLE_UNKNOWN", fields);
    if (handle.sealed_ref === null) {
      return this.#denyAudited("RESOLVE_FOR_ADAPTER", "DENY_HANDLE_UNBOUND", fields);
    }
    if (requestContext.capability_id !== handle.capability_id) {
      return this.#denyAudited("RESOLVE_FOR_ADAPTER", "DENY_CONTEXT", fields);
    }

    let resolution;
    try {
      resolution = this.#registryResolver(handle.capability_id);
    } catch {
      resolution = null;
    }
    const record = resolution?.ok === true ? resolution.record : null;
    if (!record || record.status !== "PROMOTED") {
      return this.#denyAudited("RESOLVE_FOR_ADAPTER", "DENY_CAPABILITY_NOT_PROMOTED", fields);
    }
    if (fields.adapter_id === null || record.adapter_id !== fields.adapter_id) {
      return this.#denyAudited("RESOLVE_FOR_ADAPTER", "DENY_ADAPTER_MISMATCH", fields);
    }
    if (!this.#isSealedRef(handle.sealed_ref)) {
      return this.#denyAudited("RESOLVE_FOR_ADAPTER", "DENY_SEALER_INVALID", fields);
    }

    if (!this.#audit("RESOLVE_FOR_ADAPTER", "ALLOW", fields)) return deny("DENY_AUDIT_UNAVAILABLE");
    return hardenedRecord([
      ["ok", true],
      ["handle_id", fields.handle_id],
      ["capability_id", handle.capability_id],
      ["adapter_id", fields.adapter_id],
      ["sealed_ref", handle.sealed_ref],
    ]);
  }
}
