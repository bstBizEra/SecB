# Engineering Loop v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `BOPEN-ENG-LOOP-001` with three new execution documents and bind the resulting loop to worker-agent behaviour through `SECB-AGENTS-AMD-003`.

**Architecture:** Purely additive documentation work. `08-bopen-engineering-loop.md` is never edited; three sibling documents (`09`, `10`, `11`) extend it, and one appended `AGENTS.md` amendment makes the loop normative. Both manifests are updated in the same commit as the file they inventory, per AMD-002 §2.

**Tech Stack:** Markdown under `docs/`, JSON inventories, Node 22+ validation via `tools/validate-foundation.mjs`, `node --test`.

**Spec:** [`2026-08-08-engineering-loop-v2-design.draft.md`](2026-08-08-engineering-loop-v2-design.draft.md)

---

## Global Constraints

- Every new document carries a Document Control table with `Status: DRAFT / NOT EFFECTIVE`, inheriting the Phase 0 bootstrap boundary.
- `docs/12-execution/08-bopen-engineering-loop.md` must remain byte-identical throughout. Verify with `git diff --exit-code` before the final commit.
- Canonical loop name is `BOPEN-ENG-LOOP-001`. "URE-Loop" appears only in `docs/SOURCE-TRACEABILITY.md` as a source, never as a loop identity.
- Manifest ordering: append entries in slice clusters. Do **not** sort alphabetically — neither manifest is sorted, and re-sorting would produce a false 500-line diff.
- `docs/MANIFEST.json` has a `file_count_excluding_manifests` field that `validate-foundation.mjs` asserts equals `files.length`. Every path added there requires the count to increment by one in the same edit.
- All work stays on branch `feat/secb-ruflo-command-center`. No agent merge to `main`.
- Table style is `|---|---|` (no inner spaces), matching `08-bopen-engineering-loop.md` and `SECB-GOV-SURFACE-001.md`.

### Open decision carried into Task 5

Spec §7 says to bump `AGENTS.md` from `0.3.0-alpha.0` to `0.4.0-alpha.0`. **This plan does not bump it**, for two reasons found in the repository after the spec was approved:

1. `AGENTS.md`'s version has only ever moved in lockstep with the repo build version: `0.1.0-alpha.0` (`b6f4934`) → `0.2.0-alpha.0` (`e3af0fd`) → `0.3.0-alpha.0` (`a0abba2`). `VERSION`, `package.json`, and `MANIFEST.json` all currently read `0.3.0-alpha.0`.
2. The closest precedent is exact: commit `7799dcc` added `SECB-AGENTS-AMD-002` and left the version at `0.3.0-alpha.0`. An amendment has not previously bumped it.

Bumping `AGENTS.md` alone would desynchronise it from three artifacts that share the number, and `validate-foundation.mjs` does not check `AGENTS.md`'s version — so the drift would pass a green suite silently.

**If the operator wants the bump anyway**, it must move all four together (`VERSION`, `package.json`, `MANIFEST.json`, `AGENTS.md`), which makes it a repo version bump rather than a documentation edit, and belongs in its own task.

---

## File Structure

| File | Responsibility |
|---|---|
| `docs/12-execution/09-panel-review-and-rubric.md` | How VERIFY is conducted: three review lenses, their authority boundaries, the advisory rubric |
| `docs/12-execution/10-inner-loop-efficiency.md` | Latency budgets and token-cost layers, plus the two SecB invariants that bound them |
| `docs/12-execution/11-agent-capability-baseline.md` | Eight baseline skills mapped to existing definitions, the nine-layer matrix, ADR obligations |
| `AGENTS.md` | Appended `SECB-AGENTS-AMD-003` binding the loop to worker agents |
| `MANIFEST.json`, `docs/MANIFEST.json` | Inventory of the three new documents |
| `docs/README.md` | Index links under "12 — Execution" |
| `docs/SOURCE-TRACEABILITY.md` | URE-Loop v0.9 recorded as source input, with the exclusion table |

---

## Task 1: Establish a clean baseline

The working tree currently holds finished cleanup work and three untracked documents that both manifests already reference. Spec §10.1 requires those documents to enter the repository together with the inventory that names them. Working rule 2 requires a clean Git baseline before a bounded slice.

