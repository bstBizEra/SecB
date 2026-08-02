# SEC + GOV Decision Request — Replacing the circular resolver-registry gate

**Document ID:** `SECB-SEC-GOV-DECISION-SKILLSHUB-G1-001`
**Status:** `PREPARED — AWAITING RULING`
**Decision owner:** SEC (control content) and GOV (the superseding-record route). Neither alone.
**Prepared by:** Claude Code (worker agent) — prepares the decision, does not make it
**Prepared at:** 2026-08-02, baseline `dcbabc4`; **re-verified at `b7d7f41`**
**Varies:** `SECB-SEC-DECISION-SKILLSHUB-C3-001`, "Registry gate", signed 2026-08-01
**Blocks:** `WP-SK-05`, `WP-SK-06`, and therefore every remaining SkillsHub work package

---

## The question

**The registry gate signed on 2026-08-01 forbids the act whose completion is its own
release condition. What replaces it?**

The gate reads (`skillshub-def-c3-sec-decision-001.md:122-124`, and again inside the
signed ruling block at `:133-134`):

> **Blocking constraint applied** — the resolver registry is not to be populated until
> Phase 5 distribution hardening is complete. Population is the trigger event that makes
> the inversion live (`DEF-A8`).

`WP-SK-05`, which must complete before Phase 5 distribution hardening, names **"resolver
registration"** in its own scope — `secb-skillshub-prd-001.md:868`:

> `| WP-SK-05 | Promotion service — evidence binding, separation of duties, decision
> minting, resolver registration | WP-SK-04 | R3/M3 | One skill reaches PUBLISHED;
> self-promotion refused under test |`

This is recorded as `DEF-G1` (`skillshub-prd-defect-register-001.md:292`, severity
**HIGH — blocks everything**), with the note: *"Drafted by this producer; signed by the
operator on this producer's recommendation."*

The gate cannot be discharged by satisfying it. It can only be replaced.

---

## Why this is not a request to weaken a control

The preparer's position is that the gate as written protects less than it appears to, and
that the replacement below protects **more**, not less, while being dischargeable. SEC
should test that claim against the purpose analysis rather than accept it.

---

## What is verified, and not in dispute

Every item was re-derived at baseline `dcbabc4`.

**1. What the gate actually protects: exactly two mechanisms.**

- The classification comparison, `src/registry/skill-resolver.mjs:213`:
  `if (DATA_CLASS_ORDER.indexOf(dataClassification) > DATA_CLASS_ORDER.indexOf(manifest.max_data_classification))`
- Snippet disclosure, `src/skills/skills-hub-service.mjs:490`:
  `snippet: skill.content.slice(0, SNIPPET_LIMIT)`

**2. Both require `ALLOW`, and `ALLOW` requires `PUBLISHED`.** The classification
comparison at `:213` is reached only after the `PUBLISHED` test at
`skill-resolver.mjs:194-196` returns `DENY_NOT_PUBLISHED` for anything else. The snippet
at `skills-hub-service.mjs:490` is reached only through `#authorize`
(`skills-hub-service.mjs:394`), which at `:417` requires `verdict?.code === "ALLOW"`.
There is no path to either mechanism that does not pass through `PUBLISHED`.

**This is the load-bearing finding.** The gate is written against *registry population*.
Its actual protective surface is *publication*. Those are different events, and the gap
between them is where the circularity lives.

**3. The gate protects the `secb_skill_hub_search` withheld tally NOT AT ALL.** The hub's
index is built from disk — `readdirSync` at `skills-hub-service.mjs:338`, populating
`#skillsIndex` (`:266`, `:353`). The search loop at `:468` iterates that disk-derived
index, and every entry that fails `#authorize` increments the tally at `:470-473`. With
an empty registry, every package denies and every package is counted.

The channel is therefore **live today, with the gate in force**, and disclosing corpus
size right now. Whatever the gate is doing, it is not protecting this. Any argument for
the gate that rests on the tally is an argument for a control the gate does not
implement.

