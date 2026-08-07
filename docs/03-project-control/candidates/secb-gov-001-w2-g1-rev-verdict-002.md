# SECB-GOV-001 Wave-2 G1 — Independent REV Verdict RE-DERIVED at the ACCEPTED RE-CUT Baseline

| Field | Value |
|---|---|
| Artifact | `secb-gov-001-w2-g1-rev-verdict-002` |
| Reviewer identity | `claude-rev-w2-g1-02` (BST-SA Immune/REV lane, advisory) |
| Lane | **W2-G1 (re-derivation)** — independent REV verdict lane closing gap **G1** at the operator-accepted re-cut baseline |
| Supersedes (by reference) | `secb-gov-001-w2-g1-rev-verdict-001.md` (bound to `c2ec645`, which self-voids at any other SHA) — extend-only; the -001 record is NOT edited or deleted |
| Gap addressed | **G1** — "Completed independent REV verdict (not a dispatch) bound to one exact, on-main SHA — verdict + commands/environment + evidence refs + residual risks + acceptance/blockers" |
| Baseline acceptance context | Operator accepted the RE-CUT baseline via PR #131 (merge `fda4aeb`) per `secb-gov-001-baseline-recut-002.md` |
| Evidence baseline (WHERE THE RUN HAPPENED) | detached checkout of `3c439f787e9ff15ffe195d5675feb8a1d5621fbe` (tree `39d006117c853ff0625f80a5d5d431c6b49bf1b8`) — the accepted G4 re-cut baseline, PR #129 merge |
| Record baseline (WHERE THIS DOC LIVES) | branched from current main @ `6a6e9de55a83d6ba91b44c62726d159dec8b4fe4` |
| Timestamp (UTC) | 2026-07-22T (re-derivation run this session) |
| Scope | Advisory independent REV verdict on the SECB-GOV-001 packet at the single operator-accepted re-cut baseline. NOT a QA verdict, NOT a SEC review, NOT an evidence-acceptance, NOT a promotion, NOT an activation, NOT a P0-20 seal. |
| Authority | Advisory only. No merge, no push, no effectiveness declaration. The promotion decision (G9) remains OPERATOR_ONLY. |

> **Binding statement (read before citing any number below).** Every acceptance
> number in §3 was produced first-hand by commands run on a detached checkout of
> commit `3c439f787e9ff15ffe195d5675feb8a1d5621fbe` (tree
> `39d006117c853ff0625f80a5d5d431c6b49bf1b8`). This verdict is valid **only** for
> that exact commit and tree. If the SHA under evaluation differs in even one
> character — any later main tip, any successor re-cut baseline, or any branch
> merely *containing* this commit as an ancestor — **this verdict is void for
> your purpose** and G1 must be re-derived at your SHA. (The -001 verdict bound to
> `c2ec645` is likewise void at this SHA; this record supersedes it by reference.)

---

## 0. Separation-of-duties attestation

This REV lane is a **distinct executor** from every other actor in the closure chain:

- **Distinct from the producer.** The G5 re-cut bound-evidence record
  (`secb-gov-001-bound-evidence-002.md`) and the G4 re-cut proposal
  (`secb-gov-001-baseline-recut-002.md`) were produced by
  `claude-motor-a2-recut-01` (A2 Motor). This REV verdict is produced by
  `claude-rev-w2-g1-02`, an independent Wave-2 reviewer in an isolated worktree.
  Producer ≠ REV.
- **Distinct from the original G1 REV lane.** The `c2ec645` verdict was rendered by
  `claude-rev-w2-g1-01`. This is a fresh, separate executor (`claude-rev-w2-g1-02`)
  re-deriving at the new baseline; it did not reuse the -01 lane's run, and every
  number below was re-executed first-hand.
- **Distinct from the parallel Wave-2 lanes.** The G2/G3 re-run lanes execute in
  parallel under separate reviewer identities. This lane did not coordinate with,
  read intermediate outputs from, or reuse the runs of either. REV ≠ QA ≠ SEC.
