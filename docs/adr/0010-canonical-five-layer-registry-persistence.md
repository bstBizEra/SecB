# ADR-0010 — Canonical persistence and authority projection for the five-layer agent registry

## Document control

| Field | Value |
|---|---|
| ADR ID | `ADR-0010` |
| Version | `0.1.0-draft` |
| Status | `PROPOSED / NOT DECIDED — DRAFT / NOT EFFECTIVE` |
| Owner | SecB Architecture Authority — unassigned |
| Producer | Codex architecture planning session |
| Produced at | 2026-07-31 |
| Project / work | `SECB-PRD-AGENT-MCP-001` / `WP-00` |
| Repository baseline | `4844463b1c07985f0f8a73c37fe6fc1d41f8497d` on `feat/secb-ruflo-command-center` |
| Baseline condition | Dirty working tree; uncommitted agent-enrollment candidate present |
| Risk | Candidate `R3` — identity, lifecycle, authority projection, migration, and MCP access are affected |
| Required decision authority | Independent `REV`, `QA`, `SEC`, and human `GOV` |

## Authority boundary

This ADR records an architecture recommendation. It does not accept itself,
make a schema or registry effective, migrate a record, grant an Agent Instance
authority, activate an MCP caller, or supersede an approved decision.

Implementation, migration, activation, and removal of a compatibility path
require separately bounded work packages and their own evidence.

## Context

### Prior decision that remains controlling

[`ADR-SECB-AGENT-RUNTIME-001`](../decisions/ADR-SECB-AGENT-RUNTIME-001.md)
was approved by the human operator on 2026-07-25. It establishes five distinct
registry layers:

1. Provider;
2. Model;
3. Runtime;
4. Agent identity; and
5. Session.

It also states that SecB remains the governance and control plane, that a
discovered runtime cannot become active without conformance and operator
approval, and that credentials do not belong in prompts, agent records, or
committed MCP configuration.

This ADR does not reconsider those decisions. It addresses the implementation
question left open by them: which current code path becomes the authoritative
persistence, transition, and effective-resolution boundary.

### Observed implementation state

The codebase currently expresses the registry concept in overlapping forms:

- [`RuntimeRegistry`](../../src/registry/runtime-registry.mjs) validates
  `agent-registration` records, enforces separate evaluation and lifecycle
  transitions, and resolves approved/active Agent Instances for the runnable
  MCP server. It is process-local and its effective projection omits approved
  models, tools, MCP methods, skills, delegation rights, and policy version.
- [`five-layer-registry.mjs`](../../src/registry/five-layer-registry.mjs)
  implements Provider, Model, Runtime, Agent, and Session classes matching the
  approved conceptual model. The classes are process-local, accept incomplete
  relationships, use direct mutable maps for some transitions, and are not the
  runnable MCP identity source.
- [`SecBAgentRegistry`](../../src/gateway/secb-agent-registry.mjs) reads a
  simplified TOML definition for Ruflo and can construct an identity with
  configured roles and classification. It is an adapter-specific path rather
  than a canonical authority service.
- the working-tree
  [`AgentEnrollmentService`](../../src/services/agent-enrollment-service.mjs)
  correctly proposes minimum-authority `CANDIDATE / PENDING` registrations, but
  its receipt hashes and idempotency records are process-local.
- [`runtime-deployment.schema.json`](../../src/registry/schemas/runtime-deployment.schema.json)
  and [`agent-registration.schema.json`](../../contracts/agent-registration.schema.json)
  overlap on provider, runtime deployment, workload identity, lifecycle, and
  authority while using different state vocabularies and schema drafts.
- runnable MCP deployment reconstructs Agent Instances from a JSON seed. Seed
  flags can currently transition a registration to `APPROVED / ACTIVE` during
  startup.

The result is multiple writers and lifecycle vocabularies for one documented
system-of-record boundary. A caller may be a valid record in one registry and
unknown to another. The dashboard, Ruflo bridge, enrollment service, and MCP
gateway can therefore disagree about identity and state.

## Decision statement

How should SecB implement the already-approved five-layer registry so that
identity, lifecycle, authority, MCP permissions, sessions, migration, and
restart behavior have one fail-closed authoritative source without discarding
working code unnecessarily?

## Scope

This decision covers:

- canonical ownership of Provider, Model, Runtime Deployment, Agent Instance,
  and Session records;
