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

## 8. Addendum 2 — the gates are mostly not on these files

Checking the governing records instead of the source comments, as §7 said must
happen before anything went to GOV, dissolves most of the remaining 17.

**Two modules had their risk class lowered by explicit operator decision on
2026-07-22, and the source comments predate it:**

| Module | Record |
|---|---|
| MOD-MEM | S3 candidate provider + compaction floor — *"operator R3→R2, 2026-07-22"*, ratified via PR #111 |
| MOD-SKILL | S1 intake, S2 promotion ledger, S3 revocation components 1+2 — *"operator R3→R2, 2026-07-22; component 3 EXCLUDED by scope discipline"*, ratified via PR #111 |

**And MOD-EVID's R4 was authorized when it was delivered:** *"S2 verify+accept
ladder (**operator-authorized R4**)"*, `FINISHED_WITH_TRACKED_FOLLOWUPS`, REV
`f403119`, PR #26. The R4 that appeared to gate
`services/evidence-envelope-service.mjs` was granted three weeks ago.

Every module owning one of the 17 carries a ratified completion verdict —
MOD-GOV, MOD-WORK, MOD-RUNTIME, MOD-WSPACE (NOT_FINISHED, then flipped in
rev-002), MOD-EVID, MOD-LIVE, MOD-MEM, MOD-KNOW, MOD-SKILL, MOD-INTEG.

### The distinction that resolves it

Reading the gate sentences together, they say the same thing in fifteen
different ways:

> The primitive is delivered and R2. Putting it in a position where it **denies
> live traffic** is the later, separately-governed slice.

`security/redaction-policy.mjs` is the clearest: the evaluator is delivered; what
is SEC/GOV-gated is *"block-or-quarantine BEFORE writing"*. `live/access-mode-policy.mjs`
deliberately does not import the transition engine. `ledger/skill-revocation-ledger.mjs`
holds components 1+2 (R2) and names component 3 as the operator-gated follow-up —
which is not in the file.

So there are two different acts, and the analysis had been treating them as one:

| Act | Class |
|---|---|
| Making a delivered primitive **reachable** — constructed, exported, importable | R2 implementation, pre-authorized under AMD-002 §1 |
| Putting a primitive in an **enforcing** position where it denies live traffic | the gated act, and none of these 17 files performs it |

**Wiring in the sense this plan means — reachability — is not the gated act.**
The gate stands on the enforcement slice that would follow, and no file here
contains one.

### Genuinely still gated

| Item | Why |
|---|---|
| MOD-SKILL revocation **component 3** | explicitly excluded by scope discipline; not present in any file |
| MOD-INTEG **MI-4 / MI-5** | closure report: *"CLOSED; MI-4/MI-5 open R3/operator"* |
| `self-pilot/read-only-self-pilot.mjs` | activation-gated, and activation is operator-only under working rule 5 |
| MOD-UI | *"OPEN — other lane (Codex)"*, unsettled at a codex commit |

Four items, of which one is a file. Not seventeen, and not twenty-one.

### Revised again

| | Files |
|---|---|
| Already reachable | 64 |
| Wireable as R2 implementation work | **57** |
| Genuinely gated | **1** (`read-only-self-pilot.mjs`) |

The other three gated items are future slices and lane coordination, not files
waiting in this tree.

**Method note, third time.** §1 corrected a measurement that followed imports in
a codebase that loads through registries. §7 corrected a classifier that read
`R3` as data. This corrects reading a source comment as current when it was
written before the decision that changed it. Each layer of evidence was better
than the last and each was still self-report until checked against the record
that governs it. The order that works is: record first, comment second, pattern
last.

## 9. Addendum 3 — slice 1 ran, and the guard refused it

MOD-OPS was the first slice. ACT added the three `src/ops/` modules to
`src/index.mjs`; the exports loaded and worked (`assembleScorecard` returned 24
entries and 24 findings over the real catalog), and reachability moved 64 → 67.
VERIFY then failed one test:

```text
unsanctioned src/ or tools/ file imports the registry: ["src/index.mjs"]
```

The guard in `tests/kpi-registry.test.mjs` states its own reason:

> the registry itself must still stay **unwired to every live / gateway / report
> path** (adoption of the assembler is later, **separately governed work** —
> assessment §5 #4)

**The refusal is correct and §8 was too coarse.** That addendum split the world
into making a primitive *reachable* (R2, pre-authorized) and putting it in an
*enforcing* position (gated). MOD-OPS is neither: its own assessment governs
**adoption** — being available to consumers at all. Exporting from the library
surface is adoption.

A textual dodge was available and was not taken. The guard greps for the
basename `kpi-registry`, so exporting only `scorecard-assembler` from
`src/index.mjs` would have passed — while pulling the registry in transitively
and achieving exactly the adoption the guard forbids. The guard's own comment
warns about precisely this class of move, calling an earlier version of it "a
false fix" that passed while the file still genuinely imported the registry.
Taking it would have been the same shape.

Slice reverted in full. `npm test` 1985 · 1980 pass · 0 fail · 5 skipped;
`validate-foundation` PASS; reachability back to 64.

### A third category, and four known members

| Category | Wiring act | Who |
|---|---|---|
| Ordinary delivered primitive | make reachable | R2, pre-authorized |
| **Adoption-governed** | **make reachable** | **the module's own assessment** |
| Enforcement | place in a denying path | R3/R4 + GOV |

Modules whose tests enforce an adoption constraint today:

| Module | Constraint |
|---|---|
| `ops/kpi-registry` | exactly one sanctioned importer: `ops/scorecard-assembler` |
| `ledger/integration-queue-ledger` | not imported by any existing service or gateway |
| `ledger/skill-promotion-ledger` | no `src/` module may reference it |
| `ledger/skill-revocation-ledger` | no `src/` file other than its own definition may reference it |

That list is what a keyword scan found; it is a floor, not a ceiling. **The "57
wireable" figure in §8 is therefore unsafe as a plan input.** Before any further
slice, each candidate must be checked for an adoption guard — which is a
mechanical check, and cheaper than discovering it at VERIFY as this slice did.

### What the slice actually produced

No wiring, and a correction worth more than the wiring would have been. The loop
did what it exists to do: ACT ran, VERIFY refused on a governed constraint the
PLAN had not modelled, and the response was to stop and record rather than to
widen the guard. Refusal-matrix R5 — never re-pin a guard the wiring trips in
the same slice — was the rule that decided it.

## 10. Addendum 4 — the adoption-guard sweep §9 asked for

Every unreached module checked against the test suite for a guard that forbids
its adoption. The scan flagged 9; reading each assertion leaves **5**.

**Genuinely adoption-guarded — a wiring slice will be refused at VERIFY:**

| Module | The assertion |
|---|---|
| `ops/kpi-registry` | *"the registry's only sanctioned importer is the S2 scorecard-assembler (otherwise unwired)"* |
| `ledger/integration-queue-ledger` | *"must not import integration-queue-ledger.mjs (S1 stays unwired)"* |
| `ledger/skill-promotion-ledger` | *"every other src/ module have no reference to SkillPromotionLedger (stays unwired)"* |
| `ledger/skill-revocation-ledger` | *"no src/ file other than the ledger's own definition references SkillRevocationLedger"* |
| `control/integration-collision-forecast` | *"does not import forecastCollision or this new file (still unwired)"* |

**The four the scan got wrong, and why:**

| Flagged | Actually |
|---|---|
| `control/approval-binding` | No prohibition names it. Matched on proximity to an unrelated guard. |
| `control/risk-registry` | Same. |
| `ops/scorecard-assembler` | It is the **SANCTIONED** importer — the permitted one, not the guarded one. The scan could not tell an exception from a prohibition. |
| `registry/skill-candidate-registry` | It is the **checker**: *"skill-candidate-registry.mjs and every other src/ module have no reference to SkillPromotionLedger"*. The guarded subject is the other module. |

A proximity match cannot distinguish the subject of a prohibition from a module
merely named near one, so the scan is a shortlist to read, not a verdict. That is
the right shape for it: a missed guard costs a reverted slice, a false hit costs
one line of reading.

### Where the count lands

| | Files |
|---|---|
| Already reachable | 64 |
| **Wireable** | **52** |
| Adoption-guarded — needs the module's own governance | 5 |
| Activation-gated | 1 (`self-pilot/read-only-self-pilot.mjs`) |

The four remaining gated *items* from §8 — MOD-SKILL component 3, MOD-INTEG
MI-4/MI-5, MOD-UI — are future slices and lane coordination, not files here.

### The check that should have existed before slice 1

This sweep took one pass over the test suite. Slice 1 discovered the same fact by
running ACT, failing VERIFY, and reverting. The cost difference is the argument
for making this check part of PLAN for every wiring slice, not a lesson learned
once: **before wiring a module, grep the suite for a prohibition naming it.**

## 11. Addendum 5 — the sequence finished, and the metric was wrong about the remainder

Slices 4 through 8 ran. Reachability from `src/index.mjs` moved 44 -> 85 of 122
files; counting the CLI entry points that were missing from the original
measurement, 78 -> 99. Slice 8 screened the last eleven candidates and **wired
none of them**, which is the result rather than a failure of it.

### Why each of the last eleven stays unreached

| Module(s) | Reason | Kind of reason |
|---|---|---|
| `ops/cadence-policy`, `ops/kpi-registry`, `ops/scorecard-assembler` | All three headers place adoption in "later, separately-governed work" | Held by governance |
| `self-pilot/read-only-self-pilot`, `self-pilot/fixtures` | P0-19 candidates. `p0-20-operator-activation-disposition-002.md` records the operator verdict "ACTIVATE (controlled)" at status `OPERATOR_VERDICT_TRANSCRIBED_PENDING_RATIFICATION` | Held pending ratification |
| `plugins/ollama-sec-scanner`, `plugins/secb-graphify-adapter`, `plugins/secb-rootly-importer`, `plugins/secb-worktree-adapter` | **Measured against the wrong surface** — see below | Metric error |
| `audit/packs`, `audit/corpus-expectation` | **Measured against the wrong surface** — see below | Metric error |

Slice 1's refusal is also now properly closed. It was recorded as a refusal about
`ops/kpi-registry`; in fact **all three** `ops` modules state the same adoption
constraint in their own headers. The guard was right about a wider set than the
one it named.

### The metric error, stated plainly

"Reachable from `src/index.mjs`" is not the definition of wired. It is the
definition of *on the library surface*, and for two classes of module that is the
wrong surface entirely:

- **Plugins reach the system through the MCP server, not through `index.mjs`.**
  The two plugin adapters that ARE reached — `secb-plane-adapter`,
  `secb-openproject-adapter` — are imported by `src/mcp/secb-mcp-server.mjs`, and
  `index.mjs` mentions neither. Exporting the four unreached plugins from
  `index.mjs` would have invented a wiring pattern this repository does not use,
  and the resulting green metric would have measured the invention.
- **`audit/corpus-expectation` is test-support and belongs where it is.** It
  carries `EXPECTED_CORPUS`, the tripwire that fails when the skill corpus
  changes without anyone noticing. Its consumers are the audit tests. Putting a
  test expectation on the public API surface would be a defect, not progress.
- **`audit/packs` is a real gap, but not this one.** Nothing imports it except
  tests — including `src/audit/run.mjs`, the audit's own entry point. So it is
  unreached *from its own subsystem*, which is worth someone's attention, and the
  remedy is a decision by whoever owns MOD-AUDIT about whether packs belongs in
  the audit run. An `index.mjs` export would hide the gap behind a number.

### What the number should be

Of 122 modules: 99 reachable, and of the remaining 23, **17 are correctly
unreached** — nine held by their own headers or by governance, four held by
absence guards that name them, four plugins measured against the wrong surface.
Two more are test-support. That leaves `audit/packs` and the SEC/GOV-gated skill
registry trio as the only genuinely open items, and none of the four is a wiring
task.

**100% was never the correct target.** A repository whose every module is
reachable from its library surface is one that has stopped distinguishing between
delivered-and-adopted and delivered-and-deliberately-held, which is the
distinction this programme's gates exist to keep.


## Addendum 6 — the number in Addendum 5 went stale, 2026-08-11

Addendum 5 recorded `78 -> 99` of 122 and called the sequence finished. It is now
**100 of 122**. `src/audit/packs.mjs` became reachable when
`tools/secb-audit-packs.mjs` was added, which was not a wiring slice at all — it
was an entry point for a delivered capability that had none.

Two things follow, and the second is the one worth keeping.

**The count is a fact about the tree, and this document wrote it down.** That is
the same defect this week found in `src/audit/packs.mjs`, where the sibling
lens's frame stated "its 24 siblings" as a literal while the corpus held 23
packages — true when written, stale twice since, unnoticed because nothing reads
a prose number for accuracy. The frame was changed to derive its count. This
document cannot derive anything, so the correction is the mechanism, and stating
the measurement date beside the number is the least it should carry.

**Reachability is not a target, and moving it was a side effect.** The tool was
added because a capability with its own acceptance criterion and its own test
file had no way to run. That it also moved the reachability count by one is
incidental — the number followed the work rather than the work following the
number, which is the only order in which such a metric is honest.

Measured at `main` `ebe8941`: library surface 85 of 122, plus CLI and tool entry
points 100 of 122. The 22 that remain are the set Addendum 5 accounts for, less
`audit/packs`.

## 12. What this analysis does not do

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