*Now probe-verified, not merely read.* At `b7d7f41` the register recorded this as a
correction to `DEF-A8` (`skillshub-prd-defect-register-001.md:397`) with an executed
result: against a production-shaped resolver (`new SkillResolver({ decisionLookup: () =>
null })`), **25 withheld = 3 `DENY_UNGOVERNED_PACKAGE` + 22 `DENY_UNKNOWN_SKILL`**,
identical across 4 query shapes × 4 data classifications, exit 0. It also adds a mechanism
this packet had not found: `src/mcp/secb-mcp-server.mjs:549` constructs a **fresh
disk-scanning hub on every call** (`s.skillsHub ?? new SecBSkillsHub({ services: s })`),
because `services.skillsHub` is never assigned by any production wiring. The finding is
therefore stronger than stated above, and the strengthening is against the gate.

**4. The circularity holds under both readings of "Phase 5".** `DEF-G1` equates Phase 5
with `WP-SK-06` (`secb-skillshub-prd-001.md:869`, "Distribution hardening"). The PRD is
broader: `:844` aligns the whole `WP-SK-01`…`WP-SK-12` roadmap to Phase 5, and `:443`
records the Phase 5 exit criterion as "one published low-risk skill". Under the narrow
reading, WP-SK-06 depends on WP-SK-05, whose exit is a `PUBLISHED` skill. Under the broad
reading, Phase 5's own exit criterion is a published skill. **Publication requires the
registry population the gate forbids, either way.** `DEF-G1`'s narrowing is not fully
supported by the PRD text, and the defect survives the correction.

**5. The one reading that would save the gate is closed off.** At `b7d7f41` the register
added `DEF-G1` corroboration (`skillshub-prd-defect-register-001.md:403`): the only
non-circular reading is that "populate the resolver registry" means something other than
`WP-SK-05`'s deliverable, and `secb-skillshub-prd-001.md:868` names *"resolver
registration"* as that deliverable outright. `DEF-G1` stands as recorded.

**6. G1's subject matter is already an undischarged condition of the record being
superseded.** Condition 2 of the signed DEF-C3 ruling
(`skillshub-def-c3-sec-decision-001.md:141-143`) requires the call-site correction
"regardless of this ruling". It is **not done**: `dataClassification: ceiling` remains at
`src/mcp/secb-mcp-server.mjs:517` and `:553` (verified by grep at `b7d7f41`; a third
occurrence at `:600` is the brain query, a different call path). Recorded at
`skillshub-prd-defect-register-001.md:404`.

This bears directly on how SEC should read condition G1 below: **G1 is not new work being
proposed, it is existing signed work being restated with a discharge test.** A ruling that
supersedes the registry gate while leaving condition 2 undischarged and unrestated would
drop an obligation the operator already signed.

**7. Nothing is currently registered.** `wp-sk-01-manifest-convergence.work-package.yaml`
AC-10: *"The resolver registry remains empty and no production wiring calls
registerSkill."* The replacement is being designed before first use, not retrofitted onto
live state.

---

## The two options available

### Option 1 — Keep the gate, resequence the work packages

*Shape:* redefine "Phase 5 distribution hardening" so it excludes the registration step,
allowing `WP-SK-05` to complete without tripping the gate.

*Consequence:* the gate survives its own signature intact. No superseding record needed
at the SEC level.

*Cost, and why the preparer does not recommend it:* it resolves a circularity by
redefining one of its terms, and the term being redefined is inside a signed record. The
gate would then read as a constraint on an event nobody performs, which is a control with
no discharge test and no protective effect — the shape this programme has repeatedly
recorded as a defect rather than a control.

### Option 2 — Supersede the gate with three conditions bound to `PUBLISHED`

*Shape:* replace "do not populate the registry until work package X completes" with "no
manifest reaches `PUBLISHED` status until conditions G1–G3 are discharged". The binding
moves from a **work package** to a **status transition**, which is the event that
verified item 2 shows is actually protective.

*Consequence:* registration at pre-publication statuses becomes permissible, which
unblocks `WP-SK-05`; publication stays gated, which is what the original gate was
reaching for. Each condition has its own discharge test and its own reviewer.

*Cost:* a superseding governance record, three discharge tests, three independent reviews.

---

## The proposed replacement conditions

Drafted for SEC to amend or reject. Each is stated with a **checkable** discharge test.
**Each is discharged independently — no condition's discharge implies another's — and
none is dischargeable by its own producer.**

