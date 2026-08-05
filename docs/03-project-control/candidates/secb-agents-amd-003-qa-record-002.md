# SECB-AGENTS-AMD-003 — Independent QA Record 002

**Artifact ID:** `SECB-AGENTS-AMD-003-QA-002`

**Status:** `DRAFT / NOT EFFECTIVE`

**Truth status:** `VERIFIED_TRUE` for the exact objects and observations listed below

**Authority status:** `ADVISORY_ONLY`

**Verdict:** `QA_PASS_WITH_NOTES_CANDIDATE_ONLY`

**Authored:** 2026-08-05T12:47:40+07:00 / 2026-08-05T05:47:40Z

**Next responsible roles:** fresh independent REV and SEC, then human GOV/operator disposition

> This verdict binds only commit
> `d57fdd6cc9e4f76a6d49f4d1c91390c073dae148`, tree
> `fcd5c4cdae54e14a9e5c88c4c674e6467a54da64`, parent
> `dce3b8d658b1572c63e90a37d9af4686a06d2c55`, and base
> `origin/main` at `8be8c9953716c06cadfc6a581fe248e819747380`.
> Prior QA records and verdicts bind earlier candidates and do not transfer to
> this successor. Any changed commit, tree, base, PR head, contract or governing
> surface voids this verdict.

## 1. Review identity and independence

| Field | Value |
|---|---|
| Reviewer role | Independent QA / assurance reviewer |
| Reviewer agent | OpenAI Codex collaboration agent `/root/adr_skill_qa` |
| Session identity | Collaboration task path `/root/adr_skill_qa`; provider session UUID not exposed |
| Harness/model identity | OpenAI Codex, GPT-5 family; exact deployment identifier not exposed and therefore not asserted |
| Candidate producer | Git author/committer `BizEra <ounkhamvilay@gmail.com>`; distinct from this QA agent |
| Candidate checkout | Clean, locked, detached worktree `C:\laragon\www\SecB-worktrees\qa-agents-amd003-d57fdd6` |
| Record checkout | Branch `codex/agents-amd-003-qa-record-002`, cut from the exact base in a separate worktree |
| Independence claim | I2-style distinct agent/context with first-hand Git, provider, document and test access; no I3/I4 or acceptance-authority claim |

The reviewer did not produce or edit the candidate. The candidate checkout
remained detached and clean. This reviewer-authored write set is limited to:

- `docs/03-project-control/candidates/secb-agents-amd-003-qa-record-002.md`
- `MANIFEST.json`
- `docs/MANIFEST.json`

No candidate, source, contract, test, tool, effective record, remote, PR,
protected ref, deployment, release or runtime was mutated by this QA lane.

## 2. Exact candidate and live PR binding

| Object/relation | Independently verified value |
|---|---|
| Base | `8be8c9953716c06cadfc6a581fe248e819747380` |
| Candidate | `d57fdd6cc9e4f76a6d49f4d1c91390c073dae148` |
| Candidate tree | `fcd5c4cdae54e14a9e5c88c4c674e6467a54da64` |
| Candidate parent | `dce3b8d658b1572c63e90a37d9af4686a06d2c55` |
| Merge base | `8be8c9953716c06cadfc6a581fe248e819747380` |
| Base-is-ancestor | `git merge-base --is-ancestor` exit 0 |
| Candidate commit signature | `%G? = N`; no Git signature asserted |

The full candidate changes eight paths relative to the exact base:

```text
M AGENTS.md
M MANIFEST.json
M docs/00-governance/decision-rights.md
A docs/00-governance/integration-principal-control-contract.md
A docs/03-project-control/candidates/secb-agents-amd-003-provenance-001.md
M docs/MANIFEST.json
M docs/README.md
A docs/adr/0009-scoped-integration-principal.md
```

At review time, `gh pr view 141 --json ...` reported PR #141 as `OPEN`, not
draft, `MERGEABLE`, `CLEAN`, base `main` at the exact base and head
`codex/agents-integration-delegation-001` at the exact candidate. This is a
time-bounded host observation, not merge or adoption authority.

