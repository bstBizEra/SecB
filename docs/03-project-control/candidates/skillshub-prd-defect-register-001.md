# SkillsHub PRD — Open Defect Register

**Document ID:** `SECB-PRD-SKILLSHUB-DEFECTS-001`
**Version:** `1.0.0-draft`
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

## B. Reported by independent review — NOT verified by this producer

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

1. **REV** — rule on §B. Twenty-five findings are reviewer-reported and
   producer-unverified; they need someone other than this producer to establish
   them. Start with `DEF-B1` and `DEF-B2`, which change requirements rather than
   wording.
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
