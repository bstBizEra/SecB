# AGENTS.md — SecB Repository Operating Instructions

**Artifact ID:** SECB-AGENTS-OM-CANDIDATE
**Version:** 0.2.0-draft (revision 2)
**Status:** DRAFT / NOT EFFECTIVE until adopted per §23 and merged by the operator
**Effective scope:** Local repository only
**External publication authority:** Not granted
**Supersedes:** Revision 1 of this candidate (the header-less draft imported with the OM v0.1 pack at `docs/00-governance/agents-instructions-om-v0.1-candidate.md`, main `6b47cf1`). Revision 2 implements adoption-readiness changes A–G from doctrine review `om-v0.1-doctrine-rev-001` (finding F5-1 and related).
**Replaces when adopted:** Root [`AGENTS.md`](../../AGENTS.md) (SECB-AGENTS-LOCAL-001 v0.3.0-alpha, including amendment SECB-AGENTS-AMD-002 rev 2, which §19 ports forward without loss).

> This file is a **candidate**. It has no effect while root `AGENTS.md` remains the effective operating instruction. It cannot self-adopt; see §23.

## 1. Purpose and applicability

This file governs every human-assisted or autonomous agent operating in this repository, including Codex, Claude Code, Antigravity, Gemini-based harnesses, local models, CI agents and future SecB-compatible runtimes.

The repository is governed by `SECB-GOV-001 — SecB Governed Platform, Product, Module and Delivery Operating Model v0.1`.

A nested `AGENTS.md` may impose tighter controls for a directory. It may not expand authority, weaken evidence requirements, permit secret exposure, remove independent verification or bypass human governance decisions.

Changes under `docs/**` additionally follow [`docs/AGENTS.md`](../AGENTS.md). Its Review Requirement is normative here: documentation that changes authority, risk, separation of duties, evidence acceptance, memory admission, skill promotion, MCP/A2A permissions, release gates, or privacy controls requires independent REV and QA; R3/R4 changes also require SEC and human GOV.

## 2. Primary mission

Build SecB as a governed Agent Operations, Project Delivery, Evidence, Knowledge and Skills Control Plane that:

- converts strategic goals into traceable work;
- assigns the minimum sufficient agent team;
- routes work to the best-fit harness and model;
- observes execution in real time;
- separates production, review, assurance and governance;
- converts outcomes and failures into verified knowledge and reusable skills;
- preserves human authority over irreversible, production, security-sensitive and organizational-truth transitions.

## 3. Non-negotiable operating principles

1. **Authority is server-derived.** Runtime product names do not confer authority.
2. **One canonical identity per entity.** Projects, goals, modules, work packages, sessions, agents, evidence, knowledge and skills require immutable IDs.
3. **Minimum sufficient team.** Add roles because risk or complexity requires them, not because agents are available.
4. **Evidence before claim.** Completion, correctness, security and readiness claims require fresh, attributable evidence.
5. **Producer is not final verifier.** A maker may self-check but may not issue the final independent verdict.
6. **Unsafe mutation stops; learning continues.** Denied or failed execution transitions into the failure-to-capability loop.
7. **No raw session becomes truth.** Events become evidence candidates; evidence may support knowledge candidates; evaluated knowledge may become skill candidates.
8. **Integration is serialized.** Parallel agents may produce candidates, but protected-branch integration has one controlled queue and one authorized integrator.
9. **Context is scoped.** Agents receive the minimum sufficient, versioned Context Receipt.
10. **Secrets bypass model context.** Agents receive opaque credential handles, never reusable secrets.

## 4. Required lifecycle

Unless an approved Project Profile compresses low-risk stages, use:

```text
INTENT
→ REGISTER
→ FRAME
→ RESEARCH
→ OPTIONS
→ DECIDE
→ DESIGN
→ PLAN
→ AUTHORIZE
→ EXECUTE
→ SELF-VERIFY
→ INDEPENDENT REVIEW
→ QA / SECURITY ASSURANCE
→ GOVERNANCE DECISION
→ DELIVER
→ OBSERVE OUTCOME
→ LEARN
→ KNOWLEDGE CANDIDATE
→ SKILL CANDIDATE
→ PROMOTE / REJECT / RETIRE
```

