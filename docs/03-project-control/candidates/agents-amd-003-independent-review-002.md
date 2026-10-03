# SECB-AGENTS-AMD-003 - Independent Architecture and Authority Review 002

**Artifact ID:** SECB-AGENTS-AMD-003-REV-002
**Project / Work ID:** SecB / SECB-AGENTS-AMD-003
**Status:** DRAFT / NOT EFFECTIVE - REV PASS, EXACT-SHA POLICY CANDIDATE ONLY
**Owner:** REV
**Approval state:** ADVISORY ONLY; QA, SEC, human GOV, merge, runtime activation, and operational use remain separate
**Last updated:** 2026-08-05T12:47:12+07:00
**Review session:** `codex-rev-agents-amd-003-d57fdd6-20260805T124712+0700`
**Reviewer identity:** OpenAI Codex subagent `/root/adr_skill_rev`, acting only in the independent REV role
**Reviewer model:** GPT-5 family; the exact serving revision was not exposed to this reviewer session

## 1. Review identity and independence

This is a fresh review of the exact successor identified below. The prior REV dispositions for `c0f7fc5...` and `dce3b8d...` were treated only as historical finding inputs; neither verdict was transferred.

The reviewer did not author the candidate. Direct inspection, semantic probes, provenance verification, and validation were performed in a new clean detached worktree. This durable record was authored afterward on a separate branch created from the exact `origin/main` base.

Declared reviewer write-set:

- `docs/03-project-control/candidates/agents-amd-003-independent-review-002.md`
- `MANIFEST.json`
- `docs/MANIFEST.json`

The candidate worktree and candidate branch were not modified. No push, pull-request update, merge, evidence acceptance, delegation, policy adoption, publication, deployment, or activation was performed.

## 2. Exact review binding

| Binding | Verified value |
| --- | --- |
| Pull request | `#141`, `codex/agents-integration-delegation-001` -> `main` |
| Candidate commit | `d57fdd6cc9e4f76a6d49f4d1c91390c073dae148` |
| Candidate tree | `fcd5c4cdae54e14a9e5c88c4c674e6467a54da64` |
| Candidate parent | `dce3b8d658b1572c63e90a37d9af4686a06d2c55` |
| Review base | `origin/main` at `8be8c9953716c06cadfc6a581fe248e819747380` |
| Base tree | `5195f57204e9cdded54a97296c0d057899c9e20e` |
| Detached review worktree | `C:\laragon\www\SecB-review-d57fdd6` |

Live PR state observed on 2026-08-05: `OPEN`, non-draft, exact head matched, base `main`, `MERGEABLE`, merge-state `CLEAN`. The live `origin/main` ref also matched the bound base. Provider state is changeable observation, not approval or authority.

The cumulative candidate changes eight paths:

- `AGENTS.md`
- `MANIFEST.json`
- `docs/00-governance/decision-rights.md`
- `docs/00-governance/integration-principal-control-contract.md`
- `docs/03-project-control/candidates/secb-agents-amd-003-provenance-001.md`
- `docs/MANIFEST.json`
- `docs/README.md`
- `docs/adr/0009-scoped-integration-principal.md`

## 3. Review objective and baseline

The review asked whether this exact successor is a coherent, fail-closed policy candidate for a prospective non-human integration principal while preserving human bootstrap and keeping runtime activation separate.

Applicable sources included root and nested agent instructions, governance baseline, decision rights, authority/risk model, Project and Work Package contracts, role/SoD rules, serialized integration, assurance/evidence controls, exit gates, verification matrix, ADR-0009, the new control contract, source-pack provenance, and the current executable risk registry.

The candidate is R3/R4 authority and separation-of-duties documentation. Passing REV therefore cannot make it effective. Fresh exact-SHA QA and SEC, explicit human GOV disposition, and human bootstrap merge remain mandatory. Operational use additionally requires the separately reviewed and activated enforcement stack named by the contract.

## 4. Prior blocker closure matrix