- **First-hand.** No count, verdict, or check total below was taken on trust from
  the G5 bound-evidence-002 record, the -001 verdict, or any prior review. Every
  number was re-derived by this lane at the baseline checkout (§3), and every source
  claim was read directly from the tree at `3c439f7` (§4).

This is the exact producer-≠-reviewer boundary that `src/control/sod-rules.mjs`
codifies (`AUTHORIZE_TIME_LADDER: REV excludes producer`) and that G1 exists to
honor — upheld here in the identity of this lane.

## 1. Two-tree discipline (explicit)

Two distinct trees are in play, deliberately:

1. **Record tree — main @ `6a6e9de`.** This document is authored on a branch cut
   from the current main tip, so the operator-accepted re-cut record (baseline-recut-002,
   bound-evidence-002, and the -001 G1 verdict) are present in-tree and can be cited
   as the acceptance context this verdict binds to.
2. **Evidence tree — detached `3c439f7`.** All acceptance commands (`npm ci`,
   `npm test`, `validate-foundation`), all guard-pin checks, all source reads, and
   all seal checks were executed in a **separate detached worktree** checked out at
   exactly `3c439f7` — the accepted re-cut baseline the verdict is about. The record
   tree was never used to produce an evidence number.

## 2. Environment

| Item | Value |
|---|---|
| OS | Microsoft Windows 11 Pro `[Version 10.0.26200]` |
| Shell | Git Bash / MINGW64 (x86_64) |
| `node --version` | `v24.12.0` |
| `npm --version` | `11.6.2` |
| Checkout | `git worktree add --detach <path> 3c439f787e9ff15ffe195d5675feb8a1d5621fbe`; `git rev-parse HEAD` → `3c439f78…`; `git rev-parse HEAD^{tree}` → `39d00611…`; `git status --short` clean before the run |
| Dependency install | `npm ci` — exit 0 (`added 6 packages`) |
| Validator version | `0.3.0-alpha.0` (self-reported in validator JSON) |

## 3. Re-derived acceptance state (this lane's own run, NOT reused)

### 3.1 Full test suite (`npm test`)

```
ℹ tests 1331
ℹ suites 0
ℹ pass 1328
ℹ fail 0
ℹ cancelled 0
ℹ skipped 3
ℹ todo 0
ℹ duration_ms 6899.2642
```
exit code **0**.

- **Bound totals at `3c439f7`: 1331 tests / 1328 pass / 0 fail / 3 skipped / 0
  cancelled / 0 todo, exit 0.**
- `npm test` here is `npm run validate && node --test tests/*.test.mjs`, so the
  suite already chains the validator; §3.2 additionally records a standalone
  invocation.

### 3.2 Foundation validator (standalone `node tools/validate-foundation.mjs`)

- status **PASS**, exit **0**, version `0.3.0-alpha.0`.
- **898 checks total, 0 non-PASS.**
- `schemas.count` check: **PASS** — "7 canonical bootstrap schemas + 13 governed
  extensions" (= **20** schemas). Cross-checked on disk: `ls contracts/*.schema.json`
  → **20** files. Consistent. (The #129 schema-alignment merge grew
  `project-contract.schema.json` by +606 lines without adding a schema file, so the
  count correctly stays 20.)

### 3.3 Agreement with the G5 bound-evidence-002 record (verified, not trusted)

My independently-derived numbers **agree exactly** with the producer's
`secb-gov-001-bound-evidence-002.md` at the same SHA:

| Metric | bound-evidence-002 (producer) | This REV lane (independent) | Agreement |
|---|---|---|---|
| tests / pass / fail / skip | 1331 / 1328 / 0 / 3 | 1331 / 1328 / 0 / 3 | **AGREE** |
| `npm test` exit | 0 | 0 | **AGREE** |
| validator status / exit | PASS / 0 | PASS / 0 | **AGREE** |
| validator checks (total / non-PASS) | 898 / 0 | 898 / 0 | **AGREE** |
| schemas.count | 20 (7+13) | 20 (7+13) | **AGREE** |

