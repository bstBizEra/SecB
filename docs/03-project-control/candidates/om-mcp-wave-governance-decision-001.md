# OM + MCP Wave — Governance Decision Request 001

**Record ID:** GOV-DEC-OM-MCP-001
**Status:** DRAFT — awaiting human GOV (operator) disposition
**Date:** 2026-07-19
**Prepared by:** Claude (BST-SA worker, operator session), consolidating governance-loop outputs from Claude subagents and Codex lanes
**Authority note:** every item below is advisory; nothing is self-approved. Operator merge/decision is the ratification event (AMD-002).

## Decision items

### D1 — MCP gateway candidate (PR #3) round-1 closure

- Frozen review target `270dacf` on `bst/secb-mcp-p0-001-candidate` (draft PR #3).
- Codex REV round 1 surfaced three findings (clock/policy throw escape, async-adapter bypass, receipt attribution); formal committed verdict record still pending in the Codex lane.
- Round-2 fix candidate READY: `bst/mcp-gateway-round2-prep` @ `4861c75` (4 fixes + 4 tests; 15/15 targeted, 167-suite 0 fail; branch predates the validator-remotes fix so `npm test`'s validate gate fails there benignly — inherited on merge).
- **Requested disposition:** when the Codex verdict record lands, fold round 2 into the PR #3 branch as a new pinned round (or merge sequentially), rerun QA, then operator merge.

**D1 ADDENDUM (2026-07-19, reconciliation):** the Codex producer lane independently delivered `producer/mcp/p0a-gateway-core-rework-002` @ `f42b110` (same frozen base `7576a29`): an on-branch REV round (REQUEST_CHANGES → rework → rework-002) plus a substantially hardened core (revocation, concurrency limits, request/result output controls, error-text non-disclosure, frozen context/capability/adapter snapshots) with a dedicated adversarial suite and a producer-verification handoff pinning `1f4465d..daaa4ac`. Cross-check confirms it **subsumes all four fixes** in `bst/mcp-gateway-round2-prep` @ `4861c75` (clock/policy throws, async-adapter rejection, receipt-attribution immunity — each covered by an adversarial test). **Reconciliation recommendation:** adopt `producer/mcp/p0a-gateway-core-rework-002` as the single round-2 successor; mark `bst/mcp-gateway-round2-prep` SUPERSEDED (retain as convergence evidence; do not delete without operator instruction). The producer handoff's mandated fresh independent REV/QA/SEC remains outstanding.

### D2 — Operating Model v0.1 acceptance track

- Import fidelity REV: **APPROVE_WITH_NOTES** @ `b98fb28` (`bst/om-v0.1-import-rev-001`) — 56/56 source hashes verified; 1 LOW (regenerated `docs/README.md` not in import-map), 1 INFO (CRLF); 0 high/critical.
- Doctrinal REV: **RECOMMEND_ACCEPT_WITH_CHANGES** @ `87b20af` (`bst/om-v0.1-doctrine-rev-001`) — 0 critical, 1 HIGH (F5-1: verbatim adoption of the candidate agents-instructions would revoke AMD-002 and the hard gates), 5 MEDIUM, 4 LOW; adoption-readiness change list A–G.
- Rev-2 candidate agents-instructions + draft ADR-0008: **READY** @ `bc07a8e` on `bst/agents-adoption-rev2-candidate` — A–G implemented (E partial by scope: canonical designation made in-file; supersession headers on legacy files deferred), AMD-002 ported verbatim with hard-gates-win conflict clause, adoption procedure requires ADR-0008 + REV+QA+SEC + human GOV + operator merge; validator exit 0, 139 tests 0 fail. Findings touching other doctrine files (F1-1, F2-2, F3-3, F3-4, F4-1) tracked in ADR-0008 as obligations independent of adoption.
- **Requested disposition:** merge the two REV records; accept v0.1 doctrine conditionally on the A–G changes; route rev-2 through its own REV+QA+SEC, then decide ADR-0008.

### D3 — P0-21 SecB MCP Server deployment readiness

- Deployment wiring candidate: `bst/p0-21-deployment-candidate` @ `0b75aaf` (from rehearsal-3 `1c77958`) — seed loader (fail-closed), append-only invocation ledger (write failure denies, proven in-test), service composition, end-to-end stdio round-trip; 16/16 new tests, 264 total 0 fail, 0 regressions.
- Activation remains gated: serving requires `SECB_MCP_DEPLOYMENT_AUTHORIZED=operator` + valid seed + asserted caller id; default is exit 2 with the operator-authorization message.
- **New latent finding (for the rehearsal-3 promotion reassessment):** the delivered skeleton's `file://` entry-point guard never matched Windows paths, so its exit-2 operator gate was silently inert on Windows; fixed in the candidate via `pathToFileURL`. Classify and track per the existing latent-finding pattern.
- **Requested disposition:** adopt this candidate into the rehearsal-3 promotion path; the promotion itself still needs the fresh readiness assessment (main has moved: `6152897` → `6b47cf1`).

### D4 — Cross-lane state (information, no decision needed)

- Codex Desktop is running its own scheduled "SecB governed Claude-Codex delivery loop" (30-minute cadence) with subagent delegation; Codex CLI lanes: 013-rejection governance records drafted (awaiting operator sign-off in that session), ENGIN rework-002 in progress.
- Claude-side loop: session cron `13,43 * * * *` + branch/PR monitor.

## Operator action checklist

1. Sign or amend the 013 records in the Codex CLI session (its own queue).
2. Rule on D1–D3 dispositions above (merge order suggestion: REV records → round-2 fold → PR #3; deployment candidate rides the rehearsal-3 reassessment).
3. ADR-0008 decision after rev-2 candidate review completes.