| Prior blocker | Exact successor evidence | Result |
| --- | --- | --- |
| Authority precedence and A3 conflict | AMD-003 narrowly supersedes only the no-agent-merge clause for `MERGE_EXACT_HEAD_TO_MAIN`; decision rights place the action prospectively in A4; A3 remains preparation-only; ADR-0009 records options and human decision process. | CLOSED |
| Grant subject, issuer, integrity, replay, and revocation | Signed grant binds trusted issuer, server-derived subject, A4 ceiling, Project Contract, Work Package, one action, nonce, idempotency, `max_uses: 1`, revocation and freshness sources. | CLOSED |
| Target freshness, result binding, and atomicity | Action-specific expected state, composite evidence digest, expected merge-result tree, branch-protection/check digests, live revalidation, and provider conditional mutation/CAS are required. | CLOSED at policy-contract level |
| Action conflation and direct protected push | Four closed actions now have separate mutation objects, expected states, intended states, and atomic fences; direct protected push remains unconditionally denied. | CLOSED |
| Self-enforced security boundary | An independently administered external PDP is mandatory. Policy text, prompts, credentials, and local write access are explicitly insufficient. Runtime remains inactive until separate review and activation. | CLOSED at policy-contract level |
| Receipt integrity, actual result, and recovery | Hash-chained receipts include provider response digest, observed object version, actual after ref/SHA/tree and ancestry; only `PREPARED -> COMMITTED|ABORTED` is legal; terminal replay and indeterminate-fence recovery fail closed. | CLOSED |
| Human A5 and circular self-expansion | AMD-003 cannot authorize its own adoption; authority-basis, SoD, production, and policy changes remain human A5 decisions and human merges. | CLOSED |
| ADR, assurance process, and provenance | ADR-0009, control contract, manifests, historical SEC reference, and current-source Git-blob SHA-256 record are present. QA/SEC/GOV remain subsequent gates rather than implied by this REV. | CLOSED for candidate completeness; later gates pending |

## 5. Action-specific traceability

| Action | Bound object | Concurrency/freshness control | Verified policy result |
| --- | --- | --- | --- |
| `PUSH_CANDIDATE_BRANCH` | Grant-named unprotected candidate ref | Expected-old candidate-ref SHA and provider CAS on that ref only | PASS |
| `OPEN_PR` | Creation fingerprint over repository, base/head refs, and approved payload | Live head/base plus idempotent create-if-absent | PASS |
| `UPDATE_PR` | Immutable provider PR ID and enumerated mutable fields | Expected provider version/ETag, state, refs, and payload digest | PASS |
| `MERGE_EXACT_HEAD_TO_MAIN` | Immutable PR ID and protected target ref | Exact head/tree/base, expected-old target, branch-protection/check digests, expected result tree, and provider merge/CAS | PASS |

The contract explicitly forbids using one action's conditional object for another action. This closes the earlier ambiguity where PR metadata operations and protected-ref mutation shared one target-ref CAS rule.

## 6. Composite evidence and authority assessment

The operation grant binds immutable REV, QA, SEC, evidence-acceptance, and per-operation human GOV references plus a composite digest over those references, candidate commit/tree, target expectations, branch-protection policy, and required-check set. The external PDP must resolve the effective Project Contract and Work Package, confirm the subject's A4 ceiling, revalidate checks and branch protection, reproduce the digest, and compute the expected merge-result tree before mutation.

This is a design contract, not evidence that those services exist. The contract correctly keeps the result at `DENY_INTEGRATION_PRINCIPAL_INACTIVE` until the external PDP, trust/revocation provider, action-specific adapter, aligned A4 registry, receipt ledger, recovery probes, and human activation record are separately reviewed and effective.

## 7. Receipt, recovery, and failure-mode assessment

The receipt contract now distinguishes intended state from actual provider-observed state. It requires provider response digest, provider object version, after ref/SHA/tree, ancestry result, revocation checkpoint, hash-chain linkage, reason, and trusted time.

The legal state machine is closed:

```text
PREPARED -> COMMITTED
PREPARED -> ABORTED
```

Both terminal states are immutable. Pre-mutation failures resolve to `ABORTED`; post-mutation crashes recover the original operation and corroborate provider state before resolving `COMMITTED`; indeterminate partial fences stop for human recovery without guessing success or retrying mutation. No duplicate effect is authorized.

## 8. A4 drift and provenance

The current executable risk registry still carries the pre-amendment A4 wording. The successor no longer hides that drift: `decision-rights.md` declares protected integration inactive until a separately reviewed registry successor is effective, and the control contract lists an aligned executable A4 registry as an operational activation prerequisite. The drift therefore cannot silently grant or activate current authority.

Historical source-pack files under `docs/source/om-v0.1/` remain byte-unchanged. The new candidate provenance record preserves that immutable import history and separately records SHA-256 digests for five current successor surfaces. Independent recomputation from exact Git blobs matched all five entries.

ADR-0009 now attributes its historical security statement to the reviewer-authored SEC record at PR #145, exact commit `8939fdd7597dec32295e78f9d4a1ca8fb8619d3e`. Independent inspection confirmed that commit exists, adds the named SEC record, and binds its findings to AMD-003 revision 1 at `c0f7fc5...`. ADR-0009 correctly labels those findings as reported and pending separate evidence acceptance; it does not reuse that older SEC verdict for the current successor.

## 9. Fresh commands and results

All candidate commands were executed from the clean detached worktree.

