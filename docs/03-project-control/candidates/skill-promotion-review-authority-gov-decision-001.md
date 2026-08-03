# GOV Decision Request — Who holds independent review for a skill promotion?

**Document ID:** `SECB-GOV-DECISION-SKILL-REV-AUTHORITY-001`
**Status:** `RULED — option D. Skill promotion remains fail-closed; no REV assigned, no exception granted.`

> **RULED 2026-08-03 by Operator (BizEra).** See [`SECB-DECISION-SHEET-001`](secb-decision-sheet-001.md), which is the record of record for this ruling. This document is unchanged below and remains the full statement of the reasoning.

**Decision owner:** GOV (human governance body). SEC consulted. No agent is eligible to rule or to be assigned by this record without an explicit ruling that names it.
**Prepared by:** Claude Code (worker agent) — prepares the decision, does not make it
**Prepared at:** 2026-08-03, verified against `main` at `e8eb4ec`
**Blocks:** every path to a working SkillsHub, on any branch, regardless of how much code is written

---

## 1. Why this is the first question, not the last

Making one skill consumable requires, at minimum: a bridge from the promotion
ledger to `SkillResolver.registerSkill` (**nothing on `main` calls it — the only
occurrence is its own definition at `skill-resolver.mjs:59`**), a real
`decisionLookup` wiring, and a caller-context binding.

None of that matters if the promotion itself cannot be formed.

`src/control/approval-binding.mjs` on `main` requires an approval bundle carrying
a `REV` role and a `GOV` role, and enforces:

```js
if (independent.actor_id === producerActorId) return { ok: false, code: "DENY_SELF_APPROVAL" };
const distinct = checkPairwiseDistinct([
  { role: "producer",           actorId: producerActorId },
  { role: "independent_review", actorId: independent.actor_id },
  { role: "governance",         actorId: governance.actor_id }
], { code: "DENY_SOD_VIOLATION" });
```

`contracts/skill-promotion.schema.json` requires `producer_actor_id`,
`independent_review_actor_id` and `governance_actor_id`, all three. Building the
code first and discovering this at the end would repeat the failure that closed
`SECB-PRD-SKILLSHUB-001` — acting before checking the condition that determines
the outcome.

## 2. What this project has already decided — and it is most of the answer

`docs/03-project-control/effective/p0-wave-1-authority-packet.yaml` is the only
record in the tree that ever carried an EFFECTIVE status. It faced this exact
situation:

```yaml
owner_consolidation_exception:
  status: "EFFECTIVE_TIME_BOUNDED"
  scope: "Local bootstrap ownership fields for this two-Work-Package wave only."
  justification: "A single local human operator is the available GOV authority for the bounded bootstrap wave."
  compensating_controls:
    - "Producer, final reviewer, QA verifier, evidence acceptor, and integration authority remain distinct assignments."
    - "No producer may self-review, self-accept evidence, integrate, publish, deploy, or activate."
  residual_risk: "The local OS account proves session binding but not independent organizational identity assurance."
  expires_at: "2026-07-17T18:19:12.9499124+07:00"
```

and further down:

```yaml
qa_assignments_issued: false
evidence_acceptor_assignment_issued: false
integration_authority_issued: false
enforcement: "PRODUCER_EXECUTION_MAY_BEGIN; REVIEW_ACCEPTANCE_INTEGRATION_AND_RELEASE_REMAIN_FAIL_CLOSED"
```

Three things follow, and they are findings rather than opinions:

1. **The single-operator constraint is known, was ruled on, and the ruling
   consolidated *ownership fields only*.** It did not consolidate review. The
   compensating control says the reverse in terms: those assignments *remain
   distinct*.
2. **This project has never issued a review or acceptance assignment.** Not
   "has not yet" as an oversight — `enforcement` states the posture deliberately:
   producers may begin; review, acceptance, integration and release stay
   fail-closed.
3. **The exception expired on 2026-07-17T18:19+07:00**, seventeen days before
   this record. Nothing effective has replaced it.

So SkillsHub is not blocked by missing code. It is blocked by a posture this
project chose, recorded, and has not revisited. **That is the control working,
not a defect** — and it is why no amount of implementation reaches a working
skill.

## 3. The question, narrowed

Not "who are the three actors". Two of them are already settled by precedent:

| Role | Settled? |
|---|---|
| Producer | Yes — a registered agent instance. The packet registers `agent_codex_engin_p0_08_001` and `agent_claude_engin_p0_15a_001` as distinct ENGIN actors with their own context receipts |
| GOV | Yes — the single local human operator, per the packet's own justification |
| **REV** | **Never assigned. This is the whole question.** |

**The question for GOV:** *what identity may hold `independent_review_actor_id`
for a skill promotion, given one human operator?*

## 4. Options

| # | Option | What it costs | What it risks |
|---|---|---|---|
| **A** | **A second human reviewer.** | Requires a person this project may not have | Nothing governance-wise. This is what the controls assume |
| **B** | **A distinct registered agent instance holds REV; the human operator holds GOV.** Producer and REV are different agent instances (e.g. Claude produces, Codex reviews) | An `AGENTS.md`-level ruling that an agent may hold REV | **The load-bearing objection:** the operator's own global instruction forbids "mutual approval where Claude approves Codex and Codex approves Claude as a substitute for governance". Whether an agent REV *under* a human GOV is that substitution, or is an independent check beneath a retained human authority, is exactly what GOV must rule. The preparer has a stake in the answer and does not offer a recommendation on this option |
| **C** | **A §5 exception: the operator holds REV and GOV, time-bounded, with compensating controls.** | A properly-formed exception record | Directly contradicts the packet's existing compensating control that these "remain distinct assignments", and its residual-risk note that the local account "proves session binding but not independent organizational identity assurance". Reversing a compensating control that was itself the price of an earlier exception is a real escalation and should be visible as one |
| **D** | **Do not open review. Accept that skill promotion stays fail-closed.** | Nothing to build | SkillsHub remains unusable indefinitely. `.agents/skills/` continues to work as files agents read directly, which is how all 25 packages are used today |

**Option D deserves more weight than its position suggests.** The 25 packages
under `.agents/skills/` are in use now, without the resolver. What governed
promotion adds is the ability to *deny* a skill to a caller — scope, runtime and
data-class enforcement — and to revoke one. If nothing today needs to be denied
to anyone, the whole apparatus is cost without benefit, and D is the honest
answer rather than the defeatist one.

## 5. The mechanism, if GOV opens review

`governance-baseline.md` §5 requires an exception record to identify: exact
control varied; business justification; affected project, environment, data and
time window; compensating controls; accountable owner; independent review;
residual risk; expiry and revocation conditions; and evidence destination.

The `owner_consolidation_exception` above is a worked example of exactly that
form, produced by this project. **This matters beyond convenience:** a separate
finding (`SECB-GOV-DECISION-DOCTRINE-001`, §4) records that §5's *prohibition*
limb has been used in this project to delete requirements while §5's *enabling*
limb has never been offered as a route anywhere. The authority packet proves the
enabling limb is real and has been used. Whichever way this decision goes, it
should go through that route rather than around it.

Note also that if the answer is B or C, the exception must be **time-bounded and
must expire** — the precedent's did, and its expiry is why review is fail-closed
today rather than quietly still open. That is the mechanism behaving correctly
and should not be treated as an inconvenience to design around.

## 6. What is NOT being asked

- Not asking to build the promotion bridge, wire `decisionLookup`, or change any
  contract. No implementation is proposed by this record.
- Not asking to reopen `SECB-PRD-SKILLSHUB-001`, which is superseded.
- Not asking to relax `approval-binding.mjs`. Every option above satisfies the
  existing SoD check as written; none proposes weakening it.

## 7. Ruling

```
REV authority for skill promotion:

  [ ] A - a second human reviewer            (assign to: ____________)
  [ ] B - a distinct registered agent instance may hold REV under human GOV
  [ ] C - governance-baseline section 5 exception, operator holds REV and GOV
  [ ] D - do not open review; skill promotion remains fail-closed

If A, B or C: exception record required per section 5   [ ] to be produced by: ____________
                                        time-bounded, expires: ____________

Decided by:        ____________________
Role:              ____________________
Date:              ____________________

SEC verification:  ____________________   Date: ____________
```

**Authority statement.** This document prepares a decision. It makes none,
approves nothing, assigns no one, and activates nothing. The review posture
recorded in `p0-wave-1-authority-packet.yaml` —
`REVIEW_ACCEPTANCE_INTEGRATION_AND_RELEASE_REMAIN_FAIL_CLOSED` — stands until an
authorized signature on a §5-conformant record changes it. The preparer is a
candidate producer under option B and is therefore not eligible to advise on that
option, to serve as REV, or to verify this record.
