# Review-evidence reconciliation for the ten open pull requests

**Document ID:** `SECB-ASSURANCE-REV-TRACEABILITY-001`
**Work package:** `WP-REV-TRACEABILITY-001`
**Status:** `EVIDENCE RECORD — read-only, produced by running`
**Produced by:** Claude Code (worker agent), acting as producer
**Date:** 2026-08-04
**Mutation:** none. No branch, PR, record or file outside this document was changed.

## Why this exists

A previous report observed that GitHub records no review on eight open pull
requests and reported that as a finding. The operator rejected the framing:
absence of a GitHub review is a **metadata gap**, not evidence that a PR was
never reviewed, and `#136` proves it — that PR carries an independent verdict
that GitHub does not show, because the verdict was returned as a record in this
repository.

The correct question is therefore not "which PRs are unreviewed" but "for which
PRs can review evidence be **located and bound to an exact commit**".

## Status vocabulary

Adopted from the operator's classification, unchanged:

| Status | Meaning |
|---|---|
| `EXACT_REVIEW_EVIDENCE_FOUND` | a verdict is bound to a commit that is the PR's current head |
| `STALE_REVIEW` | a verdict exists and names a commit, but the head moved after it |
| `REVIEW_EVIDENCE_UNKNOWN` | search did not locate a verdict; this is not a claim that none exists |
| `NO_GITHUB_REVIEW` | GitHub shows no review — a metadata fact, never a status on its own |
| `REWORK_REQUIRED` | an open finding is unclosed |

`NO_GITHUB_REVIEW` is true of **all ten** PRs and is therefore reported once here
rather than per row. It distinguishes nothing.

## Where the evidence actually was

The first search looked on `origin/main` and on the working branch, found almost
nothing, and would have produced eight `REVIEW_EVIDENCE_UNKNOWN` rows. That
result was wrong, and the reason it was wrong is the useful part:

**the verdicts are commits on the pull requests' own branches.**

    #110   64f2f2d  [REV-SEC] Independent review: MOD-A2A S2 decision-record binding fix (APPROVE_WITH_NOTES)
    #94    3f79b33  [REV] Independent review: MOD-WSPACE S2 overlap case-fix (d902e94) — APPROVE_WITH_NOTES
    #91    611a095  [REV] Independent review: MOD-RUNTIME S1 checkpoint ordering fix (APPROVE_FOR_MERGE)
    #88    dd15a68  Round-5 independent review ... APPROVE_FOR_MERGE
    #73    8e3cc64  [MOD-KNOW-S3] Independent review ... (APPROVE_FOR_MERGE)
    #68    2ee971c  [MOD-GOV-S3-PDP-GRANT-SHAPE-FIX-REVIEW] Independent review of S3-N1 (APPROVE_WITH_NOTES)

A reviewer's own commit sits inside the branch it reviews. That is why the
evidence is invisible from `main`, invisible from GitHub's review tab, and
invisible to any search that looks only where records are normally filed.

`#60`'s evidence is different again: a record on `main`,
`mod-live-s1-value-mutation-fix-independent-review-001.md`, naming
`bst/mod-live-s1-value-mutation-fix-001 @ 5b93086`, verdict `APPROVE_WITH_NOTES`.

## The table

Head SHAs are as of `origin/main @ 8be8c99`, 2026-08-04. "After" counts commits
reachable from the head but not from the verdict **and not from `main`** — the
PR's own post-verdict work, with folded-in main history excluded.

| PR | Head | Verdict at | Verdict | After | Status |
|---|---|---|---|---|---|
| #60 | `165d7869` | `5b93086` (record on main) | APPROVE_WITH_NOTES | 6 | `STALE_REVIEW` |
| #68 | `5d499ff1` | `2ee971c` | APPROVE_WITH_NOTES | 4 | `STALE_REVIEW` |
| #69 | `5e250383` | — | — | — | `REVIEW_EVIDENCE_UNKNOWN` |
| #73 | `991d155c` | `8e3cc64` | APPROVE_FOR_MERGE | 1 | `STALE_REVIEW` |
| #88 | `037c51a2` | `dd15a68` | APPROVE_FOR_MERGE | 1 | `STALE_REVIEW` |
| #91 | `b7f9be84` | `611a095` | APPROVE_FOR_MERGE | 1 | `STALE_REVIEW` |
| #94 | `23b8bf40` | `3f79b33` | APPROVE_WITH_NOTES | 2 | `STALE_REVIEW` |
| #110 | `7f9f131a` | `64f2f2d` | APPROVE_WITH_NOTES | 1 | `STALE_REVIEW` |
| #136 | `7a975f06` | `5d97c4cb` | APPROVE_WITH_NOTES | 1 | `STALE_REVIEW` |
| #137 | `5d97c4cb` | `5d97c4cb` | APPROVE_WITH_NOTES | 0 | `EXACT_REVIEW_EVIDENCE_FOUND` |

