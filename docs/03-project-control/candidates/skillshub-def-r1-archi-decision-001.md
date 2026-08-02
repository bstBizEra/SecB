# ARCHI Decision Request — How does a governance decision bind to what it authorizes?

**Document ID:** `SECB-ARCHI-DECISION-SKILLSHUB-R1-001`
**Status:** `PREPARED — AWAITING RULING`
**Decision owner:** ARCHI (with GOV for the contract version; SEC consulted, not deciding)
**Prepared by:** Claude Code (worker agent) — prepares the decision, does not make it
**Prepared at:** 2026-08-02, baseline `dcbabc4`; **re-verified at `b7d7f41`**
**Baseline moved during preparation.** Two commits landed while this packet was being
written: `249c798` (foundation validator) and `b7d7f41` (defect register §N). Both change
facts this packet asserts. Verified item 4 is the affected one and is stated at both
baselines. All line citations below were re-checked at `b7d7f41` and hold.
**Blocks:** the first skill promotion. `WP-SK-VS-01` was withdrawn because of this defect
(`wp-sk-vs-01-first-resolvable-skill.work-package.yaml:4`, `record_status:
"WITHDRAWN_BY_PRODUCER"`), and its `superseded_by` field records that a replacement
"needs DEF-R1 closed first, which is a contract change and belongs to ARCHI".

---

## The question

**How does a governance decision bind to the object it authorizes?**

`DEF-R1` (`skillshub-prd-defect-register-001.md:289`, severity **CRITICAL**) records the
defect: a decision record cannot name a skill, so `SkillResolver` checks only that a
decision with the claimed id exists and is typed `GOVERNANCE`. One decision authorizes
**any** skill at **any** scope. The register's probe promoted an unrelated
`SECB-ARCH-999` and a self-widened `SECB-ARCH-007@0.2.0` at `RESTRICTED` across three
projects, using a decision whose rationale read "promote SECB-ARCH-007 only". All
resolved `ALLOW`.

Four shapes are available. One ruling picks the binding mechanism; the contract version
and migration follow from it.

---

## Why this is first

Every downstream promotion control assumes the decision means something specific. Until
the binding mechanism is fixed, the trust-tier split, the promotion service, and the
first published skill are all building on a token that names nothing.

---

## What is verified, and not in dispute

Every item below was re-derived at baseline `dcbabc4` and can be re-run.

**1. The decision contract has no field that can name an object.**
`contracts/decision-record.schema.json` is 25 lines, `additionalProperties: false`
(line 6), with 14 required fields (line 7) and one optional field, `reverts` (line 23).
There is no `subject`, no `object_id`, no `skill_id`.

**2. The resolver could not read such a field even if the record carried one.**
This is the fact most likely to be missed. `src/registry/skill-resolver.mjs:33-39`:

```js
function resolvedDecision(value) {
  if (!value || typeof value !== "object") return null;
  return {
    id: value.entry?.entryId ?? value.decision_id ?? null,
    type: value.entry?.payload?.decision_type ?? value.decision_type ?? null
  };
}
```

The projection discards everything except `id` and `type` — including `project_id` and
`work_package_id`, which the decision record already requires. **Any option that compares
decision fields to manifest fields requires widening this projection first.** No option
below is a pure schema change.

**3. The enforcement point is the resolver, not Ajv.** Both call sites of
`resolvedDecision` — `#promotionsEffective` (`skill-resolver.mjs:88-110`, used at
resolution) and the `registerSkill` publication branch (`:128-148`) — compare only `id`
and `type`. A decision that carries no subject would remain a valid decision record for
its own purpose; it would simply be unable to promote a skill. Validity and promotive
force are separable, and the separation is enforced in the resolver.

**4. The "optional `subject` keeps `npm run validate` at exit 0" claim was TRUE at
`dcbabc4` and is FALSE at `b7d7f41`. The tree changed underneath it, mid-preparation.**

This is the item to read carefully, because the same sentence has two opposite truth
values four commits apart.

- **At `dcbabc4`** the exact-property-set pin did not exist. `git show
  dcbabc4:tools/validate-foundation.mjs | grep -c exactPropertySets` returns **0**. An
  optional `subject` passed `validate` at exit 0. The preparer measured this directly and
  it was correct.
