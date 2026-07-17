# Codex and Claude Git Worktree Build Plan

**Document ID:** SECB-PLAN-WORKTREE-001
**Version:** 1.0.0-draft
**Status:** DRAFT / NOT AUTHORIZED
**Prepared:** 2026-07-17
**Baseline:** `2c2c24ce98482fbf6068d2e34655658440a2de56`

## 1. Objective

Plan one local, parallel, R2 implementation wave in which Codex and Claude Code produce independent SecB components in isolated Git worktrees with disjoint write sets. The plan preserves server-derived identity, bounded authority, separation of duties, evidence capture, frozen review, controlled integration, and human governance.

This plan does not create a worktree, authorize either runtime, approve a model, activate a Project Contract, or permit integration into `main`.

## 2. Observed Baseline

At planning time:

- primary repository: `C:/laragon/www/SecB`;
- current branch: `main`;
- baseline commit: `2c2c24ce98482fbf6068d2e34655658440a2de56`;
- primary working tree: clean;
- Git remotes: none;
- Claude Code CLI observed: `2.1.139` at `C:/Users/ounkh/.local/bin/claude.exe`;
- active Claude desktop/agent processes exist and include broad plugin/MCP surfaces; they are not approved SecB runtime deployments.

Observed worktrees:

| Path | Git state | Planned disposition |
|---|---|---|
| `C:/laragon/www/SecB` | `main` at baseline | Freeze as coordination/source baseline; no parallel feature mutation |
| `C:/laragon/www/SecB/.claude/worktrees/worktree-setup-revision-2d5b0a` | branch `bst/worktree-setup-revision-2d5b0a`, clean | `HOLD / DO_NOT_USE_FOR_GOVERNED_BUILD`; it is nested under the primary repository and was not created by this plan |
| `C:/laragon/www/SecB-worktrees/claude-rev-p0-19` | detached at baseline, clean | Retain as read-only review candidate; never repurpose as a mutation worktree |

The observed worktrees must not be deleted, repurposed, or modified until their owner and lifecycle state are resolved. Presence of a worktree is not authority to use it.

## 3. Planning Decisions

1. Each mutation-capable Agent Instance receives one dedicated sibling worktree outside the primary repository.
2. Codex and Claude are Runtime Products. Authority derives only from effective Project Contract, Work Package, role assignment, session, Context Receipt, and policy decision.
3. The first parallel wave contains two implementation slices with no shared mutable paths or ordering dependency.
4. Producers must not edit shared integration surfaces. A separately authorized integration session owns those files after both producer branches freeze.
5. Producer verification, REV, QA, evidence acceptance, integration execution, and human governance remain separate transitions.
6. No producer worktree is based on or nested inside another worktree.

## 4. Worktree and Branch Topology

| Purpose | Runtime role | Worktree | Branch | Risk |
|---|---|---|---|---|
| Coordination baseline | SARCHI/ARCHI candidate | `C:/laragon/www/SecB` | `main` | Read-only during wave |
| Project Contract service | Codex ENGIN candidate | `C:/laragon/www/SecB-worktrees/codex-p0-08-project-contract` | `codex/p0/project-contract-service` | R2 |
| Runtime Registry core | Claude ENGIN candidate | `C:/laragon/www/SecB-worktrees/claude-p0-15-runtime-registry` | `claude/p0/runtime-registry-core` | R2 |
| Wave integration | Separate INTEGRATOR candidate | `C:/laragon/www/SecB-worktrees/integration-p0-wave-1` | `integration/p0/wave-1` | R2 |

All branches start from the exact authorized baseline. Branches do not grant authority and must not be pushed because no remote publication is authorized.

## 5. Work Package A — Codex / P0-08

**Candidate ID:** `wp_secb_p0_08_project_contract_service_001`

### Objective

Implement an in-process Project Contract service that validates candidate contracts and enforces explicit approval, effectiveness, expiry, suspension, and revocation boundaries without granting activation by construction.

### Declared write set

- `src/project/**`
- `tests/project-contract-service.test.mjs`

### Prohibited write set