| ID | Condition | Discharge test | Not dischargeable by |
|---|---|---|---|
| **G1** | The disclosure direction is corrected. The caller's clearance is no longer passed as a requested data class at the skill-resolve call site (`DEF-C3`). | A test asserts that for a fixed skill, raising the caller's clearance never widens the set of skills disclosed. The current inversion table (`skillshub-def-c3-sec-decision-001.md:36-41`) is the negative fixture: it must not reproduce. | The author of the call-site fix |
| **G2** | Promotion decisions bind to their object. A `HUMAN_PROMOTION` that does not identify the skill it promotes cannot promote it (`DEF-R1`). | The `DEF-R1` probe is re-run and fails closed: a decision naming `SECB-ARCH-007` must not register `SECB-ARCH-999`, and must not register a self-widened `SECB-ARCH-007@0.2.0` at `RESTRICTED` across three projects. | The author of the binding mechanism |
| **G3** | Grants cannot be self-widened. `project_scopes`, `supported_runtimes` and `max_data_classification` are not read from a record the promotion subject supplied (`DEF-A5`). | A negative test submits a manifest whose scope exceeds the authorizing decision's and asserts a typed deny, not a silent accept. A grep-style test asserts the resolver has no remaining read of these fields from an author-supplied record. | The author of the tier split |

**On "none dischargeable by its own producer":** this is a separation-of-duties
requirement on the *review*, not a claim that the tests are self-executing. `DEF-G1`
itself records that the superseded gate was *"drafted by this producer; signed by the
operator on this producer's recommendation"* — the failure mode this clause exists to
prevent.

**G2 depends on an unruled decision.** Its discharge test presumes a binding mechanism
exists. That mechanism is the subject of `SECB-ARCHI-DECISION-SKILLSHUB-R1-001` and is
not ruled. G2 is therefore drafted as a condition whose *test* is fixed and whose
*implementation* is ARCHI's to choose.

---

## Two cautions this packet is required to carry

### Caution (a) — Non-`PUBLISHED` registration is entirely ungoverned by the decision ledger

`registerSkill` (`src/registry/skill-resolver.mjs:112`) applies its decision-resolution
checks (`:128-148`) and its evidence-resolution checks (`:149-171`) **only inside** `if
(manifest.status === "PUBLISHED")` at `:120`, closing at `:172`. A manifest at
`CANDIDATE`, `SANDBOX`, `EVALUATION` or `REVIEW` registers with no ledger contact at all —
no promotion decision, no evidence, nothing.

Option 2 makes such registrations permissible where the current gate forbids them, so
this must be ruled on knowingly.

**It is acceptable ONLY because `DENY_NOT_PUBLISHED` (`:194-196`) makes such entries
inert.** They occupy a key and resolve to nothing. **It stops being acceptable the moment
`status` becomes mutable in place** — at which point a registration that bypassed every
ledger check would become a publication that bypassed every ledger check, by a single
field write. The manifests are deep-frozen at `:177`, so no in-place mutation exists
today. This caution should be recorded as a standing constraint on any future
status-transition API, not merely as an observation.

### Caution (b) — Registration is irreversible for the process lifetime

`registerSkill` throws `DENY_DUPLICATE_SKILL` at `:175` when the key
`skill_id@version` is already present, and there is **no unregister API** — stated in the
resolver's own header comment at `:57`: *"With no unregister API, a grant once made could
never expire and never be revoked"*.

Consequence for Option 2: **registering `A@0.1.0` at a pre-publication status makes that
exact version unpublishable for the lifetime of the process.** The later publication
attempt collides with the entry the earlier registration created. This is not a
theoretical edge — it is the direct operational consequence of permitting pre-publication
registration, and any promotion service built under Option 2 must either avoid
pre-publication registration for versions intended to publish, or an unregister/replace
path must be designed and governed first.

The preparer flags that a `DENY_DUPLICATE_SKILL` collision is a *fail-closed* outcome, so
it is a liveness problem rather than a security problem. It is recorded here because a
liveness trap discovered after `WP-SK-05` ships is more expensive than one ruled on now.

---

## Out of scope for this ruling — flagged, not folded in

**A condition suppressing `withheld_reasons` is NOT proposed as a G4.**

Verified item 3 establishes that the withheld tally is not protected by the current gate
and is live today. It would be easy to add a fourth condition suppressing it and present
the replacement as strictly stronger. The preparer declines to do that, because **it would
expand the gate beyond what it originally protected**, and a replacement record that
quietly acquires scope is exactly the drafting failure `DEF-G1` documents.