No disagreement on any bound number. The bound-evidence-002 §7 honesty note ("one
executor, not yet independent") is now discharged for the REV dimension: an executor
distinct from the producer (`claude-rev-w2-g1-02` ≠ `claude-motor-a2-recut-01`) has
reproduced its figures at the accepted re-cut SHA.

## 4. REV substance (focused on what CHANGED since `c2ec645`, first-hand at `3c439f7`)

The delta between the -001 baseline (`c2ec645`) and this accepted re-cut baseline
(`3c439f7`) is the PR #129 schema-alignment work package (+6 tests, +39 validator
checks, one contract file revised). This lane focuses its substance there, and
re-verifies the governance-critical primitives and seals still hold.

### 4.1 The #129 schema revision — `contracts/project-contract.schema.json` (strict superset)

Read directly from the tree at `3c439f7` (603 lines; history:
`5d9fe46 [SCHEMA-ALIGN] … minLength tightening`, `8bc679d [SCHEMA-ALIGN] Reconcile …
Option-A rich shape (strict superset)`). Reconciles the narrow runtime shape
(ProjectContractService window fields) with the Option-A rich governance shape signed
NORMATIVE in `secb-gov-001-w3c-contract-signing-002.md`.

- **`additionalProperties: false` at every object level — CONFORMANT.** Top-level
  (line 7) plus every nested object: rich `owners` (role-keyed), rich `repositories`
  items, `environments` items, `governing_lifecycle_policy`, `evidence_chain`,
  `open_register_alignment`, `authority_invariant`, `memory_policy`,
  `revocation_policy`. No blanket loosening anywhere. Unknown top-level keys are
  rejected.
- **oneOf disjointness — CORRECT.** The top-level `oneOf` (lines 17–67) has a
  narrow branch (requires `risk_class`, `evidence_destination`, `valid_from`,
  `valid_until`) and a rich branch (requires `risk_ceiling`). A purely-narrow doc
  lacks `risk_ceiling` → matches narrow only; a purely-rich doc lacks the window
  fields → matches rich only; a doc supplying **both** sets satisfies both branches
  → `oneOf` rejects it (matches 2). This is the intended "EITHER narrow OR rich,
  never an arbitrary mix" semantic — mixing is actively rejected, not silently
  accepted. No overlap that would admit an ambiguous document.
- **additionalProperties footgun avoided — CAREFUL.** Because JSON Schema
  `additionalProperties` does not see into `oneOf`, every field used inside a oneOf
  branch (`risk_class`, `evidence_destination`, `valid_from`, `valid_until`,
  `risk_ceiling`) is **also** declared in the top-level `properties` block
  (lines 233–262). Absent that duplication, the top-level `additionalProperties:false`
  would have rejected valid documents. The revision handles this correctly.
- **Enums not widened — CONFORMANT.** `status` (7 values: DRAFT…REVOKED),
  `risk_class`/`risk_ceiling` (R0–R4) match the values the normative documents use;
  no value added.
- **Behavioral proof — GREEN.** `tests/project-contract-schema-alignment.test.mjs`
  re-run standalone: **6 tests / 6 pass / 0 fail**. Fixtures present and exercised:
  `valid/project-contract-rich.json`, `valid/project-contract-rich-v2r3.json`,
  `invalid/project-contract-rich-bad-type.json`,
  `invalid/project-contract-rich-extra-field.json` (rich + narrow validate;
  extra-field + wrong-type reject). Ajv2020 `strict:true` compiled the schema at
  validator load with 0 errors (898/898).

**Assessment:** the #129 revision is a correctly-constructed strict superset —
strictness preserved (additionalProperties:false everywhere, disjoint oneOf, no enum
widening), the classic additionalProperties/oneOf footgun avoided, both shapes
enumerated and typed. **Conformant.**

