# ARCHI Decision Request — Does DEF-R1 precede or follow the ADR-0013 tier split?

**Document ID:** `SECB-ARCHI-DECISION-SKILLSHUB-R1-SEQ-002`
**Status:** `PREPARED — AWAITING RULING`
**Decision owner:** ARCHI
**Prepared by:** Claude Code (worker agent) — prepares the decision, does not make it
**Prepared at:** 2026-08-02, baseline `dcbabc4`; **re-verified at `b7d7f41`**
**Depends on:** `SECB-ARCHI-DECISION-SKILLSHUB-R1-001` (which binding mechanism). This
packet asks only about ORDER, and is answerable independently of which mechanism wins.
**Blocks:** `WP-SK-01` increment 2 scoping, and any replacement for the withdrawn
`WP-SK-VS-01`

---

## The question

**Does `DEF-R1` — the decision-to-object binding — come before or after the ADR-0013
trust-tier split?**

Both are open. Both are ARCHI's. They cannot both be first, and the register currently
implies an order that this packet argues is falsified.

---

## Status change during preparation — the register has now corrected itself

**Read this before the rest of the packet.** At `b7d7f41`, committed while this packet was
being written, the defect register added §N.3 and recorded the correction this packet was
prepared to argue for. `skillshub-prd-defect-register-001.md:396`:

> `DEF-A5` — **The sequencing claim is falsified.** […] A **subject-bound decision** — a
> decision record that names what it authorizes — binds `DEF-R1`'s authorization against
> the **current** `contracts/skill-manifest.schema.json`, with no tier split in place […]
> The tier split **without** subject binding does not do the reverse […] A service-written
> grant record therefore still has **no authoritative source for its values**. The
> precondition of the first promotion is the subject binding, not the tier split.

That is the same conclusion, reached independently by the register's own producer, and it
carries its own honesty note: *"(The falsifying direction is verified by schema and
resolver reading; that a subject-bound decision would be sufficient is reasoning from
those reads, not a probe.)"*

**What this changes.** This packet no longer *makes* the correction — it now asks ARCHI to
**ratify** a correction the register has already recorded against itself. That is a
smaller ask, and the preparer states it plainly rather than presenting settled ground as
contested. **What it does not change:** §N.3 is a producer's self-correction inside a
`DRAFT / NOT EFFECTIVE / OPEN` register. The ordering it implies still has no ruling
behind it, and `DEF-A5`'s original text at `:218` still stands unamended in the same
document. A register that contradicts itself in two sections is not a decision.

The verified analysis below is retained unchanged, so ARCHI can check the reasoning rather
than inherit two producers' agreement as if agreement were evidence.

---

## The claim under challenge, quoted accurately

The brief that produced this packet stated that the defect register claims **AC-05/AC-08**
are "a precondition of the first promotion". **That attribution is wrong, and the
preparer records the correction before making any argument on it.**

What the register actually says, at `skillshub-prd-defect-register-001.md:218`, under
`DEF-A5` — not under AC-05 or AC-08:

> **The resolver reads its own authorization ceiling from the manifest it was handed.**
> `project_scopes`, `supported_runtimes` and `max_data_classification` are taken from the
> registered manifest — unlike `approval_history`, which is checked against the
> DecisionLedger. Whoever registers a skill sets its own scope. Latent: `registerSkill`
> has no caller outside its own definition and tests. This makes the trust-tier separation
> a **precondition of the first promotion**, not a hygiene preference

The subject of the precondition claim is **the trust-tier separation** — the ADR-0013
split as a whole. The strings `AC-05` and `AC-08` do not appear in that entry; `AC-05`
appears nowhere in the register at all.

The correction cuts the other way too. Two work packages explicitly de-scope AC-05 and
AC-08 as **non-blockers**:

- `wp-sk-vs-01-first-resolvable-skill.work-package.yaml:69` — *"The contract tier split.
  AC-05, AC-08, risk_class re-tiering, the tier-separation control rewrite, and
  DEF-D8/DEF-D9 are findings pending ruling, NOT blockers for this slice."*