## 3. Governing scope and bootstrap boundary

The candidate remains an authority-affecting documentation proposal. The root
amendment, control contract and ADR are all draft/not effective; they exclude
production/environment activation from this integration contract and retain a
human bootstrap merge under the prior rule.

The amendment explicitly and narrowly supersedes `No agent merges to main`
only after adoption, and only for `MERGE_EXACT_HEAD_TO_MAIN` through the adopted
external enforcement and receipt path. Every other actor, action and path keeps
the prior prohibition. A prompt, local credential, policy document or repository
write access is explicitly insufficient.

No integration-principal runtime, external PDP, trusted key/revocation provider,
action adapter, receipt ledger or activation record is implemented or activated
by this candidate.

## 4. Closure of prior QA findings

| Prior issue | Successor evidence | Disposition |
|---|---|---|
| Combined `OPEN_OR_UPDATE_PR` action | Replaced by separate `OPEN_PR` and `UPDATE_PR` actions | CLOSED |
| Pull-request target not grant-bindable | `OPEN_PR` binds a creation fingerprint and approved payload; `UPDATE_PR` binds immutable provider PR ID | CLOSED |
| No expected-old PR state/version | `UPDATE_PR` requires provider version/ETag, state, base, head and current payload digest | CLOSED |
| Generic Git-ref CAS applied to PR mutation | Four-row action table defines a distinct object, expected state, intended state and atomic fence per action | CLOSED |
| Cross-action field ambiguity | Fields belonging to another action are forbidden; candidate-ref, PR-object and protected-ref fences are explicitly distinct | CLOSED |
| A4/A5 activation ambiguity | A4 is restricted protected integration/non-production activation; production release/activation remains A5, and non-production activation uses a separate A4 path outside this contract | CLOSED |

## 5. Closed action set and action-specific testability

The normative contract contains exactly four action rows:

| Action | Exact object and expected-state proof | Negative/adversarial proof obligation | QA result |
|---|---|---|---|
| `PUSH_CANDIDATE_BRANCH` | Immutable repository plus unprotected candidate ref, expected-old ref SHA, exact candidate commit/tree, provider ref CAS | Reject protected, missing, moved or wrong ref; wrong candidate; force/delete/tag request | TESTABLE / PASS |
| `OPEN_PR` | Creation fingerprint over repository/base/head and approved title/body/metadata digest; live refs; idempotent create-if-absent | Reject existing open/closed fingerprint, payload drift, moved refs, duplicate creation and another action's fields | TESTABLE / PASS |
| `UPDATE_PR` | Immutable provider PR ID plus expected version/ETag, state, base, head and current payload digest; permitted-field enumeration | Reject wrong PR, version/state/ref/payload drift, non-enumerated field and unconditional update | TESTABLE / PASS |
| `MERGE_EXACT_HEAD_TO_MAIN` | Immutable PR ID/protected target, exact head commit/tree/base, expected-old target, protection/check digests and expected result tree | Reject moved head/base/target, changed checks/protection, wrong result tree, squash/rebase/direct push and lost ancestry | TESTABLE / PASS |

The grant additionally binds issuer/subject, A4 ceiling, effective Project
Contract, authorized Work Package, exactly one action, its exact object/state,
nonce, single-use/idempotency controls, composite evidence digest, immutable
REV/QA/SEC/evidence/GOV references and ledger destinations. Unknown or
cross-action fields fail closed.

## 6. Authority-class consistency

Direct comparison of the amendment, decision-rights document, contract and ADR
found a consistent boundary:

- A3 remains preparation-only and cannot perform protected merge.
- A4 covers the prospective restricted protected-integration executor and a
  separate restricted non-production activation path, each with per-operation
  human approval.
- This integration contract excludes all activation.
- Production release/activation, policy exceptions, changes to the authority
  basis and production-status declaration remain human A5 decisions.
- The executable risk registry retains pre-amendment wording; protected
  integration remains inactive until a separately reviewed aligned successor is
  effective.

## 7. Receipt terminality and recovery

