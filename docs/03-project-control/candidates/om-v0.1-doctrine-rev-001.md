# Governed Operating Model v0.1 — Acceptance-Track Doctrine Review

**Record ID:** om-v0.1-doctrine-rev-001
**Reviewer identity:** claude-cortex-rev-om-doctrine-01 (BST-SA cortex, advisory doctrinal reviewer)
**Review class:** Acceptance-track content review (distinct from the completed import-fidelity review `om-v0.1-import-rev-001`, APPROVE_WITH_NOTES)
**Target SHA:** 6b47cf12eadf2c6e18216d2feda4c075184a7bb9 (`main`)
**Date:** 2026-07-19
**Authority:** advisory_only — human GOV (operator) makes the acceptance decision. This review never pushes, never merges, never weakens a gate.

## Scope

Content review of the SECB-GOV-001 v0.1 doctrine pack at current `main`:

- `docs/00-governance/SECB-GOV-001.md`, `governing-principles.md`, `decision-rights.md`, `agents-instructions-om-v0.1-candidate.md`
- Sections `docs/10-platform` through `docs/17-operations`
- ADRs `0005`–`0007`

Evaluated against currently-effective governance: root `AGENTS.md` (SECB-AGENTS-LOCAL-001 v0.3.0-alpha) incl. amendment **SECB-AGENTS-AMD-002 rev 2** (advise-and-proceed), the legacy constitution (`docs/00-governance/governance-baseline.md`, `authority-and-risk-model.md`), ADRs `0001`–`0004`, and legacy security/capability docs (`docs/08-security/threat-model.md`, `docs/07-capabilities/skillshub-lifecycle.md`).

## Method

Read the actual files; findings cite real text with file references. No content invented. Where a source was not fully read (legacy `07-capabilities/mcp-a2a-governance.md`), the finding is marked `partially_supported`.

## Finding summary

| Severity | Count |
|---|---|
| CRITICAL | 0 |
| HIGH | 1 |
| MEDIUM | 5 |
| LOW | 4 |

---

## Lens 1 — Authority conflicts

Checked every v0.1 authority statement for expansion of agent authority, self-approval, or bypass of operator-only merge, against effective root `AGENTS.md`+AMD-002, legacy `governance-baseline.md`/`authority-and-risk-model.md`, and ADRs 0001–0004.

**No authority-expansion or self-approval path was found.** The v0.1 pack preserves producer≠final-verifier (`agents-instructions-om-v0.1-candidate.md:29` §3.5; `11-agents/01` prohibited combinations), human GOV at R3/R4 (`SECB-GOV-001.md:122-130` §8), and human-authorized protected-branch integration (`14-delivery/04:14-16,22-23`). ADR-0006/0007 remain consistent with ADR-0002/0003.

| ID | Severity | Evidence | Finding |
|---|---|---|---|
| F1-1 | MEDIUM | `SECB-GOV-001.md:164-172` §13 | The top-level "Human authority" enumeration omits two gates that AMD-002 makes explicit: (a) no agent merge to `main`/protected branch, (b) no remote configure/push/publish/deploy/activate without operator authorization. Both are enforced elsewhere (`14-delivery/04:20-27`; root `AGENTS.md` AMD-002 hard gates `:68`), so this is a completeness gap, not a live conflict — but adopting §13 verbatim as the authoritative human-authority list could be read as not reserving merge/remote to humans. Recommend §13 restate or cross-reference these two gates. |
| F1-2 | LOW | `SECB-GOV-001.md:152` §10 | "protected branches remain single-writer or serialized" lacks the "human-authorized" qualifier present in the candidate (`agents-instructions-om-v0.1-candidate.md` §10 O5, line ~174) and `14-delivery/04`. Weaker phrasing at the doctrine root; align wording. |

## Lens 2 — Internal consistency

| ID | Severity | Evidence | Finding |
|---|---|---|---|
| F2-1 | MEDIUM | `decision-rights.md:3-12` vs `authority-and-risk-model.md:7-16` vs `governance-baseline.md:22-32` | The pack now carries **two authority-class ladders** (v0.1 `decision-rights.md` A0–A5 and legacy `authority-and-risk-model.md` A0–A5) and **two decision-rights matrices** (`decision-rights.md` and `governance-baseline.md` §2). Contents are mutually consistent (no contradiction), but there is no canonical designation or supersession note. This violates `docs/AGENTS.md:13` ("Use one authoritative definition for each contract or concept; link to it elsewhere"). Declare which is canonical before adoption. |
| F2-2 | LOW | `SECB-GOV-001.md:47` vs `12-execution/04:24` | Work-state token mismatch: doctrine §3.1 names `DEPENDENCY_REQUIRED`; the execution loop names `DEPENDENCY_RESOLUTION_REQUIRED`. Normalize the token. |