- **At `b7d7f41`** the pin exists at `tools/validate-foundation.mjs:244` (15 names), with
  set-equality loops at `:271-279` (required, 14 fields) and `:280-287` (properties). A
  sixteenth property now fails, whether required or not:

```text
node tools/validate-foundation.mjs   →  exit 1
Error: schema.properties.exact.contracts/decision-record.schema.json:
       property set is exactly 15 names
```

The change landed at `249c798`, "make the foundation validator able to fail on contract
change", which closed `DEF-M2` — recorded at
`skillshub-prd-defect-register-001.md:385`, whose own text confirms the prior state:
*"adding a `subject` property to `decision-record.schema.json` as optional left `validate`
at exit 0; making it `required` **also** left `validate` at exit 0"*, and *"any addition to
a governed contract passes `validate` unconditionally."*

**The governance point matters more than the arithmetic.** At `dcbabc4` the exit-0 result
was not evidence that the change was safe — it was evidence that the validator could not
see the change at all. A packet that had banked "exit 0" as a safety property would have
been citing a blind check. `DEF-M2`'s closure is what converted that measurement from
meaningless to meaningful, and it converted it to the opposite value.

**5. Option A is mechanically achievable at `b7d7f41`, at a two-file cost.** With
`subject` added to `contracts/decision-record.schema.json` **and** the property-set pin at
`tools/validate-foundation.mjs:244` extended by one name, `npm test` (which is
`npm run validate && node --test tests/*.test.mjs`, `package.json:24`) returns **exit 0**
with **984 tests, 977 pass, 0 fail, 7 skipped**. Both files were restored byte-identical
afterwards; `git status` on both is clean.

The pin is not an obstacle to route around. It is the control that makes contract drift
impossible without an explicit, reviewable edit. **The correct statement of Option A's
cost is: two coordinated files, one of them the foundation validator.**

**6. Zero existing decision records are invalidated by the optional form.** This holds by
construction, not by inventory: under `additionalProperties: false`, adding a name to
`properties` can only ever *widen* the accepted set, because the key was previously
rejected outright. No instance that validates today can stop validating. The empirical
run in item 5 is consistent (0 failures across the suite, including
`tests/fixtures/valid/decision-record.json`).

**7. Option B was probed and catches exactly one case.** The check Option B would install
is `manifest.project_scopes.includes(decision.project_id)`. `project_scopes` is an array
(`contracts/skill-manifest.schema.json:26`, `minItems: 1`) and the resolver's existing
scope test at `skill-resolver.mjs:207` is already `includes()`. `includes()` is satisfied
by any superset. Scope widening is **additive** — the DEF-R1 probe widened
`SECB-ARCH-007@0.2.0` *across three projects*, which necessarily still contains the
authorizing decision's own project.

The single case Option B catches is a manifest scoped to a project set that **excludes**
the authorizing decision's own project. That is a manifest an attacker has no reason to
construct: excluding your own project removes your own access. Option B therefore
prevents an error, not an attack.

**8. The defect is not skill-scoped.** `src/ledger/temporal-ledgers.mjs:168-191`,
`appendOutcome`, has the identical unbound shape:

```js
const decision = this.#decisionLookup(outcome.decision_ref);
if (!decision) throw new LedgerError("DENY_UNKNOWN_DECISION", ...);
const decisionId = decision.entry?.entryId ?? decision.decision_id;
if (decisionId !== outcome.decision_ref) throw new LedgerError("DENY_UNKNOWN_DECISION", ...);
```

Existence and id-echo. Zero project or work-package comparison. And this is sharper than
"the fields are missing": `contracts/outcome-receipt.schema.json:7` **requires**
`project_id` and `work_package_id` on every outcome receipt, and the decision record
requires both as well. The data needed for the comparison is present on both records and
is simply never compared. Whatever ARCHI rules here should be ruled as a pattern, or the
same defect will be closed once and left open next door.

