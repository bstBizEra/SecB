# SECB-AGENTS-AMD-003 — Independent SEC and Authority Review

**Artifact ID:** `SECB-AGENTS-AMD-003-SEC-REVIEW-001`

**Status:** `DRAFT / NOT EFFECTIVE`

**Truth status:** `VERIFIED_TRUE` for the exact candidate and first-hand evidence below

**Authority status:** `ADVISORY_ONLY`

**Risk / mutation class:** `R4 / M0` review of a prospective remote-integration authority change; this record performs no remote mutation

**Reviewed at:** `2026-08-05T12:24:22.6505747+07:00` (`Asia/Vientiane`)

**Review triggers:** any candidate commit/tree or PR-head change; any grant,
identity, revocation, receipt, branch-protection, evidence, GOV, integration, or
activation contract change; any proposed effectiveness or merge disposition

## 1. Review identity and independence

| Field | Value |
|---|---|
| Reviewer lane | Independent `SEC` advisory review |
| Reviewer | OpenAI Codex |
| Model | `gpt-5.6-sol` |
| Session/task | `/root/adr_skill_sec` |
| Coordinator | `/root` |
| Record branch | `codex/agents-amd-003-sec-record-001` |
| Record base | `origin/main` at `8be8c9953716c06cadfc6a581fe248e819747380` |
| Candidate producer branch | `codex/agents-integration-delegation-001` |
| PR | `#141`, OPEN and MERGEABLE when observed; base `main`; exact head as bound below |

The reviewer did not author the candidate. Candidate commands and probes were
run in a separate detached clean worktree. This record branch was cut from the
exact base above. Its declared write set is this reviewer-authored record and
the two required manifest updates only. No candidate or producer evidence was
edited or transcribed.

## 2. Exact binding and scope

| Binding | Exact value |
|---|---|
| Candidate commit | `c0f7fc5b27f2bbd2d63b2c1d8e94ff28979d4eb2` |
| Candidate tree | `b4f54f9d90737b8a94ed00b0405656155e5ed238` |
| Candidate parent | `5ae52df05471b53d3e11e115769b313b214c27c1` |
| PR base commit | `8be8c9953716c06cadfc6a581fe248e819747380` |
| PR URL | `https://github.com/bstBizEra/SecB/pull/141` |
| Candidate delta | `AGENTS.md` only; two commits |

This verdict is void for a shared prefix, descendant, amended or rebased
candidate, changed PR head, or changed target base. The review covers the
prospective authority semantics of `SECB-AGENTS-AMD-003`; it does not certify an
integration-principal runtime because this candidate supplies no such runtime.

## 3. Assets, actors and trust boundaries

### Protected assets and impacts

- protected `main` history and exact reviewed candidate bytes;
- operator/GOV authority, independent review records and evidence acceptance;
- integration and activation separation;
- authority-grant authenticity, freshness, revocation and non-replay;
- audit-receipt integrity and attribution; and
- production-status truth.

Compromise can permit unauthorized remote mutation, integrate unreviewed bytes,
collapse maker/checker duties, conceal replay, or create a false production
claim.

### Threat actors and entry points

- a compromised or impersonated integration principal;
- a producer attempting self-review or self-integration;
- a holder replaying or transferring a captured grant;
- a malicious or compromised grant/receipt store;
- a concurrent writer moving the target branch between check and mutation; and
- a bootstrap actor attempting to use the amendment before it is effective.

Trust boundaries are: human operator to grant service; workload identity to
integration role; grant service to policy decision; PR/review evidence to
integration; local verifier to remote branch protection; integration mutation
to receipt ledger; and integration to separately authorized activation.

## 4. Traceability and security verification matrix