The tally's disclosure properties were deliberately engineered — the code comments at
`skills-hub-service.mjs:440-452` record that ordering-as-control was chosen after a
query-conditioned existence oracle was found and closed, and that "the corpus size is
still disclosed, but as a constant rather than a probe channel". Whether a constant
corpus-size disclosure is acceptable is a **live SEC question about a live channel**, and
it is independent of the registry gate.

**It is presented here as an explicit out-of-scope item for SEC to open as its own
decision, and it must not be read as covered by any ruling on this packet.**

---

## Procedural note — the route back is not DRAFT

`docs/00-governance/governance-baseline.md` §4 (lines 52-61) states the governance state
chain:

```text
DRAFT
→ REVIEW_REQUIRED
→ APPROVED_NOT_EFFECTIVE
→ EFFECTIVE
→ SUSPENDED
→ SUPERSEDED / REVOKED / RETIRED
```

The chain is unidirectional; **no arrow returns to DRAFT from any state**, and §1
principle 3 (line 11) makes that omission load-bearing: *"Every state transition is
explicitly permitted; unspecified transitions are denied."* A signed record therefore
cannot be edited back into draft.

**Precision the preparer owes SEC:** §4 does **not** contain a sentence prescribing "the
route is a superseding record". `SUPERSEDED` appears only as a token in the terminal state
list at line 58. The superseding route is a defensible *inference* from the state machine
plus §1 principle 3 — it is not quoted doctrine, and this packet does not present it as
quoted doctrine.

§3 (line 44) requires denial when *"approval is expired, revoked, replayed, or for a
different object"*. A superseding record is a different object. **The 2026-08-01 signature
does not carry to it.** This packet requires its own signature; it inherits none.

---

## Exception fields (`governance-baseline.md` §5, lines 65-75)

This packet varies a signed control, so §5's nine fields are carried in full.

| # | Field | Value |
|---|---|---|
| 1 | **Exact control being varied** | The "Registry gate" of `SECB-SEC-DECISION-SKILLSHUB-C3-001` (`:122-124`, `:133-134`): "do not populate the resolver registry until Phase 5 distribution hardening is complete." |
| 2 | **Business justification** | The control is circular (`DEF-G1`, HIGH — blocks everything): `WP-SK-05`'s scope includes "resolver registration" and its exit is a `PUBLISHED` skill, so the gate forbids the act whose completion releases it. It cannot be discharged, and it blocks every remaining SkillsHub work package. |
| 3 | **Affected project, environment, data, time window** | Project: SecB (`secb-local`). Environment: local development only; no deployed environment exists. Data: skill package content under `.agents/skills/`, assessed at `SECB-SEC-DECISION-SKILLSHUB-C3-001` as 0 of 22 packages carrying sensitive content. Time window: from ruling until G1–G3 are all discharged, or until superseded. |
| 4 | **Compensating controls** | Conditions G1, G2, G3 above, bound to the `PUBLISHED` transition rather than to a work package. Plus the two standing facts that make pre-publication registration inert: `DENY_NOT_PUBLISHED` (`skill-resolver.mjs:194-196`) and deep-freeze of registered manifests (`:177`). |
| 5 | **Accountable owner** | *[ blank — for GOV to assign. The preparer notes it must not be the producer of any of G1–G3. ]* |
| 6 | **Independent review** | *[ blank — for GOV to assign. Three separate discharges required; see the "Not dischargeable by" column. ]* |
| 7 | **Residual risk** | Pre-publication registration becomes ungoverned by the decision ledger (Caution a) — inert while `DENY_NOT_PUBLISHED` holds and manifests are immutable, materially severe if either changes. Version keys become permanently consumed (Caution b) — liveness, fail-closed. The `withheld_reasons` channel remains live and unaddressed (out-of-scope note) — unchanged by this ruling, neither improved nor worsened. |
| 8 | **Expiry and revocation conditions** | Expires on discharge of all three conditions, at which point publication is permitted and the exception is spent. Revoked immediately if: `status` becomes mutable in place on a registered manifest; an unregister or replace API is added without its own governed review; or any of G1–G3 is discharged by its own producer. |
| 9 | **Evidence destination** | *[ blank — for GOV. The preparer notes no effective Project Contract exists to name one; see `SECB-GOV-DECISION-DOCTRINE-EFFECTIVENESS-001`. ]* |

