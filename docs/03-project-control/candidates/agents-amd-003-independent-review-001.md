# SECB-AGENTS-AMD-003 - Independent Architecture and Authority Review 001

**Artifact ID:** SECB-AGENTS-AMD-003-REV-001
**Project / Work ID:** SecB / SECB-AGENTS-AMD-003
**Status:** DRAFT / NOT EFFECTIVE - REV FAIL, REWORK REQUIRED
**Owner:** REV
**Approval state:** ADVISORY ONLY; no acceptance, merge, delegation, integration, or activation authority
**Last updated:** 2026-08-05T12:23:14+07:00
**Review session:** `codex-rev-agents-amd-003-c0f7fc5-20260805T122314+0700`
**Reviewer identity:** OpenAI Codex subagent `/root/adr_skill_rev`, acting only in the independent REV role
**Reviewer model:** GPT-5 family; the exact serving revision was not exposed to this reviewer session

## 1. Review identity and independence

The reviewer did not author the candidate commits. Direct inspection and validation were performed in a clean detached worktree at the exact candidate. The record was then authored on a separate branch created from the exact `origin/main` baseline.

Declared reviewer write-set:

- `docs/03-project-control/candidates/agents-amd-003-independent-review-001.md`
- `MANIFEST.json`
- `docs/MANIFEST.json`

The candidate worktree and candidate branch were not modified. No remote mutation, push, pull-request update, merge, evidence acceptance, delegation, publication, deployment, or activation was performed.

## 2. Exact scope and baseline

| Binding | Verified value |
| --- | --- |
| Pull request | `#141`, `codex/agents-integration-delegation-001` -> `main` |
| Candidate commit | `c0f7fc5b27f2bbd2d63b2c1d8e94ff28979d4eb2` |
| Candidate tree | `b4f54f9d90737b8a94ed00b0405656155e5ed238` |
| Candidate parent | `5ae52df05471b53d3e11e115769b313b214c27c1` |
| Review base | `origin/main` at `8be8c9953716c06cadfc6a581fe248e819747380` |
| Base tree | `5195f57204e9cdded54a97296c0d057899c9e20e` |
| Changed path | `AGENTS.md` only, 38 insertions |
| Detached review worktree | `C:\laragon\www\SecB-review-c0f7fc5` |

PR state observed on 2026-08-05: `OPEN`, non-draft, head SHA matched the candidate, base `main`, `MERGEABLE`, merge-state `CLEAN`. These are changeable provider observations, not governance approval or merge authority.

The review covered only the proposed `SECB-AGENTS-AMD-003` scoped integration-principal amendment. It assessed circular self-ratification, identity and grant binding, freshness, receipts, separation of duties, preserved human bootstrap, ambiguity, and enforceability.

## 3. Applicable authority baseline

The following direct sources were read in the candidate worktree:

- root `AGENTS.md`, including AMD-002 retained hard gates and the proposed AMD-003;
- `docs/00-governance/governance-baseline.md`;
- `docs/00-governance/decision-rights.md`;
- `docs/00-governance/authority-and-risk-model.md`;
- `docs/00-governance/SECB-GOV-001.md` and `governing-principles.md`;
- `docs/00-governance/agents-instructions-om-v0.1-candidate.md`;
- the universal lifecycle, role/SoD, Project Contract, Work Package, assurance, exit-gate, and verification documents required by root `AGENTS.md`;
- `docs/11-agents/01-roles-and-separation-of-duties.md`;
- `docs/14-delivery/04-release-and-integration.md`;
- `docs/16-security/02-risk-and-mutation-classes.md`;
- ADR-0006 harness-neutral authority and ADR-0007 serialized integration; and
- the existing integration-queue schema and ledger implementation.

Load-bearing baseline propositions are:

1. root AMD-002 says no agent merges to `main` and no remote mutation occurs without explicit operator authorization;
2. canonical A3 is candidate integration preparation, not protected merge;
3. A5 human authority retains production release, policy exception, and governance-root powers;
4. direct agent push to protected branches is prohibited;
5. authority and SoD changes require REV, QA, SEC, and human GOV at R3/R4; and
6. a harness or agent promise is not an enforcement boundary.

## 4. Verified strengths

