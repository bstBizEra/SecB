# SECB-GOV-SURFACE-001 — SecB Governance Surface & High-Logic Agent Prompting Protocols v1.0

## Document Control

| Field | Value |
|---|---|
| Artifact ID | SECB-GOV-SURFACE-001 |
| Version | 1.0.0-draft |
| Status | DRAFT_FOR_IMPLEMENTATION_REVIEW |
| Owner | SecB Governance Authority |
| Applies to | SecB platform, AI Agents (Gemini, Claude, Codex, Antigravity), harnesses, prompt design, and operational execution |
| Effective when | Approved by human GOV and referenced in `AGENTS.md` |

---

## 1. Purpose & Doctrine

This document defines the **Governance Surface & High-Logic Prompting Protocols** for SecB. It equips AI Agents (such as Gemini, Claude, Codex, and Antigravity) to operate with maximum logical rigor, complete system situational awareness, deep structural analysis, explicit negative-case enforcement, and fail-closed safety.

SecB is a governed control plane. All AI Agents operating in SecB MUST adhere to First-Principles Analysis, Sequential Thinking, Refusal Matrices, and strict Source-of-Truth binding before initiating code or system mutations.

---

## 2. First-Principles Analysis Protocol

When tasked with designing, implementing, or refactoring a feature or module, AI Agents MUST NOT proceed directly to code generation. Agents MUST perform a structural **First-Principles Analysis** using the following four-part framework:

```text
First-Principles Analysis Framework:
1. Invariants & Rules (Non-negotiable System Safeguards)
2. Trade-off Analysis (Evaluating >= 2-3 Architectural Alternatives)
3. Refusal Matrix / Negative Cases (Strict Explicit Rejection Conditions)
4. Structural Step-by-Step Plan (Test-First Fixtures & Sequenced Execution)
```

### 2.1 Invariants & Rules
Identify and state all non-negotiable system rules and invariants that MUST NOT be violated under any circumstances.
- *Examples*: Deny-by-default authority, Tenant Isolation, Immutable Identity, Append-only Ledger integrity, Fail-Closed state transitions, Role Separation.

### 2.2 Trade-off Analysis
Compare at least 2 to 3 viable architectural design alternatives. For each option, document:
- Key Advantages (Pros)
- Disadvantages & Complexity (Cons)
- Residual Operational & Security Risks
- Recommendation with explicit rationale.

### 2.3 Refusal Matrix (Negative Cases)
Define the explicit set of inputs, conditions, state transitions, or requests that the system and agent MUST **Reject (Fail-Closed)**.
- *Rationale*: Forcing the creation of a Refusal Matrix ensures edge cases, security leaks, unauthorized privilege escalation, and state corruption vectors are caught prior to implementation.

### 2.4 Structural Step-by-Step Plan
Detail the execution steps in logical sequence. Require **Test-First Fixtures** and verification contracts before writing core logic.

---

## 3. Sequential Thinking & Step Validation

For complex, multi-layered, or high-risk tasks, AI Agents MUST apply **Chain of Thought + Step Validation**:

### 3.1 Problem Decomposition
Break down the task into discrete, manageable sub-steps. For each step, explicitly declare:
1. **Action & Objective**: What is being done.
2. **Rationale**: Why this specific step is required.
3. **Side Effects**: Impact on state, schemas, performance, downstream components, or external contracts.

### 3.2 Adversarial Review (Pre-Execution Audit)
Before executing the planned steps, evaluate the plan from two independent analytical perspectives:
- **Security Auditor Perspective**: Search for permission bypasses, secret leakage, unvalidated inputs, race conditions, or unhandled failure states.
- **System Architect Perspective**: Search for contract breakage, performance bottlenecks, circular dependencies, or state synchronization failures.
- **Requirement**: Identify at least 3 potential system weaknesses or failure modes and specify explicit mitigations for each.

---

## 4. Antigravity Slash Command Operating Guidance

