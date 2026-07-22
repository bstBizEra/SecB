# SECB-GOV-001 Baseline Re-Cut Proposal (G4, Wave 1a)

| Field | Value |
|---|---|
| Artifact | `secb-gov-001-baseline-recut-001` |
| Author | `claude-motor-w1a-baseline-01` (BST-SA Motor, advisory) |
| Dispatch | Operator dispatch of **Wave 1a (W1a)** of the ratified closure plan `secb-gov-001-readiness-closure-plan-001.md` (merged PR #114) — plan §3 decision point A / §5 recommended first dispatch item 1 |
| Gap addressed | **G4** — "Single, consistent, on-main baseline SHA" (first readiness review §7 item 4; closure plan §2 G4 card) |
| Proposed baseline | main @ `c2ec6458b60ded0a93d74e717cd7816f55834f01` |
| Tree hash | `3b7300f1b7cd378d373cf8e2da10dc459bb8f63b` (`git rev-parse c2ec645^{tree}`) |
| Timestamp (UTC) | 2026-07-22T04:06:54Z |
| Scope | PROPOSAL of a single promotion-baseline SHA. NOT an acceptance, NOT a closure of G4, NOT a promotion, NOT an activation, NOT a P0-20 seal. |
| Authority | Advisory only. G4 is a MIXED gap: the agent drafts the re-cut; **the choice/acceptance of the baseline SHA is an operator decision** (plan §2 G4 executor). |

> **Authority boundary of THIS record.** This record proposes one exact, on-main
> commit as the single SECB-GOV-001 promotion baseline. It closes nothing by
> itself: G4 closes only when the operator accepts this SHA (see §4 acceptance
> semantics). No promotion, no effectiveness declaration, no activation, no
> merge, no push is performed or authorized. The P0-20 operator HOLD (PR #78)
> and the sealed human-GOV decision slot (`verdict`-empty,
> `status: PENDING_HUMAN_GOV`, `producer_may_fill: false`) are untouched.

---

## 1. The proposed single baseline

- **Commit (full):** `c2ec6458b60ded0a93d74e717cd7816f55834f01`
- **Tree hash:** `3b7300f1b7cd378d373cf8e2da10dc459bb8f63b` (verified first-hand: `git rev-parse c2ec645^{tree}`)
- **Identity:** the merge commit of PR #114 (`bst/readiness-closure-plan`) — i.e. the commit that landed the ratified closure plan this dispatch executes.
- **On-main check:** `c2ec645` **is** `origin/main`'s tip at execution time (`git fetch origin main; git rev-parse FETCH_HEAD` → `c2ec6458b60ded0a93d74e717cd7816f55834f01`, byte-identical). It is on main by construction — not an ancestor claim, the tip itself.
- **One SHA, everywhere:** this record, and the companion G5 bound-evidence record (`secb-gov-001-bound-evidence-001.md`), bind to this commit and no other. All future refresh-003-series packet records must bind to the operator-accepted SHA (this one, or its re-cut successor) — never to a second SHA.

## 2. What the tree at `c2ec645` contains (governance-level enumeration)

Enumerated first-hand from a detached checkout of the proposed baseline:

| Item | State at `c2ec645` |
|---|---|
| Contract schemas | **20** `*.schema.json` files in `contracts/` (validator check `schemas.count`: PASS — "7 canonical bootstrap schemas + 13 governed extensions") |
| Test suite | **65** test files in `tests/`; **1325 tests / 1322 pass / 0 fail / 3 skipped**, exit 0 (first-hand run; full detail in the G5 record) |
| Foundation validator | `node tools/validate-foundation.mjs` → status **PASS**, **859 checks / 0 non-PASS**, exit 0 (validator version `0.3.0-alpha.0`) |
| Module verdict set | **16** module-completion review records covering **14 modules** with FINISHED-class verdicts (MOD-A2A, MOD-CONTEXT, MOD-EVID, MOD-GOV, MOD-INTEG, MOD-KNOW, MOD-LIVE, MOD-MCP, MOD-MEM, MOD-OPS, MOD-RUNTIME ×2 records, MOD-SKILL, MOD-WORK, MOD-WSPACE rev-001+rev-002) — 14 of them `FINISHED_WITH_TRACKED_FOLLOWUPS`, MOD-WSPACE `FINISHED` — plus **MOD-REG** disposed via signed `APPROVE_NOT_EFFECTIVE` (`mod-reg-gov-disposition.yaml`): **15 modules with completion verdicts**; MOD-UI remains OPEN in the other lane (per `p0-closure-report-001.md`) |
| Phase-0 closure report | `p0-closure-report-001.md` present (recorded @ `2a22e52`, on this tree) |
| The closure plan itself | `secb-gov-001-readiness-closure-plan-001.md` present — PR #114's payload; `c2ec645` **is** its merge commit |
| Legacy promotion packet | The six-record packet (queue-001, readiness-001, refresh-002, review-request-001, review-refresh-002, human-gov-decision-001) present, still carrying its historical five-SHA bindings (see §3) |
| Readiness reviews | Both NOT_READY reviews present (`secb-gov-001-promotion-readiness-rev-001.md`, `secb-gov-001-second-independent-readiness-review-001.md`) |
| P0-20 records | Decision packet, cross-review, and operator HOLD disposition present; sealed human-GOV slot verified still `PENDING_HUMAN_GOV`, `producer_may_fill: false` |

## 3. Why the prior evidence failed (the staleness lesson this re-cut answers)

Recorded so the re-cut closes the actual complaint, not a paraphrase of it:

1. **Five conflicting SHAs across six records.** The staged packet's six records bound to five different baselines — `1fb7ba9`, `4fef2f1`, `c4a5f36`, `e3de3eb`, `e220002` — violating the packet's own `exact_sha_only` requirement (first review §3/§6; independently re-confirmed by the second review §2 item 4 via `git merge-base --is-ancestor`).
2. **Four of the five were off-main.** Only `4fef2f1` was an ancestor of main; the rest were producer-branch SHAs on `producer/codex/mcp/p0a-gateway-core-rework-011`, **141 commits behind main** at first review time. A promotion decision on those records would have bound SECB-GOV-001 to stale, off-main state.
3. **Test evidence was an unbound producer self-report.** The cited `npm_test` 559/554/0/5 reflected the producer tree, was never independently reproduced, and drifted ~2x behind main's real suite (second review reproduced 1081 tests at `f78c4fb`; main now runs 1325).

**The corrective rule embodied here:** ONE SHA, on main, tip-fresh at cut time, with every number in the evidence record bound to exactly that SHA (the G5 record enforces the binding side).

## 4. Acceptance semantics (G4 is operator-closed, not agent-closed)

> **The operator's ratification of this record on main constitutes G4 acceptance
> of this SHA as the single baseline; any subsequent main advance requires
> either a re-cut or an explicit operator waiver.**

Concretely:

- The operator's merge of the staging PR carrying this record **is** the acceptance act — no separate signature artifact is required for G4, and no agent statement can substitute for it.
- Until that merge, the baseline is **proposed**, and G4 remains **open**.
- If main advances past `c2ec645` before the operator accepts (including by the very merge of this staging PR — see honesty note below), the operator either (a) orders a re-cut at the new tip, or (b) records an explicit waiver accepting `c2ec645` despite the advance. Silence is not a waiver.
- **Honesty note on the self-advance:** merging this record's own staging PR necessarily moves main one merge past `c2ec645`. That is the known, bounded, docs-only delta this process itself creates; the operator's merge-as-acceptance therefore inherently carries a one-hop waiver for the staging merge itself. Any *other* interleaved advance (unrelated PRs landing first) is NOT covered and triggers the re-cut-or-waiver rule above.

## 5. What this record does NOT do

- Does **not** close G4 (closure = the operator acceptance defined in §4).
- Does **not** rewrite or delete the legacy six-record packet — extend-only: the refresh-003-series records (this record, the G5 evidence record, and any successors) **supersede** the 002-series bindings without altering them.
- Does **not** claim readiness: G1/G2/G3 (independent REV/QA/SEC verdict lanes, Wave 2), G6, G7, G8, and G9 remain open exactly as the closure plan left them.
- Does **not** touch the P0-20 decision packet, the operator HOLD, or the sealed human-GOV slot; does **not** pre-fill any decision field (V-020).
- Changes **zero** files under `src/`, `contracts/`, `tools/`, or `tests/`.

## 6. Advisory status fields

```yaml
truth_status: verified_true        # SHA/tree/tip identity, tree enumeration, and staleness history all checked first-hand at c2ec645
authority_status: advisory_only    # baseline acceptance is an operator act; this record only proposes
implementation_status: candidate   # proposed baseline awaiting operator acceptance via staging-PR ratification
risk_class: medium                 # per the plan's G4 card; docs-only record, but it feeds the promotion decision's binding
```

## 7. Self-certification

```yaml
self_certification:
  agent_id: claude-motor-w1a-baseline-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Certified: this G4 re-cut proposal is complete as an advisory work product,
> source-bound to the closure plan's G4 card and both readiness reviews, with
> the tree enumeration and tip-identity checks executed first-hand at
> `c2ec6458b60ded0a93d74e717cd7816f55834f01`. It carries no execution or
> approval authority; G4 closure is the operator's acceptance act alone.
