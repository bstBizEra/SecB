---
name: maker-evidence-audit
description: Adversarially audit your own evidence, traceability and claims BEFORE the commit that makes them a candidate. Use whenever you are the maker and are about to record propositions, mechanisms, severity or scope that an independent verifier will later assess. Catches the failure a maker cannot see - errors that run in the direction which flatters the build.
---

# Maker Evidence Audit

## Authority boundary

Operate in advisory mode. This audit produces **findings, never a verdict**. It is not an
independent verification and carries no verdict weight.

Do not mutate the target repository, grant authority, mark evidence accepted, waive findings, or
claim activation. A subagent sharing the maker's engine is **not** an independent verifier under
[`BOPEN-GOV-EBIV-001`](../../../docs/12-execution/08-bopen-engineering-loop.md) §3.1 — the rule that
a single agent instance must not act as both Maker and final Independent Verifier for
authority-affecting changes is not satisfied by auditing yourself more carefully.

Under `SECB-AGENTS-AMD-004`, a finding from this audit creates no authority: it does not merge,
approve, activate, accept evidence, promote a skill, or admit a memory. Escalate when scope,
evidence, identity, or decision rights are ambiguous.

## Required inputs

- the uncommitted change and the claims about to be recorded with it
- each cited test, read in full body rather than by name or docstring
- for every claimed mechanism, the file and line where it is asserted to exist
- the acceptance checks the slice declared, and their actual last-run output

## Workflow

### 1. Name the bias before dispatching

A reviewer asked to "review this" confirms. A reviewer asked to "find where I overclaimed" finds.
Dispatch an auditor that did not do the work, and state your own interest in the prompt:

> I am the maker and I benefit from these errors, so be adversarial rather than confirming.

Required in the prompt: read-only, no edits, no state-mutating runs; ask specifically where a claim
exceeds what its cited evidence establishes; ask whether each named mechanism exists and is
load-bearing; ask what is load-bearing but has no test and no claim; require the test body be read.

The reference prompt is in `references/audit-prompt.md`.

### 2. Check mechanism claims first — highest yield

A claim is falsifiable only if the mechanism whose removal breaks it is named. Three observed
failure shapes:

1. **The mechanism does not exist.** A claim naming a control that appears nowhere in the tree is
   unremovable, therefore unfalsifiable.
2. **The mechanism exists but is not load-bearing.** Removing a leaf leaves the probe green because
   a parent already refused. The chain was load-bearing; the leaf was not.
3. **The mechanism is reused implicitly.** An omitted clause silently inherits another, so removing
   the named one changes nothing.

**Mutate each mechanism and watch the check go red.** A mechanism whose removal changes nothing is
not the mechanism. This is the same demonstration a re-pinned guard requires.

### 3. Check for the vacuous pass

An assertion that something is *absent* passes against a tool that never ran, and a survey matching
nothing passes while checking zero rows. Every negative assertion needs a positive anchor first —
that the check executed, reached a verdict, and found something on a known-good case.

### 4. Verify every finding yourself before acting

Do not fix on report. An auditor can be wrong, and acting on an unverified finding is the same
error in the other direction. Establish each finding from the repository before changing anything.

### 5. Correct before committing, and record the direction

Rewrite the claims. Then state in the commit message what the audit found **and in which direction
the errors ran**. A corrected claim set that hides having been corrected invites the reader to trust
it more than a verifier will.

### 6. Register gaps rather than omitting them

Every coverage gap becomes a recorded item with an explicit unverified status and a plain statement
of what is not defended.

> A gap the maker discloses is a **finding**.
> A gap the verifier discovers is a **defect in the report as well as in the code**.

## Required outputs

- a findings list, each with the file and line that establishes it
- for each finding, the direction the error ran: toward flattering the build, or away from it
- the corrected claims, and what they said before
- gaps registered as explicit unverified items
- a statement that this audit is advisory and produced no verdict

## Evidence and reasoning discipline

Cite the repository, not the summary. A test name, a docstring, a header comment and a prior
report are all self-report; the test body, the mechanism's source line, and the governing record
are evidence. Where they disagree, the record governs, the source is next, and the comment is last.

Expect the corrected claims still to contain errors. This audit reduces defects; it does not
eliminate them, and reporting it as though it did is itself a claim that flatters the build.

## Completion gate

The audit is complete when every claim about to be committed has been checked against its cited
evidence, every named mechanism has been shown to exist and to be load-bearing, every negative
assertion has a positive anchor, and every gap found is recorded rather than dropped.

It is **not** complete because the audit returned no findings. An audit that finds nothing on a
substantial change is more likely to have been framed as a confirmation than to be evidence of a
clean change.

## Supporting files

- `references/workflow.md` — the sequence in operational form
- `references/audit-prompt.md` — the adversarial dispatch prompt
- `assets/output-template.md` — findings record template
- `evals/cases.yaml` — trigger and refusal cases

Adapted for SecB from the `maker-evidence-audit` skill in the bOPEN pack. The substance —
including the observed failure distribution — is carried over; citations are re-pointed to the
sections SecB's own copies actually contain, because a skill that cites a section its repository
does not have teaches agents to cite things that do not exist.
