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