Checked and **no contradiction found**: risk classes (`16-security/02:5-11`) vs exit gates (`14-delivery/03`) — exit gates reference risk/mutation classes resolving deterministically and do not re-enumerate conflicting values. Universal lifecycle (`SECB-GOV-001.md:97-102` §6) matches root `AGENTS.md:40-61` §4 and `12-execution/03`. Role topology (`SECB-GOV-001.md:122-130` §8) matches independence strength in `11-agents/01:36-43`.

## Lens 3 — Security (SEC lens)

Compared `16-security/*` against legacy `08-security/threat-model.md` and the credential-broker rule.

**Positive (no regression):** `16-security/01-credential-handling.md:1-15` fully satisfies the credential-broker rule — masked control, Credential Broker, opaque session-bound lease, secrets never in model context — consistent with root `AGENTS.md:34,276-279` §10/§16.

| ID | Severity | Evidence | Finding |
|---|---|---|---|
| F3-1 | MEDIUM | `16-security/03-agentic-threat-model.md:1-22` vs `08-security/threat-model.md:32-33` | The new agentic threat model **drops the legacy "Security Rule"**: "A PTY, worktree, model instruction, or agent promise is not a security boundary." That principle is the enforcement basis for **ADR-0006 harness-neutral authority** (`adr/0006:9`). As written, ADR-0006's enforceability now depends on a statement that lives only in the legacy (`DRAFT / NOT EFFECTIVE`) doc. Port the Security Rule into `16-security/03`. |
| F3-2 | MEDIUM | `docs/16-security/` (dir), `SECB-GOV-001.md` (no residency/retention clause) | The v0.1 `16-security` section has **no data-privacy / retention / residency document**; legacy `08-security/data-privacy-retention.md` is not carried forward, and `SECB-GOV-001` is silent on residency/retention. `docs/AGENTS.md:26` lists privacy controls among R3/R4 change classes, so the control family is in-scope but undocumented in the new section. |
| F3-3 | LOW | `16-security/03:1-22` vs `08-security/threat-model.md:29` | New threat model omits the explicit "evidence deletion / audit rewriting" family and its append-only-storage / retention-lock / independent-backup controls. It covers "false or replayed evidence and approvals" but not audit-log tampering. Add the family. |
| F3-4 | LOW | `SECB-GOV-001.md:31` §2; `16-security/03:2-4` | MCP/A2A gateway path: threat families "prompt injection through … MCP results," "tool-result spoofing," and "authority escalation through A2A delegation" are present, but there is no dedicated MCP/A2A gateway control-mapping doc in `16-security`, and root `AGENTS.md:297-308` §18 required references omits an MCP/A2A governance doc. `partially_supported` — verify coverage against legacy `07-capabilities/mcp-a2a-governance.md` (not fully read) and add an explicit control map. |

## Lens 4 — Lifecycle coherence

Traced the failure-to-capability loop (`12-execution/04`) + skill lifecycle (`13-skills/02`) against evidence/knowledge/skill promotion gates (`15-knowledge/02`, `15-knowledge/03`, legacy `07-capabilities/skillshub-lifecycle.md`).

**No self-promotion path for unverified knowledge was found.** The loop emits only candidates (`12-execution/04:48-51`); `15-knowledge/02:32-36` prohibits transcript-to-knowledge auto-promotion, author-only skill publication, and knowledge/skill granting execution authority; `15-knowledge/03:12-20` places approved knowledge above candidate/semantic retrieval and prohibits caller-declared authority and implicit cross-project fallback. Candidate→review→approval holds end-to-end.

| ID | Severity | Evidence | Finding |
|---|---|---|---|
| F4-1 | MEDIUM | `13-skills/02:3-16,34-35` vs `07-capabilities/skillshub-lifecycle.md:22-25` and `SECB-GOV-001.md:169-170` §13 | The v0.1 skill lifecycle chain names an `APPROVED` state but **omits the explicit human-promotion gate** that legacy `skillshub-lifecycle.md` names ("→ Human Promotion Decision → Restricted Publication"). The human gate for broad/cross-project publication still exists at the doctrine level (`SECB-GOV-001.md:169-170`), but `13-skills/02`'s bare `APPROVED`/`PUBLISHED` states could be read as agent-approvable. Restate the human-promotion gate (broad scope) inside `13-skills/02`. |

## Lens 5 — Adoption readiness (candidate agents-instructions → root AGENTS.md)

`agents-instructions-om-v0.1-candidate.md` is a full rewrite proposed to replace root `AGENTS.md`. It is stronger on lifecycle discipline but, **adopted verbatim, would silently regress two operator-granted controls.**