*Now tracked separately.* This finding was entered into the register at `b7d7f41` as
**`DEF-R4`** (`skillshub-prd-defect-register-001.md:384`, `PRODUCER-VERIFIED — CRITICAL`),
which cites this packet as its origin and adds one consequence this packet had not drawn:
because `temporal-ledgers.mjs:179-185` forces `reversion_required === true` for
`outcome_status: "INVALIDATED"`, **an outcome receipt naming project A can attach a
reversion obligation to a decision belonging to project B.** The register also records
that this is a structural consequence of two verified reads and is **not probe-executed**.
The pattern-ruling checkbox below is the item that decides whether `DEF-R4` is fixed by
the same ruling or left to its own.

**9. The grant tier has already made a partial version of this binding.**
`contracts/skill-grant-record.schema.json:113-117` requires `work_package_id` on every
`approval_history` entry, with the description: *"contracts/decision-record.schema.json
requires work_package_id on every decision, so a promotion cannot be minted outside an
authorized work package (DEF-B3). This was previously asserted in prose while the schema
left it optional - a structural claim the structure did not make."* Nothing compares that
recorded value against the referenced decision's own `work_package_id`, and the resolver
does not consume the grant record at all — `registerSkill:113` still validates
`"skillManifest"`.

---

## The four options available

### Option A — Optional typed `subject` on the decision record, mandatory at the resolver

*Shape:* add `subject` to `contracts/decision-record.schema.json` as an optional object
carrying at minimum `{ object_type, object_id }`, plus the pin extension at
`tools/validate-foundation.mjs:244`. Widen `resolvedDecision` to carry `subject` through.
The resolver refuses a `HUMAN_PROMOTION` whose decision has no `subject`, or whose
`subject.object_id` is not this skill.

*Consequence:* the binding is on the authorizing record, where the authority is. A
decision without a subject stays valid for governance, disposition, and reversion — it
simply cannot promote. Fail-closed at the point of use, permissive at the point of
record.

*Cost:* one contract version; the foundation pin; a `resolvedDecision` widening; resolver
tests at both call sites. Measured: full suite green at 984 tests.

*Risk:* the optional-at-schema / mandatory-at-resolver split must be documented, or a
later reader will see an optional field and conclude the binding is optional.

### Option B — Narrow using the existing `project_id` / `work_package_id`

*Shape:* no contract change. Widen `resolvedDecision` to carry `project_id`, then assert
`manifest.project_scopes.includes(decision.project_id)` at registration and resolution.

*Consequence:* per verified item 7, this catches exactly one case — a manifest whose
scope set excludes the authorizing decision's own project — and catches none of the DEF-R1
probe. `SECB-ARCH-999` still registers. The self-widened `RESTRICTED`-across-three-projects
manifest still resolves `ALLOW`.

*Cost:* low. *Value:* near zero against the recorded threat.

*The preparer recommends Option B be REJECTED EXPLICITLY, not banked as partial
mitigation.* The reason is not that it is cheap or weak. It is that a probe has already
falsified the closure claim it would support. If Option B is recorded as "partial
mitigation of DEF-R1", the register will carry a partially-closed CRITICAL against a
control that demonstrably does not close it, and the next reader will discount DEF-R1's
severity accordingly. **A closure claim a probe falsifies is worse than an open defect**,
because an open defect is still visible.

### Option C — Carry the binding on `skill-grant-record`

*Shape:* extend `contracts/skill-grant-record.schema.json` so each `approval_history`
entry asserts the decision's subject, alongside the `work_package_id` it already requires
(`:113-117`).

*Consequence:* the binding lives on the record the promotion service writes and no package
author supplies (schema `description`, line 5). But it is an *attestation by the promotion
service about the decision*, not a property of the decision. It closes DEF-R1 only if the
promotion service is trusted to copy faithfully and something verifies the copy against
the decision ledger.

*Cost:* one contract version on the GRANTED tier. Lower blast radius than Option A —
this contract has no instances in the resolver path yet.

*Risk, stated plainly:* this reproduces the shape DEF-B3's own schema comment warns about
— a structural claim resting on a value nobody checks — unless the verification step is
built at the same time. Option C without that step is Option B with more fields.

*Sequencing note:* Option C is not available independently of the ADR-0013 tier split
landing, because the resolver does not read the grant record today.

### Option D — Separate grant ledger

*Shape:* a distinct append-only ledger recording (decision → object) grants, consulted at
registration and resolution.

*Consequence:* the most general answer, and the only one that also addresses verified
item 8 (`appendOutcome`) without a second bespoke fix. Grants become first-class,
enumerable, and revocable independently of the decision.

