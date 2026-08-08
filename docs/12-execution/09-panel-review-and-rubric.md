# BOPEN-ENG-PANEL-001 — Panel Review & Advisory Rubric

## Document Control

| Field | Value |
|---|---|
| Artifact ID | BOPEN-ENG-PANEL-001 |
| Version | 1.0.0-draft |
| Status | DRAFT / NOT EFFECTIVE |
| Owner | SecB Engineering & Governance Authority |
| Extends | [`08-bopen-engineering-loop.md`](08-bopen-engineering-loop.md) §3.4 (VERIFY) |
| Effective when | Approved by human GOV and referenced in `AGENTS.md` |

---

## 1. Purpose

`BOPEN-ENG-LOOP-001` §3.4 says the VERIFY stage runs the automated suite. It does
not say how a change is reviewed beyond that. This document specifies the review
that accompanies the suite: three analytical lenses and one advisory rubric.

Nothing here carries authority. A lens is a way of reading a change, not a seat.

---

## 2. The three lenses

| Lens | Examines |
|---|---|
| Staff Architect | Module boundaries, API compatibility, query efficiency, extensibility |
| Security & Edge-Case | Input bounds, injection, null and boundary handling, concurrency, failure modes |
| Performance & QA | Coverage, benchmark regression, execution latency |

All three lenses are seated together. Seating them incrementally would leave a
panel advertised as three-lens while missing its security lens, which produces
false assurance — worse than declaring no panel at all.

---

## 3. Authority boundaries

Every lens declares `execution_authority: false` and `approval_authority: false`.

1. **Not a verifier seat.** [`BOPEN-GOV-EBIV-001`](08-bopen-engineering-loop.md)
   governs independent verification under Maker ≠ Verifier. A lens informs the
   Independent Verifier; it never substitutes for one.
2. **Not an identity.** Lenses hold zero entries in the agent identity register.
3. **Not an authority over ADRs.** A lens does not supersede a human ADR
   disposition.
4. **Not a quorum contribution.** A lens cannot count toward any release quorum.

---

## 4. The advisory rubric

```text
Score = 0.30 (Functional Correctness)
      + 0.25 (System Architecture & Scalability)
      + 0.20 (Security & Failure Safety)
      + 0.15 (Code Cleanliness & Documentation)
      + 0.10 (Execution Speed & Test Latency)
```

The score is recorded in the slice notes or advisory packet. **It merges nothing,
approves nothing, and activates nothing.** Bands route the agent's next action;
they do not authorize one.

| Band | Next action |
|---|---|
| ≥ 85 | Ready to propose for operator merge review; no further self-correction required |
| 60–84 | Return to PLAN/ACT for targeted correction before proposing merge |
| < 60 | Produce the advisory packet, set the slice disposition to `BLOCKED`, notify the operator — and continue preparing the candidate on the branch rather than idling, per the advise-and-proceed rule in `AGENTS.md` |

A band is never a substitute for the retained hard gates. A slice scoring 100
still does not merge itself.

---

## 5. ADR interaction

Where a lens judges that a change carries an architectural trade-off, it raises
the ADR obligation defined in
[`11-agent-capability-baseline.md`](11-agent-capability-baseline.md) §4. The lens
does not author the disposition.
