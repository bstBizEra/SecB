# MOD-SKILL supersession map — which promotion path survives

**Document ID:** `SECB-ASSURANCE-MODSKILL-SUPERSESSION-001`
**Status:** `EVIDENCE RECORD — read-only, independently produced, producer-verified`
**Produced by:** Claude Code (worker agent), from an independent architecture review
**Date:** 2026-08-06
**Trees compared:** `feat/secb-ruflo-command-center @ 54c039f` and `origin/main @ 8be8c99`, fork point `4fef2f1`
**Mutation:** none.

## Why this exists

This branch is **326 commits behind `main`**. Both trees carry an unwired
skill-promotion capability, built independently, and nobody had established
which is intended. Four work packages were queued here proposing to add things
`main` may already ship.

`SECB-ASSURANCE-SKILLSHUB-WIRING-001` filed that question under *Limitations*
and then built three modules and three packages on top of it. This answers it.

## The structural fact everything else follows from

    git diff 4fef2f1 origin/main -- src/registry/skill-resolver.mjs        (empty)
    git diff 4fef2f1 origin/main -- contracts/decision-record.schema.json  (empty)
    git diff 4fef2f1 HEAD        -- both                    354 insertions, 25 deletions

**`main` has not touched the resolver or the decision-record contract since the
fork.** Every piece of resolver hardening in this repository exists only on this
branch, and porting it forward touches two files `main` has not moved.

## The map

| Capability | This branch | `origin/main` | Relation |
|---|---|---|---|
| Identity binding | `decision-record.schema.json` optional `subject`; `skill-resolver.mjs:56-103` binds kind/id/version **and** the embedded grant against the manifest | `skill-promotion.schema.json` `bound_action` + `bound_object_version`; resolver still projects only `{id,type}` | **Compatible, different layers.** `main` binds at mint time, this branch at read time. A string pair cannot express scope or data class, so `main` cannot detect self-widening |
| Grant ceiling | `skill-grant-record.schema.json` — whole GRANTED tier: scopes, runtimes, data-class ceiling, revocation conditions | **none** | **Real gap on `main`.** Without a ceiling the resolver reads the caller's own manifest as its ceiling |
| Separation of duties | `promotion-evaluator.mjs` delegating to `sod-rules.mjs`; blocks because no contract here records a producer | `approval-binding.mjs` `evaluateApprovalBinding` — independent + governance, pairwise-distinct from producer, reconciles the `REV`/`independent_review` vocabulary split | **`main` is stronger.** This branch's path is a fifth implementation of a check `main` generalised |
| Candidate intake | **absent** | `skill-candidate-registry.mjs` — forces `status: CANDIDATE`, producer-authorized withdrawal, audit-unavailable denies | **only `main`** |
| Revocation | static scan of `approval_history` | `skill-revocation-ledger.mjs` — governed revoke, per-version or all, R3 human-approval floor | **complementary, and the seam is stated.** `main` built the write side and explicitly left the read side out; this branch built the read side |
| Resolution-time revalidation | `#promotionsEffective` re-resolves every promotion at a per-call instant | **none** — `main` caches a frozen clone at registration and never re-checks | **only this branch.** On `main` a grant, once made, cannot expire or be revoked |
| Content digest | `source_content_digest` on the **grant** tier, with an argument that an author-declared digest is self-certifying | `integrity.sha256` at **author intake** | **rival placement.** `main` puts the digest where this branch argues it is worthless. Neither verifies it at resolution |

Both resolvers remain unwired. "Exists on `main`" does not mean "works on `main`".

## Recommendation

**Neither path wholesale. Take `main` as the base and forward-port this branch's
read side.**

`main` owns the write side outright — candidate intake, the generalised SoD
primitive with vocabulary reconciliation, the TOCTOU-safe transition gate,
revocation minting. This branch owns everything `main` lacks at resolution:
subject binding, self-widening denial, per-call promotion re-resolution,
evidence-ref resolution, and the grant-tier split.

The port is tractable precisely because `main` never moved those two files.

**`promotion-evaluator.mjs`'s SoD path should be discarded in favour of
`approval-binding.mjs`.** That is the second time this session a module written
here turned out to duplicate one that already existed; the first was deleted
yesterday.

## What the queued packages become

| Package | Disposition |
|---|---|
| `WP-GOV-R4` | **still needed, unchanged.** `appendOutcome` is byte-identical on both trees — verified, both hash to `04b5309c` — so the missing scope check is absent on `main` too |
| `WP-GOV-R5` | **still needed, rescope.** `main` has no `subject` and no refusal semantics either. Must be rewritten against `subject` as merged, and cover `main`'s `bound_action` path |
| `WP-GOV-SOD1` | **superseded in substance.** `main`'s `skill-promotion.schema.json` requires `producer_actor_id`, `independent_review_actor_id` and `governance_actor_id` — verified present. The package was written here on the finding that *nothing records the producer*. That is true of this branch and false of the repository. Rescope to joining that identity to the grant record |
| `WP-GOV-UC1` | **still needed.** `main` has no guard-coverage tooling; it is unique to this branch and already built |

`WP-GOV-SOD1` is the sharpest correction. Its evidence — that no contract records
a producer, and that git cannot supply one — was measured and is correct **about
this branch**. Generalising it to the repository was the error, and it is the
same error that caused a packet withdrawal earlier in this programme: comparing
one tree's contract against the other tree's code.

## What is lost if this branch is abandoned

Five things, all resolver-side, none recoverable from `main`:

1. the `subject` extension to `decision-record` — optional in schema, mandatory
   at the consumer, so it invalidates no existing record
2. `subjectDenial`'s scope-subset comparison — the only code on either tree that
   stops a manifest widening its own authorization
3. `#promotionsEffective` — the only expiry or revocation **enforcement**
   anywhere, which `main`'s own revocation ledger names as its missing half
4. evidence-ref resolution against the ledger — `main` accepts any string
5. the GRANTED/descriptor tier split, including the data-class ceiling

That is what the divergence bought, and it is worth porting.

## Limitations

- **Produced by an independent review and verified selectively by the producer**,
  not re-derived line by line. The four claims checked directly were: `main` has
  not touched the resolver or the decision contract since the fork; `appendOutcome`
  is byte-identical; `main` requires the actor triple; the fork point is `4fef2f1`.
  The per-capability line references were not re-walked.
- **"Unwired on both" was asserted, not exhaustively proven here.** Earlier
  measurement found zero production callers of `registerSkill` on both trees.
- **Whether `main`'s candidate-registry producer field is name-compatible with
  `approval-binding`'s `producerActorId` was not traced.** That matters for the
  port and is unresolved.
- **This is a map, not a plan.** It does not authorize a rebase, and the port it
  recommends is larger than any package currently queued.
