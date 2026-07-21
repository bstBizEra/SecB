# MOD-REG Human GOV Disposition Candidate 001

**Record ID:** MOD-REG-GOV-DISP-001
**Status:** CANDIDATE / PENDING EXPLICIT HUMAN GOV DECISION
**Prepared by:** Claude-Sonnet5-Motor
**Prepared at:** 2026-07-21

## Frozen candidate under disposition

| Field | Value |
|---|---|
| Commit | `09d686c64f4bb3d8cd053f91b5f443b0ad69f811` |
| Tree | `7312fefd05a0ed9084f62779fd002b37fc4635fb` (independently reverified as this commit's own tree via `git log -1 --format=%T`, matching this project's exact commit+tree content-binding convention) |
| Branch | `codex/mod-reg/registry-services-003` |
| Message | `[MOD-REG-001] Remove unbound project scope alias` |
| Author | Codex ENGIN (`agent_id: /root`) |
| Scope touched | `src/registry/runtime-registry.mjs`, `tests/runtime-registry.test.mjs` (2 files only, confirmed across the full `-001`/`-002`/`-003` retarget lineage) |

## Why this record exists

Both Codex (producer/self-assessment) and this Claude session (independent cross-check) have converged on the same conclusion — the candidate is technically ready — but neither agent may self-authorize the next governed step. This record formalizes the exact statement a Human GOV decision requires, so the decision can be made explicitly rather than the candidate sitting frozen indefinitely with "nothing to sign."

## Independent evidence chain (both already complete, both already reproduced)

1. **Cross-provider REV** — `claude/rev/mod-reg-xprov` @ `8eef154`, verdict `APPROVE_FOR_QA_GATE`. Registry suite 46/46, full suite 378/0/5, validator exit 0. F-DEP and F-EVID verified CLOSED first-hand. One LOW informational note (F-CNT: validator count 548 vs. candidate's own claimed 545).
2. **Independent Claude QA** — `claude/qa/mod-reg-001` @ `278c536`, verdict **READY, no blockers**. Independently reproduced every number in (1) exactly. Definitively explained F-CNT: 545 was accurate for the earlier lineage commit `cad7c20`; 548 is correct for `09d686c` because 3 unrelated MANIFEST entries were added in between — not a miscount. Independently re-confirmed F-DEP/F-EVID and scope discipline (corrected a premise: the `-001`/`-002`/`-003` commits are not a linear chain, each retargets independently onto an evolving main). Found 2 NEW LOW, non-blocking findings not previously surfaced:
   - **F-VER**: the `expectedVersion` optimistic-concurrency check is opt-in; the only real (non-test) caller, `tools/secb-mcp-server-wiring.mjs`, never passes it.
   - **F-IDNORM**: `agent_instance_id` duplicate detection is raw byte-exact string equality — no case-fold, whitespace-trim, or Unicode-normalization; confirmed by execution that case-variant/whitespace-padded/NFC-NFD-confusable "same-looking" IDs all register as distinct identities.

Both reviews are independent, first-hand reproductions (not each citing the other), and both landed at the same substantive conclusion via different reviewers on different providers.

## What "APPROVE_NOT_EFFECTIVE" means here

This is a **technical acceptance of the candidate's content**, not an integration, merge, promotion, or activation decision — per this project's own standing acceptance-does-not-equal-promotion doctrine (see `p0-claude214-recovery-tooling-requalification-019/10-human-gov-closure-decision.yaml` and `p0-recovery-002/gov/disposition-candidate.yaml` for the same pattern applied elsewhere in this project). Signing this record:

- **Does** acknowledge that `09d686c` (tree `7312fefd`) is technically sound: no blocking findings across two independent review passes, exact numbers reproduced twice, two new LOW findings disclosed rather than hidden.
- **Does not** authorize merging `codex/mod-reg/registry-services-003` into `main`, does not authorize any integration work depending on it, does not authorize deploying or activating anything that consumes the registry, and does not itself close F-VER or F-IDNORM (both remain open, named, non-blocking follow-ups for whoever picks up the next MOD-REG slice).

## Recommended disposition

**APPROVE_NOT_EFFECTIVE** — matching the recommendation already independently reached and relayed from Codex's own worker-role assessment, and consistent with this Claude session's own independent QA verdict (READY, no blockers). This producer has no basis to recommend otherwise; the technical record is clean.

## Ready-to-sign statement

> "I, as Human GOV, dispose of the frozen MOD-REG registry candidate at commit `09d686c64f4bb3d8cd053f91b5f443b0ad69f811` (tree `7312fefd05a0ed9084f62779fd002b37fc4635fb`, branch `codex/mod-reg/registry-services-003`) as **APPROVE_NOT_EFFECTIVE**. This is a technical acceptance only, informed by two independent review passes (cross-provider REV `8eef154` and independent Claude QA `278c536`), both reproduced with no blocking findings. This disposition does NOT authorize merging this branch to main, does NOT authorize any integration or activation depending on it, and does NOT itself close the two disclosed non-blocking findings (F-VER, F-IDNORM), which remain open for a future slice. A separate, later, explicit decision is required before this candidate may be merged, integrated, or activated."
>
> **issuer_role:** HUMAN_GOV (to be completed only upon explicit operator sign instruction)
> **issuer_identity:** current_task_user (to be completed only upon explicit operator sign instruction)
> **date:** (to be completed only upon explicit operator sign instruction)

## Authority and scope

This record is advisory work product only. It does not authorize execution, does not merge or push anything, and does not itself constitute the Human GOV decision above — the statement is prepared ready-to-sign, not signed, per this project's standing authority boundaries. Neither Codex nor Claude may self-authorize the disposition this record proposes.

## Self-certification

```yaml
self_certification:
  agent_id: "Claude-Sonnet5-Motor"
  peer_agent_id: "codex:/root (candidate producer + cross-provider REV) / claude-code-bst-sa-worker (independent QA)"
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```