### 4.2 Re-verification of 3 of the 5 governance-critical files (unchanged since `c2ec645`)

Blob comparison at `3c439f7` vs the -001 baseline `c2ec645` vs the working tree:

| File | blob @ `3c439f7` | blob @ `c2ec645` | worktree | status |
|---|---|---|---|---|
| `src/ledger/durable-ledger.mjs` | `6be08fc1…` | `6be08fc1…` | `6be08fc1…` | **UNCHANGED since c2ec645; worktree matches** |
| `src/control/sod-rules.mjs` | `4ffbc201…` | `4ffbc201…` | `4ffbc201…` | **UNCHANGED since c2ec645; worktree matches** |
| `src/ledger/skill-revocation-ledger.mjs` | `7bd6203c…` | `7bd6203c…` | `7bd6203c…` | **UNCHANGED since c2ec645; worktree matches** |

All three are byte-identical to the exact files the original independent REV lane
read and found correct/fail-closed/authority-boundary-conformant. The #129 delta did
not touch any of them.

- **`src/control/sod-rules.mjs`** additionally read first-hand by this lane:
  `normalizeRole` denies non-string/empty (no permissive default); the
  `AUTHORIZE_TIME_LADDER` is `REV → [producer]`, `QA → [producer, reviewer]`,
  `GOV/EVIDENCE_ACCEPTOR → [producer, reviewer, qa, evidenceVerifier]`;
  `checkConflictingRoles`, `checkProhibitedActors`, `checkPairwiseDistinct` each
  return deny-by-default structured results and treat malformed input as typed denies
  (`DENY_MALFORMED_ROLES` / `DENY_MALFORMED_ACTOR` / `DENY_SOD` /
  `DENY_SOD_NOT_DISTINCT`). Pure, state-free, I/O-free. **Conformant** — the exact
  producer-≠-reviewer boundary this verdict honors.
- **`src/ledger/durable-ledger.mjs`** and **`src/ledger/skill-revocation-ledger.mjs`**:
  re-verification by byte-identity to the reviewed-conformant blobs, reinforced by the
  byte-identity guard actively pinning `sod-rules.mjs` (§4.3) and the full green suite
  (§3.1) that exercises them. The -001 verdict's LOW ledger-robustness notes (F-1,
  F-2) carry forward unchanged (see §5).

### 4.3 Byte-identity guard pins resolve to real reachable blobs at the baseline (≥3 verified)

The F4 guard in `tests/approval-binding.test.mjs` pins protected source files against
their blobs at `beebfe8` **and** `71b9d41`. Verified first-hand at the `3c439f7`
checkout (`git hash-object` vs `git rev-parse <ref>:<path>`):

| Protected file | working blob | matches `beebfe8` & `71b9d41`? |
|---|---|---|
| `src/control/sod-rules.mjs` | `4ffbc2019aae88178ecf0e5e6d2aa6b1e4aa9530` | **YES** |
| `src/control/policy-decision-point.mjs` | `de2fb006fae3085e1d222f832706a81b96c64dea` | **YES** |
| `src/gateway/capability-registry-service.mjs` | `dbf4905f7fd79b7c240f499600260f63abef3b2f` | **YES** |

All four pinned baselines cited by the byte-identity guards (`beebfe8`, `71b9d41`,
`adfeb8e`, `ec5aa76`) confirmed **ancestors of `3c439f7`**
(`git merge-base --is-ancestor` → true for each), so the pins resolve to real,
reachable blobs at the baseline rather than dangling refs. Guard integrity holds.

**Delta note (see F-4).** The F4 contract-set guard now deliberately **exempts**
`contracts/project-contract.schema.json` from the blob-identity pin (the file the #129
slice revised), while asserting the contract file *set* is unchanged (no schema
added/removed) so the guard still bites on every *other* contract. Tamper detection
for the revised schema is relocated — not dropped — to
`tests/project-contract-schema-alignment.test.mjs` + `tools/validate-foundation.mjs`,
both green at this baseline.