**Nine of ten are stale. One is exact, and it is exact only because it was
deliberately constructed that way yesterday.**

`#69` is the single genuine unknown. Its commit `9c8edc4` reads "Correct
doc-comment wording per independent review", so a review is asserted to have
happened, but no record naming a commit was located.

## What the post-verdict commits are

Nearly all are `Fold main @ ... (union)` merges. A merge can carry content
present in neither parent, so each was checked with a combined diff rather than
assumed benign.

Six of the seven merges resolve exactly one file,
`docs/03-project-control/candidates/module-completion-tracker-001.md` — a
tracker document, not code.

Two do more. `#91`'s `b7f9be8` and `#94`'s `23b8bf4` each resolve three test
files, and both commit subjects say so plainly: "+ exclude checkpoint-ledger.mjs
from a new byte-identity guard", "+ exclude overlap-policy.mjs from 2 new
byte-identity guards". **Guard scope was changed after approval.**

That looked like an evil merge and it was checked as one. It is not:

    parent1 (611a095, the reviewed commit)  contract-validator.mjs -> c3b37776...
    parent2 (9f990fe, main)                contract-validator.mjs -> 306a3d23...
    merge   (b7f9be8)                      contract-validator.mjs -> 306a3d23...

The merge adopted main's value. It invented nothing. The suspicion was wrong and
is recorded rather than deleted, because the check is the reason the claim can
be trusted in the other direction.

`#68` is the one case with substantive **non-merge** work after its verdict:
`037da18` and `65342e6` add grant-shape validation logic, and `5d499ff` re-pins.
Its `APPROVE_WITH_NOTES` covers none of it.

## What this establishes

1. **Review discipline was followed.** Independent verdicts exist for nine of
   ten open PRs. The earlier impression of an unreviewed backlog was an artefact
   of where the records live.

2. **Freshness discipline was not.** Every reviewed PR then took at least one
   more commit. Under the frozen-SHA rule stated in `WP-GOV-VF1-REV-001` — *the
   target SHA stays frozen and any later commit needs a new round* — none of the
   nine verdicts covers what would actually merge.

3. **`#136` is not an isolated producer error.** It is the ninth instance of a
   pattern that predates it by two weeks. The corrective taken there — pin the
   approved commit to its own branch, open it as `#137`, send the extra commit
   to a second round — is the only instance of the pattern being handled rather
   than repeated.

4. **The habit that causes it is `Fold main`.** Keeping a branch current is
   normal and desirable, and it silently invalidates the verdict every time.
   Nothing in the current process notices.

## Recommendation

Not authority. The producer of `#136`/`#137` has an interest in how the freshness
rule is applied and states that plainly.

**An evidence locator on the PR page.** A verdict that lives only as a commit
inside the branch it approves cannot be found by anyone reading the PR. A
comment in a fixed shape makes it discoverable without moving where records are
filed:

```text
Independent review: <record path or commit SHA>
Reviewed commit: <full SHA>
Verdict: <verdict>
Later commits covered: NO
```

**Fold before review, not after.** The stale rows are caused by folding `main`
after approval. Folding first costs a rebase; folding after costs the verdict.

**Do not open new reviews for the nine.** The verdicts exist and their findings
were addressed. What each needs is a freshness confirmation against its current
head, which is a much smaller question than a fresh review — and for the six
whose only post-verdict change is a tracker-document merge resolution, it may be
answerable by inspection.

## Limitations

- **`REVIEW_EVIDENCE_UNKNOWN` for `#69` means the search did not find a record.**
  It is not a finding that none exists. The search covered commit subjects on
  each branch, files under `docs/03-project-control` and `docs/04-assurance` on
  `main` and on the working branch, and SHA cross-references. It did not cover
  GitHub comment bodies, other forks, or any record outside this repository.
- **Verdict strings are read from commit subjects**, not from a parsed record.
  A subject that says `APPROVE_FOR_MERGE` is taken at its word here; whether the
  record beneath it supports that word was not assessed.
- **"After" counts commits, not risk.** One commit can be larger than six.
- **The first reconciler this session was wrong**, classifying six PRs as
  `REVIEW_EVIDENCE_UNKNOWN` because it searched only `main` and the working
  branch. It also reported the two `STALE_REVIEW` rows it did find via records
  that merely *mention* another branch's commit, which is not the same as
  reviewing it. Both faults are corrected above; they are recorded because the
  table's credibility rests on the method being visible, not on the table
  looking clean.
- **The producer has an interest in the freshness rule** being applied leniently,
  because `#136` is stale under it. The recommendation above therefore proposes
  no exception for `#136`.
