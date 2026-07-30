# MCP revision 2026-07-28 — verified specification research

**Document ID:** SECB-RESEARCH-MCP-2026-07-28-001
**Version:** 2
**Status:** `DRAFT / NOT EFFECTIVE`
**Owner:** producer (Claude), pending independent REV
**Last updated:** 2026-07-30
**Supports:** `wp_secb_mcp_hardening_real_use_001` Phase 3 items C1, C2, C3

**Change log**

- v1 — sections 1–8: retrieved specification text for C1 and C2, and
  producer-measured observations of SecB's behaviour at `54e44bd`.
- v2 — section 9 added: the C3 evaluation, from the `server/resources` page.
  Section 7's observations annotated as superseded by `8e6e792`.

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
observations of behaviour at that commit, not statements that any control is
implemented.

> **Superseded as a description of current behaviour.** Commit `8e6e792` changed
> all three rows below. That commit is producer work and has not been through
> independent REV, QA, SEC, or GOV, so this note records that a change was made
> and does not assert that it is correct, conformant, or accepted. The findings
> are retained because they are what motivated the change and are the thing a
> reviewer needs in order to judge it.

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

**C3.** Researched in section 9 below. The recommendation is **do not adopt
resources for governance reads while SecB is dual-era**, because the premise
that motivates C3 does not hold in that configuration.

## Open questions for REV

1. Does SecB adopt modern era at all, or only enforce handshake ordering so that
   modern-only clients fail deterministically (matrix row "Modern + Legacy")?
2. If SecB stays legacy-only, the spec's guidance is that a modern-only server
   SHOULD name its supported versions in errors to `initialize`. The inverse —
   what a legacy-only server should say to a modern request — is not specified,
   so SecB would be choosing its own diagnostic.
3. `2025-06-18` is two revisions behind `2026-07-28`. Whether to also add
   `2025-11-25` is a separate decision this record does not address.

## 9. C3 — governance reads as resources: evaluation

Source: <https://modelcontextprotocol.io/specification/2026-07-28/server/resources>,
retrieved 2026-07-30.

C3 is an *evaluate* item. This section is that evaluation; it implements
nothing.

### 9.1 What the specification says (normative)

- Resources are **application-driven**: the host decides how to incorporate
  them. This is the property C3 is after — it moves a read off the
  model-controlled surface.
- Servers supporting resources **MUST** declare the `resources` capability.
- The `resources/list` set **MUST NOT** vary per-connection, but **MAY** vary by
  the authorization presented on the request.
- A missing resource **MUST** return `-32602`; clients **SHOULD** also accept
  `-32002` for compatibility. An empty `contents` array for a non-existent
  resource is forbidden as ambiguous.
- Servers **MUST** validate all resource URIs and **MUST** sanitize file paths
  against directory traversal. Access controls **SHOULD** be implemented and
  resource permissions **SHOULD** be checked before operations.
- `resources/list`, `resources/templates/list`, and `resources/read` are all
  cacheable and therefore carry `ttlMs` and `cacheScope`.

### 9.2 What SecB actually has (producer-measured, 2026-07-30)

Of 36 native tools, 35 are read-only and 1 mutates:

| Shape | Count | Would map to |
| --- | ---: | --- |
| Read-only, carries an id param | 15 | a resource **template**, e.g. `secb://work-package/{project_id}/{work_package_id}` |
| Read-only, takes no argument | 6 | a **singleton** resource, e.g. `secb://events` |
| Read-only, other argument shapes | 14 | poor fit — several are pure functions, not addressable state |
| Mutating | 1 | stays a tool |

The six no-argument reads include `secb_events_read`, `secb_evidence_read`, and
`secb_system_settings_inspect` — precisely the governance reads C3 names.

### 9.3 Findings against adoption

**F1 — the premise does not hold while SecB is dual-era, and this is decisive.**
C3's stated benefit is "shrinking both the model-controlled surface and the tool
list". A tool only leaves the tool list when it is *removed*. Resources are
modern-era only — SecB's legacy `initialize` path advertises `capabilities:
{tools: {}}` and legacy revisions have no resources capability negotiated
through per-request metadata. Removing a governance tool would therefore make
that read unavailable to every legacy client, which is every client working
against SecB today. Keeping both means the tool list does not shrink at all and
the total surface *grows* by a second access path to the same data. The benefit
arrives only after legacy support is dropped, which C1 deliberately did not do.

**F2 — the audit cost is larger than the work package states.** The work package
notes it "costs the per-call tool audit trail, so resources/read must be logged
too". Logging is the smaller half. `#toolsCall` currently performs, in order:
caller resolution against the runtime registry, rate-limit admission,
own-property catalog lookup, required-param and reserved-delimiter validation,
classification-ceiling capping, dispatch, and a fail-closed audit row whose
failure withholds the result. A `resources/read` path must reproduce **all** of
it. Any step omitted is a control silently dropped for exactly the reads that
are governance-relevant.

**F3 — a URI scheme reintroduces a defect class this repository has already
paid for five times.** `src/contracts/reserved-delimiters.mjs` exists because
composite-key delimiters were rediscovered as bugs five separate times
(`IMM-P009-01` `|`, the skill-registry `@`, the work-package objectId `@`, the
AuthorityEngine SoD scope key `|`). Today an id reaches dispatch as a closed,
individually validated parameter. A URI turns those ids back into a parsed
string — `secb://work-package/{project_id}/{work_package_id}` is a composite key
by construction — and the specification adds its own MUSTs for URI validation
and traversal sanitization on top. This is the same shape of problem the
delimiter module was created to make structurally impossible.

**F4 — the error taxonomy loses information.** Resources MUST answer a missing
resource with `-32602`. SecB's reads answer with typed codes that distinguish
`DENY_UNRESOLVED_CALLER`, `DENY_CLASSIFICATION_CEILING`, and a genuine absence.
Collapsing an authorization denial into "not found" either misreports the
reason or, if reported accurately, discloses existence to a caller not
permitted to know it. The specification does not resolve this; SecB would be
choosing, and the choice affects an authority boundary.

**F5 — caching scope must be per-caller.** Because SecB caps every read at the
caller's `max_data_classification`, a resource list or read genuinely varies by
authorization. The specification permits that, but such results MUST then be
`cacheScope: "private"`, and caches MUST NOT be shared across authorization
contexts. Getting this wrong is a cross-caller disclosure, and the failure is
silent.

### 9.4 Recommendation

**Do not adopt resources for governance reads at this time.** F1 alone removes
the benefit: while SecB serves legacy clients, nothing can leave the tool list,
so the change costs a second fully-governed access path and buys no reduction.

Reconsider when either condition changes:

1. SecB drops legacy support, at which point F1 dissolves and the token
   reduction becomes real; or
2. A host appears that SecB wants to serve which can only consume governance
   context as resources.

If it is reconsidered, F2–F5 are the design constraints, and F3 in particular
argues for opaque, server-minted resource identifiers rather than URIs composed
from user-supplied ids.

### 9.5 What this section does not cover

`resources/subscribe` and `notifications/resources/updated` were read but not
evaluated, because they depend on the subscriptions pattern page, which was not
retrieved. Pagination for `resources/list` was likewise not evaluated. Neither
affects the recommendation, which turns on F1.