**Files:**
- Commit (already modified): `docs/12-execution/05-work-package-lifecycle.md`, `tools/secb.mjs`, `tools/validate-foundation.mjs`, `tests/secb-cli.test.mjs`, `MANIFEST.json`, `docs/MANIFEST.json`, `AGENTS.md`, `docs/AGENTS.md`, `docs/README.md`, `docs/12-execution/03-universal-delivery-loop.md`, `package.json`
- Track (currently untracked): `docs/12-execution/08-bopen-engineering-loop.md`, `docs/12-execution/ENGINEERING-LOOP.md`, `docs/00-governance/SECB-GOV-SURFACE-001.md`, `docs/03-project-control/candidates/2026-08-08-engineering-loop-v2-design.draft.md`, `docs/03-project-control/candidates/2026-08-08-engineering-loop-v2-plan.draft.md`

**Interfaces:**
- Produces: a committed baseline where `git status --short` shows no modified tracked files, and `node tools/validate-foundation.mjs` exits 0.

- [ ] **Step 1: Confirm the manifest guard sees a complete inventory**

Run: `node tools/validate-foundation.mjs`
Expected: exits 0. The `manifest.complete` check reports `289 tracked paths under contracts/, src/, tests/, tools/ all inventoried`.

- [ ] **Step 2: Confirm the base loop document is untouched**

Run: `git diff --exit-code -- docs/12-execution/08-bopen-engineering-loop.md; echo "exit=$?"`
Expected: `exit=0` with no diff output. (The file is untracked at this point, so `git diff` has nothing to report — that is the expected result, not a skipped check.)

- [ ] **Step 3: Run the full suite and record exact numbers**

Run: `npm test`
Expected: `tests 1188 · pass 1179 · fail 2 · skipped 7`. The only two failures are `GUARD: temporal-ledgers.mjs and sod-rules.mjs match the reviewed boundary digests` in `tests/knowledge-claim-service.test.mjs` and `tests/memory-gateway-service.test.mjs`, queued as of `f161746`. **A third failure stops this task.**

- [ ] **Step 4: Stage exactly the intended paths**

Do not use `git add -A`. Untracked junk sits in the repo root (`1{if($0`, `err.txt`, `err2.txt`, `err3.txt`, `results.json`, `results2.json`, `results3.json`, `$SP/`) and would be swept in.

```bash
git add docs/12-execution/05-work-package-lifecycle.md \
        docs/12-execution/03-universal-delivery-loop.md \
        docs/12-execution/08-bopen-engineering-loop.md \
        docs/12-execution/ENGINEERING-LOOP.md \
        docs/00-governance/SECB-GOV-SURFACE-001.md \
        docs/03-project-control/candidates/2026-08-08-engineering-loop-v2-design.draft.md \
        docs/03-project-control/candidates/2026-08-08-engineering-loop-v2-plan.draft.md \
        docs/AGENTS.md docs/README.md docs/MANIFEST.json \
        AGENTS.md MANIFEST.json package.json \
        tools/secb.mjs tools/validate-foundation.mjs tests/secb-cli.test.mjs
git status --short
```

Expected: every path above shows as staged (`A` or `M`); the junk files remain `??`.

- [ ] **Step 5: Commit**

```bash
git commit -m "fix(secb): close the manifest blind spot that hid 25 files, and the prototype lookup in the dispatcher

The manifest check only ever ran one way — inventory to disk. Nothing asserted
the converse, so 25 tracked files under contracts/, src/, tests/ and tools/ sat
outside MANIFEST.json while the suite stayed green. validate-foundation now
asserts both directions over the four paths AMD-002 pre-authorizes.

secb.mjs resolved subcommands with a bare node[word], which reaches
Object.prototype: 'secb constructor' skipped the unknown-command branch and
produced an error naming an empty command set, and a polluted prototype would
have resolved to a script this dispatcher then spawns. The file exists to close
an arbitrary-code path, so it now looks up own properties only.

Also restores the Work Package Lifecycle state list, which had been deleted from
the working tree without a record.

npm test: 1188 tests, 1179 pass, 2 fail, 7 skipped. The two failures are the
boundary digest guards queued at f161746, unchanged by this commit.
"
```

- [ ] **Step 6: Verify the baseline is clean**

Run: `git status --short | grep -v '^??'; echo "tracked-changes-exit=$?"`
Expected: no output before the echo — no modified tracked files remain.

---

