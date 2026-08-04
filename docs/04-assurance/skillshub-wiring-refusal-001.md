# Why SkillsHub should not be wired yet, and the two defects found asking

**Document ID:** `SECB-ASSURANCE-SKILLSHUB-WIRING-001`
**Status:** `EVIDENCE RECORD — read-only; adversarial review commissioned, producer-verified`
**Produced by:** Claude Code (worker agent), producer of most of SkillsHub
**Date:** 2026-08-05
**Baseline:** `feat/secb-ruflo-command-center @ 2d72f18`
**Mutation:** none. Nothing was wired. No tracked file outside this document changed.

## The question

Two lines are all that stand between SkillsHub and working:

    tools/secb-skills.mjs:27              new SkillResolver({ decisionLookup: () => null })
    tools/secb-mcp-server-wiring.mjs:210  new SkillResolver({ decisionLookup: () => null })

Neither passes `evidenceLookup`, and nothing calls `SkillResolver.registerSkill`.
The producer was about to write a work package to bind real ledgers and add the
missing caller. An adversarial review was commissioned first, with an explicit
instruction to assume the producer is over-confident.

**The answer is: not yet.** Two defects found, one of them new and serious.

## `DEF-R5` — the resolver never reads what the decision decided

    occurrences of ".outcome" in src/registry/skill-resolver.mjs   0
    "decision.outcome" anywhere in src/                            none

The resolver checks that a promotion's decision exists, that its id matches, that
its `decision_type` is `GOVERNANCE`, and — since `DEF-R1` — that its `subject`
names this skill and grants what the manifest claims.

**It never reads `outcome`.** A decision recording

    outcome:   "REJECTED"
    rationale: "Do NOT promote: failed security review"

authorizes the promotion, provided its subject matches. The record says no; the
resolver reads only that a governance decision *exists* about this skill.

This is `DEF-R1`'s sibling and it was not on the register. `DEF-R1` asked
*"which skill does this decision authorize"*. **`DEF-R5` asks whether it
authorizes anything at all**, and nothing answers it.

It is not exploitable today — nothing mints decisions and nothing registers
skills — which is exactly why it is cheap to close now and expensive after
wiring.

## `DEF-R6` — an empty grant throws instead of denying

    src/registry/skill-resolver.mjs:64
      const grant = subject.grant;
      if (!grant) return "DENY_SUBJECT_MISMATCH";
      if (!manifest.project_scopes.every((s) => grant.project_scopes.includes(s))) ...

`{}` is truthy, so `grant: {}` passes the guard and then dereferences
`grant.project_scopes.includes` on `undefined`. The caller gets a raw
`TypeError` out of `registerSkill` rather than a typed denial.

Fail-closed by accident rather than by design: the registration does fail, but
through an untyped throw that no caller can distinguish from a bug, and that no
deny-code tally can count.

## A claim from the review that does NOT hold

The review called this its strongest unnamed attack: that `projectId` is
caller-asserted at `src/mcp/secb-mcp-server.mjs:515`, so a caller reads another
project's skills by naming it, making `DEF-R1`'s scope axis decorative.

**Checked, and there is a guard**, at the same file, lines 468-472:

    if ((name === "secb_skill_resolve" || name === "secb_skill_hub_search") &&
        (!Array.isArray(caller.identity.project_scopes) ||
         !caller.identity.project_scopes.includes(args.project_id))) {
      return auditAndReturn("DENY_CALLER_PROJECT_SCOPE", ...)
    }

A caller may assert only a project it is already scoped for. The attack does not
work through the MCP path.

Recorded because the producer has spent this week propagating its own unverified
claims, and adopting a reviewer's unverified claim would be the same failure with
better manners. **What the review got right, it got right by running probes; this
one it did not run.** Whether the CLI path — which has no caller identity at all
— is equally guarded was not determined here.

## What must close before any wiring

In order, each with the failure it prevents:

1. **`DEF-R5`** — otherwise a rejection record functions as a grant.
2. **`DEF-R6`** — otherwise a malformed grant is a crash, not a denial.
3. **Evidence must be re-checked at resolution, not only at registration.**
   `DEF-R2` fixed decision permanence; the review reports the same permanence
   survives on the evidence axis — retract the evidence after registration and
   resolution still allows. The producer did not independently verify this and
   marks it unconfirmed.