- the relationship of Harness Profiles and Agent Profiles to those five layers;
- write, transition, replay, and effective-resolution boundaries;
- compatibility behavior for current registry classes and seed files;
- migration rules that prevent inferred authority; and
- the effective agent/session projection consumed by the MCP Gateway.

This decision does not choose:

- the physical MVP database or event-store technology;
- the local bridge transport;
- the gateway orchestration class;
- the credential-store product;
- the MCP protocol revision;
- Context7 activation; or
- an A2A task/delegation protocol.

Those remain separate decisions in
[`SECB-PRD-AGENT-MCP-001`](../03-project-control/candidates/secb-agent-registry-mcp-gateway-prd-001.md).

## Non-negotiable constraints

1. Preserve the approved five-layer conceptual model.
2. A runtime product, model, adapter, config file, seed, or harness cannot issue
   authority.
3. Installation and enrollment create candidates, not effective agents.
4. New Agent Instances begin with no roles, no tools, no methods, no skills, no
   delegation, `A0`, and the minimum classification ceiling.
5. Approval and lifecycle activation are distinct, attributable transitions.
6. Effective identity and authority are server-derived and restart-durable.
7. Migration cannot infer approval, activation, role, scope, or authority from
   a product name, config default, seed flag, or currently running process.
8. Unknown or contradictory source records fail closed.
9. Secret values are never stored in the registry.
10. Producer implementation and tests are not final registry or evidence
    acceptance.

## Decision drivers

| ID | Driver | Weight |
|---|---|---:|
| `DRV-01` | Conformance with the approved five-layer model | 20 |
| `DRV-02` | Server-derived authority and fail-closed behavior | 25 |
| `DRV-03` | Safe migration from current records and call sites | 15 |
| `DRV-04` | Restart durability, replay, and revocation | 15 |
| `DRV-05` | Operability and one system-of-record boundary | 10 |
| `DRV-06` | Reversibility and staged cutover | 10 |
| `DRV-07` | Delivery cost and reuse of tested components | 5 |
|  | **Total** | **100** |

Scores below use `1` (poor) through `5` (strong). Weighted totals are decision
support, not mathematical proof.

## Options considered

### Option A — Make the current `RuntimeRegistry` the canonical registry

Extend `RuntimeRegistry` until it owns Provider, Model, Runtime, Agent, and
Session data. Adapt the five-layer classes and Ruflo path to it.

Benefits:

- smallest change to the runnable MCP identity path;
- preserves the existing evaluation/lifecycle checks;
- low initial delivery cost.

Costs and risks:

- starts from an Agent Registration aggregate rather than the approved five
  distinct layers;
- encourages provider, model, runtime, agent, and session fields to remain one
  denormalized record;
- makes referential integrity and independent lifecycle ownership difficult;
- risks turning a compatibility class into a large central service.

### Option B — Adopt the current five-layer classes unchanged

Use the existing Provider, Model, Runtime, Agent, and Session classes as the
authoritative registry and repoint the MCP server.

Benefits:

- names and layers directly match the approved ADR;
- conceptually easy to explain;
- removes the need for a new domain model.

Costs and risks:

- current classes are process-local;
- Provider/Model/Runtime/Agent relationships are not consistently resolved
  before registration;
- Agent registration sets `active: true` immediately;
- lifecycle transitions are not decision-ledgered or version/CAS controlled;
- Session state is an unconstrained string;
- authority and method/tool scopes are incomplete;
- adopting them unchanged would convert prototype behavior into authority.

### Option C — Canonical five-layer contracts and repository with compatibility facades

Define canonical versioned records for the approved five layers and one
repository/transition service as the only authoritative writer and resolver.
Reuse existing validation, transition, ledger, and projection logic behind
compatibility facades while callers migrate.

Benefits:

- conforms to the approved model without treating prototype classes as
  authoritative;
- supports referential integrity, separate lifecycles, durable transitions,
  replay, and complete gateway projections;
- permits incremental migration of the runnable MCP server, dashboard, Ruflo,
  enrollment, and seeds;
- compatibility facades allow rollback before old writers are removed.

Costs and risks:

- larger design and migration effort;
- requires new canonical schemas or explicit convergence of existing schemas;
- temporarily operates adapters/facades beside the canonical service;
- needs strict controls to prevent a facade from becoming a second writer.

