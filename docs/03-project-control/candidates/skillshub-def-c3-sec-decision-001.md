# SEC Decision Request — Does skill content carry its own sensitivity?

**Document ID:** `SECB-SEC-DECISION-SKILLSHUB-C3-001`
**Status:** `RULED — Ruling B with conditions, 2026-08-01`
**Decision owner:** SEC (with ARCHI + GOV for any contract change that follows)
**Prepared by:** Claude Code (worker agent) — prepares the decision, does not make it
**Prepared at:** 2026-08-01, baseline `16bdc85`
**Blocks:** the manifest convergence ADR (`OD-SK-01`/`OD-SK-02`/`OD-SK-09`), and therefore the entire SkillsHub critical path

---

## The question

**Does a skill's content have a sensitivity of its own, separate from the data
class that skill is certified to operate on?**

One ruling. Everything downstream follows from it.

---

## Why this is first

`max_data_classification` is currently the only classification field on a skill.
Until it is settled what that field *means*, it cannot be assigned an owner —
and the convergence ADR is an assignment exercise. Deciding the contract shape
first would mean redoing it.

---

## What is verified, and not in dispute

**1. The classification leg is monotone-inverted for disclosure.** Reproduced
empirically, caller effective ceiling × skill `max_data_classification`:

```
caller\skill    PUBLIC       INTERNAL     CONFIDENTIAL  RESTRICTED
PUBLIC          ALLOW        ALLOW        ALLOW         ALLOW      4/4
INTERNAL        DENY         ALLOW        ALLOW         ALLOW      3/4
CONFIDENTIAL    DENY         DENY         ALLOW         ALLOW      2/4
RESTRICTED      DENY         DENY         DENY          ALLOW      1/4
```

**Lower clearance authorizes strictly more.**

**2. The resolver is not wrong.** It answers "may a skill certified to class X
be used for a task at class Y?" and denies when Y exceeds X. Its reason string
says exactly that. That is a coherent **invocation** control.

**3. The defect is at the call site.** `src/mcp/secb-mcp-server.mjs` substitutes
the caller's *clearance* for a *requested data class* the caller never supplies.
The same `ceiling` variable drives opposite disclosure directions ten lines
apart in one `switch`: at the events read it is reader clearance and withholds
content above it; at the skill resolve it is a requested class and withholds
skills below it.

**4. Consequence: the hub has no disclosure-side classification gate at all.**
Not a weak one — none.

**5. Skill bodies are served verbatim.** `SKILL.md` content is returned to the
caller as snippet and as full text. That prose can contain internal
architecture, threat models, incident runbooks, credential-handling procedure.
Its sensitivity is a property of the writing, independent of what data the skill
is certified to touch. A PUBLIC-data-only skill can carry a CONFIDENTIAL
runbook.

**6. Nothing currently models that.** `contracts/skill-manifest.schema.json` is
closed (`additionalProperties: false`) with exactly one classification field.

**7. It is latent, and the trigger is known.** Every resolution currently dies
at `DENY_UNKNOWN_SKILL` before reaching the classification leg, because both
production wirings construct the resolver with `decisionLookup: () => null` and
nothing calls `registerSkill`. **Populating the resolver registry is what makes
this live.**

---

## The two rulings available

### Ruling A — Skill content DOES carry independent sensitivity

*Consequence:* a second field is needed. The house pattern already exists and is
already in use on the same server — `classificationDecision(classification,
ceiling)` in `src/ui/report-projections.mjs`, which compares content class
against reader ceiling, fails closed on unknown values, and already gates the
events and evidence reads.

*Then:*
- add `content_classification` to the skill manifest contract, in `required` so
  it fails closed;
- gate skill disclosure with the existing `classificationDecision`;
- leave `max_data_classification` alone as the invocation control it already is;
- backfill 22 manifests — but note they already fail the contract on `status`
  case, so they are being touched regardless;
- correct the `secb_skill_hub_search` description, which currently reads as
  though the ceiling bounds disclosure.

*Cost:* one contract version, migration tests, a backfill. Contract change is
ARCHI + GOV, not SEC alone.

### Ruling B — Skill content does NOT carry independent sensitivity

