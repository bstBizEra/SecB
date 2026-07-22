# SECB-GOV-001 Wave-2 G1 — Independent REV Verdict at the Accepted Baseline

| Field | Value |
|---|---|
| Artifact | `secb-gov-001-w2-g1-rev-verdict-001` |
| Reviewer identity | `claude-rev-w2-g1-01` (BST-SA Immune/REV lane, advisory) |
| Lane | **W2-G1** — independent REV verdict lane of `secb-gov-001-readiness-closure-plan-001.md` §3 Wave 2a (decision point B), closing gap **G1** |
| Gap addressed | **G1** — "Completed independent REV verdict (not a dispatch) bound to one exact, on-main SHA — verdict + commands/environment + evidence refs + residual risks + acceptance/blockers" (first readiness review §7 item 1; second review §2 #1 "CONFIRMED still open") |
| Evidence baseline (WHERE THE RUN HAPPENED) | detached checkout of `c2ec6458b60ded0a93d74e717cd7816f55834f01` (tree `3b7300f1b7cd378d373cf8e2da10dc459bb8f63b`) — the operator-accepted G4 promotion baseline |
| Record baseline (WHERE THIS DOC LIVES) | branched from main @ `5223db928128f9ed967279b15ce81b39e316c535` (PR #115 merge, the accepted G4/G5 record) |
| Timestamp (UTC) | 2026-07-22T04:17:54Z |
| Scope | Advisory independent REV verdict on the SECB-GOV-001 packet at the single accepted on-main baseline. NOT a QA verdict, NOT a SEC review, NOT an evidence-acceptance, NOT a promotion, NOT an activation, NOT a P0-20 seal. |
| Authority | Advisory only. No merge, no push, no effectiveness declaration. The promotion decision (G9) remains OPERATOR_ONLY. |

> **Binding statement (read before citing any number below).** Every acceptance
> number in §3 was produced first-hand by commands run on a detached checkout of
> commit `c2ec6458b60ded0a93d74e717cd7816f55834f01` (tree
> `3b7300f1b7cd378d373cf8e2da10dc459bb8f63b`). This verdict is valid **only** for
> that exact commit and tree. If the SHA under evaluation differs in even one
> character — any later main tip, any re-cut successor baseline, or any branch
> merely *containing* this commit as an ancestor — **this verdict is void for
> your purpose** and G1 must be re-derived at your SHA.

---

## 0. Separation-of-duties attestation

This REV lane is a **distinct executor** from every other actor in the closure chain:

- **Distinct from the producer.** The G4 baseline-re-cut proposal
  (`secb-gov-001-baseline-recut-001.md`) and the G5 bound-evidence record
  (`secb-gov-001-bound-evidence-001.md`) were produced by
  `claude-motor-w1a-baseline-01` (Wave-1a Motor). This REV verdict is produced by
  `claude-rev-w2-g1-01`, an independent Wave-2 reviewer in an isolated worktree.
  Producer ≠ REV.
- **Distinct from the parallel Wave-2 lanes.** The G2 QA lane and the G3 SEC lane
  run in parallel under separate reviewer identities. This lane did not coordinate
  with, read intermediate outputs from, or reuse the runs of either. REV ≠ QA ≠ SEC.
- **First-hand.** No count, verdict, or check total below was taken on trust from
  the G5 record, the closure report, or any prior review. Every number was
  re-derived by this lane at the baseline checkout (§3), and every source claim was
  read directly from the tree at `c2ec645` (§4).

This satisfies the SoD ladder that both readiness reviews found unmet: the packet
previously carried only a *dispatch* record with no returned verdict from a
non-producer (first review §2 "Independent-review question"; second review §2 #1).

## 1. Two-tree discipline (explicit)

Two distinct trees are in play, deliberately:

1. **Record tree — main @ `5223db9`.** This document is authored on a branch cut
   from the current main tip, so the operator-accepted G4/G5 record (merged via
   PR #115, commit `4b8590b` on this branch's history) is present in-tree and can
   be cited as the acceptance context this verdict binds to.
2. **Evidence tree — detached `c2ec645`.** All acceptance commands (`npm ci`,
   `npm test`, `validate-foundation`), all guard-pin checks, all source reads, and
   all seal checks were executed in a **separate detached worktree** checked out at
   exactly `c2ec645` — the baseline the verdict is about. The record tree was never
   used to produce an evidence number.

This is intentional: a verdict *about* a baseline must be *cut* against the record
that accepted the baseline, but *run* against the baseline itself. Mixing the two
trees is the exact defect (five conflicting SHAs, unbound self-report) that kept
the packet NOT_READY. This lane keeps them separate and says so.

## 2. Environment

| Item | Value |
|---|---|
| OS | Microsoft Windows 11 Pro `[Version 10.0.26200]` |
| Shell | Git Bash / MINGW64 (x86_64) |
| `node --version` | `v24.12.0` |
| `npm --version` | `11.6.2` |
| Checkout | `git worktree add --detach <path> c2ec6458b60ded0a93d74e717cd7816f55834f01`; `git rev-parse HEAD^{tree}` → `3b7300f1b7cd378d373cf8e2da10dc459bb8f63b`; `git status --short` clean before the run |
| Dependency install | `npm ci` — exit 0 |
| Validator version | `0.3.0-alpha.0` (self-reported in validator JSON) |

## 3. Re-derived acceptance state (this lane's own run, NOT reused)

### 3.1 Full test suite (`npm test`)

```
ℹ tests 1325
ℹ suites 0
ℹ pass 1322
ℹ fail 0
ℹ cancelled 0
ℹ skipped 3
ℹ todo 0
```
exit code **0**.

- **Bound totals at `c2ec645`: 1325 tests / 1322 pass / 0 fail / 3 skipped / 0
  cancelled / 0 todo, exit 0.**
- `npm test` here is `npm run validate && node --test tests/*.test.mjs`, so the
  suite already chains the validator; §3.2 additionally records a standalone
  invocation.

### 3.2 Foundation validator (standalone `node tools/validate-foundation.mjs`)

- status **PASS**, exit **0**, version `0.3.0-alpha.0`.
- **859 checks total, 0 non-PASS.**
- `schemas.count` check: **PASS** — "7 canonical bootstrap schemas + 13 governed
  extensions" (= **20** schemas). Cross-checked on disk: `ls contracts/*.schema.json`
  → **20** files. Consistent.

### 3.3 Agreement with the G5 bound-evidence record

My independently-derived numbers **agree exactly** with the G5 record
(`secb-gov-001-bound-evidence-001.md`) at the same SHA:

| Metric | G5 record (producer) | This REV lane (independent) | Agreement |
|---|---|---|---|
| tests / pass / fail / skip | 1325 / 1322 / 0 / 3 | 1325 / 1322 / 0 / 3 | **AGREE** |
| `npm test` exit | 0 | 0 | **AGREE** |
| validator status / exit | PASS / 0 | PASS / 0 | **AGREE** |
| validator checks (total / non-PASS) | 859 / 0 | 859 / 0 | **AGREE** |
| schemas.count | 20 (7+13) | 20 (7+13) | **AGREE** |

No disagreement on any bound number. The G5 record's own honesty note (§5 "one
executor, not yet independent") is now discharged for the REV dimension: an
executor distinct from the producer has reproduced its figures at the bound SHA.

## 4. REV substance (sample-based technical review, first-hand at `c2ec645`)

### 4.1 Governance-critical source files reviewed for correctness / fail-closed / authority-boundary conformance

Five files read directly from the tree at `c2ec645`:

1. **`src/ledger/durable-ledger.mjs`** (200 lines). Hash-chained append-only ledger:
   sha-256 over canonicalized JSON, per-record `previousHash`/`entryHash`/`recordHash`
   linkage, `#verifyRecords` re-derives the whole chain on every read/verify/append
   and throws `LEDGER_INTEGRITY_FAILURE` on any mismatch. Write path is deny-by-default
   and fail-closed: `validateEntry` throws on malformed input *before* the lock; a
   `mkdir`-based exclusive lock (`LEDGER_BUSY` on contention); idempotency-replay with
   content-hash conflict detection (`DENY_IDEMPOTENCY_CONFLICT`); duplicate-entryId and
   optimistic-sequence guards; `structuredClone` isolation of caller data; `preWriteCheck`
   subclass hook evaluated atomically inside the same lock. **Conformant** — with two
   robustness notes (F-1, F-2 below).
2. **`src/contracts/contract-validator.mjs`** (68 lines). Ajv2020 `strict:true`,
   `allErrors:true`; 20 schema kinds compiled eagerly at module load (a malformed
   schema fails closed at import). `validateContract` denies unknown kinds
   (`DENY_UNKNOWN_CONTRACT`) and invalid candidates (`DENY_CONTRACT_INVALID`), cloning
   error detail. The 20-kind map is consistent with the validator's `schemas.count`.
   **Conformant.**
3. **`src/control/sod-rules.mjs`** (225 lines). Pure, state-free, I/O-free SoD
   primitives. `normalizeRole` denies non-string/empty to `null` (no permissive
   default). `checkConflictingRoles`, `checkProhibitedActors` (authorize-time ladder:
   REV excludes producer; QA excludes producer+reviewer; GOV excludes
   producer+reviewer+qa+evidenceVerifier), and `checkPairwiseDistinct` each return
   deny-by-default structured results and treat malformed input as a typed deny
   (`DENY_MALFORMED_ROLES`/`DENY_MALFORMED_ACTOR`). **Conformant** — this is the exact
   producer-≠-reviewer boundary G1 exists to honor.
4. **`src/ledger/skill-revocation-ledger.mjs`** (404 lines). Governed PUBLISHED→REVOKED
   transition, R3+ human-approval floor via reused `riskProfile` (a caller cannot
   downgrade risk to skip the human gate — `DENY_RISK_CLASS_BELOW_FLOOR`), N-5 SoD via
   **reused** `approval-binding.mjs` (no reimplemented distinctness math), mint+verify
   of the exact `REVOKE_SKILL@<objectVersion>` binding (MR-3-class replay protection),
   single-read `structuredClone` snapshot against hostile getters/Proxies, and a
   terminal-forever `DENY_ALREADY_REVOKED` gate run only inside the locked
   `preWriteCheck` (never a second unlocked `read()`). Structural problems throw before
   any lock; business denials return structured denies without writing. **Conformant.**
5. **`src/self-pilot/read-only-self-pilot.mjs`** (453 lines). Pure read-only
   orchestration composing ratified primitives; every step deny-by-default and
   fail-closed, halting the chain and recording later steps SKIPPED on any typed
   deny/throw. Positively proves the authority boundary: producer self-verification is
   blocked (`DENY_VERIFIER_IS_PRODUCER`), access escalation Observe→Control is blocked,
   lease over-reach is blocked, unaccepted evidence never resolves accepted, and the
   `GOV_DECISION_SLOT` is a frozen `verdict:null` / `rendered_by:null` /
   `authority:HUMAN_GOV_REQUIRED` object the module has **no code path to fill**. The
   returned trace carries `p0_20_verdict_rendered:false`, `self_authorized:false`,
   `authorized_execution:false`. **Conformant** — this is the strongest single
   demonstration that the substrate cannot self-authorize the GOV decision.

### 4.2 Byte-identity guard pins resolve to actual blobs at the baseline (≥3 verified)

The F4 guard in `tests/approval-binding.test.mjs` pins protected source files against
their blobs at `beebfe8` **and** `71b9d41`. Verified first-hand with `git hash-object`
vs `git rev-parse <ref>:<path>` at the `c2ec645` checkout:

| Protected file | working blob | matches `beebfe8` & `71b9d41`? |
|---|---|---|
| `src/control/sod-rules.mjs` | `4ffbc2019aae88178ecf0e5e6d2aa6b1e4aa9530` | **YES** |
| `src/control/policy-decision-point.mjs` | `de2fb006fae3085e1d222f832706a81b96c64dea` | **YES** |
| `src/gateway/capability-registry-service.mjs` | `dbf4905f7fd79b7c240f499600260f63abef3b2f` | **YES** |

All four pinned baselines cited by the byte-identity guards (`beebfe8`, `71b9d41`,
`adfeb8e`, `ec5aa76`) confirmed to be **ancestors of `c2ec645`**
(`git merge-base --is-ancestor` → true for each), so the pins resolve to real,
reachable blobs at the baseline rather than dangling refs. The pinned SHAs are the
actual on-tree blobs; guard integrity holds.

### 4.3 Sealed P0-20 slot is verdict:null / unfillable at the baseline

- `secb-gov-001-human-gov-decision-001.yaml` at `c2ec645`: `status: PENDING_HUMAN_GOV`,
  `producer_may_fill: false`, `codex_may_activate: false`, `human_gov_required: true`.
- `p0-20-governance-decision-packet-001.md` at `c2ec645`: the P0-20 verdict is "an
  **empty, operator-only slot** … `verdict: null`, `rendered_by: null`,
  `effective: false` … **with no code path to fill it** … an agent filling it is a
  governance violation." Status: `CANDIDATE / ADVISORY — NOT A VERDICT`.
- Independently corroborated by the live substrate: `read-only-self-pilot.mjs`'s
  frozen `GOV_DECISION_SLOT` (§4.1 item 5) exports no verdict-setter.

The sealed slot is **verdict:null and structurally unfillable** at the baseline.
Confirmed intact; this verdict does not touch it.

### 4.4 Spot-verification of 3 closure-report claims against the tree

Claims from `p0-closure-report-001.md`, checked at `c2ec645`:

1. **Suite "1325 tests / 1322 pass / 0 fail / 3 skipped".** **CONFIRMED** — matches
   my §3.1 run exactly.
2. **"20 contract schemas (7 canonical + 13 governed)".** **CONFIRMED** — validator
   `schemas.count` and on-disk `ls contracts/*.schema.json` both read 20.
3. **Validator "856/856 checks PASS".** **DOES NOT REPRODUCE at `c2ec645`** — I get
   **859/859**. This is not a defect: the closure report bound its 856 figure to its
   own tree (`2a22e52`), and the check total has grown monotonically with 0 failures
   at every point (856 @ `2a22e52` → 857 @ `1ef3ae9` → 859 @ `c2ec645`, per the G5
   record and my own run). It is, however, a **binding-hygiene finding** (F-3): the
   closure report's numbers are point-in-time and MUST NOT be cited as the baseline's
   figures — only the 859 bound here (and in G5) are valid for `c2ec645`.

## 5. Findings by severity

No BLOCKER or HIGH findings. An honest REV surfaces the following real,
non-blocking items:

- **F-3 — MEDIUM (binding hygiene / documentation currency).** Two narrative claims
  in `p0-closure-report-001.md` are **stale relative to `c2ec645`** and must not be
  read as baseline facts: (a) its validator check total (856) is superseded by 859 at
  the baseline; (b) its §2.1 statement that MOD-A2A carries "no module completion
  verdict on record" is outdated — `mod-a2a-completion-review-001.md`
  (**FINISHED_WITH_TRACKED_FOLLOWUPS**) landed at `57a2706`, *after* the report
  (`5940729`), and IS present at `c2ec645`. Verified: closure-report commit is an
  ancestor of the A2A-review commit. The `module-completion-tracker-001.md` (the
  single source of truth) already reflects the current state via its append-only log;
  only the report's point-in-time prose lags. Impact: low if the operator treats the
  report as dated context and binds the promotion decision to G5/this record's 859 and
  the current tracker — not to the report's frozen numbers. Recommended disposition:
  cite `c2ec645` evidence (859 checks; MOD-A2A verdict present) from G5/this record,
  and treat the closure report as historical.
- **F-1 — LOW (robustness, fail-closed).** `DurableLedger` reads (`verify()`/`read()`)
  take no lock. A concurrent `append` writes one line via `appendFileSync`; on
  filesystems without large-write atomicity a lock-free read during that write could
  observe a torn final line, yielding `LEDGER_CORRUPT`. This **fails closed** (denies;
  never accepts bad data), so it is a liveness/robustness note, not a safety hole.
- **F-2 — LOW (robustness).** The `mkdir`-based lock has no stale-lock reclamation: a
  writer that crashes mid-critical-section leaves the `.lock` directory, and every
  subsequent `append` throws `LEDGER_BUSY` until manual cleanup. Again fail-closed
  (denies rather than corrupts), but a durability/availability consideration for any
  future wiring of these ledgers into a live path.

F-1 and F-2 concern candidate primitives that are **UNWIRED** at the baseline (zero
live importers), so neither affects the current advisory posture; both are
wiring-time considerations for whenever the operator authorizes activation.

## 6. REV verdict (bound to `c2ec645`)

> **APPROVE_WITH_NOTES.**

At `c2ec6458b60ded0a93d74e717cd7816f55834f01` the SECB-GOV-001 packet's acceptance
state is independently reproduced and holds: the full suite is green (0 failures), the
foundation validator passes (859/859), the schema set is intact (20), the byte-identity
guards pin real reachable blobs, the reviewed governance-critical primitives are
correct, fail-closed, and authority-boundary conformant, and the sealed human-GOV /
P0-20 slot is `verdict:null` and structurally unfillable. This lane's numbers agree
exactly with the G5 bound evidence, discharging the REV independence requirement that
both readiness reviews found missing (G1).

The verdict is **APPROVE_WITH_NOTES**, not a bare APPROVE, because of the MEDIUM
binding-hygiene finding F-3 (do not carry the closure report's stale 856/MOD-A2A-absent
claims into a decision bound to `c2ec645`) and the two LOW ledger-robustness notes
(F-1, F-2). None is a blocker; all are recorded for the operator.

**Acceptance / blockers.** From the REV dimension only: the packet is
**READY_FOR_OPERATOR_DECISION** on the G1 axis at this SHA, subject to the notes above.
This is **not** an activation clearance: G2 (QA) and G3 (SEC) verdicts, G6 (evidence
acceptance), G7 (effective contract), G8 (STABLE/demotion/rollback policy), and G9
(human GOV decision) remain independently required and OPERATOR/lane-gated. This
verdict clears exactly one of them: G1.

## 7. What this record does NOT do

- Does **not** close G1 by its own authority — it supplies the returned, bound,
  independent REV verdict G1 requires; weight-bearing use follows operator handling.
- Does **not** render a QA or SEC verdict, does **not** accept evidence, does **not**
  sign the Project Contract, does **not** render the human-GOV decision, does **not**
  seal P0-20, and does **not** pre-fill any decision field (V-020).
- Changes **zero** files under `src/`, `contracts/`, `tools/`, or `tests/`; performs
  no merge and no push.

## 8. Advisory status fields

```yaml
truth_status: verified_true        # every acceptance number re-derived first-hand at c2ec645; every source claim read from the tree
authority_status: advisory_only    # independent REV verdict; acceptance/promotion remain operator/lane-gated
implementation_status: existing    # the reviewed primitives exist and pass at the baseline; verdict is APPROVE_WITH_NOTES
risk_class: medium                 # advisory artifact feeding a high-risk promotion decision (closure plan G1 card)
```

## 9. Self-certification

```yaml
self_certification:
  agent_id: claude-rev-w2-g1-01
  peer_agent_id: claude-motor-w1a-baseline-01
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Certified: this is a complete, independent REV verdict work product, produced by a
> reviewer distinct from the producer (`claude-motor-w1a-baseline-01`) and from the
> parallel G2/G3 lanes. Every acceptance number was executed and observed first-hand at
> `c2ec6458b60ded0a93d74e717cd7816f55834f01` (tree
> `3b7300f1b7cd378d373cf8e2da10dc459bb8f63b`) in a clean, detached worktree, while this
> record was cut from main @ `5223db9` so the accepted G4/G5 record is in-tree to cite.
> It carries no execution or approval authority; G1 closure and the promotion decision
> remain the operator's.
