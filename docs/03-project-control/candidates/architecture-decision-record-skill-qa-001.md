# Architecture Decision Record Skill — Independent QA Record 001

**Artifact ID:** `SECB-ADR-SKILL-QA-001`

**Status:** `DRAFT / NOT EFFECTIVE`

**Truth status:** `VERIFIED_TRUE` for the exact objects and fresh observations listed below

**Authority status:** `ADVISORY_ONLY`

**Verdict:** `PASS_CANDIDATE_ONLY`

**Authored:** 2026-08-05T03:22:00+07:00 / 2026-08-04T20:22:00Z

**Next responsible roles:** independent REV and SEC, followed by human GOV/operator disposition where promotion is requested

> This record is valid only for candidate commit
> `ef3aa9b589ec2ce087981351ceb537718b42e0fa`, tree
> `afd15f2f9227b942029377543300a1fc3c2b1ad5`, parent
> `0a847325aa35cd1a00ae9c803a047d46ae7fa923`, based on
> `origin/main` at `8be8c9953716c06cadfc6a581fe248e819747380`.
> Any byte change, rewritten commit, different tree, different base, or changed
> PR head voids this verdict and requires fresh QA.

## 1. Review identity and independence

| Field | Value |
|---|---|
| Reviewer role | Independent QA / assurance reviewer |
| Reviewer agent | OpenAI Codex collaboration agent `/root/adr_skill_qa` |
| Session identity | Collaboration task path `/root/adr_skill_qa`; a provider session UUID was not exposed to the reviewer |
| Harness and model identity | OpenAI Codex; GPT-5 family. The exact deployment identifier was not exposed to the reviewer and is therefore not asserted. |
| Candidate producer | Git author/committer `BizEra <ounkhamvilay@gmail.com>` on the reviewed tip; not this QA agent |
| Evidence checkout | Clean, locked, detached worktree `C:\laragon\www\SecB-worktrees\qa-adr-ef3aa9b-20260805` at the exact candidate |
| Record-authoring checkout | Clean branch worktree `C:\laragon\www\SecB-worktrees\adr-skill-qa-record-001`, branch `codex/adr-skill-qa-record-001`, cut from the exact base |
| Independence level | At least I2 for agent instance/context and first-hand evidence access; no claim of I3/I4 because the exact reviewer model deployment and human/external assurance are not established |

The reviewer did not produce any of the 15 candidate paths, did not rely solely
on the producer summary, and executed the recorded checks against Git objects in
a detached checkout. The reviewer-authored write set is limited to this record
and its root inventory entry:

- `docs/03-project-control/candidates/architecture-decision-record-skill-qa-001.md`
- `MANIFEST.json`

No `.agents/**`, `src/**`, `contracts/**`, `tools/**`, `tests/**`, effective
record, policy, ADR, remote, PR, or protected-branch content was mutated by this
QA lane.

## 2. Exact scope and live repository binding

### Candidate object identity

| Object | Verified value |
|---|---|
| Base | `8be8c9953716c06cadfc6a581fe248e819747380` |
| Candidate commit | `ef3aa9b589ec2ce087981351ceb537718b42e0fa` |
| Candidate tree | `afd15f2f9227b942029377543300a1fc3c2b1ad5` |
| Candidate parent | `0a847325aa35cd1a00ae9c803a047d46ae7fa923` |
| Merge base of base and candidate | `8be8c9953716c06cadfc6a581fe248e819747380` |
| Base ancestry | `git merge-base --is-ancestor` exit 0 |

The four-commit candidate lineage from the exact base was independently
observed as `a6b0dfca70e40acdac4fc8a79cc8d00fa9782675` →
`2d4e52ad90ed675b532cc063cc45e18ee9326cd7` →
`0a847325aa35cd1a00ae9c803a047d46ae7fa923` →
`ef3aa9b589ec2ce087981351ceb537718b42e0fa`.

### Candidate write set

`git diff --name-status <base> <candidate>` returned exactly 15 paths:

```text
M .agents/MANIFEST.sha256
M .agents/docs/skill-catalog.md
A .agents/evals/architecture-decision-record-v0.2.0-claude-output.json
A .agents/evals/architecture-decision-record-v0.2.0-codex-output.json
A .agents/evals/architecture-decision-record-v0.2.0-cross-harness.md
A .agents/evals/architecture-decision-record-v0.2.0-prompt.txt
M .agents/schemas/architecture-decision-record.schema.json
M .agents/scripts/validate_pack.py
M .agents/skills/architecture-decision-record/SKILL.md
M .agents/skills/architecture-decision-record/agents/openai.yaml
M .agents/skills/architecture-decision-record/assets/output-template.md
M .agents/skills/architecture-decision-record/evals/cases.yaml
M .agents/skills/architecture-decision-record/manifest.yaml
M .agents/skills/architecture-decision-record/references/workflow.md
M .agents/templates/architecture-decision-record.yaml
```

### PR #140 live observation

At 2026-08-05T03:22+07:00, the read-only command

```powershell
gh pr view 140 --json number,state,isDraft,mergeable,mergeStateStatus,baseRefName,baseRefOid,headRefName,headRefOid,url,title,author,reviewDecision,updatedAt
```

reported PR #140 as `OPEN`, not draft, `MERGEABLE`, `CLEAN`, base `main` at
`8be8c9953716c06cadfc6a581fe248e819747380`, and head
`codex/architecture-decision-authority-001` at the exact candidate. This is a
time-bounded reported repository state, not merge authority.

## 3. Environment

| Component | Freshly observed value |
|---|---|
| OS / shell | Windows / PowerShell |
| Git | `git version 2.53.0.windows.1` |
| Python | `3.13.12` |
| Node.js | `v24.12.0` |
| npm | `11.18.0` |
| Codex CLI | `codex-cli 0.146.0` |
| Claude Code | `2.1.221` |
| Foundation validator | `0.3.0-alpha.0` |

The Codex and Claude CLI versions match the producer cross-harness evidence.

## 4. Fresh commands and results

All candidate checks below ran in the detached exact-candidate worktree after
identity and cleanliness were established.

| Check | Command or procedure | Fresh result |
|---|---|---|
| Skill structure | `python C:\Users\ounkh\.codex\skills\.system\skill-creator\scripts\quick_validate.py .agents/skills/architecture-decision-record` | `Skill is valid!`; exit 0 |
| Skill pack | `python .agents/scripts/validate_pack.py` | `VALIDATION: PASS`; 22 skills; 167 files; exit 0 |
| Foundation | `node tools/validate-foundation.mjs` and direct count of `checks[]` | `PASS`; 913 total; 913 PASS; 0 non-PASS; exit 0 |
| Candidate whitespace | `git diff --check <base> <candidate>` | no output; exit 0 |
| Detached cleanliness | `git status --short --branch` | `## HEAD (no branch)`; no modified paths |
| Whole-tree structured parsing | Python `yaml.safe_load` / `json.loads` over every matching Git blob in the candidate tree | 159 YAML and 80 JSON files parsed; exit 0 |

## 5. Schema and serialization evidence

The reviewer loaded
`.agents/schemas/architecture-decision-record.schema.json` from the exact Git
commit and applied `jsonschema.Draft202012Validator` independently to each raw
stdout artifact.

| Raw artifact | Git-blob SHA-256 | Bytes | Schema errors | Canonical values |
|---|---|---:|---:|---|
| Codex | `b295a4e06d3af9f63f033b0f95e14d5ed74527d06dd589bf5dc2b5178d299276` | 2241 | 0 | `DECISION_CANDIDATE`; `DECISION_CANDIDATE`; `NOT_EFFECTIVE`; `decision=PostgreSQL` |
| Claude | `cee7afe1010cebcb0166cc1d8b9fb62321f90ddd060f427ac4f545302eb7fd22` | 3793 | 0 | `DECISION_CANDIDATE`; `DECISION_CANDIDATE`; `NOT_EFFECTIVE`; `decision=PostgreSQL` |

Both complete objects omit `selected_option`, keep `approver` null, and include
the synthetic authority reference without asserting mutation or activation
authority. Negative probes were applied to both objects:

- Lowercasing `decision_mode` produced two schema errors per object.
- Injecting `selected_option: PostgreSQL` produced one schema error per object.

This demonstrates acceptance of the canonical full outputs and rejection of
the two serialization regressions in scope.

## 6. Evaluation coverage