The receipt contract contains the required actual provider response digest,
provider-observed object version, after ref/SHA/tree and ancestry result. The
only legal transitions are `PREPARED -> COMMITTED` and
`PREPARED -> ABORTED`; both terminal states are immutable.

- Verified failure/crash before provider mutation resolves the original receipt
  to `ABORTED`.
- Verified provider mutation resolves the original receipt to the same
  `COMMITTED` binding.
- Replay returns the terminal disposition without another grant consumption or
  mutation.
- Conflicting or indeterminate state fails closed for human recovery without
  guessing `COMMITTED` or retrying mutation.

This is safe and testable as a candidate contract. Operational implementation
must still define the initial durable denial record for a pre-`PREPARED`
validation failure and the escalation/runbook for a prolonged indeterminate
`PREPARED` receipt; these are recorded as QA-N1 and QA-N2.

## 8. Links, manifests and provenance

Independent results:

- 106 local Markdown links across changed documents resolved; zero failures.
- Root manifest: 528 paths, all unique and present.
- Docs manifest: declared 66, actual 66, all unique and present.
- Contract, ADR and provenance record occur exactly once in both manifests.
- `docs/source/om-v0.1/` has no candidate diff.
- The historical source-manifest Git blob has the same SHA-256 at base and
  candidate: `36d36623dbcc4bddf6d53173aad16cde4508e023a348b8b124b537483f5243cf`.
- All five current-surface SHA-256 values in
  `SECB-AGENTS-AMD-003-PROVENANCE-001` match the exact candidate Git blobs.
- The ADR's reported SEC source was checked directly: PR #145 was open at exact
  commit `8939fdd7597dec32295e78f9d4a1ca8fb8619d3e`, and its reviewer-authored
  record supports the summarized unsigned-grant, replay, target-CAS and receipt
  findings. That prior SEC record remains reported evidence pending its own
  acceptance.

## 9. Fresh validation evidence

All candidate checks were run in the clean detached exact-SHA checkout after
identity verification:

| Check | Fresh result |
|---|---|
| Independent action/authority/receipt structural probes | PASS for all four action rows, required bindings, closed fields, A4/A5 split and immutable terminality |
| `node --test tests/authority-engine.test.mjs tests/risk-registry.test.mjs tests/approval-binding.test.mjs tests/conformance-v020-governance.test.mjs` | 92 tests; 91 pass; 0 fail; 1 activation-gated skip; exit 0 |
| `node tools/validate-foundation.mjs` | PASS; 923/923 PASS; 0 non-PASS; exit 0 |
| `python .agents/scripts/validate_pack.py` | PASS; 22 skills; 163 files; exit 0 |
| `git diff --check <base> <candidate>` | PASS; no output; exit 0 |
| `npm ci` | Added 6 locked packages; exit 0 |
| `npm test` | 1346 tests; 1342 pass; 1 fail; 3 skipped; 0 cancelled/todo; exit 1 |
| Candidate checkout status | Clean detached `HEAD`; no tracked changes |

The sole full-suite failure is the inherited stale byte-identity pin in
`tests/skill-revocation-ledger.test.mjs`: it expects the older
`src/control/sod-rules.mjs` blob from `origin/main @ 0aa13f8`. The exact base
contains the later intentionally changed blob. Neither the governance candidate
nor this record changes either file. QA-N3 records the limitation; no waiver is
issued.

## 10. Findings and residual risks