| Check | Fresh result |
| --- | --- |
| Exact `HEAD`, tree, parent, merge-base, and base ancestry | matched section 2; ancestry PASS |
| Live `origin/main` and PR #141 head/base/state | exact refs matched; PR `OPEN`, non-draft, `MERGEABLE/CLEAN` |
| Cumulative changed paths | exactly the eight paths in section 2 |
| `npm run validate --silent` | `FOUNDATION_STATUS=PASS`; 923 checks; 0 failures |
| Internal-link checks within foundation validator | 222 checks; 0 failures |
| Manifest JSON/uniqueness/count | root 528 unique; docs 66 unique and declared count matched |
| YAML syntax | 159 files parsed |
| Action-specific semantic matrix | 4/4 actions contained the required distinct object, expected state, and fence |
| Current-source provenance SHA-256 | 5/5 exact Git blobs matched |
| Source-pack immutability | no diff under `docs/source/om-v0.1/` |
| Focused executable risk-registry suite | 15 tests; 15 pass; 0 fail; 0 skip |
| `git diff --check 8be8c995...HEAD` | PASS, exit 0 |
| Detached worktree status after review | clean |

The detached review intentionally did not install dependencies. A full-suite attempt therefore failed at module loading for tests that import `ajv` (`ERR_MODULE_NOT_FOUND`); it is not presented as a candidate test failure or a passing result. The candidate changes only controlled documentation and manifests. Foundation, link, manifest, provenance, action-matrix, and focused dependency-free checks above are the evidence used for this policy-candidate verdict. A later QA run should install from the lockfile in its isolated environment and report the complete suite independently.

## 10. Findings and residual risks

No blocking REV finding remains within the exact policy-candidate scope.

| ID | Classification | Observation | Required next treatment |
| --- | --- | --- | --- |
| REV-AMD003-002-N1 | LIMITATION | The external PDP, trust/revocation provider, action adapters, aligned A4 registry, receipt ledger, and recovery implementation do not exist in this candidate. | Keep `DENY_INTEGRATION_PRINCIPAL_INACTIVE`; separately implement, review, QA/SEC test, and human-activate. |
| REV-AMD003-002-N2 | GATE | No current exact-SHA QA, SEC, or human GOV disposition was present in PR #141 at review time. | Obtain fresh independent records and human disposition before any adoption or merge decision. |
| REV-AMD003-002-N3 | ENVIRONMENT LIMITATION | Full tests requiring installed npm dependencies were not executable in the read-only detached checkout. | QA must run the full locked suite in an isolated dependency-installed worktree. |
| REV-AMD003-002-N4 | LIVE-STATE LIMITATION | PR mergeability and branch state may change after review. | Rebind head, target, checks, and protection immediately before any human disposition or mutation. |

No residual risk is accepted or waived by this record.

## 11. Verdict

**REV PASS - ACCEPTABLE AS AN EXACT-SHA POLICY CANDIDATE, NOT EFFECTIVE.**

This verdict applies only to commit `d57fdd6cc9e4f76a6d49f4d1c91390c073dae148` and tree `fcd5c4cdae54e14a9e5c88c4c674e6467a54da64` against base `8be8c9953716c06cadfc6a581fe248e819747380`.

It means the policy design closes the previously identified REV blockers and is suitable to proceed to fresh QA, SEC, and human governance review. It does **not** approve ADR-0009, accept evidence or residual risk, authorize merge, make AMD-003 or its contract effective, align the executable registry, create a grant, permit remote mutation, or activate an integration principal.

## 12. Review triggers and next roles

A fresh REV is required for any candidate commit/tree or PR-head change, base/target change, contract/schema change, authority/A4 change, provenance change, or new enforcement implementation.

Next roles:

1. QA validates exact candidate completeness, negative cases, manifest/provenance, and the full locked suite.
2. SEC performs fresh threat and abuse-case review against this exact successor; the older PR #145 record does not transfer.
3. Human GOV decides ADR-0009 and policy adoption only after exact evidence is complete.
4. A human operator alone performs any bootstrap merge under the currently effective rules.
5. Runtime enforcement and operational activation remain separate future work with their own reviews and human activation record.

## 13. Reviewer self-certification

```yaml
self_certification:
  artifact_id: SECB-AGENTS-AMD-003-REV-002
  agent_id: codex-rev-agents-amd-003-d57fdd6
  task_identity: /root/adr_skill_rev
  role: REV
  independent_of_producer: true
  candidate_write_access_used: false
  verdict_scope: exact_sha_policy_candidate_only
  evidence_acceptance_authority: false
  governance_authority: false
  merge_authority: false
  delegation_authority: false
  activation_authority: false
  ready_for_qa_sec_gov_review: true
```

> This record is independent technical review evidence only. It cannot ratify, merge, delegate, or activate AMD-003.
