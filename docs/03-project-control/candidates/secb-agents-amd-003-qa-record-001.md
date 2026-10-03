# SECB-AGENTS-AMD-003 — Independent QA Record 001

**Artifact ID:** `SECB-AGENTS-AMD-003-QA-001`

**Status:** `DRAFT / NOT EFFECTIVE`

**Truth status:** `VERIFIED_TRUE` for the exact objects and observations listed below

**Authority status:** `ADVISORY_ONLY`

**Verdict:** `QA_PASS_WITH_NOTES_CANDIDATE_ONLY`

**Authored:** 2026-08-05T12:24:07+07:00 / 2026-08-05T05:24:07Z

**Next responsible roles:** independent REV and SEC, then human GOV/operator disposition

> This QA verdict binds only candidate commit
> `c0f7fc5b27f2bbd2d63b2c1d8e94ff28979d4eb2`, tree
> `b4f54f9d90737b8a94ed00b0405656155e5ed238`, parent
> `5ae52df05471b53d3e11e115769b313b214c27c1`, and base
> `origin/main` at `8be8c9953716c06cadfc6a581fe248e819747380`.
> Any different commit, tree, base, PR head, or amendment text voids this
> verdict and requires fresh independent QA.

## 1. Review identity and independence

| Field | Value |
|---|---|
| Reviewer role | Independent QA / assurance reviewer |
| Reviewer agent | OpenAI Codex collaboration agent `/root/adr_skill_qa` |
| Session identity | Collaboration task path `/root/adr_skill_qa`; provider session UUID not exposed to the reviewer |
| Harness/model identity | OpenAI Codex, GPT-5 family; exact deployment identifier not exposed and therefore not asserted |
| Candidate producer | Git author/committer `BizEra <ounkhamvilay@gmail.com>`; distinct from this QA agent |
| Candidate checkout | Clean, locked, detached worktree `C:\laragon\www\SecB-worktrees\qa-agents-amd003-c0f7fc5` |
| Record checkout | Branch `codex/agents-amd-003-qa-record-001`, cut from the exact base in a separate worktree |
| Independence claim | I2-style distinct agent/context with first-hand Git and test access; no claim of I3/I4 or evidence-acceptance authority |

The reviewer did not author `AGENTS.md` in the candidate, did not edit the
candidate checkout, and did not substitute the PR description or producer
validation for direct inspection. The reviewer-authored write set is limited to:

- `docs/03-project-control/candidates/secb-agents-amd-003-qa-record-001.md`
- `MANIFEST.json`

No candidate, root policy, source, contract, test, tool, effective record,
remote, PR, protected branch, deployment, or runtime was mutated by this lane.

## 2. Exact candidate and PR binding

| Object or relation | Independently verified value |
|---|---|
| Base | `8be8c9953716c06cadfc6a581fe248e819747380` |
| Candidate | `c0f7fc5b27f2bbd2d63b2c1d8e94ff28979d4eb2` |
| Candidate tree | `b4f54f9d90737b8a94ed00b0405656155e5ed238` |
| Candidate parent | `5ae52df05471b53d3e11e115769b313b214c27c1` |
| Merge base | `8be8c9953716c06cadfc6a581fe248e819747380` |
| Base-is-ancestor | `git merge-base --is-ancestor` exit 0 |
| Candidate lineage | `5ae52df05471b53d3e11e115769b313b214c27c1` → `c0f7fc5b27f2bbd2d63b2c1d8e94ff28979d4eb2` |
| Candidate write set | Exactly one modified path: `AGENTS.md` |
| Candidate `AGENTS.md` SHA-256 | `035b84043a79e4ebff387fcd498bfa7174aaee49840e203cf69a78c5aaf717e4` |

At 2026-08-05T12:24:07+07:00, this read-only command was executed:

```powershell
gh pr view 141 --json number,state,isDraft,mergeable,mergeStateStatus,baseRefName,baseRefOid,headRefName,headRefOid,url,title,author,reviewDecision,updatedAt
```

