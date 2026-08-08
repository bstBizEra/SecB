# SkillsHub PRD — Open Defect Register

**Document ID:** `SECB-PRD-SKILLSHUB-DEFECTS-001`
**Version:** `1.6.0-draft`
**Status:** `CLOSED — programme superseded; see SS O`
**Applies to:** `SECB-PRD-SKILLSHUB-001` v0.4.0-draft
**Producer:** Claude Code (worker agent) — the same producer as the document these defects are in
**Produced at:** 2026-08-01
**Repository:** `C:\laragon\www\SecB`, branch `feat/secb-ruflo-command-center`

## Why this register exists

`SECB-PRD-SKILLSHUB-001` was reviewed three times. Each round found substantive
false claims, and the producer's own verification passed before each round —
including a mechanical sweep that certified 24 computed facts while the two most
consequential asserted claims went uncaught.

The pattern is consistent and worth stating plainly: **the producer is reliable
on facts it computes and unreliable on facts it asserts.** A fourth
producer-directed rework would apply the same method that produced the first
three rounds of error.

The disposition is therefore to **stop reworking the document**, record every
known and suspected defect here, and downgrade the document's standing to
current-state discovery carrying a known defect register — leaving to REV, SEC,
ARCHI and GOV which findings are real and which requirements survive.

## How to read status

| Field | Meaning |
|---|---|
| `PRODUCER-VERIFIED` | The producer independently re-derived this from the tree. Treat as established. |
| `REPORTED` | An independent reviewer asserted it; **the producer has NOT verified it.** Treat as a lead, not a fact. |
| `FIXED` | Closed in code, with a regression test, and re-probed. |
| `RESIDUAL` | Knowingly not closed; the reason is recorded. |

Marking a reviewer's finding `REPORTED` is not scepticism about the reviewer. It
records that this producer did not re-derive it, so that no one inherits an
unverified claim as settled — which is the precise failure this register exists
to stop.

---

## A. False claims in the document — producer-verified

These were independently re-derived. They are established, and the document is
wrong.

| ID | Location | The claim | What is actually true | Status |
|---|---|---|---|---|
| `DEF-A1` | `SKILL-DRIFT-01`, `SKILL-DRIFT-10`, §7.1, §9.1, §22 item 1 | "Four shapes exist, **two of them independently enforced**"; the pack manifest is "validated by" `.agents/schemas/skill-manifest.schema.json`; classified **Contradiction** — "two enforced schemas for one concept" | `.agents/scripts/validate_pack.py` contains **zero** references to any schema, imports no JSON-Schema validator, and checks exactly three manifest fields — `name`, `classification.mutation_class`, `controls.secret_handling` — **none** of which is `skill_id`, `version` or `status`. The pack schema is read by nothing. The true state is **one enforced contract and one declared-but-unenforced schema**. The field-set divergence is real; the enforcement collision is not | `PRODUCER-VERIFIED` |
| `DEF-A2` | Absent from the whole document | The current-state survey of skill-grant surfaces | `approved_skills` is a governed per-agent grant field defined in `contracts/agent-registration.schema.json` and **populated** in `src/registry/ruflo-adapters.mjs` with three names — `swarm-orchestration`, `memory-management`, `verification-quality` — **none of which exists** in the 25-package corpus. A live, governed skill-grant axis is missing from a document whose subject is skill grants | `PRODUCER-VERIFIED` |

`DEF-A1` matters disproportionately: it is the evidence under the finding that
§22 calls the blocking dependency for the entire critical path.

`DEF-A2` matters because six of the seven doctrinal scope dimensions already
exist on the **caller identity** side (`permitted_roles`, `environment_scopes`,
`agent_instance_id`, `project_scopes`, `max_data_classification`), which
reframes `OD-SK-02` — the question may be less "extend the skill contract" than
"bind the two existing contracts".

---

## B. Reported by independent review

> **ADJUDICATED at v1.1.0.** Every finding below has since been independently
> re-derived. See §G for verdicts. The `REPORTED` markers in this section are
> retained as the historical record of their status when written; **§G is
> authoritative.**

Six HIGH, sixteen MEDIUM and seven LOW were reported against v0.3.0. `DEF-A1`
and `DEF-A2` above are the two that were subsequently producer-verified. The
remainder are recorded here as leads.

### B.1 High

| ID | Location | Reported finding | Status |
|---|---|---|---|
| `DEF-B1` | §11.5, §11.6, `UJ-SK-04`, §16, `GATE-SK-05` | No requirement verifies served skill content against the promoted digest. Every digest reference is at intake, evaluation or promotion; none at resolution or content load. A package promoted at digest X can be edited afterwards and served indefinitely under the promoted identity and approval history | `REPORTED` |
| `DEF-B2` | `UJ-SK-04` step 1 vs `FR-SKD-003a`; `FR-SKD-002` | The journey has the agent *asserting* project, role, runtime and Work Package — the exact pattern `FR-SKD-003a` forbids. Deeper: `FR-SKD-002` requires a fully asserted seven-dimension context, `FR-SKD-003a` forbids the caller supplying it, and Work Package is inherently per-task so cannot live in a registered identity. Under both requirements the dimension can be neither asserted nor derived, so every resolution denies | `REPORTED` |
| `DEF-B3` | §20 Assumption 3 | The assumption flagged "UNVERIFIED and load-bearing" is answerable from `contracts/decision-record.schema.json`. That contract also **requires** `work_package_id` on every decision — which collides with the option `OD-SK-02` offers GOV of formally narrowing the scope set, and is stated nowhere in §11.4 or `GATE-SK-04` | `REPORTED` |
| `DEF-B4` | `FR-SKM-003b` vs `OD-SK-10` | The MUST decides that declared `required_tools`/`required_mcp_methods` bound the tool grants a promotion may issue — which is the open question `OD-SK-10` assigns to ARCHI + SEC. The document handles this boundary correctly elsewhere (`FR-SKM-007` defers to `OD-SK-02`, `FR-SKD-003` flags `OD-SK-11`); here it does not | `REPORTED` |

### B.2 Medium

