# ADR-0013 - Skill manifest convergence by trust tier

## Document control

| Field | Value |
|---|---|
| ADR ID | `ADR-0013` |
| Version | `0.1.0-draft` |
| Status | `ACCEPTED - DRAFT / NOT EFFECTIVE` |
| Owner | SecB Architecture Authority - operator acting as ARCHI |
| Producer | Claude Code worker session, prepared from an independent options analysis |
| Produced at | 2026-08-01 |
| Project / work | `SECB-PRD-SKILLSHUB-001` / `WP-SK-01` |
| Repository baseline | `9924ae0` on `feat/secb-ruflo-command-center` |
| Baseline condition | Tracked tree clean at time of decision |
| Risk | Candidate `R3` - skill identity, authorization scope, and distribution ceilings are affected |
| Decides | `OD-SK-01`, `OD-SK-02`, `OD-SK-09` |
| Depends on | `SECB-SEC-DECISION-SKILLSHUB-C3-001`, ruled `B` on 2026-08-01 |

## Authority boundary

This ADR selects a target contract shape. It does not create a contract, migrate
a package, register a skill, mint a promotion, populate the resolver registry,
or authorize any mutation. `WP-SK-01` carries the mutation authority; this
document carries only the design decision it implements.

---

## Context

Four descriptions of a skill manifest exist, and they disagree.

| # | Artifact | Enforced? |
|---|---|---|
| 1 | `contracts/skill-manifest.schema.json` - 13 required fields, uppercase status enum | **Yes** - `validateContract` in the resolver, plus a required-set pin in `npm run validate` |
| 2 | `.agents/schemas/skill-manifest.schema.json` - 10 required fields, lowercase 9-value status enum | **No** - `validate_pack.py` imports no validator and checks three unrelated fields |
| 3 | `docs/templates/skill-manifest.yaml` - 21 fields nested under `skill:` | No - used by 0 of 25 packages |
| 4 | The `secb_skill_resolve` argument shape | Implicitly, by the tool catalog |

Verified consequences at baseline:

- the two closed schemas' required-field sets intersect in only `skill_id`,
  `name`, `version`, `status`;
- **zero of 22 on-disk manifests validate against the governed contract**, and
  they fail on a *shared* field - all 22 carry lowercase `status: candidate`;
- the governed contract mixes two trust tiers in one object: `owner`, `source`,
  `purpose` are authored, while `project_scopes`, `supported_runtimes`,
  `max_data_classification`, `evidence_refs` and `approval_history` are grants;
- `SkillResolver.resolveSkill` reads `project_scopes`, `supported_runtimes` and
  `max_data_classification` **straight from the manifest it was handed** as the
  authorization ceiling - unlike `approval_history`, which is checked against the
  DecisionLedger. Whoever registers a skill sets its own scope (`DEF-A5`);
- the hub's identity binding requires the resolved manifest's `name` to equal the
  package directory, but the governed contract types `name` as free text. Only
  the *unenforced* schema encodes the constraint the running authorization path
  depends on (`DEF-A4`).

## Decision

**Split the skill manifest into two contracts, distinguished by who may write
each field.**

| Contract | Written by | Carries |
|---|---|---|
| `skill-package-descriptor` | the package author | `skill_id`, `package_name`, `display_name`, `version`, `owner`, `source{repository,commit_sha,licence}`, `purpose`, `risk_class`, `roles`, `inputs`, `outputs`, `controls`, `input_schema`, `output_schema`, `required_models`, `required_tools`, `required_mcp_methods`, `tests`, `evaluations`, `known_limitations` |
| `skill-grant-record` | the promotion service only | `status`, `project_scopes`, `supported_runtimes`, `max_data_classification`, `evidence_refs`, `approval_history`, `revocation_conditions` |

Joined on `skill_id@version`.

Four consequential sub-decisions:

1. **`name` splits into `package_name` and `display_name`.** `package_name` is
   patterned `^[a-z0-9-]{1,64}$`, must equal the package directory, and is the
   identity binding key. `display_name` is free text. One field is currently
   serving as both a human label and an authorization join key (`DEF-A4`).
2. **`mutation_class` is dropped from the skill manifest.** It is redundant with
   `controls.repository_mutation`, and it declares six values while admitting and
   observing exactly one - an axis with a single observed value is not
   load-bearing.
