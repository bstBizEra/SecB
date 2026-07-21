# P0-19 Read-Only Self-Pilot — Candidate Advisory Packet

**Document ID:** SECB-P0-19-SELFPILOT-CAND-001
**Status:** DRAFT / CANDIDATE / NOT AUTHORIZED
**Producer:** claude-cortex-p0-19-selfpilot-01 (BST-SA cortex worker)
**Base:** main @ `385ac65943f2a5b158c8ec20a5fd947f06cd2987`
**Authority basis:** AMD-002 advise-and-proceed clause 3 (candidate implementation + advisory packet on a branch)

> **PLAIN STATEMENT (read first).** This candidate does **NOT** constitute P0-19
> completion, does **NOT** render the P0-20 governance verdict, and is **NOT**
> activation. It is a read-only composition of already-ratified primitives over
> fixture inputs, produced on a branch for independent review. Activation and the
> P0-20 verdict remain SEC/GOV-gated and out of scope.

## Advisory status fields

| Field | Value |
|---|---|
| `truth_status` | `verified_true` — every claim below is backed by executable code (`src/self-pilot/read-only-self-pilot.mjs`) and passing tests (`tests/p0-19-self-pilot.test.mjs`, 15/15). |
| `authority_status` | `advisory_only` — this packet recommends; it authorizes nothing. |
| `implementation_status` | `candidate` — a working read-only orchestration exists on the branch; the live/production wiring named under "What remains gated" is `missing`/`blocked`. |
| `risk_class` | `R3-adjacent` — this is candidate PREP that composes R0–R4 primitives read-only; it introduces no runtime authority and mutates no ratified primitive. Any step toward live wiring or activation is a separately-governed R3+ change. |

## What the candidate demonstrates

The candidate proves that SecB's governed evidence chain **composes and gates
correctly, read-only, end-to-end**, by running the real primitives over
[the queued P0-19 work package](wp-p0-19-read-only-self-pilot.work-package.yaml)
intent and the [read-only self-pilot spec](../self-pilot.md) / [ADR-0004](../../adr/0004-read-only-self-pilot.md).

Source: [`src/self-pilot/read-only-self-pilot.mjs`](../../../src/self-pilot/read-only-self-pilot.mjs)
(orchestration) + [`src/self-pilot/fixtures.mjs`](../../../src/self-pilot/fixtures.mjs)
(deterministic fixtures). Every composed primitive is left byte-identical (a
byte-identity guard in the test pins all 17 source files to their blob at
`385ac65`).

### The governed chain and the real primitive that gates each step

| # | Chain step | Composed primitive | Real gate exercised |
|---|---|---|---|
| 1 | Project Contract (fixture) | `contract-validator` | `project` schema + ACTIVE-effectiveness (deny unless effective) |
| 2 | authorized Work Package (fixture) | `work-package-service` | authority engine drives DRAFT→PLANNED→REVIEWED→AUTHORIZED against fixture grants; `resolveEffective` must ALLOW |
| 3 | registered agent identity | `runtime-registry` | register → APPROVED → ACTIVE → `resolve` quarantine gate |
| 4 | context receipt | `context-federation-service` | `mintReceiptDocument` + `issueReceipt` (effectiveness, scope-subset, survivor-set) |
| 5 | durable session (fixture) | `context-federation-service` | `verifyReceipt` read-only provenance (session binding) |
| 6 | runtime adapter (existing read-only facade) | `host-runtime-agent` | `resolveAdapter` (registry resolve; **no process spawn**) |
| 7 | workspace lease | `workspace-lease-policy` + `workspace-lease-ledger` | `mintLease` + durable `appendLease` + `evaluateLease` write-set containment (**no worktree materialized**) |
| 8 | observed execution | `host-runtime-agent` + `access-mode-policy` + `event-family-policy` | Observe-mode ladder (escalation denied) + family classification + read-only event emission |
| 9 | event + evidence | `governed-ledgers` + `evidence-envelope-service` | event chain verify + register/seal on the durable hash chain + SoD (producer self-verify **blocked**) |
| 10 | independent REV/QA slots | `evidence-envelope-service` (SoD) | recorded `PENDING_INDEPENDENT`, unassigned, **not self-approved** |
| 11 | GOV decision **SLOT** | operator-only | empty, `HUMAN_GOV_REQUIRED` — **the pilot never fills it** |
| 12 | outcome receipt (fixture) | `contract-validator` | `outcomeReceipt` schema; explicitly NON-EFFECTIVE |

