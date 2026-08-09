# Wiring Completion — First-Principles Analysis

## Document Control

| Field | Value |
|---|---|
| Artifact ID | SECB-PLAN-WIRING-001 |
| Version | 1.0.0-draft |
| Status | DRAFT / NOT EFFECTIVE — PLAN stage artifact, no code changed |
| Date | 2026-08-09 |
| Author | Claude (Motor Agent) |
| Loop stage | `BOPEN-ENG-LOOP-001` PLAN, per `SECB-AGENTS-AMD-004` |
| Governs | The request "make the wired portion 100%" |

This is the PLAN artifact the loop requires before ACT. It changes no code. Per
`SECB-GOV-SURFACE-001` §2 it carries invariants, a trade-off analysis, a refusal
matrix, and a sequenced plan.

---

## 1. Measurement, and a correction to the measurement

| | |
|---|---|
| `src/**` files | 122 |
| Reachable from the MCP runtime | 44 (36%) |
| Reachable from any CLI | 55 (45%) |
| Reachable from the library export | 50 (41%) |
| **Reachable from any of the three** | **64 (52%)** |
| **Unreached** | **58** |

**The first two figures reported for this were too low, and the reason is worth
recording.** Reachability was first measured by following `from "…"` import
statements. SecB loads modules through registry tables and dynamic import —
`src/audit/run.mjs` holds `{ id: "declaration", path: "./checks-declaration.mjs" }`
entries and calls `await import(mod.path)` — so a static import scan reports
modules as orphaned that are in fact loaded on every run. Any relative `.mjs`
string literal is now treated as an edge, which is the shape this codebase
actually uses. A registry-driven architecture defeats static reachability by
construction; measuring it that way understates wiring and would have sent this
plan after files that were never unwired.

---

## 2. "100%" is not a bindable goal

Of the 58 unreached files, **21 name their own gate** — `R3`, `R4`,
`operator-gated`, `SEC/GOV`, or activation — in their own source:

```text
control/approval-binding            control/integration-collision-forecast
control/policy-decision-point       control/risk-registry
control/workspace-lease-policy      ledger/skill-promotion-ledger
ledger/skill-revocation-ledger      ledger/workspace-lease-ledger
live/access-mode-policy             live/event-family-policy
registry/skill-candidate-registry   security/redaction-policy
self-pilot/read-only-self-pilot     services/candidate-source-port
services/evidence-envelope-service  services/goal-graph-service
services/knowledge-claim-service    services/knowledge-linkage-service
services/memory-candidate-provider  services/memory-gateway-service
skills/package-descriptor-mapper
```

Wiring these is **activation, not implementation**. AMD-002's retained hard gates
place activation with the operator, and `AGENTS.md` working rule 5 places it
outside agent authority entirely. An agent that wired them would be
self-authorizing the exact class of change the gate exists to hold.

So the honest target is:

| | Files | Who |
|---|---|---|
| Already reachable | 64 | done |
| Wireable by an implementation slice | **37** | agent work |
| Requires a governance decision first | **21** | operator / GOV |

**101 of 122 (83%) is the ceiling for agent work.** The last 21 are not a backlog
item; they are a queue of decisions.

---

## 3. Invariants

1. **Wiring a gated primitive is activation.** No slice wires any file in the
   21-file set. The set is derived from the files' own text, not from judgement.
2. **Wiring must not weaken a fail-closed default.** A primitive that denies when
   unwired must deny identically when wired. The wiring slice proves this, it
   does not assume it.
3. **Reachability changes the exposed surface.** Anything newly reachable from
   the MCP runtime may add tools; every added tool is classified read-only or
   mutating in `tool-catalog.mjs`. The existing test that invokes every
   zero-argument tool and fails on filesystem change is the check that this was
   not skipped.
4. **Inventory follows code in the same commit.** `manifest.complete` enforces it.
5. **A module with no ratified completion verdict is not wired.** Wiring asserts
   the primitive is ready; the verdict is what establishes that, and inventing it
   from the diff is the substitution this loop exists to prevent.

---

## 4. Trade-off analysis

**Option A — one slice wiring all 37.**
Fastest to state, unreviewable in practice: 37 files across 13 directories in one
diff, where a single fault contaminates the whole batch and the bisect surface is
the entire slice. Rejected.

**Option B — one slice per module, sequenced. Recommended.**
13 slices, each small enough to review, each with its own acceptance checks, each
independently revertible. Matches the `MOD-*` work-package structure the project
already runs on, so each slice can carry its module's existing verdict as the
readiness evidence invariant 5 requires. Slower, and that is the cost being
bought.

**Option C — wire on demand, when a named consumer needs it.**
Smallest possible change and strongest justification per change, since nothing is
wired without a caller. But it leaves the gap open indefinitely and gives no
answer to the question actually asked. Appropriate for the plugins and adapters,
where a consumer genuinely may never appear.