### Option D — Replace the five-layer model with a new unified identity aggregate

Create one new aggregate containing installation, runtime, model, agent, session,
capabilities, and authority, and retire the prior models.

Benefits:

- a single record can simplify some reads;
- greenfield schema could match the proposed gateway projection directly.

Costs and risks:

- contradicts the approved five-layer decision;
- couples independently changing entities;
- creates high migration and governance cost;
- makes session and runtime lifecycle changes rewrite identity aggregates;
- has the highest risk of accidental authority inheritance.

## Trade-off matrix

| Option | `DRV-01` 20 | `DRV-02` 25 | `DRV-03` 15 | `DRV-04` 15 | `DRV-05` 10 | `DRV-06` 10 | `DRV-07` 5 | Weighted result / 500 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| A — extend `RuntimeRegistry` | 2 | 3 | 4 | 2 | 2 | 4 | 5 | 290 |
| B — current five-layer classes unchanged | 5 | 1 | 2 | 1 | 2 | 3 | 4 | 240 |
| C — canonical contracts/repository + facades | 5 | 5 | 4 | 5 | 5 | 5 | 2 | **470** |
| D — new unified aggregate | 1 | 3 | 1 | 4 | 3 | 1 | 1 | 215 |

Sensitivity:

- if delivery speed is weighted much more heavily, Option A improves, but it
  still conflicts with the approved layer boundary;
- if no durable state is required, Option B improves, but restart durability is
  a product requirement and authority cannot safely depend on process memory;
- Option C remains preferred unless the prior five-layer decision is formally
  superseded or the product abandons durable, server-derived identity.

## Recommendation candidate

Adopt **Option C**:

> SecB SHALL implement the approved Provider, Model, Runtime, Agent, and Session
> layers as canonical versioned contracts backed by one authoritative
> repository and transition service. Current registries, seeds, enrollment, and
> adapter-specific registries SHALL become read or proposal compatibility
> facades during migration and SHALL NOT remain independent authority writers.

This is a recommendation at `PROPOSED / NOT DECIDED` status. It is not yet a
normative effective decision.

## Proposed canonical boundaries

### Layer 1 — Provider

Owns vendor/service identity and provenance. A Provider record:

- is descriptive, not authoritative for work;
- cannot grant roles, tools, classification, or mutation;
- is referenced by Model and Runtime Deployment records.

### Layer 2 — Model

Owns a versioned reasoning-model identity and declared/evaluated capability
metadata. A Model:

- belongs to one Provider;
- has evaluation and lifecycle metadata;
- can be selected only through policy;
- does not imply an Agent Instance or role.

### Layer 3 — Runtime Deployment

Represents one installed or remotely deployed harness runtime. It is the
approved ADR's Runtime layer and absorbs the product requirement previously
named `Harness Installation`.

It binds:

- runtime product and version;
- provider where applicable;
- host/deployment identity;
- executable or endpoint reference;
- adapter and conformance version;
- supported transports and telemetry;
- workload public-key/credential reference;
- runtime lifecycle and health; and
- supported capability claims.

A Harness Profile is reusable descriptive/evaluation metadata referenced by a
Runtime Deployment. It is not a sixth authority-bearing registry layer.

### Layer 4 — Agent Instance

Represents the governed SecB worker identity. It binds:

- one Runtime Deployment;
- an Agent Profile reference;
- permitted models;
- roles;
- authority and classification ceilings;
- approved tools, MCP methods, skills, and delegation rights;
- repository and environment scopes;
- evaluation status;
- lifecycle state;
- evidence obligations; and
- record/decision version.

An Agent Profile is a reusable policy candidate. Instantiating a profile does
not approve or activate an Agent Instance.

### Layer 5 — Session

Represents one short-lived execution/authentication context. It binds:

- one Agent Instance;
- one Runtime Deployment and workload proof;
- project and Work Package where required;
- workspace lease and baseline where required;
- authorization and policy versions;
- issue/expiry/revocation state;
- trace/correlation identity; and
- session lifecycle.

A Session never broadens its Agent Instance, Project Contract, Work Package, or
capability ceilings.

## Authoritative service responsibilities

One logical `RegistryService` boundary SHALL, if this ADR is accepted:

1. validate closed canonical records;
2. enforce cross-layer referential integrity;
3. enforce initial-state and transition rules;
4. record decisions and state changes append-only before exposing new effective
   state;
