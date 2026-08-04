# The union of guard exclusions, and one real coverage gap

**Document ID:** `SECB-ASSURANCE-GUARD-EXCLUSION-UNION-001`
**Status:** `EVIDENCE RECORD — read-only, produced by running`
**Produced by:** Claude Code (worker agent), acting as producer
**Date:** 2026-08-04
**Baseline:** `origin/main @ 8be8c99`
**Mutation:** none. No branch, pull request, ref or record outside this document was changed.

## The ruling this answers

Operator, advisory, 2026-08-04:

> The union of exclusions must be reviewed independently, because per-branch
> approval does not prove the total will not create a coverage gap — especially
> where several exclusions meet in the same guard.

That was a judgement made without the numbers. The numbers are below, and they
contain one case the ruling was right to worry about.

## Why a file gets excluded at all

A byte-identity guard asserts that a set of source files is unchanged from a
named baseline. A branch that legitimately changes one of those files must
either re-pin it to a new blob or exclude it, or every guard covering it fails.

**Exclusion is a normal, correct, disclosed mechanism.** Every exclusion in this
repository names the branch responsible and the reason. Nothing below suggests
otherwise.

The gap the ruling names is different: each reviewer sees one branch removing
one file. What reaches `main` is the union, and no review has that in scope.

## What `main` carries today

    tests/approval-binding.test.mjs           src/control/sod-rules.mjs
    tests/knowledge-claim-service.test.mjs    src/control/sod-rules.mjs
    tests/knowledge-linkage-service.test.mjs  src/control/sod-rules.mjs
    tests/memory-gateway-service.test.mjs     src/control/sod-rules.mjs
    tests/skill-promotion-ledger.test.mjs     src/control/sod-rules.mjs

    5 exclusions across 5 guards — but ONE file, one decision, replicated.

## What the open pull requests would add

    #60    adds 0
    #69    adds 0
    #73    adds 0
    #88    adds 0
    #110   adds 0
    #68    adds 1   approval-binding            <- policy-decision-point.mjs
    #91    adds 1   integration-queue-ledger    <- checkpoint-ledger.mjs
    #94    adds 2   integration-collision-forecast <- overlap-policy.mjs
                    integration-queue-ledger       <- overlap-policy.mjs

    union: 9 exclusions across 7 guards. Growth 5 -> 9.
    guards where more than one exclusion would meet: 2
      tests/approval-binding.test.mjs
      tests/integration-queue-ledger.test.mjs

## The test that matters, and its one failure

Counting exclusions is not the risk. An exclusion is harmless while another
guard still covers the file. **It becomes a coverage gap when a file is excluded
from every guard that covers it.**

    file                              excluded from   still covered by
    src/control/sod-rules.mjs         main            3 guards
    src/control/policy-decision-point.mjs  #68        1 guard
    src/ledger/checkpoint-ledger.mjs       #91        2 guards
    src/control/overlap-policy.mjs         #94        0 guards   <-- GAP

Verified independently of the scanner, by listing guards directly:

    guards on main covering src/control/overlap-policy.mjs
      tests/integration-collision-forecast.test.mjs
      tests/integration-queue-ledger.test.mjs

    the same query on #94's branch
      (nothing)

    control, same query for #91's excluded file on #91's branch
      tests/conformance-p0-18-candidate.test.mjs
      tests/conformance-v016-drift.test.mjs

The control matters: without it, "zero guards" is equally consistent with a
broken query. `#91`'s file returns two, so the query works and `#94`'s zero is
real.

**`#94` excludes `src/control/overlap-policy.mjs` from both of the two guards
that cover it. After it merges, no byte-identity guard covers that file.**

`#94`'s own comment says *"The other four files remain fully protected."* That
is true, and it is about the other four. It says nothing about the file being
excluded, and read quickly it reassures about exactly the thing that is not
being asserted.

## What this does and does not mean

**It does not mean the file is unprotected.** `overlap-policy.mjs` has its own
test suite, and the case-sensitivity fix `#94` exists to deliver is itself
tested. The claim here is narrow and literal: after `#94`, no byte-identity
guard asserts that file is unchanged, so drift in it is no longer detected by
that mechanism.

**It does not mean `#94` is wrong.** Its fix is real, a second independent review
found the bug it closes, and the branch discloses both exclusions. Excluding a
file you legitimately changed is the correct move for the branch in isolation.

**It does mean the ruling found something.** Per-branch review approved each
exclusion; only the union shows that one file loses its last guard. `#68` and
`#91` do not have this property, which is what makes `#94` worth separating
rather than treating all three as the same request.

## Recommendation

Not authority. The producer measured this and does not decide it.

**Re-pin rather than exclude, where the file is losing its last guard.** A re-pin
keeps the file protected at a new blob; an exclusion removes it from protection.
`WP-GOV-VF1` chose re-pin for the same situation, across seven guards, and its
re-pins were reviewed. For `#94` the choice is between one more re-pin and a file
that no guard watches.

**Make the union test a check rather than a document.** The query above is
mechanical: for every excluded file, count the guards still covering it, and fail
when the count reaches zero. That turns this record into something that cannot
silently stop being true — which is the difference between the two conflicts in
`#68`/`#69` being noticed now and being noticed at nine exclusions instead of two.