It reported PR #141 as `OPEN`, not draft, `MERGEABLE`, `CLEAN`, with base
`main` at the exact base and head `codex/agents-integration-delegation-001` at
the exact candidate. PR state is time-sensitive host evidence, not merge or
effectiveness authority.

## 3. Scope and governing baseline

The review compared the amendment directly with:

- the root working rules, bootstrap boundary, AMD-002 authorization and retained
  hard gates in `AGENTS.md`;
- decision rights and the governance baseline;
- universal lifecycle and producer/REV/QA/GOV separation;
- project/work-package mutation requirements;
- evidence/provenance and G0–G8 assurance gates;
- integration queue and branch policy; and
- R0–R4 risk and M0–M5 mutation classes.

The candidate is an authority-affecting governance proposal. It remains draft
documentation; it does not demonstrate an implemented grant verifier,
integration principal, branch-protection adapter, receipt ledger, deployment
mechanism, or activation control.

## 4. Retained bootstrap gate

The following independent checks passed:

| Bootstrap requirement | Exact candidate wording/result | QA result |
|---|---|---|
| Draft status | `DRAFT until independently reviewed and merged to main by a human operator under the rules effective before this amendment` | PASS |
| No self-authorization | The amendment says it does not authorize its own review, merge, or effectiveness | PASS |
| Prospective-only scope | `no retroactive authority` | PASS |
| Existing candidates excluded | PR #140 and every other existing candidate are not authorized retroactively | PASS |
| Human bootstrap retained | The retained human bootstrap gate remains controlling until the amendment is effective | PASS |

Therefore the exact candidate does not authorize a non-human principal to push,
merge, or activate now. Before effectiveness, the earlier prohibition on agent
merge remains controlling. Passing QA cannot make the amendment effective.

## 5. Required fields and testability

The amendment contains one uniquely identified AMD-003 section and exactly eight
numbered conditions. Each condition has an independently assessable proof method:

| Condition | Required facts | Deterministic proof or negative probe | Result |
|---:|---|---|---|
| 1 | Server-derived principal identity mapped to integration role | Resolve identity and role from authoritative registry; reject unknown, caller-declared, mismatched or revoked identity | TESTABLE |
| 2 | Current, scoped, expiring, revocable operator grant naming repository, action, exact candidate, target branch and validity window | Validate every field and issuer; reject missing, expired, revoked, wrong-repository, wrong-action, wrong-SHA or wrong-branch grant | TESTABLE |
| 3 | Durable independent REV, QA and SEC records bound to exact commit/tree; producer cannot transcribe them | Resolve records by reviewer identity and digest; reject missing role, same producer, changed SHA/tree or producer-authored copy | TESTABLE |
| 4 | Separate evidence-acceptance, GOV, integration and activation records/actions | Require distinct record identities, types and transitions; reject inferred or combined authority | TESTABLE |
| 5 | Immediate grant/candidate/target/check/protection freshness and fail-closed drift behavior | Re-resolve immediately before mutation; mutate a ref or expire/revoke grant and require denial | TESTABLE |
| 6 | Exact-head protection, reviewed-commit ancestry, no squash/rebase when assurance binds the original | Match expected head, inspect merge method and verify `merge-base --is-ancestor`; reject head drift and history rewrite | TESTABLE |
| 7 | Auditable receipt with actor, grant, repository, action, before/after refs, candidate, result and time | Schema-required receipt fields plus ref/result reconciliation; reject missing or mismatched field | TESTABLE |
| 8 | No self-issued/self-approved grant, self-evidence acceptance, waiver, SoD change or production declaration | Compare attributable actor/role identities and deny prohibited combinations | TESTABLE |

The amendment states necessary predicates; it does not claim that the current
repository implements their enforcement. Runtime conformance would require
positive, negative, adversarial, race/freshness, replay and failure-path tests
against the eventual implementation.

