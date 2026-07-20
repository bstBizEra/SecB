# Combined Gate Review: Gateway Successor Composition (GATE-001)

- review_id: MOD-MCP-GATE-REV-001
- status: CANDIDATE (advisory gate review; operator ratification and merge still required)
- reviewer: claude-immune-gate-combined-01 (BST-SA immune agent, independent identity)
- producers_reviewed: Claude motor (FU-1..3 closure + composition) + Codex (overflow-evidence port; Codex-side REV PASS)
- review_branch: `claude/rev/gateway-combined-gate` (created FROM `bst/gateway-combined-successor`)
- target: `bst/gateway-combined-successor` @ 646c9bf
- parents: merge of `bst/mcp-fu-closure-001` 0cce339 (FU closure lineage) × `producer/codex/mcp/p0a-main-reconciliation-001` 372dd11 (overflow-evidence port); base main 49d1e0c
- spec_of_record: docs/03-project-control/candidates/secb-mcp-p0-001-control-plane.md (SECB-MCP-P0-001, DRAFT / NOT EFFECTIVE)
- prior_context: mcp-p0a-independent-gate-review-002.yaml, mcp-p0a-gate-002-reverify-001.yaml, mod-mcp-completion-rev-001.md (raised FU-1/FU-2/FU-3, closed here), mcp-p0a-main-reconciliation-001-codex-producer-verification.handoff.yaml
- governance: AGENTS.md review rules; advisory-only, non-main branch, no push, no merge
- date: 2026-07-20

All findings below were reproduced first-hand in an isolated worktree against the
actual composed code at 646c9bf (dependencies installed via `npm ci`). No producer
measurement was taken on trust: the validator, the full suite, per-suite runs, the
39-test adversarial union, and five independent empirical probes (capacity wedge,
in-budget non-release, overflow-evidence backpressure, evidence-failure, secret
screens) were executed directly.

## Ancestry / lineage verification

| Claim | Method | Result |
| --- | --- | --- |
| 646c9bf is merge(0cce339, 372dd11) | `git rev-list --parents -n 1 646c9bf` | TRUE (both parents present) |
| FU parent 0cce339 folded | `git merge-base --is-ancestor 0cce339 646c9bf` | TRUE |
| Codex parent 372dd11 folded | `git merge-base --is-ancestor 372dd11 646c9bf` | TRUE |
| Base main 49d1e0c folded | `git merge-base --is-ancestor 49d1e0c 646c9bf` | TRUE |
| 646c9bf not yet on main | `git merge-base --is-ancestor 646c9bf main` | FALSE (operator merge pending — expected) |

## Measured numbers vs producer claims (first-hand, on 646c9bf)

| Metric | Producer claim | Measured (first-hand) | Match |
| --- | --- | --- | --- |
| Foundation validator | 516 checks, 0 fail, exit 0 | 516 PASS / 0 FAIL, exit 0 | YES |
| Full suite `node --test tests/*.test.mjs` | 340 / 335 pass / 0 fail / 5 skip | 340 / 335 / 0 / 5 (exit 0) | YES |
| Adversarial union | 39 titles | 39 tests, 39 pass, 0 fail | YES |
| Capability registry + broker suites | (SoD/broker coverage) | 42 / 42 / 0 / 0 | YES |

Note: a fresh worktree initially fails the whole suite with `ERR_MODULE_NOT_FOUND:
ajv` — this is an environment artifact (uninstalled deps), not a code defect. After
`npm ci` (6 packages) every number above matches exactly.

## Scope 1 — Capacity wedge (GATE2-BLOCKING-001) on the COMPOSED code

The git auto-merge silently deleted the abandonment bound in `#holdCapacity` (Codex's
port removed it); the composer RESTORED it (`audit_ms * 4` reclaim) and it now coexists
with the busy-flag overflow lane. Empirically re-run first-hand (max_concurrency 1,
never-settling adapter):

| # | Check | Method | Result | Severity |
| --- | --- | --- | --- | --- |
| 1a | First call times out and denies | probe: never-settling adapter, max_concurrency 1 | `DENY_ADAPTER_TIMEOUT_PENDING` | PASS |
| 1b | Slot held while pending immediately after timeout | overflow call right after | `DENY_CONCURRENCY_LIMIT` (slot correctly still exhausted) | PASS |
| 1c | Capacity drains past the abandonment bound | wait 120ms (> audit_ms*4 = 80ms), invoke again | fresh call reaches the adapter (`DENY_ADAPTER_TIMEOUT_PENDING`, NOT `DENY_CONCURRENCY_LIMIT`) — slot reclaimed | PASS |
| 1d | Drainage is repeatable (no eventual wedge) | 3 spaced hung cycles, each waiting past the bound | all 3 passed the capacity gate — never a permanent `DENY_CONCURRENCY_LIMIT` | PASS |
| 1e | Codex invariant: in-budget work NOT released early | hanging clock hook within a 10s budget; concurrent overflow at 120ms | overflow still `DENY_CONCURRENCY_LIMIT`; base later settles `ok=true`; slot frees only post-settlement | PASS |