| ID | Severity | Evidence | Finding |
|---|---|---|---|
| F5-1 | HIGH (conditional on adoption) | `agents-instructions-om-v0.1-candidate.md` (whole file) vs root `AGENTS.md:43-71` (AMD-002 rev 2) | The candidate contains **no advise-and-proceed rule, no pre-authorized implementation paths, no manifest-maintenance right, and no narrowed fail-closed trigger set.** Its §4 ("No agent may jump … directly to mutation") and §9 preflight ("do not improvise authority … route … to governance") restore a full-halt posture. Replacing root `AGENTS.md` verbatim would revoke AMD-002's 2026-07-19 grant and drop the explicitly-stated remote/merge hard gates. Because the candidate is not yet adopted (this review gates it), current risk is contained — but the magnitude if adopted is high. |

### Concrete adoption-readiness change list (must land before the candidate replaces root AGENTS.md)

- **A. Document-control header.** Add Document ID, version, `Status: DRAFT / NOT EFFECTIVE until operator merge`, `Effective scope: local repository only`, `External publication authority: not granted`. The candidate currently has none; root `AGENTS.md:1-7` does.
- **B. Port AMD-002 rev 2 verbatim** as a section: standing implementation authorization (pre-authorized `src/**`, `tests/**`, `tools/**`, `contracts/**` bounded slices on non-`main` branches), manifest-maintenance right, the advise-and-proceed decision rule, and the narrowed fail-closed trigger set (root `AGENTS.md:50-71`). Without this the replacement silently revokes the grant (F5-1).
- **C. Restate the retained hard gates explicitly:** (i) no remote configure/push/publish/deploy/activate without operator authorization; (ii) no agent merge to `main`/protected branch; (iii) no self-declared completion or production status; (iv) Phase 0 pack remains `DRAFT / NOT EFFECTIVE` (root `AGENTS.md:66-71`).
- **D. Cross-reference `docs/AGENTS.md` review requirement** (independent REV+QA; R3/R4 add SEC + human GOV — `docs/AGENTS.md:26`) and keep the nested-AGENTS precedence rule already present at candidate §1 ("may not expand authority…").
- **E. Resolve duplicate authority ladders (F2-1):** declare the canonical authority-class table and decision matrix and add supersession notes, so the replacing AGENTS.md points to a single source of truth.
- **F. Supersession/transition record:** replacing SECB-AGENTS-LOCAL-001 is an authority-affecting change — requires an ADR + independent REV+QA+SEC + human GOV per `docs/AGENTS.md:26`, then operator merge. The candidate cannot self-adopt.
- **G. Carry security completeness forward:** port the Security Rule (F3-1) and add the data-privacy/retention reference (F3-2); keep the candidate's credential section §16 (already sound).

---

## Advisory recommendation

**RECOMMEND_ACCEPT_WITH_CHANGES**

Accept the SECB-GOV-001 v0.1 doctrine pack as a `DRAFT_FOR_IMPLEMENTATION_REVIEW` design baseline. No CRITICAL/HIGH unconditional finding: no authority expansion, no self-approval path, no broken gate at current `main`. The required changes are:

1. (F5-1 / list A–G) Do **not** promote `agents-instructions-om-v0.1-candidate.md` to replace root `AGENTS.md` until AMD-002 rev 2 is ported and the retained hard gates are restated. Treat the replacement as an authority-affecting change requiring full REV+QA+SEC+human GOV.
2. (F3-1) Port the legacy "not a security boundary" Security Rule into `16-security/03` to keep ADR-0006 enforceable.
3. (F3-2) Add a data-privacy/retention/residency document to `16-security` (or an explicit deferral note).
4. (F4-1) Restate the human-promotion gate for broad/cross-project skill publication inside `13-skills/02`.
5. (F1-1) Restate or cross-reference the merge/remote human-authority gates in `SECB-GOV-001` §13.
6. (F2-1) Designate canonical authority ladder/decision matrix and add supersession notes.
7. (F2-2, F1-2, F3-3, F3-4) Normalize the `DEPENDENCY_*` token, add the "human-authorized" qualifier to §10, add the evidence-deletion threat family, and confirm/ map MCP-A2A gateway coverage.

None of these block accepting the pack as a design baseline; all are prerequisites to it becoming *effective* operating governance or replacing root `AGENTS.md`.

## Status fields

- **truth_status:** verified_true (findings cite read text; F3-4 element `partially_supported` as noted)
- **authority_status:** advisory_only
- **implementation_status:** existing (review of committed v0.1 pack at target SHA; no code/policy mutated)
- **risk_class:** R1 (documentation/advisory review record; no mutation of authoritative systems)

## Self-certification

```yaml
self_certification:
  agent_id: claude-cortex
  peer_agent_id: null
  certification_scope: advisory_only
  execution_authority: false
  approval_authority: false
  ready_for_operator_review: true
```

> Advisory only. Recommend improvements; do not execute them. Human GOV owns the acceptance decision.