No agent may jump from an ambiguous request directly to mutation when scope, acceptance criteria, authority, risk or evidence obligations are unresolved. Within pre-authorized implementation paths, ambiguity that does not touch a retained hard gate is resolved by the advise-and-proceed rule in §19, not by halting.

## 5. Goal discipline

Every work package must trace to:

```text
Portfolio Goal
→ Product Outcome
→ Module Objective
→ Measurable Key Result
→ Work Package
→ Acceptance Criteria
→ Evidence Obligation
→ Outcome Receipt
```

Agents must state the objective, measurable result, constraints, unknowns and evidence needed before implementation.

## 6. Role model

Core roles:

- `GOV` — human or formally constituted governance authority.
- `DOMAIN` — business intent, user value and outcome acceptance.
- `SARCHI` — strategic framing, operating design and work decomposition.
- `ARCHI` — technical contracts, boundaries, interfaces and architecture decisions.
- `RESEARCH` — source discovery, evidence quality, uncertainty and contradiction analysis.
- `ENGIN` — authorized implementation within a declared write set.
- `REV` — independent specification and quality review.
- `QA` — independent verification of claims and acceptance criteria.
- `SEC` — threat analysis, security controls and blocking findings.
- `OPS` — runtime, release, rollback, incident and service readiness.
- `KNOW` — knowledge curation, temporal validity and contradiction control.
- `SKILL` — skill packaging, evaluation, promotion and retirement.
- `INTEGRATOR` — controlled candidate reconciliation and integration queue.
- `FINOPS` — model, token, infrastructure and delivery-cost governance.
- `DOCS` — controlled documentation, traceability and change communication.

The minimum separation rules are:

```text
ENGIN != final REV
ENGIN != final QA
Evidence producer != evidence acceptor
Skill author != skill publisher
Integration candidate author != sole integrator
Agent != its own authority or exception approver
```

## 7. Harness routing

Harnesses are capability providers, not permanent roles.

- **Codex:** preferred for bounded implementation, repository mutation, tests, refactoring, deterministic tooling and integration automation.
- **Claude Code:** preferred for architecture, specification critique, broad repository reasoning, adversarial review, policy analysis and documentation synthesis.
- **Antigravity:** preferred for multi-agent visual orchestration, interactive prototyping, UI/workflow exploration and runtime-specific capabilities where its adapter is verified.
- **Other harnesses:** admitted only through a registered Harness Profile with capability, version, tool, security, telemetry and evidence declarations.

For R2+ work, use a different session for independent review. For R3/R4 work, prefer a different model or provider for at least one assurance role when practical.

## 8. Skill invocation

Before acting, identify applicable process and domain skills. Process skills precede implementation skills.

Minimum engineering skill chain:

```text
context-assimilation
→ problem-framing
→ research-and-source-evaluation, when external facts are needed
→ architecture-or-design
→ implementation-planning
→ worktree-isolation
→ test-driven-development
→ systematic-debugging, when failure exists
→ independent-review
→ verification-before-completion
→ evidence-packaging
→ learning-extraction
```

A skill may be used only if its version, provenance, inputs, outputs, permissions and evaluation status are known.

## 9. Work package preflight

Before mutation, verify:

- effective Project Contract;
- work package ID and owner;
- risk class and role assignments;
- baseline commit or artifact version;
- isolated workspace or worktree;
- declared paths and reserved symbols;
- allowed commands, tools, MCP servers and network destinations;
- acceptance criteria and test plan;
- evidence destination;
- rollback or recovery path;
- current Context Receipt.

If any mandatory element is absent, do not improvise authority. Record `AUTHORIZATION_OR_CONTEXT_GAP`, produce a Failure Evidence Envelope and route the work to research, correction or governance. Where the gap falls inside the pre-authorized paths of §19 and touches no retained hard gate, the routing may be advise-and-proceed: record the advisory decision and continue with the smallest reversible step.

## 10. Parallel execution

Parallelism is permitted when dependencies and write sets are controlled.

- O0: different modules/files — parallel permitted.
- O1: same module, different files/symbols — parallel with ownership declarations.
- O2: same file, separate regions — conditional write-set reservation.
- O3: same symbol or contract — competitive variants or serialization.
- O4: migration, lockfile, generated/global configuration — single writer.
- O5: protected branch/release/production configuration — serialized human-authorized integration.

Every mutation-capable lane requires its own workspace lease, runtime namespace, identity, context receipt and evidence destination.

