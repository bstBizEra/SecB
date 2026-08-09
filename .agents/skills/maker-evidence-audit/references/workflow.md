# Maker Evidence Audit — Workflow

Advisory only. Produces findings, never a verdict, and is not an independent verification.

## Preconditions

- You are the maker of the change.
- The change is uncommitted, or committed to a branch and not yet offered as a candidate.
- Auditing after the claims become a candidate is far more expensive: corrections change the tree,
  invalidate the candidate, and force re-verification of what was already checked.

## Sequence

| # | Step | Refuse to proceed when |
|---|---|---|
| 1 | Dispatch an adversarial auditor that did not do the work; name your own bias in the prompt | the auditor is the maker, or shares the maker's session state |
| 2 | Check every mechanism claim: does it exist, and is it load-bearing? | a named mechanism cannot be located in the tree |
| 3 | Mutate each mechanism and confirm the check goes red | a mechanism's removal changes nothing — then it is not the mechanism |
| 4 | Check every negative assertion for a positive anchor | a check can pass without having run |
| 5 | Verify each finding yourself from the repository | you are about to fix on report alone |
| 6 | Correct, and record the direction the errors ran | the correction would be silent |
| 7 | Register every gap as an explicit unverified item | a gap would be omitted rather than disclosed |

## The direction test

For each error found, ask which way it ran:

- **Toward flattering the build** — the claim made the work look more complete, the mechanism
  stronger, the scope wider, or the problem smaller than it is. This is the class a maker cannot
  see unaided, and the reason this skill exists.
- **Away from it** — the claim overstated a problem, understated coverage, or raised an alarm that
  the evidence does not support. A different failure, and still a failure: it misdirects whoever
  reads the report and spends their attention on the wrong thing.

Record which. A findings list that does not distinguish them cannot show whether the bias was
corrected or merely moved.

## Evidence precedence

When sources disagree:

1. the governing record (disposition, verdict, decision record)
2. the source under audit
3. the test body
4. names, docstrings, header comments, prior reports

A header comment is written once and rarely revisited; it narrates the state at the time of
writing, including gates that have since been opened and constraints that have since been lifted.
Treat it as the weakest evidence, never as current.

## Anti-patterns

- Framing the dispatch as "review this" instead of "find where I overclaimed".
- Accepting an auditor's finding without establishing it from the repository.
- Reporting a clean audit as evidence the change is clean.
- Re-pinning a guard the change tripped, in the same commit as the change.
- Counting a check as run because its name appears in a plan.
