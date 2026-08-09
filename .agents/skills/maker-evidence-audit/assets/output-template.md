# Maker Evidence Audit — Findings Record

**Change under audit:** <branch / commit range / uncommitted paths>
**Maker:** <agent id>
**Auditor:** <agent id — must not be the maker>
**Date:** <ISO-8601>

> Advisory only. This record contains findings and **no verdict**. It is not an independent
> verification under `BOPEN-GOV-EBIV-001` §3.1 and confers no authority under `SECB-AGENTS-AMD-004`.

## Findings

| # | Claim as written | What the evidence establishes | file:line | Direction |
|---|---|---|---|---|
| 1 | | | | flatters / away-from |

Direction is required on every row. A findings list that omits it cannot show whether the bias was
corrected or only moved.

## Mechanism checks

| Mechanism named | Located at | Load-bearing? | How demonstrated |
|---|---|---|---|
| | | yes / no / not found | removal makes <check> fail / removal changes nothing |

A mechanism whose removal changes nothing is not the mechanism. Record it as a finding, not as a
pass.

## Vacuous-pass checks

| Assertion | Positive anchor | Result |
|---|---|---|
| | proves the check ran and reached a verdict | anchored / can pass without running |

## Gaps registered

| What is load-bearing | Covered by | Status |
|---|---|---|
| | nothing | UNVERIFIED |

A gap disclosed here is a finding. A gap the verifier discovers later is a defect in this record as
well as in the change.

## Corrections made before commit

| Claim | Was | Now |
|---|---|---|

## Statement

This audit reduced defects. It did not eliminate them. Corrected claims are expected still to
contain errors, and reporting otherwise would itself be a claim that flatters the build.

Findings produced: <n>. Verdict produced: none.