**Recommendation: B for the core, C for `plugins/` and the two `ui/` projections.**

---

## 5. Refusal matrix

The slice REFUSES, fail-closed, to:

| # | Condition | Why |
|---|---|---|
| R1 | Wire any file naming `R3`, `R4`, `operator-gated`, `SEC/GOV`, or activation | Activation is not an agent act (AMD-002 retained gates) |
| R2 | Wire a primitive whose module has no ratified completion verdict | Wiring asserts readiness; only the verdict establishes it |
| R3 | Add an MCP tool without classifying its mutation status | A tool inherits `readOnlyHint: true` silently otherwise |
| R4 | Wire anything that turns a fail-closed default open | The deny is the feature |
| R5 | Re-pin any guard the wiring trips, in the same slice | That is the self-approval shape; leave it red and route it |
| R6 | Delete an unreached file instead of wiring it, without a disposition | "Unused" is a claim about the current tree, not about intent |

---

## 6. Sequenced plan

Ordered by dependency, then by whether the module already carries a verdict.

| # | Module | Files | Notes |
|---|---|---|---|
| 1 | `ops` | 3 | `kpi-registry` → `scorecard-assembler` → `cadence-policy`; verdict FINISHED |
| 2 | `ledger` | 3 | checkpoint, delegation, integration-queue; all pure ledgers |
| 3 | `control` | 7 | write-set, overlap, retry, escalation, delegation-gate, drift comparator, bootstrap pair |
| 4 | `gateway` | 4 | `mcp-gateway-core` is 810L and the largest single risk — its own slice |
| 5 | `bridge` | 3 | local-bridge trio, contract-complete |
| 6 | `registry` | 2 | five-layer, ruflo-swarm-config |
| 7 | `skills` | 2 | manifest-composition, promotion-evaluator |
| 8 | `live` | 1 | replay-assembler |
| 9 | `events` | 1 | event-normalizer |
| 10 | `audit` | 2 | corpus-expectation, packs — not in the checks table; confirm intent first |
| 11 | `services` | 1 | knowledge-candidate-provider |
| 12 | `ui` | 2 | Option C — wire when the dashboard consumes them |
| 13 | `plugins` | 4 | Option C — adapters for systems not in use |
| 14 | `self-pilot` | 1 | `fixtures.mjs` only; the pilot itself is gated |

Each slice: declare scope and acceptance checks, wire, run `npm test` and
`node tools/validate-foundation.mjs` after the final change, report exact
results, keep MANIFEST accurate in the same commit.

---

## 7. Addendum — the gated set is 17, not 21

Re-checked by reading each file's actual text rather than trusting the keyword
match that produced §2. **Four of the 21 are not gated at all**, and no decision
was needed to establish that:

| File | Why it is not gated |
|---|---|
| `control/risk-registry.mjs` | `R3`/`R4` appear as **data**. It is the frozen, deny-by-default table that *defines* R0–R4 — it answers "what does R3 require?", it is not held by R3. |
| `services/knowledge-linkage-service.mjs` | Its own header: *"knowledge-claim.schema.json is an R3 contract change (G7); sidecar records **keep S2 at R2**"*. The R3 belongs to a schema change the service deliberately avoids. |
| `skills/package-descriptor-mapper.mjs` | The only occurrence is `const RISK_CLASSES = new Set(["R0", …, "R4"])` — a validation enum. |
| `services/memory-candidate-provider.mjs` | *"reclassified MOD-MEM S3 from R3 → R2 on 2026-07-22 (operator decision …), … authorized R2 producer work, NOT a self-authorized gate change … PURE MAPPER, R2, ADDITIVE ONLY"*. The gate was lifted by an operator decision three weeks ago; the file records it. |

Revised:

| | Files |
|---|---|
| Already reachable | 64 |
| Wireable by an implementation slice | **41** |
| Requires a governance decision first | **17** |

**The reason for the error is the same one that produced the reachability
correction in §1, in a different costume.** There, following `import` statements
missed modules loaded through registry tables. Here, matching the string `R3`
could not distinguish a file *held by* a risk class from a file that is a *table
of* risk classes, or one whose header narrates the class being lifted. Both
times the shape of the code defeated the naive measure, and both times the fix
was to read what the code actually does instead of what a pattern says about it.

The same caution applies to the remaining 17: they are gated according to their
own current text, which is better evidence than a keyword but is still the file's
self-report. Before any of the five decision clusters is put to GOV, the governing
record for that cluster should be read, not the source comment.

## 8. What this analysis does not do

It does not begin ACT. It does not wire anything, and it does not decide that
wiring should happen — that is a scope question for the operator, and the answer
"83%, then 21 decisions" may be a reason to prioritise the 21 instead.

```yaml
truth_status: verified_true      # counts measured, and the measurement method
                                 # corrected once and re-run
authority_status: advisory_only
implementation_status: candidate
risk_class: medium
```
