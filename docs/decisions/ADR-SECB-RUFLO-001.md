# ADR-SECB-RUFLO-001 — SecB Governed Ruflo Swarm Execution Provider

**Status:** APPROVED  
**Decision Date:** 2026-07-25  
**Authority:** HUMAN-OPERATOR-001 (Engineering Authority)  
**Successor Work Item:** SECB-RUFLO-P0-001

---

## Decision

**APPROVE OPTION C — REVISED AS A GOVERNED EXTERNAL EXECUTION PROVIDER**

Ruflo SHALL run independently from SecB and SHALL NOT be imported as an npm dependency, Git submodule, embedded source tree, or internal SecB workflow authority.

### Authoritative Division

```
SecB  = Constitution + Authority + Work + Evidence + Governance
Ruflo = Planning + Swarm Coordination + Agent Execution + Local Working Memory
```

### Combined Operating Model

```
Human Intent
→ SecB Project and Work Governance
→ SecB issues bounded Execution Contract
→ Ruflo plans and executes through its swarm
→ SecB observes, authorizes, verifies and records
→ Independent review and QA
→ Human governance decision
→ Outcome and controlled learning
```

---

## Governing Rule

```
Ruflo may decide HOW to execute an authorized objective.

Ruflo may NOT decide WHETHER the objective, scope, authority,
evidence or final transition is authorized.
```

---

## Integration Channels

| Channel | Transport | Purpose |
|---|---|---|
| A — Control API | REST HTTP | State-changing commands (start, pause, cancel, steer, quarantine) |
| B — Event Ingress | HTTP + WebSocket/SSE | High-volume operational telemetry, append-only event ledger |
| C — MCP Gateway | MCP JSON-RPC | Bounded capability access, context retrieval, artifact submission |

## Port Topology

| Port | Service | Purpose |
|---|---|---|
| `3000` | SecB Control Plane API | REST control and query API |
| `3001` | SecB Live Event Gateway | WebSocket/SSE |
| `3002` | Ruflo Web UI | Native Ruflo dashboard |
| `3003` | Ruflo MCP | Ruflo MCP service |
| `3004` | Ruflo Control Adapter | Ruflo control API/hooks |
| `3005` | SecB MCP Gateway | SecB capabilities for agents |
| `4317` | OTel Collector gRPC | Telemetry |
| `4318` | OTel Collector HTTP | Telemetry |

---

## Runtime Hierarchy

```
Provider
→ Runtime Product
→ Runtime Deployment
→ Agent Profile
→ Agent Instance
→ Governed Session
```

Reference deployment: `RT-RUFLO-LOCAL-001` (see `src/registry/runtime-deployments/RT-RUFLO-LOCAL-001.yaml`)

---

## P0 Work Streams

| Stream | Name | Stage |
|---|---|---|
| P0-A | Runtime Registration | 1 |
| P0-B | Execution Contract | 2 |
| P0-C | Event Adapter | 1 |
| P0-D | Control Adapter | 2 |
| P0-E | MCP Gateway | 2 |
| P0-F | Swarm Projection UI | 1 |
| P0-G | Evidence Integration | 2 |
| P0-H | Security and Recovery | 3 |

## Delivery Stages

| Stage | Name | Gate |
|---|---|---|
| 1 | Read-Only Observation | Stable identity, ordered events, heartbeats, replay |
| 2 | Governed Dispatch | Scope enforcement, Context Receipt, budget, cancellation |
| 3 | Bounded Mutation | Workspace lease, host telemetry, independent REV+QA |
| 4 | Multi-Runtime Collaboration | Cross-runtime handoffs, common evidence |

## P0 Pilot

Read-only SecB repository assessment via Ruflo research swarm.  
See `docs/pilots/SECB-RUFLO-P0-PILOT.md` for full spec.

---

## Superseded Decisions

- Ruflo-as-npm-dependency (Option A) — REJECTED
- Ruflo-as-git-submodule (Option B) — REJECTED
- The three-item "HTTP emitter + startup connector + port config" framing — SUPERSEDED by this ADR