- `src/index.mjs`
- `package.json` and `package-lock.json`
- `MANIFEST.json`
- `contracts/**`
- `docs/**`
- existing files under `src/control/**`, `src/contracts/**`, and `src/ledger/**`
- every Claude-owned path

### Acceptance criteria

- Unknown, malformed, expired, suspended, revoked, wrong-version, and wrong-project contracts fail closed.
- `APPROVED_NOT_EFFECTIVE` remains distinct from `ACTIVE`.
- Approval and effectiveness require distinct, server-derived decisions.
- Duplicate identity and conflicting idempotent replay are denied.
- No caller-declared role, runtime product name, or approval array creates authority.
- Positive, negative, and adversarial tests pass against the final branch state.
- Direct imports are used in producer tests; shared exports remain integration-owned.

## 6. Work Package B — Claude / P0-15A

**Candidate ID:** `wp_secb_p0_15a_runtime_registry_core_001`

### Objective

Implement the Runtime Registry core for Provider, Runtime Product, Runtime Deployment, Agent Profile, and Agent Instance identities without treating a provider, model, product, or process name as authority.

### Declared write set

- `src/runtime/**`
- `tests/runtime-registry.test.mjs`

### Prohibited write set

- `src/index.mjs`
- `package.json` and `package-lock.json`
- `MANIFEST.json`
- `contracts/**`
- `docs/**`
- existing files under `src/control/**`, `src/contracts/**`, and `src/ledger/**`
- every Codex-owned path

### Acceptance criteria

- Runtime Product, Deployment, Agent Profile, and Agent Instance identities remain distinct.
- Registration rejects missing identity, duplicate identity, invalid version, invalid parent reference, and unknown fields.
- Disabled, quarantined, expired, or unapproved deployments and instances cannot resolve as eligible.
- Registry eligibility is an observation/input to policy and never an authority decision.
- Model, tool, network, credential, evaluation, and lifecycle metadata are explicit and closed.
- Positive, negative, and adversarial tests pass against the final branch state.
- Direct imports are used in producer tests; shared exports remain integration-owned.

## 7. Shared Integration Surfaces

The following paths are frozen in producer worktrees and reserved for the integration Work Package:

- `src/index.mjs`;
- `package.json` and `package-lock.json`;
- `MANIFEST.json` and `docs/MANIFEST.json`;
- `VERSION` and release notes;
- `contracts/**`;
- architecture, ADR, roadmap, backlog, and status documentation;
- cross-component tests and fixtures.

If either producer discovers that a shared file must change, it records an integration request in its Handoff Envelope. It must not edit the shared file.

## 8. Preconditions Before Worktree Creation

Each producer requires:

- an effective successor Project Contract permitting R2 local mutation;
- an authorized, unexpired Work Package bound to the baseline and exact write set;
- a server-derived Agent Instance, Session ID, role assignment, and runtime namespace;
- a versioned Context Receipt;
- a clean, matching worktree lease;
- exact model, tools, commands, network, credential, cost, and evidence policies;
- a governed evidence destination and retention decision; and
- rollback/recovery plus worktree cleanup authority.

Claude requires a dedicated constrained CLI session. The currently active Claude desktop/agent session—with broad plugins and MCP tools—must not be reused as the governed ENGIN session.

## 9. Planned Worktree Commands

These commands are examples for the authorized integration operator. They must not run before the preconditions above are effective.

```powershell
git worktree add `
  -b codex/p0/project-contract-service `
  C:\laragon\www\SecB-worktrees\codex-p0-08-project-contract `
  2c2c24ce98482fbf6068d2e34655658440a2de56

git worktree add `
  -b claude/p0/runtime-registry-core `
  C:\laragon\www\SecB-worktrees\claude-p0-15-runtime-registry `
  2c2c24ce98482fbf6068d2e34655658440a2de56
```

Before either runtime starts, the operator must record `git status --short --branch`, `git rev-parse HEAD`, `git rev-parse --show-toplevel`, branch identity, worktree list, directory identity, and policy/receipt hashes.

## 10. Parallel Execution Protocol