### 4.4 Sealed P0-20 / human-GOV slot is verdict:null / unfillable at the baseline

- `secb-gov-001-human-gov-decision-001.yaml` at `3c439f7`:
  `status: PENDING_HUMAN_GOV`, `project_contract_effective: false`,
  `human_gov_decision: pending`, `producer_may_fill: false`,
  `codex_may_activate: false`, `human_gov_required: true`, `approval_authority: false`.
- `p0-20-governance-decision-packet-001.md` at `3c439f7`, quoting the slot verbatim:
  the P0-20 slot (`src/self-pilot/read-only-self-pilot.mjs:58`) is "a deep-frozen
  operator-only slot (`status: PENDING_OPERATOR`, `authority: HUMAN_GOV_REQUIRED`,
  `verdict: null`, `rendered_by: null`, `effective: false`) with no code path to
  fill it". Document status: `CANDIDATE / ADVISORY — NOT A VERDICT, NOT AN ACTIVATION`.

The sealed slot is **verdict:null and structurally unfillable** at the accepted
baseline. Confirmed intact; this verdict does not touch it.

## 5. Findings by severity

No BLOCKER or HIGH findings. An honest REV records the following real, non-blocking
items:

- **F-4 — LOW/INFO (guard scope, correctly disclosed).** The F4 byte-identity guard
  now exempts `contracts/project-contract.schema.json` from its blob pin because the
  separately-scoped #129 slice legitimately revised it. This narrows the blob-pinned
  contract set by exactly one file. It is honestly documented in-test and compensated:
  the contract *set*-equality assertion still holds, and the revised schema's
  correctness is independently proven by the schema-alignment suite + the foundation
  validator (both green, §4.1). Acceptable; recorded so the operator knows tamper
  detection for that one file lives in behavioral tests, not the blob guard.
