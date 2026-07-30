# MCP revision 2026-07-28 — verified specification research

**Document ID:** SECB-RESEARCH-MCP-2026-07-28-001
**Version:** 1
**Status:** `DRAFT / NOT EFFECTIVE`
**Owner:** producer (Claude), pending independent REV
**Last updated:** 2026-07-30
**Supports:** `wp_secb_mcp_hardening_real_use_001` Phase 3 items C1, C2, C3

## Why this document exists

`wp_secb_mcp_hardening_real_use_001` states Phase 3 in five summary lines under
`evidence_base.verified_external`. Those lines are accurate — every claim in
them was re-verified at source for this record — but they are not sufficient to
implement against: they name the changes without giving the wire shapes. Writing
a protocol handler from a summary produces an implementation whose correctness
cannot be checked against anything, which is worse than the current honest
refusal, because a wrong protocol fails silently against real clients.

This record captures the retrieved specification text so C1–C3 can be
implemented and reviewed against a fixed reference.

## Provenance

Retrieved 2026-07-30 from the official specification site. Each section below
names the page it came from.

- <https://modelcontextprotocol.io/specification/versioning>
- <https://modelcontextprotocol.io/specification/2026-07-28/server/discover>
- <https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning>
- <https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio>
- <https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/caching>

Not retrieved, and therefore not relied on here: the machine-readable schema
page, the Streamable HTTP transport binding (SecB is stdio-only), the MRTR and
subscriptions patterns, and the extensions registry.

## 1. Era model (normative)

From `basic/versioning`. The specification's own terms:

- **Modern** — versions carrying version, identity, and capabilities as
  per-request metadata: `2026-07-28` and later.
- **Legacy** — versions establishing a session with an `initialize` handshake:
  `2025-11-25` and earlier.
- **Dual-era** — an implementation supporting both.

`2026-07-28` is the **current** revision. SecB pins `2025-06-18`, which is
legacy.

There is no negotiation handshake in the modern era. Every request declares its
version and **the server accepts or rejects each request independently**.

## 2. `server/discover` (normative)

From `server/discover`. Servers **MUST** implement it.

Request — no body parameters beyond `_meta`:

```json
{
  "jsonrpc": "2.0",
  "id": "discover-1",
  "method": "server/discover",
  "params": {
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": { "name": "ExampleClient", "version": "1.0.0" },
      "io.modelcontextprotocol/clientCapabilities": {}
    }
  }
}
```

Response:

```json
{
  "jsonrpc": "2.0",
  "id": "discover-1",
  "result": {
    "resultType": "complete",
    "supportedVersions": ["2026-07-28"],
    "capabilities": { "tools": {}, "resources": {} },
    "_meta": {
      "io.modelcontextprotocol/serverInfo": { "name": "ExampleServer", "version": "1.0.0" }
    },
    "instructions": "This server provides weather and resource utilities.",
    "ttlMs": 3600000,
    "cacheScope": "public"
  }
}
```

`serverInfo` is self-reported and unverified by the protocol; the spec states
clients **SHOULD NOT** rely on it for security decisions. That cuts both ways
for SecB: SecB must not trust an upstream's `serverInfo` either.

## 3. Version negotiation and `UnsupportedProtocolVersionError` (normative)