1. Issue separate Context Receipts and evidence destinations.
2. Start Codex and Claude only inside their assigned worktrees.
3. Enforce path-level write policy and deny unlisted commands, networks, tools, MCP methods, and skills.
4. Each producer uses TDD or an equivalent executable specification and commits only its declared write set.
5. Every producer checkpoint records branch, commit, status, observed diff, test command, exit code, limitations, and evidence references.
6. Producers communicate only through structured, coordinator-mediated messages; they do not edit each other's worktrees.
7. If a dependency or shared-path need appears, pause the affected Work Package and request re-planning. Do not silently widen scope.
8. Freeze each worktree after producer verification. Any post-freeze change invalidates prior review evidence.

## 11. Review and QA Topology

For each frozen producer branch:

- a fresh Agent Instance and session performs REV from a detached review worktree;
- a different fresh Agent Instance and session performs QA with fresh deterministic checks;
- reviewers inspect the branch, baseline, diff, source, and test evidence directly;
- the producer does not accept its own evidence;
- reciprocal producer review is not sufficient by itself;
- blocking findings return the Work Package to `REWORK` and invalidate downstream evidence.

Suggested cross-runtime arrangement:

| Producer branch | REV candidate | QA candidate |
|---|---|---|
| Codex P0-08 | fresh Claude REV instance | fresh non-producer Codex QA instance |
| Claude P0-15A | fresh Codex REV instance | fresh non-producer Claude QA instance |

The runtime product may repeat, but Agent Instance, session, Context Receipt, role, and evidence examination must be distinct. Human GOV remains the acceptance authority.

## 12. Controlled Integration

After both branches have accepted REV and QA evidence:

1. Human GOV authorizes an integration Work Package and exact accepted commits.
2. Create `integration/p0/wave-1` from the sealed baseline in its own worktree.
3. Integrate accepted producer commits one at a time without rewriting them.
4. Resolve only integration-owned files: exports, manifests, versioning, shared docs, and cross-component tests.
5. Run targeted tests after each integration, then the full repository validation and test suite after the final change.
6. Reconcile the observed write set against the authorized integration write set.
7. Freeze the integration worktree and perform fresh integration REV and QA.
8. Human integration authority decides whether the candidate may advance. No direct merge to `main`, push, publication, deployment, or activation is implied.

## 13. Evidence Requirements

Each Work Package must produce:

- baseline and worktree identity receipt;
- Context Receipt and policy decision references;
- normalized command/tool events;
- checkpoint and final diff hashes;
- complete targeted and full test results with exit codes;
- producer verification report;
- structured Handoff Envelope;
- independent REV findings;
- fresh QA verdict;
- write-set reconciliation;
- residual risk and limitation record; and
- human governance disposition.

Terminal output and runtime summaries are supporting observations, not accepted evidence by themselves.

## 14. Stop Conditions

Immediately stop and preserve the worktree when:

- baseline, repository, branch, identity, session, or Context Receipt differs;
- a runtime writes outside its declared write set;
- an unexpected worktree, process, network destination, MCP method, skill, dependency, or credential is used;
- the primary or another producer worktree becomes dirty;
- shared files are changed by a producer;
- tests or evidence are missing, stale, conflicting, or tampered;
- reviewer/QA independence cannot be demonstrated; or
- the Work Package, approval, lease, or execution window expires or is revoked.

Disposition is `DENY / FAIL_CLOSED` with `HOLD_AND_PRESERVE_WORKTREE` until governance resolves the finding.

## 15. Cleanup

Worktree cleanup is a separate authorized transition after evidence acceptance and integration disposition. The operator must resolve and verify each absolute target path before removal. Branch deletion, worktree removal, pruning, or reuse is prohibited while evidence, review, recovery, or appeal remains open.

## 16. Decisions Still Required

- Approve or revise the two Work Package boundaries and risk class.
- Resolve the two existing Claude-created worktrees and their owners.
- Select exact Codex and Claude runtime deployments/models.
- Define provider transport versus agent-tool network policy.
- Assign server-derived producer, REV, QA, evidence verifier, integrator, and GOV identities.
- Choose evidence storage, retention, execution windows, budgets, and cleanup authority.
- Decide whether this wave may proceed after independent review of this plan.