5. use version/CAS and idempotency controls;
6. replay authoritative state after restart;
7. resolve effective Agent and Session contexts;
8. recheck revocation and validity for each effective resolution;
9. expose classification-filtered read projections; and
10. return typed denials for missing, contradictory, stale, corrupt, or
    unauthorized records.

Physical storage remains replaceable behind this boundary. ADR-0010 defines
logical authority, not a database product.

## Effective gateway projection

The gateway SHALL consume a server-derived projection rather than a caller
claim or raw registry record:

```text
EffectiveAgentSessionContext
├── provider_id
├── model_id and model_policy_version
├── runtime_deployment_id and runtime_record_version
├── agent_profile_id
├── agent_instance_id and agent_record_version
├── session_id and session_record_version
├── project_id
├── work_package_id
├── workspace_lease_id
├── authorization_id and policy_version
├── permitted_roles
├── authority_ceiling
├── max_data_classification
├── approved_tools
├── approved_mcp_methods
├── approved_skills
├── delegation_rights
├── repository_scopes
├── environment_scopes
├── evidence_obligations
└── valid_until / revocation_version
```

Rules:

- the projection is the intersection of all effective records and policy;
- unknown, absent, stale, expired, revoked, or incomparable dimensions deny;
- arrays default to empty, never unrestricted;
- the projection contains credential references only where required and never
  secret material;
- `tools/list` and call-time authorization use the same projection version.

## Transition model

### Runtime Deployment

Retain the approved runtime onboarding intent:

```text
DISCOVERED
→ INSPECTED
→ CONFORMANCE_PENDING
→ APPROVAL_PENDING
→ ACTIVE
→ DEGRADED / QUARANTINED
→ RETIRED
```

Exact recovery edges require a schema/state-machine work package. No prototype
transition is adopted merely by appearing here.

### Agent Instance

Preserve separate axes already enforced by `RuntimeRegistry`:

```text
Evaluation: CANDIDATE → APPROVED ↔ SUSPENDED → REVOKED
Lifecycle:  PENDING → ACTIVE ↔ DEACTIVATED → TERMINATED
```

`REVOKED` and `TERMINATED` are terminal. Resolution requires
`APPROVED + ACTIVE` and all parent records effective.

### Session

Candidate lifecycle:

```text
CREATED
→ IDENTITY_BINDING
→ READY
→ RUNNING
→ DRAINING
→ COMPLETED / FAILED / CANCELLED / REVOKED / EXPIRED
```

Exact transitions and terminal semantics require an executable contract.

## Compatibility and migration

### Compatibility roles

| Current component | Candidate migration role |
|---|---|
| `RuntimeRegistry` | Read/resolve compatibility facade for Agent Instance callers; no independent store after cutover |
| five-layer registry classes | Domain/API compatibility facade or retired prototype after canonical services replace them |
| `SecBAgentRegistry` | Ruflo discovery/enrollment proposal adapter only |
| `AgentEnrollmentService` | Proposal API using canonical durable repository, receipt store, and idempotency ledger |
| registry seed | One-time import/bootstrap candidate input; flags are not authority |
| adapter constants | Candidate catalog seeds, never effective registrations by import alone |
| dashboard static arrays | Removed or isolated as explicit demo fixtures |

### No-elevation migration rule

Migration SHALL NOT translate ambiguous source state into effective authority.

Unless an imported record is bound to an independently valid, exact, effective
decision:

```text
evaluation_status = CANDIDATE
lifecycle_state = PENDING
authority_ceiling = A0
max_data_classification = PUBLIC
permitted_roles = []
approved_models = []
approved_tools = []
approved_mcp_methods = []
approved_skills = []
delegation_rights = []
repository_scopes = []
environment_scopes = []
```

Specific implications:

- `active: true` in the prototype Agent registry does not become `ACTIVE`;
- configured TOML roles do not become permitted roles;
- Ruflo type or swarm membership does not create authority;
- `approve: true` or `activate: true` in a seed is treated as a source claim
  unless it references an effective authority record;
- a running PID or successful MCP handshake does not prove registration;
- missing parent references quarantine the child record;
- contradictory duplicate IDs block migration rather than selecting one
  silently.

### Staged cutover

