# SEC + GOV Decision Request — Retire the SkillsHub registry gate

**Document ID:** `SECB-SEC-GOV-DECISION-SKILLSHUB-G1-RETIRE-001`
**Status:** `PREPARED — AWAITING RULING`
**Decision owners:** SEC and GOV jointly. The gate being retired was signed by the operator; only the signing authority can retire it.
**Prepared by:** Claude Code (worker agent) — prepares the decision, does not make it
**Prepared at:** 2026-08-03, baseline `b23d386`
**Supersedes request:** `SECB-SEC-GOV-DECISION-SKILLSHUB-G1-001` (the G1–G3 replacement gate). That packet proposed replacing the gate; this one proposes retiring it. Both cannot be granted.

---

## 1. What is being asked

`SECB-SEC-DECISION-SKILLSHUB-C3-001`, signed by the operator on 2026-08-01,
carries a blocking constraint:

```
Registry gate:     [x] applied - do not populate the resolver registry until
                       Phase 5 distribution hardening is complete
```

**The question:** does that gate retire, or does it get replaced?

**The preparer's recommendation: retire it, explicitly and with a signature.**
Not replace it, and not let it lapse in silence.

---

## 2. Why retirement rather than replacement

The gate binds two terms. Both are gone.

| Term | State at `b23d386` |
|---|---|
| "the resolver registry" | The registry of `feat/secb-ruflo-command-center`, populated by a programme that is now `SUPERSEDED BY MOD-SKILL S1/S2`. `main` has its own promotion path — `skill-promotion-ledger`, `skill-candidate-registry`, `skill-revocation-ledger` — which this gate was never written about and does not name |
| "Phase 5 distribution hardening" | `WP-SK-06`, withdrawn with the rest of the `WP-SK-01`→`WP-SK-06` roadmap |

Drafting the G1–G3 replacement would build a governance control for a
programme that has stopped. The earlier packet was prepared before `main` was
consulted; its analysis of what the gate protects remains correct and is
retained, but its conclusion — that a replacement is needed — does not survive
the programme's closure.

**Retirement is not the same as the gate lapsing.** `governance-baseline.md` §3
lists among the fail-closed conditions that an approval is invalid when it is
"expired, revoked, replayed, or **for a different object**". A gate whose object
no longer exists does not thereby become satisfied — it becomes undecidable.
Leaving it standing means every future reader finds a signed, in-force
constraint that cannot be discharged and cannot be breached, which is worse than
either outcome.

---

## 3. What must not be dropped along with it

The gate protected two mechanisms. Retiring it must not silently retire the
risks, because **one of them is live on `main`** and `main` has never been told.

| Risk | State | Where it goes |
|---|---|---|
| Classification comparison at `skill-resolver.mjs:213` — a caller's clearance passed as a *requested* data class inverts the comparison | On `feat/secb-ruflo-command-center`, `dataClassification: ceiling` at `secb-mcp-server.mjs:517` and `:553`. **Not present on `main`** — `main`'s `secb-mcp-server.mjs` has zero occurrences | Branch-only. Dies with the branch, or is fixed if the branch's MCP work continues. Not `main`'s problem |
| Skill-body snippet disclosure at `skills-hub-service.mjs:490` | Branch-only. `main` has no `src/skills/` and no discovery surface | Dies with the branch unless the hub is carried across, which the closure note recommends against |
| **Caller-asserted resolution context** — `main`'s `secb_skill_resolve` passes `args.context ?? {}` straight through, so the caller supplies its own `projectId`, `runtime` and `dataClassification` | **LIVE ON `main`**, latent only because `main`'s wiring is `decisionLookup: () => null` | **Must be handed to `main`'s owner.** See §4 |
| Promotion decisions not bound to their object (`DEF-R1`) | **Closed on `main`** by `contracts/skill-promotion.schema.json` (`bound_action`, `bound_object_version`, plus a producer/review/governance actor triple) | Closed. No carry-over |
| Grants that cannot expire or be revoked at resolution (`DEF-R2`/`DEF-R3`) | Fixed on this branch at `44285f8`. **Open on `main`**, and `main`'s `skill-revocation-ledger.mjs` names it as "EXPLICITLY OUT OF SCOPE (component 3, operator-gated follow-up)" | Already an acknowledged, deliberately deferred item on `main`. Not this gate's business |

**The retirement decision should carry the third row forward as a named
hand-off, not as a footnote.** Retiring a gate is an appropriate moment to check
what it was holding; it is not an appropriate moment to lose it.

---

## 4. The finding this retirement surfaces

Recorded here because it was found while establishing what the gate protects,
and because it belongs to `main`, not to this branch.

`main`'s `src/mcp/secb-mcp-server.mjs`:

```js
case "secb_skill_resolve":
  return s.skillResolver.resolveSkill(args.skill_id, args.version, args.context ?? {});
```

The caller supplies the entire authorization context — project scope, runtime and
data classification — and the resolver compares the caller's own assertions
against the manifest. A caller naming a project it is not scoped to, or a data
class above its clearance, is not contradicted by anything in this path.

**Latent, not live:** `main`'s wiring is `new SkillResolver({ decisionLookup: () => null })`,
so no `PUBLISHED` skill resolves today. It becomes live at the same moment the
`DEF-R2` follow-up (`main`'s own "component 3") is wired. Those two changes
should not be made independently.

This is not a claim that `main` is wrong — the context may be derived upstream in
a caller `main` intends and this preparer has not read. It is a question for
`main`'s owner, raised because the alternative is not raising it.

---

## 5. Options

| # | Option | Consequence |
|---|---|---|
| **A** | **Retire the gate.** Record it as superseded by the programme's closure; hand §4 to `main`'s owner | *(recommended)* The gate stops being an undischargeable constraint. The one live risk is handed on rather than dropped. Requires the §4 hand-off to actually happen, or A degrades into C |
| B | Replace with G1–G3 per `SECB-SEC-GOV-DECISION-SKILLSHUB-G1-001` | Builds a discharge procedure, independent review and evidence record for a stopped programme. Its conditions bind code paths on a branch scheduled to be abandoned |
| C | Leave it standing | A signed, in-force constraint that names an object that no longer exists. Every future reader must re-derive that it is moot. This is the default if nothing is decided, which is why an explicit decision is being requested |
| D | Retire, and additionally rule on the `withheld_reasons` disclosure channel | The `OD-SK-11` tally is live and always was — the gate never protected it. Folding it in here would expand a retirement into a new control. Presented separately because it is SEC's call whether to open it, not a drafter's |

---

## 6. Exception-record fields

Per `governance-baseline.md` §5, carried because this varies a signed control.

| Field | Value |
|---|---|
| Exact control being varied | The registry gate of `SECB-SEC-DECISION-SKILLSHUB-C3-001`, 2026-08-01 |
| Business justification | The gated object no longer exists; the programme it governed is superseded by `MOD-SKILL` S1/S2 on `main` |
| Affected project / environment / data / window | SecB, `feat/secb-ruflo-command-center` only. No production environment. No data. Effective on signature, no expiry — retirement is terminal |
| Compensating controls | `main`'s own promotion path: `skill-promotion.schema.json`'s object binding and SoD actor triple; `skill-revocation-ledger`'s governed `revoke()`; `main`'s byte-identity guards on the validator |
| Accountable owner | Operator (BizEra) as signing authority; `main`'s module owner for the §4 hand-off |
| Independent review | SEC and GOV, independently, neither being the preparer |
| Residual risk | **The §4 caller-asserted-context finding, if the hand-off does not happen.** All other protected mechanisms are branch-local and die with the branch |
| Expiry / revocation conditions | None — but if the SkillsHub programme is ever restarted on this branch, this retirement does not carry to it, and a gate must be re-derived against the tree as it stands then |
| Evidence destination | This record, plus §O of `SECB-PRD-SKILLSHUB-DEFECTS-001` |

---

## 7. Procedural note

`governance-baseline.md` §4 provides no transition from a signed state back to
`DRAFT`. The route is a superseding record — this document — not an edit to
`SECB-SEC-DECISION-SKILLSHUB-C3-001`. That document is left byte-unchanged; its
gate is retired by this record, not rewritten.

`decision-rights.md` places a policy exception at `A5 only`. Root `AGENTS.md`
retains the hard gate that no agent may self-declare completion or production
status. Both routes reach the same place: **the operator signs; SEC and GOV
verify independently; no agent activates this.**

Note that the effectiveness status of both cited documents is itself the subject
of `SECB-GOV-DECISION-DOCTRINE-001`, which is unresolved. The requirement above
does not depend on that outcome — it holds under either reading, which is why
this record does not wait for it.

---

## 8. Ruling

```
Ruling:            [ ] A - retire the gate
                   [ ] B - replace with G1-G3
                   [ ] C - leave standing
                   [ ] D - retire, and additionally open the OD-SK-11 tally question

Section 4 hand-off to main's owner:
                   [ ] made      [ ] declined      [ ] assigned to: ____________

Decided by:        ____________________
Role:              ____________________
Date:              ____________________

SEC verification:  ____________________   Date: ____________
GOV verification:  ____________________   Date: ____________
```

**Authority statement.** This document prepares a decision. It makes none,
approves nothing, and activates nothing. The gate of
`SECB-SEC-DECISION-SKILLSHUB-C3-001` remains in force until an authorized
signature on this record retires it. The preparer holds no approval authority
and is not eligible to serve as either verifier.