## Task 2: Document 09 — Panel Review & Rubric

**Files:**
- Create: `docs/12-execution/09-panel-review-and-rubric.md`
- Modify: `MANIFEST.json` (append one path), `docs/MANIFEST.json` (append one path, count 74 → 75)

**Interfaces:**
- Consumes: the VERIFY stage defined in `08-bopen-engineering-loop.md` §3.4; `BOPEN-GOV-EBIV-001` role separation.
- Produces: artifact ID `BOPEN-ENG-PANEL-001`, referenced by Task 4 (ADR obligations) and Task 5 (AMD-003 clause 2). The three lens names are exactly **Staff Architect**, **Security & Edge-Case**, **Performance & QA**.

- [ ] **Step 1: Write the failing check — inventory the file before it exists**

Add `"docs/12-execution/09-panel-review-and-rubric.md"` to the end of the `files` array in `MANIFEST.json`, and to the end of the `files` array in `docs/MANIFEST.json` while raising `file_count_excluding_manifests` from `74` to `75`.

- [ ] **Step 2: Run validation to verify it fails**

Run: `node tools/validate-foundation.mjs`
Expected: FAIL with `manifest.file.docs/12-execution/09-panel-review-and-rubric.md: exists`

- [ ] **Step 3: Create the document**

````markdown
# BOPEN-ENG-PANEL-001 — Panel Review & Advisory Rubric

## Document Control

| Field | Value |
|---|---|
| Artifact ID | BOPEN-ENG-PANEL-001 |
| Version | 1.0.0-draft |
| Status | DRAFT / NOT EFFECTIVE |
| Owner | SecB Engineering & Governance Authority |
| Extends | [`08-bopen-engineering-loop.md`](08-bopen-engineering-loop.md) §3.4 (VERIFY) |
| Effective when | Approved by human GOV and referenced in `AGENTS.md` |

---

## 1. Purpose

`BOPEN-ENG-LOOP-001` §3.4 says the VERIFY stage runs the automated suite. It does
not say how a change is reviewed beyond that. This document specifies the review
that accompanies the suite: three analytical lenses and one advisory rubric.

Nothing here carries authority. A lens is a way of reading a change, not a seat.

---

## 2. The three lenses

| Lens | Examines |
|---|---|
| Staff Architect | Module boundaries, API compatibility, query efficiency, extensibility |
| Security & Edge-Case | Input bounds, injection, null and boundary handling, concurrency, failure modes |
| Performance & QA | Coverage, benchmark regression, execution latency |

All three lenses are seated together. Seating them incrementally would leave a
panel advertised as three-lens while missing its security lens, which produces
false assurance — worse than declaring no panel at all.

---

## 3. Authority boundaries

Every lens declares `execution_authority: false` and `approval_authority: false`.

1. **Not a verifier seat.** [`BOPEN-GOV-EBIV-001`](08-bopen-engineering-loop.md)
   governs independent verification under Maker ≠ Verifier. A lens informs the
   Independent Verifier; it never substitutes for one.
2. **Not an identity.** Lenses hold zero entries in the agent identity register.
3. **Not an authority over ADRs.** A lens does not supersede a human ADR
   disposition.
4. **Not a quorum contribution.** A lens cannot count toward any release quorum.

---

## 4. The advisory rubric

```text
Score = 0.30 (Functional Correctness)
      + 0.25 (System Architecture & Scalability)
      + 0.20 (Security & Failure Safety)
      + 0.15 (Code Cleanliness & Documentation)
      + 0.10 (Execution Speed & Test Latency)
```

The score is recorded in the slice notes or advisory packet. **It merges nothing,
approves nothing, and activates nothing.** Bands route the agent's next action;
they do not authorize one.

| Band | Next action |
|---|---|
| ≥ 85 | Ready to propose for operator merge review; no further self-correction required |
| 60–84 | Return to PLAN/ACT for targeted correction before proposing merge |
| < 60 | Produce the advisory packet, set the slice disposition to `BLOCKED`, notify the operator — and continue preparing the candidate on the branch rather than idling, per the advise-and-proceed rule in `AGENTS.md` |

A band is never a substitute for the retained hard gates. A slice scoring 100
still does not merge itself.

---

## 5. ADR interaction

Where a lens judges that a change carries an architectural trade-off, it raises
the ADR obligation defined in
[`11-agent-capability-baseline.md`](11-agent-capability-baseline.md) §4. The lens
does not author the disposition.
````