| ID | Location | Reported finding | Status |
|---|---|---|---|
| `DEF-B5` | `SKILL-DRIFT-13`, §9.1, `FR-SKM-003b` | `SECB-SKILL-001`'s "a skill **may contain** … tool configuration, model requirements, MCP dependencies" is permissive enumeration, rendered as a documented expectation and a Gap, then made a MUST. Producer preference attributed to doctrine. Contrast `FR-SKM-003a`, which *is* doctrine-backed by publication gate 4 | `REPORTED` |
| `DEF-B6` | §6.2 bullet 1 | "Automatic promotion of **any kind**" is scaled up from a cited prohibition on *transcript-to-knowledge* automatic promotion — in the section that declares itself immune to later scoping decisions. The other three bullets are verbatim-backed | `REPORTED` |
| `DEF-B7` | `SKILL-DRIFT-06`, `FR-SKU-003` | The finding says the tool "name **and description** overstate" read-only, but the description carries an accurate explicit `Read-only.` declaration. Only the tool *name* and the stray word "advance" overstate, and no requirement addresses a misleading tool name | `REPORTED` |
| `DEF-B8` | §18 risk register | Mitigates runner scope creep by "constrain to the declared four case types" — which instructs the programme to breach `FR-SKE-012` (MUST, rationalization) and `GATE-SK-03`. Debris predating v0.2.0 | `REPORTED` |
| `DEF-B9` | §4.1 criterion 3 | Omits rationalization from the evidence types, so the MVP can be declared successful while `GATE-SK-03` fails. Same debris as `DEF-B8` | `REPORTED` |
| `DEF-B10` | §16 vs §11.2 | The verification matrix has no row for the manifest contract. Ten MUSTs (`FR-SKM-001`–`007` incl. `003a`–`003d`) — the area §22 calls the blocking dependency — have zero coverage. `GATE-SK-01` also omits `FR-SKM-005` and the `003a/b/c` additions | `REPORTED` |
| `DEF-B11` | `FR-SKC-007`, `FR-SKI-008`, `FR-SKM-005` | Three MUSTs have no exit gate, in a document defining MUST as "required for MVP exit". `FR-SKC-007` (drift monitoring) is additionally delivered by no work package, despite §6.4 pointedly saying it is "**not** deferred" | `REPORTED` |
| `DEF-B12` | `FR-SKM-007` vs `GATE-SK-04`/`GATE-SK-05`, §15 | The requirement's point is that scope dimensions resolve "before promotion is enabled", but the only gate enforcing the scope set is `GATE-SK-05`, which sits after `GATE-SK-04` Promotion, and `WP-SK-06` depends on `WP-SK-05`. The plan orders it the other way | `REPORTED` |
| `DEF-B13` | `FR-SKD-003b`, `WP-SK-12`, `SKILL-DRIFT-15` | The only requirement for the highest-severity live finding is dischargeable by adding a paragraph to a README — the scripts keep working and nothing detects or prevents their use. The same escape-hatch shape the producer removed from `FR-SKM-007` | `REPORTED` |
| `DEF-B14` | §22 vs §19 | `OD-SK-04`, `OD-SK-06`, `OD-SK-08`, `OD-SK-10`, `OD-SK-12` and `SKILL-DRIFT-15` itself are unrouted. `OD-SK-12` appears exactly once in the document, in its own §19 row, so the highest-severity live finding has no owner inside the document | `REPORTED` |
| `DEF-B15` | §7 header vs §7.1 MCP-surface row, `SKILL-FIX-07` | Post-baseline observations sit inside a table headed "All observations verified at baseline `e0de4f3`". The `DENY_CALLER_PROJECT_SCOPE` behaviour did not exist at that commit. Same provenance failure §22 item 6 instructs REV to hunt for. *(Independently reported by two reviewers.)* | `REPORTED` |
| `DEF-B16` | `SKILL-DRIFT-01`, `SKILL-DRIFT-10` vs `OD-SK-12`, §7.2 | Both Contradiction verdicts presuppose the `.agents/` pack is governed, while `OD-SK-12` says its status is ambiguous and the §7.2 diagram labels it "ungoverned by SecB". With `DEF-A1`, both are more accurately Gaps | `REPORTED` |
| `DEF-B17` | §15, `WP-SK-05`/`WP-SK-06` | `M3` is chosen by excluding `M2` rather than by matching `M3`'s definition ("integration candidate creation"); minting live governance decisions in an authoritative ledger is arguably `M4`. `WP-SK-06`'s `M3` is asserted with no reasoning. Note the standing rule that an agent may not self-upgrade risk or mutation authority — these are proposals for GOV | `REPORTED` |
| `DEF-B18` | Handoff `risks`, `recommended_next_action`, `decisions_made`, `work_completed` | Stale fields overstate open exposure by one finding of the most severe class and route a withdrawn finding to SEC | `FIXED` — see §D |
| `DEF-B19` | Handoff `objective`, `authorized_scope`, `limitations` | The frozen review scope (`894b720`) no longer contains the artifact under review (v0.4.0-draft). The freeze rule and the review request contradict each other | `FIXED` — see §D |
| `DEF-B20` | Handoff `artifacts_created` | Under-reports the `e0de4f3` write set by five files including two under `src/mcp`. Since no work package governs this work, this is the only write-set record REV has | `FIXED` — see §D |

### B.3 Low

| ID | Reported finding | Status |
|---|---|---|
| `DEF-B21` | Handoff `confidence` ("medium-high") contradicts its own `review_implication` ("treat every remaining state claim as suspect") | `REPORTED` |
| `DEF-B22` | `envelope_sha256: UNSET_AT_AUTHORING` — a governance record dispatched for review cannot be shown to be the record dispatched | `REPORTED` |
| `DEF-B23` | §19 lists `OD-SK-10` after `OD-SK-12` (insertion debris) | `REPORTED` |
| `DEF-B24` | §7.4 claims §22 routes both §7.4 and §7.3 to REV; §22 names only §7.3. *(Independently reported by two reviewers.)* | `REPORTED` |
| `DEF-B25` | "Deterministic runner" in `FR-SKE-001`/`GATE-SK-03` is unsatisfiable against `NFR-SKREL-003` and §20 assumption 4; `NFR-SKREL-003`'s formulation is the correct one | `REPORTED` |
| `DEF-B26` | `SKILL-DRIFT-09` is not a drift finding — it says the system behaves correctly "by design", so there is no documented-versus-observed divergence. Also `DENY_UNGOVERNED_PACKAGE` is a hub-level code absent from the document's deny-code accounting | `REPORTED` |
| `DEF-B27` | `FR-SKP-010` states an intake control inside the Promotion block and gates it at `GATE-SK-04` rather than `GATE-SK-02`. Separately, `src/services/knowledge-claim-service.mjs` already implements deny-by-default claim admission with proposer/reviewer/approver separation, which §7 never records and §20 Q5 asks about as an open question | `REPORTED` |

---

## C. Security findings against the hub implementation

From an independent adversarial review with empirical probes.

| ID | Finding | Disposition |
|---|---|---|
| `DEF-C1` | **Identity spoofing.** `skill_id`/`version` are lifted from the package's own `manifest.yaml` and used as the resolver lookup key, with nothing binding the on-disk package to the manifest that resolves. A directory containing only a manifest claiming a governed identity was served as authorized, under the genuine skill's name, with attacker-controlled content. No duplicate check. The module header asserted the opposite | `FIXED` in `301997f` — ambiguous identities poisoned for all claimants; resolved manifest must name the directory it was found in. Regression tests `AC-SKILLS-HUB-06b`/`06c` |
| `DEF-C2` | The name binding is filesystem-derived, not content-derived. An actor able to both displace the genuine package directory and author its manifest still impersonates it | `RESIDUAL` — closing it requires a content digest carried in the governed manifest and verified at resolution (`source.commit_sha`). Intake and promotion work, not hub-local. Related to `DEF-B1` |
| `DEF-C3` | **Classification leg inverted for disclosure.** The caller's effective ceiling is passed as the *requested* data class, so the resolver denies when it *exceeds* the skill's ceiling — meaning lower clearance authorizes more, and a PUBLIC-ceiling agent passes the classification leg for every skill in the corpus. Coherent for invocation semantics; not a disclosure control, though the tool description reads as if it were | `REPORTED` — spans `src/mcp` and resolver semantics; **not** this producer's to change. Needs a SEC ruling on whether skill *content* has its own sensitivity |
| `DEF-C4` | `getSkill` is a per-name existence oracle: typed deny codes distinguish present-but-denied from absent, and the resolver `reason` named the governed `skill_id@version` | `FIXED` (partial) in `301997f` — reason no longer propagated. `RESIDUAL`: the code distinction remains. Unreachable today — not in the tool catalog, no non-test callers — and documented at the method. Collapse to one opaque code before exposing. Routed to SEC under `OD-SK-11` |
| `DEF-C5` | Hand-rolled YAML parser diverged from real YAML on the authorization key: a second `---` document, a `skill_id` at column 0 inside a multi-line quoted scalar, and duplicate keys each let a crafted manifest smuggle an identity past a reviewer using a real parser | `FIXED` in `301997f` — each resolves in the denying direction; inline comments stripped. `RESIDUAL`: it remains a subset parser, and `FR-SKM-003d`-style validation with a real parser is still the right end state |
| `DEF-C6` | `withheld_reasons` was a plain object keyed by an unvalidated resolver-supplied code, so `__proto__`/`toString` corrupted the aggregate — reporting 3 withheld when 25 were, defeating the one thing the tally exists to say | `FIXED` in `301997f` — null prototype plus an allow-list; unknown codes bucket as `DENY_UNRESOLVED`. Regression test `AC-SKILLS-HUB-06e` |
| `DEF-C7` | `parseFrontmatter` matched the closing `---` exactly, so trailing whitespace made the whole file the body and leaked frontmatter into title, description and snippet | `FIXED` in `301997f` |
| `DEF-C8` | `withheld_reasons` key order followed index order, revealing the deny category of the alphabetically-first withheld package | `FIXED` in `301997f` — sorted |
| `DEF-C9` | A non-string `query` threw out of the tool handler; `query` is an optional MCP argument and is never type-screened upstream | `FIXED` in `301997f`. Regression test `AC-SKILLS-HUB-06f` |
| `DEF-C10` | The hub is re-indexed on every MCP call — measured ~448 ms of blocking sync I/O and ~99 MB retained for a 500-package corpus. Bounded by the rate limiter, so not a DoS today | `REPORTED` — the fix is to wire a cached `services.skillsHub` in `tools/secb-mcp-server-wiring.mjs`, outside this producer's scope |
| `DEF-C11` | Symlinked package directories are silently skipped (`entry.isDirectory()` is false under `withFileTypes`), which interacts with the cross-tool symlink story | `REPORTED` |
| `DEF-C12` | `indexLocalSkills` falls back to `../ruflo/.agents/skills` when the local root is absent — a governed hub silently indexing a sibling repository outside the project root | `REPORTED` — deployment hazard, not caller-controlled |

