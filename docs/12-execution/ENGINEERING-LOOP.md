# ENGINEERING-LOOP.md — SecB Engineering Loop Specification

This file serves as the canonical reference for the SecB Agentic Engineering Loop (**`BOPEN-ENG-LOOP-001`**) and Evidence-Based Independent Verification (**`BOPEN-GOV-EBIV-001`**).

For full details, document control, and governance specifications, see [`08-bopen-engineering-loop.md`](08-bopen-engineering-loop.md).

---

## State Machine Summary

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

1. **GOAL (Bind)**: Work package binding, Maker vs Independent Verifier role assignment.
2. **PLAN (Specify)**: First-Principles Analysis, Contract-First, Refusal Matrix.
3. **ACT (Build & Probe)**: Smallest coherent changes, negative test probing.
4. **VERIFY (Automated Verification)**: Run test suites and validators. If `V ≠ Spec`, loop back to `PLAN`/`ACT`. If `V == Spec`, proceed to `DONE`.
5. **DONE & RECORD (Record & Notify)**: Build evidence package, notify Human Operator.
