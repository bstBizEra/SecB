# The missing step in SkillsHub is a composition, and it is two fields short

**Document ID:** `SECB-ASSURANCE-SKILLSHUB-COMPOSITION-001`
**Status:** `EVIDENCE RECORD — read-only, produced by running`
**Produced by:** Claude Code (worker agent)
**Date:** 2026-08-05
**Baseline:** `feat/secb-ruflo-command-center @ 2b8aa95`
**Mutation:** none.

## Why this exists

Every SkillsHub record so far describes what is missing negatively: nothing calls
`registerSkill`, the trust roots are null, the corpus manifests do not satisfy
`skillManifest`. `SECB-ASSURANCE-SKILLSHUB-WIRING-001` refused to write the
wiring package on that basis.

None of them said what the missing step **is**. It turns out to be a
composition, and the contracts already decompose almost exactly along it.

## Measured

`skillManifest` requires 13 fields. Where each one comes from:

    skill_id                 grant
    version                  grant
    name                     descriptor  (display_name / package_name)
    status                   grant
    owner                    NEITHER
    source                   NEITHER
    purpose                  descriptor
    supported_runtimes       grant
    project_scopes           grant
    max_data_classification  grant
    evidence_refs            grant
    approval_history         grant
    revocation_conditions    grant

    covered: 11 of 13.  unaccounted: owner, source

`descriptor` is `contracts/skill-package-descriptor.schema.json` — the author
side. `grant` is `contracts/skill-grant-record.schema.json` — the governance
side. Both exist and both are governed contracts today.

**The trust-tier split under `ADR-0013` already cut `skillManifest` along the
line the promotion path needs.** That was not its stated purpose, and nobody
noticed it composes.

## The author cannot supply the grant, and does not

`src/skills/package-descriptor-mapper.mjs:92` refuses five fields outright:

    for (const granted of ["project_scopes", "supported_runtimes",
                           "max_data_classification", "status", "evidence_refs", ...])
      findings.push(`manifest declares "${granted}", which is a grant and
                     cannot be author-supplied - ignored`)

Measured against the one skill package currently going through a REV/QA/SEC
evidence chain, `architecture-decision-record` in PR #140:

    fields skillManifest requires that its manifest.yaml supplies:  4 of 13
      skill_id, version, name, status

The other nine are absent, and five of those nine are absent **because the
mapper would refuse them**. The on-disk package is not a deficient manifest. It
is the author half of a manifest, and it is complete as that.

## What `subject.grant` already carries

`contracts/decision-record.schema.json` — added by `WP-SK-R1` to close `DEF-R1`:

    subject.grant.required = [project_scopes, supported_runtimes, max_data_classification]

Those are three of the seven grant-side fields, and they are the three that
decide what a skill may reach. The `DEF-R1` fix was written to stop one decision
authorizing every skill. **It also supplied, without intending to, the exact
fields a promotion would need to mint.**

## What this changes

Not the refusal. `SECB-ASSURANCE-SKILLSHUB-WIRING-001` still stands: `DEF-R5`
means a decision cannot refuse, and this branch has no separation-of-duties
mechanism. Both sit ahead of any wiring and neither is addressed here.

What changes is the **size and shape** of the eventual package. It is not
"invent a promotion path". It is:

1. `descriptor ⊕ grant → skillManifest`, a composition over two existing
   governed contracts, 11 of 13 fields mechanical;
2. a rule for `owner` — a governance assignment, not derivable;
3. a rule for `source` — `repository`, `commit_sha` and `licence`, all
   derivable from git at promotion time, which is the honest place to derive
   them because it binds the manifest to the bytes promoted.

Two fields, one of which is mechanical. That is a specification, and the
previous records could not have produced one because they were all looking for
what was broken rather than what the pieces were.

## What this does not establish

- **That composing them is safe.** It is a shape, not a safety argument.
  `DEF-R5` and separation of duties are unaffected.
- **That `owner` and `source` are the only gaps.** The count is over REQUIRED
  fields. Optional fields, and whether values that typecheck are also correct,
  were not examined.
- **That the mapper's refusal list is complete.** Five fields were read from one
  loop; whether every grant-bearing field is covered was not checked.
- **That any of this is reachable.** Nothing calls `registerSkill`, and this
  record adds no caller.

## Limitations

- Field provenance was computed by set membership over the three schemas'
  `required` arrays, with one alias (`name` ← `display_name`/`package_name`).
  A field present under a different name in a nested object would read as
  unaccounted.
- Measured against `feat/secb-ruflo-command-center`. `main` has a different
  `skill-promotion.schema.json` with an actor triple, and whether that path
  composes the same way was not examined.
