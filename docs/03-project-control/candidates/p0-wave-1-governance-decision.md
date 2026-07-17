# Governance Decision Request: P0 Parallel Build Wave 1

- **Decision ID:** `dec_secb_p0_wave_1_authorization_001`
- **Status:** `PENDING_HUMAN_GOV / NOT EFFECTIVE`
- **Project:** `prj_secb_local`
- **Project Contract:** `project_contract_prj_secb_local_v2_r2_candidate`
- **Work Packages:** `wp_secb_p0_08_project_contract_service_001`, `wp_secb_p0_15a_runtime_registry_core_001`
- **Prepared:** 2026-07-17T14:11:53.4233371+07:00
- **Approver identity:** unresolved
- **Effective date:** null
- **Expiry:** null

## Objective

Request human governance review of the proposed local R2 parallel build wave using separate Codex and Claude Code worktrees and disjoint write sets.

## Verified Facts

- Primary repository `C:/laragon/www/SecB` was clean at commit `26e299c160f58a5305b143456e8e43ecf2adac12` during preparation.
- No Git remotes were configured.
- The nested Claude worktree and detached Claude review worktree were clean at `2c2c24ce98482fbf6068d2e34655658440a2de56`.
- Claude Code CLI `2.1.139` was observed locally.
- The two planned mutation worktrees did not exist.

## Unresolved Preconditions

- Human project owners and governance approver identity.
- Server-issued Agent Instance, Session, workload, and workspace lease identities.
- Independent REV and QA assignments.
- Provisioned evidence destinations and retention enforcement.
- Exact provider transport, model, tool, command, and cost policy decisions.
- Absolute execution-window timestamps derived after effective approval.

## Proposed Decision

Approve only if every unresolved precondition is resolved and independently verified. Approval would authorize creation and bounded use of the two planned sibling worktrees for four hours from effective approval. It would not authorize direct `main` mutation, integration, merge, push, publication, deployment, activation, MCP, A2A, memory admission, or skill publication.

## Required Human GOV Record

The effective successor decision must include:

- server-derived approver identity;
- decision status `APPROVED_NOT_EFFECTIVE`, `EFFECTIVE`, or `DENIED`;
- exact Project Contract and Work Package versions/hashes;
- issued Agent Instance, Session, and workspace lease IDs;
- exact start and expiry timestamps;
- evidence destination and retention confirmation;
- accepted residual risks and conditions;
- signature or attestation reference; and
- revocation and cleanup authority.

No agent may populate those fields on behalf of human GOV or treat this request as approval.
