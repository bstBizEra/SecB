# Ten independent review records exist only on one machine

**Document ID:** `SECB-ASSURANCE-REV-EVIDENCE-AT-RISK-001`
**Work package:** `WP-REV-TRACEABILITY-001`, step 3
**Status:** `EVIDENCE RECORD — read-only, produced by running`
**Produced by:** Claude Code (worker agent), acting as producer
**Date:** 2026-08-04
**Predecessors:** `SECB-ASSURANCE-REV-TRACEABILITY-001`, `SECB-ASSURANCE-REV-FRESHNESS-001`
**Mutation:** none. No ref, branch, pull request or record outside this document was changed.

## What was being looked for

`#69` was the last open pull request with no locatable verdict. The previous
record listed what had **not** been searched — GitHub comment bodies, and
anything outside the normal record locations — and recommended searching before
commissioning a review.

The search found the verdict. It also found why nothing had found it, and the
answer generalises well past `#69`.

## `#69` is reviewed

    Record:   mod-work-sod-version-spoof-fix-independent-review-001
    Reviewer: claude-immune, independent of the producer (claude-motor)
    Target:   bst/mod-work-sod-version-spoof-fix-001 @ e880edb
    Base:     origin/main @ 385ac65
    Verdict:  APPROVE_WITH_NOTES
    Date:     2026-07-21

The reviewer re-derived the three-step exploit chain from source rather than
copying the producer's tests, and confirmed the SoD bypass closed.

**Freshness: the post-verdict delta is comment-only.** The proposal at `e880edb`
and at the head touch the same four files; the only difference is twelve lines
in `src/services/goal-graph-service.mjs`, replacing a doc comment with one that
records a finding the reviewer itself made — a front-running variant of the same
disclosed no-caller-identity gap. **Zero logic changed.**

`#69` therefore joins `#73` as `FRESH_IN_CODE`, and its post-review commit exists
*because of* the review rather than in spite of it.

## Why nothing could find it

The record was not on `main`, not on the pull request's branch, not in GitHub's
review tab, and not in a comment. It was on a ref in a namespace outside
`refs/heads`, `refs/remotes` and `refs/tags`:

    refs/reviews/mod-work-sod-version-spoof-fix-independent-review-001

Custom ref namespaces are neither pushed nor fetched by default. Every search in
this reconciliation — including the corrected one that found the other nine
verdicts by looking inside pull request branches — enumerated branches. None
enumerated refs.

**There are nine such namespaces and twenty-one review refs:**

    refs/bst-review/          refs/bst-sa-review/    refs/bst-sa/reviews/
    refs/candidates/          refs/immune-review/    refs/rev-archive/
    refs/review/              refs/review-candidates/ refs/reviews/

    git ls-remote origin 'refs/reviews/*'   -> empty
    review refs present on origin           -> 0 of 21

## The ten at risk

Eleven of the twenty-one are also reachable from an `origin` branch — those are
merely hard to find. **Ten are reachable from no `origin` ref at all**, and their
record files are not on `main`:

    843fda0  bst-review/mod-gov-s1-sod-rules-second-independent-review-001
    7aa7930  bst-sa/reviews/mod-evid-s2-s3-rehydration-guard-parity-review-001
    5d78c65  bst-sa/reviews/mod-evid-s2-s3-second-review-001
    c116c14  candidates/mod-gov-s2-s3-second-independent-review-001
    337b36e  candidates/mod-gov-s3-pdp-grant-shape-fix-round3-independent-review-001
    d4f5c50  candidates/mod-runtime-s1-checkpoint-ledger-second-independent-review-001
    25fb054  immune-review/mod-a2a-s2-third-independent-review-001
    01e1f4a  reviews/mod-work-second-independent-review-001
    c6ab7cd  reviews/mod-work-sod-version-spoof-fix-independent-review-001
    5b9acb8  reviews/mod-wspace-s2-overlap-policy-second-independent-review-001

**These exist in exactly one clone, on one machine.** They are not on the remote.
A fresh clone of this repository receives none of them. If this working copy is
lost or reset, ten independent reviews — including second and third rounds, and
the only verdict `#69` has — are gone, and the work they approved becomes
unreviewable after the fact.

`c6ab7cd`'s own record states its condition plainly: *"isolated worktree only,
not pushed, not merged"*. It was honest about being ephemeral. Nothing then
made it durable.

## What this reframes

The first report called this a discoverability problem. It is worse than that in
one direction and better in another.

**Worse:** discoverability implies the evidence is somewhere findable. For these
ten it is not published at all, and the failure mode is not "hard to audit" but
"one disk failure from unreviewable".

**Better:** the review discipline behind this repository is stronger than any
count suggested. Twenty-one independent review refs, several of them second and
third rounds, for a backlog that presented on GitHub as ten pull requests with
zero reviews.

## Recommendation

Not authority, and the producer's stake is unchanged from the predecessors.

**Publish the ten, then the eleven.** Additive, touches no branch and no pull
request, reversible by deleting the remote refs:

```bash
git for-each-ref --format='%(refname)' \
  refs/reviews refs/review refs/bst-review refs/bst-sa-review \
  refs/bst-sa/reviews refs/candidates refs/immune-review \
  refs/rev-archive refs/review-candidates |
  while read r; do git push origin "$r:$r"; done
```

This is the operator's call, not the producer's: it publishes other agents'
records to a shared remote, and the producer should not decide unilaterally that
work it did not write becomes public.

**Then pick one location and use it.** Nine namespaces for one purpose is why the
first three searches failed. Whether the answer is `refs/reviews/` fetched by
config, or a `docs/` path, matters less than there being one.

**Update `#69`'s row.** It is not `REVIEW_EVIDENCE_UNKNOWN`. It is
`FRESH_IN_CODE` with a comment-only post-verdict delta, and needs no new review.

## Limitations

- **"At risk" means unreachable from any `origin` ref as of 2026-08-04, with the
  record file absent from `origin/main`.** It does not mean no copy exists
  anywhere — another contributor's clone, or a worktree not examined here, could
  hold one. It does mean this repository's published state does not.
- **Nine namespaces were enumerated because they appeared in this clone.** A
  namespace used only in someone else's clone would not appear here at all, so
  twenty-one is a floor, not a total.
- **Verdicts were read from record headers, not adjudicated.** Whether each
  record supports its own stated verdict was not assessed here or in either
  predecessor.
- **The producer's three earlier searches all missed this**, including one that
  reported `REVIEW_EVIDENCE_UNKNOWN` for six pull requests and one that listed
  its own uncovered ground correctly but still did not think to enumerate refs.
  The list of what a search did not cover is only as good as the searcher's
  imagination, and that limit applies to this record too.
