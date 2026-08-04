# Freshness confirmation for the eight stale pull requests

**Document ID:** `SECB-ASSURANCE-REV-FRESHNESS-001`
**Work package:** `WP-REV-TRACEABILITY-001`, step 2
**Status:** `EVIDENCE RECORD — read-only, produced by running`
**Produced by:** Claude Code (worker agent), acting as producer
**Date:** 2026-08-04
**Predecessor:** `SECB-ASSURANCE-REV-TRACEABILITY-001`
**Mutation:** none. No branch, pull request, or record outside this document was changed.

## The question

`SECB-ASSURANCE-REV-TRACEABILITY-001` established that independent verdicts
exist for nine of ten open pull requests, and that nine of ten are stale because
the head moved after the verdict.

Opening a fresh review round for each would be the expensive answer. The cheaper
and more accurate one is: **does the branch still propose the same change to
`main`?** A branch moves every time `main` is folded into it, and almost none of
that movement alters what the branch is asking to add.

## Method

A pull request's proposal is its three-dot diff against `main`. Compute that
proposal at the reviewed commit and at the current head, discard hunk headers
and context — line numbers shift whenever unrelated code moves and would report
a false difference — and compare only the added and removed lines.

Documentation is scored separately from code. Doc churn is real but is not what
a technical verdict was about.

**Controls.** A comparison that cannot report a difference makes every "same"
below worthless, so two known pairs were run through the same path:

    identical pair   (5d97c4cb vs fix/vf1-reviewed)                -> reports SAME  FIRES
    different pair   (5d97c4cb vs fix/validate-foundation-exact-pins) -> reports DIFFERENT  FIRES

## Results

| PR | Code proposal | Docs | Code files | Status |
|---|---|---|---|---|
| #88 | identical | identical | 3 → 3 | `FRESH` |
| #110 | identical | identical | 2 → 2 | `FRESH` |
| #73 | identical | changed | 2 → 2 | `FRESH_IN_CODE` |
| #68 | changed | changed | 3 → 4 | `NOT_FRESH — mechanical` |
| #91 | changed | changed | 4 → 5 | `NOT_FRESH — guard scope` |
| #94 | changed | changed | 2 → 4 | `NOT_FRESH — guard scope` |
| #60 | — | — | 0 → 3 | `MEASUREMENT INVALID` |
| #69 | — | — | — | `REVIEW_EVIDENCE_UNKNOWN` |

**Three of eight need nothing.** `#88` and `#110` propose byte-identical changes
to the ones that were approved; their verdicts describe exactly what would merge.
`#73` differs only in documentation.

## What changed in the three that are not fresh

### `#68` — mechanical re-pin

One file added to the proposal, `tests/conformance-v020-governance.test.mjs`,
changing a pinned hash for `policy-decision-point.mjs` with a comment naming the
branch and the reason. `#68` also carries three non-merge commits after its
verdict that add real grant-shape validation logic, which its
`APPROVE_WITH_NOTES` does not cover. **It is the one PR here whose post-verdict
work is substantive code.**

### `#91` and `#94` — a byte-identity guard's protected set was narrowed

Both removed a source file from a guard's protected list after their verdict:

    #91  tests/integration-queue-ledger.test.mjs
         - "src/ledger/checkpoint-ledger.mjs",
         + // intentionally EXCLUDED by mod-runtime-s1-checkpoint-ordering-fix-001:
         +    an authorized, disclosed cross-cutting fix ... not drift this guard
         +    should protect against.

    #94  tests/integration-collision-forecast.test.mjs
         + // src/control/overlap-policy.mjs is intentionally EXCLUDED by
         +    mod-wspace-s2-overlap-case-fix-001: a second independent review found
         +    a real case-sensitivity gap ... with live blast radius through THIS
         +    exact consumer

**This is the normal and correct mechanism, not misconduct.** A branch that
legitimately changes a file must exclude or re-pin it, or every guard covering
that file fails — `WP-GOV-VF1` did exactly this, under an authorized slice, and
its seven re-pins were reviewed. Both exclusions here are disclosed in comments
that name the branch and the reason.

