# SecB Decision Sheet 001 — everything currently awaiting a signature

**Document ID:** `SECB-DECISION-SHEET-001`
**Status:** `PREPARED — AWAITING RULING`
**Prepared by:** Claude Code (worker agent). Prepares decisions, makes none.
**Prepared at:** 2026-08-03, baseline `05f0147`
**Purpose:** collapse five open decisions into one pass. Each line below is decidable on its own; you can sign all, some, or none.

> **Why this sheet exists.** Five separate records were prepared over this
> session, each correct in isolation and each requiring a full read. That is a
> reasonable way to *prepare* decisions and a poor way to *make* them. Every
> recommendation here is already argued in full in the linked record; this sheet
> carries the question, the recommendation, and the consequence of each choice —
> nothing that is not also in the source record.
>
> **The preparer cannot sign any of these.** That is not a formality: agents in
> this project may work but may not approve, and item 1 is a decision in which
> the preparer is a directly interested party.

---

## If you sign nothing

**Nothing breaks and nothing regresses.** Every item below currently sits
fail-closed, and fail-closed is the safe state for all five. Concretely:

- SkillsHub stays unusable — 0 of 25 skills consumable, which is already true today
- The `DEF-C3` registry gate stays standing, blocking an object that no longer exists
- The validator fix stays on an unpushed branch
- The audit stays unbuilt
- The doctrine question stays unresolved, and each reader continues to resolve it privately

**Signing is not urgent. Not signing is a choice with a known cost, stated
above.** The one item with a genuine deadline pressure is none of them.

---

## 1. Who may hold independent review for a skill promotion?

**Record:** [`skill-promotion-review-authority-gov-decision-001.md`](skill-promotion-review-authority-gov-decision-001.md) · **Owner:** GOV

`approval-binding.mjs` requires three pairwise-distinct actors — producer, REV,
GOV. Producer is settled (a registered agent instance). GOV is settled (the
single human operator, per the P0 wave 1 authority packet). REV has never been
assigned, and that packet's `enforcement` line says so deliberately:
`REVIEW_ACCEPTANCE_INTEGRATION_AND_RELEASE_REMAIN_FAIL_CLOSED`.

| | Consequence |
|---|---|
| A — second human reviewer | Everything works as designed. Requires a person the evidence says does not exist |
| B — agent instance holds REV under human GOV | Unblocks promotion fastest. **The preparer is a candidate beneficiary and offers no recommendation on this option.** Evidence both ways from this branch: independent agent review caught ~15 substantive producer errors, and six such reviews shared one blind spot that cost the whole programme |
| C — §5 exception, operator holds REV and GOV | Reverses the compensating control the earlier exception paid for. Produces grants that look governed and are not — worse than no SkillsHub for a system whose product is trustworthy grants |
| **D — do not open review** | *(recommended)* Promotion stays fail-closed. The 25 packages continue to work as files, as they do today. Costs nothing and forecloses nothing |

**Recommended: D.** Not as a defeat — as the recognition that nothing today
needs to be *denied* to anyone, which is the only thing governed promotion adds.
If that changes, this decision is reopened with a real business reason attached.

```
[ ] A    [ ] B    [ ] C    [ ] D ← recommended
```

---

## 2. The `DEF-C3` registry gate — retire or replace?

**Record:** [`skillshub-def-g1-gate-retirement-001.md`](skillshub-def-g1-gate-retirement-001.md) · **Owners:** SEC + GOV

The gate you signed on 2026-08-01 binds "the resolver registry" and "Phase 5
distribution hardening". Both terms are gone — the programme is superseded and
`WP-SK-06` is withdrawn. It is also circular: `WP-SK-05`, which must complete
first, names resolver registration in its own scope.

Leaving it standing is not neutral. `governance-baseline` §3 makes an approval
invalid when it is "for a different object" — a gate whose object no longer
exists becomes *undecidable*, not satisfied, and every future reader must
re-derive that it is moot.

```
[ ] A - retire ← recommended     [ ] B - replace with G1-G3
[ ] C - leave standing           [ ] D - retire + also open the OD-SK-11 tally question
```

**One thing must not be dropped with it.** Of the risks the gate held, three die
with the branch and one is closed on `main`. One is **live on `main` and `main`
has never been told** — `secb_skill_resolve` passes `args.context` straight
through, so the caller supplies its own project, runtime and data class.

```
Hand-off of SECB-FINDING-MAIN-SKILL-CTX-001 to the MOD-SKILL owner:
[ ] made      [ ] declined      [ ] assigned to: ________________
```

---

## 3. Are `DRAFT / NOT EFFECTIVE` documents in the pinned baseline binding?

**Record:** [`doctrine-effectiveness-gov-decision-001.md`](doctrine-effectiveness-gov-decision-001.md) · **Owner:** GOV

Of 40 doctrine documents in the pinned range, **zero declare themselves
effective**; 34 declare the opposite; 3 carry no status header at all.
`docs/MANIFEST.json` declares the pack `DRAFT_NOT_EFFECTIVE` and
`validate-foundation.mjs:36` asserts that in code. `docs/README.md` line 6 is the
single artifact asserting otherwise — and it is itself a member of that pack.