Reasoning confirmed by code read (`src/gateway/mcp-gateway-core.mjs`): `#holdCapacity`
is only ever reached AFTER a timeout — from `#call` (only on `outcome.status ===
"timeout"`), `#scheduleAuditTimeout`, and `#scheduleLateSettlement` (both post-timeout
background lanes). The `audit_ms*4` abandon timer therefore never releases work still
inside its own budget. `#releaseCapacityIfComplete` requires `completed && pending.size
=== 0 && !released`, so the slot is never released before `invoke()` finishes, and each
of multiple pending settlements carries its own bound.

**Scope 1 verdict: PASS — GATE2-BLOCKING-001 remains closed on the composed code; Codex's non-early-release invariant holds.**

## Scope 2 — Bounded overflow-evidence design

`#denyConcurrencyAudited` was recomposed from Codex's design: `#overflowEvidenceBusy`
busy-flag, a single `boundedCall` evidence write bounded by `audit_ms`, and
`evidence_status` on every concurrency denial.

| # | Check | Method | Result | Severity |
| --- | --- | --- | --- | --- |
| 2a | Overflow denial carries honest evidence_status | probe over all four paths | ok-log → `EVIDENCE_CANDIDATE_RECORDED_NOT_ACCEPTED`; hung-log → `EVIDENCE_RECORDING_TIMEOUT_UNCONFIRMED`; busy → `EVIDENCE_NOT_RECORDED_BACKPRESSURE`; throw → `EVIDENCE_RECORDING_FAILED` | PASS |
| 2b | A hung logger cannot wedge the evidence lane | first overflow log hangs; issue more overflows | subsequent overflows return immediate `..._BACKPRESSURE`; caller always bounded by `audit_ms`; no queue growth | PASS |
| 2c | Lane recovers after the hung logger settles | release the hung logger, invoke again | busy clears; next overflow → `EVIDENCE_CANDIDATE_RECORDED_NOT_ACCEPTED` (lane live) | PASS |
| 2d | Evidence recording failure never grants capability | throwing logger on overflow | `ok=false`, `DENY_CONCURRENCY_LIMIT`, `EVIDENCE_RECORDING_FAILED` | PASS |
| 2e | No evidence_status ever implies acceptance/grant | inspection of all four return paths | every path returns `deny("DENY_CONCURRENCY_LIMIT", …)`; no status asserts recorded+accepted | PASS |

**Scope 2 verdict: PASS — bounded, non-wedging, fail-closed; evidence_status is honest and capability is never granted on the evidence path.**

## Scope 3 — FU fixes on the composed code

| # | FU / control | Method | Result | Severity |
| --- | --- | --- | --- | --- |
| 3a | FU-1 SoD pairwise-distinct promote | code read + registry suite | `{producer, independent, governance}` all three pairs gated: producer↔independent → `DENY_SELF_APPROVAL`; independent↔governance (one-actor-both-roles) AND producer↔governance → `DENY_SOD_VIOLATION` (capability-registry-service.mjs:209,217) | PASS |
| 3b | FU-2 secret screen underscore forms | probe: adapter output | `ghp_…`, `github_pat_…`, `sk_live_…` all → `DENY_RESULT_INVALID` (SECRET_VALUE uses `[-_]` separator) | PASS |
| 3c | FU-3 AKIA anywhere | probe: AKIA under innocuous field | `AKIAIOSFODNN7EXAMPLE` under `note` → `DENY_RESULT_INVALID` (value-level, field-independent) | PASS |
| 3d | FU-3 40-char AWS secret, field-gated | probe: aws-named vs innocuous field | 40-char under `aws_access_key` → denied; identical shape under `checksum` → allowed (`ok=true`) — field-gated heuristic, non-false-positive confirmed | PASS |
| 3e | Sealer-unforgeability note present | read credential-broker.mjs:22-29 | explicit "SEALER TRUST BOUNDARY … isSealedRef MUST be UNFORGEABLE … NOT a structural shape test … shape-only sealer is a deployment defect" | PASS |

**Scope 3 verdict: PASS — all three follow-ups from mod-mcp-completion-rev-001 (FU-1 MEDIUM, FU-2 MEDIUM, FU-3 LOW) are closed on the composed code, including the one-actor-both-roles SoD collapse and the AWS-secret non-false-positive tradeoff.**