- [ ] **Step 4: Run validation to verify it passes**

Run: `node tools/validate-foundation.mjs`
Expected: exits 0. `docs-manifest.count` reports `75 declared paths`.

- [ ] **Step 5: Commit**

```bash
git add docs/12-execution/09-panel-review-and-rubric.md MANIFEST.json docs/MANIFEST.json
git commit -m "docs(secb): specify how VERIFY is reviewed, and that the score decides nothing

The loop said VERIFY runs the suite. It did not say what reading a change
consists of, so three lenses and a rubric fill that in. The rubric weights come
from the source design; the meaning of the score does not. There a score of 85
merges the branch. Here it routes the agent's next action and merges nothing —
the retained hard gates are untouched, and a slice scoring 100 still waits for
the operator."
```

---

## Task 3: Document 10 — Inner-Loop Efficiency

**Files:**
- Create: `docs/12-execution/10-inner-loop-efficiency.md`
- Modify: `MANIFEST.json` (append one path), `docs/MANIFEST.json` (append one path, count 75 → 76)

**Interfaces:**
- Consumes: the PLAN/ACT/VERIFY stages of `08-bopen-engineering-loop.md`.
- Produces: artifact ID `BOPEN-ENG-EFFICIENCY-001`. Its two invariants are referenced by name — **Optimization must not reduce evidence** and **Isolation must not erase provenance** — in Task 5's amendment rationale.

- [ ] **Step 1: Write the failing check — inventory the file before it exists**

Add `"docs/12-execution/10-inner-loop-efficiency.md"` to the end of the `files` array in `MANIFEST.json`, and to the end of the `files` array in `docs/MANIFEST.json` while raising `file_count_excluding_manifests` from `75` to `76`.

- [ ] **Step 2: Run validation to verify it fails**

Run: `node tools/validate-foundation.mjs`
Expected: FAIL with `manifest.file.docs/12-execution/10-inner-loop-efficiency.md: exists`

- [ ] **Step 3: Create the document**

````markdown
# BOPEN-ENG-EFFICIENCY-001 — Inner-Loop Efficiency

## Document Control

| Field | Value |
|---|---|
| Artifact ID | BOPEN-ENG-EFFICIENCY-001 |
| Version | 1.0.0-draft |
| Status | DRAFT / NOT EFFECTIVE |
| Owner | SecB Engineering & Governance Authority |
| Extends | [`08-bopen-engineering-loop.md`](08-bopen-engineering-loop.md) §3.2–§3.4 |
| Effective when | Approved by human GOV and referenced in `AGENTS.md` |

---

## 1. Feedback latency budgets

| Tier | Scope | Budget |
|---|---|---|
| 1 | LSP diagnostics and AST lint on edit | < 100 ms |
| 2 | Selective test run over impacted modules | < 1 s |
| 3 | Panel review evaluation | < 15 s |

These are budgets, not gates. Missing one is a signal to investigate the harness.
It is never a reason to refuse, skip, shorten, or defer a check.

---

## 2. Token cost layers

| Layer | Technique |
|---|---|
| 1 | Static KV prefix ordering — system persona, tool schemas, repository map, then dynamic turns |
| 2 | AST pruning — signatures and imports retained, method bodies stripped |
| 3 | Model cascading — cheaper tier for intake, search parsing and formatting; frontier tier for architecture and patch generation |
| 4 | Subagent context isolation — verbose exploration runs in a disposable frame that returns a distilled summary |
| 5 | Search/replace block diffs — targeted edits instead of whole-file rewrites |

---

## 3. Two invariants that bound the layers

Cost reduction is not unconditionally good in a governed control plane. Two
constraints bound every technique in §2.

### 3.1 Optimization must not reduce evidence

The VERIFY stage always runs `npm run validate` and `npm test` in full. Model
cascading, AST pruning, and selective test execution apply to PLAN and ACT only.

No evidence-producing run is ever abbreviated, sampled, or served from cache. A
cheaper run that yields a weaker claim has not saved anything — it has replaced
evidence with an assertion, which working rule 6 does not accept.

### 3.2 Isolation must not erase provenance

A subagent returning a distilled summary must carry source, timestamp, and agent
ID in that summary. Discarding a subagent's raw history is permitted; discarding
its provenance is not.

