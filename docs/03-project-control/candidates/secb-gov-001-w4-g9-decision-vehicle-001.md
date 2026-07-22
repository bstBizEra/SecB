# SECB-GOV-001 — W4 G9 Decision Vehicle (Sealed Slot; OPERATOR-ONLY)

**Artifact ID:** SECB-GOV-001-W4-G9-DECISION-VEHICLE-001
**Status:** VEHICLE_ONLY_PENDING_HUMAN_GOV — the §5 slot is EMPTY and stays empty until the operator fills it
**Wave:** 4 (W4/G9, per `secb-gov-001-readiness-closure-plan-001.md` §3 decision point D, ratified PR #114)
**Gap addressed:** G9 — "Explicit human GOV decision" (first readiness review §7 item 9; second review §2 #9 "CONFIRMED, and still empty"; closure plan §2 G9 card: executor `OPERATOR_ONLY`, risk_class `critical`)
**Built by:** claude-cortex-w4-vehicle-01 (BST-SA Cortex; advisory only — scaffold construction, zero decision content)
**Built at:** 2026-07-22
**Base:** main @ `3c439f787e9ff15ffe195d5675feb8a1d5621fbe` (PR #129 merge — the schema-alignment slice whose landing triggered this dispatch)
**Relation to the legacy G9 template:** supersedes `secb-gov-001-human-gov-decision-001.yaml` **by reference, extend-only** — see §1.1

---

## 1. What this record is (and is not)

This is the **G9 decision SURFACE**: the vehicle the operator uses to render the
SECB-GOV-001 promotion decision. Mirroring the W3c pattern exactly
(`secb-gov-001-w3c-contract-signing-001.md` §5–§6): **merging this record lands
the vehicle only. Merging the vehicle is NOT deciding.** The verdict is rendered
ONLY by the operator — by direct edit, or by transcription of explicit operator
selections into a successor revision (§6).

- The §5 slot is empty. No verdict, no disposition, no default, no
  recommendation exists anywhere in this document.
- **An agent (Claude, Codex, any LLM) filling any §5 field is a governance
  violation** (V-020 invariant; closure plan §2 G9: "No agent may draft,
  pre-fill, or simulate this record's decision fields").
- This record renders no verdict, promotes nothing, activates nothing, seals
  nothing, and does not touch the P0-20 sealed slot or the operator HOLD (PR #78).

### 1.1 Disposition of the legacy G9 artifact (disclosed, source-derived)

`secb-gov-001-human-gov-decision-001.yaml` remains on main, verbatim, verdict-free
(`status: PENDING_HUMAN_GOV`, all preconditions `false`/`pending`,
`producer_may_fill: false`). Both readiness reviews certified it as "a correct,
empty template … not pre-filled, not forged" — the control working. This vehicle
**supersedes it by reference (extend-only; the legacy file is not edited)** rather
than extending it in place, because the reviews' own findings make the legacy
record structurally insufficient for a valid G9 decision:

1. **Binding defect:** its `candidate_baseline.commit: e220002` is a producer-branch
   SHA **not on main** (first review §4 SHA table: "Not on main (producer SHA)";
   second review §2 #9 read with #4). A valid G9 decision must bind to the
   operator-accepted G4 baseline. The closure plan's G9 card explicitly
   contemplates this successor path: the operator fills the decision record *"(or
   a refresh-003 successor template bound to the G4 SHA)"*.
2. **Stale preconditions:** its precondition block predates Waves 1–3; the
   contract-effective / REV / QA / SEC / evidence-accepted preconditions it lists
   as `false` are now evidenced on main (§2 below). A decision rendered on the
   legacy block would misstate the evidence base.
3. **Stale option set:** its options (`PASS_FOR_P0_CONTROLLED_ACTIVATION` / HOLD /
   REQUEST_CHANGES) predate the adopted G8 lifecycle policy (PR #122) and conflate
   pack promotion with platform activation. G9 per the closure plan is the
   **promotion** decision for the governance pack; P0-20 activation is a separate,
   untouched operator gate (§4.1).

The legacy template is therefore preserved as the historical sealed slot this
vehicle prepares the successor for; nothing in it is rewritten or deleted.

---

## 2. Decision-basis citation table (each item ratified on main; exact SHAs)

| # | Basis item | Record | Landed via | On-main SHA |
|---|---|---|---|---|
| B1 | Ratified closure plan (defines W4/G9) | `secb-gov-001-readiness-closure-plan-001.md` | PR #114 | merge `c2ec6458b60ded0a93d74e717cd7816f55834f01` |
| B2 | **Accepted G4 baseline** — single on-main promotion baseline `c2ec645` (tree `3b7300f1b7cd378d373cf8e2da10dc459bb8f63b`); operator acceptance = ratification of the re-cut record | `secb-gov-001-baseline-recut-001.md` | PR #115 | merge `5223db928128f9ed967279b15ce81b39e316c535` |
| B3 | G5 bound evidence at `c2ec645`: suite 1325/1322 pass/0 fail/3 skip exit 0; validator PASS 859/859 exit 0; schemas.count 20 | `secb-gov-001-bound-evidence-001.md` | PR #115 | merge `5223db9` (same) |
| B4 | W2-G1 independent REV verdict **APPROVE_WITH_NOTES** at `c2ec645` | `secb-gov-001-w2-g1-rev-verdict-001.md` | PR #118 | merge `1c4e5c7eba4d52c51aeb997c69a88c83b86854b1` |
| B5 | W2-G2 independent QA verdict **QA_PASS_WITH_NOTES** at `c2ec645` | `secb-gov-001-w2-g2-qa-verdict-001.md` | PR #117 | merge `d790fb62fe0330b20ef10d764863ee146aa26a0a` |
| B6 | W2-G3 independent SEC review **SEC_PASS_WITH_NOTES** at `c2ec645` (0 BLOCKER/CRITICAL; 1 upstream HIGH, since remediated — B9) | `secb-gov-001-w2-g3-sec-review-001.md` | PR #119 | merge `3add7cb6de22a2b59eac0017db0449be18852a0d` |
| B7 | G6 evidence acceptance — operator accepted the E1–E4 chain (four pairwise-distinct executors, exact numeric agreement) | `secb-gov-001-w3a-evidence-acceptance-001.md` | PR #121 | merge `bf2b20d66de851520adbb56034db8bec6c6959fd` |
| B8a | G8 STABLE/demotion/rollback policy **ADOPTED / EFFECTIVE** at version pin (blob) `15a3b012f19adea394c86fba2469a614dcf0bbfb` | `secb-gov-001-w3b-policy-adoption-001.md` | PR #122 | merge `e9204741903301eaaba9009f9e98b3d77dbb29f0` |
| B8b | G7 Project Contract **SIGNED / EFFECTIVE** at version pin (blob) `8c1179eea7b344b5b201f109b4e8b577a6875104`; effective from ratification-merge timestamp **2026-07-22T09:40:03Z** (first-hand `git show -s --format=%cI 3177bc5` → `2026-07-22T16:40:03+07:00`; the dispatch order cited 09:40:04Z — 1-second discrepancy, the git committer timestamp governs); expires +P180D ≈ **2027-01-18** | `secb-gov-001-w3c-contract-signing-002.md` | PR #124 | merge `3177bc55b247e32862e33cc77142010674375449` |
| B9 | fast-uri HIGH (GHSA-v2hh-gcrm-f6hx) **REMEDIATED** — lockfile-only bump 3.1.3→3.1.4; official-registry audit 0 vulnerabilities | tracker line + `package-lock.json` | PR #125 | merge `b93cd7d81f63d948876f1e0f5933106d6180f55a` |
| B10 | Closure-report addendum — errata binding decisions to bound evidence, not frozen prose | `p0-closure-report-001-addendum-001.md` | PR #126 | merge `6f6a5eabe46bcf8760ad5a003aecd242df69aceb` |
| B11 | **The 9/10 gap ledger** — addendum §2: "9 of 10 gaps CLOSED … **Only G9 (human-GOV verdict) remains**" (G1 #118, G2 #117, G3 #119, G4 #115, G5 #115 + triple corroboration, G6 #121, G7 #124, G8 #122, G10 closed-since-review) | `p0-closure-report-001-addendum-001.md` §2 | PR #126 | merge `6f6a5ea` (same) |

All eleven basis items are on main at this vehicle's base `3c439f7`; every SHA
above verified first-hand in this worktree (`git log 3c439f7 --merges`).

---

## 3. THE POST-BASELINE DELTA (every merge past `c2ec645`, first-hand)

`git rev-list c2ec645..3c439f7`: **37 commits total — 21 merge commits (15 PR
merges + 6 origin/main sync merges into the PR branches) + 16 branch payload
commits.** Every PR merge, classified by first-hand diffstat (`git diff
--name-only <merge>^1 <merge>`):

| PR | Merge SHA | Content | Classification |
|---|---|---|---|
| #115 | `5223db9` | G4 re-cut + G5 bound evidence records + tracker/MANIFEST | docs-only |
| #116 | `d75a9bf` | G8 rollback-policy candidate draft | docs-only |
| #117 | `d790fb6` | W2-G2 QA verdict | docs-only |
| #118 | `1c4e5c7` | W2-G1 REV verdict | docs-only |
| #119 | `3add7cb` | W2-G3 SEC review | docs-only |
| #120 | `eee1bed` | G7 contract v2-r3 draft | docs-only |
| #121 | `bf2b20d` | W3a evidence acceptance (G6 closed) | docs-only |
| #122 | `e920474` | W3b policy adoption (G8 EFFECTIVE) | docs-only |
| #123 | `8161531` | W3c signing scaffold | docs-only |
| #124 | `3177bc5` | W3c-002 signing transcription (G7 EFFECTIVE) | docs-only |
| #125 | `b93cd7d` | fast-uri 3.1.3→3.1.4, `package-lock.json` only + tracker line | **lockfile** |
| #126 | `6f6a5ea` | closure-report addendum | docs-only |
| #127 | `adc6cf0` | Skills Pack v0.1 — 165 files under `.agents/` (all M0, CANDIDATE/NOT-EFFECTIVE) + **MANIFEST.json** anchors; zero `src/`/`contracts/`/`tools/`/`tests/` change | docs-class (non-runtime content; MANIFEST touch disclosed) |
| #128 | `05d91be` | Root `AGENTS.md` skills-registry amendment (extend-only) + tracker | docs-only |
| #129 | `3c439f7` | **Project-contract schema revision**: `contracts/project-contract.schema.json` (strict-superset rich shape per the signed Option-A decision), 4 test files, 4 fixtures, MANIFEST, 2 candidate records | **SRC-ADJACENT (`contracts/` + `tests/`)** |

**Breakdown: 13 docs-class (12 pure docs-only + #127 with its disclosed
MANIFEST/`.agents/` nuance), 1 lockfile-only (#125), 1 src-adjacent (#129).**

**Highlight, stated plainly:** #129 changed a file under `contracts/` — the first
and only post-baseline merge to touch the runtime-adjacent tree
(`src`/`contracts`/`tools`/`tests`). It was independently produced, verified
(`schema-alignment-project-contract-producer-verification-001.md`: suite
1331/1328/0 fail/3 skip; validator exit 0; schemas.count 20 unchanged; strict
`additionalProperties:false` preserved; byte-identity guards intact), and
cross-reviewed (`schema-alignment-crossrev-001.md`) before the operator merged
it — but it is **not** covered by the G5/W2 evidence, all of which is bound to
`c2ec645` and to nothing else.

### 3.1 The WAIVE-OR-RE-CUT choice (an explicit operator input — both directions stated with equal honesty)

The accepted G4 record's own rule (`secb-gov-001-baseline-recut-001.md` §4):
*"any subsequent main advance requires either a re-cut or an explicit operator
waiver … Silence is not a waiver."* The one-hop self-advance waiver in that §4
covered only PR #115's own staging merge; the 14 subsequent merges are NOT
covered. Therefore the §5 slot requires `baseline_disposition` alongside the
verdict:

- **WAIVE_DELTA** — the operator accepts that the decision rests on the
  `c2ec645`-bound evidence (B3–B6) plus the per-PR review trail of the 15
  post-baseline merges, **without fresh whole-tree evidence at the current
  tip**. Honest trade: every one of those merges was individually
  operator-ratified, and #125/#129 each carried their own first-hand
  verification runs — but no single REV/QA/SEC pass has examined the tree at
  `3c439f7` as a whole, and the W2 verdicts say expressly that they are void
  for any other SHA (§3.2). Waiving accepts that gap knowingly.
- **RECUT_FIRST** — the operator orders a W1a-style re-run at the current tip
  (or tip-at-dispatch): a new baseline-recut record proposing ONE new SHA, a
  fresh G5 bind at that SHA, and re-derived verdict lanes per §3.2. Honest
  trade: maximal evidence integrity, at the cost of re-running the lanes — and
  the new cycle re-creates the same problem one level up (its own staging
  merges advance main again; the §4 one-hop rule then applies to those), so
  re-cutting buys a fresher binding, not a permanently closed gap.

Neither branch is recommended here. The choice is the operator's input in §5.

### 3.2 Does RECUT_FIRST require re-running G1/G2/G3? (cited, not guessed)

**Yes — by the records' own text, a re-cut voids the existing verdicts for the
new SHA and G1/G2/G5 (and the G3 verdict) must be re-derived:**

- **G1 (REV):** the verdict's binding statement — *"This verdict is valid only
  for that exact commit and tree. If the SHA under evaluation differs in even
  one character — any later main tip, **any re-cut successor baseline**, or any
  branch merely containing this commit as an ancestor — this verdict is void
  for your purpose and **G1 must be re-derived at your SHA**."*
  (`secb-gov-001-w2-g1-rev-verdict-001.md`, binding statement.)
- **G2 (QA):** identical discipline — evidence *"valid only for that exact
  commit and tree … void for your purpose and **must be re-derived at your
  SHA**."* (`secb-gov-001-w2-g2-qa-verdict-001.md`, two-tree discipline note.)
  The first readiness review's gap definition also requires QA *"on the same
  exact SHA"* (§7 item 2).
- **G5 (bound evidence):** same void-if-differs clause
  (`secb-gov-001-bound-evidence-001.md`, binding statement: *"Do not cite these
  totals against any other commit."*).
- **G3 (SEC):** the verdict is titled and issued *"bound to `c2ec645` / tree
  `3b7300f`"* (`secb-gov-001-w2-g3-sec-review-001.md` §5). It carries no
  explicit re-derivation sentence, but its verdict binding is to that commit
  alone, and the first review's gap text ties all completed-lane evidence to
  the single accepted SHA (§7 items 1–4). A re-cut therefore leaves the SEC
  verdict formally bound to the old baseline; honestly stated, whether a full
  SEC re-sweep or a delta-scoped SEC pass suffices at the new SHA is not
  settled by any ratified text and would itself be an operator scoping call.
- **What the per-PR reviews do NOT do:** nothing in the ratified records
  permits substituting the 15 individual PR verifications for whole-tree
  verdicts at a new baseline. The reviews' text requires binding to *one*
  exact SHA; per-PR evidence binds to 15 different merge SHAs. Under
  RECUT_FIRST, the per-PR trail is corroboration, not a substitute.

Conversely, under **WAIVE_DELTA** the existing G1/G2/G3/G5 records remain fully
valid *for `c2ec645`* — the waiver does not repair their scope; it is the
operator's explicit acceptance that `c2ec645`-bound evidence plus the
individually-ratified advance is a sufficient basis. That is exactly the trade
§3.1 states.

---

## 4. Decision options (neutral; no weighting, no default, no recommendation)

The operator's verdict selects exactly one of the following. They are listed in
the order the closure plan and G8 policy name the states — not in any order of
preference:

- **PROMOTE_TO_STABLE** — SECB-GOV-001 moves CANDIDATE→STABLE per the adopted G8
  lifecycle policy (pin `15a3b012`, EFFECTIVE via PR #122): promotion is a
  T-table operator/SEC-GOV transition with evidence + extend-only record +
  reversibility; **governed demotion/rollback (DEMOTED/QUARANTINED paths,
  revert-by-new-record, pin-to-last-accepted-baseline) is available from day
  one** under that same policy.
- **PROMOTE_CONDITIONAL** — promotion with operator-named conditions recorded in
  `conditions[]` (the operator defines each condition and its closure gate;
  nothing here proposes any).
- **HOLD** — status quo: SECB-GOV-001 and everything downstream remain
  candidate; the vehicle stays open; no state changes.
- **DENY** — promotion refused, with the operator's reason recorded; per the G8
  policy a known-bad disposition may additionally be recorded through the
  policy's own transitions.

### 4.1 Relationship to the SEPARATE P0-20 activation verdict

G9 promotes (or not) the **governance pack**. It does **NOT** activate the
platform. The P0-20 activation decision is a separate operator gate: its sealed
slot (`p0-20-governance-decision-packet-001.md` §6: `verdict: null`,
`agent_fill_is_a_violation: true`) and the operator HOLD
(`p0-20-operator-hold-disposition-001.md`, PR #78) are **independent and
untouched by this vehicle and by any G9 outcome**. Even PROMOTE_TO_STABLE here
authorizes zero activation, zero wiring, zero production claim.

---

## 5. THE SEALED G9 SLOT — EMPTY; OPERATOR INPUT ONLY

> **An agent (Claude, Codex, any LLM) filling any field below is a governance
> violation (V-020).** This slot is structurally identical in discipline to the
> P0-20 sealed slot (`p0-20-governance-decision-packet-001.md` §6): the builder
> of this vehicle left every decision field `null`/empty/false and holds no
> authority to do otherwise. Merging this vehicle does not, and cannot, fill it.

```yaml
g9_human_gov_decision:
  slot: G9_PROMOTION_DECISION
  subject: SECB-GOV-001 promotion (governance pack; NOT P0-20 activation)
  status: PENDING_HUMAN_GOV
  authority: HUMAN_GOV_REQUIRED
  evidence_baseline: c2ec6458b60ded0a93d74e717cd7816f55834f01   # accepted G4 baseline the B3–B6 evidence binds to
  vehicle_base: 3c439f787e9ff15ffe195d5675feb8a1d5621fbe        # main tip when this vehicle was built
  # --- operator/human-GOV fills the fields below; agents may not ---
  verdict: null                  # PROMOTE_TO_STABLE | PROMOTE_CONDITIONAL | HOLD | DENY (human GOV decides)
  baseline_disposition: null     # WAIVE_DELTA | RECUT_FIRST (§3.1; required alongside any verdict)
  conditions: []                 # operator-named conditions (PROMOTE_CONDITIONAL) or waiver/denial notes
  decided_by: null               # human GOV identity only — never an agent
  decided_at: null               # ISO8601, set by the human GOV at decision time
  effective: false               # effectiveness follows only from an operator-filled verdict per §6
  activation_authorized: false   # ALWAYS false in this slot; P0-20 activation is a different gate (§4.1)
  producer_may_fill: false
  codex_may_activate: false
  claude_may_activate: false
  agent_fill_is_a_violation: true
  note: >-
    Operator-only. This vehicle never fills this slot. A verdict appearing here
    without an operator act per §6 is void and a governance violation.
```

---

## 6. Filling paths (W3c precedent — either is valid; nothing else is)

1. **Direct:** the operator edits this record (own commit — IDE or web UI),
   populates §5, and merges that revision to main. The operator's merge is the
   decision act.
2. **Transcription:** the operator states the §5 values as explicit selections
   in the operator channel and orders the coordinating agent to transcribe them
   into a successor revision (`…-002.md`, superseding this vehicle by
   reference); the operator then orders that merge. Transcription of explicit
   operator decisions is permitted (precedents: the P0-20 HOLD disposition;
   `secb-gov-001-w3c-contract-signing-002.md`). **Agent invention of any value
   is not.**

Only on ratification of an operator-filled revision does G9 close — completing
the last of the ten readiness gaps. What follows any PROMOTE outcome (P0-20
seal, wiring, adoption) remains separately operator-gated and is out of this
vehicle's scope.

---

## 7. What this vehicle does NOT do

- Renders **no** verdict, recommends **no** option, weights **no** option,
  suggests **no** default, and pre-fills **nothing** (V-020).
- Closes **no** gap: G9 remains open until the operator acts per §6.
- Does **not** promote, activate, seal P0-20, declare production, or touch the
  operator HOLD.
- Does **not** edit the legacy `secb-gov-001-human-gov-decision-001.yaml`, the
  P0-20 packet, or any ratified record (extend-only throughout).
- Changes **zero** files under `src/`, `contracts/`, `tools/`, or `tests/`.

## 8. Advisory status fields

```yaml
truth_status: verified_true        # every basis SHA, verdict, pin, timestamp, and delta classification checked first-hand at 3c439f7
authority_status: advisory_only    # the decision this vehicle carries is OPERATOR_ONLY; the vehicle itself decides nothing
implementation_status: candidate   # decision surface awaiting operator fill per §6
risk_class: critical               # per the closure plan's G9 card — the slot content (not this scaffold) is the authority act
```

## 9. Self-certification

```yaml
self_certification:
  agent_id: claude-cortex-w4-vehicle-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Certified: this G9 decision vehicle is complete as an advisory work product —
> decision-basis table bound to exact on-main SHAs, post-baseline delta
> enumerated and classified first-hand, the waive-or-re-cut trade stated in both
> directions, and the §5 slot verified EMPTY. It carries no execution or
> approval authority; the verdict, the baseline disposition, and every
> consequence of both belong to the operator alone.
