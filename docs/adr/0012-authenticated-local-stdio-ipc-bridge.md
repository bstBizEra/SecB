# ADR-0012 - Authenticated local stdio-to-IPC bridge

## Document control

| Field | Value |
|---|---|
| ADR ID | `ADR-0012` |
| Version | `0.1.0-draft` |
| Status | `PROPOSED / NOT DECIDED - DRAFT / NOT EFFECTIVE` |
| Owner | SecB Architecture Authority - unassigned |
| Producer | Codex architecture planning session |
| Produced at | 2026-07-31 |
| Project / work | `SECB-PRD-AGENT-MCP-001` / `WP-00` |
| Repository baseline | `4844463b1c07985f0f8a73c37fe6fc1d41f8497d` on `feat/secb-ruflo-command-center` |
| Baseline condition | Dirty working tree; uncommitted agent-enrollment and architecture candidates present |
| Risk | Candidate `R3` - workload identity, local IPC, credential custody, session authentication, and gateway access are affected |
| Required decision authority | Independent `REV`, `QA`, `SEC`, `OPS`, and human `GOV` |

## Authority boundary

This ADR is an architecture recommendation. It does not install or configure a
harness, create a named pipe or socket, store a credential, enroll or activate
an installation, start a SecB service, issue a session, expose an MCP tool,
deploy, merge, or authorize remote access.

The words `SHALL` and `MUST` below describe the candidate design if this ADR is
accepted. They are not effective policy while the status remains
`PROPOSED / NOT DECIDED`.

## Context

### Prior decisions and candidates

- The human governance disposition
  [`secb-mcp-server-gov-disposition.yaml`](../03-project-control/candidates/secb-mcp-server-gov-disposition.yaml)
  adopted child-process stdio for the local alpha and deferred HTTP/SSE.
- [`ADR-0009`](0009-mcp-upstream-fronting.md) proposes a single SecB surface in
  front of upstream MCP servers.
- [`ADR-0010`](0010-canonical-five-layer-registry-persistence.md) proposes one
  durable five-layer registry and server-derived Agent/Session projection.
- [`ADR-0011`](0011-single-mcp-invocation-enforcement-pipeline.md) proposes one
  invocation orchestrator behind the MCP protocol facade.

This ADR preserves the accepted harness-facing stdio property. It decides how a
thin stdio process should authenticate to one local SecB service instead of
recreating the gateway in every harness process.

### Verified current implementation

The current runnable path is process-per-harness:

```text
Codex / Claude
  -> spawn Node MCP server over stdio
  -> callerInstanceId from --caller or SECB_MCP_CALLER_INSTANCE
  -> in-process registry/services/gateway path
```

Source observations:

- [`jsonrpc-stdio.mjs`](../../src/mcp/jsonrpc-stdio.mjs) treats the process
  spawn as the authentication event and passes one construction-time
  `callerInstanceId` into every request.
- [`secb-mcp-server-wiring.mjs`](../../tools/secb-mcp-server-wiring.mjs)
  accepts that identity from a CLI argument or environment variable.
- [`start-secb-mcp.mjs`](../../tools/start-secb-mcp.mjs) currently defaults the
  caller to a fixture identity.
- each spawned process reconstructs its own registry/services and therefore
  does not provide one durable gateway/session/telemetry boundary.

This is adequate for cooperative alpha wiring but does not prove that the
process is the registered installation it claims to be. A copied command,
argument, environment value, or MCP configuration can repeat the same
`callerInstanceId`.

### Verified harness and protocol constraints

Local inspection on 2026-07-31 found:

- Codex CLI `0.145.0` accepts MCP stdio commands and Streamable HTTP URLs;
- Claude Code `2.1.220` accepts stdio, HTTP, SSE, and WebSocket MCP entries;
- the repository `.mcp.json` currently defines SecB as a command-spawned stdio
  server.

Current official documentation also describes stdio and Streamable HTTP as the
standard MCP transports. Neither inspected harness exposes Windows named pipes
or Unix domain sockets as a direct MCP configuration transport. Platform-native
IPC therefore requires a small stdio translation process.

Primary sources:

- [Codex MCP documentation](https://developers.openai.com/codex/mcp/)
- [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp)
- [MCP transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [MCP security best practices](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices)

## Decision statement

What local transport and authentication boundary should connect Codex, Claude
Code, and other MCP harnesses to one SecB Gateway Service on Windows/WSL while
preserving stdio compatibility, preventing caller impersonation and secret
exposure, and allowing a reversible migration from the current process-per-host
alpha?

## Scope

This decision covers:

- the harness-facing MCP transport;
- the bridge-to-service local transport;
- endpoint ownership and local-user isolation;
- installation proof and service proof;
- short-lived bridge sessions and replay controls;
- Windows/WSL routing behavior;
- secret custody, logging, failure, recovery, and migration boundaries.

This decision does not choose:

- the exact cryptographic library, native IPC helper, or OS vault library;
- canonical registry persistence;
- the invocation orchestrator implementation;
- the durable event store or final Event Envelope;
- remote or multi-host MCP authentication;
- Context7 transport or activation;
- the `secb install` packaging/distribution decision;
- a system-wide privileged Windows service.

Those require separately bounded contracts, work packages, and decisions.

## Non-negotiable constraints

1. Codex, Claude Code, and compatible harnesses continue to see a standard MCP
   stdio server.
2. The spawned process is a thin bridge and does not become an authority,
   registry, policy engine, invocation store, or upstream gateway.
3. A public installation ID, harness name, profile, CLI argument, environment
   value, PID, pipe/socket name, or possession of the MCP config is not
   authentication.
4. Every Harness Installation has distinct non-exported or OS-protected proof
   material.
5. Reusable secret/private-key material never enters repository files, MCP
   configuration, CLI arguments, ordinary environment variables, stdout,
   stderr, logs, events, evidence, or model context.
6. Bridge and SecB service authenticate each other before an MCP request enters
   the invocation pipeline.
7. OS endpoint permissions and cryptographic proof are both required; neither
   replaces the other.
8. The service derives Agent Instance, Runtime Deployment, Session, project,
   Work Package, policy, and authority from effective server state.
9. Sessions are short-lived, connection/channel-bound, replay-resistant, and
   immediately bounded by current revocation/policy state.
10. An MCP protocol session ID is routing state, not an authentication
    credential or SecB authority record.
11. Unknown, stale, copied, expired, revoked, mismatched, weakened, or
    unavailable identity/endpoint state fails closed.
12. No failure silently falls back to loopback HTTP, a second service, a
    fixture identity, or an unauthenticated direct server.
13. Bridge stdout carries only valid MCP messages; diagnostics are redacted and
    use stderr.
14. One request is associated with one authenticated SecB session and one
    invocation correlation identity.

## Decision drivers

| ID | Driver | Weight |
|---|---|---:|
| `DRV-01` | Installation identity assurance and secret containment | 25 |
| `DRV-02` | Codex, Claude, and generic MCP compatibility | 20 |
| `DRV-03` | Windows, WSL, and POSIX portability | 15 |
| `DRV-04` | Minimal reachable attack surface and fail-closed behavior | 15 |
| `DRV-05` | One service for central governance and usage observation | 10 |
| `DRV-06` | Operational reliability and recovery | 10 |
| `DRV-07` | Delivery cost and reversibility | 5 |
|  | **Total** | **100** |

Scores use `1` (poor) through `5` (strong). Weighted totals are decision
support, not mathematical proof.

## Options considered

### Option A - Keep one full stdio gateway process per harness

Continue spawning the current server directly and strengthen its spawn
arguments/environment checks.

Benefits:

- minimal change;
- excellent harness compatibility;
- no standing network or IPC listener;
- current alpha behavior and tests remain directly applicable.

Costs and risks:

- a string asserted at spawn remains copyable and is not workload proof;
- every process has its own registry, rate state, upstream children, and audit
  writer;
- revocation and policy changes rely on each process observing new state;
- central monitoring must reconcile multiple processes and partial lifecycles;
- a copied configuration can impersonate another installation.

### Option B - Thin stdio bridge to platform-native owner-only IPC

Each harness spawns `secb bridge` over stdio. The bridge connects to one SecB
service using:

- a current-user/logon-session restricted Windows named pipe when the service
  runs on Windows; or
- an owner-only Unix domain socket when the service runs in WSL/Linux/POSIX.

The bridge and service perform cryptographic mutual proof using distinct
installation and service keys before the service issues a short-lived session.

Benefits:

- preserves standard harness-facing stdio;
- provides one authoritative service and usage stream;
- avoids a TCP listener and browser-reachable localhost surface;
- combines OS principal isolation with installation-specific proof;
- isolates secrets from harness config and model context;
- supports central revocation without restarting every harness.

Costs and risks:

- requires a new bridge, service listener, handshake, framing, and lifecycle;
- Windows pipe ACLs must be explicit; Node's default named-pipe creation is not
  sufficient evidence of current-user isolation;
- WSL routing needs deliberate co-location/interoperability behavior;
- secure OS vault integration adds platform work;
- service unavailability affects every harness.

### Option C - Direct Streamable HTTP from each harness

Configure Codex and Claude directly with a loopback Streamable HTTP URL and
OAuth or bearer-token authentication.

Benefits:

- both current harnesses support HTTP MCP;
- standardized MCP session and authorization behavior;
- one independently running service;
- easiest path toward future remote service support.

Costs and risks:

- creates a browser- and process-reachable local TCP endpoint;
- requires Origin, Host, redirect, DNS-rebinding, CSRF, and token-audience
  controls;
- static header/bearer configuration can expose reusable credentials;
- harness authentication capabilities and storage differ;
- OAuth/browser flows add disproportionate complexity for single-user local
  MVP;
- direct client auth gives the bridge less control over installation proof and
  secret custody.

### Option D - Thin stdio bridge to authenticated loopback HTTP

Keep the harness-facing stdio bridge, but let it connect to the SecB service on
`127.0.0.1` using a short-lived in-memory credential.

Benefits:

- preserves harness compatibility;
- centralizes the service;
- avoids putting a reusable token in harness configuration;
- uses ordinary Node HTTP and is portable across Windows/WSL.

Costs and risks:

- retains the localhost/DNS-rebinding and local-process attack surface;
- requires every Streamable HTTP security control even though traffic is local;
- WSL network mode and localhost forwarding can vary;
- larger reachable surface than native IPC;
- a compromised same-user process can probe the listener and attempt denial or
  credential theft.

## Trade-off matrix

| Option | `DRV-01` 25 | `DRV-02` 20 | `DRV-03` 15 | `DRV-04` 15 | `DRV-05` 10 | `DRV-06` 10 | `DRV-07` 5 | Weighted result / 500 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| A - full stdio process per harness | 2 | 5 | 4 | 5 | 1 | 3 | 5 | 350 |
| B - stdio bridge + owner-only IPC | 5 | 5 | 4 | 5 | 5 | 4 | 2 | **460** |
| C - direct loopback Streamable HTTP | 3 | 5 | 5 | 2 | 5 | 4 | 4 | 390 |
| D - stdio bridge + loopback HTTP | 4 | 5 | 5 | 3 | 5 | 4 | 3 | 425 |

### Sensitivity

- If initial delivery cost dominates identity assurance, Option A wins, but it
  does not meet the product requirement for distinct authenticated
  installations and one service.
- If a secure platform-native IPC implementation cannot be supported, Option D
  is the fallback candidate, not an automatic fallback. It requires a separate
  SEC packet and all Streamable HTTP local-server protections.
- For a future remote multi-host product, Option C may become preferred under a
  separate remote-authentication ADR.
- Option B depends on proving explicit endpoint permissions and OS credential
  storage. If that proof fails, its security score falls materially.

## Recommendation candidate

Adopt **Option B**:

> SecB SHALL retain standard MCP stdio between each harness and a thin
> `secb bridge` process. The bridge SHALL connect to one local SecB Gateway
> Service over platform-native current-user-only IPC, mutually authenticate
> using installation-specific and service-specific proof material held outside
> harness configuration, and obtain a short-lived server-derived session.

The bridge is a transport/security adapter. It does not authorize tools, own
registry state, or call upstreams directly.

## Candidate target topology

```text
Codex / Claude / other MCP harness
                 |
        MCP JSON-RPC over stdio
                 |
                 v
       secb bridge (thin process)
       - exact installed binary
       - installation key reference
       - stdout protocol only
                 |
      mutually authenticated local IPC
     Windows named pipe / POSIX UDS
                 |
                 v
        SecB Gateway Service
       - installation verification
       - short-lived session
       - canonical registry
       - invocation orchestrator
       - audit and usage events
                 |
       native and upstream adapters
```

## Component responsibilities

| Component | Owns | Must not own |
|---|---|---|
| Harness MCP configuration | bridge command and public installation selector | reusable secret, authority, policy, upstream credentials |
| `secb bridge` | stdio framing, endpoint discovery, service validation, installation proof, bounded forwarding, cancellation/disconnect propagation | registry writes, authorization, direct tool execution |
| Endpoint locator | non-secret service instance/endpoint metadata and key fingerprint | private keys, bearer tokens, approval |
| OS IPC boundary | same-user/session access check and local stream isolation | Agent identity or SecB authorization |
| Workload identity service | challenge verification, installation lookup, session mint/renew/revoke | harness configuration mutation |
| Registry/session resolver | effective Agent/Runtime/Session/policy projection | transport proof material |
| Invocation orchestrator | method/tool authorization and controlled dispatch | transport authentication |
| OS credential store | installation/service private material or sealed references | Agent roles or policy |

## Harness-facing stdio contract

1. The harness launches a fixed installed `secb` executable or a verified
   package entry, not an unpinned `npx <package>@latest` command.
2. The configuration may carry a public installation selector. Possession of
   that selector grants nothing.
3. No private key, reusable token, activation flag, caller Agent ID, or service
   credential appears in command arguments or environment.
4. The bridge reads MCP messages from stdin and writes only MCP messages to
   stdout.
5. Logs use stderr, are bounded/redacted, and never include proof material,
   full request/result payloads, or private identity projections.
6. EOF, cancellation, malformed JSON-RPC, backpressure, and service disconnect
   have explicit terminal behavior.
7. The bridge forwards protocol version and lifecycle messages without
   reinterpreting authorization.

## Platform-native IPC profile

### Windows named pipe

The candidate endpoint is a local Windows named pipe scoped to the active SecB
service/user boundary.

Required controls:

- create the pipe with an explicit security descriptor or a proven
  `CurrentUserOnly` equivalent;
- restrict to the intended current user and logon session/elevation boundary;
- deny anonymous, Everyone, cross-user, cross-session, and remote access;
- reject remote server names and use a local-only pipe namespace;
- use non-inheritable handles and one service-instance ownership lease;
- verify the effective descriptor at startup and refuse readiness if it is
  broader than the accepted profile;
- do not rely on the Windows default pipe descriptor.

Microsoft documents that a default pipe security descriptor grants read access
to Everyone and anonymous users, so default creation is not an acceptable
control:

- [Named Pipe Security and Access Rights](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights)
- [Current-user-only named pipe behavior](https://learn.microsoft.com/en-us/dotnet/api/system.io.pipes.namedpipeserverstreamacl.create)

The current Node runtime can address Windows named pipes, but transport support
alone does not prove the required DACL. Implementation must use a reviewed
native/runtime facility or helper that can create and verify the descriptor.

### WSL/Linux/POSIX Unix domain socket

Required controls:

- place the socket in an owner-controlled runtime directory, preferably
  `$XDG_RUNTIME_DIR`, with directory mode `0700`;
- create the socket with owner-only access (`0600`) without a permissive
  bind-to-chmod window;
- verify owner UID and effective mode before accepting or connecting;
- use a bounded path length and a non-symlink endpoint;
- use a single-instance lease and safe stale-socket recovery;
- do not use a shared `/tmp` path or silently relax permissions;
- remove the endpoint on clean shutdown and prove ownership before removing a
  stale endpoint.

Node documents support for Unix domain sockets and Windows named pipes:
[Node IPC support](https://nodejs.org/api/net.html#ipc-support).

### Windows/WSL crossing rule

The IPC endpoint is not stretched across an OS boundary.

- The bridge runs on the same OS side as the SecB service.
- A harness on the other side may spawn that bridge through an explicit
  operator-approved stdio interoperability route.
- WSL can launch Windows executables and Windows can launch WSL commands, but
  availability must be discovered and tested rather than assumed:
  [Microsoft WSL interoperability](https://learn.microsoft.com/en-us/windows/dev-environment/wsl-interop).
- Exactly one accepted SecB service is authoritative for a configured local
  authority domain.
- If the approved interoperability route is unavailable, return
  `DENY_BRIDGE_ROUTE_UNAVAILABLE`; do not start an unaffiliated second service
  or fall back to TCP.

The deployment-host choice and exact interop launcher are OPS work-package
decisions, not inferred by this ADR.

## Mutual authentication and session sequence

Exact algorithms and wire schemas require SEC review. The logical sequence is:

```text
1. bridge resolves public endpoint metadata
2. bridge verifies endpoint owner/mode/security descriptor
3. bridge connects with bounded timeout
4. service sends fresh nonce, service instance, key id, protocol version
5. bridge verifies pinned service identity from its install receipt
6. bridge signs/binds the transcript with installation proof
7. service verifies installation key, nonce, host and effective registry state
8. both prove the same transcript/channel; replay cache records the nonce
9. service mints a short-lived, channel-bound SecB Session
10. each forwarded MCP request carries implicit connection/session context
11. dispatch rechecks current expiry, policy and revocation
12. disconnect, expiry, restart or revocation terminates/invalidates the session
```

Rules:

- use established cryptographic libraries and OS random generation;
- negotiate no unauthenticated or legacy mode;
- bind proof to installation ID, service identity, endpoint instance, host,
  protocol version, nonces, and connection transcript;
- prevent downgrade, reflection, replay, cross-service, and cross-installation
  reuse;
- compare proofs in constant time where applicable;
- bound handshake bytes, time, attempts, concurrency, and failure detail;
- rotate keys and support overlap only through explicit versioned state;
- possession of one installation key cannot authenticate another installation;
- service restart invalidates old channel sessions unless a separately proven
  resume contract exists;
- MCP `Mcp-Session-Id` never substitutes for the SecB Session.

## Credential custody

Installation and service private proof material:

- is generated during an explicit install/enrollment workflow;
- is stored through an OS credential facility or as a non-exportable key;
- is referenced by opaque key ID;
- is loaded only inside the bridge/service authentication boundary;
- is never accepted from the model, MCP request, repository, CLI argument, or
  ordinary environment;
- is cleared/released as soon as the proof operation completes;
- has rotation, revocation, recovery, and orphan-cleanup receipts.

On Windows, candidate facilities include Credential Manager or DPAPI-backed
storage; the exact facility remains an implementation decision:
[Microsoft credential handling guidance](https://learn.microsoft.com/en-us/windows/win32/secbp/handling-passwords).

Installation creates a candidate identity and protected proof material. It does
not approve the installation, activate an Agent, or authorize a session.

## Endpoint discovery and service lifecycle

- An owner-only locator records non-secret endpoint name, service instance ID,
  service public-key fingerprint, protocol version, and lease expiry.
- The locator is not authority and cannot contain reusable proof material.
- The service holds a single-instance lock/lease before publishing readiness.
- Readiness requires registry/session resolver, policy, revocation, audit writer,
  invocation orchestrator, endpoint permission verification, and service key.
- Bridge startup refuses missing, stale, malformed, symlinked, wrong-owner,
  version-incompatible, or key-mismatched locators.
- PID/liveness is diagnostic only.
- Bridge reconnect obtains a new authenticated session; it does not replay a
  prior session token.
- The bridge does not auto-start or activate the service unless a separately
  accepted operator policy authorizes that lifecycle.

## Internal framing and flow control

- The internal IPC protocol uses versioned, length-bounded frames rather than
  relying on newline boundaries across multiplexed service connections.
- A frame binds connection/session, request ID, MCP message type, sequence, and
  trace correlation without accepting a caller-supplied effective Agent ID.
- Maximum frame, request, response, queue, connection, and handshake sizes are
  enforced before allocation/forwarding.
- Per-connection ordering preserves MCP lifecycle semantics.
- Cancellation and EOF propagate without converting disconnect into successful
  cancellation.
- Unknown frame types, versions, sequences, or duplicate request IDs deny.
- Backpressure is bounded; overload returns a safe typed error and does not
  create an unbounded bridge queue.
- The service, not the bridge, owns usage accounting and terminal invocation
  disposition.

## Loopback HTTP fallback boundary

Option D is retained as a contingency candidate only. It is not activated by
IPC failure.

Before loopback HTTP could be accepted, a separate SEC/OPS packet must prove at
least:

- exact loopback bind and no wildcard interface;
- strict `Origin` and `Host` validation;
- DNS-rebinding, CSRF, redirect, SSRF, and localhost-probing defenses;
- short-lived audience-bound authentication acquired inside the bridge;
- no reusable credential in MCP configuration, URL, arguments, or logs;
- private cache and MCP session handling;
- WSL NAT/mirrored-mode behavior;
- equivalent no-bypass, rate, audit, revocation, and shutdown behavior.

The MCP transport specification explicitly requires Origin validation and
recommends localhost binding plus authentication for local Streamable HTTP.

## Migration and rollback

### Stage 0 - Preserve and classify current evidence

Freeze current stdio protocol/client tests. Record that current caller
assertion is cooperative behavior, not authenticated workload identity.

### Stage 1 - Define inert contracts

Create versioned endpoint-locator, bridge frame, installation proof, handshake,
session, denial, and lifecycle contracts with no listener or config mutation.

### Stage 2 - Build adversarial identity fixtures

Prove copied selector/config, wrong key, replay, expired proof, service
impersonation, weakened endpoint permissions, and cross-user attempts deny.

### Stage 3 - Build isolated platform listeners

Implement Windows named-pipe and POSIX UDS fixtures behind one logical local IPC
interface. Verify effective permissions independently. Do not bind them into the
active MCP configuration.

### Stage 4 - Build the thin bridge

Implement stdio and internal framed IPC with fake/inert gateway fixtures.
Prove protocol transparency, stdout cleanliness, limits, cancellation,
backpressure, and safe service failure.

### Stage 5 - Integrate workload sessions

Bind the handshake to canonical installation records and short-lived sessions.
Prove rotation, revocation, restart, concurrent bridges, and central rate/audit
behavior.

### Stage 6 - Shadow without dual dispatch

For a read-only fixture, compare the old asserted identity with the new
server-derived identity. Only one selected path may dispatch. Any divergence
blocks cutover.

### Stage 7 - Opt-in harness cohorts

Generate candidate configurations for one test harness, then Codex, then Claude.
Adoption remains an explicit operator action. Prove install, connect, revoke,
uninstall/rollback, and no-direct-bypass behavior for each host matrix.

### Stage 8 - Retire asserted caller identity

Remove `--caller`/`SECB_MCP_CALLER_INSTANCE` as authentication only after a
call-path inventory proves every active route uses authenticated sessions and
independent acceptance is recorded.

Rollback before retirement restores the prior stdio command for a bounded
cohort. It does not copy new installation secrets into the old path or enable
both paths to dispatch the same request.

## Consequences

### Positive

- retains native Codex/Claude MCP compatibility;
- establishes one central SecB gateway and usage record;
- removes caller identity from harness-controlled arguments/environment;
- permits immediate central session expiry/revocation;
- reduces browser/localhost attack exposure compared with HTTP;
- supports per-installation rate, policy, and audit attribution;
- keeps upstream credentials inside the gateway/broker boundary.

### Negative

- adds a security-sensitive bridge and IPC protocol;
- requires platform-specific endpoint and credential work;
- may require a small reviewed native/runtime helper for Windows ACL proof;
- introduces a central service availability dependency;
- cross-OS WSL routing and packaging require explicit test matrices;
- does not itself prevent a fully compromised same-user host from attacking
  bridge/service processes.

### Operational

- service install/start/stop/update is distinct from harness configuration;
- endpoint lease, key rotation, session revocation, stale socket cleanup,
  version compatibility, and bridge/service health need operator diagnostics;
- a `secb doctor` path should report truth without revealing identifiers or
  secrets;
- central telemetry can drive the monitoring UI but must remain
  classification-filtered and minimized;
- service unavailability denies MCP access rather than spawning an
  unauthenticated fallback.

### Security and privacy

- same-user endpoint restrictions reduce but do not eliminate local compromise;
- mutual proof distinguishes installations sharing one OS account;
- no request/result body is logged by default merely because the bridge can see
  it;
- transport metadata is security-relevant personal/operational data and needs
  retention controls;
- detailed authentication failures remain server-side with safe public codes.

## Risks

| ID | Risk | Control |
|---|---|---|
| `R-0012-01` | Copied config impersonates an installation | distinct OS-protected private proof; selector is non-authoritative |
| `R-0012-02` | Malicious same-user process connects | installation proof, service proof, attempt limits, no authorization before session |
| `R-0012-03` | Default Windows pipe ACL is too broad | explicit descriptor/current-user-only creation and startup verification |
| `R-0012-04` | UDS path is replaced or permission weakened | owner-only directory, no symlink, owner/mode checks, lease |
| `R-0012-05` | Service endpoint is impersonated | pinned service key and transcript-bound mutual proof |
| `R-0012-06` | Handshake is replayed or downgraded | fresh nonces, replay cache, version binding, no legacy mode |
| `R-0012-07` | WSL routing creates a second authority | same-side bridge rule, one authority domain, no implicit fallback |
| `R-0012-08` | Secret leaks through config/log/error | opaque references, OS vault, safe errors, secret scans |
| `R-0012-09` | Bridge becomes a policy bypass | no direct adapter path; server-derived session and orchestrator only |
| `R-0012-10` | Central service outage blocks all harnesses | bounded health/restart, explicit degraded state, reversible cohort rollout |
| `R-0012-11` | Old and new paths both dispatch | one selected route, shadow decisions only, call-path inventory |
| `R-0012-12` | Compromised host steals in-memory proof | least privilege, short-lived sessions, non-exportable keys where available, host-compromise residual risk |

## Quality scenarios

| ID | Scenario | Required response |
|---|---|---|
| `QS-0012-01` | Attacker copies MCP config and installation selector without the protected key | Handshake denies; no SecB Session or invocation |
| `QS-0012-02` | Same-user process connects directly to the endpoint | Cannot authenticate another installation; bounded denial is audited |
| `QS-0012-03` | Different Windows user/session/elevation attempts pipe access | OS access check denies before application authentication |
| `QS-0012-04` | Pipe descriptor or socket mode is broader than accepted profile | Service refuses readiness |
| `QS-0012-05` | Fake service publishes a locator with another key | Bridge refuses before forwarding MCP data |
| `QS-0012-06` | Captured handshake is replayed | Nonce/transcript replay denies |
| `QS-0012-07` | Installation is revoked during a live bridge | Next dispatch/renewal denies without process restart |
| `QS-0012-08` | Service restarts | Old session is invalid; bridge must mutually authenticate again |
| `QS-0012-09` | WSL harness uses an approved cross-boundary stdio launcher | Bridge runs service-side and session binds the correct installation/host |
| `QS-0012-10` | WSL interop route is unavailable | Typed route denial; no HTTP or second-service fallback |
| `QS-0012-11` | Stale UDS remains after crash | Ownership/liveness checks recover safely or fail closed without deleting another endpoint |
| `QS-0012-12` | Two bridges alternate native/upstream calls | One central Agent/Session rate and audit stream applies |
| `QS-0012-13` | Bridge crashes mid-request | Service records disconnect/terminal state; no fabricated success |
| `QS-0012-14` | Oversized, malformed, duplicate, or unknown frame arrives | Deny before unbounded allocation or invocation |
| `QS-0012-15` | Bridge dependency writes to stdout | Conformance test fails; no corrupted MCP stream is activated |
| `QS-0012-16` | Secret-shaped material appears in args, env, logs, events, or errors | Verification fails and candidate cannot activate |
| `QS-0012-17` | Shadow identity differs from old asserted caller | Cutover blocks and exactly one path may dispatch |

## Verification obligations

An implementation work package derived from this ADR must include:

- machine-readable locator, frame, handshake, session, denial, and lifecycle
  contracts;
- Codex, Claude Code, and generic MCP stdio conformance fixtures;
- Windows current-user/logon-session/elevation pipe access tests;
- independent effective DACL inspection and negative cross-user tests;
- POSIX owner/mode/symlink/stale-socket tests;
- WSL-to-Windows and Windows-to-WSL approved-route tests where supported;
- no-interop and no-silent-fallback tests;
- service impersonation, copied config, wrong installation, replay, downgrade,
  reflection, expiration, rotation, and revocation tests;
- service restart and old-session invalidation tests;
- bounded handshake/frame/queue/timeout/concurrency tests;
- stdout cleanliness and redacted stderr tests;
- CLI argument, environment, repository, log, event, and evidence secret scans;
- central rate/audit attribution across simultaneous bridges;
- shadow exactly-one-dispatch proof;
- install, configuration generation, operator adoption, revoke, rollback, and
  uninstall receipts;
- independent `REV`, `QA`, and `SEC` execution on the final host matrix.

## Affected architecture elements

If accepted, future work affects:

- SecB CLI `install`, `bridge`, `service`, `doctor`, and `uninstall` commands;
- Harness Installation and Session contracts;
- local endpoint locator and workload proof contracts;
- OS credential integration;
- service lifecycle/readiness;
- MCP stdio framing;
- authenticated IPC framing;
- registry/session resolver;
- invocation orchestrator;
- audit/usage events and operational read models;
- Codex, Claude, generic CLI, Windows, WSL, and POSIX conformance suites.

No affected component is authorized for mutation or activation by this list.

## Evidence index

| Claim | Evidence reference | Verification status |
|---|---|---|
| Current stdio layer trusts a spawn-asserted caller string | [`jsonrpc-stdio.mjs`](../../src/mcp/jsonrpc-stdio.mjs) | Verified source observation |
| Caller is accepted from CLI/env | [`secb-mcp-server-wiring.mjs`](../../tools/secb-mcp-server-wiring.mjs) | Verified source observation |
| Convenience launcher defaults a fixture caller | [`start-secb-mcp.mjs`](../../tools/start-secb-mcp.mjs) | Verified source observation |
| Alpha adopted stdio and deferred HTTP/SSE | [`secb-mcp-server-gov-disposition.yaml`](../03-project-control/candidates/secb-mcp-server-gov-disposition.yaml) | Approved prior local disposition |
| Current Codex supports stdio and Streamable HTTP | [Official Codex MCP documentation](https://developers.openai.com/codex/mcp/) and local CLI `0.145.0` | Verified 2026-07-31; version-sensitive |
| Current Claude Code supports local stdio and HTTP | [Official Claude Code MCP documentation](https://code.claude.com/docs/en/mcp) and local CLI `2.1.220` | Verified 2026-07-31; version-sensitive |
| Standard MCP transports are stdio and Streamable HTTP | [MCP transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports) | Verified external specification |
| Local HTTP requires Origin/authentication controls | [MCP transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), [security practices](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices) | Verified external guidance |
| Default Windows pipe descriptor is broader than current-user only | [Microsoft named-pipe security](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights) | Verified platform documentation |
| Node supports Windows named pipes and Unix domain sockets | [Node IPC support](https://nodejs.org/api/net.html#ipc-support) | Verified runtime documentation |
| WSL supports bidirectional process interop but availability varies | [Microsoft WSL interop](https://learn.microsoft.com/en-us/windows/dev-environment/wsl-interop) | Verified platform documentation |
| Windows guidance recommends OS credential storage/DPAPI | [Microsoft credential handling](https://learn.microsoft.com/en-us/windows/win32/secbp/handling-passwords) | Verified platform guidance |
| Product requires distinct installation proof and short-lived sessions | [`SECB-PRD-AGENT-MCP-001`](../03-project-control/candidates/secb-agent-registry-mcp-gateway-prd-001.md) | Draft product requirement |

## Owners and approvals

| Role | Responsibility | Current disposition |
|---|---|---|
| ARCHI | Own bridge, IPC, identity, and session boundaries | Unassigned |
| REV | Verify source/platform evidence, options, and migration claims | Required |
| QA | Convert scenarios into independent host/client conformance | Required |
| SEC | Review cryptography, proof binding, endpoint ACLs, secrets, replay, and bypass | Required |
| OPS | Review service/endpoint lifecycle, WSL routing, recovery, packaging, and rollback | Required |
| GOV | Accept, reject, or require rework | Required |

No acceptance is implied by repository presence, producer validation, external
documentation, or a green test.

## Review triggers

Review or supersede this ADR if:

- Codex/Claude add a reviewed direct custom-IPC MCP transport;
- the product becomes multi-user, system-wide, remote, or multi-host;
- the service runs under a different OS account from bridge processes;
- a platform cannot prove current-user endpoint isolation;
- WSL interop cannot preserve stdio framing or service-side co-location;
- a non-exportable key facility changes the proof protocol;
- MCP authorization requirements for local stdio materially change;
- loopback HTTP becomes necessary for an accepted operational constraint;
- measured bridge latency/reliability violates product objectives;
- a compromised same-user threat must be isolated beyond current OS controls.

## Supersession

- Preserves the alpha harness-facing stdio decision in
  [`secb-mcp-server-gov-disposition.yaml`](../03-project-control/candidates/secb-mcp-server-gov-disposition.yaml).
- Refines but does not supersede [`ADR-0009`](0009-mcp-upstream-fronting.md).
- Consumes but does not accept
  [`ADR-0010`](0010-canonical-five-layer-registry-persistence.md) and
  [`ADR-0011`](0011-single-mcp-invocation-enforcement-pipeline.md).
- If accepted, resolves `SECB-PRD-AGENT-MCP-001` decision `DEC-03`.
- Does not authorize bridge implementation, service activation, or harness
  configuration.

## Limitations and unresolved items

- No bridge, IPC listener, handshake, key store, or service was implemented.
- Exact proof algorithms, libraries, key types, frame schemas, and denial codes
  remain to be designed and SEC-reviewed.
- Exact Windows ACL implementation and native/runtime dependency remain open.
- Exact POSIX peer-credential support remains open.
- The authoritative service host for a Windows/WSL installation remains an OPS
  deployment choice.
- Cross-OS routing was not executed end to end in this slice.
- Local CLI/documentation support is version-sensitive.
- Same-user full host compromise remains a residual risk.
- This producer did not perform independent review.

## Required next-role action

1. `REV` verifies the current caller-assertion path and every external/platform
   evidence claim.
2. `SEC` defines the minimum acceptable proof/channel profile and independently
   challenges same-user, replay, downgrade, service-impersonation, secret, and
   bypass cases.
3. `OPS` defines the supported service-host/WSL route matrix and proves
   endpoint permission/lifecycle feasibility without activation.
4. `QA` converts the seventeen scenarios into platform/client acceptance
   stubs.
5. Human `GOV` accepts Option B, requests rework, or rejects the candidate.

Until those actions occur, implementation may prepare inert contracts and
isolated fixtures on a non-`main` branch, but must not configure a harness,
store live proof material, bind an effective endpoint, or activate a service.

## Change log

| Version | Date | Change |
|---|---|---|
| `0.1.0-draft` | 2026-07-31 | Initial authenticated local bridge candidate |