---

## 4. Conformance

A slice conforms to this document when its evidence-producing runs are complete
runs, and every distilled subagent result in its record names its source,
timestamp, and agent ID.
````

- [ ] **Step 4: Run validation to verify it passes**

Run: `node tools/validate-foundation.mjs`
Expected: exits 0. `docs-manifest.count` reports `76 declared paths`.

- [ ] **Step 5: Commit**

```bash
git add docs/12-execution/10-inner-loop-efficiency.md MANIFEST.json docs/MANIFEST.json
git commit -m "docs(secb): make the cheap path stop short of the evidence

Latency budgets and the five token-cost layers come from the source design, which
treats cost reduction as unconditionally good. In a control plane it is not, so
two invariants bound them: VERIFY always runs whole, never sampled or cached, and
a subagent may lose its history but not its provenance. A cheaper run that yields
a weaker claim has replaced evidence with an assertion."
```

---

## Task 4: Document 11 — Capability Baseline & ADR Obligations

**Files:**
- Create: `docs/12-execution/11-agent-capability-baseline.md`
- Modify: `MANIFEST.json` (append one path), `docs/MANIFEST.json` (append one path, count 76 → 77)

**Interfaces:**
- Consumes: `AGENTS.md` working rule 6; `docs/03-project-control/work-package-contract.md`; `docs/00-governance/SECB-GOV-SURFACE-001.md` §2–§3; `docs/00-governance/authority-and-risk-model.md`; `docs/12-execution/06-parallel-execution.md` and `07-context-and-handoff.md`; the existing `docs/adr/` convention `NNNN-slug.md`.
- Produces: artifact ID `BOPEN-ENG-CAP-001`. Its §4 is the ADR obligation referenced by Task 2's document 09 §5.

- [ ] **Step 1: Write the failing check — inventory the file before it exists**

Add `"docs/12-execution/11-agent-capability-baseline.md"` to the end of the `files` array in `MANIFEST.json`, and to the end of the `files` array in `docs/MANIFEST.json` while raising `file_count_excluding_manifests` from `76` to `77`.

- [ ] **Step 2: Run validation to verify it fails**

Run: `node tools/validate-foundation.mjs`
Expected: FAIL with `manifest.file.docs/12-execution/11-agent-capability-baseline.md: exists`

- [ ] **Step 3: Create the document**

````markdown
# BOPEN-ENG-CAP-001 — Agent Capability Baseline & ADR Obligations

## Document Control

| Field | Value |
|---|---|
| Artifact ID | BOPEN-ENG-CAP-001 |
| Version | 1.0.0-draft |
| Status | DRAFT / NOT EFFECTIVE |
| Owner | SecB Engineering & Governance Authority |
| Extends | [`08-bopen-engineering-loop.md`](08-bopen-engineering-loop.md) |
| Effective when | Approved by human GOV and referenced in `AGENTS.md` |

---

## 1. Purpose

The loop states what an agent does at each stage. This document states what an
agent is assumed to be able to do at all of them, and when it owes an ADR.

---

## 2. Eight baseline skills

Each skill is **mapped to its existing authoritative definition, not restated
here**. A second statement of a rule is a second rule.

| Skill | Authoritative definition |
|---|---|
| Verification before completion | [`AGENTS.md`](../../AGENTS.md) working rule 6 |
| Requirements traceability | [`work-package-contract.md`](../03-project-control/work-package-contract.md) |
| Context engineering | [`SECB-GOV-SURFACE-001.md`](../00-governance/SECB-GOV-SURFACE-001.md) §2 |
| Systematic debugging | [`SECB-GOV-SURFACE-001.md`](../00-governance/SECB-GOV-SURFACE-001.md) §3 |
| Test-driven development | [`08-bopen-engineering-loop.md`](08-bopen-engineering-loop.md) §3.3 (negative tests and probes) |
| Security and authorization review | [`authority-and-risk-model.md`](../00-governance/authority-and-risk-model.md) |
| Agent orchestration and subagent isolation | [`06-parallel-execution.md`](06-parallel-execution.md), [`07-context-and-handoff.md`](07-context-and-handoff.md), and [`10-inner-loop-efficiency.md`](10-inner-loop-efficiency.md) §3.2 |
| Safe integration engineering | [`threat-model.md`](../08-security/threat-model.md) and [`ADR-0011`](../adr/0011-single-mcp-invocation-enforcement-pipeline.md) |