Direct parsing of
`.agents/skills/architecture-decision-record/evals/cases.yaml` found 15 unique
case IDs:

| Class | Count |
|---|---:|
| Positive | 3 |
| Negative | 2 |
| Adversarial | 6 |
| Boundary | 2 |
| Cross-harness | 2 |

The suite explicitly contains `option-disposition-confusion`,
`canonical-token-casing`, `cross-harness-comparison`, `self-issued-authority`,
`authentication-is-not-authority`, `moved-target`, and `incomplete-input`.
The pack validator also exercises the full-output schema gate and the 3×3
decision-mode/disposition matrix.

## 7. Manifest and reproducibility evidence

The reviewer read all 166 entries from the candidate's canonical
`.agents/MANIFEST.sha256`, retrieved each referenced Git blob with
`git cat-file blob <candidate>:.agents/<path>`, and recomputed SHA-256.
Result: 166 PASS, 0 mismatch. The skill, workflow, schema, prompt template, and
both raw outputs are present in that manifest.

The hashes declared in the cross-harness evidence match the exact Git blobs:

| Input | SHA-256 |
|---|---|
| `SKILL.md` | `d561e594b845d2c273662dc9eaa423906d4f38e476003ded40bff0054b751618` |
| `workflow.md` | `320ec8d2fae1cbc2c656046f1b8447aa016fcd44cf7094523fc6ed9058ac55c5` |
| ADR schema | `fcee3c8492fc67e4feebd4eff99fccc9c0020121c4c8d0e2ac54b3ae2c9f2ff2` |
| Prompt template | `f084560cca77ea2f7dbf0b85f7715b474c27630ed204801995180851a3e44d54` |

Each named placeholder occurs exactly once. Replacing the placeholders in the
declared order with the three raw Git blobs, without other transformation,
reconstructs a 12,519-byte UTF-8 prompt with SHA-256
`0573c3ddb2de2e3f16c5f8363b2ebbab640f54f3fa192c7e0e6cafb41dca4eb5`.

## 8. Traceability and findings

| Requirement | Direct evidence | QA disposition |
|---|---|---|
| Exact target and base identity | Git object, tree, parent, merge-base, ancestry and PR probes | PASS |
| Full schema-valid outputs | Raw Codex and Claude JSON plus independent schema validation | PASS |
| Canonical casing | Raw values plus lowercase negative probes | PASS |
| No `selected_option` | Raw-object inspection plus unknown-field negative probes | PASS |
| Evaluation coverage | Parsed 15-case suite and pack matrix validation | PASS |
| Manifest integrity | 166 exact Git blobs rehashed | PASS |
| Foundation conformance | 913/913 PASS | PASS |
| Evidence reconstruction | Input hashes, unique placeholders and independently derived expanded-prompt digest | PASS with limitation QA-L1 |

### Finding register

| ID | Severity | Finding | Required disposition |
|---|---|---|---|
| QA-L1 | Informational | QA verified retained raw stdout, commands, versions, hashes and deterministic prompt reconstruction, but did not replay the nondeterministic model executions. Original execution provenance remains producer-authored evidence. | Preserve this limitation; any challenge to execution provenance requires a fresh independently observed harness run. |
| QA-L2 | Informational | The producer evidence did not predeclare the expanded-prompt digest; this QA record derives and binds it from the declared raw Git inputs. | Use the digest above for comparison or recompute from the exact candidate; no candidate change required. |
| QA-L3 | Informational | This review covers the declared Codex and Claude cross-harness evidence. It is not a publication-compatibility verdict for Antigravity, Generic CLI, or any future harness. | Complete and independently review the applicable publication compatibility matrix before promotion. |
| QA-L4 | Low, baseline-only | The repository-wide `npm test` is not green at the exact base because `tests/skill-revocation-ledger.test.mjs` pins `src/control/sod-rules.mjs` to older `origin/main @ 0aa13f8`; the current base intentionally changed that source. The same 45-pass/1-fail result reproduces in a pristine detached checkout of the exact base. | Repair or supersede the stale byte-identity pin in a separately authorized slice before claiming the base-wide suite is green. This is outside the ADR-skill candidate and record write sets. |

No blocker, high, medium, or low defect was found in the assigned QA scope.

## 9. Verdict, residual risk, and limitations

