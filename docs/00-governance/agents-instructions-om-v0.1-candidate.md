# AGENTS.md — SecB Repository Operating Instructions

## 1. Purpose and applicability

This file governs every human-assisted or autonomous agent operating in this repository, including Codex, Claude Code, Antigravity, Gemini-based harnesses, local models, CI agents and future SecB-compatible runtimes.

The repository is governed by `SECB-GOV-001 — SecB Governed Platform, Product, Module and Delivery Operating Model v0.1`.

A nested `AGENTS.md` may impose tighter controls for a directory. It may not expand authority, weaken evidence requirements, permit secret exposure, remove independent verification or bypass human governance decisions.

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

No agent may jump from an ambiguous request directly to mutation when scope, acceptance criteria, authority, risk or evidence obligations are unresolved.

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

If any mandatory element is absent, do not improvise authority. Record `AUTHORIZATION_OR_CONTEXT_GAP`, produce a Failure Evidence Envelope and route the work to research, correction or governance.

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