| Control | Direct observation | Result |
| --- | --- | --- |
| No self-ratification of AMD-003 | The amendment says it cannot authorize its own review, merge, or effectiveness and requires a human operator merge under the prior rules. | PASS for bootstrap wording |
| No retroactive authority | The amendment is prospective and explicitly excludes PR #140 and other existing candidates. | PASS |
| Identity intent | It requires a server-derived identity mapped to an integration role. | PASS as intent; implementation binding unresolved |
| Time and object scope intent | It requires an expiring/revocable operator grant naming repository, action, candidate commit, target branch, and window. | PASS as partial grant requirements |
| Assurance independence intent | REV, QA, and SEC records must be durable, bind commit and tree, and not be transcribed by the producer. | PASS as policy intent |
| Decision separation | Evidence acceptance, GOV disposition, integration, and activation are stated as separate records/actions. | PASS as policy intent |
| Fail-closed intent | Identity, target freshness, checks, and protection are rechecked immediately before mutation; unknown or changed state is denied. | PASS as intent |
| Self-dealing prohibitions | Self-grant, self-evidence acceptance, finding waiver, SoD alteration, and production-status declaration are prohibited. | PASS as intent |

These strengths do not close the blocking contradictions and missing bindings below.

## 5. Traceability matrix

| Requirement | Candidate clause | Independent evidence | Status |
| --- | --- | --- | --- |
| Human bootstrap controls AMD-003 adoption | Status and closing paragraph | Direct diff; root retained hard gates | PASS |
| Integration authority has an unambiguous place in A0-A5 | General permission for a non-human principal to merge `main` | `decision-rights.md`, authority model, `risk-registry.mjs` all keep A3 below protected merge | FAIL |
| Grant is attributable and non-transferable | Condition 2 | No principal/actor subject, issuer identity, grant ID, integrity binding, or single-use key is required | FAIL |
| Exact target and integration result remain reviewed | Conditions 5-6 | No expected-old target SHA, merge-result tree, or atomic compare-and-swap requirement | FAIL |
| Protected-branch mutation cannot bypass queue policy | Permission to `push` and merge | No direct-push prohibition or action-specific target restriction; release baseline prohibits direct agent push | FAIL |
| Controls are enforced outside agent narration | Conditions 1-8 | No authoritative decision service, contract, verifier, protected-branch app, or execution adapter is named; existing queue ledger is explicitly UNWIRED | FAIL |
| Receipt remains durable and meaningful when the mutation fails | Condition 7 | Receipt destination, schema, integrity, ordering, and failure behavior are absent | FAIL |
| Human A5 remains final for production/authority changes | Separate activation and GOV language | No explicit human-A5 binding for production activation or future authority-policy integration | FAIL |

## 6. Finding register

### F-AMD003-01 - Contradictory authority and missing precedence

- **Severity:** HIGH / BLOCKING
- **Confidence:** High
- **Verified evidence:** Existing root AMD-002 says no agent merges to `main`. Canonical A3 and the implemented risk registry say integration-candidate preparation permits no protected merge. AMD-003 says a non-human integration principal may merge `main` once effective.
- **Risk:** The same repository would contain mutually exclusive operative rules without identifying which exact clauses, authority class, decision-right row, or risk-registry behavior AMD-003 supersedes. A fail-closed implementation must deny; a permissive implementation could choose the new sentence and bypass the canonical ceiling.
- **Required disposition:** Add an explicit human-approved ADR and normative precedence/migration section. Define the new authority class or narrowly delegated execution right, update canonical decision rights and affected executable policy together, and state which retained hard-gate text remains unchanged.

### F-AMD003-02 - Grant is not bound to the acting principal and is replayable

- **Severity:** HIGH / BLOCKING
- **Confidence:** High
- **Verified evidence:** Condition 2 requires repository, action, candidate commit, target branch, and window, but not subject principal identity, grant ID, issuer identity/authority, issuance time, signature or content hash, nonce/idempotency key, maximum use, consumption state, or authoritative revocation version.
- **Risk:** A structurally conforming grant can be transferred between principals, replayed during its window, or evaluated from stale/revoked state.
- **Required disposition:** Define a closed, versioned grant contract binding issuer, subject principal/session, role, repository, action enum, source/candidate commit and tree, target ref and expected target SHA, validity, nonce/idempotency, maximum use, revocation source/version, authority decision, and integrity proof. Require server-side resolution at mutation time.

### F-AMD003-03 - Freshness and exact-head controls do not bind the integration result