**§5 line 77 also states:** *"No standing or self-renewing exception is permitted for R3/R4
controls."* SkillsHub work packages are rated R3 (`secb-skillshub-prd-001.md:868-869`).
Field 8 is therefore drafted with a discharge condition and a revocation trigger and no
renewal clause, and SEC should reject any amendment that makes it standing.

---

## What SEC and GOV are being asked to sign

- [ ] **Option 1** — keep the gate, resequence the work packages
- [ ] **Option 2** — supersede the gate with conditions G1–G3 bound to `PUBLISHED`

Condition-by-condition (Option 2 only):

- [ ] **G1** as drafted   [ ] G1 amended   [ ] G1 rejected
- [ ] **G2** as drafted   [ ] G2 amended   [ ] G2 rejected
- [ ] **G3** as drafted   [ ] G3 amended   [ ] G3 rejected

Cautions, acknowledged as ruled-upon rather than noted:

- [ ] **Caution (a)** — non-`PUBLISHED` registration is ungoverned by the decision ledger,
      accepted as inert, with revocation on any status-mutability change
- [ ] **Caution (b)** — pre-publication registration permanently consumes the version key

Out of scope:

- [ ] **`withheld_reasons` acknowledged as NOT covered by this ruling**, to be opened as a
      separate SEC decision

```
Option:              [ blank — for SEC ]
G1:                  [ blank ]
G2:                  [ blank ]
G3:                  [ blank ]
Caution (a):         [ blank ]
Caution (b):         [ blank ]
withheld_reasons:    [ blank — separate decision ]
Accountable owner:   [ blank — for GOV ]
Independent review:  [ blank — for GOV ]
Evidence dest.:      [ blank — for GOV ]
Supersedes:          SECB-SEC-DECISION-SKILLSHUB-C3-001, Registry gate clause only
Decided by (SEC):    [ blank ]
Decided by (GOV):    [ blank ]
Date:                [ blank ]
```

---

## Recommendation

**Option 2**, with G1–G3 as drafted, both cautions ruled explicitly rather than noted, and
`withheld_reasons` opened separately.

The decisive argument is verified item 2: the gate is written against registry population,
but everything it protects is reached only through `PUBLISHED`. Binding the control to the
status transition puts it where the protection actually is, and that is why the
replacement can be both dischargeable and stronger — it is not a trade.

The preparer wants one thing on the record against its own recommendation. The original
gate, whatever its drafting defect, had the property that it stopped everything. The
replacement stops less by design. If SEC's judgement is that a blunt stop is currently the
right posture for a hub with no effective Project Contract behind it, Option 1 — or a
straight suspension with no replacement — is the more conservative call, and the preparer
has no standing to argue it down.

**Where this recommendation could be wrong.** G2's discharge test presumes a binding
mechanism that ARCHI has not ruled. If ARCHI rules Option D (separate grant ledger) in
`SECB-ARCHI-DECISION-SKILLSHUB-R1-001`, G2's test needs rewriting and this packet should
be re-prepared rather than amended in place.

**Authority statement.** This document prepares a decision. It makes none, approves
nothing, and authorizes nothing. It does not itself supersede
`SECB-SEC-DECISION-SKILLSHUB-C3-001`; only a signed record can do that. Its preparer holds
no verdict authority; the verified facts above are cited so they can be re-derived rather
than trusted.

**Evidence:** `SECB-SEC-DECISION-SKILLSHUB-C3-001:36-41, 122-124, 133-134`;
`SECB-PRD-SKILLSHUB-DEFECTS-001` `DEF-G1` (line 292), `DEF-C3`, `DEF-A5`, `DEF-A8`,
`DEF-R1`; `secb-skillshub-prd-001.md:443, 844, 868, 869`;
`src/registry/skill-resolver.mjs:57, 112, 120-172, 175, 177, 194-196, 213`;
`src/skills/skills-hub-service.mjs:266, 338, 353, 394, 417, 440-452, 468, 470-473, 490`;
`docs/00-governance/governance-baseline.md:11, 44, 52-61, 65-75, 77`;
`wp-sk-01-manifest-convergence.work-package.yaml` AC-10.

```yaml
self_certification:
  agent_id: claude-immune
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