Verification before completion is the controlling one. An edit whose result was
not observed is not a completed edit, whatever else was satisfied.

---

## 3. Nine-layer capability matrix

| Layer | Responsibilities |
|---|---|
| Governance | Traceability, authorization, definition of ready and done, gate compliance |
| Context | Repository orientation, AST indexing, ADR retrieval |
| Design | Architecture, ADR drafting, API contracts, schema modelling |
| Execution | TDD cycle, minimal diffs, clean-code standards |
| Diagnosis | Log and trace inspection, root-cause isolation, performance analysis |
| Coordination | Orchestration, subagent isolation, worktree parallelism, structured status returns |
| Integration | MCP engineering, external APIs, safe migrations |
| Assurance | Specification review, code review, security review, regression testing |
| Delivery | Pipeline diagnosis, build provenance, rollback readiness |

---

## 4. ADR obligations

An ADR is drafted when a slice touches any of:

- a schema change;
- a new external dependency;
- the authority model;
- a breaking contract.

Rules:

1. Drafts go to the **existing** [`docs/adr/`](../adr/) directory under its
   established `NNNN-slug.md` convention. No new ADR location is created.
2. A drafted ADR enters at status `Proposed`.
3. Only an operator merge to `main` moves an ADR to `Accepted`. An agent never
   writes `Accepted`.
4. A drafted ADR records the options considered and the residual risk, not only
   the option chosen. An ADR that lists one option has recorded a preference,
   not a decision.
````

- [ ] **Step 4: Run validation to verify it passes**

Run: `node tools/validate-foundation.mjs`
Expected: exits 0. `docs-manifest.count` reports `77 declared paths`.

- [ ] **Step 5: Verify every cross-link resolves**

Run:
```bash
node -e '
const {readFileSync,existsSync}=require("fs");const {dirname,resolve}=require("path");
const f="docs/12-execution/11-agent-capability-baseline.md";
const body=readFileSync(f,"utf8");let bad=0;
for(const m of body.matchAll(/\]\((\.[^)#]+)/g)){
  const t=resolve(dirname(f),m[1]);
  if(!existsSync(t)){console.log("BROKEN "+m[1]);bad++}
}
console.log(bad?`${bad} broken link(s)`:"all links resolve");
process.exit(bad?1:0)'
```
Expected: `all links resolve`

- [ ] **Step 6: Commit**

```bash
git add docs/12-execution/11-agent-capability-baseline.md MANIFEST.json docs/MANIFEST.json
git commit -m "docs(secb): name the baseline skills by pointing at them, not by restating them

Eight skills and a nine-layer matrix, each mapped to the document that already
defines it — a second statement of a rule is a second rule. The ADR obligation
lands here too, bound to the docs/adr/ convention that exists rather than the new
directory the source design proposed. Agents draft at Proposed; only an operator
merge writes Accepted."
```

---

## Task 5: `AGENTS.md` — `SECB-AGENTS-AMD-003`

**Files:**
- Modify: `AGENTS.md` (append one section at end of file; insert one line into the required-reading chain at lines 29–38)

**Interfaces:**
- Consumes: `BOPEN-ENG-LOOP-001`, `BOPEN-ENG-PANEL-001` (Task 2), `BOPEN-ENG-EFFICIENCY-001` (Task 3), `BOPEN-ENG-CAP-001` (Task 4).
- Produces: the binding that makes the loop normative. No later task depends on it.

**Version note:** Do **not** change the `**Version:**` line. See "Open decision carried into Task 5" in Global Constraints.

- [ ] **Step 1: Insert the loop document into the required-reading chain**

In `AGENTS.md`, the chain currently ends:

```markdown
7. [`docs/03-project-control/work-package-contract.md`](docs/03-project-control/work-package-contract.md)
8. Documents and templates directly referenced by the active bounded slice.
```

Replace those two lines with:

```markdown
7. [`docs/03-project-control/work-package-contract.md`](docs/03-project-control/work-package-contract.md)
8. [`docs/12-execution/08-bopen-engineering-loop.md`](docs/12-execution/08-bopen-engineering-loop.md) (Agentic Engineering Loop and EBIV)
9. Documents and templates directly referenced by the active bounded slice.
```

No other entry changes text or relative order.

