# ADR-0011 - Single MCP invocation enforcement pipeline

## Document control

| Field | Value |
|---|---|
| ADR ID | `ADR-0011` |
| Version | `0.1.0-draft` |
| Status | `PROPOSED / NOT DECIDED - DRAFT / NOT EFFECTIVE` |
| Owner | SecB Architecture Authority - unassigned |
| Producer | Codex architecture planning session |
| Produced at | 2026-07-31 |
| Project / work | `SECB-PRD-AGENT-MCP-001` / `WP-00` |
| Repository baseline | `4844463b1c07985f0f8a73c37fe6fc1d41f8497d` on `feat/secb-ruflo-command-center` |
| Baseline condition | Dirty working tree; uncommitted agent-enrollment candidate present |
| Risk | Candidate `R3` - MCP authorization, dispatch, credentials, audit, and upstream trust boundaries are affected |
| Required decision authority | Independent `REV`, `QA`, `SEC`, and human `GOV` |

## Authority boundary

This ADR is an architecture recommendation only. It does not activate an MCP
server, expose Context7 or another upstream, change a harness configuration,
issue authority, migrate a call path, accept evidence, or authorize deployment.

The words `SHALL` and `MUST` below describe the candidate design if this ADR is
accepted. They are not effective policy while its status is
`PROPOSED / NOT DECIDED`.

## Context

### Prior decisions

- [`ADR-0009`](0009-mcp-upstream-fronting.md) proposes one governed SecB
  surface in front of declared upstream MCP servers. It does not decide the
  internal convergence mechanism.
- [`ADR-SECB-AGENT-RUNTIME-001`](../decisions/ADR-SECB-AGENT-RUNTIME-001.md)
  is approved and makes SecB the governance/control plane rather than a
  super-agent.
- [`ADR-0010`](0010-canonical-five-layer-registry-persistence.md) is a separate
  candidate for one canonical Provider, Model, Runtime, Agent, and Session
  registry. This ADR consumes its proposed
  `EffectiveAgentSessionContext`; it does not decide persistence.

### Observed implementation state

Three components currently participate in MCP execution but do not form one
enforcement pipeline:

1. [`McpGatewayCore`](../../src/gateway/mcp-gateway-core.mjs) contains the
   strongest governed sequence. It validates a bounded request context,
   resolves a capability and adapter, checks policy and revocation, writes an
   `ALLOW_DISPATCH` audit record before dispatch, applies a synchronous
   dispatch guard, limits time/capacity, validates the result, and records
   terminal and late-settlement outcomes. It is not the runnable composition.
2. [`SecBMcpServer`](../../src/mcp/secb-mcp-server.mjs) is the runnable native
   MCP protocol server. It performs protocol-era negotiation, JSON-RPC routing,
   caller lookup, rate limiting, classification checks, direct switch-based
   native dispatch, and one invocation-log write. Its caller projection and
   audit lifecycle are narrower than `McpGatewayCore`.
3. [`SecBMcpUpstreamProxy`](../../src/mcp/upstream-proxy.mjs) merges cached,
   sanitized upstream definitions into `tools/list` and dispatches namespaced
   calls. It independently performs caller lookup, exposure checks,
   classification, readiness, queue/concurrency, response-size checks, and
   audit. It bypasses `McpGatewayCore` policy, revocation, dispatch guard,
   credential isolation, and result-validation sequence.

[`secb-mcp-server-wiring.mjs`](../../tools/secb-mcp-server-wiring.mjs) composes
the runnable `SecBMcpServer`, while
[`start-secb-mcp-hub.mjs`](../../tools/start-secb-mcp-hub.mjs) wraps it with
the upstream proxy. The runnable path therefore has parallel native and
upstream authorization/dispatch logic. A control added to only one path can
drift or be bypassed through the other.

## Decision statement

How should SecB converge native and upstream MCP calls into one fail-closed
authorization, audit, dispatch, and result-control pipeline while preserving
tested MCP protocol behavior and allowing a reversible migration?