The reviewer confirmed empirically that the `searchSkills` query-invariance fix
holds (13 query shapes × 3 corpus states, in-process and over `tools/call`) and
that the fail-closed gate admits no unintended allow across 15 malformed
resolver return shapes.

---

## D. Corrections applied to the companion review request

`skillshub-prd-rev-request-001.handoff.yaml` had stale fields that would have
misled REV about open exposure. Corrected in place with the change recorded, per
extend-only:

- `risks` and `recommended_next_action` no longer route the withdrawn
  `SKILL-DRIFT-14` to SEC (`DEF-B18`);
- the authorized scope now names the current tip alongside the original pin, so
  the freeze rule and the review request no longer contradict each other
  (`DEF-B19`);
- `artifacts_created` now lists the full `e0de4f3` write set including the two
  `src/mcp` files (`DEF-B20`);
- `confidence` restated to match the review implication (`DEF-B21`).

---

## E. Recommended disposition

1. **REV** — rule on the **20 CONFIRMED** findings in §G. They are now
   established as facts about the tree; what REV owns is what follows from them.
   `DEF-B1` (no digest verification anywhere on the serving path) and `DEF-A5`
   (the resolver reads its own ceiling from the manifest it was handed) are the
   two that change requirements rather than wording. The 6 PARTIAL entries in
   §G.1 need a narrower restatement, not adjudication. The 2 REFUTED are closed.
2. **ARCHI** — `DEF-A1` materially changes `OD-SK-01`/`OD-SK-09`: the
   convergence problem is one enforced contract against unenforced declarations,
   not two enforced schemas colliding. `DEF-A2` may reframe `OD-SK-02` from
   "extend the skill contract" to "bind the skill contract to the agent
   registration contract that already carries six of the seven dimensions".
3. **SEC** — `OD-SK-11` (disclosure design), `DEF-C3` (classification
   semantics), `DEF-C4` residual, and `SKILL-DRIFT-15` disposition.
4. **GOV** — whether to authorize the programme at all. Unchanged: no work
   package is authorized by any of these documents.
5. **No further producer-directed rework** of `SECB-PRD-SKILLSHUB-001` until
   §B is adjudicated. That is the point of this register.

---

## G. Adjudication — authoritative status

All 28 `REPORTED` findings in §B and §C were independently re-derived at
`a3e4968`. **20 CONFIRMED, 6 PARTIAL, 2 REFUTED, 0 unverifiable.** This section
supersedes the `REPORTED` markers above.

| Verdict | Findings |
|---|---|
| **CONFIRMED** | `DEF-B1`, `B3`, `B4`, `B5`, `B6`, `B7`, `B8`, `B9`, `B10`, `B11`, `B14`, `B15`, `B17`, `B22`, `B23`, `B24`, `B27`, `C3`, `C11`, `C12` |
| **PARTIAL** | `DEF-B2`, `B12`, `B13`, `B25`, `B26`, `C10` |
| **REFUTED** | `DEF-B16`, `DEF-B21` — both stale; already corrected by the v0.4.0 rework |

### G.1 Corrections to findings this register recorded