- **Severity:** HIGH / BLOCKING
- **Confidence:** High
- **Verified evidence:** The amendment requires target-branch freshness and preservation of the reviewed candidate as an ancestor, but the grant does not bind the expected target SHA. It does not require an exact merge-result tree, composite simulation, or atomic compare-and-swap of the protected ref.
- **Risk:** The candidate can remain an ancestor while the merged composition differs from what REV/QA/SEC evaluated. A target change between check and mutation creates a TOCTOU path.
- **Required disposition:** Bind `expected_old` target commit, candidate commit/tree, merge method, expected result tree/commit, composite check set and evidence digest. Recompute and re-review when the target changes. Mutate only with provider-enforced exact-head and atomic expected-old semantics.

### F-AMD003-04 - Remote actions are over-broad and direct protected push is not denied

- **Severity:** HIGH / BLOCKING
- **Confidence:** High
- **Verified evidence:** The single permission covers push, PR create/update, merge, and activation. It does not distinguish branch push from protected-ref push. The release baseline separately says no direct agent push to protected branches.
- **Risk:** A grant with target branch `main` can be read as permitting a direct push, bypassing the PR queue and merge-only controls. Conversely, requiring completed REV/QA/SEC before an initial feature-branch push or PR creation makes the workflow impractical and ambiguous.
- **Required disposition:** Define separate action types and preconditions. Explicitly deny direct push/update of protected refs. Keep feature-branch publication and PR metadata mutation distinct from protected merge and activation.

### F-AMD003-05 - Enforcement is delegated to the principal itself

- **Severity:** HIGH / BLOCKING
- **Confidence:** High
- **Verified evidence:** The amendment names conditions but no authoritative identity/grant resolver, policy decision point, protected-branch integration service, or provider control. Repository search found no integration-principal implementation. The existing `IntegrationQueueLedger` identifies itself as an UNWIRED primitive with no live Git/CI wiring, merge simulation, or composite verification.
- **Risk:** The proposed security boundary becomes an agent promise and local preflight rather than an independently enforced gate. This conflicts with harness-neutral authority doctrine.
- **Required disposition:** Name or define the external enforcement boundary and deny operation until it exists. Require an independently verifiable policy decision and provider-enforced branch protection; do not make the permission effective merely by merging prose.

### F-AMD003-06 - Receipt requirements are non-atomic and lack integrity semantics

- **Severity:** HIGH / BLOCKING
- **Confidence:** High
- **Verified evidence:** Condition 7 lists useful receipt fields but does not identify a schema, durable destination, sequence/idempotency, integrity/signature, retention, or whether an intent is sealed before the effect and a result appended after it.
- **Risk:** The mutation can succeed while receipt emission fails, leaving no trustworthy audit record. A post-hoc self-authored receipt can misstate the provider result.
- **Required disposition:** Define a two-phase durable receipt contract: sealed authorization/preflight intent before mutation and provider-observed result after mutation, both linked by operation ID, hash/sequence, expected/actual refs, and failure disposition. Provider audit evidence must corroborate the actor report.

### F-AMD003-07 - Human A5 boundary is inherited but not explicit for future uses

- **Severity:** HIGH / BLOCKING
- **Confidence:** Medium-high
- **Verified evidence:** Human merge under the pre-amendment rules preserves AMD-003 bootstrap. For later operations, the clause names an operator grant and separate GOV record but does not state that production activation, authority-model changes, grant-policy changes, or integration of changes to AMD-003 itself require human A5 and human protected-branch integration.
- **Risk:** The non-human principal could be interpreted as eligible to merge a successor that expands its own authority after receiving an ordinary operator grant, creating an indirect circular escalation path.
- **Required disposition:** Reserve AMD-003, root `AGENTS.md`, decision-rights, authority/SOD, grant issuer/trust policy, evidence acceptance, branch protection, and production activation changes to explicit human A5 decision and human merge. A delegated principal must be prohibited from integrating changes to its own authority basis.

### F-AMD003-08 - Required architecture decision and assurance packet are absent from the candidate

- **Severity:** MEDIUM / BLOCKING FOR MERGE READINESS
- **Confidence:** High
- **Verified evidence:** The exact PR changes only `AGENTS.md`. No ADR, migration/precedence record, QA record, SEC record, human GOV disposition, grant schema, receipt schema, or negative-control evidence is present in the exact candidate.
- **Risk:** Reviewers cannot verify a complete authority change or its enforcement/migration semantics from this prose-only change.
- **Required disposition:** Produce the ADR and bounded control contracts, then obtain independent QA, SEC, and explicit human GOV disposition against the exact successor candidate.

## 7. Circular self-ratification assessment

**Direct bootstrap loop:** not found. The text correctly states that AMD-003 cannot authorize its own review, merge, or effectiveness and retains human merge under the rules effective before it.