- [ ] **Step 2: Append the amendment at the end of the file**

```markdown

## Engineering loop binding amendment — 2026-08-08

**Amendment ID:** SECB-AGENTS-AMD-003
**Requested by:** Operator, 2026-08-08
**Status:** DRAFT until merged to `main` by the operator; EFFECTIVE thereafter
**Scope:** Local repository work only. This amendment extends the working rules above.

### Loop binding

Bounded slices under the pre-authorized implementation paths of AMD-002 §1 execute under [`BOPEN-ENG-LOOP-001`](docs/12-execution/08-bopen-engineering-loop.md): `GOAL` → `PLAN` → `ACT` → `VERIFY` → `DONE`. A slice that skips a stage has not run the loop, whatever its result.

### Panel obligation

The VERIFY stage runs the three lenses of [`BOPEN-ENG-PANEL-001`](docs/12-execution/09-panel-review-and-rubric.md) — Staff Architect, Security & Edge-Case, Performance & QA — and records the rubric score in the slice notes.

Efficiency obligations and their two bounding invariants are in [`BOPEN-ENG-EFFICIENCY-001`](docs/12-execution/10-inner-loop-efficiency.md); baseline skills and ADR obligations are in [`BOPEN-ENG-CAP-001`](docs/12-execution/11-agent-capability-baseline.md).

### Non-authority clause

A rubric score, a panel verdict, and an ADR draft create no authority. They do not merge, approve, activate, accept evidence, promote a skill, or admit a memory. A slice scoring 100 is a slice awaiting operator merge review.

The retained hard gates of AMD-002 are unchanged and are not restated here. Where this amendment and a retained hard gate appear to conflict, the gate governs.

### What this amendment does not do

It does not activate the loop documents. They remain `DRAFT / NOT EFFECTIVE` under the bootstrap boundary until human GOV approves them. This amendment binds worker-agent behaviour to a specification; it does not confer effectiveness on the specification.
```

- [ ] **Step 3: Verify the chain reads 1–9 with no duplicate numbers**

Run: `sed -n '29,40p' AGENTS.md`
Expected: items numbered `1.` through `9.` in order, with `08-bopen-engineering-loop.md` at 8 and "Documents and templates directly referenced by the active bounded slice." at 9.

- [ ] **Step 4: Verify the version line is unchanged**

Run: `grep -m1 '^\*\*Version:\*\*' AGENTS.md`
Expected: `**Version:** 0.3.0-alpha.0`

- [ ] **Step 5: Run validation and the full suite**

Run: `npm test`
Expected: `tests 1188 · pass 1179 · fail 2 · skipped 7`, the same two boundary digest guards and no others.

- [ ] **Step 6: Commit**

```bash
git add AGENTS.md
git commit -m "feat(secb): bind the loop to worker agents, and say plainly that the score decides nothing

AMD-003 makes GOAL/PLAN/ACT/VERIFY the shape a bounded slice takes rather than a
document describing one, and puts the panel obligation at VERIFY. The clause that
matters most is the one that grants nothing: a rubric score, a panel verdict and
an ADR draft do not merge, approve, activate, accept evidence, promote a skill or
admit a memory. Where the amendment and a retained hard gate appear to conflict,
the gate governs.

Version line deliberately unchanged. AGENTS.md's version has only ever moved with
the repo build version, and 7799dcc added AMD-002 without bumping it."
```

---

## Task 6: Index and source traceability

**Files:**
- Modify: `docs/README.md` (three links under "12 — Execution"), `docs/SOURCE-TRACEABILITY.md` (source entry and exclusion table)

**Interfaces:**
- Consumes: the three artifact IDs from Tasks 2–4.
- Produces: nothing later tasks depend on. This is the final task.

- [ ] **Step 1: Add the three links to the docs index**

In `docs/README.md`, the "12 — Execution" list currently ends:

```markdown
- [bOPEN Engineering Loop](12-execution/08-bopen-engineering-loop.md)
- [Engineering Loop Specification](12-execution/ENGINEERING-LOOP.md)
```

Append after those two lines:

```markdown
- [Panel review and rubric](12-execution/09-panel-review-and-rubric.md)
- [Inner-loop efficiency](12-execution/10-inner-loop-efficiency.md)
- [Agent capability baseline](12-execution/11-agent-capability-baseline.md)
```