4. **Separation of duties has no mechanism on this branch.** Nothing
   distinguishes the actor that authors a skill from the actor that appends its
   promotion decision. `main`'s `skill-promotion.schema.json` requires
   `producer_actor_id`, `independent_review_actor_id` and
   `governance_actor_id`; this branch has no equivalent. **This is the largest
   gap and it is a design gap, not a bug.**
5. **The corpus walker must not be added in the same change as the trust root.**
   `tests/skill-contract-split.test.mjs:280` asserts no production caller of
   `registerSkill` exists. That assertion is a control; retiring it should be a
   deliberate, separate, reviewed act — and `registerSkill` occupies the
   `skill_id@version` key on a first-come basis, so a squatting package
   registered first denies the genuine one by `DENY_DUPLICATE_SKILL`.

## Recommendation

**Do not wire. The producer withdraws its own proposal to write the wiring
package.**

`WP-SK-VS-01` was withdrawn earlier for exactly this shape of reason — wiring
would have switched on the capability and a master-key defect in one commit.
`DEF-R1` is now closed on this branch, verified independently by the reviewer
against the live resolver rather than read from the register. **That removed one
hazard and revealed two more underneath it.**

The honest next steps are `DEF-R5` and `DEF-R6`, which are small, and then the
separation-of-duties question, which is not.

## Addendum, 2026-08-05 — reproduced. `DEF-R5` confirmed, `DEF-R6` refuted, and `DEF-R5` is bigger than described

Both defects above were confirmed by reading, which this record flagged as below
standard. Reproduced by running, in a temp directory, with controls first:

    CONTROL a correct promotion                    -> ALLOW
    CONTROL a subject naming another skill         -> DENY_SUBJECT_MISMATCH

    outcome REJECTED, subject matches              -> ALLOW
    outcome REVOKE_SKILL, subject matches          -> ALLOW
    outcome DENY, subject matches                  -> ALLOW

    grant is {}                                    -> DENY_CONTRACT_INVALID

**`DEF-R5` is real.** A decision whose recorded outcome is `REJECTED`,
`REVOKE_SKILL` or `DENY` authorizes the promotion. The controls prove the
harness can both allow and deny, so those three ALLOWs are the resolver's
answer and not a broken probe.

**`DEF-R6` is refuted.** `grant: {}` returns `DENY_CONTRACT_INVALID`, a typed
denial, not a `TypeError`. `contracts/decision-record.schema.json` requires
`project_scopes`, `supported_runtimes` and `max_data_classification` inside
`grant`, so an empty grant is refused at contract validation and never reaches
`subjectDenial`. **The reviewer read the resolver in isolation and missed that
the contract validates first, and the producer recorded it on the strength of
that reading.** Both errors are the same one.

### `DEF-R5` cannot be fixed at the resolver

The obvious patch — require `outcome === "PROMOTE_SKILL"` — does not work:

    contracts/decision-record.schema.json
      outcome              { "type": "string", "minLength": 1 }    free text, no enum
      subject.allOf[0]     if kind == SKILL_VERSION
                           then required: ["version", "grant"]

`outcome` is an unconstrained string, so the resolver has no vocabulary to check
against; the only value in the repository's fixtures is `ACCEPT`, while the
walking skeleton used `PROMOTE_SKILL`.

And the deeper problem: **the contract makes `grant` mandatory for every
skill-version subject.** A decision that names a skill version cannot be written
without also granting it. *"We considered this skill and refused it"* is not
expressible.

So `DEF-R5` is not a missing `if` in the resolver. **It is a contract that can
only say yes**, and the resolver faithfully implements a contract in which
refusal has no representation. Closing it is a contract change with a migration
question, in the same family as `WP-SK-R1` and larger.

That reframing raises the cost and does not change the conclusion: **still do
not wire.** It moves `DEF-R5` from "small, do it first" to "the second design
gap alongside separation of duties", and both now sit ahead of any wiring.

## Limitations

- **`DEF-R5` and `DEF-R6` were confirmed by reading the code, not by a running
  reproduction.** The producer's usual standard is a run, and this record does
  not meet it. Both should be reproduced before either is scheduled.
- **The evidence-permanence finding is second-hand** and is marked as such above.
- **Whether `main`'s `MOD-SKILL` S1/S2 supersedes this resolver entirely** is an
  open governance question the reviewer also flagged, and it may make all of the
  above moot.
- **The producer is the party whose proposal is being refused here.** That
  direction of interest is unusual and probably makes this record more reliable
  than its predecessors, not less — but it is still the producer writing it.