The problem is only sequence: **a reduction in what tamper detection covers
happened after the approval of the work it protects.** Of everything in this
backlog, guard scope is the thing least suited to landing unreviewed, because a
guard that no longer covers a file cannot report that the file drifted.

### `#60` — the verdict does not apply to what is open

The review record on `main` names `bst/mod-live-s1-value-mutation-fix-001 @
5b93086`, and `5b93086` is now an ancestor of `origin/main`. **The reviewed work
already merged.** Its proposal against `main` is therefore empty, and the
comparison above is not measuring drift — it is measuring the gap between merged
work and different work.

What `#60` currently proposes is 43 added lines across
`src/live/event-family-policy.mjs`, `tests/p0-19-self-pilot.test.mjs` and
`tests/replay-assembler.test.mjs`. **No located verdict covers any of it.**

`#60` is therefore not the mildest row in the table. It is the one whose recorded
approval is least connected to what would merge, and it presents as approved.

## Recommendation

Not authority. The producer has a stake in how the freshness rule is applied,
because `#137` is subject to it.

| | |
|---|---|
| `#88`, `#110` | merge on the existing verdicts. Nothing changed. |
| `#73` | merge. Confirm the doc delta is a tracker file if that matters to the approver. |
| `#68` | needs review of the post-verdict code only — three commits, not the whole PR. |
| `#91`, `#94` | need someone other than the producer to confirm the two guard exclusions are justified. The rest of each PR is unchanged and does not need re-review. |
| `#60` | re-scope. Either the open work gets its own review, or the PR is closed as already-merged and the remainder reopened as new work. |
| `#69` | locate the verdict before commissioning one. `9c8edc4` asserts a review happened. |

**Total genuinely needing reviewer attention: four PRs, and in three of them only
a named subset.** The starting position was ten pull requests presenting as an
unreviewed backlog.

## Addendum, 2026-08-04 — `#60` measured, and the earlier characterisation corrected

This record called `#60` *"the weakest row in the table, not the mildest"* and
`"43 lines of different work that no located verdict covers"`. That was counted,
not measured, and the implication was wrong.

Stripping comments and string literals from all three files it proposes:

    logic identical   raw-identical: no    src/live/event-family-policy.mjs
    logic identical   raw-identical: no    tests/p0-19-self-pilot.test.mjs
    logic identical   raw-identical: no    tests/replay-assembler.test.mjs
    control - stripper detects a logic change: FIRES

**`#60` changes no executable logic against `main`.** Its 34-line source delta is
a disclosure comment recording `N4` — a Proxy `getOwnPropertyDescriptor` forge
one structural layer below the `N3` fix, which reading N named properties off an
adversarial Proxy can never be made atomic against. The two test files are the
re-pins that comment forces.

The comment cites, by filename, the very review that is `#60`'s verdict as having
found `N4`. **Like `#69`, the post-verdict work exists because of the review**,
and the operator already dispositioned `N4` on `main` at `abb6e83`.

Corrected status: `FRESH_IN_CODE`. `#60` does not need re-scoping and does not
need a review. What remains true is narrower and still worth stating: its verdict
names `5b93086`, which is an ancestor of `main`, so an approver reading the record
should understand it as approving work that already merged, with the open
remainder being that verdict's own disclosure comment.

Revised totals: **five of nine need no reviewer attention** — `#60`, `#69`, `#73`,
`#88`, `#110`. Three need a named subset — `#68`, `#91`, `#94`. One is `#137`.

The error is left visible above rather than edited away. Counting a diff is not
measuring it, and this record spent a section telling reviewers not to trust
counts before doing exactly that.

## Addendum 2, 2026-08-04 — mergeability was never checked, and two of these cannot merge

This record recommended `#88`, `#110`, `#73`, `#69` and `#60` be merged on their
existing verdicts. **It never checked whether they can merge.** Two cannot:

    #60   MERGEABLE    CLEAN
    #68   CONFLICTING  DIRTY
    #69   CONFLICTING  DIRTY
    #73   MERGEABLE    CLEAN
    #88   MERGEABLE    CLEAN
    #91   MERGEABLE    CLEAN
    #94   MERGEABLE    CLEAN
    #110  MERGEABLE    CLEAN
    #137  MERGEABLE    CLEAN

