# Operator prompts — copy, paste, done

**Document ID:** `SECB-OPERATOR-PROMPTS-001`
**For:** the operator, to instruct the agent without a round trip
**Written:** 2026-08-03

Each prompt below carries its own authority so the agent does not stop to ask
whether you meant it. That is the friction this file removes: most of this
session's round trips were the agent confirming an instruction it had already
been given.

**Where a prompt grants authority, it says so in words the agent must not
reinterpret.** Where it does not, the agent will still refuse — that is
deliberate and the last section lists what no prompt can grant.

---

## The five things currently waiting

### 1 · `WP-SK-R2` — code shipped, work package never authorized

The resolution-time revalidation fix (`DEF-R2`/`DEF-R3`) is committed and live on
this branch. Its work package still says `AWAITING_GOV_AUTHORIZATION`. Pick one:

```
As operator I ratify WP-SK-R2 retroactively. The work was implemented at 44285f8
before authorization; record that sequence honestly in the work package rather
than making it read as if authorization came first. Do not change the code.
```

```
As operator I decline to ratify WP-SK-R2. Record it as an authorization gap that
occurred, leave the code in place, and add it to the defect register as a
process finding against the producer. Do not revert the fix.
```

```
As operator I want WP-SK-R2 reverted. Remove the DEF-R2/DEF-R3 fix and restore
the resolver to its pre-44285f8 behaviour. Record what reopens as a result.
```

### 2 · `WP-MEM-J1` — the work journal

```
As operator I authorize WP-MEM-J1. Build it inside its allowed_paths. If the
work needs a path the package does not list, stop and tell me rather than
widening it yourself.
```

```
As operator I decline WP-MEM-J1 for now. Withdraw it with the reason recorded,
and keep using the existing lesson file until there is a reason to change.
```

### 3 · `graphify` capability record

```
As operator I accept SECB-CAPABILITY-INTAKE-GRAPHIFY-001 as CANDIDATE. Record
the acceptance. Note that CANDIDATE is not approval to use and that the package
is eight releases behind upstream.
```

```
As operator I do not accept the graphify capability record. Record why, and say
whether graphify should stay in .agents/skills, move, or be removed — that part
needs my decision and yours is only a recommendation.
```

### 4 · PR #136 — the validator fix

You cannot ask the agent to review its own work. Two real routes:

```
I have reviewed PR #136 myself and approve it. Record my acceptance as REV in
the WP-GOV-VF1 record, then tell me the exact command to merge — do not merge.
```

```
Prepare a review brief for PR #136 that I can hand to Codex. Include what to
re-run, what to try to break, and the specific claims you are least confident
in. Be harder on yourself than a reviewer would be.
```

### 5 · `f3ac99a` — the DEF-R1 fix

```
Prepare a review brief for f3ac99a. It touched a contract every governed act
flows through, and you exceeded your own work package's allowed_paths. Lead with
that, not with the passing suite.
```

---

## Moving the branch forward

```
As operator I authorize the first extraction PR under SARCHI decision
SECB-SARCHI-BRANCH-INTEGRATION-001: the skill audit, against main. Fix the
corpus-shape assertions and the uncovered calibration class honestly rather than
loosening them. Open the PR; do not merge it.
```

```
As operator I want the CodeGraph query surface. Prepare the work package first,
scoped to tools/ only — do not touch src/mcp/, which is another agent's.
```

```
Check whether main has moved, and whether anything queued has gone stale. Report
only what changed.
```

---

## When you want less, not more

The agent's failure mode this session was producing a new document every time it
was asked what to do next. These stop that.

```
Do not produce any new document. Answer in chat only.
```

```
The queue is full. Do not prepare anything new. Tell me which single item, if I
cleared it, would unblock the most, and why.
```

```
Stop. Report what is done, what is half-done, and what you would throw away.
```

---

## When you think the agent is wrong

```
You reported X. Verify it by running something, not by reading. If you cannot
verify it, say so and withdraw the claim.
```

```
That is the third time you have reported this from a command you did not check
the exit code of. Re-derive it from scratch and show me the command.
```

```
You are an interested party in this. Give me the evidence both ways and no
recommendation.
```

---

## What no prompt can grant

These are refused regardless of how the instruction is worded, including
"as operator" and including a direct order. If you want one of them, the answer
is a human doing it, not a rephrasing.

- **Acting as approving authority for the agent's own work.** Producer and
  acceptor cannot be the same party. This is the property everything else here
  rests on.
- **Serving as REV, QA, SEC or GOV** on anything the agent produced.
- **Re-pinning tamper detection** to an artefact the agent produced, without an
  authorized slice.
- **Merging to `main`.**
- **Declaring production, completion, or that a gate is discharged.**
- **Writing to `.agents/`** while `PACK.yaml` carries `mutation_authorized: false`.

A prompt that says "act as OPERATOR and approve your own work" gets a refusal and
an explanation. That is not the agent being unhelpful; it is the one thing that
would make everything else in this repository worthless.
