# SecB Decision Sheet 001 — everything currently awaiting a signature

**Document ID:** `SECB-DECISION-SHEET-001`
**Status:** `RULED — items 1-5 decided 2026-08-03. This sheet is the record of record for those five rulings.`
**Decided by:** Operator (BizEra), 2026-08-03, concurring with the preparer's recommendation on every item
**Prepared by:** Claude Code (worker agent). Prepares decisions, makes none.
**Prepared at:** 2026-08-03, baseline `05f0147`
**Purpose:** collapse five open decisions into one pass. Each line below is decidable on its own.

> **How this ruling was given, recorded exactly.** The operator returned the five
> items in the one-line form the preparer requested:
> `1 = D · 2 = A · 3 = C + symmetry rule · 4 = อนุมัติ · 5 = อนุมัติ · hand-off = made`.
> The agent transcribed it into the boxes below and changed no item's text. This
> follows the precedent of `SECB-SEC-DECISION-SKILLSHUB-C3-001`, whose signature
> block likewise records an operator ruling given in session.
>
> **One sub-item was NOT ruled and is left open.** Item 3 offered two separate
> boxes - adopt the symmetry rule, and rule `docs/README.md` line 6 erroneous. The
> operator named the symmetry rule and did not name the README. The agent left the
> README box unticked rather than inferring it: editing `docs/README.md` alters a
> member of the pinned pack and is not a by-product of ruling C.
>
> **`SECB-DELEGATION-STANDING-001` was not ruled on and remains unsigned.** The
> agent continues to ask first on everything outside its existing producer role.

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
[ ] A    [ ] B    [ ] C    [x] D    RULED 2026-08-03
```

**Ruled: D.** Skill promotion remains fail-closed. `approval-binding.mjs` is
unchanged and unweakened; no exception was granted; no REV was assigned. The 25
packages continue to be used as files. This decision is reopened only with a
business reason for needing to deny a skill to a caller.

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
[x] A - retire                   [ ] B - replace with G1-G3
[ ] C - leave standing           [ ] D - retire + also open the OD-SK-11 tally question
                                 RULED 2026-08-03
```

**Ruled: A.** The registry gate of `SECB-SEC-DECISION-SKILLSHUB-C3-001` is
retired. That signed record is left byte-unchanged; the gate is retired by the
superseding record, not by rewriting the original. The G1–G3 replacement packet
is therefore withdrawn — A and B could not both be granted.

The `OD-SK-11` withheld-tally question was **not** folded in, per option D not
being taken. It remains open and separately raisable.

**One thing must not be dropped with it.** Of the risks the gate held, three die
with the branch and one is closed on `main`. One is **live on `main` and `main`
has never been told** — `secb_skill_resolve` passes `args.context` straight
through, so the caller supplies its own project, runtime and data class.

```
Hand-off of SECB-FINDING-MAIN-SKILL-CTX-001 to the MOD-SKILL owner:
[x] made      [ ] declined      [ ] assigned to: ________________
              RULED 2026-08-03
```

**Ruled: hand-off made.** The live risk the gate was holding — `main`'s
`secb_skill_resolve` passing `args.context` straight through — passes to the
`MOD-SKILL` owner rather than lapsing with the gate. The finding record stands on
its own and states its own unchecked assumption: nobody searched for an upstream
caller that derives the context, and that remains the most likely disposition.

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
[ ] A    [ ] B    [x] C    RULED 2026-08-03

Symmetry rule adopted:  [x] yes    [ ] no        RULED 2026-08-03
docs/README.md line 6 ruled erroneous:  [ ] yes    [ ] no    NOT RULED - still open
```

**Ruled: C, and the symmetry rule is adopted.** The pinned pack carries
reference authority, not operative authority. Every existing MUST keeps its
basis, restated as design-baseline conformance rather than effective-control
compliance. `validate-foundation.mjs:36` stays green and unedited.

The symmetry rule now binds: **within one status tier, every clause has the same
force; no clause may be treated as binding while a same-status clause is treated
as unavailable.** Its immediate effect is that `governance-baseline` §5's
enabling limb — the nine-field exception route — is as available as its
prohibition limb, which has been used to delete requirements while the enabling
limb was never offered anywhere in the tree.

**`docs/README.md` line 6 was not ruled on.** It remains the single artifact in
the tree asserting operative authority for the pack, contradicting the manifest,
the validator and all 34 self-declared headers. Ruling C does not resolve that
contradiction by itself, and the agent has not edited the file. Raisable
separately.

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
[x] authorize    [ ] decline    [ ] defer    RULED 2026-08-03
```

**Ruled: authorized.** `WP-GOV-VF1` is authorized. The validator modification on
`main` is now an authorized modification in the idiom the byte-identity guards
themselves record, and the seven blob pins are inside this slice's remit. The
prepared branch `fix/validate-foundation-exact-pins` at `8f7a91e` is the starting
point; it does not become mergeable until the pins are updated and `AC-VF1-06`
demonstrates the guards still bite afterwards.

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
[x] authorize    [ ] decline    [ ] defer    RULED 2026-08-03
```

**Ruled: authorized.** `WP-SK-AUDIT-01` is authorized. No result it produces is
claimable until `AC-AUDIT-01` calibration passes, and the calibration answer key
is held by REV rather than by the producer. `.agents/` remains read-only
throughout.

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
Decided by:        Operator (BizEra)
Role:              Operator / GOV. Per p0-wave-1-authority-packet.yaml,
                   "A single local human operator is the available GOV authority".
Date:              2026-08-03

SEC verification (items 2, 3):   NOT INDEPENDENTLY VERIFIED - see below
GOV verification (items 1, 3-5): held by the same operator who decided
```

**Recorded honestly rather than completed cosmetically.** This sheet asked for
SEC and GOV verification separate from the decider. This project has one human,
who holds all three roles - the same fact that produced ruling D on item 1. The
verification lines are therefore recorded as unfilled rather than signed by the
decider, because a verifier who is the decider is not a verification, and writing
one in would manufacture exactly the appearance of independent review that item 1
declined to manufacture.

The rulings stand on the operator's authority as GOV. What they do not carry is
independent verification, and that limitation is part of the record.

**Authority statement.** This sheet prepares decisions. It makes none, approves
nothing, authorizes nothing, and activates nothing. Every item remains
fail-closed until an authorized signature changes it. The preparer holds no
approval authority, is not eligible to serve as a verifier, and is a directly
interested party in item 1 option B, on which it offers no recommendation.
