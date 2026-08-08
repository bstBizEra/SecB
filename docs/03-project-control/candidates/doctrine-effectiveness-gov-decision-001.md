# GOV Decision Request — Are `DRAFT / NOT EFFECTIVE` documents in the pinned baseline binding?

**Document ID:** `SECB-GOV-DECISION-DOCTRINE-EFFECTIVENESS-001`
**Status:** `RULED — option C, two tiers. Symmetry rule ADOPTED. The docs/README.md line 6 sub-item was NOT ruled and remains open.`

> **RULED 2026-08-03 by Operator (BizEra).** See [`SECB-DECISION-SHEET-001`](secb-decision-sheet-001.md), which is the record of record for this ruling. This document is unchanged below and remains the full statement of the reasoning.

**Decision owner:** GOV
**Prepared by:** Claude Code (worker agent) — prepares the decision, does not make it
**Prepared at:** 2026-08-02, baseline `dcbabc4`; **re-verified at `b7d7f41`**
**Blocks:** every requirement, defect severity, and doc-parity control whose only source
is a `DRAFT / NOT EFFECTIVE` document — which, per the §3 table below, is most of them

---

## The question

**Does a document that declares itself `DRAFT / NOT EFFECTIVE`, inside a pack the tree
calls "the currently pinned baseline", bind anyone to anything?**

The programme cites these documents constantly — as requirements, as the authority for
defect severities, as the parity target for code. It also stamps them not effective. Both
practices are consistent with the tree; they are not consistent with each other.

---

## Why this is a decision and not a cleanup

Every answer costs something real, and the tree currently has it both ways: doctrine is
cited when it supports a requirement and discounted when it imposes one. Section "The
symmetry rule" below gives a concrete instance where both moves were made against the
**same section of the same document**. That is the pattern a ruling has to stop, and it
cannot be stopped by editing status headers.

---

## Verified inventory

Re-derived at baseline `dcbabc4`. **Where the brief that produced this packet was
imprecise, the correction is stated in place.**

**1. The pack declares itself not effective, and the declaration is machine-enforced.**
`docs/MANIFEST.json:4` — `"status": "DRAFT_NOT_EFFECTIVE"`. `:6` —
`"file_count_excluding_manifests": 71`, which equals the actual array length (71 entries,
lines 8-78). `tools/validate-foundation.mjs:36`:

```js
assert(docsManifest.status === "DRAFT_NOT_EFFECTIVE", "docs-manifest.status", "draft and not effective");
```

Confirmed at exactly line 36. Lines 37-41 additionally assert the declared count equals
`files.length`, so both the status and the pack membership are enforced in code, not
merely asserted in prose.

**2. Zero doctrine documents declare themselves effective.** This holds under every
definition tried.

**3. The 34 / 3 breakdown — CORRECTED.** The brief's figures (40 documents, 34
not-effective, 3 with no status header) are arithmetically right only under a **broad**
definition of "doctrine": the 34 top-level `.md` files under `docs/00-governance` …
`docs/09-delivery`, plus the four legacy ADRs `0001`-`0004`, plus root `AGENTS.md` and
`docs/AGENTS.md` = 40.

Two corrections GOV should have before ruling:

- **Four of those 40 are not members of the pinned pack** (`SECB-GOV-001.md`,
  `decision-rights.md`, `governing-principles.md`,
  `agents-instructions-om-v0.1-candidate.md`). Scoped strictly to `docs/MANIFEST.json`
  membership the set is **36**, of which **33** carry a not-effective-style status and
  **3** carry no status header.
- **The brief's 40 = 34 + 3 leaves 3 unaccounted.** They are:
  `docs/00-governance/SECB-GOV-001.md` (status carried in a document-control table, line
  9: `| Status | DRAFT_FOR_IMPLEMENTATION_REVIEW |` — the only forward-leaning status in
  the corpus, and it belongs to the *competing* v0.1 pack), root `AGENTS.md`, and
  `docs/AGENTS.md`.

