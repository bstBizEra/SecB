# SecB Standing Delegation — what the agent decides, and what it must never decide

**Document ID:** `SECB-DELEGATION-STANDING-001`
**Status:** `WITHDRAWN BY THE PREPARER — no ruling requested`
**Withdrawn at:** 2026-08-03. No signature was requested or received.

> ## Withdrawal
>
> The preparer wrote this instrument, and it would have expanded the preparer's
> own authority. It was offered because every routine judgement was returning to
> the operator; it is withdrawn because the operator's queue turned out to hold
> six prepared records at once, and adding a seventh that widens the producer
> makes that worse rather than better.
>
> Nothing depends on it. The agent continues to ask first on everything outside
> its existing producer role, which is the position this document would have
> changed and which needs no record to remain in force.
>
> **Retained rather than deleted.** Class 3 - the list of acts that must never be
> delegated - is the part worth keeping, and it is unchanged by the withdrawal:
> authorizing work packages, varying signed controls, ruling on doctrine,
> promotion, serving as REV/QA/SEC/GOV, merging or pushing, re-pinning tamper
> detection to one's own artefact, declaring production, writing to `.agents/`,
> and widening this document. Those held throughout this session without any
> instrument saying so.
**Owner:** GOV. **Prepared by:** Claude Code (worker agent).
**Prepared at:** 2026-08-03, baseline `1370977`

> **Read this line first.** This document was written by the party whose
> authority it describes. That is a conflict, and the only honest way to handle
> it is to propose *less* authority than you might grant, state the conflict
> here, and make the revocation clause trivial to invoke. If any class below
> reads as the agent enlarging itself, strike that class — the rest still works.

**Purpose.** To stop the pattern where every routine judgement returns to the
operator. Each return costs a round trip and trains the agent to ask rather than
to decide, which is the opposite of useful. This instrument names the classes
where the agent should decide and record, and fixes hard the classes where it
must not.

---

## Class 1 — Pre-delegated. Decide, record, do not ask.

The agent decides these alone and records the decision in the commit or the
work record. No signature, no check-in.

| # | Class | Bound |
|---|---|---|
| 1.1 | How to implement within an already-authorized scope | Must stay inside `allowed_paths` |
| 1.2 | Which tests to write, and their design | Every check must be shown to fail when it should |
| 1.3 | Whether to spawn subagents, how many, with what briefs | Subagents never serve as REV, SEC, GOV or QA |
| 1.4 | Sequencing within an authorized work package | No reordering that skips an acceptance criterion |
| 1.5 | Document structure, wording, format of prepared records | House form is matched, never invented |
| 1.6 | Whether a claim is verified enough to state | Verified by exit code or direct read, never by inference |
| 1.7 | Correcting the agent's own errors in records it authored | Extend-only; the error stays visible |
| 1.8 | Declining to propagate a subagent finding it could not verify | Records that it declined and why |
| 1.9 | Stopping work on discovering the premise is false | **Expected, not exceptional.** Reported immediately |

**1.9 is the one that matters most.** This session's largest saving was stopping
a programme, not finishing it. An agent that must ask permission to stop will
keep building.

---

## Class 2 — Standing defaults. Act on these without asking; report after.

Recurring situations with an answer that does not change per instance. These
exist so the same question is not re-litigated every session.

| # | Situation | Standing answer |
|---|---|---|
| 2.1 | A check cannot fail | It is not evidence. Fix it or remove it, and say which. Never report a pass from it |
| 2.2 | A claim about what does not exist | Carries the ref it was verified against, or it is not made |
| 2.3 | Before deriving requirements from absence | Establish the distance to the default branch first and record it |
| 2.4 | A control is asserted in a comment or commit message | Verify it exists before repeating it. If it does not, make the claim true or delete it |
| 2.5 | `validate` or the suite fails after the agent's change | The agent's problem, fixed before reporting, including when the cause is a pin that must be updated deliberately |
| 2.6 | A shared working tree | No `stash`, no `checkout`, no `add <dir>`. Stage by explicit path, and check `git status` first |
| 2.7 | A fresh worktree reports failures | Check `node_modules` before reporting a baseline. A tree missing dependencies has no baseline |
| 2.8 | A finding belongs to another module | Record it, do not schedule it, and file it where its owner will find it |
| 2.9 | Preparing decision records, work packages, findings | Prepare without asking. Preparing is not deciding |
| 2.10 | An option would let a defect be marked mitigated when a probe falsifies it | Recommend explicit rejection. A false closure is worse than an open defect |

---

## Class 3 — Never delegated. No exception, no urgency override.

The agent may prepare each of these and may never perform one.

- Authorizing a work package
- Retiring, replacing or varying a signed control
- Ruling on doctrine, effectiveness or authority
- Any promotion, publication, or making a skill effective
- Serving as REV, QA, SEC or GOV, or accepting evidence for work it produced
- Merging to `main`, pushing a branch, opening a pull request
- Re-pinning tamper detection to an artifact the agent produced
- Declaring production, completion, or that a gate is discharged
- Modifying `.agents/` while `mutation_authorized: false`
- Widening this document

**On the last line.** An agent that can extend its own delegation has no
delegation, only a starting position. Changes to this document are GOV acts and
the agent may only propose them in a separate record.

---

## Escalation triggers — return to the operator regardless of class

These override Class 1 and Class 2. Each is drawn from a failure that actually
happened rather than an imagined one.

| Trigger | Why it is here |
|---|---|
| The baseline is materially behind the default branch | A programme ran six review rounds 296 commits stale. The finding that would have caught it — 51 missing lines — was found and not followed |
| A control the agent must change is tamper-pinned | `main` pins the validator's blob in seven guards. Re-pinning without authority defeats the guard |
| The work would produce an artifact that looks governed and is not | The failure mode a governance system cannot survive |
| The agent is an interested party in the decision | It supplies evidence both ways and no recommendation |
| Proceeding needs an assumption that has not been checked | Check it. If it cannot be checked, say so and stop |
| Two independent sources disagree on a load-bearing fact | Report the disagreement. Do not pick |

---

## Revocation and narrowing

Trivial by design.

- **Revoke entirely:** mark this document `REVOKED`. Everything returns to
  ask-first, immediately, with no transition.
- **Narrow:** strike any row. The remaining rows stand alone; nothing here
  depends on anything else here.
- **Automatic suspension:** if the agent performs any Class 3 act, this
  delegation is suspended until GOV reinstates it. The agent reports its own
  breach. An agent that would conceal a breach is not one this document can
  safely govern anyway, so this clause is a tripwire, not a guarantee.

**Expiry.** `2026-11-03`. Not because the reasoning decays, but because a
standing grant that never expires stops being reviewed — which is the same
mechanism that let the P0 authority packet's expiry go unnoticed for seventeen
days, and the same reason its expiry was correct.

---

## Ruling

```
Class 1 (pre-delegated):        [ ] adopt   [ ] adopt with rows struck: ____________   [ ] decline
Class 2 (standing defaults):    [ ] adopt   [ ] adopt with rows struck: ____________   [ ] decline
Class 3 (never delegated):      [ ] adopt as written   [ ] adopt with additions: ____________
Escalation triggers:            [ ] adopt   [ ] adopt with rows struck: ____________

Decided by:  ____________________   Role:  ____________   Date:  ____________
```

**Authority statement.** This document prepares a delegation. It grants none.
Until signed, the agent asks first on everything outside its existing producer
role. The preparer is the party this document would empower, has said so at the
top, and is not eligible to verify it.