## Scope

This decision covers:

- the boundary between MCP protocol handling and governed invocation;
- common request, adapter, result, and audit lifecycles;
- native and upstream dispatch convergence;
- `tools/list` and `tools/call` policy parity;
- ordering of policy, revocation, audit, credentials, dispatch, and result
  validation;
- migration, shadow comparison, rollback, and duplicate-path retirement;
- resilience expectations for slow or unavailable upstreams.

This decision does not choose the local authenticated bridge, registry store,
event store or final event envelope, credential-store product, MCP protocol
revision, Context7 activation, or an A2A protocol. Those remain `DEC-03`
through `DEC-06` or separately governed work in
[`SECB-PRD-AGENT-MCP-001`](../03-project-control/candidates/secb-agent-registry-mcp-gateway-prd-001.md).

## Non-negotiable constraints

1. Every native and upstream call crosses one logical authorization and
   dispatch boundary.
2. Protocol parsing, authentication, authorization, capability selection, and
   execution remain distinct responsibilities.
3. Caller claims do not create identity, scope, roles, classification, or
   authority.
4. `tools/list` and `tools/call` use the same effective context, capability
   version, and policy source.
5. A hidden or previously advertised tool remains denied when called directly.
6. Unknown identity, session, capability, adapter, policy, revocation state,
   credential scope, or result disposition fails closed.
7. The durable audit allow event succeeds before an adapter is contacted.
8. Policy and metadata may narrow authority but never broaden it.
9. Credentials are resolved only after authorization and delivered only to the
   selected adapter for that invocation.
10. Upstream results are untrusted, bounded, and validated before return.
11. Shadow comparison never performs two real dispatches.
12. Migration must not double-count rate budgets, duplicate terminal audit
    events, or contact an upstream after denial.

## Decision drivers

| ID | Driver | Weight |
|---|---|---:|
| `DRV-01` | Security and complete control parity | 25 |
| `DRV-02` | Preserve MCP protocol and client behavior | 15 |
| `DRV-03` | Uniform native/upstream authorization | 20 |
| `DRV-04` | Reversible, staged migration | 15 |
| `DRV-05` | Reuse tested controls and evidence | 10 |
| `DRV-06` | Resilience and operability | 10 |
| `DRV-07` | Delivery cost | 5 |
|  | **Total** | **100** |

Scores use `1` (poor) through `5` (strong). Weighted totals are decision
support, not proof.

## Options considered

### Option A - Wrap the runnable stack inside `McpGatewayCore`

Keep the native server and upstream proxy substantially unchanged, then invoke
them as one adapter behind `McpGatewayCore`.

Benefits:

- low initial code movement;
- quick access to the stronger core checks;
- preserves most current protocol behavior.

Costs and risks:

- wrapped components still authorize and audit independently;
- nested checks can disagree, double-count, or create multiple terminal rows;
- `tools/list` remains outside the same capability decision;
- direct native/upstream paths remain callable.

### Option B - Port core controls into both runnable paths

Copy or reimplement missing `McpGatewayCore` checks in `SecBMcpServer` and
`SecBMcpUpstreamProxy`.

Benefits:

- preserves current runnable class structure;
- permits incremental delivery per path.

Costs and risks:

- continues two authorization implementations;
- every new policy, revocation, audit, credential, and result control changes
  twice;
- parity is test-dependent rather than structural.

### Option C - Shared invocation orchestrator with adapters

Keep an MCP protocol facade at the edge. Normalize an authenticated call into
one invocation contract and pass it to one orchestrator based on the proven
`McpGatewayCore` sequence. Convert native tools and upstream clients into
adapters that cannot authorize independently.

Benefits:

- one structural enforcement path for every tool;
- preserves protocol negotiation outside the governance kernel;
- reuses rather than duplicates the strongest controls;
- makes native/upstream parity directly testable;
- permits adapter-by-adapter cutover and rollback.

Costs and risks:

- requires contract extraction and controlled refactoring;
- native switch/proxy logic must separate adapter, catalog, and transport work;
- temporary compatibility paths need an exactly-one-dispatch rule;
- listing, audit, rate, and cancellation need explicit convergence tests.

### Option D - Replace the MCP stack wholesale

Replace the current server/proxy with a new SDK-based server and rebuild SecB
controls around it.

Benefits:

- could simplify long-term protocol conformance;
- provides a greenfield internal shape.

Costs and risks:

- an SDK does not supply SecB authority, audit, revocation, credentials, or
  evidence semantics;
- discards tested protocol and upstream lifecycle behavior;
- has the largest regression and delivery cost.

## Trade-off matrix

| Option | `DRV-01` 25 | `DRV-02` 15 | `DRV-03` 20 | `DRV-04` 15 | `DRV-05` 10 | `DRV-06` 10 | `DRV-07` 5 | Weighted result / 500 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| A - wrap runnable stack | 3 | 4 | 3 | 4 | 4 | 3 | 4 | 345 |
| B - duplicate controls into both paths | 3 | 4 | 2 | 3 | 3 | 3 | 3 | 295 |
| C - shared orchestrator and adapters | 5 | 4 | 5 | 4 | 5 | 4 | 2 | **445** |
| D - wholesale replacement | 3 | 2 | 4 | 1 | 1 | 3 | 1 | 245 |

Option C remains preferred unless SecB abandons uniform call-time governance.
Option D does not remove the need for the same SecB orchestrator.

## Recommendation candidate

Adopt **Option C**:

> SecB SHALL use one logical `InvocationOrchestrator` for every native and
> upstream MCP call. The MCP protocol facade SHALL normalize calls and encode
> responses but SHALL NOT authorize or dispatch tools directly. Native services
> and upstream clients SHALL be invoked only through adapters selected after
> server-derived identity, capability, policy, revocation, audit,
> rate/capacity, and credential checks.

The implementation may evolve `McpGatewayCore` into this boundary rather than
introducing a competing core.

## Candidate target boundaries

```text
Codex / Claude / other MCP harness
                  |
                  v
       authenticated local bridge
                  |
                  v
        MCP protocol facade
  (JSON-RPC, handshake, notifications)
                  |
      +-----------+------------+
      |                        |
 tools/list                tools/call
      |                        |
      v                        v
 caller-filtered       InvocationOrchestrator
 capability view       identity -> capability
      |                -> policy -> revocation
      |                -> rate/capacity
      |                -> audit-before-dispatch
      |                -> credential lease
      |                -> adapter -> result guard
      |                        |
      +------------------------+
                               |
                 +-------------+-------------+
                 |                           |
                 v                           v
          native adapters             upstream adapters
          (SecB services)        (Context7 and other MCPs)
```

| Component | Owns | Must not own |
|---|---|---|
| Authenticated bridge | peer/workload proof and transport binding | Agent authority or tool policy |
| MCP protocol facade | protocol, JSON-RPC, notifications, cancellation mapping, response encoding | direct dispatch or independent authorization |
| Registry/session resolver | server-derived effective context and revocation/version state | adapter execution |
| Capability catalog | versioned definitions, exposure metadata, adapter binding | identity or credentials |
| Invocation orchestrator | ordered enforcement, single dispatch, lifecycle audit, terminal disposition | protocol-era branching or process management |
| Credential broker | scoped, short-lived adapter credential leases | policy broadening or secret return |
| Native adapter | translate one permitted call into one SecB service call | identity, policy, or audit decisions |
| Upstream adapter/manager | readiness, transport, namespacing, pin validation, bounded call | caller authorization |
| Audit/event writer | durable ordered invocation events | acceptance of its own evidence |

## Common contracts

Exact schemas belong to an implementation work package. The minimum logical
request is:

```text
InvocationRequest
|-- request_id / trace_id
|-- effective_agent_session_context
|-- capability_id and observed capability version
|-- arguments
|-- purpose
|-- idempotency_key when applicable
`-- evidence_required
```

The effective context is server-derived and includes Agent, Runtime, Session,
project/work-package/workspace bindings, authorization/policy versions, roles,
authority and classification ceilings, approved tools/methods/skills, scopes,
expiry, evidence obligations, and revocation version.

```text
InvocationResult
|-- request_id
|-- disposition: ALLOW_RESULT | DENY | ERROR | TIMEOUT | CANCELLED
|-- public result or safe error
|-- capability and policy versions
|-- audit/event correlation
`-- evidence disposition
```

Denials do not expose secrets, policy internals, credentials, or upstream
private details.

## Candidate enforcement sequence

For each `tools/call`, the orchestrator:

1. validates request shape, size, authoritative time, and effective context;
2. verifies method permission, session validity, expiry, and revocation;
3. resolves an exact versioned capability and adapter;
4. intersects Agent, Session, Project, Work Package, workspace, capability,
   classification, and current policy ceilings;
5. reserves the shared caller rate and global/per-adapter capacity budget;
6. records denials or writes durable `ALLOW_DISPATCH`;
7. rechecks revocation and a synchronous dispatch guard immediately before
   adapter contact;
8. leases the minimum adapter-bound credential, if required;
9. invokes exactly one adapter with deadline and cancellation signal;
10. validates untrusted result schema/classification/secrets and response size,
    then releases the credential lease;
11. writes one terminal lifecycle disposition; and
12. drains and records late settlement without returning it after timeout or
    cancellation.

Any failure before step 9 proves that no native service or upstream transport
was contacted.

## Listing and call parity

`tools/list` is a security projection, not the authorization boundary.

- Native and cached upstream definitions enter one versioned capability
  catalog.
- Upstream names remain `<upstream_id>__<tool_name>`.
- Definitions remain sanitized and pinned before entering the catalog.
- Listing uses the same effective context and policy evaluator as call time.
- Call time repeats all checks against current state.
- Removed, hidden, stale, unready, fingerprint-changed, or revoked tools deny
  even when the caller learned their old names.
- A listing cache cannot grant authority or outlive policy, capability, or
  revocation versions.

## Audit and accounting

- One logical writer owns native and upstream invocation sequencing.
- Each request has one correlation identity and at most one real dispatch.
- Effective Agent/Session rate accounting is shared across native/upstream use.
- Per-adapter concurrency is an additional narrower limit.
- `ALLOW_DISPATCH` is durable before adapter contact.
- Audit failure denies and proves no adapter contact.
- Timeout/cancellation may produce a later settlement event but never a second
  result to the caller.
- Final event schema and persistence remain `DEC-04` and `DEC-05`.

## Resilience

- Optional upstream degradation does not remove healthy native capabilities.
- `tools/list` does not synchronously fan out to upstreams.
- Discovery and health refresh are bounded background operations.
- One slow upstream consumes only its own bounded queue/capacity plus its active
  global reservation.
- Queue overflow, readiness failure, timeout, malformed definition, response
  overflow, and fingerprint drift fail closed for that capability.
- Startup/shutdown retain orphan prevention and bounded draining.

## Migration and rollback

1. **Freeze behavior as evidence.** Capture golden protocol, notification,
   native, upstream, sanitization, fingerprint, readiness, timeout, rate,
   classification, audit-failure, and shutdown tests.
2. **Define seams.** Define request, result, catalog, adapter, audit lifecycle,
   and effective-context interfaces; adapt `McpGatewayCore` without rerouting.
3. **Adapt native dispatch.** Put native cases behind adapters. Route one
   read-only fixture first, then expand after parity and negative tests.
4. **Adapt upstream dispatch.** Keep transport, readiness, sanitization,
   namespace, fingerprint, queue, and timeout mechanics in the upstream
   manager; move authorization/accounting/result disposition to the
   orchestrator.
5. **Converge listing.** Project native and approved cached upstream tools from
   one caller-filtered catalog.
