# SkillsHub PRD — Open Defect Register

**Document ID:** `SECB-PRD-SKILLSHUB-DEFECTS-001`
**Version:** `1.2.0-draft`
**Status:** `DRAFT / NOT EFFECTIVE / OPEN`
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