From `basic/versioning`. A server that does not implement a requested version
**MUST** respond with error code **`-32022`**:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32022,
    "message": "Unsupported protocol version",
    "data": { "supported": ["2026-07-28", "2025-11-25"], "requested": "1900-01-01" }
  }
}
```

## 4. Dual-era server behaviour (normative)

From `basic/versioning`. A dual-era server selects behaviour from how the client
opens:

- A request carrying modern per-request `_meta` is served **statelessly**
  according to `2026-07-28`.
- An `initialize` request selects **legacy** semantics, scoped to the stdio
  process.

A dual-era server **MAY** serve both eras concurrently in the same process.

The compatibility matrix gives the outcome that matters for C1's acceptance:

| Client   | Server   | Outcome |
| -------- | -------- | ------- |
| Modern   | Legacy   | **Fails** |
| Legacy   | Modern   | **Fails** |
| Dual-era | Legacy   | Works — probe fails, client falls back to `initialize` |
| Legacy   | Dual-era | Works — server answers `initialize` |
| Modern   | Dual-era | Works |

## 5. stdio backward compatibility (normative)

From `basic/transports/stdio`. A dual-era **client** probes with
`server/discover` and interprets three outcomes:

1. `DiscoverResult` → server is modern.
2. A recognized modern error such as `UnsupportedProtocolVersionError` → server
   is modern but does not support that version. Do **not** fall back.
3. **Any other error, or no response within a reasonable timeout** → server is
   legacy. Fall back to `initialize`.

The fallback **MUST NOT** be keyed to one specific error code, because legacy
servers answer unknown pre-`initialize` methods with implementation-defined
errors, "commonly `-32601` or `-32602`", or not at all.

The spec then names the hazard this record's section 7 shows SecB exhibits:

> some legacy servers do not validate that a request arrives after `initialize`
> and would process an era-ambiguous method (such as `tools/call`) under legacy
> semantics. Probing yields a deterministic failure instead.

## 6. Caching, for C2 (normative)

From `server/utilities/caching`. Servers **MUST** include caching hints on
`resultType: "complete"` results from `server/discover`, `tools/list`,
`prompts/list`, `resources/list`, `resources/templates/list`, and
`resources/read`.

- `ttlMs` — integer milliseconds, **MUST** be `>= 0`. Absent means clients
  assume `0` (immediately stale). Negative is ignored and treated as `0`.
- `cacheScope` — `"public"` or `"private"`.

The security rule that decides SecB's value:

> Servers MUST be aware that responses with a `"public"` `cacheScope` may be
> shared between callers even if the Result is coming from an authenticated
> endpoint.

`"private"` means caches **MUST NOT** be shared across authorization contexts.
Servers **MUST NOT** rely on `cacheScope` alone for access control.

For a list request, all pages **MUST** carry the same `cacheScope`.

## 7. Producer-measured: how SecB behaves today

Measured 2026-07-30 against `tools/start-secb-mcp.mjs` at `54e44bd`. These are
observations of current behaviour, not statements that any control is
implemented.

| Request | SecB response |
| --- | --- |
| `server/discover` with modern `_meta` | `-32601 Method not found: server/discover` |
| `tools/list` with modern `_meta`, **no prior `initialize`** | **`200`-equivalent success — the full tool list** |
| `initialize` with `2025-06-18` | success, `protocolVersion: "2025-06-18"` |

Two findings follow, and the second is sharper than the work package's summary.

**Finding 1 — dual-era clients are not currently broken.** SecB answers
`server/discover` with `-32601`, which per section 5 outcome 3 is exactly what
tells a probing dual-era client "this server is legacy". The client falls back
to `initialize`, which SecB serves. The work-package line "SecB answers -32601
for server/discover" is accurate but reads as a defect; for dual-era clients it
is the behaviour that makes fallback work.

**Finding 2 — SecB is the hazard the spec names, and this is the real gap.**
SecB served `tools/list` carrying `io.modelcontextprotocol/protocolVersion:
"2026-07-28"` with no prior `initialize` and no error. The client believed it
was speaking `2026-07-28`; SecB believed it was speaking `2025-06-18`; neither
learned otherwise. SecB's `initialize` handler *does* validate `protocolVersion`
strictly and rejects unknown values with `-32602`, but that validation is
bypassed entirely by any request that skips the handshake, because handshake
ordering is not enforced.

A **modern-only** client therefore does not fail cleanly against SecB — it is
served under mismatched semantics. Silent mismatch is worse than the clean
failure the compatibility matrix predicts.

## 8. Implications for C1, C2, C3

Recommendations, not decisions. C1–C3 remain `DRAFT` work-package items and this
record authorizes nothing.

**C1.** The acceptance "a 2026-07-28 client and a 2025-06-18 client both work
against the same server" is met by becoming a dual-era server: implement
`server/discover`, read `_meta.io.modelcontextprotocol/protocolVersion` per
request, answer `-32022` with a `supported` list for versions SecB does not
implement, and keep the existing `initialize` path for legacy clients. Finding 2
argues the ordering-enforcement half is the urgent part and is worth doing even
if full modern support is deferred: today SecB cannot tell the two eras apart.

**C2.** `tools/list` is the cacheable result SecB actually serves. Its listing
is currently identical for every caller — the frozen native catalog plus the
upstream tools, with no per-caller filtering — so `"public"` would be truthful
today. It would stop being truthful the moment U3's `tools_allow`/`tools_deny`
becomes per-caller rather than per-upstream, at which point the spec's shared-
cache rule turns a stale `"public"` into cross-caller tool-visibility leakage.
Whichever value is chosen should be derived from whether the listing varies,
not fixed as a constant.

**C3.** Not researched here. Deciding whether governance reads become MCP
resources needs the `resources/*` pages, which were not retrieved.

## Open questions for REV

1. Does SecB adopt modern era at all, or only enforce handshake ordering so that
   modern-only clients fail deterministically (matrix row "Modern + Legacy")?
2. If SecB stays legacy-only, the spec's guidance is that a modern-only server
   SHOULD name its supported versions in errors to `initialize`. The inverse —
   what a legacy-only server should say to a modern request — is not specified,
   so SecB would be choosing its own diagnostic.
3. `2025-06-18` is two revisions behind `2026-07-28`. Whether to also add
   `2025-11-25` is a separate decision this record does not address.
