# BOPEN-ENG-LOOP-001 — bOPEN Agentic Engineering Loop & EBIV-001

## Document Control

| Field | Value |
|---|---|
| Artifact ID | BOPEN-ENG-LOOP-001 / BOPEN-GOV-EBIV-001 |
| Version | 1.0.0-draft |
| Status | DRAFT_FOR_IMPLEMENTATION_REVIEW |
| Owner | SecB Engineering & Governance Authority |
| Applies to | AI Agent Teams (Gemini, Claude, Codex, Antigravity), harnesses, automated verification pipelines, and evidence ledgers |
| Effective when | Approved by human GOV and referenced in `AGENTS.md` |

---

## 1. Overview & Doctrine

`BOPEN-ENG-LOOP-001` defines the state machine and operational lifecycle for autonomous agent engineering teams in SecB. Coupled with `BOPEN-GOV-EBIV-001` (Evidence-Based Independent Verification), it enforces rigorous quality, empirical proof of correctness, role separation (Maker ≠ Verifier), and fail-closed safety boundaries.

The core execution formula is:
```text
GOAL ➔ PLAN ➔ ACT ➔ VERIFY ➔ (ถ้า V ≠ Spec ➔ กลับไป PLAN/ACT | ถ้า V == Spec ➔ DONE & Notify Human)
```

---

## 2. Agentic Engineering Loop State Machine

```text
               ┌─────────────────────────────────────────┐
               │  GOAL / BIND                            │
               │  รับ Work Package / สเปกที่ได้รับอนุมัติ │
               └────────────────────┬────────────────────┘
                                    │
                                    ▼
               ┌─────────────────────────────────────────┐ ◄───┐
               │  PLAN / SPECIFY                         │     │
               │  ออกแบบ Invariants, Trade-offs & Contract│     │
               └────────────────────┬────────────────────┘     │
                                    │                          │
                                    ▼                          │
               ┌─────────────────────────────────────────┐     │
               │  ACT / BUILD & PROBE                    │     │
               │  เขียน Code, Negative Tests & Invariants │     │
               └────────────────────┬────────────────────┘     │
                                    │                          │
                                    ▼                          │
               ┌─────────────────────────────────────────┐     │
               │  VERIFY                                 │     │
               │  รัน Automated Suites & Independent     │     │
               │  Verifier (Maker ≠ Verifier)            │     │
               └────────────────────┬────────────────────┘     │
                                    │                          │
                    ┌───────────────┴───────────────┐          │
                    │                               │          │
             [ V == Spec ]                   [ V ≠ Spec ]      │
                    │                               │          │
                    ▼                               └──────────┘
      ┌──────────────────────────┐                    (Refuted / Defect)
      │  DONE & RECORD           │
      │  สร้าง Evidence Package  │
      │  & แจ้งเตือน Operator     │
      └──────────────────────────┘
```

---

## 3. Stages Breakdown under bOPEN Governance

### 3.1 GOAL (Bind Stage)
- **Objective**: Bind approved Work Package ID, target scope, and acceptance criteria.
- **Role Assignment**: Enforce separation of duties under EBIV-001 R1/R3. Assign distinct agent instances/roles:
  - **Maker Agent** (e.g., Lead Implementer): Responsible for designing and writing code/tests.
  - **Independent Verifier Agent** (e.g., QA / Reviewer): Responsible for evaluating conformance and evidence independently.
- **Invariant**: A single agent instance MUST NOT act as both Maker and final Independent Verifier for authority-affecting changes.

### 3.2 PLAN (Specify Stage)
- **Objective**: Design pre-implementation specifications according to the Contract-First Rule.
- **Requirements**:
  - Perform First-Principles Analysis per `SECB-GOV-SURFACE-001`.
  - Formulate non-negotiable system **Invariants**.
  - Evaluate at least 2–3 architectural **Trade-offs**.
  - Construct a **Refusal Matrix** detailing explicit negative cases and fail-closed conditions.

### 3.3 ACT (Build & Probe Stage)
- **Objective**: Implement code mutations and verification fixtures.
- **Requirements**:
  - Implement the **Smallest Coherent Change** necessary to satisfy specifications.
  - Create **Negative Tests** and mechanism probes to confirm that tests fail correctly when contracts are violated.
  - Preserve all existing API contracts and avoid unintended side effects.

### 3.4 VERIFY (Automated Empirical Verification)
- **Objective**: Validate behavior against specification through automated checks.
- **Automated Check Suite**:
  - Repository structure & foundation validation: `node tools/validate-foundation.mjs`
  - Automated test suite execution: `npm test`
  - Manifest & hash consistency checks.
- **Decision Logic**:
  - **If `V ≠ Spec` (Refuted / Test Red / Contract Mismatch)**: The loop automatically transitions back to **PLAN / ACT** for defect analysis and targeted remediation without halting for micro-approvals.
  - **If `V == Spec` (100% Pass / Admissible Evidence)**: Generate a machine-anchored Evidence Package (OID / Digest) and proceed to **DONE & RECORD**.

### 3.5 DONE & RECORD (Record Stage)
- **Objective**: Finalize slice execution and notify the Human Operator.
- **Requirements**:
  - Record execution artifacts and receipt in the Evidence Register.
  - Update repository manifests (`MANIFEST.json` & `docs/MANIFEST.json`).
  - Emit structured notification to the Human Operator detailing evidence traceability, exact check results, and next actions.

---

## 4. Balance: Autonomous Execution vs Safety Boundaries

1. **Autonomous Working (No Micro-Approval Overhead)**:
   - AI Agents operate fully autonomously within the `PLAN ➔ ACT ➔ VERIFY` loop.
   - Micro-edits, build fixes, test refinements, and self-correction steps require no per-step human interaction.

2. **Operator Authority & Fail-Closed Safety**:
   - The Human Operator holds exclusive authority over:
     - Merging branches to `main`.
     - Normative Specification Amendments.
     - Production Activation and Remote Configuration/Deployment Boundaries.
   - Any unknown identity, authority mutation, or unverified evidence fails closed.