## 6. Wording and policy consistency

| Topic | Observation | Disposition |
|---|---|---|
| Explicit remote authority | Existing working rule 5 requires explicit authorization; condition 2 supplies a scoped, expiring and revocable operator grant | CONSISTENT |
| Evidence and decision separation | Condition 4 preserves evidence acceptance, GOV disposition, integration and activation as separate records/actions | CONSISTENT |
| Exact-object assurance | Conditions 2, 3, 5 and 6 consistently bind candidate identity, tree, target freshness and ancestry | CONSISTENT |
| Non-retroactivity | Status, scope and final paragraph agree that no current candidate is authorized | CONSISTENT |
| Human bootstrap | Status and final paragraph both retain prior human-only merge authority until effectiveness | CONSISTENT |
| Post-effectiveness merge rule | Earlier AMD-002 says `No agent merges to main`; AMD-003 later says an eligible non-human principal may merge once effective, but does not use explicit `supersedes`, `exception`, or `overrides` wording | NOTE QA-N1 |
| Scope versus activation | Scope says `repository integration only`, while the action sentence also mentions executing a separately authorized activation | NOTE QA-N2 |

The two notes do not create present authority: draft status and fail-closed rules
retain the human bootstrap gate. They do require explicit human GOV disposition
before the amendment is relied on as an effective machine-action policy.

## 7. Fresh validation evidence

All candidate checks ran after identity confirmation in the detached exact-SHA
checkout.

| Check | Fresh result |
|---|---|
| `git diff --check <base> <candidate>` | PASS; exit 0 |
| `node tools/validate-foundation.mjs` | PASS; 913/913 PASS; 0 non-PASS; exit 0 |
| `python .agents/scripts/validate_pack.py` | `VALIDATION: PASS`; 22 skills; 163 files; exit 0 |
| Root `MANIFEST.json` parse/inventory | 525 entries; 525 unique; `AGENTS.md` present exactly once |
| Amendment structural probe | One amendment ID; conditions exactly 1–8; all required bootstrap/grant/evidence/freshness/receipt/SoD clauses present |
| Candidate checkout status | Clean detached `HEAD`; no tracked modifications after checks |
| `npm ci` | Added 6 locked packages; exit 0 |
| `npm test` | 1346 tests; 1342 pass; 1 fail; 3 skipped; 0 cancelled/todo; exit 1 |

The sole suite failure is the pre-existing stale byte-identity pin in
`tests/skill-revocation-ledger.test.mjs`: it expects the older
`src/control/sod-rules.mjs` blob from `origin/main @ 0aa13f8`, while the exact
base contains the later intentionally changed blob. A prior independent clean
base reproduction established 46 standalone tests, 45 pass and the same single
failure. Neither the candidate nor this QA record changes either file. This is
recorded as QA-N3, not waived and not attributed to AMD-003.

## 8. Finding and residual-risk register

| ID | Severity | Confidence | Finding/residual risk | Required disposition |
|---|---|---|---|---|
| QA-N1 | Low | High | The intended post-effectiveness exception to the earlier absolute `No agent merges to main` hard gate is specific and understandable, but not explicitly labelled as a narrow supersession/exception. A literal policy compiler could retain both clauses and fail closed. | Human GOV should explicitly declare whether the exact AMD-003 text is the narrow exception, or require wording that names the superseded clause and preserves every other hard gate. |
| QA-N2 | Low | High | `repository integration only` and `execute a separately authorized activation` appear in the same scope. Separate authorization and inherited activation gates prevent current escalation, but the scope boundary is less precise than the conditions. | Human GOV should either exclude activation from AMD-003 or explicitly expand the scope and bind activation target/environment, rollback/recovery and release receipt through the separate authorization. |
| QA-N3 | Low, baseline-only | High | Base-wide `npm test` is not green because of the stale skill-revocation byte-identity pin; foundation and all amendment-specific checks pass. | Repair/supersede the stale pin in a separate authorized slice before claiming the integration base suite is fully green. |
| QA-R1 | Residual | High | Documentation predicates are not runtime enforcement. | Require implementation-specific negative/adversarial and TOCTOU tests before any integration principal becomes operational. |
| QA-R2 | Residual | High | PR state, grants, target refs, checks and branch protection can change after review. | Re-resolve all state immediately before any future mutation as condition 5 requires. |