The distinct status strings actually present, with counts: `DRAFT / NOT EFFECTIVE` (23),
`DRAFT / NOT AUTHORIZED` (3), `DRAFT / RED / NOT EFFECTIVE` (1), `DRAFT / NOT RUN` (1),
`DRAFT / NOT EFFECTIVE until adopted per §23 and merged by the operator` (1), `DRAFT /
CONTROLLED INTAKE CANDIDATE / NOT EFFECTIVE` (1), `Proposed / Not Effective` (4, the legacy
ADRs).

**4. The three with no status header, confirmed by name:**
`docs/00-governance/decision-rights.md`, `docs/00-governance/governing-principles.md`,
`docs/00-governance/system-of-record-boundaries.md`. *(Under strict pack scope the
no-header set is `system-of-record-boundaries.md`, `AGENTS.md`, `docs/AGENTS.md`, because
the first two are not pack members.)*

**5. `docs/README.md:6` is the single artifact asserting the pack is pinned:**

```text
- **Phase 0 operating constitution** (legacy sections `00`–`09` + ADR 0001–0004) — the
  currently pinned baseline; retire only by governed decision.
```

**6. `docs/README.md` is itself a member of the pack it declares pinned.**
`docs/MANIFEST.json:55` — `"docs/README.md",`. The pack it vouches for carries
`DRAFT_NOT_EFFECTIVE` at line 4 of the same manifest.

**6a. And the same README contradicts a signed record about whether a ruling exists.**
Verified at `b7d7f41`, recorded as `DEF-A12` (`skillshub-prd-defect-register-001.md:386`).
`docs/README.md:98` reads:

```text
- [SkillsHub DEF-C3 SEC decision request](03-project-control/candidates/skillshub-def-c3-sec-decision-001.md) *(DRAFT / AWAITING SEC RULING)*
```

while `skillshub-def-c3-sec-decision-001.md:4` reads `**Status:** RULED — Ruling B with
conditions, 2026-08-01` and `:131` carries `Decided by: Operator (BizEra)`.

This is directly material to the question before GOV. The single artifact that asserts the
pack is "the currently pinned baseline" (item 5) is demonstrably not maintained in step
with the records it indexes. Reading (a) — README governs — has to account for the fact
that README is currently wrong about a signed operator decision. The preparer notes this
cuts against reading (a) specifically, and does not distinguish between (b) and (c).

**7. No effective Project Contract exists.** All three instances are `DRAFT`
(`secb-local.project-contract.yaml:20`, `secb-local-v2-r2.project-contract.yaml:16`, and
the template carries no value). The only file in the repository with an EFFECTIVE-valued
status is `docs/03-project-control/effective/p0-wave-1-authority-packet.yaml`
(`record_status: "EFFECTIVE_TIME_BOUNDED"`), and its window is four hours on 2026-07-17 —
long expired, and it is an authority packet, not a Project Contract.

---

## The three readings available

### Reading (a) — `docs/README.md` governs

*Shape:* the pack is the pinned baseline because the tree's own index says so, and pinned
means binding.

*Consequence, stated against the reading:* **it is self-defeating.** If README's clause
binds, then so does every same-status clause — including
`docs/03-project-control/project-contract.md:28-41`, the Activation Rule:

> A Project Contract is effective only when: schema validation passes; required owners and
> signatures exist; […] and human GOV issues an effective activation decision.
>
> **Registration without effectiveness does not authorize work.**

Per verified item 7, no effective Project Contract exists. Reading (a) therefore binds the
tree to a rule under which no work in the tree is authorized. It does not fail because it
is unreasonable; it fails because it proves more than anyone wants.

### Reading (b) — the status headers govern

*Shape:* `NOT EFFECTIVE` means what it says. Nothing in the pack binds.

*Consequence, stated against the reading:* **it over-reads the negation.** Root
`AGENTS.md:29` makes the pack *required reading*: "Before beginning a bounded slice, read
the minimum sufficient chain in this order", followed by a seven-item chain including
`governance-baseline.md` and `project-contract.md`. And `AGENTS.md:41` withholds a
**specific, enumerated** list of effects, not a general one:

> The new documentation pack is `DRAFT / NOT EFFECTIVE`. Its presence satisfies
> required-reading availability but does not create an effective Project Contract,
> authorize a Work Package, assign a server-derived identity, accept evidence, or activate
> SecB. Those require their own governed records and independent decisions.

Five named effects are withheld. Nothing else is. A blanket "nothing binds" reading treats
an enumerated withholding as a total one, and it also has to explain why "satisfies
required-reading availability" is a claim the same sentence makes affirmatively.

**A caveat that weakens this packet's own evidence, recorded rather than omitted.** The
`AGENTS.md` quoted above is **this branch's** `AGENTS.md`, and this branch forks before the
clause that governs skill effectiveness. Verified independently at `b7d7f41`, and recorded
as `DEF-A13` (`skillshub-prd-defect-register-001.md:387`):

- `git merge-base --is-ancestor 859468a HEAD` exits **1** — `859468a` ("[GOV] Register
  Skills Pack v0.1 in the root AGENTS.md skills registry") is on `main` and is **not** an
  ancestor of this branch.
- `git diff --numstat HEAD main -- AGENTS.md` reports **51 insertions, 0 deletions**.

The absent text is effective on `main` and states that *"every skill is CANDIDATE / NOT
EFFECTIVE, mutation-class M0"* and that *"Making any skill EFFECTIVE (adoption/publication)
is a separate operator/SEC-GOV act — committing the pack did not adopt it"*.

Two consequences GOV should weigh. First, the `AGENTS.md:41` quotation this reading rests
on is taken from a file missing 51 lines that exist on `main`, so the enumeration of five
withheld effects **may not be the current enumeration**. Second, and larger: the question
"what does `NOT EFFECTIVE` bind" has been argued across this whole programme on a branch
that does not contain a clause directly answering it for skills. **This packet inherits
that defect.** It is not repaired by ruling on the readings below; it is repaired by
rebasing or by re-deriving the question against `main`, and GOV may reasonably decline to
rule until that is done.

The §3 consequence table below states what reading (b) costs in concrete terms.

### Reading (c) — Two tiers: reference authority vs operative authority

*Shape:* the pack is authoritative as a **reference** — it defines terms, controls,
requirement IDs and severities, and code may be held to parity with it — and is not
authoritative as an **operative grant** — it activates nothing, authorizes no work
package, and creates no effective contract.

*Consequence:* citations survive; grants do not. Requirement IDs stay real, defect
severities stay real, doc-parity stays enforceable, and none of that authorizes a work
package or declares anything operational.

*This is not a new invention.* `docs/00-governance/governance-baseline.md:61` already says
it:

> Approval and effectiveness are separate. A document may be approved as a design without
> granting operational authority.

*Cost:* the tier boundary has to be drawn explicitly, or reading (c) becomes a licence to
call any inconvenient clause "operative" and any convenient one "reference". The symmetry
rule below is the proposed guard against exactly that.

---

## The symmetry rule — an explicit item to rule on

**Proposed rule:** *within one status tier, every clause has the same force. No clause may
be treated as binding while a same-status clause is treated as unavailable.*

This is put forward as a separate signable item because without it, reading (c) is
unfalsifiable and readings (a) and (b) are unenforceable.

**The concrete instance.** `governance-baseline.md` §5 has two limbs:

- a **prohibition**, line 77: *"No standing or self-renewing exception is permitted for
  R3/R4 controls."*
- an **enabling route**, lines 65-75: *"Exceptions must identify:"* followed by nine
  fields — exact control being varied; business justification; affected project,
  environment, data, and time window; compensating controls; accountable owner;
  independent review; residual risk; expiry and revocation conditions; evidence
  destination.

**The prohibition was used to delete a requirement limb.** `FR-SKM-007`
(`secb-skillshub-prd-001.md:651`) records: *"The earlier form offered 'or their absence is
recorded as an accepted, documented limitation,' which is a self-granted standing exception
to an R3 control and is forbidden by governance-baseline.md."* That is §5 line 77 being
given binding force against a requirement.

**The enabling route has never been offered.** The string "Exceptions must identify"
appears exactly once in `docs/` — in `governance-baseline.md:65` itself. No exception
record carrying the nine fields exists anywhere in the tree; "compensating control"
appears in only one other file, an advisory. The route was defined and never once
presented to anyone as available.

So the same section of the same not-effective document was binding when it removed an
option and unavailable when it would have supplied one. **Whichever reading GOV takes,
that asymmetry is the thing to rule out.**

*Disclosure:* this packet is itself an application of the enabling limb —
`SECB-SEC-GOV-DECISION-SKILLSHUB-G1-001` carries the nine fields. If GOV rules the pack
non-binding under reading (b), that packet's exception fields become decorative, and it
should be re-prepared rather than left standing.

---

## The §3 consequence table — what stops being required under reading (b)

Not exhaustive. These are the load-bearing cases the preparer verified.

| Artifact | Where | What lapses under reading (b) |
|---|---|---|
| `FR-SKE-011` | `secb-skillshub-prd-001.md:667` | Cost, latency and context budget measured per run and carried into the promotion record. Already once downgraded to `SHOULD` and restored, on the reasoning that `SECB-SKILL-001` lists it as publication gate 9 and "the producer had no standing to reclassify it". Under (b) the restoring authority is not effective either. |
| `FR-SKP-009` | `secb-skillshub-prd-001.md:682` | Restricted publication precedes general publication, with a bounded consumer set and review date. Same restoration history, same lapse. |
| `FR-SKM-007` | `secb-skillshub-prd-001.md:651` | Work Package / environment / Agent Instance scope resolved before promotion is enabled. **Doubly affected**: the requirement lapses, *and* the §5 prohibition used to strip its escape clause lapses with it — so the deleted limb arguably returns. |
| `DEF-R2` severity | `skillshub-prd-defect-register-001.md:290` | A **CRITICAL** rating whose entire basis is a `governance-baseline.md` §3 citation: denial required when approval "is expired, revoked, replayed, or for a different object". Under (b) the CRITICAL is unsourced. *(Separate matter for the register's owner: code at `src/registry/skill-resolver.mjs:53, 202` and `tests/skill-resolution-time-authority.test.mjs:79` indicate DEF-R2 was remediated by WP-SK-R2 and the register text was not updated.)* |
| `(LEGACY — authoritative)` | `src/control/risk-registry.mjs:19` | A source-code comment naming `docs/00-governance/authority-and-risk-model.md §2` as authoritative for the risk registry's contents. Under (b), production code declares a not-effective document authoritative over itself. |
| Five doc-parity tests | `tests/risk-registry.test.mjs:62, 77, 91, 104, 118` | Tests that parse governance markdown at runtime and fail if code and doctrine diverge. Under (b) they assert parity with a document that binds nobody — the test still runs, but it is no longer a control. |

**Correction to the brief — these tests are NOT CI-enforced.** There is no `.github/`
directory and no workflow file anywhere in the repository. The only enforcement is
`package.json:24` — `"test": "npm run validate && node --test tests/*.test.mjs"` — run
locally. The comment at `risk-registry.mjs:36` asserting that drift "fails CI" describes a
pipeline that does not exist in this tree. GOV should note that this is the same shape as
`DEF-D1`: a code comment asserting a control that is not there. It is reported here as a
finding in its own right, not folded into the effectiveness question.

---

## What GOV is being asked to sign

- [ ] **Reading (a)** — `docs/README.md` governs; the pinned pack binds
- [ ] **Reading (b)** — the status headers govern; nothing in the pack binds
- [ ] **Reading (c)** — two tiers: reference authority binds, operative authority does not

Separately, and required regardless of the reading:

- [ ] **The symmetry rule is adopted** — within one status tier every clause has the same
      force; no clause binds while a same-status clause is treated as unavailable
- [ ] **The §5 asymmetry is corrected** — either the nine-field exception route is
      published as an available route, or `FR-SKM-007`'s deletion is re-derived from an
      authority that does bind
- [ ] **The `fails CI` comment at `risk-registry.mjs:36` is corrected or a CI pipeline is
      created** — recorded as a separate finding, not covered by the reading above
- [ ] **`DEF-A13` is dispositioned before or alongside this ruling** — this branch does not
      contain the `AGENTS.md` clause governing skill effectiveness (51 insertions on
      `main`, `859468a` not an ancestor of `HEAD`). GOV may rule, defer pending rebase, or
      rule and mark the ruling for re-derivation against `main`.

```
Reading:                [ blank — for GOV ]
Decided by:             [ blank ]
Date:                   [ blank ]
Symmetry rule:          [ ] adopted   [ ] rejected
§5 asymmetry:           [ ] route published   [ ] deletion re-derived   [ ] neither
risk-registry.mjs:36:   [ ] comment corrected   [ ] CI created   [ ] accepted as-is
DEF-A13 (branch fork):  [ ] rule now   [ ] defer pending rebase   [ ] rule + re-derive
Tier boundary drawn at: [ blank — required if Reading (c) ]
```

---

## Recommendation

**Reading (c), with the symmetry rule adopted.**

The argument is that reading (c) is the only one the tree can actually survive, and it is
already written into the baseline at `governance-baseline.md:61` — "Approval and
effectiveness are separate" — so adopting it is a clarification rather than a new
doctrine. Reading (a) proves that no work is authorized. Reading (b) costs the entire §3
table, including the authority that production code cites over itself at
`risk-registry.mjs:19`.

The symmetry rule is the part the preparer would argue hardest for, and it matters more
than which reading wins. Readings (a) and (b) are at least self-consistent. What the tree
does today is neither — it takes binding force from doctrine where doctrine imposes a
prohibition and denies it where doctrine offers a route, within one section of one
document. A ruling that picks a reading and does not adopt the symmetry rule will leave
that behaviour available under whichever reading wins.

**Where this recommendation could be wrong.** Reading (c) requires GOV to draw the
reference/operative boundary explicitly, and the preparer has not drafted that boundary —
deliberately, because drawing it is the substance of the ruling and not a preparer's call.
If GOV judges that the boundary cannot be drawn crisply enough to resist motivated
reading, then (b) plus a deliberate, costed re-derivation of the §3 table from records
that do bind is the more honest answer, even though it is far more expensive.

**Corrections the preparer is obliged to record.** Two claims in this packet's brief did
not survive verification: the 34/3 breakdown holds only under a definition that includes
four non-members of the pinned pack and leaves three documents unaccounted for (item 3),
and the doc-parity tests are not CI-enforced because no CI exists (§3 table note). A third
is recorded in the sibling packet `SECB-SEC-GOV-DECISION-SKILLSHUB-G1-001`: §4 of the
baseline does not state in words that the route out of a signed state is a superseding
record; that is an inference from the unidirectional state chain.

**Authority statement.** This document prepares a decision. It makes none, approves
nothing, and authorizes nothing. Its preparer holds no verdict authority; the verified
facts above are cited so they can be re-derived rather than trusted.

**Evidence:** `docs/MANIFEST.json:4, 6, 8-78, 55`; `tools/validate-foundation.mjs:36-41`;
`docs/README.md:6`; `docs/03-project-control/project-contract.md:28-41`;
`AGENTS.md:29, 41`; `docs/00-governance/governance-baseline.md:11, 44, 52-61, 61, 65-75,
77`; `docs/00-governance/SECB-GOV-001.md:9`;
`docs/03-project-control/effective/p0-wave-1-authority-packet.yaml`;
`secb-skillshub-prd-001.md:651, 667, 682`; `skillshub-prd-defect-register-001.md:290`;
`src/control/risk-registry.mjs:19, 36`; `tests/risk-registry.test.mjs:62, 77, 91, 104,
118`; `package.json:24`.

```yaml
self_certification:
  agent_id: claude-immune
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
