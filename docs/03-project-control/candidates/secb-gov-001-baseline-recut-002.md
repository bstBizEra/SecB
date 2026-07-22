# SECB-GOV-001 Baseline Re-Cut Proposal 002 (G4, Phase-A step A2)

| Field | Value |
|---|---|
| Artifact | `secb-gov-001-baseline-recut-002` |
| Author | `claude-motor-a2-recut-01` (BST-SA Motor, advisory) |
| Supersedes (by reference) | `secb-gov-001-baseline-recut-001.md` (proposed baseline `c2ec6458…`) — extend-only; the -001 record is NOT edited or deleted |
| Dispatch | Operator-ordered **Phase-A step A2 RE-CUT** (2026-07-22), executed under the G4 record's own re-cut-or-waiver rule (recut-001 §4) after main advanced past `c2ec645` |
| Gap addressed | **G4** — "Single, consistent, on-main baseline SHA" (first readiness review §7 item 4; closure plan §2 G4 card) |
| Proposed NEW baseline | main @ `3c439f787e9ff15ffe195d5675feb8a1d5621fbe` |
| Tree hash | `39d006117c853ff0625f80a5d5d431c6b49bf1b8` (`git rev-parse 3c439f7^{tree}`) |
| Timestamp (UTC) | 2026-07-22T10:48:19Z |
| Scope | PROPOSAL of a single promotion-baseline SHA (re-bound to the current tip). NOT an acceptance, NOT a closure of G4, NOT a promotion, NOT an activation, NOT a P0-20 seal. |
| Authority | Advisory only. G4 is a MIXED gap: the agent drafts the re-cut; **the choice/acceptance of the baseline SHA is an operator decision** (plan §2 G4 executor). |