1. Freeze and inventory source shapes read-only.
2. Define canonical schemas and transition contracts.
3. Generate a no-write migration report with source fingerprints.
4. Import candidates into an isolated target store.
5. Compare counts, identities, relationships, ceilings, and effective-state
   deltas.
6. Run negative no-elevation, restart, corruption, replay, and revocation tests.
7. Place compatibility facades in read mode.
8. Repoint one consumer at a time: enrollment, MCP resolution, sessions, Ruflo,
   API/dashboard.
9. Prove no old writer remains.
10. Remove or retire old paths only after independent review and a rollback
    checkpoint.

## Consequences

### Positive

- implements rather than reopens the approved five-layer model;
- creates one system of record for agent/runtime/session identity;
- makes full per-agent MCP authorization available to the gateway;
- supports restart-safe enrollment receipts, idempotency, revocation, and
  sessions;
- separates descriptive profiles from effective identities;
- allows gradual migration and rollback;
- makes dashboard and telemetry projections consistent with gateway resolution.

### Negative

- requires schema convergence and migration code;
- temporarily increases code paths while facades exist;
- requires stronger integration tests across registry, gateway, enrollment,
  sessions, Ruflo, and dashboard;
- forces currently active-looking prototype records back to candidates unless
  exact effective authority exists;
- does not by itself select or implement the physical persistence technology.

### Operational

- startup must verify and replay registry state before accepting authenticated
  sessions;
- registry corruption or unavailable authoritative state makes agent resolution
  unavailable;
- backup, restore, compaction, migration, and revocation become OPS
  responsibilities;
- compatibility facades need telemetry and a retirement date.

### Security and privacy

- workload public-key or sealed credential references may be stored; private
  keys and reusable secret values may not;
- list/query projections must apply classification and caller scope;
- registry events are security-relevant metadata with retention controls;
- a profile, provider, model, or runtime capability claim remains untrusted
  until evaluated.

## Risks

| ID | Risk | Control |
|---|---|---|
| `R-0010-01` | A compatibility facade writes around the canonical service | Make facades read/propose only; test writer inventory |
| `R-0010-02` | Migration elevates prototype or seed records | Mandatory no-elevation defaults and exact authority references |
| `R-0010-03` | Two stores produce split-brain state during cutover | Single-writer phase, checkpoint comparison, fail on divergence |
| `R-0010-04` | Complete gateway projection leaks private fields | Purpose-built projection contract and classification tests |
| `R-0010-05` | New repository becomes a central failure point | integrity checks, backup/restore, bounded health, fail-closed resolution |
| `R-0010-06` | State vocabularies are combined incorrectly | explicit per-entity transition contracts and migration mapping |
| `R-0010-07` | Approved five-layer ADR and this refinement drift | conformance check and supersession links |

## Quality scenarios

| ID | Scenario | Required response |
|---|---|---|
| `QS-0010-01` | SecB restarts after two candidates, one active agent, and one revocation | Same effective resolutions and denials are reproduced from durable state |
| `QS-0010-02` | A seed claims `approve: true` with no effective decision | Imported Agent Instance remains `CANDIDATE / PENDING / A0 / PUBLIC` |
| `QS-0010-03` | Codex changes its asserted Agent Instance ID to Claude's ID | Session/installation binding denies before gateway dispatch |
| `QS-0010-04` | Agent is approved but Runtime Deployment is quarantined | Effective session and gateway resolution deny |
| `QS-0010-05` | Agent tool allowlist changes while a session is active | Next resolution observes the new policy/revocation version and denies removed tools |
| `QS-0010-06` | Source registries contain the same ID with conflicting roles | Migration blocks and produces a contradiction finding |
| `QS-0010-07` | Canonical store integrity cannot be verified | No new session becomes ready and no Agent Instance resolves effective |

## Verification obligations

An implementation work package derived from this ADR must include:

- schema and referential-integrity tests for all five layers;
- executable transition tests per entity;
- durable restart/replay tests;
- idempotency and version-conflict tests;
- migration fixtures for every current registry shape;
- positive exact-authority preservation tests;
- negative no-elevation tests;
- corruption, truncation, duplicate, and contradictory-source tests;
- session expiry and live revocation tests;
- complete gateway projection tests, including empty-default permissions;
- classification-filtered registry query tests;
- no-secret-field/value tests;
- a read-only migration report and rollback receipt; and
- independent comparison of source and migrated state.

## Evidence