### The replayable trace shape

`runReadOnlySelfPilot({ fixtures, now, ledgers })` returns a deep-frozen trace:

```
{
  schema: "secb.self-pilot.read-only-trace", schema_version: 1,
  candidate: true, p0_19_complete: false, p0_20_verdict_rendered: false, activation: false,
  mode: "READ_ONLY", read_only: true, authorized_execution: false, self_authorized: false,
  project_id, work_package_id, baseline, session_id, producer_instance_id,
  halted, halted_at, halt_reason, completed,
  steps: [ { index, step, primitive, gate, status: PASS|DENIED|SKIPPED, detail } x12 ],
  chain: { project_contract, work_package, agent_identity, context_receipt, durable_session,
           runtime_adapter, workspace_lease, observed_execution, event_and_evidence,
           independent_review, gov_decision, outcome_receipt },
  gov_decision: { slot: "GOV_DECISION", status: "PENDING_OPERATOR", authority: "HUMAN_GOV_REQUIRED",
                  rendered_by: null, verdict: null, effective: false },
  replay: <assembleReplayPackage view over the observed event/evidence/receipt/policy streams>,
  self_certification: { execution_authority: false, approval_authority: false, ready_for_operator_review }
}
```

The trace embeds no ambient-derived value, so re-running over the same fixtures
yields a **byte-identical** trace (proven by the determinism test). The `replay`
view is produced by the ratified `replay-assembler`, segregating the observed
streams and reconciling the event stream (no disorder/gap findings for the
three sequential read-only events).

### Fail-closed / deny-by-default proofs (executable)

- A Work Package that cannot reach `AUTHORIZED` (GOV grant withheld) **halts the
  chain** at `WORK_PACKAGE`; every later step is recorded `SKIPPED`.
- A lease request over-reaching the lease write-set is denied
  (`DENY_LEASE_WRITE_SET_EXCEEDED`); a contained request is allowed.
- Producer self-verification of evidence is denied (`DENY_VERIFIER_IS_PRODUCER`);
  unaccepted evidence never resolves as accepted.
- Escalation from `Observe` to `Control` is denied (`DENY_ACCESS_ESCALATION`).
- The GOV decision slot's `verdict` and `rendered_by` are **always null**; the
  module exports no verdict-setter and the completed run still leaves it empty.
- No real mutation/spawn/remote: the source references no process/network
  primitive, and all writes land only in the caller-injected ephemeral ledger
  directory. Omitting the injected ledgers denies with `DENY_CONFIG`.

## What remains GATED for actual P0-19 completion

Each item below is **not** delivered by this candidate. All are marked
`authority_status: execution_requires_operator` or `blocked`.

| Item | `implementation_status` | `authority_status` |
|---|---|---|
| Live runtime adapter wiring (real spawn/attach to a runtime) | `missing` | `blocked` |
| Real Host Runtime Agent PTY / host observation (not fixture events) | `missing` | `blocked` |
| P0-18 full conformance harness (V-001..V-020 over the live chain) | `partial` | `execution_requires_operator` |
| Durable governed evidence destination (not an in-memory/temp fixture ledger) | `missing` | `execution_requires_operator` |
| Independent REV + QA execution by distinct assigned actors | `missing` | `execution_requires_operator` |
| The P0-20 governance verdict (`PASS_FOR_P0_CONTROLLED_ACTIVATION`) | `missing` | `blocked` |
| Activation / controlled production | `blocked` | `blocked` |

See the [P0 backlog dependency chain](../../09-delivery/backlog-p0.md) (P0-18 → P0-19 → P0-20).

## Recommendation

Recommend that the operator and independent REV/QA review this candidate trace
and, if the composition is judged sound, schedule the still-gated items above as
separately-governed work. **Recommend improvements only; do not execute them.**

```yaml
self_certification:
  agent_id: claude-cortex-p0-19-selfpilot-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