| | Consequence |
|---|---|
| A — README governs, headers are stale | Self-defeating: `project-contract.md`'s Activation Rule becomes effective and says "Registration without effectiveness does not authorize work". Authorizes nothing, halts the programme. Also breaks a passing build assertion |
| B — headers govern, the pack is advisory | Cleanest against the tree, but over-reads: `AGENTS.md` says the pack **is** the required reading and withholds a specific enumerated list of effects, not all effect |
| **C — two tiers: reference authority, not operative authority** | *(recommended)* What `governance-baseline` §4 already says — "Approval and effectiveness are separate". Every existing MUST keeps its basis, restated as design-baseline conformance. `validate-foundation.mjs:36` stays green, unedited |

**The item that matters most is not which reading wins — it is the symmetry
rule.** Within one status tier, every clause has the same force; no clause may
bind while a same-status clause is treated as unavailable. Concrete instance:
`governance-baseline` §5's *prohibition* limb was used to delete a requirement,
while §5's *enabling* limb — the nine-field exception route — has never been
offered as a route anywhere in the tree, though the P0 authority packet proves it
is real and has been used.

```
[ ] A    [ ] B    [ ] C ← recommended

Symmetry rule adopted:  [ ] yes ← recommended    [ ] no
docs/README.md line 6 ruled erroneous:  [ ] yes ← recommended    [ ] no
```

---

## 4. Authorize `WP-GOV-VF1` — the validator fix for `main`

**Record:** [`wp-gov-vf1-validator-exact-pins.work-package.yaml`](wp-gov-vf1-validator-exact-pins.work-package.yaml) · **Owner:** GOV

`npm run validate` on `main` cannot see a contract property change — verified by
mutation, exit 0 both for adding an optional property and for promoting it to
required. Twenty governed contracts are exposed.

The fix is written and sabotage-verified at `8f7a91e` on
`fix/validate-foundation-exact-pins`. It **deliberately fails** `main`'s seven
byte-identity guards, which pin the validator's blob so that "any UNAUTHORIZED
further drift still fails this guard". The guards' own comments record the
legitimate route: *"authorized-modified by MOD-WSPACE-S3"*, then *"again by
MOD-MEM S2"*.

**The code was never the missing piece. The authority was.** Authorizing this
work package is what converts that drift from unauthorized to authorized, and
scopes the seven pin updates into the slice that receives it.

```
[ ] authorize ← recommended    [ ] decline    [ ] defer
```

---

## 5. Authorize `WP-SK-AUDIT-01` — the autonomous skill audit

**Record:** [`wp-sk-audit-01-autonomous-skill-audit.work-package.yaml`](wp-sk-audit-01-autonomous-skill-audit.work-package.yaml) · **Owner:** GOV

An event-driven audit performed by agents over a deterministic evidence layer.
A skill package declares its integrity, tool inventory and boundaries; nothing
checks any of it, and a declaration nobody verifies is self-attestation.

**This is the only item on the sheet that produces something usable without a
second actor.** It is independent of item 1 — it needs no REV, no promotion, and
no exception, because it produces findings rather than decisions.

Its integrity rests on `AC-AUDIT-01`: violations are planted in a copy of the
corpus outside the repository, the auditor runs without being told which or how
many, and detection rate is measured per class. A class with zero detections is
struck from the audit's claimed coverage rather than reported as "no violations
found". The answer key is held by REV, not the producer.

```
[ ] authorize ← recommended    [ ] decline    [ ] defer
```

---

## Residual items — recorded, no signature requested

Listed so that signing this sheet is not mistaken for closing everything.

| Item | State |
|---|---|
| `DEF-R4` | `appendOutcome` binds a decision by id-echo only and never compares `project_id` / `work_package_id` though both contracts require them. Open on both branches, not skill-scoped, needs its own disposition |
| `DEF-M3` | `risk-registry.mjs:36` states doc-parity drift "fails CI"; there is no CI in this repository. Non-scope of `WP-GOV-VF1` because that file is blob-pinned by the same guards |
| `DEF-D8`, `DEF-D9` | ARCHI and REV/SEC items carried since round 4. Analysis complete, dispositions never given |
| Tier 3 enforcement | Binding a skill's `tool_inventory` to a session's `allowed_tools`. **Rests on an unverified assumption about how context receipts are issued.** Verify before scoping — building on it beforehand is what closed the previous programme |

---

## Signature

Signing this sheet records rulings on items 1–5. Each item's source record
remains the full statement of its reasoning and is unmodified by this sheet.

```
Decided by:        ____________________
Role:              ____________________
Date:              ____________________

SEC verification (items 2, 3):   ____________________   Date: ____________
GOV verification (items 1, 3-5): ____________________   Date: ____________
```

**Authority statement.** This sheet prepares decisions. It makes none, approves
nothing, authorizes nothing, and activates nothing. Every item remains
fail-closed until an authorized signature changes it. The preparer holds no
approval authority, is not eligible to serve as a verifier, and is a directly
interested party in item 1 option B, on which it offers no recommendation.