> **Authority boundary of THIS record.** This record proposes one exact, on-main
> commit as the single SECB-GOV-001 promotion baseline, superseding the -001
> proposal (`c2ec6458…`) **by reference** because the operator ordered a re-cut
> at the current tip. It closes nothing by itself: G4 closes only when the
> operator accepts this SHA (see §4 acceptance semantics). No promotion, no
> effectiveness declaration, no activation, no merge, no push is performed or
> authorized. The P0-20 operator HOLD (PR #78) and the sealed human-GOV decision
> slot (`verdict: null`, `status: PENDING_HUMAN_GOV`, `producer_may_fill: false`)
> are untouched (re-verified at the tip — see §6).

---

## 1. The proposed single baseline (re-bound to the tip)

- **Commit (full):** `3c439f787e9ff15ffe195d5675feb8a1d5621fbe`
- **Tree hash:** `39d006117c853ff0625f80a5d5d431c6b49bf1b8` (verified first-hand: `git rev-parse 3c439f7^{tree}`)
- **Identity:** the merge commit of PR #129 (`bst/schema-align-project-contract`) — the schema-alignment reconciliation that carries `contracts/project-contract.schema.json` forward to the Option-A rich shape signed NORMATIVE at G7 (#124).
- **On-main check:** `3c439f7` **is** `origin/main`'s tip at execution time (`git fetch origin; git rev-parse origin/main` → `3c439f787e9ff15ffe195d5675feb8a1d5621fbe`, byte-identical). It is on main by construction — not an ancestor claim, the tip itself. (Expected tip per the A2 order was `3c439f78…`; the actual tip matched, no further advance observed.)
- **One SHA, everywhere:** this record, and the companion G5 bound-evidence record (`secb-gov-001-bound-evidence-002.md`), bind to this commit and no other. It supersedes the `c2ec645` binding of the -001 records **by reference** (extend-only); the -001 records remain valid history for their own SHA and are not rewritten.

## 2. The delta this re-cut absorbs (`c2ec645 → 3c439f7`)

`git log c2ec6458b60ded0a93d74e717cd7816f55834f01..3c439f787e9ff15ffe195d5675feb8a1d5621fbe --oneline` — **37 commits** in the range across **15 pull-request merges (#115–#129)** (plus 6 branch-sync merge commits = 21 merge commits total). Classified per-PR, verified first-hand with `git diff --stat <merge>^1 <merge>`:

| PR | Merge | Payload | Class |
|---|---|---|---|
| #115 | `5223db9` | W1a: G4 baseline re-cut (recut-001) + G5 bound evidence (this workstream's own -001 records) | docs-only |
| #116 | `d75a9bf` | W1b: G8 STABLE/demotion/rollback policy candidate | docs-only |
| #117 | `d790fb6` | W2-G2: independent QA verdict | docs-only |
| #118 | `1c4e5c7` | W2-G1: independent REV verdict | docs-only |
| #119 | `3add7cb` | W2-G3: independent SEC review | docs-only |
| #120 | `eee1bed` | W1c: G7 Project Contract draft refresh | docs-only |
| #121 | `bf2b20d` | W3a: G6 evidence-acceptance record | docs-only |
| #122 | `e920474` | W3b: G8 policy-adoption record | docs-only |
| #123 | `8161531` | W3c: G7 signing scaffold | docs-only |
| #124 | `3177bc5` | W3c: G7 signing values transcribed | docs-only |
| #125 | `b93cd7d` | **fast-uri 3.1.3 → 3.1.4** (GHSA-v2hh-gcrm-f6hx) | **lockfile** (`package-lock.json` 6 lines + 1 tracker line; `package.json` untouched) |
| #126 | `6f6a5ea` | Closure-report addendum 001 (F-3 binding hygiene errata) | docs-only |
| #127 | `adc6cf0` | Skills Pack v0.1 at `.agents/` (22 skills / 163 files, M0 CANDIDATE) | docs-only (candidate artifacts under `.agents/`; not runtime `src/`/`contracts/`/`tools/`/`tests/`) |
| #128 | `05d91be` | Root `AGENTS.md` skills-registry amendment | docs-only |
| #129 | `3c439f7` | **Schema-align project-contract** (the tip) | **src-adjacent** |

**Delta summary: 13 docs-only PRs, 1 lockfile PR (#125), 1 src-adjacent PR (#129).**

**The one src-adjacent merge — #129 (`git diff --stat 3c439f7^1 3c439f7`):**

- `contracts/project-contract.schema.json` — **+606 lines** (strict superset: validates both the narrow runtime shape and the rich v2-r2/v2-r3 governance shape; `additionalProperties:false` preserved at every level, `oneOf` keeps shapes disjoint; `schemas.count` stays 20).
- Its tests, added in the same merge: `tests/project-contract-schema-alignment.test.mjs` (+74), `tests/approval-binding.test.mjs` (+14), `tests/integration-queue-ledger.test.mjs`, `tests/workspace-lease-ledger.test.mjs` (byte-identity guards adjusted so the aligned file is excluded per their own patterns — no assertion dropped), and 4 fixtures (`tests/fixtures/{valid,invalid}/project-contract-rich*.json`).
- Plus `MANIFEST.json` and 3 docs (schema-alignment cross-review, producer-verification, tracker line).

This is the only merge in the delta that touches `contracts/` or `tests/`; both are the schema-alignment work package (one coherent change with its own tests), independently reviewed at PR #129. The lockfile hop (#125) is the fast-uri remediation of the sole accepted HIGH from the W2-G3 SEC review. The other 13 PRs add only governance records / candidate artifacts.

## 3. What the tree at `3c439f7` contains (governance-level enumeration)

Enumerated first-hand from the detached checkout of the proposed baseline:

| Item | State at `3c439f7` |
|---|---|
| Contract schemas | **20** `*.schema.json` files in `contracts/` (validator check `schemas.count`: PASS — "7 canonical bootstrap schemas + 13 governed extensions"); the project-contract schema is the Option-A rich-shape superset (#129) |
| Test suite | **1331 tests / 1328 pass / 0 fail / 3 skipped**, exit 0 (first-hand, run twice; full detail in the G5 record `secb-gov-001-bound-evidence-002.md`) |
| Foundation validator | `node tools/validate-foundation.mjs` → status **PASS**, **898 checks / 0 non-PASS**, exit 0 (validator version `0.3.0-alpha.0`) |
| Production audit | official-registry `npm audit --omit=dev` → **0 vulnerabilities** (post-#125 fast-uri bump) |
| G8 rollback policy | W1b candidate present (#116); adopted-effective per W3b (#122) at its version pin |
| G7 project contract | v2-r3 draft (#120) signed per W3c-002 (#124); the schema-align (#129) reconciles `contracts/project-contract.schema.json` to the signed Option-A rich shape |
| Skills Pack v0.1 | `.agents/` pack present (#127), CANDIDATE / NOT EFFECTIVE / M0; registered in `AGENTS.md` (#128) |
| Closure report + addendum | `p0-closure-report-001.md` + `…-addendum-001.md` (#126) present |
| W2 verdict set | G1 APPROVE_WITH_NOTES (#118), G2 QA_PASS_WITH_NOTES (#117), G3 SEC_PASS_WITH_NOTES (#119) — all bound to `c2ec645` (see §5 carriage statement) |
| P0-20 records | Decision packet, cross-review, and operator HOLD present; sealed human-GOV slot verified still `verdict: null` / `PENDING_HUMAN_GOV` / `producer_may_fill: false` / `agent_fill_is_a_violation: true` (§6) |

## 4. Acceptance semantics (unchanged from recut-001 — G4 is operator-closed)

> **The operator's ratification of this record on main constitutes G4 acceptance
> of `3c439f787e9ff15ffe195d5675feb8a1d5621fbe` as the single baseline; any
> subsequent main advance requires either a re-cut or an explicit operator
> waiver.**

Concretely (mirrors recut-001 §4):

- The operator's merge of the staging PR carrying this record **is** the acceptance act — no separate signature artifact is required for G4, and no agent statement can substitute for it.
- Until that merge, the baseline is **proposed**, and G4 remains **open**.
- If main advances past `3c439f7` before the operator accepts, the operator either (a) orders a re-cut at the new tip, or (b) records an explicit waiver accepting `3c439f7` despite the advance. Silence is not a waiver.
- **Honesty note on the self-advance:** merging this record's own staging PR necessarily moves main one merge past `3c439f7`. That is the known, bounded, docs-only delta this process itself creates; the operator's merge-as-acceptance therefore inherently carries a one-hop waiver for the staging merge itself. Any *other* interleaved advance (unrelated PRs landing first) is NOT covered and triggers the re-cut-or-waiver rule above. **A parallel W4-vehicle producer also appends to the tracker/MANIFEST for the G9 decision-vehicle; if its merge lands first, that is exactly the "other interleaved advance" case — the operator resolves it at G9 acceptance, not this record.**

## 5. W2-verdict carriage statement (G1/G2/G3 at the new SHA)

**Question:** at the re-cut baseline `3c439f7`, do the W2 independent verdicts (G1 REV, G2 QA, G3 SEC) — all run at `c2ec645` — still hold, or must they be re-derived?

**What the sources literally say (verdicts' own binding clauses):**

- **G1 (`secb-gov-001-w2-g1-rev-verdict-001.md`):** "If the SHA under evaluation differs in even one character — any later main tip, any re-cut successor baseline, or any branch merely *containing* this commit as an ancestor — **this verdict is void for your purpose** and G1 must be re-derived at your SHA."
- **G2 (`secb-gov-001-w2-g2-qa-verdict-001.md`):** "If the SHA you are evaluating differs from [`c2ec645`] … or any branch that merely contains `c2ec645` as an ancestor — this evidence is **void for your purpose** and must be re-derived at your SHA."
- **G3 (`secb-gov-001-w2-g3-sec-review-001.md`):** RUN-bound to `c2ec645` / tree `3b7300f`; verdict `SEC_PASS_WITH_NOTES`. Its own header restricts the run binding to that exact commit and tree.

By the verdicts' **own literal text**, `3c439f7` is a "later main tip" that differs from `c2ec645`, so all three W2 verdicts are **self-declared void at this SHA** and, on a strict reading, must be re-derived here by distinct executors (SoD: producer ≠ REV ≠ QA ≠ SEC). This motor agent re-derives only the **executable acceptance evidence** at the new SHA (G5-002); it does **not** re-run the independent G1/G2/G3 lanes — a single motor agent cannot satisfy their SoD, and lane dispatch is an operator act.

**The one genuinely open (unresolved-by-sources) question — presented as an operator G9 judgment, not resolved here:**

- **Reading A (strict re-run):** the verdicts' text controls → G1/G2/G3 are void at `3c439f7` and require fresh independent lane re-derivation at this SHA before any weight-bearing use.
- **Reading B (incremental carriage):** the `c2ec645` verdicts established readiness posture, and **every delta merge (#116–#129) received its own per-PR independent review** (e.g. schema-alignment cross-review + producer-verification for #129; the W2/W3 records were themselves the reviewed payloads); the executable acceptance evidence re-derived at `3c439f7` (G5-002) agrees with the `c2ec645` numbers up to the disclosed monotonic growth (suite 1325→1331, validator 859→898, audit 1-high→0). Under this reading the delta is covered incrementally and a full W2 re-run is not required.

The verdicts' clauses support Reading A on their face. Whether the per-PR independent reviews of the delta **substitute** for a full W2 re-run is a governance judgment the verdicts themselves do **not** address — it belongs to the operator's **G9 acceptance**, and is **not** resolved by this agent. This record surfaces both readings and the choice; it takes neither.

## 6. Sealed-slot re-verify at the tip

Re-verified first-hand at `3c439f7` (these files were not in the `c2ec645 → 3c439f7` delta — unchanged since before the -001 baseline):

- **`secb-gov-001-human-gov-decision-001.yaml`** — `status: PENDING_HUMAN_GOV`, `authority.producer_may_fill: false`, `authority.human_gov_required: true`, `authority.approval_authority: false`.
- **`p0-20-governance-decision-packet-001.md` §6** — quoted verbatim: `status: PENDING_HUMAN_GOV`, `verdict: null`, `decided_by: null`, `effective: false`, `activation_authorized: false`, `producer_may_fill: false`, `codex_may_activate: false`, `claude_may_activate: false`, `agent_fill_is_a_violation: true`.
- **`p0-20-operator-hold-disposition-001.md`** — HOLD direction in force; the packet slot "remains `verdict: null` / `decided_by: null` / `status: PENDING_HUMAN_GOV` by design."

No field was filled, and none is fillable by this agent. V-020 unchanged.

## 7. What this record does NOT do

- Does **not** close G4 (closure = the operator acceptance defined in §4).
- Does **not** rewrite or delete the -001 records or the legacy packet — extend-only: this record **supersedes the `c2ec645` binding by reference** without altering the -001 records.
- Does **not** resolve the W2 carriage question (§5) — that is an operator G9 judgment.
- Does **not** claim readiness: G6/G7/G8 acceptance/adoption/signing are operator acts (some drafted in W3); G9 remains open.
- Does **not** touch the P0-20 decision packet, the operator HOLD, or the sealed human-GOV slot; does **not** pre-fill any decision field (V-020).
- Changes **zero** files under `src/`, `contracts/`, `tools/`, or `tests/`.

## 8. Advisory status fields

```yaml
truth_status: verified_true        # SHA/tree/tip identity, delta classification, tree enumeration, and sealed-slot state all checked first-hand at 3c439f7
authority_status: advisory_only    # baseline acceptance is an operator act; this record only proposes the re-cut the operator ordered
implementation_status: candidate   # proposed re-cut baseline awaiting operator acceptance via staging-PR ratification
risk_class: medium                 # per the plan's G4 card; docs-only record, but it feeds the promotion decision's binding
```

## 9. Self-certification

```yaml
self_certification:
  agent_id: claude-motor-a2-recut-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Certified: this G4 re-cut-002 proposal is complete as an advisory work product,
> source-bound to the operator's A2 RE-CUT order, the closure plan's G4 card, both
> readiness reviews, and the three W2 verdicts (for the §5 carriage statement),
> with the tip-identity, delta classification, tree enumeration, and sealed-slot
> checks executed first-hand at
> `3c439f787e9ff15ffe195d5675feb8a1d5621fbe`. It carries no execution or approval
> authority; G4 closure is the operator's acceptance act alone, and the W2 carriage
> choice is the operator's G9 judgment.