**Indirect future loop:** unresolved and blocking. After effectiveness, the text does not explicitly prohibit the delegated principal from integrating a later change to its own authority basis, grant issuer, decision-rights matrix, root instructions, or protected-branch controls. Condition 8 prohibits the principal from "altering separation of duties," but the boundary of that phrase and the enforcement owner are undefined. The safer rule is path- and decision-class-specific human A5 reservation.

## 8. Verification commands and fresh results

Executed from the clean detached candidate worktree:

| Command | Result |
| --- | --- |
| `git rev-parse HEAD` | exact candidate `c0f7fc5b27f2bbd2d63b2c1d8e94ff28979d4eb2` |
| `git rev-parse HEAD^{tree}` | exact tree `b4f54f9d90737b8a94ed00b0405656155e5ed238` |
| `git rev-parse HEAD^` | parent `5ae52df05471b53d3e11e115769b313b214c27c1` |
| `git merge-base HEAD 8be8c995...` | exact base `8be8c9953716c06cadfc6a581fe248e819747380` |
| `git diff --name-status 8be8c995...HEAD` | only `M AGENTS.md` |
| `git diff --check 8be8c995...HEAD` | PASS, exit 0 |
| `npm run validate --silent` | `FOUNDATION_STATUS=PASS`, 913 checks, 0 failures |
| direct clause/token and repository enforcement search | confirmed missing bindings listed in findings and no integration-principal implementation |
| `git status --short` after review | empty; detached candidate remained clean |

Foundation validation proves repository structural consistency. It does not prove that the new authority is safe, unambiguous, or externally enforced.

## 9. Verdict and limitations

**REV FAIL - REWORK REQUIRED. DO NOT TREAT THIS EXACT CANDIDATE AS MERGE-READY OR EFFECTIVE.**

The candidate preserves its immediate human bootstrap and contains several sound policy intentions. It nevertheless fails independent architecture/authority review because the protected-merge permission conflicts with the canonical authority ceiling and retained hard gate, the grant is not actor-bound or replay-resistant, target freshness is not atomically bound, direct protected push is not explicitly denied, receipt semantics are not durable/atomic, and no external enforcement boundary is defined.

This verdict is a technical REV disposition bound only to the exact candidate and tree in section 2. It does not reject the business goal of a scoped integration principal, decide governance policy, waive findings, update the PR, or exercise merge/activation authority.

## 10. Residual risks if merged unchanged

| Risk | Likelihood | Impact | Current control |
| --- | --- | --- | --- |
| Conflicting clauses cause inconsistent allow/deny behavior | High | High | Only general fail-closed wording |
| Grant reuse by the wrong principal | Medium-high | High | No subject binding in AMD-003 |
| Merge against an unreviewed target/result | Medium-high | High | Freshness check is not target-SHA/CAS bound |
| Direct protected-ref push interpretation | Medium | Critical | Existing contradictory prohibition only |
| Missing receipt after successful mutation | Medium | High | Actor "emits" receipt; no durable atomic gate |
| Indirect self-expansion through future governance changes | Low-medium | Critical | Ambiguous SoD prohibition; no protected policy path reservation |

## 11. Required corrective actions and next roles

1. ARCHI/GOV must author an ADR resolving authority-class, precedence, and human-reserved policy paths.
2. ENGIN/ARCHI must define closed identity, operator-grant, integration-decision, and receipt contracts plus server/provider enforcement boundaries.
3. QA must test positive, negative, stale-target, wrong-principal, replay, revoked-grant, direct-protected-push, receipt-failure, and TOCTOU cases.
4. SEC must threat-model credential use, grant theft/replay, branch-protection bypass, provider compromise, and circular authority escalation.
5. Human GOV/A5 must decide the amended policy and residual risk.
6. A human operator must perform any eventual adopting merge under the currently effective rules.

Any changed candidate commit/tree, authority baseline, grant contract, integration adapter, branch-protection configuration, or target branch requires fresh review.

## 12. Reviewer self-certification

```yaml
self_certification:
  artifact_id: SECB-AGENTS-AMD-003-REV-001
  agent_id: codex-rev-agents-amd-003-c0f7fc5
  task_identity: /root/adr_skill_rev
  role: REV
  independent_of_producer: true
  candidate_write_access_used: false
  verdict_scope: exact_sha_candidate_only
  evidence_acceptance_authority: false
  governance_authority: false
  merge_authority: false
  delegation_authority: false
  activation_authority: false
  ready_for_rework: true
```

> This record supplies independent review evidence only. It cannot ratify AMD-003, alter authority, or authorize any remote action.