- **F-3 — MEDIUM (binding hygiene / documentation currency).** Point-in-time
  narrative numbers must not be carried across baselines: the validator check total is
  now **898** at `3c439f7` (was 859 @ `c2ec645`, 856 @ the closure report's own tree).
  The total has grown monotonically with 0 failures at every point (added guards/
  checks, no regressions). Only the **898** bound here (and in bound-evidence-002) is
  valid for `3c439f7`; the closure report's frozen figures are dated context, not
  baseline facts. Impact low if the operator binds the decision to this record /
  bound-evidence-002 and the current tracker rather than to stale prose.
- **F-1 — LOW (robustness, fail-closed) — carried forward from -001.** `DurableLedger`
  reads (`verify()`/`read()`) take no lock; a concurrent lock-free read during an
  `appendFileSync` could, on filesystems without large-write atomicity, observe a torn
  final line yielding `LEDGER_CORRUPT`. **Fails closed** (denies; never accepts bad
  data) — a liveness/robustness note, not a safety hole. File byte-identical to the one
  the -001 lane flagged.
- **F-2 — LOW (robustness) — carried forward from -001.** The `mkdir`-based lock has
  no stale-lock reclamation: a writer that crashes mid-critical-section leaves the
  `.lock` directory and every later `append` throws `LEDGER_BUSY` until manual cleanup.
  Fail-closed (denies rather than corrupts); a durability/availability consideration
  for any future live wiring.

F-1 and F-2 concern candidate primitives that remain **UNWIRED** at the baseline, so
neither affects the current advisory posture; both are wiring-time considerations for
whenever the operator authorizes activation.

## 6. REV verdict (bound to `3c439f7`)

> **APPROVE_WITH_NOTES.**

At `3c439f787e9ff15ffe195d5675feb8a1d5621fbe` (tree `39d00611…`), the operator-accepted
re-cut baseline, the SECB-GOV-001 packet's acceptance state is independently reproduced
and holds: the full suite is green (1331/1328/0/3, 0 failures), the foundation validator
passes (**898/898**), the schema set is intact (**20**), the **#129 schema revision is a
correct strict superset** (additionalProperties:false at every level, disjoint oneOf,
no enum widening, footgun avoided, behavioral suite green), the three re-verified
governance-critical primitives are byte-identical to the reviewed-conformant blobs and
remain correct/fail-closed/authority-boundary conformant, the byte-identity guards pin
real reachable blobs (4 ancestors, 3 files resolve+match), and the sealed human-GOV /
P0-20 slot is `verdict:null` / `rendered_by:null` / `effective:false` and structurally
unfillable. This lane's numbers **agree exactly** with the G5 bound-evidence-002 record,
discharging the REV independence requirement at the new baseline.

The verdict is **APPROVE_WITH_NOTES**, not a bare APPROVE, because of the MEDIUM
binding-hygiene finding F-3 (bind to the 898 / bound-evidence-002 figures, not stale
point-in-time prose) and the LOW/INFO notes F-4 (guard-scope disclosure) and F-1/F-2
(unwired-ledger robustness). None is a blocker; all are recorded for the operator.

**Acceptance / blockers.** From the REV dimension only: the packet is
**READY_FOR_OPERATOR_DECISION** on the G1 axis at this SHA, subject to the notes above.
This is **not** an activation clearance: the parallel G2 (QA) and G3 (SEC)
re-derivations at this baseline, plus G6 (evidence acceptance), G7 (effective contract),
G8 (STABLE/demotion/rollback policy), and G9 (human GOV decision) remain independently
required and OPERATOR/lane-gated. This verdict clears exactly one of them: **G1**, and
only at `3c439f7`.

## 7. What this record does NOT do

- Does **not** close G1 by its own authority — it supplies the returned, bound,
  independent REV verdict G1 requires at the accepted re-cut baseline; weight-bearing
  use follows operator handling.
- Does **not** render a QA or SEC verdict, does **not** accept evidence, does **not**
  sign the Project Contract, does **not** render the human-GOV decision, does **not**
  seal P0-20, and does **not** pre-fill any decision field (V-020).
- Does **not** edit the -001 verdict or any tracker/MANIFEST (extend-only; the staging
  owner folds the three parallel re-run lanes). This commit adds exactly one document.
- Changes **zero** files under `src/`, `contracts/`, `tools/`, or `tests/`; performs no
  merge and no push.

## 8. Advisory status fields

```yaml
truth_status: verified_true        # every acceptance number re-derived first-hand at 3c439f7; every source claim read from the tree
authority_status: advisory_only    # independent REV verdict; acceptance/promotion remain operator/lane-gated
implementation_status: existing    # the reviewed primitives + revised schema exist and pass at the baseline; verdict is APPROVE_WITH_NOTES
risk_class: medium                 # advisory artifact feeding a high-risk promotion decision (closure plan G1 card)
```

## 9. Self-certification

```yaml
self_certification:
  agent_id: claude-rev-w2-g1-02
  peer_agent_id: claude-motor-a2-recut-01
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Certified: this is a complete, independent REV verdict work product re-derived at the
> operator-accepted re-cut baseline, produced by a reviewer distinct from the producer
> (`claude-motor-a2-recut-01`), from the original G1 lane (`claude-rev-w2-g1-01`), and
> from the parallel G2/G3 re-run lanes. Every acceptance number was executed and observed
> first-hand at `3c439f787e9ff15ffe195d5675feb8a1d5621fbe` (tree
> `39d006117c853ff0625f80a5d5d431c6b49bf1b8`) in a clean, detached worktree, while this
> record was cut from current main @ `6a6e9de` so the accepted re-cut record is in-tree
> to cite. It carries no execution or approval authority; G1 closure and the promotion
> decision remain the operator's.