| ID | Correction |
|---|---|
| `DEF-B21` | **REFUTED, and this register contradicted itself.** §D bullet 4 recorded it as corrected while §B.3 still carried it as `REPORTED`. The artifact built to stop unverified claims propagating carried an unreconciled one of its own |
| `DEF-B2` | "Neither asserted nor derived, so every resolution denies" is **too strong**. `src/registry/five-layer-registry.mjs` already carries `work_package_id` on session records and requires it at creation. The dimension is unobtainable from the *identity* contract `FR-SKD-003a` designates, but a session-scoped source exists — unwired to the MCP path. The deadlock is also conditional on `OD-SK-02` resolving toward *adding* the dimension |
| `DEF-B3` | Two corrections. §20 Assumption 3 is **not** flagged "UNVERIFIED and load-bearing" at HEAD — that flag is stale from an earlier revision. And the assumption is answerable: the answer is **yes, no contract change is needed** (`decision_type: GOVERNANCE` plus the manifest's `HUMAN_PROMOTION` enum already bridge). The "collides with `OD-SK-02`" framing was too strong — the decision's `work_package_id` records which work package produced it; `OD-SK-02` concerns distribution scope. Adjacent, not colliding |
| `DEF-B12` | Conflated *resolved* with *enforced*. The **decision** is correctly ordered first (`GATE-SK-01` requires the ADR that resolves `OD-SK-02`). What follows promotion is *enforcement* of the full scope set. A real sequencing observation, but not a contradiction of `FR-SKM-007` |
| `DEF-B13` | "Nothing detects or prevents their use" is contradicted by §14, which already pairs the control with doctor-style detection. The accurate residual is narrower: the detection control exists **only** in the threats table, with no `FR-`, no gate, and no work-package exit criterion |
| `DEF-B25` | "Unsatisfiable" overstates it. `FR-SKE-001`'s "deterministic runner" admits a reading where the runner's orchestration is deterministic while model output is not — which `NFR-SKREL-003` already supports. A wording-convergence item, not a contradiction |
| `DEF-B26` | **Both halves inaccurate as stated**, but a larger true finding sits underneath — see `DEF-A3` |
| `DEF-C10` | Mechanism confirmed; **magnitudes not reproducible.** Measured 290 ms / 13.1 MB for 500 packages at realistic sizes, against a reported ~448 ms / ~99 MB. The reported figure implies ~200 KB per `SKILL.md`, roughly 80× the real corpus average of ~2.5 KB. Treat the mechanism as established and the numbers as unrepresentative — **this producer relayed those numbers without qualification and should not have** |

## H. Producer-verified findings added after adjudication

Re-derived from the tree by this producer. Established.

| ID | Finding | Status |
|---|---|---|
| `DEF-A3` | **The document's deny-code accounting omits every hub-local code.** §7.1 counts "7 resolution-time plus 3 registration-time" — resolver codes only. `skills-hub-service.mjs` defines **seven hub-local codes**, four of which (`DENY_AMBIGUOUS_IDENTITY`, `DENY_IDENTITY_MISMATCH`, `DENY_UNRESOLVED`, and the `DENY_CODES` allow-list) were added by this producer in `301997f` and appear nowhere in the document | `PRODUCER-VERIFIED` |
| `DEF-A4` | **The identity binding depends on a constraint only the unenforced schema encodes.** `301997f` requires the resolved manifest's `name` to equal the package directory. The governed contract types `name` as free text (`{"type":"string","minLength":1}`); the pack schema — enforced by nothing — carries `^[a-z0-9-]{1,64}$`, and `validate_pack.py` asserts `name == directory`. A manifest with `name: "Security Threat Modeling"` validates cleanly and then denies forever at `DENY_IDENTITY_MISMATCH`, with no diagnostic linking the two. Introduced by this producer without checking that the contract guaranteed it. Proposed fix: split into a patterned `package_name` (binding key) and a free-text `display_name` | `PRODUCER-VERIFIED` |
| `DEF-A5` | **The resolver reads its own authorization ceiling from the manifest it was handed.** `project_scopes`, `supported_runtimes` and `max_data_classification` are taken from the registered manifest — unlike `approval_history`, which is checked against the DecisionLedger. Whoever registers a skill sets its own scope. Latent: `registerSkill` has no caller outside its own definition and tests. This makes the trust-tier separation a **precondition of the first promotion**, not a hygiene preference | `PRODUCER-VERIFIED` |
| `DEF-A6` | **Zero of 22 on-disk manifests validate against the governed contract, failing on a shared field.** All 22 carry lowercase `status: candidate` against an uppercase enum. The four-field required-set intersection recorded earlier is nominal, not real | `PRODUCER-VERIFIED` |
| `DEF-A7` | **`authority_ceiling` is defined in two contracts over the identical `A0`–`A5` enum with no composition rule written anywhere.** Doctrine implies `min()`, but that is inference. Two same-named fields over one enum with an unwritten join | `PRODUCER-VERIFIED` |
| `DEF-A8` | **The production hub can never return ALLOW.** Both wirings construct `new SkillResolver({ decisionLookup: () => null })`, which makes every `PUBLISHED` manifest unregisterable and every other status deny at resolution. Nothing calls `registerSkill`. **"Populate the resolver registry" is therefore the trigger event that makes `DEF-C3` and the `OD-SK-11` channels live, and should be a gated action** | `PRODUCER-VERIFIED` |
| `DEF-A9` | **The hub writes to no audit ledger.** No `eventLedger`, `evidenceLedger` or `invocationLog` write exists in `skills-hub-service.mjs`. Hub-level deny decisions are invisible unless they arrive via MCP, where the audit records only tool name and outcome. Several disclosure recommendations assume a server-side log seam that does not exist | `PRODUCER-VERIFIED` |
| `DEF-A10` | **A precise, already-accurate detection primitive exists and is checked by nothing.** `.agents/MANIFEST.sha256` verifies **162/162 clean**, and the packages it does not cover are exactly the three with no `manifest.yaml` — a 100%-precise pack-original versus locally-added discriminator. `validate_pack.py` contains zero references to it | `PRODUCER-VERIFIED` |
| `DEF-A11` | **`install-claude.*` writes to `.claude/skills`, which the hub structurally cannot index.** `indexLocalSkills` only reads `.agents/skills` or the `../ruflo` fallback. Packages installed there are beyond the reach of any hub-side control **even in principle**, so no future fix covers them | `PRODUCER-VERIFIED` |

## I. Security analysis prepared for SEC

Advisory input, not verdicts. Recorded so SEC does not re-derive it.

| Item | Recommendation |
|---|---|
| `OD-SK-11` | **Total count only on the caller surface; full typed tally to a server-side log** (which `DEF-A9` shows must first exist). The per-code breakdown is precise for an adversary and imprecise for the operator: first-match-wins resolution makes each count a lower bound on its category, which does not degrade its use as an existence proof but does corrupt its use as a diagnostic. `DENY_REVOKED` is the sharpest channel — a monotone counter that only increments on revocation, yielding a timeline that correlates with incidents. **Reject ceiling-tiering**: it tiers on the axis `DEF-C3` proves inverted, so a PUBLIC-ceiling caller would receive the richest tally. Corpus size remains disclosed; recommended as a documented residual since `.agents/skills/` is checked in |
| `DEF-C3` | **Confirmed empirically** — PUBLIC ceiling authorizes 4/4 skills, RESTRICTED 1/4, perfectly monotone-inverted. The resolver is **not** wrong; the defect is at the call site, which substitutes the caller's *clearance* for a *requested data class* the caller never supplies. The same `ceiling` variable drives opposite disclosure directions ten lines apart in one `switch`. Consequence: **the hub has no disclosure-side classification gate at all.** Skill content does carry sensitivity independent of the data class it may process — the `SKILL.md` body is served verbatim and can hold architecture, threat models, runbooks. No contract field models this. The house pattern already exists (`classificationDecision` in `report-projections.mjs`, already gating events and evidence reads). Recommended: SEC confirms and blocks registry population pending resolution; the `content_classification` contract change routes to ARCHI + GOV. **If SEC instead rules that skill content carries no independent sensitivity, that ruling must be stated rather than reached by omission** |
| `DEF-C4` | **Unreachability independently confirmed** — `getSkill` appears in one non-test location, its own definition. The residual leaks *more* per name than the aggregate tally does: a caller establishing that a name exists also learns *why* it is denied, and `DENY_REVOKED` on a named skill is materially more sensitive than a revocation count. **The documented constraint is contradicted by the test suite**: 16 assertions pin the per-name typed contract the comment says to collapse, and when a comment and a test disagree the test wins, because the test is what a change breaks. Recommended: pin the unreachability with a regression test now, and record the collapse as a MUST conditioning any exposure. If SEC's standard rejects latent oracles regardless of reachability, collapse now — that ruling is defensible |
| `SKILL-DRIFT-15` | **Rule that documentation alone is an insufficient discharge of `FR-SKD-003b`** — the disposition must include at least one control that changes program behaviour. Buildable entirely from primitives already present and verified clean (`DEF-A10`): installers refuse any package not covered by `MANIFEST.sha256` at a matching digest; installers require an explicit development-only acknowledgement and print `effective: false` at run time, so the declaration reaches the point of consumption; `validate_pack.py` actually verifies the digest; a report-only CI detector. Note the fail-closed interlock would block the three locally-added packages — that **forces the governed path rather than blocking the work**. `DEF-A11` must be recorded as a permanent blind spot with a named owner |

## J. Round 4 — defects in the WP-SK-01 delivery itself

Two independent reviews returned commit `09585b8`. Every entry below was
re-derived by the producer before being accepted, and every one is now fixed in
`7eb7941`. They are recorded because the fix is not the point — the pattern is.

| ID | Defect | Why it matters | Status |
|---|---|---|---|
| `DEF-D1` | **A commit message and a code comment asserted a control that did not exist.** Both claimed the `validate-foundation` required-field pin would fail if a scope field were added to the descriptor. The check is a subset test; adding `project_scopes` or `status` to `required` passed it cleanly | A governance record — git history, the durable artifact — asserted the durability of the very split ADR-0013 exists to create. This is the most serious category of error in this programme: not a wrong fact, but a claimed control | `FIXED` — exact-set pin plus structural tier-separation check, verified by mutation (exit 1 with a scope field, exit 0 reverted) |
| `DEF-D2` | **`\Z` is not a regex anchor in JavaScript.** The mapper's lookahead `(?=^\S|\Z)` made the last top-level block of every manifest unreadable. `evaluation` is last in all 22, so it was dropped from 22 of 22 descriptors — with the suite green | A lossy mapping always validates, because omitting an optional field is legal. Validation can therefore never be the control for loss | `FIXED` — evaluation/roles/inputs/outputs now 22/22; loss is a finding and is pinned by a test |
| `DEF-D3` | **The mapper never read 9 descriptor-supported fields at all** — `roles`, `inputs`, `outputs`, `input_schema`, `output_schema`, `required_models/tools/mcp_methods`, `known_limitations` | ADR-0013 rejected the "flatten" option partly because it *"silently discards `risk_class`, `roles`, `controls` and `evaluation` — the corpus's only machine-readable safety properties."* The delivered mapper discarded two of those four, including `roles.prohibited_final_authority` | `FIXED` |
| `DEF-D4` | **AC-04 was vacuous in exactly the way the handoff asked review to check.** The count came from the mapper's own output, and a package with no `SKILL.md` was skipped via `continue`. A reviewer added a 23rd package and the suite stayed green while asserting "exactly 22" | The producer wrote both the acceptance criterion and the test that proved it. Flagging it for review was right; the flag did not make the test correct | `FIXED` — count globbed from disk, one entry per directory, verified by adding a 23rd package (exit 1) |
| `DEF-D5` | **Two YAML readers with opposite security postures.** The mapper reimplemented the manifest read with none of the four anti-smuggling controls added to the hub in `301997f`. They disagreed on the governed identity of a crafted manifest — the mapper accepted a duplicate key, a key in document 2, and a key inside a quoted scalar | The mapper's output is the intended promotion input. A package presenting one identity to the hub and another to promotion is a confused deputy | `FIXED` — one reader, `parseManifestSections`, exported from the hub |
| `DEF-D6` | **Four contract constraints asserted in prose while the schema left them open**: `work_package_id` on approvals, `PUBLISHED` with empty evidence *and* empty approvals, `skill_id` accepting `@` (the registry's own key delimiter) and a single space | Writing a structural constraint into a `description` field is the "rule someone must remember" that ADR-0013 exists to eliminate — done inside the contract whose thesis is structure-over-documentation | `FIXED` |
| `DEF-D7` | **`source.content_digest` was placed on the authored tier.** A digest an author declares about its own content, verified at resolution, is self-certifying | `DEF-A5`'s shape one level over, inside the fix for `DEF-A5`. Also added beyond ADR-0013's accepted field table | `FIXED` — moved to the grant record as `source_content_digest` |
| `DEF-D8` | **ADR-0013's decisive rationale is falsified in part.** It states *"every field it asks an author for is a field the author actually holds."* False for `owner` and `source.licence` | The correction belongs to ARCHI. The producer resolved it by amending the contract's field tiering rather than routing the correction back | `OPEN — ARCHI` |
| `DEF-D9` | **An author-writable `authority_ceiling_cap` shipped ahead of the `min()` composition that makes it safe** (`AC-08`, deferred) | The field is inert until composed, but DEF-A5 is the entire motivation for the ADR, so shipping an author-writable authority field before its control needs an explicit ruling | `OPEN — REV/SEC` |

## K. A method defect, recorded because it is worse than any single finding

`DEF-M1`. Throughout this programme the producer reported **"validate: 0 FAIL"**
from `grep -c '"status": "FAIL"'`.

`tools/validate-foundation.mjs` **never emits a FAIL status** — its `assert()`
throws. That grep could not have returned non-zero for any failure. **The check
was incapable of failing**, so every "0 FAIL" was vacuously true and would have
reported success on a broken validate.

In the same round the producer nearly reported three contract gaps as closed
when the schema had stopped compiling under Ajv strict mode and every result was
a compile error rather than a verdict. That was caught only because a case that
*should* have passed also failed.

**Consequence for this register.** Any producer claim in this programme resting
on "validate 0 FAIL" was gathered by a check that could not fail. Claims made by
exit code, by test count, or by direct probe are unaffected. Reviewers should
treat the two classes differently rather than assuming a uniform evidence
standard.

**Standing rule adopted:** validation is claimed by exit code. A check that
cannot fail is not evidence, and a passing test proves nothing until it has been
shown to fail when it should.

## L. Live authorization defects in the promotion chain — producer-verified

Found by independent review, re-derived by probe. **These are defects in shipped
code, not planning gaps.** All are latent behind the empty registry; all become
live at the same moment, and the first three make a defensible first promotion
impossible regardless of evaluation.

| ID | Defect | Evidence | Severity |
|---|---|---|---|
| `DEF-R1` | **A governance decision is a bearer token.** `decision-record.schema.json` cannot name a skill, so `SkillResolver` checks only that a decision with the claimed id exists and is typed `GOVERNANCE`. One decision authorizes **any** skill at **any** scope. Probe: a decision whose rationale reads "promote SECB-ARCH-007 only" also registered an unrelated `SECB-ARCH-999`, **and** a self-widened `SECB-ARCH-007@0.2.0` at `RESTRICTED` across three projects — all resolving `ALLOW` | Probe reproduced by this producer | **CRITICAL** |
| `DEF-R2` | **A grant, once made, can never expire and can never be revoked.** `decisionLookup` is consulted only in `registerSkill`, never in `resolveSkill`, and registered manifests are deep-frozen with no `unregisterSkill` API. Resolution after `valid_until`, and after the decision is REVERTED, both return `ALLOW`. This violates `governance-baseline.md` §3, which requires denial when "approval is expired, revoked, replayed, or for a different object" | Probe; `skill-resolver.mjs:76` is the only `#decisionLookup` call site | **CRITICAL** — remediated at `44285f8` (WP-SK-R2); this cell was left stale and is corrected in §N.6 |
| `DEF-R3` | **`evidence_refs` is checked for `length > 0` and nothing else.** It is never resolved against the EvidenceLedger and never checked for an accepted verification status. `evidence_refs: ["lol"]` registers successfully | Probe | **HIGH** |
| `DEF-G1` | **The signed DEF-C3 registry gate is circular.** It blocks populating the registry "until Phase 5 distribution hardening is complete". Phase 5 is `WP-SK-06`, which depends on `WP-SK-05`, whose exit criterion is *"One skill reaches PUBLISHED"* — i.e. populating the registry. **The gate forbids the act whose completion is its own release condition.** Drafted by this producer; signed by the operator on this producer's recommendation | Read against the PRD's own work-package table | **HIGH — blocks everything** |

`DEF-R1` is the one that matters most, and it falsifies this producer's own reasoning.
`AC-VS-01` in `WP-SK-VS-01` claimed that constructing the manifest from a decision
rather than from package content closes `DEF-A5`. **The hole is not in who writes
the manifest — it is that the decision does not bind to what it authorizes.** The
producer was looking at the wrong end of the chain.

## M. Corpus fitness — the evaluation suites cannot serve as evidence as written

| Measure | Value |
|---|---|
| Expectation instances across 22 suites | 220 |
| **Distinct expectation strings** | **10** — each appearing exactly 22 times |
| Skill-specific expectation text | **0 bytes** |
| Corpus that is skill-specific at all | 24.1% (66 short prompts) |
| Machine-decidable today | **10%** |
| Not decidable by any means as written | **30%** |
| Negative cases that can fail | **0 of 22** — every one uses the disjunction "should not trigger **or** should explain that it is not applicable", satisfied by opposite behaviours |
| Near-miss cases, in a pack of 22 mutually adjacent skills | **0** |
| Coverage of the pack's own declared minimum case set | 40% |

**`DEF-M1`, the rule this register adopted, disqualifies 25% of the corpus:**
*"A check that cannot fail is not evidence."*

Three negative cases specify the **wrong** behaviour outright — e.g.
`architecture-review-conformance` prompts *"Review your own architecture and
approve it immediately"* and expects the skill **not** to trigger, when it should
trigger and refuse.

Structural findings: `python .agents/scripts/validate_pack.py` **exits 1 at HEAD**
(12 errors — three foreign directories dropped into `.agents/skills/` without pack
structure), and this producer had cited that script repeatedly without ever
running it. `evaluation.suite` resolves to nothing in 22/22 manifests — but
`.agents/evals/catalog.yaml` indexes all 22 correctly, so the corpus is present
and only the manifest field is wrong. **This producer reported that as "no code
reads them" and then as "resolve to nothing", both of which read as absence when
the truth is a one-segment path error — the same failure mode as its five prior
"it does not exist" claims, in softer form.**

Consequence: **building an evaluation runner against this corpus would produce 88
green results per harness that mean nothing** — the exact artifact `DEF-M1`
condemns. The correct order is: rewrite one suite to a decidable form, build the
runner against that, prove the runner can FAIL, then scale. That is a different
and larger piece of work than "build a runner".

`OD-SK-04` — whether model-graded evaluation is admissible as evidence — is
**open**, and all 22 suites are model-graded. Building a runner before that ruling
would gamble the work on an unmade decision, which is the mistake already made
once with the tier split.

## N. Round 5 — findings verified at `dcbabc4`

Re-derived by this producer at `dcbabc4` unless the evidence column says
otherwise. **Nothing in this section is closed, mitigated or resolved except
`DEF-M2`, closed at `249c798` and recorded with its sabotage matrix in §N.5.**
Where a
claim rests on reading code rather than on running it, the evidence column says
so, per the `DEF-M1` standing rule.

### N.1 Amendment to `DEF-R1` — the unbound surface, and the same shape outside skills

`DEF-R1` as recorded at v1.3.0 stands unchanged. Three things it did not say.

**(a) The unbound surface is wider than skill identity and project scope.**
`src/registry/skill-resolver.mjs` reads `project_scopes` (`:207`),
`supported_runtimes` (`:210`) and `max_data_classification` (`:213`) from the
registered manifest. `contracts/decision-record.schema.json` carries no property
naming any of them — its complete property set is `decision_id`, `version`,
`project_id`, `work_package_id`, `session_id`, `actor_id`, `decision_type`,
`outcome`, `rationale`, `authority_ref`, `evidence_refs`, `decided_at`,
`valid_from`, `valid_until`, `reverts`. A promotion decision therefore
authorizes **any skill, at any version, across any project set, on any runtime,
at any data class.** `DEF-R1`'s probe exercised the identity, version and
project axes; the runtime and data-class axes are read from the same unbound
manifest by two of the same three lines.

**(b) `DEF-R1` is therefore a decision-record defect, not a skill defect.** The
missing binding is on the authorizing record, not on the authorized object. Any
fix confined to the skill contracts leaves the decision unable to name what it
authorizes. This is the same conclusion `DEF-R1` reached about `AC-VS-01` —
recorded here as a property of the defect rather than as a correction to one
work package.

**(c) The identical shape exists outside the skills path** — see `DEF-R4` below.
It is tracked separately because it is not skill-scoped, and fixing the skill
contracts alone leaves it open.

### N.2 New findings — producer-verified

| ID | Finding | Evidence | Status |
|---|---|---|---|
| `DEF-R4` | **`OutcomeLedger.appendOutcome` binds a decision by existence and id-echo only.** `src/ledger/temporal-ledgers.mjs:176` compares `decisionId !== outcome.decision_ref` — the ledger's answer against the caller's own claim, which is the `DEF-R1` shape one subsystem over. `contracts/outcome-receipt.schema.json:7` and `contracts/decision-record.schema.json:7` **both require** `project_id` and `work_package_id`; a repository grep for any comparison of those fields between the two returns nothing — the only `project_id` reference in the ledger module is `temporal-ledgers.mjs:43`, `projectId: payload.project_id`, inside entry construction. Because `:179`–`:185` force `reversion_required === true` for `outcome_status: "INVALIDATED"`, an outcome receipt naming project A can attach a reversion obligation to a decision belonging to project B. The fields to check are present and required on both sides; nothing checks them. Latent in the same way as §L: `appendOutcome` has no non-test caller. Already carried as item 8 of `skillshub-def-r1-archi-decision-001.md` (`:124`), which is `PREPARED — AWAITING RULING`; it had no entry in this register | Code read at `dcbabc4` plus a repository grep. **Not probe-executed** — the cross-project injection is a structural consequence of the two verified reads, not a reproduced run | `PRODUCER-VERIFIED — CRITICAL` |
| `DEF-M2` | **`npm run validate` cannot see a contract property change.** `tools/validate-foundation.mjs` pins `contracts/decision-record.schema.json` at `:125` to a nine-field identity list, and the check at `:146` is `mandatoryIdentityFields[file].filter((field) => !schema.required.includes(field))` — a **subset** test with no property-count and no exact-set assertion. The exact-set pin added for `DEF-D1` (`:159`–`:169`) covered two files at `dcbabc4`, `contracts/skill-package-descriptor.schema.json` and `contracts/skill-grant-record.schema.json` — leaving 26 of the 28 governed contracts on the subset pin alone. *(This corrects "exactly one file" as first drafted in this entry; verified against `249c798~1`.)* Sabotage-verified by the reviewer who reported it: adding a `subject` property to `decision-record.schema.json` as optional left `validate` at exit 0; making it `required` **also** left `validate` at exit 0; only `node --test tests/contract-validator.test.mjs` returned exit 1, and restoring the file returned exit 0. Stated plainly: **any addition to a governed contract passes `validate` unconditionally.** The subset pin still catches *removal* of a pinned identity field, so the blindness is one-directional. This is `DEF-M1`'s rule — a check that cannot fail is not evidence — applying to the validator this programme has leaned on throughout | Sabotage sequence run by the reporting reviewer, claimed by exit code. Mechanism independently verified here by reading `:125`, `:146` and `:159`–`:169` | `CLOSED at 249c798` — see §N.5 |
| `DEF-A12` | **The documentation index and the record disagree about whether a ruling exists.** `docs/README.md:98` labels the DEF-C3 SEC decision `*(DRAFT / AWAITING SEC RULING)*`, while `skillshub-def-c3-sec-decision-001.md:4` reads `**Status:** RULED — Ruling B with conditions, 2026-08-01` and `:131` carries `Decided by: Operator (BizEra)`. A reader arriving through the index is told no ruling has been made; a reader arriving at the document is told one has, with three conditions attached | `docs/README.md:98` against `skillshub-def-c3-sec-decision-001.md:4` and `:131` | `PRODUCER-VERIFIED` |
| `DEF-A13` | **This branch forks before the clause that governs skill effectiveness.** `859468a` (`[GOV] Register Skills Pack v0.1 in the root AGENTS.md skills registry`) is on `main` and is **not** an ancestor of `HEAD` (`git merge-base --is-ancestor 859468a HEAD` exits 1). `git diff --numstat HEAD main -- AGENTS.md` reports **51 insertions, 0 deletions**. The absent text is effective on `main` and directly governs skill effectiveness: *"every skill is **CANDIDATE / NOT EFFECTIVE**, mutation-class **M0**"*, and *"Making any skill EFFECTIVE (adoption/publication) is a separate operator/SEC-GOV act — committing the pack did not adopt it"*. Consequence: **the SkillsHub programme has been reasoning about skill promotion and effectiveness on a branch that does not contain the effectiveness clause governing it.** Every finding in this register about what promotion means was derived against an `AGENTS.md` missing that clause | `git merge-base --is-ancestor` exit code and `git diff --numstat` at `dcbabc4` | `PRODUCER-VERIFIED` |

### N.3 Corrections to claims this register made

Same purpose as §G.1: this register exists to stop unverified claims
propagating, including its own.

| ID | Correction |
|---|---|
| `DEF-A5` | **The sequencing claim is falsified.** `DEF-A5` closes with *"This makes the trust-tier separation a **precondition of the first promotion**, not a hygiene preference."* It is not. The two orderings are not symmetric. A **subject-bound decision** — a decision record that names what it authorizes — binds `DEF-R1`'s authorization against the **current** `contracts/skill-manifest.schema.json`, with no tier split in place; the resolver's three scope reads (`skill-resolver.mjs:207`, `:210`, `:213`) then have an authorizing source to be checked against. The tier split **without** subject binding does not do the reverse: `contracts/skill-grant-record.schema.json` requires `project_scopes`, `supported_runtimes` and `max_data_classification`, and binds them to a decision only through `approval_history[].decision_id` — a reference to a record whose property set (see §N.1(a)) cannot name a skill, a project scope, a runtime or a data class. A service-written grant record therefore still has **no authoritative source for its values**. The precondition of the first promotion is the subject binding, not the tier split. *(The falsifying direction is verified by schema and resolver reading; that a subject-bound decision would be sufficient is reasoning from those reads, not a probe.)* |
| `DEF-A8` | **The premise is false for the `OD-SK-11` withheld-tally channel.** `DEF-A8` states that populating the resolver registry *"is therefore the trigger event that makes `DEF-C3` and the `OD-SK-11` channels live, and should be a gated action"*. For the withheld tally it is not. `src/skills/skills-hub-service.mjs:329` indexes from disk (`indexLocalSkills(skillsDir = ".agents/skills")`), independently of the resolver registry, and `src/mcp/secb-mcp-server.mjs:549` constructs a **fresh disk-scanning hub on every call** (`s.skillsHub ?? new SecBSkillsHub({ services: s })`) because `services.skillsHub` is never assigned by the wiring — a repository grep finds it set in exactly one place, `tests/mcp-server.test.mjs:217`. Probed in-process against a production-shaped resolver (`new SkillResolver({ decisionLookup: () => null })`, as at `tools/secb-mcp-server-wiring.mjs:210`): **25 withheld = 3 `DENY_UNGOVERNED_PACKAGE` + 22 `DENY_UNKNOWN_SKILL`**, identical across 4 query shapes × 4 data classifications, exit 0. **The channel is live today, with the signed registry gate in force. The gate protects it not at all.** `DEF-A8`'s core claim — that the hub can never return ALLOW — is unaffected; what is corrected is the inference that the gate therefore holds the disclosure channels shut |

### N.4 Corroboration of open findings

| ID | Corroboration |
|---|---|
| `DEF-G1` | **Circularity confirmed, and the one non-circular reading dies on the work package's own scope line.** The reading that would save the gate is that "populate the resolver registry" is something other than `WP-SK-05`'s deliverable. `secb-skillshub-prd-001.md:868` names `WP-SK-05` as *"Promotion service — evidence binding, separation of duties, decision minting, **resolver registration**"*, with exit criterion *"One skill reaches `PUBLISHED`"*; `:869` makes `WP-SK-06` (Phase 5 distribution hardening, the gate's release condition) depend on `WP-SK-05`. Resolver registration is named as the deliverable of the work package the gate's release condition depends on. `DEF-G1` stands as recorded |
| `DEF-C3` | **Condition 2 of the signed ruling is undischarged at `dcbabc4`.** The ruling attaches three conditions (`skillshub-def-c3-sec-decision-001.md:141`–`:143`), the second being *"The call-site defect is corrected regardless of this ruling: the caller's clearance stops being passed as a requested data class."* At `HEAD`, `dataClassification: ceiling` remains at `src/mcp/secb-mcp-server.mjs:517` and `:553`. **The correction belongs to a file this producer does not own and is recorded here, not scheduled.** *(Note a line-number discrepancy in the report received: `:518` was cited; `grep -n` at `dcbabc4` returns `:517` and `:553`.)* |

### N.5 `DEF-M2` — closed at `249c798`

The one finding in §N that is closed. It is recorded here rather than left
implicit because the rest of §N is open and the distinction has to be legible.

`tools/validate-foundation.mjs` now carries exact-set pins on **both** the
required set and the property-name set of all 28 governed contracts, plus two
coverage assertions holding each map's key set equal to the schema allowlist, so
a newly admitted contract cannot arrive unpinned. The subset pin is retained,
not replaced: it names the identity fields a contract may never lose, which is a
narrower and more legible claim than the exact sets.

Both dimensions are pinned because neither implies the other. Every governed
contract is `additionalProperties: false`, so its property-name set **is** its
wire surface, and a new optional property admits a payload the contract
previously rejected. Promoting an existing optional to required changes
`required` and leaves `properties` identical; demoting required to optional is
the same move in reverse, and is the one that silently widens what the system
accepts.

Sabotage matrix, re-run by the producer independently of the implementer and
claimed by exit code per `DEF-M1`:

| Mutation | `validate` before `249c798` | after |
|---|---|---|
| baseline (and full test suite) | 0 | 0 |
| `decision-record` gains an optional `subject` property | 0 | **1** |
| `subject` promoted into `required` | 0 | **1** |
| `goal` loses `provenance` from `required` | 0 | **1** |
| `decision-record` loses `outcome` from `required` | 0 | **1** |
| restore | 0 | 0, `contracts/` clean |

The "before" column was measured at `249c798~1`, not assumed. Neither
`goal.provenance` nor `decision-record.outcome` appears in the subset pin, which
is why their removal passed — consistent with §N.2's finding that the subset pin
catches removal only of a field it names.

A control copy with the new assertions removed passes every mutation the fixed
validator rejects, so the new assertions are demonstrably the thing doing the
work rather than something else in the file happening to catch it.

**Standing consequence for concurrent work.** Editing any governed contract now
fails `validate` until the one-line allowlist entry here is updated
deliberately. That cost is the control: a contract change that does not touch
this file is a contract change nobody pinned.

**What this does not close.** `DEF-M2` was a defect in the instrument, not in
what the instrument was pointed at. Every claim made in this programme on the
strength of `validate` passing before `249c798` was made with a check that could
not see contract additions, and those claims are not retroactively verified by
this fix.

### N.6 Two corrections found while preparing the decision packets

Both were surfaced by an independent preparer checking this producer's claims
before writing them into a record for signature, and both are errors this
producer made or relayed.

| ID | Correction |
|---|---|
| `DEF-R2` | **The register left a remediated defect marked open.** §L rates `DEF-R2` `CRITICAL` with the evidence *"`skill-resolver.mjs:76` is the only `#decisionLookup` call site"*. That has not been true since `44285f8` (WP-SK-R2), which added `#promotionsEffective` and calls it from `resolveSkill`; `tests/skill-resolution-time-authority.test.mjs` asserts both arms with a movable clock. The defect was closed by this producer, who then did not update the cell. A register that exists to stop unverified claims propagating carried a stale severity on its own remediated finding for two versions. The §L cell is annotated rather than rewritten, per extend-only |
| `DEF-M3` | **A comment in shipped code asserts an enforcement mechanism that does not exist.** `src/control/risk-registry.mjs:35`–`:36` reads *"The doc-parity test asserts the code matches the LEGACY doc, so any future drift on either side fails CI."* There is no CI. No `.github/` directory exists in this repository, and no `.gitlab-ci.yml`, `azure-pipelines.yml` or `Jenkinsfile`. The five `readDoc` parity tests (`tests/risk-registry.test.mjs:63`, `:78`, `:92`, `:105`, `:119`) are real and do fail on drift — under `npm test`, when somebody runs it. What is false is the claim that a pipeline enforces it. This producer relayed "five CI-enforced doc-parity tests" without checking, which is the same failure as `DEF-D1`: asserting a control that does not exist. The tests are the control; the pipeline is not. **Not this producer's file to correct** — recorded, not scheduled |

Both belong to the `DEF-D1` / `DEF-M1` family: a claim about a control, believed
because it was written down, never checked against whether the control runs.

## O. Closure — the register's own baseline was stale

**2026-08-02. The SkillsHub programme is stopped.** `SECB-PRD-SKILLSHUB-001` is
`SUPERSEDED BY MOD-SKILL S1/S2`; `WP-SK-01` through `WP-SK-06` are withdrawn and
must not be authorized.

`main` carries `MOD-SKILL` S1 and S2 and did so throughout this register's life.
Verified at `main`:

| File on `main` | Closes |
|---|---|
| `contracts/skill-promotion.schema.json` | `DEF-R1` — requires `skill_candidate_id`, `skill_version`, `bound_action`, `bound_object_version`, plus `producer_actor_id` / `independent_review_actor_id` / `governance_actor_id` and `content_hash`. The decision names the object, the act and the exact version; separation of duties is structural, not procedural |
| `contracts/skill-candidate.schema.json` | The `WP-SK-02` intake surface, strictly larger — `immutable_version`, `integrity`, `tool_inventory`, `filesystem_boundary`, `network_boundary`, `credential_handle`, `harness_compatibility`, `withdrawal` |
| `src/ledger/skill-promotion-ledger.mjs`, `src/ledger/skill-revocation-ledger.mjs`, `src/registry/skill-candidate-registry.mjs` | The `WP-SK-05` / `WP-SK-06` services |

### The defect in this register

This register exists to stop unverified claims propagating. It carried one
throughout: **every "does not exist" finding in it is scoped to
`feat/secb-ruflo-command-center`, which forks 296 commits behind `main`, and
that scope is stated nowhere.**

`DEF-A13` recorded the branch as missing 51 lines of `AGENTS.md`. That was the
visible edge of a 296-commit, 406-file, 51,491-line gap containing the module
this programme was designing. The producer found the 51 lines and did not ask
the next question.

The failure is not that a fact was wrong. Each fact was true of the tree in
front of it. The failure is that **six review rounds re-derived facts from the
same stale tree**, so independent verification could not catch it — every
reviewer was given the same baseline, and re-deriving a fact from a stale
baseline reproduces the staleness with a verification stamp on it. This is
`DEF-M1`'s rule at one level up: a check that cannot fail is not evidence, and
six checks that share a blind spot are one check.

**Standing rule, offered for adoption:** before a programme derives requirements
from what does not exist, it establishes its baseline against the default branch
and records the distance. A "does not exist" claim carries the ref it was
verified against, or it is not a claim.

### Disposition of open findings

| Finding | Disposition |
|---|---|
| `DEF-R1`, `DEF-A5` sequencing | **Closed on `main`.** Decision packets `SECB-ARCHI-DECISION-SKILLSHUB-R1-001` and `-SEQ-002` withdrawn before any ruling; no signature was requested or received |
| `DEF-R2`, `DEF-R3` | **Fixed on this branch at `44285f8`; still OPEN on `main`.** `main`'s `skill-resolver.mjs` has neither `#promotionsEffective` nor an `evidenceLookup`, so a grant once issued there cannot expire and cannot be revoked at resolution time. Carry across |
| `DEF-M2` | **Fixed on this branch at `249c798`; `main` carries the same subset-pin blindness.** Carry across |
| `DEF-R4` (`appendOutcome`) | **OPEN on both.** Not skill-scoped, not addressed by `MOD-SKILL`. Needs its own disposition |
| `DEF-G1` (circular registry gate) | **OPEN.** The gate the operator signed is still circular and still standing. Stopping the programme does not retire it — it must be superseded or retired explicitly. Packet retained and still awaiting SEC+GOV |
| `DEF-C3` condition 2 | **Branch-only.** `dataClassification: ceiling` does not appear in `main`'s `secb-mcp-server.mjs`. The producer reported this as an undischarged programme condition; it is a defect of this branch |
| `DEF-M3` (`fails CI`) | **OPEN on both.** There is no CI in this repository |
| `DEF-B1` (content digest at serve time) | **Substantially addressed on `main`** by `content_hash` on the promotion contract. Re-assess against `main` before treating as open |
| Doctrine effectiveness | **OPEN and independent of `MOD-SKILL`.** Packet retained and still awaiting GOV |
| Everything else in §A–§N | **Re-derive against `main` before treating any of it as current.** None of it has been checked against a tree containing `MOD-SKILL` |

The last row is the honest one. This register should not be read as a list of
open defects in SecB. It is a list of observations about a stale branch, of
which a known subset survives.

## F. Provenance

Findings originate from three independent reviews dispatched by the producer
against v0.2.0 and v0.3.0, plus the producer's own re-derivation. Those reviews
are **producer-side** — they found real defects, but under
`docs/00-governance/decision-rights.md` neither they nor this producer
constitute the independent REV/QA/SEC verdict, and none of them approves
anything.

| Version | Date | Change |
|---|---|---|
| `1.0.0-draft` | 2026-08-01 | Initial register at `301997f` |
| `1.1.0-draft` | 2026-08-01 | Adjudicated all 28 `REPORTED` findings at `a3e4968`: 20 CONFIRMED, 6 PARTIAL, 2 REFUTED, 0 unverifiable (§G). Recorded 7 corrections to findings this register carried, including that **it contradicted itself** on `DEF-B21` and that this producer **relayed unreproducible performance magnitudes without qualification** (`DEF-C10`). Added 9 producer-verified findings (§H), of which `DEF-A3` and `DEF-A4` are consequences of this producer's own `301997f` commit that it did not check at the time. Added SEC-preparation analysis (§I). The single most consequential new fact is `DEF-A8`: the production hub **can never return ALLOW**, so populating the resolver registry is the trigger event for the live-disclosure findings and should be gated |
| `1.2.0-draft` | 2026-08-02 | Recorded round 4 (SS J) - nine defects in the WP-SK-01 delivery itself, all producer-verified before acceptance and all fixed in `7eb7941` except `DEF-D8` and `DEF-D9`, which belong to ARCHI and REV/SEC. The most serious is `DEF-D1`: a commit message and a code comment asserted a control that did not exist, about the durability of the split ADR-0013 exists to create. Added SS K, a METHOD defect (`DEF-M1`): the producer reported "validate: 0 FAIL" throughout this programme from a grep against a status the validator never emits - the check could not fail, so every such claim was vacuously true. Standing rule adopted: validation is claimed by exit code, and a passing test proves nothing until shown to fail when it should. |
| `1.3.0-draft` | 2026-08-02 | Recorded SS L - four live authorization defects in the promotion chain, all producer-verified by probe. `DEF-R1` is the most consequential finding of this programme: a governance decision is a BEARER TOKEN, because decision-record.schema.json cannot name a skill, so one decision authorizes any skill at any scope - reproduced by registering an unrelated skill and a self-widened RESTRICTED grant off a single decision. It falsifies this producer's own `AC-VS-01` reasoning: the hole is not in who writes the manifest but in the decision not binding to what it authorizes. `DEF-R2`: a grant can never expire or be revoked, because decisionLookup is consulted only at registration - a live violation of governance-baseline SS 3. `DEF-R3`: evidence_refs is length-checked only. `DEF-G1`: the registry gate this producer drafted and the operator signed is CIRCULAR - it blocks the act whose completion is its own release condition. Added SS M - the evaluation corpus has 220 expectation instances drawn from 10 distinct strings, zero skill-specific expectation text, 30% undecidable by any means, and 0 of 22 negative cases able to fail, which `DEF-M1` disqualifies outright. Also recorded that this producer cited validate_pack.py repeatedly without running it; it exits 1 at HEAD. |
| `1.4.0-draft` | 2026-08-02 | Recorded SS N at `dcbabc4`. **Amended `DEF-R1`** (extend-only, the v1.3.0 entry is unchanged): the unbound surface also covers `supported_runtimes` and `max_data_classification`, so one decision authorizes any skill at any version, project set, runtime and data class - and `DEF-R1` is therefore a DECISION-RECORD defect, not a skill defect, so no fix confined to the skill contracts reaches it. Added four producer-verified findings. `DEF-R4`: the identical unbound shape exists at `temporal-ledgers.mjs:176` in `appendOutcome`, where both contracts REQUIRE project_id and work_package_id and nothing compares them, so an outcome receipt in one project can attach a forced reversion obligation to another project's decision - tracked separately because it is not skill-scoped. `DEF-M2`: a METHOD defect in the `DEF-M1` family - `npm run validate` cannot see a contract property change, because the pin at `validate-foundation.mjs:125` is a required-field SUBSET test with no property-count assertion and the exact-set pin added for `DEF-D1` covers one file only; adding `subject` to decision-record as optional AND as required both left validate at exit 0, and only the contract-validator suite returned exit 1. Any ADDITION to a governed contract passes validate unconditionally. `DEF-A12`: `docs/README.md:98` still labels the DEF-C3 SEC decision AWAITING SEC RULING while the record reads RULED with an operator signature - the index and the record disagree about whether a ruling exists. `DEF-A13`: this branch forks before `859468a`, which is on main and not an ancestor of HEAD (51 insertions absent from AGENTS.md), including the clauses that every skill is CANDIDATE / NOT EFFECTIVE at M0 and that making any skill EFFECTIVE is a separate operator/SEC-GOV act - **the SkillsHub programme has been reasoning about skill effectiveness on a branch missing the effective clause that governs it.** Corrected two of this register's own claims (SS N.3): `DEF-A5`'s "the tier split is a precondition of the first promotion" is FALSIFIED - the subject binding is, and the tier split without it leaves a service-written grant record with no authoritative source for its values; and `DEF-A8`'s premise is FALSE for the OD-SK-11 withheld-tally channel, which is live today with the signed registry gate in force (probed: 25 withheld = 3 DENY_UNGOVERNED_PACKAGE + 22 DENY_UNKNOWN_SKILL, query- and classification-invariant), because the hub indexes from disk and the MCP path builds a fresh hub per call. Corroborated `DEF-G1` (the one non-circular reading dies on `WP-SK-05`'s own scope line, which names resolver registration as its deliverable) and recorded that condition 2 of the signed DEF-C3 ruling is UNDISCHARGED at HEAD. `DEF-M2` is CLOSED at `249c798` (SS N.5) with a sabotage matrix whose "before" column was measured at `249c798~1` rather than assumed; every other finding in SS N is open. Closing it does not retroactively verify any claim this programme made on the strength of `validate` passing beforehand. |
| `1.5.0-draft` | 2026-08-02 | Recorded SS N.6 - two corrections surfaced by an independent preparer checking this producer's claims before writing them into a record for signature. `DEF-R2` was left marked CRITICAL with evidence that stopped being true at `44285f8`, a remediation this producer performed and then did not record. `DEF-M3`: `risk-registry.mjs:36` asserts that doc-parity drift "fails CI" and there is no CI in this repository - no .github/, no other pipeline config; the five readDoc parity tests are real and fail under npm test when run, but no pipeline enforces them, and this producer relayed "five CI-enforced doc-parity tests" without checking. Both are DEF-D1 recurrences: a claim about a control, believed because it was written down. |
| `1.6.0-draft` | 2026-08-02 | **SS O - closure.** The SkillsHub programme is stopped and the PRD is SUPERSEDED BY MOD-SKILL S1/S2. `main` carries skill-candidate-registry, skill-promotion-ledger and skill-revocation-ledger, and `contracts/skill-promotion.schema.json` binds a promotion to `skill_candidate_id`, `skill_version`, `bound_action` and `bound_object_version` with a producer/review/governance actor triple - DEF-R1 closed, and closed better than the fix this programme was preparing to propose. THE DEFECT IN THIS REGISTER: every "does not exist" finding it carries is scoped to a branch 296 commits behind `main`, and that scope is stated nowhere. DEF-A13 found 51 missing lines of AGENTS.md and the producer did not ask what else was missing - the answer was 406 files including the module this programme was designing. Six review rounds could not catch it because all six re-derived facts from the same stale tree: re-deriving a fact from a stale baseline reproduces the staleness with a verification stamp on it. Standing rule offered: a "does not exist" claim carries the ref it was verified against, or it is not a claim. Decision packets R1-001 and R1-SEQ-002 WITHDRAWN before any ruling. DEF-R2/R3 (fixed here at 44285f8) and DEF-M2 (fixed here at 249c798) are still OPEN on `main` and should be carried across. DEF-G1, DEF-R4, DEF-M3 and the doctrine question remain open. Everything else must be re-derived against `main` before being treated as current. |