**Verdict: `PASS_CANDIDATE_ONLY`.** The exact candidate satisfies the assigned
technical QA checks for bounded ADR decision output, canonical serialization,
full raw cross-harness artifacts, evaluation coverage, manifest integrity, and
foundation conformance.

Residual risk is limited to the explicit informational items above and to
assurance outside this QA assignment. In particular:

- producer execution provenance was not converted into independently witnessed
  provider provenance;
- SEC threat/control review was not performed by this QA lane;
- broad publication compatibility and outcome performance were not assessed;
- the exact base carries the independently reproduced QA-L4 stale test pin;
- PR state is time-sensitive and must be rechecked before any disposition; and
- this record says nothing about production wiring or activation.

## 10. Review triggers and next-role acceptance checklist

A fresh review is required when any of the following occurs:

- candidate commit, tree, parent, merge base, PR head, or base changes;
- schema, canonical tokens, authority fields, disposition rules, workflow,
  templates, raw outputs, eval cases, or manifest hashes change;
- a new harness/model/runtime is declared or an existing version changes;
- promotion, publication, merge acceptance, runtime wiring, or activation is
  requested;
- an integrity mismatch, conflicting reviewer result, or material security
  finding appears; or
- the authority model, separation-of-duties rule, or evidence-acceptance policy
  changes.

The next role must independently:

- re-resolve the exact candidate and current PR state;
- verify this record's authoring commit and declared two-file write set;
- inspect the underlying raw artifacts rather than trusting this narrative;
- disposition QA-L1 through QA-L3 for the intended lifecycle transition;
- obtain SEC and human GOV/operator decisions where promotion or activation is
  proposed; and
- preserve a fail-closed state until all applicable exit gates are PASS.

## 11. Record-authoring branch validation

Checks executed after the final record and manifest edits produced:

| Check | Result |
|---|---|
| Root manifest parse and inventory | 526 entries; 526 unique; this record present exactly once |
| `node tools/validate-foundation.mjs` | `PASS`; 914/914 PASS; 0 non-PASS; exit 0 |
| `git diff --check` | no output; exit 0 |
| `npm ci` | added 6 packages from the lockfile; exit 0 |
| `npm test` | 1346 tests; 1342 pass; 1 fail; 3 skipped; 0 cancelled/todo; exit 1 due solely to QA-L4 in the observed output. The affected standalone suite reported 46 tests, 45 pass, 1 fail, 0 skipped. |

QA-L4 was reproduced without this record or manifest change in a pristine,
detached checkout at base `8be8c9953716c06cadfc6a581fe248e819747380`
(tree `5195f57204e9cdded54a97296c0d057899c9e20e`). After `npm ci`, this command:

```powershell
node --test tests/skill-revocation-ledger.test.mjs
```

returned the same sole failure at line 581: actual `sod-rules.mjs` Git blob
`314f6da194ed3eb5342eb224f2084fb7fe631359` versus stale expected blob
`4ffbc2019aae88178ecf0e5e6d2aa6b1e4aa9530`. The detached baseline checkout
remained clean. This establishes that the failure predates and is independent
of the two-file reviewer write set; it is disclosed rather than waived.

## 12. Authority boundary and self-attestation

This document is reviewer-authored advisory evidence. It does **not** accept
evidence into an effective ledger, approve the architecture decision, promote
or publish the skill, merge PR #140, mutate `main`, authorize integration,
configure a remote, deploy, wire a runtime, release, or activate anything.
Only the appropriately authorized independent and human roles may perform those
transitions.

```yaml
self_attestation:
  artifact_id: SECB-ADR-SKILL-QA-001
  reviewer_agent: /root/adr_skill_qa
  reviewer_role: QA
  producer_role: distinct
  exact_candidate: ef3aa9b589ec2ce087981351ceb537718b42e0fa
  exact_tree: afd15f2f9227b942029377543300a1fc3c2b1ad5
  exact_parent: 0a847325aa35cd1a00ae9c803a047d46ae7fa923
  exact_base: 8be8c9953716c06cadfc6a581fe248e819747380
  verdict: PASS_CANDIDATE_ONLY
  evidence_acceptance_authority: false
  merge_authority: false
  promotion_authority: false
  publication_authority: false
  activation_authority: false
```
