# WP-MEM Stream — Integration Map

## Document Control

| Field | Value |
|---|---|
| Artifact ID | SECB-ADV-WPMEM-MAP-001 |
| Version | 1.0.0-draft |
| Status | DRAFT / NOT EFFECTIVE — advisory only, no authority conferred |
| Date | 2026-08-08 |
| Author | Claude (Motor Agent), read-only survey |
| Subject | The 13 `codex/wp-mem-*` branches and what integrating them would mean |

**Recommendation: do not integrate.** The stream is in flight, its last recorded
aggregate verdict is `HOLD_RETURN_FOR_REWORK`, and its tip has no verdict at all.
Nothing in this survey modified any branch.

---

## 1. Thirteen branches are three tips, and only one carries code

Ancestry, not naming, decides this. Ten of the thirteen are already contained in
`codex/wp-mem-j1-runtime-wiring-001`, so integrating that one integrates them.

| Tip | Ahead of main | Carries |
|---|---|---|
| `codex/wp-mem-j1-runtime-wiring-001` | 104 | the implementation |
| `codex/wp-mem-479a-review-packet-001` | 77 | 5 review records, **0 code files** |
| `codex/wp-mem-admission-snapshot-review-packet-001` | 76 | 1 review request, **0 code files** |

What the implementation tip touches, by area: 29 `tests/`, 14 `src/services/`,
5 `src/ledger/`, 2 `src/memory/`, 16 governance candidates, 1 `tools/`.

So the operator's question is not "which of thirteen" — it is one implementation
branch plus two evidence branches that hold its review trail.

---

## 2. The last recorded verdict is a HOLD

`WP-MEM-479A-REVIEW-GATE-RESULT-001`, on the review-packet branch:

| Role | Verdict |
|---|---|
| QA (`codex-qa-mem-479a-001`) | `QA_PASS` — no blocker in the executed suites |
| SEC (`codex-sec-mem-479a-001`) | `SEC_PASS_WITH_RESIDUALS` — residual controls unaccepted |
| REV | **BLOCKING**, severity `HIGH` |
| **Aggregate** | **`HOLD_RETURN_FOR_REWORK`** |

The REV finding is a mechanism failure, not a coverage gap: a caller-owned
mutable object reached past the admission gate in
`src/services/memory-gateway-service.mjs` (cited at `:94`, `:480-486`,
`:511-516`, `:551-557`), so an actor could be substituted **after** the producer
gate — violating canonical identity, fail-closed and separation-of-duties
invariants at once. The record's own words are worth keeping:

> Green suites do not cure this direct mechanism failure.

It also names the reason the suites stayed green: a false-negative test gap in
the admission probes.

---

## 3. The blocker was reworked — and the rework has no verdict

`96973da` *fix(memory): snapshot admission input before gates* addresses exactly
that finding, and is contained in the implementation tip. It is the
atomic-snapshot shape: one `Reflect.ownKeys` pass, accessors / symbols / custom
prototypes rejected, a detached null-prototype graph built before any identity,
scope, hash, audit or persistence decision.

That is the right fix. It is not a cleared gate. What exists for it is a review
**request** (`wp-mem-96973da-independent-review-request-001.md`), not a verdict.

Eight further branches of rework followed the reviewed SHA — head-anchor
provider contract, lease-token rework 004, post-fence rework 003, shared-fence
rework 002, lifecycle anchor recovery, runtime pr136 compose, runtime reconcile.

---

## 4. The tip has seven review requests and zero verdicts

At `codex/wp-mem-j1-runtime-wiring-001`:

```text
wp-mem-j1-runtime-wiring-reconcile-review-request-002.md    no verdict
wp-mem-j1-runtime-wiring-rework-review-request-003.md       no verdict
wp-mem-j1-runtime-wiring-rework-review-request-004.md       no verdict
wp-mem-j1-runtime-wiring-rework-review-request-005.md       no verdict
wp-mem-j1-runtime-wiring-rework-review-request-006.md       no verdict
wp-mem-j1-runtime-wiring-final-review-request-007.md        no verdict
mod-evid-s2-s3-rehydration-guard-parity-fix-…-001.md        no verdict
```

Seven requests and no answers is not a stalled queue — it is a review cycle
still running.

---

## 5. The stream is live, and it is already tracking main

The tip was committed **61 minutes before this survey**, and one of its commits
is `33d0d1f merge: reconcile Memory runtime with main f9d4640` — the lane pulled
the guard-anchor fixes pushed earlier today. The producing lane is active and
reconciling forward on its own.

That is the strongest argument against integrating from this side. Merging a
branch whose owner is mid-rework, mid-review, and already tracking main would
take the decision away from the lane holding the context, and would land an
implementation whose one recorded aggregate verdict is HOLD.

---

## 6. What would make this decidable

1. A verdict — any verdict — bound to the tip SHA `c8443e9`. Six of the seven
   requests are for earlier SHAs; the seventh is the current ask.
2. A statement of whether the 479a REV blocker is considered discharged by
   `96973da`, from the REV lane rather than inferred from the diff as this
   document does.
3. Disposition of SEC's residual controls, which passed *with residuals* and
   were never accepted.

Until at least (1) and (2), integration has no evidence to stand on.

---

## 7. Status fields

```yaml
truth_status: verified_true      # ancestry, file counts, verdict text and
                                 # timestamps read directly from the refs
authority_status: advisory_only
implementation_status: blocked   # by the producing lane's own review cycle
risk_class: high                 # a HIGH/BLOCKING REV finding on an
                                 # authority-bearing admission path
```