No blocker, high, or medium defect was found in the exact draft candidate.

## 9. Verdict and limitations

**Verdict: `QA_PASS_WITH_NOTES_CANDIDATE_ONLY`.** The exact candidate is
sufficiently identified, bounded, prospective, fail-closed and independently
testable as a draft governance proposal. It retains the human bootstrap gate
and does not authorize itself, PR #140, PR #141, another candidate, merge,
activation or production status.

This verdict is not:

- evidence acceptance or GOV approval;
- amendment effectiveness;
- an authorization for remote push, PR mutation, merge or activation;
- proof that the eight controls are implemented; or
- a waiver of QA-N1, QA-N2, QA-N3 or any SEC/REV finding.

## 10. Review triggers and next-role checklist

Fresh QA is required if the candidate/tree/base/PR head changes; any required
field, bootstrap clause, SoD rule, grant rule, receipt field or scope changes;
the target branch or branch protection changes; an implementation is proposed;
or a remote mutation/activation is requested.

Before disposition, the next responsible roles must:

- verify the exact candidate and current PR #141 state again;
- inspect this record's exact authoring commit and two-file write set;
- independently inspect the candidate rather than trusting this narrative;
- disposition QA-N1 and QA-N2 explicitly in the human decision record;
- retain QA-N3 until the base test pin is separately corrected;
- require SEC treatment appropriate to an authority/SoD-affecting amendment;
- bind any future grant to an immutable identity, exact action/object/target and
  validity window; and
- retain all existing bootstrap, evidence, integration, release and activation
  gates not explicitly and validly changed by human GOV.

## 11. Record-authoring branch validation

Checks after the completed record and root-manifest edits produced:

| Check | Final result |
|---|---|
| Root `MANIFEST.json` parse/inventory | 526 entries; 526 unique; this record present exactly once |
| `node tools/validate-foundation.mjs` | PASS; 914/914 PASS; 0 non-PASS; exit 0 |
| `git diff --check` | PASS; no output; exit 0 |
| `npm ci` | Added 6 locked packages; exit 0 |
| `npm test` | 1346 tests; 1342 pass; 1 QA-N3 baseline failure; 3 skipped; 0 cancelled/todo; exit 1 |

The record branch has the same single base failure as the detached candidate and
pristine base checks. No additional failure was introduced by the two-file
reviewer write set.

## 12. Authority boundary and self-attestation

This reviewer record is advisory evidence only. It does not accept evidence,
approve or activate AMD-003, amend `AGENTS.md`, configure or mutate a remote,
push, create/update a PR, merge, publish, deploy, release, activate, or declare
production status.

```yaml
self_attestation:
  artifact_id: SECB-AGENTS-AMD-003-QA-001
  reviewer_agent: /root/adr_skill_qa
  reviewer_role: QA
  producer_role: distinct
  exact_candidate: c0f7fc5b27f2bbd2d63b2c1d8e94ff28979d4eb2
  exact_tree: b4f54f9d90737b8a94ed00b0405656155e5ed238
  exact_parent: 5ae52df05471b53d3e11e115769b313b214c27c1
  exact_base: 8be8c9953716c06cadfc6a581fe248e819747380
  verdict: QA_PASS_WITH_NOTES_CANDIDATE_ONLY
  evidence_acceptance_authority: false
  governance_authority: false
  remote_mutation_authority: false
  merge_authority: false
  activation_authority: false
```