*Cost:* highest. A new ledger is a new system of record, with its own contract, its own
persistence, its own integrity story, and its own place in the seven-ledger model
(`docs/adr/0003-seven-ledger-model.md`). It is not a defect fix; it is an architecture
change that happens to fix a defect.

*Risk:* scope. Ruling D here would very likely convert a blocked promotion into a blocked
programme.

---

## What ARCHI is being asked to sign

- [ ] **Option A** — optional typed `subject` on the decision record, mandatory at the resolver
- [ ] **Option B** — narrow using existing `project_id` / `work_package_id`
- [ ] **Option C** — carry the binding on `skill-grant-record`
- [ ] **Option D** — separate grant ledger

Separately, and required regardless of which option above is taken:

- [ ] **Option B explicitly rejected** — recorded as falsified by probe, NOT banked as partial mitigation of `DEF-R1`
- [ ] **Pattern ruling** — the ruling above applies equally to `appendOutcome`
      (`src/ledger/temporal-ledgers.mjs:168-191`), or is recorded as skill-scoped with a reason

```
Ruling:              [ blank — for ARCHI ]
Decided by:          [ blank ]
Date:                [ blank ]
Option B rejected:   [ ] explicitly rejected   [ ] banked as partial mitigation
Pattern ruling:      [ ] applies to appendOutcome   [ ] skill-scoped, reason recorded
Contract version:    [ blank ]
```

---

## Recommendation

**Option A**, with Option B explicitly rejected and the pattern ruling extended to
`appendOutcome`.

The argument is that the binding belongs on the record that carries the authority. A
decision is the thing that authorizes; if it cannot say what it authorizes, no downstream
attestation can repair that without becoming the trusted party itself. Option C moves the
claim to a record written by a service, which is better than nothing but relocates the
trust rather than grounding it. Option D grounds it properly and costs more than the
defect warrants right now.

The optional-at-schema, mandatory-at-resolver asymmetry is the part worth arguing about,
and the preparer's case for it is: it keeps the migration at zero — no existing decision
record is invalidated (item 6) — while making the control unbypassable at the only point
where promotion actually happens. The counter-argument ARCHI should weigh is that an
optional field invites a future reader to treat the binding as optional. If that
counter-argument wins, the same option with `subject` in `required` is available, at the
cost of a real migration and a second pin edit at
`tools/validate-foundation.mjs:271-279`.

**Where this recommendation could be wrong.** It assumes the resolver stays the single
enforcement point for promotion. If a second promotion path is ever built that does not
route through `SkillResolver`, a resolver-enforced control silently stops covering it,
and Option A degrades to Option B's value. Option D does not have that failure mode.
ARCHI is better placed than the preparer to judge how likely a second path is.

**Correction the preparer is obliged to record.** An earlier draft of this packet recorded
verified item 4 as a preparer error — a non-reproducible exit-0 measurement. That was
itself wrong, and the retraction is retracted. Both measurements were correct; the
validator changed between them (`249c798`, closing `DEF-M2`). The lesson the preparer
takes from it, and offers to ARCHI: **a probe result is only as durable as the commit it
was taken at, and a packet that stamps a baseline must re-verify at the tip before it is
signed.** Any downstream document citing "optional `subject` passes validate" without a
commit stamp is now ambiguous rather than merely wrong.

**Authority statement.** This document prepares a decision. It makes none, approves
nothing, and authorizes nothing. Its preparer holds no verdict authority; the verified
facts above are cited so they can be re-derived rather than trusted.

**Evidence:** `SECB-PRD-SKILLSHUB-DEFECTS-001` `DEF-R1` (line 289), `DEF-A5` (line 218);
`contracts/decision-record.schema.json`; `contracts/outcome-receipt.schema.json:7`;
`contracts/skill-grant-record.schema.json:113-117`; `src/registry/skill-resolver.mjs:33-39,
88-110, 128-148, 207`; `src/ledger/temporal-ledgers.mjs:168-191`;
`tools/validate-foundation.mjs:244, 271-287`;
`wp-sk-vs-01-first-resolvable-skill.work-package.yaml:4, 34-36`.

```yaml
self_certification:
  agent_id: claude-immune
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
