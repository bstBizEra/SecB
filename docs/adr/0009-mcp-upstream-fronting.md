# ADR-0009 — Front declared upstream MCP servers behind one governed SecB surface

## Status

PROPOSED / NOT DECIDED — DRAFT candidate ADR. The implementation exists on
`feat/secb-ruflo-command-center` (commits `1718f2b`, `fe64aac`, `6f9e811`) but is
**not activated**: no MCP client configuration points at it. The human
governance operator makes this decision; no agent may decide, activate, or merge
it. Recording an implemented-but-unactivated decision is the advise-and-proceed
pattern of [`AGENTS.md`](../../AGENTS.md) rule 3, not a claim of acceptance.

## Context

- The predecessor was `bizera-win-mcp-hub`. An MCP client configured **17
  separate upstream servers directly**. Consequences: every client carried its
  own copy of the catalogue, and no SecB control observed a single upstream call.
- That project's `config/servers.yaml` baked a Windows spawn line into every
  entry (`wsl.exe -d <distro> -- bash -lic "<cmd>"`). The catalogue was therefore
  **one host's view**: it could not be used from inside WSL at all.
- Its two operator scripts each conflated an act with its authorization.
  `scripts/install.ps1` wrote directly into the live client config, so generating
  a config and activating it were the same step. `scripts/verify_install.py`
  proved an upstream by launching it, so diagnosing required starting all 17.
- [`ADR-SECB-AGENT-RUNTIME-001`](../decisions/ADR-SECB-AGENT-RUNTIME-001.md)
  (Status APPROVED, 2026-07-25) names an "MCP Gateway" as a component in its
  architecture diagram and forbids credentials in git-committed MCP configs, but
  it does not decide how upstreams are declared, resolved, or fronted. No ADR
  currently records that decision, which
  [`docs/AGENTS.md`](../AGENTS.md) requires for changes materially affecting
  architecture, authority, security, or interoperability.
- SecB's governing constraint is that authority is derived server-side and
  unknown operations are denied ([`exit-gates.md`](../04-assurance/exit-gates.md)
  G2), and that activation is always a separate operator step
  ([`AGENTS.md`](../../AGENTS.md) working rule 5).

## Decision

**D1 — One governed surface.** An MCP client configures SecB and nothing else.
SecB fans out to declared upstreams behind its own tool surface, so every
upstream call crosses a SecB control point instead of happening inside a client
where nothing observes it.

**D2 — Upstreams declare WHAT and WHERE, never HOW.** A registry entry states
its transport, the runtime it must execute in (`wsl` / `windows` / `any`), and
its command or URL. The host-specific spawn plan is **derived** at resolve time.
One registry document therefore resolves correctly from both a Windows and a WSL
host — the specific failure of `servers.yaml`.

**D3 — Resolution is pure; activation is separately gated, in two tiers.**
Producing a spawn plan reads one JSON file and returns plain objects: no process
spawn, no socket, no disk write. Serving read-only native projections requires
`SECB_MCP_DEPLOYMENT_AUTHORIZED`. **Spawning declared upstream child processes
requires an additional, distinct flag** (`SECB_MCP_UPSTREAMS_AUTHORIZED`),
because spawning is a strictly larger act than serving projections and must not
inherit the smaller authorization.

**D4 — Fronted tools are governed exactly as native tools are.** An upstream's
tools are namespaced under its registry id and routed through the same invocation
ledger, classification ceiling, and per-upstream concurrency, timeout, and
response-size limits. An upstream's declared `classification_ceiling` is **capped
by** the server's; declaring above it is denied, and the denial is itself
audited, failing closed if the audit write fails.

**D5 — Refuse rather than emit a plan that cannot work.** A resolution that
cannot succeed is returned as a typed refusal — `DISABLED`, `HOST_UNREACHABLE`,
`LOOPBACK_ACROSS_BOUNDARY` — rather than as a plan that fails later at spawn
time. Correspondingly, config generation **prints and never installs**: adopting
generated output is the operator's act, per working rule 5.

## Consequences

### Accepted benefits

- Every upstream invocation is ledgered and ceiling-checked at one place, which
  is the precondition for G2 (authority derived server-side) applying to upstream
  tools at all.
- The catalogue becomes portable across hosts, and entries whose targets no
  longer resolve are carried **disabled with a recorded reason** rather than
  deleted, keeping the migration auditable.
- Diagnosis no longer requires execution, so an operator can inspect a plan
  before adopting it.

### Accepted costs and risks

- **Single point of dependency and aggregation.** All MCP access now flows
  through SecB. A SecB fault removes every upstream at once, where previously a
  broken upstream affected only itself. This concentrates both observability and
  blast radius.
- **Upstream replies enter model context.** An upstream response is foreign text
  crossing into a reasoning context, so the response-size ceiling is a
  context-integrity control, not merely a memory bound. This ADR does not claim
  the control is sufficient against a hostile upstream, only that it is present.
- **SecB does not sandbox upstreams.** Fronting grants a namespaced,
  trusted-looking surface to code SecB does not isolate. The `wsl-shell`
  upstream in particular grants arbitrary command execution inside the distro and
  is carried **enabled at parity** with the predecessor; that parity is a
  migration decision, not a security judgement, and is flagged for SEC review.
- **Process multiplication.** Under spawn-per-client (GOV-MCP-01), each client
  session spawns its own set of upstream children.
- Namespacing creates a collision surface between upstream ids, upstream tool
  names, and native tool names that must remain non-overlapping by construction.

### If rejected or deferred

Clients continue configuring upstreams directly; no upstream call is ledgered or
ceiling-checked; the catalogue remains host-specific. The registry, resolver, and
the two operator CLIs remain useful independently, because the config generator
produces a per-client config from the same declarative registry without any
runtime fronting.

## Alternatives considered

1. **Keep per-client configuration** (status quo ante). Rejected: it is precisely
   the arrangement in which no SecB control observes an upstream call.
2. **Keep a separate hub process** (`bizera-win-mcp-hub` as-is). Rejected: its
   catalogue is structurally single-host, and its authorization model conflates
   generation with activation.
3. **Static config generation only, with no runtime fronting.** Not rejected —
   **adopted alongside** as `tools/secb-mcp-config.mjs`. It is the fallback that
   remains available if D1 is rejected, which is why it is deliberately
   independent of the proxy runtime.

## Required process before this decision takes effect

Independent REV and QA; SEC review of the trust-boundary items above (unsandboxed
upstreams, `wsl-shell` parity, response-size sufficiency, namespace collision);
then an explicit human GOV decision recorded here, then operator-only merge.
Activation of the hub is a **further** operator authorization beyond merge, per
D3 and working rule 5. The producer of this ADR may not issue its review verdict.

## Evidence

- Producer verification and residuals:
  [`secb-mcp-p4-operator-tooling-producer-verification.handoff.yaml`](../03-project-control/candidates/secb-mcp-p4-operator-tooling-producer-verification.handoff.yaml)
- Registry contract:
  [`mcp-upstream-registry.schema.json`](../../contracts/mcp-upstream-registry.schema.json)
- Resolver, proxy runtime, and hub entry: `src/mcp/upstream-registry.mjs`,
  `src/mcp/upstream-client.mjs`, `src/mcp/upstream-proxy.mjs`,
  `tools/start-secb-mcp-hub.mjs`
- Operator CLIs: `tools/secb-mcp-config.mjs`, `tools/secb-mcp-doctor.mjs`