| ID | Severity/confidence | Finding or residual risk | Required disposition |
|---|---|---|---|
| QA-N1 | Low / high | Preflight mismatch is required to emit a durable denial, while `PREPARED` is created after validation. The contract does not explicitly name whether such a denial begins directly as terminal `ABORTED` or uses a separate denial record type. | The runtime contract/schema must choose and test one canonical durable initialization without creating a retryable ambiguity. |
| QA-N2 | Low / high | An indeterminate partial fence safely forbids retry and guessing, but may leave `PREPARED` unresolved until human recovery. | The implementation/runbook must define alerting, evidence collection, custody and authorized terminal-resolution procedure without permitting a second mutation. |
| QA-N3 | Low, baseline-only / high | Full suite has one inherited stale skill-revocation blob-pin failure. | Correct or supersede the stale pin in a separate authorized slice before claiming the integration base suite is fully green. |
| QA-N4 | Informational / high | Candidate commit is unsigned (`%G? = N`). Current-surface hashes and Git object identity verify content but are not a trusted authority signature. | Preserve as provenance context; future grants must rely on the contract's trusted signed authority path, not producer commit signature or absence. |
| QA-R1 | Residual / high | The external PDP, provider action fences, receipt ledger and recovery behavior are unimplemented. | Require fresh implementation-specific positive, negative, adversarial, race, replay, crash and recovery verification plus independent SEC/REV/QA before operational activation. |

No blocker, high or medium defect was found in the exact documentation
candidate. No residual risk is accepted by this QA record.

## 11. Verdict and limitations

**Verdict: `QA_PASS_WITH_NOTES_CANDIDATE_ONLY`.** The exact successor closes
the prior action-binding and authority-taxonomy findings and is sufficiently
bounded, internally consistent, testable and fail-closed as a draft governance
candidate.

This verdict is not evidence acceptance, GOV adoption, human bootstrap merge,
policy effectiveness, runtime conformance, remote-mutation authority, release,
deployment, production status or activation. Passing documentation/foundation
checks cannot make an integration principal operational.

## 12. Review triggers and next-role checklist

Fresh review is required for any candidate/tree/base/PR-head change; action,
grant, authority, receipt, recovery, provenance or manifest change; aligned
risk-registry successor; runtime implementation; or proposed adoption,
integration or activation.

Before disposition, the next roles must:

- re-resolve the exact candidate and live PR #141 state;
- verify this record's commit and declared three-file write set;
- inspect the candidate and provenance objects directly rather than trusting
  this narrative;
- obtain fresh exact-SHA REV and SEC dispositions for this successor;
- disposition QA-N1 through QA-N4 without treating them as waived;
- keep the human bootstrap merge and every A5 gate intact; and
- require independent runtime assurance before any external enforcement path is
  activated.

## 13. Record-authoring branch validation

Checks after the completed record and both manifest edits produced:

| Check | Final result |
|---|---|
| Root `MANIFEST.json` | 526 entries; 526 unique; none missing; record exactly once |
| `docs/MANIFEST.json` | Declared/actual 64; 64 unique; none missing; record exactly once |
| `node tools/validate-foundation.mjs` | PASS; 915/915 PASS; 0 non-PASS; exit 0 |
| `git diff --check` | PASS; no output; exit 0 |
| `npm ci` | Added 6 locked packages; exit 0 |
| `npm test` | 1346 tests; 1342 pass; 1 QA-N3 baseline failure; 3 skipped; 0 cancelled/todo; exit 1 |

The record branch reproduces the same single base failure and introduces no new
failure. Its tracked write set remains this record plus the two manifests.

## 14. Authority boundary and self-attestation

This reviewer record is advisory evidence only. It does not accept evidence,
approve/adopt AMD-003 or ADR-0009, make policy effective, configure or mutate a
remote, push, create/update a PR, merge, publish, deploy, release, activate or
declare production status.

```yaml
self_attestation:
  artifact_id: SECB-AGENTS-AMD-003-QA-002
  reviewer_agent: /root/adr_skill_qa
  reviewer_role: QA
  producer_role: distinct
  exact_candidate: d57fdd6cc9e4f76a6d49f4d1c91390c073dae148
  exact_tree: fcd5c4cdae54e14a9e5c88c4c674e6467a54da64
  exact_parent: dce3b8d658b1572c63e90a37d9af4686a06d2c55
  exact_base: 8be8c9953716c06cadfc6a581fe248e819747380
  verdict: QA_PASS_WITH_NOTES_CANDIDATE_ONLY
  evidence_acceptance_authority: false
  governance_authority: false
  remote_mutation_authority: false
  merge_authority: false
  activation_authority: false
```