*Consequence:* no new field. The call site is corrected so the ceiling stops
being passed as a requested data class, the descriptions are corrected, and the
hub ships with **no classification-based disclosure control** — deliberately.

*This is defensible* — skill packages are checked into the repository, so anyone
with repo read already has the content, and an MCP-only caller is the only
population the gate would protect against.

*But it must be ruled, not assumed.* If it is reached by silence, SecB ships a
governed skill registry with no disclosure classification and no record that
anyone decided so.

---

## What SEC is being asked to sign

- [ ] ~~**Ruling A**~~ — not taken
- [x] **Ruling B** — skill content does not carry independent sensitivity;
      recorded explicitly that the hub has no classification-based disclosure
      control **by decision**
- [x] **Blocking constraint applied** — the resolver registry is not to be
      populated until Phase 5 distribution hardening is complete. Population is
      the trigger event that makes the inversion live (`DEF-A8`).
- [x] **Description fix authorized** — correct the `secb_skill_hub_search`
      wording so it stops implying a disclosure semantic the code does not
      implement.

```
Ruling:            B - skill content does NOT carry independent sensitivity
Decided by:        Operator (BizEra), accepting the preparer's revised recommendation
Date:              2026-08-01
Registry gate:     [x] applied - do not populate the resolver registry until
                       Phase 5 distribution hardening is complete
Description fix:   [x] authorized - correct secb_skill_hub_search wording
```

### Conditions attached to Ruling B

1. It is recorded here that the SkillsHub ships with **no classification-based
   disclosure control, by decision** - not by omission.
2. The call-site defect is corrected regardless of this ruling: the caller's
   clearance stops being passed as a requested data class.
3. **Intake carries the trigger.** A reviewer must affirm at intake that a
   package's content does not exceed the corpus baseline established by this
   audit. The first package that exceeds it is the event that reopens this
   ruling and adds `content_classification`.

### Recorded limitation of this ruling

The operator accepted the recommendation without separately answering whether
SecB's own architecture methodology constitutes proprietary content. Ruling B
**assumes it does not.** If that assumption is wrong the ruling should be
revisited; it is recorded here so the assumption is visible rather than
buried.

---

## Recommendation — REVISED after auditing the corpus

**The preparer originally recommended Ruling A**, on the argument that skill
bodies are prose handed to the caller whose sensitivity is a different property
from the data class the skill may process. That recommendation carried a stated
caveat: it rested on skill bodies actually containing sensitive prose, and the
preparer had not audited the 22 packages.

**The audit was then run, and it went against the recommendation.**

Searched across all 22 `SKILL.md` bodies for credentials, internal paths,
hostnames, incident material and runbooks. Two files matched; **both are false
positives**:

| File | Match | What it actually is |
|---|---|---|
| `deployment-environment-architecture` | "secret references, credential leases" | Prose teaching how to *design* secret handling |
| `graphify` | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `localhost:11434` | A table of environment-variable *names* a tool reads, and Ollama's public default port |

**Zero of 22 carry sensitive content.** All are architecture methodology. Only 2
mention SecB at all, 12 times in total, across a 63 KB corpus.

**Revised recommendation: Ruling B with conditions.** The decisive argument is
one this programme has already made against itself: the register records that
`mutation_class` should be dropped because it declares six values, admits one,
and observes one — "an axis with a single observed value is not yet
load-bearing". A required `content_classification` that is uniformly one value
across the whole corpus would reproduce that defect exactly: governance surface
that adds obligation without adding discrimination.

**Where this revised recommendation could still be wrong:** the search used
patterns the preparer chose. If the operator judges SecB's *architecture
methodology itself* to be proprietary — a business-value question no pattern
search reaches — Ruling A is correct and this analysis does not touch it.

**Authority statement.** This document prepares a decision. It makes none,
approves nothing, and authorizes nothing. Its preparer has been independently
found in error three times on this programme and holds no verdict authority; the
verified facts above are cited so they can be re-derived rather than trusted.

**Evidence:** `SECB-PRD-SKILLSHUB-DEFECTS-001` §I and `DEF-C3`, `DEF-A8`.