6. **Shadow decisions safely.** Compare old/new decisions, but select exactly
   one real dispatch. Divergence blocks cutover.
7. **Cut over by cohort.** Native fixture, upstream fixture, then bounded real
   capabilities, proving parity, no bypass, no duplicates, restart, and
   rollback after each.
8. **Retire duplicates.** Remove direct authorization/dispatch only after
   writer/call-path inventory and independent acceptance.

Rollback before retirement routes the cohort to the prior checkpoint. It never
enables both paths to dispatch the same request.

## Consequences

### Positive

- one structural boundary covers native and upstream tools;
- an approved Context7 upstream can use the same identity, policy, audit,
  credential, and result controls as native capabilities;
- protocol compatibility evolves independently of authorization;
- one usage stream can support monitoring without trusting harness-local logs;
- controls are implemented once.

### Negative

- requires careful refactoring of runnable behavior;
- temporarily retains compatibility seams and shadow decisions;
- listing/call parity needs a versioned capability catalog;
- shared orchestration is a critical dependency.

### Security and privacy

- centralized observation does not authorize unrestricted prompt/result
  capture;
- telemetry requires classification-aware minimization and redaction;
- credential material is excluded from request, result, and audit payloads;
- upstream content is foreign input, not trusted evidence or knowledge;
- monitoring access is itself policy- and classification-filtered.

## Risks

| ID | Risk | Control |
|---|---|---|
| `R-0011-01` | Compatibility layer preserves a bypass | Call-path inventory, inaccessible direct dispatch, negative tests |
| `R-0011-02` | Shadow mode performs two side effects | Decision-only shadow and exactly-one-dispatch assertion |
| `R-0011-03` | List and call evaluators drift | One evaluator and shared version assertions |
| `R-0011-04` | Audit/rate events duplicate | One request identity, writer boundary, and reservation owner |
| `R-0011-05` | Orchestrator creates a broad outage point | bounded dependencies, health gates, adapter isolation, rollback |
| `R-0011-06` | Foreign result reaches model context | schema/classification/secret/size validation |
| `R-0011-07` | Credential escapes adapter scope | post-authorization lease, adapter binding, no logging |
| `R-0011-08` | Protocol behavior regresses | retain facade and run client conformance fixtures |
| `R-0011-09` | Context revokes after allow | pre-dispatch recheck and synchronous guard |

## Quality scenarios

| ID | Scenario | Required response |
|---|---|---|
| `QS-0011-01` | Caller is unresolved, expired, or revoked | Same typed native/upstream denial; no adapter contact |
| `QS-0011-02` | `ALLOW_DISPATCH` audit write fails | Deny; native/upstream spy records zero calls |
| `QS-0011-03` | Caller guesses a filtered upstream name | Call-time policy denies |
| `QS-0011-04` | Capability is removed after listing | Current catalog denies the next call |
| `QS-0011-05` | Upstream fingerprint changes | Withhold/deny until governed reconciliation |
| `QS-0011-06` | One upstream times out | Safe terminal result; native and other healthy upstreams remain usable |
| `QS-0011-07` | Caller alternates native/upstream calls | One shared rate budget; no duplicate counting |
| `QS-0011-08` | Caller cancels and adapter settles late | No late return; capacity drains and lifecycle is audited |
| `QS-0011-09` | Credential has wrong adapter/scope | Deny; adapter receives no secret and is not contacted |
| `QS-0011-10` | Legacy/modern clients invoke equivalent tools | Same orchestrator and equivalent control outcome |
| `QS-0011-11` | Result is oversized, malformed, secret-like, or over-classified | Withhold with safe terminal disposition |
| `QS-0011-12` | Shadow decisions disagree | Cutover blocks; only selected path may dispatch |

## Verification obligations

Implementation must include:

- request/result/catalog/adapter contract tests;
- native/upstream policy and list/call parity tests;
- hidden/guessed and removed-after-list negative tests;
- audit-unavailable no-contact proof with adapter spies;
- live revocation immediately before dispatch;
- shared rate and global/per-adapter concurrency tests;
- credential scope and non-serialization tests;
- result schema, secret, classification, and size tests;
- timeout, cancellation, late-settlement, and capacity-drain tests;
- upstream readiness, sanitization, fingerprint, and restart tests;
- legacy/modern protocol and official client conformance tests;
- shadow divergence and exactly-one-dispatch tests;
- writer/call-path inventory proving no retirement bypass;
- restart/replay and rollback receipts;
- independent SEC abuse testing before activation.

## Evidence

| Claim | Evidence reference | Status |
|---|---|---|
| Stronger governed sequence exists | [`mcp-gateway-core.mjs`](../../src/gateway/mcp-gateway-core.mjs) | Verified source observation |
| Runnable native MCP uses direct dispatch | [`secb-mcp-server.mjs`](../../src/mcp/secb-mcp-server.mjs), [`secb-mcp-server-wiring.mjs`](../../tools/secb-mcp-server-wiring.mjs) | Verified source observation |
| Upstream calls use a proxy-specific path | [`upstream-proxy.mjs`](../../src/mcp/upstream-proxy.mjs), [`start-secb-mcp-hub.mjs`](../../tools/start-secb-mcp-hub.mjs) | Verified source observation |
| One upstream surface is proposed | [`ADR-0009`](0009-mcp-upstream-fronting.md) | Prior candidate decision |
| Product requires one pipeline | [`SECB-PRD-AGENT-MCP-001`](../03-project-control/candidates/secb-agent-registry-mcp-gateway-prd-001.md) | Draft requirement |
| Agent/Session projection is separate | [`ADR-0010`](0010-canonical-five-layer-registry-persistence.md) | Related candidate |

## Owners and approvals

| Role | Responsibility | Current disposition |
|---|---|---|
| ARCHI | Own orchestration and component boundaries | Unassigned |
| REV | Verify evidence, options, migration, and no-bypass claim | Required |
| QA | Convert scenarios into independent checks | Required |
| SEC | Review ordering, credentials, result trust, audit, and bypass controls | Required |
| OPS | Review readiness, limits, cancellation, shutdown, and rollback | Required |
| GOV | Accept, reject, or require rework | Required |

No approval is implied by repository presence or green producer checks.

## Supersession

- Refines but does not supersede [`ADR-0009`](0009-mcp-upstream-fronting.md).
- Consumes but does not accept
  [`ADR-0010`](0010-canonical-five-layer-registry-persistence.md).
- Conforms to
  [`ADR-SECB-AGENT-RUNTIME-001`](../decisions/ADR-SECB-AGENT-RUNTIME-001.md).
- If accepted, resolves `SECB-PRD-AGENT-MCP-001` decision `DEC-02`.
- Does not decide bridge transport, persistence, event schema, or protocol
  support.

## Limitations

- No runtime code was changed.
- Exact machine-readable contracts are not defined.
- The local bridge, physical stores, and final envelope remain undecided.
- No Context7 or other upstream was approved or activated.
- The branch has unrelated uncommitted candidates.
- This producer has not performed independent review.

## Required next-role action

1. `REV` verifies the three current paths and challenges scoring/cutover.
2. `SEC` reviews bypass, confused deputy, credential, result injection,
   revocation race, audit failure, and telemetry privacy.
3. `QA` turns the twelve scenarios into acceptance stubs with explicit
   no-contact and exactly-one-dispatch spies.
4. `OPS` evaluates readiness, timeout, cancellation, drain, restart, and
   rollback.
5. Human `GOV` accepts Option C, requests rework, or rejects it.

Until then, isolated contracts, adapters, and tests may be prepared on a
non-`main` branch, but the effective MCP path must not be replaced or activated.

## Change log

| Version | Date | Change |
|---|---|---|
| `0.1.0-draft` | 2026-07-31 | Initial single-pipeline convergence candidate |