## 11. Failure-to-capability policy

Never treat `FAIL`, `BLOCKED`, `DENIED`, `PARTIAL`, `REJECTED` or `INCIDENT` as an unstructured dead end.

Required flow:

```text
Attempt
→ Execution disposition
→ Failure Evidence Envelope
→ Classification and containment
→ Reproduction or evidence-gap analysis
→ Root-cause hypothesis
→ Research task
→ Corrective option and decision
→ Retest or replan
→ Experience candidate
→ Knowledge candidate
→ Skill candidate, when repeatable
→ Evaluation and promotion decision
```

Rules:

- Do not retry blindly.
- Do not relax a control merely to obtain a green result.
- Do not classify unauthorized mutation as success because no damage occurred.
- Preserve the distinction between safety containment and delivery progress.
- Close a failure only after a verified disposition: corrected, accepted risk, superseded, non-reproducible with rationale, or retired.

## 12. Evidence requirements

Evidence must identify:

- project, goal, module, work package and session;
- agent, role, harness, model and runtime version;
- authority and context references;
- baseline and observed change set;
- commands, tools, MCP calls and exit codes;
- test, scan, benchmark and review results;
- timestamps, environment and integrity digests;
- findings, limitations, uncertainty and final disposition.

Narrative statements such as “tests passed” are not sufficient without the executed command, status and evidence reference.

## 13. Research discipline

Research outputs must separate:

```text
Verified fact
Reported fact
Assumption
Inference
Hypothesis
Recommendation
Decision
Unresolved question
```

Current or externally changeable facts require current sources. Claims must include source references, date relevance, contradiction notes and confidence.

## 14. Knowledge and memory admission

Raw prompts, transcripts and terminal streams are operational records, not organizational knowledge.

Knowledge admission requires:

- a bounded claim;
- source evidence;
- scope and applicability;
- confidence and uncertainty;
- temporal validity;
- contradiction and supersession relationships;
- reviewer or knowledge-authority disposition.

Vector search is a retrieval projection, not the source of truth.

## 15. Skill lifecycle

```text
Observed technique or failure pattern
→ Skill candidate
→ Sandbox
→ Baseline failure test
→ Skill-enabled test
→ Cross-harness evaluation
→ Security and policy review
→ Restricted pilot
→ Approval
→ Versioned publication
→ Usage and outcome monitoring
→ Update / deprecate / revoke
```

No skill may grant authority, credentials or broader data access than the invoking session already possesses.

## 16. Credential handling

Agents may initiate a credential request but must not request, accept, repeat, store or transmit passwords, API keys, access tokens, private keys or recovery codes in ordinary chat, logs, files, commands, URLs, memory, evidence or skills.

Secret entry must use a masked control that bypasses model context and routes to the SecB Credential Broker. Agents receive only an opaque handle and non-sensitive scope/status metadata.

Detected plaintext exposure requires redaction, lease revocation, credential rotation, incident creation and evidence-preserving containment.

## 17. Completion standard

Before declaring completion:

1. Re-read the authorized objective and acceptance criteria.
2. Inspect the actual diff or artifact, not only a producer summary.
3. Run fresh verification commands.
4. Record results and limitations.
5. Confirm independent review/QA requirements.
6. Confirm documentation and traceability updates.
7. Issue an Outcome Receipt or a structured non-success disposition.

“Done” means evidence-backed acceptance, not the absence of visible errors.

## 18. Required references

- `docs/00-governance/SECB-GOV-001.md`
- `docs/11-agents/01-roles-and-separation-of-duties.md`
- `docs/11-agents/03-harness-routing.md`
- `docs/12-execution/03-universal-delivery-loop.md`
- `docs/12-execution/04-failure-to-capability-loop.md`
- `docs/13-skills/01-skill-set.md`
- `docs/14-delivery/01-module-allocation.md`
- `docs/15-knowledge/02-evidence-knowledge-skill.md`
- `docs/16-security/01-credential-handling.md`

## 19. Standing implementation authorization and advise-and-proceed (ported amendment SECB-AGENTS-AMD-002 rev 2)

This section ports amendment SECB-AGENTS-AMD-002 (revision 2) from root [`AGENTS.md`](../../AGENTS.md) verbatim, so that adopting this candidate does not revoke the operator's 2026-07-19 grant (doctrine review finding F5-1). Only the relative link targets have been rebased to this file's location; the normative text is unchanged.

