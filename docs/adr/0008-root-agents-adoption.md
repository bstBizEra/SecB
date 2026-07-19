# ADR-0008 — Adoption of the OM v0.1 Agents-Instructions as Root AGENTS.md

## Status

PROPOSED / NOT DECIDED — DRAFT candidate ADR. The human governance operator makes this decision; no agent may decide, activate, or merge it.

## Context

- The currently effective root operating instruction is `AGENTS.md` (SECB-AGENTS-LOCAL-001 v0.3.0-alpha), including amendment SECB-AGENTS-AMD-002 rev 2 (standing implementation authorization for `src/**`, `tests/**`, `tools/**`, `contracts/**`; manifest-maintenance right; advise-and-proceed decision rule; narrowed fail-closed triggers; retained hard gates), effective 2026-07-19.
- The OM v0.1 doctrine pack introduced a full-rewrite candidate at [`docs/00-governance/agents-instructions-om-v0.1-candidate.md`](../00-governance/agents-instructions-om-v0.1-candidate.md).
- Doctrine review `om-v0.1-doctrine-rev-001` (advisory, target `main` 6b47cf1) found that adopting revision 1 verbatim would silently revoke AMD-002 rev 2 and drop explicit remote/merge hard gates (finding F5-1, HIGH conditional on adoption), and listed adoption-readiness changes A–G.
- Revision 2 of the candidate (SECB-AGENTS-OM-CANDIDATE 0.2.0-draft) implements changes A–D, F, G and E-partial: document-control header, verbatim port of AMD-002 rev 2, explicit retained hard gates, docs/AGENTS.md review-requirement cross-reference with nested-AGENTS tighter-only precedence, canonical-definitions designation (within the candidate only), an explicit no-self-adoption procedure, and the ported Security Rule plus data-privacy/retention bridge reference.
- Replacing the root operating instruction is an authority-affecting, R3/R4-class change: per [`docs/AGENTS.md`](../AGENTS.md), it requires independent REV and QA, SEC review, and a human GOV decision, followed by operator-only merge.

## Decision to be made

Whether to replace root `AGENTS.md` (SECB-AGENTS-LOCAL-001 v0.3.0-alpha + SECB-AGENTS-AMD-002 rev 2) with SECB-AGENTS-OM-CANDIDATE revision 2 as the effective repository operating instruction.

Options for the operator:

1. **Adopt revision 2** as the new root `AGENTS.md` after independent REV+QA+SEC confirm no authority regression (in particular, that §19 preserves AMD-002 rev 2 without loss and §20 preserves every retained hard gate).
2. **Adopt with amendments** — direct further changes (e.g., completing change E across the legacy doctrine files, or resolving remaining review findings F1-1, F2-2, F3-3, F3-4, F4-1) before or together with adoption.
3. **Reject / defer** — keep SECB-AGENTS-LOCAL-001 effective; the candidate remains DRAFT / NOT EFFECTIVE.

This ADR records the decision; it does not make it.

## Consequences (if adopted)

- The root operating instruction becomes the OM v0.1-aligned rewrite: lifecycle, role model, harness routing, parallel-execution classes, failure-to-capability policy, evidence/knowledge/skill discipline become the top-level normative frame.
- SECB-AGENTS-AMD-002 rev 2 continues in force via the candidate's §19 verbatim port; the operator's standing implementation authorization and advise-and-proceed grant are not revoked by the replacement.
- The retained hard gates (no unauthorized remote actions; no agent merges to protected branches; no self-declared completion or production; Phase 0 pack DRAFT / NOT EFFECTIVE) remain explicit at §20.
- SECB-AGENTS-LOCAL-001 is superseded and should be preserved as a historical record (extend-only), not deleted.
- The canonical authority ladder and decision matrix become those of `docs/00-governance/decision-rights.md` for the root instruction's scope; follow-up documentation work should add matching supersession notes to the legacy files.
- Open review findings not resolved by revision 2 (F1-1, F2-2, F3-3, F3-4, F4-1, and the `16-security` data-privacy successor document) remain tracked obligations independent of this adoption.

## Consequences (if rejected or deferred)

- Root `AGENTS.md` + AMD-002 rev 2 remain the sole effective operating instruction; the candidate stays a design reference within the DRAFT pack.
- No authority or gate changes occur.

## Required process before any decision takes effect

Per the candidate's §23 and [`docs/AGENTS.md`](../AGENTS.md): independent REV + QA of the candidate, SEC review, explicit human GOV decision recorded here, then operator merge to `main`. Producer of the candidate revision may not issue the final review verdict.