3. **`authority_ceiling` on a skill is a cap, not a grant.** `effective =
   min(agent_ceiling, skill_ceiling)`, written once in the resolver. The field is
   currently defined in two contracts over the identical `A0`-`A5` enum with no
   composition rule stated anywhere (`DEF-A7`).
4. **`max_data_classification` stays on the skill side as an invocation
   control.** Per the `DEF-C3` ruling, skill content carries no independent
   sensitivity, so no `content_classification` field is introduced. The call site
   that passes the caller's clearance as a requested data class is corrected
   separately.

The pack schema (`.agents/schemas/skill-manifest.schema.json`) is **absorbed**,
not retired: nine of its ten required fields land in the authored tier, and it is
the only artifact that currently encodes the `package_name` pattern. Its status
enum does not survive; the governed vocabulary does.

`approved_skills` on `contracts/agent-registration.schema.json` is **declared
inert** pending re-keying to `skill_id@version` and derivation from the ledger.
It is read by no code today. It currently holds three package-name-shaped values
that exist in no package, carries no version dimension, and is populated from
hard-coded constants in producer-authored source - so wiring it up as it stands
would relocate the promotion gate into a source file.

## Rationale

Three options were analysed and rejected.

**Flatten onto the governed contract unchanged.** Cheapest, no contract version -
but six of the nine fields the 22 packages would have to gain are *grants* that
intake is forbidden to fabricate. Migration could not complete until a promotion
pipeline that does not yet exist is built. It also silently discards
`risk_class`, `roles`, `controls` and `evaluation` - the corpus's only
machine-readable safety properties.

**Extend the governed contract with the template's richer fields.** Pays most of
the cost of the chosen option and delivers none of its structural guarantee: the
contract grows from 13 fields spanning two trust tiers to 21 fields spanning two
trust tiers. It would also encode `OD-SK-10` before it is answered.

**Keep the pack schema as a subordinate pre-check.** The only option under which
the corpus stays valid against something throughout the transition - but
subordination is a property of process discipline, not of the artifacts, and
nothing can mechanically detect drift between them. Process discipline is
precisely what produced the present four-way divergence.

**Why the trust-tier split wins.** The rule "grants must not be populated from
package content" stops being an obligation the promotion service has to remember
and becomes a property of the schema: a descriptor has no `project_scopes`
property to populate, and `additionalProperties: false` rejects one if smuggled
in. `DEF-A5` shows that obligation is currently unbacked in the one place it will
matter first. It is also the only option under which the 22 packages can migrate
**now** - every field it asks an author for is a field the author actually holds.

## Consequences

**Accepted costs.** Two contracts instead of one; a join; one contract version
with migration tests; `tools/validate-foundation.mjs`'s pinned required set and
schema allowlist must be updated - deliberately, since that pin is a fail-closed
control working as designed. Test fixtures regenerate.

**Foreclosed.** An enveloped or nested contract shape becomes awkward, since the
join key wants to be flat. `skill_id@version` is committed to as the join
namespace.

**Unresolved and explicitly carried forward.** `OD-SK-10` - whether declared
`required_tools`/`required_mcp_methods` bound the grants a promotion may issue,
or are advisory - is **not** decided here. `FR-SKM-003b` in the PRD asserts the
first horn as a MUST and must be softened to defer to `OD-SK-10` until ARCHI and
SEC rule (`DEF-B4`).

**Not addressed by this ADR.** Resolution-time digest verification (`DEF-B1`,
`DEF-C2`) remains open; the descriptor carries `source.commit_sha`, which makes
the eventual control expressible, but the control itself belongs to Phase 5.

## Status and required review

`ACCEPTED` by the operator acting as ARCHI, on the strength of an independent
options analysis. **Not effective**: this is a design decision on a
`DRAFT / NOT EFFECTIVE` documentation baseline, and it authorizes no mutation.
Independent `REV` and `SEC` review is owed on the contract that implements it,
per `docs/AGENTS.md`, before the resulting contracts are treated as governed.

The producer of this ADR has been independently found in error three times on
this programme. Every verified fact above cites its source so it can be
re-derived rather than trusted.