> **Amendment ID:** SECB-AGENTS-AMD-002 (revision 2)
> **Requested by:** Operator, 2026-07-19
> **Status:** DRAFT until merged to `main` by the operator; EFFECTIVE thereafter
> **Scope:** Local repository work only. This amendment extends the working rules above.

### Standing implementation authorization

For worker agents (Codex, Claude) operating in this repository:

1. **Pre-authorized implementation paths.** Bounded slices that create or modify files under `src/**`, `tests/**`, `tools/**`, and `contracts/**` are pre-authorized and need no per-step operator approval, provided the slice declares its scope and acceptance checks, runs the checks after the final change with exact results reported (working rule 6), and stays on a non-`main` branch.
2. **Manifest maintenance right.** Agents must keep [`MANIFEST.json`](../../MANIFEST.json) accurate for files they add, rename, or delete within a slice, updating it in the same commit. Updates to [`docs/MANIFEST.json`](../MANIFEST.json) are likewise authorized when a slice legitimately changes `docs/**` under [`docs/AGENTS.md`](../AGENTS.md).

### Advise-and-proceed decision rule

Agents do not halt work to wait for human GOV, except at the retained hard gates below.

1. At a decision point inside a pre-authorized slice, the agent (a) records an advisory decision — options considered, rationale, risk class, truth status — in the commit message or slice notes, (b) implements the recommended option immediately, and (c) marks the decision for asynchronous GOV ratification.
2. Ratification happens at merge review: the operator-only merge to `main` ratifies the advisory decisions carried by the branch. Rejecting one is ordinary revert/rework, not an incident.
3. For matters that still require GOV/SEC pre-approval (R3/R4, authority model, separation of duties, release gates, evidence acceptance, memory admission, skill promotion), agents do not activate anything — but they **do not idle either**: they prepare the candidate implementation and an advisory packet on a branch, so the human decision arrives with the work already done and only ratification pending.
4. Working rule 8 (fail closed) is narrowed to: unknown identity, authority mutation, evidence acceptance, remote/external actions, and security-boundary changes. All other ambiguity is resolved by advise-and-proceed with the smallest reversible step.

### Retained hard gates (unchanged)

- No remote configure, push, publish, deploy, or activation without explicit operator authorization (working rule 5).
- No agent merges to `main`; no self-declared completion or production status.
- R3/R4 and authority-affecting changes activate only after the reviews required by [`docs/AGENTS.md`](../AGENTS.md) — but candidate preparation for them is authorized per the advise-and-proceed rule.
- The Phase 0 documentation pack remains `DRAFT / NOT EFFECTIVE` per the bootstrap boundary in root `AGENTS.md`.

Note on referenced working rules: "working rule 5", "working rule 6" and "working rule 8" refer to the SECB-AGENTS-LOCAL-001 working rules. Their substance is carried in this candidate as follows — working rule 5 → §20 gate (i); working rule 6 → §17 (completion standard, fresh checks with exact results); working rule 8 → the narrowed fail-closed set in item 4 above.

## 20. Retained hard gates (explicit restatement)

Regardless of any other section of this file, and regardless of any pre-authorization or advise-and-proceed latitude in §19, the following gates always hold:

1. **(i) No remote actions without operator authorization.** No agent may configure, push, publish, deploy, or activate a remote or external system without explicit operator authorization.
2. **(ii) No agent merges to protected branches.** No agent merges to `main` or any protected branch; protected-branch integration is serialized and human-authorized (§10 O5).
3. **(iii) No self-declared completion or production status.** Completion requires the evidence-backed acceptance of §17; production status requires human governance decision.
4. **(iv) Phase 0 pack remains DRAFT / NOT EFFECTIVE.** The Phase 0 / OM v0.1 documentation pack defines future controls but does not self-authorize production, remote publication, mutation outside this repository, knowledge promotion, or skill publication.

These gates restate, and must remain consistent with, the "Retained hard gates (unchanged)" of ported amendment SECB-AGENTS-AMD-002 rev 2 (§19). If any conflict is perceived between §19 latitude and these gates, the gates win.

## 21. Canonical definitions

Per [`docs/AGENTS.md`](../AGENTS.md) ("Use one authoritative definition for each contract or concept; link to it elsewhere") and doctrine review finding F2-1, this candidate designates, for the scope of this file:

- **Canonical authority-class ladder (A0–A5):** [`docs/00-governance/decision-rights.md`](decision-rights.md) (SECB-GOV-001 v0.1 pack), "Authority classes".
- **Canonical decision-rights matrix:** [`docs/00-governance/decision-rights.md`](decision-rights.md), "Decision rights matrix".
- **Informative (superseded for definition purposes):** the legacy A0–A5 ladder in [`docs/00-governance/authority-and-risk-model.md`](authority-and-risk-model.md) and the legacy decision matrix in [`docs/00-governance/governance-baseline.md`](governance-baseline.md) §2. Their contents are mutually consistent with the canonical tables at the time of this revision; where any future divergence appears, `decision-rights.md` controls and the legacy documents are to be read as historical/informative only.

This designation is made inside this candidate file only. It does not edit the legacy documents; adding supersession headers to them is a separate documentation change under [`docs/AGENTS.md`](../AGENTS.md).

## 22. Security boundary rule and data privacy

**Security Rule (ported from legacy** [`docs/08-security/threat-model.md`](../08-security/threat-model.md)**, "Security Rule" section, per doctrine review finding F3-1):**

> A PTY, worktree, model instruction, or agent promise is not a security boundary. Controls must be enforced by identity, policy, operating-system/container isolation, credentials, network policy, immutable evidence, and human governance.

This rule is the enforcement basis for ADR-0006 (harness-neutral authority): runtime product names, harnesses, and agent self-descriptions confer no authority and constitute no security boundary.

**Data privacy and retention (per doctrine review finding F3-2):** until a `docs/16-security/` equivalent exists, the applicable data-privacy, capture-level, retention and residency controls are those of legacy [`docs/08-security/data-privacy-retention.md`](../08-security/data-privacy-retention.md) (SECB-SEC-DATA-001, DRAFT / NOT EFFECTIVE). Creating the `16-security` successor document is tracked as an open item from review `om-v0.1-doctrine-rev-001`; this reference is a bridge, not a substitute.

The credential-handling requirements of §16 remain in force alongside this section.

## 23. Adoption procedure

This candidate **cannot self-adopt** (doctrine review change F). Replacing root `AGENTS.md` (SECB-AGENTS-LOCAL-001) with this file is an authority-affecting, R3/R4-class documentation change. It becomes effective only through all of the following, in order:

1. **ADR.** A dedicated architecture decision record for the replacement decision — [`docs/adr/0008-root-agents-adoption.md`](../adr/0008-root-agents-adoption.md) — proposed as DRAFT and decided by human governance.
2. **Independent REV + QA.** Independent review and QA of this candidate against the currently effective root `AGENTS.md`, per the [`docs/AGENTS.md`](../AGENTS.md) Review Requirement. The producer of this revision may not issue the final verdict (§3.5).
3. **SEC review.** Security review, because the change class is authority/separation-of-duties (R3/R4 adds SEC).
4. **Human GOV decision.** An explicit human governance decision to adopt, recorded in the ADR (status moves from PROPOSED to ACCEPTED or REJECTED).
5. **Operator merge.** The operator — not any agent — merges the adopting change to `main`. Until that merge, this file remains DRAFT / NOT EFFECTIVE and root `AGENTS.md` (including amendment SECB-AGENTS-AMD-002 rev 2) remains the sole effective operating instruction.

Partial adoption (cherry-picking sections into root `AGENTS.md`) follows the same procedure.

---

## Revision record

- **Revision 1** — imported with the OM v0.1 pack (sections 1–18; no document-control header).
- **Revision 2 (this document, 0.2.0-draft)** — implements doctrine review `om-v0.1-doctrine-rev-001` adoption-readiness changes: A (document-control header), B (§19 verbatim port of SECB-AGENTS-AMD-002 rev 2, incl. advise-and-proceed and narrowed fail-closed set; consequential cross-references added in §4 and §9), C (§20 explicit retained hard gates), D (§1 docs/AGENTS.md review-requirement cross-reference; nested-AGENTS tighter-only precedence retained in §1), E-partial (§21 canonical definitions designation, this file only), F (§23 adoption procedure; no self-adoption), G (§22 Security Rule port and data-privacy/retention bridge reference). Sections 1–18 otherwise unchanged from revision 1 except the noted §1, §4 and §9 cross-references.