**That data was collected in this session's first scan, printed as `DIRTY` for
both, and then not carried into any conclusion.** Freshness and mergeability are
different questions and only one of them was answered.

### What the two conflicts are

Both conflict in exactly one file, and it is the same file: `tests/approval-binding.test.mjs`.

`#68`:

    <<<<<<< origin/main
    // src/control/sod-rules.mjs is intentionally EXCLUDED here by
    // mod-gov-s1-sod-rules-hardening-fix-001 ...
    =======
    // src/control/policy-decision-point.mjs is intentionally EXCLUDED here by
    // mod-gov-s3-pdp-grant-shape-fix-001 ...
    >>>>>>>

**Two branches each removing a different file from the same byte-identity
guard.** `main` already landed one exclusion; `#68` adds a second at the same
place. `#69`'s conflict is the same shape, against a disclosed-divergence
assertion `main` gained separately.

`tests/approval-binding.test.mjs` is inside BOTH pull requests' reviewed
proposals — checked, not assumed. So resolving these conflicts is not
housekeeping outside the reviewed delta; **the resolution lands inside reviewed
territory and is itself unreviewed content.** That is the freshness problem
again, one level down, and it is why step 5 below says the resolution needs to
be checked against the reviewed delta rather than merely made to compile.

### The thing worth noticing while it is still small

Every one of these exclusions is individually correct, individually disclosed,
and individually approved. **Nobody reviews the total.** Each reviewer sees one
branch removing one file; the guard that reaches `main` carries the union.

Measured rather than feared:

    exclusions in tests/approval-binding.test.mjs on main       1
    ... after #68 merges                                        2
    guards on main carrying at least one exclusion              5, one each

One per guard today. The conflicts in `#68` and `#69` are the first time two
exclusions have met, which makes now the moment to decide whether the union
needs its own review — not after the number is large. This is the same question
already asked about `#91` and `#94` in `HANDOFF-POST-VERDICT-DELTA-001`, and it
should be asked cumulatively rather than once per branch.

### Recomputing after `main` moves

Everything above is bound to `origin/main @ 8be8c99`. Merging anything
invalidates it. The recompute:

    git fetch origin
    gh pr list --json number,mergeable,mergeStateStatus,headRefOid
    node tools/secb-reviews.mjs <branch>          # evidence and freshness per branch
    git merge-tree --write-tree origin/main <branch>   # conflicts, without touching the tree

`git merge-tree` is the non-destructive way to see a conflict; nothing above
required checking anything out.

### Corrected sequence

1. The operator merges `#137`.
2. `git fetch origin`.
3. Recompute mergeability AND freshness for all eight, using the commands above.
   Both, not either.
4. Merge whatever is still fresh and still clean.
5. `#68` and `#69`: resolve the guard conflict, and check the resolution against
   the reviewed delta rather than against whether it compiles — the conflicting
   file is inside both reviewed proposals.
6. `#68`, `#91`, `#94`: wait for the verdicts requested in
   `HANDOFF-POST-VERDICT-DELTA-001`.

## Limitations

- **`FRESH` means the proposal is unchanged, not that the change is correct.**
  These rows inherit their verdicts exactly, including any finding those
  verdicts left open. Nothing here re-validates any verdict's reasoning.
- **The comparison is over the diff payload**, so a change that removes a line
  in one place and adds the identical line elsewhere reads as identical. That is
  the intended behaviour for tolerating code motion and it is a real blind spot.
- **`main` is treated as fixed at `8be8c99`.** If `main` moves, every three-dot
  proposal is recomputed and these results expire.
- **Verdict strings come from commit subjects**, not from parsing each record.
  Whether a record supports the word `APPROVE_FOR_MERGE` in its subject was not
  assessed here or in the predecessor.
- **`#69` is not a claim that no review exists.** The search did not cover
  GitHub comment bodies or anything outside this repository.