## Addendum, 2026-08-04 — reproduced without reading a single comment

The operator rejected the method above, not the finding: **a check must read the
executable or machine-readable protected-file declarations, not comments, because
comment wording changes and the check silently stops working.** That is correct,
and this record's own limitations section conceded the counts were a floor for
exactly that reason.

Re-derived on the other side of that constraint. **The exclusion never needs to
be parsed at all — only the coverage does.** A file is covered by a guard if and
only if the guard names it as a protected file; removing it drops the coverage
whether the removal carries a comment, a different comment, or none. That is
strictly stronger than comment scanning, because it also catches a silent
removal, which comment scanning cannot see by construction.

Two corrections were only visible by running it:

**Compare the merge result, not the branch.** Branch-versus-main reported 27
files reaching zero coverage. Nearly all were branches that predate a guard on
`main` rather than branches that removed anything — an artefact that disappears
on merge. `git merge-tree --write-tree` computes the merge result without
checking anything out.

**A named path only counts if it is a real file.** Of 70 paths named inside
guards on `main`, only **43 exist**; `src/moduleA/a.mjs` and `src/x.mjs` are test
fixtures that look like source paths.

With both corrections the 27 collapse to 1:

    #60   0     #73   0     #88   0     #91   0     #110  0
    #68   conflicting — merge result not computable
    #69   conflicting — merge result not computable
    #94   1     src/control/overlap-policy.mjs   2 -> 0

    control: main merged with itself — 0 gaps

**The same file, by an independent route.** The comment-based finding was right,
and it was right for a method that could not have stayed right.

Filed as `WP-GOV-UC1`, which carries both corrections as acceptance criteria so
a future implementation cannot quietly revert to either.

## Addendum 3, 2026-08-04 — "re-pin instead of exclude" does not work on these two guards

This record recommended that `#94` re-pin `src/control/overlap-policy.mjs`
rather than exclude it, and the operator endorsed that recommendation.
**Checked against the guards, it is not available.**

The two guards `#94` touches do not store a per-file pin. They compare every
guarded file against a single baseline commit:

    const guarded = ["src/control/overlap-policy.mjs", ...];
    const baseBlob     = git rev-parse `${BASE_COMMIT}:${rel}`
    const worktreeBlob = git hash-object <rel>
    assert.equal(worktreeBlob, baseBlob)

    tests/integration-collision-forecast.test.mjs   BASE_COMMIT
    tests/integration-queue-ledger.test.mjs         BASE = "385ac65"

**There is no per-file value to update.** One baseline governs the whole set, so
"re-pin this one file" would mean advancing `BASE` for every file in the guard —
which silently re-baselines the others, the opposite of what was intended.

This is a different mechanism from the one `WP-GOV-VF1` re-pinned, where an
explicit `path -> blob` map exists and a single entry can be changed. Both styles
are in this repository, and the recommendation was written from the second while
`#94` sits on the first.

### What is actually available

The relevant blobs:

    src/control/overlap-policy.mjs
      at BASE 385ac65   5cb2f200a9ebce8f901ed1ebb760d6b7f8a9499a
      at origin/main    5cb2f200a9ebce8f901ed1ebb760d6b7f8a9499a
      at #94's head     1f67573d48f5e003039faf404e7becffbfa1bf16

Three options, in increasing cost:

**Relocate the pin.** Keep the exclusion from the set-based guard, and add one
assertion pinning the file to `1f67573d…` explicitly. Detection is preserved at
a named value rather than dropped; the cost is one test and it does not touch
either guard's mechanism. `#69` already does something of this shape on its own
branch, asserting a file *differs* from baseline — asserting equality to a named
blob is the stronger form.

**Add a per-file override to both guards.** Introduce a `path -> expected blob`
map that takes precedence over the baseline comparison. This is the design the
recommendation assumed already existed. It is a mechanism change to two guards,
so it needs its own review, and it invalidates nothing.

**Accept the gap with a recorded decision.** Legitimate if someone decides
byte-identity coverage of that file is not worth the cost — but it should be a
decision in a record, not the side effect of an exclusion.

The producer has no recommendation between these. It made one already, from an
assumption it had not checked, and the operator endorsed it on that basis.

## Limitations

- **Exclusions are found by comment shape** — a comment naming a `src/**.mjs`
  file as intentionally excluded. An exclusion expressed differently is invisible
  to this scan, so the counts are a floor.
- **Coverage is measured by a file being named in a guard's protected list.**
  A guard that protects a directory, or computes its set at runtime, would not be
  counted, which would understate coverage and overstate gaps.
- **`main` is fixed at `8be8c99`.** Every number expires when it moves.
- **The union is projected, not observed.** No merge was performed. Merge
  resolution could differ from the union computed here, and `#68` and `#69` are
  `CONFLICTING` precisely where two exclusions meet.
- **Nothing here judges whether any individual exclusion was justified.** That is
  the question already put to a reviewer in `HANDOFF-POST-VERDICT-DELTA-001`.
