# `#137` and `#138` cannot both land without a re-pin, and the order decides who pays

**Document ID:** `SECB-ASSURANCE-MERGE-ORDER-001`
**Status:** `EVIDENCE RECORD — read-only, produced by running`
**Produced by:** Claude Code (worker agent), producer of `#137`
**Date:** 2026-08-05
**Baseline:** `origin/main @ 8be8c99`
**Mutation:** none. No branch, pull request or ref was changed; `git merge-tree` and `git commit-tree` write objects, never refs.

## The interaction

`#138` (`codex/wp-mem-lease-token-rework-004`, +12,532/-152) modifies
`tools/validate-foundation.mjs` and all seven test files that `#137` re-pinned
under `WP-GOV-VF1`.

**`git merge-tree` reports zero conflicts in either order.** Textually the two
merge clean. The guards disagree:

    validate-foundation.mjs blob
      #137 alone                  1cf857089d483f133f6d5fb724319e60bea961f8   matches the pin
      #137 then #138              216113a28d2f202d869eaf5a2256f4af550a3790
      #138 then #137              5986d3f425d9180ba3fd8f06f7863499c2c2b2aa

    #137's pin, present in all seven guards after either merge   7 / 7

The pins survive; the file they pin does not. **Merging both, in either order,
makes all seven byte-identity guards fail.** That is the guards working — a
third blob exists that neither reviewer examined, and they say so.

Control: on `#137` alone the blob equals the pin exactly, so the mismatch above
is about the combination and not about the pin being wrong.

## A retraction, because the first measurement said something much worse

The first run of this comparison reported **`0 / 7` — that `#138` silently
deleted the tamper-detection assertions from every guard.** That was minutes
from being reported as a security finding.

It was false. `git merge-tree --write-tree` takes commits, not trees; the
second-stage variable was empty, every `git show "$EMPTY:file"` returned
nothing, and each count of zero was a failed read. The two-step merge now goes
through `git commit-tree`, and a control that reads a file known to exist
confirms the tree is readable before any count is believed.

Recorded rather than quietly fixed, because "the check returned zero" and "the
check could not run" are indistinguishable without that control, and this is the
second time in two days that distinction has mattered here.

## `#138` on its own

    node tools/secb-guard-coverage.mjs origin/codex/wp-mem-lease-token-rework-004
    → 43 source files covered; no file loses all byte-identity coverage; exit 0

No coverage gap. The interaction with `#137` is the only issue found.

## What follows

**Whichever lands second needs an authorized re-pin round**, because it changes
the validator again and the seven guards then name a blob that no longer exists
in the tree. `WP-GOV-VF1` established that a re-pin is an authorized act with a
review, not a fix-up.

**That is an argument for landing `#137` first, and the producer of `#137` is the
one making it.** Stated plainly so it can be discounted:

- `#137` exists specifically to be the exact commit an independent reviewer
  examined. Its whole value is that `head == reviewed SHA`. If it lands second
  it needs new commits, and that property is gone — the same property that made
  `#136` unmergeable.
- `#138` has not been reviewed yet. A re-pin folded into its review costs a
  reviewer nothing extra, because they are reading those files anyway.

The counter-argument, which the producer cannot weigh fairly: `#138` is
twelve thousand lines and may be far more expensive to rebase than `#137`'s
two commits.

**A third option exists and may be better than either:** land `#137`, then have
`#138` carry the re-pin as part of its own reviewed change. That is one round,
not two, and the re-pin lands under a review that is already happening.

## Addendum, 2026-08-05 — the central claim above is WRONG: they conflict

**"`git merge-tree` reports zero conflicts in either order" is false.** So are the
three blob values, and so is the `7 / 7` pin-survival count.

`git merge-tree --write-tree` does not print the word `CONFLICT`. It prints
conflicted paths as stage-1/2/3 index entries after the tree line. The check
above grepped for `CONFLICT`, found nothing, and concluded the merge was clean.
It then read blobs out of a **conflicted** tree, which is why the values were
unstable — three runs of the same command produced `216113a2`, `d5a0cb8b` and
`3dbdfe5c`.

Measured correctly, and reproducibly:

    #137 then #138 — conflicted paths        #138 then #137 — conflicted paths
      tools/validate-foundation.mjs            tools/validate-foundation.mjs
      tests/cadence-policy.test.mjs            tests/cadence-policy.test.mjs
      tests/event-family-policy.test.mjs       tests/event-family-policy.test.mjs
      tests/kpi-registry.test.mjs              tests/kpi-registry.test.mjs
      tests/overlap-policy.test.mjs            tests/overlap-policy.test.mjs
      tests/replay-assembler.test.mjs          tests/replay-assembler.test.mjs
      tests/scorecard-assembler.test.mjs       tests/scorecard-assembler.test.mjs
      tests/write-set-policy.test.mjs          tests/write-set-policy.test.mjs

    control: main + #137 alone → 0 stage entries, genuinely clean

**Eight files, both orders, identical set: the validator and all seven guards
that vouch for it.**

### What actually follows

The corrected finding is simpler than the retracted one and worse.

`#137` and `#138` **do not merge cleanly in either order**. Whoever lands second
resolves a real conflict **inside the seven files that carry this repository's
tamper detection**, plus the validator they protect.

That is the same situation already documented for `#68` and `#69` in
`SECB-ASSURANCE-REV-FRESHNESS-001` — two branches meeting inside a guard — and
it is the reason that record argued the union needs its own review. Here it is
not a union of exclusions but a direct textual conflict, and the resolution is
unreviewed content produced at merge time in the files least suited to it.

**The ordering recommendation is unchanged and its basis is not.** `#137` should
land first because it exists to be the exact reviewed commit, not because the
merge is clean — it is not clean either way.

### Why this is recorded rather than rewritten

The wrong version was published to three pull requests before it was checked
again. Two failures produced it, and both are the same failure:

1. **The first attempt** read from an empty variable and reported `0 / 7`,
   meaning "the guards were silently deleted". Caught by a control.
2. **The second attempt** fixed that, added a control that the tree was
   readable, and still trusted a grep for a string the tool never emits. The
   control proved the tree could be read. It did not prove the tree was a
   *clean merge*, and nothing asked that question.

A control answers exactly the question it was built for. The second one was
built for the wrong question, and a wrong answer survived it looking verified.

## Limitations

- **Measured against `origin/main @ 8be8c99`.** Any merge invalidates all of it.
- **`git merge-tree` predicts a merge; it does not perform one.** A real merge
  with different strategy settings could differ.
- **Only the seven `WP-GOV-VF1` guards were checked** for pin survival. `#138`
  touches other test files, and whether any of those carry pins that the
  combination breaks was not examined.
- **The producer of `#137` wrote this.** Every number is reproducible from the
  commands in it; the recommendation is not, and should be treated as an
  interested party's opinion.