- [ ] **Step 2: Record the source and its exclusions**

Append to `docs/SOURCE-TRACEABILITY.md`:

```markdown

## Engineering Loop v2 source — 2026-08-08

Source: *Unified Review Engineer Loop (URE-Loop)*, developer BST, version 0.9,
dated 2026-08-07.

| Source theme | Controlled outputs |
|---|---|
| Panel review and grading rubric | BOPEN-ENG-PANEL-001 (score made advisory, not a merge gate) |
| Feedback latency and token cost | BOPEN-ENG-EFFICIENCY-001 (bounded by two SecB invariants not present in the source) |
| Core engineering skills, ADR engine | BOPEN-ENG-CAP-001 (skills mapped to existing definitions; ADRs bound to the existing docs/adr/ convention) |
| Loop binding | SECB-AGENTS-AMD-003 |

Five of the twelve source mechanisms were **not adopted**. The reasons are part of
the record:

| Source § | Mechanism | Why not adopted |
|---|---|---|
| §4 | Continuous skill and memory synthesis | Duplicates `13-skills/02-skill-lifecycle.md`, which already governs promotion with evaluation and revocation controls |
| §6 | Autonomous git lifecycle engine | Has agents run `gh pr merge --squash`, push CI fixes and auto-merge at score ≥ 85, contradicting the operator-only merge and remote-action gates |
| §8 | State and telemetry reconciliation | Auto-heals production from APM alerts, which is production activation without operator authorization |
| §10 | 13-folder topology and G0–G7 gates | SecB already has a controlled tree and its own gate sequence; a second ladder would create competing authority over the same decisions |
| §12 | `BAL-GOV-001` ballot governance | Duplicates existing governance decision records and operator-only merge, introducing a second path to the same authority |
```

- [ ] **Step 3: Verify no orphaned or broken index links**

Run:
```bash
node -e '
const {readFileSync,existsSync}=require("fs");const {resolve}=require("path");
const body=readFileSync("docs/README.md","utf8");let bad=0;
for(const m of body.matchAll(/\]\((1[0-9]-[^)#]+)/g)){
  if(!existsSync(resolve("docs",m[1]))){console.log("BROKEN "+m[1]);bad++}
}
console.log(bad?`${bad} broken link(s)`:"all execution links resolve");
process.exit(bad?1:0)'
```
Expected: `all execution links resolve`

- [ ] **Step 4: Final verification — run the suite and confirm the base document is untouched**

Run:
```bash
git diff HEAD --stat -- docs/12-execution/08-bopen-engineering-loop.md
npm test
```
Expected: the `git diff` produces no output — `08-bopen-engineering-loop.md` is byte-identical to its committed state. `npm test` reports `tests 1188 · pass 1179 · fail 2 · skipped 7` with the same two boundary digest guards.

- [ ] **Step 5: Commit**

```bash
git add docs/README.md docs/SOURCE-TRACEABILITY.md
git commit -m "docs(secb): record what the loop v2 source gave us, and the five parts we refused

Three new execution documents get index entries. SOURCE-TRACEABILITY gains the
URE-Loop v0.9 entry, and — the part worth keeping — the table of five mechanisms
that were not adopted with the reason for each. Two of them auto-merge and
auto-heal production; two duplicate authority SecB already assigns; one duplicates
the skill lifecycle. A refusal without its reason decays into an oversight."
```

---

## Acceptance (spec §9)

The slice is complete when all four hold and their exact output is reported:

1. `npm test` after the final change reports the two known-red boundary digest guards as the only failures. A third failure blocks the slice.
2. `node tools/validate-foundation.mjs` exits 0, including `manifest.complete` and `docs-manifest.count` at 77 declared paths.
3. Every path added to either manifest exists on disk and is tracked in git.
4. `docs/12-execution/08-bopen-engineering-loop.md` is byte-identical to its pre-slice content.

## Deliberately out of scope

- Repo-root junk (`1{if($0`, `err*.txt`, `results*.json`, `$SP/`) and the `.claude/` / `.codex/` / `.claude-flow/` / `.mcp.json` tracking decision. These need an operator call and do not belong in a documentation slice.
- `tools/` test coverage at 47%, with ten files no test imports — including `validate-foundation.mjs`, which now carries the `manifest.complete` guard with nothing pinning it. This is a real gap and belongs in its own work package.