| Requirement / abuse case | Direct candidate control | First-hand result | Status |
|---|---|---|---|
| Prospective-only bootstrap | status requires independent review and human merge under rules effective before AMD-003; explicit no self-effectiveness | Circular bootstrap and retroactive use are textually denied | `PASS` |
| Server-derived workload identity | condition 1 maps principal identity to integration role | Identity source is required, but the grant itself does not name its recipient principal | `FAIL` |
| Grant forgery | condition 2 requires an “operator grant” | No issuer identity, signature, trust-root or authenticated grant-resolution requirement is stated; current authority primitive accepted a fabricated unsigned active grant | `FAIL` |
| Grant replay / transfer | grant is scoped, expiring and revocable | No nonce, one-shot consumption, idempotency or recipient binding is required; identical authorization replay returned `ALLOW` twice | `FAIL` |
| Candidate binding | grant names exact candidate commit; reviews bind commit and tree | Candidate binding is explicit | `PASS_WITH_DEPENDENCY` |
| Target freshness / race | pre-mutation freshness check and exact-head protection | Grant names a branch but not expected target commit/tree; no atomic expected-old compare-and-swap is required | `FAIL` |
| Producer self-approval | independent REV/QA/SEC records; producer cannot transcribe; principal cannot self-grant, accept evidence or waive findings | Explicit separation and self-approval denial present | `PASS` |
| GOV/evidence/integration/activation separation | condition 4 and separately authorized activation | Records/actions are explicitly non-transitive | `PASS` |
| Receipt attribution | receipt includes actor, grant, repo, action, refs, candidate, result and time | Required fields exist, but integrity, uniqueness, durability, idempotency and grant-consumption linkage are absent | `FAIL` |
| Revocation | grant is revocable and freshness is checked | No authoritative revocation source, check-at-use proof, failure code or receipt binding is defined | `FAIL` |
| Unknown state | condition 5 says unknown or changed state fails closed | Explicit policy statement present; enforcement is not implemented by this candidate | `PASS_WITH_DEPENDENCY` |

## 5. First-hand evidence and adversarial results

Environment: Node `v24.12.0`; Python `3.13.12`; Git
`2.53.0.windows.1`; GitHub CLI `2.96.0`.

Representative commands:

```powershell
git show -s --format='commit=%H%ntree=%T%nparents=%P%nsubject=%s' c0f7fc5b27f2bbd2d63b2c1d8e94ff28979d4eb2
gh pr view 141 --json number,url,state,headRefName,headRefOid,baseRefName,baseRefOid,title,mergeable,isDraft
git diff --name-status 8be8c9953716c06cadfc6a581fe248e819747380 c0f7fc5b27f2bbd2d63b2c1d8e94ff28979d4eb2
python .agents/scripts/validate_pack.py
node tools/validate-foundation.mjs
node --test tests/authority-engine.test.mjs
npm ci
npm test
git diff --check 8be8c9953716c06cadfc6a581fe248e819747380 c0f7fc5b27f2bbd2d63b2c1d8e94ff28979d4eb2
```

Fresh observations:

1. Exact candidate commit/tree/parent and live PR head/base matched §2. Candidate
   and review worktrees were clean before probes.
2. An in-memory `AuthorityEngine` probe supplied a fabricated unsigned `ACTIVE`
   grant whose `decisionId` merely claimed operator provenance. Authorization
   returned `{ allowed: true }`. Repeating the identical request returned
   `{ allowed: true }` again. This existing primitive does not authenticate the
   issuer or consume the grant.
3. The same primitive correctly denied a wrong actor. Its focused suite passed
   `15/15`, including expired/revoked grant denial, producer self-review denial,
   evidence-producer self-acceptance denial and conflicting-role denial.
4. The fabricated grant had no issuer signature, recipient-principal binding,
   repository, candidate commit/tree, target branch, expected target commit,
   nonce, consumption ID or receipt-integrity reference, yet the current
   primitive accepted it for its existing transition vocabulary. This does not
   prove an integration path is wired; it proves the current primitive cannot
   safely serve as that path without additional controls.
5. Repository search found the AMD-003 terms only in `AGENTS.md`; no dedicated
   integration-principal verifier or receipt contract exists in `src`, `tools`,
   `tests` or `contracts` at this candidate.
6. Skill-pack validation passed: 22 skills / 163 files. Foundation validation
   passed: 913/913. Candidate `git diff --check` passed.
7. After `npm ci` installed six packages, the full suite reported 1,346 tests:
   1,342 pass, 1 fail, 3 skipped. The failure is an inherited byte-identity
   guard in `skill-revocation-ledger.test.mjs`: candidate and exact base both
   carry `src/control/sod-rules.mjs` blob
   `314f6da194ed3eb5342eb224f2084fb7fe631359`, while the test pins old ref
   `0aa13f8` blob `4ffbc2019aae88178ecf0e5e6d2aa6b1e4aa9530`.
   AMD-003 changes only `AGENTS.md`; this is not candidate-caused, but the suite
   is not fully green and this record does not waive it.

## 6. Finding register

