# SkillsHub, reassessed by someone who did not build it

**Document ID:** `SECB-ASSURANCE-SKILLSHUB-REASSESS-001`
**Status:** `EVIDENCE RECORD — read-only, independently prompted, producer-verified`
**Produced by:** Claude Code (worker agent), producer of most of SkillsHub
**Date:** 2026-08-05
**Mutation:** none. No tracked file outside this document was changed; no branch, ref or pull request was touched.

## Why this exists

The producer had just been wrong three times on one question, each time by
building a careful measurement on an unexamined assumption. An independent
assessment of SkillsHub was commissioned with an explicit instruction not to
start from the producer's framing. It found a fourth instance of the same shape,
and this time it invalidates a decision that was already acted on.

Every number below was re-run by the producer after the assessment, not taken
from it.

## The finding: `main` does not carry the `DEF-R1` fix

`DEF-R1` is the defect where a governance decision cannot name what it
authorizes, so one legitimate promotion becomes a master key for every skill.
The producer closed it on this branch, then **withdrew the architecture packet on
the belief that `main` had solved it independently and better**.

    contracts/decision-record.schema.json — occurrences of "subject"
      origin/main    0
      this branch    1

    src/registry/skill-resolver.mjs — occurrences of DENY_SUBJECT_MISMATCH
      origin/main    0
      this branch    7

**The resolver that would actually run on `main` has no subject binding at all.**

### What `main` does have, and why it was mistaken for the fix

`main` carries `contracts/skill-promotion.schema.json` with `bound_action` and
`bound_object_version` — genuinely a structural closure of the same defect
class, and the producer's earlier description of it was accurate.

    src/ledger/skill-promotion-ledger.mjs on main —
      references to skill-resolver or registerSkill    0

**It is a primitive with no consumer.** The contract closes `DEF-R1` for a
promotion path that nothing calls, while the resolver on the same branch remains
unbound. The producer compared a contract on `main` against a resolver on this
branch and concluded `main` was ahead.

## A correction to the assessment, in `main`'s favour

The independent assessment concluded *"main is the vulnerable branch, not this
one."* **That overstates it**, and the producer checked rather than repeating it:

    tools/secb-mcp-server-wiring.mjs on main:225
      new SkillResolver({ decisionLookup: () => null })

`main`'s resolver is wired to a null trust root exactly as this branch's is.
**Neither branch has a live resolver, so nothing is exploitable on either
today.** The accurate statement is narrower: if either branch is ever wired,
`main`'s resolver is the one without the fix.

## Why nothing resolves, on either branch

Three independent blockers, each sufficient on its own:

    callers of SkillResolver.registerSkill in src/ or tools/
      this branch  0     main  0

The one match on this branch is `skills-hub-service.mjs:288`, which is the hub's
**own** `registerSkill` method for building synthetic fixtures — not a caller of
the resolver.

    tools/secb-skills.mjs:27              decisionLookup: () => null
    tools/secb-mcp-server-wiring.mjs:210  decisionLookup: () => null
    neither wiring passes evidenceLookup at all

So even with a registered skill, every `PUBLISHED` manifest would be refused
`DENY_UNAPPROVED_PUBLICATION`, and evidence resolution would refuse before that.

    node tools/secb-skills.mjs search ""
    → 0 authorized skill(s); withheld 25
      DENY_UNGOVERNED_PACKAGE 3, DENY_UNKNOWN_SKILL 22

`DENY_UNKNOWN_SKILL: 22` is the registry being empty. It is not a policy
outcome.

**The producer's published position — that `0 of 25` is "a statement about where
the promotion path lives rather than about a defect" — is false.** No wired
promotion path exists on either branch. The sentence attributed to `main` a
capability that `main` does not have.

## A second corpus nobody has ruled on

    src/skills/skills-hub-service.mjs:337
      fullPath = resolve(process.cwd(), "..", "ruflo", ".agents", "skills");

    packages in that directory: 134

Every count in every SkillsHub record — 25 packages, 22 governed, 3 ungoverned —
assumes the local corpus. **Which corpus is production-intended is undocumented
and untested**, and a fallback that silently changes the corpus by a factor of
five is a finding in its own right. The producer had never looked at this line.

## What follows

Not authority, and the producer is the party whose withdrawal is being
questioned.

1. **The withdrawal of the `DEF-R1` architecture packet rests on a false
   premise** and should be revisited by someone other than the producer. The
   only working resolver-level fix in this repository is on this branch.
2. **Carrying `DEF-R1`/`DEF-R2`/`DEF-R3` to `main` is worth considering**, not
   because `main` is exploitable — it is not — but because it is the branch that
   would be, and it is the one that gets wired first.
3. **The null trust roots are the actual ceiling.** Two lines in two files, plus
   one caller that walks the corpus into `registerSkill`. That is a wiring
   change with real authority consequences and needs its own package; it is not
   a cleanup.
4. **Rule on the corpus fallback** before any count in any SkillsHub record is
   relied on again.
5. `WP-GOV-R4` is correctly scoped but is the smallest item here, not the
   largest.

## Limitations

- **Read-only.** Nothing was wired, and no claim here is a claim that wiring is
  safe.
- **The producer verified the assessment's numbers and disputed one of its
  conclusions.** It did not re-derive the assessment's reasoning from scratch,
  and a third reader may find both of us wrong.
- **Whether the operator's fail-closed REV ruling of 2026-08-03 procedurally
  bars re-opening the withdrawn packets is a governance question**, unanswered
  here and not the producer's to answer.
- **The 134-package corpus was counted, not examined.** Whether those packages
  are governed, or what the fallback is for, is unknown.