| Claim | Evidence reference | Status |
|---|---|---|
| Five registry layers are already approved | [`ADR-SECB-AGENT-RUNTIME-001`](../decisions/ADR-SECB-AGENT-RUNTIME-001.md) | Approved prior decision |
| Harnesses do not own authority | [`ADR-0006`](0006-harness-neutral-authority.md) | Accepted design baseline |
| `RuntimeRegistry` governs runnable MCP caller resolution | [`runtime-registry.mjs`](../../src/registry/runtime-registry.mjs), [`secb-mcp-server-wiring.mjs`](../../tools/secb-mcp-server-wiring.mjs) | Verified source observation |
| Current five-layer classes are separate in-memory prototypes | [`five-layer-registry.mjs`](../../src/registry/five-layer-registry.mjs) | Verified source observation |
| Ruflo registry can assign configured roles independently | [`secb-agent-registry.mjs`](../../src/gateway/secb-agent-registry.mjs) | Verified source observation |
| Enrollment is proposal-only but process-local | [`agent-enrollment-service.mjs`](../../src/services/agent-enrollment-service.mjs) | Working-tree candidate observation; not accepted |
| Agent and Runtime Deployment schemas overlap and use different lifecycle vocabularies | [`agent-registration.schema.json`](../../contracts/agent-registration.schema.json), [`runtime-deployment.schema.json`](../../src/registry/schemas/runtime-deployment.schema.json) | Verified contract observation |
| Product requires canonical convergence | [`SECB-PRD-AGENT-MCP-001`](../03-project-control/candidates/secb-agent-registry-mcp-gateway-prd-001.md) | Draft product requirement |

## Owners and approvals

| Role | Responsibility | Current disposition |
|---|---|---|
| ARCHI | Own decision and canonical boundary | Unassigned |
| REV | Verify evidence, alternatives, and compatibility consequences | Required |
| QA | Convert quality scenarios into independent acceptance | Required |
| SEC | Review identity, migration, authority, session, and projection controls | Required |
| OPS | Review persistence, backup, replay, cutover, and rollback | Required |
| GOV | Decide, reject, or require rework | Required |

No approval is implied by repository presence, producer verification, or a green
documentation validator.

## Review triggers

Review or supersede this ADR if:

- the five-layer prior decision is formally superseded;
- SecB becomes multi-tenant or multi-host;
- a remote identity provider becomes authoritative;
- the physical store cannot meet replay, CAS, integrity, or recovery needs;
- a harness cannot bind a distinct Runtime Deployment or session identity;
- A2A requires a separately authoritative Agent Card or task identity;
- migration cannot avoid ambiguous privilege translation; or
- measured operational cost makes the single logical repository unsuitable.

## Supersession

- Refines, but does not supersede,
  [`ADR-SECB-AGENT-RUNTIME-001`](../decisions/ADR-SECB-AGENT-RUNTIME-001.md).
- Conforms to [`ADR-0006`](0006-harness-neutral-authority.md).
- If accepted, it resolves the persistence/integration portion of
  `SECB-PRD-AGENT-MCP-001` decision `DEC-01`.
- It does not change [`ADR-0009`](0009-mcp-upstream-fronting.md); the gateway
  convergence decision remains separate.

## Limitations and unresolved items

- No physical persistence engine is selected.
- No canonical schema has been implemented.
- No existing record has been migrated or reclassified.
- The exact Runtime Deployment recovery edges remain to be designed.
- The exact Session contract and workload-proof mechanism remain separate work.
- The working-tree enrollment candidate is evidence of current direction, not
  an accepted implementation baseline.
- This producer has not performed independent review.

## Required next-role action

1. Independent `REV` verifies the prior-decision interpretation and the current
   registry/source observations.
2. `SEC` challenges no-elevation migration, workload identity references,
   session revocation, and gateway projection privacy.
3. `QA` converts the seven quality scenarios into conformance stubs.
4. `OPS` evaluates candidate physical stores under restart, lock, backup,
   corruption, recovery, and Windows/WSL constraints.
5. Human `GOV` decides whether to accept Option C, require rework, or reject the
   candidate.

Until those actions occur, implementation may prepare isolated candidates but
must not replace the effective registry path or activate migrated identities.

## Change log

| Version | Date | Change |
|---|---|---|
| `0.1.0-draft` | 2026-07-31 | Initial candidate refining the approved five-layer registry decision |