| ID | Severity / confidence | Finding | Required disposition / owner |
|---|---|---|---|
| `SEC-AMD003-F1` | HIGH / high | The grant contract is bearer-like: condition 2 omits recipient-principal identity and authenticated issuer/signature/trust binding. A fabricated unsigned active grant is accepted by the current authority primitive. | Candidate owner must require a canonical signed grant envelope, trusted issuer, exact recipient workload identity and fail-closed verification at use. SEC re-review required. |
| `SEC-AMD003-F2` | HIGH / high | Replay and race controls are incomplete. No nonce/single-use consumption/idempotency is required; the grant omits expected target SHA; “immediately before” checking is subject to TOCTOU; ancestry alone permits unreviewed concurrent target content. | Bind grant to expected old target commit/tree and mutation type; use atomic compare-and-swap/server-side exact-head enforcement; consume or idempotently terminalize the grant. SEC re-review required. |
| `SEC-AMD003-F3` | MEDIUM / high | Receipt fields do not establish integrity. No receipt ID, content hash/signature, append-only destination, idempotency key, grant-consumption result, revocation snapshot or integrity verification is required. | Define a canonical immutable receipt contract and independent verification path before effectiveness. |
| `SEC-AMD003-F4` | MEDIUM / high | Revocation/freshness is required in prose but no authoritative source, check-at-use evidence, verifier-unavailable denial or recovery behavior is named. | Bind grant resolution to an authoritative revocation service and record its version/result/time in the mutation receipt; deny when unavailable or ambiguous. |
| `SEC-AMD003-F5` | LOW / high | The full suite has one inherited stale byte-identity guard failure on the exact base and candidate. | Test owner should rebind or deliberately retire the stale guard through its governed process; no waiver is issued here. |

No Critical finding was identified. F1 and F2 are activation/effectiveness
blockers because they permit authority forgery, transfer, replay or mutation
against a target state not named by the grant.

## 7. Control architecture required for re-review

The minimum safe chain is:

```text
attested workload identity
  -> signed operator grant resolved from trusted authority service
  -> exact recipient + repository + action + candidate commit/tree
  -> exact expected target ref/commit/tree + validity + nonce/consumption rule
  -> exact independent REV/QA/SEC record verification
  -> separate evidence acceptance and GOV disposition checks
  -> atomic server-side protected-ref mutation
  -> post-mutation ref/tree verification
  -> signed/hash-bound append-only receipt with terminal grant disposition
  -> separately authorized activation, if any
```

Every unavailable, stale, moved, revoked, mismatched, replayed, ambiguous or
unverifiable input must produce a durable denial and no remote mutation.

## 8. Residual-risk candidates and limitations

- Workload identity, grant service, remote branch-protection configuration and
  receipt ledger are not implemented by this candidate, so their real
  operational behavior was not testable.
- GitHub branch-protection state was not treated as authority; PR mergeability
  is a live provider observation only.
- Producer commits are unsigned (`GPG=N`). This is provenance context, not the
  basis of F1; the required protection is a signed, trusted authority grant at
  use.
- No residual risk is accepted by this record. Human GOV/operator retains that
  decision after corrective controls and independent re-review.

## 9. SEC verdict and required next role

**`SEC_HOLD` — exact-bound technical authority verdict.**

The candidate has sound bootstrap, separation and self-approval language, but
it is not security-conformant for effectiveness while F1 and F2 remain. The
candidate owner should revise AMD-003 with the grant-recipient/authenticity,
anti-replay/consumption, expected-target atomicity and receipt-integrity
requirements above. A fresh independent SEC review must bind the revised exact
commit/tree. GOV/operator then decides disposition; this reviewer does not.

## 10. Explicit authority boundary

This record does not merge PR `#141`, accept evidence or residual risk, approve
AMD-003, make it effective, grant integration authority, move a remote ref,
promote or publish anything, authorize release/deployment, or activate any
runtime. `SEC_HOLD` is an advisory technical finding, not a governance decision.

```yaml
self_certification:
  artifact_id: SECB-AGENTS-AMD-003-SEC-REVIEW-001
  reviewer_role: SEC
  reviewer_identity: openai-codex
  model: gpt-5.6-sol
  session_task: /root/adr_skill_sec
  independent_of_candidate_producer: true
  candidate_commit: c0f7fc5b27f2bbd2d63b2c1d8e94ff28979d4eb2
  candidate_tree: b4f54f9d90737b8a94ed00b0405656155e5ed238
  verdict: SEC_HOLD
  merge_authority: false
  evidence_acceptance_authority: false
  governance_authority: false
  integration_authority: false
  activation_authority: false
  ready_for_candidate_rework: true
```
