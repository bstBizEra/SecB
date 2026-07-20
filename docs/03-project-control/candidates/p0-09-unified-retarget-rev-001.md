# Independent Review: P0-09 Authority Hardening Retarget onto Unified Base (REV-001)

- review_id: P0-09-UNIFIED-REV-001
- status: CANDIDATE (advisory review; operator ratification still required)
- reviewer: claude-immune-rev-p009-unified-01 (BST-SA immune agent, independent identity)
- producer_reviewed: Codex lane (commit `92df0e2` "[P0-09-UNIFIED] Retarget authority hardening onto unified base")
- review_target: branch `codex/p0/p0-09-unified-base-handoff-001` @ `92df0e2`
- unified_base (main): `49d1e0c` (Merge PR#5 reconcile-integration)
- rework lineage compared: `codex/p0/p0-09-rework-013` @ `99b350a` (tip of the rework-010..013 lineage; base `6b47cf1`)
- review_branch: `claude/rev/p0-09-unified-retarget` (created FROM `codex/p0/p0-09-unified-base-handoff-001`)
- governance: AGENTS.md + SECB-AGENTS-AMD-002 (non-main branch, no push, no merge)
- date: 2026-07-20

All findings were reproduced first-hand in an isolated worktree; no producer
measurement (commit-message claim or self-verify block) was taken on trust.
`node_modules` was installed with `npm ci` in the worktree before test runs.

## Scope of change (measured, `git diff --name-status 49d1e0c..92df0e2`)

8 files, all Modified, 0 added, 0 deleted (+667/-124):
`src/control/state-machine.mjs`, `src/services/work-package-service.mjs`, and 6
test files (`conformance-stubs`, `context-federation`, `handoff-r2-receipt`,
`handoff-service`, `state-machine`, `work-package-service`). No `docs/**`
(AMD-002 untouched), no `tools/validate-foundation.mjs`, no `src/gateway/**`, no
reconciled service files. Nothing unrelated smuggled in; nothing main-side
deleted.

## Findings table

| # | Check | Method | Result | Severity |
| --- | --- | --- | --- | --- |
| 1 | Port fidelity — 4 hardening themes present | Content diff `99b350a:src/... 92df0e2:src/...`; verbatim grep of the out-of-range guard | All four themes present in the unified target: (010) version/supersession/evidence provenance binding — `authorityScopeVersion`, `#authorizeVersionScope`, `DENY_AUTHORITY_VERSION_UNBOUND/MISMATCH`, `DENY_SUPERSEDED_VERSION`, `everAuthorized`/`effectiveAuthority`, `recordedAtState` evidence model; (011) one authoritative decision time — single `#captureDecisionTime()` + `#engineDecisionTime` passed to the engine via try/finally; (012) poisoned-clock containment — `#captureDecisionTime` try/catch → `DENY_AUTHORITY_TIME`; (013) out-of-range rejection — the `copiedDate` finite-range guard (commit `99b350a`, lines 195-199) is present byte-identical. | PASS |
| 2 | Superset property (no main-side hardening lost) | Diff of state-machine.mjs base vs rework-013 vs target | The unified target is a strict superset: it keeps the **main-side** TransitionEngine hardening the rework-013 lineage never had (TE-H1 strict scalar/closed-envelope validation, TE-H2 server-derived timestamp + claim excluded from replay fingerprint, TE-H3 edge-legality-before-authority, canonical-fingerprint module) AND the unified base's `legacyObligations`, `projectResolver` (V-002 project-scope binding), `OBLIGATION_ATTACH_STAGES` stage lock, and `RESERVED_ID_DELIMITERS` ('@' + '|'), while layering the P0-09 authority fields (`authorityScopeVersion`, `authorityDecisionTime`) on top. Only +6 lines were needed in state-machine.mjs (allowedRequestKeys + pass-through + `authority?.code ?? "DENY_AUTHORITY"`). | PASS |
| 3 | No deny-code / assertion regression (SoD/authority) | Set-diff of `DENY_*` inventory base vs target; scan of removed `-` deny/assert/throw lines | 0 deny codes in base are missing from target. Target adds 8 (`DENY_AUTHORITY_INEFFECTIVE`, `_SOURCE`, `_TIME`, `_VERSION_MISMATCH`, `_VERSION_UNBOUND`, `DENY_EVIDENCE_ROLE_MISMATCH`, `DENY_GOVERNING_VERSION_INEFFECTIVE`, `DENY_SUPERSEDED_VERSION`). `DENY_SOD` preserved. The 3 removed source lines are all strengthenings/inert: `throw ..."DENY_AUTHORITY"` → `authority?.code ?? "DENY_AUTHORITY"` (propagates the specific code, strictly stronger), and the `#assertObligationsSatisfied(record, envelope)` → `(record)` call-site/signature drop (the rewritten body derives everything from `record`; adversarial d-satisfaction confirms enforcement held). | PASS |
| 4 | No deletions / no unrelated files | `git diff --diff-filter=D`; name-only filter for amd-002/validator/gateway/reconcile | 0 deletions. 0 AMD-002/validator/gateway/reconcile files touched. | PASS |
| 5 | Peripheral test edits are adaptive, not weakening | Read diffs of context-federation, handoff-r2-receipt, handoff-service tests | Edits only add the now-required `workPackageVersion` to grant fixtures and wire `authoritySource: () => grantSet` into harness construction. No assertion removed; these are the minimal fixture adaptations the version-binding + explicit-authority-source hardening requires. | PASS |
| 6 | Suites green with expected delta | `node tools/validate-foundation.mjs`; `node --test tests/*.test.mjs` on `49d1e0c` and `92df0e2` | Foundation validator exit **0**. Base `49d1e0c`: **293 / 288 pass / 0 fail / 5 skip**, exit 0. Target `92df0e2`: **310 / 305 pass / 0 fail / 5 skip**, exit 0. Delta **+17 tests / +17 pass / 0 fail / +0 skip**. | PASS |

## Adversarial temporal-integrity outcomes

Reproduced via standalone harness scripts driving the real
`WorkPackageContractService` (createWorkPackage / submitTransition /
resolveEffective) with injected clocks and grant fixtures.

| Attack | Injection | Outcome |
| --- | --- | --- |
| (a) two different decision times in one path | clock returning a new (incrementing) `Date` on every call; counted invocations per transition | **REJECTED.** `submitTransition` invokes `now()` exactly **1×** and reuses the single captured `serverNow` for the engine (`#engineDecisionTime`), the authority validity-window check, and the ledger timestamp. Divergent-time injection is structurally impossible. |
| (b) poisoned clock | `now()` throwing; `new Date(NaN)`; a non-Date (`1234567890`); an absurd `new Date(8.7e15)` (beyond max valid Date) | **All four DENIED** with `DENY_AUTHORITY_TIME` raised as `WorkPackageServiceError` (fail-closed). No raw exception leaked; no record was created. |
| (c) out-of-range decision times | skew clock before authorizing: before `validFrom` (2026-06-01); after grant `validUntil` (2027-02-01); after contract `valid_until` but inside grant window (2026-09-01); far-future year 9999 | before validFrom → `DENY_AUTHORITY`; after grant validUntil → `DENY_EXPIRED`; after contract expiry → `DENY_EXPIRED`; year 9999 → `DENY_EXPIRED`. All out-of-range times rejected. (Control: an in-window, in-contract time is correctly accepted — not a finding.) |
| (d) provenance-binding bypass | (d1) authorize v2 using a v1-bound GOV grant (`authorityScopeVersion=2` vs `workPackageVersion=1`); (d2) transition lower v1 after v2 has governed; (d3) revoke the binding grant then `resolveEffective`; (d4) satisfy a `review-report` obligation with evidence recorded at the wrong stage; typed `review:report` attached at SELF_VERIFIED | (d1) `DENY_AUTHORITY_VERSION_MISMATCH`; (d2) `DENY_SUPERSEDED_VERSION`; (d3) effective flips `YES → DENY_AUTHORITY_INEFFECTIVE` after live revocation (no stale authorization); (d4) misplaced evidence did **not** satisfy the obligation at GOV_DECISION → `DENY_EVIDENCE_ROLE_MISMATCH`; typed prefix stage-locked at attach → `DENY_OBLIGATION_STAGE`. All bypass attempts fail closed. |

### Observation (informational, not a defect)

Under the default `legacyObligations: "allow"` mode, an **unprefixed** obligation
string (e.g. `"review-report"`, no `:` prefix) is treated as type `any` and may be
*attached* at any stage — so attaching `review-report` evidence while entering
SELF_VERIFIED is accepted at attach time. This is documented deprecation-grace
behavior, and it is inert for authority: `#assertObligationsSatisfied` derives the
required stage from the obligation name (`startsWith("review") → REVIEW`), so such
misplaced evidence cannot satisfy the obligation at GOV_DECISION
(`DENY_EVIDENCE_ROLE_MISMATCH`, confirmed in (d4)). Operators wanting attach-time
strictness can construct the service with `legacyObligations: "deny"` and typed
prefixes. No change required for merge.

## Verdict

**APPROVE_FOR_OPERATOR_MERGE**

The retarget is a faithful, loss-free superset port. All four rework-010..013
hardening themes (version/supersession/evidence provenance binding, one
authoritative decision time, poisoned-clock containment, out-of-range rejection)
arrived intact — the out-of-range guard verbatim — while every main-side behavior
(TransitionEngine TE-H1/H2/H3 hardening, V-002 project-scope binding, obligation
stage lock, reserved-delimiter guard, AMD-002 docs, validator, gateway, reconciled
services) is preserved with zero deletions and zero deny-code regressions (target
adds 8 codes, drops none; `DENY_SOD` intact). The foundation validator exits 0 and
the full suite is green at 310/305/0/5 (+17 vs base). Every adversarial
temporal-integrity and provenance-binding attack failed closed.

Authority boundary preserved: this is an advisory review only. Operator
ratification and the operator-controlled merge to `main` remain required and were
not performed. No push, no merge, no configuration change was made by this
reviewer.

## Advisory status fields

```yaml
truth_status: verified_true
authority_status: advisory_only
implementation_status: candidate
risk_class: medium
```

```yaml
self_certification:
  agent_id: claude-immune-rev-p009-unified-01
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