- `wp-sk-r2-resolution-time-authority.work-package.yaml:48` — *"The contract tier split,
  AC-05, AC-08, or any resolver migration onto the descriptor/grant pair."*

So the programme currently holds two positions at once: the tier separation is a
precondition of the first promotion (register), and AC-05/AC-08 are not blockers (two
work packages). Those are reconcilable — the separation is not identical to those two
acceptance criteria — but the reconciliation has never been written down, and the
ambiguity is itself part of what ARCHI is being asked to settle.

For completeness, ADR-0013 carries a third and *distinct* precondition claim at
`docs/adr/0013-skill-manifest-trust-tier-split.md:184-189`: that the promotion precondition
"exists as prose in a code comment and two schema `description` strings", and that
`WP-SK-05` "must make it machine-checkable before any promotion relies on it."

**Three different documents, three different objects called a precondition.** The
sequencing question cannot be answered until it is agreed which one is meant.

---

## What is verified, and not in dispute

**1. AC-05 and AC-08, quoted.** From
`wp-sk-01-manifest-convergence.work-package.yaml:124-126` and `:133-135`:

- **AC-05** — *"The hub's identity binding uses package_name and a package whose
  descriptor package_name differs from its directory is denied
  DENY_IDENTITY_MISMATCH."*
- **AC-08** — *"The resolver computes effective authority ceiling as min(agent, skill) and
  this is expressed in exactly one place."*

Neither is worded as a precondition of promotion.

**2. `DEF-A5` describes a real property of the current resolver.** At
`src/registry/skill-resolver.mjs:207` and `:213`, `project_scopes` and
`max_data_classification` are read straight off the registered manifest, while
`approval_history` is checked against the decision ledger at `:88-110` and `:128-148`.
The asymmetry `DEF-A5` names is present in the code.

**3. `DEF-R1` is open, and it is what withdrew the first-promotion work package.**
`wp-sk-vs-01-first-resolvable-skill.work-package.yaml:4` — `record_status:
"WITHDRAWN_BY_PRODUCER"`; `:34-36` — *"Nothing yet. A first-promotion work package needs
DEF-R1 closed first, which is a contract change and belongs to ARCHI."*

*Note on HEAD.* The commit message at `dcbabc4` reads "close AC-R2-04 and withdraw the
work package DEF-R1 falsified". That records DEF-R1 **falsifying a work package**. It does
not record DEF-R1 as closed. DEF-R1 remains open at CRITICAL.

**4. The registry is empty and nothing in production calls `registerSkill`.**
`wp-sk-01-manifest-convergence.work-package.yaml` AC-10: *"The resolver registry remains
empty and no production wiring calls registerSkill."* Both orderings are therefore
theoretical today; neither is blocked by live state.

---

## The two orderings available

### Ordering 1 — DEF-R1 first, tier split second

*Consequence:* DEF-R1 closes against the **current** `contracts/skill-manifest.schema.json`.
The binding is between a decision and a skill identity (`skill_id` + `version`), and
skill identity is the one thing the tier split does not move — it is the join key present
on both tiers (`skill-package-descriptor` and `skill-grant-record` share exactly
`skill_id` and `version`, asserted structurally at
`tools/validate-foundation.mjs`, `schema.tier-separation`).

So the DEF-R1 fix does not have to be redone after the split. It binds to the join key,
and the join key survives the split by construction.

*Cost:* `DEF-A5` stays open through the interval. Given AC-10 — an empty registry, no
production caller — the exposure during that interval is zero live surface.

### Ordering 2 — Tier split (AC-05/AC-08) first, DEF-R1 second

*Consequence:* the split moves `project_scopes`, `supported_runtimes` and
`max_data_classification` onto a grant record that only the promotion service writes.
That closes `DEF-A5`'s *authorship* problem: a package author can no longer supply their
own ceiling.

