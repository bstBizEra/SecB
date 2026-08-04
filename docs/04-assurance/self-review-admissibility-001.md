# What self-review caught, what it missed, and what follows

**Document ID:** `SECB-ASSURANCE-SELF-REVIEW-001`
**Status:** `EVIDENCE RECORD — measured from one session, 2026-08-03 to 2026-08-05`
**Produced by:** Claude Code (worker agent), acting as producer
**Scope:** 62 commits on `feat/secb-ruflo-command-center`, from `8ac10e3` to `33ae47e`
**Mutation:** none. This record changes no rule and proposes no change to any authority boundary.

## Why this exists

The BST-SA contract permits an agent to self-certify advisory work products and
forbids it from self-authorizing execution. That rule is stated as a principle.
This record makes it empirical, because one session produced enough failures to
measure it.

**The producer is the subject of this record.** It has an interest in
self-review looking good. The mitigation is that every row below is a failure,
each one recoverable from the git history, and the conclusion is narrower than
the rule it examines rather than wider.

## Every wrong claim, and what caught it

| # | Wrong claim | Caught by |
|---|---|---|
| 1 | `gh pr merge 137 --squash`, recommended three times | **the operator** |
| 2 | `#69` can merge on existing evidence | **the operator** |
| 3 | "re-pin instead of exclude" for `#94` | producer, after the operator had endorsed it |
| 4 | "the second blocker does not exist" (calibration) | producer, on re-running in the right checkout |
| 5 | `#60` is "43 lines of different work" | producer, on measuring instead of counting |
| 6 | `secb-reviews` bound 21 refs to one pull request | producer, reading absurd output |
| 7 | `secb-reviews` counted a review *request* as a verdict | producer, reading the output |
| 8 | the regression test for #6 did not catch its own bug | **sabotage** |
| 9 | the no-op guard missed `files[].text` | **the test suite** |
| 10 | `DEF-R4` reproduction denied everything for the wrong reason | producer, noticing nothing got through |
| 11 | suite "failure" that was an empty `node_modules` | producer, checking before reporting |
| 12 | two `fetch` refspecs written into the real repo config | producer, reading command output |
| 13 | commit message claiming comment-only when 10 lines were assertions | producer's own control, whose output had been ignored |

Thirteen wrong claims in 62 commits. Four are recorded as corrections in commit
subjects; the rest are recorded in the bodies of the records they corrected.

## The pattern

**Rows 4–13 are measurement claims. Every one was caught, and caught cheaply.**
They were caught because something could disagree: a control, a sabotage run, a
second count, an exit code, or output absurd enough to notice. In each case the
instrumentation already existed or cost minutes to build.

**Rows 1–3 are judgement claims. None was caught by any control.**

- `--squash` is not falsifiable by a test. Nothing in the repository fails when
  a producer recommends the wrong merge method. It would have destroyed the
  exact-SHA binding that `#137` exists to preserve, and the only thing standing
  between the recommendation and that outcome was a human reading it.
- Mergeability was **printed by the producer's own first scan as `DIRTY`** and
  then not carried into any conclusion. The data was present; the judgement
  skipped it. No control covers "did you use the thing you measured".
- The `#94` remedy was written from a guard mechanism the producer had not
  opened. It was endorsed by the operator on the producer's word, and the
  producer found it wrong two days later by finally reading the file.

Row 3 is the important one, because self-certification worked exactly as
designed there and still produced a bad outcome: the claim was advisory, it was
labelled advisory, and it was wrong in a way no control could see.

## What follows

**Self-certification is admissible for measured claims that carry a firing
control, and inadmissible for recommendations.**

That is narrower than the current rule, which permits self-certifying "advisory
work products" as a class. A recommendation is an advisory work product. Three
of them were wrong here, and the two that reached the operator were both acted
on before anyone found out.

Concretely, for this producer:

- **A claim with a control is self-certifiable.** "The suite passes", "this
  mutation is caught", "coverage drops to zero" — each has an arm that can fail,
  and this session shows those arms firing.
- **A recommendation is not.** "Merge with `--squash`", "re-pin instead of
  exclude", "these five can merge" — nothing can fail. The producer should state
  what it measured and what it does not know, and let the decision sit with
  someone who did not produce the measurement.
- **The gap to watch is measured-but-unused data.** Row 2 is not a measurement
  failure. The measurement was correct, printed, and then ignored. No amount of
  additional instrumentation fixes that.

## What this record does not do

- **It does not propose any change to `AGENTS.md`, ADR-0014, or any authority
  boundary.** The producer is the beneficiary of every such change and its
  opinion on them carries no weight it should be granted.
- **It does not claim thirteen is the total.** It is the count of errors that
  were found. Errors that shipped without being found would not appear here, and
  their absence from this table is not evidence of their absence.
- **It does not evaluate whether the operator's catches were lucky.** Rows 1 and
  2 were caught by a reader paying close attention. A less attentive reading
  would have merged with `--squash`.

## Limitations

- **One session, one producer, one repository.** The pattern may not generalise.
- **Self-reported.** The table is assembled by the party that made the errors.
  It is checkable against the git history — that is the only reason to believe
  it — and a reader who wants to verify should start from `git log 8ac10e3..`
  rather than from this table.
- **"Caught by the producer" is doing real work in this table and should be read
  sceptically.** In rows 4–13 the producer caught itself, but usually after
  publishing the wrong claim to the operator first. Caught before shipping and
  caught after saying it out loud are not the same, and this table does not
  distinguish them.