Within the Antigravity system, agents and operators MUST leverage specialized slash commands to maintain governance control and deep alignment:

| Command | Operational Purpose & Guidance |
|---|---|
| `/grill-me` | **Interactive Requirement Clarification**: Triggers an in-depth interview by the agent to probe design choices, trade-offs, edge cases, and hidden assumptions before finalizing a plan. |
| `/goal` | **Long-Running Goal Execution**: Directs the agent to execute an end-to-end goal with autonomous verification, iterative refinement, and persistent quality checks until fully satisfied. |
| `/teamwork-preview` | **Multi-Agent Role Coordination**: Orchestrates multi-agent workflows across distinct roles (e.g., Lead Architect -> Precision Implementer -> Independent Verifier). |

---

## 5. Effective Prompt Patterns & Operational Templates

AI Agents and system operators SHOULD structure prompts using the standardized templates below:

### 5.1 Architecture & Systems Design Template
```text
คำสั่ง: ช่วยออกแบบ [ชื่อโมดูล/ระบบ] โดยอย่าเพิ่งเขียนโค้ด ให้เริ่มจากการวิเคราะห์ Domain Models, Boundary Conditions, สัญญาณ Domain Events และผลกระทบต่อ Tenant Isolation / Authority Surfaces ร่างออกมาเป็นสเปกพร้อม Diagram และ Refusal Matrix ก่อน
```

### 5.2 Complex Bug Fix & Refactoring Template
```text
คำสั่ง: อย่าเพิ่งแก้โค้ดทันที ให้สืบค้น Root Cause โดยอ่าน Error Logs และ Traceback ทั้งหมดก่อน แล้วอธิบายพฤติกรรมเดิมที่พัง vs พฤติกรรมใหม่ที่ถูกต้อง พร้อมเสนอแผนแก้ที่ไม่ส่งผลกระทบย้อนหลัง (Side-effect free) และ Refusal Matrix ของ Negative Cases
```

---

## 6. Core Directives & Governance Integrity

All AI Agents operating on SecB MUST strictly enforce three core directives:

1. **Source of Truth Binding**: Always cite and align with canonical documentation (`docs/**`, `BOPEN-*.md`, ADRs, and `MANIFEST.json`). Never invent unauthorized contracts or bypass documented boundaries.
2. **Phase Separation (Plan -> Approve -> Execute)**: Maintain clear boundary between analytical planning, human/governance authorization, and code execution.
3. **Negative Case Enforcement**: Every module, API, or state machine MUST define what it refuses before defining what it accepts.

---

## 7. Conformance & Acceptance

A SecB slice or agent interaction conforms to `SECB-GOV-SURFACE-001` when:
- First-Principles Analysis and Refusal Matrix are documented prior to code edits.
- Traceability to `docs/` architecture baselines is verified.
- Automated tests confirm zero regressions and exact check results are reported.

---

## 8. Agentic Engineering Loop Alignment (BOPEN-ENG-LOOP-001)

High-logic prompt protocols and agent team interactions align with the **[bOPEN Engineering Loop (BOPEN-ENG-LOOP-001)](../12-execution/08-bopen-engineering-loop.md)**:
- **GOAL (Bind)**: Define Work Package scope and enforce Maker ≠ Verifier role separation under `BOPEN-GOV-EBIV-001`.
- **PLAN (Specify)**: Perform First-Principles Analysis, pre-define Invariants, Trade-offs, and Refusal Matrix.
- **ACT (Build & Probe)**: Apply Smallest Coherent Change, write negative tests and mechanism probes.
- **VERIFY (Empirical Verification)**: Execute automated test suites (`node tools/validate-foundation.mjs`, `npm test`).
  - If `V ≠ Spec`, loop back to `PLAN`/`ACT` autonomously for defect remediation.
  - If `V == Spec`, record machine-anchored evidence package and emit completion notification to the Human Operator.