*What it does not close:* a service-written record still needs an authoritative **source**
for the values it writes. Moving a field from an author-supplied record to a
service-written one changes who types the value; it does not establish what the value is
supposed to be. The promotion service must derive `project_scopes` from something. Today
the only candidate is the authorizing decision — and per DEF-R1 the decision cannot name
the object it authorizes, so it cannot bound the scope of what it authorizes either.

`contracts/skill-grant-record.schema.json:113-117` is this exact pattern already visible
in the tree: the grant record requires `work_package_id` on every approval entry, with a
comment noting the prior version "asserted in prose while the schema left it optional - a
structural claim the structure did not make." Nothing compares that recorded value to the
referenced decision's own `work_package_id`. The tier split relocated the claim; it did
not ground it.

*Cost:* the DEF-R1 fix would then need to be designed against the post-split contracts,
and the grant record's derivation rule would need rewriting once DEF-R1 lands — the work
the register's "precondition" framing was trying to avoid, incurred in the other
direction.

---

## What ARCHI is being asked to sign

- [ ] **Ordering 1** — DEF-R1 first, tier split second
- [ ] **Ordering 2** — tier split first, DEF-R1 second

And, required either way:

- [ ] **The precondition claim is disambiguated.** Record which of the three objects
      `DEF-A5:218` (trust-tier separation), `AC-05`/`AC-08`, or ADR-0013:184-189
      (machine-checkable owner) is meant by "precondition of the first promotion", and
      correct the two documents that do not match.

```
Ordering:              [ blank — for ARCHI ]
Decided by:            [ blank ]
Date:                  [ blank ]
Precondition object:   [ blank ]
Register correction:   [ ] authorized   [ ] not authorized
```

---

## Recommendation

**Ordering 1 — DEF-R1 first.**

The argument is asymmetric-cost, not preference. DEF-R1 closed first closes against the
current `skill-manifest` contract and binds to `skill_id` + `version`, which the tier
split preserves as the join key. The fix survives the split. AC-05 first does not have
the mirror property: a service-written grant record still needs an authoritative source
for its values, and the only available source is the decision that DEF-R1 says cannot
name its object. Ordering 2 therefore performs work that Ordering 1 would have made
unnecessary, and leaves the harder problem for later.

**Where this recommendation could be wrong.** It assumes the DEF-R1 binding will be
keyed on skill identity. If ARCHI rules Option C or Option D in
`SECB-ARCHI-DECISION-SKILLSHUB-R1-001` — binding carried on the grant record, or in a
separate grant ledger — then the binding's home is a contract the tier split creates, and
Ordering 2 becomes the coherent one. **The two packets should be read together, and this
one should not be signed before that one.**

**Correction the preparer is obliged to record.** The attribution of the "precondition of
the first promotion" claim to AC-05/AC-08 is wrong; the register makes it of the
trust-tier separation under `DEF-A5`. This packet's argument is unchanged by the
correction, but the correction is to a claim the preparer's own brief carried, and it is
recorded rather than quietly fixed. Separately, the correction the packet *does* make is
to a claim the programme's own producer wrote into the register — the same producer whose
work this packet reviews.

**Authority statement.** This document prepares a decision. It makes none, approves
nothing, and authorizes nothing. Its preparer holds no verdict authority; the verified
facts above are cited so they can be re-derived rather than trusted.

**Evidence:** `SECB-PRD-SKILLSHUB-DEFECTS-001` `DEF-A5` (line 218), `DEF-R1` (line 289);
`docs/adr/0013-skill-manifest-trust-tier-split.md:184-189`;
`wp-sk-01-manifest-convergence.work-package.yaml:124-126, 133-135`, AC-10;
`wp-sk-vs-01-first-resolvable-skill.work-package.yaml:4, 34-36, 69`;
`wp-sk-r2-resolution-time-authority.work-package.yaml:48`;
`contracts/skill-grant-record.schema.json:113-117`;
`src/registry/skill-resolver.mjs:88-110, 128-148, 207, 213`.

```yaml
self_certification:
  agent_id: claude-immune
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