## Scope 4 — Composition integrity

| # | Check | Method | Result | Severity |
| --- | --- | --- | --- | --- |
| 4a | Nothing lost from FU parent beyond documented replacement | `git diff` both directions on the 4 overlapping files | only intended change is `#overflowEvidenceTail` (shared promise tail) → `#overflowEvidenceBusy` busy-flag; FU secret screens + AWS field gate all present in composed gateway-core | PASS |
| 4b | Nothing lost from Codex parent | reverse `git diff` | Codex's bounded-evidence design fully present (busy-flag, boundedCall lane, evidence_status) | PASS |
| 4c | 39-test adversarial union intact | `comm` of test titles: each parent vs composed | zero titles from FU (38) or Codex (33) missing from composed (39) — full union | PASS |
| 4d | Restored abandonment tests present | read tests | both "a hung adapter's capacity reservation is abandoned on a bound" and "a hung hook does not permanently wedge the shared overflow-audit lane" present and passing | PASS |
| 4e | MANIFEST union correct | `comm` of MANIFEST paths: each parent vs composed | zero entries from either parent missing; 12-schema set intact (capability-record.schema.json present) | PASS |
| 4f | Validator exit 0 | `node tools/validate-foundation.mjs` | 516 PASS / 0 FAIL, exit 0 | PASS |
| 4g | Full suite | `node --test tests/*.test.mjs` | 340 / 335 / 0 / 5 | PASS |

**Scope 4 verdict: PASS — the composition is a faithful union of both parents; the only deviation is the documented, intended busy-flag replacement.**

## Scope 5 — New defects introduced by the composition itself

| # | Hypothesis | Method | Result |
| --- | --- | --- | --- |
| 5a | Double-release of a capacity slot (abandon timer + settlement finally) | code read | `#releaseCapacityIfComplete` guards with `!released` and sets `released=true`; `#capacityInUse` decremented at most once per reservation; abandon timer is `clearTimeout`-ed on settlement — no double-release |
| 5b | Abandonment reclaim interacts with the busy-flag lane | code read | overflow lane (`#denyConcurrencyAudited`) uses `boundedCall` directly, creates NO execution-counting reservation, and never touches `#capacityInUse`; the two mechanisms share no state — fully independent |
| 5c | Busy-flag TOCTOU race between concurrent overflow calls | code read | the `if (busy) return; busy = true;` check-and-set is fully synchronous before the first `await`; single-threaded JS gives no interleaving window — no race |
| 5d | evidence_status lies under combined stress (hung base adapter + hung/failing logger) | probe 2a–2e under a held slot | every status matched the actual logger outcome; none over-claimed; capability denied on every path |
| 5e | Busy-flag permanently stuck (truly-never-settling logger) | code read + probe 2b | busy stays true, but all future overflows return honest `..._BACKPRESSURE` and still DENY; capacity drains independently via the abandonment bound — degradation is honest and fail-closed, not a capability wedge |

**Scope 5 verdict: NO new defects. The abandonment reclaim and the busy-flag evidence lane are provably independent; no double-release; the busy-flag guard is race-free; evidence_status is honest under combined stress.**

## Gate verdict

**GATE_CLOSED_READY_FOR_OPERATOR_MERGE**

All five gate scopes pass first-hand. GATE2-BLOCKING-001 is closed on the composed code
(capacity drains past the restored `audit_ms*4` bound, repeatably) while Codex's
non-early-release invariant holds. The bounded overflow-evidence lane is non-wedging and
fail-closed with honest evidence_status. All three prior follow-ups (FU-1/FU-2/FU-3) are
closed. The composition is a faithful union of both parents (39-test adversarial union,
MANIFEST union, 12-schema set all intact) whose only deviation is the documented
busy-flag replacement, and no new defect is introduced by the composition itself.
Measured oracle matches every producer claim exactly (validator 516/0 exit 0; suite
340/335/0/5). No blocking items.

## Advisory status fields

- truth_status: verified_true (every producer numeric and behavioral claim reproduced first-hand; no unverified claim relied upon)
- authority_status: advisory_only
- implementation_status: existing (composed successor delivered; FU-1..3 closed; overflow-evidence design retained)
- risk_class: medium (MCP permission surface and concurrency/evidence lifecycle; no blocking defect, honest fail-closed degradation modes)

## Authority boundary

This is an advisory gate review only. Operator ratification and the operator-controlled
merge of `bst/gateway-combined-successor` into `main` remain required and were not
performed. No push, no merge, no configuration change was made by this reviewer. The
review record is committed on the non-main branch `claude/rev/gateway-combined-gate`.

```yaml
self_certification:
  agent_id: claude-immune-gate-combined-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
